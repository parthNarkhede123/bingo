'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { gameContext } = require('../middleware/gameContext');
const { serializeHold } = require('../services/hold');
const { recomputeRate } = require('../game/resolver');
const { applyXp } = require('../game/leveling');
const { commanderActive, chooseStance } = require('../game/loadout');
const { STANCES, SKILLS, CP, MATERIALS } = require('../game/constants');

const router = express.Router();
// Auth + game context are applied PER-ROUTE (not via router.use) so that an
// unmatched path falls through to the 404 handler instead of 401ing here.
const guard = [requireAuth, gameContext];

function bad(res, errors) {
  return res.status(400).json({ error: errors.array()[0].msg });
}

// GET /api/hold — my Hold, resources lazily computed.
router.get('/', ...guard, (req, res) => res.json({ hold: serializeHold(req.hold) }));

// POST /api/hold/harvest — passive harvest is already settled on read; this just
// returns the current state (kept for an explicit "collect" affordance).
router.post('/harvest', ...guard, (req, res) => res.json({ hold: serializeHold(req.hold) }));

// POST /api/hold/loadout { stance } — set the active stance (manual).
router.post('/loadout', ...guard,
  [body('stance').isIn(STANCES)],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    if (hold.autoLoadout && commanderActive(hold, 'durgan')) {
      return res.status(409).json({ error: 'Durgan is auto-managing your loadout. Turn it off first.' });
    }
    hold.activeStance = req.body.stance;
    recomputeRate(hold); // stance change can alter harvest rate
    return hold.save().then(() => res.json({ hold: serializeHold(hold) }));
  });

// POST /api/hold/auto-loadout { enabled } — toggle Durgan's auto-loadout.
router.post('/auto-loadout', ...guard,
  [body('enabled').isBoolean().toBoolean()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    if (req.body.enabled && !commanderActive(hold, 'durgan')) {
      return res.status(403).json({ error: 'You need Durgan Stonesworn (recruit or trial) for auto-loadout.' });
    }
    hold.autoLoadout = req.body.enabled;
    if (hold.autoLoadout) hold.activeStance = chooseStance(hold);
    recomputeRate(hold);
    try { await hold.save(); return res.json({ hold: serializeHold(hold) }); } catch (e) { return next(e); }
  });

// POST /api/hold/skill { skill } — spend a skill point to raise a skill rank.
router.post('/skill', ...guard,
  [body('skill').isIn(Object.keys(SKILLS))],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return bad(res, errors);
    const { hold } = req;
    const skill = req.body.skill;
    if ((hold.skillPoints || 0) < 1) return res.status(400).json({ error: 'No skill points to spend.' });
    if ((hold.skills[skill] || 0) >= SKILLS[skill].max) return res.status(400).json({ error: 'That skill is maxed.' });
    hold.skillPoints -= 1;
    hold.skills[skill] = (hold.skills[skill] || 0) + 1;
    recomputeRate(hold); // harvest/march ranks can change the rate
    try { await hold.save(); return res.json({ hold: serializeHold(hold) }); } catch (e) { return next(e); }
  });

// POST /api/hold/upgrade — spend your material + 2 DIFFERENT foreign materials +
// scrap to strengthen your Hold. Requires materials you cannot produce, so it
// applies constant trade pressure. Grants troops, XP and CP.
router.post('/upgrade', ...guard, async (req, res, next) => {
  const { hold } = req;
  const OWN_COST = 300;
  const FOREIGN_EACH = 100;
  const SCRAP_COST = 50;
  if ((hold.material.amount || 0) < OWN_COST) return res.status(400).json({ error: `Need ${OWN_COST} of your own material.` });
  if ((hold.scrap || 0) < SCRAP_COST) return res.status(400).json({ error: `Need ${SCRAP_COST} scrap.` });
  const foreignHeld = MATERIALS.filter((m) => m !== hold.material.type && (hold.foreignMaterials.get(m) || 0) >= FOREIGN_EACH);
  if (foreignHeld.length < 2) {
    return res.status(400).json({ error: `Need ${FOREIGN_EACH} each of at least 2 foreign materials — trade for them.` });
  }
  hold.material.amount -= OWN_COST;
  hold.scrap -= SCRAP_COST;
  for (const m of foreignHeld.slice(0, 2)) hold.foreignMaterials.set(m, hold.foreignMaterials.get(m) - FOREIGN_EACH);
  hold.troops += 50;
  hold.cp += CP.upgrade;
  const gained = applyXp(hold, 120);
  try {
    await hold.save();
    return res.json({ hold: serializeHold(hold), gained });
  } catch (e) { return next(e); }
});

module.exports = router;
