import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningCabRadio,OPENING_CAB_RADIO_MIX as C} from '../src/audio/opening-cab-radio.js';
import {OPENING_CAB_RADIO_SOURCE} from '../src/data/opening-cab-radio-source.js';
import {RADIO_SCRATCH_CLIPS} from '../src/game/source-drive/radio-programmes.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({play,fetcher,programmeSource,stations,initialStationId}={}){
  const nodes=[],voices=[],elements=[],requests=[],errors=[];let protectedState={active:true,focused:true};
  const param=value=>({value,calls:[],cancelScheduledValues(at){this.calls.push(['cancel',at]);},
    setValueAtTime(v,at){this.value=v;this.calls.push(['set',v,at]);},linearRampToValueAtTime(v,at){this.value=v;this.calls.push(['ramp',v,at]);}});
  const node=(kind,extra={})=>{const n={kind,connections:[],connect(out){this.connections.push(out);},disconnect(){this.disconnected=true;},...extra};nodes.push(n);return n;};
  function newContext(){return{currentTime:0,state:'running',
    createMediaElementSource(el){assert.equal(el.bound,undefined,'one source per media element');el.bound=this;return node('media',{el});},
    createGain:()=>node('gain',{gain:param(1)}),createBiquadFilter:()=>node('filter',{frequency:param(0),Q:param(0)}),
    createDelay:()=>node('delay',{delayTime:param(0)}),decodeAudioData:async()=>({duration:C.linkSeconds}),
    createBufferSource(){const source=node('voice',{starts:[],stops:[],start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}});voices.push(source);return source;}};}
  let ctx=newContext();const destination={kind:'game-music-bus'};
  const createElement=()=>{const listeners=new Map(),el={paused:true,currentTime:0,duration:291.758685,plays:0,loads:0,
    play(){this.plays++;this.paused=false;return play?play(this):Promise.resolve();},pause(){this.paused=true;},
    load(){this.loads++;},removeAttribute(name){if(name==='src')this.src='';},
    addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
    emit(name){listeners.get(name)?.();}};elements.push(el);return el;};
  const radio=createOpeningCabRadio({getAudio:()=>({ctx,destination}),getState:()=>protectedState,createElement,
    fetcher:async url=>{requests.push(url);return fetcher?fetcher(url):{ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};},
    urlFor:path=>'/game/'+path.replace(/^\/+/,''),onError:error=>errors.push(error.message),...(programmeSource?{programmeSource}:{}),
    ...(stations!==undefined?{stations}:{}),initialStationId});
  return{radio,nodes,voices,elements,requests,errors,destination,get ctx(){return ctx;},
    state(next){protectedState={...protectedState,...next};},replaceContext(){ctx=newContext();return ctx;},
    at(time,contextTime=time){elements.at(-1).currentTime=time;ctx.currentTime=contextTime;}};
}

test('preparation uses one streamed programme, decodes only the existing short link and is idempotent',async()=>{
  const h=fixture();assert.deepEqual(await Promise.all([h.radio.prepare(),h.radio.prepare()]),[true,true]);
  assert.equal(h.elements.length,1);assert.equal(h.elements[0].loads,1);assert.equal(h.elements[0].plays,0);
  assert.deepEqual(h.requests,['/game/assets/source-drive/radio/music-link.wav']);assert.equal(h.voices.length,0);
  assert.equal(h.elements[0].src,'/game/'+OPENING_CAB_RADIO_SOURCE.path);
  assert.equal(h.nodes.filter(n=>n.kind==='filter').find(n=>n.type==='highpass').frequency.value,C.highpassHz);
  assert.equal(h.nodes.filter(n=>n.kind==='filter').find(n=>n.type==='lowpass').frequency.value,C.lowpassHz);
  assert.equal(h.nodes.find(n=>n.channelCount===1).channelCountMode,'explicit');
  assert.deepEqual(h.nodes.filter(n=>n.kind==='delay').map(n=>n.delayTime.value),C.reflectionSeconds);
  assert.equal(h.nodes.filter(n=>n.connections.includes(h.destination)).length,1,'only the final receiver gate reaches the game bus');
  h.radio.dispose();
});

test('arrival and parked updates retain one decoder and one correctly timed station link',async()=>{
  const h=fixture();await h.radio.prepare();assert.equal(h.radio.start(),true);await flush();
  for(let i=0;i<60;i++)h.radio.update({active:true,inspecting:i%2===0});
  assert.equal(h.elements.length,1);assert.equal(h.elements[0].plays,1);assert.equal(h.voices.length,1);
  assert.equal(h.voices[0].starts[0][0],1.2);assert.equal(h.voices[0].starts[0][1],0);
  assert.ok(Math.abs(h.voices[0].starts[0][2]-C.linkSeconds)<1e-10);
  h.at(1.3);const snapshot=h.radio.snapshot();assert.equal(snapshot.playing,true);
  assert.equal(snapshot.station,'EVENING MUSIC');assert.equal(snapshot.programme,`${OPENING_CAB_RADIO_SOURCE.composer} — ${OPENING_CAB_RADIO_SOURCE.title}`);
  assert.equal(snapshot.caption.text,RADIO_SCRATCH_CLIPS['music-link'].text);
  h.at(7);h.voices[0].onended();h.radio.update();assert.equal(h.radio.snapshot().caption,null);
  h.at(0,292);h.radio.update();assert.equal(h.voices.length,1,'a whole-piece repeat does not repeat chatter in a short cycle');
  h.radio.dispose();
});

test('focus, pause and protected holds stop link immediately and resume only its matching remainder',async()=>{
  const h=fixture();await h.radio.prepare();h.radio.start();await flush();h.at(1.8);
  h.state({focused:false});h.radio.update();assert.equal(h.radio.snapshot().playing,false);assert.equal(h.radio.snapshot().caption,null);
  assert.equal(h.elements[0].paused,true);assert.ok(h.voices[0].stops.some(a=>a.length===0));
  h.ctx.currentTime=41.8;h.state({focused:true});h.radio.update();await flush();
  assert.equal(h.elements[0].currentTime,1.8);assert.equal(h.elements[0].plays,2);
  assert.ok(Math.abs(h.voices[1].starts[0][1]-.6)<1e-8);assert.equal(h.voices[1].starts[0][0],41.8);
  h.state({paused:true});h.radio.update();assert.equal(h.radio.snapshot().playing,false);
  h.state({paused:false,protected:true});h.radio.update();assert.equal(h.elements[0].plays,2);
  h.state({protected:false});h.radio.update();await flush();assert.equal(h.elements[0].plays,3);h.radio.dispose();
});

test('power and volume operate the receiver without restarting or parking the broadcast',async()=>{
  const h=fixture();await h.radio.prepare();h.radio.start();await flush();h.at(12);
  h.radio.action({type:'power'});assert.equal(h.radio.snapshot().on,false);assert.equal(h.radio.snapshot().playing,false);
  assert.equal(h.elements[0].paused,false);h.at(19);h.radio.update({inspecting:true});
  h.radio.action({type:'power'});assert.equal(h.radio.snapshot().clock,19);assert.equal(h.elements[0].plays,1);
  assert.equal(h.radio.action({type:'volume',delta:9}).volume,1);assert.equal(h.radio.action({type:'volume',delta:-9}).volume,0);
  assert.equal(h.radio.snapshot().playing,false);h.radio.action({type:'volume',value:.4});assert.equal(h.radio.snapshot().playing,true);
  const detached=h.radio.snapshot();detached.errors.push('external');assert.deepEqual(h.radio.snapshot().errors,[]);h.radio.dispose();
});

test('late station decoding, seeks and buffering cannot queue an obsolete station burst',async()=>{
  let finish;const h=fixture({fetcher:()=>new Promise(resolve=>finish=resolve)});const prepared=h.radio.prepare();h.radio.start();await flush();
  h.at(9);h.radio.update();finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});await prepared;await flush();
  assert.equal(h.voices.length,0);assert.equal(h.radio.snapshot().linkDone,true);
  h.elements[0].emit('waiting');assert.equal(h.radio.snapshot().playing,false);
  h.at(20);h.elements[0].emit('playing');assert.equal(h.radio.snapshot().playing,true);
  h.elements[0].emit('seeking');h.at(0);h.elements[0].emit('seeked');h.radio.update();
  assert.equal(h.voices.length,0);assert.equal(h.elements[0].plays,1);h.radio.dispose();
});

test('an aborted start is recoverable and late completion cannot resurrect a disposed owner',async()=>{
  let reject;const h=fixture({play:el=>el.plays===1?new Promise((_,fail)=>reject=fail):Promise.resolve()});
  h.radio.start();h.state({paused:true});h.radio.update();reject(Object.assign(Error('held'),{name:'AbortError'}));await flush();
  assert.equal(h.radio.snapshot().failed,null);h.state({paused:false});h.radio.update();await flush();
  assert.equal(h.radio.snapshot().playing,true);assert.equal(h.elements[0].plays,2);
  h.radio.dispose();assert.equal(h.radio.dispose(),false);assert.equal(h.radio.start(),false);assert.equal(h.elements[0].paused,true);
  let resolve;const late=fixture({play:()=>new Promise(done=>resolve=done)});late.radio.start();late.radio.dispose();resolve();await flush();
  assert.equal(late.radio.snapshot().playing,false);assert.equal(late.elements[0].paused,true);
});

test('a replacement host context retires the old source while preserving programme position',async()=>{
  const h=fixture();await h.radio.prepare();h.radio.start();await flush();h.at(42.25);h.replaceContext();h.radio.update();await flush();
  assert.equal(h.elements.length,2);assert.equal(h.elements[0].paused,true);assert.equal(h.elements[1].currentTime,42.25);
  assert.equal(h.nodes.filter(n=>n.kind==='media'&&n.disconnected).length,1);assert.equal(h.radio.snapshot().mediaSources,2);
  h.radio.dispose();assert.ok(h.nodes.filter(n=>n.kind==='media').every(n=>n.disconnected));
});

test('a superseded play rejection after focus returns cannot fail the recovered receiver',async()=>{
  let reject;const h=fixture({play:el=>el.plays===1?new Promise((_,fail)=>reject=fail):Promise.resolve()});
  h.radio.start();h.state({focused:false});h.radio.update();h.state({focused:true});h.radio.update();await flush();
  assert.equal(h.radio.snapshot().playing,true);assert.equal(h.elements[0].plays,2);
  reject(Object.assign(Error('the earlier request was paused'),{name:'AbortError'}));await flush();
  assert.equal(h.radio.snapshot().failed,null);assert.equal(h.radio.snapshot().playing,true);assert.deepEqual(h.errors,[]);h.radio.dispose();
});

test('link failure preserves music while programme failure closes the receiver without retries',async()=>{
  const h=fixture({fetcher:async()=>({ok:false})});assert.equal(await h.radio.prepare(),true);h.radio.start();await flush();
  assert.equal(h.radio.snapshot().playing,true);assert.equal(h.errors.length,1);assert.equal(h.radio.snapshot().failed,null);
  h.elements[0].error={message:'decoder failed'};h.elements[0].emit('error');
  assert.equal(h.radio.snapshot().playing,false);assert.match(h.radio.snapshot().failed,/decoder failed/);
  h.radio.update();assert.equal(h.elements[0].plays,1);h.radio.dispose();
});

test('late preparation after disposal never creates a station source',async()=>{
  let finish;const h=fixture({fetcher:()=>new Promise(resolve=>finish=resolve)}),prepared=h.radio.prepare();
  h.radio.dispose();finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});assert.equal(await prepared,false);
  assert.equal(h.voices.length,0);assert.equal(h.elements.length,1);assert.ok(h.nodes.every(n=>n.disconnected));
});

test('the small no-feedback speaker mix has bounded unity-peak input headroom',()=>{
  const reflections=1+C.reflectionGains.reduce((sum,v)=>sum+v,0);
  assert.ok((C.programmeGain+C.linkGain)*reflections<1,'even coincident full-scale input peaks stay below unity before volume');
  assert.ok((C.programmeGain*C.duck+C.linkGain)*reflections<.6,'the station link does not require limiting');
  assert.ok(C.reflectionSeconds.every(t=>t<.05));assert.ok(C.reflectionGains.every(g=>g<.05));
});

test('replacement programme metadata controls actual media source and readout together',async()=>{
  const h=fixture({programmeSource:{composer:'Cleared composer',title:'Piano duet',path:'audio/cleared-duet.mp3',durationSeconds:300}});
  await h.radio.prepare();assert.equal(h.elements[0].src,'/game/audio/cleared-duet.mp3');
  assert.equal(h.radio.snapshot().programme,'Cleared composer — Piano duet');h.radio.dispose();
});

const stations=[
  {id:'a',label:'DUET ONE',source:{composer:'Composer A',title:'First duet',path:'audio/duet-a.mp3',durationSeconds:300}},
  {id:'b',label:'DUET TWO',source:{composer:'Composer B',title:'Second duet',path:'audio/duet-b.mp3',durationSeconds:100},link:null},
  {id:'c',label:'SPOKEN ARCHIVE',source:{title:'Actual cleared archive broadcast',path:'audio/archive.mp3',durationSeconds:50},link:null},
];

test('station clocks continue while tuned elsewhere or OFF with only one selected decoder playing',async()=>{
  const h=fixture({stations});await h.radio.prepare();h.radio.start();await flush();h.at(10);h.radio.update();
  const first=h.elements[0];h.radio.action({type:'station',id:'b'});await flush();
  assert.equal(first.paused,true);assert.equal(first.src,'');assert.equal(h.elements[1].currentTime,10);
  assert.equal(h.radio.snapshot().stationId,'b');assert.equal(h.radio.snapshot().programme,'Composer B — Second duet');
  h.at(17);h.radio.update();h.radio.action({type:'station',id:'a'});await flush();
  assert.equal(h.elements[2].currentTime,17,'the original station does not wait at the previous tuning position');
  h.radio.action({type:'power',value:false});h.at(132);h.radio.update();h.radio.action({type:'station',delta:1});await flush();
  assert.equal(h.elements.at(-1).currentTime,32,'the second programme wraps at its own verified duration');
  assert.equal(h.radio.snapshot().on,false);assert.equal(h.elements.filter(el=>!el.paused).length,1);
  assert.equal(h.nodes.filter(n=>n.kind==='media'&&!n.disconnected).length,1);
  assert.equal(h.radio.snapshot().availableStations.find(row=>row.id==='c').clock,32);
  assert.equal(h.voices.length,1,'retuning past an old station link never catches it up');h.radio.dispose();
});

test('one held audio clock freezes every station and tuning while held starts no decoder',async()=>{
  const h=fixture({stations});await h.radio.prepare();h.radio.start();await flush();h.at(20);h.radio.update();
  h.state({focused:false});h.radio.update();h.ctx.currentTime=120;
  assert.deepEqual(h.radio.snapshot().availableStations.map(row=>row.clock),[20,20,20]);
  h.radio.action({type:'station',id:'c'});assert.equal(h.elements.length,1);assert.equal(h.radio.snapshot().clock,20);
  h.state({focused:true});h.radio.update();await flush();assert.equal(h.elements[1].currentTime,20);
  h.at(25,125);h.radio.update();assert.equal(h.radio.snapshot().availableStations.find(row=>row.id==='a').clock,25);
  h.radio.dispose();
});

test('unavailable or invalid station descriptors do not create phantom presets',async()=>{
  const h=fixture({stations:[...stations,{id:'absent',label:'Not licensed',available:false,source:{path:'audio/missing.mp3'}},
    {id:'no-file',label:'No recording'}, {id:'remote',source:{path:'https://example.com/audio.mp3'}}]});
  await h.radio.prepare();h.radio.start();await flush();assert.equal(h.radio.snapshot().availableStations.length,3);
  h.radio.action({type:'station',id:'absent'});h.radio.action({type:'station',id:'a'});assert.equal(h.elements.length,1);
  h.radio.action({type:'station',delta:-1});await flush();assert.equal(h.radio.snapshot().stationId,'c');h.radio.dispose();
  const empty=fixture({stations:[]});assert.equal(await empty.radio.prepare(),false);assert.equal(empty.radio.start(),false);
  assert.equal(empty.elements.length,0);assert.equal(empty.radio.snapshot().station,null);assert.deepEqual(empty.radio.snapshot().availableStations,[]);empty.radio.dispose();
});

test('each selected station reports only its own configured spoken link',async()=>{
  const h=fixture({stations:[{...stations[0],link:{id:'announcer',path:'audio/announcer.wav',text:'This is the actual spoken caption.',
    speaker:'ANNOUNCER',at:2,durationSeconds:2.2,temporary:false}},stations[1]],initialStationId:'a'});
  await h.radio.prepare();h.radio.start();await flush();assert.deepEqual(h.requests,['/game/audio/announcer.wav']);
  assert.equal(h.voices[0].starts[0][0],2);h.at(2.2);assert.deepEqual(h.radio.snapshot().caption,
    {speaker:'ANNOUNCER',text:'This is the actual spoken caption.',cueId:'announcer',temporary:false});
  h.radio.action({type:'station',id:'b'});await flush();assert.equal(h.radio.snapshot().caption,null);
  assert.equal(h.requests.length,1,'a full spoken/musical stream need not have an inserted link');h.radio.dispose();
});

test('late metadata and play confirmation join the current broadcast instead of its stale tune-in position',async()=>{
  let resolve,requests=0;const h=fixture({stations,play:()=>++requests===1?Promise.resolve():new Promise(done=>resolve=done)});
  await h.radio.prepare();h.radio.start();await flush();h.at(12);h.radio.action({type:'station',id:'b'});
  assert.equal(h.elements[1].currentTime,12);h.ctx.currentTime=15;h.elements[1].emit('loadedmetadata');
  assert.equal(h.elements[1].currentTime,15);h.ctx.currentTime=17;resolve();await flush();
  assert.equal(h.elements[1].currentTime,17);assert.equal(h.radio.snapshot().clock,17);
  assert.equal(h.radio.snapshot().availableStations.find(row=>row.id==='a').clock,17);h.radio.dispose();
});

test('physical exit projection fades independently of the receiver knob through every output path',async()=>{
  const h=fixture();await h.radio.prepare();h.state({projectionGain:.5});h.radio.start();await flush();
  const gate=h.nodes.find(n=>n.connections.includes(h.destination));
  assert.equal(gate.gain.value,C.defaultVolume*.5);assert.equal(h.radio.snapshot().volume,C.defaultVolume);
  h.radio.action({type:'volume',value:.8});assert.equal(gate.gain.value,.4);
  h.state({projectionGain:.25});h.elements[0].emit('playing');assert.equal(gate.gain.value,.2);
  h.state({projectionGain:0});h.radio.update();assert.equal(gate.gain.value,0);
  assert.equal(h.radio.snapshot().playing,false);assert.equal(h.radio.snapshot().volume,.8);
  assert.equal(h.elements[0].paused,false,'projection is a spatial fade rather than a transport hold');
  h.state({projectionGain:9});h.radio.update();assert.equal(gate.gain.value,.8);
  h.state({projectionGain:undefined});h.radio.update();assert.equal(h.radio.snapshot().projectionGain,1);h.radio.dispose();
});

test('autoplay policy waits for an explicit fresh start rather than permanently failing or retrying each frame',async()=>{
  const h=fixture({play:el=>el.plays===1?Promise.reject(Object.assign(Error('gesture required'),{name:'NotAllowedError'})):Promise.resolve()});
  h.radio.start();await flush();assert.equal(h.radio.snapshot().failed,null);assert.equal(h.radio.snapshot().needsGesture,true);
  for(let i=0;i<90;i++)h.radio.update();assert.equal(h.elements[0].plays,1);assert.equal(h.radio.snapshot().playing,false);
  h.radio.start();await flush();assert.equal(h.elements[0].plays,2);assert.equal(h.radio.snapshot().needsGesture,false);
  assert.equal(h.radio.snapshot().playing,true);h.radio.dispose();
});

test('power-on also recovers a synchronous gesture refusal without rebuilding the decoder',async()=>{
  const h=fixture({play:el=>{if(el.plays===1)throw Object.assign(Error('not allowed yet'),{name:'NotAllowedError'});return Promise.resolve();}});
  assert.equal(h.radio.start(),false);assert.equal(h.radio.snapshot().failed,null);assert.equal(h.radio.snapshot().needsGesture,true);
  h.radio.action({type:'power',value:false});assert.equal(h.elements[0].plays,1);
  h.radio.action({type:'power',value:true});await flush();assert.equal(h.elements[0].plays,2);
  assert.equal(h.radio.snapshot().playing,true);assert.equal(h.elements.length,1);assert.equal(h.radio.snapshot().mediaSources,1);h.radio.dispose();
});
