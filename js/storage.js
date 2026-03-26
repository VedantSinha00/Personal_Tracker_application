// ── storage.js ───────────────────────────────────────────────────────────────
// The data layer. Every read from and write to localStorage lives here.
//
// ARCHITECTURE NOTE: This is intentionally the only file that touches
// localStorage. When we migrate to Supabase, this is the only file that
// changes — every other module keeps calling the same functions.

import { DAYS, DEFAULT_CATS, BUILTIN_HABITS } from './constants.js';

// ── Week state ───────────────────────────────────────────────────────────────
// `wk` is a number representing offset from the current week.
//  0 = this week, -1 = last week, 1 = next week, etc.
// It's exported so other modules can read it, but only storage.js mutates it.
export let wk = 0;
export function setWk(val) { wk = val; }

export function wkKey()    { return 'wt_wk_' + wk; }
export function orderKey() { return 'wt_order_' + wk; }
export function focusKey() { return 'wt_focus_' + wk; }

// ── Week data (the main payload) ─────────────────────────────────────────────
// Each week's data is a single JSON object stored under its wkKey.
// Shape: { intention, stack, days: [...], review: {...} }

export function def() {
  const cats = loadCats();
  const stack = {};
  cats.forEach(c => { stack[c.name] = ''; });
  return {
    intention: '',
    stack,
    days: DAYS.map(() => ({
      run: false,
      rest: false,
      mvd: false,
      fullRest: false,
      blocks: [],
      habits: {},
    })),
    review: { worked: '', didnt: '', adjust: '' },
  };
}

export function load() {
  try {
    const r = localStorage.getItem(wkKey());
    return r ? JSON.parse(r) : def();
  } catch(e) { return def(); }
}

export function save(d) {
  localStorage.setItem(wkKey(), JSON.stringify(d));
}

// ── Categories ───────────────────────────────────────────────────────────────
export function loadCats() {
  try {
    const r = localStorage.getItem('wt_categories');
    return r ? JSON.parse(r) : DEFAULT_CATS.slice();
  } catch(e) { return DEFAULT_CATS.slice(); }
}
export function saveCats(cats) {
  localStorage.setItem('wt_categories', JSON.stringify(cats));
}

// ── Custom habits ────────────────────────────────────────────────────────────
export function loadHabits() {
  try {
    const r = localStorage.getItem('wt_habits');
    return r ? JSON.parse(r) : [];
  } catch(e) { return []; }
}
export function saveHabits(h) {
  localStorage.setItem('wt_habits', JSON.stringify(h));
}
export function allHabits() {
  return [...BUILTIN_HABITS, ...loadHabits()];
}

// ── Focus levels (per week, per category) ────────────────────────────────────
export function loadFocus() {
  try {
    const r = localStorage.getItem(focusKey());
    return r ? JSON.parse(r) : {};
  } catch(e) { return {}; }
}
export function saveFocus(f) {
  localStorage.setItem(focusKey(), JSON.stringify(f));
}

// ── Stack item order (per week) ──────────────────────────────────────────────
export function loadOrder() {
  try {
    const r = localStorage.getItem(orderKey());
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}
export function saveOrder(arr) {
  localStorage.setItem(orderKey(), JSON.stringify(arr));
}

// sortedCats applies the saved drag order and always pins "Others" last.
export function sortedCats() {
  const cats = loadCats();
  const order = loadOrder();
  let result;
  if (!order) {
    result = cats;
  } else {
    const mapped = order.map(name => cats.find(c => c.name === name)).filter(Boolean);
    const extras = cats.filter(c => !order.includes(c.name));
    result = [...mapped, ...extras];
  }
  const others = result.filter(c => c.name === 'Others');
  const rest   = result.filter(c => c.name !== 'Others');
  return [...rest, ...others];
}

// ── Targets (runs/week, rest/week) ───────────────────────────────────────────
export function loadTargets() {
  try {
    const r = localStorage.getItem('wt_targets');
    return r ? JSON.parse(r) : { runs: 3, rest: 5 };
  } catch(e) { return { runs: 3, rest: 5 }; }
}
export function saveTargetsData(runs, rest) {
  localStorage.setItem('wt_targets', JSON.stringify({ runs, rest }));
}

// ── Category archive ─────────────────────────────────────────────────────────
// When a category is deleted, its colour is archived so old blocks
// still render with the right colour.
export function loadCatArchive() {
  try { return JSON.parse(localStorage.getItem('wt_cat_archive') || '{}'); }
  catch(e) { return {}; }
}
export function saveCatArchive(arch) {
  localStorage.setItem('wt_cat_archive', JSON.stringify(arch));
}

// ── Export / Import ──────────────────────────────────────────────────────────
export function exportD() {
  const all = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('wt_')) {
      try { all[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
    }
  }
  const ts = new Date().toISOString().slice(0, 10);
  all['wt_exported'] = ts;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
  );
  a.download = 'tracker_' + ts + '.json';
  a.click();
  localStorage.setItem('wt_last_export', ts);
  updateExportLbl();
}

export function importD(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const all = JSON.parse(ev.target.result);
      const keyCount = Object.keys(all).filter(k => k.startsWith('wt_wk_')).length;
      if (!confirm(`This will import ${keyCount} week(s) of data. Existing data for those weeks will be overwritten. Continue?`)) return;
      Object.keys(all).forEach(k => {
        if (k.startsWith('wt_')) localStorage.setItem(k, JSON.stringify(all[k]));
      });
      // renderAll will be called by app.js after import
      document.dispatchEvent(new CustomEvent('wt:import-complete'));
    } catch(err) {
      alert('Could not read file. Make sure it is a valid tracker export.');
    }
  };
  r.readAsText(file);
}

export function updateExportLbl() {
  const lbl = document.getElementById('lastExportLbl');
  const ts = localStorage.getItem('wt_last_export');
  if (lbl) lbl.textContent = ts ? 'Last export: ' + ts : '';
}
