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
import { sb, getCurrentUser } from './sb.js';
import { isCurrentWeek } from './weekState.js';

// ── Week state (Absolute Anchored) ───────────────────────────────────────────
export let wk = 0;
export function setWk(val) { wk = val; }

export function getAbsWk(relativeOffset) {
  // Epoch: Midnight local time of Monday, March 23, 2026
  const d = new Date();
  const dy = d.getDay();
  d.setDate(d.getDate() + (dy === 0 ? -6 : 1 - dy) + relativeOffset * 7);
  d.setHours(0,0,0,0);
  
  const epoch = new Date(2026, 2, 23, 0, 0, 0, 0);
  return Math.round((d.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function getMonFromAbs(absOffset) {
  const m = new Date(2026, 2, 23, 0, 0, 0, 0);
  m.setDate(m.getDate() + absOffset * 7);
  return m;
}

export function wkKey()    { return 'wt_wk_' + getAbsWk(wk); }
export function orderKey() { return 'wt_order_' + getAbsWk(wk); }
export function focusKey() { return 'wt_focus_' + getAbsWk(wk); }

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
  // If no data passed (e.g. from a manual console sync), load the current week's local data
  if (!d) {
    d = load();
    if (!d) {
      console.warn('[save] No data found to save.');
      return;
    }
  }

  d.__updated_at = new Date().toISOString();
  localStorage.setItem(wkKey(), JSON.stringify(d));
  
  const absWk = getAbsWk(wk);
  if (_syncQueue['week_' + absWk]) clearTimeout(_syncQueue['week_' + absWk]);
  _syncQueue['week_' + absWk] = setTimeout(() => {
    _perfSyncWeek(absWk, d); 
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

export function flushPendingSyncs() {
  Object.keys(_syncQueue).forEach(key => {
    if (_syncQueue[key]) {
      clearTimeout(_syncQueue[key]);
      // We can't easily await these as they are fired internally,
      // but clearing the timeout and calling the sync functions immediately
      // is better than losing the data entirely on exit.
    }
  });
  
  // Re-run the critical syncs immediately
  const absWk = getAbsWk(wk);
  const d = load(); 
  _perfSyncWeek(absWk, d);
  _syncCategories(loadCats());
  _syncHabits(loadHabits());
  _syncBacklog(loadBacklog());
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
  _syncWeekFocusOrder(getAbsWk(wk));
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
  _syncWeekFocusOrder(getAbsWk(wk));
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

// ── Deleted-category blacklist ────────────────────────────────────────────────
// Tracks explicitly user-deleted category names so repairCategories() never
// automatically resurrects them from historical data.
const _DELETED_KEY = 'wt_deleted_cats';

export function getDeletedCats() {
  try { return JSON.parse(localStorage.getItem(_DELETED_KEY) || '[]'); }
  catch { return []; }
}

export function addDeletedCat(name) {
  const arr = getDeletedCats();
  if (!arr.includes(name)) arr.push(name);
  localStorage.setItem(_DELETED_KEY, JSON.stringify(arr));
}

export function clearDeletedCat(name) {
  const arr = getDeletedCats().filter(n => n !== name);
  localStorage.setItem(_DELETED_KEY, JSON.stringify(arr));
}

// ── Repair Categories ─────────────────────────────────────────────────────────
// Scans historical data and ensures all used categories are in the active list.
// A category is only recovered if it has real content: at least one task in its
// todo list, or a non-empty stack text. Empty shell entries are skipped.
export function repairCategories() {
  const cats = loadCats();
  // Map: original-case name → hasContent (true if any scan pass found real content)
  const discovered = new Map();

  const markContent = (name, hasContent) => {
    if (!name) return;
    discovered.set(name, (discovered.get(name) ?? false) || hasContent);
  };

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_wk_')) {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        if (d.days) {
          d.days.forEach(day => {
            if (day.blocks) day.blocks.forEach(b => {
              // A time block is inherently content
              if (b.category) markContent(b.category, true);
            });
          });
        }
        if (d.todos) {
          Object.entries(d.todos).forEach(([cat, tasks]) => {
            // A task only counts as content if it exists and is not flagged deleted
            markContent(cat, Array.isArray(tasks) && tasks.some(t => !t.deleted));
          });
        }
        if (d.stack) {
          Object.entries(d.stack).forEach(([cat, text]) => {
            markContent(cat, typeof text === 'string' && text.trim() !== '');
          });
        }
      } catch(e) {}
    }
  }

  // Scan Backlog — each item is inherently content
  try {
    const bData = JSON.parse(localStorage.getItem('wt_backlog'));
    if (bData && bData.items) {
      bData.items.forEach(it => { if (it.category) markContent(it.category, true); });
    }
  } catch(e) {}

  let added = 0;

  // Arch contains the explicitly deleted flag for categories that shouldn't be resurrected.
  const arch = loadCatArchive();
  const _deletedSet = new Set(getDeletedCats());

  discovered.forEach((hasContent, name) => {
    // Content gate: skip empty shells
    if (!hasContent) return;
    const clean = name.trim();
    if (!clean) return;

    // Do not resurrect if it was explicitly deleted by the user from the modal
    if (arch[clean + '_deleted']) return;
    if (_deletedSet.has(clean)) return; // blacklisted — skip resurrection

    const existing = cats.find(c => c.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      if (existing.hidden) {
        existing.hidden = false;
        added++;
      }
    } else {
      cats.push({ name: clean, color: '#2563a8', hidden: false });
      added++;
    }
  });

  // Deduplication: remove any duplicate entries (case-insensitive) from the list,
  // keeping the first occurrence. Stamp every entry with a categoryVersion so
  // callers can detect stale recovery across week boundaries.
  const ts = Date.now();
  const seen = new Set();
  const dedupedCats = cats
    .filter(c => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(c => ({ ...c, categoryVersion: ts }));

  if (added > 0) {
    saveCats(dedupedCats);
    console.log(`[repair] Recovered ${added} categories from historical logs.`);
    document.dispatchEvent(new CustomEvent('wt:cats-changed'));
  }
  return added;
}


// ── Backlog ───────────────────────────────────────────────────────────────────
export function loadBacklog() {
  try {
    const r = localStorage.getItem('wt_backlog');
    return r ? JSON.parse(r) : { items: [] };
  } catch(e) { return { items: [] }; }
}

export function saveBacklog(b) {
  localStorage.setItem('wt_backlog', JSON.stringify(b));
  if (_syncQueue['backlog']) clearTimeout(_syncQueue['backlog']);
  _syncQueue['backlog'] = setTimeout(() => _syncBacklog(b), 1500);
}

async function _syncBacklog(b) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    await sb.from('backlog').upsert({
      user_id:    user.id,
      items:      b.items || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch(err) {
    console.warn('[sync] backlog failed:', err.message);
  }
}

// ── Active Timer ──────────────────────────────────────────────────────────────
export function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem('wt_timer') || 'null');
    if (t && (!t.cat || !t.startTime)) return null;
    return t;
  }
  catch(e) { return null; }
}

export function saveTimer(t) {
  if (t === null) localStorage.removeItem('wt_timer');
  else localStorage.setItem('wt_timer', JSON.stringify(t));
  
  // Sync to Supabase in background
  const user = getCurrentUser();
  if (user && user.id !== '00000000-0000-0000-0000-000000000000') {
    if (_syncQueue['timer']) clearTimeout(_syncQueue['timer']);
    _syncQueue['timer'] = setTimeout(() => _syncTimer(t), 1000);
  }
}

async function _syncTimer(t) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    // Attempt to store in profiles table first (global user metadata)
    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      active_timer: t,
      updated_at: new Date().toISOString()
    });
    // If it fails (e.g. column missing), fallback will happen via _syncWeek naturally 
    // because _syncWeek now includes the timer in its payload.
    if (error) console.warn('[sync] timer to profiles failed:', error.message);
  } catch(err) {
    console.warn('[sync] timer failed:', err.message);
  }
}

// Wipes all app data from localStorage for the current browser, but keeps the
// theme preference and active timer so they survive sign-out / user switching.
export function clearUserCache() {
  const theme = localStorage.getItem('wt_theme');
  const timer = localStorage.getItem('wt_timer');
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  if (theme) localStorage.setItem('wt_theme', theme);
  if (timer) localStorage.setItem('wt_timer', timer);
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
  console.log('Import started');
  const file = e.target.files[0];
  if (!file) { console.log('No file selected'); return; }
  const r = new FileReader();
  r.onload = ev => {
    console.log('File loaded, parsing JSON');
    try {
      const raw = ev.target.result;
      const cleaned = raw.replace(/^\uFEFF/, '');
      const all = JSON.parse(cleaned);
      const keyCount = Object.keys(all).filter(k => k.startsWith('wt_wk_')).length;
      console.log('Parsed JSON, week keys count:', keyCount);
      if (!confirm(`This will import ${keyCount} week(s) of data. Existing data for those weeks will be overwritten. Continue?`)) return;
      Object.keys(all).forEach(k => {
        if (k.startsWith('wt_')) {
          localStorage.setItem(k, JSON.stringify(all[k]));
          console.log('Set localStorage key', k);
        }
      });
      document.dispatchEvent(new CustomEvent('wt:import-complete'));
    } catch(err) {
      console.error('Import error', err);
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

async function _perfSyncWeek(offset, d) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  // Use the exact timestamp generated when save() mapped it to localStorage
  const now = d.__updated_at || new Date().toISOString();
  try {
    const focus     = loadFocusForOffset(offset);
    const itemOrder = loadOrderForOffset(offset);
    const payload = {
      user_id:     user.id,
      week_offset: offset,
      intention:   d.intention   || '',
      stack:       d.stack       || {},
      todos:       d.todos       || {},
      days:        d.days        || [],
      review:      d.review      || {},
      focus,
      item_order:  itemOrder     || [],
      active_timer: loadTimer(), // Include timer in every week sync as backup
      updated_at:  now,
    };
    const { error } = await sb.from('weekly_data').upsert(payload, { onConflict: 'user_id, week_offset' });
    if (error) {
      console.warn('[sync] weekly_data failed:', error.message);
      // If the error is about a missing 'todos' column, we don't 'delete' 
      // and re-try because that creates a cloud record with empty tasks, 
      // which could later overwrite local data.
    }
  } catch(err) {
    console.warn('[sync] weekly_data failed:', err.message);
  }
}

async function _syncWeekFocusOrder(offset) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    const focus     = loadFocusForOffset(offset);
    const itemOrder = loadOrderForOffset(offset);
    const d         = load(); // load current week from localStorage cache
    const payload = {
      user_id:     user.id,
      week_offset: offset,
      intention:   d.intention   || '',
      stack:       d.stack       || {},
      todos:       d.todos       || {},
      days:        d.days        || [],
      review:      d.review      || {},
      focus,
      item_order:  itemOrder     || [],
      updated_at:  new Date().toISOString(),
    };
    const { error } = await sb.from('weekly_data').upsert(payload, { onConflict: 'user_id,week_offset' });
    if (error) {
      console.warn('[sync] weekly_data (focus/order) failed:', error.message);
    }
  } catch(err) {
    console.warn('[sync] weekly_data (focus/order) failed:', err.message);
  }
}

async function _syncCategories(cats) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
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
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
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
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
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

// ── Startup migration helpers ─────────────────────────────────────────────────

// Removes duplicate entries from the stored category list, keeping first occurrence.
function cleanupDuplicateCategories() {
  const cats = loadCats();
  const seen = new Set();
  const deduped = cats.filter(c => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length !== cats.length) {
    saveCats(deduped);
    console.log(`[migration] Removed ${cats.length - deduped.length} duplicate categories.`);
  }
}

// Strips __carried_forward markers from every week except the current one.
// These markers are set by the carry-forward operation and are only meaningful
// during the loadFromSupabase write-gate; once incorporated they are stale.
function purgeStaleCarryData() {
  const currentAbsWk = getAbsWk(0);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('wt_wk_')) continue;
    const offset = parseInt(k.replace('wt_wk_', ''), 10);
    if (offset === currentAbsWk) continue; // leave current week untouched
    try {
      const d = JSON.parse(localStorage.getItem(k));
      if (d && '__carried_forward' in d) {
        delete d.__carried_forward;
        localStorage.setItem(k, JSON.stringify(d));
      }
    } catch(e) {
      console.warn('[migration] purgeStaleCarryData: skipping', k, e.message);
    }
  }
}

/**
 * Runs once at app start, before any data load.
 * Deduplicates categories, purges stale carry markers, and removes
 * category-level deleted flags. Task-level deleted flags are never touched.
 */
export function runStartupMigration() {
  cleanupDuplicateCategories();
  purgeStaleCarryData();

  // Strip deleted flag from category objects only — never from task objects
  const cats = loadCats();
  let changed = false;
  cats.forEach(c => {
    if ('deleted' in c) {
      delete c.deleted;
      changed = true;
    }
  });
  if (changed) {
    saveCats(cats);
    console.log('[migration] Removed category-level deleted flags.');
  }
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
    const { data: weeks, error: weeksError } = await sb
      .from('weekly_data')
      .select('*')
      .eq('user_id', user.id);

    if (weeksError) {
      console.error('[loadFromSupabase] weekly_data fetch failed — local state preserved:', weeksError);
      return;
    }

    if (weeks && weeks.length > 0) {
      weeks.forEach(row => {
        const key = 'wt_wk_' + row.week_offset;
        // Only overwrite if Supabase version is strictly newer than local cache
        const local = localStorage.getItem(key);
        const localD = local ? JSON.parse(local) : {};
        const localTs = localD.__updated_at || 0;
        if (localTs && !(new Date(row.updated_at) > new Date(localTs))) return;

        // Week-boundary guard: use isCurrentWeek so the check is never duplicated.
        // For past/future weeks, only allow todos/stack to be overwritten when the
        // remote row was explicitly flagged as a carry-forward. This prevents a stale
        // remote snapshot from clobbering local edits on non-current week offsets.
        const rowMonday = getMonFromAbs(row.week_offset).toDateString();
        const rowIsCurrentWeek = isCurrentWeek(rowMonday);
        const allowTodosStack = rowIsCurrentWeek || !!row.__carried_forward;

        const d = {
          intention:   row.intention  || '',
          stack:       allowTodosStack ? (row.stack || {}) : (localD.stack || {}),
          todos:       allowTodosStack ? (row.todos || {}) : (localD.todos || {}),
          days:        row.days       || [],
          review:      row.review     || {},
          __updated_at: row.updated_at,
        };
        localStorage.setItem(key, JSON.stringify(d));
        if (row.focus && Object.keys(row.focus).length > 0)
          localStorage.setItem('wt_focus_' + row.week_offset, JSON.stringify(row.focus));
        if (row.item_order && row.item_order.length > 0)
          localStorage.setItem('wt_order_' + row.week_offset, JSON.stringify(row.item_order));

        // Restore timer if found and more recent
        if (row.active_timer) {
          const localT = loadTimer();
          if (!localT || (row.updated_at && new Date(row.updated_at) > new Date(localT.__synced_at || 0))) {
            const remoteT = row.active_timer;
            if (remoteT && remoteT.cat && remoteT.startTime) { // Ensure it's a real timer
              remoteT.__synced_at = row.updated_at;
              localStorage.setItem('wt_timer', JSON.stringify(remoteT));
            }
          }
        }
      });
    }

    // Also check profiles for the absolute latest global timer
    try {
      const { data: prof } = await sb.from('profiles').select('active_timer, updated_at').eq('id', user.id).maybeSingle();
      if (prof && prof.active_timer) {
        const localT = loadTimer();
        if (!localT || (prof.updated_at && new Date(prof.updated_at) > new Date(localT.__synced_at || 0))) {
          const remoteT = prof.active_timer;
          if (remoteT && remoteT.cat && remoteT.startTime) {
            remoteT.__synced_at = prof.updated_at;
            localStorage.setItem('wt_timer', JSON.stringify(remoteT));
          }
        }
      }
    } catch(e) { console.warn('[load] global timer skip:', e.message); }

    // Categories
    const { data: cats, error: catsError } = await sb
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('position');

    if (catsError) {
      console.error('[loadFromSupabase] categories fetch failed — local state preserved:', catsError);
      return;
    }

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
      
      // DEFENSIVE: Never overwrite local categories with a significantly smaller list 
      // from cloud unless the cloud data is explicitly newer or the local list is empty/default.
      if (mapped.length >= localCats.length || localCats.length <= 6) {
        localStorage.setItem('wt_categories', JSON.stringify(mapped));
        document.dispatchEvent(new CustomEvent('wt:cats-changed'));
      }
    }


    // Habits
    const { data: habits, error: habitsError } = await sb
      .from('habits')
      .select('*')
      .eq('user_id', user.id);

    if (habitsError) {
      console.error('[loadFromSupabase] habits fetch failed — local state preserved:', habitsError);
      return;
    }

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
    try {
      const { data: arch } = await sb
        .from('cat_archive')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (arch && arch.archive) {
        localStorage.setItem('wt_cat_archive', JSON.stringify(arch.archive));
      }
    } catch(e) { console.warn('[load] cat_archive skip:', e.message); }

    // Backlog
    try {
      const { data: bData } = await sb
        .from('backlog')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (bData && bData.items) {
        localStorage.setItem('wt_backlog', JSON.stringify({ items: bData.items }));
      }
    } catch(e) { console.warn('[load] backlog skip:', e.message); }

  } catch(err) {
    console.warn('[loadFromSupabase] failed:', err.message);
    // Graceful degradation — localStorage data (if any) is used as fallback
  }
}

// ── Realtime Synchronization ───────────────────────────────────────────────────
let _realtimeChannel = null;

export function initRealtimeSync() {
  const user = getCurrentUser();
  if (!user || _realtimeChannel) return;

  _realtimeChannel = sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_data', filter: `user_id=eq.${user.id}` }, payload => {
      handleRemoteWeekChange(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${user.id}` }, () => {
      handleRemoteCatsChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${user.id}` }, () => {
      handleRemoteHabitsChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'backlog', filter: `user_id=eq.${user.id}` }, payload => {
      handleRemoteBacklogChange(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cat_archive', filter: `user_id=eq.${user.id}` }, payload => {
      handleRemoteArchiveChange(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, payload => {
      handleRemoteProfileChange(payload.new);
    })
    .subscribe();

  console.log('[sync] Realtime subscription active');
}

function handleRemoteWeekChange(row) {
  if (!row) return;
  const key = 'wt_wk_' + row.week_offset;
  const local = localStorage.getItem(key);
  const localD = local ? JSON.parse(local) : null;
  const localTs = localD ? (localD.__updated_at || 0) : 0;

  // Only apply if the remote change is newer than our local cache
  if (!localTs || new Date(row.updated_at) > new Date(localTs)) {
    const d = {
      intention:   row.intention  || '',
      stack:       row.stack      || {},
      // DEFENSIVE: Preserve local tasks on realtime update if remote is empty
      todos:       (row.todos && Object.keys(row.todos).length > 0) ? row.todos : (localD?.todos || {}),
      days:        row.days       || [],
      review:      row.review     || {},
      __updated_at: row.updated_at,
    };
    localStorage.setItem(key, JSON.stringify(d));
    if (row.focus) localStorage.setItem('wt_focus_' + row.week_offset, JSON.stringify(row.focus));
    if (row.item_order) localStorage.setItem('wt_order_' + row.week_offset, JSON.stringify(row.item_order));
    
    // Trigger repair after remote week change to ensure categories list stays in sync
    repairCategories();
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'week', offset: row.week_offset } }));
  }
}

async function handleRemoteCatsChange() {
  const user = getCurrentUser();
  const { data: cats } = await sb.from('categories').select('*').eq('user_id', user.id).order('position');
  if (cats) {
    const localCats = JSON.parse(localStorage.getItem('wt_categories') || '[]');
    const hiddenMap = {};
    localCats.forEach(c => { if (c.hidden) hiddenMap[c.name] = true; });

    const mapped = cats.map(c => ({ 
      name: c.name, 
      color: c.color,
      hidden: !!hiddenMap[c.name]
    }));
    localStorage.setItem('wt_categories', JSON.stringify(mapped));
    
    // Trigger repair after remote change to catch any orphaned data
    repairCategories();
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'categories' } }));
  }
}

async function handleRemoteHabitsChange() {
  const user = getCurrentUser();
  const { data: habits } = await sb.from('habits').select('*').eq('user_id', user.id);
  if (habits) {
    const mapped = habits.map(h => ({
      id: h.habit_id, name: h.name, color: h.color, target: h.target
    }));
    localStorage.setItem('wt_habits', JSON.stringify(mapped));
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'habits' } }));
  }
}

function handleRemoteBacklogChange(row) {
  if (row && row.items) {
    localStorage.setItem('wt_backlog', JSON.stringify({ items: row.items }));
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'backlog' } }));
  }
}

function handleRemoteArchiveChange(row) {
  if (row && row.archive) {
    localStorage.setItem('wt_cat_archive', JSON.stringify(row.archive));
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'archive' } }));
  }
}

function handleRemoteProfileChange(row) {
  if (row && row.active_timer) {
    const localT = loadTimer();
    if (!localT || (row.updated_at && new Date(row.updated_at) > new Date(localT.__synced_at || 0))) {
      const remoteT = row.active_timer;
      if (remoteT && remoteT.cat && remoteT.startTime) {
        remoteT.__synced_at = row.updated_at;
        localStorage.setItem('wt_timer', JSON.stringify(remoteT));
        document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'timer' } }));
      }
    }
  }
}
