// The stuck rear door as a directed scene: leaf, lamps, torch and the body's
// recoil all run on the saved transit clock, so they replay and reload exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CELL} from '../src/data/floorplan/legend.js';
import {SOURCE_PRE_TAPE} from '../src/data/source-level.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';
import {buildPreTapeGodPreset} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {busPassageExitAngle,busPassageLampPower,busPassagePullJolt,busPassageTorchDirected} from '../src/game/outskirts-bus-passage.js';

const {pulls,kicks,attemptSeconds,recoilAt}=C.exit;
const at=(tryAt,clock,extra={})=>({trapAt:0,tryAt,clock,...extra});

test('the leaf kicks on each pull, harder each time, never swings in and comes to rest',()=>{
 assert.equal(busPassageExitAngle(at(10,10+pulls[0]-.01)),0);
 const peaks=pulls.map(p=>busPassageExitAngle(at(10,10+p+.05)));
 for(let i=1;i<peaks.length;i++)assert.ok(peaks[i]>peaks[i-1],'each pull lands harder than the last');
 assert.ok(Math.abs(peaks[2]-kicks[2])<.02);
 for(let t=0;t<2;t+=.01)assert.ok(busPassageExitAngle(at(10,10+t))>=0,'the leaf swung inward into the hand');
 assert.equal(busPassageExitAngle(at(10,10+attemptSeconds)),0);
 assert.equal(busPassageExitAngle({clock:5}),0);
});

test('the rear tube outlives the trap, flinches on two pulls and the third takes it; the lamp on her stays',()=>{
 const trapped={trapAt:0,clock:30};assert.equal(busPassageLampPower(trapped).rear,.72);assert.deepEqual(busPassageLampPower(trapped).strips,[0,0,0,0]);
 assert.ok(busPassageLampPower(at(10,10+pulls[0]+.02)).rear<.4);
 assert.equal(busPassageLampPower(at(10,10+(pulls[0]+pulls[1])/2)).rear,.72,'it comes back between pulls');
 assert.ok(busPassageLampPower(at(10,10+pulls[2]+.25)).rear<.06);
 for(const clock of[5,10.5,11.2,12,40])assert.equal(busPassageLampPower(at(10,clock)).face,.72);
});

test('inside the trap the torch answers the scene: sags at the beats, steady while she parts, the street clock outside it',()=>{
 assert.equal(busPassageTorchDirected({clock:4}),null,'before the door shuts the street owns the torch');
 assert.equal(busPassageTorchDirected({trapAt:0,clock:40,exited:true}),null);
 assert.equal(busPassageTorchDirected({trapAt:0,clock:40,interior:{active:true}}),null);
 assert.ok(busPassageTorchDirected({trapAt:0,clock:.43})<.75,'a strip dying pulls on the torch');
 assert.equal(busPassageTorchDirected({trapAt:0,clock:20}),1,'nothing is scheduled, so nothing fails at random');
 const third=10+pulls[2]+.18,level=busPassageTorchDirected(at(10,third));assert.ok(level<.3&&level>0,'the third pull nearly takes it');
 for(let t=.51;t<4;t+=.05)assert.equal(busPassageTorchDirected(at(10,30+t,{openAt:30})),1,`torch failed ${t}s into her opening`);
});

test('the pull jolt is the leaf kick, normalised, and silent before the first pull',()=>{
 assert.equal(busPassagePullJolt(0),0);assert.ok(busPassagePullJolt(pulls[2]+.05)>.9);
 assert.ok(busPassagePullJolt(pulls[2]+.5)<.02);
});

function fixture(){
 const b=buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength),f={p:b.position};
 f.r=createSourceSpaceRuntime({initialState:b.state});f.r.setPlayerPosition(f.p);f.bus=f.r.outskirtsPiece('r7-bus');
 f.at=(x,z)=>({x:(f.bus.x+x*Math.cos(f.bus.yaw)+z*Math.sin(f.bus.yaw))/CELL-.5,y:(f.bus.z-x*Math.sin(f.bus.yaw)+z*Math.cos(f.bus.yaw))/CELL-.5});
 f.tick=(dt=.25)=>{f.r.tickOutskirtsCharacters(dt,{viewYaw:0,suspended:false});f.r.outskirtsStreetFrame({viewYaw:0});};
 f.pose=(x,z,dt=.25)=>{f.p=f.at(x,z);f.r.setPlayerPosition(f.p);f.tick(dt);};
 f.local=p=>{const dx=(p.x+.5)*CELL-f.bus.x,dz=(p.y+.5)*CELL-f.bus.z,c=Math.cos(f.bus.yaw),s=Math.sin(f.bus.yaw);return{x:dx*c-dz*s,z:dx*s+dz*c};};
 f.tried=()=>{f.pose(.75,4);assert.equal(f.r.outskirtsPerformAction({action:'bus-exit-try',pass:7}).changed,true);};
 return f;
}

test('the third refusal sends a body in the bay back up the aisle, once, to where she can open',()=>{
 const f=fixture();f.tried();assert.equal(f.r.busTakeRecoil(),null,'it recoils before the pulls are done');
 for(let i=0;i<Math.ceil(recoilAt/.25);i++)f.tick();
 const recoil=f.r.busTakeRecoil();assert.ok(recoil&&Number.isFinite(recoil.x)&&Number.isFinite(recoil.yaw));
 assert.equal(recoil.seconds,C.exit.recoilSeconds);
 const landing=f.local(recoil);assert.ok(landing.z<=C.bodyPassage.frontZ-.1,`recoil lands in the bay at ${landing.z}`);
 assert.ok(Math.abs(landing.x)<.3,'recoil lands outside the aisle');
 assert.equal(f.r.busTakeRecoil(),null,'recoil fired twice');
 // Applied the way main applies it: OPEN is offered with nothing else to find.
 f.p={x:recoil.x,y:recoil.y};f.r.setPlayerPosition(f.p);f.tick();
 assert.equal(f.r.outskirtsPerformAction({action:'bus-woman-open',pass:7,viewYaw:recoil.yaw}).changed,true);
});

test('a body already clear of the bay only turns, and a saved scene keeps its recoil spent',()=>{
 const f=fixture();f.tried();f.pose(0,2.5,0);for(let i=0;i<Math.ceil(recoilAt/.25);i++)f.tick();
 const recoil=f.r.busTakeRecoil();assert.ok(recoil&&recoil.x==null&&Number.isFinite(recoil.yaw));
 const saved=JSON.parse(JSON.stringify(f.r.state()));assert.ok(saved.outskirtsExperience.busTransit.recoilAt!=null);
 const again=createSourceSpaceRuntime({initialState:saved});again.setPlayerPosition(f.p);assert.equal(again.busTakeRecoil(),null);
});
