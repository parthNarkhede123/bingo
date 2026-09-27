'use strict';

/**
 * Precomputed index sets for every possible bingo line on a 5x5 board.
 *
 * The board is stored row-major: index = row * 5 + col.
 * There are 12 lines total:
 *   - 5 horizontal rows
 *   - 5 vertical columns
 *   - 2 diagonals
 *
 * A line is "complete" for a player when every cell (number) on that line
 * has been called. Because every board is a permutation of 1..25, a line is
 * complete iff all five of its numbers appear in the set of called numbers.
 */

const SIZE = 5;

function buildLines() {
  const lines = [];

  // Rows
  for (let r = 0; r < SIZE; r++) {
    const line = [];
    for (let c = 0; c < SIZE; c++) line.push(r * SIZE + c);
    lines.push(line);
  }

  // Columns
  for (let c = 0; c < SIZE; c++) {
    const line = [];
    for (let r = 0; r < SIZE; r++) line.push(r * SIZE + c);
    lines.push(line);
  }

  // Main diagonal (top-left -> bottom-right)
  const diag1 = [];
  for (let i = 0; i < SIZE; i++) diag1.push(i * SIZE + i);
  lines.push(diag1);

  // Anti-diagonal (top-right -> bottom-left)
  const diag2 = [];
  for (let i = 0; i < SIZE; i++) diag2.push(i * SIZE + (SIZE - 1 - i));
  lines.push(diag2);

  return lines;
}

const LINES = buildLines();

module.exports = { SIZE, LINES };
