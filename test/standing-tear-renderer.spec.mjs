import test from 'node:test';
import assert from 'node:assert/strict';
import * as R3 from '../src/render/r3d.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {STANDING_TEAR_LETTERING_PROVENANCE as EAR,STANDING_TEAR_LETTERING_MATERIAL as EAR_PAINT} from '../src/render/standing-tear-lettering.js';
import {STANDING_TEAR_MEMORIES,standingTearPressurePanels,standingTearPressurePanel} from '../src/data/standing-tear-pressure.js';
import {standingTearMemoryPulse} from '../src/data/standing-tear-memory-score.js';
import {STANDING_TEAR_LAYOUT as C} from '../src/data/standing-tear.js';
import {standingTearGeometry,standingTearRenderFrame,standingTearThresholdProps,installStandingTearMeshes,createStandingTearRenderer,createStandingTearPreview,STANDING_TEAR_RENDER_BUDGET as BUDGET} from '../src/render/standing-tear-renderer.js';
import {sourceContinuationMeshPayload} from '../src/render/source-continuation-renderer.js';
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
const geometry=new Map(standingTearGeometry().map(p=>[p.name,p]));
const geometryPayloads=new Map([...geometry].map(([name,piece])=>[name,sourceContinuationMeshPayload(piece)]));
function instanceBounds(instance){
  const payload=geometryPayloads.get(instance.mesh),points=[];
  for(let i=0;i<payload.positions.length;i+=3)points.push(transform(instance.matrix,[...payload.positions.slice(i,i+3)]));
  return{min:[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...points.map(p=>p[a])))};
}
function harness({gate=null}={}){
  const calls=[],catalog=new Set();let releases=0,leased=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>gate?await gate:true;
  renderer.r3dCaptureTowerView=(...args)=>{calls.push({name:'r3dCaptureTowerView',args});return{width:100,height:100};};
  renderer.r3dSetSourceTowerView=(...args)=>{calls.push({name:'r3dSetSourceTowerView',args});return true;};
  const props={propMeshCatalog:()=>[...catalog],installAuthoredPropMeshes:()=>{for(const p of geometry.values())catalog.add(p.name);return[...catalog];},setPressureInstances:v=>calls.push({name:'pressure',args:[v]}),setAuthoredPropRange(owner,range){leased++;calls.push({name:'range',args:[owner,range]});let closed=false;return()=>{if(closed)return false;closed=true;leased--;releases++;return true;};}};
  return{renderer,props,calls,catalog,releases:()=>releases,leased:()=>leased};
}
const memoryState=(pressure=0,seconds=0)=>STANDING_TEAR_MEMORIES.map(m=>({...m,awake:pressure>0,awakeSeconds:seconds,pressure,live:pressure>0}));
const frame=(extra={})=>({phase:'field',elapsed:4,entryFold:1,camera:{eye:[0,1.62,.5],yaw:Math.PI,pitch:0},memories:memoryState(),panels:standingTearPressurePanels(),...extra});
const pressureFrame=(pressure=1,seconds=0,extra={})=>frame({memories:memoryState(pressure,seconds),panels:standingTearPressurePanels(Array(6).fill(pressure),memoryState(pressure,seconds)),...extra});
const worldEye=(side=1,tangent=.2,depth=1.3)=>[C.site.x+C.site.normalZ*tangent-C.site.normalX*side*depth,C.site.feet+1.62,C.site.z-C.site.normalX*tangent-C.site.normalZ*side*depth];

test('the visible floor forms the entire finite supported160x240m basin without height joins',()=>{
  const f=standingTearRenderFrame(frame()),floors=f.props.filter(p=>p.standingTearRole==='basin-support').map(instanceBounds);
  assert.equal(floors.length,96);assert.deepEqual(f.bounds,C.bounds);
  for(let x=C.bounds.minX+.17;x<C.bounds.maxX;x+=3.19)for(let z=C.bounds.minZ+.23;z<C.bounds.maxZ;z+=3.37){
    assert.ok(floors.some(b=>x>=b.min[0]&&x<=b.max[0]&&z>=b.min[2]&&z<=b.max[2]&&b.max[1]===0),`no rendered support at ${x},${z}`);
  }
  assert.equal(Math.min(...floors.map(b=>b.min[0])),C.bounds.minX);assert.equal(Math.max(...floors.map(b=>b.max[0])),C.bounds.maxX);
  assert.equal(Math.min(...floors.map(b=>b.min[2])),C.bounds.minZ);assert.equal(Math.max(...floors.map(b=>b.max[2])),C.bounds.maxZ);
});

test('the initial field has five immense moving returns and flat stock, without a completed body-height room',()=>{
  const f=standingTearRenderFrame(frame({elapsed:0}));
  assert.equal(new Set(f.props.filter(p=>p.standingTearRole==='overhead-fold').map(p=>p.foldId)).size,5);
  assert.equal(f.props.filter(p=>p.standingTearRole==='overhead-fold').length,35);
  assert.equal(f.props.filter(p=>['perimeter','perimeter-fold'].includes(p.standingTearRole)).length,0);
  const courses=f.props.filter(p=>p.standingTearRole==='pressure-course');assert.equal(courses.length,6);
  for(const p of courses){const b=instanceBounds(p);assert.ok(Math.abs(b.max[1])<1e-5,'unmade stock lies outward flush with the existing floor');assert.equal(p.colliding,false);}
  assert.equal(f.labels.length,0,'dormant memories do not start as six completed instruction walls');
});

test('low Source cut banks give every finite support edge an opaque physical face without rebuilding a high room',()=>{
  const f=standingTearRenderFrame(frame()),banks=f.props.filter(p=>p.standingTearRole==='field-margin'),strata=f.props.filter(p=>p.standingTearRole==='field-margin-strata');
  assert.equal(banks.length,40);assert.equal(strata.length,40);
  const edgePieces=[...banks,...strata].map(p=>({p,b:instanceBounds(p)}));
  for(const {p,b}of edgePieces){assert.ok(Math.abs(b.min[1])<1e-6||p.standingTearRole==='field-margin-strata');assert.ok(b.max[1]<=1.321&&b.max[1]<C.eyeHeight,'the field edge remains a low ragged bank');}
  const faceGroups=new Map([[0,-80],[0,80],[2,-30],[2,210]].map(([axis,boundary])=>[`${axis}:${boundary}`,[]]));
  for(const {p}of edgePieces){
    const payload=geometryPayloads.get(p.mesh);
    for(let t=0;t<payload.indices.length;t+=3){
      const tri=Array.from(payload.indices.slice(t,t+3),i=>transform(p.matrix,[...payload.positions.slice(i*3,i*3+3)]));
      for(const [axis,boundary]of[[0,-80],[0,80],[2,-30],[2,210]])if(tri.every(v=>Math.abs(v[axis]-boundary)<2e-5))faceGroups.get(`${axis}:${boundary}`).push(tri);
    }
  }
  const onFace=(point,axis,boundary)=>faceGroups.get(`${axis}:${boundary}`).some(tri=>{
    const other=[0,1,2].filter(k=>k!==axis),cross=(a,b,c)=>(b[other[0]]-a[other[0]])*(c[other[1]]-a[other[1]])-(b[other[1]]-a[other[1]])*(c[other[0]]-a[other[0]]);
    const sides=tri.map((a,i)=>cross(a,tri[(i+1)%3],point));return sides.every(n=>n>=-1e-5)||sides.every(n=>n<=1e-5);
  });
  for(const sign of[-1,1])for(let z=-29.7;z<210;z+=3.7){
    for(const y of[.05,.28,.48,.73,1.03])assert.ok(onFace([sign*80,y,z],0,sign*80),`opaque cut face missing at x=${sign*80}, y=${y}, z=${z}`);
  }
  for(const z of[-30,210])for(let x=-79.7;x<80;x+=3.7){
    for(const y of[.05,.28,.48,.73,1.03])assert.ok(onFace([x,y,z],2,z),`opaque cut face missing at x=${x}, y=${y}, z=${z}`);
  }
  for(const {p,b}of edgePieces){
    if(p.id.includes('side-'))assert.ok(p.physicalBoundary<0?Math.abs(b.max[0]+80)<2e-5:Math.abs(b.min[0]-80)<2e-5);
    else assert.ok(p.physicalBoundary<0?Math.abs(b.max[2]+30)<2e-5:Math.abs(b.min[2]-210)<2e-5);
  }
});

test('every rendered pressure course is exactly the closed physical piece used by capsule collision',()=>{
  for(const progress of[0,.13,.36,.57,.83,1]){
    const input=pressureFrame(progress),f=standingTearRenderFrame(input),courses=f.props.filter(p=>p.standingTearRole==='pressure-course');
    assert.equal(courses.length,6);
    for(const p of courses){
      const actual=geometryPayloads.get(p.mesh),panel=input.panels.find(panel=>panel.id===p.panelId),expected=panel.closedVertices;
      for(let v=0;v<actual.positions.length;v+=3){
        const point=transform(p.matrix,[...actual.positions.slice(v,v+3)]);
        assert.ok(expected.some(corner=>Math.hypot(...corner.map((value,k)=>value-point[k]))<2e-5),`${p.id} must render the authoritative collider at ${progress}`);
      }
      assert.deepEqual(p.authoritativeMatrix,panel.matrix);assert.equal(p.colliding,panel.colliding);assert.equal(p.progress,progress);
    }
  }
});

test('the three persistent music islands occupy the actual spatial voice sources without consoles or player bodies',()=>{
  for(const input of[frame(),pressureFrame(.6,4),pressureFrame(1,17,{preview:true})]){
    const f=standingTearRenderFrame(input),islands=f.props.filter(p=>p.standingTearRole==='music-island');assert.equal(islands.length,3);
    for(const island of islands){
      const memory=input.memories.find(m=>m.id===island.memoryId),b=instanceBounds(island);
      assert.ok(Math.abs(island.x-memory.source.x)<1e-6&&Math.abs(island.z-memory.source.z)<1e-6);
      assert.ok(b.min[1]>=-.005&&b.max[1]<.01,'printed music stock is a floor course, not a raised pedestal');
      assert.equal(island.awake,memory.awake);assert.equal(island.pressure,memory.pressure);
    }
    assert.ok(f.props.every(p=>!p.body&&!/hand|sleeve|reel|key-|correction|reference-body|retained-reference|transfer-stand/.test(p.mesh+' '+p.id)));
  }
  assert.ok(standingTearGeometry().every(p=>!/hand|sleeve|reel|working-stock|retained-stock/.test(p.id)));
});

test('student pressure writing is physical pigment on the exact inward moving course, with sparse overwritten attempts',()=>{
  const f=standingTearRenderFrame(pressureFrame(1)),writing=f.props.filter(p=>p.standingTearRole==='pressure-writing'),text=writing.map(l=>l.text);
  assert.ok(text.includes('PERFECT PRACTICE MAKES')&&text.includes('FOR A PROPER PERFORMANCE'));
  assert.ok(text.includes('THEY ARE WAITING ON ME'));
  assert.ok(text.includes('THE REFERENCE IS NOT TO BE')&&text.includes('STOPPED BETWEEN ATTEMPTS'));
  assert.equal(text.filter(t=>t==='CHUNK SURFER').length,1);assert.ok(text.filter(t=>t==='AGAIN').length>=3);
  assert.equal(f.labels.length,0,'the Ear treatment must use real pigment geometry, never the Source typewriter glyph pass');
  for(const label of writing){
    assert.equal(label.standingTearRole,'pressure-writing');assert.equal(label.physical,true);
    const panel=f.panels.find(p=>p.id===label.panelId),delta=[label.matrix[12]-panel.position[0],label.matrix[13]-panel.position[1],label.matrix[14]-panel.position[2]];
    const depth=delta.reduce((sum,value,k)=>sum+value*panel.axes[2][k],0);
    assert.ok(Math.abs(depth+panel.thickness/2+.0002)<1e-5,'the pressed pigment shares the exact inward stock face');
    assert.equal(label.writingTreatment,'ear-room-pressed-pigment');
    const payload=geometryPayloads.get(label.mesh);let facing=0;
    for(let v=0;v<payload.positions.length;v+=9){
      const triangle=[0,3,6].map(k=>transform(label.matrix,[...payload.positions.slice(v+k,v+k+3)]));
      const a=triangle[1].map((value,k)=>value-triangle[0][k]),b=triangle[2].map((value,k)=>value-triangle[0][k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
      if(n.reduce((sum,value,k)=>sum+value*panel.axes[2][k],0)/length<-.95)facing++;
      for(const point of triangle){const offset=-panel.thickness/2-point.reduce((sum,value,k)=>sum+(value-panel.position[k])*panel.axes[2][k],0);assert.ok(offset>0&&offset<.0021,'Ear pigment remains a film pressed to the stock, not tube lettering');}
    }
    assert.ok(facing/(payload.triangles)>.98,'the real pigment film faces into the formed field');
    assert.ok(label.matrix[13]>.7&&label.matrix[13]<3.5,'writing remains at standing reading height');
  }
  const again=writing.filter(l=>l.text==='AGAIN');assert.ok(new Set(again.map(l=>l.matrix[13].toFixed(3))).size>2);
  const moved=standingTearRenderFrame(pressureFrame(.45));assert.notDeepEqual(moved.props.filter(p=>p.standingTearRole==='pressure-writing').map(l=>l.matrix),writing.map(l=>l.matrix));
});

test('local pigment uses the actual Ear room hand pipeline with matte bone adapted to black Source stock',()=>{
  const source=readFileSync(new URL('../tools/chunk_surfer/build-stop-listening.py',import.meta.url),'utf8');
  const hand=source.slice(source.indexOf('# ── the hand'),source.indexOf('# ── the take sheet'));
  assert.equal(createHash('sha256').update(hand).digest('hex'),EAR.sourceSHA256,'regenerate the local films when the actual Ear room hand changes');
  assert.deepEqual(EAR.sharedFunctions,['hand_strokes','resample','build_writing']);
  assert.ok(EAR.preservedGlyphs.includes('S')&&EAR.extendedGlyphs.includes('R'));
  assert.equal(EAR_PAINT.sourceMaterial,'stop listening paint pale');assert.equal(EAR_PAINT.roughness,.93);assert.equal(EAR_PAINT.metallic,0);
  assert.ok(Math.max(...EAR.material.base.slice(0,3))<.15,'retain the original Ear palette in provenance');
  assert.deepEqual(EAR_PAINT.base,[.82,.76,.63,1],'the final Source stock uses the bounded pale-bone adaptation, with no emission');
  assert.equal(EAR.filmRelief,.0018);assert.ok(standingTearGeometry().filter(p=>p.material==='ear-pigment').length>=7);
});

test('music pigment follows the exact recording clock while pressure geometry stays authoritative',()=>{
  const memories=memoryState(.6,3).map(memory=>({...memory,musicSeconds:1.37}));
  const f=standingTearRenderFrame(pressureFrame(.6,3,{elapsed:99,memories}));
  const g=standingTearRenderFrame(pressureFrame(.6,3,{elapsed:201,memories}));
  for(const island of f.props.filter(p=>p.standingTearRole==='music-island')){
    assert.equal(island.musicPulse,standingTearMemoryPulse(island.memoryId,1.37));
    assert.deepEqual(island.emissive,g.props.find(p=>p.id===island.id).emissive,'advancing a different scene clock cannot restart the recorded voice response');
  }
  assert.deepEqual(f.props.filter(p=>p.standingTearRole==='pressure-course').map(p=>p.matrix),g.props.filter(p=>p.standingTearRole==='pressure-course').map(p=>p.matrix),'music response never deforms the colliding hinge independently');
});

test('closing entry contracts above the body without claiming an invisible collision slab',()=>{
  const open=standingTearRenderFrame(frame({elapsed:0,entryFold:0})),closed=standingTearRenderFrame(frame({entryFold:1}));
  assert.ok(open.props.some(p=>p.standingTearRole==='disappearing-hall-light'));
  assert.ok(!closed.props.some(p=>p.standingTearRole==='disappearing-hall-light'));
  assert.ok(closed.props.filter(p=>p.standingTearRole==='closing-entry').every(p=>instanceBounds(p).min[1]>=2.59&&p.blocking===false));
  const visibleHall=standingTearRenderFrame(frame({elapsed:0,entryFold:0}),{departureViewAvailable:true});
  assert.ok(visibleHall.props.filter(p=>p.standingTearRole==='closing-entry').every(p=>{const b=instanceBounds(p);return b.max[0]<-.675||b.min[0]>.675;}),'open lips cannot occlude the actual1.35m departing-hall view atz-.55');
  assert.ok(!visibleHall.props.some(p=>p.standingTearRole==='disappearing-hall-light'));
});

test('every shared mesh has finite submitted vertices and unit physical normals',()=>{
  for(const piece of geometry.values()){
    const payload=sourceContinuationMeshPayload(piece);assert.ok([...payload.positions,...payload.normals,...payload.uvs].every(Number.isFinite));
    assert.equal(payload.triangles,piece.i.length/3);for(let i=0;i<payload.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...payload.normals.slice(i,i+3))-1)<1e-5);
  }
  assert.ok(BUDGET.customTriangles<20000);assert.equal(BUDGET.far,C.rendererRange);
});

test('actual submitted moving architecture and pale cores preserve standing clearance through the whole74s cycle',()=>{
  const fixedRoles=['basin-support','music-island'],movingRoles=['overhead-fold','source-cut-core'];
  const first=standingTearRenderFrame(frame({elapsed:0})),fixed=first.props.filter(p=>fixedRoles.includes(p.standingTearRole)).map(p=>[p.id,p.matrix]);
  assert.equal(new Set(first.props.filter(p=>p.standingTearRole==='overhead-fold').map(p=>p.foldId)).size,5);
  for(let elapsed=0;elapsed<=74;elapsed+=3.7){
    const f=standingTearRenderFrame(frame({elapsed,referenceStarted:true,architectureRunning:true,referenceSeconds:elapsed}));
    for(const p of f.props.filter(p=>movingRoles.includes(p.standingTearRole)))assert.ok(instanceBounds(p).min[1]>2.4,`${p.id} intersects the standing body at${elapsed}`);
    assert.deepEqual(f.props.filter(p=>fixedRoles.includes(p.standingTearRole)).map(p=>[p.id,p.matrix]),fixed);
  }
  const later=standingTearRenderFrame(frame({elapsed:22}));assert.notDeepEqual(later.props.filter(p=>movingRoles.includes(p.standingTearRole)).map(p=>p.matrix),first.props.filter(p=>movingRoles.includes(p.standingTearRole)).map(p=>p.matrix));
  const reducedA=standingTearRenderFrame(frame({elapsed:0}),{reducedMotion:true}),reducedB=standingTearRenderFrame(frame({elapsed:63}),{reducedMotion:true});
  assert.deepEqual(reducedA.props.filter(p=>movingRoles.includes(p.standingTearRole)).map(p=>p.matrix),reducedB.props.filter(p=>movingRoles.includes(p.standingTearRole)).map(p=>p.matrix));
});

test('temporary renderer uses the actual authored camera, Source acquisition and one released range lease',async()=>{
  const h=harness(),owner=createStandingTearRenderer(h);assert.equal(await owner.initialize(),true);assert.equal(await owner.initialize(),true);assert.equal(h.leased(),1);
  const f=pressureFrame(1,4,{camera:{eye:[7,1.62,40.9],yaw:2.9,pitch:-.3}});owner.render(f);
  const draw=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.deepEqual(draw.authoredCamera,f.camera);assert.equal(draw.sourceVoidPhysical,false);assert.equal(draw.authoredPropRange,320);
  const scene=h.calls.findLast(c=>c.name==='r3dSetSourceScene').args[0];assert.deepEqual(scene.corpus,[]);assert.deepEqual(scene.dynamicInstances,[]);assert.ok(h.calls.findLast(c=>c.name==='r3dSetProps').args[0].some(p=>p.text==='CHUNK SURFER'&&p.writingTreatment==='ear-room-pressed-pigment'));
  assert.equal(owner.dispose(),true);assert.equal(owner.dispose(),false);assert.equal(h.leased(),0);assert.equal(h.releases(),1);assert.equal(owner.render(f),false);
  assert.ok(!h.calls.some(c=>/r3dInit|SetLookAngles|SetCinematicLook/.test(c.name)),'scene must not mutate saved walking look');
});

test('late renderer preparation cannot resurrect a released owner',async()=>{
  let unlock;const gate=new Promise(resolve=>unlock=resolve),h=harness({gate}),owner=createStandingTearRenderer(h),pending=owner.initialize();owner.dispose();unlock(true);
  assert.equal(await pending,false);assert.equal(owner.ready(),false);assert.equal(h.leased(),0);assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,0);
  assert.equal(h.calls.filter(c=>c.name==='r3dSetProps').length,0,'a cancelled preparation never clears another scene owner');
});

test('the real departing hall appears through the closing finite crease instead of an opaque warm substitute',async()=>{
  const h=harness();h.renderer.r3dTowerViewCaptured=()=>({key:'standing-tear-departure'});
  const owner=createStandingTearRenderer(h);await owner.initialize();owner.render(frame({elapsed:.25,entryFold:.25}));
  const view=h.calls.findLast(c=>c.name==='r3dSetSourceTowerView').args[0],props=h.calls.findLast(c=>c.name==='r3dSetProps').args[0];
  assert.ok(view.width>0&&view.width<1.35);assert.deepEqual(view.forward,[0,-1]);assert.ok(view.corners.every(p=>p[2]===-.55));
  assert.ok(!props.some(p=>p.standingTearRole==='disappearing-hall-light'));
  owner.render(frame({entryFold:1}));assert.equal(h.calls.findLast(c=>c.name==='r3dSetSourceTowerView').args[0],null);owner.dispose();
});

test('physical slit has no opaque backing over a live view and keeps its two sided finite lips',()=>{
  const props=standingTearThresholdProps(C.site),bounds=props.map(instanceBounds);
  assert.ok(!props.some(p=>p.standingTearRole==='threshold-backing'));
  const along=C.site.normalX===1?2:0,normal=C.site.normalX===1?0:2,alongCenter=along===2?C.site.z:C.site.x,normalCenter=normal===2?C.site.z:C.site.x;
  assert.ok(bounds.some(b=>b.min[along]<alongCenter-.7));assert.ok(bounds.some(b=>b.max[along]>alongCenter+.7));
  assert.ok(bounds.every(b=>b.min[normal]>normalCenter-.2&&b.max[normal]<normalCenter+.2));
  assert.ok(standingTearThresholdProps(C.site,{backing:true}).some(p=>p.standingTearRole==='threshold-backing'));
});

test('preview captures the actual basin from a continuous mapped eye on either side, then releases range',async()=>{
  const h=harness(),preview=createStandingTearPreview({...h,site:C.site});assert.equal(preview.render({eye:[68,6.42,43]}),false);assert.equal(await preview.initialize(),true);
  for(const sign of[1,-1]){
    const eye=worldEye(sign),yaw=C.site.yaw+(sign>0?Math.PI:0);
    assert.equal(preview.render({eye,yaw,pitch:-.4,time:2}),true);assert.equal(h.leased(),0);
    const capture=h.calls.findLast(c=>c.name==='r3dCaptureTowerView'),[draw,options]=capture.args;
    assert.ok(Math.abs(draw.authoredCamera.eye[0]-sign*.2)<1e-6);assert.ok(Math.abs(draw.authoredCamera.eye[2]+.8)<1e-6);
    assert.equal(draw.authoredCamera.pitch,0);assert.equal(options.allowSource,true);assert.deepEqual(options.sourceEye,eye);assert.equal(options.sourceYaw,yaw);
    assert.ok(!h.calls.findLast(c=>c.name==='r3dSetProps').args[0].some(p=>p.body),'preview cannot show a second player');
    const previewProps=h.calls.findLast(c=>c.name==='r3dSetProps').args[0];
    assert.ok(!previewProps.some(p=>['closing-entry','disappearing-hall-light'].includes(p.standingTearRole)),'the receiving preview must not render the departing-hall closure in front of its camera');
    const apertureBlockers=previewProps.filter(p=>!p.body&&p.standingTearRole!=='basin-support').map(instanceBounds).filter(b=>b.min[0]<=0&&b.max[0]>=0&&b.min[1]<=1.62&&b.max[1]>=1.62&&b.min[2]>draw.authoredCamera.eye[2]&&b.min[2]<0);
    assert.equal(apertureBlockers.length,0,'the actual uploaded basin geometry leaves the incoming sightline open');
    const view=h.calls.findLast(c=>c.name==='r3dSetSourceTowerView').args[0];assert.deepEqual(view.forward,[C.site.normalX*sign,C.site.normalZ*sign]);
  }
  assert.equal(preview.dispose(),true);assert.equal(preview.render({eye:[68,6.42,43]}),false);assert.equal(preview.dispose(),false);
});

test('preview reprojects existing depth without reallocating stationary plans and bounds new captures to8Hz',async()=>{
  const h=harness(),preview=createStandingTearPreview({...h,site:C.site});await preview.initialize();
  assert.equal(preview.render({eye:worldEye(),yaw:Math.PI,time:1}),true);
  assert.equal(preview.render({eye:worldEye(),yaw:Math.PI,time:2}),false);
  assert.equal(preview.render({eye:worldEye(1,.7),yaw:Math.PI,time:1.1}),false);
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1,'a reused capture must leave the building GPU plan alone');
  assert.equal(preview.render({eye:worldEye(1,.7),yaw:Math.PI,time:1.2}),true);
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,2);assert.equal(h.leased(),0);
});
