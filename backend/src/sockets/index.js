'use strict';

const { Server } = require('socket.io');
const { verifyToken } = require('../middleware/auth');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const User = require('../models/User');
const { TokenBucket } = require('./rateLimiter');
const { setNotifier } = require('../realtime');

/**
 * Best-effort client IP from a raw handshake request. Behind a trusted proxy we
 * honor the FIRST X-Forwarded-For hop; otherwise the socket peer address, which
 * cannot be spoofed by a header.
 */
function clientIp(req) {
  if (config.security.trustProxy > 0) {
    const xff = req.headers && req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Wire Socket.IO onto an existing HTTP server. In Ironhold sockets are used ONLY
 * for live nudges (hold:update, attack:incoming, march:resolved, trade:accepted,
 * report:new) — never for gameplay authority. This layer handles authentication,
 * a per-IP handshake rate limit, a global connection ceiling, and single-socket-
 * per-user enforcement, then registers a notifier the rest of the app can call.
 */
function attachSockets(httpServer) {
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
    maxHttpBufferSize: 1e5, // 100 KB
    pingTimeout: 20000,
    allowRequest: (req, cb) => {
      try {
        if (io.engine && io.engine.clientsCount >= config.socket.maxConnections) {
          return cb('SERVER_BUSY', false);
        }
        if (!handshakeAllowed(clientIp(req), Date.now())) {
          return cb('RATE_LIMITED', false);
        }
        return cb(null, true);
      } catch (err) {
        return cb('SERVER_ERROR', false);
      }
    },
  });

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
    // Join a per-user room so notify() can target every one of a user's sockets.
    socket.join(`user:${userId}`);
    logger.info(`Socket connected: ${username} (${socket.id})`);

    // The client may ask to re-sync; we simply ack (state comes from REST).
    socket.on('ping:sync', () => {
      if (socket.data.bucket.allow()) socket.emit('sync:ack', { at: Date.now() });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${username} (${socket.id})`);
      if (userSockets.get(userId) === socket.id) userSockets.delete(userId);
    });
  });

  // Register the app-wide notifier: emit an event into a user's room.
  setNotifier((uid, event, payload) => io.to(`user:${uid}`).emit(event, payload));

  // Prune the handshake-rate map periodically (memory hygiene only).
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hsHits) {
      if (now >= e.resetAt) hsHits.delete(ip);
    }
  }, 30000);
  sweepInterval.unref && sweepInterval.unref();

  return {
    io,
    stop: () => {
      clearInterval(sweepInterval);
      setNotifier(null);
    },
  };
}

module.exports = { attachSockets };
