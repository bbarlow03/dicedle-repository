// Each die plays the supplied flame clip behind its flat and tumbling faces.
class DicedleDiceEffects {
  constructor() {
    this.stage = document.querySelector(".dice-stage");
    this.badge = document.querySelector("#bonus-indicator");
    this.burst = document.querySelector("#bonus-burst");
    this.impact = document.querySelector("#bust-impact");
    this.card = document.querySelector(".game-card");
    this.multiplier = 1;
    this.visible = true;
    this.burstTimer = null;
    this.impactTimer = null;
    this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.flames = [...document.querySelectorAll(".die-fire-video")].map((video, index) => {
      video.muted = true;
      video.defaultMuted = true;
      const flame = { video, offset: 1.5 + index * 2, initialized: false, playPending: false };
      video.addEventListener("loadeddata", () => {
        if (!flame.initialized) {
          flame.initialized = true;
          // Different points in the same clip keep the two flames from moving in lockstep.
          video.currentTime = Math.min(flame.offset, video.duration / 2);
        }
        this.updateAnimation();
      });
      video.addEventListener("canplay", () => this.updateAnimation());
      return flame;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearBust();
      this.updateAnimation();
    });
    this.motion.addEventListener("change", () => {
      if (this.motion.matches) this.clearBust();
      this.updateAnimation();
    });
  }

  shouldAnimate() {
    return this.multiplier > 1 && this.visible && !document.hidden && !this.motion.matches;
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) this.clearBust();
    this.updateAnimation();
  }

  setFire(multiplier, rolling = false) {
    this.multiplier = multiplier;
    const burning = multiplier > 1;
    this.stage.classList.toggle("is-on-fire", burning);
    this.badge.hidden = !burning;
    this.badge.textContent = burning
      ? (rolling ? `${multiplier.toLocaleString()}× POINTS THIS ROLL` : `NEXT ROLL ${multiplier.toLocaleString()}×`)
      : "";
    this.updateAnimation();
  }

  updateAnimation() {
    const active = this.multiplier > 1 && this.visible && !document.hidden;
    for (const flame of this.flames) {
      const { video } = flame;
      // Load only once fire is needed; reduced motion still gets a decoded, paused frame.
      if (active && video.preload === "none") {
        video.preload = "auto";
        video.load();
      }
      if (!this.shouldAnimate()) {
        video.pause();
        continue;
      }
      if (video.readyState < 2) continue;
      if (video.paused && !flame.playPending) {
        flame.playPending = true;
        let interrupted = false;
        video.play().catch(error => {
          interrupted = error.name === "AbortError";
          // A blocked media play leaves the decoded flame frame visible.
        }).finally(() => {
          flame.playPending = false;
          // A pending play must not restart fire after a cashout, tab switch, or motion change.
          if (!this.shouldAnimate()) video.pause();
          else if (interrupted) requestAnimationFrame(() => this.updateAnimation());
        });
      }
    }
  }

  playBust() {
    this.clearBust();
    if (!this.visible || document.hidden || this.motion.matches) return;
    for (const className of ["bust-flash", "bust-wave", "bust-wave bust-wave-echo"]) {
      const layer = document.createElement("span");
      layer.className = className;
      this.impact.append(layer);
    }
    for (let index = 0; index < 18; index++) {
      const spark = document.createElement("i");
      const angle = index / 18 * Math.PI * 2;
      const distance = 37 + index % 4 * 4;
      spark.style.setProperty("--blast-x", Math.cos(angle) * distance / 100);
      spark.style.setProperty("--blast-y", Math.sin(angle) * distance / 100);
      spark.style.setProperty("--blast-turn", `${index * 71}deg`);
      spark.style.setProperty("--blast-delay", `${index % 3 * 18}ms`);
      this.impact.append(spark);
    }
    this.impact.hidden = false;
    void this.stage.offsetWidth;
    this.stage.classList.add("is-bust-impact");
    this.card.classList.add("is-bust-impact");
    this.impactTimer = setTimeout(() => this.clearBust(), 1100);
  }

  clearBust() {
    clearTimeout(this.impactTimer);
    this.impactTimer = null;
    this.stage.classList.remove("is-bust-impact");
    this.card.classList.remove("is-bust-impact");
    this.impact.hidden = true;
    this.impact.replaceChildren();
  }

  celebrate(award) {
    this.clearCelebration();
    const title = document.createElement("strong");
    title.textContent = `${award.multiplier.toLocaleString()}× BONUS!`;
    const extra = document.createElement("span");
    extra.textContent = `+${award.bonus.toLocaleString()} EXTRA POINTS`;
    this.burst.append(title, extra);
    for (let index = 0; index < 12; index++) {
      const spark = document.createElement("i");
      const angle = index / 12 * Math.PI * 2;
      spark.style.setProperty("--spark-x", `${Math.cos(angle) * (65 + index % 3 * 15)}px`);
      spark.style.setProperty("--spark-y", `${Math.sin(angle) * 55 - 35}px`);
      this.burst.append(spark);
    }
    this.burst.hidden = false;
    void this.card.offsetWidth;
    this.card.classList.add("is-bonus-awarded");
    this.burstTimer = setTimeout(() => this.clearCelebration(), 1350);
  }

  clearCelebration() {
    clearTimeout(this.burstTimer);
    this.burstTimer = null;
    this.card.classList.remove("is-bonus-awarded");
    this.burst.hidden = true;
    this.burst.replaceChildren();
  }
}
