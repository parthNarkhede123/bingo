'use strict';

const { mongoose } = require('../config/db');

/**
 * A light non-aggression pact between two players: blocks attacks between them
 * until it expires (season end) or is broken. The "make a friend" mechanic with
 * teeth. TTL-expired at expiresAt.
 */
const pactSchema = new mongoose.Schema(
  {
    season: { type: Number, required: true, index: true },
    a: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    b: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pactSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
pactSchema.index({ season: 1, a: 1, b: 1 });

module.exports = mongoose.models.Pact || mongoose.model('Pact', pactSchema);
