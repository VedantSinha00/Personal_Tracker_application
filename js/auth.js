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

export const sb = createClient(
  'https://vdskvcjqzyfwhxyxsgag.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkc2t2Y2pxenlmd2h4eXhzZ2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTY3MjAsImV4cCI6MjA5MDAzMjcyMH0.on1s6HXZjFVkx4Xa_DTOB65QGX_0yKFsxMrD59uQn68'
);

// ── Current user ──────────────────────────────────────────────────────────────
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

function showBanner(msg, isError = true) {
  const b = document.getElementById('authBanner');
  b.textContent    = msg;
  b.style.display  = 'block';
  b.className      = 'auth-banner ' + (isError ? 'auth-banner-error' : 'auth-banner-ok');
}

function hideBanner() {
  const b = document.getElementById('authBanner');
  b.style.display = 'none';
  b.textContent   = '';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled     = loading;
  btn.textContent  = loading
    ? (btnId === 'loginBtn' ? 'Signing in…' : 'Creating account…')
    : (btnId === 'loginBtn' ? 'Sign in'     : 'Create account');
}

// ── Auth tab switching ────────────────────────────────────────────────────────
function initAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.authTab;
      document.querySelectorAll('.auth-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.authTab === target)
      );
      document.querySelectorAll('.auth-panel').forEach(p =>
        p.classList.toggle('active', p.id === 'auth' + target.charAt(0).toUpperCase() + target.slice(1))
      );
      hideBanner();
    });
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) { showBanner('Please fill in both fields.'); return; }

  hideBanner();
  setLoading('loginBtn', true);

  // Step 1: resolve username → email via Supabase RPC
  const { data: email, error: rpcError } = await sb.rpc('get_email_by_username', { p_username: username });

  if (rpcError || !email) {
    setLoading('loginBtn', false);
    showBanner('Username not found. Please check and try again.');
    return;
  }

  // Step 2: sign in with the resolved email + password
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  setLoading('loginBtn', false);

  if (error) {
    showBanner(error.message);
    return;
  }

  _currentUser = data.user;
  showApp();
  // Fire an event so app.js knows to initialise / re-render with the new user's data
  document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: data.user } }));
}

// ── Signup ────────────────────────────────────────────────────────────────────
async function handleSignup() {
  const username = document.getElementById('signupUsername').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!username)            { showBanner('Please choose a username.');         return; }
  if (!email)               { showBanner('Please enter your email.');          return; }
  if (password.length < 6) { showBanner('Password must be at least 6 characters.'); return; }

  hideBanner();
  setLoading('signupBtn', true);

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { username },   // stored in raw_user_meta_data, picked up by the DB trigger
    },
  });

  setLoading('signupBtn', false);

  if (error) {
    showBanner(error.message);
    return;
  }

  // Supabase may require email confirmation depending on project settings.
  // If the session is immediately available, log them in. Otherwise prompt.
  if (data.session) {
    _currentUser = data.user;
    showApp();
    document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: data.user } }));
  } else {
    showBanner('Account created! Check your email to confirm, then sign in.', false);
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────
async function handleSignOut() {
  await sb.auth.signOut();
  _currentUser = null;
  showAuth();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Runs immediately when auth.js loads. Checks if there is already a valid
// session (e.g. user refreshed the page) and skips the login screen if so.
(async function init() {
  initAuthTabs();

  // Wire up buttons
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('signupBtn').addEventListener('click', handleSignup);
  document.getElementById('signOutBtn').addEventListener('click', handleSignOut);

  // Enter key submits whichever form is visible
  document.getElementById('loginUsername').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('signupPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignup();
  });

  // Check for an existing session (page refresh / returning user)
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    _currentUser = session.user;
    showApp();
    document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: session.user } }));
  } else {
    showAuth();
  }

  // Keep _currentUser in sync if the session changes (e.g. token refresh,
  // sign-out from another tab)
  sb.auth.onAuthStateChange((_event, session) => {
    _currentUser = session?.user || null;
    if (!_currentUser) showAuth();
  });
})();
