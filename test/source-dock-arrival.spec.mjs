import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CHUNK_SURF_PHASE, freshChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { keyboardMotionAxes } from '../src/input/input-manager.js';
import { sourceShoreOutside } from '../src/game/source-sensory.js';

if (!globalThis.document) globalThis.document = { title: '', baseURI: 'http://localhost/' };
globalThis.document.baseURI ||= 'http://localhost/';
const scenes = await import('../src/game/scenes.js');
const { makeDocumentScene } = await import('../src/game/document.js');
const { makeSourceStillPageScene, SOURCE_STILL_ARRIVAL, SOURCE_STILL_DOCUMENT } = await import('../src/game/source-page-scene.js');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function mainFunction(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = main.indexOf('\nfunction ', start + 10);
  return main.slice(start, end < 0 ? main.length : end);
}
function haystackRuntime() {
  let state = freshChunkSurfState({ seed: 4417, returnPoint: { x: 0, y: 0, facing: 0 } });
  for (const event of [
    { type: 'SOURCE_ENTERED', returnPoint: state.returnPoint },
    { type: 'HALL_ADVANCED', distance: 112 },
    { type: 'HAYSTACK_REACHED', origin: { x: 0, y: -224 }, slot: 0 },
  ]) state = reduceChunkSurf(state, event);
  return createSourceSpaceRuntime({ initialState: state });
}

// Exercise the actual main.js callbacks with the live runtime. The sheet must
// be fully opaque before geometry changes, and the camera must stay untouched.
{
  scenes.clear();
  const game = haystackRuntime(), page = game.sourceObjective().target;
  const body = { x: page.x, y: page.y + 3, facing: 0 };
  const look = { yaw: .2317, pitch: -.284 };
  game.setPlayerPosition(body);
  const result = game.inspectFocused(body.x, body.y, body.facing);
  assert.equal(result.event, 'page-found');
  assert.equal(game.state().phase, CHUNK_SURF_PHASE.HAYSTACK, 'input swapped the room before the hand could cover it');
  const calls = [], saves = [];
  let sheet;
  const runtime = {
    ...game,
    commitStillPageReveal() { calls.push(['commit', sheet.view().arrival.coverage]); return game.commitStillPageReveal(); },
    settleSourceSensory() { calls.push(['settle', sheet.view().arrival.coverage]); return game.settleSourceSensory(); },
  };
  const context = vm.createContext({
    result, px: body.x, py: body.y, chunkSurfRuntime: runtime,
    R3: { r3dFacing: () => body.facing, r3dLookAngles: () => ({ ...look }), r3dSetIndoorRain() {} },
    sourceFearFloor: 1, sourceFaultTransitionStartedAt: 0,
    renderMove: {}, motionRig: {}, trail: [1], performance: { now: () => 1234 },
    shakeMode: () => 'full', endSourceHaystackMosh() {},
    CUES: { playPageTurn() {} }, makeSourceStillPageScene,
    scenes: { push(value) { sheet = scenes.push(value); } },
    syncSourceRender() {
      calls.push(['upload', sheet.view().arrival.coverage]);
      assert.ok(game.geometry.cellAt(body.x, body.y)?.sourceLanding, 'the prepared room was not ready for upload');
    },
    saveCommit(value) { saves.push(value); },
  });
  vm.runInContext(mainFunction('enterSourceLandscape'), context);
  const start = main.indexOf("if(result.event==='page-found')");
  const end = main.indexOf("if(result.event==='horizon')", start);
  vm.runInContext(`(()=>{${main.slice(start, end)}})()`, context);
  assert.equal(calls.length, 0, 'presenting the sheet committed the room immediately');
  sheet.update(SOURCE_STILL_ARRIVAL.raise - .001);
  assert.equal(calls.length, 0);
  sheet.update(.001);
  assert.deepEqual(calls, [['commit', 1], ['upload', 1]]);
  assert.equal(sheet.view().arrival.stage, 'covered');
  assert.equal(context.px, body.x); assert.equal(context.py, body.y);
  assert.deepEqual(look, { yaw: .2317, pitch: -.284 });
  assert.equal(saves[0].px, body.x); assert.equal(saves[0].py, body.y);
  sheet.update(SOURCE_STILL_ARRIVAL.cover);
  sheet.key({ key: 'Escape' });
  assert.equal(sheet.view().arrival.stage, 'lowering');
  assert.deepEqual(calls.slice(-2), [['settle', 1], ['upload', 1]], 'sensory release or room upload happened after uncovering began');
  assert.equal(game.state().phase, CHUNK_SURF_PHASE.LANDSCAPE, 'the old transform clock outlived the reveal');
  assert.equal(scenes.suppressesHud(), true);
  sheet.update(SOURCE_STILL_ARRIVAL.lower / 2);
  assert.equal(sheet.view().arrival.coverage, .5);
  assert.equal(scenes.blocksInput(), true, 'locomotion returned before the hand finished lowering');
  sheet.update(SOURCE_STILL_ARRIVAL.lower / 2);
  assert.equal(scenes.blocksInput(), false);
  assert.equal(scenes.suppressesHud(), false);
  assert.equal(saves.at(-1).px, body.x); assert.equal(saves.at(-1).py, body.y);
  assert.deepEqual(look, { yaw: .2317, pitch: -.284 });
  assert.doesNotMatch(mainFunction('enterSourceLandscape'), /r3dSetFacing|r3dSetLookAngles|r3dSetPitch|lookAtWorld/);
}

// An early close is queued; even a long frame cannot skip full cover. Reduced
// Motion uses the same commit/reveal ordering with a stationary, shorter fade.
for (const reducedMotion of [false, true]) {
  scenes.clear();
  const events = [];
  const sheet = scenes.push(makeSourceStillPageScene({
    reducedMotion,
    onCovered: () => events.push('covered'),
    onReveal: () => events.push('reveal'),
    onClose: () => events.push('closed'),
  }));
  sheet.key({ key: 'e' });
  sheet.update(20);
  assert.equal(sheet.view().arrival.stage, 'covered', 'a delayed frame skipped the opaque render opportunity');
  assert.deepEqual(events, ['covered']);
  sheet.update(SOURCE_STILL_ARRIVAL.cover);
  assert.equal(sheet.view().arrival.coverage, 1);
  assert.deepEqual(events, ['covered', 'reveal']);
  const lower = reducedMotion ? SOURCE_STILL_ARRIVAL.reduced : SOURCE_STILL_ARRIVAL.lower;
  sheet.key({ key: 'Escape' });
  sheet.update(lower - .001);
  assert.equal(scenes.has('source-still-page'), true);
  sheet.update(.001);
  assert.deepEqual(events, ['covered', 'reveal', 'closed']);
  sheet.update(10);
  assert.deepEqual(events, ['covered', 'reveal', 'closed'], 'completion callbacks replayed');
}

// Source owns only its sheet's close. An ordinary document still closes at once,
// while a second overlay can never be accidentally popped by the lowering hand.
{
  scenes.clear();
  let closed = 0;
  const ordinary = scenes.push(makeDocumentScene(SOURCE_STILL_DOCUMENT, { onSceneClose: () => { closed += 1; } }));
  ordinary.key({ key: 'Escape' });
  assert.equal(scenes.depth(), 0); assert.equal(closed, 1);
  const sheet = scenes.push(makeSourceStillPageScene());
  sheet.update(SOURCE_STILL_ARRIVAL.raise);
  sheet.update(SOURCE_STILL_ARRIVAL.cover);
  sheet.key({ key: 'Escape' });
  const overlay = scenes.push({ id: 'test-overlay' });
  sheet.update(SOURCE_STILL_ARRIVAL.lower);
  assert.equal(scenes.top(), overlay);
  assert.equal(scenes.has('source-still-page'), false);
  scenes.clear();
}

// A save made while the sheet is opaque resumes at its saved body coordinates.
// The landing checkpoint must not overwrite that position on reload.
{
  let checkpointReads = 0;
  const state = { active: true, phase: CHUNK_SURF_PHASE.TRANSFORMING, checkpointId: 'landing-arrival' };
  const saved = { x: 4.25, y: -239.75, facing: 2 };
  const runtime = {
    checkpointPosition() { checkpointReads += 1; return { x: 900, y: 900, facing: 0 }; },
    setPlayerPosition() {}, sourceSurfaceLines: () => [], sourceVoidFrame: () => ({}),
  };
  let facing;
  const context = vm.createContext({
    CHUNK_SURF_PHASE, CHAPEL_TOWER_PHASE: {}, sourceShoreOutside,
    stopOutskirtsStreetAudio() {}, resetOutskirtsLastLight() {},
    endSourceHaystackMosh() {}, endSourceBracketPresence() {}, sourceFearFloor: 0,
    normalizeChunkSurfState: (value) => ({ ...value }),
    reduceChunkSurf: (value) => ({ ...value, phase: CHUNK_SURF_PHASE.LANDSCAPE }),
    chapelTowerState: () => ({ phase: 'none' }), getSave: () => ({}),
    PRES: { isActive: () => false, despawn() {} }, createSourceSpaceRuntime: () => runtime,
    R3: { r3dSetIndoorRain() {}, r3dSetFacing(value) { facing = value; }, r3dFacing: () => facing, r3dSetSourceSurface() {} },
    sourcePresenceWasActive: false, sourceFinalCombatOpen: false, chunkSurfRuntime: null,
    px: 0, py: 0, renderMove: {}, motionRig: {}, trail: [],
    applyLensPreset() {}, syncSourceRender() {}, restoreFromSourceSpace() {}, windowChoreography: { sourceFrame() {} },
    CR: { fx: { hold() {} } }, saveCommit() {}, SOURCE_ENTRY: { facing: 0 },
  });
  vm.runInContext(mainFunction('activateSourceSpace'), context);
  context.activateSourceSpace(state, { position: saved, resume: true });
  assert.equal(context.px, saved.x); assert.equal(context.py, saved.y);
  assert.equal(facing, saved.facing); assert.equal(checkpointReads, 0);
}

// Door score follows observed mechanism phases, never the interaction request
// or repeated render calls. Loading an already open or closed door is silent.
{
  const context = vm.createContext({});
  vm.runInContext(mainFunction('sourceDockDoorSoundEvents'), context);
  const events = (previous, next) => Array.from(context.sourceDockDoorSoundEvents(previous, next));
  assert.deepEqual(events(null, { phase: 'open', motionId: 0 }), []);
  assert.deepEqual(events(null, { phase: 'closed', motionId: 0 }), []);
  assert.deepEqual(events({ phase: 'closed', motionId: 0 }, { phase: 'opening', motionId: 1 }), ['unlatch']);
  assert.deepEqual(events({ phase: 'opening', motionId: 1 }, { phase: 'opening', motionId: 1 }), []);
  assert.deepEqual(events({ phase: 'opening', motionId: 1 }, { phase: 'open', motionId: 1 }), ['stop']);
  assert.deepEqual(events({ phase: 'open', motionId: 1 }, { phase: 'closing', motionId: 2 }), []);
  assert.deepEqual(events({ phase: 'closing', motionId: 2 }, { phase: 'closed', motionId: 2 }), ['catch']);
  assert.deepEqual(events({ phase: 'closed', motionId: 2 }, { phase: 'closed', motionId: 2 }), []);
}

// Held W+D produces eight-way movement in the room. Run the actual input,
// collision-corner guard and held cadence together: a diagonal has the same
// metre speed, and a blocked half slides with ordinary cardinal timing.
{
  const stepStart = main.indexOf('function step(dx,dy)');
  const guardStart = main.indexOf('      if(dx&&dy){', stepStart);
  const guardEnd = main.indexOf('      const move=geometry.canStep(', guardStart);
  const guard = main.slice(guardStart, guardEnd);
  const makeWalk = ({ wall = 'none', sceneDock = true, forward = [0, -1] } = {}) => {
    let now = 1000;
    const context = vm.createContext({
      RENDERER: '3d', keysDown: new Set(['KeyW', 'KeyD']), keyboardMotionAxes,
      CONTROLLER: { controllerMotionAxes: () => ({ moveX: 0, moveY: 0 }) },
      clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
      R3: { r3dStepDelta: () => forward }, usingSourceSpace: () => true,
      chunkSurfRuntime: { sourceVoidFrame: () => ({ sceneDock }) }, sourceShoreOutside,
      currentMoveIntervalMs: () => 100, ensureMotionRig() {},
      physicalPointFor: (x, y) => ({ x, z: y }), px: 0, py: 0,
      renderMove: null, nextMoveAtMs: 0, lastMoveAtMs: 0, playerKeys: [],
      setupHandoffBlocksMovement: () => false, paused: false,
      scenes: { blocksInput: () => false }, inCover: () => false,
      maybeLockHushFromInputDelta() {}, performance: { now: () => now },
    });
    context.geometry = { canStep(x, y, toX, toY) {
      return { ok: wall !== 'both' && !(wall === 'x' && toX !== x) };
    } };
    for (const name of ['independentControls', 'combinedIndependentMotionAxes', 'arrowDelta',
      'currentStepIntervalMs', 'beginRenderStep', 'armHeldMovement', 'tickHeldMovement']) {
      vm.runInContext(mainFunction(name), context);
    }
    vm.runInContext(`function resolveDockStep(dx,dy){${guard}return[dx,dy];}`, context);
    context.step = (dx, dy) => {
      const resolved = context.resolveDockStep(dx, dy);
      if (!resolved) return;
      const [sx, sy] = resolved;
      context.beginRenderStep(context.px + sx, context.py + sy, now);
      context.px += sx; context.py += sy; context.lastMoveAtMs = now;
    };
    return { context, tick(time) { now = time; context.tickHeldMovement(time); } };
  };
  const walk = makeWalk();
  assert.deepEqual(Array.from(walk.context.arrowDelta()), [1, -1], 'held W+D still drops the strafe axis');
  walk.tick(1000);
  assert.equal(walk.context.px, 1); assert.equal(walk.context.py, -1);
  const diagonalDuration = 100 * Math.SQRT2;
  assert.equal(walk.context.renderMove.durationMs, diagonalDuration);
  assert.equal(walk.context.nextMoveAtMs, 1000 + diagonalDuration);
  walk.tick(1100);
  assert.equal(walk.context.px, 1, 'diagonal walking received a square-root-of-two speed bonus');
  walk.tick(1000 + diagonalDuration);
  assert.equal(walk.context.px, 2); assert.equal(walk.context.py, -2);
  const sliding = makeWalk({ wall: 'x' });
  sliding.tick(1000);
  assert.equal(sliding.context.px, 0); assert.equal(sliding.context.py, -1);
  assert.equal(sliding.context.renderMove.durationMs, 100);
  assert.equal(sliding.context.nextMoveAtMs, 1100, 'a cardinal wall slide inherited diagonal slowdown');
  const corner = makeWalk({ wall: 'both' });
  corner.tick(1000);
  assert.equal(corner.context.px, 0); assert.equal(corner.context.py, 0, 'diagonal input cut through a solid corner');
  const turned = makeWalk({ forward: [1, -1] });
  assert.deepEqual(Array.from(turned.context.arrowDelta()), [1, 0], 'combined head-relative axes exceeded one cell');
  const hall = makeWalk({ sceneDock: false });
  assert.deepEqual(Array.from(hall.context.arrowDelta()), [0, -1], 'room walking altered the hall input scheme');
  assert.equal(hall.context.currentStepIntervalMs(1, -1), 100);
}

console.log('source dock arrival specs passed');
