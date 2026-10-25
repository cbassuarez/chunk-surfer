// Route distance owns stride/crank phase. This replaces only the two old
// presentation figures; collision, visibility, pauses and routes stay upstream.
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../data/source-last-reception-resident-rigs.js';
import {streetCrowdDesign} from '../data/street-crowd-characters.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const I=[0,0,0,1],qa=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)],qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]],rot=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
function between(a,b){const u=unit(a),v=unit(b),d=dot(u,v);return d<-.99999?[...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(u,v),1+d]);}
function oriented(from,normal,to,toNormal){const swing=between(from,to),axis=unit(to),project=v=>unit(sub(v,mul(axis,dot(v,axis)))),a=project(rot(normal,swing)),b=project(toNormal);return qm(qa(axis,Math.atan2(dot(axis,cross(a,b)),dot(a,b))),swing);}
function twoBone(start,target,a,b,pole){const delta=sub(target,start),d=clamp(len(delta),Math.abs(a-b)+1e-6,a+b-1e-6),axis=unit(delta),along=(a*a-b*b+d*d)/(2*d);let n=sub(pole,mul(axis,dot(pole,axis)));if(len(n)<1e-6)n=cross(axis,[0,0,1]);const end=add(start,mul(axis,d));return{middle:add(add(start,mul(axis,along)),mul(unit(n),Math.sqrt(Math.max(0,a*a-along*along)))),end,error:len(sub(end,target))};}
function fingerChain(base,target,sizes,pole){const total=sizes.reduce((a,b)=>a+b,0),delta=sub(target,base),distance=len(delta),axis=unit(delta),normal=unit(sub(pole,mul(axis,dot(pole,axis))));let points=[base],along=0;for(const size of sizes){along+=size;points.push(add(add(base,mul(axis,Math.min(distance,total)*along/total)),mul(normal,Math.sin(Math.PI*along/total)*total*.28)));}if(distance>=total){points=[base];for(const size of sizes)points.push(add(points.at(-1),mul(axis,size)));}else for(let iteration=0;iteration<48;iteration++){points[3]=target;for(let i=2;i>=0;i--)points[i]=add(points[i+1],mul(unit(sub(points[i],points[i+1])),sizes[i]));points[0]=base;for(let i=0;i<3;i++)points[i+1]=add(points[i],mul(unit(sub(points[i+1],points[i])),sizes[i]));if(len(sub(points[3],target))<1e-6)break;}return{points,error:len(sub(points[3],target))};}
const source=RIGS.male,bones=new Map(source.map(b=>[b.name,b])),bone=name=>bones.get(name),digits=['thumb','index','middle','ring','little'];
const identify=value=>value==='ambient_cyclist'||value==='cyclist'?'cyclist':value==='ambient_dog_walker'||value==='dog-walker'?'dog-walker':null;
export const EXTERIOR_AMBIENT_PEOPLE_PROP_PACK='/assets/exterior-ambient-people-props.glb';
export const EXTERIOR_AMBIENT_PEOPLE_MESHES=Object.freeze(['exterior_cycle_equipment','exterior_walker_dog','exterior_cycle_crank']);

// Crank origin and pedal centres are the literal support-pack construction.
export function exteriorCyclePedals(phase=0){return Object.fromEntries([['L',-.18,.17],['R',.18,-.17]].map(([side,x,z])=>[side,[x,.39-Math.sin(phase)*z,Math.cos(phase)*z]]));}

export function exteriorAmbientPeoplePose(kind,{travelMetres=0,speedMps=0,timeSec=0,reducedMotion=false}={}){
  kind=identify(kind);if(!kind)return null;
  const rider=kind==='cyclist',design=streetCrowdDesign(rider?'district-pub-driver':'district-mews-neighbor'),scale=[design.width,design.height/1.78,design.depth],local=p=>p.map((v,i)=>v/scale[i]),physical=p=>p.map((v,i)=>v*scale[i]);
  const distance=Math.max(0,Number(travelMetres)||0),speed=Math.max(0,Number(speedMps)||0),phase=distance/(rider?4.10:1.30)*Math.PI*2,activity=clamp(speed/.45,0,1),poses=new Map(),contacts=[],hands={};
  const put=(name,head,rotation=I)=>poses.set(name,{head,rotation}),segment=(name,head,tail)=>put(name,head,between(sub(bone(name).tail,bone(name).head),sub(tail,head)));
  const pelvis=bone('pelvis').head,pelvisTarget=local(rider?[0,1.11,.10]:[0,.88,-.007]),shift=sub(pelvisTarget,pelvis),bodyQ=qa([1,0,0],rider?-.65:-.065),upper=p=>add(add(pelvis,rot(sub(p,pelvis),bodyQ)),shift);
  for(const name of ['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','clavicle_L','clavicle_R'])put(name,upper(bone(name).head),bodyQ);
  const headQ=qm(bodyQ,qa([1,0,0],rider?.52:.025)),head=upper(bone('head').head);put('head',head,headQ);put('jaw',add(head,rot(sub(bone('jaw').head,bone('head').head),headQ)),headQ);
  const pedals=exteriorCyclePedals(phase),feet={};
  for(const [side,sign]of [['L',-1],['R',1]]){
    const thigh=bone('thigh_'+side),shin=bone('shin_'+side),foot=bone('foot_'+side),toe=bone('toe_'+side),hip=add(thigh.head,shift);let ankle,footQ=I,stance=true,pedal=null;
    if(rider){
      // Body faces -Z and the equipment +Z. Side labels swap under that half
      // turn, so each anatomical foot stays on the corresponding physical side.
      pedal=pedals[side==='L'?'R':'L'];
      // The ball of the shoe (the retained toe joint) stays over the pedal,
      // rather than pinning an ankle and letting the shoe miss the platform.
      const shoeOffset=physical(sub(toe.head,foot.head));
      ankle=local(sub([-pedal[0],pedal[1]+.04,-pedal[2]],shoeOffset));
    }else{
      const at=((distance/1.30+(side==='R'?.5:0))%1+1)%1,stanceFraction=.54,span=1.30*stanceFraction;
      stance=at<stanceFraction;const p=stance?at/stanceFraction:(at-stanceFraction)/(1-stanceFraction);
      const z=stance?-span/2+span*p:span/2-span*(p*p*(3-2*p));
      // During stance local Z retreats exactly as far as the route root
      // advances. Swing clears the pavement; no sinusoidal skating foot.
      ankle=local([sign*.15,.073+(stance?0:.085*Math.sin(Math.PI*p)),z]);
      if(!stance)footQ=qa([1,0,0],-.14*Math.sin(Math.PI*p));
    }
    const leg=twoBone(hip,ankle,len(sub(thigh.tail,thigh.head)),len(sub(shin.tail,shin.head)),[sign*.12,0,-1]);
    segment(thigh.name,hip,leg.middle);segment(shin.name,leg.middle,leg.end);put(foot.name,leg.end,footQ);put(toe.name,add(leg.end,rot(sub(toe.head,foot.head),footQ)),footQ);
    feet[side]={ankle:physical(leg.end),sole:physical(add(leg.end,rot(sub(toe.head,foot.head),footQ))),stance,pedal};contacts.push({kind:rider?'pedal':'ground',side,target:physical(ankle),point:physical(leg.end),error:leg.error,stance,pedal});
  }
  for(const [side,sign]of [['L',-1],['R',1]]){
    const arm=bone('upperarm_'+side),fore=bone('forearm_'+side),hand=bone('hand_'+side),links=digit=>['','_mid','_tip'].map(s=>bone(digit+s+'_'+side)),axis=unit(sub(links('middle')[2].tail,hand.head)),normal=unit(mul(cross(axis,sub(bone('little_'+side).head,bone('index_'+side).head)),sign));
    const handlebar=rider,gripped=rider||side==='L',center=handlebar?[sign*.22,1.02,-.52]:[-.17,.865,-.075];
    let wrist=handlebar?add(center,[0,.055,.067]):side==='L'?[-.17,.92,-.02]:[.23,.85,-.05-.095*Math.sin(phase)*activity];
    const palmQ=oriented(axis,normal,[sign*.04,-.48,-.8773],handlebar?[0,-1,0]:[side==='L'?1:-1,0,0]),shoulder=upper(arm.head),solve=twoBone(shoulder,local(wrist),len(sub(arm.tail,arm.head)),len(sub(fore.tail,fore.head)),[sign*.45,-.40,rider?.10:.25]);
    segment(arm.name,shoulder,solve.middle);segment(fore.name,solve.middle,solve.end);put(hand.name,solve.end,palmQ);hands[side]=physical(solve.end);contacts.push({kind:'wrist',side,target:wrist,point:hands[side],error:solve.error,gripped});
    for(const [index,digit]of digits.entries()){
      const chain=links(digit),base=add(solve.end,rot(sub(chain[0].head,hand.head),palmQ)),sizes=chain.map(b=>len(sub(b.tail,b.head))),physicalBase=physical(base);let target;
      if(gripped){const theta=digit==='thumb'?1.80:[-1.85,-1.90,-2.20,-2.65][index-1],radius=handlebar?.016:.006;
        target=local(handlebar?[physicalBase[0],center[1]+Math.sin(theta)*radius,center[2]+Math.cos(theta)*radius]:[center[0]+Math.cos(theta)*radius,physicalBase[1]-(digit==='thumb'?.012:.003),center[2]+Math.sin(theta)*radius]);
      }else{const natural=sub(chain[2].tail,chain[0].head);target=add(base,rot(add(mul(natural,digit==='thumb'?.88:.68),mul(normal,sizes.reduce((a,b)=>a+b,0)*.20)),palmQ));}
      const solveFinger=fingerChain(base,target,sizes,rot(mul(normal,digit==='thumb'?1:-1),palmQ));
      for(let i=0;i<3;i++)put(chain[i].name,solveFinger.points[i],qm(between(rot(sub(chain[i].tail,chain[i].head),palmQ),sub(solveFinger.points[i+1],solveFinger.points[i])),palmQ));
      contacts.push({kind:'finger',side,finger:digit,gripped,target:physical(target),point:physical(solveFinger.points[3]),error:solveFinger.error});
    }
  }
  for(const b of source)if(!poses.has(b.name)){const parent=poses.get(b.parent);put(b.name,parent?add(parent.head,rot(sub(b.head,bone(b.parent).head),parent.rotation)):b.head,parent?.rotation||I);}
  const joints=Object.fromEntries(source.map(b=>{const p=poses.get(b.name);return['street_male_'+b.name,{translation:sub(p.head,b.head),rotation:p.rotation}];}));
  return{kind,mesh:design.mesh,scale,joints,contacts,hands,feet,phase,travelMetres:distance,speedMps:speed,rootOffset:rider?[0,0,0]:[-.32,0,0]};
}

function matrix(instance){if(instance.matrix?.length===16)return Array.from(instance.matrix);const a=Number(instance.yaw)||0,c=Math.cos(a),s=Math.sin(a),size=Number(instance.scale)||1;return[c*size,0,s*size,0,0,size,0,0,-s*size,0,c*size,0,Number(instance.x)||0,Number(instance.y)||0,Number(instance.z)||0,1];}
const product=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,column=Math.floor(i/4);let v=0;for(let k=0;k<4;k++)v+=a[k*4+row]*b[column*4+k];return v;});
const translation=p=>[1,0,0,0,0,1,0,0,0,0,1,0,...p,1];
const poseCache=new Map();
export function exteriorAmbientPeopleInstances(instance,{timeSec=0,reducedMotion=false,ready=true}={}){
  const kind=identify(instance?.mesh);if(!kind||!ready)return instance?[instance]:[];
  // One latest solve per mover; route samples are kept exact, so the crank,
  // foot contacts and root can never disagree at a quantization boundary.
  const key=JSON.stringify([instance.travelMetres,instance.speedMps,reducedMotion]),cached=poseCache.get(kind);
  const pose=cached?.key===key?cached.pose:exteriorAmbientPeoplePose(kind,{travelMetres:instance.travelMetres,speedMps:instance.speedMps,timeSec,reducedMotion});poseCache.set(kind,{key,pose});
  const base=matrix(instance),equipment={...instance,mesh:kind==='cyclist'?'exterior_cycle_equipment':'exterior_walker_dog'},halfTurn=[-pose.scale[0],0,0,0,0,pose.scale[1],0,0,0,0,-pose.scale[2],0,0,0,0,1];
  const body={...instance,id:instance.id+'-person',mesh:pose.mesh,matrix:new Float32Array(product(product(base,translation(pose.rootOffset)),halfTurn)),character:{joints:pose.joints}};
  const out=[equipment,body];
  if(kind==='cyclist'){const c=Math.cos(pose.phase),s=Math.sin(pose.phase),rx=[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];out.push({...instance,id:instance.id+'-crank',mesh:'exterior_cycle_crank',matrix:new Float32Array(product(product(base,translation([0,.39,0])),rx))});}
  return out;
}
