'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const biome = require('../src/game/biome');
const { applyXp } = require('../src/game/leveling');
const { resolveBattle, seededFactor } = require('../src/game/combat');
const { rollTier, rollGear } = require('../src/game/chests');
const loadout = require('../src/game/loadout');
const { settleHold } = require('../src/game/resolver');
const { MATERIALS, HARVEST, xpForLevel } = require('../src/game/constants');

test('biome is a deterministic pure function of coords', () => {
  assert.equal(biome.materialAt(3, 7), biome.materialAt(3, 7));
  assert.ok(MATERIALS.includes(biome.materialAt(12, -4)));
  assert.ok(biome.distanceTiles({ x: 0, y: 0 }, { x: 0, y: 0 }) >= 1); // never instant
  assert.equal(biome.distanceTiles({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('applyXp levels up, granting skill points, troops, cp and periodic chests', () => {
  const hold = { xp: 0, level: 1, troops: 100, skillPoints: 0, cp: 0, chests: {} };
  const need = xpForLevel(1) + xpForLevel(2) + xpForLevel(3);
  const gained = applyXp(hold, need);
  assert.equal(hold.level, 4);
  assert.equal(gained.levels, 3);
  assert.ok(hold.skillPoints >= 3);
  assert.ok(hold.troops > 100);
  assert.ok(hold.cp > 0);
  assert.ok((hold.chests.iron || 0) >= 1); // level 3 grants a chest
});

test('resolveBattle: a much stronger attacker wins, loots (bounded), earns CP', () => {
  const out = resolveBattle(
    { troops: 500, assaultMult: 1.5 },
    { troops: 100, bulwarkMult: 1.0, material: 4000 },
    123,
  );
  assert.equal(out.attackerWins, true);
  assert.ok(out.loot > 0 && out.loot <= 1500);
  assert.ok(out.cpAttacker > 0);
  assert.ok(out.defenderLosses >= out.attackerLosses);
  assert.ok(out.attackerWounded <= out.attackerLosses);
  assert.ok(out.defenderWounded <= out.defenderLosses);
});

test('resolveBattle: a weak attacker loses and the defender earns CP', () => {
  const out = resolveBattle(
    { troops: 50, assaultMult: 1.0 },
    { troops: 400, bulwarkMult: 1.2, material: 1000 },
    9,
  );
  assert.equal(out.attackerWins, false);
  assert.equal(out.loot, 0);
  assert.ok(out.cpDefender > 0);
});

test('seededFactor is deterministic and within [0.9,1.1]', () => {
  assert.equal(seededFactor(42), seededFactor(42));
  for (const s of [0, 1, 99, 100000]) {
    const f = seededFactor(s);
    assert.ok(f >= 0.9 && f <= 1.1);
  }
});

test('royal chest never yields wood; wood chest never yields royal', () => {
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    assert.notEqual(rollTier('royal', () => r), 'wood');
    assert.notEqual(rollTier('wood', () => r), 'royal');
  }
  const piece = rollGear('gold', seq([0.99, 0.0]));
  assert.ok(['wood', 'iron', 'gold', 'royal'].includes(piece.tier));
  assert.ok(['assault', 'bulwark', 'harvest', 'march'].includes(piece.stance));
});

test('chooseStance follows Durgan priority (offense-first)', () => {
  const base = () => ({ marches: [], activeStance: 'harvest' });
  assert.equal(loadout.chooseStance(base()), 'harvest');
  let h = base(); h.marches = [{ kind: 'return', status: 'outbound', arriveAt: new Date(Date.now() + 1e6) }];
  assert.equal(loadout.chooseStance(h), 'march');
  h = base(); h.incomingAt = new Date(Date.now() + 1e6);
  assert.equal(loadout.chooseStance(h), 'bulwark');
  h = base(); h.incomingAt = new Date(Date.now() + 1e6);
  h.marches = [{ kind: 'attack', status: 'outbound', arriveAt: new Date(Date.now() + 1e6) }];
  assert.equal(loadout.chooseStance(h), 'assault'); // under attack but attacking -> assault
});

test('effectivePower scales troops by gear + skill bonuses', () => {
  const hold = {
    troops: 100,
    inventory: [{ id: 'g1', stance: 'assault', tier: 'gold' }],
    loadouts: { assault: ['g1'], bulwark: [], harvest: [], march: [] },
    skills: { assault: 2 },
  };
  // 1 + gold(0.14) + 2*0.04 = 1.22
  assert.ok(Math.abs(loadout.effectivePower(hold, 'assault') - 122) < 0.001);
});

test('settleHold accrues harvest lazily from timestamps (no ticking)', () => {
  const start = 1_000_000_000_000;
  const hold = {
    troops: 100, wounded: 0, level: 1, activeStance: 'harvest', autoLoadout: false,
    skills: {}, inventory: [], loadouts: { assault: [], bulwark: [], harvest: [], march: [] },
    marches: [], commanders: {},
    material: { type: 'ironwood', amount: 0, rate: HARVEST.ratePerHour, lastHarvestAt: new Date(start) },
  };
  settleHold(hold, start + 3600 * 1000); // one hour later
  assert.ok(Math.abs(hold.material.amount - HARVEST.ratePerHour) < 1);
  assert.ok(hold.material.amount <= HARVEST.cap);
});

test('settleHold heals wounded once the infirmary timer elapses', () => {
  const t = 2_000_000_000_000;
  const hold = {
    troops: 80, wounded: 20, woundedHealAt: new Date(t - 1000), activeStance: 'harvest',
    autoLoadout: false, skills: {}, inventory: [], loadouts: {}, marches: [], commanders: {},
    material: { type: 'skysteel', amount: 0, rate: 0, lastHarvestAt: new Date(t) },
  };
  settleHold(hold, t);
  assert.equal(hold.troops, 100);
  assert.equal(hold.wounded, 0);
});
