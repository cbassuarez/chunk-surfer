import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutskirtsExperience, normalizeOutskirtsCharacterFrame } from '../src/game/outskirts-experience.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildPreTapeGodPreset, PRE_TAPE_GOD_STOPS } from '../src/game/chunk-surf-god.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { OUTSKIRT_FOLD_ENCOUNTER, OUTSKIRT_LAST_MARK, OUTSKIRT_STRETCH_START, OUTSKIRT_STRETCH_METRES, outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-5, `${message}: ${a} vs ${b}`);
function advance(experience, seconds, inputs = {}) {
  let left = seconds;
  while (left > 1e-8) { const dt = Math.min(.05, left); experience.tickCharacters(dt, inputs); left -= dt; }
}
const foldInputs = { pass: 6, along: 225, across: -5.5, yaw: -Math.PI / 2, foldNear: true, foldPosition: { x: -6.8, z: -225 }, seed: 4417 };

test('the seated guard faces the road on a contact-aligned chair and leaves the pavement passage clear', () => {
  const layout = outskirtsArrivalLayout(), guard = layout.find(p => p.id === 'r6-booth-guard');
  const lodge = layout.find(p=>p.id==='r6-booth');
  const chair = layout.find(p => p.id === 'r6-booth-fold-chair'), ledge = layout.find(p => p.id === 'r6-booth-fold-sideledge');
  assert.equal(guard.mesh, 'outskirts_fold_guard');
  assert.equal(guard.inspect, 'fold-guard', 'seated encounter retains the standing lodge description');
  assert.equal(layout.find(p => p.id === 'r2-booth-guard').inspect, 'guard', 'the earlier guard lost its original description');
  const [rootX,rootY,rootZ]=OUTSKIRT_FOLD_ENCOUNTER.root;
  near(guard.across,lodge.across+rootX*Math.cos(lodge.yaw)+rootZ*Math.sin(lodge.yaw),'chair floor root');
  near(guard.y,lodge.y+rootY,'pavement height');
  near(guard.along,lodge.along+rootX*Math.sin(lodge.yaw)-rootZ*Math.cos(lodge.yaw),'counter alignment');
  near(guard.yaw,lodge.yaw+OUTSKIRT_FOLD_ENCOUNTER.yaw,'seated face retains its relation to the canonical counter');
  assert.equal(chair.mesh, OUTSKIRT_FOLD_ENCOUNTER.chairMesh); assert.equal(ledge.mesh, OUTSKIRT_FOLD_ENCOUNTER.ledgeMesh);
  for (const support of [chair, ledge]) for (const key of ['across', 'along', 'y', 'yaw']) near(support[key], guard[key], `${support.id} shares ${key}`);
  const world = ([x, y, z]) => ({ across: guard.across + x * Math.cos(guard.yaw) + z * Math.sin(guard.yaw),
    y: guard.y + y, along: guard.along + x * Math.sin(guard.yaw) - z * Math.cos(guard.yaw) });
  const seat = world(OUTSKIRT_FOLD_ENCOUNTER.assetSeat), palm = world(OUTSKIRT_FOLD_ENCOUNTER.assetPalm);
  near(seat.y, .59, 'actual chair seat height over the forecourt'); near(palm.y, .94, 'seated palm uses the lower ledge');
  near(Math.hypot(palm.across-guard.across,palm.along-guard.along),Math.hypot(...[OUTSKIRT_FOLD_ENCOUNTER.assetPalm[0],OUTSKIRT_FOLD_ENCOUNTER.assetPalm[2]]),'palm keeps its actual lower lateral ledge contact');
  for (const sole of OUTSKIRT_FOLD_ENCOUNTER.assetSoles) { const at = world(sole); near(at.y, .121, 'sole support');near(-(at.across-guard.across)*Math.sin(guard.yaw)+(at.along-guard.along)*Math.cos(guard.yaw),-sole[2],'feet in front of the seat'); }
  assert.ok(-3.78-(guard.across+.78)>=1.70,'paving apron leaves at least1.70m physical passage');
  assert.equal(guard.unwatched, undefined, 'the active guard must not vanish on a look-away');
  assert.equal(layout.find(p => p.id === 'r2-booth-guard').unwatched, 'vanish');
  assert.deepEqual(OUTSKIRT_FOLD_ENCOUNTER.assetPalm, [-.55, .82, -.14]);
  const pieces = layout.filter(p => p.stretch === 6);
  for (const x of [-5.3, -5.0, -4.2]) {
    const blocked = pieces.filter(p => {
      const dx = x - p.across, dz = -(guard.along - p.along), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      return outskirtsPointBlocked(outskirtsCollisionBoxes(p, PROP_BOUNDS[p.mesh]), dx * c - dz * s, dx * s + dz * c);
    });
    assert.deepEqual(blocked.map(p => p.id), [], `approach/passage at across ${x} is obstructed`);
  }
});

test('the frontal review approach starts the seated fold with one unobstructed ordinary step', () => {
  const stop = PRE_TAPE_GOD_STOPS.find(p => p.id === 'pre-tape-fold-approach');
  const built = buildPreTapeGodPreset(stop.depth, { seed: 4417, marbleEyes: 'returned' });
  const position = { ...built.position, x: built.position.x + stop.across / CELL };
  const runtime = createSourceSpaceRuntime({ initialState: built.state }); runtime.setPlayerPosition(position);
  const guard = outskirtsArrivalLayout().find(p => p.id === 'r6-booth-guard');
  const approachAlong=runtime.outskirtsLastLight().along;
  near(approachAlong,guard.along+Math.cos(guard.yaw)*(OUTSKIRT_FOLD_ENCOUNTER.reach+.2)-.005,'frontal eye alignment');
  near(Math.cos(stop.yaw-(Math.PI-guard.yaw)),1,'look toward the actual seated face');
  runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw });
  assert.equal(runtime.outskirtsCharacterFrame().fold.phase, 'armed', 'review starts before the force');
  const stepped = { ...position,x:position.x+Math.round(Math.sin(stop.yaw)),y:position.y-Math.round(Math.cos(stop.yaw)) };
  assert.equal(runtime.geometry.canStep(position.x, position.y, stepped.x, stepped.y).ok, true, 'chair or feet obstruct the trigger approach');
  runtime.setPlayerPosition(stepped); runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw });
  assert.equal(runtime.outskirtsCharacterFrame().fold.phase, 'force');
  assert.equal(runtime.outskirtsCharacterFrame().fold.elapsed, 0, 'approach skips the normal seated opening pose');
  const hero = runtime.propInstances(stepped.x, stepped.y, { viewYaw: stop.yaw, time: 99 }).find(p => p.id === guard.id);
  assert.deepEqual(hero.character.contacts.seat, OUTSKIRT_FOLD_ENCOUNTER.assetSeat);
  assert.deepEqual(hero.character.contacts.soles, OUTSKIRT_FOLD_ENCOUNTER.assetSoles);
  assert.deepEqual(hero.character.contacts.palm, OUTSKIRT_FOLD_ENCOUNTER.assetPalm);
  for (let i = 0; i < 51; i++) runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw });
  assert.equal(runtime.outskirtsCharacterFrame().fold.elapsed, 2.55);
  assert.equal(runtime.outskirtsCharacterFrame().fold.phase, 'pain');
  const rear = createSourceSpaceRuntime({ initialState: built.state });
  // A real accessible point in the rear hemisphere, still inside the trigger's
  // distance, proves this is a frontal encounter rather than a radial tripwire.
  const rearAcross=guard.across-Math.cos(guard.yaw)+Math.sin(guard.yaw)*.25;
  const rearAlong=guard.along-Math.sin(guard.yaw)-Math.cos(guard.yaw)*.25;
  const behind={...position,x:built.position.x+rearAcross/CELL,y:position.y+(approachAlong-rearAlong)/CELL};
  rear.setPlayerPosition(behind);assert.equal(rear.geometry.canStep(behind.x,behind.y,behind.x,behind.y).ok,true,'rear inspection point is not physically accessible');
  rear.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw });
  assert.equal(rear.outskirtsCharacterFrame().fold.phase, 'armed', 'the fold starts behind the chair without a frontal approach');
});

test('simulation preserves the exact force window and continuing pain across serialization', () => {
  const e = createOutskirtsExperience();
  e.tickCharacters(.05, { ...foldInputs, foldNear: false });
  assert.equal(e.characterFrame().fold.phase, 'armed');
  e.tickCharacters(.05, foldInputs);
  assert.equal(e.characterFrame().fold.elapsed, 0);
  assert.equal(e.characterFrame().fold.seed, 4417);
  advance(e, 1.1, foldInputs);
  assert.equal(e.characterFrame().fold.elapsed, 1.1);
  assert.equal(e.characterFrame().fold.phase, 'force');
  advance(e, .725, foldInputs);
  const restored = createOutskirtsExperience(JSON.parse(JSON.stringify(e.snapshot())));
  assert.deepEqual(restored.characterFrame(), e.characterFrame());
  e.events();
  advance(e, .725, foldInputs); advance(restored, .725, foldInputs);
  assert.equal(e.characterFrame().fold.elapsed, 2.55);
  assert.equal(e.characterFrame().fold.phase, 'pain');
  assert.deepEqual(restored.characterFrame(), e.characterFrame());
  assert.deepEqual(restored.events().map(v => v.id), ['r6:fold-land'], 'reload repeats an onset cue');
  advance(restored, 38, foldInputs);
  assert.equal(restored.characterFrame().fold.phase, 'pain');
  const events = restored.events();
  assert.ok(events.some(v => v.cue === 'fold-effort'), 'continuing pain has no authored effort events');
  assert.equal(new Set(events.map(v => v.id)).size, events.length);
  assert.equal(restored.snapshot().fold.cues.length, 4, 'continuation grows the persistent cue ID list');
  const reloaded = createOutskirtsExperience(JSON.parse(JSON.stringify(restored.snapshot())));
  reloaded.tickCharacters(.05, foldInputs);
  assert.deepEqual(reloaded.events(), [], 'reload catches up already heard effort events');
  const paused = reloaded.characterFrame();
  reloaded.tickCharacters(.25, { ...foldInputs, suspended: true });
  assert.deepEqual(reloaded.characterFrame(), paused);
});

test('the bounded capture record is detached and read-only application emits no cues', () => {
  assert.equal(normalizeOutskirtsCharacterFrame(null), null);
  assert.equal(normalizeOutskirtsCharacterFrame({ version: 2 }), null);
  const e = createOutskirtsExperience(); e.tickCharacters(.1, foldInputs); advance(e, 8, foldInputs); e.events();
  const frame = e.characterFrame(); frame.fold.cues.push('caller-mutation'); frame.locomotion.pitch = 99;
  assert.ok(!e.characterFrame().fold.cues.includes('caller-mutation'));
  assert.notEqual(e.characterFrame().locomotion.pitch, 99);
  const history = e.snapshot().history;
  const frozen = e.characterFrame(); frozen.clock = 80; frozen.fold.elapsed = 45;
  assert.equal(e.applyCharacterFrame(frozen), true);
  assert.equal(e.characterFrame().clock, 80);
  assert.equal(e.characterFrame().fold.elapsed, 45);
  assert.deepEqual(e.events(), []); assert.deepEqual(e.snapshot().history, history);
  for (let i = 0; i < 10; i++) { e.echo(7, 0, 34.4, 6); e.characterFrame(); e.remember({ pass: 6, along: 225, across: -5.5, time: 9999 }); }
  assert.equal(e.characterFrame().clock, 80, 'a history/render read advances the character clock');
  const older = createOutskirtsExperience({ fold: { phase: 'pain', elapsed: 45, lastEffort: -1 }, observed: {} });
  older.tickCharacters(.05, foldInputs);
  assert.deepEqual(older.events(), [], 'an incomplete old checkpoint catches up already crossed effort markers');
  const malformed = createOutskirtsExperience({ fold: { phase: 'pain', elapsed: 3_600_000, lastEffort: -1 } });
  malformed.tickCharacters(.25, foldInputs);
  assert.ok(malformed.events().length <= 1, 'a malformed saved marker floods the event queue');
});

test('the recorded gait follows travelled distance, keeps a real stop, and resumes without phase loss', () => {
  const e = createOutskirtsExperience();
  e.tickCharacters(.1, { pass: 0, along: 6, across: -2, yaw: 0 });
  e.tickCharacters(.1, { pass: 0, along: 7.2, across: -2, yaw: .3, pitch: .2, floorOffset: .12 });
  near(e.characterFrame().locomotion.gaitTime, 1.1, 'one authored stride');
  advance(e, .5, { pass: 0, along: 7.2, across: -2, yaw: .8, pitch: .2, floorOffset: .12 });
  const stopped = e.characterFrame().locomotion;
  assert.equal(stopped.speed, 0); assert.equal(stopped.walkWeight, 0);
  assert.equal(stopped.leftContact, 1); assert.equal(stopped.rightContact, 1);
  near(stopped.gaitTime, 1.1, 'stationary gait phase');
  assert.ok(e.snapshot().history.some(p => p.body?.pitch === .2 && p.body?.floorOffset === .12));
  const resumed = createOutskirtsExperience(JSON.parse(JSON.stringify(e.snapshot())));
  resumed.tickCharacters(.1, { pass: 0, along: 7.8, across: -2, yaw: .8 });
  near(resumed.characterFrame().locomotion.gaitTime, 1.65, 'resumed half stride');
  assert.equal(resumed.characterFrame().locomotion.leftContact, 1); assert.equal(resumed.characterFrame().locomotion.rightContact, 1);
  resumed.tickCharacters(.1, { pass: 0, along: 8.1, across: -2, yaw: .8 });
  assert.equal(resumed.characterFrame().locomotion.leftContact, 1); assert.equal(resumed.characterFrame().locomotion.rightContact, 0);
  resumed.tickCharacters(.1, { pass: 0, along: 8.7, across: -2, yaw: .8 });
  assert.equal(resumed.characterFrame().locomotion.leftContact, 0); assert.equal(resumed.characterFrame().locomotion.rightContact, 1);
  const legacy = createOutskirtsExperience({ history: [{ pass: 0, along: 6, across: -2, clock: 0 }, { pass: 0, along: 8, across: -2, clock: 2 }] });
  assert.equal(legacy.echo(1, 1, 34.4, 6).body.clip, 'walk', 'old root recordings lose their deterministic body fallback');
});

test('ten minutes of standing and long repeated turns retain the preceding traversal within the history bound', () => {
  const e = createOutskirtsExperience();
  for (let i = 0; i < 345; i++) e.tickCharacters(.1, { pass: 0, along: 6 + i * .1, across: -2, yaw: .3 });
  e.tickCharacters(.1, { pass: 1, along: 40.4, across: 0, yaw: 0 });
  const began = e.snapshot().history.find(p => p.pass === 1).clock;
  advance(e, 600, { pass: 1, along: 40.4, across: 0, yaw: 0 });
  assert.ok(e.snapshot().history.filter(p => p.pass === 1).length < 12, 'a stationary pose consumes the path budget');
  for (let i = 0; i < 2500; i++) e.tickCharacters(.25, { pass: 1, along: 40.4, across: 0, yaw: i % 2 ? -.8 : .8 });
  const saved = e.snapshot();
  assert.ok(saved.history.length <= 1800);
  assert.ok(saved.history.some(p => p.pass === 0 && p.across === -2), 'a long stop evicts the preceding traversal');
  assert.equal(saved.history.find(p => p.pass === 1).clock, began, 'compaction changes the current pass start clock');
  assert.ok(createOutskirtsExperience(JSON.parse(JSON.stringify(saved))).echo(1, 0, 34.4, 6));
});

function runtimeAt(initialState) {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const commits = [], runtime = createSourceSpaceRuntime({ initialState: initialState || built.state, onState: (...v) => commits.push(v) });
  runtime.setPlayerPosition(built.position);
  const initialAlong = runtime.outskirtsLastLight().along;
  const put = (along, across) => { const p = { ...built.position, x: built.position.x + across / CELL, y: built.position.y - (along - initialAlong) / CELL }; runtime.setPlayerPosition(p); return p; };
  return { built, runtime, put, commits };
}

test('the earlier guard shares the real body, stands inside the lodge and keeps his back to the road', () => {
  const layout = outskirtsArrivalLayout(), guard = layout.find(p => p.id === 'r2-booth-guard');
  const lodge = layout.find(p => p.id === 'r2-booth'), ledger = layout.find(p => p.id === 'r2-booth-ledger');
  const at = (p, x, z) => ({ across: p.across + x * Math.cos(p.yaw) + z * Math.sin(p.yaw),
    along: p.along + x * Math.sin(p.yaw) - z * Math.cos(p.yaw) });
  const floor = at(lodge, -.73, .05), hatch = at(lodge, -.45, -1.8), inspect = at(guard, ...guard.interact);
  assert.equal(guard.mesh, OUTSKIRT_FOLD_ENCOUNTER.mesh);
  near(guard.across, floor.across, 'standing inside the window'); near(guard.along, floor.along, 'inside floor position');
  near(guard.y, .20, 'boots meet the actual canonical lodge floor');
  near(Math.cos(guard.yaw-lodge.yaw),-1,'the earlier man faces into the actual lodge');
  near(inspect.across, hatch.across, 'inspection remains on the accessible side of the counter');
  near(inspect.along, hatch.along, 'inspection retains the original hatch anchor');
  assert.equal(ledger.mesh, 'outskirts_lodge_ledger');
  assert.equal(ledger.inspect, undefined, 'counter dressing must not take the guard conversation');

  const h = runtimeAt(), position = h.put(hatch.along+.4,lodge.across);
  assert.equal(h.runtime.geometry.canStep(position.x,position.y,position.x,position.y).ok,true,'counter conversation requires a blocked standing point');
  const bearing=Math.atan2(guard.across-lodge.across,-(hatch.along+.4-guard.along));
  h.runtime.tickOutskirtsCharacters(.05, { viewYaw:bearing });
  const rendered = h.runtime.propInstances(position.x, position.y, { viewYaw:bearing,time:1e5 });
  const body = rendered.find(p => p.id === guard.id), shell = rendered.find(p => p.id === lodge.id);
  assert.deepEqual(body.character, { clip: 'idle', time: 0, loop: true }, 'the earlier man inherits seated/folding animation');
  near(body.matrix[13] - shell.matrix[13], .20, 'rendered body floor offset');
  near(-body.matrix[8],-Math.sin(guard.yaw),'rendered face points into the lodge');
  assert.equal(h.runtime.focusAt(position.x, position.y, 3)?.inspect, 'guard', 'the lodge obscures his conversation');
  const bookMargin={...position,x:position.x-1};
  assert.equal(h.runtime.geometry.canStep(position.x,position.y,bookMargin.x,bookMargin.y).ok,true,'the neighbouring book margin cannot be approached');
  h.runtime.setPlayerPosition(bookMargin);
  assert.equal(h.runtime.focusAt(bookMargin.x,bookMargin.y,3)?.inspect,'page-ledger','making the guard reachable hid the page on the counter');
  h.runtime.setPlayerPosition(position);
  assert.equal(h.runtime.outskirtsCharacterFrame().fold.phase, 'armed', 'ordinary guard activates Wrong Fold');
  h.runtime.propInstances(position.x, position.y, { viewYaw:bearing+Math.PI });
  assert.ok(!h.runtime.propInstances(position.x, position.y, { viewYaw:bearing }).some(p => p.id === guard.id), 'a genuine look-away must still remove the earlier guard');
});

test('production instances hold contacts, do not vanish, switch to writhe and checkpoint without per-frame saves', () => {
  const guard=outskirtsArrivalLayout().find(p=>p.id==='r6-booth-guard'),yaw=Math.PI-guard.yaw;
  const h = runtimeAt(),along=guard.along+Math.cos(guard.yaw)*1.35,across=guard.across-Math.sin(guard.yaw)*1.35,position=h.put(along,across);
  assert.equal(h.runtime.geometry.canStep(position.x,position.y,position.x,position.y).ok,true,'performance review point must be physically occupiable');
  h.runtime.tickOutskirtsCharacters(.05, { viewYaw:yaw });
  const hero = (yaw = 0) => h.runtime.propInstances(position.x, position.y, { viewYaw: yaw, time: 99999 }).find(p => p.id === 'r6-booth-guard');
  assert.equal(hero().character.time, 0);
  const contacts = hero().character.contacts;
  const tickTo = target => {
    while (h.runtime.outskirtsCharacterFrame().fold.elapsed < target - 1e-8) h.runtime.tickOutskirtsCharacters(Math.min(.05, target - h.runtime.outskirtsCharacterFrame().fold.elapsed), { viewYaw:yaw });
  };
  tickTo(1.1); near(hero().character.force, 0, 'force onset');
  tickTo(1.825); near(hero().character.force, .5, 'force midpoint');
  const mid = h.runtime.state(); const resumed = runtimeAt(JSON.parse(JSON.stringify(mid))); resumed.put(along,across);
  near(resumed.runtime.outskirtsCharacterFrame().fold.elapsed, 1.825, 'reload force time');
  tickTo(2.55); near(hero().character.force, 1, 'force endpoint');
  assert.ok(hero(Math.PI), 'looking away removes the folded character');
  assert.deepEqual(hero().character.contacts, contacts);
  tickTo(12.05); assert.equal(hero().character.clip, 'writhe'); near(hero().character.time, .05, 'continuation time');
  assert.equal(hero().character.loop, true);
  assert.ok(h.commits.length <= 10, `${h.commits.length} state commits spam the animation frames`);
  assert.equal(h.commits.filter(([, meta]) => meta.recordCausal).length, 1, 'pure character checkpoints duplicate full-history causal events');
  const before = h.runtime.outskirtsCharacterFrame();
  hero(0); hero(Math.PI); h.runtime.outskirtsStreetFrame({ time: 1e6, viewYaw: 0 });
  assert.deepEqual(h.runtime.outskirtsCharacterFrame(), before, 'render/audio extraction advances the simulation');
});

test('Overprint samples three recorded full-body times and converges/removes at Last Light', () => {
  const body = (clock, clip, walkWeight) => ({ pass: 0, along: 6 + clock, across: -2, yaw: .8, heading: .8, headYaw: .3, pitch: .2,
    gaitTime: .6, speed: walkWeight, clip, clipTime: clock, walkWeight, leftContact: 1, rightContact: 1, floorOffset: .12 });
  const h = runtimeAt();
  const saved = h.runtime.state(); saved.outskirtsExperience = { clock: 7, history: [
    { pass: 0, along: 6, across: -2, yaw: .8, clock: 0, body: body(0, 'walk', 1) },
    { pass: 0, along: 7, across: -2, yaw: .8, clock: 1, body: body(1, 'idle', 0) },
    { pass: 0, along: 7, across: -2, yaw: .8, clock: 3, body: body(3, 'idle', 0) },
    { pass: 0, along: 9, across: 0, yaw: 0, clock: 4, body: body(4, 'walk', 1) },
    { pass: 1, along: 40.4, across: 0, yaw: 0, clock: 5, body: body(5, 'idle', 0) },
  ] };
  const r = runtimeAt(saved), position = r.put(41.4, 0);
  const ghosts = () => r.runtime.propInstances(position.x, position.y, { viewYaw: Math.PI, time: 99 }).filter(p => p.id.startsWith('outskirts-double'));
  const three = ghosts(); assert.equal(three.length, 3);
  assert.equal(new Set(three.map(p => p.id)).size, 3);
  for (const p of three) {
    assert.equal(p.mesh, 'outskirts_overprint_body'); assert.equal(p.reflectionOnly, true); assert.equal(p.noShadow, true);
    near(p.matrix[12], (r.built.position.x + .5) * CELL - 2, 'recorded detour');
    assert.equal(p.character.contacts.left, 1); assert.equal(p.character.contacts.right, 1);
    assert.equal(p.character.clips[0].weight, 0, 'recorded stop is still walking');
  }
  near(three[2].character.recordedClock - three[0].character.recordedClock, .44, 'temporal separation');
  assert.ok(three.every(p => p.character.joints.head.rotation.some((v, i) => i < 3 && Math.abs(v) > .01)), 'recorded look is missing');
  const end = r.put(OUTSKIRT_LAST_MARK.along, OUTSKIRT_LAST_MARK.across);
  const converged = r.runtime.propInstances(end.x, end.y, {}).filter(p => p.id.startsWith('outskirts-double'));
  assert.equal(converged.length, 3); assert.deepEqual([...converged[0].matrix], [...converged[1].matrix]);
  assert.ok(converged.every(p => p.character.clip === 'idle' && p.character.time === 0));
  r.runtime.setLastLightHold(true);
  assert.ok(!r.runtime.propInstances(end.x, end.y, {}).some(p => p.id.startsWith('outskirts-double')));
  r.runtime.setLastLightHold(false); r.runtime.setLastLightOut(true);
  assert.ok(!r.runtime.propInstances(end.x, end.y, {}).some(p => p.id.startsWith('outskirts-double')));
});
