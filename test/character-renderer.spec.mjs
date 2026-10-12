import assert from 'node:assert/strict';
import { characterFixture } from './fixtures/character-glb.mjs';
import * as P from '../src/render/props3d.js';

// Exercise the production loader and submission path without replacing its
// grouping, frame cache or pose evaluator. Shader compilation is separately
// checked in a browser; this capture verifies which palette each pass receives.
let next=1,activeProgram=null,constants=new Map(),uniforms=new Map(),draws=[],integerJointBindings=0,deleted=0;
// Exercise the loader at WebGL2's minimum guaranteed uniform/texture limits,
// rather than silently relying on a large desktop GPU budget.
const values={MAX_VERTEX_UNIFORM_VECTORS:256,MAX_TEXTURE_SIZE:2048,FRAMEBUFFER_COMPLETE:0x8cd5};
const context=new Proxy({}, {get(_target,name){
  if(name==='getParameter')return token=>values[[...constants].find(([,v])=>v===token)?.[0]]||0;
  if(name==='getExtension')return()=>null;
  if(name==='getShaderParameter'||name==='getProgramParameter'||name==='isProgram')return()=>true;
  if(name==='checkFramebufferStatus')return()=>context.FRAMEBUFFER_COMPLETE;
  if(name==='getUniformLocation')return(program,key)=>`${program.id}:${key}`;
  if(name==='useProgram')return p=>{activeProgram=p;};
  if(name==='vertexAttribIPointer')return loc=>{if(loc===13)integerJointBindings++;};
  if(name==='drawElementsInstanced')return(_mode,count,_type,_off,instances)=>{const get=key=>uniforms.get(`${activeProgram.id}:${key}`);draws.push({program:activeProgram.id,count,instances,enabled:get('uCharacterEnabled'),bones:get('uCharacterBones[0]'),morphs:get('uCharacterMorphWeights')});};
  if(String(name).startsWith('uniform'))return(location,...v)=>{uniforms.set(location,ArrayBuffer.isView(v.at(-1))?Array.from(v.at(-1)):v.at(-1));};
  if(String(name).startsWith('create'))return()=>({id:next++});
  if(String(name).startsWith('delete'))return()=>{deleted++;};
  if(/^[A-Z0-9_]+$/.test(name)){if(!constants.has(name))constants.set(name,next++);return constants.get(name);}
  return()=>{};
}});
const savedFetch=globalThis.fetch;
try{
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>characterFixture()});
  P.props3dInit(context);P.props3dResize(160,90,{shadowMapSize:512});
  const loaded=await P.addCharacterPack('/character-fixture.glb');assert.deepEqual(loaded.meshes,['outskirts_fold_guard']);assert.equal(integerJointBindings,1);
  assert.ok(P.reflectionTargets().depth,'mirrored color exposes its own depth for inspection/composition');
  assert.notEqual(P.reflectionTargets().depth,P.propTargets().depth,'main sky depth must never haze mirrored actors');
  const physical={id:'guard',mesh:'outskirts_fold_guard',x:0,y:0,z:-3,character:{clip:'fold',time:1}},reflected={id:'double',mesh:'outskirts_fold_guard',x:.5,y:0,z:-3,reflectionOnly:true,noShadow:true,character:{clip:'fold',time:.25}};
  P.setDynamicPropInstances([physical,reflected]);assert.equal(P.prepareCharacterFrame(7),2);
  physical.character.time=2; // Rendering never resamples a prepared actor.
  const args={camX:0,camY:1.5,camZ:0,yaw:0,light:1,timeSec:7,zoneTints:new Float32Array(21*3).fill(1),shadowPrepared:true};
  P.preparePropShadowPass(args);P.renderPropPass({...args,reflection:true});P.renderPropPass(args);
  assert.equal(draws.length,4,'one physical shadow, two independent reflected actors, one main actor');
  const [shadow,mirrorA,mirrorB,main]=draws;
  assert.equal(shadow.enabled,1);assert.equal(main.enabled,1);assert.notEqual(shadow.program,main.program);
  for(const draw of [shadow,mirrorA,main])assert.ok(Math.abs(draw.bones[28]-1)<1e-6,'shadow/main/reflection share frozen physical pose');
  assert.ok(Math.abs(mirrorB.bones[28]-.25)<1e-6,'second reflection owns independent pose');
  assert.ok(draws.every(d=>d.instances===1),'different character palettes are never mesh-only batched');
  P.prepareCharacterFrame(8);assert.equal(P.characterStats().poses.find(p=>p.id==='guard').time,2);
  assert.equal(P.characterStats().loaded,true);
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>characterFixture(j=>{delete j.skins;delete j.animations;delete j.meshes[0].primitives[0].targets;j.meshes[0].name='ordinary-prop';})});
  await P.addPropPack('/ordinary-fixture.glb');
  P.setDynamicPropInstances([{id:'ordinary',mesh:'ordinary-prop',x:0,y:0,z:-3}]);P.prepareCharacterFrame(9);draws=[];
  P.renderPropPass({...args,timeSec:9,shadowPrepared:false});
  assert.equal(draws.length,2);assert.ok(draws.every(d=>d.enabled===0),'ordinary main and shadow draws reset prior skin state');
  const oldWarn=console.warn;console.warn=()=>{};
  try{
    values.MAX_VERTEX_UNIFORM_VECTORS=200;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>characterFixture()});
    await assert.rejects(P.addCharacterPack('/low-capacity.glb'),/uniform budget/);
    assert.equal(P.characterStats().loaded,true,'an inadequate device never removes the installed scene');
    values.MAX_VERTEX_UNIFORM_VECTORS=256;
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(24)});await assert.rejects(P.addCharacterPack('/broken.glb'),/GLB 2/);
  }finally{values.MAX_VERTEX_UNIFORM_VECTORS=256;console.warn=oldWarn;}
  assert.equal(P.characterStats().loaded,true,'failed additions preserve installed characters');assert.match(P.characterStats().error,/GLB 2/);
  P.props3dInit(context);assert.equal(P.characterStats().loaded,false);assert.ok(deleted>0,'re-init disposes character GPU resources');
}finally{globalThis.fetch=savedFetch;}
console.log('character-renderer: transactional GPU loading, independent actors, frozen main/reflection/shadow palettes and re-init cleanup passed');
