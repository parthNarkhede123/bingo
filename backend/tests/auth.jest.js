'use strict';

const request = require('supertest');
const { startTestServer, stopTestServer } = require('./testServer');

let ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); });

const agent = () => request(ctx.baseUrl);

describe('auth', () => {
  test('registers a new user and returns a token', async () => {
    const res = await agent().post('/api/auth/register').send({
      username: 'alice', email: 'alice@example.com', password: 'supersecret1',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.rating).toBe(1000);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('rejects duplicate username', async () => {
    await agent().post('/api/auth/register').send({
      username: 'bob', email: 'bob@example.com', password: 'supersecret1',
    });
    const res = await agent().post('/api/auth/register').send({
      username: 'bob', email: 'bob2@example.com', password: 'supersecret1',
    });
    expect(res.status).toBe(409);
  });

  test('rejects weak password', async () => {
    const res = await agent().post('/api/auth/register').send({
      username: 'charlie', email: 'charlie@example.com', password: 'short',
    });
    expect(res.status).toBe(400);
  });

  test('rejects invalid username characters', async () => {
    const res = await agent().post('/api/auth/register').send({
      username: 'bad name!', email: 'x@example.com', password: 'supersecret1',
    });
    expect(res.status).toBe(400);
  });

  test('logs in with correct credentials', async () => {
    await agent().post('/api/auth/register').send({
      username: 'dave', email: 'dave@example.com', password: 'supersecret1',
    });
    const res = await agent().post('/api/auth/login').send({
      identifier: 'dave', password: 'supersecret1',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('rejects wrong password with 401 (no enumeration difference)', async () => {
    await agent().post('/api/auth/register').send({
      username: 'erin', email: 'erin@example.com', password: 'supersecret1',
    });
    const wrong = await agent().post('/api/auth/login').send({
      identifier: 'erin', password: 'wrongpassword',
    });
    const missing = await agent().post('/api/auth/login').send({
      identifier: 'nobody', password: 'wrongpassword',
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error).toBe(missing.body.error);
  });

  test('/me requires a valid token', async () => {
    const noToken = await agent().get('/api/auth/me');
    expect(noToken.status).toBe(401);
    const badToken = await agent().get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(badToken.status).toBe(401);
  });

  test('/me returns the current user with a valid token', async () => {
    const reg = await agent().post('/api/auth/register').send({
      username: 'frank', email: 'frank@example.com', password: 'supersecret1',
    });
    const res = await agent().get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('frank');
  });
});
