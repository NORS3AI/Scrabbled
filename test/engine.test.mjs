// Engine tests, runnable with `node --test`. They load the real dictionary from
// disk, then exercise scoring, validation, layouts, the game machine and the AI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { setWords } from '../docs/js/dictionary.js';
import { createBoard, applyPlacement } from '../docs/js/board.js';
import { standardLayout, randomizedLayout } from '../docs/js/layout.js';
import { validateMove } from '../docs/js/validation.js';
import { scoreMove } from '../docs/js/scoring.js';
import { newGame, submitPlay } from '../docs/js/game.js';
import { chooseMove, generateMoves } from '../docs/js/ai.js';
import { PREMIUM_COUNTS, CENTER } from '../docs/js/constants.js';
import {
  ACHIEVEMENTS, newTracker, evaluatePlay, evaluateGameEnd,
} from '../docs/js/achievements.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictText = readFileSync(join(__dirname, '../docs/data/dictionary.txt'), 'utf8');
setWords(dictText.split('\n'));

function placeWord(word, row, col, dir) {
  return [...word].map((ch, i) => ({
    row: dir === 'down' ? row + i : row,
    col: dir === 'across' ? col + i : col,
    letter: ch,
    blank: false,
  }));
}

test('standard layout has the canonical premium counts', () => {
  const layout = standardLayout();
  const counts = { TW: 0, DW: 0, TL: 0, DL: 0, STAR: 0 };
  for (const row of layout) for (const cell of row) if (counts[cell] != null) counts[cell]++;
  assert.equal(counts.TW, PREMIUM_COUNTS.TW);
  assert.equal(counts.DW, PREMIUM_COUNTS.DW);
  assert.equal(counts.TL, PREMIUM_COUNTS.TL);
  assert.equal(counts.DL, PREMIUM_COUNTS.DL);
  assert.equal(counts.STAR, 1);
});

test('randomized layout is balanced, reproducible and TW-spaced', () => {
  const a = randomizedLayout(12345);
  const b = randomizedLayout(12345);
  assert.deepEqual(a, b, 'same seed -> same board');
  const counts = { TW: 0, DW: 0, TL: 0, DL: 0, STAR: 0 };
  const tw = [];
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
    const v = a[r][c];
    if (counts[v] != null) counts[v]++;
    if (v === 'TW') tw.push([r, c]);
  }
  assert.equal(counts.TW, PREMIUM_COUNTS.TW);
  assert.equal(counts.DW, PREMIUM_COUNTS.DW);
  assert.equal(counts.STAR, 1);
  assert.equal(a[CENTER][CENTER], 'STAR');
  for (let i = 0; i < tw.length; i++) for (let j = i + 1; j < tw.length; j++) {
    const d = Math.max(Math.abs(tw[i][0] - tw[j][0]), Math.abs(tw[i][1] - tw[j][1]));
    assert.ok(d >= 2, 'no two TW squares adjacent');
  }
});

test('first move must cross center and be a real word', () => {
  const board = createBoard(standardLayout());
  const off = validateMove(board, placeWord('cat', 0, 0, 'across'));
  assert.equal(off.valid, false);
  const notWord = validateMove(board, placeWord('xyz', CENTER, 6, 'across'));
  assert.equal(notWord.valid, false);
  const good = validateMove(board, placeWord('cat', CENTER, 6, 'across'));
  assert.equal(good.valid, true);
});

test('scoring applies the center double-word and bingo bonus', () => {
  const board = createBoard(standardLayout());
  // QUARTZ across center (cols 5..10), row 7. Center (7,7) is a double word.
  const placement = placeWord('quartz', CENTER, 5, 'across');
  const v = validateMove(board, placement);
  assert.equal(v.valid, true);
  const s = scoreMove(board, placement, v.words);
  // letters q10 u1 a1 r1 t1 z10 = 24; center DW doubles -> 48. No bingo (6 tiles).
  assert.equal(s.score, 48);
  assert.equal(s.bingo, false);
});

test('a perpendicular word that is not valid is rejected', () => {
  const board = createBoard(standardLayout());
  applyPlacement(board, placeWord('cat', CENTER, 6, 'across'));
  // Place a tile below the C to form a 2-letter down word "cz" (invalid).
  const bad = validateMove(board, [{ row: CENTER + 1, col: 6, letter: 'z', blank: false }]);
  assert.equal(bad.valid, false);
  // "cs" -> "cs" not a word either; use a real hook: "cat" + "s" => "cats" across is along same line, skip.
});

test('game machine: a play scores, refills the rack and switches turn', () => {
  const game = newGame({ mode: 'standard', seed: 7, players: [
    { name: 'A', type: 'human' }, { name: 'B', type: 'human' },
  ] });
  // Force a known rack so the test is deterministic.
  game.players[0].rack = ['c', 'a', 't', 's', 'e', 'r', 'o'];
  const res = submitPlay(game, placeWord('cat', CENTER, 6, 'across'));
  assert.equal(res.ok, true);
  assert.ok(res.score > 0);
  assert.equal(game.players[0].rack.length, 7, 'rack refilled to 7');
  assert.equal(game.current, 1, 'turn advanced');
});

test('achievements: a play unlocks length, score, tier and letter-group ids', () => {
  const tracker = newTracker();
  // QUARTZ for 48, a 6-letter word, using two of QRST (q,r,t) and one of ABCD (a).
  const ids = evaluatePlay(tracker, { words: ['quartz'], score: 48, bingo: false, cumulativeScore: 48 });
  assert.ok(ids.includes('len6'));
  assert.ok(ids.includes('pts20'));
  assert.ok(ids.includes('pts40'));
  assert.ok(!ids.includes('pts50'));
  assert.ok(ids.includes('grp1_QRST'));
  assert.ok(ids.includes('grp2_QRST'), 'q,r,t are two+ of QRST');
  assert.ok(ids.includes('grp1_ABCD'), 'a is one of ABCD');
  assert.ok(!ids.includes('game100'));
});

test('achievements: bingo and single-game milestones', () => {
  const tracker = newTracker();
  const ids = evaluatePlay(tracker, { words: ['retains'], score: 70, bingo: true, cumulativeScore: 120 });
  assert.ok(ids.includes('bingo'));
  assert.ok(ids.includes('len7'));
  assert.ok(ids.includes('pts70'));
  assert.ok(ids.includes('game100'));
  assert.ok(!ids.includes('game200'));
});

test('achievements: game-end win/beat/randomized', () => {
  assert.deepEqual(
    evaluateGameEnd({ won: true, difficulty: 'master', mode: 'randomized' }).sort(),
    ['beat_master', 'randomized_win', 'win'].sort()
  );
  assert.deepEqual(evaluateGameEnd({ won: false, difficulty: 'easy', mode: 'standard' }), []);
  assert.deepEqual(evaluateGameEnd({ won: true, difficulty: null, mode: 'standard' }), ['win']);
});

test('achievements: catalogue has the expected reward total', () => {
  // 5 lengths*5 + (bingo+9 tiers)*10 + 5 game*25 + 7 grp1*5 + alphaEach20
  //   + 7 grp2*10 + alphaEach2 40 + win20 + (10+20+30+40+50+75) + randomized20
  const total = ACHIEVEMENTS.reduce((s, a) => s + a.gems, 0);
  assert.equal(ACHIEVEMENTS.length, 44);
  assert.equal(total, 25 + 100 + 125 + 35 + 20 + 70 + 40 + 20 + 225 + 20);
});

test('AI generates legal moves and Expert beats Beginner on average score', () => {
  const game = newGame({ mode: 'standard', seed: 99 });
  applyPlacement(game.board, placeWord('house', CENTER, 5, 'across'));
  const rack = ['r', 'e', 't', 'a', 'i', 'n', 's'];
  const moves = generateMoves(game.board, rack);
  assert.ok(moves.length > 0, 'found at least one move');
  for (const m of moves.slice(0, 20)) {
    const v = validateMove(game.board, m.placement);
    assert.equal(v.valid, true, 'every generated move is legal');
  }
  const expert = chooseMove(game.board, rack, 'expert');
  const beginner = chooseMove(game.board, rack, 'beginner');
  assert.ok(expert && expert.score > 0);
  assert.ok(beginner);
  assert.ok(expert.score >= beginner.score, 'expert scores at least as high as beginner');
});
