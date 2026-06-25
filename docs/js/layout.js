// Board premium-square layouts: the fixed standard board, plus an algorithmic
// randomized generator with balancing rules. A randomized layout is produced
// deterministically from a seed so it can be stored in the game record and
// reproduced identically for both players.

import {
  BOARD_SIZE, CENTER, PREMIUM, PREMIUM_COUNTS, STANDARD_LAYOUT,
} from './constants.js';
import { mulberry32 } from './rng.js';

export function standardLayout() {
  // Return a deep copy so callers can't mutate the shared constant.
  return STANDARD_LAYOUT.map((row) => row.slice());
}

// Chebyshev (king-move) distance between two cells.
function cheb(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

// Generate a balanced random layout from a seed.
// Balancing rules:
//   - Same premium counts as the standard board (8 TW, 16 DW, 12 TL, 24 DL).
//   - Center stays a STAR (double-word) so the opening play always works.
//   - No two Triple-Word squares within Chebyshev distance 2 (no heavy
//     clustering of the most powerful square).
//   - No premium on the center, and never two premiums on one cell.
//   - 4-fold symmetry is intentionally NOT enforced, to keep boards varied.
export function randomizedLayout(seed) {
  const rng = mulberry32(seed >>> 0);
  const grid = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => PREMIUM.NONE)
  );
  grid[CENTER][CENTER] = PREMIUM.STAR;

  // All candidate cells except the center, in a seeded random order.
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (r === CENTER && c === CENTER) continue;
      cells.push([r, c]);
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const used = new Set();
  const key = (r, c) => r * BOARD_SIZE + c;

  // Place Triple-Word squares first with a spacing constraint.
  const twPlaced = [];
  let idx = 0;
  while (twPlaced.length < PREMIUM_COUNTS.TW && idx < cells.length) {
    const cell = cells[idx++];
    if (used.has(key(cell[0], cell[1]))) continue;
    const tooClose = twPlaced.some((p) => cheb(p, cell) < 2);
    if (tooClose) continue;
    grid[cell[0]][cell[1]] = PREMIUM.TW;
    twPlaced.push(cell);
    used.add(key(cell[0], cell[1]));
  }

  // Fill the remaining premiums from the leftover shuffled cells.
  const remaining = cells.filter((c) => !used.has(key(c[0], c[1])));
  let p = 0;
  const place = (code, count) => {
    for (let k = 0; k < count && p < remaining.length; k++) {
      const [r, c] = remaining[p++];
      grid[r][c] = PREMIUM[code];
    }
  };
  place('DW', PREMIUM_COUNTS.DW);
  place('TL', PREMIUM_COUNTS.TL);
  place('DL', PREMIUM_COUNTS.DL);

  return grid;
}

// Registry of available board modes, so new modes can be added in one place.
export const BOARD_MODES = {
  standard: { id: 'standard', name: 'Standard', build: () => standardLayout() },
  randomized: {
    id: 'randomized',
    name: 'Randomized',
    build: (seed) => randomizedLayout(seed),
  },
};

export function buildLayout(mode, seed) {
  const m = BOARD_MODES[mode] || BOARD_MODES.standard;
  return m.build(seed);
}
