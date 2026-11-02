import test from 'node:test';
import assert from 'node:assert/strict';
import {createNatatoriumCoffeeStretch,natatoriumCoffeeExponent} from '../src/game/natatorium-coffee-stretch.js';

const ordinary={inside:false,coffeeTaken:true,bodyX:84,bodyZ:31,runKey:'run-a'};
const enter=(controller,extra={})=>{controller.tick(.1,ordinary);return controller.tick(.1,{...ordinary,inside:true,bodyZ:32.8,...extra});};
test('only an actual entry after consuming coffee starts the ten-second visit',()=>{
  const sober=createNatatoriumCoffeeStretch();
  assert.equal(enter(sober,{coffeeTaken:false}).active,false);
  assert.equal(sober.tick(.1,{...ordinary,inside:true,coffeeTaken:true}).active,false,'acquiring coffee while already inside waits for a later entry');
  const coffee=createNatatoriumCoffeeStretch(),frame=enter(coffee);
  assert.equal(frame.active,true);assert.equal(frame.entryAnchor.z,32.8);assert.equal(frame.metric.pivotZ,32.8);
  const moved=coffee.tick(.1,{...ordinary,inside:true,bodyZ:33.2});
  assert.equal(moved.entryAnchor.z,32.8,'the actual entry remains recorded');
  assert.equal(moved.metric.pivotZ,33.2,'the untouched interaction neighborhood follows the canonical body');
  for(let i=0;i<110;i++)coffee.tick(.1,{...ordinary,inside:true});
  assert.equal(coffee.view().active,false);assert.equal(coffee.view().metric.k,0);
});
test('the bounded temporal curve lengthens, compresses and restores without a FOV control',()=>{
  assert.equal(natatoriumCoffeeExponent(0),0);assert.equal(natatoriumCoffeeExponent(6.2),2.8);
  assert.equal(natatoriumCoffeeExponent(8),-2.1);assert.equal(natatoriumCoffeeExponent(8.6),-2.1);
  assert.equal(natatoriumCoffeeExponent(10),0);
  let maximumRate=0;
  for(let t=.001;t<10;t+=.001){const k=natatoriumCoffeeExponent(t);assert.ok(k>=-2.1&&k<=2.8);maximumRate=Math.max(maximumRate,Math.abs(k-natatoriumCoffeeExponent(t-.001))/.001);}
  assert.ok(maximumRate<5.2);assert.equal('fov' in enter(createNatatoriumCoffeeStretch()),false);
});
test('pause, focus and large resumed deltas cannot spend suspended wall time',()=>{
  const c=createNatatoriumCoffeeStretch();enter(c);const before=c.view().elapsed;
  c.tick(60,{...ordinary,inside:true,paused:true});assert.equal(c.view().elapsed,before);
  c.tick(60,{...ordinary,inside:true,focused:false});assert.equal(c.view().elapsed,before);
  c.tick(60,{...ordinary,inside:true});assert.ok(Math.abs(c.view().elapsed-before-.1)<1e-9);
});
test('scene ownership, reduced motion, exiting, reload and run changes leave exact identity',()=>{
  for(const interruption of [{eligible:false},{reducedMotion:true},{inside:false},{discontinuous:true},{runKey:'run-b'}]){
    const c=createNatatoriumCoffeeStretch();enter(c);assert.equal(c.view().active,true);
    c.tick(.1,{...ordinary,inside:true,...interruption});assert.equal(c.view().active,false,JSON.stringify(interruption));assert.equal(c.view().metric.k,0);
  }
  const restored=createNatatoriumCoffeeStretch();
  assert.equal(restored.tick(.1,{...ordinary,inside:true}).active,false,'loading already in the pool cannot manufacture an entry');
  assert.equal(enter(createNatatoriumCoffeeStretch(),{reducedMotion:true}).active,false);
});
test('door jitter cannot retrigger; a genuine retreat can rearm a subsequent visit',()=>{
  const c=createNatatoriumCoffeeStretch();enter(c);
  c.tick(.1,ordinary);assert.equal(c.tick(.1,{...ordinary,inside:true}).active,false);
  c.tick(.1,ordinary);
  for(let i=0;i<12;i++)c.tick(.1,{...ordinary,bodyZ:29.5});
  assert.equal(c.tick(.1,{...ordinary,inside:true,bodyZ:32.8}).active,true);
});
