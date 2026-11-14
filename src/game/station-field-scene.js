// A persisted, voluntary station occurrence in the actual field. The ordinary
// five visits keep their own flags, clocks and outcomes elsewhere. This owner
// never touches a recorder, take count, quest flag or Source return pose.
import {freshMemoryField,memoryFieldLook} from './memory-field-scene.js';
import {createFootContactClock} from '../audio/foot-contact.js';
import {STATION_FIELD_WALK_METRES_PER_SECOND as WALK,STATION_FIELD_RETURN_SECONDS as RETURN_SECONDS} from '../data/station-field-visits.js';
const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,finite(n)));
const wrap=n=>n>=-Math.PI&&n<=Math.PI?n:Math.atan2(Math.sin(n),Math.cos(n));
const moveActions={forward:'w',moveForward:'w',move_forward:'w',backward:'s',reverse:'s',moveBackward:'s',move_backward:'s',left:'a',strafeLeft:'a',moveLeft:'a',move_left:'a',right:'d',strafeRight:'d',moveRight:'d',move_right:'d'};
const keyOf=e=>moveActions[e?.controllerAction]||String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);

export function normalizeStationFieldCheckpoint(value,visit){
 if(!visit?.memoryVisit||!visit?.returnDoor||!visit?.landmark)throw new TypeError('A station field needs its authored visit contract');
 const valid=value?.version===1&&value.fieldId===visit.fieldId&&value.connectionId===visit.connectionId;
 const source=valid?value:{},fresh=freshMemoryField(visit.memoryVisit),elapsed=Math.max(0,finite(source.elapsed));
 const coordinate=(n,base)=>Number.isFinite(Number(n))&&Math.abs(Number(n))<=1e5?Number(n):base;
 const witnessed=source.witness?.landmarkId===visit.landmark.id&&source.witness.inspected===true;
 const returnReason=['crossed-return','used-return'].includes(source.returnReason)?source.returnReason:null;
 const returning=source.stage==='returning'&&!!returnReason;
 return{version:1,fieldId:visit.fieldId,connectionId:visit.connectionId,seed:finite(source.seed,.37),
  x:coordinate(source.x,visit.spawn.x),z:coordinate(source.z,visit.spawn.z),yaw:wrap(finite(source.yaw,visit.spawn.yaw??fresh.yaw)),pitch:clamp(source.pitch??visit.spawn.pitch??fresh.pitch,-1.25,1.25),elapsed,
  stage:returning?'returning':'active',returnReason,returnElapsed:returning?clamp(source.returnElapsed,0,RETURN_SECONDS):0,
  witness:{landmarkId:visit.landmark.id,inspected:witnessed,at:witnessed?clamp(source.witness.at,0,elapsed):null}};
}
export function stationFieldDeformation(state,visit){
 const elapsed=state.witness.inspected?Math.max(0,state.elapsed-state.witness.at):0,warning=visit.deformation.warningSeconds,progress=state.witness.inspected?clamp((elapsed-warning)/visit.deformation.unmakeSeconds,0,1):0;
 return{active:state.witness.inspected,phase:!state.witness.inspected?'quiet':elapsed<warning?'warning':progress<1?'unmaking':'unmade',elapsed,progress,warning:state.witness.inspected?clamp(elapsed/warning,0,1):0};
}
function looksAt(state,target){
 const dx=target.x-state.x,dz=target.z-state.z,distance=Math.hypot(dx,dz);if(distance>target.reach)return false;
 if(distance<.15)return true;
 const yaw=Math.atan2(dx,-dz),pitch=Math.atan2(finite(target.height,1.1)-1.62,Math.max(.05,distance));
 return Math.abs(wrap(yaw-state.yaw))<=.72&&Math.abs(pitch-state.pitch)<=.7;
}
export function stationFieldFocus(state,visit){
 if(state.stage!=='active')return null;
 const door=visit.returnDoor;
 if(door.open&&looksAt(state,{...door,height:1.62}))return{kind:'return-door',id:state.connectionId,label:'RETURN THROUGH THE DOOR'};
 if(looksAt(state,visit.landmark))return{kind:'landmark',id:visit.landmark.id,label:visit.landmark.label};
 return null;
}
export function stationFieldReceipt(state,visit){
 if(state.fieldId!==visit.fieldId||state.connectionId!==visit.connectionId||state.stage!=='returning'
  ||!['crossed-return','used-return'].includes(state.returnReason)
  ||state.witness?.landmarkId!==visit.landmark.id||!state.witness.inspected)return null;
 return{fieldId:visit.fieldId,landmarkWitnessed:true,returned:true,connectionId:visit.connectionId};
}
// Real metres per second. A slow render cannot turn an 8.5cm authoring sample
// into the ordinary half-metre input scheduler, or tunnel across the return.
export function walkStationField(state,visit,{dt=0,forward=0,side=0}={}){
 if(state.stage!=='active')return{state:{...state,witness:{...state.witness}},distance:0,returned:false};
 const next={...state,witness:{...state.witness}},step=clamp(dt,0,.1),length=Math.max(1,Math.hypot(forward,side)),speed=WALK*step/length,sin=Math.sin(state.yaw),cos=Math.cos(state.yaw);
 const dx=(sin*forward+cos*side)*speed,dz=(-cos*forward+sin*side)*speed,parts=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
 let distance=0,returned=false;
 for(let i=0;i<parts;i++){
  const sx=dx/parts,sz=dz/parts,door=visit.returnDoor;let nx=next.x+sx,nz=next.z+sz;
  const exitPlane=door.z+.22;
  if(door.open&&next.z<exitPlane&&nz>=exitPlane&&Math.abs(next.x+sx*(exitPlane-next.z)/(sz||1)-door.x)<=door.halfWidth-.22){
   const fraction=clamp((exitPlane-next.z)/(sz||1),0,1);next.x+=sx*fraction;next.z=exitPlane;distance+=Math.hypot(sx,sz)*fraction;
   next.stage='returning';next.returnReason='crossed-return';next.returnElapsed=0;returned=true;break;
  }
  // A closed familiar leaf and both visible return jambs refuse the same
  // 44cm body. The open centre returns; walking beside it does not.
  const leaf=visit.memoryVisit.door;
  const blocked=(x,z)=>!!(leaf&&Math.abs(x-leaf.x)<.62+.22&&Math.abs(z-leaf.z)<.045+.22)
    ||Math.abs(z-door.z)<.09+.22&&Math.abs(x-door.x)>door.halfWidth-.22&&Math.abs(x-door.x)<door.halfWidth+.09+.22;
  if(blocked(nx,nz)){
   if(sx&&!blocked(next.x+sx,next.z))nz=next.z;
   else if(sz&&!blocked(next.x,next.z+sz))nx=next.x;
   else continue;
  }
  distance+=Math.hypot(nx-next.x,nz-next.z);next.x=nx;next.z=nz;
 }
 return{state:next,distance,returned};
}

export function createStationFieldScene({visit,checkpoint=null,renderer,audio=null,presentation=()=>({}),paintOverlay=()=>{},onCheckpoint=()=>{},onDone=()=>{},onError=()=>{},onExit=()=>{},onFootContact=null,clearFootContacts=()=>{}}={}){
 if(typeof renderer?.render!=='function')throw new TypeError('The station field needs its actual field renderer');
 let state=normalizeStationFieldCheckpoint(checkpoint,visit),ready=false,closed=false,done=false,failed=false,paused=false,initializing=null,disposed=false,audioStopped=false,audioStarted=false,lastSaved=Math.floor(state.elapsed),interactDown=false,caption=null,captionUntil=0;
 // Render acknowledgement is deliberately not saved: a resumed return still
 // owes this viewer one fully opaque presented frame before the world swaps.
 let opaquePresented=false,returnSaved=state.stage==='returning'&&state.returnElapsed>=RETURN_SECONDS;
 const pendingAudioEvents=[];
 const footOwner='station-field',footClock=createFootContactClock();
 const keys=new Set(),p=()=>presentation()||{},held=()=>{const v=p();return paused||v.paused||v.hidden||v.focused===false;};
 const snapshot=()=>JSON.parse(JSON.stringify(state));
 function persist(reason){try{onCheckpoint(snapshot(),reason);}catch(error){onError(error);}}
 function resetFeet(){footClock.reset(footOwner);clearFootContacts(footOwner);}
 function syncAudio(stopped){
  if(!audioStarted&&!stopped&&!audioStopped&&!(state.stage==='returning'&&state.returnElapsed>=RETURN_SECONDS)){
   audio?.start?.(visit.memoryVisit);audioStarted=true;
   for(const event of pendingAudioEvents.splice(0))audio?.event?.(event);
  }
  if(audioStarted)audio?.setPaused?.(stopped);
 }
 function stopAudio(){if(audioStopped)return;audioStopped=true;audio?.stop?.();}
 function release(){if(disposed)return;disposed=true;resetFeet();stopAudio();renderer.dispose?.();}
 function finish(reason=state.returnReason,error=null){
  if(done||closed)return false;done=true;keys.clear();resetFeet();stopAudio();const receipt=error?null:stationFieldReceipt(state,visit);
  onDone({fieldId:visit.fieldId,connectionId:visit.connectionId,meaningful:!!receipt,receipt,reason,error,checkpoint:snapshot()});return true;
 }
 function fail(error){if(failed||done||closed)return;failed=true;keys.clear();onError(error);finish('unavailable',String(error?.message||error));}
 function requestReturn(reason){if(state.stage!=='active')return false;state={...state,stage:'returning',returnReason:reason,returnElapsed:0};opaquePresented=false;returnSaved=false;keys.clear();resetFeet();persist('return-start');return true;}
 function interact(){
  if(!ready||closed||done||failed||held()||state.stage!=='active')return false;
  const focus=stationFieldFocus(state,visit);if(!focus)return false;
  if(focus.kind==='return-door')return requestReturn('used-return');
  caption=visit.landmark.text;captionUntil=state.elapsed+5;
  if(visit.landmark.id==='field-van-door'){
   if(audioStarted)audio?.event?.({type:'try'});else pendingAudioEvents.push({type:'try'});
  }
  if(!state.witness.inspected){state={...state,witness:{landmarkId:visit.landmark.id,inspected:true,at:state.elapsed}};persist('landmark-inspected');}
  return true;
 }
 function frame(){
  const ant=visit.memoryVisit.ant;
  return{...state,witness:{...state.witness},decay:visit.snapshotDecay,eyeH:1.62,returnDoor:{...visit.returnDoor},deformation:stationFieldDeformation(state,visit),
   ...(ant?{ant:{t:state.elapsed,tried:false,quiet:0,done:false,said:{}}}:{}),said:{},quiet:0,tries:0,lastTry:null,released:null,leaving:null,left:false};
 }
 const scene={id:'station-field',blocksWorld:true,blocksInput:true,suppressesHud:true,worldPresentation:'hidden',handlesEscape:false,lookProfile:'explore',faceplate:false,
  get allowsLook(){return ready&&!closed&&!done&&!failed&&!held();},
  initialize(){if(initializing)return initializing;initializing=Promise.resolve().then(()=>renderer.initialize?.(visit.memoryVisit)).then(ok=>{if(closed){release();return false;}if(ok===false)throw Error('The field could not be prepared');ready=true;persist('entered');return true;}).catch(error=>{fail(error);return false;});return initializing;},
  enter(){void scene.initialize();},
  update(dt){
   if(!ready||closed||done||failed)return;const stopped=held();syncAudio(stopped);if(stopped){keys.clear();resetFeet();return;}
   if(state.stage==='returning'&&state.returnElapsed>=RETURN_SECONDS&&opaquePresented){finish();return;}
   const step=clamp(dt,0,.1);state={...state,elapsed:state.elapsed+step};
   if(caption&&state.elapsed>=captionUntil)caption=null;
   if(state.stage==='returning'){
    state.returnElapsed=Math.min(RETURN_SECONDS,state.returnElapsed+step);
    if(state.returnElapsed>=RETURN_SECONDS&&!returnSaved){returnSaved=true;persist('return-ready');}
   }else{
    const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
    const result=walkStationField(state,visit,{dt:step,forward,side});state=result.state;
    if(typeof onFootContact==='function')for(const plant of footClock.update({dt:Number(dt)||0,distance:result.distance,scene:footOwner,supported:true,active:!result.returned}))
      onFootContact({...plant,owner:footOwner,surface:'earth',profile:'physical',position:{x:state.x,z:state.z},distanceM:plant.distance,strideM:plant.stride,level:.14,condition:'walk',time:state.elapsed});
    if(result.returned){opaquePresented=false;returnSaved=false;keys.clear();resetFeet();persist('return-start');}
   }
   const second=Math.floor(state.elapsed);if(second!==lastSaved){lastSaved=second;persist('active-second');}
   audio?.update?.(frame(),visit.memoryVisit);
  },
  serialize:snapshot,
  view:()=>({ready:ready&&!failed&&!closed,paused:held(),closed,done,failed,state:snapshot(),focus:stationFieldFocus(state,visit),witness:{...state.witness},deformation:stationFieldDeformation(state,visit)}),
  lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
  lookBy(yaw,pitch){if(!scene.allowsLook)return false;state={...state,yaw:wrap(state.yaw+finite(yaw)),pitch:clamp(state.pitch+finite(pitch),-1.25,1.25)};return true;},
  setLook(look={}){if(!scene.allowsLook)return false;state={...state,yaw:wrap(finite(look.yaw,state.yaw)),pitch:clamp(look.pitch??state.pitch,-1.25,1.25)};return true;},
  pause(){paused=true;keys.clear();resetFeet();audio?.setPaused?.(true);},resume(){paused=false;},blur(){scene.pause();},focus(){scene.resume();},suspend(){scene.pause();},
  interact,
  key(e={}){const key=keyOf(e);if(key==='escape'||e.controllerAction==='back'){keys.clear();return false;}if(e.ctrlKey||e.metaKey||e.altKey)return true;if(!e.repeat&&(key==='e'||e.controllerAction==='interact'))interact();else if(!e.repeat&&ready&&!held()&&movement.has(key))keys.add(key);return true;},
  keyup(e={}){keys.delete(keyOf(e));if(keyOf(e)==='e')interactDown=false;return true;},
  input(name,value=true){if(name==='interact'){if(value&&!interactDown)interact();interactDown=!!value;return true;}const key=moveActions[name]||name;if(!movement.has(key))return false;if(!value)keys.delete(key);else if(ready&&!held())keys.add(key);return true;},
  render(){
   if(closed||done)return;if(!ready){paintOverlay({loading:!failed,error:failed,coverAlpha:1});return;}
   try{const v=p(),value=frame(),look=memoryFieldLook(value,visit.memoryVisit,{reducedMotion:!!v.reducedMotion,reducedDread:!!v.reducedDread,reducedFlash:!!v.reducedFlash});
    if(renderer.render(value,look)===false)throw Error('The field picture was interrupted');
    const coverAlpha=state.stage==='returning'?state.returnElapsed/RETURN_SECONDS:0;
    const painted=paintOverlay({state:value,focus:stationFieldFocus(state,visit),caption,coverAlpha});
    if(coverAlpha>=1&&!held()&&painted!==false)opaquePresented=true;
   }catch(error){fail(error);}
  },
  exit(){if(closed)return;closed=true;keys.clear();if(!done&&!failed)persist('exit');release();onExit();},
 };
 return scene;
}
