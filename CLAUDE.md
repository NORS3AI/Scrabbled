# CLAUDE.md

Guidance for working in this repository.

## What this is

**Scrabbled** is an ad-free, turn-based word game (Scrabble / Words With Friends
style). It is a **static, client-side app** hosted on **GitHub Pages** from
`main` → `/docs`. There is no build step and no backend — the entire game runs in
the browser.

- Live site: https://nors3ai.github.io/scrabbled/
- Hosting: GitHub Pages, source = `main` branch, `/docs` folder.
- The deployed site **is** the `docs/` directory. Anything outside `docs/`
  (tests, `package.json`, this file, `Roadmap.md`) is tooling/docs and is not
  served.

## Hard constraint: static hosting

GitHub Pages cannot run a server or database. **Do not** add code to `docs/` that
assumes a backend (no `fetch` to an API that doesn't exist, no Node-only APIs in
browser modules). Online async multiplayer, cross-device accounts, turn
notifications, and remote chat are **out of scope for the Pages build** and are
deferred until a backend is chosen (see `Roadmap.md` → "multiplayer path").

The intended seam for a future backend is `docs/js/store.js`. Game state
(`game.js`) is a single serializable object; persistence is isolated so that
swapping `localStorage` for a remote store (Supabase recommended, or Express +
Postgres) does not touch the engine or UI.

## Architecture

Framework-free **ES modules** in `docs/js/`. The engine modules are pure (no DOM)
and run identically in the browser and under Node, which is how they are tested.

```
docs/js/
  constants.js   board size, tile points/distribution, premium layouts (pure data)
  rng.js         seeded PRNG (mulberry32) for reproducible boards/bags
  layout.js      standard layout + balanced randomized layout (from a seed)
  bag.js         tile bag build/draw/return
  board.js       board model + placement/adjacency helpers
  dictionary.js  SOWPODS Set (O(1) validity) + lazily-built trie for the AI
  validation.js  legal placement + word extraction + dictionary checks
  scoring.js     premium-aware scoring + bingo bonus
  game.js        turn machine: play/swap/pass, end conditions, final scoring
  ai.js          trie + cross-check move generator; 6 difficulty tiers
  store.js       wallet/stats in localStorage (future-backend seam)
  ui.js          DOM rendering + tap/drag tile interaction + AI turn flow
  main.js        bootstrap: load dictionary, open new-game dialog
docs/data/dictionary.txt   SOWPODS, lowercase, one word per line (267,751 words)
docs/index.html, docs/styles.css
test/engine.test.mjs       engine unit tests (node --test)
test/smoke.mjs             headless Chromium UI smoke test
```

### Data flow

`main.js` loads the dictionary → `ui.js` builds a game via `game.js` →
placement/scoring go through `validation.js` + `scoring.js` → the AI uses
`ai.js` (which calls `validation.js`/`scoring.js` to vet and score its own
candidates). Nothing in the engine imports the UI.

## Key invariants — keep these true

- **Every move is validated by `validation.js`.** The AI generator may
  over-produce candidates; it re-runs `validateMove` on each, so generation bugs
  can never yield an illegal play. Keep this safety net.
- **Determinism from a seed.** Boards and bags come from `rng.js` seeded by the
  game's `seed`. Don't introduce `Math.random()` into board/bag generation —
  it breaks reproducibility (the property that both players see the same board).
  (UI-only randomness like rack shuffle may use `Math.random`.)
- **Premiums apply only to newly placed tiles**, blanks score 0, and a 7-tile
  play gets +50. See `scoring.js`.
- **No build step.** Browser code must be plain ES modules that load directly
  from `docs/`. Don't add bundlers/transpilers without updating the Pages setup.

## Running & testing

```bash
# Serve locally (no build)
python3 -m http.server -d docs 8000      # http://localhost:8000

# Tests
npm test                                  # node --test  (engine)
node test/smoke.mjs                        # headless-browser UI smoke test
```

The smoke test serves `docs/` and drives Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` with `--no-sandbox`. If the
Chromium path changes, update `test/smoke.mjs`.

## Conventions

- Match the existing style: small focused modules, top-of-file comment explaining
  the module's job, descriptive names, no external runtime dependencies.
- Keep engine modules DOM-free so they stay Node-testable.
- Add a test for new engine behavior (`test/engine.test.mjs`) and keep the smoke
  test green before pushing.
- The dictionary file is large; regenerate it from a SOWPODS source with
  `tr 'A-Z' 'a-z' | grep -E '^[a-z]+$' | sort -u` if it ever needs rebuilding.

## Deploying

Commit to the working branch, then merge to `main`. GitHub Pages serves
`main/docs` automatically (a one-time setting: repo Settings → Pages →
Source = `main`, folder = `/docs`). `docs/.nojekyll` is present so Pages serves
the JS modules and data file without Jekyll processing.

## Roadmap

See `Roadmap.md` for phase-by-phase status. Current state: Phases 1, 1.5, 2, and
2.5 are complete and playable; currency/progression is started; achievements,
the store, and anything requiring a backend are planned/deferred.
