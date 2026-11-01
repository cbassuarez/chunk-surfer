// The ground under Earthfall moves the way the ground at China Lake moved in
// the 2019 Ridgecrest Mw 7.1 (see docs/plans/earthfall-quake.md and
// tools/chunk_surfer/build-earthfall-record.py). Everything here is a pure
// function of the committed elapsed time, so reload, pause and arbitrary-time
// studies agree, and nothing touches the player's input or look.
import {SOURCE_EARTHFALL_RECORD as RECORD} from './generated/source-earthfall-record.js';

const freeze=Object.freeze;
export const SOURCE_EARTHFALL_QUAKE=freeze({
  // The record is entered 1.1 s before its P pick, so the commitment step is
  // followed by 0.4 s of its own quiet head, then the P jolt.
  recordLead:1.1,
  // What the eye sees shift is not the ground's displacement (he rides that)
  // but his own body swaying on it: a standing body is a damped oscillator near
  // 1.6 Hz laterally and stiffer vertically. Screen scale is three times the
  // response so it reads at game distances.
  // The head's sway also tilts him, as an inverted pendulum about ~0.9 m, and
  // that tilt is what puts the horizon off level: ~1.3 degrees at the peak.
  body:freeze({hz:1.6,damping:.25,verticalHz:3,verticalDamping:.3,tiltLength:.9}),
  displacementScale:5,verticalScale:8,
  // Buildings are damped single-degree-of-freedom oscillators driven by the
  // record. Low courses ring near 2 Hz; the false Ellery, taller and heavier,
  // near 0.9 Hz, so it lags and overshoots the ground.
  damping:.05,swayScale:6,
  buildings:freeze({ellery:freeze({hz:.9,height:24}),instrument:freeze({hz:1.6,height:9}),low:freeze({hz:2,height:6})}),
});
const Q=SOURCE_EARTHFALL_QUAKE;
const N=RECORD.samples,RATE=RECORD.rate,DURATION=(N-1)/RATE;
const sample=(values,seconds)=>{
  if(!(seconds>=0)||seconds>=DURATION)return 0;
  const at=seconds*RATE,i=Math.floor(at),f=at-i;
  return values[i]+(values[Math.min(N-1,i+1)]-values[i])*f;
};
export const earthfallRecordDuration=()=>DURATION;
// Record seconds for a committed Earthfall, or null before the step out.
export function earthfallRecordTime(elapsed,committed=true){
  return committed&&Number.isFinite(Number(elapsed))?Number(elapsed)+Q.recordLead:null;
}

// The shaking's strength, 0..1, for sound and secondary motion: a short-time
// envelope of the horizontal acceleration against the record's own peak.
const envelope=(()=>{
  const out=new Float32Array(N),a=RECORD.acceleration;let level=0,peak=0;
  const k=1-Math.exp(-1/(RATE*.18));
  for(let i=0;i<N;i++){level+=(Math.hypot(a.east[i],a.north[i])-level)*k;out[i]=level;peak=Math.max(peak,level);}
  for(let i=0;i<N;i++)out[i]/=peak||1;
  return out;
})();
export const earthfallQuakeIntensity=seconds=>sample(envelope,seconds);

// Relative displacement of a damped oscillator under the recorded ground
// acceleration, integrated once at 1.2 kHz and kept at the record's rate.
function oscillatorResponse(hz,acceleration,damping=Q.damping){
  const w=2*Math.PI*hz,z=damping,steps=20,dt=1/(RATE*steps),out=new Float32Array(N);
  let u=0,v=0;
  for(let i=0;i<N;i++){
    for(let s=0;s<steps;s++){
      const t=(i+s/steps)/RATE,ag=sample(acceleration,t);
      v+=(-ag-2*z*w*v-w*w*u)*dt;u+=v*dt;
    }
    out[i]=u;
  }
  return out;
}
const responses=new Map();
let bodyResponse=null;
function body(){
  return bodyResponse||=(()=>{const b=Q.body;return{
    east:oscillatorResponse(b.hz,RECORD.acceleration.east,b.damping),north:oscillatorResponse(b.hz,RECORD.acceleration.north,b.damping),
    up:oscillatorResponse(b.verticalHz,RECORD.acceleration.up,b.verticalDamping)};})();
}
function response(kind){
  if(!responses.has(kind)){
    const hz=(Q.buildings[kind]||Q.buildings.low).hz;
    responses.set(kind,{east:oscillatorResponse(hz,RECORD.acceleration.east),north:oscillatorResponse(hz,RECORD.acceleration.north)});
  }
  return responses.get(kind);
}

/**
 * The ground's motion at a committed time, in Earthfall's local metres
 * (+x east, -z north, +y up) and radians. `roll` tilts the horizon about the
 * view's north axis, `pitch` about its east axis.
 */
export function earthfallGroundMotion(elapsed,{committed=true,reducedMotion=false}={}){
  const seconds=earthfallRecordTime(elapsed,committed);
  if(seconds==null)return{seconds:null,x:0,y:0,z:0,roll:0,pitch:0,intensity:0,still:true};
  const intensity=earthfallQuakeIntensity(seconds);
  if(reducedMotion)return{seconds,x:0,y:0,z:0,roll:0,pitch:0,intensity,still:true};
  // The world moves opposite to the head's sway relative to the ground.
  const b=body();
  return{seconds,intensity,still:false,
    x:-sample(b.east,seconds)*Q.displacementScale,
    y:-sample(b.up,seconds)*Q.verticalScale,
    z:sample(b.north,seconds)*Q.displacementScale,
    roll:sample(b.east,seconds)/Q.body.tiltLength,
    pitch:-sample(b.north,seconds)/Q.body.tiltLength};
}

// A building's top displacement relative to its base, metres, and the lean
// that puts it there. Pure function of time; zero before the step out.
export function earthfallBuildingSway(kind,elapsed,{committed=true,reducedMotion=false}={}){
  const seconds=earthfallRecordTime(elapsed,committed);
  if(seconds==null||reducedMotion)return{dx:0,dz:0,leanX:0,leanZ:0};
  const r=response(kind),height=(Q.buildings[kind]||Q.buildings.low).height;
  const dx=sample(r.east,seconds)*Q.swayScale,dz=-sample(r.north,seconds)*Q.swayScale;
  // Effective height of the first mode is about 0.7 of the building.
  return{dx,dz,leanX:dz/(height*.7),leanZ:-dx/(height*.7)};
}

// Rotation (roll about z, then pitch about x) and translation as a column-major
// 4x4 that pivots about a point. Callers premultiply prop matrices with it.
export function earthfallMotionMatrix({x=0,y=0,z=0,roll=0,pitch=0}={},pivot=[0,0,0]){
  const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch);
  // R = Rx(pitch) * Rz(roll)
  const r=[cr,cp*sr,sp*sr, -sr,cp*cr,sp*cr, 0,-sp,cp];
  const [px,py,pz]=pivot;
  const tx=px+x-(r[0]*px+r[3]*py+r[6]*pz),ty=py+y-(r[1]*px+r[4]*py+r[7]*pz),tz=pz+z-(r[2]*px+r[5]*py+r[8]*pz);
  return new Float32Array([r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,tx,ty,tz,1]);
}
