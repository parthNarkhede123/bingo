'use strict';

/**
 * Shared helper for jest integration tests: boots an in-memory MongoDB and a
 * real HTTP + Socket.IO server so tests exercise the true code paths without
 * any external services.
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.NODE_ENV = 'test';
process.env.SETUP_SECONDS = '60';
process.env.RECONNECT_GRACE_SECONDS = '1';
process.env.AUTH_RATE_MAX = '100';
process.env.RATE_MAX = '100000';
process.env.TURN_SECONDS = '60';

let mongod;

async function startTestServer() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;

  const { connectDB } = require('../src/config/db');
  const { createApp } = require('../src/app');
  const { attachSockets } = require('../src/sockets');

  await connectDB(uri, 1);

  const app = createApp();
  const server = http.createServer(app);
  const sockets = attachSockets(server);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, sockets, port, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopTestServer(ctx) {
  if (ctx && ctx.sockets) ctx.sockets.stop(); // clears sweep interval + current timers
  if (ctx && ctx.sockets && ctx.sockets.io) ctx.sockets.io.close(); // disconnects sockets (may arm grace timers)
  if (ctx && ctx.sockets && ctx.sockets.gm) ctx.sockets.gm.shutdown(); // clear any timers armed during close
  if (ctx && ctx.server) await new Promise((r) => ctx.server.close(r));
  const { disconnectDB } = require('../src/config/db');
  await disconnectDB();
  if (mongod) await mongod.stop();
}

module.exports = { startTestServer, stopTestServer };
