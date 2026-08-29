import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sourcePageDocument, sourcePageFor } from '../src/data/source-pages.js';
if (!globalThis.document) globalThis.document = { title: '' };
const { makeDocumentScene } = await import('../src/game/document.js');
const {
  SOURCE_STILL_DOCUMENT,
  makeSourcePageScene,
  makeSourceStillPageScene,
} = await import('../src/game/source-page-scene.js');

const page = sourcePageFor(5, 3, 99);
const doc = sourcePageDocument(page);
assert.equal(doc.id, `source-page:${page.id}`);
assert.equal(doc.title, page.lines[0]);
assert.deepEqual(doc.body.map((entry) => entry.raw), page.lines.slice(1));
assert.equal(doc.decay, 0, 'authored Source corruption must not receive random document erosion');
assert.ok(['handledCopy', 'badPhotocopy', 'damagedCopy'].includes(doc.paper.profile));

const ordinary = makeDocumentScene(doc, { id: 'source-page-test', sourcePressureLive: true, lookProfile: 'hush' });
assert.equal(ordinary.id, 'source-page-test');
assert.equal(ordinary.blocksInput, true);
assert.equal(ordinary.blocksWorld, false);
assert.equal(ordinary.sourcePressureLive, true);
assert.equal(ordinary.lookProfile, 'hush');
assert.equal(ordinary.lensPreset, 'hush', 'document scenes lost their legacy lensPreset alias');

const scene = makeSourcePageScene({ page });
assert.equal(scene.id, 'source-page');
assert.equal(scene.blocksInput, true, 'reading still holds player locomotion');
assert.equal(scene.blocksWorld, false, 'the Source world must continue while the page is read');
assert.equal(scene.sourcePressureLive, true, 'page reading explicitly opts out of automatic Source protection');
assert.deepEqual(scene.view().lines, [...page.lines]);
assert.equal(scene.view().documentId, doc.id);

// The one sheet that commits the transition is no longer a floor texture plus
// an immediate world pop. It is a real, readable A4 inspection surface and its
// opaque surround is the visual cover under which the forward swap happens.
const still = makeSourceStillPageScene();
assert.equal(still.id, 'source-still-page');
assert.equal(still.blocksInput, true);
assert.equal(still.blocksWorld, false, 'the Source swap must complete underneath the held sheet');
assert.equal(still.sourcePressureLive, false, 'the committed threshold is protected, unlike a decoy read');
assert.equal(still.transitionCover, true);
assert.equal(still.view().documentId, 'source-real-still');
assert.deepEqual(still.view().lines, SOURCE_STILL_DOCUMENT.body.map((entry) => entry.raw || ''));
assert.ok(still.view().lines.some((line) => line.includes('ELLERY CONSERVATOIRE')),
  'the still sheet has no legible authored content');

const source = readFileSync('src/game/source-page-scene.js', 'utf8');
assert.doesNotMatch(source, /drawMachinePanel/, 'Source pages regressed to the bespoke machine-panel renderer');
assert.doesNotMatch(source, /uiText\(/, 'Source pages regressed to bespoke terminal typography');
assert.match(source, /makeDocumentScene/, 'Source pages no longer route through the ordinary document reader');
assert.match(source, /uiFill\(0, 0, cols, rows, '#000'\)/,
  'the still sheet no longer fully covers the geometry swap');

console.log('source page presentation specs passed');
