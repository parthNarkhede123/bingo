'use strict';

const crypto = require('crypto');
const Hold = require('../models/Hold');
const User = require('../models/User');
const { materialAt, spawnCoords } = require('../game/biome');
const { settleHold, recomputeRate } = require('../game/resolver');
const { resolveHoldMarches } = require('./marches');
const { START, COMMANDERS, HARVEST } = require('../game/constants');

/** Stable numeric seed from a Mongo id string (for deterministic spawn coords). */
function seedFromId(id) {
  const h = crypto.createHash('sha256').update(String(id)).digest();
  return h.readUInt32BE(0);
}

/** Create a fresh Hold for a user in a season and bump their all-time seasons. */
async function createHold(user, season, now) {
  now = now || Date.now();
  const coords = spawnCoords(seedFromId(user._id.toString()));
  const trialUntil = new Date(now + COMMANDERS.trialHours * 60 * 60 * 1000);
  const hold = new Hold({
    userId: user._id,
    username: user.username,
    season: season.number,
    coords,
    material: {
      type: materialAt(coords.x, coords.y),
      amount: START.material,
      rate: HARVEST.ratePerHour,
      lastHarvestAt: new Date(now),
    },
    scrap: START.scrap,
    gems: START.gems,
    cp: 0,
    xp: START.xp,
    level: START.level,
    skillPoints: START.skillPoints,
    troops: START.troops,
    activeStance: 'harvest',
    autoLoadout: false,
    // Both commanders ride free for the first 12h of the season (trial).
    commanders: {
      durgan: { owned: false, freeUntil: trialUntil },
      wren: { owned: false, freeUntil: trialUntil, charges: 0 },
    },
    lastSeenAt: new Date(now),
  });
  recomputeRate(hold);
  await hold.save();
  await User.updateOne({ _id: user._id }, { $inc: { 'stats.seasonsPlayed': 1 } });
  return hold;
}

/**
 * Load a user's Hold for a season, creating it on first touch, then fast-forward
 * it to `now` (lazy resolution) and persist. Returns the live, settled document.
 */
async function getHold(user, season, now) {
  now = now || Date.now();
  let hold = await Hold.findOne({ userId: user._id, season: season.number });
  if (!hold) return createHold(user, season, now);
  settleHold(hold, now);
  await resolveHoldMarches(hold, now); // land this lord's own due raids immediately
  await hold.save();
  return hold;
}

/** Serialize a Hold for the client: expose derived state, hide nothing secret. */
function serializeHold(hold) {
  const foreign = {};
  if (hold.foreignMaterials) {
    for (const [k, v] of hold.foreignMaterials.entries ? hold.foreignMaterials.entries() : Object.entries(hold.foreignMaterials)) {
      foreign[k] = v;
    }
  }
  const quests = {};
  if (hold.quests) {
    for (const [k, v] of hold.quests.entries ? hold.quests.entries() : Object.entries(hold.quests)) quests[k] = v;
  }
  return {
    season: hold.season,
    username: hold.username,
    coords: hold.coords,
    material: {
      type: hold.material.type,
      amount: Math.floor(hold.material.amount || 0),
      rate: Math.round(hold.material.rate || 0),
      cap: HARVEST.cap,
    },
    foreignMaterials: foreign,
    scrap: hold.scrap,
    gems: hold.gems,
    cp: hold.cp,
    xp: hold.xp,
    level: hold.level,
    skillPoints: hold.skillPoints,
    troops: hold.troops,
    wounded: hold.wounded,
    woundedHealAt: hold.woundedHealAt,
    activeStance: hold.activeStance,
    autoLoadout: hold.autoLoadout,
    loadouts: hold.loadouts,
    inventory: hold.inventory,
    skills: hold.skills,
    commanders: hold.commanders,
    chests: hold.chests,
    quests,
    marches: (hold.marches || []).map((m) => ({
      id: m.id, kind: m.kind, targetCoords: m.targetCoords, troops: m.troops,
      departAt: m.departAt, arriveAt: m.arriveAt, status: m.status,
    })),
    incomingAt: hold.incomingAt,
  };
}

module.exports = { createHold, getHold, serializeHold, seedFromId };
