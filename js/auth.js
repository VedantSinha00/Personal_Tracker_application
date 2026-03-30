// ── auth.js ──────────────────────────────────────────────────────────────────
// Owns all authentication logic:
//   - Creates and exports the single Supabase client instance
//   - Handles login, signup, and sign-out
//   - Controls visibility of the auth screen vs the main app
//   - Exposes getCurrentUser() so storage.js can attach user_id to writes
//
// ARCHITECTURE NOTE: The Supabase client is created here and exported.
// storage.js imports it so there is always exactly one client instance
// in the app — no risk of multiple connections or token conflicts.

// ── Supabase client ───────────────────────────────────────────────────────────
// supabase-js is loaded via CDN script tag in index.html (not an ES module
// import) so it attaches to window.supabase. We destructure from there.
const { createClient } = window.supabase;

// ── Local cache helper ────────────────────────────────────────────────────────
// Inlined here (not imported from storage.js) to avoid a circular dependency:
// storage.js already imports from auth.js, so auth.js cannot import storage.js.
// Behaviour is identical to storage.clearUserCache().
function _clearUserCache() {
  const theme = localStorage.getItem('wt_theme');
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  if (theme) localStorage.setItem('wt_theme', theme);
}

export const sb = createClient(
  'https://vdskvcjqzyfwhxyxsgag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkc2t2Y2pxenlmd2h4eXhzZ2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTY3MjAsImV4cCI6MjA5MDAzMjcyMH0.on1s6HXZjFVkx4Xa_DTOB65QGX_0yKFsxMrD59uQn68'
);

// ── current user ──────────────────────────────────────────────────────────────
// A module-level cache so storage.js can call getCurrentUser() synchronously
// after the session has been established.
let _currentUser = null;

export function getCurrentUser() { return _currentUser; }

// ── DOM helpers ───────────────────────────────────────────────────────────────
function showApp() {
  document.getElementById('authScreen').style.display  = 'none';
  document.getElementById('appShell').style.display    = '';
}

function showAuth() {
  document.getElementById('authScreen').style.display  = '';
  document.getElementById('appShell').style.display    = 'none';
}

function showSetupProfile() {
  const user = getCurrentUser();
  const name = user?.user_metadata?.full_name?.split(' ')[0]?.toLowerCase() || '';
  document.getElementById('setupUsername').value = name;
  document.getElementById('setupProfileModal').classList.add('open');
}

function hideSetupProfile() {
  document.getElementById('setupProfileModal').classList.remove('open');
}

function showBanner(msg, isError = true, id = 'authBanner') {
  const b = document.getElementById(id);
  if (!b) return;
  b.textContent    = msg;
  b.style.display  = 'block';
  b.className      = 'auth-banner ' + (isError ? 'auth-banner-error' : 'auth-banner-ok');
}

function hideBanner(id = 'authBanner') {
  const b = document.getElementById(id);
  if (b) {
    b.style.display = 'none';
    b.textContent   = '';
  }
}

// ── Google Login ──────────────────────────────────────────────────────────────
async function handleGoogleLogin() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    showBanner(`Login failed: ${error.message}`);
  }
}

// ── Setup Profile ─────────────────────────────────────────────────────────────
async function handleSetupProfile() {
  const username = document.getElementById('setupUsername').value.trim();
  if (!username) { showBanner('Please choose a username.', true, 'setupBanner'); return; }

  const user = getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('setupSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // 1. Create/Update profile
  const { error: dbError } = await sb
    .from('profiles')
    .upsert({ id: user.id, username: username });

  if (dbError) {
    showBanner(dbError.message, true, 'setupBanner');
    btn.disabled = false;
    btn.textContent = 'Finish Setup';
    return;
  }

  // 2. Update auth metadata
  await sb.auth.updateUser({ data: { username: username } });

  hideSetupProfile();
  showApp();
  document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: _currentUser } }));
}

// ── Sign out ──────────────────────────────────────────────────────────────────
async function handleSignOut() {
  await sb.auth.signOut();
  _currentUser = null;
  _clearUserCache();
  showAuth();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async function init() {
  // Wire up buttons
  document.getElementById('googleLoginBtn').addEventListener('click', handleGoogleLogin);
  document.getElementById('setupSubmitBtn').addEventListener('click', handleSetupProfile);
  document.getElementById('signOutBtn').addEventListener('click', handleSignOut);

  // Check for OAuth errors in the URL
  const hashObj = new URLSearchParams(window.location.hash.substring(1));
  const queryObj = new URLSearchParams(window.location.search);
  const errorDesc = hashObj.get('error_description') || queryObj.get('error_description') || hashObj.get('error') || queryObj.get('error');
  if (errorDesc) {
    showBanner(`Auth Error: ${errorDesc.replace(/\+/g, ' ')}`);
    // Clean up the URL
    window.history.replaceState(null, '', window.location.pathname);
  }

  // Check for an existing session
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    _currentUser = session.user;
    
    // Check if user has a username
    const username = _currentUser.user_metadata?.username;
    
    if (!username) {
      // Re-verify from DB in case metadata is stale
      const { data: profile } = await sb.from('profiles').select('username').eq('id', _currentUser.id).single();
      if (profile?.username) {
        // Update local metadata cache
        _currentUser.user_metadata = { ..._currentUser.user_metadata, username: profile.username };
        showApp();
        document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: _currentUser } }));
      } else {
        showSetupProfile();
      }
    } else {
      showApp();
      document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: _currentUser } }));
    }
  } else {
    showAuth();
  }

  // Keep _currentUser in sync
  sb.auth.onAuthStateChange(async (_event, session) => {
    _currentUser = session?.user || null;
    if (!_currentUser) {
      _clearUserCache();
      showAuth();
    } else {
      // If we just signed in and have no username, trigger setup
      if (!_currentUser.user_metadata?.username) {
        const { data: profile } = await sb.from('profiles').select('username').eq('id', _currentUser.id).single();
        if (!profile?.username) {
          showSetupProfile();
        } else {
          showApp();
          document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: _currentUser } }));
        }
      }
    }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
