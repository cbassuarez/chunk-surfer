import {SOURCE_CONTINUATION as C,continuationDoors} from '../data/source-continuation.js';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const entryDoor=()=>continuationDoors().find(door=>door.id==='wrong-entry-return');

// This is on the retained Earthfall throat, behind its real return leaf. The
// actor never relocates to the player or to a newly selected route position.
export function continuationPursuitOrigin(){
  const door=entryDoor(),normal=door.normal||{x:0,z:1};
  return{x:door.x+normal.x*C.hush.entryOutsideMetres,z:door.z+normal.z*C.hush.entryOutsideMetres,
    feet:door.y,chartId:door.chartId||0,level:0,phase:'wrong-return',heading:Math.atan2(-normal.x,normal.z)||0};
}
export const freshContinuationArrival=()=>({version:1,stage:'waiting',elapsed:0,doorId:'wrong-entry-return',chapter:'II'});
export function normalizeContinuationArrival(value,{active=false}={}){
  if(!value||value.version!==1||value.doorId!=='wrong-entry-return')return null;
  // Explicit existing/migrated active actors keep their physical continuity.
  const stage=value.stage==='waiting'&&!active?'waiting':'entered';
  return{version:1,stage,elapsed:Math.max(0,Math.min(C.hush.entryDelaySeconds,finite(value.elapsed))),
    doorId:'wrong-entry-return',chapter:'II'};
}
export function normalizeContinuationArrivalReceipts(value){
  if(!Array.isArray(value))return[];
  const receipts=[];
  for(const entry of value){
    if(!entry||!['II','III'].includes(entry.chapter)||receipts.some(r=>r.chapter===entry.chapter))continue;
    if(![entry.x,entry.z,entry.feet,entry.at].every(Number.isFinite))continue;
    if(entry.chapter==='III'&&(entry.doorId!=='journey-catch-gate'||entry.portalId!=='catch-closure'))continue;
    receipts.push({chapter:entry.chapter,doorId:entry.chapter==='II'?'wrong-entry-return':'journey-catch-gate',
      ...(entry.chapter==='III'?{portalId:'catch-closure',serial:Math.max(0,Math.round(finite(entry.serial)))}:{}),
      x:entry.x,z:entry.z,feet:entry.feet,chartId:Math.max(0,Math.round(finite(entry.chartId))),at:Math.max(0,entry.at)});
  }
  return receipts;
}
export function normalizeContinuationGateLead(value){
  return value?.doorId==='journey-catch-gate'&&Number.isFinite(value.enteredAt)
    ?{doorId:'journey-catch-gate',enteredAt:Math.max(0,value.enteredAt),elapsed:Math.min(C.hush.thresholdArrivalDelaySeconds,Math.max(0,finite(value.elapsed)))}:null;
}
export function noteContinuationCatchEntry(actor,state){
  if(!actor.catchEntry&&!actor.arrivals.some(r=>r.chapter==='III'))
    actor.catchEntry={doorId:'journey-catch-gate',enteredAt:state.elapsed,elapsed:0};
}
export function continuationHushGateWaiting(actor,next){
  if(!actor.catchEntry||actor.catchEntry.elapsed+1e-8>=C.hush.thresholdArrivalDelaySeconds||actor.chartId!==4)return false;
  const gate=C.wrongReturn.threshold;
  return actor.x>gate.x&&next.x<=gate.x+C.hush.radius+.03&&Math.abs(next.z-gate.z)<gate.halfWidth+C.hush.radius&&Math.abs(actor.feet-gate.y)<.5;
}

// Called only by the accepted continuation clock. Loading, pause, Contact and
// carried recovery never spend this lead-in. The first visible frame retains
// a complete warning interval before the actor can spend walked distance.
export function advanceContinuationArrival(actor,{dt=0,player,frozen=false,events=[]}={}){
  if(actor.arrival?.stage!=='waiting'||actor.active)return false;
  if(frozen||!(dt>0))return true;
  actor.arrival.elapsed=Math.min(C.hush.entryDelaySeconds,actor.arrival.elapsed+dt);
  if(actor.arrival.elapsed+1e-8<C.hush.entryDelaySeconds)return true;
  actor.arrival.stage='entered';actor.active=true;actor.armed=true;
  actor.elapsed=0;actor.mode='warning';actor.warningAnnounced=false;
  const door=entryDoor(),motion=player.doorMotion?.[door.id],progress=motion?Math.min(1,Math.max(0,(player.elapsed-motion.startedAt)/(motion.duration||1))):1;
  const fraction=motion?motion.from+(motion.to-motion.from)*progress:player.doorOpen?.[door.id]?1:0;
  if(fraction<1){
    player.doorOpen[door.id]=true;
    player.doorMotion[door.id]={from:fraction,to:1,startedAt:player.elapsed,duration:C.doorSwingSeconds*(1-fraction)};
    events.push({type:'door',id:door.id,open:true,actor:actor.id,position:{x:door.x,y:door.y,z:door.z},chartId:door.chartId||0});
  }
  const receipt={chapter:'II',doorId:door.id,x:actor.x,z:actor.z,feet:actor.feet,chartId:actor.chartId||0,at:player.elapsed};
  actor.arrivals.push(receipt);events.push({type:'hush-arrival',...receipt,position:{x:actor.x,y:actor.feet,z:actor.z}});
  return true;
}

// III is reached by this same actor replaying the player's actual gate fold.
// Its receiving-side notice is visible from the overhead camera; no spawn or
// chart jump is fabricated to keep up with a fast player.
export function continuationHushThresholdArrival(actor,receipt,player,events){
  if(receipt.id!=='catch-closure'||receipt.toChartId!==0||receipt.side!=='a'||actor.arrivals.some(r=>r.chapter==='III'))return false;
  const arrival={chapter:'III',doorId:'journey-catch-gate',portalId:receipt.id,serial:receipt.serial||actor.foldSerial||0,
    x:actor.x,z:actor.z,feet:actor.feet,chartId:actor.chartId,at:player.elapsed};
  actor.arrivals.push(arrival);actor.mode='notice';actor.notice=Math.max(actor.notice||0,C.hush.thresholdNoticeSeconds);
  events.push({type:'hush-arrival',...arrival,position:{x:actor.x,y:actor.feet,z:actor.z}});
  events.push({type:'hush-warning',...arrival,position:{x:actor.x,y:actor.feet,z:actor.z}});
  return true;
}
