import {chooseGait,gaitSpeed,freshBreath,normalizeBreath,stepBreath} from './locomotion.js';
import {freshArchipelagoProgress,normalizeArchipelagoProgress,advanceArchipelagoProgress,archipelagoChase,archipelagoExitReady} from './source-archipelago-progress.js';
import { SOURCE_CONTINUATION as C, CONTINUATION_CATCH_STAGES, continuationStage, continuationRadialPoint, continuationCatchFloor, continuationSurfaces,continuationChartSurfaces,continuationChartSolids,continuationChartDoors,continuationArrivalAnchors, continuationSolids, continuationDoors, continuationProps, continuationSurfaceY, continuationSurfaceContains, continuationSupportAt, continuationDropLip, continuationDropLips, continuationRefugeAt, continuationCatchObstacles, continuationBodyClearAt } from '../data/source-continuation.js';
import {recoverSourceRestAlcoveCheckpoint} from './source-rest-alcove-recovery.js';
import {freshContinuationHush,freshContinuationDoorHush,normalizeContinuationHush,recordContinuationHushWalk,recordContinuationHushDrop,recordContinuationHushFold,reconnectContinuationHush,advanceContinuationHush,continuationSupportedPath,continuationWalkSegment} from './source-continuation-hush.js';
import {noteContinuationCatchEntry} from './source-continuation-arrival.js';
import {freshSourceConnectorCorridor,normalizeSourceConnectorCorridor,advanceSourceConnectorCorridor} from './source-connector-corridor.js';
import {continuationBallisticStep,continuationFreeBody} from './source-continuation-physics.js';
import {continuationPortalCrossing,transferContinuationPortal,advancePortalTransit,continuationCameraEye,continuationCameraBasis,continuationBodyAxis} from './source-continuation-portals.js';
import {captureContinuationVoidLoop,continuationVoidLoopForFall,normalizeContinuationSpaceWrap} from './source-continuation-void.js';
import {sourceChunkFaultResponse,SOURCE_CHUNK_FAULT} from './source-chunk-fault.js';
import {freshSourceTide,normalizeSourceTide,advanceSourceTide} from './source-continuation-tides.js';
import {sourceRiftFaultTouched,sourceRiftFaultClear} from './source-rift.js';
import {freshSourceExitPassage,normalizeSourceExitPassage,advanceSourceExitPassage,sourceExitPassageEndCrossed} from './source-exit-passage.js';
import {SOURCE_EXIT_PASSAGE,sourceExitPassageContains} from '../data/source-exit-passage.js';

const clone = value => JSON.parse(JSON.stringify(value));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, a, b) => Math.max(a, Math.min(b, finite(n, a)));
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const pose = value => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) && !Number.isFinite(value.z) || Object.values(value).some(v => typeof v === 'number' && !Number.isFinite(v))) return null;
  try { return clone(value); } catch { return null; }
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const position = (value, fallback = C.spawn) => ({ x: clamp(value?.x ?? fallback.x, C.bounds.minX, C.bounds.maxX), z: clamp(value?.z ?? fallback.z, C.bounds.minZ, C.bounds.maxZ), feet: clamp(value?.feet ?? fallback.feet, C.bounds.minY, C.bounds.maxY),chartId:Math.max(0,Math.round(finite(value?.chartId,fallback.chartId||0))), yaw: angle(finite(value?.yaw, fallback.yaw || 0)), pitch: clamp(value?.pitch ?? fallback.pitch ?? 0, -1.42, 1.3), level: Math.round(clamp(value?.level ?? fallback.level ?? 0, 0, C.catch.levels - 1)) });
const physicalPosition=value=>({...position(value),x:clamp(value?.x,-1024,1024),z:clamp(value?.z,-1024,1024),feet:clamp(value?.feet,-1024,1024)});
const supportedPose=state=>({...position(state),phase:state.phase});
function earnedAnchor(state,kind='entry',supportId=null) {
  return {...supportedPose(state),kind,supportId:supportId||continuationSupportAt(state.x,state.z,state)?.id||'',earnedAt:Math.max(0,finite(state.elapsed))};
}
function anchorValid(anchor) {
  return !!anchor&&['x','z','feet'].every(k=>Number.isFinite(anchor[k]))&&!!continuationSupportAt(anchor.x,anchor.z,anchor,{minY:anchor.feet-.02,maxY:anchor.feet+.02});
}
function updateAnchor(state,{landing=false}={}) {
  if(state.fall||state.recovery)return;
  const support=continuationSupportAt(state.x,state.z,state);if(!support)return;
  const arrival=continuationArrivalAnchors().find(a=>(a.chartId??0)===state.chartId&&Math.abs(a.feet-state.feet)<.1&&Math.hypot(a.x-state.x,a.z-state.z)<=a.radius);
  let kind=landing||arrival?'landing':insideRefuge(state)?'refuge':null;
  const head=continuationChartSurfaces(state).find(s=>s.role==='landing'&&Math.abs(s.y-state.feet)<.02&&continuationSurfaceContains(s,state.x,state.z));
  if(!kind&&head)kind='stair-head';if(!kind)return;
  const current=state.recoveryAnchor,anchorPose=arrival?.restoreAt?{...state,...arrival.restoreAt}:state;
  if(current&&current.chartId===state.chartId&&current.phase===state.phase&&Math.hypot(current.x-anchorPose.x,current.z-anchorPose.z,current.feet-anchorPose.feet)<1e-6)return;
  state.recoveryAnchor=earnedAnchor(anchorPose,kind,arrival?.id||head?.id||support.id);
}
const ACTIVE = new Set(['not-started', 'active', 'returned', 'completed']);
const DOOR_IDS = new Set(continuationDoors().map(d => d.id));
const WEIGHT_MODES = new Set(['warning', 'walking', 'falling', 'returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering']);
const startWeight = () => ({ active: false, level: 0, mode: 'warning', elapsed: 0, ...C.catch.hoist.start, y: C.catch.top, pathIndex: 0, fall: null, cycle: 0 });
export function freshSourceContinuation({ runId = '', returnPose = null } = {}) {
  return { version: 1, layoutVersion: C.layoutVersion, encounterId: C.encounterId, runId: String(runId), status: 'not-started', phase: 'wrong-return', direction: 'forward',
    ...C.spawn,chartId:0,foldSerial:0,lastFold:null,lastSpaceWrap:null,cameraTransit:null,bodyTransit:null, elapsed: 0, accumulator: 0, wrongLap: 0, level: 0, fall: null, recovery: null, reveal: null, grace: 0,jumpHeld:false,velocity:{x:0,z:0},tide:freshSourceTide(),riftLatch:null,
    closure: { mode: 'dormant', elapsed: 0, frontX: C.wrongReturn.closureStartX, frontZ: -12, exposure: 0 },
    counterweight: startWeight(), hush:freshContinuationDoorHush(), corridor:freshSourceConnectorCorridor(), breath:freshBreath(),expedition:freshArchipelagoProgress(), heading:0, knowledge: [], doorOpen: {}, doorMotion: {}, returnPose: pose(returnPose), exitPose: null,
    completed: false, handoff: false, exitReceipt: null,exitPassage:freshSourceExitPassage(), lastSafe: { ...C.spawn,chartId:0, level:0,phase:'wrong-return' },recoveryAnchor:earnedAnchor({...C.spawn,chartId:0,phase:'wrong-return',level:0,elapsed:0}), caption: null };
}
function validFall(value,chartId=value?.chartId??0) {
  if (!value || !['x', 'z', 'feet', 'vx', 'vz', 'vy'].every(k => Number.isFinite(value[k]))) return null;
  return { ...physicalPosition({...value,chartId}),vx:clamp(value.vx,-60,60),vz:clamp(value.vz,-60,60),vy:clamp(value.vy,-60,60),fromLevel:Math.round(clamp(value.fromLevel,0,C.catch.levels-1)),fromPhase:value.fromPhase==='wrong-return'?'wrong-return':'catch',fromChartId:Math.max(0,Math.round(finite(value.fromChartId,value.chartId||0))),trigger:['jump','step-off','release','portal'].includes(value.trigger)?value.trigger:'release',lastSupport:{...position(value.lastSupport||value),phase:value.lastSupport?.phase||value.fromPhase||'catch'},elapsed:Math.max(0,finite(value.elapsed)),unsupported:!!value.unsupported,groundedExit:value.groundedExit!==false&&value.trigger!=='jump'&&value.trigger!=='portal',voidLoop:continuationVoidLoopForFall(value,{chartId}),...(Number.isFinite(value.capsuleExtent)?{capsuleExtent:value.capsuleExtent}:{}),...(value.portalSupport?{portalSupport:{id:String(value.portalSupport.id),y:finite(value.portalSupport.y)}}:{}) };
}
function validTransit(value,camera=false){if(!value||!['right','up','forward'].every(k=>Array.isArray(value[k])&&value[k].length===3&&value[k].every(Number.isFinite)))return null;return{elapsed:clamp(value.elapsed,0,.55),duration:.55,right:[...value.right],up:[...value.up],forward:[...value.forward],...(camera?{eyeOffset:Array.isArray(value.eyeOffset)?value.eyeOffset.map(v=>finite(v)):[0,0,0],roll:finite(value.roll),baseYaw:finite(value.baseYaw),basePitch:finite(value.basePitch)}:{baseHeading:finite(value.baseHeading)})};}
function migrateLegacy(state, value) {
  if (value.layoutVersion === C.layoutVersion) return state;
  if(value.layoutVersion===2||value.layoutVersion===3) {
    // Both previous layouts already had these four earned Catch elevations.
    // Translate the actual old receiving pose, never its progress ratio.
    const shift=p=>({...p,x:p.x+C.catch.offset.x,z:p.z+C.catch.offset.z,chartId:0});
    if(state.phase==='catch') {
      Object.assign(state,shift(state));
      if(state.fall){state.fall=shift(state.fall);if(state.fall.lastSupport.phase==='catch')state.fall.lastSupport=shift(state.fall.lastSupport);}
      if((value.lastSafe?.phase||value.phase)==='catch')state.lastSafe=shift(state.lastSafe);
      if(value.recoveryAnchor?.phase==='catch'){
        // A migrated earned anchor must enter the same canonical schema as a
        // current-layout anchor, rather than changing on the next save/load.
        const anchor=shift(value.recoveryAnchor);
        state.recoveryAnchor={...position(anchor),phase:anchor.phase==='catch'?'catch':'wrong-return',
          kind:['entry','landing','stair-head','refuge'].includes(anchor.kind)?anchor.kind:'landing',
          supportId:String(anchor.supportId||''),earnedAt:Math.max(0,finite(anchor.earnedAt))};
      }
      if(state.recovery){state.recovery.from=shift(state.recovery.from);state.recovery.target=shift(state.recovery.target);state.recovery.path=state.recovery.path.map(shift);}
      Object.assign(state.counterweight,{x:state.counterweight.x+C.catch.offset.x,z:state.counterweight.z+C.catch.offset.z});if(state.counterweight.fall)state.counterweight.fall=shift(state.counterweight.fall);
      if(!state.fall&&!state.recovery&&!anchorValid(state)) {
        const prior=anchorValid(state.lastSafe)?state.lastSafe:null,stage=continuationStage(state.level),a=state.level?continuationDropLip({level:state.level-1}).approachAngle:0;
        Object.assign(state,prior||{...continuationRadialPoint(state.level?stage.innerRadius+.9:stage.outerRadius-1.5,a),feet:stage.y,chartId:0});
      }
    } else if(!anchorValid(state))Object.assign(state,anchorValid(state.lastSafe)?state.lastSafe:{...C.spawn,chartId:0});
    if(state.completed){
      state.phase='catch';state.level=C.catch.levels-1;state.fall=state.recovery=state.reveal=null;
      Object.assign(state,position({...C.catch.finalApproach,chartId:0,level:0,yaw:state.yaw,pitch:state.pitch}));
    }
    if(!state.fall&&!state.recovery)state.lastSafe=supportedPose(state);state.grace=C.graceSeconds;
    const stage=continuationStage(state.level),a=state.level?continuationDropLip({level:state.level-1}).approachAngle:0;
    const receiving={...continuationRadialPoint(state.level?stage.innerRadius+.9:stage.outerRadius-1.5,a),feet:stage.y,chartId:0,level:state.level,phase:'catch',yaw:state.yaw,pitch:state.pitch};
    const at=anchorValid(state)?state:state.phase==='catch'?receiving:state.lastSafe;
    if(!anchorValid(state.recoveryAnchor))state.recoveryAnchor=earnedAnchor({...at,phase:state.phase,elapsed:state.elapsed},'landing');
    const candidates=[[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dz])=>({...at,x:at.x+dx*.8,z:at.z+dz*.8})),behind=candidates.find(p=>continuationWalkSegment(p,at))||at;
    state.hush=freshContinuationHush({...behind,phase:state.phase});state.hush.trail=[{kind:'walk',...position(at),phase:state.phase}];state.hush.lastRecorded={...position(at),phase:state.phase};
    state.hush.active=value.hush?.active!==false&&!state.completed;
    state.hush=normalizeContinuationHush(state.hush);
    return state;
  }
  state.knowledge = [...new Set([...state.knowledge, ...(value.elapsed > .01 || value.phase === 'catch' ? ['remembered-earlier-construction'] : [])])];
  state.reveal = state.fall = state.recovery = null;
  if (state.phase === 'catch') {
    state.level = Math.round(clamp(value.level, 0, 5) * (C.catch.levels - 1) / 5);
    const stage=continuationStage(state.level),a=state.level?continuationDropLip({level:state.level-1}).approachAngle:0;
    const at = value.completed ? C.catch.finalApproach : {...continuationRadialPoint(state.level?stage.innerRadius+.9:stage.outerRadius-1.5,a),feet:stage.y,chartId:0};
    Object.assign(state, position({ ...at, level: value.completed?0:state.level })); state.feet = value.completed?C.catch.finalApproach.feet:continuationCatchFloor(state.level);
    state.counterweight = { ...startWeight(), active: !!value.counterweight?.active, cycle: Math.max(0, Math.floor(finite(value.counterweight?.cycle))) };
  } else if(!anchorValid(state))Object.assign(state,anchorValid(state.lastSafe)?state.lastSafe:{...C.spawn,chartId:0});
  state.lastSafe = supportedPose(state); state.grace = C.graceSeconds;
  state.hush=freshContinuationHush({...state,phase:state.phase});state.hush.trail=[{kind:'walk',...position(state)}];state.hush.lastRecorded=position(state);state.recoveryAnchor=earnedAnchor(state,'landing');
  state.hush=normalizeContinuationHush(state.hush);
  state.closure = { mode: 'dormant', elapsed: 0, frontX: C.wrongReturn.closureStartX, frontZ: -12, exposure: 0 };
  return state;
}
export function normalizeSourceContinuation(value, { runId, returnPose } = {}) {
  const fresh = freshSourceContinuation({ runId: runId ?? value?.runId ?? '', returnPose });
  if (!value || value.version !== 1 || value.encounterId !== C.encounterId || runId != null && String(runId) !== String(value.runId)) return fresh;
  const w = value.counterweight || fresh.counterweight;
  let state = { ...fresh, ...(value.fall||value.recovery?physicalPosition(value):position(value)), status: ACTIVE.has(value.status) ? value.status : fresh.status,
    phase: value.phase === 'catch' ? 'catch' : 'wrong-return', direction: value.direction === 'reverse' ? 'reverse' : 'forward',
    elapsed: Math.max(0, finite(value.elapsed)), accumulator: clamp(value.accumulator, 0, C.fixedStep), wrongLap: Math.round(clamp(value.wrongLap, 0, 3)),
    grace: clamp(value.grace, 0, C.graceSeconds), completed: !!value.completed, handoff: !!value.handoff,
    returnPose: pose(value.returnPose) || fresh.returnPose, exitPose: pose(value.exitPose),
    knowledge: Array.isArray(value.knowledge) ? [...new Set(value.knowledge.filter(v => typeof v === 'string').slice(0, 80))] : [],
    doorOpen: Object.fromEntries(Object.entries(value.doorOpen || {}).filter(([id]) => DOOR_IDS.has(id)).map(([id, open]) => [id, !!open])),
    caption: null, lastSafe:{...position(value.lastSafe),phase:value.lastSafe?.phase||value.phase||'wrong-return'}, fall: validFall(value.fall,value.chartId??0), reveal: null,jumpHeld:!!value.jumpHeld,velocity:{x:clamp(value.velocity?.x??0,-60,60),z:clamp(value.velocity?.z??0,-60,60)},tide:normalizeSourceTide(value.tide),riftLatch:typeof value.riftLatch==='string'?value.riftLatch:null,foldSerial:Math.max(0,Math.round(finite(value.foldSerial))),lastFold:value.lastFold?clone(value.lastFold):null,lastSpaceWrap:normalizeContinuationSpaceWrap(value.lastSpaceWrap),cameraTransit:validTransit(value.cameraTransit,true),bodyTransit:validTransit(value.bodyTransit),
    closure: { mode: ['dormant', 'primed', 'warning', 'closing', 'held'].includes(value.closure?.mode) ? value.closure.mode : 'dormant', elapsed: Math.max(0, finite(value.closure?.elapsed)), frontX: clamp(value.closure?.frontX ?? C.wrongReturn.closureStartX, C.wrongReturn.closureEndX, C.wrongReturn.closureStartX), frontZ: -12, exposure: Math.max(0, finite(value.closure?.exposure)) },
    counterweight: { active: !!w.active, level: Math.round(clamp(w.level, 0, C.catch.levels - 1)), mode: WEIGHT_MODES.has(w.mode) ? w.mode : 'warning', elapsed: Math.max(0, finite(w.elapsed)), x: clamp(w.x, C.bounds.minX, C.bounds.maxX), z: clamp(w.z, C.bounds.minZ, C.bounds.maxZ), y: clamp(w.y, C.bounds.minY, C.catch.hoist.travelY), pathIndex: Math.round(clamp(w.pathIndex, 0, 32)), fall: validFall(w.fall), cycle: Math.max(0, Math.floor(finite(w.cycle))) },
    hush:normalizeContinuationHush(value.hush||fresh.hush),corridor:normalizeSourceConnectorCorridor(value.corridor,value),exitPassage:normalizeSourceExitPassage(value.exitPassage,value),breath:normalizeBreath(value.breath),expedition:normalizeArchipelagoProgress(value.expedition),heading:angle(finite(value.heading,value.yaw)),
    recoveryAnchor:anchorValid(value.recoveryAnchor)?{...position(value.recoveryAnchor),phase:value.recoveryAnchor.phase==='catch'?'catch':'wrong-return',kind:['entry','landing','stair-head','refuge'].includes(value.recoveryAnchor.kind)?value.recoveryAnchor.kind:'landing',supportId:String(value.recoveryAnchor.supportId||''),earnedAt:Math.max(0,finite(value.recoveryAnchor.earnedAt))}:null,
  };
  state.doorMotion = Object.fromEntries(Object.entries(value.doorMotion || {}).filter(([id, m]) => DOOR_IDS.has(id) && m && ['from', 'startedAt', 'duration'].every(k => Number.isFinite(m[k]))).map(([id, m]) => [id, { from: clamp(m.from, 0, 1), to: state.doorOpen[id] ? 1 : 0, startedAt: clamp(m.startedAt, 0, state.elapsed), duration: clamp(m.duration, 0, C.doorSwingSeconds),...(m.automatic===true?{automatic:true}:{}) }]));
  if (value.recovery && typeof value.recovery.reason === 'string' && Array.isArray(value.recovery.path) && value.recovery.path.length > 1 && value.recovery.path.length <= 48 && value.recovery.path.every(p => ['x', 'z', 'feet'].every(k => Number.isFinite(p[k])))) {
    const r = value.recovery, path = r.path.map(p => physicalPosition(p));
    state.recovery = { reason: r.reason, kind: r.kind==='blackout-return'?'blackout-return':r.kind === 'guided-return' ? 'guided-return' : 'sling', from: physicalPosition(r.from), target: position(r.target), path,
      ...(r.reason==='hush-pressure'&&['pending','released'].includes(r.contact)?{contact:r.contact}:{}),
      ...(r.targetPhase?{fromPhase:r.fromPhase||state.phase,targetPhase:r.targetPhase}:{}),...(r.fade?{fade:true,blackoutAlpha:recoveryAlpha(r.elapsed/r.duration),fromPhase:r.fromPhase||state.phase,targetPhase:r.targetPhase||state.phase}:{}),
      duration: clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds), elapsed: clamp(r.elapsed, 0, clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds)), repaired: !!r.repaired };
  }
  if (value.exitReceipt && typeof value.exitReceipt.id === 'string') state.exitReceipt = { id: `${state.runId}:source-continuation-exit`, delivered: !!value.exitReceipt.delivered };
  state = migrateLegacy(state, value);
  if(value.layoutVersion===C.layoutVersion)state=recoverSourceRestAlcoveCheckpoint(state);
  if (['warning', 'walking'].includes(state.counterweight.mode) && !continuationSupportAt(state.counterweight.x, state.counterweight.z, { feet: state.counterweight.y })) { const at = weightPaths[state.counterweight.level]?.[0] || C.catch.hoist.start; Object.assign(state.counterweight, at, { y: continuationCatchFloor(state.counterweight.level), pathIndex: 0, mode: 'warning', elapsed: 0, fall: null }); }
  if (!state.fall && !state.recovery && (!continuationSupportAt(state.x, state.z, state) || staticSolidBlocks(state.x, state.z, state))) {
    const safe = continuationSupportAt(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet }) && !staticSolidBlocks(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet });
    Object.assign(state, safe ? state.lastSafe : state.phase === 'catch' ? continuationRefugeAt(state) : C.spawn);
  }
  if(!anchorValid(state.recoveryAnchor)) {
    const safe=anchorValid(state.lastSafe)?state.lastSafe:{...C.spawn,phase:'wrong-return',level:0};
    const at=!state.fall&&!state.recovery&&anchorValid(state)?state:safe;
    state.recoveryAnchor=earnedAnchor({...at,elapsed:state.elapsed},at===state?'landing':'entry');
  }
  return state;
}
export function resumeSourceContinuation(value, { reverse = false, runId, returnPose } = {}) {
  const state = normalizeSourceContinuation(value, { runId, returnPose }); state.status = 'active'; state.direction = reverse ? 'reverse' : 'forward';
  if (reverse) { state.phase = 'catch'; state.level = C.catch.levels - 1; Object.assign(state, C.catch.finalApproach); state.fall = state.recovery = state.reveal = null; state.grace = C.graceSeconds; state.lastSafe = supportedPose(state); }
  return state;
}
const exitPursuit=state=>!!state.exitPassage?.enteredReason&&state.phase==='catch'&&state.x>SOURCE_EXIT_PASSAGE.door.x
  &&sourceExitPassageContains(state)&&Math.abs(state.feet-SOURCE_EXIT_PASSAGE.door.y)<2.1;
function insideRefuge(state) {
  if(exitPursuit(state))return false;
  if (state.chartId===0&&state.phase === 'catch' && state.level === 0 && state.x > C.catch.center.x+12.65 && Math.abs(state.z-C.catch.center.z)<1.1) return true;
  const refuge = continuationRefugeAt(state);
  return (refuge.chartId??0)===state.chartId&&Math.abs(state.feet - refuge.feet) < .4 && distance(state, refuge) < (refuge.radius??(state.phase === 'catch' || state.feet<8 ? 1.28 : state.chartId===0?3.0:2.5));
}
export function sourceContinuationGait(state,input={}){
  const nearHush=state.hush?.active&&state.hush.chartId===state.chartId&&state.hush.mode==='follow'&&distance(state,state.hush)<25;
  const chase=state.phase==='catch'?!!archipelagoChase(state)||exitPursuit(state):!!nearHush;
  const place=state.phase==='catch'?'exterior':C.place;
  const gait=chooseGait({place,run:!!input.run,chase,winded:state.breath?.winded});
  return{place,chase,gait,speed:gaitSpeed(gait)};
}
export function sourceContinuationDoorFraction(state, id) {
  if(id==='catch-final'&&!archipelagoExitReady(state))return 0;
  const motion = state?.doorMotion?.[id]; if (!motion) return state?.doorOpen?.[id] ? 1 : 0;
  const to = motion.to ? 1 : 0, progress = motion.duration > 0 ? clamp((finite(state.elapsed) - motion.startedAt) / motion.duration, 0, 1) : 1;
  return clamp(motion.from + (to - motion.from) * progress, 0, 1);
}
function staticSolidBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationChartSolids(state).some(s => s.role !== 'closure' && state.feet + C.bodyHeight > s.minY + .04 && state.feet < s.maxY - .04 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function doorBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationChartDoors(state).some(d => {
    if (d.role === 'false-return' || sourceContinuationDoorFraction(state, d.id) >= C.doorPassFraction || Math.abs(state.feet - d.y) >= .6) return false;
    const n = d.normal || (Math.abs(Math.sin(d.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 }), dx = x - d.x, dz = z - d.z;
    return Math.abs(dx * n.x + dz * n.z) < .12 + r && Math.abs(-dx * n.z + dz * n.x) < d.width / 2 + r;
  });
}
function solidBlocks(x, z, state) {
  if (staticSolidBlocks(x, z, state) || doorBlocks(x, z, state)) return true;
  return continuationChartSolids(state).some(s => s.role === 'closure' && state.feet + C.bodyHeight > s.minY + .04 && state.feet < s.maxY - .04 && x + C.bodyRadius > s.minX && x - C.bodyRadius < s.maxX && z + C.bodyRadius > s.minZ && z - C.bodyRadius < s.maxZ);
}
export function sourceContinuationCanOccupy(x, z, state) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || solidBlocks(x, z, state)) return false;
  const support = continuationSupportAt(x, z, state);
  if (!support) return false;
  // A higher overlapping deck is a ceiling, not a floor the body can clip into.
  return !continuationChartSurfaces(state).some(s => s.y > support.y + .04 && s.y - s.thickness < support.y + C.bodyHeight - .03 && continuationSurfaceContains(s, x, z));
}
function move(state, dx, dz,dt,events) {
  const attempt=(mx,mz)=>{
    const x=state.x+mx,z=state.z+mz,support=continuationSupportAt(x,z,state);
    if(support&&sourceContinuationCanOccupy(x,z,state)&&continuationFreeBody({x,z,feet:support.y},state,{ignoreFloors:true})) {
      state.x=x;state.z=z;state.feet=support.y;
      if(support.surface.region==='catch')state.level=support.level;state.lastSafe=supportedPose(state);return true;
    }
    if(!support&&continuationFreeBody({x,z,feet:state.feet},state)) {
      launchFall(state,{vx:mx/dt,vz:mz/dt,vy:0,trigger:'step-off',groundedExit:true},events);
      const result=continuationBallisticStep(state.fall,dt,state);Object.assign(state,{x:state.fall.x,z:state.fall.z,feet:state.fall.feet});if(result.support)land(state,result.support,events);return true;
    }
    return false;
  };
  if(!attempt(dx,dz)){if(dx)attempt(dx,0);if(!state.fall&&dz)attempt(0,dz);}
}
function learn(state, id) { if (!state.knowledge.includes(id)) state.knowledge.push(id); }
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, a.feet - b.feet);
function pathLength(path) { return path.slice(1).reduce((n, p, i) => n + pointDistance(path[i], p), 0); }
function bodySweepClear(a, b, state) {
  if((a.chartId??state.chartId)!==(b.chartId??state.chartId))return false;
  const obstacles=continuationCatchObstacles(state).filter(s=>s.kind!=='door'||sourceContinuationDoorFraction(state,s.id)<C.doorPassFraction);
  const count = Math.max(1, Math.ceil(pointDistance(a, b) / .09));
  for (let i = 0; i <= count; i++) { const t = i / count, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t };
    if (!continuationBodyClearAt(p, { radius: C.bodyRadius, height: C.bodyHeight, margin: 0,obstacles })) return false; }
  return true;
}
function makeRecovery(state, reason) {
  const anchor=state.recoveryAnchor,level=anchor.level,target=position(anchor),targetPhase=anchor.phase;
  let from=physicalPosition(state),path=[],kind='sling';
  if(pointDistance(from,target)<.02)return {reason,kind:state.phase==='catch'?'sling':'guided-return',from,target,path:[from,target],duration:C.recoverySeconds,elapsed:0,repaired:false,fromPhase:state.phase,targetPhase};
  if(anchor.chartId!==state.chartId)return {reason,kind:'blackout-return',from,target,path:[from,target],duration:C.recoverySeconds,elapsed:0,repaired:false,fade:true,blackoutAlpha:0,fromPhase:state.phase,targetPhase};
  if(state.phase==='wrong-return'&&targetPhase==='wrong-return'&&!state.fall) {
    path=continuationSupportedPath(from,target,state)||[];kind='guided-return';
  } else if(state.phase==='catch'&&targetPhase==='catch'&&state.level===level) {
    const stage = continuationStage(level), center = C.catch.center, cruise = stage.y + C.recoveryRise;
    let theta = Math.atan2(state.z - center.z, state.x - center.x); while (theta < stage.startAngle) theta += Math.PI * 2; while (theta > stage.endAngle) theta -= Math.PI * 2;
    const r = stage.outerRadius + 1.25, first = { ...from, feet: cruise }, radial = { ...from, ...continuationRadialPoint(r, theta), feet: cruise };
    const targetAngle=Math.atan2(target.z-center.z,target.x-center.x);
    path = [from, first, radial]; const delta = angle(targetAngle - theta), n = Math.max(1, Math.ceil(Math.abs(delta) / .15));
    for (let k = 1; k <= n; k++) path.push({ ...from, ...continuationRadialPoint(r, theta + delta * k / n), feet: cruise });
    path.push({ ...target, feet: cruise }, target);
  } else {
    const cruise=Math.max(from.feet,target.feet)+C.recoveryRise;
    path=[from,{...from,feet:cruise},{...target,feet:cruise},target];
  }
  path = path.filter((p, i, all) => i === 0 || pointDistance(p, all[i - 1]) > 1e-7);
  const clear=path.length>1&&path.slice(1).every((p,i)=>kind==='guided-return'?continuationWalkSegment(path[i],p,null,state):bodySweepClear(path[i],p,state));
  if(!clear)return {reason,kind:'blackout-return',from,target,path:[from,target],duration:C.recoverySeconds,elapsed:0,repaired:false,fade:true,blackoutAlpha:0,fromPhase:state.phase,targetPhase};
  return { reason,kind,from,target,path,duration:clamp(Math.max(C.recoverySeconds,pathLength(path)/C.recoverySpeed),C.recoverySeconds,C.recoveryMaximumSeconds),elapsed:0,repaired:false,fromPhase:state.phase,targetPhase};
}
const recoveryAlpha=t=>Math.max(0,Math.min(1,t/.35,(1-t)/.35));
function voidRecovery(state,events) {
  const fallen=physicalPosition(state),origin=state.fall?.lastSupport||state.lastSafe,phase=origin.phase||state.fall?.fromPhase||state.phase;
  // A missed catch retries the supported departure actually used. Choosing a
  // canonical refuge here would turn an unseen pocket into free progression.
  const target=position({...origin,yaw:state.yaw,pitch:state.pitch});
  const cruise=Math.max(origin.feet,target.feet)+C.recoveryRise;
  let path=[fallen,{...fallen,feet:cruise},{...target,feet:cruise},target];
  const clear=target.chartId===state.chartId&&path.slice(1).every((p,k)=>bodySweepClear(path[k],p,state));
  state.fall=null;
  state.recovery={reason:'void-fall',kind:clear?'sling':'blackout-return',from:fallen,target,path:clear?path:[fallen,target],duration:clear?clamp(pathLength(path)/C.recoverySpeed,C.recoverySeconds,C.recoveryMaximumSeconds):C.recoverySeconds,elapsed:0,repaired:false,fromPhase:state.phase,targetPhase:phase,...(!clear?{fade:true,blackoutAlpha:0}:{})};
  events.push({type:'capture',reason:'void-fall',duration:state.recovery.duration,repaired:false,fade:!clear});
}
function carryPose(recovery) {
  if(recovery.kind==='blackout-return')return recovery.elapsed/recovery.duration<.5?recovery.from:recovery.target;
  const total = pathLength(recovery.path), wanted = total * Math.min(1, recovery.elapsed / recovery.duration); let passed = 0;
  for (let i = 1; i < recovery.path.length; i++) { const a = recovery.path[i - 1], b = recovery.path[i], length = pointDistance(a, b);
    if (wanted <= passed + length + 1e-9) { const t = length ? clamp((wanted - passed) / length, 0, 1) : 1,p={ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t };if(recovery.kind==='guided-return'){const support=continuationSupportAt(p.x,p.z,p);if(support)p.feet=support.y;}return p; } passed += length; }
  return recovery.target;
}
export function sourceContinuationRecoveryPlan(value, reason = 'counterweight') { return makeRecovery(normalizeSourceContinuation(value), reason); }
function beginRecovery(state, reason, events) {
  if (state.recovery || state.grace > 0 || insideRefuge(state)) return;
  state.fall = null; state.recovery = makeRecovery(state, reason);
  if (state.recovery.repaired) Object.assign(state, state.recovery.from);
  events.push({ type: 'capture', reason, duration: state.recovery.duration, repaired: state.recovery.repaired,anchor:{...state.recoveryAnchor},fade:!!state.recovery.fade });
}
function wakeWeight(state, events) {
  if (state.counterweight.active) return; const w = state.counterweight; w.active = true; w.mode = 'warning'; w.elapsed = 0;
  events.push({ type: 'counterweight-warning', level: w.level, cycle: w.cycle, reason: 'first-voluntary-descent', position: { x: w.x, y: w.y, z: w.z } });
}
function beginFall(state, lip, events) {
  launchFall(state,{vx:lip.dx*.8||0,vz:lip.dz*.8||0,vy:0,trigger:'release',groundedExit:true},events);
  learn(state, `release-${state.level}`);
}
function launchFall(state,{vx=0,vz=0,vy=0,trigger='step-off',groundedExit=false},events) {
  if(state.fall||state.recovery)return;
  state.lastSafe=supportedPose(state);
  state.fall={x:state.x,z:state.z,feet:state.feet,chartId:state.chartId,yaw:state.yaw,pitch:state.pitch,level:state.level,vx:clamp(vx,-C.bodySpeedLimit,C.bodySpeedLimit),vz:clamp(vz,-C.bodySpeedLimit,C.bodySpeedLimit),vy,fromLevel:state.level,fromPhase:state.phase,trigger,lastSupport:supportedPose(state),elapsed:0,unsupported:!groundedExit,groundedExit,
    voidLoop:captureContinuationVoidLoop(state)};
  recordContinuationHushDrop(state.hush,state.fall);
  if(state.phase==='catch'&&trigger==='release')wakeWeight(state,events);
  events.push({type:'drop',level:state.level,phase:state.phase,trigger,position:{x:state.x,y:state.feet,z:state.z}});
}
function land(state,support,events) {
  const trigger=state.fall?.trigger||'release',before=state.phase,origin=state.fall?.lastSupport||state.lastSafe;
  state.velocity={x:clamp(state.fall?.vx||0,-C.bodySpeedLimit,C.bodySpeedLimit),z:clamp(state.fall?.vz||0,-C.bodySpeedLimit,C.bodySpeedLimit)};
  state.feet=support.y;state.level=support.level??0;state.phase=support.surface.region==='catch'?'catch':'wrong-return';state.fall=null;
  if(state.phase==='catch')learn(state,`catch-${state.level}`);state.lastSafe=supportedPose(state);recordContinuationHushWalk(state.hush,state,{force:true});
  updateAnchor(state,{landing:true});
  if(before!==state.phase)events.push({type:'phase',phase:state.phase,via:'landing',crossed:true});
  if(state.phase==='catch'&&support.y<origin.feet-.15)wakeWeight(state,events);
  events.push({type:'land',level:state.level,phase:state.phase,surface:support.id,trigger});
}
function fallStep(fall, dt) {
  const oldFeet = fall.feet; fall.elapsed += dt; fall.x += fall.vx * dt; fall.z += fall.vz * dt;
  const supportHere = continuationSupportAt(fall.x, fall.z, { feet: fall.feet }, { minY: fall.feet - .01, maxY: fall.feet + .01 });
  if (!supportHere) fall.unsupported = true;
  if (!fall.unsupported) return null;
  fall.vy -= C.gravity * dt; fall.feet += fall.vy * dt;
  return continuationSupportAt(fall.x, fall.z, { feet: fall.feet }, { minY: fall.feet - .0001, maxY: oldFeet + .0001 });
}
const radial = (r, a) => continuationRadialPoint(r, a);
const weightPaths = [
  [radial(11.2, .8), radial(9, .8), radial(8, 0), { x: continuationDropLip({ level: 0 }).x, z: continuationDropLip({ level: 0 }).z }],
  [radial(8, 0), ...[.45, .9, 1.35, 1.8, 2.25, 2.7, Math.PI].map(a => radial(8, a)), { x: continuationDropLip({ level: 1 }).x, z: continuationDropLip({ level: 1 }).z }],
  [radial(7, Math.PI), ...[2.95, 2.75, 2.6].map(a => radial(7, a)), { x: continuationDropLip({ level: 2 }).x, z: continuationDropLip({ level: 2 }).z }],
  [radial(6, 2.6), ...[2.3,1.9,1.5,1.1,.7,.3,0,.4,.9,1.4,1.9,2.4,2.65].map(a => radial(7, a)), radial(9.4, 2.65)],
];
for(let level=3;level<C.catch.levels;level++){
  const stage=continuationStage(level),previous=continuationDropLip({level:level-1}),lip=continuationDropLip({level});
  const within=a=>{while(a<stage.startAngle)a+=Math.PI*2;while(a>stage.endAngle)a-=Math.PI*2;return Math.max(stage.startAngle+.08,Math.min(stage.endAngle-.08,a));};
  const from=within(previous.approachAngle),to=within(lip?.approachAngle??stage.refugeAngle);
  const radius=(stage.innerRadius+stage.outerRadius)/2,n=Math.max(1,Math.ceil(Math.abs(to-from)/.15));
  weightPaths[level]=Array.from({length:n+1},(_,k)=>radial(radius,from+(to-from)*k/n));
  if(lip)weightPaths[level].push({x:lip.x,z:lip.z});
}
function moveWeightTo(w, target, speed, dt) { const d = distance(w, target), amount = Math.min(d, speed * dt); if (d > 1e-8) { w.x += (target.x - w.x) / d * amount; w.z += (target.z - w.z) / d * amount; } return d <= amount + 1e-8; }
function setWeightMode(w, mode, events, type) { w.mode = mode; w.elapsed = 0; if (type) events.push({ type, level: w.level, cycle: w.cycle, position: { x: w.x, y: w.y, z: w.z } }); }
function advanceWeight(state, dt, events) {
  const w = state.counterweight, h = C.catch.hoist; if (!w.active) return; w.elapsed += dt;
  if (w.mode === 'warning') { if (w.elapsed >= C.catch.counterweightWarningSeconds) setWeightMode(w, 'walking', events, 'counterweight-moves'); return; }
  if (w.mode === 'returning') { if (moveWeightTo(w, h.shaft, h.returnSpeed, dt)) setWeightMode(w, 'rewinding', events, 'counterweight-rewind'); return; }
  if (w.mode === 'rewinding') { if (w.elapsed >= h.rewindSeconds) setWeightMode(w, 'hoisting', events, 'counterweight-hoist'); return; }
  if (w.mode === 'hoisting') { w.y = Math.min(h.travelY, w.y + h.upSpeed * dt); if (w.y >= h.travelY) { w.pathIndex = 0; setWeightMode(w, 'traversing', events, 'counterweight-traverse'); } return; }
  if (w.mode === 'traversing') { const targets = [{ x: h.start.x, z: h.shaft.z }, h.start], target = targets[w.pathIndex]; if (target && moveWeightTo(w, target, h.traverseSpeed, dt)) w.pathIndex++; if (w.pathIndex >= targets.length) setWeightMode(w, 'lowering-warning', events, 'counterweight-lowering-warning'); return; }
  if (w.mode === 'lowering-warning') { if (w.elapsed >= h.loweringWarningSeconds) setWeightMode(w, 'lowering', events, 'counterweight-lower'); return; }
  if (w.mode === 'lowering') { w.y = Math.max(C.catch.top, w.y - h.downSpeed * dt); if (w.y <= C.catch.top) { w.level = 0; w.pathIndex = 0; w.cycle++; setWeightMode(w, 'warning', events, 'counterweight-cycle'); } return; }
  if (w.mode === 'falling') {
    const support = fallStep(w.fall, dt); Object.assign(w, { x: w.fall.x, y: w.fall.feet, z: w.fall.z });
    if (support) { w.y = support.y; w.level = support.level; w.fall = null; w.pathIndex = 0; setWeightMode(w, 'warning', events, 'counterweight-lands'); }
    return;
  }
  const path = weightPaths[w.level], target = path?.[w.pathIndex];
  if (target) { if (moveWeightTo(w, target, C.catch.counterweightSpeed, dt)) w.pathIndex++; return; }
  if (w.level === C.catch.levels - 1) { setWeightMode(w, 'returning', events, 'counterweight-return'); return; }
  const lip = continuationDropLip({ level: w.level });
  w.fall = { x: w.x, z: w.z, feet: w.y, vx: lip.dx * .8 || 0, vz: lip.dz * .8 || 0, vy: 0, fromLevel: w.level, elapsed: 0, unsupported: false }; setWeightMode(w, 'falling', events, 'counterweight-release');
}
function weightTouchesPlayer(state) { const w = state.counterweight; return state.chartId===0&&w.active && w.y < state.feet + C.bodyHeight && w.y + C.catch.hoist.drumHeight > state.feet + .05 && distance(state, w) < C.catch.counterweightRadius + C.bodyRadius + .07; }
function tickWeight(state, dt, events) { advanceWeight(state, dt, events); if (weightTouchesPlayer(state)) beginRecovery(state, 'counterweight', events); }
export function continuationFocus(state) {
  if (!state || state.status !== 'active' || state.fall || state.recovery) return null;
  const candidates = continuationChartDoors(state).filter(d => Math.abs(state.feet - d.y) < .55 && distance(state, d) <= 1.7).map(d => ({ ...d, type: d.role, title: d.role === 'return' ? 'OPEN THE RETURN DOOR' : d.role === 'final' ? archipelagoExitReady(state)?'OPEN THE GREY DOOR':'HELD BY THE COUNTERWEIGHT' : 'OPEN THE DOOR', text: d.role==='final'&&!archipelagoExitReady(state)?'The chain disappears through the lower islands.':'The handle is within reach.', position: { x: d.x, y: d.y + 1.1, z: d.z } }));
  if (state.phase === 'catch') for (const lip of continuationDropLips(state)) if (distance(state, lip) <= .7) candidates.push({ ...lip, y: state.feet, type: 'drop', title: 'LOWER YOURSELF FROM THE EDGE', text: 'Look at the supporting structure below.', position: { x: lip.x, y: state.feet, z: lip.z } });
  return candidates.filter(d => { const dx = d.x - state.x, dz = d.z - state.z, len = Math.hypot(dx, dz); return state.phase==='catch'||d.type === 'drop' || len < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / len > .1; }).sort((a, b) => distance(state, a) - distance(state, b))[0] || null;
}
function toggleDoor(state, id, events) { if(id==='catch-final'&&!archipelagoExitReady(state))return;const from = sourceContinuationDoorFraction(state, id), to = state.doorOpen[id] ? 0 : 1; state.doorOpen[id] = !!to; state.doorMotion[id] = { from, to, startedAt: state.elapsed, duration: C.doorSwingSeconds * Math.abs(to - from) }; events.push({ type: 'door', id, open: !!to }); }
function approachDoors(state, events) {
  // Forward thresholds acknowledge a visible approach. Return doors still
  // belong to an intentional retreat; neither opening nor looking crosses one.
  for (const door of continuationChartDoors(state)) {
    if(door.role==='final'&&!archipelagoExitReady(state))continue;
    if (!['onward', 'false-return', 'final'].includes(door.role) || door.phase !== state.phase
      || Math.abs(state.feet - door.y) >= .55) continue;
    const dx = door.x - state.x, dz = door.z - state.z, metres = Math.hypot(dx, dz);
    const n = door.normal || (Math.abs(Math.sin(door.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 });
    const aligned = Math.abs(-dx * n.z + dz * n.x) <= door.width / 2 + .45;
    const seen = state.phase==='catch'||metres < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / metres > .35;
    if (!aligned || !seen) continue;
    // The existing saved leaf motion is also the once-only arrival record.
    // A deliberate manual reversal keeps its meaning on later approaches.
    if (metres <= C.doorApproachDistance && !state.doorOpen[door.id] && !state.doorMotion[door.id]) {
      toggleDoor(state, door.id, events);state.doorMotion[door.id].automatic=true;events.at(-1).automatic = true;
    }
    if (door.role === 'false-return' && metres <= 1.7 && sourceContinuationDoorFraction(state, door.id) >= C.doorPassFraction)
      learn(state, 'false-return-porch');
  }
}
function interact(state, events) { const focus = continuationFocus(state); if (!focus) return; if (focus.type === 'drop') { beginFall(state, focus, events);events.at(-1).id=focus.id; } else {
  if(state.doorOpen[focus.id]&&state.doorMotion[focus.id]?.automatic)return;
  toggleDoor(state, focus.id, events); if (focus.type === 'false-return') learn(state, 'false-return-porch');
} }
function returnCrossed(state, before) {
  return continuationChartDoors(state).some(d => {
    if (d.role !== 'return' || sourceContinuationDoorFraction(state, d.id) < C.doorPassFraction || state.feet<d.y-.04||state.feet+C.bodyHeight>d.y+d.height+.01) return false;
    const n = d.normal || { x: 0, z: 1 }, dx = state.x - d.x, dz = state.z - d.z;
    return Math.abs(-dx * n.z + dz * n.x) < d.width / 2 - C.bodyRadius && (before.x - d.x) * n.x + (before.z - d.z) * n.z <= C.bodyRadius && dx * n.x + dz * n.z > C.bodyRadius;
  });
}
function phaseCrossing(state, before, events) {
  const d = C.wrongReturn.threshold, clear = state.chartId===0&&sourceContinuationDoorFraction(state, d.doorId) >= C.doorPassFraction && state.feet>=d.y-.04&&state.feet+C.bodyHeight<=d.y+2.3+.01 && Math.abs(state.z - d.z) < d.halfWidth - C.bodyRadius;
  if (!clear) return;
  if (state.phase === 'wrong-return' && state.x < d.x - C.bodyRadius && before.x >= d.x - C.bodyRadius) { state.phase = 'catch'; state.level = 0;if(state.fall)state.fall.voidLoop=null; learn(state, 'entered-the-spindle');noteContinuationCatchEntry(state.hush,state); events.push({ type: 'phase', phase: 'catch', doorId: d.doorId, crossed: true }); }
  else if (state.phase === 'catch' && state.level === 0 && state.x > d.x + C.bodyRadius && before.x <= d.x + C.bodyRadius) { state.phase = 'wrong-return'; events.push({ type: 'phase', phase: 'wrong-return', doorId: d.doorId, crossed: true }); }
}
function finalCrossed(state,before,events) {
  if(!archipelagoExitReady(state))return false;
  const passage=advanceSourceExitPassage(state.exitPassage,{before,after:state,
    doorPassable:sourceContinuationDoorFraction(state,'catch-final')>=C.doorPassFraction,
    supported:!state.fall&&!!continuationSupportAt(state.x,state.z,state,{minY:state.feet-.02,maxY:state.feet+.02}),
    bodyRadius:C.bodyRadius,bodyHeight:C.bodyHeight,events});
  state.exitPassage=passage.state;if(!passage.complete)return false;
  const id=`${state.runId}:source-continuation-exit`,firstCompletion=!state.completed;state.phase='catch';state.level=C.catch.levels-1;state.completed=true;state.status='completed';state.exitReceipt=state.exitReceipt||{id,delivered:false};events.push({type:'complete',receipt:id,firstCompletion,airborne:!!state.fall});return true;
}
function tickClosure(state, dt, events) {
  const c = state.closure;
  if (state.chartId===0&&state.knowledge.includes('false-return-porch') && state.feet > 8 && state.x > 3 && state.x < 9 && state.z > 1 && c.mode === 'dormant') { c.mode = 'primed'; c.elapsed = 0; learn(state, 'upper-return-is-different'); events.push({ type: 'return-recognized', position: { x: 6, y: 8.4, z: 3.5 } }); }
  if (c.mode === 'primed' && state.z < -2) {
    // Approaching/touching the visible corrupted chunks excites this existing
    // front sooner. It never spends the six-second visible warning or moves
    // collision ahead of the saved closure's actual closing phase.
    const reaction=sourceChunkFaultResponse(state);
    c.exposure += dt*(1+SOURCE_CHUNK_FAULT.chargeBoost*reaction.amount);
    if (c.exposure >= C.wrongReturn.pressureDelay) { c.mode = 'warning'; c.elapsed = 0; events.push({ type: 'closure-warning', position: { x: c.frontX, y: 9.4, z: -12 },reactive:reaction.amount>0,touching:reaction.touching }); }
  }
  else if (c.mode === 'warning' || c.mode === 'closing') { c.elapsed += dt; if (c.elapsed >= C.wrongReturn.warningSeconds) { c.mode = 'closing'; c.frontX = Math.max(C.wrongReturn.closureEndX, C.wrongReturn.closureStartX - (c.elapsed - C.wrongReturn.warningSeconds) * C.wrongReturn.closureSpeed); if (state.chartId===0&&state.feet > 8 && Math.abs(state.x - c.frontX) < .65 && state.z > -14 && state.z < -10) beginRecovery(state, 'closing-front', events); } }
}
// A fault that stands like the practice hall's tear opens onto the room behind
// it. The body it returns stands beside it, so it must walk clear before another.
function touchRiftFault(state,events) {
  if(state.riftLatch){if(sourceRiftFaultClear(state,state.riftLatch))state.riftLatch=null;return;}
  const fault=sourceRiftFaultTouched(state);if(!fault)return;
  state.riftLatch=fault.id;events.push({type:'rift-fault',id:fault.id,position:{x:state.x,y:state.feet,z:state.z}});
}
// The tide may carry a body to an edge, never through a fold, a return, the
// threshold or the final door: crossing those stays the player's own act.
function tideCrosses(state,before) {
  if(sourceExitPassageEndCrossed(before,state,{bodyRadius:C.bodyRadius}))return true;
  if(continuationPortalCrossing(before,state)||returnCrossed(state,before))return true;
  const across=(door,halfWidth)=>state.chartId===0&&Math.abs(state.feet-door.y)<.6&&Math.abs(state.z-door.z)<halfWidth+.5&&Math.sign(before.x-door.x)!==Math.sign(state.x-door.x);
  return across(C.wrongReturn.threshold,C.wrongReturn.threshold.halfWidth)||across(C.catch.finalDoor,.9);
}
function crossPortal(state,before,events) {
  const edge=continuationPortalCrossing(before,state);if(!edge)return false;
  const source={...state,fall:state.fall?{...state.fall}:null},receipt=transferContinuationPortal(state,edge);
  recordContinuationHushFold(state.hush,receipt,source);
  const support=continuationSupportAt(state.x,state.z,state,{minY:state.feet-.02,maxY:state.feet+.02});
  if(!source.fall&&support&&Math.abs(continuationBodyAxis(state)[1]-1)<1e-6&&continuationFreeBody(state,state)){state.fall=null;state.feet=support.y;state.bodyTransit=null;state.cameraTransit=null;state.lastSafe=supportedPose(state);}
  if(state.chartId!==0&&state.phase==='catch'){state.phase='wrong-return';state.level=0;events.push({type:'phase',phase:state.phase,via:'fold'});}
  events.push({type:'fold',...receipt});return true;
}
function tickHush(state,dt,events,{frozen=false,offerContact=false,defeated=false}={}) {
  const exploring=state.phase==='catch'&&!archipelagoChase(state)&&!exitPursuit(state);
  const protectedRefuge=insideRefuge(state)||exploring;
  let refuge=state.phase==='catch'&&state.level===0&&state.x>C.catch.center.x+12.65&&!exitPursuit(state)?{x:state.x,z:state.z,feet:state.feet,chartId:state.chartId}:continuationRefugeAt(state);
  // Match the widened upper listening pocket. The pursuer must settle into
  // its existing yield/notice state, rather than freeze in follow and catch
  // immediately when a listener steps back out.
  if(state.phase==='wrong-return'&&state.chartId===0&&Math.abs(state.feet-C.wrongReturn.refuge.feet)<.4)refuge={...refuge,standOff:3};
  if(exploring)refuge={...state,standOff:24};
  if(advanceContinuationHush(state.hush,{dt,player:state,protectedRefuge,refuge,frozen,defeated,events,pace:state.phase==='catch'?(exploring?6.2:C.hush.chaseSpeed):null})){
    const before=state.recovery;beginRecovery(state,'hush-pressure',events);
    if(!before&&state.recovery&&offerContact)state.recovery.contact='pending';
  }
}
function tick(state, input, dt, events, travel) {
  state.elapsed += dt; state.grace = Math.max(0, state.grace - dt);
  advancePortalTransit(state,dt);
  // A reached body may refuse Contact. Hold the existing physical recovery
  // until the dialogue returns a decision; loading/reload cannot spend it.
  if(state.recovery?.contact==='pending')return;
  if (state.recovery) { const recovery = state.recovery; recovery.elapsed = Math.min(recovery.duration, recovery.elapsed + dt);if(recovery.fade)recovery.blackoutAlpha=recoveryAlpha(recovery.elapsed/recovery.duration); Object.assign(state, carryPose(recovery));if(recovery.targetPhase&&recovery.fade&&recovery.blackoutAlpha===1&&recovery.elapsed>=recovery.duration*.5){state.phase=recovery.targetPhase;state.level=recovery.target.level;} tickWeight(state, dt, events);tickHush(state,dt,events,{frozen:true}); if (recovery.elapsed + 1e-8 >= recovery.duration) { Object.assign(state, position(recovery.target));state.phase=recovery.targetPhase||state.phase; state.lastSafe = supportedPose(state); state.recovery = null; state.velocity={x:0,z:0};state.grace = C.graceSeconds;reconnectContinuationHush(state.hush,state); events.push({ type: 'recovered', reason: recovery.reason }); } return; }
  state.corridor=advanceSourceConnectorCorridor(state.corridor,{dt,player:state,hush:state.hush,events});
  if (state.fall) {
    state.breath=stepBreath(state.breath,dt,{gait:sourceContinuationGait(state,input).gait});
    advanceArchipelagoProgress(state,{dt,events});
    let before={...state};
    const result=continuationBallisticStep(state.fall,dt,state);Object.assign(state,{x:state.fall.x,z:state.fall.z,feet:state.fall.feet});
    if(result.wraps.length){
      for(const receipt of result.wraps){state.lastSpaceWrap=receipt;events.push({type:'space-wrap',...receipt});}
      // A change of coordinate image is not a walked crossing of every door
      // between the two addresses. Only the remaining real segment can exit.
      before={...before,...result.wraps.at(-1).after};
    }
    if(state.fall.fromPhase==='catch'&&state.feet<state.fall.lastSupport.feet-.15)wakeWeight(state,events);
    if(!result.wraps.length&&crossPortal(state,before,events)){}
    else if(result.support)land(state,result.support,events);else if(result.void)voidRecovery(state,events);
    phaseCrossing(state,before,events);
    if(returnCrossed(state,before)){state.status='returned';events.push({type:'return',returnPose:clone(state.returnPose),airborne:!!state.fall});return;}
    if(finalCrossed(state,before,events))return;
  } else {
    approachDoors(state, events);
    const before = {...state}, forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1), len = Math.max(1, Math.hypot(forward, side)), gait=sourceContinuationGait(state,input), amount = gait.speed * dt / len;
    const movementYaw=state.yaw;
    move(state, (Math.sin(movementYaw) * forward + Math.cos(movementYaw) * side) * amount, (-Math.cos(movementYaw) * forward + Math.sin(movementYaw) * side) * amount,dt,events);
    const walked=distance(before,state);
    state.breath=stepBreath(state.breath,dt,{gait:walked>1e-8?gait.gait:null,fear:gait.chase?.8:0});
    advanceArchipelagoProgress(state,{dt,travel:walked,events});
    if(!state.fall)travel.metres+=walked;
    if(walked>1e-8)state.heading=Math.atan2(state.x-before.x,-(state.z-before.z));
    // This Source's tide and the night's wind, felt only by a live body
    // that is neither seated nor already carried by fall, recovery or fold.
    if(input.environment&&!state.fall&&state.grace<=0&&!state.reveal&&!state.cameraTransit&&!state.bodyTransit){
      const tide=advanceSourceTide(state,dt,{moving:forward!==0||side!==0,anchored:!!input.anchored});
      if(tide.dx||tide.dz){
        const pre={...state};move(state,tide.dx,tide.dz,dt,events);
        if(!state.fall&&tideCrosses(state,pre))Object.assign(state,{x:pre.x,z:pre.z,feet:pre.feet,level:pre.level,lastSafe:pre.lastSafe});
      }
    }
    if(input.environment&&!state.fall&&!state.cameraTransit&&!state.bodyTransit)touchRiftFault(state,events);
    state.velocity={x:clamp((state.x-before.x)/dt,-C.bodySpeedLimit,C.bodySpeedLimit),z:clamp((state.z-before.z)/dt,-C.bodySpeedLimit,C.bodySpeedLimit)};
    crossPortal(state,before,events);
    if(!state.fall)recordContinuationHushWalk(state.hush,state,{protectedRefuge:insideRefuge(state)});
    phaseCrossing(state, before, events);
    if(!state.fall)state.lastSafe=supportedPose(state);
    updateAnchor(state);
    if (returnCrossed(state, before)) { state.status = 'returned'; events.push({ type: 'return', returnPose: clone(state.returnPose) }); return; }
    if (state.feet < .5 && state.z < -18) { state.wrongLap = Math.max(state.wrongLap, 1); learn(state, 'under-the-return'); }
    if (state.feet > 4 && state.feet < 5) learn(state, 'middle-construction');
    if (state.feet > 8) state.wrongLap = Math.max(state.wrongLap, 2);
    if(finalCrossed(state,before,events))return;
  }
  tickClosure(state, dt, events); tickWeight(state, dt, events);tickHush(state,dt,events,{frozen:!!state.recovery,offerContact:input.offerHushContact===true,defeated:input.hushDefeated===true});
}
export function stepSourceContinuation(value, input = {}) {
  const state = normalizeSourceContinuation(value), events = [], travel = { metres: 0 };
  if (input.paused || input.renderReady === false || !['active', 'not-started'].includes(state.status)) return { state, event: null, events };
  if (state.status === 'not-started') state.status = 'active';
  const look = input.look || {}; state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta)); state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.42, 1.3);
  if (input.interact) interact(state, events);
  const jumping=!!input.jump&&!state.jumpHeld;state.jumpHeld=!!input.jump;
  if(jumping&&!state.fall&&!state.recovery) {
    const forward=clamp(input.forward??0,-1,1),side=clamp(input.side??0,-1,1),len=Math.max(1,Math.hypot(forward,side)),yaw=state.yaw;
    const held=Math.hypot(forward,side)>0;
    const speed=sourceContinuationGait(state,input).speed;
    launchFall(state,{vx:held?(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed/len:state.velocity.x,vz:held?(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*speed/len:state.velocity.z,vy:C.jumpSpeed,trigger:'jump',groundedExit:false},events);
  }
  if (state.status !== 'active') return { state, event: events.at(-1) || null, events };
  state.accumulator += clamp(input.dt ?? 0, 0, .25);
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') { const phase = state.phase, authored = !!(state.recovery || state.fall); state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events, travel); if (phase !== state.phase || authored && !state.recovery && !state.fall || events.at(-1)?.type === 'rift-fault') { state.accumulator = 0; break; } }
  state.accumulator = Math.max(0, state.accumulator);
  return { state, event: events.find(e => e.type === 'return' || e.type === 'complete') || events.at(-1) || null, events, acceptedTravelMetres: travel.metres };
}
export function sourceContinuationFrame(value) {
  const state = normalizeSourceContinuation(value),bodyEye=[state.x,state.feet+C.eyeHeight,state.z], player = { x: state.x, y: state.feet, z: state.z,chartId:state.chartId, yaw:state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight, visible:false };
  return { ...state, active: state.status === 'active', player,bodyEye,cameraBasis:continuationCameraBasis(state),camera:{ mode: 'first-person', eye:continuationCameraEye(state), yaw: state.yaw, pitch: state.pitch },
    blackoutAlpha:state.recovery?.blackoutAlpha||0,presentation: { reveal: null, recovery: state.recovery }, focus: continuationFocus(state), geometry: { surfaces: continuationSurfaces(), solids: continuationSolids(state), doors: continuationDoors().map(d => ({ ...d, openFraction: sourceContinuationDoorFraction(state, d.id) })), props: continuationProps() },
    cutaway: null, locomotion:sourceContinuationGait(state),pursuitSection:archipelagoChase(state)?.id||null,
    objective: state.phase === 'wrong-return' ? 'Explore the remembered construction.' : 'Explore the islands beyond the spindle.' };
}
export function sourceContinuationThreatTelemetry(value, { horizonSeconds = 180 } = {}) {
  const state = normalizeSourceContinuation(value), w = state.counterweight, horizon = clamp(horizonSeconds, 0, 360);
  const result = { model: 'stationary-authored-route', counterfactual: true, assumption: 'Player remains at this pose while active grace counts down.', mode: w.mode, cycle: w.cycle, active: w.active, refuge: insideRefuge(state), distance: Math.hypot(state.x - w.x, state.z - w.z, state.feet - w.y), timeToContact: null, horizonSeconds: horizon };
  if (!w.active || result.refuge) return result;
  for (let t = 0; t <= horizon + 1e-9; t += 1 / 60) { if (state.grace <= 0 && weightTouchesPlayer(state)) { result.timeToContact = t; break; } if (t + 1 / 60 > horizon + 1e-9) break; advanceWeight(state, 1 / 60, []); state.grace = Math.max(0, state.grace - 1 / 60); }
  return result;
}
