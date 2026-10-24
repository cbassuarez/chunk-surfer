import test from 'node:test';
import assert from 'node:assert/strict';
import * as R3 from '../src/render/r3d.js';
import { CELL,F,MATERIAL,ZONE } from '../src/data/floorplan/legend.js';
import { doorAssembly } from '../src/data/source-door-fields.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { conservatoryRiftPlan,conservatoryRiftMiniature,conservatoryRiftRenderFrame,createConservatoryRiftRenderer } from '../src/render/conservatory-rift-renderer.js';

const encode=h=>Math.round((h+8)/32*255);
function layout(){
  const w=56,h=62,rgba=new Uint8Array(w*h*4),material=new Uint8Array(w*h).fill(MATERIAL.practiceFoam),ambient=new Uint8Array(w*h).fill(64);
  for(let z=0;z<h;z++)for(let x=0;x<w;x++)rgba.set([encode(4.8),encode(9),x%17===0?F.SOLID:0,ZONE.practice],(z*w+x)*4);
  const kit=doorAssembly('practice-acoustic-single');
  return{plan:{w,h,rgba,material,ambient,originX:100,originY:92},
    props:[{id:'practice-piano-1',mesh:'upright_piano',x:52.5,y:4.8,z:49,yaw:1.5,scale:1},
      {id:'practice-stand-6',mesh:'music_stand',x:72,y:4.8,z:62.5,yaw:1.77,scale:1},
      {id:'practice-score-parts',mesh:'open_score',x:72,y:6,z:62.5,yaw:1.77,scale:1},
      {id:'practice-stand-8',mesh:'music_stand',x:69.5,y:4.8,z:71.5,yaw:0,scale:1},
      {id:'practice-chair-8',mesh:'chair',x:69,y:4.8,z:71,yaw:-1,scale:1},
      {id:'practice-ensemble-score-a',mesh:'open_score',x:69.5,y:5.8,z:71.5,yaw:0,scale:1},
      {id:'practice-piano-other-floor',mesh:'upright_piano',x:69,y:10,z:71,yaw:0,scale:1}],
    doors:[{id:'practice-west-1',x:59.25,z:49.5,feet:4.8,yaw:Math.PI/2,width:1,halfWidth:.5,normal:{x:-1,z:0},
      archetype:kit.archetype,hinge:'left',swing:'room-in',frameMesh:kit.frameMesh,headMesh:kit.headMesh,mesh:kit.leafMesh,
      leafCount:kit.leafCount,activeLeaves:[0],aperture:kit.aperture,leaf:kit.leaf}],
    lights:[{id:'fixture-real',x:54,y:7,z:50,radius:4,intensity:.8,color:[1,.7,.4]}],
    doorOpen:{'practice-west-1':true},lightingContext:{ambientColor:[.6,.5,.4],ambientIntensity:.04,captureExposure:1}};
}
const frame=(extra={})=>({optionId:'bad-bar',camera:{eye:[53.65,6.05,49.4],yaw:-Math.PI/2,pitch:-.15},floorH:4.8,phase:'embodied',leak:0,...extra});
function harness({gate=null,missing=[],failPack=false}={}){
  const l=layout(),calls=[],catalog=new Set([...l.props.map(p=>p.mesh),'school_desk','loose_pages','loose_note','calibration_pin',...l.doors.flatMap(d=>[d.mesh,d.frameMesh,d.headMesh]).filter(Boolean)].filter(m=>!missing.includes(m)));
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>gate?await gate:true;
  const propRenderer={propMeshCatalog:()=>[...catalog],setPressureInstances:v=>calls.push({name:'pressure',args:[v]}),
    async addPropPack(url){calls.push({name:'pack',args:[url]});if(failPack)throw Error('joinery unavailable');for(const d of l.doors)for(const m of[d.mesh,d.frameMesh,d.headMesh])if(m)catalog.add(m);}};
  let releases=0,torch={on:true,look:{power:.9}};
  const owner=createConservatoryRiftRenderer({layout:l,renderer,propRenderer,resolveAsset:s=>'fixture:'+s,onRelease(){releases++;},getTorch:()=>torch});
  return{l,calls,catalog,owner,releases:()=>releases,setTorch:v=>torch=v};
}

test('a rift changes only a detached local finish while preserving every physical height and flag',()=>{
  const l=layout(),before=structuredClone(l.plan),s=frame({leak:1}),a=conservatoryRiftPlan(l.plan,s);
  assert.deepEqual(l.plan,before);assert.deepEqual(a.plan.rgba,before.rgba);assert.deepEqual(a.plan.ambient,before.ambient);
  assert.ok(a.changed>50);assert.ok(a.changed<a.mask.length/4);
  for(let i=0;i<a.mask.length;i++){
    if(a.mask[i])assert.ok([MATERIAL.sourceField,MATERIAL.sourceFault].includes(a.plan.material[i]));
    else assert.equal(a.plan.material[i],before.material[i]);
  }
  a.plan.rgba.fill(0);a.plan.material.fill(0);assert.deepEqual(l.plan,before);
});

test('the three leaks occupy their actual distinct room bounds and are deterministic while paused',()=>{
  const l=layout(),a=conservatoryRiftPlan(l.plan,frame({leak:.7})),b=conservatoryRiftPlan(l.plan,frame({optionId:'after-company',leak:.7})),c=conservatoryRiftPlan(l.plan,frame({optionId:'fifth-chair',leak:.7}));
  assert.notDeepEqual(a.mask,b.mask);assert.notDeepEqual(b.mask,c.mask);assert.notDeepEqual(c.mask,a.mask);
  assert.deepEqual(a,conservatoryRiftPlan(l.plan,frame({leak:.7,elapsed:1000})));
  const entry=conservatoryRiftPlan(l.plan,frame());assert.ok(entry.changed>0&&entry.changed<20,'the initial physical Source seam is present before the wider invasion');
  assert.deepEqual(conservatoryRiftPlan(l.plan,frame({leak:.7001})),a,'same upload bucket has the same exact finish');
});

test('the miniature uses actual retained ensemble meshes and one uniform scale over a real desk and paper',()=>{
  const l=layout(),before=structuredClone(l),m=conservatoryRiftMiniature(l,frame({optionId:'fifth-chair',markerIndex:3}));
  assert.deepEqual(l,before);assert.equal(m.scale,.09);assert.deepEqual(m.center,[72,5.526,62.5]);
  assert.ok(m.props.some(p=>p.mesh==='school_desk'));assert.ok(m.props.some(p=>p.id==='rift-miniature-paper'&&p.mesh==='loose_note'));
  for(const id of m.sourceIds){const source=l.props.find(p=>p.id===id),tiny=m.props.find(p=>p.miniatureOf===id);assert.equal(tiny.mesh,source.mesh);assert.equal(tiny.scale,source.scale*.09);assert.ok(tiny.y>=m.center[1]);}
  assert.ok(!m.sourceIds.includes('practice-piano-other-floor'));assert.ok(m.sourceIds.includes('practice-stand-8'));
  const marker=m.props.find(p=>p.riftMarker);assert.ok(marker.x>m.center[0]);assert.equal(m.lights.length,2);
});

test('overhead and first person use the supplied exact camera, never inferred eye height',()=>{
  const l=layout(),a=conservatoryRiftRenderFrame(l,frame()),overhead=frame({optionId:'fifth-chair',camera:{eye:[72,7.05,62.5],yaw:0,pitch:-Math.PI/2}}),c=conservatoryRiftRenderFrame(l,overhead);
  assert.deepEqual(a.camera,frame().camera);assert.deepEqual(c.camera,overhead.camera);assert.equal(c.camera.pitch,-Math.PI/2);assert.equal(c.floorH,4.8);
  assert.equal(a.miniature,null);assert.ok(c.miniature.sourceIds.length>0);assert.ok(!c.props.some(p=>p.id==='practice-stand-6'));assert.ok(c.props.some(p=>p.id==='rift-miniature-paper'));
  assert.ok(a.props.some(p=>p.id==='practice-stand-6'));assert.deepEqual(c.plan.rgba,l.plan.rgba);
  assert.throws(()=>conservatoryRiftRenderFrame(l,{}),/simulation-owned camera/);
});

test('candidate props, lights and deliberate omissions follow the same frame without mutating the host',()=>{
  const l=layout(),before=structuredClone(l),extra={id:'review-extra',mesh:'chair',x:54,y:4.8,z:49};
  const f=conservatoryRiftRenderFrame(l,frame({props:[extra],lights:[{id:'cue',x:54,y:6,z:49,intensity:1,radius:4,color:[1,0,0]}],hiddenProps:['practice-piano-1']}));
  assert.deepEqual(l,before);assert.ok(f.props.some(p=>p.id==='review-extra'));assert.ok(!f.props.some(p=>p.id==='practice-piano-1'));assert.ok(f.lights.some(p=>p.id==='cue'));
  f.props.find(p=>p.id==='review-extra').mesh='changed';assert.equal(extra.mesh,'chair');assert.ok(f.lights.length<=8);
});

test('the overhead token and issued entrances are placed from normalized simulation coordinates',()=>{
  const l=layout(),a=conservatoryRiftMiniature(l,frame({optionId:'fifth-chair',token:{x:.18,z:.5},issuedMarks:[{index:1}],marks:[{index:0,x:.18,z:.5},{index:1,x:.39,z:.5}]})),
    b=conservatoryRiftMiniature(l,frame({optionId:'fifth-chair',token:{x:.82,z:.5},issuedMarks:[]}));
  assert.ok(a.token[0]<72);assert.ok(b.token[0]>72);assert.equal(a.token[2],62.5);assert.equal(b.token[2],62.5);
  assert.ok(a.props.some(p=>p.riftIssued===1));assert.ok(!a.props.some(p=>p.riftIssued===0));
  assert.ok(!b.props.some(p=>p.riftIssued!=null));assert.equal(a.props.find(p=>p.riftEntrance===1).issued,true);
  assert.equal(a.props.filter(p=>p.riftPlayerChair!=null).length,4);assert.equal(a.props.some(p=>p.riftListenerChair),false);
  assert.equal(conservatoryRiftMiniature(l,frame({leak:.3})).props.filter(p=>p.riftListenerChair).length,1);
});

test('the overhead board has measured 1.10 by .65 metre bounds and no full-size host score can cover its chairs',()=>{
  const l=layout(),s=frame({optionId:'fifth-chair',camera:{eye:[72,6.126,62.5],yaw:0,pitch:-Math.PI/2},leak:.5}),f=conservatoryRiftRenderFrame(l,s),paper=f.props.find(p=>p.id==='rift-miniature-paper'),box=PROP_BOUNDS[paper.mesh];
  const corners=[];for(const x of[box.min[0],box.max[0]])for(const y of[box.min[1],box.max[1]])for(const z of[box.min[2],box.max[2]])corners.push([0,1,2].map(a=>paper.matrix[a]*x+paper.matrix[4+a]*y+paper.matrix[8+a]*z+paper.matrix[12+a]));
  const span=axis=>Math.max(...corners.map(p=>p[axis]))-Math.min(...corners.map(p=>p[axis]));
  assert.ok(Math.abs(span(0)-1.10)<1e-6);assert.ok(Math.abs(span(2)-.65)<1e-6);assert.ok(span(1)<.003);
  assert.ok(!f.props.some(p=>p.id==='practice-score-parts'||p.id==='practice-stand-6'));
  assert.ok(conservatoryRiftRenderFrame(l,frame()).props.some(p=>p.id==='practice-score-parts'),'the ordinary room remains retained outside this local model');
  assert.ok(f.props.filter(p=>p.riftEntrance!=null).every(p=>p.mesh==='calibration_pin'&&p.scale<=.20));
  assert.ok(!f.props.some(p=>p.miniatureOf&&/score|pages|note/.test(p.mesh)));assert.equal(f.props.filter(p=>p.riftPlayerChair!=null).length,4);assert.equal(f.props.filter(p=>p.riftListenerChair).length,1);
});

test('the walking route retains fixed paper and corridor light sources at both camera positions',()=>{
  const l=layout(),audio={referenceSource:{x:71.4,y:5.9,z:63.6}},a=conservatoryRiftRenderFrame(l,frame({optionId:'after-company',audio,camera:{eye:[68.55,6.42,70.25],yaw:1.1,pitch:0}})),
    b=conservatoryRiftRenderFrame(l,frame({optionId:'after-company',audio,camera:{eye:[71.4,6.42,63.6],yaw:1.1,pitch:0}}));
  for(const id of['rift-paper-reference-practical','rift-corridor-practical-63.5','rift-corridor-practical-70.5']){
    const x=a.lights.find(l=>l.id===id),y=b.lights.find(l=>l.id===id);assert.ok(x&&y,id);assert.deepEqual(x,y,'authored lights cannot follow the moving camera');
  }
  assert.equal(b.lights.find(l=>l.id==='rift-paper-reference-practical').x,72-.45);assert.ok(b.lights.length<=8);
  const leak=conservatoryRiftRenderFrame(l,frame({optionId:'after-company',label:{text:'CHUNK SURFER'},phase:'leak'})),paper=leak.props.find(p=>p.riftTransferBacking);
  assert.equal(paper.x,72);assert.equal(paper.z,62.5,'the transfer belongs to the discovered copied-parts score, not the ensemble behind the player');
});

test('diegetic labels use the supplied world quad and existing Source lettering atlas',async()=>{
  const h=harness();await h.owner.initialize();const m=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,53,5.8,49,1]);
  h.owner.render(frame({labels:[{id:'student-transfer',text:'CHUNK SURFER',matrix:m,color:'page'}]}));
  const scene=h.calls.findLast(c=>c.name==='r3dSetSourceScene').args[0];
  assert.equal(scene.corpus[0].text,'CHUNK SURFER');assert.deepEqual(scene.dynamicInstances[0].matrix,m);assert.equal(scene.look.roomMemoryActive,false);
  h.owner.render(frame());assert.equal(h.calls.findLast(c=>c.name==='r3dSetSourceScene').args[0].dynamicInstances.length,0);h.owner.dispose();
});

test('the transfer identity rests on a handspan paper backing on the retained score rather than facing the camera',()=>{
  const l=layout(),score={id:'practice-score-exam',mesh:'open_score',x:53,y:5.74,z:49,yaw:1.51};l.props.push(score);
  const view=conservatoryRiftRenderFrame(l,frame({phase:'leak',label:{text:'CHUNK SURFER'}})),label=view.labels.find(l=>l.id==='rift-transfer-label'),paper=view.props.find(p=>p.riftTransferBacking);
  assert.equal(paper.mesh,'loose_note');assert.equal(paper.x,score.x);assert.equal(paper.z,score.z);assert.equal(paper.y,score.y+.030);
  assert.equal(label.matrix[13],Math.fround(score.y+.036));assert.ok(Math.abs(Math.hypot(label.matrix[0],label.matrix[1],label.matrix[2])-.30)<1e-7);
  assert.ok(Array.isArray(label.color)&&Math.max(...label.color.slice(0,3))<.04,'the slip uses dark ink, not the Source neon fallback');
  assert.ok(Math.abs(label.matrix[5])<1e-7,'the ink is horizontal on paper');assert.ok(view.lights.some(l=>l.id==='rift-reading-practical'&&l.color[0]>l.color[2]));
});

test('the temporary owner clears previous Source layers and submits the final production acquisition path',async()=>{
  const h=harness();assert.equal(await h.owner.initialize(),true);assert.equal(await h.owner.initialize(),true);assert.equal(h.owner.ready(),true);
  assert.ok(h.calls.some(c=>c.name==='r3dSetSourceCrossing'&&c.args[0]===null));assert.ok(h.calls.some(c=>c.name==='pressure'&&c.args[0].length===0));
  assert.ok(h.calls.some(c=>c.name==='r3dSetSourceSurface'&&c.args[0].length>0));
  const s=frame();h.owner.render(s);const out=h.calls.findLast(c=>c.name==='r3dFrame').args[0];
  assert.deepEqual(out.authoredCamera,s.camera);assert.equal(out.px,s.camera.eye[0]/CELL-.5);assert.equal(out.py,s.camera.eye[2]/CELL-.5);assert.equal(out.floorH,4.8);
  assert.equal(out.plan,true);assert.equal(out.textSpace,false);assert.equal(out.sourceVoidPhysical,false);assert.equal(out.light,1);
  assert.equal(h.calls.some(c=>/r3dInit|SetLookAngles|SetCinematicLook/.test(c.name)),false);
  h.setTorch({on:false,look:{power:.4}});h.owner.render(s);assert.equal(h.calls.findLast(c=>c.name==='r3dFrame').args[0].light,0);
  h.owner.dispose();h.owner.dispose();assert.equal(h.releases(),1);assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(s),false);
});

test('unchanged truth states reuse their upload while a different candidate or leak replaces it',async()=>{
  const h=harness();await h.owner.initialize();for(let i=0;i<5;i++)h.owner.render(frame());
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1);
  h.owner.render(frame({leak:.5}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,2);
  h.owner.render(frame({leak:.5001}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,2);
  h.owner.render(frame({optionId:'after-company',leak:.5}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,3);
  h.owner.dispose();
});

test('missing assets and late readiness fail before a shared view can be acquired',async()=>{
  let resolve;const h=harness({gate:new Promise(r=>resolve=r)}),pending=h.owner.initialize();h.owner.dispose();resolve(true);assert.equal(await pending,false);
  assert.ok(!h.calls.some(c=>c.name==='r3dSetProps'||c.name==='r3dSetPlan'));assert.equal(h.releases(),1);
  const other=harness({missing:['music_stand']});await assert.rejects(other.owner.initialize(),/original meshes missing: music_stand/);assert.equal(other.owner.ready(),false);other.owner.dispose();
  const door=harness();door.catalog.delete(door.l.doors[0].mesh);await door.owner.initialize();assert.equal(door.calls.filter(c=>c.name==='pack').length,1);door.owner.dispose();
});

test('all three published candidates resolve against the actual compiled Ellery plan without host mutation',async()=>{
  const [FP,P,{conservatory},{buildSourceFalseReturnLayout},{resolveConservatoryRiftSites},{candidateStudyFrame}]=await Promise.all([
    import('../src/world/floorplan.js'),import('../src/game/props.js'),import('../src/data/floorplan/conservatory.js'),
    import('../src/game/source-false-return-layout.js'),import('../src/data/conservatory-rift.js'),import('../src/game/conservatory-rift.js')]);
  FP.compile(conservatory.levels,conservatory);P.propsInit(FP);
  const l=buildSourceFalseReturnLayout({floorplan:FP,props:P.renderInstances({inscriptions:false}),propSources:P.allProps()}),sites=resolveConservatoryRiftSites(FP,P.allProps()),doors=FP.saveDoorState();
  for(const id of['bad-bar','after-company','fifth-chair']){
    const input=candidateStudyFrame(id,0,sites),view=conservatoryRiftRenderFrame(l,input),base=l.planFor({x:input.camera.eye[0],z:input.camera.eye[2],feet:input.feet});
    assert.equal(view.optionId,id);assert.deepEqual(view.camera,input.camera);assert.deepEqual(view.plan.rgba,base.plan.rgba);assert.deepEqual(FP.saveDoorState(),doors);
    assert.ok(view.props.some(p=>p.id==='practice-piano-1'));assert.ok(view.props.length>400);assert.ok(view.changedCells>0&&view.changedCells<20);
    if(id==='fifth-chair'){assert.equal(view.camera.pitch,-Math.PI/2);assert.deepEqual(view.miniature.center,[sites[id].board.x,sites[id].board.y,sites[id].board.z]);assert.equal(view.props.filter(p=>p.riftPlayerChair!=null).length,4);}
    else assert.equal(view.miniature,null);
    const leak=conservatoryRiftRenderFrame(l,{...input,phase:'leak',leak:.6,label:{text:'CHUNK SURFER'}});
    assert.ok(leak.labels.some(l=>l.text==='CHUNK SURFER'));assert.ok(leak.changedCells>view.changedCells);
  }
});
