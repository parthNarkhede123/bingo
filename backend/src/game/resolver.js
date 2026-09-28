'use strict';

const { HARVEST, SKILLS, COMBAT } = require('./constants');
const { gearBonus, chooseStance, commanderActive } = require('./loadout');

/**
 * Current passive harvest rate (units/hr) of a Hold's own material. Depends only
 * on the harvest skill plus harvest gear WHILE the harvest stance is active.
 * Because the rate is stored on the Hold and re-settled on every change, lazy
 * accrual over an interval is exact (see settleHold).
 */
function harvestRate(hold) {
  const skill = (hold.skills && hold.skills.harvest) || 0;
  const gear = hold.activeStance === 'harvest' ? gearBonus(hold, 'harvest') : 0;
  return HARVEST.ratePerHour * (1 + skill * SKILLS.harvest.perRank + gear);
}

/** Accrue harvested material from lastHarvestAt to `now` at the stored rate. */
function settleHarvest(hold, now) {
  const m = hold.material;
  const last = m.lastHarvestAt ? new Date(m.lastHarvestAt).getTime() : now;
  const hours = Math.max(0, (now - last) / 3600000);
  const rate = m.rate != null ? m.rate : harvestRate(hold);
  m.amount = Math.min(HARVEST.cap, Math.round((m.amount || 0) + hours * rate));
  m.lastHarvestAt = new Date(now);
}

/** Recompute and store the current harvest rate (call AFTER settling). */
function recomputeRate(hold) {
  hold.material.rate = harvestRate(hold);
}

/**
 * Fast-forward a Hold to `now` with no background writes: accrue harvest, bring
 * home arrived "return" marches (troops + loot), heal wounded, clear a stale
 * incoming-attack marker, and (if Durgan auto-loadout is on) switch the active
 * stance. Attacks/scouts that need another player's doc are NOT resolved here —
 * the march service / sweeper does that. Mutates the hold; returns events.
 */
function settleHold(hold, now) {
  now = now || Date.now();
  const events = [];

  // 1. Accrue harvest over the elapsed interval at the rate that applied then.
  settleHarvest(hold, now);

  // 2. Arrived return marches: survivors (and any loot) come home.
  for (const m of hold.marches || []) {
    if (m.status !== 'done' && m.kind === 'return' && new Date(m.arriveAt).getTime() <= now) {
      hold.troops = (hold.troops || 0) + (m.troops || 0);
      if (m.loot && m.loot.amount) {
        hold.material.amount = Math.min(HARVEST.cap, (hold.material.amount || 0) + m.loot.amount);
      }
      if (m.loot && m.loot.foreign) {
        for (const [type, qty] of Object.entries(m.loot.foreign)) {
          hold.foreignMaterials.set(type, (hold.foreignMaterials.get(type) || 0) + qty);
        }
      }
      m.status = 'done';
      events.push({ kind: 'return', troops: m.troops });
    }
  }

  // 3. Heal wounded once the infirmary timer elapses.
  if (hold.wounded > 0 && hold.woundedHealAt && new Date(hold.woundedHealAt).getTime() <= now) {
    hold.troops = (hold.troops || 0) + hold.wounded;
    events.push({ kind: 'healed', troops: hold.wounded });
    hold.wounded = 0;
    hold.woundedHealAt = null;
  }

  // 4. Clear a stale incoming marker (the actual raid is resolved by the sweeper).
  if (hold.incomingAt && new Date(hold.incomingAt).getTime() <= now) {
    hold.incomingAt = null;
  }

  // 5. Drop finished marches so the array stays small.
  if (hold.marches && hold.marches.length) {
    hold.marches = hold.marches.filter((m) => m.status !== 'done');
  }

  // 6. Durgan auto-loadout: switch stance to fit the situation. Settle first so
  //    the harvest accrued above used the OLD rate, then set the new rate.
  if (hold.autoLoadout && commanderActive(hold, 'durgan', now)) {
    const desired = chooseStance(hold, now);
    if (desired !== hold.activeStance) {
      hold.activeStance = desired;
      events.push({ kind: 'stance', stance: desired });
    }
  }
  recomputeRate(hold);

  hold.lastSeenAt = new Date(now);
  return events;
}

module.exports = { harvestRate, settleHarvest, recomputeRate, settleHold, COMBAT };
