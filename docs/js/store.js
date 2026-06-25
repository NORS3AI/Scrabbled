// Lightweight persistence via localStorage: the player's wallet (coins + gems,
// the earn-by-playing currency) and lifetime stats. Game state is serializable,
// so this same module is where a future remote/multiplayer backend would plug
// in — swap localStorage for an API and the rest of the app is unchanged.

const WALLET_KEY = 'scrabbled.wallet.v1';
const STATS_KEY = 'scrabbled.stats.v1';
const SEEN_VERSION_KEY = 'scrabbled.seenVersion';
const SETTINGS_KEY = 'scrabbled.settings.v1';
const DEFAULT_SETTINGS = { devPanel: false, historyOpen: true };
const ACH_KEY = 'scrabbled.achievements.v1';
const INV_KEY = 'scrabbled.inventory.v1';

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

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function getWallet() { return read(WALLET_KEY, DEFAULT_WALLET); }
export function getStats() { return read(STATS_KEY, DEFAULT_STATS); }

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
export function getAchievements() { return read(ACH_KEY, { unlocked: {}, claimed: {} }); }

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
