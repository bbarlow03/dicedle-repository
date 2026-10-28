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
    return local === "dicedle.dailyRun.v1" || local.startsWith("dicedle.history.v1.daily.");
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
    document.querySelector("#account-title").textContent = signedIn ? "Your account." : "Keep your lucky rolls.";
    document.querySelector("#account-email-display").textContent = this.user?.email || "";
    document.querySelector("#account-guest").hidden = signedIn;
    document.querySelector("#account-member").hidden = !signedIn;
    document.querySelector("#account-status").textContent = this.message;
    document.querySelector("#account-send").disabled = !this.client || this.busy;
    document.querySelectorAll("#account-member button").forEach(button => { button.disabled = this.busy; });
    document.querySelector("#profile-account-action").textContent = signedIn ? "Manage account" : "Sign in / create account";
    document.querySelector("#profile-account-copy").textContent = signedIn
      ? `Signed in as ${this.user.email}. Your runs are saved to your account.`
      : "Play as a guest, or sign in with your email to keep your scores across devices.";
    document.querySelector("#profile-account-status").textContent = signedIn ? this.message : "Guest scores stay in this browser.";
    document.querySelector("#profile-save-badge").textContent = signedIn ? "SAVED TO YOUR ACCOUNT" : "SAVED ON THIS DEVICE";
    document.querySelector("#profile-storage-note").textContent = signedIn
      ? "Your daily records are saved to your account, with a separate copy on this device."
      : "Your daily records are saved in this browser, ready when you return.";
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    const modal = document.querySelector("#account-modal");
    const show = () => {
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
      this.render();
      modal.showModal();
      document.body.classList.add("has-open-modal");
    };
    document.querySelectorAll("[data-open-account]").forEach(button => button.addEventListener("click", show));
    document.querySelector("#account-form").addEventListener("submit", event => { event.preventDefault(); this.sendLink(); });
    document.querySelector("#account-sign-out").addEventListener("click", () => this.signOut());
    document.querySelector("#account-sync").addEventListener("click", () => this.refresh());
    document.querySelector("#account-import").addEventListener("click", () => this.importGuest());
    this.render();
  }

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
      this.client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => this.useSession(session), 0);
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

  async useSession(session) {
    const nextUser = session?.user || null;
    if (this.initialized && nextUser?.id === this.user?.id) return;
    this.initialized = true;
    this.revision += 1;
    this.user = nextUser;
    this.storage.userId = nextUser?.id || null;
    this.refreshing = null;
    this.busy = Boolean(nextUser);
    this.message = nextUser ? "Loading your saved scores..." : "Guest play. Sign in with your email whenever you want to save across devices.";
    this.changed();
    if (nextUser && this.returningFromLogin) {
      this.returningFromLogin = false;
      location.hash = "profile";
    }
    if (nextUser) await this.refresh();
  }

  async sendLink() {
    const form = document.querySelector("#account-form");
    if (!this.client || this.busy || !form.reportValidity()) return;
    const revision = this.revision;
    this.busy = true;
    this.message = "Sending your sign-in link...";
    this.render();
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email: document.querySelector("#account-email").value.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${location.pathname}#profile` },
      });
      if (error) throw error;
      if (revision !== this.revision) return;
      this.message = "Check your email for a sign-in link. Open it to create your account or sign in. You can close this and keep playing.";
    } catch (error) {
      if (revision !== this.revision) return;
      this.message = error.status === 429
        ? "Please wait a minute before requesting another link."
        : "The sign-in email could not be sent. Check your email address and try again shortly.";
    } finally { if (revision === this.revision) { this.busy = false; this.render(); } }
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
        this.message = "Your scores are up to date.";
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
