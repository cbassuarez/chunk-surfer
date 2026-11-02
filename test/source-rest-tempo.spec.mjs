import test from 'node:test';
import assert from 'node:assert/strict';
import {planSourceRestTempo,createSourceRestClock,SOURCE_REST_CATCH_CLOCK_OPTIONS} from '../src/game/source-rest-pacing.js';
import {createSourceRestMusic} from '../src/audio/source-rest-music.js';
import {createSourceRestCouperin} from '../src/audio/source-rest-couperin.js';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),flush=()=>new Promise(r=>setImmediate(r));
const mediaState=()=>({currentTime:0,duration:716.4,playedSeconds:0,audibleWallSeconds:0,playing:true,paused:false,protected:false,buffering:false,playbackRate:1});
const advance=(s,wall)=>{s.currentTime+=wall*s.playbackRate;s.playedSeconds+=wall*s.playbackRate;s.audibleWallSeconds+=wall;};

test('only distant approach has subtle bounded stretch; the bench and late budget stay at performed speed',()=>{
  let previous=.98;
  for(let t=0;t<=716;t+=1){
    const p=planSourceRestTempo({currentTime:t,duration:716.4});assert.ok(p.rate>=.96&&p.rate<=.98);assert.ok(p.rate<=previous+1e-9);previous=p.rate;
    assert.equal(planSourceRestTempo({currentTime:t,duration:716.4,nearSeat:true}).rate,1);
    assert.equal(planSourceRestTempo({currentTime:t,duration:716.4,seated:true}).rate,1);
  }
  const late=planSourceRestTempo({currentTime:400,duration:716.4,seated:true});assert.equal(late.rate,1);assert.ok(late.targetPlayhead<716.4&&late.targetPlayhead>550);assert.equal(late.budgetExhausted,true);
  const impossible=planSourceRestTempo({currentTime:700,duration:716.4,seated:true});assert.equal(impossible.budgetExhausted,true);assert.equal(impossible.rate,1);assert.ok(impossible.targetPlayhead>=700,'no backwards cue or hidden extra pass');
  const unsupported=planSourceRestTempo({currentTime:400,duration:716.4,seated:true,pitchPreserving:false});assert.equal(unsupported.rate,1);assert.equal(unsupported.fallback,'PITCH_PRESERVATION_UNAVAILABLE');
});

test('holding a choice never changes tempo; SourceIII still derives its full-duration readable budget',()=>{
  const options={phase:'catch',currentTime:200,duration:843.15712,progress:.2,seated:true},p=planSourceRestTempo({...options,decisionHeld:true});
  assert.equal(p.rate,1);assert.deepEqual(p,planSourceRestTempo(options));assert.ok(p.minimumRemainingSeconds>400);
  assert.equal(planSourceRestTempo({...options,seated:false,finishing:true}).rate,1);
  const end=planSourceRestTempo({phase:'catch',currentTime:843.15712,duration:843.15712,seated:true});assert.equal(end.mode,'finished');assert.equal(end.budgetExhausted,true);
});

test('a rejected tempo control uses the same unity-speed budget for its first cue and live recommendation',()=>{
  const media={...mediaState(),currentTime:250,playbackRate:1,pitchPreservationSupported:true,tempoSupported:false};
  const clock=createSourceRestClock(()=>media),frame=clock.update();
  assert.equal(frame.cueMode,'late-arrival');
  assert.equal(frame.cueMode,frame.tempoPlan.mode);
  assert.equal(frame.targetPlayhead,frame.tempoPlan.targetPlayhead);
  assert.equal(frame.tempoPlan.rate,1);
  assert.equal(frame.budgetExhausted,true);
});

test('narrative holds use listening wall time, while musical cue progress still uses the performed source',()=>{
  const s=mediaState(),c=createSourceRestClock(()=>s);c.update();advance(s,100);c.update(100);
  near(c.snapshot().heardSeconds,100);near(s.playedSeconds,100);near(c.snapshot().progress,.96*100/510);
  const before=c.snapshot();s.currentTime=650;c.update(600);near(c.snapshot().heardSeconds,before.heardSeconds);near(c.snapshot().progress,before.progress);
});

test('choice holds and same-phase revisits preserve progress without counting the walk away or another whole lead',()=>{
  const s=mediaState(),c=createSourceRestClock(()=>s);c.update();advance(s,100);c.update(100);c.hold();const held=c.snapshot().progress;
  advance(s,200);c.update(200);near(c.snapshot().progress,held);c.resume();near(c.snapshot().progress,held);
  const checkpoint=c.checkpoint();advance(s,200);const r=createSourceRestClock(()=>s,{resumeFrom:checkpoint});r.update();
  near(r.snapshot().heardSeconds,checkpoint.heardSeconds);near(r.snapshot().progress,checkpoint.progress);
  assert.ok(r.snapshot().tempoPlan.minimumRemainingSeconds<435);
  advance(s,1);r.update(1);near(r.snapshot().heardSeconds,checkpoint.heardSeconds+1);
});

test('an actual natural end has an eligible bounded tail; loading, buffering, pause and protection never advance it',()=>{
  const s={...mediaState(),currentTime:716.4,playing:false,ended:true},c=createSourceRestClock(()=>s);c.update();
  assert.equal(c.snapshot().flowing,true);assert.equal(c.snapshot().presentationTail,true);assert.equal(c.snapshot().failed,false);
  c.update(1000);near(c.snapshot().heardSeconds,.25);c.advanceTailCue(.28);near(c.snapshot().progress,.28);
  for(const field of ['paused','protected','buffering','seeking']){s[field]=true;const before=c.checkpoint();c.update(100);c.advanceTailCue(.96);assert.deepEqual(c.checkpoint(),before);s[field]=false;c.update(0);}
  c.hold();c.advanceTailCue(.96);near(c.snapshot().progress,.28);c.resume();c.advanceTailCue(.96);near(c.snapshot().progress,.96);
  for(let i=0;i<150;i++)c.update(.25);assert.equal(c.snapshot().progress,1);
  const loading=createSourceRestClock(()=>({playing:false,loading:true}));loading.update(999);assert.equal(loading.snapshot().flowing,false);assert.equal(loading.snapshot().untilBlack,null);
});

function audioFixture(factory,{pitch=true}={}){
  const nodes=[],elements=[];let protect=false;
  const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
  const node=kind=>{const n={kind,gain:param(),connections:[],connect(out,...ports){this.connections.push({out,ports});return out;},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const ctx={currentTime:0,state:'running',createGain:()=>node('gain'),createMediaElementSource:()=>node('source'),createChannelSplitter:()=>node('splitter')},out=node('out');
  const createElement=()=>{const events=new Map(),m={currentTime:0,duration:716.4,playbackRate:1,paused:true,ended:false,plays:0,seeking:false,
    play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){},addEventListener(k,fn){events.set(k,fn);},removeEventListener(k){events.delete(k);},emit(k){events.get(k)?.();}};
    let rate=1;m.rateWrites=[];Object.defineProperty(m,'playbackRate',{get:()=>rate,set(value){rate=value;this.rateWrites.push(value);}});
    if(pitch)m.preservesPitch=false;elements.push(m);return m;};
  const owner=factory({getAudio:()=>({ctx,destination:out}),protectedAudio:()=>protect,createElement});
  return{owner,ctx,nodes,elements,out,setProtected:v=>protect=v};
}
for(const [name,factory]of[['Bach',createSourceRestMusic],['Couperin',createSourceRestCouperin]]){
  test(`${name} keeps one single-pass stream, preserves pitch and measures source and listening seconds separately`,async()=>{
    const f=audioFixture(factory);f.owner.setPlaybackRate(.65,{immediate:true});f.owner.start();await flush();const m=f.elements[0];assert.equal(m.loop,false);assert.equal(m.preservesPitch,true);near(m.playbackRate,.96);
    f.ctx.currentTime=10;m.currentTime=9.6;f.owner.update();near(f.owner.snapshot().playedSeconds,9.6);near(f.owner.snapshot().audibleWallSeconds,10);assert.equal(f.owner.snapshot().audioTime,10);
    const writes=m.rateWrites.length;
    for(let i=0;i<60;i++){f.ctx.currentTime+=1/60;m.currentTime+=.96/60;f.owner.setPlaybackRate(.96);f.owner.update();}
    assert.equal(m.rateWrites.length,writes,'a stable requested rate must not reconfigure stretching every frame');
    f.owner.setPlaybackRate(1);const before=m.playbackRate;f.ctx.currentTime+=.1;m.currentTime+=before*.1;f.owner.update();assert.ok(m.playbackRate>before&&m.playbackRate-before<=.012001,'changes are bounded instead of a pitch/tempo jump');
    const position=m.currentTime;f.owner.setProgrammeDuck(.2,{seconds:0});near(f.owner.snapshot().programmeDuck,.2);near(m.currentTime,position);const paths=(n,seen=[])=>n===f.out?[seen]:n.connections.flatMap(c=>seen.includes(c.out)?[]:paths(c.out,[...seen,n]));
    const outputPaths=f.nodes.filter(n=>n.kind==='source').flatMap(n=>paths(n));assert.ok(outputPaths.length>0);assert.ok(outputPaths.every(path=>path.some(n=>n.gain.value===.2)),'every dry/wet stem path shares the programme duck');
    f.owner.update({paused:true});const heard=f.owner.snapshot().audibleWallSeconds;f.ctx.currentTime+=100;f.owner.update({paused:true});near(f.owner.snapshot().audibleWallSeconds,heard);f.owner.update({paused:false});await flush();near(m.currentTime,position);f.owner.dispose();
  });
  test(`${name} finishes naturally without a commit flag and never plays the terminal element again`,async()=>{
    const f=audioFixture(factory);f.owner.start();await flush();const m=f.elements[0];m.currentTime=m.duration;f.ctx.currentTime=m.duration;m.ended=true;m.paused=true;m.emit('ended');
    assert.equal(f.owner.snapshot().ended,true);assert.equal(f.owner.snapshot().completedFirstPass,true);const calls=m.plays;
    f.owner.start();f.owner.update();assert.equal(m.plays,calls);assert.equal(f.elements.length,1);f.owner.dispose();
  });
  test(`${name} leaves unsupported pitch-preservation at unity rather than shifting the performed pitch`,async()=>{
    const f=audioFixture(factory,{pitch:false});f.owner.setPlaybackRate(.6,{immediate:true});f.owner.start();await flush();assert.equal(f.elements[0].playbackRate,1);assert.equal(f.owner.snapshot().tempoSupported,false);assert.equal(f.owner.snapshot().tempoFallback,'PITCH_PRESERVATION_UNAVAILABLE');f.owner.dispose();
  });
}

test('a new phase restores its programme while retaining tempo and one-clock Couperin alignment',async()=>{
  const f=audioFixture(options=>createSourceRestScores(options));f.owner.start();await flush();assert.equal(f.elements.length,1);near(f.owner.snapshot().playbackRate,.98);
  f.owner.setProgrammeDuck(.3,{seconds:0});f.owner.selectPhase('catch');await flush();assert.equal(f.elements.length,2);assert.equal(f.elements[0].paused,true);assert.equal(f.owner.snapshot().phase,'catch');near(f.owner.snapshot().programmeDuck,1);near(f.owner.snapshot().playbackRate,.98);
  assert.equal(f.nodes.filter(n=>n.kind==='splitter').length,1);assert.equal(f.owner.snapshot().revoicing.sampleLocked,true);
  f.owner.setRestProgress(.2,true,{decisionHeld:true});assert.equal(f.owner.snapshot().decisionHeld,true);assert.equal(f.owner.snapshot().tempoPlan.rate,1);near(f.owner.snapshot().playbackRate,1);f.owner.dispose();
});

for(const phase of ['wrong-return','catch'])test(`${phase} proximity, sitting and ending force unity even against a manual override without replay or repeated writes`,async()=>{
  const f=audioFixture(options=>createSourceRestScores(options));f.owner.selectPhase(phase);f.owner.start();await flush();const m=f.elements[0];
  f.owner.setPlaybackRate(.1,{immediate:true});near(m.playbackRate,.96);m.currentTime=100;const starts=m.plays;
  f.owner.setRestProgress(0,false,{nearSeat:true});assert.equal(f.owner.snapshot().nearSeat,true);assert.equal(f.owner.snapshot().restActive,false);near(m.playbackRate,1);near(m.currentTime,100);
  f.owner.setPlaybackRate(.96,{immediate:true});assert.equal(m.playbackRate,1,'proximity cannot be overridden by a stale distant rate');
  f.owner.setRestProgress(.3,true,{decisionHeld:true});near(m.playbackRate,1);assert.equal(f.owner.snapshot().decisionHeld,true);
  const writes=m.rateWrites.length;
  for(let i=0;i<60;i++){f.ctx.currentTime+=1/60;m.currentTime+=1/60;f.owner.setRestProgress(.3,true,{decisionHeld:true});f.owner.update({active:true});}
  assert.equal(m.rateWrites.length,writes,'seated dialogue has no repeated playback-rate writes');assert.equal(m.plays,starts);assert.equal(f.elements.length,1);
  f.owner.setRestProgress(.3,false,{nearSeat:false});f.owner.setPlaybackRate(.96,{immediate:true});near(m.playbackRate,.96);
  f.owner.finishAfterCycle();near(m.playbackRate,1);f.owner.setPlaybackRate(.96,{immediate:true});near(m.playbackRate,1);
  for(let i=0;i<30;i++){f.ctx.currentTime+=1/60;m.currentTime+=1/60;f.owner.update({active:true});}
  assert.equal(m.plays,starts);assert.equal(f.elements.length,1);assert.equal(f.owner.snapshot().endingCommitted,true);f.owner.dispose();
});
