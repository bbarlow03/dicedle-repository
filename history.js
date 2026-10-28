// Browser-local records, stored separately for each run to avoid replacing history.
class DicedleHistory {
  constructor(storageProvider, options = {}) {
    this.storageProvider = storageProvider;
    this.now = options.now || (() => Date.now());
    this.prefix = "dicedle.history.v1.daily.";
    this.runKey = "dicedle.dailyRun.v1";
  }

  parse(value) {
    try { return JSON.parse(value); } catch { return null; }
  }

  validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  validRun(run) {
    return Boolean(run && this.validDate(run.date) && Array.isArray(run.rolls)
      && run.rolls.every((dice, index) => Array.isArray(dice) && dice.length === 2
        && dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6)
        && (dice[0] + dice[1] !== 7 || index === run.rolls.length - 1)));
  }

  summarize(run, today) {
    if (!this.validRun(run) || !run.rolls.length || run.date > today) return null;
    const lastRoll = run.rolls[run.rolls.length - 1];
    return {
      version: 1,
      id: run.date,
      mode: "daily",
      date: run.date,
      score: run.rolls.reduce((score, dice) => score + dice[0] + dice[1], 0),
      rollCount: run.rolls.length,
      outcome: lastRoll[0] + lastRoll[1] === 7 ? "busted" : run.date < today ? "day-ended" : "in-progress",
      recordedAt: this.now(),
    };
  }

  validRecord(record) {
    return Boolean(record && record.version === 1 && record.mode === "daily"
      && record.id === record.date && this.validDate(record.date)
      && Number.isSafeInteger(record.rollCount) && record.rollCount > 0
      && Number.isSafeInteger(record.score) && record.score >= record.rollCount * 2
      && record.score <= record.rollCount * 12
      && ["busted", "day-ended"].includes(record.outcome)
      && Number.isFinite(record.recordedAt));
  }

  remember(run, today) {
    const record = this.summarize(run, today);
    if (!record || record.outcome === "in-progress") return null;
    const storage = this.storageProvider();
    const key = `${this.prefix}${record.id}`;
    const existing = this.parse(storage.getItem(key));
    if (this.validRecord(existing)
      && (existing.rollCount >= record.rollCount || existing.outcome === "busted")) return existing;
    storage.setItem(key, JSON.stringify(record));
    return record;
  }

  currentRun() {
    const run = this.parse(this.storageProvider().getItem(this.runKey));
    return this.validRun(run) ? run : null;
  }

  captureSavedRun(today) {
    const run = this.currentRun();
    if (run) this.remember(run, today);
  }

  records() {
    const storage = this.storageProvider();
    const records = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(this.prefix)) continue;
      const record = this.parse(storage.getItem(key));
      if (this.validRecord(record) && key === `${this.prefix}${record.id}`) records.push(record);
    }
    return records;
  }

  profile(today) {
    this.captureSavedRun(today);
    const records = new Map(this.records().map(record => [record.id, record]));
    const saved = this.currentRun();
    const currentRun = saved?.date === today ? saved : null;
    const active = currentRun && this.summarize(currentRun, today);
    if (active && !records.has(active.id)) records.set(active.id, active);
    const runs = [...records.values()].filter(record => record.date <= today)
      .sort((first, second) => second.date.localeCompare(first.date)
        || second.recordedAt - first.recordedAt || second.id.localeCompare(first.id));
    const finished = runs.filter(record => record.outcome !== "in-progress");
    return {
      currentRun,
      records: runs,
      stats: {
        bestScore: runs.length ? Math.max(...runs.map(record => record.score)) : null,
        mostRolls: runs.length ? Math.max(...runs.map(record => record.rollCount)) : null,
        runsPlayed: runs.length,
        completedRuns: finished.length,
        averageScore: finished.length ? finished.reduce((sum, record) => sum + record.score, 0) / finished.length : null,
        totalRolls: runs.reduce((sum, record) => sum + record.rollCount, 0),
        totalScore: runs.reduce((sum, record) => sum + record.score, 0),
        daysPlayed: new Set(runs.map(record => record.date)).size,
      },
    };
  }
}
