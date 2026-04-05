# 🗓️ Weekly Tracker: Premium Personal Productivity (Desktop + Web)

A high-performance, aesthetically pleasing weekly planner and logger built for clarity and momentum. Seamlessly synchronize your focus across devices with **Supabase Cloud Sync** or keep it entirely local.

---

## ✨ Features

- **🚀 Smart Momentum Tracking**: A beautiful grid-based daily log that handles custom categories, timed blocks, and focus quality.
- **☁️ Cloud Sync & Recovery**: Full Supabase integration with advanced "Smart Recovery" logic to ensure your categories and missions never get lost.
- **🎯 Backlog & Agenda**: Move tasks from a long-term backlog into a focused weekly agenda with category-specific grouping.
- **🎨 Custom Categories**: Fully customizable categories with a sleek, premium dark-themed UI and per-category color coding.
- **⏲️ Stopwatch Integration**: Start focused blocks immediately with an integrated stopwatch that logs automatically once complete.
- **📊 Insights Dashboard**: Visual breakdown of your productivity, focus quality, and distribution of hours across categories.

---

## 🎨 Premium UI Experience

The application features a custom-engineered **Dark Mode** interface with:
- **Glassmorphism** overlays and sleek 1px borders.
- **Premium Dropdowns**: No native OS menus—customized, high-performance category selectors for a professional feel.
- **Gentle Micro-animations**: Fluid transitions between tabs and modals for a responsive, "alive" experience.

---

## 🛠️ Tech Stack

- **Core**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Desktop**: Electron (Frameless, Windows-optimized).
- **Database**: Supabase (PostgreSQL + Auth).
- **Styling**: Pure CSS Design System with global tokens.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/VedantSinha00/Personal_Tracker_application.git
   cd Personal_Tracker_application
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
- **Desktop App**: `npm start`
- **Web App**: Use any local server (e.g., `npx http-server .`)

### Building for Windows
To package the app into a portable installer:
```bash
npm run dist
```

---

## 🏗️ Project Structure

- `main.js`: Electron main process & Auto-updater logic.
- `preload.js`: Secure IPC bridge between Electron and the browser context.
- `index.html`: Main application entry point.
- `js/`: Core application logic (Modular state management, UI rendering).
- `css/`: Design system, global tokens, and component styles.
- `assets/`: Icons, logos, and visual assets.
- `scripts/`: Internal developer tools and build scripts.

---

## 📦 Deployment & Updates

The Desktop version includes an integrated **Auto-Updater** powered by `electron-updater`.
- New versions are automatically detected from GitHub Releases.
- One-click "Restart & Install" for a frictionless update experience.

---

*Built with ❤️ by Vedant Sinha & Antigravity AI.*
