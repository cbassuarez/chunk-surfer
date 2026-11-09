import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_EXIT_PASSAGE as C,SOURCE_EXIT_PASSAGE_SURFACES as FLOORS,SOURCE_EXIT_PASSAGE_SOLIDS as SOLIDS,
 SOURCE_EXIT_PASSAGE_ANCHORS as ANCHORS,sourceExitPassageContains} from '../src/data/source-exit-passage.js';
import {freshSourceExitPassage,normalizeSourceExitPassage,advanceSourceExitPassage,sourceExitPassageEndCrossed} from '../src/game/source-exit-passage.js';
import {sourceExitPassageGeometryLibrary,sourceExitPassageRenderParts} from '../src/render/source-exit-passage.js';
import {SOURCE_CONTINUATION,continuationChartSurfaces,continuationSurfaceContains} from '../src/data/source-continuation.js';
import {continuationSegmentBoxDistanceSquared} from '../src/game/source-continuation-physics.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const p=(distance,extra={})=>({x:C.door.x+distance,z:C.door.z,feet:C.door.y,phase:'catch',chartId:0,elapsed:100,...extra});
function step(value,before,after,options={}){const events=[];return{...advanceSourceExitPassage(value,{before,after,events,...options}),events};}
const entered=()=>step(freshSourceExitPassage(),p(-.3),p(.3),{doorPassable:true,supported:true}).state;
const clear=(x,z,radius=.26)=>{
 const a=[x,C.door.y+radius,z],b=[x,C.door.y+1.9-radius,z];
 return SOLIDS.every(s=>continuationSegmentBoxDistanceSquared(a,b,s)>=(radius-1e-6)**2);
};

test('the old road preview gains continuous real support without redrawing the retained door island',()=>{
 assert.deepEqual(C.door,SOURCE_CONTINUATION.catch.finalDoor);assert.equal(C.length,12);
 const island=continuationChartSurfaces({chartId:0}).find(s=>s.id==='catch-door-island');assert.ok(island);
 near(island.maxX,C.retainedIslandEndX);assert.equal(FLOORS.length,2);
 assert.ok(FLOORS.every(s=>s.minX>=island.maxX),'no coplanar floor is laid over existing ground');
 const floors=[island,...FLOORS];
 for(let x=C.door.x-.25;x<=C.floorEndX;x+=.04)for(const z of[C.door.z-2.6,C.door.z,C.door.z+2.6]){
  const support=floors.find(s=>continuationSurfaceContains(s,x,z));assert.ok(support,'real support through the complete passage');near(support.y,C.door.y);
  assert.equal(clear(x,z),true,'Hush-sized capsule can walk the same supported passage');
 }
 for(const a of ANCHORS)assert.ok(floors.some(s=>continuationSurfaceContains(s,a.x,a.z)&&s.y===a.feet));
});

test('all exit stock has an exact physical/render counterpart; the passage becomes service ground instead of a painted preview',()=>{
 const parts=sourceExitPassageRenderParts(),library=sourceExitPassageGeometryLibrary();
 assert.equal(parts.length,FLOORS.length+SOLIDS.length);assert.ok(parts.length<40);
 assert.equal(Object.keys(library).length,4);
 for(const part of parts){
  assert.ok(library[part.mesh]);assert.ok(part.sx>0&&part.sy>0&&part.sz>0);
  const original=part.physicalKind==='surface'?FLOORS.find(s=>s.id===part.id):SOLIDS.find(s=>s.id===part.id);assert.ok(original);
  near(part.x-part.sx/2,original.minX);near(part.x+part.sx/2,original.maxX);
  near(part.z-part.sz/2,original.minZ);near(part.z+part.sz/2,original.maxZ);
  near(part.y,original.minY??original.y-original.thickness);near(part.y+part.sy,original.maxY??original.y);
  assert.equal(part.chartId,0);assert.equal(part.region,'catch');
 }
 assert.ok(SOLIDS.some(s=>s.section==='remembered'&&s.material==='piano-wood'));
 assert.ok(SOLIDS.some(s=>s.section==='stripped'&&s.material==='cold-wall'));
 assert.ok(FLOORS.some(s=>s.section==='service-road'&&s.material==='asphalt'));
 const x=C.door.x+9;
 for(const z of[C.door.z-C.halfWidth-.4,C.door.z+C.halfWidth+.4]){
  assert.equal(sourceExitPassageContains({x,z}),false);assert.equal(clear(x,z),true,'open side edges are not sealed by invisible walls or kerbs');
 }
});

test('the original open door arms a receipt but no longer completes the journey at the jamb',()=>{
 const result=step(freshSourceExitPassage(),p(-.3),p(.3),{doorPassable:true,supported:true});
 assert.equal(result.state.phase,'entered');assert.equal(result.state.enteredReason,'door');assert.equal(result.complete,false);
 assert.deepEqual(result.state.entryPose,{x:C.door.x+.3,z:C.door.z,feet:C.door.y,chartId:0});
 assert.equal(result.events.length,1);assert.equal(result.events[0].type,'source-exit-entered');
});

test('backing through the same door is allowed and preserves the physical passage receipt and progress',()=>{
 let state=entered();state=step(state,p(.3),p(5),{supported:true}).state;
 const retreated=step(state,p(5),p(-.5),{supported:true});
 assert.equal(retreated.state.phase,'backed-out');assert.equal(retreated.state.enteredReason,'door');near(retreated.state.furthest,5);
 const returned=step(JSON.parse(JSON.stringify(retreated.state)),p(-.5),p(.5),{doorPassable:true,supported:true});
 assert.equal(returned.state.phase,'entered');assert.equal(returned.complete,false);near(returned.state.furthest,5);
 assert.equal(returned.events.some(e=>e.type==='source-exit-entered'),false,'the same passage is not awarded twice');
});

test('an opened-door side shortcut arms only on a real supported landing in the passage',()=>{
 for(const options of[{doorPassable:false,supported:true},{doorPassable:true,supported:false}])
  assert.equal(step(freshSourceExitPassage(),p(2),p(5),options).state.enteredReason,null);
 const falling=step(freshSourceExitPassage(),p(2),p(5,{fall:{trigger:'jump'}}),{doorPassable:true,supported:true});
 assert.equal(falling.state.enteredReason,null);
 const landed=step(falling.state,p(5,{fall:{trigger:'jump'}}),p(5),{doorPassable:true,supported:true});
 assert.equal(landed.state.enteredReason,'supported-shortcut');assert.equal(landed.complete,false);
});

test('the final physical plane completes once after twelve metres, including a normal forward jump',()=>{
 const state=entered(),before=p(12.1),after=p(12.3,{feet:C.door.y+.75,fall:{trigger:'jump'}});
 const result=step(state,before,after,{doorPassable:true});
 assert.equal(result.complete,true);assert.equal(result.state.phase,'complete');near(result.state.furthest,12);
 assert.equal(result.events.filter(e=>e.type==='source-exit-passage-complete').length,1);
 const duplicate=step(result.state,after,p(12.5));assert.equal(duplicate.complete,false);assert.deepEqual(duplicate.events,[]);
 assert.equal(after.fall.trigger,'jump','the passage never removes or relocates the airborne body');
});

test('a valid supported shortcut landing beyond the end plane has no invisible completion barrier',()=>{
 const result=step(freshSourceExitPassage(),p(12.3,{fall:{trigger:'jump'}}),p(12.3),{doorPassable:true,supported:true});
 assert.equal(result.state.enteredReason,'supported-shortcut');assert.equal(result.complete,true);
});

test('unentered, off-chart, below-floor, off-edge, recovering or frozen bodies cannot accidentally commit',()=>{
 assert.equal(step(freshSourceExitPassage(),p(12.1),p(12.3)).complete,false);
 for(const extra of[{chartId:4},{feet:C.door.y-.5},{z:C.door.z+4},{recovery:{elapsed:0}},{phase:'wrong-return'}])
  assert.equal(step(entered(),p(12.1),p(12.3,extra)).complete,false);
 const state=entered(),frozen=step(state,p(12.1),p(12.3),{frozen:true});assert.equal(frozen.state,state);assert.equal(frozen.complete,false);assert.deepEqual(frozen.events,[]);
 assert.equal(sourceExitPassageEndCrossed(p(12.1,{chartId:4}),p(12.3)),false,'coordinate changes from another chart are not walked threshold crossings');
 assert.equal(sourceExitPassageEndCrossed(p(12.1),p(12.3)),true,'host tide guard shares the actual new commitment plane');
});

test('old completed saves preserve their original delivered or pending handoff without replaying this passage',()=>{
 for(const world of[{completed:true},{status:'completed'}]){
  const state=normalizeSourceExitPassage(null,world);assert.equal(state.phase,'complete');assert.equal(state.enteredReason,'legacy-complete');near(state.furthest,12);
  assert.equal(step(state,p(12.1),p(12.3)).complete,false);
 }
 const oldActive=normalizeSourceExitPassage(null,{status:'active'});assert.deepEqual(oldActive,freshSourceExitPassage());
 const malformed=normalizeSourceExitPassage({version:1,phase:'entered',enteredReason:'door',enteredAt:NaN,entryPose:{x:Infinity,z:0,feet:0},furthest:Infinity});
 assert.equal(malformed.enteredAt,null);assert.equal(malformed.entryPose,null);assert.equal(malformed.furthest,0);
 assert.deepEqual(JSON.parse(JSON.stringify(malformed)),malformed,'checkpoint data is finite and serializable');
});
