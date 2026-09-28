'use strict';

const express = require('express');
const { query, param, validationResult } = require('express-validator');
const User = require('../models/User');
const Hold = require('../models/Hold');
const { ensureSeason } = require('../services/season');

const router = express.Router();

// GET /api/leaderboard?limit=50 — current season, ranked by Conquest Points.
router.get(
  '/',
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const limit = req.query.limit || 50;
      const season = await ensureSeason();
      if (!season) return res.json({ leaderboard: [] });
      const holds = await Hold.find({ season: season.number })
        .sort({ cp: -1, level: -1 })
        .limit(limit)
        .select('username cp level troops')
        .lean();
      const leaderboard = holds.map((h, i) => ({
        rank: i + 1,
        username: h.username,
        cp: h.cp,
        level: h.level,
        troops: h.troops,
      }));
      return res.json({ season: season.number, endsAt: season.endsAt, leaderboard });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/leaderboard/player/:username — a player's standing this season.
router.get(
  '/player/:username',
  [param('username').isString().trim().isLength({ min: 3, max: 20 })
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Invalid username.')],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const user = await User.findOne({ usernameLower: req.params.username.toLowerCase() }).lean();
      if (!user) return res.status(404).json({ error: 'Player not found.' });
      const season = await ensureSeason();
      const hold = season ? await Hold.findOne({ userId: user._id, season: season.number }).lean() : null;
      const rank = hold ? (await Hold.countDocuments({ season: season.number, cp: { $gt: hold.cp } })) + 1 : null;
      return res.json({
        player: {
          username: user.username,
          crowns: user.stats?.crowns || 0,
          seasonsPlayed: user.stats?.seasonsPlayed || 0,
          cp: hold ? hold.cp : 0,
          level: hold ? hold.level : 0,
          rank,
          inSeason: !!hold,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
