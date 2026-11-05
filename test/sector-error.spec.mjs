import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SECTOR_ERROR_ROW_PITCH, sectorErrorFragment, sectorErrorLines, sectorErrorPhases,
} from '../src/render/sector-error.js';
import {
  SECTOR_INTRUSION_EVENT, WINDOW_COMPOSITION_PURPOSES, SECTOR_RUN_EVENT_PREFIX, SECTOR_CLEAR_EVENT, SECTOR_PANE_GRID,
  endingCompositionPlan, sectorErrorCompositionPlan, sectorIntrusionCue, sourceDecayCompositionPlan, sourceWarningCompositionPlan,
} from '../src/platform/window-composition.js';
import { createWindowChoreographyDirector } from '../src/platform/window-choreography.js';
import { SOURCE_FAULT_LANES, SOURCE_FAULT_RUN_MS, sourceFaultFrame } from '../src/game/source-faults.js';

test('the warnings read like a clone crossing a bad region', () => {
  const lines = sectorErrorLines({ count: 40, seed: 4417 });
  assert.equal(lines.length, 40);
  for (const line of lines) {
    assert.match(line, /^WARNING: Can't read sector at \d+, lost data\.$/,
      'the line is the ntfsclone warning verbatim');
  }

  // Offsets climb, never repeat, and are sector-aligned — 512 bytes, which is
  // what makes them read as real rather than as random big numbers.
  const offsets = lines.map((line) => Number(/at (\d+),/.exec(line)[1]));
  for (let i = 1; i < offsets.length; i += 1) {
    assert.ok(offsets[i] > offsets[i - 1], 'the clone only ever moves forward');
    assert.equal((offsets[i] - offsets[i - 1]) % 512, 0, 'every step is a whole number of sectors');
  }

  // The cadence: mostly a few sectors along, occasionally a long seek past a
  // stretch it has given up on. A run of uniform steps is not what a failing
  // disk looks like.
  const steps = offsets.slice(1).map((value, i) => value - offsets[i]);
  assert.ok(steps.some((step) => step <= 512 * 6), 'it crawls');
  assert.ok(Math.max(...steps) > 512 * 1000, 'and it also gives up and seeks');
});

test('one seed reads one disk', () => {
  assert.deepEqual(sectorErrorLines({ count: 8, seed: 99 }), sectorErrorLines({ count: 8, seed: 99 }));
  assert.notDeepEqual(sectorErrorLines({ count: 8, seed: 99 }), sectorErrorLines({ count: 8, seed: 100 }));
  assert.match(sectorErrorFragment(7), /^\d{3,7}$/);
  assert.ok(SECTOR_ERROR_ROW_PITCH > 0);
});

test('the renderer and the phase baker survive having no DOM', () => {
  // Both are called from module scope on the server side of a test run, and a
  // readout that throws headless takes the whole scene down with it.
  assert.deepEqual(sectorErrorPhases({ count: 3 }), []);
});

test('the sector screen is its own purpose and cuts between scroll phases', () => {
  assert.ok(WINDOW_COMPOSITION_PURPOSES.includes('sector'));
  const tokens = ['snapshot-a', 'snapshot-b', 'snapshot-c'];
  const plan = sectorErrorCompositionPlan({ phaseTokens: tokens });
  assert.equal(plan.purpose, 'sector');
  assert.equal(plan.surfaces.length, 4, 'four terminals on one failing disk');

  // SNAPSHOTS, NOT TEXT PANES. window-media-surface.js is a shader with an
  // image sampler and no glyph path, so a text pane renders in the in-canvas
  // simulation and comes up black on the desktop.
  assert.ok(plan.surfaces.every((surface) => surface.content.kind === 'snapshot'));

  // Motion is a CUT between stills, which is what a terminal actually does.
  // (Event cues are the world's runs; see the next test.)
  assert.ok(plan.score.loop, 'the disk keeps failing');
  const scroll = plan.score.cues.filter((cue) => !cue.event);
  assert.ok(scroll.length >= tokens.length * plan.surfaces.length);
  for (const cue of scroll) {
    for (const op of cue.operations) {
      assert.equal(op.type, 'assign');
      assert.equal(op.transition, 'cut', 'a terminal redraws, it does not tween');
    }
  }
  assert.equal(sectorErrorCompositionPlan({ phaseTokens: [] }), null, 'no phases, no screen');
});

test('the intrusion is a baked event cue, because nothing can assign a pane at runtime', () => {
  // The simulation exposes show/snap/coherence/freeze/trigger/hide and the
  // effects layer exposes triggerComposition. Neither has a public "assign this
  // pane now", so the only road is a named event cue compiled into the plan and
  // fired by name — which is why the token must exist at compile time.
  const cues = sectorIntrusionCue(['a', 'b'], 'snapshot-x');
  assert.equal(cues.length, 2);
  assert.ok(cues.every((cue) => cue.event === SECTOR_INTRUSION_EVENT));
  assert.equal(sectorIntrusionCue(['a'], 'not-a-token').length, 0, 'a bad token adds nothing');
  assert.equal(sectorIntrusionCue([], 'snapshot-x').length, 0);

  const plain = endingCompositionPlan('sacrifice');
  const bugged = endingCompositionPlan('sacrifice', { intrusionToken: 'snapshot-x' });
  assert.ok(bugged.score.cues.length > plain.score.cues.length,
    'an ending carrying a token can drop a pane into the failure');
  assert.ok(bugged.score.cues.some((cue) => cue.event === SECTOR_INTRUSION_EVENT));
  assert.ok(!plain.score.cues.some((cue) => cue.event === SECTOR_INTRUSION_EVENT),
    'and one without a token is untouched');
});

test('the fault band on Source ground carries the warnings', () => {
  // MATERIAL.sourceFault cells route to the hush band (sourceLayerAtWorld) and
  // MAT_SOURCE_FAULT already tints red, so band 8 is the one surface in Source
  // space allowed to stop being the repository and start being the failure to
  // read it. Asserted on the source because sourceSurfaceLines is a closure
  // inside createSourceSpaceRuntime.
  const runtime = readFileSync(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /const SOURCE_FAULT_LAYER = SOURCE_LAYER_BY_SECTOR\.hush;/);
  assert.match(runtime, /sectorErrorLines\(\{count:Math\.max\(6,lines\.length\*2\)/,
    'the fault band is seeded from the run');
  assert.match(runtime, /if\(layer!==SOURCE_FAULT_LAYER\)/, 'the other seven bands stay exact source');

  // The text-card path is NOT usable: chunk-surf-visual.spec.mjs asserts every
  // text instance displays verbatim repository source, so a fabricated warning
  // card fails there. This must stay on the surface texture.
  assert.doesNotMatch(runtime, /semantic:\s*'text-architecture:sector/,
    'warnings never become provenance-bearing text cards');
});

// THE FLOOR AND THE GLASS ARE ONE DISK. The world's scored bad-sector runs
// (game/source-faults.js) reach every terminal plan as event cues.
test('every terminal plan fails on the world\'s runs: the lane\'s pane takes the head, the clear mends all', () => {
  const tokens = Array.from({ length: 20 }, (_, index) => `snapshot-${index}`);
  const runEvents = (plan) => plan.score.cues.filter((cue) => cue.event?.startsWith(SECTOR_RUN_EVENT_PREFIX));
  const plans = [
    sectorErrorCompositionPlan({ phaseTokens: tokens, runMs: SOURCE_FAULT_RUN_MS }),
    sourceWarningCompositionPlan({ phaseTokens: tokens, runMs: SOURCE_FAULT_RUN_MS }),
    sourceDecayCompositionPlan({ phaseTokens: tokens, decayTokens: tokens.slice(0, 4), runMs: SOURCE_FAULT_RUN_MS }),
  ];
  for (const plan of plans) {
    assert.equal(plan.fault.intensity, 0, `${plan.compositionId}: a terminal at rest carries only its baked damage`);
    assert.deepEqual(plan.fault.grid, SECTOR_PANE_GRID, `${plan.compositionId}: live tears need the stderr grid`);
    const runs = runEvents(plan);
    assert.equal(runs.length, SOURCE_FAULT_LANES, `${plan.compositionId}: one cue per world lane`);
    runs.forEach((cue, lane) => {
      const head = cue.operations.find((op) => op.run && op.intensity > .5);
      assert.ok(head, `${plan.compositionId}: lane ${lane} has a pane that takes the run`);
      assert.deepEqual(head.targets, [plan.surfaces[lane % plan.surfaces.length].id]);
      assert.equal(head.run.durationMs, Math.round(SOURCE_FAULT_RUN_MS), 'the head crosses in the world run\'s own time');
    });
    const clear = plan.score.cues.find((cue) => cue.event === SECTOR_CLEAR_EVENT);
    assert.ok(clear, `${plan.compositionId}: a run that ends must mend the panes`);
    assert.deepEqual(clear.operations[0].targets.slice().sort(), plan.surfaces.map((surface) => surface.id).sort());
    assert.equal(clear.operations[0].intensity, 0);
  }
  const gentle = sectorErrorCompositionPlan({ phaseTokens: tokens, reducedMotion: true, flashMode: 'off' });
  for (const cue of runEvents(gentle)) {
    assert.equal(cue.operations.length, 1, 'gentle modes do not shake the neighbouring panes');
    assert.ok(cue.operations[0].intensity <= .35, 'gentle modes take a soft run');
  }
  const crops = plans[0].surfaces.map((surface) => JSON.stringify(surface.crop));
  assert.equal(new Set(crops).size, 4, 'four windows on one job are not four copies of one window');
  assert.ok(plans[0].surfaces.every((surface) => Math.abs(surface.crop.w - surface.crop.h) < 1e-9 || surface.crop.w === surface.crop.h),
    'a crop keeps the pane\'s own aspect so the glyphs are not squashed');
});

test('the desktop tears a terminal only in whole cells and rows, and only while a run is on', () => {
  const shader = readFileSync(new URL('../src/window-media-surface.js', import.meta.url), 'utf8');
  assert.match(shader, /if\(terminal==1\)\{outColor=vec4\(faultIntensity>0\.\?terminalFault\(uv\):texture\(image,crop\.xy\+uv\*crop\.zw\)/,
    'a terminal at rest must stay a straight blit of its frame');
  const body = shader.slice(shader.indexOf('vec3 terminalFault('), shader.indexOf('${WINDOW_SURFACE_LOOK_GLSL}'));
  const moves = body.match(/s\.x-=[^;]+;/g) || [];
  assert.ok(moves.length >= 2);
  for (const move of moves) assert.match(move, /\*cellU/, `a tear that is not a whole number of cells cuts glyphs: ${move}`);
  assert.doesNotMatch(body, /blueNoise|windowSurfaceLook/, 'no dither on terminal glyphs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /windowChoreography\?\.sourceFault\?\.\(sourceFault\)/, 'the world\'s fault frame never reaches the desktop');
});

test('a world run reaches the terminals once, in its lane, and its end clears them', async () => {
  // A stand-in canvas: the phase baker needs one, nothing here reads pixels.
  const ctx = new Proxy({ measureText: (text) => ({ width: String(text).length * 13.8 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AA' }) };
  try {
    const triggered = [];
    let tokens = 0;
    const director = createWindowChoreographyDirector({
      runtimeApi: { invoke: async () => true }, documentApi: null, waitFn: async () => {},
      effects: {
        active: () => true, sessionToken: () => 'run-session', prepareMedia: async () => true,
        registerSnapshot: async () => `snapshot-run-${tokens++}`, snapshotData: () => 'data:image/png;base64,AA',
        showComposition: async () => true, hideComposition: async () => true, hidePanes: async () => true,
        triggerComposition: async (plan, event) => { triggered.push(event); return true; },
      },
    });
    await director.beginSectorError();
    const quiet = { active: true, overflowActive: false, overflowRun: 6, overflowLane: 1 };
    const run = { active: true, overflowActive: true, overflowRun: 7, overflowLane: 2 };
    assert.equal(director.sourceFault(quiet), false, 'nothing to say between runs');
    assert.equal(director.sourceFault(run), true);
    assert.equal(director.sourceFault(run), false, 'a run is one event, not one per frame');
    assert.equal(director.sourceFault(quiet), true);
    assert.equal(director.sourceFault(quiet), false);
    assert.equal(director.sourceFault({ ...run, overflowRun: 8, overflowLane: 0 }), true);
    assert.equal(director.sourceFault({ active: false }), true, 'leaving Source ends the run on the glass too');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(triggered, ['sector:run:2', SECTOR_CLEAR_EVENT, 'sector:run:0', SECTOR_CLEAR_EVENT]);
    // And the real fault frame drives it: a run begins inside one period.
    const frames = Array.from({ length: 160 }, (_, i) => sourceFaultFrame({ sourcePhase: true, proper: true, timeMs: i * 40 }));
    assert.ok(frames.some((frame) => frame.overflowActive) && frames.some((frame) => !frame.overflowActive));
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
});
