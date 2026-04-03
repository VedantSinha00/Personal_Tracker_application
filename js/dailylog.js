// ── dailylog.js ──────────────────────────────────────────────────────────────
// Owns the Daily Log tab (day grid) and the block logging modal.
// All day-card interactions route through delegated listeners on #dayGrid.

import { FULL } from './constants.js';
import {
  load, save, loadCats, loadHabits, allHabits, wk,
} from './storage.js';
import { catC, catPalette } from './colours.js';
import { populateCatSelect } from './categories.js';
import { startTimer, stopTimer } from './timer.js';

// ── Modal state ───────────────────────────────────────────────────────────────
let editDay       = null;
let editIdx       = null;
let selFocus      = '';
let selSlot       = '';
let selSTOffset   = 0;
let isLogFromTimer = false;

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

  const blockPills = blocks.map((b, bi) => {
    const intentLine = b.intent
      ? `<div class="block-intent">${b.intent.length > 40 ? b.intent.slice(0, 40) + '…' : b.intent}</div>`
      : '';

    return `<div class="block-pill" style="${catC(b.category)}"
      data-action="open-block" data-day="${dayOffset}" data-block="${bi}">
      <div class="block-pill-top">
        <span>${b.category}${b.duration ? ' · ' + b.duration : ''}${b.slot ? ' · ' + b.slot.replace('-', ' ') : ''}</span>
      </div>
      ${intentLine}
    </div>`;
  }).join('');

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
      ${day.fullRest ? '' : `
        <div class="day-actions">
          <button class="add-btn" style="flex:1;"
            data-action="open-block" data-day="${dayOffset}" data-block="new">+ log block</button>
          ${dayOffset === ti ? `<button class="add-btn" style="flex:1;border-color:var(--accent);color:var(--accent);"
            data-action="open-start-timer" data-day="${dayOffset}">+ start</button>` : ''}
        </div>
      `}
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
      <!-- Placeholder for active timer in Daily Log -->
      <div id="dayTimer-${dayOffset}" class="day-timer-container"></div>
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
  // Safe default: if di is null (e.g. from a global stop), use today
  editDay = (di !== null && di !== undefined) ? di : todayI();
  editIdx = (bi === 'new' ? null : bi);
  selFocus      = '';
  selSlot       = '';

  const d = load();
  populateCatSelect();

  document.getElementById('mTitle').textContent =
    (editIdx !== null ? 'Edit block — ' : 'Log block — ') + FULL[editDay];
  
  isLogFromTimer = false; // Reset by default
  hideModalError('fError');

  document.getElementById('fCat').value    = '';
  document.getElementById('fIntent').value = '';
  document.getElementById('fIntentCount').textContent = '0 / 120';
  document.getElementById('fDur').value    = '';
  document.getElementById('fNotes').value  = '';
  document.getElementById('durValidation').textContent = '';
  document.getElementById('delBtn').style.display = editIdx !== null ? 'block' : 'none';

  // Section visibility
  document.getElementById('linkedTasksRow').style.display = 'none';
  document.getElementById('fLinkedTasks').innerHTML = '';

  document.querySelectorAll('.eopt').forEach(b => b.className = 'eopt');
  document.querySelectorAll('.copt').forEach(b => b.className = 'copt');
  document.querySelectorAll('.dur-chip').forEach(b => b.classList.remove('picked'));
  document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('sel-slot'));

  if (editIdx !== null) {
    const b = d.days[editDay].blocks[editIdx];
    document.getElementById('fCat').value    = b.category || '';
    document.getElementById('fIntent').value = b.intent || '';
    document.getElementById('fIntentCount').textContent = (b.intent ? b.intent.length : 0) + ' / 120';
    document.getElementById('fDur').value    = b.duration || '';
    document.getElementById('fNotes').value  = b.notes    || '';
    
    if (b.focusQuality || b.energy) _pickFocusValue(b.focusQuality || b.energy);

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
    
    // Render linked tasks if category exists
    if (b.category) _renderLinkedTasks(b.category, b.linkedTasks || []);
  }
  document.getElementById('modal').classList.add('open');
}

export function openStartTimerM(di) {
  editDay = di;
  selSTOffset = 0;
  
  // Populate categories
  const catSel = document.getElementById('stCat');
  const cats = loadCats();
  catSel.innerHTML = '<option value="">Select...</option>' + 
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  
  document.getElementById('stIntent').value = '';
  document.getElementById('stIntentCount').textContent = '0 / 120';
  document.getElementById('stLinkedTasks').innerHTML = '';
  document.getElementById('stTasksRow').style.display = 'none';

  // Reset offsets
  document.querySelectorAll('.offset-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.offset === "0");
  });
  document.getElementById('stManualOffset').value = '';
  document.getElementById('startStopwatchModal').classList.add('open');
}

export function closeStartTimerM() {
  document.getElementById('startStopwatchModal').classList.remove('open');
}

function handleTimerStopped() {
  const result = stopTimer();
  if (!result) return;
  
  // Open the standard log modal pre-filled with the timer result
  openM(result.dayIdx, 'new');
  isLogFromTimer = true; // Mark as timer result to prevent easy closing
  
  // Override fields with timer data
  document.getElementById('fCat').value = result.cat;
  document.getElementById('fIntent').value = result.intent;
  document.getElementById('fIntentCount').textContent = (result.intent ? result.intent.length : 0) + ' / 120';
  document.getElementById('fNotes').value = result.notes || '';
  
  // Convert minutes to "1h 30m" format
  const h = Math.floor(result.minutes / 60);
  const m = result.minutes % 60;
  const durStr = (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm' : (h === 0 ? '0m' : ''));
  document.getElementById('fDur').value = durStr;
  
  // Determine slot based on current time
  const hr = new Date().getHours();
  let slot = 'morning';
  if (hr < 5) slot = 'late-night';
  else if (hr < 9) slot = 'early-morning';
  else if (hr < 12) slot = 'morning';
  else if (hr < 17) slot = 'afternoon';
  else if (hr < 21) slot = 'evening';
  else slot = 'night';
  
  selSlot = slot;
  document.querySelectorAll('.time-slot').forEach(btn => {
    btn.classList.toggle('sel-slot', btn.dataset.slot === slot);
  });

  // Load tasks for this cat (pre-selecting what was picked at start)
  _renderLinkedTasks(result.cat, result.linkedTasks || []);
}

function showModalError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = msg;
    el.classList.add('visible');
  }
}

function hideModalError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

export function closeM() {
  document.getElementById('modal').classList.remove('open');
}

function _pickFocusValue(v) {
  selFocus = v;
  document.querySelectorAll('.eopt').forEach(b => {
    b.className = 'eopt';
    if (b.dataset.energy === v) b.className = 'eopt sel-' + v;
  });
}

function _renderLinkedTasks(cat, linked = [], targetId = 'fLinkedTasks', rowId = 'linkedTasksRow') {
  const d = load();
  const tasks = (d.todos && d.todos[cat]) ? d.todos[cat] : [];
  const container = document.getElementById(targetId);
  const row = document.getElementById(rowId);

  if (tasks.length === 0) {
    if (row) row.style.display = 'block'; // Still show for inline add
    container.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">No tasks in this area.</div>';
    return;
  }

  if (row) row.style.display = 'block';
  container.innerHTML = tasks.map((t, i) => {
    const isChecked = linked.some(lt => lt.cat === cat && lt.idx === i);
    return `<label class="linked-task-item">
      <input type="checkbox" data-cat="${cat}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
      <span>${t.text}</span>
    </label>`;
  }).join('');
}

export function saveBlock() {
  let cat = document.getElementById('fCat').value;
  if (!cat) cat = 'Others';

  const intentVal = document.getElementById('fIntent').value.trim().slice(0, 120);

  // Collect linked tasks
  const linkedTasks = [];
  document.querySelectorAll('#fLinkedTasks input[type="checkbox"]:checked').forEach(cb => {
    linkedTasks.push({ cat: cb.dataset.cat, idx: +cb.dataset.idx });
  });

  const block = {
    category:        cat,
    duration:        document.getElementById('fDur').value,
    slot:            selSlot || '',
    intent:          intentVal,
    focusQuality:    selFocus || null,
    linkedTasks,
    notes:           document.getElementById('fNotes').value,
    source:          'manual',
  };

  const d = load();
  if (editIdx !== null) {
    d.days[editDay].blocks[editIdx] = block;
  } else {
    d.days[editDay].blocks.push(block);
  }

  // Auto-check linked tasks (Assumed DONE if block was logged)
  if (!d.todos) d.todos = {};
  linkedTasks.forEach(lt => {
    if (d.todos[lt.cat] && d.todos[lt.cat][lt.idx]) {
      d.todos[lt.cat][lt.idx].done = true;
    }
  });

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
    const startT = e.target.closest('[data-action="open-start-timer"]');
    if (startT) {
      openStartTimerM(+startT.dataset.day);
      return;
    }
    const mvd = e.target.closest('[data-action="tog-mvd"]');
    if (mvd) { togMVD(+mvd.dataset.day); return; }

    const habit = e.target.closest('[data-action="tog-habit"]');
    if (habit) { togH(+habit.dataset.day, habit.dataset.habit); return; }

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
  const modalEl = document.getElementById('modal');
  modalEl.addEventListener('click', e => {
    if (e.target === e.currentTarget) { 
      if (isLogFromTimer) return; // Disallow closing by accident
      closeM(); 
      return; 
    }

    const eopt = e.target.closest('.eopt');
    if (eopt) { _pickFocusValue(eopt.dataset.energy); return; }

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

  // ── Start Timer Modal ──
  const startModal = document.getElementById('startStopwatchModal');
  startModal.addEventListener('click', e => {
    if (e.target === e.currentTarget) { closeStartTimerM(); return; }
    
    const chip = e.target.closest('.offset-chip');
    if (chip) {
      selSTOffset = +chip.dataset.offset;
      document.querySelectorAll('.offset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      return;
    }
    
    if (e.target.id === 'stCancelBtn') { closeStartTimerM(); return; }
    if (e.target.id === 'stStartBtn') {
      const cat = document.getElementById('stCat').value;
      const intent = document.getElementById('stIntent').value.trim();
      if (!cat) { 
        showModalError('stError', "Please select an area first."); 
        return; 
      }
      
      const manualOffset = +document.getElementById('stManualOffset').value;
      const finalOffset = manualOffset > 0 ? manualOffset : selSTOffset;
      const notes = ''; // No notes at start anymore

      // Collect linked tasks
      const linkedTasks = [];
      document.querySelectorAll('#stLinkedTasks input[type="checkbox"]:checked').forEach(cb => {
        linkedTasks.push({ cat: cb.dataset.cat, idx: +cb.dataset.idx });
      });

      startTimer(cat, intent, finalOffset, notes, linkedTasks, editDay);
      closeStartTimerM();
      return;
    }
  });

  document.getElementById('stCat').addEventListener('change', e => {
    _renderLinkedTasks(e.target.value, [], 'stLinkedTasks', 'stTasksRow');
  });

  document.getElementById('stIntent').addEventListener('input', e => {
    document.getElementById('stIntentCount').textContent = e.target.value.length + ' / 120';
  });

  document.addEventListener('wt:timer-stopped', handleTimerStopped);

  // Category change — update linked tasks
  document.getElementById('fCat').addEventListener('change', e => {
    _renderLinkedTasks(e.target.value);
  });

  // Intent char counter
  document.getElementById('fIntent').addEventListener('input', e => {
    document.getElementById('fIntentCount').textContent = e.target.value.length + ' / 120';
  });

  // Inline task addition
  document.getElementById('fNewTask').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const text = e.target.value.trim();
      const cat = document.getElementById('fCat').value || 'Others';
      if (!text) return;

      const d = load();
      if (!d.todos) d.todos = {};
      if (!d.todos[cat]) d.todos[cat] = [];
      d.todos[cat].push({ text, done: false });
      save(d);

      e.target.value = '';
      _renderLinkedTasks(cat);
      // Notify other tabs
      document.dispatchEvent(new CustomEvent('wt:stack-saved'));
    }
  });

  // Duration text input — live validation
  document.getElementById('fDur').addEventListener('input', e => validateDur(e.target));
  document.getElementById('fDur').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fNotes').focus(); }
  });
}
