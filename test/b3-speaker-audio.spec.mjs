import test from 'node:test';
import assert from 'node:assert/strict';
import {b3SpeakerAudioFrame,createB3SpeakerAudio} from '../src/audio/b3-speaker-audio.js';
import {B3_SPEAKER_SOURCE} from '../src/game/b3-speaker-disturbance.js';

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
test('source has an audible fallback while loading then plays the real asset without stacking loops',async()=>{
 const ctx=mockContext(),destination={};let requested=0;
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async()=>{requested++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}}});
 const first=audio.update(frame);assert.equal(first.active,true);assert.equal(first.kind,'tape-noise');
 await audio.preload();const second=audio.update(frame);
 assert.equal(second.active,true);assert.equal(second.kind,'recorded-footsteps');assert.equal(requested,1);
 assert.equal(ctx.calls.filter(x=>x==='start').length,2,'replacement creates one source for each kind');
 audio.update(frame);assert.equal(ctx.calls.filter(x=>x==='start').length,2,'no second recorded loop');
 assert.equal(audio.update({...frame,paused:true}).active,false);
 assert.equal(audio.update(frame).active,true,'resumes once after pause');
 audio.dispose();assert.equal(audio.state().active,false);
});

test('a take cue replays only its captured source and never outlives its recorded fragment',async()=>{
 const ctx=mockContext(),destination={};
 const audio=createB3SpeakerAudio({getAudio:()=>({ctx,destination}),fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})});
 audio.update(frame);await audio.preload();audio.update(frame);ctx.currentTime=.4;
 const cue=audio.tapeCue(),nodes=[];
 assert.match(cue.cueId,/^b3\.speaker\.steps\./);
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
 assert.equal(audio.state().kind,'tape-noise','fallback keeps the physical event audible');
 ctx.currentTime=5.1;await audio.preload();assert.equal(calls,2,'a transient failure can recover');
 audio.dispose();
});
