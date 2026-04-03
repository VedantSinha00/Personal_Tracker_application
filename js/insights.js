// ── insights.js ──────────────────────────────────────────────────────────────
// Owns the Insights tab — data aggregation across all weeks and rendering
// of every chart, heatmap, and summary panel.

import {
  loadCats, loadHabits, allHabits, loadCatArchive, getAbsWk, getMonFromAbs
} from './storage.js';
import { catPalette, resolveCatColor } from './colours.js';
import { parseDuration } from './dailylog.js';

// ── Time-frame options ────────────────────────────────────────────────────────
const TF_OPTIONS = [
  { label: '1 week',   weeks: 1    },
  { label: '2 weeks',  weeks: 2    },
  { label: '1 month',  weeks: 4    },
  { label: '3 months', weeks: 13   },
  { label: '6 months', weeks: 26   },
  { label: '1 year',   weeks: 52   },
  { label: 'All time', weeks: 9999 },
];
let curTF = 0;

// ── Data helpers ──────────────────────────────────────────────────────────────
function getAllWeeks() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_wk_')) keys.push(k);
  }
  return keys.map(k => ({
    key:    k,
    offset: parseInt(k.replace('wt_wk_', ''), 10) || 0,
    data:   JSON.parse(localStorage.getItem(k)),
  }));
}

function getInsightsData() {
  const maxWeeks = TF_OPTIONS[curTF].weeks;
  const all      = getAllWeeks();
  const currentAbsWk = getAbsWk(0);
  const relevant = all.filter(w => w.offset <= currentAbsWk && w.offset >= currentAbsWk - maxWeeks + 1);
  relevant.sort((a, b) => a.offset - b.offset);
  return relevant;
}

function fmtHrs(h) {
  if (h === 0) return '0h';
  const whole = Math.floor(h);
  const mins  = Math.round((h - whole) * 60);
  if (whole === 0) return mins + 'm';
  if (mins  === 0) return whole + 'h';
  return whole + 'h ' + mins + 'm';
}

// ── Init (called once when tab is first opened) ───────────────────────────────
export function initInsights() {
  const row = document.getElementById('tfRow');
  row.innerHTML = TF_OPTIONS.map((o, i) =>
    `<button class="tf-btn${i === curTF ? ' active' : ''}"
      data-action="set-tf" data-tf="${i}">${o.label}</button>`
  ).join('');

  // Delegated listener on the timeframe row
  row.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="set-tf"]');
    if (!btn) return;
    curTF = +btn.dataset.tf;
    row.querySelectorAll('.tf-btn').forEach((b, idx) =>
      b.classList.toggle('active', idx === curTF)
    );
    renderInsights();
  });

  renderInsights();
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderInsights() {
  const weeks     = getInsightsData();
  const container = document.getElementById('insContent');

  if (weeks.length === 0) {
    container.innerHTML = '<div class="ins-empty">No data yet for this time range. Start logging to see patterns here.</div>';
    return;
  }

  // ── Aggregate data across all weeks ──
  let totalHours = 0, totalBlocks = 0, totalRuns = 0, totalFR = 0;
  const focusCounts  = { low: 0, medium: 0, high: 0, none: 0 };
  const cats         = loadCats();
  const hiddenCats   = new Set(cats.filter(c => c.hidden).map(c => c.name));
  const areaHours    = {};
  cats.forEach(c => { 
    if (!c.hidden) {
      areaHours[c.name] = 0; 
    }
  });

  const slotOrder  = ['early-morning', 'morning', 'afternoon', 'evening', 'night', 'late-night'];
  const slotLabels = {
    'early-morning': 'Early morning', 'morning': 'Morning',
    'afternoon': 'Afternoon', 'evening': 'Evening', 'night': 'Night',
    'late-night': 'Late night',
  };
  const slotHours = {};
  slotOrder.forEach(s => { slotHours[s] = 0; });

  const customHabits = loadHabits();
  const habitDays    = {};
  allHabits().forEach(h => { habitDays[h.id] = []; });
  
  const runTgt = customHabits.find(h => h.id === 'run')?.target || 3;

  const weekStats = [];

  weeks.forEach(w => {
    const days = w.data.days || [];
    let wHours = 0, wBlocks = 0;
    days.forEach(day => {
      if (day.habits?.run) totalRuns++;
      if (day.fullRest)    totalFR++;

      if (habitDays['run']  !== undefined) habitDays['run'].push({ done: !!day.habits?.run,  fullRest: !!day.fullRest });
      if (habitDays['rest'] !== undefined) habitDays['rest'].push({ done: !!(day.habits?.rest || day.fullRest), fullRest: !!day.fullRest });
      customHabits.forEach(h => {
        if (habitDays[h.id] !== undefined)
          habitDays[h.id].push({ done: !!(day.habits && day.habits[h.id]), fullRest: !!day.fullRest });
      });

      day.blocks.forEach(b => {
        const cat = b.category || 'Other';
        if (hiddenCats.has(cat)) return; // Exclude hidden agendas

        const h = parseDuration(b.duration);
        wHours += h; totalHours += h;
        wBlocks++; totalBlocks++;
        const fq = b.focusQuality || b.energy || 'none';
        focusCounts[fq] = (focusCounts[fq] || 0) + 1;
        areaHours[cat] = (areaHours[cat] || 0) + h;
        if (b.slot) slotHours[b.slot] = (slotHours[b.slot] || 0) + h;
      });
    });
    const mon = getMonFromAbs(w.offset);
    weekStats.push({
      label:  mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      hours:  wHours,
      blocks: wBlocks,
    });
  });

  const topArea = Object.entries(areaHours).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 0)[0];
  const totalF  = focusCounts.low + focusCounts.medium + focusCounts.high;
  const pct     = v => totalF > 0 ? Math.round(v / totalF * 100) : 0;
  const avgHrs  = weeks.length > 0 ? totalHours / weeks.length : 0;

  // ── Weekly hours bar chart ──
  const maxWkHrs = Math.max(...weekStats.map(w => w.hours), 0.5);
  const barHTML  = weekStats.map(w => {
    const h   = Math.max(6, Math.round((w.hours / maxWkHrs) * 120));
    const cls = w.hours >= 5 ? 'strong' : w.hours >= 2 ? 'partial' : 'light';
    return `<div class="wk-bar-wrap" title="${w.label}: ${fmtHrs(w.hours)}">
      <div class="wk-bar-val">${fmtHrs(w.hours)}</div>
      <div class="wk-bar-col ${cls}" style="height:${h}px"></div>
      <div class="wk-bar-lbl">${w.label.split(' ')[0]}</div>
    </div>`;
  }).join('');

  // ── Habit heatmap ──
  const hmHTML = weeks.map(w => {
    const mon   = getMonFromAbs(w.offset);
    const lbl   = mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const cells = (w.data.days || []).map(day => {
      let cls = 'hm-none';
      if (day.fullRest)          cls = 'hm-fr';
      else if (day.habits?.run && day.habits?.rest) cls = 'hm-both';
      else if (day.habits?.run)                     cls = 'hm-run';
      else if (day.habits?.rest)                    cls = 'hm-rest';
      return `<div class="hm-cell ${cls}"></div>`;
    }).join('');
    return `<div class="hm-week-row"><div class="hm-week-lbl">${lbl}</div>${cells}</div>`;
  }).join('');

  // ── Area hours ──
  const maxArea = Math.max(...Object.values(areaHours), 0.1);
  const areaHTML = Object.entries(areaHours)
    .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])
    .map(([name, hrs]) => {
      const colour = resolveCatColor(name);
      const pctW   = Math.round(hrs / maxArea * 100);
      return `<div class="area-row">
        <div class="area-name">${name}</div>
        <div class="area-bar-bg"><div class="area-bar-fill" style="width:${pctW}%;background:${colour}"></div></div>
        <div class="area-count">${fmtHrs(hrs)}</div>
      </div>`;
    }).join('') || '<div style="font-size:13px;color:var(--text3)">No work blocks in this period.</div>';

  // ── Time of day ──
  const hasSlotData = Object.values(slotHours).some(h => h > 0);
  const maxSlot     = Math.max(...Object.values(slotHours), 0.1);
  const slotHTML    = hasSlotData
    ? slotOrder.filter(s => slotHours[s] > 0).map(s => {
        const pctW = Math.round(slotHours[s] / maxSlot * 100);
        return `<div class="area-row">
          <div class="area-name">${slotLabels[s]}</div>
          <div class="area-bar-bg"><div class="area-bar-fill" style="width:${pctW}%;background:var(--amber)"></div></div>
          <div class="area-count">${fmtHrs(slotHours[s])}</div>
        </div>`;
      }).join('')
    : '<div style="font-size:13px;color:var(--text3)">No time-of-day data yet. Start selecting a time slot when logging blocks.</div>';

  // ── Focus Quality breakdown ──
  const fColors   = { high: 'var(--accent)', medium: 'var(--amber)', low: 'var(--red)' };
  const focusHTML = ['high', 'medium', 'low'].map(f => `
    <div class="focusQuality-card energy-card">
      <div class="energy-val" style="color:${fColors[f]}">${pct(focusCounts[f])}%</div>
      <div class="energy-lbl">${f.toUpperCase()} FOCUS</div>
    </div>`).join('');

  // ── Habit consistency ──
  const habitConsHTML = allHabits().map(h => {
    const days         = habitDays[h.id] || [];
    const activeDays   = days.filter(d => h.id === 'rest' ? true : !d.fullRest);
    const doneDays     = days.filter(d => d.done).length;
    const pctDone      = activeDays.length > 0 ? Math.round(doneDays / activeDays.length * 100) : 0;
    const barColor     = catPalette(h.color).css;
    const pctColor     = pctDone >= 80 ? 'var(--accent)' : pctDone >= 50 ? 'var(--amber)' : 'var(--red)';
    const recent       = days.slice(-28);
    const dotHTML      = recent.map(d => {
      if (d.fullRest) return `<div class="habit-cons-cell fr" style="background:var(--purple);opacity:0.25;" title="Full rest"></div>`;
      if (d.done)     return `<div class="habit-cons-cell done" style="background:${barColor};" title="Done"></div>`;
      return `<div class="habit-cons-cell missed" title="Missed"></div>`;
    }).join('');
    return `
      <div class="habit-cons-row">
        <div class="habit-cons-header">
          <div class="habit-cons-name">
            <div class="habit-cons-dot" style="background:${barColor}"></div>
            ${h.name}${h.target
              ? ` <span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;">(target ${h.target}×/wk)</span>`
              : ''}
          </div>
          <div class="habit-cons-pct" style="color:${pctColor}">${pctDone}%</div>
        </div>
        <div class="habit-cons-bar-bg">
          <div class="habit-cons-bar-fill" style="width:${pctDone}%;background:${barColor}"></div>
        </div>
        <div class="habit-cons-dots">${dotHTML}</div>
      </div>`;
  }).join('');

  // ── Stat row ──
  const statHTML = `
    <div class="stat-card"><div class="stat-val">${fmtHrs(totalHours)}</div><div class="stat-lbl">TOTAL HOURS</div></div>
    <div class="stat-card"><div class="stat-val">${totalBlocks}</div><div class="stat-lbl">BLOCKS</div></div>`;

  // ── Text summary ──
  let summary = `Over the last <strong>${TF_OPTIONS[curTF].label}</strong> you logged <strong>${fmtHrs(totalHours)}</strong> of work across <strong>${weeks.length} week${weeks.length !== 1 ? 's' : ''}</strong> — averaging <strong>${fmtHrs(avgHrs)}/week</strong> (${totalBlocks} blocks). `;
  if (topArea) summary += `Most of your time went to <strong>${topArea[0]}</strong> (${fmtHrs(topArea[1])})${weeks.length > 1 ? " — that's a clear priority signal" : ''}. `;
  if (totalF > 0) {
    const dominant = pct(focusCounts.high) >= 40 ? 'high' : pct(focusCounts.medium) >= 40 ? 'medium' : 'low';
    summary += `Focus was mostly <strong>${dominant}</strong> (${pct(focusCounts[dominant])}% of blocks). `;
  }
  if (totalFR >= 3) summary += `You had <strong>${totalFR} full rest days</strong> — that's on the higher side; worth checking what's draining you. `;
  else if (totalFR > 0) summary += `You took <strong>${totalFR} full rest day${totalFR > 1 ? 's' : ''}</strong>. `;
  if (totalRuns < weeks.length * runTgt) summary += `Runs were inconsistent — averaged ${(totalRuns / weeks.length).toFixed(1)}/week vs. target of ${runTgt}. `;
  else summary += `Running was consistent across the period. `;

  // ── Legend ──
  const arch          = loadCatArchive();
  const catLegendItems = cats.map(c => {
    const p = catPalette(c.color);
    return `<div class="legend-item"><div class="legend-dot" style="background:${p.css}"></div> ${c.name}</div>`;
  }).join('');
  const archLegend = Object.entries(arch)
    .filter(([name]) => (areaHours[name] || 0) > 0 && !cats.find(c => c.name === name))
    .map(([name, color]) => {
      const p = catPalette(color);
      return `<div class="legend-item"><div class="legend-dot" style="background:${p.css};opacity:0.5;"></div> ${name} <span style="font-size:10px;color:var(--text3);">(archived)</span></div>`;
    }).join('');



  // ── Daily journals ──
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const journalEntries = [];
  weeks.forEach(w => {
    const mon = getMonFromAbs(w.offset);
    (w.data.days || []).forEach((day, i) => {
      if (day.journal && day.journal.trim()) {
        const date = new Date(mon);
        date.setDate(mon.getDate() + i);
        journalEntries.push({
          dayName: DAY_NAMES[i],
          date:    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          text:    day.journal.trim(),
        });
      }
    });
  });
  const journalHTML = journalEntries.length > 0
    ? journalEntries.map(e =>
        `<div class="journal-ins-entry">
          <div class="journal-ins-date">${e.dayName}, ${e.date}</div>
          <div class="journal-ins-text">${e.text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>
        </div>`
      ).join('')
    : `<div style="font-size:13px;color:var(--text3);padding:4px 0;">No journal entries in this period. Start journaling in the Daily Log tab.</div>`;

  container.innerHTML = `
    <div class="ins-sec ins-summary-card">
      <div class="ins-lbl">Executive Summary</div>
      <div style="padding:24px;font-size:15px;color:var(--text);line-height:1.9;font-family:var(--font-body);">${summary}</div>
    </div>
    <div class="ins-grid">
      <div class="ins-sec">
        <div class="ins-lbl">Weekly Momentum</div>
        <div style="padding:24px 20px;"><div class="wk-bars">${barHTML}</div></div>
      </div>
      <div class="ins-sec">
        <div class="ins-lbl">Habit Heatmap</div>
        <div style="padding:24px 20px;"><div class="hm-weeks">${hmHTML}</div></div>
      </div>
    </div>
    <div class="ins-grid">
      <div class="ins-sec">
        <div class="ins-lbl">Aereas of Focus</div>
        <div style="padding:24px 20px;"><div class="area-dist">${areaHTML}</div></div>
      </div>
      <div class="ins-sec">
        <div class="ins-lbl">Time of Day Distribution</div>
        <div style="padding:24px 20px;"><div class="area-dist">${slotHTML}</div></div>
      </div>
    </div>
    <div class="ins-sec">
      <div class="ins-lbl">Habit Consistency</div>
      <div class="habit-cons-list">${habitConsHTML}</div>
    </div>
    <div class="ins-grid">
      <div class="ins-sec">
        <div class="ins-lbl">Period Totals</div>
        <div style="padding:24px 20px;"><div class="stat-row">${statHTML}</div></div>
      </div>
      <div class="ins-sec">
        <div class="ins-lbl">Focus Quality Distribution</div>
        <div style="padding:24px 20px;"><div class="energy-row">${focusHTML}</div></div>
      </div>
    </div>
    <div class="ins-sec">
      <div class="ins-lbl">Category Legend</div>
      <div style="padding:20px 24px;">
        <div class="legend-grid">${catLegendItems}${archLegend}</div>
      </div>
    </div>
    <div class="ins-sec">
      <div class="ins-lbl">Daily journals</div>
      <div style="padding:12px 24px;">${journalHTML}</div>
    </div>`;
}

