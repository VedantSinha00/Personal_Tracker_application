// ── weekState.js ──────────────────────────────────────────────────────────────
// Owns the current week identity and notifies the app when the week rolls over.
//
// getMon() returns a Date object whose time component varies with call time.
// All comparisons and storage use getMon(0).toDateString() — a plain string
// (e.g. "Mon Apr 13 2026") — so === is stable and the localStorage round-trip
// (string → setItem → getItem → string) preserves the type exactly.
//
// _lastKnownMonday persists across sessions via localStorage (wt_last_monday).
// wt:week-changed fires exactly once per genuine calendar rollover, never on
// a plain page reload when the Monday date is unchanged.

import { getMon } from './dailylog.js';

// ── Private state ─────────────────────────────────────────────────────────────

// The current Monday as seen this session.
let _currentWeek = getMon(0).toDateString();

// Change 1: read the last persisted Monday before checkForWeekChange() runs.
// Stored as a plain toDateString() string — no JSON.parse needed.
// Null when the key is absent (first ever load) or localStorage is unavailable.
let _lastKnownMonday = null;
try {
  const stored = localStorage.getItem('wt_last_monday');
  if (stored) _lastKnownMonday = stored;
} catch(e) {
  // localStorage unavailable (e.g. private-browsing restriction) — stay null.
}

// ── Named exports ─────────────────────────────────────────────────────────────

/** Returns the current week's Monday as a toDateString() string. */
export function getCurrentWeek() {
  return _currentWeek;
}

/**
 * Returns true if weekNumber strictly equals the stored current week string.
 * Callers should pass a value produced by getMon(0).toDateString() or
 * getCurrentWeek() to guarantee the types align.
 */
export function isCurrentWeek(weekNumber) {
  return weekNumber === _currentWeek;
}

/**
 * Change 2 — Compares today's Monday against _lastKnownMonday (the value
 * persisted from the last session). If they are strictly equal, does nothing —
 * no event, no write, no log. If they differ (including the null first-run
 * case), executes in this exact order:
 *   1. Dispatch wt:week-changed (listener still sees old _lastKnownMonday)
 *   2. Write the new Monday to localStorage under wt_last_monday
 *   3. Update _lastKnownMonday and _currentWeek in memory
 *
 * Because _lastKnownMonday is updated at step 3, repeated calls within the
 * same page load will hit the early-return at step 0 and never re-dispatch.
 */
export function checkForWeekChange() {
  const currentWeek = getMon(0).toDateString();
  if (currentWeek === _lastKnownMonday) return; // unchanged — no-op

  const previousWeek = _lastKnownMonday;

  // 1. Dispatch first — listeners that read _lastKnownMonday during the event
  //    still see the old value (it has not been updated yet).
  window.dispatchEvent(new CustomEvent('wt:week-changed', {
    detail: { previousWeek, currentWeek },
  }));

  // 2. Persist immediately after dispatch, in the same synchronous block.
  try {
    localStorage.setItem('wt_last_monday', currentWeek);
  } catch(e) {
    // Persist failure is non-fatal; in-memory state is still updated below.
  }

  // 3. Update in-memory variables last.
  _currentWeek     = currentWeek;
  _lastKnownMonday = currentWeek;
}

// ── Run once on module load ───────────────────────────────────────────────────
// checkForWeekChange() is called by app.js after the initial data load and
// first render complete, ensuring the wt:week-changed listener is ready and
// _dataLoaded is true before any event is dispatched.
