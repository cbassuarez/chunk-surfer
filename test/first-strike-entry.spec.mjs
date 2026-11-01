import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {firstStrikeEntryFromCells,firstStrikeEntryFromPlan,firstStrikeEntryFromSubmittedGeometry,firstStrikeInstanceMatrix,firstStrikeSubmittedHostBounds,packFirstStrikeConstruction,restoreFirstStrikeConstruction} from '../src/game/first-strike-entry.js';
import {FIRST_STRIKE,normalizeFirstStrikeEntry,firstStrikeFooting} from '../src/data/first-strike.js';
import {F,CELL} from '../src/data/floorplan/legend.js';

const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function plan(w=12,h=6,{ox=20,oz=-16,floor=-100,ceil=-96}={}){
 const n=w*h,p={w,h,originX:ox,originY:oz,rgba:new Uint8Array(n*4),floor:new Float32Array(n).fill(floor),ceil:new Float32Array(n).fill(ceil),material:new Uint8Array(n)};
 for(let i=0;i<n;i++){p.rgba[i*4]=17;p.rgba[i*4+1]=44;p.material[i]=i%79;}
 return p;
}
const at=(p,x,z)=>({x:(p.originX+x+.5)*CELL,y:p.floor[z*p.w+x],z:(p.originY+z+.5)*CELL});
function floor(x0,z0,x1,z1,y=0){return {positions:new Float32Array([x0,y,z0,x0,y,z1,x1,y,z1,x1,y,z0]),indices:new Uint16Array([0,1,2,0,2,3])};}
function wall(x,z0,z1,y0=0,y1=3){return{positions:new Float32Array([x,y0,z0,x,y1,z0,x,y1,z1,x,y0,z1]),indices:new Uint16Array([0,1,2,0,2,3])};}
function fixture(parts,{origin={x:.25,y:0,z:.25},instances=[{id:'actual-room',mesh:'room',x:0,y:0,z:0}],maximumRadius=5,nodeMatrix}={}){
 const catalog=new Map([['room',{nodeMatrix,primitives:parts.map(nativeReceiverGeometry=>({nativeReceiverGeometry}))}]]);
 return firstStrikeEntryFromSubmittedGeometry({catalog,instances,origin,maximumRadius,region:'source'});
}
function assertRoute(entry){
 assert.ok(entry);const e=normalizeFirstStrikeEntry(entry);
 for(const point of entry.route){
  assert.ok(entry.walkCells.some(c=>c.x===point.x&&c.z===point.z&&c.floor===point.floor));
  assert.ok(firstStrikeFooting(e,point.x,point.z,point.floor),`unsupported route point ${JSON.stringify(point)}`);
 }
 for(let i=1;i<entry.route.length;i++){
  const a=entry.route[i-1],b=entry.route[i];near(Math.hypot(a.x-b.x,a.z-b.z),CELL);
  assert.ok(Math.abs(a.floor-b.floor)<=FIRST_STRIKE.stepHeight+.001);
 }
}

test('actual plan origin, negative floor, Float32 heights and byte materials survive snapshot',()=>{
 const p=plan(),origin=at(p,2,2),entry=firstStrikeEntryFromPlan({plan:p,origin,decodeHeight:()=>999});
 assertRoute(entry);assert.equal(entry.constructionMode,'existing-plan');
 for(const c of entry.walkCells){assert.equal(c.floor,-100);assert.equal(c.ceil,-96);assert.equal(c.material,p.material[c.planIndex]);}
 assert.ok(entry.walkCells.every(c=>c.x>=p.originX*CELL&&c.z>=p.originY*CELL));
 const original=entry.plan.rgba[0];p.rgba[0]=99;p.floor[0]=42;p.material[0]=86;
 assert.equal(entry.plan.rgba[0],original);assert.equal(entry.plan.floor[0],-100);assert.equal(entry.plan.material[0],0);
});

test('encoded-height fallback and RGBA material format use their actual channels',()=>{
 const p=plan(4,4,{floor:0,ceil:3});delete p.floor;delete p.ceil;
 p.material=new Uint8Array(4*4*4);
 for(let i=0;i<16;i++){p.material[i*4]=51+i;p.material[i*4+1]=170;}
 const entry=firstStrikeEntryFromPlan({plan:p,origin:{x:10.75,y:1.7,z:-7.25},decodeHeight:v=>v*.1});
 assertRoute(entry);for(const c of entry.walkCells){near(c.floor,1.7);near(c.ceil,4.4);assert.equal(c.material,51+c.planIndex);}
});

test('solid, bricked and physically closed doors separate the actual connected component',()=>{
 for(const closed of[F.SOLID,F.DOOR|F.BRICKED,F.DOOR|F.CLOSED]){
  const p=plan();for(let z=0;z<p.h;z++)p.rgba[(z*p.w+5)*4+2]=closed;
  const entry=firstStrikeEntryFromPlan({plan:p,origin:at(p,2,2),decodeHeight:()=>0});
  assertRoute(entry);assert.ok(entry.walkCells.every(c=>c.planIndex%p.w<5));
  assert.ok(entry.route.every(c=>c.x<(p.originX+5)*CELL));
 }
});

test('an existing open threshold rejoins existing cells without inventing support',()=>{
 const p=plan();for(let z=0;z<p.h;z++)p.rgba[(z*p.w+5)*4+2]=z===2?F.DOOR:F.SOLID;
 const entry=firstStrikeEntryFromPlan({plan:p,origin:at(p,2,2),decodeHeight:()=>0});
 assertRoute(entry);assert.ok(entry.walkCells.some(c=>c.planIndex%p.w>5));
 assert.equal(entry.walkCells.filter(c=>c.planIndex%p.w===5).length,1);
});

test('planner and runtime share .32m steps and 1.82m bodily clearance',()=>{
 assert.equal(FIRST_STRIKE.stepHeight,.32);assert.equal(FIRST_STRIKE.bodyHeight,1.82);
 for(const step of[.31,.40]){
  const cells=Array.from({length:12},(_,x)=>({x:x*.5+.25,z:.25,floor:x<5?0:step,ceil:4,cellSize:.5}));
  const entry=firstStrikeEntryFromCells({cells,origin:{x:.75,y:0,z:.25}});assertRoute(entry);
  assert.equal(entry.walkCells.some(c=>c.x>2.5),step<.32);
 }
 assert.equal(firstStrikeEntryFromCells({origin:{x:.25,y:0,z:.25},cells:[{x:.25,z:.25,floor:0,ceil:1.81}]}),null);
});

test('occupancy callback excludes an actual obstruction and receives physical feet coordinates',()=>{
 const p=plan(),seen=[];
 const entry=firstStrikeEntryFromPlan({plan:p,origin:at(p,2,2),decodeHeight:()=>0,canOccupy:c=>{seen.push(c);return c.x<(p.originX+5)*CELL;}});
 assertRoute(entry);assert.ok(seen.every(c=>c.floor===-100&&Number.isFinite(c.flags)));assert.ok(entry.walkCells.every(c=>c.x<(p.originX+5)*CELL));
});

test('submitted Source has no fallback floor when only walls or excluded characters are present',()=>{
 assert.equal(fixture([wall(0,0,4)]),null);
 assert.equal(fixture([floor(0,0,4,4)],{instances:[{id:'not-architecture',mesh:'room',character:true}]}),null);
 assert.equal(firstStrikeEntryFromSubmittedGeometry({catalog:new Map(),origin:{x:0,y:-100,z:0}}),null);
});

test('real mesh floor/ceiling hosts and whole host bounds retain geometry outside the local capture',()=>{
 const entry=fixture([floor(0,0,4,4,-100),floor(0,0,4,4,-96),floor(100,100,101,101,-100)],{origin:{x:.75,y:-100,z:.75}});
 assertRoute(entry);assert.equal(entry.constructionMode,'existing-surfaces');assert.equal(entry.plan,null);
 assert.ok(entry.walkCells.every(c=>c.floorHostId==='actual-room'&&c.ceilingHostId==='actual-room'&&c.floor===-100&&c.ceil===-96));
 assert.deepEqual(entry.hostBounds['actual-room'],{min:[0,-100,0],max:[101,-96,101]});
});

test('separate submitted floor and ceiling retain their actual distinct host IDs',()=>{
 const catalog=new Map([
  ['support',{primitives:[{nativeReceiverGeometry:floor(0,0,4,4,-100)}]}],
  ['overhead',{primitives:[{nativeReceiverGeometry:floor(0,0,4,4,-96)}]}],
 ]);
 const instances=[{id:'real-lower-route',mesh:'support',x:0,z:0},{id:'actual-upper-structure',mesh:'overhead',x:0,z:0}];
 const entry=firstStrikeEntryFromSubmittedGeometry({catalog,instances,origin:{x:.75,y:-100,z:.75},maximumRadius:4});
 assertRoute(entry);assert.ok(entry.walkCells.every(c=>c.floorHostId==='real-lower-route'&&c.ceilingHostId==='actual-upper-structure'));
 assert.deepEqual(entry.hostBounds['real-lower-route'],{min:[0,-100,0],max:[4,-100,4]});
 assert.deepEqual(entry.hostBounds['actual-upper-structure'],{min:[0,-96,0],max:[4,-96,4]});
});

test('instance yaw, anisotropic scale and GLB node transform compose in renderer order',()=>{
 const node=[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1];
 const m=firstStrikeInstanceMatrix({x:10,y:-110,z:20,yaw:Math.PI/2,scale:2,scaleX:1.5,scaleY:.5,scaleZ:.5},node);
 // Node origin (2,3,4), then model scale (3,1,1), yaw, translation.
 near(m[12],6);near(m[13],-107);near(m[14],26);
 const explicit=[1,0,0,0,0,1,0,0,0,0,1,0,10,-103,20,1];
 const entry=fixture([floor(0,0,4,4)],{nodeMatrix:node,instances:[{id:'transformed-host',mesh:'room',matrix:explicit}],origin:{x:12.75,y:-100,z:24.75},maximumRadius:4});
 assertRoute(entry);assert.deepEqual(entry.hostBounds['transformed-host'],{min:[12,-100,24],max:[16,-100,28]});
});

test('a .42m strip cannot pretend to fit the .46m body diameter',()=>{
 assert.equal(fixture([floor(.04,0,.46,5)],{origin:{x:.25,y:0,z:.75}}),null);
 const wide=fixture([floor(0,0,.5,5)],{origin:{x:.25,y:0,z:.75}});assertRoute(wide);
});

test('a missing floor region does not become an invented connected corridor',()=>{
 const entry=fixture([floor(0,0,2,3),floor(3,0,5,3)],{origin:{x:.75,y:0,z:.75}});
 assertRoute(entry);assert.ok(entry.walkCells.every(c=>c.x<2));
});

test('a wall exactly between sampled centres blocks traversal rather than becoming a doorway',()=>{
 const entry=fixture([floor(0,0,5,3),wall(2.5,0,3)],{origin:{x:.75,y:0,z:.75}});
 assertRoute(entry);assert.ok(entry.walkCells.every(c=>c.x<2.5),'closed vertical wall must separate connected support');
});

test('an unsupported starting point cannot borrow a disconnected floor half a metre away',()=>{
 const entry=fixture([floor(.5,0,3,3)],{origin:{x:.25,y:0,z:.75}});
 assert.equal(entry,null,'origin itself has no support');
});

test('actual .31m mesh riser remains usable while .40m is beyond the scene body contract',()=>{
 for(const rise of[.31,.40]){
  const entry=fixture([floor(0,0,2.5,3),floor(2.5,0,5,3,rise),wall(2.5,0,3,0,rise)],{origin:{x:.75,y:0,z:.75}});
  assertRoute(entry);
  assert.equal(entry.walkCells.some(c=>c.x>2.5),rise<FIRST_STRIKE.stepHeight,`actual ${rise}m riser`);
 }
});

test('a low sloping ceiling must clear the whole body radius, not just its centre',()=>{
 const ceiling={positions:new Float32Array([0,1.6,0,0,1.6,3,3,4.6,3,3,4.6,0]),indices:new Uint16Array([0,1,2,0,2,3])};
 assert.ok(fixture([floor(0,0,3,3),ceiling],{origin:{x:.25,y:0,z:.75}})===null,'outer body intersects the actual sloping ceiling');
});

test('nonfinite or oversized capture radii cannot create unbounded traversal',()=>{
 for(const radius of[Infinity,NaN,1e9]){
  const entry=fixture([floor(0,0,4,4)],{origin:{x:.75,y:0,z:.75},maximumRadius:radius});
  assertRoute(entry);assert.ok(entry.walkCells.length<=81*81);
 }
});

test('durable construction roundtrip retains route/support while reusing current real mesh collision',()=>{
 const parts=[floor(0,0,5,3,-100),floor(0,0,5,3,-96),wall(2.5,0,3,-100,-96)];
 const savedEntry=fixture(parts,{origin:{x:.75,y:-100,z:.75}}),packed=JSON.parse(JSON.stringify(packFirstStrikeConstruction(savedEntry)));
 assert.doesNotMatch(JSON.stringify(packed),/nativeReceiverGeometry|positions|canStand|canTraverse/);
 const current=fixture(parts,{origin:{x:.75,y:-100,z:.75}}),restored=restoreFirstStrikeConstruction(current,packed);
 assertRoute(restored);assert.deepEqual(restored.route,savedEntry.route);assert.deepEqual(restored.origin,savedEntry.origin);
 assert.deepEqual(restored.hostBounds,savedEntry.hostBounds);assert.equal(restored.canStand,current.canStand);assert.equal(restored.props,current.props);
 assert.equal(firstStrikeFooting(normalizeFirstStrikeEntry(restored),2.5,.75,-100),null,'the actual wall still blocks after save/reload');
 assert.ok(firstStrikeFooting(normalizeFirstStrikeEntry(restored),.75,.75,-100));
 assert.equal(restoreFirstStrikeConstruction(current,{schema:99,cells:[]}),current);
});

test('submitted facade bounds retain real remote mass rather than fabricating an open-sky ceiling',()=>{
 const catalog=new Map([
  ['facade',{primitives:[{nativeReceiverGeometry:wall(40,0,10,-100,-70)}]}],
  ['support',{primitives:[{nativeReceiverGeometry:floor(0,0,4,4,-100)}]}],
  ['too-far',{primitives:[{nativeReceiverGeometry:wall(75,0,10,-100,-70)}]}],
 ]),instances=[{id:'actual-front',mesh:'facade',structural:true,x:0,z:0},{id:'actual-floor',mesh:'support',structural:true,x:0,z:0},{id:'beyond-budget',mesh:'too-far',structural:true,x:0,z:0}],origin={x:.75,y:-100,z:.75};
 const bounds=firstStrikeSubmittedHostBounds({catalog,instances,origin,maximumRadius:1e9});
 assert.deepEqual(Object.keys(bounds).sort(),['actual-floor','actual-front']);
 assert.deepEqual(bounds['actual-front'].min,[40,-100,0]);assert.deepEqual(bounds['actual-front'].max,[40,-70,10]);
 assert.equal(bounds['actual-front'].structural,true);assert.equal(bounds['actual-front'].supportAtOrigin,null);assert.equal(bounds['actual-front'].hasFloorAtEntryLevel,false);
 assert.equal(bounds['actual-floor'].supportAtOrigin,-100);assert.equal(bounds['actual-floor'].hasFloorAtEntryLevel,true);assert.equal(bounds['actual-floor'].entryFloorMin,-100);assert.equal(bounds['actual-floor'].entryFloorMax,-100);
 assert.equal(firstStrikeSubmittedHostBounds({catalog,instances,origin,maximumRadius:20})['actual-front'],undefined);
 assert.equal(firstStrikeSubmittedHostBounds({catalog,instances,origin,maximumRadius:Infinity})['beyond-budget'],undefined);
});

test('host boxes use exact node/model transforms and include actual mass near the player despite a remote anchor',()=>{
 const node=[1,0,0,0,0,1,0,0,0,0,1,0,-100,0,0,1];
 const catalog=new Map([['translated-local',{nodeMatrix:node,primitives:[{nativeReceiverGeometry:floor(0,0,4,4,-100)}]}]]);
 const instances=[{id:'offset-geometry',mesh:'translated-local',structural:true,x:100,z:0}];
 const result=firstStrikeSubmittedHostBounds({catalog,instances,origin:{x:.75,y:-100,z:.75},maximumRadius:2});
 assert.deepEqual(result['offset-geometry'].min,[0,-100,0]);assert.deepEqual(result['offset-geometry'].max,[4,-100,4]);assert.equal(result['offset-geometry'].supportAtOrigin,-100);
 const rotated=firstStrikeSubmittedHostBounds({catalog:new Map([['box',{primitives:[{nativeReceiverBounds:{min:[0,0,0],max:[2,4,1]}}]}]]),instances:[{id:'rotated',mesh:'box',x:10,y:-100,z:20,yaw:Math.PI/2,scaleX:2}],origin:{x:10,y:-100,z:20}});
 near(rotated.rotated.min[0],9);near(rotated.rotated.min[1],-100);near(rotated.rotated.min[2],20);near(rotated.rotated.max[0],10);near(rotated.rotated.max[1],-96);near(rotated.rotated.max[2],24);
 assert.equal(rotated.rotated.supportAtOrigin,null);assert.equal(rotated.rotated.floorTrianglesKnown,false,'a conservative native box alone does not prove a floor');
});

test('host-only capture fails closed for unsubmitted/anonymous/ambiguous or excluded bodies',()=>{
 const catalog=new Map([['room',{primitives:[{nativeReceiverGeometry:floor(0,0,4,4)}]}],['invented',{extras:{bounds:{min:[0,0,0],max:[4,4,4]}},primitives:[]}]]),origin={x:.75,y:0,z:.75};
 const flags=['character','playerBody','portalDestination','hidden','decorative','practical'];
 const instances=flags.map(flag=>({id:flag,mesh:'room',[flag]:true}));
 instances.push({mesh:'room'},{id:'missing-native',mesh:'invented'},{id:'duplicate',mesh:'room'},{id:'duplicate',mesh:'room'});
 assert.deepEqual(firstStrikeSubmittedHostBounds({catalog,instances,origin}),{});
 assert.deepEqual(firstStrikeSubmittedHostBounds({catalog,instances,origin:{x:NaN,y:0,z:0}}),{});
 assert.deepEqual(firstStrikeSubmittedHostBounds({instances,origin}),{});
});

test('moderate actual triangle stress stays within a bounded capture and connected cells',()=>{
 const parts=Array.from({length:400},(_,i)=>{const x=i%20,z=Math.floor(i/20);return floor(x,z,x+1,z+1);});
 const begin=performance.now(),entry=fixture(parts,{origin:{x:2.75,y:0,z:2.75},maximumRadius:8}),elapsed=performance.now()-begin;
 assertRoute(entry);assert.ok(entry.walkCells.length<=33*33);assert.ok(entry.routeEvidence.submittedTriangles<=800);
 assert.ok(elapsed<2500,`bounded CPU fixture took ${elapsed.toFixed(1)}ms`);
 console.log(JSON.stringify({evidence:'first-strike-entry-moderate-cpu-fixture',submittedTriangles:entry.routeEvidence.submittedTriangles,connectedCells:entry.walkCells.length,elapsedMs:elapsed,scope:'CPU synthetic geometry, not measured game capture or GPU'}));
});
