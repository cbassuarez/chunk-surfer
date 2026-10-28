import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceSurroundingsAudio,sourceSurroundingsPlacement,SOURCE_SURROUNDINGS_AUDIO as C} from '../src/audio/source-surroundings.js';
import {sourceSurroundingsFrame} from '../src/game/source-surroundings.js';
import {standingTearRepertoireById} from '../src/data/standing-tear-memory-score.js';

const state=(extra={})=>({status:'active',runId:'surroundings-test',phase:'wrong-return',elapsed:2,x:0,z:0,feet:0,yaw:0,pitch:0,counterweight:{mode:'walking'},...extra});
function graph({hrtf=true,decodedRate=4000}={}){
  const nodes=[],sources=[],requests=[],assignments=[];
  const param=()=>({value:0,history:[],setValueAtTime(v,t){this.value=v;this.history.push(['set',v,t]);},setTargetAtTime(v,t,s){this.value=v;this.history.push(['target',v,t,s]);},linearRampToValueAtTime(v,t){this.value=v;this.history.push(['ramp',v,t]);},cancelScheduledValues(t){this.history.push(['cancel',t]);}});
  const node=(kind,extra={})=>{const n={kind,connections:[],disconnects:0,connect(n){this.connections.push(n);return n;},disconnect(){this.connections=[];this.disconnects++;},...extra};nodes.push(n);return n;};
  const ctx={currentTime:10,sampleRate:8000,state:'running',
    createGain:()=>node('gain',{gain:param()}),createBiquadFilter:()=>node('filter',{frequency:param()}),createStereoPanner:()=>node('stereo',{pan:param()}),createWaveShaper:()=>node('limiter'),
    createConvolver(){const n=node('convolver',{normalize:true,_buffer:null});Object.defineProperty(n,'buffer',{get(){return this._buffer;},set(v){assignments.push({normalize:this.normalize,buffer:v});this._buffer=v;}});return n;},
    createBuffer(numberOfChannels,length,sampleRate){const data=Array.from({length:numberOfChannels},()=>new Float32Array(length));return{numberOfChannels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>data[i]};},
    createBufferSource(){const n=node('source',{playbackRate:param(),starts:[],stops:[],start(at,offset=0,duration){this.starts.push({at,offset,duration});},stop(at){this.stops.push(at);}});sources.push(n);return n;},
    async decodeAudioData(bytes){const token=new Uint8Array(bytes)[0],piece=standingTearRepertoireById(token===1?'ensemble':'couperin'),duration=token===3?12:token===4?2.65:piece.duration,b=this.createBuffer(1,Math.round(duration*decodedRate),decodedRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=.36*Math.sin(i*.117)+.08*Math.sin(i*.041);return b;},
  };
  if(hrtf)ctx.createPanner=()=>node('HRTF',{positionX:param(),positionY:param(),positionZ:param()});
  Object.defineProperty(ctx,'listener',{get(){throw Error('The shared listener belongs to ordinary game audio.');}});
  const destination=node('music-destination');
  const fetcher=async(url,options)=>{requests.push({url,options});return{ok:true,arrayBuffer:async()=>Uint8Array.of(String(url).includes('chaconne')?1:String(url).includes('couperin')?2:String(url).includes('joint-fracture')?4:3).buffer};};
  return{ctx,destination,nodes,sources,requests,assignments,fetcher};
}
function fixture(options={}){
  const g=graph(options);let pair=g,protectedValue=false;
  const audio=createSourceSurroundingsAudio({getAudio:()=>pair,protectedAudio:()=>protectedValue,fetcher:options.fetcher||g.fetcher,urlFor:p=>'local/'+p});
  return{...g,audio,setPair:v=>{pair=v;},protect:v=>{protectedValue=v;},update:(s,extra={})=>audio.update({state:s,ready:true,...extra})};
}

test('a release on an exact fixed-tick boundary survives floating-point rounding and plays once',async()=>{
  const h=fixture();await h.audio.prepare();
  h.update(state({elapsed:9.6}));h.ctx.currentTime+=.05;
  h.update(state({elapsed:9.65-1e-12}));h.ctx.currentTime+=1/120;
  h.update(state({elapsed:9.65+1/120}));h.ctx.currentTime+=1/120;
  h.update(state({elapsed:9.65+2/120}));
  const releases=h.audio.snapshot().history.filter(row=>row.type==='surroundings-pressure-release');
  assert.equal(releases.length,1);assert.equal(releases[0].time,9.65);h.audio.dispose();
});

test('the real canonical music decodes without playing, then uses actual PCM crushing before spatialized long reverb',async()=>{
  const h=fixture({decodedRate:48000});assert.equal(await h.audio.prepare(),true);assert.equal(h.sources.length,0,'preparation never starts a late source');
  assert.equal(h.update(state()),true);const s=h.audio.snapshot(),frame=sourceSurroundingsFrame(state());
  assert.equal(s.musicVoices,1);assert.equal(s.music.pieceId,'ensemble');assert.equal(s.score.phase,frame.score.phase);assert.equal(h.sources[0].starts[0].offset,frame.score.phase);assert.equal(h.sources[0].playbackRate.value,1);
  assert.ok(h.requests.every(r=>r.url.startsWith('local/')));assert.equal(h.requests.length,4);
  for(const id of ['ensemble','couperin']){
    const d=s.dsp.recordings[id],piece=standingTearRepertoireById(id);assert.equal(d.bitDepth,piece.bitDepth);assert.equal(d.kind,'signed-pcm-amplitude-quantisation');assert.equal(d.sampleRate,48000);assert.equal(d.effectiveSampleRate,piece.effectiveSampleRate);assert.equal(d.sampleHold,true);assert.ok(d.observedAmplitudeLevels<=2**piece.bitDepth);assert.equal(d.processedBeforeSpatialisation,true);
  }
  assert.equal(s.dsp.reverbSeconds,6.8);assert.equal(s.dsp.limiterCeiling,.72);assert.ok(h.assignments.filter(v=>v.buffer).every(v=>v.normalize===false));
  const pan=h.nodes.find(n=>n.kind==='HRTF');assert.equal(pan.rolloffFactor,0);assert.ok(pan.connections.some(n=>n.kind==='convolver'));h.audio.dispose();
});

test('fixed world music follows camera yaw and pitch without restarting phrases or acquiring the shared listener',async()=>{
  const h=fixture();await h.audio.prepare();let s=state();h.update(s);const fixed=h.audio.snapshot().music.position;
  h.ctx.currentTime+=.1;s={...s,elapsed:s.elapsed+.1,yaw:Math.PI/2,pitch:.3};h.update(s);
  assert.equal(h.sources.length,1);assert.deepEqual(h.audio.snapshot().music.position,fixed);assert.deepEqual(h.audio.snapshot().music.placement,sourceSurroundingsPlacement(fixed,s));
  const front=sourceSurroundingsPlacement({x:0,y:1.62,z:-10},state({x:0,z:0,feet:0})),back=sourceSurroundingsPlacement({x:0,y:1.62,z:10},state());assert.equal(front.relativeXYZ[2],-10);assert.equal(back.relativeXYZ[2],10);
  h.audio.dispose();const stereo=fixture({hrtf:false});await stereo.audio.prepare();stereo.update(state());assert.equal(stereo.audio.snapshot().music.spatialization,'stereo');stereo.audio.dispose();
});

test('pause, missing readiness and protected recorder/playback flush all tails, resuming the held score rather than elapsed wall time',async()=>{
  const h=fixture();await h.audio.prepare();const s=state({elapsed:8});h.update(s);const phase=h.audio.snapshot().score.phase;
  h.audio.pause();assert.equal(h.audio.snapshot().voices,0);assert.ok(h.nodes.filter(n=>n.kind==='convolver').every(n=>n.buffer===null));
  h.ctx.currentTime+=60;h.update(s,{paused:true});assert.equal(h.sources.length,1);h.update(s);assert.equal(h.sources.length,2);assert.equal(h.sources[1].starts[0].offset,phase);assert.equal(h.audio.snapshot().impacts.length,0);
  const retired=h.sources[0];assert.ok(retired.stops.length);h.protect(true);h.update(s);assert.equal(h.audio.snapshot().voices,0);const count=h.requests.length;assert.equal(await h.audio.prepare(),false);assert.equal(h.requests.length,count);
  h.protect(false);h.update(s,{ready:false});assert.equal(h.audio.snapshot().voices,0);h.update(s);assert.equal(h.audio.snapshot().music.phase,phase);h.audio.dispose();
});

test('a threshold releases the old world and attacks the next within one music voice, preserving the next score phase',async()=>{
  const h=fixture();await h.audio.prepare();h.update(state({elapsed:12}));const old=h.sources[0];
  h.ctx.currentTime+=.1;const next=state({phase:'catch',elapsed:12.1});h.update(next);assert.equal(h.sources.length,1);assert.equal(h.audio.snapshot().music.pieceId,'ensemble');
  assert.ok(h.nodes.some(n=>n.kind==='gain'&&n.gain.history.some(v=>v[0]==='ramp'&&v[1]===0&&Math.abs(v[2]-10.3)<1e-6)));
  h.ctx.currentTime+=.21;next.elapsed+=.21;h.update(next);assert.ok(old.stops.length);assert.equal(h.sources.length,2);assert.equal(h.audio.snapshot().musicVoices,1);assert.equal(h.audio.snapshot().music.pieceId,'couperin');assert.equal(h.sources[1].starts[0].offset,sourceSurroundingsFrame(next).score.phase);
  const ordinary=h.audio.snapshot().dsp.outputGain;next.counterweight.mode='lowering-warning';h.update(next);assert.ok(h.audio.snapshot().dsp.outputGain<ordinary*.25,'machine warning keeps priority');h.audio.dispose();
});

test('pressure releases and travelling-front responses sound only near their actual shared times, stay bounded, and discard missed events',async()=>{
  const h=fixture();await h.audio.prepare();let heard=0;
  for(let t=0;t<36;t+=.08){h.ctx.currentTime=10+t;h.update(state({elapsed:t}));const v=h.audio.snapshot();heard=Math.max(heard,v.played-1);assert.ok(v.impactTails<=2);assert.ok(v.voices<=3);}
  assert.ok(heard>0,'the shared physical model actually supplies pressure releases');const snapshot=h.audio.snapshot();assert.ok(snapshot.history.some(row=>row.type==='surroundings-pressure-release'));
  const releases=snapshot.history.filter(row=>row.type==='surroundings-pressure-release');assert.equal(releases.length,new Set(releases.map(row=>row.id)).size,'a1.5s presentation tail never repeats the same release');assert.ok(releases.every(row=>row.assetId==='tower-pressure'));
  assert.ok(snapshot.history.some(row=>row.type==='surroundings-pressure-arrival'&&row.assetId==='path-pressure'),'path strain waits for the model wave-arrival event');
  const impactsBefore=h.audio.snapshot().history.filter(r=>r.type==='surroundings-pressure-release').length;h.audio.pause();h.ctx.currentTime+=100;h.update(state({elapsed:80}));assert.equal(h.audio.snapshot().history.filter(r=>r.type==='surroundings-pressure-release').length,impactsBefore,'resume discards unplayed releases');
  h.audio.dispose();const centre=fixture();await centre.audio.prepare();
  for(let t=0;t<30;t+=.08){centre.ctx.currentTime=10+t;centre.update(state({elapsed:t,phase:'catch'}));assert.ok(centre.audio.snapshot().impactTails<=2);}
  const responses=centre.audio.snapshot().history.filter(row=>row.type==='surroundings-pressure-release'||row.type==='surroundings-pressure-arrival');assert.ok(responses.some(row=>row.type==='surroundings-pressure-release'));assert.ok(responses.every(row=>row.assetId==='path-pressure'),'Missing Centre has material strain, never an unexplained bell');centre.audio.dispose();
});

test('context replacement retires only owned voices and resumes the canonical phase on the replacement music destination',async()=>{
  const h=fixture();await h.audio.prepare();const s=state({elapsed:21});h.update(s);const other=graph();h.setPair(other);h.update(s);assert.ok(h.sources.every(n=>n.stops.length&&n.disconnects));await h.audio.whenReady();h.update(s);
  assert.equal(other.sources.length,1);assert.equal(other.sources[0].starts[0].offset,sourceSurroundingsFrame(s).score.phase);assert.ok(other.nodes.some(n=>n.connections.includes(other.destination)));assert.equal(h.audio.snapshot().voices,1);h.audio.dispose();
});

test('reduced motion keeps the real music phase but suppresses unseen release events, and an ended owner stays silent',async()=>{
  const h=fixture();await h.audio.prepare();
  for(let t=0;t<36;t+=.1){h.ctx.currentTime=10+t;h.update(state({elapsed:t}),{reducedMotion:true});}
  const s=h.audio.snapshot();assert.equal(s.played,1);assert.equal(s.impactTails,0);assert.equal(s.music.pieceId,'ensemble');assert.ok(Math.abs(s.score.phase-sourceSurroundingsFrame(state({elapsed:35.9}),{reducedMotion:true}).score.phase)<1e-8);
  h.update(state({status:'completed',elapsed:36}));assert.equal(h.audio.snapshot().voices,0);h.audio.dispose();
});

test('retired asynchronous fetch/decode completions cannot publish buffers, build a graph or start a source',async()=>{
  const completions=[];const h=fixture({fetcher:(url,{signal}={})=>new Promise(resolve=>completions.push({signal,complete:()=>resolve({ok:true,arrayBuffer:async()=>Uint8Array.of(String(url).includes('chaconne')?1:String(url).includes('couperin')?2:String(url).includes('joint-fracture')?4:3).buffer})}))});
  const preparation=h.audio.prepare();await Promise.resolve();await Promise.resolve();assert.equal(completions.length,4);h.audio.dispose();assert.ok(completions.every(v=>v.signal.aborted));for(const pending of completions)pending.complete();assert.equal(await preparation,false);assert.deepEqual(h.audio.snapshot().ready,[]);assert.equal(h.sources.length,0);assert.equal(h.nodes.filter(n=>n.kind==='convolver').length,0);assert.equal(h.update(state()),false);
});

test('unavailable contexts and failed local assets create neither queued effects nor hot fetch retries',async()=>{
  const h=fixture({fetcher:async()=>({ok:false,status:503})});h.setPair(null);assert.equal(await h.audio.prepare(),false);assert.equal(h.update(state()),false);assert.equal(h.sources.length,0);
  const broken=fixture({fetcher:async()=>({ok:false,status:503})});assert.equal(await broken.audio.prepare(),false);for(let i=0;i<8;i++)broken.update(state({elapsed:2+i*.01}));await broken.audio.whenReady();assert.equal(Object.keys(broken.audio.snapshot().errors).length,4);assert.equal(broken.sources.length,0);broken.audio.dispose();h.audio.dispose();
});

test('fake Ellery and other Source passages neither acquire the music bus nor fetch or play this worlds palette',async()=>{
  let acquisitions=0,requests=0;const audio=createSourceSurroundingsAudio({getAudio:()=>{acquisitions++;return graph();},fetcher:async()=>{requests++;throw Error('wrong scene');}});
  for(const phase of ['ellery','false-return','last-reception','source-iv','source'])assert.equal(audio.update({state:state({phase}),ready:true}),false);
  assert.equal(acquisitions,0);assert.equal(requests,0);assert.equal(audio.snapshot().voices,0);audio.dispose();
  const h=fixture();await h.audio.prepare();h.update(state());assert.equal(h.audio.snapshot().musicVoices,1);h.update(state({phase:'last-reception'}));assert.equal(h.audio.snapshot().voices,0);assert.ok(h.sources.every(n=>n.stops.length));h.audio.dispose();
});

test('recordings retain their real identities and existing per-recording rights, with no invented Bach or clapper master',()=>{
  const bach=standingTearRepertoireById('ensemble'),couperin=standingTearRepertoireById('couperin'),bell=JSON.parse(readFileSync(new URL('../public/assets/audio/bell-tower/credits.json',import.meta.url),'utf8'));
  assert.equal(bach.performer,'Victor Eijkhout');assert.match(bach.title,/Chaconne.*12 recorders/);assert.equal(bach.licence,'CC BY 4.0');assert.equal(couperin.performer,'David Joseph');assert.equal(couperin.licence,'CC0 1.0');assert.match(bell.license,/CC0/);assert.match(bell.limitation,/clock-hammer/);assert.match(C.impact.limitation,/not a recorded detached-clapper/);
  for(const piece of [bach,couperin])assert.ok(readFileSync(new URL('../public/'+piece.url,import.meta.url)).length>0);assert.ok(readFileSync(new URL('../public/'+C.impact.url,import.meta.url)).length>0);
});
