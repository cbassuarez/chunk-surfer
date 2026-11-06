import { uiFill, uiSize, uiText } from '../render/ui.js';
import { promptLine } from './bindings.js';
import { isFrozen } from './scenes.js';
import { OPENING_VEHICLE, openingVehicleExitFrame, openingVehiclePoint, setOpeningVehicleRadioLeaning } from '../data/opening-vehicle.js';
import {OPENING_ARRIVAL_DRIVE,createOpeningArrivalDrive,openingArrivalAnchor,openingArrivalCanExit,openingArrivalSnapshot,stepOpeningArrivalDrive} from './opening-arrival-drive.js';
import {openingCabFocus} from './opening-cab-inspection.js';
import {CAB_RADIO_LEAN,cabRadioPoint} from '../data/cab-radio.js';

export const OPENING_VEHICLE_SCENE = 'opening-vehicle';
const KEY_INPUTS={keyw:'forward',w:'forward',arrowup:'forward',keys:'reverse',s:'reverse',arrowdown:'reverse',keya:'left',a:'left',arrowleft:'left',keyd:'right',d:'right',arrowright:'right',space:'brake',' ':'brake'};
const ACTION_INPUTS={forward:'forward',moveForward:'forward',reverse:'reverse',backward:'reverse',moveBackward:'reverse',left:'left',moveLeft:'left',strafeLeft:'left',right:'right',moveRight:'right',strafeRight:'right',brake:'brake'};
const finite=(n,f=0)=>Number.isFinite(n)?n:f,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function makeOpeningVehicleScene({
  getAnchor=()=>null,getAssetStatus=()=>({loaded:false}),getDriveEnvironment=()=>({}),
  toWorldView=eye=>eye,getLook=()=>({yaw:0,pitch:-.04}),driveEnabled=true,automaticParking=true,checkpoint=null,
  reducedMotion=false,onReady=()=>{},onDoor=()=>{},onUpdate=()=>{},onEvent=()=>{},onCheckpoint=()=>{},
  onDone=()=>{},onExit=()=>{},onInspect=()=>false,getCabState=()=>({}),projectWorld=()=>null,
}={}){
  let lean=0,leanTarget=0;
  const stepLean=dt=>{if(reducedMotion){lean=leanTarget;return;}const reach=finite(dt)/CAB_RADIO_LEAN.seconds;lean=lean<leanTarget?Math.min(leanTarget,lean+reach):Math.max(leanTarget,lean-reach);};
  let phase='loading',anchor=null,drive=null,elapsed=0,reveal=0,startYaw=0,startPitch=-.04,exited=false,completed=false,error=null,held=false;
  let headYaw=finite(checkpoint?.headYaw),headPitch=finite(checkpoint?.headPitch,-.04),lastCheckpoint=0,doorCloseAnnounced=false,stepAnnounced=false;
  let exitLookYaw=finite(checkpoint?.exitLookYaw),exitLookPitch=finite(checkpoint?.exitLookPitch);
  let launchSeconds=0;
  const pressed=new Set(),input=()=>Object.fromEntries([...pressed].map(k=>[k,true]));
  const clearInput=()=>{pressed.clear();launchSeconds=0;if(drive){drive.throttle=0;drive.directionHold=0;drive.hillStartDirection=0;}},emit=event=>onEvent({...event,sceneId:OPENING_VEHICLE_SCENE});
  const currentAnchor=()=>drive?openingArrivalAnchor(drive):anchor;
  const canExit=()=>lean<=0&&(phase==='seated'||phase==='parked'&&openingArrivalCanExit(drive,input()));
  // Leaning over to the radio: the head goes to it and comes back to where it was looking.
  function leaningFrame(at){
    const k=lean*lean*(3-2*lean),from=OPENING_VEHICLE.eye,to=CAB_RADIO_LEAN.eye,target=CAB_RADIO_LEAN.target;
    const dx=target[0]-to[0],dy=target[1]-to[1],dz=target[2]-to[2],yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
    return{eye:openingVehiclePoint(at,from.map((v,i)=>v+(to[i]-v)*k)),yaw:at.yaw+headYaw+(yaw-headYaw)*k,pitch:headPitch+(pitch-headPitch)*k,doorOpen:0,fade:0};
  }
  function frame(){
    if(isFrozen(scene))clearInput();
    const at=currentAnchor();if(!at)return null;
    return phase==='exiting'?openingVehicleExitFrame(at,elapsed,{reducedMotion,startYaw,startPitch,lookYaw:exitLookYaw,lookPitch:exitLookPitch})
      :leaningFrame(at);
  }
  function view(){if(isFrozen(scene))clearInput();const at=currentAnchor(),value={phase,elapsed,reveal,error,completed,anchor:at,drive:drive?{...openingArrivalSnapshot(drive),canExit:canExit(),wipers:!reducedMotion}:null,parked:phase==='parked',canExit:canExit(),...frame()};
    return{...value,focus:openingCabFocus(value,getCabState())};}
  function serialize(){return{schema:1,phase,elapsed,reveal,headYaw,headPitch,startYaw,startPitch,exitRevision:OPENING_VEHICLE.exitRevision,exitLookYaw,exitLookPitch,doorCloseAnnounced,stepAnnounced,drive:drive?openingArrivalSnapshot(drive):null};}
  function publish(save=false){onUpdate(view());if(save){lastCheckpoint=drive?.elapsed||0;onCheckpoint(serialize());}}
  function leave(){
    if(!canExit()||completed||exited)return false;
    const before=frame();phase='exiting';elapsed=0;startYaw=before.yaw;startPitch=before.pitch;exitLookYaw=0;exitLookPitch=0;
    clearInput();onDoor();emit({type:'opening-vehicle-door-open',id:'opening-driver-door',seconds:drive?.elapsed||0,position:openingVehiclePoint(currentAnchor(),OPENING_VEHICLE.doorHinge),anchor:currentAnchor()});publish(true);return true;
  }
  function action(event){return ACTION_INPUTS[event.controllerAction]||KEY_INPUTS[String(event.code||event.key||'').toLowerCase()];}
  const scene={
    id:OPENING_VEHICLE_SCENE,blocksInput:true,blocksWorld:true,suppressesHud:true,handlesEscape:false,worldPresentation:'visible',lookProfile:'calm',
    get allowsLook(){return!held&&!exited&&!completed&&!isFrozen(scene)&&['seated','driving','parked','exiting'].includes(phase);},
    update(dt){
      stepLean(dt);
      if(exited||completed||held||isFrozen(scene)){clearInput();return;}
      const step=Math.max(0,finite(Number(dt)));
      if(phase==='loading'){
        const status=getAssetStatus();error=status?.error||null;anchor=getAnchor();if(!anchor||(!status?.loaded&&!error))return;
        if(driveEnabled&&!error){const environment=getDriveEnvironment({...anchor})||{},fresh=!checkpoint?.drive;
          drive=createOpeningArrivalDrive(anchor,{spawn:environment.spawn,checkpoint:checkpoint?.drive,alreadyDriving:fresh,autoPark:automaticParking});
          launchSeconds=fresh?OPENING_ARRIVAL_DRIVE.arrivalLeadSeconds:0;
          phase=checkpoint?.schema===1&&checkpoint.phase==='exiting'?'exiting':drive.parked?'parked':'driving';
          reveal=drive.arrivalRestarted?0:clamp(finite(checkpoint?.reveal),0,1);
          const exitScale=checkpoint?.exitRevision===OPENING_VEHICLE.exitRevision?1:OPENING_VEHICLE.exitSeconds/2.65;
          elapsed=phase==='exiting'?clamp(finite(checkpoint.elapsed)*exitScale,0,OPENING_VEHICLE.exitSeconds):0;
          startYaw=finite(checkpoint?.startYaw,currentAnchor().yaw);startPitch=finite(checkpoint?.startPitch,-.04);doorCloseAnnounced=!!checkpoint?.doorCloseAnnounced;stepAnnounced=!!checkpoint?.stepAnnounced;
        }else phase='seated';
        onReady(currentAnchor());publish();return;
      }
      if(phase==='seated'){reveal=Math.min(1,reveal+step/.85);publish();return;}
      if(phase==='driving'||phase==='parked'){
        reveal=Math.min(1,reveal+step/.85);
        // The opening is the last few metres of arriving, not a driving test.
        // Its real physics steers and brakes into the bay while look stays
        // free. Pedal/steering intent cannot unpark it or block the exit.
        const controls=input(),lead=launchSeconds>0&&pressed.size===0;
        for(const event of stepOpeningArrivalDrive(drive,step,lead?{...controls,forward:true}:controls,getDriveEnvironment(currentAnchor())||{}))emit(event);
        launchSeconds=Math.max(0,launchSeconds-Math.min(.25,step));
        const previous=phase;phase=drive.parked?'parked':'driving';publish(previous!==phase||(drive.elapsed-lastCheckpoint>=3));return;
      }
      const before=elapsed;elapsed+=step;
      if(!stepAnnounced&&elapsed>=OPENING_VEHICLE.exitStepAt){stepAnnounced=true;emit({type:'opening-vehicle-exit-step',id:'opening-exit-step',seconds:(drive?.elapsed||0)+OPENING_VEHICLE.exitStepAt,position:{...frame().eye,y:currentAnchor().y},anchor:currentAnchor()});}
      if(!doorCloseAnnounced&&elapsed>=OPENING_VEHICLE.exitDoorCloseAt){doorCloseAnnounced=true;emit({type:'opening-vehicle-door-close',id:'opening-driver-door',seconds:(drive?.elapsed||0)+OPENING_VEHICLE.exitDoorCloseAt,position:openingVehiclePoint(currentAnchor(),OPENING_VEHICLE.doorHinge),anchor:currentAnchor()});}
      publish(before<OPENING_VEHICLE.exitDoorCloseAt&&elapsed>=OPENING_VEHICLE.exitDoorCloseAt);
      if(frame().done){completed=true;const result={...view(),...frame(),anchor:currentAnchor()};onDone(result);}
    },
    worldView(){const f=frame();if(!f)return null;return{...toWorldView(f.eye,{...f,anchor:currentAnchor(),drive:drive?openingArrivalSnapshot(drive):null,phase}),yaw:f.yaw,pitch:f.pitch,suppressActors:true};},
    view,serialize,
    radioLean:{set(on){leanTarget=on?1:0;setOpeningVehicleRadioLeaning(on===true);},step:stepLean,amount:()=>lean,
      project(x,y,z=0){const at=currentAnchor();return at?projectWorld(openingVehiclePoint(at,cabRadioPoint(x,y,z))):null;}},
    lookAngles:()=>phase==='exiting'?{yaw:frame().yaw-currentAnchor().yaw,pitch:frame().pitch}:{yaw:headYaw,pitch:headPitch},
    lookBy(yaw,pitch){if(!scene.allowsLook)return false;
      if(phase==='exiting'){exitLookYaw=clamp(exitLookYaw+finite(yaw),-2.4,2.4);exitLookPitch=clamp(exitLookPitch+finite(pitch),-1.2,.75);}
      else{headYaw=clamp(headYaw+finite(yaw),-2.4,2.4);headPitch=clamp(headPitch+finite(pitch),-1.2,.75);}return true;},
    input(name,value=true){const key=ACTION_INPUTS[name];if(!key)return false;if(automaticParking)return true;if(!value)pressed.delete(key);else if(scene.allowsLook&&(phase==='driving'||phase==='parked')){launchSeconds=0;pressed.add(key);}return true;},
    key(event={}){
      const key=String(event.code||event.key||'').toLowerCase();if(key==='escape'||event.controllerAction==='back'){clearInput();return false;}
      if(event.ctrlKey||event.metaKey||event.altKey)return true;
      if(held||exited||isFrozen(scene))return true;
      const control=action(event);if(control){if(event.pressed===false||event.value===0)pressed.delete(control);else if(!event.repeat)scene.input(control);return true;}
      if(event.repeat)return true;
      if(['keye','e','enter','numpadenter'].includes(key)||['interact','confirm'].includes(event.controllerAction)){
        const focus=view().focus;
        if(focus?.type==='inspect'&&canExit()){
          if(onInspect({...focus,anchor:currentAnchor()})===true){clearInput();publish(true);}
        }else if(focus?.type==='exit')leave();
      }
      return true;
    },
    keyup(event={}){const control=action(event);if(control)pressed.delete(control);return true;},
    blur(){held=true;clearInput();},suspend(){held=true;clearInput();},resume(){held=false;clearInput();},
    exit(){if(exited)return;exited=true;clearInput();onExit({completed,checkpoint:serialize(),anchor:currentAnchor()});},
    render(){
      const{cols,rows}=uiSize(),f=frame(),veil=phase==='loading'?1:phase==='exiting'?f.fade:1-reveal;
      if(veil>.001)uiFill(0,0,cols,rows,`rgba(4,5,7,${veil.toFixed(3)})`);
      if(!['seated','parked','driving'].includes(phase))return;
      const focus=view().focus,prompt=phase==='driving'?(automaticParking?'ARRIVING…':'W / S · DRIVE   A / D · STEER   SPACE · BRAKE')
        :focus&&canExit()&&lean<=0?promptLine([{action:'interact',label:focus.label}]):'';
      if(prompt)uiText(Math.max(2,Math.floor((cols-prompt.length)/2)),rows-3,prompt,'ui-primary',Math.min(1,reveal*1.5));
      if(error)uiText(2,rows-5,'CABIN UNAVAILABLE','ui-secondary',.8);
    },
  };
  return scene;
}
