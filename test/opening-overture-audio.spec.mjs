import test from 'node:test';
import assert from 'node:assert/strict';
import {OPENING_OVERTURE} from '../src/data/opening-overture.js';

let serial=0;
const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
async function fixture(run){
  const priorFetch=globalThis.fetch,priorWindow=globalThis.window,requests=[],sources=[];
  globalThis.fetch=url=>new Promise(resolve=>requests.push({url,resolve}));globalThis.window={setTimeout:()=>0};
  const node=()=>({connect(){},disconnect(){this.disconnected=true;}}),ctx={state:'running',currentTime:10,
    createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),frequency:param(),Q:param()}),
    createBufferSource(){const source={...node(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};sources.push(source);return source;},
    decodeAudioData:async()=>({duration:104,numberOfChannels:2,sampleRate:44100})};
  const audio=await import('../src/audio/story-audio.js?overture-test='+ ++serial);audio.storyAudioInit(ctx,node());
  async function load(){const request=requests.find(row=>row.url===audio.STORY_AUDIO.title);assert.ok(request);request.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await audio.preload(audio.STORY_AUDIO.title);await Promise.resolve();}
  try{await run({audio,ctx,sources,requests,load});}finally{audio.stopOpeningOvertureScore({fade:0});audio.stopAll();globalThis.fetch=priorFetch;if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow;}
}

test('silent preparation then the first presented pub frame starts the title transport exactly once',async()=>fixture(async f=>{
  const preparing=f.audio.prepareOpeningOvertureScore();assert.equal(f.sources.length,0);await f.load();assert.equal(await preparing,true);assert.equal(f.sources.length,0);
  f.ctx.currentTime=12;let state=f.audio.startOpeningOvertureScore();assert.equal(state.playing,true);assert.equal(state.positionSeconds,0);assert.deepEqual(f.sources[0].starts,[[12,2.32]]);
  f.ctx.currentTime=20;f.audio.startOpeningOvertureScore();f.audio.startSoundtrack();f.audio.startOpeningSceneBed();assert.equal(f.audio.commitOpeningSceneBedToColdOpenTitle().reason,'overture-continuing');assert.equal(f.sources.length,1,'montage cuts, arrival and guard cannot restart or overlay the continuing title');assert.equal(f.audio.openingOvertureScoreState().positionSeconds,8);
  f.ctx.currentTime=12+OPENING_OVERTURE.duration+3;f.audio.startSoundtrack();f.audio.startOpeningSceneBed();assert.equal(f.sources.length,1,'the final camera handback must not restart or truncate the title transport');assert.equal(f.audio.openingOvertureScoreState().playing,true);assert.equal(f.audio.openingOvertureScoreState().positionSeconds,OPENING_OVERTURE.duration+3);
}));

test('opening score pause preserves its offset while shared audio time advances, then resumes once',async()=>fixture(async f=>{
  const ready=f.audio.prepareOpeningOvertureScore();await f.load();await ready;f.audio.startOpeningOvertureScore();f.ctx.currentTime=23.5;
  assert.equal(f.audio.pauseOpeningOvertureScore().positionSeconds,13.5);assert.ok(f.sources[0].stops.length);f.ctx.currentTime=95;f.audio.startSoundtrack();assert.equal(f.sources.length,1,'a guard enter request cannot unpause the owner');assert.equal(f.audio.openingOvertureScoreState().positionSeconds,13.5);
  f.audio.resumeOpeningOvertureScore();assert.equal(f.sources.length,2);assert.deepEqual(f.sources[1].starts,[[95,15.82]]);f.audio.resumeOpeningOvertureScore();assert.equal(f.sources.length,2);
  f.ctx.currentTime=96;assert.equal(f.audio.openingOvertureScoreState().positionSeconds,14.5);
}));

test('stopping or replacing a pending overture prevents a late decode from entering another scene',async()=>{
  for(const stop of [f=>f.audio.stopOpeningOvertureScore({fade:0}),f=>f.audio.stopAll(),f=>f.audio.fadeSoundtrack({fade:0})])await fixture(async f=>{
    assert.equal(f.audio.startOpeningOvertureScore().pending,true);stop(f);await f.load();assert.equal(f.sources.length,0);assert.equal(f.audio.openingOvertureScoreState().active,false);
  });
});

test('pause during a pending decode stays silent until explicit resume',async()=>fixture(async f=>{
  f.audio.startOpeningOvertureScore();f.audio.pauseOpeningOvertureScore();await f.load();assert.equal(f.sources.length,0);assert.equal(f.audio.openingOvertureScoreState().paused,true);f.audio.resumeOpeningOvertureScore();assert.equal(f.sources.length,1);assert.equal(f.sources[0].starts[0][1],2.32);
}));

test('ordinary deferred soundtrack starts also obey stopAll cancellation',async()=>fixture(async f=>{
  f.audio.startSoundtrack();f.audio.stopAll();await f.load();assert.equal(f.sources.length,0);
}));

test('release credits use one finite performance while the ordinary title retains its loop',async()=>fixture(async f=>{
  const loaded=f.audio.preload(f.audio.STORY_AUDIO.credits);
  f.requests.find(row=>row.url===f.audio.STORY_AUDIO.credits).resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  await loaded;
  const credits=f.audio.startSoundtrack({track:'credits',fade:0});
  assert.equal(credits.src.loop,false);
  assert.equal(f.audio.startSoundtrack({track:'credits'}),credits,'reading controls cannot stack a second performance');
  credits.src.onended();
  assert.equal(credits.src.disconnected,true);
  const title=f.audio.preload(f.audio.STORY_AUDIO.title);await f.load();await title;
  const ordinary=f.audio.startSoundtrack({track:'title',fade:0});
  assert.equal(ordinary.src.loop,true);
  assert.notEqual(ordinary.src,credits.src);
}));

test('a reloaded montage begins at its saved elapsed offset and cannot overwrite a paused owned position',async()=>fixture(async f=>{
  const preparing=f.audio.prepareOpeningOvertureScore();await f.load();await preparing;f.audio.startOpeningOvertureScore({offset:31.25});assert.equal(f.sources[0].starts[0][1],33.57);
  f.ctx.currentTime=12;f.audio.pauseOpeningOvertureScore();f.audio.startOpeningOvertureScore({offset:0});assert.equal(f.audio.openingOvertureScoreState().positionSeconds,33.25);assert.equal(f.audio.openingOvertureScoreState().paused,true);f.audio.resumeOpeningOvertureScore();assert.equal(f.sources[1].starts[0][1],35.57);
}));

test('suspended context readiness settles false without loading, playing or blocking the host',async()=>fixture(async f=>{
  f.ctx.state='suspended';assert.equal(await f.audio.prepareOpeningOvertureScore(),false);assert.equal(f.requests.length,0);assert.equal(f.sources.length,0);assert.equal(f.audio.openingOvertureScoreState().ready,false);assert.match(f.audio.openingOvertureScoreState().error,/not running/);
}));

test('a missing title asset settles readiness false and records the failure without an automatic retry loop',async()=>fixture(async f=>{
  const preparing=f.audio.prepareOpeningOvertureScore();f.requests[0].resolve({ok:false,status:404});assert.equal(await preparing,false);assert.equal(f.sources.length,0);assert.equal(f.requests.length,1);assert.match(f.audio.openingOvertureScoreState().error,/unavailable/);assert.match(f.audio.openingOvertureScoreState().provenance,/title_song/);
}));

test('the accepted door replaces the loop with the source recording final bar and natural tail exactly once',async()=>fixture(async f=>{
  const preparing=f.audio.prepareOpeningOvertureScore();await f.load();await preparing;
  f.audio.startOpeningOvertureScore();const loop=f.sources[0];
  f.ctx.currentTime=21;
  const state=f.audio.commitOpeningOvertureToTag(),tag=f.sources.at(-1);
  assert.equal(loop.loop,true);assert.ok(loop.stops[0][0]>21&&loop.stops[0][0]<21.1);
  assert.equal(tag.loop,false);assert.deepEqual(tag.starts,[[21,95.98,104-95.98]]);
  assert.equal(state.active,true);assert.equal(state.positionSeconds,0);
  f.ctx.currentTime=23.85;assert.ok(Math.abs(f.audio.openingThresholdTagState().positionSeconds-2.85)<1e-9);
  f.audio.commitOpeningOvertureToTag();f.audio.startSoundtrack();f.audio.startOpeningSceneBed();
  assert.equal(f.audio.commitOpeningSceneBedToColdOpenTitle().reason,'door-cadence-committed');
  assert.equal(f.sources.length,2,'same door and room callbacks cannot start another tag, opening bed or looping title');
  tag.onended();assert.equal(f.audio.openingThresholdTagState().active,false);
}));

test('door cadence pause and resume preserve source position and ignore an old retired onended',async()=>fixture(async f=>{
  const preparing=f.audio.prepareOpeningOvertureScore();await f.load();await preparing;
  f.audio.commitOpeningOvertureToTag();const first=f.sources.at(-1);f.ctx.currentTime=12;
  f.audio.pauseOpeningOvertureScore();assert.equal(f.audio.openingThresholdTagState().positionSeconds,2);
  f.ctx.currentTime=50;f.audio.resumeOpeningOvertureScore();const second=f.sources.at(-1);
  assert.notEqual(first,second);assert.equal(second.starts[0][1],97.98);
  first.onended();assert.equal(f.audio.openingThresholdTagState().active,true);
  assert.equal(f.audio.openingThresholdTagState().playing,true);
  f.audio.stopAll();assert.equal(f.audio.openingThresholdTagState().active,false);
}));

test('a pending cadence decode is cancelled with the run and cannot arrive in the drive',async()=>fixture(async f=>{
  assert.equal(f.audio.commitOpeningOvertureToTag().pending,true);f.audio.stopAll();await f.load();
  assert.equal(f.sources.length,0);assert.equal(f.audio.openingThresholdTagState().active,false);
}));

test('pending decode does not consume the recorded bar before it can be heard',async()=>fixture(async f=>{
  f.audio.commitOpeningOvertureToTag();f.ctx.currentTime=16;
  assert.equal(f.audio.openingThresholdTagState().positionSeconds,0);
  await f.load();assert.equal(f.sources.length,1);assert.equal(f.sources[0].starts[0][1],95.98);
  f.ctx.currentTime=17;assert.equal(f.audio.openingThresholdTagState().positionSeconds,1);
}));
