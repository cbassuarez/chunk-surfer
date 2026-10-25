import test from 'node:test';
import assert from 'node:assert/strict';
import {quantizeStandingTearPCM,createStandingTearProcessedBuffer,createStandingTearImpulse} from '../src/audio/standing-tear-dsp.js';

const context={sampleRate:24000,createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:channel=>data[channel]};}};

test('true bitcrushing produces exactly the requested amplitude alphabet at unchanged sample cadence',()=>{
  const ramp=Float32Array.from({length:65537},(_,index)=>index/32768-1),before=ramp.slice();
  for(const bitDepth of [8,10,12]){
    const {samples,diagnostics:d}=quantizeStandingTearPCM(ramp,{bitDepth,sampleRate:24000,effectiveSampleRate:24000});
    assert.equal(new Set(samples).size,2**bitDepth);assert.equal(d.observedAmplitudeLevels,2**bitDepth);
    assert.equal(samples[0],-1);assert.equal(samples.at(-1),1);assert.equal(samples[32768],0);
    assert.equal(d.sampleHold,false);assert.equal(d.sampleUpdates,ramp.length);
    assert.ok(samples.some((value,index)=>value!==ramp[index]),'unchanged rate still changes amplitudes');
    const maximumError=Math.max(...samples.map((value,index)=>Math.abs(value-ramp[index])));
    assert.ok(maximumError<=d.positiveStep/2+1e-7);
  }
  assert.deepEqual(ramp,before);
});

test('sample holding is separately measured and retains quantised levels rather than replacing bitcrushing',()=>{
  const input=Float32Array.from({length:48000},(_,index)=>Math.sin(index*.241)*.7);
  const result=quantizeStandingTearPCM(input,{bitDepth:8,sampleRate:48000,effectiveSampleRate:20000});
  assert.equal(result.diagnostics.bitDepth,8);assert.equal(result.diagnostics.effectiveSampleRate,20000);
  assert.ok(Math.abs(result.diagnostics.sampleUpdates-20000)<=1);assert.ok(new Set(result.samples).size<=256);
  assert.equal(result.samples[0],result.samples[1]);assert.equal(result.samples[1],result.samples[2]);
});

test('the playback buffer is physically quantised per channel and invalid/clipped PCM cannot escape its bounds',()=>{
  const input=context.createBuffer(2,9,24000);
  input.getChannelData(0).set([-2,-1,-.333,-.001,0,.001,.333,1,2]);
  input.getChannelData(1).set([NaN,Infinity,-Infinity,.123,.234,.345,.456,.567,.678]);
  const {buffer,diagnostics:d}=createStandingTearProcessedBuffer(context,input,{bitDepth:8,effectiveSampleRate:24000});
  assert.notEqual(buffer,input);assert.equal(buffer.numberOfChannels,2);assert.equal(d.channels,2);
  assert.equal(d.channelDiagnostics[0].clippedSamples,2);assert.equal(d.channelDiagnostics[1].invalidSamples,3);
  assert.ok([...buffer.getChannelData(0),...buffer.getChannelData(1)].every(value=>Number.isFinite(value)&&Math.abs(value)<=1));
  assert.notEqual(buffer.getChannelData(0)[2],input.getChannelData(0)[2]);
  assert.equal(input.getChannelData(0)[0],-2);assert.equal(d.processedBeforeSpatialisation,true);
});

test('the long stereo impulse is deterministic, diffuse, energy bounded and has a measured late decay',()=>{
  const a=createStandingTearImpulse(context),b=createStandingTearImpulse(context);
  assert.equal(a.numberOfChannels,2);assert.equal(a.duration,6.8);
  assert.deepEqual(a.getChannelData(0),b.getChannelData(0));assert.notDeepEqual(a.getChannelData(0),a.getChannelData(1));
  for(let channel=0;channel<2;channel++){
    const samples=a.getChannelData(channel),energy=samples.reduce((sum,value)=>sum+value*value,0);
    assert.ok(Math.abs(energy-1)<1e-6);assert.ok(samples.slice(0,Math.floor(.07*a.sampleRate)).every(value=>value===0));
    const power=(start,end)=>samples.slice(start*a.sampleRate,end*a.sampleRate).reduce((sum,value)=>sum+value*value,0)/(end-start);
    assert.ok(power(4,5)>0&&power(4,5)<power(2,3)*.04);assert.ok(power(5,6)<power(4,5));
  }
});
