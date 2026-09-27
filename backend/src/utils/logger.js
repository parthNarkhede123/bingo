'use strict';

/**
 * Minimal structured logger. Avoids logging secrets. In production you would
 * swap this for pino/winston, but this keeps the dependency footprint small.
 * Stays quiet during automated tests to keep test output readable.
 */
function stamp() {
  return new Date().toISOString();
}

const QUIET = process.env.NODE_ENV === 'test';

const logger = {
  info: (...args) => { if (!QUIET) console.log(`[${stamp()}] [INFO]`, ...args); },
  warn: (...args) => { if (!QUIET) console.warn(`[${stamp()}] [WARN]`, ...args); },
  error: (...args) => { if (!QUIET) console.error(`[${stamp()}] [ERROR]`, ...args); },
  debug: (...args) => {
    if (process.env.DEBUG) console.log(`[${stamp()}] [DEBUG]`, ...args);
  },
};

module.exports = { logger };
