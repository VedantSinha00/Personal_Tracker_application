// ── app.js ───────────────────────────────────────────────────────────────────
// Entry point. Imports every module, wires top-level listeners, and
// bootstraps the app on page load.
//
// This is the only file that knows about all other modules. Every other
// module is deliberately unaware of its siblings — it communicates upward
// via custom events, and app.js decides what to re-render in response.

import { loadFromSupabase } from './storage.js';

import {
  load, save, wk, setWk,
  loadCats, loadTargets, saveTargetsData,
  exportD, importD, updateExportLbl,
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
  document.getElementById('wkSub').textContent =
    wk === 0 ? 'current week' :
    wk < 0   ? Math.abs(wk) + ' week' + (Math.abs(wk) > 1 ? 's' : '') + ' ago' :
               wk + ' week' + (wk > 1 ? 's' : '') + ' ahead';
}

// ── Tab switching ─────────────────────────────────────────────────────────────
let _insightsInited = false;
function swTab(id) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector(`.tab[data-tab="${id}"]`).classList.add('active');
  if (id === 'insights') {
    if (!_insightsInited) { initInsights(); _insightsInited = true; }
    else renderInsights();
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

// ── Targets modal ─────────────────────────────────────────────────────────────
function openTargetsModal() {
  const t = loadTargets();
  document.getElementById('tgtRuns').value = t.runs;
  document.getElementById('tgtRest').value = t.rest;
  document.getElementById('targetsModal').classList.add('open');
}
function closeTargetsModal() {
  document.getElementById('targetsModal').classList.remove('open');
}
function saveTargets() {
  const runs = parseInt(document.getElementById('tgtRuns').value) || 3;
  const rest = parseInt(document.getElementById('tgtRest').value) || 5;
  saveTargetsData(runs, rest);
  closeTargetsModal();
  const d = load();
  _updM(d);
  _renderOv(d);
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
function initListeners() {

  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => swTab(btn.dataset.tab));
  });

  // Week navigation
  document.querySelector('.nav-btn[data-dir="-1"]').addEventListener('click', () => chWk(-1));
  document.querySelector('.nav-btn[data-dir="1"]').addEventListener('click',  () => chWk(1));

  // Toolbar
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.querySelector('[data-action="export"]').addEventListener('click', exportD);
  document.querySelector('[data-action="import"]').addEventListener('change', importD);
  document.querySelector('[data-action="open-targets"]').addEventListener('click', openTargetsModal);
  document.querySelector('[data-action="open-habits"]').addEventListener('click', openHabitsModal);
  document.querySelector('[data-action="open-cats"]').addEventListener('click', openCatModal);
  document.querySelector('[data-action="open-help"]').addEventListener('click', openHelp);

  // Targets modal
  document.getElementById('targetsModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTargetsModal();
  });
  document.querySelector('#targetsModal .btn-p').addEventListener('click', saveTargets);
  document.querySelector('#targetsModal .btn:not(.btn-p)').addEventListener('click', closeTargetsModal);
  ['tgtRuns', 'tgtRest'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') saveTargets();
    });
  });

  // Help modal
  document.getElementById('helpModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHelp();
  });
  document.querySelector('#helpModal .btn-p').addEventListener('click', closeHelp);

  // Intention input (Stack tab)
  document.getElementById('intention').addEventListener('input', saveIntention);

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

  // Categories changed (add / delete / rename / reorder)
  document.addEventListener('wt:cats-changed', () => {
    const d = load();
    // Sync stack keys with current category names
    const cats = loadCats();
    if (!d.stack) d.stack = {};
    cats.forEach(c => { if (d.stack[c.name] === undefined) d.stack[c.name] = ''; });
    save(d);
    renderSt(d);
    _renderDG(d);
  });

  // Habits changed
  document.addEventListener('wt:habits-changed', () => {
    const d = load();
    _renderDG(d);
    _renderOv(d);
  });

  // Import complete
  document.addEventListener('wt:import-complete', () => {
    renderAll();
    updateExportLbl();
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
applyTheme();

// Wait for auth before initialising. This fires either:
//   a) immediately on page load if a session already exists (returning user)
//   b) after the user submits the login/signup form
document.addEventListener('wt:auth-ready', async () => {
  // Initialise the UI immediately with whatever is in localStorage cache.
  // This guarantees buttons and tabs are always interactive, even if the
  // Supabase fetch below is slow or stalls.
  updateWkLabel();
  updateExportLbl();
  initListeners();
  renderAll();

  // Pull latest data from Supabase in the background, then re-render.
  try {
    await loadFromSupabase();
    renderAll();
  } catch (err) {
    console.warn('[wt:auth-ready] loadFromSupabase failed:', err);
  }
}, { once: false }); // once:false so re-login after sign-out also works