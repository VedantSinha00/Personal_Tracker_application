# Bug Audit - Personal Tracker - 2026-06-01

## Coverage
- **Batches Merged:** 2 (`audit-chunks/batch-01.md` and `audit-chunks/batch-06.md`)
- **Independent Findings:** Added 11 additional bugs (including 6 High severity) discovered via direct code audit and Electron-specific review.
- **Scope:** All 21 JS files in `js/`, plus `main.js`, `preload.js`, and `index.html`.

## Summary
| Severity | Count |
|----------|-------|
| High     | 8     |
| Medium   | 8     |
| Low      | 5     |
| **Total**| **21**|

## Top 5 to Fix First
1. **Category rename permanently destroys stack text and weekly todos** - Severe data loss.
2. **Tasks have no unique IDs** - Severe data corruption; shifting array indices break links.
3. **Deep Link Callback Race Condition on Cold Start** - Prevents desktop logins.
4. **Electron In-Flight Sync Loss on App Exit** - Destroys unsynced cloud modifications.
5. **Offline-to-Online Week Sync Gap** - Silently leaves cloud database desynchronized after offline usage.

---

## Findings

### [SEVERITY: high] [CONFIDENCE: high] Category rename permanently destroys stack text and weekly todos
- **File:** [js/categories.js:136–161](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/categories.js#L136-L161), [js/app.js:255–280](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/app.js#L255-L280)
- **What’s wrong:** `renameCat` updates the category order and color list but leaves `d.stack` and `d.todos` keyed under the old name. When the modal closes, the `wt:cats-changed` handler in `app.js` runs, finds the old category name is no longer in the active name list, deletes it from `d.stack` and `d.todos`, and initializes the new name with empty values.
- **Why it matters:** Silent and permanent data loss of all focus text and weekly tasks (todos) for any renamed category on both the local cache and the cloud database.
- **Suggested fix:** Migrate the keys in `d.stack` and `d.todos` from the old name to the new name in `renameCat` before saving, and ensure the `wt:cats-changed` handler updates existing entries instead of purging them.

### [SEVERITY: high] [CONFIDENCE: high] Tasks have no unique IDs, causing shifting array indices to break links and complete incorrect tasks
- **File:** [js/dailylog.js:358](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/dailylog.js#L358), [js/dailylog.js:397](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/dailylog.js#L397), [js/stack.js:79](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L79), [js/overview.js:213](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/overview.js#L213)
- **What’s wrong:** Tasks are pushed as simple objects containing only `text` and `done` without unique IDs. Work blocks link to tasks using their index in the category’s task array. When a task is deleted or reordered, the array indices shift, causing block links to point to different tasks or become invalid.
- **Why it matters:** Users will see incorrect tasks highlighted as linked to their work blocks, and saving a work block can auto-complete a completely different task than intended.
- **Suggested fix:** Assign a unique ID (UUID) to each task on creation and link work blocks using the ID rather than the array index.

### [SEVERITY: high] [CONFIDENCE: high] Deep Link Callback Race Condition on Cold Start
- **File:** [main.js:185](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/main.js#L185), [js/auth.js:198](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/auth.js#L198)
- **What’s wrong:** On cold startup via a deep link, the main process sends the `auth-callback` event before the renderer registers its listener, causing the event to be lost.
- **Why it matters:** Users opening the app via a login redirect deep link experience silent login failures.
- **Suggested fix:** Buffer the auth callback in the main process until the renderer signals readiness via a `renderer-ready` event, or store the URL in a preload variable for later retrieval.

### [SEVERITY: high] [CONFIDENCE: high] Uncaught error handler crashes if an error occurs before `document.body` is parsed
- **File:** [js/error-overlay.js:35](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/error-overlay.js#L35)
- **What’s wrong:** The handler appends to `document.body` before the `<body>` element exists.
- **Why it matters:** Any early script error aborts the error overlay, leaving the user without feedback.
- **Suggested fix:** Check for `document.body` existence; if absent, append to `document.documentElement` or defer until `DOMContentLoaded`.

### [SEVERITY: high] [CONFIDENCE: high] Null dereference in realtime category and habits handlers when user signs out during an async callback
- **File:** [js/storage.js:1208](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L1208), [js/storage.js:1236](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L1236)
- **What’s wrong:** Handlers call `getCurrentUser()` and read `user.id` without checking for null.
- **Why it matters:** Sign‑out mid‑callback throws a `TypeError`, crashing realtime sync.
- **Suggested fix:** Add `if (!user) return;` after fetching the user.

### [SEVERITY: high] [CONFIDENCE: high] Offline-to-Online Week Sync Gap
- **File:** [js/storage.js:982](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L982)
- **What’s wrong:** When the application starts up, `loadFromSupabase` fetches the user's weeks. If a week has been edited offline, the local timestamp (`localTs`) is newer than the database timestamp (`row.updated_at`), correctly triggering the early return (`staleByTimestamp`). However, the app never schedules an upload of this newer local week data back to Supabase.
- **Why it matters:** Offline changes remain locked on the local device forever and are never synchronized to the cloud database unless the user makes another edit to that specific week. If they switch devices or clear browser caches, the offline modifications are permanently lost.
- **Suggested fix:** When `staleByTimestamp` matches, trigger `_perfSyncWeek(row.week_offset, localD)` immediately to reconcile the remote database.

### [SEVERITY: high] [CONFIDENCE: high] Backlog Offline Data Loss
- **File:** [js/storage.js:1124-1133](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L1124-L1133)
- **What’s wrong:** On launch, `loadFromSupabase` queries the `backlog` table and immediately writes it to `localStorage` under `wt_backlog`. There is no check comparing local backlog timestamps vs database backlog timestamps.
- **Why it matters:** Any changes made to the user's backlog while offline are immediately overwritten and deleted by the older cloud data when the application starts up online.
- **Suggested fix:** Store a local `updated_at` timestamp in `wt_backlog`. In `loadFromSupabase`, only overwrite local backlog if the cloud row is newer. If local is newer, trigger a sync back to Supabase.

### [SEVERITY: high] [CONFIDENCE: high] Electron In-Flight Sync Loss on App Exit
- **File:** [js/app.js:330–332](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/app.js#L330-L332), [js/storage.js:224–241](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L224-L241)
- **What’s wrong:** On window unload/close, the app executes `flushPendingSyncs()`. Because the sync operations (`_perfSyncWeek`, `_syncCategories`, etc.) return promises that resolve asynchronously, the `beforeunload` event finishes immediately. Electron then terminates the renderer process, aborting the active sync fetches in-flight.
- **Why it matters:** Any modifications made by the user within 1.5 seconds of exiting the Electron app are successfully written to `localStorage` but fail to sync to Supabase, leading to cloud desynchronization.
- **Suggested fix:** Implement a window close orchestration protocol. Prevent the default close behavior in the renderer if syncs are pending, wait for the promises to resolve, and then trigger a clean IPC window exit.

---

### [SEVERITY: medium] [CONFIDENCE: high] Insights tab crashes when historical week data lacks a `blocks` field
- **File:** [js/insights.js:147](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/insights.js#L147)
- **What’s wrong:** Assumes every day has `blocks`; undefined triggers `.forEach` error.
- **Why it matters:** Entire Insights tab becomes unusable for affected users.
- **Suggested fix:** Guard with `const blocks = day.blocks || [];` before iteration.

### [SEVERITY: medium] [CONFIDENCE: high] `showToast` called without import in `stack.js`
- **File:** [js/stack.js:400](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L400), [js/stack.js:409](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L409)
- **What’s wrong:** Relies on side‑effect global assignment.
- **Why it matters:** Module order changes cause `ReferenceError`.
- **Suggested fix:** `import { showToast } from './toast.js';`

### [SEVERITY: medium] [CONFIDENCE: high] `#lowS` missing null guard in `stack.js` rendering
- **File:** [js/stack.js:130–136](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L130-L136)
- **What’s wrong:** Accesses `#lowS` without null check.
- **Why it matters:** Early render triggers `TypeError`.
- **Suggested fix:** Add null guards for low‑level elements.

### [SEVERITY: medium] [CONFIDENCE: high] Both focus‑toggle buttons fire the same generic toggle
- **File:** [js/stack.js:67–73](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L67-L73), [js/stack.js:382–384](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L382-L384)
- **What’s wrong:** Blindly flips focus level.
- **Why it matters:** Clicking an already‑active button unintentionally changes focus.
- **Suggested fix:** Pass explicit target level to `toggleFocus`.

### [SEVERITY: medium] [CONFIDENCE: high] Memory leak in custom select mapping
- **File:** [js/custom-select.js:6](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/custom-select.js#L6), [js/custom-select.js:52](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/custom-select.js#L52)
- **What’s wrong:** Strong `Map` retains removed select elements.
- **Why it matters:** Increases memory footprint over time.
- **Suggested fix:** Use a `WeakMap`.

### [SEVERITY: medium] [CONFIDENCE: high] Realtime Category Echo Loop
- **File:** [js/storage.js:1094](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L1094), [js/storage.js:1228](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/storage.js#L1228)
- **What’s wrong:** Hydrating categories triggers `saveCats`, which re‑syncs back to Supabase.
- **Why it matters:** Redundant writes and potential write conflicts.
- **Suggested fix:** Write directly to `localStorage` and dispatch events without calling `saveCats`.

### [SEVERITY: medium] [CONFIDENCE: high] Electron Missing Deep Link Callback on Packet Queue
- **File:** [main.js:151–160](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/main.js#L151-L160)
- **What’s wrong:** When a second instance launches (such as via deep link redirect on re-login), the first instance receives a `second-instance` event and sends the deep link to the renderer immediately. If the renderer is currently processing a page reload, the message is dropped.
- **Why it matters:** Users logging out and back in experience silent login failure.
- **Suggested fix:** Buffer deep link URLs in the main process until the renderer registers itself as ready.

---

### [SEVERITY: low] [CONFIDENCE: high] `carryForward` button null guard drop
- **File:** [js/stack.js:238-239](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L238-L239), [js/stack.js:248](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L248), [js/stack.js:269](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/stack.js#L269)
- **What’s wrong:** Subsequent button property accesses lack guards.
- **Why it matters:** Null `btn` leads to `TypeError`.
- **Suggested fix:** Guard all mutations with `if (btn)`.

### [SEVERITY: low] [CONFIDENCE: high] `stopTimer` and `updateOtherTimerDisplays` use wrong day cards on cross‑midnight sessions
- **File:** [js/timer.js:71-75](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/timer.js#L71-L75), [js/timer.js:170](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/timer.js#L170)
- **What’s wrong:** Uses today’s date instead of `t.startDay`.
- **Why it matters:** Timer UI appears on incorrect day after crossing midnight.
- **Suggested fix:** Reference `t.startDay` for rendering.

### [SEVERITY: low] [CONFIDENCE: high] `esc(h.name).toUpperCase()` HTML entity casing corruption
- **File:** [js/review.js:55](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/review.js#L55)
- **What’s wrong:** Upper‑casing escaped entities breaks them.
- **Why it matters:** Entities render as raw strings.
- **Suggested fix:** `esc(h.name.toUpperCase())`.

### [SEVERITY: low] [CONFIDENCE: high] Journal text in Insights rendered with incomplete escaping — `&` not escaped
- **File:** [js/insights.js:337](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/insights.js#L337)
- **What’s wrong:** Manual regex leaves `&` unescaped.
- **Why it matters:** Entity‑decoding inconsistencies.
- **Suggested fix:** Use the `esc` helper.

### [SEVERITY: low] [CONFIDENCE: high] First startup triggers mock rollover and carry‑forward
- **File:** [js/weekState.js:62-84](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/weekState.js#L62-L84)
- **What’s wrong:** `_lastKnownMonday` initialized `null` causes spurious `wt:week-changed` event.
- **Why it matters:** Unnecessary carry‑forward on first load.
- **Suggested fix:** Initialise without firing event when null.

### [SEVERITY: low] [CONFIDENCE: high] Electron Missing Window State Restoration
- **File:** [main.js:66–86](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/main.js#L66-L86)
- **What’s wrong:** The app initializes to `1200x800` layout on every cold start. It does not remember window positions, boundaries, or maximized states.
- **Why it matters:** Inconvenient user experience requiring manually resizing the desktop app every time it launches.
- **Suggested fix:** Persist window boundaries and maximized state to settings on resize/move, and retrieve them during window creation.

## Rejected / false positives
- None – all findings verified against the codebase.
