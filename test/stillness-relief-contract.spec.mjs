import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STILLNESS_RELIEF_PROXY_BYTE,STILLNESS_RELIEF_PROXY_TAG,STILLNESS_RELIEF_PROXY_GLSL} from '../src/render/stillness-relief-contract.js';
import {FIRE_ESCAPE_INK_BYTE,FIRE_ESCAPE_INK_GLSL} from '../src/render/fire-escape-ink.js';
import {ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE,ROOF_SURFACE_INK_GLSL,ROOF_GLASS_INK_GLSL} from '../src/render/roof-surface-ink.js';
import {MISSING_MAN_CORE_BYTE,MISSING_MAN_SMOKE_BYTE,MISSING_MAN_MATERIAL_GLSL} from '../src/render/missing-man-material.js';
import {encodePrintedSurface,encodePrintedAreaSurface,decodePrintedSurface,packPropWorldDepth,unpackPropWorldDepth} from '../src/render/printed-surface.js';
import {props3dDebugShaders} from '../src/render/props3d.js';
import {r3dLightingShaderSources} from '../src/render/r3d.js';
import {stillnessReliefInstances} from '../src/render/stillness-relief.js';

const p3=props3dDebugShaders(),march=r3dLightingShaderSources().march;
const propSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const normalize=v=>{const n=Math.hypot(...v);assert.ok(n>0);return v.map(x=>x/n);};
function body(source,name){
  const match=source.match(new RegExp(`(?:float|vec3)\\s+${name}\\s*\\([^)]*\\)\\s*\\{([^{}]*)\\}`));
  assert.ok(match,`missing scalar contract function ${name}`);return match[1];
}
function classifier(source,name){
  const constants=Object.fromEntries([...source.matchAll(/const float (\w+)\s*=\s*([\d.]+)\s*\/\s*([\d.]+)\s*;/g)].map(m=>[m[1],Number(m[2])/Number(m[3])]));
  const parameter=source.match(new RegExp(`float\\s+${name}\\s*\\(float\\s+(\\w+)\\)`))?.[1];
  assert.ok(parameter,`${name} must declare its scalar input`);
  const fn=new Function(...Object.keys(constants),parameter,'step','abs',body(source,name));
  return value=>fn(...Object.values(constants),value,(edge,x)=>x<edge?0:1,Math.abs);
}
// Evaluate the production GLSL's component arithmetic on CPU, then apply the
// actual RGBA8 quantization boundary. This is not a GPU execution claim.
function scalarNormalOperation(name,argument){
  const returned=body(STILLNESS_RELIEF_PROXY_GLSL,name).trim().match(/^return\s*(.+);$/)?.[1];
  assert.ok(returned,`${name} must expose its normal arithmetic`);
  const inner=returned.startsWith('normalize(')?returned.slice('normalize('.length,-1):returned;
  const expression=inner.replaceAll(argument,'x');assert.match(expression,/^[\d.x+*/()\s-]+$/);
  return new Function('x',`return ${expression};`);
}
const encodeComponent=scalarNormalOperation('stillnessReliefEncodeNormal','normal');
const decodeComponent=scalarNormalOperation('stillnessReliefDecodeNormal','encoded');
const byteNormal=n=>n.map(v=>Math.round(encodeComponent(v)*255));
const decodedNormal=bytes=>normalize(bytes.map(v=>decodeComponent(v/255)));
const isProxy=classifier(STILLNESS_RELIEF_PROXY_GLSL,'stillnessReliefProxyTag');

test('the proxy byte is exclusive across actual P3 material, apparition and pigment identities',()=>{
  assert.equal(STILLNESS_RELIEF_PROXY_TAG,STILLNESS_RELIEF_PROXY_BYTE/255);
  assert.ok(Number.isInteger(STILLNESS_RELIEF_PROXY_BYTE));
  const classified=[...Array(256).keys()].filter(b=>isProxy(b/255)>.5);
  assert.deepEqual(classified,[STILLNESS_RELIEF_PROXY_BYTE]);
  const otherBytes=[FIRE_ESCAPE_INK_BYTE,ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE,MISSING_MAN_CORE_BYTE,MISSING_MAN_SMOKE_BYTE];
  for(const b of otherBytes)assert.ok(Math.abs(b-STILLNESS_RELIEF_PROXY_BYTE)>=3,`tag ${b} overlaps its neighbour's byte tolerance`);
  for(const [source,name]of [[FIRE_ESCAPE_INK_GLSL,'fireEscapeInkTag'],[ROOF_SURFACE_INK_GLSL,'roofSurfaceInkTag'],[ROOF_GLASS_INK_GLSL,'roofGlassInkTag'],[MISSING_MAN_MATERIAL_GLSL,'missingManCoreTag'],[MISSING_MAN_MATERIAL_GLSL,'missingManSmokeTag'],[march,'litApparitionTag']])
    assert.equal(classifier(source,name)(STILLNESS_RELIEF_PROXY_TAG),0,name);
  for(let i=0;i<=255;i++){
    const amount=i/255;
    for(const tag of [encodePrintedSurface(amount),encodePrintedSurface(amount,'light-on-dark'),encodePrintedAreaSurface(amount)])assert.equal(isProxy(tag),0);
  }
  assert.equal(decodePrintedSurface(STILLNESS_RELIEF_PROXY_TAG).kind,0);
  for(const alpha of[0,.5,.70,.76,.84,1])assert.equal(isProxy(alpha),0);
  for(const [name,glsl]of [['FIRE_ESCAPE_INK',FIRE_ESCAPE_INK_GLSL],['ROOF_SURFACE_INK',ROOF_SURFACE_INK_GLSL],['ROOF_GLASS_INK',ROOF_GLASS_INK_GLSL],['MISSING_MAN',MISSING_MAN_MATERIAL_GLSL]]){
    assert.ok(p3.fragment.includes(glsl),`${name} is compared against the actual P3 shader's tag contract`);
  }
});

test('symmetric byte normals keep every flat tangent exactly zero and all six axes exact',()=>{
  assert.equal(encodeComponent(0)*255,128);
  assert.equal(decodeComponent(128/255),0);
  for(let axis=0;axis<3;axis++)for(const sign of[-1,1]){
    const n=[0,0,0];n[axis]=sign;const bytes=byteNormal(n),decoded=decodedNormal(bytes);
    assert.deepEqual(bytes,n.map(v=>v===0?128:v===1?255:1));
    for(let i=0;i<3;i++)assert.equal(decoded[i],n[i]);
  }
  assert.match(p3.fragment,/o=vec4\(stillnessReliefEncodeNormal\(proxyNormal\),STILLNESS_RELIEF_PROXY_TAG\)/);
  assert.match(march,/reliefNormal=stillnessReliefDecodeNormal\(proxy\.rgb\)/);
});

test('RGBA8 quantization keeps representative unit normals below 0.4 degrees of angular error',()=>{
  let maxError=0;
  const samples=[[1,1,1],[-1,2,-3],[1e-8,1,-1e-8],[.99999,.0001,.003]];
  const count=8192,goldenAngle=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<count;i++){
    const z=1-2*(i+.5)/count,r=Math.sqrt(1-z*z),a=i*goldenAngle;samples.push([r*Math.cos(a),r*Math.sin(a),z]);
  }
  for(const sample of samples){
    const n=normalize(sample),bytes=byteNormal(n),decoded=decodedNormal(bytes);
    for(const b of bytes)assert.ok(b>=1&&b<=255&&Number.isInteger(b));
    const error=Math.acos(Math.max(-1,Math.min(1,n.reduce((sum,x,i)=>sum+x*decoded[i],0))))*180/Math.PI;
    maxError=Math.max(maxError,error);
    assert.ok(Math.abs(Math.hypot(...decoded)-1)<1e-12);
    const opposite=byteNormal(n.map(v=>-v));for(let i=0;i<3;i++)assert.equal(bytes[i]+opposite[i],256);
  }
  assert.ok(maxError<.4,`maximum sampled normal error ${maxError.toFixed(6)} degrees`);
  assert.ok(maxError>.1,'sampling must exercise quantization, not just exactly representable axes');
});

test('the native proxy writes real fragment depth and material identity before texture or lighting work',()=>{
  const start=p3.fragment.indexOf('if(uStillnessWallProxy>.5)'),end=p3.fragment.indexOf('if(uUsePaperAtlas',start);
  assert.ok(start>=0&&end>start);const proxy=p3.fragment.slice(start,end);
  assert.match(proxy,/packPropWorldDepth\(gl_FragCoord\.z\)/);
  assert.match(proxy,/clamp\(uStillnessProxyMaterial,0\.0,255\.0\)\/255\.0/);
  assert.match(proxy,/dot\(proxyNormal,uEye-vWorld\)<0\.0\?-proxyNormal:proxyNormal/);
  assert.match(proxy,/return;/);assert.doesNotMatch(proxy,/texture\(|gl_FragDepth|uTime|uLight|emissive/i);
  assert.ok(end<p3.fragment.indexOf('vec4 texel='),'proxy cannot be recoloured by the donor texture');
  assert.match(propSource,/setMaterialScalar\('uStillnessWallProxy',p\.materialRole==='stillness-wall-proxy'\?1:0\)/);
  const pass=propSource.slice(propSource.indexOf('export function renderPropPass('),propSource.indexOf('export function propPackStats('));
  assert.match(pass,/gl\.enable\(gl\.DEPTH_TEST\);gl\.depthMask\(true\);gl\.depthFunc\(gl\.LEQUAL\);gl\.disable\(gl\.BLEND\)/);
  for(const d of[0,1/16777215,.01,.15,.5,.999999,1])assert.ok(Math.abs(unpackPropWorldDepth(packPropWorldDepth(d))-d)<=.5/16777215+1e-15);
});

test('MARCH accepts only a nearer, matching wall proxy and shades it through the original receiver plane',()=>{
  const start=march.indexOf('float receiverTHit=tHit;'),end=march.indexOf('vec3 col;',start),guard=march.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(guard,/uStillnessState\.x>\.00001&&uStillnessTreatment>\.5&&uStillnessTreatment<1\.5&&uPropsReady>\.5&&tHit>=0\.0&&surf==1&&!hitLeaf/);
  assert.match(guard,/texelFetch\(uPropColor,pixel,0\)/);assert.match(guard,/texelFetch\(uPropDepth,pixel,0\)/);
  assert.match(guard,/stillnessReliefProxyTag\(proxy\.a\)>\.5&&int\(floor\(proxyData\.a\*255\.0\+\.5\)\)==hitMat/);
  assert.match(guard,/d<\.999999&&viewM<=wallView\+\.008&&wallView-viewM<\.65/);
  assert.match(guard,/tHit=viewM\/\(CELL_METERS\*cosine\);anatomicalRelief=true/);
  assert.match(march,/receiverPosM=anatomicalRelief\?posM-receiverNormal\*dot\(posM-receiverPlanePoint,receiverNormal\):posM/);
  assert.match(march,/architecturalSurface\(hitMat,surf,receiverPosM,anatomicalRelief\?receiverNormal:n,albedo\)/);
  const normal=march.indexOf('if(anatomicalRelief)n=normalize(reliefNormal+(n-receiverNormal))');
  assert.ok(normal>start&&normal<march.indexOf('float lambert=',normal),'the displaced normal participates in ordinary lighting');
  assert.match(march,/propView < archView \+ 0\.015 && !paneTop && litBody<\.5&&stillnessReliefProxyTag\(prop\.a\)<\.5/,'encoded normals cannot replace the final wall colour');
});

test('CPU receivers are right-handed, fit the anatomical aspect and never submit a singular zero-depth proxy',()=>{
  const wall={id:'contract:wall',origin:[2,3,4],right:[1,0,0],up:[0,1,0],normal:[0,0,1],widthM:1.4,heightM:1.9,depthM:.2,materialId:7};
  assert.deepEqual(stillnessReliefInstances({amount:0},[wall]),[]);
  for(const amount of[NaN,Infinity,-1])assert.deepEqual(stillnessReliefInstances({amount},[wall]),[]);
  const [instance]=stillnessReliefInstances({amount:1,reducedMotion:true},[wall]);assert.ok(instance);
  assert.ok(instance.matrix.every(Number.isFinite));assert.equal(instance.matrix[10],Math.fround(.2));
  assert.equal(instance.matrix[12],2);assert.equal(instance.matrix[13],3);assert.equal(instance.matrix[14],4);
  assert.ok(Math.abs(instance.matrix[5]/instance.matrix[0]-1.4)<1e-6);
  assert.equal(instance.character,undefined);assert.equal(instance.noShadow,undefined);
  for(const invalid of[{normal:[0,0,-1]},{right:[2,0,0]},{materialId:0},{widthM:0},{depthM:-1}])
    assert.deepEqual(stillnessReliefInstances({amount:1},[{...wall,...invalid}]),[]);
});
