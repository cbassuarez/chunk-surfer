import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SOURCE_IV as C, SOURCE_IV_GEOMETRY, SOURCE_IV_MODELS, SOURCE_IV_CONTACT_DIGEST,
  sourceIVModelMatrix, sourceIVSupportAt, sourceIVCollisionAt } from '../src/data/source-iv.js';
import { freshSourceIV as fresh, normalizeSourceIV as normalize, stepSourceIV as step,
  sourceIVFrame as frame, sourceIVFocus as focus, sourceIVCanOccupy as clear } from '../src/game/source-iv.js';
import { createSourceIVRenderer, sourceIVRenderFrame, installSourceIVMeshes, SOURCE_IV_RENDER_BUDGET } from '../src/render/source-iv-renderer.js';
import { doorAssembly } from '../src/data/source-door-fields.js';

const copy=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const initial=()=>fresh({runId:'source-IV-test',returnPose:{x:7,y:23,yaw:.2}});
function advance(state,seconds,input={},quantum=1/60){const events=[];
  for(let elapsed=0;elapsed+1e-9<seconds;){const dt=Math.min(quantum,seconds-elapsed),result=step(state,{...input,dt});
    state=result.state;events.push(...result.events);elapsed+=dt;}return{state,events};}
const point=(entry,x,z)=>{const m=sourceIVModelMatrix(entry);return{x:m[0]*x+m[8]*z+m[12],z:m[2]*x+m[10]*z+m[14]};};
function native(file,names){const b=fs.readFileSync(new URL(file,import.meta.url)),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n)),bin=b.subarray(28+n),out={};
  function acc(index){const a=j.accessors[index],v=j.bufferViews[a.bufferView],w={SCALAR:1,VEC3:3}[a.type],bytes={5126:4,5125:4,5123:2,5121:1}[a.componentType],read={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||w*bytes,values=[];
    for(let k=0;k<a.count;k++)for(let c=0;c<w;c++)values.push(bin[read](offset+k*stride+c*bytes));return values;}
  for(const name of names){out[name]=[];for(const p of j.meshes.find(m=>m.name===name).primitives){const positions=acc(p.attributes.POSITION);
    for(const index of acc(p.indices))out[name].push(...positions.slice(index*3,index*3+3).map(n=>Math.round(n*1e6)/1e6));}}return out;}

test('printed geometry is one continuous visible support across the full free exploration area',()=>{
  const ground=SOURCE_IV_GEOMETRY.filter(p=>p.id.startsWith('ground'));
  assert.equal(ground.length,12);assert.equal(C.bounds.maxX-C.bounds.minX,72);assert.equal(C.bounds.maxZ-C.bounds.minZ,116);
  for(let x=-35.5;x<36;x+=3)for(let z=-111.5;z<4;z+=3){
    assert.equal(sourceIVSupportAt(x,z)?.y,0);
    assert.ok(ground.some(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ&&p.maxY===0));
  }
  assert.equal(sourceIVSupportAt(-36.01,-20),null);assert.equal(clear(36,-20,initial()),false);
  const rendered=sourceIVRenderFrame(initial());assert.equal(rendered.props.filter(p=>p.sourceIVRole==='ground').length,12);
  for(const p of rendered.props.filter(p=>p.sourceIVRole==='ground'))near(p.matrix[13],-.4);
});

test('native collision remains tied to the exact current piano, cases and Ellery fragment triangle streams',()=>{
  const contacts={...native('../public/assets/conservatory-props.glb',['grand_piano','instrument_case']),
    ...native('../public/assets/source-demolition.glb',['source_demolition_chunk_00','source_demolition_chunk_01','source_demolition_chunk_02'])};
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(contacts)).digest('hex'),SOURCE_IV_CONTACT_DIGEST);
});

test('scaled piano anatomy blocks actual legs and bench legs while leaving its elevated body genuinely open below',()=>{
  for(const model of SOURCE_IV_MODELS.filter(p=>p.mesh==='grand_piano')){
    const under=point(model,0,0);assert.equal(sourceIVCollisionAt(under.x,under.z),null);
    for(const [x,z]of [[-.62,-.70],[.58,-.55],[.42,.72],[-.275,-1.47],[.275,-1.23]]){
      const p=point(model,x,z);assert.equal(sourceIVCollisionAt(p.x,p.z)?.id,model.id,`${model.id} contact(${x},${z})`);
    }
  }
  for(const model of SOURCE_IV_MODELS.filter(p=>p.mesh==='instrument_case'))
    assert.equal(sourceIVCollisionAt(model.x,model.z)?.id,model.id);
  for(const model of SOURCE_IV_MODELS.filter(p=>p.id.endsWith('ellery-rib')))
    assert.equal(sourceIVCollisionAt(model.x,model.z)?.id,model.id);
});

test('free walking, stopping, turning and looking back retain one actual body and supported plane',()=>{
  let state=initial();const before=copy(state);
  const waiting=advance(state,1,{look:{yaw:Math.PI,pitch:.4}}).state;
  assert.equal(waiting.x,before.x);assert.equal(waiting.z,before.z);near(waiting.yaw,Math.PI);
  state=advance(state,2,{side:1}).state;near(state.x,6.4);near(state.z,-2.5);
  state=advance(state,1,{forward:1}).state;near(state.x,6.4);near(state.z,-5.7);
  state=advance(state,1,{forward:-1}).state;near(state.z,-2.5);
  assert.equal(frame(state).player.feet,0);assert.equal(frame(state).support.y,0);
  assert.equal(state.status,'active');assert.equal(state.exitReceipt,null);
});

test('real model contacts, source door piers and finite sheet edges refuse diagonal or long-step tunnelling',()=>{
  const caseModel=SOURCE_IV_MODELS.find(p=>p.id==='western-case');
  let state=normalize({...initial(),x:caseModel.x,z:caseModel.z+7,yaw:0});
  const result=advance(state,8,{forward:1});
  assert.equal(result.state.status,'active');assert.equal(sourceIVCollisionAt(result.state.x,result.state.z),null);
  assert.ok(result.state.z>caseModel.z,'walking cannot enter the case solid');
  state=normalize({...initial(),x:0,z:-2.5,yaw:Math.PI});state=advance(state,2,{forward:1}).state;
  assert.ok(state.z<0,'the retained entry remains closed behind the body');
  state=normalize({...initial(),x:35.5,z:-15});state=advance(state,5,{side:1,forward:1},.25).state;
  assert.ok(state.x<=C.bounds.maxX-C.bodyRadius);assert.equal(sourceIVCollisionAt(state.x,state.z),null);
});

test('only an opened far grey door and an intentional body crossing complete Source IV once',()=>{
  let state=advance(initial(),40,{forward:1},.1).state;
  assert.equal(state.status,'active');assert.ok(state.z>C.exit.z);assert.ok(focus(state));
  const opened=step(state,{interact:true});assert.equal(opened.event.type,'door');assert.equal(opened.state.status,'active');
  state=advance(opened.state,C.doorSeconds).state;assert.equal(frame(state).exitDoor.passable,true);
  const result=advance(state,.5,{forward:1});assert.equal(result.state.status,'completed');
  assert.deepEqual(result.events,[{type:'complete',id:'source-IV:source-IV-test:complete',receipt:'source-IV:source-IV-test:complete'}]);
  assert.equal(result.state.exitReceipt.delivered,false);assert.deepEqual(normalize(copy(result.state)),result.state);
  const again=step(copy(result.state),{dt:99,interact:true,forward:-1});assert.deepEqual(again.events,[]);assert.deepEqual(again.state,result.state);
  const delivered=normalize({...result.state,exitReceipt:{...result.state.exitReceipt,delivered:true}});
  assert.equal(normalize(copy(delivered)).exitReceipt.delivered,true);
});

test('run ownership, finite restore, protected input and serialized partitions preserve the new space independently',()=>{
  assert.deepEqual(normalize(initial(),{runId:'other'}),fresh({runId:'other'}));
  assert.deepEqual(normalize({...initial(),sequenceId:'source-earthfall:source-II-v1'}),fresh({runId:'source-IV-test'}));
  const malformed=normalize({...initial(),x:Infinity,z:NaN,yaw:Infinity,pitch:Infinity});assert.ok(Object.values(malformed).filter(v=>typeof v==='number').every(Number.isFinite));
  for(const guard of [{paused:true},{protected:true},{assetsReady:false},{renderReady:false}]){
    const result=step(initial(),{dt:9,forward:1,side:1,look:{yaw:2},interact:true,...guard});assert.deepEqual(result.state,initial());assert.deepEqual(result.events,[]);
  }
  const a=advance(initial(),3,{forward:1},1/60),b=advance(initial(),3,{forward:1},.1);near(a.state.x,b.state.x);near(a.state.z,b.state.z);near(a.state.clock,b.state.clock);
  const loaded=normalize(copy(a.state));assert.deepEqual(advance(loaded,.2),advance(a.state,.2));
  const current=initial(),before=copy(current);step(current,{dt:.25,forward:1});assert.deepEqual(current,before);
});

function rendererHarness(){
  const catalog=new Map([['grand_piano',{}],['instrument_case',{}]]),frameCalls=[],range=[];let releases=0,disposed=0;
  const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_INT:5,
    createVertexArray:()=>({}),createBuffer:()=>({}),bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},
    vertexAttribPointer(){},vertexAttribDivisor(){},disableVertexAttribArray(){},vertexAttrib1f(){}};
  const maps={texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}};
  const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
  const props={propMeshCatalog:()=>[...catalog.keys()],installAuthoredPropMeshes:install=>install(gl,{catalog}),setPressureInstances(){},
    async addPropPack(url){if(url.includes('source-demolition'))for(const p of SOURCE_IV_MODELS.filter(p=>p.mesh.startsWith('source_demolition')))catalog.set(p.mesh,{});
      else for(const mesh of [goods.frameMesh,goods.leafMesh,goods.freeStandingHeadMesh].filter(Boolean))catalog.set(mesh,{});},
    setAuthoredPropRange(owner,distance){range.push({owner,distance});return()=>{releases++;};}};
  const renderer=new Proxy({r3dBasePropsReady:async()=>true,r3dFrame:value=>{frameCalls.push(value);return true;}},{get(target,key){return target[key]||(()=>{});}});
  const view=createSourceIVRenderer({renderer,props,resolveAsset:url=>url,onRelease:()=>{disposed++;},
    installMeshes:(gl,pack)=>installSourceIVMeshes(gl,pack,{maps})});
  return{view,catalog,frameCalls,range,stats:()=>({releases,disposed})};
}

test('the renderer uses the real shared prop/dither frame and owns one far-range lease with idempotent teardown',async()=>{
  const h=rendererHarness();assert.equal(await h.view.initialize(),true);assert.equal(h.view.ready(),true);
  assert.equal(h.view.render(initial()),true);assert.equal(h.frameCalls.length,1);
  assert.deepEqual(h.frameCalls[0].authoredCamera.eye,[0,C.eyeHeight,-2.5]);
  assert.equal(h.frameCalls[0].textSpace,true);assert.equal(h.frameCalls[0].sourceVoidPhysical,false);
  assert.equal(h.range.length,1);assert.equal(h.range[0].distance,SOURCE_IV_RENDER_BUDGET.far);
  for(const piece of SOURCE_IV_GEOMETRY){const mesh=h.catalog.get('source-IV-'+piece.id);
    assert.equal(mesh.extras.sourceIV,true);assert.equal(mesh.primitives[0].printedSurface.process,'source-fragments');}
  assert.equal(h.view.diagnostics().frame.phase,'Source IV');
  assert.equal(h.view.dispose(),true);assert.equal(h.view.dispose(),false);assert.equal(h.view.render(initial()),false);
  assert.deepEqual(h.stats(),{releases:1,disposed:1});
});
