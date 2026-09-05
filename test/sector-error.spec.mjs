import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SECTOR_ERROR_ROW_PITCH, sectorErrorFragment, sectorErrorLines, sectorErrorPhases,
} from '../src/render/sector-error.js';
import {
  SECTOR_INTRUSION_EVENT, WINDOW_COMPOSITION_PURPOSES,
  endingCompositionPlan, sectorErrorCompositionPlan, sectorIntrusionCue,
} from '../src/platform/window-composition.js';

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
  assert.ok(plan.score.loop, 'the disk keeps failing');
  assert.ok(plan.score.cues.length >= tokens.length * plan.surfaces.length);
  for (const cue of plan.score.cues) {
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
