'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { gameContext } = require('../middleware/gameContext');
const { serializeHold } = require('../services/hold');
const { applyXp } = require('../game/leveling');
const Hold = require('../models/Hold');
const Mine = require('../models/Mine');
const { COMMANDERS, AD, SKILLS, MAP } = require('../game/constants');

const router = express.Router();
// Auth + game context are applied PER-ROUTE (not via router.use) so that an
// unmatched path falls through to the 404 handler instead of 401ing here.
const guard = [requireAuth, gameContext];

const bad = (res, e) => res.status(400).json({ error: e.array()[0].msg });

// Small state-derived quest set (progress is checked against the Hold, so no
// separate progress writes are needed). Rewards granted once, on claim.
const QUESTS = [
  { id: 'settle', title: 'Work the Land', desc: 'Harvest 1000 of your material', check: (h) => (h.material.amount || 0) >= 1000, reward: { gems: 5, xp: 60 } },
  { id: 'ascend', title: 'Rise, Lord', desc: 'Reach level 3', check: (h) => h.level >= 3, reward: { chest: 'iron', cp: 15 } },
  { id: 'armory', title: 'Fill the Armory', desc: 'Equip 3 pieces of gear', check: (h) => ['assault', 'bulwark', 'harvest', 'march'].reduce((n, s) => n + h.loadouts[s].length, 0) >= 3, reward: { chest: 'gold' } },
  { id: 'legend', title: 'Win a Legend', desc: 'Recruit a commander', check: (h) => h.commanders.durgan.owned || h.commanders.wren.owned, reward: { gems: 15 } },
  { id: 'warlord', title: 'Amass an Army', desc: 'Field 300 troops', check: (h) => h.troops >= 300, reward: { chest: 'royal', cp: 30 } },
];

// POST /api/commanders/:name/recruit — spend gems to recruit a commander.
router.post('/commanders/:name/recruit', ...guard,
  [param('name').isIn(['durgan', 'wren'])],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    const name = req.params.name;
    const cost = COMMANDERS[name].cost;
    if (hold.commanders[name].owned) return res.status(400).json({ error: 'Already recruited.' });
    if ((hold.gems || 0) < cost) return res.status(400).json({ error: `Need ${cost} gems.` });
    hold.gems -= cost;
    hold.commanders[name].owned = true;
    if (name === 'wren') hold.commanders.wren.charges = (hold.commanders.wren.charges || 0) + COMMANDERS.wren.chargesOnRecruit;
    try { await hold.save(); return res.json({ hold: serializeHold(hold) }); } catch (e) { return next(e); }
  });

// POST /api/ads/reward — grant gems for a watched ad, cooldowned + daily-capped
// so gems can't be farmed by spamming the endpoint.
router.post('/ads/reward', ...guard, async (req, res, next) => {
  const { hold } = req;
  const now = Date.now();
  const ads = hold.ads || {};
  const windowStart = ads.windowStartAt ? new Date(ads.windowStartAt).getTime() : 0;
  // Reset the daily window if 24h has passed.
  if (!windowStart || now - windowStart >= 24 * 60 * 60 * 1000) {
    hold.ads.windowStartAt = new Date(now);
    hold.ads.count = 0;
  }
  if ((hold.ads.count || 0) >= AD.dailyCap) return res.status(429).json({ error: 'Daily ad reward cap reached.' });
  if (ads.lastAt && now - new Date(ads.lastAt).getTime() < AD.cooldownMs) {
    return res.status(429).json({ error: 'Ad reward on cooldown.' });
  }
  const bonus = (hold.skills.gemfind || 0) * SKILLS.gemfind.perRank;
  const reward = Math.round(AD.rewardGems * (1 + bonus));
  hold.gems += reward;
  hold.ads.count += 1;
  hold.ads.lastAt = new Date(now);
  try { await hold.save(); return res.json({ reward, gems: hold.gems, hold: serializeHold(hold) }); } catch (e) { return next(e); }
});

// GET /api/quests — quest list with done/claimed flags.
router.get('/quests', ...guard, (req, res) => {
  const { hold } = req;
  const list = QUESTS.map((q) => ({
    id: q.id, title: q.title, desc: q.desc, reward: q.reward,
    done: q.check(hold), claimed: (hold.quests.get(q.id) || 0) === 1,
  }));
  res.json({ quests: list });
});

// POST /api/quests/:id/claim
router.post('/quests/:id/claim', ...guard, async (req, res, next) => {
  const { hold } = req;
  const q = QUESTS.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'No such quest.' });
  if ((hold.quests.get(q.id) || 0) === 1) return res.status(400).json({ error: 'Already claimed.' });
  if (!q.check(hold)) return res.status(400).json({ error: 'Quest not complete.' });
  const r = q.reward;
  if (r.gems) hold.gems += r.gems;
  if (r.chest) hold.chests[r.chest] += 1;
  if (r.cp) hold.cp += r.cp;
  if (r.troops) hold.troops += r.troops;
  if (r.xp) applyXp(hold, r.xp);
  hold.quests.set(q.id, 1);
  try { await hold.save(); return res.json({ reward: r, hold: serializeHold(hold) }); } catch (e) { return next(e); }
});

// GET /api/map?radius= — nearby holds + mines (fog-of-war: positions + names +
// public biome material only; troop counts require a scout).
router.get('/map', ...guard,
  [query('radius').optional().isInt({ min: 1, max: 100 }).toInt()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    const r = req.query.radius || 40;
    const { x, y } = hold.coords;
    const box = { 'coords.x': { $gte: x - r, $lte: x + r }, 'coords.y': { $gte: y - r, $lte: y + r } };
    try {
      const [holds, mines] = await Promise.all([
        Hold.find({ season: req.season.number, ...box }).select('username coords material.type').limit(200).lean(),
        Mine.find({ season: req.season.number, claimedBy: null, ...box }).select('coords kind material amount').limit(200).lean(),
      ]);
      return res.json({
        center: hold.coords,
        holds: holds.map((h) => ({ username: h.username, coords: h.coords, material: h.material.type, you: String(h.username) === String(hold.username) })),
        mines,
      });
    } catch (err) { return next(err); }
  });

module.exports = router;
