// ── sb.js ────────────────────────────────────────────────────────────────────
// Single source of truth for the Supabase client and current user state.
// This file has NO dependencies to prevent circular module cycles.

const { createClient } = window.supabase || { createClient: () => null };

export const sb = createClient(
  'https://vdskvcjqzyfwhxyxsgag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkc2t2Y2pxenlmd2h4eXhzZ2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTY3MjAsImV4cCI6MjA5MDAzMjcyMH0.on1s6HXZjFVkx4Xa_DTOB65QGX_0yKFsxMrD59uQn68'
);

let _currentUser = null;

export function getCurrentUser() { return _currentUser; }
export function setCurrentUser(u) { _currentUser = u; }
