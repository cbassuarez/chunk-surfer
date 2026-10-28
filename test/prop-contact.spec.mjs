// WHAT IS STILL PLACED BY HAND, AND HOW WRONG IT IS.
//
// Two placements in this building were solved by typing coordinates against
// geometry nobody can see from the source. Both now have helpers — `mount:'wall'`
// and `on:'host-id'` — and both are OPT-IN, because a blanket auto-snap moves
// things that were deliberately free-standing: music stands, busts and a garden
// tree all match a naive "looks wall-mounted" test.
//
// So this is a worklist, not a gate. It asserts the things that ARE opted in
// actually resolved, and prints everything still adrift so it can be worked
// through. Run it directly to see the report:
//
//   node test/prop-contact.spec.mjs
//
// Measured before any of this existed: of 82 wall-mounted-looking props only 27
// sat within 10cm of a wall, and the chapel hymn board was 1.6m off one.

import assert from 'node:assert/strict';

import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as PROPS from '../src/game/props.js';
import { MESH_SURFACE, PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { wallContactAt } from '../src/world/wall-contact.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { TENOR_ROPE_AUTHORED } from '../src/data/bell-tower-layout.js';
import { BUILDING_WINDOWS } from '../src/data/building-windows.js';

FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
const instances = PROPS.propsInit(FP);
const plan = {
  size: FP.planSize, isSolid: FP.isSolid, floorAt: FP.floorAt, zoneAt: FP.zoneAt,
  materialAt: FP.materialAt, doorAt: FP.doorAt, logicalToPhysical: FP.logicalToPhysical,
};

// Thin, high-value controls get a humane acquisition cone. The tenor is the
// narrowest critical prop in the building and used to flicker out on adjacent
// reticle pixels even from its authored drop-in position.
{
  const player=FP.toRuntimePoint({x:TENOR_ROPE_AUTHORED.x,y:TENOR_ROPE_AUTHORED.y+1});
  const rope=PROPS.propById('tower-rope-8');
  const mx=(player.x+.5)*CELL,mz=(player.y+.5)*CELL;
  const exactYaw=Math.atan2(rope.interactionX-mx,-(rope.interactionY-mz));
  const hit=PROPS.pickProp(player.x,player.y,0,3.2,{yaw:exactYaw+.14,pitch:-.18});
  assert.equal(hit?.id,'tower-rope-8','the playable tenor cannot be acquired with a modest reticle offset');
}

// ── what opted in must have resolved ────────────────────────────────────────
{
  const mounted = instances.filter((p) => p.mount === 'wall');
  assert.ok(mounted.length > 0, 'nothing is opted into wall mounting, so the field is dead again');
  const unresolved = mounted.filter((p) => !p.wallContact);
  assert.deepEqual(unresolved.map((p) => p.id), [],
    'these asked to be mounted on a wall and no wall was found near them');
  for(const p of mounted.filter((prop)=>!prop.inspectAt)){
    const rendered=PROPS.renderInstances().find((instance)=>instance.id===p.id);
    const interaction=p.stairLandingWall?FP.logicalToPhysical(p.interactionX/CELL,p.interactionY/CELL):{x:p.interactionX/CELL,z:p.interactionY/CELL};
    assert.ok(Math.abs(interaction.x*CELL-rendered.x)<1e-9,`${p.id} implicit x interaction anchor did not follow wall snap`);
    assert.ok(Math.abs(interaction.z*CELL-rendered.z)<1e-9,`${p.id} implicit y interaction anchor did not follow wall snap`);
  }

  const rested = instances.filter((p) => p.on);
  assert.ok(rested.length > 0, 'nothing is opted into surface mounting');
  for (const p of rested) {
    assert.equal(p.restsOn, p.on, `${p.id} did not resolve its host`);
    assert.ok(Number.isFinite(p.elevation) && p.elevation > 0,
      `${p.id} resolved to a nonsense elevation`);
    const host = instances.find((h) => h.id === p.on);
    const surface = MESH_SURFACE[host.mesh] * (host.scale || 1) + (host.elevation || 0);
    assert.ok(Math.abs(p.elevation - surface) < 1e-6,
      `${p.id} is not standing on ${host.id}'s measured surface`);
  }
}

// A frame's decorated +Z face must point into its own room while its measured
// rear plane touches masonry. Merely finding a nearby solid cell missed both
// the six frames buried by 2.75cm and the dead-end canvas facing through a wall.
{
  const portraits = [
    ['foyer-portrait-titian',0,1], ['foyer-portrait-greco',0,1],
    ['hall-portrait-bronzino',0,1], ['hall-portrait-florentine',0,1],
    ['chapel-portrait-pollaiuolo',0,1], ['chapel-portrait-netherlandish',0,1],
    ['deadend-ground-painting',-1,0],
  ];
  const renderedById = new Map(PROPS.renderInstances({inscriptions:false}).map((p)=>[p.id,p]));
  for (const [id,nx,ny] of portraits) {
    const p = instances.find((prop)=>prop.id===id);
    assert.ok(p,`${id} is missing`);
    assert.equal(p.mount,'wall',`${id} bypasses measured mounting`);
    assert.deepEqual(p.mountNormal,{nx,ny},`${id} names the wrong room-facing wall normal`);
    const rendered = renderedById.get(id);
    assert.ok(rendered,`${id} is not rendered`);
    const contact = wallContactAt(plan,p.rx+.5,p.ry+.5,{prefer:{nx,ny}});
    assert.ok(contact,`${id} has no wall with its authored room-facing normal`);
    const front = {x:-Math.sin(rendered.yaw),z:Math.cos(rendered.yaw)};
    assert.ok(Math.abs(front.x-nx)<1e-9&&Math.abs(front.z-ny)<1e-9,
      `${id} shows its back to the room`);
    const depth = PROP_BOUNDS[p.mesh].min[2]*rendered.scale*(rendered.scaleZ??1);
    const rear = {x:rendered.x+front.x*depth,z:rendered.z+front.z*depth};
    const wallCell = FP.logicalToPhysical(contact.cell.x,contact.cell.y);
    if (contact.planeX!==null) {
      const planeX = (wallCell.x+contact.planeX-contact.cell.x)*CELL;
      assert.ok(Math.abs(rear.x-planeX)<1e-6,`${id} rear floats off or penetrates its physical wall`);
    }
    if (contact.planeY!==null) {
      const planeZ = (wallCell.z+contact.planeY-contact.cell.y)*CELL;
      assert.ok(Math.abs(rear.z-planeZ)<1e-6,`${id} rear floats off or penetrates its physical wall`);
    }
  }
}

// Real window openings also need their occupied wall faces kept clear. Test
// resolved render poses and packed geometry, rather than just the paper anchor:
// Greco previously crossed the foyer jamb and the pool light occupied glazing.
{
  const renderedById=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
  const worldBounds=id=>{
    const p=renderedById.get(id);
    assert.ok(p,`${id} is not rendered`);
    const bounds=PROP_BOUNDS[p.mesh];
    assert.ok(bounds,`${id} has no measured geometry`);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),scale=p.scale??1;
    for(const x0 of [bounds.min[0],bounds.max[0]])
      for(const y0 of [bounds.min[1],bounds.max[1]])
        for(const z0 of [bounds.min[2],bounds.max[2]]){
          const x=x0*scale*(p.scaleX??1),y=y0*scale*(p.scaleY??1),z=z0*scale*(p.scaleZ??1);
          const point=[c*x-s*z+p.x,y+p.y,s*x+c*z+p.z];
          for(let axis=0;axis<3;axis++){
            min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);
          }
        }
    return {min,max};
  };
  const foyer=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');
  const greco=worldBounds('foyer-portrait-greco'),titian=worldBounds('foyer-portrait-titian');
  const foyerFrame=worldBounds(`building-window-unit-${foyer.id}`);
  assert.ok(greco.max[1]>foyer.sill&&greco.min[1]<foyer.head,'portrait clearance must be checked at the actual aperture height');
  assert.ok(greco.max[0]<=foyer.physical.x0-.08,'Greco crosses the real foyer aperture');
  assert.ok(greco.max[0]<=foyerFrame.min[0]-.08,'Greco overlaps the finished foyer jamb or curtain assembly');
  assert.ok(greco.min[0]>=titian.max[0]+.20,'clearing the window must retain separation from Titian');

  const pool=BUILDING_WINDOWS.find(w=>w.id==='W4-pool-south');
  const light=instances.find(p=>p.id==='natatorium-light-emergency-far');
  assert.ok(light,'the far pool emergency light is missing');
  const rendered=renderedById.get(light.id),lightBox=worldBounds(light.id),poolFrame=worldBounds('natatorium-end-window');
  assert.equal(light.mount,'wall','the far pool light bypasses measured wall mounting');
  assert.deepEqual(light.mountNormal,{nx:0,ny:-1},'the pool light must face into the room from the south wall');
  assert.deepEqual({nx:light.wallContact?.nx,ny:light.wallContact?.ny},{nx:0,ny:-1},'the authored south-wall contact did not resolve');
  assert.ok(lightBox.max[1]>pool.sill&&lightBox.min[1]<pool.head,'light clearance must be checked at the actual aperture height');
  assert.ok(lightBox.min[0]>=pool.physical.x1+.08,'the pool light occupies a clear pane');
  assert.ok(lightBox.min[0]>=poolFrame.max[0]+.08,'the pool light overlaps the finished window frame');
  const rearZ=rendered.z+Math.cos(rendered.yaw)*PROP_BOUNDS[light.mesh].min[2]*rendered.scale*(rendered.scaleZ??1);
  assert.ok(Math.abs(rearZ-pool.physical.z0)<1e-6,'the pool light rear floats off or penetrates the actual south masonry face');
  assert.ok(Math.abs(-Math.sin(rendered.yaw))<1e-9&&Math.abs(Math.cos(rendered.yaw)+1)<1e-9,'the pool light decorated face points away from the room');
  assert.equal(light.lightCircuit,'sp02');
  assert.deepEqual(light.lightColor,[1,.018,.008]);
}

// The cabinet is authored with its decorated +Z face into the room and its
// local rear plane exactly on the east wall.
{
  const cabinet=instances.find((p)=>p.id==='box-office-key-cabinet');
  const rendered=PROPS.renderInstances().find((p)=>p.id===cabinet.id);
  const bounds=PROP_BOUNDS[cabinet.mesh];
  const contact=wallContactAt(plan,cabinet.rx+.5,cabinet.ry+.5);
  const front={x:-Math.sin(rendered.yaw),z:Math.cos(rendered.yaw)};
  assert.ok(Math.abs(front.x-contact.nx)<1e-9&&Math.abs(front.z-contact.ny)<1e-9,'cabinet +Z face does not point into the room');
  const rear={x:rendered.x+front.x*bounds.min[2],z:rendered.z+front.z*bounds.min[2]};
  if(contact.planeX!==null)assert.ok(Math.abs(rear.x-contact.planeX*.5)<1e-6,'cabinet rear plane does not meet the wall');
  if(contact.planeY!==null)assert.ok(Math.abs(rear.z-contact.planeY*.5)<1e-6,'cabinet rear plane does not meet the wall');
}

// An authored inspectAt remains an explicit exception to anchor following.
{
  const inspectAt={x:95.5,y:9.5};
  const [mounted]=PROPS.propsInit(FP,[{id:'explicit-anchor-proof',mesh:'chapel_key_cabinet',x:96.25,y:9.45,yaw:0,mount:'wall',inspectAt}]);
  assert.equal(mounted.interactionX,inspectAt.x);
  assert.equal(mounted.interactionY,inspectAt.y);
  const landing=instances.find(p=>p.id==='landing-upper-floor-landing');
  const [mountedLanding]=PROPS.propsInit(FP,[{...landing,inspectAt}]);
  assert.equal(mountedLanding.interactionX,inspectAt.x,'physical stair mounting also preserves an explicit inspection override');
  assert.equal(mountedLanding.interactionY,inspectAt.y);
  PROPS.propsInit(FP);
}

// A missing or self-referential host must throw rather than silently resolve to
// zero, which drops the object through the table it was meant to stand on.
{
  const base = [{ id: 'desk', mesh: 'school_desk', x: 60, y: 6, yaw: 0, scale: 1 }];
  assert.throws(() => PROPS.propsInit(FP, [...base,
    { id: 'note', mesh: 'loose_note', x: 60, y: 6, yaw: 0, scale: 1, on: 'nope' }]),
  /names no such prop/, 'a missing host is silent');
  assert.throws(() => PROPS.propsInit(FP, [
    { id: 'note', mesh: 'loose_note', x: 60, y: 6, yaw: 0, scale: 1, on: 'note' }]),
  /refers to itself/, 'a self-referential host is silent');
  PROPS.propsInit(FP);   // put the real world back
}

// ── the worklist ────────────────────────────────────────────────────────────
const halfDepth = (p) => {
  const b = PROP_BOUNDS[p.mesh];
  return b ? Math.max(Math.abs(b.max[2]), Math.abs(b.min[2])) * (p.scale || 1) : 0;
};

const adrift = [];
for (const p of PROPS.allProps()) {
  if (p.mount === 'wall' || p.on || p.id.startsWith('baseboard-')) continue;
  if (!(Number(p.elevation) > 0)) continue;
  const b = PROP_BOUNDS[p.mesh];
  if (!b) continue;
  const hw = Math.max(b.max[0], -b.min[0]) * (p.scale || 1);
  const hd = Math.max(b.max[2], -b.min[2]) * (p.scale || 1);
  if (hw > 1.4 || hd > 1.4) continue;           // elevations, reliefs, frontages
  const contact = wallContactAt(plan, p.rx + 0.5, p.ry + 0.5);
  const gap = contact ? contact.gap - halfDepth(p) : Infinity;
  if (gap > 0.30) adrift.push({ id: p.id, gap });
}
adrift.sort((a, b) => b.gap - a.gap);

if (process.argv[1]?.endsWith('prop-contact.spec.mjs')) {
  console.log(`\n${adrift.length} raised props are still more than 30cm from any wall`);
  console.log('(a worklist, not a failure — some of these are legitimately free-standing)');
  for (const a of adrift.slice(0, 25)) {
    console.log(`  ${a.id.padEnd(38)}${Number.isFinite(a.gap) ? `${a.gap.toFixed(2)} m` : 'no wall in range'}`);
  }
  if (adrift.length > 25) console.log(`  … and ${adrift.length - 25} more`);
}

console.log('prop contact specs passed');
