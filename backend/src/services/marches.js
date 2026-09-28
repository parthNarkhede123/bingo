'use strict';

const crypto = require('crypto');
const Hold = require('../models/Hold');
const Report = require('../models/Report');
const Mine = require('../models/Mine');
const Pact = require('../models/Pact');
const { distanceTiles } = require('../game/biome');
const { settleHold } = require('../game/resolver');
const { stanceMultiplier, effectivePower, gearBonus, skillBonus } = require('../game/loadout');
const { resolveBattle } = require('../game/combat');
const { MAP, COMBAT, CP, CAPS } = require('../game/constants');
const { notify } = require('../realtime');

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

/** Travel time (ms) for a march of `dist` tiles, reduced by march gear + skill. */
function travelMs(hold, dist) {
  const reduction = Math.min(0.6, gearBonus(hold, 'march') + skillBonus(hold, 'march'));
  return Math.round(dist * MAP.marchSecondsPerTile * 1000 * (1 - reduction));
}

async function addReport(userId, season, kind, title, payload) {
  await Report.create({ userId, season, kind, title, payload });
  // Trim to the cap so the collection stays tiny (TTL also expires old ones).
  const excess = await Report.countDocuments({ userId, season });
  if (excess > CAPS.reports) {
    const old = await Report.find({ userId, season }).sort({ createdAt: 1 }).limit(excess - CAPS.reports).select('_id').lean();
    if (old.length) await Report.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
  notify(userId, 'report:new', { kind, title });
}

/**
 * Launch a march from `hold`. intent ∈ attack|scout|mine. Mutates & saves the
 * hold (troops committed, march pushed) and, for attacks, the target's incoming
 * marker. Returns { march } or throws { status, message } for the route layer.
 */
async function launchMarch(hold, { intent, targetCoords, troops }, now) {
  now = now || Date.now();
  if (!['attack', 'scout', 'mine'].includes(intent)) throw { status: 400, message: 'Unknown march intent.' };
  if (!targetCoords || typeof targetCoords.x !== 'number' || typeof targetCoords.y !== 'number') {
    throw { status: 400, message: 'Target coordinates required.' };
  }
  if ((hold.marches || []).filter((m) => m.status === 'outbound').length >= CAPS.marches) {
    throw { status: 429, message: 'Too many armies already in the field.' };
  }
  const dist = distanceTiles(hold.coords, targetCoords);
  const arriveAt = new Date(now + Math.max(3000, travelMs(hold, dist)));
  const march = { id: newId(), kind: intent, targetCoords, departAt: new Date(now), arriveAt, status: 'outbound', troops: 0, loot: { amount: 0, foreign: {} } };

  if (intent === 'attack') {
    const send = Math.floor(troops);
    if (!Number.isFinite(send) || send < 1) throw { status: 400, message: 'Send at least 1 troop.' };
    if (send > hold.troops) throw { status: 400, message: 'Not enough troops.' };
    const target = await Hold.findOne({ season: hold.season, 'coords.x': targetCoords.x, 'coords.y': targetCoords.y });
    if (!target) throw { status: 404, message: 'No Hold at those coordinates.' };
    if (String(target.userId) === String(hold.userId)) throw { status: 400, message: 'You cannot attack yourself.' };
    const pact = await Pact.findOne({
      season: hold.season,
      $or: [{ a: hold.userId, b: target.userId }, { a: target.userId, b: hold.userId }],
    });
    if (pact) throw { status: 403, message: 'A non-aggression pact protects that lord.' };
    hold.troops -= send;
    march.troops = send;
    march.targetUserId = target.userId;
    march.assaultMult = stanceMultiplier(hold, 'assault', now);
    // Warn the defender (Durgan uses this to swap to Bulwark).
    if (!target.incomingAt || new Date(target.incomingAt).getTime() > arriveAt.getTime()) {
      target.incomingAt = arriveAt;
      await target.save();
      notify(target.userId, 'attack:incoming', { arriveAt });
    }
  } else if (intent === 'scout') {
    const target = await Hold.findOne({ season: hold.season, 'coords.x': targetCoords.x, 'coords.y': targetCoords.y });
    if (!target) throw { status: 404, message: 'No Hold at those coordinates.' };
    march.targetUserId = target.userId;
    march.troops = 0; // Wren rides alone
  } else if (intent === 'mine') {
    const mine = await Mine.findOne({ season: hold.season, 'coords.x': targetCoords.x, 'coords.y': targetCoords.y, claimedBy: null });
    if (!mine) throw { status: 404, message: 'No unclaimed mine there.' };
    const send = Math.max(1, Math.floor(troops || 1));
    if (send > hold.troops) throw { status: 400, message: 'Not enough troops.' };
    hold.troops -= send;
    march.troops = send;
  }

  hold.marches.push(march);
  await hold.save();
  return { march };
}

/** Deterministic combat seed from a march's identity (id + departure time). */
function seedFromMarch(m) {
  const key = String(m.id) + ':' + new Date(m.departAt).getTime();
  return parseInt(crypto.createHash('md5').update(key).digest('hex').slice(0, 8), 16);
}

/** Queue survivors (and any loot) to march back home. */
function pushReturn(hold, troops, loot, from, now) {
  if (troops <= 0 && (!loot || (!loot.amount && !Object.keys(loot.foreign || {}).length))) return;
  const dist = distanceTiles(hold.coords, from);
  hold.marches.push({
    id: newId(), kind: 'return', targetCoords: hold.coords, troops,
    loot: loot || { amount: 0, foreign: {} },
    departAt: new Date(now), arriveAt: new Date(now + Math.max(3000, travelMs(hold, dist))), status: 'outbound',
  });
}

async function resolveAttack(attacker, march, now) {
  const defender = await Hold.findOne({ season: attacker.season, userId: march.targetUserId });
  march.status = 'done';
  if (!defender) { pushReturn(attacker, march.troops, null, march.targetCoords, now); return; }

  settleHold(defender, now);
  const out = resolveBattle(
    { troops: march.troops, assaultMult: march.assaultMult || 1 },
    { troops: defender.troops, bulwarkMult: stanceMultiplier(defender, 'bulwark', now), material: defender.material.amount },
    seedFromMarch(march)
  );

  const defLoss = Math.min(defender.troops, out.defenderLosses);
  defender.troops -= defLoss;
  const defWound = Math.min(defLoss, out.defenderWounded);
  defender.wounded = (defender.wounded || 0) + defWound;
  if (defWound > 0) defender.woundedHealAt = new Date(now + COMBAT.woundedHealMs);

  let looted = 0;
  if (out.attackerWins) {
    looted = Math.min(Math.floor(defender.material.amount || 0), out.loot);
    defender.material.amount -= looted;
  }
  defender.cp = (defender.cp || 0) + out.cpDefender;
  defender.incomingAt = null;
  await defender.save();

  attacker.cp = (attacker.cp || 0) + out.cpAttacker;
  const survivors = Math.max(0, march.troops - out.attackerLosses);
  const loot = looted > 0 ? { amount: 0, foreign: { [defender.material.type]: looted } } : { amount: 0, foreign: {} };
  pushReturn(attacker, survivors, loot, march.targetCoords, now);

  await addReport(defender.userId, defender.season, 'battle',
    `${attacker.username} raided your Hold`,
    { attacker: attacker.username, outcome: out.attackerWins ? 'breached' : 'repelled', troopsLost: defLoss, looted });
  await addReport(attacker.userId, attacker.season, 'battle',
    `Your raid on ${defender.username}`,
    { defender: defender.username, outcome: out.attackerWins ? 'victory' : 'defeat', troopsLost: out.attackerLosses, survivors, looted });
  notify(defender.userId, 'march:resolved', { kind: 'defended' });
  notify(attacker.userId, 'march:resolved', { kind: 'attack' });
}

async function resolveScout(scout, march, now) {
  march.status = 'done';
  const target = await Hold.findOne({ season: scout.season, userId: march.targetUserId });
  if (!target) { await addReport(scout.userId, scout.season, 'scout', 'Scout found an empty Hold', {}); return; }
  settleHold(target, now);
  await target.save();
  await addReport(scout.userId, scout.season, 'scout', `Wren scouted ${target.username}`, {
    username: target.username,
    troops: target.troops,
    activeStance: target.activeStance,
    defense: Math.round(effectivePower(target, 'bulwark', now)),
    material: target.material.type,
    coords: target.coords,
  });
  notify(scout.userId, 'march:resolved', { kind: 'scout' });
}

async function resolveMine(hold, march, now) {
  march.status = 'done';
  pushReturn(hold, march.troops, null, march.targetCoords, now);
  const mine = await Mine.findOneAndUpdate(
    { season: hold.season, 'coords.x': march.targetCoords.x, 'coords.y': march.targetCoords.y, claimedBy: null },
    { $set: { claimedBy: hold.userId } },
    { new: true }
  );
  if (!mine) { await addReport(hold.userId, hold.season, 'system', 'The mine was already claimed', {}); return; }
  if (mine.kind === 'gem') {
    hold.gems = (hold.gems || 0) + mine.amount;
  } else {
    const cur = hold.foreignMaterials.get(mine.material) || 0;
    hold.foreignMaterials.set(mine.material, cur + mine.amount);
  }
  hold.cp = (hold.cp || 0) + CP.mine;
  await addReport(hold.userId, hold.season, 'system', `Captured a ${mine.kind} mine`, { kind: mine.kind, amount: mine.amount, material: mine.material });
  await Mine.deleteOne({ _id: mine._id });
}

/** Resolve THIS hold's own due outbound marches (needs other players' docs). */
async function resolveHoldMarches(hold, now) {
  now = now || Date.now();
  for (const m of hold.marches || []) {
    if (m.status !== 'outbound' || new Date(m.arriveAt).getTime() > now) continue;
    if (m.kind === 'attack') await resolveAttack(hold, m, now);
    else if (m.kind === 'scout') await resolveScout(hold, m, now);
    else if (m.kind === 'mine') await resolveMine(hold, m, now);
  }
  hold.marches = (hold.marches || []).filter((m) => m.status !== 'done');
}

/**
 * Background sweep: resolve due attack/scout/mine marches for EVERY hold (so a
 * raid lands even while the victim is offline). Touches only holds with a due
 * timer, not the whole collection.
 */
async function resolveDueMarches(now) {
  now = now || Date.now();
  const holds = await Hold.find({
    marches: { $elemMatch: { status: 'outbound', arriveAt: { $lte: new Date(now) }, kind: { $in: ['attack', 'scout', 'mine'] } } },
  });
  for (const hold of holds) {
    settleHold(hold, now);
    await resolveHoldMarches(hold, now);
    await hold.save();
  }
  return holds.length;
}

module.exports = { launchMarch, travelMs, addReport, newId, resolveHoldMarches, resolveDueMarches };
