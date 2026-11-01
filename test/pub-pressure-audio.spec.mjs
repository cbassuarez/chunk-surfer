import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPubPressureAudio,createPubPressureBuffer,pubPressureSpatial,PUB_PRESSURE,PUB_PRESSURE_ANCHOR} from '../src/audio/pub-pressure.js';
import {PUB_ROOM_SOUND_ANCHORS} from '../src/audio/pub-room.js';
import {EXTERIOR_PUB} from '../src/data/exterior-pub.js';

class Param{
  constructor(ctx,value=0){this.ctx=ctx;this.value=value;this.events=[];}
  event(type,value,at,extra){this.events.push({type,value,at,extra});if(at<=this.ctx.currentTime)this.value=value;}
  setValueAtTime(v,t){this.event('value',v,t);}
  linearRampToValueAtTime(v,t){this.event('linear',v,t);}
  exponentialRampToValueAtTime(v,t){this.event('exponential',v,t);}
  setTargetAtTime(v,t,c){this.event('target',v,t,c);}
  cancelScheduledValues(t){this.events=this.events.filter(e=>e.at<t);this.events.push({type:'cancel',at:t});}
}
class Context{
  constructor(){this.sampleRate=8000;this.currentTime=0;this.state='running';this.nodes=[];this.sources=[];this.failStart=false;this.destination=this.node('destination');}
  node(kind){const ctx=this,node={kind,connections:[],gain:new Param(ctx,kind==='gain'?1:0),frequency:new Param(ctx),pan:new Param(ctx),Q:new Param(ctx),
    connect(other){this.connections.push(other);},disconnect(){this.connections=[];this.disconnected=true;}};this.nodes.push(node);return node;}
  createGain(){return this.node('gain');}createBiquadFilter(){return this.node('filter');}createStereoPanner(){return this.node('panner');}
  createBuffer(channels,length,rate){assert.equal(channels,1);const values=new Float32Array(length);return{duration:length/rate,sampleRate:rate,getChannelData:()=>values};}
  createBufferSource(){const ctx=this,source=this.node('source');
    source.start=at=>{let next=source,seen=new Set();source.startGains=[];
      while(next&&!seen.has(next)){seen.add(next);if(next.kind==='gain')source.startGains.push(next.gain.value);next=next.connections[0];}
      if(ctx.failStart)throw Error('injected source-start failure');source.started=true;source.startedAt=at;
    };
    source.stop=at=>{if(!source.started)throw Error('not started');source.ends=at??ctx.currentTime;if(source.ends<=ctx.currentTime&&!source.stopped){source.stopped=true;source.onended?.();}};
    this.sources.push(source);return source;
  }
  advance(dt){this.currentTime+=dt;for(const source of this.sources)if(source.started&&!source.stopped&&source.ends<=this.currentTime){source.stopped=true;source.onended?.();}}
}
const listener={x:PUB_PRESSURE_ANCHOR.x-2,y:1.74,z:PUB_PRESSURE_ANCHOR.z,yaw:0};
function fixture(){let ctx=new Context(),destination=ctx.destination;const audio=createPubPressureAudio({getAudio:()=>({ctx,destination})});
  return{audio,ctx:()=>ctx,play:(id='pub-pipe-note',extra={})=>audio.play({id,listener,...extra}),replace:()=>{ctx=new Context();destination=ctx.destination;}};}
const connected=ctx=>ctx.nodes.filter(n=>n.connections.length);

test('construction is silent and the anchor is the actual counter beneath the pub floor',()=>{
  const h=fixture();assert.equal(h.ctx().nodes.length,1);assert.equal(h.audio.snapshot().voices,0);assert.equal(h.audio.snapshot().nodes,0);assert.equal(h.audio.snapshot().pending,false);
  assert.equal(PUB_PRESSURE_ANCHOR.x,PUB_ROOM_SOUND_ANCHORS.glass.x);assert.equal(PUB_PRESSURE_ANCHOR.z,PUB_ROOM_SOUND_ANCHORS.glass.z);
  assert.equal(PUB_PRESSURE_ANCHOR.y,EXTERIOR_PUB.floor-.45);assert.equal(PUB_PRESSURE.frequencyHz,220);
});

test('one fixed A220 hammered-string buffer is bounded, finite and identified as procedural',()=>{
  const ctx=new Context(),buffer=createPubPressureBuffer(ctx),samples=buffer.getChannelData(0);assert.equal(buffer.duration,2);assert.equal(buffer.sampleRate,ctx.sampleRate);
  assert.ok(samples.every(Number.isFinite));assert.equal(samples[0],0);assert.ok(Math.max(...samples.map(Math.abs))<=.820001);
  const power=hz=>{let re=0,im=0;for(let i=400;i<8000;i++){const phase=2*Math.PI*hz*i/ctx.sampleRate;re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase);}return Math.hypot(re,im);};
  assert.ok(power(220)>power(200)*20&&power(220)>power(240)*20,'the note remains A220 rather than a pitch sweep or melodic phrase');
  assert.ok(Math.max(...samples.slice(-80).map(Math.abs))<.002,'the bounded buffer closes quietly');
  assert.match(PUB_PRESSURE.synthesis,/approximation/);assert.equal(createPubPressureBuffer({...ctx,sampleRate:NaN}),null);
});

test('one successful event starts through zero gains, has no loop and never exceeds the quiet envelope cap',()=>{
  const h=fixture();assert.equal(h.play(),true);const source=h.ctx().sources[0],snapshot=h.audio.snapshot();
  assert.deepEqual(source.startGains,[0,0]);assert.equal(source.loop,false);assert.equal(source.ends-source.startedAt,2);
  assert.equal(snapshot.voices,1);assert.equal(snapshot.nodes,5);assert.equal(snapshot.peakVoices,1);assert.equal(snapshot.created,1);
  const filter=h.ctx().nodes.find(n=>n.kind==='filter');assert.equal(filter.type,'lowpass');assert.equal(filter.frequency.value,750);
  const envelope=h.ctx().nodes.find(n=>n.kind==='gain'),levels=envelope.gain.events.filter(e=>Number.isFinite(e.value)).map(e=>e.value);
  assert.ok(Math.max(...levels)<=.035);assert.ok(levels.includes(0));assert.equal(levels.at(-1),0);
  assert.equal(h.play('different-event'),false);assert.equal(h.audio.snapshot().created,1);assert.deepEqual(h.audio.snapshot().playedIds,['pub-pipe-note']);
});

test('IDs are consumed only after actual successful play; ended notes never replay or queue',()=>{
  const h=fixture();h.ctx().state='suspended';const before=h.ctx().nodes.length;
  assert.equal(h.play(),false);assert.equal(h.ctx().nodes.length,before);assert.deepEqual(h.audio.snapshot().playedIds,[]);
  h.ctx().state='running';assert.equal(h.audio.update({listener}),false);assert.equal(h.ctx().sources.length,0,'readiness never drains a deferred event');
  h.ctx().failStart=true;assert.equal(h.play(),false);assert.deepEqual(h.audio.snapshot().playedIds,[]);assert.equal(connected(h.ctx()).length,0);
  h.ctx().failStart=false;assert.equal(h.play(),true);h.ctx().advance(2.01);assert.equal(h.audio.snapshot().voices,0);assert.equal(connected(h.ctx()).length,0);
  assert.equal(h.play(),false);assert.equal(h.audio.snapshot().created,1);assert.equal(h.play('explicit-second-id'),true);
});

test('pause, Source, exit, focus loss and busy gates cancel every node without a resumed tail',()=>{
  for(const gate of[{paused:true},{source:true},{inPub:false},{active:false},{blurred:true},{busy:true},{recording:true}]){
    const h=fixture();assert.equal(h.play(),true);assert.equal(h.audio.update({listener,...gate}),false);
    assert.equal(h.audio.snapshot().voices,0);assert.equal(connected(h.ctx()).length,0);assert.equal(h.audio.snapshot().pending,false);
    h.ctx().advance(3);assert.equal(h.audio.update({listener}),false);assert.equal(h.play(),false,'a canceled played ID remains consumed');
    assert.equal(h.play('gated-new-id',gate),false);assert.equal(h.audio.snapshot().playedIds.includes('gated-new-id'),false);
  }
  const h=fixture();h.play();h.audio.pause();assert.equal(connected(h.ctx()).length,0);assert.equal(h.audio.snapshot().reason,'paused');
});

test('spatial pan follows actual listener yaw and distance while the source stays anchored below the counter',()=>{
  const h=fixture();h.play();const a=h.audio.snapshot().frame;assert.ok(a.pan>0);assert.ok(a.gain<1);
  const later={...listener,yaw:Math.PI};assert.equal(h.audio.update({listener:later}),true);const b=h.audio.snapshot().frame;
  assert.ok(b.pan<0);assert.deepEqual(b.anchor,a.anchor);assert.equal(b.distance,a.distance);
  h.audio.update({listener:{...listener,x:listener.x-20}});assert.ok(h.audio.snapshot().frame.gain<a.gain);
  assert.equal(h.ctx().sources.length,1,'listener movement cannot retrigger or layer the note');
  const frame=pubPressureSpatial({x:Infinity,z:NaN,yaw:Infinity});assert.ok(Object.values(frame).every(Number.isFinite));
});

test('suspension and context replacement revoke the existing graph and cannot emit a new unready event',()=>{
  const h=fixture();h.play();const first=h.ctx();h.ctx().state='suspended';assert.equal(h.audio.update({listener}),false);assert.equal(connected(first).length,0);
  assert.equal(h.play('unready'),false);assert.equal(h.audio.snapshot().playedIds.includes('unready'),false);
  h.replace();assert.equal(h.audio.update({listener}),false);assert.equal(h.ctx().sources.length,0);assert.equal(h.play('replacement-event'),true);
  const second=h.ctx();h.replace();assert.equal(h.audio.update({listener}),false);assert.equal(connected(second).length,0);assert.equal(h.ctx().sources.length,0);
});

test('stop and disposal release nodes and buffers and never create a replacement voice',()=>{
  const h=fixture();h.play();h.audio.stop('exit');assert.equal(h.audio.snapshot().nodes,0);assert.equal(h.audio.snapshot().cachedBuffers,0);assert.equal(connected(h.ctx()).length,0);
  assert.equal(h.play('last-explicit-event'),true);h.audio.dispose();const count=h.ctx().sources.length;
  assert.equal(h.audio.snapshot().disposed,true);assert.equal(h.audio.snapshot().nodes,0);assert.equal(h.audio.snapshot().cachedBuffers,0);
  assert.equal(h.play('disposed-event'),false);assert.equal(h.audio.update({listener}),false);assert.equal(h.ctx().sources.length,count);
});

test('invalid/unavailable events allocate nothing and the adapter has no independent event or gameplay authority',()=>{
  const h=fixture();for(const input of[{id:'bad',listener:{x:NaN,z:0}},{id:'',listener},{id:'bad',listener,anchor:{x:0,z:Infinity}}])assert.equal(h.audio.play(input),false);
  assert.equal(h.ctx().sources.length,0);assert.deepEqual(h.audio.snapshot().playedIds,[]);
  const missing=createPubPressureAudio({getAudio:()=>({ctx:new Context()})});assert.equal(missing.play({id:'no-route',listener}),false);
  const throwing=createPubPressureAudio({getAudio:()=>{throw Error('not ready');}});assert.equal(throwing.play({id:'no-context',listener}),false);
  const source=readFileSync(new URL('../src/audio/pub-pressure.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/REC\.|PRES\.|SPEECH\.|setInterval\(|setTimeout\(|requestAnimationFrame|\.resume\(|createConvolver\(|createDelay\(/);
});
