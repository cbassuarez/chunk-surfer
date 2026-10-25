import { SOURCE_DEMOLITION_AUDIO_SOURCES } from './source-demolition-audio.js';
import { SHEET_MUSIC } from './sheet-music.js';
import { STOP_LISTENING_SOURCES } from './stop-listening.js';
import { CHAPEL_SERVICE_AUDIO_SOURCES } from './chapel-service-audio.js';
import { CHAPEL_CHOIR_SOURCE } from './chapel-choir.js';
import { ST_BRENDANS_AUDIO_SOURCES } from './st-brendans-audio.js';
import { STANDING_TEAR_REPERTOIRE } from './standing-tear-memory-score.js';

export const CREDIT_RECORD_TITLE = 'RELEASE RECORD';

// THE SHEET-MUSIC CREDITS ARE GENERATED, NOT TYPED.
//
// Two of the five recordings are CC BY and legally require attribution. A
// hand-written list is a list that drifts the first time a sheet is added or a
// source is swapped, and the failure mode is shipping an uncredited recording
// without noticing. So the section is built from the same data the game plays
// (data/sheet-music.js), and composure-pool.spec.mjs fails if a CC-BY entry has
// no credit line to build from. The full licence table, and what was rejected,
// is in third_party/licenses/SHEET-MUSIC-AUDIO.md.
const sheetMusicCredits = () => SHEET_MUSIC.map((sheet) => {
  const who = sheet.performer ? ` — ${sheet.performer}` : '';
  return `${sheet.composer}, ${sheet.title}${who} (${sheet.licence})`;
});

// Built the same way, for the same reason: the list the build downloads from is
// the list the credits print. Licences are checked per file in
// third_party/licenses/STOP-LISTENING-AUDIO.md, and stop-listening.spec.mjs
// fails if a source is missing here or carries a share-alike licence.
const soundEffectCredits = () => STOP_LISTENING_SOURCES.map((source) =>
  `${source.title} — ${source.author} (${source.licence})`);

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
      'Cuelume — Daniel Belyi (MIT)',
      'JavaScript',
      'Rust',
    ]),
  }),
  Object.freeze({
    heading: 'Anatomical Reference Models',
    lines: Object.freeze([
      'Browne K., Schlehlein H., Herr II B. W., Quardokus E., Bueckle A., Börner K. (2022). HuBMAP CCF 3D Reference Object Library, v1.2. CC BY 4.0.',
      'Original heart model created by Kristen Browne using NLM Visible Human Male data.',
      'https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html',
      'https://creativecommons.org/licenses/by/4.0/',
      'Adapted: external chamber selection, simplified geometry and local boundary repair, axis conversion, uniform monumental scale, authored materials and animation.',
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
    heading: 'Sheet Music Recordings',
    lines: Object.freeze([
      ...sheetMusicCredits(),
      'Excerpted, downmixed and filtered for distance',
    ]),
  }),
  Object.freeze({
    heading: 'Standing Tear — Retained Music',
    lines: Object.freeze(STANDING_TEAR_REPERTOIRE.flatMap(source=>[
      source.attribution||`${source.composer} — ${source.title} — ${source.performer} (${source.licence})`,
      ...(source.kind==='recording'?[source.source,source.licenceUrl]:[]),
      `Adapted: ${source.changes}`,
    ])),
  }),
  Object.freeze({
    heading: 'Sound Effect Recordings',
    lines: Object.freeze([
      ...soundEffectCredits(),
      'Excerpted, layered, bitcrushed and placed',
    ]),
  }),
  Object.freeze({
    heading: 'Chapel Service Recordings',
    lines: Object.freeze([
      ...CHAPEL_SERVICE_AUDIO_SOURCES.flatMap(source=>[
        `${source.title} — ${source.author} (${source.licence})`,
        source.url,
        source.licenceUrl,
      ]),
      'Adapted: excerpts, levelling, world placement and procedural room tail',
      'Latin recitations and a recorded congregation; assembled fictional service',
    ]),
  }),
  Object.freeze({
    heading: 'Chapel Choir — Provisional Ensemble Treatment',
    lines: Object.freeze([
      `${CHAPEL_CHOIR_SOURCE.composer}, ${CHAPEL_CHOIR_SOURCE.title} — ${CHAPEL_CHOIR_SOURCE.performer} (${CHAPEL_CHOIR_SOURCE.licence})`,
      CHAPEL_CHOIR_SOURCE.url, CHAPEL_CHOIR_SOURCE.licenceUrl,
      `Adapted: ${CHAPEL_CHOIR_SOURCE.changes}`,
      'Five-part recorded ensemble mix; independent six-part recording pending. Original gain treatment; not a performance or reproduction of Marcoll’s Amproprifications.',
    ]),
  }),
  Object.freeze({
    heading: "St Brendan’s — Material Recordings",
    lines: Object.freeze([
      ...ST_BRENDANS_AUDIO_SOURCES.flatMap(source=>[
        `${source.title} — ${source.author} (${source.licence})`,source.url,source.licenceUrl,
        'Adapted: excerpts, levelling, spatial placement and procedural room response.',
      ]),
      'Contemporary material recordings; adapted foley, not a recording of this tower.',
    ]),
  }),
  Object.freeze({
    heading:'Source — The Conservatoire Copy',
    lines:Object.freeze(SOURCE_DEMOLITION_AUDIO_SOURCES.flatMap(source=>[
      `${source.title} — ${source.author} (${source.licence})`,source.url,source.licenceUrl,
      'Adapted: excerpts, levelling, fixed world placement and short synthetic reflections.',
    ])),
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
