// ── dailylog.js ──────────────────────────────────────────────────────────────
// Owns the Daily Log tab (day grid) and the block logging modal.
// All day-card interactions route through delegated listeners on #dayGrid.

import { FULL } from './constants.js';
import {
  load, save, loadCats, loadHabits, allHabits, wk, loadTimer,
} from './storage.js';
import { catC, catPalette } from './colours.js';
import { populateCatSelect } from './categories.js';
import { syncCustomSelect } from './custom-select.js';
import { startTimer, stopTimer, togglePauseTimer } from './timer.js';

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

    return `<div class="block-pill" style="${catC(b.category)}" draggable="true"
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
        <!-- Placeholder for active timer in Daily Log -->
        <div id="dayTimer-${dayOffset}" class="day-timer-container day-timer-target" data-day="${dayOffset}"></div>
      </div>
      ${day.fullRest ? '' : `
        <div class="day-actions">
          <button class="add-btn" style="flex:1;"
            data-action="open-block" data-day="${dayOffset}" data-block="new">Add entry +</button>
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
        <div class="journal-area" style="display:none;">
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
  // Safe default: if di is null (e.g. from a global stop), use today
  editDay = (di !== null && di !== undefined) ? di : todayI();
  editIdx = (bi === 'new' ? null : bi);
  selFocus      = '';
  selSlot       = '';

  const d = load();
  populateCatSelect();

  document.getElementById('mTitle').textContent =
    (editIdx !== null ? 'Edit entry — ' : 'New entry — ') + FULL[editDay];
  
  isLogFromTimer = false; // Reset by default
  hideModalError('fError');

  document.getElementById('fCat').value    = '';
  document.getElementById('fIntent').value = '';
  document.getElementById('fIntentCount').textContent = '0 / 300';
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
    document.getElementById('fIntentCount').textContent = (b.intent ? b.intent.length : 0) + ' / 300';
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
  document.body.classList.add('modal-open');
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
  document.getElementById('stIntentCount').textContent = '0 / 300';
  document.getElementById('stLinkedTasks').innerHTML = '';
  document.getElementById('stNewTask').value = '';
  document.getElementById('stTasksRow').style.display = 'none';

  // Reset offsets
  document.querySelectorAll('.offset-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.offset === "0");
  });
  document.getElementById('stManualOffset').value = '';
  document.body.classList.add('modal-open');
  document.getElementById('startStopwatchModal').classList.add('open');
  syncCustomSelect(document.getElementById('stCat'));
}

export function closeStartTimerM() {
  document.body.classList.remove('modal-open');
  document.getElementById('startStopwatchModal').classList.remove('open');
}

function handleTimerStopped() {
  const result = stopTimer(true);
  if (!result) return;
  
  const today = new Date().getDay();
  const ti = today === 0 ? 6 : today - 1;

  // Open the standard log modal pre-filled with the timer result
  openM(ti, 'new');
  isLogFromTimer = true; // Mark as timer result to prevent easy closing
  
  // Override fields with timer data
  const fCatEl = document.getElementById('fCat');
  fCatEl.value = result.cat;
  syncCustomSelect(fCatEl); // refresh the custom dropdown trigger to show the pre-filled category
  document.getElementById('fIntent').value = result.intent;
  document.getElementById('fIntentCount').textContent = (result.intent ? result.intent.length : 0) + ' / 300';
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
  document.body.classList.remove('modal-open');
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
  const html = tasks.map((t, i) => {
    const isLinked = linked.some(lt => lt.cat === cat && lt.idx === i);
    if (t.done && !isLinked) return '';
    
    const isChecked = t.done || isLinked;
    return `<label class="linked-task-item">
      <input type="checkbox" data-cat="${cat}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
      <span ${t.done ? 'style="text-decoration:line-through;color:var(--text3);"' : ''}>${t.text}</span>
    </label>`;
  }).filter(Boolean).join('');

  container.innerHTML = html || '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">No pending tasks in this area.</div>';
}

export function saveBlock() {
  let cat = document.getElementById('fCat').value;
  if (!cat) cat = 'Others';

  const intentVal = document.getElementById('fIntent').value.trim().slice(0, 300);

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
  const dayBlocks = d.days[editDay].blocks;
  if (editIdx !== null) {
    dayBlocks[editIdx] = block;
  } else {
    dayBlocks.push(block);
  }

  const SLOT_VALS = { 'early-morning': 1, 'morning': 2, 'afternoon': 3, 'evening': 4, 'night': 5, 'late-night': 6 };
  dayBlocks.sort((a, b) => (SLOT_VALS[a.slot] || 99) - (SLOT_VALS[b.slot] || 99));

  if (isLogFromTimer) {
    stopTimer(false);
    isLogFromTimer = false;
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

  // --- DRAG AND DROP FOR BLOCKS ---
  let draggedBlock = null;

  appShell.addEventListener('dragstart', e => {
    const pill = e.target.closest('.block-pill');
    if (!pill) return;
    draggedBlock = { day: +pill.dataset.day, idx: +pill.dataset.block, el: pill };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { pill.style.opacity = '0.5'; }, 0);
  });

  appShell.addEventListener('dragover', e => {
    const pill = e.target.closest('.block-pill');
    if (!pill || !draggedBlock) return;
    if (draggedBlock.day !== +pill.dataset.day) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    appShell.querySelectorAll('.block-pill').forEach(el => el.style.borderTop = '');
    pill.style.borderTop = '2px solid var(--text)';
  });

  appShell.addEventListener('dragleave', e => {
    const pill = e.target.closest('.block-pill');
    if (pill) pill.style.borderTop = '';
  });

  appShell.addEventListener('dragend', e => {
    if (draggedBlock && draggedBlock.el) draggedBlock.el.style.opacity = '1';
    appShell.querySelectorAll('.block-pill').forEach(el => el.style.borderTop = '');
    draggedBlock = null;
  });

  appShell.addEventListener('drop', e => {
    const pill = e.target.closest('.block-pill');
    if (!pill || !draggedBlock) return;
    if (draggedBlock.day !== +pill.dataset.day) return; 
    e.preventDefault();
    
    appShell.querySelectorAll('.block-pill').forEach(el => el.style.borderTop = '');
    
    const d = load();
    const blocks = d.days[draggedBlock.day].blocks;
    const fromIdx = draggedBlock.idx;
    const toIdx = +pill.dataset.block;
    
    if (fromIdx === toIdx) return;
    
    const [movedBlock] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, movedBlock);
    
    save(d);
    document.dispatchEvent(new CustomEvent('wt:day-changed'));
  });

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

    const tAction = e.target.closest('[data-action="timer-action"]');
    if (tAction) {
      // Prevent bubbling to open-block if clicked directly inside a card
      e.stopPropagation();
      if (tAction.dataset.type === 'pause') {
        togglePauseTimer();
      } else if (tAction.dataset.type === 'stop') {
        document.dispatchEvent(new CustomEvent('wt:timer-stopped'));
      }
      return;
    }

    const mvd = e.target.closest('[data-action="tog-mvd"]');
    if (mvd) { togMVD(+mvd.dataset.day); return; }

    const habit = e.target.closest('[data-action="tog-habit"]');
    if (habit) { togH(+habit.dataset.day, habit.dataset.habit); return; }

    const jToggle = e.target.closest('[data-action="toggle-journal"]');
    if (jToggle) {
      const area = jToggle.parentElement.querySelector('.journal-area');
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
    const toggles = document.querySelectorAll(`.journal-toggle[data-day="${dayIdx}"]`);
    toggles.forEach(toggle => {
      toggle.classList.toggle('has-entry', hasText);
      const existing = toggle.querySelector('.journal-dot');
      if (hasText && !existing) {
        const dot = document.createElement('span');
        dot.className = 'journal-dot';
        toggle.insertBefore(dot, toggle.childNodes[1]);
      } else if (!hasText && existing) {
        existing.remove();
      }
    });
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
    
    const row = ta.closest('.journal-toggle-row');
    const toggle = row ? row.querySelector('.journal-toggle') : null;
    
    // If focus is moving to the toggle button for this same day, let the click
    // handler deal with it (it will toggle open→closed).
    if (e.relatedTarget && e.relatedTarget === toggle) return;
    
    const area = ta.closest('.journal-area');
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

    if (e.target.closest('#delBtn'))                  { delBlock(); return; }
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
    
    if (e.target.closest('#stCancelBtn')) { closeStartTimerM(); return; }
    if (e.target.closest('#stStartBtn')) {
      if (loadTimer()) {
        showModalError('stError', 'A stopwatch is already running. Stop it before starting a new one.');
        return;
      }

      const cat = document.getElementById('stCat').value;
      const intent = document.getElementById('stIntent').value.trim();
      if (!cat) {
        showModalError('stError', "Please select an area first.");
        return;
      }

      const manualOffset = +document.getElementById('stManualOffset').value;
      const finalOffset = manualOffset > 0 ? manualOffset : selSTOffset;
      const notes = ''; // No notes at start anymore

      // Collect linked tasks from checked boxes
      const linkedTasks = [];
      document.querySelectorAll('#stLinkedTasks input[type="checkbox"]:checked').forEach(cb => {
        linkedTasks.push({ cat: cb.dataset.cat, idx: +cb.dataset.idx });
      });

      // Save new task if provided and auto-link it to this session
      const newTaskInput = document.getElementById('stNewTask');
      if (newTaskInput && newTaskInput.value.trim()) {
        const newTaskText = newTaskInput.value.trim();
        const d = load();
        if (!d.todos) d.todos = {};
        if (!d.todos[cat]) d.todos[cat] = [];
        const newIdx = d.todos[cat].length;
        d.todos[cat].push({ text: newTaskText, done: false });
        save(d);
        newTaskInput.value = '';
        linkedTasks.push({ cat, idx: newIdx });
        document.dispatchEvent(new CustomEvent('wt:day-changed'));
      }

      startTimer(cat, intent, finalOffset, notes, linkedTasks, editDay);
      closeStartTimerM();
      return;
    }
  });

  document.getElementById('stCat').addEventListener('change', e => {
    _renderLinkedTasks(e.target.value, [], 'stLinkedTasks', 'stTasksRow');
    document.getElementById('stNewTask').value = '';
  });

  document.getElementById('stIntent').addEventListener('input', e => {
    document.getElementById('stIntentCount').textContent = e.target.value.length + ' / 300';
  });

  document.addEventListener('wt:timer-stopped', handleTimerStopped);

  // Category change — update linked tasks
  document.getElementById('fCat').addEventListener('change', e => {
    _renderLinkedTasks(e.target.value);
  });

  // Intent char counter
  document.getElementById('fIntent').addEventListener('input', e => {
    document.getElementById('fIntentCount').textContent = e.target.value.length + ' / 300';
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

  // Inline task addition from stopwatch modal
  document.getElementById('stNewTask').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const text = e.target.value.trim();
    if (!text) return;
    const cat = document.getElementById('stCat').value;
    if (!cat) {
      showModalError('stError', 'Select an area first.');
      return;
    }
    const d = load();
    if (!d.todos) d.todos = {};
    if (!d.todos[cat]) d.todos[cat] = [];
    d.todos[cat].push({ text, done: false });
    save(d);
    e.target.value = '';
    _renderLinkedTasks(cat, [], 'stLinkedTasks', 'stTasksRow');
    document.dispatchEvent(new CustomEvent('wt:stack-saved'));
  });
}
