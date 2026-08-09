import * as REC from './recordist.js';
import { dreadAllowed } from './terror.js';
import { RADIO_CUES } from '../data/radio-cues.js';
export { RADIO_CUES } from '../data/radio-cues.js';

export const RADIO_PHASE = Object.freeze({LIVE:'live',FAILING:'failing',DEAD:'dead'});
export const RADIO_CALL = Object.freeze({IDLE:'idle',CALLING:'calling'});
export const RADIO = {
  callTimeoutMs:24000,deploymentDelayMs:2500,deploymentCooldownMs:35000,
  pulseOffsetsMs:[0,1400,3200],failingFaultRangeMs:[35000,55000],deadFaultRangeMs:[22000,38000],
  noiseLevel:{live:.38,failing:.31,dead:.24},approachMeters:8,
};

const milestoneDefaults=()=>Object.fromEntries(Object.values(RADIO_CUES).map((id)=>[id,false]));
const fresh=()=>({schema:2,transmissions:0,phase:RADIO_PHASE.LIVE,diedAt:0,squelches:0,dropped:null,milestones:milestoneDefaults(),pendingCue:null,activeCue:null,candidateRoom:null,missed:[],call:{status:RADIO_CALL.IDLE,deadlineAt:0,nextPulseAt:0},scheduler:{deployCooldownUntil:0,nextFaultAt:0,pulses:[]},lastCarrierPosition:{x:0,y:0},onSquelch:null,onLine:null,onMissed:null});
let state=fresh();

const nowMs=()=>performance.now();
const knownCue=(id)=>Object.values(RADIO_CUES).includes(id);
const milestoneDone=(id)=>!!state.milestones[id];
const remaining=(value)=>Math.max(0,Math.min(120000,Number(value)||0));
const cueCopy=(cue)=>cue?{...cue}:null;
const locationCopy=(at)=>at?{...at}:null;

export function radioInit({squelch,line,missed}={}){state.onSquelch=squelch||null;state.onLine=line||null;state.onMissed=missed||null;}
export function radioState(){return{...state,dead:isDead(),dropped:locationCopy(state.dropped),milestones:{...state.milestones},pendingCue:cueCopy(state.pendingCue),activeCue:cueCopy(state.activeCue),missed:[...state.missed],call:{...state.call},scheduler:{...state.scheduler,pulses:[...state.scheduler.pulses]},lastCarrierPosition:{...state.lastCarrierPosition},onSquelch:undefined,onLine:undefined,onMissed:undefined};}
export const radioPhase=()=>state.phase;
export const isDead=()=>state.phase===RADIO_PHASE.DEAD;
export const isFailing=()=>state.phase===RADIO_PHASE.FAILING;
export const squelchCount=()=>state.squelches;
export const isDropped=()=>!!state.dropped;
export const radioLocation=()=>locationCopy(state.dropped);
export const radioMilestones=()=>({...state.milestones});
export const pendingRadioCue=()=>cueCopy(state.pendingCue);
export const activeRadioCue=()=>cueCopy(state.activeCue);
export const missedRadioCues=()=>[...state.missed];
export const radioCallState=()=>({...state.call});
export const radioCalling=()=>state.call.status===RADIO_CALL.CALLING;
export const radioCarrierOpen=()=>radioCalling()||state.scheduler.pulses.length>0;
export function radioPresentation(){const phase=state.phase===RADIO_PHASE.LIVE?'LIVE':state.phase===RADIO_PHASE.FAILING?'CARRIER UNSTABLE':'DEAD';return{phase,activity:radioCalling()?'CALLING':state.scheduler.pulses.length?'FAULT':'QUIET',location:state.dropped?'DEPLOYED':'CARRIED',dropped:locationCopy(state.dropped)};}

export function queueRadioCue(id,{roomId=null,reason='',now=nowMs()}={}){if(!knownCue(id)||isDead()||milestoneDone(id)||state.activeCue||state.pendingCue)return false;state.pendingCue={id,roomId:roomId||null,reason:reason||'',queuedAt:now};if(roomId)state.candidateRoom=roomId;if(state.dropped)armDroppedRadioCall(now);return true;}
export function armDroppedRadioCall(now=nowMs()){if(!state.dropped||!state.pendingCue||radioCalling())return false;state.call={status:RADIO_CALL.CALLING,deadlineAt:now+RADIO.callTimeoutMs,nextPulseAt:now};return true;}
export function consumeRadioCue(){if(!state.pendingCue||state.dropped)return null;const cue=state.pendingCue;state.pendingCue=null;state.call={status:RADIO_CALL.IDLE,deadlineAt:0,nextPulseAt:0};state.activeCue={...cue,startedAt:nowMs()};return cueCopy(state.activeCue);}

function rangeForPhase(){return state.phase===RADIO_PHASE.DEAD?RADIO.deadFaultRangeMs:RADIO.failingFaultRangeMs;}
function scheduleNextFault(now,random=.5){if(state.phase===RADIO_PHASE.LIVE){state.scheduler.nextFaultAt=0;return 0;}const[lo,hi]=rangeForPhase(),r=Math.max(0,Math.min(.999999,Number(random)||0));state.scheduler.nextFaultAt=now+lo+(hi-lo)*r;return state.scheduler.nextFaultAt;}
function applyCueOutcome(id,now){state.milestones[id]=true;if(id===RADIO_CUES.POST_SECOND&&state.phase===RADIO_PHASE.LIVE){state.phase=RADIO_PHASE.FAILING;scheduleNextFault(now,.5);}if(id===RADIO_CUES.PRE_THIRD){state.phase=RADIO_PHASE.DEAD;state.diedAt=now;scheduleNextFault(now,.5);}}
export function resolveRadioCue(id,{now=nowMs()}={}){if(!knownCue(id))return false;applyCueOutcome(id,now);if(state.activeCue?.id===id)state.activeCue=null;if(state.pendingCue?.id===id)state.pendingCue=null;state.call={status:RADIO_CALL.IDLE,deadlineAt:0,nextPulseAt:0};return true;}
export function missPendingRadioCue({now=nowMs()}={}){const cue=state.pendingCue;if(!cue)return null;state.pendingCue=null;state.call={status:RADIO_CALL.IDLE,deadlineAt:0,nextPulseAt:0};state.missed.push(cue.id);applyCueOutcome(cue.id,now);const event={...cue,missedAt:now};state.onMissed?.(event);return event;}
export function shouldQueuePostSecondTake({completedTakes=0,isRecording=false}={}){return state.phase===RADIO_PHASE.LIVE&&!isRecording&&completedTakes>=2&&!milestoneDone(RADIO_CUES.POST_SECOND);}
export function shouldQueuePreThirdBreakdown({completedTakes=0,isRecording=false,nearestRoom=null,distanceMeters=Infinity,thresholdMeters=RADIO.approachMeters}={}){return state.phase===RADIO_PHASE.FAILING&&!isRecording&&completedTakes>=2&&milestoneDone(RADIO_CUES.POST_SECOND)&&!milestoneDone(RADIO_CUES.PRE_THIRD)&&!!nearestRoom&&Number.isFinite(distanceMeters)&&distanceMeters<=thresholdMeters;}

function queueCluster(at){for(const offset of RADIO.pulseOffsetsMs)state.scheduler.pulses.push(at+offset);state.scheduler.pulses.sort((a,b)=>a-b);}
export function dropRadio(x,y,{roomId=null,floorId=null,now=nowMs()}={}){if(state.dropped)return false;state.dropped={x:Math.round(x),y:Math.round(y),roomId:roomId||null,floorId:floorId||null};if(now>=state.scheduler.deployCooldownUntil){queueCluster(now+RADIO.deploymentDelayMs);state.scheduler.deployCooldownUntil=now+RADIO.deploymentCooldownMs;}if(state.pendingCue)armDroppedRadioCall(now);return true;}
export function pickUpRadio(x,y,maxCells=4){if(!state.dropped||Math.hypot(state.dropped.x-x,state.dropped.y-y)>maxCells)return false;state.dropped=null;state.call={status:RADIO_CALL.IDLE,deadlineAt:0,nextPulseAt:0};return true;}
export function transmit(lines){if(isDead())return false;state.transmissions++;state.onLine?.(lines,state.transmissions);return true;}
export function killRadio({now=nowMs()}={}){if(isDead())return false;state.phase=RADIO_PHASE.DEAD;state.diedAt=now;scheduleNextFault(now,.5);return true;}

function emitPulse(now,{kind='fault'}={}){const at=state.dropped||state.lastCarrierPosition;REC.emitNoise(RADIO.noiseLevel[state.phase]||.24,at.x,at.y,'the radio squelches',{spoils:!state.dropped,kind:'radio_squelch',sourceKind:'equipment',sourceId:'radio',playerGenerated:false,deliberate:kind==='deployment',audibleToHush:true});state.squelches++;const event={at:now,index:state.squelches,x:at.x,y:at.y,dropped:!!state.dropped,phase:state.phase,kind};state.onSquelch?.(event);return event;}
export function tickRadio(dt,{px=0,py=0,now=nowMs(),random=Math.random}={}){void dt;state.lastCarrierPosition={x:px,y:py};const events=[];if(state.dropped&&state.pendingCue&&!radioCalling())armDroppedRadioCall(now);if(radioCalling()){if(now>=state.call.deadlineAt){const missed=missPendingRadioCue({now});if(missed)events.push({type:'missed',cue:missed});}else if(now>=state.call.nextPulseAt){events.push({type:'pulse',event:emitPulse(now,{kind:'call'})});state.call.nextPulseAt=now+4200;}}if(dreadAllowed()&&state.scheduler.pulses.length&&now>=state.scheduler.pulses[0]){state.scheduler.pulses.shift();events.push({type:'pulse',event:emitPulse(now,{kind:'deployment'})});}if(dreadAllowed()&&state.phase!==RADIO_PHASE.LIVE&&state.scheduler.nextFaultAt&&now>=state.scheduler.nextFaultAt){queueCluster(now);scheduleNextFault(now,random());}if(dreadAllowed()&&state.scheduler.pulses.length&&now>=state.scheduler.pulses[0]){state.scheduler.pulses.shift();events.push({type:'pulse',event:emitPulse(now,{kind:'fault'})});}return events;}

export function saveRadioState(now=nowMs()){return{schema:2,transmissions:state.transmissions,phase:state.phase,dead:isDead(),squelches:state.squelches,dropped:locationCopy(state.dropped),milestones:{...state.milestones},pendingCue:cueCopy(state.pendingCue),activeCue:cueCopy(state.activeCue),candidateRoom:state.candidateRoom||null,missed:[...state.missed],call:{status:state.call.status,deadlineRemainingMs:remaining(state.call.deadlineAt-now),nextPulseRemainingMs:remaining(state.call.nextPulseAt-now)},scheduler:{deployCooldownRemainingMs:remaining(state.scheduler.deployCooldownUntil-now),nextFaultRemainingMs:remaining(state.scheduler.nextFaultAt-now),pulseRemainingMs:state.scheduler.pulses.map((at)=>remaining(at-now))}};}
export function loadRadioState(saved={},now=nowMs()){const old=Number(saved.schema||0)<2,milestones={...milestoneDefaults(),...(saved.milestones||{})},legacyDead=!!saved.dead||(old&&!!milestones[RADIO_CUES.POST_SECOND]),hooks={onSquelch:state.onSquelch,onLine:state.onLine,onMissed:state.onMissed},savedCue=saved.pendingCue||saved.activeCue;state={...fresh(),...hooks,transmissions:Number(saved.transmissions)||0,phase:legacyDead?RADIO_PHASE.DEAD:(Object.values(RADIO_PHASE).includes(saved.phase)?saved.phase:RADIO_PHASE.LIVE),squelches:Number(saved.squelches)||0,dropped:saved.dropped&&Number.isFinite(saved.dropped.x)&&Number.isFinite(saved.dropped.y)?{x:Math.round(saved.dropped.x),y:Math.round(saved.dropped.y),roomId:saved.dropped.roomId||null,floorId:saved.dropped.floorId||null}:null,milestones,pendingCue:savedCue&&knownCue(savedCue.id)&&!milestones[savedCue.id]?{id:savedCue.id,roomId:savedCue.roomId||null,reason:savedCue.reason||'',queuedAt:Number(savedCue.queuedAt)||now}:null,candidateRoom:saved.candidateRoom||null,missed:Array.isArray(saved.missed)?saved.missed.filter(knownCue):[]};const call=saved.call||{},scheduler=saved.scheduler||{};state.call={status:state.dropped&&state.pendingCue&&call.status===RADIO_CALL.CALLING?RADIO_CALL.CALLING:RADIO_CALL.IDLE,deadlineAt:now+remaining(call.deadlineRemainingMs),nextPulseAt:now+remaining(call.nextPulseRemainingMs)};state.scheduler={deployCooldownUntil:now+remaining(scheduler.deployCooldownRemainingMs),nextFaultAt:scheduler.nextFaultRemainingMs?now+remaining(scheduler.nextFaultRemainingMs):0,pulses:(scheduler.pulseRemainingMs||[]).map((v)=>now+remaining(v)).sort((a,b)=>a-b)};if(state.phase!==RADIO_PHASE.LIVE&&!state.scheduler.nextFaultAt)scheduleNextFault(now,.5);return radioState();}
export function resetRadioState(){const hooks={onSquelch:state.onSquelch,onLine:state.onLine,onMissed:state.onMissed};state={...fresh(),...hooks};return radioState();}
