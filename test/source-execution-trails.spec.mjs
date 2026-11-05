import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationDoors} from '../src/data/source-continuation.js';
import {JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';
import {portalEdge,transferContinuationPortal} from '../src/game/source-continuation-portals.js';
import {sourceContinuationExecutionEvent,sourceReceiptExecutionEvent,sourceExecutionTrailFrame,sourceExecutionEnvelope,sourceExecutionParameters,SOURCE_EXECUTION_DURATION,SOURCE_EXECUTION_LIMIT} from '../src/render/source-execution-trails.js';

const matrix=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
const part=(id,x=0,y=0,z=0,extra={})=>({id,mesh:'authored-source',matrix:matrix(x,y,z),x,y,z,chartId:0,region:'wrong-return',...extra});
const event=(more={})=>({id:'real-event',kind:'door',at:10,origin:[0,0,0],chartId:0,phase:'wrong-return',...more});
const selected=frame=>frame.props.filter(p=>p.sourceExecution).map(p=>({id:p.id,...p.sourceExecution})).sort((a,b)=>a.id.localeCompare(b.id));

test('saved real door motion is the only door trigger and uses the actual fixed descriptor',()=>{
  const door=continuationDoors().find(d=>d.id==='wrong-entry-return'),motion={from:0,to:1,startedAt:10,duration:.65},
    state={status:'active',phase:door.phase,chartId:door.chartId??0,elapsed:10.4,doorOpen:{[door.id]:true},doorMotion:{[door.id]:motion}},copy=structuredClone(state),current=sourceContinuationExecutionEvent(state);
  assert.equal(current.kind,'door');assert.equal(current.at,10);assert.equal(current.doorId,door.id);
  assert.deepEqual(current.origin,[door.x,door.y,door.z]);assert.deepEqual(state,copy);
  for(const invalid of [{...state,status:'completed'},{...state,chartId:3},{...state,phase:'catch'},{...state,elapsed:14.8},
    {...state,elapsed:9.9},{...state,doorMotion:{}},{...state,doorMotion:{[door.id]:{...motion,duration:0}}}])assert.equal(sourceContinuationExecutionEvent(invalid),null);
  assert.equal(sourceContinuationExecutionEvent({...state,doorMotion:{'invented-door':motion}}),null);
});

test('actual portal transfer stamps its existing receipt and the normalized save retains that time',()=>{
  const edge=portalEdge(JOURNEY_PORTALS[0],'a'),state={...freshSourceContinuation(),status:'active',...edge.source.approach,elapsed:12},
    receipt=transferContinuationPortal(state,edge,{transportOnly:true});
  assert.equal(receipt.at,12);assert.equal(state.lastFold,receipt);
  const saved=normalizeSourceContinuation(JSON.parse(JSON.stringify(state))),current=sourceContinuationExecutionEvent({...saved,elapsed:12.2});
  assert.equal(saved.lastFold.at,12);assert.equal(current.kind,'fold');assert.equal(current.portalId,edge.portal.id);
  assert.deepEqual(current.origin,[receipt.to.x,receipt.to.feet,receipt.to.z]);assert.equal(current.chartId,edge.toChartId);
  const old={...saved,lastFold:{...saved.lastFold}};delete old.lastFold.at;
  assert.equal(sourceContinuationExecutionEvent(old),null,'an older receipt must not acquire a fabricated current timestamp');
  assert.equal(sourceContinuationExecutionEvent({...saved,elapsed:12+SOURCE_EXECUTION_DURATION}),null);
  assert.equal(sourceContinuationExecutionEvent({...saved,chartId:99}),null);
});

test('receipt selection honours saved event time, suppression, phase and fixed world position',()=>{
  const receipts=[{id:'old',type:'fracture',at:1,position:{x:2,y:100,z:-14}},
    {id:'real',type:'footing-loss',at:9.5,position:{x:2,y:99.8,z:-14}},
    {id:'suppressed',type:'roof',at:9.9,position:{x:9,y:10,z:2},suppressed:true},
    {id:'future',type:'land',at:11,position:{x:0,y:0,z:0}},
    {id:'invalid',type:'land',at:9.9,position:{x:0,y:NaN,z:0}}],copy=structuredClone(receipts),
    current=sourceReceiptExecutionEvent(receipts,10,{scope:'earthfall',chartId:2,phase:'earthfall'});
  assert.deepEqual(current,{id:'earthfall:real',kind:'footing-loss',at:9.5,origin:[2,99.8,-14],chartId:2,phase:'earthfall'});
  assert.deepEqual(receipts,copy);assert.equal(sourceReceiptExecutionEvent(receipts,30),null);
  assert.equal(sourceReceiptExecutionEvent([{id:'missing-clock',type:'strain',position:{x:0,y:0,z:0}}],10),null);
  assert.equal(sourceReceiptExecutionEvent([{id:'disabled',type:'strain',at:10,position:{x:0,y:0,z:0},active:false}],10),null);
  const tied=[{id:'b',type:'strain',at:10,position:{x:0,y:0,z:0}},{id:'a',type:'strain',at:10,position:{x:0,y:0,z:0}}];
  assert.equal(sourceReceiptExecutionEvent(tied,10).id,sourceReceiptExecutionEvent([...tied].reverse(),10).id);
});

test('real event recency selects the newest available door or fold without a render-frame cache',()=>{
  const door=continuationDoors()[0],state={status:'active',phase:'wrong-return',chartId:0,elapsed:10,
    doorMotion:{[door.id]:{from:1,to:0,startedAt:9,duration:.65}},lastFold:{id:'actual-fold',serial:3,at:9.8,toChartId:0,to:{x:3,feet:4,z:5}}};
  assert.equal(sourceContinuationExecutionEvent(state).kind,'fold');
  assert.equal(sourceContinuationExecutionEvent({...state,lastFold:{...state.lastFold,at:8}}).kind,'door');
  assert.deepEqual(sourceContinuationExecutionEvent(state),sourceContinuationExecutionEvent(structuredClone(state)));
});

test('a finite chain evaluates earlier carriers first and all gain ends at the saved event boundary',()=>{
  const earlier=sourceExecutionEnvelope(event(),10.5,{order:0,count:3}),later=sourceExecutionEnvelope(event(),10.5,{order:2,count:3}),
    firstAfter=sourceExecutionEnvelope(event(),14,{order:0,count:3}),lastDuring=sourceExecutionEnvelope(event(),14,{order:2,count:3});
  assert.ok(earlier.phase>0&&earlier.gain>0);assert.equal(later.gain,0);
  assert.equal(firstAfter.gain,0);assert.ok(lastDuring.phase>0&&lastDuring.gain>0);
  for(const time of[9.9,14.8,15,100])for(let order=0;order<3;order++)assert.equal(sourceExecutionEnvelope(event(),time,{order,count:3}).gain,0);
  const short=sourceExecutionEnvelope(event(),12,{duration:2});assert.equal(short.gain,0);
  assert.equal(sourceExecutionEnvelope(null,10).gain,0);
});

test('reduced motion holds the same low emphasis and no travelling phase within the finite event',()=>{
  for(let order=0;order<8;order++){
    const a=sourceExecutionEnvelope(event(),10.1,{order,count:8,reducedMotion:true}),b=sourceExecutionEnvelope(event(),14.7,{order,count:8,reducedMotion:true});
    assert.equal(a.phase,.5);assert.equal(a.gain,.32);assert.deepEqual(a,b);assert.equal(a.reducedMotion,true);
  }
  assert.equal(sourceExecutionEnvelope(event(),14.8,{reducedMotion:true}).gain,0);
});

test('the selected chain prefers a real parser portal, distinct world addresses and available surface planes',()=>{
  const parts=[part('floor-near',1,0,0,{sourceExecutionPlane:'floor'}),part('floor-same-address',1.01,0,0),
    part('wall',2,2,0,{sourceExecutionPlane:'wall'}),part('ceiling',2,4,0,{sourceExecutionPlane:'ceiling'}),
    part('actual-gate',6,2,0,{realPortalId:'real-joint',parserScope:'chart-2'}),
    part('unrelated-chart',0,0,0,{chartId:2}),part('other-phase',0,0,0,{region:'catch'}),
    part('body',0,0,0,{playerBody:true}),part('character',0,0,0,{character:{clip:'idle'}}),
    part('detached-stock',0,0,0,{sourceCodeDetached:true}),part('unrelated-far',200,0,0)],copy=structuredClone(parts),
    current=sourceExecutionTrailFrame(parts,event({portalId:'real-joint'}),{clock:11,limit:4}),picked=selected(current);
  assert.equal(picked.length,4);assert.equal(picked.find(p=>p.order===0).id,'actual-gate');
  assert.ok(picked.some(p=>p.id==='wall'));assert.ok(picked.some(p=>p.id==='ceiling'));
  assert.equal(picked.filter(p=>p.id.startsWith('floor-')).length,1);
  assert.deepEqual(parts,copy);
  assert.deepEqual(selected(sourceExecutionTrailFrame([...parts].reverse(),event({portalId:'real-joint'}),{clock:11,limit:4})),picked);
  for(const field of['yaw','pitch','camera','view','timeSec'])assert.deepEqual(selected(sourceExecutionTrailFrame(parts.map(p=>({...p,[field]:Math.PI})),event({portalId:'real-joint'}),{clock:11,limit:4})),picked);
});

test('door parser metadata and freed-code metadata survive while syntax, transforms and UV references stay exact',()=>{
  const material={rgb:[.8,.2,1]},uv={rect:[0,0,1,1]},memory={ownerId:'original-wall'},anchor={center:[0,0,0]},
    native=part('native',1,0,0,{text:'return source;',material,uv}),
    ghost=part('original-wall:freed-code',2,2,0,{sourceCodeOnly:true,sourceCodeMemory:memory,parserAnchor:anchor,realDoorId:'door-1',sourceExecutionPlane:'wall'}),
    result=sourceExecutionTrailFrame([native,ghost],event({doorId:'door-1'}),{clock:11});
  const retained=result.props.find(p=>p.id===ghost.id);assert.equal(retained.sourceExecution.order,0);
  assert.equal(retained.matrix,ghost.matrix);assert.equal(retained.sourceCodeMemory,memory);assert.equal(retained.parserAnchor,anchor);
  assert.equal(result.props[0].material,material);assert.equal(result.props[0].uv,uv);assert.equal(result.props[0].text,native.text);
  assert.equal(Object.hasOwn(native,'sourceExecution'),false);
});

test('limit and eligibility are bounded without reordering, cloning unrelated geometry or changing the checkpoint',()=>{
  const parts=Array.from({length:20},(_,i)=>part('carrier-'+String(i).padStart(2,'0'),i,0,0)),
    all=sourceExecutionTrailFrame(parts,event(),{clock:11,limit:100});
  assert.equal(all.diagnostics.selected,SOURCE_EXECUTION_LIMIT);assert.deepEqual(all.props.map(p=>p.id),parts.map(p=>p.id));
  const filtered=sourceExecutionTrailFrame(parts,event(),{clock:11,eligible:p=>p.id.endsWith('03')});
  assert.equal(filtered.diagnostics.selected,1);assert.equal(filtered.props[19],parts[19]);
  assert.equal(sourceExecutionTrailFrame(parts,event(),{clock:11,limit:0}).props,parts);
  const paused=sourceExecutionTrailFrame(parts,event(),{clock:11});assert.deepEqual(sourceExecutionTrailFrame(parts,event(),{clock:11}),paused);
});

test('stale or missing events clear only owned trail metadata, including when the caller reuses a frame',()=>{
  const parts=[part('a'),part('b',1,0,0)],lit=sourceExecutionTrailFrame(parts,event(),{clock:11}),
    ended=sourceExecutionTrailFrame(lit.props,event(),{clock:15}),absent=sourceExecutionTrailFrame(lit.props,null,{clock:11});
  assert.ok(lit.props.some(p=>p.sourceExecution?.gain>0));
  assert.ok(ended.props.every(p=>!p.sourceExecution));assert.ok(absent.props.every(p=>!p.sourceExecution));
  assert.deepEqual(ended.props,parts);assert.ok(lit.props.some(p=>p.sourceExecution),'clearing must not mutate the previous render');
});

test('GPU parameters are four bounded scalar floats and never mutate token color or metadata',()=>{
  assert.deepEqual(Array.from(sourceExecutionParameters()),[0,0,Math.fround(.16),0]);
  const meta={phase:.75,gain:.6,tail:.15,reducedMotion:true,eventId:'real',order:2},copy=structuredClone(meta),packed=sourceExecutionParameters(meta);
  assert.ok(packed instanceof Float32Array);assert.equal(packed.length,4);
  assert.deepEqual(Array.from(packed),[.75,Math.fround(.6),Math.fround(.15),1]);assert.deepEqual(meta,copy);
  assert.deepEqual(Array.from(sourceExecutionParameters({phase:4,gain:3,tail:2})),[1,1,.5,0]);
  assert.deepEqual(Array.from(sourceExecutionParameters({phase:NaN,gain:Infinity,tail:NaN})),[0,0,Math.fround(.16),0]);
});
