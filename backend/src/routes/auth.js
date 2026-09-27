'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const crypto = require('crypto');
const { config } = require('../config');

const router = express.Router();

// Precomputed VALID bcrypt hash (random input, configured cost). Compared
// against for unknown users so a login miss does the same key-stretching work
// as a real user, keeping response timing flat and defeating enumeration.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), config.bcryptRounds);

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Strip the submitted `value` (would echo the plaintext password); return
    // only field path + message.
    const safe = errors.array().map((e) => ({ path: e.path, msg: e.msg }));
    res.status(400).json({ error: safe[0].msg, details: safe });
    return false;
  }
  return true;
}

// POST /api/auth/register
router.post(
  '/register',
  authLimiter,
  [
    body('username')
      .isString().withMessage('Username is required.')
      .trim()
      .isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters.')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username may only contain letters, numbers, and underscores.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password')
      .isString()
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
      .isByteLength({ max: 72 }).withMessage('Password must be at most 72 bytes.'),
  ],
  async (req, res, next) => {
    if (!handleValidation(req, res)) return;
    try {
      const { username, email, password } = req.body;
      const usernameLower = username.toLowerCase();

      const exists = await User.findOne({
        $or: [{ usernameLower }, { email }],
      }).lean();
      if (exists) {
        return res.status(409).json({ error: 'Username or email already in use.' });
      }

      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      const user = await User.create({ username, usernameLower, email, passwordHash });

      const token = signToken(user._id);
      return res.status(201).json({ token, user: user.toPublicJSON() });
    } catch (err) {
      // Handle race on unique index
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'Username or email already in use.' });
      }
      return next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('identifier').isString().trim().notEmpty().withMessage('Username or email is required.'),
    body('password').isString().notEmpty().withMessage('Password is required.'),
  ],
  async (req, res, next) => {
    if (!handleValidation(req, res)) return;
    try {
      const { identifier, password } = req.body;
      const idLower = identifier.toLowerCase();
      const user = await User.findOne({
        $or: [{ usernameLower: idLower }, { email: idLower }],
      }).select('+passwordHash');

      // Constant-ish response to avoid user enumeration.
      if (!user) {
        // Compare against a valid hash so this path does the same work as a
        // real login (a malformed hash short-circuits and leaks timing).
        await bcrypt.compare(password, DUMMY_HASH);
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      user.lastSeen = new Date();
      await user.save();

      const token = signToken(user._id);
      return res.json({ token, user: user.toPublicJSON() });
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user: user.toPublicJSON() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
