'use strict';

const { mongoose } = require('../config/db');

/**
 * The story of what happened while you were away: a raid resolved, a scout
 * returned, a trade accepted. There is NO event log — reports carry a TTL (48h)
 * and are capped per player, so history lives "in the memory of the week" then
 * dies. This is what keeps the DB from growing with activity.
 */
const reportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    season: { type: Number, required: true },
    kind: { type: String, enum: ['battle', 'scout', 'trade', 'system'], required: true },
    title: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }, // small
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL: reports self-destruct 48h after creation.
reportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 48 * 60 * 60 });
reportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
