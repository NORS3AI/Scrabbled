# Scrabbled — Build Roadmap

An ad-free, async turn-based word game (Scrabble / Words With Friends style) with
built-in chat, single-player and multiplayer, AI opponents, randomized board
modes, and a gameplay-earned currency system.

**Live build:** https://nors3ai.github.io/Scrabbled/ (GitHub Pages, `main` → `/docs`)

---

## Status at a glance

| Phase | Area | Status |
|-------|------|--------|
| 1 | Core game logic & engine | ✅ Done (client-side) |
| 1.5 | Game modes (standard + randomized) | ✅ Done |
| 2 | Frontend UI & board rendering | ✅ Done |
| 2.5 | Practice & AI opponents (6 tiers) | ✅ Done |
| 3 | Notifications & UX | 🟡 Partial (local; needs backend for cross-device) |
| 3.5 | Currency & progression | 🟡 Started (coins/gems wallet, local) |
| 4 | Achievements & store | 🟡 Done client-side (44 achievements + gem shop with usable power-ups) |
| 4.5 | Polish & features | 🟡 Partial (chat/leaderboards need backend) |

Legend: ✅ done · 🟡 in progress / partial · ⬜ not started

---

## Important: hosting constraint & the multiplayer path

The roadmap's original stack is **Node + Express + PostgreSQL**. The chosen host
for now is **GitHub Pages** (`main` → `/docs`), which is a **static** file host:
it cannot run a server or a database.

Consequences:

- Everything that runs **client-side** is live today: the full game engine,
  vs-AI, practice, same-device pass-and-play, randomized boards, and a local
  coins/gems wallet.
- Everything that needs a **server** — online async multiplayer between two
  devices, cross-device accounts, turn notifications, remote chat — cannot be
  Pages-only.

**The frontend does not need to move to add online play.** Three options, all of
which keep the UI on GitHub Pages:

| Option | How it works | Trade-off |
|--------|--------------|-----------|
| **A. Backend-as-a-service** (Supabase / Firebase) | Pages frontend talks to a hosted realtime DB + auth | No server to operate; fastest path to true async multiplayer. **Recommended.** |
| **B. Own backend** (Express + Postgres on Railway/Heroku) | Pages frontend → your API | Matches the original roadmap; full control; you run a server. |
| **C. Peer-to-peer** (WebRTC + tiny signaling relay) | Devices talk directly | Cheap, but both players must be online simultaneously — not truly async. |

The seam is already in place: game state is a single serializable object and
`docs/js/store.js` isolates persistence. Swapping `localStorage` for a remote
store is a contained change; the engine and UI are untouched.

---

## Phase 1 — Core Infrastructure & Game Logic ✅

Built as a framework-free, testable engine (`docs/js/`), runnable in both the
browser and Node.

- ✅ Game state model (`game.js`) — board state, mode, current turn, status,
  players, move history. Serializable (the "schema" for a static client; maps
  cleanly to `users` / `games` / `moves` tables when a DB is added).
- ✅ Dictionary — **SOWPODS** (267,751 words) loaded locally, O(1) validity.
- ✅ Create / configure game (`newGame`).
- ✅ Move submission with **server-grade validation** (`validation.js`): legal
  placement, contiguity, connection to existing tiles, first-move-through-center,
  every main and cross word checked against the dictionary, tiles-in-rack check.
- ✅ Score calculation with letter and word multipliers, blanks, and the 50-point
  bingo bonus (`scoring.js`).
- ✅ Turn management, swap, pass.
- ✅ Win-condition logic: out-of-tiles end, six-consecutive-scoreless-turns end,
  end-of-game rack-point adjustments, resign.
- ⬜ Authentication / `users` table — deferred to the backend phase (not possible
  on a static host).

## Phase 1.5 — Game Modes ✅

- ✅ **Standard layout** — canonical premium positions (`layout.js`).
- ✅ **Randomized layout** — multipliers scattered from a seed with balancing:
  same premium counts as standard, center kept as the star, and no two
  Triple-Word squares within king-move distance 2 (anti-clustering). The seed is
  stored on the game so both players (today, the same device) see an identical
  board.
- ✅ Mode registry (`BOARD_MODES`) so future modes (speed, themed dictionaries)
  drop in without touching the engine.

## Phase 2 — Frontend UI & Board Rendering ✅

- ✅ Board component, tile rack, scoreboard (`ui.js`).
- ✅ **Tile placement** via drag-and-drop **and** tap-to-place (pointer events →
  works with mouse and touch), grid snapping, invalid-drop guards, ghost tile.
- ✅ Board renders current state on load (the async refresh model).
- ✅ Move history display, live score for both players, live score preview while
  composing a word.
- ✅ New-game lobby dialog (opponent / difficulty / board mode).
- ⬜ Listing/joining *remote* games — backend phase.

## Phase 2.5 — Practice & AI Opponents ✅

- ✅ **Practice mode** — solo, no opponent.
- ✅ **AI** with 6 tiers: Beginner → Easy → Intermediate → Advanced → Expert →
  Master (`ai.js`). Trie + cross-check move generation (Appel–Jacobson style);
  every candidate is re-validated by the human validator, so the AI can never
  play illegally. Higher tiers score better; Master adds rack-leave evaluation
  and triple-word-exposure avoidance.

## Phase 3 — Notifications & User Experience 🟡

- 🟡 In-app turn cues (whose turn, "computer is thinking") — done locally.
- ⬜ Cross-device turn notifications (email/push) — backend phase.
- 🟡 Player stats — win/loss, best word, total score stored locally (`store.js`).
- 🟡 Game history — per-game move history is shown; persistent multi-game history
  needs storage/accounts.
- ⬜ Session management / persistent login — backend phase.

## Phase 3.5 — Currency & Progression 🟡

- ✅ Two currencies — **coins** (earned per point scored) and **gems** (per game,
  bonus on a win), persisted locally.
- ⬜ Streaks and richer earning rules.
- ⬜ Server-side wallet so it follows the account across devices.

## Phase 4 — Achievements & Store 🟡 (client-side done)

- ✅ Achievement tracking: 44 achievements across word length, word scores,
  single-game milestones, letter feats, and victories (`achievements.js`). They
  unlock as you play; the player taps **Claim** to collect gems. Persisted in
  `store.js`.
- ✅ Store (`shop.js`): spend gems on power-ups priced 10–100 by rarity. They
  **stack** and are used on your turn (⚡): Best-Word Hint, Free Swap, Fresh
  Rack, Double Word, Triple Word, Extra Turn.
- 🟡 Power-up balancing — initial pass; tune as play data comes in.
- ⬜ **Cosmetics store (coins):** gems buy power-ups; **coins** will buy cosmetic
  themes — tile faces, stickers, and board colors/themes. Planned.
- ⬜ Server-side achievements/inventory so they follow the account across
  devices (backend phase).

## Phase 4.5 — Polish & Features 🟡

- 🟡 Win/loss tracking (local) → Elo once games are server-tracked.
- ⬜ Leaderboards — backend phase.
- ⬜ In-game chat — local pass-and-play has no need; remote chat is backend phase.
- ⬜ Game settings — time limits, custom tile sets.
- ✅ Mobile responsiveness — baseline done; ongoing tuning.

---

## Build order summary

1. **Phase 1** — Core logic & engine ✅
2. **Phase 1.5** — Game modes ✅
3. **Phase 2** — Frontend & board ✅
4. **Phase 2.5** — Practice & AI ✅
5. **Phase 3** — Notifications & UX 🟡 (needs backend for cross-device)
6. **Phase 3.5** — Currency & progression 🟡
7. **Phase 4** — Achievements & store ⬜
8. **Phase 4.5** — Polish & extras 🟡

**Philosophy:** Phase 1 is rock solid and tested before layering the rest. We
reached a playable game first; the remaining phases layer on top, and the
backend-dependent items wait for the multiplayer decision (Option A/B/C above).
