import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSupportAt} from '../src/data/source-continuation.js';
import {continuationVoidDomains,continuationVoidDomain} from '../src/data/source-continuation-void.js';
import {captureContinuationVoidLoop,wrapContinuationVoid,continuationVoidCameraEye} from '../src/game/source-continuation-void.js';
import {continuationBallisticStep,continuationFreeBody} from '../src/game/source-continuation-physics.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationFrame} from '../src/game/source-continuation.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const tick=(s,input={})=>stepSourceContinuation(s,{dt:C.fixedStep,...input});
function upperEdge(){const s=freshSourceContinuation({runId:'fixed-space'});return normalizeSourceContinuation({...s,status:'active',x:25.8,z:-31,feet:8.4,
  yaw:0,lastSafe:{x:25.8,z:-31,feet:8.4,chartId:0,phase:'wrong-return'},hush:{...s.hush,active:false}});}

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

test('one continuous upper-edge jump returns over the same real floor without capture, fade, grace or input release',()=>{
  let s=upperEdge(),events=[],wrapped=null,landed=false;
  for(let n=0;n<1000;n++){
    const r=tick(s,{side:1,jump:n===0});s=r.state;events.push(...r.events);
    if(r.events.some(e=>e.type==='space-wrap')){wrapped=clone(s);assert.ok(s.fall);assert.ok(s.fall.vx>3);assert.ok(s.fall.vy<0);}
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

test('real receiving support wins and a long-lived dimensional fall never becomes a timed recovery',()=>{
  const d=continuationVoidDomain({chartId:0,feet:8.4});
  const fall={x:-10,z:-31,feet:9,vx:0,vz:0,vy:-8,elapsed:20,unsupported:true,fromPhase:'wrong-return',
    voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4})};
  const r=continuationBallisticStep(fall,.2,{chartId:0});
  assert.ok(r.support);assert.equal(r.support.y,8.4);assert.equal(r.wraps.length,0);assert.equal(r.void,false);
  const airborne={...fall,x:30,z:10,feet:d.elevation-3,vy:-1,elapsed:20};
  assert.equal(continuationBallisticStep(airborne,.01,{chartId:0}).void,false);
});

test('Catch remains its authored receiving fall and has no Source-II address law',()=>{
  assert.equal(captureContinuationVoidLoop({chartId:0,feet:8.4,phase:'catch'}),null);
  const fall={x:-190,z:-110,feet:-30,vx:0,vz:0,vy:-8,elapsed:20,unsupported:true,fromPhase:'catch',voidLoop:null};
  const r=continuationBallisticStep(fall,.01,{chartId:0});
  assert.equal(r.wraps.length,0);assert.equal(r.void,true);
});
