// Board model: holds the premium layout and the grid of placed tiles, with
// pure helpers used by validation, scoring and the AI. No DOM here.
//
// A placed tile is { letter: 'a'..'z', blank: boolean }. `blank` true means the
// tile came from a blank and therefore scores 0 points (but still spells the
// letter). Empty cells are null.

import { BOARD_SIZE, CENTER } from './constants.js';

export function createBoard(layout) {
  return {
    layout, // 15x15 premium codes
    cells: Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    ),
  };
}

export function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function cellAt(board, r, c) {
  return inBounds(r, c) ? board.cells[r][c] : undefined;
}

export function isEmpty(board, r, c) {
  return inBounds(r, c) && board.cells[r][c] === null;
}

export function isFilled(board, r, c) {
  return inBounds(r, c) && board.cells[r][c] !== null;
}

export function isBoardEmpty(board) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board.cells[r][c]) return false;
    }
  }
  return true;
}

// Place a list of {row, col, letter, blank} onto the board (mutates).
export function applyPlacement(board, placement) {
  for (const p of placement) {
    board.cells[p.row][p.col] = { letter: p.letter, blank: !!p.blank };
  }
}

// Does any placed cell touch an existing tile (orthogonally)?
export function touchesExisting(board, placement) {
  const placedSet = new Set(placement.map((p) => p.row * BOARD_SIZE + p.col));
  for (const p of placement) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = p.row + dr;
      const c = p.col + dc;
      if (isFilled(board, r, c) && !placedSet.has(r * BOARD_SIZE + c)) {
        return true;
      }
    }
  }
  return false;
}

export function coversCenter(placement) {
  return placement.some((p) => p.row === CENTER && p.col === CENTER);
}
