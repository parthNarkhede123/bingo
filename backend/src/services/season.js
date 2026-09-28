'use strict';

const Season = require('../models/Season');
const Hold = require('../models/Hold');
const Offer = require('../models/Offer');
const Report = require('../models/Report');
const Mine = require('../models/Mine');
const Pact = require('../models/Pact');
const User = require('../models/User');
const { config } = require('../config');
const { logger } = require('../utils/logger');

function seasonMs() {
  return config.ironhold.seasonDays * 24 * 60 * 60 * 1000;
}

async function startSeason(number, now) {
  const startsAt = new Date(now);
  const endsAt = new Date(now + seasonMs());
  return Season.create({ number, startsAt, endsAt, status: 'active' });
}

/** Return the current active season, creating the first one if none exists. */
async function ensureSeason(now) {
  now = now || Date.now();
  const active = await Season.findOne({ status: 'active' }).sort({ number: -1 });
  if (active) return active;
  if (!config.ironhold.autoStartSeason) return null;
  const last = await Season.findOne().sort({ number: -1 });
  const number = last ? last.number + 1 : 1;
  try {
    return await startSeason(number, now);
  } catch (err) {
    if (err && err.code === 11000) return Season.findOne({ status: 'active' }).sort({ number: -1 });
    throw err;
  }
}

/**
 * If the active season's bell has rung, crown the top CP holder, wipe all
 * season-scoped collections (the weekly mass delete that keeps the DB tiny), and
 * open the next season. Idempotent-ish: safe to call from the sweeper.
 */
async function rollSeasonIfDue(now) {
  now = now || Date.now();
  const season = await Season.findOne({ status: 'active' }).sort({ number: -1 });
  if (!season || new Date(season.endsAt).getTime() > now) return null;

  // Crown the leader (if anyone played).
  const top = await Hold.findOne({ season: season.number }).sort({ cp: -1 }).lean();
  if (top) {
    season.crownedUserId = top.userId;
    season.crownedUsername = top.username;
    await User.updateOne(
      { _id: top.userId },
      { $inc: { 'stats.crowns': 1 }, $push: { 'stats.titles': `Crown of Season ${season.number}` } }
    );
  }
  season.status = 'ended';
  await season.save();

  // The Sundered Crown shatters: season-scoped data is wiped/rebuilt.
  await Promise.all([
    Hold.deleteMany({ season: season.number }),
    Offer.deleteMany({ season: season.number }),
    Report.deleteMany({ season: season.number }),
    Mine.deleteMany({ season: season.number }),
    Pact.deleteMany({ season: season.number }),
  ]);

  const next = await startSeason(season.number + 1, now);
  logger.info(`Season ${season.number} ended (crowned ${season.crownedUsername || 'nobody'}); season ${next.number} begun.`);
  return next;
}

module.exports = { ensureSeason, startSeason, rollSeasonIfDue, seasonMs };
