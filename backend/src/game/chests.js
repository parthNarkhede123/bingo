'use strict';

const { CHEST_ODDS, TIERS, STANCES, TIER_POWER } = require('./constants');

/** Weighted roll of a gear tier from a chest grade. rng() -> [0,1). */
function rollTier(grade, rng = Math.random) {
  const odds = CHEST_ODDS[grade] || CHEST_ODDS.wood;
  const total = odds.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [tier, w] of odds) {
    r -= w;
    if (r < 0) return tier;
  }
  return odds[odds.length - 1][0];
}

/**
 * Roll a full gear piece from a chest: a weighted tier + a random stance.
 * `chestLuck` (0..1) is a small chance to bump the tier up one (chestluck skill).
 * Returns { stance, tier, power }; the caller assigns an id and stores it.
 */
function rollGear(grade, rng = Math.random, chestLuck = 0) {
  let tier = rollTier(grade, rng);
  if (chestLuck > 0 && rng() < chestLuck) {
    const i = TIERS.indexOf(tier);
    if (i >= 0 && i < TIERS.length - 1) tier = TIERS[i + 1];
  }
  const stance = STANCES[Math.floor(rng() * STANCES.length)] || STANCES[0];
  return { stance, tier, power: TIER_POWER[tier] };
}

module.exports = { rollTier, rollGear };
