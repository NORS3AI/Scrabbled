# Scrabbled

An ad-free, turn-based word game in the spirit of Scrabble / Words With Friends —
with AI opponents, randomized board layouts, and an earn-by-playing currency.
It runs **entirely in your browser**: no account, no server, no ads.

## ▶️ Play it now

**https://nors3ai.github.io/scrabbled/**

> Hosted on GitHub Pages from `main` → `/docs`. The first load downloads the
> SOWPODS word list (~2.6 MB) and then the game is fully offline-capable.

## What you can play today

| Mode | Description |
|------|-------------|
| **Computer** | Single-player vs an AI opponent across **6 difficulty tiers** (Beginner → Master). |
| **Practice (solo)** | Play freely against the board to learn — no opponent. |
| **Pass & Play** | Two humans sharing one device (couch co-op). |
| **Board: Standard** | The classic premium-square layout. |
| **Board: Randomized** | Multipliers scattered per game with balancing rules, reproducible from a stored seed. |

Features: drag-and-drop **and** tap-to-place tiles, blank-tile letter picker,
live score preview, full word/placement validation, swap & pass, bingo bonus,
move history, end-of-game rack scoring, and a coins/gems wallet you build up by
playing. Mobile-responsive.

## Why is online multiplayer not here yet?

GitHub Pages is a **static** host — it can serve files but can't run a server or
database. True async multiplayer (your move is stored, your opponent is notified
on their device, they load the updated board) needs a backend, which Pages can't
provide. So the Pages build covers everything that runs client-side: vs-AI,
practice, and same-device pass-and-play.

The codebase is structured so online play is an additive change, not a rewrite —
game state is a single serializable object, and `docs/js/store.js` is the seam
where a remote backend (Supabase, or the roadmap's Express + Postgres on
Railway/Heroku) would plug in. The React/JS frontend stays on Pages; only the
data layer moves. See `Roadmap.md` for the details.

## Tech

- **Engine:** framework-free ES modules (board, bag, scoring, validation, AI) —
  the same code runs in the browser and under Node for tests.
- **Dictionary:** SOWPODS (267,751 words), loaded client-side; validity checks are
  O(1), and the AI uses a trie with cross-checks for move generation.
- **UI:** vanilla JS + CSS, no build step (so GitHub Pages serves it directly).
- **Tests:** `node --test` for the engine; headless Chromium smoke test for the UI.

## Local development

No build step. Serve the `docs/` folder with any static server:

```bash
# from the repo root
python3 -m http.server -d docs 8000
# then open http://localhost:8000
```

### Tests

```bash
npm test                 # engine unit tests (node --test)
node test/smoke.mjs      # headless-browser UI smoke test (needs Chromium)
```

## Project layout

```
docs/                 # the deployed site (GitHub Pages root)
  index.html
  styles.css
  data/dictionary.txt # SOWPODS word list
  js/
    constants.js      # board size, tile points & distribution, premium layouts
    rng.js            # seeded PRNG (reproducible boards/bags)
    layout.js         # standard + randomized board layouts
    bag.js            # tile bag
    board.js          # board model + helpers
    dictionary.js     # word list + trie for the AI
    validation.js     # legal-placement + word extraction
    scoring.js        # premium-aware scoring + bingo
    game.js           # turn management, end conditions, final scoring
    ai.js             # trie-based move generator + difficulty tiers
    store.js          # wallet/stats persistence (and the future-backend seam)
    ui.js             # rendering + tap/drag interaction
    main.js           # bootstrap
test/                 # engine tests + browser smoke test
Roadmap.md            # build roadmap and status
CLAUDE.md             # guidance for future development
```

## License

MIT.
