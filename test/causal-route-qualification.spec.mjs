import test from 'node:test';
import assert from 'node:assert/strict';
import { CAUSAL_TOPOLOGY_HASH, CAUSAL_SPINE_IDS, causalContentHash, causalRouteRequirements,
  sealCausalTape, validateCausalTape, tapeQualifies } from '../src/causal/tape.js';
import { causalRecorder } from '../src/causal/recorder.js';
import { makeHushPlayback } from '../src/causal/playback.js';
import { MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { initGameStorage } from '../src/platform/storage/storageService.js';
import { freshMeta, freshRunRecord } from '../src/progression/schema.js';
import { commitReturn, progressionEvents, unlockCausalTapeAchievement } from '../src/progression/runtime.js';
import { finalizeCausalReturn } from '../src/progression/causal-progression.js';
import { withTransientGameState, getMeta } from '../src/game/save.js';
import { causalFixtureReturnEvent } from './helpers/causal-fixture.mjs';

// Deliberately independent expected footprints. These supplied route states
// test contracts and storage, not whether a player walked the route.
const base = ['spine:service-threshold', 'spine:b3-first-slate'];
const source = [...base, 'spine:practice-wing', 'spine:first-reference', 'spine:source-threshold'];
const chapel = [...source, 'spine:chapel-contact'];
const cases = [
  ...['sacrifice', 'helped', 'inversion', 'drugged', 'surfaced'].map(endingId => ({ endingId, anchors: chapel, route: 'chapel' })),
  ...['tower-won', 'tower-lost'].map(endingId => ({ endingId, anchors: source, route: 'tower' })),
  ...['contact-won', 'contact-lost'].map(endingId => ({ endingId, anchors: source, route: 'contact' })),
  { endingId: 'sacrifice', endingVariant: 'century-stay', anchors: base, route: 'century-stay' },
  { endingId: 'contact-lost', endingVariant: 'source-rest', anchors: source, route: 'source-rest' },
];
const anchor = (id, index) => ({ id, at: 100 + index * 100, order: index, verb: id.endsWith('contact') ? 'contact' : 'haunt',
  required: true, locus: { x: index, y: 1, spaceId: id === 'spine:source-threshold' ? 'source-space' : 'conservatory' } });
function tapeFor(row, changes = {}) {
  const runId = `route-${row.endingId}-${row.endingVariant || 'ordinary'}`;
  return sealCausalTape({ runId, returnSummaryId: `return:${runId}`, endingId: row.endingId, endingVariant: row.endingVariant ?? null,
    durationMs: 2000, qualification: { injuries: 3, difficulty: 'contract', completedAt: 2000 },
    shadowFrames: [{ t: 0, x: 1, y: 1, spaceId: 'conservatory' }, { t: 2000, x: 2, y: 1, spaceId: 'conservatory' }],
    anchors: row.anchors.map(anchor), events: [causalFixtureReturnEvent(runId, row.endingId, { endingVariant: row.endingVariant ?? null, at: 2000 })],
    ...changes });
}
const rehash = tape => ({ ...tape, contentHash: causalContentHash(tape) });

test('all nine completed endings and both variants qualify from their own minimal observed route', () => {
  assert.equal(CAUSAL_TOPOLOGY_HASH, 'conservatory-night:v3');
  assert.equal(new Set(cases.map(row => row.endingId)).size, 9);
  for (const row of cases) {
    const tape = tapeFor(row), result = validateCausalTape(tape);
    assert.equal(result.ok, true, `${row.endingId}/${row.endingVariant || 'ordinary'}`);
    assert.deepEqual(tape.requirements.causalSpine, row.anchors);
    assert.equal(tape.requirements.route, row.route);
    assert.equal(makeHushPlayback(tape).tape, tape);
    assert.equal(tape.anchors.some(item => item.id === 'spine:bell-row'), false);
    assert.equal(tape.anchors.some(item => item.id === 'spine:second-recording'), false);
  }
  assert.equal(tapeQualifies(3), true, 'the canonical injury ceiling is preserved');
  assert.equal(tapeQualifies(4), false);
});

test('each required cause is necessary and a different branch cannot substitute for it', () => {
  for (const row of cases) for (const missing of row.anchors) {
    const tape = tapeFor(row, { anchors: row.anchors.filter(id => id !== missing).map(anchor) });
    assert.equal(validateCausalTape(tape).reason, 'CAUSAL_SPINE_INCOMPLETE', `${row.route}: ${missing}`);
  }
  const tower = cases.find(row => row.endingId === 'tower-won');
  const wrongBranch = tapeFor(tower, { anchors: [...base, 'spine:chapel-contact', 'spine:bell-row'].map(anchor) });
  assert.equal(validateCausalTape(wrongBranch).reason, 'CAUSAL_SPINE_INCOMPLETE');
});

test('a genuine terminal event must match the sealed return owner, ending and variant within its recorded duration', () => {
  const row = cases.find(item => item.endingVariant === 'century-stay'), tape = tapeFor(row);
  for (const change of [
    summary => ({ ...summary, id: 'return:another' }),
    summary => ({ ...summary, runId: 'another' }),
    summary => ({ ...summary, endingId: 'helped' }),
    summary => ({ ...summary, endingVariant: null }),
  ]) {
    const altered = structuredClone(tape);
    altered.events[0].payload.summary = change(altered.events[0].payload.summary);
    assert.equal(validateCausalTape(rehash(altered)).reason, 'CAUSAL_RETURN_UNVERIFIED');
  }
  assert.equal(validateCausalTape(tapeFor(row, { events: [] })).reason, 'CAUSAL_RETURN_UNVERIFIED');
  const late = structuredClone(tape); late.events[0].at = tape.durationMs + 1;
  assert.equal(validateCausalTape(rehash(late)).reason, 'CAUSAL_RETURN_UNVERIFIED');
});

test('caller flags and a recomputed checksum cannot erase the canonical route requirements', () => {
  const tape = tapeFor(cases[0], { requireCausalSpine: false, requirements: { causalSpine: [] } });
  assert.deepEqual(tape.requirements.causalSpine, chapel);
  const erased = structuredClone(tape); erased.requirements.causalSpine = [];
  assert.equal(validateCausalTape(rehash(erased)).reason, 'CAUSAL_ROUTE_INCOMPATIBLE');
  assert.equal(causalRouteRequirements({ endingId: 'invented-ending' }), null);
  assert.equal(validateCausalTape(tapeFor(cases[0], { endingVariant: 'invented-variant' })).reason, 'CAUSAL_ROUTE_INCOMPATIBLE');
  assert.equal(validateCausalTape(tapeFor(cases[0], { endingVariant: 'source-rest' })).reason, 'CAUSAL_ROUTE_INCOMPATIBLE');
});

test('optional second-recording and old bell causes remain intact and replayable when actually observed', () => {
  const observed = CAUSAL_SPINE_IDS.map((id, index) => ({ ...anchor(id, index), payload: { observed: id } }));
  const tape = tapeFor(cases[0], { anchors: observed });
  assert.equal(validateCausalTape(tape).ok, true);
  for (const id of ['spine:bell-row', 'spine:second-recording'])
    assert.deepEqual(tape.anchors.find(row => row.id === id).payload, { observed: id });
  assert.equal(makeHushPlayback(tape).tape.anchors.length, CAUSAL_SPINE_IDS.length);
});

test('legacy v2 data is not silently upgraded into current qualification or a new award', async () => {
  const tape = tapeFor(cases[0]);
  const old = rehash({ ...tape, topologyHash: 'conservatory-night:v2', requirements: { causalSpine: [...CAUSAL_SPINE_IDS] } });
  assert.equal(validateCausalTape(old).reason, 'TOPOLOGY_INCOMPATIBLE');
  const meta = freshMeta(); meta.returns.records[tape.returnSummaryId] = { id: tape.returnSummaryId, runId: tape.runId,
    endingId: tape.endingId, endingVariant: null, injuries: 3, integrity: { achievements: { eligible: true } } };
  await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'current-B', now: 3000 }) } }, async () => {
    assert.equal(unlockCausalTapeAchievement(old, { notify: false }).ok, false);
    assert.equal(!!getMeta().achievements.ACH_SECOND_TRACK, false);
    assert.equal(!!getMeta().achievements.ACH_COMPLETE_ARCHIVE, false);
  });
});

test('the production event feed, sealing and delayed award path accept each supplied completed route without foreign milestones', async () => {
  await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'ROUTE-QUALIFICATION-TEST' });
  for (const [index, row] of cases.entries()) {
    const runId = `completed-route-${index}`;
    await withTransientGameState({ meta: freshMeta(), save: { run: freshRunRecord({ id: runId, now: 1000 }) } }, async () => {
      causalRecorder.begin({ runId }); causalRecorder.tick(.1, { x: 1, y: 1, spaceId: 'conservatory' });
      row.anchors.forEach((id, i) => causalRecorder.recordAnchor(anchor(id, i)));
      const unsubscribe = progressionEvents.on('*', event => causalRecorder.recordEvent({ actor: 'system', type: event.type, payload: event.payload }));
      try {
        const summary = commitReturn(row.endingId, { rec: { takes: [], injuries: 3 }, endingVariant: row.endingVariant ?? null,
          endingArrival: row.endingVariant === 'century-stay' ? 'agreed' : row.endingVariant === 'source-rest' ? 'rested' : null }, 2000);
        const result = await finalizeCausalReturn(summary);
        assert.equal(result.ok, true, `${row.endingId}/${row.endingVariant || 'ordinary'}`);
        assert.equal(result.tape.topologyHash, 'conservatory-night:v3');
        assert.deepEqual(result.tape.requirements.causalSpine, row.anchors);
        assert.equal(result.tape.endingVariant, row.endingVariant ?? null);
        assert.equal(getMeta().achievements.ACH_SECOND_TRACK.runId, runId);
        assert.equal(getMeta().returns.records[summary.id].causalTape.status, 'ready');
      } finally { unsubscribe(); }
    });
  }
});
