// ── dailylog.js ──────────────────────────────────────────────────────────────
// Owns the Daily Log tab (day grid) and the block logging modal.
// All day-card interactions route through delegated listeners on #dayGrid.

import { FULL } from './constants.js';
import {
  load, save, loadCats, loadHabits, allHabits,
  loadTargets, wk,
} from './storage.js';
import { catC, catPalette } from './colours.js';
import { populateCatSelect } from './categories.js';

// ── Modal state ───────────────────────────────────────────────────────────────
let editDay  = null;
let editIdx  = null;
let selE     = '';
let selSlot  = '';

// ── Helpers ───────────────────────────────────────────────────────────────────
export function parseDuration(str) {
  if (!str) return 0;
  const s = str.toLowerCase().trim();
  const hrM  = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const minM = s.match(/(\d+(?:\.\d+)?)\s*m/);
  let h = 0;
  if (hrM)  h += parseFloat(hrM[1]);
  if (minM) h += parseFloat(minM[1]) / 60;
  return h;
}

export function getDayDate(i) {
  const m = getMon(wk);
  const d = new Date(m);
  d.setDate(m.getDate() + i);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// getMon is also needed by insights — kept here and re-exported
export function getMon(o) {
  const d  = new Date();
  const dy = d.getDay();
  d.setDate(d.getDate() + (dy === 0 ? -6 : 1 - dy) + o * 7);
  return d;
}

export function todayI() {
  if (wk !== 0) return -1;
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

// ── Day grid render ───────────────────────────────────────────────────────────
export function renderDG(d) {
  const ti           = todayI();
  const customHabits = loadHabits();

  document.getElementById('dayGrid').innerHTML = d.days.map((day, i) => {
    const habitDots      = day.habits || {};
    const customHabitHTML = customHabits.map(h => {
      const p       = catPalette(h.color);
      const checked = !!habitDots[h.id];
      return `<label class="habit">
        <input type="checkbox" ${checked ? 'checked' : ''}
          data-action="tog-custom-habit"
          data-day="${i}" data-habit="${h.id}"
          style="accent-color:${p.css}">
        <span>${h.name}</span>
      </label>`;
    }).join('');

    const blockPills = day.blocks.map((b, bi) =>
      `<div class="block-pill" style="${catC(b.category)}"
        data-action="open-block" data-day="${i}" data-block="${bi}">
        ${b.category}${b.duration ? ' · ' + b.duration : ''}${b.slot ? ' · ' + b.slot.replace('-', ' ') : ''}
      </div>`
    ).join('');

    return `
      <div class="day-card${i === ti ? ' today' : ''}${day.fullRest ? ' fr-day' : ''}">
        <div class="day-top">
          <span class="day-name">${FULL[i]}</span>
          <span class="day-date">${getDayDate(i)}</span>
        </div>
        <div class="habit-row" style="flex-wrap:wrap;gap:10px 16px;">
          <label class="habit">
            <input type="checkbox" ${day.run ? 'checked' : ''}
              data-action="tog-habit" data-day="${i}" data-habit="run">
            <span>Run</span>
          </label>
          <label class="habit">
            <input type="checkbox" ${day.rest ? 'checked' : ''}
              data-action="tog-habit" data-day="${i}" data-habit="rest">
            <span>Rest</span>
          </label>
          ${customHabitHTML}
        </div>
        <div class="blocks-stack">${blockPills}</div>
        ${day.fullRest ? '' : `<button class="add-btn"
          data-action="open-block" data-day="${i}" data-block="new">+ log block</button>`}
        <div class="day-badges">
          ${day.fullRest ? '' : `<button class="badge-btn${day.mvd ? ' mvd-on' : ''}"
            data-action="tog-mvd" data-day="${i}">${day.mvd ? 'MVD ✓' : 'MVD'}</button>`}
          <button class="badge-btn${day.fullRest ? ' fr-on' : ''}"
            data-action="tog-habit" data-day="${i}" data-habit="fullRest">
            ${day.fullRest ? 'Full rest ✓' : 'Full rest'}
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── Habit + MVD toggles ───────────────────────────────────────────────────────
function togH(dayIdx, habit) {
  const d = load();
  d.days[dayIdx][habit] = !d.days[dayIdx][habit];
  if (habit === 'fullRest' && d.days[dayIdx].fullRest) d.days[dayIdx].mvd = false;
  save(d);
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

function togMVD(dayIdx) {
  const d = load();
  if (d.days[dayIdx].fullRest) return;
  d.days[dayIdx].mvd = !d.days[dayIdx].mvd;
  save(d);
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

function togCustomHabit(dayIdx, habitId) {
  const d = load();
  if (!d.days[dayIdx].habits) d.days[dayIdx].habits = {};
  d.days[dayIdx].habits[habitId] = !d.days[dayIdx].habits[habitId];
  save(d);
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

// ── Block modal ───────────────────────────────────────────────────────────────
export function openM(di, bi) {
  editDay  = di;
  editIdx  = bi === 'new' ? null : bi;
  selE     = '';
  selSlot  = '';

  const d = load();
  populateCatSelect();

  document.getElementById('mTitle').textContent =
    (editIdx !== null ? 'Edit block — ' : 'Log block — ') + FULL[di];
  document.getElementById('fCat').value   = '';
  document.getElementById('fDur').value   = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('durValidation').textContent = '';
  document.getElementById('delBtn').style.display = editIdx !== null ? 'block' : 'none';

  document.querySelectorAll('.eopt').forEach(b => b.className = 'eopt');
  document.querySelectorAll('.dur-chip').forEach(b => b.classList.remove('picked'));
  document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));

  if (editIdx !== null) {
    const b = d.days[di].blocks[editIdx];
    document.getElementById('fCat').value   = b.category || '';
    document.getElementById('fDur').value   = b.duration || '';
    document.getElementById('fNotes').value = b.notes    || '';
    if (b.energy) _pickEnergyValue(b.energy);
    if (b.slot) {
      selSlot = b.slot;
      document.querySelectorAll('.time-slot').forEach(btn => {
        if (btn.dataset.slot === b.slot) btn.classList.add('sel-slot');
      });
    }
    if (b.duration) {
      document.querySelectorAll('.dur-chip').forEach(btn => {
        if (btn.dataset.dur === b.duration) btn.classList.add('picked');
      });
    }
  }
  document.getElementById('modal').classList.add('open');
}

export function closeM() {
  document.getElementById('modal').classList.remove('open');
}

function _pickEnergyValue(v) {
  selE = v;
  document.querySelectorAll('.eopt').forEach(b => {
    b.className = 'eopt';
    if (b.dataset.energy === v) b.className = 'eopt sel-' + v;
  });
}

export function saveBlock() {
  const cat = document.getElementById('fCat').value;
  if (!cat) { closeM(); return; }
  const block = {
    category: cat,
    duration: document.getElementById('fDur').value,
    energy:   selE,
    notes:    document.getElementById('fNotes').value,
    slot:     selSlot || '',
  };
  const d = load();
  if (editIdx !== null) d.days[editDay].blocks[editIdx] = block;
  else                  d.days[editDay].blocks.push(block);
  save(d);
  closeM();
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

export function delBlock() {
  if (editIdx === null) return;
  const d = load();
  d.days[editDay].blocks.splice(editIdx, 1);
  save(d);
  closeM();
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

// ── Duration helpers ──────────────────────────────────────────────────────────
function validateDur(input) {
  document.querySelectorAll('.dur-chip').forEach(b => b.classList.remove('picked'));
  const val = input.value.trim();
  document.getElementById('durValidation').textContent =
    val && parseDuration(val) === 0
      ? 'Unrecognised format — try "45m", "1h", or "1h 30m"'
      : '';
}

// ── Event wiring ──────────────────────────────────────────────────────────────
export function initDailyLogListeners() {

  // ── Day grid — all interactions delegated to one container listener ────────
  // This is the key pattern for dynamically generated content.
  // Instead of attaching listeners to each card/button/checkbox as they're
  // created, one listener on the stable #dayGrid parent catches everything.
  document.getElementById('dayGrid').addEventListener('change', e => {
    const tog = e.target.closest('[data-action="tog-habit"]');
    if (tog) { togH(+tog.dataset.day, tog.dataset.habit); return; }

    const cust = e.target.closest('[data-action="tog-custom-habit"]');
    if (cust) { togCustomHabit(+cust.dataset.day, cust.dataset.habit); return; }
  });

  document.getElementById('dayGrid').addEventListener('click', e => {
    const block = e.target.closest('[data-action="open-block"]');
    if (block) {
      const bi = block.dataset.block === 'new' ? 'new' : +block.dataset.block;
      openM(+block.dataset.day, bi);
      return;
    }
    const mvd = e.target.closest('[data-action="tog-mvd"]');
    if (mvd) { togMVD(+mvd.dataset.day); return; }
  });

  // ── Block modal ────────────────────────────────────────────────────────────
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeM();
  });

  // Energy buttons — use data-energy attribute
  document.querySelector('.erow').addEventListener('click', e => {
    const btn = e.target.closest('.eopt');
    if (btn) _pickEnergyValue(btn.dataset.energy);
  });

  // Duration quick-pick chips — use data-dur attribute
  document.querySelector('.dur-chips').addEventListener('click', e => {
    const chip = e.target.closest('.dur-chip');
    if (!chip) return;
    document.getElementById('fDur').value = chip.dataset.dur;
    document.querySelectorAll('.dur-chip').forEach(b => b.classList.remove('picked'));
    chip.classList.add('picked');
    document.getElementById('durValidation').textContent = '';
  });

  // Time slot buttons — use data-slot attribute
  document.querySelector('.time-slots').addEventListener('click', e => {
    const btn = e.target.closest('.time-slot');
    if (!btn) return;
    if (selSlot === btn.dataset.slot) {
      selSlot = '';
      document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));
      return;
    }
    selSlot = btn.dataset.slot;
    document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));
    btn.classList.add('sel-slot');
  });

  // Duration text input — live validation
  document.getElementById('fDur').addEventListener('input', e => validateDur(e.target));
  document.getElementById('fDur').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fNotes').focus(); }
  });

  // Save / Cancel / Delete buttons
  document.querySelector('#modal .btn-p').addEventListener('click', saveBlock);
  document.querySelector('#modal .btn:not(.btn-p)').addEventListener('click', closeM);
  document.getElementById('delBtn').addEventListener('click', delBlock);
}
