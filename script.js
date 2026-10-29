const dieOne = document.querySelector("#die-one");
const dieTwo = document.querySelector("#die-two");
const scoreElement = document.querySelector("#score");
const scoreLabel = document.querySelector("#score-label");
const rollResult = document.querySelector("#roll-result");
const status = document.querySelector("#game-status");
const rollButton = document.querySelector("#roll-button");
const rollButtonLabel = document.querySelector("#roll-button-label");
const rollButtonCaption = document.querySelector("#roll-button-caption");
const dailyMessage = document.querySelector("#daily-message");
const dailyStatus = document.querySelector("#daily-status");
const countdown = document.querySelector("#reset-countdown");
const welcomeModal = document.querySelector("#welcome-modal");
const welcomePlay = document.querySelector("#welcome-play");
const helpModal = document.querySelector("#help-modal");
const playPage = document.querySelector("#play-page");
const profilePage = document.querySelector("#profile-page");
const playLink = document.querySelector("#play-link");
const profileLink = document.querySelector("#profile-link");
const accounts = new DicedleAccounts(window.DICEDLE_CONFIG);
const scoreHistory = new DicedleHistory(() => accounts.storage);
const storageKey = scoreHistory.runKey;
let historyPage = 0;
let historyError = "";
const historyPageSize = 10;
const rollDuration = 650;
const gameOverMessages = [
  "Seven had other plans.",
  "Your luck just clocked out.",
  "One roll too far. A classic.",
  "The dice have spoken. That's a wrap.",
  "Plot twist: seven.",
  "You rolled. Seven replied.",
  "Your luck left the table.",
  "All good rolls come to an end.",
  "That's how the dice tumble.",
  "A dramatic exit, courtesy of seven.",
  "Good run. Terrible timing.",
  "The dice giveth. The seven taketh.",
];
const safeRollMessages = [
  "Still in the game.",
  "Your luck is holding.",
  "Seven can wait.",
  "The run lives on.",
  "The dice are on your side. For now.",
  "That'll do. Keep it rolling.",
  "A little luck goes a long way.",
  "Safe landing.",
  "Not today, seven.",
  "One more for the tally.",
  "Fortune favors this roll.",
  "A few more points, a little more suspense.",
];
let dailyRun = { date: localDateKey(), rolls: [] };
let storageError = "";
let isRolling = false;
// Re-arm the invitation on every page load, even when resuming a saved run.
let hasRolledThisVisit = false;
let rollTimer;
let rollVersion = 0;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function millisecondsUntilMidnight(date = new Date()) {
  // A calendar midnight also handles the 23- and 25-hour days around DST.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) - date;
}

function rollTotal(dice) {
  return dice[0] + dice[1];
}

function isBusted(run) {
  return run.rolls.length > 0 && rollTotal(run.rolls[run.rolls.length - 1]) === 7;
}

function readDailyRun() {
  const date = localDateKey();
  const saved = accounts.storage.getItem(storageKey);
  if (!saved) return { date, rolls: [] };

  const run = JSON.parse(saved);
  if (!run || typeof run.date !== "string") throw new Error("Invalid saved run");
  rememberRunHistory(run);
  if (run.date !== date) return { date, rolls: [] };

  const validRolls = Array.isArray(run.rolls) && run.rolls.every((dice, index) => (
    Array.isArray(dice) && dice.length === 2 &&
    dice.every((value) => Number.isInteger(value) && value >= 1 && value <= 6) &&
    (rollTotal(dice) !== 7 || index === run.rolls.length - 1)
  ));
  if (!validRolls) throw new Error("Invalid saved dice");
  return run;
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function rememberRunHistory(run) {
  try {
    scoreHistory.remember(run, localDateKey());
  } catch {
    historyError = "Your run is saved, but its history could not be saved. Check that this browser allows saved site data.";
  }
}

function showDice(first, second, hasRolled = true) {
  dieOne.dataset.value = first;
  dieTwo.dataset.value = second;
  dieOne.setAttribute("aria-label", hasRolled ? `First die: ${first}` : "First die, waiting to roll");
  dieTwo.setAttribute("aria-label", hasRolled ? `Second die: ${second}` : "Second die, waiting to roll");
}

function renderGame() {
  const score = dailyRun.rolls.reduce((sum, dice) => sum + rollTotal(dice), 0);
  const busted = isBusted(dailyRun);
  const lastRoll = dailyRun.rolls[dailyRun.rolls.length - 1];
  dailyStatus.hidden = !busted || dailyRun.date !== localDateKey() || isRolling || Boolean(storageError);

  scoreElement.textContent = score;
  scoreLabel.textContent = busted ? "FINAL SCORE" : "CURRENT SCORE";
  showDice(...(lastRoll || [1, 1]), Boolean(lastRoll));
  dieOne.classList.toggle("bust", busted);
  dieTwo.classList.toggle("bust", busted);
  rollButton.disabled = isRolling || Boolean(storageError) || accounts.busy;
  rollButton.classList.toggle("is-busted", busted);
  rollButton.classList.toggle("is-awaiting-roll", !busted && !hasRolledThisVisit && !isRolling && !storageError && !accounts.busy);
  document.querySelector(".game-card").classList.toggle("is-busted", busted);
  rollButtonLabel.textContent = busted ? "BUSTED" : "ROLL";
  rollButtonCaption.textContent = busted ? "this run is over" : "take your chance";
  rollResult.textContent = lastRoll ? `+${rollTotal(lastRoll)}` : "Ready when you are";

  if (storageError) {
    status.textContent = storageError;
    dailyMessage.textContent = storageError;
  } else if (busted) {
    const message = gameOverMessages[dailyRun.gameOverMessageIndex];
    status.textContent = typeof message === "string" ? message : gameOverMessages[0];
    dailyMessage.textContent = "Today's run is factum est. Come back tomorrow for another chance at glory.";
  } else if (lastRoll) {
    const message = safeRollMessages[dailyRun.safeRollMessageIndex];
    status.textContent = typeof message === "string" ? message : safeRollMessages[0];
    dailyMessage.textContent = "Your run is saved. You can return to finish it any time today.";
  } else {
    status.textContent = "Every roll adds to your score. Seven ends the run.";
    dailyMessage.textContent = "One run per day. Make it count.";
  }

  document.querySelector("#daily-date").textContent = new Date().toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
  document.querySelector("#roll-count").textContent = dailyRun.rolls.length;
  welcomePlay.textContent = busted ? "View today's score →" : lastRoll ? "Resume today's run →" : "Roll to play →";
  renderProfile();
}

function syncDailyRun() {
  window.clearTimeout(rollTimer);
  rollVersion += 1;
  isRolling = false;
  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  try {
    const latest = readDailyRun();
    if (latest.date !== dailyRun.date || (latest.rolls.length === 0 && dailyRun.rolls.length > 0)) {
      hasRolledThisVisit = false;
    }
    dailyRun = latest;
    storageError = "";
  } catch {
    storageError = "Allow saved site data in your browser, then reload to access your daily run.";
  }
  renderGame();
  updateCountdown();
}

async function roll() {
  if (dailyRun.date !== localDateKey()) syncDailyRun();
  if (isRolling || accounts.busy || storageError || isBusted(dailyRun) || document.querySelector("dialog[open]")) return;

  const version = ++rollVersion;
  isRolling = true;
  hasRolledThisVisit = true;
  rollButton.classList.remove("is-awaiting-roll");
  rollButton.disabled = true;

  try {
    const commitRoll = async () => {
      if (version !== rollVersion) return null;
      // Always re-read the shared run before accepting a roll.
      const latest = readDailyRun();
      if (isBusted(latest)) return { run: latest, rolled: false };

      const next = {
        date: latest.date,
        id: latest.date,
        rolls: [...latest.rolls, [randomDie(), randomDie()]],
      };
      if (isBusted(next)) {
        next.gameOverMessageIndex = Math.floor(Math.random() * gameOverMessages.length);
      } else {
        next.safeRollMessageIndex = Math.floor(Math.random() * safeRollMessages.length);
      }
      // Account rolls are confirmed by the server before updating the local copy.
      // A stale tab receives the account's canonical run instead of overwriting it.
      const confirmed = accounts.user ? await accounts.saveRun(next) : next;
      if (version !== rollVersion) return null;
      if (!scoreHistory.validRun(confirmed) || confirmed.date !== latest.date) throw new Error("Invalid account run");
      accounts.storage.setItem(storageKey, JSON.stringify(confirmed));
      rememberRunHistory(confirmed);
      return { run: confirmed, rolled: JSON.stringify(confirmed.rolls) !== JSON.stringify(latest.rolls) };
    };

    // Serialize simultaneous rolls from tabs when the browser supports locks.
    const result = navigator.locks?.request
      ? await navigator.locks.request(accounts.storage.namespace + storageKey, commitRoll)
      : await commitRoll();
    if (!result || version !== rollVersion) return;
    dailyRun = result.run;

    if (!result.rolled || dailyRun.date !== localDateKey()) {
      syncDailyRun();
      return;
    }

    showDice(...dailyRun.rolls[dailyRun.rolls.length - 1]);
    dieOne.classList.remove("rolling", "bust");
    dieTwo.classList.remove("rolling", "bust");
    void dieOne.offsetWidth;
    dieOne.classList.add("rolling");
    dieTwo.classList.add("rolling");
    rollResult.textContent = "Rolling...";
    status.innerHTML = '<span class="sr-only">Rolling the dice</span><span class="rolling-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>';
    rollTimer = window.setTimeout(() => {
      if (version === rollVersion) syncDailyRun();
    }, rollDuration);
  } catch {
    if (version !== rollVersion) return;
    isRolling = false;
    storageError = accounts.user
      ? "Your roll could not be confirmed. Reconnect, then sync scores from your account before rolling again."
      : "Your roll could not be saved. Allow saved site data in your browser, then reload to play.";
    renderGame();
  }
}

function updateCountdown() {
  const seconds = Math.ceil(millisecondsUntilMidnight() / 1000);
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  countdown.textContent = `${hours}:${minutes}:${remainder}`;
  countdown.setAttribute("datetime", `PT${seconds}S`);
}

function openModal(modal) {
  if (!modal.open) modal.showModal();
  document.body.classList.add("has-open-modal");
}

function profileNumber(value) {
  return value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function profileDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function renderProfile() {
  const errorElement = document.querySelector("#profile-error");
  let data;
  try {
    data = scoreHistory.profile(localDateKey());
    historyError = "";
  } catch {
    historyError = "Your records could not be refreshed. Allow saved site data in this browser, then reload to try again.";
  }
  errorElement.hidden = !historyError;
  errorElement.textContent = historyError;
  if (!data) return;

  const stats = data.stats;
  document.querySelector("#play-best-score").textContent = profileNumber(stats.bestScore ?? 0);
  document.querySelector("#play-best-streak").textContent = profileNumber(stats.mostRolls ?? 0);
  document.querySelector("#profile-best-score").textContent = profileNumber(stats.bestScore);
  document.querySelector("#profile-best-rolls").textContent = profileNumber(stats.mostRolls);
  document.querySelector("#profile-runs-played").textContent = profileNumber(stats.runsPlayed);
  document.querySelector("#profile-average-score").textContent = profileNumber(stats.averageScore);
  document.querySelector("#profile-average-note").textContent = stats.completedRuns
    ? `Across ${profileNumber(stats.completedRuns)} finished run${stats.completedRuns === 1 ? "" : "s"}`
    : "No finished runs yet";
  document.querySelector("#profile-total-rolls").textContent = profileNumber(stats.totalRolls);
  document.querySelector("#profile-total-score").textContent = profileNumber(stats.totalScore);
  document.querySelector("#profile-days-played").textContent = profileNumber(stats.daysPlayed);

  const current = data.currentRun;
  const rolls = current?.rolls || [];
  const busted = Boolean(current && isBusted(current));
  document.querySelector("#profile-today-date").textContent = profileDate(localDateKey());
  document.querySelector("#stat-score").textContent = profileNumber(rolls.reduce((sum, dice) => sum + rollTotal(dice), 0));
  document.querySelector("#stat-rolls").textContent = profileNumber(rolls.length);
  document.querySelector("#stat-status").textContent = busted ? "Busted" : rolls.length ? "In play" : "Ready";
  document.querySelector("#profile-play-link").textContent = busted
    ? "Back to play →" : rolls.length ? "Continue run →" : "Roll to play →";
  document.querySelector("#profile-today-note").textContent = busted
    ? "Your final score includes the seven that ended this run."
    : rolls.length ? "Your progress is saved. Keep rolling when you're ready." : "Your first roll starts today's story.";
  const rollChips = rolls.map((dice, index) => {
    const chip = document.createElement("li");
    const total = rollTotal(dice);
    chip.className = total === 7 ? "profile-roll is-bust" : "profile-roll";
    chip.textContent = `+${total}`;
    chip.setAttribute("aria-label", `Roll ${index + 1}: ${dice[0]} plus ${dice[1]} equals ${total}${total === 7 ? ", bust" : ""}`);
    return chip;
  });
  document.querySelector("#profile-today-rolls").replaceChildren(...rollChips);

  const records = data.records;
  historyPage = Math.min(historyPage, Math.max(0, Math.ceil(records.length / historyPageSize) - 1));
  const offset = historyPage * historyPageSize;
  document.querySelector("#history-count").textContent = `${profileNumber(records.length)} run${records.length === 1 ? "" : "s"}`;
  document.querySelector("#history-empty").hidden = records.length > 0;
  document.querySelector("#history-results").hidden = records.length === 0;
  const rows = records.slice(offset, offset + historyPageSize).map(record => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const time = document.createElement("time");
    time.dateTime = record.date;
    time.textContent = profileDate(record.date);
    dateCell.append(time);
    row.append(dateCell);
    for (const value of [record.score, record.rollCount]) {
      const cell = document.createElement("td");
      cell.className = "history-number";
      cell.textContent = profileNumber(value);
      row.append(cell);
    }
    const outcomeCell = document.createElement("td");
    const outcome = document.createElement("span");
    outcome.className = `history-outcome ${record.outcome}`;
    outcome.textContent = record.outcome === "busted" ? "Busted" : record.outcome === "day-ended" ? "Day ended" : "In progress";
    outcomeCell.append(outcome);
    row.append(outcomeCell);
    return row;
  });
  document.querySelector("#history-rows").replaceChildren(...rows);
  document.querySelector("#history-page-summary").textContent = records.length
    ? `${offset + 1}–${Math.min(offset + historyPageSize, records.length)} of ${profileNumber(records.length)} runs`
    : "0 runs";
  document.querySelector("#history-previous").disabled = historyPage === 0;
  document.querySelector("#history-next").disabled = offset + historyPageSize >= records.length;
}

function showPage(moveFocus = false) {
  const viewingProfile = window.location.hash === "#profile";
  document.body.classList.toggle("is-play-page", !viewingProfile);
  playPage.hidden = viewingProfile;
  profilePage.hidden = !viewingProfile;
  const activeLink = viewingProfile ? profileLink : playLink;
  const inactiveLink = viewingProfile ? playLink : profileLink;
  activeLink.setAttribute("aria-current", "page");
  inactiveLink.removeAttribute("aria-current");
  document.title = viewingProfile ? "Your profile — Dicedle" : "Dicedle — Roll your luck";
  if (viewingProfile) renderProfile();
  if (moveFocus) {
    document.querySelectorAll("dialog[open]").forEach(modal => modal.close());
    const heading = document.querySelector(viewingProfile ? "#profile-title" : "#game-title");
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

rollButton.addEventListener("click", roll);
welcomePlay.addEventListener("click", () => welcomeModal.close());
document.querySelector("#welcome-rules").addEventListener("click", () => {
  welcomeModal.close();
  openModal(helpModal);
});
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelectorAll("dialog").forEach((modal) => {
  modal.addEventListener("close", () => {
    if (!document.querySelector("dialog[open]")) {
      document.body.classList.remove("has-open-modal");
      // The welcome popup has no opener to return to. Start at the heading so
      // dismissing it does not give the roll button a keyboard-focus highlight.
      // Other dialogs keep the browser's normal return-to-opener behavior.
      if (modal === welcomeModal) {
        document.querySelector(playPage.hidden ? "#profile-title" : "#game-title").focus({ preventScroll: true });
      }
    }
  });
});
document.querySelector("#help-button").addEventListener("click", () => openModal(helpModal));
document.querySelector("#history-previous").addEventListener("click", () => { historyPage -= 1; renderProfile(); });
document.querySelector("#history-next").addEventListener("click", () => { historyPage += 1; renderProfile(); });
window.addEventListener("hashchange", () => showPage(true));

window.addEventListener("storage", (event) => {
  if (event.key === accounts.storage.namespace + storageKey || event.key === null) syncDailyRun();
  else if (accounts.storage.ownsKey(event.key)) renderProfile();
});
function refreshSavedScores() {
  if (isRolling || accounts.busy) return;
  syncDailyRun();
  if (accounts.user) accounts.refresh();
}
window.addEventListener("focus", refreshSavedScores);
window.addEventListener("online", refreshSavedScores);
window.addEventListener("pageshow", syncDailyRun);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshSavedScores();
});
window.setInterval(() => {
  if (dailyRun.date !== localDateKey()) syncDailyRun();
  else updateCountdown();
}, 1000);

syncDailyRun();
showPage();
accounts.addEventListener("change", () => { historyPage = 0; syncDailyRun(); });
accounts.start();
if (!playPage.hidden && !/access_token=|error_description=/.test(location.hash)) openModal(welcomeModal);
