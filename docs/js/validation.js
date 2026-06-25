// Move validation + word extraction. Given a board (before the play) and a
// placement (the new tiles), determine whether the play is legal and what words
// it forms. Used both for human moves and to vet AI-generated moves.
//
// placement entries: { row, col, letter, blank }  (letter is the effective
// lowercase letter; blank=true if it came from a blank tile).

import { BOARD_SIZE, CENTER } from './constants.js';
import { inBounds, isFilled, coversCenter, touchesExisting, isBoardEmpty } from './board.js';
import { isWord } from './dictionary.js';

// Overlay letter lookup: placed tiles take precedence, else existing board.
function makeLetterFn(board, placement) {
  const overlay = new Map();
  for (const p of placement) overlay.set(p.row * BOARD_SIZE + p.col, p.letter);
  return (r, c) => {
    if (!inBounds(r, c)) return null;
    const k = r * BOARD_SIZE + c;
    if (overlay.has(k)) return overlay.get(k);
    const cell = board.cells[r][c];
    return cell ? cell.letter : null;
  };
}

// Read a contiguous word starting at the top/left-most filled cell through
// (r,c) in the given direction. Returns { word, cells:[{row,col}] } or null if
// the run is a single letter.
function readWord(letterAt, r, c, dr, dc) {
  let sr = r;
  let sc = c;
  while (letterAt(sr - dr, sc - dc) !== null) {
    sr -= dr;
    sc -= dc;
  }
  let word = '';
  const cells = [];
  let cr = sr;
  let cc = sc;
  while (letterAt(cr, cc) !== null) {
    word += letterAt(cr, cc);
    cells.push({ row: cr, col: cc });
    cr += dr;
    cc += dc;
  }
  return word.length >= 2 ? { word, cells } : null;
}

// Determine main direction of a placement. Returns 'across', 'down', or null.
function placementDirection(placement) {
  if (placement.length === 1) return 'single';
  const sameRow = placement.every((p) => p.row === placement[0].row);
  const sameCol = placement.every((p) => p.col === placement[0].col);
  if (sameRow && !sameCol) return 'across';
  if (sameCol && !sameRow) return 'down';
  if (sameRow && sameCol) return 'single';
  return null; // neither: not a line
}

// Validate a placement. Returns:
//   { valid:true, words:[{word, cells, isMain}], direction, blanks }
//   { valid:false, error:'...' }
export function validateMove(board, placement) {
  if (!placement || placement.length === 0) {
    return { valid: false, error: 'No tiles placed.' };
  }

  // Bounds, emptiness, duplicates.
  const seen = new Set();
  for (const p of placement) {
    if (!inBounds(p.row, p.col)) return { valid: false, error: 'Tile is off the board.' };
    if (isFilled(board, p.row, p.col)) return { valid: false, error: 'A tile overlaps an existing one.' };
    const k = p.row * BOARD_SIZE + p.col;
    if (seen.has(k)) return { valid: false, error: 'Two tiles on the same square.' };
    seen.add(k);
  }

  let direction = placementDirection(placement);
  if (direction === null) {
    return { valid: false, error: 'Tiles must be in a single row or column.' };
  }

  const letterAt = makeLetterFn(board, placement);

  // Contiguity of the main word: the span between the first and last new tile
  // (plus any existing tiles in line) must have no gaps.
  const firstMoveEmptyBoard = isBoardEmpty(board);
  if (direction !== 'single') {
    const dr = direction === 'down' ? 1 : 0;
    const dc = direction === 'across' ? 1 : 0;
    const sorted = [...placement].sort((a, b) =>
      direction === 'down' ? a.row - b.row : a.col - b.col
    );
    let cr = sorted[0].row;
    let cc = sorted[0].col;
    const last = sorted[sorted.length - 1];
    while (cr <= last.row && cc <= last.col) {
      if (letterAt(cr, cc) === null) {
        return { valid: false, error: 'Tiles must form an unbroken line.' };
      }
      cr += dr;
      cc += dc;
    }
  }

  // First move must cover center; later moves must connect to existing tiles.
  if (firstMoveEmptyBoard) {
    if (!coversCenter(placement)) {
      return { valid: false, error: 'The first word must cross the center star.' };
    }
    if (placement.length < 2) {
      return { valid: false, error: 'The first word must be at least two letters.' };
    }
  } else if (!touchesExisting(board, placement)) {
    return { valid: false, error: 'New tiles must connect to existing tiles.' };
  }

  // Collect formed words. Main word + one cross word per new tile.
  const words = [];
  const dirs = { across: [0, 1], down: [1, 0] };

  // Main word: for a single tile, pick whichever axis yields a >=2 word.
  let mainAxes;
  if (direction === 'single') mainAxes = ['across', 'down'];
  else mainAxes = [direction];

  let mainWord = null;
  for (const axis of mainAxes) {
    const [dr, dc] = dirs[axis];
    const w = readWord(letterAt, placement[0].row, placement[0].col, dr, dc);
    if (w) {
      mainWord = { ...w, isMain: true, axis };
      direction = axis;
      break;
    }
  }
  // Cross words for each new tile (perpendicular to main axis).
  const [mdr, mdc] = dirs[direction === 'down' ? 'down' : 'across'];
  const crossAxis = mdr === 1 ? [0, 1] : [1, 0];
  if (mainWord) words.push(mainWord);
  for (const p of placement) {
    const w = readWord(letterAt, p.row, p.col, crossAxis[0], crossAxis[1]);
    if (w && !(mainWord && sameCells(w.cells, mainWord.cells))) {
      words.push({ ...w, isMain: false });
    }
  }

  if (words.length === 0) {
    return { valid: false, error: 'A play must form a word of two or more letters.' };
  }

  // Dictionary check.
  const invalid = words.filter((w) => !isWord(w.word)).map((w) => w.word);
  if (invalid.length > 0) {
    return { valid: false, error: `Not a valid word: ${invalid.join(', ').toUpperCase()}`, invalidWords: invalid };
  }

  return { valid: true, words, direction };
}

function sameCells(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].row !== b[i].row || a[i].col !== b[i].col) return false;
  }
  return true;
}
