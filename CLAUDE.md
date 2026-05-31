# Project Standards & Handoff Guide

## 1. Core Principles
- **Sequence:** Always follow `Specify → Plan → Task → Implement`.
- **Deterministic Code:** Provide exact values and hex codes; never use vague goals.
- **Scope:** Define exactly what to touch AND what not to touch in every prompt.

## 2. Structured Communication (XML)
Use these semantic layers for all complex tasks:
- `<technical_context>`: Stack, frameworks, and constraints.
- `<functional_requirements>`: User behavior and acceptance criteria.
- `<integration_details>`: API, state, and edge cases.
- `<verification_protocol>`: Test commands or audit steps.

## 3. Persistent Constraints
- **Always:** Use Red/Green TDD (write tests first).
- **Ask First:** Before adding new dependencies or changing database schemas.
- **Never:** Commit to Git automatically; never bypass safety checks.

## 4. Intent Inheritance (Decision Log)
*Record major architectural changes here to maintain intent across chat resets*.

- [Project Standards]: Added `CLAUDE.md` to enforce systematic workflow (Specify → Plan → Task → Implement) and deterministic code standards.
- [Version Update]: Bumped version to 1.2.2 for new release and fixed version metadata mismatch (standardized on SemVer).
- [Week Transition & Sync]: Bumped version to 1.2.4. Implemented robust week-rollover detection (persistent last-seen Monday), hardened sync by fixing UUID identifier syntax (Supabase compliant), and resolved stopwatch flickering. Made carry-forward logic automatic (removed prompt dialog), and resolved a critical UI persistent bug restricting category deletion.
- [Performance & Reliability]: Bumped version to 1.2.5. Implemented "Optimistic Rendering" for instant startup on reload. Optimized Lucide icon rendering by adding element-scoping to prevent expensive full-DOM scans. Fixed a critical responsive bug in the stopwatch start button by switching to `closest()` delegation. Resolved "ghost scrolling" in the Stack tab by adding `preventScroll: true` to focus logic. Unified UI aesthetic by applying premium dropdown styles to the stopwatch modal.
- [Sync Error Surfacing]: Bumped version to 1.3.7. Added `handleSyncError` in `storage.js` so failed Supabase writes surface to the user via toast instead of failing silently. Messages distinguish connectivity failures ("can't reach the server") from database policy/schema rejections via `_isNetworkError` (Postgres/PostgREST error codes => server replied). Throttled per distinct message (`Map`-based, 5s window) so identical bursts collapse to one toast while distinct error classes are never masked. Offline failures log only (no toast). Verified end-to-end in a real browser against the live module pipeline.
- [Habits Data-Loss Fix & Deep-Link Login]: Bumped version to 1.3.9. **Root-caused and fixed the destructive habits sync** that wiped a user's real habits on sign-out→sign-in: sign-out clears the local `wt_habits` cache, the optimistic pre-load `renderAll()` then exposed `DEFAULT_HABITS`, and `_syncHabits`'s old delete-all-then-insert pushed those defaults to the cloud (deleting the real ones). Fix in `storage.js` adds three independent guards: (1) a session **hydration gate** (`_remoteHydrated`, reset at the start of `loadFromSupabase`, set true only on its successful completion) so habits never push before the cloud is loaded into local; (2) `_syncHabits` **re-reads `loadHabits()` at fire-time** instead of trusting the debounce-captured array; (3) a **non-destructive diff** (insert/update/delete-changed via `.in()`, no constraint dependency) plus an anti-wipe guard. `loadFromSupabase` also cancels any habits push queued by the optimistic render. **Deep-link login fix** in `main.js`: register `app.setAsDefaultProtocolClient('weekly-tracker')` (dev vs packaged branch) so the OAuth callback can return to the app — previously Windows showed "no app associated" and login could never complete after logout. SEC-05 login path now testable on this build (sign out → back in).
- [Carry-Forward Hydration Fix]: Bumped version to 1.3.11. **Root-caused and fixed the broken weekly carry-forward.** `carryForward()` (`stack.js`) reads last week's data only from the local `wt_wk_<N-1>` cache, but `loadFromSupabase()`'s week-boundary guard refused to hydrate `stack`/`todos` for any non-current week (falling back to the local copy). On a fresh session / new device / post-sign-out cache clear, last week wasn't cached locally, so the cloud's real data was dropped AND the key was rewritten empty — stamped with the remote `updated_at`, making the strict-newer timestamp guard skip it on every later load (sticky poison). Because `loadFromSupabase()` runs before the rollover's `carryForward()`, the carry saw an empty source and silently did nothing. Fix in `storage.js`: (1) `localHasNoStackTodos` — when local holds no stack/todos there are no edits to protect, so remote stack/todos are hydrated (the flag flips false the instant any local content exists, preserving the original anti-clobber protection); (2) a `needsBackfill` self-heal that bypasses the timestamp tie for a past/future week whose local cache is empty but whose cloud row has content, recovering previously-poisoned records. Hydration still uses raw `localStorage.setItem` (never `save()`), so cloud data was never overwritten and remains recoverable.
- [Update Resilience]: Bumped version to 1.3.10. Decoupled the auto-update UI from authentication. `initUpdateListeners()` (the "Update Ready / Restart" toast + restart wiring in `app.js`) was previously only called inside `handleAuthReady()`, so a user who couldn't sign in never saw the update prompt — a login-breaking release could strand them with no path forward. Now wired once at module-scope bootstrap (guarded by `_updaterInitialized`, so the existing post-auth call is a safe no-op). The main-process updater in `main.js` already downloaded regardless of auth; this surfaces the prompt on the login screen too (the `toast.js` container is created at module load, so it renders pre-login). Net effect: updates can always be received AND applied, even from a locked-out state.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
