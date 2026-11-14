import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneStorm} from '../src/audio/scene-storm.js';
import {createThunderVoice} from '../src/audio/thunder.js';

const param=value=>({value,setValueAtTime(v){this.value=v;}});
function context(){
 const sources=[],nodes=[],c={currentTime:0,sampleRate:8000};
 const node=()=>{const n={connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];}};nodes.push(n);return n;};
 c.createGain=()=>Object.assign(node(),{gain:param(1)});
 c.createStereoPanner=()=>Object.assign(node(),{pan:param(0)});
 c.createBiquadFilter=()=>Object.assign(node(),{gain:param(0),frequency:param(0)});
 c.createBuffer=(channels,length,sampleRate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{length,duration:length/sampleRate,sampleRate,getChannelData:i=>data[i]};};
 c.createBufferSource=()=>{const n=Object.assign(node(),{start(at,offset){this.started={at,offset};},stop(){this.stopped=true;}});sources.push(n);return n;};
 return{c,sources,nodes,destination:c.createGain()};
}
function fixture(profile='drive'){
 const f=context(),events=[],voices=[];
 const storm=createSceneStorm({getAudio:()=>({ctx:f.c,destination:f.destination}),seed:1947,profile,
  createVoice:()=>{const voice={paused:true,stopped:false,prepare(e){events.push({kind:'prepare',event:{...e}});},strike(e){events.push({kind:'thunder',event:{...e}});},setPaused(v){this.paused=v;},stop(){this.stopped=true;}};voices.push(voice);return voice;}});
 return{...f,storm,events,voices};
}
const advance=(f,seconds,options={})=>{for(let t=0;t<seconds-1e-8;t+=.1){f.c.currentTime+=.1;f.storm.update({dt:.1,...options});}};

test('scene weather pairs every arrival with its actual flash, direction, energy and acoustic delay',()=>{
 const f=fixture();advance(f,80);const history=f.storm.snapshot().history,
  flashes=history.filter(e=>e.type==='flash'),arrivals=history.filter(e=>e.type==='thunder');
 assert(flashes.length>=4&&arrivals.length>=3,'a live drive receives a varied storm, not only a prologue timer');
 for(const arrival of arrivals){const flash=flashes.find(e=>e.seed===arrival.seed);assert(flash,'each sound has a named earlier flash');
  for(const key of ['distance','bearing','energy'])assert.equal(arrival[key],flash[key],key);
  assert(Math.abs(arrival.delay-arrival.distance/343)<1e-9);
  assert(Math.abs((arrival.at-flash.at)-arrival.delay)<.101,'host cadence only rounds arrival to a frame');}
 assert(new Set(flashes.map(e=>Math.round(e.distance))).size>=3,'distance changes, not only gain');
 assert(flashes.every(e=>e.distance>=600&&e.distance<=5600));
 assert(f.events.filter(e=>e.kind==='prepare').length>=arrivals.length);
 f.storm.dispose();assert(f.voices[0].stopped);assert.equal(f.storm.frame().flash,0);
});

test('pause and protected intervals hold the same event, including a flash-off change while held',()=>{
 const f=fixture();advance(f,3.2);const before=f.storm.checkpoint(),n=f.events.length;
 advance(f,30,{paused:true});assert.deepEqual(f.storm.checkpoint(),before);assert.equal(f.events.length,n);assert(f.voices[0].paused);
 advance(f,2,{protectedAudio:true});assert.deepEqual(f.storm.checkpoint(),before);
 assert.equal(f.storm.update({dt:.1,paused:true,flashMode:'off'}).flash,0);
 advance(f,.1);assert(f.storm.frame().time>before.state.time);assert.equal(f.voices[0].paused,false);
 const checkpoint=f.storm.checkpoint(),g=fixture();g.storm.dispose();
 const restored=createSceneStorm({checkpoint,getAudio:()=>({ctx:f.c,destination:f.destination}),createVoice:()=>({prepare(){},setPaused(){},stop(){}})});
 assert.deepEqual(restored.checkpoint(),checkpoint);f.storm.dispose();restored.dispose();
});

test('host time is the only weather clock and reduced/off affect light without changing thunder identity',()=>{
 const a=fixture(),b=fixture();advance(a,50,{flashMode:'full'});advance(b,50,{flashMode:'off'});
 assert.deepEqual(a.storm.checkpoint(),b.storm.checkpoint());assert.equal(b.storm.frame().flash,0);
 const before=a.storm.checkpoint();a.c.currentTime+=100;assert.deepEqual(a.storm.checkpoint(),before,'AudioContext time alone cannot advance weather');
 a.storm.dispose();b.storm.dispose();
});

test('thunder pauses the actual buffer offset and retires every source and tail on exit',()=>{
 const f=context(),voice=createThunderVoice({context:f.c,destination:f.destination}),event={seed:717,distance:900,bearing:-.8,energy:.7,bands:{low:1,mid:.82,high:.34}};
 assert.equal(voice.prepare(event),true);assert.equal(voice.strike(event),true);
 const first=f.sources.at(-1),oldEnded=first.onended;assert.equal(first.started.offset,0);f.c.currentTime=1.25;voice.setPaused(true);
 assert.equal(first.stopped,true);assert.equal(voice.snapshot().voices[0].offsetSeconds,1.25);
 f.c.currentTime=11.25;voice.setPaused(false);const second=f.sources.at(-1);assert.notEqual(second,first);assert.equal(second.started.offset,1.25);
 oldEnded();assert.equal(voice.snapshot().voices.length,1,'a retired source cannot end the resumed voice');
 f.c.currentTime=11.75;assert.equal(voice.snapshot().voices[0].offsetSeconds,1.75);voice.stop();
 assert.equal(voice.snapshot().voices.length,0);assert(f.nodes.every(n=>n.connections.length===0));assert.equal(voice.strike(event),false);
});

test('sound arrival uses the present listener orientation while the world flash retains its bearing',()=>{
 const a=fixture(),b=fixture();advance(a,25,{listenerYaw:0});advance(b,25,{listenerYaw:Math.PI});
 const aa=a.events.filter(e=>e.kind==='thunder'),bb=b.events.filter(e=>e.kind==='thunder');assert(aa.length>0);assert.equal(aa.length,bb.length);
 for(let i=0;i<aa.length;i++){assert.equal(aa[i].event.worldBearing,bb[i].event.worldBearing);assert(Math.abs(aa[i].event.bearing-bb[i].event.bearing-Math.PI)<1e-9);}
 assert.deepEqual(a.storm.snapshot().history,b.storm.snapshot().history,'the sky never rotates with the listener');a.storm.dispose();b.storm.dispose();
});

test('missing audio holds weather until the episode can own both picture and sound',()=>{
 const f=context();let available=false;
 const storm=createSceneStorm({getAudio:()=>available?{ctx:f.c,destination:f.destination}:null,createVoice:()=>({setPaused(){},prepare(){},stop(){}})});
 for(let i=0;i<100;i++)storm.update({dt:.1});assert.equal(storm.frame().time,0);assert(storm.frame().held);
 available=true;storm.update({dt:.1});assert.equal(storm.frame().time,.1);storm.dispose();
});
