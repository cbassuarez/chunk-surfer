import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlayerConditionAudio, playerConditionAudioPlan, playerConditionWorldGain, playerConditionEffortCalibration,
  PLAYER_CONDITION_EFFORT} from '../src/audio/player-condition.js';

const condition = {available:true,owner:'world',value:20,ceiling:35,injuries:1};
const neutral = {condition,serial:0,event:null,impactAge:null};
const hit = (serial=1, extra={}) => ({condition,serial,event:{kind:'damage',serial,damage:15,injuriesAdded:0},
  impactAge:0,force:.72,...extra});

function rig() {
  const nodes = [], params = [];
  function param() {
    const p={value:1,calls:[],cancelScheduledValues:at=>p.calls.push(['cancel',at]),
      setValueAtTime:(value,at)=>p.calls.push(['set',value,at]),
      linearRampToValueAtTime:(value,at)=>p.calls.push(['ramp',value,at])};
    params.push(p);return p;
  }
  function node(kind) {
    const n={kind,connections:[],disconnected:false,connect:to=>n.connections.push(to),
      disconnect:()=>{n.disconnected=true;}};
    if (kind==='gain') n.gain=param();
    if (kind==='source') Object.assign(n,{playbackRate:{value:1},starts:[],stops:[],
      start:(...args)=>n.starts.push(args),stop:(...args)=>n.stops.push(args)});
    nodes.push(n);return n;
  }
  const ctx={state:'running',currentTime:10,createGain:()=>node('gain'),createBufferSource:()=>node('source')};
  const pair={ctx,bodyDestination:{id:'body'},worldDestination:{id:'world'}};
  return {ctx,pair,nodes,params};
}

test('the cue separates real harm from recovery and scales its bounded world dip', () => {
  const small=playerConditionAudioPlan(hit(1,{force:.3})),large=playerConditionAudioPlan(hit(1,{force:1}));
  assert.ok(small.worldFloor>large.worldFloor);
  assert.equal(large.worldFloor,.6);assert.equal(large.duration,.65);assert.equal(large.rate,1);
  assert.equal(playerConditionAudioPlan(hit(1,{force:1}),{softened:true}).worldFloor,.8);
  assert.equal(playerConditionAudioPlan({...neutral,event:{kind:'recovery',recovery:5}}).allowed,false);
  const injury=playerConditionAudioPlan({...hit(),force:undefined,event:{kind:'injury',injuriesAdded:1,damage:0}});
  assert.equal(injury.allowed,true);assert.equal(injury.force,.85);
  for(const age of [0,.04,.085,.18,.4,.65,2]) {
    const gain=playerConditionWorldGain(large,age);assert.ok(gain>=.6&&gain<=1);
  }
  assert.equal(playerConditionWorldGain(large,.65),1);
});

test('prepare creates the stable world graph immediately and the recorded effort decodes independently', async () => {
  const r=rig();let loads=0;
  const audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>{loads++;return{duration:.63};}});
  const pending=audio.prepare(),input=audio.worldInput;
  assert.ok(input);assert.deepEqual(input.connections,[r.pair.worldDestination]);
  assert.equal(input.gain.value,1);assert.equal(await pending,true);
  await audio.prepare();assert.equal(audio.worldInput,input);assert.equal(loads,1);
  assert.equal(audio.snapshot().ready,true);assert.equal(audio.snapshot().eventsPlayed,0);
});

test('one real hit plays once through the body bus at natural pitch and the world returns to unity', async () => {
  const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>({duration:.63})});
  await audio.prepare();audio.update(neutral);audio.update(hit());
  const sources=r.nodes.filter(n=>n.kind==='source');assert.equal(sources.length,1);
  assert.equal(sources[0].playbackRate.value,1);assert.deepEqual(sources[0].starts,[[10,0,.63]]);
  assert.deepEqual(sources[0].connections[0].connections,[r.pair.bodyDestination]);
  assert.ok(audio.worldInput.gain.calls.some(c=>c[0]==='ramp'&&c[1]===1&&c[2]===10.65));
  audio.update(hit());audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,1);
  r.ctx.currentTime=11;audio.update(hit());assert.equal(audio.snapshot().active,false);
  assert.equal(audio.snapshot().worldGain,1);
});

test('pause and native inactivity consume rather than queue an event', async () => {
  for(const reason of [{active:false},{suppressed:true},{presented:false}]) {
    const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>({duration:.63})});
    await audio.prepare();audio.update(neutral);audio.update(hit(),reason);audio.update(hit());
    assert.equal(audio.snapshot().eventsPlayed,0);assert.equal(audio.snapshot().worldNarrowings,0);
    audio.update(hit(2));assert.equal(audio.snapshot().eventsPlayed,1);
    audio.update(hit(2),reason);assert.equal(audio.snapshot().active,false);
    assert.ok(r.nodes.find(n=>n.kind==='source').stops.length>=2);
    audio.update(hit(2));assert.equal(audio.snapshot().eventsPlayed,1);
  }
});

test('saved facts, a different presenter and a late event cannot manufacture a new reaction', async () => {
  const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>({duration:.63})});
  await audio.prepare();audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,0);
  audio.update(hit(2,{impactAge:.13}));assert.equal(audio.snapshot().eventsPlayed,0);
  audio.update(hit(3,{condition:{...condition,owner:'battle:2'}}));
  assert.equal(audio.snapshot().eventsPlayed,0);
  audio.update(hit(4,{condition:{...condition,owner:'battle:2'},impactAge:.01}));
  assert.equal(audio.snapshot().eventsPlayed,1);
});

test('a slow sample load never plays a stale vocal response after it finishes', async () => {
  const r=rig();let done;
  const audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:()=>new Promise(resolve=>{done=resolve;})});
  const pending=audio.prepare();await Promise.resolve();audio.update(neutral);audio.update(hit());
  assert.equal(audio.snapshot().worldNarrowings,1);assert.equal(audio.snapshot().eventsPlayed,0);
  done({duration:.63});await pending;audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,0);
  audio.update(hit(2));assert.equal(audio.snapshot().eventsPlayed,1);
});

test('context suspension cancels a current cue and resuming cannot replay it', async () => {
  const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>({duration:.63})});
  await audio.prepare();audio.update(neutral);audio.update(hit());
  r.ctx.state='suspended';audio.update(hit());assert.equal(audio.snapshot().active,false);
  r.ctx.state='running';audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,1);
  assert.ok(audio.worldInput.gain.calls.some(c=>c[0]==='ramp'&&c[1]===1&&c[2]===10.02));
});

test('a replaced context cancels old voices and pending decode work cannot resurrect them', async () => {
  const old=rig(),next=rig();let pair=old.pair,resolveOld;
  const audio=createPlayerConditionAudio({getAudio:()=>pair,loadBuffer:ctx=>ctx===old.ctx
    ?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({duration:.63})});
  const first=audio.prepare();await Promise.resolve();const oldInput=audio.worldInput;
  pair=next.pair;const second=audio.prepare();assert.notEqual(audio.worldInput,oldInput);
  assert.equal(oldInput.disconnected,true);resolveOld({duration:.63});await first;await second;
  audio.update(neutral);audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,1);
  assert.equal(old.nodes.filter(n=>n.kind==='source').length,0);
  audio.dispose();assert.equal(audio.worldInput,null);assert.equal(await audio.prepare(),false);
});

test('successive hits begin from the current world envelope without a unity discontinuity', async () => {
  const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>({duration:.63})});
  await audio.prepare();audio.update(neutral);audio.update(hit());
  r.ctx.currentTime=10.10;const before=audio.snapshot().worldGain;audio.update(hit(2));
  const sets=audio.worldInput.gain.calls.filter(c=>c[0]==='set'&&c[2]===10.10);
  assert.equal(sets.at(-1)[1],before);assert.equal(audio.snapshot().eventsPlayed,2);
});

test('existing recorded human effort retains its verified source and the module cannot write game state', () => {
  const credits=JSON.parse(readFileSync(new URL('../public/assets/audio/outskirts/fold-credits.json',import.meta.url),'utf8'));
  const clip=credits.clips.find(row=>row.id==='fold-catch'),source=credits.sources.find(row=>row.file===clip.source);
  assert.equal(source.license,'CC0-1.0');assert.equal(source.source,PLAYER_CONDITION_EFFORT.source);
  const bytes=readFileSync(new URL('../public/'+PLAYER_CONDITION_EFFORT.url,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),clip.sha256);
  const code=readFileSync(new URL('../src/audio/player-condition.js',import.meta.url),'utf8');
  assert.doesNotMatch(code,/emitNoise|spoilTake|\.injure\(|setComposure|setLook|requestPointerLock/);
});

function recordedEffortBuffer() {
  const bytes=readFileSync(new URL('../public/'+PLAYER_CONDITION_EFFORT.url,import.meta.url));
  let format=null,data=null;
  for(let at=12;at+8<=bytes.length;) {
    const id=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),from=at+8;
    if(id==='fmt ') format={type:bytes.readUInt16LE(from),channels:bytes.readUInt16LE(from+2),
      sampleRate:bytes.readUInt32LE(from+4),bits:bytes.readUInt16LE(from+14)};
    if(id==='data') data=bytes.subarray(from,from+size);
    at=from+size+(size%2);
  }
  assert.deepEqual(format,{type:1,channels:1,sampleRate:32000,bits:16});assert.ok(data);
  const pcm=new Float32Array(data.length/2);
  for(let n=0;n<pcm.length;n++)pcm[n]=data.readInt16LE(n*2)/32768;
  return {numberOfChannels:1,duration:pcm.length/format.sampleRate,getChannelData:()=>pcm};
}

test('the actual recorded effort is calibrated to useful body level with bounded sample peaks', async () => {
  const source=recordedEffortBuffer(),level=playerConditionEffortCalibration(source);
  assert.equal(level.measured,true);assert.equal(level.valid,true);
  assert.ok(level.gain>3.7&&level.gain<3.9);
  assert.ok(level.normalizedPeak<=.9000001);assert.ok(level.normalizedRms>.10&&level.normalizedRms<=.14);
  const force=.18+.82*Math.sqrt(15/40),r=rig();
  const audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>source});
  await audio.prepare();audio.update(neutral);audio.update(hit(1,{force}));
  const actual=audio.snapshot();
  assert.equal(actual.calibration.gain,level.gain);assert.ok(actual.lastVoiceRms>.047&&actual.lastVoiceRms<.051);
  assert.ok(actual.lastVoicePeak<.40);
  const amp=r.nodes.find(n=>n.kind==='source').connections[0];
  assert.ok(amp.gain.calls.some(c=>c[0]==='ramp'&&Math.abs(c[1]-actual.lastVoiceGain)<1e-8));
  assert.equal(r.nodes.find(n=>n.kind==='source').playbackRate.value,1);
});

test('calibration never amplifies silence, rejects invalid PCM and keeps test doubles at unity', async () => {
  assert.equal(playerConditionEffortCalibration({duration:.63}).gain,1);
  assert.equal(playerConditionEffortCalibration({numberOfChannels:1,getChannelData:()=>new Float32Array(40)}).gain,1);
  const tiny=playerConditionEffortCalibration({numberOfChannels:1,getChannelData:()=>new Float32Array([.0001,-.0001])});
  assert.equal(tiny.gain,6);
  const invalid={duration:.63,numberOfChannels:1,getChannelData:()=>new Float32Array([0,NaN])};
  const r=rig(),audio=createPlayerConditionAudio({getAudio:()=>r.pair,loadBuffer:async()=>invalid});
  assert.equal(await audio.prepare(),false);assert.equal(audio.snapshot().ready,false);
  assert.match(audio.snapshot().error,/invalid samples/);
  audio.update(neutral);audio.update(hit());assert.equal(audio.snapshot().eventsPlayed,0);
});
