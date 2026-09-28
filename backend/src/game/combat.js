'use strict';

const { COMBAT, CP } = require('./constants');

/**
 * Deterministic small variance from a numeric seed — no Math.random, so a raid
 * resolves identically wherever it runs (attacker read, defender read, or the
 * offline sweeper) and unit tests are stable. Returns a factor in [0.9, 1.1].
 */
function seededFactor(seed) {
  let h = (seed >>> 0) || 1;
  h ^= h << 13; h >>>= 0;
  h ^= h >> 17;
  h ^= h << 5; h >>>= 0;
  return 0.9 + ((h % 1000) / 1000) * 0.2;
}

/**
 * Resolve a single raid deterministically. Inputs are compact snapshots:
 *   attacker: { troops, assaultMult }
 *   defender: { troops, bulwarkMult, material }
 * `seed` is derived from stable ids/timestamps by the caller. Returns troop
 * losses (split into dead + wounded), loot, and CP for each side. Pure.
 */
function resolveBattle(attacker, defender, seed = 0) {
  const atkEff = attacker.troops * attacker.assaultMult * seededFactor(seed);
  const defEff = defender.troops * defender.bulwarkMult * (1 + COMBAT.homeDefenseBonus) * seededFactor(seed + 7);

  const attackerWins = atkEff >= defEff;
  const winnerEff = Math.max(atkEff, defEff, 1);
  const loserEff = Math.min(atkEff, defEff);
  const gap = 1 - loserEff / winnerEff; // 0 (even) .. ~1 (blowout)

  const loserLossFrac = Math.min(0.95, COMBAT.baseLossFrac + COMBAT.swingLossFrac * gap);
  const winnerLossFrac = COMBAT.winnerLossFrac * (1 - gap);

  const out = { attackerWins, atkEff, defEff };
  if (attackerWins) {
    out.attackerLosses = Math.round(attacker.troops * winnerLossFrac);
    out.defenderLosses = Math.round(defender.troops * loserLossFrac);
    out.loot = Math.min(COMBAT.lootCap, Math.round((defender.material || 0) * COMBAT.lootFrac));
    out.cpAttacker = Math.round(CP.winBattle * (0.5 + gap));
    out.cpDefender = 0;
  } else {
    out.attackerLosses = Math.round(attacker.troops * loserLossFrac);
    out.defenderLosses = Math.round(defender.troops * winnerLossFrac);
    out.loot = 0;
    out.cpAttacker = 0;
    out.cpDefender = Math.round(CP.defend * (0.5 + gap));
  }
  // A portion of losses are merely wounded and heal over time (not game-ending).
  out.attackerWounded = Math.round(out.attackerLosses * COMBAT.woundedFrac);
  out.defenderWounded = Math.round(out.defenderLosses * COMBAT.woundedFrac);
  return out;
}

module.exports = { resolveBattle, seededFactor };
