// A saved encounter turns the existing woman's attention, never her root or
// useful hands. All joints remain in the canonical flat, absolute-rest rig.
import {busWomanPose} from './bus-woman-performance.js';
import {busWomanWrongOriginDescriptor,busWomanWrongOriginFrame,busWomanWrongOriginPose} from './bus-woman-wrong-origin-performance.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const axis=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)];
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(p,q)=>{const t=mul(cross(q.slice(0,3),p),2);return add(p,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const heading=q=>{const forward=rotate([0,0,-1],q);return Math.atan2(-forward[0],-forward[2]);};
const wrap=t=>Math.atan2(Math.sin(t),Math.cos(t));
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const ramp=(t,a,b)=>ease((t-a)/(b-a));
const pulse=(t,a,b,c)=>ramp(t,a,b)*(1-ramp(t,b,c));
const age=(event,clock)=>Number.isFinite(event)&&event<=clock?Math.max(0,clock-event):null;

export function busWomanPassageFrame(passage={}, {reducedMotion=false}={}){
  const clock=Number.isFinite(passage?.clock)?Math.max(0,passage.clock):0;
  const active=!!passage&&Number.isFinite(passage.clock);
  const passAge=age(passage?.passAt,clock)??age(passage?.exitedAt,clock);
  const noticeAge=age(passage?.noticeAt,clock)??age(passage?.closeAt,clock)??passAge;
  const noticed=noticeAge!=null,passed=passAge!=null;
  let target=wrap(Number.isFinite(passage?.gazeYaw)?passage.gazeYaw:-.80);
  // Once the passage is spent, crossing the angular seam cannot unwind her
  // skull through a new forward-facing turn. The planted body stays familiar.
  if(passed&&target>.35)target-=Math.PI*2;
  target=clamp(target,-2.75,.30);
  const recognition=noticed?(reducedMotion?1:ramp(noticeAge,.08,1.25)):0;
  const noticeYaw=-.035+(clamp(target,-1.12,.15)+.035)*recognition;
  const catchUp=passed?(reducedMotion?1:ramp(passAge,.12,.90)):0;
  const following=passed?(reducedMotion?1:ramp(passAge,.035,.40)):0;
  const pull=passed&&!reducedMotion?pulse(passAge,.08,.30,.78):0;
  const yaw=clamp(noticeYaw+(target-noticeYaw)*following-.085*pull,-2.75,.30);
  const strain=passed?.25+.75*pull:.12*recognition;
  return {active,clock,noticed,passed,noticeAge,passAge,recognition,noticeYaw,targetYaw:target,yaw,catchUp,pull,strain,
    pitch:-.155+.195*recognition-.055*pull,
    roll:-.035*strain,
    jawLag:reducedMotion?0:.065*pull,
    jawTraction:.004*strain,
    phase:!noticed?'masked':!passed?'recognition':passAge<.90?'following':'held'};
}

/** Absolute semantic joints, before the ordinary instance/root transform. */
export function busWomanPassagePose(mode='wait',seconds=0,options={}){
  const base=busWomanWrongOriginPose(mode,seconds,options),frame=busWomanPassageFrame(options.passage,options);
  if(!frame.active)return{...base,passage:frame};
  const joints={...base.joints},oldNeck=base.joints.neck,oldHead=base.joints.head,oldJaw=base.joints.jaw;
  const baseYaw=heading(oldHead.rotation),baseNeckYaw=heading(oldNeck.rotation);
  // The skull first turns; the damaged cervical column subsequently catches
  // up. Separate pivots give a visible two-part pull instead of a root spin.
  const neckYaw=frame.passed?frame.noticeYaw*.36+(frame.yaw-frame.noticeYaw)*.42*frame.catchUp:frame.yaw*.36;
  const headYaw=clamp(frame.yaw-neckYaw,-1.72,1.35);
  // Remove only the source clip's courtesy yaw before applying the captured
  // attention. Taking the shortest quaternion delta here would reverse the
  // intended turn when a positive acknowledgement precedes the -2.75rad stare.
  const neutralNeck=qmul(axis([0,1,0],-baseNeckYaw),oldNeck.rotation),neutralHead=qmul(axis([0,1,0],-baseYaw),oldHead.rotation);
  const neckRotation=qmul(axis([0,1,0],neckYaw),qmul(axis([1,0,0],frame.pitch*.35),qmul(axis([0,0,1],frame.roll*.60),neutralNeck)));
  const headRotation=qmul(axis([0,1,0],neckYaw+headYaw),qmul(axis([1,0,0],frame.pitch),qmul(axis([0,0,1],frame.roll),neutralHead)));
  const neckDelta=qmul(neckRotation,inverse(oldNeck.rotation)),skullDelta=qmul(headRotation,inverse(oldHead.rotation));
  const headPosition=add(oldNeck.translation,rotate(sub(oldHead.translation,oldNeck.translation),neckDelta));
  joints.neck={translation:[...oldNeck.translation],rotation:neckRotation};
  joints.head={translation:headPosition,rotation:headRotation};
  const rigidJaw=add(headPosition,rotate(sub(oldJaw.translation,oldHead.translation),skullDelta));
  // Preserve the authored jaw-to-skull relationship, then permit at most four
  // millimetres of traction toward the existing supported hand. The face,
  // eyes and wool cap follow their actual head weights; there are no eye bones.
  const pullDirection=unit(sub(base.joints.hand_R.translation,rigidJaw));
  joints.jaw={translation:add(rigidJaw,mul(pullDirection,frame.jawTraction)),
    rotation:qmul(axis([0,1,0],frame.jawLag),qmul(axis([1,0,0],.035*frame.strain),qmul(skullDelta,oldJaw.rotation)))};
  return {...base,joints,passage:{...frame,actualYaw:heading(joints.head.rotation),neckYaw,headYaw,rigidJaw,headPosition}};
}

/** Same post-rest deltas as the existing Wrong origin descriptor. This keeps
 * receipt/store/retrieval clips and both accessory joints exactly unchanged. */
export function busWomanPassageDescriptor(mode='wait',seconds=0,options={}){
  if(!Number.isFinite(options.passage?.clock))return busWomanWrongOriginDescriptor(mode,seconds,options);
  const authored=busWomanWrongOriginFrame(mode,seconds,options),original=busWomanPose(mode,authored.time),changed=busWomanPassagePose(mode,seconds,options),joints={};
  const delta=(a,b)=>({translation:sub(b.translation,a.translation),rotation:qmul(inverse(a.rotation),b.rotation)});
  for(const name of Object.keys(original.joints))joints['bus_woman_'+name]=delta(original.joints[name],changed.joints[name]);
  for(const name of['bag','ticket'])joints['bus_woman_'+name+'_joint']=delta(original.attachments[name],changed.attachments[name]);
  return{clip:'bus_woman_'+mode.replaceAll('-','_'),time:authored.time,loop:false,joints};
}
