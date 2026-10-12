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
  .filter((prop) => (prop.x >= 57.5 && prop.x <= 73.5 && prop.y >= 3.5 && prop.y <= 14.5) || prop.id === 'dock-scene-roof')
  .filter((prop) => !SOURCE_COPY_SKIPS.includes(prop.id))
  .map((prop) => prop.id);
assert.deepEqual(SOURCE_GET_IN_PROP_IDS, physicalGetInIds, 'the Source copy selects the authored get-in props exactly');
for (const skipped of SOURCE_COPY_SKIPS) {
  assert.ok(!SOURCE_GET_IN_PROP_IDS.includes(skipped), `${skipped} must not be rebuilt in Source`);
}
const placements = sourceLandingPropPlacements();
assert.deepEqual(placements.filter((entry)=>physicalGetInIds.includes(entry.sourcePropId)).map((entry)=>entry.sourcePropId),physicalGetInIds);
assert.ok(placements.some((entry)=>entry.semantic==='dock-practical-fitting'));
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
const fohLight = lights.find((entry)=>entry.id==='source-landing:foh-work-light');
assert.equal(fohLight.kind,'fitting');
assert.equal(fohLight.sourceDockOnly,true,'FOH practical cannot appear before the reconstructed room');
assert.equal(fohLight.x,SOURCE_LANDING_PORTAL_LOCAL.x*CELL);
assert.ok(fohLight.z>SOURCE_LANDING_PORTAL_LOCAL.y*CELL,'closed-door light sits on the room side');
assert.ok(fohLight.intensity<2&&fohLight.radius<=14,'work light stays a local practical, not a full-scene wash');
const thresholdLight = lights.find((entry)=>entry.id===SOURCE_THRESHOLD_LIGHT_ID);
const openingLight = lights.find((entry)=>entry.id==='source-landing:opening-emergency');
const liftLight = lights.find((entry)=>entry.id==='source-landing:first-lift-emergency');
// The first nothingness has no emergency lamp run or path lighting.
assert.deepEqual(sourceApproachLights(),[]);
assert.equal(lights.filter((entry)=>entry.id.startsWith('source-approach-emergency-')).length,0);
assert.equal(light.kind, 'fitting','the Scene Dock seam is not on Source emergency power');
assert.deepEqual(light.color,[1,.43,.16],'the Scene Dock seam lost its authored sodium colour');
assert.equal(light.intensity,.34,'the Scene Dock seam was promoted to an alarm-strength source');
assert.ok(Math.abs(light.x) < .001, 'the seam light is centred on the rear plane');
assert.ok(light.z > 6 * CELL, 'the seam light is behind the arrival position');
assert.deepEqual(lights.slice(0,5).map((entry)=>entry.id),[
  'source-landing:getin-grey-door-seam',
  'source-landing:foh-work-light',
  SOURCE_THRESHOLD_LIGHT_ID,
  'source-landing:opening-emergency',
  'source-landing:first-lift-emergency',
]);
assert.deepEqual(thresholdLight.color,[1,1,1],'the door cinematic practical is not white');
assert.ok(thresholdLight.intensity<=1.5&&thresholdLight.radius<=8,'white threshold spill must stay local');
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
assert.equal(runtime.sourceScene().weather.rain, 0, 'the remembered roof keeps rain out of the room');
assert.equal(runtime.sourceScene().weather.moon, 1);
assert.equal(runtime.sourceScene().weather.clouds, 1);
// The landing preset starts inside the Scene Dock. No red source — including
// the wide approach run — is even submitted on this side of FOH.
const runtimeLights=runtime.localLights();
assert.ok(runtimeLights.some((entry)=>entry.id==='source-landing:desk-light'));
assert.ok(runtimeLights.some((entry)=>entry.id==='source-landing:cage-light'));
assert.ok(runtimeLights.every((entry)=>entry.kind!=='emergency'),'the Scene Dock still submits red emergency lighting');
assert.equal(runtime.sourceEmergencyLightingFrame().active,false,'the Scene Dock still enables the full-frame red wash');
const preLiftProps=runtime.propInstances(built.position.x,built.position.y,{reducedMotion:true});
assert.ok(!preLiftProps.some((entry)=>entry.mesh==='tower_bulkhead'&&!['hall-practical-fitting','dock-practical-fitting'].includes(entry.semantic)),
  'the FOH door still opens into a bulkhead wall');
assert.ok(!preLiftProps.some((entry)=>entry.sourceConnector==='chute-fork'),
  'Source proper is visible before the thirty-second white walk');
// The first ascent is a broad physical deck, rendered independently from
// later Source. No staircase/proxy is submitted during the first nothingness.
const outside={x:built.state.landscapeOrigin.x+8,y:built.state.landscapeOrigin.y-200};
runtime.setPlayerPosition(outside);
assert.equal(runtime.sourceShoreFrame().active,true);
assert.equal(runtime.sourceShoreFrame().lift.top,4.2);
assert.equal(runtime.propInstances(outside.x,outside.y,{reducedMotion:true}).some((entry)=>entry.sourceConnector==='chute-fork'||entry.sourceVoidHorizon||entry.sourceStructure),false);
runtime.setPlayerPosition(built.position);

const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const sourceWorldBranch=mainSource.slice(mainSource.indexOf('function worldRenderInstances'),mainSource.indexOf('function syncSourceRender'));
assert.match(sourceWorldBranch,/if\(usingSourceSpace\(\)\)[\s\S]*?r3dSetEmergencyShadows\?\.\(\[\]\)/,
  'Source submits no apparition or emergency-shadow instance');

const origin=built.state.landscapeOrigin;
const world=(point)=>({x:origin.x+point.x,y:origin.y+point.y});
const portalWorld=world(SOURCE_LANDING_PORTAL_LOCAL);
assert.ok(runtime.geometry.cellAt(portalWorld.x,portalWorld.y),'permanent aperture remains floor');
assert.equal(runtime.geometry.canStep(portalWorld.x,portalWorld.y+1,portalWorld.x,portalWorld.y-1).ok,false,'closed leaf blocks crossing');
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

// The room remains finite, but dependable invisible support continues around
// its exterior. Walking beside or behind it is an honest choice, not a wall.
for(const local of [{x:14,y:16},{x:20,y:0},{x:-20,y:0},{x:14,y:18}]){
  const at=world(local);
  assert.equal(runtime.geometry.cellAt(at.x,at.y)?.sourceShore,true,`the free lower plane is missing at ${local.x},${local.y}`);
  assert.equal(runtime.geometry.floorAt(at.x,at.y),0);
}
assert.ok(contract.shore.bank.underside>0,'the far bank has a real suspended underside');
assert.equal(contract.shore.lift.top,4.2);
assert.equal(runtime.state().landingDoorSealed,false,'leaving the room must not remove the way back');

console.log('source landing specs passed');
