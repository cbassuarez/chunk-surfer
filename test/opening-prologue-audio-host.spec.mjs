import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {createSamDialogVoice} from '../src/audio/sam-voice.js';
import {createConversation} from '../src/game/conversation.js';
import {makeColdOpenScene} from '../src/game/coldopen.js';
import {createOpeningPrologueAudio,openingPrologueSpeechActive} from '../src/audio/opening-prologue-audio.js';
import {createOpeningPrologueScore} from '../src/audio/opening-prologue-score.js';

const flush=async()=>{for(let k=0;k<12;k++)await Promise.resolve();};
function audio(){
  const sources=[],oscillators=[],waves=[],nodes=[],parameter=value=>({value,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},
    linearRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;}}),
    node=()=>{const n={gain:parameter(1),frequency:parameter(0),Q:parameter(0),pan:parameter(0),delayTime:parameter(0),
      connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;},
    voice=()=>({...node(),playbackRate:parameter(1),starts:[],stopCount:0,start(...args){this.starts.push(args);},stop(){this.stopCount++;}}),
    ctx={state:'running',currentTime:0,sampleRate:32000,createGain:node,createBiquadFilter:node,createWaveShaper:node,createStereoPanner:node,createDelay:node,
      createBuffer(channels,length,rate){return{duration:length/rate,length,numberOfChannels:channels,sampleRate:rate,copyToChannel(){},getChannelData:()=>new Float32Array(length)};},
      createBufferSource(){const src=voice();sources.push(src);return src;},
      createOscillator(){const src={...voice(),setPeriodicWave(wave){this.wave=wave;}};oscillators.push(src);return src;},
      createPeriodicWave(real,imaginary){const wave={real,imaginary};waves.push(wave);return wave;},
      resume:async()=>{},decodeAudioData:async()=>({duration:30,length:960000,numberOfChannels:2,sampleRate:32000})};
  return{ctx,destination:node(),music:node(),sfx:node(),sources,oscillators,waves,nodes};
}

test('a speaking SAM handle freezes for ninety seconds and resumes the same source offset without replaying its line',async()=>{
  const a=audio(),voice=createSamDialogVoice({getAudio:()=>a}),handle=voice.start('A substantial spoken sentence that has not finished yet.',{speaker:'other'});
  await flush();assert.equal(handle.started,true);assert.equal(a.sources.length,1);
  a.ctx.currentTime=.4;const before=handle.progress(),cursor=handle.sourcePosition(),oldEnded=handle.source.onended;
  assert.ok(before>0&&before<1);assert.equal(handle.pause(),true);a.ctx.currentTime+=90;
  assert.equal(handle.progress(),before);assert.equal(handle.done(),false);oldEnded();assert.equal(handle.done(),false,'a stopped source cannot mark the held line complete');
  assert.equal(handle.resume(),true);assert.equal(a.sources.length,2);assert.equal(a.sources[1].starts[0][1],cursor);
  a.ctx.currentTime+=.2;assert.ok(handle.progress()>before);assert.equal(handle.pause(),true);voice.dispose();
  assert.equal(handle.resume(),false,'disposing a held line makes later resume inert');
});

test('queued speech can be paused before its provider completes, and cancellation prevents late sound',async()=>{
  const a=audio(),voice=createSamDialogVoice({getAudio:()=>a}),handle=voice.start('A queued utterance.',{speaker:'other'});
  handle.pause();await flush();assert.equal(a.sources.length,0);a.ctx.currentTime=90;assert.equal(handle.progress(),0);
  handle.resume();assert.equal(a.sources.length,1);assert.equal(a.sources[0].starts[0][1],0);voice.dispose();
  const b=audio(),cancelled=createSamDialogVoice({getAudio:()=>b}),pending=cancelled.start('Another pending utterance.',{speaker:'other'});
  pending.stop();await flush();assert.equal(b.sources.length,0);assert.equal(pending.done(),true);cancelled.dispose();
});

test('hiss and tape wobble stop with a held voice and cannot be retired by an old onended callback',async()=>{
  const a=audio(),voice=createSamDialogVoice({getAudio:()=>a}),handle=voice.start('The recording still has a long sentence left to speak.',{speaker:'recordist'});
  await flush();assert.equal(a.sources.length,2);assert.equal(a.oscillators.length,1);
  a.ctx.currentTime=.47;const cursor=handle.sourcePosition(),oldEnded=a.sources[0].onended;
  handle.pause();assert.equal(a.sources[0].stopCount,1);assert.equal(a.sources[1].stopCount,1);assert.equal(a.oscillators[0].stopCount,1);
  a.ctx.currentTime+=90;handle.resume();assert.equal(a.sources.length,4);assert.equal(a.sources[2].starts[0][1],cursor);
  assert.equal(a.waves.length,1,'the resumed wobble retains its phase');oldEnded();
  assert.equal(handle.done(),false);assert.equal(a.oscillators[1].stopCount,0);voice.dispose();
});

test('timer-only fallback speech also preserves progress across a long presentation hold',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'performance');let time=0;
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>time}});
  try{
    const voice=createSamDialogVoice({getAudio:()=>null}),handle=voice.start('A timer fallback that still requires a proper hold.');
    await flush();time=300;const before=handle.progress();assert.ok(before>0&&before<1);
    handle.pause();time+=90000;assert.equal(handle.progress(),before);assert.equal(handle.done(),false);
    handle.resume();time+=200;assert.ok(handle.progress()>before);voice.dispose();
  }finally{Object.defineProperty(globalThis,'performance',original);}
});

test('conversation presentation holds preserve captions, input, effects and node ownership exactly once',async()=>{
  const a=audio(),events=[],convo=createConversation({getAudio:()=>a,sceneId:'opening-pause-proof',
    nodes:{start:{lines:[{who:'unknown',voiceSpeaker:'other',text:'A longer line remains unfinished while a real presentation is held.',cue:'one-effect'}],goto:'end'},end:{lines:[{who:'direction',text:'Next.'}]}},
    cue:id=>events.push(['cue',id]),onLine:row=>events.push(['line',row.text]),audio:{stopTyping(){}}});
  convo.start();await flush();a.ctx.currentTime=.4;convo.update(.1);const before=convo.view();
  assert.ok(before.typing);convo.presentationPause();a.ctx.currentTime+=90;convo.update(90);convo.key({key:'Enter'});
  const held=convo.view();assert.equal(held.nodeId,before.nodeId);assert.equal(held.typed,before.typed);assert.equal(held.lineAge,before.lineAge);assert.equal(held.voice,before.voice);
  convo.presentationResume();a.ctx.currentTime+=.3;convo.update(.3);assert.ok(convo.view().typed>=before.typed);
  assert.equal(events.filter(row=>row[0]==='line').length,1);assert.equal(events.filter(row=>row[0]==='cue').length,1);convo.stop();
});

test('cold-open adapters expose a non-destructive presentation hold without changing ordinary scene entry',()=>{
  scenes.clear();const scene=makeColdOpenScene({opening:{start:{lines:[{who:'direction',text:'The road continues.'}]}},ambient:false,voiceEnabled:false});
  try{scenes.push(scene);scenes.update(.1);const before=scene.view();scene.presentationPause();scenes.update(90);
    assert.equal(scene.view().typed,before.typed);assert.equal(scene.view().presentationPaused,true);
    scene.presentationResume();scenes.update(.2);assert.ok(scene.view().typed>=before.typed);
  }finally{scenes.clear();}
});

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),from=main.indexOf('let openingPrologueScene=null'),to=main.indexOf('// DRIVING OFF.',from);
assert.ok(from>=0&&to>from);
async function host(){
  scenes.clear();const a=audio();let score,physical,scene,options;const calls={updates:0,pauses:0,resumes:0};
  const state={phase:'film',presentationReady:true,paused:false,finished:false,spoken:true,who:'unknown',voice:.5,stage:{veil:0},semanticPhase:'recognition',journey:{musicPhase:'recognition'},
    drive:{driveState:{speed:13,engineLoad:.3,throttle:.3,gear:4,engineOn:true},embodiment:{holdWiper:true}}},weather={rain:.7,roadWetness:.6,wiperAngles:[-.6,.6],wiperMoving:false};
  const no=()=>{},root={console,Promise,paused:false,gameplayInputLifecycleActive:()=>true,RENDERER:'3d',resetMotionInput:no,
    R3:{r3dBasePropsReady:async()=>{},r3dAuthoredPropsReady:async()=>{},r3dPrepareOpeningOverture:no,r3dRainAmount:()=>1,r3dOpeningOvertureStatus:()=>({ready:true}),r3dPresentationReady:()=>true,
      r3dSetSourceScene:no,r3dSetNightWarningProps:no,r3dSetSourceRestHorizon:no,r3dSetRainAmount:no},
    P3:{installAuthoredPropMeshes:()=>true,setAuthoredPropRange:()=>no},prepareOpeningCinematicAssets:async()=>{},openingOmenGeometry:()=>({}),
    createSourceDriveRenderer:()=>({initialize:async()=>true,render:()=>true,dispose:no}),createPrologueDrive:()=>({dispose:no}),
    FP:{isLoaded:()=>true},buildingLoadPromise:null,loadBuilding:no,fetch:async()=>({ok:true,json:async()=>({})}),assetUrl:x=>x,OPENING_PROLOGUE:{propRange:320},
    createOpeningPrologueAudio(args){physical=createOpeningPrologueAudio({...args,createCab:()=>({update:no,dispose:no}),createThunder:()=>({prepare:no,strike:no,stop:no})});return physical;},
    createOpeningPrologueScore(args){score=createOpeningPrologueScore({...args,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),urlFor:x=>x});return score;},
    actx:a.ctx,musicGain:a.music,sfxGain:a.sfx,dialogGain:a.destination,master:a.destination,STORY:{stopRain:no},r3dCache:{},openingArrivalWorldView:x=>x,CELL:1,shakeMode:()=> 'full',
    openingPrologueSpeechActive,REC:{isRecording:()=>false,isSlating:()=>false},PB:{isPlaying:()=>false},scenes,
    makeOpeningPrologueScene(opts){options=opts;scene={id:'opening-prologue',view:()=>({...state}),physicalFrame:()=>({weather}),enter(){opts.onStart();},
      update(){calls.updates++;opts.setMusic(state.journey.musicPhase==='return'?.42:.62);},pause(){state.paused=true;calls.pauses++;},resume(){state.paused=false;calls.resumes++;},
      presentationPause:no,presentationResume:no,render:no,exit:()=>opts.onExit()};return scene;}};
  vm.createContext(root);vm.runInContext(main.slice(from,to),root);root.beginOpeningPrologue();await score.prepare();
  const tick=(seconds,{render=false}={})=>{for(let left=seconds;left>.00001;){const dt=Math.min(.1,left);a.ctx.currentTime+=dt;scenes.update(dt);if(render)scenes.render();left-=dt;}};
  tick(18);assert.equal(score.status().phase,'recognition');return{a,score,physical,scene,state,root,tick,calls,options};
}

test('the actual prologue host pauses the score before a pause menu freezes its update callback',async()=>{
  const h=await host();try{
    const before=h.score.status().positionSeconds;h.root.paused=true;h.scene.pause();scenes.push({id:'pause',freezesBelow:true});
    h.tick(90);assert.equal(h.score.status().positionSeconds,before,'a muted bus alone must not consume ninety seconds of music');
    h.root.paused=false;scenes.pop();h.tick(.1);const after=h.score.status();assert.ok(after.positionSeconds>=before-.000001&&after.positionSeconds<before+.11,JSON.stringify({before,after}));
  }finally{scenes.clear();}
});

test('an explicit display hold also pauses owned audio when lower scene updates are frozen',async()=>{
  const h=await host();try{
    scenes.push({id:'display-transition',freezesBelow:true});scenes.render();const before=h.score.status().positionSeconds;
    h.tick(90,{render:true});assert.equal(h.score.status().positionSeconds,before);scenes.pop();h.tick(.1);
    assert.ok(h.score.status().positionSeconds<before+.11);
  }finally{scenes.clear();}
});

test('the actual host requests the audible box return from the connected journey even while off is semantically personal',async()=>{
  const h=await host();try{
    h.state.semanticPhase='personal';h.state.journey={musicPhase:'return'};h.state.stage={veil:0,music:0};h.tick(3);
    assert.equal(h.score.status().phase,'return');assert.ok(h.physical.snapshot().stageMusic>0,'the legacy gone-stage zero cannot mute the whole return');
    assert.equal(h.physical.snapshot().mix.physical.speed,13);
  }finally{scenes.clear();}
});
