// AI opponent: generates legal moves with a trie-based generator (cross-checked
// left-part / extend-right, after Appel & Jacobson) and selects one according to
// a difficulty tier. Every generated candidate is re-validated with the same
// validator used for human moves, so the AI can never make an illegal play.

import { BOARD_SIZE, CENTER, LETTER_POINTS } from './constants.js';
import { createBoard } from './board.js';
import { isWord, getTrie } from './dictionary.js';
import { validateMove } from './validation.js';
import { scoreMove } from './scoring.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Difficulty tiers, easiest -> hardest.
export const DIFFICULTIES = [
  { id: 'beginner', name: 'Beginner', blurb: 'Plays simple, low-value words.' },
  { id: 'easy', name: 'Easy', blurb: 'Plays a random legal word.' },
  { id: 'intermediate', name: 'Intermediate', blurb: 'Aims for middling scores.' },
  { id: 'advanced', name: 'Advanced', blurb: 'Usually picks a strong play.' },
  { id: 'expert', name: 'Expert', blurb: 'Always plays its highest-scoring word.' },
  { id: 'master', name: 'Master', blurb: 'Maximizes score and plays strategically.' },
];

// Build a transposed view of a board so the across-generator also yields
// down-words. Layout and cells are both transposed.
function transpose(board) {
  const t = createBoard(
    board.layout[0].map((_, c) => board.layout.map((row) => row[c]))
  );
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) t.cells[r][c] = board.cells[c][r];
  }
  return t;
}

function filled(board, r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board.cells[r][c] !== null;
}

// Precompute, for an across pass, the set of letters allowed at each empty
// square so the vertical (cross) word stays valid. null => no vertical
// neighbours (any letter, no cross word). A Set => only those letters work.
function computeCrossChecks(board) {
  const checks = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(undefined));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (filled(board, r, c)) continue;
      // read up
      let up = '';
      let rr = r - 1;
      while (filled(board, rr, c)) { up = board.cells[rr][c].letter + up; rr--; }
      let down = '';
      rr = r + 1;
      while (filled(board, rr, c)) { down += board.cells[rr][c].letter; rr++; }
      if (up === '' && down === '') {
        checks[r][c] = null;
      } else {
        const set = new Set();
        for (const x of ALPHABET) {
          if (isWord(up + x + down)) set.add(x);
        }
        checks[r][c] = set;
      }
    }
  }
  return checks;
}

function isAnchor(board, r, c) {
  if (filled(board, r, c)) return false;
  return filled(board, r - 1, c) || filled(board, r + 1, c) ||
    filled(board, r, c - 1) || filled(board, r, c + 1);
}

// Generate across moves for one board orientation. Calls emit(placements) with
// raw [{row,col,letter,blank}] candidates (legality is re-checked later).
function generateAcross(board, rackCounts, trie, emit, firstMove) {
  const cross = computeCrossChecks(board);

  function extendRight(node, r, c, placements) {
    if (c >= BOARD_SIZE) {
      if (node.w && placements.length > 0) emit(placements);
      return;
    }
    if (filled(board, r, c)) {
      const L = board.cells[r][c].letter;
      const child = node.c.get(L);
      if (child) extendRight(child, r, c + 1, placements);
      return;
    }
    // Empty square: a word may end before it.
    if (node.w && placements.length > 0) emit(placements);
    const allowed = cross[r][c]; // null = any, Set = restricted
    for (const [L, child] of node.c) {
      if (allowed !== null && !allowed.has(L)) continue;
      if (rackCounts[L] > 0) {
        rackCounts[L]--;
        placements.push({ row: r, col: c, letter: L, blank: false });
        extendRight(child, r, c + 1, placements);
        placements.pop();
        rackCounts[L]++;
      }
      if (rackCounts['?'] > 0) {
        rackCounts['?']--;
        placements.push({ row: r, col: c, letter: L, blank: true });
        extendRight(child, r, c + 1, placements);
        placements.pop();
        rackCounts['?']++;
      }
    }
  }

  function leftPart(node, r, anchorCol, limit, placedLeft) {
    // Start an ExtendRight from the anchor with the current left part already
    // laid down to the left of the anchor.
    extendRight(node, r, anchorCol, placedLeft.slice());
    if (limit <= 0) return;
    for (const [L, child] of node.c) {
      const col = anchorCol - placedLeft.length - 1;
      if (col < 0) break;
      if (rackCounts[L] > 0) {
        rackCounts[L]--;
        leftPart(child, r, anchorCol, limit - 1, [...placedLeft, { row: r, col, letter: L, blank: false }]);
        rackCounts[L]++;
      }
      if (rackCounts['?'] > 0) {
        rackCounts['?']--;
        leftPart(child, r, anchorCol, limit - 1, [...placedLeft, { row: r, col, letter: L, blank: true }]);
        rackCounts['?']++;
      }
    }
  }

  const rackSize = Object.values(rackCounts).reduce((a, b) => a + b, 0);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const anchorHere = firstMove ? (r === CENTER && c === CENTER) : isAnchor(board, r, c);
      if (!anchorHere) continue;
      if (filled(board, r, c - 1)) {
        // Fixed prefix from existing tiles to the left.
        let prefix = '';
        let pc = c - 1;
        while (filled(board, r, pc)) { prefix = board.cells[r][pc].letter + prefix; pc--; }
        let node = trie;
        let ok = true;
        for (const ch of prefix) { node = node.c.get(ch); if (!node) { ok = false; break; } }
        if (ok) extendRight(node, r, c, []);
      } else {
        // Count empty squares to the left available for the left part.
        let limit = 0;
        let pc = c - 1;
        while (pc >= 0 && !filled(board, r, pc) && !isAnchor(board, r, pc)) { limit++; pc--; }
        limit = Math.min(limit, rackSize - 1);
        leftPart(trie, r, c, limit, []);
      }
    }
  }
}

// Generate ALL legal moves with scores. Returns [{placement, words, score, bingo}].
export function generateMoves(board, rack) {
  const trie = getTrie();
  const rackCounts = { '?': 0 };
  for (const t of rack) rackCounts[t] = (rackCounts[t] || 0) + 1;
  if (!rackCounts['?']) rackCounts['?'] = 0;

  const firstMove = board.cells.every((row) => row.every((cell) => cell === null));
  const seen = new Set();
  const moves = [];

  const tryEmit = (placement, mapBack) => {
    // Snapshot: the generator reuses one placements array via push/pop.
    const real = mapBack
      ? placement.map((p) => ({ ...p, row: p.col, col: p.row }))
      : placement.map((p) => ({ ...p }));
    const sig = real
      .map((p) => `${p.row},${p.col},${p.letter},${p.blank ? 1 : 0}`)
      .sort()
      .join('|');
    if (seen.has(sig)) return;
    seen.add(sig);
    const v = validateMove(board, real);
    if (!v.valid) return;
    const s = scoreMove(board, real, v.words);
    moves.push({ placement: real, words: v.words, score: s.score, bingo: s.bingo });
  };

  // Across.
  generateAcross(board, { ...rackCounts }, trie, (pl) => tryEmit(pl, false), firstMove);
  // Down (via transpose).
  const tb = transpose(board);
  generateAcross(tb, { ...rackCounts }, trie, (pl) => tryEmit(pl, true), firstMove);

  return moves;
}

// --- Strategic rack-leave evaluation (used by the Master tier) ---
// A rough heuristic: reward keeping balanced, flexible racks.
function leaveValue(remaining) {
  let v = 0;
  const counts = {};
  for (const t of remaining) counts[t] = (counts[t] || 0) + 1;
  // Keeping an S or a blank is valuable.
  v += (counts.s || 0) * 4;
  v += (counts['?'] || 0) * 12;
  // Q without U is awkward.
  if (counts.q && !counts.u) v -= 6;
  // Duplicates are slightly bad.
  for (const [, n] of Object.entries(counts)) if (n > 1) v -= (n - 1) * 1.5;
  // Too many high-value consonants left is bad for the next turn.
  for (const t of remaining) {
    const pts = LETTER_POINTS[t] || 0;
    if (pts >= 8) v -= 2;
  }
  // Reward a workable vowel/consonant mix.
  const vowels = remaining.filter((t) => 'aeiou'.includes(t)).length;
  const ideal = remaining.length * 0.4;
  v -= Math.abs(vowels - ideal) * 1.5;
  return v;
}

function remainingRack(rack, placement) {
  const used = {};
  for (const p of placement) {
    const key = p.blank ? '?' : p.letter;
    used[key] = (used[key] || 0) + 1;
  }
  const left = [];
  const pool = { ...used };
  for (const t of rack) {
    if (pool[t] > 0) pool[t]--;
    else left.push(t);
  }
  return left;
}

// Penalty for handing the opponent an easy triple-word square: count new tiles
// placed orthogonally adjacent to an empty TW square.
function exposurePenalty(board, placement) {
  let pen = 0;
  for (const p of placement) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = p.row + dr;
      const c = p.col + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE &&
        board.layout[r][c] === 'TW' && board.cells[r][c] === null) {
        pen += 3;
      }
    }
  }
  return pen;
}

function pickFromBand(sorted, lo, hi) {
  // sorted is ascending by score. lo/hi are fractions [0,1].
  if (sorted.length === 0) return null;
  const a = Math.floor(sorted.length * lo);
  const b = Math.max(a, Math.ceil(sorted.length * hi) - 1);
  const idx = a + Math.floor(Math.random() * (b - a + 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

// Choose a move for the given difficulty. Returns a move object or null
// (caller should then swap/pass). rack is the full rack (for leave evaluation).
export function chooseMove(board, rack, difficulty) {
  const moves = generateMoves(board, rack);
  if (moves.length === 0) return null;
  const sorted = [...moves].sort((a, b) => a.score - b.score); // ascending

  switch (difficulty) {
    case 'beginner':
      // Prefer short, low-value words; ignore the strongest plays entirely.
      return pickFromBand(sorted.filter((m) => m.placement.length <= 4).length
        ? sorted.filter((m) => m.placement.length <= 4)
        : sorted, 0, 0.35);
    case 'easy':
      return sorted[Math.floor(Math.random() * sorted.length)];
    case 'intermediate':
      return pickFromBand(sorted, 0.35, 0.7);
    case 'advanced':
      return pickFromBand(sorted, 0.75, 1.0);
    case 'expert':
      return sorted[sorted.length - 1];
    case 'master': {
      let best = null;
      let bestVal = -Infinity;
      for (const m of moves) {
        const left = remainingRack(rack, m.placement);
        const val = m.score + leaveValue(left) - exposurePenalty(board, m.placement);
        if (val > bestVal) { bestVal = val; best = m; }
      }
      return best;
    }
    default:
      return sorted[sorted.length - 1];
  }
}
