'use strict';

const express = require('express');
const { query, param, validationResult } = require('express-validator');
const User = require('../models/User');
const Match = require('../models/Match');

const router = express.Router();

// GET /api/leaderboard?limit=50
router.get(
  '/',
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const limit = req.query.limit || 50;
      const users = await User.find({ gamesPlayed: { $gt: 0 } })
        .sort({ rating: -1, wins: -1 })
        .limit(limit)
        .lean();
      const leaderboard = users.map((u, i) => ({
        rank: i + 1,
        username: u.username,
        rating: u.rating,
        wins: u.wins,
        losses: u.losses,
        draws: u.draws,
        gamesPlayed: u.gamesPlayed,
      }));
      return res.json({ leaderboard });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/leaderboard/player/:username
router.get(
  '/player/:username',
  [param('username').isString().trim().isLength({ min: 3, max: 20 })
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Invalid username.')],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
      const usernameLower = req.params.username.toLowerCase();
      const user = await User.findOne({ usernameLower }).lean();
      if (!user) return res.status(404).json({ error: 'Player not found.' });

      const rank = await User.countDocuments({ rating: { $gt: user.rating } });

      const recent = await Match.find({ 'players.userId': user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      const history = recent.map((m) => {
        const me = m.players.find((p) => p.userId && p.userId.toString() === user._id.toString());
        const opp = m.players.find((p) => !p.userId || p.userId.toString() !== user._id.toString());
        let outcome = 'draw';
        if (m.result === 'decided') {
          outcome = m.winner && m.winner.toString() === user._id.toString() ? 'win' : 'loss';
        }
        return {
          opponent: opp ? opp.username : 'Unknown',
          outcome,
          ratingDelta: me ? me.ratingDelta : 0,
          endedAt: m.endedAt,
        };
      });

      return res.json({
        player: {
          username: user.username,
          rating: user.rating,
          peakRating: user.peakRating,
          rank: rank + 1,
          wins: user.wins,
          losses: user.losses,
          draws: user.draws,
          gamesPlayed: user.gamesPlayed,
        },
        history,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
