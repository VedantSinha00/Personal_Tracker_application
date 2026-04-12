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
import { sb, getCurrentUser as _getU, setCurrentUser } from './sb.js';

export { sb };
export function getCurrentUser() { return _getU(); }

// ── Electron Integration ──────────────────────────────────────────────────────
const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
if (isElectron) {
  document.body.classList.add('is-electron');
  console.log('[auth] Running in Electron environment');
}

// ── Local cache helper ────────────────────────────────────────────────────────
// Inlined here (not imported from storage.js) to avoid a circular dependency:
// storage.js already imports from auth.js, so auth.js cannot import storage.js.
// Behaviour is identical to storage.clearUserCache().
function _clearUserCache() {
  const theme = localStorage.getItem('wt_theme');
  const timer = localStorage.getItem('wt_timer');
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wt_')) keysToRemove.push(k);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  if (theme) localStorage.setItem('wt_theme', theme);
  if (timer) localStorage.setItem('wt_timer', timer);
}

// ── current user ──────────────────────────────────────────────────────────────
// Re-export getCurrentUser for consistency, though it's imported above from sb.js.

// ── Init error helper ─────────────────────────────────────────────────────────
function showInitError(msg) {
  const loader = document.getElementById('loadingContent');
  const error = document.getElementById('initError');
  const errorMsg = document.getElementById('initErrorMsg');
  if (loader) loader.style.display = 'none';
  if (error) error.style.display = 'block';
  if (errorMsg) errorMsg.textContent = msg;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function hideLoadingScreen() {
  const loader = document.getElementById('loadingScreen');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 400);
  }
}

function showApp() {
  hideLoadingScreen();
  document.getElementById('authScreen').style.display  = 'none';
  document.getElementById('appShell').style.display    = '';
}

function showAuth() {
  hideLoadingScreen();
  document.getElementById('authScreen').style.display  = '';
  document.getElementById('appShell').style.display    = 'none';
}

function showSetupProfile() {
  hideLoadingScreen();
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
  const redirectTo = isElectron 
    ? 'weekly-tracker://auth-callback' 
    : window.location.origin + window.location.pathname;

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo,
      skipBrowserRedirect: isElectron // Use system browser if in Electron
    }
  });

  if (error) {
    showBanner(`Login failed: ${error.message}`);
    return;
  }

  // If in Electron, we got a URL back instead of redirecting the main window
  if (isElectron && data?.url) {
    console.log('[auth] Opening system browser for login...');
    window.electronAPI.openExternal(data.url);
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

  try {
    // 1. Create/Update profile with a bit of a timeout check
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
    document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: getCurrentUser() } }));
  } catch (err) {
    console.error('[auth] Profile setup failed:', err);
    showBanner('Connection failed. Please try again.', true, 'setupBanner');
    btn.disabled = false;
    btn.textContent = 'Finish Setup';
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────
async function handleSignOut() {
  await sb.auth.signOut();
  setCurrentUser(null);
  _clearUserCache();
  showAuth();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async function init() {
  try {
    if (!sb) return; // Error already handled above

    const isLocal = !isElectron && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    // Handle Electron Auth Callback
    if (isElectron) {
      window.electronAPI.onAuthCallback(async (urlStr) => {
        console.log('[auth] Received deep link:', urlStr);
        try {
          const url = new URL(urlStr.replace(/^weekly-tracker:\/\/\/?/, 'http://localhost/'));
          
          // Fallback checking both hash fragment and query string
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const searchParams = new URLSearchParams(url.search);
          
          const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
          const authCode = searchParams.get('code') || hashParams.get('code');
          const errorDesc = hashParams.get('error_description') || searchParams.get('error_description') || hashParams.get('error') || searchParams.get('error');

          if (errorDesc) {
            showBanner(`Auth Error: ${errorDesc.replace(/\+/g, ' ')}`);
            return;
          }

          if (accessToken && refreshToken) {
            const { error } = await sb.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (error) throw error;
            console.log('[auth] Session resumed from deep link tokens');
          } else if (authCode) {
            // Some configurations of Supabase use PKCE flow
            const { error } = await sb.auth.exchangeCodeForSession(authCode);
            if (error) throw error;
            console.log('[auth] Session resumed from deep link code');
          } else {
            console.warn('[auth] No auth data found in URL. Parsed URL:', url.toString());
          }
        } catch (err) {
          console.error('[auth] Callback handling failed:', err);
          showBanner('External login failed to sync. Please try again.');
        }
      });
    }

    // Wire up buttons
    document.getElementById('googleLoginBtn').addEventListener('click', () => {
      if (isLocal) {
        window.location.reload(); // In dev mode, just refresh to re-trigger bypass
      } else {
        handleGoogleLogin();
      }
    });
    document.getElementById('setupSubmitBtn').addEventListener('click', handleSetupProfile);
    document.getElementById('signOutBtn').addEventListener('click', () => {
      if (isLocal) {
        setCurrentUser(null);
        _clearUserCache();
        window.location.reload();
      } else {
        handleSignOut();
      }
    });

    // ── LOCAL DEV MODE BYPASS ─────────────────────────────────────────────────
    if (isLocal) {
      console.log('[auth] Local dev mode active. Bypassing Google login.');
      const mockUser = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@local.test',
        user_metadata: { username: 'dev-local', full_name: 'Dev Local' }
      };
      setCurrentUser(mockUser);
      
      showApp();
      // Delay event slightly to ensure app.js listener is ready
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: mockUser } }));
      }, 50);
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return; 
    }
    // ──────────────────────────────────────────────────────────────────────────


    // Check for OAuth errors in the URL
    const hashObj = new URLSearchParams(window.location.hash.substring(1));
    const queryObj = new URLSearchParams(window.location.search);
    const errorDesc = hashObj.get('error_description') || queryObj.get('error_description') || hashObj.get('error') || queryObj.get('error');
    if (errorDesc) {
      showBanner(`Auth Error: ${errorDesc.replace(/\+/g, ' ')}`);
      // Clean up the URL
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Check for an existing session with a timeout
    const sessionPromise = sb.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out')), 8000)
    );

    console.log('[auth] Initializing session...');
    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
    console.log('[auth] Session check complete. Session:', !!session);

    if (session) {
      setCurrentUser(session.user);
      const user = session.user;
      
      // Check if user has a username
      const username = user.user_metadata?.username;
      
      if (!username) {
        // Re-verify from DB in case metadata is stale
        const { data: profile } = await sb.from('profiles').select('username').eq('id', user.id).single();
        if (profile?.username) {
          // Update local metadata cache
          user.user_metadata = { ...user.user_metadata, username: profile.username };
          setCurrentUser(user);
          showApp();
          document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: user } }));
        } else {
          showSetupProfile();
        }
      } else {
        showApp();
        document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: user } }));
      }
    } else {
      showAuth();
    }

    // Keep _currentUser in sync
    sb.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      setCurrentUser(user);
      if (!user) {
        _clearUserCache();
        showAuth();
      } else {
        // If we just signed in and have no username, trigger setup
        if (!user.user_metadata?.username) {
          const { data: profile } = await sb.from('profiles').select('username').eq('id', user.id).single();
          if (!profile?.username) {
            showSetupProfile();
          } else {
            showApp();
            document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: user } }));
          }
        } else {
          showApp();
          document.dispatchEvent(new CustomEvent('wt:auth-ready', { detail: { user: user } }));
        }
      }
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error('[auth] Initialization failed:', err);
    showInitError('We couldn\'t start the app. ' + (err.message || 'Unknown network error.'));
  }
})();
