// ── colours.js ───────────────────────────────────────────────────────────────
// The colour system. Converts stored colour keys → usable CSS values,
// computes readable text colours, and renders the shared swatch picker.

import { PRESET_COLOURS, LEGACY_MAP } from './constants.js';
import { loadCats, loadCatArchive } from './storage.js';

// ── Core resolution ──────────────────────────────────────────────────────────
// Colour keys are stored as hex strings (e.g. "#2563a8").
// Older data used CSS-var names ("blue", "accent") — LEGACY_MAP handles those.

export function resolveHex(colorKey) {
  if (!colorKey) return '#6b6760';
  if (colorKey.startsWith('#')) return colorKey;
  return LEGACY_MAP[colorKey] || '#6b6760';
}

// Given a hex background colour, returns the text colour.
// Because badges/pills are heavily mixed with the theme's base colour (40% opacity),
// the standard body text colour (var(--text)) always provides optimal readable contrast.
export function badgeTextColor(hex) {
  return 'var(--text)';
}

// Legacy helper — kept for any callers that still use it.
export function hexToBg(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (dark) {
    const mix = (v, base) => Math.round(v * 0.28 + base * 0.72);
    return `rgb(${mix(r, 34)},${mix(g, 32)},${mix(b, 25)})`;
  }
  const mix = v => Math.round(v + (255 - v) * 0.82);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// Returns an object with the resolved hex and precomputed CSS values
// for a given colour key. Used anywhere a category needs to be displayed.
export function catPalette(colorKey) {
  const hex = resolveHex(colorKey);
  const bg = `color-mix(in srgb,${hex} 40%,var(--badge-base,#fff))`;
  const text = badgeTextColor(hex);
  return { key: hex, css: hex, bg, text };
}

// Returns an inline style string for a badge element.
// Uses CSS custom properties so dark mode works via the cascade.
export function catStyle(colorKey) {
  const hex = resolveHex(colorKey);
  const text = badgeTextColor(hex);
  return `--badge-hex:${hex};--badge-text:${text};background:color-mix(in srgb,${hex} 5%,transparent);border-left-color:${hex};color:var(--text);`;
}

// Resolves a category name → its hex colour string.
// Falls back to the archive for deleted categories so old blocks still render.
export function resolveCatColor(name) {
  const cats = loadCats();
  const found = cats.find(c => c.name === name);
  if (found) return catPalette(found.color).css;
  const arch = loadCatArchive();
  if (arch[name]) return catPalette(arch[name]).css;
  return 'var(--text3)';
}

// Returns the full inline style string for a block pill by category name.
export function catC(name) {
  const cats = loadCats();
  const found = cats.find(c => c.name === name);
  if (found) return catStyle(found.color);
  const arch = loadCatArchive();
  if (arch[name]) return catStyle(arch[name]);
  return 'background:var(--surface2);color:var(--text2);';
}

// ── Shared colour picker ─────────────────────────────────────────────────────
// Renders the swatch grid + custom colour input into any container element.
// `onPick` is a callback that receives the chosen hex string.

export function renderColorPicker(containerId, currentHex, onPick) {
  const cur = resolveHex(currentHex);
  const isCustom = !PRESET_COLOURS.includes(cur);
  const swatchHTML = PRESET_COLOURS.map(hex =>
    `<div class="swatch${cur === hex ? ' picked' : ''}" style="background:${hex}" data-hex="${hex}"></div>`
  ).join('');

  document.getElementById(containerId).innerHTML = `
    <div class="swatch-row" data-picker-swatches></div>
    <div class="color-picker-wrap">
      <span class="color-picker-label">Custom:</span>
      <input type="color" class="custom-color-input${isCustom ? ' picked' : ''}"
        data-picker-custom value="${cur}">
      <span class="color-picker-label" data-picker-hex>${isCustom ? cur : ''}</span>
    </div>`;

  // Re-query after innerHTML is set
  const container = document.getElementById(containerId);
  container.querySelector('[data-picker-swatches]').innerHTML = swatchHTML;
  container._onPick = onPick;

  // Swatch clicks
  container.querySelectorAll('.swatch').forEach(s => {
    s.addEventListener('click', () => cpPick(containerId, s.dataset.hex));
  });

  // Custom colour input
  const customInput = container.querySelector('[data-picker-custom]');
  customInput.addEventListener('input', () => cpCustom(containerId, customInput.value));
}

export function cpPick(containerId, hex) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('picked', s.dataset.hex === hex);
  });
  const ci = container.querySelector('[data-picker-custom]');
  if (ci) { ci.classList.remove('picked'); ci.value = hex; }
  const hl = container.querySelector('[data-picker-hex]');
  if (hl) hl.textContent = '';
  if (container._onPick) container._onPick(hex);
}

export function cpCustom(containerId, hex) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.swatch').forEach(s => s.classList.remove('picked'));
  const ci = container.querySelector('[data-picker-custom]');
  if (ci) ci.classList.add('picked');
  const hl = container.querySelector('[data-picker-hex]');
  if (hl) hl.textContent = hex;
  if (container._onPick) container._onPick(hex);
}
