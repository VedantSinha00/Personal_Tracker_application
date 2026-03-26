// ── constants.js ────────────────────────────────────────────────────────────
// Pure static data. No logic, no DOM, no side effects.
// Everything here is exported so other modules can import what they need.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Colour system ────────────────────────────────────────────────────────────
// The full swatch grid shown in colour pickers throughout the app.
export const PRESET_COLOURS = [
  // Greens
  '#2d6a4f','#40916c','#52b788','#74c69d','#3a7d44','#6ab187',
  // Blues
  '#1d3557','#2563a8','#4a88d4','#56a3c7','#0077b6','#48cae4',
  // Purples
  '#5b4fa8','#7b5ea7','#9b72cf','#c77dff','#3d105a','#6a0572',
  // Reds / Pinks
  '#b03a2e','#c0392b','#e63946','#e07a5f','#c9184a','#ff758f',
  // Ambers / Yellows
  '#92610a','#e9c46a','#f4a261','#e76f51','#d4a017','#f3722c',
  // Neutrals
  '#6b6760','#495057','#343a40','#adb5bd','#6c757d','#212529',
];

// Maps old CSS-variable-style colour keys to their hex equivalents.
// Needed because early versions of the app stored colour names like
// "blue" or "accent" instead of hex strings. This lets us stay backwards
// compatible without any data migration.
export const LEGACY_MAP = {
  'blue':   '#2563a8',
  'accent': '#2d6a4f',
  'purple': '#5b4fa8',
  'amber':  '#92610a',
  'red':    '#b03a2e',
  'text2':  '#6b6760',
};

// ── Default data ─────────────────────────────────────────────────────────────
export const DEFAULT_CATS = [
  { name: 'Project',     color: '#2563a8' },
  { name: 'Intern prep', color: '#2d6a4f' },
  { name: 'Upskilling',  color: '#5b4fa8' },
  { name: 'Reading',     color: '#92610a' },
  { name: 'Acads',       color: '#6b6760' },
  { name: 'Other',       color: '#495057' },
];

// Built-in habits are always present and cannot be deleted.
// Custom habits added by the user are stored separately in localStorage.
export const BUILTIN_HABITS = [
  { id: 'run',  name: 'Run',  color: '#2d6a4f', builtin: true },
  { id: 'rest', name: 'Rest', color: '#5b4fa8', builtin: true },
];
