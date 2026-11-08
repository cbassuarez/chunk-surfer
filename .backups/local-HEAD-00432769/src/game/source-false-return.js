import { SOURCE_CONTINUATION } from '../data/source-continuation.js';
import {freshThresholdGag,normalizeThresholdGag,advanceThresholdGag} from './threshold-gag.js';
import {thresholdGagPenetration} from '../data/threshold-gag.js';
import {thresholdGagInspectFocus,inspectThresholdGag,advanceThresholdGagInspection} from './threshold-gag-inspection.js';
import {thresholdGagClearSight} from './threshold-gag-sight.js';
import {findFakeElleryPath,normalizeFakeElleryNavigation} from './fake-ellery-path.js';
import {freshHushDensityPose,normalizeHushDensityPose,stepHushDensityPose} from './hush-density-performance.js';

// This controller borrows a detached Ellery layout. It has no ordinary-world,
// inventory, Contact, recorder or normal-exit authority.
const KIND = 'source-false-return';
const VERSION = 1;
const BODY_RADIUS = .22;
const BODY_HEIGHT = 1.8;
const WALK_SPEED = 3;
const STEP_UP = .45;
const PASSABLE = .85;
const SWING_SECONDS = .45;
const DEFAULT_SPAWN = { x: 75, z: 58.75, feet: 4.8, yaw: -Math.PI / 2, pitch: 0 };
const NOISE_WINDOW = 2.4;
const HUSH_RADIUS = .3;
const HUSH_HEIGHT = 2.18;
const HUSH_SPEED = 3.8;
const CONTACT_DISTANCE = .72;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
const angle = v => Math.atan2(Math.sin(finite(v)), Math.cos(finite(v)));
const idOK = id => typeof id === 'string' && /^[a-zA-Z0-9_:-]{1,96}$/.test(id);
const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(idOK))].slice(0, 96);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const mapIds = (value, fn) => Object.fromEntries(Object.entries(record(value)).filter(([id]) => idOK(id)).slice(0, 96).map(([id, v]) => [id, fn(v)]));
const localPose = (value, fallback = DEFAULT_SPAWN) => ({
  x: clamp(finite(value?.x, fallback.x), -10000, 10000),
  z: clamp(finite(value?.z, fallback.z), -10000, 10000),
  feet: clamp(finite(value?.feet, fallback.feet), -10000, 10000),
  yaw: angle(value?.yaw ?? fallback.yaw), pitch: clamp(value?.pitch ?? fallback.pitch, -1.3, 1.3),
});
function hostPose(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) && !Number.isFinite(value.z)) return null;
  try {
    if (Object.values(value).some(v => typeof v === 'number' && !Number.isFinite(v))) return null;
    return JSON.parse(JSON.stringify(value));
  } catch { return null; }
}

const trapId = runId => `${runId}:${KIND}:noise-trap`;
const freshNoiseTrap = runId => ({ schema: 1, phase: 'quiet', eventId: trapId(runId), armedUntil: 0,
  elapsed: 0, contactElapsed: 0, contactFromYaw:0,contactYaw:0,contactFromPitch:0,
  noiseAt: null, latchedDoors:[],consequenceApplied: false, aftermathElapsed: 0 });
function normalizeNoiseTrap(value, runId) {
  const fresh = freshNoiseTrap(runId);
  if (!value || value.schema !== 1 || value.eventId !== fresh.eventId) return fresh;
  const phase = ['quiet','armed','approach','contact','committed'].includes(value.phase) ? value.phase : 'quiet';
  const noiseAt = value.noiseAt && ['x','z','feet'].every(k => Number.isFinite(value.noiseAt[k]))
    ? { x: clamp(value.noiseAt.x,-10000,10000), z: clamp(value.noiseAt.z,-10000,10000), feet: clamp(value.noiseAt.feet,-10000,10000) } : null;
  return { ...fresh, phase, armedUntil: clamp(value.armedUntil,0,1e9), elapsed: clamp(value.elapsed,0,1e9),
    contactElapsed: clamp(value.contactElapsed,0,1e9), noiseAt,
    contactFromYaw:angle(value.contactFromYaw),contactYaw:angle(value.contactYaw),contactFromPitch:clamp(value.contactFromPitch,-1.3,1.3),
    latchedDoors:ids(value.latchedDoors),
    consequenceApplied: phase === 'committed' && value.consequenceApplied === true,
    aftermathElapsed: phase === 'committed' ? clamp(value.aftermathElapsed,0,.8) : 0 };
}
function normalizeLocalHush(value, trap) {
  if (!['approach','contact'].includes(trap.phase) || !value || value.eventId !== trap.eventId
    || !['x','z','feet','yaw'].every(k => Number.isFinite(value[k]))) return null;
  return { x: clamp(value.x,-10000,10000), z: clamp(value.z,-10000,10000), feet: clamp(value.feet,-10000,10000),
    yaw: angle(value.yaw), phase: trap.phase, elapsed: clamp(value.elapsed,0,1e9), eventId: trap.eventId,
    density:normalizeHushDensityPose(value.density)||freshHushDensityPose(37),
    navigation:normalizeFakeElleryNavigation(value.navigation) };
}

export function sourceFalseReturnNoiseArmed(state) {
  return state?.status === 'active' && state.noiseTrap?.phase === 'armed'
    && state.elapsed <= state.noiseTrap.armedUntil && (state.opened || []).length < 5 && !(state.sourceDoors || []).length;
}

export function freshSourceFalseReturn({ runId = '', returnPose = null, spawn = DEFAULT_SPAWN } = {}) {
  const at = localPose(spawn);
  return { version: VERSION, kind: KIND, runId: String(runId), status: 'active', ...at,
    elapsed: 0, opened: [], sourceDoors: [], doorOpen: {}, doorMotion: {}, doorSides: {},
    thresholdGag:freshThresholdGag(),noiseTrap:freshNoiseTrap(String(runId)),localHush:null,
    loopLatch: null, lastSafe: { ...at }, returnPose: hostPose(returnPose), exitReceipt: null };
}

export function normalizeSourceFalseReturn(value, { runId, spawn = DEFAULT_SPAWN } = {}) {
  const validOrigin = value?.version === VERSION && value?.kind === KIND
    && (runId == null || String(runId) === String(value.runId));
  const fresh = freshSourceFalseReturn({ runId: runId ?? value?.runId ?? '', spawn, returnPose: validOrigin ? value?.returnPose : null });
  if (!value || value.version !== VERSION || value.kind !== KIND
    || runId != null && String(runId) !== String(value.runId)) return fresh;
  const state = { ...fresh, ...localPose(value, localPose(spawn)),
    status: value.status === 'completed' ? 'completed' : 'active',
    elapsed: clamp(value.elapsed, 0, 1e9), opened: ids(value.opened), sourceDoors: ids(value.sourceDoors),
    doorOpen: mapIds(value.doorOpen, Boolean), doorMotion: {},
    doorSides: mapIds(value.doorSides, v => v < 0 ? -1 : 1),
    thresholdGag:normalizeThresholdGag(value.thresholdGag),noiseTrap:normalizeNoiseTrap(value.noiseTrap,fresh.runId),
    loopLatch: idOK(value.loopLatch) ? value.loopLatch : null,
    lastSafe: localPose(value.lastSafe, localPose(spawn)), returnPose: hostPose(value.returnPose) };
  state.localHush = normalizeLocalHush(value.localHush,state.noiseTrap);
  if (['approach','contact'].includes(state.noiseTrap.phase) && !state.localHush) state.noiseTrap.phase = 'quiet';
  for (const [id, m] of Object.entries(record(value.doorMotion))) {
    if (!idOK(id) || !m || !['from', 'startedAt', 'duration'].every(k => Number.isFinite(m[k]))) continue;
    state.doorMotion[id] = { from: clamp(m.from, 0, 1), to: state.doorOpen[id] ? 1 : 0,
      startedAt: clamp(m.startedAt, 0, state.elapsed), duration: clamp(m.duration, 0, SWING_SECONDS) };
  }
  if (state.status === 'completed' && value.exitReceipt?.reason === 'hush-taken'
    && value.exitReceipt.eventId === state.noiseTrap.eventId && state.noiseTrap.phase === 'committed' && state.noiseTrap.consequenceApplied) {
    state.exitReceipt = { id: `${state.runId}:${KIND}:source-II`, reason:'hush-taken', eventId:state.noiseTrap.eventId, delivered:!!value.exitReceipt.delivered };
    state.localHush = null;
  } else if (state.status === 'completed' && state.opened.length >= 5 && idOK(value.exitReceipt?.doorId)) {
    state.exitReceipt = { id: `${state.runId}:${KIND}:source-II`, doorId: value.exitReceipt.doorId, delivered: !!value.exitReceipt.delivered };
  } else {
    state.status = 'active';
    if(state.noiseTrap.phase==='committed'){state.noiseTrap=freshNoiseTrap(state.runId);state.localHush=null;}
  }
  return state;
}

// This is a proposal for the host's atomic injury + checkpoint write. Neither
// this controller nor the local scene may injure, remove gear or spend time.
export function sourceFalseReturnHushCompletion(value, eventId, {spawn=DEFAULT_SPAWN}={}) {
  const state = normalizeSourceFalseReturn(value,{spawn});
  if (state.status !== 'active' || state.noiseTrap.phase !== 'contact' || state.noiseTrap.eventId !== eventId || !state.localHush) return null;
  state.status = 'completed'; state.localHush = null;
  state.noiseTrap = { ...state.noiseTrap, phase:'committed', consequenceApplied:true, aftermathElapsed:0 };
  state.exitReceipt = { id:`${state.runId}:${KIND}:source-II`, reason:'hush-taken', eventId, delivered:false };
  if (state.thresholdGag?.inspection) { state.thresholdGag.inspection.phase='gone'; state.thresholdGag.inspection.captionUntil=0; }
  return state;
}

export function sourceFalseReturnNeeded(value, continuation, direction = 'forward', { earthfall = null } = {}) {
  if (direction !== 'forward' || !continuation || continuation.completed || continuation.direction === 'reverse') return false;
  const sameRun = value?.kind === KIND && value.version === VERSION && String(value.runId) === String(continuation.runId);
  if (sameRun) return value.status === 'active';
  // Journeys begun before this insertion keep their existing omen and body.
  if (earthfall) return false;
  const s = SOURCE_CONTINUATION.spawn;
  return continuation.phase === 'wrong-return' && (continuation.elapsed || 0) < .001
    && !(continuation.knowledge || []).length && !(continuation.wrongLap || 0)
    && Math.hypot(continuation.x - s.x, continuation.z - s.z) < .05
    && Math.abs(continuation.feet - s.feet) < .05;
}

export function sourceFalseReturnDoorFraction(state, id) {
  const m = state?.doorMotion?.[id];
  if (!m) return state?.doorOpen?.[id] ? 1 : 0;
  const p = m.duration > 0 ? clamp((finite(state.elapsed) - m.startedAt) / m.duration, 0, 1) : 1;
  return clamp(m.from + ((m.to ? 1 : 0) - m.from) * p, 0, 1);
}

const pursuing = state => ['approach','contact'].includes(state.noiseTrap?.phase);
const sourceBound = (state, id) => !pursuing(state) && (state.opened.length >= 5 || state.sourceDoors.includes(id));
const doorFeet = d => finite(d.feet, finite(d.y));
function normal(d) {
  const x = finite(d.normal?.x, Math.sin(finite(d.yaw))), z = finite(d.normal?.z, -Math.cos(finite(d.yaw)));
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
const signedDistance = (p, d, n = normal(d)) => (p.x - d.x) * n.x + (p.z - d.z) * n.z;
const halfWidth = d => finite(d.halfWidth, finite(d.width, finite(d.aperture?.width, 1.2)) / 2);
// Leaf indices follow the retained assembly's local width axis: leaf 0 is
// the negative half, leaf 1 the positive half, regardless of room-side normal.
export function sourceFalseReturnDoorAllowsWidth(door, widthCoord, radius = BODY_RADIUS) {
  if (!door || typeof door !== 'object' || !Number.isFinite(widthCoord) || !Number.isFinite(radius) || radius < 0) return false;
  const half = halfWidth(door), count = Math.max(1, Math.min(8, Math.round(finite(door?.leafCount, 1))));
  if (!(half > 0)) return false;
  const active = new Set(Array.isArray(door.activeLeaves) ? door.activeLeaves
    : Array.from({ length: count }, (_, i) => i));
  const low = widthCoord - radius, high = widthCoord + radius, width = half * 2 / count;
  let start = null;
  for (let i = 0; i < count; i++) {
    if (active.has(i)) {
      start ??= -half + i * width;
      const end = -half + (i + 1) * width;
      if (low >= start - 1e-9 && high <= end + 1e-9) return true;
    } else start = null;
  }
  return false;
}
const inBounds = (p, b) => !!b && p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
function support(p, state, layout) {
  const s = layout?.supportAt?.(p.x, p.z, { ...state, feet: p.feet });
  return s && Number.isFinite(s.floor) && Math.abs(s.floor - p.feet) <= STEP_UP + 1e-8
    && (!Number.isFinite(s.ceil) || s.ceil - s.floor >= BODY_HEIGHT) ? s : null;
}
function occupiable(p, state, layout, {ignoreGag=false}={}) {
  if((layout.bounds&&!inBounds(p,layout.bounds))||!support(p,state,layout)
    ||typeof layout.canOccupy==='function'&&!layout.canOccupy(p.x,p.z,{...state,feet:p.feet}))return false;
  if(ignoreGag)return true;
  const depth=thresholdGagPenetration(p.x,p.z,state,BODY_RADIUS,BODY_HEIGHT);
  // A legacy body may already occupy newly installed scenery. It may walk
  // out under normal control; the apparatus never relocates or shoves it.
  return depth<=0||depth<thresholdGagPenetration(state.x,state.z,state,BODY_RADIUS,BODY_HEIGHT)-1e-7;
}
function seedLayout(state, layout) {
  const doors = layout.doors || [], known = new Set(doors.map(d => d.id));
  state.opened = state.opened.filter(id => doors.some(d => d.id === id && d.counted));
  state.sourceDoors = state.sourceDoors.filter(id => known.has(id));
  for (const key of ['doorOpen', 'doorMotion', 'doorSides']) for (const id of Object.keys(state[key])) if (!known.has(id)) delete state[key][id];
  for (const d of doors) if (!(d.id in state.doorOpen)) state.doorOpen[d.id] = !!d.openInitial;
}

function hushFooting(x,z,state,layout) {
  const p=layout.supportAt?.(x,z,state);
  if(!p||!Number.isFinite(p.floor)||Math.abs(p.floor-state.feet)>STEP_UP||Number.isFinite(p.ceil)&&p.ceil-p.floor<HUSH_HEIGHT+.05)return null;
  for(const dx of[-HUSH_RADIUS,0,HUSH_RADIUS])for(const dz of[-HUSH_RADIUS,0,HUSH_RADIUS]){
    const q=layout.supportAt(x+dx,z+dz,{...state,feet:p.floor});
    if(!q||Math.abs(q.floor-p.floor)>.1||Number.isFinite(q.ceil)&&q.ceil-p.floor<HUSH_HEIGHT+.05
      ||layout.canOccupy&&!layout.canOccupy(x+dx,z+dz,{...state,feet:p.floor}))return null;
  }
  if(thresholdGagPenetration(x,z,state,HUSH_RADIUS,HUSH_HEIGHT)>0)return null;
  return p.floor;
}
function hushSight(actor,state,layout) {
  return thresholdGagClearSight({x:actor.x,y:actor.feet+1.35,z:actor.z},{x:state.x,y:state.feet+1.35,z:state.z},state,layout);
}
function trapLatchIds(layout) {
  const ids=new Set((layout.doors||[]).filter(d=>d.entry||d.outer).map(d=>d.id));
  for(const loop of layout.loops||[]){
    if(loop.doorId)ids.add(loop.doorId);
    else if(loop.id==='false-ellery-chapel')ids.add('chapel-c17');
  }
  return [...ids].filter(id=>(layout.doors||[]).some(d=>d.id===id));
}
function moveLocalDoor(state,d,open,events,extra={}) {
  if(state.doorOpen[d.id]===open)return;
  const from=sourceFalseReturnDoorFraction(state,d.id);
  state.doorOpen[d.id]=open;
  state.doorMotion[d.id]={from,to:open?1:0,startedAt:state.elapsed,
    duration:clamp(finite(d.openSeconds,SWING_SECONDS),.05,SWING_SECONDS)*Math.abs((open?1:0)-from)};
  events.push({type:'door',id:d.id,open,sourceBound:false,position:{x:d.x,y:doorFeet(d)+1.1,z:d.z},chartId:0,...extra});
}
function onLeaf(p,d,radius) {
  const n=normal(d),dx=p.x-d.x,dz=p.z-d.z;
  return Math.abs(dx*n.x+dz*n.z)<=radius+finite(d.leaf?.depth,.08)/2+.04
    &&Math.abs(-dx*n.z+dz*n.x)<=halfWidth(d)+radius;
}
function latchTrapDoors(state,layout,events) {
  for(const id of state.noiseTrap.latchedDoors){
    const d=(layout.doors||[]).find(d=>d.id===id);if(!d||onLeaf(state,d,BODY_RADIUS)||state.localHush&&onLeaf(state.localHush,d,HUSH_RADIUS))continue;
    moveLocalDoor(state,d,false,events,{latched:true});
  }
}
function openInterveningDoor(state,layout,events,targets=[state]) {
  const actor=state.localHush;if(!actor)return;
  for(const d of layout.doors||[]){
    if(state.noiseTrap.latchedDoors.includes(d.id)||state.doorOpen[d.id]||Math.abs(doorFeet(d)-actor.feet)>.4
      ||Math.hypot(d.x-actor.x,d.z-actor.z)>1.65)continue;
    let from=actor;
    for(const target of targets){
      const n=normal(d),a=signedDistance(from,d,n),b=signedDistance(target,d,n);
      if(a*b<0){const u=a/(a-b),x=from.x+(target.x-from.x)*u-d.x,z=from.z+(target.z-from.z)*u-d.z;
        if(Math.abs(-x*n.z+z*n.x)<=halfWidth(d)-.05){moveLocalDoor(state,d,true,events,{by:'hush'});return;}}
      from=target;
    }
  }
}
function startLocalHush(state,layout) {
  // Start from an actual supported rear approach. Never materialise the body
  // in front of the camera, on the player or through a closed doorway.
  const latchedDoors=trapLatchIds(layout),doorOpen={...state.doorOpen},doorMotion={...state.doorMotion};
  for(const id of latchedDoors){doorOpen[id]=false;delete doorMotion[id];}
  const sealed={...state,doorOpen,doorMotion};
  for(const distance of[4.2,3.6,4.8,3])for(const offset of[0,.35,-.35,.7,-.7,1,-1]){
    const bearing=state.yaw+Math.PI+offset,x=state.x+Math.sin(bearing)*distance,z=state.z-Math.cos(bearing)*distance,
      feet=hushFooting(x,z,sealed,layout);
    if(feet==null)continue;
    const actor={x,z,feet,yaw:Math.atan2(state.x-x,-(state.z-z)),phase:'approach',elapsed:0,eventId:state.noiseTrap.eventId,navigation:null,
      density:normalizeHushDensityPose({...freshHushDensityPose(37),event:'notice',listening:true})};
    if(hushSight(actor,sealed,layout))return actor;
  }
  return null;
}
function hushNavigation(actor,state,dt,layout){
  const old=actor.navigation,goal={x:state.x,z:state.z,feet:state.feet};
  if(old){old.age+=dt;while(old.points.length&&Math.hypot(old.points[0].x-actor.x,old.points[0].z-actor.z)<.1)old.points.shift();}
  if(old&&old.age<.25&&Math.hypot(old.goal.x-goal.x,old.goal.z-goal.z)<.8&&Math.abs(old.goal.feet-goal.feet)<.3
    &&old.points.every(p=>Math.hypot(p.x-actor.x,p.z-actor.z)<40))return old;
  const doorOpen={...state.doorOpen},doorMotion={...state.doorMotion};
  // Plan through operable interior leaves, then wait for their real swing.
  // Latched external leaves remain closed in both planning and simulation.
  for(const d of layout.doors||[])if(!state.noiseTrap.latchedDoors.includes(d.id)){doorOpen[d.id]=true;delete doorMotion[d.id];}
  const planned={...state,doorOpen,doorMotion},memo=new Map();
  const canStand=(x,z,feet)=>{
    const key=`${Math.round(x*10000)},${Math.round(z*10000)},${Math.round(feet*1000)}`;
    if(!memo.has(key))memo.set(key,hushFooting(x,z,{...planned,feet},layout));return memo.get(key);
  };
  const canTraverse=(a,b)=>{
    const distance=Math.hypot(b.x-a.x,b.z-a.z);if(distance>40)return false;
    let feet=a.feet;const steps=Math.max(1,Math.ceil(distance/.18));
    for(let i=1;i<=steps;i++){
      const u=i/steps,next=canStand(a.x+(b.x-a.x)*u,a.z+(b.z-a.z)*u,feet);if(next==null)return false;feet=next;
    }
    return Math.abs(feet-b.feet)<.15&&thresholdGagClearSight({x:a.x,y:a.feet+1.3,z:a.z},{x:b.x,y:b.feet+1.3,z:b.z},planned,layout);
  };
  const options={start:actor,goal,canStand,canTraverse,canSeeGoal:(a,b)=>thresholdGagClearSight({x:a.x,y:a.feet+1.3,z:a.z},{x:b.x,y:b.feet+1.3,z:b.z},planned,layout)};
  let route=findFakeElleryPath({...options,cellSize:.5,maxNodes:1200});
  if(route.status!=='found')route=findFakeElleryPath({...options,cellSize:.25,maxNodes:1600});
  actor.navigation={...route,age:0,goal};return actor.navigation;
}
function advanceNoiseTrap(state,dt,input,layout,events,newEvents) {
  const trap=state.noiseTrap;
  if(state.status!=='active'||!pursuing(state)&&((state.opened||[]).length>=5||(state.sourceDoors||[]).length)){
    if(trap.phase!=='committed'){trap.phase='quiet';state.localHush=null;}return;
  }
  if(pursuing(state)){
    if(!trap.latchedDoors.length)trap.latchedDoors=trapLatchIds(layout);
    latchTrapDoors(state,layout,events);
  }
  if(input.hushProtected){
    if(trap.phase==='armed')trap.armedUntil+=dt;
    if(trap.phase==='contact'){
      trap.phase='approach';trap.contactElapsed=0;
      if(state.localHush){state.localHush.phase='approach';state.localHush.elapsed=0;}
      events.push({type:'false-ellery-hush-cancel',eventId:trap.eventId,reason:'protected'});
    }
    return;
  }
  if(newEvents.some(e=>['loop','complete'].includes(e.type))){
    if(['approach','contact'].includes(trap.phase))events.push({type:'false-ellery-hush-cancel',eventId:trap.eventId,reason:'spatial-transfer'});
    trap.phase='quiet';state.localHush=null;return;
  }
  if(['quiet','armed'].includes(trap.phase)){
    if(newEvents.some(e=>['threshold-gag-release','threshold-gag-boo','threshold-gag-ghost-seen'].includes(e.type))){
      trap.phase='armed';trap.armedUntil=state.elapsed+NOISE_WINDOW;
      events.push({type:'false-ellery-noise-armed',eventId:trap.eventId,until:trap.armedUntil});
    }
    if(trap.phase==='armed'&&state.elapsed>trap.armedUntil){trap.phase='quiet';return;}
    if(input.playerNoise===true&&sourceFalseReturnNoiseArmed(state)){
      const actor=startLocalHush(state,layout);if(!actor)return;
      trap.phase='approach';trap.elapsed=0;trap.contactElapsed=0;trap.noiseAt={x:state.x,z:state.z,feet:state.feet};
      trap.latchedDoors=trapLatchIds(layout);state.localHush=actor;latchTrapDoors(state,layout,events);
      events.push({type:'false-ellery-hush-heard',eventId:trap.eventId,position:{...trap.noiseAt},anchor:{...actor}});
    }
    return;
  }
  const actor=state.localHush;if(!actor)return;
  if(hushFooting(actor.x,actor.z,{...state,feet:actor.feet},layout)==null){
    state.localHush=null;trap.phase='quiet';events.push({type:'false-ellery-hush-cancel',eventId:trap.eventId,reason:'invalid-footing'});return;
  }
  trap.elapsed+=dt;actor.elapsed+=dt;
  if(trap.phase==='contact'){
    trap.contactElapsed+=dt;
    const p=Math.min(1,trap.contactElapsed/(input.reducedMotion?.45:.22)),u=p*p*(3-2*p);
    // Contact arrests the existing physical view toward the body that has
    // actually reached it. The body never teleports into a camera billboard.
    state.yaw=angle(trap.contactFromYaw+angle(trap.contactYaw-trap.contactFromYaw)*u);
    state.pitch=trap.contactFromPitch*(1-u);return;
  }
  const dx=state.x-actor.x,dz=state.z-actor.z,distance=Math.hypot(dx,dz);
  if(distance<=CONTACT_DISTANCE&&Math.abs(actor.feet-state.feet)<.2&&hushSight(actor,state,layout)){
    trap.phase='contact';trap.contactElapsed=0;actor.phase='contact';actor.elapsed=0;
    trap.contactFromYaw=state.yaw;trap.contactYaw=Math.atan2(actor.x-state.x,-(actor.z-state.z));trap.contactFromPitch=state.pitch;
    events.push({type:'false-ellery-hush-contact',eventId:trap.eventId,anchor:{...actor}});return;
  }
  if(!dt)return;
  const navigation=hushNavigation(actor,state,dt,layout),target=navigation.points[0];if(!target)return;
  openInterveningDoor(state,layout,events,navigation.points.slice(0,8));
  const targetDistance=Math.hypot(target.x-actor.x,target.z-actor.z),bearing=Math.atan2(target.x-actor.x,-(target.z-actor.z)),
    travel=Math.min(HUSH_SPEED*dt,targetDistance),x=actor.x+Math.sin(bearing)*travel,z=actor.z-Math.cos(bearing)*travel,
    feet=hushFooting(x,z,{...state,feet:actor.feet},layout);
  // Only actual clear, supported small steps move the performer. A planned
  // open doorway still waits for its real leaf; there is no wall-crossing or
  // world-root correction when a cached route becomes unavailable.
  if(feet!=null&&thresholdGagClearSight({x:actor.x,y:actor.feet+1.3,z:actor.z},{x,y:feet+1.3,z},state,layout)){
    actor.x=x;actor.z=z;actor.feet=feet;actor.yaw=bearing;
  }
}

export function sourceFalseReturnFocus(value, layout = {}) {
  const state = normalizeSourceFalseReturn(value, { spawn: layout.spawn });
  if (state.status !== 'active' || state.noiseTrap.phase==='contact') return null;
  seedLayout(state, layout);
  const inscription=thresholdGagInspectFocus(state,layout);if(inscription)return inscription;
  const forward = { x: Math.sin(state.yaw), z: -Math.cos(state.yaw) };
  const candidates = (layout.doors || []).filter(d => Math.abs(state.feet - doorFeet(d)) < .45)
    .map(d => ({ d, distance: Math.hypot(state.x - d.x, state.z - d.z) }))
    .filter(({ d, distance }) => distance < 1.65 && (distance < .35
      || ((d.x - state.x) * forward.x + (d.z - state.z) * forward.z) / distance > -.15))
    .sort((a, b) => a.distance - b.distance);
  const d = candidates[0]?.d;
  if (!d) return null;
  const locked = pursuing(state)&&state.noiseTrap.latchedDoors.includes(d.id)||!d.counted && !d.entry && !sourceBound(state, d.id);
  return { type: 'door', id: d.id, locked, sourceBound: sourceBound(state, d.id),
    open: !!state.doorOpen[d.id], openFraction: sourceFalseReturnDoorFraction(state, d.id),
    title: locked ? 'LOCKED' : state.doorOpen[d.id] ? 'CLOSE THE DOOR' : 'OPEN THE DOOR',
    position: { x: d.x, y: doorFeet(d) + 1.1, z: d.z } };
}

function toggleDoor(state, layout, events) {
  const focus = sourceFalseReturnFocus(state, layout);
  if (!focus || focus.locked) return;
  const d = layout.doors.find(d => d.id === focus.id), from = sourceFalseReturnDoorFraction(state, d.id);
  const open = !state.doorOpen[d.id];
  if (!open) {
    const n = normal(d), dx = state.x - d.x, dz = state.z - d.z;
    if (Math.abs(dx * n.x + dz * n.z) <= BODY_RADIUS + finite(d.leaf?.depth, .08) / 2
      && Math.abs(-dx * n.z + dz * n.x) <= halfWidth(d) + BODY_RADIUS) {
      events.push({ type: 'door-obstructed', id: d.id }); return;
    }
    if(state.localHush&&onLeaf(state.localHush,d,HUSH_RADIUS+BODY_RADIUS)){
      events.push({type:'door-obstructed',id:d.id,by:'hush'});return;
    }
  }
  state.doorOpen[d.id] = open;
  state.doorMotion[d.id] = { from, to: open ? 1 : 0, startedAt: state.elapsed,
    duration: clamp(finite(d.openSeconds, SWING_SECONDS), .05, SWING_SECONDS) * Math.abs((open ? 1 : 0) - from) };
  if (open && !pursuing(state) && d.counted && !state.opened.includes(d.id) && state.opened.length === 4 && !state.sourceDoors.includes(d.id)) state.sourceDoors.push(d.id);
  events.push({ type: 'door', id: d.id, open, sourceBound: sourceBound(state, d.id) });
}
function countDoors(state, layout, events) {
  if(pursuing(state))return;
  for (const d of layout.doors || []) {
    if (!d.counted || state.opened.includes(d.id) || sourceFalseReturnDoorFraction(state, d.id) + 1e-9 < PASSABLE) continue;
    state.opened.push(d.id);
    if (state.opened.length >= 5 && !state.sourceDoors.includes(d.id)) state.sourceDoors.push(d.id);
    events.push({ type: 'door-passable', id: d.id, count: state.opened.length, sourceBound: sourceBound(state, d.id) });
  }
}
function loop(state, target, events) {
  Object.assign(state, localPose(target.arrival));
  state.lastSafe = localPose(state); state.loopLatch = target.id; state.doorSides = {};
  events.push({ type: 'loop', id: target.id, arrival: localPose(state) });
}
function complete(state, doorId, events) {
  state.status = 'completed';
  state.exitReceipt = { id: `${state.runId}:${KIND}:source-II`, doorId, delivered: false };
  events.push({ type: 'complete', doorId, receipt: { ...state.exitReceipt } });
}
function crossedDoor(state, from, to, d) {
  if (Math.abs(state.feet - doorFeet(d)) > .45) return null;
  const n = normal(d), a = signedDistance(from, d, n), b = signedDistance(to, d, n);
  const oldSide = Math.abs(a) > 1e-9 ? Math.sign(a) : state.doorSides[d.id];
  if (Math.abs(b) > 1e-9) state.doorSides[d.id] = Math.sign(b);
  if (!oldSide || !Math.sign(b) || oldSide === Math.sign(b)) return null;
  const t = Math.abs(a - b) > 1e-10 ? clamp(a / (a - b), 0, 1) : 0;
  const x = from.x + (to.x - from.x) * t - d.x, z = from.z + (to.z - from.z) * t - d.z;
  return { tangent: Math.abs(x * -n.z + z * n.x), widthCoord: x * Math.cos(finite(d.yaw)) + z * Math.sin(finite(d.yaw)) };
}
function advanceMove(state, dx, dz, layout, events, travel) {
  const distance = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(distance / .06));
  for (let i = 0; i < steps; i++) {
    const from = { x: state.x, z: state.z }, to = { x: state.x + dx / steps, z: state.z + dz / steps, feet: state.feet };
    const oldSides = { ...state.doorSides }, crossings = [];
    let blocked = false;
    for (const d of layout.doors || []) {
      const crossing = crossedDoor(state, from, to, d);
      if (!crossing || crossing.tangent > halfWidth(d) + BODY_RADIUS) continue;
      if (!sourceFalseReturnDoorAllowsWidth(d, crossing.widthCoord) || sourceFalseReturnDoorFraction(state, d.id) < PASSABLE) { blocked = true; break; }
      crossings.push(d);
    }
    // The far side of a Source-bound doorway is no longer Ellery. Validate
    // the real approach and aperture, then consume its crossing before asking
    // the old building for a floor beyond the threshold.
    const onward = !blocked && !pursuing(state) && state.opened.length >= 5
      ? crossings.find(d => sourceBound(state, d.id)) : null;
    if (onward && occupiable({ ...from, feet: state.feet }, state, layout)) {
      travel.metres+=Math.hypot(to.x-from.x,to.z-from.z);
      state.x = to.x; state.z = to.z;
      complete(state, onward.id, events); return true;
    }
    const s = support(to, state, layout);
    if (s) to.feet = s.floor;
    if (blocked || !s || !occupiable(to, state, layout)) { state.doorSides = oldSides; return false; }
    travel.metres+=Math.hypot(to.x-from.x,to.z-from.z);
    state.x = to.x; state.z = to.z; state.feet = s.floor;
    for (const d of crossings) {
      if (d.entry&&!pursuing(state)) { loop(state, { id: `entry:${d.id}`, arrival: layout.spawn }, events); return true; }
    }
    for (const target of layout.loops || []) {
      if (!pursuing(state) && state.loopLatch !== target.id && inBounds(state, target.bounds)
        && (!Number.isFinite(target.beforeCount) || state.opened.length < target.beforeCount)
        && !(target.sourceAfterFifth && state.opened.length >= 5)
        && (!Number.isFinite(target.feet) || Math.abs(state.feet - target.feet) < .45)) {
        loop(state, target, events);
        return true;
      }
    }
    if (state.loopLatch && !(layout.loops || []).some(l => l.id === state.loopLatch && inBounds(state, l.bounds))) state.loopLatch = null;
    state.lastSafe = localPose(state);
  }
  return false;
}

export function stepSourceFalseReturn(value, input = {}, layout = {}) {
  const state = normalizeSourceFalseReturn(value, { spawn: layout.spawn }), events = [], travel = { metres: 0 };
  if (state.status !== 'active' || input.paused || input.protected || input.renderReady === false || input.assetsReady === false) return { state, events };
  seedLayout(state, layout);
  if (!occupiable(state, state, layout,{ignoreGag:true})) {
    const safe = occupiable(state.lastSafe, state, layout,{ignoreGag:true}) ? state.lastSafe : localPose(layout.spawn);
    Object.assign(state, safe); state.lastSafe = localPose(state); state.doorSides = {};
  }
  const footing = support(state, state, layout);
  if (footing) state.feet = footing.floor;
  const look = input.look || {};
  state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta));
  state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.3, 1.3);
  countDoors(state, layout, events);
  if(input.interact){
    if(thresholdGagInspectFocus(state,layout))events.push(...inspectThresholdGag(state,layout,{authorized:!!input.inspectionAuthorized&&!input.inspectionProtected}));
    else toggleDoor(state,layout,events);
  }
  const dt = clamp(input.dt, 0, 1), steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1), length = Math.max(1, Math.hypot(forward, side));
  for (let i = 0; i < steps && state.status === 'active'; i++) {
    const eventStart=events.length;
    const h = dt / steps; state.elapsed += h; countDoors(state, layout, events);
    const held=state.noiseTrap.phase==='contact'&&!input.hushProtected;
    const dx = held?0:(Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * WALK_SPEED * h / length;
    const dz = held?0:(-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * WALK_SPEED * h / length;
    const before={x:state.x,z:state.z,feet:state.feet},transferred=advanceMove(state, dx, dz, layout, events, travel);
    advanceThresholdGag(state,before,h,events,{layout,reduced:!!input.reducedMotion,audioReady:input.gagAudioReady!==false});
    advanceThresholdGagInspection(state,before,h,events,{layout,reduced:!!input.reducedMotion,protectedScare:!!input.inspectionProtected});
    const oldHush=state.localHush?{x:state.localHush.x,z:state.localHush.z,yaw:state.localHush.yaw,eventId:state.localHush.eventId}:null;
    advanceNoiseTrap(state,h,input,layout,events,events.slice(eventStart));
    if(state.localHush&&!input.hushProtected){
      const actor=state.localHush,same=oldHush?.eventId===actor.eventId,
        accepted=same?Math.hypot(actor.x-oldHush.x,actor.z-oldHush.z):0;
      // Navigation/contact owns every root change. The material receives only
      // this accepted step; spawn and spatial transfers never become traction.
      actor.density=stepHushDensityPose(actor.density,{dt:h,acceptedMetres:accepted,
        headingDelta:same?angle(actor.yaw-oldHush.yaw):0,listening:!same,
        blocked:same&&actor.phase==='approach'&&accepted<1e-8,
        loading:actor.phase==='contact',loadProgress:Math.min(1,state.noiseTrap.contactElapsed/.22),
        seed:37,reducedMotion:!!input.reducedMotion});
    }
    if(transferred)break;
  }
  return { state, events, acceptedTravelMetres: travel.metres };
}
