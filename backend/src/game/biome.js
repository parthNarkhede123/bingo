'use strict';

const { MATERIALS, MAP } = require('./constants');

/**
 * The world is PROCEDURAL: a Hold's biome — and therefore its one signature
 * material — is a pure function of its integer coordinates. Nothing about the
 * map is stored in the database, which is central to the light-DB design.
 */
function biomeIndex(x, y) {
  // FNV-1a-style stable hash over the two coordinates.
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (x | 0), 16777619) >>> 0;
  h = Math.imul(h ^ (y | 0), 16777619) >>> 0;
  return h % MATERIALS.length;
}

function materialAt(x, y) {
  return MATERIALS[biomeIndex(x, y)];
}

// Chebyshev-ish distance in tiles, floored at 1 so nothing is instant.
function distanceTiles(a, b) {
  return Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y)));
}

// Deterministic spawn coordinate for a brand-new Hold, spread across the world
// from a numeric seed (e.g. a hash of the userId) so players don't all stack.
function spawnCoords(seed) {
  const s = (seed >>> 0) || 1;
  const x = (s % MAP.spawnSpread) - Math.floor(MAP.spawnSpread / 2);
  const y = (Math.floor(s / MAP.spawnSpread) % MAP.spawnSpread) - Math.floor(MAP.spawnSpread / 2);
  return { x, y };
}

module.exports = { biomeIndex, materialAt, distanceTiles, spawnCoords };
