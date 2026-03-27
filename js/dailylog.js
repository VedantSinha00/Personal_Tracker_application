// ── dailylog.js ──────────────────────────────────────────────────────────────
// Owns the Daily Log tab (day grid) and the block logging modal.
// All day-card interactions route through delegated listeners on #dayGrid.

import { FULL } from './constants.js';
import {
  load, save, loadCats, loadHabits, allHabits, wk,
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

export function renderDayCard(dayOffset, day, ti, customHabits) {
  const habitDots      = day.habits || {};
  const customHabitHTML = customHabits.map(h => {
    const p       = catPalette(h.color);
    const checked = !!habitDots[h.id];
    return `<label class="habit">
      <input type="checkbox" ${checked ? 'checked' : ''}
        data-action="tog-custom-habit"
        data-day="${dayOffset}" data-habit="${h.id}"
        style="accent-color:${p.css}">
      <span>${h.name}</span>
    </label>`;
  }).join('');

  const blocks = day.blocks || [];
  const isPast = (dayOffset < ti);
  const noBlocks = blocks.length === 0;

  const blockPills = blocks.map((b, bi) =>
    `<div class="block-pill" style="${catC(b.category)}"
      data-action="open-block" data-day="${dayOffset}" data-block="${bi}">
      ${b.category}${b.duration ? ' · ' + b.duration : ''}${b.slot ? ' · ' + b.slot.replace('-', ' ') : ''}
    </div>`
  ).join('');

  return `
    <div class="day-card${dayOffset === ti ? ' today' : ''}${day.fullRest ? ' fr-day' : ''}${isPast && noBlocks ? ' no-log' : ''}">
      <div class="day-top">
        <span class="day-name">${FULL[dayOffset]}</span>
        <span class="day-date">${getDayDate(dayOffset)}</span>
      </div>
      <div class="habit-row" style="flex-wrap:wrap;gap:10px 16px;">
        ${customHabitHTML}
      </div>
      <div class="blocks-stack">
        ${blockPills}
        ${noBlocks && isPast ? `<div class="missed-msg">Nothing logged</div>` : ''}
      </div>
      ${day.fullRest ? '' : `<button class="add-btn"
        data-action="open-block" data-day="${dayOffset}" data-block="new">+ log block</button>`}
      <div class="journal-toggle-row">
        <button class="journal-toggle${day.journal && day.journal.trim() ? ' has-entry' : ''}"
          data-action="toggle-journal" data-day="${dayOffset}">
          &#128221;
          ${day.journal && day.journal.trim() ? '<span class="journal-dot"></span>' : ''}
          Journal
        </button>
        <div class="journal-area" id="journal-area-${dayOffset}" style="display:none;">
          <textarea class="journal-ta"
            data-action="save-journal" data-day="${dayOffset}"
            placeholder="How did the day go? What worked, what didn&#39;t?" rows="3"
          >${day.journal || ''}</textarea>
        </div>
      </div>
      <div class="day-badges">
        ${day.fullRest ? '' : `<button class="badge-btn${day.mvd ? ' mvd-on' : ''}"
          data-action="tog-mvd" data-day="${dayOffset}">${day.mvd ? 'MVD ✓' : 'MVD'}</button>`}
        <button class="badge-btn${day.fullRest ? ' fr-on' : ''}"
          data-action="tog-habit" data-day="${dayOffset}" data-habit="fullRest">
          ${day.fullRest ? 'Full rest ✓' : 'Full rest'}
        </button>
      </div>
    </div>`;
}

// ── Day grid render ───────────────────────────────────────────────────────────
export function renderDG(d) {
  const ti           = todayI();
  const customHabits = loadHabits();

  document.getElementById('dayGrid').innerHTML = d.days.map((day, i) =>
    renderDayCard(i, day, ti, customHabits)
  ).join('');
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

  // ── Day cards — all interactions delegated to #appShell ────────
  // Listening on #appShell allows day-card interactions to work 
  // uniformly whether the card is in the Daily Log tab or the Overview tab.
  const appShell = document.getElementById('appShell');

  appShell.addEventListener('change', e => {
    const tog = e.target.closest('[data-action="tog-habit"]');
    if (tog) { togH(+tog.dataset.day, tog.dataset.habit); return; }

    const cust = e.target.closest('[data-action="tog-custom-habit"]');
    if (cust) { togCustomHabit(+cust.dataset.day, cust.dataset.habit); return; }
  });

  appShell.addEventListener('click', e => {
    const block = e.target.closest('[data-action="open-block"]');
    if (block) {
      const bi = block.dataset.block === 'new' ? 'new' : +block.dataset.block;
      openM(+block.dataset.day, bi);
      return;
    }
    const mvd = e.target.closest('[data-action="tog-mvd"]');
    if (mvd) { togMVD(+mvd.dataset.day); return; }

    const jToggle = e.target.closest('[data-action="toggle-journal"]');
    if (jToggle) {
      const area = document.getElementById(`journal-area-${jToggle.dataset.day}`);
      if (!area) return;
      const isOpen = area.style.display !== 'none';
      area.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) area.querySelector('textarea').focus();
      return;
    }
  });

  // Journal — auto-save on input + live indicator update
  appShell.addEventListener('input', e => {
    const ta = e.target.closest('[data-action="save-journal"]');
    if (!ta) return;
    const d = load();
    const dayIdx = +ta.dataset.day;
    d.days[dayIdx].journal = ta.value;
    save(d);

    // Keep the toggle button's green-dot indicator in sync with actual content
    const hasText = !!ta.value.trim();
    const toggle  = document.querySelector(
      `.journal-toggle[data-day="${dayIdx}"]`
    );
    if (toggle) {
      toggle.classList.toggle('has-entry', hasText);
      // Re-render just the dot span inside the button
      const existing = toggle.querySelector('.journal-dot');
      if (hasText && !existing) {
        const dot = document.createElement('span');
        dot.className = 'journal-dot';
        toggle.insertBefore(dot, toggle.childNodes[1]);
      } else if (!hasText && existing) {
        existing.remove();
      }
    }
  });

  // Journal — Enter collapses (already saved); Shift+Enter = line break
  appShell.addEventListener('keydown', e => {
    const ta = e.target.closest('[data-action="save-journal"]');
    if (!ta || e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    ta.blur();   // triggers focusout → collapses
  });

  // Journal — collapse when textarea loses focus (click anywhere else)
  appShell.addEventListener('focusout', e => {
    const ta = e.target.closest('[data-action="save-journal"]');
    if (!ta) return;
    // If focus is moving to the toggle button for this same day, let the click
    // handler deal with it (it will toggle open→closed).
    const toggle = document.querySelector(
      `.journal-toggle[data-day="${ta.dataset.day}"]`
    );
    if (e.relatedTarget && e.relatedTarget === toggle) return;
    const area = document.getElementById(`journal-area-${ta.dataset.day}`);
    if (area) area.style.display = 'none';
  });

  // ── Block modal — single delegated listener on the stable #modal overlay ───
  // Using one listener on #modal (which is never re-rendered) prevents the
  // time-slot, energy, and chip buttons from going dead mid-session.
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) { closeM(); return; }

    const eopt = e.target.closest('.eopt');
    if (eopt) { _pickEnergyValue(eopt.dataset.energy); return; }

    const chip = e.target.closest('.dur-chip');
    if (chip) {
      document.getElementById('fDur').value = chip.dataset.dur;
      document.querySelectorAll('.dur-chip').forEach(b => b.classList.remove('picked'));
      chip.classList.add('picked');
      document.getElementById('durValidation').textContent = '';
      return;
    }

    const slot = e.target.closest('.time-slot');
    if (slot) {
      if (selSlot === slot.dataset.slot) {
        selSlot = '';
        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));
      } else {
        selSlot = slot.dataset.slot;
        document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));
        slot.classList.add('sel-slot');
      }
      return;
    }

    if (e.target.id === 'delBtn')                    { delBlock(); return; }
    if (e.target.closest('#modal .btn-p'))           { saveBlock(); return; }
    if (e.target.closest('#modal .btn:not(.btn-p)')) { closeM();    return; }
  });

  // Duration text input — live validation
  document.getElementById('fDur').addEventListener('input', e => validateDur(e.target));
  document.getElementById('fDur').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fNotes').focus(); }
  });
}
