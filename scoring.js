// Versioned rules preserve old scores while new rolls can earn a doubles bonus.
const DicedleScoring = Object.freeze({
  validRules(value, rollCount) {
    if (value.scoringVersion === undefined || value.scoringVersion === 1) return value.bonusStart === undefined;
    return value.scoringVersion === 2 && Number.isInteger(value.bonusStart)
      && value.bonusStart >= 0 && value.bonusStart <= rollCount;
  },

  metadata(value) {
    return value.scoringVersion === 2 ? { scoringVersion: 2, bonusStart: value.bonusStart } : {};
  },

  nextRules(run) {
    return run.scoringVersion === 2 ? this.metadata(run) : { scoringVersion: 2, bonusStart: run.rolls.length };
  },

  analyze(run) {
    const start = run.scoringVersion === 2 ? run.bonusStart : Infinity;
    let total = 0;
    let nextMultiplier = 1;
    const rolls = run.rolls.map((dice, index) => {
      const raw = dice[0] + dice[1];
      const previous = run.rolls[index - 1];
      if (index === start && previous && previous[0] === previous[1]) nextMultiplier = 2;
      const multiplier = index >= start ? nextMultiplier : 1;
      const points = raw * multiplier;
      total += points;
      if (index >= start) nextMultiplier = dice[0] === dice[1] ? multiplier * 2 : 1;
      return { dice, raw, multiplier, points, bonus: points - raw, double: dice[0] === dice[1] };
    });
    if (run.rolls.length <= start) {
      const last = run.rolls.at(-1);
      nextMultiplier = last && last[0] === last[1] ? 2 : 1;
    }
    return { total, rolls, nextMultiplier, pending: nextMultiplier > 1 };
  },

  pending(run) {
    return this.analyze(run).pending;
  },
});
