// THE THREAD, ON THE MACHINE: Source's objective moved off the corners and onto
// the DA-1000, the bells stopped being a counter, and the desktop windows decay
// away across the outskirts instead of being cut at the field's edge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_CHAPEL_OUTSKIRTS, SOURCE_HORIZON } from '../src/data/source-level.js';
import {
  SOURCE_TRACE_OBJECTIVE_IDS, sourceTraceNote, sourceTraceNudge, sourceTraceReadout, sourceTraceSignal,
} from '../src/game/source-trace.js';
import { createWindowChoreographyDirector } from '../src/platform/window-choreography.js';

// Every objective the runtime can hand back has words on the machine.
{
  const runtime = readFileSync(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
  const body = runtime.slice(runtime.indexOf('function sourceObjective()'), runtime.indexOf('function nearProtectedMoment()'));
  const ids = new Set([...body.matchAll(/id:\s*'([a-z-]+)'/g)].map((match) => match[1]));
  for (const id of ['return-paths', 'normal-exit']) ids.add(id);
  assert.ok(ids.size >= 12, 'could not read the objective ids out of the runtime');
  for (const id of ids) {
    assert.ok(SOURCE_TRACE_OBJECTIVE_IDS.includes(id), `objective ${id} has no note on the recorder`);
    assert.notEqual(sourceTraceNote({ id }), 'NO THREAD HERE.');
  }
  assert.equal(sourceTraceNote({ id: 'nonsense' }), 'NO THREAD HERE.');
  assert.match(sourceTraceNote({ id: 'horizon-walk', label: 'THE ROAD GOES ON', target: { x: 0, y: 0 } }), /ROAD AHEAD/);
  assert.match(sourceTraceNote({ id: 'horizon-walk', target: null }), /ROAD IS STILL UNDERFOOT/);
  assert.match(sourceTraceNote({ id: 'bell-field', label: 'FIND WHAT OPENS THE TOWER DOOR' }), /OPENS THE TOWER/);
  assert.match(sourceTraceNudge({ id: 'chapel-doors', label: 'FIND THE CHAPEL DOOR' }), /chapel door/);
  assert.match(sourceTraceNudge({ id: 'nonsense' }), /machine/);
}

// The signal needle: strongest when he faces it, gone behind him, and nothing
// at all where there is nothing to aim at.
{
  const objective = { id: 'chapel-doors', bearingEligible: true, target: { x: 0, y: -40 }, distance: 40, distanceMeters: 20 };
  const player = { x: 0, y: 0 };
  const ahead = sourceTraceSignal(objective, { player, facingYaw: 0 });
  const behind = sourceTraceSignal(objective, { player, facingYaw: Math.PI });
  const facingEast = sourceTraceSignal(objective, { player, facingYaw: Math.PI / 2 });
  const facingWest = sourceTraceSignal(objective, { player, facingYaw: -Math.PI / 2 });
  assert.equal(ahead.direction, 'AHEAD');
  assert.equal(behind.direction, 'BEHIND');
  assert.equal(facingEast.direction, 'LEFT', 'north is on the left when facing east');
  assert.equal(facingWest.direction, 'RIGHT');
  assert.ok(ahead.strength > .9 && behind.strength < .05 && facingEast.strength > behind.strength && facingEast.strength < ahead.strength);
  assert.ok(sourceTraceSignal({ ...objective, distanceMeters: 400 }, { player, facingYaw: 0 }).strength < ahead.strength, 'distance does not weaken the signal');
  const none = sourceTraceSignal({ id: 'white-walk', bearingEligible: false, target: null }, { player, facingYaw: 0 });
  assert.equal(none.available, false);
  assert.equal(none.label, 'NO SIGNAL');
  assert.equal(sourceTraceSignal({ ...objective, bearingEligible: false }, { player }).label, 'NO SIGNAL', 'a locked door is aimed at');
}

// The counter, the location indicator and the marks, per stretch.
{
  const tape = SOURCE_HORIZON.tapeSeconds;
  const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const preTape = sourceTraceReadout({ id: 'horizon-walk', label: 'WALK TO THE PICTURE ON THE HORIZON', target: { x: 0, y: -10 }, bearingEligible: true, horizonProgress: 0 }, { player: { x: 0, y: 0 } });
  assert.equal(preTape.face.counter, '--:--', 'short of the tape the machine claims a tape position');
  assert.equal(preTape.face.meterLabel, 'SIGNAL · AHEAD');
  const onTape = sourceTraceReadout({ id: 'horizon-walk', label: 'STAY WITH THE PICTURE', target: null, horizonProgress: .5 }, { player: { x: 0, y: 0 } });
  assert.equal(onTape.face.counter, clock(tape / 2), 'on the tape the counter is not the position in the piece');
  assert.equal(onTape.progress, .5);
  assert.equal(onTape.face.meterLabel, 'NO SIGNAL');
  const chapel = (distance) => sourceTraceReadout({ id: 'chapel-doors', label: 'FIND THE CHAPEL DOOR', target: { x: 0, y: -distance }, bearingEligible: true, distance }, { player: { x: 0, y: 0 } });
  const span = SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorAt;
  assert.equal(chapel(span).progress, 0);
  assert.ok(chapel(span / 4).progress > .7);
  assert.equal(chapel(10).face.counter, clock(tape), 'past the tape the counter is not at its end');
  assert.ok(chapel(10).face.locationMarks.length >= 1, 'the door row is not marked on the indicator');
  const bells = sourceTraceReadout({ id: 'bell-field', label: 'WALK BETWEEN THE BELLS — KEEP THEM QUIET', horizonProgress: .3 }, { player: { x: 0, y: 0 } });
  assert.equal(bells.progress, .3);
  assert.ok(bells.face.locationMarks.every((mark) => mark.at >= 0 && mark.at <= 1));
  assert.ok(!/HEARD|\d+\s*\/\s*\d+/.test(JSON.stringify(bells.face)), 'the machine counts bells');
  assert.equal(bells.face.lamp.text, '◆ TRACE');
}

// The corners are empty, the machine carries the thread, and R reaches it.
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const hud = main.slice(main.indexOf('function drawSourceHud('), main.indexOf('\n}\n', main.indexOf('function drawSourceHud(')));
  assert.ok(hud.length > 100, 'drawSourceHud is not where it is expected');
  for (const gone of ['PRIMARY TRACE', 'SIGNAL  ', 'TAPE  ', 'HEARD', 'HUSH WAITS', 'KNOWN RELATION', 'HUSH / MOVE', 'objective.label']) {
    assert.ok(!hud.includes(gone), `the Source HUD still draws ${gone}`);
  }
  assert.match(hud, /BINDINGS\.inputPrompt\('interact'\)/, 'the interaction prompt went with the corners');
  const machine = main.slice(main.indexOf('function recorderMachineState('), main.indexOf('function recorderTapeRows('));
  assert.match(machine, /sourceTraceReadout\(/, 'the recorder does not read the thread in Source');
  assert.match(main, /if\(usingSourceSpace\(\)\)\{\s*\/\/ Source is navigated, not sampled[\s\S]*?openRecorder\(\);\s*return;\s*\}/, 'R does not raise the machine in Source');
  assert.match(main, /sourceTraceNudge\(/, 'standing still says nothing');
  const bells = main.slice(main.indexOf('if(chunkSurfRuntime.bellsFrame?.().active){'), main.indexOf('if(frame?.reset||frame?.contacts?.length)'));
  assert.match(bells, /noiseLimit/, 'the bells do not grow louder in the body as they are heard');
  const view = readFileSync(new URL('../src/render/recorder-view.js', import.meta.url), 'utf8');
  assert.match(view, /trace: 'TRACE'/);
  const scene = readFileSync(new URL('../src/game/recorder-scene.js', import.meta.url), 'utf8');
  assert.match(scene, /live\.trace \? TRANSPORT\.TRACE/, 'the machine never shows its trace transport');
}

// The windows decay across the outskirts and are gone by the tape.
{
  const shown = [], triggered = [], hidden = [];
  const director = createWindowChoreographyDirector({
    runtimeApi: { invoke: async () => true }, documentApi: null,
    effects: {
      active: () => true, sessionToken: () => 'decay-session',
      showComposition: async (plan) => { shown.push(plan); return true; },
      triggerComposition: async (plan, event) => { triggered.push(event); return true; },
      hideComposition: async () => { hidden.push(true); return true; }, hidePanes: async () => true,
    },
  });
  assert.equal(await director.sourceDecay(0), false, 'the windows start decaying before the field ends');
  await director.sourceDecay(.05);
  assert.equal(shown.at(-1)?.compositionId, 'source:decay', 'no decaying windows at the field\'s edge');
  assert.equal(shown.at(-1).surfaces.length, 4);
  assert.equal(director.debug().decay.stage, 0);
  await director.sourceDecay(.5);
  assert.equal(director.debug().decay.stage, 2, 'crossing two thresholds did not advance two stages');
  await director.sourceDecay(.3);
  assert.equal(director.debug().decay.stage, 2, 'walking back undid the decay');
  await director.sourceDecay(.95);
  assert.equal(director.debug().decay.stage, 4);
  assert.deepEqual(triggered, ['source-decay-1', 'source-decay-2', 'source-decay-3', 'source-decay-4']);
  const plan = shown.at(-1);
  const stages = plan.score.cues.filter((cue) => /^source-decay-/.test(cue.event || ''));
  assert.equal(new Set(stages.map((cue) => cue.event)).size, 4);
  const hides = stages.flatMap((cue) => cue.operations.filter((op) => op.type === 'hide').flatMap((op) => op.targets));
  assert.deepEqual([...new Set(hides)].sort(), plan.surfaces.map((surface) => surface.id).sort(), 'the last stage leaves a window up');
  await director.sourceDecay(1);
  assert.equal(director.debug().decay.stage, 0, 'the decay is not over at the tape');
  assert.equal(director.debug().composition, null, 'a window is still up on the tape');
  assert.equal(shown.filter((entry) => entry.compositionId === 'source:decay').length, 1, 'the decay reopened');
  await director.sourceDecay(.5);
  assert.equal(shown.filter((entry) => entry.compositionId === 'source:decay').length, 1, 'walking back off the tape reopens the windows');
  await director.leaveSource('source-runtime-exit');
}

console.log('source trace specs passed');
