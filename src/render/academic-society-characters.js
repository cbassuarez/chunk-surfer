// These are bodies in the ordinary character colour/depth/shadow path. Source
// provides the established anatomical IK performance, not the faces or clothes.
import { sourceLastReceptionResidentPose } from './source-last-reception-residents.js';
import { academicBouncerPose } from './academic-bouncers.js';
import { PROP_INSTANCE_FLOATS, PROP_INSTANCE_BINDINGS } from './prop-instance-layout.js';
import { ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS, ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS, ACADEMIC_FLOOR_POPULATION_DESIGNS as POPULATION } from '../data/academic-society-character-design.js';

const references={celeste:'guest-a',emile:'guest-b',odette:'gallery',lucien:'host',agathe:'guest-a',noe:'warning',sabine:'gallery'};
const height=source=>source==='female'?1.70:1.78;
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1));
const axis=(a,n)=>[...mul(unit(a),Math.sin(n/2)),Math.cos(n/2)];
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
function between(a,b){const u=unit(a),v=unit(b),d=clamp(dot(u,v),-1,1);return d<-.999999?[...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(u,v),1+d]);}
function solveArm(shoulder,target,a,b,pole){
  const distance=clamp(length(sub(target,shoulder)),Math.abs(a-b)+.00001,a+b-.00001),direction=unit(sub(target,shoulder));
  const along=(a*a-b*b+distance*distance)/(2*distance),side=unit(sub(pole,mul(direction,dot(pole,direction))));
  const wrist=add(shoulder,mul(direction,distance));
  return{elbow:add(add(shoulder,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,a*a-along*along)))),wrist,error:length(sub(wrist,target))};
}
const rigs=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,new Map(bones.map(bone=>[bone.name,bone]))]));
const branches=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,Object.fromEntries(bones.map(root=>[root.name,bones.filter(bone=>{
  for(let next=bone;next;next=rigs[source].get(next.parent))if(next.name===root.name)return true;
  return false;
}).map(bone=>bone.name)]))]));
// These held silhouettes belong to the named people. The inherited Source
// pose supplies planted legs, not a borrowed social identity for their hands.
const heldHands={
  celeste:{L:[-.22,1.08,-.25],R:[.14,1.01,-.15]},
  emile:{L:[-.18,.99,-.10],R:[.20,1.22,-.28]},
  odette:{L:[-.18,.99,-.12],R:[.12,1.17,-.18]},
  lucien:{L:[-.055,1.04,-.19],R:[.065,1.025,-.185]},
  agathe:{L:[-.11,1.04,-.18],R:[.10,1.12,-.18]},
  noe:{L:[-.22,1.00,-.20],R:[.20,1.02,-.18]},
  sabine:{L:[-.13,1.00,-.13],R:[.105,1.20,-.21]},
};
function performance(actor,reducedMotion){
  const p=actor.performance;
  if(reducedMotion||!p||!['speaker','listener'].includes(p.role)||!Number.isFinite(p.elapsedSec))return null;
  const t=Math.max(0,p.elapsedSec),attack=clamp(t/.28),release=clamp((t-.85)/1.35);
  // One conversational breath: enter, briefly hold, and settle by 2.2 seconds.
  // A held line never repeats the gesture. The controller freezes this exact
  // line clock during interruption, so resuming continues the same breath.
  const emphasis=attack*attack*(3-2*attack)*(1-release*release*(3-2*release));
  const cue=p.cue,hand={L:[0,0,0],R:[0,0,0]};let pitch=0,roll=0,torso=0;
  const set=(side,value)=>hand[side]=mul(value,emphasis);
  if(p.role==='speaker'){
    if(cue==='offer'){set('L',[-.09,.09,-.13]);set('R',[.025,.025,-.025]);pitch=.025;torso=.012;}
    else if(cue==='assure'){set('R',[-.025,.055,-.035]);set('L',[-.025,.015,-.045]);pitch=.035;}
    else if(cue==='interrupt'){set('R',[.045,.11,-.10]);roll=-.035;torso=.025;}
    else if(cue==='object'){set('R',[.025,.075,-.08]);set('L',[-.025,.025,-.045]);pitch=-.035;}
    else if(cue==='concede'){set('L',[.035,-.05,.01]);set('R',[-.025,-.055,.025]);pitch=.065;torso=-.012;}
    else if(cue==='recollect'){set('R',[-.015,.07,-.045]);roll=.055;pitch=.018;}
    else if(cue==='refuse'){set('L',[-.07,.035,-.075]);set('R',[.065,.035,-.075]);pitch=-.025;torso=-.018;}
  }else{
    if(cue==='attend'){pitch=.04;torso=.008;}
    else if(cue==='amused'){roll=.075;pitch=.025;set('L',[-.02,.02,-.015]);}
    else if(cue==='guarded'){pitch=-.025;torso=-.02;set('R',[-.025,.07,-.015]);}
    else if(cue==='settle'){pitch=.065;set('L',[.015,-.025,.015]);set('R',[-.015,-.025,.015]);}
  }
  return{hand,weight:emphasis,pitch:pitch*emphasis,roll:roll*emphasis,torso:torso*emphasis};
}

export function academicSocietyCharacterPose(actor,{timeSec=0,reducedMotion=false,headYaw=0}={}) {
  const design=DESIGNS[actor.id];if(!design)return null;
  const elapsed=Number.isFinite(actor.phase)?actor.phase:timeSec;
  const pose=sourceLastReceptionResidentPose(references[actor.id],{
    elapsed,mode:'idle',attention:actor.talkingToPlayer?1:.3,speed:0,
  },{reducedMotion});
  const joints=Object.fromEntries(Object.entries(pose.joints).map(([name,value])=>[
    name.replace(/^reception_(male|female)_/,`society_${design.source}_`),
    {translation:[...value.translation],rotation:[...value.rotation]},
  ]));
  const bones=rigs[design.source],key=name=>`society_${design.source}_${name}`;
  const head=name=>add(bones.get(name).head,joints[key(name)].translation);
  const set=(name,point,rotation)=>joints[key(name)]={translation:sub(point,bones.get(name).head),rotation};
  const gesture=performance(actor,reducedMotion),shift=sub(head('pelvis'),bones.get('pelvis').head),contacts=pose.contacts.filter(contact=>contact.kind!=='arm');
  for(const[side,sign]of[['L',-1],['R',1]]){
    const upper=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=head(upper.name);
    const target=add(add(mul(heldHands[actor.id][side],height(design.source)/1.78),shift),gesture?.hand[side]||[0,0,0]);
    const arm=solveArm(shoulder,target,length(sub(upper.tail,upper.head)),length(sub(fore.tail,fore.head)),[sign*.7,-.4,.35]);
    const oldHead=head(hand.name),oldRotation=joints[key(hand.name)].rotation;
    const cue=actor.performance?.role==='speaker'&&gesture?actor.performance.cue:null;
    let handDirection=actor.id==='celeste'&&side==='L'?[sign*.1,-.2,-1]:[0,-1,-.30];
    const directed=cue==='offer'||cue==='refuse'?[sign*.20,-.22,-1]
      :side==='R'&&['interrupt','object'].includes(cue)?[sign*.10,.85,-.35]
        :side==='R'&&cue==='recollect'?[sign*.10,.40,-.70]
          :cue==='concede'?[sign*.20,-.15,-1]:null;
    if(directed&&gesture.weight>0)handDirection=add(handDirection,mul(sub(directed,handDirection),gesture.weight));
    const handRotation=between(sub(hand.tail,hand.head),handDirection),delta=qmul(handRotation,inverse(oldRotation));
    // The exact original knuckles/finger curl follow the hand's rigid transform;
    // articulated wrists never detach the skinned fingers or stretch the arm.
    for(const name of branches[design.source][hand.name]){
      const joint=joints[key(name)],point=add(arm.wrist,rotate(sub(head(name),oldHead),delta));
      set(name,point,qmul(delta,joint.rotation));
    }
    set(upper.name,shoulder,between(sub(upper.tail,upper.head),sub(arm.elbow,shoulder)));
    set(fore.name,arm.elbow,between(sub(fore.tail,fore.head),sub(arm.wrist,arm.elbow)));
    contacts.push({kind:'arm',side,shoulder,elbow:arm.elbow,wrist:arm.wrist,target,error:arm.error});
  }
  const turnBranch=(root,rotation)=>{
    const pivot=head(root);
    for(const name of branches[design.source][root]){const joint=joints[key(name)];set(name,add(pivot,rotate(sub(head(name),pivot),rotation)),qmul(rotation,joint.rotation));}
    if(root==='spine_upper')for(const contact of contacts)if(contact.kind==='arm')for(const name of['shoulder','elbow','wrist','target'])contact[name]=add(pivot,rotate(sub(contact[name],pivot),rotation));
  };
  if(gesture){
    if(gesture.torso)turnBranch('spine_upper',axis([1,0,0],gesture.torso));
    if(gesture.roll||gesture.pitch)turnBranch('neck',qmul(axis([0,0,1],gesture.roll),axis([1,0,0],gesture.pitch)));
  }
  if(Number.isFinite(headYaw)&&Math.abs(headYaw)>1e-8)turnBranch('neck',axis([0,1,0],-clamp(headYaw,-.42,.42)));
  // A small actual jaw articulation accompanies a spoken line. No face quad,
  // overlay or abstract particle stands in for the model's head.
  if(actor.speaking&&!reducedMotion){
    const jaw=joints[`society_${design.source}_jaw`];
    if(jaw){const angle=.025+.055*Math.abs(Math.sin(elapsed*11.7));jaw.rotation=qmul(jaw.rotation,[Math.sin(angle/2),0,0,Math.cos(angle/2)]);}
  }
  return {joints,contacts};
}

export function academicSocietyCharacterInstances(actors=[],{
  project=(x,y)=>({x,y:10,z:y}),listener=null,timeSec=0,reducedMotion=false,zone=0,
}={}) {
  return actors.filter(actor=>DESIGNS[actor.id]&&actor.visible!==false).map(actor=>{
    const d=DESIGNS[actor.id],point=project(actor.x,actor.y);
    // Authored heading is 0 toward decreasing floor Y, +PI/2 toward +X.
    // Derive the actual world bearing after projection: floor-to-world may
    // mirror Z or use unequal scales. The mesh itself always faces local -Z.
    const controlledBody=Number.isFinite(actor.bodyYaw),authoredYaw=controlledBody?actor.bodyYaw:Number.isFinite(Number(actor.yaw))?Number(actor.yaw):0;
    const bearing=(target,fallback)=>{
      const dx=target.x-point.x,dz=target.z-point.z;
      return Number.isFinite(dx)&&Number.isFinite(dz)&&Math.hypot(dx,dz)>1e-8
        ?Math.atan2(dx,-dz):fallback;
    };
    let yaw=bearing(project(actor.x+Math.sin(authoredYaw),actor.y-Math.cos(authoredYaw)),authoredYaw);
    if(!controlledBody&&actor.talkingToPlayer&&listener)yaw=bearing(project(listener.x,listener.y),yaw);
    const desiredYaw=Number.isFinite(actor.yaw)?bearing(project(actor.x+Math.sin(actor.yaw),actor.y-Math.cos(actor.yaw)),yaw):yaw;
    const headYaw=controlledBody?Math.atan2(Math.sin(desiredYaw-yaw),Math.cos(desiredYaw-yaw)):0;
    const c=Math.cos(yaw),s=Math.sin(yaw),sx=d.width,sy=d.height/height(d.source),sz=d.depth;
    const pose=academicSocietyCharacterPose(actor,{timeSec,reducedMotion,headYaw});
    return {id:`academic-person-${actor.id}`,mesh:d.mesh,x:point.x,y:point.y,z:point.z,yaw,
      matrix:new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,point.x,point.y,point.z,1]),
      zone,structural:false,character:{joints:pose.joints},academicSocietyActor:actor.id};
  });
}

// Background meshes keep their own faces and period clothing. Quiet bodies
// share immutable held poses; activity poses have real hand contacts and keep
// the existing planted legs. Objects enter the ordinary depth/material pass.
const populationPoses=new Map();
function populationPose(id){
  if(!populationPoses.has(id)){
    const d=POPULATION[id],pose=d.hollow
      ?academicSocietyCharacterPose({id:d.poseId,phase:d.seed},{reducedMotion:true})
      :academicBouncerPose({designId:id,phase:d.seed,stance:'aside'},{reducedMotion:true});
    for(const joint of Object.values(pose.joints)){Object.freeze(joint.translation);Object.freeze(joint.rotation);Object.freeze(joint);}
    populationPoses.set(id,Object.freeze(pose.joints));
  }return populationPoses.get(id);
}
const socialProps=new Set(['cigarette','glass','cup']);
const socialMouth={attendant:[0,1.503115,-.161329],listener:[-.000029,1.593368,-.149696]};
const smooth=t=>{const p=clamp(t);return p*p*(3-2*p);};
const socialCycle=(elapsed,start,hold,end,period)=>{
  const t=((elapsed%period)+period)%period;
  return t<start?0:t<start+1.6?smooth((t-start)/1.6):t<hold?1:t<end?1-smooth((t-hold)/(end-hold)):0;
};
function fingerChain(base,target,sizes,pole){
  const total=sizes.reduce((a,b)=>a+b,0),toward=sub(target,base),distance=length(toward),direction=unit(toward);
  let points=[base],along=0;
  for(const size of sizes){along+=size;points.push(add(add(base,mul(direction,Math.min(distance,total)*along/total)),mul(unit(pole),Math.sin(Math.PI*along/total)*total*.3)));}
  if(distance>=total){points=[base];for(const size of sizes)points.push(add(points.at(-1),mul(direction,size)));}
  else for(let iteration=0;iteration<36;iteration++){
    points[3]=target;for(let i=2;i>=0;i--)points[i]=add(points[i+1],mul(unit(sub(points[i],points[i+1])),sizes[i]));
    points[0]=base;for(let i=0;i<3;i++)points[i+1]=add(points[i],mul(unit(sub(points[i+1],points[i])),sizes[i]));
    if(length(sub(points[3],target))<.00001)break;
  }
  return{points,error:length(sub(points[3],target))};
}
// Grips are solved once in object space, then carried rigidly by the wrist.
// No per-frame finger IK or multiplication by the number of visible guests.
const populationGrips=new Map();
function populationGrip(designId,prop,side){
  const cacheKey=designId+':'+prop+':'+side;if(populationGrips.has(cacheKey))return populationGrips.get(cacheKey);
  const d=POPULATION[designId],bones=rigs[d.source],sign=side==='R'?1:-1,hand=bones.get('hand_'+side);
  const wrist=prop==='cigarette'?[sign*.012,.025,.102]:[sign*.010,.074,.080];
  const joints=new Map([[hand.name,{point:wrist,rotation:[0,0,0,1]}]]),contacts=[];
  for(const[digitIndex,digit]of['thumb','index','middle','ring','little'].entries()){
    const links=['','_mid','_tip'].map(suffix=>bones.get(digit+suffix+'_'+side));
    const base=add(wrist,sub(links[0].head,hand.head)),sizes=links.map(b=>length(sub(b.tail,b.head)));
    let target;
    if(prop==='cigarette'&&['thumb','index','middle'].includes(digit)){
      target=digit==='thumb'?[-sign*.004,-.004,.006]:[sign*.004,digit==='index'?.003:-.004,digit==='index'?.002:-.012];
    }else if(prop==='cigarette')target=add(base,[sign*-.020,-.030,-.025]);
    else{
      const radius=prop==='glass'?.035:.040,theta=digit==='thumb'?1.0:[-1.5,-1.9,-.50,.30][digitIndex-1];
      target=[sign*Math.cos(theta)*radius,base[1]-(digit==='thumb'?.035:.003),Math.sin(theta)*radius];
    }
    const solve=fingerChain(base,target,sizes,[sign*.1,.3,1]);
    for(let i=0;i<3;i++)joints.set(links[i].name,{point:solve.points[i],rotation:between(sub(links[i].tail,links[i].head),sub(solve.points[i+1],solve.points[i]))});
    contacts.push({kind:'finger',side,finger:digit,object:prop,target,point:solve.points[3],error:solve.error});
  }
  const grip={wrist,joints,contacts};populationGrips.set(cacheKey,grip);return grip;
}
const validPopulationSupport=(frame,local)=>frame.activity==='lean'&&local&&local.every(Number.isFinite)
  &&typeof frame.support?.id==='string'&&frame.support.id.length>0&&['rail','ledge'].includes(frame.support.kind)
  &&length([local[0],0,local[2]])<.78&&local[1]>.75&&local[1]<1.5;
function populationSocialPose(frame,pose,{reducedMotion=false,supportLocal=null}={}){
  const d=POPULATION[frame.designId],bones=rigs[d.source],key=name=>`society_${d.source}_${name}`,joints=pose.joints;
  const point=name=>add(bones.get(name).head,joints[key(name)].translation);
  const set=(name,at,rotation)=>joints[key(name)]={translation:sub(at,bones.get(name).head),rotation};
  const turn=(root,q)=>{const pivot=point(root);for(const name of branches[d.source][root]){
    const joint=joints[key(name)];set(name,add(pivot,rotate(sub(point(name),pivot),q)),qmul(q,joint.rotation));
  }};
  const support=validPopulationSupport(frame,supportLocal)?supportLocal:null;
  const supportSide=frame.support?.side==='L'?'L':'R',prop=socialProps.has(frame.heldProp)?frame.heldProp:null;
  // Lean at the pelvis, with the shoes and lower legs left untouched. Reaching
  // is accepted only if the real arm can meet the authored support crown.
  const beforeSupport=support?structuredClone(joints):null;
  if(support)turn('spine_lower',axis([1,0,0],-.15));
  const contacts=pose.contacts.filter(c=>c.kind!=='arm'),objects=[];
  const solveHand=(side,target,rotation,grip=null,object=null)=>{
    const upper=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=point(upper.name);
    const arm=solveArm(shoulder,target,length(sub(upper.tail,upper.head)),length(sub(fore.tail,fore.head)),[side==='R'?.35:-.35,-1,-.65]);
    if(arm.error>.002)return null;
    const oldPoint=point(hand.name),oldQ=joints[key(hand.name)].rotation,delta=qmul(rotation,inverse(oldQ));
    for(const name of branches[d.source][hand.name]){const joint=joints[key(name)];set(name,add(arm.wrist,rotate(sub(point(name),oldPoint),delta)),qmul(delta,joint.rotation));}
    set(upper.name,shoulder,between(sub(upper.tail,upper.head),sub(arm.elbow,shoulder)));
    set(fore.name,arm.elbow,between(sub(fore.tail,fore.head),sub(arm.wrist,arm.elbow)));
    if(grip&&object)for(const[name,joint]of grip.joints)set(name,add(object.center,rotate(joint.point,object.rotation)),qmul(object.rotation,joint.rotation));
    contacts.push({kind:'arm',side,shoulder,elbow:arm.elbow,wrist:arm.wrist,target,error:arm.error});
    return arm;
  };
  let supported=false;
  if(support){
    const hand=bones.get('hand_'+supportSide),q=between(sub(hand.tail,hand.head),[0,-.12,-1]);
    const palm=mul(add(sub(bones.get('index_'+supportSide).head,hand.head),sub(bones.get('middle_'+supportSide).head,hand.head)),.5);
    // Bind-skin hand vertices, not the knuckle centre, define the contact
    // underside (actual current attendant/listener hand geometry).
    const underside=d.source==='male'?.05130:.04735;
    const wrist=sub(add(support,[0,underside,0]),rotate(palm,q)),arm=solveHand(supportSide,wrist,q);
    if(arm){supported=true;contacts.push({kind:'support',side:supportSide,supportId:frame.support.id,
      point:sub(add(arm.wrist,rotate(palm,q)),[0,underside,0]),target:[...support],palmUnderside:underside,error:arm.error});}
    else for(const[name,joint]of Object.entries(beforeSupport))joints[name]=joint;
  }
  if(prop){
    const side=supported?(supportSide==='R'?'L':'R'):(frame.propHand==='L'?'L':'R'),sign=side==='R'?1:-1;
    const elapsed=reducedMotion?0:(Number.isFinite(frame.activityPhase)?frame.activityPhase:Number.isFinite(frame.phase)?frame.phase:0)+(Number(frame.activityOffset)||0);
    const moving=frame.mode==='walk'||frame.mode==='watching'||frame.talkingToPlayer||frame.speaking||frame.performance?.role==='speaker';
    const lift=moving?0:prop==='cigarette'&&['smoke','lean'].includes(frame.activity)?socialCycle(elapsed,1.6,4.8,6.4,14)
      :prop!=='cigarette'&&['drink','lean'].includes(frame.activity)?socialCycle(elapsed,4.0,7.1,8.8,18):0;
    const grip=populationGrip(frame.designId,prop,side),head=bones.get('head'),mouth=add(point('head'),rotate(sub(socialMouth[frame.designId],head.head),joints[key('head')].rotation));
    const q=prop==='cigarette'?axis([0,0,1],-.14*sign):axis([1,0,0],.9*lift);
    const lipOffset=prop==='cigarette'?[0,0,.018]:[0,prop==='glass'?.080:.065,.0];
    const raised=sub(add(mouth,[sign*.016,-.003,-.006]),rotate(lipOffset,q));
    const held=prop==='cigarette'?[sign*.24,1.13,-.22]:[sign*.23,1.08,-.25];
    const center=held.map((v,i)=>v+(raised[i]-v)*lift),object={kind:prop,side,center,rotation:q,lift,elapsed};
    const arm=solveHand(side,add(center,rotate(grip.wrist,q)),q,grip,object);
    if(arm){
      objects.push(object);for(const contact of grip.contacts)contacts.push({...contact,
        target:add(center,rotate(contact.target,q)),point:add(center,rotate(contact.point,q))});
    }
  }
  return{...pose,joints,contacts,objects,supported};
}
export function academicFloorPopulationPose(frame,{timeSec=0,reducedMotion=false,headYaw=0,supportLocal=null}={}){
  const d=POPULATION[frame?.designId];if(!d)return null;
  const held=populationPose(frame.designId);
  if(d.hollow){
    if(reducedMotion&&!frame.dreadVariant)headYaw=0;
    if(d.hollow!=='unfinished-face'||Math.abs(headYaw)<1e-8)return{joints:held,contacts:[]};
    const joints=Object.fromEntries(Object.entries(held).map(([name,joint])=>[name,{translation:[...joint.translation],rotation:[...joint.rotation]}]));
    const bones=rigs[d.source],key=name=>`society_${d.source}_${name}`,point=name=>add(bones.get(name).head,joints[key(name)].translation),pivot=point('neck');
    const rotation=axis([0,1,0],-clamp(headYaw,-.35,.35));
    for(const name of branches[d.source].neck){const joint=joints[key(name)],at=add(pivot,rotate(sub(point(name),pivot),rotation));joints[key(name)]={translation:sub(at,bones.get(name).head),rotation:qmul(rotation,joint.rotation)};}
    return{joints,contacts:[]};
  }
  const social=socialProps.has(frame.heldProp)||validPopulationSupport(frame,supportLocal);
  if(!social&&frame.mode!=='walk'&&!frame.speaking&&(!frame.performance||reducedMotion)&&Math.abs(headYaw)<1e-8)return{joints:held,contacts:[]};
  const pose=academicBouncerPose({...frame,stance:'aside'},{timeSec,reducedMotion,headYaw});
  return social?populationSocialPose(frame,pose,{reducedMotion,supportLocal}):pose;
}
const populationPoint=(matrix,point)=>[0,1,2].map(axis=>matrix[axis]*point[0]+matrix[axis+4]*point[1]+matrix[axis+8]*point[2]+matrix[axis+12]);
function populationObjectMatrix(root,center,q){
  const x=rotate([1,0,0],q),y=rotate([0,1,0],q),z=rotate([0,0,1],q),at=populationPoint(root,center);
  const vector=v=>[0,1,2].map(axis=>root[axis]*v[0]+root[axis+4]*v[1]+root[axis+8]*v[2]);
  return new Float32Array([...vector(x),0,...vector(y),0,...vector(z),0,...at,1]);
}
export function academicFloorPopulationInstances(frames=[],{project=(x,y)=>({x,y:10,z:y}),zone=0,listener=null,timeSec=0,reducedMotion=false,maxDistance=18}={}){
  return frames.filter(frame=>frame&&POPULATION[frame.designId]&&frame.visible!==false
    &&Number.isFinite(frame.x)&&Number.isFinite(frame.y)
    &&(!listener||!Number.isFinite(maxDistance)||Math.hypot(frame.x-listener.x,frame.y-listener.y)<=maxDistance)).flatMap(frame=>{
    const d=POPULATION[frame.designId],point=project(frame.x,frame.y),settle=reducedMotion&&d.hollow&&!frame.dreadVariant?(Number(frame.cohortTurn)||0):0,
      heading=(Number.isFinite(frame.bodyYaw)?frame.bodyYaw:Number.isFinite(frame.yaw)?frame.yaw:0)-settle;
    const bearing=angle=>{const target=project(frame.x+Math.sin(angle),frame.y-Math.cos(angle)),dx=target.x-point.x,dz=target.z-point.z;
      return Number.isFinite(dx)&&Number.isFinite(dz)&&Math.hypot(dx,dz)>1e-8?Math.atan2(dx,-dz):angle;};
    const yaw=bearing(heading),desired=bearing(Number.isFinite(frame.yaw)?frame.yaw-settle:heading),headYaw=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
    const c=Math.cos(yaw),s=Math.sin(yaw),sx=Number.isFinite(frame.width)?clamp(frame.width,.85,1.2):d.width,
      sy=(Number.isFinite(frame.height)?clamp(frame.height,1.5,2.05):d.height)/height(d.source),sz=Number.isFinite(frame.depth)?clamp(frame.depth,.85,1.2):d.depth;
    let supportLocal=null;
    if(frame.support&&Number.isFinite(frame.support.x)&&Number.isFinite(frame.support.y)&&Number.isFinite(frame.support.height)){
      const target=project(frame.support.x,frame.support.y),dx=target.x-point.x,dz=target.z-point.z;
      supportLocal=[(c*dx+s*dz)/sx,(target.y-point.y+frame.support.height)/sy,(-s*dx+c*dz)/sz];
    }
    const pose=academicFloorPopulationPose(frame,{timeSec,reducedMotion,headYaw,supportLocal});
    const matrix=new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,point.x,point.y,point.z,1]);
    const body={id:`academic-population-${frame.id}`,mesh:d.mesh,x:point.x,y:point.y,z:point.z,yaw,matrix,
      zone,structural:false,character:{joints:pose.joints},academicPopulationActor:frame.id,hollow:d.hollow||null,
      socialActivity:frame.activity||null,supported:pose.supported===true};
    const parts=[body];
    for(const object of pose.objects||[]){
      const objectMatrix=populationObjectMatrix(matrix,object.center,object.rotation),at=[objectMatrix[12],objectMatrix[13],objectMatrix[14]];
      parts.push({id:`academic-social-${frame.id}-${object.kind}`,mesh:`academic_social_${object.kind}`,
        x:at[0],y:at[1],z:at[2],matrix:objectMatrix,zone,structural:false,
        academicPopulationProp:frame.id,heldObject:object.kind,hand:object.side,lift:object.lift});
      if(object.kind==='cigarette'&&(!listener||Math.hypot(frame.x-listener.x,frame.y-listener.y)<8)){
        const tip=populationPoint(objectMatrix,[0,0,-.073]),smokeScale=reducedMotion?.7:.7+.16*Math.sin(object.elapsed*.7);
        parts.push({id:`academic-social-${frame.id}-smoke`,mesh:'academic_social_smoke',x:tip[0],y:tip[1],z:tip[2],
          matrix:new Float32Array([1,0,0,0,0,smokeScale,0,0,0,0,1,0,...tip,1]),zone,structural:false,
          noShadow:true,academicPopulationProp:frame.id,heldObject:'smoke'});
      }
    }
    return parts;
  });
}

// Tiny physical accessories are installed once alongside the ordinary prop
// pack. Opaque rims, hollow vessels and sparse smoke filaments fit the engine's
// existing opaque/MASK contract; no fake transparent glass plane is introduced.
let populationSocialGeometryCache=null;
export function academicPopulationSocialGeometry(){
  if(populationSocialGeometryCache)return populationSocialGeometryCache;
  const pieces=new Map(),materials={
    paper:{base:[.72,.66,.52,1],roughness:.92},ash:{base:[.13,.12,.10,1],roughness:1},ember:{base:[.38,.16,.045,1],roughness:.9,emissive:[.10,.035,.004]},
    glass:{base:[.43,.50,.46,1],roughness:.23,metallic:.20},wine:{base:[.075,.045,.042,1],roughness:.28},ceramic:{base:[.62,.55,.42,1],roughness:.42},tea:{base:[.095,.065,.025,1],roughness:.30},smoke:{base:[.27,.29,.27,1],roughness:1},
  };
  const piece=name=>{const p={name,groups:new Map()};pieces.set(name,p);return p;};
  const triangle=(p,material,a,b,c)=>{if(length(cross(sub(b,a),sub(c,a)))<1e-12)return;if(!p.groups.has(material))p.groups.set(material,{positions:[],normals:[],uvs:[],indices:[]});
    const g=p.groups.get(material),start=g.positions.length/3,normal=unit(cross(sub(b,a),sub(c,a)));
    for(const point of[a,b,c]){g.positions.push(...point);g.normals.push(...normal);g.uvs.push(point[0],point[1]);}g.indices.push(start,start+1,start+2);};
  const quad=(p,m,a,b,c,d)=>{triangle(p,m,a,b,c);triangle(p,m,a,c,d);};
  const tube=(p,m,a,b,radius,steps=8)=>{
    const along=unit(sub(b,a)),side=unit(cross(along,Math.abs(along[1])>.9?[1,0,0]:[0,1,0])),up=cross(side,along);
    const ring=(at,i)=>add(at,add(mul(side,Math.cos(i*Math.PI*2/steps)*radius),mul(up,Math.sin(i*Math.PI*2/steps)*radius)));
    for(let i=0;i<steps;i++){quad(p,m,ring(a,i),ring(b,i),ring(b,i+1),ring(a,i+1));triangle(p,m,a,ring(a,i+1),ring(a,i));triangle(p,m,b,ring(b,i),ring(b,i+1));}
  };
  const lathe=(p,m,profile,steps=16)=>{
    const at=(i,j)=>[Math.cos(j*Math.PI*2/steps)*profile[i][1],profile[i][0],Math.sin(j*Math.PI*2/steps)*profile[i][1]];
    for(let i=1;i<profile.length;i++)for(let j=0;j<steps;j++)quad(p,m,at(i-1,j),at(i,j),at(i,j+1),at(i-1,j+1));
  };
  const cigarette=piece('academic_social_cigarette');
  tube(cigarette,'paper',[0,0,.018],[0,0,-.066],.004,8);tube(cigarette,'ash',[0,0,-.066],[0,0,-.073],.0042,8);tube(cigarette,'ember',[0,0,-.073],[0,0,-.074],.0035,8);
  const glass=piece('academic_social_glass');
  lathe(glass,'glass',[[-.095,0],[-.095,.026],[-.090,.027],[-.085,.006],[-.029,.005],[-.020,.024],[.010,.034],[.077,.037],[.080,.035],[.077,.033],[.010,.030],[-.015,.020],[-.017,0]],18);
  lathe(glass,'wine',[[.024,0],[.024,.032],[.025,.032],[.025,0]],18);
  const cup=piece('academic_social_cup');
  lathe(cup,'ceramic',[[-.061,0],[-.061,.037],[-.052,.041],[.059,.043],[.065,.040],[.061,.037],[-.049,.035],[-.052,0]],16);
  lathe(cup,'tea',[[.042,0],[.042,.037],[.043,.037],[.043,0]],16);
  for(let i=0;i<14;i++){const point=t=>[.040+.025*Math.sin(t),.032*Math.cos(t),0];tube(cup,'ceramic',point(i/14*Math.PI),point((i+1)/14*Math.PI),.005,6);}
  const smoke=piece('academic_social_smoke');
  // Two broken, tapering real filaments; absent segments keep the torch's
  // background visible through the curl without an unsupported blend mode.
  for(let i=0;i<15;i++){if(i===5||i===11)continue;const p=t=>[.009*Math.sin(t*9),t*.15,.006*Math.sin(t*13)];tube(smoke,'smoke',p(i/15),p((i+.65)/15),.0013*(1-i/18),5);}
  const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
  populationSocialGeometryCache=freeze([...pieces.values()].map(p=>{
    const all=[...p.groups.values()].flatMap(g=>g.positions),bounds={min:[0,1,2].map(k=>Math.min(...all.filter((_,i)=>i%3===k))),max:[0,1,2].map(k=>Math.max(...all.filter((_,i)=>i%3===k)))};
    return{name:p.name,bounds,groups:[...p.groups].map(([material,g])=>({...g,material,...materials[material]}))};
  }));
  return populationSocialGeometryCache;
}
export function installAcademicPopulationSocialMeshes(gl,pack){
  if(!gl||!pack?.catalog)return[];
  const pieces=academicPopulationSocialGeometry(),names=pieces.map(p=>p.name),identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  for(const piece of pieces){
    if(pack.catalog.has(piece.name))continue;
    const instanceBuffer=gl.createBuffer(),primitives=[];
    for(const group of piece.groups){
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      for(const[location,data,size]of[[0,group.positions,3],[1,group.normals,3],[2,group.uvs,2]]){
        gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(group.indices),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);const stride=PROP_INSTANCE_FLOATS*4;
      for(let column=0;column<4;column++){const location=3+column;gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,stride,column*16);gl.vertexAttribDivisor(location,1);}
      for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(location,1);}
      gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
      primitives.push({vao,count:group.indices.length,indexType:gl.UNSIGNED_SHORT,base:group.base,emissive:group.emissive||[0,0,0],texture:null,
        roughness:group.roughness,metallic:group.metallic||0,alphaCut:0,aoStrength:0,materialName:`academic social ${group.material}`});
    }
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity,instanceBuffer,primitives,
      extras:{academicSocialProp:true,bounds:piece.bounds}});
  }
  gl.bindVertexArray(null);return names;
}
