import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSourceRestWeather,createSourceRestBellAudio,createSourceRestFloodAudio,sourceRestFloodAcousticFrame,SOURCE_REST_WEATHER_AUDIO} from '../src/audio/source-rest-weather.js';
import {sourceRestJudgmentFrame,SOURCE_REST_BELLS,SOURCE_REST_BELL_EVENTS,SOURCE_REST_LIGHTNING} from '../src/game/source-rest-judgment.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('the actual shipped 24-bit bell stems fit the local decoder budget',()=>{
  for(const sample of SOURCE_REST_WEATHER_AUDIO.bellSamples){
    const bytes=readFileSync(new URL(`../public/assets/audio/bell-tower/bell-${sample}-hand-01.wav`,import.meta.url));
    assert.ok(bytes.byteLength<=SOURCE_REST_WEATHER_AUDIO.bellEncodedByteLimit);
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  }
});
test('weather follows shelter presence, holds, and clears before the last black',()=>{
  const updates=[],stops=[],ctx={state:'running'},destination={};
  const voice={update:v=>updates.push(v),stop:v=>stops.push(v)};
  const weather=createSourceRestWeather({getAudio:()=>({ctx,destination}),makeVoice:()=>voice});
  weather.update({active:true,progress:0,cue:{audio:{rain:.6},wind:1.2}});assert.equal(updates.at(-1).presence,.6);assert.equal(updates.at(-1).wind,1.2);
  weather.pause();assert.equal(updates.at(-1).presence,0);
  weather.update({active:true,progress:.7,cue:{audio:{rain:0},wind:.2}});assert.equal(updates.at(-1).presence,0,'a clearing is silent even while music continues');
  weather.update({active:true,progress:.96,cue:{audio:{rain:.9}}});assert.equal(updates.at(-1).presence,0);
  weather.dispose();weather.dispose();assert.equal(stops.length,1);
});
test('rain, sheets and leaves use their own standard voices and no unscored fallback',()=>{
  const updates=[],stops=[],ctx={state:'running'},destination={};
  const weather=createSourceRestWeather({getAudio:()=>({ctx,destination}),makeVoice:({kind})=>({update:v=>updates.push({kind,...v}),stop:()=>stops.push(kind)})});
  weather.update({active:true});assert.equal(updates.length,0);
  weather.update({active:true,cue:{audio:{sheets:.2,leaves:.15},wind:1.7}});
  assert.deepEqual(updates,[{kind:'sheets',presence:.2,wind:1.7},{kind:'leaves',presence:.15,wind:1.7}]);
  weather.pause();assert.ok(updates.slice(-2).every(v=>v.presence===0));
  weather.dispose();assert.deepEqual(stops,['sheets','leaves']);
});
function scoredHarness(){
  const ctx={state:'running',currentTime:0},destination={},hits=[],prepares=[],stops=[],placements=[];
  const weather=createSourceRestWeather({getAudio:()=>({ctx,destination}),
    makeVoice:()=>({update(){},stop(){}}),
    makeThunder:()=>({prepare:event=>{prepares.push(event);return true;},strike:event=>{hits.push({kind:'thunder',event});return true;},stop:()=>stops.push('thunder')}),
    makeBells:()=>({prepare:async()=>true,update:value=>placements.push(value),strike:event=>{hits.push({kind:'bell',event});return true;},pause:()=>stops.push('bells'),dispose:()=>stops.push('disposed')})});
  const update=(clock,extra={})=>{ctx.currentTime=clock;return weather.update({active:true,progress:clock/716.397868,cue:{audio:{},judgment:sourceRestJudgmentFrame({clock,stormAge:clock})},...extra});};
  return{weather,update,hits,prepares,stops,placements,ctx};
}
test('three tuned bell mouths and the authored standard lightning channels sound once on their own scored arrivals',()=>{
  const h=scoredHarness();for(let t=0;t<500;t+=.02)h.update(t);h.update(500);
  const bells=h.hits.filter(v=>v.kind==='bell'),thunder=h.hits.filter(v=>v.kind==='thunder');
  assert.equal(bells.length,SOURCE_REST_BELL_EVENTS.length);assert.equal(thunder.length,SOURCE_REST_LIGHTNING.length);
  assert.deepEqual(new Set(bells.map(v=>v.event.sample)),new Set(['04','06','08']));
  for(const hit of thunder)assert.equal(hit.event.at,hit.event.startedAt+hit.event.distance/343);
  for(const strike of SOURCE_REST_LIGHTNING)assert.equal(h.prepares.filter(e=>e.id===strike.id).length,1);
  assert.equal(h.weather.snapshot().playedBells,11);assert.equal(h.weather.snapshot().playedThunder,SOURCE_REST_LIGHTNING.length);
  h.weather.dispose();
});
test('lightning prepares before arrival; duplicate frames, holds, focus loss and jumps never accumulate a burst',()=>{
  const h=scoredHarness(),first=SOURCE_REST_LIGHTNING[0];
  h.update(first.at-.24);assert.equal(h.prepares.length,1);assert.equal(h.hits.length,0);
  h.update(first.at);h.update(first.at);assert.equal(h.prepares.length,1);assert.equal(h.hits.length,0);
  h.weather.pause();assert.ok(h.stops.includes('thunder'));assert.ok(h.stops.includes('bells'));
  h.update(first.thunderAt-.1);h.update(first.thunderAt);h.update(first.thunderAt);
  assert.equal(h.hits.filter(v=>v.kind==='thunder').length,1);
  h.weather.pause();h.update(first.thunderAt);assert.equal(h.hits.length,1,'held event does not replay');
  h.update(484.5);assert.equal(h.hits.length,1,'a scene/seek jump drops skipped history');
  h.ctx.state='suspended';h.update(488.2);assert.equal(h.weather.snapshot().held,true);
  h.ctx.state='running';h.update(490);assert.equal(h.hits.length,1,'a protected gap has no catch-up thunder');
  h.weather.dispose();
});
test('bell placement takes the actual camera state; weather clears at black without touching music',()=>{
  const h=scoredHarness(),state={x:1.5,feet:7.8,z:-21.2,yaw:1.57},acousticFrame={id:'actual-camera'};
  h.update(7.79,{state,acousticFrame});h.update(7.8,{state,acousticFrame});
  assert.equal(h.hits.at(-1).kind,'bell');assert.equal(h.placements.at(-1).state,state);assert.equal(h.placements.at(-1).acousticFrame,acousticFrame);
  h.update(8,{progress:.95});assert.equal(h.weather.snapshot().quiet,true);assert.equal(h.weather.snapshot().held,false,'final release is a fade, not a lifecycle hard hold');
  h.update(12.6,{active:false});assert.equal(h.hits.length,1);
  h.weather.dispose();
});
function graphHarness(){
  const nodes=[],fetches=[],starts=[];
  const param=value=>({value,calls:[],setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t]);},setTargetAtTime(v,t,s){this.value=v;this.calls.push(['target',v,t,s]);},linearRampToValueAtTime(v,t){this.value=v;this.calls.push(['ramp',v,t]);}});
  const node=kind=>{const n={kind,connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const ctx={state:'running',currentTime:0,sampleRate:1000,
    createGain:()=>Object.assign(node('gain'),{gain:param(1)}),
    createBiquadFilter:()=>Object.assign(node('filter'),{frequency:param(0),Q:param(0)}),
    createStereoPanner:()=>Object.assign(node('pan'),{pan:param(0)}),
    createConvolver:()=>Object.assign(node('convolver'),{buffer:null}),
    createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,numberOfChannels:channels,length,sampleRate:rate,getChannelData:i=>data[i]};},
    createBufferSource(){const n=Object.assign(node('source'),{playbackRate:{value:1},start(...args){starts.push({node:n,args});},stop(...args){this.stopArgs=args;}});return n;},
    decodeAudioData:async()=>({duration:20,numberOfChannels:1})};
  const bells=createSourceRestBellAudio({context:ctx,destination:node('bus'),fetcher:async url=>{fetches.push(url);return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};},urlFor:p=>'/game/'+p});
  return{ctx,nodes,fetches,starts,bells};
}
test('recorded bells decode only three canonical stems, keep pitch, locate the mouths, and own their complete tails',async()=>{
  const h=graphHarness();assert.equal(await h.bells.prepare(),true);await h.bells.prepare();assert.equal(h.fetches.length,3);
  const event={...SOURCE_REST_BELL_EVENTS[0],position:{x:10,y:2,z:0}},state={x:0,feet:0,z:0,yaw:0,pitch:0};
  assert.equal(h.bells.strike(event,state),true);assert.equal(h.starts.length,1);
  const snap=h.bells.snapshot();assert.equal(snap.lastStrike.sample,'04');assert.equal(snap.lastStrike.level,SOURCE_REST_WEATHER_AUDIO.bellGain*event.energy);
  assert.ok(snap.lastStrike.placement.relativeXYZ[0]>0);assert.equal(h.nodes.find(n=>n.kind==='pan').pan.value>0,true);
  assert.equal(h.starts[0].node.playbackRate.value,1,'the processed20s stem is not pitch/time shifted at playback');assert.deepEqual(h.starts[0].node.stopArgs,[20]);
  assert.equal(h.nodes.find(n=>n.kind==='convolver').buffer.length,6800);
  h.bells.update({state:{...state,yaw:Math.PI}});assert.equal(h.nodes.find(n=>n.kind==='pan').pan.value<0,true,'turning around relocates the same bell');
  for(let n=0;n<5;n++)h.bells.strike({...event,id:'tail-'+n},state);
  assert.equal(h.bells.snapshot().live,6);h.bells.pause();assert.equal(h.bells.snapshot().live,0);
  assert.ok(h.nodes.filter(n=>n.kind==='convolver').every(n=>n.buffer===null),'pause destroys actual reflections');
  h.bells.dispose();assert.equal(h.bells.strike(event,state),false);
});
test('a late decode after disposal cannot publish or play a bell',async()=>{
  const h=graphHarness(),releases=[];h.ctx.decodeAudioData=()=>new Promise(resolve=>releases.push(resolve));
  const loading=h.bells.prepare();await flush();h.bells.dispose();for(const release of releases)release({duration:12,numberOfChannels:1});
  assert.equal(await loading,false);
  // Three decodes may have been pending; disposal must prevent all results from
  // publishing, regardless of completion order. The source has never started.
  assert.deepEqual(h.bells.snapshot().loaded,[]);assert.equal(h.starts.length,0);
  assert.equal(h.bells.strike(SOURCE_REST_BELL_EVENTS[0]),false);
});


test('flood acoustic transition matches the submerged coastal-car medium without changing the music',()=>{
  const dry=sourceRestFloodAcousticFrame({},80),wet=sourceRestFloodAcousticFrame({submersion:1,pressure:1,flow:1,bubbles:1},80);
  assert.equal(dry.filterHz,18000);assert.equal(wet.filterHz,430);assert.equal(wet.waterGain,.065);assert.equal(wet.pressureGain,.024);
  assert.ok(wet.mediumGain>.7);assert.ok(wet.rainTransmission<.13);assert.equal(wet.bubbleGain,.018);
  const inactive=sourceRestFloodAcousticFrame({active:false,submersion:1,pressure:1,flow:1,bubbles:1},80);
  assert.equal(inactive.submersion,0);assert.equal(inactive.waterGain,0);assert.equal(inactive.pressureGain,0);assert.equal(inactive.bubbleGain,0);
});
test('bounded water pressure and bubble carriers resume at the audible clock phase and never queue bursts',()=>{
  const h=graphHarness(),bus={id:'environment-only'},flood=createSourceRestFloodAudio({context:h.ctx,destination:bus});
  const field={active:true,submersion:1,pressure:.8,flow:.6,bubbles:.9};
  flood.update(field,117);assert.equal(h.starts.length,3);assert.equal(flood.snapshot().filterHz,430);
  for(const start of h.starts){assert.ok(Math.abs(start.args[1]-117%6.7)<1e-6);assert.equal(start.node.loop,true);}
  for(let n=0;n<100;n++)flood.update(field,117+n*.02);assert.equal(h.starts.length,3,'updates change the existing material, not allocate new one-shots');
  assert.ok(h.nodes.filter(n=>n.kind==='source').every(n=>[...n.buffer.getChannelData(0)].every(Number.isFinite)));
  flood.pause();assert.equal(flood.snapshot().loops.length,0);assert.ok(h.starts.every(s=>s.node.stopArgs),'pause stops actual carriers');
  flood.update(field,140);assert.equal(h.starts.length,6);assert.ok(Math.abs(h.starts.at(-1).args[1]-140%6.7)<1e-6);
  flood.update(field,10);assert.equal(h.starts.length,9,'seeking resets phase without replaying skipped releases');
  flood.dispose();assert.equal(flood.update(field,11),false);
});
test('rain, lightning and bell tails share the flood medium while their separate original event rules survive',()=>{
  const ctx={state:'running',currentTime:0},destination={id:'sfx-bus'},input={id:'flood-input'},destinations=[],rain=[],mediumUpdates=[];
  const weather=createSourceRestWeather({getAudio:()=>({ctx,destination}),
    makeFlood:()=>({input,update:(flood,clock)=>mediumUpdates.push({flood,clock}),pause(){},dispose(){},snapshot:()=>({submersion:1})}),
    makeVoice:args=>{destinations.push(args.destination);return{update:v=>rain.push(v),stop(){}};},
    makeThunder:args=>{destinations.push(args.destination);return{prepare(){},strike(){return true;},stop(){}};},
    makeBells:args=>{destinations.push(args.destination);return{prepare:async()=>true,update(){},strike(){return true;},pause(){},dispose(){}};}});
  const field={active:true,submersion:1,pressure:.9,flow:.5,bubbles:.8};
  for(const clock of[7.79,7.8])weather.update({active:true,cue:{clock,audio:{rain:1},flood:field,judgment:sourceRestJudgmentFrame({clock})}});
  assert.equal(destinations.length,3);assert.ok(destinations.every(value=>value===input));assert.ok(Math.abs(rain.at(-1).presence-.12)<1e-9);
  assert.equal(mediumUpdates.at(-1).flood,field);assert.equal(mediumUpdates.at(-1).clock,7.8);assert.equal(weather.snapshot().playedBells,1);
  weather.dispose();
});


test('shipped local bells have D/A dominant resonance, an audible12s tail and an authentic clapper source record',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/source-rest/bells/manifest.json',import.meta.url)));
  assert.equal(manifest.kind,'processed-clapper-and-tuned-modal-resonance');
  const rms=(v,a,b)=>Math.sqrt(v.slice(a,b).reduce((sum,n)=>sum+n*n,0)/(b-a));
  const tone=(v,hz,rate)=>{let re=0,im=0;for(let n=0;n<v.length;n++){const phase=2*Math.PI*hz*n/rate;re+=v[n]*Math.cos(phase);im-=v[n]*Math.sin(phase);}return Math.hypot(re,im)/v.length;};
  for(const bell of SOURCE_REST_BELLS){
    const bytes=readFileSync(new URL('../public/'+bell.audioUrl,import.meta.url)),dataOffset=bytes.indexOf(Buffer.from('data'))+8,rate=bytes.readUInt32LE(24),length=bytes.readUInt32LE(dataOffset-4)/2;
    assert.ok(bytes.length<=SOURCE_REST_WEATHER_AUDIO.bellEncodedByteLimit);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt16LE(34),16);assert.equal(rate,48000);assert.equal(length/rate,20);
    const samples=Float64Array.from({length},(_,n)=>bytes.readInt16LE(dataOffset+n*2)/32768),window=samples.slice(rate,rate*6),actual=tone(window,bell.frequency,rate),semitone=tone(window,bell.frequency*2**(1/12),rate);
    assert.ok(actual>semitone*20,'the dominant resonance is the intended note, not the old upper mode');
    assert.ok(rms(samples,8*rate,9*rate)>.025);assert.ok(rms(samples,12*rate,13*rate)>.01);assert.ok(rms(samples,Math.floor(19.9*rate),20*rate)<.0001);
    const entry=manifest.entries.find(row=>row.sample===bell.sample);assert.equal(entry.frequency,bell.frequency);assert.equal(entry.note,bell.note);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    const original=readFileSync(new URL(`../public/assets/audio/bell-tower/bell-${bell.sample}-hand-01.wav`,import.meta.url));assert.equal(createHash('sha256').update(original).digest('hex'),entry.sourceSha256);
    assert.equal(SOURCE_REST_BELL_EVENTS.find(event=>event.sample===bell.sample).frequency,bell.frequency);
  }
});
test('ordinary forward gaps, leaving weather range and a settled score retain struck bell tails',()=>{
  const h=scoredHarness();h.update(7.79);h.update(7.8);const before=h.stops.filter(v=>v==='bells').length;
  h.update(8.6);assert.equal(h.stops.filter(v=>v==='bells').length,before,'render stall skips missed events without chopping metal');
  h.update(9,{active:false});assert.equal(h.stops.filter(v=>v==='bells').length,before,'leaving the weather range is not a lifecycle hold');
  h.update(9.1,{cue:{clock:9.1,audio:{},judgment:{active:false,clock:9.1}}});assert.equal(h.stops.filter(v=>v==='bells').length,before,'storm settlement does not confiscate an existing tail');
  h.update(9.2,{hold:true});assert.equal(h.stops.filter(v=>v==='bells').length,before+1);assert.equal(h.weather.snapshot().held,true,'explicit pause/focus/protection remains instant silence');
  h.weather.dispose();
});
test('the final visual departure fades a struck bell before releasing its reflections',async()=>{
  const h=graphHarness();await h.bells.prepare();h.bells.strike(SOURCE_REST_BELL_EVENTS[0]);
  const convolver=h.nodes.find(n=>n.kind==='convolver');h.bells.fade(.75);
  assert.deepEqual(h.starts[0].node.stopArgs,[.75]);assert.ok(convolver.buffer,'ordinary release keeps owned room reflections');
  assert.equal(h.bells.snapshot().live,1);h.ctx.currentTime=7.6;h.bells.update();assert.equal(h.bells.snapshot().live,0);assert.equal(convolver.buffer,null);
});
