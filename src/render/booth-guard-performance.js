// Workplace performance for the existing Wrong Fold man before the road.
// Only this lodge adapter samples these gestures; the later fold is untouched.
import {BOOTH_GUARD_RIG,BOOTH_GUARD_STAGE as STAGE} from '../data/booth-guard-rig.js';

export const BOOTH_GUARD_PROP_PACK='/assets/booth-guard-props.glb';
export const BOOTH_GUARD_POSES=Object.freeze(['idle','ledger','handoff']);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),qUnit=q=>unit(q),identity=[0,0,0,1];
const qAxis=(a,t)=>[...mul(unit(a),Math.sin(t/2)),Math.cos(t/2)];
const qMul=(a,b)=>qUnit([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]);
const qInv=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const qMix=(a,b,t)=>{if(dot(a,b)<0)b=mul(b,-1);return qUnit(mix(a,b,t));};
function between(a,b){a=unit(a);b=unit(b);const d=dot(a,b);if(d<-.999999)return[...unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0])),0];return qUnit([...cross(a,b),1+d]);}
function orient(axis,normal,direction,surfaceNormal){
  const swing=between(axis,direction),u=unit(direction),project=p=>unit(sub(p,mul(u,dot(p,u))));
  const a=project(rotate(normal,swing)),b=project(surfaceNormal),twist=Math.atan2(dot(u,cross(a,b)),dot(a,b));
  return qMul(qAxis(u,twist),swing);
}
const rig=new Map(BOOTH_GUARD_RIG.map(b=>[b.name,b]));
const bone=name=>{const b=rig.get(name);if(!b)throw Error('Unknown booth guard bone '+name);return b;};
export const boothPointToGuard=p=>[STAGE.origin[0]-p[0],p[1]-STAGE.origin[1],STAGE.origin[2]-p[2]];
export const guardPointToBooth=p=>[STAGE.origin[0]-p[0],p[1]+STAGE.origin[1],STAGE.origin[2]-p[2]];

function chain(start,target,l1,l2,pole){
  const delta=sub(target,start),distance=clamp(len(delta),Math.abs(l1-l2)+1e-7,l1+l2-1e-7),direction=unit(delta),end=add(start,mul(direction,distance));
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance),side=unit(sub(pole,mul(direction,dot(pole,direction))));
  return{elbow:add(add(start,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,l1*l1-along*along)))),wrist:end,error:len(sub(end,target)),extension:distance/(l1+l2)};
}
function pinchPoint(side){
  const a=bone('thumb_'+side),b=bone('index_'+side),delta=sub(b.head,a.head),d=len(delta),u=unit(delta),ra=len(sub(a.tail,a.head)),rb=len(sub(b.tail,b.head));
  const along=(ra*ra-rb*rb+d*d)/(2*d),centre=add(a.head,mul(u,along)),pole=sub(bone('middle_'+side).tail,bone('hand_'+side).head),normal=unit(sub(pole,mul(u,dot(pole,u))));
  return add(centre,mul(normal,Math.sqrt(Math.max(0,ra*ra-along*along))));
}
const palmData=new Map(['L','R'].map(side=>{
  const hand=bone('hand_'+side),forward=unit(sub(bone('middle_'+side).tail,hand.head)),across=sub(bone('little_'+side).head,bone('index_'+side).head);
  return[side,{forward,normal:unit(cross(forward,across)),pinch:sub(pinchPoint(side),hand.head)}];
}));

function authoredState(mode,t,{timeSec=0,reducedMotion=false,conversation={},sourceId=''}={}){
  const breathing=reducedMotion?0:Math.sin(timeSec*1.47)*.0015,writing=mode==='ledger',handoff=mode==='handoff';
  const release=handoff?smooth((t-1.55)/.40):0,retract=handoff?smooth((t-1.95)/.72):0;
  const stroke=writing&&!reducedMotion?Math.sin(timeSec*8.7)*Math.sin(timeSec*1.4)*.006:0;
  const penAxis=unit([.12,.94,-.32]),pen=add(add(STAGE.ledger,[stroke,0,stroke*.24]),[-penAxis[0]*.047,penAxis[1]*.047,-penAxis[2]*.047]),brace=add(STAGE.brace,[0,.001,0]);
  const offering=/^coffee\./.test(sourceId)?'cup':'key',offer=STAGE[offering];
  const near=add(offer,[.05,.015,-.22]),target=handoff?mix(offer,near,retract):pen;
  return{mode,lean:writing?.12:handoff?.22:.025,headPitch:writing?-.30:handoff?-.06:0,headYaw:clamp(conversation.headYaw??0,-.30,.30)*(writing?.25:1),breathing,
    hands:{R:writing?{point:boothPointToGuard(pen),grip:1,active:1}:handoff?{point:boothPointToGuard(target),grip:1-release,active:1}:null,
      L:writing||handoff?{point:boothPointToGuard(brace),grip:0,active:1}:null},
    offering,release,retract,pen,offer, speaking:!!conversation.active&&!!conversation.speaking,
    speech:reducedMotion?0:conversation.active&&conversation.speaking?(.5+.5*Math.sin((conversation.elapsedSec??timeSec)*11.3))*.045:0};
}

/** Pure, replayable state. Transitions interpolate targets before IK, keeping
 * all limb lengths and fixed counter contacts valid during the change. */
export function boothGuardPose({pose='idle',timeSec=0,poseElapsedSec=4,previousPose='idle',transitionFrom=null,reducedMotion=false,conversation={},sourceId=''}={}){
  if(!BOOTH_GUARD_POSES.includes(pose)||!BOOTH_GUARD_POSES.includes(previousPose))throw Error('Unknown booth guard workplace pose');
  const t=Math.max(0,Number(poseElapsedSec)||0),now=Math.max(0,Number(timeSec)||0),settings={timeSec:now,reducedMotion,conversation,sourceId};
  const frame=authoredState(pose,t,settings),prior=authoredState(previousPose,4,{...settings,conversation:{...conversation,speaking:false}}),transition=smooth(t/.85);
  if(transitionFrom){
    for(const key of['lean','headPitch','headYaw'])if(Number.isFinite(transitionFrom[key]))prior[key]=transitionFrom[key];
    prior.transitionHands=transitionFrom.hands;
    for(const side of['L','R'])prior.hands[side]=transitionFrom.hands?.[side]?.active?{}:null;
  }
  frame.transition=transition;frame.lean=prior.lean+(frame.lean-prior.lean)*transition;frame.headPitch=prior.headPitch+(frame.headPitch-prior.headPitch)*transition;
  frame.headYaw=prior.headYaw+(frame.headYaw-prior.headYaw)*transition;
  const posed=new Map(),contacts=[],pelvis=bone('pelvis').head,bodyQ=qAxis([1,0,0],-frame.lean),upper=p=>add(add(pelvis,rotate(sub(p,pelvis),bodyQ)),[0,frame.breathing,0]);
  const put=(name,head,change=identity)=>posed.set(name,{head,rotation:qMul(change,bone(name).worldRotation),change});
  // The feet and pelvis stay planted. Only the torso bends towards the work.
  for(const b of BOOTH_GUARD_RIG)put(b.name,b.head);
  for(const name of['spine_lower','spine_mid','spine_upper','chest','neck','clavicle_L','clavicle_R'])put(name,upper(bone(name).head),bodyQ);
  const head=bone('head'),headQ=qMul(qAxis([0,1,0],frame.headYaw),qMul(qAxis([1,0,0],frame.headPitch),bodyQ));
  put('head',upper(head.head),headQ);
  const jaw=bone('jaw'),jawHead=add(posed.get('head').head,rotate(sub(jaw.head,head.head),headQ));
  put('jaw',jawHead,qMul(headQ,qAxis([1,0,0],-frame.speech)));
  for(const[side,sign]of[['L',-1],['R',1]]){
    const arm=bone('upperarm_'+side),fore=bone('forearm_'+side),hand=bone('hand_'+side),palm=palmData.get(side),shoulder=upper(arm.head);
    const restWrist=[sign*.245,1.085,-.015],idleRotation=orient(palm.forward,palm.normal,[sign*.06,-1,-.12],[sign,0,0]);
    const workRotation=orient(palm.forward,palm.normal,[side==='R'?.06:-.10,-.10,-1],[0,-1,0]);
    const handFor=(state)=>{
      const captured=state.transitionHands?.[side];if(captured)return{wrist:captured.wrist,rotation:captured.rotation,grip:captured.grip};
      const active=state.hands[side];if(!active)return{wrist:restWrist,rotation:idleRotation,grip:0};
      // Pen/key pinch lives between the actual thumb/index tips. The free hand
      // uses the anatomical middle fingertip as its contact on the open page.
      const local=side==='R'?palm.pinch:sub(bone('middle_'+side).tail,hand.head),rotation=workRotation;
      return{wrist:sub(active.point,rotate(local,rotation)),rotation,grip:active.grip};
    };
    const from=handFor(prior),to=handFor(frame),raised=[sign*.245,1.60,-.10];
    let target=mix(from.wrist,to.wrist,transition),rotation=qMix(from.rotation,to.rotation,transition);
    // A straight blend from a hanging arm drives the fingertips THROUGH the
    // counter. Lift and turn behind its rear edge, then travel over the top;
    // withdrawal follows the reverse clearance before the hand can descend.
    const fromTip=add(from.wrist,rotate(sub(bone('middle_'+side).tail,hand.head),from.rotation));
    const interruptedBelowTop=!!transitionFrom&&fromTip[1]<STAGE.counterTop-STAGE.origin[1]+.025;
    if((!prior.hands[side]||interruptedBelowTop)&&frame.hands[side]&&t<1.35){
      const lift=smooth(t/.70),reach=smooth((t-.70)/.65),turn=smooth((t-.38)/.25);
      target=reach>0?mix(raised,to.wrist,reach):mix(from.wrist,raised,lift);rotation=qMix(from.rotation,to.rotation,turn);
    }else if(prior.hands[side]&&!frame.hands[side]&&t<1.50){
      const withdraw=smooth(t/.65),lower=smooth((t-.80)/.70),turn=smooth((t-.65)/.25);
      target=lower>0?mix(raised,to.wrist,lower):mix(from.wrist,raised,withdraw);rotation=qMix(from.rotation,to.rotation,turn);
    }
    const grip=from.grip+(to.grip-from.grip)*transition;
    const solve=chain(shoulder,target,len(sub(arm.tail,arm.head)),len(sub(fore.tail,fore.head)),[sign*.75,side==='L'?-.20:-.30,.20]);
    put(arm.name,shoulder,between(sub(arm.tail,arm.head),sub(solve.elbow,shoulder)));
    put(fore.name,solve.elbow,between(sub(fore.tail,fore.head),sub(solve.wrist,solve.elbow)));
    put(hand.name,solve.wrist,rotation);
    const pinch=pinchPoint(side),tips={};
    for(const name of['thumb','index','middle','ring','little']){
      const finger=bone(name+'_'+side),base=add(solve.wrist,rotate(sub(finger.head,hand.head),rotation));
      let change=rotation;
      if((name==='thumb'||name==='index')&&grip>0){const aim=mix(finger.tail,pinch,grip),curl=between(sub(finger.tail,finger.head),sub(aim,finger.head));change=qMul(rotation,curl);}
      put(finger.name,base,change);tips[name]=add(base,rotate(sub(finger.tail,finger.head),change));
    }
    const contact=side==='R'&&frame.hands.R?add(solve.wrist,rotate(palm.pinch,rotation)):tips.middle;
    contacts.push({kind:'arm',side,shoulder,elbow:solve.elbow,wrist:solve.wrist,target,error:solve.error,extension:solve.extension,grip,point:contact,tips});
  }
  // Convert desired world frames back to this GLB's actual parent-local
  // offsets. Applying flat absolute joints here would twist every child twice.
  const joints={};
  for(const b of BOOTH_GUARD_RIG){
    const desired=posed.get(b.name),parent=b.parent?posed.get(b.parent):{head:[0,0,0],rotation:identity},inv=qInv(parent.rotation);
    const localT=rotate(sub(desired.head,parent.head),inv),localQ=qMul(inv,desired.rotation);
    joints[b.name]={translation:sub(localT,b.localTranslation),rotation:qMul(qInv(b.localRotation),localQ)};
  }
  const transitionSnapshot={lean:frame.lean,headPitch:frame.headPitch,headYaw:frame.headYaw,hands:Object.fromEntries(contacts.map(c=>[c.side,{wrist:c.wrist.slice(),rotation:posed.get('hand_'+c.side).change.slice(),grip:c.grip,active:!!frame.hands[c.side]}]))};
  return{frame,joints,posed,contacts,transitionSnapshot,feet:['L','R'].map(side=>({side,point:bone('foot_'+side).head.slice()}))};
}

export function boothGuardDescriptor(options={}){return{joints:boothGuardPose(options).joints,morphs:{rib_compression:0,shoulder_tension:0,throat_strain:0,mouth_pain:0}};}
export function boothGuardTransitionSnapshot(options={}){return boothGuardPose(options).transitionSnapshot;}

function matrixAt(position,rotation,yaw=0){
  const q=qMul(qAxis([0,1,0],-yaw),rotation),[x,y,z,w]=q;
  return new Float32Array([1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),0,2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),0,2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y),0,...position,1]);
}

/** Dynamic pen/key/cup share the body transform and normal world material pass.
 * The handoff paper is static; its old floating pen/key were removed in the
 * narrow replacement pack. Nothing here awards or removes a real inventory item. */
export function boothGuardHeldInstances(body,options={}){
  if(!body||!/^yard-booth-guard-/.test(body.id||''))return[];
  const state=boothGuardPose(options),{frame}=state,hand=state.contacts.find(c=>c.side==='R'),yaw=body.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw);
  const world=p=>[body.x+p[0]*c-p[2]*s,body.y+p[1],body.z+p[0]*s+p[2]*c];
  const result=[],addPart=(mesh,point,rotation)=>{const p=world(point);result.push({id:body.id+'-'+mesh,mesh,x:p[0],y:p[1],z:p[2],yaw,zone:body.zone,structural:false,matrix:matrixAt(p,rotation,yaw),boothGuardHeld:true});};
  if(frame.mode==='ledger'){
    // Pen origin is 47mm above the tip: the contact lies on the actual page.
    addPart('booth_guard_pen',hand.point,between([0,1,0],[.12,.94,-.32]));
  }else if(frame.mode==='handoff'){
    const point=frame.release>.95?boothPointToGuard(frame.offer):hand.point;
    addPart(frame.offering==='cup'?'booth_guard_cup':'booth_guard_key',point,identity);
  }
  return result;
}
