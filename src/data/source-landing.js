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
export const SOURCE_THRESHOLD_LIGHT_ID = 'source-landing:foh-white-threshold';
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
  // THE WALL OPPOSITE THE FOH IS THE CORRIDOR YOU CAME OUT OF.
  //
  // This was a sealed plane of reconstructed grey goods doors — what the room
  // has in the building. But in Source the player reaches this room by walking
  // the haystack corridor, and that corridor ends five and a half metres behind
  // this line: the hall runs back from world y -224, the plane stands at -235.
  // Rebuilding a pair of loading-dock doors across it put a picture of a
  // different building in front of the one thing the arrival is about.
  //
  // So the plane opens. Behind it is the corridor itself (visualHallCell, kept
  // alive past the phase change by hallRenderableInPhase) with the HUSH wake
  // standing in it (densityWakeTextInstances) — neither of them fabricated here,
  // both of them the real components.
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
  .filter(propInGetIn)
  .filter((prop) => !SOURCE_GET_IN_PROP_EXCLUDED.has(prop.id))
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
// The rear goods pair is NOT rebuilt in Source. Its plane is the corridor mouth
// now, and a door standing in an opening is just a door standing in an opening.
export const SOURCE_GET_IN_DOOR_IDS = Object.freeze([
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
    // The aperture's first impossible fact is WHITE. This practical is dark
    // until the physical leaf begins moving; localLights scales it from the
    // same portal frame that rotates that leaf. Low penetration lets the open
    // doorway throw a real shaft into the Scene Dock without pretending the
    // shut wall is translucent.
    id: SOURCE_THRESHOLD_LIGHT_ID,
    kind: LIGHT_KIND.FITTING,
    x: (Number(origin.x) + SOURCE_LANDING_PORTAL_LOCAL.x) * CELL,
    y: 2.8,
    z: (Number(origin.y) + SOURCE_LANDING_PORTAL_LOCAL.y - 5) * CELL,
    color: [1, 1, 1],
    intensity: 10.5,
    radius: 28,
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
  ...sourceApproachLights(origin)];
}

// THE APPROACH IS DROWNED IN RED, AT THE HALL'S OWN FIGURES.
//
// The concert hall is the reference for what a washed room looks like, and the
// reason it washes is not tone mapping or shadow terms — it is that its lamps
// are simply far stronger than Source's. Measured, from conservatory-lights.js:
//
//   hall-entrance-maintained-*   [1,0,0]  intensity 3.25  radius 42
//   hall-stage-door-maintained   [1,0,0]  intensity 3.60  radius 52
//   hall-galleria-*-foot         [1,0,0]  intensity 3.45  radius 48-54
//
//   source-landing:*             [1,0,0]  intensity 1.05-1.33  radius 12-30
//
// Roughly a third of the power and half the reach. These run at the hall's
// numbers, spaced down the approach so the whole sixty metres is inside one
// lamp's radius or another's.
//
// They need no flashing of their own: localLights() scales every lamp by
// sourceEmergencyFrame().lightScale, which is the authored contactor
// double-pulse on a 3.2s period, so the run blinks as one circuit.
//
// THE RUN STOPS AT THE STAIR. Past it the field is as dark as it has always
// been, and the only red the player carries onward is the torch's.
export const SOURCE_APPROACH_LAMP_SPACING = 20;   // cells
export const SOURCE_APPROACH_LAMP_INTENSITY = 3.4;
export const SOURCE_APPROACH_LAMP_RADIUS = 48;

// Between the FOH leaf and the foot of the first staircase, in landscape-local
// cells. Derived so moving either end moves the lamps with it.
// THE APPROACH IS THE SURPRISE, SO IT CANNOT BE VISIBLE BEFOREHAND.
//
// These run at the hall's radius — 48 METRES, which is ninety-six cells — and the
// first was authored six cells past the door. A lamp reaching ninety-six cells
// from three metres outside a shut door does not light the approach: it lights
// the Scene Dock through the aperture and paints the leaf itself. The room was
// red before the player touched anything, which spends the reveal before it
// happens.
//
// Standing them further off does not fix it — at this radius, far enough to not
// reach back through the door is far enough to leave the approach dark. So the
// containment is temporal, not spatial: the whole run is gated on the leaf
// (localLights, SOURCE_SIDE_LIGHT_IDS), dark until it opens and flooding in as
// it swings. The standoff below only keeps the door frame itself from blowing
// out at the moment it does.
// Enough that the leaf itself is not blown out by the nearest lamp; the rest of
// the containment is done by gating the whole run on the door (see localLights).
export const SOURCE_APPROACH_STANDOFF = 14;

export function sourceApproachSpan() {
  const stair = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
  const foot = stair ? stair.y + stair.run : SOURCE_LANDING_PORTAL_LOCAL.y - 8;
  const from = SOURCE_LANDING_PORTAL_LOCAL.y - SOURCE_APPROACH_STANDOFF;
  // Never past the stair itself, however the approach is retuned.
  return { from: Math.max(from, foot), to: foot };
}

export function sourceApproachLights(origin = { x: 0, y: 0 }) {
  const span = sourceApproachSpan();
  const out = [];
  let index = 0;
  for (let ly = span.from; ly >= span.to; ly -= SOURCE_APPROACH_LAMP_SPACING) {
    // Alternating sides of the walk, so the run reads as a corridor of lamps
    // rather than a single line receding to a point.
    const side = index % 2 ? 1 : -1;
    out.push({
      id: `source-approach-emergency-${index}`,
      kind: LIGHT_KIND.EMERGENCY,
      x: (Number(origin.x) + side * 5) * CELL,
      y: 3.1,
      z: (Number(origin.y) + ly) * CELL,
      color: [1, 0, 0],
      intensity: SOURCE_APPROACH_LAMP_INTENSITY,
      radius: SOURCE_APPROACH_LAMP_RADIUS,
      // OCCLUDED BY THE WALL, WHICH IS THE WHOLE POINT OF THE WALL.
      //
      // This was .86, copied from the hall along with the intensity and radius.
      // The hall wants it: its lamps are supposed to spill through the foyer
      // doors. Here it meant the run ignored eighty-six percent of architectural
      // occlusion and lit the Scene Dock straight THROUGH the shut FOH wall —
      // which reads as the wall being see-through and as the room already being
      // red. Both were the same number.
      //
      // A little is kept so the aperture itself glows rather than cutting a hard
      // stencil, but the wall stops the light.
      penetration: 0.08,
      castsShadow: false,
    });
    index += 1;
  }
  return out;
}

export function sourceLandingContract() {
  const lights = sourceLandingLights();
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
    lightIds: lights.map((light) => light.id),
    emergencyLightIds: lights.filter((light) => light.kind === LIGHT_KIND.EMERGENCY).map((light) => light.id),
  };
}
