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

  const runH = allH.find(h => h.id === 'run') || { target: 3 };
  const restH = allH.find(h => h.id === 'rest') || { target: 5 };

  const runs = d.days.filter(x => x.habits && x.habits.run).length;
  const rest = d.days.filter(x => x.habits && x.habits.rest).length;

  let blks = 0;
  let hrs  = 0;
  d.days.forEach(day => {
    if (!day.blocks) return;
    day.blocks.forEach(b => {
      if (!hiddenCats.has(b.category)) {
        blks++;
        hrs += parseDuration(b.duration);
      }
    });
  });

  const pct  = (v, tgt) => Math.min(100, Math.round(v / tgt * 100)) + '%';

  const rvR   = document.getElementById('rvR');
  const rvB   = document.getElementById('rvB');
  const rvRt  = document.getElementById('rvRt');
  const rvH   = document.getElementById('rvH');
  const rvRb  = document.getElementById('rvRb');
  const rvBb  = document.getElementById('rvBb');
  const rvRtb = document.getElementById('rvRtb');
  const rvHb  = document.getElementById('rvHb');

  if (rvR)   rvR.textContent    = runs + ' / ' + runH.target;
  if (rvB)   rvB.textContent    = blks;
  if (rvRt)  rvRt.textContent   = rest + ' / ' + restH.target;
  if (rvH)   rvH.textContent    = (Math.round(hrs * 10) / 10) + 'h';
  if (rvRb)  rvRb.style.width   = pct(runs, runH.target);
  if (rvBb)  rvBb.style.width   = Math.min(100, blks * 10) + '%';
  if (rvRtb) rvRtb.style.width  = pct(rest, restH.target);
  if (rvHb)  rvHb.style.width   = Math.min(100, hrs * (100 / 40)) + '%'; // 40 hours = full bar context
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
