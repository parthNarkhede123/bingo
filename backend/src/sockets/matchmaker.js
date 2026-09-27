'use strict';

const { config } = require('../config');

/**
 * Simple in-memory matchmaking queue with rating-band widening.
 *
 * A player joins with their current rating. We pair them with the closest-rated
 * waiting player whose rating gap is within an acceptance band that widens the
 * longer either player has waited, so nobody gets stuck.
 *
 * Hardening (see docs/SECURITY.md):
 *  - The queue is capped (config.matchmaking.maxQueueSize) to bound memory and
 *    the periodic sweep cost; a full queue rejects new joins instead of growing
 *    without limit.
 *  - Entries that wait past config.matchmaking.maxWaitMs are evicted so dead /
 *    unmatchable sockets do not accumulate forever.
 *  - The sweep sorts by rating and breaks early once the gap exceeds the widest
 *    possible band, so it is near-linear in practice rather than O(n^2).
 *
 * State lives in memory only (single server instance). For horizontal scaling
 * move this to Redis; documented in docs/ARCHITECTURE.md.
 */
const MAX_BAND = 1000;

class Matchmaker {
  constructor() {
    // userId -> { userId, username, rating, joinedAt(ms), socketId }
    this.queue = new Map();
  }

  size() {
    return this.queue.size;
  }

  isFull() {
    return this.queue.size >= config.matchmaking.maxQueueSize;
  }

  isQueued(userId) {
    return this.queue.has(userId);
  }

  remove(userId) {
    this.queue.delete(userId);
  }

  /**
   * Add a player and attempt an immediate pairing.
   * @returns {{a,b}} a pair to start, {full:true} if the queue is at capacity,
   *          or null if the player is now waiting.
   */
  addAndMatch(entry, nowMs) {
    // Never allow the same user twice.
    this.queue.delete(entry.userId);

    let best = null;
    let bestGap = Infinity;

    for (const other of this.queue.values()) {
      if (other.userId === entry.userId) continue;
      const gap = Math.abs(other.rating - entry.rating);
      const waited = Math.max(nowMs - entry.joinedAt, nowMs - other.joinedAt);
      const band = acceptanceBand(waited);
      if (gap <= band && gap < bestGap) {
        best = other;
        bestGap = gap;
      }
    }

    if (best) {
      this.queue.delete(best.userId);
      return { a: entry, b: best };
    }

    // No match: enqueue if there is room, otherwise reject.
    if (this.isFull()) return { full: true };
    this.queue.set(entry.userId, entry);
    return null;
  }

  /**
   * Sweep the queue and pair anyone whose wait has widened their band enough.
   * Called periodically. Returns an array of pairs.
   */
  sweep(nowMs) {
    const pairs = [];
    const entries = Array.from(this.queue.values()).sort((a, b) => a.rating - b.rating);
    const used = new Set();
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      if (used.has(a.userId)) continue;
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        if (used.has(b.userId)) continue;
        const gap = b.rating - a.rating; // sorted ascending, so >= 0
        // Sorted by rating: once the gap exceeds the widest band, no later j can match.
        if (gap > MAX_BAND) break;
        const waited = Math.max(nowMs - a.joinedAt, nowMs - b.joinedAt);
        if (gap <= acceptanceBand(waited)) {
          used.add(a.userId);
          used.add(b.userId);
          this.queue.delete(a.userId);
          this.queue.delete(b.userId);
          pairs.push({ a, b });
          break;
        }
      }
    }
    return pairs;
  }

  /**
   * Evict entries that have waited past the max wait. Returns the evicted
   * entries so the caller can notify those clients to retry.
   */
  evictStale(nowMs) {
    const evicted = [];
    for (const entry of this.queue.values()) {
      if (nowMs - entry.joinedAt >= config.matchmaking.maxWaitMs) {
        evicted.push(entry);
      }
    }
    for (const e of evicted) this.queue.delete(e.userId);
    return evicted;
  }

  /**
   * Remove and return entries that have waited at least thresholdMs, so the
   * caller can match each with a bot. This is the "no human available" fallback;
   * it runs only after the human-pairing sweep, so two real players who arrive
   * close together still match each other rather than getting bots.
   */
  takeStaleForBot(nowMs, thresholdMs) {
    const taken = [];
    for (const entry of this.queue.values()) {
      if (nowMs - entry.joinedAt >= thresholdMs) taken.push(entry);
    }
    for (const e of taken) this.queue.delete(e.userId);
    return taken;
  }
}

/** Acceptance band in rating points, widening with wait time (ms). */
function acceptanceBand(waitedMs) {
  const seconds = waitedMs / 1000;
  // Start at +/-100, add 50 points every 5s, cap at MAX_BAND (effectively anyone).
  return Math.min(100 + Math.floor(seconds / 5) * 50, MAX_BAND);
}

module.exports = { Matchmaker, acceptanceBand };
