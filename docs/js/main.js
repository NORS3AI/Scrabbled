// Entry point: load the dictionary, reveal the app, and either resume a saved
// game or open the new-game dialog. Everything else is driven by ui.js.

import { loadDictionary } from './dictionary.js';
import { startUI, openNewDialog, resumeOrNew } from './ui.js';

async function boot() {
  try {
    await loadDictionary('./data/dictionary.txt');
  } catch (err) {
    document.getElementById('loading').innerHTML =
      `<div class="overlay-card"><h1>Couldn't load the dictionary</h1>` +
      `<p class="muted">${String(err.message || err)}</p></div>`;
    return;
  }
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  startUI();
  resumeOrNew(); // resume a saved in-progress game, or open the new-game dialog
}

document.getElementById('btn-new').addEventListener('click', openNewDialog);
boot();
