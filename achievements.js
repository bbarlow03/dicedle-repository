// Achievement definitions are data: remove an entry or change a target to tune the collection.
const DICEDLE_ACHIEVEMENT_CATEGORIES = Object.freeze([
  ["first", "First steps"], ["runs", "Long runs"], ["scores", "High scores"],
  ["lifetime", "Lifetime legends"], ["dice", "Dice tricks"], ["bust", "The bust club"],
  ["daily", "Daily ritual"], ["secret", "Secret"],
]);

const DICEDLE_ACHIEVEMENTS = (() => {
  const entries = [];
  const add = (id, name, description, category, metric, target = 1, tier = "Bronze") =>
    entries.push(Object.freeze({ id, name, description, category, metric, target, tier }));
  const series = (prefix, category, metric, description, milestones) => milestones.forEach(([target, name], index) =>
    add(`${prefix}-${target}`, name, description(target.toLocaleString()), category, metric, target,
      index >= milestones.length - 2 ? "Legendary" : index >= 3 ? "Gold" : index >= 1 ? "Silver" : "Bronze"));

  add("first-roll", "Let the Good Times Roll", "Make your very first roll.", "first", "hasRolled");
  add("first-bust", "No Refunds", "Finish a run by rolling a seven.", "first", "hasBusted");
  add("personal-best", "Past Me Had No Idea", "Beat a score from an earlier run.", "first", "newPersonalBest");
  add("roll-record", "One More Than Yesterday", "Beat your roll count from an earlier run.", "first", "newRollBest");

  series("run-rolls", "runs", "maxRolls", n => `Reach ${n} rolls in a single run, including the final seven.`, [
    [5, "Getting Away with It"], [10, "Ten and Counting"], [15, "Borrowed Luck"], [20, "Twenty-Sided Nerve"],
    [25, "Quarter-Life Crisis"], [30, "Thirty, Flirty, and Lucky"], [50, "Fifty Shades of Lucky"],
    [75, "Still at the Table"], [100, "The Hundred-Roll Stare"], [250, "The Dice Owe You Rent"],
    [500, "House Rules Are Suggestions"], [1000, "Someone Check These Dice"],
  ]);
  series("run-score", "scores", "bestScore", n => `Score at least ${n} points in one run.`, [
    [25, "Pocket Change"], [50, "Half a Century"], [75, "A Respectable Problem"], [100, "Century Club"],
    [150, "Luck Has a Favorite"], [200, "Double or Nothing"], [250, "Quarter Grand"],
    [300, "This Is Dicedle!"], [400, "The House Is Sweating"], [500, "Five Hundred Reasons"],
    [750, "Please Remain Seated"], [1000, "Four Digits, No Brakes"], [2000, "Beyond the Scoreboard"],
  ]);
  series("total-rolls", "lifetime", "lifetimeRolls", n => `Make ${n} rolls across all your runs.`, [
    [10, "Frequent Roller"], [50, "Wrist Warm-Up"], [100, "Dice Mileage"], [250, "Rolling Regular"],
    [500, "Table Veteran"], [1000, "A Thousand Tiny Gambles"], [2500, "The Long Roll Home"],
    [5000, "Certified Dice Whisperer"], [10000, "Carpal Luck Syndrome"],
  ]);
  series("total-points", "lifetime", "lifetimePoints", n => `Collect ${n} total points across your runs.`, [
    [100, "The First Hundred"], [250, "Loose Change Legend"], [500, "Point Collector"],
    [1000, "Comma Chameleon"], [2500, "Luck in the Bank"], [5000, "The Point of No Return"],
    [10000, "Five-Digit Energy"], [25000, "A Small Fortune"], [50000, "The House Remembers"],
    [100000, "Six Figures of Luck"],
  ]);
  series("finished-runs", "lifetime", "bustCount", n => `Bust out of ${n} different runs.`, [
    [5, "Repeat Customer"], [10, "A Habit of Sevens"], [25, "Professional Loser, Respectfully"],
    [50, "Fifty Farewells"], [100, "See You Tomorrow, Again"], [250, "The Exit Is Over There"],
    [500, "Seven Knows Your Name"],
  ]);

  add("snake-eyes", "Ssssurprise!", "Roll two ones.", "dice", "hasSnakeEyes");
  add("boxcars", "All Aboard", "Roll two sixes.", "dice", "hasBoxcars");
  add("first-double", "Seeing Double", "Roll any matching pair.", "dice", "hasDouble");
  series("double-chain", "dice", "doubleStreak", n => `Roll doubles ${n} times in a row in one run.`, [
    [2, "Double Trouble"], [3, "Triple Scoop"], [4, "Pair Pressure"], [5, "Doubles or Nothing"],
  ]);
  series("total-doubles", "dice", "totalDoubles", n => `Roll doubles ${n} times across your saved runs.`, [
    [10, "Pair Collector"], [50, "Two of a Kind of Person"], [100, "A Perfect Pairing"],
    [250, "Matchmaker"], [1000, "Doppelganger Department"],
  ]);
  series("total-snakes", "dice", "totalSnakeEyes", n => `Roll snake eyes ${n} times across your saved runs.`, [
    [10, "Snake Charmer"], [50, "A Basket of Cobras"], [100, "Ophidiophile"],
  ]);
  series("total-boxcars", "dice", "totalBoxcars", n => `Roll two sixes ${n} times across your saved runs.`, [
    [10, "Freight Train"], [50, "Full Steam Ahead"], [100, "The Midnight Express"],
  ]);
  add("all-doubles", "Pair-adise Found", "Roll all six different doubles in a single run.", "dice", "allDoubles", 1, "Legendary");
  add("all-totals", "The Whole Menu", "Roll every non-seven total in a single run.", "dice", "allSafeTotals", 1, "Legendary");
  add("all-faces", "A Face for Every Occasion", "See every face from one to six in a single run.", "dice", "allFaces");
  add("left-faces", "Left to Your Own Devices", "See all six values on the left die in one run.", "dice", "allLeftFaces", 1, "Silver");
  add("right-faces", "Right on Schedule", "See all six values on the right die in one run.", "dice", "allRightFaces", 1, "Silver");
  add("mirror", "Mirror, Mirror", "Roll a mismatched pair, then its exact reverse.", "dice", "mirror");
  series("same-total", "dice", "sameTotalStreak", n => `Roll the same total ${n} times in a row.`, [
    [3, "Broken Record"], [4, "Deja Vu Again"], [5, "Stuck on Repeat"],
  ]);
  series("same-pair", "dice", "samePairStreak", n => `Repeat the exact same ordered pair ${n} times in a row.`, [
    [2, "Copy, Paste"], [3, "Groundhog Roll"], [4, "Simulation Confirmed"],
  ]);
  add("ascending", "Stairway to Seven", "Roll four strictly increasing totals in a row.", "dice", "ascendingStreak", 4, "Silver");
  add("descending", "Downhill from Here", "Roll four strictly decreasing totals in a row.", "dice", "descendingStreak", 4, "Silver");
  add("evens", "Even Stevens", "Survive five even totals in a row.", "dice", "evenStreak", 5, "Silver");
  add("odds", "Oddly Comfortable", "Survive four odd totals in a row.", "dice", "oddStreak", 4, "Gold");
  add("near-misses", "Living Next Door to Seven", "Roll only sixes or eights for four rolls in a row.", "dice", "nearSevenStreak", 4, "Gold");
  add("small-totals", "Small but Mighty", "Roll four or less three times in a row.", "dice", "smallStreak", 3);
  add("big-totals", "Big Spender", "Roll ten or more three times in a row.", "dice", "bigStreak", 3, "Silver");

  add("first-roll-bust", "Well, That Was Quick", "Bust on the first roll of any day.", "bust", "firstRollBust");
  add("first-ever-bust", "Beginner's Misfortune", "Bust on the very first roll in your recorded history.", "bust", "firstEverBust", 1, "Silver");
  add("multiple-seven", "Sevenception", "Bust with a final score that is a multiple of seven.", "bust", "multipleSeven");
  add("score-49", "Seven Squared", "Bust with exactly 49 points.", "bust", "bust49", 1, "Silver");
  add("score-77", "Jackpot, Technically", "Bust with exactly 77 points.", "bust", "bust77", 1, "Gold");
  add("score-100", "Perfectly Ruined", "Bust with exactly 100 points.", "bust", "bust100", 1, "Gold");
  add("score-200", "Twice as Perfectly Ruined", "Bust with exactly 200 points.", "bust", "bust200", 1, "Legendary");
  add("score-777", "The Unluckiest Jackpot", "Bust with exactly 777 points.", "bust", "bust777", 1, "Legendary");
  add("short-bust", "Express Checkout", "Bust on your second roll.", "bust", "secondRollBust");
  add("long-bust", "It Was a Good Run", "Bust after reaching at least 20 rolls.", "bust", "longBust", 1, "Gold");
  add("back-to-back-busts", "See You in Seven", "Bust on the first roll on two consecutive days.", "bust", "consecutiveEarlyBusts", 2, "Silver");
  add("three-early-busts", "A Very Short Trilogy", "Bust on the first roll on three consecutive days.", "bust", "consecutiveEarlyBusts", 3, "Gold");
  add("comeback-50", "Character Development", "Score 50 the day after a first-roll bust.", "bust", "comeback50", 1, "Silver");
  add("comeback-100", "The Redemption Arc", "Score 100 the day after a first-roll bust.", "bust", "comeback100", 1, "Gold");
  add("comeback-rolls", "Plot Armor Restored", "Reach 15 rolls the day after a first-roll bust.", "bust", "comeback15", 1, "Gold");

  series("days", "daily", "daysPlayed", n => `Play on ${n} different days.`, [
    [2, "You Came Back!"], [7, "A Week of Weakness"], [14, "Fortnight at the Table"],
    [30, "Part of the Routine"], [60, "A Familiar Face"], [100, "One Hundred Tomorrows"],
    [180, "Half a Year of Nerve"], [365, "A Year in the Life of Dice"], [730, "Still Rolling, Somehow"],
  ]);
  series("day-streak", "daily", "dayStreak", n => `Play on ${n} consecutive local calendar days.`, [
    [3, "Three-Day Forecast: Dice"], [7, "Seven-Day Itch"], [14, "Can't Stop, Won't Stop"],
    [30, "Calendar Commitment"], [60, "An Unbroken Habit"], [100, "The Daily Diehard"],
    [365, "Perfect Attendance"],
  ]);
  add("weekdays", "Every Day Ends in Dice", "Play on all seven days of the week.", "daily", "weekdaysSeen", 7, "Silver");
  add("months", "A Die for All Seasons", "Play in all twelve calendar months.", "daily", "monthsSeen", 12, "Gold");
  add("leap-day", "Bonus Day, Same Dice", "Play on February 29.", "daily", "leapDay", 1, "Gold");

  // Curated rare finds live together; existing IDs keep collected badges intact.
  const secrets = new Set([
    "all-doubles", "all-totals", "same-pair-4", "double-chain-5", "same-total-5",
    "score-777", "run-rolls-100", "run-rolls-250", "run-rolls-500", "run-rolls-1000",
    "run-score-1000", "run-score-2000",
  ]);
  return Object.freeze(entries.map(achievement => secrets.has(achievement.id)
    ? Object.freeze({ ...achievement, category: "secret", tier: "Legendary", secret: true })
    : achievement));
})();

function dicedleAchievementDisplay(achievement, collected = false) {
  if (achievement.secret && !collected) {
    return {
      name: "Secret achievement",
      description: "A rare discovery. Unlock it to reveal its name and challenge.",
      tier: "Secret", hidden: true,
    };
  }
  return { name: achievement.name, description: achievement.description, tier: achievement.tier, hidden: false };
}

function dicedleAchievementContext(data) {
  const records = [...data.records].sort((a, b) => a.date.localeCompare(b.date));
  const stats = data.stats;
  const metrics = {
    lifetimeRolls: stats.totalRolls, lifetimePoints: stats.totalScore, bestScore: stats.bestScore || 0,
    maxRolls: stats.mostRolls || 0, daysPlayed: stats.daysPlayed,
    hasRolled: Number(stats.totalRolls > 0), bustCount: 0,
  };
  const max = (key, value) => { metrics[key] = Math.max(metrics[key] || 0, value); };
  const flag = (key, condition) => { if (condition) metrics[key] = 1; };
  const dayNumber = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
  const validator = new DicedleHistory(() => null);
  const weekdays = new Set(), months = new Set();
  let previous = null, bestScore = 0, bestRolls = 0, dayStreak = 0, earlyStreak = 0;

  for (const record of records) {
    const consecutive = previous && dayNumber(record.date) - dayNumber(previous.date) === 1;
    dayStreak = consecutive ? dayStreak + 1 : 1;
    max("dayStreak", dayStreak);
    weekdays.add(new Date(`${record.date}T12:00:00Z`).getUTCDay());
    months.add(record.date.slice(5, 7));
    flag("leapDay", record.date.endsWith("-02-29"));
    flag("newPersonalBest", previous && record.score > bestScore);
    flag("newRollBest", previous && record.rollCount > bestRolls);
    bestScore = Math.max(bestScore, record.score);
    bestRolls = Math.max(bestRolls, record.rollCount);
    const busted = record.outcome === "busted";
    if (busted) metrics.bustCount++;
    flag("hasBusted", busted);
    flag("firstRollBust", busted && record.rollCount === 1);
    flag("firstEverBust", record === records[0] && busted && record.rollCount === 1);
    flag("secondRollBust", busted && record.rollCount === 2);
    flag("multipleSeven", busted && record.score % 7 === 0);
    for (const exact of [49, 77, 100, 200, 777]) flag(`bust${exact}`, busted && record.score === exact);
    flag("longBust", busted && record.rollCount >= 20);
    earlyStreak = busted && record.rollCount === 1 ? (consecutive ? earlyStreak + 1 : 1) : 0;
    max("consecutiveEarlyBusts", earlyStreak);
    const comingBack = consecutive && previous.outcome === "busted" && previous.rollCount === 1;
    flag("comeback50", comingBack && record.score >= 50);
    flag("comeback100", comingBack && record.score >= 100);
    flag("comeback15", comingBack && record.rollCount >= 15);
    previous = record;

    // Summary-only history can award score milestones, but cannot invent dice patterns.
    const run = { date: record.date, rolls: record.rolls };
    if (!validator.validRun(run) || !run.rolls.length || run.rolls.length !== record.rollCount
      || run.rolls.reduce((sum, pair) => sum + pair[0] + pair[1], 0) !== record.score) continue;
    const ended = run.rolls.at(-1)[0] + run.rolls.at(-1)[1] === 7;
    if (ended !== busted) continue;
    const totals = new Set(), doubles = new Set(), left = new Set(), right = new Set();
    let last = null;
    const chains = {};
    const chain = (key, matches) => {
      chains[key] = matches ? (chains[key] || 0) + 1 : 0;
      max(key, chains[key]);
    };
    for (const pair of run.rolls) {
      const [a, b] = pair, total = a + b;
      const lastTotal = last ? last[0] + last[1] : null;
      const double = a === b;
      totals.add(total); left.add(a); right.add(b);
      if (double) { doubles.add(a); metrics.totalDoubles = (metrics.totalDoubles || 0) + 1; }
      if (a === 1 && b === 1) metrics.totalSnakeEyes = (metrics.totalSnakeEyes || 0) + 1;
      if (a === 6 && b === 6) metrics.totalBoxcars = (metrics.totalBoxcars || 0) + 1;
      flag("hasDouble", double);
      flag("hasSnakeEyes", a === 1 && b === 1);
      flag("hasBoxcars", a === 6 && b === 6);
      flag("mirror", last && a !== b && a === last[1] && b === last[0]);
      chain("doubleStreak", double);
      chain("evenStreak", total !== 7 && total % 2 === 0);
      chain("oddStreak", total !== 7 && total % 2 === 1);
      chain("nearSevenStreak", total === 6 || total === 8);
      chain("smallStreak", total <= 4);
      chain("bigStreak", total >= 10);
      for (const [key, matches] of [
        ["sameTotalStreak", total === lastTotal],
        ["samePairStreak", last && a === last[0] && b === last[1]],
        ["ascendingStreak", last && total > lastTotal],
        ["descendingStreak", last && total < lastTotal],
      ]) {
        chains[key] = matches ? (chains[key] || 1) + 1 : 1;
        max(key, chains[key]);
      }
      last = pair;
    }
    flag("allDoubles", doubles.size === 6);
    flag("allSafeTotals", [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].every(total => totals.has(total)));
    flag("allFaces", new Set([...left, ...right]).size === 6);
    flag("allLeftFaces", left.size === 6);
    flag("allRightFaces", right.size === 6);
  }
  metrics.weekdaysSeen = weekdays.size;
  metrics.monthsSeen = months.size;
  return metrics;
}

class DicedleAchievements {
  constructor(storageProvider, options = {}) {
    this.storageProvider = storageProvider;
    this.now = options.now || (() => Date.now());
    this.locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks;
    this.prefix = "dicedle.achievements.v1.";
  }

  read(storage, achievement) {
    try {
      const saved = JSON.parse(storage.getItem(this.prefix + achievement.id));
      return saved && saved.id === achievement.id && Number.isFinite(saved.unlockedAt) && saved.unlockedAt > 0
        ? saved : null;
    } catch { return null; }
  }

  async collect(data) {
    const storage = this.storageProvider();
    const namespace = storage.namespace || "";
    const collect = () => {
      if ((this.storageProvider().namespace || "") !== namespace) return null;
      const metrics = dicedleAchievementContext(data);
      const unlocked = new Map(), newlyEarned = [];
      let error = "";
      for (const achievement of DICEDLE_ACHIEVEMENTS) {
        let saved = this.read(storage, achievement);
        if (!saved && (metrics[achievement.metric] || 0) >= achievement.target) {
          const earned = { id: achievement.id, unlockedAt: this.now() };
          try {
            storage.setItem(this.prefix + achievement.id, JSON.stringify(earned));
            saved = earned;
            newlyEarned.push(achievement);
          } catch {
            error = "Your achievements could not be saved. Allow saved site data, then try again.";
          }
        }
        if (saved) unlocked.set(achievement.id, saved);
      }
      return { namespace, metrics, unlocked, newlyEarned, error };
    };
    return this.locks?.request
      ? this.locks.request(namespace + this.prefix + "collect", collect)
      : collect();
  }
}
