'use strict';

/**
 * Tiny indirection so routes/services can push a live nudge to a player without
 * importing the socket layer directly. Sockets only NOTIFY; all authority lives
 * in the REST handlers + resolver. attachSockets() registers the notifier at
 * boot; before that (and in unit tests) notify() is a no-op.
 */
let notifier = null;

function setNotifier(fn) {
  notifier = typeof fn === 'function' ? fn : null;
}

function notify(userId, event, payload) {
  if (notifier && userId) {
    try {
      notifier(String(userId), event, payload || {});
    } catch (_) {
      /* never let a notification failure break a request */
    }
  }
}

module.exports = { setNotifier, notify };
