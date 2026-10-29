// Run in an isolated browser profile with index.html open. The harness uses an
// in-memory PostgreSQL instance and a fake Auth transport; it sends no emails.
// The PowerShell/CDP check passes the schema and SQL checks as strings.
window.runDicedleAccountChecks = async function (schema, sqlChecks, usernameChecks = "") {
  const { PGlite } = await import("https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.3.14/dist/index.js");
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(schema);
  await db.exec(schema); // Schema setup is repeatable.
  await db.exec(sqlChecks);
  if (usernameChecks) await db.exec(usernameChecks);
  const passed = ["PostgreSQL schema, RLS isolation, permissions, and conflict checks"];
  const assert = (condition, description) => {
    if (!condition) throw new Error(description);
    passed.push(description);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const text = selector => document.querySelector(selector).textContent;
  const a = { id: "dd000000-0000-4000-8000-000000000001", email: "player-a@example.invalid" };
  const b = { id: "dd000000-0000-4000-8000-000000000002", email: "player-b@example.invalid" };
  await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now())", [a.id, a.email, b.id, b.email]);
  let offline = false;
  let sessionUser = null;
  let lastEmailRequest = null;
  let lastSignup = null;
  let lastReset = null;
  let confirmationResent = false;
  let signupCalls = 0;
  let updateCalls = 0;
  let authError = null;
  const credentials = new Map();
  let failAfterCommit = false;
  let pauseQuery = null;
  const asUser = async callback => db.transaction(async tx => {
    if (offline) throw new Error("Offline");
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [sessionUser?.id || ""]);
    return callback(tx);
  });
  const client = {
    auth: {
      async signInWithOtp(request) { lastEmailRequest = request; return { error: null }; },
      async signOut() { sessionUser = null; return { error: null }; },
      async signUp(request) {
        signupCalls += 1;
        lastSignup = request;
        const user = { id: "dd000000-0000-4000-8000-000000000003", email: request.email };
        try {
          await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)", [user.id,user.email,request.options.data]);
          credentials.set(user.email, { user, password: request.password, confirmed: false });
          return { data: { user, session: null }, error: null };
        } catch (error) { return { data: {}, error }; }
      },
      async signInWithPassword({ email, password }) {
        if (authError) return { data: {}, error: authError };
        const account = credentials.get(email);
        if (!account || account.password !== password) return { data: {}, error: { code: "invalid_credentials" } };
        if (!account.confirmed) return { data: {}, error: { code: "email_not_confirmed" } };
        sessionUser = account.user;
        return { data: { session: { user: sessionUser } }, error: null };
      },
      async resetPasswordForEmail(email, options) { lastReset = { email, options }; return { error: null }; },
      async resend() { confirmationResent = true; return { error: null }; },
      async updateUser({ password }) {
        updateCalls += 1;
        if (!sessionUser) return { data: {}, error: { code: "session_not_found" } };
        credentials.set(sessionUser.email, { user: sessionUser, password, confirmed: true });
        return { data: { user: sessionUser }, error: null };
      },
    },
    from(table) {
      if (!["dicedle_runs", "dicedle_profiles"].includes(table)) throw new Error("Unexpected table");
      let owner;
      const query = {
        select() { return query; },
        eq(column, value) { if (column !== "user_id") throw new Error("Missing owner filter"); owner = value; return query; },
        order() { return query; },
        async maybeSingle() {
          try {
            const result = await asUser(tx => tx.query("select username from public.dicedle_profiles where user_id=$1", [owner]));
            return { data: result.rows[0] || null, error: null };
          } catch (error) { return { data: null, error }; }
        },
        async range(first, last) {
          try {
            if (pauseQuery) await pauseQuery;
            const result = await asUser(tx => tx.query("select run_date::text,run,record from public.dicedle_runs where user_id=$1 order by run_date offset $2 limit $3", [owner, first, last - first + 1]));
            return { data: result.rows, error: null };
          } catch (error) { return { data: null, error }; }
        },
      };
      return query;
    },
    async rpc(name, parameters) {
      try {
        if (name === "dicedle_username_available") {
          const result = await db.query("select public.dicedle_username_available($1) as available", [parameters.p_username]);
          return { data: result.rows[0].available, error: null };
        }
        if (name === "set_dicedle_username") {
          const result = await asUser(tx => tx.query("select public.set_dicedle_username($1,$2::uuid) as username", [parameters.p_username,parameters.p_expected_user]));
          return { data: result.rows[0].username, error: null };
        }
        if (name !== "save_dicedle_run") throw new Error("Unexpected RPC");
        const { p_day, p_run, p_record, p_import, p_expected_user } = parameters;
        const result = await asUser(tx => tx.query("select public.save_dicedle_run($1::date,$2::jsonb,$3::jsonb,$4::boolean,$5::uuid) as saved", [p_day, p_run, p_record, p_import, p_expected_user]));
        if (failAfterCommit) { failAfterCommit = false; throw new Error("Response lost after commit"); }
        return { data: result.rows[0].saved, error: null };
      } catch (error) { return { data: null, error }; }
    },
  };

  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  const guest = new DicedleHistory(() => accounts.storage);
  const today = localDateKey();
  const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate);
  accounts.storage.setItem(storageKey, JSON.stringify({ date: today, rolls: [[2,3]] }));
  guest.remember({ date: yesterday, rolls: [[6,6],[3,4]] }, today);
  syncDailyRun();
  assert(text("#score") === "5" && text("#play-best-score") === "19", "Guest scores still work without an account");
  const originalGuestRun = localStorage.getItem(storageKey);

  accounts.client = client;
  accounts.busy = false;
  accounts.render();
  accounts.setMode("signup");
  const signupPassword = "Dice719!";
  document.querySelector("#account-username").value = "Lucky_Player";
  document.querySelector("#account-email").value = "new-player@example.invalid";
  document.querySelector("#account-password").value = signupPassword;
  document.querySelector("#account-confirm-password").value = "Different-Passphrase-719!";
  await accounts.submitAuth();
  assert(signupCalls === 0, "Mismatched signup passwords never reach Auth");
  document.querySelector("#account-password").value = "seven77";
  document.querySelector("#account-confirm-password").value = "seven77";
  await accounts.submitAuth();
  assert(signupCalls === 0, "Short signup passwords never reach Auth");
  document.querySelector("#account-password").value = signupPassword;
  document.querySelector("#account-confirm-password").value = signupPassword;
  await accounts.submitAuth();
  assert(signupCalls === 1 && lastSignup.options.data.username === "Lucky_Player", "Signup sends username, email, and password to Auth");
  assert(!accounts.user && accounts.message.includes("confirm your account"), "Signup waits for email confirmation without signing in");
  assert(lastSignup.options.emailRedirectTo.endsWith("#profile"), "Confirmation link returns to the existing allowed profile URL");
  assert(document.querySelector("#account-password").value === "", "Signup clears password inputs after submission");
  document.querySelector("#account-password").value = signupPassword;
  await accounts.submitAuth();
  assert(!accounts.user && accounts.message.includes("Confirm your email"), "Unconfirmed email cannot sign in with a password");
  accounts.setMode("confirm");
  await accounts.submitAuth();
  assert(confirmationResent, "Players can resend their signup confirmation");
  accounts.setMode("signup");
  document.querySelector("#account-username").value = "lucky_player";
  document.querySelector("#account-password").value = signupPassword;
  document.querySelector("#account-confirm-password").value = signupPassword;
  await accounts.submitAuth();
  assert(signupCalls === 1 && accounts.message.includes("already taken"), "Case-insensitive duplicate username stops signup");
  const nativeSignup = client.auth.signUp;
  client.auth.signUp = async () => ({ data: { session: { user: a } }, error: null });
  document.querySelector("#account-username").value = "Confirmation_Guard";
  document.querySelector("#account-password").value = signupPassword;
  document.querySelector("#account-confirm-password").value = signupPassword;
  await accounts.submitAuth();
  assert(!accounts.user && accounts.message.includes("confirmation enabled"), "Signup rejects an automatically signed-in session if confirmation is disabled");
  client.auth.signUp = nativeSignup;
  accounts.setMode("signin");
  const newAccount = credentials.get("new-player@example.invalid");
  newAccount.confirmed = true;
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [newAccount.user.id]);
  document.querySelector("#account-password").value = "Wrong-Password-719!";
  await accounts.submitAuth();
  assert(!accounts.user && accounts.message.includes("incorrect"), "Incorrect password shows a generic sign-in error");
  document.querySelector("#account-password").value = signupPassword;
  await accounts.submitAuth();
  assert(accounts.user?.id === newAccount.user.id && accounts.username === "Lucky_Player", "Confirmed account signs in and loads its username");
  assert(text("#profile-account-copy").includes("@Lucky_Player"), "Profile displays the saved username");
  await accounts.signOut();
  accounts.setMode("reset");
  await accounts.submitAuth();
  assert(lastReset.email === newAccount.user.email && lastReset.options.redirectTo.endsWith("#profile"), "Forgot-password email uses the existing allowed redirect");
  sessionUser = newAccount.user;
  await accounts.useSession({ user: sessionUser }, "PASSWORD_RECOVERY");
  assert(accounts.recoveryPending && document.querySelector("#account-modal").open, "Password recovery opens account settings automatically");
  const replacement = "Roll820!";
  document.querySelector("#account-password-settings").open = true;
  document.querySelector("#account-new-password").value = replacement;
  document.querySelector("#account-new-password-confirm").value = "Mismatch-Passphrase-719!";
  await accounts.savePassword();
  assert(updateCalls === 0, "Mismatched reset passwords never reach Auth");
  document.querySelector("#account-new-password").value = "seven77";
  document.querySelector("#account-new-password-confirm").value = "seven77";
  await accounts.savePassword();
  assert(updateCalls === 0, "Short reset passwords never reach Auth");
  document.querySelector("#account-new-password").value = replacement;
  document.querySelector("#account-new-password-confirm").value = replacement;
  await accounts.savePassword();
  assert(updateCalls === 1 && !accounts.recoveryPending && accounts.message.includes("password is saved"), "Recovery saves the new password");
  assert(document.querySelector("#account-new-password").value === "", "Password update clears sensitive inputs");
  await accounts.signOut();
  document.querySelector("#account-modal").close();
  accounts.setMode("signin");
  document.querySelector("#account-email").value = newAccount.user.email;
  document.querySelector("#account-password").value = replacement;
  await accounts.submitAuth();
  assert(accounts.user?.id === newAccount.user.id, "New password works after reset and sign-out");
  await accounts.signOut();
  const storedValues = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i))).join(" ");
  assert(!storedValues.includes(signupPassword) && !storedValues.includes(replacement), "Plaintext passwords are absent from browser storage");

  accounts.setMode("link");
  document.querySelector("#account-email").value = a.email;
  await accounts.submitAuth();
  assert(lastEmailRequest.email === a.email && !lastEmailRequest.options.shouldCreateUser, "Existing players keep email-link access without bypassing username signup");
  assert(lastEmailRequest.options.emailRedirectTo.endsWith("#profile"), "Legacy email sign-in returns to the profile");
  sessionUser = a;
  await accounts.useSession({ user: a });
  assert(text("#score") === "0" && text("#profile-best-score") === "—", "Signing in does not silently import guest scores");
  assert(accounts.storage.namespace.includes(a.id), "Account cache has its own namespace");
  document.querySelector("#account-edit-username").value = "Veteran_Player";
  await accounts.saveUsername();
  assert(accounts.username === "Veteran_Player", "Existing email-link account can choose a username");
  const legacyPassword = "Lucky91!";
  document.querySelector("#account-password-settings").open = true;
  document.querySelector("#account-new-password").value = legacyPassword;
  document.querySelector("#account-new-password-confirm").value = legacyPassword;
  await accounts.savePassword();
  assert(credentials.get(a.email)?.password === legacyPassword, "Existing account can add password sign-in");
  await accounts.importGuest();
  assert(text("#score") === "5" && text("#play-best-score") === "19", "Explicit guest import saves current run and history");
  await accounts.importGuest();
  assert(text("#profile-runs-played") === "2", "Repeated guest imports do not duplicate runs");
  assert(localStorage.getItem(storageKey) === originalGuestRun, "Import preserves the original guest run");

  const originalRandom = Math.random;
  try {
    let draws = [.95,.95,.2]; Math.random = () => draws.shift();
    await roll(); await wait(750);
    assert(text("#score") === "17" && text("#roll-count") === "2", "Account rolls save through PostgreSQL before displaying");
    draws = [.4,.6,.2]; Math.random = () => draws.shift();
    await roll(); await wait(750);
    assert(text("#score") === "24" && !dailyStatus.hidden, "Account bust adds seven and shows next-run timer");
    await roll();
    assert(text("#score") === "24" && text("#roll-count") === "3", "Busted account cannot roll again");
  } finally { Math.random = originalRandom; }

  // Clear only A's local copy, as on a fresh device, then restore from the DB.
  for (const key of accounts.storage.keys()) localStorage.removeItem(accounts.storage.namespace + key);
  await accounts.refresh();
  assert(text("#score") === "24" && text("#play-best-score") === "24" && !dailyStatus.hidden, "Fresh-device sync restores score, best, and busted state");
  await accounts.signOut();
  assert(text("#score") === "5" && accounts.user === null, "Sign-out restores guest progress");

  sessionUser = b;
  await accounts.useSession({ user: b });
  assert(text("#score") === "0" && text("#play-best-score") === "0", "A different account sees none of the first account's scores");
  document.querySelector("#account-edit-username").value = "veteran_player";
  await accounts.saveUsername();
  assert(accounts.username === null && accounts.message.includes("already taken"), "Duplicate username errors do not change an existing profile");
  offline = true;
  await roll();
  assert(!accounts.storage.getItem(storageKey) && text("#score") === "0", "Offline account roll does not consume a local or server roll");
  offline = false;
  await accounts.refresh();
  failAfterCommit = true;
  const original = Math.random;
  try {
    const draws = [.95,.95,.2]; Math.random = () => draws.shift();
    await roll();
  } finally { Math.random = original; }
  await accounts.refresh();
  assert(text("#score") === "12" && text("#roll-count") === "1", "Lost save response is recovered without rerolling");

  // A stale device attempts a different first roll; SQL returns canonical dice.
  const saved = await accounts.saveRun({ date: today, rolls: [[1,1]] });
  assert(JSON.stringify(saved.rolls) === "[[6,6]]", "Stale device receives canonical server dice");

  // Delay B's read while switching to A; B's response must not contaminate A.
  let release;
  pauseQuery = new Promise(resolve => { release = resolve; });
  const staleRefresh = accounts.refresh();
  await wait(20);
  sessionUser = a;
  const switching = accounts.useSession({ user: a });
  pauseQuery = null;
  release();
  await Promise.all([staleRefresh, switching]);
  assert(text("#score") === "24" && accounts.storage.userId === a.id, "Late response from an old account cannot overwrite the new account cache");

  // Verify there is no clipping on the most crowded account UI.
  document.querySelector("#account-button").click();
  assert(document.querySelector("#account-modal").open && !document.querySelector("#account-member").hidden, "Account controls open the signed-in dialog");
  return { passed, count: passed.length, database: "PostgreSQL via PGlite; Supabase Auth transport mocked" };
};
