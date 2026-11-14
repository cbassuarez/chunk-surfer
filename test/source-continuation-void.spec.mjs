import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSupportAt,continuationSurfaces} from '../src/data/source-continuation.js';
import {continuationVoidDomains,continuationVoidDomain} from '../src/data/source-continuation-void.js';
import {captureContinuationVoidLoop,wrapContinuationVoid,continuationVoidCameraEye} from '../src/game/source-continuation-void.js';
import {continuationBallisticStep,continuationFreeBody} from '../src/game/source-continuation-physics.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationFrame} from '../src/game/source-continuation.js';
import {freshContinuationHush,normalizeContinuationHush,advanceContinuationHush} from '../src/game/source-continuation-hush.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const tick=(s,input={})=>stepSourceContinuation(s,{dt:C.fixedStep,...input});
function upperEdge(){const s=freshSourceContinuation({runId:'fixed-space'});return normalizeSourceContinuation({...s,status:'active',x:25.8,z:-31,feet:8.4,
  yaw:0,lastSafe:{x:25.8,z:-31,feet:8.4,chartId:0,phase:'wrong-return'},hush:{...s.hush,active:false}});}

test('every existing Source-II support plane owns a fixed address, including intermediate stair treads',()=>{
  for(const surface of continuationSurfaces()){
    const at={chartId:surface.chartId??0,feet:surface.y,phase:surface.region};
    const loop=captureContinuationVoidLoop(at);
    if(surface.region==='catch')assert.equal(loop?.domainId,'source-iii-void:catch',surface.id);
    else {
      const domain=continuationVoidDomain(loop);
      assert.ok(domain,`unmapped floor: ${surface.id}`);
      assert.equal(domain.chartId,at.chartId);close(domain.elevation,surface.y);
    }
  }
});

test('all fixed floor and tread address cells have actual support and a clear receiving body column',()=>{
  assert.equal(continuationVoidDomains.length,33);
  for(const d of continuationVoidDomains){
    assert.equal(d.crossingPoint,'body-centre');close(d.entryFeetY-d.elevation,1.8);
    assert.ok(d.periodX>0&&d.periodZ>0);
    for(let ix=0;ix<=6;ix++)for(let iz=0;iz<=6;iz++){
      const x=d.minX+d.periodX*ix/6,z=d.minZ+d.periodZ*iz/6;
      assert.ok(continuationSupportAt(x,z,{chartId:d.chartId,feet:d.elevation},{minY:d.elevation-1e-6,maxY:d.elevation+1e-6}),d.id);
      for(let y=0;y<=8;y++)assert.ok(continuationFreeBody({x,z,feet:d.elevation+1.8*y/8},
        {chartId:d.chartId,elapsed:0,doorOpen:{},doorMotion:{}}),`${d.id}: receiving column`);
    }
  }
});

test('a crossing is the fixed integer isometry, independent of lastSafe, with momentum and elapsed time intact',()=>{
  for(const d of continuationVoidDomains){
    const fall={x:d.minX+d.periodX*7.38,z:d.minZ-d.periodZ*4.24,feet:d.exitFeetY-.037,
      chartId:d.chartId,level:0,vx:3.2,vz:-2.1,vy:-24,elapsed:32.4,yaw:.7,pitch:-.8,
      lastSupport:{x:999,z:-777,feet:d.elevation},voidLoop:captureContinuationVoidLoop({chartId:d.chartId,feet:d.elevation})};
    const before=clone(fall),r=wrapContinuationVoid(fall);assert.ok(r);
    close(fall.x,before.x+r.translation[0]);close(fall.z,before.z+r.translation[2]);close(fall.feet,before.feet+r.translation[1]);
    for(const k of['vx','vz','vy','elapsed','yaw','pitch'])assert.equal(fall[k],before[k]);
    assert.ok(fall.x>=d.minX&&fall.x<d.maxX&&fall.z>=d.minZ&&fall.z<d.maxZ);
    close(fall.feet,d.entryFeetY-.037);
    assert.equal(fall.voidLoop.wrapCount,1);
    const other={...before,lastSupport:{x:-888,z:777,feet:d.elevation}};
    assert.deepEqual(wrapContinuationVoid(other),r,'play history selected the receiving address');
  }
});

test('an older airborne save derives its sheet from the departure floor, never its distinct recovery anchor',()=>{
  const launched=tick(upperEdge(),{dt:0,side:1,jump:true}).state,old=clone(launched);
  delete old.fall.voidLoop;
  const entry=freshSourceContinuation({runId:old.runId});
  old.lastSafe=clone(entry.lastSafe);old.recoveryAnchor=clone(entry.recoveryAnchor);
  const restored=normalizeSourceContinuation(old),d=continuationVoidDomain(restored.fall.voidLoop);
  close(d.elevation,8.4);assert.equal(restored.lastSafe.feet,0);assert.equal(restored.recoveryAnchor.feet,0);
  const first={...restored.fall,feet:d.exitFeetY-.01},second={...launched.fall,feet:d.exitFeetY-.01};
  assert.deepEqual(wrapContinuationVoid(first),wrapContinuationVoid(second));
});

test('ordinary held forward walking from entry crosses and lands without surrendering the input',()=>{
  let state=freshSourceContinuation({runId:'entry-step-off'}),drop=null,crossing=null,landing=null;
  const events=[];
  for(let n=0;n<3000&&!landing;n++){
    const r=tick(state,{forward:1});state=r.state;events.push(...r.events);
    if(!drop&&r.events.some(e=>e.type==='drop'))drop=clone(state);
    if(!crossing&&r.events.some(e=>e.type==='space-wrap'))crossing=clone(state);
    if(crossing&&r.events.some(e=>e.type==='land'))landing=clone(state);
  }
  assert.ok(drop&&crossing&&landing);
  assert.equal(drop.fall.vz,-C.walkSpeed);assert.equal(crossing.fall.vz,-C.walkSpeed);
  // The walk's fall drift selects the z tile the crossing wraps through.
  const domain=continuationVoidDomain(crossing.lastSpaceWrap.domainId),translation=crossing.lastSpaceWrap.translation;
  close(translation[0],0);close(translation[1],domain.translationY);
  assert.ok(translation[2]>0);close(translation[2]/domain.periodZ,Math.round(translation[2]/domain.periodZ));
  assert.equal(landing.feet,C.spawn.feet);assert.equal(landing.recovery,null);assert.equal(landing.grace,0);
  assert.equal(events.some(e=>e.type==='capture'||e.type==='recovered'||e.type==='return'),false);
  const next=tick(landing,{forward:1}).state;
  assert.ok(next.z<landing.z,'the same held input must move after landing');
  assert.equal(next.yaw,0);assert.equal(next.phase,'wrong-return');
});

test('one continuous upper-edge jump returns over the same real floor without capture, fade, grace or input release',()=>{
  let s=upperEdge(),events=[],wrapped=null,landed=false;
  for(let n=0;n<1000;n++){
    const r=tick(s,{side:1,jump:n===0,run:true});s=r.state;events.push(...r.events);
    if(r.events.some(e=>e.type==='space-wrap')){wrapped=clone(s);assert.ok(s.fall);assert.ok(s.fall.vx>2.4);assert.ok(s.fall.vy<0);}
    if(wrapped&&!s.fall){landed=true;break;}
  }
  assert.ok(wrapped&&landed);assert.equal(s.feet,8.4);assert.equal(s.phase,'wrong-return');assert.equal(s.status,'active');
  assert.equal(s.recovery,null);assert.equal(s.grace,0);assert.equal(sourceContinuationFrame(s).blackoutAlpha,0);
  assert.ok(events.some(e=>e.type==='land'&&e.surface==='wrong-upper-west-head'));
  assert.equal(events.some(e=>['capture','recovered','reveal-complete'].includes(e.type)),false);
  assert.equal(s.knowledge.includes('false-return-porch'),false);assert.equal(s.doorOpen['wrong-onward'],undefined);
  assert.equal(s.lastSpaceWrap.domainId,'source-ii-void:0:84000');
  assert.deepEqual(tick(clone(wrapped)).state,tick(wrapped).state);
  assert.deepEqual(normalizeSourceContinuation(clone(wrapped)),wrapped);
  for(const gate of[{paused:true},{renderReady:false}])assert.deepEqual(tick(wrapped,{...gate,dt:.25}).state,wrapped);
});

test('the eye keeps its complete old coordinate image until its own spatial crossing, without orientation easing',()=>{
  const d=continuationVoidDomain({chartId:0,feet:8.4});
  const fall={x:40,z:-60,feet:d.exitFeetY-.01,chartId:0,vx:3,vy:-27,vz:-2,
    voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4})};
  const before=[fall.x,fall.feet+C.eyeHeight,fall.z],receipt=wrapContinuationVoid(fall);
  const state={fall,lastSpaceWrap:receipt,cameraTransit:{elapsed:.23,duration:.55,right:[1,0,0],up:[0,1,0],forward:[0,0,-1]}};
  const untouched=clone(state.cameraTransit);
  const eye=continuationVoidCameraEye(state,[fall.x,fall.feet+C.eyeHeight,fall.z]);
  eye.forEach((v,k)=>close(v,before[k]));assert.deepEqual(state.cameraTransit,untouched);
  const below=[fall.x,d.entryY-.1,fall.z];assert.deepEqual(continuationVoidCameraEye(state,below),below);
});

test('saving on either side of the seam resumes the identical fall, crossing receipt and actual landing',()=>{
  let state=upperEdge(),before=null,after=null;
  const d=continuationVoidDomain({chartId:0,feet:8.4});
  for(let n=0;n<1000&&!after;n++){
    if(state.fall&&state.fall.feet>d.exitFeetY&&state.fall.feet<d.exitFeetY+.5)before=clone(state);
    state=tick(state,{side:1,jump:n===0}).state;
    if(state.lastSpaceWrap)after=clone(state);
  }
  assert.ok(before&&after);
  for(const captured of[before,after]){
    let original=clone(captured),resumed=normalizeSourceContinuation(clone(captured));
    assert.deepEqual(resumed,original);
    const receipts=[];
    for(let n=0;n<240&&original.fall;n++){
      const a=tick(original,{side:1,jump:true}),b=tick(resumed,{side:1,jump:true});
      assert.deepEqual(b,a,`diverged after ${n} ticks`);
      receipts.push(...a.events);original=a.state;resumed=b.state;
    }
    assert.equal(original.fall,null);assert.equal(original.feet,8.4);
    assert.equal(original.lastSpaceWrap.serial,1);
    assert.equal(receipts.filter(e=>e.type==='space-wrap').length,captured===before?1:0);
    assert.equal(receipts.some(e=>e.type==='capture'||e.type==='recovered'),false);
  }
});

test('HUSH crosses the same dimensional seam without manufacturing grounded travel or density traction',()=>{
  const d=continuationVoidDomain({chartId:0,feet:8.4}),at={x:30,z:20,feet:d.exitFeetY+.01,chartId:0,phase:'wrong-return',level:0};
  const actor=normalizeContinuationHush({...freshContinuationHush(at),mode:'falling',armed:true,warningAnnounced:true,
    animationClock:12,trail:[],fall:{...at,vx:3.2,vz:-2.1,vy:-24,elapsed:4,unsupported:true,
      fromPhase:'wrong-return',trigger:'step-off',lastSupport:{x:25.8,z:-31,feet:8.4,chartId:0},
      voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4})}});
  const before=clone(actor),events=[];
  advanceContinuationHush(actor,{dt:C.fixedStep,player:{x:0,z:0,feet:8.4,chartId:0,phase:'wrong-return',elapsed:10,doorOpen:{},doorMotion:{}},events});
  assert.ok(actor.fall);assert.equal(actor.recovery,null);
  assert.equal(actor.lastSpaceWrap.serial,1);
  assert.equal(actor.lastSpaceWrap.domainId,d.id);
  assert.equal(actor.animationClock,before.animationClock);assert.equal(actor.density.phase,before.density.phase);
  assert.equal(actor.fall.vx,before.fall.vx);assert.equal(actor.fall.vz,before.fall.vz);
  close(actor.fall.vy,before.fall.vy-C.gravity*C.fixedStep);
  assert.equal(events.filter(e=>e.type==='hush-space-wrap').length,1);
  assert.equal(events.some(e=>e.type==='hush-recovery'),false);
  // JSON stores both signed zeroes as 0. Compare the serialized checkpoint;
  // the trajectory and spatial receipt must remain otherwise identical.
  assert.deepEqual(normalizeContinuationHush(clone(actor)),clone(actor));
});

test('real receiving support wins and a long-lived dimensional fall never becomes a timed recovery',()=>{
  const d=continuationVoidDomain({chartId:0,feet:8.4});
  const fall={x:-10,z:-31,feet:9,vx:0,vz:0,vy:-8,elapsed:20,unsupported:true,fromPhase:'wrong-return',
    voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4})};
  const r=continuationBallisticStep(fall,.2,{chartId:0});
  assert.ok(r.support);assert.equal(r.support.y,8.4);assert.equal(r.wraps.length,0);assert.equal(r.void,false);
  const airborne={...fall,x:30,z:10,feet:d.elevation-3,vy:-1,elapsed:20};
  assert.equal(continuationBallisticStep(airborne,.01,{chartId:0}).void,false);
});

test('Catch uses the same fixed address law over its real exposed top crescent',()=>{
  const loop=captureContinuationVoidLoop({chartId:0,feet:-30.6,phase:'catch'}),d=continuationVoidDomain(loop);
  assert.equal(d.id,'source-iii-void:catch');assert.ok(d.periodX>0&&d.periodZ>0);
  for(let i=0;i<=6;i++)for(let j=0;j<=6;j++){
    const x=d.minX+d.periodX*i/6,z=d.minZ+d.periodZ*j/6;
    assert.match(continuationSupportAt(x,z,{chartId:0,feet:d.elevation}).id,/catch-0-case-crescent/);
    for(let y=0;y<=8;y++)assert.ok(continuationFreeBody({x,z,feet:d.elevation+1.8*y/8},{chartId:0,elapsed:0,doorOpen:{},doorMotion:{}}));
  }
  const fall={x:-190,z:-112,feet:d.exitFeetY-.01,vx:3.2,vz:-2.1,vy:-28,elapsed:20,chartId:0,fromPhase:'catch',voidLoop:loop};
  const r=continuationBallisticStep(fall,.01,{chartId:0});
  assert.equal(r.wraps.length,1);assert.equal(r.void,false);assert.equal(fall.vx,3.2);assert.equal(fall.vz,-2.1);
  assert.equal(r.wraps[0].after.phase,'catch');assert.equal(r.wraps[0].before.phase,'catch');
});

test('Source III arbitrary missed catches return through real top support without capture, grace or surrendering momentum',()=>{
  const d=continuationVoidDomain('source-iii-void:catch');
  for(const [x,z,vx,vz] of [[-190,-112,3.2,-2.1],[-143,-72,-3,1.7],[-210,-92,0,3.2],[-172,-120,-2,0]]){
    const fresh=freshSourceContinuation({runId:'iii-physical-gluing'}),fall={x,z,feet:d.exitFeetY+.04,chartId:0,level:5,vx,vz,vy:-27,
      elapsed:6,fromPhase:'catch',fromLevel:5,trigger:'step-off',unsupported:true,groundedExit:true,
      lastSupport:{x:-170,z:-95,feet:-24.6,phase:'catch',level:5,chartId:0},voidLoop:captureContinuationVoidLoop({phase:'catch'})};
    let state=normalizeSourceContinuation({...fresh,status:'active',phase:'catch',...fall,fall,grace:0,hush:{...fresh.hush,active:false}}),wrapped=null;
    const events=[];
    for(let n=0;n<300&&(!wrapped||state.fall);n++){
      const result=tick(state);state=result.state;events.push(...result.events);
      if(result.events.some(e=>e.type==='space-wrap'))wrapped=clone(state);
    }
    assert.ok(wrapped);assert.equal(state.fall,null);assert.equal(state.phase,'catch');assert.equal(state.level,0);close(state.feet,d.elevation);
    close(wrapped.fall.vx,vx);close(wrapped.fall.vz,vz);assert.equal(state.recovery,null);assert.equal(state.grace,0);
    assert.equal(events.some(e=>['capture','recovered','contact','return'].includes(e.type)),false);
    assert.equal(sourceContinuationFrame(state).blackoutAlpha,0);
    assert.deepEqual(normalizeSourceContinuation(clone(wrapped)),wrapped,'mid-seam save preserves the same III trajectory');
    assert.deepEqual(tick(normalizeSourceContinuation(clone(wrapped))),tick(wrapped));
    for(const gate of [{paused:true},{renderReady:false}])assert.deepEqual(tick(wrapped,{...gate,dt:.25}).state,wrapped);
  }
});

test('Source III HUSH inherits the same fixed address and cannot be stranded outside the cascade',()=>{
  const d=continuationVoidDomain('source-iii-void:catch'),at={x:-190,z:-112,feet:d.exitFeetY+.01,chartId:0,phase:'catch',level:5},
    loop=captureContinuationVoidLoop({phase:'catch'}),fall={...at,vx:3.2,vz:-2.1,vy:-27,elapsed:6,unsupported:true,fromPhase:'catch',
      trigger:'step-off',lastSupport:{x:-170,z:-95,feet:-24.6,chartId:0,phase:'catch'},voidLoop:loop},
    actor=normalizeContinuationHush({...freshContinuationHush(at),mode:'falling',armed:true,warningAnnounced:true,trail:[],fall}),
    expected={...fall},events=[];
  continuationBallisticStep(expected,C.fixedStep,{chartId:0});
  advanceContinuationHush(actor,{dt:C.fixedStep,player:{x:-162,z:-92,feet:8.4,chartId:0,phase:'catch',elapsed:20,doorOpen:{},doorMotion:{}},events});
  assert.equal(actor.lastSpaceWrap.domainId,d.id);close(actor.x,expected.x);close(actor.z,expected.z);close(actor.feet,expected.feet);
  assert.equal(actor.lastSpaceWrap.after.phase,'catch');assert.equal(actor.recovery,null);
  for(let n=0;n<120&&actor.fall;n++)advanceContinuationHush(actor,{dt:C.fixedStep,
    player:{x:-162,z:-92,feet:8.4,chartId:0,phase:'catch',elapsed:20,doorOpen:{},doorMotion:{}},events});
  assert.equal(actor.fall,null);assert.equal(actor.phase,'catch');close(actor.feet,d.elevation);assert.equal(actor.active,true);
  assert.ok(events.some(e=>e.type==='hush-land'));assert.equal(events.some(e=>e.type==='hush-recovery'),false);
});

test('a normal unmarked outer-edge miss and its pursuing HUSH both complete the III loop on their own routes',()=>{
  const a=.45,r=12.47,x=C.catch.center.x+Math.cos(a)*r,z=C.catch.center.z+Math.sin(a)*r;
  let state=freshSourceContinuation({runId:'iii-shared-pursuit'});
  state=normalizeSourceContinuation({...state,status:'active',phase:'catch',x,z,feet:2.4,level:1,grace:0,
    lastSafe:{x,z,feet:2.4,phase:'catch',level:1,chartId:0,yaw:0,pitch:0},
    hush:{...state.hush,active:true,armed:true,warningAnnounced:true,notice:0,phase:'catch',level:1,
      x:x-Math.cos(a)*2,z:z-Math.sin(a)*2,feet:2.4,mode:'follow',trail:[],arrival:{stage:'seen',elapsed:20}}});
  const events=[];let dropped=false,followed=false;
  for(let n=0;n<2200&&!followed;n++){
    const result=tick(state,!dropped?{side:Math.cos(a),forward:-Math.sin(a)}:{});state=result.state;events.push(...result.events);
    if(state.fall)dropped=true;
    followed=events.some(e=>e.type==='hush-space-wrap')&&!state.hush.fall;
  }
  assert.ok(dropped&&followed);assert.equal(state.fall,null);assert.equal(state.hush.fall,null);
  assert.equal(state.level,0);assert.equal(state.hush.level,0);assert.equal(state.feet,8.4);assert.equal(state.hush.feet,8.4);
  for(const type of ['drop','hush-drop','space-wrap','hush-space-wrap','land','hush-land'])assert.equal(events.filter(e=>e.type===type).length,1,type);
  assert.equal(state.hush.mode,'follow');assert.equal(state.hush.active,true);assert.equal(state.grace,0);
  assert.equal(state.completed,false);assert.equal(state.handoff,false);assert.equal(state.status,'active');
  assert.equal(events.some(e=>['capture','hush-recovery','recovered','contact','return','handoff'].includes(e.type)),false);
});
