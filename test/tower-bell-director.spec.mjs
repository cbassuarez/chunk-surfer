import assert from 'node:assert/strict';
import { SOURCE_BELL_WASH_SECONDS, createTowerBellDirector, towerBellSpatialFrame } from '../src/game/tower-bell-director.js';

const source={x:90,y:15,z:55};
const near=towerBellSpatialFrame({source,listener:{x:91,y:15,z:56,yaw:0},mix:1});
const below=towerBellSpatialFrame({source,listener:{x:91,y:5,z:56,yaw:0},mix:1});
assert.ok(near.gain>below.gain);assert.ok(near.lowpassHz>below.lowpassHz);assert.equal(below.crossFloor,true);assert.ok(below.floorLossDb>=15);

const mixes=[],strikes=[];
const audio={start(){},strike(record){strikes.push(record);},setWorldMix(frame){mixes.push(frame);},maskingDb(){return 18;}};
const director=createTowerBellDirector({audio,source,sourceSpatial:{areaId:'conservatory',roomId:'bell_tower',floorId:'upper',position:{x:10,y:10}}});
director.start();director.tick(8,{listener:{...source,yaw:0}});assert.ok(strikes.length>=4);
const before=director.snapshot().elapsedMs,preWashGain=director.snapshot().frame.gain;director.enterSource();
director.tick(1,{listener:{x:0,y:0,z:0,yaw:2.4}});assert.ok(director.snapshot().frame.gain<preWashGain,'Source wash decays the pre-entry frame instead of spatially swelling');
director.tick(SOURCE_BELL_WASH_SECONDS-1,{listener:{x:0,y:0,z:0,yaw:2.4}});
assert.equal(director.snapshot().mode,'source_muted');assert.equal(director.snapshot().mix,0);assert.ok(director.snapshot().elapsedMs>before);
director.setTransitionProgress(.35);director.tick(.1,{listener:{...source,yaw:0}});assert.equal(director.snapshot().mix,0);
director.setTransitionProgress(1);director.tick(.1,{listener:{...source,yaw:0}});assert.equal(director.snapshot().mix,1);
const handoff=director.handoff();assert.equal(handoff.elapsedMs,director.snapshot().elapsedMs);assert.ok(mixes.length>0);
const restored=createTowerBellDirector({audio,source});
restored.start({offsetMs:handoff.elapsedMs,nextMode:'source_wash',washElapsedMs:4500,restoredTransitionProgress:.4});
assert.equal(restored.snapshot().washMs,4500);assert.equal(restored.snapshot().transitionProgress,.4);

let audioNow=5000;
const clocked=createTowerBellDirector({audio,source,now:()=>audioNow});
clocked.start();audioNow=5750;clocked.tick(.001,{listener:source});
assert.equal(clocked.snapshot().elapsedMs,750,'render cadence cannot advance the authoritative transport');
clocked.suspend();audioNow=8750;clocked.tick(3,{listener:source});assert.equal(clocked.snapshot().elapsedMs,750);
clocked.resume();audioNow=9000;clocked.tick(.001,{listener:source});assert.equal(clocked.snapshot().elapsedMs,1000,'resume excludes suspended audio time');
console.log('tower bell director tests ok');
