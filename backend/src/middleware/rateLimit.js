'use strict';

const rateLimit = require('express-rate-limit');
const { config } = require('../config');

/**
 * General API limiter and a stricter limiter for auth endpoints (to slow down
 * credential-stuffing / brute-force). Keyed by IP.
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, try again later.' },
});

module.exports = { apiLimiter, authLimiter };
