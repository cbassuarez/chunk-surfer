import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { freshChunkSurfState, reduceChunkSurf, CHUNK_SURF_PHASE } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime, SOURCE_TRANSFORM_SECONDS } from '../src/game/source-space-runtime.js';
import {
  attenuateSourceFearPressure,
  attenuateSourceHushAudioField,
  sourceSensoryMix,
} from '../src/game/source-sensory.js';

const apply = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });

assert.equal(sourceSensoryMix({ phase: 'hall' }), 1);
assert.equal(sourceSensoryMix({ phase: 'haystack' }), 1);
assert.equal(sourceSensoryMix({ phase: 'transforming', transitionProgress: .4 }), .6);
assert.equal(sourceSensoryMix({ phase: 'transforming', transitionProgress: .1, settled: true }), 0);
for (const phase of ['landscape', 'final', 'horizon', 'bells', 'completed']) {
  assert.equal(sourceSensoryMix({ phase }), 0, `${phase} still carries Source pressure presentation`);
}

const felt = attenuateSourceFearPressure({
  overall: .9,
  heartbeat: .8,
  tapeHiss: .7,
  monitorHiss: .6,
  visualDread: .5,
  mapDisturbance: .4,
}, 0);
for (const key of ['overall', 'heartbeat', 'tapeHiss', 'monitorHiss', 'visualDread', 'mapDisturbance']) {
  assert.equal(felt[key], 0, `${key} survives the Scene Dock release`);
}

const rawField = {
  active: true,
  absorption: { audio: .8, monitor: .7, light: .9 },
  presentation: { audio: .75, monitor: .65, light: .85, hiss: 1 },
};
const quietField = attenuateSourceHushAudioField(rawField, 0);
assert.equal(quietField.absorption.audio, 0);
assert.equal(quietField.absorption.monitor, 0);
assert.equal(quietField.presentation.hiss, 0);
assert.equal(quietField.absorption.light, rawField.absorption.light,
  'audio release must not erase the independent optical HUSH field');
assert.equal(rawField.absorption.audio, .8, 'the gameplay/render field was mutated');

let state = freshChunkSurfState({ seed: 4417, returnPoint: { x: 0, y: 0, facing: 0 } });
state = apply(state, 'SOURCE_ENTERED', { returnPoint: state.returnPoint });
state = apply(state, 'HALL_ADVANCED', { distance: 112 });
state = apply(state, 'HAYSTACK_REACHED', { origin: { x: 0, y: -224 }, slot: 0 });
const runtime = createSourceSpaceRuntime({ initialState: state });
const target = runtime.sourceObjective().target;
const player = { x: target.x, y: target.y + 3, facing: 0 };
runtime.setPlayerPosition(player);

assert.equal(runtime.sourceSensoryFrame().mix, 1);
assert.equal(runtime.inspectFocused(player.x, player.y, player.facing).event, 'page-found');
assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.TRANSFORMING);
assert.equal(runtime.sourceSensoryFrame().mix, 1, 'the fade does not begin from the current pressure');
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true,
  'Pressure vanished when the sensory release began');

runtime.tick(SOURCE_TRANSFORM_SECONDS / 2, player);
assert.ok(runtime.sourceSensoryFrame().mix > .45 && runtime.sourceSensoryFrame().mix < .55,
  'pressure does not audibly ease under the still page');
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true,
  'the fading sensory mix incorrectly controls the visible Pressure');

runtime.settleSourceSensory();
assert.equal(runtime.sourceSensoryFrame().mix, 0,
  'lowering the page does not make the Scene Dock fully quiet');
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true,
  'settling the audio despawned the orthogonal Pressure body');

runtime.tick(SOURCE_TRANSFORM_SECONDS, player);
assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.LANDSCAPE);
assert.equal(runtime.sourceSensoryFrame().mix, 0);
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true,
  'Pressure cannot remain visible in the quiet Scene Dock');

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /onClose:\(\)=>\{[\s\S]{0,180}chunkSurfRuntime\?\.settleSourceSensory\?\.\(\)/,
  'the still page does not finish the fade on the frame that reveals the dock');
assert.match(main, /onClose:\(\)=>\{[\s\S]{0,240}sourceFaultTransitionStartedAt=performance\.now\(\)/,
  'the still-page close does not begin the authored Source fault transition');
assert.match(main, /presentationGain:sourcePlayerSensoryMix\(\)/,
  'the live HUSH graph bypasses the Source sensory envelope');

console.log('source sensory release specs passed');
