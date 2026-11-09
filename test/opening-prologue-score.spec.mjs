import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OPENING_PROLOGUE_SCORE as manifest} from '../src/data/opening-prologue-score.js';
import {createOpeningPrologueScore} from '../src/audio/opening-prologue-score.js';

const ids=Object.keys(manifest.phases);
function fixture({fetcher=null,volume=1,contextSampleRate=32000}={}){
  const sources=[],decodes=[],nodes=[],param=value=>({value,events:[],cancelScheduledValues(at){this.events.push(['cancel',at]);},
    setValueAtTime(value,at){this.value=value;this.events.push(['set',value,at]);},
    linearRampToValueAtTime(value,at){this.value=value;this.events.push(['ramp',value,at]);}}),
    node=()=>{const n={connect(){},disconnect(){this.disconnected=true;},gain:param(1)};nodes.push(n);return n;};
  const ctx={state:'running',currentTime:0,sampleRate:contextSampleRate,createGain:node,
    createBufferSource(){const n={...node(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};sources.push(n);return n;},
    async decodeAudioData(bytes){const id=ids[new Uint8Array(bytes)[0]],duration=manifest.phases[id].duration;decodes.push(id);return{duration,sampleRate:contextSampleRate,numberOfChannels:2,length:Math.round(duration*contextSampleRate)};}},
    destination=node();destination.gain.value=volume;
  const fetch=fetcher|| (async url=>({ok:true,arrayBuffer:async()=>new Uint8Array([ids.findIndex(id=>url.endsWith(id+'.mp3'))]).buffer}));
  const score=createOpeningPrologueScore({getAudio:()=>({ctx,destination}),fetcher:fetch,urlFor:x=>x});
  const tick=(seconds,args={})=>{for(let left=seconds;left>.000001;){const dt=Math.min(.1,left);ctx.currentTime+=dt;score.update({dt,...args});left-=dt;}};
  return{score,ctx,sources,decodes,tick};
}

test('silent preparation and sixteen seconds of actual road precede the first finite box statement',async()=>{
  const f=fixture();assert.equal(await f.score.prepare(),true);assert.equal(f.sources.length,0);
  f.score.requestPhase('recognition');f.tick(15.9);assert.equal(f.sources.length,0);
  f.tick(.3);assert.equal(f.score.status().phase,'recognition');assert.equal(f.sources.length,1);
  assert.equal(f.sources[0].loop,false);assert.equal(f.sources[0].starts[0][1],0);f.score.dispose({fade:0});
});

test('a very long optional answer becomes an explicit quiet hold, never a restarted familiar loop',async()=>{
  const f=fixture();await f.score.prepare();f.score.requestPhase('recognition');f.tick(700);
  assert.equal(f.sources.length,1);assert.equal(f.score.status().holding,true);assert.equal(f.score.status().playing,false);
  f.score.requestPhase('ellery');f.tick(.2);assert.equal(f.score.status().phase,'ellery');assert.equal(f.sources.length,2);
  assert.equal(f.sources[1].starts[0][1],0,'the music starts with the semantic section, not old film time');f.score.dispose({fade:0});
});

test('a semantic request has a bounded release instead of waiting through the whole box excerpt',async()=>{
  const f=fixture();await f.score.prepare();f.score.requestPhase('recognition');f.tick(20);
  const requestedAt=f.ctx.currentTime;f.score.requestPhase('ellery');f.tick(.1);
  assert.equal(f.score.status().transitioning,true);f.tick(2.5);
  assert.equal(f.score.status().phase,'ellery');assert.ok(f.sources[1].starts[0][0]-requestedAt<=2.6);
  assert.ok(f.score.status().positionSeconds<3);f.score.dispose({fade:0});
});

test('phase progression is semantic and monotonic; repeated requests cannot stack performances',async()=>{
  const f=fixture();await f.score.prepare();
  for(const phase of ['recognition','ellery','personal','return']){
    assert.equal(f.score.requestPhase(phase),true);f.tick(phase==='recognition'?18:3);
    assert.equal(f.score.status().phase,phase);const count=f.sources.length;
    for(let k=0;k<10;k++)f.score.requestPhase(phase);f.tick(.2);assert.equal(f.sources.length,count);
  }
  assert.equal(f.score.requestPhase('ellery'),false);assert.equal(f.score.requestPhase('nonsense'),false);
  assert.deepEqual(f.score.status().history.filter(x=>x.type==='phase').map(x=>x.phase),['recognition','ellery','personal','return']);f.score.dispose({fade:0});
});

test('focus/presentation/recording holds preserve the exact source position and pending release',async()=>{
  const f=fixture();await f.score.prepare();f.score.requestPhase('recognition');f.tick(20);
  const pos=f.score.status().positionSeconds;f.score.update({dt:0,paused:true});f.ctx.currentTime+=200;
  f.score.update({dt:.1,paused:true});assert.equal(f.score.status().positionSeconds,pos);
  assert.equal(f.score.status().playing,false);f.score.update({dt:0});
  assert.equal(f.sources.at(-1).starts[0][1],pos);
  f.score.requestPhase('ellery');f.tick(.1);const remaining=f.score.status().release.secondsRemaining;
  f.score.update({dt:0,protectedAudio:true});f.ctx.currentTime+=20;f.score.update({dt:0,ready:false});
  assert.equal(f.score.status().release.secondsRemaining,remaining);f.score.update({dt:0});f.tick(remaining+.2);
  assert.equal(f.score.status().phase,'ellery');f.score.dispose({fade:0});
});

test('music volume zero does not freeze the conductor or require an audible acknowledgement',async()=>{
  const f=fixture({volume:0});await f.score.prepare();f.score.requestPhase('recognition');f.tick(20);
  f.score.requestPhase('return');f.tick(3);assert.equal(f.score.status().phase,'return');
  assert.equal(f.score.status().held,false);f.score.dispose({fade:0});
});

test('failed assets settle with an explicit error and cannot deadlock later available sections',async()=>{
  const f=fixture({fetcher:async url=>({ok:!url.endsWith('recognition.mp3'),status:404,
    arrayBuffer:async()=>new Uint8Array([ids.findIndex(id=>url.endsWith(id+'.mp3'))]).buffer})});
  assert.equal(await f.score.prepare(),false);assert.equal(f.score.status().settled,true);assert.match(f.score.status().error,/recognition/);
  f.score.requestPhase('recognition');f.tick(18);assert.equal(f.score.status().holding,true);
  f.score.requestPhase('ellery');f.tick(.1);assert.equal(f.score.status().playing,true);f.score.dispose({fade:0});
});

test('disposal cancels late loads before decoding or starting sound in a later scene',async()=>{
  const requests=[],f=fixture({fetcher:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
  const loading=f.score.prepare();assert.equal(requests.length,4);f.score.dispose({fade:0});
  for(const [i,request]of requests.entries()){assert.equal(request.options.signal.aborted,true);request.resolve({ok:true,arrayBuffer:async()=>new Uint8Array([i]).buffer});}
  assert.equal(await loading,false);assert.equal(f.decodes.length,0);assert.equal(f.sources.length,0);
  assert.equal(f.score.status().loading,false);assert.equal(f.score.requestPhase('return'),false);
});

test('delivered phase sources are hashed, finite, bounded assets with disclosed unauditioned exits',()=>{
  let bytes=0,deliveryRatePcmEstimate=0;
  for(const [phase,row]of Object.entries(manifest.phases)){
    const audio=readFileSync(new URL('../public/'+row.asset,import.meta.url));bytes+=audio.length;
    assert.equal(createHash('sha256').update(audio).digest('hex'),row.deliveredSha256,phase);
    assert.ok(row.source.sha256.length===64&&row.source.outSeconds>row.source.inSeconds);
    assert.ok(row.exitCandidates.every(mark=>mark.at>0&&mark.at<row.duration));
    deliveryRatePcmEstimate+=row.duration*manifest.sampleRate*manifest.channels*4;
  }
  assert.ok(bytes<4*1024*1024);
  assert.ok(deliveryRatePcmEstimate<64*1024*1024,'32kHz delivery estimate only; not an AudioContext runtime-memory budget');
  assert.match(manifest.editorialNote,/not musician-approved/);
  assert.match(manifest.phases.recognition.source.note,/not a certified cylinder cycle/);
});

test('runtime sample storage reports decoded context-rate buffers rather than the lower delivery-rate estimate',async()=>{
  for(const [sampleRate,expected]of [[44100,76063680],[48000,82790400]]){
    const f=fixture({contextSampleRate:sampleRate});await f.score.prepare();
    assert.equal(f.score.status().decodedBytes,expected);
    assert.ok(f.score.status().decodedBytes>64*1024*1024,'all four context-resampled buffers exceed 64MiB; delivery bitrate cannot prove otherwise');
    f.score.dispose({fade:0});
  }
});
