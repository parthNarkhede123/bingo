'use strict';

const { mongoose } = require('../config/db');
const { LINES } = require('../game/lines');
const { CELLS, completedLines } = require('../game/engine');

/**
 * Bot opponents.
 *
 * When no human is available, a player is matched against a bot so they never
 * get stuck "finding an opponent". Bots are NOT AI models — bingo is a small
 * perfect-information game, so a fast heuristic is plenty. Each bot has a fixed
 * rating; matchmaking picks the closest-rated bot to the human, and the normal
 * Elo math applies (beating a higher-rated bot yields more points; losing to a
 * lower-rated one costs more). This is what makes low-rated players climb by
 * upsetting stronger bots, exactly as with human opponents.
 *
 * Bots are ephemeral: they have a per-match ObjectId (so the audit record and
 * move log cast cleanly) but are never written to the User collection, so they
 * never appear on the leaderboard and their own rating never changes.
 *
 * Difficulty gradient: `randomness` is the probability the bot plays a random
 * legal move instead of the heuristic-best one. Lower rating -> more random
 * -> weaker. The strongest bots play near-optimally.
 */
const ROSTER = [
  { username: 'liam_84', rating: 840, randomness: 0.45 },
  { username: 'sofia_r', rating: 960, randomness: 0.34 },
  { username: 'NoahP', rating: 1080, randomness: 0.26 },
  { username: 'mia_k', rating: 1180, randomness: 0.19 },
  { username: 'Aarav7', rating: 1290, randomness: 0.13 },
  { username: 'kenji_t', rating: 1410, randomness: 0.08 },
  { username: 'ava_m', rating: 1540, randomness: 0.04 },
  { username: 'EllaW', rating: 1680, randomness: 0.02 },
];

// Reward near-complete lines super-linearly so the bot pushes its best lines to
// the finish; index = number of a line's cells already called (0..5).
const LINE_WEIGHT = [0, 1, 3, 8, 20, 1000];

/**
 * Pick the closest-rated bot to a human's rating and instantiate a fresh,
 * ephemeral bot "player" for one match. Falls back to a higher-ranked bot when
 * no similar-rated one exists (the roster spans ~840..1680, so a very low or
 * very high human is matched to the nearest end — an upset opportunity).
 */
function pickBotFor(rating) {
  let best = ROSTER[0];
  let bestGap = Infinity;
  for (const b of ROSTER) {
    const gap = Math.abs(b.rating - rating);
    if (gap < bestGap) { best = b; bestGap = gap; }
  }
  return {
    userId: new mongoose.Types.ObjectId().toString(),
    username: best.username,
    rating: best.rating,
    randomness: best.randomness,
    socketId: null,
    isBot: true,
    joinedAt: Date.now(),
  };
}

/** Sum of line weights for a board given the set of called numbers. */
function boardPotential(board, calledSet) {
  let total = 0;
  for (const line of LINES) {
    let marked = 0;
    for (const idx of line) if (calledSet.has(board[idx])) marked += 1;
    total += LINE_WEIGHT[marked];
  }
  return total;
}

/**
 * Choose the bot's next number to call. Greedy 1-ply: for every uncalled
 * number, simulate calling it and score the resulting position as
 * (own potential) - 0.6*(opponent potential). A number that completes the
 * bot's 5th line is always taken; a number that would hand the opponent the win
 * (without the bot also reaching >= their line count) is avoided. Weaker bots
 * play a uniformly random legal move with probability `randomness`.
 */
function chooseBotMove(match, botId, randomness = 0) {
  const oppId = match.opponentOf(botId);
  const botBoard = match.boards[botId];
  const oppBoard = match.boards[oppId];
  const called = match.called;

  const remaining = [];
  for (let n = 1; n <= CELLS; n += 1) if (!called.has(n)) remaining.push(n);
  if (remaining.length === 0) return null;

  if (Math.random() < randomness) {
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  let best = remaining[0];
  let bestScore = -Infinity;
  for (const n of remaining) {
    const sim = new Set(called);
    sim.add(n);
    const botLines = completedLines(botBoard, sim);
    const oppLines = completedLines(oppBoard, sim);
    let score = boardPotential(botBoard, sim) - 0.6 * boardPotential(oppBoard, sim);
    if (botLines >= 5 && botLines >= oppLines) score += 1e6; // take the win
    else if (oppLines >= 5) score -= 5e5; // don't gift the opponent the game
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

/**
 * Human-like "thinking" pause before a bot calls (ms). Configurable via env so
 * tests can make bots move near-instantly; defaults to a natural 0.6s..1.6s.
 */
function botThinkDelayMs() {
  const min = parseInt(process.env.BOT_THINK_MIN_MS || '600', 10);
  const span = parseInt(process.env.BOT_THINK_SPAN_MS || '1000', 10);
  return (Number.isFinite(min) ? min : 600) + Math.floor(Math.random() * Math.max(0, Number.isFinite(span) ? span : 1000));
}

module.exports = { ROSTER, pickBotFor, chooseBotMove, boardPotential, botThinkDelayMs };
