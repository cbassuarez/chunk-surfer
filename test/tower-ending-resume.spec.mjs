import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import { ENDING_VARIANT, endingManifest } from '../src/data/endings.js';
import { normalizeEndingCutsceneCheckpoint } from '../src/game/save.js';
import { advanceEndingCutscene, createEndingCutsceneState } from '../src/game/ending-cutscene.js';
import { createEndingEmbodimentState, reduceEndingEmbodiment, ENDING_FINAL_ACTION_MODE } from '../src/game/ending-embodiment.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function block(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing production block ${start}`);
  return main.slice(from, to);
}

function resumedEnding({ id = 'tower-won', arrival = 'carried', checkpoint = true, reduced = false } = {}) {
  scenes.clear();
  const saved = {
    run: { id: 'earned-tower', status: 'active' }, settings: { shake: reduced ? 'reduced' : 'full' },
    px: 256, py: 357,
    endingCutscene: checkpoint ? normalizeEndingCutsceneCheckpoint({ endingId: id, arrival }) : null,
    chunkSurf: { finale: { stage: 'resolved', result: 'won', cathedral: { extraction: {
      player: { x: 256, y: 357 }, drag: { position: { x: 256, y: 359.3 }, gripped: true },
      cutscene: { complete: true, cursor: 5 },
    } } } },
  };
  const prose = [], effects = [], finishes = [];
  let clock = 0;
  const noop = () => {};
  const context = {
    scenes, ENDING_VARIANT, endingManifest, advanceEndingCutscene, createEndingCutsceneState,
    createEndingEmbodimentState, reduceEndingEmbodiment, ENDING_FINAL_ACTION_MODE,
    activeEndingCutscene: null, escape: null, endingArrival: null, endingDossier: null,
    px: saved.px, py: saved.py, RENDERER: '3d',
    R3: { r3dLookAngles: () => ({ yaw: 0, pitch: -.08 }), r3dDelta: () => [0, -1] },
    getSave: () => saved, saveCommit: patch => Object.assign(saved, patch),
    performance: { now: () => clock }, usingSourceSpace: () => false,
    windowChoreography: { beginEnding: noop, compositionEvent: noop },
    currentEndingDossier: () => ({ coffee: false, hush: {} }), commitEndingFlags: noop,
    startEndingTimeline: noop, STORY: { startSoundtrack: noop },
    endingReferenceBeat: () => [], dockEndingBeat: () => [],
    endingDocuments: endingId => [{ id: `ending.${endingId}`, slate: '' }],
    runtimeEndingTree: () => ({ start: { lines: [{ text: 'The earned ending.', sourceId: 'start.line.1' }] } }),
    endingStoryContext: () => ({}),
    presentFinale: (_lines, options) => prose.push(options),
    noteEndingCutsceneLine: () => {}, finishEnding: endingId => finishes.push(endingId),
    endingCutsceneWorldView: () => null,
    // The player is already outside, so neither spatial gate is available.
    endingCutsceneAnchors: () => ({ nave: { x: 257, y: 379 }, westDoors: { x: 256.5, y: 360.5 } }),
    applyEndingCutsceneBeat: beat => {
      effects.push(beat.id);
      context.activeEndingCutscene.embodiment = reduceEndingEmbodiment(context.activeEndingCutscene.embodiment, { type: 'beat', beat });
    },
    expressTowerResistance: () => false, drawTowerResistancePrompt: noop,
    document: { documentElement: { dataset: {} } },
  };
  vm.createContext(context);
  vm.runInContext([
    block('function startActiveEndingCutscene(', 'function endingLogicalOffset('),
    block('function advanceActiveEndingCutscene(input={}){', 'function noteEndingCutsceneLine('),
    block('function presentEndingFinalAction(', 'function currentEndingDossier('),
    block('function playEnding(', '// What authored `{token}` interpolation can reach.'),
  ].join('\n'), context);
  return { saved, context, effects, finishes,
    resume: () => vm.runInContext('resumeEndingCutsceneFromSave()', context),
    completeProse: () => { while (prose.length) prose.shift().onDone(); },
    advanceClock: ms => { clock += ms; vm.runInContext('advanceActiveEndingCutscene()', context); },
  };
}

test('reloading the earned Tower ending reaches its final image without repeating grip, movement or door actions', () => {
  for (const reduced of [false, true]) {
    const h = resumedEnding({ reduced }), extraction = JSON.stringify(h.saved.chunkSurf.finale.cathedral.extraction);
    try {
      assert.equal(h.resume(), true);
      const active = h.context.activeEndingCutscene, manifest = endingManifest('tower-won');
      assert.equal(h.context.escape, null);
      assert.equal(active.state.complete, true);
      assert.equal(active.state.cursor, manifest.cutscene.beats.length);
      assert.equal(active.state.reducedMotion, reduced);
      assert.deepEqual(h.effects, manifest.cutscene.beats.map(beat => beat.id));
      h.completeProse();
      assert.equal(scenes.top().id, 'ending-hold:tower-won', 'resolution must not wait on an unavailable nave position');
      assert.equal(active.embodiment.finalHold, true);
      assert.equal(active.embodiment.finalActionId, 'open-west-doors');
      scenes.top().update(3.1);
      assert.deepEqual(h.finishes, ['tower-won']);
      h.advanceClock(60000);
      assert.equal(h.effects.length, manifest.cutscene.beats.length, 'reconstructed spatial effects fire only once');
      assert.equal(JSON.stringify(h.saved.chunkSurf.finale.cathedral.extraction), extraction, 'the actual earned bodies and extraction checkpoint are preserved');
    } finally { scenes.clear(); }
  }
});

test('the Tower resume repair preserves ordinary ending replay and rejects an invalid Tower arrival', () => {
  const lost = resumedEnding({ id: 'tower-lost', arrival: 'defeated' });
  try {
    assert.equal(lost.resume(), true);
    assert.equal(lost.context.activeEndingCutscene.state.cursor, 0);
    assert.equal(lost.context.activeEndingCutscene.state.complete, false);
    assert.deepEqual(lost.effects, []);
    lost.completeProse();
    assert.equal(scenes.top().id, 'ending-resolution:tower-lost');
  } finally { scenes.clear(); }
  const invalid = resumedEnding({ arrival: 'agreed' });
  assert.equal(invalid.resume(), false);
  assert.equal(invalid.saved.endingCutscene, null);
  assert.equal(invalid.context.activeEndingCutscene, null);
});

test('an unfinished carry without a terminal ending checkpoint is not completed by the resume repair', () => {
  const h = resumedEnding({ checkpoint: false });
  h.saved.chunkSurf.finale.stage = 'tower-escape';
  h.saved.chunkSurf.finale.cathedral.extraction.cutscene = { complete: false, cursor: 3 };
  assert.equal(h.resume(), false);
  assert.equal(h.context.activeEndingCutscene, null);
  assert.equal(h.saved.chunkSurf.finale.cathedral.extraction.cutscene.complete, false);
});
