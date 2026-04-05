// ── Global Error Handling ────────────────────────────────────────────────────
// Catch errors early in the boot process.
window.onerror = function(msg, url, line, col, error) {
  console.error('[Global Error]', { msg, url, line, col, error });
  // If the loader is still visible, show an error message
  const loader = document.getElementById('loadingScreen');
  if (loader && loader.style.display !== 'none' && loader.style.opacity !== '0') {
    const errorEl = document.getElementById('initError');
    const contentEl = document.getElementById('loadingContent');
    if (errorEl && contentEl) {
      contentEl.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('initErrorMsg').textContent = 
        'An unexpected script error occurred. Please try refreshing the page.';
    }
  }
};

window.onunhandledrejection = function(event) {
  console.error('[Unhandled Rejection]', event.reason);
};

import { loadFromSupabase } from './storage.js';
import { getCurrentUser } from './sb.js';

import {
  load, save, wk, setWk, getAbsWk,
  loadCats, exportD, importD, updateExportLbl,
  initRealtimeSync, flushPendingSyncs
} from './storage.js';

import { renderDG as _renderDG, openM, closeM, saveBlock, delBlock,
         initDailyLogListeners, getMon } from './dailylog.js';
import { renderOv as _renderOv, initOverviewListeners } from './overview.js';
import { updM as _updM, renderReview as _renderReview,
         initReviewListeners } from './review.js';
import { renderSt, saveStackInputs, updateCarryBtn,
         initStackListeners } from './stack.js';
import { openCatModal, closeCatModal, initCategoriesListeners } from './categories.js';
import { openHabitsModal, closeHabitsModal, initHabitsListeners } from './habits.js';
import { initInsights, renderInsights } from './insights.js';
import { initBacklog, renderBacklog } from './backlog.js';

import { initTimerTick, togglePauseTimer } from './timer.js';
import { showToast } from './toast.js';

// ── Week label ────────────────────────────────────────────────────────────────
function wkLabel() {
  const m = getMon(wk);
  const s = new Date(m);
  s.setDate(m.getDate() + 6);
  const f = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return f(m) + ' — ' + f(s);
}

function updateWkLabel() {
  document.getElementById('wkLbl').textContent = wkLabel();
  
  // Format current date (Today always)
  const now = new Date();
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  
  const h1Day = document.getElementById('wkCurrentDay');
  if (h1Day) h1Day.textContent = `${dayName}, ${dayStr}`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
let _insightsInited = false;
function swTab(id) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector(`.tab[data-tab="${id}"]`).classList.add('active');
  localStorage.setItem('wt_active_tab', id);
  if (id === 'review') {
    _updM(load());
  }
  if (id === 'insights') {
    if (!_insightsInited) { initInsights(); _insightsInited = true; }
    else renderInsights();
  }

  const indicator = document.getElementById('stopwatchIndicator');
  if (indicator && indicator.dataset.active === 'true') {
    indicator.style.display = (id === 'ov') ? 'none' : 'flex';
  }
}

// ── Full re-render ────────────────────────────────────────────────────────────
function renderAll() {
  const d = load();
  document.getElementById('intention').value = d.intention || '';
  _renderReview(d);
  _renderDG(d);
  _renderOv(d);
  renderSt(d);
  updateCarryBtn(d);
  renderBacklog();
  // Refresh Lucide icons after every DOM render (icons may have been replaced)
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Week navigation ───────────────────────────────────────────────────────────
function chWk(dir) {
  setWk(wk + dir);
  updateWkLabel();
  renderAll();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('wt_theme', next);
}

function applyTheme() {
  const saved = localStorage.getItem('wt_theme') || 'light';
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeBtn').textContent = '☀️';
  }
}

// ── Help modal ────────────────────────────────────────────────────────────────
function openHelp()  { document.getElementById('helpModal').classList.add('open'); }
function closeHelp() { document.getElementById('helpModal').classList.remove('open'); }

// ── Intention save ────────────────────────────────────────────────────────────
// The intention input lives in the Stack tab HTML but its value belongs
// to the week data object — save it whenever it changes.
function saveIntention() {
  const d = load();
  d.intention = document.getElementById('intention').value;
  save(d);
}

// ── Event wiring ──────────────────────────────────────────────────────────────
let _listenersInited = false;
function initListeners() {
  if (_listenersInited) return;
  _listenersInited = true;

  // Tabs
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => swTab(btn.dataset.tab));
  });
  const savedTab = localStorage.getItem('wt_active_tab') || 'overview';
  if (document.getElementById(savedTab)) swTab(savedTab);

  // Week navigation
  document.querySelector('.nav-btn[data-dir="-1"]').addEventListener('click', () => chWk(-1));
  document.querySelector('.nav-btn[data-dir="1"]').addEventListener('click',  () => chWk(1));
  document.getElementById('wkLbl').addEventListener('click', () => {
    if (wk !== 0) {
      setWk(0);
      updateWkLabel();
      renderAll();
    }
  });

  // Toolbar
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.querySelector('[data-action="export"]').addEventListener('click', exportD);
  document.querySelector('[data-action="import"]').addEventListener('change', importD);
  document.querySelector('[data-action="open-habits"]').addEventListener('click', openHabitsModal);
  document.querySelector('[data-action="open-cats"]').addEventListener('click', openCatModal);
  document.querySelector('[data-action="open-help"]').addEventListener('click', openHelp);

  // Help modal
  document.getElementById('helpModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHelp();
  });
  document.querySelector('#helpModal .btn-p').addEventListener('click', closeHelp);

  // Intention input (Stack tab)
  document.getElementById('intention').addEventListener('input', saveIntention);

  // Timer Navbar Actions
  document.getElementById('navPauseResumeBtn').addEventListener('click', togglePauseTimer);
  document.getElementById('stopwatchStopBtn').addEventListener('click', () => {
    // Import stopTimer logic from dailylog instead of app itself to avoid circulars
    // though here we are in app.js. The plan says dailylog manages the save modal.
    document.dispatchEvent(new CustomEvent('wt:timer-stopped'));
  });

  // Module-level listeners
  initDailyLogListeners();
  initOverviewListeners();
  initReviewListeners();
  initStackListeners();
  initCategoriesListeners();
  initHabitsListeners();

  // ── Custom event bus ───────────────────────────────────────────────────────
  // Modules fire these events instead of calling render functions directly.
  // app.js is the only place that knows what needs re-rendering after each.

  // Any day data changed (habit toggle, block add/edit/delete)
  document.addEventListener('wt:day-changed', () => {
    const d = load();
    _renderDG(d);
    _renderOv(d);
    _updM(d);
    renderSt(d);
    renderBacklog();
  });

  // Toggling a built-in habit from the Overview panel
  document.addEventListener('wt:tog-habit', e => {
    const d = load();
    d.days[e.detail.day][e.detail.habit] = !d.days[e.detail.day][e.detail.habit];
    if (e.detail.habit === 'fullRest' && d.days[e.detail.day].fullRest)
      d.days[e.detail.day].mvd = false;
    save(d);
    _renderDG(d); _renderOv(d); _updM(d);
  });

  // Toggling a custom habit from the Overview panel
  document.addEventListener('wt:tog-custom-habit', e => {
    const d = load();
    if (!d.days[e.detail.day].habits) d.days[e.detail.day].habits = {};
    d.days[e.detail.day].habits[e.detail.habit] = !d.days[e.detail.day].habits[e.detail.habit];
    save(d);
    _renderDG(d); _renderOv(d); _updM(d);
  });

  // Categories changed (add / delete / rename / reorder / visibility)
  document.addEventListener('wt:cats-changed', () => {
    const d = load();
    // Sync stack keys with current category names
    const cats = loadCats();
    if (!d.stack) d.stack = {};
    cats.forEach(c => { if (d.stack[c.name] === undefined) d.stack[c.name] = ''; });
    save(d);
    renderSt(d);
    _renderDG(d);
    _renderOv(d);   // keep Overview in sync when categories change
    _updM(d);       // instantly update metrics (Total Hours/Blocks) in Review tab
    if (_insightsInited) renderInsights(); // instantly update Insights graphs
  });

  // Stack inputs saved — overview should reflect updated focus text immediately
  document.addEventListener('wt:stack-saved', () => {
    const d = load();
    _renderOv(d);
  });

  // Habits changed
  document.addEventListener('wt:habits-changed', () => {
    const d = load();
    _renderDG(d);
    _renderOv(d);
    _updM(d);
  });

  // Import complete
  document.addEventListener('wt:import-complete', () => {
    renderAll();
    updateExportLbl();
  });

  // Backlog changed (pull / push)
  document.addEventListener('wt:backlog-changed', () => {
    const d = load();
    renderSt(d);
    _renderOv(d); // Refresh overview to reflect the new stack items
  });

  // Remote data changed via Supabase Realtime
  document.addEventListener('wt:remote-change', (e) => {
    console.log('[sync] Remote change detected:', e.detail.type);
    
    // If the change was for the current week, or was a global change (cats, habits),
    // we should re-render the whole app.
    if (e.detail.type === 'week' && e.detail.offset !== getAbsWk(wk)) {
       // Change is for a different week, no need to re-render current view
       return;
    }
    
    renderAll();
    
    // Special case: if timer changed, we might need to restart/stop the timer tick
    if (e.detail.type === 'timer') {
      initTimerTick();
    }
  });

  // Durable sync on exit (especially for Electron)
  window.addEventListener('beforeunload', () => {
    flushPendingSyncs();
  });

  console.log('[initListeners] complete');
}

// ── Auto Update UI ────────────────────────────────────────────────────────────
let _updaterInitialized = false;

function initUpdateListeners() {
  if (!window.electronAPI || _updaterInitialized) return;
  _updaterInitialized = true;

  window.electronAPI.onUpdateAvailable((info) => {
    showToast(`Update v${info.version} is available. Downloading...`, 'info', 6000);
  });

  window.electronAPI.onUpdateDownloaded((info) => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'wt-toast toast-success visible';
    toast.style.pointerEvents = 'auto'; // Ensure clicks work
    toast.innerHTML = `
      <i data-lucide="download" style="width:16px;height:16px;"></i>
      <div style="flex:1;">
        <div style="font-weight:600;">Update Ready</div>
        <div style="font-size:11px; opacity:0.8;">v${info.version} is ready to install.</div>
      </div>
      <button id="updateRestartBtn" class="btn btn-p" style="padding:4px 10px; font-size:11px;">Restart</button>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons({ root: toast });

    const btn = toast.querySelector('#updateRestartBtn');
    btn.addEventListener('click', () => {
      window.electronAPI.restartAndInstall();
    });
  });

  window.electronAPI.onUpdateError((err) => {
    console.warn('[updater] Error:', err);
    // Don't toast errors to users unless they are fatal
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
if (window.electronAPI) {
  document.body.classList.add('is-electron');
}
applyTheme();

// ── Auth-ready handler ────────────────────────────────────────────────────────
// Extracted as a named function so it can be called both from the event listener
// AND directly when app.js loads after the event already fired (CDN race condition).
let _appInited = false;
async function handleAuthReady() {
  if (_appInited) return;   // guard against double-init on fast networks
  _appInited = true;

  updateWkLabel();
  updateExportLbl();
  initListeners();
  initUpdateListeners(); // Start listening for app updates
  initTimerTick(); // Resume timer if running
  renderAll();

  // Pull latest data from Supabase in the background, then re-render.
  try {
    await loadFromSupabase();
    initRealtimeSync(); // Start listening for future changes
    renderAll();
  } catch (err) {
    console.warn('[wt:auth-ready] loadFromSupabase failed:', err);
  }
}

// Listen for the event — covers the login / re-login path.
// once:false so re-login after sign-out + re-login also works.
document.addEventListener('wt:auth-ready', () => {
  _appInited = false;   // allow re-init on sign-out + re-login
  handleAuthReady();
}, { once: false });

// Race-condition fix for page refresh over a CDN:
// auth.js (small file) may resolve getSession() and fire wt:auth-ready before
// app.js and its many dependencies finish downloading. In that case the event
// is missed. We detect this by checking getCurrentUser() — auth.js sets it
// synchronously before dispatching the event, so if it is non-null here, the
// event already fired and we must initialise the app ourselves.
if (getCurrentUser()) {
  // Schedule on next tick so the DOM is fully parsed and module evaluation is
  // fully complete before we touch the UI.
  setTimeout(handleAuthReady, 0);
}