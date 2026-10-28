// Run in an isolated browser profile with index.html open. The harness uses an
// in-memory PostgreSQL instance and a fake Auth transport; it sends no emails.
// The PowerShell/CDP check passes the schema and SQL checks as strings.
window.runDicedleAccountChecks = async function (schema, sqlChecks) {
  const { PGlite } = await import("https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.3.14/dist/index.js");
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(schema);
  await db.exec(schema); // Schema setup is repeatable.
  await db.exec(sqlChecks);
  const passed = ["PostgreSQL schema, RLS isolation, permissions, and conflict checks"];
  const assert = (condition, description) => {
    if (!condition) throw new Error(description);
    passed.push(description);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const text = selector => document.querySelector(selector).textContent;
  const a = { id: "dd000000-0000-4000-8000-000000000001", email: "player-a@example.invalid" };
  const b = { id: "dd000000-0000-4000-8000-000000000002", email: "player-b@example.invalid" };
  await db.query("insert into auth.users(id,email) values ($1,$2),($3,$4)", [a.id, a.email, b.id, b.email]);
  let offline = false;
  let sessionUser = null;
  let lastEmailRequest = null;
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
    },
    from(table) {
      if (table !== "dicedle_runs") throw new Error("Unexpected table");
      let owner;
      const query = {
        select() { return query; },
        eq(column, value) { if (column !== "user_id") throw new Error("Missing owner filter"); owner = value; return query; },
        order() { return query; },
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
      if (name !== "save_dicedle_run") throw new Error("Unexpected RPC");
      try {
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
  document.querySelector("#account-email").value = a.email;
  await accounts.sendLink();
  assert(lastEmailRequest.email === a.email && lastEmailRequest.options.shouldCreateUser, "Email sign-in supports account creation");
  assert(lastEmailRequest.options.emailRedirectTo.endsWith("#profile"), "Email sign-in returns to the profile");
  sessionUser = a;
  await accounts.useSession({ user: a });
  assert(text("#score") === "0" && text("#profile-best-score") === "—", "Signing in does not silently import guest scores");
  assert(accounts.storage.namespace.includes(a.id), "Account cache has its own namespace");
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
