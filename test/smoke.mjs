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

  await page.click('#btn-recall');
  const afterRecall = await page.$$eval('#board .tile.pending', (els) => els.length);
  if (afterRecall !== 0) fail('recall did not clear pending tiles'); else console.log('OK: recall works');

  // Pass the turn so the computer plays; it should drop tiles on the board.
  await page.click('#btn-pass');
  await page.waitForFunction(() => document.querySelectorAll('#board .tile.locked').length >= 2, { timeout: 15000 });
  console.log('OK: computer played tiles onto the board');

  if (errors.length) fail('console/page errors: ' + errors.join(' | '));
  if (!process.exitCode) console.log('\nALL SMOKE CHECKS PASSED');
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  server.close();
}
