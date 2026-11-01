import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
class Param{constructor(v=0){this.value=v}setValueAtTime(v){this.value=v}linearRampToValueAtTime(v){this.value=v}exponentialRampToValueAtTime(v){this.value=v}cancelScheduledValues(){}}
class Node{constructor(){this.gain=new Param(1);this.pan=new Param();this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param(1)}connect(){}disconnect(){}start(){}stop(){}}
class Context{constructor(){this.currentTime=10;this.sampleRate=8000;this.oscillators=[]}
 createBuffer(channels,length,rate){const a=Array.from({length:channels},()=>new Float32Array(length));return{numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:i=>a[i]}}
 createBufferSource(){return new Node()}createGain(){return new Node()}createBiquadFilter(){return new Node()}createStereoPanner(){return new Node()}
 createOscillator(){const n=new Node();this.oscillators.push(n);return n}}

test('speaker fragments survive tape reload and do not intercept the existing bell',()=>{
 PB.stopPlayback();PB.loadTakes([]);const ctx=new Context(),events=[];
 PB.playbackInit({ctx,bus:ctx.createGain(),pickGuest:()=>null,chunkById:()=>null,chunkByKey:()=>null,
   scheduleB3Speaker:(cue,when,opts)=>events.push({cue,when,opts})});
 PB.beginTake('main_b3',{x:29,y:22},{durationSeconds:60});
 const take=PB.startTapeTake('main_b3');
 PB.noteDiscrete('main_b3',{cueId:'b3.speaker.steps.53',atSec:44.8,gain:.12,pan:-.2,provenance:{system:'b3-speaker',cutoff:840}});
 PB.noteDiscrete('main_b3',{cueId:'bell.tenor.clock',atSec:20});
 PB.finishTapeTake('main_b3',{elapsed:45,tapeElapsed:45,completed:true});
 const saved=JSON.parse(JSON.stringify(PB.serializeTakes()));PB.loadTakes(saved);
 const playing=PB.playTake(take.id,{atHead:true});assert.ok(playing);
 assert.equal(events.length,1);assert.equal(events[0].cue,'b3.speaker.steps.53');
 assert.ok(Math.abs(events[0].opts.duration-.2)<1e-8,'last fragment is clipped at the real take end');
 assert.equal(events[0].opts.gain,.12);assert.equal(events[0].opts.pan,-.2);
 assert.equal(events[0].opts.cutoff,840,'the playback fragment preserves its physical filtering');
 assert.equal(ctx.oscillators.length,1,'bell remains dispatched by its existing handler');
 PB.stopPlayback();
});
