// ── review.js ────────────────────────────────────────────────────────────────
// Owns the Review tab — the three reflection textareas and the
// metrics bar (runs / blocks / rest) that summarises the week.

import { load, save, loadTargets } from './storage.js';

// ── Metrics update ────────────────────────────────────────────────────────────
// Called after any data change so the bar chart at the top of Review stays
// in sync with whatever is logged in the daily grid.
export function updM(d) {
  const t    = loadTargets();
  const runs = d.days.filter(x => x.run).length;
  const blks = d.days.reduce((a, x) => a + x.blocks.length, 0);
  const rest = d.days.filter(x => x.rest).length;
  const pct  = (v, tgt) => Math.min(100, Math.round(v / tgt * 100)) + '%';

  const rvR   = document.getElementById('rvR');
  const rvB   = document.getElementById('rvB');
  const rvRt  = document.getElementById('rvRt');
  const rvRb  = document.getElementById('rvRb');
  const rvBb  = document.getElementById('rvBb');
  const rvRtb = document.getElementById('rvRtb');

  if (rvR)   rvR.textContent    = runs + ' / ' + t.runs;
  if (rvB)   rvB.textContent    = blks;
  if (rvRt)  rvRt.textContent   = rest + ' / ' + t.rest;
  if (rvRb)  rvRb.style.width   = pct(runs, t.runs);
  if (rvBb)  rvBb.style.width   = Math.min(100, blks * 10) + '%';
  if (rvRtb) rvRtb.style.width  = pct(rest, t.rest);
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
