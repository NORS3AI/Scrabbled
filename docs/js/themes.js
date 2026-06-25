// Background themes bought with coins and selected in Settings. The "background
// of the game" is the page backdrop behind the board (the board itself stays
// felt). Standard (Green Felt) is owned by default and free.

export const THEMES = [
  { id: 'standard', name: 'Green Felt', cost: 0, bg: 'linear-gradient(160deg, #14352a, #0c241c)', swatch: '#1f6f54' },
  { id: 'orange', name: 'Fiery Orange', cost: 5, bg: 'linear-gradient(160deg, #7a2a0a, #3a1404)', swatch: '#e25822' },
  { id: 'purple', name: 'Velvet Purple', cost: 5, bg: 'linear-gradient(160deg, #3b1d5e, #1a0b2e)', swatch: '#6c3fb0' },
  { id: 'gold', name: 'Golden Yellow', cost: 5, bg: 'linear-gradient(160deg, #9c7a10, #4d3b00)', swatch: '#e3b91e' },
  { id: 'black', name: 'Subtle Black', cost: 5, bg: 'linear-gradient(160deg, #2a2a2a, #0a0a0a)', swatch: '#222222' },
  { id: 'grey', name: 'Elephant Grey', cost: 5, bg: 'linear-gradient(160deg, #4b5563, #1f2630)', swatch: '#6b7280' },
  { id: 'blue', name: 'Ocean Blue', cost: 5, bg: 'linear-gradient(160deg, #0e3a5c, #06182b)', swatch: '#1e6fa8' },
  { id: 'cyan', name: 'Skybright Cyan', cost: 5, bg: 'linear-gradient(160deg, #0e6b78, #063a44)', swatch: '#2bb3c0' },
  { id: 'pink', name: 'Pastel Pink', cost: 5, bg: 'linear-gradient(160deg, #c97a9a, #7a4258)', swatch: '#e8a0bf' },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
