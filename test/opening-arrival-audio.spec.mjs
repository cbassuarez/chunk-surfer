import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningArrivalAudio,OPENING_ARRIVAL_AUDIO as C} from '../src/audio/opening-arrival.js';

const parameter=()=>({value:0,values:[],cancelScheduledValues(){},setValueAtTime(v){this.value=v;this.values.push(v);},setTargetAtTime(v){this.value=v;this.values.push(v);},linearRampToValueAtTime(v){this.value=v;this.values.push(v);}});
function fixture({deferred=false}={}){
  const nodes=[],sources=[],requests=[];const node=(kind,extra={})=>{const n={kind,connect(){},disconnect(){this.disconnected=true;},...extra};nodes.push(n);return n;};
  const source=kind=>{const s=node(kind,{starts:[],stops:[],frequency:parameter(),start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}});sources.push(s);return s;};
  const ctx={state:'running',currentTime:10,sampleRate:8000,createGain:()=>node('gain',{gain:parameter()}),createBiquadFilter:()=>node('filter',{frequency:parameter(),Q:parameter()}),createStereoPanner:()=>node('pan',{pan:parameter()}),createBufferSource:()=>source('buffer'),createOscillator:()=>source('oscillator'),
    createBuffer(channels,length,sampleRate){const pcm=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/sampleRate,getChannelData:k=>pcm[k]};},decodeAudioData:async()=>({duration:4})};
  const fetcher=url=>{let resolve;const result=new Promise(done=>resolve=done);requests.push({url,resolve});if(!deferred)resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});return result;};
  const destination=node('destination');const owned=createOpeningArrivalAudio({getAudio:()=>({ctx,destination}),fetcher,urlFor:path=>path});
  return{audio:owned,ctx,nodes,sources,requests,update:(drive={},extra={})=>owned.update({dt:.1,state:{phase:'driving',elapsed:1,drive:{speed:5,engineLoad:.4,throttle:.5,gear:1,elapsed:1,...drive}},ready:true,...extra})};
}

test('vehicle preparation decodes only existing contacts and never creates music, programmes or live sources',async()=>{
  const h=fixture();assert.deepEqual(await Promise.all([h.audio.prepare(),h.audio.prepare()]),[true,true]);assert.equal(h.sources.length,0);assert.deepEqual(h.requests.map(r=>r.url).sort(),Object.values(C.samples).sort());assert.equal(h.audio.snapshot().containsMusic,false);h.audio.dispose();
});

test('readiness and pause gate all voices; live driving uses a bounded continuous graph and actual motion',()=>{
  const h=fixture();assert.equal(h.update({}, {ready:false}),false);assert.equal(h.sources.length,0);h.update();assert.equal(h.audio.snapshot().continuousSources,7);const start=h.sources.length;
  for(let k=0;k<40;k++){h.ctx.currentTime+=.1;h.update({speed:k/3,engineLoad:k/40,elapsed:1+k*.1});}
  assert.equal(h.sources.length,start);assert.ok(h.audio.snapshot().mix.engineHz>28);h.update({speed:0,engineOn:false});assert.equal(h.audio.snapshot().mix.engineGain,0);assert.equal(h.audio.snapshot().mix.roadGain,0);
  h.update({}, {paused:true});assert.equal(h.audio.snapshot().continuousSources,0);assert.equal(h.audio.snapshot().voices,0);assert.ok(h.sources.every(source=>source.stops.length));h.update();assert.equal(h.audio.snapshot().continuousSources,7);h.audio.dispose();assert.equal(h.audio.snapshot().continuousSources,0);
});

test('physical door, footfall and impact events stay finite, bounded and deduplicated per actual contact',async()=>{
  const h=fixture();await h.audio.prepare();h.update();assert.equal(h.audio.event({type:'opening-vehicle-door-open',id:'driver',seconds:1}),true);assert.equal(h.audio.event({type:'opening-vehicle-door-open',id:'driver',seconds:1}),false);
  h.audio.event({type:'opening-vehicle-door-close'});h.audio.event({type:'opening-vehicle-exit-step'});h.audio.event({type:'opening-vehicle-contact',id:'wall',seconds:2,impactSpeed:3});h.audio.event({type:'opening-vehicle-contact',id:'wall',seconds:3,impactSpeed:2});
  assert.equal(h.audio.snapshot().history.filter(r=>r.type==='contact').length,2,'separate physical collisions at one object remain separate contacts');
  for(let k=0;k<20;k++)h.audio.event({type:'handbrake'});assert.equal(h.audio.snapshot().voices,C.maxVoices);assert.ok(h.sources.filter(s=>s.starts[0]?.length===3).every(s=>s.stops.length===1));
  assert.ok(h.audio.snapshot().history.some(r=>r.type==='door-close'&&r.sample));assert.ok(h.audio.snapshot().history.some(r=>r.type==='exit-step'&&r.sample));h.audio.pause();assert.equal(h.audio.event({type:'door-close'}),false);assert.equal(h.audio.snapshot().voices,0);h.audio.dispose();
});

test('wiper contacts follow actual blade reversal and pause primes history instead of replaying contacts',()=>{
  const h=fixture();for(const angle of[0,.2,.4,.2])h.update({}, {weather:{wiperMoving:true,wiperAngles:[angle],rain:.3}});
  assert.equal(h.audio.snapshot().history.filter(r=>r.type==='wiper-return').length,1);h.audio.pause();h.update({}, {weather:{wiperMoving:true,wiperAngles:[-.3]}});assert.equal(h.audio.snapshot().history.filter(r=>r.type==='wiper-return').length,1);h.audio.dispose();
});

test('late contact decodes after disposal cannot allocate or replay a source',async()=>{
  const h=fixture({deferred:true}),preparing=h.audio.prepare();await Promise.resolve();h.audio.dispose();for(const row of h.requests)row.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});assert.equal(await preparing,false);assert.equal(h.sources.length,0);assert.equal(h.audio.snapshot().voices,0);
});
