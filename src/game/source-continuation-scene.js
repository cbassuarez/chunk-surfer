import {normalizeSourceContinuation,stepSourceContinuation,continuationFocus,sourceContinuationThreatTelemetry} from './source-continuation.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// This scene borrows the shared renderer. It never writes the original body's
// position, recorder, injuries, inventory, quest receipts or Contact consent.
export function createSourceContinuationScene({checkpoint,renderer,audio=null,studyRotation=0,
  onCheckpoint=()=>{},onReturn=()=>{},onComplete=()=>{},onExit=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  if(typeof renderer?.render!=='function')throw Error('Source continuation needs its physical renderer.');
  let state=normalizeSourceContinuation(checkpoint),ready=false,closed=false,paused=false,
    leaving=false,error=null,failedFinish=null,initializing=null,drag=null,saveClock=0,traceClock=0,handoff=null;
  const rotation=Number.isFinite(studyRotation)?studyRotation:0;
  const presented=(x,z)=>{const dx=x+23,c=Math.cos(rotation),s=Math.sin(rotation);return{x:-23+dx*c-z*s,z:dx*s+z*c};};
  function soundState(){
    if(state.phase!=='catch'||!rotation)return state;
    const w=state.counterweight;
    return{...state,...presented(state.x,state.z),yaw:state.yaw+rotation,
      counterweight:w?{...w,...presented(w.x,w.z)}:w};
  }
  const keys=new Set();
  const debugTrace=!!import.meta.env?.DEV&&new URLSearchParams(globalThis.location?.search||'').has('sourceTrace');
  let loggedSecond=-1;
  function trace(value){
    onTrace(value);
    const second=Math.floor(state.elapsed);
    if(debugTrace&&(value.type!=='pose'||second!==loggedSecond)){
      if(value.type==='pose')loggedSecond=second;
      console.debug('SOURCE_CONTINUATION_TRACE',JSON.stringify(value));
    }
  }
  const clear=()=>{keys.clear();drag=null;};
  const live=()=>ready&&!closed&&!leaving&&!error&&renderer.ready?.()!==false;
  const snapshot=()=>copy(state);
  const report=err=>{error=String(err?.message||err);clear();audio?.stop?.();onError(err);};
  function save(reason){const value=snapshot();onCheckpoint(value,{reason});return value;}
  function dispatchFinish(kind){
    audio?.stop?.();handoff=null;
    const value=save(kind);
    try{
      const result=kind==='complete'?onComplete({checkpoint:value}):onReturn({checkpoint:value,returnPose:value.returnPose});
      Promise.resolve(result).then(ok=>{if(ok===false)throw Error('The threshold could not be restored. Try it again.');})
        .catch(err=>{if(!closed){leaving=false;failedFinish=kind;report(err);}});
    }catch(err){leaving=false;failedFinish=kind;report(err);return false;}
    return true;
  }
  function finish(kind){
    if(closed||leaving)return false;
    const canRender=live();clear();leaving=true;save(kind);
    // Let the physical latch/contact finish in the same rendered world before
    // releasing the shared presentation. This clock freezes with normal pause.
    if(canRender)handoff={kind,elapsed:0,duration:.35};else return dispatchFinish(kind);
    return true;
  }
  function apply(input){
    const choice=input.interact?continuationFocus(state)?.id:null;
    const result=stepSourceContinuation(state,input);state=result.state;
    const events=result.events|| (result.event?[result.event]:[]);
    for(const event of events){
      if(event.type==='phase')clear();
      audio?.event?.(event,soundState());trace({type:'event',event:copy(event),choiceId:choice||null,phase:state.phase,elapsed:state.elapsed});
    }
    if(result.event?.type==='return'||events.some(e=>e.type==='return'))finish('return');
    else if(result.event?.type==='complete'||events.some(e=>e.type==='complete'))finish('complete');
    else if(events.length)save('interaction');
  }
  const scene={
    id:'source-continuation',blocksWorld:true,blocksInput:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{
        if(closed)return false;if(ok===false)throw Error('The next Source has not resolved.');
        ready=true;save('entry-or-resume');return true;
      }).catch(err=>{if(!closed)report(err);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused)return;
      if(handoff){
        if(!ready||renderer.ready?.()===false){clear();audio?.pause?.();return;}
        handoff.elapsed+=Math.min(.25,Math.max(0,Number(dt)||0));
        audio?.update?.({dt,state:soundState(),focus:null,paused:false,ready:true});
        if(handoff.elapsed>=handoff.duration)dispatchFinish(handoff.kind);
        return;
      }
      if(leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      const overhead=state.phase==='catch';
      const turn=overhead?0:Number(keys.has('arrowright'))-Number(keys.has('arrowleft'));
      let forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side=Number(keys.has('d')||overhead&&keys.has('arrowright'))-Number(keys.has('a')||overhead&&keys.has('arrowleft'));
      if(overhead&&rotation){const c=Math.cos(rotation),s=Math.sin(rotation),x=side*c-forward*s,z=-side*s-forward*c;side=x;forward=-z;}
      apply({dt,forward,side,
        ...(turn?{look:{yaw:state.yaw+turn*Math.min(.25,Math.max(0,Number(dt)||0))*1.8,pitch:state.pitch}}:{}),renderReady:true});
      if(closed||leaving)return;
      const focus=continuationFocus(state);
      const soundFocus=focus&&overhead&&rotation?{...focus,...presented(focus.x,focus.z),
        position:focus.position?{...focus.position,...presented(focus.position.x,focus.position.z)}:undefined}:focus;
      audio?.update?.({dt,state:soundState(),focus:soundFocus,paused:false,ready:true});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));traceClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=1){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;trace({type:'pose',elapsed:state.elapsed,phase:state.phase,
        x:state.x,z:state.z,feet:state.feet,yaw:state.yaw,pitch:state.pitch,level:state.level,
        focus:continuationFocus(state)?.id||null,closure:copy(state.closure||null),counterweight:copy(state.counterweight||null),
        recovery:copy(state.recovery||null),reveal:copy(state.reveal||null),grace:state.grace,
        doorOpen:copy(state.doorOpen||{}),doorMotion:copy(state.doorMotion||{}),audio:audio?.snapshot?.()||null,
        studyRotation:rotation,presented:state.phase==='catch'?presented(state.x,state.z):{x:state.x,z:state.z},
        // Record current contact/reachability context cheaply. Long-horizon
        // stationary predictions run offline against saved traces, not in a
        // live frame (they simulate the authored machinery, including hoist).
        threat:sourceContinuationThreatTelemetry(state,{horizonSeconds:0}),
        threatDistanceMetres:state.phase==='catch'&&state.counterweight?.active
          ?Math.hypot(state.x-state.counterweight.x,state.z-state.counterweight.z,state.feet-state.counterweight.y)
          :state.phase==='wrong-return'&&state.closure?.mode==='closing'?Math.abs(state.z-state.closure.frontZ):null});}
    },
    view:()=>({...snapshot(),ready:live(),closed,paused,leaving,error,handoff:copy(handoff),focus:live()?continuationFocus(state):null}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    pause(){if(closed)return false;paused=true;clear();audio?.pause?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    setLook(look){if(state.phase==='catch'||!live()||paused)return false;apply({dt:0,look,renderReady:true});return true;},
    key(e={}){
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(paused){clear();return true;}
      if(!live()){
        clear();if(!e.repeat&&(key==='x'||key==='e')&&error)finish(key==='e'&&failedFinish?failedFinish:'return');return true;
      }
      if(movement.includes(key)){if(!e.repeat&&!state.reveal)keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true,renderReady:true});
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!live()||paused||state.phase==='catch'){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.30,Math.min(.62,state.pitch-(y-drag.y)*.003))},renderReady:true});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render({...state,handoff})===false)throw Error('The Source view is unavailable.');}catch(err){ready=false;report(err);}}
      // Physical handles, foot treads, moving machinery and the shared sound
      // field carry the interaction. The scene never paints gameplay words.
      // Retain the last valid frame during preparation or a recoverable fault.
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
