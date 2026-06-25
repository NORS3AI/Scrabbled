// App version + in-app patch notes. Newest entry first. Bumping VERSION to the
// top entry's version makes the "What's new" dialog pop once for returning
// players. Keep entries short and player-facing.

export const VERSION = 'v0.0.1-alpha';

export const PATCH_NOTES = [
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
