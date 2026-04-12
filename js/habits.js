// ── habits.js ────────────────────────────────────────────────────────────────
// Manages the habits modal — rendering, adding, deleting custom habits,
// and toggling habit checkboxes on individual day cards.

import {
  load, save, loadHabits, saveHabits, allHabits,
} from './storage.js';
import { resolveHex, renderColorPicker } from './colours.js';

// Tracks the currently selected colour in the habit colour picker.
let selHabitColor = '#2d6a4f';
let editIdx = null;

// ── Modal open / close ───────────────────────────────────────────────────────
export function openHabitsModal() {
  renderHabitList();
  renderColorPicker('habitSwatchRow', selHabitColor, hex => { selHabitColor = hex; });
  document.getElementById('habitNameInput').value = '';
  document.getElementById('habitTargetInput').value = 5;
  
  editIdx = null;
  const formTitle = document.getElementById('habitFormTitle');
  if (formTitle) formTitle.textContent = 'ADD NEW HABIT';
  document.querySelector('#habitsModal .habit-add-row .btn-p').textContent = 'Add';
  
  document.body.classList.add('modal-open');
  document.getElementById('habitsModal').classList.add('open');
}

export function closeHabitsModal() {
  document.body.classList.remove('modal-open');
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
      <button class="habit-item-edit" data-action="edit-habit" data-idx="${i}" title="Edit" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:0 5px;">✎</button>
      <button class="habit-item-del" data-action="delete-habit" data-idx="${i}" title="Remove">&times;</button>
    </div>`).join('');

  document.getElementById('habitManagerList').innerHTML =
    customHTML || '<div style="font-size:12px;color:var(--text3);padding:10px 0;text-align:center;">No habits added yet.</div>';
}

// ── Add / delete ─────────────────────────────────────────────────────────────
export function addCustomHabit() {
  const nameEl   = document.getElementById('habitNameInput');
  const targetEl = document.getElementById('habitTargetInput');
  const addBtn   = document.querySelector('#habitsModal .habit-add-row .btn-p');
  const name = nameEl.value.trim();
  if (!name) return;

  const target = Math.min(7, Math.max(1, parseInt(targetEl.value) || 5));
  const habits  = loadHabits();

  // Prevent duplicates (case-insensitive) across built-in + custom
  const existingMatches = allHabits().filter(h => h.name.toLowerCase() === name.toLowerCase());
  if (existingMatches.length > 0) {
    if (editIdx === null || habits[editIdx].name.toLowerCase() !== name.toLowerCase()) {
      nameEl.select();
      return;
    }
  }

  if (editIdx !== null) {
      habits[editIdx].name = name;
      habits[editIdx].color = selHabitColor;
      habits[editIdx].target = target;
      editIdx = null;
      addBtn.textContent = 'Add';
      const formTitle = document.getElementById('habitFormTitle');
      if (formTitle) formTitle.textContent = 'ADD NEW HABIT';
  } else {
      habits.push({ id: 'h_' + Date.now(), name, color: selHabitColor, target });
  }

  saveHabits(habits);
  nameEl.value = '';
  renderHabitList();
  // Refresh picker so colour selection persists
  renderColorPicker('habitSwatchRow', selHabitColor, hex => { selHabitColor = hex; });
}

function startEditHabit(i) {
  const habits = loadHabits();
  const h = habits[i];
  editIdx = i;
  
  document.getElementById('habitNameInput').value = h.name;
  document.getElementById('habitTargetInput').value = h.target;
  selHabitColor = h.color;
  
  const formTitle = document.getElementById('habitFormTitle');
  if (formTitle) formTitle.textContent = 'EDIT HABIT';
  document.querySelector('#habitsModal .habit-add-row .btn-p').textContent = 'Save';
  
  renderColorPicker('habitSwatchRow', selHabitColor, hex => { selHabitColor = hex; });
  document.getElementById('habitNameInput').focus();
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
  document.querySelector('#habitsModal .mfooter .btn-p').addEventListener('click', closeHabitsModal);

  // Add button
  document.querySelector('#habitsModal .habit-add-row .btn-p').addEventListener('click', addCustomHabit);

  // Enter key in name input
  document.getElementById('habitNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomHabit();
  });

  // Delegated delete + edit clicks on the list
  document.getElementById('habitManagerList').addEventListener('click', e => {
    const delBtn = e.target.closest('[data-action="delete-habit"]');
    if (delBtn) deleteHabit(+delBtn.dataset.idx);
    
    const editBtn = e.target.closest('[data-action="edit-habit"]');
    if (editBtn) startEditHabit(+editBtn.dataset.idx);
  });
}
