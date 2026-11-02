// The ordinary Source continuation scene keeps ownership of the body, music,
// hazards, checkpoint and doors. This adapter holds locomotion only while the
// player sits inside an existing protected refuge and passes a transient
// camera pose to the renderer; it does not create another progression system.
import * as scenes from './scenes.js';
import {makeSourceRestConversationScene} from './source-rest-conversation-scene.js';
import {SOURCE_REST_SEATS,SOURCE_REST_FOCUS_DISTANCE,sourceRestSeatForState,sourceRestFocus,sourceRestPositionProtected} from './source-rest-seat.js';
import {uiCenter,uiSize,uiDraw,uiText} from '../render/ui.js';
import {promptLine} from './bindings.js';
import {sourceRestInterfaceFrame,sourceRestInterfacePresentation} from './source-rest-interface.js';
import {sourceRestVisionFrame} from './source-rest-vision.js';
import {createSourceRestWeatherScore} from './source-rest-weather-score.js';
import {sourceRestAfflictionFrame} from './source-rest-affliction.js';
import {sourceRestCouperinAffliction} from './source-rest-couperin-affliction.js';

const MOVEMENT=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'];
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const clamp=(n,min,max)=>Math.min(max,Math.max(min,Number(n)||0));
const noop=()=>{};
function defaultPrompt(){const {rows}=uiSize();uiCenter(Math.max(2,rows-3),promptLine([{action:'interact',label:'SIT AND LISTEN'}]),'ui-secondary',.9);}

/** Install before the host pushes or initializes the Source continuation.
 * Its renderer receives state.sourceRestView={seatId,progress,look,mode}
 * only while the camera is lowered, seated or rising. This is never saved as
 * Source progression. A commit stays seated until the host calls release(). */
export function installSourceRest(scene,renderer,{onCommit=()=>false,onError=noop,onChange=noop,onImpact=noop,
  makeConversation=makeSourceRestConversationScene,stack=scenes,conversationOptions={},
  paintPrompt=defaultPrompt,drawRestInstrument=null,drawRestInstrumentInStudies=false,
  transitionSeconds=.9,getStudyTreatment=()=>null,getStudyMemory=()=>null,getReducedMotion=()=>false,
  getReducedDread=()=>false,getEffectsMode=()=> 'full',enableStudies=false,
  getRecorderVisible=()=>false,renderRecorderFallback=noop}={}){
  if(!scene||!renderer||typeof scene.view!=='function'||typeof scene.update!=='function'||typeof scene.key!=='function'||typeof renderer.render!=='function')
    throw Error('Source rest needs the continuation scene and renderer.');
  if(scene.sourceRest)throw Error('Source rest is already installed.');
  const original={update:scene.update,render:scene.render,key:scene.key,keyup:scene.keyup,exit:scene.exit,
    lookBy:scene.lookBy,setLook:scene.setLook,lookAngles:scene.lookAngles,rendererRender:renderer.render,
    allowsLook:Object.getOwnPropertyDescriptor(scene,'allowsLook')};
  let mode='idle',seat=null,progress=0,look=null,overlay=null,committed=false,disposed=false,narrativeProgress=0,interruption=false,memoryDrive=0,memory=null;
  let lockNotified=false;
  const conversations=new Map();
  const weatherScore=createSourceRestWeatherScore();let weatherCue=null;
  let afflictionPhase=null,affliction=sourceRestAfflictionFrame(),interfaceStage=0,interfaceAfterInterruption=false;
  const presentation=()=>sourceRestInterfacePresentation(narrativeProgress,{affliction,afterInterruption:interfaceAfterInterruption,minimumStage:interfaceStage});
  const duration=Math.max(.05,Number(transitionSeconds)||.9);
  const restMode=()=>mode!=='idle';
  const clearMotion=()=>{for(const key of MOVEMENT)original.keyup?.call(scene,{key,code:key.startsWith('arrow')?key:'Key'+key.toUpperCase()});};
  const locked=()=>!disposed&&(committed||!!seat&&['sitting','seated'].includes(mode)&&overlay?.view?.()?.restLocked===true);
  const view=()=>({mode,seatId:seat?.id||null,phase:seat?.phase||null,progress,look:look?{...look}:null,committed,locked:locked(),overlayOpen:!!overlay,narrativeProgress,
    timing:overlay?.view?.()?.restTiming||null,nodeId:overlay?.view?.()?.nodeId||null,memory:memory?{...memory}:null,
    presentation:presentation(),weather:weatherCue?{...weatherCue,particles:undefined}:null,affliction:{...affliction}});
  const musicState=()=>{try{return conversationOptions.getMusicState?.()||{};}catch{return{};}};
  function refreshWeather(value=scene.view()){
    const music=musicState(),place=SOURCE_REST_SEATS.find(item=>item.phase===value.phase),
      near=!!place&&value.chartId===place.chartId&&Math.abs(value.feet-place.feet)<1&&Math.hypot(value.x-place.x,value.z-place.z)<16,
      sensory=mode==='standing'?narrativeProgress*progress:mode==='idle'?0:narrativeProgress;
    weatherCue=weatherScore.update({phase:value.phase,active:near,
      funeralActive:['wrong-return','catch'].includes(value.phase)&&value.ready!==false&&!music.ended&&!music.failed,
      seated:restMode()&&!!seat,progress:sensory,
      nodeId:overlay?.view?.()?.nodeId||'',audibleSeconds:Math.max(0,Number(music.audibleWallSeconds??music.playedSeconds)||0),
      musicTime:Math.max(0,Number(music.currentTime)||0),audioTime:Number(music.audioTime)||0,
      playbackRate:Number(music.playbackRate)||1,hold:!!(music.paused||music.protected||music.buffering),reducedMotion:!!getReducedMotion()});
    if(value.phase==='catch'&&weatherCue)weatherCue={...weatherCue,flood:{active:false}};
  }
  const changed=()=>{try{onChange(view());}catch{}};
  const notifyLock=()=>{if(!lockNotified&&locked()){lockNotified=true;changed();}};
  function focus(){
    if(disposed||restMode())return null;
    const s=scene.view();
    // The normal Source handle/drop interaction always wins.
    if(!s?.ready||s.paused||s.closed||s.leaving||s.error||s.focus)return null;
    return sourceRestFocus(s);
  }
  function stand(){if(disposed||mode==='committed'||mode==='idle')return false;clearMotion();mode='standing';changed();return true;}
  function finish(outcome){
    if(outcome!=='commit'&&seat&&overlay?.checkpoint)conversations.set(seat.phase,overlay.checkpoint());
    overlay=null;
    if(disposed||mode==='idle'||mode==='committed')return;
    if(outcome!=='commit'){stand();return;}
    mode='committed';committed=true;lockNotified=true;narrativeProgress=1;clearMotion();changed();
    const context={phase:seat.phase,seat,checkpoint:scene.serialize?.(),release:()=>release()};
    try{
      const result=onCommit(context);
      if(result===false)throw Error('The Source rest ending could not begin.');
      Promise.resolve(result).catch(error=>{if(disposed||mode!=='committed')return;committed=false;mode='standing';changed();onError(error);});
    }catch(error){committed=false;mode='standing';changed();onError(error);}
  }
  function sit(){
    const target=focus();if(!target)return false;
    const selected=SOURCE_REST_SEATS.find(item=>item.id===target.id);if(!selected)return false;
    const remembered=conversations.get(selected.phase);
    clearMotion();seat=selected;look={...seat.view};progress=0;narrativeProgress=remembered?.clock?.progress||0;interruption=false;mode='sitting';committed=false;lockNotified=false;interfaceStage=0;interfaceAfterInterruption=!!remembered?.interfaceAfterInterruption;
    afflictionPhase=selected.phase;changed();
    try{overlay=makeConversation({...conversationOptions,phase:seat.phase,resumeFrom:remembered,onDone:finish});
      if(!overlay)throw Error('The Source rest conversation could not be opened.');
      stack.push(overlay);return true;
    }catch(error){
      // `push` can fail after adding the overlay (for example while warming
      // its voice). Do not leave an input-owning orphan above the Source view.
      if(overlay){const old=overlay;overlay=null;try{stack.remove(old);}catch{}}
      mode='standing';changed();onError(error);return false;
    }
  }
  function release(){
    if(disposed)return false;
    if(overlay){const old=overlay;overlay=null;stack.remove(old);}
    clearMotion();mode='idle';seat=null;progress=0;narrativeProgress=0;interruption=false;look=null;committed=false;lockNotified=false;changed();return true;
  }
  // A committed ending is separately saved by the existing ending owner.
  // Rehydrate only at a real supported seat checkpoint: no dialogue is
  // replayed, no ordinary rest interaction is interpreted as a commitment.
  function restoreCommitted(){
    if(disposed||restMode())return false;
    const s=scene.view(),selected=sourceRestSeatForState(s);
    if(!s?.ready||s.paused||s.closed||s.leaving||s.error||!selected||!sourceRestPositionProtected(s)
      ||Math.hypot(selected.x-s.x,selected.z-s.z)>SOURCE_REST_FOCUS_DISTANCE)return false;
    clearMotion();seat=selected;look={...seat.view};progress=1;narrativeProgress=1;mode='committed';committed=true;lockNotified=true;
    afflictionPhase=selected.phase;changed();return true;
  }
  const isInteract=e=>!e?.repeat&&!e?.ctrlKey&&!e?.metaKey&&!e?.altKey&&
    (['e','enter'].includes(keyOf(e))||['interact','confirm'].includes(e?.controllerAction));
  scene.key=function(e={}){
    if(disposed)return original.key.call(scene,e);
    if(mode==='standing'||mode==='committed')return true;
    if(mode==='idle'&&isInteract(e)&&focus())return sit();
    return original.key.call(scene,e);
  };
  scene.update=function(dt){
    const delta=Math.min(.25,Math.max(0,Number(dt)||0));
    const result=original.update.call(scene,dt);
    if(disposed)return result;
    if(mode==='idle'){refreshWeather();conversationOptions.onRestProgress?.(0,false,weatherCue,scene.view()?.phase);return result;}
    notifyLock();
    if(seat&&overlay?.restProgress){
      narrativeProgress=Math.max(narrativeProgress,clamp(overlay.restProgress(),0,1));
    }
    interruption=!!seat&&!!overlay?.restInterruption?.();
    interfaceAfterInterruption||=interruption;interfaceStage=presentation().stage;
    const narrative=overlay?.view?.(),lineIndex=Number(String(narrative?.lineSourceId||'').split(':').at(-1));
    memoryDrive=interruption?1:narrative?.nodeId==='after-interruption'&&lineIndex<4?.6:0;
    const listener=narrative?.nodeId==='distance'?(lineIndex<6?'practice':'recital')
      :['distance-choice','teachers','strangers'].includes(narrative?.nodeId)?'recital':null;
    memory=seat?.phase==='catch'?{drive:0,ellery:0,listener:null,listenerStage:0}:{drive:memoryDrive,ellery:['organ','mistakes','mistake-choice','wince','more','voice','caid'].includes(narrative?.nodeId)?1:0,
      listener,listenerStage:.5};
    refreshWeather();
    conversationOptions.onRestProgress?.(narrativeProgress,!!seat&&mode!=='standing',weatherCue,seat?.phase);
    if(mode!=='committed'){
      const s=scene.view();
      if(!s?.ready||s.closed||s.leaving||s.error||!sourceRestPositionProtected(s)){
        if(overlay){const old=overlay;overlay=null;stack.remove(old);}
        if(mode!=='standing')stand();
      }
    }
    if(mode==='sitting'){progress=Math.min(1,progress+delta/duration);if(progress>=1)mode='seated';}
    else if(mode==='standing'){progress=Math.max(0,progress-delta/duration);if(progress<=0){mode='idle';seat=null;look=null;}}
    return result;
  };
  scene.render=function(...args){
    const result=original.render?.apply(scene,args);
    if(seat&&restMode()){
      const display=presentation();
      // The host draws the already-existing physical recorder, not another
      // telemetry strip. It is below the existing vision and subtitle layers,
      // and has no key/pointer ownership or route into equipment state.
      if(getRecorderVisible()&&typeof drawRestInstrument==='function'&&(mode==='sitting'||mode==='seated')&&!display.suppressPeripheral){
        drawRestInstrument({presentation:display,narrativeProgress,affliction:{...affliction},transitionProgress:progress,
          conversationView:overlay?.view?.()||null,sarahNamed:!!conversationOptions.sarahNamed,musicTime:affliction.time,
          ...uiSize(),phase:seat.phase,seatId:seat.id,mode,study:false});
      }
      renderRecorderFallback();
      const {cols}=uiSize();
      if(interruption)uiText(Math.max(3,Math.floor(cols*.12)),3,'R E C E I V E  /  H E —','ui-secondary',.48*progress);
      for(const field of sourceRestInterfaceFrame(narrativeProgress,{affliction}))uiText(field.edge==='right'?Math.max(2,cols-field.text.length-3):3,field.row,field.text,'ui-secondary',field.alpha*progress);
      const vision=sourceRestVisionFrame(narrativeProgress,{interruption,affliction,reducedMotion:!!getReducedMotion()});
      if(vision.periphery>0||vision.interruption>0||vision.black>0)uiDraw(({ctx})=>{
        const w=ctx.canvas.width,h=ctx.canvas.height;
        if(vision.periphery>0){
          const g=ctx.createRadialGradient(w*.5,h*.46,h*vision.aperture*.35,w*.5,h*.46,Math.max(w,h)*.64);
          g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${vision.periphery*progress})`);
          ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
        }
        if(vision.interruption>0){ctx.fillStyle=`rgba(0,0,0,${vision.interruption*progress})`;ctx.fillRect(0,0,w,h*.23);}
        if(vision.black>0){ctx.fillStyle=`rgba(0,0,0,${vision.black*progress})`;ctx.fillRect(0,0,w,h);}
      });
    }
    if(focus())paintPrompt();return result;
  };
  renderer.render=function(value,...args){
    notifyLock();
    let musicSignal=0,audibleSeconds=0,musicTime=0,musicDuration=null,musicRevoicing=null,musicPlaying=false,musicSnapshot=null;
    try{const music=conversationOptions.getMusicState?.();musicSnapshot=music;musicSignal=clamp(music?.signal,0,1);audibleSeconds=Math.max(0,Number(music?.audibleWallSeconds??music?.playedSeconds)||0);musicTime=Math.max(0,Number(music?.currentTime)||0);musicDuration=music?.duration;
      if(value.phase==='catch'){musicRevoicing=music?.revoicing?{...music.revoicing}:null;musicPlaying=!!music?.playing;}}catch{}
    const sensoryProgress=mode==='standing'?narrativeProgress*progress:mode==='idle'?0:narrativeProgress;
    const sourceRestView=restMode()&&seat?{seatId:seat.id,progress,look:{...look},mode,musicSignal,audibleSeconds,musicTime,degradation:narrativeProgress,interruption,memoryDrive,memory:getStudyMemory()||memory,studyTreatment:getStudyTreatment()||'loggia'}
      :{audibleSeconds,musicTime,musicSignal};
    sourceRestView.weatherCue=weatherCue;
    sourceRestView.reducedDread=!!getReducedDread();sourceRestView.effectsMode=getEffectsMode();
    if(value.phase==='catch'){sourceRestView.musicRevoicing=musicRevoicing;sourceRestView.musicPlaying=musicPlaying;}
    sourceRestView.floodProgress=sensoryProgress;
    const embodied=restMode()&&!!seat&&mode!=='standing',canLeave=mode!=='committed'&&!overlay?.view?.()?.restLocked;
    affliction=(value.phase==='catch'?sourceRestCouperinAffliction:sourceRestAfflictionFrame)({currentTime:musicTime,playedSeconds:audibleSeconds,duration:musicDuration,
      active:afflictionPhase===value.phase,progress:narrativeProgress,reducedMotion:!!getReducedMotion()});
    // Structural damage stays when standing early. The body's freedom is
    // restored until the authored departure lock has actually been reached.
    affliction={...affliction,embodied,canLeave,motorGain:embodied&&!canLeave?affliction.motorGain:1,
      inputLost:embodied&&!canLeave&&affliction.inputLost,
      ...(!embodied?{pain:0,strain:0,pressure:0,facultyLoss:0}:{}),bodyProgress:embodied?progress:0};
    sourceRestView.affliction=affliction;
    const rendered=original.rendererRender.call(renderer,sourceRestView?{...value,sourceRestView}:value,...args);
    if(rendered!==false&&mode==='seated'&&affliction.embodied){
      const receipt=renderer.diagnostics?.()?.frame?.destruction,music=musicSnapshot||{};
      for(const impact of receipt?.mistakeImpacts||[]){
        try{onImpact({impact,phase:seat?.phase,rendered:true,visible:impact.visible===true&&receipt.bodyAvailable===true,
          embodied:true,settled:progress>=.999,canLeave:affliction.canLeave,progress:narrativeProgress,
          held:!!(music.paused||music.buffering||music.seeking),protected:!!music.protected});}catch(error){onError(error);}
      }
    }
    return rendered;
  };
  Object.defineProperty(scene,'allowsLook',{configurable:true,enumerable:true,get(){
    if(restMode()&&mode!=='standing')return true;
    return original.allowsLook?.get?original.allowsLook.get.call(scene):(original.allowsLook?.value??false);
  }});
  scene.lookBy=function(yawDelta=0,pitchDelta=0){
    if(restMode()&&mode!=='standing'&&look){const gain=affliction.motorGain;
      look={yaw:look.yaw+(Number(yawDelta)||0)*gain,pitch:clamp(look.pitch+(Number(pitchDelta)||0)*gain,-1.30,1.25)};return true;}
    return original.lookBy?.call(scene,yawDelta,pitchDelta)??false;
  };
  scene.setLook=function(value={}){
    if(restMode()&&mode!=='standing'&&look){const gain=affliction.motorGain;
      look={yaw:look.yaw+(Number.isFinite(value.yaw)?Math.atan2(Math.sin(value.yaw-look.yaw),Math.cos(value.yaw-look.yaw))*gain:0),
        pitch:clamp(look.pitch+(Number.isFinite(value.pitch)?value.pitch-look.pitch:0)*gain,-1.30,1.25)};return true;}
    return original.setLook?.call(scene,value)??false;
  };
  scene.lookAngles=function(){return restMode()&&look?{...look}:original.lookAngles?.call(scene)??null;};
  function dispose(){
    if(disposed)return false;
    conversationOptions.onRestProgress?.(0,false);
    disposed=true;if(overlay){const old=overlay;overlay=null;stack.remove(old);}clearMotion();
    mode='idle';seat=null;look=null;progress=0;committed=false;lockNotified=false;affliction=sourceRestAfflictionFrame();
    renderer.render=original.rendererRender;
    for(const name of ['update','render','key','keyup','exit','lookBy','setLook','lookAngles']){
      if(original[name]===undefined)delete scene[name];else scene[name]=original[name];
    }
    if(original.allowsLook)Object.defineProperty(scene,'allowsLook',original.allowsLook);else delete scene.allowsLook;
    delete scene.sourceRest;return true;
  }
  scene.exit=function(...args){dispose();return original.exit?.apply(scene,args);};
  // Explicit developer stills render a chosen camera/playhead without running
  // a simulation tick, moving the real body, seeking audio or earning progress.
  const studyFrame=enableStudies?({musicTime=null,degradation=0,look:studyLook=null}={})=>{
    const value=scene.view(),place=sourceRestSeatForState(value);if(!place)return false;
    let music={};try{music=conversationOptions.getMusicState?.()||{};}catch{}
    const time=Number.isFinite(musicTime)?Math.max(0,musicTime):Number(music.currentTime)||0;
    // Independent preview weather uses the standard production particle
    // functions; it neither advances the live scene nor rewrites its score.
    const studyWeather=createSourceRestWeatherScore();let studyCue;
    for(let t=Math.max(0,time-2);t<=time+.000001;t=Math.min(time,t+.1)){
      studyCue=studyWeather.update({phase:place.phase,active:true,seated:true,progress:degradation,audibleSeconds:t,musicTime:t,audioTime:t,
        sinceEntry:t,sinceSit:t,sinceInterruption:time>55?Math.max(0,t-55):null,stormAge:(degradation-.64)*530,reducedMotion:!!getReducedMotion()});
      if(t>=time)break;
    }
    const look=studyLook?{yaw:Number.isFinite(studyLook.yaw)?studyLook.yaw:place.view.yaw,pitch:clamp(Number.isFinite(studyLook.pitch)?studyLook.pitch:place.view.pitch,-1.30,.62)}:place.view;
    const result=original.rendererRender.call(renderer,{...value,sourceRestView:{seatId:place.id,progress:1,look,mode:'seated',
      degradation:clamp(degradation,0,1),musicTime:time,audibleSeconds:time,musicSignal:Number(music.signal)||0,
      ...(place.phase==='catch'?{musicRevoicing:music.revoicing?{...music.revoicing}:null,musicPlaying:!!music.playing}:{}),
      affliction:{...(place.phase==='catch'?sourceRestCouperinAffliction:sourceRestAfflictionFrame)({currentTime:time,playedSeconds:time,duration:music.duration,active:true,progress:degradation,reducedMotion:!!getReducedMotion()}),
        embodied:true,bodyProgress:1,canLeave:degradation<.56},
      studyTreatment:getStudyTreatment()||'loggia',memory:getStudyMemory(),weatherCue:studyCue}});
    const display=sourceRestInterfacePresentation(degradation);
    if(drawRestInstrumentInStudies&&typeof drawRestInstrument==='function'&&!display.suppressPeripheral){
      drawRestInstrument({presentation:display,narrativeProgress:clamp(degradation,0,1),affliction:sourceRestAfflictionFrame(),
        transitionProgress:1,conversationView:null,...uiSize(),phase:place.phase,seatId:place.id,mode:'study',study:true});
    }
    return result;
  }:undefined;
  const recorderFrame=()=>seat&&['sitting','seated'].includes(mode)?{presentation:presentation(),narrativeProgress,
    affliction:{...affliction},transitionProgress:progress,conversationView:overlay?.view?.()||null,
    sarahNamed:!!conversationOptions.sarahNamed,musicTime:Math.max(0,Number(musicState().currentTime)||0),phase:seat.phase,seatId:seat.id,mode}:null;
  scene.sourceRest=Object.freeze({focus,view,sit,stand,release,restoreCommitted,dispose,recorderFrame,...(studyFrame?{studyFrame}:{})});
  return scene.sourceRest;
}
