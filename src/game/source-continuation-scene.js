import {normalizeSourceContinuation,stepSourceContinuation,continuationFocus,sourceContinuationThreatTelemetry} from './source-continuation.js';
import {SOURCE_CONTINUATION} from '../data/source-continuation.js';
import {portalTransformPoint} from '../render/source-mesh-portals.js';
import {uiDraw,uiSize,uiText} from '../render/ui.js';
import {recordNightClockTravel} from './night-clock-travel.js';
import {continuationContactChapter,sourceContinuationContactFocus,sourceContinuationRecordingReturnProps} from './source-continuation-contact.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const movement=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');

// A straight world-space distance becomes misleading after an impossible
// adjacency. Measure the accepted trail, omitting the fold's coordinate jump.
// Ballistic arcs remain sampled/lower-bound geometry, not an ETA prediction.
function pursuitRouteTrace(state){
  const actor=state.hush;if(!actor?.active)return null;
  let cursor={x:actor.x,z:actor.z,feet:actor.feet},metres=0,folds=0,drops=0,nextFold=null;
  for(const edge of actor.trail||[]){
    metres+=Math.hypot(edge.x-cursor.x,edge.z-cursor.z,edge.feet-cursor.feet);
    cursor={x:edge.x,z:edge.z,feet:edge.feet};
    if(edge.kind==='fold'){
      folds++;nextFold??={id:edge.foldId,side:edge.foldSide,serial:edge.serial};
      if(edge.matrix?.length===16){const p=portalTransformPoint(edge.matrix,[cursor.x,cursor.feet+SOURCE_CONTINUATION.bodyHeight/2,cursor.z]);cursor={x:p[0],feet:p[1]-SOURCE_CONTINUATION.bodyHeight/2,z:p[2]};continue;}
      const t=edge.transform||{},yaw=Number(t.yaw)||0,c=Math.cos(yaw),s=Math.sin(yaw);
      // Production folds currently preserve heading. Keep the diagnostic
      // affine transform identical to the typed edge if that later changes.
      cursor={x:cursor.x*c-cursor.z*s+(Number(t.dx)||0),z:cursor.x*s+cursor.z*c+(Number(t.dz)||0),feet:cursor.feet+(Number(t.dy)||0)};
    }else if(edge.kind==='drop')drops++;
  }
  metres+=Math.hypot(state.x-cursor.x,state.z-cursor.z,state.feet-cursor.feet);
  return{queuedRouteDistanceMetres:metres,nextFold,pendingFolds:folds,pendingDrops:drops,measurement:'accepted trail chords; fold displacement excluded'};
}

// This scene borrows the shared renderer. It never writes the original body's
// position, recorder, injuries, inventory, quest receipts or Contact consent.
export function createSourceContinuationScene({checkpoint,renderer,audio=null,studyRotation=0,tides=false,
  onTorch=()=>false,onInstrumentTick=()=>{},onCheckpoint=()=>{},onReturn=()=>{},onComplete=()=>{},onExit=()=>{},onError=()=>{},onTrace=()=>{},onAcceptedTravel=recordNightClockTravel,
  getContactStatus=()=>null,getRecordingCustody=()=>null,onContact=()=>false,onRecoverRecording=()=>false,onRiftFault=()=>false}={}){
  if(typeof renderer?.render!=='function')throw Error('Source continuation needs its physical renderer.');
  let state=normalizeSourceContinuation(checkpoint),ready=false,closed=false,paused=false,
    leaving=false,error=null,failedFinish=null,initializing=null,drag=null,saveClock=0,traceClock=0,handoff=null,contactHeld=null;
  const rotation=Number.isFinite(studyRotation)?studyRotation:0;
  const presented=(x,z)=>{const center=SOURCE_CONTINUATION.catch.center,dx=x-center.x,dz=z-center.z,c=Math.cos(rotation),s=Math.sin(rotation);return{x:center.x+dx*c-dz*s,z:center.z+dx*s+dz*c};};
  function soundState(){
    if(typeof renderer.acousticFrame==='function')return state;
    if(state.phase!=='catch')return state;
    const w=state.counterweight;
    const h=state.hush;
    // A study rotates the body, view and acoustic field together. Ordinary
    // Source III now uses the listener's real first-person heading.
    return{...state,...presented(state.x,state.z),yaw:state.yaw+rotation,
      counterweight:w?{...w,...presented(w.x,w.z)}:w,
      hush:h?{...h,...presented(h.x,h.z),heading:(Number(h.heading)||0)+rotation}:h};
  }
  const keys=new Set();
  const debugTrace=!!import.meta.env?.DEV&&new URLSearchParams(globalThis.location?.search||'').has('sourceTrace');
  let loggedSecond=-1;
  // The live game feels each Source's tide and the night's wind; a seated
  // listener is anchored, the one place neither reaches.
  let anchored=false;
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
  function interactionFocus(){
    const ordinary=continuationFocus(state),extra=sourceContinuationContactFocus(state,{status:getContactStatus(continuationContactChapter(state)),custody:getRecordingCustody(),protected:paused||!!contactHeld||leaving});
    if(!ordinary)return extra;if(!extra)return ordinary;
    return Math.hypot(state.x-ordinary.x,state.z-ordinary.z)<=extra.distance?ordinary:extra;
  }
  function releaseContact({notice=true}={}){
    if(!contactHeld)return false;const kind=contactHeld;contactHeld=null;clear();
    // A voluntary conversation cannot become an immediate catch when its text
    // closes. Use the follower's existing finite notice interval, not immunity.
    if(notice&&kind==='source-contact'&&state.hush?.active){state.hush.mode='notice';state.hush.notice=SOURCE_CONTINUATION.hush.noticeSeconds;}
    save('contact-released');return true;
  }
  function requestContact(focus){
    if(!focus||contactHeld)return false;
    contactHeld=focus.type;clear();audio?.stop?.();const checkpoint=save(focus.type);
    try{
      const value=focus.type==='source-contact'?onContact({chapter:focus.chapter,focus:copy(focus),checkpoint})
        :onRecoverRecording({receiptId:focus.receiptId,chapter:focus.chapter,locationId:focus.locationId,checkpoint});
      Promise.resolve(value).then(ok=>{if(closed)return;if(focus.type!=='source-contact'||ok!==true)releaseContact({notice:false});})
        .catch(err=>{if(!closed){releaseContact({notice:false});onError(err);}});
    }catch(err){releaseContact({notice:false});onError(err);return false;}
    return true;
  }
  function dispatchFinish(kind){
    audio?.stop?.();handoff=null;
    const value=save(kind);
    trace({type:'handoff-dispatch',kind,elapsed:state.elapsed,phase:state.phase});
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
    trace({type:'handoff-begin',kind,elapsed:state.elapsed,phase:state.phase,duration:.35});
    return true;
  }
  // The host trades this scene for the rift room and restores it from this
  // checkpoint afterwards. A host that declines leaves the body where it is.
  function enterRift(event){
    if(closed||leaving)return false;
    clear();leaving=true;const checkpoint=save('rift-fault'),stay=()=>{if(!closed)leaving=false;};
    try{Promise.resolve(onRiftFault({id:event.id,checkpoint})).then(ok=>{if(ok===false)stay();}).catch(e=>{stay();report(e);});}catch(e){stay();report(e);}
    return true;
  }
  function apply(input){
    const focus=input.interact?interactionFocus():null,choice=focus?.id;
    if(focus&&['source-contact','source-recording-return'].includes(focus.type)){requestContact(focus);return;}
    const result=stepSourceContinuation(state,input);state=result.state;
    if(result.acceptedTravelMetres>0)onAcceptedTravel(result.acceptedTravelMetres);
    const events=result.events|| (result.event?[result.event]:[]);
    for(const event of events){
      if(['phase','capture','recovered','reveal-complete'].includes(event.type)||event.type==='drop'&&!['jump','step-off','portal'].includes(event.trigger)||event.type==='land'&&!['jump','step-off','portal'].includes(event.trigger)){
        const released=[...keys];clear();
        trace({type:'control-boundary',reason:event.type,phase:state.phase,elapsed:state.elapsed,released});
      }
      audio?.event?.(event,soundState(),renderer.acousticFrame?.(state));trace({type:'event',event:copy(event),choiceId:choice||null,phase:state.phase,elapsed:state.elapsed});
      if(event.type==='fold')trace({type:'fold-control-continuity',id:event.id,serial:event.serial,
        elapsed:state.elapsed,held:[...keys],from:copy(event.from),to:copy(event.to),airborne:!!event.airborne});
    }
    if(result.event?.type==='return'||events.some(e=>e.type==='return'))finish('return');
    else if(result.event?.type==='complete'||events.some(e=>e.type==='complete'))finish('complete');
    else if(events.some(e=>e.type==='rift-fault'))enterRift(events.find(e=>e.type==='rift-fault'));
    else if(events.length)save('interaction');
  }
  const scene={
    id:'source-continuation',blocksWorld:true,blocksInput:true,suppressesHud:true,
    get allowsLook(){return live()&&!paused&&state.status!=='returned'&&state.status!=='completed';},handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(initializing)return initializing;
      save('loading');
      initializing=Promise.resolve().then(()=>renderer.initialize?.()).then(ok=>{
        if(closed)return false;if(ok===false)throw Error('The next Source has not resolved.');
        ready=true;save('entry-or-resume');
        // A reload can retain the terminal receipt before the host has changed
        // ownership. Resume that bounded handoff instead of reopening a body
        // whose controller correctly refuses further movement.
        if(state.status==='returned'||state.status==='completed'&&!state.exitReceipt?.delivered)
          finish(state.status==='completed'?'complete':'return');
        return true;
      }).catch(err=>{if(!closed)report(err);return false;});return initializing;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||contactHeld)return;
      if(handoff){
        if(!ready||renderer.ready?.()===false){clear();audio?.pause?.();return;}
        handoff.elapsed+=Math.min(.25,Math.max(0,Number(dt)||0));
        audio?.update?.({dt,state:soundState(),surroundingsState:state,acousticFrame:renderer.acousticFrame?.(state),focus:null,paused:false,ready:true});
        if(handoff.elapsed>=handoff.duration)dispatchFinish(handoff.kind);
        return;
      }
      if(leaving)return;
      if(!live()){clear();audio?.stop?.();return;}
      onInstrumentTick(Math.min(.25,Math.max(0,Number(dt)||0)));
      const overhead=state.phase==='catch';
      const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      apply({dt,forward,side,renderReady:true,environment:!!tides,anchored});
      if(closed||leaving)return;
      const focus=interactionFocus();
      const soundFocus=focus&&overhead&&rotation&&typeof renderer.acousticFrame!=='function'?{...focus,...presented(focus.x,focus.z),
        position:focus.position?{...focus.position,...presented(focus.position.x,focus.position.z)}:undefined}:focus;
      audio?.update?.({dt,state:soundState(),surroundingsState:state,acousticFrame:renderer.acousticFrame?.(state),focus:soundFocus,paused:false,ready:true});
      saveClock+=Math.min(.25,Math.max(0,Number(dt)||0));traceClock+=Math.min(.25,Math.max(0,Number(dt)||0));
      if(saveClock>=1){saveClock=0;save('position');}
      if(traceClock>=.1){traceClock=0;trace({type:'pose',elapsed:state.elapsed,phase:state.phase,
        x:state.x,z:state.z,feet:state.feet,yaw:state.yaw,pitch:state.pitch,level:state.level,chartId:state.chartId??0,cameraTransit:copy(state.cameraTransit||null),
        focus:interactionFocus()?.id||null,closure:copy(state.closure||null),counterweight:copy(state.counterweight||null),
        recovery:copy(state.recovery||null),reveal:copy(state.reveal||null),grace:state.grace,hush:copy(state.hush||null),heading:state.heading,
        foldSerial:state.foldSerial||0,lastFold:copy(state.lastFold||null),lastSpaceWrap:copy(state.lastSpaceWrap||null),
        fall:copy(state.fall||null),recoveryAnchor:copy(state.recoveryAnchor||null),pursuitRoute:pursuitRouteTrace(state),
        doorOpen:copy(state.doorOpen||{}),doorMotion:copy(state.doorMotion||{}),audio:audio?.snapshot?.()||null,
        studyRotation:rotation,presented:state.phase==='catch'?presented(state.x,state.z):{x:state.x,z:state.z},
        // Record current contact/reachability context cheaply. Long-horizon
        // stationary predictions run offline against saved traces, not in a
        // live frame (they simulate the authored machinery, including hoist).
        threat:sourceContinuationThreatTelemetry(state,{horizonSeconds:0}),
        hushDistanceMetres:state.hush?.active&&(state.chartId??0)===(state.hush.chartId??0)?Math.hypot(state.x-state.hush.x,state.z-state.hush.z,state.feet-state.hush.feet):null,
        threatDistanceMetres:state.phase==='catch'&&state.counterweight?.active
          ?Math.hypot(state.x-state.counterweight.x,state.z-state.counterweight.z,state.feet-state.counterweight.y)
          :state.phase==='wrong-return'&&state.closure?.mode==='closing'?Number.isFinite(state.closure.frontX)?Math.abs(state.x-state.closure.frontX):Math.abs(state.z-state.closure.frontZ):null});}
    },
    // The material clock needs the body, not a copy of the complete pursuit trail.
    stillnessPose:()=>({x:state.x,z:state.z,feet:state.feet,yaw:state.yaw,phase:state.phase,chartId:state.chartId??0,
      level:state.level,foldSerial:state.foldSerial||0,status:state.status,ready:live(),closed,paused,leaving,error,
      transitioning:!!(contactHeld||handoff||state.fall||state.recovery||state.reveal||state.cameraTransit||state.bodyTransit)}),
    view:()=>({...snapshot(),ready:live(),closed,paused,leaving,error,contactHeld,handoff:copy(handoff),focus:live()?interactionFocus():null,
      sourceContactProps:sourceContinuationRecordingReturnProps(state,getRecordingCustody())}),
    serialize:snapshot,checkpoint:()=>save('requested'),
    releaseContact,
    anchor(value){anchored=!!value;return anchored;},
    pause(){if(closed)return false;paused=true;clear();audio?.pause?.();save('pause');return true;},
    resume(){if(closed)return false;paused=false;clear();return true;},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yawDelta=0,pitchDelta=0){return scene.setLook({yaw:state.yaw+(Number(yawDelta)||0),pitch:state.pitch+(Number(pitchDelta)||0)});},
    setLook(look){if(!scene.allowsLook)return false;apply({dt:0,look,renderReady:true});return true;},
    key(e={}){
      const key=keyOf(e);
      if(key==='escape'||e.controllerAction==='back'){clear();save('pause-request');return false;}
      if(closed||leaving||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(paused||contactHeld){clear();return true;}
      if(!live()){
        clear();if(!e.repeat&&(key==='x'||key==='e')&&error)finish(key==='e'&&failedFinish?failedFinish:'return');return true;
      }
      if(!e.repeat&&(key==='f'||e.controllerAction==='torch')){onTorch();trace({type:'torch-input',elapsed:state.elapsed});return true;}
      if(!e.repeat&&(key===' '||key==='space'||e.controllerAction==='jump')){
        const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
          side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
        apply({dt:0,jump:true,forward,side,renderReady:true});return true;
      }
      if(movement.includes(key)){if(!e.repeat&&!state.reveal&&!state.recovery)keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))apply({dt:0,interact:true,renderReady:true});
      return true;
    },
    keyup(e={}){keys.delete(keyOf(e));return true;},
    pointer(e={}){
      if(!scene.allowsLook){drag=null;return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0};e.preventDefault?.();}
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        apply({dt:0,look:{yaw:state.yaw+(x-drag.x)*.004,pitch:Math.max(-1.30,Math.min(.62,state.pitch-(y-drag.y)*.003))},renderReady:true});drag={x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render({...state,handoff,sourceContactProps:sourceContinuationRecordingReturnProps(state,getRecordingCustody())})===false)throw Error('The Source view is unavailable.');}catch(err){ready=false;report(err);}}
      const blackout=Math.max(0,Math.min(1,Number(state.recovery?.blackoutAlpha)||0));
      if(blackout)uiDraw(({ctx})=>{ctx.save();ctx.fillStyle=`rgba(0,0,0,${blackout})`;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();});
      const focus=live()&&!paused&&!contactHeld?interactionFocus():null;
      if(focus?.type==='source-recording-return'){
        const {cols,rows}=uiSize(),ordinal=Number.isSafeInteger(focus.takeOrdinal)&&focus.takeOrdinal>0?`TAKE ${String(focus.takeOrdinal).padStart(3,'0')} · `:'';
        uiText(2,Math.max(1,rows-3),ordinal+(focus.text||focus.takeId||''),'ui-secondary',1,Math.max(20,cols-4));
        uiText(2,Math.max(2,rows-2),'[E] HOLD THE CASSETTE','ui-primary',1,Math.max(20,cols-4));
      }
      // Other handles, treads and machinery retain their physical/sound cues.
      // The returned cassette alone receives a reachable equipment prompt;
      // there is no general secret marker or new quest overlay.
      // Retain the last valid frame during preparation or a recoverable fault.
    },
    exit(){if(closed)return false;closed=true;clear();audio?.stop?.();if(!leaving)save('interrupted');renderer.dispose?.();onExit({checkpoint:snapshot()});return true;},
  };
  return scene;
}
