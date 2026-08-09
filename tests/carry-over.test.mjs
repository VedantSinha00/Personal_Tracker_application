import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal browser shims ──────────────────────────────────────────────────
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
const stubEl = () => {
  const el = {
    style: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, removeChild() {}, remove() {}, setAttribute() {}, insertAdjacentHTML() {},
    replaceChild() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    innerHTML: '', textContent: '', value: '', dataset: {},
  };
  el.cloneNode = () => el;
  el.parentNode = el;
  return el;
};
globalThis.document = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: stubEl,
  getElementById: stubEl,
  querySelector: stubEl,
  querySelectorAll: () => [],
  body: { classList: { add() {}, remove() {} }, appendChild() {} },
  documentElement: stubEl(),
};
globalThis.requestAnimationFrame = cb => cb();
globalThis.lucide = { createIcons() {} };
globalThis.navigator = { onLine: true };
globalThis.CustomEvent = class CustomEvent { constructor(type, opt = {}) { this.type = type; this.detail = opt.detail; } };

const { def, isWeekContentEmpty, getAbsWk } = await import('../js/storage.js');
const { carryForward } = await import('../js/stack.js');

describe('Carry-over & Empty Week Detection', () => {
  beforeEach(() => {
    store.clear();
  });

  test('isWeekContentEmpty detects empty week defaults accurately', () => {
    assert.equal(isWeekContentEmpty(null), true);
    assert.equal(isWeekContentEmpty(undefined), true);

    const emptyDef = def();
    assert.equal(isWeekContentEmpty(emptyDef), true, 'Default week object with empty category shells must be considered empty');
  });

  test('isWeekContentEmpty returns false when stack text is present', () => {
    const d = def();
    d.stack['Work'] = 'Build feature';
    assert.equal(isWeekContentEmpty(d), false, 'Non-empty stack text must mark week as non-empty');
  });

  test('isWeekContentEmpty returns false when non-deleted todos are present', () => {
    const d = def();
    d.todos['Work'] = [{ id: '1', text: 'Task 1', done: false, deleted: false }];
    assert.equal(isWeekContentEmpty(d), false, 'Active todo item must mark week as non-empty');
  });

  test('isWeekContentEmpty returns true when todos are all soft-deleted', () => {
    const d = def();
    d.todos['Work'] = [{ id: '1', text: 'Task 1', done: true, deleted: true }];
    assert.equal(isWeekContentEmpty(d), true, 'Only soft-deleted todos should leave week considered empty');
  });

  test('carryForward copies stack items and unfinished tasks from last week', () => {
    const prevAbs = getAbsWk(-1);
    const prevKey = 'wt_wk_' + prevAbs;

    const prevData = {
      stack: { Project: 'Priority project' },
      todos: { Project: [{ id: 't1', text: 'Unfinished task', done: false, deleted: false }] },
    };
    store.set(prevKey, JSON.stringify(prevData));

    carryForward();

    const curAbs = getAbsWk(0);
    const curKey = 'wt_wk_' + curAbs;
    const curRaw = store.get(curKey);
    assert.ok(curRaw, 'Current week data must be saved after carryForward');

    const curData = JSON.parse(curRaw);
    assert.equal(curData.stack['Project'], 'Priority project');
    assert.equal(curData.todos['Project']?.length, 1);
    assert.equal(curData.todos['Project'][0].text, 'Unfinished task');
  });
});
