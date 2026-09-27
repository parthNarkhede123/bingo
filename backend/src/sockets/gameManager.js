'use strict';

const crypto = require('crypto');
const { Match } = require('../game/match');
const { randomBoard, validateBoard } = require('../game/engine');
const { computeRatings } = require('../game/rating');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const User = require('../models/User');
const MatchModel = require('../models/Match');
const { mongoose } = require('../config/db');

const PHASE = { SETUP: 'setup', PLAYING: 'playing', OVER: 'over' };

/**
 * Owns all live matches and their timers. Server-authoritative: the Match
 * instance is the single source of truth and every client message is validated
 * against it before any state changes.
 */
class GameManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map(); // matchId -> session
    this.userToMatch = new Map(); // userId -> matchId
  }

  activeMatchIdForUser(userId) {
    return this.userToMatch.get(userId) || null;
  }

  getSession(matchId) {
    return this.sessions.get(matchId) || null;
  }

  emitToUser(session, userId, event, payload) {
    const p = session.players[userId];
    if (p && p.socketId) this.io.to(p.socketId).emit(event, payload);
  }

  /** Create a match from two matched players and open the setup phase. */
  createMatch(pA, pB) {
    const matchId = crypto.randomUUID();
    const boardA = randomBoard();
    const boardB = randomBoard();
    // Randomly decide who moves first.
    const firstPlayer = crypto.randomInt(0, 2) === 0 ? pA.userId : pB.userId;

    const match = new Match({
      matchId,
      playerA: pA.userId,
      playerB: pB.userId,
      boardA,
      boardB,
      firstPlayer,
    });

    const session = {
      matchId,
      match,
      phase: PHASE.SETUP,
      firstPlayer,
      startedAt: null,
      players: {
        [pA.userId]: mkPlayer(pA, boardA),
        [pB.userId]: mkPlayer(pB, boardB),
      },
      order: [pA.userId, pB.userId],
      timers: { setup: null, turn: null, reconnect: {} },
    };

    this.sessions.set(matchId, session);
    this.userToMatch.set(pA.userId, matchId);
    this.userToMatch.set(pB.userId, matchId);

    // Join each player's socket to the match room.
    for (const uid of session.order) {
      const sock = this.io.sockets.sockets.get(session.players[uid].socketId);
      if (sock) sock.join(matchId);
    }

    const setupDeadline = Date.now() + config.game.setupSeconds * 1000;

    // Tell each player about the match, their board, and the opponent.
    for (const uid of session.order) {
      const oppId = session.order.find((x) => x !== uid);
      const opp = session.players[oppId];
      this.emitToUser(session, uid, 'match:found', {
        matchId,
        yourBoard: session.players[uid].board,
        opponent: { username: opp.username, rating: opp.rating },
        setupSeconds: config.game.setupSeconds,
        setupDeadline,
      });
    }

    session.timers.setup = setTimeout(() => this.startGame(session), config.game.setupSeconds * 1000);
    logger.info(`Match ${matchId} created: ${pA.username} vs ${pB.username}`);
    return session;
  }

  /** Player submits a custom board arrangement during setup. */
  submitBoard(userId, board) {
    const matchId = this.userToMatch.get(userId);
    const session = matchId && this.sessions.get(matchId);
    if (!session || session.phase !== PHASE.SETUP) {
      return { ok: false, error: 'NOT_IN_SETUP', message: 'No board setup is in progress.' };
    }
    const check = validateBoard(board);
    if (!check.valid) {
      return { ok: false, error: 'INVALID_BOARD', message: check.error };
    }
    const player = session.players[userId];
    player.board = board.slice();
    session.match.boards[userId] = player.board;
    player.ready = true;

    this.emitToUser(session, userId, 'board:accepted', { board: player.board });

    // If both ready, start immediately.
    const allReady = session.order.every((uid) => session.players[uid].ready);
    if (allReady) {
      if (session.timers.setup) clearTimeout(session.timers.setup);
      session.timers.setup = null;
      this.startGame(session);
    }
    return { ok: true };
  }

  /** Begin play. Idempotent guard prevents a double-start from timer + ready. */
  startGame(session) {
    if (session.phase !== PHASE.SETUP) return;
    session.phase = PHASE.PLAYING;
    session.startedAt = Date.now();
    session.match.startedAt = session.startedAt;
    if (session.timers.setup) {
      clearTimeout(session.timers.setup);
      session.timers.setup = null;
    }

    const turnDeadline = Date.now() + config.game.turnSeconds * 1000;
    this.io.to(session.matchId).emit('game:start', {
      matchId: session.matchId,
      firstPlayer: session.match.turn,
      turnSeconds: config.game.turnSeconds,
      turnDeadline,
    });
    this.armTurnTimer(session);
    logger.info(`Match ${session.matchId} started`);
  }

  armTurnTimer(session) {
    if (session.timers.turn) clearTimeout(session.timers.turn);
    session.timers.turn = setTimeout(
      () => this.handleTurnTimeout(session),
      config.game.turnSeconds * 1000
    );
  }

  /** A player calls a number on their turn. */
  handleCall(userId, number) {
    const matchId = this.userToMatch.get(userId);
    const session = matchId && this.sessions.get(matchId);
    if (!session || session.phase !== PHASE.PLAYING) {
      return { ok: false, error: 'NOT_PLAYING', message: 'No active game.' };
    }
    const res = session.match.call(userId, number, Date.now() - (session.startedAt || Date.now()));
    if (!res.ok) return res;
    this.applyCallResult(session, res.result, { auto: false });
    return { ok: true };
  }

  applyCallResult(session, result, meta) {
    if (session.timers.turn) {
      clearTimeout(session.timers.turn);
      session.timers.turn = null;
    }

    const turnDeadline = result.over ? null : Date.now() + config.game.turnSeconds * 1000;

    // Broadcast the move + both scores to the room.
    this.io.to(session.matchId).emit('game:update', {
      matchId: session.matchId,
      number: result.number,
      by: result.by,
      auto: !!meta.auto,
      nextTurn: result.nextTurn,
      turnDeadline,
      scores: result.scores,
      over: result.over,
    });

    if (result.over) {
      this.finalize(session, { winner: result.winner, reason: result.reason });
    } else {
      this.armTurnTimer(session);
    }
  }

  /** Turn timer expired: auto-call for the player on move, or forfeit them. */
  handleTurnTimeout(session) {
    if (session.phase !== PHASE.PLAYING) return;
    const userId = session.match.turn;
    if (!userId) return;
    const player = session.players[userId];
    player.timeouts = (player.timeouts || 0) + 1;

    if (player.timeouts > config.game.maxTimeoutsBeforeForfeit) {
      const res = session.match.forfeit(userId, 'TIMEOUT_FORFEIT');
      if (res.ok) {
        this.io.to(session.matchId).emit('game:update', {
          matchId: session.matchId,
          number: null,
          by: userId,
          auto: true,
          over: true,
          scores: session.match.scores(),
        });
        this.finalize(session, { winner: res.result.winner, reason: 'TIMEOUT_FORFEIT' });
      }
      return;
    }

    const n = session.match.randomUncalledNumber();
    if (n == null) return;
    const res = session.match.call(userId, n, Date.now() - (session.startedAt || Date.now()));
    if (res.ok) this.applyCallResult(session, res.result, { auto: true });
  }

  /** Voluntary leave / resign. */
  handleForfeit(userId, reason = 'FORFEIT') {
    const matchId = this.userToMatch.get(userId);
    const session = matchId && this.sessions.get(matchId);
    if (!session) return { ok: false, error: 'NO_MATCH' };
    if (session.phase === PHASE.OVER) return { ok: false, error: 'GAME_OVER' };

    // If still in setup, just abort the match as a forfeit by the leaver.
    const res = session.match.forfeit(userId, reason);
    if (!res.ok) return res;
    if (session.timers.setup) { clearTimeout(session.timers.setup); session.timers.setup = null; }
    if (session.timers.turn) { clearTimeout(session.timers.turn); session.timers.turn = null; }
    this.finalize(session, { winner: res.result.winner, reason });
    return { ok: true };
  }

  /** Socket dropped: start a reconnect grace period, then forfeit if no return. */
  handleDisconnect(userId) {
    const matchId = this.userToMatch.get(userId);
    const session = matchId && this.sessions.get(matchId);
    if (!session || session.phase === PHASE.OVER) return;
    const player = session.players[userId];
    if (player) player.connected = false;

    const oppId = session.order.find((x) => x !== userId);
    this.emitToUser(session, oppId, 'opponent:disconnected', {
      graceSeconds: config.game.reconnectGraceSeconds,
    });

    session.timers.reconnect[userId] = setTimeout(() => {
      const stillHere = this.sessions.get(matchId);
      if (!stillHere || stillHere.phase === PHASE.OVER) return;
      if (stillHere.players[userId] && stillHere.players[userId].connected) return;
      const res = stillHere.match.forfeit(userId, 'DISCONNECT_FORFEIT');
      if (res.ok) {
        if (stillHere.timers.turn) clearTimeout(stillHere.timers.turn);
        this.finalize(stillHere, { winner: res.result.winner, reason: 'DISCONNECT_FORFEIT' });
      }
    }, config.game.reconnectGraceSeconds * 1000);
  }

  /** Player reconnected on a new socket: rejoin room, resend state. */
  handleReconnect(userId, socketId) {
    const matchId = this.userToMatch.get(userId);
    const session = matchId && this.sessions.get(matchId);
    if (!session || session.phase === PHASE.OVER) return false;
    const player = session.players[userId];
    if (!player) return false;

    player.socketId = socketId;
    player.connected = true;
    if (session.timers.reconnect[userId]) {
      clearTimeout(session.timers.reconnect[userId]);
      delete session.timers.reconnect[userId];
    }
    const sock = this.io.sockets.sockets.get(socketId);
    if (sock) sock.join(matchId);

    const snap = session.match.snapshotFor(userId);
    snap.phase = session.phase;
    this.io.to(socketId).emit('game:state', snap);

    const oppId = session.order.find((x) => x !== userId);
    this.emitToUser(session, oppId, 'opponent:reconnected', {});
    return true;
  }

  /** End a match: update ratings, persist, notify players, and clean up. */
  async finalize(session, { winner, reason }) {
    if (session.phase === PHASE.OVER) return;
    const wasPlaying = session.phase === PHASE.PLAYING && !!session.startedAt;
    session.phase = PHASE.OVER;
    if (session.timers.turn) { clearTimeout(session.timers.turn); session.timers.turn = null; }
    if (session.timers.setup) { clearTimeout(session.timers.setup); session.timers.setup = null; }
    for (const t of Object.values(session.timers.reconnect)) clearTimeout(t);
    session.timers.reconnect = {};

    const [aId, bId] = session.order;
    const isDraw = winner === 'draw';
    const outcome = isDraw ? 'draw' : winner === aId ? 'a' : 'b';

    // A match that never left setup (forfeit/disconnect before game:start) is
    // UNRATED: no Elo change, no win/loss stats. This removes the incentive to
    // farm rating by matching then bailing during setup.
    const rated = wasPlaying;

    let ratingResult = null;
    try {
      ratingResult = await this.persistResult(session, { winner, reason, outcome, isDraw, rated });
    } catch (err) {
      logger.error(`Failed to persist match ${session.matchId}: ${err.message}`);
    }

    // Notify each player from their own perspective.
    for (const uid of session.order) {
      const oppId = session.order.find((x) => x !== uid);
      let result = 'draw';
      if (!isDraw) result = winner === uid ? 'win' : 'loss';
      const rc = ratingResult ? ratingResult[uid] : null;
      this.emitToUser(session, uid, 'game:over', {
        matchId: session.matchId,
        result,
        reason,
        rated,
        winner: isDraw ? null : winner,
        yourScore: session.match.scoreFor(uid),
        opponentScore: session.match.scoreFor(oppId),
        ratingChange: rc ? rc.delta : 0,
        newRating: rc ? rc.newRating : session.players[uid].rating,
      });
    }

    this.cleanup(session.matchId);
    logger.info(`Match ${session.matchId} ended: ${isDraw ? 'draw' : winner} (${reason})${rated ? '' : ' [unrated]'}`);
  }

  async persistResult(session, { winner, reason, outcome, isDraw, rated }) {
    const [aId, bId] = session.order;
    const a = await User.findById(aId);
    const b = await User.findById(bId);
    if (!a || !b) throw new Error('Player record missing');

    // ratingBefore is taken from the SAME fresh DB value used to compute the new
    // rating, so ratingBefore + delta === ratingAfter always holds in the record.
    const beforeA = a.rating;
    const beforeB = b.rating;

    let deltas;
    if (rated) {
      const ratings = computeRatings(
        { rating: a.rating, gamesPlayed: a.gamesPlayed },
        { rating: b.rating, gamesPlayed: b.gamesPlayed },
        outcome
      );
      applyStats(a, isDraw ? 'draw' : winner === aId ? 'win' : 'loss', ratings.a.newRating);
      applyStats(b, isDraw ? 'draw' : winner === bId ? 'win' : 'loss', ratings.b.newRating);
      deltas = {
        a: { newRating: ratings.a.newRating, delta: ratings.a.delta },
        b: { newRating: ratings.b.newRating, delta: ratings.b.delta },
      };
    } else {
      // Unrated abort: no rating/stat change.
      deltas = {
        a: { newRating: beforeA, delta: 0 },
        b: { newRating: beforeB, delta: 0 },
      };
    }

    const matchDoc = {
      players: [
        {
          userId: a._id, username: a.username,
          ratingBefore: beforeA, ratingAfter: deltas.a.newRating,
          ratingDelta: deltas.a.delta, board: session.match.boards[aId],
        },
        {
          userId: b._id, username: b.username,
          ratingBefore: beforeB, ratingAfter: deltas.b.newRating,
          ratingDelta: deltas.b.delta, board: session.match.boards[bId],
        },
      ],
      calledNumbers: Array.from(session.match.called),
      moves: session.match.moves.map((m) => ({ number: m.number, by: m.by })),
      winner: isDraw ? null : winner,
      result: isDraw ? 'draw' : 'decided',
      reason,
      rated: !!rated,
      startedAt: session.startedAt ? new Date(session.startedAt) : null,
      endedAt: new Date(),
    };

    // Persist both player updates and the audit record together. On a replica
    // set (MongoDB Atlas) this is a real ACID transaction so a partial failure
    // never leaves one rating updated and the other not. On a standalone (local
    // dev / in-memory test) transactions are unsupported, so we fall back to
    // sequential writes.
    const writeAll = async (opts) => {
      if (rated) await Promise.all([a.save(opts), b.save(opts)]);
      await MatchModel.create([matchDoc], opts);
    };

    let usedTxn = false;
    let dbSession = null;
    try {
      dbSession = await mongoose.startSession();
      await dbSession.withTransaction(async () => {
        await writeAll({ session: dbSession });
      });
      usedTxn = true;
    } catch (err) {
      if (!isTransactionUnsupported(err)) throw err;
    } finally {
      if (dbSession) dbSession.endSession();
    }

    if (!usedTxn) {
      // Standalone fallback: no transaction available.
      await writeAll({});
    }

    return {
      [aId]: { delta: deltas.a.delta, newRating: deltas.a.newRating },
      [bId]: { delta: deltas.b.delta, newRating: deltas.b.newRating },
    };
  }

  cleanup(matchId) {
    const session = this.sessions.get(matchId);
    if (!session) return;
    for (const uid of session.order) {
      if (this.userToMatch.get(uid) === matchId) this.userToMatch.delete(uid);
      const sock = this.io.sockets.sockets.get(session.players[uid].socketId);
      if (sock) sock.leave(matchId);
    }
    this.sessions.delete(matchId);
  }

  /** Clear every pending timer across all sessions (graceful shutdown). */
  shutdown() {
    for (const session of this.sessions.values()) {
      if (session.timers.setup) clearTimeout(session.timers.setup);
      if (session.timers.turn) clearTimeout(session.timers.turn);
      for (const t of Object.values(session.timers.reconnect)) clearTimeout(t);
      session.timers.setup = null;
      session.timers.turn = null;
      session.timers.reconnect = {};
    }
  }
}

function isTransactionUnsupported(err) {
  const msg = (err && err.message) || '';
  return (
    /Transaction numbers are only allowed on a replica set/i.test(msg) ||
    /Transactions are not supported/i.test(msg) ||
    /replica set/i.test(msg) ||
    (err && (err.code === 20 || err.codeName === 'IllegalOperation'))
  );
}

function mkPlayer(p, board) {
  return {
    userId: p.userId,
    username: p.username,
    rating: p.rating,
    socketId: p.socketId,
    board: board.slice(),
    ready: false,
    connected: true,
    timeouts: 0,
  };
}

function applyStats(user, outcome, newRating) {
  user.rating = newRating;
  user.peakRating = Math.max(user.peakRating || 0, newRating);
  user.gamesPlayed += 1;
  if (outcome === 'win') user.wins += 1;
  else if (outcome === 'loss') user.losses += 1;
  else user.draws += 1;
  user.lastSeen = new Date();
}

module.exports = { GameManager, PHASE };
