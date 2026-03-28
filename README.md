# Personal Tracker (Vibe Coding Project)

A high-performance, premium weekly habit and work tracker designed for maximum clarity and minimal friction. This application serves as a foundational project for **LastOne**, utilizing modern web technologies and a vanilla-first architecture.

[**Live Demo**](https://vedantsinha00.github.io/Personal_Tracker_application/)

---

## What it does

The tracker optimizes your weekly performance across five specialized views:

| Tab | Purpose |
|---|---|
| **Overview** | **Dashboard:** Landing page showing today's focus items, habit checkboxes, and weekly streaks at a glance. |
| **Daily Log** | **Execution:** A 7-day grid for logging granular work blocks, toggling habits, and recording daily journal entries. |
| **Stack** | **Planning:** Sunday ritual view—set weekly intentions and define concrete next actions per focus area. |
| **Review** | **Reflection:** End-of-week analytics—habit achievement bars, avg work block duration, and parallel "What Worked/Didn't" reflections. |
| **Insights** | **Analytics:** Long-term trends—habit heatmaps, energy distribution, and category-based hour breakdowns. |

---

## Key Features

### 🚀 Performance & Sync
- **Dual-Layer Storage**: Combines the speed of `localStorage` with the reliability of **Supabase** cloud persistence.
- **Offline First**: Work instantly; changes are queued and synced to the cloud in the background.
- **Real-time Auth**: Secure user accounts with persistent sessions.

### 📊 Advanced Metrics
- **Dynamic Habit System**: Multi-habit tracking with customizable targets, colors, and auto-scrolling for long lists.
- **Work Analytics**: Automatic calculation of total hours, block counts, and average block efficiency.
- **Energy Tracking**: Log Low/Medium/High energy per block to identify peak performance windows.

### 📝 Integrated Journaling
- **Daily Reflection**: Quick-access journaling on every day card to capture thoughts and context alongside your data.
- **Reflection Parallelism**: Side-by-side "What Worked" and "What Didn't" review fields for holistic weekly assessment.

### 🎨 Premium UI/UX
- **Modern Design**: Sleek dark mode, glassmorphic elements, and smooth micro-interactions.
- **Customization**: Fully editable categories with a curated 36-swatch palette or hex picker.
- **Lucide Icons**: Crisp, theme-aware iconography across the entire interface.

---

## Technical Architecture

The app is built using **Vanilla ES Modules**—no build step, no bundler, no heavy framework overhead.

```
index.html          — Application shell, modals, and tab containers
css/
  styles.css        — Comprehensive design system & component styles
js/
  app.js            — Orchestrator; manages state transitions and event bus
  auth.js           — Supabase authentication & session Management
  storage.js        — Unified data layer (localStorage cache + Supabase sync)
  dailylog.js       — Day grid rendering & block logging logic
  overview.js       — Dashboard summary & interactive habit chips
  stack.js          — Sunday planning & FLIP-based drag-and-drop
  review.js         — Weekly performance metrics & reflection logic
  insights.js       — Data aggregation for charts & heatmaps
  categories.js     — Category management & color systems
  habits.js         — Custom habit configuration
```

### Architectural Principles
- **Event-Driven**: Modules communicate via a custom DOM event bus (`wt:day-changed`, `wt:auth-ready`), kept clean by `app.js`.
- **Stateless Components**: Rendering logic is decoupled from data storage, making the UI reactive and predictable.
- **FLIP Animations**: Smooth drag-and-drop reordering in the Stack tab using the First-Last-Invert-Play technique.

---

## Data Model (Summary)

Each week is stored as a document in Supabase and cached locally:

```json
{
  "intention": "Weekly Goal",
  "stack": { "Work": "Finish README", "Health": "Morning Run" },
  "days": [
    {
      "mvd": true,
      "fullRest": false,
      "journal": "Productive morning, but slowed down after lunch.",
      "habits": { "meditation": true, "reading": false },
      "blocks": [
        { "category": "Dev", "duration": "2h", "energy": "high", "slot": "morning" }
      ]
    }
  ],
  "review": { "worked": "...", "didnt": "...", "adjust": "..." }
}
```

---

## Running Locally

1. Clone the repository.
2. Run a local server (required for ES Modules):
   ```bash
   # Using Python
   python -m http.server 8080
   # Using Node
   npx serve .
   ```
3. Visit `http://localhost:8080`.

---

## Roadmap

- [x] User Authentication
- [x] Cloud Persistence (Supabase)
- [x] Cross-device Sync
- [x] Custom Habit Targets
- [ ] Multi-week project goals
- [ ] Mobile-native wrapper (Capacitor/Cordova)
- [ ] Data Export (CSV/PDF)

---

## Context

This project is the first step in the **LastOne** ecosystem, focused on mastering the "vibe coding" workflow—pairing human design intuition with AI-accelerated implementation to build high-quality software with extreme speed.
