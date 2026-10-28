// Isolated production-runtime traversal, not a claim of an earned playthrough
// or first-person audiovisual acceptance. Every route segment uses canStep,
// the ordinary half-metre lattice and main's diagonal orthogonal guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { OUTSKIRTS_BUS_PASSAGE as BUS, busPassageFloorAt } from '../src/data/outskirts-bus-passage.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { BUS_BODY_CORRIDOR } from '../src/game/bus-body-corridor.js';

const EPSILON = 1e-6;
const near = (actual, expected, why) => assert.ok(Math.abs(actual - expected) < EPSILON, `${why}: ${actual} vs ${expected}`);

function fixture({ phase = 0, legacyStage } = {}) {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
  if (legacyStage != null) built.state.outskirtsExperience = { busStage: legacyStage };
  const f = { runtime: createSourceSpaceRuntime({ initialState: built.state }), events: [], visited: [], time: 0 };
  f.runtime.setPlayerPosition(built.position);
  f.bus = f.runtime.outskirtsPiece(`r${BUS.pass}-bus`);
  assert.ok(f.bus, 'production route has no mandatory passage bus');
  const c = Math.cos(f.bus.yaw), s = Math.sin(f.bus.yaw);
  f.at = (x, z) => ({ x: (f.bus.x + x * c + z * s) / CELL - .5,
    y: (f.bus.z - x * s + z * c) / CELL - .5, facing: 0 });
  f.local = p => {
    const dx = (p.x + .5) * CELL - f.bus.x, dz = (p.y + .5) * CELL - f.bus.z;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };
  f.base = { x: built.position.x + phase / CELL, y: built.position.y + phase / CELL };
  f.snap = (x, z) => {
    const desired = f.at(x, z);
    const anchor=f.position||f.base;
    return { x: anchor.x + Math.round(desired.x - anchor.x), y: anchor.y + Math.round(desired.y - anchor.y), facing: 0 };
  };
  f.position = f.snap(-3.5, 0);
  f.runtime.setPlayerPosition(f.position);
  f.frame = ({ dt = .25, suspended = false, time = f.time + dt, reducedMotion = false, viewYaw = 0 } = {}) => {
    f.time = time;
    f.runtime.tickOutskirtsCharacters(dt, { viewYaw, reducedMotion, suspended });
    const frame = f.runtime.outskirtsStreetFrame({ time, viewYaw, reducedMotion });
    f.events.push(...frame.events);
    return frame;
  };
  f.transit = () => f.runtime.state().outskirtsExperience.busTransit;
  f.leaves = () => f.runtime.propInstances(f.position.x, f.position.y, { time: f.time, viewYaw: 0 })
    .filter(p => p.mesh === BUS.entryMesh || p.mesh === BUS.exitMesh).sort((a, b) => a.mesh.localeCompare(b.mesh));
  f.step = next => {
    const before = f.position, dx = next.x - before.x, dy = next.y - before.y;
    assert.ok(Math.abs(dx) <= 1 + EPSILON && Math.abs(dy) <= 1 + EPSILON && (dx || dy), 'not an ordinary grid step');
    if (dx && dy) {
      assert.ok(f.runtime.geometry.canStep(before.x, before.y, next.x, before.y).ok, 'diagonal bypasses its horizontal guard');
      assert.ok(f.runtime.geometry.canStep(before.x, before.y, before.x, next.y).ok, 'diagonal bypasses its vertical guard');
    }
    const move = f.runtime.geometry.canStep(before.x, before.y, next.x, next.y);
    assert.ok(move.ok, `ordinary step failed ${JSON.stringify(f.local(before))} -> ${JSON.stringify(f.local(next))}: ${move.why}`);
    if(!move.redirect)assert.ok(Math.abs(f.runtime.geometry.floorAt(next.x, next.y) - f.runtime.geometry.floorAt(before.x, before.y)) <= .45 + EPSILON);
    f.position = { ...(move.redirect||next), facing: 0 }; f.runtime.setPlayerPosition(f.position);
    const result=f.runtime.onStep(before, f.position); f.visited.push({...f.local(f.position),space:f.runtime.busInteriorFrame()?.active?'body':'bus'}); f.frame();return{move,result};
  };
  f.walkTo = (x, z) => {
    const goal = f.snap(x, z), key = p => `${p.x},${p.y}`;
    const queue = [f.position], parents = new Map([[key(f.position), null]]), points = new Map([[key(f.position), f.position]]);
    for (let q = 0; q < queue.length && !parents.has(key(goal)); q++) {
      const p = queue[q];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = { x: p.x + dx, y: p.y + dy }, id = key(next), local = f.local(next);
        if (parents.has(id) || local.x < -4 || local.x > 4 || Math.abs(local.z) > 11.25) continue;
        if (dx && dy && (!f.runtime.geometry.canStep(p.x, p.y, next.x, p.y).ok
          || !f.runtime.geometry.canStep(p.x, p.y, p.x, next.y).ok)) continue;
        const move=f.runtime.geometry.canStep(p.x,p.y,next.x,next.y);
        if (!move.ok||move.redirect) continue;
        parents.set(id, key(p)); points.set(id, next); queue.push(next);
      }
    }
    assert.ok(parents.has(key(goal)), `no production-runtime route to bus local ${x},${z}`);
    const path = [];
    for (let id = key(goal); parents.get(id) != null; id = parents.get(id)) path.push(points.get(id));
    for (const next of path.reverse()) f.step(next);
  };
  f.reload = () => {
    const saved = JSON.parse(JSON.stringify(f.runtime.state())), transit = f.transit(), leaves = f.leaves();
    assert.equal(leaves.length,f.runtime.busInteriorFrame()?.active?0:2,'only the active space submits its actual geometry');
    f.runtime = createSourceSpaceRuntime({ initialState: saved }); f.runtime.setPlayerPosition(f.position);
    assert.deepEqual(f.transit(), transit, 'reload changes a retained transit milestone/clock');
    // A different wall clock cannot snap or replay the saved physical leaf.
    f.time += 10000;
    const after = f.leaves();
    for (let i = 0; i < leaves.length; i++) for (let j = 0; j < 16; j++) near(after[i].matrix[j], leaves[i].matrix[j], 'restored leaf pose');
    const frame = f.runtime.outskirtsStreetFrame({ time: f.time, viewYaw: 0 });
    assert.ok(!frame.events.some(e => e.id.startsWith('outskirts-bus:')), 'reload replays a spent bus cue');
    f.events.push(...frame.events);
  };
  f.frame();
  return f;
}

test('ordinary runtime movement boards, permits early retreat, then discovers a stuck exit and walks through her saved interior', () => {
  for (const phase of [0, -.25, .25]) {
    const f = fixture({ phase });
    f.walkTo(-2.5, -3.15);for(let i=0;i<4;i++)f.frame();
    assert.equal(f.transit().doorOpened,true);assert.equal(f.transit().close,false);
    f.walkTo(-1.45,-3.15);f.reload();const tread=f.local(f.position);
    assert.ok(busPassageFloorAt(tread.x,tread.z)>0&&busPassageFloorAt(tread.x,tread.z)<BUS.floor);
    f.walkTo(0,-2.6);f.reload();assert.equal(f.transit().entered,true);assert.equal(f.transit().trapAt,null,'entry closes through a body still on its steps');
    const doorAt=f.transit().doorAt,enteredAt=f.transit().enteredAt;
    f.walkTo(-2.5,-3.15);assert.equal(f.transit().doorAt,doorAt);assert.equal(f.transit().enteredAt,enteredAt);
    f.walkTo(0,-2);const target=f.at(BUS.entry.hinge[0],-3.15);
    const yaw=Math.atan2(target.x-f.position.x,-(target.y-f.position.y));f.frame({viewYaw:yaw});
    assert.ok(Number.isFinite(f.transit().trapAt),'looking at the cleared entry never commits the trap');
    for(let i=0;i<4;i++)f.frame();assert.equal(f.runtime.outskirtsBusPassageFrame().entryAngle,0);f.reload();
    f.walkTo(.5,4);const stance=f.local(f.position);
    // The normal movement request may end at actual hardware contact rather
    // than pretending every .5m input must complete through a closed leaf.
    const request=f.at(stance.x+.5,stance.z),touch=f.step(request),contact=f.local(f.position);
    assert.ok(contact.x<1.20,'the rear release-bar contact crossed its stuck leaf');
    const rear=f.at(1.175,4.16),look=Math.atan2(rear.x-f.position.x,-(rear.y-f.position.y));
    const tried=f.runtime.outskirtsPerformAction({action:'bus-exit-try',pass:BUS.pass,viewYaw:look});
    assert.equal(tried.changed,true,`real grid stance cannot try the bar atphase${phase}: ${JSON.stringify({stance,contact,tried,touch})}`);
    assert.equal(f.transit().exited,false);for(let i=0;i<7;i++)f.frame();
    assert.equal(f.runtime.outskirtsBusPassageFrame().exitAngle,0);f.reload();
    f.walkTo(0,2.5);const opened=f.runtime.outskirtsPerformAction({action:'bus-woman-open',pass:BUS.pass});
    assert.equal(opened.changed,true);assert.equal(f.transit().exited,false,'E skips walking through the body');
    for(let i=0;i<12;i++)f.frame();assert.equal(f.runtime.outskirtsBusPassageFrame().bodyOpening.ready,true);f.reload();
    f.walkTo(0,4);const entered=f.step(f.at(f.local(f.position).x,4.5));
    assert.equal(entered.move.via,'bus-body-enter');assert.equal(f.runtime.busInteriorFrame().active,true);f.reload();
    const start={...f.position},key=p=>`${p.x},${p.y}`,queue=[start],parents=new Map([[key(start),null]]),points=new Map([[key(start),start]]);let goal=null;
    for(let q=0;q<queue.length&&!goal;q++)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const p=queue[q],next={x:p.x+dx,y:p.y+dy},id=key(next);if(parents.has(id)||Math.hypot(next.x-start.x,next.y-start.y)>150)continue;
      const move=f.runtime.geometry.canStep(p.x,p.y,next.x,next.y);if(!move.ok||move.redirect&&move.via!=='bus-body-exit')continue;
      parents.set(id,key(p));points.set(id,next);if(move.via==='bus-body-exit'){goal=id;break;}queue.push(next);
    }
    assert.ok(goal,'the actual body corridor loses this accepted walking phase');const path=[];
    for(let id=goal;parents.get(id)!=null;id=parents.get(id))path.push(points.get(id));let metres=0;
    for(const next of path.reverse()){const before={...f.position};f.step(next);metres+=Math.hypot(next.x-before.x,next.y-before.y)*CELL;if(metres>35&&metres<36)f.reload();}
    assert.ok(metres>=BUS_BODY_CORRIDOR.length-.5);assert.equal(f.runtime.busInteriorFrame(),null);assert.equal(f.transit().exited,true);assert.equal(f.runtime.state().outskirtsExperience.busStage,4);
    for(const id of['entry-open','floor-load','rear-cloth','rear-stuck','body-open','rear-step'])assert.equal(f.events.filter(e=>e.id===`outskirts-bus:${id}`).length,1,`${id} absent or repeated atphase${phase}`);
    const route=f.visited.filter(p=>p.space==='bus');assert.ok(route.some(p=>Math.abs(p.x)<.31&&p.z>-.5&&p.z<.5),'trajectory bypassed aisle');
    const out=f.local(f.position);assert.ok(out.x>2&&out.z>3.5,'the far end does not expel us outside the bus');
  }
});

test('the real front leaf blocks until opened and its partial animation survives reload', () => {
  const f = fixture(), from = f.at(-1.5, -3.15), to = f.at(-1, -3.15);
  f.position = from; f.runtime.setPlayerPosition(from);
  assert.equal(f.runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, false, 'closed leaf has no body collision');
  f.frame(); f.frame();
  const partial = f.runtime.outskirtsBusPassageFrame();
  assert.ok(Math.abs(partial.entryAngle) > 0 && Math.abs(partial.entryAngle) < Math.PI / 2, 'fixture misses the partial animation');
  f.frame({ dt: 30, suspended: true });
  near(f.runtime.outskirtsBusPassageFrame().entryAngle, partial.entryAngle, 'suspension advances the physical leaf');
  near(f.runtime.state().outskirtsExperience.clock, partial.transit.clock, 'suspension advances the retained encounter clock');
  f.reload();
  for (let i = 0; i < 4; i++) f.frame();
  assert.equal(f.runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true, 'open leaf still closes its actual entry');
});

test('rendered support follows the smoothed body instead of jumping to its logical destination', () => {
  const f = fixture(), deck = f.at(0, -3.15), lower = f.at(-1.4, -3.15);
  f.runtime.setPlayerPosition(deck);
  near(f.runtime.geometry.renderedFloorAt(deck.x, deck.y, lower.x, lower.y), f.runtime.geometry.floorAt(lower.x, lower.y), 'rendered lower tread');
  assert.ok(Math.abs(f.runtime.geometry.floorAt(deck.x, deck.y) - f.runtime.geometry.floorAt(lower.x, lower.y)) > .3);
});

test('outside proximity and an unearned far-side fixture cannot spend the interior milestones', () => {
  const f = fixture();
  for (const [x, z] of [[-1.8, BUS.woman.z], [2, 3.85]]) {
    f.position = f.at(x, z); f.runtime.setPlayerPosition(f.position); f.frame();
    assert.equal(f.transit().entered, false);
    assert.equal(f.transit().close, false);
    assert.equal(f.transit().exited, false);
  }
  const legacy = fixture({ legacyStage: 3 });
  legacy.position = legacy.at(0, 2.8); legacy.runtime.setPlayerPosition(legacy.position); legacy.frame();
  assert.equal(legacy.transit().exited, true, 'old completed encounters are reopened');
  assert.ok(!legacy.events.some(e => /outskirts-bus:(entry-open|floor-load|rear-cloth|rear-step)/.test(e.id)), 'old completed encounters replay new scares');
});
