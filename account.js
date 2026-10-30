// Guest records keep their original keys. Each account gets a separate local cache.
class DicedleStorage {
  constructor(storageProvider, userId = null) {
    this.storageProvider = storageProvider;
    this.userId = userId;
  }

  get namespace() { return this.userId ? `dicedle.account.${this.userId}.` : ""; }
  ownsKey(key) {
    if (typeof key !== "string" || !key.startsWith(this.namespace)) return false;
    const local = key.slice(this.namespace.length);
    return local === "dicedle.dailyRun.v1" || local.startsWith("dicedle.history.v1.daily.")
      || local.startsWith("dicedle.achievements.v1.");
  }
  keys() {
    const storage = this.storageProvider();
    return Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(key => this.ownsKey(key)).map(key => key.slice(this.namespace.length));
  }
  get length() { return this.keys().length; }
  key(index) { return this.keys()[index] ?? null; }
  getItem(key) { return this.storageProvider().getItem(this.namespace + key); }
  setItem(key, value) { this.storageProvider().setItem(this.namespace + key, value); }
}

class DicedleAccounts extends EventTarget {
  constructor(config = {}) {
    super();
    this.config = config;
    this.configured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
    this.storage = new DicedleStorage(() => window.localStorage);
    this.user = null;
    this.username = null;
    this.authMode = "signin";
    this.recoveryPending = /(?:^|[&#])type=recovery(?:&|$)/.test(location.hash);
    this.signupPending = false;
    this.client = null;
    this.busy = this.configured;
    this.initialized = false;
    this.revision = 0;
    this.refreshing = null;
    this.returningFromLogin = /access_token=|error_description=/.test(location.hash);
    this.message = this.configured ? "Connecting your account..." : "Accounts are not available yet. You can keep playing as a guest.";
  }

  changed() {
    this.render();
    this.dispatchEvent(new Event("change"));
  }

  render() {
    const signedIn = Boolean(this.user);
    document.querySelector("#account-button").classList.toggle("is-signed-in", signedIn);
    document.querySelector("#account-button").setAttribute("aria-label", signedIn ? "Manage your account" : "Sign in or create an account");
    document.querySelector("#account-title").textContent = signedIn ? "Your account." : ({
      signin: "Welcome back.", signup: "Create account.", reset: "Reset your password.",
      link: "Sign in by email.", confirm: "Confirm your email.",
    })[this.authMode];
    document.querySelector("#account-username-display").textContent = this.username ? `@${this.username}` : "Choose your username";
    document.querySelector("#account-email-display").textContent = this.user?.email || "";
    document.querySelector("#account-guest").hidden = signedIn;
    document.querySelector("#account-member").hidden = !signedIn;
    document.querySelector("#account-status").textContent = this.message;
    const signup = this.authMode === "signup";
    const usesPassword = signup || this.authMode === "signin";
    document.querySelector("#account-username-field").hidden = !signup;
    document.querySelector("#account-password-field").hidden = !usesPassword;
    document.querySelector("#account-confirm-field").hidden = !signup;
    document.querySelector("#account-username").disabled = !signup || this.busy;
    document.querySelector("#account-password").disabled = !usesPassword || this.busy;
    document.querySelector("#account-confirm-password").disabled = !signup || this.busy;
    document.querySelector("#account-password").minLength = signup ? 8 : 1;
    document.querySelector("#account-password").autocomplete = signup ? "new-password" : "current-password";
    document.querySelector('label[for="account-password"]').textContent = signup ? "Password (at least 8 characters)" : "Password";
    document.querySelector("#account-email").disabled = this.busy;
    document.querySelector("#account-send").textContent = ({ signin: "Sign in", signup: "Create account", reset: "Send password reset email", link: "Email me a sign-in link", confirm: "Resend confirmation email" })[this.authMode];
    document.querySelector("#account-form-intro").textContent = ({
      signin: "Sign in with your email and password. Your username appears on your profile.",
      signup: "Choose your username and password. Confirm your email to finish creating your account.",
      reset: "Enter your account email. We'll send a link to choose a new password.",
      link: "Sign in to an existing account by email. You can then set a username and password.",
      confirm: "Enter your account email to request another confirmation link.",
    })[this.authMode];
    document.querySelectorAll("[data-auth-mode]").forEach(button => {
      button.disabled = this.busy;
      if (button.closest(".account-tabs")) button.setAttribute("aria-pressed", String(button.dataset.authMode === this.authMode));
    });
    document.querySelector("#account-send").disabled = !this.client || this.busy;
    document.querySelectorAll("#account-member button, #account-member input").forEach(element => { element.disabled = this.busy; });
    document.querySelector("#account-password-intro").textContent = this.recoveryPending ? "Choose a new password to finish resetting your account." : "Set or change your password.";
    document.querySelector("#account-username-summary").textContent = this.username ? "Change username" : "Choose a username";
    if (this.recoveryPending) document.querySelector("#account-password-settings").open = true;
    document.querySelector("#profile-account-action").textContent = signedIn ? "Manage account" : "Sign in / sign up";
    document.querySelector("#profile-account-copy").textContent = signedIn
      ? `Signed in as ${this.username ? `@${this.username}` : this.user.email}. Your scores sync across devices.`
      : "Play as a guest and save your scores locally, or sign in to keep them across multiple devices.";
    document.querySelector("#profile-account-status").textContent = signedIn ? this.message : "";
    document.querySelector("#profile-account-status").hidden = !signedIn || !this.message;
    document.querySelector("#profile-save-badge").textContent = signedIn ? "SAVED TO ACCOUNT" : "SAVED LOCALLY";
    document.querySelector("#profile-storage-note").textContent = signedIn
      ? "Your daily records are saved to your account, with a separate copy on this device."
      : "Your daily records are saved in this browser, ready when you return.";
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    document.querySelectorAll("[data-open-account]").forEach(button => button.addEventListener("click", () => this.open()));
    document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => this.setMode(button.dataset.authMode)));
    document.querySelector("#account-form").addEventListener("submit", event => { event.preventDefault(); this.submitAuth(); });
    document.querySelector("#account-username-form").addEventListener("submit", event => { event.preventDefault(); this.saveUsername(); });
    document.querySelector("#account-password-form").addEventListener("submit", event => { event.preventDefault(); this.savePassword(); });
    document.querySelectorAll('#account-modal input[type="password"]').forEach(input => input.addEventListener("input", () => {
      input.setCustomValidity("");
      document.querySelector("#account-confirm-password").setCustomValidity("");
      document.querySelector("#account-new-password-confirm").setCustomValidity("");
    }));
    document.querySelector("#account-modal").addEventListener("close", () => this.clearPasswords());
    document.querySelector("#account-sign-out").addEventListener("click", () => this.signOut());
    document.querySelector("#account-sync").addEventListener("click", () => this.refresh());
    document.querySelector("#account-import").addEventListener("click", () => this.importGuest());
    this.render();
  }

  open() {
    const modal = document.querySelector("#account-modal");
    document.querySelectorAll("dialog[open]").forEach(dialog => { if (dialog !== modal) dialog.close(); });
    this.render();
    if (!modal.open) modal.showModal();
    document.body.classList.add("has-open-modal");
  }

  clearPasswords() {
    document.querySelectorAll('#account-modal input[type="password"]').forEach(input => { input.value = ""; input.setCustomValidity(""); });
  }

  setMode(mode) {
    if (this.busy || !["signin", "signup", "reset", "link", "confirm"].includes(mode)) return;
    this.authMode = mode;
    this.clearPasswords();
    if (this.client) this.message = "Your scores stay with your account. Guest play is always available.";
    this.render();
  }

  redirectUrl() { return `${location.origin}${location.pathname}#profile`; }

  async loadClient() {
    if (!window.supabase?.createClient) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
        const timeout = setTimeout(() => reject(new Error("Account connection timed out")), 15000);
        script.onload = () => { clearTimeout(timeout); resolve(); };
        script.onerror = () => { clearTimeout(timeout); reject(new Error("Account connection unavailable")); };
        document.head.append(script);
      });
    }
    return window.supabase.createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(15000) }) },
    });
  }

  async start() {
    this.bind();
    if (!this.configured) { this.initialized = true; this.changed(); return; }
    if (!["http:", "https:"].includes(location.protocol)) {
      this.message = "Open Dicedle from its website address to sign in. Guest play is still available here.";
      this.busy = false;
      this.changed();
      return;
    }
    try {
      this.client = await this.loadClient();
      // Defer work: Supabase auth callbacks must not await other auth requests.
      this.client.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && this.signupPending) return;
        setTimeout(() => this.useSession(session, event), 0);
      });
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      await this.useSession(data.session);
    } catch {
      this.busy = false;
      this.message = "Accounts could not connect. Reload to try again, or keep playing as a guest.";
      this.changed();
    }
  }

  async useSession(session, event = "") {
    const nextUser = session?.user || null;
    if (event === "PASSWORD_RECOVERY") this.recoveryPending = true;
    if (this.initialized && nextUser?.id === this.user?.id) {
      this.user = nextUser;
      this.render();
      if (nextUser && this.recoveryPending) this.open();
      return;
    }
    this.initialized = true;
    this.revision += 1;
    this.user = nextUser;
    this.username = null;
    document.querySelector("#account-edit-username").value = "";
    document.querySelector("#account-username-settings").open = false;
    document.querySelector("#account-password-settings").open = false;
    this.clearPasswords();
    if (!nextUser) this.recoveryPending = false;
    this.storage.userId = nextUser?.id || null;
    this.refreshing = null;
    this.busy = Boolean(nextUser);
    this.message = nextUser ? "Loading your saved scores..." : "Guest play. Sign in with your email and password to save across devices.";
    this.changed();
    if (nextUser && this.returningFromLogin) {
      this.returningFromLogin = false;
      const url = new URL(location.href);
      url.hash = "profile";
      history.replaceState(null, "", url);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    if (nextUser) await this.refresh();
    if (nextUser && this.recoveryPending) this.open();
  }

  async submitAuth() {
    const form = document.querySelector("#account-form");
    if (!this.client || this.busy) return;
    const mode = this.authMode;
    const email = document.querySelector("#account-email").value.trim();
    const password = document.querySelector("#account-password").value;
    document.querySelector("#account-password").setCustomValidity(mode === "signup" && password.length < 8 ? "Use at least 8 characters." : "");
    const confirmation = document.querySelector("#account-confirm-password");
    confirmation.setCustomValidity(mode === "signup" && password !== confirmation.value ? "Passwords must match." : "");
    if (!form.reportValidity()) return;
    const revision = this.revision;
    this.busy = true;
    this.signupPending = mode === "signup";
    this.message = mode === "signin" ? "Signing in..." : mode === "signup" ? "Creating your account..." : "Sending your email...";
    this.render();
    try {
      if (mode === "signin") {
        const { data, error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (revision === this.revision) await this.useSession(data.session);
      } else if (mode === "signup") {
        const username = document.querySelector("#account-username").value.trim();
        const available = await this.client.rpc("dicedle_username_available", { p_username: username });
        if (available.error) throw available.error;
        if (!available.data) { this.message = "That username is already taken. Please choose another."; return; }
        const { data, error } = await this.client.auth.signUp({ email, password,
          options: { data: { username }, emailRedirectTo: this.redirectUrl() },
        });
        if (error) throw error;
        if (revision !== this.revision) return;
        if (data.session) {
          // Confirmation must stay enabled in Supabase. Do not accept an
          // automatically signed-in signup if that setting was turned off.
          await this.client.auth.signOut({ scope: "local" });
          this.message = "Account setup needs email confirmation enabled. Please contact the site owner.";
        } else {
          this.message = "Check your email to confirm your account before signing in. If you already have an account, sign in or reset your password.";
          this.authMode = "signin";
        }
      } else {
        const request = mode === "reset"
          ? this.client.auth.resetPasswordForEmail(email, { redirectTo: this.redirectUrl() })
          : mode === "confirm"
            ? this.client.auth.resend({ type: "signup", email, options: { emailRedirectTo: this.redirectUrl() } })
            : this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: this.redirectUrl() } });
        const { error } = await request;
        if (error) throw error;
        if (revision !== this.revision) return;
        this.message = mode === "reset"
          ? "If an account exists for that email, a password reset link is on its way. Open it to choose a new password."
          : mode === "confirm" ? "If that account needs confirmation, a confirmation email is on its way."
            : "If an account exists for that email, a sign-in link is on its way. Open it to sign in.";
      }
    } catch (error) {
      if (revision !== this.revision) return;
      if (error.code === "email_not_confirmed") {
        this.message = "Confirm your email before signing in. You can request another confirmation email below.";
      } else if (error.code === "invalid_credentials") {
        this.message = "Email or password incorrect. Try again, or reset your password.";
      } else if (error.code === "weak_password") {
        this.message = "Choose a stronger password with at least 8 characters.";
      } else {
        this.message = error.status === 429 ? "Too many attempts. Please wait a little before trying again."
          : mode === "signin" ? "Sign-in could not finish. Check your email and password, then try again."
            : "Your request could not finish. Please try again shortly.";
      }
    } finally {
      this.signupPending = false;
      this.clearPasswords();
      if (revision === this.revision) { this.busy = false; this.render(); }
    }
  }

  async saveUsername() {
    if (!this.user || this.busy || !document.querySelector("#account-username-form").reportValidity()) return;
    const revision = this.revision;
    this.busy = true;
    this.render();
    try {
      const { data, error } = await this.client.rpc("set_dicedle_username", {
        p_username: document.querySelector("#account-edit-username").value.trim(), p_expected_user: this.user.id,
      });
      if (error) throw error;
      if (revision !== this.revision) return;
      this.username = data;
      document.querySelector("#account-edit-username").value = data;
      this.message = "Your username is saved.";
    } catch (error) {
      if (revision === this.revision) this.message = error.code === "23505" ? "That username is already taken. Please choose another." : "Your username could not be saved. Please try again.";
    } finally { if (revision === this.revision) { this.busy = false; this.render(); } }
  }

  async savePassword() {
    if (!this.user || this.busy) return;
    const password = document.querySelector("#account-new-password").value;
    document.querySelector("#account-new-password").setCustomValidity(password.length < 8 ? "Use at least 8 characters." : "");
    const confirmation = document.querySelector("#account-new-password-confirm");
    confirmation.setCustomValidity(password !== confirmation.value ? "Passwords must match." : "");
    if (!document.querySelector("#account-password-form").reportValidity()) return;
    const revision = this.revision;
    this.busy = true;
    this.render();
    try {
      const { data, error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
      if (revision !== this.revision) return;
      this.user = data.user;
      this.recoveryPending = false;
      this.message = "Your password is saved. You can now sign in with your email and password.";
    } catch (error) {
      if (revision === this.revision) this.message = error.code === "reauthentication_needed"
        ? "Sign in again with a fresh email link, then retry changing your password."
        : "Your password could not be saved. Use at least 8 characters, or request a fresh password reset link.";
    } finally {
      this.clearPasswords();
      if (revision === this.revision) { this.busy = false; this.render(); }
    }
  }

  async signOut() {
    if (!this.client || this.busy) return;
    const revision = this.revision;
    this.busy = true;
    this.render();
    try {
      const { error } = await this.client.auth.signOut({ scope: "local" });
      if (error) throw error;
      if (revision === this.revision) await this.useSession(null);
    } catch {
      if (revision !== this.revision) return;
      this.message = "Sign-out could not finish. Please try again.";
      this.busy = false;
      this.render();
    }
  }

  applyRow(row) {
    const history = new DicedleHistory(() => this.storage);
    const today = this.today();
    if (row.run && history.validRun(row.run)) {
      if (row.run.date === today) this.storage.setItem(history.runKey, JSON.stringify(row.run));
      history.remember(row.run, today);
    } else if (history.validRecord(row.record)) {
      this.storage.setItem(history.prefix + row.record.id, JSON.stringify(row.record));
    }
  }

  today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  async refresh() {
    if (!this.user || !this.client) return;
    if (this.refreshing) return this.refreshing;
    const revision = this.revision;
    const userId = this.user.id;
    this.busy = true;
    this.message = "Syncing your scores...";
    this.changed();
    const operation = (async () => {
      try {
        let offset = 0;
        const rows = [];
        while (true) {
          const { data, error } = await this.client.from("dicedle_runs").select("run_date,run,record")
            .eq("user_id", userId).order("run_date").range(offset, offset + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) break;
          offset += 500;
        }
        if (revision !== this.revision) return;
        rows.forEach(row => this.applyRow(row));
        const profile = await this.client.from("dicedle_profiles").select("username").eq("user_id", userId).maybeSingle();
        if (revision !== this.revision) return;
        if (!profile.error) {
          const input = document.querySelector("#account-edit-username");
          if (!input.value || input.value === this.username) input.value = profile.data?.username || "";
          this.username = profile.data?.username || null;
          if (!this.username && !this.recoveryPending) document.querySelector("#account-username-settings").open = true;
        }
        this.message = this.recoveryPending ? "Choose a new password below to finish resetting your account."
          : profile.error ? "Your scores are up to date. Username settings are temporarily unavailable."
            : this.username ? "Your scores are up to date." : "Your scores are up to date. Choose your username in account settings.";
      } catch {
        if (revision !== this.revision) return;
        this.message = "Your saved copy is available here. Reconnect and sync before rolling to save your next roll.";
      } finally {
        if (revision === this.revision) { this.busy = false; this.refreshing = null; this.changed(); }
      }
    })();
    this.refreshing = operation;
    return operation;
  }

  async saveRun(run, record = null, importing = false) {
    const revision = this.revision;
    const { data, error } = await this.client.rpc("save_dicedle_run", {
      p_day: run?.date || record.date, p_run: run, p_record: record, p_import: importing,
      p_expected_user: this.user.id,
    });
    if (error) throw error;
    if (revision !== this.revision) throw new Error("Account changed");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("No saved run returned");
    this.applyRow(row);
    this.message = "Your scores are up to date.";
    this.render();
    return row.run;
  }

  async importGuest() {
    if (!this.user || this.busy) return;
    const revision = this.revision;
    this.busy = true;
    this.message = "Saving this device's guest scores to your account...";
    this.changed();
    try {
      const guest = new DicedleHistory(() => new DicedleStorage(() => window.localStorage));
      guest.captureSavedRun(this.today());
      const current = guest.currentRun();
      for (const record of guest.records()) {
        if (revision !== this.revision) return;
        if (record.date !== current?.date) await this.saveRun(null, record, true);
      }
      if (current?.rolls.length && current.date <= this.today()) await this.saveRun(current, null, true);
      if (revision === this.revision) this.message = "This device's guest scores are saved. Existing account runs were kept if the same day was already saved.";
    } catch {
      if (revision === this.revision) this.message = "Some guest scores could not be saved. Your originals are still on this device; try again when connected.";
    } finally {
      if (revision === this.revision) { this.busy = false; this.changed(); }
    }
  }
}
