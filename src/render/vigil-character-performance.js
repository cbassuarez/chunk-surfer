// Object-led, anatomical contact poses sampled from the saved vigil clock.
import {VIGIL_CHARACTER_DESIGNS} from '../data/vigil-character-design.js';
import {VIGIL_CHARACTER_RIGS} from '../data/vigil-character-rigs.js';
import {VIGIL_OBJECT_LAYOUT} from '../data/vigil-object-layout.js';
import {OWEN_KEY_RING,vigilHandFrame,vigilHandPoint} from '../data/vigil-secondary-object-layout.js';
import {exteriorPerformanceFrame} from './exterior-conversation-performance.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const I=[0,0,0,1],qa=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)],qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rot=(v,q)=>{const p=q.slice(0,3),t=mul(cross(p,v),2);return add(v,add(mul(t,q[3]),cross(p,t)));},qmix=(a,b,t)=>unit(mix(a,dot(a,b)<0?mul(b,-1):b,t));
function between(a,b){const u=unit(a),v=unit(b),d=dot(u,v);if(d<-.999999)return[...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0];return unit([...cross(u,v),1+d]);}
function oriented(from,normal,to,toNormal){const swing=between(from,to),axis=unit(to),project=v=>unit(sub(v,mul(axis,dot(v,axis)))),a=project(rot(normal,swing)),b=project(toNormal);return qm(qa(axis,Math.atan2(dot(axis,cross(a,b)),dot(a,b))),swing);}
function twoBone(start,target,a,b,pole){const delta=sub(target,start),distance=Math.max(Math.abs(a-b)+1e-6,Math.min(a+b-1e-6,len(delta))),axis=unit(delta),end=add(start,mul(axis,distance)),along=(a*a-b*b+distance*distance)/(2*distance);let normal=sub(pole,mul(axis,dot(pole,axis)));if(len(normal)<1e-6)normal=cross(axis,[0,0,1]);return{middle:add(add(start,mul(axis,along)),mul(unit(normal),Math.sqrt(Math.max(0,a*a-along*along)))),end,error:len(sub(end,target))};}
function fingerChain(base,target,sizes,pole){const total=sizes.reduce((a,b)=>a+b,0),delta=sub(target,base),distance=len(delta),axis=unit(delta),normal=unit(sub(pole,mul(axis,dot(pole,axis))));let points=[base],along=0;for(const size of sizes){along+=size;points.push(add(add(base,mul(axis,Math.min(distance,total)*along/total)),mul(normal,Math.sin(Math.PI*along/total)*total*.28)));}if(distance>=total){points=[base];for(const size of sizes)points.push(add(points.at(-1),mul(axis,size)));}else for(let iteration=0;iteration<48;iteration++){points[3]=target;for(let i=2;i>=0;i--)points[i]=add(points[i+1],mul(unit(sub(points[i],points[i+1])),sizes[i]));points[0]=base;for(let i=0;i<3;i++)points[i+1]=add(points[i],mul(unit(sub(points[i+1],points[i])),sizes[i]));if(len(sub(points[3],target))<1e-6)break;}return{points,error:len(sub(points[3],target))};}
const ids=new Map(Object.entries(VIGIL_CHARACTER_DESIGNS).flatMap(([id,d])=>[[d.mesh,id],[d.part,id]]));
export const vigilCharacterIdForMesh=mesh=>ids.get(mesh)||null;
function paperSurface(layout,x,y,front){if(layout.kind==='map'){const u=x/layout.width+.5,v=y/layout.height+.5,z=Math.sin(u*4*Math.PI)*.006+.012*(1-Math.abs(u*2-1))*(1-v);return z+(front?-.008:.008);}if(layout.kind==='folder')return front?(Math.abs(x)>layout.width/2-.006?-.014:-.020):.018;return front?-.006:.012;}
const freeHands={leila:{R:{wrist:[.23,.88,-.075],axis:[.08,-1,0],normal:[-1,0,0]}},owen:{L:{wrist:[-.23,.925,-.11],axis:[-.08,-1,0],normal:[1,0,0]}},kit:{L:{headOffset:[-.107,-.082,-.085],axis:[0,.73,.68],normal:[1,0,0]}}};
// Retained contractor headphone shell coordinates, before cast proportions.
// The bone endpoints sit just outside its surface; actual fingertip pads make
// contact. Following the head keeps the cup supported through its small nod.
const kitHeadphoneTips={thumb:[-.118,1.624,-.022],index:[-.118,1.635,-.014],middle:[-.119,1.650,-.027],ring:[-.118,1.666,-.038],little:[-.115,1.660,-.047]};
export function vigilCharacterPose(id,{action=null,progress=0,reducedMotion=false,rig=null,timeSec=0,conversation=null}={}){
 const d=VIGIL_CHARACTER_DESIGNS[id],source=rig||VIGIL_CHARACTER_RIGS[id],layout=VIGIL_OBJECT_LAYOUT[id];if(!d||!source||!layout)throw Error('Unknown vigil character '+id);
 const bones=new Map(source.map(b=>[b.name,b])),poses=new Map(),contacts=[],rest=name=>{const b=bones.get(name);if(!b)throw Error('Missing vigil bone '+name);return b;},put=(name,head,rotation=I)=>poses.set(name,{head,rotation}),world=(p,name)=>{const b=rest(name),v=poses.get(name);return add(v.head,rot(sub(p,b.head),v.rotation));},chain=(finger,side)=>['','_mid','_tip'].map(s=>rest(finger+s+'_'+side));
 const performance=exteriorPerformanceFrame(id,{timeSec,reducedMotion,conversation}),{attention,talk,gesture,ambient}=performance;
 const purpose={ruth:{yaw:-.025,pitch:-.045,lean:.004},leila:{yaw:-.065,pitch:.045,lean:.002},owen:{yaw:.035,pitch:-.035,lean:.003},denise:{yaw:.025,pitch:-.055,lean:.005},malcolm:{yaw:-.030,pitch:-.040,lean:.008},kit:{yaw:.045,pitch:.018,lean:.004}}[id];
 const pulse=action?(reducedMotion?(progress>0&&progress<1?1:0):Math.sin(Math.max(0,Math.min(1,progress))*Math.PI)):0,shift=[action==='weight-shift'?.012*pulse:0,0,0],pelvis=rest('pelvis').head,bodyQ=qm(qa([0,0,1],d.sideLean),qa([1,0,0],-d.lean-purpose.lean*attention));
 const chestWeight=p=>Math.max(0,Math.min(1,(p[1]-pelvis[1])/.40)),respiration=performance.respiration;
 const torso=p=>{const posed=add(add(pelvis,rot(sub(p,pelvis),bodyQ)),add(shift,[d.stance*Math.max(0,Math.min(1,(p[1]-pelvis[1])/.45)),0,0]));return respiration?add(posed,[0,.0015*respiration*chestWeight(p),-.0006*respiration*chestWeight(p)]):posed;};
 for(const name of ['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','clavicle_L','clavicle_R'])put(name,torso(rest(name).head),respiration?qm(bodyQ,qa([1,0,0],.002*respiration*chestWeight(rest(name).head))):bodyQ);
 const windowLook=id==='leila'&&action==='window-look',keyCheck=id==='owen'&&action==='key-check';
 const headYaw=d.headYaw+(windowLook?-.34:keyCheck?.18:0)*pulse+performance.headYaw+purpose.yaw*ambient,headPitch=(windowLook?.32:keyCheck?-.16:action&&action!=='weight-shift'?.045:0)*pulse+performance.nod+purpose.pitch*ambient;
 const headQ=qm(bodyQ,qm(qa([0,1,0],headYaw),qa([1,0,0],headPitch)));put('head',world(rest('head').head,'neck'),headQ);put('jaw',world(rest('jaw').head,'head'),qm(headQ,qa([1,0,0],-performance.jaw)));
 const position=add(layout.position,shift),angles=[...layout.angles];
 if(action==='flask-check'){position[1]+=.045*pulse;angles[0]+=.075*pulse;}
 if(action==='umbrella-settle'){position[1]-=.014*pulse;angles[2]+=.025*pulse;}
 if(action==='map-fold'){angles[0]+=.065*pulse;angles[1]+=.04*pulse;}
 if(action==='camera-check'){position[1]-=.025*pulse;angles[1]-=.08*pulse;}
 if(id==='ruth'){position[1]+=.009*gesture;angles[0]+=.018*gesture;}
 if(id==='leila')position[1]+=.006*gesture;
 if(id==='denise'){position[1]+=.010*gesture;angles[0]+=.012*gesture;}
 if(id==='malcolm'){position[1]+=.012*gesture;angles[0]+=.016*gesture;}
 if(id==='kit'){position[1]+=.025*talk;position[2]-=.040*(attention-talk);}
 const objectQ=qm(qa([0,1,0],angles[1]),qm(qa([1,0,0],angles[0]),qa([0,0,1],angles[2]))),objectPoint=p=>add(position,rot(p,objectQ)),hands={};
 for(const [side,sign]of [['L',-1],['R',1]]){
  const hand=rest('hand_'+side),upper=rest('upperarm_'+side),forearm=rest('forearm_'+side),index=chain('index',side),thumb=chain('thumb',side),middle=chain('middle',side),little=chain('little',side),fingerAxis=unit(sub(middle[2].tail,hand.head)),across=sub(little[0].head,index[0].head),palmNormal=unit(mul(cross(fingerAxis,across),sign)),grip=layout.hands[side];let palmQ,wrist,anchor=null;
  if(grip){palmQ=oriented(fingerAxis,palmNormal,rot(grip.axis,objectQ),rot(grip.normal,objectQ));if(grip.kind==='paper'){anchor=[...grip.anchor];if(side==='R'&&action==='binder-page'){anchor[1]+=.030*pulse;}if(side==='R'&&action==='photos-sort'){anchor[0]-=.024*pulse;anchor[1]-=.012*pulse;}const pinchLocal=sub(sub(sub(mul(add(thumb[2].tail,index[2].tail),.5),hand.head),mul(fingerAxis,.028)),mul(palmNormal,.008));wrist=add(sub(objectPoint(anchor),rot(pinchLocal,palmQ)),rot([sign*.018,0,.025],objectQ));}else wrist=objectPoint(grip.wrist);}
  else{const free=freeHands[id][side];if(id==='kit'&&side==='L'){wrist=world(add(rest('head').head,free.headOffset),'head');palmQ=oriented(fingerAxis,palmNormal,rot(free.axis,headQ),rot(free.normal,headQ));}else{wrist=add(free.wrist,shift);if(id==='owen'&&side==='L'){if(keyCheck)wrist=add(wrist,[0,.080*pulse,-.025*pulse]);wrist=add(wrist,[0,.014*gesture,-.006*gesture]);}if(id==='leila'&&side==='R')wrist=add(wrist,[.015*gesture,.018*attention+.025*gesture,-.018*gesture]);palmQ=oriented(fingerAxis,palmNormal,free.axis,free.normal);}}
  const pole=id==='kit'&&side==='L'?[-.35,-.65,-.65]:[sign*.55,-.65,.35];
  const shoulder=torso(upper.head),arm=twoBone(shoulder,wrist,len(sub(upper.tail,upper.head)),len(sub(forearm.tail,forearm.head)),pole),fromUpper=sub(upper.tail,upper.head),fromLower=sub(forearm.tail,forearm.head),toUpper=sub(arm.middle,shoulder),toLower=sub(arm.end,arm.middle),restPlane=unit(cross(fromUpper,fromLower)),armPlane=unit(cross(toUpper,toLower));
  put(upper.name,shoulder,oriented(fromUpper,restPlane,toUpper,armPlane));const elbowQ=oriented(fromLower,restPlane,toLower,armPlane),wristQ=oriented(fromLower,palmNormal,toLower,rot(palmNormal,palmQ));put(forearm.name,arm.middle,qmix(elbowQ,wristQ,.60));put(hand.name,arm.end,palmQ);hands[side]=arm.end;contacts.push({kind:'wrist',side,target:wrist,point:arm.end,error:arm.error,shoulder,elbow:arm.middle,palmNormal:rot(palmNormal,palmQ)});
  for(const [digitIndex,finger]of ['thumb','index','middle','ring','little'].entries()){
   const links=chain(finger,side),base=world(links[0].head,hand.name),sizes=links.map(b=>len(sub(b.tail,b.head)));let target,pole=rot(palmNormal,palmQ);
   if(grip?.kind==='paper'&&digitIndex<3){const inverse=[-objectQ[0],-objectQ[1],-objectQ[2],objectQ[3]],localBase=rot(sub(base,position),inverse),inward=grip.axis[0],y=Math.max(-layout.height/2+.012,Math.min(layout.height/2-.012,localBase[1]));const x=anchor[0]+inward*(finger==='thumb'?-.004:.006);target=objectPoint([x,y,paperSurface(layout,x,y,finger==='thumb')]);pole=rot(finger==='thumb'?[sign*.4,0,-1]:[sign*.7,0,.6],objectQ);}
   else if(grip?.kind==='cylinder'){const theta=finger==='thumb'?1.28:[-1.62,-1.65,-2.05,-2.60][digitIndex-1],x=Math.cos(theta)*grip.radius,z=Math.sin(theta)*grip.radius;const inverse=[-objectQ[0],-objectQ[1],-objectQ[2],objectQ[3]],localBase=rot(sub(base,position),inverse);target=objectPoint([side==='L'?x:-x,localBase[1]-(finger==='thumb'?.018:.003),z]);pole=rot(finger==='thumb'?[sign*.15,0,1]:[sign*.4,0,-1],objectQ);}
   else if(grip?.kind==='paper'){const inverse=[-objectQ[0],-objectQ[1],-objectQ[2],objectQ[3]],b=rot(sub(base,position),inverse);target=objectPoint(add(b,[grip.axis[0]*.018,-.018,.025]));pole=rot([0,0,1],objectQ);}else if(id==='kit'&&side==='L'){target=world(kitHeadphoneTips[finger].map((v,i)=>v*[d.width,d.height/1.78,d.depth][i]),'head');pole=rot([-1,0,.15],headQ);}else if(id==='owen'&&side==='L'&&digitIndex<2){target=world(vigilHandPoint(vigilHandFrame(source,side),OWEN_KEY_RING.pinch[finger]),hand.name);pole=rot(mul(palmNormal,finger==='thumb'?1:-1),palmQ);}else{const natural=sub(links[2].tail,links[0].head),total=sizes.reduce((a,b)=>a+b,0);target=add(base,rot(add(mul(natural,finger==='thumb'?.90:.77),mul(palmNormal,total*.18)),palmQ));}
   const solve=fingerChain(base,target,sizes,pole);for(let i=0;i<3;i++){const desired=sub(solve.points[i+1],solve.points[i]),axis=sub(links[i].tail,links[i].head);put(links[i].name,solve.points[i],qm(between(rot(axis,palmQ),desired),palmQ));}contacts.push({kind:'finger',side,finger,target,point:solve.points[3],error:solve.error,gripped:!!grip&&(grip.kind!=='paper'||digitIndex<3),...(id==='owen'&&side==='L'&&digitIndex<2?{secondary:'keys'}:{})});
  }
  for(const name of ['thigh_'+side,'shin_'+side,'foot_'+side,'toe_'+side])put(name,rest(name).head);
 }
 for(const b of source)if(!poses.has(b.name)){const parent=poses.get(b.parent);put(b.name,parent?world(b.head,b.parent):b.head,parent?.rotation||I);}
 const joints=Object.fromEntries([...poses].map(([name,p])=>['vigil_'+id+'_'+name,{translation:sub(p.head,rest(name).head),rotation:p.rotation}]));joints['vigil_'+id+'_object']={translation:position,rotation:objectQ};
 return{joints,hands,contacts,object:{position,rotation:objectQ},objectHand:d.objectHand,objectGrip:hands[d.objectHand],action,pulse,performance};
}
// Body and linked object use the same anatomical solve. Cache only the public
// descriptor, never the exact pose/contact sampler used by tailoring/tests.
// One latest entry per identity bounds this cache to the six retained people.
const descriptorCache=new Map();
export function vigilCharacterDescriptor(mesh,frame=null,options={}){
 const id=vigilCharacterIdForMesh(mesh);if(!id)return null;
 const {reducedMotion=false,conversation=null}=options,timeSec=Number.isFinite(options.timeSec)?options.timeSec:0;
 const raw=Number.isFinite(frame?.progress)?frame.progress:frame?(Number(frame.elapsedMs)||0)/Math.max(1,Number(frame.durationMs)||1):0,progress=Math.max(0,Math.min(1,raw));
 const clock=Number.isFinite(options.timeSec)?Math.floor(timeSec*30):Math.floor((Number(frame?.elapsedMs)||0)*.03);
 const endpoint=progress<=0?0:progress>=1?1:null,cv=conversation;
 const key=JSON.stringify([reducedMotion?0:clock,!!reducedMotion,frame?.action||null,endpoint,reducedMotion?progress:null,
   cv?.active??null,cv?.speaking??null,cv?.weight===0?0:cv?.weight===1?1:null,
   cv?.speakingWeight===0?0:cv?.speakingWeight===1?1:null,
   reducedMotion?cv?.headYaw:Math.round((Number(cv?.headYaw)||0)*64)]);
 const cached=descriptorCache.get(id);if(cached?.key===key)return cached.value;
 const value={joints:vigilCharacterPose(id,{action:frame?.action||null,progress,reducedMotion,timeSec:reducedMotion?0:clock/30,conversation}).joints};
 descriptorCache.set(id,{key,value});return value;
}
