// Tile bag: build the standard 100-tile bag, shuffle deterministically from a
// seed, draw tiles, and return tiles (for swaps). A tile is a single lowercase
// letter, or '?' for a blank.

import { TILE_DISTRIBUTION } from './constants.js';
import { mulberry32, shuffleInPlace } from './rng.js';

export function buildBag(seed) {
  const tiles = [];
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) tiles.push(letter);
  }
  shuffleInPlace(tiles, mulberry32((seed >>> 0) ^ 0x9e3779b9));
  return tiles;
}

export function draw(bag, n) {
  return bag.splice(0, Math.min(n, bag.length));
}

// Put tiles back into the bag and reshuffle (used by the swap action).
export function returnAndShuffle(bag, tiles, rng) {
  for (const t of tiles) bag.push(t);
  shuffleInPlace(bag, rng);
  return bag;
}
