import { DAYS, FULL } from './constants.js';
import {
  load, save, loadFocus, loadTargets, allHabits, wk, loadHabits
} from './storage.js';
import { resolveHex, badgeTextColor } from './colours.js';
import { sortedCats } from './storage.js';
import { todayI, getDayDate, openM, renderDayCard } from './dailylog.js';
import { catC } from './colours.js';

export function renderOv(d) {
  const el = document.getElementById('ovMain');
  if (!el) return;
  const ti = todayI();

  // ── Intention ──
  const intention = d.intention || '';
  const intentionHTML = `
    <div class="lp-intention">
      <div class="lp-intention-lbl">THIS WEEK'S INTENTION</div>
      ${intention
        ? `<div class="lp-intention-text">${intention}</div>`
        : `<div class="lp-intention-empty">No intention set — go to Stack to write one</div>`}
    </div>`;

  if (ti < 0) {
    el.innerHTML = intentionHTML +
      `<div style="font-size:13px;color:var(--text3);padding:1rem 0;">
        Viewing a past or future week — switch to the current week to see today's view.
      </div>`;
    return;
  }

  const cats     = sortedCats();
  const focus    = loadFocus();
  const stk      = d.stack || {};
  const todayDay = d.days[ti];
  const todayDate = getDayDate(ti);

  // ── Focus items ──
  const highCats = cats.filter(c => (focus[c.name] || 'high') === 'high');
  const lowCats  = cats.filter(c => (focus[c.name] || 'high') === 'low');

  function focusItem(c, level) {
    const hex      = resolveHex(c.color);
    const textCol  = badgeTextColor(hex);
    const stackText = stk[c.name] || '';
    const items    = (d.todos && d.todos[c.name]) || [];

    return `
      <div class="lp-focus-item lp-${level}" ${items.length > 0 ? 'data-action="toggle-todos" style="cursor:pointer;"' : ''}>
        <div class="lp-focus-main" style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="lp-focus-badge"
              style="--badge-hex:${hex};--badge-text:${textCol};
                     background:color-mix(in srgb,${hex} 40%,var(--badge-base,#fff));
                     color:${textCol};">${c.name}</span>
            ${items.length > 0 ? `<i data-lucide="chevron-down" class="todo-chevron" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;"></i>` : ''}
          </div>
          <span class="lp-focus-text${stackText ? '' : ' empty'}" style="line-height:1.4;">
            ${stackText || 'No focus set'}
          </span>
        </div>
        ${items.length > 0 ? `
          <div class="lp-todos" style="display:flex;flex-direction:column;margin-top:12px;cursor:default;">
            ${items.map((it, idx) => `
              <label class="lp-todo-item${it.done ? ' done' : ''}">
                <input type="checkbox" ${it.done ? 'checked' : ''}
                  data-action="tog-todo" data-catname="${c.name}" data-idx="${idx}">
                <span class="lp-todo-text">${it.text}</span>
              </label>
            `).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  const focusHTML = `
    <div class="lp-section">
      <h2 style="font-size:24px;font-weight:500;color:var(--text);margin-bottom:1.5rem;letter-spacing:-0.4px;">
        TODAY — ${FULL[ti].toUpperCase()}, ${todayDate.toUpperCase()}
      </h2>
      <div class="lp-focus-grid">
        ${highCats.map(c => focusItem(c, 'high')).join('')}
      </div>
      ${lowCats.length ? `
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;
                    letter-spacing:0.4px;margin:16px 0 8px;">LOW FOCUS</div>
        <div class="lp-focus-grid" style="opacity:0.75;">
          ${lowCats.map(c => focusItem(c, 'low')).join('')}
        </div>` : ''}
    </div>`;

  // ── Today's Log Card ──
  const dayCardHTML = `
    <div class="lp-section">
      <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;letter-spacing:0.4px;margin-bottom:12px;">DAILY LOG</div>
      <div class="ov-day-wrap" style="max-width:320px;">
        ${renderDayCard(ti, todayDay, ti, loadHabits())}
      </div>
    </div>`;

  // ── Habit streaks this week ──
  const t = loadTargets();
  const allH = allHabits();
  const streaksHTML = `
    <div class="lp-section">
      <div class="lp-section-hdr">THIS WEEK STREAKS</div>
      <div class="lp-streaks">
        ${allH.map(h => {
          const count = h.builtin
            ? d.days.filter(day => h.id === 'run' ? day.run : day.rest).length
            : d.days.filter(day => day.habits && day.habits[h.id]).length;
          const target = h.builtin
            ? (h.id === 'run' ? t.runs : t.rest)
            : (h.target || 7);
          const onTrack = count >= Math.round(target * (ti + 1) / 7);
          return `
            <div class="lp-streak-item" style="${onTrack ? 'border-color:var(--accent);' : ''}">
              ${h.name} · <span class="streak-count">${count}</span>
              <span style="color:var(--text3)"> / ${target}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  const splitHTML = `
    <div style="display:flex;gap:2.5rem;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1;min-width:300px;">
        ${intentionHTML}
        ${focusHTML}
      </div>
      <div style="width:320px;flex-shrink:0;display:flex;flex-direction:column;gap:1.5rem;">
        ${streaksHTML}
        ${dayCardHTML}
      </div>
    </div>
  `;

  el.innerHTML = splitHTML;
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: el });
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────
export function initOverviewListeners() {
  document.getElementById('ovMain').addEventListener('click', e => {
    // ── Pre-existing: Custom event toggles (if any persist) ──
    const tog = e.target.closest('[data-action="tog-builtin"]');
    if (tog) {
      document.dispatchEvent(new CustomEvent('wt:tog-habit', {
        detail: { day: +tog.dataset.day, habit: tog.dataset.habit }
      }));
      return;
    }
    const cust = e.target.closest('[data-action="tog-custom"]');
    if (cust) {
      document.dispatchEvent(new CustomEvent('wt:tog-custom-habit', {
        detail: { day: +cust.dataset.day, habit: cust.dataset.habit }
      }));
      return;
    }

    // Delegated click for today's block logging from Overview
    const ti = todayI();
    if (ti >= 0) { // Only allow logging/editing for current week
      if (e.target.closest('[data-action="ov-log-block"]')) { openM(ti, 'new'); return; }
      const editBtn = e.target.closest('[data-action="ov-edit-block"]');
      if (editBtn) { openM(ti, +editBtn.dataset.block); return; }
    }

    // ── Accordion toggle for tasks ──
    const focusItemWrap = e.target.closest('[data-action="toggle-todos"]');
    // Don't toggle accordion if the user clicked exactly on a checkbox or label inside
    if (focusItemWrap && !e.target.closest('.lp-todo-item')) {
      const todosEl = focusItemWrap.querySelector('.lp-todos');
      const chevron = focusItemWrap.querySelector('.todo-chevron');
      if (todosEl) {
        const isCollapsed = focusItemWrap.classList.contains('collapsed');
        if (isCollapsed) {
          focusItemWrap.classList.remove('collapsed');
          todosEl.style.display = 'flex';
          if (chevron) chevron.style.transform = '';
        } else {
          focusItemWrap.classList.add('collapsed');
          todosEl.style.display = 'none';
          if (chevron) chevron.style.transform = 'rotate(-90deg)';
        }
      }
      return;
    }
  });

  document.getElementById('ovMain').addEventListener('change', e => {
    // ── Task checkbox tick-off ──
    if (e.target.closest('[data-action="tog-todo"]')) {
      const r = e.target.closest('[data-action="tog-todo"]');
      const cname = r.dataset.catname;
      const tIdx = +r.dataset.idx;

      const d = load();
      if (!d.todos) d.todos = {};
      if (d.todos[cname] && d.todos[cname][tIdx]) {
        d.todos[cname][tIdx].done = r.checked;
        save(d);
        document.dispatchEvent(new CustomEvent('wt:day-changed'));
      }
    }
  });
}
