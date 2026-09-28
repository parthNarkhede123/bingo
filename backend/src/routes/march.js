'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { gameContext } = require('../middleware/gameContext');
const { serializeHold } = require('../services/hold');
const { launchMarch } = require('../services/marches');
const { commanderActive } = require('../game/loadout');
const Report = require('../models/Report');
const { CAPS } = require('../game/constants');

const router = express.Router();
// Auth + game context are applied PER-ROUTE (not via router.use) so that an
// unmatched path falls through to the 404 handler instead of 401ing here.
const guard = [requireAuth, gameContext];

const coord = (v) => v && typeof v.x === 'number' && typeof v.y === 'number';

function handleLaunchError(res, err, next) {
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  return next(err);
}

// POST /api/march { intent: attack|mine, target:{x,y}, troops }
router.post('/march', ...guard,
  [body('intent').isIn(['attack', 'mine']), body('target').custom(coord), body('troops').optional().isInt({ min: 1 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const { march } = await launchMarch(req.hold, { intent: req.body.intent, targetCoords: req.body.target, troops: req.body.troops }, Date.now());
      return res.json({ march, hold: serializeHold(req.hold) });
    } catch (err) { return handleLaunchError(res, err, next); }
  });

// POST /api/scout { target:{x,y} } — Wren recon. Free during trial; consumes a
// charge when Wren is owned.
router.post('/scout', ...guard,
  [body('target').custom(coord)],
  async (req, res, next) => {
    const { hold } = req;
    if (!commanderActive(hold, 'wren')) return res.status(403).json({ error: 'You need Wren Nightglass (recruit or trial) to scout.' });
    const wren = hold.commanders.wren;
    if (wren.owned) {
      if ((wren.charges || 0) < 1) return res.status(400).json({ error: 'No scout charges left. Recruit more with gems.' });
      wren.charges -= 1;
    }
    try {
      const { march } = await launchMarch(hold, { intent: 'scout', targetCoords: req.body.target }, Date.now());
      return res.json({ march, hold: serializeHold(hold) });
    } catch (err) { return handleLaunchError(res, err, next); }
  });

// GET /api/reports — recent reports (raids, scouts, trades). TTL + capped.
router.get('/reports', ...guard, async (req, res, next) => {
  try {
    const reports = await Report.find({ userId: req.userId, season: req.season.number })
      .sort({ createdAt: -1 })
      .limit(CAPS.reports)
      .lean();
    return res.json({ reports });
  } catch (err) { return next(err); }
});

module.exports = router;
