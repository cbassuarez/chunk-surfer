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
  sourceEmergencyFrame,
  sourceLandingAuthoredFromLocal,
  sourceLandingCellAt,
  sourceLandingContract,
  sourceLandingDoorPlacements,
  sourceLandingLights,
  sourceLandingLocalFromAuthored,
  sourceLandingPropPlacements,
} from '../src/data/source-landing.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
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

const physicalGetInIds = CONSERVATORY_PROPS
  .filter((prop) => prop.x >= 57.5 && prop.x <= 72.5 && prop.y >= 3.5 && prop.y <= 14.5)
  .filter((prop) => prop.id !== 'dock-chandelier-spent')
  .map((prop) => prop.id);
assert.deepEqual(SOURCE_GET_IN_PROP_IDS, physicalGetInIds, 'the Source copy selects the authored get-in props exactly');
const placements = sourceLandingPropPlacements();
assert.deepEqual(placements.map((entry) => entry.sourcePropId), physicalGetInIds);
assert.equal(new Set(placements.map((entry) => entry.id)).size, placements.length);
assert.deepEqual(SOURCE_GET_IN_DOOR_IDS,[SOURCE_LANDING_REAR_DOOR_ID,SOURCE_LANDING_PORTAL_DOOR_ID]);
const doorPlacements=sourceLandingDoorPlacements();
assert.deepEqual(new Set(doorPlacements.map((entry)=>entry.sourceDoorId)),new Set(SOURCE_GET_IN_DOOR_IDS));
assert.equal(doorPlacements.filter((entry)=>entry.id.includes('door-leaf')).length,3,'the rear pair and the single FOH leaf are reconstructed');
assert.ok(sourceLandingDoorPlacements({x:0,y:0},{portalProgress:1})
  .find((entry)=>entry.sourcePortalLeaf)?.yaw<0,'the FOH leaf visibly swings on interaction');

const portalPlane = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.maxX + 1, y: 13.5 });
assert.equal(sourceLandingCellAt(portalPlane.x, portalPlane.y).solid,true,'the FOH leaf is physical before E');
assert.equal(sourceLandingCellAt(portalPlane.x, portalPlane.y,{portalOpen:true}).opening,true,'the FOH aperture becomes traversable only after opening');
const forwardWall = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.maxX + 1, y: 9.5 });
assert.equal(sourceLandingCellAt(forwardWall.x, forwardWall.y).solid,true,'the rest of the forward wall remains real');
const rearPlane = sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.minX - .1, y: 9.5 });
assert.equal(sourceLandingCellAt(rearPlane.x, rearPlane.y).solid, true, 'the grey-door plane remains sealed behind the player');
assert.ok(SOURCE_LANDING_HUSH_LOCAL.y > SOURCE_LANDING_ENTRY_LOCAL.y);
assert.ok(SOURCE_LANDING_OPENING_LOCAL.y < SOURCE_LANDING_ENTRY_LOCAL.y);
assert.equal(SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,-16,'the field begins at the FOH wall, not behind the room');

assert.deepEqual(sourceEmergencyFrame(1,{reducedEffects:true}),sourceEmergencyFrame(99,{reducedEffects:true}),'reduced effects hold a stable red wash');
assert.notEqual(sourceEmergencyFrame(.1).cycle,sourceEmergencyFrame(.3).cycle,'the maintained circuit has a visible full-effects cycle');

const lights = sourceLandingLights();
const [light,openingLight,liftLight] = lights;
assert.equal(light.kind, 'emergency');
assert.ok(Math.abs(light.x) < .001, 'the seam light is centred on the rear plane');
assert.ok(light.z > 6 * CELL, 'the seam light is behind the arrival position');
assert.deepEqual(lights.map((entry)=>entry.id),[
  'source-landing:getin-grey-door-seam',
  'source-landing:opening-emergency',
  'source-landing:first-lift-emergency',
]);
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
assert.deepEqual(contract.emergencyLightIds,lights.map((entry)=>entry.id));

const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING, { seed: 4417 });
const runtime = createSourceSpaceRuntime({ initialState: built.state });
runtime.setPlayerPosition(built.position);
assert.equal(runtime.textSpaceActive(), false, 'the exact landing remains physically rendered');
assert.equal(runtime.sourceLandingHushFrame().safe, true);
assert.equal(runtime.sourceLandingHushFrame().rear.visible, true);
assert.equal(runtime.sourceScene().weather.rain, 1);
assert.equal(runtime.sourceScene().weather.moon, 1);
assert.equal(runtime.sourceScene().weather.clouds, 1);
assert.equal(runtime.localLights().length,3,'the landing and first lift retain emergency illumination with the torch off');
const preLiftProps=runtime.propInstances(built.position.x,built.position.y,{reducedMotion:true});
assert.ok(preLiftProps.some((entry)=>entry.sourceConnector==='landing-opening'),'the opening has an always-on fixture casing');
assert.ok(preLiftProps.some((entry)=>entry.sourceConnector==='lift-fork'),'the first lift is rendered before the text field activates');

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
const cinematicProps=runtime.propInstances(portalWorld.x,portalWorld.y,{reducedMotion:true});
assert.ok(cinematicProps.some((entry)=>entry.sourceConnector==='foh-source-aperture'),'the opening grows impossible nested depth without changing the opposite wall');

for(const local of [{x:0,y:18},{x:14,y:16},{x:20,y:0},{x:-20,y:0}]){
  const point=world(local);
  assert.equal(runtime.geometry.cellAt(point.x,point.y),null,`generic ground survives beside/behind the get-in at ${local.x},${local.y}`);
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
