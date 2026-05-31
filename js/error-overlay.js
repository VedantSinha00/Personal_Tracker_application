// ── error-overlay.js ─────────────────────────────────────────────────────────
// CSP-safe replacement for the inline scripts/handlers that used to live in
// index.html. Loaded non-deferred in <head> (after the font <link>, before
// <body>), so the font link already exists when this runs; the button is wired
// on DOMContentLoaded. All overlay text uses textContent — never innerHTML — so
// an error message can never inject markup.
(function () {
  // ── CSP-safe replacements for removed inline handlers ──────────────────────
  // Font stylesheet: was `media="print" onload="this.media='all'"` in index.html.
  // Swap to media="all" once loaded so the @font-face rules apply.
  const fontLink = document.getElementById('fontStylesheet');
  if (fontLink) {
    if (fontLink.sheet) {            // already loaded before this script ran
      fontLink.media = 'all';
    } else {
      fontLink.addEventListener('load', () => { fontLink.media = 'all'; });
    }
  }

  // Retry button: was `onclick="window.location.reload()"` in index.html.
  document.addEventListener('DOMContentLoaded', () => {
    const retryBtn = document.getElementById('retryConnBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  });

  // ── Uncaught error overlays (textContent, not innerHTML) ───────────────────
  function overlay(top, bg, text) {
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed', top: top, left: '0', width: '100%',
      background: bg, color: 'white', zIndex: '9999', padding: '20px',
      fontFamily: 'monospace', whiteSpace: 'pre-wrap',
    });
    div.textContent = text;
    document.body.appendChild(div);
  }

  window.onerror = function (msg, url, line, col, error) {
    overlay('0', 'red',
      'Global Error: ' + msg + '\n' + url + ':' + line + ':' + col + '\n' + (error && error.stack));
    return false;
  };

  window.addEventListener('unhandledrejection', function (e) {
    overlay('80px', 'orange', 'Unhandled Rejection: ' + e.reason);
  });
})();
