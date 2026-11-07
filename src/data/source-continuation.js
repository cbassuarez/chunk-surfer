import {GAIT_SPEED} from '../game/locomotion.js';
import {SOURCE_EARTHFALL} from './source-earthfall.js';
import {SOURCE_JOURNEY,JOURNEY_SURFACES,JOURNEY_JOINT_SOLIDS,JOURNEY_DOORS,JOURNEY_FOLDS,JOURNEY_PROPS,JOURNEY_ARRIVAL_ANCHORS,JOURNEY_REFUGES} from './source-continuation-journey.js';
import {SOURCE_REST_ALCOVE_SOLIDS} from './source-rest-alcove.js';
import {corridorCollisionSolids,SOURCE_CONNECTOR_CORRIDOR} from './source-connector-corridor.js';

// One persistent construction in local metres. Both Sources and their threshold
// exist together; phase names describe the journey, not which floor is drawn.
const freeze = Object.freeze;
const TAU = Math.PI * 2;
export const CONTINUATION_CATCH_STAGES = freeze([
  { level: 0, id: 'case-crescent', name: 'The open case', y: 8.4, innerRadius: 6.2, outerRadius: 13, startAngle: -1.35, endAngle: 1.35, material: 'case-lining', construction: 'case', refugeAngle: .92 },
  { level: 1, id: 'soundboard-fan', name: 'The soundboard', y: 2.4, innerRadius: 4.2, outerRadius: 12.5, startAngle: -.35, endAngle: Math.PI, material: 'piano-wood', construction: 'soundboard', refugeAngle: 2.35 },
  { level: 2, id: 'masonry-counterarc', name: 'The counterarc', y: -4.8, innerRadius: 2.6, outerRadius: 11.5, startAngle: 2.5, endAngle: Math.PI * 1.5, material: 'cold-stone', construction: 'masonry', refugeAngle: 4.13 },
  { level: 3, id: 'binding-dish', name: 'The binding', y: -12.6, innerRadius: 1.2, outerRadius: 9.8, startAngle: -Math.PI / 2, endAngle: 2.75, material: 'case-lining', construction: 'binding', refugeAngle: .9 },
]);
export const SOURCE_CONTINUATION = freeze({
  version: 1, layoutVersion: 4, encounterId: 'source-wrong-return-catch', walkSpeed: GAIT_SPEED.walk, place: 'interior', bodySpeedLimit: 3.2,
  eyeHeight: 1.62, bodyRadius: .22, bodyHeight: 1.9, maximumStep: .45, gravity: 9.8,
  fixedStep: 1 / 120, jumpSpeed:4.45,doorSwingSeconds: .65, doorPassFraction: .85, doorApproachDistance: 6.5,
  recoverySeconds: 1.6, recoveryMaximumSeconds: 12, recoverySpeed: 6, recoveryRise: 3,
  revealSeconds: 0, graceSeconds: 3, bounds: {...SOURCE_JOURNEY.bounds},
  hush: freeze({ warningSeconds: 4.5, noticeSeconds: .8, teachingSpeed: 2.15, speed: GAIT_SPEED.jog, radius: .26, contactDistance: .7, refugeStandOff: 2.8,
    entryDelaySeconds:6,entryOutsideMetres:1.1,thresholdArrivalDelaySeconds:3,thresholdNoticeSeconds:2.5 }),
  spawn: freeze({ x: 0, z: 2, feet: 0, yaw: 0, pitch: 0 }),
  wrongReturn: freeze({ transferX: -18, warningSeconds: 6, closureSpeed: .62,
    pressureDelay: 12, closureStartX: 16.5, closureEndX: -15.5,
    refuge: { x: 0, z: -19, feet: 8.4 }, threshold: { ...SOURCE_JOURNEY.gate,doorId:'journey-catch-gate' } }),
  catch: freeze({ center: { x: -172, z: -92 },offset:{...SOURCE_JOURNEY.catchOffset},top: 8.4, layerDrop: 6,
    levels: CONTINUATION_CATCH_STAGES.length, ringHalfExtent: 13,
    outer: { minX: -187, maxX: -157, minZ: -107, maxZ: -77 },
    centers: CONTINUATION_CATCH_STAGES.map(() => ({ x: -172, z: -92 })),
    finalApproach: { x: -140.3, z: -92, feet: -12.6, yaw: Math.PI / 2, pitch: 0 },
    finalDoor: { x: -139, z: -92, y: -12.6 },
    refuge: { x: -172 + Math.cos(.92) * 14.25, z: -92 + Math.sin(.92) * 14.25 }, counterweightRadius: .72,
    counterweightSpeed: 1.15, counterweightWarningSeconds: 6,
    hoist: { shaft: { x: -188, z: -92 }, start: { x: -164.29, z: -83.27 },
      travelY: 13.5, railY: 16.3, drumHeight: 1.451, drumRadius: .73, clearance: .2,
      returnSpeed: 2, upSpeed: 4.5, traverseSpeed: 4, downSpeed: 1.8,
      rewindSeconds: 1.8, loweringWarningSeconds: 4 },
  }),
});
const C = SOURCE_CONTINUATION;
export const CONTINUATION_SEAT_ISLAND = freeze({x:-193,z:-106,feet:-4.8,level:2,chartId:0});
export const continuationCatchFloor = level => CONTINUATION_CATCH_STAGES[Math.min(3, Math.max(0, Math.round(level)))]?.y ?? -12.6;
export const continuationStage = level => CONTINUATION_CATCH_STAGES[Math.min(3, Math.max(0, Math.round(Number(level) || 0)))];
export function continuationRadialPoint(radius, angle) { return { x: C.catch.center.x + Math.cos(angle) * radius, z: C.catch.center.z + Math.sin(angle) * radius }; }
const rect = (id, phase, minX, maxX, minZ, maxZ, y, extra = {}) => ({ id, phase, region: phase, kind: 'rect', minX, maxX, minZ, maxZ, y, thickness: .35, material: 'cold-stone', ...extra });
const ii = (id, bounds, y, extra = {}) => rect(id, 'wrong-return', ...bounds, y, extra);
const wrongSurfaces = [
  ii('wrong-entry', [-4, 4, -4, .5], 0, { role: 'entry', construction: 'entry-folio' }),
  ii('wrong-entry-throat', [-1.8, 1.8, .5, 5], 0, { role: 'transfer', construction: 'entry-folio' }),
  ii('wrong-ground-cross', [-12, 18, -5, -1], 0, { role: 'exploration', construction: 'case-spine' }),
  ii('wrong-ground-west', [-12, -8, -32, -3], 0, { role: 'exploration', construction: 'masonry' }),
  ii('wrong-ground-east', [14, 18, -32, -3], 0, { role: 'exploration', construction: 'soundboard' }),
  ii('wrong-ground-north', [-12, 18, -35, -29], 0, { role: 'exploration', construction: 'binding' }),
  ii('wrong-ground-branch', [-12, 18, -25, -19], 0, { role: 'branch', construction: 'masonry' }),
  ii('wrong-east-stair-foot', [14, 22, -9, -5], 0, { role: 'stair-foot' }),
  ii('wrong-mid-east-head', [13, 22, -33, -27], 4.2, { role: 'landing', material: 'piano-wood' }),
  ii('wrong-mid-north', [-10, 19, -33, -29], 4.2, { role: 'exploration', material: 'piano-wood' }),
  ii('wrong-mid-west', [-10, -6, -31, -7], 4.2, { role: 'exploration', material: 'case-lining' }),
  ii('wrong-mid-south', [-15, 26, -9, -5], 4.2, { role: 'return', material: 'case-lining' }),
  ii('wrong-mid-branch', [-6, 13, -22, -18], 4.2, { role: 'branch', material: 'piano-wood' }),
  ii('wrong-mid-east', [9, 13, -30, -7], 4.2, { role: 'exploration', material: 'piano-wood' }),
  ii('wrong-west-stair-foot', [-15, -6, -11, -5], 4.2, { role: 'stair-foot', material: 'case-lining' }),
  ii('wrong-upper-west-head', [-18, -6, -33, -27], 8.4, { role: 'landing' }),
  ii('wrong-upper-west', [-18, -15, -31, -22], 8.4, { role: 'exploration' }),
  ii('wrong-upper-cross', [-18, 4.5, -14, -10], 8.4, { role: 'return', material: 'case-lining' }),
  ii('wrong-upper-cross-inbound', [5, 18, -14, -10], 8.4, { role: 'return', material: 'case-lining' }),
  ii('wrong-upper-north', [-18, 26, -35, -31], 8.4, { role: 'exploration' }),
  ii('wrong-upper-east', [14, 18, -33, -14], 8.4, { role: 'exploration' }),
  ii('wrong-upper-east-head', [14, 26, -33, -27], 8.4, { role: 'landing' }),
  ii('wrong-upper-refuge', [-4, 4, -23, -13], 8.4, { role: 'refuge', material: 'piano-wood' }),
  ii('wrong-overlook-arm', [5, 8, -12, 5], 8.4, { role: 'false-return', material: 'case-lining' }),
  ii('wrong-overlook-return-arm', [3.5, 4.5, -21, 3.4], 8.4, { role: 'return', material: 'piano-wood' }),
  ii('wrong-false-porch', [3.5, 9, 1, 6], 8.4, { role: 'false-return', material: 'case-lining' }),
];
// Real treads, rather than ramps with a staircase painted on them. Three
// interlocked flights have separate supports and readable over/under joints.
function stairs(id, minX, maxX, lowY, highY, northHigh) {
  const minZ = -29, maxZ = -9, n = 14, run = (maxZ - minZ) / n;
  return Array.from({ length: n }, (_, k) => ii(`${id}-${k}`, [minX, maxX, minZ + k * run, minZ + (k + 1) * run], northHigh ? highY - (highY - lowY) * k / n : lowY + (highY - lowY) * (k + 1) / n,
    { role: 'stair', construction: 'interlocked-stair', stairId: id, step: k, thickness: .24, material: 'piano-wood' }));
}
wrongSurfaces.push(...stairs('wrong-east-stair', 18, 22, 0, 4.2, true), ...stairs('wrong-west-stair', -14, -10, 4.2, 8.4, true), ...stairs('wrong-return-stair', 22, 26, 4.2, 8.4, true));
const bridge = rect('catch-entry-bridge', 'catch', -159.2, -151.8, -93.1, -90.9, 8.4, { level: 0, role: 'transfer', material: 'case-lining', construction: 'hinge' });
const catchSurfaces = [bridge];
for (const stage of CONTINUATION_CATCH_STAGES) {
  const { x, z } = C.catch.center, r = stage.outerRadius;
  catchSurfaces.push({ id: `catch-${stage.level}-${stage.id}`, phase: 'catch', region: 'catch', kind: 'sector', center: { x, z }, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r,
    innerRadius: stage.innerRadius, outerRadius: r, startAngle: stage.startAngle, endAngle: stage.endAngle, y: stage.y, thickness: .48,
    level: stage.level, role: 'catch', material: stage.material, construction: stage.construction, angularSegments: 48 });
  const refuge = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
  // The refuge is a visibly separate pocket on the outside of the machinery's
  // path. Its neck deliberately overlaps the radial slab, with no gap bridge.
  const neck = continuationRadialPoint(stage.outerRadius - .55, stage.refugeAngle);
  const radius = 1.45;
  catchSurfaces.push(rect(`catch-${stage.level}-return-pad`, 'catch', refuge.x - radius, refuge.x + radius, refuge.z - radius, refuge.z + radius, stage.y,
    { level: stage.level, role: 'refuge', material: 'case-lining', construction: 'case' }));
  catchSurfaces.push(rect(`catch-${stage.level}-return-arm`, 'catch', Math.min(neck.x, refuge.x) - .9, Math.max(neck.x, refuge.x) + .9, Math.min(neck.z, refuge.z) - .9, Math.max(neck.z, refuge.z) + .9, stage.y,
    { level: stage.level, role: 'return-arm', material: 'piano-wood', construction: 'binding' }));
}
// A release over the missing wedge is safe, but it does not receive the main
// floor. Its small catch leads out along one narrow spoke, then around the
// outside of the missing wedge. The footprint is visible before committing.
export const CONTINUATION_RETURN_CATCHES = freeze([
  { level: 1, angle: -.92, landingRadius: 5.32, joinAngle: -.2 },
  { level: 2, angle: 2.1, landingRadius: 3.24, joinAngle: 2.65 },
  { level: 3, angle: 3.35, landingRadius: 1.6, joinAngle: 2.6 },
]);
for (const branch of CONTINUATION_RETURN_CATCHES) {
  const stage = CONTINUATION_CATCH_STAGES[branch.level], at = continuationRadialPoint(branch.landingRadius, branch.angle);
  const pocketRadius = .64, neckRadius = stage.outerRadius - .7;
  catchSurfaces.push(rect(`catch-${branch.level}-wrong-pocket`, 'catch', at.x-pocketRadius, at.x+pocketRadius, at.z-pocketRadius, at.z+pocketRadius, stage.y,
    {level:stage.level, role:'wrong-catch', material:'case-lining', construction:'case'}));
  // Short overlapping tread plates form a physically continuous diagonal neck.
  const count = Math.ceil((neckRadius-branch.landingRadius)/.45);
  for(let k=0;k<=count;k++) {
    const p=continuationRadialPoint(branch.landingRadius+(neckRadius-branch.landingRadius)*k/count,branch.angle);
    catchSurfaces.push(rect(`catch-${branch.level}-wrong-neck-${k}`, 'catch', p.x-.49,p.x+.49,p.z-.49,p.z+.49,stage.y,
      {level:stage.level,role:'wrong-catch-neck',material:'piano-wood',construction:'binding'}));
  }
  const radius=stage.outerRadius;
  catchSurfaces.push({id:`catch-${branch.level}-wrong-return-arc`,phase:'catch',region:'catch',kind:'sector',center:{...C.catch.center},
    minX:C.catch.center.x-radius,maxX:C.catch.center.x+radius,minZ:C.catch.center.z-radius,maxZ:C.catch.center.z+radius,
    innerRadius:radius-1.4,outerRadius:radius,startAngle:Math.min(branch.angle,branch.joinAngle)-.045,endAngle:Math.max(branch.angle,branch.joinAngle)+.045,
    y:stage.y,thickness:.35,level:stage.level,role:'wrong-catch-return',material:'case-lining',construction:'binding',angularSegments:24});
}
// The spindle is one island in an archipelago. Narrow causeways join distinct
// floating destinations; all are real supports, including the quiet detours.
// Their varying silhouettes and cuts leave the void visible between them.
const island=(id,bounds,y,level,role='island')=>catchSurfaces.push(rect(id,'catch',...bounds,y,
  {level,role,material:'cold-stone',construction:'masonry',thickness:.72}));
const causeway=(id,bounds,y,level)=>catchSurfaces.push(rect(id,'catch',...bounds,y,
  {level,role:'island-causeway',material:'piano-wood',construction:'binding',thickness:.28}));
// The counterarc's return pocket leads to the separate listening island.
causeway('catch-seat-causeway',[-190,-179,-99,-97],-4.8,2);
causeway('catch-seat-causeway-bend',[-190,-188,-103,-97],-4.8,2);
island('catch-seat-island',[-197,-189,-110,-101],-4.8,2,'seat-island');
// A route of two intermediary islands leads east to the unmistakable door.
causeway('catch-final-balcony',[-167.5,-157,-93.2,-90.8],-12.6,3);
island('catch-east-island',[-158,-151,-96,-88],-12.6,3);
causeway('catch-east-causeway',[-152,-142,-93.2,-90.8],-12.6,3);
island('catch-door-island',[-143,-135,-97,-87],-12.6,3,'door-island');
// Two other destinations make this a place to navigate, not a single pier.
causeway('catch-north-causeway',[-168,-166,-111,-99],-12.6,3);
island('catch-north-island',[-171,-163,-118,-110],-12.6,3);
causeway('catch-south-causeway',[-173,-171,-83,-74],-12.6,3);
island('catch-south-island',[-176,-168,-75,-68],-12.6,3);
// Farther islands remain connected at the real height of their own layer, so
// landing on one cannot leave the player stranded on an unearned floor.
causeway('catch-upper-satellite-way',[-192,-163,-81.6,-79.6],8.4,0);
island('catch-upper-satellite',[-196,-190,-82,-76],8.4,0);
causeway('catch-lower-satellite-way',[-201,-170,-116.8,-114.8],-12.6,3);
island('catch-lower-satellite',[-204,-198,-119,-113],-12.6,3);
causeway('catch-far-satellite-way',[-193,-148,-107,-105],-4.8,2);
causeway('catch-far-satellite-bend',[-150,-148,-111,-105],-4.8,2);
island('catch-far-satellite',[-151,-145,-115,-109],-4.8,2);
const wall = (id, minX, maxX, minZ, maxZ, minY, maxY, extra = {}) => ({ id, phase: 'wrong-return', region: 'wrong-return', minX, maxX, minZ, maxZ, minY, maxY, material: 'cold-wall', ...extra });
const walls = [
  wall('wrong-entry-back-west', -1.8, -1.58, 3.38, 3.62, 0, 3.3), wall('wrong-entry-back-east', 1.58, 1.8, 3.38, 3.62, 0, 3.3),
  wall('wrong-entry-return-jamb-west', -1.59, -1.5, 3.35, 3.65, 0, 3.3), wall('wrong-entry-return-jamb-east', 1.5, 1.59, 3.35, 3.65, 0, 3.3),
  ...[1, 1.4, 1.8, 2.2, 2.6, 2.9, 3.35, 3.75, 4.15, 4.55, 4.95, 5.35, 5.75, 6].map((z, i) => wall(`wrong-overlook-post-${i}`, 3.5, 3.56, z - .03, z + .03, 8.4, 9.15, { role: 'overlook-rail', material: 'worn-metal' })),
  wall('wrong-overlook-toprail-near', 3.5, 3.56, 1, 2.93, 9.1, 9.15, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-overlook-toprail-far', 3.5, 3.56, 3.32, 6, 9.1, 9.15, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-overlook-kickstrip', 3.5, 3.56, 1, 6, 8.4, 8.45, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-onward-jamb-north', -18.15, -17.85, -13.18, -12.9, 8.4, 11.2), wall('wrong-onward-jamb-south', -18.15, -17.85, -11.1, -10.82, 8.4, 11.2),
  wall('source-spindle', -172.42, -171.58, -92.42, -91.58, -20, 18, { phase: 'catch', region: 'catch', role: 'spindle', material: 'dark-metal' }),
  ...[-3.02, 3.02].map((x, i) => wall(`ii-entry-arch-pier-${i}`, x - .25, x + .25, -4.36, -3.64, 0, 2.9, { role: 'arch-pier' })),
  ...[-25.02, -18.98].map((z, i) => wall(`ii-mid-arch-pier-${i}`, 9.64, 10.36, z - .25, z + .25, 4.2, 7.1, { role: 'arch-pier' })),
  ...[-3.02, 3.02].map((x, i) => wall(`ii-refuge-arch-pier-${i}`, x - .25, x + .25, -19.36, -18.64, 8.4, 11.3, { role: 'arch-pier' })),
];
const door = (id, phase, x, y, z, yaw, role, extra = {}) => ({ id, phase, region: phase, x, y, z, yaw, role, width: 1.8, height: 2.3, ...extra });
const doors = [
  door('wrong-entry-return', 'wrong-return', 0, 0, 3.5, 0, 'return', { width: 3, height: 3.05, normal: { x: 0, z: 1 } }),
  door('wrong-false-return', 'wrong-return', 6, 8.4, 3.5, 0, 'false-return'),
  door('wrong-onward', 'wrong-return', -18, 8.4, -12, -Math.PI / 2, 'onward', { journeyEntrance: true }),
  door('journey-catch-gate','wrong-return',SOURCE_JOURNEY.gate.x,SOURCE_JOURNEY.gate.y,SOURCE_JOURNEY.gate.z,-Math.PI/2,'onward',{threshold:true,chartId:4}),
  ...JOURNEY_DOORS,
  ...CONTINUATION_CATCH_STAGES.map(stage => {
    const at = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
    const normal = { x: Math.cos(stage.refugeAngle), z: Math.sin(stage.refugeAngle) };
    return door(`catch-return-${stage.level}`, 'catch', at.x + normal.x * .9, stage.y, at.z + normal.z * .9, stage.refugeAngle - Math.PI / 2, 'return', { level: stage.level, normal });
  }),
  door('catch-final', 'catch', C.catch.finalDoor.x, C.catch.finalDoor.y, C.catch.finalDoor.z, Math.PI / 2, 'final', { level: 3 }),
];
// The route behind the shared door remains real after ownership changes.
// The return plane commits before the player reaches this former owner's
// territory; retaining it makes looking back accountable, not a new branch.
const entrance = doors.find(d => d.id === 'wrong-entry-return');
const inheritedOffset = { x: entrance.x, y: entrance.y - SOURCE_EARTHFALL.lowerFloor, z: entrance.z - SOURCE_EARTHFALL.passage.exitZ };
const throatEnd = wrongSurfaces.find(s => s.id === 'wrong-entry-throat').maxZ;
export const CONTINUATION_EARTHFALL_BACKSIDE = freeze([
  rect('inherited-earthfall-spine', 'wrong-return', inheritedOffset.x - SOURCE_EARTHFALL.passage.halfWidth, inheritedOffset.x + SOURCE_EARTHFALL.passage.halfWidth,
    throatEnd, SOURCE_EARTHFALL.catch.minZ + .5 + inheritedOffset.z, SOURCE_EARTHFALL.lowerFloor + inheritedOffset.y,
    { role: 'inherited-earthfall', construction: 'former-lower-path', thickness: .55, material: 'source' }),
  rect('inherited-earthfall-landing', 'wrong-return', SOURCE_EARTHFALL.catch.minX + inheritedOffset.x, SOURCE_EARTHFALL.catch.maxX + inheritedOffset.x,
    SOURCE_EARTHFALL.catch.minZ + inheritedOffset.z, SOURCE_EARTHFALL.catch.maxZ + inheritedOffset.z, SOURCE_EARTHFALL.lowerFloor + inheritedOffset.y,
    { role: 'inherited-earthfall', construction: 'former-landing-head', thickness: SOURCE_EARTHFALL.catch.thickness, material: 'earthfall-backing' }),
]);
const allSurfaces = freeze([...wrongSurfaces,...JOURNEY_SURFACES, ...catchSurfaces, ...CONTINUATION_EARTHFALL_BACKSIDE]);

const makeLip = (level, angle, suffix = '') => {
  const stage = continuationStage(level), at = continuationRadialPoint(stage.innerRadius + .26, angle);
  return { id: `catch-lip-${level}${suffix}`, level, ...at, dx: -Math.cos(angle), dz: -Math.sin(angle), approachAngle: angle };
};
export const CONTINUATION_DROP_LIPS = freeze([makeLip(0, 0), makeLip(1, Math.PI), makeLip(2, 2.6)]);
export const CONTINUATION_ALTERNATE_LIPS = freeze([makeLip(0, -.92, '-other'), makeLip(1, 2.1, '-other'), makeLip(2, 3.35, '-other')]);
const props = [
  { id: 'wrong-remembered-entry', phase: 'wrong-return', kind: 'seam', x: -.9, y: 1.1, z: 3.45, role: 'remembered-entry' },
  ...[...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].map(p => ({ ...p, phase: 'catch', kind: 'release-lip', y: continuationCatchFloor(p.level) + .025, role: 'drop' })),
];
// Model anatomy is assigned a support rather than scattered as scenery. These
// low, open native assemblies visibly carry selected exploration platforms;
// the dedicated architecture pack supplies curved sectors and their brackets.
export const CONTINUATION_ASSEMBLIES = freeze([
  { id: 'ii-open-case-ground', mesh: 'source_ii_case_floor', supportId: 'wrong-ground-cross', x: 3, y: -.2225 * 12, z: -3, yaw: 0, scaleX: 12, scaleY: 12, scaleZ: 12, orientation: 'upright', role: 'structural-case' },
  { id: 'ii-piano-mid', mesh: 'source_ii_piano_soundboard', supportId: 'wrong-mid-branch', x: 3, y: 4.2 - 1.1375 * 7, z: -20, yaw: Math.PI / 2, scaleX: 7, scaleY: 7, scaleZ: 7, orientation: 'upright', role: 'structural-soundboard' },
  { id: 'ii-tower-return', mesh: 'source_ii_tower_cap', supportId: 'wrong-upper-north', x: 3, y: 8.4 - 2.77 * 2, z: -33, yaw: 0, scaleX: 3.4, scaleY: 2, scaleZ: 1, orientation: 'upright', role: 'structural-frame' },
  { id: 'ii-ellery-bank', mesh: 'source_ii_ellery_bay', x: 31, y: -8, z: -46, yaw: 0, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'upright', role: 'remembered-architecture' },
  { id: 'ii-ellery-overhead', mesh: 'source_ii_ellery_corner', x: 3, y: 12, z: -48.5, yaw: 0, roll: Math.PI / 2, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'sideways', role: 'remembered-architecture' },
  { id: 'iii-chapel-inverted-bank', mesh: 'source_ii_chapel_buttress', x: -191, y: 3.5, z: -92, yaw: 0, roll: Math.PI, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'inverted', role: 'remembered-architecture' },
  { id: 'ii-whole-piano-bank', mesh: 'grand_piano', x: 15, y: -1, z: -54, yaw: 0, scaleX: 8, scaleY: 8, scaleZ: 8, orientation: 'upright', role: 'model-bank' },
  { id: 'ii-whole-case-bank', mesh: 'open_instrument_case', x: -20, y: -5, z: -3, yaw: 0, roll: Math.PI / 2, scaleX: 8, scaleY: 8, scaleZ: 8, orientation: 'sideways', role: 'model-bank' },
]);
export const CONTINUATION_STRUCTURAL_LINKS = freeze([
  { id: 'ii-stair-east', kind: 'stair', x: 20, z: -19, minZ: -29, maxZ: -9, minX: 18, maxX: 22, y0: 0, y1: 4.2, steps: 14 },
  { id: 'ii-stair-west', kind: 'stair', x: -12, z: -19, minZ: -29, maxZ: -9, minX: -14, maxX: -10, y0: 4.2, y1: 8.4, steps: 14 },
  { id: 'ii-stair-return', kind: 'stair', x: 24, z: -19, minZ: -29, maxZ: -9, minX: 22, maxX: 26, y0: 4.2, y1: 8.4, steps: 14 },
]);
export const CONTINUATION_SIGHTLINES = freeze({
  upperReturn: { eye: { x: 3.85, y: 10.02, z: 3 }, target: { x: 0, y: 1.25, z: 3.5 }, feet: 8.4, purpose: 'The original entry is physically visible through the narrow open bar window at the west edge.' },
});
export const SOURCE_CONTINUATION_ROUTES = freeze({
  main: [[0, 2], [0, -3], [16, -3], [16, -7], [20, -7], [20, -30], [-8, -30], [-8, -7], [-12, -7], [-12, -30], [-16, -30], [-16,-33], [16,-33], [16,-12], [6,-12], [6,3], [3.85,3], [3.85,-20], [0,-20], [0,-12], [-16.5,-12]],
  groundBranch: [[0, -3], [-10, -3], [-10, -22], [16, -22], [16, -7]],
  upperReturn: [[16,-12], [6,-12], [6,3], [3.85,3], [3.85,-20], [0,-20], [0,-12], [-16.5,-12]],
  stairLoop: [[-16, -30], [-16, -33], [16, -33], [24, -33], [24, -7], [-8, -7]],
});
export function continuationSurfaceY(surface, x, z) {
  if (surface.kind !== 'ramp') return surface.y;
  const t = Math.max(0, Math.min(1, ((surface.axis === 'x' ? x : z) - (surface.axis === 'x' ? surface.minX : surface.minZ)) / ((surface.axis === 'x' ? surface.maxX : surface.maxZ) - (surface.axis === 'x' ? surface.minX : surface.minZ))));
  return surface.y0 + (surface.y1 - surface.y0) * t;
}
export const continuationSectorSteps=surface=>Math.max(16,Math.ceil((surface.endAngle-surface.startAngle)/.055));
export function continuationSurfaceContains(surface, x, z, margin = 0) {
  if (surface.kind !== 'sector') return x >= surface.minX + margin && x <= surface.maxX - margin && z >= surface.minZ + margin && z <= surface.maxZ - margin;
  const dx = x - surface.center.x, dz = z - surface.center.z, r = Math.hypot(dx, dz), raw = Math.atan2(dz, dx), span = surface.endAngle - surface.startAngle;
  let a = raw; while (a < surface.startAngle) a += TAU; while (a > surface.startAngle + TAU) a -= TAU;
  const angularMargin = r > 0 ? Math.asin(Math.min(1, Math.max(0, margin) / r)) : 0;
  const steps=continuationSectorSteps(surface),delta=span/steps,k=Math.max(0,Math.min(steps-1,Math.floor((a-surface.startAngle)/delta))),offset=a-(surface.startAngle+(k+.5)*delta),projection=r*Math.cos(offset);
  return projection >= surface.innerRadius*Math.cos(delta/2)+margin-1e-7 && projection <= surface.outerRadius*Math.cos(delta/2)-margin+1e-7 && a >= surface.startAngle + angularMargin - 1e-7 && a <= surface.startAngle + span - angularMargin + 1e-7;
}
// Always persistent: callers must not remove the place behind the player.
export const continuationSurfaces = value =>Number.isInteger(value?.chartId)?allSurfaces.filter(s=>(s.chartId??0)===value.chartId):allSurfaces;
export const continuationChartId=value=>Number.isInteger(value?.chartId)?value.chartId:0;
export const continuationChartSurfaces=value=>allSurfaces.filter(s=>(s.chartId??0)===continuationChartId(value));
export function continuationSolids(value = {}) {
  const result = [...walls,...JOURNEY_JOINT_SOLIDS,...SOURCE_REST_ALCOVE_SOLIDS,...corridorCollisionSolids(value)];
  if (value.closure?.mode === 'closing') { const x = Number(value.closure.frontX) || 0; result.push(wall('wrong-closing-front', x - .16, x + .16, -14, -10, 8.4, 11.4, { role: 'closure', material: 'dark-metal' })); }
  return Number.isInteger(value?.chartId)?result.filter(s=>(s.chartId??0)===value.chartId):result;
}
export const continuationDoors = () => doors;
export const continuationChartDoors=value=>doors.filter(d=>(d.chartId??0)===continuationChartId(value));
export const continuationChartSolids=value=>continuationSolids(value).filter(s=>(s.chartId??0)===continuationChartId(value));
export const continuationProps = () => [...props,...JOURNEY_PROPS];
export const continuationFolds=()=>JOURNEY_FOLDS;
export const continuationArrivalAnchors=()=>[...JOURNEY_ARRIVAL_ANCHORS,SOURCE_CONNECTOR_CORRIDOR.anchor];
export function continuationSupportAt(x, z, value = {}, options = {}) {
  const feet = Number.isFinite(options.feet) ? options.feet : Number.isFinite(value.feet) ? value.feet : 0;
  const maxY = options.maxY ?? feet + C.maximumStep, minY = options.minY ?? feet - C.maximumStep;
  return continuationChartSurfaces({chartId:options.chartId??continuationChartId(value)}).filter(s => continuationSurfaceContains(s, x, z, options.margin ?? 0)).map(s => ({ id: s.id, y: continuationSurfaceY(s, x, z), level: s.level ?? 0, surface: s })).filter(s => s.y <= maxY + 1e-7 && s.y >= minY - 1e-7).sort((a, b) => b.y - a.y)[0] || null;
}
export const continuationDropLip = value => CONTINUATION_DROP_LIPS.find(p => p.level === value?.level) || null;
export const continuationDropLips = value => [...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].filter(p => p.level === value?.level);
export function continuationRefugeAt(value = {}) {
  if (value.phase !== 'catch') {
    const base=value.feet < 2.1 ? {x:0,z:-3,feet:0,level:0} : value.feet < 6.3 ? {x:0,z:-7,feet:4.2,level:0} : { ...C.wrongReturn.refuge, level: 0 };
    return [base,...JOURNEY_REFUGES.map(p=>({...p,level:0}))].filter(p=>(p.chartId??0)===continuationChartId(value)&&Math.abs(p.feet-value.feet)<.5).sort((a,b)=>Math.hypot(a.x-value.x,a.z-value.z)-Math.hypot(b.x-value.x,b.z-value.z))[0]||base;
  }
  const stage = continuationStage(value.level), at = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
  const pocket={ ...at, feet: stage.y, level: stage.level };
  return stage.level===CONTINUATION_SEAT_ISLAND.level && Math.hypot(value.x-CONTINUATION_SEAT_ISLAND.x,value.z-CONTINUATION_SEAT_ISLAND.z)<Math.hypot(value.x-pocket.x,value.z-pocket.z) ? CONTINUATION_SEAT_ISLAND : pocket;
}
export function continuationCatchObstacles(value={}) {
  return [...continuationChartSurfaces(value).map(s => ({ ...s, minY: s.y - s.thickness, maxY: s.y })), ...continuationChartSolids(value),
    ...continuationChartDoors(value).map(d => ({ id: d.id, kind: 'door', x: d.x, z: d.z, width: d.width, normal: d.normal || (Math.abs(Math.sin(d.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 }), minY: d.y, maxY: d.y + d.height }))];
}
export function continuationBodyClearAt(point, { radius = .22, height = 1.9, margin = 0, obstacles = continuationCatchObstacles(point) } = {}) {
  const y = point.feet ?? point.y, r = radius + margin;
  return !obstacles.some(s => {
    if (y >= s.maxY - 1e-7 || y + height <= s.minY + 1e-7) return false;
    if (s.kind === 'sector') return continuationSurfaceContains(s, point.x, point.z, -r);
    if (s.kind === 'door') { const dx = point.x - s.x, dz = point.z - s.z; return Math.abs(dx * s.normal.x + dz * s.normal.z) < .14 + r && Math.abs(-dx * s.normal.z + dz * s.normal.x) < s.width / 2 + .08 + r; }
    const dx = Math.max(s.minX - point.x, 0, point.x - s.maxX), dz = Math.max(s.minZ - point.z, 0, point.z - s.maxZ);
    return dx * dx + dz * dz < r * r - 1e-9;
  });
}
