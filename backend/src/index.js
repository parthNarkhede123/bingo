'use strict';

const http = require('http');
const { createApp } = require('./app');
const { attachSockets } = require('./sockets');
const { connectDB } = require('./config/db');
const { config, assertProductionSafety } = require('./config');
const { logger } = require('./utils/logger');

async function main() {
  assertProductionSafety();

  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  const sockets = attachSockets(server);

  server.listen(config.port, () => {
    logger.info(`Bingo backend listening on :${config.port} (${config.env})`);
    logger.info(`Allowed client origins: ${config.clientOrigins.join(', ')}`);
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    sockets.stop();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force-exit if not closed in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error:', err.message);
  process.exit(1);
});
