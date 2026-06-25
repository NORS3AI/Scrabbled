// Achievements: pure data + evaluation (no DOM, no storage) so it is testable
// under Node. Each achievement is unlocked the first time its condition is met;
// the player then claims it for gems (claim/persistence live in store.js).
//
// Evaluation has two entry points:
//   evaluatePlay(tracker, play)   -> ids satisfied by a single human play
//   evaluateGameEnd(info)         -> ids satisfied at game end
// The caller dedups returned ids against what is already unlocked.

export const LETTER_GROUPS = {
  ABCD: ['a', 'b', 'c', 'd'],
  EFGH: ['e', 'f', 'g', 'h'],
  IJKL: ['i', 'j', 'k', 'l'],
  MNOP: ['m', 'n', 'o', 'p'],
  QRST: ['q', 'r', 's', 't'],
  UVW: ['u', 'v', 'w'],
  XYZ: ['x', 'y', 'z'],
};

const SCORE_TIERS = [20, 30, 40, 50, 60, 70, 80, 90, 100];
const GAME_TIERS = [100, 200, 300, 400, 500];
const DIFFICULTY_GEMS = {
  beginner: 10, easy: 20, intermediate: 30, advanced: 40, expert: 50, master: 75,
};
const DIFFICULTY_NAMES = {
  beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate',
  advanced: 'Advanced', expert: 'Expert', master: 'Master',
};

// Build the full ordered achievement catalogue with stable ids.
function buildCatalogue() {
  const a = [];
  // Word lengths.
  for (const n of [3, 4, 5, 6, 7]) {
    a.push({ id: `len${n}`, category: 'Word length', name: `Play a ${n}-letter word`, gems: 5 });
  }
  // Word score tiers.
  a.push({ id: 'bingo', category: 'Word scores', name: 'Play a bingo (all 7 tiles)', gems: 10 });
  for (const t of SCORE_TIERS) {
    a.push({ id: `pts${t}`, category: 'Word scores', name: `Play a ${t === 100 ? '100+' : t}-point word`, gems: 10 });
  }
  // Single-game score milestones.
  for (const t of GAME_TIERS) {
    a.push({ id: `game${t}`, category: 'Game score', name: `Reach ${t} points in a single game`, gems: 25 });
  }
  // Use one letter of a group.
  for (const g of Object.keys(LETTER_GROUPS)) {
    a.push({ id: `grp1_${g}`, category: 'Letters', name: `Use one of ${g} in a word`, gems: 5 });
  }
  a.push({ id: 'alpha_each', category: 'Letters', name: 'Use every letter A–Z in a single game', gems: 20 });
  // Use two letters of a group.
  for (const g of Object.keys(LETTER_GROUPS)) {
    a.push({ id: `grp2_${g}`, category: 'Letters', name: `Use two of ${g} in a word`, gems: 10 });
  }
  a.push({ id: 'alpha_each2', category: 'Letters', name: 'Use every letter A–Z twice in a single game', gems: 40 });
  // Winning.
  a.push({ id: 'win', category: 'Victories', name: 'Win a game', gems: 20 });
  for (const [diff, gems] of Object.entries(DIFFICULTY_GEMS)) {
    a.push({ id: `beat_${diff}`, category: 'Victories', name: `Beat the computer on ${DIFFICULTY_NAMES[diff]}`, gems });
  }
  a.push({ id: 'randomized_win', category: 'Victories', name: 'Win a game on a Randomized board', gems: 20 });
  return a;
}

export const ACHIEVEMENTS = buildCatalogue();
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((x) => [x.id, x]));
export const ACHIEVEMENT_CATEGORIES = [...new Set(ACHIEVEMENTS.map((x) => x.category))];

export function totalGemsAvailable() {
  return ACHIEVEMENTS.reduce((s, x) => s + x.gems, 0);
}

// Per-game accumulator (letters used across all of the player's words this game).
export function newTracker() {
  return { letterCounts: {} };
}

function lettersOf(word) {
  return [...String(word).toLowerCase()].filter((c) => c >= 'a' && c <= 'z');
}

// ids satisfied by one human play.
//   play = { words: [string], score: number, bingo: boolean, cumulativeScore: number }
export function evaluatePlay(tracker, play) {
  const ids = new Set();
  const words = play.words || [];

  // Word length achievements (any word formed by the play).
  for (const w of words) {
    const L = w.length;
    if (L >= 3 && L <= 7) ids.add(`len${L}`);
  }

  // Word score tiers (this play's points).
  if (play.bingo) ids.add('bingo');
  for (const t of SCORE_TIERS) if (play.score >= t) ids.add(`pts${t}`);

  // Single-game cumulative score.
  for (const t of GAME_TIERS) if (play.cumulativeScore >= t) ids.add(`game${t}`);

  // Letter-group usage, evaluated per word (so "two of ABCD" means two in one word).
  for (const w of words) {
    const letters = lettersOf(w);
    for (const [g, set] of Object.entries(LETTER_GROUPS)) {
      const count = letters.filter((c) => set.includes(c)).length;
      if (count >= 1) ids.add(`grp1_${g}`);
      if (count >= 2) ids.add(`grp2_${g}`);
    }
  }

  // Accumulate letters across the game, then check full-alphabet coverage.
  for (const w of words) {
    for (const c of lettersOf(w)) tracker.letterCounts[c] = (tracker.letterCounts[c] || 0) + 1;
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
  if (alphabet.every((c) => (tracker.letterCounts[c] || 0) >= 1)) ids.add('alpha_each');
  if (alphabet.every((c) => (tracker.letterCounts[c] || 0) >= 2)) ids.add('alpha_each2');

  return [...ids];
}

// ids satisfied at game end.
//   info = { won: boolean, difficulty: string|null, mode: string }
export function evaluateGameEnd(info) {
  const ids = [];
  if (!info.won) return ids;
  ids.push('win');
  if (info.difficulty && DIFFICULTY_GEMS[info.difficulty] != null) ids.push(`beat_${info.difficulty}`);
  if (info.mode === 'randomized') ids.push('randomized_win');
  return ids;
}
