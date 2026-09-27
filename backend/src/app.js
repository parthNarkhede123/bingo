'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config');
const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const leaderboardRoutes = require('./routes/leaderboard');

/**
 * Build the Express app. Kept separate from the HTTP/Socket server so it can be
 * mounted in tests with supertest without opening a port.
 */
function createApp() {
  const app = express();

  // Number of proxies to trust for req.ip / rate-limiting. Render/Railway/Fly
  // put exactly one in front of us (default 1); set TRUST_PROXY=0 when running
  // with no proxy so clients cannot spoof X-Forwarded-For to evade limits.
  app.set('trust proxy', config.security.trustProxy);

  // Security headers. We serve only JSON + websockets, no inline HTML, so a
  // strict CSP is safe. crossOriginResourcePolicy relaxed for API use.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / server-to-server (no origin) and whitelisted origins.
        if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // Body size cap protects against payload-based DoS.
  app.use(express.json({ limit: '16kb' }));

  app.use('/api', apiLimiter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
