import test from 'node:test';
import assert from 'node:assert/strict';
import {createStartupVanAudio,startupVanMix,startupVanWaveforms} from '../src/audio/startup-van.js';

test('original engine and friction waveforms are finite, bounded and seamed',()=>{
  const a=startupVanWaveforms(48000),b=startupVanWaveforms(48000);
  for(const key of['engine','tyres']){
    assert.equal(a[key].length,48000);assert.deepEqual(a[key],b[key]);
    assert.ok(Math.abs(a[key][0])===0);assert.ok(Math.abs(a[key].at(-1))===0);
    let sum=0,energy=0;for(const sample of a[key]){assert.ok(Number.isFinite(sample));assert.ok(Math.abs(sample)<.5);sum+=sample;energy+=sample*sample;}
    assert.ok(Math.abs(sum/a[key].length)<.001);assert.ok(energy/a[key].length>.008);
  }
  assert.notDeepEqual(a.engine,a.tyres);
  assert.equal(a.rain.length,48000);assert.deepEqual(a.rain,b.rain);
  let rainEnergy=0;for(const sample of a.rain){assert.ok(Number.isFinite(sample)&&Math.abs(sample)<1.01);rainEnergy+=sample*sample;}
  assert.ok(rainEnergy/a.rain.length>.2);assert.equal(Math.abs(a.rain[0]),0);assert.equal(Math.abs(a.rain.at(-1)),0);
});

test('the screech follows the authored braking interval and fades before settling',()=>{
  const at=(elapsed,stage)=>startupVanMix({progress:elapsed/3.4,stage});
  assert.equal(at(.8,'arrival').tyre,0);assert.ok(at(1.11,'brake').tyre>.7);
  assert.equal(at(1.3,'settle').tyre,0);assert.equal(at(3.4,'parked').engine,0);
  assert.ok(at(.7,'arrival').rate>at(1.6,'settle').rate);
});

function fixture(state='running'){
  const nodes=[];
  function param(){return{value:0,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}};}
  function node(){const n={gain:param(),frequency:param(),Q:param(),playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(){this.stopped=true;}};nodes.push(n);return n;}
  const ctx={state,sampleRate:8000,currentTime:0,createGain:node,createBiquadFilter:node,createBufferSource:node,createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)})};
  return{ctx,nodes,destination:{}};
}
test('blocked audio remains silent, later permission joins current motion without replay',()=>{
  const f=fixture('suspended'),audio=createStartupVanAudio({getAudio:()=>f});
  assert.equal(audio.event({type:'start',progress:0,stage:'arrival'}),false);assert.equal(f.nodes.length,0);
  f.ctx.state='running';assert.equal(audio.event({type:'tick',progress:.33,stage:'brake'}),true);
  assert.equal(audio.status().active,true);assert.ok(f.nodes.filter(n=>n.started).every(n=>n.loop));
  audio.event({type:'stop'});assert.ok(f.nodes.every(n=>n.disconnected));
  assert.ok(f.nodes.filter(n=>n.started).every(n=>n.stopped));
  assert.equal(audio.event({type:'resume',progress:.35}),false);
});
test('hidden, Reduced Motion, completion and disposal cancel every source',()=>{
  for(const end of[{type:'pause',hidden:true},{type:'tick',reduced:true},{type:'stop'},null]){
    const f=fixture(),audio=createStartupVanAudio({getAudio:()=>f});
    audio.event({type:'start',progress:.1,stage:'arrival'});
    if(end)audio.event(end);else audio.dispose();
    assert.equal(audio.status().active,false);assert.ok(f.nodes.every(n=>n.disconnected));
    assert.ok(f.nodes.filter(n=>n.started).every(n=>n.stopped));
    audio.dispose();
  }
});
test('audio acquisition errors and a late attachment cannot start a delayed screech',()=>{
  const audio=createStartupVanAudio({getAudio:()=>{throw Error('not allowed');}});
  assert.equal(audio.event({type:'start',progress:.4}),false);
  const f=fixture(),late=createStartupVanAudio({getAudio:()=>f});
  late.event({type:'stop',reason:'attached-after-complete'});
  assert.equal(late.event({type:'start',progress:.3}),false);assert.equal(f.nodes.length,0);
});

const weather={rain:true,thunderAtSeconds:[2.90]};
const tick=(elapsed,extra={})=>({type:'tick',elapsed,duration:3.4,progress:elapsed/3.4,stage:elapsed<.95?'arrival':elapsed<1.27?'brake':'settle',weather,...extra});
function weatherFixture(state='running'){
  const f=fixture(state),voices=[];
  const audio=createStartupVanAudio({getAudio:()=>f,makeThunder:({context,destination})=>{
    const voice={context,destination,strikes:[],stopped:false,strike(event){this.strikes.push(event);return true;},stop(){this.stopped=true;}};
    voices.push(voice);return voice;
  }});
  return{...f,audio,voices};
}
test('startup rain uses the game bus and one delayed distant thunder follows the current visible shot',()=>{
  const f=weatherFixture();assert.equal(f.audio.event(tick(.2,{type:'start'})),true);
  assert.equal(f.audio.status().rain,true);assert.equal(f.nodes.filter(n=>n.started).length,4);
  assert.ok(f.nodes.filter(n=>n.started).every(n=>n.loop));
  assert.equal(f.voices[0].context,f.ctx);assert.notEqual(f.voices[0].destination,f.destination);
  f.audio.event(tick(2.84));assert.equal(f.voices[0].strikes.length,0);
  f.audio.event(tick(2.92));assert.equal(f.voices[0].strikes.length,1);
  const strike=f.voices[0].strikes[0];assert.ok(strike.distance>=1000);assert.ok(strike.energy<.6);
  f.audio.event(tick(2.93));assert.equal(f.voices[0].strikes.length,1);assert.equal(f.audio.status().thunderPlayed,1);
  f.audio.event({type:'stop',reason:'revealed'});assert.equal(f.voices[0].stopped,true);assert.equal(f.audio.status().rain,false);
  assert.ok(f.nodes.every(n=>n.disconnected));assert.ok(f.nodes.filter(n=>n.started).every(n=>n.stopped));
});
test('the authored flash-to-thunder gap also determines its physical channel distance',()=>{
  const f=weatherFixture(),paired={...weather,lightningAtSeconds:[2.42]};
  f.audio.event(tick(2.30,{type:'start',weather:paired}));
  f.audio.event(tick(2.43,{weather:paired}));
  f.audio.event(tick(2.84,{weather:paired}));
  f.audio.event(tick(2.92,{weather:paired}));
  assert.equal(f.voices[0].strikes.length,1);
  assert.ok(Math.abs(f.voices[0].strikes[0].distance-(2.90-2.42)*343)<.000001);
  assert.ok(f.voices[0].strikes[0].energy<.6);
  f.audio.dispose();assert.equal(f.voices[0].stopped,true);
});
test('enabling flashes after a suppressed peak cannot invent a matching thunderclap',()=>{
  const paired={...weather,lightningAtSeconds:[2.42]};
  for(const [before,after]of[[2.30,2.50],[2.35,2.45]]){
    const f=weatherFixture();f.audio.event(tick(before,{type:'start',weather:paired,reduceFlash:true}));
    f.audio.event(tick(after,{weather:paired,reduceFlash:false}));
    f.audio.event(tick(2.84,{weather:paired,reduceFlash:false}));f.audio.event(tick(2.92,{weather:paired,reduceFlash:false}));
    assert.equal(f.voices[0].strikes.length,0);f.audio.dispose();
  }
});
test('a late audio hook cannot claim a paired flash it never observed',()=>{
  const f=weatherFixture(),paired={...weather,lightningAtSeconds:[2.42]};
  f.audio.event(tick(2.50,{type:'start',weather:paired,reduceFlash:false}));
  f.audio.event(tick(2.84,{weather:paired,reduceFlash:false}));f.audio.event(tick(2.92,{weather:paired,reduceFlash:false}));
  assert.equal(f.voices[0].strikes.length,0);f.audio.dispose();
});
test('a seen flash can admit a future clap after permission arrives, without replaying either event',()=>{
  const f=weatherFixture('suspended'),paired={...weather,lightningAtSeconds:[2.42]};
  f.audio.event(tick(2.30,{type:'start',weather:paired,reduceFlash:false}));
  f.audio.event(tick(2.43,{weather:paired,reduceFlash:false}));assert.equal(f.voices.length,0);
  f.ctx.state='running';f.audio.event(tick(2.70,{weather:paired,reduceFlash:false}));
  f.audio.event(tick(2.84,{weather:paired,reduceFlash:false}));assert.equal(f.voices[0].strikes.length,0);
  f.audio.event(tick(2.92,{weather:paired,reduceFlash:false}));assert.equal(f.voices[0].strikes.length,1);
  f.audio.event(tick(2.96,{weather:paired,reduceFlash:false}));assert.equal(f.voices[0].strikes.length,1);
  f.audio.dispose();
});
test('pause, hidden and Reduced Motion clear a seen flash before its clap',()=>{
  const paired={...weather,lightningAtSeconds:[2.42]};
  for(const interruption of[{type:'pause'},{type:'tick',hidden:true},{type:'tick',reduced:true}]){
    const f=weatherFixture();f.audio.event(tick(2.30,{type:'start',weather:paired,reduceFlash:false}));
    f.audio.event(tick(2.43,{weather:paired,reduceFlash:false}));
    f.audio.event(tick(2.50,{weather:paired,...interruption}));
    f.audio.event(tick(2.65,{type:'resume',weather:paired,reduceFlash:false}));
    f.audio.event(tick(2.84,{weather:paired,reduceFlash:false}));f.audio.event(tick(2.92,{weather:paired,reduceFlash:false}));
    assert.equal(f.voices.at(-1).strikes.length,0);assert.equal(f.audio.status().thunderPlayed,0);f.audio.dispose();
  }
});
test('a skipped peak cannot count as a visible flash when the animation catches up',()=>{
  const f=weatherFixture(),paired={...weather,lightningAtSeconds:[2.42]};
  f.audio.event(tick(2.30,{type:'start',weather:paired,reduceFlash:false}));
  f.audio.event(tick(2.65,{weather:paired,reduceFlash:false}));
  f.audio.event(tick(2.84,{weather:paired,reduceFlash:false}));f.audio.event(tick(2.92,{weather:paired,reduceFlash:false}));
  assert.equal(f.voices[0].strikes.length,0);f.audio.dispose();
});
test('late attachment, late permission, missed frames and Reduced Flash cannot replay an absent thunder cue',()=>{
  const late=weatherFixture();late.audio.event(tick(2.96,{type:'start'}));late.audio.event(tick(3.02));
  assert.equal(late.voices[0].strikes.length,0);late.audio.dispose();
  const blocked=weatherFixture('suspended');blocked.audio.event(tick(2.84,{type:'start'}));
  blocked.ctx.state='running';blocked.audio.event(tick(2.92));blocked.audio.event(tick(2.96));
  assert.equal(blocked.voices[0].strikes.length,0);blocked.audio.dispose();
  const resumed=weatherFixture();resumed.audio.event(tick(2.80,{type:'start'}));resumed.ctx.state='suspended';resumed.audio.event(tick(2.84));
  resumed.ctx.state='running';resumed.audio.event(tick(2.92));assert.equal(resumed.voices[0].strikes.length,0);resumed.audio.dispose();
  const stalled=weatherFixture();stalled.audio.event(tick(2.5,{type:'start'}));stalled.audio.event(tick(3.02));
  assert.equal(stalled.voices[0].strikes.length,0);stalled.audio.dispose();
  const noFlash=weatherFixture();noFlash.audio.event(tick(2.84,{type:'start',reduceFlash:true}));noFlash.audio.event(tick(2.92,{reduceFlash:true}));
  assert.equal(noFlash.voices[0].strikes.length,0);assert.equal(noFlash.audio.status().rain,true);noFlash.audio.dispose();
});
test('weather stops without a tail on every interruption and a hidden shot resumes only current rain',()=>{
  for(const end of[{type:'pause',hidden:true},{type:'tick',reduced:true},{type:'stop',reason:'revealed'},{type:'stop',reason:'failed'},{type:'stop',reason:'completed'},null]){
    const f=weatherFixture();f.audio.event(tick(.6,{type:'start'}));if(end)f.audio.event(end);else f.audio.dispose();
    assert.equal(f.audio.status().active,false);assert.equal(f.audio.status().rain,false);assert.equal(f.voices[0].stopped,true);
    assert.ok(f.nodes.every(n=>n.disconnected));assert.ok(f.nodes.filter(n=>n.started).every(n=>n.stopped));f.audio.dispose();
  }
  const f=weatherFixture();f.audio.event(tick(2.84,{type:'start'}));f.audio.event(tick(2.84,{type:'pause',hidden:true}));
  f.audio.event(tick(2.92,{type:'resume'}));assert.equal(f.voices.length,2);assert.equal(f.voices[1].strikes.length,0);
  assert.equal(f.audio.status().rain,true);f.audio.dispose();
});
test('invalid weather times are ignored and storm creation stays bounded',()=>{
  const f=weatherFixture(),bad={rain:true,thunderAtSeconds:[NaN,-1,'2.9',12,Infinity,.5,.5,.6,.7,.8,.9]};
  f.audio.event(tick(.4,{type:'start',weather:bad}));for(const elapsed of[.51,.61,.71,.81,.91])f.audio.event(tick(elapsed,{weather:bad}));
  assert.equal(f.voices[0].strikes.length,4);assert.equal(f.audio.status().thunderPlayed,4);f.audio.dispose();
});
