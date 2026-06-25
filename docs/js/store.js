// Lightweight persistence via localStorage: the player's wallet (coins + gems,
// the earn-by-playing currency) and lifetime stats. Game state is serializable,
// so this same module is where a future remote/multiplayer backend would plug
// in — swap localStorage for an API and the rest of the app is unchanged.

const WALLET_KEY = 'scrabbled.wallet.v1';
const STATS_KEY = 'scrabbled.stats.v1';
const SEEN_VERSION_KEY = 'scrabbled.seenVersion';
const SETTINGS_KEY = 'scrabbled.settings.v1';
const DEFAULT_SETTINGS = { devPanel: false, historyCollapsed: false, showOpponentLowTiles: false, autoPlay: false, historyPos: null };
const ACH_KEY = 'scrabbled.achievements.v1';
const INV_KEY = 'scrabbled.inventory.v1';
const THEMES_KEY = 'scrabbled.themes.v1';
const GAME_KEY = 'scrabbled.savedgame.v1';

const DEFAULT_WALLET = { coins: 0, gems: 0 };
const DEFAULT_STATS = {
  games: 0, wins: 0, losses: 0, ties: 0,
  totalGameScore: 0, highestGameScore: 0,
  moves: 0, words: 0, bingos: 0, swaps: 0, passes: 0,
  tilesPlayed: 0, blanksPlayed: 0,
  highestWordScore: 0, highestWord: null,
  longestWordLen: 0, longestWord: null,
  letterCounts: {},
};

// In-memory mirror of every stored key. This is the source of truth within a
// session, so the game still works (dedup, claiming, etc.) even when
// localStorage is unavailable or write-blocked — e.g. private/incognito mode,
// blocked third-party storage, or quota errors. localStorage is best-effort
// persistence on top of it.
const memCache = new Map();

function read(key, fallback) {
  try {
    let raw = memCache.has(key) ? memCache.get(key) : localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function write(key, value) {
  const serialized = JSON.stringify(value);
  memCache.set(key, serialized); // always succeeds; keeps the session consistent
  try { localStorage.setItem(key, serialized); } catch { /* persistence best-effort */ }
}

export function getWallet() { return read(WALLET_KEY, DEFAULT_WALLET); }
export function getStats() { return read(STATS_KEY, DEFAULT_STATS); }

// Wipe all gameplay statistics back to zero (Settings → Data → Delete).
export function resetStats() {
  write(STATS_KEY, { ...DEFAULT_STATS, letterCounts: {} });
  return getStats();
}

// Track the last app version whose patch notes the player has seen, so the
// "What's new" dialog only auto-opens once per release.
export function getSeenVersion() {
  try { return localStorage.getItem(SEEN_VERSION_KEY) || null; } catch { return null; }
}
export function setSeenVersion(version) {
  try { localStorage.setItem(SEEN_VERSION_KEY, version); } catch { /* ignore */ }
}

export function getSettings() { return read(SETTINGS_KEY, DEFAULT_SETTINGS); }
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  write(SETTINGS_KEY, s);
  return s;
}

// --- Achievements: { unlocked: {id:true}, claimed: {id:true} } ---
export function getAchievements() {
  const a = read(ACH_KEY, { unlocked: {}, claimed: {} });
  // Harden against legacy/corrupt data so unlock/claim never throw.
  if (!a.unlocked || typeof a.unlocked !== 'object') a.unlocked = {};
  if (!a.claimed || typeof a.claimed !== 'object') a.claimed = {};
  return a;
}

// Mark ids as unlocked (met but not yet claimed). Returns the ids that were
// newly unlocked this call.
export function unlockAchievements(ids) {
  const a = getAchievements();
  const fresh = [];
  for (const id of ids) {
    if (!a.unlocked[id]) { a.unlocked[id] = true; fresh.push(id); }
  }
  if (fresh.length) write(ACH_KEY, a);
  return fresh;
}

// Claim one unlocked-but-unclaimed achievement; credits gems. Returns gems
// awarded (0 if not claimable).
export function claimAchievement(id, gems) {
  const a = getAchievements();
  if (!a.unlocked[id] || a.claimed[id]) return 0;
  a.claimed[id] = true;
  write(ACH_KEY, a);
  addCurrency({ gems });
  return gems;
}

// --- Inventory of power-ups: { id: count } ---
export function getInventory() { return read(INV_KEY, {}); }

// Buy one of an item if enough gems; returns true on success.
export function buyItem(id, cost) {
  const w = getWallet();
  if (w.gems < cost) return false;
  addCurrency({ gems: -cost });
  const inv = getInventory();
  inv[id] = (inv[id] || 0) + 1;
  write(INV_KEY, inv);
  return true;
}

// Consume one of an item; returns true if one was available.
export function useItem(id) {
  const inv = getInventory();
  if (!inv[id] || inv[id] <= 0) return false;
  inv[id] -= 1;
  write(INV_KEY, inv);
  return true;
}

// --- Background themes: { owned: {id:true}, selected: id } ---
export function getThemes() {
  const t = read(THEMES_KEY, { owned: { standard: true }, selected: 'standard' });
  t.owned = t.owned || {};
  t.owned.standard = true; // standard is always owned
  if (!t.selected) t.selected = 'standard';
  return t;
}

// Buy a theme with coins; returns true on success.
export function buyTheme(id, cost) {
  const w = getWallet();
  if (w.coins < cost) return false;
  addCurrency({ coins: -cost });
  const t = getThemes();
  t.owned[id] = true;
  write(THEMES_KEY, t);
  return true;
}

// Select an owned theme; returns true if owned.
export function selectTheme(id) {
  const t = getThemes();
  if (!t.owned[id]) return false;
  t.selected = id;
  write(THEMES_KEY, t);
  return true;
}

// --- Saved game (so a tab refresh resumes instead of starting over) ---
// The game object is plain serializable data, so it round-trips through JSON.
export function saveGame(game) { write(GAME_KEY, game); }

export function loadGame() {
  try {
    const raw = memCache.has(GAME_KEY) ? memCache.get(GAME_KEY) : localStorage.getItem(GAME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSavedGame() {
  memCache.delete(GAME_KEY);
  try { localStorage.removeItem(GAME_KEY); } catch { /* ignore */ }
}

export function addCurrency({ coins = 0, gems = 0 }) {
  const w = getWallet();
  w.coins += coins;
  w.gems += gems;
  write(WALLET_KEY, w);
  return w;
}

// Record a finished game (game-level stats).
export function recordGame({ won = false, tie = false, finalScore = 0 }) {
  const s = getStats();
  s.games += 1;
  if (tie) s.ties += 1; else if (won) s.wins += 1; else s.losses += 1;
  s.totalGameScore += finalScore;
  if (finalScore > s.highestGameScore) s.highestGameScore = finalScore;
  write(STATS_KEY, s);
  return s;
}

// Record one human play (per-move and per-letter stats).
//   words: [string], playScore, bingo, tiles: [{letter, blank}]
export function recordPlay({ words = [], playScore = 0, bingo = false, tiles = [] }) {
  const s = getStats();
  s.moves += 1;
  s.words += words.length;
  if (bingo) s.bingos += 1;
  s.tilesPlayed += tiles.length;
  for (const t of tiles) {
    if (t.blank) s.blanksPlayed += 1;
    const L = String(t.letter || '').toLowerCase();
    if (L >= 'a' && L <= 'z') s.letterCounts[L] = (s.letterCounts[L] || 0) + 1;
  }
  if (playScore > s.highestWordScore) {
    s.highestWordScore = playScore;
    s.highestWord = (words[0] || '').toUpperCase();
  }
  let longest = '';
  for (const w of words) if (w.length > longest.length) longest = w;
  if (longest.length > s.longestWordLen) {
    s.longestWordLen = longest.length;
    s.longestWord = longest.toUpperCase();
  }
  write(STATS_KEY, s);
  return s;
}

// Bump a simple counter stat (e.g. swaps, passes).
export function incStat(key, n = 1) {
  const s = getStats();
  s[key] = (s[key] || 0) + n;
  write(STATS_KEY, s);
  return s;
}

// Currency rules (earn-by-playing, no real money):
//   coins  = points scored this game (your effort)
//   gems   = small reward, bonus for a win
export function rewardForGame({ playerScore, won }) {
  const coins = Math.max(0, Math.round(playerScore));
  const gems = (won ? 5 : 1) + Math.floor(playerScore / 100);
  return { coins, gems };
}
