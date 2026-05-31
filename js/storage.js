// @ts-check
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
import { showToast } from './toast.js';

/** @typedef {import('./constants.js').Category}   Category   */
/** @typedef {import('./constants.js').Habit}      Habit      */
/** @typedef {import('./constants.js').WeekData}   WeekData   */
/** @typedef {import('./constants.js').BacklogData} BacklogData */
/** @typedef {import('./constants.js').TimerState} TimerState */

/**
 * Throttle window per distinct toast message. Keyed by message so identical
 * failures (e.g. many tables failing the same way in one burst) collapse to a
 * single toast, while distinct failure classes (network vs policy/schema) are
 * each shown once and never mask one another.
 * @type {Map<string, number>}
 */
const _lastSyncToastByMsg = new Map();
const SYNC_TOAST_THROTTLE_MS = 5000;
/**
 * Decide whether a sync failure looks like a connectivity problem (can't reach
 * the server) rather than a database policy/schema rejection. Connectivity
 * errors are thrown fetch failures with no PostgREST/Postgres error code.
 * @param {any} error
 * @returns {boolean}
 */
function _isNetworkError(error) {
  if (error && error.code) return false; // PostgREST/Postgres codes => server replied
  const msg = String(error && (error.message || error) || '').toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout');
}
function handleSyncError(operation, error) {
  if (!error) return;
  if (navigator.onLine) {
    console.error(`[sync-error] ${operation} failed:`, error);
    const msg = _isNetworkError(error)
      ? `Cloud sync failed: can't reach the server. Changes saved locally.`
      : `Cloud sync failed: database policy or schema error.`;
    const now = Date.now();
    const last = _lastSyncToastByMsg.get(msg) || 0;
    if (now - last > SYNC_TOAST_THROTTLE_MS) { // limit each distinct message to once every 5 seconds
      _lastSyncToastByMsg.set(msg, now);
      showToast(msg, 'error', 4000);
    }
  } else {
    console.warn(`[sync-offline] ${operation} failed:`, error);
  }
}

// ── Week state (Absolute Anchored) ───────────────────────────────────────────
export let wk = 0;
/** @param {number} val */
export function setWk(val) { wk = val; }

/** @param {number} relativeOffset @returns {number} */
export function getAbsWk(relativeOffset) {
  // Epoch: Midnight local time of Monday, March 23, 2026
  const d = new Date();
  const dy = d.getDay();
  d.setDate(d.getDate() + (dy === 0 ? -6 : 1 - dy) + relativeOffset * 7);
  d.setHours(0,0,0,0);
  
  const epoch = new Date(2026, 2, 23, 0, 0, 0, 0);
  return Math.round((d.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/** @param {number} absOffset @returns {Date} */
export function getMonFromAbs(absOffset) {
  const m = new Date(2026, 2, 23, 0, 0, 0, 0);
  m.setDate(m.getDate() + absOffset * 7);
  return m;
}

/** @returns {string} */ export function wkKey()    { return 'wt_wk_' + getAbsWk(wk); }
/** @returns {string} */ export function orderKey() { return 'wt_order_' + getAbsWk(wk); }
/** @returns {string} */ export function focusKey() { return 'wt_focus_' + getAbsWk(wk); }

// ── Default week data ─────────────────────────────────────────────────────────
/** @returns {WeekData} */
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

/** @returns {WeekData} */
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

// ── Cloud hydration gate ───────────────────────────────────────────────────────
// Habits sync is reconciliatory: it makes the cloud match the local list. Sign-out
// wipes the local `wt_habits` cache (loadHabits() then returns DEFAULT_HABITS), so a
// habits push that runs *before* the cloud has been loaded into local this session
// would overwrite the user's real cloud habits with defaults. This flag is flipped
// OFF at the start of every loadFromSupabase() and back ON only once that load has
// completed successfully; _syncHabits refuses to write to the cloud until then.
// (Root cause of the v1.3.8 habits-loss incident.)
let _remoteHydrated = false;

/** @param {WeekData} [d] */
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
/** @returns {Category[]} */
export function loadCats() {
  try {
    const r = localStorage.getItem('wt_categories');
    return r ? JSON.parse(r) : DEFAULT_CATS.slice();
  } catch(e) { return DEFAULT_CATS.slice(); }
}

/** @param {Category[]} cats */
export function saveCats(cats) {
  localStorage.setItem('wt_categories', JSON.stringify(cats));
  if (_syncQueue['cats']) clearTimeout(_syncQueue['cats']);
  _syncQueue['cats'] = setTimeout(() => {
    _syncQueue['cats'] = null; // Mark as no longer pending before async push
    _syncCategories(cats);
  }, 500);
}

// ── Custom habits ─────────────────────────────────────────────────────────────
/** @returns {Habit[]} */
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

/** @param {Habit[]} h */
export function saveHabits(h) {
  localStorage.setItem('wt_habits', JSON.stringify(h));
  if (_syncQueue['habits']) clearTimeout(_syncQueue['habits']);
  // Don't capture `h` here — _syncHabits re-reads loadHabits() at fire time so a
  // stale pre-hydration array can never be the thing that reaches the cloud.
  _syncQueue['habits'] = setTimeout(() => _syncHabits(), 1500);
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
  _syncHabits();
  _syncBacklog(loadBacklog());
}

/** @returns {Habit[]} */
export function allHabits() {
  return loadHabits();
}

// ── Focus levels ──────────────────────────────────────────────────────────────
// Focus and order are stored inside weekly_data in Supabase (see _syncWeek),
// so no separate sync call is needed here.
/** @returns {Record<string, number>} category name → focus level (1–5) */
export function loadFocus() {
  try {
    const r = localStorage.getItem(focusKey());
    return r ? JSON.parse(r) : {};
  } catch(e) { return {}; }
}

/** @param {Record<string, number>} f */
export function saveFocus(f) {
  localStorage.setItem(focusKey(), JSON.stringify(f));
  // Merge into weekly data sync — read current week data and re-sync
  _syncWeekFocusOrder(getAbsWk(wk));
}

// ── Stack item order ──────────────────────────────────────────────────────────
/** @returns {string[] | null} ordered category names, or null if unset */
export function loadOrder() {
  try {
    const r = localStorage.getItem(orderKey());
    return r ? JSON.parse(r) : null;
  } catch(e) { return null; }
}

/** @param {string[]} arr */
export function saveOrder(arr) {
  localStorage.setItem(orderKey(), JSON.stringify(arr));
  _syncWeekFocusOrder(getAbsWk(wk));
}

/** @returns {Category[]} categories in user-defined order, "Others" always last */
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

/** @returns {string[]} lowercase category names the user has explicitly deleted */
export function getDeletedCats() {
  try { return JSON.parse(localStorage.getItem(_DELETED_KEY) || '[]'); }
  catch { return []; }
}

/** @param {string} name */
export function addDeletedCat(name) {
  const arr = getDeletedCats();
  const lower = name.toLowerCase();
  if (!arr.includes(lower)) arr.push(lower);
  localStorage.setItem(_DELETED_KEY, JSON.stringify(arr));
}

/** @param {string} name */
export function clearDeletedCat(name) {
  const lower = name.toLowerCase();
  const arr = getDeletedCats().filter(n => n.toLowerCase() !== lower);
  localStorage.setItem(_DELETED_KEY, JSON.stringify(arr));
}

// ── Repair Categories ─────────────────────────────────────────────────────────
// Scans historical data and ensures all used categories are in the active list.
// A category is only recovered if it has real content: at least one task in its
// todo list, or a non-empty stack text. Empty shell entries are skipped.
/** @returns {number} count of categories recovered */
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
  const archDeletedLower = new Set(
    Object.keys(arch)
      .filter(k => k.endsWith('_deleted'))
      .map(k => k.toLowerCase())
  );
  const _deletedSet = new Set(getDeletedCats().map(n => n.toLowerCase()));

  discovered.forEach((hasContent, name) => {
    // Content gate: skip empty shells
    if (!hasContent) return;
    const clean = name.trim();
    if (!clean) return;

    // Do not resurrect if it was explicitly deleted by the user from the modal
    if (archDeletedLower.has((clean + '_deleted').toLowerCase())) return;
    if (_deletedSet.has(clean.toLowerCase())) return; // blacklisted — skip resurrection

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
/** @returns {BacklogData} */
export function loadBacklog() {
  try {
    const r = localStorage.getItem('wt_backlog');
    return r ? JSON.parse(r) : { items: [] };
  } catch(e) { return { items: [] }; }
}

/** @param {BacklogData} b */
export function saveBacklog(b) {
  localStorage.setItem('wt_backlog', JSON.stringify(b));
  if (_syncQueue['backlog']) clearTimeout(_syncQueue['backlog']);
  _syncQueue['backlog'] = setTimeout(() => _syncBacklog(b), 1500);
}

async function _syncBacklog(b) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    const { error } = await sb.from('backlog').upsert({
      user_id:    user.id,
      items:      b.items || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) handleSyncError('backlog', error);
  } catch(err) {
    handleSyncError('backlog', err);
  }
}

// ── Active Timer ──────────────────────────────────────────────────────────────
const _MAX_TIMER_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** @returns {TimerState | null} */
export function loadTimer() {
  try {
    const t = JSON.parse(localStorage.getItem('wt_timer') || 'null');
    if (!t || !t.cat || !t.startTime) return null;
    // Discard timers whose startTime is older than 24 hours — they are ghost sessions
    if (Date.now() - t.startTime > _MAX_TIMER_AGE_MS) {
      console.warn('[timer] Discarding stale timer from', new Date(t.startTime).toLocaleString());
      localStorage.removeItem('wt_timer');
      return null;
    }
    return t;
  }
  catch(e) { return null; }
}

/** @param {TimerState | null} t */
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
    if (error) {
      console.warn('[sync] timer to profiles failed:', error.message);
      handleSyncError('profiles_timer', error);
    }
  } catch(err) {
    handleSyncError('profiles_timer', err);
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

/** @param {Event} e */
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
      handleSyncError('weekly_data', error);
    }
  } catch(err) {
    handleSyncError('weekly_data', err);
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
      handleSyncError('weekly_data_focus_order', error);
    }
  } catch(err) {
    handleSyncError('weekly_data_focus_order', err);
  }
}

export async function _softDeleteCategory(name) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    const { error } = await sb.from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('name', name);
    if (error) {
      console.warn('[sync] soft delete failed:', error.message);
      handleSyncError('categories_delete', error);
    }
  } catch(err) {
    handleSyncError('categories_delete', err);
  }
}

async function _syncCategories(localCats) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    const { data: remote, error } = await sb.from('categories')
      .select('id,name,color,deleted_at,position')
      .eq('user_id', user.id);
      
    if (error) {
      console.warn('[sync] categories fetch error', error);
      handleSyncError('categories_fetch', error);
      return;
    }

    const remoteMap = new Map((remote || []).map(c => [c.name.toLowerCase(), c]));
    const localMap = new Map(localCats.map(c => [c.name.toLowerCase(), c]));

    const toInsert = [];
    const toUpdate = [];
    
    localCats.forEach((cat, index) => {
      const remoteCat = remoteMap.get(cat.name.toLowerCase());
      if (!remoteCat) {
        toInsert.push({ user_id: user.id, name: cat.name, color: cat.color, deleted_at: null, position: index });
      } else if (remoteCat.deleted_at || remoteCat.color !== cat.color || remoteCat.position !== index) {
        toUpdate.push({ id: remoteCat.id, user_id: user.id, name: cat.name, color: cat.color, deleted_at: null, position: index });
      }
    });

    const toDelete = [];
    for (const [name, remoteCat] of remoteMap) {
      if (!localMap.has(name) && !remoteCat.deleted_at) {
        toDelete.push(remoteCat);
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await sb.from('categories').insert(toInsert);
      if (insertErr) {
        console.error('[sync] categories insert failed:', insertErr);
        handleSyncError('categories_insert', insertErr);
      }
    }
    if (toUpdate.length > 0) {
      const { error: upsertErr } = await sb.from('categories').upsert(toUpdate);
      if (upsertErr) {
        console.error('[sync] categories upsert failed:', upsertErr);
        handleSyncError('categories_update', upsertErr);
      }
    }
    
    for (const d of toDelete) {
      const { error: delErr } = await sb.from('categories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', d.id);
      if (delErr) {
        console.error('[sync] categories soft delete item failed:', delErr);
        handleSyncError('categories_soft_delete_item', delErr);
      }
    }
  } catch(err) {
    handleSyncError('categories', err);
  }
}

// Reconciles the cloud `habits` table to match local, NON-destructively.
// Ignores any argument: always re-reads loadHabits() at fire time. Guarded so it
// can never run before the cloud has been hydrated into local this session, and
// uses a diff (insert/update/delete-changed) instead of delete-all-then-insert,
// so there is no window in which a wiped/stale local list can erase real habits.
async function _syncHabits() {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;

  // GUARD (hydration): never reconcile the cloud before this session has loaded
  // the cloud's habits into local. Without this, a wiped local cache (post
  // sign-out) would push DEFAULT_HABITS and delete the user's real habits.
  if (!_remoteHydrated) {
    console.warn('[sync] habits push skipped — cloud not yet hydrated this session');
    return;
  }

  // Always read the freshest local state, never a stale captured array.
  const habits = loadHabits();

  try {
    const { data: remote, error: fetchErr } = await sb.from('habits')
      .select('habit_id')
      .eq('user_id', user.id);
    if (fetchErr) { handleSyncError('habits_fetch', fetchErr); return; }

    // ANTI-WIPE GUARD: if local has no habits but the cloud does, treat it as a
    // transient/empty state and refuse to delete the cloud copy.
    if (habits.length === 0 && remote && remote.length > 0) {
      console.warn('[sync] habits push skipped — local empty but cloud has habits');
      return;
    }

    const remoteIds = new Set((remote || []).map(r => r.habit_id));
    const localIds  = new Set(habits.map(h => h.id));

    // Insert habits the cloud doesn't have yet.
    const toInsert = habits
      .filter(h => !remoteIds.has(h.id))
      .map(h => ({
        user_id:  user.id,
        habit_id: h.id,
        name:     h.name,
        color:    h.color,
        target:   h.target || 5,
      }));
    if (toInsert.length > 0) {
      const { error } = await sb.from('habits').insert(toInsert);
      if (error) { handleSyncError('habits_insert', error); return; }
    }

    // Update habits that already exist (name/color/target may have changed).
    for (const h of habits.filter(h => remoteIds.has(h.id))) {
      const { error } = await sb.from('habits')
        .update({ name: h.name, color: h.color, target: h.target || 5 })
        .eq('user_id', user.id)
        .eq('habit_id', h.id);
      if (error) handleSyncError('habits_update', error);
    }

    // Delete only habits the user actually removed locally.
    const toDelete = [...remoteIds].filter(id => !localIds.has(id));
    if (toDelete.length > 0) {
      const { error } = await sb.from('habits')
        .delete()
        .eq('user_id', user.id)
        .in('habit_id', toDelete);
      if (error) handleSyncError('habits_delete', error);
    }
  } catch(err) {
    handleSyncError('habits', err);
  }
}

async function _syncCatArchive(arch) {
  const user = getCurrentUser();
  if (!user || user.id === '00000000-0000-0000-0000-000000000000') return;
  try {
    const { error } = await sb.from('cat_archive').upsert({
      user_id:    user.id,
      archive:    arch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) handleSyncError('cat_archive', error);
  } catch(err) {
    handleSyncError('cat_archive', err);
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

  // Assign unique IDs to tasks lacking them
  migrateTasksWithIds();
}

// ── Remote load on login ──────────────────────────────────────────────────────
// Called once by app.js after auth is confirmed (wt:auth-ready event).
// Pulls all data from Supabase into localStorage so the rest of the app
// works as normal. This is the only time we read FROM Supabase — after
// this point, localStorage is always up to date.
/** @returns {Promise<void>} */
export async function loadFromSupabase() {
  const user = getCurrentUser();
  if (!user) return;

  // Close the habits-sync gate for this session until the cloud load below
  // completes — see _remoteHydrated. Re-armed on every login / user switch.
  _remoteHydrated = false;

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
        const local = localStorage.getItem(key);
        const localD = local ? JSON.parse(local) : {};
        const localTs = localD.__updated_at || 0;

        const rowMonday = getMonFromAbs(row.week_offset).toDateString();
        const rowIsCurrentWeek = isCurrentWeek(rowMonday);

        // "No local edits to protect": the local cache for this week is absent OR
        // holds no stack/todos content. Fresh session, new device, post-sign-out
        // cache clear — or a record previously written empty by this very guard.
        const localHasNoStackTodos =
          (!localD.stack || Object.keys(localD.stack).length === 0) &&
          (!localD.todos || Object.keys(localD.todos).length === 0);

        // Does the cloud actually hold stack/todos worth hydrating for this week?
        const remoteHasStackTodos =
          (row.stack && Object.keys(row.stack).length > 0) ||
          (row.todos && Object.keys(row.todos).length > 0);

        // Self-heal back-fill: a past/future week whose local cache has no
        // stack/todos but whose cloud row does. This recovers the case where an
        // earlier load dropped the remote stack/todos AND stamped the empty record
        // with the remote timestamp — making the timestamp guard below skip it
        // forever and leaving carryForward() with nothing to carry.
        const needsBackfill = !rowIsCurrentWeek && localHasNoStackTodos && remoteHasStackTodos;

        // Only overwrite if Supabase version is strictly newer than local cache —
        // unless we must back-fill missing stack/todos (timestamps tie on a record
        // that was previously written empty, so the strict-newer test never passes).
        const staleByTimestamp = localTs && !(new Date(row.updated_at) > new Date(localTs));
        if (staleByTimestamp && !needsBackfill) return;

        // Week-boundary guard: use isCurrentWeek so the check is never duplicated.
        // For past/future weeks, only allow todos/stack to be overwritten when the
        // remote row was explicitly flagged as a carry-forward. This prevents a stale
        // remote snapshot from clobbering local edits on non-current week offsets.
        // The localHasNoStackTodos exception keeps that protection (it is false the
        // moment any local stack/todos exists) while still hydrating an empty cache.
        const allowTodosStack =
          rowIsCurrentWeek || !!row.__carried_forward || localHasNoStackTodos;

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

        // Restore timer if found, more recent, and not stale
        if (row.active_timer) {
          const localT = loadTimer();
          if (!localT || (row.updated_at && new Date(row.updated_at) > new Date(localT.__synced_at || 0))) {
            const remoteT = row.active_timer;
            if (remoteT && remoteT.cat && remoteT.startTime &&
                Date.now() - remoteT.startTime <= _MAX_TIMER_AGE_MS) {
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
          if (remoteT && remoteT.cat && remoteT.startTime &&
              Date.now() - remoteT.startTime <= _MAX_TIMER_AGE_MS) {
            remoteT.__synced_at = prof.updated_at;
            localStorage.setItem('wt_timer', JSON.stringify(remoteT));
          }
        }
      }
    } catch(e) { console.warn('[load] global timer skip:', e.message); }

    // Cat archive - LOAD THIS BEFORE CATEGORIES SO FILTERING IS ACCURATE
    try {
      const { data: arch } = await sb
        .from('cat_archive')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (arch && arch.archive) {
        const localArch = loadCatArchive();
        const merged = { ...arch.archive };
        Object.keys(localArch).forEach(k => {
          if (k.endsWith('_deleted') && !merged[k]) {
            merged[k] = localArch[k];
          }
        });
        localStorage.setItem('wt_cat_archive', JSON.stringify(merged));
        const localOnlyDeleted = Object.keys(localArch).filter(k => k.endsWith('_deleted') && !arch.archive[k]);
        if (localOnlyDeleted.length > 0) {
          _syncCatArchive(merged);
        }
      }
    } catch(e) { console.warn('[load] cat_archive skip:', e.message); }

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
      const arch = loadCatArchive();
      const archDeletedLower = new Set(
        Object.keys(arch).filter(k => k.endsWith('_deleted')).map(k => k.toLowerCase())
      );
      const _deletedSet = new Set(getDeletedCats().map(n => n.toLowerCase()));
      const mapped = cats
        .filter(c => !c.deleted_at && !_deletedSet.has(c.name.toLowerCase()) && !archDeletedLower.has((c.name + '_deleted').toLowerCase()))
        .map(c => ({ 
          name: c.name, 
          color: c.color,
          hidden: !!hiddenMap[c.name]
        }));
      
      // DEFENSIVE: Never overwrite local categories with a significantly smaller list 
      // from cloud unless the cloud data is explicitly newer or the local list is empty/default.
      if (mapped.length >= localCats.length || localCats.length <= 6) {
        saveCats(mapped);
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
    // Cancel any habits push queued by the optimistic pre-load render — it
    // captured the (default) local state from before this cloud load.
    if (_syncQueue['habits']) { clearTimeout(_syncQueue['habits']); _syncQueue['habits'] = null; }

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

    // Cloud load for this session is complete — habits pushes are now safe.
    _remoteHydrated = true;

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
  // If there's a pending local write, don't let a stale remote fetch overwrite it.
  // The pending timer will push the local state to Supabase shortly.
  if (_syncQueue['cats']) return;
  const user = getCurrentUser();
  if (!user) return;
  const { data: cats } = await sb.from('categories').select('*').eq('user_id', user.id).order('position');
  if (cats) {
    const localCats = JSON.parse(localStorage.getItem('wt_categories') || '[]');
    const hiddenMap = {};
    localCats.forEach(c => { if (c.hidden) hiddenMap[c.name] = true; });
    const arch = loadCatArchive();
    const archDeletedLower = new Set(
      Object.keys(arch).filter(k => k.endsWith('_deleted')).map(k => k.toLowerCase())
    );
    const _deletedSet = new Set(getDeletedCats().map(n => n.toLowerCase()));

    const mapped = cats
      .filter(c => !c.deleted_at && !_deletedSet.has(c.name.toLowerCase()) && !archDeletedLower.has((c.name + '_deleted').toLowerCase()))
      .map(c => ({
        name: c.name,
        color: c.color,
        hidden: !!hiddenMap[c.name]
      }));
    const mappedStr = JSON.stringify(mapped);
    if (localStorage.getItem('wt_categories') !== mappedStr) {
      localStorage.setItem('wt_categories', mappedStr);
      repairCategories();
      document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'categories' } }));
    }
  }
}

async function handleRemoteHabitsChange() {
  const user = getCurrentUser();
  if (!user) return;
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
    const archDeletedLower = new Set(
      Object.keys(row.archive)
        .filter(k => k.endsWith('_deleted'))
        .map(k => k.toLowerCase())
    );
    const _deletedSet = new Set(getDeletedCats().map(n => n.toLowerCase()));
    const cats = loadCats();
    const filtered = cats.filter(
      c => !_deletedSet.has(c.name.toLowerCase()) &&
           !archDeletedLower.has((c.name + '_deleted').toLowerCase())
    );
    if (filtered.length !== cats.length) {
      saveCats(filtered);
    }
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'archive' } }));
  }
}

function handleRemoteProfileChange(row) {
  if (!row) return;
  const localT = loadTimer();
  const remoteIsNewer = row.updated_at && new Date(row.updated_at) > new Date((localT && localT.__synced_at) || 0);

  if (row.active_timer) {
    // Remote has a timer — restore it if newer and not stale
    if (!localT || remoteIsNewer) {
      const remoteT = row.active_timer;
      if (remoteT && remoteT.cat && remoteT.startTime &&
          Date.now() - remoteT.startTime <= _MAX_TIMER_AGE_MS) {
        remoteT.__synced_at = row.updated_at;
        localStorage.setItem('wt_timer', JSON.stringify(remoteT));
        document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'timer' } }));
      }
    }
  } else if (localT && remoteIsNewer) {
    // Remote cleared the timer — honour that and clear locally too
    localStorage.removeItem('wt_timer');
    document.dispatchEvent(new CustomEvent('wt:remote-change', { detail: { type: 'timer' } }));
  }
}

// ── Unique Task ID Utilities & Migration ─────────────────────────────────────
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'u_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function migrateTasksWithIds() {
  let migratedWeeksCount = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('wt_wk_')) continue;
    try {
      const r = localStorage.getItem(k);
      if (!r) continue;
      const d = JSON.parse(r);
      let changed = false;
      if (d && d.todos) {
        Object.keys(d.todos).forEach(cat => {
          if (Array.isArray(d.todos[cat])) {
            d.todos[cat].forEach(t => {
              if (t && typeof t === 'object' && !t.id) {
                t.id = generateUUID();
                changed = true;
              }
            });
          }
        });
      }
      if (changed) {
        localStorage.setItem(k, JSON.stringify(d));
        migratedWeeksCount++;
      }
    } catch (e) {
      console.warn('[migration] migrateTasksWithIds fail on key:', k, e.message);
    }
  }
  
  // Migrate backlog
  try {
    const r = localStorage.getItem('wt_backlog');
    if (r) {
      const b = JSON.parse(r);
      let changed = false;
      if (b && Array.isArray(b.items)) {
        b.items.forEach(item => {
          if (Array.isArray(item.tasks)) {
            item.tasks.forEach(t => {
              if (t && typeof t === 'object' && !t.id) {
                t.id = generateUUID();
                changed = true;
              }
            });
          }
        });
      }
      if (changed) {
        localStorage.setItem('wt_backlog', JSON.stringify(b));
        console.log('[migration] Migrated backlog tasks with IDs.');
      }
    }
  } catch (e) {
    console.warn('[migration] migrateTasksWithIds fail on backlog:', e.message);
  }

  if (migratedWeeksCount > 0) {
    console.log(`[migration] Migrated ${migratedWeeksCount} weeks of tasks with unique IDs.`);
  }
}

