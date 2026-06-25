// Themes bought with coins and selected in Settings. A theme restyles BOTH the
// page background and the look of the tiles (the default is classic gold).
// Applied via CSS custom properties so the whole board/rack updates at once.

export const THEMES = [
  {
    id: 'standard', name: 'Green Felt', cost: 0, swatch: '#1f6f54',
    bg: 'linear-gradient(160deg, #14352a, #0c241c)',
    tile: { bg: 'linear-gradient(180deg, #f6e6c2, #f0d9a8)', edge: '#c8a35f', text: '#2b2118' },
  },
  {
    id: 'orange', name: 'Fiery Orange', cost: 5, swatch: '#e25822',
    bg: 'linear-gradient(160deg, #7a2a0a, #3a1404)',
    tile: { bg: 'linear-gradient(180deg, #ffd9b0, #ffb878)', edge: '#c97a30', text: '#5a2a0a' },
  },
  {
    id: 'purple', name: 'Velvet Purple', cost: 5, swatch: '#6c3fb0',
    bg: 'linear-gradient(160deg, #3b1d5e, #1a0b2e)',
    tile: { bg: 'linear-gradient(180deg, #e7d8f7, #cfb0f0)', edge: '#8a5fc0', text: '#3a1d5e' },
  },
  {
    id: 'gold', name: 'Golden Yellow', cost: 5, swatch: '#e3b91e',
    bg: 'linear-gradient(160deg, #9c7a10, #4d3b00)',
    tile: { bg: 'linear-gradient(180deg, #fff0a8, #ffe14d)', edge: '#c9a416', text: '#5a4500' },
  },
  {
    id: 'black', name: 'Subtle Black', cost: 5, swatch: '#222222',
    bg: 'linear-gradient(160deg, #2a2a2a, #0a0a0a)',
    tile: { bg: 'linear-gradient(180deg, #3c3c3c, #232323)', edge: '#000000', text: '#f0f0f0' },
  },
  {
    id: 'grey', name: 'Elephant Grey', cost: 5, swatch: '#6b7280',
    bg: 'linear-gradient(160deg, #4b5563, #1f2630)',
    tile: { bg: 'linear-gradient(180deg, #cfd4d8, #aab0b6)', edge: '#70777e', text: '#23282d' },
  },
  {
    id: 'blue', name: 'Ocean Blue', cost: 5, swatch: '#1e6fa8',
    bg: 'linear-gradient(160deg, #0e3a5c, #06182b)',
    tile: { bg: 'linear-gradient(180deg, #bcdcf2, #8ec0e8)', edge: '#3e7bb0', text: '#0e2f4f' },
  },
  {
    id: 'cyan', name: 'Skybright Cyan', cost: 5, swatch: '#2bb3c0',
    bg: 'linear-gradient(160deg, #0e6b78, #063a44)',
    tile: { bg: 'linear-gradient(180deg, #bff0f5, #86dfe8)', edge: '#2f9aa8', text: '#073640' },
  },
  {
    id: 'pink', name: 'Pastel Pink', cost: 5, swatch: '#e8a0bf',
    bg: 'linear-gradient(160deg, #c97a9a, #7a4258)',
    tile: { bg: 'linear-gradient(180deg, #f7d6e3, #eeaac6)', edge: '#c06a8c', text: '#5a2238' },
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
