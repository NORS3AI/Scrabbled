// Browser smoke test: serves docs/, loads the app in headless Chromium, and
// checks the dictionary loads, the board/rack render, the engine runs in-browser,
// and basic tile interaction works. Run: node test/smoke.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../docs');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  // Seed gems (for the shop) and two unlocked-but-unclaimed achievements
  // (len3 = 5 gems, win = 20 gems) to exercise the claim flow.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('scrabbled.wallet.v1', JSON.stringify({ coins: 0, gems: 300 }));
      localStorage.setItem('scrabbled.achievements.v1', JSON.stringify({ unlocked: { len3: true, win: true }, claimed: {} }));
    } catch { /* ignore */ }
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  // Patch notes auto-open for a first-time visitor; dismiss them.
  await page.waitForSelector('#notes-dialog:not(.hidden)', { timeout: 20000 });
  console.log('OK: patch notes shown on first load');
  await page.click('#btn-notes-close');

  // New-game dialog should be present once the dictionary has loaded.
  await page.waitForSelector('#new-dialog:not(.hidden)', { timeout: 20000 });
  console.log('OK: app booted, dictionary loaded');

  await page.click('#btn-start');
  await page.waitForFunction(() => document.querySelectorAll('#board .cell').length === 225, { timeout: 10000 });
  console.log('OK: board rendered (225 cells)');

  const rackTiles = await page.$$eval('#rack .tile', (els) => els.length);
  if (rackTiles !== 7) fail(`expected 7 rack tiles, got ${rackTiles}`);
  else console.log('OK: rack has 7 tiles');

  // Engine runs in-browser (reuses the already-loaded dictionary module).
  const engineOk = await page.evaluate(async () => {
    const { newGame, submitPlay } = await import('./js/game.js');
    const g = newGame({ mode: 'standard', seed: 7, players: [{ name: 'A', type: 'human' }, { name: 'B', type: 'human' }] });
    g.players[0].rack = ['c', 'a', 't', 'e', 'r', 's', 'o'];
    const place = [...'cat'].map((ch, i) => ({ row: 7, col: 6 + i, letter: ch, blank: false }));
    const res = submitPlay(g, place);
    return res.ok && res.score > 0;
  });
  if (!engineOk) fail('in-browser engine play failed'); else console.log('OK: engine plays in-browser');

  // Tile interaction: tap a rack tile to select, tap center cell to place.
  await page.click('#rack .slot[data-rack-index="0"] .tile');
  const selected = await page.$('#rack .slot.selected');
  if (!selected) fail('rack tile did not select on tap'); else console.log('OK: rack tile selects');

  await page.click('#board .cell[data-row="7"][data-col="7"]');
  const pending = await page.$$eval('#board .tile.pending', (els) => els.length);
  if (pending !== 1) fail(`expected 1 pending tile after place, got ${pending}`); else console.log('OK: tile places on board');

  // The Swap button becomes Recall once a tile is on the board.
  await page.click('#btn-swap');
  const afterRecall = await page.$$eval('#board .tile.pending', (els) => els.length);
  if (afterRecall !== 0) fail('recall did not clear pending tiles'); else console.log('OK: Swap→Recall works');

  // Achievement badge reflects the two seeded claimable achievements.
  const badge = await page.$eval('#ach-badge', (b) => (b.classList.contains('hidden') ? '' : b.textContent));
  if (badge !== '2') fail(`expected claim badge "2", got "${badge}"`); else console.log('OK: claim badge shows 2');

  // Achievements dialog lists the full catalogue.
  await page.click('#btn-achievements');
  await page.waitForSelector('#ach-dialog:not(.hidden)');
  const achCount = await page.$$eval('#ach-body .ach-item', (els) => els.length);
  if (achCount !== 44) fail(`expected 44 achievements, got ${achCount}`); else console.log('OK: achievements list renders (44)');

  // Claim all -> gems go 300 + 5 + 20 = 325, badge clears.
  await page.click('#btn-claim-all');
  await page.waitForFunction(() => document.getElementById('wallet-gems').textContent === '325', { timeout: 4000 });
  const badgeAfter = await page.$eval('#ach-badge', (b) => b.classList.contains('hidden'));
  if (!badgeAfter) fail('claim badge did not clear after claim all'); else console.log('OK: claimed achievements -> +25 gems, badge cleared');
  await page.click('#btn-ach-close');

  // Shop: buy a Best-Word Hint (have seeded gems).
  await page.click('#btn-shop');
  await page.waitForSelector('#shop-dialog:not(.hidden)');
  await page.click('[data-buy="hint"]');
  const owned = await page.$eval('[data-buy="hint"]', (b) => b.closest('.shop-card').querySelector('.shop-own').textContent);
  if (!/Owned: 1/.test(owned)) fail(`hint not purchased, saw "${owned}"`); else console.log('OK: bought a power-up in the shop');
  await page.click('#btn-shop-close');

  // Use the Hint power-up; it should highlight the best word on the board.
  await page.click('#btn-powerups');
  await page.waitForSelector('#powerups-dialog:not(.hidden)');
  await page.click('[data-use="hint"]');
  await page.waitForFunction(() => document.querySelectorAll('.cell .tile.hint').length >= 1, { timeout: 8000 });
  console.log('OK: used Hint power-up (best word highlighted)');

  // Dev mode: enable it; the +gems/+coins buttons now live in Settings.
  await page.click('#btn-settings');
  await page.click('#set-dev');
  const gemsBefore = await page.$eval('#wallet-gems', (e) => Number(e.textContent));
  await page.click('#dev-tools [data-gem="100"]');
  const gemsAfter = await page.$eval('#wallet-gems', (e) => Number(e.textContent));
  if (gemsAfter !== gemsBefore + 100) fail(`dev +100 gems failed (${gemsBefore} -> ${gemsAfter})`); else console.log('OK: dev +gems button (in Settings) works');
  await page.click('#dev-tools [data-coin="1000"]');
  const coins = await page.$eval('#wallet-coins', (e) => Number(e.textContent));
  if (coins < 1000) fail(`dev +coins failed (${coins})`); else console.log('OK: dev +coins button (in Settings) works');
  await page.click('#btn-settings-close');

  await page.click('#btn-best');
  await page.waitForFunction(() => /pts/.test(document.querySelector('#best-result').textContent), { timeout: 8000 });
  await page.click('#btn-place-best');
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.pending').length >= 2, { timeout: 8000 });
  console.log('OK: dev "Place on board" placed the best word');

  // Play is the first control and noticeably wider than the others.
  const layout = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.controls .btn')].map((b) => b.id);
    const play = document.getElementById('btn-play').getBoundingClientRect().width;
    const shuffle = document.getElementById('btn-shuffle').getBoundingClientRect().width;
    return { first: ids[0], playWider: play > shuffle * 1.3 };
  });
  if (layout.first !== 'btn-play') fail(`Play is not first (${layout.first})`); else console.log('OK: Play is the first control');
  if (!layout.playWider) fail('Play button is not wider'); else console.log('OK: Play button is wider');
  await page.click('#btn-swap'); // recall the placed tiles

  // Buy a theme with coins and confirm it recolors the tiles (CSS var changes).
  await page.click('#btn-shop');
  await page.waitForSelector('#shop-dialog:not(.hidden)');
  await page.click('[data-buytheme="purple"]');
  await page.click('#btn-shop-close');
  await page.click('#btn-settings');
  await page.$$eval('#theme-picker .theme-btn', (btns) => { const t = btns.find((b) => /Velvet/.test(b.textContent)); if (t) t.click(); });
  const tileVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tile-edge').trim());
  if (!tileVar || tileVar === '#c8a35f') fail(`theme did not recolor tiles (--tile-edge=${tileVar})`); else console.log('OK: theme recolors tiles');
  await page.click('#btn-settings-close');

  // Drag a rack tile across the board and confirm no ghost artifact remains.
  const tBox = await page.$eval('#rack .slot[data-rack-index="0"] .tile', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const cBox = await page.$eval('#board .cell[data-row="7"][data-col="7"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(tBox.x, tBox.y);
  await page.mouse.down();
  await page.mouse.move((tBox.x + cBox.x) / 2, (tBox.y + cBox.y) / 2, { steps: 5 });
  await page.mouse.move(cBox.x, cBox.y, { steps: 5 });
  await page.mouse.up();
  const ghosts = await page.$$eval('.tile.ghost', (els) => els.length);
  if (ghosts !== 0) fail(`drag left ${ghosts} ghost artifact(s)`); else console.log('OK: drag leaves no ghost artifact');
  await page.click('#btn-swap'); // recall

  // Pass via the Swap dialog so the computer plays; its tiles should be gold.
  await page.click('#btn-swap');
  await page.waitForSelector('#swap-dialog:not(.hidden)');
  await page.click('#btn-swap-pass');
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.lastmove').length >= 2, { timeout: 15000 });
  console.log('OK: computer move highlighted gold (lastmove)');

  // Move-history panel renders entries and collapses (not hides).
  const histEntries = await page.$$eval('#history li', (els) => els.length);
  if (histEntries < 1) fail('history panel has no entries'); else console.log('OK: move history renders');
  await page.click('#btn-history-toggle');
  const collapsed = await page.$eval('#history-panel', (el) => el.classList.contains('collapsed') && getComputedStyle(el).display !== 'none');
  if (!collapsed) fail('history did not collapse (or got hidden)'); else console.log('OK: history collapses (stays visible)');

  // Resume on refresh: reload and the saved game should resume (no new-game dialog).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.locked').length >= 2, { timeout: 12000 });
  const newDialogHidden = await page.$eval('#new-dialog', (d) => d.classList.contains('hidden'));
  if (!newDialogHidden) fail('new-game dialog appeared after refresh — game did not resume');
  else console.log('OK: game resumes after a tab refresh');

  // Auto-play: enable it, place the best word, and it should play itself in ~3s.
  await page.waitForFunction(() => !document.getElementById('btn-play').disabled || true, { timeout: 8000 });
  await page.click('#btn-settings');
  await page.click('#set-autoplay');
  await page.click('#btn-settings-close');
  await page.click('#btn-best');
  await page.waitForFunction(() => /pts/.test(document.querySelector('#best-result').textContent), { timeout: 8000 });
  await page.click('#btn-place-best');
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.pending').length >= 2, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.pending').length === 0, { timeout: 6000 });
  console.log('OK: auto-play submitted the word after ~3s');

  if (errors.length) fail('console/page errors: ' + errors.join(' | '));
  if (!process.exitCode) console.log('\nALL SMOKE CHECKS PASSED');
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  server.close();
}
