// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
import {INDEX_REACH_SUPPORT} from './wheel-reach-contact.js';
// Approved anatomical hands on a circular rim. The caller supplies wheel centre,
// body and tilt WITHOUT wheel Z steering, plus the paused simulation clock.
// Wheel rotation remains the dynamics owner's value. Hands use bounded strokes,
// one-hand-at-a-time regrip and a separate shoulder-anchored two-link arm solve.
export const WHEEL_HAND_MESHES=Object.freeze(['drive_right_hand','drive_right_forearm','drive_right_sleeve','drive_right_upper_sleeve','drive_left_hand','drive_left_forearm','drive_left_sleeve','drive_left_upper_sleeve']);
export const WHEEL_HAND_GEOMETRY=Object.freeze({url:'/assets/source-drive/geometry/wheel-hands.glb',sha256:'8318287a8c2045c9fc38cf93886dbb562d68e5c0b0eef8207a9f227a44891fd0',majorRadius:.195,tubeRadius:.018,wheelCenter:[.48,1.20,-.39],tiltX:-.36,localDriverSide:'+Z'});
const REST={right:{p:[.2234624283108983,-.073,.09392720839674808],q:[-.4331624236712903,-.6851104059975737,.3129748307990521,.4950159609494874]},left:{p:[-.2234624283108983,-.073,.09392720839674808],q:[-.4331624236712903,.6851104059975737,-.3129748307990521,.4950159609494874]}};
const LIMIT=.98,REGRIP_AT=.78,REGRIP_SECONDS=.24,UPPER=.34,FOREARM=.32;
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);return n>1e-9?mul(a,1/n):[0,0,1];},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rz=(v,t)=>[v[0]*Math.cos(t)-v[1]*Math.sin(t),v[0]*Math.sin(t)+v[1]*Math.cos(t),v[2]];
function qrotate(v,q){const u=q.slice(0,3),t=mul(cross(u,v),2);return add(v,add(mul(t,q[3]),cross(u,t)));}
function align(v,a,b){const d=clamp(dot(a,b),-1,1);if(d>.999999)return v;if(d<-.999999){const axis=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return sub(mul(axis,2*dot(axis,v)),v);}const c=cross(a,b);const q=[...c,1+d],n=Math.hypot(...q);return qrotate(v,q.map(x=>x/n));}
function multiply(a,b){const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let i=0;i<4;i++)m[c*4+r]+=a[i*4+r]*b[c*4+i];return m;}
function armMap(rest,start,end,twist,restLength){const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>qrotate(v,rest.q)),current=basis.map(v=>typeof twist==='number'?rz(v,twist):qrotate(v,twist)),from=mul(current[1],-1),to=unit(sub(end,start));const target=current.map(v=>align(v,from,to)),scale=norm(sub(end,start))/restLength,m=Array(16).fill(0);for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]=target[0][r]*basis[0][c]+target[1][r]*basis[1][c]*scale+target[2][r]*basis[2][c];for(let r=0;r<3;r++)m[12+r]=start[r]-m[r]*rest.p[0]-m[4+r]*rest.p[1]-m[8+r]*rest.p[2];m[15]=1;return m;}
function elbowAt(side,wrist){const sign=side==='right'?1:-1,shoulder=[sign*.16,.03,.69],delta=sub(wrist,shoulder),actual=norm(delta),d=clamp(actual,Math.abs(UPPER-FOREARM)+1e-5,UPPER+FOREARM-1e-5),axis=unit(delta),along=(UPPER*UPPER-FOREARM*FOREARM+d*d)/(2*d),height=Math.sqrt(Math.max(0,UPPER*UPPER-along*along)),pole=[sign*.15,-1,.06],radial=unit(sub(pole,mul(axis,dot(pole,axis)))),elbow=add(add(shoulder,mul(axis,along)),mul(radial,height));return{shoulder,elbow,reach:actual,unreachable:actual>=UPPER+FOREARM,upperLength:norm(sub(elbow,shoulder)),forearmLength:norm(sub(wrist,elbow))};}
let controller=null,lastDiagnostics=null;
export function resetWheelHands(){controller=null;lastDiagnostics=null;}
export function wheelHandDiagnostics(){return lastDiagnostics?structuredClone(lastDiagnostics):null;}
function initialize(angle,time){controller={time,angle,still:0,hands:Object.fromEntries(['right','left'].map(side=>[side,{theta:0,offset:angle,release:false,progress:0,open:0,lift:0,slip:0}]))};}
function update(angle,time,holdForControl=false){if(!controller||time<controller.time||time-controller.time>.5)initialize(angle,time);const dt=clamp(time-controller.time,0,.05),velocity=dt>0?(angle-controller.angle)/dt:0;controller.still=Math.abs(velocity)<.08?controller.still+dt:0;
 for(const [side,h] of Object.entries(controller.hands)){if(side==='left'&&controller.reach&&!controller.reach.pending)continue;if(h.release){h.progress=Math.min(1,h.progress+dt/REGRIP_SECONDS);const t=h.progress,e=t*t*(3-2*t);h.theta=h.from+(h.goal-h.from)*e;h.open=Math.sin(Math.PI*t);h.lift=.075*h.open;h.slip=0;if(t>=1){h.release=false;h.open=h.lift=0;h.offset=angle-h.theta;}}else{const desired=angle-h.offset;h.theta=clamp(desired,-LIMIT,LIMIT);const slipping=Math.abs(desired)>LIMIT;h.slip+=((slipping?.45:0)-h.slip)*Math.min(1,dt*14);h.open=h.slip;h.lift=0;if(slipping)h.offset=angle-h.theta;}}
 if(!holdForControl&&!Object.values(controller.hands).some(h=>h.release)){const direction=Math.sign(velocity)||Math.sign(angle)||1,order=direction>0?['left','right']:['right','left'];let side=order.find(k=>Math.abs(controller.hands[k].theta)>=REGRIP_AT);let goal=-Math.sign(controller.hands[side]?.theta||direction)*.48;
  if(!side&&Math.abs(angle)<.04&&controller.still>.45){side=order.find(k=>Math.abs(controller.hands[k].theta)>.08);goal=0;}
  if(side){const h=controller.hands[side];h.release=true;h.progress=0;h.from=h.theta;h.goal=goal;}}
 controller.time=time;controller.angle=angle;return{dt,velocity};}
// Measured from the exported 8318287a8c20 skin/joints with the full reach pose.
// This is the palmar distal pad, not a guessed wrist-to-button offset. The test
// independently re-samples the actual character palette to catch asset drift.
const REACH_PAD=[-.021336365008549574,.08764843613492093,-.14097083606518712];
const LEFT_GRIP={index:[.4592898648837858,1.0386323403554367,.5129953715600861],middle:[.5828569049158008,1.2379082353615174,.49130170321308253],ring:[.6108647975530725,1.0349774610785136,.4391187185934594],pinky:[.6261322755523835,.8872959419240287,.31055357967341],thumb:[-.05526709535228381,0]};
export const WHEEL_HAND_REACH=Object.freeze({side:'left',outSeconds:.28,contactSeconds:.16,returnSeconds:.28,totalSeconds:.72,contact:'actual left index skin fingertip support',maximumReachM:UPPER+FOREARM,requires:'wheel-local target; optional outward surface normal; paused simulation time'});
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];
function qalign(a,b){a=unit(a);b=unit(b);const d=clamp(dot(a,b),-1,1);if(d<-.999999){const ax=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return[...ax,0];}const q=[...cross(a,b),1+d],n=Math.hypot(...q);return q.map(v=>v/n);}
function qslerp(a,b,t){let d=dot(a,b);if(d<0){b=b.map(v=>-v);d=-d;}if(d>.9995){const q=lerp(a,b,t),n=Math.hypot(...q);return q.map(v=>v/n);}const angle=Math.acos(clamp(d,-1,1)),den=Math.sin(angle);return a.map((v,i)=>(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/den);}
function readReach(value){if(!value)return null;if(!['tune','power','record','play','stop'].includes(value.kind))throw Error('Unknown wheel-hand control kind.');if(!Array.isArray(value.target)||value.target.length!==3||value.target.some(v=>!Number.isFinite(v)))throw Error('Control target must be a finite wheel-local fingertip point.');if(!Number.isFinite(value.elapsed)||value.elapsed<0)throw Error('Control reach needs nonnegative elapsed simulation seconds.');const normal=value.normal||[0,-.3522742333,.9358968237];if(!Array.isArray(normal)||normal.length!==3||normal.some(v=>!Number.isFinite(v))||norm(normal)<1e-8)throw Error('Control normal must be a finite outward vector.');return{...value,target:[...value.target],normal:unit(normal)};}
function indexSupport(rotation,normal){const points=INDEX_REACH_SUPPORT.map(p=>({p,d:dot(qrotate(p,rotation),normal)})),front=Math.min(...points.map(p=>p.d)),near=points.filter(p=>p.d<=front+.00025);return{point:mul(near.reduce((a,b)=>add(a,b.p),[0,0,0]),1/near.length),skinPlaneOffset:front-near.reduce((a,b)=>a+b.d,0)/near.length};}
function makeReach(request,time){
 const h=controller.hands.left,rest=REST.left,shoulder=[-.16,.03,.69],aim=unit(sub(request.target,shoulder)),baseRotation=qalign(REACH_PAD,aim);let rotation=baseRotation,wrist,ik,support;
 // Pick the real skin's foremost fingertip surface, not the pad centre hidden
 // behind it. The button-facing support hull also prevents finger penetration.
 for(let iteration=0;iteration<5;iteration++){
  support=indexSupport(rotation,request.normal);wrist=sub(request.target,qrotate(support.point,rotation));ik=elbowAt('left',wrist);
  const native=qrotate(qrotate([0,-1,0],rest.q),baseRotation),desired=unit(sub(ik.elbow,wrist)),a=sub(native,mul(aim,dot(native,aim))),b=sub(desired,mul(aim,dot(desired,aim)));let roll=0;if(norm(a)>1e-7&&norm(b)>1e-7)roll=clamp(Math.atan2(dot(aim,cross(unit(a),unit(b))),dot(unit(a),unit(b))),-1.2,1.2);rotation=qmul([...mul(aim,Math.sin(roll/2)),Math.cos(roll/2)],baseRotation);
 }
 support=indexSupport(rotation,request.normal);wrist=sub(request.target,qrotate(support.point,rotation));ik=elbowAt('left',wrist);
 if(ik.unreachable)return{rejected:true,reason:'Target exceeds anchored arm plus open index reach.',target:request.target,requiredWristReachM:ik.reach};
 const theta=h.theta,fromRotation=[0,0,Math.sin(theta/2),Math.cos(theta/2)];return{kind:request.kind,target:request.target,normal:request.normal,startTime:time-request.elapsed,theta,fromWrist:add(rz(rest.p,theta),[0,0,h.lift]),fromRotation,fromOpen:h.open,wrist,rotation,contactVector:support.point,skinPlaneOffsetM:support.skinPlaneOffset,approachAngleDegrees:Math.acos(clamp(dot(aim,mul(request.normal,-1)),-1,1))*180/Math.PI,pending:false};
}
function controlPose(request,time){let r=controller.reach;
 if(!r&&request&&request.elapsed<WHEEL_HAND_REACH.totalSeconds){
  // A control request waits for an already airborne right hand to replant.
  // Its contact is never faked by letting go of both sides simultaneously.
  if(controller.hands.right.release){controller.pendingReach={...request,elapsed:0};return{pending:true,kind:request.kind,phase:'wait',elapsed:0,atContact:false,complete:false};}
  r=controller.reach=makeReach(controller.pendingReach||request,time);controller.pendingReach=null;
 }
 if(r?.rejected){controller.reach=null;return r;}
 if(!r&&controller.pendingReach&&!controller.hands.right.release){r=controller.reach=makeReach({...controller.pendingReach,elapsed:0},time);controller.pendingReach=null;}
 if(r?.rejected){controller.reach=null;return r;}
 if(!r)return null;
 const elapsed=Math.max(0,time-r.startTime),out=WHEEL_HAND_REACH.outSeconds,contactEnd=out+WHEEL_HAND_REACH.contactSeconds,total=WHEEL_HAND_REACH.totalSeconds;
 if(elapsed>=total){const h=controller.hands.left;h.theta=r.theta;h.offset=controller.angle-r.theta;h.release=false;h.open=h.lift=h.slip=0;controller.reach=null;return{completed:true,complete:true,kind:r.kind,phase:'complete',elapsed:total,atContact:false};}
 const returning=elapsed>contactEnd,t=returning?(elapsed-contactEnd)/WHEEL_HAND_REACH.returnSeconds:elapsed/out,weight=returning?1-smooth(t):smooth(t),endWrist=rz(REST.left.p,r.theta),start=returning?endWrist:r.fromWrist;
 // A driver-side lift clears the torus during both departure and return. The
 // contact endpoint is the separately calibrated outer skin surface.
 const arc=Math.sin(Math.PI*clamp(t,0,1))*.10,wrist=add(lerp(start,r.wrist,weight),[0,0,arc]),rotation=qslerp(r.fromRotation,r.rotation,weight),open=returning?weight:r.fromOpen+(1-r.fromOpen)*weight;
 return{...r,elapsed,phase:elapsed<out?'reach':returning?'return':'contact',atContact:elapsed>=out&&elapsed<=contactEnd,complete:false,weight,open,wrist,rotation,contactErrorM:elapsed>=out&&elapsed<=contactEnd?norm(sub(add(wrist,qrotate(r.contactVector,rotation)),r.target)):null};
}
function fingerJoints(side,open,reachWeight){const joints={};for(const finger of ['index','middle','ring','pinky'])for(const[i,part]of['proximal','intermediate','distal'].entries()){const normal=[.38,.68,.40][i]*open,goal=finger==='index'?[.03,.08,.04][i]:[.20,.35,.18][i],a=side==='left'&&reachWeight!=null?normal*(1-reachWeight)+(LEFT_GRIP[finger][i]-goal)*reachWeight:normal;joints[`drive_${side}_${finger}-finger-phalanx-${part}`]={rotation:[Math.sin(a/2),0,0,Math.cos(a/2)]};}for(const[i,part]of['proximal','distal'].entries()){const normal=[.28,.20][i]*open,a=side==='left'&&reachWeight!=null?normal*(1-reachWeight)+(LEFT_GRIP.thumb[i]-[.10,.08][i])*reachWeight:normal;joints[`drive_${side}_thumb-phalanx-${part}`]={rotation:[Math.sin(a/2),0,0,Math.cos(a/2)]};}return joints;}
export function wheelHandInstances(matrix,steeringAngle=0,options={}){
 if(!matrix||matrix.length!==16||Array.from(matrix).some(n=>!Number.isFinite(n)))throw Error('Wheel hands need the finite wheel-parent matrix.');if(!Number.isFinite(steeringAngle))throw Error('Wheel hands need finite steering angle.');
 const time=typeof options==='number'?options:Number.isFinite(options.timeSec)?options.timeSec:performance.now()/1000;if(!Number.isFinite(time))throw Error('Wheel hands need finite simulation time.');const request=readReach(typeof options==='object'?options.reach:null),motion=update(steeringAngle,time,!!controller?.reach||!!controller?.pendingReach||!!request&&request.elapsed<.72),reach=controlPose(request,time),active=reach?.wrist&&!reach.rejected,instances=[],diagnostics={time,wheelAngle:steeringAngle,maximumHandAngle:LIMIT,regripDurationSeconds:REGRIP_SECONDS,...motion,reach:reach?{...reach,rotation:undefined,fromRotation:undefined}:null,hands:{}};
 for(const side of ['right','left']){
  const rest=REST[side],h=controller.hands[side],isReach=side==='left'&&active;
  if(active&&side==='right'){h.open=h.lift=h.slip=0;}
  const wrist=isReach?reach.wrist:add(rz(rest.p,h.theta),[0,0,h.lift]),rotation=isReach?reach.rotation:[0,0,Math.sin(h.theta/2),Math.cos(h.theta/2)],ik=elbowAt(side,wrist),translation=sub(wrist,qrotate(rest.p,rotation)),joints={drive_wheel_hands_root:{rotation,translation},...fingerJoints(side,isReach?reach.open:h.open,isReach?reach.weight:null)};
  instances.push({mesh:`drive_${side}_hand`,id:`drive_${side}_hand`,matrix:Array.from(matrix),character:{joints}});
  const forearm=multiply(matrix,armMap(rest,wrist,ik.elbow,rotation,.621));for(const part of ['forearm','sleeve'])instances.push({mesh:`drive_${side}_${part}`,id:`drive_${side}_${part}`,matrix:forearm,character:{}});
  instances.push({mesh:`drive_${side}_upper_sleeve`,id:`drive_${side}_upper_sleeve`,matrix:multiply(matrix,armMap(rest,ik.elbow,ik.shoulder,rotation,.34)),character:{}});
  const nativeAxis=qrotate(qrotate([0,-1,0],rest.q),rotation),desiredAxis=unit(sub(ik.elbow,wrist));diagnostics.hands[side]={...h,controlReach:!!isReach,wrist,elbow:ik.elbow,shoulder:ik.shoulder,reach:ik.reach,unreachable:ik.unreachable,upperLength:ik.upperLength,forearmLength:ik.forearmLength,wristBendDegrees:Math.acos(clamp(dot(nativeAxis,desiredAxis),-1,1))*180/Math.PI};
 }
 lastDiagnostics=diagnostics;return instances;
}
