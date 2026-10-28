// Pub patrons share the retained anatomical rigs. Seat contact and table
// clearance are authored in metres, then converted back through actor scale.
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../data/source-last-reception-resident-rigs.js';
import {VIGIL_CHARACTER_RIGS} from '../data/vigil-character-rigs.js';
import {vigilCharacterIdForMesh,vigilCharacterPose} from './vigil-character-performance.js';

export const PUB_CHARACTER_PACK='/assets/pub-characters.glb';
export const PUB_QUEST_PROP_PACK='/assets/pub-quest-props.glb';
const design=(id,source,options)=>Object.freeze({id,mesh:id.replaceAll('-','_'),source,height:source==='male'?1.78:1.70,width:1,depth:1,...options});
export const PUB_CHARACTER_DESIGNS=Object.freeze({
  'pub-bartender-iona':design('pub-bartender-iona','female',{height:1.73,width:1.06,depth:1.04,stance:'polish',drink:'glass',seed:.8,face:'odette',wardrobe:'apron',skin:[.55,.41,.31],hair:[.31,.33,.32],shirt:[.18,.13,.10],coat:[.64,.57,.42],trouser:[.10,.105,.095]}),
  'pub-patron-mavis':design('pub-patron-mavis','female',{height:1.61,width:1.10,depth:1.04,seatY:.515,seatLift:.072,lean:.16,stance:'listen',drink:'mug',seed:1.7,face:'celeste',wardrobe:'cardigan',skin:[.58,.43,.34],hair:[.67,.65,.55],shirt:[.32,.095,.15],coat:[.32,.095,.15],trouser:[.11,.10,.09]}),
  'pub-patron-ed':design('pub-patron-ed','male',{height:1.80,width:.98,depth:1,seatY:.4925,seatLift:.048,stance:'pint',drink:'pint',seed:2.4,face:'listener',wardrobe:'waistcoat',skin:[.64,.48,.36],hair:[.12,.09,.065],shirt:[.12,.19,.24],coat:[.20,.22,.215],trouser:[.115,.12,.115]}),
  'pub-patron-bert':design('pub-patron-bert','male',{height:1.73,width:1.10,depth:1.05,seatY:.515,seatLift:.056,stance:'listen',seed:3.6,face:'noe',wardrobe:'pullover',skin:[.58,.43,.33],hair:[.24,.23,.20],shirt:[.31,.25,.12],coat:[.31,.25,.12],trouser:[.095,.105,.075]}),
  'pub-patron-farah':design('pub-patron-farah','female',{height:1.69,width:.96,depth:.98,seatY:.4925,seatLift:.104,lean:.075,cupReach:.50,stance:'pint',drink:'pint',seed:4.8,face:'agathe',wardrobe:'waistcoat',skin:[.40,.25,.17],hair:[.065,.038,.024],shirt:[.10,.28,.27],coat:[.28,.16,.10],trouser:[.08,.12,.13]}),
  'pub-patron-nell':design('pub-patron-nell','female',{height:1.77,width:.94,depth:1,seatY:.515,seatLift:.067,stance:'folded',seed:5.5,face:'sabine',wardrobe:'pullover',skin:[.68,.56,.45],hair:[.23,.25,.24],shirt:[.26,.29,.31],coat:[.26,.29,.31],trouser:[.075,.09,.105]}),
  'pub-patron-arthur':design('pub-patron-arthur','male',{height:1.85,width:.94,depth:.97,seatY:.8325,seatLift:.052,seatForward:.24,stance:'stool',drink:'pint',seed:6.3,face:'emile',wardrobe:'waistcoat',skin:[.72,.61,.49],hair:[.045,.033,.027],shirt:[.64,.60,.48],coat:[.32,.16,.085],trouser:[.09,.105,.11]}),
});
export const PUB_CHARACTER_MESHES=Object.freeze(Object.values(PUB_CHARACTER_DESIGNS).map(d=>d.mesh));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const identity=[0,0,0,1],axis=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)],rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const product=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];
function between(a,b){const x=unit(a),y=unit(b),d=dot(x,y);return d<-.99999?[...unit(cross(x,Math.abs(x[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(x,y),1+d]);}
function chain(start,target,a,b,pole){const delta=sub(target,start),distance=clamp(length(delta),Math.abs(a-b)+1e-5,a+b-1e-5),direction=unit(delta),along=(a*a-b*b+distance*distance)/(2*distance),side=unit(sub(pole,mul(direction,dot(pole,direction)))),end=add(start,mul(direction,distance));return{middle:add(add(start,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,a*a-along*along)))),end,error:length(sub(target,end))};}

export const pubCharacterDesign=id=>PUB_CHARACTER_DESIGNS[id]||Object.values(PUB_CHARACTER_DESIGNS).find(d=>d.mesh===id)||null;
export const PUB_DRINK_SHAPES=Object.freeze({
  pint:Object.freeze({mesh:'pub_held_pint',height:.125,radius:.047,gripY:.063,gripRadius:.052}),
  water:Object.freeze({mesh:'pub_held_water',height:.100,radius:.035,gripY:.052,gripRadius:.041}),
  mug:Object.freeze({mesh:'pub_held_mug',height:.112,radius:.055,gripY:.060,gripRadius:.080}),
  glass:Object.freeze({mesh:'pub_held_glass',height:.100,radius:.035,gripY:.052,gripRadius:.041}),
});
export const PUB_HELD_PROP_MESHES=Object.freeze([...Object.values(PUB_DRINK_SHAPES).map(shape=>shape.mesh),'pub_polishing_cloth']);
export function pubCharacterPerformance(id,{timeSec=0,reducedMotion=false,drinkKind}={}){
  const d=pubCharacterDesign(id);if(!d)return null;
  const kind=drinkKind===undefined?d.drink:drinkKind,period=d.stance==='polish'?23.7:33+d.seed*1.7;
  const seconds=((Math.max(0,Number(timeSec)||0)+d.seed*7.1)%period+period)%period;
  if(reducedMotion)return{phase:'rest',lift:0,polish:0,headYaw:0,seconds:0,period,kind};
  if(d.stance==='polish'){
    const polish=seconds>11&&seconds<15?Math.sin((seconds-11)/4*Math.PI)**2:0;
    return{phase:polish?'polish':seconds>17?'listen':'rest',lift:0,polish,headYaw:seconds>17?.14*Math.sin((seconds-17)/(period-17)*Math.PI)**2:0,seconds,period,kind};
  }
  const begin=period-5.6;
  const lift=kind?seconds<begin?0:seconds<begin+1.6?ease((seconds-begin)/1.6):seconds<begin+2.8?1:seconds<begin+4.6?1-ease((seconds-begin-2.8)/1.8):0:0;
  const phase=lift===1?'sip':lift>0?(seconds<begin+1.6?'lift':'return'):seconds>8&&seconds<12?'listen':'rest';
  return{phase,lift,polish:0,headYaw:phase==='listen'?.14*Math.sin((seconds-8)/4*Math.PI)**2*(d.seed%2<1?-1:1):0,seconds,period,kind};
}
export function pubCharacterPose(id,{timeSec=0,reducedMotion=false,seatY,headYaw=0,seatLift,seatForward,drinkKind,drinkRest}={}){
  const d=pubCharacterDesign(id);if(!d)return null;
  const source=RIGS[d.source],bones=new Map(source.map(b=>[b.name,b])),desired=new Map(),contacts=[];
  const sourceHeight=d.source==='male'?1.78:1.70,sy=d.height/sourceHeight,sx=d.width,sz=d.depth;
  const toLocal=p=>[p[0]/sx,p[1]/sy,p[2]/sz],seated=Number.isFinite(seatY??d.seatY),seat=seatY??d.seatY;
  const breath=reducedMotion?0:Math.sin(timeSec*.85+d.seed)*.002,lean=d.lean??(seated?.045:.025);
  // Mesh-calibrated pelvis offsets clear the actual cushion; sole offsets below
  // keep that adjustment from lifting shoes away from their physical support.
  const motion=pubCharacterPerformance(id,{timeSec,reducedMotion,drinkKind});
  const pelvis=bones.get('pelvis').head,hipY=seated?(seat+.09+(seatLift??d.seatLift??0))/sy:pelvis[1],shift=[0,hipY-pelvis[1],-(seatForward??d.seatForward??0)/sz],torsoQ=axis([1,0,0],-lean),upper=p=>add(add(pelvis,rotate(sub(p,pelvis),torsoQ)),add(shift,[0,breath,0]));
  const put=(name,head,tail)=>desired.set(name,{head,rotation:between(sub(bones.get(name).tail,bones.get(name).head),sub(tail,head))});
  for(const name of['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head','jaw','clavicle_L','clavicle_R']){const b=bones.get(name);put(name,upper(b.head),upper(b.tail));}
  // A restrained head turn remains independent of the planted torso/seat.
  const head=bones.get('head'),look=clamp(headYaw+motion.headYaw,-.35,.35),hq=axis([0,1,0],look);
  if(look){for(const name of['head','jaw']){const b=bones.get(name),pivot=upper(head.head);desired.set(name,{head:add(pivot,rotate(sub(upper(b.head),pivot),hq)),rotation:product(hq,torsoQ)});}}
  const scale=[sx,sy,sz],physical=p=>p.map((v,i)=>v*scale[i]);
  const restMouth=d.source==='male'?[0,1.59087,-.1505]:[0,1.50275,-.16135],headPose=desired.get('head');
  const mouth=physical(add(headPose.head,rotate(sub(restMouth,head.head),headPose.rotation)));
  const shape=PUB_DRINK_SHAPES[motion.kind],drinkSide=d.stance==='polish'?'L':'R',grip=shape?[(drinkSide==='L'?-1:1)*shape.gripRadius,shape.gripY,0]:null;
  const cupRotation=axis([1,0,0],d.stance==='polish'?motion.polish*.11:motion.lift*.52);
  const rest=drinkRest||[d.stance==='polish'?-.08:.14,d.stance==='polish'?1.06:d.stance==='stool'?1.128:.778,-(d.stance==='polish'?.32:d.stance==='stool'?.76:d.cupReach??.52)];
  const lip=shape?[0,shape.height,shape.radius]:null;
  const cupPosition=shape?mix(rest,sub(mouth,rotate(lip,axis([1,0,0],.52))),motion.lift):null;
  const cupGrip=shape?add(cupPosition,rotate(grip,cupRotation)):null;
  const hands={};
  let drinkContact=null,clothContact=null;
  for(const[side,sign]of[['L',-1],['R',1]]){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side),toe=bones.get('toe_'+side),hip=add(thigh.head,shift);
    if(seated){
      const stool=d.stance==='stool',ankle=toLocal([sign*.16,stool?.343:(foot.head[1]-(d.source==='female'?.00917:.00244))*sy+.0015,-(stool?.17:.33)]),leg=chain(hip,ankle,length(sub(thigh.tail,thigh.head)),length(sub(shin.tail,shin.head)),[sign*.1,0,-1]);
      put(thigh.name,hip,leg.middle);put(shin.name,leg.middle,leg.end);put(foot.name,leg.end,add(leg.end,sub(foot.tail,foot.head)));put(toe.name,add(leg.end,sub(toe.head,foot.head)),add(leg.end,sub(toe.tail,foot.head)));
      contacts.push({kind:'seat',side,seatY:seat,hip:hip.map((v,i)=>v*[sx,sy,sz][i]),ankle:leg.end.map((v,i)=>v*[sx,sy,sz][i]),knee:leg.middle.map((v,i)=>v*[sx,sy,sz][i]),error:leg.error});
    }else for(const b of[thigh,shin,foot,toe])desired.set(b.name,{head:b.head,rotation:identity});
    const upperarm=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=upper(upperarm.head);
    let target;
    let palmTarget=null;
    if(shape&&side===drinkSide)palmTarget=cupGrip;
    else if(d.stance==='polish'&&shape&&side==='R')palmTarget=add(cupPosition,[.015,shape.height*.70+Math.sin(motion.seconds*8)*motion.polish*.012,-.050]);
    const direction=palmTarget?rotate([0,.05,-1],cupRotation):[0,-.4,-1],handRotation=between(sub(hand.tail,hand.head),toLocal(direction));
    const palmRest=mix(hand.tail,bones.get('middle_'+side).head,.55),palmOffset=rotate(sub(palmRest,hand.head),handRotation);
    if(palmTarget)target=sub(toLocal(palmTarget),palmOffset);
    else if(d.stance==='stool')target=toLocal([sign*.16,seat+.23,-.29]);
    else target=toLocal([sign*(d.stance==='folded'?.065:.14),seated?seat+.20:1.08,-.17]);
    const arm=chain(shoulder,target,length(sub(upperarm.tail,upperarm.head)),length(sub(fore.tail,fore.head)),[0,-.8,-.15]);put(upperarm.name,shoulder,arm.middle);put(fore.name,arm.middle,arm.end);
    desired.set(hand.name,{head:arm.end,rotation:handRotation});hands[side]=arm.end;
    contacts.push({kind:'wrist',side,target,point:arm.end,error:arm.error});
    const palm=physical(add(arm.end,palmOffset));
    if(shape&&side===drinkSide){const position=sub(palm,rotate(grip,cupRotation));drinkContact={kind:motion.kind,mesh:shape.mesh,phase:motion.phase,lift:motion.lift,held:motion.lift>0||d.stance==='polish',position,rotation:cupRotation,grip,palm,mouth,rim:add(position,rotate(lip,cupRotation)),lip:add(position,rotate(lip,cupRotation)),gripError:length(sub(palm,cupGrip)),mouthError:length(sub(add(position,rotate(lip,cupRotation)),mouth))};}
    if(d.stance==='polish'&&shape&&side==='R')clothContact={position:palm,rotation:cupRotation,phase:motion.phase};
  }
  // Every knuckle follows its actual hand transform rather than stretching
  // across the room when its parent wrist leaves the anatomical rest pose.
  for(const b of source)if(!desired.has(b.name)){const parent=desired.get(b.parent);if(parent){const rest=bones.get(b.parent);desired.set(b.name,{head:add(parent.head,rotate(sub(b.head,rest.head),parent.rotation)),rotation:parent.rotation});}else desired.set(b.name,{head:b.head,rotation:identity});}
  const joints=Object.fromEntries(source.map(b=>{const p=desired.get(b.name);return[`pub_${d.source}_${b.name}`,{translation:sub(p.head,b.head),rotation:p.rotation}];}));
  return{joints,contacts,hands,seatY:seated?seat:null,scale,performance:motion,drinkContact,clothContact,mouth};
}
export const pubCharacterDescriptor=(id,options={})=>{const pose=pubCharacterPose(id,options);return pose?{joints:pose.joints}:null;};

function heldMatrix(position,rotation,yaw){
  const q=product(axis([0,1,0],-yaw),rotation),x=rotate([1,0,0],q),y=rotate([0,1,0],q),z=rotate([0,0,1],q);
  return new Float32Array([...x,0,...y,0,...z,0,...position,1]);
}
export function pubCharacterInstances(actors=[],{timeSec=0,reducedMotion=false,zone=0,drinksByActor={}}={}){
  return actors.flatMap(actor=>{const d=pubCharacterDesign(actor.id);if(!d||actor.visible===false)return[];const yaw=actor.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw),sx=d.width,sy=d.height/(d.source==='male'?1.78:1.70),sz=d.depth,x=actor.x,y=actor.floor??actor.y??0,z=actor.z;
    const specification=Object.hasOwn(drinksByActor,actor.id)?drinksByActor[actor.id]:d.drink,kind=typeof specification==='object'?specification?.kind:specification;
    const restWorld=specification?.restWorld,drinkRest=Array.isArray(restWorld)?[(restWorld[0]-x)*c+(restWorld[2]-z)*s,restWorld[1]-y,-(restWorld[0]-x)*s+(restWorld[2]-z)*c]:undefined;
    const actorTime=(Number.isFinite(specification?.timeSec)?specification.timeSec:timeSec)
      // A newly served water starts on its table, then rises in thanks. The
      // same finite sip/return loop continues afterward without a second clock.
      +(specification?.handoff?33+d.seed*1.7-5.6-d.seed*7.1-.3:0);
    const pose=pubCharacterPose(actor.id,{timeSec:actorTime,reducedMotion,seatY:actor.seatY??(Number.isFinite(actor.seatHeight)?actor.seatHeight-.012:undefined),headYaw:actor.headYaw||0,drinkKind:kind??null,drinkRest});
    const out=[{id:actor.id,mesh:d.mesh,x,y,z,yaw,zone,structural:false,matrix:new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]),character:{joints:pose.joints},pubPerformance:pose.performance}];
    const world=p=>[x+c*p[0]-s*p[2],y+p[1],z+s*p[0]+c*p[2]];
    if(pose.drinkContact){const contact=pose.drinkContact,position=world(contact.position);out.push({id:`${actor.id}:drink`,mesh:contact.mesh,zone,structural:false,matrix:heldMatrix(position,contact.rotation,yaw),pubDrinkContact:{...contact,position,palm:world(contact.palm),rim:world(contact.rim),lip:world(contact.lip),mouth:world(contact.mouth)}});}
    if(pose.clothContact){const contact=pose.clothContact;out.push({id:`${actor.id}:cloth`,mesh:'pub_polishing_cloth',zone,structural:false,matrix:heldMatrix(world(contact.position),contact.rotation,yaw)});}
    return out;});
}

// Malcolm brings his existing face, rainwear and map inside. Only his lower
// body takes the stool; translating torso, hands and map together preserves
// the authored fingertip contacts on the folded paper.
export function pubSeatedVigilPose(mesh,frame=null,{seatY=.8205,reducedMotion=false,timeSec=0,conversation=null}={}){
  const id=vigilCharacterIdForMesh(mesh);if(!id)return null;
  const source=VIGIL_CHARACTER_RIGS[id],bones=new Map(source.map(b=>[b.name,b])),base=vigilCharacterPose(id,{action:frame?.action||null,progress:frame?clamp(frame.elapsedMs/Math.max(1,frame.durationMs),0,1):0,reducedMotion,timeSec,conversation}),joints=structuredClone(base.joints),key=name=>`vigil_${id}_${name}`,shift=[0,seatY+.09-bones.get('pelvis').head[1],0];
  for(const joint of Object.values(joints))joint.translation=add(joint.translation,shift);
  const contacts=base.contacts.map(contact=>{const next={...contact};for(const field of['target','point','shoulder','elbow'])if(Array.isArray(next[field]))next[field]=add(next[field],shift);return next;});
  const put=(bone,head,rotation=identity)=>joints[key(bone.name)]={translation:sub(head,bone.head),rotation};
  for(const[side,sign]of[['L',-1],['R',1]]){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side),toe=bones.get('toe_'+side),hip=add(thigh.head,shift),target=[sign*.16,.343,-.17],leg=chain(hip,target,length(sub(thigh.tail,thigh.head)),length(sub(shin.tail,shin.head)),[sign*.1,0,-1]);
    put(thigh,hip,between(sub(thigh.tail,thigh.head),sub(leg.middle,hip)));put(shin,leg.middle,between(sub(shin.tail,shin.head),sub(leg.end,leg.middle)));put(foot,leg.end);put(toe,add(leg.end,sub(toe.head,foot.head)));
    contacts.push({kind:'seat',side,seatY,hip,knee:leg.middle,ankle:leg.end,error:leg.error});
  }
  return{...base,joints,contacts,seatY};
}
export const pubSeatedVigilDescriptor=(mesh,frame=null,options={})=>{const pose=pubSeatedVigilPose(mesh,frame,options);return pose?{joints:pose.joints}:null;};
