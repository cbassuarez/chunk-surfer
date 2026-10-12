import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutskirtsStreetAudio,outskirtsStreetPlacement,FOLD_SAMPLE_IDS} from '../src/audio/outskirts-street.js';
import {readFileSync} from 'node:fs';

function fakeAudio({panner=true}={}){
  const nodes=[],destination={name:'owned-world-sfx'};
  const param=()=>({value:0,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}});
  const node=kind=>{
    const value={kind,connections:[],disconnected:false,connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;},gain:param(),frequency:param(),Q:param(),pan:param()};
    if(kind==='noise'||kind==='tone'){value.starts=[];value.stops=[];value.start=(...args)=>value.starts.push(args);value.stop=at=>value.stops.push(at);}
    nodes.push(value);return value;
  };
  const ctx={currentTime:2,state:'running',sampleRate:8000,createGain:()=>node('gain'),createOscillator:()=>node('tone'),createBufferSource:()=>node('noise'),createBiquadFilter:()=>node('filter'),createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)})};
  if(panner)ctx.createStereoPanner=()=>node('pan');
  return {ctx,nodes,destination,getAudio:()=>({ctx,destination})};
}
const listener={x:0,z:0,yaw:0};

test('street sources follow world position and facing rather than fixed screen stereo',()=>{
  const east=outskirtsStreetPlacement({x:5,z:0},listener);
  assert.ok(east.pan>.8);
  assert.ok(Math.abs(outskirtsStreetPlacement({x:5,z:0},{...listener,yaw:Math.PI/2}).pan)<1e-10);
  assert.ok(outskirtsStreetPlacement({x:-5,z:0},listener).pan<-.8);
  assert.equal(outskirtsStreetPlacement({x:0,z:-80},listener).gain,0);
  assert.ok(outskirtsStreetPlacement({x:0,z:-2},listener).gain>outskirtsStreetPlacement({x:0,z:-20},listener).gain);
});

test('continuous sources are bounded, move with the listener, and detach when the street is gone',()=>{
  const audio=fakeAudio(),sound=createOutskirtsStreetAudio(audio);
  const frame={beds:[{id:'lodge',kind:'lodge',x:5,z:0,gain:1},{id:'bus',kind:'bus',x:-6,z:-2,gain:.5}]};
  sound.update(frame,{listener});
  assert.equal(sound.snapshot().beds,2);
  const count=audio.nodes.length;
  sound.update(frame,{listener:{...listener,yaw:Math.PI/2}});
  assert.equal(audio.nodes.length,count,'render frames must not duplicate loop sources');
  assert.ok(Math.abs(audio.nodes.find(node=>node.kind==='pan').pan.value)<1e-10);
  assert.ok(audio.nodes.some(node=>node.connections.includes(audio.destination)));
  sound.update({beds:[],events:[]},{listener});
  assert.equal(sound.snapshot().voices,0);
  assert.ok(audio.nodes.every(node=>node.disconnected));
  assert.ok(audio.nodes.filter(node=>node.starts).every(node=>node.stops.length===1));
});

test('events are finite, delivered once, and pause cancels future sound without replaying it',()=>{
  const audio=fakeAudio(),sound=createOutskirtsStreetAudio(audio);
  const event={id:'hatch-first',cue:'hatch-impact',x:0,z:-2,strength:.7};
  sound.update({events:[event]},{listener});
  assert.equal(sound.snapshot().voices,1);
  const count=audio.nodes.length;
  sound.update({events:[event]},{listener});assert.equal(audio.nodes.length,count);
  assert.ok(audio.nodes.filter(node=>node.starts).every(node=>node.stops[0]-node.starts[0][0]<.5));
  sound.pause();assert.equal(sound.snapshot().voices,0);
  assert.ok(audio.nodes.every(node=>node.disconnected));
  audio.ctx.currentTime=50;sound.resume();sound.update({events:[event]},{listener});
  assert.equal(sound.snapshot().voices,0,'a physical action is not replayed after pause');
  sound.update({events:[{...event,id:'hatch-second'}]},{listener});
  for(const source of audio.nodes.filter(node=>node.starts&&!node.disconnected))source.onended?.();
  assert.equal(sound.snapshot().voices,0);
});

test('context replacement and disposal cannot leave an old graph or bypass the supplied volume bus',()=>{
  const first=fakeAudio(),second=fakeAudio({panner:false});let current=first;
  const sound=createOutskirtsStreetAudio({getAudio:()=>current.getAudio()});
  const frame={beds:[{id:'car',kind:'car',x:0,z:-1,gain:1}]};
  sound.update(frame,{listener});current=second;sound.update(frame,{listener});
  assert.ok(first.nodes.every(node=>node.disconnected));assert.equal(sound.snapshot().beds,1);
  second.ctx.state='suspended';sound.destroy();sound.destroy();
  assert.ok(second.nodes.every(node=>node.disconnected));
  assert.equal(sound.update(frame,{listener}),false);assert.equal(sound.snapshot().voices,0);
  const absent=createOutskirtsStreetAudio();assert.equal(absent.update(frame),false);absent.destroy();
});

test('Fold uses finite recorded human effort, shares the world bus and never replays spent cues',async()=>{
  const audio=fakeAudio(),loaded=[];
  audio.ctx.decodeAudioData=async()=>({duration:1});
  const sound=createOutskirtsStreetAudio({...audio,loadSample:async id=>{loaded.push(id);return {duration:1.5,id};}});
  sound.update({events:[]},{listener});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(loaded,[...FOLD_SAMPLE_IDS]);
  assert.equal(sound.snapshot().samplesReady,8);
  const event={id:'r6:fold-effort:2',cue:'fold-effort',variant:2,x:1,z:-2,strength:.8};
  sound.update({events:[event]},{listener});
  const sources=audio.nodes.filter(node=>node.starts);
  assert.equal(sources.length,2,'an effort contains one human performance and one garment recording');
  assert.ok(sources.some(node=>node.buffer.id==='fold-effort-c'));
  assert.ok(sources.every(node=>node.buffer.id&&node.loop===false&&node.stops[0]-node.starts[0][0]<2));
  assert.ok(audio.nodes.some(node=>node.connections.includes(audio.destination)));
  const count=audio.nodes.length;sound.update({events:[event]},{listener});assert.equal(audio.nodes.length,count);
  sound.pause();assert.equal(sound.snapshot().voices,0);
  sound.resume();sound.update({events:[event]},{listener});assert.equal(sound.snapshot().voices,0);
  sound.destroy();assert.ok(audio.nodes.every(node=>node.disconnected));
});

test('late sample loads cannot create voices after destruction or leak across audio contexts',async()=>{
  const first=fakeAudio(),second=fakeAudio();
  first.ctx.decodeAudioData=second.ctx.decodeAudioData=async()=>({});
  let current=first;const pending=[];
  const sound=createOutskirtsStreetAudio({getAudio:()=>current.getAudio(),loadSample:()=>new Promise(resolve=>pending.push(resolve))});
  sound.update({},{listener});await new Promise(resolve=>setImmediate(resolve));
  current=second;sound.update({},{listener});await new Promise(resolve=>setImmediate(resolve));
  pending.slice(0,8).forEach(resolve=>resolve({duration:1}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sound.snapshot().samplesReady,0);
  sound.destroy();pending.slice(8).forEach(resolve=>resolve({duration:1}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(sound.snapshot().samplesReady,0);assert.equal(sound.snapshot().voices,0);
});

test('shipped Fold sample manifest names real mono PCM excerpts with credited sources',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/audio/outskirts/fold-credits.json',import.meta.url)));
  assert.equal(manifest.clips.length,FOLD_SAMPLE_IDS.length);
  assert.ok(manifest.sources.every(source=>source.license==='CC0-1.0'&&source.sha256.length===64));
  for(const clip of manifest.clips){
    const data=readFileSync(new URL('../public/'+clip.url,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
    assert.ok(clip.duration>.3&&clip.duration<2);
  }
});
