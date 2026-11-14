// One playable opening vision. It borrows the finished vehicle renderer and
// existing audio context; REC uses the host's one physical tape and heard bus.
import {createSourceDriveRenderer} from './source-drive-renderer.js';
import {SourceDriveAcoustics} from './source-drive/acoustics.js';
import {createDoorDriveTeaser} from './source-drive/door-teaser.js';
import {createBumperIntrusion} from './source-drive/bumper-intrusion.js';
import {createDriveBumperIntrusionAudio} from '../audio/drive-bumper-intrusion.js';
import {assetUrl} from '../platform/paths.js';
import {createRadioDialCut} from '../audio/radio-dial-cut.js';
import {loadOpeningLifeFlashAtlas,openingLifeFlashFrame} from '../render/opening-life-flash.js';

const clamp=n=>Math.max(0,Math.min(1,n));
export function makeGetInDriveTeaserScene({
  context,destination,fetcher=globalThis.fetch,
  createRenderer=createSourceDriveRenderer,
  createAcoustics=options=>new SourceDriveAcoustics(options),
  createController=createDoorDriveTeaser,
  createIntrusion=createBumperIntrusion,createIntrusionAudio=createDriveBumperIntrusionAudio,
  createMemorySignal=createRadioDialCut,prepareDestination=null,
  loadLifeFlashAtlas=loadOpeningLifeFlashAtlas,paintLifeFlash=()=>{},
  presentationNow=()=>globalThis.performance.now(),
  getPresentation=()=>({}),
  createRecording=null,onTapeChanged=()=>{},paintOverlay=()=>{},getViewport=()=>null,
  isHeld=()=>false,paintCover=()=>{},onPause=()=>{},
  returnToBlack=false,crashFadeSeconds=2.4,
  onRestore=()=>{},onDoorsClose=()=>{},onReturnTick=()=>{},onDone=()=>{},onError=()=>{},onExit=()=>{},
}={}){
  let disposed=false,restored=false,completed=false,ready=false,preparing=false;
  let prelude=0,prepareSeconds=0,error=null,current=null,doorsClosed=false,wasHeld=true,impact=false;
  const renderer=createRenderer(),controller=createController({requireDestinationReady:true,requireCoveredPresentation:true}),intrusion=createIntrusion();
  let intrusionAudio=null,intrusionQuietUntil=0,lastPresentationTime=null;
  let crashDissolve=null,lastPresentedFrame=null;
  let lifeFlashAtlas=null,lifeFlashReady=false;
  let audio=null,metrics=null,pending=null,audioDisposed=false,recording=null,transport=Promise.resolve(),finishing=false,drag=null,dialSerial=0,memorySignal=null,breakWaitSeconds=0;
  function protectedSignal(presentation=getPresentation()||{}){
    const status=recording?.status?.()||{};
    let external;try{external=typeof presentation.protectedAudio==='function'?presentation.protectedAudio():presentation.protectedAudio;}catch{external=true;}
    return!!(external||status.recording||status.playing||status.cuing||status.slating||status.listening);
  }
  // One owner follows the picture clock, including a held acquisition point.
  // Its bounded power exception never unmutes the receiver or the master bus.
  function soundTheDial(frame,accepted=false){
    const tuning=frame?.vehiclePose?.tuning;
    if(!tuning){memorySignal?.dispose();memorySignal=null;breakWaitSeconds=0;return;}
    if(tuning.serial!==dialSerial&&!wasHeld){
      dialSerial=tuning.serial;memorySignal?.dispose();breakWaitSeconds=0;
      const material=audio?.receiverMaterial?.();
      try{memorySignal=createMemorySignal({context,destination:audio?.cabin||destination,seconds:tuning.seconds,
        seed:4417+tuning.serial*97,reason:tuning.reason,sourceBuffer:material?.buffer,sourceOffset:material?.offset||0,
        authoredPowerException:true,receiverPowered:frame.driveState?.radioOn!==false});}catch(error){console.warn('[drive-time-skip] The receiver interruption could not be prepared.',error);}
      const serial=tuning.serial,request={serial,from:tuning.from,to:tuning.to,destination:tuning.destination};
      Promise.resolve().then(()=>prepareDestination?prepareDestination(request):renderer.prepareDestination?renderer.prepareDestination(request):renderer.ready?.()!==false)
        .then(value=>{if(disposed||restored||serial!==dialSerial)return;if(value===false)throw Error('The remembered road destination could not be prepared.');controller.setDestinationReady?.(serial,true);})
        .catch(reason=>{if(!disposed&&!restored&&serial===dialSerial)fail(reason);});
    }
    const protectedAudio=protectedSignal();
    // Preparation may happen before a frame. Starting or resuming the signal
    // requires the corresponding accepted picture; a held/rejected frame can
    // only pause or cancel it, never sound an unseen interruption.
    if(accepted||wasHeld||protectedAudio)memorySignal?.sync({age:tuning.age,paused:!accepted||wasHeld||!!tuning.waiting,
      protectedAudio,receiverPowered:frame.driveState?.radioOn!==false});
  }
  const keyInputs={w:'forward',arrowup:'forward',s:'reverse',arrowdown:'reverse',a:'left',arrowleft:'left',d:'right',arrowright:'right',' ':'brake'};
  const pressedKeys=new Set();
  function quietForControl(){intrusionQuietUntil=Math.max(intrusionQuietUntil,(current?.timeSec||0)+3);}
  function refreshFrame(dt=0){
    const frame=controller.frame(metrics),presentation=getPresentation()||{};
    const now=presentationNow(),elapsed=Number.isFinite(now)&&Number.isFinite(lastPresentationTime)?Math.max(0,(now-lastPresentationTime)/1000):0;
    // The global simulation caps dt under load. A remembered collision must
    // still last a split second in real time; never feed this clock to driving.
    const visualStep=dt>0?Math.max(dt,elapsed):0;
    lastPresentationTime=Number.isFinite(now)?now:null;
    intrusion.update(visualStep,frame,{...presentation,allowTrigger:presentation.allowTrigger!==false
      &&!protectedSignal(presentation)&&!drag&&frame.timeSec>=intrusionQuietUntil&&!(frame.vehiclePose?.radioLean>0)});
    if(protectedSignal(presentation)&&intrusion.snapshot().visible)intrusion.cancel();
    current=intrusion.apply(frame);soundTheDial(current);return current;
  }
  function setHeld(value){
    const held=!!value;if(held===wasHeld)return;
    lastPresentationTime=null;
    // Never freeze a collision image in a menu, or deliver its slam on return.
    if(held&&intrusion.snapshot().triggered)intrusion.cancel();
    audio?.setPaused(held||restored||!!crashDissolve);intrusionAudio?.setPaused(held||restored||!!crashDissolve);recording?.setPaused?.(held||restored||!!crashDissolve);controller.setPaused(held);wasHeld=held;drag=null;pressedKeys.clear();if(held)controller.setRadioLean?.(false);
    if(held||restored||crashDissolve)memorySignal?.setPaused?.(true);
    if(ready)refreshFrame();
  }
  function disposeAudio(){intrusionAudio?.dispose();if(!audio||audioDisposed)return;audioDisposed=true;audio.dispose();}
  function restore(){
    if(restored)return;restored=true;
    lifeFlashAtlas=null;
    intrusion.cancel();intrusionAudio?.dispose();memorySignal?.dispose();memorySignal=null;audio?.setPaused(true);renderer.dispose();lastPresentedFrame=null;onRestore();
  }
  function finish(){
    if(completed||disposed||finishing)return;finishing=true;restore();
    if(!recording){completed=true;onDone({skipped:!!current?.skipped,error});return;}
    transport=transport.catch(()=>{}).then(async()=>{await recording?.seal?.({reason:'opening-return'});await recording?.stopPlayback?.();onTapeChanged();}).catch(reason=>{error=String(reason?.message||reason);onError(reason);}).finally(()=>{if(disposed)return;completed=true;onDone({skipped:!!current?.skipped,error});});
  }
  function fail(reason){
    if(disposed||completed)return;
    error=String(reason?.message||reason);onError(reason);restore();finish();
  }
  async function prepare(){
    if(preparing||disposed)return pending;preparing=true;
    // Acquire ahead of the fall without putting the memory on the drive's
    // loading path. A late or unavailable decode leaves the crash playable.
    Promise.resolve().then(loadLifeFlashAtlas).then(atlas=>{
      if(!disposed&&!restored&&atlas){lifeFlashAtlas=atlas;lifeFlashReady=true;}
    }).catch(()=>{});
    pending=(async()=>{
      const response=await fetcher(assetUrl('assets/source-drive/geometry/metrics.json'));
      if(disposed)return false;if(!response?.ok)throw Error('The opening vehicle could not be prepared.');
      metrics=await response.json();if(disposed)return false;
      const acquired=await renderer.initialize({coastalMemory:true});if(disposed)return false;
      if(acquired===false)throw Error('The opening vehicle renderer could not be initialized.');
      audio=createAcoustics({context,destination,gain:.5,fetcher});
      audio.setPaused(true);
      await audio.initialize();if(disposed){disposeAudio();return false;}
      audio.ensureOpeningBus?.();
      intrusionAudio=createIntrusionAudio({context,destination:audio.recordingBus?.()||audio.cabin});
      if(createRecording)recording=await createRecording({context,cabinBus:audio.recordingBus?.()||audio.cabin});
      if(disposed){await recording?.dispose?.();disposeAudio();return false;}
      renderer.setRecorderReadout({counter:'00:00',mode:'idle',note:'FIELD TAKE · READY'});
      ready=true;controller.start();wasHeld=!!isHeld();controller.setPaused(wasHeld);audio.setPaused(wasHeld);intrusionAudio.setPaused(wasHeld);refreshFrame();
      return true;
    })().catch(reason=>{fail(reason);return false;});
    return pending;
  }
  function renderFrame(){
    if(!current?.renderFrame||restored)return;
    const f=current.renderFrame;
    const presentation=getPresentation()||{};
    audio?.setStormPresentation?.({flashMode:presentation.flashMode||(presentation.effectsMode==='off'?'off':'full'),protectedAudio:protectedSignal(presentation),listenerYaw:f.look?.yaw||0});
    const exposure=lifeFlashAtlas&&openingLifeFlashFrame(current,presentation);
    const drive=exposure&&!protectedSignal(presentation)&&f.driveState.openingCinematic
      ? {...f.driveState,openingCinematic:{...f.driveState.openingCinematic,lifeFlash:exposure.envelope*(exposure.steady?.45:1)}}
      : f.driveState;
    audio?.sync(drive,f.scene.cut.sources,f.weather,f.evolution,f.scene.predicaments.sources);
    f.storm=audio?.stormFrame?.()||null;
    if(f.memoryBreak)f.memoryBreak={...f.memoryBreak,effectsMode:presentation.effectsMode||'full',reducedFlash:presentation.flashMode==='reduced'};
    recording?.tick?.();
    const status=recording?.status?.()||{},seconds=status.playing?status.playbackTapeSeconds:status.headSeconds;
    const level=audio?.level?.()||0;
    const readout={counter:`${Math.floor((seconds||0)/60).toString().padStart(2,'0')}:${Math.floor((seconds||0)%60).toString().padStart(2,'0')}`,mode:status.recording?'record':status.playing?'play':'idle',levels:{left:level,right:level},note:status.recording?'FIELD TAKE · ROLLING':status.playing?'PLAY · HEADPHONES':'FIELD TAKE · READY'};
    controller.setRecordingView?.({...readout,recording:!!status.recording,level});renderer.setRecorderReadout?.(readout);
    const shown=renderer.render({...f,cinematicLook:!current.controlsEnabled});
    if(shown===false){intrusion.presented(false);fail(Error('The opening drive frame could not be presented.'));return;}
    lastPresentedFrame=f;
    controller.presented?.(f.memoryBreak);
    soundTheDial(current,true);
    const contact=intrusion.presented(!wasHeld&&!isHeld());
    if(contact)intrusionAudio?.play({...contact,reducedMotion:contact.mode==='still'});
  }
  function operate(kind){
    if(!current?.controlsEnabled||wasHeld||!recording)return false;
    quietForControl();
    const atContact=()=>{transport=transport.catch(()=>{}).then(async()=>{
      if(disposed||restored)return;
      quietForControl();
      if(kind==='record'){
        if(recording.status?.().recording)await recording.seal({reason:'stop'});
        else{await recording.stopPlayback?.();await recording.record({encounterId:'opening-coastal-memory-v1',kind:'field',counted:false,signal:'cabin-reference'});}
      }else if(kind==='play'){await recording.seal?.({reason:'playback'});await recording.play?.({});}
      else{await recording.seal?.({reason:'stop'});await recording.stopPlayback?.();}
      onTapeChanged();
    }).catch(reason=>{error=String(reason?.message||reason);onError(reason);});return transport;};
    if(controller.operate)return controller.operate(kind,atContact);atContact();return true;
  }
  function pick(event){
    const {x,y,width,height}=pointerPoint(event);
    if(![x,y,width,height].every(Number.isFinite)||!renderer.project)return null;
    let best=null;for(const target of current?.renderFrame?.scene?.targets||[]){const p=renderer.project(target.point),distance=p?.visible?Math.hypot(p.x*width-x,p.y*height-y):Infinity;if(distance<25&&(!best||distance<best.distance))best={...target,distance};}return best;
  }
  function pointerPoint(event){
    const rect=getViewport(),width=event.width??rect?.width,height=event.height??rect?.height;
    const captured=!!(event.pointerCaptured??event.pointerLocked??event.locked??globalThis.document?.pointerLockElement);
    return{width,height,captured,x:captured?width/2:event.x??event.clientX-rect?.left,y:captured?height/2:event.y??event.clientY-rect?.top};
  }
  function activate(target){
    if(!target)return false;
    quietForControl();
    if(target.id==='tune')return controller.selectStation?.(['service','company','music'][target.preset]);
    if(target.id==='power')return controller.power?.();return operate(target.id);
  }
  const scene={
    id:'get-in-drive-teaser',blocksWorld:true,blocksInput:true,suppressesHud:true,
    get allowsLook(){return ready&&!disposed&&!restored&&!completed&&!wasHeld&&!isHeld()&&!!current?.controlsEnabled;},
    lookAngles(){return{...(controller.snapshot()?.look||{yaw:0,pitch:-.035})};},
    lookBy(yaw=0,pitch=0){
      if(!scene.allowsLook)return false;
      const dx=Number.isFinite(yaw)?yaw:0,dy=Number.isFinite(pitch)?pitch:0;
      if(!dx&&!dy)return false;
      const look=scene.lookAngles(),changed=controller.setLook?.({yaw:look.yaw+dx,pitch:look.pitch+dy});
      if(changed){if(drag)drag.cancelled=true;refreshFrame();}return!!changed;
    },
    // The world-title card hands us an already black image. Keep that cover
    // continuous while acquiring the car; revealing the room here is a flash.
    get worldPresentation(){return restored&&!returnToBlack?'visible':'hidden';},
    enter(){},
    update(dt){
      if(disposed||completed)return;
      const held=!!isHeld(),step=Math.max(0,Math.min(.1,Number(dt)||0));
      setHeld(held);
      if(held)return;
      if(prelude<.28){prelude+=step;if(prelude>=.28)void prepare();return;}
      if(!ready){prepareSeconds+=step;if(prepareSeconds>25)fail(Error('The opening vehicle did not become ready.'));return;}
      if(crashDissolve&&!restored){
        // The controller has already reached its covered return. Retain its
        // final actually presented wreck frame, rather than revealing the room
        // or inventing another camera, while a slow scene-local fade closes it.
        crashDissolve.elapsed=Math.min(crashDissolve.seconds,crashDissolve.elapsed+step);
        if(crashDissolve.elapsed<crashDissolve.seconds){
          // Re-present the real last pose through the same world renderer. Do
          // not depend on a WebGL drawing buffer surviving a compositor swap.
          if(renderer.render({...lastPresentedFrame,cinematicLook:true})===false)fail(Error('The remembered wreck could not remain visible during its fade.'));
          return;
        }
        restore();
      }
      if(!restored)audio?.setPaused(false);
      // A dial cut clears the pedals; pressed pedals resume with the picture.
      controller.update(step,{input:Object.fromEntries([...pressedKeys].map(action=>[action,true]))});refreshFrame(step);
      if(current?.vehiclePose?.tuning?.waiting){breakWaitSeconds+=step;if(breakWaitSeconds>12){fail(Error('The remembered road remained unavailable.'));return;}}
      if(current.phase==='impact-black'&&!impact){impact=true;audio?.joint({strength:1});}
      if(current.worldOwner==='return'&&!restored){
        if(returnToBlack&&lastPresentedFrame&&crashFadeSeconds>0&&!crashDissolve){
          crashDissolve={elapsed:0,seconds:Math.max(.1,Math.min(6,Number(crashFadeSeconds)||2.4))};
          audio?.setPaused(true);intrusionAudio?.setPaused(true);recording?.setPaused?.(true);
          return;
        }
        restore();
      }
      if(restored&&!doorsClosed){doorsClosed=true;onDoorsClose();}
      if(restored)onReturnTick(step);
      renderFrame();
      if(current.finished)finish();
    },
    render(){
      // Run-level pause freezes update() below its scene. Audio and the
      // diagnostic snapshot must still follow that lifecycle immediately.
      setHeld(!!isHeld());
      let alpha=prelude<.28||!ready||(returnToBlack&&restored)?1:clamp(current?.coverAlpha??1);
      if(returnToBlack&&!restored){
        if(crashDissolve){const u=clamp(crashDissolve.elapsed/crashDissolve.seconds);alpha=u*u*(3-2*u);}
        // The original controller's safety black rises in .14 seconds. Its
        // return remains unchanged; only this opt-in presenter supplies the
        // longer visible closing fade before relinquishing the world renderer.
        else if(current?.worldOwner==='drive'&&current?.cliffCommitted)alpha=0;
      }
      if(ready&&!restored){
        const exposure=!wasHeld&&lifeFlashAtlas&&openingLifeFlashFrame(current,getPresentation());
        if(exposure)paintLifeFlash(lifeFlashAtlas,exposure);
        paintOverlay({frame:current,radio:exposure?null:audio?.programmeFrame?.()||current?.renderFrame?.radio,tape:recording?.status?.()||null,error});
      }
      if(alpha>.001)paintCover(alpha);
    },
    key(event){
      if(event.key==='Escape'){if(!event.repeat){setHeld(true);onPause();}return true;}
      const k=String(event.key||'').toLowerCase();
      if(keyInputs[k]){if(!event.repeat&&!wasHeld){pressedKeys.add(keyInputs[k]);controller.input?.(keyInputs[k],true);}return true;}
      // Keep Q or LB pressed to lean toward the radio; both use this key.
      if(k==='q'){if(!event.repeat&&!wasHeld)controller.setRadioLean?.(true,{immediate:!!getPresentation()?.reducedMotion});return true;}
      if(event.repeat||!current?.controlsEnabled||wasHeld)return true;
      if(/^[123]$/.test(k)){quietForControl();controller.selectStation?.(['service','company','music'][Number(k)-1]);}
      else if(k==='o'){quietForControl();controller.power?.();}
      else if(k==='r')operate('record');else if(k==='e')operate('play');else if(k==='x')operate('stop');
      else if(k==='v')controller.toggleWipers?.();else if(k==='l')controller.toggleHeadlights?.();else if(k==='f')controller.setLook?.({yaw:0,pitch:-.14});
      return true;
    },
    pointer(event={}){
      if(event.type==='pointercancel'){drag=null;return true;}
      if(!scene.allowsLook){drag=null;return true;}
      const point=pointerPoint(event);
      if(event.type==='pointerdown'){
        if((event.button??0)!==0)return true;
        drag={...point,pointerId:event.pointerId,control:pick(event)};return true;
      }
      if(event.type==='pointerup'){
        if((event.button??0)!==0||drag?.pointerId!=null&&event.pointerId!=null&&drag.pointerId!==event.pointerId)return true;
        const target=drag&&!drag.cancelled&&drag.captured===point.captured&&Math.hypot(point.x-drag.x,point.y-drag.y)<10?drag.control:null;
        drag=null;activate(target);return true;
      }
      if(event.type==='pointermove'&&drag&&(Math.hypot(point.x-drag.x,point.y-drag.y)>=10||point.captured&&(event.movementX||event.movementY)))drag.cancelled=true;
      return true;
    },keyup(event={}){const released=String(event.key||'').toLowerCase(),action=keyInputs[released];if(action){pressedKeys.delete(action);controller.input?.(action,false);}if(released==='q')controller.setRadioLean?.(false,{immediate:!!getPresentation()?.reducedMotion});return true;},
    setPaused:setHeld,
    blur(){setHeld(true);},focus(){setHeld(!!isHeld());},
    resume(){setHeld(!!isHeld());},
    exit(){
      if(disposed)return;disposed=true;restore();controller.dispose();
      if(recording)Promise.resolve(recording.dispose?.()).catch(onError).finally(disposeAudio);else disposeAudio();onExit();
    },
    view(){return{prelude,preparing,ready,restored,completed,disposed,error,...(current||{}),crashDissolve:crashDissolve?{...crashDissolve}:null,lifeFlash:{ready:lifeFlashReady,frame:!wasHeld&&lifeFlashAtlas?openingLifeFlashFrame(current,getPresentation()):null},bumperIntrusion:intrusion.snapshot()};},
    audioDiagnostics(){return audio?{...audio.diagnostics?.(),storm:audio.stormFrame?.()||null,memorySignal:memorySignal?.snapshot?.()||null,bumperIntrusion:intrusionAudio?.diagnostics()||null}:null;},
    tapeDiagnostics(){return recording?.status?.()||null;},
    pending:()=>pending,
  };
  return scene;
}
