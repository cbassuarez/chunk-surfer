import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioContactAudio, RADIO_CONTACT_EGG, RADIO_CONTACT_VOICE_LIMIT } from '../src/audio/radio-contact-audio.js';

function fixture(){
  const nodes=[],hardware={name:'hardware'},destination={name:'provided-sfx-bus'},loaded=[];
  const param=()=>({value:0,calls:[],setValueAtTime(value,at){this.value=value;this.calls.push(['set',value,at]);},
    linearRampToValueAtTime(value,at){this.value=value;this.calls.push(['ramp',value,at]);}});
  const node=kind=>{
    const n={kind,connections:[],gain:param(),frequency:param(),Q:param(),playbackRate:param(),disconnected:false,
      connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;}};
    if(kind==='source'){n.starts=[];n.stops=[];n.start=(...args)=>n.starts.push(args);n.stop=at=>n.stops.push(at);}
    nodes.push(n);return n;
  };
  let protectedAudio=false,resumeCalls=0;
  const buffer={duration:30.072};
  const ctx={state:'running',currentTime:4,sampleRate:8000,destination:hardware,
    createGain:()=>node('gain'),createBufferSource:()=>node('source'),createBiquadFilter:()=>node('filter'),
    createBuffer:(_n,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)}),
    resume(){resumeCalls++;return Promise.resolve();},decodeAudioData:async()=>buffer};
  const options={getAudio:()=>({ctx,destination}),getProtected:()=>protectedAudio,
    loadBuffer:async(url,context)=>{loaded.push({url,context});return buffer;}};
  return {ctx,nodes,hardware,destination,loaded,buffer,options,
    protect:value=>{protectedAudio=value;},resumeCalls:()=>resumeCalls,
    sources:()=>nodes.filter(n=>n.kind==='source'),advance:seconds=>{ctx.currentTime+=seconds;}};
}

test('physical contacts are finite, press-state driven, quiet and routed only through the supplied mixer',()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);
  assert.equal(sound.control('toString'),false);assert.equal(sound.control('missing'),false);
  assert.equal(sound.control('release'),false,'an unheld key has no release contact');
  assert.equal(sound.control('ptt-down'),true);assert.equal(sound.control('press'),false,'holding cannot retrigger');
  assert.equal(sound.control('ptt-up'),true);assert.equal(sound.control('release'),false);
  for(const kind of ['channel','battery','denied']){f.advance(.1);assert.equal(sound.control(kind,{direction:-1}),true);}
  const live=f.sources().filter(s=>!s.disconnected);
  assert.ok(live.length<=RADIO_CONTACT_VOICE_LIMIT);
  for(const source of f.sources()){
    assert.equal(source.loop,false);assert.ok(source.stops[0]-source.starts[0][0]<.09);
    assert.ok(source.starts[0][2]<=source.buffer.duration);
  }
  assert.ok(f.nodes.some(n=>n.connections.includes(f.destination)));
  assert.ok(f.nodes.every(n=>!n.connections.includes(f.hardware)));
  for(const gain of f.nodes.filter(n=>n.kind==='gain'))
    assert.ok(gain.gain.calls.every(([,value])=>value>=0&&value<=.048));
  for(const source of live)source.onended();
  assert.equal(sound.snapshot().nodes,0);assert.equal(sound.snapshot().voices,0);
  assert.equal(f.resumeCalls(),0);sound.stop();
});

test('the uncommanded PTT fault is finite and cannot acquire or release an ordinary held control',()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);
  assert.equal(sound.control('fault'),true);
  assert.equal(sound.snapshot().held,false,'an authored key sink has no user-owned release');
  assert.equal(sound.control('release'),false,'there is no phantom release after the fault');
  assert.equal(sound.control('press'),true,'the next real knob or button press is audible');
  assert.equal(sound.snapshot().held,true);
  assert.equal(sound.control('fault'),true,'the fault also cannot release a separately held control');
  assert.equal(sound.snapshot().held,true);
  assert.equal(sound.control('press'),false,'ordinary held-input deduplication still applies');
  assert.equal(sound.control('release'),true);assert.equal(sound.snapshot().held,false);
  for(const source of f.sources()){
    assert.equal(source.loop,false);assert.ok(source.stops[0]-source.starts[0][0]<.09);
  }
  sound.control('press');sound.control('fault');sound.pause();
  assert.equal(sound.snapshot().held,false);assert.equal(sound.snapshot().voices,0);
  assert.ok(f.nodes.every(node=>node.disconnected));
  sound.resume();assert.equal(sound.control('press'),true);assert.equal(sound.control('release'),true);
  sound.stop();assert.equal(sound.snapshot().held,false);assert.equal(sound.control('fault'),false);
});

test('mechanical contacts remain on the supplied SFX route while the receiver volume has its own output',async()=>{
  const f=fixture(),mechanical={name:'unattenuated-physical-controls'};
  const sound=createRadioContactAudio({...f.options,getControlAudio:()=>({ctx:f.ctx,destination:mechanical})});
  assert.equal(sound.control('press'),true);
  assert.ok(f.nodes.some(n=>n.connections.includes(mechanical)));assert.ok(!f.nodes.some(n=>n.connections.includes(f.destination)));
  assert.equal(await sound.egg(),true);assert.ok(f.nodes.some(n=>n.connections.includes(f.destination)));
  assert.ok(!f.nodes.some(n=>n.connections.includes(f.hardware)));sound.stop();
});

test('a held or spun channel control cannot accumulate unbounded audio',()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);
  for(let n=0;n<200;n++)sound.control('channel',{direction:n%2?1:-1});
  assert.equal(f.sources().length,1,'same-frame repetition is one detent');
  for(let n=0;n<30;n++){f.advance(.036);sound.control('channel');}
  assert.equal(sound.snapshot().voices,RADIO_CONTACT_VOICE_LIMIT);
  assert.ok(f.sources().filter(s=>s.disconnected).every(s=>s.onended===null));sound.stop();
  assert.ok(f.nodes.every(n=>n.disconnected));assert.equal(sound.control('press'),false);
});

test('warm decodes once without playing; egg uses the exact bounded original fragment with speaker filtering and headroom',async()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);let complete=0;
  const jobs=[sound.warm(),sound.warm()];assert.equal(jobs[0],jobs[1]);
  assert.equal(await jobs[0],true);assert.equal(f.loaded.length,1);assert.equal(f.sources().length,0);
  assert.match(f.loaded[0].url,/audio\/game\/radio_breaks-scream\.mp3$/);
  assert.equal(f.loaded[0].context,f.ctx);
  assert.equal(await sound.egg({onComplete:()=>complete++}),true);
  const source=f.sources()[0],start=source.starts[0];
  assert.equal(source.buffer,f.buffer);assert.equal(source.loop,false);
  assert.deepEqual(start,[4,RADIO_CONTACT_EGG.offset,RADIO_CONTACT_EGG.seconds]);
  assert.ok(source.stops[0]-start[0]<=2.5);
  assert.deepEqual(f.nodes.filter(n=>n.kind==='filter').map(n=>[n.type,n.frequency.value]),
    [['highpass',320],['lowpass',3400]]);
  assert.ok(f.nodes.some(n=>n.channelCount===1&&n.channelCountMode==='explicit'
    &&n.channelInterpretation==='speakers'),'the single speaker has no inherited stereo width');
  const gains=f.nodes.filter(n=>n.kind==='gain').flatMap(n=>n.gain.calls.map(c=>c[1]));
  assert.equal(Math.max(...gains),.22);assert.equal(gains.at(-1),0);
  assert.ok(Math.pow(10,.29/20)*Math.max(...gains)<.25,'the measured positive source true peak has substantial digital headroom');
  assert.equal(await sound.egg(),false,'the same voice cannot be stacked');
  const ended=source.onended;ended();ended();
  assert.equal(complete,1);assert.equal(sound.snapshot().eggCompleted,true);
  assert.equal(sound.snapshot().nodes,0);assert.equal(await sound.egg(),false,'completed delivery does not replay');
  sound.stop();
});

test('tune-away, pause and exit immediately detach the egg, never complete it, and never replay it on resume',async()=>{
  for(const cancellation of ['stopEgg','pause','stop']){
    const f=fixture(),sound=createRadioContactAudio(f.options);let complete=0;
    assert.equal(await sound.egg({onComplete:()=>complete++}),true);
    const source=f.sources()[0],staleEnded=source.onended;
    sound[cancellation]();staleEnded();
    assert.equal(sound.snapshot().nodes,0,cancellation);assert.equal(sound.snapshot().voices,0);
    assert.equal(complete,0);assert.equal(sound.snapshot().eggCompleted,false);
    assert.ok(f.nodes.every(n=>n.disconnected));assert.equal(source.onended,null);
    const starts=f.sources().length;f.advance(300);sound.resume();
    assert.equal(f.sources().length,starts,'resume owns no replay');assert.equal(await sound.egg(),false);
    sound.stop();sound.stop();
  }
});

test('a protection change during asynchronous decoding prevents playback, even if loading succeeds',async()=>{
  const f=fixture();let resolve;const sound=createRadioContactAudio({...f.options,
    loadBuffer:()=>new Promise(r=>{resolve=r;})});
  const result=sound.egg();await Promise.resolve();f.protect(true);resolve(f.buffer);
  assert.equal(await result,false);assert.equal(f.sources().length,0);
  assert.equal(sound.snapshot().eggStarted,false);assert.equal(sound.control('press'),false);
  f.protect(false);assert.equal(await sound.egg(),true,'a blocked attempt did not spend a delivery');sound.stop();
});

test('late decode completion after lower, pause or exit cannot start a sound or restore an obsolete cache',async()=>{
  for(const cancellation of ['stopEgg','pause','stop']){
    const f=fixture();let resolve,signal;const sound=createRadioContactAudio({...f.options,
      loadBuffer:(_url,_ctx,options)=>{signal=options.signal;return new Promise(r=>{resolve=r;});}});
    const result=sound.egg();await Promise.resolve();sound[cancellation]();
    assert.equal(signal.aborted,true);resolve(f.buffer);
    assert.equal(await result,false);assert.equal(f.sources().length,0);
    assert.equal(sound.snapshot().ready,false);assert.equal(sound.snapshot().loading,false);
    sound.resume();assert.equal(f.sources().length,0);sound.stop();
  }
});

test('changing context or mixer during decode cannot deliver a stale fragment through the new owner',async()=>{
  const a=fixture(),b=fixture();let owner=a,resolve;
  const sound=createRadioContactAudio({getAudio:()=>({ctx:owner.ctx,destination:owner.destination}),
    loadBuffer:()=>new Promise(r=>{resolve=r;})});
  const result=sound.egg();await Promise.resolve();owner=b;resolve(a.buffer);
  assert.equal(await result,false);assert.equal(a.sources().length,0);assert.equal(b.sources().length,0);
  assert.equal(sound.snapshot().ready,false);sound.stop();
});

test('closed, suspended, protected and failed audio never resumes a context or schedules a later delivery',async()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);
  for(const state of ['suspended','closed']){
    f.ctx.state=state;assert.equal(await sound.warm(),false);assert.equal(await sound.egg(),false);
    assert.equal(sound.control('press'),false);
  }
  f.ctx.state='running';f.protect(true);assert.equal(await sound.egg(),false);assert.equal(f.loaded.length,0);
  sound.pause();assert.equal(await sound.warm(),false);sound.resume();
  assert.equal(f.sources().length,0);assert.equal(f.resumeCalls(),0);sound.stop();
  for(const loadBuffer of [async()=>{throw Error('missing');},async()=>({duration:1}),async()=>null]){
    const g=fixture(),broken=createRadioContactAudio({...g.options,loadBuffer});
    assert.equal(await broken.egg(),false);assert.equal(g.sources().length,0);
    assert.equal(broken.snapshot().eggStarted,false);broken.stop();
  }
  const noBus=createRadioContactAudio();assert.equal(await noBus.egg(),false);noBus.stop();
  const badGate=createRadioContactAudio({...fixture().options,getProtected:()=>{throw Error('no state');}});
  assert.equal(await badGate.egg(),false);assert.equal(badGate.control('press'),false);badGate.stop();
});

test('a failed source.start is cleaned without spending the egg or invoking completion',async()=>{
  const f=fixture(),create=f.ctx.createBufferSource;let fail=true,complete=0;
  f.ctx.createBufferSource=()=>{const n=create();if(fail)n.start=()=>{throw Error('unavailable');};return n;};
  const sound=createRadioContactAudio(f.options);
  assert.equal(await sound.egg({onComplete:()=>complete++}),false);
  assert.equal(sound.snapshot().nodes,0);assert.equal(sound.snapshot().eggStarted,false);assert.equal(complete,0);
  fail=false;assert.equal(await sound.egg(),true);sound.stop();
});

test('finite incidental control audio can neither replace nor duplicate the playing egg',async()=>{
  const f=fixture(),sound=createRadioContactAudio(f.options);assert.equal(await sound.egg(),true);
  const egg=f.sources()[0];
  for(let i=0;i<50;i++){f.advance(.1);sound.control('channel');}
  assert.equal(sound.snapshot().voices,RADIO_CONTACT_VOICE_LIMIT);assert.equal(egg.disconnected,false);
  assert.equal(sound.snapshot().eggPlaying,true);sound.stop();assert.equal(egg.disconnected,true);
});

test('the default loader uses the exact project asset and never turns fetch or decode failure into a later surprise',async()=>{
  const original=globalThis.fetch,calls=[];
  try{
    const f=fixture();let decoded=0;
    globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
    f.ctx.decodeAudioData=async bytes=>{decoded++;assert.equal(bytes.byteLength,8);return f.buffer;};
    const sound=createRadioContactAudio({getAudio:f.options.getAudio});
    assert.equal(await sound.warm(),true);assert.equal(decoded,1);
    assert.match(calls[0].url,/audio\/game\/radio_breaks-scream\.mp3$/);
    assert.ok(calls[0].options.signal);assert.equal(f.sources().length,0);
    sound.stop();
    for(const response of [async()=>({ok:false,status:404}),async()=>{throw Error('unavailable');}]){
      globalThis.fetch=response;
      const g=fixture(),missing=createRadioContactAudio({getAudio:g.options.getAudio});
      assert.equal(await missing.egg(),false);assert.equal(g.sources().length,0);missing.stop();
    }
  }finally{globalThis.fetch=original;}
});
