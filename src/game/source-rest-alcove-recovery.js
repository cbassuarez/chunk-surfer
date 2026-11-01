import {SOURCE_REST_ALCOVE,SOURCE_REST_ALCOVE_SOLIDS} from '../data/source-rest-alcove.js';
import {SOURCE_CONTINUATION as C,continuationChartSolids,continuationChartSurfaces,continuationSupportAt,continuationSurfaceContains} from '../data/source-continuation.js';

const overlaps=(pose,solid)=>pose.feet+C.bodyHeight>solid.minY+.04&&pose.feet<solid.maxY-.04
  &&pose.x+C.bodyRadius>solid.minX&&pose.x-C.bodyRadius<solid.maxX
  &&pose.z+C.bodyRadius>solid.minZ&&pose.z-C.bodyRadius<solid.maxZ;
const supported=pose=>continuationSupportAt(pose.x,pose.z,pose,{minY:pose.feet-.02,maxY:pose.feet+.02});
function oldObstruction(pose){
  return continuationChartSolids(pose).some(s=>!s.id.startsWith('rest-alcove-')&&s.role!=='closure'&&overlaps(pose,s))
    ||continuationChartSurfaces(pose).some(s=>s.y>pose.feet+.04&&s.y-s.thickness<pose.feet+C.bodyHeight-.03&&continuationSurfaceContains(s,pose.x,pose.z));
}

// An ordinary save can predate these six partitions without predating the
// Source layout. Repair only a formerly supported body now inside a new
// partition. Every other invalid-pose decision stays with the existing owner.
export function recoverSourceRestAlcoveCheckpoint(value){
  if(!value||value.version!==1||value.layoutVersion!==C.layoutVersion||value.encounterId!==C.encounterId
    ||value.status!=='active'||value.phase!=='wrong-return'||value.chartId!==0
    ||!['x','z','feet'].every(k=>Number.isFinite(value[k]))||Math.abs(value.feet-SOURCE_REST_ALCOVE.feet)>1e-7
    ||value.fall||value.recovery||value.reveal||value.cameraTransit||value.bodyTransit)return value;
  if(!SOURCE_REST_ALCOVE_SOLIDS.some(s=>overlaps(value,s))||!supported(value)||oldObstruction(value))return value;
  const pose={...SOURCE_REST_ALCOVE.discovery,feet:SOURCE_REST_ALCOVE.feet,chartId:0,level:0,phase:'wrong-return',heading:SOURCE_REST_ALCOVE.discovery.yaw};
  if(!supported(pose)||oldObstruction(pose)||SOURCE_REST_ALCOVE_SOLIDS.some(s=>overlaps(pose,s)))return value;
  return {...value,...pose,lastSafe:{...value.lastSafe,...pose},velocity:{x:0,z:0},accumulator:0,jumpHeld:false,
    grace:Math.max(Number(value.grace)||0,C.graceSeconds)};
}
