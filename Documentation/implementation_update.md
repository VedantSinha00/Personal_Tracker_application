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
   * @property {number} idx
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
- Add week-specific export helper `exportSingleWeek(absOffset)` to generate a self-contained JSON backup of the target week.

```javascript
export function exportSingleWeek(absOffset) {
  const wkKey = 'wt_wk_' + absOffset;
  const data = localStorage.getItem(wkKey);
  if (!data) return null;
  const weekData = JSON.parse(data);
  const { intention, stack, todos, days, review, ghosts } = weekData;
  return JSON.stringify({ intention, stack, todos, days, review, ghosts }, null, 2);
}
```

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
- In the account settings initialization, scan `localStorage` for keys matching `wt_wk_*`.
- Populate `#exportWeekSelect` with week dates formatted using `getMonFromAbs(offset)`.
- Wire `#exportSingleWeekBtn` to invoke the single week export.

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
4. **Week Specific Export**:
   - Open Account Settings. Verify dropdown contains all weeks with data.
   - Select a week and click export. Open the exported JSON file and verify it only contains keys for the chosen week and categories/habits.
5. **Adjustment Card on Overview**:
   - In week 0, write an adjustment focus in the Review tab.
   - Navigate to week 1, go to the Overview tab. Verify a card containing that adjustment text displays below "Today's Log".
