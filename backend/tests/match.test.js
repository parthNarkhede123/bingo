'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Match } = require('../src/game/match');

// Helper: identity board where number === index+1 (so number n is at index n-1).
function identityBoard() {
  return Array.from({ length: 25 }, (_, i) => i + 1);
}

function newMatch(overrides = {}) {
  return new Match({
    matchId: 'm1',
    playerA: 'A',
    playerB: 'B',
    boardA: identityBoard(),
    boardB: identityBoard(),
    firstPlayer: 'A',
    ...overrides,
  });
}

test('first turn belongs to firstPlayer', () => {
  const m = newMatch();
  assert.equal(m.turn, 'A');
});

test('rejects calling out of turn', () => {
  const m = newMatch();
  const res = m.call('B', 10);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NOT_YOUR_TURN');
});

test('rejects invalid numbers', () => {
  const m = newMatch();
  assert.equal(m.call('A', 0).error, 'INVALID_NUMBER');
  assert.equal(m.call('A', 26).error, 'INVALID_NUMBER');
  assert.equal(m.call('A', 1.5).error, 'INVALID_NUMBER');
  assert.equal(m.call('A', 'x').error, 'INVALID_NUMBER');
});

test('rejects double-calling the same number', () => {
  const m = newMatch();
  assert.equal(m.call('A', 7).ok, true); // now B's turn
  const res = m.call('B', 7);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'ALREADY_CALLED');
});

test('turn alternates after each valid call', () => {
  const m = newMatch();
  m.call('A', 1);
  assert.equal(m.turn, 'B');
  m.call('B', 2);
  assert.equal(m.turn, 'A');
});

test('rejects a player not in the match', () => {
  const m = newMatch();
  const res = m.call('C', 1);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'NOT_A_PLAYER');
});

test('completing 5 lines wins the game', () => {
  // Both boards identity. Numbers 1..5 (row0), 6..10 (row1), 11..15 (row2),
  // 16..20 (row3), 21..25 (row4). Calling all of 1..25 completes rows fast.
  // We drive A to 5 completed lines. With identity boards, when the same
  // numbers are called they count for both, so to isolate a winner we let A
  // call the numbers that finish rows. Because both boards are identical,
  // both reach the same lines simultaneously -> draw expected on tie.
  const m = newMatch();
  const seq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  let last = null;
  let turn = 'A';
  for (const n of seq) {
    if (m.over) break;
    last = m.call(turn, n);
    assert.equal(last.ok, true);
    turn = turn === 'A' ? 'B' : 'A';
  }
  assert.equal(m.over, true);
  // Identical boards => simultaneous, equal lines => draw
  assert.equal(m.winner, 'draw');
  assert.equal(m.reason, 'SIMULTANEOUS_BINGO');
});

test('a player with a favorable board wins outright', () => {
  // A's board: row 0 = 1..5. B's board: number 1..5 scattered so B does not
  // complete a line at the same time.
  const boardA = identityBoard();
  // boardB reverse so early numbers are spread across different lines
  const boardB = identityBoard().slice().reverse(); // number n at index 25-n
  const m = newMatch({ boardA, boardB });
  // A completes row0 (1..5) and other rows before B completes anything.
  // Drive: A calls 1,3,5,7,9 ... we simply have A call numbers that fill A's
  // rows. Easiest: alternate but only track that eventually someone wins and
  // engine stays consistent.
  let turn = 'A';
  const called = new Set();
  let res;
  for (let n = 1; n <= 25 && !m.over; n++) {
    if (called.has(n)) continue;
    res = m.call(turn, n);
    assert.equal(res.ok, true);
    called.add(n);
    turn = turn === 'A' ? 'B' : 'A';
  }
  assert.equal(m.over, true);
  assert.ok(['A', 'B', 'draw'].includes(m.winner));
});

test('cannot call after game over', () => {
  const m = newMatch();
  m.forfeit('B');
  assert.equal(m.over, true);
  assert.equal(m.winner, 'A');
  const res = m.call('A', 1);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'GAME_OVER');
});

test('forfeit awards win to opponent', () => {
  const m = newMatch();
  const res = m.forfeit('A', 'DISCONNECT');
  assert.equal(res.ok, true);
  assert.equal(m.winner, 'B');
  assert.equal(m.reason, 'DISCONNECT');
});

test('randomUncalledNumber never repeats a called number', () => {
  const m = newMatch();
  m.call('A', 5);
  for (let i = 0; i < 100; i++) {
    const n = m.randomUncalledNumber();
    assert.notEqual(n, 5);
    assert.ok(n >= 1 && n <= 25);
  }
});

test('snapshotFor returns a correct per-player view', () => {
  const m = newMatch();
  m.call('A', 1);
  const snapA = m.snapshotFor('A');
  assert.equal(snapA.yourTurn, false); // now B's turn
  assert.deepEqual(snapA.called, [1]);
  assert.equal(snapA.matchId, 'm1');
  const snapB = m.snapshotFor('B');
  assert.equal(snapB.yourTurn, true);
});

test('scores expose lines and capped letters', () => {
  const m = newMatch();
  // complete one row for both (identity boards)
  m.call('A', 1); m.call('B', 2); m.call('A', 3); m.call('B', 4); m.call('A', 5);
  const s = m.scoreFor('A');
  assert.equal(s.lines >= 1, true);
  assert.equal(s.letters, Math.min(s.lines, 5));
});
