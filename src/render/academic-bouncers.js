// Door staff reuse the two complete period-dressed background bodies. Their
// guard performance is independent of the population's cached, silent poses.
// The admission controller owns every root position and the movement aside.
import {ACADEMIC_FLOOR_POPULATION_DESIGNS as DESIGNS,ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS} from '../data/academic-society-character-design.js';
import {sourceLastReceptionResidentPose} from './source-last-reception-residents.js';

const permitted=new Set(['listener','attendant']);
const reference={listener:'host',attendant:'guest-a'};
const stature=source=>source==='male'?1.78:1.70;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1));
const axis=(a,n)=>[...mul(unit(a),Math.sin(n/2)),Math.cos(n/2)];
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
function between(a,b){const u=unit(a),v=unit(b),d=clamp(dot(u,v),-1,1);return d<-.999999?[...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(u,v),1+d]);}
function solveArm(start,target,a,b,pole){
  const distance=clamp(length(sub(target,start)),Math.abs(a-b)+.00001,a+b-.00001),direction=unit(sub(target,start));
  const along=(a*a-b*b+distance*distance)/(2*distance),side=unit(sub(pole,mul(direction,dot(pole,direction))));
  const wrist=add(start,mul(direction,distance));
  return{elbow:add(add(start,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,a*a-along*along)))),wrist,error:length(sub(wrist,target))};
}
const maps=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,new Map(bones.map(b=>[b.name,b]))]));
const branches=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,Object.fromEntries(bones.map(root=>[root.name,bones.filter(bone=>{
  for(let next=bone;next;next=maps[source].get(next.parent))if(next.name===root.name)return true;
  return false;
}).map(bone=>bone.name)]))]));
const held={
  listener:{L:[-.09,1.075,-.245],R:[.105,1.09,-.255]},
  attendant:{L:[-.14,1.025,-.235],R:[.13,1.105,-.245]},
};
function cueFrame(frame,reducedMotion){
  const p=frame.performance;
  if(reducedMotion||!p||!Number.isFinite(p.elapsedSec)||!['speaker','listener'].includes(p.role))return{weight:0,cue:null,role:null};
  const t=Math.max(0,p.elapsedSec),attack=clamp(t/.28),release=clamp((t-.85)/1.35);
  return{weight:attack*attack*(3-2*attack)*(1-release*release*(3-2*release)),cue:p.cue,role:p.role};
}

export function academicBouncerPose(frame,{timeSec=0,reducedMotion=false,headYaw=0}={}){
  const design=DESIGNS[frame?.designId];if(!design||!permitted.has(frame.designId))return null;
  const elapsed=Number.isFinite(frame.phase)?frame.phase:Number.isFinite(timeSec)?timeSec:0;
  const walking=frame.mode==='walk'&&Number.isFinite(frame.speed)&&frame.speed>.015;
  const depth=Number.isFinite(frame.depth)?clamp(frame.depth,.85,1.2):design.depth;
  const base=sourceLastReceptionResidentPose(reference[frame.designId],{
    elapsed,mode:walking?'walk':'idle',attention:1,speed:walking?frame.speed:0,
    // Distance is world metres. Undo this body's longitudinal scale before
    // sampling the canonical gait, so planted feet cancel actual root travel.
    ...(Number.isFinite(frame.distance)?{distance:Math.max(0,frame.distance)/depth}:{}),
  },{reducedMotion});
  const joints=Object.fromEntries(Object.entries(base.joints).map(([name,joint])=>[name.replace(/^reception_(male|female)_/,`society_${design.source}_`),{translation:[...joint.translation],rotation:[...joint.rotation]}]));
  const bones=maps[design.source],key=name=>`society_${design.source}_${name}`;
  const point=name=>add(bones.get(name).head,joints[key(name)].translation);
  const set=(name,at,rotation)=>joints[key(name)]={translation:sub(at,bones.get(name).head),rotation};
  const cue=cueFrame(frame,reducedMotion),scale=stature(design.source)/1.78;
  const shift=sub(point('pelvis'),bones.get('pelvis').head),contacts=base.contacts.filter(c=>c.kind!=='arm');
  for(const[side,sign]of[['L',-1],['R',1]]){
    const upper=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side);
    const aside=frame.stance==='aside',heldPoint=aside?[sign*.19,1.00,-.10]:held[frame.designId][side];
    let offset=[0,0,0],direction=[0,-1,-.28];
    if(cue.role==='speaker'){
      if(['stop','refuse','object','interrupt'].includes(cue.cue)&&side==='R'){offset=[.035,.12,-.10];direction=[0,.85,-.4];}
      else if(['release','offer'].includes(cue.cue)&&side==='L'){offset=[-.10,.065,-.065];direction=[-.35,-.12,-1];}
      else if(['assure','concede'].includes(cue.cue)&&side==='R'){offset=[-.025,.06,-.045];direction=[.1,-.2,-1];}
    }
    const target=add(add(mul(heldPoint,scale),shift),mul(offset,cue.weight));
    const shoulder=point(upper.name),arm=solveArm(shoulder,target,length(sub(upper.tail,upper.head)),length(sub(fore.tail,fore.head)),[sign*.7,-.4,.35]);
    const oldPoint=point(hand.name),oldRotation=joints[key(hand.name)].rotation;
    const directed=add([0,-1,-.28],mul(sub(direction,[0,-1,-.28]),cue.weight));
    const rotation=between(sub(hand.tail,hand.head),directed),delta=qmul(rotation,inverse(oldRotation));
    // The original knuckles and curled digits follow the wrist rigidly; guard
    // gestures never detach the hands or scale the fingers to reach a target.
    for(const name of branches[design.source][hand.name]){
      const joint=joints[key(name)];set(name,add(arm.wrist,rotate(sub(point(name),oldPoint),delta)),qmul(delta,joint.rotation));
    }
    set(upper.name,shoulder,between(sub(upper.tail,upper.head),sub(arm.elbow,shoulder)));
    set(fore.name,arm.elbow,between(sub(fore.tail,fore.head),sub(arm.wrist,arm.elbow)));
    contacts.push({kind:'arm',side,shoulder,elbow:arm.elbow,wrist:arm.wrist,target,error:arm.error});
  }
  const nod=cue.weight*(cue.role==='listener'?.045:cue.cue==='assure'?.025:['stop','object','interrupt'].includes(cue.cue)?-.018:0);
  if(nod||Math.abs(headYaw)>1e-8){
    const pivot=point('neck'),rotation=qmul(axis([0,1,0],-clamp(Number(headYaw)||0,-.35,.35)),axis([1,0,0],nod));
    for(const name of branches[design.source].neck){const joint=joints[key(name)];set(name,add(pivot,rotate(sub(point(name),pivot),rotation)),qmul(rotation,joint.rotation));}
  }
  if(frame.speaking&&!reducedMotion){const jaw=joints[key('jaw')],angle=.025+.055*Math.abs(Math.sin(elapsed*11.7));jaw.rotation=qmul(jaw.rotation,axis([1,0,0],angle));}
  return{joints,contacts};
}

export function academicBouncerInstances(frames=[],{project=(x,y)=>({x,y:10,z:y}),timeSec=0,reducedMotion=false,zone=0}={}){
  return frames.filter(frame=>frame&&frame.visible!==false&&permitted.has(frame.designId)&&Number.isFinite(frame.x)&&Number.isFinite(frame.y)).map(frame=>{
    const d=DESIGNS[frame.designId],at=project(frame.x,frame.y),bodyYaw=Number.isFinite(frame.bodyYaw)?frame.bodyYaw:Number.isFinite(frame.yaw)?frame.yaw:0;
    const bearing=heading=>{const target=project(frame.x+Math.sin(heading),frame.y-Math.cos(heading)),dx=target.x-at.x,dz=target.z-at.z;return Math.hypot(dx,dz)>1e-8?Math.atan2(dx,-dz):heading;};
    const yaw=bearing(bodyYaw),desired=bearing(Number.isFinite(frame.yaw)?frame.yaw:bodyYaw),headYaw=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
    const height=Number.isFinite(frame.height)?clamp(frame.height,1.5,2.05):d.height;
    const sx=Number.isFinite(frame.width)?clamp(frame.width,.85,1.2):d.width,sy=height/stature(d.source),sz=Number.isFinite(frame.depth)?clamp(frame.depth,.85,1.2):d.depth;
    const c=Math.cos(yaw),s=Math.sin(yaw),pose=academicBouncerPose(frame,{timeSec,reducedMotion,headYaw});
    return{id:`academic-bouncer-${frame.id}`,mesh:d.mesh,x:at.x,y:at.y,z:at.z,yaw,
      matrix:new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,at.x,at.y,at.z,1]),
      zone,structural:false,character:{joints:pose.joints},academicBouncerActor:frame.id};
  });
}
