import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {characterFixture} from './fixtures/character-glb.mjs';
import * as optimized from '../src/render/props3d.js';

// Run the prior per-primitive bindings against the same real renderer, not a
// hand-written proxy for its grouping or draw code. The mock WebGL snapshots
// the effective program/uniform/texture state at every actual indexed draw.
async function baselineRenderer(){
  let s=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const start=s.indexOf('  // These samplers and atlas textures belong to the program/pass');
  const end=s.indexOf('  for(const [key,list] of groups)',start);
  assert.ok(start>=0&&end>start);s=s.slice(0,start)+s.slice(end);
  const fast="setMaterialTexture(0,street?.texture||p.texture);setMaterialTexture(4,p.normalTexture);setMaterialTexture(5,street?.ormTexture||p.ormTexture);";
  const old="gl.uniform2f(U('uPaperAtlasGrid'),paperAtlasGrid[0],paperAtlasGrid[1]);gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,paperAtlas);gl.uniform1i(U('uPaperAtlas'),8);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,street?.texture||p.texture);gl.uniform1i(U('uTex'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);gl.uniform1i(U('uPortraitAtlas'),2);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,p.normalTexture);gl.uniform1i(U('uNormalTex'),4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,street?.ormTexture||p.ormTexture);gl.uniform1i(U('uOrmTex'),5);";
  assert.equal(s.split(fast).length,2);s=s.replace(fast,old);
  const base=pathToFileURL(new URL('../src/render/props3d.js',import.meta.url).pathname);
  s=s.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_m,q,p)=>`from ${q}${new URL(p,base).href}${q}`);
  return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
function webgl(){
  let serial=1,program=null,unit=100;const constants=new Map(),uniforms=new Map(),textures=new Map(),draws=[],writes=new Map(),calls={activeTexture:0,bindTexture:0};
  const val=value=>ArrayBuffer.isView(value)?Array.from(value):value;
  const gl=new Proxy({}, {get(_target,name){
    if(name==='getParameter')return token=>token===gl.MAX_VERTEX_UNIFORM_VECTORS?256:token===gl.MAX_TEXTURE_SIZE?2048:0;
    if(name==='getExtension')return()=>null;
    if(name==='getShaderParameter'||name==='getProgramParameter'||name==='isProgram')return()=>true;
    if(name==='checkFramebufferStatus')return()=>gl.FRAMEBUFFER_COMPLETE;
    if(name==='getUniformLocation')return(p,key)=>`${p.id}:${key}`;
    if(name==='useProgram')return p=>{program=p;};
    if(name==='activeTexture')return v=>{calls.activeTexture++;unit=v;};
    if(name==='bindTexture')return(_target,texture)=>{calls.bindTexture++;textures.set(unit,texture?.id??null);};
    if(name==='drawElementsInstanced')return(_mode,count,_type,_offset,instances)=>{
      const get=k=>uniforms.get(`${program.id}:${k}`),samplers=['uTex','uNormalTex','uOrmTex','uPortraitAtlas','uPaperAtlas','uPaperMaterial','uCharacterMorphTex'];
      const state={};for(const key of samplers){const n=get(key);if(n!==undefined)state[key]={unit:n,texture:textures.get(100+n)??null};}
      draws.push({program:program.id,count,instances,state,grid:get('uPaperAtlasGrid'),character:get('uCharacterEnabled'),bones:get('uCharacterBones[0]'),morph:get('uCharacterMorphWeights'),base:get('uBase'),sourceSide:get('uSourceSurroundingsSide')});
    };
    if(String(name).startsWith('uniform'))return(location,...args)=>{uniforms.set(location,args.length===1?val(args[0]):args.map(val));writes.set(location,(writes.get(location)||0)+1);};
    if(String(name).startsWith('create'))return()=>({id:serial++});
    if(/^TEXTURE\d+$/.test(name))return 100+Number(name.slice(7));
    if(/^[A-Z0-9_]+$/.test(name)){if(!constants.has(name))constants.set(name,serial++);return constants.get(name);}
    return()=>{};
  }});
  return{gl,draws,writes,calls};
}
function fixture(character){return characterFixture(j=>{
  if(!character){delete j.skins;delete j.animations;delete j.meshes[0].primitives[0].targets;j.meshes[0].name='loose_note_test';}
  j.images=[{bufferView:0,mimeType:'image/png'},{bufferView:1,mimeType:'image/png'}];j.textures=[{source:0},{source:1}];
  j.materials=[{name:'portrait surface',pbrMetallicRoughness:{baseColorFactor:[.7,.3,.2,1],baseColorTexture:{index:0},metallicRoughnessTexture:{index:1}},normalTexture:{index:1}},
    {name:'other',pbrMetallicRoughness:{baseColorFactor:[.2,.5,.7,1]}}];
  j.meshes[0].primitives.push({...j.meshes[0].primitives[0],material:1});
});}
async function run(P){
  const h=webgl();P.props3dInit(h.gl);P.props3dResize(160,90,{shadowMapSize:512});
  await P.addCharacterPack('/character.glb');await P.addPropPack('/static.glb');
  await P.loadPaperAtlas('/paper.png',{columns:3,rows:2});await P.loadPortraitAtlas('/portrait.png');
  P.setDynamicPropInstances([{id:'guard',mesh:'outskirts_fold_guard',x:0,y:0,z:-3,character:{clip:'fold',time:1}},
    {id:'double',mesh:'outskirts_fold_guard',x:.4,y:0,z:-3,reflectionOnly:true,noShadow:true,character:{clip:'fold',time:.25}},
    {id:'paper',mesh:'loose_note_test',x:1,y:0,z:-3,paperIndex:0}]);
  assert.equal(P.setPressureInstances([{id:'pressure',mesh:'outskirts_fold_guard',x:-.4,y:0,z:-3,character:{clip:'fold',time:.7},pressure:{strength:.8,mode:'core'}}]),1);
  P.prepareCharacterFrame(7);
  const args={camX:0,camY:1.5,camZ:0,yaw:0,light:1,timeSec:7,zoneTints:new Float32Array(63).fill(1),shadowPrepared:true};
  P.preparePropShadowPass(args);P.renderPropPass({...args,reflection:true});assert.equal(P.renderPressurePass(args),true);P.renderPropPass(args);
  // A subsequent pass must re-establish program-local samplers after the
  // shadow/morph paths have changed the active program and texture unit.
  P.preparePropShadowPass({...args,timeSec:8});P.renderPropPass({...args,timeSec:8});
  return h;
}
test('sampler hoisting preserves per-draw effective GL state across main, shadow, reflection and morph passes',async()=>{
  const saved={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,Image:globalThis.Image};
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>fixture(String(url).includes('character')),blob:async()=>new Blob(['fixture'])});
  globalThis.createImageBitmap=async()=>({width:8,height:8,close(){}});
  globalThis.Image=class{set src(_value){this.onload?.();}};
  try{
    const prior=await run(await baselineRenderer()),next=await run(optimized);
    assert.ok(next.draws.length>=12,'exercise multi-material characters and non-character meshes in several passes');
    assert.deepEqual(next.draws,prior.draws);
    const count=(writes,name)=>[...writes].filter(([key])=>key.endsWith(':'+name)).reduce((sum,[,n])=>sum+n,0);
    for(const name of ['uNormalTex','uOrmTex','uPortraitAtlas','uPaperAtlas','uPaperAtlasGrid'])
      assert.ok(count(next.writes,name)<count(prior.writes,name),`${name} is written fewer times`);
    assert.ok(next.calls.bindTexture<prior.calls.bindTexture);
    console.log(JSON.stringify({draws:next.draws.length,bindTexture:{old:prior.calls.bindTexture,new:next.calls.bindTexture},
      paperAtlasWrites:{old:count(prior.writes,'uPaperAtlas'),new:count(next.writes,'uPaperAtlas')}}));
  }finally{Object.assign(globalThis,saved);}
});
