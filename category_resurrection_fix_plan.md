# Category Resurrection – Full Fix Plan

## Overview
The root cause is that deletions are only stored locally. The Supabase `categories` table never knows a category was removed, and the sync routine (`_syncCategories`) deletes‑all‑and‑re‑inserts, which can resurrect deleted rows from any device that still has the old data.  The robust solution is to introduce a **soft‑delete flag** on the server and switch to a **diff‑based sync**.

---

## Step‑by‑Step Manual Procedure

### 1️⃣ Backend – Schema Update
1. Open your Supabase project dashboard.
2. Navigate to **Table Editor → categories**.
3. Add a new column:
   - **Name:** `deleted_at`
   - **Type:** `timestamp` (nullable)
   - **Default:** `null`
4. Save the change.  This column will store the UTC timestamp when a category is deleted.
5. (Optional) Run a one‑time migration script to set `deleted_at = null` for all existing rows if needed.

### 2️⃣ Backend – API Helper
Create a new helper in `js/storage.js` (or a dedicated `api.js`):
```js
async function _softDeleteCategory(name) {
  const user = getCurrentUser();
  if (!user) return;
  await sb.from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('name', name);
}
```
*This function marks a category as deleted instead of only updating local storage.*

### 3️⃣ Front‑end – Delete Flow
Modify `deleteCat(idx)` in `js/categories.js`:
- After archiving the colour, call `_softDeleteCategory(removing.name)`.
- Keep the existing `addDeletedCat`/`clearDeletedCat` for backward compatibility, but the server flag becomes the source of truth.

### 4️⃣ Front‑end – Sync Logic (Diff‑Based)
Replace the current `_syncCategories(cats)` implementation with:
```js
async function _syncCategories(localCats) {
  const user = getCurrentUser();
  if (!user) return;
  // 1️⃣ Fetch remote list
  const { data: remote, error } = await sb.from('categories')
    .select('name,color,deleted_at')
    .eq('user_id', user.id);
  if (error) return console.warn('[sync] categories fetch error', error);

  // 2️⃣ Build maps for quick lookup
  const remoteMap = new Map(remote.map(c => [c.name.toLowerCase(), c]));
  const localMap  = new Map(localCats.map(c => [c.name.toLowerCase(), c]));

  // 3️⃣ Determine inserts/updates
  const toUpsert = [];
  for (const [name, cat] of localMap) {
    const remoteCat = remoteMap.get(name);
    if (!remoteCat || remoteCat.deleted_at) {
      // New or previously deleted – insert/restore
      toUpsert.push({ user_id: user.id, name: cat.name, color: cat.color, deleted_at: null });
    } else if (remoteCat.color !== cat.color) {
      // Colour changed – update
      toUpsert.push({ user_id: user.id, name: cat.name, color: cat.color, deleted_at: null });
    }
  }

  // 4️⃣ Determine soft‑deletes (present remotely but missing locally)
  const toDelete = [];
  for (const [name, remoteCat] of remoteMap) {
    if (!localMap.has(name) && !remoteCat.deleted_at) {
      toDelete.push({ name: remoteCat.name });
    }
  }

  // 5️⃣ Apply changes
  if (toUpsert.length) await sb.from('categories').upsert(toUpsert, { onConflict: 'user_id,name' });
  for (const d of toDelete) {
    await sb.from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('name', d.name);
  }
}
```
*Key points:*
- No more `delete().eq('user_id', …)` that wipes the whole table.
- Deletions are soft, preserving historic data for audits.
- The sync routine is idempotent and safe across devices.

### 5️⃣ Front‑end – Loading Data
In `loadFromSupabase()` (still in `js/storage.js`):
- After fetching categories, **filter out** any rows where `deleted_at` is not `null`.
```js
if (cats && cats.length) {
  const filtered = cats.filter(c => !c.deleted_at);
  // …existing hidden‑map logic, then save using saveCats(filtered)
}
```
- This guarantees that no client ever receives a deleted category.

### 6️⃣ Front‑end – Real‑time Handlers
Update `handleRemoteCatsChange(row)` and `handleRemoteArchiveChange(row)`:
- When a remote row arrives with `deleted_at` set, immediately **remove** the category from local storage:
```js
if (row && row.deleted_at) {
  const cats = loadCats().filter(c => c.name !== row.name);
  saveCats(cats);
}
```
- Keep the existing archive‑scrubbing logic for extra safety.

### 7️⃣ Backward Compatibility (Optional)
For very old clients that cannot call `_softDeleteCategory`:
- Keep the existing `wt_deleted_cats` blacklist locally.
- When the new client loads, it will merge the blacklist into the archive (step 1 of the load routine) so older clients will still respect deletions.

### 8️⃣ Version Bump & Release
1. Update `package.json` version to **1.2.7**.
2. Run `npm run dist` (or `npm run publish` later) to generate a new installer.
3. Deploy the new installer to GitHub releases.
4. Instruct users to update their desktop client.

### 9️⃣ Testing Checklist
- [ ] Unit test for `_softDeleteCategory` (mock Supabase).
- [ ] Integration test: two simulated devices, one deletes a category, the other syncs after a short delay. Verify the category never re‑appears on either device.
- [ ] Manual QA: delete “Project”, hard‑reload, ensure it stays gone.
- [ ] Verify that the “Trash” view (if added) correctly lists soft‑deleted categories.

---

## Expected Outcome
- Deleted categories are **permanently hidden** across all devices.
- No more “ghost” resurrection after reloads or syncs.
- The system is future‑proof: soft‑deletes can be restored if needed, and the sync algorithm is safe against race conditions.

---

*Save this file (`category_resurrection_fix_plan.md`) and follow the steps in order. If you hit any roadblocks, let me know which step and I can provide more detailed code snippets or debugging tips.*
