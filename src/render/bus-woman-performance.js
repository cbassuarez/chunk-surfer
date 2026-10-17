// The bus woman's gestures are samples of the saved game clock. They never
// repeat, move her root, or decide where an appearance belongs.
import { BUS_WOMAN_RIG, BUS_WOMAN_CONTACTS } from '../data/bus-woman-rig.js';

export const BUS_WOMAN_STEP_SECONDS=.8;
export const BUS_WOMAN_STEP_METRES=.18;
export const BUS_WOMAN_READY_SECONDS=2;
export const BUS_WOMAN_CLIPS=Object.freeze({wait:4,search:6,receive:4,'ticket-wait':4,acknowledge:2.4,'acknowledge-ticket':2.4,step:BUS_WOMAN_STEP_SECONDS,'step-ticket':BUS_WOMAN_STEP_SECONDS,ready:BUS_WOMAN_READY_SECONDS});
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const ramp=(t,a,b)=>ease((t-a)/(b-a));
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]);
const mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1));
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const qUnit=q=>mul(q,1/(length(q)||1));
const qAxis=(axis,angle)=>[...mul(unit(axis),Math.sin(angle/2)),Math.cos(angle/2)];
const qMultiply=(a,b)=>[
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const qInverse=q=>[-q[0],-q[1],-q[2],q[3]];
const rotate=(v,q)=>{const a=q.slice(0,3),t=mul(cross(a,v),2);return add(v,add(mul(t,q[3]),cross(a,t)));};
function directionQuaternion(a,b){a=unit(a);b=unit(b);const d=dot(a,b);if(d<-.999999)return [...unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0])),0];return qUnit([...cross(a,b),1+d]);}
function orientedQuaternion(fromAxis,fromNormal,toAxis,toNormal){
  const swing=directionQuaternion(fromAxis,toAxis),axis=unit(toAxis);
  const projected=v=>unit(sub(v,mul(axis,dot(v,axis))));
  const a=projected(rotate(fromNormal,swing)),b=projected(toNormal);
  const twist=Math.atan2(dot(axis,cross(a,b)),dot(a,b));
  return qMultiply(qAxis(axis,twist),swing);
}
function qMix(a,b,t){if(dot(a,b)<0)b=mul(b,-1);return qUnit(mix(a,b,t));}
const bones=new Map(BUS_WOMAN_RIG.map(b=>[b.name,b]));
const rest=(name)=>{const b=bones.get(name);if(!b)throw new Error('Missing bus woman bone '+name);return b;};
const identity=[0,0,0,1];
export const busWomanStepProgress=seconds=>ease(clamp(seconds,0,BUS_WOMAN_STEP_SECONDS)/BUS_WOMAN_STEP_SECONDS);
const transform=(p,joint,bone)=>add(joint.translation,rotate(sub(p,bone.head),joint.rotation));
const posedBone=(bone,head,rotation)=>({translation:head,rotation,offset:sub(head,rotate(bone.head,rotation))});
const transformed=(point,pose,name)=>transform(point,pose.get(name),rest(name));

function solveChain(start,target,first,second,pole){
  const delta=sub(target,start),distance=clamp(length(delta),Math.abs(first-second)+1e-7,first+second-1e-7),direction=unit(delta);
  const end=add(start,mul(direction,distance)),along=(first*first-second*second+distance*distance)/(2*distance);
  let side=sub(pole,mul(direction,dot(pole,direction)));
  if(length(side)<1e-7)side=cross(direction,[0,0,1]);
  return {middle:add(add(start,mul(direction,along)),mul(unit(side),Math.sqrt(Math.max(0,first*first-along*along)))),end,error:length(sub(end,target))};
}

function fingerBones(finger,side){return [finger+'_'+side,finger+'_mid_'+side,finger+'_tip_'+side].map(rest);}
function gripLocal(side){
  const hand=rest('hand_'+side),thumb=fingerBones('thumb',side)[2],index=fingerBones('index',side)[2];
  // Curl the index toward the opposing thumb, rather than extending both
  // anatomical fingertips to the centre of an impossible straight pinch.
  return sub(add(mul(add(thumb.tail,index.tail),.5),[0,.006,.024]),hand.head);
}
function fingerChain(base,target,lengths,pole){
  const total=lengths.reduce((n,v)=>n+v,0),distance=length(sub(target,base));
  if(distance>total-1e-7){const direction=unit(sub(target,base)),points=[base];for(const size of lengths)points.push(add(points.at(-1),mul(direction,size)));return {points,error:length(sub(points.at(-1),target))};}
  const direction=unit(sub(target,base)),normal=unit(sub(pole,mul(direction,dot(pole,direction))));
  let points=[base];let along=0;
  for(let i=0;i<3;i++){along+=lengths[i];points.push(add(add(base,mul(direction,distance*along/total)),mul(normal,Math.sin(Math.PI*along/total)*total*.32)));}
  // Three-segment FABRIK preserves the length of every phalanx. This matters
  // for the same hand opening a pocket and later holding actual paper.
  for(let iteration=0;iteration<32;iteration++){
    points[3]=target;
    for(let i=2;i>=0;i--)points[i]=add(points[i+1],mul(unit(sub(points[i],points[i+1])),lengths[i]));
    points[0]=base;
    for(let i=0;i<3;i++)points[i+1]=add(points[i],mul(unit(sub(points[i+1],points[i])),lengths[i]));
    if(length(sub(points[3],target))<1e-7)break;
  }
  return {points,error:length(sub(points[3],target))};
}

function frameFor(mode,seconds,options){
  if(!Object.hasOwn(BUS_WOMAN_CLIPS,mode))throw new Error('Unknown bus woman performance '+mode);
  const t=clamp(seconds,0,BUS_WOMAN_CLIPS[mode]),settle=ramp(t,0,4),ack=mode.startsWith('acknowledge'),step=mode.startsWith('step');
  const returned=mode==='ticket-wait'||mode==='acknowledge-ticket'||mode==='step-ticket';
  const result={mode,seconds:t,phase:'waiting',returned,headYaw:-.025+.045*settle,bodyYaw:0,lean:.009,
    shift:[-.010+.018*settle,-.001*settle,0],rightSearch:0,leftSearch:0,rightInsert:0,leftInsert:0,
    ticketVisible:returned,receive:0,store:0,release:0,acknowledge:ack,stepProgress:0};
  if(ack){
    const yaw=clamp(options.acknowledgeYaw??.26,-.6,.6),head=ramp(t,.10,.78),body=ramp(t,.72,1.65);
    result.headYaw=yaw*head;result.bodyYaw=yaw*.24*body;result.phase=t<.72?'look':t<1.65?'acknowledge':'still';
    result.shift=[-.010+.010*body,-.001,0];
  }else if(step){
    const yaw=clamp(options.acknowledgeYaw??.26,-.6,.6),progress=busWomanStepProgress(t);
    result.headYaw=yaw;result.bodyYaw=yaw*.24;result.stepProgress=progress;
    result.shift=[0,-.001-.027*Math.sin(Math.PI*progress),0];
    result.phase=t<.08?'supported':t<.38?'left-step':t<.44?'supported':t<.75?'right-step':'still';
  }else if(mode==='search'){
    result.rightSearch=ramp(t,0,.70)*(1-ramp(t,1.75,2.40));
    result.leftSearch=ramp(t,2.70,3.35)*(1-ramp(t,4.30,5.10));
    result.rightInsert=ramp(t,.95,1.18)*(1-ramp(t,1.40,1.75));
    result.leftInsert=ramp(t,3.60,3.83)*(1-ramp(t,4.05,4.30));
    result.headYaw=.035*result.rightSearch-.035*result.leftSearch;
    result.lean=.009+.022*Math.max(result.rightSearch,result.leftSearch);
    result.phase=t<2.4?'right-pocket':t<2.7?'withdraw':t<5.1?'left-pocket':'still';
  }else if(mode==='receive'){
    result.receive=ramp(t,0,.90);result.store=ramp(t,1.45,2.45);result.release=ramp(t,2.95,4);
    result.ticketVisible=t>=.90&&t<2.95;
    result.phase=t<.9?'reach':t<1.45?'grasp':t<2.45?'carry':t<2.95?'store':'withdraw';
  }else if(mode==='ready'){
    result.shift=[.008,-.001,0];result.headYaw=.02;
    result.ticketVisible=t>=.90;
    result.phase=t<.55?'reach-pocket':t<.78?'grasp-stored':t<1.20?'draw-ticket':'hold-ready';
  }
  return result;
}

/** Absolute, rest-space joints sampled by both the GLB exporter and contacts. */
export function busWomanPose(mode='wait',seconds=0,options={}){
  const frame=frameFor(mode,seconds,options),pose=new Map(),contacts=[];
  // A finite authored search may interrupt and retry the actual pocket action.
  // Keep this narrow: every contact is still solved below from the real coat,
  // hand and rig, and ordinary callers retain the original sampled frame.
  if(mode==='search'&&options.authoredSearch){
    for(const key of ['rightSearch','leftSearch','rightInsert','leftInsert','lean','headYaw']){
      if(Number.isFinite(options.authoredSearch[key]))frame[key]=options.authoredSearch[key];
    }
  }
  const pelvis=rest('pelvis').head,bodyQ=qMultiply(qAxis([0,1,0],frame.bodyYaw),qAxis([1,0,0],-frame.lean));
  const upper=point=>add(add(rotate(sub(point,pelvis),bodyQ),pelvis),frame.shift);
  const put=(name,head,tail,rotation)=>{const bone=rest(name);pose.set(name,posedBone(bone,head,rotation||directionQuaternion(sub(bone.tail,bone.head),sub(tail,head))));};
  for(const name of ['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','clavicle_L','clavicle_R']){
    const bone=rest(name);put(name,upper(bone.head),upper(bone.tail),bodyQ);
  }
  const head=rest('head'),headQ=qMultiply(qAxis([0,1,0],frame.headYaw),bodyQ);
  // A yaw about the near-vertical head bone cannot be recovered from its
  // direction alone. Keep the full quaternion, including that axial turn.
  put('head',upper(head.head),null,headQ);
  const jaw=rest('jaw');put('jaw',transform(jaw.head,pose.get('head'),head),null,headQ);

  for(const [side,s] of [['L',-1],['R',1]]){
    const thigh=rest('thigh_'+side),shin=rest('shin_'+side),foot=rest('foot_'+side),toe=rest('toe_'+side);
    const hip=add(thigh.head,frame.shift),ankle=foot.head.slice();
    if(mode.startsWith('step')){
      const swing=side==='L'?ramp(frame.seconds,.08,.38):ramp(frame.seconds,.44,.75);
      // The pre-existing navigation root advances 18 cm in local -X. Undo
      // that motion during support; move each foot only in its own swing.
      ankle[0]+=BUS_WOMAN_STEP_METRES*(frame.stepProgress-swing);
      ankle[1]+=.026*Math.sin(Math.PI*swing);
    }
    const leg=solveChain(hip,ankle,length(sub(thigh.tail,thigh.head)),length(sub(shin.tail,shin.head)),[s*.12,0,-1]);
    put(thigh.name,hip,leg.middle);put(shin.name,leg.middle,leg.end);
    put(foot.name,leg.end,null,identity);
    const footDelta=sub(leg.end,foot.head);put(toe.name,add(toe.head,footDelta),null,identity);
    contacts.push({kind:'foot',side,target:ankle,point:leg.end,error:leg.error});
  }

  const palmQ={};
  for(const [side,s] of [['L',-1],['R',1]]){
    const hand=rest('hand_'+side),upperArm=rest('upperarm_'+side),forearm=rest('forearm_'+side);
    const shoulder=upper(upperArm.head),grip=gripLocal(side),restFinger=sub(fingerBones('index',side)[2].tail,hand.head);
    const acrossPalm=sub(fingerBones('little',side)[0].head,fingerBones('index',side)[0].head);
    const palmNormal=unit(mul(cross(restFinger,acrossPalm),s));
    const idleQ=directionQuaternion(restFinger,[s*.15,-1,-.10]);
    const activeQ=directionQuaternion(restFinger,[s*.02,-1,.12]);
    const receiveQ=orientedQuaternion(restFinger,palmNormal,[s*.02,-1,.12],[0,.12,1]);
    const readyQ=orientedQuaternion(restFinger,palmNormal,[s*.05,.55,-.84],[0,.84,.55]);
    const paperQ=frame.returned?readyQ:receiveQ;
    const holdingPaper=side==='R'&&(frame.returned||mode==='receive'||mode==='ready');
    let wrist=side==='L'?[-.235,1.055,-.285]:[.265,.947,-.215],rotation=idleQ,pinch=0;
    const pocketSource=BUS_WOMAN_CONTACTS.pockets[side],details=BUS_WOMAN_CONTACTS.pocketDetails?.[side]||pocketSource;
    const pocket=pocketSource.mouth||pocketSource,search=side==='R'?frame.rightSearch:frame.leftSearch,insert=side==='R'?frame.rightInsert:frame.leftInsert;
    if(search>0){
      const lip=add(pocket,[s*.009,.008,-.015]),inside=details.inside||add(pocket,[0,-.017,.037]);
      const gripPoint=mix(lip,inside,insert),atPocket=sub(gripPoint,rotate(grip,activeQ));
      wrist=mix(wrist,atPocket,search);rotation=qMix(idleQ,activeQ,search);pinch=search*(1-insert*.65);
    }
    if(holdingPaper){
      const held=[.255,1.205,-.425],offer=[.235,1.105,-.425],pocketLip=add(pocket,[.010,.014,-.020]),stored=add(pocket,[.004,-.079,.037]);
      let point=held;
      if(mode==='ready'){
        const carry=ramp(frame.seconds,1.20,2),lifted=add(pocket,[.010,.045,-.045]);
        point=mix(mix(stored,lifted,ramp(frame.seconds,.78,1.20)),held,carry);
        const carryQ=qMix(receiveQ,readyQ,carry),reach=ramp(frame.seconds,0,.55);
        const atPoint=sub(point,rotate(grip,carryQ));
        wrist=mix(wrist,atPoint,reach);rotation=qMix(idleQ,carryQ,reach);pinch=ramp(frame.seconds,.35,.55);
      }else if(mode==='receive'){
        point=mix(offer,pocketLip,ramp(frame.seconds,1.45,2.20));
        point=mix(point,stored,ramp(frame.seconds,2.20,2.95));
        const atPoint=sub(point,rotate(grip,paperQ));
        wrist=mix(wrist,atPoint,frame.receive*(1-frame.release));rotation=qMix(idleQ,paperQ,frame.receive*(1-frame.release));
        pinch=frame.receive*(1-frame.release);
      }else{wrist=sub(point,rotate(grip,paperQ));rotation=paperQ;pinch=1;}
    }
    // The mild torso acknowledgement carries the shoulders and hands as one
    // body. Pocket work remains aligned with the actual garment front.
    wrist=upper(wrist);
    rotation=qMultiply(bodyQ,rotation);palmQ[side]=rotation;
    const arm=solveChain(shoulder,wrist,length(sub(upperArm.tail,upperArm.head)),length(sub(forearm.tail,forearm.head)),[s*.85,-.30,-.16]);
    put(upperArm.name,shoulder,arm.middle);put(forearm.name,arm.middle,arm.end);put(hand.name,arm.end,null,rotation);
    contacts.push({kind:'hand',side,target:wrist,point:arm.end,error:arm.error,pinch,shoulder,elbow:arm.middle});
    const pinchCentre=add(arm.end,rotate(grip,rotation));
    for(const finger of ['thumb','index','middle','ring','little']){
      const chain=fingerBones(finger,side),base=transform(chain[0].head,pose.get(hand.name),hand),sizes=chain.map(b=>length(sub(b.tail,b.head)));
      const straightEnd=transform(chain[2].tail,pose.get(hand.name),hand);
      const opposing=(finger==='thumb'||finger==='index')&&pinch>0;
      let target=straightEnd;
      if(opposing){
        const pinchOffset=frame.returned||mode==='ready'
          ?rotate([0,0,finger==='thumb'?-.0015:.0015],bodyQ)
          :rotate(mul(palmNormal,finger==='thumb'?-.0015:.0015),rotation);
        target=mix(straightEnd,add(pinchCentre,pinchOffset),pinch);
        if(search>0){
          // The thumb stays on the exterior lip while the index checks the
          // lined opening. Passing both fingertips through the coat front
          // would turn the authored pocket search back into a clipping mime.
          const lip=add(pocket,[s*.009,.008,-.015]),inside=details.inside||add(pocket,[0,-.017,.037]);
          const pocketTarget=upper(finger==='thumb'?lip:mix(lip,inside,insert));
          target=mix(straightEnd,pocketTarget,search);
        }
      }else if(finger!=='thumb'){
        const natural=sub(chain[2].tail,chain[0].head),total=sizes.reduce((n,v)=>n+v,0);
        const paperFold=holdingPaper?pinch:0;
        const curled=add(base,rotate(add(mul(natural,.72-.32*paperFold),mul(palmNormal,total*(.18+.10*paperFold))),rotation));
        target=mix(straightEnd,curled,.15+pinch*(holdingPaper?.85:.60));
      }
      const solve=fingerChain(base,target,sizes,rotate(palmNormal,rotation));
      for(let i=0;i<3;i++)put(chain[i].name,solve.points[i],solve.points[i+1]);
      contacts.push({kind:'finger',side,finger,target,point:solve.points[3],error:solve.error,pinch:opposing?pinch:0});
    }
  }
  // Any accessory or later corrective bone inherits its actual parent, not
  // the head. The supplied production rig is already in parent-first order.
  for(const bone of BUS_WOMAN_RIG)if(!pose.has(bone.name)){
    const parent=pose.get(bone.parent);if(!parent)throw new Error('Unposed bus woman bone '+bone.name);
    pose.set(bone.name,posedBone(bone,transform(bone.head,parent,rest(bone.parent)),parent.rotation));
  }
  const joints=Object.fromEntries([...pose].map(([name,{translation,rotation}])=>[name,{translation,rotation}]));
  const forearm=rest('forearm_L'),bagGrip=add(transformed(mix(forearm.head,forearm.tail,.31),pose,forearm.name),[0,.027,0]);
  // Its handle rests over the forearm. The bag hangs under gravity and does
  // not rotate with the wrist while the left hand searches its coat pocket.
  const bagRotation=qAxis([0,1,0],Math.PI/2+frame.bodyYaw),bagTranslation=sub(bagGrip,rotate(BUS_WOMAN_CONTACTS.bagGrip,bagRotation));
  const ticketGrip=contacts.find(c=>c.kind==='finger'&&c.side==='R'&&c.finger==='index').point;
  const ticketPitch=mode==='receive'?-.12*ramp(frame.seconds,2.20,2.95):mode==='ready'?-.12*(1-ramp(frame.seconds,.78,1.20)):0;
  const ticketRotation=qMultiply(bodyQ,qAxis([1,0,0],ticketPitch));
  const ticketTranslation=sub(ticketGrip,rotate(BUS_WOMAN_CONTACTS.ticketGrip,ticketRotation));
  return {mode,seconds:frame.seconds,joints,contacts,frame,attachments:{
    bag:{translation:bagTranslation,rotation:bagRotation,visible:true,grip:bagGrip},
    ticket:{translation:ticketTranslation,rotation:ticketRotation,visible:frame.ticketVisible,grip:ticketGrip}
  }};
}

export function busWomanDescriptor(mode='wait',seconds=0,options={}){
  if(!Object.hasOwn(BUS_WOMAN_CLIPS,mode))throw new Error('Unknown bus woman performance '+mode);
  const descriptor={clip:'bus_woman_'+mode.replaceAll('-','_'),time:clamp(seconds,0,BUS_WOMAN_CLIPS[mode]),loop:false};
  if((mode.startsWith('acknowledge')||mode.startsWith('step'))&&options.acknowledgeYaw!=null&&Math.abs(clamp(options.acknowledgeYaw,-.6,.6)-.26)>1e-9){
    const original=busWomanPose(mode,descriptor.time),changed=busWomanPose(mode,descriptor.time,options),joints={};
    const delta=(a,b)=>({translation:sub(b.translation,a.translation),rotation:qMultiply(qInverse(a.rotation),b.rotation)});
    for(const name of Object.keys(original.joints))joints['bus_woman_'+name]=delta(original.joints[name],changed.joints[name]);
    for(const name of ['bag','ticket'])joints['bus_woman_'+name+'_joint']=delta(original.attachments[name],changed.attachments[name]);
    descriptor.joints=joints;
  }
  return descriptor;
}

export function busWomanAttachments(mode='wait',seconds=0,options={}){
  return busWomanPose(mode,seconds,options).attachments;
}

export function busWomanTicketVisible(mode='wait',seconds=0){
  return frameFor(mode,seconds,{}).ticketVisible;
}
