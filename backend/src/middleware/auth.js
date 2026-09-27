'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');

/**
 * Sign a JWT for a user id. Kept short and audience-scoped.
 */
function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Verify a raw token string. Returns the decoded payload or throws.
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: config.jwt.algorithms });
}

/**
 * Express middleware: require a valid Bearer token. Attaches req.userId.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  try {
    const payload = verifyToken(parts[1]);
    req.userId = payload.sub;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { signToken, verifyToken, requireAuth };
