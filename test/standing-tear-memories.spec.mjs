import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createStandingTearAudio} from '../src/audio/standing-tear.js';
import {STANDING_TEAR_REPERTOIRE,standingTearMemoryPhase,standingTearMemoryPulse} from '../src/data/standing-tear-memory-score.js';
import {CREDITS} from '../src/data/credits.js';

function fixture({fetchImpl,hrtf=true}={}){
  const nodes=[],destination={id:'existing-master'},bufferAssignments=[];
  const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;},linearRampToValueAtTime(value,at){this.value=value;this.rampAt=at;},cancelScheduledValues(){}});
  const node=(kind,extra={})=>{const value={kind,connections:[],disconnects:0,connect(into){this.connections.push(into);return into;},disconnect(){this.disconnects++;},...extra};nodes.push(value);return value;};
  const context={currentTime:10,sampleRate:48000,state:'running',
    createBuffer(numberOfChannels,length,sampleRate){const channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));return{numberOfChannels,length,sampleRate,duration:length/sampleRate,getChannelData:i=>channels[i]};},
    createGain:()=>node('gain',{gain:parameter()}),createStereoPanner:()=>node('panner',{pan:parameter()}),createBiquadFilter:()=>node('filter',{frequency:parameter()}),
    createWaveShaper:()=>node('limiter'),createConvolver:()=>{const value=node('convolver',{normalize:true,_buffer:null});Object.defineProperty(value,'buffer',{get(){return this._buffer;},set(buffer){bufferAssignments.push({buffer,normalize:this.normalize});this._buffer=buffer;}});return value;},
    createOscillator:()=>node('oscillator',{frequency:parameter(),start(){},stop(){}}),
    createBufferSource:()=>node('recording',{starts:[],stops:[],start(at,offset){this.starts.push({at,offset});},stop(at){this.stops.push(at);}}),
    async decodeAudioData(bytes){const piece=STANDING_TEAR_REPERTOIRE.find(item=>item.id===(new Uint8Array(bytes)[0]===1?'couperin':'ensemble')),buffer=this.createBuffer(1,Math.round(piece.duration*32000),32000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=.37*Math.sin(i*.043)+.11*Math.sin(i*.137);return buffer;},
  };
  if(hrtf)context.createPanner=()=>node('hrtf',{positionX:parameter(),positionY:parameter(),positionZ:parameter()});
  Object.defineProperty(context,'listener',{get(){throw Error('Standing Tear must not acquire or mutate the shared listener.');}});
  const audio=createStandingTearAudio({getAudio:()=>({context,destination}),fetchImpl:fetchImpl|| (async url=>({ok:true,arrayBuffer:async()=>Uint8Array.of(String(url).includes('couperin')?1:2).buffer}))});
  const memories=STANDING_TEAR_REPERTOIRE.map((piece,i)=>({id:piece.id,awake:false,awakeSeconds:0,musicSeconds:0,pressure:0,source:{x:(i-1)*9,y:.35,z:i===1?27:8},live:false}));
  const frame={phase:'arrival',elapsed:0,camera:{eye:[0,1.62,0],yaw:0},memories,audio:{memories}};
  return{audio,context,frame,nodes,destination,bufferAssignments,recordings:()=>nodes.filter(node=>node.kind==='recording')};
}

test('actual decoded playback buffers use three amplitude-quantized profiles before fixed-source spatialization and long convolution',async()=>{
  const h=fixture();assert.equal(await h.audio.prepare(),true);h.audio.update(h.frame,{dt:0});
  const snapshot=h.audio.snapshot();assert.deepEqual(snapshot.recordings.ready.sort(),['couperin','ensemble','solo']);assert.equal(h.recordings().length,3);
  for(const piece of STANDING_TEAR_REPERTOIRE){const dsp=snapshot.dsp.memories[piece.id];assert.equal(dsp.kind,'signed-pcm-amplitude-quantisation');assert.equal(dsp.bitDepth,piece.bitDepth);assert.equal(dsp.effectiveSampleRate,Math.min(32000===dsp.sampleRate?32000:48000,piece.effectiveSampleRate));assert.equal(dsp.processedBeforeSpatialisation,true);assert.ok(dsp.outputPeak>0&&dsp.outputPeak<=1);assert.ok(dsp.observedAmplitudeLevels<=2**piece.bitDepth);}
  assert.equal(snapshot.dsp.reverbDecay,6.8);assert.ok(snapshot.dsp.reverbWet>.8);assert.equal(snapshot.dsp.spatializedBeforeReverb,true);assert.equal(snapshot.dsp.limiterCeiling,.84);
  assert.ok(h.bufferAssignments.filter(item=>item.buffer).every(item=>item.normalize===false),'normalization must be disabled before each IR assignment, including initial entry');
  const convolver=h.nodes.find(node=>node.kind==='convolver');for(const source of h.recordings()){const filter=source.connections[0],gain=filter.connections[0],pan=gain.connections[0];assert.equal(pan.kind,'hrtf');assert.equal(pan.panningModel,'HRTF');assert.equal(pan.rolloffFactor,0);assert.ok(pan.connections.includes(convolver));assert.ok(pan.connections.some(node=>node.kind==='gain'));}
  h.audio.destroy();
});

test('HRTF sources distinguish front, back and height in the actual camera yaw/pitch basis without moving the shared listener',async()=>{
  const h=fixture();await h.audio.prepare();h.frame.camera={eye:[0,0,0],yaw:0,pitch:0};
  h.frame.memories[0].source={x:0,y:0,z:-8};h.frame.memories[1].source={x:0,y:0,z:8};h.frame.memories[2].source={x:0,y:6,z:0};h.audio.update(h.frame,{dt:0});
  let voices=h.audio.snapshot().recordings.voices;assert.deepEqual(voices.map(voice=>voice.relativeXYZ),[[0,0,-8],[0,0,8],[0,6,0]]);assert.ok(voices.every(voice=>voice.spatialization==='HRTF'));
  const hr=h.nodes.filter(node=>node.kind==='hrtf');assert.deepEqual(hr.map(node=>[node.positionX.value,node.positionY.value,node.positionZ.value]),voices.map(voice=>voice.relativeXYZ));
  h.frame.camera.yaw=Math.PI/2;h.audio.update(h.frame,{dt:0});voices=h.audio.snapshot().recordings.voices;assert.ok(Math.abs(voices[0].relativeXYZ[0]+8)<1e-8);assert.ok(Math.abs(voices[0].relativeXYZ[2])<1e-8);assert.ok(voices[1].relativeXYZ[0]>0);
  h.frame.camera.yaw=0;h.frame.camera.pitch=Math.PI/2;h.audio.update(h.frame,{dt:0});voices=h.audio.snapshot().recordings.voices;assert.ok(Math.abs(voices[2].relativeXYZ[1])<1e-8);assert.ok(Math.abs(voices[2].relativeXYZ[2]+6)<1e-8,'looking up brings the elevated source in front');
  assert.equal(h.recordings().length,3,'turning the camera never restarts a phrase');h.audio.destroy();
  const fallback=fixture({hrtf:false});await fallback.audio.prepare();fallback.audio.update(fallback.frame,{dt:0});assert.ok(fallback.audio.snapshot().recordings.voices.every(voice=>voice.spatialization==='stereo'));assert.equal(fallback.nodes.filter(node=>node.kind==='panner').length,3);fallback.audio.destroy();
});

test('teasers awaken and intensify without restarting or moving their musical memories; retreat and pause preserve phrase',async()=>{
  const h=fixture();await h.audio.prepare();h.audio.update(h.frame,{dt:0});const starts=h.recordings().slice(),quiet=h.audio.snapshot().recordings.voices.find(item=>item.id==='ensemble').gain;
  h.context.currentTime+=.1;h.frame.elapsed=.1;for(const memory of h.frame.memories){memory.musicSeconds=.1;memory.awake=true;memory.pressure=1;}h.audio.update(h.frame,{dt:.1});
  assert.equal(h.recordings().length,3);assert.ok(h.audio.snapshot().recordings.voices.find(item=>item.id==='ensemble').gain>quiet*5);
  const source=h.audio.snapshot().recordings.voices.find(item=>item.id==='ensemble').source;h.frame.camera.eye=[0,1.62,-12];h.frame.camera.yaw=Math.PI;h.audio.update(h.frame,{dt:0});assert.deepEqual(h.audio.snapshot().recordings.voices.find(item=>item.id==='ensemble').source,source);assert.equal(h.recordings().length,3);
  h.audio.setPaused(true);assert.equal(h.audio.snapshot().active,0);assert.ok(starts.every(node=>node.stops.length===1));assert.equal(h.nodes.find(node=>node.kind==='convolver').buffer,null);
  h.context.currentTime+=20;h.audio.update(h.frame,{dt:20,paused:true});h.audio.update(h.frame,{dt:0});assert.equal(h.recordings().length,6);
  const resumed=h.recordings().slice(3);for(let i=0;i<resumed.length;i++)assert.ok(Math.abs(resumed[i].starts[0].offset-standingTearMemoryPhase(h.frame.memories[i].id,.1))<1e-7);
  assert.ok(h.bufferAssignments.filter(item=>item.buffer).every(item=>!item.normalize));h.audio.destroy();
});

test('the full music-and-room bus fades into the authored black cut and retired decoding cannot acquire a new owner',async()=>{
  const h=fixture();await h.audio.prepare();h.audio.update(h.frame,{dt:0});const limiter=h.nodes.find(node=>node.kind==='limiter'),bus=h.nodes.find(node=>node.connections.includes(limiter));
  h.frame.phase='ending';h.frame.endingSeconds=.45;h.audio.update(h.frame,{dt:0});assert.ok(Math.abs(bus.gain.value-.35)<1e-8);h.frame.endingSeconds=.9;h.audio.update(h.frame,{dt:0});assert.equal(bus.gain.value,0);h.audio.destroy();assert.equal(h.audio.snapshot().active,0);assert.equal(h.audio.snapshot().closed,true);assert.ok(bus.gain.rampAt>=h.context.currentTime);
  const completions=[];const delayed=fixture({fetchImpl:url=>new Promise(resolve=>{completions.push(()=>resolve({ok:true,arrayBuffer:async()=>Uint8Array.of(String(url).includes('couperin')?1:2).buffer}));})});const pending=delayed.audio.prepare();await Promise.resolve();await Promise.resolve();delayed.audio.destroy();assert.equal(completions.length,2);for(const complete of completions)complete();assert.equal(await pending,false);
  // Both independent decodes finish after retirement. Neither completion can
  // create an audible source or publish a processed recording to a new owner.
  assert.equal(delayed.audio.update(delayed.frame,{dt:1}),false);assert.equal(delayed.recordings().length,0);assert.deepEqual(delayed.audio.snapshot().recordings.ready,['solo']);
});

test('the shipped Chaconne and public credits retain recording identity, primary permission, derivative changes and measured envelopes',()=>{
  const bach=STANDING_TEAR_REPERTOIRE.find(piece=>piece.id==='ensemble'),couperin=STANDING_TEAR_REPERTOIRE.find(piece=>piece.id==='couperin');
  assert.match(bach.title,/Chaconne.*12 recorders/);assert.equal(bach.performer,'Victor Eijkhout');assert.equal(bach.licence,'CC BY 4.0');assert.match(couperin.title,/toucher le clavecin/);
  const credits=CREDITS.find(section=>section.heading==='Standing Tear — Retained Music').lines.join('\n');for(const required of[bach.attribution,bach.source,bach.licenceUrl,bach.changes])assert.ok(credits.includes(required),required);
  const bytes=readFileSync(new URL('../public/audio/standing-tear/bach-bwv1004-chaconne-recorders.mp3',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),'402f39f359c624d4022857f5cb99dd710f43601717df0a6c2c0eb9f39fd2c93a');
  for(const piece of STANDING_TEAR_REPERTOIRE){const values=Array.from({length:400},(_,i)=>standingTearMemoryPulse(piece.id,i*.037));assert.ok(values.every(value=>value>=0&&value<=1));assert.ok(new Set(values.map(value=>value.toFixed(3))).size>8);assert.ok(Math.abs(standingTearMemoryPulse(piece.id,.2)-standingTearMemoryPulse(piece.id,.2+piece.duration))<1e-10);}
});
