'use strict';

const { TIER_POWER, SKILLS, LOADOUT_SLOTS } = require('./constants');

/** Is a commander currently usable (owned outright, or within its free trial)? */
function commanderActive(hold, name, now) {
  const c = hold.commanders && hold.commanders[name];
  if (!c) return false;
  if (c.owned) return true;
  now = now || Date.now();
  return !!(c.freeUntil && new Date(c.freeUntil).getTime() > now);
}

/** Fractional power from the gear equipped in a stance's loadout (slot-capped). */
function gearBonus(hold, stance) {
  const ids = (hold.loadouts && hold.loadouts[stance]) || [];
  const inv = hold.inventory || [];
  let bonus = 0;
  let used = 0;
  for (const id of ids) {
    if (used >= LOADOUT_SLOTS) break;
    const piece = inv.find((g) => String(g.id) === String(id));
    if (piece && piece.stance === stance) {
      bonus += TIER_POWER[piece.tier] || 0;
      used += 1;
    }
  }
  return bonus;
}

/** Fractional power from the skill matching a stance. */
function skillBonus(hold, stance) {
  const def = SKILLS[stance];
  if (!def) return 0;
  const ranks = (hold.skills && hold.skills[stance]) || 0;
  return ranks * def.perRank;
}

/** Total multiplier for a stance: 1 + gear + skill + Durgan synergy. */
function stanceMultiplier(hold, stance, now) {
  const synergy = hold.autoLoadout && commanderActive(hold, 'durgan', now) ? 0.03 : 0;
  return 1 + gearBonus(hold, stance) + skillBonus(hold, stance) + synergy;
}

/** Effective army power in a stance. */
function effectivePower(hold, stance, now) {
  return (hold.troops || 0) * stanceMultiplier(hold, stance, now);
}

/**
 * Durgan's auto-loadout rule. First match wins (offense-first):
 *   1. an attack of ours is marching out            -> assault
 *   2. we are under attack (and have no attack out)  -> bulwark
 *   3. any army is traveling (e.g. returning home)   -> march
 *   4. otherwise idle                                -> harvest
 */
function chooseStance(hold, now) {
  now = now || Date.now();
  const marches = hold.marches || [];
  const hasOutgoingAttack = marches.some((m) => m.kind === 'attack' && m.status !== 'done');
  if (hasOutgoingAttack) return 'assault';
  const underAttack = hold.incomingAt && new Date(hold.incomingAt).getTime() > now;
  if (underAttack) return 'bulwark';
  const anyTraveling = marches.some((m) => m.status !== 'done');
  if (anyTraveling) return 'march';
  return 'harvest';
}

module.exports = { commanderActive, gearBonus, skillBonus, stanceMultiplier, effectivePower, chooseStance };
