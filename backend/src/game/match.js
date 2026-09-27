'use strict';

const crypto = require('crypto');
const { CELLS, WIN_LINES, completedLines } = require('./engine');

/**
 * Authoritative state machine for a single 1v1 bingo match.
 *
 * All game rules live here and are enforced server-side. The socket layer only
 * translates network events into method calls and broadcasts the returned
 * results. Clients can never mutate state directly — they can only propose a
 * "call this number" action, which is fully validated here.
 *
 * Rules implemented:
 *  - Each player has a fixed 5x5 board (permutation of 1..25).
 *  - Players alternate turns. On your turn you call one uncalled number 1..25.
 *  - A called number is marked on BOTH boards.
 *  - A line (row/col/diagonal) completes when all its numbers are called.
 *  - Each completed line = one letter of B-I-N-G-O. 5 lines = win.
 *  - If a single call pushes both players to >= 5 lines, the higher line count
 *    wins; an exact tie is a draw.
 */
class Match {
  constructor({ matchId, playerA, playerB, boardA, boardB, firstPlayer }) {
    this.matchId = matchId;
    this.players = [playerA, playerB];
    this.boards = { [playerA]: boardA, [playerB]: boardB };
    this.called = new Set(); // numbers already called
    this.turn = firstPlayer && this.players.includes(firstPlayer)
      ? firstPlayer
      : playerA;
    this.over = false;
    this.winner = null; // playerId | 'draw' | null
    this.reason = null;
    this.moves = []; // audit log of { number, by, at (ms offset), scores }
    this.startedAt = null; // stamped by caller (Date.* unavailable in some ctx)
    this.endedAt = null;
  }

  opponentOf(playerId) {
    return this.players.find((p) => p !== playerId) || null;
  }

  isPlayer(playerId) {
    return this.players.includes(playerId);
  }

  scoreFor(playerId) {
    const lines = completedLines(this.boards[playerId], this.called);
    return { lines, letters: Math.min(lines, WIN_LINES) };
  }

  scores() {
    const out = {};
    for (const p of this.players) out[p] = this.scoreFor(p);
    return out;
  }

  /** Pick a uniformly random uncalled number (for turn-timeout auto-calls). */
  randomUncalledNumber() {
    const remaining = [];
    for (let n = 1; n <= CELLS; n++) {
      if (!this.called.has(n)) remaining.push(n);
    }
    if (remaining.length === 0) return null;
    return remaining[crypto.randomInt(0, remaining.length)];
  }

  /**
   * Apply a call. Returns { ok, error?, result? }.
   * `result` (on success) describes the new state for broadcasting.
   */
  call(playerId, number, atMs = 0) {
    if (this.over) {
      return { ok: false, error: 'GAME_OVER', message: 'The game is already over.' };
    }
    if (!this.isPlayer(playerId)) {
      return { ok: false, error: 'NOT_A_PLAYER', message: 'You are not in this match.' };
    }
    if (this.turn !== playerId) {
      return { ok: false, error: 'NOT_YOUR_TURN', message: 'It is not your turn.' };
    }
    if (!Number.isInteger(number) || number < 1 || number > CELLS) {
      return { ok: false, error: 'INVALID_NUMBER', message: `Number must be an integer 1..${CELLS}.` };
    }
    if (this.called.has(number)) {
      return { ok: false, error: 'ALREADY_CALLED', message: 'That number was already called.' };
    }

    // Apply
    this.called.add(number);
    const scores = this.scores();
    this.moves.push({ number, by: playerId, at: atMs, scores });

    // Determine win/draw
    const a = this.players[0];
    const b = this.players[1];
    const la = scores[a].lines;
    const lb = scores[b].lines;
    const aWon = la >= WIN_LINES;
    const bWon = lb >= WIN_LINES;

    if (aWon || bWon) {
      this.over = true;
      if (aWon && bWon) {
        if (la > lb) { this.winner = a; }
        else if (lb > la) { this.winner = b; }
        else { this.winner = 'draw'; }
        this.reason = 'SIMULTANEOUS_BINGO';
      } else {
        this.winner = aWon ? a : b;
        this.reason = 'BINGO';
      }
      this.turn = null;
    } else {
      // Switch turn
      this.turn = this.opponentOf(playerId);
    }

    return {
      ok: true,
      result: {
        type: 'call',
        number,
        by: playerId,
        nextTurn: this.turn,
        scores,
        over: this.over,
        winner: this.winner,
        reason: this.reason,
      },
    };
  }

  /**
   * End the match immediately because a player forfeited / disconnected /
   * abandoned. The opponent wins. No-op if already over.
   */
  forfeit(playerId, reason = 'FORFEIT') {
    if (this.over) return { ok: false, error: 'GAME_OVER' };
    if (!this.isPlayer(playerId)) return { ok: false, error: 'NOT_A_PLAYER' };
    this.over = true;
    this.winner = this.opponentOf(playerId);
    this.reason = reason;
    this.turn = null;
    return {
      ok: true,
      result: {
        type: 'end',
        forfeitedBy: playerId,
        over: true,
        winner: this.winner,
        reason,
        scores: this.scores(),
      },
    };
  }

  /** Full snapshot for a specific player (used on reconnect). */
  snapshotFor(playerId) {
    const opp = this.opponentOf(playerId);
    return {
      matchId: this.matchId,
      yourBoard: this.boards[playerId],
      called: Array.from(this.called),
      turn: this.turn,
      yourTurn: this.turn === playerId,
      over: this.over,
      winner: this.winner,
      reason: this.reason,
      you: this.scoreFor(playerId),
      opponent: this.scoreFor(opp),
    };
  }
}

module.exports = { Match };
