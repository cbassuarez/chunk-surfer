import test from 'node:test';
import assert from 'node:assert/strict';
import {createStandingTearAudio} from '../src/audio/standing-tear.js';

function fixture(){
  const nodes=[],destination={id:'existing-master'},parameter=()=>({value:0,setValueAtTime(value,at){this.value=value;this.at=at;},exponentialRampToValueAtTime(value,at){this.value=value;this.at=at;}});
  const node=(kind,extra={})=>{const value={kind,connections:[],disconnects:0,connect(into){this.connections.push(into);return into;},disconnect(){this.disconnects++;},...extra};nodes.push(value);return value;};
  const context={currentTime:10,createGain:()=>node('gain',{gain:parameter()}),createStereoPanner:()=>node('panner',{pan:parameter()}),createBiquadFilter:()=>node('filter',{frequency:parameter()}),createOscillator:()=>node('oscillator',{frequency:parameter(),starts:[],stops:[],start(at){this.starts.push(at);},stop(at){this.stops.push(at);}})};
  const audio=createStandingTearAudio({getAudio:()=>({context,destination})});
  const frame={phase:'reference',camera:{eye:[0,1.62,0],yaw:0,pitch:0},audio:{live:false,liveSource:{x:-4,y:.85,z:18},transport:true,referenceSource:{x:7,y:.95,z:43},architecture:true,architectureSource:{x:0,y:62,z:175}}};
  return{audio,frame,nodes,context,destination,oscillators:()=>nodes.filter(n=>n.kind==='oscillator')};
}

test('the performed and retained motifs use the canonical octave at 440 and 444 references',()=>{
  const h=fixture();h.audio.event({type:'live-start'},h.frame);assert.equal(h.oscillators()[0].frequency.value,220);
  h.audio.event({type:'reference-start'},h.frame);assert.equal(h.oscillators()[4].frequency.value,222);
  const history=h.audio.snapshot().history.filter(e=>e.type==='bar');assert.deepEqual(history.map(e=>[e.channel,e.frequency]),[['live',440],['reference',444]]);
  assert.equal(h.nodes.filter(n=>n.connections.includes(h.destination)).length,1,'only this owner output connects to the existing master');h.audio.destroy();
});

test('release stops the performed bar while the retained transport and architectural continuation stay independent',()=>{
  const h=fixture();h.audio.event({type:'live-start'},h.frame);const live=h.oscillators().slice();h.audio.event({type:'reference-start'},h.frame);const retained=h.oscillators().slice(live.length);
  h.audio.event({type:'live-stop'},h.frame);assert.ok(live.every(n=>n.stops.includes(undefined)));assert.ok(retained.every(n=>!n.stops.includes(undefined)));
  h.audio.update(h.frame,{dt:.1});assert.equal(h.audio.snapshot().motor,true);h.audio.event({type:'transport-stop'},h.frame);assert.equal(h.audio.snapshot().motor,false);assert.ok(retained.every(n=>!n.stops.includes(undefined)));
  h.frame.audio.transport=false;h.audio.event({type:'architecture-continues'},h.frame);const last=h.audio.snapshot().history.at(-1);assert.equal(last.channel,'architecture');assert.deepEqual(last.source,h.frame.audio.architectureSource);assert.ok(h.audio.snapshot().active>0);h.audio.destroy();
});

test('panning follows listener direction and distance alters the retained voice without moving its source',()=>{
  const h=fixture();h.audio.event({type:'reference-start'},h.frame);const first=h.audio.snapshot().history.at(-1);h.frame.camera.yaw=Math.PI;h.audio.event({type:'reference-start'},h.frame);const turned=h.audio.snapshot().history.at(-1);
  assert.ok(first.pan>0);assert.ok(turned.pan<0);assert.deepEqual(first.source,turned.source);
  h.frame.camera.eye=[6,1.62,42];h.audio.event({type:'reference-start'},h.frame);const near=h.audio.snapshot().history.at(-1);assert.ok(near.gain>first.gain);assert.ok(near.distance<first.distance);h.audio.destroy();
});

test('the visible deck remains the audible owner until stopping it, then the distant architecture answers',()=>{
  const h=fixture();h.audio.update(h.frame,{dt:.1});assert.equal(h.audio.snapshot().history.filter(e=>e.type==='bar').at(-1).channel,'reference');
  h.frame.audio.transport=false;h.audio.event({type:'transport-stop'},h.frame);h.audio.event({type:'architecture-continues'},h.frame);const transfer=h.audio.snapshot().history.at(-1);assert.equal(transfer.type,'reference-transferred');assert.equal(transfer.channel,'architecture');h.audio.destroy();
});

test('pause and teardown cancel all scheduled voices without advancing or leaking the shared context',()=>{
  const h=fixture();h.audio.update(h.frame,{dt:.1});const before=h.audio.snapshot().clock;h.audio.setPaused(true);assert.equal(h.audio.snapshot().active,0);h.audio.update(h.frame,{dt:20,paused:true});assert.equal(h.audio.snapshot().clock,before);
  h.audio.setPaused(false);h.audio.update(h.frame,{dt:.1});assert.ok(h.audio.snapshot().active>0);h.audio.destroy();const count=h.nodes.length;h.audio.update(h.frame,{dt:1});h.audio.event({type:'live-start'},h.frame);h.audio.destroy();assert.equal(h.nodes.length,count);assert.equal(h.audio.snapshot().active,0);assert.equal(h.audio.snapshot().closed,true);assert.equal(h.audio.snapshot().source,'non-player');
});

test('a closed threshold sounds once when the actual confinement event is delivered',()=>{
  const h=fixture();h.audio.event({type:'entry-folding'},h.frame);const first=h.audio.snapshot().history.at(-1);assert.equal(first.type,'entry-folding');assert.deepEqual(first.source,{x:0,y:1.3,z:0});assert.ok(first.distance<1);assert.equal(h.oscillators()[0].frequency.value,42);assert.equal(h.oscillators()[1].frequency.value,84);
  h.audio.event({type:'entry-closed'},h.frame);const closed=h.audio.snapshot().history.at(-1);assert.equal(closed.type,'threshold-closed');assert.equal(h.oscillators()[2].frequency.value,74);h.audio.destroy();
});

test('reference cadence and pause resumption follow the rendered transport phase',()=>{
  const h=fixture();h.frame.audio.referenceSeconds=.4;h.audio.update(h.frame,{dt:.1});let bars=h.audio.snapshot().history.filter(e=>e.type==='bar');assert.equal(bars.at(-1).offset,.4);
  const count=bars.length;h.frame.audio.referenceSeconds=1.8;h.audio.update(h.frame,{dt:.1});bars=h.audio.snapshot().history.filter(e=>e.type==='bar');assert.equal(bars.length,count);
  h.audio.setPaused(true);h.audio.setPaused(false);h.frame.audio.referenceSeconds=1.82;h.audio.update(h.frame,{dt:.02});const rest=h.audio.snapshot().history.at(-1);assert.equal(rest.type,'phrase-rest');assert.equal(rest.offset,1.82);assert.equal(rest.noteCount,0);
  h.frame.audio.referenceSeconds=1.95;h.audio.update(h.frame,{dt:.1});bars=h.audio.snapshot().history.filter(e=>e.type==='bar');assert.ok(Math.abs(bars.at(-1).offset-.05)<1e-6);h.audio.destroy();
});

test('a suspended shared context cannot accumulate unheard phrases or defer the first live action for a full bar',()=>{
  const h=fixture();h.context.state='suspended';h.frame.audio.live=true;assert.equal(h.audio.event({type:'live-start'},h.frame),false);h.audio.event({type:'reference-start'},h.frame);h.audio.update(h.frame,{dt:4});assert.equal(h.audio.snapshot().clock,0);assert.equal(h.oscillators().length,0);
  h.context.state='running';h.frame.audio.referenceSeconds=.2;h.audio.update(h.frame,{dt:.05});assert.ok(h.audio.snapshot().history.some(v=>v.type==='bar'&&v.channel==='live'));assert.ok(h.audio.snapshot().history.some(v=>v.type==='bar'&&v.channel==='reference'&&v.offset===.2));h.audio.destroy();
});

test('stopping mid-note preserves the retained oscillator, note remainder and phrase phase while the motor stops',()=>{
  const h=fixture();h.frame.audio.referenceSeconds=0;h.audio.event({type:'reference-start'},h.frame);const notes=h.oscillators().slice(),sounding=notes[1];
  h.context.currentTime=10.4;h.frame.audio.referenceSeconds=.375;h.audio.update(h.frame,{dt:.1});assert.equal(h.audio.snapshot().motor,true);
  const starts=sounding.starts.slice(),stops=sounding.stops.slice();h.audio.event({type:'transport-stop'},h.frame);const stoppedCount=h.oscillators().length;
  h.frame.audio.transport=false;h.frame.stoppedSeconds=0;h.audio.event({type:'architecture-continues'},h.frame);
  assert.equal(h.audio.snapshot().motor,false);assert.deepEqual(sounding.starts,starts);assert.deepEqual(sounding.stops,stops);assert.equal(h.oscillators().length,stoppedCount,'transfer must not start a replacement oscillator or downbeat');
  const transfer=h.audio.snapshot().history.at(-1);assert.equal(transfer.type,'reference-transferred');assert.equal(transfer.offset,.375);assert.equal(transfer.noteCount,5,'the sounding note and its four scheduled successors remain');
  h.frame.stoppedSeconds=.30;h.audio.update(h.frame,{dt:.1});assert.equal(h.oscillators().length,stoppedCount,'the same phrase continues through subsequent stop frames');
  h.frame.stoppedSeconds=1.625;h.audio.update(h.frame,{dt:.1});const next=h.audio.snapshot().history.at(-1);assert.equal(next.type,'bar');assert.equal(next.channel,'architecture');assert.ok(Math.abs(next.offset-.1)<1e-6,'the next phrase uses .375 + 1.625 seconds, preserving the retained clock');h.audio.destroy();
});
