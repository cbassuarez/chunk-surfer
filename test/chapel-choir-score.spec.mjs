import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPEL_CHOIR_CONTROL_HZ, createChapelChoirScore, controlAt,
  pulsePhaseAt, segmentAt, segmentLabel, renderGainChannels } from '../src/audio/chapel-choir-score.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const flatScore = ({ duration = 2, rate = 2, width = .5, depth = 1, phaseOffsets = [0], edgeSeconds = .001 } = {}) => createChapelChoirScore({duration,phaseOffsets,edgeSeconds,
  stages:[{label:'test pulse',rateHz:rate,width,depth}]});

test('passage duration scales stage lengths while the authored rate, width and recovery remain explicit',()=>{
  const score=createChapelChoirScore({duration:60});
  assert.deepEqual(score.stages.map(s=>[s.label,s.start,s.end]),[['natural',0,10],['pulse',10,30],['amplification',30,50],['recovery',50,60]]);
  assert.deepEqual(score.stages.map(s=>s.rateHz),[[2,2],[2,12],[12,140],[140,140]]);
  assert.equal(controlAt(0,0,score),1);assert.equal(controlAt(5,5,score),1);assert.equal(controlAt(60,0,score),1);
  assert.ok(controlAt(59.99,0,score)>.999,'recovery approaches unity before the endpoint');
  assert.equal(controlAt(-3,0,score),1);assert.equal(controlAt(63,0,score),1);
  assert.ok(Object.isFrozen(score)&&Object.isFrozen(score.stages)&&Object.isFrozen(score.phaseOffsets));
});

test('pulse phase is the analytic frequency integral, not a frame-dependent incremental oscillator',()=>{
  const score=createChapelChoirScore({duration:6,phaseOffsets:[0,.25],stages:[
    {label:'rise',weight:1,rateHz:[2,12],width:.5,depth:0},
    {label:'silent score rest',weight:1,rest:true,rateHz:[12,140],width:.5,depth:0},
    {label:'tail',weight:1,rateHz:140,width:.5,depth:0},
  ]});
  close(pulsePhaseAt(1,0,score),4.5);close(pulsePhaseAt(2,0,score),14);
  close(pulsePhaseAt(3,0,score),58);close(pulsePhaseAt(4,0,score),166);
  close(pulsePhaseAt(6,0,score),446);close(pulsePhaseAt(4,1,score),166.25);
  for(const t of[0,1.999999999,2,2.000000001,3,4,5.7])assert.equal(controlAt(t,0,score),1,'rests preserve phase without adding gain modulation');
  const shuffled=[5.7,1,3,2,.01,4,0,6];const expected=shuffled.map(t=>pulsePhaseAt(t,1,score));
  for(let i=shuffled.length-1;i>=0;i--)assert.equal(pulsePhaseAt(shuffled[i],1,score),expected[i],'query order cannot change the clock');
});

test('width controls duty and depth controls only the gain floor, including limiting cases',()=>{
  const half=flatScore(),narrow=flatScore({width:.2}),shallow=flatScore({depth:.4});
  assert.equal(controlAt(.05,0,half),1);assert.equal(controlAt(.3,0,half),0);
  assert.equal(controlAt(.15,0,narrow),0);assert.equal(controlAt(.05,0,narrow),1);
  close(controlAt(.3,0,shallow),.6);
  for(const width of[0,1]){const s=flatScore({width});for(const t of[.01,.15,.5,.81,1.9])assert.equal(controlAt(t,0,s),width);}
  const dry=flatScore({depth:0});for(let i=0;i<100;i++)assert.equal(controlAt(i/50,0,dry),1);
});

test('1ms raised-cosine pulse edges have the expected midpoint and meet both plateaux without a step',()=>{
  const score=flatScore({rate:2,width:.5});
  close(controlAt(.5005,0,score),.5,1e-9);
  close(controlAt(.7495,0,score),.5,1e-9);
  assert.equal(controlAt(.501,0,score),1);assert.equal(controlAt(.749,0,score),1);
  assert.equal(controlAt(.5,0,score),0);assert.equal(controlAt(.75,0,score),0);
  for(const boundary of[.5,.501,.749,.75])close(controlAt(boundary-1e-9,0,score),controlAt(boundary+1e-9,0,score),1e-8);
});

test('short high-rate pulses shorten edges safely instead of exceeding unity or becoming discontinuous',()=>{
  const score=flatScore({rate:140,width:.05});
  const center=10/140+.05/(2*140);close(controlAt(center,0,score),1,1e-9);
  for(const t of[10/140,10.05/140])close(controlAt(t-1e-10,0,score),controlAt(t+1e-10,0,score),1e-8);
  const {channels}=renderGainChannels(score,{voices:1});assert.ok(channels[0].every(n=>Number.isFinite(n)&&n>=0&&n<=1));
});

test('voice phase offsets change projection timing without changing the shared passage clock',()=>{
  const score=flatScore({phaseOffsets:[0,.5]});
  assert.equal(controlAt(.1,0,score),1);assert.equal(controlAt(.1,1,score),0);
  assert.equal(controlAt(.35,0,score),0);assert.equal(controlAt(.35,1,score),1);
  for(const t of[.01,.4,.9,1.6])close(pulsePhaseAt(t,1,score)-pulsePhaseAt(t,0,score),.5);
});

test('gain is continuous across authored stage boundaries and has unity entry/recovery for looping',()=>{
  const score=createChapelChoirScore({duration:1.137});
  for(let voice=0;voice<6;voice++)for(const boundary of[0,...score.stages.map(s=>s.end)]){
    close(controlAt(boundary-1e-10,voice,score),controlAt(boundary+1e-10,voice,score),1e-5);
  }
  const custom=flatScore({duration:1.137,phaseOffsets:[.77],width:0,depth:1});
  close(controlAt(.0005,0,custom),.5);close(controlAt(custom.duration-.0005,0,custom),.5);
  assert.equal(controlAt(0,0,custom),1);assert.equal(controlAt(custom.duration,0,custom),1);
});

test('12kHz rendering produces six independent bounded Float32 control buffers including a unity endpoint',()=>{
  const score=createChapelChoirScore({duration:1.13703});const out=renderGainChannels(score,{voices:6});
  assert.equal(out.sampleRate,CHAPEL_CHOIR_CONTROL_HZ);assert.equal(out.length,Math.ceil(score.duration*12000)+1);
  assert.equal(out.loopEnd,score.duration);assert.ok(out.bufferDuration>out.duration);
  assert.equal(out.channels.length,6);assert.equal(new Set(out.channels).size,6);
  for(let voice=0;voice<6;voice++){
    const a=out.channels[voice];assert.ok(a instanceof Float32Array);assert.equal(a.length,out.length);assert.equal(a[0],1);assert.equal(a.at(-1),1);
    assert.ok(a.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
    for(const frame of[17,2401,6103,out.length-2])close(a[frame],controlAt(frame/out.sampleRate,voice,score),6e-8);
  }
  assert.ok(out.channels[0].some((n,i)=>Math.abs(n-out.channels[1][i])>.2),'channels are not a duplicated envelope');
});

test('absolute-index block rendering exactly reconstructs a whole score, independent of block order',()=>{
  const score=createChapelChoirScore({duration:.71309,phaseOffsets:[0,.31]});const whole=renderGainChannels(score,{voices:2});
  const blocks=[{startFrame:4001,frameCount:whole.length-4001},{startFrame:0,frameCount:1001},{startFrame:1001,frameCount:3000}];
  const rebuilt=Array.from({length:2},()=>new Float32Array(whole.length));
  for(const block of blocks){const out=renderGainChannels(score,{voices:2,...block});for(let v=0;v<2;v++)rebuilt[v].set(out.channels[v],block.startFrame);}
  assert.deepEqual(rebuilt,whole.channels);
});

test('labels describe configured complete-passage sections and a one-channel technical prototype is supported',()=>{
  const score=createChapelChoirScore({duration:8,phaseOffsets:[.2],stages:[
    {label:'unprocessed passage',weight:3,rateHz:2,width:.5,depth:0},
    {label:'score rest',weight:1,rest:true,rateHz:[2,12],width:.5,depth:0},
  ]});
  assert.equal(segmentLabel(-1,score),null);assert.equal(segmentLabel(2,score),'unprocessed passage');
  assert.equal(segmentAt(6,score).rest,true);assert.equal(segmentLabel(8,score),'score rest');assert.equal(segmentLabel(9,score),null);
  const out=renderGainChannels(score,{voices:1,controlHz:12000});assert.equal(out.channels.length,1);assert.ok(out.channels[0].every(x=>x===1));
});

test('malformed authoring data cannot silently produce invalid control audio',()=>{
  for(const duration of[0,-1,NaN,Infinity])assert.throws(()=>createChapelChoirScore({duration}));
  for(const phaseOffsets of[[],Array(7).fill(0),[NaN]])assert.throws(()=>createChapelChoirScore({duration:1,phaseOffsets}));
  for(const row of[{label:'x',rateHz:-1},{label:'x',width:1.1},{label:'x',depth:-.01},{label:'x',weight:0},{label:'x',rateHz:[2]}])assert.throws(()=>createChapelChoirScore({duration:1,stages:[row]}));
  assert.throws(()=>createChapelChoirScore({duration:1,stages:[{label:'a',width:.5,depth:1},{label:'b',rest:true,width:.5}]}),/fade into and out of rests/);
  const score=createChapelChoirScore({duration:1});for(const voice of[-1,6,.5])assert.throws(()=>controlAt(.1,voice,score));
  for(const t of[NaN,Infinity])assert.throws(()=>controlAt(t,0,score));
  for(const config of[{voices:0},{voices:7},{controlHz:0},{controlHz:1.5},{startFrame:-1},{frameCount:-1}])assert.throws(()=>renderGainChannels(score,config));
});
