// ── account.js ────────────────────────────────────────────────────────────────
// Owns the Account Settings modal:
//   - Change username  (updates profiles table + auth user metadata)

import { sb, getCurrentUser } from './auth.js';

// ── Banner helpers ─────────────────────────────────────────────────────────────
function showBanner(msg, isError = true) {
  const b = document.getElementById('accountBanner');
  if (!b) return;
  b.textContent   = msg;
  b.style.display = 'block';
  b.className     = 'auth-banner ' + (isError ? 'auth-banner-error' : 'auth-banner-ok');
}

function hideBanner() {
  const b = document.getElementById('accountBanner');
  if (!b) return;
  b.style.display = 'none';
  b.textContent   = '';
}

// ── Open / close ───────────────────────────────────────────────────────────────
function openAccountModal() {
  const user = getCurrentUser();
  // Pre-fill username from auth metadata
  document.getElementById('accountUsername').value = user?.user_metadata?.username || '';
  hideBanner();
  document.body.classList.add('modal-open');
  document.getElementById('accountModal').classList.add('open');
}

function closeAccountModal() {
  document.body.classList.remove('modal-open');
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

  try {
    // 1. Update the profiles table
    const { error: dbError } = await sb
      .from('profiles')
      .upsert({ id: user.id, username: newUsername });

    if (dbError) throw dbError;

    // 2. Keep auth user_metadata in sync
    const { error: authError } = await sb.auth.updateUser({ data: { username: newUsername } });
    if (authError) throw authError;

    showBanner('Username updated successfully!', false);
  } catch (err) {
    showBanner(err.message || 'Failed to update username.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save';
  }
}

// ── Wire listeners ───────────────────────────────────────────────────────────
document.getElementById('accountBtn').addEventListener('click', openAccountModal);
document.getElementById('closeAccountBtn').addEventListener('click', closeAccountModal);

// Click outside modal to close
document.getElementById('accountModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAccountModal();
});

document.getElementById('saveUsernameBtn').addEventListener('click', handleUpdateUsername);

// Enter key in username field saves username
document.getElementById('accountUsername').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleUpdateUsername();
});
