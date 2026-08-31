import assert from 'node:assert/strict';

import {
  REGISTER, documentLines, fileRegisterRows, filingNotes, holdingsRegisterRows,
  progressionDocumentId, registryReferences, resolveCitations,
} from '../src/data/transfer-registry.js';
import { HUSH_DOSSIER } from '../src/game/hush-dossier.js';
import { PAGES, WORK_ORDER } from '../src/data/conservatory-script.js';
import { vfdGlyphMissing } from '../src/render/vfd-font.js';

// A profile that has picked up three sheets across two different nights.
const KNOWLEDGE = {
  'work-order': { firstSeenAt: 10, firstSeenRunId: 'run-a', count: 3 },
  'pre-roll-analysis': { firstSeenAt: 20, firstSeenRunId: 'run-a', count: 1 },
  'page-7': { firstSeenAt: 30, firstSeenRunId: 'run-b', count: 1 },
};

// ── the file holds what you carried, and nothing else ───────────────────────
{
  const rows = fileRegisterRows({ knowledge: KNOWLEDGE, pages: PAGES, workOrder: WORK_ORDER });
  const ids = rows.map((r) => r.id);

  assert.deepEqual([...ids].sort(), ['page-7', 'pre-roll-analysis', 'work-order'],
    'only documents actually handled are in the file');
  assert.ok(!ids.includes('page-1'), 'a sheet nobody picked up is not listed');
  assert.ok(!ids.includes('page-1  MISSING'), 'and it is not listed as missing either — this is what the company holds, not an index of the building');

  const empty = fileRegisterRows({ knowledge: {}, pages: PAGES, workOrder: WORK_ORDER });
  assert.equal(empty.length, 0, 'a fresh profile has an empty file');

  const all = fileRegisterRows({ knowledge: {}, pages: PAGES, workOrder: WORK_ORDER, includeUnseen: true });
  assert.equal(all.length, PAGES.length + 1, 'includeUnseen is the god-menu view');

  // It remembers WHICH night, which is what makes the file grow rather than reset.
  const seen = rows.find((r) => r.id === 'page-7');
  assert.equal(seen.firstSeenRunId, 'run-b');
  assert.equal(rows.find((r) => r.id === 'work-order').count, 3);
}

// ── the anomaly is on the row, not in a paragraph ──────────────────────────
{
  const rows = fileRegisterRows({ knowledge: KNOWLEDGE, pages: PAGES, workOrder: WORK_ORDER });
  const laser = rows.find((r) => r.id === 'pre-roll-analysis');
  assert.equal(laser.issuer, 'CONSERVATOIRE', 'it is not the contractor\'s document');
  assert.equal(laser.process, 'LASER', 'and it is the only laser print in the corpus');
  assert.equal(laser.reproduction, 'ORIGINAL', 'and it is an original, not a copy');
  assert.match(laser.note, /not our (stock|printer)/i, 'and somebody filed it saying so');

  const order = rows.find((r) => r.id === 'work-order');
  assert.equal(order.process, 'IMPACT 24', 'ordinary company paperwork is dot matrix');
}

// ── the log is a clock failing, and only the column shows it ───────────────
{
  const everyPage = Object.fromEntries(PAGES.map((p) => [p.id, { firstSeenAt: 1, firstSeenRunId: 'r', count: 1 }]));
  const rows = fileRegisterRows({ knowledge: everyPage, pages: PAGES });
  const dates = ['page-1', 'page-5', 'page-7', 'page-8', 'page-10']
    .map((id) => rows.find((r) => r.id === id).date);
  assert.deepEqual(dates, ['21:40', '01:35', '02:5?', '??:??', '—'],
    'the sheets keep their own times, and they stop being times');
}

// ── the notes column is mostly empty, on purpose ───────────────────────────
{
  const everyPage = Object.fromEntries(PAGES.map((p) => [p.id, { firstSeenAt: 1, firstSeenRunId: 'r', count: 1 }]));
  const rows = fileRegisterRows({ knowledge: everyPage, pages: PAGES });
  const logRows = rows.filter((r) => /^page-\d+$/.test(r.id));
  const annotated = logRows.filter((r) => r.note);
  assert.ok(annotated.length > 0, 'the clerk wrote on some of them');
  assert.ok(annotated.length < logRows.length,
    'and not on all of them — a note in every cell is a column of noise');
}

// ── the holdings are always there ──────────────────────────────────────────
{
  const rows = holdingsRegisterRows({ dossier: HUSH_DOSSIER });
  assert.equal(rows.length, 8, 'all eight, and a filing cabinet does not conceal its own drawer');
  assert.ok(rows.every((r) => r.register === REGISTER.HOLDINGS));
  assert.ok(rows.every((r) => r.note), 'every holding carries a filing note');
  assert.ok(rows.every((r) => r.lines.length >= 3), 'and its authored body survives the join');

  // The document's own marginalia stays inside the document. The registry note
  // is a different layer, written by whoever filed it.
  const schedule = rows.find((r) => r.id === 'transfer-without-owner');
  assert.match(schedule.lines.join(' '), /ELLERY HAND/, 'the hand in the margin is still in the text');
  assert.ok(!/ELLERY HAND/.test(schedule.note), 'and it is not what the filing note says');
}

// ── the spine: found paper and its file copy point at each other ───────────
{
  const rows = [
    ...fileRegisterRows({ knowledge: KNOWLEDGE, pages: PAGES, workOrder: WORK_ORDER }),
    ...holdingsRegisterRows({ dossier: HUSH_DOSSIER }),
  ];
  const sheet = rows.find((r) => r.id === 'pre-roll-analysis');
  const cited = resolveCitations(sheet, rows);
  assert.deepEqual(cited.map((r) => r.id), ['before-first-bar'],
    'the sheet in your bag points at the file copy');

  const fileCopy = rows.find((r) => r.id === 'before-first-bar');
  assert.ok(resolveCitations(fileCopy, rows).some((r) => r.id === 'pre-roll-analysis'),
    'and the file copy points back');

  // A citation to something not in play resolves to nothing rather than a hole.
  const orphan = resolveCitations({ cites: ['no-such-document'] }, rows);
  assert.deepEqual(orphan, []);
  assert.deepEqual(resolveCitations(null, rows), []);
}

// ── every character the registry prints must exist in the ROM ──────────────
// A glyph the VFD font lacks draws NOTHING, silently — right position, right
// colour, no pixels. Authored prose is exactly where a stray curly quote or an
// en-dash gets in.
{
  const text = [
    ...Object.values(filingNotes()),
    ...Object.values(registryReferences()),
    ...HUSH_DOSSIER.flatMap((d) => [d.title, d.source, d.date, d.status, ...d.paragraphs]),
  ].join(' ');
  const missing = [...new Set([...text].filter((ch) => vfdGlyphMissing(ch)))];
  assert.deepEqual(missing, [], `characters with no glyph in the ROM: ${JSON.stringify(missing.join(''))}`);
}

// ── documentLines copes with both authored shapes ──────────────────────────
{
  assert.deepEqual(documentLines({ paragraphs: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(documentLines({ body: ['a', '', { raw: 'REF  1' }] }), ['a', '', 'REF  1'],
    'monospace table rows pass through as written, and blank lines survive');
  assert.deepEqual(documentLines(null), []);
}

// ── the join the whole register hangs on ────────────────────────────────────
// Documents are filed under a slugified id. If the registry looked them up under
// the raw one, a page whose id ever gained a capital would vanish from the file
// and read as a document nobody ever found.
{
  assert.equal(progressionDocumentId('Pre-Roll Analysis'), 'pre-roll-analysis');
  assert.equal(progressionDocumentId('page-7'), 'page-7', 'todays ids pass through unchanged');

  const shouty = fileRegisterRows({
    knowledge: { 'work-order': { firstSeenAt: 1, firstSeenRunId: 'r', count: 1 } },
    pages: [],
    workOrder: { id: 'Work Order', title: 'WORK ORDER' },
  });
  assert.equal(shouty.length, 1, 'a document is found under the id it was actually filed under');
}

// ── the machine itself ──────────────────────────────────────────────────────
// render() needs a canvas, but the navigation does not, and navigation is where
// an off-by-one strands the player in an empty register with no way back.
{
  const { makeTransferRoomScene } = await import('../src/game/transfer-room.js');
  const meta = { knowledge: { documents: KNOWLEDGE }, returns: { records: {}, history: [] } };
  const scene = makeTransferRoomScene({ meta });

  assert.equal(scene.id, 'transfer-room');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);

  // Every key is claimed, so nothing falls through this scene to the world.
  for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'PageDown', 'PageUp', 'q']) {
    assert.equal(scene.key({ key }), true, `${key} is handled`);
  }

  // Cycling the registers must come back round rather than run off the end.
  for (let i = 0; i < 9; i++) assert.equal(scene.key({ key: 'Tab' }), true);
  // And an empty register must not throw when navigated.
  scene.key({ key: '3' });
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) assert.equal(scene.key({ key }), true);
}

console.log('transfer-registry.spec.mjs ok');
