import {createSceneRunKey} from './locomotion.js';
import {SOURCE_EARTHFALL as C} from '../data/source-earthfall.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as ASIDE} from '../data/source-earthfall-ellery-aside.js';
import {freshSourceEarthfallElleryAside,stepSourceEarthfallElleryAside,sourceEarthfallElleryAsideFrame,sourceElleryAsideFooting} from './source-earthfall-ellery-aside.js';
import {uiDraw} from '../render/ui.js';
import {normalizeSourceEarthfall,stepSourceEarthfall,sourceEarthfallFrame,sourceEarthfallFocus} from './source-earthfall.js';
import {createFootContactClock} from '../audio/foot-contact.js';
import {recordNightClockTravel} from './night-clock-travel.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// The borrowed view owns the entire descent in metres. The original Source
// body and the next room's checkpoint remain with their existing controllers.
export function createSourceEarthfallScene({checkpoint,renderer,audio=null,
  presentation=()=>({}),onTorch=()=>false,onInstrumentTick=()=>{},onCheckpoint=()=>{},onReturn=()=>{},onComplete=()=>{},
  onExit=()=>{},onError=()=>{},onTrace=()=>{},onFootContact=null,clearFootContacts=()=>{},onAcceptedTravel=recordNightClockTravel,enableElleryAside=typeof renderer?.renderAside==='function',
  getPlayerNoise=()=>false,onHushContact=()=>false,onCancelHushContact=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('The descending Source needs its physical renderer.');
  let state=normalizeSourceEarthfall(checkpoint),ready=false,closed=false,paused=false,
    leaving=false,error=null,failedFinish=null,initializing=null,drag=null,saveClock=0,traceClock=0;
  const footOwner='source-earthfall:ellery';
  const footClock=createFootContactClock();
  let footIndex=0;
  const keys=new Set();
  const runKey=createSceneRunKey(),clear=()=>{keys.clear();runKey.clear();drag=null;footClock.reset(footOwner);clearFootContacts?.(footOwner);};
  const snapshot=()=>copy(state);
  const asideActive=()=>state.elleryAside?.status==='active';
  let asideEvents=[];
  let pendingContactSaved=null;
  const live=()=>ready&&!closed&&!leaving&&!error&&renderer.ready?.()!==false;
  const save=reason=>{const value=snapshot();onCheckpoint(value,{reason});return value;};
  function report(reason){error=String(reason?.message||reason);clear();audio?.stop?.();onError(reason);}
  function finish(kind){
    if(closed||leaving)return false;
    clear();leaving=true;audio?.stop?.();const checkpoint=save(kind);
    try{Promise.resolve(kind==='complete'?onComplete({checkpoint}):onReturn({checkpoint}))
      .then(ok=>{if(ok===false)throw Error('The original threshold is still there.');})
      .catch(reason=>{if(!closed){leaving=false;failedFinish=kind;report(reason);}});
    }catch(reason){leaving=false;failedFinish=kind;report(reason);return false;}
    return true;
  }
  function apply(input){
    const p=presentation()||{};
    const protectedStep=!!p.protected||!!p.suspended||!!p.hidden||p.focused===false;
    if(paused||p.protected||p.suspended||p.hidden||p.focused===false){footClock.reset(footOwner);clearFootContacts?.(footOwner);onCancelHushContact();}
    if(asideActive()){
      const before=state.elleryAside;
      const playerNoise=Number(input.dt)>0&&getPlayerNoise(input.dt,{armed:!protectedStep&&!p.reducedDread&&before.gag?.elapsed>=6,phase:before.chase?.phase})===true;
      const result=stepSourceEarthfallElleryAside(state.elleryAside,{...input,playerNoise,paused,protected:protectedStep,assetsReady:live(),gagAudioReady:audio?.asideGagReady?.()!==false,reducedMotion:!!p.reducedMotion,reducedDread:!!p.reducedDread});state.elleryAside=result.state;asideEvents=result.events;
      if((typeof onFootContact==='function'||typeof onAcceptedTravel==='function')&&Number(input.dt)>0&&live()&&!paused&&!p.protected&&!p.suspended&&!p.hidden&&p.focused!==false&&state.elleryAside.status==='active'){
        const next=state.elleryAside,standing=sourceElleryAsideFooting(before.x,before.z,before.elapsed,before),contact=sourceElleryAsideFooting(next.x,next.z,next.elapsed,next);
        if(standing&&contact&&Math.abs(before.feet-standing.y)<.16&&Math.abs(next.feet-contact.y)<.16&&!before.velocityY&&!next.velocityY){
          // Once the room moves, compare against the same tick with no walking.
          // Its support carry and forced convergence are not the player's gait.
          const passive=next.elapsed>=ASIDE.foldStart||next.chase?.compression>0?stepSourceEarthfallElleryAside(before,{...input,forward:0,side:0,paused:false,protected:false,assetsReady:true}).state:before;
          const distance=input.forward||input.side?Math.hypot(next.x-passive.x,next.z-passive.z):0;
          if(distance>0&&distance<1.3)onAcceptedTravel?.(distance);
          for(const plant of footClock.update({dt:Number(input.dt),distance,scene:footOwner,supported:true,teleported:distance>=1.3})){
            footIndex++;
            onFootContact?.({...plant,owner:footOwner,surface:'service-concrete',profile:'physical',position:{x:next.x,z:next.z},
              distanceM:plant.distance,strideM:plant.stride,level:.12,condition:'walk',id:`${footOwner}:${state.runId}:${footIndex}`,time:next.clock});
          }
        }else footClock.update({dt:Number(input.dt),distance:0,scene:footOwner,supported:false});
      }
      for(const event of result.events)onTrace({type:'aside-event',event:copy(event),elapsed:state.elleryAside.elapsed});
      if(result.complete){
        state.elleryAsideCompleted=true;state.impactPass=1;
        const catchAt=state.elapsed-state.catchElapsed;
        state.elapsed=Math.max(C.footingLossAt,catchAt-ASIDE.resumeFallSeconds);state.committedAt=state.clock-state.elapsed;
        state.phase='falling';state.velocityY=state.catchVelocity||-C.terminalSpeed;state.feet=-state.velocityY*ASIDE.resumeFallSeconds;state.catchElapsed=0;
        audio?.stopAside?.();clear();save('aside-consumed-before-second-impact');onTrace({type:'fall-resume',elapsed:state.elapsed,feet:state.feet,velocityY:state.velocityY,impactPass:1});
      }else if(result.events.length)save('aside-event');
      return;
    }
    const beforeTravel={x:state.x,z:state.z,phase:state.phase};
    const result=stepSourceEarthfall(state,{...input,paused,protected:protectedStep,assetsReady:live()});
    state=result.state;
    if(!paused&&!protectedStep&&live()&&beforeTravel.phase===state.phase&&['intact','fracturing','landed'].includes(state.phase))
      onAcceptedTravel?.(Math.hypot(state.x-beforeTravel.x,state.z-beforeTravel.z));
    const events=result.events||(result.event?[result.event]:[]);
    if(events.some(event=>event.type==='catch'||event.type==='catch-return'))clear();
    for(const event of events)onTrace({type:'event',event:copy(event),elapsed:state.elapsed});
    if(events.some(e=>e.type==='enter-source-II'||e.type==='complete'))finish('complete');
    else if(events.some(e=>e.type==='return'))finish('return');
    else if(events.length)save('event');
    if(enableElleryAside&&!state.elleryAsideCompleted&&!state.elleryAside&&state.phase==='catching'&&state.catchElapsed>=.12){
      state.elleryAside=freshSourceEarthfallElleryAside({runId:state.runId});audio?.stop?.();clear();save('ellery-aside-entry');onTrace({type:'aside-enter',elapsed:state.elapsed});
    }
  }
  const scene={
    id:'source-earthfall',blocksWorld:true,blocksInput:true,suppressesHud:true,
    get allowsLook(){return live()&&!paused&&(asideActive()?state.elleryAside.chase?.phase!=='contact':state.phase!=='catching');},handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.all([Promise.resolve().then(()=>renderer.initialize?.()),
        Promise.resolve().then(()=>audio?.ready?.()).catch(()=>false),Promise.resolve().then(()=>enableElleryAside&&audio?.prepareAside?.()).catch(()=>false)]).then(([ok,,asideAudio])=>{
        if(closed)return false;if(ok===false)throw Error('The lower path has not resolved.');
        if(enableElleryAside&&audio?.asideGagReady&&asideAudio===false)throw Error('The familiar apparatus sound could not be prepared.');
        ready=true;save('entry-or-resume');
        if(asideActive())audio?.updateAside?.(sourceEarthfallElleryAsideFrame(state.elleryAside),{...(presentation()||{}),events:[]});
        if(state.status==='returned'||state.status==='completed'&&!state.exitReceipt?.delivered)
          finish(state.status==='completed'?'complete':'return');
        return true;
      }).catch(reason=>{if(!closed)report(reason);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      const tickPresentation=presentation()||{};
      if(!tickPresentation.protected&&!tickPresentation.hidden&&!tickPresentation.suspended&&tickPresentation.focused!==false
        &&(!asideActive()||audio?.asideGagReady?.()!==false))onInstrumentTick(Math.min(.25,Math.max(0,Number(dt)||0)));
      apply({dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),run:runKey.update(dt,keys.size>0)});
      if(closed||leaving)return;
      const frame=sourceEarthfallFrame(state),p=presentation()||{};
      if(asideActive())audio?.updateAside?.(sourceEarthfallElleryAsideFrame(state.elleryAside),{...p,events:asideEvents,suspended:!!p.suspended});
      else audio?.update?.(frame,{...p,listener:{x:state.x,y:state.feet+1.62,z:state.z,yaw:state.yaw},suspended:!!p.suspended});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));traceClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=.5){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;const a=asideActive()?sourceEarthfallElleryAsideFrame(state.elleryAside):null;onTrace({type:'pose',elapsed:a?.elapsed??state.elapsed,x:a?.x??state.x,z:a?.z??state.z,
        feet:a?.feet??state.feet,yaw:a?.yaw??state.yaw,pitch:a?.pitch??state.pitch,phase:a?.phase??frame.phase,aside:!!a,chase:a?.chase,localHush:a?.localHush,catchSurfaceY:frame.catchSurfaceY,blackoutAlpha:a?.blackoutAlpha??frame.blackoutAlpha});}
    },
    view:()=>({...snapshot(),aside:asideActive()?sourceEarthfallElleryAsideFrame(state.elleryAside):null,ready:live(),closed,paused,leaving,error,frame:sourceEarthfallFrame(state),focus:live()?sourceEarthfallFocus(state):null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();onCancelHushContact();audio?.stop?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    lookAngles:()=>({yaw:asideActive()?state.elleryAside.yaw:state.yaw,pitch:asideActive()?state.elleryAside.pitch:state.pitch}),
    lookBy(yawDelta=0,pitchDelta=0){const look=scene.lookAngles();return scene.setLook({yaw:look.yaw+(Number(yawDelta)||0),pitch:look.pitch+(Number(pitchDelta)||0)});},
    setLook(look){if(!scene.allowsLook)return false;apply({dt:0,look});return true;},
    key(e={}){
      if(runKey.key(e))return true;
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(paused){clear();return true;}
      if(!live()){
        clear();if(!e.repeat&&(key==='x'||key==='e')&&error)finish(key==='e'&&failedFinish?failedFinish:'return');return true;
      }
      if(!e.repeat&&(key==='f'||e.controllerAction==='torch')){onTorch();return true;}
      if(movement.has(key)){if(!e.repeat)keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true});
      return true;
    },
    keyup(e={}){runKey.keyup(e);keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||!scene.allowsLook){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:scene.lookAngles().yaw+(x-drag.x)*.004,pitch:Math.max(-1.42,Math.min(1.25,scene.lookAngles().pitch-(y-drag.y)*.003))}});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if((asideActive()?renderer.renderAside(state.elleryAside,presentation()):renderer.render(state,presentation()))===false)throw Error('The descending path is unavailable.');}catch(reason){ready=false;report(reason);}}
      if(ready&&!closed&&!paused&&asideActive()){
        const a=sourceEarthfallElleryAsideFrame(state.elleryAside),p=presentation()||{},h=a.localHush;
        if(p.protected||p.hidden||p.suspended||p.focused===false||p.reducedDread)onCancelHushContact();
        else if(h?.phase==='contact'&&a.chase?.presentedEventId!==h.eventId){
          if(pendingContactSaved!==h.eventId){save('hush-contact-pending');pendingContactSaved=h.eventId;}
          const proposed=snapshot();proposed.elleryAside.chase.injuryApplied=true;proposed.elleryAside.chase.presentedEventId=h.eventId;
          try{if(onHushContact({eventId:h.eventId,anchor:copy(h),elapsed:a.chase.contactElapsed??h.elapsed,checkpoint:proposed})===true){state=proposed;clear();}}
          catch(reason){onCancelHushContact();report(reason);}
        }
      }
      const blackout=asideActive()?sourceEarthfallElleryAsideFrame(state.elleryAside).blackoutAlpha:sourceEarthfallFrame(state).blackoutAlpha;
      if(blackout>0)uiDraw(({ctx})=>{ctx.save();ctx.fillStyle=`rgba(0,0,0,${blackout})`;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();});
      // Preserve the last valid production frame during preparation/faults.
      // Physical doors, their handles and the falling earth carry this beat;
      // it does not reintroduce HUD instructions between the textless Sources.
    },
    exit(){if(closed)return false;closed=true;clear();onCancelHushContact();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
