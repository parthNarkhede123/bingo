'use strict';

const { mongoose } = require('../config/db');

/**
 * The season singleton-per-cycle. A season is one week (the "Siege Week"). At
 * the bell we crown the top CP holder, then wipe season-scoped collections. Only
 * one season is `active` at a time.
 */
const seasonSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
    crownedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    crownedUsername: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Season || mongoose.model('Season', seasonSchema);
