import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,SOURCE_CONTINUATION_ROUTES as ROUTES,continuationRefugeAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation,resumeSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';

const point = value => ({x:value.x,z:value.z,feet:value.feet});
const separation = (a,b) => Math.hypot(a.x-b.x,a.z-b.z,a.feet-b.feet);
function tick(state,input={},events=[]){
  const result=stepSourceContinuation(state,{dt:.05,renderReady:true,...input});
  events.push(...result.events.map(event=>({...event,at:result.state.elapsed})));
  return result.state;
}
function walk(state,x,z){
  for(let n=0;n<1600;n++){
    const dx=x-state.x,dz=z-state.z,distance=Math.hypot(dx,dz);
    if(distance<.025&&!state.fall&&!state.recovery)return state;
    assert.equal(state.recovery,null,'the declared ordinary prefix must earn its own landings');
    state=tick(state,{forward:Math.min(1,distance/(C.walkSpeed*.05)),look:{yaw:Math.atan2(dx,-dz)}});
  }
  assert.fail(`ordinary prefix did not reach ${x},${z}`);
}
function graceFixture(){
  const fresh=resumeSourceContinuation(freshSourceContinuation({runId:'recovery-grace'}));
  return normalizeSourceContinuation({...fresh,x:8,z:-3,feet:0,grace:C.graceSeconds,
    lastSafe:{x:8,z:-3,feet:0,phase:'wrong-return',level:0,yaw:0,pitch:0},
    hush:{...fresh.hush,x:6,z:-3,feet:0,armed:true,warningAnnounced:true,mode:'yield',notice:C.hush.noticeSeconds,
      trail:[{kind:'walk',x:8,z:-3,feet:0,phase:'wrong-return',level:0}],lastRecorded:{x:8,z:-3,feet:0,phase:'wrong-return',level:0}}});
}

test('a continuous fresh upper-west capture returns only to its already earned anchor and cannot ferry forward',t=>{
  let state=resumeSourceContinuation(freshSourceContinuation({runId:'recovery-economy'}));
  for(const [x,z]of ROUTES.main.slice(1,11))state=walk(state,x,z);
  state=walk(state,-16,-22.03);
  const from=point(state),anchor=structuredClone(state.recoveryAnchor),unvisited=continuationRefugeAt(state),started=state.elapsed,events=[];
  assert.ok(anchor,'actual entry and stair landings establish an anchor');
  assert.notDeepEqual(point(anchor),point(unvisited),'the canonical upper refuge has not been visited');
  assert.equal(state.knowledge.includes('false-return-porch'),false);
  for(let n=0;n<800&&!state.recovery;n++)state=tick(state,{},events);
  assert.equal(state.recovery?.reason,'hush-pressure');
  assert.equal(state.recovery.repaired,false);
  assert.deepEqual(point(state.recovery.target),point(anchor));
  const duration=state.recovery.duration;
  for(let n=0;n<Math.ceil(C.recoveryMaximumSeconds/.05)+10&&state.recovery;n++){state=tick(state,{},events);assert.deepEqual(state.recoveryAnchor,anchor,'transport cannot earn an arrival anchor');}
  assert.equal(state.recovery,null,'the local return finishes within its declared bound');
  assert.deepEqual(point(state),point(anchor));assert.notDeepEqual(point(state),point(unvisited));
  assert.equal(state.knowledge.includes('false-return-porch'),false,'recovery never awards the unvisited return experience');
  assert.ok(state.grace>C.graceSeconds-.1);
  t.diagnostic('RECOVERY_ECONOMY_PROOF '+JSON.stringify({case:'continuous-upper-west-capture',from,earnedAnchor:anchor,returned:point(state),canonicalUnvisited:point(unvisited),waitAndRecoverySeconds:state.elapsed-started,recoverySeconds:duration,grace:state.grace,testPoseWritesAfterEntry:0}));
});

test('grace protects contact while the same physical Hush resumes after one finite notice',t=>{
  let state=graceFixture();const before=point(state.hush),started=state.elapsed,events=[];
  for(let n=0;n<10;n++)state=tick(state,{},events);
  assert.deepEqual(point(state.hush),before,'the ordinary notice interval supplies a readable departure');
  for(let n=0;n<12;n++){
    const actor=point(state.hush);state=tick(state,{},events);
    assert.ok(separation(state.hush,actor)<=C.hush.speed*.05+.001,'the actor walks rather than relocates');
  }
  assert.ok(state.grace>1.8&&state.grace<2);
  assert.ok(separation(state.hush,before)>.5,'grace cannot freeze the pursuer for its full three seconds');
  assert.equal(state.recovery,null,'nearby physical pursuit cannot capture during contact grace');
  assert.equal(events.filter(event=>event.type==='hush-notice').length,1,'grace cannot renew the notice every tick');
  const resumedAtGrace=state.grace,actorAtGrace=point(state.hush);
  for(let n=0;n<80&&!state.recovery;n++)state=tick(state,{},events);
  assert.equal(state.recovery?.reason,'hush-pressure','ordinary waiting becomes vulnerable when the bounded grace expires');
  const capture=events.find(event=>event.type==='capture');assert.ok(capture.at-started>=C.graceSeconds-1/120);
  t.diagnostic('RECOVERY_ECONOMY_PROOF '+JSON.stringify({case:'grace-is-contact-immunity',actorBefore:before,actorAt1_1Seconds:actorAtGrace,graceAt1_1Seconds:resumedAtGrace,noticeEvents:events.filter(event=>event.type==='hush-notice').length,firstCaptureAfterSeconds:capture.at-started}));
});

test('ordinary return resume preserves the earned anchor, pursuit memory and remaining grace',t=>{
  let state=graceFixture();for(let n=0;n<23;n++)state=tick(state);
  const saved=JSON.parse(JSON.stringify({...state,status:'returned'})),resumed=resumeSourceContinuation(saved);
  assert.equal(resumed.status,'active');assert.equal(resumed.elapsed,saved.elapsed);assert.equal(resumed.grace,saved.grace);
  assert.deepEqual(resumed.recoveryAnchor,saved.recoveryAnchor);assert.deepEqual(resumed.hush,saved.hush);
  const result=stepSourceContinuation(resumed,{dt:0,renderReady:true});
  assert.equal(result.events.some(event=>event.type==='hush-warning'||event.type==='hush-armed'),false);
  t.diagnostic('RECOVERY_ECONOMY_PROOF '+JSON.stringify({case:'return-resume-retains-economy',elapsed:resumed.elapsed,remainingGrace:resumed.grace,anchor:resumed.recoveryAnchor,actor:point(resumed.hush),armed:resumed.hush.armed,warningAnnounced:resumed.hush.warningAnnounced}));
});
