'use strict';

const { mongoose } = require('../config/db');
const { BASE_RATING } = require('../game/rating');

/**
 * A registered player.
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

    rating: { type: Number, default: BASE_RATING, index: true },
    peakRating: { type: Number, default: BASE_RATING },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },

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
    rating: this.rating,
    peakRating: this.peakRating,
    wins: this.wins,
    losses: this.losses,
    draws: this.draws,
    gamesPlayed: this.gamesPlayed,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
