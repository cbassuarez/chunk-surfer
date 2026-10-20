import { SOURCE_HANGING_SHORE } from './source-hanging-shore.js';
import { CONSERVATORY_PROPS } from './conservatory-props.js';
import { CONSERVATORY_LIGHTS, LIGHT_KIND } from './conservatory-lights.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPES } from './conservatory-doors.js';
import { conservatory } from './floorplan/conservatory.js';
import { CELL, F, GLYPHS, MATERIAL, ZONE } from './floorplan/legend.js';
import { SOURCE_CHUTES, SOURCE_LIFTS } from './source-level.js';

// The corridor mouth takes the hall's ceiling (HALL_CEIL in the runtime).
const HALL_MOUTH_CEIL = 4.5;

const ground = conservatory.levels.find((level) => level.id === 'ground');
if (!ground) throw new Error('Source landing requires the conservatory ground floor');

const getInCells = [];
for (let row = 0; row < ground.rows.length; row += 1) {
  const line = ground.rows[row] || '';
  for (let column = 0; column < line.length; column += 1) {
    if (line[column] !== 'I') continue;
    getInCells.push({ x: ground.origin.x + column, y: ground.origin.y + row });
  }
}
if (!getInCells.length) throw new Error('Source landing could not locate the authored get-in');

const xs = getInCells.map((cell) => cell.x), ys = getInCells.map((cell) => cell.y);
export const SOURCE_GET_IN_BOUNDS = Object.freeze({
  minX: Math.min(...xs), maxX: Math.max(...xs),
  minY: Math.min(...ys), maxY: Math.max(...ys),
});
// The dock's own metres (DOCK_LAYOUT, footprints, fittings) are measured from
// its centre; DOCK_Z places that centre along the walk (source-hanging-shore.js).
const DOCK_Z = SOURCE_HANGING_SHORE.dockZ;
const CENTRE = Object.freeze({
  x: (SOURCE_GET_IN_BOUNDS.minX + SOURCE_GET_IN_BOUNDS.maxX + 1) / 2,
  y: (SOURCE_GET_IN_BOUNDS.minY + SOURCE_GET_IN_BOUNDS.maxY + 1) / 2,
});

function authoredGlyphAt(x, y) {
  const column = Math.floor(x - ground.origin.x), row = Math.floor(y - ground.origin.y);
  return ground.rows[row]?.[column] || ' ';
}

// Rigidly rotate the existing room so its grey goods doors become the rear wall
// and its opposite wall becomes the opening onto Source. Distances are unchanged.
export function sourceLandingLocalFromAuthored(point = {}) {
  const sourceMetresX = (Number(point.y) || 0) - CENTRE.y;
  const sourceMetresY = -((Number(point.x) || 0) - CENTRE.x);
  return { x: sourceMetresX / CELL, y: (sourceMetresY + DOCK_Z) / CELL };
}

export function sourceLandingAuthoredFromLocal(localX = 0, localY = 0) {
  return {
    x: CENTRE.x - (Number(localY) * CELL - DOCK_Z),
    y: CENTRE.y + Number(localX) * CELL,
  };
}

export const SOURCE_LANDING_ENTRY_LOCAL = Object.freeze(
  sourceLandingLocalFromAuthored(conservatory.greyDoorApproach || { x: 65, y: 10 }),
);
export const SOURCE_LANDING_PORTAL_DOOR_ID = 'dock-foyer-service';
export const SOURCE_LANDING_REAR_DOOR_ID = 'dock-grey-exterior';
export const SOURCE_THRESHOLD_LIGHT_ID = 'source-landing:foh-white-threshold';
// The masonry aperture is the frame's clear opening, not the original 3.4m
// floorplan column. The oak head stays above it while the leaf moves below it.
export const SOURCE_LANDING_PORTAL_APERTURE = Object.freeze({ width: 1, height: 2.20 });
export const SOURCE_LANDING_PORTAL_MAX_ANGLE = Math.PI * .49;
const portalDoor = CONSERVATORY_DOORS.find((door) => door.id === SOURCE_LANDING_PORTAL_DOOR_ID);
if (!portalDoor) throw new Error(`Source landing requires ${SOURCE_LANDING_PORTAL_DOOR_ID}`);
const portalDoorArchetype = DOOR_ARCHETYPES[portalDoor.archetype];
if (!portalDoorArchetype) throw new Error(`Source landing requires archetype ${portalDoor.archetype}`);
export const SOURCE_LANDING_PORTAL_LOCAL = Object.freeze(sourceLandingLocalFromAuthored(portalDoor));
export const SOURCE_LANDING_OPENING_LOCAL = Object.freeze(sourceLandingLocalFromAuthored({
  x: SOURCE_GET_IN_BOUNDS.maxX + 2,
  y: portalDoor.y,
}));
// The grey goods pair, in Source-local cells. The corridor recess is built off
// this rather than off the bounds, so moving the door moves what is behind it.
const rearDoor = CONSERVATORY_DOORS.find((door) => door.id === SOURCE_LANDING_REAR_DOOR_ID);
if (!rearDoor) throw new Error(`Source landing requires ${SOURCE_LANDING_REAR_DOOR_ID}`);
export const SOURCE_LANDING_REAR_LOCAL = Object.freeze(sourceLandingLocalFromAuthored(rearDoor));
export const SOURCE_LANDING_REAR_APERTURE = Object.freeze({
  ...DOOR_ARCHETYPES[rearDoor.archetype].aperture,
});

export const SOURCE_LANDING_HUSH_LOCAL = Object.freeze(
  sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.minX + 1.25, y: CENTRE.y }),
);
// The Scene Dock projects out of the rear edge of the Source field. Generic
// terrain may meet its FOH aperture, but must not continue beside the shell and
// offer a route around the sealed grey-door plane.
export const SOURCE_LANDING_FIELD_EDGE_LOCAL_Y = sourceLandingLocalFromAuthored({
  x: SOURCE_GET_IN_BOUNDS.maxX + 1,
  y: CENTRE.y,
}).y;

export function sourceLandingCellAt(localX, localY, { portalOpen = false, renderOnly = false } = {}) {
  const authored = sourceLandingAuthoredFromLocal(localX, localY);
  const envelope = authored.x >= SOURCE_GET_IN_BOUNDS.minX - 1
    && authored.x < SOURCE_GET_IN_BOUNDS.maxX + 2
    && authored.y >= SOURCE_GET_IN_BOUNDS.minY - 1
    && authored.y < SOURCE_GET_IN_BOUNDS.maxY + 2;
  if (!envelope) return null;
  const glyph = authoredGlyphAt(authored.x, authored.y);
  const forwardWall = Math.floor(authored.x) === SOURCE_GET_IN_BOUNDS.maxX + 1
    && authored.y >= SOURCE_GET_IN_BOUNDS.minY
    && authored.y < SOURCE_GET_IN_BOUNDS.maxY + 1;
  if (forwardWall) {
    // The transformed room keeps a real east wall. Only the half-glazed FOH
    // leaf opens into Source; treating this whole plane as absent is what let
    // the player phase through the closed door and made the threshold feel
    // like scenery instead of an event.
    const portalHalfWidth = SOURCE_LANDING_PORTAL_APERTURE.width / (2 * CELL);
    const inPortal = Math.abs(Number(localX) - SOURCE_LANDING_PORTAL_LOCAL.x) <= portalHalfWidth;
    if (!inPortal) return { owned: true, solid: true, glyph: '#' };
    if (!portalOpen && !renderOnly) return {
      owned: true, solid: true, glyph: '+', portal: SOURCE_LANDING_PORTAL_DOOR_ID,
    };
    return {
      owned: true, solid: false, glyph: '+', opening: true,
      portal: SOURCE_LANDING_PORTAL_DOOR_ID,
      floor: 0, ceil: SOURCE_LANDING_PORTAL_APERTURE.height, flags: 0,
      zone: ZONE.getIn, material: MATERIAL.serviceConcrete,
    };
  }
  const descriptor = GLYPHS[glyph];
  if (!descriptor || descriptor.solid || glyph === '#') return { owned: true, solid: true, glyph };
  if (glyph !== 'I' && glyph !== '+') return { owned: false, glyph };
  // Only the rear goods plane is the hall mouth. The ordinary room's side
  // services door led into the building, which is absent from this reconstruction.
  // A sealed wall and its services sign describe that absence consistently.
  const rearHalfWidth = SOURCE_LANDING_REAR_APERTURE.width / (2 * CELL);
  const rearMouth = Math.abs(Number(localX) - SOURCE_LANDING_REAR_LOCAL.x) <= rearHalfWidth
    && Math.abs(Number(localY) - SOURCE_LANDING_REAR_LOCAL.y) <= 1;
  if (glyph === '+' && !rearMouth) return {
    owned: true, solid: true, glyph: '#', closure: 'building-services',
  };
  if (glyph === '+') return {
    owned: true,
    solid: false,
    glyph,
    corridorMouth: true,
    floor: 0,
    // The corridor's ceiling, not the dock's, so the mouth reads as continuous
    // with what it opens onto instead of as a hole punched in a taller room.
    ceil: HALL_MOUTH_CEIL,
    flags: 0,
    zone: ZONE.sourceSpace,
    material: MATERIAL.serviceConcrete,
  };
  // THE ROOM KEEPS ITS OWN ZONE, BECAUSE THE ZONE IS WHAT IT LOOKS LIKE.
  //
  // The cell's zone is written straight into the render plan (rgba.a) and picked
  // up as uZoneTint. Forcing ZONE.sourceSpace here painted the reconstructed
  // Scene Dock with the field's tint — 0.10, 0.92, 0.24, executable green
  // against the void — instead of the get-in's own 0.62, 0.60, 0.55, sodium and
  // rust. Same concrete, same ceiling height, lit and tinted as if it were the
  // inside of the tape, which is exactly the "untextured, wrong ceiling" read:
  // the surface lost the treatment that tells you how far away it is.
  //
  // This room is the get-in. It is the one part of Source that is a real room,
  // and it should look like the room it is.
  const authoredZone = ZONE[descriptor.zone];
  return {
    owned: true,
    solid: false,
    glyph,
    floor: Number(descriptor.floor) || 0,
    ceil: Number(descriptor.ceil) || 5.5,
    flags: descriptor.sky ? F.SKY : 0,
    zone: Number.isFinite(authoredZone) ? authoredZone : ZONE.sourceSpace,
    material: MATERIAL.serviceConcrete,
  };
}

const propInGetIn = (prop) => Number(prop.x) >= SOURCE_GET_IN_BOUNDS.minX - 0.5
  && Number(prop.x) <= SOURCE_GET_IN_BOUNDS.maxX + 0.5
  && Number(prop.y) >= SOURCE_GET_IN_BOUNDS.minY - 0.5
  && Number(prop.y) <= SOURCE_GET_IN_BOUNDS.maxY + 0.5;

// Props the Source copy deliberately leaves in the building.
//   dock-chandelier-spent: the intact one is copied instead.
//   dock-crew-board:       a notice board on the rear plane, which in Source is
//                          the corridor mouth. A sign hung across an opening.
const SOURCE_GET_IN_PROP_EXCLUDED = new Set(['dock-chandelier-spent', 'dock-crew-board']);
export const SOURCE_GET_IN_PROP_IDS = Object.freeze(CONSERVATORY_PROPS
  // This roof is authored from an origin outside the room, but its geometry
  // spans the entire dock. Anchor filtering used to discard the actual roof.
  .filter((prop) => propInGetIn(prop) || prop.id === 'dock-scene-roof')
  .filter((prop) => !SOURCE_GET_IN_PROP_EXCLUDED.has(prop.id))
  .map((prop) => prop.id));

export const SOURCE_DOCK_DESIGN = Object.freeze({
  id: 'remembered-room', title: 'The Remembered Room',
  widthMetres: 11, depthMetres: 16, ceilingMetres: 5.5,
  freeWalking: true, orderedRecognitions: false,
  recognitionPropIds: Object.freeze(['dock-desk-1', 'dock-road-case', 'dock-chandelier-frame']),
  // A measured promise, not a movement constraint. The rest of the room is
  // equally walkable wherever the shell and real furniture leave room.
  clearFloorMetres: Object.freeze({ minX: -.5, maxX: 3.35, minZ: -6.65, maxZ: 7.5 }),
  sideServices: 'sealed-building-wall',
});

// Source-local metres. These are compositions in this remembered room, not
// relocations of the ordinary opening get-in. Three recognisable objects sit
// apart; freight rests at the perimeter and never becomes a guided aisle.
const DOCK_LAYOUT = Object.freeze({
  'dock-scene-roof': { x: -1.75, y: 0, z: 12.25, yaw: Math.PI / 2 },
  'dock-level-check-box': { x: .5, y: .018, z: 1, scale: 1.45 },
  'dock-desk-1': { x: -3.65, y: 0, z: 5.4, yaw: .1 },
  'dock-work-order-clipboard': {
    x: -3.65 - Math.sin(.1) * .04, y: .7235,
    z: 5.4 - Math.cos(.1) * .04, yaw: .1, scale: .85,
    on: 'dock-desk-1', surfaceMetres: .7175,
  },
  'acq-maintenance-searchlight-dock': { x: -4.6, y: 0, z: 4.5, scale: 3 },
  'dock-hand-truck': { x: -4.75, y: 0, z: -4.55, scale: 1.15 },
  'dock-freight-crates': { x: -4.7, y: 0, z: -3.4, scaleX: 1.6, scaleY: 1, scaleZ: 1.3 },
  'dock-freight-crate-low': { x: -2.8, y: 0, z: -6.6, scale: 1.1 },
  'dock-road-case': { x: 4.3, y: 0, z: 4 },
  'dock-cable-reel': { x: -2.6, y: 0, z: -5.6, scale: .72 },
  'dock-shutter-bar': { x: -5.28, y: 1.05, z: -3.9, yaw: Math.PI / 2, scale: .88 },
  'dock-chandelier-frame': { x: -2.2, y: 0, z: -.7, scaleX: .22, scaleY: .9, scaleZ: .36 },
  // The mesh hangs down from its origin. At the old elevation its lower half
  // was below the floor; this origin attaches it under the cage crossbar.
  'dock-chandelier-intact': { x: -2.2, y: 2.315, z: -.7, scale: 1.48 },
  'dock-chandelier-tag': { x: -2.2, y: 2.472, z: -.5, scale: .8 },
  'getin-heavy-stillson': { x: -4.7, y: .04, z: -1.5, yaw: Math.PI / 2 },
});

const DOCK_ADDITIONS = Object.freeze([
  { id: 'chandelier-crossbar', mesh: 'plant_pipe_straight', x: -2.2, y: 2.3, z: -.7,
    yaw: Math.PI / 2, scaleX: .8, scaleY: .5, scaleZ: .4, semantic: 'dock-cage-support' },
  { id: 'desk-fitting', mesh: 'tower_bulkhead', x: -5.47, y: 2.05, z: 5.4,
    yaw: Math.PI / 2, semantic: 'dock-practical-fitting',
    lightMaintained: true, lightColor: [1, .66, .35] },
  { id: 'cage-fitting', mesh: 'tower_bulkhead', x: -5.47, y: 2.8, z: -.7,
    yaw: Math.PI / 2, semantic: 'dock-practical-fitting',
    lightMaintained: true, lightColor: [.88, .83, .71] },
  { id: 'foh-fitting', mesh: 'tower_bulkhead', x: 4, y: 2.47, z: -7.97,
    semantic: 'dock-practical-fitting', lightMaintained: true, lightColor: [.74, .84, 1] },
  { id: 'services-closure-sign', mesh: 'scene_dock_sign_services', x: 5.47, y: 2.4, z: 3.6,
    yaw: Math.PI / 2, scale: .65, semantic: 'dock-services-closure' },
]);

function dockPlacement(prop, local, origin) {
  return {
    ...local,
    id: `source-landing:${prop.id}`, sourcePropId: prop.id, mesh: prop.mesh,
    x: Number(origin.x) + local.x / CELL, y: Number(local.y) || 0,
    z: Number(origin.y) + (local.z + DOCK_Z) / CELL,
    yaw: Number(local.yaw) || 0, scale: Number(local.scale) || 1,
    zone: ZONE.getIn, structural: true,
  };
}

export function sourceLandingPropPlacements(origin = { x: 0, y: 0 }) {
  const allowed = new Set(SOURCE_GET_IN_PROP_IDS);
  return [
    ...CONSERVATORY_PROPS.filter((prop) => allowed.has(prop.id)).map((prop) =>
      dockPlacement(prop, DOCK_LAYOUT[prop.id], origin)),
    ...DOCK_ADDITIONS.map((prop) => dockPlacement(prop, prop, origin)),
  ];
}

// Shipped mesh X/Z bounds, before the explicit placement's scale and yaw. The
// roof, paper, flat mat and fittings are not body obstacles. A cage's whole
// footprint blocks the body rather than letting it pass through its contents.
const DOCK_BODY_BOUNDS = Object.freeze({
  'dock-desk-1': [-.31, .31, -.28, .297],
  'acq-maintenance-searchlight-dock': [-.083, .083, -.127, .127],
  'dock-hand-truck': [-.575, .575, -.325, .325],
  'dock-freight-crates': [-.31, .31, -.343, .29],
  'dock-freight-crate-low': [-.6, .6, -.26, .21],
  'dock-road-case': [-.6, .6, -.26, .21],
  'dock-cable-reel': [-.5, .655, -.407, .407],
  'dock-chandelier-frame': [-4.5, 4.5, -2.52, 2.52],
  'getin-heavy-stillson': [-1.08, .86, -.09, .09],
});

export function sourceLandingPropFootprints() {
  return Object.entries(DOCK_BODY_BOUNDS).map(([sourcePropId, bounds]) => {
    const p = DOCK_LAYOUT[sourcePropId], scale = p.scale || 1;
    const sx = p.scaleX ?? scale, sz = p.scaleZ ?? scale;
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
    const corners = [bounds[0], bounds[1]].flatMap((x) => [bounds[2], bounds[3]].map((z) => ({
      x: p.x + c * x * sx + s * z * sz,
      z: p.z - s * x * sx + c * z * sz,
    })));
    return {
      id: `source-landing:${sourcePropId}`, sourcePropId,
      minX: Math.min(...corners.map(({ x }) => x)), maxX: Math.max(...corners.map(({ x }) => x)),
      minZ: Math.min(...corners.map(({ z }) => z)), maxZ: Math.max(...corners.map(({ z }) => z)),
    };
  });
}

const DOCK_FOOTPRINTS = sourceLandingPropFootprints();
export function sourceLandingPropCollisionAt(localX, localY, { radiusMetres = .22 } = {}) {
  const x = Number(localX) * CELL, z = Number(localY) * CELL - DOCK_Z;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const radius = Math.max(0, Number(radiusMetres) || 0);
  return DOCK_FOOTPRINTS.find((p) => {
    const dx = Math.max(p.minX - x, 0, x - p.maxX);
    const dz = Math.max(p.minZ - z, 0, z - p.maxZ);
    return Math.hypot(dx, dz) <= radius;
  }) || null;
}

export function sourceLandingRecognitions(origin = { x: 0, y: 0 }) {
  const anchors = [{
    id: 'source-dock:desk', sourcePropId: 'dock-desk-1', label: 'unfinished clipboard',
    standX: -2.65, standZ: 5.4,
    first: 'The same little desk. The last line on the clipboard is still waiting to be crossed out.',
    again: 'Somebody meant to come back to it.',
  }, {
    id: 'source-dock:case', sourcePropId: 'dock-road-case', label: 'recordist’s case',
    standX: 3.1, standZ: 4,
    first: 'The recorder-shaped absence. Four tally marks under the handle. Space for one more.',
    again: 'You remember the shape of it.',
  }, {
    id: 'source-dock:chandelier', sourcePropId: 'dock-chandelier-frame', label: 'caged chandelier',
    standX: -.85, standZ: -.7,
    first: 'The cage is still locked around it. Black bulbs, bright glass. Its wire still ends in open air.',
    again: 'Too carefully held for rubbish. Too dead to be a lamp.',
  }];
  return anchors.map((anchor) => {
    const p = DOCK_LAYOUT[anchor.sourcePropId];
    const footprint = DOCK_FOOTPRINTS.find((candidate) => candidate.sourcePropId === anchor.sourcePropId);
    return {
      ...anchor, optional: true,
      x: Number(origin.x) + p.x / CELL, y: Number(origin.y) + (p.z + DOCK_Z) / CELL,
      standX: Number(origin.x) + anchor.standX / CELL,
      standY: Number(origin.y) + (anchor.standZ + DOCK_Z) / CELL,
      footprint: { ...footprint },
    };
  });
}

// The FOH leaf alone is cloned. The rear goods plane is the real hall mouth;
// the side services route is a closed wall of the remembered room.
export const SOURCE_GET_IN_DOOR_IDS = Object.freeze([
  SOURCE_LANDING_PORTAL_DOOR_ID,
]);

export function sourceLandingDoorPlacements(origin = { x: 0, y: 0 }, { portalProgress = 0 } = {}) {
  const opening = Math.max(0, Math.min(1, Number(portalProgress) || 0));
  return CONSERVATORY_DOORS.filter((door) => SOURCE_GET_IN_DOOR_IDS.includes(door.id)).flatMap((door) => {
    const archetype=DOOR_ARCHETYPES[door.archetype];
    if(!archetype)return[];
    const local=sourceLandingLocalFromAuthored(door);
    // The hinge-origin mesh is mirrored at the right jamb. Source's yaw
    // convention takes its free edge outward into the field at negative yaw.
    const centre={x:Number(origin.x)+local.x,z:Number(origin.y)+local.y};
    const leaves=Array.from({length:archetype.leafCount},(_,leafIndex)=>{
      const left=archetype.leafCount===2?leafIndex===0:door.hinge!=='right';
      const hingeLocal=left?-archetype.aperture.width/2:archetype.aperture.width/2;
      const portalLeaf = door.id === SOURCE_LANDING_PORTAL_DOOR_ID;
      return{
        id:`source-landing:door-leaf:${door.id}:${leafIndex}`,
        sourceDoorId:door.id,mesh:archetype.mesh,
        x:centre.x+hingeLocal/CELL,y:0,z:centre.z,
        yaw:portalLeaf ? -SOURCE_LANDING_PORTAL_MAX_ANGLE * opening : 0,
        scaleX:left?1:-1,
        sourcePortalLeaf:portalLeaf,
        zone:ZONE.getIn,structural:true,
      };
    });
    return[
      {id:`source-landing:door-frame:${door.id}`,sourceDoorId:door.id,mesh:archetype.frameMesh,...centre,y:0,yaw:0,zone:ZONE.getIn,structural:true},
      {id:`source-landing:door-head:${door.id}`,sourceDoorId:door.id,mesh:archetype.headMesh,...centre,y:0,yaw:0,zone:ZONE.getIn,structural:true},
      ...leaves,
    ];
  });
}

// One maintained emergency circuit PAST the Scene Dock, with the slightly
// irregular double-pulse of an old contactor. Reduced effects hold the mean
// level. The physical dock does not consume this frame at all.
export function sourceEmergencyFrame(timeSeconds = 0, { reducedEffects = false } = {}) {
  const t = Math.max(0, Number(timeSeconds) || 0);
  if (reducedEffects) return Object.freeze({ cycle: 0.78, wash: 1.16, lightScale: 1.02 });
  const phase = t % 3.2;
  const pulse = phase < .18 ? 1
    : phase < .42 ? .48
      : phase < .64 ? .92
        : phase < .92 ? .56
          : .42 + .08 * Math.sin((phase - .92) * 2.4);
  return Object.freeze({
    cycle: Math.max(.38, Math.min(1, pulse)),
    // This is not a red tint laid over a dark scene. It is the maintained
    // circuit taking the whole exposure, at the concert hall's visual force.
    wash: 1.04 + pulse * .24,
    lightScale: .72 + pulse * .42,
  });
}

const sourceSeam = CONSERVATORY_LIGHTS.find((light) => light.id === 'getin-grey-door-seam');
export function sourceLandingLights(origin = { x: 0, y: 0 }) {
  if (!sourceSeam) return [];
  // The physical fixture predates the expanded get-in and still carries its
  // original north-wall coordinate.  Reuse its circuit/look, but seat the copy
  // on the reconstructed grey-door plane so the light and the tableau cannot
  // drift apart when the physical room changes again.
  const local = sourceLandingLocalFromAuthored({
    x: SOURCE_GET_IN_BOUNDS.minX,
    y: CENTRE.y,
  });
  const opening = SOURCE_LANDING_OPENING_LOCAL;
  const firstLift = SOURCE_LIFTS.find((lift) => lift.id === 'lift-fork');
  const firstStair = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
  const firstConnector = firstLift || (firstStair
    ? { x: firstStair.x, y: firstStair.y + firstStair.run }
    : { x: 0, y: -40 });
  return [{
    id: 'source-landing:getin-grey-door-seam',
    // The real get-in fitting is an amber sodium seam, not Source's alarm. Keep
    // that authored practical neutral and steady so the reconstructed Scene
    // Dock never becomes red merely because it belongs to this chapter.
    kind: LIGHT_KIND.FITTING,
    x: (Number(origin.x) + local.x) * CELL,
    y: Number(sourceSeam.y) || 2.1,
    z: (Number(origin.y) + local.y) * CELL,
    // CONSERVATORY_LIGHTS normalises emergency-kind colours to the global alarm
    // red at load time, so use the get-in fitting's authored sodium values here
    // rather than copying that already-normalised runtime descriptor.
    color: [1, .43, .16],
    intensity: .34,
    radius: 6.2,
    penetration: 0.12,
    castsShadow: true,
    shadowYaw: Math.PI,
  }, {
    // A small room-side lamp above the existing FOH head makes the closed leaf
    // a readable destination before the impossible white aperture is opened.
    // Its light is local, occluded and steady; it never washes the whole frame.
    id: 'source-landing:foh-work-light',
    sourceDockOnly: true,
    kind: LIGHT_KIND.FITTING,
    x: (Number(origin.x) + SOURCE_LANDING_PORTAL_LOCAL.x) * CELL,
    y: 2.65,
    z: (Number(origin.y) + SOURCE_LANDING_PORTAL_LOCAL.y + .5) * CELL,
    color: [.74, .84, 1],
    intensity: .42,
    radius: 7.5,
    penetration: .04,
    castsShadow: true,
    shadowYaw: Math.PI,
  }, {
    // The aperture's first impossible fact is WHITE. This practical is dark
    // until the physical leaf begins moving; localLights scales it from the
    // same portal frame that rotates that leaf. Low penetration lets the open
    // doorway throw a real shaft into the Scene Dock without pretending the
    // shut wall is translucent.
    id: SOURCE_THRESHOLD_LIGHT_ID,
    kind: LIGHT_KIND.FITTING,
    x: (Number(origin.x) + SOURCE_LANDING_PORTAL_LOCAL.x) * CELL,
    y: 1.85,
    z: (Number(origin.y) + SOURCE_LANDING_PORTAL_LOCAL.y - 5) * CELL,
    color: [1, 1, 1],
    intensity: 1.2,
    radius: 8,
    penetration: 0.04,
    castsShadow: true,
    shadowYaw: 0,
    sourceThreshold: true,
  }, {
    // The FOH aperture opens onto real props and the first impossible objects.
    // This maintained fitting establishes that they belong to the playable
    // world without exposing the rest of the field.
    id: 'source-landing:opening-emergency',
    kind: LIGHT_KIND.EMERGENCY,
    x: (Number(origin.x) + opening.x) * CELL,
    y: 3.15,
    z: (Number(origin.y) + opening.y - 2) * CELL,
    color: [1, 0.012, 0.004],
    intensity: 1.05,
    radius: 16,
    penetration: 0.72,
    castsShadow: true,
    shadowYaw: 0,
    shadowPitch: -0.18,
  }, {
    // A second, tighter pool makes the first lift a destination instead of a
    // dark collision volume. Its radius ends well before any HUSH contact site.
    id: 'source-landing:first-lift-emergency',
    kind: LIGHT_KIND.EMERGENCY,
    x: (Number(origin.x) + firstConnector.x) * CELL,
    y: 3.6,
    z: (Number(origin.y) + firstConnector.y) * CELL,
    color: [1, 0.008, 0.002],
    intensity: 1.2,
    radius: 12,
    penetration: 0.55,
    castsShadow: true,
    shadowYaw: 0,
    shadowPitch: -0.32,
  },
  {
    id: 'source-landing:desk-light', sourceDockOnly: true, kind: LIGHT_KIND.FITTING,
    x: Number(origin.x) * CELL - 5.25, y: 2.23, z: Number(origin.y) * CELL + 5.4 + DOCK_Z,
    color: [1, .66, .35], intensity: .32, radius: 4.4, penetration: .03,
    castsShadow: true, shadowYaw: Math.PI / 2,
  }, {
    id: 'source-landing:cage-light', sourceDockOnly: true, kind: LIGHT_KIND.FITTING,
    x: Number(origin.x) * CELL - 5.25, y: 2.98, z: Number(origin.y) * CELL - .7 + DOCK_Z,
    color: [.88, .83, .71], intensity: .28, radius: 5.2, penetration: .03,
    castsShadow: true, shadowYaw: Math.PI / 2,
  },
  ...sourceApproachLights(origin)];
}

// The first nothingness is measured between physical shores, in local cells.
// It carries no fitting run; its sky is uniform and the deck is proximity-called.
export function sourceApproachSpan() {
  return { from: SOURCE_HANGING_SHORE.portal.z / CELL, to: SOURCE_HANGING_SHORE.lift.maxZ / CELL };
}

export function sourceApproachLights() {
  // The first nothingness contains no fittings, beam pools or emergency run.
  return [];
}

export function sourceLandingContract() {
  const lights = sourceLandingLights();
  return {
    source: 'conservatory.ground / ZONE.getIn',
    shore: SOURCE_HANGING_SHORE,
    bounds: { ...SOURCE_GET_IN_BOUNDS },
    centre: { ...CENTRE },
    entry: { ...SOURCE_LANDING_ENTRY_LOCAL },
    opening: { ...SOURCE_LANDING_OPENING_LOCAL },
    portal: { id: SOURCE_LANDING_PORTAL_DOOR_ID, ...SOURCE_LANDING_PORTAL_LOCAL,
      aperture: { ...SOURCE_LANDING_PORTAL_APERTURE }, maxAngle: SOURCE_LANDING_PORTAL_MAX_ANGLE },
    hush: { ...SOURCE_LANDING_HUSH_LOCAL },
    fieldEdgeY: SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
    propIds: [...SOURCE_GET_IN_PROP_IDS],
    doorIds: [...SOURCE_GET_IN_DOOR_IDS],
    design: SOURCE_DOCK_DESIGN,
    recognitions: sourceLandingRecognitions(),
    footprints: sourceLandingPropFootprints(),
    forwardWallRemoved: false,
    portalRequiresInteraction: true,
    emergencyLightId: sourceSeam?.id || null,
    lightIds: lights.map((light) => light.id),
    emergencyLightIds: lights.filter((light) => light.kind === LIGHT_KIND.EMERGENCY).map((light) => light.id),
  };
}
