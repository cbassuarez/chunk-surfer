import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowChoreographyDirector} from '../src/platform/window-choreography.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildHorizonGodPreset} from '../src/game/chunk-surf-god.js';
import {CELL} from '../src/data/floorplan/legend.js';

test('the drive cancels an outskirts composition still acquiring its snapshots, before it can leak into the van',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;}),events=[];
 const director=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>false,
  effects:{registerSnapshot:async()=>{await pending;return'captured-fragment';},hideComposition:async()=>events.push('hidden'),hidePanes:async()=>{}},onState:e=>events.push(e.type)});
 const old=director.sourceDecay(.03);await Promise.resolve();
 assert.equal(director.debug().source.stage,'sealed');assert.equal(director.debug().decay.active,true);
 assert.equal(await director.leaveSource('source-drive'),true);release();assert.equal(await old,false);
 assert.equal(director.debug().composition,null);assert.equal(director.debug().decay.active,false);
 assert.equal(director.debug().decay.done,false,'the inserted journey does not consume the later on-foot window decay');
 assert.ok(!events.includes('composition'),'late snapshots cannot show a discarded composition');
});

test('on-foot window decay can resume at the restored exterior after the cinematic handoff',async()=>{
 const director=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>false});
 await director.sourceDecay(.03);assert.equal(director.debug().decay.active,true);
 await director.leaveSource('source-drive');assert.equal(director.debug().composition,null);
 await director.sourceDecay(.03);assert.equal(director.debug().decay.active,true);assert.equal(director.debug().decay.done,false);
 await director.restore('test-finished');
});

test('a driven return clears the actual Source goods plane and leaves its leaves fully open without replaying Source III',()=>{
 const runtime=createSourceSpaceRuntime({initialState:buildHorizonGodPreset(0,{seed:4417}).state});
 const door=runtime.edgeDoorFrame(),[a,b]=door.threshold,centre={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 const near={x:centre.x,y:centre.y-2,yaw:0,pitch:-.08,facing:0},before=runtime.state();
 const result=runtime.completeDrivenDoorCrossing({pose:near});assert.equal(result.handled,true);
 const out=[-door.normal[0],-door.normal[2]],clear=((result.position.x-centre.x)*out[0]+(result.position.y-centre.y)*out[1])*CELL;
 assert.ok(clear>=3.39,'the player returns beyond a full van, not a metre past the door');
 assert.equal(runtime.edgeDoorFrame().fraction,1);assert.equal(runtime.edgeDoorFrame().passable,true);
 assert.deepEqual(runtime.state().sourceContinuation,before.sourceContinuation,'the third Source section is not replayed');
 assert.deepEqual(runtime.state().sourceContacts,before.sourceContacts);
 const far={...result.position,x:result.position.x+.25,y:result.position.y-20,pitch:.1};
 assert.deepEqual(runtime.completeDrivenDoorCrossing({pose:far}).position,far,'an existing farther return is never pulled backward');
});

test('the actual drive host saves passed-door position, recorder and completion together; review fixtures preserve their supplied pose',async()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('    onReturned:async('),end=main.indexOf('\n    },\n  });',start);
 assert.ok(start>=0&&end>start);const handler=main.slice(start+'    onReturned:'.length,end+'\n    }'.length);
 for(const review of[false,true]){
  const owner={},writes=[],near={x:10,y:20,yaw:0,pitch:0,facing:0},passed={x:10,y:12,yaw:0,pitch:0,facing:0};let moves=0,releases=0;
  const context={owner,sourceDriveSession:owner,review,chunkSurfRuntime:{completeDrivenDoorCrossing(){moves++;return{handled:true,position:passed};},state:()=>({edgeDoorOpen:true}),setPlayerPosition(){}},
    saveCommit:patch=>writes.push(patch),REC:{saveRecState:()=>({injuries:2})},getSave:()=>({}),
    px:0,py:0,renderMove:null,motionRig:null,trail:[],releaseSourceDrive:()=>releases++,
    R3:{r3dSetLookAngles(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},towerBellDirector:null,bellPealPerformance:null,updateAudio(){}};
  vm.createContext(context);const callback=vm.runInContext('('+handler+')',context);
  await callback({returnPose:near,checkpoint:{status:'returned'},crossing:{kind:'driven-door'}});
  const expected=review?near:passed;assert.equal(writes.length,1);assert.equal(moves,review?0:1);assert.equal(releases,1);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].sourceDrive.returnPose)),expected);
  assert.equal(writes[0].px,expected.x);assert.equal(writes[0].py,expected.y);assert.equal(writes[0].rec.injuries,2);
  assert.equal(writes[0].chunkSurf.edgeDoorOpen,true);assert.equal(context.py,expected.y);
 }
});
