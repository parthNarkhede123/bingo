'use strict';

const crypto = require('crypto');
const Mine = require('../models/Mine');
const { MATERIALS, MAP } = require('../game/constants');
const { config } = require('../config');

/**
 * Keep roughly `mineTarget` wild mines alive on the map. Mines TTL-expire on
 * their own (index on expiresAt); this only tops the population back up. Spawn
 * positions/kinds derive from a rolling counter so no RNG state is stored.
 */
async function spawnMines(now) {
  now = now || Date.now();
  const season = await require('./season').ensureSeason(now);
  if (!season) return 0;
  const live = await Mine.countDocuments({ season: season.number, claimedBy: null });
  const target = config.ironhold.mineTarget;
  let created = 0;
  for (let i = live; i < target; i += 1) {
    const seed = crypto.randomBytes(4).readUInt32BE(0);
    const x = (seed % MAP.spawnSpread) - Math.floor(MAP.spawnSpread / 2);
    const y = (Math.floor(seed / MAP.spawnSpread) % MAP.spawnSpread) - Math.floor(MAP.spawnSpread / 2);
    const isGem = seed % 3 === 0;
    await Mine.create({
      season: season.number,
      coords: { x, y },
      kind: isGem ? 'gem' : 'material',
      material: isGem ? null : MATERIALS[seed % MATERIALS.length],
      amount: isGem ? 5 + (seed % 6) : 200 + (seed % 300),
      expiresAt: new Date(now + config.ironhold.mineTtlMs),
    });
    created += 1;
  }
  return created;
}

module.exports = { spawnMines };
