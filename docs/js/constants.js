// Core game constants: board size, tile points, tile distribution, premium layouts.
// Pure data + tiny helpers — no DOM, no game state. Importable in Node for tests.

export const BOARD_SIZE = 15;
export const RACK_SIZE = 7;
export const CENTER = 7; // center square index (0-based) -> (7,7)
export const BINGO_BONUS = 50; // using all 7 tiles in one play

// Standard English Scrabble letter point values. Blank = 0.
export const LETTER_POINTS = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8,
  k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1,
  u: 1, v: 4, w: 4, x: 8, y: 4, z: 10, '?': 0,
};

// Standard 100-tile distribution. '?' is the blank.
export const TILE_DISTRIBUTION = {
  a: 9, b: 2, c: 2, d: 4, e: 12, f: 2, g: 3, h: 2, i: 9, j: 1,
  k: 1, l: 4, m: 2, n: 6, o: 8, p: 2, q: 1, r: 6, s: 4, t: 6,
  u: 4, v: 2, w: 2, x: 1, y: 2, z: 1, '?': 2,
};

// Premium square types.
export const PREMIUM = {
  NONE: '',
  DL: 'DL', // double letter
  TL: 'TL', // triple letter
  DW: 'DW', // double word
  TW: 'TW', // triple word
  STAR: 'STAR', // center; acts as a double-word square
};

export const PREMIUM_MULT = {
  [PREMIUM.DL]: { letter: 2, word: 1 },
  [PREMIUM.TL]: { letter: 3, word: 1 },
  [PREMIUM.DW]: { letter: 1, word: 2 },
  [PREMIUM.TW]: { letter: 1, word: 3 },
  [PREMIUM.STAR]: { letter: 1, word: 2 },
  [PREMIUM.NONE]: { letter: 1, word: 1 },
};

// Standard board premium layout, expressed as coordinate lists [row, col].
// This is the classic tournament Scrabble arrangement.
const STD = {
  TW: [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]],
  DW: [
    [1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10],
    [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10],
  ],
  TL: [
    [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
  ],
  DL: [
    [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
    [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
    [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
    [12, 6], [12, 8], [14, 3], [14, 11],
  ],
};

// Build a 15x15 grid of premium codes from a {TW,DW,TL,DL} coordinate spec.
export function buildLayoutFromSpec(spec) {
  const grid = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => PREMIUM.NONE)
  );
  for (const code of ['TW', 'DW', 'TL', 'DL']) {
    for (const [r, c] of spec[code] || []) grid[r][c] = PREMIUM[code];
  }
  grid[CENTER][CENTER] = PREMIUM.STAR;
  return grid;
}

export const STANDARD_LAYOUT = buildLayoutFromSpec(STD);

// How many of each premium the standard board uses (used to balance random boards).
export const PREMIUM_COUNTS = {
  TW: STD.TW.length, // 8
  DW: STD.DW.length, // 16
  TL: STD.TL.length, // 12
  DL: STD.DL.length, // 24
};
