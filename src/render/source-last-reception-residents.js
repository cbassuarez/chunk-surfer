// The Last Reception's residents are ordinary skinned world props. This module
// produces no overlay or separate ghost renderer: colour, shadow/depth and the
// game's pixel-mesh dither all consume the same posed anatomical geometry.
import {SOURCE_LAST_RECEPTION_RESIDENT_DESIGNS as DESIGNS, SOURCE_LAST_RECEPTION_RESIDENT_MESHES} from '../data/source-last-reception-resident-design.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../data/source-last-reception-resident-rigs.js';
export {SOURCE_LAST_RECEPTION_RESIDENT_MESHES};

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),length=v=>Math.hypot(...v),unit=v=>mul(v,1/(length(v)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const I=[0,0,0,1],axis=(a,n)=>[...mul(unit(a),Math.sin(n/2)),Math.cos(n/2)];
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const rotate=(v,q)=>{const a=q.slice(0,3),t=mul(cross(a,v),2);return add(v,add(mul(t,q[3]),cross(a,t)));};
function between(a,b){const u=unit(a),v=unit(b),d=Math.max(-1,Math.min(1,dot(u,v)));if(d<-.999999)return [...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0];return unit([...cross(u,v),1+d]);}
function solveChain(start,target,a,b,pole){const distance=Math.max(Math.abs(a-b)+.00001,Math.min(a+b-.00001,length(sub(target,start)))),direction=unit(sub(target,start)),end=add(start,mul(direction,distance)),along=(a*a-b*b+distance*distance)/(2*distance);let side=sub(pole,mul(direction,dot(direction,pole)));if(length(side)<1e-6)side=cross(direction,[0,0,1]);return{middle:add(add(start,mul(direction,along)),mul(unit(side),Math.sqrt(Math.max(0,a*a-along*along)))),end,error:length(sub(end,target))};}
const rigMaps=Object.fromEntries(Object.entries(RIGS).map(([kind,bones])=>[kind,new Map(bones.map(b=>[b.name,b]))]));
const idleHands={
 welcome:side=>side==='L'?[-.20,1.08,-.23]:[.18,.99,-.06],
 folded:side=>[side==='L'?-.055:.065,1.04,-.19],
 argument:side=>side==='R'?[.20,1.22,-.28]:[-.19,.99,-.09],
 window:side=>[side==='L'?-.18:.21,1.02,-.20],
 quiet:side=>side==='L'?[-.17,.99,-.13]:[.12,1.16,-.19],
 rail:side=>[side==='L'?-.23:.23,1.02,-.25],
 lap:side=>[side==='L'?-.13:.13,.63,-.20],
};

/** Pure saved-clock performance. `distance` is accumulated navigation travel,
 * so pausing and reload do not advance the gait. Root navigation owns position;
 * the pose only bends limbs, shifts weight and directs the residents' attention.
 */
export function sourceLastReceptionResidentPose(id,frame={}, {reducedMotion=false}={}){
 const d=DESIGNS[id];if(!d)throw Error('Unknown Last Reception resident '+id);
 const bones=rigMaps[d.source],rest=RIGS[d.source],pelvis=bones.get('pelvis').head;
 const elapsed=Number(frame.elapsed)||0,speed=Math.max(0,Number(frame.speed)||0),moving=frame.mode==='walk'&&speed>.015;
 const phase=Number.isFinite(frame.distance)?frame.distance/.78*Math.PI*2:elapsed*Math.min(speed,1.8)/.78*Math.PI*2;
 const seat=frame.mode==='imprint'||id==='imprint'?1:frame.mode==='seated'?1-clamp(frame.rise??0):Number.isFinite(frame.rise)?1-clamp(frame.rise):0;
 const attention=clamp(frame.attention),reach=frame.mode==='reach'?1:clamp(frame.reach),walk=moving?1:0;
 const breath=reducedMotion||id==='imprint'?0:Math.sin(elapsed*1.17+d.seed)*.0025;
 const lift=seat*(.565-pelvis[1])+breath-(moving?.040*walk+.008*Math.abs(Math.sin(phase)):0);
 const lean=d.lean+(seat?.11*seat:0)+(reach?.055*reach:0),bodyQ=qmul(axis([0,0,1],d.sideLean*(1-seat)),axis([1,0,0],-lean));
 const shift=[d.sideLean*.16*(1-seat),lift,seat*.025],desired=new Map(),transforms=new Map(),contacts=[];
 const body=p=>add(add(pelvis,rotate(sub(p,pelvis),bodyQ)),shift),put=(name,head,tail)=>desired.set(name,{head,tail});
 for(const name of ['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head','jaw','clavicle_L','clavicle_R']){const b=bones.get(name);put(name,body(b.head),body(b.tail));}
 const head=desired.get('head'),headQ=qmul(bodyQ,qmul(axis([0,1,0],d.headYaw*(1-attention)),axis([1,0,0],seat?.09:-.025*attention))),restHead=bones.get('head'),restJaw=bones.get('jaw');head.tail=add(head.head,rotate(sub(restHead.tail,restHead.head),headQ));
 put('jaw',add(head.head,rotate(sub(restJaw.head,restHead.head),headQ)),add(head.head,rotate(sub(restJaw.tail,restHead.head),headQ)));
 for(const[side,sign]of[['L',-1],['R',1]]){
  const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side),toe=bones.get('toe_'+side),p=phase+(side==='L'?0:Math.PI),cycle=p/(Math.PI*2)-Math.floor(p/(Math.PI*2)),planted=cycle<.60,u=clamp((cycle-.60)/.40),swing=planted?0:Math.sin(Math.PI*u),ease=u*u*(3-2*u);
  const standing=[sign*(.13+(d.width-1)*.02),foot.head[1],side==='L'?.025:-.045];
  // During stance the local foot moves backward by exactly the root's traveled
  // distance. Its world contact therefore stays put, even at the slow approach
  // speed. The other foot lifts and returns, rather than skating on a sine wave.
  const footZ=planted?(cycle-.30)*.78:.234-.468*ease;
  const walking=[sign*.135,foot.head[1]+swing*.055,footZ];
  const seated=[sign*.15,foot.head[1],-.37+(side==='L'?.025:0)],ankle=mix(mix(standing,walking,walk),seated,seat),hip=add(thigh.head,shift);
  const leg=solveChain(hip,ankle,length(sub(thigh.tail,thigh.head)),length(sub(shin.tail,shin.head)),[sign*.08,0,-1]);
  put(thigh.name,hip,leg.middle);put(shin.name,leg.middle,leg.end);
  const footQ=axis([1,0,0],moving?-.06*Math.sin(p):0);put(foot.name,leg.end,add(leg.end,rotate(sub(foot.tail,foot.head),footQ)));put(toe.name,add(leg.end,rotate(sub(toe.head,foot.head),footQ)),add(leg.end,rotate(sub(toe.tail,foot.head),footQ)));
  contacts.push({kind:'leg',side,hip,knee:leg.middle,ankle:leg.end,target:ankle,planted:moving&&planted,error:leg.error});
  const upper=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=body(upper.head),scale=mastersHeight(d.source)/1.78;
  const held=mul((idleHands[d.hands]||idleHands.quiet)(side),scale),walkingHand=[sign*.185,1.00,-.035+Math.cos(p)*.11*walk];
  let wrist=mix(held,walkingHand,walk);wrist=mix(wrist,[sign*.13,.63,-.20],seat);wrist=mix(wrist,[sign*(.15+(side==='R'?.02:0)),1.16,-.43],reach);
  const arm=solveChain(shoulder,wrist,length(sub(upper.tail,upper.head)),length(sub(fore.tail,fore.head)),[sign*.7,-.4,.35]);
  put(upper.name,shoulder,arm.middle);put(fore.name,arm.middle,arm.end);
  const handDirection=unit(reach?[sign*.04,-.15,-1]:seat?[sign*.05,-.18,-1]:d.hands==='welcome'&&side==='L'?[-.1,.15,-1]:[0,-1,-.30]);
  put(hand.name,arm.end,add(arm.end,mul(handDirection,length(sub(hand.tail,hand.head)))));
  contacts.push({kind:'arm',side,shoulder,elbow:arm.middle,wrist:arm.end,target:wrist,error:arm.error});
 }
 // Flat anatomical bind joints allow each desired world-space segment to be
 // sampled identically by the main and depth-only character shaders.
 for(const bone of rest){const pose=desired.get(bone.name);if(pose){const q=bone.name==='head'||bone.name==='jaw'?headQ:between(sub(bone.tail,bone.head),sub(pose.tail,pose.head));transforms.set(bone.name,{head:pose.head,rotation:q,offset:sub(pose.head,rotate(bone.head,q))});}else{const parent=transforms.get(bone.parent)||transforms.get('head');transforms.set(bone.name,{head:add(rotate(bone.head,parent.rotation),parent.offset),rotation:parent.rotation,offset:parent.offset});}}
 // Fingers keep their anatomical knuckles. Open reaching palms are uneven and
 // relaxed; the imprint freezes with hands resting on its own knees.
 for(const side of['L','R'])for(const[digit,index]of['thumb','index','middle','ring','little'].map((name,i)=>[name,i]))for(const[suffix,segment]of[['',0],['_mid',1],['_tip',2]]){const name=digit+suffix+'_'+side,bone=bones.get(name),pose=transforms.get(name);if(!bone||!pose)continue;const curl=(reach?.035:seat?.13:.20)+(index===0?-.06:index*.012);const q=qmul(pose.rotation,axis([1,0,0],curl*(segment?1:.6)));const parent=transforms.get(bone.parent);const point=parent?add(rotate(bone.head,parent.rotation),parent.offset):pose.head;transforms.set(name,{head:point,rotation:q,offset:sub(point,rotate(bone.head,q))});}
 const joints=Object.fromEntries([...transforms].map(([name,pose])=>[`reception_${d.source}_${name}`,{translation:sub(pose.head,bones.get(name).head),rotation:pose.rotation}]));
 return{id,joints,contacts,seat,walk,reach,phase};
}
const mastersHeight=kind=>kind==='male'?1.78:1.70;

/** `frame.residents` and optional `frame.imprint` use Source-local metres.
 * Runtime headings face +Z; source masters face -Z. This is the only conversion.
 */
export function sourceLastReceptionResidentInstances(frame={}, {origin={x:0,z:0},zone=0,reducedMotion=false,timeSec=0}={}){
 const residents=Array.isArray(frame)?frame:frame.residents||[],imprint=!Array.isArray(frame)&&frame.imprint;
 // Runtime includes its retained imprint in residents and also reports a
 // boolean status. Only a separately positioned object is an extra actor.
 const all=imprint&&typeof imprint==='object'&&!residents.some(actor=>actor?.id==='imprint')?[...residents,{...imprint,id:'imprint',mode:'imprint'}]:residents;
 return all.filter(actor=>actor&&DESIGNS[actor.id]&&actor.visible!==false).map(actor=>{
  const d=DESIGNS[actor.id],yaw=Math.PI-(Number(actor.yaw)||0),x=(Number(actor.x)||0)+(Number(origin.x)||0)+(Number(actor.seatOffset?.x)||0),y=Number(actor.y)||0,z=(Number(actor.z)||0)+(Number(origin.z)||0)+(Number(actor.seatOffset?.z)||0),sx=d.width,sy=d.height/mastersHeight(d.source),boundary=clamp(actor.boundaryWeight??(actor.boundary?1:0)),sz=d.depth*(1-boundary*.975),c=Math.cos(yaw),s=Math.sin(yaw);
  const matrix=new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);
  const pose=sourceLastReceptionResidentPose(actor.id,{...actor,elapsed:Number.isFinite(actor.elapsed)?actor.elapsed:Number(frame.elapsed)||timeSec},{reducedMotion});
  return{id:'source-last-reception-'+actor.id,mesh:d.mesh,x,y,z,yaw,matrix,zone,structural:false,character:{joints:pose.joints},receptionResident:actor.id};
 });
}
