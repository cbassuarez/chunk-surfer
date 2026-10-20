// The figure in the get-in dream: it walks up his beam, and the light at the
// moment it reaches him decides between the drill and passing through. See
// game/dream-figure.js and beginDreamFigure in main.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CELL } from '../src/data/floorplan/legend.js';
import {
  DREAM_FIGURE, DREAM_FIGURE_PHASE, advanceDreamFigure, dreamFigureDone, dreamFigurePose, forwardFromYaw,
  freshDreamFigure, pickDreamFigureSpawn, yawFromHeading,
} from '../src/game/dream-figure.js';
import { trainingCombatBattle } from '../src/data/combat-definitions.js';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS_BY_EVENT } from '../src/progression/achievement-defs.js';
import { EVENT_TYPES, validateEvent } from '../src/progression/events.js';
import { EVENT_SCHEMA_VERSION } from '../src/progression/schema.js';

const player = { x: 40, y: 40 };
const start = (metres = 7) => freshDreamFigure({ at: { x: player.x, y: player.y - metres / CELL }, player });
function run(state, { light = () => false, move = () => player, dtMs = 16, limit = 60000 } = {}) {
  let t = 0, touchLight = null;
  while (!dreamFigureDone(state) && t < limit) {
    const before = state.phase;
    state = advanceDreamFigure(state, { player: move(t), lightOn: light(t), dtMs });
    if (before === DREAM_FIGURE_PHASE.WALKING && state.phase !== before) touchLight = state.lightAtTouch;
    t += dtMs;
  }
  return { state, t, touchLight };
}

// ── the decision ────────────────────────────────────────────────────────────
{
  const lit = run(start(), { light: () => true });
  assert.equal(lit.state.phase, DREAM_FIGURE_PHASE.TOUCHED, 'light on at the touch: the fight');
  assert.equal(lit.touchLight, true);
  assert.ok(lit.t > 4000 && lit.t < 8000, `long enough to see it and reach for the light (${lit.t}ms)`);

  const dark = run(start(), { light: () => false });
  assert.equal(dark.state.phase, DREAM_FIGURE_PHASE.SPARED, 'light off at the touch: through him and away');
  assert.ok(dark.state.y > player.y, 'it carries on out the back of him');
  assert.ok((dark.state.y - player.y) * CELL >= DREAM_FIGURE.passM - .05);

  // Only the moment of contact counts.
  const outLate = run(start(), { light: (t) => t < 3000 });
  assert.equal(outLate.state.phase, DREAM_FIGURE_PHASE.SPARED, 'on for most of the walk, out before it arrives: spared');
  const onLate = run(start(), { light: (t) => t > 3000 });
  assert.equal(onLate.state.phase, DREAM_FIGURE_PHASE.TOUCHED, 'dark for most of the walk, lit when it arrives: the fight');

  // Once it is through him, the light no longer matters.
  let passing = run(start(), { light: () => false, limit: 0 }).state;
  while (passing.phase === DREAM_FIGURE_PHASE.WALKING) passing = advanceDreamFigure(passing, { player, lightOn: false, dtMs: 16 });
  assert.equal(passing.phase, DREAM_FIGURE_PHASE.PASSING);
  const after = run(passing, { light: () => true });
  assert.equal(after.state.phase, DREAM_FIGURE_PHASE.SPARED, 'switching back on behind it changes nothing');
}

// ── it always arrives ───────────────────────────────────────────────────────
{
  // Walking straight away from it at a brisk 1.4 m/s.
  const away = (t) => ({ x: player.x, y: player.y + (1.4 * t / 1000) / CELL });
  const fled = run(start(), { light: () => true, move: away });
  assert.equal(fled.state.phase, DREAM_FIGURE_PHASE.TOUCHED, 'you cannot outrun it');
  assert.ok(fled.t <= DREAM_FIGURE.limitMs + 16, 'and the opening cannot be stranded by trying');
  // A hitch in the frame loop does not teleport it onto him.
  const hitch = advanceDreamFigure(start(), { player, lightOn: true, dtMs: 5000 });
  assert.equal(hitch.phase, DREAM_FIGURE_PHASE.WALKING);
  assert.ok(hitch.elapsedMs <= 100);
}

// ── paused means nothing moves and nothing is decided ──────────────────────
{
  const s = start(1);
  const frozen = advanceDreamFigure(s, { player, lightOn: true, dtMs: 16, paused: true });
  assert.equal(frozen, s);
  assert.equal(advanceDreamFigure(null, { player }), null);
}

// ── where it starts ─────────────────────────────────────────────────────────
{
  const yaw = .3, origin = { x: 20, y: 20 };
  const spawn = pickDreamFigureSpawn({ origin, yaw });
  const ahead = forwardFromYaw(yaw);
  assert.equal(spawn.throughWall, false);
  assert.ok(Math.abs((spawn.x - origin.x) * CELL - ahead.x * 7) < 1e-9 && Math.abs((spawn.y - origin.y) * CELL - ahead.y * 7) < 1e-9,
    'straight up the beam, seven metres out, when the floor is open');
  const offAxis = pickDreamFigureSpawn({ origin, yaw: 0, sight: (x) => x > origin.x + .5 });
  assert.ok(offAxis.x > origin.x, 'a blocked line is skipped for the nearest one he can see');
  const wall = pickDreamFigureSpawn({ origin, yaw: 0, open: () => false });
  assert.equal(wall.throughWall, true, 'facing a wall, it comes out of the wall');
  assert.ok(Math.abs((origin.y - wall.y) * CELL - DREAM_FIGURE.throughWallM) < 1e-9);
  assert.equal(pickDreamFigureSpawn({ origin, yaw: 0, floor: () => false }), null, 'no floor of his at all: no beat');
  assert.equal(pickDreamFigureSpawn({}), null);
}

// ── what is drawn ───────────────────────────────────────────────────────────
{
  const s = start();
  const pose = dreamFigurePose(s);
  assert.equal(pose.visible, true);
  assert.equal(pose.poseId, 'neutral');
  const facing = forwardFromYaw(pose.yaw);
  assert.ok(facing.y > .99, 'it faces him as it comes');
  assert.ok(Math.abs(yawFromHeading(forwardFromYaw(1.1)) - 1.1) < 1e-9);
  let near = s;
  while (!near.reaching) near = advanceDreamFigure(near, { player, lightOn: true, dtMs: 16 });
  assert.equal(dreamFigurePose(near).poseId, 'arm_out', 'the arm comes up for the last of it');
  assert.equal(dreamFigurePose({ phase: DREAM_FIGURE_PHASE.TOUCHED }).visible, false);
  assert.equal(dreamFigurePose({ phase: DREAM_FIGURE_PHASE.SPARED }).visible, false);
}

// ── the drill, when it is the figure he is fighting ────────────────────────
{
  const plain = trainingCombatBattle(), figure = trainingCombatBattle({ cause: 'dream-figure' });
  assert.equal(plain.enemy, 'THE THING NOT THERE YET', 'the plain drill is untouched');
  assert.equal(figure.id, 'training', 'same drill, same tutorial, same stats');
  assert.equal(figure.enemy, 'THE THING IN THE LIGHT');
  assert.equal(figure.combat.enemy, figure.enemy);
  assert.deepEqual(figure.combat.movements, plain.combat.movements, 'same bar, same lessons');
  assert.match(figure.intro[0].text, /beam/);
  for (const line of [...figure.intro, ...figure.win, ...figure.lose]) {
    assert.doesNotMatch(line.text, /\bh[eo]ld/i, 'banned words stay out of new copy');
  }
}

// ── the achievement ─────────────────────────────────────────────────────────
{
  const def = ACHIEVEMENT_BY_ID.ACH_LIGHT_OFF;
  assert.ok(def, 'the achievement exists');
  assert.equal(def.hidden, true, 'it is a secret, not an instruction');
  assert.deepEqual(def.events, [EVENT_TYPES.DREAM_RESOLVED]);
  assert.ok(ACHIEVEMENTS_BY_EVENT.get(EVENT_TYPES.DREAM_RESOLVED).includes(def));
  const event = (payload) => ({ schema: EVENT_SCHEMA_VERSION, id: 'r:000001', runId: 'r', seq: 1, at: 1, type: EVENT_TYPES.DREAM_RESOLVED, payload });
  assert.equal(validateEvent(event({ outcome: 'spared' })), true);
  assert.equal(validateEvent(event({ outcome: 'touched' })), true);
  assert.equal(validateEvent(event({ outcome: 'won' })), false);
  assert.equal(def.test({ event: event({ outcome: 'spared' }) }), true);
  assert.equal(def.test({ event: event({ outcome: 'touched' }) }), false);
}

// ── the wiring in main.js ───────────────────────────────────────────────────
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = (name) => {
    const at = main.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} exists`);
    return main.slice(at, main.indexOf('\n}\n', at));
  };
  assert.match(body('dreamRippleIntoDrill'), /!beginDreamFigure\(\)\)openTrainingBattle\(\)/,
    'the ripple hands to the figure and only falls back to the plain drill');
  const begin = body('beginDreamFigure');
  for (const gate of ['NO_THINK', 'combat.trained']) assert.ok(begin.includes(gate), `falls back on ${gate}`);
  assert.ok(!begin.includes('reduceDread'), 'Reduce Dread damps spikes, it does not remove the figure');
  for (const name of ['beginDreamFigure', 'tickDreamFigure', 'dreamFigureTouched', 'dreamFigureSpared']) {
    assert.doesNotMatch(body(name), /toggleLight|toggleTorchAction|killTorch/, `${name} never touches the torch: the tutorial does not put his light out`);
  }
  assert.match(body('dreamFigureTouched'), /openTrainingBattle\(\{cause:'dream-figure'\}\)/);
  assert.match(body('dreamFigureTouched'), /DREAM_RESOLVED,\{outcome:'touched'\}/);
  const spared = body('dreamFigureSpared');
  assert.match(spared, /flagSet\('combat\.trained'\)/, 'spared leaves the opening exactly as a finished drill would');
  assert.match(spared, /DREAM_RESOLVED,\{outcome:'spared'\}/);
  assert.match(spared, /finishSetupRehearsal\(\)/, 'and hands on to the case and the bearing');
  const instance = body('dreamFigurePropInstance');
  assert.doesNotMatch(instance, /apparitionVariant|portraitIndex|emissive/, 'lit by the torch like any prop, never self-lit');
  assert.match(body('openRecorder'), /if\(dreamFigure\) return false;/, 'the recorder is not in the dream');
  assert.match(body('tickDreamFigure'), /paused:paused\|\|.*scenes\.blocksWorld\(\)/, 'a menu or the pause screen stops the walk');
}

// ── the tutorial never puts his light out ───────────────────────────────────
{
  const REC = await import('../src/game/recordist.js');
  const light = () => REC.recState().light;
  REC.recState().phase = 'idle'; REC.recState().light = true;
  assert.equal(REC.startListening({ keepLight: true }), true);
  assert.equal(REC.startRecording({ keepLight: true }), true);
  assert.equal(light(), true, 'the level check rolls with the light still on');
  REC.recState().phase = 'idle'; REC.recState().light = true;
  REC.startListening(); assert.equal(light(), false, 'a real take still goes dark, as it always has');
  REC.recState().phase = 'idle';

  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/REC\.startListening\(\{keepLight:room===LEVEL_CHECK_ROOM\}\)/g) || []).length, 2, 'both ways into the level check keep the light');
  assert.match(main, /REC\.startRecording\(\{[^}]*keepLight:takeRoom===LEVEL_CHECK_ROOM\}\)/);

  const { tutorialInit, startTutorial, tickTutorial } = await import('../src/game/tutorial.js');
  const said = [];
  tutorialInit({ say: (line) => said.push(line.text) });
  startTutorial(); tickTutorial(0, { light: false });
  assert.deepEqual(said, ["It's dark in here."], 'the setup primes the light ON');
  tickTutorial(0, { light: true });
  assert.deepEqual(said, ["It's dark in here."], 'and says nothing about putting it out');
  said.length = 0; startTutorial(); tickTutorial(0, { light: true });
  assert.deepEqual(said, [], 'a man who walked in lit does not think it');

  const levelCheck = fs.readFileSync(new URL('../content/narrative/conservatory.level_check.story.json', import.meta.url), 'utf8');
  assert.doesNotMatch(levelCheck, /light off|kill the light|light out/i, 'the level check never tells him to put it out');
}

// ── the battery starts counting when he leaves the get-in ───────────────────
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = (name) => { const at = main.indexOf(`function ${name}(`); return main.slice(at, main.indexOf('\n}\n', at)); };
  assert.match(body('tickTorch'), /flagTest\('torch\.metered'\)&&REC\.drainLight\(dt\)/, 'no drain during the setup');
  const metering = body('tickTorchMetering');
  assert.match(metering, /!setupComplete\(\)\|\|atHomeThreshold\(px,py\)/, 'metering starts on the first walk out with setup done');
  assert.match(metering, /flagSet\('torch\.metered'\)/);
  const radio = body('maybeQueueRadioProgressionCue');
  assert.match(radio, /flagTest\('torch\.metered'\)&&context\.completedJobTakes===0[\s\S]*RADIO_CUES\.LIGHT/, 'Martin rings on the walk out');
  const { runtimeTree } = await import('../src/narrative/runtime-content.js');
  const call = JSON.stringify(runtimeTree('radio.light_checkin', { LIGHTKEY: '[F]' }));
  assert.match(call, /Keep it off as much as you can/);
  assert.match(call, /\[F\] puts the light out/, 'the call names the key');
  assert.doesNotMatch(call, /\bh[eo]ld/i);
}

console.log('dream-figure spec ok');
