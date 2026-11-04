// Small, original chiptune effects synthesized locally after a player gesture.
class DicedleSound {
  constructor(button) {
    this.button = button;
    this.preferenceKey = "dicedle.soundMuted.v1";
    this.context = null;
    this.master = null;
    this.volume = .24;
    this.voices = new Map();
    this.landingUntil = 0;
    this.uiTimes = new Map();
    this.muted = this.readMuted();
    this.AudioContext = window.AudioContext || window.webkitAudioContext;
    this.renderButton();
    button.addEventListener("click", () => {
      this.setMuted(!this.muted);
      if (!this.muted) this.unlock().then(ready => { if (ready) this.play("select"); });
    });
    document.addEventListener("pointerdown", event => {
      if (event.isTrusted) this.unlock();
    }, { passive: true });
    document.addEventListener("keydown", event => {
      if (event.isTrusted && (event.key === "Enter" || event.key === " ")) this.unlock();
    });
    document.addEventListener("dicedle:achievement", () => this.play("achievement"));
    this.bindInteractions();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden || !this.context) return;
      this.stop(null, true);
      if (this.context.state === "running") this.context.suspend().catch(() => {});
    });
    window.addEventListener("storage", event => {
      if (event.key === this.preferenceKey || event.key === null) this.setMuted(this.readMuted(), false);
    });
  }

  readMuted() {
    try { return localStorage.getItem(this.preferenceKey) === "1"; }
    catch { return false; }
  }

  ui(kind, unlock = true) {
    if (this.muted || document.hidden) return;
    const now = performance.now();
    const interval = kind === "error" ? 180 : kind === "type" ? 55 : 35;
    if (now - (this.uiTimes.get(kind) ?? -Infinity) < interval) return;
    this.uiTimes.set(kind, now);
    if (this.context?.state === "running") this.play(kind);
    else if (unlock) this.unlock().then(ready => {
      if (ready && performance.now() - now < 250) this.play(kind);
    });
  }

  bindInteractions() {
    // Delegation covers controls added when profile and achievement views render.
    document.addEventListener("click", event => {
      const control = event.target.closest?.("button, a[href], summary, select, input:not([type=hidden]), textarea, [role=button]");
      if (!control || control.id === "sound-button" || control.matches(":disabled, [aria-disabled=true]")
        || control.closest("[inert]")) return;
      if ((control.form && control.type === "submit")
        || control.matches('input[type="checkbox"], input[type="radio"]')) return;
      let kind = "click";
      if (control.matches("[data-close-modal], #welcome-play")) kind = "close";
      else if (control.matches("[data-open-account], #help-button, #welcome-rules, select")) kind = "open";
      else if (control.matches("summary")) kind = control.parentElement.open ? "close" : "open";
      else if (control.matches("a[href], #history-next, #history-previous")) kind = "navigate";
      else if (control.matches("[data-auth-mode], [data-achievement-filter]")) kind = "select";
      else if (control.matches("#roll-button.is-busted")) kind = "error";
      this.ui(kind, event.isTrusted);
    }, true);
    document.addEventListener("change", event => {
      if (event.target.matches('select, input[type="checkbox"], input[type="radio"]')
        && !event.target.matches(":disabled")) this.ui("select", event.isTrusted);
    });
    document.addEventListener("input", event => {
      // Keep search tactile without sounding out email or password keystrokes.
      if (event.target.id === "achievement-search" && !event.isComposing) this.ui("type", event.isTrusted);
    });
    document.addEventListener("submit", () => this.ui("confirm"), true);
    document.addEventListener("invalid", () => this.ui("error"), true);
    document.addEventListener("cancel", event => {
      if (event.target.matches("dialog")) this.ui("close", event.isTrusted);
    }, true);
  }

  renderButton() {
    const label = this.AudioContext ? (this.muted ? "Unmute sound" : "Mute sound") : "Sound unavailable in this browser";
    this.button.disabled = !this.AudioContext;
    this.button.setAttribute("aria-label", label);
    this.button.setAttribute("aria-pressed", String(this.muted));
    this.button.title = label;
    this.button.classList.toggle("is-muted", this.muted);
    this.button.querySelector("[data-sound-on]").toggleAttribute("hidden", this.muted);
    this.button.querySelector("[data-sound-off]").toggleAttribute("hidden", !this.muted);
  }

  setMuted(muted, persist = true) {
    this.muted = muted;
    if (persist) {
      try { localStorage.setItem(this.preferenceKey, muted ? "1" : "0"); }
      catch { /* Sound controls still work when preference storage is unavailable. */ }
    }
    this.renderButton();
    if (this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : this.volume, now + .012);
    }
    if (muted) this.stop();
  }

  async unlock() {
    if (this.muted || !this.AudioContext || document.hidden) return false;
    try {
      if (!this.context) this.initialize(new this.AudioContext());
      if (this.context.state === "suspended" || this.context.state === "interrupted") await this.context.resume();
      return this.context.state === "running";
    } catch {
      // Audio policy or unavailable hardware must never interrupt a saved roll.
      return false;
    }
  }

  initialize(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = .003;
    limiter.release.value = .12;
    this.master.connect(limiter);
    limiter.connect(context.destination);
    this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    let seed = 0x5eedca;
    for (let index = 0; index < samples.length; index += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const sample = Math.round(((seed >>> 0) / 4294967295 * 2 - 1) * 16) / 16;
      samples.fill(sample, index, Math.min(index + 4, samples.length));
    }
  }

  track(source, nodes) {
    this.voices.set(source, { group: this.scheduling, nodes });
    source.addEventListener("ended", () => {
      source.disconnect();
      nodes.forEach(node => node.disconnect());
      this.voices.delete(source);
    }, { once: true });
  }

  envelope(gain, start, duration, amplitude) {
    gain.setValueAtTime(0, start);
    gain.linearRampToValueAtTime(amplitude, start + .004);
    gain.exponentialRampToValueAtTime(.0001, start + duration);
    gain.setValueAtTime(0, start + duration + .006);
  }

  tone(frequency, start, duration, amplitude = .2, type = "square", endFrequency = frequency) {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    this.envelope(gain.gain, start, duration, amplitude);
    oscillator.connect(gain); gain.connect(this.master);
    this.track(oscillator, [gain]);
    oscillator.start(start); oscillator.stop(start + duration + .01);
  }

  noise(start, duration, amplitude, frequency, endFrequency, type = "lowpass", offset = 0) {
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    filter.Q.value = .7;
    this.envelope(gain.gain, start, duration, amplitude);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.track(source, [filter, gain]);
    source.start(start, offset); source.stop(start + duration + .01);
  }

  play(kind, options = {}) {
    if (this.muted || document.hidden || this.context?.state !== "running") return;
    try { this.schedule(kind, options); }
    catch { this.stop(null, true); }
  }

  schedule(kind, options = {}) {
    const start = kind === "achievement"
      ? Math.max(this.context.currentTime + .005, this.landingUntil + .06)
      : this.context.currentTime + .005;
    this.scheduling = kind;
    if (kind === "roll") {
      const duration = options.duration || .75, ticks = Math.max(3, Math.round(duration * 11));
      for (let index = 0; index < ticks; index++) {
        const time = start + index * duration / ticks;
        this.noise(time, .035, .28, 2200 - index * 110, 700, "highpass", index * .037);
        this.tone(180 + index % 5 * 55, time, .022, .1, "triangle");
      }
    } else if (kind === "safe") {
      this.tone(523.25, start, .08, .18, "triangle");
      this.tone(659.25, start + .055, .11, .2, "triangle");
      this.landingUntil = start + .17;
    } else if (kind === "double" || kind === "bonus") {
      const pitch = kind === "double" ? 2 ** (Math.min(4, options.level || 0) / 6) : 1;
      const notes = kind === "double" ? [330, 440, 660, 880] : [440, 554.37, 659.25, 880];
      notes.forEach((frequency, index) => this.tone(frequency * pitch, start + index * .065, .11, .17));
      this.tone(880 * pitch, start + .195, .16, .18, "triangle");
      this.landingUntil = start + .36;
    } else if (kind === "bust") {
      this.noise(start, .5, .38, 2500, 70);
      this.tone(165, start, .38, .22, "square", 45);
      this.tone(65, start + .015, .62, .28, "triangle", 30);
      this.landingUntil = start + .65;
    } else if (kind === "click" || kind === "type") {
      const typing = kind === "type";
      this.tone(typing ? 1046.5 : 740, start, typing ? .018 : .04, typing ? .035 : .09, "square", typing ? 880 : 580);
    } else if (kind === "navigate" || kind === "select") {
      this.tone(kind === "navigate" ? 659.25 : 880, start, .055, .1, "triangle");
      this.tone(kind === "navigate" ? 880 : 1046.5, start + .035, .065, .09, "triangle");
    } else if (kind === "open" || kind === "close") {
      const notes = kind === "open" ? [440, 659.25] : [659.25, 440];
      notes.forEach((frequency, index) => this.tone(frequency, start + index * .045, .075, .1, "triangle"));
    } else if (kind === "confirm" || kind === "success") {
      const notes = kind === "success" ? [523.25, 783.99, 1046.5] : [523.25, 659.25];
      notes.forEach((frequency, index) => this.tone(frequency, start + index * .055, .1, .12, "triangle"));
    } else if (kind === "error") {
      this.tone(196, start, .09, .11, "square", 146.83);
      this.tone(146.83, start + .075, .1, .09, "square", 110);
    } else if (kind === "achievement") {
      [659.25, 880, 1318.51].forEach((frequency, index) => this.tone(frequency, start + index * .085, .15, .16));
    }
  }

  playResult(award) {
    this.play(award.raw === 7 ? "bust" : award.double ? "double" : award.bonus ? "bonus" : "safe", {
      level: Math.log2(Math.max(1, award.multiplier)),
    });
  }

  stop(group = null, immediate = false) {
    if (!this.context) return;
    for (const [source, voice] of this.voices) {
      if (group && voice.group !== group) continue;
      try { source.stop(this.context.currentTime + (immediate ? 0 : .015)); } catch {}
      if (immediate) {
        source.disconnect(); voice.nodes.forEach(node => node.disconnect());
        this.voices.delete(source);
      }
    }
    if (!group) this.landingUntil = 0;
  }
}
