// ── review.js ────────────────────────────────────────────────────────────────
// Owns the Review tab — the three reflection textareas and the
// metrics bar (runs / blocks / rest) that summarises the week.

import { load, save, loadCats, allHabits } from './storage.js';
import { parseDuration } from './dailylog.js';

// ── Metrics update ────────────────────────────────────────────────────────────
// Called after any data change so the bar chart at the top of Review stays
// in sync with whatever is logged in the daily grid.
export function updM(d) {
  const allH = allHabits();
  const cats = loadCats();
  const hiddenCats = new Set(cats.filter(c => c.hidden).map(c => c.name));

  console.log('[updM] Aggregating week data...', { habits: allH.map(h => h.name), days: d.days.length });

  // ── Habit Achievements ──
  const habitStats = allH.map(h => {
    let count = 0;
    d.days.forEach((day, i) => {
      // Robust check: match by ID, Exact Name, or Case-Insensitive Name
      let done = false;
      if (day.habits) {
        if (day.habits[h.id]) done = true;
        else if (day.habits[h.name]) done = true;
        else {
          // Check all keys for a case-insensitive match
          const keys = Object.keys(day.habits);
          const lowerName = h.name.toLowerCase();
          if (keys.some(k => k.toLowerCase() === lowerName)) done = true;
        }
      }
      
      if (h.id === 'rest') {
        if (done || day.fullRest) count++;
      } else {
        if (done) count++;
      }
    });
    return { ...h, count };
  });

  console.log('[updM] Aggregated habit counts:', habitStats.map(s => `${s.name}: ${s.count}`));

  const habitHTML = habitStats.map(h => {
    const target = h.target || 0;
    const pct    = target > 0 ? Math.min(100, Math.round(h.count / target * 100)) : 0;
    const color  = h.color || 'var(--accent)';

    return `
      <div class="rv-habit-row">
        <div class="rv-habit-info">
          <span class="rv-habit-lbl">${h.name.toUpperCase()}</span>
          <span class="rv-habit-val">${h.count}${target ? ' / ' + target : ''}</span>
        </div>
        <div class="rv-habit-bar-bg">
          <div class="rv-habit-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
      </div>`;
  }).join('');

  const habitsList = document.getElementById('rvHabitsList');
  if (habitsList) habitsList.innerHTML = habitHTML;

  // ── Core Stats ──
  let blks = 0;
  let hrs  = 0;
  let allBlocks = [];
  d.days.forEach(day => {
    if (!day.blocks) return;
    day.blocks.forEach(b => {
      if (!hiddenCats.has(b.category)) {
        blks++;
        hrs += parseDuration(b.duration);
        allBlocks.push(b);
      }
    });
  });

  const avg = blks > 0 ? (hrs / blks) : 0;

  function focusMultiplier(q) {
    if (q === 'high')   return 1.0;
    if (q === 'medium') return 0.6;
    if (q === 'low')    return 0.3;
    return 0.8;
  }


  const weightedTotal = allBlocks.reduce((sum, b) => sum + parseDuration(b.duration) * focusMultiplier(b.focusQuality || b.energy), 0);

  const coreStats = [
    { id: 'whrs', label: 'WEIGHTED HOURS', value: (Math.round(weightedTotal * 10) / 10) + 'h', color: 'var(--purple)' },
    { id: 'blks', label: 'WORK BLOCKS', value: blks, color: 'var(--blue)' },
    { id: 'hrs',  label: 'TOTAL HOURS', value: (Math.round(hrs * 10) / 10) + 'h', color: 'var(--amber)' },
    { id: 'avg',  label: 'AVG BLOCK',   value: (Math.round(avg * 10) / 10) + 'h', color: 'var(--text2)' },
  ];

  const statsGrid = document.getElementById('rvCoreStats');
  if (statsGrid) {
    statsGrid.innerHTML = coreStats.map(s => `
      <div class="rv-stat-card">
        <div class="rv-stat-val" style="color:${s.color}">${s.value}</div>
        <div class="rv-stat-lbl">${s.label}</div>
      </div>
    `).join('');
  }

  // ── Legacy Fallback (for stale index.html) ──
  // If the user has an old HTML file, update the old IDs so they still see results.
  const legacyMap = {
    'rvR':  habitStats.find(h => h.id === 'run'),
    'rvRt': habitStats.find(h => h.id === 'rest'),
    'rvB':  { value: blks },
    'rvH':  { value: (Math.round(hrs * 10) / 10) + 'h' }
  };

  Object.entries(legacyMap).forEach(([id, data]) => {
    const el = document.getElementById(id);
    if (el && data) {
      if (id === 'rvR' || id === 'rvRt') {
        el.textContent = `${data.count} / ${data.target || 5}`;
        const bar = document.getElementById(id + 'b');
        if (bar) bar.style.width = Math.min(100, Math.round(data.count / (data.target || 5) * 100)) + '%';
      } else {
        el.textContent = data.value;
        const bar = document.getElementById(id + 'b');
        if (bar) bar.style.width = '100%'; // fallback simple bar
      }
    }
  });
}

// ── Save review fields ────────────────────────────────────────────────────────
function saveReview() {
  const d = load();
  d.review        = d.review || {};
  d.review.worked = document.getElementById('rvW').value;
  d.review.didnt  = document.getElementById('rvD').value;
  d.review.adjust = document.getElementById('rvA').value;
  save(d);
}

// ── Populate review textareas from saved data ─────────────────────────────────
export function renderReview(d) {
  const rv = d.review || {};
  document.getElementById('rvW').value = rv.worked  || '';
  document.getElementById('rvD').value = rv.didnt   || '';
  document.getElementById('rvA').value = rv.adjust  || '';
  updM(d);
}

// ── Event wiring ──────────────────────────────────────────────────────────────
export function initReviewListeners() {
  ['rvW', 'rvD', 'rvA'].forEach(id => {
    document.getElementById(id).addEventListener('input', saveReview);
  });
}
