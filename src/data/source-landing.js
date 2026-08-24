import { CONSERVATORY_PROPS } from './conservatory-props.js';
import { CONSERVATORY_LIGHTS, LIGHT_KIND } from './conservatory-lights.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPES } from './conservatory-doors.js';
import { conservatory } from './floorplan/conservatory.js';
import { CELL, F, GLYPHS, MATERIAL, ZONE } from './floorplan/legend.js';
import { SOURCE_LIFTS } from './source-level.js';

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
  return { x: sourceMetresX / CELL, y: sourceMetresY / CELL };
}

export function sourceLandingAuthoredFromLocal(localX = 0, localY = 0) {
  return {
    x: CENTRE.x - Number(localY) * CELL,
    y: CENTRE.y + Number(localX) * CELL,
  };
}

export const SOURCE_LANDING_ENTRY_LOCAL = Object.freeze(
  sourceLandingLocalFromAuthored(conservatory.greyDoorApproach || { x: 65, y: 10 }),
);
export const SOURCE_LANDING_OPENING_LOCAL = Object.freeze(
  sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.maxX + 3.5, y: CENTRE.y }),
);
export const SOURCE_LANDING_HUSH_LOCAL = Object.freeze(
  sourceLandingLocalFromAuthored({ x: SOURCE_GET_IN_BOUNDS.minX + 1.25, y: CENTRE.y }),
);
// The get-in projects out of the rear edge of the Source field. Generic terrain
// may meet its removed forward wall, but must not continue beside the shell and
// offer a route around the sealed grey-door plane.
export const SOURCE_LANDING_FIELD_EDGE_LOCAL_Y = sourceLandingLocalFromAuthored({
  x: SOURCE_GET_IN_BOUNDS.maxX + 1,
  y: CENTRE.y,
}).y;

export function sourceLandingCellAt(localX, localY) {
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
  if (forwardWall) return { owned: false, opening: true };
  const descriptor = GLYPHS[glyph];
  if (!descriptor || descriptor.solid || glyph === '#') return { owned: true, solid: true, glyph };
  if (glyph !== 'I' && glyph !== '+') return { owned: false, glyph };
  // The reconstructed grey doors are a sealed rear plane. The red seam and the
  // staged HUSH body make the threshold readable; it is not a route back out.
  if (glyph === '+') return { owned: true, solid: true, glyph };
  return {
    owned: true,
    solid: false,
    glyph,
    floor: Number(descriptor.floor) || 0,
    ceil: Number(descriptor.ceil) || 5.5,
    flags: descriptor.sky ? F.SKY : 0,
    zone: ZONE.sourceSpace,
    material: MATERIAL.serviceConcrete,
  };
}

const propInGetIn = (prop) => Number(prop.x) >= SOURCE_GET_IN_BOUNDS.minX - 0.5
  && Number(prop.x) <= SOURCE_GET_IN_BOUNDS.maxX + 0.5
  && Number(prop.y) >= SOURCE_GET_IN_BOUNDS.minY - 0.5
  && Number(prop.y) <= SOURCE_GET_IN_BOUNDS.maxY + 0.5;

export const SOURCE_GET_IN_PROP_IDS = Object.freeze(CONSERVATORY_PROPS
  .filter(propInGetIn)
  .filter((prop) => prop.id !== 'dock-chandelier-spent')
  .map((prop) => prop.id));

export function sourceLandingPropPlacements(origin = { x: 0, y: 0 }) {
  const allowed = new Set(SOURCE_GET_IN_PROP_IDS);
  return CONSERVATORY_PROPS.filter((prop) => allowed.has(prop.id)).map((prop) => {
    const local = sourceLandingLocalFromAuthored(prop);
    return {
      id: `source-landing:${prop.id}`,
      sourcePropId: prop.id,
      mesh: prop.mesh,
      x: Number(origin.x) + local.x,
      y: Number(prop.elevation) || 0,
      z: Number(origin.y) + local.y,
      yaw: (Number(prop.yaw) || 0) - Math.PI / 2,
      scale: Number(prop.scale) || 1,
      scaleX: prop.scaleX,
      scaleY: prop.scaleY,
      scaleZ: prop.scaleZ,
      zone: ZONE.sourceSpace,
      structural: true,
    };
  });
}

export const SOURCE_GET_IN_DOOR_IDS = Object.freeze(CONSERVATORY_DOORS
  .filter((door) => Number(door.x) >= SOURCE_GET_IN_BOUNDS.minX - 1
    && Number(door.x) <= SOURCE_GET_IN_BOUNDS.maxX + 1
    && Number(door.y) >= SOURCE_GET_IN_BOUNDS.minY - 1
    && Number(door.y) <= SOURCE_GET_IN_BOUNDS.maxY + 1)
  .map((door) => door.id));

export function sourceLandingDoorPlacements(origin = { x: 0, y: 0 }) {
  return CONSERVATORY_DOORS.filter((door) => SOURCE_GET_IN_DOOR_IDS.includes(door.id)).flatMap((door) => {
    const archetype=DOOR_ARCHETYPES[door.archetype];
    if(!archetype)return[];
    const local=sourceLandingLocalFromAuthored(door);
    // Rotating the physical room clockwise turns this y-axis goods pair into an
    // x-axis pair. The leaves are closed and inert; Source has no back route.
    const centre={x:Number(origin.x)+local.x,z:Number(origin.y)+local.y};
    const leaves=Array.from({length:archetype.leafCount},(_,leafIndex)=>{
      const left=archetype.leafCount===2?leafIndex===0:door.hinge!=='right';
      const hingeLocal=left?-archetype.aperture.width/2:archetype.aperture.width/2;
      return{
        id:`source-landing:door-leaf:${door.id}:${leafIndex}`,
        sourceDoorId:door.id,mesh:archetype.mesh,
        x:centre.x+hingeLocal/CELL,y:0,z:centre.z,yaw:0,scaleX:left?1:-1,
        zone:ZONE.sourceSpace,structural:true,
      };
    });
    return[
      {id:`source-landing:door-frame:${door.id}`,sourceDoorId:door.id,mesh:archetype.frameMesh,...centre,y:0,yaw:0,zone:ZONE.sourceSpace,structural:true},
      {id:`source-landing:door-head:${door.id}`,sourceDoorId:door.id,mesh:archetype.headMesh,...centre,y:0,yaw:0,zone:ZONE.sourceSpace,structural:true},
      ...leaves,
    ];
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
  const firstLift = SOURCE_LIFTS.find((lift) => lift.id === 'lift-fork') || { x: 0, y: -40 };
  return [{
    id: 'source-landing:getin-grey-door-seam',
    kind: LIGHT_KIND.EMERGENCY,
    x: (Number(origin.x) + local.x) * CELL,
    y: Number(sourceSeam.y) || 2.1,
    z: (Number(origin.y) + local.y) * CELL,
    color: [1, 0, 0],
    intensity: Math.max(1.15, Number(sourceSeam.intensity) || 0),
    radius: Math.max(18, Number(sourceSeam.radius) || 0),
    penetration: 0.9,
    castsShadow: true,
    shadowYaw: Math.PI,
  }, {
    // The removed wall opens onto real props and the first impossible objects.
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
    x: (Number(origin.x) + firstLift.x) * CELL,
    y: 3.6,
    z: (Number(origin.y) + firstLift.y + 1.5) * CELL,
    color: [1, 0.008, 0.002],
    intensity: 1.2,
    radius: 12,
    penetration: 0.55,
    castsShadow: true,
    shadowYaw: 0,
    shadowPitch: -0.32,
  }];
}

export function sourceLandingContract() {
  return {
    source: 'conservatory.ground / ZONE.getIn',
    bounds: { ...SOURCE_GET_IN_BOUNDS },
    centre: { ...CENTRE },
    entry: { ...SOURCE_LANDING_ENTRY_LOCAL },
    opening: { ...SOURCE_LANDING_OPENING_LOCAL },
    hush: { ...SOURCE_LANDING_HUSH_LOCAL },
    fieldEdgeY: SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
    propIds: [...SOURCE_GET_IN_PROP_IDS],
    doorIds: [...SOURCE_GET_IN_DOOR_IDS],
    forwardWallRemoved: true,
    emergencyLightId: sourceSeam?.id || null,
    emergencyLightIds: sourceLandingLights().map((light) => light.id),
  };
}
