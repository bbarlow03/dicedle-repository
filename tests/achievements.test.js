(async () => {
  const TODAY = "2026-10-29";
  const NOW = Date.UTC(2026, 9, 29, 12);
  const results = [];
  let assertions = 0;
  const assert = (value, message) => { assertions++; if (!value) throw new Error(message); };
  const test = async (name, callback) => {
    try { await callback(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  class MemoryStorage {
    constructor() { this.values = new Map(); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
  }
  const fixture = () => {
    const memory = new MemoryStorage();
    const storage = new DicedleStorage(() => memory);
    const history = new DicedleHistory(() => storage, { now: () => NOW });
    const book = new DicedleAchievements(() => storage, { now: () => NOW, locks: null });
    return {
      memory, storage, history, book,
      active(rolls) { storage.setItem(history.runKey, JSON.stringify({ date: TODAY, rolls })); },
      finished(date, rolls) { history.remember({ date, rolls }, TODAY); },
      profile() { return history.profile(TODAY); },
    };
  };
  const has = (snapshot, id) => snapshot.unlocked.has(id);
  const repeat = (pair, count) => Array.from({ length: count }, () => [...pair]);

  await test("All requested milestones exist; IDs and names are unique", () => {
    assert(DICEDLE_ACHIEVEMENTS.length >= 100, "Not enough achievements");
    assert(new Set(DICEDLE_ACHIEVEMENTS.map(a => a.id)).size === DICEDLE_ACHIEVEMENTS.length, "Duplicate IDs");
    assert(new Set(DICEDLE_ACHIEVEMENTS.map(a => a.name)).size === DICEDLE_ACHIEVEMENTS.length, "Duplicate names");
    for (const n of [10, 50, 100, 250, 500, 1000]) assert(DICEDLE_ACHIEVEMENTS.some(a => a.id === "run-rolls-" + n), "Missing run milestone " + n);
    for (const n of [100, 150, 200, 300]) assert(DICEDLE_ACHIEVEMENTS.some(a => a.id === "run-score-" + n), "Missing score milestone " + n);
    for (const n of [100, 250, 500, 1000, 5000, 10000]) assert(DICEDLE_ACHIEVEMENTS.some(a => a.id === "total-points-" + n), "Missing lifetime milestone " + n);
    assert(DICEDLE_ACHIEVEMENTS.every(a => a.target > 0 && a.description && a.name), "Incomplete definition");
  });

  await test("A new player has no achievements", async () => {
    const f = fixture(), snapshot = await f.book.collect(f.profile());
    assert(snapshot.unlocked.size === 0, "Empty collection earned badges");
    assert(snapshot.metrics.lifetimeRolls === 0, "Empty run counted");
  });

  await test("Only curated rare achievements belong to the Secret section", () => {
    const secret = DICEDLE_ACHIEVEMENTS.filter(achievement => achievement.secret);
    assert(secret.length === 12, "Unexpected secret collection size");
    assert(secret.every(achievement => achievement.category === "secret" && achievement.tier === "Legendary"), "Ordinary badges entered Secret");
    for (const id of ["first-roll", "first-bust", "run-score-100", "total-rolls-10", "multiple-seven"]) {
      assert(!DICEDLE_ACHIEVEMENTS.find(achievement => achievement.id === id).secret, "Common achievement made secret");
    }
  });

  await test("Locked secrets expose no name, requirement, target, or progress metadata", () => {
    for (const achievement of DICEDLE_ACHIEVEMENTS.filter(item => item.secret)) {
      const display = dicedleAchievementDisplay(achievement);
      assert(display.hidden && display.name === "Secret achievement", "Locked name revealed");
      assert(display.description !== achievement.description && display.tier === "Secret", "Locked requirement revealed");
      assert(!("target" in display) && !("metric" in display) && !("id" in display), "Hidden progress metadata exposed");
    }
  });

  await test("Secret achievements reveal automatically and preserve their existing saved IDs", async () => {
    const f = fixture(); f.active([[1,1],[2,2],[3,3],[4,4],[5,5],[6,6]]);
    const first = await f.book.collect(f.profile());
    const definition = DICEDLE_ACHIEVEMENTS.find(achievement => achievement.id === "all-doubles");
    assert(has(first, "all-doubles") && definition.secret, "Secret did not collect automatically");
    const revealed = dicedleAchievementDisplay(definition, true);
    assert(!revealed.hidden && revealed.name === definition.name && revealed.description === definition.description, "Collected secret not revealed");
    const existing = f.book.read(f.storage, definition);
    const again = await new DicedleAchievements(() => f.storage, { now: () => NOW + 1000, locks: null }).collect(f.profile());
    assert(existing.id === "all-doubles" && again.unlocked.get(existing.id).unlockedAt === NOW, "Saved ID or date changed");
    assert(!again.newlyEarned.some(achievement => achievement.id === existing.id), "Secret announced twice");
  });

  await test("The first safe roll unlocks immediately without inventing a bust", async () => {
    const f = fixture(); f.active([[2, 2]]);
    const snapshot = await f.book.collect(f.profile());
    assert(has(snapshot, "first-roll"), "First roll missed");
    assert(has(snapshot, "first-double"), "Doubles missed");
    assert(!has(snapshot, "first-bust") && !has(snapshot, "first-ever-bust"), "Safe roll called busted");
    assert(!has(snapshot, "personal-best"), "First score is not an improved record");
  });

  await test("A first-ever bust awards seven points and the appropriate special badges", async () => {
    const f = fixture(); f.active([[3, 4]]);
    const snapshot = await f.book.collect(f.profile());
    for (const id of ["first-roll", "first-bust", "first-roll-bust", "first-ever-bust", "multiple-seven"]) assert(has(snapshot, id), "Missing " + id);
    assert(snapshot.metrics.lifetimePoints === 7, "Final seven excluded");
    assert(snapshot.metrics.lifetimeRolls === 1, "Final roll excluded");
  });

  await test("A later first-roll bust cannot become the first-ever bust", async () => {
    const f = fixture(); f.finished("2026-10-28", [[1, 1], [3, 4]]); f.active([[3, 4]]);
    const snapshot = await f.book.collect(f.profile());
    assert(has(snapshot, "first-roll-bust"), "Daily first-roll bust missed");
    assert(!has(snapshot, "first-ever-bust"), "Later bust treated as first-ever");
  });

  await test("Unlocks survive reload and are never announced twice", async () => {
    const f = fixture(); f.active([[3, 4]]);
    const first = await f.book.collect(f.profile());
    const again = await new DicedleAchievements(() => f.storage, { now: () => NOW + 1000, locks: null }).collect(f.profile());
    assert(first.newlyEarned.length > 0, "No initial notification");
    assert(again.newlyEarned.length === 0, "Repeated notification");
    assert(again.unlocked.get("first-roll").unlockedAt === NOW, "Unlock timestamp changed");
    f.active([]);
    const reset = await f.book.collect(f.profile());
    assert(has(reset, "first-roll"), "An earned badge was removed");
  });

  await test("Run milestones advance during a run and include the terminal roll", async () => {
    const f = fixture(); f.active(repeat([2, 2], 9));
    const before = await f.book.collect(f.profile());
    assert(!has(before, "run-rolls-10"), "Milestone awarded early");
    f.active([...repeat([2, 2], 9), [3, 4]]);
    const after = await f.book.collect(f.profile());
    assert(has(after, "run-rolls-10") && has(after, "total-rolls-10"), "Terminal roll not counted");
    assert(after.metrics.lifetimePoints === 43, "Wrong score");
  });

  await test("High score and thousand-roll goals can actually unlock", async () => {
    const f = fixture(); f.active(repeat([6, 6], 25));
    assert(has(await f.book.collect(f.profile()), "run-score-300"), "300-point target missed");
    f.active([...repeat([2, 2], 999), [3, 4]]);
    assert(has(await f.book.collect(f.profile()), "run-rolls-1000"), "1,000-roll target missed");
  });

  await test("Summary-only history counts toward totals, but never invents dice", async () => {
    const f = fixture();
    f.storage.setItem(f.history.prefix + "2026-10-28", JSON.stringify({
      version: 1, id: "2026-10-28", date: "2026-10-28", mode: "daily",
      score: 10000, rollCount: 1000, outcome: "day-ended", recordedAt: NOW,
    }));
    const snapshot = await f.book.collect(f.profile());
    assert(has(snapshot, "total-points-10000") && has(snapshot, "total-rolls-1000"), "Historical milestones missed");
    assert(!has(snapshot, "first-double") && !has(snapshot, "snake-eyes"), "Invented historical dice");
  });

  await test("Lifetime points accumulate across different dates without double counting", async () => {
    const f = fixture();
    f.finished("2026-10-27", repeat([2, 2], 1250));
    f.finished("2026-10-28", repeat([2, 2], 1250));
    const first = await f.book.collect(f.profile());
    const again = await f.book.collect(f.profile());
    assert(has(first, "total-points-10000"), "Lifetime total missed");
    assert(again.metrics.lifetimePoints === 10000, "Repeated collection increased total");
    assert(again.metrics.daysPlayed === 2, "Repeated collection increased days");
  });

  await test("Exact bust scores and all-double patterns work", async () => {
    const f = fixture(); f.active([...repeat([6, 6], 3), [3, 3], [3, 4]]);
    const snapshot = await f.book.collect(f.profile());
    assert(has(snapshot, "score-49") && has(snapshot, "multiple-seven"), "Exact 49 missed");
    assert(has(snapshot, "boxcars") && snapshot.metrics.totalBoxcars === 3, "Boxcars count");
    const g = fixture(); g.active([[1,1],[2,2],[3,3],[4,4],[5,5],[6,6]]);
    const pairs = await g.book.collect(g.profile());
    assert(has(pairs, "all-doubles") && has(pairs, "double-chain-5"), "All doubles missed");
    assert(has(pairs, "left-faces") && has(pairs, "right-faces"), "Face collection missed");
  });

  await test("Every safe total, mirrors, and increasing sequences use real dice", async () => {
    const f = fixture(); f.active([[1,1],[1,2],[2,2],[2,3],[3,3],[4,4],[4,5],[5,5],[5,6],[6,6]]);
    const menu = await f.book.collect(f.profile());
    assert(has(menu, "all-totals") && has(menu, "ascending"), "Safe totals menu missed");
    const g = fixture(); g.active([[1,2],[2,1],[1,2]]);
    const mirrored = await g.book.collect(g.profile());
    assert(has(mirrored, "mirror") && has(mirrored, "same-total-3"), "Mirror or totals chain missed");
  });

  await test("Pattern streaks never cross run boundaries", async () => {
    const f = fixture(); f.finished("2026-10-28", [[1,1],[2,2]]); f.active([[3,3],[4,4]]);
    const snapshot = await f.book.collect(f.profile());
    assert(snapshot.metrics.doubleStreak === 2, "Doubles chain crossed days");
    assert(!has(snapshot, "double-chain-3"), "Three doubles falsely awarded");
    const g = fixture(); g.finished("2026-10-28", [[1,1],[1,1]]); g.active([[1,1]]);
    assert(!has(await g.book.collect(g.profile()), "same-total-3"), "Total chain crossed days");
  });

  await test("Calendar streaks use dates, including daylight-saving transitions", async () => {
    const f = fixture();
    for (const date of ["2026-03-07","2026-03-08","2026-03-09"]) f.finished(date, [[2,2]]);
    const snapshot = await f.book.collect(f.profile());
    assert(snapshot.metrics.dayStreak === 3 && has(snapshot, "day-streak-3"), "DST broke a calendar streak");
    const g = fixture(); for (const date of ["2026-10-26","2026-10-28"]) g.finished(date, [[2,2]]);
    g.active([[2,2]]);
    assert((await g.book.collect(g.profile())).metrics.dayStreak === 2, "Missing day did not break streak");
  });

  await test("Consecutive early busts and next-day comebacks work", async () => {
    const f = fixture(); f.finished("2026-10-27", [[3,4]]); f.finished("2026-10-28", [[2,5]]);
    f.active(repeat([6,6], 9));
    const snapshot = await f.book.collect(f.profile());
    assert(has(snapshot, "back-to-back-busts"), "Consecutive early exits missed");
    assert(has(snapshot, "comeback-100"), "Comeback missed");
    const g = fixture(); g.finished("2026-10-27", [[3,4]]); g.active(repeat([6,6], 9));
    assert(!has(await g.book.collect(g.profile()), "comeback-100"), "Comeback crossed a missing day");
  });

  await test("A leap-day record unlocks the leap-day achievement", async () => {
    const f = fixture(); f.finished("2024-02-29", [[2,2]]);
    assert(has(await f.book.collect(f.profile()), "leap-day"), "Leap day missed");
  });

  await test("Raw run enrichment preserves finalized totals and collection timestamps", () => {
    const f = fixture(), date = "2026-10-28";
    const summary = { version: 1, id: date, mode: "daily", date, score: 9, rollCount: 2, outcome: "busted", recordedAt: 1234 };
    f.storage.setItem(f.history.prefix + date, JSON.stringify(summary));
    const enriched = f.history.remember({ date, rolls: [[1,1],[3,4]] }, TODAY);
    assert(enriched.recordedAt === 1234 && enriched.score === 9, "Historical totals or time changed");
    assert(f.history.recordRun(enriched)?.rolls.length === 2, "Raw dice not recovered");
    f.history.remember({ date, rolls: [[6,6],[6,6],[3,4]] }, TODAY);
    assert(f.history.records()[0].score === 9, "Finalized history overwritten");
  });

  await test("Invalid or inconsistent raw details cannot grant pattern achievements", async () => {
    const f = fixture(), date = "2026-10-28";
    f.storage.setItem(f.history.prefix + date, JSON.stringify({
      version: 1, id: date, mode: "daily", date, score: 9, rollCount: 2,
      outcome: "busted", recordedAt: NOW, rolls: [[6,6],[6,6]],
    }));
    const snapshot = await f.book.collect(f.profile());
    assert(!has(snapshot, "boxcars"), "Inconsistent dice awarded a badge");
  });

  await test("Guest and two account collections remain separate", async () => {
    const f = fixture(); f.active([[1,1]]); await f.book.collect(f.profile());
    const guestKeys = f.storage.keys();
    assert(guestKeys.some(key => key.startsWith(f.book.prefix)), "Achievement keys omitted from scoped storage");
    f.storage.userId = "player-a";
    assert((await f.book.collect(f.profile())).unlocked.size === 0, "Guest badges leaked to account");
    f.active([[6,6]]); await f.book.collect(f.profile());
    f.storage.userId = "player-b";
    assert((await f.book.collect(f.profile())).unlocked.size === 0, "Player A badges leaked to B");
    f.storage.userId = null;
    const guest = await f.book.collect(f.profile());
    assert(has(guest, "snake-eyes") && !has(guest, "boxcars"), "Guest collection changed after account switch");
  });

  await test("Cloud run backfill rebuilds pattern achievements without a new database schema", async () => {
    const f = fixture(); f.storage.userId = "cloud-player";
    DicedleAccounts.prototype.applyRow.call({ storage: f.storage, today: () => TODAY }, {
      run_date: "2026-10-28", run: { date: "2026-10-28", rolls: [[6,6],[3,4]] },
    });
    assert(has(await f.book.collect(f.profile()), "boxcars"), "Synced raw dice did not rebuild achievement");
  });

  await test("Two tabs serialize collection and announce each award only once", async () => {
    const f = fixture(); f.active([[3,4]]);
    let tail = Promise.resolve();
    const locks = { request(_name, callback) { const next = tail.then(callback); tail = next.catch(() => {}); return next; } };
    const a = new DicedleAchievements(() => f.storage, { now: () => NOW, locks });
    const b = new DicedleAchievements(() => f.storage, { now: () => NOW, locks });
    const snapshots = await Promise.all([a.collect(f.profile()), b.collect(f.profile())]);
    assert(snapshots[0].newlyEarned.length > 0 && snapshots[1].newlyEarned.length === 0, "Cross-tab duplicate notifications");
  });

  await test("An account switch cancels a queued collection before writing", async () => {
    const f = fixture(); f.active([[3,4]]);
    let callback;
    const locks = { request(_name, job) { callback = job; return new Promise(resolve => { this.resolve = resolve; }); } };
    const book = new DicedleAchievements(() => f.storage, { now: () => NOW, locks });
    const pending = book.collect(f.profile());
    f.storage.userId = "someone-else";
    locks.resolve(callback());
    assert(await pending === null, "Stale scope wrote achievements");
    assert(f.storage.keys().length === 0, "Wrong account received data");
  });

  await test("Storage failures return a visible error without a false unlock", async () => {
    const f = fixture(); f.active([[3,4]]);
    const data = f.profile();
    const book = new DicedleAchievements(() => ({ namespace: "", getItem: () => null, setItem: () => { throw new Error("quota"); } }), { now: () => NOW, locks: null });
    const snapshot = await book.collect(data);
    assert(snapshot.error && snapshot.newlyEarned.length === 0 && snapshot.unlocked.size === 0, "Failed save was reported as earned");
  });

  const failed = results.filter(result => !result.passed);
  document.querySelector("#results").textContent =
    results.map(result => `${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? ": " + result.error : ""}`).join("\n")
    + `\n\n${results.length - failed.length}/${results.length} checks passed; ${assertions} assertions.`;
  window.dicedleAchievementTestResults = { results, assertions, failed: failed.length };
  window.dicedleAchievementTestsFinished = true;
})();
