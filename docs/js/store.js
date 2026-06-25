// Lightweight persistence via localStorage: the player's wallet (coins + gems,
// the earn-by-playing currency) and lifetime stats. Game state is serializable,
// so this same module is where a future remote/multiplayer backend would plug
// in — swap localStorage for an API and the rest of the app is unchanged.

const WALLET_KEY = 'scrabbled.wallet.v1';
const STATS_KEY = 'scrabbled.stats.v1';
const SEEN_VERSION_KEY = 'scrabbled.seenVersion';
const SETTINGS_KEY = 'scrabbled.settings.v1';
const DEFAULT_SETTINGS = { devPanel: false };
const ACH_KEY = 'scrabbled.achievements.v1';
const INV_KEY = 'scrabbled.inventory.v1';

const DEFAULT_WALLET = { coins: 0, gems: 0 };
const DEFAULT_STATS = { games: 0, wins: 0, losses: 0, bestWord: null, bestWordScore: 0, totalScore: 0 };

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

export function recordGame({ won, totalScore = 0, bestWord = null, bestWordScore = 0 }) {
  const s = getStats();
  s.games += 1;
  if (won) s.wins += 1; else s.losses += 1;
  s.totalScore += totalScore;
  if (bestWordScore > s.bestWordScore) {
    s.bestWordScore = bestWordScore;
    s.bestWord = bestWord;
  }
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
