# Security Remediation Plan

This implementation plan details the steps required to resolve the 7 security findings identified in the [SECURITY_AUDIT.md](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/docs/SECURITY_AUDIT.md).

Remediations are divided into three logical milestones:
1. **Milestone 1: Secrets & Database Isolation (SEC-01, SEC-02)**
2. **Milestone 2: Renderer XSS Hardening & CSP (SEC-03, SEC-04)**
3. **Milestone 3: Auth & Electron Hardening (SEC-05, SEC-06, SEC-07)**

---

## Status Update (2026-05-31)

Two items were partially actioned by the user outside this plan. Current verified state:

| Finding | Done | Still outstanding |
|---------|------|-------------------|
| **SEC-01** | File untracked from the index ✅; added to `.gitignore` ✅ | ❌ **Key is STILL in git history** — `git show 5677fad:testsprite_tests/tmp/config.json` returns the live key (also in `33d0682`). Removing a file in a new commit does not purge old commits. ❓ **Key rotation status unconfirmed.** |
| **SEC-02** | ✅ **Closed.** RLS on for all 7 tables (`rowsecurity = true`); every policy `auth.uid()`-scoped (zero policies lacked it); `supabase/policies.sql` authored | Optional: drop duplicate legacy policies for cleanliness; `git commit` `policies.sql`; consider removing the unused `targets` table. |

> [!CAUTION]
> **SEC-01 is not resolved.** The repo is public and was already pushed, so the leaked key must be assumed harvested. **Rotating the TestSprite key is the real fix and is mandatory** — it instantly neutralizes the leaked copy whether or not history is purged. A history purge (`git filter-repo` / BFG + `git push --force`) is good hygiene but secondary to rotation.

## User Review Required

> [!WARNING]
> **SEC-01 (Secrets Leak)**: Rotate the TestSprite API key in the TestSprite dashboard (mandatory — see CAUTION above). Optionally purge history with `git filter-repo`/BFG followed by a coordinated `git push --force`.
>
> **SEC-02 (Database RLS)**: RLS is reported enabled. Commit `policies.sql` to the repo so the policy set is reviewable/reproducible, and run the cross-user isolation test in the Verification Plan to confirm enforcement.

---

## Proposed Changes

### Component: Secrets & Database Policies

#### [NEW] [policies.sql](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/supabase/policies.sql)
Create a new file containing the Supabase Row-Level Security policies, committed to the repo as the version-controlled source of truth. **RLS is already enabled in the dashboard**, so this file is primarily for reproducibility/review — but it must be **idempotent** because policies may already exist. Each block below is preceded by `DROP POLICY IF EXISTS` so the file can be re-run safely to reconcile the dashboard state. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is already idempotent (no error if on).

> Add a `DROP POLICY IF EXISTS "<name>" ON <table>;` line before every `CREATE POLICY` below (omitted here for brevity). Without it, re-running errors with `policy already exists` on whatever the user created via the dashboard.

```sql
-- Enable Row Level Security (RLS) on all user-specific tables (idempotent)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat_archive ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Table Policies
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile" ON profiles
  FOR DELETE USING (auth.uid() = id);

-- 2. Weekly Data Table Policies
CREATE POLICY "Users can read own weekly_data" ON weekly_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weekly_data" ON weekly_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weekly_data" ON weekly_data
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weekly_data" ON weekly_data
  FOR DELETE USING (auth.uid() = user_id);

-- 3. Categories Table Policies
CREATE POLICY "Users can read own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Habits Table Policies
CREATE POLICY "Users can read own habits" ON habits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habits" ON habits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habits" ON habits
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own habits" ON habits
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Backlog Table Policies
CREATE POLICY "Users can read own backlog" ON backlog
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own backlog" ON backlog
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backlog" ON backlog
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own backlog" ON backlog
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Cat Archive Table Policies
CREATE POLICY "Users can read own cat_archive" ON cat_archive
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cat_archive" ON cat_archive
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cat_archive" ON cat_archive
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cat_archive" ON cat_archive
  FOR DELETE USING (auth.uid() = user_id);
```

#### [COMMAND] Untrack the already-committed secret — ✅ DONE
Already actioned: the file is no longer tracked and is now gitignored (verified via `git ls-files` / `git check-ignore`). For reference, the step was:
```powershell
git rm -r --cached testsprite_tests/tmp
```
> ⚠ **The secret still exists in history** (`git show 5677fad:testsprite_tests/tmp/config.json` returns it). Untracking + a new commit does NOT purge old commits. **Rotate the key** (mandatory) and optionally run a history purge (`git filter-repo`/BFG + coordinated `git push --force`).

#### [MODIFY] [.gitignore](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/.gitignore)
Prevent git from tracking local config files containing API keys or environment secrets.
```diff
 node_modules
 dist/
 .DS_Store
 *.log
 package-lock.json
 build/
 bin/
 obj/
 .claude/
 .playwright-mcp/
 verify-*.png
+testsprite_tests/tmp/
```

---

### Component: Renderer XSS Hardening

#### [NEW] [escape.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/escape.js)
Implement a robust HTML-escaping utility for user-controlled strings before interpolation in template literals.
```javascript
// js/escape.js
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

#### [MODIFY] [toast.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/toast.js)
Refactor toast insertion to prevent potential HTML injection.
```diff
   toast.className = `wt-toast toast-${type}`;
   
   // Icon based on type
   let icon = 'info';
   if (type === 'warning') icon = 'alert-triangle';
   if (type === 'error') icon = 'x-circle';
   if (type === 'success') icon = 'check-circle';
 
-  toast.innerHTML = `
-    <i data-lucide="${icon}" style="width:16px;height:16px;"></i>
-    <span>${msg}</span>
-  `;
+  toast.innerHTML = `
+    <i data-lucide="${icon}" style="width:16px;height:16px;"></i>
+    <span class="toast-msg-text"></span>
+  `;
+  toast.querySelector('.toast-msg-text').textContent = msg;
 
   toastContainer.appendChild(toast);
```

#### [MODIFY] [timer.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/timer.js)
Import the `esc` utility and escape category and intent strings printed inside timer cards.
```diff
 // @ts-check
 // ── timer.js ───────────────────────────────────────────────────────────────
 // Low-level timer logic to avoid circular dependencies between app.js and dailylog.js
 import { loadTimer, saveTimer, wk } from './storage.js';
+import { esc } from './escape.js';
...
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
-          <div style="font-weight:600;">${t.cat}${t.intent ? ' · ' + t.intent : ''}</div>
+          <div style="font-weight:600;">${esc(t.cat)}${t.intent ? ' · ' + esc(t.intent) : ''}</div>
         </div>
         <div style="display:flex; align-items:center; gap:8px;">
           <strong class="active-timer-clock" style="font-family:monospace; font-size:14px;">${timeStr}</strong>
...
   return `
     <div class="active-timer-card" style="${pulseAnim}">
       <div class="active-timer-info">
         <div class="active-timer-cat">Currently Working ${isPaused ? '(Paused)' : ''}</div>
-        <div class="active-timer-intent">${t.cat}${t.intent ? ' — ' + t.intent : ''}</div>
+        <div class="active-timer-intent">${esc(t.cat)}${t.intent ? ' — ' + esc(t.intent) : ''}</div>
       </div>
       <div style="display:flex; align-items:center; gap:12px;">
```

#### [MODIFY] [overview.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/overview.js)
Apply the `esc` filter on `intention`, category name, stack text, and todo text.
```diff
 import { sortedCats } from './storage.js';
 import { todayI, getDayDate, openM, renderDayCard } from './dailylog.js';
 import { catC } from './colours.js';
+import { esc } from './escape.js';
 
 export function renderOv(d) {
...
   // ── Intention ──
   const intention = d.intention || '';
   const intentionHTML = `
     <div class="lp-intention" style="background:var(--surface-elevated); padding:var(--space-4); border-radius:24px; box-shadow:var(--elevation-base); flex: 1;">
       <div class="lp-intention-lbl" style="font-family:var(--font-heading); color:var(--text3); font-size:12px; margin-bottom:var(--space-2); letter-spacing:0.02em; font-weight:500;">This week's intention</div>
       ${intention
-        ? `<div class="lp-intention-text" style="font-size:24px; font-weight:600; color:var(--text); line-height:1.3;">${intention}</div>`
+        ? `<div class="lp-intention-text" style="font-size:24px; font-weight:600; color:var(--text); line-height:1.3;">${esc(intention)}</div>`
         : `<div class="lp-intention-empty" style="color:var(--text3); font-style:italic;">No intention set — go to Stack to write one</div>`}
     </div>`;
...
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
                      background:color-mix(in srgb,${hex} 55%,var(--badge-base,#fff));
-                     color:${textCol};">${c.name}</span>
+                     color:${textCol};">${esc(c.name)}</span>
             ${items.length > 0 ? `<i data-lucide="chevron-down" class="todo-chevron" style="width:16px;height:16px;color:var(--text3);transition:transform 0.2s;"></i>` : ''}
           </div>
           <span class="lp-focus-text${stackText ? '' : ' empty'}" style="line-height:1.4;">
-            ${stackText || 'No focus set'}
+            ${esc(stackText) || 'No focus set'}
           </span>
         </div>
         ${items.length > 0 ? `
           <div class="lp-todos" style="display:flex;flex-direction:column;margin-top:12px;cursor:default;">
             ${items.map((it, idx) => `
               <label class="lp-todo-item${it.done ? ' done' : ''}">
                 <input type="checkbox" ${it.done ? 'checked' : ''}
-                  data-action="tog-todo" data-catname="${c.name}" data-idx="${idx}">
-                <span class="lp-todo-text">${it.text}</span>
+                  data-action="tog-todo" data-catname="${esc(c.name)}" data-idx="${idx}">
+                <span class="lp-todo-text">${esc(it.text)}</span>
               </label>
             `).join('')}
           </div>
         ` : ''}
         <input type="text" class="lp-todo-input" placeholder="Add task..."
-          data-action="add-todo" data-catname="${c.name}"
+          data-action="add-todo" data-catname="${esc(c.name)}"
```

#### [MODIFY] [stack.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/stack.js)
Escape category names, stack focus text, and task text in `buildItem()`. The Stack tab is the primary place users enter free text, so this is a critical sink. Note: `data-catname` attributes are safe to escape — the browser decodes entities back to the original value when read via `dataset`, so listeners are unaffected.
```diff
+import { esc } from './escape.js';
...
   function buildItem(c, level) {
     const hex = resolveHex(c.color);
     const text = badgeTextColor(hex);
     const tasks = stkTodos[c.name] || [];

     return `
       <div class="si focus-${level}" id="si_wrap_${c.name}"
-          data-catname="${c.name}" data-level="${level}">
+          data-catname="${esc(c.name)}" data-level="${level}">
         <div class="si-main">
           <div class="drag-zone" title="Drag to reorder">
             <span class="drag-handle">⠿</span>
-            <span class="stag" style="--badge-hex:${hex};--badge-text:${text};">${c.name}</span>
+            <span class="stag" style="--badge-hex:${hex};--badge-text:${text};">${esc(c.name)}</span>
           </div>
           <input class="sinput" id="si_${c.name}"
             placeholder="Main focus / objective..."
-            value="${stk[c.name] || ''}"
+            value="${esc(stk[c.name] || '')}"
             data-action="stack-input"
-            data-catname="${c.name}">
+            data-catname="${esc(c.name)}">
...
               <div class="task-item" data-idx="${i}">
                 <label class="task-checkbox-wrap" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;">
-                  <input type="checkbox" ${t.done ? 'checked' : ''} data-action="tog-task" data-catname="${c.name}" data-idx="${i}">
-                  <span class="task-text${t.done ? ' done' : ''}" style="${t.done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${t.text}</span>
+                  <input type="checkbox" ${t.done ? 'checked' : ''} data-action="tog-task" data-catname="${esc(c.name)}" data-idx="${i}">
+                  <span class="task-text${t.done ? ' done' : ''}" style="${t.done ? 'text-decoration:line-through;color:var(--text3);' : ''}">${esc(t.text)}</span>
                 </label>
```
> **Note (pre-existing, low risk):** category names are also interpolated into element `id`s (`id="si_${c.name}"`, `id="tasks_${c.name}"`) and reused in `querySelector` calls elsewhere. Escaping the `id` here would break those lookups, so it is intentionally left raw. Category names are user-owned and should be length/character-validated at creation time — tracked separately, not part of this XSS pass.

#### [MODIFY] [backlog.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/backlog.js)
Apply the `esc` filter on backlog category titles, descriptions, and task lists.
```diff
 import { resolveHex, badgeTextColor } from './colours.js';
 import { showToast } from './toast.js';
 import { populateCatSelect, ensureCatExists } from './categories.js';
+import { esc } from './escape.js';
...
   container.innerHTML = backlog.items.map((item, idx) => {
     const c = catsMap[item.category] || { name: item.category, color: 'gray' };
     const hex = resolveHex(c.color);
     const tasks = item.tasks || [];
 
     return `
       <div class="backlog-agenda-card" data-idx="${idx}">
         <div class="backlog-header">
-          <span class="stag" style="background:color-mix(in srgb, ${hex} 20%, transparent); color:var(--text); border:1px solid color-mix(in srgb, ${hex} 30%, transparent);">${item.category}</span>
-          <input class="backlog-title-input" value="${item.text || ''}" 
+          <span class="stag" style="background:color-mix(in srgb, ${hex} 20%, transparent); color:var(--text); border:1px solid color-mix(in srgb, ${hex} 30%, transparent);">${esc(item.category)}</span>
+          <input class="backlog-title-input" value="${esc(item.text || '')}" 
                  data-action="edit-backlog-title" data-idx="${idx}"
                  placeholder="Agenda focus for this area..." 
                  style="flex:1;">
...
         <div class="backlog-task-list">
           ${tasks.map((t, ti) => `
             <div class="backlog-task-item">
               <span class="task-text" contenteditable="true" 
                     data-action="edit-backlog-task" data-idx="${idx}" data-tidx="${ti}">${esc(t.text)}</span>
```

#### [MODIFY] [dailylog.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/dailylog.js)
Apply escaping in habit row templates, entry categories, and notes. Escape the journal entry textbox contents safely.
```diff
 import { syncCustomSelect } from './custom-select.js';
 import { startTimer, stopTimer, togglePauseTimer } from './timer.js';
 import { showToast } from './toast.js';
+import { esc } from './escape.js';
 
 // ── Modal state ───────────────────────────────────────────────────────────────
...
 export function renderDayCard(dayOffset, day, ti, customHabits) {
   const habitDots      = day.habits || {};
   const customHabitHTML = customHabits.map(h => {
     const p       = catPalette(h.color);
     const checked = !!habitDots[h.id];
     return `<label class="habit">
       <input type="checkbox" ${checked ? 'checked' : ''}
         data-action="tog-custom-habit"
         data-day="${dayOffset}" data-habit="${h.id}"
         style="accent-color:${p.css}">
-      <span>${h.name}</span>
+      <span>${esc(h.name)}</span>
     </label>`;
   }).join('');
 
   const blocks = day.blocks || [];
   const isPast = (dayOffset < ti);
   const noBlocks = blocks.length === 0;
 
   const blockPills = blocks.map((b, bi) => {
+    const safeCategory = esc(b.category);
+    // Slice the RAW string first, then escape — slicing escaped text could cut an
+    // HTML entity (e.g. "&amp;") mid-sequence and render garbled output.
+    const rawIntent = b.intent || '';
+    const truncIntent = rawIntent.length > 40 ? rawIntent.slice(0, 40) + '…' : rawIntent;
     const intentLine = b.intent
-      ? `<div class="block-intent">${b.intent.length > 40 ? b.intent.slice(0, 40) + '…' : b.intent}</div>`
+      ? `<div class="block-intent">${esc(truncIntent)}</div>`
       : '';
 
     return `<div class="block-pill" style="${catC(b.category)}" draggable="true"
       data-action="open-block" data-day="${dayOffset}" data-block="${bi}">
       <div class="block-pill-top">
-        <span>${b.category}${b.duration ? ' · ' + b.duration : ''}${b.slot ? ' · ' + b.slot.replace('-', ' ') : ''}</span>
+        <span>${safeCategory}${b.duration ? ' · ' + esc(b.duration) : ''}${b.slot ? ' · ' + esc(b.slot.replace('-', ' ')) : ''}</span>
       </div>
       ${intentLine}
     </div>`;
   }).join('');
...
         <div class="journal-area" style="display:none;">
           <textarea class="journal-ta"
             data-action="save-journal" data-day="${dayOffset}"
             placeholder="How did the day go? What worked, what didn&#39;t?" rows="3"
-          >${day.journal || ''}</textarea>
+          >${esc(day.journal || '')}</textarea>
         </div>
...
 function _renderLinkedTasks(cat, linked = [], targetId = 'fLinkedTasks', rowId = 'linkedTasksRow') {
   const d = load();
   const tasks = (d.todos && d.todos[cat]) ? d.todos[cat] : [];
   const container = document.getElementById(targetId);
   const row = document.getElementById(rowId);
 
   if (tasks.length === 0) {
     if (row) row.style.display = 'block'; // Still show for inline add
     container.innerHTML = '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">No tasks in this area.</div>';
     return;
   }
 
   if (row) row.style.display = 'block';
   const html = tasks.map((t, i) => {
     const isLinked = linked.some(lt => lt.cat === cat && lt.idx === i);
     if (t.done && !isLinked) return '';
     
     const isChecked = t.done || isLinked;
     return `<label class="linked-task-item">
-      <input type="checkbox" data-cat="${cat}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
-      <span ${t.done ? 'style="text-decoration:line-through;color:var(--text3);"' : ''}>${t.text}</span>
+      <input type="checkbox" data-cat="${esc(cat)}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
+      <span ${t.done ? 'style="text-decoration:line-through;color:var(--text3);"' : ''}>${esc(t.text)}</span>
     </label>`;
   }).filter(Boolean).join('');
```

#### [MODIFY] [review.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/review.js)
Escape custom habit names in the Review metrics rendering list.
```diff
 import { load, save, loadCats, allHabits } from './storage.js';
 import { parseDuration } from './dailylog.js';
+import { esc } from './escape.js';
...
   const habitHTML = habitStats.map(h => {
     const target = h.target || 0;
     const pct    = target > 0 ? Math.min(100, Math.round(h.count / target * 100)) : 0;
     const color  = h.color || 'var(--accent)';
 
     return `
       <div class="rv-habit-row">
         <div class="rv-habit-info">
-          <span class="rv-habit-lbl">${h.name.toUpperCase()}</span>
+          <span class="rv-habit-lbl">${esc(h.name).toUpperCase()}</span>
           <span class="rv-habit-val">${h.count}${target ? ' / ' + target : ''}</span>
         </div>
```

#### [MODIFY] [insights.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/insights.js)
Apply escaping to metrics labels and category labels dynamically written inside the Insights section.
```diff
 import {
   loadCats, loadHabits, allHabits, loadCatArchive, getAbsWk, getMonFromAbs
 } from './storage.js';
 import { catPalette, resolveCatColor } from './colours.js';
 import { parseDuration } from './dailylog.js';
+import { esc } from './escape.js';
...
   const barHTML  = weekStats.map(w => {
     const h     = Math.max(8, Math.round((w.hours / maxWkHrs) * 120));
     const catCol = resolveCatColor(w.domCat);
     // Use the resolved color for a vibrant gradient/solid fill
     const barStyle = `height:${h}px; background:${catCol}; border-color: ${catCol}; opacity:${w.hours >= 2 ? 1 : 0.6};`;
     
-    return `<div class="wk-bar-wrap" title="${w.label}: ${fmtHrs(w.hours)} (${w.domCat})">
+    return `<div class="wk-bar-wrap" title="${esc(w.label)}: ${fmtHrs(w.hours)} (${esc(w.domCat)})">
       <div class="wk-bar-val">${fmtHrs(w.hours)}</div>
       <div class="wk-bar-col" style="${barStyle}"></div>
-      <div class="wk-bar-lbl">${w.label.split(' ')[0]}</div>
+      <div class="wk-bar-lbl">${esc(w.label.split(' ')[0])}</div>
     </div>`;
   }).join('');
...
   const areaHTML = Object.entries(areaHours)
     .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])
     .map(([name, hrs]) => {
       const colour = resolveCatColor(name);
       const pctW   = Math.round(hrs / maxArea * 100);
       return `<div class="area-row">
-        <div class="area-name">${name}</div>
+        <div class="area-name">${esc(name)}</div>
         <div class="area-bar-bg"><div class="area-bar-fill" style="width:${pctW}%;background:${colour}"></div></div>
         <div class="area-count">${fmtHrs(hrs)}</div>
       </div>`;
     }).join('') || '<div style="font-size:13px;color:var(--text3)">No work blocks in this period.</div>';
...
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
-            ${h.name}${h.target
+            ${esc(h.name)}${h.target
               ? ` <span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;">(target ${h.target}×/wk)</span>`
               : ''}
           </div>
...
   const catLegendItems = cats.map(c => {
     const p = catPalette(c.color);
-    return `<div class="legend-item"><div class="legend-dot" style="background:${p.css}"></div> ${c.name}</div>`;
+    return `<div class="legend-item"><div class="legend-dot" style="background:${p.css}"></div> ${esc(c.name)}</div>`;
   }).join('');
   const archLegend = Object.entries(arch)
     .filter(([name]) => (areaHours[name] || 0) > 0 && !cats.find(c => c.name === name))
     .map(([name, color]) => {
       const p = catPalette(color);
-      return `<div class="legend-item"><div class="legend-dot" style="background:${p.css};opacity:0.5;"></div> ${name} <span style="font-size:10px;color:var(--text3);">(archived)</span></div>`;
+      return `<div class="legend-item"><div class="legend-dot" style="background:${p.css};opacity:0.5;"></div> ${esc(name)} <span style="font-size:10px;color:var(--text3);">(archived)</span></div>`;
     }).join('');
```

#### [MODIFY] [habits.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/habits.js)
Apply the `esc` filter on custom habit names in the habits settings panel.
```diff
 import { load, save, loadCats, loadHabits, allHabits } from './storage.js';
 import { renderColorPicker, catPalette } from './colours.js';
+import { esc } from './escape.js';
 
 let _selColor = '#4a9e72';
...
   const html = customHabits.map((h, i) => {
     const p = catPalette(h.color);
     return `
       <div class="habit-manager-row" data-idx="${i}">
         <div class="habit-info-group">
           <div class="habit-color-swatch" style="background:${p.css}"></div>
-          <span class="habit-name-lbl">${h.name}</span>
+          <span class="habit-name-lbl">${esc(h.name)}</span>
           <span class="habit-target-lbl">(${h.target || 5}x/wk)</span>
         </div>
```

#### [MODIFY] [categories.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/categories.js)
Apply the `esc` filter on category names and descriptions.
```diff
 import { load, save, loadCats, saveCats, saveCatArchive } from './storage.js';
 import { renderColorPicker, catPalette } from './colours.js';
 import { showToast } from './toast.js';
+import { esc } from './escape.js';
...
   document.getElementById('catList').innerHTML = ordered.map(c => {
     const p = catPalette(c.color);
     return `
       <div class="cat-row" data-idx="${c.originalIdx}" draggable="true">
         <div class="cat-left">
           <i data-lucide="grip-vertical" style="width:16px;height:16px;cursor:grab;color:var(--text3);"></i>
           <div class="cat-color" style="background:${p.css}" data-action="pick-color" data-catidx="${c.originalIdx}"></div>
-          <span class="cat-name">${c.name}</span>
+          <span class="cat-name">${esc(c.name)}</span>
         </div>
```

#### [MODIFY] [custom-select.js](file:///g:/College/PROJECTS/Personal Tracker Application/js/custom-select.js)
Use safe text assignment inside the dropdown triggers instead of `innerHTML` interpolation.
```diff
   const selectedOption = options.find(o => o.selected) || options[0];
-  trigger.innerHTML = `<span>${selectedOption ? selectedOption.innerText : 'Select...'}</span><span class="custom-select-arrow">▼</span>`;
+  trigger.innerHTML = `<span class="custom-select-label"></span><span class="custom-select-arrow">▼</span>`;
+  trigger.querySelector('.custom-select-label').textContent = selectedOption ? selectedOption.innerText : 'Select...';
 
   popover.innerHTML = '';
```

---

### Component: Document & Catcher Hardening

#### [NEW] [error-overlay.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/error-overlay.js)
Create a new file that (a) securely handles uncaught global errors without raw `innerHTML` concatenation, and (b) re-wires the two inline event handlers that strict CSP (`script-src 'self'`) would otherwise block — the font stylesheet `onload` swap and the "Retry Connection" button. This script is loaded **non-deferred in `<head>`**, after the font `<link>` but before `<body>`, so the font link already exists when it runs; the button is wired on `DOMContentLoaded`.
```javascript
// js/error-overlay.js
(function() {
  // ── CSP-safe replacements for the removed inline handlers ──────────────────
  // Font stylesheet: was `media="print" onload="this.media='all'"` in index.html.
  // Swap to media="all" once loaded so the @font-face rules apply.
  const fontLink = document.getElementById('fontStylesheet');
  if (fontLink) {
    if (fontLink.sheet) {            // already loaded before this script ran
      fontLink.media = 'all';
    } else {
      fontLink.addEventListener('load', () => { fontLink.media = 'all'; });
    }
  }

  // Retry button: was `onclick="window.location.reload()"` in index.html.
  document.addEventListener('DOMContentLoaded', () => {
    const retryBtn = document.getElementById('retryConnBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  });

  window.onerror = function(msg, url, line, col, error) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.background = 'red';
    div.style.color = 'white';
    div.style.zIndex = '9999';
    div.style.padding = '20px';
    div.style.fontFamily = 'monospace';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = 'Global Error: ' + msg + '\n' + url + ':' + line + ':' + col + '\n' + (error && error.stack);
    document.body.appendChild(div);
    return false;
  };

  window.addEventListener('unhandledrejection', function(e) {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '80px';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.background = 'orange';
    div.style.color = 'white';
    div.style.zIndex = '9999';
    div.style.padding = '20px';
    div.style.fontFamily = 'monospace';
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = 'Unhandled Rejection: ' + e.reason;
    document.body.appendChild(div);
  });
})();
```

#### [MODIFY] [index.html](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/index.html)
Add Content-Security-Policy meta tag, reference the externalized error overlay, and remove inline event wiring blocks to conform to strict CSP rules.
```diff
 <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
+  <meta http-equiv="Content-Security-Policy"
+        content="default-src 'self';
+                 script-src 'self';
+                 style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
+                 font-src https://fonts.gstatic.com;
+                 connect-src 'self' https://vdskvcjqzyfwhxyxsgag.supabase.co wss://vdskvcjqzyfwhxyxsgag.supabase.co;
+                 img-src 'self' data:;">
   <title>Personal Tracker</title>
   <link rel="icon" type="image/svg+xml" href="assets/logo.svg">
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
-  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Lora:ital,wght@0,400;0,600;1,400&display=swap"
-        media="print" onload="this.media='all'">
+  <!-- onload handler removed (blocked by CSP script-src 'self'); media swap is done in error-overlay.js via #fontStylesheet -->
+  <link id="fontStylesheet" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Lora:ital,wght@0,400;0,600;1,400&display=swap"
+        media="print">
   <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Lora:ital,wght@0,400;0,600;1,400&display=swap"></noscript>
   <link rel="stylesheet" href="css/styles.css?v=phase2_v1">
   <!-- Lucide icons — self-hosted to avoid unpkg.com round trip -->
   <script defer src="vendor/lucide.min.js"></script>
-  <!-- Global error catcher for diagnosing silent module failures -->
-  <script>
-    window.onerror = function(msg, url, line, col, error) {
-      document.body.innerHTML += '<div style="position:fixed;top:0;left:0;width:100%;background:red;color:white;z-index:9999;padding:20px;font-family:monospace;white-space:pre-wrap;">Global Error: ' + msg + '\n' + url + ':' + line + ':' + col + '\n' + (error && error.stack) + '</div>';
-      return false;
-    };
-    window.addEventListener('unhandledrejection', function(e) {
-       document.body.innerHTML += '<div style="position:fixed;top:80px;left:0;width:100%;background:orange;color:white;z-index:9999;padding:20px;font-family:monospace;white-space:pre-wrap;">Unhandled Rejection: ' + e.reason + '</div>';
-    });
-  </script>
+  <!-- Secure externalized error catcher -->
+  <script src="js/error-overlay.js"></script>
   <!-- Supabase JS SDK — self-hosted to avoid cdn.jsdelivr.net round trip -->
   <script defer src="vendor/supabase.min.js"></script>
...
     <div id="initError">
       <h2>Connection Error</h2>
       <p id="initErrorMsg">We're having trouble connecting to the database. This might be due to a slow network or your connection being blocked.</p>
-      <button onclick="window.location.reload()">Retry Connection</button>
+      <!-- onclick removed (blocked by CSP); wired in error-overlay.js -->
+      <button id="retryConnBtn">Retry Connection</button>
     </div>
...
         <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
           <button class="btn" data-action="export" style="display:flex;align-items:center;gap:5px;flex:1;justify-content:center;"><i data-lucide="download" style="width:13px;height:13px;"></i> Export Data</button>
           <button class="btn" id="importBtn" type="button" style="display:flex;align-items:center;gap:5px;flex:1;justify-content:center;">
   <i data-lucide="upload" style="width:13px;height:13px;"></i> Import Data
 </button>
 <input type="file" accept=".json" style="display:none" data-action="import" id="importFile">
-<script>
-  document.getElementById('importBtn').addEventListener('click', () => {
-    const fileInput = document.getElementById('importFile');
-    fileInput.value = '';
-    fileInput.click();
-  });
-  // Close modal after successful import
-  document.addEventListener('wt:import-complete', () => {
-    const modal = document.getElementById('accountModal');
-    if (modal) modal.classList.remove('open');
-  });
-</script>
         </div>
```

#### [MODIFY] [account.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/account.js)
Adopt the event wiring tasks moved out of `index.html` inline script block.
```diff
 // ── Wire listeners ───────────────────────────────────────────────────────────
 document.getElementById('accountBtn').addEventListener('click', openAccountModal);
 document.getElementById('closeAccountBtn').addEventListener('click', closeAccountModal);
 
 // Click outside modal to close
 document.getElementById('accountModal').addEventListener('click', e => {
   if (e.target === e.currentTarget) closeAccountModal();
 });
 
 document.getElementById('saveUsernameBtn').addEventListener('click', handleUpdateUsername);
 
 // Enter key in username field saves username
 document.getElementById('accountUsername').addEventListener('keydown', e => {
   if (e.key === 'Enter') handleUpdateUsername();
 });
+
+// Wire Import elements from index.html (moved out to satisfy CSP 'self')
+document.getElementById('importBtn').addEventListener('click', () => {
+  const fileInput = document.getElementById('importFile');
+  if (fileInput) {
+    fileInput.value = '';
+    fileInput.click();
+  }
+});
+
+document.addEventListener('wt:import-complete', () => {
+  const modal = document.getElementById('accountModal');
+  if (modal) modal.classList.remove('open');
+  document.body.classList.remove('modal-open');
+});
```

---

### Component: Auth & Electron Hardening

#### [MODIFY] [auth.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/auth.js)
Require a pending state flag `wt_login_pending` (generated with timestamps to expire after 10 minutes) before allowing the oauth callback token receiver to run.
```diff
 async function handleGoogleLogin() {
   const redirectTo = isElectron 
     ? 'weekly-tracker://auth-callback' 
     : window.location.origin + window.location.pathname;
 
+  // Set pending login state tokens with a timestamp limit (10 minutes)
+  localStorage.setItem('wt_login_pending', 'true');
+  localStorage.setItem('wt_login_pending_time', Date.now().toString());
+
   const { data, error } = await sb.auth.signInWithOAuth({
     provider: 'google',
     options: {
       redirectTo: redirectTo,
       skipBrowserRedirect: isElectron // Use system browser if in Electron
     }
   });
...
     // Handle Electron Auth Callback
     if (isElectron) {
       window.electronAPI.onAuthCallback(async (urlStr) => {
         console.log('[auth] Received deep link:', urlStr);
         try {
+          const pending = localStorage.getItem('wt_login_pending');
+          const pendingTimeStr = localStorage.getItem('wt_login_pending_time');
+          
+          // Always clear the pending state immediately on Callback trigger
+          localStorage.removeItem('wt_login_pending');
+          localStorage.removeItem('wt_login_pending_time');
+          
+          const pendingTime = pendingTimeStr ? parseInt(pendingTimeStr, 10) : 0;
+          const isExpired = Date.now() - pendingTime > 10 * 60 * 1000;
+
+          if (pending !== 'true' || isExpired) {
+             console.warn('[auth] Rejecting unsolicited or expired auth callback (CSRF prevention)');
+             showBanner('Login rejected: Session expired or was not initiated from this application.');
+             return;
+          }
+
           const url = new URL(urlStr.replace(/^weekly-tracker:\/\/\/?/, 'http://localhost/'));
```

#### [MODIFY] [main.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/main.js)
Ensure `setWindowOpenHandler` enforces `action: 'deny'` default behavior on non-https and in-app requests.
```diff
   // Handle external links
   mainWindow.webContents.setWindowOpenHandler(({ url }) => {
-    if (url.startsWith('https://')) {
-      shell.openExternal(url);
-      return { action: 'deny' };
-    }
-    return { action: 'allow' };
+    if (url.startsWith('https://')) {
+      shell.openExternal(url);
+    }
+    return { action: 'deny' };
   });
```

#### [MODIFY] [auth.js](file:///g:/College/PROJECTS/Personal%20Tracker%20Application/js/auth.js) — SEC-07 (localhost bypass guard)
The localhost auto-login bypass is required for local dev and TestSprite (which drives `http://localhost:8080`), so we do **not** remove it. Instead we (a) make it impossible to trigger in the shipped desktop build, and (b) warn loudly so it can never be shipped silently. The bypass already requires `!isElectron`, so the packaged app is unaffected; this adds an explicit loopback-only + visible-warning guard and a documentation note.
```diff
     const isLocal = !isElectron && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
+    // SEC-07: dev-only login bypass. Loopback + non-Electron only. NEVER serve the
+    // web build on a public/shared host — doing so exposes the mock account to anyone.
+    if (isLocal) {
+      console.warn('[auth] ⚠ DEV LOGIN BYPASS ACTIVE — localhost only. Do not deploy the web build publicly.');
+    }
```
Also add a one-line note to the README / SECURITY_AUDIT (SEC-07) stating the web/localhost mode is dev-only and must never be exposed.

---

## Verification Plan

### Secrets and Database Verification
- **TestSprite API Key — primary check is rotation, not history.** Confirm the old key is revoked in the TestSprite dashboard (a request with the old key must fail). This is the real pass condition. Current history state (informational):
  ```powershell
  git show 5677fad:testsprite_tests/tmp/config.json   # STILL returns the key until history is purged
  git log --all -S "sk-user-0qbt5"                      # lists 5677fad, 33d0682 until purged
  ```
  Untrack/ignore already verified: `git ls-files testsprite_tests/tmp/config.json` is empty and `git check-ignore` matches. If a history purge is performed, re-run the two commands above and confirm they return nothing.
- **Supabase RLS** (reported enabled): As User A, attempt to `select`/`update` rows filtered by User B's `user_id` (e.g. via the SQL editor as an authenticated non-owner, or a second app account). Verify 0 rows / permission denied. Also confirm the app still loads and writes for the owner (proves policies exist, not just deny-all RLS). Commit `policies.sql` and reconcile it with whatever was created in the dashboard.

### Renderer Hardening Verification
- **Stored XSS Attack Vector**: In **each** free-text surface — a **Stack** focus field, a **Stack/Overview** task, a **backlog** item, and a daily **journal** entry — enter:
  ```html
  </textarea><img src=x onerror="alert('XSS-Triggered')">
  ```
  Verify it renders as a literal string and no alert fires. Repeat for a **category name** and **custom habit name**.
- **CSP Validation**: Load the app and open DevTools. Confirm no CSP violations for fonts, styles, Supabase REST/realtime (wss), or scripts.
- **CSP regression — fonts**: Confirm the Inter/Lora web fonts actually render (not the fallback), proving the `error-overlay.js` media-swap replaced the removed inline `onload`.
- **CSP regression — retry button**: Force the init-error screen (e.g. block network on first load) and click **Retry Connection**; verify it reloads, proving the relocated handler works.

### Auth & Electron Verification
- **Deep-link Session Injection (CSRF)**: While logged in, trigger a deep link directly from the command line/browser:
  ```powershell
  start weekly-tracker://auth-callback#access_token=foo&refresh_token=bar
  ```
  Verify the application rejects the login attempt and displays the banner message: *"Login rejected: Session expired or was not initiated from this application."*
- **setWindowOpenHandler Validation**: Attempt to trigger an in-app browser opening. Verify it is blocked.
- **SEC-07 (dev bypass)**: Confirm the `⚠ DEV LOGIN BYPASS ACTIVE` console warning appears when served on `localhost`, and that the packaged desktop app (Electron) never hits the bypass.

---

## Coverage Notes
- **`innerHTML` files reviewed but intentionally NOT changed:** `colours.js` (renders only color-picker swatches from hex values — no free text), `app.js:355` (renders `info.version` from GitHub release metadata via the updater — not user-controlled; acceptable to leave). All other `innerHTML` sites carrying user text are covered by the escaping changes above.
- **CSP `img-src`:** verified no remote images are rendered (only local `assets/logo.svg`); `img-src 'self' data:` is sufficient. No `googleusercontent.com` avatar is used.
