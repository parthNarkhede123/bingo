'use strict';

require('dotenv').config();

/**
 * Central configuration. Every value is read from the environment with a safe
 * default for local development. Secrets (JWT_SECRET) MUST be provided — the
 * server fails closed (refuses to boot) with a missing/weak secret in EVERY
 * environment, not only production. See assertProductionSafety() below.
 */
const env = (process.env.NODE_ENV || 'development').trim().toLowerCase();

function intEnv(name, def) {
  const n = parseInt(process.env[name] || String(def), 10);
  return Number.isFinite(n) ? n : def;
}

const config = {
  env,
  port: intEnv('PORT', 4000),

  // Comma-separated list of allowed browser origins for CORS + Socket.IO.
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ironhold',

  jwt: {
    // No baked-in fallback. A weak/missing value is caught by
    // assertProductionSafety() at boot and either replaced with an ephemeral
    // per-process secret (explicit local dev) or refused (everything else).
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '2d',
    // Lock verification to the single algorithm we sign with, so a token cannot
    // be smuggled in under a different alg (e.g. 'none' or an RS/HS confusion).
    algorithms: ['HS256'],
  },

  bcryptRounds: intEnv('BCRYPT_ROUNDS', 12),

  // Base URL of the FRONTEND, used to build links inside emails (password
  // reset). Falls back to the first configured CORS origin, which in prod is
  // already the deployed site.
  appUrl:
    process.env.APP_URL ||
    (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim(),

  // Transactional email (password reset). When smtpHost is empty the app runs
  // WITHOUT sending mail: reset requests still succeed uniformly (no account
  // enumeration) but nothing is delivered. Configure these in prod to enable.
  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: intEnv('SMTP_PORT', 587),
    smtpSecure: (process.env.SMTP_SECURE || '0') === '1', // true only for port 465
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Ironhold <no-reply@ironhold.local>',
  },

  passwordReset: {
    // How long a reset link is valid, in ms (default 1 hour). Single-use.
    ttlMs: intEnv('RESET_TTL_MS', 60 * 60 * 1000),
    // Per-account resend cooldown (default 5 min): suppress a fresh reset email
    // if one was issued within this window. Blunts victim inbox-bombing
    // (usernames are public) without adding an enumeration oracle.
    resendCooldownMs: intEnv('RESET_RESEND_COOLDOWN_MS', 5 * 60 * 1000),
  },

  ironhold: {
    // A season is one week (the "Siege Week"). Tunable for testing.
    seasonDays: intEnv('SEASON_DAYS', 7),
    // Grace at boot: if no active season exists, one is created automatically.
    autoStartSeason: (process.env.AUTO_START_SEASON || '1') !== '0',
    // How often the background sweeper resolves due marches, spawns/expires
    // wild mines, and checks for the season bell (ms).
    sweepIntervalMs: intEnv('SWEEP_INTERVAL_MS', 20000),
    // Target number of live wild mines on the map at once.
    mineTarget: intEnv('MINE_TARGET', 12),
    mineTtlMs: intEnv('MINE_TTL_MS', 30 * 60 * 1000),
  },

  socket: {
    // Per-IP handshake rate limit (connections per window) applied BEFORE the
    // DB lookup, to blunt connection-flood / reconnect-churn abuse.
    handshakeWindowMs: intEnv('SOCKET_HS_WINDOW_MS', 60000),
    handshakeMaxPerIp: intEnv('SOCKET_HS_MAX_PER_IP', 60),
    // Global ceiling on concurrent authenticated sockets (memory backstop).
    maxConnections: intEnv('SOCKET_MAX_CONNECTIONS', 20000),
  },

  rateLimit: {
    windowMs: intEnv('RATE_WINDOW_MS', 60000),
    maxRequests: intEnv('RATE_MAX', 100),
    authMaxRequests: intEnv('AUTH_RATE_MAX', 10),
  },

  security: {
    // Number of proxies in front of us (Render/Railway/Fly = 1). Set to 0 when
    // running with no proxy so req.ip cannot be spoofed via X-Forwarded-For.
    trustProxy: intEnv('TRUST_PROXY', 1),
  },
};

const DEV_ENVS = new Set(['development', 'test']);

/**
 * Fail closed on secrets. Runs at boot (src/index.js). A strong JWT_SECRET is
 * required in every environment. For local dev/test ONLY, an operator may set
 * ALLOW_INSECURE_JWT=1 to run with an ephemeral secret generated fresh for this
 * process (never a source-visible constant).
 */
function assertProductionSafety() {
  const secret = config.jwt.secret;
  const strong = typeof secret === 'string' && secret.length >= 32;
  if (strong) return;

  const devOptIn = DEV_ENVS.has(config.env) && process.env.ALLOW_INSECURE_JWT === '1';
  if (!devOptIn) {
    throw new Error(
      'FATAL: JWT_SECRET must be set to a strong random value (>=32 chars) in ' +
      'every environment. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\". " +
      'For local dev only, set ALLOW_INSECURE_JWT=1 to use an ephemeral secret.'
    );
  }
  config.jwt.secret = require('crypto').randomBytes(48).toString('hex');
}

module.exports = { config, assertProductionSafety };
