'use strict';

const request = require('supertest');
const { startTestServer, stopTestServer } = require('./testServer');

let ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); });
const agent = () => request(ctx.baseUrl);

describe('security', () => {
  test('validation errors never reflect the submitted password', async () => {
    const secret = 'hunterTwoSecret7';
    const res = await agent().post('/api/auth/register').send({
      username: 'weakpw', email: 'weakpw@example.com', password: secret.slice(0, 4),
    });
    expect(res.status).toBe(400);
    // The plaintext password must not appear anywhere in the response body.
    expect(JSON.stringify(res.body)).not.toContain(secret.slice(0, 4));
    // details should only carry path + msg, never a `value` field.
    if (Array.isArray(res.body.details)) {
      for (const d of res.body.details) expect(d.value).toBeUndefined();
    }
  });

  test('health endpoint does not disclose the environment name', async () => {
    const res = await agent().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.env).toBeUndefined();
  });

  test('NoSQL injection object in login identifier is rejected, not evaluated', async () => {
    // Express-validator requires identifier to be a string; an object like
    // { $gt: "" } must not be accepted and must never match a user.
    const res = await agent().post('/api/auth/login').send({
      identifier: { $gt: '' }, password: { $gt: '' },
    });
    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  test('oversized JSON body is rejected', async () => {
    const huge = 'a'.repeat(200000); // 200 KB > 16 KB limit
    const res = await agent().post('/api/auth/register').send({
      username: 'zed', email: 'zed@example.com', password: huge,
    });
    expect(res.status).toBe(413);
  });

  test('security headers are present (helmet)', async () => {
    const res = await agent().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    // helmet hides x-powered-by
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('unknown routes return 404 JSON', async () => {
    const res = await agent().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  test('auth rate limiter blocks brute force after the configured max', async () => {
    const { config } = require('../src/config');
    const max = config.rateLimit.authMaxRequests;
    let sawLimit = false;
    for (let i = 0; i < max + 5; i++) {
      const res = await agent().post('/api/auth/login').send({
        identifier: `user${i}`, password: 'whatever12',
      });
      if (res.status === 429) { sawLimit = true; break; }
    }
    expect(sawLimit).toBe(true);
  });

  test('leaderboard limit param is validated', async () => {
    const bad = await agent().get('/api/leaderboard?limit=99999');
    expect(bad.status).toBe(400);
    const ok = await agent().get('/api/leaderboard?limit=10');
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.leaderboard)).toBe(true);
  });
});
