'use strict';

const { SIZE, LINES } = require('./lines');

const CELLS = SIZE * SIZE; // 25
const WIN_LINES = 5; // number of completed lines needed to win (B-I-N-G-O)

/**
 * Validate that a board is a legal bingo board:
 *   - an array of exactly 25 entries
 *   - every entry an integer in [1, 25]
 *   - each number 1..25 used exactly once (a permutation)
 *
 * Returns { valid: boolean, error?: string }.
 * This is the anti-cheat gate for client-submitted boards — never trust the
 * client to send a well-formed board.
 */
function validateBoard(board) {
  if (!Array.isArray(board)) {
    return { valid: false, error: 'Board must be an array.' };
  }
  if (board.length !== CELLS) {
    return { valid: false, error: `Board must have exactly ${CELLS} cells.` };
  }
  const seen = new Set();
  for (const raw of board) {
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
      return { valid: false, error: 'Board cells must be integers.' };
    }
    if (raw < 1 || raw > CELLS) {
      return { valid: false, error: `Board cells must be between 1 and ${CELLS}.` };
    }
    if (seen.has(raw)) {
      return { valid: false, error: `Duplicate number ${raw} on board.` };
    }
    seen.add(raw);
  }
  // seen.size === CELLS guaranteed by length + range + uniqueness
  return { valid: true };
}

/**
 * Generate a cryptographically-unbiased random permutation of 1..25.
 * Uses Fisher-Yates with crypto randomness so server-assigned boards are fair
 * and unpredictable.
 */
const crypto = require('crypto');
function randomBoard() {
  const board = [];
  for (let i = 1; i <= CELLS; i++) board.push(i);
  // Fisher-Yates shuffle with unbiased crypto random indices
  for (let i = board.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = board[i];
    board[i] = board[j];
    board[j] = tmp;
  }
  return board;
}

/**
 * Count how many of the 12 lines are fully covered by the called numbers.
 * @param {number[]} board  permutation of 1..25 (row-major)
 * @param {Set<number>} called  set of numbers already called
 * @returns {number} count of completed lines (0..12)
 */
function completedLines(board, called) {
  let count = 0;
  for (const line of LINES) {
    let full = true;
    for (const idx of line) {
      if (!called.has(board[idx])) {
        full = false;
        break;
      }
    }
    if (full) count++;
  }
  return count;
}

module.exports = {
  CELLS,
  WIN_LINES,
  validateBoard,
  randomBoard,
  completedLines,
};
