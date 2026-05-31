// @ts-check
// ── escape.js ────────────────────────────────────────────────────────────────
// Single HTML-escaping helper used everywhere user-controlled text is
// interpolated into an innerHTML / insertAdjacentHTML template string.
//
// Escapes the five characters that can break out of HTML element or attribute
// context. Safe for both text nodes and double/single-quoted attribute values.
// When an escaped value is read back via element.dataset, the browser decodes
// the entities automatically, so data-* attributes round-trip unchanged.

/**
 * @param {*} s value to render as text (coerced to string; null/undefined → '')
 * @returns {string} HTML-escaped string
 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
