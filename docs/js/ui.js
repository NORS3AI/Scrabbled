// UI controller: renders the board/rack/scoreboard/history, handles tile
// placement (tap-to-place and pointer drag, both touch- and mouse-friendly),
// drives the AI's turn, and shows dialogs. Talks to the engine via game.js.

import { BOARD_SIZE, LETTER_POINTS, RACK_SIZE } from './constants.js';
import { newGame, currentPlayer, submitPlay, swapTiles, passTurn, redrawRack } from './game.js';
import { validateMove } from './validation.js';
import { scoreMove } from './scoring.js';
import { chooseMove, bestMove } from './ai.js';
import { DIFFICULTIES } from './ai.js';
import {
  getWallet, addCurrency, recordGame, recordPlay, incStat, getStats, rewardForGame,
  getSeenVersion, setSeenVersion, getSettings, setSettings,
  getAchievements, unlockAchievements, claimAchievement,
  getInventory, buyItem, useItem,
  getThemes, buyTheme, selectTheme,
  saveGame, loadGame, clearSavedGame,
} from './store.js';
import { THEMES, THEME_BY_ID } from './themes.js';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, ACHIEVEMENT_CATEGORIES,
  newTracker, evaluatePlay, evaluateGameEnd,
} from './achievements.js';
import { SHOP_ITEMS, SHOP_BY_ID } from './shop.js';
import { VERSION, PATCH_NOTES } from './version.js';

const PREM_LABEL = { DL: 'DL', TL: 'TL', DW: 'DW', TW: 'TW' };

let game = null;
let pending = [];           // [{row,col,letter,blank,rackIndex}]
let aiAnim = [];            // tiles the AI is currently placing (animated overlay)
let aiAnimLastKey = -1;     // which animated tile should play the drop-in animation
let selectedRackIndex = null;
let drag = null;            // active drag state
let busy = false;           // AI thinking / animating -> lock input
let hint = null;            // dev-panel best-word highlight {cells, word, score}
let settings = { devPanel: false, historyOpen: true };
let achTracker = newTracker();      // per-game achievement accumulator
let armed = { multiplier: 0, multItem: null, extraTurn: false }; // armed power-ups
let lastMove = new Set();            // board keys of the tiles the AI just played (gold highlight)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const $ = (id) => document.getElementById(id);

export function startUI() {
  bindControls();
  refreshWallet();
  updateAchBadge();
  applyTheme();
  settings = getSettings();
  applySettings();
  // Show "What's new" once per release.
  if (getSeenVersion() !== VERSION) openNotes();
}

// ---------- Background themes ----------
function applyTheme() {
  const t = getThemes();
  const theme = THEME_BY_ID[t.selected] || THEMES[0];
  document.body.style.background = theme.bg;
}

function renderThemePicker() {
  const t = getThemes();
  const wrap = $('theme-picker');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const theme of THEMES) {
    if (!t.owned[theme.id]) continue; // only owned themes are selectable here
    const btn = document.createElement('button');
    btn.className = 'theme-btn' + (theme.id === t.selected ? ' active' : '');
    btn.innerHTML = `<span class="theme-swatch" style="background:${theme.swatch}"></span>${escapeHtml(theme.name)}`;
    btn.addEventListener('click', () => {
      selectTheme(theme.id);
      applyTheme();
      renderThemePicker();
    });
    wrap.appendChild(btn);
  }
}

// ---------- Settings & dev panel ----------
// Dev panel and history are independent toggles; each has its own apply fn so
// changing one never affects the other.
function applyDevPanel() {
  $('dev-panel').classList.toggle('hidden', !settings.devPanel);
  $('dev-tools').classList.toggle('hidden', !settings.devPanel);
  $('set-dev').checked = !!settings.devPanel;
  if (!settings.devPanel) clearHint();
}

function applyHistory() {
  document.getElementById('app').classList.toggle('history-open', !!settings.historyOpen);
}

function applySettings() {
  applyDevPanel();
  applyHistory();
}

function toggleHistory() {
  settings = setSettings({ historyOpen: !settings.historyOpen });
  applyHistory(); // only touches history — leaves the dev panel alone
}

function openSettings() { applySettings(); renderThemePicker(); $('settings-dialog').classList.remove('hidden'); }
function closeSettings() { $('settings-dialog').classList.add('hidden'); }

function clearHint() {
  if (hint) { hint = null; renderBoard(); }
  $('best-result').textContent = '—';
}

// Coordinate label like "H8" (column letter, row number) for a cell.
function coordLabel(row, col) {
  return String.fromCharCode(65 + col) + (row + 1);
}

// Compute the best word for the current human, highlight it on the board, and
// return { word, score, label } (or null if there's no legal move).
function computeBestWordHint() {
  if (!isHumanTurn()) return null;
  const player = currentPlayer(game);
  const res = bestMove(game.board, player.rack);
  if (!res) { hint = null; renderBoard(); return null; }
  const first = res.move.placement.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col))[0];
  hint = {
    cells: res.move.placement.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: !!p.blank })),
    word: res.word,
  };
  renderBoard();
  return { word: res.word, score: res.score, label: `${res.word.toUpperCase()} — ${res.score} pts @ ${coordLabel(first.row, first.col)}` };
}

// Dev-panel button: show the best word in the dev panel result line.
function showBestWord() {
  if (!settings.devPanel) return;
  if (!isHumanTurn()) { $('best-result').textContent = 'Wait for your turn'; return; }
  $('best-result').textContent = 'Searching…';
  setTimeout(() => {
    const r = computeBestWordHint();
    $('best-result').textContent = r ? r.label : 'No move available — try swapping.';
  }, 20);
}

// Dev-panel button: auto-place the best word's tiles onto the board as pending
// tiles (the player can then press Play). Maps each tile to a rack slot.
function placeBestWord() {
  if (!isHumanTurn()) return;
  if (!hint || !hint.cells) {
    $('best-result').textContent = 'Searching…';
    setTimeout(() => { if (computeBestWordHint()) placeBestWord(); }, 20);
    return;
  }
  const cells = hint.cells.slice();
  recallAll(); // clears any current pending (and the hint)
  const rack = currentPlayer(game).rack;
  const usedIdx = [];
  const np = [];
  for (const c of cells) {
    const want = c.blank ? '?' : c.letter;
    let idx = rack.findIndex((t, i) => t === want && !usedIdx.includes(i));
    let blank = c.blank;
    if (idx === -1 && !c.blank) {
      // Fall back to a blank tile representing this letter.
      idx = rack.findIndex((t, i) => t === '?' && !usedIdx.includes(i));
      blank = true;
    }
    if (idx === -1) continue;
    usedIdx.push(idx);
    np.push({ row: c.row, col: c.col, letter: c.letter, blank, rackIndex: idx });
  }
  pending = np;
  selectedRackIndex = null;
  render();
  livePreview();
  $('best-result').textContent = 'Placed — press Play to confirm.';
}

// ---------- Patch notes ----------
export function openNotes() {
  const body = $('notes-body');
  body.innerHTML = PATCH_NOTES.map((n) => `
    <div class="notes-entry">
      <h3>${escapeHtml(n.version)}${n.title ? ' — ' + escapeHtml(n.title) : ''}</h3>
      <div class="when">${escapeHtml(n.date || '')}</div>
      <ul>${n.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    </div>`).join('');
  $('notes-dialog').classList.remove('hidden');
  setSeenVersion(VERSION);
}

function closeNotes() { $('notes-dialog').classList.add('hidden'); }

// ---------- New game ----------
export function startNewGame(config) {
  const players = buildPlayers(config);
  game = newGame({ mode: config.mode, players });
  pending = [];
  selectedRackIndex = null;
  hint = null;
  busy = false;
  lastMove = new Set();
  achTracker = newTracker();
  armed = { multiplier: 0, multItem: null, extraTurn: false };
  renderArmed();
  render();
  saveState();
  maybeRunAI();
}

// Persist the in-progress game so a tab refresh resumes it; clear it when over.
function saveState() {
  if (game && game.status === 'active') saveGame(game);
  else clearSavedGame();
}

// On load: resume a saved active game if there is one, else open the new-game
// dialog. Pending (uncommitted) tiles are not saved — they reset on refresh.
export function resumeOrNew() {
  const saved = loadGame();
  if (saved && saved.status === 'active' && Array.isArray(saved.players) && saved.board) {
    game = saved;
    pending = [];
    selectedRackIndex = null;
    hint = null;
    busy = false;
    lastMove = new Set();
    armed = { multiplier: 0, multItem: null, extraTurn: false };
    // Rebuild the per-game achievement letter tracker from the human's history.
    achTracker = newTracker();
    for (const e of game.history) {
      if (e.type === 'play' && game.players[e.player] && game.players[e.player].type === 'human') {
        for (const word of e.words || []) {
          for (const ch of String(word).toLowerCase()) {
            if (ch >= 'a' && ch <= 'z') achTracker.letterCounts[ch] = (achTracker.letterCounts[ch] || 0) + 1;
          }
        }
      }
    }
    renderArmed();
    render();
    message('Resumed your game.', '');
    if (currentPlayer(game).type === 'ai') maybeRunAI();
    return true;
  }
  openNewDialog();
  return false;
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
  const aiMap = new Map(aiAnim.map((p) => [p.row * BOARD_SIZE + p.col, p]));
  const hintMap = new Map((hint ? hint.cells : []).map((p) => [p.row * BOARD_SIZE + p.col, p]));
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      const prem = game.layout[r][c];
      cell.className = 'cell' + premClass(prem);
      cell.dataset.row = r;
      cell.dataset.col = c;
      const key = r * BOARD_SIZE + c;
      const existing = game.board.cells[r][c];
      const pend = pendingMap.get(key);
      const ai = aiMap.get(key);
      if (existing) {
        // Gold-highlight the tiles the computer just played.
        cell.appendChild(tileEl(existing.letter, existing.blank, 'locked' + (lastMove.has(key) ? ' lastmove' : '')));
      } else if (ai) {
        // The most recently placed AI tile gets the drop-in animation.
        cell.appendChild(tileEl(ai.letter, ai.blank, key === aiAnimLastKey ? 'locked placing' : 'locked'));
      } else if (pend) {
        cell.appendChild(tileEl(pend.letter, pend.blank, 'pending'));
      } else if (hintMap.has(key)) {
        // Dev-panel best-word suggestion: a readable tile chip on the square.
        const h = hintMap.get(key);
        cell.appendChild(tileEl(h.letter, h.blank, 'hint'));
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
  $('btn-powerups').disabled = !human || busy;
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
  hint = null; // clear any dev best-word preview once the player places a tile
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
  hint = null;
  message('');
  render();
}

// Show the would-be score as the player builds a word, listing every word
// formed (the main word and any cross words) with its own points so the bonus
// from connecting to other words is visible.
function livePreview() {
  if (pending.length === 0) { message(''); return; }
  const v = validateMove(game.board, pending.map((p) => ({ ...p })));
  if (v.valid) {
    const s = scoreMove(game.board, pending, v.words);
    const parts = s.breakdown.map((b) => `${b.word.toUpperCase()} ${b.score}`).join(' + ');
    const plus = s.breakdown.length > 1 ? `${parts} = ` : '';
    message(`${plus}${s.score}${s.bingo ? ' +50 bingo!' : ''}`, 'ok');
  } else {
    message(v.error, '');
  }
}

function commitPlay() {
  if (!isHumanTurn() || pending.length === 0) return;
  const human = currentPlayer(game);
  const placement = pending.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: p.blank }));
  const opts = {};
  if (armed.multiplier > 1) opts.scoreMultiplier = armed.multiplier;
  if (armed.extraTurn) opts.extraTurn = true;

  const res = submitPlay(game, placement, opts);
  if (!res.ok) { message(res.error, 'error'); return; }

  // Consume the armed power-ups now that the play went through.
  const usedMult = armed.multiplier > 1 ? armed.multItem : null;
  const usedExtra = armed.extraTurn;
  if (usedMult) useItem(usedMult);
  if (usedExtra) useItem('extraTurn');
  armed = { multiplier: 0, multItem: null, extraTurn: false };
  renderArmed();

  // List every word formed (main + cross words) so the bonus is visible.
  const allWords = res.words.map((w) => w.word.toUpperCase()).join(' + ');
  pending = [];
  selectedRackIndex = null;
  hint = null;
  lastMove = new Set(); // clear the computer's gold highlight now that you've moved
  let msg = `You played ${allWords} for ${res.score}${res.bingo ? ' — BINGO!' : ''}`;
  if (usedMult) msg += ` (×${SHOP_BY_ID[usedMult].name.includes('Triple') ? 3 : 2})`;
  if (usedExtra) msg += ' — extra turn!';
  message(msg, 'ok');

  // Per-move stats (counts every word formed, tiles, letters, bests).
  recordPlay({
    words: res.words.map((w) => w.word),
    playScore: res.score,
    bingo: res.bingo,
    tiles: placement,
  });

  // Achievements from this play.
  evalPlayAchievements(human, res);

  render();
  saveState();
  if (checkEnd()) return;
  maybeRunAI();
}

function evalPlayAchievements(human, res) {
  const ids = evaluatePlay(achTracker, {
    words: res.words.map((w) => w.word),
    score: res.score,
    bingo: res.bingo,
    cumulativeScore: human.score,
  });
  processAchievements(ids);
}

function processAchievements(ids) {
  if (!ids || !ids.length) return;
  const fresh = unlockAchievements(ids);
  if (!fresh.length) return; // already-unlocked ids never re-notify (once and done)
  // No mid-screen announcement — just make the trophy button glow-pulse.
  updateAchBadge();
}

function clearArmed() {
  // Turn is ending without a play; un-arm power-ups (they weren't consumed).
  if (armed.multiplier || armed.extraTurn) {
    armed = { multiplier: 0, multItem: null, extraTurn: false };
    renderArmed();
  }
}

function doPass() {
  if (!isHumanTurn()) return;
  recallAll();
  clearArmed();
  incStat('passes');
  passTurn(game);
  render();
  saveState();
  if (checkEnd()) return;
  maybeRunAI();
}

function doSwap(tiles) {
  const res = swapTiles(game, tiles);
  if (!res.ok) { message(res.error, 'error'); return false; }
  recallAll();
  clearArmed();
  incStat('swaps');
  message(`Swapped ${tiles.length} tile(s).`, 'ok');
  render();
  saveState();
  maybeRunAI();
  return true;
}

// ---------- AI turn ----------
async function maybeRunAI() {
  if (game.status !== 'active') return;
  const player = currentPlayer(game);
  if (player.type !== 'ai') { updateControls(); return; }
  busy = true;
  updateControls();
  $('thinking').classList.remove('hidden');
  // Yield so the "thinking" indicator paints before the (sync) search runs.
  await sleep(420);
  const move = await new Promise((resolve) => {
    requestAnimationFrame(() => resolve(chooseMove(game.board, player.rack, player.difficulty)));
  });
  $('thinking').classList.add('hidden');

  if (move) {
    await animateAIPlay(player, move);
  } else if (game.bag.length >= RACK_SIZE) {
    swapTiles(game, player.rack.slice(0, Math.min(RACK_SIZE, player.rack.length)));
    message(`${player.name} swapped tiles.`, '');
  } else {
    passTurn(game);
    message(`${player.name} passed.`, '');
  }

  busy = false;
  render();
  saveState();
  if (!checkEnd()) maybeRunAI(); // in case of consecutive AI players
}

// Place the AI's tiles one at a time with a smooth drop-in, then commit.
async function animateAIPlay(player, move) {
  const w = move.words.find((x) => x.isMain) || move.words[0];
  message(`${player.name} is playing…`, '');
  // Order tiles along the word (top-left to bottom-right) for a natural sweep.
  const tiles = [...move.placement].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  aiAnim = [];
  for (const t of tiles) {
    aiAnim.push({ row: t.row, col: t.col, letter: t.letter, blank: t.blank });
    aiAnimLastKey = t.row * BOARD_SIZE + t.col;
    renderBoard();
    await sleep(260);
  }
  await sleep(160);
  // Commit the move for real, then clear the animation overlay.
  submitPlay(game, move.placement.map((p) => ({ row: p.row, col: p.col, letter: p.letter, blank: p.blank })));
  aiAnim = [];
  aiAnimLastKey = -1;
  // Mark the just-played tiles gold so the player sees what/where was played.
  lastMove = new Set(move.placement.map((p) => p.row * BOARD_SIZE + p.col));
  message(`${player.name} played ${w.word.toUpperCase()} for ${move.score}${move.bingo ? ' — BINGO!' : ''}.`, '');
}

// ---------- End game ----------
function checkEnd() {
  if (game.status !== 'finished') return false;
  showEndDialog();
  return true;
}

function showEndDialog() {
  clearSavedGame(); // a finished game shouldn't resume on refresh
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
    refreshWallet();
    if (reward.gems > 0) showGemGain(reward.gems);
  }
  recordGame({ won, tie: !!game.tie, finalScore: human.score });

  // Game-end achievements (win / beat-difficulty / randomized win).
  const aiOpp = game.players.find((p) => p.type === 'ai');
  processAchievements(evaluateGameEnd({
    won,
    difficulty: aiOpp ? aiOpp.difficulty : null,
    mode: game.mode,
  }));

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

// Floating "+N 💎" under the gem counter when gems are earned.
function showGemGain(n) {
  if (!n) return;
  const el = $('gem-gain');
  el.textContent = `+${n} 💎`;
  el.classList.remove('show');
  // Reflow so the animation restarts even on rapid repeats.
  void el.offsetWidth;
  el.classList.add('show');
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

// ---------- Achievements ----------
function updateAchBadge() {
  const a = getAchievements();
  let claimable = 0;
  for (const id in a.unlocked) if (!a.claimed[id]) claimable++;
  const b = $('ach-badge');
  const btn = $('btn-achievements');
  if (claimable > 0) {
    b.textContent = claimable;
    b.classList.remove('hidden');
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
    btn.classList.add('glow'); // glowing pulse on the trophy button while claimable
  } else {
    b.classList.add('hidden');
    btn.classList.remove('glow');
  }
}

function openAchievements() { renderAchievements(); $('ach-dialog').classList.remove('hidden'); }

function renderAchievements() {
  const a = getAchievements();
  const body = $('ach-body');
  body.innerHTML = '';
  let unlocked = 0;
  let claimable = 0;
  // Rank: claimable first, then locked, then already-claimed.
  const rank = (ach) => {
    const u = !!a.unlocked[ach.id];
    const c = !!a.claimed[ach.id];
    if (u && !c) return 0;
    if (!u) return 1;
    return 2;
  };
  for (const cat of ACHIEVEMENT_CATEGORIES) {
    const head = document.createElement('div');
    head.className = 'ach-cat';
    head.textContent = cat;
    body.appendChild(head);
    const inCat = ACHIEVEMENTS.filter((x) => x.category === cat).slice().sort((x, y) => rank(x) - rank(y));
    for (const ach of inCat) {
      const isUnlocked = !!a.unlocked[ach.id];
      const isClaimed = !!a.claimed[ach.id];
      if (isUnlocked) unlocked++;
      if (isUnlocked && !isClaimed) claimable++;
      const row = document.createElement('div');
      row.className = 'ach-item' + (isUnlocked ? '' : ' locked') + (isUnlocked && !isClaimed ? ' claimable' : '');
      let stateHtml;
      if (isClaimed) stateHtml = '<span class="ach-state tick">✓ Claimed</span>';
      else if (isUnlocked) stateHtml = `<button class="btn btn-primary btn-small" data-claim="${ach.id}">Claim 💎${ach.gems}</button>`;
      else stateHtml = '<span class="ach-state">🔒 Locked</span>';
      row.innerHTML = `<span class="ach-name">${escapeHtml(ach.name)}</span>` +
        `<span class="ach-gems">💎${ach.gems}</span>${stateHtml}`;
      body.appendChild(row);
    }
  }
  body.querySelectorAll('[data-claim]').forEach((btn) => {
    btn.addEventListener('click', () => doClaim(btn.dataset.claim));
  });
  $('ach-summary').textContent =
    `${unlocked} of ${ACHIEVEMENTS.length} unlocked · ${claimable} ready to claim`;
}

function doClaim(id) {
  const ach = ACHIEVEMENT_BY_ID[id];
  const gems = claimAchievement(id, ach.gems);
  if (gems > 0) {
    refreshWallet();
    showGemGain(gems);
    updateAchBadge();
    toast(`Claimed 💎${gems} — ${ach.name}`);
    renderAchievements();
  }
}

function claimAll() {
  const a = getAchievements();
  let total = 0;
  let count = 0;
  for (const ach of ACHIEVEMENTS) {
    if (a.unlocked[ach.id] && !a.claimed[ach.id]) {
      total += claimAchievement(ach.id, ach.gems);
      count++;
    }
  }
  if (count > 0) {
    refreshWallet();
    showGemGain(total);
    updateAchBadge();
    toast(`Claimed ${count} achievement${count > 1 ? 's' : ''} for 💎${total}`);
  }
  renderAchievements();
}

// ---------- Shop ----------
function openShop() { renderShop(); $('shop-dialog').classList.remove('hidden'); }

function renderShop() {
  const w = getWallet();
  $('shop-gems').textContent = w.gems;
  if ($('shop-coins')) $('shop-coins').textContent = w.coins;
  const inv = getInventory();
  const body = $('shop-body');
  body.innerHTML = '';

  // Power-ups (gems).
  const puHead = document.createElement('div');
  puHead.className = 'shop-subhead';
  puHead.textContent = 'Power-ups (gems)';
  body.appendChild(puHead);
  for (const item of SHOP_ITEMS) {
    const owned = inv[item.id] || 0;
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML =
      `<span class="shop-icon">${item.icon}</span>` +
      `<div class="shop-info"><div class="shop-name">${escapeHtml(item.name)}` +
      `<span class="rarity ${item.rarity}">${item.rarity}</span></div>` +
      `<div class="shop-desc">${escapeHtml(item.desc)}</div>` +
      `<div class="shop-own">Owned: ${owned}</div></div>` +
      `<button class="btn btn-primary shop-buy" data-buy="${item.id}">💎${item.cost}</button>`;
    body.appendChild(card);
  }

  // Backgrounds (coins).
  const themes = getThemes();
  const bgHead = document.createElement('div');
  bgHead.className = 'shop-subhead';
  bgHead.textContent = 'Backgrounds (coins)';
  body.appendChild(bgHead);
  for (const theme of THEMES) {
    if (theme.cost === 0) continue; // standard is the free default
    const ownedT = !!themes.owned[theme.id];
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML =
      `<span class="shop-swatch" style="background:${theme.bg}"></span>` +
      `<div class="shop-info"><div class="shop-name">${escapeHtml(theme.name)}</div>` +
      `<div class="shop-desc">Game background. Switch to it in Settings ⚙.</div></div>` +
      (ownedT
        ? '<button class="btn shop-buy" disabled>Owned</button>'
        : `<button class="btn btn-light shop-buy" data-buytheme="${theme.id}">🪙${theme.cost}</button>`);
    body.appendChild(card);
  }

  body.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => doBuy(btn.dataset.buy));
  });
  body.querySelectorAll('[data-buytheme]').forEach((btn) => {
    btn.addEventListener('click', () => doBuyTheme(btn.dataset.buytheme));
  });
}

function doBuy(id) {
  const item = SHOP_BY_ID[id];
  if (buyItem(id, item.cost)) {
    refreshWallet();
    renderShop();
    toast(`Bought ${item.name}. Use it from ⚡ Power-ups on your turn.`);
  } else {
    toast(`Not enough gems for ${item.name} (need 💎${item.cost}).`);
  }
}

function doBuyTheme(id) {
  const theme = THEME_BY_ID[id];
  if (buyTheme(id, theme.cost)) {
    refreshWallet();
    renderShop();
    renderThemePicker();
    toast(`Bought ${theme.name}! Select it in Settings ⚙.`);
  } else {
    toast(`Not enough coins for ${theme.name} (need 🪙${theme.cost}).`);
  }
}

// ---------- Stats ----------
function openStats() { renderStats(); $('stats-dialog').classList.remove('hidden'); }

function renderStats() {
  const s = getStats();
  const winRate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const avgGame = s.games ? Math.round(s.totalGameScore / s.games) : 0;
  const avgWord = s.moves ? Math.round(s.totalGameScore / s.moves) : 0;
  const cell = (val, label) => `<div class="stat-cell"><div class="stat-val">${val}</div><div class="stat-label">${escapeHtml(label)}</div></div>`;

  let html = '';
  html += '<div class="stats-section"><h3>Games</h3><div class="stats-grid">' +
    cell(s.games, 'Played') + cell(s.wins, 'Wins') + cell(s.losses, 'Losses') +
    cell(s.ties, 'Ties') + cell(winRate + '%', 'Win rate') + '</div></div>';
  html += '<div class="stats-section"><h3>Scoring</h3><div class="stats-grid">' +
    cell(s.highestGameScore, 'Best game') + cell(avgGame, 'Avg / game') +
    cell(avgWord, 'Avg / move') + cell(s.totalGameScore, 'Total points') + '</div></div>';
  html += '<div class="stats-section"><h3>Words &amp; tiles</h3><div class="stats-grid">' +
    cell(s.words, 'Words played') + cell(s.bingos, 'Bingos') +
    cell(s.tilesPlayed, 'Tiles played') + cell(s.blanksPlayed, 'Blanks used') +
    cell(s.highestWordScore, s.highestWord ? `Best word (${s.highestWord})` : 'Best word') +
    cell(s.longestWordLen, s.longestWord ? `Longest (${s.longestWord})` : 'Longest word') +
    cell(s.swaps, 'Swaps') + cell(s.passes, 'Passes') + '</div></div>';

  const counts = s.letterCounts || {};
  const max = Math.max(1, ...Object.values(counts).map(Number));
  let letters = '';
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
    const n = counts[ch] || 0;
    const hot = n > 0 && n >= max * 0.66;
    letters += `<div class="letter-cell${hot ? ' hot' : ''}"><div class="lc-letter">${ch.toUpperCase()}</div><div class="lc-count">${n}</div></div>`;
  }
  html += `<div class="stats-section"><h3>Letters played</h3><div class="letters-grid">${letters}</div></div>`;

  $('stats-body').innerHTML = html;
}

// ---------- Power-ups (in-game use) ----------
function renderArmed() {
  const el = $('armed-banner');
  const parts = [];
  if (armed.multiplier > 1) parts.push(`Next word ×${armed.multiplier}`);
  if (armed.extraTurn) parts.push('Extra turn ready');
  if (parts.length) { el.textContent = '⚡ ' + parts.join(' · '); el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function openPowerups() {
  if (!isHumanTurn()) { toast('You can only use power-ups on your turn.'); return; }
  renderPowerups();
  $('powerups-dialog').classList.remove('hidden');
}

function renderPowerups() {
  const inv = getInventory();
  const body = $('powerups-body');
  body.innerHTML = '';
  const owned = SHOP_ITEMS.filter((i) => (inv[i.id] || 0) > 0);
  if (owned.length === 0) {
    body.innerHTML = '<p class="muted">You don\'t own any power-ups yet. Buy some in the Shop (🛒).</p>';
    return;
  }
  for (const item of owned) {
    const count = inv[item.id];
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML =
      `<span class="shop-icon">${item.icon}</span>` +
      `<div class="shop-info"><div class="shop-name">${escapeHtml(item.name)}</div>` +
      `<div class="shop-desc">${escapeHtml(item.desc)}</div>` +
      `<div class="shop-own">Owned: ${count}</div></div>` +
      `<button class="btn btn-primary shop-buy" data-use="${item.id}">Use</button>`;
    body.appendChild(card);
  }
  body.querySelectorAll('[data-use]').forEach((btn) => {
    btn.addEventListener('click', () => usePowerup(btn.dataset.use));
  });
}

function usePowerup(id) {
  if (!isHumanTurn()) { toast('You can only use power-ups on your turn.'); return; }
  const inv = getInventory();
  if (!inv[id]) return;

  switch (id) {
    case 'hint': {
      if (!useItem('hint')) return;
      const r = computeBestWordHint();
      message(r ? `Best word: ${r.label}` : 'No move available — try swapping.', 'ok');
      break;
    }
    case 'rerack': {
      if (!useItem('rerack')) return;
      redrawRack(game);
      pending = [];
      selectedRackIndex = null;
      message('Drew a fresh rack.', 'ok');
      render();
      saveState();
      break;
    }
    case 'freeSwap': {
      // Open the swap dialog in "free" mode (keeps the turn). Consumed on confirm.
      $('powerups-dialog').classList.add('hidden');
      openSwapDialog(true);
      return;
    }
    case 'doubleWord':
    case 'tripleWord': {
      const mult = id === 'tripleWord' ? 3 : 2;
      armed.multiplier = mult;
      armed.multItem = id;
      renderArmed();
      message(`Armed ${SHOP_BY_ID[id].name}: your next word scores ×${mult}.`, 'ok');
      break;
    }
    case 'extraTurn': {
      armed.extraTurn = true;
      renderArmed();
      message('Armed Extra Turn: play again after your next word.', 'ok');
      break;
    }
    default:
      return;
  }
  $('powerups-dialog').classList.add('hidden');
  renderShop();
  updateControls();
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
  $('btn-again').addEventListener('click', () => { $('end-dialog').classList.add('hidden'); openNewDialog(); });
  $('btn-notes').addEventListener('click', openNotes);
  $('btn-notes-close').addEventListener('click', closeNotes);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings-close').addEventListener('click', closeSettings);
  $('set-dev').addEventListener('change', (e) => {
    settings = setSettings({ devPanel: e.target.checked });
    applySettings();
  });
  $('btn-best').addEventListener('click', showBestWord);
  $('btn-swap').addEventListener('click', () => openSwapDialog(false));
  $('btn-powerups').addEventListener('click', openPowerups);
  $('btn-powerups-close').addEventListener('click', () => $('powerups-dialog').classList.add('hidden'));
  $('btn-achievements').addEventListener('click', openAchievements);
  $('btn-ach-close').addEventListener('click', () => $('ach-dialog').classList.add('hidden'));
  $('btn-claim-all').addEventListener('click', claimAll);
  $('btn-shop').addEventListener('click', openShop);
  $('btn-shop-close').addEventListener('click', () => $('shop-dialog').classList.add('hidden'));
  $('btn-stats').addEventListener('click', openStats);
  $('btn-stats-close').addEventListener('click', () => $('stats-dialog').classList.add('hidden'));
  $('btn-history').addEventListener('click', toggleHistory);
  $('btn-history-collapse').addEventListener('click', toggleHistory);
  $('btn-place-best').addEventListener('click', placeBestWord);
  // Dev currency buttons (+gems / +coins) live in Settings now.
  $('dev-tools').addEventListener('click', (e) => {
    const gem = e.target.closest('[data-gem]');
    const coin = e.target.closest('[data-coin]');
    if (gem) {
      const n = Number(gem.dataset.gem);
      addCurrency({ gems: n });
      refreshWallet();
      showGemGain(n);
    } else if (coin) {
      const n = Number(coin.dataset.coin);
      addCurrency({ coins: n });
      refreshWallet();
    }
  });

  const board = $('board');
  const rack = $('rack');
  board.addEventListener('pointerdown', onPointerDown);
  rack.addEventListener('pointerdown', onPointerDown);
  // passive:false so we can preventDefault() during a drag to stop the page
  // (and any stray ghost) from scrolling.
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);
}

// Remove any drag-ghost elements (defensive: prevents stuck artifacts).
function removeAllGhosts() {
  document.querySelectorAll('.tile.ghost').forEach((el) => el.remove());
}

function onPointerCancel() {
  if (!drag) return;
  drag = null;
  removeAllGhosts();
  clearDropHighlight();
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
    e.preventDefault(); // stop the page scrolling under the drag
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
  removeAllGhosts(); // belt-and-suspenders: never leave a ghost behind
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
  removeAllGhosts(); // clear any stray ghost before creating a new one
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
// free=true is the Free Swap power-up: swap without ending the turn.
function openSwapDialog(free = false) {
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
    if (free) doFreeSwap(tiles);
    else doSwap(tiles);
  };
  $('btn-swap-cancel').onclick = () => dlg.classList.add('hidden');
  dlg.classList.remove('hidden');
}

// Free Swap power-up: swap tiles but keep the turn. Consumes one item.
function doFreeSwap(tiles) {
  const res = swapTiles(game, tiles, { keepTurn: true });
  if (!res.ok) { message(res.error, 'error'); return; }
  useItem('freeSwap');
  message(`Free-swapped ${tiles.length} tile(s) — still your turn.`, 'ok');
  render();
  saveState();
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
