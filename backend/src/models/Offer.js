'use strict';

const { mongoose } = require('../config/db');

/**
 * A trade offer: "give X of material A for Y of material B". Open to anyone
 * (or targeted at one player). TTL-expired after 24h so the collection never
 * grows; open offers are also capped per player at the route layer.
 */
const offerSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromUsername: { type: String, required: true },
    season: { type: Number, required: true, index: true },
    giveMaterial: { type: String, required: true },
    giveQty: { type: Number, required: true, min: 1 },
    wantMaterial: { type: String, required: true },
    wantQty: { type: Number, required: true, min: 1 },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // direct offer
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL: offers self-destruct 24h after creation.
offerSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.models.Offer || mongoose.model('Offer', offerSchema);
