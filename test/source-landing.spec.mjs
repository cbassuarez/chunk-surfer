import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { CELL } from '../src/data/floorplan/legend.js';
import {
  SOURCE_GET_IN_BOUNDS,
  SOURCE_GET_IN_PROP_IDS,
  SOURCE_GET_IN_DOOR_IDS,
  SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
  SOURCE_LANDING_ENTRY_LOCAL,
  SOURCE_LANDING_HUSH_LOCAL,
  SOURCE_LANDING_OPENING_LOCAL,
  SOURCE_LANDING_PORTAL_DOOR_ID,
  SOURCE_LANDING_PORTAL_LOCAL,
  SOURCE_LANDING_REAR_DOOR_ID,
  SOURCE_THRESHOLD_LIGHT_ID,
  sourceEmergencyFrame,
  sourceLandingAuthoredFromLocal,
  sourceLandingCellAt,
  sourceLandingContract,
  sourceLandingDoorPlacements,
  sourceApproachLights,
  sourceApproachSpan,
  sourceLandingLights,
  sourceLandingLocalFromAuthored,
  sourceLandingPropPlacements,
} from '../src/data/source-landing.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

// Derived from the 'I' glyphs in the authored ground plan, so this moves when
// the dock is re-cut. It grew one cell east with the Scene Dock rebuild; what
// the snapshot is for is noticing that it moved, not forbidding it.
assert.deepEqual(SOURCE_GET_IN_BOUNDS, { minX: 58, maxX: 73, minY: 4, maxY: 14 });

for (const point of [{ x: 58, y: 4 }, { x: 65.5, y: 9.5 }, { x: 72.25, y: 13.75 }]) {
  const local = sourceLandingLocalFromAuthored(point);
  const restored = sourceLandingAuthoredFromLocal(local.x, local.y);
  assert.ok(Math.abs(restored.x - point.x) < 1e-9);
  assert.ok(Math.abs(restored.y - point.y) < 1e-9);
}

// Two authored get-in props are deliberately NOT copied:
//   dock-chandelier-spent — the intact one is copied in its place;
//   dock-crew-board       — a notice board mounted on the rear plane, which in
//                           Source is the corridor mouth, i.e. an opening. A
//                           sign hung across a doorway.
const SOURCE_COPY_SKIPS = ['dock-chandelier-spent', 'dock-crew-board'];
const physicalGetInIds = CONSERVATORY_PROPS
  .filter((prop) => prop.x >= 57.5 && prop.x <= 72.5 && prop.y >= 3.5 && prop.y <= 14.5)
  .filter((prop) => !SOURCE_COPY_SKIPS.includes(prop.id))
  .map((prop) => prop.id);
assert.deepEqual(SOURCE_GET_IN_PROP_IDS, physicalGetInIds, 'the Source copy selects the authored get-in props exactly');
for (const skipped of SOURCE_COPY_SKIPS) {
  assert.ok(!SOURCE_GET_IN_PROP_IDS.includes(skipped), `${skipped} must not be rebuilt in Source`);
}
const placements = sourceLandingPropPlacements();
assert.deepEqual(placements.map((entry) => entry.sourcePropId), physicalGetInIds);
assert.equal(new Set(placements.map((entry) => entry.id)).size, placements.length);
// THE REAR GOODS PAIR IS NOT REBUILT IN SOURCE.
// Its plane is the corridor mouth: the player reaches this room by walking the
// haystack corridor, which ends five and a half metres behind that line, so
// standing a pair of loading-dock doors across it hid the arrival behind a
// picture of a different building. Only the FOH leaf survives as a door.
assert.deepEqual(SOURCE_GET_IN_DOOR_IDS,[SOURCE_LANDING_PORTAL_DOOR_ID]);
assert.ok(!SOURCE_GET_IN_DOOR_IDS.includes(SOURCE_LANDING_REAR_DOOR_ID),
  'the rear plane is an opening onto the corridor, not a door');
const doorPlacements=sourceLandingDoorPlacements();
assert.deepEqual(new Set(doorPlacements.map((entry)=>entry.sourceDoorId)),new Set(SOURCE_GET_IN_DOOR_IDS));
assert.equal(doorPlacements.filter((entry)=>entry.id.includes('door-leaf')).length,1,'only the FOH leaf is reconstructed');
assert.ok(sourceLandingDoorPlacements({x:0,y:0},{portalProgress:1})
  .find((entry)=>entry.sourcePortalLeaf)?.yaw<0,'the FOH leaf visibly swings on interaction');

const portalPlane = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.maxX + 1, y: 13.5 });
assert.equal(sourceLandingCellAt(portalPlane.x, portalPlane.y).solid,true,'the FOH leaf is physical before E');
assert.equal(sourceLandingCellAt(portalPlane.x, portalPlane.y,{portalOpen:true}).opening,true,'the FOH aperture becomes traversable only after opening');
const forwardWall = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.maxX + 1, y: 9.5 });
assert.equal(sourceLandingCellAt(forwardWall.x, forwardWall.y).solid,true,'the rest of the forward wall remains real');
// The plane behind the player is the CORRIDOR MOUTH, not a sealed wall: the
// haystack corridor the player walked ends five and a half metres behind it and
// is what they turn around into.
const rearPlane = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.minX - .1, y: 9.5 });
const rearCell = sourceLandingCellAt(rearPlane.x, rearPlane.y);
assert.equal(rearCell.solid, false, 'the grey-door plane is open onto the corridor');
assert.equal(rearCell.corridorMouth, true, 'and it is the corridor mouth specifically');
assert.equal(rearCell.ceil, 4.5, 'the mouth takes the corridor ceiling, not the dock ceiling');
// The wall either side of the mouth is still a wall.
const rearSolid = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.minX - .1, y: 4.5 });
assert.equal(sourceLandingCellAt(rearSolid.x, rearSolid.y).solid, true, 'only the aperture opens');
assert.ok(SOURCE_LANDING_HUSH_LOCAL.y > SOURCE_LANDING_ENTRY_LOCAL.y);
assert.ok(SOURCE_LANDING_OPENING_LOCAL.y < SOURCE_LANDING_ENTRY_LOCAL.y);
assert.equal(SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,-16,'the field begins at the FOH wall, not behind the room');

assert.deepEqual(sourceEmergencyFrame(1,{reducedEffects:true}),sourceEmergencyFrame(99,{reducedEffects:true}),'reduced effects hold a stable red wash');
assert.notEqual(sourceEmergencyFrame(.1).cycle,sourceEmergencyFrame(.3).cycle,'the maintained circuit has a visible full-effects cycle');

const lights = sourceLandingLights();
const light = lights.find((entry)=>entry.id==='source-landing:getin-grey-door-seam');
const thresholdLight = lights.find((entry)=>entry.id===SOURCE_THRESHOLD_LIGHT_ID);
const openingLight = lights.find((entry)=>entry.id==='source-landing:opening-emergency');
const liftLight = lights.find((entry)=>entry.id==='source-landing:first-lift-emergency');
// One neutral dock practical, a white cinematic practical, two Source-side
// pools, then the approach run. The approach is lit at the
// concert hall's own figures — that is what "washed in red" costs, and Source's
// original lamps were about a third of it.
const approach = lights.filter((entry) => entry.id.startsWith('source-approach-emergency-'));
assert.ok(approach.length >= 5, 'the approach carries a run of lamps, not one');
for (const lamp of approach) {
  assert.deepEqual(lamp.color, [1, 0, 0], 'the approach circuit is the emergency primary');
  assert.equal(lamp.kind, 'emergency');
  assert.ok(lamp.intensity >= 3.2, `${lamp.id} is below hall strength (${lamp.intensity})`);
  assert.ok(lamp.radius >= 42, `${lamp.id} does not reach like the hall (${lamp.radius})`);
}
// AND THE RED STOPS AT THE STAIR. Past it the field is as dark as it ever was;
// the only red carried onward is the torch's.
{
  const span = sourceApproachSpan();
  const origin = { x: 0, y: 0 };
  for (const lamp of sourceApproachLights(origin)) {
    const ly = lamp.z / CELL;
    assert.ok(ly <= span.from && ly >= span.to,
      `${lamp.id} at ${ly} is outside the approach (${span.from}..${span.to})`);
  }
}
assert.equal(light.kind, 'fitting','the Scene Dock seam is not on Source emergency power');
assert.deepEqual(light.color,[1,.43,.16],'the Scene Dock seam lost its authored sodium colour');
assert.equal(light.intensity,.34,'the Scene Dock seam was promoted to an alarm-strength source');
assert.ok(Math.abs(light.x) < .001, 'the seam light is centred on the rear plane');
assert.ok(light.z > 6 * CELL, 'the seam light is behind the arrival position');
assert.deepEqual(lights.slice(0,4).map((entry)=>entry.id),[
  'source-landing:getin-grey-door-seam',
  SOURCE_THRESHOLD_LIGHT_ID,
  'source-landing:opening-emergency',
  'source-landing:first-lift-emergency',
]);
assert.deepEqual(thresholdLight.color,[1,1,1],'the door cinematic practical is not white');
assert.ok(thresholdLight.intensity>=10,'the aperture no longer enters as blinding light');
assert.equal(openingLight.kind,'emergency');
assert.equal(liftLight.kind,'emergency');
assert.ok(openingLight.radius<=16&&liftLight.radius<=12,'the arrival pools cannot reveal distant Source activity');

const contract = sourceLandingContract();
assert.equal(contract.forwardWallRemoved, false);
assert.equal(contract.portalRequiresInteraction,true);
assert.equal(contract.portal.id,SOURCE_LANDING_PORTAL_DOOR_ID);
assert.equal(contract.fieldEdgeY,SOURCE_LANDING_FIELD_EDGE_LOCAL_Y);
assert.deepEqual(contract.propIds, physicalGetInIds);
assert.deepEqual(contract.doorIds,SOURCE_GET_IN_DOOR_IDS);
assert.deepEqual(contract.lightIds,lights.map((entry)=>entry.id));
assert.deepEqual(contract.emergencyLightIds,lights.filter((entry)=>entry.kind==='emergency').map((entry)=>entry.id));
assert.ok(!contract.emergencyLightIds.includes(light.id),'the Scene Dock practical is reported as emergency lighting');

const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING, { seed: 4417 });
const runtime = createSourceSpaceRuntime({ initialState: built.state });
runtime.setPlayerPosition(built.position);
assert.equal(runtime.textSpaceActive(), false, 'the exact landing remains physically rendered');
assert.equal(runtime.sourceLandingHushFrame().safe, true);
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true);
assert.equal(runtime.sourceScene().weather.rain, 1);
assert.equal(runtime.sourceScene().weather.moon, 1);
assert.equal(runtime.sourceScene().weather.clouds, 1);
// The landing preset starts inside the Scene Dock. No red source — including
// the wide approach run — is even submitted on this side of FOH.
const runtimeLights=runtime.localLights();
assert.deepEqual(runtimeLights.map((entry)=>entry.id),['source-landing:getin-grey-door-seam']);
assert.ok(runtimeLights.every((entry)=>entry.kind!=='emergency'),'the Scene Dock still submits red emergency lighting');
assert.equal(runtime.sourceEmergencyLightingFrame().active,false,'the Scene Dock still enables the full-frame red wash');
const preLiftProps=runtime.propInstances(built.position.x,built.position.y,{reducedMotion:true});
assert.ok(!preLiftProps.some((entry)=>entry.mesh==='tower_bulkhead'),
  'the FOH door still opens into a bulkhead wall');
assert.ok(!preLiftProps.some((entry)=>entry.sourceConnector==='chute-fork'),
  'Source proper is visible before the thirty-second white walk');
// Once the white interval resolves, the navigable Source version replaces its
// horizon proxy and the real arrival staircase is present.
const resolvedState=reduceChunkSurf(built.state,{type:'SOURCE_APPROACH_COMPLETED',distance:288});
const resolvedRuntime=createSourceSpaceRuntime({initialState:resolvedState});
const resolvedAt=resolvedRuntime.checkpointPosition('landing-approach');
resolvedRuntime.setPlayerPosition(resolvedAt);
const resolvedProps=resolvedRuntime.propInstances(resolvedAt.x,resolvedAt.y,{reducedMotion:true});
assert.ok(resolvedProps.some((entry)=>entry.sourceConnector==='chute-fork'),'the real arrival staircase did not resolve after the white walk');
assert.ok(resolvedProps.some((entry)=>entry.mesh==='plant_grated_steps'),'the resolved staircase has no physical treads');
assert.equal(preLiftProps.some((entry)=>String(entry.sourceConnector||'').startsWith('lift-')),false,'no lift is rendered anywhere');

const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const sourceWorldBranch=mainSource.slice(mainSource.indexOf('function worldRenderInstances'),mainSource.indexOf('function syncSourceRender'));
assert.match(sourceWorldBranch,/if\(usingSourceSpace\(\)\)[\s\S]*?r3dSetEmergencyShadows\?\.\(\[\]\)/,
  'Source submits no apparition or emergency-shadow instance');

const origin=built.state.landscapeOrigin;
const world=(point)=>({x:origin.x+point.x,y:origin.y+point.y});
const portalWorld=world(SOURCE_LANDING_PORTAL_LOCAL);
assert.equal(runtime.geometry.cellAt(portalWorld.x,portalWorld.y),null,'the closed FOH door owns collision');
runtime.setPlayerPosition({x:portalWorld.x,y:portalWorld.y+5,facing:0});
const doorFocus=runtime.focusAt(portalWorld.x,portalWorld.y+5,0);
assert.equal(doorFocus.kind,'source-landing-door');
assert.equal(runtime.inspectFocused(portalWorld.x,portalWorld.y+5,0).event,'landing-door-opened','E routes through the Source interaction reducer');
assert.equal(runtime.landingPortalFrame().passable,false,'the collision does not vanish ahead of the moving leaf');
runtime.tick(1.4,{px:portalWorld.x,py:portalWorld.y+5,facing:0});
assert.equal(runtime.landingPortalFrame().passable,true);
assert.ok(runtime.geometry.cellAt(portalWorld.x,portalWorld.y),'the opened FOH door reveals Source ground');
assert.ok(runtime.geometry.renderCellAt(portalWorld.x,portalWorld.y),'the opening has matching rendered ground');
// NOTHING IS FABRICATED BEHIND THE LEAF.
//
// This used to assert the opposite: a run of louvre and bulkhead panels at
// deliberately impossible spacing, grown as the hinge moved. Through a
// one-metre aperture that read as scrap floating in an open landscape, and the
// nearest panel was eight metres wide standing two metres past the door — you
// walked through it. What is behind the leaf is the haystack corridor the
// player actually walked, still standing where it actually is; the hall's
// render gate keeps it alive past the phase change while the body gate keeps
// refusing every cell of it (see source-scene-dock.spec.mjs).
const cinematicProps=runtime.propInstances(portalWorld.x,portalWorld.y,{reducedMotion:true});
assert.equal(cinematicProps.some((entry)=>entry.sourceConnector==='foh-source-aperture'),false,
  'the leaf must not grow fabricated depth behind itself');

// No generic ground may wrap around the room. The BODY is held out everywhere,
// the grey-door plane included — there is no walking back up the corridor.
// {x:0,y:18} is the corridor mouth now — the one place the room deliberately
// opens — so the wrap guard samples beside and behind it instead.
for(const local of [{x:14,y:16},{x:20,y:0},{x:-20,y:0},{x:14,y:18}]){
  const point=world(local);
  assert.equal(runtime.geometry.cellAt(point.x,point.y),null,`generic ground survives beside/behind the get-in at ${local.x},${local.y}`);
}
// SIGHT is held out too, except where it is deliberately let through: the goods
// aperture, which is how the haystack corridor behind this plane is seen. The
// samples below are beside and behind the room but off that aperture.
for(const local of [{x:14,y:16},{x:20,y:0},{x:-20,y:0},{x:14,y:18}]){
  const point=world(local);
  assert.equal(runtime.geometry.renderCellAt(point.x,point.y),null,`rendered ground survives beside/behind the get-in at ${local.x},${local.y}`);
}

// Flood the whole local landing pocket through the same canStep used by live
// movement. The field and first lift remain reachable, but no unowned cell may
// wrap around the room behind its authored forward edge.
{
  const start={x:Math.round(built.position.x),y:Math.round(built.position.y)};
  const key=(x,y)=>`${x},${y}`;
  const queue=[start],visited=new Set([key(start.x,start.y)]);
  let escapedBehindRoom=false;
  for(let index=0;index<queue.length;index+=1){
    const at=queue[index],local={x:at.x-origin.x,y:at.y-origin.y};
    const landing=sourceLandingCellAt(local.x,local.y,{portalOpen:true});
    if(local.y>SOURCE_LANDING_FIELD_EDGE_LOCAL_Y&&!landing?.owned)escapedBehindRoom=true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const next={x:at.x+dx,y:at.y+dy},nx=next.x-origin.x,ny=next.y-origin.y,k=key(next.x,next.y);
      if(nx<-30||nx>30||ny<-50||ny>20||visited.has(k))continue;
      if(!runtime.geometry.canStep(at.x,at.y,next.x,next.y).ok)continue;
      visited.add(k);queue.push(next);
    }
  }
  const firstLiftApproach=world({x:0,y:-35});
  assert.ok(visited.has(key(firstLiftApproach.x,firstLiftApproach.y)),'the contained get-in no longer reaches the first lift');
  assert.equal(escapedBehindRoom,false,'the playable field still wraps around the get-in shell');
}

console.log('source landing specs passed');
