# Personal Tracker — Revised Accountability Update Plan

**Prepared for:** Vedant Sinha  
**Revised:** April 2026  
**Purpose:** Implementation reference document for vibe coding with AI assistance

---

## How to Use This Document

This document is the single source of truth for this update. Each phase is independently shippable — you can stop after any phase and have a working, improved tracker. Implement in phase order. Do not start a new phase until the previous one is tested and stable.

When starting a coding session, tell the AI assistant:
- Which phase you are working on
- Which specific section within that phase
- Share the current versions of the files being changed

All changes are additive. No existing data is broken by any change in this plan.

---

## Part 1: The Problem Being Solved

The tracker currently measures time logged, not work done. A distracted two-hour session and a focused two-hour session look identical in every metric. The system rewards logging, not doing.

The rebuild adds an honest accountability loop:
- You declare what you intend to do before or when starting work (optional but encouraged)
- When you finish, you record which tasks you actually completed
- The gap between intent and completion becomes the most honest productivity signal in the app

Two parallel logging systems are introduced. Both write to the same data structure. Neither replaces the other.

---

## Part 2: Complete Data Model Changes

### 2.1 Updated block schema

**Current block object** (`saveBlock()` in `dailylog.js`):
```js
{ category, duration, energy, notes, slot }
```

**New block object:**
```js
{
  category,        // string — defaults to 'Others' if blank on save
  duration,        // string — e.g. "1h 30m", manually entered or auto-filled by stopwatch
  slot,            // string — time of day, optional
  intent,          // string — optional, declared upfront; max 120 chars
  completionState, // 'done' | 'partial' | 'abandoned' | null — optional
  focusQuality,    // 'high' | 'medium' | 'low' | null — optional
  linkedTasks,     // array of { cat: string, idx: number } — tasks checked off during this block
  notes,           // string — optional freeform context
  source,          // 'manual' | 'stopwatch' — for analytics, set automatically
}
```

**Backwards compatibility:** All new fields default gracefully. Old blocks render without them. No migration is required. `energy` is renamed to `focusQuality` for new blocks only — old blocks with `energy` populated should be read with a fallback: `b.focusQuality || b.energy || null`.

### 2.2 Computed metrics (never stored)

These are calculated on the fly in `review.js` and `insights.js`. Do not store them.

**Weighted hours:**
```js
function focusMultiplier(q) {
  if (q === 'high')   return 1.0;
  if (q === 'medium') return 0.6;
  if (q === 'low')    return 0.3;
  return 0.8; // null fallback — old blocks without focusQuality
}

weightedHours = parseDuration(b.duration) * focusMultiplier(b.focusQuality || b.energy)
```

**Completion rate per category:**
```js
completionRate = (doneBlocks + partialBlocks * 0.5) / totalBlocks
// expressed as a percentage
// blocks with completionState === null are excluded from this calculation
```

**Intent accuracy** (stricter than completion rate — only counts fully done):
```js
intentAccuracy = doneBlocks / blocksWithIntent
// only counts blocks where intent was declared AND completionState is not null
```

### 2.3 Backlog data structure (new, week-agnostic)

The Backlog is persistent across all weeks. It is not part of weekly data.

**localStorage key:** `wt_backlog`

**Structure:**
```js
{
  items: [
    {
      id:       string,   // 'bl_' + Date.now()
      text:     string,   // the task description
      cat:      string,   // category name, or '' for uncategorized
      addedAt:  string,   // ISO timestamp
    }
  ]
}
```

**Storage functions to add to `storage.js`:**
```js
export function loadBacklog() { ... }   // reads wt_backlog, returns { items: [] } if empty
export function saveBacklog(b) { ... }  // writes wt_backlog, triggers _syncBacklog()
async function _syncBacklog(b) { ... }  // upserts to Supabase backlog table
```

**`loadFromSupabase()` addition:** Add a backlog read block at the end of the existing try block, after cat_archive, using the same pattern:
```js
const { data: backlog } = await sb
  .from('backlog')
  .select('*')
  .eq('user_id', user.id)
  .single();

if (backlog && backlog.items) {
  localStorage.setItem('wt_backlog', JSON.stringify({ items: backlog.items }));
}
```

**Supabase table required:** `backlog` with columns `user_id`, `items` (jsonb), `updated_at`. Uses upsert on `user_id`.

### 2.4 Stopwatch in-progress state (new)

Persisted to localStorage so it survives page refresh.

**localStorage key:** `wt_timer_active`

**Structure:**
```js
{
  startTimestamp: number,   // Date.now() at adjusted start (after retroactive offset applied)
  category:       string,
  intent:         string,   // may be empty string if user skipped it
  dayIdx:         number,   // 0-6, always today's index at time of start
  absWk:          number,   // absolute week key at time of start — always wk=0
}
```

This key is written on timer start and deleted on timer stop (after the block is saved).

---

## Part 3: Implementation Phases

---

### Phase 1 — Intent field + block modal restructure + area defaulting

**Highest leverage phase. Touches: `dailylog.js`, `index.html`.**

This phase restructures the block modal and adds the intent field. No new data structures. No stopwatch. No backlog. Just the modal and the day card display.

#### 1.1 Block modal field order (new)

The modal fields in the new order:

1. **AREA** — category selector, same as today. If blank on save, defaults to 'Others' silently — do not block save.
2. **WHAT ARE YOU PLANNING TO WORK ON?** — new intent textarea. Optional. 120-char limit with a live character counter below it (e.g. "43 / 120"). Placeholder: `"e.g. Finish the login flow refactor"`. Shown above slot and duration.
3. **TIME OF DAY** — slot selector, same as today.
4. **DURATION** — chips + text input, same as today.
5. **FOCUS QUALITY** — renamed from ENERGY. Same three options: Low / Medium / High. Optional. Never blocks save. Read old `energy` field as fallback when displaying existing blocks.
6. **LINKED TASKS** — new section. Appears only when the selected category has items in `d.todos[category]`. Shows as a checklist of that category's tasks. User can check off tasks they plan to work on (pre-work) or did work on (post-work). Also includes a small inline input to add a new task to that category's Stack list directly from this modal — pressing Enter adds it to `d.todos[category]` and immediately shows it as a checked item in this list.
7. **DID YOU FINISH?** — completion state selector. Three options: Done / Partial / Abandoned. Optional. Hidden when `editIdx === null` (new block being opened for the first time). Visible when `editIdx !== null` (editing an existing block). Never blocks save.
8. **NOTES** — retained, optional. Placeholder changed to `"Any extra context?"`.

#### 1.2 Changes to `saveBlock()` in `dailylog.js`

```js
export function saveBlock() {
  let cat = document.getElementById('fCat').value;
  if (!cat) cat = 'Others'; // default silently — no longer blocks save

  const intentEl = document.getElementById('fIntent');
  const intentVal = intentEl ? intentEl.value.trim().slice(0, 120) : '';

  // Collect linked tasks from checkboxes in the modal
  const linkedTasks = [];
  document.querySelectorAll('#fLinkedTasks input[type="checkbox"]:checked').forEach(cb => {
    linkedTasks.push({ cat: cb.dataset.cat, idx: +cb.dataset.idx });
  });

  // Handle inline new task additions (tasks added from the modal input)
  // These are already written to d.todos by the inline add handler before saveBlock runs.

  const block = {
    category:        cat,
    duration:        document.getElementById('fDur').value,
    slot:            selSlot || '',
    intent:          intentVal,
    completionState: selCompletion || null,
    focusQuality:    selE || null,
    linkedTasks,
    notes:           document.getElementById('fNotes').value,
    source:          'manual',
  };

  const d = load();
  if (editIdx !== null) {
    d.days[editDay].blocks[editIdx] = block;
  } else {
    d.days[editDay].blocks.push(block);
  }

  // Auto-check linked tasks that are marked done or partial
  if (block.completionState === 'done' || block.completionState === 'partial') {
    if (!d.todos) d.todos = {};
    linkedTasks.forEach(lt => {
      if (d.todos[lt.cat] && d.todos[lt.cat][lt.idx]) {
        d.todos[lt.cat][lt.idx].done = true;
      }
    });
  }

  save(d);
  closeM();
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}
```

#### 1.3 Changes to `renderDayCard()` in `dailylog.js`

Block pills gain two new visual elements:

**Intent line:** If `b.intent` exists, show it as a second line inside the pill, truncated to ~40 characters with an ellipsis.

**Completion dot:** A small coloured dot at the right edge of the pill.
- Green (`var(--accent)`) = done
- Amber (`var(--amber)`) = partial
- Red (`var(--red)`) = abandoned
- Grey (`var(--text3)`) = null / not logged yet

```js
const intentLine = b.intent
  ? `<div class="block-intent">${b.intent.length > 40 ? b.intent.slice(0, 40) + '…' : b.intent}</div>`
  : '';

const dotColor =
  b.completionState === 'done'      ? 'var(--accent)' :
  b.completionState === 'partial'   ? 'var(--amber)'  :
  b.completionState === 'abandoned' ? 'var(--red)'    :
  'var(--text3)';

const completionDot = `<span class="block-completion-dot" style="background:${dotColor};"></span>`;
```

The pill template becomes:
```js
`<div class="block-pill" style="${catC(b.category)}" ...>
  <div class="block-pill-top">
    ${b.category}${b.duration ? ' · ' + b.duration : ''}${b.slot ? ' · ' + b.slot.replace('-', ' ') : ''}
    ${completionDot}
  </div>
  ${intentLine}
</div>`
```

#### 1.4 CSS additions needed in `styles.css`

```css
.block-pill-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.block-completion-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.block-intent {
  font-size: 11px;
  color: var(--text2);
  margin-top: 3px;
  line-height: 1.3;
  opacity: 0.8;
}
```

#### 1.5 `index.html` modal changes

- Add intent textarea with `id="fIntent"`, `maxlength="120"`, and a sibling `<span id="fIntentCount">0 / 120</span>`
- Rename the ENERGY label to FOCUS QUALITY
- Add the linked tasks section with `id="fLinkedTasks"` — rendered dynamically by JS when category changes
- Add completion state selector with `id="fCompletion"` using same button pattern as focus quality; hidden by default, shown when `editIdx !== null`
- Add a small task input inside the linked tasks section with `id="fNewTask"` for adding tasks inline
- Reorder fields as specified in 1.1

#### 1.6 `openM()` changes

- Populate `fIntent` if editing an existing block
- Show/hide completion state section based on `editIdx`
- When category changes (add a `change` listener on `fCat`), re-render the linked tasks list from `d.todos[selectedCat]`
- Wire the live character counter: `fIntent.addEventListener('input', () => fIntentCount.textContent = fIntent.value.length + ' / 120')`

---

### Phase 2 — Stopwatch system

**Touches: `app.js`, `index.html`, `styles.css`, `storage.js` (timer state only), `dailylog.js`.**

This phase adds the live stopwatch logging system running parallel to manual logging. Manual logging is unchanged.

#### 2.1 Persistent header indicator

Add a timer display element to the app header in `index.html`, between the week navigation and the existing header buttons:

```html
<div id="timerIndicator" style="display:none;">
  <span id="timerCategoryBadge"></span>
  <span id="timerDisplay">0:00</span>
  <button id="timerStopBtn">Stop</button>
</div>
```

This is always visible across all tabs while a block is running. It is hidden when no block is in progress.

#### 2.2 Start flow

Add a "Start block" button to the day card for today only. It appears alongside the existing "+ log block" button. Past day cards do not show this button.

When tapped, a small start modal opens (separate from the main block modal). It contains:

1. **AREA** — category selector
2. **WHAT WILL YOU WORK ON?** — optional intent textarea, 120-char limit
3. **STARTED** — retroactive offset chips: `Now / -5m / -10m / -15m / -30m`. Default: Now. Selecting one sets the effective start time to `Date.now() - offset`.
4. A **Start timer** button

On submit:
```js
const offset = selectedOffsetMs; // 0, 5*60000, 10*60000, etc.
const timerState = {
  startTimestamp: Date.now() - offset,
  category:       selectedCat,
  intent:         intentVal,
  dayIdx:         todayI(),       // always today
  absWk:          getAbsWk(0),    // always current week, regardless of which week user is browsing
};
localStorage.setItem('wt_timer_active', JSON.stringify(timerState));
startTimerDisplay();
```

#### 2.3 Timer display logic

A `setInterval` runs every second while a timer is active, updating `timerDisplay`:

```js
function startTimerDisplay() {
  const state = JSON.parse(localStorage.getItem('wt_timer_active'));
  if (!state) return;

  const indicator = document.getElementById('timerIndicator');
  indicator.style.display = 'flex';

  // Show category badge
  document.getElementById('timerCategoryBadge').textContent = state.category || 'Others';

  // Tick
  const tick = () => {
    const elapsed = Date.now() - state.startTimestamp;
    const hrs  = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('timerDisplay').textContent =
      hrs > 0
        ? `${hrs}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
        : `${mins}:${String(secs).padStart(2,'0')}`;
  };

  tick();
  window._timerInterval = setInterval(tick, 1000);
}
```

On page load, check for `wt_timer_active` and resume the display if found. This handles page refreshes mid-session.

#### 2.4 Long duration warning

When stopping the timer, before opening the close modal, check the elapsed duration:

```js
const elapsed = Date.now() - state.startTimestamp;
const elapsedHours = elapsed / 3600000;

if (elapsedHours > 3) {
  const hrs  = Math.floor(elapsedHours);
  const mins = Math.round((elapsedHours - hrs) * 60);
  const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  // Show non-blocking confirmation inside the modal header:
  // "This block ran for [label] — does that look right?"
  // User can edit duration freely. This is informational only, not a blocker.
}
```

#### 2.5 Stop flow

When the stop button is tapped:

1. Calculate elapsed duration from `startTimestamp` to `Date.now()`
2. Format as duration string (e.g. `"1h 23m"`)
3. Open the main block modal in "close mode" (`editIdx = null` but with stopwatch data pre-filled):
   - AREA pre-filled from `state.category`, locked (greyed out, not editable — category was chosen at start)
   - DURATION pre-filled from elapsed time, editable
   - INTENT shown as a read-only display at the top if it was declared (not editable on close — it was the commitment)
   - SLOT: selectable as normal
   - FOCUS QUALITY: optional selector
   - LINKED TASKS: same task checklist from Phase 1, for the pre-filled category
   - DID YOU FINISH?: visible (this is the close modal)
   - NOTES: optional
4. On save, write block with `source: 'stopwatch'`
5. Delete `wt_timer_active` from localStorage
6. Clear the interval and hide the timer indicator

The block is written to `d.days[state.dayIdx]` of the week at `state.absWk`, regardless of which week the user is currently browsing. This is critical — the stopwatch always belongs to today in the current week.

#### 2.6 Edge case: user is browsing a past week when timer is running

The timer indicator in the header remains visible and functional regardless of which week/tab the user is on. Stopping the timer always saves to today's slot in the current week. The UI should make this clear — the category badge in the timer indicator can include a subtle label like "saving to today."

---

### Phase 3 — Review and Insights metric updates

**Touches: `review.js`, `insights.js`.**

This phase surfaces the new metrics from the data collected in Phases 1 and 2. No modal changes. No new UI components except charts.

#### 3.1 Review tab additions (`review.js`)

The existing `rvCoreStats` grid currently shows three cards: WORK BLOCKS / TOTAL HOURS / AVG BLOCK.

Add two new cards to this grid:

**COMPLETION RATE**
```js
// Only counts blocks where completionState is not null
const blocksWithCompletion = allBlocks.filter(b => b.completionState !== null && b.completionState !== undefined);
const completionRate = blocksWithCompletion.length > 0
  ? ((doneBlocks + partialBlocks * 0.5) / blocksWithCompletion.length * 100).toFixed(0) + '%'
  : '—';
```

**WEIGHTED HOURS**
```js
const weightedTotal = allBlocks.reduce((sum, b) => sum + parseDuration(b.duration) * focusMultiplier(b.focusQuality || b.energy), 0);
// Display as e.g. "14.2h"
```

These are added as `rv-stat-card` elements alongside the existing three. The habit achievement bars are unchanged.

#### 3.2 Insights tab additions (`insights.js`)

The existing flat layout is retained. Two new insight sections are added at the end of the `insContent` HTML, before the legend.

**New section 1: Completion Rate by Category**

A horizontal stacked bar chart. One row per category. Each bar shows the proportion of done (teal) / partial (amber) / abandoned (red) blocks for that category. Only categories with at least one block that has a `completionState` are shown.

Below the chart, if any category has a completion rate below 50%, show a plain-language note:
> "Your blocks in [category] have a [X]% completion rate. Consider declaring smaller units of work when logging this area."

**New section 2: Focus Quality Distribution**

Replaces and renames the existing energy distribution. The three `energy-card` divs become `focusQuality-card`. The calculation reads `b.focusQuality || b.energy` for backwards compatibility with old blocks.

**Existing chart rename:** The section label `"Energy Distribution"` becomes `"Focus Quality Distribution"` in the rendered HTML.

---

### Phase 4 — Backlog and Pull System

**Touches: `storage.js`, `stack.js`, `index.html`, `styles.css`. New file: `backlog.js`.**

This phase adds the persistent Backlog as an upstream supply layer for the Stack tab's weekly task lists.

#### 4.1 Storage layer (`storage.js`)

Add these functions:

```js
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
  if (!user) return;
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
```

Add to `loadFromSupabase()` after the cat_archive block:
```js
// Backlog
const { data: backlogData } = await sb
  .from('backlog')
  .select('*')
  .eq('user_id', user.id)
  .single();

if (backlogData && backlogData.items) {
  localStorage.setItem('wt_backlog', JSON.stringify({ items: backlogData.items }));
}
```

Add to `clearUserCache()` — `wt_backlog` starts with `wt_` so it is already cleared by the existing loop. No change needed.

Add to `exportD()` / `importD()` — same reason, already handled by the `wt_` prefix loops.

**Supabase table to create:**
```sql
create table backlog (
  user_id    uuid references auth.users primary key,
  items      jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table backlog enable row level security;
create policy "Users can manage their own backlog"
  on backlog for all using (auth.uid() = user_id);
```

#### 4.2 New file: `backlog.js`

This module owns the Backlog modal entirely. It follows the same pattern as `categories.js`.

```js
// ── backlog.js ────────────────────────────────────────────────────────────────
// Owns the Backlog modal:
//   - Rendering items grouped by category
//   - Adding items to the backlog
//   - Pulling items into the current week's Stack todos
//   - Pushing Stack todos back to the backlog ("Send to backlog")
//   - Deleting items permanently

import { loadBacklog, saveBacklog, loadCats, load, save } from './storage.js';
```

**Key functions to implement:**

`openBacklogModal()` — renders the modal and attaches listeners

`renderBacklogList()` — groups items by `cat`, renders each category section with its items. Uncategorized items (empty string cat) render last under an "Uncategorized" heading.

`addBacklogItem(text, cat)` — creates a new item with `id: 'bl_' + Date.now()`, pushes to backlog, saves, re-renders.

`pullToThisWeek(itemId)` — 
```js
function pullToThisWeek(itemId) {
  const backlog = loadBacklog();
  const item = backlog.items.find(i => i.id === itemId);
  if (!item) return;

  // Move item out of backlog
  backlog.items = backlog.items.filter(i => i.id !== itemId);
  saveBacklog(backlog);

  // Add to this week's todos for the item's category
  const d = load();
  if (!d.todos) d.todos = {};
  const cat = item.cat || 'Others';
  if (!d.todos[cat]) d.todos[cat] = [];
  d.todos[cat].push({ text: item.text, done: false, fromBacklog: true });
  save(d);

  // Notify so Stack and Overview re-render
  document.dispatchEvent(new CustomEvent('wt:stack-saved'));
  renderBacklogList();
}
```

`sendToBacklog(cat, taskIdx)` — inverse of pull, called from Stack tab:
```js
function sendToBacklog(cat, taskIdx) {
  const d = load();
  if (!d.todos || !d.todos[cat] || !d.todos[cat][taskIdx]) return;

  const task = d.todos[cat][taskIdx];

  // Remove from this week's todos
  d.todos[cat].splice(taskIdx, 1);
  save(d);

  // Add to backlog
  const backlog = loadBacklog();
  backlog.items.push({
    id:      'bl_' + Date.now(),
    text:    task.text,
    cat,
    addedAt: new Date().toISOString(),
  });
  saveBacklog(backlog);

  document.dispatchEvent(new CustomEvent('wt:stack-saved'));
}
```

`deleteBacklogItem(itemId)` — removes permanently from backlog, no confirmation needed (it's a backlog item, not logged data).

`closeBacklogModal()` — closes modal, fires `wt:stack-saved` so Stack re-renders.

#### 4.3 Backlog modal HTML to add to `index.html`

```html
<!-- ── Backlog modal ──────────────────────────────────────────── -->
<div class="overlay" id="backlogModal">
  <div class="modal" style="width:min(520px,94vw);max-height:85vh;">
    <div class="modal-title">Backlog</div>
    <p style="font-size:13px;color:var(--text3);margin-bottom:1.25rem;line-height:1.6;">
      Everything you want to do eventually. Pull items into this week's Stack when you have capacity.
    </p>
    <div id="backlogList"></div>
    <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem;">
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px;letter-spacing:0.3px;">ADD TO BACKLOG</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" id="backlogItemInput" placeholder="What do you want to do eventually?" style="flex:1;">
        <select id="backlogCatSelect"></select>
        <button class="btn btn-p" id="addBacklogItemBtn">Add</button>
      </div>
    </div>
    <div class="mfooter" style="margin-top:1rem;">
      <span></span>
      <button class="btn btn-p" id="closeBacklogBtn">Done</button>
    </div>
  </div>
</div>
```

#### 4.4 Stack tab header changes (`index.html` + `stack.js`)

Add a Backlog button next to the existing "Carry from last week" button in the Stack tab header:

```html
<button class="carry-btn" id="backlogBtn" title="Open your backlog and pull tasks into this week">
  <i data-lucide="inbox" style="width:13px;height:13px;"></i> Backlog
</button>
```

In `stack.js`, add a "Send to backlog" option on each task item. This appears as a small button on hover alongside the existing delete button:

```html
<button class="task-backlog" data-action="send-to-backlog" data-catname="${c.name}" data-idx="${i}" title="Send to backlog">
  <i data-lucide="arrow-left-to-line" style="width:12px;height:12px;"></i>
</button>
```

In `attachStackListeners()`, add a delegated click handler for `send-to-backlog`.

In `initStackListeners()`, wire `backlogBtn` to `openBacklogModal()`.

In `app.js`, import `openBacklogModal`, `closeBacklogModal`, `initBacklogListeners` from `./backlog.js` and call `initBacklogListeners()` inside `initListeners()`.

Add to the `index.html` script tags:
```html
<script type="module" src="js/backlog.js?v=v1"></script>
```

#### 4.5 CSS for backlog items

```css
/* ── BACKLOG MODAL ────────────────────────────────────────────── */
.backlog-cat-section { margin-bottom: 1.25rem; }
.backlog-cat-heading {
  font-size: 11px; color: var(--text3); font-weight: 600;
  letter-spacing: 0.5px; text-transform: uppercase;
  margin-bottom: 6px; font-family: var(--font-heading);
}
.backlog-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  background: var(--surface2); border: 1px solid var(--border);
  margin-bottom: 4px; transition: border-color 0.15s;
}
.backlog-item:hover { border-color: var(--border2); }
.backlog-item-text { flex: 1; font-size: 13px; color: var(--text); }
.backlog-pull-btn {
  font-size: 11px; padding: 3px 9px; border-radius: 10px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text3); cursor: pointer; transition: all 0.15s;
  white-space: nowrap; font-family: var(--font-body);
}
.backlog-pull-btn:hover {
  border-color: var(--accent); color: var(--accent);
  background: var(--accent-bg);
}
.backlog-del-btn {
  background: none; border: none; color: var(--text3);
  font-size: 16px; cursor: pointer; padding: 0 2px;
  transition: color 0.15s; line-height: 1;
}
.backlog-del-btn:hover { color: var(--red); }

/* Send-to-backlog button on Stack task items */
.task-backlog {
  background: none; border: none; padding: 4px; margin: -4px;
  color: var(--text3); cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; opacity: 0;
}
.task-item:hover .task-backlog { opacity: 1; }
.task-backlog:hover { color: var(--blue); background: var(--blue-bg); }
```

---

## Part 4: Event Bus — New Events

No new custom events are required. All new interactions route through existing events:

| Action | Event fired | Modules that re-render |
|---|---|---|
| Block saved with linked tasks auto-checked | `wt:day-changed` | `dailylog.js`, `overview.js`, `review.js` |
| Stopwatch block saved | `wt:day-changed` | same as above |
| Task added from block modal | `wt:stack-saved` | `overview.js` |
| Backlog item pulled to Stack | `wt:stack-saved` | `stack.js`, `overview.js` |
| Stack task sent to Backlog | `wt:stack-saved` | `stack.js`, `overview.js` |

---

## Part 5: Backwards Compatibility Reference

This table documents every old field and how it is handled:

| Old field | New field | Handling |
|---|---|---|
| `b.energy` | `b.focusQuality` | Read as `b.focusQuality \|\| b.energy \|\| null` everywhere |
| `b.notes` | `b.notes` | Unchanged, still optional |
| `b.category` (required) | `b.category` (defaults to Others) | `saveBlock()` sets to 'Others' if blank |
| `completionState` absent | `null` | Excluded from completion rate calculations |
| `linkedTasks` absent | `[]` | No auto-checking logic runs |
| `source` absent | treated as `'manual'` | No analytics impact |

Old blocks render without intent line (no second line on pill), with a grey completion dot (null state), and with the full 0.8 focus multiplier for weighted hours. No visual breakage.

---

## Part 6: Supabase Schema Summary

Tables that need to exist (existing ones are noted):

| Table | Status | Notes |
|---|---|---|
| `weekly_data` | Existing | No schema change needed — new block fields are inside the `days` jsonb column |
| `categories` | Existing | No change |
| `habits` | Existing | No change |
| `cat_archive` | Existing | No change |
| `backlog` | **New** | Create with SQL in section 4.1 |

The `wt_timer_active` state is intentionally **not** synced to Supabase. It is a transient local state. If the user opens the app on a different device while a timer is running on their primary device, the timer will not be visible on the secondary device. This is acceptable — a running timer is a single-device session concept.

---

## Part 7: Phase Completion Checklist

Use this to verify each phase before moving to the next.

### Phase 1 checklist
- [ ] Block modal fields in new order
- [ ] Intent textarea with live character counter, optional
- [ ] Focus quality replaces energy, reads old `energy` as fallback
- [ ] Linked tasks section appears when category has todos
- [ ] New task can be added from within modal, appears in Stack
- [ ] Completion state hidden for new blocks, visible when editing
- [ ] Save with no category defaults to Others, no error shown
- [ ] Block pills show intent second line (truncated to 40 chars)
- [ ] Block pills show completion dot with correct colour
- [ ] Old blocks render without regression

### Phase 2 checklist
- [ ] Timer state written to `wt_timer_active` on start
- [ ] Header indicator visible across all tabs while timer runs
- [ ] Timer resumes correctly after page refresh
- [ ] Retroactive offset chips work correctly (elapsed time starts from adjusted timestamp)
- [ ] Long duration warning appears above 3 hours, non-blocking
- [ ] Stop modal pre-fills category, duration, intent
- [ ] Saved block always writes to today's slot in current week regardless of which week user is browsing
- [ ] `wt_timer_active` deleted after block is saved
- [ ] Timer interval cleared after stop
- [ ] Manual logging unchanged

### Phase 3 checklist
- [ ] Completion rate card in Review (shows `—` if no completionState data yet)
- [ ] Weighted hours card in Review
- [ ] Completion rate by category section in Insights
- [ ] Energy distribution renamed to Focus Quality Distribution
- [ ] Old blocks with `energy` field display correctly in Focus Quality section

### Phase 4 checklist
- [ ] `loadBacklog` / `saveBacklog` in storage.js
- [ ] `_syncBacklog` fires on save
- [ ] Backlog read in `loadFromSupabase()`
- [ ] Supabase `backlog` table created with RLS
- [ ] `backlog.js` module created and imported in `app.js` and `index.html`
- [ ] Backlog modal opens from Stack tab header
- [ ] Items grouped by category, uncategorized section at bottom
- [ ] Add item works with category selector
- [ ] Pull moves item to this week's Stack todos (not a copy)
- [ ] Stack renders pulled item immediately
- [ ] Send to Backlog on Stack tasks works as inverse of Pull
- [ ] Delete from backlog works
- [ ] Export / Import includes backlog data (handled automatically by `wt_` prefix)
