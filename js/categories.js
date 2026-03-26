// ── categories.js ────────────────────────────────────────────────────────────
// Manages the categories modal — rendering, adding, deleting, renaming,
// reordering (drag-to-reorder inside the modal), and the inline colour
// picker popover.

import {
  loadCats, saveCats, sortedCats,
  loadFocus, saveFocus,
  loadOrder, saveOrder, orderKey,
  loadCatArchive, saveCatArchive,
} from './storage.js';
import { resolveHex, renderColorPicker } from './colours.js';

// Currently selected colour for new categories
let selCatColor = '#2563a8';

// ── Modal open / close ───────────────────────────────────────────────────────
export function openCatModal() {
  renderCatList();
  renderColorPicker('swatchRow', selCatColor, hex => { selCatColor = hex; });
  document.getElementById('catNameInput').value = '';
  document.getElementById('catModal').classList.add('open');
}

export function closeCatModal() {
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
        ${isOthers ? '' : `<button class="cat-del" data-action="delete-cat" data-catidx="${realIdx}" title="Remove">&times;</button>`}
      </div>`;
  }).join('') || '<div style="font-size:13px;color:var(--text3);padding:4px 0;">No categories yet.</div>';

  // Re-attach drag listeners after every render
  attachCatDragListeners();
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
  saveCats(cats);
  nameEl.value = '';
  renderCatList();
  renderColorPicker('swatchRow', selCatColor, hex => { selCatColor = hex; });
}

function deleteCat(idx) {
  const cats = loadCats();
  const removing = cats[idx];
  // Archive the colour so old blocks still render correctly
  if (removing) {
    const arch = loadCatArchive();
    arch[removing.name] = removing.color;
    saveCatArchive(arch);
  }
  cats.splice(idx, 1);
  saveCats(cats);
  renderCatList();
}

function renameCat(idx, newName) {
  newName = newName.trim();
  const cats = loadCats();
  if (!newName || !cats[idx]) return;
  if (newName === cats[idx].name) return;
  if (cats.some((c, i) => i !== idx && c.name.toLowerCase() === newName.toLowerCase())) return;

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
export function populateCatSelect() {
  const sel = document.getElementById('fCat');
  const cur = sel.value;
  const cats = sortedCats();
  sel.innerHTML = '<option value="">Select...</option>' +
    cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (cur) sel.value = cur;
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

  // Delegated clicks on the category list (delete + colour picker)
  document.getElementById('catList').addEventListener('click', e => {
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

  // Enter key in rename inputs submits the rename
  document.getElementById('catList').addEventListener('keydown', e => {
    const input = e.target.closest('[data-action="rename-cat"]');
    if (input && e.key === 'Enter') input.blur();
  });
}
