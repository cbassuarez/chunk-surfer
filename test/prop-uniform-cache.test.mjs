import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {characterFixture} from './fixtures/character-glb.mjs';
import * as optimized from '../src/render/props3d.js';

// Compare the uncached production renderer with the pass-local cache, at every real draw.
async function baselineRenderer(){
  let s=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const start=s.indexOf('  const materialScalars = new Map();');
  const end=s.indexOf('  // The atlas and morph bindings use different units',start);
  assert.ok(start>=0&&end>start,'find actual pass-local cache');
  s=s.slice(0,start)+"  const setMaterialScalar = (name,value) => gl.uniform1f(U(name),value);\n"+s.slice(end);
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
      const scalarNames=['uAcademicHollow','uAlphaCut','uAoStrength','uBaseAlpha','uDriveInterior','uDriveSurface','uDriveTissue','uDriveWetSurface','uGlassCourtRainMaterial','uLetteringFinish','uMetallic','uMissingManCore','uMissingManSmoke','uNormalScale','uPayphoneCast','uPrintedAreaCoverage','uPubFasciaPaint','uPubFrontSky','uQuietFireEscape','uRenFold','uRoofGlass','uRoofSurface','uRoughness','uSkyExposed','uStreetMix','uStreetOrmEnabled','uStreetRoughnessFactor','uStreetScale','uStreetTex','uUseNormal','uUseOrm','uUsePaperAtlas','uUsePortrait','uUseTex'];
      const scalar=Object.fromEntries(scalarNames.map(key=>[key,get(key)]));
      draws.push({program:program.id,count,instances,state,grid:get('uPaperAtlasGrid'),character:get('uCharacterEnabled'),bones:get('uCharacterBones[0]'),morph:get('uCharacterMorphWeights'),base:get('uBase'),sourceSide:get('uSourceSurroundingsSide'),scalar});
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
test('pass-local material cache preserves scalar GL state at every main, shadow, reflection and character draw',async()=>{
  const saved={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,Image:globalThis.Image};
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>fixture(String(url).includes('character')),blob:async()=>new Blob(['fixture'])});
  globalThis.createImageBitmap=async()=>({width:8,height:8,close(){}});
  globalThis.Image=class{set src(_value){this.onload?.();}};
  try{
    const prior=await run(await baselineRenderer()),next=await run(optimized);
    assert.ok(next.draws.length>=12,'exercise multi-material characters and non-character meshes in several passes');
    assert.deepEqual(next.draws,prior.draws);
    const writes=h=>[...h.writes.values()].reduce((sum,n)=>sum+n,0);
    assert.ok(writes(next)<writes(prior),`fewer uniform writes: ${writes(prior)} -> ${writes(next)}`);
    console.log(JSON.stringify({draws:next.draws.length,uniformWrites:{old:writes(prior),new:writes(next)}}));
  }finally{Object.assign(globalThis,saved);}
});
