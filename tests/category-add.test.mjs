// Regression tests for category add/re-add.
//
//   node --test tests/
//
// Uses node:test (built in — no new dependencies). Imports the REAL modules from
// js/ so these cannot drift from the source they guard.
//
// Covers two independent defects:
//   A. Tombstone resurrection — a name that was ever deleted leaves a
//      "<Name>_deleted" flag in wt_cat_archive that survives re-adding it, and
//      every local-category write path filters that name out.
//   B. Blind sync guard — _syncQueue['cats'] was cleared before the network
//      round-trip, so a concurrent cloud read during the push saw no pending
//      write and could clobber it.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal browser shims, installed before importing the modules ────────────
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: i => [...store.keys()][i] ?? null,
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.window = globalThis;
const stubEl = () => ({
  style: {}, classList: { add() {}, remove() {}, contains: () => false },
  appendChild() {}, removeChild() {}, remove() {}, setAttribute() {},
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  innerHTML: '', textContent: '', value: '', dataset: {},
});
globalThis.document = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: stubEl,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { classList: { add() {}, remove() {} }, appendChild() {} },
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };

const storage = await import('../js/storage.js');
const {
  loadCats, saveCats,
  loadCatArchive, saveCatArchive,
  getDeletedCats, addDeletedCat,
  _catsSyncPending,
} = storage;

const DEFAULTS = [
  { name: 'Academics', color: '#2563a8' },
  { name: 'Fitness',   color: '#3fa672' },
  { name: 'Others',    color: '#8b8b8b' },
];
const names = () => loadCats().map(c => c.name);

// Mirrors categories.js deleteCat()'s tombstone writes (the DOM parts are not
// under test here — only the storage side effects that cause the bug).
function tombstone(name, color = '#3fa672') {
  const arch = loadCatArchive();
  arch[name] = color;
  arch[name + '_deleted'] = true;
  saveCatArchive(arch);
  addDeletedCat(name);
  saveCats(loadCats().filter(c => c.name !== name));
}

beforeEach(() => {
  store.clear();
  saveCats(DEFAULTS.slice());
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A. tombstone must not survive a re-add', () => {

  test('clearCategoryTombstone removes the flag for an exact-case name', () => {
    tombstone('Fitness');
    assert.equal(loadCatArchive()['Fitness_deleted'], true, 'setup: flag present');

    storage.clearCategoryTombstone('Fitness');

    assert.ok(!('Fitness_deleted' in loadCatArchive()), 'archive flag cleared');
    assert.ok(!getDeletedCats().includes('fitness'), 'blacklist entry cleared');
  });

  test('clearCategoryTombstone is case-insensitive (the original defect)', () => {
    // deleteCat writes the key in the category's original case...
    tombstone('Fitness');
    // ...but the user re-adds it typing a different case. The old code looked up
    // `fitness_deleted`, found nothing, and left `Fitness_deleted` alive — while
    // the read-side filters lowercase both sides, so it still matched.
    storage.clearCategoryTombstone('fitness');

    const arch = loadCatArchive();
    const stillTombstoned = Object.keys(arch)
      .some(k => k.toLowerCase() === 'fitness_deleted');
    assert.ok(!stillTombstoned, 'no case-variant of the flag may remain');
  });

  test('clearCategoryTombstone strips every case variant at once', () => {
    const arch = loadCatArchive();
    arch['Fitness_deleted'] = true;
    arch['fitness_deleted'] = true;
    arch['FITNESS_deleted'] = true;
    saveCatArchive(arch);

    storage.clearCategoryTombstone('FiTnEsS');

    const left = Object.keys(loadCatArchive())
      .filter(k => k.toLowerCase() === 'fitness_deleted');
    assert.deepEqual(left, [], 'all variants removed');
  });

  test('clearCategoryTombstone leaves other categories untouched', () => {
    tombstone('Fitness');
    tombstone('Academics', '#2563a8');

    storage.clearCategoryTombstone('Fitness');

    const arch = loadCatArchive();
    assert.equal(arch['Academics_deleted'], true, 'unrelated tombstone preserved');
    assert.ok(getDeletedCats().includes('academics'), 'unrelated blacklist preserved');
  });

  test('the archived colour is preserved so historical blocks still render', () => {
    tombstone('Fitness', '#3fa672');
    storage.clearCategoryTombstone('Fitness');
    assert.equal(loadCatArchive()['Fitness'], '#3fa672',
      'only the _deleted flag is removed, not the colour record');
  });

  test('clearing a name that was never deleted is a harmless no-op', () => {
    const before = JSON.stringify(loadCatArchive());
    storage.clearCategoryTombstone('BrandNew');
    assert.equal(JSON.stringify(loadCatArchive()), before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A2. cloud archive merge must not resurrect a cleared tombstone', () => {

  test('mergeCatArchive keeps a local un-delete when the category is live', () => {
    // Local: user re-added Fitness, so no tombstone and it IS in wt_categories.
    saveCats([...DEFAULTS]);
    saveCatArchive({ Fitness: '#3fa672' });

    // Cloud still holds the stale tombstone from the original delete.
    const merged = storage.mergeCatArchive({ Fitness: '#3fa672', Fitness_deleted: true });

    assert.ok(!('Fitness_deleted' in merged),
      'a tombstone must not be re-imported for a category that is live locally');
  });

  test('mergeCatArchive still imports tombstones for categories not held locally', () => {
    saveCats(DEFAULTS.filter(c => c.name !== 'Fitness'));
    saveCatArchive({});

    const merged = storage.mergeCatArchive({ Fitness: '#3fa672', Fitness_deleted: true });

    assert.equal(merged['Fitness_deleted'], true,
      'genuine cross-device deletions must still propagate');
  });

  test('mergeCatArchive preserves local-only tombstones (original union behaviour)', () => {
    saveCats(DEFAULTS.filter(c => c.name !== 'Reading'));
    saveCatArchive({ Reading: '#2563a8', Reading_deleted: true });

    const merged = storage.mergeCatArchive({ Academics: '#2563a8' });

    assert.equal(merged['Reading_deleted'], true,
      'a local delete not yet pushed must survive the merge');
  });

  test('mergeCatArchive drops a stale tombstone from a realtime archive echo', () => {
    // handleRemoteArchiveChange() receives the cat_archive row straight from the
    // realtime payload. The archive push is debounced 1500ms, so an echo can carry
    // a snapshot from BEFORE a re-add cleared the flag. Routing it through
    // mergeCatArchive() keeps that stale flag from re-killing the live category.
    saveCats([...DEFAULTS]);              // Fitness is live locally (just re-added)
    saveCatArchive({ Fitness: '#3fa672' });

    const merged = storage.mergeCatArchive({ Fitness: '#3fa672', Fitness_deleted: true });

    assert.ok(!('Fitness_deleted' in merged),
      'a stale realtime archive echo must not resurrect the tombstone');
  });

  test('mergeCatArchive is case-insensitive about what counts as live', () => {
    saveCats([{ name: 'fitness', color: '#2563a8' }, ...DEFAULTS]);
    saveCatArchive({});

    const merged = storage.mergeCatArchive({ Fitness_deleted: true });

    assert.ok(!('Fitness_deleted' in merged),
      'live "fitness" must block the "Fitness_deleted" tombstone');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. the sync-pending guard must cover the network round-trip', () => {

  test('_catsSyncPending is true from saveCats() until the push settles', async () => {
    // beforeEach's saveCats() legitimately raises the guard — let it settle first
    // so this test starts from a genuinely idle state.
    await new Promise(r => setTimeout(r, 600));
    assert.equal(_catsSyncPending(), false, 'idle before any write');

    saveCats([...DEFAULTS, { name: 'Reading', color: '#2563a8' }]);
    assert.equal(_catsSyncPending(), true, 'pending immediately after saveCats');

    // Through the 500ms debounce and into the (no-op, unauthenticated) push.
    await new Promise(r => setTimeout(r, 600));
    assert.equal(_catsSyncPending(), false,
      'clears once the push has actually settled');
  });

  test('a fresh saveCats during an in-flight push keeps the guard raised', async () => {
    saveCats([...DEFAULTS, { name: 'Reading', color: '#2563a8' }]);
    await new Promise(r => setTimeout(r, 520));   // debounce fired
    saveCats([...DEFAULTS, { name: 'Reading', color: '#111111' }]);
    assert.equal(_catsSyncPending(), true,
      'the second write re-raises the guard');
  });
});
