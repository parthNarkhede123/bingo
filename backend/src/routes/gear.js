'use strict';

const crypto = require('crypto');
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { gameContext } = require('../middleware/gameContext');
const { serializeHold } = require('../services/hold');
const { recomputeRate } = require('../game/resolver');
const { rollGear } = require('../game/chests');
const { TIERS, TIER_POWER, LOADOUT_SLOTS, CRAFT_COST, CAPS, SKILLS, STANCES, MATERIALS } = require('../game/constants');

const router = express.Router();
// Auth + game context are applied PER-ROUTE (not via router.use) so that an
// unmatched path falls through to the 404 handler instead of 401ing here.
const guard = [requireAuth, gameContext];

const gid = () => crypto.randomBytes(6).toString('hex');
const scrapValue = (tier) => Math.round((TIER_POWER[tier] || 0) * 100);

// POST /api/chests/:grade/open — open a chest into a gear piece (auto-salvages if
// the inventory cap is hit, so document size stays bounded).
router.post('/chests/:grade/open', ...guard,
  [param('grade').isIn(TIERS)],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { hold } = req;
    const grade = req.params.grade;
    if ((hold.chests[grade] || 0) < 1) return res.status(400).json({ error: `No ${grade} chest to open.` });
    hold.chests[grade] -= 1;
    const chestLuck = (hold.skills.chestluck || 0) * SKILLS.chestluck.perRank;
    const piece = rollGear(grade, Math.random, chestLuck);
    let salvaged = false;
    if (hold.inventory.length >= CAPS.inventory) {
      hold.scrap += scrapValue(piece.tier); // overflow auto-salvages
      salvaged = true;
    } else {
      piece.id = gid();
      hold.inventory.push(piece);
    }
    try { await hold.save(); return res.json({ piece, salvaged, hold: serializeHold(hold) }); } catch (e) { return next(e); }
  });

// POST /api/gear/:id/equip — slot a piece into its stance's loadout.
router.post('/gear/:id/equip', ...guard, async (req, res, next) => {
  const { hold } = req;
  const piece = hold.inventory.find((g) => g.id === req.params.id);
  if (!piece) return res.status(404).json({ error: 'No such gear.' });
  const slot = hold.loadouts[piece.stance];
  if (slot.includes(piece.id)) return res.status(400).json({ error: 'Already equipped.' });
  if (slot.length >= LOADOUT_SLOTS) return res.status(400).json({ error: `${piece.stance} loadout is full.` });
  slot.push(piece.id);
  recomputeRate(hold);
  try { await hold.save(); return res.json({ hold: serializeHold(hold) }); } catch (e) { return next(e); }
});

// POST /api/gear/:id/salvage — scrap a piece for soft currency.
router.post('/gear/:id/salvage', ...guard, async (req, res, next) => {
  const { hold } = req;
  const idx = hold.inventory.findIndex((g) => g.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'No such gear.' });
  const [piece] = hold.inventory.splice(idx, 1);
  for (const s of STANCES) hold.loadouts[s] = hold.loadouts[s].filter((id) => id !== piece.id);
  hold.scrap += scrapValue(piece.tier);
  recomputeRate(hold);
  try { await hold.save(); return res.json({ scrap: hold.scrap, hold: serializeHold(hold) }); } catch (e) { return next(e); }
});

// POST /api/craft { tier, stance } — craft gear from your material + 2 foreign
// materials + scrap. Foreign requirement keeps trade mandatory.
router.post('/craft', ...guard,
  [body('tier').isIn(TIERS), body('stance').isIn(STANCES)],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { hold } = req;
    const { tier, stance } = req.body;
    const cost = CRAFT_COST[tier];
    if (hold.inventory.length >= CAPS.inventory) return res.status(400).json({ error: 'Inventory is full.' });
    if ((hold.material.amount || 0) < cost.mat) return res.status(400).json({ error: `Need ${cost.mat} of your material.` });
    if ((hold.scrap || 0) < cost.scrap) return res.status(400).json({ error: `Need ${cost.scrap} scrap.` });
    const FOREIGN_EACH = 40;
    const foreignHeld = MATERIALS.filter((m) => m !== hold.material.type && (hold.foreignMaterials.get(m) || 0) >= FOREIGN_EACH);
    if (foreignHeld.length < 2) return res.status(400).json({ error: `Need ${FOREIGN_EACH} each of 2 foreign materials — trade for them.` });
    hold.material.amount -= cost.mat;
    hold.scrap -= cost.scrap;
    for (const m of foreignHeld.slice(0, 2)) hold.foreignMaterials.set(m, hold.foreignMaterials.get(m) - FOREIGN_EACH);
    const piece = { id: gid(), stance, tier, power: TIER_POWER[tier] };
    hold.inventory.push(piece);
    try { await hold.save(); return res.json({ piece, hold: serializeHold(hold) }); } catch (e) { return next(e); }
  });

module.exports = router;
