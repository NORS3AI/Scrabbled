// App version + in-app patch notes. Newest entry first. Bumping VERSION to the
// top entry's version makes the "What's new" dialog pop once for returning
// players. Keep entries short and player-facing.

export const VERSION = 'v0.0.6-alpha';

export const PATCH_NOTES = [
  {
    version: 'v0.0.6-alpha',
    date: '2026-06-25',
    title: 'Resume on refresh & quality-of-life',
    changes: [
      'Refreshing the tab now resumes your game in progress instead of starting over — it\'s saved on your device.',
      'Achievement unlocks no longer pop up in the middle of the screen; the 🏆 button glow-pulses instead while you have rewards to claim.',
      'The computer\'s most recently played tiles are highlighted gold so you can see what it played and where.',
      'Dev tools: the +coins/+gems buttons moved into Settings (only the Best-Word tool stays above your tiles), and the dev panel no longer hides when you collapse the history.',
    ],
  },
  {
    version: 'v0.0.5-alpha',
    date: '2026-06-25',
    title: 'Layout polish & background themes',
    changes: [
      'The board now stays centered, with the scoreboard moved to its left so there\'s more room for the tiles.',
      'The move-history log is more compact with a grey panel, and the bottom play area is slimmer and blends into the green background.',
      'Shop: buy background themes with coins (Fiery Orange, Velvet Purple, Golden Yellow, Subtle Black, Elephant Grey, Ocean Blue, Skybright Cyan, Pastel Pink) — 5 coins each. Switch between owned themes in Settings ⚙.',
      'Fix: achievements now keep working even if your browser blocks site storage (e.g. private mode) — they unlock once and stay claimable.',
    ],
  },
  {
    version: 'v0.0.4-alpha',
    date: '2026-06-25',
    title: 'Claim clarity & dev tools',
    changes: [
      'Achievements: ready-to-claim ones now sort to the top and are highlighted, and the 🏆 badge pulses so it\'s obvious what you can claim.',
      'Unlock notifications are concise and fire once per achievement (first time only) — no more per-word spam.',
      'Dev panel: quick +gems and +coins buttons (5 / 10 / 100 / 1000).',
      'Coins will be spendable on cosmetic themes — tiles, stickers, and board colors — in a future update.',
      'Fixed the dev "best word" preview tiles lingering on the board once you start placing; the preview now uses a clear dashed style.',
    ],
  },
  {
    version: 'v0.0.3-alpha',
    date: '2026-06-25',
    title: 'Stats, history panel & polish',
    changes: [
      'New Stats panel (📊): games, win rate, scores, words, bingos, tiles, blanks, best/longest words and a per-letter breakdown.',
      'Move history is now a collapsible panel on the right (tablet/desktop) — toggle it with 📜 or the Hide button.',
      'Dev panel gained a "Place on board" button that auto-fills the best word as tiles, ready to play.',
      'The score preview now lists every word you form — the main word and any crosswords — each with its own points.',
      'Gem rewards pop under your gem counter when earned; gems, achievements and stats are saved on your device.',
      'Fixed a drag artifact that could leave a stuck tile on screen, and locked the page so it no longer scrolls during play.',
    ],
  },
  {
    version: 'v0.0.2-alpha',
    date: '2026-06-25',
    title: 'Achievements & Shop',
    changes: [
      'New Achievements menu (🏆): unlock 44 achievements as you play and tap Claim to collect gems.',
      'Gems are now earned by claiming achievements — for word lengths, point milestones, letter feats, wins and more.',
      'New Shop (🛒): spend gems on power-ups (10–100 gems by rarity). They stack.',
      'Use power-ups on your turn (⚡): Best-Word Hint, Free Swap, Fresh Rack, Double Word, Triple Word, and Extra Turn.',
    ],
  },
  {
    version: 'v0.0.1-alpha',
    date: '2026-06-25',
    title: 'First playable alpha',
    changes: [
      'Play single-player vs the computer across 6 difficulty tiers: Beginner plays common two- and three-letter words; Master plays the most difficult words it can find.',
      'Practice (solo) mode and local Pass & Play for two players on one device.',
      'Standard and Randomized board layouts, with full SOWPODS word validation.',
      'Drag-and-drop and tap-to-place tiles, blank-tile picker, and a live score preview.',
      'Swap, pass, shuffle, recall, bingo bonus, and end-of-game rack scoring.',
      'Earn coins and gems by playing — saved on your device.',
      'Mobile/tablet-friendly layout: right-sized board with the tile rack docked at the bottom.',
      'The computer places its tiles one at a time with a smooth animation.',
      'New Settings menu with a Developer panel that reveals the best word you can play and its point value (helps you only — never the computer).',
    ],
  },
];
