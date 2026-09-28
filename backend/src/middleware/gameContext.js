'use strict';

const User = require('../models/User');
const { ensureSeason } = require('../services/season');
const { getHold } = require('../services/hold');

/**
 * Populate req.gameUser, req.season and req.hold (a live, settled Hold document)
 * for game routes. Runs AFTER requireAuth. All game routes act only on the
 * authenticated actor's own Hold.
 */
async function gameContext(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    const season = await ensureSeason();
    if (!season) return res.status(503).json({ error: 'No active season right now.' });
    req.gameUser = user;
    req.season = season;
    req.hold = await getHold(user, season);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { gameContext };
