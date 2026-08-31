export const CREDIT_RECORD_TITLE = 'RELEASE RECORD';

export const CREDITS = Object.freeze([
  Object.freeze({
    heading: 'Chunk Surfer',
    lines: Object.freeze([
      'A game by Sebastian Suarez-Solis',
      'A haunting at Ellery Conservatoire',
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
      'Bell recordings — Joseph SARDIN & Axeline T. (CC0)',
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
    heading: 'Window Collage Footage',
    lines: Object.freeze([
      'Bolognese bellringers — Renato Morselli (CC BY 3.0)',
      'Bristol Cathedral — George Si (CC BY 3.0)',
      'Oulu demolition — Estormiz (CC0)',
      'Clouds timelapse — John Fowler (CC BY 2.0)',
      'UK partial eclipse — Adrian Parsons (CC BY 3.0)',
      'Sunflower pollination — Oscar Gil Fernández (CC BY 2.0)',
      'Clinical eye footage — Otranto and Eberhard (CC BY 2.0)',
      'S5 video courtesy Dr. W.E. Burr',
      'Project flower footage — Sebastian Suarez-Solis',
      'Commons derivatives edited, looped, color-processed and datamoshed',
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
