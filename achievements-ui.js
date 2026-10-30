// The collection and its notification queue share the site's normal hash navigation.
const DICEDLE_ACHIEVEMENT_ICONS = Object.freeze({
  first: "M7 0h2v5h5v2H9v7H7V7H0V5h7zM1 0h2v2H1zm10 10h2v2h-2z",
  runs: "M2 1h10v1h1v10h-1v1H2v-1H1V2h1zm1 2v8h8V3zm1 1h2v2H4zm4 4h2v2H8z",
  scores: "M0 3h3v2h3V1h2v4h3V3h3v7H0zm2 8h10v2H2z",
  lifetime: "M2 1h10v2h2v10H0V3h2zm0 4v2h10V5zm4 1h2v4H6z",
  dice: "M1 1h12v12H1zm2 2v8h8V3zm1 1h2v2H4zm4 4h2v2H8z",
  bust: "M3 0h8v1h2v8h-2v4H9v-3H8v3H6v-3H5v3H3V9H1V1h2zm0 3v3h3V3zm5 0v3h3V3z",
  daily: "M2 0h2v2h6V0h2v2h2v12H0V2h2zm0 5v7h10V5zm2 2h2v2H4zm4 0h2v2H8z",
  secret: "M4 0h6v1h2v3h-2v1H8v3H6V4h3V2H5v2H2V1h2zm2 10h2v3H6z",
});

function dicedleAchievementIcon(category) {
  const icon = document.createElement("span");
  icon.className = "achievement-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<svg viewBox="0 0 14 14" fill="currentColor" shape-rendering="crispEdges"><path fill-rule="evenodd" d="${DICEDLE_ACHIEVEMENT_ICONS[category] || DICEDLE_ACHIEVEMENT_ICONS.first}"/></svg>`;
  return icon;
}

class DicedleAchievementToasts {
  constructor(host) {
    this.host = host;
    this.queue = [];
    this.current = null;
    this.timer = null;
    this.remaining = 6000;
    this.deadline = 0;
    host.addEventListener("mouseenter", () => this.pause());
    host.addEventListener("mouseleave", () => this.resume());
    host.addEventListener("focusin", () => this.pause());
    host.addEventListener("focusout", () => queueMicrotask(() => this.resume()));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
      else { this.showNext(); this.resume(); }
    });
  }

  enqueue(achievements) {
    if (!achievements.length) return;
    if (achievements.length <= 3) this.queue.push(...achievements);
    else this.queue.push(...achievements.slice(0, 2), {
      name: `${achievements.length - 2} more achievements!`,
      description: "Your collection just grew. Open the trophy room to see them all.",
      category: "scores", summary: true,
    });
    this.showNext();
  }

  showNext() {
    if (this.current || !this.queue.length || document.hidden) return;
    const achievement = this.queue.shift();
    this.current = achievement;
    this.remaining = 6000;
    const toast = document.createElement("section");
    toast.className = "achievement-toast";
    toast.setAttribute("aria-label", "Achievement unlocked");
    toast.append(dicedleAchievementIcon(achievement.category));
    const copy = document.createElement("div");
    const label = document.createElement("p");
    label.className = "achievement-toast-label";
    label.textContent = achievement.summary ? "Collection updated" : achievement.secret ? "Secret achievement unlocked!" : "Achievement unlocked!";
    const title = document.createElement("strong");
    title.textContent = achievement.name;
    const description = document.createElement("p");
    description.textContent = achievement.description;
    const link = document.createElement("a");
    link.href = "#achievements";
    link.textContent = "View achievements →";
    link.addEventListener("click", () => this.dismiss());
    copy.append(label, title, description, link);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "achievement-toast-close";
    dismiss.textContent = "x";
    dismiss.setAttribute("aria-label", "Dismiss achievement notification");
    dismiss.addEventListener("click", () => this.dismiss());
    toast.append(copy, dismiss);
    this.host.replaceChildren(toast);
    this.host.hidden = false;
    const previousFocus = document.activeElement;
    if (this.host.showPopover) {
      try { this.host.showPopover(); } catch { /* Fallback remains a fixed notification. */ }
    }
    if (document.activeElement !== previousFocus && previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    this.resume();
  }

  pause() {
    if (!this.timer) return;
    this.remaining = Math.max(0, this.deadline - Date.now());
    clearTimeout(this.timer);
    this.timer = null;
  }

  resume() {
    if (!this.current || this.timer || document.hidden
      || this.host.matches(":hover") || this.host.contains(document.activeElement)) return;
    this.deadline = Date.now() + this.remaining;
    this.timer = setTimeout(() => this.dismiss(), this.remaining);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.host.replaceChildren();
    if (this.host.hidePopover) {
      try { this.host.hidePopover(); } catch { /* Already closed. */ }
    }
    this.host.hidden = true;
    this.showNext();
  }

  clear() {
    this.queue.length = 0;
    this.dismiss();
  }
}

class DicedleAchievementsView {
  constructor() {
    this.snapshot = { metrics: {}, unlocked: new Map(), error: "" };
    this.status = "all";
    this.toasts = new DicedleAchievementToasts(document.querySelector("#achievement-toasts"));
    this.search = document.querySelector("#achievement-search");
    this.category = document.querySelector("#achievement-category");
    for (const [id, title] of DICEDLE_ACHIEVEMENT_CATEGORIES) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = title;
      this.category.append(option);
    }
    document.querySelectorAll("[data-achievement-filter]").forEach(button => button.addEventListener("click", () => {
      this.status = button.dataset.achievementFilter;
      document.querySelectorAll("[data-achievement-filter]").forEach(item =>
        item.setAttribute("aria-pressed", String(item === button)));
      this.render();
    }));
    this.search.addEventListener("input", () => this.render());
    this.category.addEventListener("change", () => this.render());
    this.render();
  }

  reset(namespace) {
    this.toasts.clear();
    this.snapshot = { namespace, metrics: {}, unlocked: new Map(), error: "" };
    this.render();
  }

  apply(snapshot) {
    this.snapshot = snapshot;
    this.render();
    this.toasts.enqueue(snapshot.newlyEarned);
  }

  render() {
    const { metrics, unlocked, error } = this.snapshot;
    const total = DICEDLE_ACHIEVEMENTS.length, count = unlocked.size;
    document.querySelector("#achievements-collected").textContent = count.toLocaleString();
    document.querySelector("#achievements-total").textContent = total.toLocaleString();
    document.querySelector("#achievements-progress").value = count;
    document.querySelector("#achievements-progress").max = total;
    document.querySelector("#achievements-progress-text").textContent = `${Math.round(count / total * 100)}% collected`;
    document.querySelector("#achievements-storage").textContent = this.snapshot.namespace ? "YOUR ACCOUNT'S COLLECTION" : "SAVED ON THIS DEVICE";
    const errorElement = document.querySelector("#achievements-error");
    errorElement.hidden = !error;
    errorElement.textContent = error || "";
    const query = this.search.value.trim().toLocaleLowerCase();
    const visible = DICEDLE_ACHIEVEMENTS.filter(achievement => {
      const display = dicedleAchievementDisplay(achievement, unlocked.has(achievement.id));
      return (this.category.value === "all" || this.category.value === achievement.category)
        && (this.status === "all" || unlocked.has(achievement.id) === (this.status === "unlocked"))
        && (!query || `${display.name} ${display.description}`.toLocaleLowerCase().includes(query));
    });
    document.querySelector("#achievement-results-count").textContent =
      `${visible.length.toLocaleString()} achievement${visible.length === 1 ? "" : "s"} shown`;
    const groups = document.createDocumentFragment();
    for (const [category, name] of DICEDLE_ACHIEVEMENT_CATEGORIES) {
      const entries = visible.filter(achievement => achievement.category === category);
      if (!entries.length) continue;
      const section = document.createElement("section");
      section.className = "achievement-group";
      const title = document.createElement("h3");
      title.textContent = name;
      const grid = document.createElement("div");
      grid.className = "achievement-grid";
      for (const achievement of entries) grid.append(this.card(achievement, metrics, unlocked.get(achievement.id)));
      section.append(title, grid);
      if (category === "secret") {
        const note = document.createElement("p");
        note.className = "achievement-secret-note";
        note.textContent = "The rarest finds stay hidden until you collect them.";
        title.after(note);
      }
      groups.append(section);
    }
    document.querySelector("#achievement-groups").replaceChildren(groups);
    document.querySelector("#achievements-empty").hidden = visible.length > 0;
  }

  card(achievement, metrics, saved) {
    const display = dicedleAchievementDisplay(achievement, Boolean(saved));
    const card = document.createElement("article");
    card.className = "achievement-card" + (achievement.secret ? " is-secret" : "") + (saved ? " is-unlocked" : "");
    card.dataset.achievementId = display.hidden ? `secret-${DICEDLE_ACHIEVEMENTS.indexOf(achievement)}` : achievement.id;
    const icon = dicedleAchievementIcon(achievement.category);
    const copy = document.createElement("div");
    copy.className = "achievement-card-copy";
    const top = document.createElement("div");
    top.className = "achievement-card-top";
    const tier = document.createElement("span");
    tier.className = "achievement-tier";
    tier.textContent = display.tier;
    const state = document.createElement("span");
    state.className = "achievement-state";
    state.textContent = saved ? "Collected" : "Locked";
    top.append(tier, state);
    const name = document.createElement("h4");
    name.textContent = display.name;
    const description = document.createElement("p");
    description.textContent = display.description;
    copy.append(top, name, description);
    if (saved) {
      const date = document.createElement("p");
      date.className = "achievement-earned-date";
      date.textContent = `Collected ${new Date(saved.unlockedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      copy.append(date);
    } else if (!display.hidden) {
      const value = Math.min(achievement.target, Math.max(0, metrics[achievement.metric] || 0));
      const progress = document.createElement("progress");
      progress.max = achievement.target;
      progress.value = value;
      progress.setAttribute("aria-label", `${achievement.name} progress`);
      const label = document.createElement("span");
      label.className = "achievement-card-progress";
      label.textContent = `${value.toLocaleString()} / ${achievement.target.toLocaleString()}`;
      copy.append(progress, label);
    }
    card.append(icon, copy);
    return card;
  }
}
