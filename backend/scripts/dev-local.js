'use strict';

/**
 * LOCAL DEV LAUNCHER — testing convenience only, NOT for production.
 *
 * Boots an in-memory MongoDB (via mongodb-memory-server, already a
 * devDependency) so the app runs with zero external services installed, then
 * starts the normal backend against it. All other config still comes from
 * backend/.env (JWT_SECRET, port, origins, ...).
 *
 * Data lives only for the life of this process (fresh DB on every start).
 * To use a real database instead, set MONGO_URI in .env and run `npm run dev`.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  const mem = await MongoMemoryServer.create({ instance: { dbName: 'bingo' } });
  // Inject BEFORE requiring the app. dotenv (loaded inside src/config) does not
  // override an already-set process.env value, so this wins over any .env line.
  process.env.MONGO_URI = mem.getUri('bingo');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  console.log('[dev-local] in-memory MongoDB ready:', process.env.MONGO_URI);
  console.log('[dev-local] starting backend...');

  // Start the real server. It reads config (incl. .env) at require time.
  require('../src/index.js');

  const stop = async (sig) => {
    console.log(`\n[dev-local] ${sig} received, stopping in-memory MongoDB...`);
    try { await mem.stop(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err) => {
  console.error('[dev-local] failed to start:', err);
  process.exit(1);
});
