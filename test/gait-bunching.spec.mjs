import test from 'node:test';
import assert from 'node:assert/strict';
import {createFootContactClock,footContactGait} from '../src/audio/foot-contact.js';
import {createFootstepAudio} from '../src/audio/footsteps.js';

function track(clock,speed,frames,{scene='walk',...state}={}){
  const events=[];
  for(const dt of frames){
    const emitted=clock.update({dt,distance:speed*dt,scene,...state});
    assert.ok(emitted.length<=1,'a display frame cannot replay a queue of spent footfalls');
    for(const event of emitted)events.push({...event,frameDelta:dt});
  }
  return events;
}
const frames=(count,dt=1/60)=>Array.from({length:count},()=>dt);
function assertNoCatchup(events,label){
  for(let i=1;i<events.length;i++){
    const previous=events[i-1],next=events[i],target=Math.min(previous.interval,next.interval);
    // Sampling at 12 FPS legitimately alternates shorter/longer display gaps.
    // A late plant does not permit a .14s recovery roll at a .4s walking gait.
    const shortest=Math.max(.14,Math.min(.82*target,target-next.frameDelta));
    const gap=next.at-previous.at;
    assert.ok(gap+1e-8>=shortest,
      `${label}: bunched gap${gap.toFixed(4)}s vs gait${target.toFixed(4)}s (frame${next.frameDelta.toFixed(4)}s)`);
  }
}

test('a 245 ms foreground stall does not turn an ordinary walk into a recovery doublet',()=>{
  const clock=createFootContactClock({humanize:0});
  const events=[...track(clock,1.8,frames(25)),...track(clock,1.8,[.245]),...track(clock,1.8,frames(90))];
  assertNoCatchup(events,'ordinary1.8m/s');
});

test('a 245 ms foreground stall does not create a fast catch-up roll on subsequent frames',()=>{
  const clock=createFootContactClock({humanize:0});
  const events=[...track(clock,11.1,frames(65)),...track(clock,11.1,[.245]),...track(clock,11.1,frames(90))];
  assertNoCatchup(events,'fast11.1m/s');
});

test('foreground timing jitter and coarse display sampling cannot bank audible contact bunches',()=>{
  const jitter=[1/120,.011,1/60,.025,.07,.19];
  for(const speed of [1.8,11.1]){
    const clock=createFootContactClock({humanize:0});
    const sequence=[...frames(120),...Array.from({length:16},()=>jitter).flat(),...frames(120)];
    const events=track(clock,speed,sequence);
    assertNoCatchup(events,`jitter${speed}m/s`);
    for(const fps of [12,20,30,60,120]){
      const coarse=track(createFootContactClock({humanize:0}),speed,frames(fps*8,1/fps));
      assertNoCatchup(coarse,`${fps}fps${speed}m/s`);
    }
  }
});

test('default gait variation is reproducible and bounded while changing the timing of successive plants',()=>{
  const input=frames(120*40,1/120),speed=1.8;
  const first=track(createFootContactClock({seed:42731}),speed,input);
  const repeated=track(createFootContactClock({seed:42731}),speed,input);
  assert.deepEqual(first,repeated,'the same walk and gait seed must reproduce an inspectable performance');
  assert.ok(new Set(first.map(event=>event.interval.toFixed(6))).size>12,
    'whole walking cycles should vary, rather than a metronome with only shuffled samples');
  const nominal=footContactGait(speed).interval;
  assert.ok(first.every(event=>Math.abs(event.interval/nominal-1)<.09),
    'normal walking irregularity must not become an unannounced stumble');
  const measured=(first.length-1)/(first.at(-1).at-first[0].at);
  assert.ok(Math.abs(measured*nominal-1)<.04,'human variation should preserve the intended overall pace');
  assertNoCatchup(first,'humanizedordinarywalk');
});

test('irregular gait never invents a contact while stationary, unsupported, rejected or paused',()=>{
  const clock=createFootContactClock({seed:42731});
  track(clock,1.8,frames(120));
  for(const state of [{distance:0},{supported:false},{accepted:false},{paused:true},{active:false}]){
    const events=track(clock,1.8,frames(60),state);
    assert.equal(events.length,0,JSON.stringify(state));
  }
  const resumed=track(clock,1.8,frames(120));
  assertNoCatchup(resumed,'resumedhumanizedwalk');
});

function audioFixture(){
  const sources=[];
  const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;},
    cancelScheduledValues(){},exponentialRampToValueAtTime(value){this.value=value;}});
  const node=()=>({connect(){},disconnect(){this.disconnected=true;}});
  const ctx={currentTime:1,state:'running',sampleRate:48000,
    createGain:()=>({...node(),gain:parameter()}),
    createBufferSource(){
      const source={...node(),playbackRate:parameter(),starts:[],stops:[],
        start(...args){this.starts.push(args);},stop(...args){this.stops.push(args);}};
      sources.push(source);return source;
    },
    async decodeAudioData(){return{duration:.2,numberOfChannels:1,sampleRate:48000,length:9600};},
  };
  const manifest={version:1,clips:{a:{url:'a.wav',duration:.2,kind:'dry'},b:{url:'b.wav',duration:.2,kind:'dry'}},
    banks:{concrete:{walk:['a','b']}},responses:{}};
  // A stable destination is part of the real host's graph ownership contract.
  const destination=node();
  const engine=createFootstepAudio({getAudio:()=>({ctx,destination}),manifest,
    urlFor:value=>value,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),random:()=>.2});
  const contact=extra=>engine.contact({owner:'player',surface:'concrete',profile:'physical',level:.22,...extra});
  return{ctx,engine,contact,sources};
}

test('a manual review contact and the restarted walking clock cannot create a 128 ms doublet',async()=>{
  const fixture=audioFixture();
  await fixture.engine.preload({surface:'concrete'});
  assert.equal(fixture.contact({plantIndex:0}).played,true);
  fixture.ctx.currentTime+=.128;
  const attempted=fixture.contact({plantIndex:1,interval:footContactGait(1.8).interval,latenessSeconds:0});
  assert.equal(attempted.played,false,'the manual button and travel clock share audible spacing');
  assert.equal(attempted.reason,'contact-spacing');
  assert.equal(fixture.engine.snapshot().playedDry,1);
  assert.equal(fixture.engine.snapshot().missedContacts,0,'a rejected doublet is not a missing audio asset');
  assert.equal(fixture.engine.snapshot().suppressedContacts,1);
  fixture.ctx.currentTime+=.4;
  assert.equal(fixture.contact({plantIndex:2,interval:footContactGait(1.8).interval,latenessSeconds:0}).played,true);
  fixture.engine.destroy();
});

test('an authored tread and the first flat-floor plant share an audible spacing guard',async()=>{
  const fixture=audioFixture();await fixture.engine.preload({surface:'concrete'});
  assert.equal(fixture.contact({plantIndex:0,footSide:'left'}).played,true);
  fixture.ctx.currentTime+=.09;
  assert.equal(fixture.contact({plantIndex:1,footSide:'right',interval:footContactGait(11.1).interval,latenessSeconds:0}).played,false,
    'finishing the final20% of a tread does not authorize another immediate audible plant');
  fixture.ctx.currentTime+=.3;
  assert.equal(fixture.contact({plantIndex:2,footSide:'right',interval:footContactGait(11.1).interval,latenessSeconds:0}).played,true);
  assert.equal(fixture.engine.snapshot().playedDry,2);fixture.engine.destroy();
});

test('the player spacing guard does not suppress a separate actor walking nearby',async()=>{
  const fixture=audioFixture();await fixture.engine.preload({surface:'concrete'});
  assert.equal(fixture.contact({owner:'player',plantIndex:0}).played,true);
  assert.equal(fixture.contact({owner:'source-follower',plantIndex:0}).played,true);
  assert.equal(fixture.engine.snapshot().playedDry,2);fixture.engine.destroy();
});

test('clearing a material tail does not permit the same actor to plant twice in 128ms',async()=>{
  const fixture=audioFixture();await fixture.engine.preload({surface:'concrete'});
  assert.equal(fixture.contact().played,true);
  fixture.engine.clear('player');fixture.ctx.currentTime+=.128;
  assert.equal(fixture.contact().reason,'contact-spacing');
  fixture.ctx.currentTime+=.4;assert.equal(fixture.contact().played,true);
  fixture.engine.destroy();
});

test('audio scheduling preserves small natural variations below one display frame',async()=>{
  const fixture=audioFixture();await fixture.engine.preload({surface:'concrete'});
  const clock=createFootContactClock({seed:42731}),onsets=[],intervals=[];
  for(let i=0;i<60*180;i++){
    for(const event of clock.update({dt:1/60,distance:1.8/60,scene:'walk'})){
      fixture.ctx.currentTime=1+event.at;
      const receipt=fixture.contact(event);
      assert.equal(receipt.played,true,'ordinary natural gait must not hit the collision guard');
      assert.ok(receipt.scheduledAt>=fixture.ctx.currentTime,'a contact cannot be backdated');
      assert.ok(receipt.scheduledAt-fixture.ctx.currentTime<=.035+1e-8);
      onsets.push(receipt.onsetAt);intervals.push(event.interval);
    }
  }
  const gaps=onsets.slice(1).map((onset,i)=>onset-onsets[i]);
  const mean=gaps.reduce((sum,value)=>sum+value,0)/gaps.length;
  const deviation=Math.sqrt(gaps.reduce((sum,value)=>sum+(value-mean)**2,0)/gaps.length);
  assert.ok(deviation/mean>.01&&deviation/mean<.03,'subtle correlated variation must survive at the scheduled audio onsets');
  assert.ok(Math.max(...gaps.map((gap,i)=>Math.abs(gap-intervals[i+1])))<.001,
    '60Hz sampling must not turn an8ms variation into an unrelated frame-sized random delay');
  fixture.engine.destroy();
});

test('authored regularity and resistance remain distinct from natural gait and never repay a hesitation with a rush',()=>{
  const natural=track(createFootContactClock(),1.8,frames(120*30,1/120));
  const locked=track(createFootContactClock(),1.8,frames(120*30,1/120),{gaitTreatment:'locked'});
  const resisted=track(createFootContactClock(),1.8,frames(120*30,1/120),{gaitTreatment:'resistance'});
  assert.ok(new Set(natural.map(event=>event.interval.toFixed(6))).size>20);
  assert.equal(new Set(locked.map(event=>event.interval.toFixed(6))).size,1);
  const nominal=footContactGait(1.8).interval;
  assert.ok(resisted.some(event=>event.interval>nominal*1.15),'the resistant surface should hold a selected footfall');
  assert.ok(resisted.every(event=>event.interval>=nominal*.95),'recovery must not add compressed compensating contacts');
  assertNoCatchup(resisted,'resisted');
});
