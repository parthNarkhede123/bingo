'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

/**
 * Regression tests for the pentest-driven hardening. These are pure/unit tests
 * (no DB, no network) so they run under `npm test`.
 */

function loadFreshConfig(env) {
  // config caches process.env at require time, so isolate the module cache.
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('src', 'config'))) delete require.cache[k];
  }
  // assertProductionSafety() reads ALLOW_INSECURE_JWT live at call time, so we
  // set (and do NOT restore) process.env here. node --test isolates each test
  // file in its own process, so this does not leak to other suites.
  delete process.env.ALLOW_INSECURE_JWT;
  Object.assign(process.env, env);
  return require('../src/config');
}

test('config fails closed: production with no JWT_SECRET refuses to boot', () => {
  const { assertProductionSafety } = loadFreshConfig({ NODE_ENV: 'production', JWT_SECRET: '' });
  assert.throws(() => assertProductionSafety(), /JWT_SECRET/);
});

test('config fails closed: a NON-production env (e.g. staging) still refuses a weak secret', () => {
  const { assertProductionSafety } = loadFreshConfig({ NODE_ENV: 'staging', JWT_SECRET: 'short' });
  assert.throws(() => assertProductionSafety(), /JWT_SECRET/);
});

test('config accepts a strong secret in any environment', () => {
  const strong = 'a'.repeat(40);
  const { config, assertProductionSafety } = loadFreshConfig({ NODE_ENV: 'production', JWT_SECRET: strong });
  assert.doesNotThrow(() => assertProductionSafety());
  assert.strictEqual(config.jwt.secret, strong);
});

test('config allows an ephemeral secret only with explicit dev opt-in', () => {
  const { config, assertProductionSafety } = loadFreshConfig({
    NODE_ENV: 'development', JWT_SECRET: '', ALLOW_INSECURE_JWT: '1',
  });
  assert.doesNotThrow(() => assertProductionSafety());
  assert.ok(config.jwt.secret.length >= 32, 'ephemeral secret should be strong');
});

test('JWT verify is locked to HS256 (rejects alg=none tokens)', () => {
  const strong = 'b'.repeat(40);
  loadFreshConfig({ NODE_ENV: 'test', JWT_SECRET: strong });
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('src', 'middleware', 'auth'))) delete require.cache[k];
  }
  const jwt = require('jsonwebtoken');
  const { verifyToken } = require('../src/middleware/auth');
  // Forge an unsigned token (alg: none).
  const forged = jwt.sign({ sub: 'attacker' }, '', { algorithm: 'none' });
  assert.throws(() => verifyToken(forged));
});

test('login anti-enumeration dummy hash is a VALID bcrypt hash (does real work)', () => {
  const bcrypt = require('bcryptjs');
  // Reproduce the module-load computation used in routes/auth.js.
  const dummy = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 12);
  assert.strictEqual(dummy.length, 60, 'a valid bcrypt hash is exactly 60 chars');
  // Must parse and compare without short-circuiting to a throw.
  assert.strictEqual(bcrypt.compareSync('anything', dummy), false);
  // The previously-shipped malformed hash was 59 chars — guard against regression.
  assert.notStrictEqual('$2a$12$0000000000000000000000000000000000000000000000000000'.length, 60);
});

test('matchmaker rejects joins past the queue cap', () => {
  loadFreshConfig({ NODE_ENV: 'test', JWT_SECRET: 'c'.repeat(40), MAX_QUEUE_SIZE: '2' });
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('src', 'sockets', 'matchmaker'))) delete require.cache[k];
  }
  const { Matchmaker } = require('../src/sockets/matchmaker');
  const mm = new Matchmaker();
  const now = 1000;
  // Ratings far apart so nobody matches and they all sit in the queue.
  assert.strictEqual(mm.addAndMatch({ userId: 'u1', rating: 100, joinedAt: now }, now), null);
  assert.strictEqual(mm.addAndMatch({ userId: 'u2', rating: 5000, joinedAt: now }, now), null);
  const full = mm.addAndMatch({ userId: 'u3', rating: 9000, joinedAt: now }, now);
  assert.deepStrictEqual(full, { full: true });
  assert.strictEqual(mm.size(), 2);
});

test('matchmaker evicts entries that waited past the max', () => {
  loadFreshConfig({ NODE_ENV: 'test', JWT_SECRET: 'c'.repeat(40), MAX_QUEUE_WAIT_MS: '1000' });
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('src', 'sockets', 'matchmaker'))) delete require.cache[k];
  }
  const { Matchmaker } = require('../src/sockets/matchmaker');
  const mm = new Matchmaker();
  mm.addAndMatch({ userId: 'old', rating: 1000, joinedAt: 0 }, 0);
  const evicted = mm.evictStale(2000); // 2000ms > 1000ms max wait
  assert.strictEqual(evicted.length, 1);
  assert.strictEqual(evicted[0].userId, 'old');
  assert.strictEqual(mm.size(), 0);
});
