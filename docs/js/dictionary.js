// Dictionary: loads the SOWPODS word list, exposes O(1) validity checks, and
// lazily builds a trie (with prefix pruning) used by the AI move generator.

let WORDS = null; // Set<string> of valid lowercase words
let TRIE = null; // root trie node, built on first AI use

// Trie node shape: { c: Map<char, node>, w: boolean } where w marks word end.
function makeNode() {
  return { c: new Map(), w: false };
}

function addWord(root, word) {
  let node = root;
  for (const ch of word) {
    let next = node.c.get(ch);
    if (!next) {
      next = makeNode();
      node.c.set(ch, next);
    }
    node = next;
  }
  node.w = true;
}

// Load and parse the dictionary file. Call once at startup.
export async function loadDictionary(url = './data/dictionary.txt') {
  if (WORDS) return WORDS;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load dictionary: ${res.status}`);
  const text = await res.text();
  WORDS = new Set();
  for (const line of text.split('\n')) {
    const w = line.trim();
    if (w) WORDS.add(w);
  }
  return WORDS;
}

// For tests / Node: load from a pre-parsed iterable of words.
export function setWords(iterable) {
  WORDS = new Set();
  TRIE = null;
  for (const w of iterable) {
    const t = String(w).trim().toLowerCase();
    if (t) WORDS.add(t);
  }
  return WORDS;
}

export function isWord(word) {
  if (!WORDS) throw new Error('Dictionary not loaded');
  return WORDS.has(String(word).toLowerCase());
}

export function wordCount() {
  return WORDS ? WORDS.size : 0;
}

// Build (or return cached) trie for the AI. Lazy because it is memory-heavy.
export function getTrie() {
  if (TRIE) return TRIE;
  if (!WORDS) throw new Error('Dictionary not loaded');
  const root = makeNode();
  for (const w of WORDS) addWord(root, w);
  TRIE = root;
  return TRIE;
}

export function trieChild(node, ch) {
  return node ? node.c.get(ch) : undefined;
}
