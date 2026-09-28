'use strict';

const { config } = require('../config');
const { logger } = require('../utils/logger');
const { rollSeasonIfDue, ensureSeason } = require('./season');
const { resolveDueMarches } = require('./marches');
const { spawnMines } = require('./mines');

/**
 * The one light background loop. Every tick it: rolls the season over at the
 * bell, resolves due marches for offline players, and tops up wild mines. It
 * touches only the few docs with due timers — never the whole player base — and
 * writes nothing when there's nothing to do. Lazy resolution on each request
 * does the rest for online players.
 */
function startSweeper() {
  let running = false;

  async function tick() {
    if (running) return; // never overlap ticks
    running = true;
    try {
      await ensureSeason();
      await rollSeasonIfDue();
      await resolveDueMarches();
      await spawnMines();
    } catch (err) {
      logger.error(`Sweeper tick failed: ${err.message}`);
    } finally {
      running = false;
    }
  }

  const interval = setInterval(tick, config.ironhold.sweepIntervalMs);
  interval.unref && interval.unref();
  // Kick once shortly after boot so a fresh DB gets its first season + mines.
  const kickoff = setTimeout(tick, 1500);
  kickoff.unref && kickoff.unref();

  return { stop: () => { clearInterval(interval); clearTimeout(kickoff); } };
}

module.exports = { startSweeper };
