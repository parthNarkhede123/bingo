'use strict';

const mongoose = require('mongoose');
const { config } = require('./index');
const { logger } = require('../utils/logger');

/**
 * Connect to MongoDB. Retries a few times on startup so a briefly-unavailable
 * database (common on free tiers that spin down) does not crash the process.
 */
async function connectDB(uri = config.mongoUri, attempts = 5) {
  mongoose.set('strictQuery', true);
  for (let i = 1; i <= attempts; i++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
      });
      logger.info('MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${i}/${attempts} failed: ${err.message}`);
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, mongoose };
