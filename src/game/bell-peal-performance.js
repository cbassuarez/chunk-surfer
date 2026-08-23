import { PLACE_MS, STEDMAN_TRIPLES_84_WITH_TENOR } from '../data/bell-tower.js';

export const PEAL_ASSIST_MODE = Object.freeze({
  STANDARD:'standard',
  GUIDED:'guided',
  WIDE:'wide',
});

export const TENOR_TIMING = Object.freeze({
  perfectMs:90,
  goodMs:180,
  acceptedMs:260,
  widePerfectMs:140,
  wideGoodMs:260,
  wideAcceptedMs:400,
  approachMs:900,
  retryMs:1200,
  countInBeatMs:600,
  countInBeats:4,
  hitchRecallMs:520,
});

export const PEAL_COUNT_IN_CALLS=Object.freeze(['LOOK TO',"TREBLE'S GOING",'SHE\'S GONE','']);

// The Surfer does not change the Stedman data or its tempo. It interferes with
// the band which is allowed to sound that data. The curve is musical-time
// based, so a hitch, retry, reload, or a slow render frame cannot move a rope
// into a different chapter of the haunting.
export const PEAL_INTERFERENCE=Object.freeze({
  learningMs:24_000,
  removalStepMs:7_500,
  returnAtMs:90_000,
  returnStepMs:6_000,
  removalOrder:Object.freeze([2,7,3,6,4,5,1]),
});

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const strokeForRow=(row)=>row%2?'back':'hand';
const rowDurationMs=(row)=>PLACE_MS*8+(strokeForRow(row)==='hand'?PLACE_MS:0);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function pealMusicalElapsedForRow(rowIndex=0){
  const row=Math.max(0,Math.min(84,Math.floor(Number(rowIndex)||0)));
  const pairs=Math.floor(row/2);
  return pairs*(PLACE_MS*17)+(row%2?PLACE_MS*9:0);
}

export function pealInterferenceAt(elapsedMs=0){
  const elapsed=Math.max(0,Number(elapsedMs)||0),all=[1,2,3,4,5,6,7];
  const order=PEAL_INTERFERENCE.removalOrder;
  let removedCount=0,restoredCount=0,stage='learning';
  if(elapsed>=PEAL_INTERFERENCE.returnAtMs){
    stage='returning';
    removedCount=order.length;
    restoredCount=Math.min(order.length,Math.floor((elapsed-PEAL_INTERFERENCE.returnAtMs)/PEAL_INTERFERENCE.returnStepMs)+1);
    if(restoredCount>=order.length)stage='restored';
  }else if(elapsed>=PEAL_INTERFERENCE.learningMs){
    removedCount=Math.min(order.length,Math.floor((elapsed-PEAL_INTERFERENCE.learningMs)/PEAL_INTERFERENCE.removalStepMs)+1);
    stage=removedCount>=order.length?'solo':'subtracting';
  }
  const removed=new Set(order.slice(0,removedCount));
  if(restoredCount)for(const bell of [...order].reverse().slice(0,restoredCount))removed.delete(bell);
  const activeAutomaticBells=all.filter((bell)=>!removed.has(bell));
  const activeBells=[...activeAutomaticBells,8].sort((a,b)=>a-b);
  const activeCount=activeAutomaticBells.length;
  const hud=Object.freeze({
    title:activeCount>=6,
    phrases:activeCount>=7,
    progress:activeCount>=5,
    stroke:activeCount>=4,
    permutation:activeCount>=3,
    members:true,
    timing:true,
    judgement:true,
    help:activeCount>=6,
  });
  const surferLine=stage==='learning'?'EIGHT ROPES / ONE TOUCH'
    :stage==='subtracting'?`THE SURFER LIFTS ${removed.size} FROM THE ROW`
      :stage==='solo'?'ONLY YOUR ROPE REMAINS'
        :stage==='returning'?`${activeCount} OF 7 VOICES RETURNED`
          :'THE BAND IS WHOLE';
  return Object.freeze({
    elapsedMs:elapsed,stage,activeAutomaticBells:Object.freeze(activeAutomaticBells),activeBells:Object.freeze(activeBells),
    removedBells:Object.freeze(all.filter((bell)=>removed.has(bell))),removedCount:removed.size,restoredCount,
    hud,surferLine,pressure:removed.size/order.length,
  });
}

export function normalizePealAssistMode(value){
  return Object.values(PEAL_ASSIST_MODE).includes(value)?value:PEAL_ASSIST_MODE.STANDARD;
}

export function timingForPealMode(value){
  const mode=normalizePealAssistMode(value);
  return mode===PEAL_ASSIST_MODE.WIDE
    ?Object.freeze({perfectMs:TENOR_TIMING.widePerfectMs,goodMs:TENOR_TIMING.wideGoodMs,acceptedMs:TENOR_TIMING.wideAcceptedMs})
    :Object.freeze({perfectMs:TENOR_TIMING.perfectMs,goodMs:TENOR_TIMING.goodMs,acceptedMs:TENOR_TIMING.acceptedMs});
}

// AudioContext time is the transport. performance.now only tells us how old a
// browser input event is; it never advances the score. Output latency is
// removed from judgement time so the contracting cue and the sound arriving at
// the player's ears agree on where contact is.
export function createBellPealClock({
  context=null,
  performanceApi=globalThis.performance,
  timingOffsetMs=0,
}={}){
  const perfNow=()=>finite(performanceApi?.now?.(),Date.now());
  const sourceNow=()=>context?finite(context.currentTime,0)*1000:perfNow();
  let anchorSourceMs=sourceNow(),baseTransportMs=0,running=false;
  let manualOffsetMs=Math.max(-250,Math.min(250,finite(timingOffsetMs,0)));
  const estimatedLatencyMs=()=>Math.max(0,(finite(context?.baseLatency,0)+finite(context?.outputLatency,0))*1000);
  function outputTimestamp(){
    if(typeof context?.getOutputTimestamp!=='function')return null;
    try{
      const value=context.getOutputTimestamp();
      const contextMs=finite(value?.contextTime,Number.NaN)*1000,performanceMs=finite(value?.performanceTime,Number.NaN);
      return Number.isFinite(contextMs)&&Number.isFinite(performanceMs)?{contextMs,performanceMs}:null;
    }catch(_){return null;}
  }
  function nowMs(){return running?baseTransportMs+Math.max(0,sourceNow()-anchorSourceMs):baseTransportMs;}
  function start(offsetMs=0){baseTransportMs=Math.max(0,finite(offsetMs,0));anchorSourceMs=sourceNow();running=true;return nowMs();}
  function freeze(){baseTransportMs=nowMs();anchorSourceMs=sourceNow();running=false;return baseTransportMs;}
  function resume(){if(!running){anchorSourceMs=sourceNow();running=true;}return nowMs();}
  function eventAgeMs(timeStamp){
    const stamp=finite(timeStamp,perfNow()),current=perfNow();
    // Safari may expose epoch-based timestamps while performance.now is
    // navigation-relative. An incompatible stamp is safer treated as "now".
    const age=current-stamp;
    return Number.isFinite(age)&&age>=0&&age<60_000?age:0;
  }
  function transportAtPerformanceMs(timeStamp){
    if(!running)return baseTransportMs;
    const currentPerformanceMs=perfNow(),stamp=currentPerformanceMs-eventAgeMs(timeStamp),output=outputTimestamp();
    if(output){
      const sourceAtEvent=output.contextMs+(stamp-output.performanceMs);
      return baseTransportMs+(sourceAtEvent-anchorSourceMs);
    }
    return nowMs()-eventAgeMs(stamp)-estimatedLatencyMs();
  }
  function automaticLatencyMs(){
    const output=outputTimestamp();
    return output?Math.max(0,sourceNow()-(output.contextMs+(perfNow()-output.performanceMs))):estimatedLatencyMs();
  }
  function judgementNowMs(){return transportAtPerformanceMs(perfNow())+manualOffsetMs;}
  function eventTransportMs(timeStamp){return transportAtPerformanceMs(timeStamp)+manualOffsetMs;}
  function setTimingOffsetMs(value){manualOffsetMs=Math.max(-250,Math.min(250,finite(value,0)));return manualOffsetMs;}
  function snapshot(){return{
    running,transportMs:nowMs(),judgementMs:judgementNowMs(),timingOffsetMs:manualOffsetMs,
    baseLatencyMs:finite(context?.baseLatency,0)*1000,outputLatencyMs:finite(context?.outputLatency,0)*1000,
    automaticLatencyMs:automaticLatencyMs(),timestampMapping:outputTimestamp()?'output-timestamp':context?'latency-estimate':'monotonic-fallback',source:context?'audio-context':'monotonic-fallback',
  };}
  return{start,freeze,resume,nowMs,judgementNowMs,eventTransportMs,setTimingOffsetMs,snapshot};
}

export function tenorTargetForRow(rowIndex,rowStartMs=0){
  const index=Math.max(0,Math.min(STEDMAN_TRIPLES_84_WITH_TENOR.length-1,Math.floor(Number(rowIndex)||0)));
  const row=STEDMAN_TRIPLES_84_WITH_TENOR[index];
  if(row[7]!==8)throw new Error(`Stedman row ${index+1} does not carry the tenor in eighth place`);
  return{row:index,rowNumber:index+1,row:[...row],stroke:strokeForRow(index),atMs:Number(rowStartMs)+PLACE_MS*7};
}

export function gradeTenorTiming(deltaMs,mode=PEAL_ASSIST_MODE.STANDARD){
  const absolute=Math.abs(Number(deltaMs)||0),timing=timingForPealMode(mode);
  if(absolute<=timing.perfectMs)return'perfect';
  if(absolute<=timing.goodMs)return'good';
  if(absolute<=timing.acceptedMs)return'accepted';
  return'miss';
}

export function createBellPealPerformance({
  initialRow=0,
  mode=PEAL_ASSIST_MODE.STANDARD,
  clock=null,
  onStrike=()=>{},
  onRow=()=>{},
  onMiss=()=>{},
  onRecall=()=>{},
  onComplete=()=>{},
}={}){
  const assistMode=normalizePealAssistMode(mode),timing=timingForPealMode(assistMode);
  const initialRowIndex=Math.max(0,Math.min(84,Math.floor(Number(initialRow)||0)));
  const musicalOffsetMs=pealMusicalElapsedForRow(initialRowIndex);
  let clockMs=0,phase='idle',phaseStartedMs=0,rowIndex=initialRowIndex;
  let rowStartedMs=0,automaticScheduled=false,tenorResolved=false,lastJudgement=null,misses=0,lastRawTick=null;
  let completionSent=false,suspendedFrom='idle',pressRawMs=-Infinity;
  let performanceStartedMs=0,interferenceFrame=null;

  function currentInterference(){
    // The Surfer edits the performance transport, not the save counter. Tying
    // this to completed rows meant a player caught in recalls could postpone
    // the subtraction indefinitely, and "the band returns at 1:30" stopped
    // being true. Presets/resumed rows retain their authored musical offset;
    // live time advances continuously and freezes with the audio clock.
    const elapsed=musicalOffsetMs+Math.max(0,clockMs-performanceStartedMs-TENOR_TIMING.countInBeatMs*TENOR_TIMING.countInBeats);
    interferenceFrame=pealInterferenceAt(elapsed);
    return interferenceFrame;
  }

  function rawNow(dt=0){
    if(clock)return Math.max(0,finite(clock.nowMs?.(),clockMs));
    clockMs+=Math.max(0,finite(dt,0))*1000;return clockMs;
  }
  function judgeNow(){return clock?finite(clock.judgementNowMs?.(),clockMs):clockMs;}
  function beginCountIn(reason='start'){
    phase='count_in';phaseStartedMs=clockMs;automaticScheduled=false;tenorResolved=false;lastRawTick=clockMs;
    if(reason!=='start')onRecall({row:rowIndex,reason,atMs:clockMs});
  }
  function beginRow(atMs=clockMs){phase='row';rowStartedMs=atMs;automaticScheduled=false;tenorResolved=false;lastRawTick=clockMs;}
  function scheduleAutomatic(){
    if(automaticScheduled||rowIndex>=84)return;
    automaticScheduled=true;
    const row=STEDMAN_TRIPLES_84_WITH_TENOR[rowIndex],stroke=strokeForRow(rowIndex);
    const active=new Set(currentInterference().activeAutomaticBells);
    for(let place=0;place<7;place++){
      if(!active.has(row[place]))continue;
      const atMs=rowStartedMs+place*PLACE_MS;
      onStrike({bell:row[place],stroke,rowIndex,place,section:'stedman-performance'},{delayMs:Math.max(0,atMs-clockMs),player:false,targetAtMs:atMs});
    }
  }
  function miss(reason,deltaMs,inputAtMs=judgeNow()){
    if(phase!=='row'||tenorResolved)return snapshot();
    tenorResolved=true;misses+=1;pressRawMs=clockMs;
    lastJudgement={grade:'miss',reason,deltaMs:Number(deltaMs)||0,row:rowIndex,atMs:clockMs,inputAtMs};
    phase='retry';phaseStartedMs=clockMs;onMiss({...lastJudgement,misses});return snapshot();
  }
  function completeRow(){
    rowIndex+=1;lastJudgement={...(lastJudgement||{}),row:rowIndex-1};onRow({row:rowIndex,misses,lastJudgement});
    if(rowIndex>=84){phase='complete';phaseStartedMs=clockMs;if(!completionSent){completionSent=true;onComplete({rows:rowIndex,misses});}return;}
    beginRow(rowStartedMs+rowDurationMs(rowIndex-1));
  }
  function start(){
    if(rowIndex>=84){phase='complete';if(!completionSent){completionSent=true;onComplete({rows:rowIndex,misses});}return snapshot();}
    if(clock){if(phase==='suspended')clock.resume?.();else clock.start?.(clockMs);}
    clockMs=rawNow(0);performanceStartedMs=clockMs;beginCountIn(phase==='suspended'?'resume':'start');return snapshot();
  }
  function suspend(reason='pause'){
    if(['idle','complete','suspended'].includes(phase))return snapshot();
    suspendedFrom=phase;clockMs=rawNow(0);clock?.freeze?.();phase='suspended';automaticScheduled=false;tenorResolved=false;lastRawTick=null;
    return{...snapshot(),reason};
  }
  function resume(reason='resume'){
    if(phase!=='suspended')return snapshot();
    clock?.resume?.();clockMs=rawNow(0);beginCountIn(`${reason}:${suspendedFrom}`);return snapshot();
  }
  function release(){clockMs=rawNow(0);clock?.freeze?.();phase='idle';automaticScheduled=false;tenorResolved=false;lastRawTick=null;return snapshot();}
  function press(input={}){
    if(phase!=='row'||tenorResolved)return{ok:false,reason:phase};
    const inputAtMs=clock
      ?finite(clock.eventTransportMs?.(typeof input==='number'?input:input?.timeStamp),judgeNow())
      :clockMs;
    const target=tenorTargetForRow(rowIndex,rowStartedMs),deltaMs=inputAtMs-target.atMs;
    if(deltaMs < -TENOR_TIMING.approachMs)return{ok:false,reason:'unarmed',deltaMs};
    const grade=gradeTenorTiming(deltaMs,assistMode);
    if(grade==='miss'){miss(deltaMs<0?'early':'late',deltaMs,inputAtMs);return{ok:false,reason:'miss',deltaMs};}
    tenorResolved=true;pressRawMs=clockMs;lastJudgement={grade,deltaMs,row:rowIndex,atMs:clockMs,inputAtMs};
    onStrike({bell:8,stroke:target.stroke,rowIndex,place:7,section:'stedman-performance'},{delayMs:Math.max(0,target.atMs-clockMs),player:true,grade,targetAtMs:target.atMs,inputAtMs});
    return{ok:true,grade,deltaMs,row:rowIndex};
  }
  function tick(dt){
    const previous=lastRawTick;clockMs=rawNow(dt);
    if(clock&&previous!=null&&clockMs-previous>TENOR_TIMING.hitchRecallMs&&['row','count_in','retry'].includes(phase)){
      beginCountIn('scheduler-hitch');return snapshot();
    }
    lastRawTick=clockMs;
    let guard=0;
    while(guard++<4){
      if(phase==='count_in'){
        const end=phaseStartedMs+TENOR_TIMING.countInBeatMs*TENOR_TIMING.countInBeats;
        if(clockMs<end)break;beginRow(end);continue;
      }
      if(phase==='retry'){
        const end=phaseStartedMs+TENOR_TIMING.retryMs;
        if(clockMs<end)break;beginRow(end);continue;
      }
      if(phase==='row'){
        scheduleAutomatic();const target=tenorTargetForRow(rowIndex,rowStartedMs);
        const judgementClock=judgeNow();
        if(!tenorResolved&&judgementClock>target.atMs+timing.acceptedMs){miss('late',judgementClock-target.atMs,judgementClock);continue;}
        if(tenorResolved&&lastJudgement?.grade!=='miss'&&clockMs>=rowStartedMs+rowDurationMs(rowIndex)){completeRow();continue;}
      }
      break;
    }
    return snapshot();
  }
  function snapshot(){
    const target=phase==='row'&&rowIndex<84?tenorTargetForRow(rowIndex,rowStartedMs):null;
    const judgementClock=judgeNow(),deltaMs=target?judgementClock-target.atMs:0;
    const countInIndex=phase==='count_in'?Math.min(TENOR_TIMING.countInBeats-1,Math.floor((clockMs-phaseStartedMs)/TENOR_TIMING.countInBeatMs)):-1;
    const countIn=phase==='count_in'?Math.max(0,TENOR_TIMING.countInBeats-countInIndex):0;
    const judgementAgeMs=lastJudgement?Math.max(0,clockMs-lastJudgement.atMs):Infinity;
    const pull=Number.isFinite(pressRawMs)?Math.sin(Math.PI*clamp01((clockMs-pressRawMs)/680)):0;
    const interference=currentInterference(),musicalElapsedMs=interference.elapsedMs;
    const rowElapsedMs=target?Math.max(0,clockMs-rowStartedMs):0;
    const place=target?Math.max(0,Math.min(7,Math.floor(rowElapsedMs/PLACE_MS))):-1;
    const placeProgress=target?clamp01((rowElapsedMs-place*PLACE_MS)/PLACE_MS):0;
    const soundingBell=target?.row?.[place]??null;
    return{
      phase,clockMs,row:rowIndex,rows:84,misses,lastJudgement,target,deltaMs,countIn,
      countInCall:countInIndex>=0?PEAL_COUNT_IN_CALLS[countInIndex]:'',countInProgress:phase==='count_in'?clamp01((clockMs-phaseStartedMs)/(TENOR_TIMING.countInBeatMs*TENOR_TIMING.countInBeats)):0,
      approach:target?clamp01(1-(-deltaMs)/TENOR_TIMING.approachMs):0,
      armed:!!target&&deltaMs>=-TENOR_TIMING.approachMs&&!tenorResolved,
      tenorResolved,mode:assistMode,guided:assistMode!==PEAL_ASSIST_MODE.STANDARD,timing,
      phrase:Math.min(5,Math.floor(Math.min(rowIndex,83)/14)),phraseRow:rowIndex%14,
      place,placeProgress,soundingBell,
      judgementAgeMs,pull,musicalElapsedMs,interference,activeBells:interference.activeBells,hud:interference.hud,clock:clock?.snapshot?.()||null,
    };
  }
  return{start,suspend,resume,release,press,tick,snapshot};
}
