'use strict';

/**
 * Ironhold balance constants. Pure data (no env reads) so the game logic is
 * deterministic and unit-testable. Operational knobs (e.g. season length) live
 * in ../config. Keep everything here small — the whole game must fit the free
 * ~512MB Atlas plan, and small numbers keep documents small.
 */

// One signature material per biome. A Hold's material is a pure function of its
// coordinates (see biome.js), so the "world" costs zero database storage.
const MATERIALS = [
  'ironwood', 'skysteel', 'saltpeter', 'emberglass', 'frosthide',
  'sungrain', 'shadowsilk', 'stormsalt', 'bloodstone', 'moonclay',
];

// The four loadout stances (attack / defence / farming / moving).
const STANCES = ['assault', 'bulwark', 'harvest', 'march'];

// Gear/chest rarity tiers and the fractional power each equipped piece adds.
const TIERS = ['wood', 'iron', 'gold', 'royal'];
const TIER_POWER = { wood: 0.03, iron: 0.07, gold: 0.14, royal: 0.25 };
const LOADOUT_SLOTS = 3; // equipped pieces per stance

// Chest grade -> weighted tier odds (as [tier, weight] pairs).
const CHEST_ODDS = {
  wood: [['wood', 70], ['iron', 25], ['gold', 5], ['royal', 0]],
  iron: [['wood', 40], ['iron', 40], ['gold', 18], ['royal', 2]],
  gold: [['wood', 15], ['iron', 40], ['gold', 35], ['royal', 10]],
  royal: [['iron', 25], ['gold', 45], ['royal', 30]],
};

// Fresh-Hold starting state.
const START = { troops: 100, gems: 20, material: 200, scrap: 0, level: 1, xp: 0, skillPoints: 0 };

// Passive harvest of your OWN material.
const HARVEST = { ratePerHour: 120, cap: 6000 };

// Skill tree: rank cap + per-rank effect. assault/bulwark/harvest/march feed the
// matching stance; gemfind/chestluck are economy edges.
const SKILLS = {
  assault: { max: 5, perRank: 0.04 },
  bulwark: { max: 5, perRank: 0.04 },
  harvest: { max: 5, perRank: 0.05 },
  march: { max: 5, perRank: 0.05 },
  gemfind: { max: 3, perRank: 0.10 },
  chestluck: { max: 3, perRank: 0.05 },
};

// Combat tuning (see game/combat.js).
const COMBAT = {
  homeDefenseBonus: 0.20, // defender edge at home
  baseLossFrac: 0.20,     // min fraction the loser loses
  swingLossFrac: 0.35,    // extra loss scaled by the power gap
  winnerLossFrac: 0.12,   // winner attrition (shrinks with a decisive win)
  woundedFrac: 0.5,       // half of losses are wounded (recoverable), not dead
  woundedHealMs: 30 * 60 * 1000,
  lootFrac: 0.25,         // fraction of defender material looted on attacker win
  lootCap: 1500,
};

// Commanders: rare, bought with gems or won via quests; free trial at season start.
const COMMANDERS = {
  durgan: { cost: 60 },
  wren: { cost: 40, chargesOnRecruit: 5, scoutCost: 3 },
  trialHours: 12,
};

// Gems from watching an ad (server-verified, cooldowned, daily-capped).
const AD = { rewardGems: 5, cooldownMs: 5 * 60 * 1000, dailyCap: 10 };

// Map / marching. World is a torus-free integer plane; distance in "tiles".
const MAP = { marchSecondsPerTile: 45, worldSize: 400, spawnSpread: 120, minTiles: 3 };

// Conquest Points awarded by each source.
const CP = { winBattle: 25, defend: 15, quest: 15, trade: 5, upgrade: 30, mine: 10, levelUp: 10 };

// Hard caps that bound document size (critical for the light-DB constraint).
const CAPS = { inventory: 40, openOffers: 10, reports: 30, marches: 8 };

// Crafting a gear piece of a tier: own material + scrap (foreign materials are
// enforced at the route layer via recipes so trade stays mandatory).
const CRAFT_COST = {
  wood: { mat: 50, scrap: 0 },
  iron: { mat: 120, scrap: 20 },
  gold: { mat: 250, scrap: 60 },
  royal: { mat: 500, scrap: 150 },
};

// XP required to advance FROM the given level to the next.
function xpForLevel(level) {
  return Math.round(60 * Math.pow(level, 1.6));
}

module.exports = {
  MATERIALS, STANCES, TIERS, TIER_POWER, LOADOUT_SLOTS, CHEST_ODDS,
  START, HARVEST, SKILLS, COMBAT, COMMANDERS, AD, MAP, CP, CAPS, CRAFT_COST, xpForLevel,
};
