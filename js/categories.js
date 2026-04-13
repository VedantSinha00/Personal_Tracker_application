// ── categories.js ────────────────────────────────────────────────────────────
// Manages the categories modal — rendering, adding, deleting, renaming,
// reordering (drag-to-reorder inside the modal), and the inline colour
// picker popover.

import {
  loadCats, saveCats, sortedCats,
  loadFocus, saveFocus,
  loadOrder, saveOrder, orderKey,
  loadCatArchive, saveCatArchive,
  addDeletedCat, clearDeletedCat, getDeletedCats,
  _softDeleteCategory
} from './storage.js';
import { resolveHex, renderColorPicker } from './colours.js';
import { syncCustomSelect } from './custom-select.js';


// Currently selected colour for new categories
let selCatColor = '#2563a8';

// ── Modal open / close ───────────────────────────────────────────────────────
export function openCatModal() {
  renderCatList();
  renderColorPicker('swatchRow', selCatColor, hex => { selCatColor = hex; });
  document.getElementById('catNameInput').value = '';
  document.body.classList.add('modal-open');
  document.getElementById('catModal').classList.add('open');
}

export function closeCatModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('catModal').classList.remove('open');
  // Notify app.js so stack and day grid re-render with updated categories.
  document.dispatchEvent(new CustomEvent('wt:cats-changed'));
}

// ── Render the category list ─────────────────────────────────────────────────
// "Others" is always pinned to the bottom and cannot be dragged or deleted.
export function renderCatList() {
  const cats = loadCats();
  const pinned  = cats.filter(c => c.name === 'Others');
  const rest    = cats.filter(c => c.name !== 'Others');
  const ordered = [...rest, ...pinned];

  document.getElementById('catList').innerHTML = ordered.map(c => {
    if (c == null || c.name == null) {
      console.warn('[renderCatList] Skipping invalid category entry:', c);
      return '';
    }
    const realIdx  = cats.indexOf(c);
    const hex      = resolveHex(c.color);
    const isOthers = c.name === 'Others';
    return `
      <div class="cat-item${isOthers ? ' others-item' : ''}"
          draggable="${!isOthers}"
          data-catidx="${realIdx}">
        <span class="cat-drag-handle" title="Drag to reorder">⠿</span>
        <div class="cat-dot-btn" style="background:${hex}" title="Change colour"
          data-action="open-cat-color" data-catidx="${realIdx}"></div>
        <input class="cat-name-input" value="${c.name}"
          data-action="rename-cat" data-catidx="${realIdx}"
          ${isOthers ? 'readonly title="Others is always kept"' : ''}>
        ${!isOthers ? `
          <button class="cat-vis" data-action="toggle-vis" data-catidx="${realIdx}" title="${c.hidden ? 'Show in analytics' : 'Hide from analytics'}" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:var(--text3);opacity:${c.hidden ? '0.5' : '1'};">
            <i data-lucide="${c.hidden ? 'eye-off' : 'eye'}" style="width:14px;height:14px;"></i>
          </button>
          <button class="cat-del" data-action="delete-cat" data-catidx="${realIdx}" title="Remove">&times;</button>
        ` : ''}
      </div>`;
  }).join('') || '<div style="font-size:13px;color:var(--text3);padding:4px 0;">No categories yet.</div>';

  attachCatDragListeners();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: document.getElementById('catList') });
  }
}

// ── Add / delete / rename ────────────────────────────────────────────────────
export function addCat() {
  const nameEl = document.getElementById('catNameInput');
  const name = nameEl.value.trim();
  if (!name) return;
  const cats = loadCats();
  if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    nameEl.select();
    return;
  }
  // Insert before "Others" if it exists, otherwise push
  const othersIdx = cats.findIndex(c => c.name === 'Others');
  const entry = { name, color: selCatColor };
  if (othersIdx !== -1) cats.splice(othersIdx, 0, entry);
  else cats.push(entry);
  clearDeletedCat(name);
  saveCats(cats);
  
  // If the category was previously deleted, unmark it so it isn't treated as a ghost.
  const arch = loadCatArchive();
  if (arch[name + '_deleted']) {
    delete arch[name + '_deleted'];
    saveCatArchive(arch);
  }

  nameEl.value = '';
  renderCatList();
  renderColorPicker('swatchRow', selCatColor, hex => { selCatColor = hex; });
}

function deleteCat(idx) {
  const cats = loadCats();
  const removing = cats[idx];
  // Archive the colour so old blocks still render correctly
  // Also set a _deleted flag to prevent the 'repairCategories' function from resurrecting it.
  if (removing) {
    const arch = loadCatArchive();
    arch[removing.name] = removing.color;
    arch[removing.name + '_deleted'] = true;
    saveCatArchive(arch);
    addDeletedCat(removing.name);
    _softDeleteCategory(removing.name);
  }
  cats.splice(idx, 1);
  saveCats(cats);
  renderCatList();
}

function toggleVis(idx) {
  const cats = loadCats();
  if (!cats[idx]) return;
  cats[idx].hidden = !cats[idx].hidden;
  saveCats(cats);
  renderCatList();
  document.dispatchEvent(new CustomEvent('wt:cats-changed'));
}

function renameCat(idx, newName) {
  newName = newName.trim();
  const cats = loadCats();
  if (!newName || !cats[idx]) return;
  if (newName === cats[idx].name) return;
  if (cats.some((c, i) => i !== idx && c.name.toLowerCase() === newName.toLowerCase())) {
    console.warn(`[renameCat] Rename aborted: "${newName}" already exists in categories (case-insensitive collision with existing name).`);
    return;
  }

  const oldName = cats[idx].name;
  cats[idx].name = newName;
  saveCats(cats);

  // Keep focus, order, and stack references in sync with the new name
  const f = loadFocus();
  if (f[oldName] !== undefined) { f[newName] = f[oldName]; delete f[oldName]; saveFocus(f); }

  const ord = loadOrder();
  if (ord) {
    const oi = ord.indexOf(oldName);
    if (oi !== -1) { ord[oi] = newName; saveOrder(ord); }
  }

  // Stack rename is handled via wt:cats-changed event in app.js
  renderCatList();
}

// ── Populate the category <select> in the block modal ───────────────────────
// ── Populate the category <select> dropdowns throughout the app ───────────
export function populateCatSelect() {
  const cats = sortedCats();
  const options = cats
    .filter(c => !c.hidden)
    .map(c => `<option value="${c.name}">${c.name}</option>`)
    .join('');
  
  // Log Modal dropdown
  const fCat = document.getElementById('fCat');
  if (fCat) {
    const oldVal = fCat.value;
    fCat.innerHTML = '<option value="" disabled selected>Select Area</option>' + options;
    if (oldVal && cats.find(c => c.name === oldVal)) fCat.value = oldVal;
  }
  
  // Timer Modal dropdown
  const stCat = document.getElementById('stCat');
  if (stCat) {
    const oldVal = stCat.value;
    stCat.innerHTML = '<option value="" disabled selected>Select Area</option>' + options;
    if (oldVal && cats.find(c => c.name === oldVal)) stCat.value = oldVal;
  }

  // Backlog / Stack Quick-Add selects
  const backlogSelects = document.querySelectorAll('.backlog-cat-select');
  backlogSelects.forEach(sel => {
    const oldVal = sel.value;
    sel.innerHTML = options;
    if (oldVal && cats.find(c => c.name === oldVal)) sel.value = oldVal;
  });

  // Sync custom dropdowns
  if (fCat) syncCustomSelect(fCat);
  if (stCat) syncCustomSelect(stCat);
  backlogSelects.forEach(sel => syncCustomSelect(sel));
}



// ── Inline colour picker popover ─────────────────────────────────────────────
let _catColorPopover = null;

function openCatColorPicker(catIdx, dotEl) {
  if (_catColorPopover) { _catColorPopover.remove(); _catColorPopover = null; }
  const cats = loadCats();
  const c = cats[catIdx];
  if (!c) return;

  const pop = document.createElement('div');
  pop.className = 'cat-color-popover open';
  pop.innerHTML = `<div id="_cpPop"></div>`;
  document.body.appendChild(pop);
  _catColorPopover = pop;

  // Position below the dot button
  const rect = dotEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top  = (rect.bottom + 6) + 'px';
  pop.style.left = Math.max(8, rect.left - 8) + 'px';

  renderColorPicker('_cpPop', c.color, hex => {
    cats[catIdx].color = hex;
    saveCats(cats);
    dotEl.style.background = hex;
    renderCatList();
    pop.remove();
    _catColorPopover = null;
  });

  // Close when clicking outside the popover
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!pop.contains(e.target) && e.target !== dotEl) {
        pop.remove();
        _catColorPopover = null;
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

// ── Drag-to-reorder inside the category modal ────────────────────────────────
// This is a simpler drag system than the Stack tab's FLIP drag —
// it only needs to reorder a short list, not animate across sections.
let _catDragSrc = null;

function attachCatDragListeners() {
  const list = document.getElementById('catList');
  if (!list) return;

  list.querySelectorAll('.cat-item[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', e => {
      _catDragSrc = +item.dataset.catidx;
      item.classList.add('cat-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('cat-dragging');
      list.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
      _catDragSrc = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      item.classList.add('cat-drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('cat-drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.classList.remove('cat-drag-over');
      const targetIdx = +item.dataset.catidx;
      if (_catDragSrc === null || _catDragSrc === targetIdx) return;
      const cats = loadCats();
      if (cats[targetIdx]?.name === 'Others') return;
      const [moved] = cats.splice(_catDragSrc, 1);
      cats.splice(targetIdx, 0, moved);
      saveCats(cats);
      renderCatList();
    });
  });
}

// ── Ensure a category exists (used by Pull to Week) ─────────────────────
export function ensureCatExists(name) {
  if (!name) return 'Others';
  const _deletedSet = new Set(getDeletedCats().map(n => n.toLowerCase()));
  const arch = loadCatArchive();
  const archDeletedLower = new Set(
    Object.keys(arch).filter(k => k.endsWith('_deleted')).map(k => k.toLowerCase())
  );
  if (_deletedSet.has(name.toLowerCase()) || archDeletedLower.has((name + '_deleted').toLowerCase())) {
    return 'Others';
  }
  const cats = loadCats();
  const existing = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.name;

  // Otherwise create it
  const entry = { name, color: '#2563a8' }; // Default blue
  const othersIdx = cats.findIndex(c => c.name === 'Others');
  if (othersIdx !== -1) cats.splice(othersIdx, 0, entry);
  else cats.push(entry);
  
  saveCats(cats);
  populateCatSelect();
  return name;
}

// ── Event wiring ─────────────────────────────────────────────────────────────
export function initCategoriesListeners() {
  // Overlay background click → close
  document.getElementById('catModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCatModal();
  });

  // Done button
  document.querySelector('#catModal .mfooter .btn-p').addEventListener('click', closeCatModal);

  // Add button
  document.querySelector('.cat-add-row .btn-p').addEventListener('click', addCat);

  // Enter key in name input
  document.getElementById('catNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCat();
  });

  // Delegated clicks on the category list (delete + colour picker + visibility)
  document.getElementById('catList').addEventListener('click', e => {
    const visBtn = e.target.closest('[data-action="toggle-vis"]');
    if (visBtn) { toggleVis(+visBtn.dataset.catidx); return; }

    const delBtn = e.target.closest('[data-action="delete-cat"]');
    if (delBtn) { deleteCat(+delBtn.dataset.catidx); return; }

    const dotBtn = e.target.closest('[data-action="open-cat-color"]');
    if (dotBtn) { openCatColorPicker(+dotBtn.dataset.catidx, dotBtn); return; }
  });

  // Delegated blur on rename inputs — blur fires when the user clicks away
  // after editing a category name.
  document.getElementById('catList').addEventListener('focusout', e => {
    const input = e.target.closest('[data-action="rename-cat"]');
    if (input) renameCat(+input.dataset.catidx, input.value);
  });

  document.getElementById('catList').addEventListener('keydown', e => {
    const input = e.target.closest('[data-action="rename-cat"]');
    if (input && e.key === 'Enter') input.blur();
  });
}
