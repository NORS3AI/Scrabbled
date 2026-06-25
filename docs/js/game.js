// Game state machine: turn management, play/swap/pass actions, end conditions,
// and final scoring. Framework-free and serializable so a game can be saved to
// localStorage and reloaded (the async-multiplayer persistence model — here used
// for single-player vs AI and practice).

import { RACK_SIZE, LETTER_POINTS } from './constants.js';
import { buildLayout } from './layout.js';
import { buildBag, draw } from './bag.js';
import { createBoard, applyPlacement } from './board.js';
import { validateMove } from './validation.js';
import { scoreMove } from './scoring.js';
import { randomSeed } from './rng.js';

let nextGameId = 1;

// opts: { mode, seed, players:[{name,type,difficulty}], id? }
export function newGame(opts = {}) {
  const mode = opts.mode || 'standard';
  const seed = (opts.seed != null ? opts.seed : randomSeed()) >>> 0;
  const layout = buildLayout(mode, seed);
  const bag = buildBag(seed);

  const players = (opts.players || [
    { name: 'You', type: 'human' },
    { name: 'Computer', type: 'ai', difficulty: 'intermediate' },
  ]).map((p, i) => ({
    id: i,
    name: p.name,
    type: p.type,
    difficulty: p.difficulty || null,
    rack: draw(bag, RACK_SIZE),
    score: 0,
  }));

  return {
    id: opts.id || nextGameId++,
    mode,
    seed,
    layout,
    bag,
    board: createBoard(layout),
    players,
    current: 0,
    history: [],
    status: 'active',
    scorelessStreak: 0,
    winner: null,
  };
}

export function currentPlayer(game) {
  return game.players[game.current];
}

export function opponentOf(game, idx) {
  return game.players[(idx + 1) % game.players.length];
}

function advanceTurn(game) {
  game.current = (game.current + 1) % game.players.length;
}

// Remove the tiles used by a placement from a player's rack. Blanks consume '?'.
function consumeFromRack(rack, placement) {
  const next = rack.slice();
  for (const p of placement) {
    const want = p.blank ? '?' : p.letter;
    const idx = next.indexOf(want);
    if (idx === -1) return null; // tile not in rack -> illegal
    next.splice(idx, 1);
  }
  return next;
}

function refill(player, bag) {
  const need = RACK_SIZE - player.rack.length;
  if (need > 0) player.rack.push(...draw(bag, need));
}

// Submit a play. placement: [{row,col,letter,blank}]. Returns
// { ok:true, score, words, bingo } or { ok:false, error }.
export function submitPlay(game, placement) {
  if (game.status !== 'active') return { ok: false, error: 'Game is over.' };
  const player = currentPlayer(game);

  const newRack = consumeFromRack(player.rack, placement);
  if (!newRack) return { ok: false, error: 'You don\'t have those tiles.' };

  const v = validateMove(game.board, placement);
  if (!v.valid) return { ok: false, error: v.error };

  const s = scoreMove(game.board, placement, v.words);
  applyPlacement(game.board, placement);
  player.rack = newRack;
  player.score += s.score;
  refill(player, game.bag);

  game.history.push({
    player: player.id,
    playerName: player.name,
    type: 'play',
    placement: placement.map((p) => ({ ...p })),
    words: v.words.map((w) => w.word),
    score: s.score,
    bingo: s.bingo,
  });

  game.scorelessStreak = s.score > 0 ? 0 : game.scorelessStreak + 1;

  // End if this player emptied their rack and the bag is empty.
  if (player.rack.length === 0 && game.bag.length === 0) {
    finishGame(game, player.id);
  } else {
    advanceTurn(game);
    maybeEndOnStalemate(game);
  }
  return { ok: true, score: s.score, words: v.words, bingo: s.bingo };
}

// Swap tiles back into the bag and redraw. tiles: array of rack letters.
export function swapTiles(game, tiles) {
  if (game.status !== 'active') return { ok: false, error: 'Game is over.' };
  if (game.bag.length < RACK_SIZE) {
    return { ok: false, error: `Need ${RACK_SIZE} tiles left in the bag to swap.` };
  }
  const player = currentPlayer(game);
  const newRack = player.rack.slice();
  for (const t of tiles) {
    const idx = newRack.indexOf(t);
    if (idx === -1) return { ok: false, error: 'You don\'t have those tiles.' };
    newRack.splice(idx, 1);
  }
  player.rack = newRack;
  player.rack.push(...draw(game.bag, tiles.length));
  // Returned tiles go back to the bag (placed at the end; bag is shuffled in feel
  // by the seeded build but for swaps we simply append, which is fine for play).
  for (const t of tiles) game.bag.push(t);

  game.history.push({ player: player.id, playerName: player.name, type: 'swap', count: tiles.length });
  game.scorelessStreak += 1;
  advanceTurn(game);
  maybeEndOnStalemate(game);
  return { ok: true };
}

export function passTurn(game) {
  if (game.status !== 'active') return { ok: false, error: 'Game is over.' };
  const player = currentPlayer(game);
  game.history.push({ player: player.id, playerName: player.name, type: 'pass' });
  game.scorelessStreak += 1;
  advanceTurn(game);
  maybeEndOnStalemate(game);
  return { ok: true };
}

// Six consecutive scoreless turns (passes/swaps) ends the game.
function maybeEndOnStalemate(game) {
  if (game.scorelessStreak >= game.players.length * 3) {
    finishGame(game, null);
  }
}

function rackPoints(rack) {
  return rack.reduce((sum, t) => sum + (t === '?' ? 0 : (LETTER_POINTS[t] || 0)), 0);
}

// Apply end-of-game rack adjustments and decide the winner.
// outPlayerId: the player who emptied their rack, or null for a stalemate end.
export function finishGame(game, outPlayerId) {
  if (game.status === 'finished') return;
  game.status = 'finished';

  if (outPlayerId != null) {
    let bonus = 0;
    for (const p of game.players) {
      if (p.id === outPlayerId) continue;
      const pts = rackPoints(p.rack);
      p.score -= pts;
      bonus += pts;
    }
    const out = game.players.find((p) => p.id === outPlayerId);
    out.score += bonus;
  } else {
    // Stalemate: each player just loses their own rack points.
    for (const p of game.players) p.score -= rackPoints(p.rack);
  }

  let winner = null;
  let best = -Infinity;
  let tie = false;
  for (const p of game.players) {
    if (p.score > best) { best = p.score; winner = p; tie = false; }
    else if (p.score === best) tie = true;
  }
  game.winner = tie ? null : (winner ? winner.id : null);
  game.tie = tie;
}

// Resign: the current/selected player concedes; the opponent wins.
export function resign(game, playerId) {
  if (game.status === 'finished') return;
  game.status = 'finished';
  const other = game.players.find((p) => p.id !== playerId);
  game.winner = other ? other.id : null;
  game.tie = false;
}
