import {SOURCE_EXIT_PASSAGE as C,sourceExitPassageContains,sourceExitPassageProgress} from '../data/source-exit-passage.js';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n,a)));
const reasons=new Set(['door','supported-shortcut','legacy-complete']);
const phases=new Set(['unentered','entered','backed-out','complete']);
const pose=value=>value&&['x','z','feet'].every(k=>Number.isFinite(value[k]))
  ?{x:value.x,z:value.z,feet:value.feet,chartId:Number.isInteger(value.chartId)&&value.chartId>=0?value.chartId:0,...(Number.isFinite(value.yaw)?{yaw:value.yaw}:{}),...(Number.isFinite(value.pitch)?{pitch:value.pitch}:{})}:null;
export const freshSourceExitPassage=()=>({version:1,phase:'unentered',enteredReason:null,enteredAt:null,entryPose:null,furthest:0});
export function normalizeSourceExitPassage(value,world={}){
  if(world.completed===true||world.status==='completed')return{...freshSourceExitPassage(),phase:'complete',enteredReason:reasons.has(value?.enteredReason)?value.enteredReason:'legacy-complete',
    enteredAt:Number.isFinite(value?.enteredAt)?Math.max(0,value.enteredAt):null,entryPose:pose(value?.entryPose),furthest:C.length};
  if(!value||value.version!==1)return freshSourceExitPassage();
  const reason=reasons.has(value.enteredReason)?value.enteredReason:null;
  return{version:1,phase:reason?(phases.has(value.phase)&&value.phase!=='unentered'?value.phase:'entered'):'unentered',
    enteredReason:reason,enteredAt:reason&&Number.isFinite(value.enteredAt)?Math.max(0,value.enteredAt):null,
    entryPose:reason?pose(value.entryPose):null,furthest:reason?clamp(value.furthest,0,C.length):0};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The host can also use this plane to prevent a tide-only movement from
// committing the onward journey. Ordinary movement and real jumps still cross.
export function sourceExitPassageEndCrossed(before,after,{bodyRadius=.22}={}){
  const radius=clamp(bodyRadius,.01,.8);
  return!!pose(before)&&!!pose(after)&&(before.chartId??0)===C.chartId&&(after.chartId??0)===C.chartId
    &&before.x<=C.completionX+radius&&after.x>C.completionX+radius
    &&Math.abs(after.z-C.door.z)<C.halfWidth-radius
    &&after.feet>=C.door.y-.04&&after.feet<=C.door.y+2.05;
}
// The host supplies actual door clearance and ACTUAL physical support. A side
// jump is not rejected by an invisible ending gate after its supported landing.
// This function owns no input, clock, body position, audio or Contact authority.
export function advanceSourceExitPassage(value,{before,after,doorPassable=false,supported=false,
  allowSupportedShortcut=true,bodyRadius=.22,bodyHeight=1.9,frozen=false,events=[]}={}){
  const previous=normalizeSourceExitPassage(value),next={...previous};
  if(frozen||previous.phase==='complete'||!pose(after)||(after.chartId??0)!==C.chartId||after.phase!=='catch'||after.recovery)
    return{state:same(value,previous)?value:previous,complete:false};
  const radius=clamp(bodyRadius,.01,.8),height=clamp(bodyHeight,.1,3),
    throughDoor=doorPassable&&pose(before)&&(before.chartId??0)===C.chartId
      &&before.x<=C.door.x+radius&&after.x>C.door.x+radius
      &&Math.abs(after.z-C.door.z)<C.doorHalfWidth-radius
      &&after.feet>=C.door.y-.04&&after.feet+height<=C.door.y+C.doorHeight+.01,
    landedShortcut=allowSupportedShortcut&&doorPassable&&supported&&!after.fall
      &&sourceExitPassageContains(after,{margin:radius})&&after.x>C.door.x+radius
      &&Math.abs(after.feet-C.door.y)<.04;
  let enteredNow=false;
  if(!next.enteredReason&&(throughDoor||landedShortcut)){
    next.phase='entered';next.enteredReason=throughDoor?'door':'supported-shortcut';
    next.enteredAt=Math.max(0,finite(after.elapsed));next.entryPose=pose(after);enteredNow=true;
    events.push({type:'source-exit-entered',reason:next.enteredReason,chartId:C.chartId,position:{x:after.x,y:after.feet,z:after.z}});
  }
  if(!next.enteredReason)return{state:same(value,previous)?value:previous,complete:false};
  const phase=after.x<C.door.x-radius?'backed-out':'entered';
  if(phase==='backed-out'&&next.phase!=='backed-out')
    events.push({type:'source-exit-backed-out',chartId:C.chartId,position:{x:after.x,y:after.feet,z:after.z}});
  next.phase=phase;
  next.furthest=Math.max(next.furthest,clamp(sourceExitPassageProgress(after),0,C.length));
  const crossedEnd=sourceExitPassageEndCrossed(before,after,{bodyRadius:radius});
  const completed=next.phase==='entered'&&(crossedEnd||enteredNow&&landedShortcut&&after.x>C.completionX+radius)
    &&Math.abs(after.z-C.door.z)<C.halfWidth-radius
    &&after.feet>=C.door.y-.04&&after.feet<=C.door.y+2.05;
  if(completed){
    next.phase='complete';next.furthest=C.length;
    events.push({type:'source-exit-passage-complete',chartId:C.chartId,position:{x:after.x,y:after.feet,z:after.z}});
  }
  return{state:same(value,next)?value:next,complete:!!completed};
}
