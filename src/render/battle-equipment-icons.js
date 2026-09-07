// Schematics shared by the pre-fight equipment controls.
const ICONS = {
  light: '<path d="M11 21h29v18H11zM40 21l17-10v38L40 39M15 26h21M15 30h21M15 34h21M59 15l11-5M60 29h13M59 43l11 5"/><path d="M24 18h8v3"/>',
  recorder: '<rect x="7" y="9" width="59" height="42" rx="2"/><rect x="13" y="15" width="47" height="23"/><circle cx="25" cy="27" r="7"/><circle cx="49" cy="27" r="7"/><path d="M25 34h24M20 43h6m6 0h6m6 0h6m6 0h5"/>',
  interface: '<rect x="12" y="15" width="51" height="29" rx="2"/><circle cx="24" cy="28" r="5"/><circle cx="50" cy="28" r="5"/><path d="M24 33v13c0 13 26 13 26-7v-6M33 20h8m-8 5h8"/>',
  'tuning-fork': '<path d="M25 8v21c0 12 22 12 22 0V8M30 8v21c0 5 12 5 12 0V8M36 38v17M33 55h6"/>',
  radio: '<rect x="19" y="14" width="39" height="39" rx="2"/><path d="M27 14L22 2M25 20h27v8H25zM25 35h27m-27 4h27m-27 4h27m-27 4h27"/><circle cx="51" cy="10" r="2"/>',
  coffee: '<path d="M18 20h32l-3 31H21zM50 24h8c10 0 8 19-10 19M17 17h34M23 11c8-7-4-7 3-13M38 12c8-7-4-7 3-13"/>',
  badge: '<rect x="19" y="15" width="37" height="39" rx="2"/><path d="M30 15V6h14v9M25 43h25m-25 5h20"/><circle cx="38" cy="29" r="7"/>',
  self: '<path d="M22 52V29c0-5 6-5 6 0v8-21c0-5 6-5 6 0v18-23c0-5 6-5 6 0v23-18c0-5 6-5 6 0v23l5-7c4-5 9-2 7 3L48 53z"/>',
};
export const battleEquipmentIcon = id => `<svg viewBox="0 0 76 60" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.self}</svg>`;
