// ── overview.js ──────────────────────────────────────────────────────────────
// Renders the Overview (landing) tab — intention, focus grid, habits,
// and this-week streaks. Read-only display except for habit checkboxes.

import { FULL } from './constants.js';
import {
  load, save, loadFocus, loadTargets, allHabits, wk,
} from './storage.js';
import { resolveHex, badgeTextColor } from './colours.js';
import { sortedCats } from './storage.js';
import { todayI, getDayDate } from './dailylog.js';

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
    return `
      <div class="lp-focus-item lp-${level}">
        <span class="lp-focus-badge"
          style="--badge-hex:${hex};--badge-text:${textCol};
                 background:color-mix(in srgb,${hex} 40%,var(--badge-base,#fff));
                 color:${textCol};">${c.name}</span>
        <span class="lp-focus-text${stackText ? '' : ' empty'}">
          ${stackText || 'No focus set'}
        </span>
      </div>`;
  }

  const focusHTML = `
    <div class="lp-section">
      <div class="lp-section-hdr">
        TODAY — ${FULL[ti].toUpperCase()}, ${todayDate.toUpperCase()}
      </div>
      <div class="lp-focus-grid">
        ${highCats.map(c => focusItem(c, 'high')).join('')}
      </div>
      ${lowCats.length ? `
        <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;
                    letter-spacing:0.4px;margin:10px 0 6px;">LOW FOCUS</div>
        <div class="lp-focus-grid" style="opacity:0.75;">
          ${lowCats.map(c => focusItem(c, 'low')).join('')}
        </div>` : ''}
    </div>`;

  // ── Habits (interactive checkboxes) ──
  const allH      = allHabits();
  const habitDots = todayDay.habits || {};

  const habitsHTML = `
    <div class="lp-section">
      <div class="lp-section-hdr">HABITS TODAY</div>
      <div class="lp-habits">
        ${allH.map(h => {
          const isBuiltin = h.builtin;
          const done = isBuiltin
            ? (h.id === 'run' ? !!todayDay.run : !!todayDay.rest)
            : !!habitDots[h.id];
          const hex = resolveHex(h.color);
          return `
            <label class="lp-habit-chip${done ? ' done' : ''}">
              <input type="checkbox" class="lp-habit-check"
                ${done ? 'checked' : ''}
                style="accent-color:${hex}"
                data-action="${isBuiltin ? 'tog-builtin' : 'tog-custom'}"
                data-habit="${h.id}"
                data-day="${ti}">
              ${h.name}
            </label>`;
        }).join('')}
      </div>
    </div>`;

  // ── Habit streaks this week ──
  const t = loadTargets();
  const streaksHTML = `
    <div class="lp-section">
      <div class="lp-section-hdr">THIS WEEK</div>
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

  el.innerHTML = intentionHTML + focusHTML + habitsHTML + streaksHTML;
}

// ── Event wiring ──────────────────────────────────────────────────────────────
export function initOverviewListeners() {
  // Delegated habit checkbox changes on the overview panel
  document.getElementById('ovMain').addEventListener('change', e => {
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
    }
  });
}
