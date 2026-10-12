import test from 'node:test';
import assert from 'node:assert/strict';
import { characterFixture } from './fixtures/character-glb.mjs';
import * as P from '../src/render/props3d.js';

// The real loader, palette cache, culling and draw path run here. A browser
// still has to compile/rasterize the shaders and verify the final silhouette.
test('Pressure owns a bounded depth-tested geometry target and frozen independent poses, never ordinary prop/shadow/reflection draws', async () => {
  let serial=1,activeProgram=null,activeFbo=null,activeTexture=null,checks=0,failAt=-1;
  const constants=new Map(),uniforms=new Map(),draws=[],uploads=[],clears=[],textureFilters=[],deletedTextures=[];
  const values={MAX_VERTEX_UNIFORM_VECTORS:256,MAX_TEXTURE_SIZE:2048};
  const context=new Proxy({}, {get(_target,name){
    if(name==='getParameter')return token=>values[[...constants].find(([,v])=>v===token)?.[0]]||0;
    if(name==='getExtension')return()=>null;
    if(name==='getShaderParameter'||name==='getProgramParameter'||name==='isProgram')return()=>true;
    if(name==='checkFramebufferStatus')return()=>++checks===failAt?0:context.FRAMEBUFFER_COMPLETE;
    if(name==='getUniformLocation')return(program,key)=>`${program.id}:${key}`;
    if(name==='useProgram')return value=>{activeProgram=value;};
    if(name==='bindFramebuffer')return(_target,value)=>{activeFbo=value;};
    if(name==='bindTexture')return(_target,value)=>{activeTexture=value;};
    if(name==='texParameteri')return(_target,key,value)=>{textureFilters.push({texture:activeTexture,key,value});};
    if(name==='deleteTexture')return value=>{deletedTextures.push(value);};
    if(name==='clear')return bits=>{clears.push({fbo:activeFbo,bits});};
    if(name==='bufferData')return(_target,data,usage)=>{if(usage===context.DYNAMIC_DRAW)uploads.push(Array.from(data));};
    if(name==='drawElementsInstanced')return(_mode,count,_type,_offset,instances)=>{
      const get=key=>uniforms.get(`${activeProgram.id}:${key}`);
      draws.push({fbo:activeFbo,program:activeProgram,count,instances,enabled:get('uCharacterEnabled'),bones:get('uCharacterBones[0]'),pressure:get('uPressure'),view:get('uView')});
    };
    if(String(name).startsWith('uniform'))return(location,...args)=>{uniforms.set(location,ArrayBuffer.isView(args.at(-1))?Array.from(args.at(-1)):args.length>1?args:args[0]);};
    if(String(name).startsWith('create'))return()=>({id:serial++});
    if(/^[A-Z0-9_]+$/.test(name)){if(!constants.has(name))constants.set(name,serial++);return constants.get(name);}
    return()=>{};
  }});
  const oldFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>characterFixture(json=>{json.meshes[0].name='pressure_body';json.animations[0].name='pressure_approach';})});
    P.props3dInit(context);P.props3dResize(160,90,{shadowMapSize:512});
    await P.addCharacterPack('/pressure-fixture.glb');
    P.setPropInstances([]);P.setDynamicPropInstances([]);
    const targets=P.pressureTargets();assert.equal(targets.ready,true);
    assert.notEqual(targets.color,P.propTargets().color);assert.notEqual(targets.depth,P.propTargets().depth);
    assert.notEqual(targets.depth,P.reflectionTargets().depth);
    for(const texture of[targets.color,targets.depth])for(const key of[context.TEXTURE_MIN_FILTER,context.TEXTURE_MAG_FILTER]){
      assert.ok(textureFilters.some(f=>f.texture===texture&&f.key===key&&f.value===context.NEAREST),'packed depth/mode bits are linearly filtered');
    }
    const first={id:'real',mesh:'pressure_body',x:0,y:0,z:-3,yaw:.4,character:{clip:'pressure_approach',time:1},pressure:{strength:.8,glow:1,mode:'core',seed:44}};
    const second={...first,id:'front',x:.5,character:{clip:'pressure_approach',time:.25},pressure:{strength:.4,glow:1,mode:'glow',seed:45}};
    assert.equal(P.setPressureInstances([first,second]),2);assert.equal(P.prepareCharacterFrame(7),2);
    first.x=90;first.character.time=2;
    const args={camX:0,camY:1.5,camZ:0,yaw:0,timeSec:7,shadowPrepared:true,zoneTints:new Float32Array(21*3).fill(1)};
    assert.equal(P.renderPressurePass(args),true);
    assert.equal(draws.length,2);assert.ok(draws.every(d=>d.enabled===1&&d.instances===1));
    assert.deepEqual(draws[0].pressure,[.8,1,0,44]);assert.deepEqual(draws[1].pressure,[.4,0,1,45]);
    assert.ok(Math.abs(draws[0].bones[28]-1)<1e-6);assert.ok(Math.abs(draws[1].bones[28]-.25)<1e-6);
    assert.equal(uploads[0][12],0,'the setter retained a mutable caller root');
    const rootTransforms=uploads.map(v=>v.slice(0,16)),palettes=draws.map(v=>v.bones),firstView=draws[0].view;
    draws.length=0;uploads.length=0;P.renderPressurePass({...args,yaw:Math.PI/2});
    assert.deepEqual(uploads.map(v=>v.slice(0,16)),rootTransforms,'a side view rotates Pressure into a billboard');
    assert.deepEqual(draws.map(v=>v.bones),palettes,'another pass advanced the prepared animation');
    assert.notDeepEqual(draws[0].view,firstView,'the test did not change the actual viewing transform');
    const pressureFbo=draws[0].fbo;assert.ok(clears.some(c=>c.fbo===pressureFbo));
    draws.length=0;
    P.preparePropShadowPass(args);P.renderPropPass({...args,reflection:true});P.renderPropPass(args);
    assert.equal(draws.length,0,'Pressure entered ordinary lighting, torch shadows or wet reflections');
    assert.equal(P.setPressureInstances(Array.from({length:8},(_,i)=>({...second,id:`bounded:${i}`}))),4);
    P.renderPressurePass(args);assert.equal(draws.length,4,'the mask submitted more than four actors');
    draws.length=0;
    P.setPressureInstances([{...second,x:500},{...second,pressure:{...second.pressure,mode:'off'}},{...second,pressure:{...second.pressure,strength:0}}]);
    P.renderPressurePass(args);assert.equal(draws.length,0,'culled/off/absent actors still write depth');
    const clearCount=clears.length;
    P.setPressureInstances([]);P.renderPressurePass(args);
    assert.ok(clears.length>clearCount,'an empty frame retains stale Pressure coverage');
    assert.equal(P.pressureTargets().draws,0);
    const oldWarning=console.warn;console.warn=()=>{};
    // A resize recreates ordinary+reflection targets before the optional mask.
    // Failing only that final allocation must leave the rest of the scene alive.
    try{failAt=checks+3;P.props3dResize(161,90,{shadowMapSize:512});}finally{console.warn=oldWarning;}
    assert.equal(P.propTargets().ready,true);assert.equal(P.pressureTargets().ready,false);
    assert.match(P.pressureTargets().error,/framebuffer incomplete/);
    failAt=-1;P.props3dResize(161,90,{shadowMapSize:512});assert.equal(P.pressureTargets().ready,true);
    const lastColor=P.pressureTargets().color;
    P.props3dInit(context);assert.equal(P.pressureTargets().instances,0);assert.equal(P.pressureTargets().ready,false);
    assert.ok(deletedTextures.includes(lastColor),'renderer re-init leaked the Pressure target');
  }finally{globalThis.fetch=oldFetch;}
});
