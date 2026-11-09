import test from 'node:test';
import assert from 'node:assert/strict';
import {b3SpeakerAudioFrame,createB3SpeakerAudio} from '../src/audio/b3-speaker-audio.js';
import {B3_SPEAKER_SOURCE} from '../src/game/b3-speaker-disturbance.js';
import {B3_SPEAKER_MUSIC,B3_SPEAKER_LEGACY_MUSIC} from '../src/data/b3-speaker-source.js';
import {CREDITS} from '../src/data/credits.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createHushFootstepPlayer,HUSH_FOOTSTEP_OUTPUT_GAIN} from '../src/audio/hush-footsteps.js';

const listener={x:14,z:11,floor:-4,group:'basement',yaw:Math.PI/2};
const frame={active:true,intensity:.8,listener,focused:true};
test('speaker sound originates at the authored studio speaker cabinet',async()=>{
 const {CONSERVATORY_PROPS}=await import('../src/data/conservatory-props.js');
 const cabinet=CONSERVATORY_PROPS.find(prop=>prop.id==='b3-speaker-1');
 assert.ok(cabinet,'the B3 studio speaker remains in the authored prop set');
 assert.equal(B3_SPEAKER_SOURCE.x,cabinet.x);
 assert.equal(B3_SPEAKER_SOURCE.z,cabinet.y);
 assert.equal(B3_SPEAKER_SOURCE.floor,-4);
 const onSpeaker=b3SpeakerAudioFrame({...frame,listener:{...listener,x:cabinet.x,z:cabinet.y}});
 assert.equal(onSpeaker.distance,0,'audio spatialization uses the same position');
});
test('speaker is localized, level-controlled and respects lifecycle and floor',()=>{
 const near=b3SpeakerAudioFrame(frame),away=b3SpeakerAudioFrame({...frame,listener:{...listener,x:3}});
 assert.ok(near.audible&&near.gain>away.gain);
 assert.ok(b3SpeakerAudioFrame({...frame,intensity:.2}).gain<near.gain);
 assert.ok(b3SpeakerAudioFrame({...frame,muffle:.8}).cutoff<near.cutoff);
 for(const input of [{active:false},{paused:true},{hidden:true},{focused:false},{enabled:false},{listener:{...listener,group:'ground',floor:0}}])
  assert.equal(b3SpeakerAudioFrame({...frame,...input}).audible,false);
});
function mockContext(){
 const calls=[];
 const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const node=(kind)=>({kind,connect(){},disconnect(){calls.push(`disconnect:${kind}`)}});
 const ctx={state:'running',sampleRate:100,currentTime:0,calls,
  createGain(){return{...node('gain'),gain:param()}},
  createBiquadFilter(){return{...node('filter'),frequency:param(),Q:param()}},
  createStereoPanner(){return{...node('pan'),pan:param()}},
  createBuffer(_channels,length,rate){const data=new Float32Array(length);return{numberOfChannels:1,length,sampleRate:rate,duration:length/rate,getChannelData:()=>data}},
  createBufferSource(){return{...node('source'),start(){calls.push('start')},stop(){calls.push('stop');this.onended?.()}}},
  decodeAudioData:async()=>{const b=ctx.createBuffer(1,200,100);b.getChannelData(0).fill(.5);return b},
 };
 return ctx;
}
test('source waits for its chamber recording then plays one physical programme without stacking loops',async()=>{
 const ctx=mockContext(),destination={};let requested=0;
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async()=>{requested++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}}});
 const first=audio.update(frame);assert.equal(first.active,false);assert.equal(first.reason,'loading');assert.equal(audio.tapeCue(),null);
 await audio.preload();const second=audio.update(frame);
 assert.equal(second.active,true);assert.equal(second.kind,'chamber-music');assert.equal(requested,1);
 assert.equal(ctx.calls.filter(x=>x==='start').length,1,'loading never starts a placeholder source');
 audio.update(frame);assert.equal(ctx.calls.filter(x=>x==='start').length,1,'no second recorded loop');
 assert.equal(audio.update({...frame,paused:true}).active,false);
 assert.equal(audio.update(frame).active,true,'resumes once after pause');
 audio.dispose();assert.equal(audio.state().active,false);
});

test('a take cue replays only its captured source and never outlives its recorded fragment',async()=>{
 const ctx=mockContext(),destination={};
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})});
 audio.update(frame);await audio.preload();audio.update(frame);ctx.currentTime=.4;
 const cue=audio.tapeCue(),nodes=[];
 assert.match(cue.cueId,/^b3\.speaker\.biber\./);
 assert.equal(audio.scheduleTapeCue(cue.cueId,1,{...cue,output:destination,nodes,duration:.4}),true);
 assert.equal(nodes.length,5,'take owns its cancellation handle, source, filter, gain and pan');
 assert.equal(audio.scheduleTapeCue('bell.tenor.clock',1,{output:destination,nodes}),false);
 assert.equal(audio.update({...frame,active:false}).active,false);
 assert.equal(audio.tapeCue(),null);
});

test('failed preload retries are bounded even if production asks every frame',async()=>{
 const ctx=mockContext(),destination={};let calls=0;
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async()=>{calls++;return{ok:false,status:503}}});
 audio.update(frame);await audio.preload();
 for(let i=0;i<60;i++)await audio.preload();
 assert.equal(calls,1,'a missing asset does not cause one fetch per frame');
 assert.equal(audio.state().active,false,'a missing music asset cannot play an unrelated false cue');assert.equal(audio.tapeCue(),null);
 ctx.currentTime=5.1;await audio.preload();assert.equal(calls,2,'a transient failure can recover');
 audio.dispose();
});


test('soundproof glazing reduces real speaker level and top end without moving the cabinet',()=>{
 const clear=b3SpeakerAudioFrame(frame),glass=b3SpeakerAudioFrame({...frame,occlusionDb:32});
 assert.ok(glass.gain<clear.gain*.03,'32 dB is substantial isolation, not a shallow volume change');
 assert.ok(glass.cutoff<600&&glass.cutoff>=180);
 assert.equal(glass.pan,clear.pan);assert.equal(glass.distance,clear.distance);
});

test('bundled Biber performance and release credit share verified provenance',()=>{
 const bytes=readFileSync(`public/${B3_SPEAKER_MUSIC.asset}`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),B3_SPEAKER_MUSIC.sha256);
 assert.equal(B3_SPEAKER_MUSIC.licence,'CC BY 4.0');
 assert.equal(B3_SPEAKER_MUSIC.performer,'Hofkapelle München; Rüdiger Lotter (director)');
 assert.equal(B3_SPEAKER_MUSIC.recordist,'Julia Chen');
 assert.match(B3_SPEAKER_MUSIC.instrumentation,/continuo/);
 assert.ok(B3_SPEAKER_MUSIC.durationSeconds>60);
 const lines=CREDITS.find(x=>x.heading==='Studio B3 — Speaker Recording').lines;
 assert.ok(lines.includes(B3_SPEAKER_MUSIC.sourceUrl)&&lines.includes(B3_SPEAKER_MUSIC.licenceUrl));
});

test('runtime music metadata matches the bundled attribution manifest',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/audio/b3/credits.json',import.meta.url),'utf8'));
 assert.deepEqual(B3_SPEAKER_MUSIC,manifest);
});

test('all Hush footstep layers share a ten-decibel output reduction',async()=>{
 const gains=[],param=()=>({value:0});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){}});
 const ctx={createGain(){const n=node();gains.push(n);return n},createBiquadFilter:node};
 const player=createHushFootstepPlayer({getContext:()=>ctx,getDestination:()=>({}),fetcher:async()=>({ok:true,json:async()=>({banks:{},clips:{}})})});
 await player.prepare('concrete');
 assert.equal(gains.length,3);
 assert.equal(gains.at(-1).gain.value,HUSH_FOOTSTEP_OUTPUT_GAIN);
 assert.ok(HUSH_FOOTSTEP_OUTPUT_GAIN>.31&&HUSH_FOOTSTEP_OUTPUT_GAIN<.32);
});


test('archived steps and Corelli keep their original sources while new cues use Biber',async()=>{
 const ctx=mockContext(),destination={},requests=[];
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async url=>{
  requests.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};
 }});
 audio.update(frame);await audio.preload();audio.update(frame);
 const nodes=[];
 assert.equal(audio.scheduleTapeCue('b3.speaker.steps.2',1,{output:destination,nodes}),true);
 assert.equal(audio.scheduleTapeCue('b3.speaker.music.2',1,{output:destination,nodes}),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(requests.some(url=>url.endsWith('audio/game/bunch-of-footsteps-sounds.mp3')));
 assert.ok(requests.some(url=>url.endsWith('audio/b3/corelli-trio-sonata-11-i.mp3')));
 assert.ok(requests.some(url=>url.endsWith(B3_SPEAKER_MUSIC.asset)));
 const legacy=readFileSync(`public/${B3_SPEAKER_LEGACY_MUSIC.asset}`);
 assert.equal(createHash('sha256').update(legacy).digest('hex'),B3_SPEAKER_LEGACY_MUSIC.sha256);
 assert.match(audio.tapeCue().cueId,/^b3\.speaker\.biber\./);
 nodes.forEach(node=>node.stop?.());audio.dispose();
});

test('recorded-source identities replay Biber and archived Corelli through distinct buffers',async()=>{
 const ctx=mockContext(),destination={},started=[];
 ctx.decodeAudioData=async bytes=>{
  const buffer=ctx.createBuffer(1,200,100);
  buffer.getChannelData(0).fill(new Uint8Array(bytes)[0]/10);return buffer;
 };
 const original=ctx.createBufferSource;
 ctx.createBufferSource=()=>{const source=original();source.start=function(){started.push(this.buffer.getChannelData(0)[50]);};return source;};
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async url=>({ok:true,arrayBuffer:async()=>Uint8Array.of(url.endsWith(B3_SPEAKER_MUSIC.asset)?1:2).buffer})});
 await audio.preload();audio.update(frame);const cue=audio.tapeCue();
 assert.match(cue.cueId,/^b3\.speaker\.biber\./);
 const nodes=[];
 assert.equal(audio.scheduleTapeCue(cue.cueId,1,{output:destination,nodes}),true);
 assert.equal(audio.scheduleTapeCue('b3.speaker.music.0',1,{output:destination,nodes}),true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started.length,3,'live Biber, recorded Biber and archived Corelli each retain their source');
 assert.ok(Math.abs(started[0]-.1)<1e-6&&Math.abs(started[1]-.1)<1e-6);
 assert.ok(Math.abs(started[2]-.2)<1e-6,'old unversioned tape does not silently become Biber');
 nodes.forEach(node=>node.stop?.());audio.dispose();
});
