'use strict';

const { mongoose } = require('../config/db');
const { STANCES } = require('../game/constants');

/**
 * A Hold is ONE player's entire state for ONE season — the single big document
 * the light-DB design is built around (~1-2KB). Resources are derived from
 * timestamps on read (see game/resolver.js), not ticked, so there are no
 * background writes. Everything ephemeral lives in its own TTL collection; the
 * whole `holds` collection is wiped at season reset.
 */
const gearSchema = new mongoose.Schema(
  { id: String, stance: { type: String, enum: STANCES }, tier: String, power: Number },
  { _id: false }
);

const marchSchema = new mongoose.Schema(
  {
    id: String,
    kind: { type: String, enum: ['attack', 'scout', 'mine', 'return'] },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hold' },
    targetCoords: { x: Number, y: Number },
    troops: { type: Number, default: 0 },
    assaultMult: { type: Number, default: 1 }, // attacker power snapshot at departure
    loot: {
      amount: { type: Number, default: 0 },
      foreign: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    departAt: Date,
    arriveAt: Date,
    status: { type: String, enum: ['outbound', 'done'], default: 'outbound' },
  },
  { _id: false }
);

const holdSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true }, // denormalized for leaderboard/scout
    season: { type: Number, required: true, index: true },
    coords: { x: { type: Number, required: true }, y: { type: Number, required: true } },

    material: {
      type: { type: String, required: true }, // your one signature material
      amount: { type: Number, default: 0 },
      rate: { type: Number, default: 0 }, // units/hr; re-settled on every change
      lastHarvestAt: { type: Date, default: Date.now },
    },
    foreignMaterials: { type: Map, of: Number, default: {} }, // only what you hold

    scrap: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },
    cp: { type: Number, default: 0, index: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    skillPoints: { type: Number, default: 0 },

    troops: { type: Number, default: 0 },
    wounded: { type: Number, default: 0 },
    woundedHealAt: { type: Date, default: null },

    activeStance: { type: String, enum: STANCES, default: 'harvest' },
    autoLoadout: { type: Boolean, default: false },
    loadouts: {
      assault: { type: [String], default: [] },
      bulwark: { type: [String], default: [] },
      harvest: { type: [String], default: [] },
      march: { type: [String], default: [] },
    },
    inventory: { type: [gearSchema], default: [] }, // capped (CAPS.inventory)

    skills: {
      assault: { type: Number, default: 0 },
      bulwark: { type: Number, default: 0 },
      harvest: { type: Number, default: 0 },
      march: { type: Number, default: 0 },
      gemfind: { type: Number, default: 0 },
      chestluck: { type: Number, default: 0 },
    },

    commanders: {
      durgan: { owned: { type: Boolean, default: false }, freeUntil: Date },
      wren: { owned: { type: Boolean, default: false }, freeUntil: Date, charges: { type: Number, default: 0 } },
    },

    chests: {
      wood: { type: Number, default: 0 },
      iron: { type: Number, default: 0 },
      gold: { type: Number, default: 0 },
      royal: { type: Number, default: 0 },
    },

    quests: { type: Map, of: Number, default: {} },

    marches: { type: [marchSchema], default: [] }, // capped (CAPS.marches)
    incomingAt: { type: Date, default: null }, // soonest incoming raid, for Durgan

    // Ad-reward abuse guard: rolling daily window.
    ads: {
      count: { type: Number, default: 0 },
      windowStartAt: { type: Date, default: null },
      lastAt: { type: Date, default: null },
    },

    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One Hold per player per season.
holdSchema.index({ userId: 1, season: 1 }, { unique: true });
// Leaderboard: top CP within a season.
holdSchema.index({ season: 1, cp: -1 });

module.exports = mongoose.models.Hold || mongoose.model('Hold', holdSchema);
