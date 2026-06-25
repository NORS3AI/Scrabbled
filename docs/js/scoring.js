// Scoring: compute the points for a validated play. Letter and word premiums
// apply only to newly placed tiles (premiums on pre-existing tiles are spent).
// Blank tiles always score 0. Using all 7 tiles adds the bingo bonus.

import { BOARD_SIZE, LETTER_POINTS, PREMIUM_MULT, RACK_SIZE, BINGO_BONUS } from './constants.js';

function letterValue(letter, blank) {
  return blank ? 0 : (LETTER_POINTS[letter] || 0);
}

// board: pre-play board (layout + existing cells)
// placement: new tiles [{row,col,letter,blank}]
// words: from validateMove -> [{word, cells:[{row,col}], isMain}]
export function scoreMove(board, placement, words) {
  const newSet = new Map();
  for (const p of placement) newSet.set(p.row * BOARD_SIZE + p.col, p);

  let total = 0;
  const breakdown = [];

  for (const w of words) {
    let wordScore = 0;
    let wordMult = 1;
    for (const cell of w.cells) {
      const k = cell.row * BOARD_SIZE + cell.col;
      const isNew = newSet.has(k);
      let letter;
      let blank;
      if (isNew) {
        const p = newSet.get(k);
        letter = p.letter;
        blank = !!p.blank;
      } else {
        const existing = board.cells[cell.row][cell.col];
        letter = existing.letter;
        blank = !!existing.blank;
      }
      let pts = letterValue(letter, blank);
      if (isNew) {
        const prem = board.layout[cell.row][cell.col];
        const mult = PREMIUM_MULT[prem] || PREMIUM_MULT[''];
        pts *= mult.letter;
        wordMult *= mult.word;
      }
      wordScore += pts;
    }
    wordScore *= wordMult;
    total += wordScore;
    breakdown.push({ word: w.word, score: wordScore });
  }

  let bingo = false;
  if (placement.length === RACK_SIZE) {
    total += BINGO_BONUS;
    bingo = true;
  }

  return { score: total, bingo, breakdown };
}
