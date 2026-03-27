// ── storage.js ───────────────────────────────────────────────────────────────
// The data layer. All reads/writes go through this file.
//
// ARCHITECTURE — two-layer approach:
//   1. localStorage  → synchronous cache, keeps all existing app code working
//                      unchanged (load/save are still instant/synchronous)
//   2. Supabase       → async sync layer, called in the background after every
//                       save(). The app never waits for it.
//
// This means:
//   - The UI is always instant (reads from localStorage cache)
//   - Data is durably persisted to the cloud after every change
//   - If offline, changes queue up in localStorage and sync on next load
//
// When migrating away from Supabase in the future, only this file changes.

import { DAYS, DEFAULT_CATS, DEFAULT_HABITS } from './constants.js';
import { sb, getCurrentUser } from './auth.js';

// ── Week state ────────────────────────────────────────────────────────────────
export let wk = 0;
export function setWk(val) { wk = val; }

export function wkKey()    { return 'wt_wk_' + wk; }
export function orderKey() { return 'wt_order_' + wk; }
export function focusKey() { return 'wt_focus_' + wk; }

// ── Default week data ─────────────────────────────────────────────────────────
export function def() {
  const cats  = loadCats();
  const stack = {};
  cats.forEach(c => { stack[c.name] = ''; });
  return {
    intention: '',
    stack,
    todos: {},
    days: DAYS.map(() => ({
      mvd: false, fullRest: false,
      blocks: [], habits: {}, journal: '',
    })),
    review: { worked: '', didnt: '', adjust: '' },
  };
}

// ── Synchronous read/write (localStorage cache) ───────────────────────────────
// These are called throughout the app and must remain synchronous.

export function load() {
  try {
    const r = localStorage.getItem(wkKey());
    if (r) {
      const d = JSON.parse(r);
      return migrateData(d);
    }
    return def();
  } catch(e) { return def(); }
}

function migrateData(d) {
  if (d && d.days) {
    d.days.forEach(day => {
      if (day.run !== undefined) {
        if (!day.habits) day.habits = {};
        if (day.run) day.habits.run = true;
        delete day.run;
      }
      if (day.rest !== undefined) {
        if (!day.habits) day.habits = {};
        if (day.rest) day.habits.rest = true;
        delete day.rest;
      }
    });
  }
  return d;
}

const _syncQueue = {};

export function save(d) {
  d.__updated_at = new Date().toISOString();
  localStorage.setItem(wkKey(), JSON.stringify(d));
  
  if (_syncQueue['week_' + wk]) clearTimeout(_syncQueue['week_' + wk]);
  _syncQueue['week_' + wk] = setTimeout(() => {
    _syncWeek(wk, d); // fire-and-forget background sync
  }, 1500);
}

// ── Categories ────────────────────────────────────────────────────────────────
export function loadCats() {
  try {
    const r = localStorage.getItem('wt_categories');
    return r ? JSON.parse(r) : DEFAULT_CATS.slice();
  } catch(e) { return DEFAULT_CATS.slice(); }
}

export function saveCats(cats) {
  localStorage.setItem('wt_categories', JSON.stringify(cats));
  if (_syncQueue['cats']) clearTimeout(_syncQueue['cats']);
  _syncQueue['cats'] = setTimeout(() => _syncCategories(cats), 1500);
}

// ── Custom habits ─────────────────────────────────────────────────────────────
export function loadHabits() {
  try {
    const r = localStorage.getItem('wt_habits');
    if (!r) return DEFAULT_HABITS.slice();
    const arr = JSON.parse(r);
    const seen = new Set();
    return arr.filter(h => {
      if (seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    });
  } catch(e) { return DEFAULT_HABITS.slice(); }
}

export function saveHabits(h) {
  localStorage.setItem('wt_habits', JSON.stringify(h));
  if (_syncQueue['habits']) clearTimeout(_syncQueue['habits']);
  _syncQueue['habits'] = setTimeout(() => _syncHabits(h), 1500);
}

export function allHabits() {
  return loadHabits();
}

// ── Focus levels ──────────────────────────────────────────────────────────────
// Focus and order are stored inside weekly_data in Supabase (see _syncWeek),
// so no separate sync call is needed here.
export function loadFocus() {
  try {
    const r = localStorage.getItem(focusKey());
    return r ? JSON.parse(r) : {};
  } catch(e) { return {}; }
}

export function saveFocus(f) {
  localStorage.setItem(focusKey(), JSON.stringify(f));
  // Merge into weekly data sync — read current week data and re-sync
  _syncWeekFocusOrder(wk);
}

// ── Stack item order ──────────────────────────────────────────────────────────
export function loadOrder() {
  try {
    const r = localStorage.getItem(orderKey());
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}

export function saveOrder(arr) {
  localStorage.setItem(orderKey(), JSON.stringify(arr));
  _syncWeekFocusOrder(wk);
}

export function sortedCats() {
  const cats  = loadCats();
  const order = loadOrder();
  let result;
  if (!order) {
    result = cats;
  } else {
    const mapped = order.map(name => cats.find(c => c.name === name)).filter(Boolean);
    const extras = cats.filter(c => !order.includes(c.name));
    result = [...mapped, ...extras];
  }
  const others = result.filter(c => c.name === 'Others' || c.name === 'Other');
  const rest   = result.filter(c => c.name !== 'Others' && c.name !== 'Other');
  return [...rest, ...others];
}

// ── Category archive ──────────────────────────────────────────────────────────
export function loadCatArchive() {
  try { return JSON.parse(localStorage.getItem('wt_cat_archive') || '{}'); }
  catch(e) { return {}; }
}

export function saveCatArchive(arch) {
  localStorage.setItem('wt_cat_archive', JSON.stringify(arch));
  if (_syncQueue['cat_archive']) clearTimeout(_syncQueue['cat_archive']);
  _syncQueue['cat_archive'] = setTimeout(() => _syncCatArchive(arch), 1500);
}

// ── User cache helpers ───────────────────────────────────────────────────────
// Wipes all app data from localStorage for the current browser, but keeps the
// theme preference so it survives sign-out / user switching.
export function clearUserCache() {
  const theme = localStorage.getItem('wt_theme');
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  if (theme) localStorage.setItem('wt_theme', theme);
}

// ── Export / Import ───────────────────────────────────────────────────────────
export function exportD() {
  const all = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_')) {
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
      document.dispatchEvent(new CustomEvent('wt:import-complete'));
    } catch(err) {
      alert('Could not read file. Make sure it is a valid tracker export.');
    }
  };
  r.readAsText(file);
}

export function updateExportLbl() {
  const lbl = document.getElementById('lastExportLbl');
  const ts  = localStorage.getItem('wt_last_export');
  if (lbl) lbl.textContent = ts ? 'Last export: ' + ts : '';
}

// ── Focus key helpers (used by stack.js carry forward) ───────────────────────
export function loadFocusKey() { return 'wt_focus_'; }

// ── Supabase sync functions ───────────────────────────────────────────────────
// All async, all fire-and-forget. Errors are logged but never surface to
// the user — the localStorage cache is always the source of truth locally.

async function _syncWeek(offset, d) {
  const user = getCurrentUser();
  if (!user) return;
  // Use the exact timestamp generated when save() mapped it to localStorage
  const now = d.__updated_at || new Date().toISOString();
  try {
    const focus     = loadFocusForOffset(offset);
    const itemOrder = loadOrderForOffset(offset);
    await sb.from('weekly_data').upsert({
      user_id:     user.id,
      week_offset: offset,
      intention:   d.intention   || '',
      stack:       d.stack       || {},
      days:        d.days        || [],
      review:      d.review      || {},
      focus,
      item_order:  itemOrder     || [],
      updated_at:  now,
    }, { onConflict: 'user_id, week_offset' });
  } catch(err) {
    console.warn('[sync] weekly_data failed:', err.message);
  }
}

// Called when only focus or order changes (not the full day data)
async function _syncWeekFocusOrder(offset) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    const focus     = loadFocusForOffset(offset);
    const itemOrder = loadOrderForOffset(offset);
    const d         = load(); // load current week from localStorage cache
    await sb.from('weekly_data').upsert({
      user_id:     user.id,
      week_offset: offset,
      intention:   d.intention   || '',
      stack:       d.stack       || {},
      days:        d.days        || [],
      review:      d.review      || {},
      focus,
      item_order:  itemOrder     || [],
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'user_id,week_offset' });
  } catch(err) {
    console.warn('[sync] weekly_data (focus/order) failed:', err.message);
  }
}

async function _syncCategories(cats) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    // Delete all existing categories for this user and re-insert.
    // Simpler than diffing — category lists are short.
    await sb.from('categories').delete().eq('user_id', user.id);
    if (cats.length > 0) {
      await sb.from('categories').insert(
        cats.map((c, i) => ({
          user_id:  user.id,
          name:     c.name,
          color:    c.color,
          position: i,
        }))
      );
    }
  } catch(err) {
    console.warn('[sync] categories failed:', err.message);
  }
}

async function _syncHabits(habits) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    await sb.from('habits').delete().eq('user_id', user.id);
    if (habits.length > 0) {
      await sb.from('habits').insert(
        habits.map(h => ({
          user_id:  user.id,
          habit_id: h.id,
          name:     h.name,
          color:    h.color,
          target:   h.target || 5,
        }))
      );
    }
  } catch(err) {
    console.warn('[sync] habits failed:', err.message);
  }
}

async function _syncCatArchive(arch) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    await sb.from('cat_archive').upsert({
      user_id:    user.id,
      archive:    arch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch(err) {
    console.warn('[sync] cat_archive failed:', err.message);
  }
}

// ── Helpers to load focus/order for any week offset ──────────────────────────
function loadFocusForOffset(offset) {
  try {
    const r = localStorage.getItem('wt_focus_' + offset);
    return r ? JSON.parse(r) : {};
  } catch(e) { return {}; }
}

function loadOrderForOffset(offset) {
  try {
    const r = localStorage.getItem('wt_order_' + offset);
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}

// ── Remote load on login ──────────────────────────────────────────────────────
// Called once by app.js after auth is confirmed (wt:auth-ready event).
// Pulls all data from Supabase into localStorage so the rest of the app
// works as normal. This is the only time we read FROM Supabase — after
// this point, localStorage is always up to date.
export async function loadFromSupabase() {
  const user = getCurrentUser();
  if (!user) return;

  // ── User-switch guard ────────────────────────────────────────────────────────
  // If a different user's data is cached in localStorage, clear it first so
  // the new user always starts with a clean slate before we pull their data.
  const cachedUid = localStorage.getItem('wt_uid');
  if (cachedUid && cachedUid !== user.id) {
    clearUserCache();
  }
  localStorage.setItem('wt_uid', user.id);

  try {
    // Weekly data
    const { data: weeks } = await sb
      .from('weekly_data')
      .select('*')
      .eq('user_id', user.id);

    if (weeks && weeks.length > 0) {
      weeks.forEach(row => {
        const key = 'wt_wk_' + row.week_offset;
        // Only overwrite if Supabase version is newer than local cache
        const local = localStorage.getItem(key);
        const localTs = local ? (JSON.parse(local).__updated_at || 0) : 0;
        if (!localTs || new Date(row.updated_at) > new Date(localTs)) {
          const d = {
            intention:   row.intention  || '',
            stack:       row.stack      || {},
            days:        row.days       || [],
            review:      row.review     || {},
            __updated_at: row.updated_at,
          };
          localStorage.setItem(key, JSON.stringify(d));
          if (row.focus && Object.keys(row.focus).length > 0)
            localStorage.setItem('wt_focus_' + row.week_offset, JSON.stringify(row.focus));
          if (row.item_order && row.item_order.length > 0)
            localStorage.setItem('wt_order_' + row.week_offset, JSON.stringify(row.item_order));
        }
      });
    }

    // Categories
    const { data: cats } = await sb
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('position');

    if (cats && cats.length > 0) {
      // Preserve local hidden state since the Supabase table lacks a 'hidden' column
      const localCats = JSON.parse(localStorage.getItem('wt_categories') || '[]');
      const hiddenMap = {};
      localCats.forEach(c => { if (c.hidden) hiddenMap[c.name] = true; });

      const mapped = cats.map(c => ({ 
        name: c.name, 
        color: c.color,
        hidden: !!hiddenMap[c.name]
      }));
      localStorage.setItem('wt_categories', JSON.stringify(mapped));
    }

    // Habits
    const { data: habits } = await sb
      .from('habits')
      .select('*')
      .eq('user_id', user.id);

    if (habits && habits.length > 0) {
      const mapped = habits.map(h => ({
        id:     h.habit_id,
        name:   h.name,
        color:  h.color,
        target: h.target,
      }));
      localStorage.setItem('wt_habits', JSON.stringify(mapped));
    }

    // Cat archive
    const { data: arch } = await sb
      .from('cat_archive')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (arch && arch.archive) {
      localStorage.setItem('wt_cat_archive', JSON.stringify(arch.archive));
    }

  } catch(err) {
    console.warn('[loadFromSupabase] failed:', err.message);
    // Graceful degradation — localStorage data (if any) is used as fallback
  }
}
