export const CREDIT_RECORD_TITLE = 'RELEASE RECORD';

export const CREDITS = Object.freeze([
  Object.freeze({
    heading: 'Chunk Surfer',
    lines: Object.freeze([
      'A game by Sebastian Suarez-Solis',
      'A haunting at Ellery Conservatory',
    ]),
  }),
  Object.freeze({
    heading: 'Production',
    lines: Object.freeze([
      'Design — Sebastian Suarez-Solis',
      'Writing — Sebastian Suarez-Solis',
      'Programming — Sebastian Suarez-Solis',
      'Audio — Sebastian Suarez-Solis',
      'Sound Design — Sebastian Suarez-Solis',
      'Sound Design — Paul Yorke',
      'Visual Systems — Sebastian Suarez-Solis',
      'Interface — Sebastian Suarez-Solis',
    ]),
  }),
  Object.freeze({
    heading: 'Tools & Libraries',
    lines: Object.freeze([
      'Tauri',
      'Vite',
      'JavaScript',
      'Rust',
    ]),
  }),
  Object.freeze({
    heading: 'Website',
    lines: Object.freeze([
      'cbassuarez.com',
    ]),
  }),
  Object.freeze({
    heading: 'Copyright',
    lines: Object.freeze([
      '© 2026 Sebastian Suarez-Solis. All rights reserved.',
    ]),
  }),
]);

export function flattenCredits(credits = CREDITS) {
  const out = [];
  credits.forEach((section, index) => {
    if (index > 0) out.push({ kind: 'blank', text: '' });
    out.push({ kind: 'heading', text: section.heading });
    for (const line of section.lines || []) out.push({ kind: 'line', text: line });
  });
  return out;
}
