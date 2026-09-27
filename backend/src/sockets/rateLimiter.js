'use strict';

/**
 * Tiny per-socket token bucket to stop event flooding (e.g. spamming
 * game:call). Each socket gets `capacity` tokens that refill over time.
 */
class TokenBucket {
  constructor(capacity = 20, refillPerSec = 10) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSec = refillPerSec;
    this.last = Date.now();
  }

  allow(cost = 1) {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.last = now;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

module.exports = { TokenBucket };
