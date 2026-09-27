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
const { pickBotFor, chooseBotMove, botThinkDelayMs } = require('./bots');

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
      timers: { setup: null, turn: null, bot: null, reconnect: {} },
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
    // Sent per-player so each client syncs to its authoritative board (the one it
    // locked in, or the server-assigned board if it never submitted).
    for (const uid of session.order) {
      this.emitToUser(session, uid, 'game:start', {
        matchId: session.matchId,
        firstPlayer: session.match.turn,
        yourBoard: session.players[uid].board,
        turnSeconds: config.game.turnSeconds,
        turnDeadline,
      });
    }
    this.armTurnTimer(session);
    this.maybeBotMove(session);
    logger.info(`Match ${session.matchId} started`);
  }

  armTurnTimer(session) {
    if (session.timers.turn) clearTimeout(session.timers.turn);
    session.timers.turn = setTimeout(
      () => this.handleTurnTimeout(session),
      config.game.turnSeconds * 1000
    );
  }

  /**
   * If it is a bot's turn during play, schedule its move after a short,
   * human-like "thinking" pause. The turn timer still backstops it. No-ops for
   * human turns and never double-schedules.
   */
  maybeBotMove(session) {
    if (session.phase !== PHASE.PLAYING) return;
    const uid = session.match.turn;
    if (!uid) return;
    const player = session.players[uid];
    if (!player || !player.isBot) return;
    if (session.timers.bot) return; // already scheduled

    session.timers.bot = setTimeout(() => {
      session.timers.bot = null;
      // The game may have ended or the turn advanced while we waited.
      if (session.phase !== PHASE.PLAYING || session.match.turn !== uid) return;
      const number = chooseBotMove(session.match, uid, player.randomness);
      if (number == null) return;
      const res = session.match.call(uid, number, Date.now() - (session.startedAt || Date.now()));
      if (res.ok) this.applyCallResult(session, res.result, { auto: false });
    }, botThinkDelayMs());
  }

  /** Pair a waiting human with the closest-rated bot (no human available). */
  createBotMatch(entry) {
    const bot = pickBotFor(entry.rating);
    // Human is player A, bot is player B; createMatch randomizes who moves first.
    return this.createMatch(entry, bot);
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
    if (session.timers.bot) {
      clearTimeout(session.timers.bot);
      session.timers.bot = null;
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
      this.maybeBotMove(session);
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
    if (session.timers.bot) { clearTimeout(session.timers.bot); session.timers.bot = null; }
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
    if (session.timers.bot) { clearTimeout(session.timers.bot); session.timers.bot = null; }
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
    const pa = session.players[aId];
    const pb = session.players[bId];

    // Bots are ephemeral virtual players: not in the User collection, never gain
    // or lose rating/stats, never on the leaderboard. Load only human record(s).
    const a = pa.isBot ? null : await User.findById(aId);
    const b = pb.isBot ? null : await User.findById(bId);
    if ((!pa.isBot && !a) || (!pb.isBot && !b)) throw new Error('Player record missing');

    // ratingBefore is the SAME value fed to computeRatings (fresh DB rating for a
    // human, fixed roster rating for a bot), so ratingBefore + delta === ratingAfter.
    const beforeA = a ? a.rating : pa.rating;
    const beforeB = b ? b.rating : pb.rating;

    let deltas;
    if (rated) {
      // The human's delta already reflects the opponent's rating, so beating a
      // higher-rated bot yields more points and losing to a lower-rated one costs
      // more -- the same Elo math as a human opponent. A bot's own rating is fixed.
      const ratings = computeRatings(
        { rating: beforeA, gamesPlayed: a ? a.gamesPlayed : 0 },
        { rating: beforeB, gamesPlayed: b ? b.gamesPlayed : 0 },
        outcome
      );
      if (a) applyStats(a, isDraw ? 'draw' : winner === aId ? 'win' : 'loss', ratings.a.newRating);
      if (b) applyStats(b, isDraw ? 'draw' : winner === bId ? 'win' : 'loss', ratings.b.newRating);
      deltas = {
        a: a ? { newRating: ratings.a.newRating, delta: ratings.a.delta } : { newRating: beforeA, delta: 0 },
        b: b ? { newRating: ratings.b.newRating, delta: ratings.b.delta } : { newRating: beforeB, delta: 0 },
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
          userId: a ? a._id : aId, username: a ? a.username : pa.username,
          ratingBefore: beforeA, ratingAfter: deltas.a.newRating,
          ratingDelta: deltas.a.delta, board: session.match.boards[aId],
        },
        {
          userId: b ? b._id : bId, username: b ? b.username : pb.username,
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
      if (rated) {
        const saves = [];
        if (a) saves.push(a.save(opts));
        if (b) saves.push(b.save(opts));
        if (saves.length) await Promise.all(saves);
      }
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
      if (session.timers.bot) clearTimeout(session.timers.bot);
      for (const t of Object.values(session.timers.reconnect)) clearTimeout(t);
      session.timers.setup = null;
      session.timers.turn = null;
      session.timers.bot = null;
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
    ready: !!p.isBot,
    connected: true,
    isBot: !!p.isBot,
    randomness: p.randomness || 0,
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
