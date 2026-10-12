// First nothingness. Authoring coordinates are Source-local metres; runtime
// cells are converted only at the boundary. Later Source is translated intact.
import { SOURCE_EXPOSED_STRATA } from './source-exposed-strata.js';
export const SOURCE_HANGING_SHORE = Object.freeze({
  version: 1, approachCells: 740, walkMetresPerSecond: 4.8,
  portal: Object.freeze({ x: 4, z: -8 }),
  room: Object.freeze({ minX: -6, maxX: 6, minZ: -8.5, maxZ: 9, floor: 0, underside: -.32, roof: 5.5 }),
  bank: SOURCE_EXPOSED_STRATA.bank,
  ledge: Object.freeze({ minX: -14, maxX: 14, minZ: -390, maxZ: -386, floor: 4.2, underside: 3.55 }),
  lift: Object.freeze({ minX: 0, maxX: 8, minZ: -386, maxZ: -382, bottom: 0, top: 4.2, thickness: .24, callRadius: 34, speed: .7, boardingSeconds: .8 }),
  entry: SOURCE_EXPOSED_STRATA.entry,
  adaptationSeconds: 14, blindSeconds: 6.3,
});

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
    doorway:{centreX:ox+4,doorZ:oz-8,width:1,height:2.2},
    rearDoorway:{centreX:ox+.5,doorZ:oz+8.5,width:3.4,height:4.5},
  };
}
export const SOURCE_SHORE_DIRECT_METRES = Math.hypot(
  (SOURCE_HANGING_SHORE.lift.minX+SOURCE_HANGING_SHORE.lift.maxX)/2-SOURCE_HANGING_SHORE.portal.x,
  SOURCE_HANGING_SHORE.lift.maxZ-SOURCE_HANGING_SHORE.portal.z,
);
export const SOURCE_SHORE_DIRECT_SECONDS = SOURCE_SHORE_DIRECT_METRES / SOURCE_HANGING_SHORE.walkMetresPerSecond;
