import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';
import {freshSourceFalseReturn} from '../src/game/source-false-return.js';

const layout={spawn:{x:0,z:1,feet:4.8,yaw:0,pitch:0},bounds:{minX:-3,maxX:3,minZ:-18,maxZ:4},
  doors:Array.from({length:5},(_,i)=>({id:'practice-'+i,x:0,z:-2-i*3,feet:4.8,normal:{x:0,z:-1},halfWidth:.8,counted:true,openSeconds:.45})),
  loops:[{id:'chapel',bounds:{minX:2,maxX:3,minZ:1,maxZ:4},arrival:{x:0,z:1,feet:4.8,yaw:0,pitch:0}}],
  supportAt:()=>({floor:4.8,ceil:8.4}),canOccupy:()=>true};
function make(extra={}){
  const trace=[],saved=[],drawn=[],renderer={initialize:async()=>true,ready:()=>true,render:s=>{drawn.push(s);return true;},dispose(){}};
  const scene=createSourceFalseReturnScene({checkpoint:freshSourceFalseReturn({runId:'scene',spawn:layout.spawn}),layout,renderer,
    onCheckpoint:(s,m)=>saved.push({s,m}),onTrace:t=>trace.push(t),...extra});return{scene,trace,saved,drawn};
}
function walk(scene,key,seconds){scene.key({key});for(let i=0;i<Math.round(seconds*60);i++)scene.update(1/60);scene.keyup({key});}
function wait(scene,seconds){for(let i=0;i<Math.round(seconds*60);i++)scene.update(1/60);}

test('the textless borrowed scene keeps door clocks, pause and held intent local',async()=>{
  const {scene,drawn}=make();await scene.initialize();assert.equal(scene.suppressesHud,true);
  walk(scene,'w',.5);scene.key({key:'e'});wait(scene,.15);
  scene.key({key:'w'});scene.pause();const before=scene.serialize();scene.update(1);assert.deepEqual(scene.serialize(),before);
  scene.resume();scene.key({key:'w',repeat:true});wait(scene,.5);assert.equal(scene.serialize().z,before.z);
  assert.equal(scene.serialize().opened.length,1);scene.render();assert.equal(drawn.length,1);scene.exit();
});

test('five actual door motions and a body crossing dispatch the Source threshold once',async()=>{
  let complete=0;const {scene,trace}=make({onComplete:()=>{complete++;return true;}});await scene.initialize();
  walk(scene,'w',.5);
  for(let door=0;door<5;door++){
    scene.key({key:'e'});wait(scene,.5);assert.equal(scene.serialize().opened.length,door+1);
    assert.equal(complete,0,'opening alone never changes worlds');walk(scene,'w',1);
  }
  wait(scene,.5);await Promise.resolve();assert.equal(complete,1);wait(scene,1);assert.equal(complete,1);
  assert.equal(scene.serialize().status,'completed');assert.equal(trace.filter(t=>t.event?.type==='complete').length,1);
  scene.exit();
});

test('a chapel loop releases held movement and key repeat cannot walk out of the arrival',async()=>{
  const {scene,trace}=make();await scene.initialize();walk(scene,'d',1);
  const loop=trace.find(t=>t.event?.type==='loop');assert.ok(loop);const at=scene.serialize();
  scene.key({key:'d',repeat:true});wait(scene,.5);assert.equal(scene.serialize().x,at.x);assert.equal(scene.serialize().z,at.z);
  scene.key({key:'w'});scene.update(.1);assert.ok(scene.serialize().z<at.z);scene.exit();
});

test('render preparation failure exposes no live movement and permits a fault-only retreat',async()=>{
  let returned=0;const {scene}=make({renderer:{initialize:async()=>false,render(){throw Error('not ready');}},onFaultReturn:()=>{returned++;},onError(){}});
  await scene.initialize();const at=scene.serialize();scene.key({key:'w'});scene.update(1);assert.deepEqual(scene.serialize(),at);
  scene.key({key:'x'});assert.equal(returned,1);scene.exit();
});

test('the existing F torch action survives borrowing Ellery and cannot repeat or fire while paused',async()=>{
  let switches=0;const {scene}=make({onTorch:()=>{switches++;return true;}});await scene.initialize();
  scene.key({key:'f'});scene.key({key:'f',repeat:true});assert.equal(switches,1);
  scene.pause();scene.key({key:'f'});assert.equal(switches,1);scene.resume();scene.key({key:'f'});assert.equal(switches,2);scene.exit();
});
