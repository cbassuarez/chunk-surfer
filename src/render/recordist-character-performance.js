// The selected Listening Pair clothes use Held Between Takes' standing transfer.
// Every pose and attachment is a pure sample of the saved four-second phase.
import { RECORDIST_CHARACTER_RIG } from '../data/recordist-character-rig.js';

export const RECORDIST_TRANSFER_SECONDS=4;
export const RECORDIST_BOY_ORIGIN=Object.freeze([-.9,0,1.8]);
export const RECORDIST_CONTRACTOR_ORIGIN=Object.freeze([-1.32,0,1.28]);
export const RECORDIST_CONTRACTOR_YAW=-1.98;
export const RECORDIST_WORK_ORIGIN=Object.freeze([5,0,-51.9]);
export const RECORDIST_WORK_MACHINE=Object.freeze([5.04,.825,-52.49]);
export const RECORDIST_CHAIR_HEIGHT=.445;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const rotX=(a,t)=>[a[0],a[1]*Math.cos(t)-a[2]*Math.sin(t),a[1]*Math.sin(t)+a[2]*Math.cos(t)];
const rotY=(a,t)=>[a[0]*Math.cos(t)+a[2]*Math.sin(t),a[1],-a[0]*Math.sin(t)+a[2]*Math.cos(t)];
const qUnit=q=>mul(q,1/(len(q)||1));
const rotate=(v,q)=>{const a=q.slice(0,3),t=mul(cross(a,v),2);return add(v,add(mul(t,q[3]),cross(a,t)));};
function directionQuaternion(from,to){const a=unit(from),b=unit(to),d=dot(a,b);if(d<-.999999){const axis=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return [...axis,0];}return qUnit([...cross(a,b),1+d]);}
const rigs=Object.fromEntries(Object.entries(RECORDIST_CHARACTER_RIG).map(([actor,bones])=>[actor,new Map(bones.map(b=>[b.name,b]))]));

function solveChain(start,target,a,b,pole){
  const delta=sub(target,start),distance=clamp(len(delta),Math.abs(a-b)+.00001,a+b-.00001),direction=unit(delta);
  const end=add(start,mul(direction,distance)),along=(a*a-b*b+distance*distance)/(2*distance);
  const side=unit(sub(pole,mul(direction,dot(pole,direction))));
  return {middle:add(add(start,mul(direction,along)),mul(side,Math.sqrt(Math.max(0,a*a-along*along)))),end,error:len(sub(end,target))};
}

export function recordistTransferFrame(progress=0){
  const p=clamp(progress),offer=ease((p-.12)/.27),reach=ease((p-.08)/.31);
  // A real stationary shared-load interval separates reaching from letting go.
  const release=ease((p-.76)/.13),settle=ease((p-.87)/.13);
  const held=[-.9,.795,1.49],start=[-1.12,.84,1.42],rest=[-.9,.615,1.55];
  const machine=mix(mix(start,held,offer),rest,settle);
  return {progress:p,seconds:p*RECORDIST_TRANSFER_SECONDS,
    phase:p<.12?'preparation':p<.39?'offer':p<.76?'shared-weight':p<.89?'release':'settle',
    machine,reach,release,settle,boy:RECORDIST_BOY_ORIGIN,contractor:RECORDIST_CONTRACTOR_ORIGIN,
    contractorYaw:RECORDIST_CONTRACTOR_YAW,
    strapLift:Math.sin(Math.PI*ease((p-.66)/.23))*.065};
}

export function recordistCharacterPose(actor,mode='transfer',progress=0){
  if(!rigs[actor])throw new Error('Unknown recordist actor '+actor);
  const child=actor==='boy',working=mode==='work',waiting=mode==='wait',seated=child||working;
  const bones=rigs[actor],rest=RECORDIST_CHARACTER_RIG[actor],frame=recordistTransferFrame(progress),pelvis=bones.get('pelvis').head;
  const breath=(waiting||working)?Math.sin(progress*Math.PI*2)*.003:0;
  const pelvisY=child?.54:working?.59:.83+frame.release*.09;
  const lean=child?.025+breath:working?.14+breath:.65-frame.release*.4;
  const shift=[0,pelvisY-pelvis[1],0];
  const upper=p=>add(add(rotX(sub(p,pelvis),-lean),pelvis),shift);
  const desired=new Map(),transforms=new Map(),contacts=[];
  const put=(name,head,tail)=>desired.set(name,{head,tail});
  for(const name of['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head','jaw','clavicle_L','clavicle_R']){
    const bone=bones.get(name);put(name,upper(bone.head),upper(bone.tail));
  }
  const head=desired.get('head');head.tail=add(head.head,rotX(sub(head.tail,head.head),waiting?0:working?-.10:-.12));
  const origin=child?RECORDIST_BOY_ORIGIN:working?RECORDIST_WORK_ORIGIN:RECORDIST_CONTRACTOR_ORIGIN;
  const yaw=child||working?0:RECORDIST_CONTRACTOR_YAW;
  const local=p=>rotY(sub(p,origin),-yaw),world=p=>add(rotY(p,yaw),origin);
  for(const [side,s]of[['L',-1],['R',1]]){
    const thigh=bones.get('thigh_'+side),shin=bones.get('shin_'+side),foot=bones.get('foot_'+side),toe=bones.get('toe_'+side);
    const hip=add(thigh.head,shift),ankle=child?[s*.14,foot.head[1],-.31+(side==='R'?.012:0)]
      :working?[s*.19,foot.head[1],-.40]:[s*.19,foot.head[1],side==='R'?-.095:.055];
    const leg=solveChain(hip,ankle,len(sub(thigh.tail,thigh.head)),len(sub(shin.tail,shin.head)),[s*.05,0,-1]);
    put('thigh_'+side,hip,leg.middle);put('shin_'+side,leg.middle,ankle);
    const footEnd=add(ankle,sub(foot.tail,foot.head));put('foot_'+side,ankle,footEnd);put('toe_'+side,add(ankle,sub(toe.head,foot.head)),add(ankle,sub(toe.tail,foot.head)));
    const arm=bones.get('upperarm_'+side),fore=bones.get('forearm_'+side),hand=bones.get('hand_'+side),shoulder=upper(arm.head);
    let wrist,grip=false;
    if(child){const lap=[s*.10,.603,-.16],support=local(add(frame.machine,[s*.16,-.008,.085]));wrist=waiting?lap:mix(lap,support,frame.reach);grip=!waiting&&frame.reach>.99;}
    else if(working){wrist=[s*.17,.835,-.46];grip=true;}
    else {
      let contact=add(frame.machine,[-.115-s*.035,-.008,s*.105]);
      // Once both child palms carry the case, the near hand lifts its loose
      // shoulder strap. The other adult palm remains beneath the recorder.
      if(side==='R')contact=mix(contact,add(frame.machine,[-.27,.018+frame.strapLift,.04]),ease((frame.progress-.66)/.10));
      const under=local(contact),withdrawn=[s*.16,.865,-.16];
      wrist=mix(under,withdrawn,frame.release);grip=frame.release<.01;
    }
    const armPose=solveChain(shoulder,wrist,len(sub(arm.tail,arm.head)),len(sub(fore.tail,fore.head)),[s*.75,-.5,.55]);
    put('upperarm_'+side,shoulder,armPose.middle);put('forearm_'+side,armPose.middle,armPose.end);
    const handDirection=unit(grip?[0,.06,-1]:[0,-.25,-1]);
    put('hand_'+side,armPose.end,add(armPose.end,mul(handDirection,len(sub(hand.tail,hand.head)))));
    contacts.push({actor,side,grip,shoulder:world(shoulder),elbow:world(armPose.middle),wrist:world(armPose.end),target:world(wrist),reachError:armPose.error,
      upperLength:len(sub(arm.tail,arm.head)),foreLength:len(sub(fore.tail,fore.head)),ankle:world(ankle),legError:leg.error});
  }
  for(const bone of rest){const d=desired.get(bone.name);
    if(d){const rotation=directionQuaternion(sub(bone.tail,bone.head),sub(d.tail,d.head));transforms.set(bone.name,{rotation,translation:d.head,offset:sub(d.head,rotate(bone.head,rotation))});}
    else {const parent=transforms.get(bone.parent)||transforms.get('head');transforms.set(bone.name,{rotation:parent.rotation,translation:add(rotate(bone.head,parent.rotation),parent.offset),offset:parent.offset});}
  }
  const joints=Object.fromEntries([...transforms].map(([name,{translation,rotation}])=>[name,{translation,rotation}]));
  return {actor,mode,origin,yaw,joints,contacts,frame};
}

export function recordistCharacterDescriptor(actor,mode='transfer',progress=0){
  return {clip:actor==='boy'?(mode==='wait'?'boy_wait':'boy_transfer'):(mode==='work'?'contractor_work':'contractor_transfer'),time:mode==='transfer'?clamp(progress)*RECORDIST_TRANSFER_SECONDS:0,loop:mode!=='transfer'};
}

// The permanently modelled headphone lead terminates at this weighted collar
// attachment; its lower cable rests on the desk or is tucked into the waistcoat.
export function recordistHeadphoneCollar(mode='transfer',progress=0){
  const pose=recordistCharacterPose('contractor',mode,progress),p=[-.043,1.553760,.022970];
  const local=[0,0,0];
  for(const [name,weight]of[['neck',.55],['chest',.45]]){
    const joint=pose.joints[name],rest=rigs.contractor.get(name).head;
    const q=add(joint.translation,rotate(sub(p,rest),joint.rotation));
    for(let i=0;i<3;i++)local[i]+=q[i]*weight;
  }
  return add(rotY(local,pose.yaw),pose.origin);
}
