// ── habits.js ────────────────────────────────────────────────────────────────
// Manages the habits modal — rendering, adding, deleting custom habits,
// and toggling habit checkboxes on individual day cards.

import {
  load, save, loadHabits, saveHabits, allHabits,
} from './storage.js';
import { resolveHex, renderColorPicker } from './colours.js';

// Tracks the currently selected colour in the habit colour picker.
let selHabitColor = '#2d6a4f';

// ── Modal open / close ───────────────────────────────────────────────────────
export function openHabitsModal() {
  renderHabitList();
  renderColorPicker('habitSwatchRow', selHabitColor, hex => { selHabitColor = hex; });
  document.getElementById('habitNameInput').value = '';
  document.getElementById('habitTargetInput').value = 5;
  document.getElementById('habitsModal').classList.add('open');
}

export function closeHabitsModal() {
  document.getElementById('habitsModal').classList.remove('open');
  // Notify app.js that habits changed so day grid and overview re-render.
  document.dispatchEvent(new CustomEvent('wt:habits-changed'));
}

// ── Render the habit list ────────────────────────────────────────────────────
function renderHabitList() {
  const custom = loadHabits();

  const customHTML = custom.map((h, i) => `
    <div class="habit-item">
      <div class="habit-item-dot" style="background:${resolveHex(h.color)}"></div>
      <span class="habit-item-name">${h.name}</span>
      <span class="habit-item-target">${h.target}×/wk</span>
      <button class="habit-item-del" data-action="delete-habit" data-idx="${i}" title="Remove">&times;</button>
    </div>`).join('');

  document.getElementById('habitManagerList').innerHTML =
    customHTML || '<div style="font-size:12px;color:var(--text3);padding:10px 0;text-align:center;">No habits added yet.</div>';
}

// ── Add / delete ─────────────────────────────────────────────────────────────
export function addCustomHabit() {
  const nameEl   = document.getElementById('habitNameInput');
  const targetEl = document.getElementById('habitTargetInput');
  const name = nameEl.value.trim();
  if (!name) return;

  const target = Math.min(7, Math.max(1, parseInt(targetEl.value) || 5));
  const habits  = loadHabits();

  // Prevent duplicates (case-insensitive) across built-in + custom
  if (allHabits().some(h => h.name.toLowerCase() === name.toLowerCase())) {
    nameEl.select();
    return;
  }

  habits.push({ id: 'h_' + Date.now(), name, color: selHabitColor, target });
  saveHabits(habits);
  nameEl.value = '';
  renderHabitList();
  // Refresh picker so colour selection persists
  renderColorPicker('habitSwatchRow', selHabitColor, hex => { selHabitColor = hex; });
}

function deleteHabit(i) {
  const habits = loadHabits();
  habits.splice(i, 1);
  saveHabits(habits);
  renderHabitList();
}

// ── Day-level habit toggling ─────────────────────────────────────────────────
// Called when a custom habit checkbox is changed on a day card or overview.
export function togCustomHabit(dayIdx, habitId) {
  const d = load();
  if (!d.days[dayIdx].habits) d.days[dayIdx].habits = {};
  d.days[dayIdx].habits[habitId] = !d.days[dayIdx].habits[habitId];
  save(d);
  document.dispatchEvent(new CustomEvent('wt:day-changed'));
}

// ── Event wiring ─────────────────────────────────────────────────────────────
// Called once from app.js during initialisation.
export function initHabitsListeners() {
  // Overlay background click → close
  document.getElementById('habitsModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHabitsModal();
  });

  // Done button
  document.getElementById('habitsModal').querySelector('.btn-p').addEventListener('click', closeHabitsModal);

  // Add button
  document.querySelector('#habitsModal .btn-p[data-action="add"]') ||
    document.getElementById('habitsModal').querySelectorAll('.btn-p')[0];

  // We target the Add button by position since it shares btn-p with Done.
  // The Add button is the one inside .habit-add-row.
  document.querySelector('.habit-add-row .btn-p').addEventListener('click', addCustomHabit);

  // Enter key in name input
  document.getElementById('habitNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomHabit();
  });

  // Delegated delete clicks on the list
  document.getElementById('habitManagerList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="delete-habit"]');
    if (btn) deleteHabit(+btn.dataset.idx);
  });
}
