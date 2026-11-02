// Student-strike performances use the existing native skin/depth/shadow path.
// Contact and withdrawal are world-targeted; the actor root and feet stay planted.
import {ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS, ACADEMIC_FLOOR_POPULATION_DESIGNS as DESIGNS} from '../data/academic-society-character-design.js';
import {sourceLastReceptionResidentPose} from './source-last-reception-residents.js';

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n);
const mix=(a,b,u)=>a.map((v,k)=>v+(b[k]-v)*u),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1));
const smooth=v=>{const u=clamp(v);return u*u*u*(10+u*(-15+6*u));};
const progress=(t,span)=>smooth((t-span[0])/(span[1]-span[0]));
const axis=(v,n)=>[...mul(unit(v),Math.sin(n/2)),Math.cos(n/2)];
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const between=(a,b)=>{const u=unit(a),v=unit(b),d=clamp(dot(u,v),-1,1);return d<-.999999?[...unit(cross(u,Math.abs(u[0])<.8?[1,0,0]:[0,1,0])),0]:unit([...cross(u,v),1+d]);};
const qmix=(a,b,u)=>{const end=dot(a,b)<0?mul(b,-1):b;return unit(mix(a,end,u));};
const maps=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,new Map(bones.map(b=>[b.name,b]))]));
const branches=Object.fromEntries(Object.entries(RIGS).map(([source,bones])=>[source,Object.fromEntries(bones.map(root=>[root.name,bones.filter(b=>{for(let n=b;n;n=maps[source].get(n.parent))if(n.name===root.name)return true;return false;}).map(b=>b.name)]))]));

// Actual native skin vertices, each weighted1.0 to its index-tip bone. The CPU
// receipt verifies the vertex, weight and pack hash; this is not a knuckle or
// abstract contact point substituted for the rendered hand.
export const STRIKE_SKIN_CONTACT_MARKERS=Object.freeze({
  male:{L:{primitive:0,vertex:1152,bone:'index_tip_L',point:[-.5204240083694458,1.018615961074829,-.37165600061416626]},R:{primitive:0,vertex:4285,bone:'index_tip_R',point:[.5204240083694458,1.018615961074829,-.37165600061416626]}},
  female:{L:{primitive:0,vertex:1311,bone:'index_tip_L',point:[-.4813689887523651,.9582160115242004,-.35719698667526245]},R:{primitive:0,vertex:4541,bone:'index_tip_R',point:[.4813689887523651,.9582160115242004,-.35719698667526245]}}
});

export const STRIKE_PERFORMANCE_SITES=Object.freeze({
  pianist:{root:[53.98,10,4.4],yaw:-2.0,peerRoot:[53.1,10,5.75],peerYaw:.5779725372994283,
    keyboardTopY:10.762499988079071,keyboardContact:{L:[53.55,10.772499988079071,4.55],R:[53.55,10.772499988079071,4.25]},
    note:'Existing seated native pose on the west end of the actual bench; index ready markers10mm above white-key top with the whole hand clear, no depressed-key or played-note claim.'},
  meal:{deskRoot:[60.8,10,5.6],deskYaw:Math.PI,desktopTopY:10.71749997138977,
    plateStart:[60.90,10.717499949932098,5.55],plateEnd:[60.80,10.717499949932098,5.55],
    giverRoot:[61.25,10,5.72],giverYaw:-Math.PI/2,
    note:'Plate base stays on the actual desktop. Giver uses a fixed native partial seated/knee-bend pose to reach the low desktop; neither feet nor root travel during the slide.'}
});

function worldPoint(matrix,p){return[0,1,2].map(k=>matrix[k]*p[0]+matrix[k+4]*p[1]+matrix[k+8]*p[2]+matrix[k+12]);}
function worldVector(matrix,p){return[0,1,2].map(k=>matrix[k]*p[0]+matrix[k+4]*p[1]+matrix[k+8]*p[2]);}
function localVector(matrix,p){return[0,1,2].map(k=>{const v=[matrix[k*4],matrix[k*4+1],matrix[k*4+2]];return dot(p,v)/dot(v,v);});}
function localPoint(matrix,p){return localVector(matrix,sub(p,[matrix[12],matrix[13],matrix[14]]));}
function solveChain(start,target,a,b,pole){
  const requested=length(sub(target,start)),distance=clamp(requested,Math.abs(a-b)+.00001,a+b-.00001),direction=unit(sub(target,start));
  let side=sub(pole,mul(direction,dot(pole,direction)));if(length(side)<1e-7)side=cross(direction,[0,0,1]);
  const along=(a*a-b*b+distance*distance)/(2*distance);
  return{elbow:add(add(start,mul(direction,along)),mul(unit(side),Math.sqrt(Math.max(0,a*a-along*along)))),wrist:add(start,mul(direction,distance)),requested,error:Math.abs(requested-distance)};
}
function nativeBasePose(source,{seconds=0,seated=0,speaking=false}={}){
  const result=sourceLastReceptionResidentPose(source==='male'?'host':'guest-a',{elapsed:seconds,attention:1,mode:seated===1?'seated':'idle',...(seated>0&&seated<1?{rise:1-seated}:{})});
  const joints=Object.fromEntries(Object.entries(result.joints).map(([name,joint])=>[name.replace(/^reception_(male|female)_/,`society_${source}_`),{translation:[...joint.translation],rotation:[...joint.rotation]}]));
  if(speaking){const jaw=joints[`society_${source}_jaw`],angle=.025+.055*Math.abs(Math.sin(seconds*11.7));jaw.rotation=qmul(jaw.rotation,axis([1,0,0],angle));}
  return joints;
}
function openNativeFingers(joints,source,seconds){
  // Transfer the existing native reach pose's relaxed/open finger posture into
  // the seated hand frame. Reusing curled lap fingers over a keyboard would
  // drive the ring/little fingers through its shelf even with a correct index.
  const reach=sourceLastReceptionResidentPose(source==='male'?'host':'guest-a',{elapsed:seconds,attention:1,mode:'reach'}).joints;
  const bones=maps[source],key=n=>`society_${source}_${n}`,reachKey=n=>`reception_${source}_${n}`;
  const point=(pose,k,n)=>add(bones.get(n).head,pose[k(n)].translation);
  for(const side of ['L','R']){
    const hand=`hand_${side}`,oldWrist=point(reach,reachKey,hand),newWrist=point(joints,key,hand),delta=qmul(joints[key(hand)].rotation,inverse(reach[reachKey(hand)].rotation));
    for(const name of branches[source][hand].filter(n=>n!==hand)){
      const r=reach[reachKey(name)];joints[key(name)]={translation:sub(add(newWrist,rotate(sub(point(reach,reachKey,name),oldWrist),delta)),bones.get(name).head),rotation:qmul(delta,r.rotation)};
    }
  }
}
function context(instance,joints,source){
  const bones=maps[source],key=name=>`society_${source}_${name}`;
  const point=name=>add(bones.get(name).head,joints[key(name)].translation);
  const set=(name,p,q)=>joints[key(name)]={translation:sub(p,bones.get(name).head),rotation:q};
  const marker=side=>{const m=STRIKE_SKIN_CONTACT_MARKERS[source][side],bone=bones.get(m.bone),joint=joints[key(m.bone)];return add(point(m.bone),rotate(sub(m.point,bone.head),joint.rotation));};
  const branch=(name,q)=>{const pivot=point(name);for(const b of branches[source][name]){const joint=joints[key(b)];set(b,add(pivot,rotate(sub(point(b),pivot),q)),qmul(q,joint.rotation));}};
  return{bones,key,point,set,marker,branch,matrix:instance.matrix,joints,source};
}
function handTarget(ctx,{side,targetWorld,directionWorld,weight=1,kind,palmFrame=false}){
  if(weight<=1e-8)return{side,kind,active:false,weight:0};
  const {bones,key,point,set,marker,matrix,joints,source}=ctx;
  const upper=bones.get(`upperarm_${side}`),fore=bones.get(`forearm_${side}`),hand=bones.get(`hand_${side}`);
  const currentWrist=point(hand.name),oldQ=joints[key(hand.name)].rotation;
  let directedQ=between(sub(hand.tail,hand.head),localVector(matrix,directionWorld));
  if(palmFrame){
    // A hand bone supplies only one axis. Align its actual palm/knuckle plane as
    // well; otherwise an arbitrary roll leaves ring/little fingers in the keys.
    const forward=sub(bones.get(`middle_${side}`).head,hand.head),across=sub(bones.get(`index_${side}`).head,bones.get(`little_${side}`).head);
    const desired=unit(localVector(matrix,directionWorld)),desiredAcross=localVector(matrix,side==='L'?[0,0,-1]:[0,0,1]);
    const first=between(forward,desired),row=rotate(across,first),a=unit(sub(row,mul(desired,dot(row,desired)))),b=unit(sub(desiredAcross,mul(desired,dot(desiredAcross,desired))));
    directedQ=qmul(axis(desired,Math.atan2(dot(desired,cross(a,b)),dot(a,b))),first);
  }
  const q=qmix(oldQ,directedQ,weight),delta=qmul(q,inverse(oldQ));
  const target=mix(marker(side),localPoint(matrix,targetWorld),weight),markerOffset=rotate(sub(marker(side),currentWrist),delta);
  const wristTarget=sub(target,markerOffset),shoulder=point(upper.name),arm=solveChain(shoulder,wristTarget,length(sub(upper.tail,upper.head)),length(sub(fore.tail,fore.head)),[side==='L'?-.7:.7,-.4,.35]);
  const worldError=length(worldVector(matrix,sub(arm.wrist,wristTarget)));
  if(worldError>.002)throw Error(`Strike ${kind} ${side} contact is unreachable (${worldError.toFixed(4)}m); revise blocking instead of stretching the rig.`);
  for(const name of branches[source][hand.name]){const joint=joints[key(name)];set(name,add(arm.wrist,rotate(sub(point(name),currentWrist),delta)),qmul(delta,joint.rotation));}
  set(upper.name,shoulder,between(sub(upper.tail,upper.head),sub(arm.elbow,shoulder)));
  set(fore.name,arm.elbow,between(sub(fore.tail,fore.head),sub(arm.wrist,arm.elbow)));
  const actualWorld=worldPoint(matrix,marker(side)),requestedWorld=worldPoint(matrix,target);
  return{side,kind,active:true,weight,requestedWorld,actualWorld,errorM:length(sub(actualWorld,requestedWorld)),worldReachErrorM:worldError,
    shoulderWorld:worldPoint(matrix,shoulder),elbowWorld:worldPoint(matrix,arm.elbow),wristWorld:worldPoint(matrix,arm.wrist),
    upperLengthM:length(sub(upper.tail,upper.head)),foreLengthM:length(sub(fore.tail,fore.head)),skinMarker:STRIKE_SKIN_CONTACT_MARKERS[source][side]};
}

/** One supported10cm plate slide. The native ceramic east-rim vertex is the
 * fingertip target. It stays on the desk, pauses after the offer, then the hand
 * withdraws while the food remains available. No grip/lift simulation claimed. */
export function sampleStrikePlateOffer(seconds,{start=STRIKE_PERFORMANCE_SITES.meal.plateStart,end=STRIKE_PERFORMANCE_SITES.meal.plateEnd,
  approach=[0,.75],slide=[.75,2.2],release=[3.0,4.5]}={}){
  const position=mix(start,end,progress(seconds,slide));
  const reachWeight=progress(seconds,approach),released=progress(seconds,release),weight=reachWeight*(1-released);
  const contactOffset=[.14500005722045906,.009000024795532191,-9.536743306171047e-8];
  const contactWorld=add(position,contactOffset);
  // First lift off the rim, then move to the giver's side of the table. Letting
  // an IK weight decay back to the borrowed lap pose leaves the hand hovering
  // over the plate; this target remains visibly clear after contact has ended.
  const lift=progress(seconds,[release[0],release[0]+(release[1]-release[0])*.45]);
  const retreat=progress(seconds,[release[0]+(release[1]-release[0])*.35,release[1]]);
  const handWorld=add(contactWorld,[.20*retreat,.15*lift+.04*retreat,.16*retreat]);
  return{position,contactWorld,handWorld,reachWeight,released,weight,contactOffset,
    supportY:STRIKE_PERFORMANCE_SITES.meal.desktopTopY,phase:seconds<approach[1]?'approach':seconds<slide[1]?'slide':seconds<release[0]?'offered':seconds<release[1]?'withdraw':'released'};
}

// Lift clear of the keys before retreating, and only then lower to the lap.
// A direct interpolation to the lap would pass through the keyboard shelf.
export function sampleStrikeKeyboardRefusal(seconds,{contact=STRIKE_PERFORMANCE_SITES.pianist.keyboardContact,
  lift=[.65,1.10],retreat=[1.10,1.75],settle=[1.75,2.25]}={}){
  const up=progress(seconds,lift),back=progress(seconds,retreat),weight=1-progress(seconds,settle);
  return{targets:Object.fromEntries(['L','R'].map(side=>[side,add(contact[side],[.20*back,.065*up,0])])),weight,
    phase:seconds<lift[0]?'ready':seconds<lift[1]?'lift':seconds<retreat[1]?'retreat':seconds<settle[1]?'settle':'withdrawn'};
}

/** Apply to each native character instance after academicFloorPopulationInstances.
 * Config seconds is an action clock, not wall time. Root can retain the final
 * action state over later cuts by passing a clamped/persistent action clock.
 * No input, scene, audio, camera, progression or production state is owned here. */
export function articulateStrikeActor(instance,{kind,seconds=0,clockSeconds=seconds,speaking=false,withdraw=[.65,2.25],turn=[1.8,3.7],
  torsoTurnRad=-.35,headTurnRad=-.214,keyboardContact=STRIKE_PERFORMANCE_SITES.pianist.keyboardContact,plateOptions={}}={}){
  const design=Object.values(DESIGNS).find(d=>d.mesh===instance.mesh);
  if(!design||design.hollow||!instance.character?.joints||!instance.matrix)throw Error('Strike articulation requires an ordinary native population body with a world matrix.');
  if(!['keyboard-refusal','plate-offer'].includes(kind))throw Error('Unknown bounded strike action '+kind);
  if(Math.abs(torsoTurnRad)>Math.PI/4||Math.abs(headTurnRad)>.35)throw Error('Strike articulation exceeds its economical torso/head limits.');
  const seated=kind==='keyboard-refusal'?1:.28,joints=nativeBasePose(design.source,{seconds:clockSeconds,seated,speaking});
  if(kind==='keyboard-refusal')openNativeFingers(joints,design.source,clockSeconds);
  const ctx=context(instance,joints,design.source),contacts=[];
  let plate=null,torsoYaw=0,headYaw=0;
  if(kind==='keyboard-refusal'){
    torsoYaw=torsoTurnRad*progress(seconds,turn);headYaw=headTurnRad*progress(seconds,[turn[0]-.25,turn[1]-.35]);
    ctx.branch('spine_lower',axis([0,1,0],-torsoYaw));ctx.branch('neck',axis([0,1,0],-headYaw));
    const keyboard=sampleStrikeKeyboardRefusal(seconds,{contact:keyboardContact,
      lift:[withdraw[0],withdraw[0]+.45],retreat:[withdraw[0]+.45,withdraw[1]-.5],settle:[withdraw[1]-.5,withdraw[1]]});
    for(const side of ['L','R'])contacts.push(handTarget(ctx,{side,targetWorld:keyboard.targets[side],directionWorld:[-1,-.08,0],weight:keyboard.weight,kind:'keyboard-ready',palmFrame:true}));
  }else{
    plate=sampleStrikePlateOffer(seconds,plateOptions);
    contacts.push(handTarget(ctx,{side:'R',targetWorld:plate.handWorld,directionWorld:[0,-1,-.04],weight:plate.reachWeight,kind:plate.released>0?'plate-release':'plate-rim'}));
    const releaseSpan=plateOptions.release||[3.0,4.5],otherHand=progress(seconds,releaseSpan);
    contacts.push(handTarget(ctx,{side:'L',targetWorld:[61.22,11.05,5.92],directionWorld:[0,-1,0],weight:otherHand,kind:'settle-own-side'}));
  }
  const audit={kind,seconds,clockSeconds,rootUnchanged:true,seatedWeight:seated,torsoYaw,headYaw,contacts,plate,
    limitations:['Native Source seated/knee-bend anatomical pose reused on existing guest body; final cloth/seat compression requires rendered review.',
      'Measured index-tip skin vertex constrains contact; this is not grasp simulation or full hand collision.',
      'No phoneme facial performance; native temporary jaw motion retained only when speaking.']};
  return{...instance,character:{...instance.character,joints},strikeArticulation:audit};
}

export function strikeSkinMarkerWorld(instance,source,side){return worldPoint(instance.matrix,context(instance,instance.character.joints,source).marker(side));}
