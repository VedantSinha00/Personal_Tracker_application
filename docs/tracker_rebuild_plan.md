# Personal Tracker

## Accountability Rebuild: Architecture and Migration Plan

Prepared for: Vedant Sinha  
March 2026

---

## 1. The Problem with the Current Model

The tracker was built to measure time. Everything downstream, including the Review tab metrics, the Insights charts, and the weekly summary, is built on `parseDuration()`. Raw hours. This creates a critical flaw: the tracker rewards you for logging a block, not for doing work.

### 1.1 What the current block stores

The `notes` field exists but is an afterthought: a freeform textarea with the placeholder `"What did you actually work on?"` with no structure and no consequence for skipping it. The `energy` field is buried and vague. Neither feeds meaningfully into any metric.

### 1.2 The disconnect between Stack and Daily Log

The Stack tab has a fully built task list per category. These tasks are completely disconnected from block logging. You check them off manually on the Overview, independent of whether you actually logged a block against them.

The closed loop never closes:

- Sunday: you write tasks in Stack
- During the week: you log blocks by category
- At some point: you manually tick tasks on Overview
- Review: the metrics show hours, not task completion

There is no way to see whether your blocks actually moved your tasks forward.

## 2. The Proposed Solution

Four targeted changes, in priority order. Each one builds on the previous. The first is the highest-leverage change by a significant margin.

### 2.1 Intent field: required, declared upfront

Before you can save a block, you must answer one question: `"What will I finish in this block?"` One sentence. No skipping.

This is not a notes field. It is a commitment, declared before work starts or at the moment of logging. The gap between this declaration and what actually happened becomes the most honest productivity signal in the app.

- Declared before or at the start of the block, not retroactively optional
- One sentence; the modal enforces this with a character limit of about 120 chars
- Cannot save the block without filling this field
- Displayed in the daily card alongside the block pill so it is always visible

### 2.2 Completion signal: replaces "notes" as the close field

When you close a block, or log it retroactively, you answer: did you finish what you said you would?

Three states:

- Done
- Partial
- Abandoned

This single field, aggregated over weeks, tells you your completion rate per category, which is the most actionable metric the tracker can surface. High completion rate means your planning is calibrated. Low rate means either your estimates are off or something keeps interrupting that block type.

### 2.3 Focus quality: mandatory, renamed from "energy"

The current `energy` field is optional, buried, and called the wrong thing. `"Energy"` implies how physically awake you were. What the tracker actually needs to know is: how present were you during this block?

Rename it to `focusQuality`. Make it required with three taps:

- Low
- Medium
- High

Multiplying hours by a focus multiplier gives a weighted output score.

### 2.4 Task linking: Stack tasks connect to blocks

The Stack tab already has a task list per category. When a block modal opens after a category is selected, it optionally shows the tasks for that category. The user can link the block to one of those tasks.

When the block is saved with completion = `Done` or `Partial`, the linked task is automatically checked in the Stack tab and Overview. This creates the closed loop:

- Sunday: write tasks in Stack
- During the week: open a block, link it to a task, do the work
- On logging: completion signal auto-checks the task
- Review: completion rate + task closure rate are real metrics

## 3. Data Model Changes

Every change is additive. Existing block data continues to work. Old blocks simply render without the new fields:

- `completionState` defaults to `null`
- `focusQuality` defaults to `null`
- `intent` defaults to empty

No migration is required.

### 3.1 Updated block schema

Current block object in `dailylog.js`, `saveBlock()`:

```js
{ category, duration, energy, notes, slot }
```

New block object:

```js
{
  category,
  duration,
  slot,
  intent,
  completionState,
  focusQuality,
  linkedTaskCat,
  linkedTaskIdx,
  notes
}
```

### 3.2 Weighted output score

This is a new computed metric. It is not stored. Compute it on the fly in `review.js` and `insights.js`.

Formula:

```js
weightedHours = parseDuration(b.duration) * focusMultiplier(b.focusQuality)
```

Focus multiplier:

- `high = 1.0`
- `medium = 0.6`
- `low = 0.3`
- `null = 0.8` for old blocks as a graceful fallback

Completion rate per category:

```js
(doneBlocks + partialBlocks * 0.5) / totalBlocks
```

Express the result as a percentage.

## 4. UI Changes per Module

### 4.1 Block modal: `dailylog.js` + `index.html`

The block modal is the primary change surface. The new flow splits the modal into two logical phases: start and close.

Modal fields in the new order:

1. Category selector, same as today
2. Intent field, new and required  
   Label: `WHAT WILL YOU FINISH?`  
   Textarea with 120-char limit and live counter. Cannot save without this. Shown at the top above slot and duration.
3. Slot selector, same as today
4. Duration chips, same as today
5. Focus quality, renamed from energy  
   Label: `FOCUS QUALITY`  
   Options: Low / Medium / High  
   Required; block cannot save as complete without this selected.
6. Linked task, new and optional  
   Appears only if the selected category has tasks in `d.todos`. Shows a small pill list of tasks; tap to link one.
7. Completion state, new  
   Label: `DID YOU FINISH?`  
   States: Done / Partial / Abandoned  
   Hidden when opening a new block in intent-only mode. Required when editing or closing.
8. Notes, retained and optional  
   Placeholder: `Any extra context?`

### 4.2 Day card: `renderDayCard()` in `dailylog.js`

Each block pill currently shows:

- category
- duration
- slot

New pill shows:

- category, duration, slot
- Intent text truncated to about 40 chars as a second line
- Completion indicator dot:
  - green = done
  - amber = partial
  - red = abandoned
  - grey = no completion logged yet

### 4.3 Review tab: `review.js`

The Review tab gains two new metric cards alongside the existing Blocks / Total Hours / Avg Block row.

The existing `WEEKLY SUMMARY` stat cards (`blks`, `hrs`, `avg`) are retained and joined by the new metrics. The habit achievement bars are unchanged.

### 4.4 Insights tab: `insights.js`

Two new insight sections are added:

- Completion rate by category  
  Bar chart similar to the existing area distribution, showing done / partial / abandoned breakdown per category across the selected time range.
- Intent vs actual  
  A simple text-based insight: for each category, average declared intent length vs average actual completion rate. This acts as a proxy for estimation calibration.

The existing charts are retained:

- Weekly momentum
- Area hours
- Energy, renamed to focus quality
- Time of day

The old energy distribution chart becomes `Focus quality distribution` and continues to work with graceful fallback for old blocks.

### 4.5 Overview tab: `overview.js`

The Overview tab's focus area cards already show linked tasks with checkboxes. The only change is that when a task is auto-checked via block completion, the checkbox updates in real time.

This should already happen through the `wt:day-changed` event bus, assuming the auto-check in `saveBlock()` fires the same event.

The Today's Log card shows the updated block pills with intent text and completion dot from `renderDayCard()`.

## 5. Implementation Phases

Four phases, each independently shippable. You can stop after any phase and still have a working, improved tracker.

### 5.1 Phase 1: Intent field

Highest leverage.

Changes in `dailylog.js`:

- Add `intent` to the block object in `saveBlock()`
- Add validation: if `intent` is empty, show an error and do not save
- Pre-populate `intent` when editing an existing block

Changes in `index.html`:

- Add intent textarea to the block modal above the slot row
- Add a live character counter

Changes in `styles.css`:

- Style the intent field with a distinct label: `WHAT WILL YOU FINISH?`
- Style the block pill to show a second line with truncated intent text

### 5.2 Phase 2: Completion state + focus quality

Changes in `dailylog.js`:

- Rename `selE` to `selFocus` throughout
- Add `selCompletion` state variable
- Add completion state picker buttons: Done / Partial / Abandoned
- Update `saveBlock()` to save `completionState` and `focusQuality`

Changes in `index.html`:

- Replace `ENERGY` row with `FOCUS QUALITY`
- Add `DID YOU FINISH?` row below focus quality with three state buttons

Changes in `renderDayCard()`:

- Add a completion dot to the block pill based on `completionState`

### 5.3 Phase 3: New Review metrics

Changes in `review.js`:

- Compute `completionRate` per category by counting done / partial / abandoned blocks
- Compute `weightedHours` as `parseDuration * focusMultiplier`
- Add two new stat cards to `rvCoreStats`
- Add completion rate mini-bars to `rvHabitsList` area or a new section

Backwards compatibility:

- Blocks without `completionState` are excluded from completion rate but included in raw hours
- Blocks without `focusQuality` use the `0.8` fallback multiplier

### 5.4 Phase 4: Task linking

Changes in `dailylog.js`:

- In `openM()`, after category is selected, load `d.todos[category]` and render a linked task picker if tasks exist
- Add `linkedTaskCat` and `linkedTaskIdx` to block state variables
- In `saveBlock()`, if a task is linked and `completionState` is `done` or `partial`, auto-check the task in `d.todos`

Changes in `index.html`:

- Add `LINKED TASK` row to the block modal
- Hide it by default and show it when the selected category has tasks

Changes in `stack.js` / `overview.js`:

- No changes should be needed; both already react to `d.todos` updates via the `wt:day-changed` event bus

## 6. Backwards Compatibility

All changes are additive. Existing data is never modified. Old blocks render gracefully.

The Supabase sync layer in `storage.js` requires no changes because it stores weekly data as a JSON blob. New fields are transparently included in the next sync.

## 7. The New User Flow in Practice

Here is what a typical day looks like after the rebuild is complete.

### Sunday: Stack tab

- Set weekly intention
- Write 1 to 3 tasks per focus area
- Set focus levels, high or low, per category

### Monday to Friday: Daily Log / Overview

- Click `+` to log a block on a day card
- Select category and see linked tasks for that category
- Type intent, for example: `"Finish the auth flow refactor"`; required and cannot be skipped
- Optionally link to a task from the Stack
- Select time slot and duration
- Save; the block is now open and no completion is required yet
- Do the work
- Later, click the block pill to edit it
- Select focus quality
- Select completion state: done / partial / abandoned
- If linked task and done or partial, task auto-checks in Stack and Overview

### Sunday: Review tab

- See completion rate by category: where did you finish what you said?
- See weighted hours: how much real focused work happened?
- See task closure rate: how many Stack tasks moved forward?
- Write What Worked / What Didn't as usual
- Build next week's Stack more honestly because you now know what you overcommitted to

## 8. What This Changes About the Analytics

The Review and Insights tabs have always shown how much time you logged. After the rebuild, they show how much real work you did.

## 9. Insights Tab: Visual Design and Graph Specifications

Each insight is presented as a card. The card shows:

- A headline number
- A one-line summary
- A small preview chart
- A coloured status tag: on track / needs attention / pattern found

Clicking any card expands a drilldown panel directly below it with a full-size chart and a plain-language interpretation. No separate page navigation is needed; the panel opens inline.

### 9.1 Card layout structure

Every insight card follows the same structure:

- Header row: insight name in small caps plus arrow indicator
- Headline value: the single most important number or label for this insight
- Subtitle: one sentence of context, for example `"vs last week"` or `"top area by weighted hours"`
- Preview chart: small inline chart, about 80px tall, no axes, no labels
- Status tag:
  - green = `On track`
  - amber = `Needs attention`
  - teal = `Pattern found`

Cards are arranged in a two-column grid on desktop using the existing `ins-grid` layout in `styles.css`. The three smaller cards in row 3 use a three-column grid.

### 9.2 The insight cards

#### 1. Weekly momentum

Drilldown chart: stacked bar chart.

- X-axis: weeks
- Y-axis: hours
- Stacked layers:
  - teal = high focus blocks
  - amber = medium focus
  - gray = low focus

This shows not just how much you worked, but the quality composition of each week.

Drilldown stats row:

- raw hours
- weighted hours
- focus ratio %
- delta vs last week

Drilldown insight: the gap between raw and weighted hours is labelled as the `quality tax`, meaning time logged without full presence.

#### 2. Completion rate

Drilldown chart: horizontal stacked bar chart.

- One row per category
- Segments:
  - done = teal
  - partial = amber
  - abandoned = red

This makes it immediately visible which categories have calibration problems.

Drilldown insight: the category with the lowest completion rate gets a specific recommendation such as:

> Your intents for [category] are likely over-scoped. Try declaring smaller units of work.

#### 3. Habit consistency

Drilldown:

- One dot heatmap per habit
- Each labelled with:
  - habit name
  - consistency %
  - weekly target

Below the heatmaps, include a plain-language observation about which day of the week sees the most misses.

#### 4. Tool effectiveness

This is new.

Tool effectiveness answers the question: under what conditions do you actually finish what you start?

It crosses three dimensions:

- Time slot: which slots produce the highest completion rates
- Category: which categories perform best in which slots
- Focus quality: whether high-focus blocks are concentrated in certain slots

Drilldown chart: bubble chart.

- X-axis: time slot with 6 positions  
  early morning / morning / afternoon / evening / night / late night
- Y-axis: average completion rate for blocks in that slot
- Bubble size: number of blocks logged in that slot
- Bubble colour: dominant focus quality for that slot
  - teal = mostly high focus
  - amber = mostly medium

Below the chart, show a ranked table of the best-performing slot + category combinations:

`[Slot] · [Category] — [completion rate]%`

This is one of the most actionable outputs in the Insights tab because it tells you when to schedule which type of work.

Also show worst-performing combinations with recommendations such as:

> Night sessions on Project have a 38% completion rate. Consider not scheduling deep work there.

#### 5. Focus quality distribution

Drilldown chart: stacked area chart.

- X-axis: weeks
- Y-axis: block count
- Layers: high / medium / low

This shows whether your focus profile is improving over time. Ideally, the teal layer grows proportionally.

#### 6. Area distribution

Drilldown chart: horizontal bar chart.

- One bar per category
- Bar length = weighted hours
- Small text overlay = completion rate for that category

This makes it obvious whether high-hour categories also have high completion. If Project takes 38% of your hours but only has a 55% completion rate, that is a planning signal.

#### 7. Intent accuracy

Intent accuracy is the strictest metric in the tracker. Unlike completion rate, which counts partial as a partial win, intent accuracy only counts blocks where you declared an intent and finished it fully.

A rising intent accuracy line over several weeks means your scoping skill is improving. You are getting better at declaring what you can actually finish in a session.

Drilldown chart: line chart.

- X-axis: weeks
- Y-axis: done %
- Include a dashed horizontal reference line at 70%
- When the line crosses above 70%, tint the area teal

Drilldown insight example:

> Your accuracy was highest in week [N]. That week you had shorter blocks with very specific intents. Try keeping intents under 80 characters.

### 9.3 Drilldown interaction pattern

The drilldown opens inline. It inserts a panel directly below the tapped card.

- No navigation away from the Insights tab
- No modal overlay
- Panel is closeable with a close button
- Only one drilldown is open at a time; opening a second closes the first

Each drilldown contains:

- Chart type label and data description in small gray text
- A row of 3 to 4 stat mini-cards
- The full-size chart
- A plain-language interpretation paragraph in gray text below the chart

### 9.4 Implementation notes

- All charts use Chart.js, already loaded in the app via CDN in `index.html`
- No new dependencies
- The drilldown panel animation is a simple CSS `max-height` transition
- No JS animation library needed
- All chart data is computed on render from the existing week data already in `localStorage`
- No new storage schema is required for the charts themselves

## 10. Final Note

None of this changes how the tracker feels to use on a good day. On a good day, you open the modal, type what you are about to do, do it, close it with `done`, and move on. The overhead is one sentence and two taps.

What it changes is what happens on a bad day. Right now, a bad day looks the same in the data as a good one. After the rebuild, the completion dot tells the truth.
