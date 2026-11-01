import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEndingStaticMix,endingStaticFrame,ENDING_STATIC} from '../src/audio/ending-static.js';
import {staticTextureBuffer,STATIC_TEXTURE} from '../src/audio/static-texture.js';
const duration=716.397868;
function fixture(){
 const nodes=[],sources=[],timers=new Set(),ctx={currentTime:0,state:'running',sampleRate:8000},state={eligible:true,currentTime:510,duration,playing:true,ended:false};let sfx=1;
 const param=value=>({value,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['value',v,t]);},setTargetAtTime(v,t,tau){this.value=v;this.events.push(['target',v,t,tau]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);},cancelAndHoldAtTime(t){this.events.push(['hold',t]);},cancelScheduledValues(t){this.events.push(['cancel',t]);}});
 const node=kind=>{const n={kind,links:[],connect(to){this.links.push(to);return to;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
 ctx.createGain=()=>Object.assign(node('gain'),{gain:param(1)});ctx.createBiquadFilter=()=>Object.assign(node('filter'),{frequency:param(350),Q:param(1)});
 ctx.createBuffer=(channels,length,rate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate:rate,duration:length/rate,getChannelData:i=>data[i]};};
 ctx.createBufferSource=()=>{const n=Object.assign(node('source'),{starts:[],stops:[],start(at){this.starts.push(at);},stop(at=ctx.currentTime){this.stops.push(at);this.stopAt=at;}});sources.push(n);return n;};
 const output=node('global-volume'),mix=createEndingStaticMix({context:ctx,destination:output,getState:()=>state,getSfxLevel:()=>sfx,scheduleTimer:fn=>{timers.add(fn);return fn;},cancelTimer:fn=>timers.delete(fn)});
 const update=(time,contextTime=time)=>{ctx.currentTime=contextTime;state.currentTime=time;for(const s of sources)if(!s.ended&&s.stopAt<=ctx.currentTime){s.ended=true;s.onended?.();}mix.update();};
 return{mix,ctx,state,nodes,sources,timers,output,update,setSfx:v=>{sfx=v;}};
}
test('the final60s consumes programme but leaves the earlier510s blackout alone',()=>{
 const before=endingStaticFrame({currentTime:510,duration}),start=endingStaticFrame({currentTime:duration-60,duration}),middle=endingStaticFrame({currentTime:duration-30,duration}),end=endingStaticFrame({currentTime:duration,duration});
 assert.equal(before.programmeGain,1);assert.equal(start.programmeGain,1);assert.equal(start.staticGain,0);assert.equal(middle.programmeGain,.25);assert.ok(middle.staticGain>STATIC_TEXTURE.menuGain);assert.equal(end.programmeGain,0);assert.equal(end.staticGain,ENDING_STATIC.maxGain);
});
test('one ending carrier crosses black, credits and manual credit skip without restarting or another dry output',()=>{
 const h=fixture();h.update(550);assert.equal(h.sources.length,0);h.update(660);assert.equal(h.sources.length,1);const source=h.sources[0];
 h.state.stage='credits';h.update(682);h.state.stage='final-black';h.update(708);
 assert.equal(h.sources.length,1);assert.equal(source.starts.length,1);assert.equal(h.mix.snapshot().carriers,1);
 const dry=h.mix.input.links.find(n=>n.kind==='gain'),filter=h.mix.input.links.find(n=>n.kind==='filter'),programme=dry.links[0];assert.deepEqual(programme.links,[h.output]);assert.equal(filter.links[0].links[0],programme,'dry and filtered paths meet before the same programme gate');assert.equal(h.mix.input.links.length,2);
 h.update(duration);assert.equal(programme.gain.value,0);assert.ok(programme.gain.events.some(e=>e[0]==='value'&&e[1]===0),'the whole programme reaches exact silence');h.mix.dispose();
});
test('noise holds under residual credits, then an explicit4s release freezes across pause/focus',()=>{
 const h=fixture();h.update(duration-.01,99);h.state.ended=true;h.state.playing=false;h.update(duration,100);
 const source=h.sources[0];assert.equal(source.stopAt,undefined,'media end does not cut residual readable credits');
 h.update(duration,140);assert.equal(h.mix.snapshot().phase,'holding-credits');assert.equal(h.sources.length,1);
 h.mix.finish();h.update(duration,141);assert.equal(h.mix.snapshot().releaseAge,1);
 h.state.paused=true;h.update(duration,142);assert.equal(h.mix.snapshot().held,true);assert.equal(h.mix.snapshot().releaseAge,2);
 h.update(duration,200);assert.equal(h.mix.snapshot().releaseAge,2,'held wall time cannot expire the release');assert.equal(source.stopAt,undefined);
 h.state.paused=false;h.update(duration,201);assert.equal(h.mix.snapshot().releaseAge,2);h.update(duration,203.1);
 assert.equal(h.mix.snapshot().phase,'spent');assert.equal(source.disconnected,true);assert.equal(h.sources.length,1);assert.equal(h.timers.size,0);assert.equal(h.mix.input.links[0].links[0].gain.value,1);h.mix.dispose();
});
test('manual early credit skip latches release until the actual recording ends',()=>{
 const h=fixture();h.update(682,20);h.mix.finish();assert.equal(h.mix.snapshot().releaseAge,null);assert.equal(h.mix.snapshot().finishRequested,true);
 h.update(708,46);assert.equal(h.mix.snapshot().phase,'consuming');h.state.ended=true;h.state.playing=false;h.update(duration,54);assert.equal(h.mix.snapshot().releaseAge,0);
 h.update(duration,58.1);assert.equal(h.mix.snapshot().phase,'spent');h.mix.dispose();
});
test('media holds preserve progression and carrier identity; exiting the ending releases everything',()=>{
 const h=fixture();h.update(690,20);const before=h.mix.snapshot();h.state.paused=true;h.state.playing=false;h.update(690,100);assert.equal(h.mix.snapshot().progress,before.progress);
 h.state.paused=false;h.state.playing=true;h.update(690,101);assert.equal(h.mix.snapshot().carriers,1);assert.equal(h.sources[0].starts.length,1);
 h.state.eligible=false;h.update(690,102);assert.equal(h.mix.snapshot().eligible,false);assert.equal(h.sources[0].disconnected,true);assert.equal(h.timers.size,0);assert.equal(h.mix.input.links[0].links[0].gain.value,1);
 h.mix.dispose();h.mix.dispose();
});
test('static follows SFX permission while both routes remain under the global volume bus',()=>{
 const h=fixture();h.setSfx(0);h.update(700);assert.equal(h.mix.snapshot().carrier.outputLevel,0);assert.equal(h.mix.snapshot().programmeGain<1,true);
 const finalNodes=h.nodes.filter(n=>n.links.includes(h.output));assert.equal(finalNodes.length,2,'programme and static meet only at the global-volume bus');h.mix.dispose();
});
test('menu and ending share a deterministic bounded900–7800Hz transport kernel',()=>{
 const h=fixture(),a=staticTextureBuffer(h.ctx),b=staticTextureBuffer(h.ctx);assert.deepEqual(a.getChannelData(0),b.getChannelData(0));assert.equal(a.duration,1.5);assert.ok(a.getChannelData(0).every(n=>Number.isFinite(n)&&Math.abs(n)<1));
 h.update(700);const frequencies=h.nodes.filter(n=>n.kind==='filter').map(n=>n.frequency.value);assert.ok(frequencies.includes(900));assert.ok(frequencies.includes(7800));h.mix.dispose();
});


test('inactive and pre-window audio bypasses the filter through an exact unity route',()=>{
 const h=fixture();h.state.eligible=false;h.update(400);const dry=h.mix.input.links.find(n=>n.kind==='gain'),filter=h.mix.input.links.find(n=>n.kind==='filter');
 assert.equal(dry.gain.value,1);assert.equal(filter.links[0].gain.value,0);assert.equal(dry.links[0].gain.value,1);
 h.state.eligible=true;h.update(646);assert.equal(h.mix.snapshot().dryMix,1);assert.equal(h.mix.snapshot().filteredMix,0);assert.equal(h.sources.length,0);
 h.update(duration);assert.equal(dry.links[0].gain.value,0,'both programme branches are consumed at the actual end');h.mix.dispose();
});


test('the production output has one ending programme gate and no legacy rupture/chime bypass',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal((main.match(/limiter\.connect\(endingStaticMix\.input\)/g)||[]).length,1);
  assert.doesNotMatch(main,/limiter\.connect\(outGain\)/);
  const body=name=>main.slice(main.indexOf('function '+name+'('),main.indexOf('\nfunction ',main.indexOf('function '+name+'(')+1));
  for(const name of ['playHushRupture','playKeyPickupChime']){
    assert.match(body(name),/out\.connect\(sfxDirectGain \|\| master \|\| actx\.destination\)/);
    assert.doesNotMatch(body(name),/out\.connect\(outputMonitor/);
  }
  assert.match(main,/outGain\.connect\(outputMonitor \|\| actx\.destination\)/,'global volume remains after both ending programme and static');
});


test('a transferred codec failure releases current noise without pretending the performance ended or jumping volume',()=>{
 const h=fixture();h.update(682,20);const before=h.mix.snapshot();h.state.failed='decoder failed';h.state.playing=false;h.update(0,21);
 const failed=h.mix.snapshot();assert.equal(failed.phase,'failed-release');assert.equal(failed.failure,'decoder failed');assert.equal(failed.mediaEnded,false);assert.equal(failed.staticGain,before.staticGain);assert.ok(failed.staticGain<ENDING_STATIC.maxGain);assert.equal(h.sources.length,1);
 h.update(0,25.1);assert.equal(h.mix.snapshot().phase,'spent');assert.equal(h.sources[0].disconnected,true);assert.equal(h.timers.size,0);assert.equal(h.mix.input.links[0].links[0].gain.value,1);h.mix.dispose();
});
test('failure before a decoded duration has no invented noise and cannot hold the programme forever',()=>{
 const h=fixture();h.state.duration=0;h.state.failed='decode rejected';h.state.playing=false;h.update(0,10);assert.equal(h.mix.snapshot().phase,'failed-release');assert.equal(h.sources.length,0);
 h.update(0,14.1);assert.equal(h.mix.snapshot().phase,'spent');assert.equal(h.mix.snapshot().mediaEnded,false);h.mix.dispose();
});
