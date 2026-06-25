// UI controller: renders the board/rack/scoreboard/history, handles tile
// placement (tap-to-place and pointer drag, both touch- and mouse-friendly),
// drives the AI's turn, and shows dialogs. Talks to the engine via game.js.

import { BOARD_SIZE, LETTER_POINTS, RACK_SIZE } from './constants.js';
import { newGame, currentPlayer, submitPlay, swapTiles, passTurn } from './game.js';
import { validateMove } from './validation.js';
import { scoreMove } from './scoring.js';
import { chooseMove } from './ai.js';
import { DIFFICULTIES } from './ai.js';
import { getWallet, addCurrency, recordGame, rewardForGame } from './store.js';

const PREM_LABEL = { DL: 'DL', TL: 'TL', DW: 'DW', TW: 'TW' };

let game = null;
let pending = [];           // [{row,col,letter,blank,rackIndex}]
let selectedRackIndex = null;
let drag = null;            // active drag state
let busy = false;           // AI thinking / animating -> lock input

const $ = (id) => document.getElementById(id);

export function startUI() {
  bindControls();
  refreshWallet();
}

// ---------- New game ----------
export function startNewGame(config) {
  const players = buildPlayers(config);
  game = newGame({ mode: config.mode, players });
  pending = [];
  selectedRackIndex = null;
  busy = false;
  render();
  maybeRunAI();
}

function buildPlayers(config) {
  if (config.opponent === 'practice') {
    return [{ name: 'You', type: 'human' }];
  }
  if (config.opponent === 'hotseat') {
    return [
      { name: 'Player 1', type: 'human' },
      { name: 'Player 2', type: 'human' },
    ];
  }
  return [
    { name: 'You', type: 'human' },
    { name: 'Computer', type: 'ai', difficulty: config.difficulty },
  ];
}

// ---------- Rendering ----------
function render() {
  renderScoreboard();
  renderBoard();
  renderRack();
  renderHistory();
  $('bag-count').textContent = game.bag.length;
  updateControls();
}

function renderScoreboard() {
  const sb = $('scoreboard');
  sb.innerHTML = '';
  game.players.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'player-card' + (p.id === game.current && game.status === 'active' ? ' active' : '');
    const tag = p.type === 'ai' ? `<span class="tag">${aiName(p.difficulty)}</span>` : '';
    card.innerHTML = `<span class="name">${escapeHtml(p.name)}${tag}</span><span class="pts">${p.score}</span>`;
    sb.appendChild(card);
  });
}

function aiName(diff) {
  const d = DIFFICULTIES.find((x) => x.id === diff);
  return d ? d.name : 'AI';
}

function renderBoard() {
  const boardEl = $('board');
  boardEl.innerHTML = '';
  const pendingMap = new Map(pending.map((p) => [p.row * BOARD_SIZE + p.col, p]));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      const prem = game.layout[r][c];
      cell.className = 'cell' + premClass(prem);
      cell.dataset.row = r;
      cell.dataset.col = c;
      const existing = game.board.cells[r][c];
      const pend = pendingMap.get(r * BOARD_SIZE + c);
      if (existing) {
        cell.appendChild(tileEl(existing.letter, existing.blank, 'locked'));
      } else if (pend) {
        cell.appendChild(tileEl(pend.letter, pend.blank, 'pending'));
      } else if (prem && prem !== 'STAR' && PREM_LABEL[prem]) {
        const span = document.createElement('span');
        span.className = 'prem';
        span.textContent = PREM_LABEL[prem];
        cell.appendChild(span);
      }
      boardEl.appendChild(cell);
    }
  }
}

function premClass(prem) {
  switch (prem) {
    case 'DL': return ' dl';
    case 'TL': return ' tl';
    case 'DW': return ' dw';
    case 'TW': return ' tw';
    case 'STAR': return ' star';
    default: return '';
  }
}

function tileEl(letter, blank, extra = '') {
  const t = document.createElement('div');
  t.className = 'tile ' + extra + (blank ? ' blank' : '');
  const pts = blank ? 0 : (LETTER_POINTS[letter] || 0);
  t.innerHTML = `<span class="lt">${letter.toUpperCase()}</span><span class="pv">${pts}</span>`;
  return t;
}

function renderRack() {
  const rackEl = $('rack');
  rackEl.innerHTML = '';
  const player = currentPlayer(game);
  const human = isHumanTurn();
  const usedIdx = new Set(pending.map((p) => p.rackIndex));
  const rack = human ? player.rack : [];
  for (let i = 0; i < RACK_SIZE; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.rackIndex = i;
    if (i === selectedRackIndex) slot.classList.add('selected');
    if (human && i < rack.length && !usedIdx.has(i)) {
      const tile = rack[i];
      const el = tileEl(tile === '?' ? ' ' : tile, tile === '?');
      el.dataset.rackIndex = i;
      slot.appendChild(el);
    }
    rackEl.appendChild(slot);
  }
}

function renderHistory() {
  const h = $('history');
  h.innerHTML = '';
  for (const entry of game.history.slice().reverse()) {
    const li = document.createElement('li');
    if (entry.type === 'play') {
      li.innerHTML = `<b>${escapeHtml(entry.playerName)}</b>: ` +
        `<span class="hl-word">${entry.words.join(', ').toUpperCase()}</span> ` +
        `<span class="hl-pts">+${entry.score}${entry.bingo ? ' ★bingo' : ''}</span>`;
    } else if (entry.type === 'swap') {
      li.innerHTML = `<b>${escapeHtml(entry.playerName)}</b>: swapped ${entry.count} tile(s)`;
    } else {
      li.innerHTML = `<b>${escapeHtml(entry.playerName)}</b>: passed`;
    }
    h.appendChild(li);
  }
}

// ---------- Controls ----------
function updateControls() {
  const human = isHumanTurn();
  const active = game.status === 'active';
  $('btn-play').disabled = !human || pending.length === 0 || busy;
  $('btn-recall').disabled = !human || pending.length === 0 || busy;
  $('btn-shuffle').disabled = !human || busy;
  $('btn-swap').disabled = !human || busy || game.bag.length < RACK_SIZE;
  $('btn-pass').disabled = !human || busy || !active;
}

function isHumanTurn() {
  return game && game.status === 'active' && currentPlayer(game).type === 'human';
}

function message(text, kind = '') {
  const m = $('message');
  m.textContent = text || '';
  m.className = 'message' + (kind ? ' ' + kind : '');
}

// ---------- Placement actions ----------
function placeTile(rackIndex, row, col) {
  if (!isHumanTurn() || busy) return;
  if (game.board.cells[row][col]) return;
  if (pending.some((p) => p.row === row && p.col === col)) return;
  const player = currentPlayer(game);
  const tile = player.rack[rackIndex];
  if (tile == null) return;
  if (pending.some((p) => p.rackIndex === rackIndex)) return;

  if (tile === '?') {
    pickBlankLetter().then((letter) => {
      if (!letter) return;
      pending.push({ row, col, letter, blank: true, rackIndex });
      afterPlace();
    });
  } else {
    pending.push({ row, col, letter: tile, blank: false, rackIndex });
    afterPlace();
  }
}

function afterPlace() {
  selectedRackIndex = null;
  livePreview();
  render();
}

function recallAt(row, col) {
  const idx = pending.findIndex((p) => p.row === row && p.col === col);
  if (idx >= 0) {
    pending.splice(idx, 1);
    livePreview();
    render();
  }
}

function recallAll() {
  pending = [];
  selectedRackIndex = null;
  message('');
  render();
}

// Show the would-be score as the player builds a word.
function livePreview() {
  if (pending.length === 0) { message(''); return; }
  const v = validateMove(game.board, pending.map((p) => ({ ...p })));
  if (v.valid) {
    const s = scoreMove(game.board, pending, v.words);
    message(`${v.words.map((w) => w.word.toUpperCase()).join(' · ')}  =  ${s.score}${s.bingo ? ' (+50 bingo!)' : ''}`, 'ok');
  } else {
    message(v.error, '');
  }
}

function commitPlay() {
  if (!isHumanTurn() || pending.length === 0) return;
  const placement = pending.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: p.blank }));
  const res = submitPlay(game, placement);
  if (!res.ok) { message(res.error, 'error'); return; }
  const word = res.words.find((w) => w.isMain) || res.words[0];
  pending = [];
  selectedRackIndex = null;
  message(`You played ${word.word.toUpperCase()} for ${res.score}${res.bingo ? ' — BINGO!' : ''}`, 'ok');
  render();
  if (checkEnd()) return;
  maybeRunAI();
}

function doPass() {
  if (!isHumanTurn()) return;
  recallAll();
  passTurn(game);
  render();
  if (checkEnd()) return;
  maybeRunAI();
}

function doSwap(tiles) {
  const res = swapTiles(game, tiles);
  if (!res.ok) { message(res.error, 'error'); return false; }
  recallAll();
  message(`Swapped ${tiles.length} tile(s).`, 'ok');
  render();
  maybeRunAI();
  return true;
}

// ---------- AI turn ----------
function maybeRunAI() {
  if (game.status !== 'active') return;
  const player = currentPlayer(game);
  if (player.type !== 'ai') { updateControls(); return; }
  busy = true;
  updateControls();
  $('thinking').classList.remove('hidden');
  // Yield so the "thinking" indicator paints before the (sync) search runs.
  setTimeout(() => {
    requestAnimationFrame(() => {
      runAITurn(player);
      $('thinking').classList.add('hidden');
      busy = false;
      render();
      if (!checkEnd()) maybeRunAI(); // in case of consecutive AI players
    });
  }, 450);
}

function runAITurn(player) {
  const move = chooseMove(game.board, player.rack, player.difficulty);
  if (move) {
    submitPlay(game, move.placement.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: p.blank })));
    const w = move.words.find((x) => x.isMain) || move.words[0];
    message(`${player.name} played ${w.word.toUpperCase()} for ${move.score}.`, '');
  } else if (game.bag.length >= RACK_SIZE) {
    // No move: swap up to the whole rack.
    swapTiles(game, player.rack.slice(0, Math.min(RACK_SIZE, player.rack.length)));
    message(`${player.name} swapped tiles.`, '');
  } else {
    passTurn(game);
    message(`${player.name} passed.`, '');
  }
}

// ---------- End game ----------
function checkEnd() {
  if (game.status !== 'finished') return false;
  showEndDialog();
  return true;
}

function showEndDialog() {
  const human = game.players.find((p) => p.type === 'human') || game.players[0];
  const won = game.winner === human.id;
  // Best word this game by the human, for stats.
  let bestWord = null;
  let bestScore = 0;
  for (const e of game.history) {
    if (e.type === 'play' && e.player === human.id && e.score > bestScore) {
      bestScore = e.score; bestWord = e.words[0];
    }
  }

  // Award currency in vs-AI and practice modes (single local player).
  let reward = null;
  if (game.players.length <= 2 && game.players.some((p) => p.type === 'ai') || game.players.length === 1) {
    reward = rewardForGame({ playerScore: human.score, won });
    addCurrency(reward);
    recordGame({ won, totalScore: human.score, bestWord, bestWordScore: bestScore });
    refreshWallet();
  }

  const title = game.tie ? "It's a tie!"
    : won ? 'You win! 🎉'
    : `${escapeHtml(game.players.find((p) => p.id === game.winner)?.name || 'Opponent')} wins`;
  $('end-title').textContent = title;

  const rows = game.players
    .map((p) => `<div class="player-card"><span class="name">${escapeHtml(p.name)}</span><span class="pts">${p.score}</span></div>`)
    .join('');
  const rewardHtml = reward
    ? `<p>You earned <b>🪙 ${reward.coins}</b> coins and <b>💎 ${reward.gems}</b> gems.</p>`
    : '';
  $('end-body').innerHTML = `<div class="scoreboard" style="margin-bottom:.8rem">${rows}</div>${rewardHtml}`;
  $('end-dialog').classList.remove('hidden');
}

// ---------- Wallet ----------
function refreshWallet() {
  const w = getWallet();
  $('wallet-coins').textContent = w.coins;
  $('wallet-gems').textContent = w.gems;
}

// ---------- Blank picker ----------
function pickBlankLetter() {
  return new Promise((resolve) => {
    const dlg = $('blank-dialog');
    const grid = $('blank-grid');
    grid.innerHTML = '';
    'abcdefghijklmnopqrstuvwxyz'.split('').forEach((ch) => {
      const b = document.createElement('button');
      b.textContent = ch.toUpperCase();
      b.addEventListener('click', () => { dlg.classList.add('hidden'); resolve(ch); }, { once: true });
      grid.appendChild(b);
    });
    dlg.classList.remove('hidden');
  });
}

// ---------- Pointer interaction (tap + drag) ----------
function bindControls() {
  $('btn-play').addEventListener('click', commitPlay);
  $('btn-recall').addEventListener('click', recallAll);
  $('btn-shuffle').addEventListener('click', shuffleRack);
  $('btn-pass').addEventListener('click', doPass);
  $('btn-swap').addEventListener('click', openSwapDialog);
  $('btn-again').addEventListener('click', () => { $('end-dialog').classList.add('hidden'); openNewDialog(); });

  const board = $('board');
  const rack = $('rack');
  board.addEventListener('pointerdown', onPointerDown);
  rack.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
}

function shuffleRack() {
  if (!isHumanTurn()) return;
  const player = currentPlayer(game);
  const usedIdx = new Set(pending.map((p) => p.rackIndex));
  // Shuffle only the tiles still on the rack (not the placed ones).
  const free = [];
  for (let i = 0; i < player.rack.length; i++) if (!usedIdx.has(i)) free.push(i);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = free[i]; const b = free[j];
    [player.rack[a], player.rack[b]] = [player.rack[b], player.rack[a]];
  }
  selectedRackIndex = null;
  render();
}

function onPointerDown(e) {
  if (busy || !isHumanTurn()) return;
  const tileEl2 = e.target.closest('.tile');
  const cell = e.target.closest('.cell');
  const slot = e.target.closest('.slot');

  // Drag a rack tile.
  if (slot && tileEl2 && slot.dataset.rackIndex != null && tileEl2.classList.contains('pending') === false && slot.contains(tileEl2)) {
    drag = { type: 'rack', rackIndex: Number(slot.dataset.rackIndex), startX: e.clientX, startY: e.clientY, moved: false, ghost: null };
    return;
  }
  // Drag/recall a pending board tile.
  if (cell && tileEl2 && tileEl2.classList.contains('pending')) {
    drag = { type: 'pending', row: Number(cell.dataset.row), col: Number(cell.dataset.col), startX: e.clientX, startY: e.clientY, moved: false, ghost: null };
    return;
  }
  // Tap an empty cell (place currently selected tile).
  if (cell && !tileEl2) {
    drag = { type: 'cell', row: Number(cell.dataset.row), col: Number(cell.dataset.col), startX: e.clientX, startY: e.clientY, moved: false, ghost: null };
  }
}

function onPointerMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
  if (drag.moved && (drag.type === 'rack' || drag.type === 'pending')) {
    if (!drag.ghost) drag.ghost = makeGhost(drag);
    if (drag.ghost) {
      drag.ghost.style.left = `${e.clientX - 20}px`;
      drag.ghost.style.top = `${e.clientY - 20}px`;
    }
    highlightDropTarget(e.clientX, e.clientY);
  }
}

function onPointerUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.ghost) d.ghost.remove();
  clearDropHighlight();

  if (!d.moved) {
    // Treat as a tap.
    if (d.type === 'rack') {
      selectedRackIndex = selectedRackIndex === d.rackIndex ? null : d.rackIndex;
      render();
    } else if (d.type === 'pending') {
      recallAt(d.row, d.col);
    } else if (d.type === 'cell') {
      if (selectedRackIndex != null) placeTile(selectedRackIndex, d.row, d.col);
    }
    return;
  }

  // Drag release.
  const target = cellUnderPoint(e.clientX, e.clientY);
  if (d.type === 'rack') {
    if (target) placeTile(d.rackIndex, target.row, target.col);
  } else if (d.type === 'pending') {
    if (target && (target.row !== d.row || target.col !== d.col)) {
      // Move the pending tile to a new empty cell.
      const idx = pending.findIndex((p) => p.row === d.row && p.col === d.col);
      if (idx >= 0 && !game.board.cells[target.row][target.col] &&
        !pending.some((p) => p.row === target.row && p.col === target.col)) {
        pending[idx].row = target.row;
        pending[idx].col = target.col;
        livePreview();
        render();
      }
    } else if (!target) {
      recallAt(d.row, d.col); // dropped off-board -> recall
    }
  }
}

function makeGhost(d) {
  let letter = '?';
  let blank = false;
  if (d.type === 'rack') {
    const tile = currentPlayer(game).rack[d.rackIndex];
    letter = tile === '?' ? ' ' : tile; blank = tile === '?';
  } else {
    const p = pending.find((x) => x.row === d.row && x.col === d.col);
    if (p) { letter = p.letter; blank = p.blank; }
  }
  const g = tileEl(letter, blank, 'ghost');
  document.body.appendChild(g);
  return g;
}

function cellUnderPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest('.cell');
  if (!cell || cell.dataset.row == null) return null;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (game.board.cells[row][col]) return null;
  if (pending.some((p) => p.row === row && p.col === col)) return null;
  return { row, col };
}

let lastDropEl = null;
function highlightDropTarget(x, y) {
  clearDropHighlight();
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest('.cell');
  if (cell && cell.dataset.row != null) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!game.board.cells[row][col] && !pending.some((p) => p.row === row && p.col === col)) {
      cell.classList.add('droptarget');
      lastDropEl = cell;
    }
  }
}
function clearDropHighlight() {
  if (lastDropEl) { lastDropEl.classList.remove('droptarget'); lastDropEl = null; }
}

// ---------- Swap dialog ----------
function openSwapDialog() {
  if (!isHumanTurn()) return;
  recallAll();
  const player = currentPlayer(game);
  const dlg = $('swap-dialog');
  const rackEl = $('swap-rack');
  rackEl.innerHTML = '';
  const picks = new Set();
  player.rack.forEach((tile, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const el = tileEl(tile === '?' ? ' ' : tile, tile === '?');
    slot.appendChild(el);
    slot.addEventListener('click', () => {
      if (picks.has(i)) { picks.delete(i); slot.classList.remove('swap-pick'); }
      else { picks.add(i); slot.classList.add('swap-pick'); }
    });
    rackEl.appendChild(slot);
  });
  $('btn-swap-confirm').onclick = () => {
    if (picks.size === 0) return;
    const tiles = [...picks].map((i) => player.rack[i]);
    dlg.classList.add('hidden');
    doSwap(tiles);
  };
  $('btn-swap-cancel').onclick = () => dlg.classList.add('hidden');
  dlg.classList.remove('hidden');
}

// ---------- New game dialog ----------
export function openNewDialog() {
  const dlg = $('new-dialog');
  const state = { opponent: 'ai', difficulty: 'intermediate', mode: 'standard' };

  const diffWrap = $('opt-difficulty');
  diffWrap.innerHTML = '';
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (d.id === state.difficulty ? ' active' : '');
    b.textContent = d.name;
    b.dataset.val = d.id;
    b.addEventListener('click', () => {
      state.difficulty = d.id;
      [...diffWrap.children].forEach((c) => c.classList.toggle('active', c === b));
      $('difficulty-blurb').textContent = d.blurb;
    });
    diffWrap.appendChild(b);
  });
  $('difficulty-blurb').textContent = DIFFICULTIES.find((d) => d.id === state.difficulty).blurb;

  bindSeg('opt-opponent', (val) => {
    state.opponent = val;
    $('difficulty-field').style.display = val === 'ai' ? '' : 'none';
  });
  bindSeg('opt-mode', (val) => { state.mode = val; });

  $('btn-start').onclick = () => { dlg.classList.add('hidden'); startNewGame(state); };
  $('btn-cancel').onclick = () => { if (game) dlg.classList.add('hidden'); };

  dlg.classList.remove('hidden');
}

function bindSeg(id, onPick) {
  const seg = $(id);
  seg.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onPick(btn.dataset.val);
    });
  });
}

// ---------- utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
