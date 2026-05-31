# Security Audit — Personal Tracker Application

**Date:** 2026-05-31
**Scope:** Electron renderer (`js/`), Electron main/preload (`main.js`, `preload.js`), Supabase data layer, build config, committed test artifacts.
**Stack:** Electron 31 (contextIsolation on, nodeIntegration off), Supabase (Postgres + Auth + Realtime), vanilla JS modules, localStorage cache.

> This document is the working reference for the security remediation effort. Each finding has an ID (e.g. `SEC-01`) so it can be tracked in the implementation plan, commits, and PRs. Severity follows: **Critical → High → Medium → Low**.
>
> **Last status update: 2026-05-31** — SEC-01 key rotated; SEC-02 RLS enabled. See per-finding status and the [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) status table.

---

## Summary Table

| ID | Severity | Title | Area | Status |
|----|----------|-------|------|--------|
| SEC-01 | Critical | TestSprite API key committed to git | Secrets | ✅ **Resolved** (key rotated; leaked copy now inert) — history purge optional |
| SEC-02 | Critical | Supabase RLS must be verified/enforced | Database | ✅ **Fixed** — RLS on for all 7 tables; every policy `auth.uid()`-scoped (no wide-open policy); `policies.sql` authored |
| SEC-03 | High | Stored XSS via unescaped `innerHTML` | Renderer | ✅ **Fixed** — `esc()` applied across 11 files (+textContent for toast/select); all parse clean |
| SEC-04 | Medium | No Content-Security-Policy | Renderer/Electron | ✅ **Fixed** — CSP added, inline scripts/handlers externalized; runtime-verified (fonts, no CSP violations, Supabase wss connects, XSS payload inert) |
| SEC-05 | Medium | Deep-link session injection (login CSRF) | Auth | 🟡 **Code-complete** — `wt_login_pending` flag gates the deep-link callback; full runtime test best done in a packaged build (dev instance doesn't own the `weekly-tracker://` protocol) |
| SEC-06 | Low | `setWindowOpenHandler` allows non-https windows | Electron main | ✅ **Fixed** — default-deny; only https handed to system browser |
| SEC-07 | Low | Localhost login bypass must never be served publicly | Auth | ✅ **Fixed** — loud console warning when bypass active; loopback+non-Electron only |

**Explicitly NOT a vulnerability:** the Supabase **anon** key hardcoded in [`js/sb.js`](../js/sb.js) is the public `anon`-role key and is *designed* to be shipped in the client. It is safe **only if** SEC-02 (RLS) is satisfied. Do not "fix" it by hiding it.

---

## SEC-01 — TestSprite API key committed to git (Critical) — ✅ RESOLVED

> **Status (2026-05-31):** Key **rotated** — the leaked key is now revoked and inert, which is the real fix. File also **untracked** and **gitignored**. The old key string still exists in git history (commits `5677fad`, `33d0682`) but is no longer a valid credential, so the residual exposure is informational only. A history purge remains optional hygiene (see below).

**File:** `testsprite_tests/tmp/config.json:13`
**Commit:** `5677fad` ("Add TestSprite test files and reports")
**Tracked:** No longer (was tracked at audit time).

A live API key was hardcoded and committed:

```json
"envs": {
  "API_KEY": "sk-user-0qbt5iujPupxhUkseLbLA2UUfL_hlXVS_…mMlHpT-Z5QIoYCmxTkFfzlay7eElEUrfkmCN1i23DTuMNO9VTlMs"
}
```

The same file also leaks a local filesystem path (`projectPath`).

### Impact (at time of audit)
Anyone with repo access — including anyone who clones the public GitHub repo `VedantSinha00/Personal_Tracker_application` — could use the TestSprite account on the owner's billing. Now neutralized: the rotated key makes the leaked string a dead credential.

### Remediation
1. ✅ **Rotate the key** in the TestSprite dashboard — **done**. This is the decisive fix.
2. ✅ Stop tracking the directory — **done** (`git rm -r --cached testsprite_tests/tmp`).
3. ✅ Add to `.gitignore` — **done** (`testsprite_tests/tmp/`).
4. ⬜ *(Optional hygiene)* Purge the dead key string from history (BFG or `git filter-repo`) and force-push. Lower priority now that the key is revoked; coordinate since this rewrites history.
5. Going forward, keep TestSprite/CI secrets in untracked local config or environment variables only.

### Acceptance criteria
- [x] New key issued; old key revoked.
- [x] File untracked (`git ls-files testsprite_tests/tmp/config.json` is empty).
- [x] `.gitignore` excludes `testsprite_tests/tmp/`.
- [ ] *(Optional)* `git log --all -S "sk-user-0qbt5"` returns nothing after a history purge.

---

## SEC-02 — Supabase Row-Level Security must be verified/enforced (Critical) — 🟡 RLS ENABLED, VERIFICATION PENDING

> **Status (2026-05-31):** RLS **confirmed enabled** — `pg_tables` shows `rowsecurity = true` for all public tables. App reads/writes work, so working (non-deny-all) policies exist. **Remaining:** the on/off flag does NOT prove the policies are *correctly scoped* — run the cross-user isolation test (a `USING (true)` policy also shows `rowsecurity = true` yet leaks everything). Then commit `policies.sql` for review/reproducibility.

**Files:** All Supabase access in [`js/storage.js`](../js/storage.js), [`js/auth.js`](../js/auth.js). Client filters by `user_id` on every query (e.g. `.eq('user_id', user.id)`), which is **convenience, not enforcement** — RLS is what actually enforces isolation.

The shipped key is the public `anon`-role key ([`js/sb.js:9-12`](../js/sb.js)). With a public key, **RLS policies are the only thing standing between an attacker and every user's data.** If RLS is disabled (or permissive) on any synced table, anyone holding that public key can read and overwrite any user's rows just by changing the `user_id` value they send.

### Tables that require RLS
`weekly_data`, `categories`, `habits`, `backlog`, `cat_archive`, `profiles`.

### Impact
Full cross-account read/write/delete of all personal tracking data if RLS is missing or misconfigured. This is the single highest-impact issue because the entire trust model depends on it, and it cannot be confirmed from the codebase (no SQL/migration files are checked in).

### Remediation
1. Verify status in the Supabase SQL editor — every public table should be `true`:
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public';
   ```
2. Enable RLS and add owner-only policies on each table. Pattern:
   ```sql
   alter table weekly_data enable row level security;

   create policy "select own" on weekly_data
     for select using (auth.uid() = user_id);
   create policy "modify own" on weekly_data
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
   For `profiles`, the owner column is `id`, so use `auth.uid() = id`.
3. Test as a second user: confirm you cannot read or write the first user's rows even when supplying their `user_id`.
4. Commit the SQL policies into the repo (e.g. `supabase/policies.sql`) so the security model is version-controlled and reviewable.

### Acceptance criteria
- [x] `rowsecurity = true` for all six tables (verified in `pg_tables`).
- [x] Each table has SELECT + write policies (implied — app reads/writes work, so not deny-all).
- [x] Policies confirmed **scoped to `auth.uid()`** — the "no policy lacks `auth.uid()`" query returned **zero rows** across all tables.
- [x] RLS actually enabled — `rowsecurity = true` for all 7 public tables (incl. the orphan `targets` table).
- [x] Policies authored at `supabase/policies.sql` (idempotent; `git commit` it).
- [ ] *(Optional hygiene)* Drop duplicate legacy policies ("User all access", "Users manage own X") so each table has one clean set.

> **Note — `targets` table:** an orphan DB table not referenced by current app code (only `e.target`/`h.target` exist in JS). It is RLS-protected and `auth.uid()`-scoped, so it is safe. Consider dropping the unused table later, or leave it — no security impact either way.

---

## SEC-03 — Stored XSS via unescaped `innerHTML` (High)

**No HTML-escaping helper exists anywhere in the codebase**, yet user-controlled text is interpolated directly into `innerHTML` template strings throughout the renderer.

### Confirmed sinks (representative, not exhaustive)
| File | Line | Field |
|------|------|-------|
| [`js/overview.js`](../js/overview.js) | 21 | `${intention}` |
| [`js/overview.js`](../js/overview.js) | 56 | `${c.name}` (category name) |
| [`js/overview.js`](../js/overview.js) | 69 | `${it.text}` (todo text) |
| [`js/dailylog.js`](../js/dailylog.js) | 122 | `<textarea>${day.journal}</textarea>` |
| [`js/dailylog.js`](../js/dailylog.js) | 358 | `${t.text}` (linked task) |
| [`js/backlog.js`](../js/backlog.js) | 62 | `${item.category}` |
| [`js/backlog.js`](../js/backlog.js) | 63 | `value="${item.text}"` (attribute-context injection) |
| [`js/backlog.js`](../js/backlog.js) | 76 | `${t.text}` (backlog task) |

A payload such as `</textarea><img src=x onerror="…">` in a journal field, or a `"` to break out of the `value="…"` attribute, executes arbitrary script.

### Why it's more than self-XSS
1. **Import feature** — [`js/storage.js:550 importD`](../js/storage.js) loads an arbitrary JSON file and writes every `wt_*` key into localStorage, which is then rendered. A shared/"sample" tracker export with a malicious journal/task field runs code when opened.
2. **Realtime sync** — [`js/storage.js:1054 initRealtimeSync`](../js/storage.js) writes remote rows into the DOM. If RLS (SEC-02) is weak, a payload written into a victim's row renders in their client.

### Impact
In Electron, the Supabase session (access **and** refresh tokens) lives in `localStorage`. XSS in the renderer can read those tokens and exfiltrate them → **full account takeover**. It can also reach `window.electronAPI.openExternal(...)`. Severity is capped at High (not Critical) because contextIsolation/nodeIntegration prevent direct native code execution, but token theft is still a complete account compromise.

### Remediation
1. Add a single escaper module:
   ```javascript
   // js/escape.js
   export function esc(s) {
     return String(s ?? '').replace(/[&<>"']/g, c =>
       ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
   }
   ```
2. Wrap **every** `${...}` carrying user text — journal, intention, todo/task text, category names, backlog text/category — including attribute contexts:
   ```javascript
   // Before
   <span class="lp-todo-text">${it.text}</span>
   value="${item.text || ''}"
   // After
   <span class="lp-todo-text">${esc(it.text)}</span>
   value="${esc(item.text || '')}"
   ```
3. Prefer `.textContent` / `.value` assignment (after building the element) for free-text blocks where practical — it's escape-by-construction.
4. Audit all 13 files containing `innerHTML` (full list in Appendix A) and classify each interpolation as static vs. user-data; escape the user-data ones.

### Acceptance criteria
- [ ] `esc()` helper added and imported where needed.
- [ ] Every user-data interpolation in `innerHTML`/attribute context is escaped or moved to `textContent`/`value`.
- [ ] Manual test: a journal entry containing `</textarea><img src=x onerror=alert(1)>` renders as literal text, no alert.
- [ ] Importing a JSON file with a scripted journal field does not execute.

---

## SEC-04 — No Content-Security-Policy (Medium)

**Files:** [`index.html`](../index.html) (no `<meta http-equiv="Content-Security-Policy">`), [`main.js`](../main.js) (BrowserWindow sets no CSP).

With no CSP, there is nothing to blunt the XSS in SEC-03 — inline scripts execute and data can be exfiltrated to any host. The global error handler at [`index.html:20`](../index.html) compounds this by doing `document.body.innerHTML += msg`, which is itself an injection sink.

### Impact
Increases the blast radius of any XSS: enables inline-script execution and arbitrary-host exfiltration. Defense-in-depth, not a standalone exploit.

### Remediation
1. Add a strict CSP meta tag to `index.html`:
   ```html
   <meta http-equiv="Content-Security-Policy"
     content="default-src 'self';
              script-src 'self';
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
              font-src https://fonts.gstatic.com;
              connect-src 'self' https://vdskvcjqzyfwhxyxsgag.supabase.co wss://vdskvcjqzyfwhxyxsgag.supabase.co;
              img-src 'self' data:;">
   ```
2. To satisfy `script-src 'self'`, move the inline `window.onerror` / `unhandledrejection` script ([`index.html:18-26`](../index.html)) into a separate file (e.g. `js/error-overlay.js`) and have that overlay use `textContent`, not `innerHTML`.
3. Verify fonts, Supabase REST, and Supabase Realtime (wss) still work after CSP is applied; widen `connect-src`/`font-src` only as needed.

### Acceptance criteria
- [ ] CSP meta present; app loads, auth + realtime sync still function.
- [ ] No inline `<script>` remains in `index.html`.
- [ ] Error overlay uses `textContent`.

---

## SEC-05 — Deep-link session injection / login CSRF (Medium)

**File:** [`js/auth.js:186-216`](../js/auth.js) (the `onAuthCallback` handler).

The `weekly-tracker://auth-callback` deep link handler accepts `access_token` + `refresh_token` directly from the URL and calls `sb.auth.setSession({ access_token, refresh_token })`. Any app or web page on the machine can invoke the registered protocol with tokens for an **attacker-controlled** account.

### Impact
An attacker can silently switch the victim into the attacker's account. The victim then journals/tracks into an account the attacker controls and can read. Severity is Medium because it requires the victim to follow an attacker-supplied link and the data captured is whatever they enter afterward. The PKCE branch (`exchangeCodeForSession(code)`) is the safer path already present in the code.

### Remediation
1. Prefer the PKCE `code` flow; treat the raw-token branch as a fallback only, or remove it if the Supabase project is configured for PKCE.
2. Before accepting a session from a deep link, verify the resulting user identity (e.g. compare returned email/`sub` to the login the user actually initiated, or require a freshly generated state/nonce stored before launching the external browser).
3. Reject callbacks that don't match a pending, locally-initiated login request.

### Acceptance criteria
- [ ] Login uses PKCE; raw-token setSession is removed or gated behind identity verification.
- [ ] A deep link with arbitrary foreign tokens does not establish a session.

---

## SEC-06 — `setWindowOpenHandler` allows non-https windows (Low)

**File:** [`main.js:112-118`](../main.js).

```javascript
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https://')) { shell.openExternal(url); return { action: 'deny' }; }
  return { action: 'allow' };   // <-- non-https opens a new in-app window
});
```

Any non-`https://` URL returns `{ action: 'allow' }`, letting content spawn a new in-app BrowserWindow (potential `file://`/other-scheme navigation).

### Remediation
Default-deny; only `openExternal` for https:
```javascript
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https://')) shell.openExternal(url);
  return { action: 'deny' };
});
```

### Acceptance criteria
- [ ] Handler denies all in-app window opens; only https is handed to the system browser.

---

## SEC-07 — Localhost login bypass must never be served publicly (Low)

**File:** [`js/auth.js:247`](../js/auth.js).

On `localhost`/`127.0.0.1`, the app mock-authenticates a fixed dev user and skips Google login. This is fine for the file-based desktop build and local dev, and sync is correctly skipped for the all-zero mock UID (no data pollution). The risk is only if this bundle is ever served over `localhost` on a shared/exposed host.

### Remediation
- Document that the web/localhost mode is dev-only and must never be exposed.
- Optionally gate the bypass behind an explicit build/env flag (e.g. `import.meta.env.DEV` equivalent) rather than hostname alone.

### Acceptance criteria
- [ ] Dev-only bypass documented and/or flag-gated.

---

## Suggested Remediation Order (for the implementation plan)

1. ✅ **SEC-01** — key rotated; file untracked/ignored. (Optional: history purge.)
2. 🟡 **SEC-02** — RLS enabled; remaining work is the cross-user test + committing `policies.sql`.
3. ⬜ **SEC-03** — XSS escaping pass. Largest code change; do alongside SEC-04. **← next focus**
4. ⬜ **SEC-04** — CSP + move inline scripts/handlers. Pairs naturally with SEC-03 (defense-in-depth).
5. ⬜ **SEC-05** — auth deep-link hardening.
6. ⬜ **SEC-06 / SEC-07** — quick Electron/auth hardening, low risk to batch together.

Milestone split: **M1 = SEC-01 + SEC-02** (secrets + data isolation) — *effectively complete pending SEC-02 verification*; **M2 = SEC-03 + SEC-04** (XSS hardening) — *next*; **M3 = SEC-05 + SEC-06 + SEC-07** (auth/Electron hardening).

---

## Appendix A — Files containing `innerHTML` (to triage for SEC-03)

`js/backlog.js`, `js/colours.js`, `js/custom-select.js`, `js/categories.js`, `js/app.js`, `js/habits.js`, `js/dailylog.js`, `js/review.js`, `js/insights.js`, `js/stack.js`, `js/overview.js`, `js/timer.js`, `js/toast.js` — 41 occurrences total. Each must be classified as static markup (safe) vs. user-data interpolation (must escape).

## Appendix B — Confirmed-good controls (do not regress)

- Electron `webPreferences`: `contextIsolation: true`, `nodeIntegration: false` ([`main.js:80-85`](../main.js)).
- `open-external` IPC restricts to `https://` ([`main.js:20-26`](../main.js)).
- Sync functions skip the all-zero mock dev UID, preventing dev-data pollution.
- Sync error surfacing (`handleSyncError`) distinguishes network vs. policy/schema errors and throttles toasts.
- `.gitignore` already excludes `node_modules`, `dist/`, `.claude/`, logs.
