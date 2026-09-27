'use strict';

const { Server } = require('socket.io');
const { verifyToken } = require('../middleware/auth');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const User = require('../models/User');
const { Matchmaker } = require('./matchmaker');
const { GameManager } = require('./gameManager');
const { TokenBucket } = require('./rateLimiter');

/**
 * Extract the best-effort client IP from a raw handshake request. When we sit
 * behind a trusted proxy we honor the FIRST X-Forwarded-For hop; otherwise we
 * use the socket peer address so the value cannot be spoofed by a header.
 */
function clientIp(req) {
  if (config.security.trustProxy > 0) {
    const xff = req.headers && req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Wire Socket.IO onto an existing HTTP server. Handles authentication,
 * matchmaking, and per-socket event dispatch. All game rules are enforced by
 * GameManager / Match, not here.
 */
function attachSockets(httpServer) {
  // Fixed-window per-IP handshake counter. Enforced in allowRequest, BEFORE an
  // engine.io session is allocated, so a connection flood cannot exhaust memory
  // below the auth layer. Pruned in the periodic sweep.
  const hsHits = new Map(); // ip -> { count, resetAt }

  function handshakeAllowed(ip, now) {
    let e = hsHits.get(ip);
    if (!e || now >= e.resetAt) {
      e = { count: 0, resetAt: now + config.socket.handshakeWindowMs };
      hsHits.set(ip, e);
    }
    e.count += 1;
    return e.count <= config.socket.handshakeMaxPerIp;
  }

  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    // Cap payload size to blunt memory-based abuse.
    maxHttpBufferSize: 1e5, // 100 KB
    pingTimeout: 20000,
    // Gate NEW sessions before engine.io allocates any state: per-IP rate limit
    // + a global concurrent-connection ceiling.
    allowRequest: (req, cb) => {
      try {
        if (io.engine && io.engine.clientsCount >= config.socket.maxConnections) {
          return cb('SERVER_BUSY', false);
        }
        const now = Date.now();
        if (!handshakeAllowed(clientIp(req), now)) {
          return cb('RATE_LIMITED', false);
        }
        return cb(null, true);
      } catch (err) {
        return cb('SERVER_ERROR', false);
      }
    },
  });

  const matchmaker = new Matchmaker();
  const gm = new GameManager(io);
  const userSockets = new Map(); // userId -> socketId (latest)

  // Authenticate every socket from the handshake token.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).lean();
      if (!user) return next(new Error('AUTH_INVALID'));
      socket.data.userId = user._id.toString();
      socket.data.username = user.username;
      socket.data.rating = user.rating;
      return next();
    } catch (err) {
      return next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, username } = socket.data;
    socket.data.bucket = new TokenBucket(30, 15);

    // Enforce a single live socket per user; disconnect any stale one.
    const prev = userSockets.get(userId);
    if (prev && prev !== socket.id) {
      const prevSock = io.sockets.sockets.get(prev);
      if (prevSock) prevSock.disconnect(true);
    }
    userSockets.set(userId, socket.id);

    logger.info(`Socket connected: ${username} (${socket.id})`);

    // If the user was mid-match, resume it.
    if (gm.activeMatchIdForUser(userId)) {
      gm.handleReconnect(userId, socket.id);
    }

    const limited = (fn) => async (payload) => {
      if (!socket.data.bucket.allow()) {
        socket.emit('error', { code: 'RATE_LIMITED', message: 'Slow down.' });
        return;
      }
      try {
        await fn(payload);
      } catch (err) {
        logger.error(`Handler error for ${username}: ${err.message}`);
        socket.emit('error', { code: 'SERVER_ERROR', message: 'Something went wrong.' });
      }
    };

    socket.on('queue:join', limited(async () => {
      if (gm.activeMatchIdForUser(userId)) {
        socket.emit('error', { code: 'IN_GAME', message: 'You are already in a game.' });
        return;
      }
      // Read the CURRENT rating from the DB rather than the value cached at
      // handshake, so a long-lived socket can't keep matchmaking at a stale band.
      let rating = socket.data.rating;
      const fresh = await User.findById(userId).select('rating').lean();
      if (fresh && typeof fresh.rating === 'number') {
        rating = fresh.rating;
        socket.data.rating = rating;
      }
      const entry = { userId, username, rating, socketId: socket.id, joinedAt: Date.now() };
      const result = matchmaker.addAndMatch(entry, Date.now());
      if (result && result.full) {
        socket.emit('error', { code: 'QUEUE_FULL', message: 'Matchmaking is busy, please retry shortly.' });
        return;
      }
      if (result) {
        gm.createMatch(result.a, result.b);
      } else {
        socket.emit('queue:waiting', { size: matchmaker.size() });
      }
    }));

    socket.on('queue:leave', limited(() => {
      matchmaker.remove(userId);
      socket.emit('queue:left', {});
    }));

    socket.on('board:submit', limited((payload) => {
      const board = payload && payload.board;
      const res = gm.submitBoard(userId, board);
      if (!res.ok) socket.emit('error', { code: res.error, message: res.message });
    }));

    socket.on('game:call', limited((payload) => {
      const number = payload && payload.number;
      const res = gm.handleCall(userId, number);
      if (!res.ok) socket.emit('error', { code: res.error, message: res.message });
    }));

    socket.on('game:leave', limited(() => {
      gm.handleForfeit(userId, 'FORFEIT');
    }));

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${username} (${socket.id})`);
      // Only clear the mapping if this socket is still the active one.
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId);
        matchmaker.remove(userId);
        gm.handleDisconnect(userId);
      }
    });
  });

  // Periodically: pair long-waiting players, evict stale queue entries, and
  // prune the handshake-rate map.
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    const pairs = matchmaker.sweep(now);
    for (const pair of pairs) gm.createMatch(pair.a, pair.b);

    // No human opponent within the fallback window -> match with a bot so a lone
    // player is never stuck. Runs AFTER human pairing so two real players who
    // arrive close together still match each other.
    if (config.matchmaking.botsEnabled) {
      const lonely = matchmaker.takeStaleForBot(now, config.matchmaking.botFallbackMs);
      for (const entry of lonely) gm.createBotMatch(entry);
    }

    const evicted = matchmaker.evictStale(now);
    for (const e of evicted) {
      io.to(e.socketId).emit('queue:timeout', { message: 'No opponent found. Please try again.' });
    }

    for (const [ip, e] of hsHits) {
      if (now >= e.resetAt) hsHits.delete(ip);
    }
  }, 3000);
  sweepInterval.unref && sweepInterval.unref();

  return { io, matchmaker, gm, stop: () => { clearInterval(sweepInterval); gm.shutdown(); } };
}

module.exports = { attachSockets };
