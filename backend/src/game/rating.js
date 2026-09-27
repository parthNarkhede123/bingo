'use strict';

/**
 * Standard Elo rating computation.
 *
 * expected(myRating, oppRating) = 1 / (1 + 10^((opp - my) / 400))
 * newRating = round(my + K * (score - expected))
 * where score is 1 (win), 0.5 (draw), 0 (loss).
 *
 * K-factor is provisional-aware: new players (fewer games) move faster so the
 * ladder converges quickly, then settles down.
 */
const BASE_RATING = 1000;

function kFactor(gamesPlayed, rating) {
  if (gamesPlayed < 30) return 40; // provisional players move fast
  if (rating >= 2100) return 16; // masters move slow (stability at the top)
  return 24;
}

function expectedScore(myRating, oppRating) {
  return 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
}

/**
 * Compute new ratings for both players after a decided match.
 * @param {{rating:number, gamesPlayed:number}} a
 * @param {{rating:number, gamesPlayed:number}} b
 * @param {'a'|'b'|'draw'} outcome
 * @returns {{ a: {newRating, delta}, b: {newRating, delta} }}
 */
function computeRatings(a, b, outcome) {
  const scoreA = outcome === 'a' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const scoreB = outcome === 'b' ? 1 : outcome === 'draw' ? 0.5 : 0;

  const expA = expectedScore(a.rating, b.rating);
  const expB = expectedScore(b.rating, a.rating);

  const kA = kFactor(a.gamesPlayed, a.rating);
  const kB = kFactor(b.gamesPlayed, b.rating);

  const newA = Math.round(a.rating + kA * (scoreA - expA));
  const newB = Math.round(b.rating + kB * (scoreB - expB));

  // Ratings never drop below a floor to avoid negative/degenerate values.
  const floor = 100;
  const finalA = Math.max(floor, newA);
  const finalB = Math.max(floor, newB);

  return {
    a: { newRating: finalA, delta: finalA - a.rating },
    b: { newRating: finalB, delta: finalB - b.rating },
  };
}

module.exports = { BASE_RATING, kFactor, expectedScore, computeRatings };
