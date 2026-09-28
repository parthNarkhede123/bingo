'use strict';

const { xpForLevel, CP } = require('./constants');

/**
 * Apply an XP gain to a hold-like object, leveling up as many times as the
 * thresholds allow. Mutates the hold (xp, level, skillPoints, troops, cp,
 * chests) and returns a summary of what was gained. Pure aside from the mutation
 * of the passed object — no DB, no clock — so it is unit-testable.
 */
function applyXp(hold, amount) {
  hold.xp = (hold.xp || 0) + Math.max(0, Math.round(amount));
  if (!hold.chests) hold.chests = {};
  const gained = { levels: 0, skillPoints: 0, troops: 0, chests: [], cp: 0 };

  while (hold.xp >= xpForLevel(hold.level)) {
    hold.xp -= xpForLevel(hold.level);
    hold.level += 1;
    const troops = 20 + hold.level * 5;
    hold.skillPoints = (hold.skillPoints || 0) + 1;
    hold.troops = (hold.troops || 0) + troops;
    hold.cp = (hold.cp || 0) + CP.levelUp;
    gained.levels += 1;
    gained.skillPoints += 1;
    gained.troops += troops;
    gained.cp += CP.levelUp;
    // A chest every third level to keep gear flowing.
    if (hold.level % 3 === 0) {
      hold.chests.iron = (hold.chests.iron || 0) + 1;
      gained.chests.push('iron');
    }
  }
  return gained;
}

module.exports = { applyXp };
