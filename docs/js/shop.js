// Shop catalogue: power-ups bought with gems. They stack (you can own several)
// and are used on your own turn. Effects are implemented in ui.js; this module
// is just the data so it can be reused/tested. Prices range 10–100 gems by
// rarity.

export const SHOP_ITEMS = [
  {
    id: 'hint', name: 'Best-Word Hint', icon: '🔍', cost: 10, rarity: 'Common',
    desc: 'Reveal the highest-scoring word you can play this turn.',
  },
  {
    id: 'freeSwap', name: 'Free Swap', icon: '🔄', cost: 20, rarity: 'Common',
    desc: 'Swap any tiles without giving up your turn.',
  },
  {
    id: 'rerack', name: 'Fresh Rack', icon: '🎲', cost: 30, rarity: 'Uncommon',
    desc: 'Return your whole rack and draw 7 new tiles, keeping your turn.',
  },
  {
    id: 'doubleWord', name: 'Double Word', icon: '✨', cost: 60, rarity: 'Rare',
    desc: 'Your next word scores double.',
  },
  {
    id: 'extraTurn', name: 'Extra Turn', icon: '⏩', cost: 75, rarity: 'Rare',
    desc: 'Play again immediately after your next word.',
  },
  {
    id: 'tripleWord', name: 'Triple Word', icon: '🌟', cost: 100, rarity: 'Epic',
    desc: 'Your next word scores triple.',
  },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((x) => [x.id, x]));
