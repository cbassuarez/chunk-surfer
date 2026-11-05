import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationSurfaces} from '../src/data/source-continuation.js';
import {continuationVoidDomain,continuationVoidDomainForChart} from '../src/data/source-continuation-void.js';
import {captureContinuationVoidLoop,wrapContinuationVoid} from '../src/game/source-continuation-void.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_ESCHER,SOURCE_ESCHER_MESHES_BY_CHART,sourceContinuationEscherFrame,sourceContinuationEscherGeometryLibrary} from '../src/render/source-continuation-escher.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {portalTransformPoint} from '../src/render/source-mesh-portals.js';

const domain=continuationVoidDomain({chartId:0,feet:8.4});
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-4,`${a} != ${b}`));
function falling({elapsed=4,feet=domain.exitFeetY+.001,pitch=-.6}={}){
  const fall={x:29,z:-31,feet,chartId:0,vx:3,vy:-27,vz:0,elapsed,
    voidLoop:captureContinuationVoidLoop({chartId:0,feet:8.4})};
  return {...freshSourceContinuation({runId:'escher-integration'}),...fall,phase:'wrong-return',status:'active',pitch,elapsed:10,fall};
}

test('the merged upright construction includes the actual receiving deck at its real coordinates',()=>{
  const deck=continuationSurfaces({chartId:0}).find(s=>s.id===domain.surfaceId),geometry=sourceContinuationEscherGeometryLibrary()['escher-ii-stone'];
  const corners=[];
  for(let i=0;i<geometry.p.length;i+=3)corners.push(geometry.p.slice(i,i+3));
  for(const x of [deck.minX,deck.maxX])for(const z of [deck.minZ,deck.maxZ])for(const y of [deck.y-deck.thickness,deck.y])
    assert.ok(corners.some(p=>p[0]===x&&p[1]===y&&p[2]===z),`missing deck corner ${x},${y},${z}`);
});

test('the upright image matches the actual lattice wrap, including a nonzero horizontal tile',()=>{
  const state=falling({feet:domain.exitFeetY-.01}),frame=sourceContinuationEscherFrame(state),fall={...state.fall},receipt=wrapContinuationVoid(fall);
  assert.ok(receipt);assert.notEqual(receipt.tileX,0);
  const image=frame.props.find(p=>p.escherBand===1&&p.escherKind==='upright');assert.ok(image);
  for(const point of [[0,0,0],[domain.minX,domain.elevation,domain.minZ],[domain.maxX,domain.elevation,domain.maxZ]]){
    const imaged=portalTransformPoint(image.matrix,point),wrapped=imaged.map((v,k)=>v+receipt.translation[k]);
    close(wrapped,point);
  }
  assert.equal(image.excludeVoidApertures,false);
});

test('the house unfolds during the fall and folds away after landing',()=>{
  const early=sourceContinuationEscherFrame(falling({elapsed:0}));assert.equal(early.props.length,0);
  const opened=sourceContinuationEscherFrame(falling({elapsed:SOURCE_ESCHER.unfoldSeconds+1}));
  assert.equal(opened.props.length,176);assert.equal(opened.diagnostics.presence,1);
  const landed={...falling(),fall:null,feet:domain.elevation};let memory=opened.memory;
  const first=sourceContinuationEscherFrame({...landed,elapsed:10.25},{memory});
  assert.ok(first.props.length>0);assert.ok(first.memory.presence<opened.memory.presence);memory=first.memory;
  for(let n=2;n<=7;n++)memory=sourceContinuationEscherFrame({...landed,elapsed:10+n*.25},{memory}).memory;
  assert.equal(memory.presence,0);
  assert.equal(sourceContinuationEscherFrame({...landed,elapsed:12},{memory}).props.length,0);
  assert.equal(sourceContinuationEscherFrame(landed).props.length,0,'a standing frame without fall history adds no images');
});

test('live fall frames preserve the native receiver and bound the separate Escher submission',()=>{
  for(const pitch of [-1.3,-.6,0,.6,1.3]){
    const frame=sourceContinuationRenderFrame(falling({pitch}));
    assert.equal(frame.voidLoop.omittedVisible,0,`pitch ${pitch}: receiver geometry was dropped`);
    assert.ok(frame.props.length<=760,`pitch ${pitch}: native budget exceeded`);
    assert.equal(frame.escher.props.length,176);
    assert.ok(frame.props.length+frame.escher.props.length<=936,`pitch ${pitch}: total bounded submission exceeded`);
    assert.ok(frame.escher.props.every(p=>p.matrix.length===16&&Array.from(p.matrix).every(Number.isFinite)));
  }
});

test('every outward Source II chart repeats its own receiving construction across its actual wrap',()=>{
  const library=sourceContinuationEscherGeometryLibrary();
  for(const chartId of [1,2,3,4]){
    const d=continuationVoidDomainForChart(chartId),deck=continuationSurfaces({chartId}).find(s=>s.id===d.surfaceId);
    const meshes=SOURCE_ESCHER_MESHES_BY_CHART[chartId],corners=meshes.flatMap(name=>{
      const data=library[name],points=[];assert.ok(data,name);
      for(let i=0;i<data.p.length;i+=3)points.push(data.p.slice(i,i+3));return points;
    });
    for(const x of [deck.minX,deck.maxX])for(const z of [deck.minZ,deck.maxZ])for(const y of [deck.y-deck.thickness,deck.y])
      assert.ok(corners.some(p=>p[0]===x&&p[1]===y&&p[2]===z),`${d.id}: missing receiving deck corner ${x},${y},${z}`);
    const fall={x:d.minX+d.periodX*1.37,z:d.minZ-d.periodZ*.3,feet:d.exitFeetY-.01,chartId,vx:0,vy:-24,vz:0,elapsed:4,
      voidLoop:captureContinuationVoidLoop({chartId,feet:d.elevation,phase:'wrong-return'})};
    const state={...freshSourceContinuation({runId:`escher-chart-${chartId}`}),...fall,status:'active',phase:'wrong-return',fall};
    const f=sourceContinuationRenderFrame(state),receipt=wrapContinuationVoid({...fall}),image=f.escher.props.find(p=>p.escherBand===1&&p.escherKind==='upright');
    assert.ok(receipt&&image,d.id);assert.ok(f.escher.props.length>0&&f.escher.props.length<=176,d.id);
    assert.ok(f.props.length<=760&&f.props.length+f.escher.props.length<=936,d.id);
    assert.ok(f.escher.props.every(p=>p.chartId===chartId&&meshes.includes(p.mesh.replace('source-continuation-',''))));
    for(const point of [[deck.minX,deck.y,deck.minZ],[deck.maxX,deck.y,deck.maxZ]]){
      const imaged=portalTransformPoint(image.matrix,point);close(imaged.map((v,k)=>v+receipt.translation[k]),point);
    }
    for(const pitch of [-1.3,-.6,0,.6,1.3]){
      const atSeam=sourceContinuationRenderFrame({...state,pitch,fall:{...fall,feet:d.exitFeetY+.001}});
      assert.equal(atSeam.voidLoop.omittedVisible,0,`${d.id}: native receiver missing at pitch ${pitch}`);
      assert.ok(atSeam.props.length+atSeam.escher.props.length<=936,d.id);
    }
  }
});

test('turned copies stand clear of every chart footprint and fit inside one loop band',async()=>{
  const {continuationVoidDomains}=await import('../src/data/source-continuation-void.js');
  const {SOURCE_ESCHER_LAYOUT}=await import('../src/render/source-continuation-escher.js');
  for(const chartId of [0,1,2,3,4]){
    const layout=SOURCE_ESCHER_LAYOUT[chartId];assert.ok(layout,`chart ${chartId} layout`);
    const domains=continuationVoidDomains.filter(d=>d.chartId===chartId),shortest=Math.min(...domains.map(d=>d.translationY));
    const library=sourceContinuationEscherGeometryLibrary(),points=SOURCE_ESCHER_MESHES_BY_CHART[chartId].flatMap(name=>{
      const p=library[name].p,out=[];for(let i=0;i<p.length;i+=3)out.push(p.slice(i,i+3));return out;});
    const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));

    for(const d of domains.filter((_,i)=>i===0||i===domains.length-1)){
      const fall={x:(d.minX+d.maxX)/2,z:(d.minZ+d.maxZ)/2,feet:d.elevation-1,chartId,vx:0,vy:-3,vz:0,elapsed:4,
        voidLoop:captureContinuationVoidLoop({chartId,feet:d.elevation,phase:'wrong-return'})};
      const state={...freshSourceContinuation({runId:`escher-clear-${chartId}`}),...fall,status:'active',phase:'wrong-return',fall};
      const frame=sourceContinuationEscherFrame(state);assert.ok(frame.props.length,d.id);
      for(const p of frame.props.filter(p=>p.escherKind!=='upright'&&p.escherBand===0)){
        const corners=[];for(const x of[min[0],max[0]])for(const y of[min[1],max[1]])for(const z of[min[2],max[2]])corners.push(portalTransformPoint(p.matrix,[x,y,z]));
        const lo=[0,1,2].map(k=>Math.min(...corners.map(c=>c[k]))),hi=[0,1,2].map(k=>Math.max(...corners.map(c=>c[k])));
        const f=layout.footprint,outside=lo[0]>=f.maxX-1e-6||hi[0]<=f.minX+1e-6||lo[2]>=f.maxZ-1e-6||hi[2]<=f.minZ+1e-6;
        assert.ok(outside,`${d.id} ${p.escherKind} enters the fall column`);
        assert.ok(hi[1]-lo[1]<=shortest+1e-6,`${d.id} ${p.escherKind} is taller than one band`);
      }
    }
  }
});
