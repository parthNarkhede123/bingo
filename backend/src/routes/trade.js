'use strict';

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { gameContext } = require('../middleware/gameContext');
const { serializeHold } = require('../services/hold');
const { settleHold } = require('../game/resolver');
const Offer = require('../models/Offer');
const Pact = require('../models/Pact');
const Hold = require('../models/Hold');
const User = require('../models/User');
const { MATERIALS, HARVEST, CP, CAPS } = require('../game/constants');

const router = express.Router();
// Auth + game context are applied PER-ROUTE (not via router.use) so that an
// unmatched path falls through to the 404 handler instead of 401ing here.
const guard = [requireAuth, gameContext];

const bad = (res, e) => res.status(400).json({ error: e.array()[0].msg });

// --- material bucket helpers (own material vs foreign) ---
function balance(hold, material) {
  return material === hold.material.type ? hold.material.amount : (hold.foreignMaterials.get(material) || 0);
}
function credit(hold, material, qty) {
  if (material === hold.material.type) hold.material.amount = Math.min(HARVEST.cap, hold.material.amount + qty);
  else hold.foreignMaterials.set(material, (hold.foreignMaterials.get(material) || 0) + qty);
}
function debit(hold, material, qty) {
  if (material === hold.material.type) hold.material.amount -= qty;
  else hold.foreignMaterials.set(material, (hold.foreignMaterials.get(material) || 0) - qty);
}

// GET /api/trade/offers — open offers I can accept (public + addressed to me).
router.get('/offers', ...guard,
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    try {
      const limit = req.query.limit || 50;
      const offers = await Offer.find({ season: req.season.number, $or: [{ toUserId: null }, { toUserId: req.userId }] })
        .sort({ createdAt: -1 }).limit(limit).lean();
      return res.json({ offers });
    } catch (err) { return next(err); }
  });

// POST /api/trade/offers — post an offer; the give side is escrowed immediately.
router.post('/offers', ...guard,
  [
    body('giveMaterial').isIn(MATERIALS), body('giveQty').isInt({ min: 1 }).toInt(),
    body('wantMaterial').isIn(MATERIALS), body('wantQty').isInt({ min: 1 }).toInt(),
    body('toUsername').optional().isString().trim(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    const { giveMaterial, giveQty, wantMaterial, wantQty } = req.body;
    if (giveMaterial === wantMaterial) return res.status(400).json({ error: 'Trade two different materials.' });
    const open = await Offer.countDocuments({ fromUserId: req.userId, season: req.season.number });
    if (open >= CAPS.openOffers) return res.status(429).json({ error: 'Too many open offers.' });
    if (balance(hold, giveMaterial) < giveQty) return res.status(400).json({ error: 'You do not hold enough to offer.' });

    let toUserId = null;
    if (req.body.toUsername) {
      const target = await User.findOne({ usernameLower: req.body.toUsername.toLowerCase() }).lean();
      if (!target) return res.status(404).json({ error: 'Target player not found.' });
      toUserId = target._id;
    }
    debit(hold, giveMaterial, giveQty); // escrow
    try {
      await hold.save();
      const offer = await Offer.create({
        fromUserId: req.userId, fromUsername: req.gameUser.username, season: req.season.number,
        giveMaterial, giveQty, wantMaterial, wantQty, toUserId,
      });
      return res.json({ offer, hold: serializeHold(hold) });
    } catch (err) { return next(err); }
  });

// POST /api/trade/offers/:id/cancel — poster reclaims the escrow.
router.post('/offers/:id/cancel', ...guard, async (req, res, next) => {
  try {
    const offer = await Offer.findOne({ _id: req.params.id, fromUserId: req.userId });
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    credit(req.hold, offer.giveMaterial, offer.giveQty); // refund escrow
    await req.hold.save();
    await Offer.deleteOne({ _id: offer._id });
    return res.json({ hold: serializeHold(req.hold) });
  } catch (err) { return next(err); }
});

// POST /api/trade/offers/:id/accept — pay the want side, receive the escrowed give side.
router.post('/offers/:id/accept', ...guard, async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer || offer.season !== req.season.number) return res.status(404).json({ error: 'Offer not found.' });
    if (String(offer.fromUserId) === String(req.userId)) return res.status(400).json({ error: 'You cannot accept your own offer.' });
    if (offer.toUserId && String(offer.toUserId) !== String(req.userId)) return res.status(403).json({ error: 'This offer is not for you.' });
    const acceptor = req.hold;
    if (balance(acceptor, offer.wantMaterial) < offer.wantQty) return res.status(400).json({ error: 'You lack what the offer wants.' });

    const poster = await Hold.findOne({ season: req.season.number, userId: offer.fromUserId });
    if (!poster) return res.status(410).json({ error: 'The poster is no longer in this season.' });
    settleHold(poster, Date.now());

    // Acceptor pays want, receives give (already escrowed from poster).
    debit(acceptor, offer.wantMaterial, offer.wantQty);
    credit(acceptor, offer.giveMaterial, offer.giveQty);
    // Poster receives want.
    credit(poster, offer.wantMaterial, offer.wantQty);
    acceptor.cp += CP.trade; poster.cp += CP.trade;

    await poster.save();
    await acceptor.save();
    await Offer.deleteOne({ _id: offer._id });
    require('../realtime').notify(offer.fromUserId, 'trade:accepted', { by: req.gameUser.username });
    return res.json({ hold: serializeHold(acceptor) });
  } catch (err) { return next(err); }
});

// --- Pacts (light non-aggression) ---
// GET /api/pacts
router.get('/pacts', ...guard, async (req, res, next) => {
  try {
    const pacts = await Pact.find({ season: req.season.number, $or: [{ a: req.userId }, { b: req.userId }] }).lean();
    // Attach the counterpart's username so the client can name each pact.
    const otherIds = pacts.map((p) => (String(p.a) === String(req.userId) ? p.b : p.a));
    const users = await User.find({ _id: { $in: otherIds } }).select('username').lean();
    const nameById = Object.fromEntries(users.map((u) => [String(u._id), u.username]));
    const enriched = pacts.map((p) => {
      const otherId = String(p.a) === String(req.userId) ? p.b : p.a;
      return { ...p, with: nameById[String(otherId)] || 'Unknown lord' };
    });
    return res.json({ pacts: enriched });
  } catch (err) { return next(err); }
});

// POST /api/pacts { targetUsername }
router.post('/pacts', ...guard,
  [body('targetUsername').isString().trim().isLength({ min: 3, max: 20 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    try {
      const target = await User.findOne({ usernameLower: req.body.targetUsername.toLowerCase() }).lean();
      if (!target) return res.status(404).json({ error: 'Player not found.' });
      if (String(target._id) === String(req.userId)) return res.status(400).json({ error: 'You cannot pact with yourself.' });
      const exists = await Pact.findOne({
        season: req.season.number,
        $or: [{ a: req.userId, b: target._id }, { a: target._id, b: req.userId }],
      });
      if (exists) return res.status(409).json({ error: 'A pact already exists.' });
      const pact = await Pact.create({ season: req.season.number, a: req.userId, b: target._id, expiresAt: req.season.endsAt });
      require('../realtime').notify(target._id, 'report:new', { kind: 'system', title: `${req.gameUser.username} proposes a pact` });
      return res.json({ pact });
    } catch (err) { return next(err); }
  });

// POST /api/pacts/:id/break
router.post('/pacts/:id/break', ...guard,
  [param('id').isMongoId()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    try {
      const pact = await Pact.findOne({ _id: req.params.id, $or: [{ a: req.userId }, { b: req.userId }] });
      if (!pact) return res.status(404).json({ error: 'Pact not found.' });
      await Pact.deleteOne({ _id: pact._id });
      return res.json({ ok: true });
    } catch (err) { return next(err); }
  });

module.exports = router;
