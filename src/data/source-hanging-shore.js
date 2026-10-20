// First nothingness. Authoring coordinates are Source-local metres; runtime
// cells are converted only at the boundary. Later Source is translated intact.
import { SOURCE_EXPOSED_STRATA } from './source-exposed-strata.js';
// Where the Scene Dock stands along the walk, in local metres. Source proper
// keeps its place; the dock is what moved in, so the walk from its FOH door to
// the deck is 170 m, about 35 s at the walk (option B, 18 October 2026).
const DOCK_Z = -204;
export const SOURCE_HANGING_SHORE = Object.freeze({
  version: 1, approachCells: 740, walkMetresPerSecond: 4.8, dockZ: DOCK_Z,
  portal: Object.freeze({ x: 4, z: -8 + DOCK_Z }),
  room: Object.freeze({ minX: -6, maxX: 6, minZ: -8.5 + DOCK_Z, maxZ: 9 + DOCK_Z, floor: 0, underside: -.32, roof: 5.5 }),
  bank: SOURCE_EXPOSED_STRATA.bank,
  ledge: Object.freeze({ minX: -14, maxX: 14, minZ: -390, maxZ: -386, floor: 4.2, underside: 3.55 }),
  lift: Object.freeze({ minX: 0, maxX: 8, minZ: -386, maxZ: -382, bottom: 0, top: 4.2, thickness: .24, callRadius: 34, speed: .7, boardingSeconds: .8 }),
  entry: SOURCE_EXPOSED_STRATA.entry,
  // Walk this far out of the open door and the Scene Dock is taken back over
  // these seconds: its things first, its walls, its door last. HUSH is standing
  // in the doorway as it goes, coming through from `hushFrom` to `hushTo`.
  roomTake: Object.freeze({ distance: 16, seconds: 9, hushFrom: .45, hushTo: .95 }),
  // WHAT THE BUILDING LEAVES. Pieces of the remembered building stand on the
  // void floor at their real size, off the line to the bank and irregularly
  // spaced, `fromDoor` metres out. Each carries its room's tone, heard only
  // close by. One you have passed is gone the next time you look back.
  // Nothing about them is inspected or picked up.
  pieces: Object.freeze([
    Object.freeze({ id: 'practice-stand', mesh: 'music_stand', x: 2.2, fromDoor: 40, yaw: .6, radius: .45, tone: 'practice' }),
    Object.freeze({ id: 'corridor-radiator', mesh: 'arch_radiator_public', x: 9.5, fromDoor: 82, yaw: -.4, radius: .85, tone: 'radiator' }),
    Object.freeze({ id: 'hall-chair', mesh: 'chair', x: -5, fromDoor: 118, yaw: .7, radius: .5, tone: 'hall' }),
    Object.freeze({ id: 'speaker-cabinet', mesh: 'speaker_cabinet', x: 7, fromDoor: 150, yaw: -.8, radius: .6, tone: 'speaker' }),
  ]),
  // A piece is gone once you are this far past it and it is out of view.
  pieceGone: Object.freeze({ pastMetres: 6, viewCos: .3 }),
});
// A piece's place on the walk, in local metres.
export function sourceShorePieceAt(piece) {
  return { x: piece.x, z: SOURCE_HANGING_SHORE.portal.z - piece.fromDoor };
}

// The bank's actual closed prisms live in source-exposed-strata.js. Keeping a
// second set of enclosing wall boxes here would turn the open cleft into a maze.
export function sourceShoreContains(bounds,x,z,margin=0) {
  return x >= bounds.minX+margin && x <= bounds.maxX-margin && z >= bounds.minZ+margin && z <= bounds.maxZ-margin;
}
export function sourceShoreDistance(bounds,x,z) {
  const minZ = bounds.minZ ?? bounds.backZ, maxZ = bounds.maxZ ?? bounds.frontZ;
  return Math.hypot(Math.max(bounds.minX-x,0,x-bounds.maxX),Math.max(minZ-z,0,z-maxZ));
}
export function sourceShoreBounds(origin = { x:0, y:0 }) {
  const ox = Number(origin.x||0)*.5, oz = Number(origin.y||0)*.5;
  const translated = (shape) => Object.fromEntries(Object.entries(shape).map(([k,v]) => [k,
    ['minX','maxX','properX'].includes(k)?v+ox:
      ['minZ','maxZ','frontZ','backZ','turnZ','releaseZ'].includes(k)?v+oz:v]));
  return {
    originMetres:{x:ox,z:oz},
    room:translated(SOURCE_HANGING_SHORE.room), bank:translated(SOURCE_HANGING_SHORE.bank),
    ledge:translated(SOURCE_HANGING_SHORE.ledge), lift:translated(SOURCE_HANGING_SHORE.lift),
    facade:'exposed-strata',entry:translated(SOURCE_HANGING_SHORE.entry),walls:[],
    doorway:{centreX:ox+SOURCE_HANGING_SHORE.portal.x,doorZ:oz+SOURCE_HANGING_SHORE.portal.z,width:1,height:2.2},
    rearDoorway:{centreX:ox+.5,doorZ:oz+SOURCE_HANGING_SHORE.room.maxZ-.5,width:3.4,height:4.5},
  };
}
export const SOURCE_SHORE_DIRECT_METRES = Math.hypot(
  (SOURCE_HANGING_SHORE.lift.minX+SOURCE_HANGING_SHORE.lift.maxX)/2-SOURCE_HANGING_SHORE.portal.x,
  SOURCE_HANGING_SHORE.lift.maxZ-SOURCE_HANGING_SHORE.portal.z,
);
export const SOURCE_SHORE_DIRECT_SECONDS = SOURCE_SHORE_DIRECT_METRES / SOURCE_HANGING_SHORE.walkMetresPerSecond;
