# Audit: Newly-added category disappears / can't be used for tasks

**Date:** 2026-07-27
**Reported symptom:** Adding a new category via the Categories modal shows it
briefly, then it disappears on its own, and it can no longer be selected to
start a task.

## Coverage

Read in full: `js/categories.js` (396 lines), the category-related sections
of `js/storage.js` (`loadCats`, `saveCats`, `_syncCategories`,
`handleRemoteCatsChange`, `loadFromSupabase`'s categories block,
`repairCategories`), the `wt:cats-changed` / `wt:remote-change` listeners in
`js/app.js`, `js/sb.js`, `supabase/policies.sql`, and `BUG_REPORT.md`.

**Not obtained:** live network/browser evidence. Reproducing this end-to-end
requires a real authenticated Supabase session. Google OAuth can't be driven
non-interactively, and Supabase anonymous sign-in is disabled on this
project (`anonymous_provider_disabled`), so a real `auth.uid()` session
could not be established from a script. The project's local dev bypass
(`js/auth.js:275-292`) authenticates with the all-zero sentinel UUID
(`00000000-0000-0000-0000-000000000000`), which every sync function in
`storage.js` explicitly treats as a no-sync user — so the bypass cannot
exercise this code path at all.

**Conclusion below is therefore a static-trace finding, not a confirmed live
reproduction.** Treat as high-confidence on mechanism, not certainty.

## Root cause

`saveCats()` (`js/storage.js:190-197`) debounces the Supabase push by
500ms, then clears its "pending" flag (`_syncQueue['cats']`) **the instant
the debounce timer fires** — before the actual network round-trip
(`_syncCategories()`, which inserts/updates/deletes rows in Supabase) has
even started, let alone completed:

```js
export function saveCats(cats) {
  localStorage.setItem('wt_categories', JSON.stringify(cats));
  if (_syncQueue['cats']) clearTimeout(_syncQueue['cats']);
  _syncQueue['cats'] = setTimeout(() => {
    _syncQueue['cats'] = null; // <-- cleared here, before _syncCategories runs
    _syncCategories(cats);
  }, 500);
}
```

Two call sites rely on that flag to answer "is a local write still pending,
so a cloud read right now would be stale?" — and both are blind during the
actual network round-trip:

1. **`handleRemoteCatsChange()`** (`js/storage.js:~1259`) — the realtime
   `postgres_changes` subscription handler for the `categories` table. This
   subscription also fires on **this same client's own writes** — every
   `_syncCategories()` insert/update/delete self-triggers this handler as an
   echo. It checks `if (_syncQueue['cats']) return;`, but by the time the
   echo round-trips back, that flag is already `null` (it was cleared before
   the write even started). The guard is absent exactly when needed. The
   handler then re-fetches categories from Supabase and unconditionally
   overwrites `localStorage['wt_categories']` with whatever it reads.

2. **`loadFromSupabase()`**'s categories block (`js/storage.js:~1097-1121`)
   — the one-shot startup hydration. It has the same blind-flag problem,
   plus an additional escape hatch that makes it worse:
   `if (mapped.length >= localCats.length || localCats.length <= 6) saveCats(mapped);`
   Since most users have ≤6 categories, this condition is true almost
   unconditionally regardless of the flag, so a stale cloud snapshot can
   overwrite local even without racing the debounce window.

### Why this matches the symptom

`addCat()` writes the new category to `localStorage` synchronously, so it
renders immediately ("shows up"). Some time later — most commonly via the
write's own realtime self-echo, occasionally via the one-shot startup fetch
— a cloud read races back with a snapshot that doesn't yet reflect the new
row (because the insert hadn't landed, or the two requests interleaved) and
silently overwrites `wt_categories`, deleting the just-added entry from
every dropdown (`populateCatSelect()` reads `sortedCats()` → `loadCats()`).
This explains both "disappears after a moment" and "can't start a task with
that name."

### Corroboration

This mechanism is already flagged in `BUG_REPORT.md:107-111` as **"Realtime
Category Echo Loop"** (medium severity): *"Hydrating categories triggers
`saveCats`, which re-syncs back to Supabase... Redundant writes and
potential write conflicts."* That audit's suggested fix ("write directly to
localStorage and dispatch events without calling `saveCats`" inside the
hydration paths) addresses the same symptom from a different angle —
stopping hydration from re-triggering a push — rather than the guard-timing
gap identified here. Both are valid partial fixes; neither alone is
guaranteed sufficient without live confirmation.

## What was NOT found to be the cause (ruled out during the audit)

- **`addCat()` itself** (`js/categories.js:80-107`) — logic is correct;
  duplicate-name check, "Others" insertion point, and archive/deleted-flag
  clearing all look sound.
- **`renameCat()` / `wt:cats-changed` handler interaction** — this is a
  *different*, already-documented bug (`BUG_REPORT.md` #1, "Category rename
  permanently destroys stack text and weekly todos"). For a brand-new
  category (not a rename), the `wt:cats-changed` handler in `app.js:255-281`
  reads `loadCats()` fresh and only adds an empty stack slot for the new
  category — it does not remove categories from `wt_categories` itself.
- **`repairCategories()`** (`js/storage.js:345-444`) — only ever *adds*
  categories back (content-gated, skips empty shells); it cannot be the
  deletion mechanism, though its own call to `saveCats()` when it recovers
  categories does add another debounced push into the mix, compounding the
  echo window.
- **HTML wiring** — no duplicate event bindings, no `<form>` wrapping the
  Add button that could cause an implicit submit/reload.
- **Client-side duplicate-name collisions** — case-insensitive check in
  `addCat()` looks correct and would silently no-op (select the input) on a
  true duplicate, not delete an existing entry.
- **Unverifiable:** whether a Supabase-side constraint (e.g. a unique index
  on `name` or `(user_id, position)`) could cause a silent insert failure.
  No table-creation SQL exists in the repo (`supabase/policies.sql` only
  contains RLS policies), so this could not be checked statically and was
  not confirmed live.

## Suggested fix direction (not applied — audit only)

Make the "pending" flag reflect the actual in-flight network operation, not
just the debounce timer: e.g. a counter incremented before
`_syncCategories()` starts and decremented in a `.finally()`, checked by
both `handleRemoteCatsChange()` and `loadFromSupabase()` in place of the
current `_syncQueue['cats']` truthiness check. This closes the window for
both the realtime self-echo and the startup-hydration race without changing
insert/update/delete logic, `addCat()`, or `repairCategories()`.

## Files referenced

- `js/categories.js:80-107` (`addCat`)
- `js/storage.js:190-197` (`saveCats`)
- `js/storage.js:687-750` (`_syncCategories`)
- `js/storage.js:1097-1121` (`loadFromSupabase` categories block)
- `js/storage.js:1259-1274` (`handleRemoteCatsChange`)
- `js/storage.js:345-444` (`repairCategories`)
- `js/app.js:255-281` (`wt:cats-changed` listener)
- `BUG_REPORT.md:107-111` ("Realtime Category Echo Loop", pre-existing finding)
