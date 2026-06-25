// App version + in-app patch notes. Newest entry first. Bumping VERSION to the
// top entry's version makes the "What's new" dialog pop once for returning
// players. Keep entries short and player-facing.

export const VERSION = 'v0.0.12-alpha';

export const PATCH_NOTES = [
  {
    version: 'v0.0.12-alpha',
    date: '2026-06-25',
    title: 'Why your coins/gems were disappearing',
    changes: [
      'If your browser is blocking saved data, the game now shows a clear warning at the top — that is why coins, gems and achievements were being wiped on refresh.',
      'This happens in Private Browsing, with Safari\'s "Block All Cookies" turned on, or inside in-app browsers. Turn that off (or use a normal Safari/Chrome tab) and your progress will be kept. Nothing the app does can save data when the browser blocks all storage.',
    ],
  },
  {
    version: 'v0.0.11-alpha',
    date: '2026-06-25',
    title: 'Countdown, brighter last-move, tap-to-close',
    changes: [
      'Auto-play now shows a visible 3…2…1… countdown.',
      'The most recent move is highlighted in a bright amber so it\'s clearly visible even on gold tiles (and every theme).',
      'Tapping outside the Achievements, Shop, or Settings window now closes it.',
      'Hardened saving (re-flushes when the tab is hidden). Note: if your browser blocks site storage — e.g. iOS Safari "Block All Cookies", Private Browsing, or an in-app browser — coins/gems/achievements can\'t be saved across a refresh.',
    ],
  },
  {
    version: 'v0.0.10-alpha',
    date: '2026-06-25',
    title: 'Draggable history panel',
    changes: [
      'The move-history panel can now be dragged anywhere on screen — grab its "Moves" header (⠿) and drop it wherever you like, off the board. Its position is remembered. A quick tap on the header still collapses/expands it.',
    ],
  },
  {
    version: 'v0.0.9-alpha',
    date: '2026-06-25',
    title: 'Move history is back + fixes',
    changes: [
      'The move history is back as a small panel that hovers over the board (with a drop shadow) — tap "Moves" to collapse/expand it. It never pushes the board around.',
      'Fixed: choosing a Randomized board for a new game now actually randomizes it (on a replay it could fall back to the standard board).',
      'The most recent move is highlighted gold — when it\'s your turn you can see exactly where the opponent just played; the previous word returns to normal.',
    ],
  },
  {
    version: 'v0.0.8-alpha',
    date: '2026-06-25',
    title: 'Play-first & auto-play',
    changes: [
      'Play is now the first and widest button, so you can play the instant your word is down.',
      'New Settings → Gameplay option: "Auto-play after 3 seconds" — once a valid word is on the board it plays itself after 3s, unless you change it first.',
    ],
  },
  {
    version: 'v0.0.7-alpha',
    date: '2026-06-25',
    title: 'New layout & themed tiles',
    changes: [
      'Brand-new layout: a much bigger board, a slim top bar, and a bottom action bar showing the bag count, both scores, and your controls.',
      'Tiles are themed now — the classic look is gold, and themes bought with coins recolor both the tiles and the background.',
      'Bottom buttons: Shuffle, Swap (becomes Recall once you place tiles), Play, Power-ups, and New Game (Pass lives in the Swap dialog).',
      'Settings reorganized: Appearance (theme), Gameplay ("Show when the opponent has less than 7 tiles left"), Developer, and Data (Delete statistics). The app version at the bottom opens these patch notes.',
      'The home screen is simplified with a difficulty dropdown and a quick stats summary.',
    ],
  },
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
