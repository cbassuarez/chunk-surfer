import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRestMusic,SOURCE_REST_MUSIC_URL} from '../src/audio/source-rest-music.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({play}={}){
  let protectedState=false;const elements=[],connections=[],errors=[],destination={id:'music-bus'};
  const ctx={state:'running',currentTime:0,createMediaElementSource:el=>({connect:out=>connections.push({el,out}),disconnect(){this.disconnected=true;}})};
  const createElement=()=>{const listeners=new Map(),el={paused:true,currentTime:0,duration:787,plays:0,pauses:0,loop:false,
    play(){this.plays++;this.paused=false;return play?play(this):Promise.resolve();},
    pause(){this.pauses++;this.paused=true;},addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
    removeAttribute(name){if(name==='src')this.src='';},load(){},emit(name){listeners.get(name)?.();}};elements.push(el);return el;};
  const music=createSourceRestMusic({getAudio:()=>({ctx,destination}),protectedAudio:()=>protectedState,createElement,
    urlFor:url=>'/game/'+url,onError:error=>errors.push(error.message)});
  return{music,elements,connections,errors,ctx,protect:value=>{protectedState=value;}};
}

test('a real interaction starts one full stereo stream through the game music bus',async()=>{
  const h=harness();assert.equal(h.music.start(),true);
  assert.equal(h.elements.length,1);assert.equal(h.elements[0].plays,1,'play is called synchronously during the gesture');
  assert.equal(h.elements[0].src,'/game/'+SOURCE_REST_MUSIC_URL);assert.equal(h.elements[0].loop,true);
  assert.deepEqual(h.connections.map(x=>x.out),[{id:'music-bus'}]);
  assert.equal(h.music.snapshot().playing,false,'the old source must remain until play is confirmed');
  await flush();assert.equal(h.music.snapshot().playing,true);assert.equal(h.music.snapshot().duration,787);
  for(let i=0;i<20;i++)h.music.update({active:true});assert.equal(h.elements.length,1);assert.equal(h.elements[0].plays,1);
  h.music.dispose();
});

test('focus and recorder protection pause at the same position and resume once',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];el.currentTime=146.25;
  h.music.update({active:true,paused:true});assert.equal(el.paused,true);assert.equal(h.music.snapshot().playing,false);
  h.music.update({active:true,paused:true});assert.equal(el.plays,1);
  h.music.update({active:true,paused:false});await flush();assert.equal(el.currentTime,146.25);assert.equal(el.plays,2);
  h.protect(true);h.music.update({active:true});assert.equal(el.paused,true);assert.equal(h.music.snapshot().playing,false);
  h.protect(false);h.music.update({active:true});await flush();assert.equal(el.plays,3);assert.equal(el.currentTime,146.25);
  h.music.stop();assert.equal(h.music.snapshot().active,false);assert.equal(el.paused,true);
  h.music.start();await flush();assert.equal(h.elements.length,2);assert.equal(h.elements[1].currentTime,0);h.music.dispose();
});

test('a delayed start cannot resurrect a stopped or disposed seat',async()=>{
  let finish;const h=harness({play:()=>new Promise(resolve=>{finish=resolve;})});h.music.start();const el=h.elements[0];
  h.music.stop();finish();await flush();assert.equal(el.paused,true);assert.equal(h.music.snapshot().playing,false);
  assert.equal(h.music.dispose(),true);assert.equal(h.music.dispose(),false);assert.equal(h.music.start(),false);
});

test('a media failure leaves the old music eligible to continue',async()=>{
  const h=harness({play:()=>Promise.reject(new Error('stream unavailable'))});h.music.start();await flush();
  assert.equal(h.music.snapshot().playing,false);assert.match(h.music.snapshot().failed,/stream unavailable/);
  h.music.update({active:true});assert.equal(h.elements[0].plays,1);assert.equal(h.errors.length,1);h.music.dispose();
});

test('an aborted pending play after focus loss can resume without reporting a failure',async()=>{
  let rejectPlay;const h=harness({play:el=>el.plays===1?new Promise((_,reject)=>{rejectPlay=reject;}):Promise.resolve()});
  h.music.start();h.music.update({active:true,paused:true});
  rejectPlay(Object.assign(new Error('interrupted'),{name:'AbortError'}));await flush();
  assert.equal(h.music.snapshot().failed,null);assert.equal(h.music.snapshot().playing,false);
  h.music.update({active:true,paused:false});await flush();
  assert.equal(h.music.snapshot().playing,true);assert.equal(h.elements[0].plays,2);assert.deepEqual(h.errors,[]);h.music.dispose();
});

test('a protected start creates no audio element until protection clears',async()=>{
  const h=harness();h.protect(true);h.music.start();assert.equal(h.elements.length,0);
  h.protect(false);h.music.update({active:true});await flush();assert.equal(h.elements.length,1);
  assert.equal(h.music.snapshot().playing,true);h.music.dispose();
});

test('waiting media reports a held performance and resumes its original element without a new play request',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];
  el.emit('waiting');assert.equal(h.music.snapshot().buffering,true);assert.equal(h.music.snapshot().playing,false);
  el.emit('playing');assert.equal(h.music.snapshot().buffering,false);assert.equal(h.music.snapshot().playing,true);
  assert.equal(el.plays,1);assert.equal(h.elements.length,1);h.music.dispose();
});

test('a full first pass stays completed through a natural loop, but a backwards seek does not count',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];
  el.currentTime=786.9;h.ctx.currentTime=786.9;el.emit('timeupdate');
  el.currentTime=.02;h.ctx.currentTime=786.92;el.emit('timeupdate');
  assert.equal(h.music.snapshot().completedFirstPass,false,'an instantaneous seek is not a full pass');
  el.currentTime=786.9;h.ctx.currentTime=1573.8;el.emit('timeupdate');
  el.currentTime=.02;h.ctx.currentTime=1573.92;el.emit('timeupdate');
  assert.equal(h.music.snapshot().completedFirstPass,true);h.music.update({active:true,paused:true});
  assert.equal(h.music.snapshot().completedFirstPass,true,'pause does not lose the completed pass');
  h.music.stop();assert.equal(h.music.snapshot().completedFirstPass,false);h.music.dispose();
});

test('a long frame stall still recognizes the wrap when clock and playback agree',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];
  el.currentTime=50;h.ctx.currentTime=50;el.emit('timeupdate');
  el.currentTime=90;h.ctx.currentTime=877;el.emit('timeupdate');
  assert.equal(h.music.snapshot().completedFirstCycle,true);h.music.dispose();
});

test('the audible clock advances across a continuous approach and loop, but not during holds or seeks',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];
  h.ctx.currentTime=10;el.currentTime=10;h.music.update({active:true});
  assert.equal(h.music.snapshot().playedSeconds,10);
  h.music.update({active:true,paused:true});h.ctx.currentTime=110;
  h.music.update({active:true,paused:false});await flush();
  h.ctx.currentTime=112;el.currentTime=12;h.music.update({active:true});
  assert.equal(h.music.snapshot().playedSeconds,12,'the held interval adds no music');
  el.currentTime=400;h.ctx.currentTime=112.1;h.music.update({active:true});
  assert.equal(h.music.snapshot().playedSeconds,12,'a seek is not listening');
  h.ctx.currentTime=498.1;el.currentTime=786;h.music.update({active:true});
  h.ctx.currentTime=500.1;el.currentTime=1;h.music.update({active:true});
  assert.equal(h.music.snapshot().playedSeconds,400,'a natural wrap keeps the same accumulated clock');
  h.music.dispose();
});

test('the stereo stream feeds the existing Source room character and measures its real signal',async()=>{
  const h=harness(),nodes=[];let amplitude=.08;
  const node=kind=>{const n={kind,connections:[],disconnected:false,connect(other){this.connections.push(other);return other;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  h.ctx.sampleRate=1000;
  h.ctx.createGain=()=>Object.assign(node('gain'),{gain:{value:1}});
  h.ctx.createAnalyser=()=>Object.assign(node('analyser'),{fftSize:0,getFloatTimeDomainData(samples){samples.fill(amplitude);}});
  h.ctx.createConvolver=()=>Object.assign(node('convolver'),{buffer:null,normalize:true});
  h.ctx.createBuffer=(channels,length,rate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{numberOfChannels:channels,length,sampleRate:rate,getChannelData:i=>data[i]};};
  h.music.start();await flush();let snap=h.music.snapshot(),reverb=nodes.find(n=>n.kind==='convolver');
  assert.equal(snap.atmosphere,true);assert.equal(snap.reverbSeconds,6.8);assert.equal(reverb.buffer.numberOfChannels,2);
  assert.equal(reverb.buffer.length,6800);assert.equal(reverb.normalize,false);assert.ok(snap.signal>0&&snap.signal<1);
  const first=snap.signal;amplitude=0;h.ctx.currentTime=1;snap=h.music.snapshot();assert.ok(snap.signal<first,'signal decays with the real input');
  h.music.update({active:true,paused:true});assert.equal(h.music.snapshot().signal,0);assert.equal(reverb.buffer,null,'pause retires the old reverb tail');
  h.music.update({active:true});await flush();assert.ok(reverb.buffer,'resume restores the same room impulse');
  h.music.dispose();assert.ok(nodes.every(n=>n.disconnected));
});

test('a room-impulse allocation failure keeps the dry performance available',async()=>{
  const h=harness(),gain=()=>({gain:{value:1},connect(){},disconnect(){}});
  h.ctx.createGain=gain;h.ctx.createConvolver=()=>({buffer:null,connect(){},disconnect(){}});
  h.ctx.createBuffer=()=>{throw Error('impulse allocation failed');};
  h.music.start();await flush();assert.equal(h.music.snapshot().playing,true);
  assert.equal(h.music.snapshot().atmosphere,false);assert.equal(h.music.snapshot().failed,null);h.music.dispose();
});

test('the ending retains the same performance through a pause, then never restarts it after its natural end',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];el.currentTime=501.25;
  assert.equal(h.music.finishAfterCycle(),true);assert.equal(el.loop,false);assert.equal(h.music.snapshot().finishAtEnd,true);
  h.music.update({active:true,paused:true});assert.equal(el.currentTime,501.25);
  h.music.update({active:true,paused:false});await flush();assert.equal(el.currentTime,501.25);assert.equal(el.plays,2);
  el.currentTime=787;el.paused=true;el.ended=true;el.emit('ended');
  assert.equal(h.music.snapshot().ended,true);assert.equal(h.music.snapshot().loading,false);
  for(let i=0;i<10;i++)h.music.update({active:true});
  assert.equal(el.plays,2,'the end event does not restart the performance');assert.equal(h.elements.length,1);
  h.music.stop();assert.equal(h.music.snapshot().ended,false);
  h.music.start();await flush();assert.equal(h.elements.length,2);assert.equal(h.elements[1].loop,true,'a new sitting gets a fresh looping player');
  h.music.dispose();
});

test('an ended media element is not restarted before its ended event is delivered',async()=>{
  const h=harness();h.music.start();await flush();const el=h.elements[0];h.music.finishAfterCycle();
  el.currentTime=787;el.paused=true;el.ended=true;h.music.update({active:true});
  assert.equal(el.plays,1);assert.equal(h.music.snapshot().ended,true);h.music.dispose();
});

test('finish-after-cycle survives a protected start before the media element exists',async()=>{
  const h=harness();h.protect(true);h.music.start();assert.equal(h.elements.length,0);
  assert.equal(h.music.finishAfterCycle(),true);h.protect(false);h.music.update({active:true});await flush();
  assert.equal(h.elements.length,1);assert.equal(h.elements[0].loop,false);assert.equal(h.music.snapshot().playing,true);h.music.dispose();
});

test('a late play resolution cannot resurrect a terminal performance',async()=>{
  let finish;const h=harness({play:()=>new Promise(resolve=>{finish=resolve;})});h.music.start();const el=h.elements[0];
  h.music.finishAfterCycle();el.currentTime=787;el.paused=true;el.ended=true;el.emit('ended');finish();await flush();
  assert.equal(h.music.snapshot().ended,true);assert.equal(h.music.snapshot().playing,false);
  h.music.update({active:true});assert.equal(el.plays,1);h.music.dispose();
});

test('a late rejected play request cannot turn a finished performance into an error',async()=>{
  let reject;const h=harness({play:()=>new Promise((_,fail)=>{reject=fail;})});h.music.start();const el=h.elements[0];
  h.music.finishAfterCycle();el.currentTime=787;el.paused=true;el.ended=true;el.emit('ended');reject(new Error('late failure'));await flush();
  assert.equal(h.music.snapshot().ended,true);assert.equal(h.music.snapshot().failed,null);assert.deepEqual(h.errors,[]);h.music.dispose();
});
