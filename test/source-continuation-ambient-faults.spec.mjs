import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION_FAULT_REGIONS,sourceContinuationAmbientFaultGeometry} from '../src/render/source-continuation-faults.js';
import {SOURCE_EARTHFALL_FAULTS} from '../src/data/source-earthfall-faults.js';
import {SOURCE_RIFT} from '../src/game/source-rift.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

const state=(phase='wrong-return',chartId=0)=>({...freshSourceContinuation({runId:'ambient-fault-proof'}),status:'active',phase,chartId});
const n=region=>region.sites.reduce((a,s)=>a+s.count,0);
test('II and III contain distinct dense clusters with a smaller uneven outward distribution',()=>{
  const regions=SOURCE_CONTINUATION_FAULT_REGIONS,main=regions.find(r=>r.id==='ii'),three=regions.find(r=>r.id==='iii'),out=regions.filter(r=>r.id.startsWith('ii-outward'));
  assert.equal(out.length,4);assert.ok(n(main)>150&&n(three)>150);assert.ok(n(main)<SOURCE_EARTHFALL_FAULTS.count&&n(three)<SOURCE_EARTHFALL_FAULTS.count);
  assert.ok(out.every(r=>n(r)<n(main)/3));assert.ok(new Set(out.map(n)).size>1);assert.ok(new Set(main.sites.map(s=>s.count)).size>1);assert.ok(new Set(three.sites.map(s=>s.count)).size>1);
});

test('every added sheet is flat, fixed world geometry with the original Source ink',()=>{
  const library=sourceContinuationAmbientFaultGeometry(),all=[...SOURCE_RIFT.ink,[.84,.88,.94],[.0002,.0003,.0006]];
  assert.ok(library.length<=36);assert.equal(library.reduce((a,p)=>a+p.sheetRanges.length,0),SOURCE_CONTINUATION_FAULT_REGIONS.reduce((a,r)=>a+n(r),0));
  for(const batch of library){
    assert.ok(all.some(color=>color.every((v,i)=>v===batch.base[i])));assert.ok(batch.p.every(Number.isFinite));assert.ok(batch.i.every(Number.isInteger));
    for(const sheet of batch.sheetRanges){
      const points=Array.from({length:sheet.vertexCount},(_,i)=>batch.p.slice((sheet.vertexStart+i)*3,(sheet.vertexStart+i+1)*3));
      const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...normal);
      assert.ok(length>1e-6,sheet.id);for(const p of points)assert.ok(Math.abs(p.reduce((s,v,k)=>s+(v-points[0][k])*normal[k],0))/length<1e-7,sheet.id);
    }
  }
});

test('real frame selects only the current region and keeps its scenery fixed as body and clock change',()=>{
  for(const region of SOURCE_CONTINUATION_FAULT_REGIONS){
    const a=sourceContinuationRenderFrame(state(region.phase,region.chartId)),b=sourceContinuationRenderFrame({...state(region.phase,region.chartId),x:3,z:-4,elapsed:43},{reducedMotion:true});
    assert.equal(a.ambientFaultDiagnostics.sheets,n(region));assert.ok(a.ambientFaultDiagnostics.batches>0&&a.ambientFaultDiagnostics.batches<=6);
    assert.deepEqual(a.ambientFaults.map(p=>[p.id,Array.from(p.matrix)]),b.ambientFaults.map(p=>[p.id,Array.from(p.matrix)]));
    assert.ok(a.ambientFaults.every(p=>p.chartId===region.chartId&&p.region===region.phase&&!p.structural&&!p.collidable&&p.noShadow));
    assert.ok(a.ambientFaults.every(p=>!a.props.includes(p)),'native portal copies keep their own budget');
  }
  assert.equal(SOURCE_RIFT.faults.length,2,'decorative sheets do not add opening rift interactions');
});
