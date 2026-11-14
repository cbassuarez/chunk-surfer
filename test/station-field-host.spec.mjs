import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function tickSourceSpace('),end=main.indexOf('  const wasRealm=',start);
assert.ok(start>=0&&end>start,'Source tick fixture has a valid host boundary');
const opening=main.slice(start,end)+'}\n';
test('a physical committed coastal crossing is presented on ordinary Source ticks on either road, once, without a reload',()=>{
 for(const phase of['bells','chapel-outskirts']){
  const calls=[],coast={active:true,phase,returnPose:{x:7,y:8,yaw:.2,pitch:.1}},ctx={usingSourceSpace:()=>true,paused:false,document:{hidden:false},coastalMemoryScene:null,chunkSurfRuntime:{coastalMemoryState:()=>coast},beginCoastalMemoryJourney:({checkpoint})=>{calls.push(checkpoint);ctx.coastalMemoryScene={};}};
  vm.createContext(ctx);vm.runInContext(opening+'globalThis.tick=tickSourceSpace',ctx);ctx.tick(.1);ctx.tick(.1);
  assert.equal(calls.length,1);assert.equal(calls[0],coast);
 }
});
test('a paused or hidden pending coast never takes presentation ownership early',()=>{
 for(const held of[{paused:true,hidden:false},{paused:false,hidden:true}]){
  let calls=0;const ctx={usingSourceSpace:()=>true,paused:held.paused,document:{hidden:held.hidden},coastalMemoryScene:null,chunkSurfRuntime:{coastalMemoryState:()=>({active:true})},beginCoastalMemoryJourney:()=>calls++};
  vm.createContext(ctx);vm.runInContext(opening+'globalThis.tick=tickSourceSpace',ctx);ctx.tick(.1);assert.equal(calls,0);
 }
});
