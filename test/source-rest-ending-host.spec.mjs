import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function block(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,`production block: ${start}`);return main.slice(a,b);}
const noop=()=>{};

function host({variant='source-rest',failed=null}={}){
  const log=[],saves=[],mediaFrames=[],owner={active:true,playing:true,failed,finishing:false,ended:false,duration:787,currentTime:520,
    snapshot(){return {active:this.active,playing:this.playing,failed:this.failed,ended:this.ended,duration:this.duration,currentTime:this.currentTime};},
    finishAfterCycle(){this.finishing=true;log.push('finish-after-cycle');},
    update({paused}){this.playing=this.active&&!this.ended&&!paused;log.push(paused?'music-hold':'music-resume');},
    stop(){this.playing=false;this.active=false;log.push('music-stop');},dispose(){log.push('music-dispose');}};
  let attached=owner,creditsOptions=null,coda=null,focus=true;
  const continuationAudio={detachRestMusic(value){assert.equal(value,owner);attached=null;log.push('detach');},
    stop(){log.push('source-stop');if(attached)attached.update({active:true,paused:true});},pause(){log.push('source-pause');if(attached)attached.update({active:true,paused:true});}};
  const scene={view:()=>({phase:'wrong-return'}),serialize:()=>({returnPose:null}),exit(){log.push('source-exit');if(!h.restMusicTransferred){continuationAudio.detachRestMusic(owner);owner.dispose();}},render:noop};
  const stack=[scene];
  const scenes={top:()=>stack.at(-1),push(value){stack.push(value);value.enter?.();},
    pop(){const value=stack.pop();value?.exit?.();return value;},remove(value){const i=stack.findIndex(s=>s===value||s.id===value);if(i<0)return null;const [removed]=stack.splice(i,1);removed.exit?.();return removed;},pointer:noop};
  const h={endingStaticMix:null,log,scene,restMusic:owner,restMusicTransferred:false,sourceContinuationScene:scene,sourceContinuationRenderer:{dispose:()=>log.push('renderer-dispose')},
    restRecorder:{update:()=>log.push('recorder-update'),dispose:()=>log.push('recorder-dispose')},
    restMedia:{update:value=>mediaFrames.push(value),stop:reason=>log.push(`media-stop:${reason}`)},
    releaseSourceRecordingCassetteLabels:noop,P3:{},
    sourceContinuationAudio:continuationAudio,sourceEarthfallAudio:null,r3dCache:{},scenes,chunkSurfRuntime:null,
    paused:false,document:{hidden:false,visibilityState:'visible',hasFocus:()=>focus},gameplayInputLifecycleActive:()=>focus,
    ENDING_VARIANT:{SOURCE_REST:'source-rest',CENTURY_STAY:'century-stay'},endingDossier:{variant,arrival:'rested'},endingArrival:'rested',
    activeEndingCutscene:null,finaleActive:true,endingTimeline:null,pendingContactEndingReturn:null,towerEndingPlayback:null,
    LOSABLE:[],itemLost:()=>false,RADIO:{isDropped:()=>false},REC:{saveRecState:()=>({})},PRES:{savePresenceState:()=>({})},ENCOUNTERS:{saveEncounterState:()=>({})},
    battleInterference:{finalizeEnding:()=>Promise.resolve(),currentRecord:()=>({})},commitReturn:()=>({id:'summary'}),saveCommit:p=>saves.push(p),
    finalizeCausalReturn:()=>Promise.resolve(),endingCodaVariant:()=>variant,guardEpilogue:()=>[],noteEndingCutsceneLine:noop,
    R3:{r3dSetEndingWorldLook:noop,r3dSetMunicipalLightPower:noop},setBoothPresentationPose:noop,getSave:()=>({}),
    presentFinale(_tree,options){coda=options;log.push('coda');},
    windowChoreography:{credits:()=>Promise.resolve()},makeCreditsScene(options){creditsOptions=options;return{id:'credits',view:()=>({paused:false})};},
    STORY:{fadeSoundtrack:noop,stopAll:noop,startTapeHiss:()=>log.push('hiss'),startMenuHiss:()=>log.push('hiss')},CUES:{stopAllCues:noop},TAKE_HISS:{min:1},
    openExternalUrl:noop,APP_LINKS:{website:''},ensureCtx:noop,emitProgress:noop,EVENT_TYPES:{CREDITS_VIEWED:'credits'},showReturnReport:()=>log.push('report'),
    openingArrivalAudio:null,openingCabRadio:null,architectureDoorAudio:null,architectureDoorEvents:{hold:noop},runPlayDurationClock:{suspend:noop},cancelLastExposure:noop,cancelRecordingPressureAudio:noop,
    chapelTapeTugHeld:false,towerWarningAudio:null,pubRoomAudio:null,pubPressureAudio:null,sourcePubAudio:null,academicGhostDispatch:null,cancelOutskirtDoorAnswer:noop,
    cancelApparitionApplause:noop,setUiCueFocused:noop,sourceShoreAudio:null,activeRecordingSlate:null,cancelControlScope:noop,liveRecordingPointerControls:new Set(),
    bellPealPerformance:null,resetMotionInput:noop,pointerMode:{release:noop},recoverInteractionAudio:()=>Promise.resolve(),
    stopTowerPersonalWorldSignal:noop,towerPersonalHud:null,lowerTowerPersonalRecorder:noop,
    syncPointerMode:noop,b3SpeakerAudio:{pause:noop},b3Speaker:{flush:noop},storyMode:false,inRogue:false,getInDriveTeaserScene:null,
    openingVehicleScene:null,openingOvertureScene:null,sourceReturnFlashbackScene:null,sourceDriveSession:null,sourcePubScene:null,sourceRecordingInspectionScene:null,
    standingTearScene:null,coastalMemoryScene:null,firstStrikeScene:null,firstStrikeAudio:null,studentStrikeScene:null,studentStrikeAudio:null,pauseTowerEndingRecording:noop,saveSourceView:noop,outskirtsStreetAudio:null,
    pauseOutskirtsLastLight:noop,towerBellDirector:null,personalWindowEffects:{},stopAllVoices:noop,stopWorldLayerVoice:noop,silenceAmbientDrone:noop,
    setGainNode:noop,dialogGain:null,bodyGain:null,sfxGain:null,sfxDirectGain:null,musicGain:null,whisperBed:null,pushEvent:noop,
    applyAudioSettings:noop,startAmbientDroneAt:noop,currentAmbientTarget:()=>0,updateAudio:noop,resumeGameplayInput:noop,FEAR:{setHeartbeatPaused:noop},
  };
  h.document.addEventListener=(name,callback)=>{if(name==='visibilitychange')h.visibilityChange=callback;};
  vm.createContext(h);
  vm.runInContext(block('let sourceRestEndingMusic=null;','const sourceContinuationTrace=[];')+
    block('function releaseSourceContinuation({','async function deliverSourceContinuationHandoff(')+
    block('scene.takeRestMusicForEnding=()=>{','  const update=scene.update;')+
    block('function finishEnding(id,','// THE TUB IS NOT A RECORDING BATTLE')+
    block('function presentCredits({','async function revealFieldReturn(')+
    block('function setGameplayPaused(next,','function togglePause(){')+
    block('function onBlur(){','// Focus, capture and a level head')+
    block("  document.addEventListener('visibilitychange', ()=>{","  window.addEventListener('pageshow'"),h);
  return {h,owner,log,saves,stack,mediaFrames,credits:()=>creditsOptions,coda:()=>coda,run:code=>vm.runInContext(code,h),focus:value=>{focus=value;}};
}

test('the production presentation seam forwards the same rest and musical playhead without automatically opening the recorder',()=>{
  const t=host(),rest={phase:'catch',mode:'seated',clock:{progress:.53},affliction:{facultyLoss:.3}};
  t.h.scene.sourceRest={view:()=>rest};t.h.scene.view=()=>({phase:'catch'});t.h.getSave=()=>({run:{id:'current-run'}});
  let staticUpdates=0;t.h.endingStaticMix={update:()=>staticUpdates++};
  assert.equal(t.h.scene.sourceRestRecorder,t.h.restRecorder);assert.equal(t.h.scene.sourceRestMedia,t.h.restMedia);
  t.h.scene.syncRestPresentation({held:true});t.h.scene.syncRestPresentation({held:false});
  assert.equal(t.mediaFrames.length,2);assert.equal(t.log.filter(value=>value==='recorder-update').length,2);
  for(const [index,frame]of t.mediaFrames.entries()){
    assert.equal(frame.owner,'current-run:source-listening');assert.equal(frame.phase,'catch');assert.equal(frame.rest,rest);
    assert.equal(frame.music.currentTime,520);assert.equal(frame.music.duration,787);assert.equal(frame.held,index===0);
  }
  assert.equal(staticUpdates,2);assert.equal(t.owner.currentTime,520);assert.equal(t.owner.finishing,false);
  assert.equal(t.log.some(value=>/recorder-open|music-stop|music-dispose/.test(value)),false);
});

test('the production ending transfers the same playing owner before Source releases, then credits dispose it once',()=>{
  const t=host();t.run("finishEnding('contact-lost',{renderFinal:false})");
  assert.equal(t.owner.finishing,true);assert.equal(t.owner.playing,true);
  assert.ok(t.log.indexOf('detach')<t.log.indexOf('source-stop'));assert.ok(!t.log.includes('music-dispose'));
  assert.equal(t.run('sourceRestEndingMusic'),t.owner);assert.equal(t.h.sourceContinuationScene,null);
  t.coda().onDone();const options=t.credits();assert.equal(options.suppressSoundtrack,true);
  assert.equal(options.getMusicPosition().currentTime,520);options.onBlack();assert.ok(!t.log.includes('hiss'));
  options.onDone();options.onDone();assert.equal(t.log.filter(x=>x==='music-stop').length,1);
  assert.equal(t.log.filter(x=>x==='music-dispose').length,1);assert.equal(t.log.filter(x=>x==='report').length,1);
});

test('the real hold logic covers credits pause, loss of focus and hidden state without discarding ownership',()=>{
  const t=host();t.run("finishEnding('contact-lost',{renderFinal:false})");t.coda().onDone();
  const credit=t.stack.at(-1);credit.view=()=>({paused:true});t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,false);
  credit.view=()=>({paused:false});t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,true);
  t.h.document.hidden=true;t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,false);
  t.h.document.hidden=false;t.focus(false);t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,false);
  t.focus(true);t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,true);
  t.run('setGameplayPaused(true,{announce:false})');assert.equal(t.owner.playing,false,'the pause handler holds audio without another animation frame');
  t.run('setGameplayPaused(false,{announce:false});tickSourceRestEndingMusic()');assert.equal(t.owner.playing,true);
  t.run('onBlur()');assert.equal(t.owner.playing,false,'the blur handler pauses immediately without waiting for another animation frame');
  t.run('tickSourceRestEndingMusic()');assert.equal(t.owner.playing,true);
  t.h.document.hidden=true;t.h.visibilityChange();assert.equal(t.owner.playing,false,'visibility loss pauses immediately even if animation frames stop');
  assert.equal(t.run('sourceRestEndingMusic'),t.owner);
});

test('other endings retain their ordinary credits music and hiss behavior',()=>{
  const t=host({variant:'other'});t.run("presentCredits({context:'ending'})");const options=t.credits();
  assert.equal(options.suppressSoundtrack,false);assert.equal(options.getMusicPosition,null);options.onBlack();assert.ok(t.log.includes('hiss'));
});

test('Source II carries the same performance through credits and a finite black into its report',()=>{
  const t=host();t.h.scene.sourceRest={view:()=>({phase:'wrong-return'})};
  t.run("finishEnding('contact-lost',{renderFinal:false})");
  assert.equal(t.coda(),null);assert.equal(t.credits().quietEnding,true);
  assert.equal(t.credits().suppressSoundtrack,true);t.credits().onBlack();
  assert.ok(!t.log.includes('hiss'));t.credits().onDone();
  assert.equal(t.stack.at(-1).id,'source-rest-final-black');assert.equal(t.owner.playing,true);
  assert.ok(!t.log.includes('report'));assert.ok(!t.log.includes('music-stop'));
  const black=t.stack.at(-1);black.update(3.99);assert.ok(!t.log.includes('report'));
  black.update(.02);assert.equal(t.log.filter(x=>x==='report').length,1);
  assert.equal(t.log.filter(x=>x==='music-dispose').length,1);
  assert.ok(!t.stack.includes(black));black.update(20);black.key({code:'Enter'});
  assert.equal(t.log.filter(x=>x==='report').length,1);
});

test('Source III follows the same black-to-credits transfer without the ordinary guard epilogue',()=>{
  const t=host();t.h.scene.sourceRest={view:()=>({phase:'catch'})};
  t.run("finishEnding('contact-lost',{renderFinal:false})");
  assert.equal(t.coda(),null);assert.equal(t.credits().quietEnding,true);
  assert.equal(t.credits().suppressSoundtrack,true);
  assert.equal(t.run('sourceRestEndingMusic'),t.owner);
  assert.equal(t.owner.finishing,true);assert.equal(t.owner.playing,true);
  t.credits().onDone();assert.equal(t.stack.at(-1).id,'source-rest-final-black');
  assert.ok(!t.log.includes('report'));assert.ok(!t.log.includes('music-stop'));
  const black=t.stack.at(-1);black.update(4);
  assert.equal(t.log.filter(x=>x==='report').length,1);
  assert.equal(t.log.filter(x=>x==='music-dispose').length,1);
  assert.ok(t.log.indexOf('music-dispose')<t.log.indexOf('report'));
});

test('failed Source rest audio is not transferred and ordinary credits remain available',()=>{
  const t=host({failed:'recording unavailable'});t.run("finishEnding('contact-lost',{renderFinal:false})");
  assert.equal(t.run('sourceRestEndingMusic'),null);
  assert.ok(t.log.includes('music-dispose'));t.coda().onDone();const options=t.credits();
  assert.equal(options.suppressSoundtrack,false);assert.equal(options.getMusicPosition,null);options.onBlack();assert.ok(t.log.includes('hiss'));
});

test('a performance that ends during the coda is retired and ordinary credits play instead of restarting it',()=>{
  const t=host();t.run("finishEnding('contact-lost',{renderFinal:false})");
  t.owner.ended=true;t.owner.playing=false;t.coda().onDone();
  assert.equal(t.run('sourceRestEndingMusic'),null);assert.equal(t.credits().suppressSoundtrack,false);
  assert.equal(t.credits().getMusicPosition,null);assert.equal(t.log.filter(x=>x==='music-dispose').length,1);
});

test('both Source listening endings retain an already-ended score and static carrier through black credits without restarting either',()=>{
  for(const phase of['wrong-return','catch']){
    const t=host();t.h.scene.sourceRest={view:()=>({phase})};
    t.owner.ended=true;t.owner.playing=false;t.owner.currentTime=t.owner.duration;
    let resets=0,finishes=0,updates=0;
    t.h.endingStaticMix={reset:()=>resets++,finish:({seconds})=>{assert.equal(seconds,4);finishes++;},update:()=>updates++};
    t.run("finishEnding('contact-lost',{renderFinal:false})");const baselineResets=resets,credits=t.credits();
    assert.equal(t.coda(),null);assert.equal(t.run('sourceRestEndingMusic'),t.owner);assert.equal(credits.quietEnding,true);
    assert.equal(credits.suppressSoundtrack,true);assert.equal(credits.getMusicPosition().ended,true);
    assert.equal(credits.getMusicPosition().currentTime,787);
    credits.onQuote();credits.onBlack();t.run('tickSourceRestEndingMusic()');
    assert.equal(t.owner.playing,false,'a completed score cannot be restarted by the lifecycle mock');assert.equal(updates,1);
    assert.equal(resets,baselineResets,'black credits preserve this ending\'s existing static carrier');
    assert.ok(!t.log.includes('hiss'));assert.ok(!t.log.includes('music-stop'));assert.ok(!t.log.includes('music-dispose'));
    credits.onDone();assert.equal(finishes,1);assert.equal(resets,baselineResets);assert.equal(t.stack.at(-1).id,'source-rest-final-black');
    t.stack.at(-1).update(4);assert.equal(resets,baselineResets+1);
    assert.equal(t.log.filter(value=>value==='music-stop').length,1);assert.equal(t.log.filter(value=>value==='music-dispose').length,1);
    assert.equal(t.log.filter(value=>value==='report').length,1);
  }
});


test('the Source II credits finish requests the ending static release without cutting a still-playing recording',()=>{
  const t=host();t.h.scene.sourceRest={view:()=>({phase:'wrong-return'})};let finishes=0,holds=0,updates=0,resets=0;
  t.h.endingStaticMix={finish:({seconds})=>{assert.equal(seconds,4);finishes++;},hold:()=>holds++,update:()=>updates++,reset:()=>resets++};
  t.run("finishEnding('contact-lost',{renderFinal:false})");const before=resets;
  t.run('holdSourceRestEndingMusic();tickSourceRestEndingMusic()');assert.equal(holds,1);assert.equal(updates,1);
  const options=t.credits();options.onBlack();assert.equal(finishes,0,'credits black cannot reset the same carrier');
  options.onDone();options.onDone();assert.equal(finishes,1);assert.equal(t.owner.playing,true);assert.equal(resets,before);
  assert.equal(t.stack.at(-1).id,'source-rest-final-black');t.stack.at(-1).update(4);assert.equal(resets,before+1);assert.equal(t.owner.active,false);
  assert.equal(t.log.filter(x=>x==='report').length,1);
});

test('the final black waits through pause and lost focus, then completes without waiting for the media element',()=>{
  const t=host();t.h.scene.sourceRest={view:()=>({phase:'wrong-return'})};
  t.run("finishEnding('contact-lost',{renderFinal:false})");t.credits().onDone();const black=t.stack.at(-1);
  black.update(1);t.h.paused=true;black.update(60);assert.ok(!t.log.includes('report'));
  t.h.paused=false;t.focus(false);black.update(60);assert.ok(!t.log.includes('report'));
  t.focus(true);black.update(3);assert.equal(t.log.filter(x=>x==='report').length,1);
  assert.equal(t.owner.ended,false,'a deliberate credits skip may reach the menu without awaiting the full score');
  assert.equal(t.owner.active,false);assert.ok(!t.stack.includes(black));
});

test('cancelling the final black retires its audio and cannot deliver a stale report into a later scene',()=>{
  const t=host();t.h.scene.sourceRest={view:()=>({phase:'catch'})};
  t.run("finishEnding('contact-lost',{renderFinal:false})");t.credits().onDone();const black=t.stack.at(-1);
  t.h.scenes.remove(black);t.h.scenes.push({id:'title'});black.update(60);black.key({code:'Enter'});
  assert.equal(t.stack.at(-1).id,'title');assert.ok(!t.log.includes('report'));
  assert.equal(t.log.filter(x=>x==='music-dispose').length,1);
});
