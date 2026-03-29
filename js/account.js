// ── account.js ────────────────────────────────────────────────────────────────
// Owns the Account Settings modal:
//   - Change username  (updates profiles table + auth user metadata)
//   - Change password  (updates via sb.auth.updateUser)

import { sb, getCurrentUser } from './auth.js';

// ── Banner helpers ─────────────────────────────────────────────────────────────
function showBanner(msg, isError = true) {
  const b = document.getElementById('accountBanner');
  b.textContent   = msg;
  b.style.display = 'block';
  b.className     = 'auth-banner ' + (isError ? 'auth-banner-error' : 'auth-banner-ok');
}

function hideBanner() {
  const b = document.getElementById('accountBanner');
  b.style.display = 'none';
  b.textContent   = '';
}

// ── Open / close ───────────────────────────────────────────────────────────────
function openAccountModal() {
  const user = getCurrentUser();
  // Pre-fill username from auth metadata (set at signup, kept in sync on update)
  document.getElementById('accountUsername').value      = user?.user_metadata?.username || '';
  document.getElementById('accountNewPassword').value   = '';
  document.getElementById('accountConfirmPassword').value = '';
  hideBanner();
  document.getElementById('accountModal').classList.add('open');
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.remove('open');
}

// ── Update username ────────────────────────────────────────────────────────────
async function handleUpdateUsername() {
  const newUsername = document.getElementById('accountUsername').value.trim();
  if (!newUsername) { showBanner('Username cannot be empty.'); return; }

  const user = getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('saveUsernameBtn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  // Update the profiles table row for this user
  const { error: dbError } = await sb
    .from('profiles')
    .update({ username: newUsername })
    .eq('id', user.id);

  if (dbError) {
    const msg = dbError.details ? `${dbError.message}: ${dbError.details}` : dbError.message;
    showBanner(msg);
    btn.disabled    = false;
    btn.textContent = 'Save';
    return;
  }

  // Keep auth user_metadata in sync so getCurrentUser() returns fresh data
  await sb.auth.updateUser({ data: { username: newUsername } });

  btn.disabled    = false;
  btn.textContent = 'Save';
  showBanner('Username updated! Use the new username next time you sign in.', false);
}

// ── Update password ────────────────────────────────────────────────────────────
async function handleUpdatePassword() {
  const newPass     = document.getElementById('accountNewPassword').value;
  const confirmPass = document.getElementById('accountConfirmPassword').value;

  if (newPass.length < 6)      { showBanner('Password must be at least 6 characters.'); return; }
  if (newPass !== confirmPass)  { showBanner('Passwords do not match.'); return; }

  const btn = document.getElementById('savePasswordBtn');
  btn.disabled    = true;
  btn.textContent = 'Updating…';

  const { error } = await sb.auth.updateUser({ password: newPass });

  btn.disabled    = false;
  btn.textContent = 'Update password';

  if (error) { 
    const msg = error.details ? `${error.message}: ${error.details}` : error.message;
    showBanner(msg); 
    return; 
  }

  document.getElementById('accountNewPassword').value    = '';
  document.getElementById('accountConfirmPassword').value = '';
  showBanner('Password updated successfully!', false);
}

// ── Wire listeners (runs once when module loads, DOM is already parsed) ────────
document.getElementById('accountBtn').addEventListener('click', openAccountModal);
document.getElementById('closeAccountBtn').addEventListener('click', closeAccountModal);

// Click outside modal to close
document.getElementById('accountModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAccountModal();
});

document.getElementById('saveUsernameBtn').addEventListener('click', handleUpdateUsername);
document.getElementById('savePasswordBtn').addEventListener('click', handleUpdatePassword);

// Enter key in username field saves username
document.getElementById('accountUsername').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleUpdateUsername();
});
