// ── timer.js ───────────────────────────────────────────────────────────────
// Low-level timer logic to avoid circular dependencies between app.js and dailylog.js
import { loadTimer, saveTimer } from './storage.js';

let _timerInterval = null;

export function startTimer(cat, intent, offsetMinutes = 0, notes = '', linkedTasks = []) {
  const startTime = Date.now() - (offsetMinutes * 60 * 1000);
  const t = { cat, intent, startTime, notes, linkedTasks, accumulatedMs: 0, isPaused: false };
  saveTimer(t);
  initTimerTick();
}

export function togglePauseTimer() {
  const t = loadTimer();
  if (!t) return;
  t.accumulatedMs = t.accumulatedMs || 0;
  if (t.isPaused) {
    t.isPaused = false;
    t.startTime = Date.now();
  } else {
    t.isPaused = true;
    t.accumulatedMs += Date.now() - t.startTime;
  }
  saveTimer(t);
  initTimerTick();
}

export function stopTimer(preserve = false) {
  const t = loadTimer();
  if (!t) return null;
  t.accumulatedMs = t.accumulatedMs || 0;
  const currentSessionElapsed = t.isPaused ? 0 : Date.now() - t.startTime;
  const elapsedMs = t.accumulatedMs + currentSessionElapsed;
  const minutes = Math.floor(elapsedMs / 60000);
  
  if (!preserve) {
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = null;
    saveTimer(null);
    
    const indicator = document.getElementById('stopwatchIndicator');
    if (indicator) {
      indicator.style.display = 'none';
      indicator.dataset.active = 'false';
    }

    // Clear other displays
    const ovContainer = document.getElementById('ovTimerContainer');
    if (ovContainer) { ovContainer.innerHTML = ''; ovContainer.dataset.cat = ''; }
    
    const today = new Date().getDay();
    const ti = today === 0 ? 6 : today - 1;
    const dayTimers = document.querySelectorAll(`.day-timer-target[data-day="${ti}"]`);
    dayTimers.forEach(dt => { dt.innerHTML = ''; dt.dataset.cat = ''; });
  }
  
  return { ...t, minutes };
}

export function initTimerTick() {
  const t = loadTimer();
  if (!t) return;

  const indicator = document.getElementById('stopwatchIndicator');
  const badge = document.getElementById('stopwatchCategoryBadge');
  const display = document.getElementById('stopwatchDisplay');
  
  if (indicator) {
    indicator.dataset.active = 'true';
    const activeTab = localStorage.getItem('wt_active_tab') || 'ov';
    indicator.style.display = (activeTab === 'ov') ? 'none' : 'flex';
  }
  if (badge) badge.textContent = t.cat;
  
  if (_timerInterval) clearInterval(_timerInterval);
  
  // Define update tick logic so it can be called immediately
  const tick = () => {
    t.accumulatedMs = t.accumulatedMs || 0;
    const currentSessionElapsed = t.isPaused ? 0 : Date.now() - t.startTime;
    const elapsedMs = t.accumulatedMs + currentSessionElapsed;
    
    const totalSecs = Math.floor(elapsedMs / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    
    if (display) {
      display.textContent = (h > 0 ? h + ':' : '') + 
                            (m < 10 && h > 0 ? '0' : '') + m + ':' + 
                            (s < 10 ? '0' : '') + s;
    }

    const timeStr = (h > 0 ? h + ':' : '') + (m < 10 && h > 0 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    updateOtherTimerDisplays(t, timeStr);

    // Update global navbar button
    const toggleBtn = document.getElementById('navPauseResumeBtn');
    if (toggleBtn) {
      toggleBtn.textContent = t.isPaused ? 'Resume' : 'Pause';
    }

    // 6-hour limit check
    if (totalSecs === 6 * 3600 && !t.isPaused) {
      console.warn("6-hour timer limit reached.");
    }
  };

  tick(); // Run immediately
  _timerInterval = setInterval(tick, 1000);
}

function updateOtherTimerDisplays(t, timeStr) {
  // 1. Overview Tab
  const ovContainer = document.getElementById('ovTimerContainer');
  if (ovContainer) {
    const stateMatch = ovContainer.dataset.cat === t.cat && ovContainer.dataset.paused === t.isPaused.toString();
    if (!ovContainer.innerHTML || !stateMatch) {
      ovContainer.dataset.cat = t.cat;
      ovContainer.dataset.paused = t.isPaused.toString();
      ovContainer.innerHTML = renderActiveTimerCard(t, timeStr);
    } else {
      const clock = ovContainer.querySelector('.active-timer-clock');
      if (clock) clock.textContent = timeStr;
    }
  }

  // 2. Weekly Log (Today's Card)
  const today = new Date().getDay();
  const ti = today === 0 ? 6 : today - 1;
  const dayTimers = document.querySelectorAll(`.day-timer-target[data-day="${ti}"]`);
  dayTimers.forEach(dt => {
    const stateMatch = dt.dataset.cat === t.cat && dt.dataset.paused === t.isPaused.toString();
    if (!dt.innerHTML || !stateMatch) {
      dt.dataset.cat = t.cat;
      dt.dataset.paused = t.isPaused.toString();
      dt.innerHTML = renderActiveTimerCard(t, timeStr, true);
    } else {
      const clock = dt.querySelector('.active-timer-clock');
      if (clock) clock.textContent = timeStr;
    }
  });
}

function renderActiveTimerCard(t, timeStr, compact = false) {
  const isPaused = t.isPaused;
  const pulseAnim = isPaused ? '' : 'animation: gentle-pulse 2s infinite;';
  const pauseBg = isPaused ? 'background:var(--amber-bg); color:var(--amber); border-color:var(--amber);' : '';
  const btnTxt = isPaused ? 'Resume' : 'Pause';

  if (compact) {
    return `
      <div class="block-pill ${isPaused ? 'paused' : 'running'}" style="${pulseAnim}${pauseBg} cursor:pointer; display:flex; justify-content:space-between; align-items:center;"
        data-action="timer-action" data-type="stop">
        <div>
          <span style="font-size:10px; opacity:0.8;">WORKING ROUND</span>
          <div style="font-weight:600;">${t.cat}${t.intent ? ' · ' + t.intent : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong class="active-timer-clock" style="font-family:monospace; font-size:14px;">${timeStr}</strong>
          <button class="btn-s" data-action="timer-action" data-type="pause"
            style="padding:2px 6px; font-size:10px; border-radius:4px;">${btnTxt}</button>
          <button class="btn-s" data-action="timer-action" data-type="stop"
            style="padding:2px 6px; font-size:10px; border-radius:4px; background:var(--red-bg); color:var(--red);">Stop</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="active-timer-card" style="${pulseAnim}">
      <div class="active-timer-info">
        <div class="active-timer-cat">Currently Working ${isPaused ? '(Paused)' : ''}</div>
        <div class="active-timer-intent">${t.cat}${t.intent ? ' — ' + t.intent : ''}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="active-timer-clock">${timeStr}</div>
        <button class="btn" style="padding:4px 10px; font-size:12px;" data-action="timer-action" data-type="pause">${btnTxt}</button>
        <button class="btn" style="padding:4px 10px; font-size:12px; background:var(--red-bg); color:var(--red); border-color:transparent;" data-action="timer-action" data-type="stop">Stop</button>
      </div>
    </div>
  `;
}
