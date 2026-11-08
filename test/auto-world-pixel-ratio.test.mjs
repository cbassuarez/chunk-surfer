import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoWorldPixelRatio} from '../src/platform/auto-world-pixel-ratio.js';

function harness({nativeDpr=2,auto=true}={}){
  const policy=createAutoWorldPixelRatio();let t=0,options={auto,nativeDpr,active:true};const changes=[];
  const frame=(dt,overrides={})=>{t+=dt;const result=policy.frame(t,{...options,...overrides});if(result.changed)changes.push({...result,time:t});return result;};
  const run=(seconds,dt=16.667,overrides={})=>{const end=t+seconds*1000;let out;while(t<end)out=frame(Math.min(dt,end-t),overrides);return out;};
  return{policy,frame,run,changes,get time(){return t;}};
}

test('Auto starts at one physical pixel per CSS pixel, bounded by native DPR; explicit stays native',()=>{
 for(const dpr of [.4,.75,1,1.5,2,3]){
  const h=harness({nativeDpr:dpr});const first=h.frame(1);
  assert.equal(first.ratio,Math.min(dpr,1));assert.equal(first.ceiling,Math.min(dpr,1));assert.ok(first.ratio<=dpr);
  const explicit=h.frame(16,{auto:false});assert.equal(explicit.ratio,null);assert.equal(explicit.changed,true);
  const stays=h.run(30,80,{auto:false});assert.equal(stays.ratio,null);assert.equal(stays.changed,false);
  assert.equal(h.frame(16,{auto:true}).ratio,Math.min(dpr,1));
 }
});

test('sustained slow frames step down with warmup, two windows, cooldown and a floor',()=>{
 const h=harness();h.frame(1);h.run(5,40);assert.equal(h.policy.snapshot().ratio,1,'no early reaction');
 h.run(3,40);assert.equal(h.policy.snapshot().ratio,.875);
 const firstLower=h.changes.find(c=>c.reason==='lower');
 h.run(40,40);assert.equal(h.policy.snapshot().ratio,.375);const drops=h.changes.filter(c=>c.reason==='lower');
 assert.equal(drops.length,5);assert.ok(drops.every((x,i)=>i===0||x.time-drops[i-1].time>=5000));assert.ok(firstLower.time>=6000);
 h.run(30,40);assert.equal(h.policy.snapshot().ratio,.375,'never below the extended floor');
});

test('very low but continuous frame rates still trigger reduction',()=>{
 const h=harness();h.frame(1);h.run(16,300);assert.ok(h.policy.snapshot().ratio<1);
});

test('good headroom must persist for 20 seconds and recovery never exceeds Auto baseline',()=>{
 const h=harness();h.frame(1);h.run(8,40);assert.equal(h.policy.snapshot().ratio,.875);
 h.run(18,16.667);assert.equal(h.policy.snapshot().ratio,.875,'not before cooldown and 20 seconds of evidence');
 h.run(15,16.667);assert.equal(h.policy.snapshot().ratio,1);h.run(80,16.667);
 assert.equal(h.policy.snapshot().ratio,1);assert.equal(h.changes.filter(c=>c.reason==='recover').length,1);
});

test('pauses, hidden/loading frames and isolated long stalls do not trigger downshift or catch-up',()=>{
 const h=harness();h.frame(1);h.run(5,16.667);h.frame(8000,{active:false});h.run(3,40,{active:false});
 assert.equal(h.policy.snapshot().ratio,1);h.frame(16.667);h.run(3,16.667);
 h.frame(1200);h.run(4,16.667);assert.equal(h.policy.snapshot().ratio,1);
 for(let i=0;i<4;i++){h.run(1,16.667);h.frame(100);}
 h.run(4,16.667);assert.equal(h.policy.snapshot().ratio,1,'single short spikes do not accumulate into slow windows');
});

test('30-fps boundary is stable, and switching screens restarts without persisted state',()=>{
 const h=harness();h.frame(1);h.run(35,1000/30);assert.equal(h.policy.snapshot().ratio,1);
 h.run(8,36);assert.equal(h.policy.snapshot().ratio,.875);
 const switched=h.frame(16,{nativeDpr:.75});assert.equal(switched.ratio,.75);assert.equal(switched.reason,'auto-start');
 h.run(8,40,{nativeDpr:.75});assert.equal(h.policy.snapshot().ratio,.625);
 const nonauto=h.frame(16,{auto:false,nativeDpr:.75});assert.equal(nonauto.ratio,null);
});
