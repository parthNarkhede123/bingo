'use strict';
// Boots the REAL production entrypoint (src/index.js) as a child process
// against an in-memory MongoDB, then hits /api/health to prove the full server
// wiring starts cleanly. Not part of the unit/integration suites.
const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const port = 4599;
  const child = spawn('node', ['src/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      MONGO_URI: uri,
      JWT_SECRET: 'x'.repeat(48),
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });

  const ok = await new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        const body = await res.json();
        if (res.ok && body.status === 'ok') { clearInterval(timer); resolve(true); }
      } catch (_) { /* not up yet */ }
    }, 300);
    setTimeout(() => { clearInterval(timer); resolve(false); }, 15000);
  });

  child.kill('SIGTERM');
  await mongod.stop();
  console.log(out.trim());
  console.log(ok ? 'SMOKE: PASS (server booted and /api/health responded)' : 'SMOKE: FAIL');
  process.exit(ok ? 0 : 1);
})();
