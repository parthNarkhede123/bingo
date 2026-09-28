'use strict';

const { mongoose } = require('../config/db');

/**
 * A wild mine: an ephemeral map node that spawns, can be captured (via a mine
 * march), and expires. Gem mines are a gem source; material mines drop a foreign
 * material. TTL-expired at expiresAt so the collection stays tiny.
 */
const mineSchema = new mongoose.Schema(
  {
    season: { type: Number, required: true, index: true },
    coords: { x: { type: Number, required: true }, y: { type: Number, required: true } },
    kind: { type: String, enum: ['gem', 'material'], required: true },
    material: { type: String, default: null }, // for material mines
    amount: { type: Number, required: true },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

// TTL: expire exactly at expiresAt.
mineSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Mine || mongoose.model('Mine', mineSchema);
