// One playable opening vision. It borrows the finished vehicle renderer and
// existing audio context; REC uses the host's one physical tape and heard bus.
import {createSourceDriveRenderer} from './source-drive-renderer.js';
import {SourceDriveAcoustics} from './source-drive/acoustics.js';
import {createDoorDriveTeaser} from './source-drive/door-teaser.js';
import {createBumperIntrusion} from './source-drive/bumper-intrusion.js';
import {createDriveBumperIntrusionAudio} from '../audio/drive-bumper-intrusion.js';
import {assetUrl} from '../platform/paths.js';

const clamp=n=>Math.max(0,Math.min(1,n));
export function makeGetInDriveTeaserScene({
  context,destination,fetcher=globalThis.fetch,
  createRenderer=createSourceDriveRenderer,
  createAcoustics=options=>new SourceDriveAcoustics(options),
  createController=createDoorDriveTeaser,
  createIntrusion=createBumperIntrusion,createIntrusionAudio=createDriveBumperIntrusionAudio,
  presentationNow=()=>globalThis.performance.now(),
  getPresentation=()=>({}),
  createRecording=null,onTapeChanged=()=>{},paintOverlay=()=>{},getViewport=()=>null,
  isHeld=()=>false,paintCover=()=>{},onPause=()=>{},
  onRestore=()=>{},onDoorsClose=()=>{},onReturnTick=()=>{},onDone=()=>{},onError=()=>{},onExit=()=>{},
}={}){
  let disposed=false,restored=false,completed=false,ready=false,preparing=false;
  let prelude=0,prepareSeconds=0,error=null,current=null,doorsClosed=false,wasHeld=true,impact=false;
  const renderer=createRenderer(),controller=createController(),intrusion=createIntrusion();
  let intrusionAudio=null,intrusionQuietUntil=0,lastPresentationTime=null;
  let audio=null,metrics=null,pending=null,audioDisposed=false,recording=null,transport=Promise.resolve(),finishing=false,drag=null;
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
      &&!drag&&frame.timeSec>=intrusionQuietUntil});
    current=intrusion.apply(frame);return current;
  }
  function setHeld(value){
    const held=!!value;if(held===wasHeld)return;
    lastPresentationTime=null;
    // Never freeze a collision image in a menu, or deliver its slam on return.
    if(held&&intrusion.snapshot().triggered)intrusion.cancel();
    audio?.setPaused(held||restored);intrusionAudio?.setPaused(held||restored);recording?.setPaused?.(held||restored);controller.setPaused(held);wasHeld=held;drag=null;pressedKeys.clear();
    if(ready)refreshFrame();
  }
  function disposeAudio(){intrusionAudio?.dispose();if(!audio||audioDisposed)return;audioDisposed=true;audio.dispose();}
  function restore(){
    if(restored)return;restored=true;
    intrusion.cancel();intrusionAudio?.dispose();audio?.setPaused(true);renderer.dispose();onRestore();
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
    audio?.sync(f.driveState,f.scene.cut.sources,f.weather,f.evolution,f.scene.predicaments.sources);
    recording?.tick?.();
    const status=recording?.status?.()||{},seconds=status.playing?status.playbackTapeSeconds:status.headSeconds;
    const level=audio?.level?.()||0;
    const readout={counter:`${Math.floor((seconds||0)/60).toString().padStart(2,'0')}:${Math.floor((seconds||0)%60).toString().padStart(2,'0')}`,mode:status.recording?'record':status.playing?'play':'idle',levels:{left:level,right:level},note:status.recording?'FIELD TAKE · ROLLING':status.playing?'PLAY · HEADPHONES':'FIELD TAKE · READY'};
    controller.setRecordingView?.({...readout,recording:!!status.recording,level});renderer.setRecorderReadout?.(readout);
    const shown=renderer.render({...f,cinematicLook:!current.controlsEnabled});
    if(shown===false){intrusion.presented(false);fail(Error('The opening drive frame could not be presented.'));return;}
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
    const rect=getViewport(),width=event.width??rect?.width,height=event.height??rect?.height,x=event.x??event.clientX-rect?.left,y=event.y??event.clientY-rect?.top;
    if(![x,y,width,height].every(Number.isFinite)||!renderer.project)return null;
    let best=null;for(const target of current?.renderFrame?.scene?.targets||[]){const p=renderer.project(target.point),distance=p?.visible?Math.hypot(p.x*width-x,p.y*height-y):Infinity;if(distance<25&&(!best||distance<best.distance))best={...target,distance};}return best;
  }
  function activate(target){
    if(!target)return false;
    quietForControl();
    if(target.id==='tune')return controller.selectStation?.(['service','company','music'][target.preset]);
    if(target.id==='power')return controller.power?.();return operate(target.id);
  }
  const scene={
    id:'get-in-drive-teaser',blocksWorld:true,blocksInput:true,suppressesHud:true,allowsLook:false,
    // The world-title card hands us an already black image. Keep that cover
    // continuous while acquiring the car; revealing the room here is a flash.
    get worldPresentation(){return restored?'visible':'hidden';},
    enter(){},
    update(dt){
      if(disposed||completed)return;
      const held=!!isHeld(),step=Math.max(0,Math.min(.1,Number(dt)||0));
      setHeld(held);
      if(held)return;
      if(prelude<.28){prelude+=step;if(prelude>=.28)void prepare();return;}
      if(!ready){prepareSeconds+=step;if(prepareSeconds>25)fail(Error('The opening vehicle did not become ready.'));return;}
      if(!restored)audio?.setPaused(false);
      controller.update(step);refreshFrame(step);
      if(current.phase==='impact-black'&&!impact){impact=true;audio?.joint({strength:1});}
      if(current.worldOwner==='return'&&!restored)restore();
      if(restored&&!doorsClosed){doorsClosed=true;onDoorsClose();}
      if(restored)onReturnTick(step);
      renderFrame();
      if(current.finished)finish();
    },
    render(){
      // Run-level pause freezes update() below its scene. Audio and the
      // diagnostic snapshot must still follow that lifecycle immediately.
      setHeld(!!isHeld());
      const alpha=prelude<.28||!ready?1:clamp(current?.coverAlpha??1);
      if(ready&&!restored)paintOverlay({frame:current,radio:audio?.programmeFrame?.()||current?.renderFrame?.radio,tape:recording?.status?.()||null,error});
      if(alpha>.001)paintCover(alpha);
    },
    key(event){
      if(event.key==='Escape'){if(!event.repeat){setHeld(true);onPause();}return true;}
      const k=String(event.key||'').toLowerCase();
      if(keyInputs[k]){if(!event.repeat&&!wasHeld){pressedKeys.add(keyInputs[k]);controller.input?.(keyInputs[k],true);}return true;}
      if(event.repeat||!current?.controlsEnabled||wasHeld)return true;
      if(/^[123]$/.test(k)){quietForControl();controller.selectStation?.(['service','company','music'][Number(k)-1]);}
      else if(k==='o'){quietForControl();controller.power?.();}
      else if(k==='r')operate('record');else if(k==='e')operate('play');else if(k==='x')operate('stop');
      else if(k==='v')controller.toggleWipers?.();else if(k==='l')controller.toggleHeadlights?.();else if(k==='f')controller.setLook?.({yaw:0,pitch:-.14});
      return true;
    },
    pointer(event={}){
      if(!current?.controlsEnabled||wasHeld)return true;
      if(event.type==='pointerdown'){drag={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,control:event.button===2?null:pick(event)};return true;}
      if(event.type==='pointerup'){const target=drag&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<10?drag.control:null;drag=null;activate(target);return true;}
      if(event.type==='pointercancel'){drag=null;return true;}
      if(event.type==='pointermove'){
        if(event.pointerLocked||event.locked||globalThis.document?.pointerLockElement)controller.lookDelta?.(event.movementX||0,event.movementY||0);
        else if(drag&&(!drag.control||Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=10)){controller.lookDelta?.(event.clientX-drag.x,event.clientY-drag.y);drag={...drag,x:event.clientX,y:event.clientY};}
      }return true;
    },keyup(event={}){const action=keyInputs[String(event.key||'').toLowerCase()];if(action){pressedKeys.delete(action);controller.input?.(action,false);}return true;},
    setPaused:setHeld,
    blur(){setHeld(true);},focus(){setHeld(!!isHeld());},
    resume(){setHeld(!!isHeld());},
    exit(){
      if(disposed)return;disposed=true;restore();controller.dispose();
      if(recording)Promise.resolve(recording.dispose?.()).catch(onError).finally(disposeAudio);else disposeAudio();onExit();
    },
    view(){return{prelude,preparing,ready,restored,completed,disposed,error,...(current||{}),bumperIntrusion:intrusion.snapshot()};},
    audioDiagnostics(){return audio?{...audio.diagnostics?.(),bumperIntrusion:intrusionAudio?.diagnostics()||null}:null;},
    tapeDiagnostics(){return recording?.status?.()||null;},
    pending:()=>pending,
  };
  return scene;
}
