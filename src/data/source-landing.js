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
export const SOURCE_LANDING_PORTAL_DOOR_ID = 'dock-foyer-service';
export const SOURCE_LANDING_REAR_DOOR_ID = 'dock-grey-exterior';
const portalDoor = CONSERVATORY_DOORS.find((door) => door.id === SOURCE_LANDING_PORTAL_DOOR_ID);
if (!portalDoor) throw new Error(`Source landing requires ${SOURCE_LANDING_PORTAL_DOOR_ID}`);
const portalDoorArchetype = DOOR_ARCHETYPES[portalDoor.archetype];
if (!portalDoorArchetype) throw new Error(`Source landing requires archetype ${portalDoor.archetype}`);
export const SOURCE_LANDING_PORTAL_LOCAL = Object.freeze(sourceLandingLocalFromAuthored(portalDoor));
export const SOURCE_LANDING_OPENING_LOCAL = Object.freeze(sourceLandingLocalFromAuthored({
  x: SOURCE_GET_IN_BOUNDS.maxX + 2,
  y: portalDoor.y,
}));
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

export function sourceLandingCellAt(localX, localY, { portalOpen = false } = {}) {
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
    const portalHalfWidth = portalDoorArchetype.aperture.width / (2 * CELL) + .2;
    const inPortal = Math.abs(Number(localX) - SOURCE_LANDING_PORTAL_LOCAL.x) <= portalHalfWidth;
    if (!inPortal) return { owned: true, solid: true, glyph: '#' };
    return portalOpen
      ? { owned: false, opening: true, portal: SOURCE_LANDING_PORTAL_DOOR_ID }
      : { owned: true, solid: true, glyph: '+', portal: SOURCE_LANDING_PORTAL_DOOR_ID };
  }
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

// Explicit ownership matters here. The west goods pair remains the sealed
// Loading Bay/HUSH side; the FOH leaf alone becomes the Source portal. The
// south services pair belongs to the ordinary corridor and is not cloned.
export const SOURCE_GET_IN_DOOR_IDS = Object.freeze([
  SOURCE_LANDING_REAR_DOOR_ID,
  SOURCE_LANDING_PORTAL_DOOR_ID,
]);

export function sourceLandingDoorPlacements(origin = { x: 0, y: 0 }, { portalProgress = 0 } = {}) {
  const opening = Math.max(0, Math.min(1, Number(portalProgress) || 0));
  return CONSERVATORY_DOORS.filter((door) => SOURCE_GET_IN_DOOR_IDS.includes(door.id)).flatMap((door) => {
    const archetype=DOOR_ARCHETYPES[door.archetype];
    if(!archetype)return[];
    const local=sourceLandingLocalFromAuthored(door);
    // Rotating the physical room clockwise turns these y-axis leaves onto the
    // Source wall. The goods pair remains inert; the FOH leaf receives the one
    // authored opening fraction below.
    const centre={x:Number(origin.x)+local.x,z:Number(origin.y)+local.y};
    const leaves=Array.from({length:archetype.leafCount},(_,leafIndex)=>{
      const left=archetype.leafCount===2?leafIndex===0:door.hinge!=='right';
      const hingeLocal=left?-archetype.aperture.width/2:archetype.aperture.width/2;
      const portalLeaf = door.id === SOURCE_LANDING_PORTAL_DOOR_ID;
      return{
        id:`source-landing:door-leaf:${door.id}:${leafIndex}`,
        sourceDoorId:door.id,mesh:archetype.mesh,
        x:centre.x+hingeLocal/CELL,y:0,z:centre.z,
        yaw:portalLeaf ? -Math.PI * .54 * opening : 0,
        scaleX:left?1:-1,
        sourcePortalLeaf:portalLeaf,
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

// One maintained emergency circuit, with the slightly irregular double-pulse
// of an old contactor. Reduced effects hold the mean level: presentation may
// steady, but the room never loses the red information altogether.
export function sourceEmergencyFrame(timeSeconds = 0, { reducedEffects = false } = {}) {
  const t = Math.max(0, Number(timeSeconds) || 0);
  if (reducedEffects) return Object.freeze({ cycle: 0.78, wash: 0.72, lightScale: 0.88 });
  const phase = t % 3.2;
  const pulse = phase < .18 ? 1
    : phase < .42 ? .48
      : phase < .64 ? .92
        : phase < .92 ? .56
          : .42 + .08 * Math.sin((phase - .92) * 2.4);
  return Object.freeze({
    cycle: Math.max(.38, Math.min(1, pulse)),
    wash: .52 + pulse * .34,
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
    portal: { id: SOURCE_LANDING_PORTAL_DOOR_ID, ...SOURCE_LANDING_PORTAL_LOCAL },
    hush: { ...SOURCE_LANDING_HUSH_LOCAL },
    fieldEdgeY: SOURCE_LANDING_FIELD_EDGE_LOCAL_Y,
    propIds: [...SOURCE_GET_IN_PROP_IDS],
    doorIds: [...SOURCE_GET_IN_DOOR_IDS],
    forwardWallRemoved: false,
    portalRequiresInteraction: true,
    emergencyLightId: sourceSeam?.id || null,
    emergencyLightIds: sourceLandingLights().map((light) => light.id),
  };
}
