'use strict';

const { mongoose } = require('../config/db');

/**
 * A registered player account. This PERSISTS across Ironhold seasons — per-season
 * game state lives in the Hold model, not here. Kept deliberately tiny.
 *
 * Security notes:
 *  - Only passwordHash is stored, never the plaintext password.
 *  - passwordHash has select:false so it is never returned by default queries.
 *  - username/email are unique and validated at the route layer.
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-zA-Z0-9_]+$/,
      index: true,
    },
    usernameLower: { type: String, required: true, unique: true, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },

    // Password reset: we store only a SHA-256 hash of the reset token (never
    // the raw token, same principle as passwords), plus its expiry. select:false
    // so these never leak through normal queries. Cleared on use.
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },

    // All-time, cross-season stats. Tiny and cheap; season state lives in Hold.
    stats: {
      seasonsPlayed: { type: Number, default: 0 },
      crowns: { type: Number, default: 0 }, // seasons finished #1
      bestRank: { type: Number, default: null }, // best leaderboard finish
      titles: { type: [String], default: [] },
    },

    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Sparse index: only the handful of users mid-reset carry this field.
userSchema.index({ resetTokenHash: 1 }, { sparse: true });

// Public projection used everywhere we send a user to the client.
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    username: this.username,
    stats: {
      seasonsPlayed: this.stats?.seasonsPlayed || 0,
      crowns: this.stats?.crowns || 0,
      bestRank: this.stats?.bestRank ?? null,
      titles: this.stats?.titles || [],
    },
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
