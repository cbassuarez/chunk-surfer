// The same two modest anatomical rigs serve twenty people. Performance is
// sampled from the existing saved vigil clock; no animation advances story.
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../data/source-last-reception-resident-rigs.js';
import {STREET_CROWD_DESIGNS,streetCrowdDesign} from '../data/street-crowd-characters.js';
import {exteriorPerformanceFrame} from './exterior-conversation-performance.js';
export {STREET_CROWD_CHARACTER_PACK,STREET_CROWD_PROP_PACK} from '../data/street-crowd-characters.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const identity=[0,0,0,1],axis=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)],rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
function between(a,b){const x=unit(a),y=unit(b),d=dot(x,y);return d<-.99999?[...unit(cross(x,Math.abs(x[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(x,y),1+d]);}
function oriented(from,normal,to,toNormal){const swing=between(from,to),direction=unit(to),project=v=>unit(sub(v,mul(direction,dot(v,direction)))),a=project(rotate(normal,swing)),b=project(toNormal);return multiply(axis(direction,Math.atan2(dot(direction,cross(a,b)),dot(a,b))),swing);}
function fingerChain(base,target,sizes,pole){
  const total=sizes.reduce((a,b)=>a+b,0),delta=sub(target,base),distance=length(delta),direction=unit(delta),normal=unit(sub(pole,mul(direction,dot(pole,direction))));let points=[base],along=0;
  for(const size of sizes){along+=size;points.push(add(add(base,mul(direction,Math.min(distance,total)*along/total)),mul(normal,Math.sin(Math.PI*along/total)*total*.28)));}
  if(distance>=total){points=[base];for(const size of sizes)points.push(add(points.at(-1),mul(direction,size)));}
  else for(let iteration=0;iteration<48;iteration++){points[3]=target;for(let i=2;i>=0;i--)points[i]=add(points[i+1],mul(unit(sub(points[i],points[i+1])),sizes[i]));points[0]=base;for(let i=0;i<3;i++)points[i+1]=add(points[i],mul(unit(sub(points[i+1],points[i])),sizes[i]));if(length(sub(points[3],target))<1e-6)break;}
  return{points,error:length(sub(points[3],target))};
}
function chain(start,target,a,b,pole){const delta=sub(target,start),distance=clamp(length(delta),Math.abs(a-b)+1e-5,a+b-1e-5),direction=unit(delta),along=(a*a-b*b+distance*distance)/(2*distance);let side=sub(pole,mul(direction,dot(pole,direction)));if(length(side)<1e-6)side=cross(direction,[0,0,1]);const end=add(start,mul(direction,distance));return{middle:add(add(start,mul(direction,along)),mul(unit(side),Math.sqrt(Math.max(0,a*a-along*along)))),end,error:length(sub(target,end))};}
const sourceHeight=source=>source==='male'?1.78:1.70;
// Wrist-relative grasps are invariant under breath, arm IK and kit translation.
// Forty small entries cover the entire cast instead of solving 200 fingers
// every render frame. Action progress never becomes part of the cache key.
const fingerPoseCache=new Map();
export function streetCrowdCharacterIdForMesh(mesh){return streetCrowdDesign(mesh)?.id||null;}

function actionState(frame,reducedMotion){
  const progress=clamp(Number.isFinite(frame?.progress)?frame.progress:(Number(frame?.elapsedMs)||0)/Math.max(1,Number(frame?.durationMs)||1),0,1);
  const pulse=frame?.action?(reducedMotion?(progress>0&&progress<1?1:0):Math.sin(progress*Math.PI)):0;
  return{action:frame?.action||null,progress,pulse};
}
export function streetCrowdPose(idOrMesh,{frame=null,timeSec=0,reducedMotion=false,yaw=0,conversation=null}={}){
  const d=streetCrowdDesign(idOrMesh);if(!d)return null;
  const source=RIGS[d.source],bones=new Map(source.map(b=>[b.name,b])),desired=new Map(),contacts=[];
  const scale=[d.width,d.height/sourceHeight(d.source),d.depth],toLocal=p=>p.map((v,i)=>v/scale[i]),toPhysical=p=>p.map((v,i)=>v*scale[i]);
  const {action,progress,pulse}=actionState(frame,reducedMotion),seated=d.posture==='seated',seat=d.seatY;
  const performance=exteriorPerformanceFrame(d.id,{timeSec,reducedMotion,conversation});
  const {ambient,attention,gesture}=performance,local=d.id.startsWith('district-');
  const document=['pamphlets','flask','camera'].includes(d.accessory);
  // Keep the approved rest fit. Respiratory expansion affects only the ribs;
  // independent, sparse object adjustments carry the larger idle performance.
  const breath=reducedMotion?0:Math.sin(d.seed)*.0015;
  const pelvis=bones.get('pelvis').head,shift=seated?toLocal([0,seat+.09,0]).map((v,i)=>v-(i===1?pelvis[1]:0)):[0,0,0];
  // Weight stays over the planted shoes. Only the upper torso makes a small
  // lateral correction, avoiding the old whole-prop sliding animation.
  const bodyQ=multiply(axis([0,0,1],d.sideLean+(action==='weight-shift'?.018*pulse:0)+(local?.008*gesture:0)),axis([1,0,0],-d.lean-(action==='chair-settle'?.018*pulse:0)-(seated?.012*ambient:.008*attention)));
  const upper=p=>{const posed=add(add(pelvis,rotate(sub(p,pelvis),bodyQ)),add(shift,[0,breath,0])),rib=performance.respiration*clamp((p[1]-pelvis[1])/.40,0,1);return rib?add(posed,[0,.0013*rib,-.0005*rib]):posed;};
  const put=(name,head,tail)=>desired.set(name,{head,rotation:between(sub(bones.get(name).tail,bones.get(name).head),sub(tail,head))});
  for(const name of['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','clavicle_L','clavicle_R']){const b=bones.get(name);put(name,upper(b.head),upper(b.tail));}
  const glance=(d.accessory==='placard'?.065:document?-.025:seated?-.045:.055)*ambient;
  const headPitch=performance.nod-(document?.055:seated?.025:0)*ambient;
  const headQ=multiply(bodyQ,multiply(axis([0,1,0],d.headYaw+(action==='camera-check'?-.08:action==='page-turn'?.06:0)*pulse+performance.headYaw+glance),axis([1,0,0],headPitch)));
  for(const name of['head','jaw']){const b=bones.get(name),pivot=upper(bones.get('head').head);
    const legacyOffset=sub(upper(b.head),pivot),localOffset=sub(b.head,bones.get('head').head),blend=clamp(attention+ambient,0,1);
    const offset=legacyOffset.map((value,i)=>value+(localOffset[i]-value)*blend);
    desired.set(name,{head:add(pivot,rotate(offset,headQ)),rotation:name==='jaw'?multiply(headQ,axis([1,0,0],-performance.jaw)):headQ});}
  for(const[side,sign]of[['L',-1],['R',1]]){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side),toe=bones.get('toe_'+side);
    if(seated){
      const hip=add(thigh.head,shift),ankle=toLocal([sign*.17,foot.head[1]*scale[1],-.20]),leg=chain(hip,ankle,length(sub(thigh.tail,thigh.head)),length(sub(shin.tail,shin.head)),[sign*.40,0,-1]);
      put(thigh.name,hip,leg.middle);put(shin.name,leg.middle,leg.end);put(foot.name,leg.end,add(leg.end,sub(foot.tail,foot.head)));put(toe.name,add(leg.end,sub(toe.head,foot.head)),add(leg.end,sub(toe.tail,foot.head)));
      contacts.push({kind:'seat',side,seatY:seat,hip:toPhysical(hip),knee:toPhysical(leg.middle),ankle:toPhysical(leg.end),error:leg.error});
    }else for(const b of[thigh,shin,foot,toe])desired.set(b.name,{head:b.head,rotation:identity});
  }
  // Kit anchors are independent of wrists. The builder uses these same
  // physical points, then binds the object to the solved holding hand.
  const objects={},grips={};
  const cylinder=(side,center,radius,{horizontal=false}={})=>({kind:'cylinder',side,center,radius,horizontal,axis:[0,-.48,-.8773],normal:horizontal?[0,-1,0]:[side==='L'?1:-1,0,0],wrist:add(center,horizontal?[0,.055,.067]:[side==='L'?-(radius+.001):radius+.001,.055,.055])});
  if(d.accessory==='umbrella'){objects.umbrella={center:[.19,1.18-(action==='umbrella-settle'?.035*pulse:0)-.008*ambient,-.17],radius:.012};grips.R=cylinder('R',objects.umbrella.center,.012);}
  if(d.accessory==='flask'){
    objects.flask={center:[-.18,1.11,-.23],radius:.061};objects.cup={center:add(add([.17,1.08,-.20],action==='cup-handoff'?[-.06*pulse,.02*pulse,-.05*pulse]:[0,0,0]),[0,.018*ambient,-.008*ambient]),radius:.041};
    grips.L=cylinder('L',objects.flask.center,.061);grips.R=cylinder('R',objects.cup.center,.041);
  }
  if(d.accessory==='pamphlets'){
    objects.pamphlets={center:[-.17,1.11+(action==='page-turn'?.012*pulse:0)+.006*ambient,-.25],width:.19,height:.265};objects.bag={center:[.24,.72,-.075],grip:[.24,.975,-.075]};
    grips.L={kind:'paper',side:'L',center:objects.pamphlets.center,anchor:add(objects.pamphlets.center,[-.088,-.025,0]),axis:[.94,-.342,0],normal:[0,0,-1]};grips.R=cylinder('R',objects.bag.grip,.007,{horizontal:true});
  }
  if(d.accessory==='camera'){
    objects.camera={center:[.20,1.43-(action==='camera-check'?.012*pulse:0)-.006*ambient,-.22]};
    grips.R=cylinder('R',add(objects.camera.center,[0,.105,0]),.009,{horizontal:true});
    grips.L={kind:'support',side:'L',center:objects.camera.center,axis:[1,0,-.25],normal:[0,1,0],wrist:add(objects.camera.center,[-.14,-.085,.055])};
  }
  if(d.accessory==='placard')for(const[side,y]of[['L',1.15],['R',1.30]]){
    const partValue=(key,fallback)=>Number.isFinite(frame?.part?.[key])?frame.part[key]:fallback,dx=partValue('dx',0),dz=partValue('dz',action==='placard-lower'?.02*pulse:0),dy=partValue('dy',action==='placard-lower'?-.12*pulse:0),turn=partValue('dyaw',action==='placard-lower'?.055*pulse:0),c=Math.cos(yaw),s=Math.sin(yaw);
    const center=add(rotate([0,y,-.10-(y-.58)*.12/1.54],axis([0,1,0],-turn)),[c*dx+s*dz,dy,-s*dx+c*dz]);grips[side]=cylinder(side,center,.019);
  }
  for(const side of['L','R'])if(grips[side])grips[side].object=d.accessory==='flask'?(side==='L'?'flask':'cup'):d.accessory==='pamphlets'?(side==='L'?'pamphlets':'bag'):d.accessory;
  const hands={};
  for(const[side,sign]of[['L',-1],['R',1]]){
    const arm=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=upper(arm.head),grip=grips[side],digits=['thumb','index','middle','ring','little'],links=digit=>['','_mid','_tip'].map(suffix=>bones.get(digit+suffix+'_'+side));
    const fingerAxis=unit(sub(links('middle')[2].tail,hand.head)),across=sub(bones.get('little_'+side).head,bones.get('index_'+side).head),palmNormal=unit(mul(cross(fingerAxis,across),sign));
    let physicalTarget=seated?[sign*.14,seat+.20,-.20]:[sign*.23,d.height*.54,-.08];
    if(d.stance==='folded')physicalTarget=side==='L'?[.085,1.10,-.23]:[-.085,1.14,-.25];
    if(d.stance==='belt')physicalTarget=[sign*.17,.98,-.12];
    let palmQ=oriented(fingerAxis,palmNormal,[sign*.10,-.78,-.35],[0,0,1]);
    if(!grip&&local){
      const mews=d.stance==='folded',amount=side==='R'?gesture:gesture*.18;
      physicalTarget=add(physicalTarget,[sign*(mews?.018:.032)*amount,(mews?.025:.055)*amount,-(mews?.034:.050)*amount]);
      palmQ=multiply(axis([0,0,1],sign*(mews?.08:.13)*amount),palmQ);
    }
    if(grip){
      palmQ=oriented(fingerAxis,palmNormal,unit(toLocal(grip.axis)),unit(toLocal(grip.normal)));
      if(grip.kind==='paper'){
        const thumb=links('thumb')[2],index=links('index')[2],pinchLocal=sub(sub(mul(add(thumb.tail,index.tail),.5),hand.head),mul(fingerAxis,.025));
        physicalTarget=toPhysical(sub(toLocal(grip.anchor),rotate(pinchLocal,palmQ)));
      }else physicalTarget=grip.wrist;
    }
    const target=toLocal(physicalTarget),solve=chain(shoulder,target,length(sub(arm.tail,arm.head)),length(sub(fore.tail,fore.head)),[sign*.35,-.65,.15]);
    put(arm.name,shoulder,solve.middle);put(fore.name,solve.middle,solve.end);
    desired.set(hand.name,{head:solve.end,rotation:palmQ});hands[side]=solve.end;
    contacts.push({kind:'wrist',side,target,point:solve.end,physicalTarget,physicalPoint:toPhysical(solve.end),error:solve.error});
    const cacheKey=d.id+':'+side+':'+(grip?.kind||'relaxed'),cached=fingerPoseCache.get(cacheKey),fingerContactStart=contacts.length;
    if(cached){
      for(const[name,entry]of cached.joints)desired.set(name,{head:add(solve.end,rotate(entry.head,palmQ)),rotation:multiply(palmQ,entry.rotation)});
      for(const entry of cached.contacts){const target=add(solve.end,rotate(entry.target,palmQ)),point=add(solve.end,rotate(entry.point,palmQ));contacts.push({...entry,target,point,physicalTarget:toPhysical(target),physicalPoint:toPhysical(point)});}
    }else for(const[digitIndex,digit]of digits.entries()){
      const bonesForDigit=links(digit),base=add(solve.end,rotate(sub(bonesForDigit[0].head,hand.head),palmQ)),sizes=bonesForDigit.map(b=>length(sub(b.tail,b.head)));let targetPoint,pole=rotate(palmNormal,palmQ);
      if(grip?.kind==='cylinder'){
        const theta=digit==='thumb'?1.80:[-1.85,-1.90,-2.20,-2.65][digitIndex-1],physicalBase=toPhysical(base),center=grip.center,r=grip.radius;
        if(grip.horizontal)targetPoint=toLocal([physicalBase[0],center[1]+Math.sin(theta)*r,center[2]+Math.cos(theta)*r]);
        else targetPoint=toLocal([center[0]+(side==='L'?1:-1)*Math.cos(theta)*r,physicalBase[1]-(digit==='thumb'?.012:.003),center[2]+Math.sin(theta)*r]);
        pole=rotate(mul(palmNormal,digit==='thumb'?1:-1),palmQ);
      }else if(grip?.kind==='paper'){
        const physicalBase=toPhysical(base);targetPoint=toLocal([grip.anchor[0]+(digit==='thumb'?-.003:.006),clamp(physicalBase[1],grip.center[1]-.12,grip.center[1]+.12),grip.center[2]+(digit==='thumb'?-.004:.008)]);
        pole=rotate(mul(palmNormal,digit==='thumb'?1:-1),palmQ);
      }else if(grip?.kind==='support'){
        const physicalBase=toPhysical(base);targetPoint=toLocal([clamp(physicalBase[0]+.035,grip.center[0]-.09,grip.center[0]+.08),grip.center[1]-.073,clamp(physicalBase[2]-.015,grip.center[2]-.055,grip.center[2]+.055)]);
      }else{
        const natural=sub(bonesForDigit[2].tail,bonesForDigit[0].head),total=sizes.reduce((a,b)=>a+b,0);targetPoint=add(base,rotate(add(mul(natural,digit==='thumb'?.88:.68),mul(palmNormal,total*.20)),palmQ));
      }
      const finger=fingerChain(base,targetPoint,sizes,pole);
      for(let i=0;i<3;i++)desired.set(bonesForDigit[i].name,{head:finger.points[i],rotation:multiply(between(rotate(sub(bonesForDigit[i].tail,bonesForDigit[i].head),palmQ),sub(finger.points[i+1],finger.points[i])),palmQ)});
      contacts.push({kind:'finger',side,finger:digit,gripped:!!grip,target:targetPoint,point:finger.points[3],physicalTarget:toPhysical(targetPoint),physicalPoint:toPhysical(finger.points[3]),error:finger.error,grip:grip?.kind||null,object:grip?.object||null});
    }
    if(!cached){const inverse=[-palmQ[0],-palmQ[1],-palmQ[2],palmQ[3]];fingerPoseCache.set(cacheKey,{joints:source.filter(b=>/^(thumb|index|middle|ring|little)(_|$)/.test(b.name)&&b.name.endsWith('_'+side)).map(b=>{const entry=desired.get(b.name);return[b.name,{head:rotate(sub(entry.head,solve.end),inverse),rotation:multiply(inverse,entry.rotation)}];}),contacts:contacts.slice(fingerContactStart).map(entry=>({...entry,target:rotate(sub(entry.target,solve.end),inverse),point:rotate(sub(entry.point,solve.end),inverse)}))});}
  }
  // Remaining bones follow their already posed parent.
  for(const b of source)if(!desired.has(b.name)){
    const parent=desired.get(b.parent),rest=bones.get(b.parent);
    const rotation=parent?.rotation||identity;
    desired.set(b.name,parent?{head:add(parent.head,rotate(sub(b.head,rest.head),parent.rotation)),rotation}:{head:b.head,rotation});
  }
  const joints=Object.fromEntries(source.map(b=>{const pose=desired.get(b.name);return[`street_${d.source}_${b.name}`,{translation:sub(pose.head,b.head),rotation:pose.rotation}];}));
  return{joints,hands,contacts,scale,seatY:seated?seat:null,action,progress,pulse,objects,performance,object:d.accessory?{kind:d.accessory,hand:d.accessory==='flask'||d.accessory==='pamphlets'?'L':'R'}:null};
}
export function streetCrowdDescriptor(idOrMesh,frame=null,options={}){const pose=streetCrowdPose(idOrMesh,{...options,frame});return pose?{joints:pose.joints}:null;}

function instanceMatrix(instance){
  if(instance.matrix?.length===16)return Array.from(instance.matrix);
  const yaw=Number(instance.yaw)||0,c=Math.cos(yaw),s=Math.sin(yaw),base=Number(instance.scale)||1,sx=(Number(instance.scaleX)||1)*base,sy=(Number(instance.scaleY)||1)*base,sz=(Number(instance.scaleZ)||1)*base;
  return[c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,Number(instance.x)||0,Number(instance.y)||0,Number(instance.z)||0,1];
}
export function streetCrowdRenderInstance(instance,{actorId=instance?.id,frame=null,timeSec=0,reducedMotion=false,conversation=null}={}){
  if(!instance)return instance;
  const d=streetCrowdDesign(actorId)||streetCrowdDesign(instance.mesh);if(!d)return instance;
  const pose=streetCrowdPose(d.id,{frame,timeSec,reducedMotion,yaw:instance.yaw,conversation}),matrix=instanceMatrix(instance);
  for(let column=0;column<3;column++)for(let row=0;row<3;row++)matrix[column*4+row]*=pose.scale[column];
  return{...instance,mesh:d.mesh,matrix:new Float32Array(matrix),character:{joints:pose.joints}};
}
export function streetCrowdInstances(instances=[],{frames=[],timeSec=0,reducedMotion=false,conversations=null}={}){
  const frameById=new Map((Array.isArray(frames)?frames:[]).map(frame=>[frame.actorId,frame])),out=[];
  for(const instance of instances){
    const d=streetCrowdDesign(instance.id)||streetCrowdDesign(instance.mesh);if(!d||instance.visible===false)continue;
    const conversation=conversations instanceof Map?conversations.get(instance.id):conversations?.[instance.id];
    out.push(streetCrowdRenderInstance(instance,{actorId:d.id,frame:frameById.get(instance.id)||null,timeSec,reducedMotion,conversation}));
    if(d.posture==='seated'||d.accessory==='camera'){
      const extra={...instance,id:instance.id+(d.posture==='seated'?'-chair':'-tripod'),mesh:d.posture==='seated'?'street_crowd_folding_chair':'street_crowd_camera_tripod',matrix:new Float32Array(instanceMatrix(instance)),structural:false};
      delete extra.character;out.push(extra);
    }
  }
  return out;
}
export {STREET_CROWD_DESIGNS,streetCrowdDesign};
