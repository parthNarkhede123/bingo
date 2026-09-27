'use strict';

const { mongoose } = require('../config/db');

/**
 * Persisted record of a completed match, used for history, anti-cheat audit,
 * and analytics. Boards and the full move list are stored so any game can be
 * fully replayed and disputed calls investigated.
 */
const matchSchema = new mongoose.Schema(
  {
    players: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        ratingBefore: Number,
        ratingAfter: Number,
        ratingDelta: Number,
        board: [Number],
      },
    ],
    calledNumbers: [Number],
    moves: [
      {
        number: Number,
        by: mongoose.Schema.Types.ObjectId,
        _id: false,
      },
    ],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    result: { type: String, enum: ['decided', 'draw'], required: true },
    reason: String,
    rated: { type: Boolean, default: true },
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

matchSchema.index({ 'players.userId': 1, createdAt: -1 });

module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
