import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import * as PROPS from '../src/game/props.js';
import { KEY_CABINET_RING, keyCabinetSelection, keyCabinetKeyIdentified } from '../src/game/key-cabinet.js';
import {
  BOX_OFFICE_SCENE_ID, compileBoxOfficeKeyTagPlan, validateWindowChoreographyPlan,
  windowChoreographyPolicy,
} from '../src/platform/window-choreography.js';

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});

const prop = (id) => CONSERVATORY_PROPS.find((entry) => entry.id === id);
PROPS.propsInit(FP);

// Use the ordinary body, prop collision and reticle picker. A document or desk
// is inspected from a clear floor cell; standing inside its mesh is no proof.
const walkOffice = (start) => {
  const queue=[start],seen=new Set([`${start.x},${start.y}`]),clearCache=new Map(),previous=new Map();
  const clear=p=>{
    const key=`${p.x},${p.y}`;
    if(!clearCache.has(key))clearCache.set(key,!FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y));
    return clearCache.get(key);
  };
  assert.ok(clear(start),'the ordinary public approach supports the full body');
  for(let i=0;i<queue.length;i++)for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const at=queue[i],next={x:at.x+dx,y:at.y+dy},key=`${next.x},${next.y}`;
    if(seen.has(key)||next.x<148||next.x>197||next.y<6||next.y>60||!clear(next))continue;
    const step=FP.canStep(at.x,at.y,next.x,next.y,{keys:new Set(['master'])});
    if(!step.ok||step.redirect||!PROPS.propCanOccupy(next.x,next.y,{from:at}))continue;
    seen.add(key);previous.set(key,at);queue.push(next);
  }
  return {queue,seen,previous};
};
const inspectionFrom = (route,id) => {
  const p=PROPS.allProps().find(p=>p.id===id);
  assert.ok(p,`${id} survives actual prop initialization`);
  return route.queue.map(at=>{
    const dx=p.interactionX-(at.x+.5)*.5,dz=p.interactionY-(at.y+.5)*.5,d=Math.hypot(dx,dz);
    const targetY=(p.floor||0)+(p.elevation||0)+(p.interactionHeight??Math.max(.12,(p.h||.55)*(p.scale||1))*.5);
    return{at,d,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(targetY-1.58,Math.max(.05,d))};
  }).filter(aim=>aim.d<2.5).sort((a,b)=>a.d-b.d)
    .find(aim=>PROPS.pickProp(aim.at.x,aim.at.y,0,2,{yaw:aim.yaw,pitch:aim.pitch})?.id===id);
};

// ── THE FRONTAGE IS A FACADE ────────────────────────────────────────────────
//
// The public side of the box office used to have a two-metre hole in it. The
// plan carried an open 'F' at the ticket window on the reasoning that the fitted
// counter was the barrier — but a prop is dressing and the plan is the
// collision, so runtime row 21 was a clear walk-in from the atrium, past the
// queue stanchions and through where the grille is meant to be.
{
  for (let y = 18; y <= 21; y += 1) {
    for (let x = 182; x <= 183; x += 1) {
      assert.equal(FP.isSolid(x, y), true,
        `the box office frontage is open at (${x},${y}) — the public can walk through the ticket window`);
    }
  }
  // And it is a wall rather than a doorway: a door here would be a way in that
  // the sheets do not describe and the counter's own text contradicts.
  for (let y = 18; y <= 21; y += 1) {
    assert.equal(FP.doorAt(182, y) || null, null, `a door has appeared in the frontage at (182,${y})`);
  }
}

// ── AND THE ROOM IS STILL A ROOM ────────────────────────────────────────────
//
// The other half, and the reason this is one spec rather than two: sealing a
// frontage is trivial and stranding the puzzle behind it is the obvious way to
// get it wrong. Staff come in by the master-key leaf on the south wall, which is
// exactly what bag-sheets.js tells the player.
{
  const start = { x: 170, y: 19 };            // the atrium, outside the counter
  const required=['box-office-key-cabinet','box-office-ledger','box-office-desk',
    ...Object.values(KEY_CABINET_RING).map(ring=>ring.id)];
  const staffDoor=FP.doorState().find(door=>door.id==='foh-office');
  assert.equal(staffDoor?.keyId,'master','staff access still requires the issued key');
  FP.setDoorOpen('foh-office',false);
  const closed=walkOffice(start);
  for(const id of required)assert.equal(inspectionFrom(closed,id),undefined,`${id} cannot be used through closed blockwork`);
  assert.ok(closed.seen.has('188,26')||closed.seen.has('189,26'),'the closed staff leaf can be approached');
  assert.ok(inspectionFrom(closed,'box-office-counter'),'the public queue can inspect the counter without entering its mesh');
  FP.setDoorOpen('foh-office',true);
  const opened=walkOffice(start);
  for(const id of required){
    const aim=inspectionFrom(opened,id);
    assert.ok(aim,`${id} has a reachable full-body inspection with the staff leaf open`);
    assert.ok(walkOffice(aim.at).seen.has(`${start.x},${start.y}`),`${id} retains an ordinary return to the atrium`);
  }
  const ledger=PROPS.allProps().find(p=>p.id==='box-office-ledger');
  assert.equal(FP.floorAt(ledger.rx,ledger.ry),0,'the ledger is supported on its own room floor');
  assert.deepEqual([ledger.wallContact?.nx,ledger.wallContact?.ny],[0,-1],'the ledger mounts on the south wall inward face');
  assert.ok(Math.abs(ledger.interactionY-11.95)<.00001,'the mounted ledger sits against the south wall instead of inside masonry');
  FP.setDoorOpen('foh-office',false);
}

// ── THE PUZZLE IS SOLVABLE INSIDE THE GAME WINDOW ───────────────────────────
//
// The clue surfaces are display only. Everything needed to choose correctly is
// readable in the room, so a browser build, withheld consent, disabled effects
// or reduced motion cost the player atmosphere and never the answer.
{
  assert.equal(keyCabinetSelection('C-17'), 'take', 'C-17 is the chapel key');
  assert.equal(keyCabinetSelection('CH-04'), 'drop');
  assert.equal(keyCabinetSelection('FOH-M'), 'drop');

  const ledger = prop('box-office-ledger');
  assert.match(ledger.inspect.first, /C-17/, 'the ledger no longer names the key in the room');

  // Every ring carries a readable tag. Without these the cabinet is a one-in-three
  // guess and there is nothing for the clue windows to be a second view OF.
  for (const [tag, ring] of Object.entries(KEY_CABINET_RING)) {
    const placed = prop(ring.id);
    assert.ok(placed, `${ring.id} is not placed`);
    assert.ok(placed.inspect?.first, `${ring.id} has no tag to read`);
    assert.ok(
      placed.inspect.first.includes(tag),
      `${ring.id} does not show its own tag (${tag}) — the comparison cannot be made in the room`,
    );
  }

  assert.equal(keyCabinetKeyIdentified({ ledger: true }), true, 'reading the ledger is enough');
  assert.equal(keyCabinetKeyIdentified({}), false, 'and knowing nothing is not');
}

// ── THE CLUE SURFACES SHOW, AND DO NOTHING ELSE ─────────────────────────────
//
// This is the only ordinary room in the game allowed to reach outside the
// window, so the contract it is held to is narrower than any rupture's. Every
// assertion here is a thing it must never start doing.
{
  const tags = Object.keys(KEY_CABINET_RING).map((tag) => ({ tag, text: `${tag} tag` }));
  const plan = compileBoxOfficeKeyTagPlan({ tags });

  assert.equal(validateWindowChoreographyPlan(plan).ok, true, 'the cue does not compile');
  assert.equal(plan.sceneId, BOX_OFFICE_SCENE_ID);
  assert.equal(windowChoreographyPolicy(BOX_OFFICE_SCENE_ID), 'box-office');

  assert.equal(plan.surfaces.length, 3, 'one surface per tag');
  assert.deepEqual(plan.mainFrame, [], 'the game window must never move for a clue');
  assert.equal(plan.focus, 'main', 'the cue must never take focus');
  assert.equal(plan.input, 'none', 'the surfaces must never take input');
  assert.equal(plan.restore, 'transaction', 'the cue must be restorable');
  assert.ok(plan.surfaces.every((s) => s.interactive === false),
    'a clue surface is a picture of a tag, not a tag');
  assert.ok(plan.primitives.every((p) => p === 'Frame' || p === 'Restore'),
    'the box office places and restores; it does not breach, swarm or cast');

  // Every tag gets its own surface and they are laid out to be READ TOGETHER,
  // which is the one thing the room itself cannot do.
  assert.equal(new Set(plan.surfaces.map((s) => s.x)).size, 3, 'the tags overlap');
  assert.equal(new Set(plan.surfaces.map((s) => s.y)).size, 1, 'the tags are not on one line');
  assert.deepEqual(plan.surfaces.map((s) => s.title), Object.keys(KEY_CABINET_RING));

  // The four-surface ceiling is not a place to lose a tag silently.
  const overflow = compileBoxOfficeKeyTagPlan({
    tags: [...tags, { tag: 'X-99', text: 'x' }, { tag: 'X-98', text: 'x' }],
  });
  assert.equal(overflow.surfaces.length, 3, 'the cue caps itself at the three rings');
}

// ── NOTHING IN THE FRONTAGE IS SILENTLY DROPPED ─────────────────────────────
//
// propsInit filters `!isSolid(rx,ry)`, so a prop authored inside blockwork does
// not render and does not complain — which is exactly what happened to the
// poster and the price list on the way in. A wall-mounted prop belongs on the
// open cell BESIDE its wall; wallContactAt snaps it to the face.
{
  PROPS.propsInit(FP);
  const placed = new Set(PROPS.allProps().map((p) => p.id));
  const frontage = CONSERVATORY_PROPS.filter((p) => /^(box-office|foh)-/.test(p.id));
  assert.ok(frontage.length >= 24, `front of house has thinned out (${frontage.length} props)`);
  for (const p of frontage) {
    assert.ok(placed.has(p.id), `${p.id} is authored inside a wall and never reaches the room`);
  }

  // And every one of them says something. A prop with no inspect is set
  // dressing; the frontage is meant to be readable.
  for (const p of frontage) {
    if (/queue-|casing|services-panel/.test(p.id)) continue;   // fixtures, not documents
    assert.ok(p.inspect?.first, `${p.id} has nothing to say`);
    assert.ok(p.inspect?.again, `${p.id} has nothing to add on a second look`);
    assert.notEqual(p.inspect.again, p.inspect.first, `${p.id} repeats itself`);
  }
}

console.log('box-office.spec.mjs ok');
