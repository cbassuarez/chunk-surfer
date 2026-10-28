import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as P3 from '../src/render/props3d.js';

const shaders=P3.props3dDebugShaders();
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const asPoint=([x,y,z])=>({x,y,z,xz:[x,z]});
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const vec2=(...a)=>a;

test('actual main and shadow wind phases survive repeated 34.4m rebases at the same simulation time',()=>{
  const expressions=[shaders.vertex,shaders.shadowVertex].map(source=>source.match(/float windPhase=([^;]+);/)?.[1]);
  assert.ok(expressions.every(Boolean));assert.equal(expressions[0],expressions[1]);
  const phase=Function('w','uWorldPatternOffset','uTimeSec','uVegetationWind','dot','vec2',`return ${expressions[0].replace("w.xz+uWorldPatternOffset.xz","[w.x+uWorldPatternOffset.x,w.z+uWorldPatternOffset.z]")}`);
  const point=[4.3,2,87.2],time=31.7,wind={y:.19};
  const original=phase(asPoint(point),asPoint([0,0,0]),time,wind,dot,vec2);
  for(const turns of[1,2,7,29]){
    const shift=turns*34.4,physical=[point[0],point[1],point[2]+shift];
    close(phase(asPoint(physical),asPoint([0,0,-shift]),time,wind,dot,vec2),original);
    assert.notEqual(phase(asPoint(physical),asPoint([0,0,0]),time,wind,dot,vec2),original,'uncompensated phase would jump');
  }
  for(const source of[shaders.vertex,shaders.shadowVertex]){
    assert.match(source,/w\.xz\+=/,'only the authored vegetation deformation moves the physical vertex');
    assert.doesNotMatch(source,/w(?:\.xyz|\.xz)?\s*\+=\s*uWorldPatternOffset/,'a sampling offset must not translate geometry');
  }
});

test('street albedo/ORM and residual materials share pattern space while lights and shadow lookup remain physical',()=>{
  assert.match(shaders.fragment,/vec3 patternWorld=vWorld\+uWorldPatternOffset;/);
  assert.match(shaders.fragment,/streetP=patternWorld\*uStreetScale/);
  assert.match(shaders.fragment,/streetAlbedo=texture\(uTex,streetP\.zy\)/);
  assert.match(shaders.fragment,/streetOrm=texture\(uOrmTex,streetP\.zy\)/);
  assert.match(shaders.fragment,/floor\(patternWorld\*vec3\(12\.0,9\.0,12\.0\)\)/);
  assert.match(shaders.fragment,/float fiber=sin\(patternWorld\.y/);
  assert.match(shaders.fragment,/float vein=fiber\+\.34\*sin\(patternWorld\.y/);
  assert.doesNotMatch(shaders.fragment,/(?:sin|floor)\(vWorld[. *]/);
  assert.match(shaders.fragment,/toEye=uEye-vWorld/);
  assert.match(shaders.fragment,/toLamp=uTorchOrigin-vWorld/);
  assert.match(shaders.fragment,/flashlightShadow\(vWorld,n,ldir\)/);
  assert.match(shaders.fragment,/architecturalLightVisibility\(vWorld,uLocalLightPos\[li\]\.xyz\)/);
  for(const scale of[.45,.6,.7,.75,.8,.9,1.1,2.5,3,4,5])for(const turns of[1,7,29]){
    const z=83.1,shift=34.4*turns;close((z+shift-shift)*scale,z*scale);
  }
});

// CPU WebGL witness: real GLB parsing, texture selection and production entry
// points. It records draw submissions; it does not claim shader/GPU validation.
function fixturePack(){
  const bin=Buffer.alloc(84),positions=[-.5,0,0,.5,0,0,0,1,0],normals=[0,0,1,0,0,1,0,0,1];
  positions.forEach((n,i)=>bin.writeFloatLE(n,i*4));normals.forEach((n,i)=>bin.writeFloatLE(n,36+i*4));[0,1,2].forEach((n,i)=>bin.writeUInt16LE(n,72+i*2));
  const material=(name,extra={})=>({name,pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1],roughnessFactor:.8,metallicFactor:0,...extra}});
  const materials=[material('openingStreet.asphalt',{baseColorTexture:{index:0},metallicRoughnessTexture:{index:1}}),material('openingStreet.roughStone',{baseColorTexture:{index:2}}),material('wet slate'),material('board marked concrete'),material('wet slate',{baseColorTexture:{index:3},metallicRoughnessTexture:{index:4}}),material('ivory')];
  const names=['pattern_bank_asphalt','pattern_bank_stone','pattern_road','pattern_no_orm','pattern_own_uv','pattern_neutral'];
  const json={asset:{version:'2.0'},buffers:[{byteLength:84}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:6},{buffer:0,byteOffset:80,byteLength:4}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5123,count:3,type:'SCALAR'}],images:[{bufferView:3,mimeType:'image/png'}],textures:Array.from({length:5},()=>({source:0})),materials,meshes:names.map((name,i)=>({name,extras:{bounds:{min:[-.5,0,0],max:[.5,1,0]},vegetationWind:{amplitudeM:.04,frequencyHz:.19,heightM:1}},primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:i}]})),nodes:names.map((_,i)=>({mesh:i})),scenes:[{nodes:names.map((_,i)=>i)}],scene:0};
  const encoded=Buffer.from(JSON.stringify(json)),text=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(text);
  const out=Buffer.alloc(28+text.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);out.writeUInt32LE(bin.length,20+text.length);out.writeUInt32LE(0x004e4942,24+text.length);bin.copy(out,28+text.length);
  return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
function fakeGL(){
  let serial=1,active=0,program=null;const constants=new Map(),uniforms=new Map(),textures=new Map(),draws=[];
  const gl=new Proxy({}, {get(_target,name){
    if(name==='isContextLost')return()=>false;
    if(name==='getExtension')return()=>null;
    if(name==='getParameter')return()=>4096;
    if(['getShaderParameter','getProgramParameter','isProgram'].includes(name))return()=>true;
    if(name==='checkFramebufferStatus')return()=>gl.FRAMEBUFFER_COMPLETE;
    if(name==='getUniformLocation')return(p,key)=>({program:p.id,key});
    if(name==='useProgram')return p=>{program=p?.id;};
    if(name==='activeTexture')return unit=>{active=unit;};
    if(name==='bindTexture')return(_target,texture)=>textures.set(active,texture);
    if(String(name).startsWith('uniform'))return(location,...args)=>{
      const values=uniforms.get(location.program)||{};values[location.key]=ArrayBuffer.isView(args.at(-1))?Array.from(args.at(-1)):args.length===1?args[0]:args;uniforms.set(location.program,values);
    };
    if(name==='drawElementsInstanced')return()=>draws.push({program,uniforms:structuredClone(uniforms.get(program)),textures:new Map(textures)});
    if(String(name).startsWith('create'))return()=>({id:serial++});
    if(/^[A-Z0-9_]+$/.test(name)){if(!constants.has(name))constants.set(name,serial++);return constants.get(name);}
    return()=>{};
  }});
  return {gl,draws,uniforms,last:()=>draws.at(-1)};
}

test('production main/reflection/prepared+automatic shadow calls upload and reset pattern offsets; street maps bind their real bank textures',async()=>{
  const h=fakeGL(),oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;
  try{
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>fixturePack()});
    globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
    P3.props3dInit(h.gl);P3.props3dResize(160,90,{shadowMapSize:512});await P3.addPropPack('pattern-memory.glb');P3.setDynamicPropInstances([]);
    const args={camX:2,camY:1.62,camZ:3,yaw:0,pitch:0,light:.6,timeSec:10,zoneTints:new Float32Array(21*3).fill(1),streetTextures:true};
    const draw=(mesh,extra={})=>{P3.setPropInstances([{id:mesh,mesh,x:0,y:0,z:-4}]);assert.equal(P3.renderPropPass({...args,...extra}),true);return h.last();};
    const bank=draw('pattern_bank_asphalt'),bankAlbedo=bank.textures.get(h.gl.TEXTURE0),bankOrm=bank.textures.get(h.gl.TEXTURE5);
    assert.ok(bankAlbedo&&bankOrm);assert.notEqual(bankAlbedo.id,bankOrm.id);
    const own=draw('pattern_own_uv');assert.equal(own.uniforms.uUseTex,1);assert.equal(own.uniforms.uUseOrm,1);assert.equal(own.uniforms.uStreetTex,0);
    const fallback=draw('pattern_road',{patternOriginOffsetMetres:[0,0,-34.4]});
    assert.equal(fallback.uniforms.uStreetTex,1);assert.equal(fallback.uniforms.uStreetOrmEnabled,1);
    assert.equal(fallback.uniforms.uUseTex,0);assert.equal(fallback.uniforms.uUseOrm,0,'fallback never enables ordinary UV material sampling');
    assert.equal(fallback.textures.get(h.gl.TEXTURE0),bankAlbedo);assert.equal(fallback.textures.get(h.gl.TEXTURE5),bankOrm);
    close(fallback.uniforms.uRoughness,.64);close(fallback.uniforms.uStreetRoughnessFactor,.8);
    assert.deepEqual(fallback.uniforms.uWorldPatternOffset,[0,0,-34.4]);
    assert.deepEqual(fallback.uniforms.uEye,[2,1.62,3]);
    const camera=[...fallback.uniforms.uView],shadow=[...P3.propTargets().shadowMatrix];
    const reflected=draw('pattern_road',{reflection:true,patternOriginOffsetMetres:[0,0,-68.8]});assert.deepEqual(reflected.uniforms.uWorldPatternOffset,[0,0,-68.8]);
    const plain=draw('pattern_road');assert.deepEqual(plain.uniforms.uWorldPatternOffset,[0,0,0]);assert.deepEqual(plain.uniforms.uView,camera);assert.deepEqual([...P3.propTargets().shadowMatrix],shadow);
    P3.preparePropShadowPass({...args,patternOriginOffsetMetres:[0,0,-103.2]});assert.deepEqual(h.last().uniforms.uWorldPatternOffset,[0,0,-103.2]);
    P3.preparePropShadowPass(args);assert.deepEqual(h.last().uniforms.uWorldPatternOffset,[0,0,0]);
    const noOrm=draw('pattern_no_orm');assert.equal(noOrm.uniforms.uStreetTex,1);assert.equal(noOrm.uniforms.uStreetOrmEnabled,0);
    const off=draw('pattern_road',{streetTextures:false});assert.equal(off.uniforms.uStreetTex,0);assert.equal(off.uniforms.uStreetOrmEnabled,0);assert.equal(off.textures.get(h.gl.TEXTURE0),null);
    const neutral=draw('pattern_neutral');assert.equal(neutral.uniforms.uStreetTex,0);
  }finally{
    globalThis.fetch=oldFetch;if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    P3.setPropInstances([]);P3.setDynamicPropInstances([]);
  }
});

const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
test('pressure identity explicitly retains the ordinary zero pattern origin',()=>{
  const pressure=source.slice(source.indexOf('export function renderPressurePass('),source.indexOf('export function pressureTargets('));
  assert.match(pressure,/uniform3f\(HU\('uWorldPatternOffset'\),0,0,0\)/);
});
