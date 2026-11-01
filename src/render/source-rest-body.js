// Bounded first-person seated performance. The furniture owns the coordinate
// frame; turning the head never carries a hand, knee or rail along with it.
import {sourceRestBodyFrame} from '../game/source-rest-body-frame.js';
import {sourceRestBodyThighHeight} from './source-rest-body-models.js';

export const SOURCE_REST_HAND_ASSET='assets/source-rest/seated-hands.glb';
export const SOURCE_REST_HAND_MESHES=Object.freeze(['rest_hand_left','rest_hand_right']);
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const sub=(a,b)=>a.map((n,k)=>n-b[k]),add=(a,b)=>a.map((n,k)=>n+b[k]),mul=(v,s)=>v.map(n=>n*s),dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0),
  cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>mul(v,1/(Math.hypot(...v)||1));
const matrix=(x,y,z,p)=>[...x,0,...y,0,...z,0,...p,1];
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[12+k]);
const thighCache=new Map();
function thighHeight(f,r){const key=f+':'+r;if(!thighCache.has(key))thighCache.set(key,sourceRestBodyThighHeight(f,r));return thighCache.get(key);}

// Exact two-segment solve, with a deliberate outward/back elbow pole. A hand
// can keep its support while the shoulder slumps; the sleeve never stretches
// an arbitrary half-metre toward a floating wrist.
function elbowAt(shoulder,wrist,pole,upper=.30,fore=.27){
  const delta=sub(wrist,shoulder),d=Math.min(upper+fore-.00001,Math.max(.0001,Math.hypot(...delta))),axis=unit(delta),
    along=(upper*upper-fore*fore+d*d)/(2*d),height=Math.sqrt(Math.max(0,upper*upper-along*along)),
    toward=sub(pole,shoulder),bend=unit(sub(toward,mul(axis,dot(toward,axis))));
  return add(shoulder,add(mul(axis,along),mul(bend,height)));
}
function segment(a,b,frame){
  const y=unit(sub(b,a)),raw=sub(frame.right,mul(y,dot(frame.right,y))),x=unit(raw),z=cross(x,y),length=Math.hypot(...sub(b,a));
  return matrix(x,mul(y,length),z,a);
}
function handMatrix(frame,wrist,pitch=0,turn=0,roll=0){
  const f=add(mul(frame.forward,Math.cos(turn)),mul(frame.right,Math.sin(turn))),r=unit(cross(f,frame.up)),
    z=mul(add(mul(f,Math.cos(pitch)),mul(frame.up,Math.sin(pitch))),-1),u=unit(cross(z,r)),
    x=add(mul(r,Math.cos(roll)),mul(u,Math.sin(roll))),y=add(mul(u,Math.cos(roll)),mul(r,-Math.sin(roll)));
  return matrix(x,y,z,wrist);
}
function part(seat,id,mesh,m,extra={}){
  return {id:'source-continuation-rest-affliction-'+id,mesh,matrix:new Float32Array(m),x:m[12],y:m[13],z:m[14],
    decorative:true,structural:false,noShadow:true,restAffliction:true,restBody:true,chartId:seat.chartId,region:seat.phase,
    cullRadius:1.3,...extra};
}

export function sourceRestBodyPose({cue={},seat,origin={},reducedMotion=false}={}){
  const frame=sourceRestBodyFrame(seat,{origin}),presence=cue.bodyProgress===undefined?1:clamp(cue.bodyProgress);
  if(!frame||cue.embodied===false||presence<.001)return {parts:[],contacts:[],gesture:'absent',frame:null};
  const seated=smooth(0,1,presence),entry=(1-seated)*.32,
    // No independent body oscillator. Audio and media holds retain their own
    // clocks; these gestures read existing transition, narrative and injury.
    pain=seat.phase==='catch'?0:clamp(cue.pain),loss=clamp(cue.facultyLoss),strain=clamp(cue.strain),
    brace=clamp((reducedMotion?pain*.22:pain*.88)+strain*.10*(1-loss)),
    slack=smooth(.24,.98,loss)*(1-brace),
    attemptAge=(Number(cue.unwrappedTime??cue.time)||0)-(Number(cue.duration)||0)*.68,
    // A single short correction on the existing media clock. A broad
    // narrative-progress envelope would leave the wrist hovering for a minute.
    correction=reducedMotion||loss<.24||!(cue.duration>0)?0:smooth(0,.32,attemptAge)*(1-smooth(.55,1.25,attemptAge)),
    // Weakening settles the shoulders back into the real backrest. Pushing
    // the chest toward an independently sinking eye would hide the hands.
    hip=frame.seatHeight+.10,lean=-loss*.10,
    offset={f:(seat.approach.x-seat.x)*frame.forward[0]+(seat.approach.z-seat.z)*frame.forward[2],
      r:(seat.approach.x-seat.x)*frame.right[0]+(seat.approach.z-seat.z)*frame.right[2]},
    at=(f,u,r)=>frame.point(f+offset.f*(1-seated),u+entry,r+offset.r*(1-seated)),
    // Standard right-handed mesh space: X right, Y up, -Z forward.
    trouserScale=hip/.67,
    bodyMatrix=matrix(frame.right,mul(frame.up,trouserScale),mul(frame.forward,-1),at(0,hip,0)),
    jacketMatrix=matrix(frame.right,add(mul(frame.up,Math.cos(lean)),mul(frame.forward,Math.sin(lean))),
      add(mul(frame.forward,-Math.cos(lean)),mul(frame.up,Math.sin(lean))),at(0,hip-loss*.012,0)),
    parts=[part(seat,'lap','source-continuation-rest-body-lap',bodyMatrix),part(seat,'jacket','source-continuation-rest-body-jacket',jacketMatrix)],contacts=[];
  for(const [side,sign]of [['left',-1],['right',1]]){
    const rail=side==='left'?frame.contacts.leftArm:null,
      handF=rail?rail.local[0]:.29,
      handR=rail?rail.local[2]+.075:sign*.155,
      surface=rail?rail.local[1]:hip+thighHeight(handF,handR)*trouserScale,
      // Palm underside, rather than the wrist's centre, meets the support.
      contactLift=(rail?0:.013)+brace*(rail?.010:.015)+correction*.014,
      handU=surface+.024+contactLift,
      // The anatomical fingers already curl over the knee. Tilting the whole
      // hand down the thigh as well would drive those fingers into the cloth.
      pitch=rail?0:-.06,
      wrist=at(handF,handU,handR),hand=handMatrix(frame,wrist,pitch+(reducedMotion?0:pain*.025),rail?-Math.PI/2:sign*-.08,sign*slack*.025),
      shoulder=transform(jacketMatrix,[sign*(rail?.29:.215),.43,.035]),
      elbow=elbowAt(shoulder,wrist,at(-.07,.78,sign*(rail?.54:.34))),
      upper=segment(shoulder,elbow,frame),fore=segment(elbow,wrist,frame);
    parts.push(part(seat,'shoe-'+side,'source-continuation-rest-body-shoe-'+side,matrix(frame.right,frame.up,mul(frame.forward,-1),at(0,.67,0))),
      part(seat,'upper-sleeve-'+side,'source-continuation-rest-body-upper-sleeve',upper),
      part(seat,'sleeve-'+side,'source-continuation-rest-body-fore-sleeve',fore),
      part(seat,'cuff-'+side,'source-continuation-rest-body-cuff',fore),
      part(seat,'hand-'+side,'rest_hand_'+side,hand,{character:{morphs:{brace,slack},loop:false}}));
    contacts.push({id:side,kind:rail?'bench-armrest':'thigh',support:at(rail?rail.local[0]:handF,surface,rail?rail.local[2]:handR),wrist,shoulder,elbow,
      surfaceHeight:surface,palmClearance:contactLift,brace,slack});
  }
  return {parts,contacts,frame,gesture:pain>.02?'brace':correction>.05?'failed-readjustment':slack>.2?'slackening':'resting',
    diagnostics:{seatId:seat.id,anchoredTo:'physical-bench',seated,brace,slack,correction,independentBreathing:false,syntheticPain:false}};
}
