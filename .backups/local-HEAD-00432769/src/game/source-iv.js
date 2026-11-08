import { SOURCE_IV as C, sourceIVSupportAt, sourceIVCollisionAt } from '../data/source-iv.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,a,b)=>Math.max(a,Math.min(b,finite(value,a)));
const angle=value=>Math.atan2(Math.sin(finite(value)),Math.cos(finite(value)));
const idFor=state=>`${C.sequenceId}:${state.runId}:complete`;
function pose(value){
  if(!value||!Number.isFinite(value.x)||!Number.isFinite(value.y)&&!Number.isFinite(value.z))return null;
  try{if(Object.values(value).some(v=>typeof v==='number'&&!Number.isFinite(v)))return null;return copy(value);}catch{return null;}
}
export function freshSourceIV({runId='',returnPose=null}={}){
  return{version:C.version,sequenceId:C.sequenceId,runId:String(runId),status:'active',...C.spawn,
    clock:0,accumulator:0,exitDoor:{open:false,progress:0},exitReceipt:null,returnPose:pose(returnPose)};
}
export function normalizeSourceIV(value,{runId,returnPose}={}){
  const fresh=freshSourceIV({runId:runId??value?.runId??'',returnPose});
  if(!value||value.version!==C.version||value.sequenceId!==C.sequenceId
    ||runId!=null&&String(runId)!==String(value.runId))return fresh;
  const state={...fresh,status:value.status==='completed'?'completed':'active',
    x:finite(value.x,fresh.x),z:finite(value.z,fresh.z),feet:0,yaw:angle(value.yaw),pitch:clamp(value.pitch??0,-1.3,1.3),
    clock:Math.max(0,finite(value.clock)),accumulator:clamp(value.accumulator??0,0,C.fixedStep),
    exitDoor:{open:!!value.exitDoor?.open,progress:clamp(value.exitDoor?.progress??0,0,1)},
    returnPose:pose(returnPose)||pose(value.returnPose)};
  if(sourceIVCollisionAt(state.x,state.z)){state.x=fresh.x;state.z=fresh.z;}
  if(state.status==='completed')state.exitReceipt={id:idFor(state),delivered:!!value.exitReceipt?.delivered};
  return state;
}
const doorPassable=state=>(state.exitDoor?.progress||0)>=C.doorPassFraction;
export function sourceIVCanOccupy(x,z,value={}){
  if(sourceIVCollisionAt(x,z))return false;
  for(const [door,open]of [[C.entry,false],[C.exit,doorPassable(value)]])
    if(!open&&Math.abs(x-door.x)<door.width/2+C.bodyRadius&&Math.abs(z-door.z)<C.bodyRadius+.06)return false;
  return !!sourceIVSupportAt(x,z);
}
export function sourceIVFocus(value){
  const state=normalizeSourceIV(value);
  const dx=C.exit.x-state.x,dz=C.exit.z-state.z,distance=Math.hypot(dx,dz);
  const height=1.2-C.eyeHeight,planar=Math.cos(state.pitch),aimLength=Math.hypot(distance,height);
  const facing=(Math.sin(state.yaw)*planar*dx+Math.sin(state.pitch)*height-Math.cos(state.yaw)*planar*dz)/aimLength;
  // A nearby door is still a physical object, rather than a radius-triggered
  // switch behind the player's back. Keep the cone generous at this scale.
  if(state.status!=='active'||distance>2.5||distance>.35&&facing<.35)return null;
  return{id:`source-IV:${state.runId}:exit`,kind:'exit',x:C.exit.x,z:C.exit.z,
    title:state.exitDoor.open?'CLOSE THE GREY DOOR':'OPEN THE GREY DOOR',open:state.exitDoor.open,
    passable:doorPassable(state),position:{x:C.exit.x,y:1.2,z:C.exit.z}};
}
function move(state,input,dt,events){
  if(input.acceptedStep===false)return;
  const forward=clamp(input.forward??0,-1,1),side=clamp(input.side??0,-1,1),length=Math.max(1,Math.hypot(forward,side)),amount=C.walkSpeed*dt/length;
  const dx=(Math.sin(state.yaw)*forward+Math.cos(state.yaw)*side)*amount,
    dz=(-Math.cos(state.yaw)*forward+Math.sin(state.yaw)*side)*amount;
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.06));
  for(let n=0;n<count;n++){
    if(sourceIVCanOccupy(state.x+dx/count,state.z,state))state.x+=dx/count;
    const from={x:state.x,z:state.z};
    if(sourceIVCanOccupy(state.x,state.z+dz/count,state))state.z+=dz/count;
    if(from.z>C.exit.z&&state.z<=C.exit.z&&Math.abs(state.x-C.exit.x)<=C.exit.width/2-C.bodyRadius&&doorPassable(state)){
      state.status='completed';state.exitReceipt={id:idFor(state),delivered:false};
      events.push({type:'complete',id:state.exitReceipt.id,receipt:state.exitReceipt.id});return;
    }
  }
}
export function stepSourceIV(value,input={}){
  const state=normalizeSourceIV(value),events=[];
  if(state.status!=='active'||input.paused||input.protected||input.assetsReady===false||input.renderReady===false)
    return{state,events,event:null,saveDue:false};
  const look=input.look||{};state.yaw=angle(Number.isFinite(look.yaw)?look.yaw:state.yaw+finite(look.dx??input.yawDelta));
  state.pitch=clamp(Number.isFinite(look.pitch)?look.pitch:state.pitch+finite(look.dy??input.pitchDelta),-1.3,1.3);
  if(input.interact&&sourceIVFocus(state)){state.exitDoor.open=!state.exitDoor.open;events.push({type:'door',id:`source-IV:${state.runId}:exit`,open:state.exitDoor.open});}
  state.accumulator+=clamp(input.dt??0,0,C.maxFrameDelta);
  while(state.accumulator+1e-10>=C.fixedStep&&state.status==='active'){
    state.accumulator-=C.fixedStep;state.clock+=C.fixedStep;
    state.exitDoor.progress=clamp(state.exitDoor.progress+(state.exitDoor.open?1:-1)*C.fixedStep/C.doorSeconds,0,1);
    move(state,input,C.fixedStep,events);
  }
  state.accumulator=state.status==='completed'?0:Math.max(0,state.accumulator);
  return{state,events,event:events.find(event=>event.type==='complete')||events.at(-1)||null,saveDue:events.length>0};
}
export function sourceIVFrame(value){
  const state=normalizeSourceIV(value);
  return{...state,active:state.status==='active',phase:'Source IV',player:{x:state.x,y:0,z:state.z,feet:0,
    yaw:state.yaw,pitch:state.pitch,eyeHeight:C.eyeHeight},focus:sourceIVFocus(state),
    entryDoor:{...C.entry,id:`source-IV:${state.runId}:entry`,open:false,progress:0,passable:false},
    exitDoor:{...C.exit,id:`source-IV:${state.runId}:exit`,...state.exitDoor,passable:doorPassable(state)},
    support:sourceIVSupportAt(state.x,state.z),events:[]};
}
