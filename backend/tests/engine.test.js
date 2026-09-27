'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateBoard,
  randomBoard,
  completedLines,
  CELLS,
  WIN_LINES,
} = require('../src/game/engine');
const { LINES } = require('../src/game/lines');

test('there are exactly 12 lines', () => {
  assert.equal(LINES.length, 12);
  for (const line of LINES) assert.equal(line.length, 5);
});

test('validateBoard accepts a valid permutation', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.equal(validateBoard(board).valid, true);
});

test('validateBoard rejects wrong length', () => {
  assert.equal(validateBoard([1, 2, 3]).valid, false);
  assert.equal(validateBoard(Array(26).fill(1)).valid, false);
});

test('validateBoard rejects duplicates', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  board[0] = board[1]; // duplicate
  assert.equal(validateBoard(board).valid, false);
});

test('validateBoard rejects out-of-range numbers', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  board[0] = 26;
  assert.equal(validateBoard(board).valid, false);
  board[0] = 0;
  assert.equal(validateBoard(board).valid, false);
});

test('validateBoard rejects non-integers and non-arrays', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  board[0] = 1.5;
  assert.equal(validateBoard(board).valid, false);
  board[0] = '1';
  assert.equal(validateBoard(board).valid, false);
  assert.equal(validateBoard('not an array').valid, false);
  assert.equal(validateBoard(null).valid, false);
});

test('randomBoard always produces a valid, unique permutation', () => {
  for (let i = 0; i < 200; i++) {
    const b = randomBoard();
    assert.equal(validateBoard(b).valid, true);
  }
});

test('completedLines counts a full row', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  // first row = numbers 1..5
  const called = new Set([1, 2, 3, 4, 5]);
  assert.equal(completedLines(board, called), 1);
});

test('completedLines counts a full column', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  // column 0 = indices 0,5,10,15,20 => numbers 1,6,11,16,21
  const called = new Set([1, 6, 11, 16, 21]);
  assert.equal(completedLines(board, called), 1);
});

test('completedLines counts both diagonals', () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  // main diag: 0,6,12,18,24 => 1,7,13,19,25
  // anti diag: 4,8,12,16,20 => 5,9,13,17,21
  const called = new Set([1, 7, 13, 19, 25, 5, 9, 17, 21]);
  assert.equal(completedLines(board, called), 2);
});

test('completedLines returns 12 when all numbers called', () => {
  const board = randomBoard();
  const called = new Set(Array.from({ length: 25 }, (_, i) => i + 1));
  assert.equal(completedLines(board, called), 12);
});

test('constants are correct', () => {
  assert.equal(CELLS, 25);
  assert.equal(WIN_LINES, 5);
});
