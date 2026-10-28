import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuationMaterialAudio,continuationAcousticPlacement,continuationReflectionBuffer,CONTINUATION_MATERIALS} from '../src/audio/source-continuation-materials.js';

function audio(){
  const nodes=[],sources=[],decoded=[],fetches=[];
  const param=()=>({value:0,history:[],setValueAtTime(v,t){this.value=v;this.history.push(['set',v,t]);},setTargetAtTime(v,t,s){this.value=v;this.history.push(['target',v,t,s]);},linearRampToValueAtTime(v,t){this.value=v;this.history.push(['linear',v,t]);}});
  const node=(kind,extra={})=>{const n={kind,connections:[],...extra,connect(to){this.connections.push(to);return to;},disconnect(){this.disconnected=true;this.connections=[];}};nodes.push(n);return n;};
  const ctx={state:'running',currentTime:0,sampleRate:8000,
    createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,duration:length/rate,getChannelData:c=>data[c]};},
    async decodeAudioData(bytes){const row=CONTINUATION_MATERIALS.clips[new Uint8Array(bytes)[0]];decoded.push(row.id);return{duration:row.seconds};},
    createBufferSource(){const n=node('source',{playbackRate:param(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(){this.stops.push(ctx.currentTime);}});sources.push(n);return n;},
    createGain:()=>node('gain',{gain:param()}),createBiquadFilter:()=>node('filter',{frequency:param(),Q:param()}),
    createStereoPanner:()=>node('pan',{pan:param()}),createConvolver:()=>node('convolver')};
  const destination=node('destination');
  const fetcher=async url=>{fetches.push(url);const index=CONTINUATION_MATERIALS.clips.findIndex(r=>url.endsWith(r.file));assert.ok(index>=0);return{ok:true,arrayBuffer:async()=>new Uint8Array([index]).buffer};};
  return{ctx,destination,fetcher,nodes,sources,decoded,fetches};
}
const state=extra=>({runId:'material-test',phase:'wrong-return',x:0,z:2,feet:0,yaw:0,elapsed:0,...extra});

test('material placement distinguishes actual distance, vertical arrival and a blocking wall',()=>{
  const source={x:0,y:8,z:-10},s=state();
  const open=continuationAcousticPlacement(source,s,[]);
  const blocked=continuationAcousticPlacement(source,s,[{minX:-4,maxX:4,minY:0,maxY:10,minZ:-4,maxZ:-3,role:'wall'}]);
  assert.ok(open.distance>12);assert.ok(open.arrival>0);assert.equal(open.blocked,false);
  assert.equal(blocked.blocked,true);assert.ok(blocked.cutoff<open.cutoff);assert.ok(blocked.gain<open.gain);
  const rail=continuationAcousticPlacement(source,s,[{minX:-4,maxX:4,minY:0,maxY:10,minZ:-4,maxZ:-3,role:'rail'}]);
  assert.equal(rail.blocked,false,'a thin railing must not acoustically become a wall');
  assert.ok(continuationAcousticPlacement({x:8,y:2,z:-8},s,[]).pan>0);
  assert.ok(continuationAcousticPlacement({x:8,y:2,z:-8},state({yaw:Math.PI}),[]).pan<0);
});

test('open underside and retaining case have distinct finite authored reflection groups',()=>{
  const g=audio(),open=continuationReflectionBuffer(g.ctx,'open-underside'),inside=continuationReflectionBuffer(g.ctx,'retaining-case');
  assert.ok(inside.duration>open.duration*2);
  for(const b of [open,inside])for(let c=0;c<2;c++){
    const values=b.getChannelData(c);assert.ok(values.every(Number.isFinite));assert.equal(values[0],0);assert.ok(values.some(v=>v!==0));
  }
  assert.equal(continuationAcousticPlacement({x:2,y:2,z:1},state(),[]).domain,'open-underside');
  assert.equal(continuationAcousticPlacement({x:2,y:2,z:1},state({phase:'catch'}),[]).domain,'retaining-case');
});

test('recorded sources preload once, keep original pitch and expire after the audible tail',async()=>{
  const g=audio(),sound=createContinuationMaterialAudio({getAudio:()=>g,fetcher:g.fetcher,urlFor:f=>f});
  sound.prepare();assert.equal(await sound.whenReady(),true);assert.equal(g.fetches.length,3);
  assert.equal(sound.event({type:'land'},state({phase:'catch',feet:2.4})),true);
  const source=g.sources[0];assert.equal(source.playbackRate.value,1);assert.ok(source.starts[0][2]>.1);
  const envelope=g.nodes.find(n=>n.kind==='gain'&&n.gain.history.some(v=>v[0]==='linear'));
  assert.ok(envelope,'source cuts have a real attack and release, separate from spatial gain');
  source.onended();assert.equal(sound.snapshot().voices,1,'do not cut the convolution tail at source end');
  g.ctx.currentTime=1.4;sound.update(state({phase:'catch'}));assert.equal(sound.snapshot().voices,0);
  sound.prepare();assert.equal(g.fetches.length,3);sound.dispose();
});

test('protection and pause cancel sources and reflected tails without a delayed replay',async()=>{
  const g=audio();let protectedAudio=false;
  const sound=createContinuationMaterialAudio({getAudio:()=>g,fetcher:g.fetcher,urlFor:f=>f,protectedAudio:()=>protectedAudio});
  sound.prepare();await sound.whenReady();sound.event({type:'capture'},state({phase:'catch'}));
  assert.equal(sound.snapshot().voices,1);protectedAudio=true;sound.update(state({phase:'catch'}));
  assert.equal(sound.snapshot().voices,0);assert.ok(g.sources.every(s=>s.stops.length));
  assert.equal(sound.event({type:'land'},state()),false);protectedAudio=false;sound.update(state());
  assert.equal(sound.snapshot().voices,0,'no cue queued behind a recording hold');sound.dispose();
});

test('upper remnant contact is finite, above the body and does not become a repeating ambience',async()=>{
  const g=audio(),sound=createContinuationMaterialAudio({getAudio:()=>g,fetcher:g.fetcher,urlFor:f=>f});
  sound.prepare();await sound.whenReady();sound.update(state({elapsed:8}));
  const first=sound.snapshot();assert.equal(first.voices,1);assert.equal(first.layers[0].position.y,100);assert.ok(first.layers[0].mix.arrival>.2);
  for(let i=0;i<20;i++)sound.update(state({elapsed:9+i}));assert.equal(sound.snapshot().played,1);
  sound.stop();sound.update(state({elapsed:40}));assert.equal(sound.snapshot().played,1);sound.dispose();
});

test('event storms retain the independent material voice budget',async()=>{
  const g=audio(),sound=createContinuationMaterialAudio({getAudio:()=>g,fetcher:g.fetcher,urlFor:f=>f});
  sound.prepare();await sound.whenReady();
  for(let i=0;i<60;i++)sound.event({type:'land'},state({phase:'catch'}));
  assert.equal(sound.snapshot().voices,CONTINUATION_MATERIALS.maxVoices);assert.ok(sound.snapshot().skipped>0);
  sound.stop();assert.equal(sound.snapshot().voices,0);assert.ok(g.sources.every(s=>s.disconnected));sound.dispose();
});

test('a transient503 recovers on the same context after bounded backoff without replaying old contacts',async()=>{
  const g=audio();let requests=0;const sound=createContinuationMaterialAudio({getAudio:()=>g,urlFor:f=>f,fetcher:async url=>{requests++;return requests===1?{ok:false,status:503}:g.fetcher(url);}});
  sound.prepare();assert.equal(await sound.whenReady(),false);assert.equal(sound.snapshot().loadAttempts,1);assert.equal(sound.snapshot().nextRetryAt,3);
  assert.equal(sound.event({type:'land'},state()),false);
  for(let k=0;k<20;k++){g.ctx.currentTime=2.9*k/20;sound.update(state());}assert.equal(requests,1,'frame updates cannot hot-loop a failed fetch');
  g.ctx.currentTime=3;sound.prepare();assert.equal(await sound.whenReady(),true);assert.equal(requests,4);assert.equal(sound.snapshot().retryCount,1);assert.equal(sound.snapshot().voices,0,'failed contacts are not queued behind the loader');
  assert.equal(sound.event({type:'land'},state({phase:'catch'})),true);sound.dispose();
});

test('a later scene shares a successful retry rather than inheriting a rejected context promise',async()=>{
  const g=audio();let requests=0;const options={getAudio:()=>g,urlFor:f=>f,fetcher:async url=>{requests++;return requests===1?{ok:false,status:503}:g.fetcher(url);}};
  const first=createContinuationMaterialAudio(options);first.prepare();assert.equal(await first.whenReady(),false);first.dispose();
  const next=createContinuationMaterialAudio(options);next.prepare();assert.equal(requests,1);g.ctx.currentTime=3;next.prepare();assert.equal(await next.whenReady(),true);assert.equal(requests,4);assert.equal(next.snapshot().error,null);next.dispose();
});

test('sustained failures stop at three shared-context attempts and never become a frame-driven fetch storm',async()=>{
  const g=audio();let requests=0;const sound=createContinuationMaterialAudio({getAudio:()=>g,urlFor:f=>f,fetcher:async()=>{requests++;return{ok:false,status:503};}});
  for(let k=0;k<12;k++){g.ctx.currentTime=k*3;sound.prepare();await sound.whenReady();}
  assert.equal(requests,CONTINUATION_MATERIALS.maxLoadAttempts);assert.equal(sound.snapshot().loadAttempts,3);assert.equal(sound.snapshot().retryCount,2);assert.equal(sound.snapshot().ready,false);assert.match(sound.snapshot().error,/unavailable/);sound.dispose();
});

test('recording protection and disposal prevent otherwise eligible retries and cancel source-ended callbacks',async()=>{
  const g=audio();let protectedAudio=false,requests=0;
  const sound=createContinuationMaterialAudio({getAudio:()=>g,urlFor:f=>f,protectedAudio:()=>protectedAudio,fetcher:async url=>{requests++;return requests===1?{ok:false,status:503}:g.fetcher(url);}});
  sound.prepare();await sound.whenReady();g.ctx.currentTime=5;protectedAudio=true;
  for(let k=0;k<10;k++)sound.prepare();assert.equal(requests,1);protectedAudio=false;sound.prepare();assert.equal(await sound.whenReady(),true);
  sound.update(state());sound.event({type:'capture'},state({phase:'catch'}));assert.equal(typeof g.sources[0].onended,'function');sound.dispose();assert.equal(g.sources[0].onended,null);assert.ok(g.sources.every(s=>s.disconnected));
  const before=requests;sound.prepare();assert.equal(await sound.whenReady(),false);assert.equal(requests,before);assert.equal(sound.snapshot().ready,false);
});

test('late preparation from an old context cannot overwrite the active bank generation',async()=>{
  const first=audio(),second=audio();let pair=first,finishFirst,requests=0;
  const sound=createContinuationMaterialAudio({getAudio:()=>pair,urlFor:f=>f,fetcher:async url=>{requests++;if(requests===1)return new Promise(resolve=>{finishFirst=()=>first.fetcher(url).then(resolve);});return second.fetcher(url);}});
  sound.prepare();const old=sound.whenReady();pair=second;sound.prepare();assert.equal(await sound.whenReady(),true);assert.equal(sound.snapshot().ready,true);
  await finishFirst();assert.equal(await old,false,'the superseded owner promise cannot report current readiness');assert.equal(sound.snapshot().ready,true);
  sound.update(state());sound.event({type:'land'},state({phase:'catch'}));assert.equal(second.sources.length,1);assert.equal(first.sources.length,0);sound.dispose();
});
