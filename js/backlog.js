// ── backlog.js ───────────────────────────────────────────────────────────────
// Manages the persistent backlog view within the Stack tab.
// Everything here persists across weeks via wt_backlog.

import { loadBacklog, saveBacklog, loadCats, load, save } from './storage.js';
import { resolveHex, badgeTextColor } from './colours.js';
import { showToast } from './toast.js';
import { populateCatSelect, ensureCatExists } from './categories.js';

export function initBacklog() {
  // Navigation: Toggle within Stack
  const gotoBtn = document.getElementById('gotoBacklogBtn');
  if (gotoBtn) {
    gotoBtn.onclick = () => toggleBacklogView(true);
  }

  const hideBtn = document.getElementById('hideBacklogBtn');
  if (hideBtn) {
    hideBtn.onclick = () => toggleBacklogView(false);
  }

  // Quick Add: Support both Stack-tab and Backlog-tab forms
  document.addEventListener('click', e => {
    if (e.target.classList.contains('add-backlog-item-btn')) {
      const inputId = e.target.dataset.inputId || 'backlogItemInput';
      const selectId = e.target.dataset.selectId || 'backlogCatSelect';
      const input = document.getElementById(inputId);
      const select = document.getElementById(selectId);
      
      if (input && input.value.trim()) {
        addBacklogItem(input.value.trim(), select.value);
        input.value = '';
        renderBacklog();
      }
    }
  });

  populateCatSelect();
}

export function toggleBacklogView(showBacklog) {
  const weekly = document.getElementById('stackWeeklyView');
  const backlog = document.getElementById('stackBacklogView');
  const carryBtn = document.getElementById('carryBtn');
  
  if (!weekly || !backlog) return;

  if (showBacklog) {
    weekly.style.display = 'none';
    backlog.style.display = 'block';
    if (carryBtn) {
      carryBtn.style.opacity = '0.3';
      carryBtn.style.pointerEvents = 'none';
    }
    renderBacklog();
  } else {
    weekly.style.display = 'block';
    backlog.style.display = 'none';
    if (carryBtn) {
      carryBtn.style.opacity = '1';
      carryBtn.style.pointerEvents = 'auto';
    }
  }
}

export function renderBacklog() {
  const container = document.getElementById('backlogList');
  if (!container) return;
  
  const backlog = loadBacklog();
  const cats = loadCats();
  const d = load();

  const catsMap = {};
  cats.forEach(c => catsMap[c.name] = c);

  if (backlog.items.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text3);font-family:inherit;font-size:13px;border:1px dashed var(--border);border-radius:var(--radius);">Your backlog is empty. Add something above!</div>`;
    return;
  }

  container.innerHTML = backlog.items.map((item, idx) => {
    const c = catsMap[item.category] || { name: item.category, color: 'gray' };
    const hex = resolveHex(c.color);
    const tasks = item.tasks || [];
    
    return `
      <div class="backlog-agenda-card" data-idx="${idx}">
        <div class="backlog-header">
          <span class="stag" style="background:color-mix(in srgb, ${hex} 20%, transparent); color:var(--text); border:1px solid color-mix(in srgb, ${hex} 30%, transparent);">${item.category}</span>
          <input class="backlog-title-input" value="${item.text || ''}" 
                 data-action="edit-backlog-title" data-idx="${idx}"
                 placeholder="Agenda focus for this area..." 
                 style="flex:1;">
          <button class="btn-s del-backlog-item" data-idx="${idx}" title="Delete entire agenda box">
            <i data-lucide="trash-2"></i>
          </button>
        </div>

        <div class="backlog-task-list">
          ${tasks.map((t, ti) => `
            <div class="backlog-task-item">
              <span class="task-text" contenteditable="true" 
                    data-action="edit-backlog-task" data-idx="${idx}" data-tidx="${ti}">${t.text}</span>
              <button class="task-pull" data-action="pull-backlog-task" data-idx="${idx}" data-tidx="${ti}" title="Pull task to this week">
                <i data-lucide="inbox"></i>
              </button>
              <button class="task-del" data-action="del-backlog-task" data-idx="${idx}" data-tidx="${ti}" title="Delete task">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          `).join('')}
        </div>
        
        <div class="backlog-add-task-row">
          <input class="backlog-add-task-input backlog-task-add-input" 
                 placeholder="Add a task..."
                 data-idx="${idx}">
        </div>
      </div>
    `;
  }).join('');

  // Delegation for actions
  container.onclick = e => {
    const pullTaskBtn = e.target.closest('[data-action="pull-backlog-task"]');
    const delBtn  = e.target.closest('.del-backlog-item');
    const delTaskBtn = e.target.closest('[data-action="del-backlog-task"]');

    if (pullTaskBtn) {
      const idx = +pullTaskBtn.dataset.idx;
      const ti  = +pullTaskBtn.dataset.tidx;
      pullTaskToWeek(idx, ti);
    }
    if (delBtn) {
      if (confirm("Delete this entire Agenda box?")) {
        const bl = loadBacklog();
        bl.items.splice(+delBtn.dataset.idx, 1);
        saveBacklog(bl);
        renderBacklog();
      }
    }
    if (delTaskBtn) {
      const idx = +delTaskBtn.dataset.idx;
      const ti  = +delTaskBtn.dataset.tidx;
      const bl  = loadBacklog();
      if (bl.items[idx] && bl.items[idx].tasks) {
        bl.items[idx].tasks.splice(ti, 1);
        saveBacklog(bl);
        renderBacklog();
      }
    }
  };

  // Input listeners for editing titles and tasks
  container.oninput = e => {
    const titleInp = e.target.closest('[data-action="edit-backlog-title"]');
    const taskSpan  = e.target.closest('[data-action="edit-backlog-task"]');

    if (titleInp) {
      const bl = loadBacklog();
      bl.items[+titleInp.dataset.idx].text = titleInp.value;
      saveBacklog(bl);
    }
    if (taskSpan) {
      const bl = loadBacklog();
      const idx = +taskSpan.dataset.idx;
      const ti = +taskSpan.dataset.tidx;
      if (bl.items[idx] && bl.items[idx].tasks[ti]) {
        bl.items[idx].tasks[ti].text = taskSpan.innerText;
        saveBacklog(bl);
      }
    }
  };

  // Keyboard delegation for adding tasks
  container.onkeydown = e => {
    if (e.key === 'Enter') {
      const taskInp = e.target.closest('.backlog-task-add-input');
      if (taskInp && taskInp.value.trim()) {
        e.preventDefault();
        const idx = +taskInp.dataset.idx;
        const bl = loadBacklog();
        if (!bl.items[idx].tasks) bl.items[idx].tasks = [];
        bl.items[idx].tasks.push({ text: taskInp.value.trim(), done: false });
        saveBacklog(bl);
        renderBacklog();
        // Focus the input again after render
        setTimeout(() => {
          const freshInputs = document.querySelectorAll('.backlog-task-add-input');
          // Find the one with same index
          for (let i of freshInputs) {
            if (+i.dataset.idx === idx) { i.focus(); break; }
          }
        }, 10);
      }
    }
  };

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

function pullTaskToWeek(idx, ti) {
  const bl = loadBacklog();
  const item = bl.items[idx];
  if (!item || !item.tasks || !item.tasks[ti]) return;

  const taskToMove = item.tasks[ti];
  const d = load();

  // Ensure category exists in the main system
  const targetCat = ensureCatExists(item.category);

  // LIMIT CHECK: 5 per category
  if (!d.todos) d.todos = {};
  if (!d.todos[targetCat]) d.todos[targetCat] = [];
  
  if (d.todos[targetCat].length >= 5) {
    showToast(`Stack full for ${targetCat} (5 item limit reach). Complete or remove tasks first.`, 'warning');
    return;
  }
  
  // Smart Agenda: If category isn't in focus yet, use the card's title as focus
  if (!d.stack[targetCat] && item.text) {
    d.stack[targetCat] = item.text;
  }

  // Add task to week
  d.todos[targetCat].push({
    text: taskToMove.text,
    done: false
  });

  // Remove from backlog
  item.tasks.splice(ti, 1);

  save(d);
  saveBacklog(bl);
  
  renderBacklog();
  document.dispatchEvent(new CustomEvent('wt:backlog-changed'));
  showToast(`Pulled "${taskToMove.text}" to your ${targetCat} stack!`, 'success');
}

function addBacklogItem(text, category) {
  const bl = loadBacklog();
  
  // Normalize comparison to find existing category box
  const targetCat = category.trim();
  const existing = bl.items.find(i => i.category.trim().toLowerCase() === targetCat.toLowerCase());
  
  if (existing) {
    if (!existing.tasks) existing.tasks = [];
    existing.tasks.push({ text, done: false });
    showToast(`Added task to ${existing.category} agenda`, 'success');
  } else {
    bl.items.push({
      id: Date.now().toString(),
      category: targetCat,
      text: '', // Start with empty focus title
      tasks: [{ text, done: false }],
      created_at: new Date().toISOString()
    });
    showToast(`Created ${targetCat} agenda box`, 'success');
  }
  
  // Ensure we never have duplicates in the data structure
  consolidateBacklog(bl);
  saveBacklog(bl);
}

/**
 * Merges any duplicate category boxes in the backlog.
 */
function consolidateBacklog(bl) {
  const consolidated = [];
  const map = new Map();

  bl.items.forEach(item => {
    const catKey = item.category.trim().toLowerCase();
    if (map.has(catKey)) {
      const existing = map.get(catKey);
      // Merge tasks
      if (item.tasks) {
        if (!existing.tasks) existing.tasks = [];
        existing.tasks.push(...item.tasks);
      }
      // Keep titles if more descriptive? (Join them if both exist, otherwise take one)
      if (item.text && !existing.text) existing.text = item.text;
    } else {
      map.set(catKey, item);
      consolidated.push(item);
    }
  });

  bl.items = consolidated;
}

export function pushToBacklog(taskText, category) {
  addBacklogItem(taskText, category);
  renderBacklog();
}

initBacklog();
