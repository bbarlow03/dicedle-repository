// Temporarily disabled for testing. Set to true to restore one run per day.
const dailyLimitEnabled = true;

const dieOne = document.querySelector("#die-one");
const dieTwo = document.querySelector("#die-two");
const scoreElement = document.querySelector("#score");
const scoreLabel = document.querySelector("#score-label");
const rollResult = document.querySelector("#roll-result");
const status = document.querySelector("#game-status");
const rollButton = document.querySelector("#roll-button");
const rollButtonLabel = document.querySelector("#roll-button-label");
const rollButtonCaption = document.querySelector("#roll-button-caption");
const testRestartButton = document.querySelector("#test-restart-button");
const dailyMessage = document.querySelector("#daily-message");
const countdown = document.querySelector("#reset-countdown");
const welcomeModal = document.querySelector("#welcome-modal");
const welcomePlay = document.querySelector("#welcome-play");
const helpModal = document.querySelector("#help-modal");
const statsModal = document.querySelector("#stats-modal");
const storageKey = dailyLimitEnabled ? "dicedle.dailyRun.v1" : "dicedle.testingRun.v1";
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
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return { date, rolls: [] };

  const run = JSON.parse(saved);
  if (!run || typeof run.date !== "string") throw new Error("Invalid saved run");
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

  scoreElement.textContent = score;
  scoreLabel.textContent = busted ? "FINAL SCORE" : "CURRENT SCORE";
  showDice(...(lastRoll || [1, 1]), Boolean(lastRoll));
  dieOne.classList.toggle("bust", busted);
  dieTwo.classList.toggle("bust", busted);
  rollButton.disabled = isRolling || Boolean(storageError);
  rollButton.classList.toggle("is-busted", busted);
  rollButton.classList.toggle("is-awaiting-roll", !busted && !hasRolledThisVisit && !isRolling && !storageError);
  document.querySelector(".game-card").classList.toggle("is-busted", busted);
  rollButtonLabel.textContent = busted ? "BUSTED" : "ROLL";
  rollButtonCaption.textContent = busted ? "this run is over" : "take your chance";
  testRestartButton.hidden = dailyLimitEnabled || !busted;
  testRestartButton.disabled = isRolling || Boolean(storageError);
  rollResult.textContent = lastRoll ? `+${rollTotal(lastRoll)}` : "Ready when you are";

  if (storageError) {
    status.textContent = "Your daily run is unavailable.";
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
    dailyMessage.textContent = "One run per day. Your progress is saved in this browser.";
  }

  if (!dailyLimitEnabled && !storageError) {
    dailyMessage.textContent = busted
      ? "Daily limit paused for testing. Select NEW TEST RUN to start fresh."
      : "Daily limit paused for testing. Play as many runs as you like.";
  }

  document.querySelector("#daily-date").textContent = new Date().toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
  document.querySelector("#stat-rolls").textContent = dailyRun.rolls.length;
  document.querySelector("#roll-count").textContent = dailyRun.rolls.length;
  document.querySelector("#stat-score").textContent = score;
  document.querySelector("#stat-status").textContent = busted ? "Busted" : lastRoll ? "In play" : "Ready";
  const runOwner = dailyLimitEnabled ? "today's" : "your";
  welcomePlay.textContent = busted ? `View ${runOwner} score →` : lastRoll ? `Resume ${runOwner} run →` : "Roll to play →";
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
  if (isRolling || storageError || isBusted(dailyRun) || document.querySelector("dialog[open]")) return;

  const version = ++rollVersion;
  isRolling = true;
  hasRolledThisVisit = true;
  rollButton.classList.remove("is-awaiting-roll");
  rollButton.disabled = true;

  try {
    const commitRoll = () => {
      if (version !== rollVersion) return null;
      // Always re-read the shared run before accepting a roll.
      const latest = readDailyRun();
      if (isBusted(latest)) return { run: latest, rolled: false };

      const next = {
        date: latest.date,
        rolls: [...latest.rolls, [randomDie(), randomDie()]],
      };
      if (isBusted(next)) {
        next.gameOverMessageIndex = Math.floor(Math.random() * gameOverMessages.length);
      } else {
        next.safeRollMessageIndex = Math.floor(Math.random() * safeRollMessages.length);
      }
      // Commit before animating: a refresh cannot discard an unlucky result.
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return { run: next, rolled: true };
    };

    // Serialize simultaneous rolls from tabs when the browser supports locks.
    const result = navigator.locks?.request
      ? await navigator.locks.request(storageKey, commitRoll)
      : commitRoll();
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
    storageError = "Your roll could not be saved. Allow saved site data in your browser, then reload to play.";
    renderGame();
  }
}

async function restartTestRun() {
  if (dailyLimitEnabled || isRolling || storageError || !isBusted(dailyRun) || document.querySelector("dialog[open]")) return;

  const version = ++rollVersion;
  isRolling = true;
  testRestartButton.disabled = true;
  try {
    const restart = () => {
      if (version !== rollVersion) return;
      const latest = readDailyRun();
      if (isBusted(latest)) {
        window.localStorage.setItem(storageKey, JSON.stringify({ date: latest.date, rolls: [] }));
      }
    };
    if (navigator.locks?.request) await navigator.locks.request(storageKey, restart);
    else restart();
    if (version === rollVersion) syncDailyRun();
  } catch {
    if (version !== rollVersion) return;
    isRolling = false;
    storageError = "Your new test run could not be saved. Allow saved site data, then reload to try again.";
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

rollButton.addEventListener("click", roll);
testRestartButton.addEventListener("click", restartTestRun);
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
      (rollButton.disabled ? document.querySelector("#help-button") : rollButton).focus();
    }
  });
});
document.querySelector("#help-button").addEventListener("click", () => openModal(helpModal));
document.querySelector("#stats-button").addEventListener("click", () => openModal(statsModal));

window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) syncDailyRun();
});
window.addEventListener("focus", syncDailyRun);
window.addEventListener("pageshow", syncDailyRun);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncDailyRun();
});
window.setInterval(() => {
  if (dailyRun.date !== localDateKey()) syncDailyRun();
  else updateCountdown();
}, 1000);

if (!dailyLimitEnabled) {
  document.querySelector("#daily-badge-title").textContent = "Unlimited test runs";
  document.querySelector("#daily-badge-caption").textContent = "Daily limit paused";
  document.querySelector("#welcome-daily-rule").textContent = "Unlimited runs for testing. After a bust, select NEW TEST RUN to start fresh. The BUSTED button stays pressable, but your run is over.";
  document.querySelector("#help-daily-rule").textContent = "The daily limit is temporarily paused for testing. The BUSTED button won't roll again. Select NEW TEST RUN to reset your score and start another run.";
  document.querySelector("#reset-note").textContent = "Daily countdown · testing is unlocked";
  document.querySelector("#daily-footer").textContent = "UNLIMITED TEST RUNS";
  document.querySelector("#stats-title").textContent = "This run.";
}

syncDailyRun();
openModal(welcomeModal);
