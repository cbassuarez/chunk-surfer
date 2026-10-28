import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { PAGES } from '../src/data/conservatory-script.js';
import { WORLD_INSCRIPTIONS } from '../src/data/world-inscriptions.js';
import { FURNITURE_INVENTORY_PAGE, furnitureRecognitionLine } from '../src/data/furniture-recognitions.js';
import * as OBJ from '../src/game/objectives.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const page = PAGES.find(item => item.id === FURNITURE_INVENTORY_PAGE);
const ids = ['deadend-ground-armchair', 'deadend-ground-chair', 'deadend-ground-credenza'];
const props = new Map(CONSERVATORY_PROPS.map(prop => [prop.id, prop]));

// Exercise production dispatch against the actual authored paper and objective
// serializer. Browser movement, rendering and durable storage are separate.
function productionFunction(name, endMarker, environment) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${name} has stable production boundaries`);
  return new Function('environment', `with (environment) { return (${main.slice(start, end).trim()}); }`)(environment);
}

test('ordinary furniture stays ordinary before the specific inventory has been acquired', () => {
  for (const id of ids) {
    const fallback = props.get(id).inspect.first;
    for (const readPageIds of [[], ['page-1'], ['foh-overflow-note-other'], null]) {
      assert.equal(furnitureRecognitionLine(id, { readPageIds, fallback }), fallback);
    }
  }
  const fallback = Object.freeze({ unchanged: true });
  assert.equal(furnitureRecognitionLine('acq-foyer-sofa-01', { readPageIds: [page.id], fallback }), fallback,
    'the rest of the institution does not acquire a secret-comparison layer');
});

test('the inventory corroborates the three existing objects without inventing two physical stamps', () => {
  assert.equal(page.hosted, 'deadend-ground-credenza');
  const body = page.body.map(line => typeof line === 'string' ? line : line.raw || '').join('\n');
  for (const id of ids) {
    assert.ok(body.includes(props.get(id).provenance.assetTag));
    const line = furnitureRecognitionLine(id, { readPageIds: [page.id] });
    assert.ok(line);
    assert.doesNotMatch(line, /collect|unlock|reward|solve|code|next one|match all|secret/i);
  }
  assert.equal(props.get('deadend-ground-chair').mesh, 'wooden_chair_01', 'preserve the existing silhouette and material');
  assert.match(props.get('deadend-ground-chair').inspect.first, /green paint.*wood/i,
    'the worn paint on the imported wooden chair corroborates the paper’s green-chair wording');
  const armchair = WORLD_INSCRIPTIONS.find(inscription => inscription.hostId === ids[0]);
  assert.equal(armchair.copy, 'FOH/F-06');
  assert.match(furnitureRecognitionLine(ids[0], { readPageIds: [page.id] }), /rear rail/);
  for (const id of ids.slice(1)) {
    assert.equal(WORLD_INSCRIPTIONS.some(inscription => inscription.hostId === id), false);
    assert.doesNotMatch(furnitureRecognitionLine(id, { readPageIds: [page.id] }), /stamp|engraved|printed|lettering/i,
      'textual inventory provenance must not become a claim of a rendered mark');
  }
  assert.doesNotMatch(props.get(ids[2]).inspect.again, /drawer is open now/i,
    'inspection state must not assert an unimplemented geometric drawer state');
});

test('production inspection recognizes the paper after a real objective save/reload without granting anything', () => {
  const original = structuredClone(OBJ.saveObjState());
  const seen = new Set(), events = [];
  const inspect = productionFunction('inspectPropTracked', '\nfunction auditionPropTracked(', {
    PROPS: { inspectProp(id) { const prop = props.get(id); const known = seen.has(id); seen.add(id); return known ? prop.inspect.again : prop.inspect.first; } },
    OBJ, furnitureRecognitionLine, flagTest: () => false,
    academicBouncers: {learnFromProp: () => null}, // An unrelated, unearned admission clue.

    EVENT_TYPES: { PROP_INSPECTED: 'prop-inspected' },
    emitProgress: (...args) => events.push(args),
  });
  try {
    OBJ.loadObjState({ read: ['page-1'] });
    assert.equal(inspect(ids[0]), props.get(ids[0]).inspect.first);
    assert.equal(inspect(ids[0]), props.get(ids[0]).inspect.again);
    assert.equal(OBJ.markPageRead(page.id), true);
    const saved = structuredClone(OBJ.saveObjState());
    OBJ.loadObjState({ read: [] });
    OBJ.loadObjState(saved);
    for (const id of ids) assert.equal(inspect(id), furnitureRecognitionLine(id, { readPageIds: saved.read }));
    assert.deepEqual(OBJ.saveObjState(), saved, 'looking at corroborating furniture adds no receipt, waypoint, reward or progression state');
    assert.ok(events.every(([type]) => type === 'prop-inspected'), 'retain only the existing ordinary inspection event');
  } finally { OBJ.loadObjState(original); }
});

test('production hosted-page revisit reopens the filed sheet without a duplicate pickup or drawer noise', () => {
  const original = structuredClone(OBJ.saveObjState());
  const counts = { commits: 0, cues: 0, noise: 0, beats: 0, presentations: 0 };
  const present = () => { counts.presentations++; return true; };
  const take = productionFunction('takeHostedPage', '\n// THE PRACTICE WING', {
    OBJ, HOSTED_PAGES: new Map([[page.hosted, page]]),
    saveCommit() { counts.commits++; }, fireCue() { counts.cues++; },
    REC: { emitNoise() { counts.noise++; } }, px: 0, py: 0,
    readDocumentTracked: present, DOC: { readDocument: present }, himBeat() { counts.beats++; },
  });
  try {
    OBJ.loadObjState({ read: ['page-1'] });
    assert.equal(take('not-a-host'), false);
    assert.equal(take(page.hosted), true);
    assert.deepEqual(OBJ.objState().read, ['page-1', page.id]);
    const first = { ...counts }, saved = structuredClone(OBJ.saveObjState());
    // Closing a viewer does not discard a kept page. The same cabinet can be
    // revisited after reloading without manufacturing a second acquisition.
    OBJ.loadObjState(saved);
    assert.equal(take(page.hosted), true, 'the same physical host should reopen the already-filed page');
    assert.equal(counts.presentations, first.presentations + 1);
    for (const key of ['commits', 'cues', 'noise', 'beats']) assert.equal(counts[key], first[key], `${key} is acquisition-only`);
    assert.deepEqual(OBJ.saveObjState(), saved);
  } finally { OBJ.loadObjState(original); }
});
