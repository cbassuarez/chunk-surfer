import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSupportAt,continuationChartSurfaces} from '../src/data/source-continuation.js';
import {JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {freshContinuationHush,normalizeContinuationHush,advanceContinuationHush} from '../src/game/source-continuation-hush.js';
import {continuationFreeBody,continuationSegmentBoxDistanceSquared} from '../src/game/source-continuation-physics.js';
import {portalPoint,portalVector,portalEdge,continuationCameraBasis,continuationCameraEye} from '../src/game/source-continuation-portals.js';

const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const vectorClose=(a,b,t=1e-7)=>a.forEach((v,k)=>close(v,b[k],t));
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,column=Math.floor(i/4);return[0,1,2,3].reduce((n,k)=>n+a[k*4+row]*b[column*4+k],0);});
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(endpoint){const fresh=freshSourceContinuation();return normalizeSourceContinuation({...fresh,status:'active',...endpoint.approach,lastSafe:{...endpoint.approach,phase:'wrong-return',level:0},recoveryAnchor:{...endpoint.approach,level:0,kind:'landing',supportId:'declared-visited-pad',earnedAt:0},hush:{...fresh.hush,active:false}});}
function tick(s,input={},events=[]){const r=stepSourceContinuation(s,{dt:1/120,...input});events.push(...r.events);return r.state;}
function cross(state,events=[],extra={}){for(let n=0;n<800&&!state.lastFold;n++)state=tick(state,{forward:1,...extra},events);assert.ok(state.lastFold,'ordinary movement crosses the actual aperture');return state;}
function settle(state,events=[]){for(let n=0;n<240&&state.fall;n++)state=tick(state,{},events);assert.equal(state.fall,null,'receiving gravity must reach real support');assert.equal(state.recovery,null);return state;}

test('directed reciprocal portal matrices invert exactly and the actual connection cycles do not close Euclideanly',()=>{
  for(const p of JOURNEY_PORTALS){vectorClose(multiply(p.inverseMatrix,p.matrix),I);vectorClose(portalPoint(p.matrix,p.a.center),p.b.center);vectorClose(portalVector(p.matrix,p.a.normal),p.b.normal.map(v=>-v));}
  const cycle=JOURNEY_PORTALS.slice(0,5).reduce((m,p)=>multiply(p.matrix,m),I),error=Math.max(...cycle.map((v,k)=>Math.abs(v-I[k])));
  assert.ok(error>1,'independent graph gluing has nonidentity holonomy');
  assert.ok(Math.hypot(...portalPoint(cycle,[0,0,0]))>1||Math.abs(cycle[0]-1)>1e-4);
});

test('co-located chart coordinates never borrow floors or pressure contacts from another chart',()=>{
  const point={x:0,z:-19,feet:8.4};assert.ok(continuationSupportAt(point.x,point.z,{...point,chartId:0}));assert.equal(continuationSupportAt(point.x,point.z,{...point,chartId:4}),null);
  assert.ok(continuationChartSurfaces({chartId:2}).every(s=>s.chartId===2));
  const actor={...freshContinuationHush({...point,chartId:1}),mode:'follow',armed:true,elapsed:10,trail:[]},player={...point,chartId:0,phase:'wrong-return',elapsed:10,doorOpen:{},doorMotion:{}};
  assert.equal(advanceContinuationHush(actor,{dt:1/120,player}),false);
});

test('every rotating portal direction transfers exact body centre, eye and full momentum, then physically lands',()=>{
  for(const p of JOURNEY_PORTALS.slice(0,4))for(const side of['a','b']) {
    const edge=portalEdge(p,side),events=[];let state=cross(fixture(edge.source),events),receipt=state.lastFold;
    assert.equal(state.chartId,edge.toChartId);vectorClose(receipt.bodyCenterAfter,portalPoint(edge.matrix,receipt.bodyCenterBefore));vectorClose(receipt.eyeAfter,portalPoint(edge.matrix,receipt.eyeBefore));vectorClose(receipt.velocityAfter,portalVector(edge.matrix,receipt.velocityBefore));
    assert.equal(state.fall.trigger,'portal');assert.ok(state.cameraTransit);assert.ok(continuationFreeBody(state,state),'full oriented receiving capsule is clear');
    const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(normalizeSourceContinuation(saved),saved);
    for(const gate of [{paused:true},{renderReady:false}])assert.deepEqual(stepSourceContinuation(saved,{...gate,dt:.25,forward:1}).state,saved);
    state=settle(state,events);assert.equal(state.bodyTransit,null);assert.equal(state.cameraTransit,null);assert.ok(continuationSupportAt(state.x,state.z,state));assert.ok(events.some(e=>e.type==='land'&&e.trigger==='portal'));
  }
});

test('diagonal and jumping portal entry preserve the transformed vertical and tangential velocity without air steering',()=>{
  const p=JOURNEY_PORTALS[0],state0=fixture(p.a),events=[];
  let state=state0;for(let n=0;n<160&&!state.lastFold;n++)state=tick(state,{forward:1,side:n>110?.2:0,jump:n===125},events);
  assert.ok(state.lastFold);const r=state.lastFold;vectorClose(r.velocityAfter,portalVector(r.matrix,r.velocityBefore));
  const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(normalizeSourceContinuation(saved),saved);
  const neutral=tick(saved),opposite=tick(saved,{forward:-1,side:-1});vectorClose([neutral.x,neutral.z,neutral.feet],[opposite.x,opposite.z,opposite.feet]);
  assert.ok(continuationCameraEye(state).every(Number.isFinite));for(const axis of Object.values(continuationCameraBasis(state)))close(Math.hypot(...axis),1);
});

test('identity Catch closure remains grounded and a neutral phase handoff carries no old first-person velocity',()=>{
  const d=C.wrongReturn.threshold;let state=fixture(JOURNEY_PORTALS.find(p=>p.id==='catch-closure').a);
  state={...state,x:d.x+.19,z:d.z,yaw:-Math.PI/2,doorOpen:{[d.doorId]:true}};state=tick(state,{dt:.2,forward:1});assert.equal(state.phase,'catch');assert.equal(state.chartId,0);assert.equal(state.fall,null);
  const before=[state.x,state.z,state.feet];state=tick(state,{dt:.1});vectorClose([state.x,state.z,state.feet],before);
});

test('Hush actually lands after all rolled receiving directions, including the earlier upper-return growth regression',()=>{
  for(const p of [...JOURNEY_PORTALS.slice(0,4),JOURNEY_PORTALS.find(p=>p.id==='earlier-upper-return')]) {
    const actor={...freshContinuationHush(p.a.approach),armed:true,mode:'follow',elapsed:10,heading:p.a.approach.yaw,warningAnnounced:true,trail:[{kind:'fold',x:p.a.x-p.a.normal[0]*.04,z:p.a.z-p.a.normal[2]*.04,feet:p.a.feet,chartId:p.fromChart,foldId:p.id,foldSide:'a',matrix:p.matrix,inverseMatrix:p.inverseMatrix}],lastRecorded:{...p.b.approach}};
    const player={...fixture(p.b),heading:Math.PI,chartId:99,doorOpen:{},doorMotion:{}},events=[];
    for(let n=0;n<500&&!(actor.chartId===p.toChart&&!actor.fall);n++)advanceContinuationHush(actor,{dt:1/120,player,events});
    assert.equal(actor.chartId,p.toChart);assert.equal(actor.fall,null,`${p.id}: no embedded falling body`);assert.ok(continuationSupportAt(actor.x,actor.z,actor));assert.equal(events.filter(e=>e.type==='hush-fold').length,1);assert.ok(events.some(e=>e.type==='hush-land'));
  }
});

test('capture during receiving alignment restores the earned old-chart anchor and Hush reverses only a known portal physically',()=>{
  const p=JOURNEY_PORTALS[0],events=[];let state=fixture(p.a);
  state.hush={...freshContinuationHush({x:p.b.x-.12,z:p.b.z-.65,feet:p.b.feet,chartId:p.toChart}),armed:true,mode:'follow',elapsed:10,warningAnnounced:true,trail:[],knownPortals:[p.id]};
  const anchor={...state.recoveryAnchor};for(let n=0;n<300&&!state.recovery;n++)state=tick(state,{forward:1},events);
  assert.equal(state.recovery?.reason,'hush-pressure');assert.equal(state.recovery.target.chartId,anchor.chartId);assert.equal(state.recovery.kind,'blackout-return');
  for(let n=0;n<300&&state.recovery;n++)state=tick(state,{},events);
  assert.equal(state.chartId,anchor.chartId);vectorClose([state.x,state.z,state.feet],[anchor.x,anchor.z,anchor.feet]);
  assert.ok(state.hush.trail.some(e=>e.kind==='fold'&&e.foldId===p.id&&e.foldSide==='b'));
  for(let n=0;n<1600&&!events.some(e=>e.type==='hush-land'&&state.hush.chartId===anchor.chartId);n++)state=tick(state,{},events);
  assert.ok(events.some(e=>e.type==='hush-fold'&&e.id===p.id&&e.side==='b'));assert.equal(state.hush.chartId,anchor.chartId);assert.equal(state.hush.fall,null);assert.ok(continuationSupportAt(state.hush.x,state.hush.z,state.hush));
  assert.equal(events.some(e=>e.type==='hush-fold'&&e.id!==p.id),false,'unobserved shortcuts cannot be invented');
});

test('oriented capsule segment/AABB clearance distinguishes a real corner miss from a swept impact',()=>{
  const box={minX:-.1,maxX:.1,minY:0,maxY:1,minZ:-.1,maxZ:.1};close(continuationSegmentBoxDistanceSquared([-2,.5,0],[2,.5,0],box),0);assert.ok(continuationSegmentBoxDistanceSquared([-2,2,0],[2,2,0],box)>.99);
});

test('a missed Hush jump through a rolled portal uses the receiving chart spatial law after save and reload',()=>{
  const p=JOURNEY_PORTALS[0],start={x:p.a.x+.01,z:p.a.z,feet:p.a.feet,chartId:p.fromChart,phase:'wrong-return',level:0};
  let actor={...freshContinuationHush(start),armed:true,mode:'follow',elapsed:10,warningAnnounced:true,heading:p.a.approach.yaw,trail:[{kind:'drop',...start,vx:-C.walkSpeed/Math.sqrt(2),vz:-C.walkSpeed/Math.sqrt(2),vy:C.jumpSpeed,trigger:'jump',groundedExit:false,fromPhase:'wrong-return',fromChartId:0,lastSupport:start},{kind:'fold',...start,x:p.a.x-.04,foldId:p.id,foldSide:'a',matrix:p.matrix,inverseMatrix:p.inverseMatrix}],lastRecorded:start};
  const player={...fixture(p.b),chartId:99,doorOpen:{},doorMotion:{}},events=[];
  for(let n=0;n<1600&&!actor.lastSpaceWrap;n++)advanceContinuationHush(actor,{dt:1/120,player,events});
  assert.ok(actor.lastSpaceWrap,'a missed receiving pad crosses the fixed dimensional pair');
  assert.equal(actor.chartId,p.toChart);assert.equal(actor.recovery,null);
  const saved=JSON.parse(JSON.stringify(actor));actor=normalizeContinuationHush(saved);
  assert.deepEqual(actor.fall.voidLoop,saved.fall.voidLoop);assert.deepEqual(actor.lastSpaceWrap,saved.lastSpaceWrap);
  for(const k of['vx','vy','vz'])assert.equal(actor.fall[k],saved.fall[k]);
  assert.equal(actor.heading,saved.heading);assert.deepEqual(actor.bodyTransit,saved.bodyTransit);
  for(let n=0;n<300&&actor.fall;n++)advanceContinuationHush(actor,{dt:1/120,player,events});
  assert.equal(actor.fall,null);assert.ok(continuationSupportAt(actor.x,actor.z,actor));
  assert.equal(events.some(e=>e.type==='hush-recovery'||e.type==='hush-recovered'),false);
  assert.equal(events.some(e=>e.type==='hush-fold'&&e.side==='b'&&e.recovery),false);
});

test('v3 four-stage checkpoints translate their actual earned Catch pose and anchor without a ratio remap',()=>{
  for(let level=0;level<4;level++) {
    const angle=level===2?Math.PI:level===3?2.6:0,radius=[11.5,5.1,3.5,2.1][level],feet=[8.4,2.4,-4.8,-12.6][level],old={x:-38+Math.cos(angle)*radius,z:-12+Math.sin(angle)*radius,feet,phase:'catch',chartId:0,level,yaw:.3,pitch:-.2};
    const fresh=freshSourceContinuation({runId:`migration-${level}`}),legacy={...fresh,...old,layoutVersion:3,status:'active',lastSafe:{...old},recoveryAnchor:{...old,kind:'landing',supportId:`old-receiver-${level}`,earnedAt:34},counterweight:{...fresh.counterweight,x:-30.29,z:-3.27},knowledge:['earned-before-v4'],hush:{...fresh.hush,active:false}};
    const state=normalizeSourceContinuation(legacy);assert.equal(state.layoutVersion,4);assert.equal(state.level,level);close(state.x,old.x+C.catch.offset.x);close(state.z,old.z+C.catch.offset.z);close(state.feet,feet);close(state.recoveryAnchor.x,state.x);close(state.recoveryAnchor.z,state.z);assert.equal(state.recoveryAnchor.earnedAt,34);assert.ok(state.knowledge.includes('earned-before-v4'));assert.ok(continuationSupportAt(state.x,state.z,state));assert.deepEqual(normalizeSourceContinuation(state),state);
  }
  const fresh=freshSourceContinuation({runId:'old-completed'}),done=normalizeSourceContinuation({...fresh,layoutVersion:3,status:'completed',completed:true,handoff:true,phase:'catch',level:3,x:-30,z:-12,feet:-12.6,lastSafe:{x:-30,z:-12,feet:-12.6,phase:'catch',level:3},exitReceipt:{id:'old-completed:source-continuation-exit',delivered:true},counterweight:{...fresh.counterweight,x:-30.29,z:-3.27}});
  assert.equal(done.completed,true);assert.equal(done.status,'completed');assert.equal(done.exitReceipt.delivered,true);assert.equal(done.hush.active,false);assert.equal(done.level,3);close(done.x,C.catch.finalApproach.x);close(done.z,C.catch.finalApproach.z);assert.deepEqual(normalizeSourceContinuation(done),done);
});

test('legacy earned-anchor fields use the current canonical schema on the first migration',()=>{
  const old={x:-26.5,z:-12,feet:8.4,phase:'catch',chartId:0,level:0,yaw:.3,pitch:-.2},fresh=freshSourceContinuation({runId:'legacy-anchor-schema'}),
    state=normalizeSourceContinuation({...fresh,...old,layoutVersion:3,status:'active',lastSafe:{...old},
      recoveryAnchor:{...old,kind:'obsolete-checkpoint',supportId:17,earnedAt:-8,retiredMetadata:true},
      counterweight:{...fresh.counterweight,x:-30.29,z:-3.27},hush:{...fresh.hush,active:false}}),anchor=state.recoveryAnchor;
  assert.equal(anchor.kind,'landing');assert.equal(anchor.supportId,'17');assert.equal(anchor.earnedAt,0);
  assert.equal(anchor.yaw,state.yaw);assert.equal(anchor.retiredMetadata,undefined);
  close(anchor.x,old.x+C.catch.offset.x);close(anchor.z,old.z+C.catch.offset.z);
  assert.deepEqual(normalizeSourceContinuation(state),state);
});
