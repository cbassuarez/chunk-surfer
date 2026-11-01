import {createSourceContinuationAudio} from '../src/audio/source-continuation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createThresholdGagAudio,thresholdGagAudioPlacement,THRESHOLD_GAG_AUDIO as T} from '../src/audio/threshold-gag.js';

function fixture(){
  const nodes=[],sources=[],fetches=[];let protection=false,decodes=0;
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t]);},setTargetAtTime(v,t,s){this.value=v;this.events.push(['target',v,t,s]);}});
  const node=(kind,extra={})=>{const n={kind,connections:[],...extra,connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];this.disconnected=true;}};nodes.push(n);return n;};
  const seconds={release:.205,stop:.245,rattle:.185,boo:.9204166667};
  const keys=Object.keys(T.clips);
  const ctx={state:'running',currentTime:4,sampleRate:8000,
    createBufferSource(){const n=node('source',{playbackRate:param(),starts:[],stops:[],start(...args){this.starts.push(args);},stop(at){this.stops.push(at);}});sources.push(n);return n;},
    createGain:()=>node('gain',{gain:param()}),createBiquadFilter:()=>node('filter',{frequency:param(),Q:param()}),
    createPanner:()=>node('hrtf',{positionX:param(),positionY:param(),positionZ:param()}),
    createStereoPanner:()=>node('pan',{pan:param()}),
    createBuffer(channels,length,rate){return{duration:length/rate,length,getChannelData:()=>new Float32Array(length)};},
    async decodeAudioData(bytes){decodes++;return{duration:seconds[keys[new Uint8Array(bytes)[0]]]};}};
  const destination=node('provided-sfx'),hardware=node('hardware');ctx.destination=hardware;
  const fetcher=async(url)=>{fetches.push(url);const index=Object.values(T.clips).findIndex(file=>url.endsWith(file));assert.ok(index>=0);return{ok:true,arrayBuffer:async()=>new Uint8Array([index]).buffer};};
  const options={getAudio:()=>({ctx,destination}),fetcher,urlFor:file=>file,protectedAudio:()=>protection};
  return{ctx,destination,hardware,nodes,sources,fetches,options,protect:p=>{protection=p;},decodes:()=>decodes};
}
const state=extra=>({runId:'gag-test',x:0,z:0,feet:8.4,yaw:0,chartId:0,...extra});
const at={x:2,y:9.7,z:-2};
const cue=(kind,extra={})=>({type:'threshold-gag-'+kind,id:'upper-return',position:at,chartId:0,...extra});
async function ready(f=fixture()){const sound=createThresholdGagAudio(f.options);assert.equal(await sound.prepare(),true);return{...f,sound};}
function monoPcm(file){
  const wav=readFileSync(new URL('../'+file,import.meta.url));let format=null,data=null;
  for(let at=12;at+8<=wav.length;){const kind=wav.toString('ascii',at,at+4),size=wav.readUInt32LE(at+4),from=at+8;
    if(kind==='fmt ')format={code:wav.readUInt16LE(from),channels:wav.readUInt16LE(from+2),rate:wav.readUInt32LE(from+4),bits:wav.readUInt16LE(from+14),subformat:size>=40?wav.readUInt32LE(from+24):null};
    if(kind==='data')data=wav.subarray(from,from+size);at=from+size+(size&1);
  }
  assert.ok(format?.code===1||format?.code===65534&&format.subformat===1);assert.equal(format.channels,1);assert.ok(data);const bytes=format.bits/8,samples=new Float64Array(data.length/bytes);
  for(let i=0;i<samples.length;i++)samples[i]=data.readIntLE(i*bytes,bytes)/(2**(format.bits-1));
  return {...format,samples};
}
const rms=samples=>Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);

test('shipped word is licensed recorded human speech with retained source, bounded levels and inherited attribution',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/threshold-gag/credits.json',import.meta.url)));
  assert.match(manifest.voice.text,/^boo[.!]?$/);assert.match(manifest.voice.method,/recorded human/i);assert.ok(['CC0 1.0','CC BY 3.0','CC BY 4.0','Public Domain'].includes(manifest.voice.license));assert.equal(manifest.voice.processing.pitchOrTimeChange,false);const raw=readFileSync(new URL('../public/audio/threshold-gag/'+manifest.voice.unprocessed.file,import.meta.url));assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.voice.unprocessed.sha256);
  assert.ok(manifest.mechanicalSources.some(x=>x.id==='kranhytt-674784'&&x.licence==='CC BY 4.0'));
  assert.ok(manifest.mechanicalSources.some(x=>x.id==='a-sounds-587337'&&x.licence==='CC0 1.0'));
  let bytes=0,seconds=0;
  for(const clip of manifest.clips){
    const wav=readFileSync(new URL('../public/audio/threshold-gag/'+clip.file,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(createHash('sha256').update(wav).digest('hex'),clip.sha256);assert.ok(clip.peakDbFS< -3&&clip.peakDbFS> -50);
    bytes+=wav.length;seconds+=clip.seconds;
  }
  const word=manifest.clips.find(x=>x.id==='boo');assert.ok(manifest.voice.cleanEdit.seconds>.25&&manifest.voice.cleanEdit.seconds<.65);assert.ok(word.seconds>manifest.voice.cleanEdit.seconds+.40&&word.seconds<1);assert.ok(word.rmsDbFS>-35);assert.equal(manifest.voice.processing.bitcrush.module,'tools/chunk_surfer/stop-listening-dsp.mjs');assert.equal(manifest.voice.processing.reverb.module,'src/audio/stop-listening-gut.js');
  assert.ok(bytes<T.maxEncodedBytes&&seconds<T.maxDecodedSeconds);
});

test('the shipped heavy derivative has materially coarser grain without replacing, lengthening or turning up the human word',()=>{
  const credits=JSON.parse(readFileSync(new URL('../public/audio/threshold-gag/credits.json',import.meta.url))),p=credits.voice.processing;
  assert.deepEqual([p.bitcrush.bits,p.bitcrush.rate,p.bitcrush.mix],[6,18000,.98]);
  assert.equal(p.pitchOrTimeChange,false);assert.equal(p.sourceTrim,false);
  const clean=monoPcm('assets/threshold-gag-audio-source/boo-clean-edit.wav'),dry=monoPcm('assets/threshold-gag-audio-source/boo-crushed-dry.wav'),word=monoPcm('public/audio/threshold-gag/boo.wav');
  assert.equal(clean.rate,48000);assert.equal(dry.rate,clean.rate);assert.equal(dry.samples.length,clean.samples.length);
  const difference=dry.samples.map((value,i)=>value-clean.samples[i]),grain=rms(difference)/rms(clean.samples);
  assert.ok(grain>.14&&grain<.3,`baked grain relative to clean=${grain}; manifest alone cannot establish stronger processing`);
  assert.ok(Math.abs(20*Math.log10(rms(dry.samples)/rms(clean.samples)))<.05,'distortion must not rely on louder dry speech');
  assert.equal(credits.voice.original.sha256,'371374c5a5b22e3775dab17c7d7c76745d846f9b6339f3913359c2ebc4acd59e');
  assert.equal(credits.voice.authoredImpulse.sha256,'95d567ad8c90b68cad9c3b496b0911a09b04556c3801b4433243f31d65f6a3f4');
  assert.equal(p.reverb.seconds,.45);assert.equal(p.reverb.preDelay,.006);assert.equal(p.reverb.wet,.14);
  assert.ok(Math.abs(p.reverb.actualActiveWetToDryDb+18)<.001);assert.equal(p.reverb.fullConvolutionSamples,44179);
  assert.equal(word.rate,24000);assert.equal(word.bits,16);assert.equal(word.samples.length,22090);
  assert.ok(Math.abs(word.samples.at(-1))<=1/32768,'the retained finite tail ends at zero');
  assert.equal(T.clips.boo,'boo.wav?v=human-short-heavy-room-4');
  const fixed={hinge:'e6f2abe7dab0b2ff8d0b3185336f945b5f1a08464f93387316d0f60fe8d559b2','wood-stop':'b5a9948f6e4af1fb500e58de0c2b71fe1ab00c3c408a40bfe5e92b41dcbff102',settle:'5b8107cf71d451e76393213fe35ecbbe1ef502c63fafc8c9e59bbb71374c2e1f'};
  for(const [id,sha]of Object.entries(fixed))assert.equal(credits.clips.find(clip=>clip.id===id).sha256,sha,'voice-only rebuild changes no mechanism');
});

test('all finite apparatus events play once through provided SFX, with no hidden sequence clock or hardware route',async()=>{
  const f=await ready();assert.equal(f.fetches.length,4);assert.equal(f.sources.length,0);
  assert.equal(await f.sound.prepare(),true);assert.equal(f.fetches.length,4);
  for(const kind of ['release','stop','rattle','speaker-click','boo']){assert.equal(f.sound.event(cue(kind),state()),true);assert.equal(f.sound.event(cue(kind),state()),false);}
  assert.equal(f.sound.snapshot().played,5);assert.ok(f.sound.snapshot().voices<=T.maxVoices);
  for(const source of f.sources){assert.equal(source.loop,false);assert.equal(source.playbackRate.value,1);assert.equal(source.starts.length,1);assert.ok(source.stops[0]-source.starts[0][0]<=source.buffer.duration+.003);}
  assert.ok(f.nodes.some(n=>n.connections.includes(f.destination)));assert.ok(f.nodes.every(n=>!n.connections.includes(f.hardware)));
  assert.equal(f.sound.event({type:'hush-warning'},state()),false,'real threat event has no comic dispatch');
  for(const source of f.sources.filter(s=>s.onended))source.onended();assert.equal(f.sound.snapshot().voices,0);assert.equal(f.sound.snapshot().nodes,0);
  f.sound.dispose();
});

test('moving speaker and listener use same Source chart projection and HRTF origin without touching shared listener',async()=>{
  const f=await ready();f.sound.update(state(),null,{speaker:at});f.sound.event(cue('boo'),state());
  const before=f.sound.snapshot().layers[0];assert.ok(before.mix.relativeXYZ[0]>0);assert.equal(before.hrtf,true);
  const moved={x:-2,y:9.8,z:-1};f.sound.update(state(),null,{speaker:moved});
  assert.deepEqual(f.sound.snapshot().layers[0].position,moved);assert.ok(f.sound.snapshot().layers[0].mix.relativeXYZ[0]<0);
  const speaker=f.nodes.find(n=>n.kind==='hrtf');assert.equal(speaker.rolloffFactor,0,'manual physical-distance attenuation is not applied twice');
  const pannerPosition=speaker.positionX.value;assert.ok(pannerPosition<0);
  f.sound.update(state({chartId:1}),{projectPoint:()=>null},{speaker:moved});assert.equal(f.sound.snapshot().layers[0].mix.gain,0,'an emitter without a visible/acoustic chart image cannot invent a source');
  assert.equal(f.sources[0].starts.length,1);f.sound.dispose();
});

test('physical distance and turning affect local placement while keeping a modest dry word',()=>{
  const a=thresholdGagAudioPlacement({x:2,y:10,z:-2},state());
  const b=thresholdGagAudioPlacement({x:2,y:10,z:-2},state({yaw:Math.PI}));
  const far=thresholdGagAudioPlacement({x:2,y:10,z:-25},state());
  assert.ok(a.pan>0&&b.pan<0);assert.ok(far.gain<a.gain*.2);assert.ok(far.cutoff<a.cutoff);
  assert.ok(a.gain<1&&a.gain>0);assert.ok(T.gain.boo<.6);
});

test('pause/exit dispose active speech; resuming never repeats emitted audio or starts a queued word',async()=>{
  const f=await ready();f.sound.event(cue('boo'),state());const source=f.sources[0],stale=source.onended;
  f.sound.pause();assert.equal(f.sound.snapshot().voices,0);assert.equal(source.onended,null);assert.ok(source.disconnected);
  stale();f.sound.resume();f.sound.update(state());assert.equal(f.sources.length,1);
  assert.equal(f.sound.event(cue('boo'),state()),false);assert.equal(f.sound.snapshot().voices,0);
  f.sound.dispose();assert.equal(f.sound.snapshot().disposed,true);assert.equal(f.sound.event(cue('stop'),state()),false);assert.equal(await f.sound.prepare(),false);
});

test('real warning cancels remaining comic audio without rearming, rewinding or touching real-threat state',async()=>{
  const f=await ready();const s=state({hush:{active:true,mode:'follow',x:8},closure:{mode:'idle'}}),copy=structuredClone(s);
  f.sound.event(cue('release'),s);f.sound.event({type:'threshold-gag-cancel',reason:'hush-warning'},s);
  assert.equal(f.sound.snapshot().voices,0);assert.equal(f.sound.event(cue('boo'),s),false);assert.deepEqual(s,copy);
  f.sound.resume();assert.equal(f.sound.event(cue('speaker-click'),s),false,'cancelled sequence cannot continue after resume');
  f.sound.update({...s,runId:'new-run'});assert.equal(f.sound.event(cue('boo'),{...s,runId:'new-run'}),true,'a new run has its own apparatus');f.sound.dispose();
});

test('protection suppresses event edges and removes active sounds without a later deferred scare',async()=>{
  const f=await ready();f.sound.event(cue('release'),state());f.protect(true);f.sound.update(state());
  assert.equal(f.sound.snapshot().voices,0);assert.equal(f.sound.event(cue('boo'),state()),false);
  f.protect(false);f.sound.update(state());assert.equal(f.sound.event(cue('boo'),state()),false);assert.equal(f.sound.snapshot().voices,0);f.sound.dispose();
});

test('late decode after disposal cannot start audio; failed loads are explicit and bounded rather than frame-driven retries',async()=>{
  const f=fixture();let finish,requests=0;
  const sound=createThresholdGagAudio({...f.options,fetcher:async url=>{requests++;await new Promise(r=>{finish=r;});return f.options.fetcher(url);}});
  const job=sound.prepare();await Promise.resolve();sound.dispose();finish();assert.equal(await job,false);assert.equal(sound.snapshot().ready,false);assert.equal(f.sources.length,0);
  const g=fixture(),missing=createThresholdGagAudio({...g.options,fetcher:async()=>{requests++;return{ok:false,status:404};}});
  assert.equal(await missing.prepare(),false);const count=requests;
  for(let k=0;k<20;k++){await missing.prepare();missing.update(state());}
  assert.equal(requests,count);assert.match(missing.snapshot().error,/unavailable/);assert.equal(missing.event(cue('boo'),state()),false);missing.dispose();
});

test('unknown/missing positions and a suspended context never synthesize fallback speech or resume the device',async()=>{
  const f=await ready();f.ctx.state='suspended';assert.equal(f.sound.event(cue('boo'),state()),false);assert.equal(f.sources.length,0);
  f.ctx.state='running';assert.equal(f.sound.event({type:'threshold-gag-boo',id:'other'},state()),false);
  assert.equal(f.sound.event({type:'threshold-gag-toString',position:at},state()),false);assert.equal(f.sources.length,0);f.sound.dispose();
});


test('normal Source host can preload after the preceding scene stopped its reused audio owner',async()=>{
  let fetched=0,sources=0;const ctx={state:'running',createBufferSource(){sources++;return{};},createGain(){return{};},createBiquadFilter(){return{};},decodeAudioData:async()=>({duration:.1})};
  const audio=createSourceContinuationAudio({getAudio:()=>({ctx,destination:{}}),gagFetcher:async()=>({ok:true,arrayBuffer:async()=>{fetched++;return new ArrayBuffer(8);}})});
  audio.stop();assert.equal(audio.snapshot().thresholdGag.paused,true);
  assert.equal(await audio.prepare(),true);assert.equal(audio.gagReady(),true);assert.equal(fetched,4);assert.equal(sources,0,'preload cannot play or resume a sound');
  audio.stop();assert.equal(await audio.prepare(),true);assert.equal(fetched,4,'re-entry reuses decoded clips without depending on first update');audio.dispose();
});
