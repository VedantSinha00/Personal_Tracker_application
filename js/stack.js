// ── stack.js ─────────────────────────────────────────────────────────────────
// Owns the Stack tab entirely:
//   - rendering the focus area list (with FLIP animation)
//   - the carry-forward button
//   - focus level toggling (High / Low)
//   - the full drag-and-drop reorder system (container-level pattern)

import {
  load, save,
  loadCats, loadFocus, saveFocus,
  loadOrder, saveOrder, orderKey,
  sortedCats, wk, getAbsWk,
} from './storage.js';
import { resolveHex, badgeTextColor } from './colours.js';
import { pushToBacklog, toggleBacklogView } from './backlog.js';

// Re-render when items are pulled from backlog
document.addEventListener('wt:backlog-changed', () => {
  renderSt(load());
});

// ── Drag state ────────────────────────────────────────────────────────────────
// These three variables are the entire shared state of an in-progress drag.
// They are module-scoped — nothing outside stack.js can touch them.
let dragSrc         = null;   // catName of the item being dragged
let dragInsertBefore = null;  // catName to insert before (null = append to end)
let dragInsertLevel  = null;  // 'high' | 'low' — which section to drop into

let _dragRafPending = false;
const _dragHandlers = { over: null, drop: null };

// ── Render ────────────────────────────────────────────────────────────────────
export function renderSt(d, animate) {
  const cats  = sortedCats();
  const focus = loadFocus();
  const stk   = d.stack || {};

  const highCats = cats.filter(c => (focus[c.name] || 'high') === 'high');
  const lowCats  = cats.filter(c => (focus[c.name] || 'high') === 'low');

  // Builds one stack item row. Uses data-* attributes for all interactions
  // so we can attach delegated listeners rather than inline handlers.
  function buildItem(c, level) {
    const hex  = resolveHex(c.color);
    const text = badgeTextColor(hex);
    const tasks = stkTodos[c.name] || [];

    return `
      <div class="si focus-${level}" id="si_wrap_${c.name}"
          data-catname="${c.name}" data-level="${level}">
        <div class="si-main">
          <div class="drag-zone" title="Drag to reorder">
            <span class="drag-handle">⠿</span>
            <span class="stag" style="--badge-hex:${hex};--badge-text:${text};">${c.name}</span>
          </div>
          <input class="sinput" id="si_${c.name}"
            placeholder="Main focus / objective..."
            value="${stk[c.name] || ''}"
            data-action="stack-input"
            data-catname="${c.name}">
          <div class="focus-toggle">
            <button data-action="focus-toggle" data-catname="${c.name}"
              class="${level === 'high' ? 'focus-high-on' : ''}"
              title="High focus">▲ High</button>
            <button data-action="focus-toggle" data-catname="${c.name}"
              class="${level === 'low' ? 'focus-low-on' : ''}"
              title="Low focus">▼ Low</button>
          </div>
        </div>

        <div class="si-tasks">
          <div class="task-list" id="tasks_${c.name}" data-catname="${c.name}">
            ${tasks.map((t, i) => `
              <div class="task-item" data-idx="${i}">
                <label class="task-checkbox-wrap" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;">
                  <input type="checkbox" ${t.done ? 'checked' : ''} data-action="tog-task" data-catname="${c.name}" data-idx="${i}">
                  <span class="task-text${t.done ? ' done' : ''}" style="${t.done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${t.text}</span>
                </label>
                <button class="task-backlog" data-action="push-backlog" data-catname="${c.name}" data-idx="${i}" title="Send to global backlog">
                  <i data-lucide="inbox"></i>
                </button>
                <button class="task-del" data-action="del-task" data-catname="${c.name}" data-idx="${i}" title="Delete task">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            `).join('')}
          </div>
          <div class="task-add">
            <input class="task-input" placeholder="Add a task..."
              data-action="add-task" data-catname="${c.name}">
          </div>
        </div>
      </div>`;
  }

  const stkTodos = d.todos || {};

  // ── F (First): record positions before any DOM change ──────────────────────
  // This is the F step of FLIP. We snapshot every item's current pixel
  // position so we can calculate how far it moved after the re-render.
  const prevRects = {};
  if (animate !== false) {
    document.querySelectorAll('#stackDragContainer .si').forEach(el => {
      prevRects[el.dataset.catname] = el.getBoundingClientRect();
    });
  }

  // ── L (Last): update the DOM ───────────────────────────────────────────────
  const highS = document.getElementById('highS');
  if (highS) {
    highS.innerHTML = '';
    highCats.forEach(c => {
      highS.insertAdjacentHTML('beforeend', buildItem(c, 'high'));
    });
  }
  document.getElementById('lowS').innerHTML  = lowCats.map(c  => buildItem(c, 'low')).join('');

  // Show/hide section labels and the "no low focus" empty hint
  document.getElementById('highLbl').style.display     = highCats.length ? '' : 'none';
  document.getElementById('lowLbl').style.display      = lowCats.length  ? '' : 'none';
  const highLbl2 = document.getElementById('highLbl2');
  if (highLbl2) highLbl2.style.display = 'none'; // only shown during drag
  document.getElementById('lowEmptyHint').style.display = lowCats.length ? 'none' : '';

  // ── I + P (Invert + Play): animate elements to their new positions ─────────
  // For each element that existed before the re-render, calculate how far
  // it moved (delta y). Apply the inverse as an instant transform, then
  // remove it with a CSS transition so the browser animates it smoothly.
  if (animate !== false && Object.keys(prevRects).length > 0) {
    document.querySelectorAll('#stackDragContainer .si').forEach(el => {
      const name = el.dataset.catname;
      const prev = prevRects[name];
      if (!prev) return; // new element — skip
      const next = el.getBoundingClientRect();
      const dy = prev.top - next.top;
      if (Math.abs(dy) < 2) return; // barely moved — skip

      el.style.transform  = `translateY(${dy}px)`; // Invert: snap to old position
      el.style.transition = 'none';
      el.offsetHeight;                              // force browser reflow
      el.classList.add('flip-animating');
      el.style.transition = '';                     // Play: CSS takes over
      el.style.transform  = '';
      el.addEventListener('transitionend', () => {
        el.classList.remove('flip-animating');
      }, { once: true });
    });
  }

  // Re-attach drag listeners after every DOM update, via requestAnimationFrame
  // so the new elements are fully painted before we query them.
  requestAnimationFrame(initDrag);

  // Re-attach delegated listeners for inputs and focus toggles
  attachStackListeners();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: document.getElementById('stackDragContainer') });
  }
}

// ── Save stack inputs ─────────────────────────────────────────────────────────
// Called whenever any stack input changes. Reads all visible inputs and
// writes them back to the week data object.
export function saveStackInputs() {
  const d = load();
  if (!d.stack) d.stack = {};
  loadCats().forEach(c => {
    const el = document.getElementById('si_' + c.name);
    if (el) d.stack[c.name] = el.value;
  });
  // Also capture intention while we're here
  const intentionEl = document.getElementById('intention');
  if (intentionEl) d.intention = intentionEl.value;
  save(d);
  // Notify app.js so Overview re-renders without a page reload
  document.dispatchEvent(new CustomEvent('wt:stack-saved'));
}

// ── Focus toggle ──────────────────────────────────────────────────────────────
function toggleFocus(catName) {
  const f = loadFocus();
  f[catName] = (f[catName] === 'high') ? 'low' : 'high';
  saveFocus(f);
  renderSt(load());
}

// ── Carry forward ─────────────────────────────────────────────────────────────
// Copies last week's stack text, focus levels, and order into this week,
// but only for fields that are currently empty.
export function carryForward() {
  const prevKey = 'wt_wk_' + getAbsWk(wk - 1);
  let prev;
  try { const r = localStorage.getItem(prevKey); prev = r ? JSON.parse(r) : null; }
  catch(e) { prev = null; }

  const btn = document.getElementById('carryBtn');

  if (!prev || (!prev.stack && !prev.todos)) {
    btn.textContent = '✕ Nothing to carry';
    setTimeout(() => { btn.innerHTML = '↩ Carry from last week'; }, 2000);
    return;
  }

  const d    = load();
  if (!d.stack) d.stack = {};
  if (!d.todos) d.todos = {};
  const cats = loadCats();
  let carried = 0;

  cats.forEach(c => {
    // 1. Carry text inputs
    const prevVal = prev.stack ? (prev.stack[c.name] || '') : '';
    if (prevVal && !d.stack[c.name]) { d.stack[c.name] = prevVal; carried++; }

    // 2. Carry unfinished tasks (todos)
    if (prev.todos && prev.todos[c.name]) {
      const uncomps = prev.todos[c.name].filter(t => !t.done);
      if (uncomps.length > 0) {
        if (!d.todos[c.name]) d.todos[c.name] = [];
        uncomps.forEach(ut => {
          // Avoid exact string duplicates
          if (!d.todos[c.name].find(dt => dt.text === ut.text)) {
            d.todos[c.name].push({ text: ut.text, done: false });
            carried++;
          }
        });
      }
    }
  });

  // Carry focus levels
  const prevFocusKey = 'wt_focus_' + getAbsWk(wk - 1);
  const prevOrderKey = 'wt_order_' + getAbsWk(wk - 1);
  try {
    const pf = localStorage.getItem(prevFocusKey);
    if (pf) {
      const prevFocus = JSON.parse(pf);
      const curFocus  = loadFocus();
      cats.forEach(c => {
        if (!curFocus[c.name] && prevFocus[c.name]) curFocus[c.name] = prevFocus[c.name];
      });
      saveFocus(curFocus);
    }
    // Carry order only if this week has no custom order yet
    const po = localStorage.getItem(prevOrderKey);
    if (po && !loadOrder()) {
      localStorage.setItem(orderKey(), po);
    }
  } catch(e) {}

  save(d);
  renderSt(d);

  btn.classList.add('carried');
  btn.innerHTML = `✓ Carried ${carried} item${carried !== 1 ? 's' : ''}`;
  setTimeout(() => {
    btn.classList.remove('carried');
    btn.innerHTML = '↩ Carry from last week';
  }, 3000);
}

export function updateCarryBtn(d) {
  const btn = document.getElementById('carryBtn');
  if (!btn) return;
  const cats = loadCats();
  const stk  = d.stack || {};
  const allFilled = cats.every(c => stk[c.name]);
  btn.style.opacity = allFilled ? '0.4' : '1';
  btn.title = allFilled
    ? 'All fields already have content'
    : 'Copy last week\'s stack items into this week';
}

function attachStackListeners() {
  ['highS', 'lowS'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;

    const fresh = container.cloneNode(true);
    container.parentNode.replaceChild(fresh, container);

    // Stack text inputs
    fresh.addEventListener('input', e => {
      if (e.target.dataset.action === 'stack-input') saveStackInputs();
    });
    fresh.addEventListener('keydown', e => {
      if (e.target.dataset.action === 'stack-input' && e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    });
    fresh.addEventListener('focus', e => {
      if (e.target.dataset.action === 'stack-input') e.target.select();
    }, true);

    // Focus toggle
    fresh.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="focus-toggle"]');
      if (btn) toggleFocus(btn.dataset.catname);
    });

    // Task management
    fresh.addEventListener('keydown', e => {
      if (e.target.dataset.action === 'add-task' && e.key === 'Enter') {
        const val = e.target.value.trim();
        if (!val) return;
        const cat = e.target.dataset.catname;
        const d = load();
        if (!d.todos) d.todos = {};
        if (!d.todos[cat]) d.todos[cat] = [];
        d.todos[cat].push({ text: val, done: false });
        save(d);
        renderSt(d);
        document.dispatchEvent(new CustomEvent('wt:stack-saved'));
        setTimeout(() => {
          const inp = document.querySelector(`.task-input[data-catname="${cat}"]`);
          if (inp) inp.focus();
        }, 10);
      }
    });

    fresh.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-action="del-task"]');
      if (delBtn) {
        const cat = delBtn.dataset.catname;
        const idx = +delBtn.dataset.idx;
        const d = load();
        if (d.todos && d.todos[cat]) {
          d.todos[cat].splice(idx, 1);
          save(d);
          renderSt(d);
          document.dispatchEvent(new CustomEvent('wt:stack-saved'));
        }
        return;
      }

      const backlogBtn = e.target.closest('[data-action="push-backlog"]');
      if (backlogBtn) {
        const cat = backlogBtn.dataset.catname;
        const idx = +backlogBtn.dataset.idx;
        const d = load();
        if (d.todos && d.todos[cat] && d.todos[cat][idx]) {
          const task = d.todos[cat][idx];
          pushToBacklog(task.text, cat);
          
          // Remove from current week
          d.todos[cat].splice(idx, 1);
          save(d);
          renderSt(d);
          document.dispatchEvent(new CustomEvent('wt:stack-saved'));
        }
        return;
      }
    });

    fresh.addEventListener('change', e => {
      const tog = e.target.closest('[data-action="tog-task"]');
      if (tog) {
        const cat = tog.dataset.catname;
        const idx = +tog.dataset.idx;
        const d = load();
        if (d.todos && d.todos[cat] && d.todos[cat][idx]) {
          d.todos[cat][idx].done = tog.checked;
          save(d);
          renderSt(d);
          document.dispatchEvent(new CustomEvent('wt:stack-saved'));
        }
      }
    });
  });
}

// ── Drag-and-drop system ──────────────────────────────────────────────────────
function initDrag() {
  const container = document.getElementById('stackDragContainer');
  if (!container) return;

  // Per-row: draggable is off by default, enabled only while mousedown
  // on the drag zone. This prevents accidental drags when clicking inputs.
  container.querySelectorAll('.drag-zone').forEach(zone => {
    const row = zone.closest('.si');
    row.setAttribute('draggable', 'false');

    // Clone to clear any stale listeners from previous renders
    const newZone = zone.cloneNode(true);
    zone.parentNode.replaceChild(newZone, zone);

    newZone.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));
    row.addEventListener('mouseup',   () => row.setAttribute('draggable', 'false'));
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend',   onDragEnd);
  });

  // Container-level over/drop — remove previous handlers before adding new
  // ones so they don't stack up across re-renders.
  if (_dragHandlers.over) container.removeEventListener('dragover', _dragHandlers.over);
  if (_dragHandlers.drop) container.removeEventListener('drop',     _dragHandlers.drop);
  _dragHandlers.over = onContainerDragOver;
  _dragHandlers.drop = onContainerDrop;
  container.addEventListener('dragover', _dragHandlers.over);
  container.addEventListener('drop',     _dragHandlers.drop);

  // Section labels as cross-section drop targets
  ['lowLbl', 'highLbl2'].forEach(id => {
    const lbl = document.getElementById(id);
    if (!lbl || !lbl.classList.contains('stack-section-drop')) return;
    const clone = lbl.cloneNode(true);
    lbl.parentNode.replaceChild(clone, lbl);

    clone.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      clone.classList.add('drop-over');
      dragInsertLevel  = clone.dataset.level;
      dragInsertBefore = '__section__';
      hideLine();
    });
    clone.addEventListener('dragleave', () => clone.classList.remove('drop-over'));
    clone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      clone.classList.remove('drop-over');
      if (!dragSrc) return;
      const targetLevel = clone.dataset.level;
      const f = loadFocus();
      f[dragSrc] = targetLevel;
      saveFocus(f);
      const names = sortedCats().map(c => c.name).filter(n => n !== dragSrc);
      const sectionItems = sortedCats().filter(
        c => c.name !== dragSrc && (loadFocus()[c.name] || 'high') === targetLevel
      );
      if (sectionItems.length > 0) {
        const lastIdx = names.indexOf(sectionItems[sectionItems.length - 1].name);
        names.splice(lastIdx + 1, 0, dragSrc);
      } else {
        if (targetLevel === 'high') names.unshift(dragSrc);
        else names.push(dragSrc);
      }
      saveOrder(names);
      renderSt(load());
    });
  });
}

function onDragStart(e) {
  dragSrc = e.currentTarget.dataset.catname;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrc);
  const el = e.currentTarget;
  requestAnimationFrame(() => { try { el.classList.add('dragging'); } catch(_) {} });
  document.querySelectorAll('.stack-section-drop').forEach(l => l.classList.add('drop-ready'));
}

function onDragEnd(e) {
  try { e.currentTarget.classList.remove('dragging'); } catch(_) {}
  hideLine();
  document.querySelectorAll('.stack-section-drop').forEach(l => {
    l.classList.remove('drop-ready');
    l.classList.remove('drop-over');
  });
  dragSrc = dragInsertBefore = dragInsertLevel = null;
  _dragRafPending = false;
}

function getOrderedRows() {
  const high = Array.from(document.querySelectorAll('#highS .si'));
  const low  = Array.from(document.querySelectorAll('#lowS .si'));
  return [...high, ...low]
    .filter(el => !el.classList.contains('dragging'))
    .map(el => ({
      name:  el.dataset.catname,
      level: el.dataset.level,
      rect:  el.getBoundingClientRect(),
    }));
}

function onContainerDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!dragSrc || _dragRafPending) return;
  _dragRafPending = true;
  const y = e.clientY;

  requestAnimationFrame(() => {
    _dragRafPending = false;
    if (!dragSrc) return;
    const rows = getOrderedRows();
    if (!rows.length) { hideLine(); return; }

    let insertBefore = null, insertLevel = 'high', lineY;

    if (y < rows[0].rect.top + rows[0].rect.height * 0.5) {
      insertBefore = rows[0].name;
      insertLevel  = rows[0].level;
      lineY        = rows[0].rect.top - 4;
    } else {
      let placed = false;
      for (let i = 0; i < rows.length - 1; i++) {
        if (y < rows[i + 1].rect.top + rows[i + 1].rect.height * 0.25) {
          insertBefore = rows[i + 1].name;
          insertLevel  = rows[i + 1].level;
          lineY = rows[i].rect.bottom + (rows[i + 1].rect.top - rows[i].rect.bottom) / 2;
          placed = true;
          break;
        }
      }
      if (!placed) {
        insertBefore = null;
        insertLevel  = rows[rows.length - 1].level;
        lineY        = rows[rows.length - 1].rect.bottom + 4;
      }
    }

    dragInsertBefore = insertBefore;
    dragInsertLevel  = insertLevel;
    showLine(lineY);
  });
}

function onContainerDrop(e) {
  e.preventDefault();
  hideLine();
  if (!dragSrc || dragInsertBefore === '__section__') return;

  const src         = dragSrc;
  const insertBefore = dragInsertBefore;
  const insertLevel  = dragInsertLevel || 'high';

  const f = loadFocus();
  if ((f[src] || 'high') !== insertLevel) { f[src] = insertLevel; saveFocus(f); }

  const names = sortedCats().map(c => c.name).filter(n => n !== src);
  const idx   = insertBefore ? names.indexOf(insertBefore) : -1;
  if (idx === -1) names.push(src); else names.splice(idx, 0, src);
  saveOrder(names);
  renderSt(load());
}

function showLine(y) {
  const line  = document.getElementById('dragInsertLine');
  const cRect = document.getElementById('stackDragContainer').getBoundingClientRect();
  line.style.cssText = `display:block;top:${y}px;left:${cRect.left}px;width:${cRect.width}px;`;
}

function hideLine() {
  const line = document.getElementById('dragInsertLine');
  if (line) line.style.display = 'none';
}

// ── Top-level listener setup ──────────────────────────────────────────────────
// Called once from app.js during initialisation.
export function initStackListeners() {
  // Intention input — save on every keystroke
  document.getElementById('intention').addEventListener('input', saveStackInputs);
  document.getElementById('intention').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  // Carry forward button
  document.getElementById('carryBtn').addEventListener('click', carryForward);

  // Navigate to Backlog View (internal)
  const gotoBtn = document.getElementById('gotoBacklogBtn');
  if (gotoBtn) {
    gotoBtn.onclick = () => toggleBacklogView(true);
  }
}
