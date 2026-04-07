# Personal Tracker — Weekly Productivity App

> A full-featured **desktop + web** productivity tracker built with Vanilla JS, Electron, and Supabase. Designed and shipped solo using a vibe coding workflow — from concept to packaged Windows installer.

**[Live Web Demo](https://vedantsinha00.github.io/Personal_Tracker_application/)** | **v1.1.2**

---

## What It Is

A weekly habit and work tracker that runs as a native Windows desktop app (via Electron) and also as a web app. It covers the full productivity loop — planning, execution, journaling, and review — in a single, fast, offline-capable application.

---

## Features

### Five Core Views

| Tab | Role | What you do here |
|---|---|---|
| **Overview** | Dashboard | See today's focus items, habit checkboxes, and weekly streaks at a glance |
| **Daily Log** | Execution | Log timed work blocks per category, toggle habits, write daily journal entries |
| **Stack** | Planning | Set weekly intentions, define next actions per category, manage a persistent backlog |
| **Review** | Reflection | End-of-week analytics — habit bars, avg block duration, "What Worked / Didn't" |
| **Insights** | Analytics | Long-term trends — habit heatmaps, energy distribution, category hour breakdowns |

### Core Capabilities

- **Live Stopwatch Timer** — Start a focused block in one click; the timer persists across tab switches and auto-logs when you stop it.
- **Backlog & Weekly Agenda** — Capture tasks in a persistent cross-week backlog, then promote them into the current week's Stack.
- **Custom Categories** — Add, rename, reorder, and color-code your own work categories (36-swatch palette + hex picker).
- **Custom Habits** — Define habits with individual targets, colors, and per-day tracking.
- **Cloud Sync + Offline First** — Supabase integration with `localStorage` as an instant cache. Works offline; syncs in the background.
- **Smart Recovery** — Dedicated logic to detect and repair corrupt or missing category/mission data after sync conflicts.
- **Auto-Updater** — Electron desktop build checks GitHub Releases on launch and offers a one-click "Restart & Install."
- **Data Export / Import** — Full JSON export and import for backup and migration.

### UI/UX Details

- Frameless Electron window with custom titlebar (Windows-optimized)
- Dark mode with glassmorphic overlays and 1px borders
- Custom-built dropdown components (no OS-native selects)
- FLIP-based drag-and-drop reordering in the Stack tab
- Micro-animations on tab switches, modals, and toasts

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JavaScript (ES Modules), HTML5, CSS3 |
| **Desktop Shell** | Electron 31 (frameless, Windows NSIS installer) |
| **Database** | Supabase (PostgreSQL + Auth) |
| **Realtime Sync** | Supabase Realtime channels |
| **Build** | electron-builder |
| **Styling** | Pure CSS design system with CSS custom properties |

No frameworks. No bundler. No build step for the web layer — ES Modules load directly from the file system.

---

## Architecture

```
index.html              Application shell, all modals and tab containers
js/
  app.js                Central orchestrator — state, event bus, tab routing
  storage.js            Unified data layer (localStorage cache + Supabase sync)
  auth.js               Supabase auth & session management
  sb.js                 Supabase client and realtime helpers
  dailylog.js           7-day grid rendering and block logging logic
  overview.js           Dashboard summary and interactive habit chips
  stack.js              Weekly planning, FLIP drag-and-drop, next-actions
  backlog.js            Persistent cross-week task backlog and agenda
  review.js             Weekly metrics calculation and reflection fields
  insights.js           Long-term data aggregation for charts and heatmaps
  categories.js         Category CRUD, color management, smart recovery
  habits.js             Custom habit configuration modal
  timer.js              Stopwatch — isolated to avoid circular dependencies
  toast.js              Non-blocking notification system
  custom-select.js      Custom dropdown component (replaces native <select>)
  colours.js            Color resolution and badge contrast utilities
  constants.js          App-wide constants
css/
  styles.css            Full design system and all component styles
main.js                 Electron main process, auto-updater, IPC
preload.js              Secure context bridge between Electron and renderer
```

**Key architectural decisions:**

- **Event-driven modules** — Components communicate via a custom DOM event bus (`wt:day-changed`, `wt:auth-ready`). No shared mutable globals.
- **Stateless renderers** — UI functions take data and produce DOM. Storage is separate from rendering.
- **Dual-layer persistence** — Every write goes to `localStorage` immediately (instant UI) and queues a Supabase sync in the background.
- **Timer isolation** — `timer.js` was split out specifically to break a circular import chain between `app.js` and `dailylog.js`.

---

## Data Model

Each week is one document, stored in Supabase and cached locally:

```json
{
  "intention": "Ship the MVP",
  "stack": { "Dev": "Finish auth flow", "Health": "Run 3x" },
  "days": [
    {
      "mvd": true,
      "fullRest": false,
      "journal": "Strong morning session.",
      "habits": { "reading": true, "meditation": false },
      "blocks": [
        { "category": "Dev", "duration": "2h", "energy": "high", "slot": "morning" }
      ]
    }
  ],
  "review": { "worked": "...", "didnt": "...", "adjust": "..." }
}
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v16+

### Run the Desktop App
```bash
git clone https://github.com/VedantSinha00/Personal_Tracker_application.git
cd Personal_Tracker_application
npm install
npm start
```

### Run as Web App
```bash
# Python
python -m http.server 8080

# Node
npx http-server .
```
Then open `http://localhost:8080`.

### Build Windows Installer
```bash
npm run dist
```
Produces an NSIS installer in `/dist`.

---

## Roadmap

- [x] User authentication (Supabase)
- [x] Cloud persistence and cross-device sync
- [x] Electron desktop app with auto-updater
- [x] Custom categories and habits
- [x] Live stopwatch timer
- [x] Persistent backlog and weekly agenda
- [x] Data export / import
- [ ] Mobile wrapper (Capacitor)
- [ ] Multi-week goal tracking
- [ ] CSV / PDF export

---

## Context

This project was built solo using a **vibe coding** workflow — rapid, AI-assisted development where human design judgment drives the product and AI accelerates implementation. The goal was to ship a polished, production-grade application quickly and without cutting corners on code quality or architecture.

---

*Built by Vedant Sinha*
