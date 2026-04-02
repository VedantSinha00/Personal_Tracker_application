// ── timer.js ───────────────────────────────────────────────────────────────
// Low-level timer logic to avoid circular dependencies between app.js and dailylog.js
import { loadTimer, saveTimer } from './storage.js';

let _timerInterval = null;

export function startTimer(cat, intent, offsetMinutes = 0, notes = '', linkedTasks = []) {
  const startTime = Date.now() - (offsetMinutes * 60 * 1000);
  const t = { cat, intent, startTime, notes, linkedTasks };
  saveTimer(t);
  initTimerTick();
}

export function stopTimer() {
  const t = loadTimer();
  if (!t) return null;
  const elapsedMs = Date.now() - t.startTime;
  const minutes = Math.floor(elapsedMs / 60000);
  
  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = null;
  saveTimer(null);
  
  const indicator = document.getElementById('timerIndicator');
  if (indicator) indicator.style.display = 'none';

  // Clear other displays
  const ovContainer = document.getElementById('ovTimerContainer');
  if (ovContainer) { ovContainer.innerHTML = ''; ovContainer.dataset.cat = ''; }
  
  const today = new Date().getDay();
  const ti = today === 0 ? 6 : today - 1;
  const dayTimer = document.getElementById(`dayTimer-${ti}`);
  if (dayTimer) { dayTimer.innerHTML = ''; dayTimer.dataset.cat = ''; }
  
  return { ...t, minutes };
}

export function initTimerTick() {
  const t = loadTimer();
  if (!t) return;

  const indicator = document.getElementById('timerIndicator');
  const badge = document.getElementById('timerCategoryBadge');
  const display = document.getElementById('timerDisplay');
  
  if (indicator) indicator.style.display = 'flex';
  if (badge) badge.textContent = t.cat;
  
  if (_timerInterval) clearInterval(_timerInterval);
  
  _timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - t.startTime;
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

    // 6-hour limit check
    if (totalSecs === 6 * 3600) {
      // In-app notification placeholder instead of alert
      console.warn("6-hour timer limit reached.");
    }
  }, 1000);
}

function updateOtherTimerDisplays(t, timeStr) {
  // 1. Overview Tab
  const ovContainer = document.getElementById('ovTimerContainer');
  if (ovContainer) {
    if (!ovContainer.innerHTML || ovContainer.dataset.cat !== t.cat) {
      ovContainer.dataset.cat = t.cat;
      ovContainer.innerHTML = renderActiveTimerCard(t, timeStr);
    } else {
      const clock = ovContainer.querySelector('.active-timer-clock');
      if (clock) clock.textContent = timeStr;
    }
  }

  // 2. Weekly Log (Today's Card)
  const today = new Date().getDay();
  const ti = today === 0 ? 6 : today - 1;
  const dayTimer = document.getElementById(`dayTimer-${ti}`);
  if (dayTimer) {
    if (!dayTimer.innerHTML || dayTimer.dataset.cat !== t.cat) {
      dayTimer.dataset.cat = t.cat;
      dayTimer.innerHTML = renderActiveTimerCard(t, timeStr, true);
    } else {
      const clock = dayTimer.querySelector('.active-timer-clock');
      if (clock) clock.textContent = timeStr;
    }
  }
}

function renderActiveTimerCard(t, timeStr, compact = false) {
  if (compact) {
    return `
      <div class="active-timer-card" style="margin-top:10px; padding:8px 12px; gap:8px;">
        <div class="active-timer-info">
          <div class="active-timer-cat" style="font-size:9px;">WORKING ON</div>
          <div class="active-timer-intent" style="font-size:12px;">${t.cat}${t.intent ? ': ' + t.intent : ''}</div>
        </div>
        <div class="active-timer-clock" style="font-size:16px;">${timeStr}</div>
      </div>
    `;
  }
  return `
    <div class="active-timer-card">
      <div class="active-timer-info">
        <div class="active-timer-cat">Currently Working</div>
        <div class="active-timer-intent">${t.cat}${t.intent ? ' — ' + t.intent : ''}</div>
      </div>
      <div class="active-timer-clock">${timeStr}</div>
    </div>
  `;
}
