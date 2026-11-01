// The passage's body queries share the model's panels, treads and hinge data.
// Coordinates are bus-local metres, never logical cells or camera positions.
import { OUTSKIRTS_BUS_PASSAGE, busPassageCollisionBoxes } from '../data/outskirts-bus-passage.js';

const EPSILON = 1e-9;
const PANELS = busPassageCollisionBoxes();
const radius = OUTSKIRTS_BUS_PASSAGE.bodyRadius;

export function busPassageLampPower(transit={}){
  const since=transit.trapAt==null?-Infinity:Number(transit.clock)-Number(transit.trapAt);
  const strips=[.35,1.05,1.85,2.65].map(at=>{const t=Math.max(0,Math.min(1,(since-at)/.12));return 1-t*t*(3-2*t);});
  return{front:.14+.86*strips[0],rear:busPassageRearTube(transit),face:.72,strips};
}

// The rear tube is the exit's own light. It outlives the trap, flinches on the
// first two pulls and the third takes it. The hooded lamp on her stays, so
// what is left lit in the bus is her.
function busPassageRearTube(transit={}){
  if(transit.tryAt==null)return .72;
  const t=Number(transit.clock)-transit.tryAt,{pulls}=OUTSKIRTS_BUS_PASSAGE.exit,last=pulls[pulls.length-1];
  if(t>=last)return t<last+.08?.10:t<last+.20?.46:.04;
  return pulls.some(at=>t>=at&&t<at+.09)?.24:.72;
}

// The street's torch runs on its own failing clock, and that clock must not
// choose the moment the bus goes dark. Once the door has shut the torch answers
// the scene instead: a sag at each dying strip, at each pull, a near-failure
// when the rear tube goes, one catch as she starts to part, and then it stays
// up, because she is what you are here to see.
export function busPassageTorchDirected(transit={}){
  if(transit.trapAt==null||transit.exited||transit.interior?.active)return null;
  const clock=Number(transit.clock),{pulls}=OUTSKIRTS_BUS_PASSAGE.exit;let level=1;
  const sag=(at,depth,seconds)=>{const t=clock-at;if(t>=0&&t<seconds)level=Math.min(level,1-depth*Math.sin(Math.PI*t/seconds));};
  for(const at of[.35,1.05,1.85,2.65])sag(transit.trapAt+at,.30,.16);
  if(transit.tryAt!=null){
    pulls.slice(0,-1).forEach(at=>sag(transit.tryAt+at,.22,.14));
    sag(transit.tryAt+pulls[pulls.length-1],.74,.36);
  }
  if(transit.openAt!=null)sag(transit.openAt+.10,.50,.40);
  return level;
}

// 0..1 at each pull, gone by the next: the body taking the door's refusal.
export function busPassagePullJolt(elapsed=0){
  const{pulls,kicks}=OUTSKIRTS_BUS_PASSAGE.exit,top=kicks[kicks.length-1];
  return pulls.reduce((sum,at,i)=>{const x=elapsed-at;return x<0?sum:sum+kicks[i]/top*(x<.05?x/.05:Math.exp(-(x-.05)/.07));},0);
}

export function busPassageOpening(transit={}){
  const elapsed=transit.openAt==null?0:Math.max(0,Number(transit.clock)-transit.openAt),duration=OUTSKIRTS_BUS_PASSAGE.bodyPassage.seconds;
  const linear=Math.max(0,Math.min(1,(elapsed-.32)/(duration-.32))),progress=linear*linear*(3-2*linear);
  return{active:transit.openAt!=null,progress,ready:transit.openAt!=null&&elapsed>=duration,openAt:transit.openAt??null};
}

export function busPassageExitAngle(transit={}){
  if(transit.tryAt==null)return 0;
  // Each pull drives the leaf into its jam and it springs back. It never
  // swings inward, and nothing about it says it might give.
  const t=Math.max(0,Number(transit.clock)-transit.tryAt),exit=OUTSKIRTS_BUS_PASSAGE.exit;
  return t>=exit.attemptSeconds?0:busPassagePullJolt(t)*exit.kicks[exit.kicks.length-1];
}

export function busPassageBodyCrossing(from,to,{ready=false}={}){
  const c=OUTSKIRTS_BUS_PASSAGE.bodyPassage;
  if(!ready||![from?.x,from?.z,to?.x,to?.z].every(Number.isFinite)||from.z>=c.planeZ||to.z<c.planeZ||to.z<=from.z)return null;
  const t=(c.planeZ-from.z)/(to.z-from.z),x=from.x+(to.x-from.x)*t;
  return Math.abs(x-c.centreX)<=c.width/2-radius-EPSILON?{t,x,z:c.planeZ}:null;
}

function pointInBox(point, box, margin = radius) {
  return point.x >= box.minX - margin - EPSILON && point.x <= box.maxX + margin + EPSILON
    && point.z >= box.minZ - margin - EPSILON && point.z <= box.maxZ + margin + EPSILON;
}

// A slab intersection covers the complete walked segment. Endpoint-only tests
// can jump across a thin jamb or leaf even when both landings are clear.
function segmentHitsBox(from, to, box, margin = radius) {
  let enter = 0, leave = 1;
  for (const [axis, min, max] of [['x', box.minX - margin, box.maxX + margin],
    ['z', box.minZ - margin, box.maxZ + margin]]) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < EPSILON) {
      if (from[axis] < min - EPSILON || from[axis] > max + EPSILON) return false;
      continue;
    }
    const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave + EPSILON) return false;
  }
  return leave >= -EPSILON && enter <= 1 + EPSILON;
}

function leafVertices(door, angle, obstacle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [obstacle.minX, obstacle.maxX].flatMap(x => [obstacle.minZ, obstacle.maxZ].map(z => ({
    // Exact sourceMatrix rotation, rather than a second doorway convention.
    x: door.hinge[0] + x * c + z * s,
    z: door.hinge[2] - x * s + z * c,
  })));
}

// SAT between a real rotating leaf and the convex swept square body. Merely
// inflating a leaf in its own rotated axes undercounts the body's corners;
// these axes include both shapes and the walked segment's perpendicular.
function leafHitsSweep(from, to, door, angle, obstacle) {
  const vertices = leafVertices(door, angle, obstacle), c = Math.cos(angle), s = Math.sin(angle);
  const axes = [[1, 0], [0, 1], [c, -s], [s, c], [-(to.z - from.z), to.x - from.x]];
  for (const [ax, az] of axes) {
    if (Math.abs(ax) + Math.abs(az) < EPSILON) continue;
    const projected = vertices.map(p => p.x * ax + p.z * az);
    const body = radius * (Math.abs(ax) + Math.abs(az));
    const a = from.x * ax + from.z * az, b = to.x * ax + to.z * az;
    if (Math.max(a, b) + body < Math.min(...projected) - EPSILON
      || Math.min(a, b) - body > Math.max(...projected) + EPSILON) return false;
  }
  return true;
}

/** True when the swept body meets a real panel, seat, pole, figure or leaf.
 * A legacy save may start inside a newly present collider. It can leave that
 * overlap for a completely clear landing, but cannot pass through any other
 * collider on the way, nor move farther within an occupied destination.
 */
export function sweptBusPassageRefuses(fromLocal, toLocal, {
  entryAngle = OUTSKIRTS_BUS_PASSAGE.entry.openYaw,
  exitAngle = 0,
  bodyReady = false,
} = {}) {
  if (![fromLocal?.x, fromLocal?.z, toLocal?.x, toLocal?.z, entryAngle, exitAngle].every(Number.isFinite)) return true;
  const c = OUTSKIRTS_BUS_PASSAGE;
  const panels=bodyReady?[...PANELS.slice(0,-1),...c.bodyPassage.walls]:PANELS;
  const leaves = [[c.entry, entryAngle], [c.exit, exitAngle]]
    .flatMap(([door, angle]) => door.leafObstacles.map(obstacle => ({ door, angle, obstacle })));
  if (panels.some(box => pointInBox(toLocal, box))
    || leaves.some(({ door, angle, obstacle }) => leafHitsSweep(toLocal, toLocal, door, angle, obstacle))) return true;
  return panels.some(box => !pointInBox(fromLocal, box) && segmentHitsBox(fromLocal, toLocal, box))
    || leaves.some(({ door, angle, obstacle }) => !leafHitsSweep(fromLocal, fromLocal, door, angle, obstacle)
      && leafHitsSweep(fromLocal, toLocal, door, angle, obstacle));
}

/** Physical regions used by the retained encounter, independent of view yaw.
 * They overlap deliberately: proximity may open the front door before a body
 * reaches it, and neither looking away nor retreating changes its spent state.
 */
export function busPassageLocation(point) {
  const c = OUTSKIRTS_BUS_PASSAGE;
  if (![point?.x, point?.z].every(Number.isFinite)) {
    return { entryNear: false, inside: false, closeWoman: false, exited: false };
  }
  const entryZ = (c.entry.fromZ + c.entry.toZ) / 2;
  const exitZ = (c.exit.fromZ + c.exit.toZ) / 2;
  const inside = Math.abs(point.x) < 1.13 && point.z > -4.42 && point.z < 4.43;
  return {
    entryNear: Math.hypot(point.x - c.entry.hinge[0], point.z - entryZ) < 2.25,
    inside,
    closeWoman: inside && Math.hypot(point.x - c.woman.x, point.z - c.woman.z) < 1.6,
    exited: point.x > c.exit.hinge[0] + radius && Math.abs(point.z - exitZ) < 1.25,
  };
}
