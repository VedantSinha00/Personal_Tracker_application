-- ============================================================================
-- Supabase Row-Level Security (RLS) policies — version-controlled source of truth
-- ============================================================================
-- Finding: SEC-02 (see docs/SECURITY_AUDIT.md). The app ships the public `anon`
-- key, so these policies are the ONLY thing enforcing per-user data isolation.
--
-- This file is IDEMPOTENT: every policy is dropped (IF EXISTS) before being
-- recreated, and `ENABLE ROW LEVEL SECURITY` is a no-op when already on. Safe to
-- re-run in the Supabase SQL editor to reconcile dashboard state. Run as one tx.
--
-- TYPE NOTE: the owner columns in this database are TEXT, while auth.uid() is a
-- UUID. Comparing them directly raises `operator does not exist: uuid = text`.
-- We therefore cast both sides to ::text, which is correct whether a given
-- column is text or uuid (canonical uuid text form). Do NOT change the column
-- types — the app sends string IDs and relies on text columns.
--
-- Ownership columns:
--   profiles      → owner is `id`      (== auth.uid())
--   all others    → owner is `user_id` (== auth.uid())
-- ============================================================================

begin;

-- ── Clean slate ─────────────────────────────────────────────────────────────
-- Drop EVERY existing policy on the active tables first, so legacy/duplicate
-- policies created via the dashboard (e.g. "User all access", "Users manage
-- own X") are removed and each table ends with exactly the set defined below.
-- The orphan `targets` table is intentionally excluded — it is not used by the
-- app and already has its own RLS-enabled, auth.uid()-scoped policy.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','weekly_data','categories','habits','backlog','cat_archive')
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── profiles ────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "Users can read own profile"   on profiles for select using (auth.uid()::text = id::text);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid()::text = id::text);
create policy "Users can update own profile" on profiles for update using (auth.uid()::text = id::text) with check (auth.uid()::text = id::text);
create policy "Users can delete own profile" on profiles for delete using (auth.uid()::text = id::text);

-- ── weekly_data ─────────────────────────────────────────────────────────────
alter table weekly_data enable row level security;

create policy "Users can read own weekly_data"   on weekly_data for select using (auth.uid()::text = user_id::text);
create policy "Users can insert own weekly_data" on weekly_data for insert with check (auth.uid()::text = user_id::text);
create policy "Users can update own weekly_data" on weekly_data for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
create policy "Users can delete own weekly_data" on weekly_data for delete using (auth.uid()::text = user_id::text);

-- ── categories ──────────────────────────────────────────────────────────────
alter table categories enable row level security;

create policy "Users can read own categories"   on categories for select using (auth.uid()::text = user_id::text);
create policy "Users can insert own categories" on categories for insert with check (auth.uid()::text = user_id::text);
create policy "Users can update own categories" on categories for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
create policy "Users can delete own categories" on categories for delete using (auth.uid()::text = user_id::text);

-- ── habits ──────────────────────────────────────────────────────────────────
alter table habits enable row level security;

create policy "Users can read own habits"   on habits for select using (auth.uid()::text = user_id::text);
create policy "Users can insert own habits" on habits for insert with check (auth.uid()::text = user_id::text);
create policy "Users can update own habits" on habits for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
create policy "Users can delete own habits" on habits for delete using (auth.uid()::text = user_id::text);

-- ── backlog ─────────────────────────────────────────────────────────────────
alter table backlog enable row level security;

create policy "Users can read own backlog"   on backlog for select using (auth.uid()::text = user_id::text);
create policy "Users can insert own backlog" on backlog for insert with check (auth.uid()::text = user_id::text);
create policy "Users can update own backlog" on backlog for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
create policy "Users can delete own backlog" on backlog for delete using (auth.uid()::text = user_id::text);

-- ── cat_archive ─────────────────────────────────────────────────────────────
alter table cat_archive enable row level security;

create policy "Users can read own cat_archive"   on cat_archive for select using (auth.uid()::text = user_id::text);
create policy "Users can insert own cat_archive" on cat_archive for insert with check (auth.uid()::text = user_id::text);
create policy "Users can update own cat_archive" on cat_archive for update using (auth.uid()::text = user_id::text) with check (auth.uid()::text = user_id::text);
create policy "Users can delete own cat_archive" on cat_archive for delete using (auth.uid()::text = user_id::text);

commit;

-- ============================================================================
-- Verification (run separately, after the COMMIT above)
-- ============================================================================
-- 1. RLS is on for every table (expect rowsecurity = true for all 6):
--      select tablename, rowsecurity from pg_tables
--      where schemaname = 'public'
--        and tablename in ('profiles','weekly_data','categories','habits','backlog','cat_archive');
--
-- 2. Every policy is scoped to auth.uid() (inspect qual / with_check):
--      select tablename, policyname, cmd, qual, with_check
--      from pg_policies where schemaname = 'public' order by tablename, cmd;
-- ============================================================================
