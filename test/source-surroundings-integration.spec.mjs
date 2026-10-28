import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceContinuationAudio} from '../src/audio/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation,resumeSourceContinuation} from '../src/game/source-continuation.js';
import {sourceSurroundingsPlacement} from '../src/audio/source-surroundings.js';
import {sourceSurroundingsFrame} from '../src/game/source-surroundings.js';
import {standingTearRepertoireById} from '../src/data/standing-tear-memory-score.js';
import {CREDITS} from '../src/data/credits.js';
import * as scenes from '../src/game/scenes.js';

const state=(extra={})=>({...resumeSourceContinuation(freshSourceContinuation({runId:'audio-wrapper'})),elapsed:2,...extra});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function audioGraph(){
  const nodes=[],sources=[],fetches=[];
  const parameter=()=>({value:0,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const node=(kind,extra={})=>{const n={kind,connections:[],connect(other){this.connections.push(other);return other;},disconnect(){this.connections=[];this.disconnected=true;},...extra};nodes.push(n);return n;};
  const ctx={currentTime:10,sampleRate:4000,state:'running',
    createGain:()=>node('gain',{gain:parameter()}),createStereoPanner:()=>node('stereo',{pan:parameter()}),createPanner:()=>node('HRTF',{positionX:parameter(),positionY:parameter(),positionZ:parameter()}),
    createBiquadFilter:()=>node('filter',{frequency:parameter(),Q:parameter()}),createConvolver:()=>node('convolver'),createWaveShaper:()=>node('limiter'),
    createBuffer(numberOfChannels,length,sampleRate){const data=Array.from({length:numberOfChannels},()=>new Float32Array(length));return{numberOfChannels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]};},
    async decodeAudioData(bytes){const id=new Uint8Array(bytes)[0],seconds={1:48,2:standingTearRepertoireById('couperin').duration,3:12,4:2.25,5:2.65,6:2}[id],buffer=this.createBuffer(1,Math.round(seconds*4000),4000);buffer.decodedId=id;return buffer;},
  };
  const source=kind=>{const n=node(kind,{frequency:parameter(),playbackRate:parameter(),starts:[],stops:[],start(at,offset=0,duration){this.starts.push({at,offset,duration});},stop(at){this.stops.push(at);}});sources.push(n);return n;};
  ctx.createBufferSource=()=>source('buffer');ctx.createOscillator=()=>source('tone');
  Object.defineProperty(ctx,'listener',{get(){throw Error('Wrapper must not acquire a shared listener.');}});
  const sfx=node('sfx-destination'),music=node('music-destination');
  const fetcher=async url=>{fetches.push(url);const id=String(url).includes('chaconne')?1:String(url).includes('couperin')?2:String(url).includes('bell-04')?3:String(url).includes('restraint')?4:String(url).includes('joint-fracture')?5:6;return{ok:true,arrayBuffer:async()=>Uint8Array.of(id).buffer};};
  return{ctx,nodes,sources,sfx,music,fetcher,fetches};
}
function reaches(from,destination,seen=new Set()){
  if(from===destination)return true;if(!from||seen.has(from))return false;seen.add(from);
  return(from.connections||[]).some(next=>reaches(next,destination,seen));
}
function wrapper(g,{protectedAudio=()=>false,getReducedMotion=()=>false}={}){
  return createSourceContinuationAudio({getAudio:()=>({ctx:g.ctx,destination:g.sfx}),getMusicAudio:()=>({ctx:g.ctx,destination:g.music}),
    protectedAudio,getReducedMotion,fetcher:g.fetcher,musicFetcher:g.fetcher,urlFor:file=>'audio/source-demolition/'+file,musicUrlFor:path=>path});
}

test('both production factories bind distinct live SFX/music destinations and protections; the real wrapper keeps those signal paths separate',async()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),factories=[...main.matchAll(/sourceContinuationAudio\s*\|\|=\s*createSourceContinuationAudio\((\{[\s\S]*?\n  \})\);/g)];
  assert.equal(factories.length,2,'fake Ellery entry and the continuation entry both configure the reused audio owner');
  for(const factory of factories){
    const g=audioGraph(),flags={record:false,listen:false,play:false,shake:'full'},environment={actx:g.ctx,sfxGain:g.sfx,musicGain:g.music,
      shakeMode:()=>flags.shake,REC:{isRecording:()=>flags.record,isListening:()=>flags.listen},PB:{isPlaying:()=>flags.play}};
    const config=Function('environment',`with(environment){return (${factory[1]});}`)(environment);
    assert.equal(config.getAudio().destination,g.sfx);assert.equal(config.getMusicAudio().destination,g.music);
    for(const key of ['record','listen','play']){flags[key]=true;assert.equal(config.protectedAudio(),true,key);flags[key]=false;}
    assert.equal(config.protectedAudio(),false);assert.equal(config.getReducedMotion(),false);flags.shake='reduced';assert.equal(config.getReducedMotion(),true);
    const sound=createSourceContinuationAudio({...config,fetcher:g.fetcher,musicFetcher:g.fetcher,urlFor:f=>'audio/source-demolition/'+f,musicUrlFor:p=>p});
    sound.update({state:state(),ready:true});await settle();sound.update({state:state(),ready:true});
    const musical=g.sources.find(n=>n.buffer?.duration===48&&n.loop),mechanical=g.sources.filter(n=>n.buffer?.duration===1.93||n.kind==='tone');
    assert.ok(musical);assert.equal(reaches(musical,g.music),true);assert.equal(reaches(musical,g.sfx),false);
    assert.ok(mechanical.length>=2);assert.ok(mechanical.every(n=>reaches(n,g.sfx)&&!reaches(n,g.music)));
    const snapshot=sound.snapshot();assert.equal(snapshot.surroundings.musicVoices,1);assert.equal(snapshot.layers.filter(n=>n.kind==='mechanism').length,1);assert.ok(snapshot.totalVoiceBound>=snapshot.combinedVoiceBound+1);sound.dispose();
  }
  const credit=CREDITS.find(section=>section.heading.includes('Retained Music')).lines.join('\n');
  for(const id of ['ensemble','couperin']){const piece=standingTearRepertoireById(id);for(const text of [piece.performer,piece.source,piece.licenceUrl])assert.ok(credit.includes(text));}
  assert.match(credit,/Source II–III/);assert.match(credit,/10\/12-bit PCM amplitude quantization/);assert.match(credit,/28\/36 kHz sample holding/);assert.match(credit,/6\.8-second synthetic convolution/);
});

test('wrapper pause and REC/listen/playback protection silence every owned graph; fake Ellery never starts the surroundings score',async()=>{
  const g=audioGraph();let protectedValue=false;const sound=wrapper(g,{protectedAudio:()=>protectedValue}),s=state({elapsed:5});
  sound.update({state:s,ready:true});await settle();sound.update({state:s,ready:true});assert.equal(sound.snapshot().surroundings.musicVoices,1);
  sound.pause();assert.equal(sound.snapshot().sources,0);assert.equal(sound.snapshot().surroundings.voices,0);g.ctx.currentTime+=40;
  sound.update({state:s,ready:true,paused:true});assert.equal(sound.snapshot().surroundings.voices,0);sound.update({state:s,ready:true});assert.equal(sound.snapshot().surroundings.music.phase,sourceSurroundingsFrame(s).score.phase);
  protectedValue=true;sound.update({state:s,ready:true});assert.equal(sound.snapshot().sources,0);assert.equal(sound.snapshot().surroundings.voices,0);
  protectedValue=false;const count=g.fetches.length;sound.update({state:{...s,phase:'ellery'},ready:true});await settle();assert.equal(sound.snapshot().surroundings.voices,0);assert.equal(g.fetches.length,count);
  sound.update({state:s,ready:false});assert.equal(sound.snapshot().sources,0);assert.equal(sound.snapshot().surroundings.voices,0);sound.dispose();
});

test('the actual rotated Catch scene passes raw surroundings state separately, keeping fixed music aligned with the unchanged world',async()=>{
  const g=audioGraph(),sound=wrapper(g),updates=[],checkpoint=state({phase:'catch',x:-27,z:-12,feet:8.4,level:0,yaw:.2,pitch:-.1,elapsed:2}),rotation=Math.PI/2;
  const audio={...sound,update:args=>{updates.push(args);return sound.update(args);}},renderer={initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}};
  const scene=createSourceContinuationScene({checkpoint,renderer,audio,studyRotation:rotation});await scene.initialize();scene.update(.016);await settle();g.ctx.currentTime+=.016;scene.update(.016);
  const args=updates.at(-1);assert.ok(args);assert.notEqual(args.state,args.surroundingsState);assert.deepEqual(args.surroundingsState,scene.serialize());assert.ok(Math.abs(args.state.yaw-args.surroundingsState.yaw-rotation)<1e-8);
  assert.notEqual(args.state.x,args.surroundingsState.x);const score=sourceSurroundingsFrame(args.surroundingsState).score;
  const expected=sourceSurroundingsPlacement(score.position,args.surroundingsState),wrong=sourceSurroundingsPlacement(score.position,args.state);
  assert.deepEqual(sound.snapshot().surroundings.music.placement,expected);assert.notDeepEqual(expected.relativeXYZ,wrong.relativeXYZ,'a rotated listener against unrotated source would point at the wrong physical material');
  assert.equal(sound.snapshot().surroundings.score.phase,score.phase);scene.pause();assert.equal(sound.snapshot().surroundings.voices,0);scene.exit();sound.dispose();
});

test('the actual host observer silences a frozen Source beneath an overlay and resumes from its held score',async()=>{
  const g=audioGraph(),sound=wrapper(g),renderer={initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}};
  const scene=createSourceContinuationScene({checkpoint:state(),renderer,audio:sound});
  await scene.initialize();scenes.clear();scenes.push(scene);
  try{
    scenes.update(.1);await settle();scenes.update(.1);assert.equal(sound.snapshot().surroundings.musicVoices,1);
    const before=scene.serialize().elapsed;
    const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    const source=main.slice(main.indexOf('function tickSourceWindowMedia('),main.indexOf('function standingTearPhysical('));
    const env={standingTearScene:null,sourceContinuationScene:scene,sourceContinuationAudio:sound,sourceContinuationTrace:[],
      sourceMediaTraceTail:null,sourceMediaOwner:scene,sourceMediaFrame:null,sourceMediaReady:true,standingTearMediaTraces:[],
      sourceWindowMedia:{update(){},stop:async()=>{}},paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>true,scenes};
    const observe=Function('environment',`with(environment){${source};return tickSourceWindowMedia;}`)(env);
    scenes.push({id:'window-transition',overlay:true,freezesBelow:true,blocksInput:true});
    assert.equal(scenes.top(),scene,'this actual overlay is deliberately omitted from ordinary top()');
    assert.equal(scenes.isFrozen(scene),true);observe(0);assert.equal(sound.snapshot().surroundings.voices,0);
    g.ctx.currentTime+=3;scenes.update(3);observe(3);assert.equal(scene.serialize().elapsed,before);
    assert.equal(sound.snapshot().totalSourceBound,0);
    scenes.remove('window-transition');assert.equal(scenes.isFrozen(scene),false);scenes.update(.1);observe(.1);
    assert.equal(sound.snapshot().surroundings.musicVoices,1);assert.equal(sound.snapshot().surroundings.resyncs,0);
    assert.equal(sound.snapshot().surroundings.score.phase,sourceSurroundingsFrame(scene.serialize()).score.phase);
  }finally{scenes.clear();sound.dispose();}
});
