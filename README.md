# Weekly Tracker

This project started as a deliberate learning exercise in **vibe coding** — building and iterating on a real application using AI assistance — with the goal of developing intuition for the full frontend development process before tackling a larger project.

---

## What it does

The tracker helps you manage a single week at a time across five views:

| Tab | Purpose |
|---|---|
| **Overview** | Landing page showing today's focus items, habit checkboxes, and weekly habit streaks at a glance |
| **Daily Log** | A 7-card grid (Mon–Sun) for logging work blocks, toggling habits, and marking MVD or Full Rest days |
| **Stack** | Sunday planning — set a weekly intention and write one concrete next action per focus area |
| **Review** | End-of-week reflection — three free-text fields plus live metric bars for runs, work blocks, and rest |
| **Insights** | Cross-week analytics — bar charts, habit heatmaps, area breakdowns, energy distribution, and consistency tracking |

Week navigation lets you move backward and forward freely. Every week's data is stored independently so historical weeks remain intact.

---

## Core concepts

### Minimum Viable Day (MVD)
The smallest version of a productive day that keeps momentum alive — not full output, but not a complete stop either. Marking MVD on a day card signals you showed up at the minimum.

### Full Rest Day
A complete stop — when neither MVD nor partial work is realistic. One per week is normal; multiples in a row are a signal worth investigating.

### The Stack
A deliberate Sunday ritual. You write the single next concrete action per area so that when you sit down to work mid-week, the decision is already made. Removes the friction that leads to avoidance.

### Real Rest
Distinguishes genuine recovery (music alone, lying down, being outside — no screen input) from entertainment (shows, scrolling). Tracked separately as a daily habit.

---

## Feature overview

**Work block logging**
- Category, time-of-day slot, duration (free-text or quick-pick chips), energy level (Low / Medium / High), and freeform notes
- Duration parser handles formats like `45m`, `1h`, `1h 30m`, `2.5h`
- Blocks are editable and deletable after creation

**Habit system**
- Two built-in habits: *Run* and *Rest*
- Unlimited custom habits, each with a name, weekly target, and colour
- Habit checkboxes appear on every day card and the Overview panel

**Categories**
- Fully configurable — add, rename, delete, reorder (drag-to-reorder in modal), and assign a colour from a 36-swatch preset palette or a custom hex picker
- *Others* is always pinned last and cannot be deleted
- Deleted categories are archived so old blocks still render with the correct colour

**Stack tab**
- Drag-and-drop reorder using the FLIP animation technique
- High / Low focus toggle per area (with left-border visual distinction)
- *Carry from last week* button propagates stack text, focus levels, and item order into the current week for any fields not yet filled

**Insights tab**
- Time-frame filter: 1 week → All time
- Weekly hours bar chart, habit heatmap (one row per week, Mon–Sun), hours-by-area bar chart, time-of-day distribution, habit consistency grid (last 28 days per habit), energy breakdown, and a text summary

**Theme**
- Light and dark modes, persisted across sessions

**Import / Export**
- One-click JSON export of all `wt_*` localStorage keys
- Import with overwrite confirmation
- Last export timestamp displayed in the toolbar

---

## Technical architecture

The app is written in **vanilla ES modules** — no build step, no bundler, no framework. It runs directly in any modern browser by opening `index.html`.

```
index.html          — Shell, all modals, tab panels
css/
  styles.css        — Full design system (CSS custom properties, dark mode, all components)
js/
  app.js            — Entry point; imports all modules, wires top-level listeners, bootstraps
  storage.js        — The entire data layer (all localStorage reads/writes live here)
  constants.js      — Static data: day names, default categories, built-in habits, colour palette
  dailylog.js       — Day grid render + block logging modal
  overview.js       — Overview tab render + interactive habit chips
  stack.js          — Stack tab render, FLIP drag-and-drop, carry-forward logic
  review.js         — Review tab metrics bar + textarea persistence
  insights.js       — Cross-week data aggregation and all chart/heatmap renders
  categories.js     — Category modal: add/rename/delete/reorder/colour picker
  habits.js         — Habits modal: add/delete custom habits
  colours.js        — Colour resolution, badge text contrast, shared swatch picker component
```

**Key architectural decisions:**

- `storage.js` is the only file that touches `localStorage`. Every other module calls its exported functions. When this app eventually migrates to a backend, only this file changes.
- Modules communicate upward via **custom DOM events** (`wt:day-changed`, `wt:cats-changed`, etc.) rather than calling each other's render functions directly. `app.js` is the sole orchestrator.
- All day-card interactions use **delegated event listeners** on stable parent containers rather than attaching handlers to dynamically generated elements.
- The Stack tab's drag-and-drop uses the **FLIP animation pattern** (First → Last → Invert → Play) for smooth reordering without absolute positioning.
- The badge colour system uses CSS `color-mix()` to tint category colours at 40% intensity against a theme-aware base, with a computed light/dark text colour for legibility.

---

## Data model

Each week is stored as a single JSON object under the key `wt_wk_{offset}` where `offset` is `0` for the current week, `-1` for last week, etc.

```json
{
  "intention": "string",
  "stack": { "CategoryName": "next action text", ... },
  "days": [
    {
      "run": false,
      "rest": false,
      "mvd": false,
      "fullRest": false,
      "blocks": [
        {
          "category": "string",
          "duration": "string",
          "energy": "low | medium | high",
          "notes": "string",
          "slot": "early-morning | morning | afternoon | evening | night"
        }
      ],
      "habits": { "h_1234567890": true, ... }
    }
  ],
  "review": {
    "worked": "string",
    "didnt": "string",
    "adjust": "string"
  }
}
```

Other keys used in localStorage:

| Key | Contents |
|---|---|
| `wt_categories` | Array of `{ name, color }` objects |
| `wt_habits` | Array of custom habit objects |
| `wt_focus_{offset}` | Per-week map of `{ categoryName: "high" \| "low" }` |
| `wt_order_{offset}` | Per-week array of category names defining drag order |
| `wt_targets` | `{ runs: number, rest: number }` weekly targets |
| `wt_cat_archive` | Map of deleted category names → their last colour |
| `wt_last_export` | ISO date string of the last export |
| `wt_theme` | `"light"` or `"dark"` |

---

## Running locally

No installation required.

```bash
git clone https://github.com/your-username/weekly-tracker.git
cd weekly-tracker
```

Then open `index.html` in a browser. Because the app uses ES modules, most browsers require it to be served over HTTP rather than opened as a `file://` URL. A simple way to do this:

```bash
# Python 3
python -m http.server 8080

# Node (if you have npx)
npx serve .
```

Then visit `http://localhost:8080`.

---

## Roadmap

This is the frontend-only phase. The planned next phase is a backend integration:

- [ ] User authentication
- [ ] Cloud persistence (replacing localStorage)
- [ ] Cross-device sync
- [ ] Data export to formats beyond JSON (CSV, PDF summary)

---

## Context

This project is the first step in learning the end-to-end process of building a real application — from UI design through data architecture to eventual backend integration. The deliberately constrained scope (one week, one user, no server) kept the complexity manageable while covering most of the frontend fundamentals: component composition, state management, event delegation, animation, persistence, and modular architecture.

The larger project this feeds into is called **LastOne**.
