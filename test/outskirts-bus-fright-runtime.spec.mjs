// CPU runtime/perception fixtures. Only the first test walks every segment;
// direct poses in later tests deliberately represent missed render samples,
// restored/replayed frames and boundary states, not earned progression.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { OUTSKIRTS_BUS_PASSAGE as BUS } from '../src/data/outskirts-bus-passage.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { packShadowFrames, unpackShadowFrames } from '../src/causal/tape.js';

function fixture(experience) {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
  if (experience) built.state.outskirtsExperience = experience;
  const f = { runtime: createSourceSpaceRuntime({ initialState: built.state }), position: built.position, events: [], time: 0 };
  f.runtime.setPlayerPosition(f.position);
  f.bus = f.runtime.outskirtsPiece('r7-bus');
  f.at = (x, z) => ({ x: (f.bus.x + x * Math.cos(f.bus.yaw) + z * Math.sin(f.bus.yaw)) / CELL - .5,
    y: (f.bus.z - x * Math.sin(f.bus.yaw) + z * Math.cos(f.bus.yaw)) / CELL - .5, facing: 0 });
  f.local = () => {const dx=(f.position.x+.5)*CELL-f.bus.x,dz=(f.position.y+.5)*CELL-f.bus.z;return{x:dx*Math.cos(f.bus.yaw)-dz*Math.sin(f.bus.yaw),z:dx*Math.sin(f.bus.yaw)+dz*Math.cos(f.bus.yaw)};};
  f.move = (dx,dz) => {const at=f.local();return f.step(at.x+dx,at.z+dz);};
  f.transit = () => f.runtime.state().outskirtsExperience.busTransit;
  f.clock = () => f.runtime.state().outskirtsExperience.clock;
  f.tick = (dt = .25, suspended = false) => {
    f.time += dt;
    f.runtime.tickOutskirtsCharacters(dt, { suspended, viewYaw: 0 });
    const frame = f.runtime.outskirtsStreetFrame({ time: f.time, viewYaw: 0 });
    f.events.push(...frame.events); return frame;
  };
  f.pose = (x, z, dt = .25) => {
    f.position = f.at(x, z); f.runtime.setPlayerPosition(f.position); f.tick(dt);
  };
  f.step = (x, z) => {
    const next = f.at(x, z), from = f.position;
    assert.ok(Math.abs(next.x - from.x) <= 1.000001 && Math.abs(next.y - from.y) <= 1.000001, 'not a half-metre step');
    const result = f.runtime.geometry.canStep(from.x, from.y, next.x, next.y);
    assert.ok(result.ok, `bus fright changed physical passage at ${x},${z}: ${result.why}`);
    const actual={...(result.redirect||next)};f.runtime.setPlayerPosition(actual);const event=f.runtime.onStep(from,actual);f.position=actual;f.tick();return{move:result,event};
  };
  f.body = () => f.runtime.propInstances(f.position.x, f.position.y, { time: f.time, viewYaw: 0 }).find(p => p.id === 'r7-bus-woman');
  f.paper = () => f.runtime.propInstances(f.position.x, f.position.y, { time: f.time, viewYaw: 0 }).filter(p => p.id === 'r7-bus-woman:return-half');
  f.reload = () => {
    const before = JSON.parse(JSON.stringify(f.transit()));
    f.runtime = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(f.runtime.state())) });
    f.runtime.setPlayerPosition(f.position); f.tick(0);
    assert.deepEqual(f.transit(), before, 'reload alters the retained fright or its clock');
  };
  return f;
}
const count = (f, cue) => f.events.filter(e => e.id === `outskirts-bus:woman-${cue === 'look' ? 'notice' : cue}`).length;

test('ordinary half-metre walking notices her before passing, permits local retreat and discovers the literal body route', () => {
  const f = fixture(); f.pose(-2, -3); for (let i = 0; i < 4; i++) f.tick();
  for (const x of [-1.5, -1, -.5, 0]) f.step(x, -3);
  for (const z of [-2.5, -2, -1.5]) f.step(0, z);
  assert.equal(f.transit().noticeAt, null, 'the reveal spends itself at the entrance');
  f.step(0, -1);
  assert.ok(Number.isFinite(f.transit().noticeAt)); assert.equal(f.transit().passAt, null);
  for (const z of [-.5, 0, .5, 1, 1.5, 2, 2.5]) f.step(0, z);
  f.step(.5, 2.5); f.step(.5, 3);
  assert.equal(f.transit().passAt, null, 'the passing event happens before its shoulder plane');
  f.step(.5, 3.5);
  const noticed = f.transit().noticeAt, passed = f.transit().passAt;
  assert.ok(passed > noticed, 'notice and passing collapse into the same ordinary walking beat');
  f.step(.5, 3); f.step(.5, 2.5); f.step(.5, 3); f.step(.5, 3.5);
  assert.equal(f.transit().passAt, passed, 'retreat rearms the impossible turn');
  f.step(.5,4);const contacted=f.move(.5,0);assert.ok(f.local().x<1.2,'a closed rear leaf lets the whole step outside');
  assert.equal(f.transit().exited,false);assert.equal(f.runtime.outskirtsPerformAction({action:'bus-exit-try',pass:7}).changed,true);
  for(let i=0;i<7;i++)f.tick();assert.equal(f.runtime.outskirtsBusPassageFrame().exitAngle,0);
  f.move(-.5,0);for(let i=0;i<3;i++)f.move(0,-.5);
  assert.equal(f.runtime.outskirtsPerformAction({action:'bus-woman-open',pass:7}).changed,true);
  assert.equal(f.transit().exited,false,'the second E teleports past the required body passage');
  for(let i=0;i<12;i++)f.tick();f.move(-.5,0);
  let crossing;for(let i=0;i<4;i++)crossing=f.move(0,.5);
  assert.equal(crossing.move.via,'bus-body-enter');assert.equal(f.runtime.busInteriorFrame().active,true);
  assert.equal(f.transit().exited,false,'the 72m interior has already been skipped');
  assert.equal(count(f, 'look'), 1); assert.equal(count(f, 'pass'), 1);
  assert.equal(f.runtime.outskirtsCharacterFrame().woman.stepAt, null, 'fright starts an unmodelled root approach');
});

test('missed approach samples catch up at the woman while far-side fixtures cannot bypass the stuck-door/body sequence', () => {
  const f=fixture();f.pose(0,-2.5);assert.equal(f.transit().entered,true);assert.equal(f.transit().noticeAt,null);
  f.pose(2,4);assert.equal(f.transit().noticeAt,null);assert.equal(f.transit().passAt,null);assert.equal(f.transit().exited,false,'a developer far-side pose falsely completes the literal route');
  f.pose(.5,3.5);assert.ok(Number.isFinite(f.transit().noticeAt)&&Number.isFinite(f.transit().passAt));assert.ok(f.transit().noticeAt<=f.transit().passAt);
  for(let i=0;i<8;i++)f.tick();f.pose(.5,3);f.pose(.5,3.5);assert.equal(count(f,'look'),1);assert.equal(count(f,'pass'),1);
  const outside=fixture();outside.pose(2,4);assert.equal(outside.transit().entered,false);assert.equal(outside.transit().noticeAt,null);assert.equal(outside.transit().passAt,null);
  assert.equal(outside.runtime.outskirtsPerformAction({action:'bus-woman-open',pass:7}).handled,false);
  assert.equal(count(outside,'look')+count(outside,'pass'),0);
});

test('gaze advances on retained simulation time, follows our side of the aisle and survives notice/pass reloads', () => {
  const f = fixture(); f.pose(0, -1);
  for (let i = 0; i < 8; i++) f.tick();
  f.reload();
  const before = f.transit().gazeYaw;
  f.pose(.5, 3.5, 0);
  assert.equal(f.transit().gazeYaw, before, 'a second render sample advances gaze without time');
  const target = Math.max(-2.75, Math.min(1.1, Math.atan2(-(.5 - BUS.woman.x), -(3.5 - BUS.woman.z)) - BUS.woman.yaw));
  let previous = Math.abs(target - f.transit().gazeYaw);
  for (let i = 0; i < 8; i++) {
    f.tick(); const current = f.transit().gazeYaw;
    assert.ok(current >= -2.75 && current <= 1.1);
    assert.ok(Math.abs(target - current) <= previous + .000001, 'gaze moves away from the passing player');
    previous = Math.abs(target - current);
  }
  assert.ok(previous < .02, 'the head target cannot catch the passing side of the aisle');
  const clock = f.clock(), gaze = f.transit().gazeYaw;
  f.tick(30, true); assert.equal(f.clock(), clock); assert.equal(f.transit().gazeYaw, gaze);
  f.reload(); assert.equal(count(f, 'look'), 1); assert.equal(count(f, 'pass'), 1);
});

test('recorded notice/gaze remains presentation authority when the replay observer stands beyond the rear door', () => {
  const f = fixture(); f.pose(0, -1); for (let i = 0; i < 4; i++) f.tick();
  const recorded = f.runtime.outskirtsCharacterFrame();
  assert.equal(recorded.busTransit.passAt, null);
  const packed = packShadowFrames([{ t: 0, x: 0, y: 0, spaceId: 'source-space', outskirtsCharacters: recorded },
    { t: 1000, x: 0, y: 0, spaceId: 'source-space', outskirtsCharacters: { ...recorded, clock: recorded.clock + 1 } }]);
  const replay = unpackShadowFrames(packed)[0].outskirtsCharacters;
  assert.deepEqual(replay.busTransit, recorded.busTransit, 'tape packing loses the retained fright evidence');
  const observer = fixture(); observer.pose(2, 4); observer.events.length = 0;
  assert.equal(observer.runtime.applyOutskirtsCharacterFrame(replay), true);
  const body = observer.body(); assert.ok(body);
  observer.tick(.25, true);
  assert.deepEqual(observer.runtime.outskirtsCharacterFrame().busTransit, replay.busTransit,
    'the replay observer spends a new passing event or overwrites the captured gaze');
  assert.equal(count(observer, 'look') + count(observer, 'pass'), 0);
});

test('passing fright preserves the real receive/store/retrieve boundaries and the single paper', () => {
  const f = fixture(); f.pose(.5, 2.8);
  f.runtime.setOutskirtsWorldState({ ticketAsked: true, ticketFound: true, ticketReturned: false });
  assert.equal(f.runtime.outskirtsPerformAction({ action: 'ticket', pass: 7 }).handled, true);
  f.runtime.setOutskirtsWorldState({ ticketReturned: true });
  const receipt = f.runtime.outskirtsCharacterFrame().woman.receivedAt;
  f.pose(.5, 3.5, 0); assert.ok(Number.isFinite(f.transit().passAt));
  for (const [elapsed, paper, clip] of [[.89, 0, 'bus_woman_receive'], [.91, 1, 'bus_woman_receive'],
    [2.94, 1, 'bus_woman_receive'], [2.96, 0, 'bus_woman_receive'], [9.89, 0, 'bus_woman_ready'], [9.91, 1, 'bus_woman_ready'], [11.1, 1]]) {
    while (f.clock() < receipt + elapsed - .000001) f.tick(Math.min(.05, receipt + elapsed - f.clock()));
    assert.equal(f.paper().length, paper, `paper boundary at${elapsed}s`);
    if (clip) assert.equal(f.body().character.clip, clip, `passing overrides the useful hand at${elapsed}s`);
  }
  assert.equal(count(f, 'look'), 1); assert.equal(count(f, 'pass'), 1);
});

test('completed legacy encounters cannot replay the new fright while backtracking', () => {
  for (const saved of [{ busStage: 3 }, { busStage: 4, busTransit: { version: 1, doorOpened: true,
    entered: true, close: true, exited: true, doorAt: 0, enteredAt: 0, closeAt: 1, exitedAt: 2 } }]) {
    const f = fixture(saved); f.pose(.5, 3.5); f.pose(2, 4);
    assert.equal(f.transit().exited, true);
    assert.equal(count(f, 'look') + count(f, 'pass'), 0, 'a completed old bus becomes a second new scare');
  }
});
