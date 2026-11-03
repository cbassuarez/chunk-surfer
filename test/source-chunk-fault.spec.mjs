import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CHUNK_FAULT as F,sourceChunkFaultResponse,sourceChunkFaultFrame} from '../src/game/source-chunk-fault.js';
import {SOURCE_CONTINUATION as C,continuationChartSolids} from '../src/data/source-continuation.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationCanOccupy} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

function fixture(extra={}){
  const fresh=freshSourceContinuation({runId:'reactive-chunk-fault'});
  return normalizeSourceContinuation({...fresh,status:'active',phase:'wrong-return',chartId:0,x:16,z:-12,feet:8.4,
    ...extra,closure:{...fresh.closure,mode:'primed',...extra.closure},hush:{...fresh.hush,active:false}});
}
function tick(state,events=[]){const next=stepSourceContinuation(state,{dt:.05,renderReady:true});events.push(...next.events);return next.state;}

test('one Source-II field reacts monotonically to approach/contact and cannot excite another chart or floor',()=>{
  const distant=sourceChunkFaultResponse(fixture({x:8})),near=sourceChunkFaultResponse(fixture({x:13})),touch=sourceChunkFaultResponse(fixture({x:16}));
  assert.equal(distant.amount,0);assert.ok(near.amount>0&&near.amount<touch.amount);assert.equal(touch.amount,1);assert.equal(touch.touching,true);
  for(const extra of[{chartId:1},{phase:'catch'},{feet:0},{feet:12},{closure:{mode:'dormant'}}])assert.equal(sourceChunkFaultResponse(fixture(extra)).amount,0);
});

test('proximity charges the saved front sooner while preserving the complete warning before real collision',()=>{
  let touched=fixture(),distant=fixture({x:0,z:-19});const events=[];
  for(let i=0;i<42;i++){touched=tick(touched,events);distant=tick(distant);}
  assert.equal(touched.closure.mode,'warning');assert.equal(distant.closure.mode,'primed');
  assert.equal(events.filter(e=>e.type==='closure-warning').length,1);assert.equal(events.find(e=>e.type==='closure-warning').touching,true);
  assert.equal(continuationChartSolids(touched).some(s=>s.role==='closure'),false,'warning chunks cannot silently become collision');
  const warned=JSON.parse(JSON.stringify(touched));
  assert.deepEqual(tick(touched),tick(warned),'saved exposure and warning replay identically');
  const front=touched.closure.frontX;
  while(touched.closure.elapsed<C.wrongReturn.warningSeconds-.08){
    touched=tick(touched);assert.equal(touched.closure.mode,'warning');assert.equal(touched.closure.frontX,front);
  }
  for(let i=0;i<4&&touched.closure.mode!=='closing';i++)touched=tick(touched);
  assert.equal(touched.closure.mode,'closing');assert.ok(continuationChartSolids(touched).some(s=>s.role==='closure'));
});

test('the route-changing front blocks its actual line while the established off-line refuge stays usable',()=>{
  const open=fixture({closure:{mode:'warning'}}),closed=fixture({closure:{mode:'closing',frontX:16.5}});
  assert.equal(sourceContinuationCanOccupy(16.5,-12,open),true);
  assert.equal(sourceContinuationCanOccupy(16.5,-12,closed),false);
  const refuge={...closed,x:0,z:-19,feet:8.4};assert.equal(sourceContinuationCanOccupy(0,-19,refuge),true);
  const solid=continuationChartSolids(closed).find(s=>s.role==='closure');
  const frame=sourceContinuationRenderFrame(closed),body=frame.canonicalProps.find(p=>p.descriptorId===solid.id&&p.physicalKind==='solid');
  assert.ok(body);assert.deepEqual(body.physicalBounds,{min:[solid.minX,solid.minY,solid.minZ],max:[solid.maxX,solid.maxY,solid.maxZ]});
});

test('faults are bounded depth-writing 3D pieces on the real front, with no clock-driven flash or extra route owner',()=>{
  const state=fixture({closure:{mode:'closing',frontX:12}}),before=JSON.stringify(state),field=sourceChunkFaultFrame(state);
  assert.equal(field.pieces.length,F.rows*F.columns*2);assert.equal(new Set(field.pieces.map(p=>p.id)).size,field.pieces.length);
  assert.ok(field.pieces.every(p=>Math.abs(p.x-field.frontX)<.20&&p.y>F.minY&&p.y<F.maxY&&p.z>F.minZ&&p.z<F.maxZ));
  assert.deepEqual(field,sourceChunkFaultFrame({...state,elapsed:state.elapsed+1000}));
  const reduced=sourceChunkFaultFrame(state,{reducedMotion:true});assert.equal(reduced.pieces.length,field.pieces.length);
  assert.deepEqual(reduced,sourceChunkFaultFrame({...state,elapsed:1000},{reducedMotion:true}));
  const rendered=sourceContinuationRenderFrame(state);const pieces=rendered.canonicalProps.filter(p=>p.chunkFault);
  assert.equal(pieces.length,field.pieces.length);assert.ok(pieces.every(p=>p.descriptorId==='wrong-closing-front'&&p.chartId===0&&p.matrix.length===16));
  assert.equal(rendered.chunkFault.collisionActive,true);assert.equal(JSON.stringify(state),before);
  assert.equal(sourceChunkFaultFrame(fixture({closure:{mode:'dormant'}})).pieces.length,0);
});
