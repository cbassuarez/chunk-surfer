import test from 'node:test';
import assert from 'node:assert/strict';
import {CELL} from '../src/data/floorplan/legend.js';
import {freshChunkSurfState,normalizeChunkSurfState,reduceChunkSurf} from '../src/game/chunk-surf-state.js';
import {sourceSearchSpanActive,haystackPaperOpportunityEligible} from '../src/game/source-haystack.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';

function hallState(distance=96,seed=4417){
  let state=freshChunkSurfState({seed,returnPoint:{x:8,y:8,facing:1}});
  state=reduceChunkSurf(state,{type:'SOURCE_ENTERED',returnPoint:state.returnPoint});
  return reduceChunkSurf(state,{type:'HALL_ADVANCED',distance});
}
function tick(runtime,seconds){runtime.tick(seconds,{px:0,py:-96/CELL,facing:0});}
function takePage(runtime){const page=runtime.probe().realPage;runtime.setPlayerPosition({x:page.x,y:page.y+3,facing:0});assert.equal(runtime.inspectFocused(page.x,page.y+3,0).event,'page-found');runtime.commitStillPageReveal();}

test('one semantic search spans 84m to every still-page slot, including legacy HAYSTACK',()=>{
  for(const distance of [0,70,83.999])assert.equal(sourceSearchSpanActive({phase:'hall',hallMaxDistance:distance}),false);
  for(const distance of [84,96,100,108,112])assert.equal(sourceSearchSpanActive({phase:'hall',hallMaxDistance:distance}),true);
  assert.equal(sourceSearchSpanActive({phase:'haystack',hallMaxDistance:0}),true,'legacy state is an authoritative search');
  for(const phase of ['transforming','landscape','bells'])assert.equal(sourceSearchSpanActive({phase,hallMaxDistance:112}),false);
  assert.equal(haystackPaperOpportunityEligible({phase:'hall',hallMaxDistance:96,delivered:true}),false);
  assert.equal(haystackPaperOpportunityEligible({phase:'hall',hallMaxDistance:96,claimed:true}),false);
  const addresses=new Set();
  for(let slot=0;slot<12;slot++){
    const state={...hallState(96),interactivePageSlot:slot};
    const runtime=createSourceSpaceRuntime({initialState:state}),page=runtime.probe().realPage;
    assert.equal(runtime.state().phase,'hall');assert.equal(runtime.searchSpanActive(),true);
    addresses.add(`${page.x}:${page.y}`);
    assert.ok(-page.y*CELL>=100&&-page.y*CELL<=108);
    assert.equal(runtime.paperTonePoint().x,page.x);
    assert.equal(runtime.paperTonePoint().y,page.y);
    const claim=runtime.claimHaystackPaperOpportunity();assert.equal(claim.mediaId,'paper-close');
    assert.equal(runtime.haystackPaperOpportunityActive(claim.token),true);
    const hush=runtime.hushMode();assert.equal(hush.colliding,false);assert.equal(hush.bracketActive,true);
    takePage(runtime);
    assert.equal(runtime.state().phase,'transforming');
    assert.equal(runtime.haystackPaperOpportunityActive(claim.token),false);
    assert.equal(runtime.resolveHaystackPaperOpportunity({token:claim.token,shown:true,done:true}),false);
    assert.equal(runtime.state().hallExperience.paperWindowDelivered,false,'a late callback may not consume an unseen opportunity');
  }
  assert.equal(addresses.size,12,'all historical page slots remain distinct');
});

test('protection and inactive saves do not claim or consume the authored exposure',()=>{
  const early=createSourceSpaceRuntime({initialState:hallState(83.999)});
  assert.equal(early.claimHaystackPaperOpportunity(),null);
  const inactive=createSourceSpaceRuntime({initialState:{...hallState(),active:false}});
  assert.equal(inactive.claimHaystackPaperOpportunity(),null);
  const runtime=createSourceSpaceRuntime({initialState:hallState()});
  assert.equal(runtime.claimHaystackPaperOpportunity({blocked:true}),null);
  assert.equal(runtime.state().hallExperience.paperWindowDelivered,false);
  assert.ok(runtime.claimHaystackPaperOpportunity({blocked:false}));
});

test('only a visible current claim persists a delivery receipt; callbacks cannot duplicate it',()=>{
  const saves=[],runtime=createSourceSpaceRuntime({initialState:hallState(),onState:s=>saves.push(structuredClone(s))});
  const claim=runtime.claimHaystackPaperOpportunity();
  assert.ok(claim);assert.equal(runtime.claimHaystackPaperOpportunity(),null);
  assert.equal(runtime.resolveHaystackPaperOpportunity({token:claim.token+99,shown:true}),false);
  assert.equal(saves.length,0);
  assert.equal(runtime.resolveHaystackPaperOpportunity({token:claim.token,shown:true}),true);
  assert.equal(saves.length,1,'visibility saves immediately instead of waiting for movement');
  assert.equal(saves[0].hallExperience.paperWindowDelivered,true);
  assert.equal(runtime.haystackPaperOpportunityActive(claim.token),true,'the presenter retains ownership until it releases');
  runtime.resolveHaystackPaperOpportunity({token:claim.token,shown:true});assert.equal(saves.length,1);
  assert.equal(runtime.resolveHaystackPaperOpportunity({token:claim.token,shown:true,done:true}),true);
  assert.equal(runtime.haystackPaperOpportunityActive(claim.token),false);
  assert.equal(runtime.claimHaystackPaperOpportunity(),null);
  const resumed=createSourceSpaceRuntime({initialState:JSON.parse(JSON.stringify(saves[0]))});
  assert.equal(resumed.claimHaystackPaperOpportunity(),null,'reload does not repeat the exposure');
  assert.deepEqual(Object.keys(saves[0].hallExperience).sort(),['paperWindowDelivered','pressure','rainLatched','searchElapsed']);
  assert.equal(JSON.stringify(saves[0]).includes('operatorName'),false,'paper identity never enters a save');
});

test('an unshown cancellation retries after a short local delay; reload before exposure also retries',()=>{
  const runtime=createSourceSpaceRuntime({initialState:hallState()});
  const first=runtime.claimHaystackPaperOpportunity();
  const saved=structuredClone(runtime.state());
  assert.equal(runtime.resolveHaystackPaperOpportunity({token:first.token,shown:false,done:true}),false);
  assert.equal(runtime.claimHaystackPaperOpportunity(),null,'font/native failures cannot retry once per frame');
  tick(runtime,3.1);
  const retry=runtime.claimHaystackPaperOpportunity();assert.ok(retry);assert.notEqual(retry.token,first.token);
  assert.equal(runtime.resolveHaystackPaperOpportunity({token:first.token,shown:true,done:true}),false);
  assert.equal(runtime.haystackPaperOpportunityActive(retry.token),true,'a stale completion cannot release a newer claim');
  const resumed=createSourceSpaceRuntime({initialState:saved});assert.ok(resumed.claimHaystackPaperOpportunity());
  const legacy=normalizeChunkSurfState({...saved,hallExperience:{searchElapsed:12,pressure:.8,rainLatched:true}});
  assert.equal(legacy.hallExperience.paperWindowDelivered,false,'old saves have an unspent opportunity');
});

test('early real-page commitment retains the rendered rear hall and terminates exposure ownership',()=>{
  const runtime=createSourceSpaceRuntime({initialState:hallState(96)}),claim=runtime.claimHaystackPaperOpportunity();
  runtime.resolveHaystackPaperOpportunity({token:claim.token,shown:true});
  takePage(runtime);
  assert.equal(runtime.searchSpanActive(),false);assert.equal(runtime.haystackPaperOpportunityActive(claim.token),false);
  assert.equal(runtime.state().hallExperience.paperWindowDelivered,true,'commit does not erase an earned receipt');
  assert.equal(runtime.paperTonePoint(),null);
  const props=runtime.propInstances(0,-96/CELL,{time:10,reducedMotion:true});
  assert.ok(props.some(p=>/^source-hall/.test(p.id)),'the rear hall remains accountable');
  assert.equal(runtime.hushMode().colliding,false);
});
