// Lightweight persistence via localStorage: the player's wallet (coins + gems,
// the earn-by-playing currency) and lifetime stats. Game state is serializable,
// so this same module is where a future remote/multiplayer backend would plug
// in — swap localStorage for an API and the rest of the app is unchanged.

const WALLET_KEY = 'scrabbled.wallet.v1';
const STATS_KEY = 'scrabbled.stats.v1';

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
