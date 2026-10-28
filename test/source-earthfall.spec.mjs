import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_EARTHFALL as C,SOURCE_EARTHFALL_STRATA,sourceEarthfallUpperHeight,sourceEarthfallLowerContains,sourceEarthfallCellLayout,sourceEarthfallFracturePose,sourceEarthfallReleasePlan,earthfallExitDoorHeight} from '../src/data/source-earthfall.js';
import {freshSourceEarthfall,normalizeSourceEarthfall,stepSourceEarthfall,sourceEarthfallFrame,sourceEarthfallSupportAt} from '../src/game/source-earthfall.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const fresh=()=>freshSourceEarthfall({runId:'earthfall-test',returnPose:{x:7,y:-919,yaw:.3,preserved:['original-field']}});
const step=(s,input={})=>stepSourceEarthfall(s,input).state;
function advance(s,seconds,input={}){const events=[];for(let time=0;time+1e-8<seconds;){const dt=Math.min(1/120,seconds-time),r=stepSourceEarthfall(s,{...input,dt});s=r.state;events.push(...r.events);time+=dt;}return{state:s,events};}
function committed(){let s=fresh();for(let i=0;i<120&&!s.committed;i++)s=step(s,{dt:1/120,forward:1});assert.ok(s.committed);return s;}
function landed(){const s=advance(committed(),10).state;assert.equal(s.phase,'landed');return s;}
function walk(s,x,z){const events=[];for(let i=0;i<6000&&s.status==='active';i++){const dx=x-s.x,dz=z-s.z,d=Math.hypot(dx,dz);if(d<.025)return{state:s,events};const r=stepSourceEarthfall(s,{dt:1/120,forward:Math.min(1,d/(C.walkSpeed/120)),look:{yaw:Math.atan2(dx,-dz)}});s=r.state;events.push(...r.events);}return{state:s,events};}

test('a finite corridor stands100m above a separate visible landing head and3.6m SourceII spine',()=>{
 const s=fresh(),f=sourceEarthfallFrame(s);assert.equal(C.upperFloor-C.lowerFloor,100);assert.equal(C.earth.maxX-C.earth.minX,18);assert.equal(C.passage.halfWidth*2,3.6);
 assert.ok((C.catch.maxX-C.catch.minX)*(C.catch.maxZ-C.catch.minZ)<550,'the old192x162m catch floor must not return');
 assert.equal(f.catchSurfaceY,0);assert.equal(f.geometry.path.y,0);assert.equal(f.geometry.upperEarth.y,100);assert.equal(sourceEarthfallSupportAt(13,-7,landed()),null);assert.equal(sourceEarthfallSupportAt(3,-30,landed()),null);assert.equal(sourceEarthfallSupportAt(0,-30,landed()).y,0);
});

test('waiting, looking, interacting or restored positions do not invent a crossing or start demolition',()=>{
 for(const input of[{}, {look:{yaw:1.2,pitch:-.8}},{interact:true},{forward:1,acceptedStep:false}]){const s=advance(fresh(),4,input).state;assert.equal(s.committed,false);assert.equal(s.feet,100);}
 const saved=normalizeSourceEarthfall({...fresh(),z:-9});assert.equal(advance(saved,1,{forward:1}).state.committed,false);
});

test('ordinary forward crossing starts one controlled lowering and stopping never cancels it',()=>{
 const first=committed(),r=advance(first,2);assert.ok(r.state.feet<98&&r.state.feet>92);near(r.state.feet,sourceEarthfallUpperHeight(r.state.elapsed));assert.equal(r.state.phase,'fracturing');
 const next=advance(r.state,3);assert.equal(next.state.phase,'falling');assert.ok(next.state.feet<92);assert.equal(next.state.receipts.filter(e=>e.type==='strain').length,1);assert.equal(next.state.receipts.filter(e=>e.type==='footing-loss').length,1);
});

test('the player can walk and look while the visible supporting corridor lowers before breaking',()=>{
 let s=advance(committed(),1).state,before={...s};s=advance(s,.2,{side:1,look:{yaw:.5,pitch:-.6}}).state;assert.ok(Math.hypot(s.x-before.x,s.z-before.z)>.5);assert.equal(s.pitch,-.6);near(s.yaw,.5);
 const support=sourceEarthfallSupportAt(s.x,s.z,s);near(s.feet,support.y);near(sourceEarthfallFrame(s).geometry.upperEarth.y,support.y);assert.ok(s.feet<before.feet);
});

test('precommit retreat restores the same Source pose; a door left8m above cannot teleport the lowered body back',()=>{
 const retreat=advance(fresh(),1,{forward:-1}).state;assert.equal(retreat.status,'returned');assert.deepEqual(retreat.returnPose,fresh().returnPose);assert.equal(retreat.committed,false);
 let s=advance(committed(),2.8).state;s={...s,z:-.001};s=step(s,{dt:1/120,forward:-1});assert.equal(s.status,'active');assert.ok(s.feet<93);assert.ok(s.z>0);
});

test('pause, protected recording, unavailable assets and unavailable rendering freeze physical state and clocks',()=>{
 for(const s of[fresh(),committed(),advance(committed(),4).state,landed()])for(const guard of[{paused:true},{protected:true},{assetsReady:false},{renderReady:false}])assert.deepEqual(step(s,{dt:.25,forward:1,interact:true,look:{yaw:2},...guard}),normalizeSourceEarthfall(s));
});

test('the full100m descent belongs to the body, crosses3distinct strata and lands on a fixed lower surface',()=>{
 let s=committed(),last=s.feet,drop=0;const events=[];let lowered=false,fall=false,impact=false,black=false;
 for(let i=0;i<1600&&s.phase!=='landed';i++){const r=stepSourceEarthfall(s,{dt:1/120});s=r.state;events.push(...r.events);assert.ok(s.feet<=last+1e-8);drop+=last-s.feet;last=s.feet;const f=sourceEarthfallFrame(s);assert.equal(f.catchSurfaceY,0);assert.equal(f.geometry.path.y,0);
 lowered||=s.phase==='fracturing'&&s.feet<99;fall||=s.phase==='falling';impact||=s.phase==='catching';black||=f.blackoutAlpha>.99;}
 assert.ok(lowered&&fall&&impact&&black);assert.equal(s.phase,'landed');near(s.feet,0);near(drop,100);assert.ok(s.elapsed<9);assert.equal(sourceEarthfallFrame(s).blackoutAlpha,0);
 for(const type of['strain','fracture','footing-loss','stratum-0','stratum-1','stratum-2','catch','land'])assert.equal(s.receipts.filter(e=>e.type===type).length,1,type);
 const strata=events.filter(e=>e.type.startsWith('stratum-'));assert.deepEqual(strata.map(e=>e.position.y),[74,49,25]);assert.ok(strata.every((e,i)=>!i||e.at>strata[i-1].at));
 assert.ok(!('injuries'in s)&&!events.some(e=>/injur|damage|punish/.test(e.type)));
});

test('all reachable lowering and outward-airborne footprints land on the actual finite head without an air clamp',()=>{
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];let count=0;
 for(const x of[-C.earth.maxX+C.bodyRadius+.02,0,C.earth.maxX-C.bodyRadius-.02])for(const ground of directions)for(const air of directions){let s={...committed(),x};
 for(let i=0;i<1600&&s.phase!=='landed'&&s.status==='active';i++){const before=s,vector=s.phase==='fracturing'?ground:air;s=step(s,{dt:1/120,side:vector[0],forward:vector[1]});if(before.phase==='falling')assert.ok(Math.hypot(s.x-before.x,s.z-before.z)<=C.airSpeed/120+1e-7,'live airborne position cannot snap/project');}
 if(s.status==='returned')continue;assert.equal(s.phase,'landed');assert.ok(sourceEarthfallLowerContains(s.x,s.z,C.bodyRadius));assert.equal(sourceEarthfallSupportAt(s.x,s.z,s).y,0);count++;}
 assert.ok(count>140);
});

test('impact is a brief bounded blackout at zero height, while normal look resumes after it',()=>{
 const base={...fresh(),committed:true,committedAt:0,clock:8,elapsed:8,phase:'catching',feet:0,catchElapsed:0};let s=base;const xy={x:s.x,z:s.z};let max=0;
 for(let i=0;i<70;i++){s=step(s,{dt:1/120,forward:1});max=Math.max(max,sourceEarthfallFrame(s).blackoutAlpha);if(s.phase==='catching'){near(s.x,xy.x);near(s.z,xy.z);near(s.feet,0);}}
 assert.equal(max,1);assert.equal(s.phase,'landed');assert.equal(sourceEarthfallFrame(s).blackoutAlpha,0);assert.ok(s.z<xy.z);
});

test('the lower threshold opens on approach but must still be physically crossed; an off-axis step cannot grant SourceII',()=>{
 let s=walk(landed(),0,C.passage.exitZ+1).state;assert.equal(s.status,'active');assert.equal(s.exitDoor.open,true);assert.equal(s.exitDoor.progress,1);
 const centerOnly=walk(s,0,C.passage.exitZ-.08).state;assert.equal(centerOnly.status,'active','the head/centre crossing must not cut away before the capsule clears');
 const r=walk(centerOnly,0,C.passage.exitZ-.5);assert.equal(r.state.status,'completed');assert.ok(r.events.some(e=>e.type==='enter-source-II'));assert.ok(r.state.exitReceipt.id.endsWith(':source-II'));
 const off=advance({...s,x:2.5,z:C.passage.exitZ+.1},.5,{forward:1}).state;assert.equal(off.status,'active');
});

test('a borrowed manual-door policy blocks approach until interaction while ordinary SourceII keeps automatic opening',()=>{
 const nearDoor={...landed(),x:0,z:C.passage.exitZ+1,exitDoor:{open:false,progress:0}};
 const automatic=advance(nearDoor,.1);
 assert.equal(automatic.state.exitDoor.open,true);assert.ok(automatic.events.some(event=>event.type==='door'&&event.cause==='approach'));
 const blocked=advance(nearDoor,1,{forward:1,automaticDoors:false});
 assert.equal(blocked.state.status,'active');assert.ok(blocked.state.z>C.passage.exitZ);
 assert.equal(blocked.state.exitDoor.open,false);assert.equal(blocked.state.exitDoor.progress,0);
 assert.equal(blocked.events.some(event=>event.type==='door'||event.type==='enter-source-II'),false);
 let opened=stepSourceEarthfall(blocked.state,{interact:true,automaticDoors:false});
 assert.equal(opened.state.exitDoor.open,true);assert.equal(opened.event.type,'door');
 let held=advance(opened.state,C.door.openSeconds,{automaticDoors:false}).state;
 const closed=stepSourceEarthfall(held,{interact:true,automaticDoors:false});
 assert.equal(closed.state.exitDoor.open,false,'manual ownership also retains deliberate closing');
 held=advance(closed.state,C.door.openSeconds,{automaticDoors:false}).state;
 opened=stepSourceEarthfall(held,{interact:true,automaticDoors:false});
 held=advance(opened.state,C.door.openSeconds,{automaticDoors:false}).state;
 const crossed=advance(held,1,{forward:1,automaticDoors:false});
 assert.equal(crossed.state.status,'completed');assert.equal(crossed.events.filter(event=>event.type==='enter-source-II').length,1);
});

test('the extended receiving spine adds a sustained walk while retaining continuous physical footing',()=>{
 const start=landed(),result=walk(start,0,C.passage.exitZ-.5);
 assert.equal(result.state.status,'completed');
 assert.ok(result.state.clock-start.clock>19,'the former twelve-second approach must not return');
 assert.ok(result.state.clock-start.clock<22,'the extension is a walk-up, not an unbounded transit section');
 const path=sourceEarthfallFrame(start).geometry.path;
 for(let z=-15;z>=C.passage.exitZ-1;z-=.5){
   assert.equal(sourceEarthfallSupportAt(0,z,start)?.y,C.lowerFloor,`missing footing at ${z}`);
   assert.ok(z>=path.minZ&&z<=path.maxZ,'visible path and support must agree');
 }
 assert.equal(result.events.filter(event=>event.type==='door'&&event.id==='source-earthfall-exit').length,1);
 assert.equal(result.events.filter(event=>event.type==='enter-source-II').length,1);
});

test('the lower leaves begin once at approach range, keep moving through retreat/reload, and ignore redundant interaction',()=>{
 let s={...landed(),x:0,z:C.passage.exitZ+C.door.approachDistance+.02};
 const far=advance(s,.1);assert.equal(far.state.exitDoor.open,false);
 let r=advance(far.state,.1,{forward:1});s=r.state;
 assert.equal(s.exitDoor.open,true);assert.ok(s.exitDoor.progress>0&&s.exitDoor.progress<1);
 assert.equal(r.events.filter(event=>event.type==='door'&&event.cause==='approach').length,1);
 const reloaded=normalizeSourceEarthfall(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(reloaded,s);
 r=advance(reloaded,.5,{forward:-1});s=r.state;
 assert.ok(s.z>reloaded.z,'ordinary retreat remains available while the leaves move');
 assert.equal(r.events.some(event=>event.type==='door'),false);
 s=advance(s,.4).state;assert.equal(s.exitDoor.progress,1);
 s={...s,z:C.passage.exitZ+1};r=stepSourceEarthfall(s,{interact:true});
 assert.equal(r.state.exitDoor.open,true);assert.equal(r.events.length,0,'interact cannot immediately undo the automatic invitation');
 const returned=walk(r.state,0,C.passage.exitZ-.5);
 assert.equal(returned.state.status,'completed');assert.equal(returned.events.filter(event=>event.type==='door').length,0);
});

test('an auto-opening door still blocks the capsule until its visible leaves finish, including a nearby restored save',()=>{
 const nearDoor={...landed(),x:0,z:C.passage.exitZ+.3,exitDoor:{open:false,progress:0}};
 for(const guard of[{paused:true},{protected:true},{assetsReady:false},{renderReady:false}]){
   const frozen=step(nearDoor,{dt:.25,forward:1,...guard});assert.equal(frozen.exitDoor.open,false);assert.equal(frozen.z,nearDoor.z);
 }
 const early=advance(nearDoor,.5,{forward:1});
 assert.equal(early.state.status,'active');assert.ok(early.state.z>C.passage.exitZ);
 assert.ok(early.state.exitDoor.progress<1);
 const loaded=normalizeSourceEarthfall(early.state),finished=advance(loaded,1,{forward:1});
 assert.equal(finished.state.status,'completed');assert.equal(finished.events.filter(event=>event.type==='enter-source-II').length,1);
 const manual=stepSourceEarthfall(nearDoor,{interact:true});
 assert.equal(manual.state.exitDoor.open,true);assert.equal(manual.events.filter(event=>event.type==='door').length,1);
 assert.equal(advance(manual.state,.1).events.some(event=>event.type==='door'),false,'manual and approach opening must not double-report the same leaf motion');
});

test('upper architecture and the lower destination retain100m separation rather than descending into a copied floor',()=>{
 for(const elapsed of[0,2,3,6,9,30]){assert.equal(earthfallExitDoorHeight(elapsed),0);const f=sourceEarthfallFrame({...fresh(),committed:true,clock:elapsed,committedAt:0,elapsed,phase:elapsed<3?'fracturing':elapsed>9?'landed':'falling'});assert.equal(f.entryDoor.y,100);assert.equal(f.exitDoor.y,0);}
});

test('save/reload retains the exact physical fall and receipts without replaying support failures',()=>{
 let s=advance(committed(),5.4).state;const reload=normalizeSourceEarthfall(JSON.parse(JSON.stringify(s)));assert.deepEqual(reload,s);assert.deepEqual(step(s,{dt:.1,side:1}),step(reload,{dt:.1,side:1}));const old=s.receipts.length;s=advance(reload,5).state;assert.ok(s.receipts.length>=old);assert.equal(new Set(s.receipts.map(e=>e.type)).size,s.receipts.length);
 const foreign=normalizeSourceEarthfall(s,{runId:'different'});assert.equal(foreign.committed,false);
});

test('one-time migration rescues retired broad-floor saves without projecting an ordinary live fall',()=>{
 const old={...fresh(),layoutRevision:undefined,x:70,z:20};const migrated=normalizeSourceEarthfall(old);assert.equal(migrated.layoutRevision,3);assert.ok(sourceEarthfallSupportAt(migrated.x,migrated.z,migrated));assert.deepEqual(normalizeSourceEarthfall(migrated),migrated);
 const legacyFalling=normalizeSourceEarthfall({...old,committed:true,phase:'falling',elapsed:5,clock:5,feet:54});assert.ok(sourceEarthfallLowerContains(legacyFalling.x,legacyFalling.z,C.bodyRadius));near(legacyFalling.feet,54);
});

test('a completed old-approach receipt retains doorway clearance once while active old saves keep their exact body',()=>{
 const old={...landed(),layoutRevision:2,status:'completed',z:C.passage.priorExitZ-.31,x:.28,yaw:.09,pitch:-.17,
   exitDoor:{open:true,progress:1},exitReceipt:{delivered:false}};
 const migrated=normalizeSourceEarthfall(old);
 near(migrated.z,C.passage.exitZ-.31);near(migrated.x,old.x);near(migrated.feet,old.feet);near(migrated.yaw,old.yaw);near(migrated.pitch,old.pitch);
 assert.equal(migrated.exitReceipt.delivered,false);const again=normalizeSourceEarthfall(migrated);near(again.yaw,migrated.yaw);assert.deepEqual({...again,yaw:migrated.yaw},migrated);
 for(const active of[{...old,status:'active',phase:'landed',z:-40},{...old,status:'active',phase:'falling',z:-3,feet:54}]){
   const current=normalizeSourceEarthfall(active);near(current.x,active.x);near(current.z,active.z);near(current.feet,active.feet);
 }
});

test('actual shared fragment pivots lower with their support, then open and depart outside the lower path',()=>{
 const cells=sourceEarthfallCellLayout();assert.equal(cells.length,120);
 for(const cell of cells){const held=sourceEarthfallFracturePose(cell.index,2,cell.center);near(held.y,sourceEarthfallUpperHeight(2));near(held.x,cell.center.x);near(held.z,cell.center.z);assert.equal(held.support,true);const plan=sourceEarthfallReleasePlan(cell.index,cell.center);assert.ok(plan.releaseAt>=C.footingLossAt);const gone=sourceEarthfallFracturePose(cell.index,10,cell.center);assert.equal(gone.support,false);assert.ok(Math.abs(gone.x)>C.passage.halfWidth);assert.ok(gone.y<50);assert.deepEqual(sourceEarthfallFracturePose(cell.index,10,cell.center),gone);}
 assert.deepEqual(SOURCE_EARTHFALL_STRATA.map(s=>s.y),[74,49,25]);
});

test('an opened threshold retains capsule jamb occupancy after centre crossing and cannot skip its onward receipt',()=>{
  let state={...freshSourceEarthfall({runId:'capsule-jamb'}),committed:true,phase:'landed',feet:0,z:C.passage.exitZ+.05,clock:15,elapsed:15,exitDoor:{open:true,progress:1}};
  state=stepSourceEarthfall(state,{dt:.04,forward:1}).state;assert.ok(state.z<C.passage.exitZ&&state.z>C.passage.exitZ-C.bodyRadius);
  for(let i=0;i<2;i++)state=stepSourceEarthfall(state,{dt:.25,side:1}).state;
  assert.ok(state.x<=C.door.width/2-C.bodyRadius+1e-7,'the body still inside the real frame cannot strafe through its post');
  let events=[];for(let i=0;i<20&&state.status==='active';i++){const r=stepSourceEarthfall(state,{dt:.1,forward:1});state=r.state;events.push(...r.events);}
  assert.equal(state.status,'completed');assert.equal(events.filter(e=>e.type==='enter-source-II').length,1);
});

test('closed leaves and open frame posts block the full body from both sides and on diagonal approaches',()=>{
  for(const side of[-1,1])for(const opened of[false,true]){
    let state={...freshSourceEarthfall({runId:'swept-aperture'}),committed:true,phase:'landed',feet:0,x:opened?1.4:0,z:C.passage.exitZ+side*.55,yaw:side>0?0:Math.PI,clock:15,elapsed:15,exitDoor:{open:opened,progress:opened?1:0}};
    for(let i=0;i<(opened?12:4);i++)state=stepSourceEarthfall(state,{dt:.1,forward:1}).state;
    assert.equal(Math.sign(state.z-C.passage.exitZ),side,'a blocked capsule cannot change sides through the drawn door/frame');assert.equal(state.status,'active');
  }
  let diagonal={...freshSourceEarthfall({runId:'diagonal-jamb'}),committed:true,phase:'landed',feet:0,x:1,z:C.passage.exitZ+.6,clock:15,elapsed:15,exitDoor:{open:true,progress:1}};
  for(let i=0;i<15;i++)diagonal=stepSourceEarthfall(diagonal,{dt:.1,forward:1,side:1}).state;
  assert.equal(diagonal.status,'active');assert.ok(diagonal.z>C.passage.exitZ-C.bodyRadius,'outward diagonal cannot bypass the aperture and miss its receipt');
  for(let i=0;i<90&&diagonal.x>.05;i++)diagonal=stepSourceEarthfall(diagonal,{dt:1/60,side:-1}).state;
  for(let i=0;i<30&&diagonal.status==='active';i++)diagonal=stepSourceEarthfall(diagonal,{dt:.1,forward:1}).state;
  assert.equal(diagonal.status,'completed','ordinary correction through the opening still crosses without an alternate input');
});
