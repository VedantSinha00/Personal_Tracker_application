# Floating Stopwatch & Ghost Logs Feature Implementation Plan

We will add a floating (picture-in-picture) stopwatch window to the Electron application, implement "Ghost Logs" (future planned sessions), add custom task check/drop status cycling, add week-specific exporting, and display last week's adjustment focus on the Overview.

---

## User Review Required

> [!IMPORTANT]
> **Floating Window**: Minimizes the main app and stays on top. Draggable via `-webkit-app-region: drag` (buttons are excluded). Closing the window stops and triggers logging.
> **Ghost Logs**: Render as planned sessions at the bottom of the day cards.
> - **Visuals**: Dashed border with a pure CSS "marching ants" animation, faded/greyish category-color background, and slight scale on hover.
> - **Overdue/Unscheduled Box**: Placed in the empty 8th slot of the Weekly Log grid.
> - **Sticky Banner**: Displayed in the Overview tab directly above the "FOCUS AREAS" section.
> - **Drop Restriction**: Dragging a ghost log to a past day is disabled.
> - **Creation Switch**: A toggle/switch inside the "Log block" modal (`#modal`) allows switching between "Log Completed Session" and "Plan Session (Ghost Log)".
>   - *Visibility*: This switch is only visible when the modal is opened from the Weekly Log tab/view (to keep Overview focused on today's execution).
>   - *Plan Session Mode*: Shows Category, Intent, Day dropdown, and To-Do dropdown (optional). Hides Duration, Focus Quality, Notes, Time slots, etc. Saves directly as a ghost log on the target day.
> - **Ghost Logs in Task List**: When logging a manual entry (without stopwatch) and selecting a category, any active ghost logs (planned sessions) of that category show up in the "Relevant tasks" list with a distinct background color tint.
>   - Checking/selecting a ghost log in this list pre-fills the intent field and, when saved, converts/completes that ghost log.
> - **End-of-week Rollover**: Automatically converts remaining ghost logs from the past week into To-Dos (active if < 5 items, backlog if >= 5). **If the ghost block was linked to an existing To-Do, rollover will NOT create a new task.**
> - **Click Popup**: If a ghost block is already linked to a To-Do, the "Save as to-do" option is hidden in the action popup.
>
> **Task Status Cycle**: Clicking a task checkbox cycles: Unchecked (Active) -> Checked (Completed) -> Cross (Dropped) -> Unchecked (Active).
> - Dropped tasks are styled with a grey cross `✕` in the checkbox and line-through text. They are excluded from weekly stats.
>
> **Specific Week Export**: A dropdown in Account Settings lets the user select any week with data and export just that week's data.
>
> **Weekly Adjustment on Overview**: If the previous week (`wk - 1`) had a "One thing to adjust" filled in during Sunday review, it is displayed as a read-only card directly under "Today's Log" on the Overview tab to act as a reminder.

---

## Proposed Changes

### 1. Data Schema & Storage

#### [MODIFY] [js/constants.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/constants.js)
- Add `GhostBlock` and task properties:
  ```javascript
  /**
   * @typedef {Object} LinkedTaskRef
   * @property {string} cat
   * @property {string} id   - stable task UUID (NOT an array index — see Required Fix #2)
   */
  
  /**
   * @typedef {Object} GhostBlock
   * @property {string} id
   * @property {string} category
   * @property {string} intent
   * @property {number|null} dayIndex
   * @property {LinkedTaskRef} [linkedTask]
   */
  
  /**
   * @typedef {Object} Task
   * @property {string}  id
   * @property {string}  text
   * @property {boolean} done
   * @property {boolean} [dropped]    - True if task was cancelled/dropped
   * @property {boolean} [deleted]
   */
  ```

#### [MODIFY] [js/storage.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js)
- Update `def()` to initialize `ghosts: []`.
- Update `migrateData(d)` to ensure `d.ghosts = d.ghosts || []`.
- Add week-specific export helper `exportSingleWeek(absOffset)` that returns an **enriched, read-only JSON string** for one week — see Required Fix #9 (RESOLVED) for the agreed scope. This is *separate* from `exportD()` (the full backup), which is left untouched for disaster recovery. It is NOT re-importable: it resolves offsets→dates, `dayIndex`→day name, habit-ids→names, and task flags→status, and bundles category/habit/backlog context so an AI can interpret one week in isolation.

```javascript
// Read-only, AI-friendly single-week extract. Returns a JSON string or null if
// the week has no data. NOT consumed by importD() — recovery is exportD()'s job.
export function exportSingleWeek(absOffset) {
  const raw = localStorage.getItem('wt_wk_' + absOffset);
  if (!raw) return null;
  const w = migrateData(JSON.parse(raw)); // ensure ghosts/habits shape is normalised

  const mon = getMonFromAbs(absOffset);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const iso = d => d.toISOString().slice(0, 10);

  const cats   = loadCats();                                   // [{name,color}]
  const colour = name => (cats.find(c => c.name === name) || {}).color || null;
  const focus  = (() => { try { return JSON.parse(localStorage.getItem('wt_focus_' + absOffset)) || {}; } catch { return {}; } })();
  const habits = loadHabits();                                 // [{id,name,target}]
  const habitName = id => (habits.find(h => h.id === id) || {}).name || id;

  const taskStatus = t => t.dropped ? 'dropped' : (t.done ? 'done' : 'active');

  // Focus areas — one entry per category that has a stack objective or any task.
  const todos = w.todos || {}, stack = w.stack || {};
  const focusAreas = cats
    .filter(c => (stack[c.name] && stack[c.name].trim()) || (todos[c.name] && todos[c.name].length))
    .map(c => ({
      category:  c.name,
      colour:    colour(c.name),
      level:     focus[c.name] || 'high',
      objective: stack[c.name] || '',
      tasks: (todos[c.name] || [])
        .filter(t => !t.deleted)
        .map(t => ({ task: t.text, status: taskStatus(t) })),
    }));

  const days = (w.days || []).map((day, i) => ({
    day:      FULL[i],
    date:     fmt(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)),
    mvd:      !!day.mvd,
    fullRest: !!day.fullRest,
    blocks:   (day.blocks || []).map(b => ({
      category: b.category, duration: b.duration || '', slot: b.slot || '',
      intent: b.intent || '', focusQuality: b.focusQuality || b.energy || null,
      notes: b.notes || '',
    })),
    habits:   Object.keys(day.habits || {}).filter(id => day.habits[id]).map(habitName),
    journal:  day.journal || '',
  }));

  const ghosts = (w.ghosts || []).map(g => ({
    category: g.category, intent: g.intent,
    day: (g.dayIndex === null || g.dayIndex === undefined) ? 'Unscheduled' : FULL[g.dayIndex],
    linkedToTask: g.linkedTask ? (todos[g.linkedTask.cat] || []).find(t => t.id === g.linkedTask.id)?.text || null : null,
  }));

  return JSON.stringify({
    week:      `${fmt(mon)} – ${fmt(sun)}`,
    weekStart: iso(mon),
    weekEnd:   iso(sun),
    intention: w.intention || '',
    focus:     focusAreas,
    days,
    ghosts,
    review:    w.review || { worked: '', didnt: '', adjust: '' },
    // Global context so the week is interpretable on its own:
    context: {
      categories: cats.map(c => ({ name: c.name, colour: c.color })),
      habits:     habits.map(h => ({ name: h.name, target: h.target })),
      backlog:    (loadBacklog().items || []),
    },
  }, null, 2);
}
```
> Note: `getMonFromAbs`, `loadCats`, `loadHabits`, and `loadBacklog` already exist in `storage.js`; `FULL` is imported from `constants.js` (add it to the existing import). Colours are taken from the stored category def as-is; if legacy colour names ever need normalising, wrap with `resolveHex` from `colours.js`.

---

### 2. Electron Process & Floating Stopwatch

#### [MODIFY] [main.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/main.js)
- Manage `pipWindow` lifecycle, bounds, and persistence using a JSON config file (`pip-window-state.json`).
- Implement IPC handlers: `pop-out-stopwatch`, `pip-ready`, `pip-action`.
- Restore the main window and trigger a `stop` action if the pip window is closed.

#### [MODIFY] [preload.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/preload.js)
- Expose Electron APIs to the renderer: `popOutStopwatch`, `onPipAction`, `sendPipState`, `onReceiveState`, `sendPipAction`, `closePip`.

#### [NEW] [pip.html](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/pip.html)
- A lightweight, frameless, transparent window for the floating stopwatch.
- Displays the active category and elapsed time with Pause/Resume, Stop, and Return buttons.

---

### 3. UI, Account Settings & Task Cycling

#### [MODIFY] [index.html](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/index.html)
- Add a "Pop Out" button to the header stopwatch banner (`#stopwatchIndicator`).
- In Account Settings modal (`#accountModal`), add:
  - Dropdown `#exportWeekSelect`
  - Button `#exportSingleWeekBtn` (calls export for selected week)
- In the "Log block" modal (`#modal`), add:
  - A modal type toggle switch at the top (Log Completed Session vs. Plan Session).
  - A Day selection dropdown `#fDaySelect` (visible only in Plan Session mode, defaults to the day clicked).
  - Support in the "Relevant tasks" container `#fLinkedTasks` to render both standard To-Do tasks and active ghost logs.
- Create a dedicated modal overlay for the **Ghost Log Action Popup** (`#ghostLogPopup`).

#### [MODIFY] [js/account.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/account.js)
- In `openAccountModal()` (so it refreshes each open), scan `localStorage` for `wt_wk_*` keys, parse the integer offset from each, and build a sorted (newest-first) list. Skip empty weeks (no blocks/stack/todos).
- Populate `#exportWeekSelect` with each week's date range via `getMonFromAbs(offset)` (e.g. "14 – 20 Apr 2026"); store the raw offset in the `<option value>`.
- Wire `#exportSingleWeekBtn` to call `exportSingleWeek(offset)` and **trigger the file download itself** — the enriched output is read-only and does NOT go through `importD`, so it can't reuse `exportD()`'s flow blindly. Build the Blob/anchor here:
  ```javascript
  import { exportSingleWeek, getMonFromAbs } from './storage.js';
  // …
  const offset = +document.getElementById('exportWeekSelect').value;
  const json = exportSingleWeek(offset);
  if (!json) { showBanner('That week has no data to export.'); return; }
  const mon = getMonFromAbs(offset).toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `tracker_week_${mon}.json`;
  a.click();
  ```
- Note: `account.js` currently imports from `./auth.js`; add a second import line from `./storage.js` for `exportSingleWeek`/`getMonFromAbs` (don't merge — they're different modules).

#### [MODIFY] [js/stack.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js)
- Render custom checkboxes `.task-checkbox` instead of native ones to support unchecked (active), checked (completed), and crossed-out (dropped) visuals.
- Implement cycling on click:
  - If unchecked: set `done = true`, `dropped = false`.
  - If checked: set `done = false`, `dropped = true`.
  - If dropped: set `done = false`, `dropped = false`.
- Update `carryForward()` to automatically process uncompleted ghost blocks of the past week (skipping those already linked to To-Dos).

#### [MODIFY] [js/dailylog.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/dailylog.js)
- Add modal type toggle switch logic to `openM` (accepting a parameter or checking the active tab context) to show/hide the toggle switch itself, and to hide/show duration, time slots, energy, notes, and show day selection based on the selected mode.
- Update `_renderLinkedTasks` to fetch and display the category's active ghost logs in addition to To-Do tasks. Style ghost logs with a distinct CSS class (e.g. `.linked-ghost-item`).
- Update `saveBlock` to:
  - If in Plan Session mode: save a new ghost block into `d.ghosts` with selected day, category, intent, and linked To-Do.
  - If a ghost log was selected from the list when saving a completed session: pre-fill details, auto-complete the linked To-Do, and delete/convert the selected ghost log from `d.ghosts`.
- Render ghost blocks in day cards below completed blocks.
- Wire up the Ghost Log Action Popup (hide "Save as to-do" if already linked).

#### [MODIFY] [js/app.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/app.js)
- Handle "Pop Out" click event and listen for `onPipAction`.
- Register click handler for `#ghostLogPopup` buttons.
- Adapt task checkbox change listeners to support the custom cycle.

#### [MODIFY] [js/timer.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/timer.js)
- Add a "Pop Out" button to `renderActiveTimerCard`.

---

### 4. Overview Panel & Visual Adjustments

#### [MODIFY] [css/styles.css](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/css/styles.css)
- Implement `.ghost-block` styling (marching ants animation, faded background, hover scale).
- Add styling for the modal type toggle switch (e.g., segmented control style).
- Add styling for ghost logs in the relevant tasks list (e.g., `.linked-ghost-item` with a distinct background color tint and border).
- Add styles for custom `.task-checkbox`:
  - `appearance: none` for styling control.
  - Active: blank border.
  - Completed: checked with white tick `✓` on theme color.
  - Dropped: grey border and cross `✕`.
  - Strikethrough and dimming styles for `.task-text.dropped`.
- Style the Weekly Adjustment Card `.lp-adjustment-card`.

#### [MODIFY] [js/overview.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/overview.js)
- Load the previous week's data (`wk - 1`).
- If `review.adjust` has content, render a card `#ovAdjustmentCard` directly below "Today's Log" card.
- Render the "Sticky Banner" for overdue/unscheduled ghost blocks directly above the "FOCUS AREAS" section in the right column.

---

### 5. Rollover & Expiry Logic

#### [MODIFY] [js/stack.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js)
- Update `carryForward()` to automatically process uncompleted ghost blocks of the past week:
  - **Skip rollover conversion if the ghost block is already linked to a To-Do (`linkedTask` is present).**
  - Otherwise:
    - If category pending To-Dos < 5: add to active list.
    - Else: push to category Backlog.
  - Remove ghost logs from the previous week's record.

---

## Verification Plan

### Automated/Manual Verification
1. **Stopwatch Pop Out**:
   - Start stopwatch, click "Pop Out". Verify main window minimizes, floating window ticks.
   - Click "Stop" in floating window. Main window restores, and "Log block" modal opens.
2. **Ghost Log Creation & To-Do Link**:
   - Click "Add entry +" on a day card. Toggle the modal switch to "Plan Session".
   - Select a Category, select a To-Do. Verify intent pre-fills. Save.
   - Verify ghost block renders with marching ants border animation at the bottom of the day's blocks.
   - Click "Add entry +" again on that day. Select the same Category.
   - Verify the newly created ghost log appears in the "Relevant tasks" list with a distinct background tint.
   - Check/select the ghost log from the list. Verify the intent pre-fills. Save.
   - Verify the ghost block has disappeared from the day's blocks, and a completed block with its intent has been added.
3. **Task Status Check/Drop Cycle**:
   - Click a task checkbox on the Stack tab. Verify it ticks (Completed).
   - Click it again. Verify it shows a cross `✕` and text strikes through (Dropped).
   - Click it again. Verify it returns to blank (Active).
4. **Week Specific Export** (enriched, read-only — see Fix #9):
   - Open Account Settings. Verify `#exportWeekSelect` lists every week that has data, labelled by date range, newest first.
   - Select a week and click export. Verify a file `tracker_week_<date>.json` downloads.
   - Open it and verify it is **human/AI-readable**: a `week` date-range string, `intention`, a `focus` array (category, colour, level, objective, tasks with `status` of done/dropped/active), a `days` array (day name + date, blocks, habit *names*, journal), `ghosts`, `review`, and a `context` block holding category defs, habit defs, and the backlog.
   - Confirm there are NO raw keys like `wt_wk_5`, no numeric offsets, and no habit-id maps — and that importing this file via the normal Import button is NOT expected to work (it's read-only by design).
5. **Adjustment Card on Overview**:
   - In week 0, write an adjustment focus in the Review tab.
   - Navigate to week 1, go to the Overview tab. Verify a card containing that adjustment text displays below "Today's Log".

---

## Settled Design Decisions (review outcome — supersedes conflicting text above)

> Worked out during plan review; this is now the authoritative design. Where it conflicts with the Proposed Changes (§1–§5) or a Required Fix below, **these decisions win.** Several Required Fixes collapse as a result (marked inline).

### D1 — Unified block model: ghosts ARE blocks (no separate `d.ghosts`)
A ghost is a normal entry in `day.blocks` carrying `isGhost: true` (plus `intent`, and optional `linkedTask: {cat, id}`), **not** a separate week-level `d.ghosts` list. Consequences:
- **Fix #1 collapses.** `day.blocks` lives inside `days`, which is already on every sync allow-list and already round-trips as one blob. A new field inside a block rides that proven path automatically — **no new Supabase column, no four-call-site edit, no `_syncWeekFocusOrder` wipe risk.** The `ghosts jsonb` column already added is now **vestigial** (harmless — drop later if you want tidiness).
- **Fix #5 collapses.** Drag works through the existing `day.blocks` splice-and-reinsert with no second drag system. Only addition: in the drop handler, reject a drop onto a past day when `moved.isGhost`.
- `constants.js`: drop the standalone `GhostBlock` typedef; instead extend `Block` with `isGhost?: boolean` and `linkedTask?: {cat, id}` (`intent` already exists). `LinkedTaskRef` stays `{cat, id}` (Fix #2).
- `migrateData`: no migration needed — a block with no `isGhost` is just a normal block.
- **Fix #6 updates:** selecting a ghost in "Relevant tasks" means finding the **ghost block** and flipping `isGhost` off (+ merging the logged details), not a `d.ghosts` lookup.

### D2 — New cost this introduces: analytics MUST skip ghost blocks
Because ghosts now sit inside `day.blocks`, every analytic pass must exclude them or planned time gets counted as logged time. Add ONE helper — `realBlocks(day) => (day.blocks || []).filter(b => !b.isGhost)` — and route every hours/duration/category/MVD computation in `insights.js`, `review.js`, and any `day.blocks` reduce through it. This is the inverse of the old separate-list model's free pass: one mechanical rule, applied centrally.

### D3 — Lifecycle
- **Every ghost has a day** (Plan Session's day dropdown always picks one). No dateless / "someday" bucket.
- **Overdue is derived at render, not stored** — a ghost whose day index < `todayI()` (current week only; meaningless in past/future week views). Surfaced in two places: restyled on its own day card, and aggregated into an Overview "overdue" box.
- **Completion lands on the actual day (today) — one rule.** Completing a ghost by any path (logging a session and ticking it, or opening it directly) produces a real logged block on the day you complete it and removes the ghost, so the record reflects when work actually happened. (Edge: completing while viewing a past week lands the block in the current week — consistent with the rule.)

### D4 — Rollover / gap recovery: unified `carryForward` scan-back
Replace the strict `wk-1` source read in `carryForward()` with **"scan backwards to the most recent non-empty prior week."** It is a no-op in the normal case (most-recent-non-empty == `wk-1`) and only activates after a multi-week gap, so it never disturbs the common path.
- **Stack:** carry from that single source week — fill the current week's empty fields + copy unfinished, non-dropped tasks. (Single source: merging text from multiple weeks is ambiguous.)
- **Ghosts:** convert every incomplete ghost in that source week into a to-do (active if the category has <5 pending, else backlog; skip if `linkedTask` present), then remove them from the source week. Removing requires writing the source week's key directly + `_perfSyncWeek(sourceAbs, …)` — this is the substance of **Fix #7**.
- **No multi-week "sweep."** Because `carryForward` runs at every week-crossing app-open, each active week's leftovers are cleared at the next open before new ghosts can be created — ghosts can never disperse across multiple past weeks. (Supersedes the earlier "ghost sweep" and "deferred stack follow-up" ideas; folds in Fix #7.)

### D5 — Manual carry button: NOT re-added (stay automatic)
**Decided:** no manual "Carry from last week" button. It was already removed from the UI and won't return — carry-forward (and ghost→to-do conversion) runs automatically on rollover. The leftover `carryBtn` refs in `stack.js` are harmless `if (btn)` no-ops and can be left or cleaned up opportunistically.

---

## Required Fixes (Pre-Implementation Audit)

> [!CAUTION]
> The plan above, as written, will **lose ghost-log data** and **re-introduce the index-fragility bug fixed in v1.3.13**. The items below are not optional polish — they are gaps that must be closed in the plan before any code is written. They were found by cross-checking the plan against the actual sync/render pipeline (`storage.js`, `dailylog.js`, `overview.js`, `stack.js`). Each references the exact code that breaks.

### Fix #1 — Carry `ghosts` through the ENTIRE sync pipeline (data-loss; CRITICAL)
> **SUPERSEDED by D1.** The unified block model dissolves this entire fix — ghosts ride `days` and need no column or sync-site edits. The detail below is kept only to explain *why* the separate-`d.ghosts` design was dangerous (and why we abandoned it).

Adding `ghosts` to `def()`/`migrateData()` is not enough. Every place that reads or writes a week to Supabase rebuilds the object field-by-field and currently omits `ghosts`, so ghosts vanish on sync, reload, focus-toggle, or realtime echo. This is the same failure class as the v1.3.8 habits-loss and v1.3.11 carry-forward-poison incidents.

- **[REQUIRES YOUR APPROVAL — schema change]** Add a `ghosts jsonb default '[]'` column to the `weekly_data` table in Supabase. (CLAUDE.md §3: ask before schema changes.)
- `_perfSyncWeek()` payload (`storage.js` ~L618): add `ghosts: d.ghosts || []`.
- `_syncWeekFocusOrder()` payload (`storage.js` ~L648): add `ghosts: d.ghosts || []`. **Without this, every focus toggle / stack reorder silently wipes all ghosts** because it upserts the whole row.
- `loadFromSupabase()` reconstruction (`storage.js` ~L1009): add `ghosts: row.ghosts || []` to the `d` object.
- `handleRemoteWeekChange()` reconstruction (`storage.js` ~L1212): add `ghosts: row.ghosts || []` (mirror the defensive todos-preservation guard).
- Until the column + all four call sites land, ghosts must be treated as **local-only** and the cloud sync feature for them disabled, to avoid a half-migrated state that drops data.
- **Build order (de-risking):** land all four call sites FIRST and prove the round-trip — create a ghost, toggle a focus level, hard-reload, confirm it survives — *before* building any ghost UI. Otherwise a missing ghost is ambiguous (UI bug vs persistence bug). Failure→cause map: vanishes on focus-toggle ⇒ missed `_syncWeekFocusOrder`; on reload ⇒ missed `loadFromSupabase`; on another tab/device edit ⇒ missed `handleRemoteWeekChange`.

### Fix #2 — `LinkedTaskRef` must key on `id`, not `idx` (CRITICAL)
Corrected inline in the typedef above. Indices break on reorder/delete — this is precisely why v1.3.13 migrated tasks to stable UUIDs. All ghost↔task links use `{cat, id}`, resolved via `d.todos[cat].find(t => t.id === id)`, never positional lookup.

### Fix #3 — Handle `dropped` at ALL task render/consumer sites (HIGH)
The plan only updates `stack.js` + `app.js`. Dropped tasks (`done=false, dropped=true`) leak everywhere else:
- **`carryForward()` (`stack.js` L269-303):** the `!t.done && !t.deleted` filter carries dropped tasks forward as *active*. Change both the `sourceHasContent` check and the copy loop to also exclude `t.dropped`.
- **`overview.js` (L66-72 render, L208-226 toggle):** Overview renders task checkboxes and sets `task.done = checked`. It must render the 3-state widget and use the same cycle handler, or dropped state is invisible/destroyed here.
- **`_renderLinkedTasks()` (`dailylog.js` L357-366):** filters only on `t.done`. Exclude `t.dropped` so dropped tasks aren't offered as loggable.
- **Per-category capacity counter (`stack.js` L409):** the "5 missions max" gate counts `d.todos[cat].filter(t => !t.done)`. A dropped task (`done=false`) wrongly eats a slot — change to `!t.done && !t.dropped`. Check `overview.js` for any equivalent count.
- **Stats: VERIFIED non-issue.** Tasks do not feed any metric — `insights.js` only counts blocks/hours/habits (its `.done` is `days.filter(d => d.done)`, habit streaks), and `review.js` has no task counts. So "excluded from weekly stats" needs no work; the capacity counter above is the only real count over tasks.

### Fix #4 — The 3-state cycle cannot use a native checkbox `change` event (HIGH)
Existing handlers (`stack.js` L468-484; `overview.js` L208) are `change` listeners reading `el.checked` (2 states). A native checkbox is binary and its built-in toggle fights a 3-state cycle.
**Decision:** render a `<button class="task-checkbox" role="checkbox" aria-checked="…">` (NOT an `<input>`), styled three ways (active / done = ✓ / dropped = ✕), driven by a single **`click`** handler that advances active→done→dropped→active. Keep `role`/`aria-checked` for accessibility.
- Extract one shared `cycleTaskState(cat, id)` helper in `stack.js` and call it from **both** the Stack `click` listener and the Overview `click` listener, so the two views can never diverge. Remove the old `change`/`tog-task` and `tog-todo` listeners.

### Fix #5 — Ghost pills must NOT collide with the existing block drag-and-drop (HIGH)
> **SUPERSEDED by D1.** With ghosts living inside `day.blocks`, drag works through the existing system; the only addition is a past-day-drop guard for `isGhost` blocks. The collision below was an artifact of the abandoned separate-`d.ghosts` design.

Block DnD is delegated on `#appShell` keyed by `.block-pill` + `data-day`/`data-block` indices into `day.blocks` (`dailylog.js` L470-535). Ghosts live in `d.ghosts` (week-level, keyed by `dayIndex`), not `day.blocks`.
- Give ghost pills a distinct class (e.g. `.ghost-pill`), NOT `block-pill`, and a **separate** drag system, or dragging a ghost will splice the wrong index out of real `day.blocks`.
- `renderDayCard(dayOffset, day, ti, customHabits)` (`dailylog.js` L57) has no `ghosts` access — change the signature to accept the week's ghosts (filtered by `dayIndex`).
- `renderDayCard` is reused by Overview (`overview.js` L102). Decide explicitly whether ghosts show in the Overview "Today's log" card; if not, pass a flag to suppress them there.

### Fix #6 — Selecting a ghost in "Relevant tasks" needs its own path (MEDIUM)
`saveBlock` collects `#fLinkedTasks` checkboxes into `linkedTasks` `{cat,id}` then auto-completes via `d.todos[lt.cat].find(...)` (`dailylog.js` L379-420). A selected *ghost* is in `d.ghosts`, not `d.todos`. Render ghost entries with a `data-ghost-id` attribute and branch in `saveBlock`: pre-fill intent, then convert/delete the ghost (and complete its `linkedTask` if present) — do not push it into the `linkedTasks` array.

### Fix #7 — Removing rolled-over ghosts from last week can't use `save()` (MEDIUM)
`save()` always writes the *current* week's key (`storage.js` L171). `carryForward()` runs on the new current week, so clearing last week's ghosts requires a direct `localStorage.setItem('wt_wk_'+getAbsWk(wk-1), …)` followed by `_perfSyncWeek(getAbsWk(wk-1), prev)` to persist the removal to the cloud.

### Fix #8 — Floating window must tick from `startTime` itself (MEDIUM)
`pip.html` is a separate page and cannot rely on the renderer's `wt_timer` localStorage. The IPC state bridge is correct, but the main window's per-second timer is throttled when minimized (`backgroundThrottling` defaults on). Send the pip the timer *state* (`startTime`, `accumulatedMs`, `isPaused`, `cat`) once and let pip compute elapsed locally each second; or set `backgroundThrottling: false` on the main `BrowserWindow`. Don't stream the formatted time string from a throttled main window.

### Fix #9 — `exportSingleWeek` scope (RESOLVED)
**Decision (user, 2026-06-02):** the single-week export is a **brand-new, enriched, read-only JSON extract** for one week, intended for feeding to an AI to generate a weekly report — NOT a recovery backup and NOT re-importable. The full `exportD()` button stays untouched as the disaster-recovery path.
- **Format:** enriched JSON — offsets→date range, `dayIndex`→day name + date, habit-ids→habit names, task flags→`"done"`/`"dropped"`/`"active"`. (See the rewritten `exportSingleWeek` in §1.)
- **Restore:** not required. The file is read-only; it does not round-trip through `importD`.
- **Context bundled:** category names + colours, habit names + targets, and the global backlog (all under a `context` key), so one week is interpretable in isolation.
- **Download:** `account.js` builds the Blob/anchor itself (filename `tracker_week_<weekStart>.json`); it does NOT reuse `exportD()`'s key-dump flow. Verification step 4 updated to match.

### Fix #10 — `openM` needs a source argument for the Plan-Session toggle (LOW)
The toggle should appear only when the modal is opened from the Weekly Log. `openM` is called from `dailylog.js`, `overview.js` (`openM(ti,'new')`), and `handleTimerStopped`. Add an explicit `source` param (don't infer from `wt_active_tab`, since the Overview "Today" card and Weekly Log share the same `#appShell` delegated `open-block` handler).

---

## Work Remaining (handoff — resume here)

**Status:** design review complete. Decisions are locked in *Settled Design Decisions* (D1–D5); Fixes #2/#3/#4/#9 resolved. Nothing implemented yet. Tackle roughly in this order.

### A. Doc consistency cleanup (do FIRST, before coding — the model pivot left stale text)
- §1 storage: remove "initialize `ghosts: []`" and the `d.ghosts` migration — not needed (ghosts live in `day.blocks`).
- §1 Data Schema: delete the standalone `GhostBlock` typedef; instead extend `Block` with `isGhost?: boolean` and `linkedTask?: {cat, id}`.
- §4/§5 + anywhere referencing `d.ghosts`: replace with `day.blocks.filter(b => b.isGhost)`.
- **`exportSingleWeek` snippet (§1):** rewrite its ghost extraction — currently reads `w.ghosts`/`g.dayIndex`; under D1 it must derive ghosts from each day's `blocks` (isGhost), taking the day name from the day index.

### B. Implementation — settled parts (suggested order)
1. **Data model + analytics filter (D1, D2):** add `isGhost`; introduce `realBlocks(day)` and route ALL hours/duration/MVD/category math in `insights.js` + `review.js` through it. Verify: with no ghosts, every stat is unchanged; adding a ghost changes no hour/stat. ← main correctness risk now.
2. **Task 3-state widget (Fix #2/#3/#4):** shared `cycleTaskState()` button used by Stack + Overview; exclude `dropped` from carry-forward, the capacity counter (`stack.js` L409), and linked-tasks.
3. **Ghost CRUD + lifecycle (D3):** create via Plan Session (always a day); overdue styling (derived at render); ghost click → ghost action popup (NOT edit modal); completion → block moves to today + `isGhost` flips off; drag with past-day-drop guard.
4. **Rollover (D4):** `carryForward` scans back to most-recent-non-empty week; stack fills, ghosts convert→to-do + remove (cross-week write + `_perfSyncWeek`).
5. **Single-week enriched export (Fix #9):** after A reconciles the snippet.
6. **Overview:** adjustment card + overdue box.

### C. Still needs its own review pass (NOT yet problem-checked)
- **Electron floating stopwatch (§2)** — largest unreviewed surface: pip window lifecycle, IPC state sync, close→stop→modal flow while minimized, bounds/multi-monitor, no-timer-running case, ticking (Fix #8 — pip ticks from `startTime` itself).
- Fix #6 ghost-as-linked-task UX; Fix #10 `openM` source param; CSS (marching ants); the modal Plan-Session toggle behaviour.

### D. Housekeeping
- **(You)** drop the vestigial column: `alter table public.weekly_data drop column ghosts;`
- After any code changes, rebuild the graphify code graph (per CLAUDE.md).
