'use strict';

const request = require('supertest');
const { startTestServer, stopTestServer } = require('./testServer');
const { outbox, clearOutbox } = require('../src/utils/mailer');
const User = require('../src/models/User');

let ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); });

const agent = () => request(ctx.baseUrl);

async function register(username, email, password) {
  const res = await agent().post('/api/auth/register').send({ username, email, password });
  expect(res.status).toBe(201);
  return res;
}

function tokenFromUrl(url) {
  return new URL(url).searchParams.get('token');
}

describe('password reset', () => {
  test('forgot-password emails a link for a real account and is single-use end-to-end', async () => {
    await register('wendy', 'wendy@example.com', 'origPassword1');
    clearOutbox();

    // Look up by username; the link should go to the account's email.
    const forgot = await agent().post('/api/auth/forgot-password').send({ identifier: 'wendy' });
    expect(forgot.status).toBe(200);
    expect(forgot.body.ok).toBe(true);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('wendy@example.com');

    const token = tokenFromUrl(outbox[0].resetUrl);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(32);

    // Consume the token to set a new password.
    const reset = await agent().post('/api/auth/reset-password').send({ token, password: 'newPassword1' });
    expect(reset.status).toBe(200);
    expect(reset.body.ok).toBe(true);

    // Old password no longer works; new one does.
    const oldLogin = await agent().post('/api/auth/login').send({ identifier: 'wendy', password: 'origPassword1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await agent().post('/api/auth/login').send({ identifier: 'wendy', password: 'newPassword1' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeTruthy();

    // The same token cannot be reused (single-use: it was cleared on success).
    const reuse = await agent().post('/api/auth/reset-password').send({ token, password: 'anotherPass1' });
    expect(reuse.status).toBe(400);
  });

  test('forgot-password gives an identical response for a non-existent account (no enumeration)', async () => {
    await register('quinn', 'quinn@example.com', 'origPassword1');
    clearOutbox();

    const real = await agent().post('/api/auth/forgot-password').send({ identifier: 'quinn' });
    expect(outbox).toHaveLength(1); // real account -> one email

    const fake = await agent().post('/api/auth/forgot-password').send({ identifier: 'ghost@nowhere.com' });
    expect(outbox).toHaveLength(1); // unchanged: no email for a missing account

    expect(real.status).toBe(fake.status);
    expect(real.body).toEqual(fake.body);
  });

  test('reset-password rejects a bogus token', async () => {
    const res = await agent().post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'newPassword1' });
    expect(res.status).toBe(400);
  });

  test('reset-password rejects an expired token', async () => {
    await register('vera', 'vera@example.com', 'origPassword1');
    clearOutbox();
    await agent().post('/api/auth/forgot-password').send({ identifier: 'vera' });
    const token = tokenFromUrl(outbox[0].resetUrl);

    // Force the stored token to have already expired.
    await User.updateOne({ usernameLower: 'vera' }, { resetTokenExpires: new Date(Date.now() - 1000) });

    const res = await agent().post('/api/auth/reset-password').send({ token, password: 'newPassword1' });
    expect(res.status).toBe(400);

    // And the expired token still cannot be used after the fact.
    const login = await agent().post('/api/auth/login').send({ identifier: 'vera', password: 'newPassword1' });
    expect(login.status).toBe(401);
  });

  test('reset-password enforces password strength', async () => {
    await register('tariq', 'tariq@example.com', 'origPassword1');
    clearOutbox();
    await agent().post('/api/auth/forgot-password').send({ identifier: 'tariq' });
    const token = tokenFromUrl(outbox[0].resetUrl);

    const weak = await agent().post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(weak.status).toBe(400);

    // Token survives a rejected (invalid) attempt and still works afterwards.
    const ok = await agent().post('/api/auth/reset-password').send({ token, password: 'strongEnough1' });
    expect(ok.status).toBe(200);
  });

  test('forgot-password enforces a per-account resend cooldown (anti inbox-bombing)', async () => {
    await register('sasha', 'sasha@example.com', 'origPassword1');
    clearOutbox();

    const first = await agent().post('/api/auth/forgot-password').send({ identifier: 'sasha' });
    expect(first.status).toBe(200);
    expect(outbox).toHaveLength(1); // first request sends one email

    // A second request within the cooldown window is suppressed (no new email),
    // but still returns the identical uniform response (no enumeration oracle).
    const second = await agent().post('/api/auth/forgot-password').send({ identifier: 'sasha' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(outbox).toHaveLength(1); // unchanged: cooldown suppressed the resend
  });

  test('forgot-password requires an identifier', async () => {
    const res = await agent().post('/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });
});
