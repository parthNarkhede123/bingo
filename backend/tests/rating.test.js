'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRatings, expectedScore, kFactor, BASE_RATING } = require('../src/game/rating');

test('base rating is 1000', () => {
  assert.equal(BASE_RATING, 1000);
});

test('expectedScore is 0.5 for equal ratings', () => {
  assert.ok(Math.abs(expectedScore(1000, 1000) - 0.5) < 1e-9);
});

test('higher-rated player has expected score > 0.5', () => {
  assert.ok(expectedScore(1400, 1000) > 0.5);
  assert.ok(expectedScore(1000, 1400) < 0.5);
});

test('kFactor is provisional for new players', () => {
  assert.equal(kFactor(0, 1000), 40);
  assert.equal(kFactor(29, 1000), 40);
  assert.equal(kFactor(30, 1000), 24);
  assert.equal(kFactor(100, 2100), 16);
});

test('winner gains, loser loses, and it is roughly symmetric for equal K', () => {
  const a = { rating: 1000, gamesPlayed: 100 };
  const b = { rating: 1000, gamesPlayed: 100 };
  const r = computeRatings(a, b, 'a');
  assert.ok(r.a.delta > 0);
  assert.ok(r.b.delta < 0);
  // equal ratings, equal K => symmetric magnitude
  assert.equal(r.a.delta, -r.b.delta);
});

test('draw between equal players changes nothing', () => {
  const a = { rating: 1200, gamesPlayed: 100 };
  const b = { rating: 1200, gamesPlayed: 100 };
  const r = computeRatings(a, b, 'draw');
  assert.equal(r.a.delta, 0);
  assert.equal(r.b.delta, 0);
});

test('beating a much stronger player yields a big gain', () => {
  const a = { rating: 1000, gamesPlayed: 100 };
  const b = { rating: 1600, gamesPlayed: 100 };
  const r = computeRatings(a, b, 'a');
  assert.ok(r.a.delta > 15); // close to full K=24
});

test('rating never drops below the floor of 100', () => {
  const a = { rating: 105, gamesPlayed: 100 };
  const b = { rating: 2000, gamesPlayed: 100 };
  const r = computeRatings(a, b, 'b');
  assert.ok(r.a.newRating >= 100);
});
