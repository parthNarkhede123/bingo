'use strict';

const { logger } = require('../utils/logger');

/**
 * Central error handler. Never leaks stack traces to the client in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error:', err.message);
  const status = err.status || 500;
  const body = { error: status === 500 ? 'Internal server error.' : err.message };
  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

module.exports = { errorHandler, notFound };
