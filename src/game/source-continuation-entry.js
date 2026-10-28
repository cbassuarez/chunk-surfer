import {SOURCE_CONTINUATION,continuationDoors} from '../data/source-continuation.js';
import {SOURCE_EARTHFALL} from '../data/source-earthfall.js';
import {normalizeSourceContinuation} from './source-continuation.js';

export function sourceContinuationEntranceOffset(){
  const door=continuationDoors().find(d=>d.id==='wrong-entry-return');
  return{x:door.x,y:door.y-SOURCE_EARTHFALL.lowerFloor,z:door.z-SOURCE_EARTHFALL.passage.exitZ};
}

// Only a completed physical Earthfall may transfer its body. Keep the exact
// carried orientation and doorway clearance, rather than snapping to a spawn.
export function continuationFromEarthfall(checkpoint,fall){
  if(fall?.status!=='completed'||fall.runId!==checkpoint?.runId||!['x','z','feet','yaw','pitch'].every(k=>Number.isFinite(fall[k])))return null;
  const offset=sourceContinuationEntranceOffset();
  const body={x:fall.x+offset.x,z:fall.z+offset.z,feet:fall.feet+offset.y,yaw:fall.yaw,pitch:fall.pitch,level:0};
  return normalizeSourceContinuation({...checkpoint,layoutVersion:SOURCE_CONTINUATION.layoutVersion,status:'active',phase:'wrong-return',...body,
    fall:null,recovery:null,lastSafe:body,doorOpen:{...checkpoint.doorOpen,'wrong-entry-return':true},doorMotion:{}});
}
