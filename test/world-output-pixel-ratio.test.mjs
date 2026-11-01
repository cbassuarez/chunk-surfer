import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
function extract(begin,end){
  const a=src.indexOf(begin),b=src.indexOf(end,a+begin.length);
  assert.ok(a>=0&&b>a,`production section ${begin}`);
  return src.slice(a,b).replace(/\bexport /g,'');
}
const ratio=extract('export function r3dOutputPixelRatio()', 'const FOG_TEX');
const cell=extract('function resolvePixelMeshCellScenePx()', 'function pixelMeshU(');
const resize=extract('function resize() {', '// ── Facing / input hooks');

function renderer(){
  const events=[];
  const gl=new Proxy({createRenderbuffer:()=>({renderbuffer:true})},{get(target,key){
    if(key in target)return target[key];
    if(typeof key==='string'&&key===key.toUpperCase())return key;
    return (...args)=>{events.push([key,...args]);};
  }});
  const ctx={devicePixelRatio:2,outputPixelRatioOverride:null,outputPixelRatioApplied:null,
    RENDER_SCALE:1,windowGeometryMotion:false,windowGeometryResizePending:false,
    canvas:null,gl:null,pixelMeshSettings:{cellSize:'auto'},currentLook:()=>({vfd:{cellPx:2}}),
    makeTex:(w,h,...rest)=>({kind:'tex',w,h,rest}),makeMeshTex:(w,h)=>({kind:'mesh',w,h}),
    makeFbo:(...args)=>({kind:'fbo',args}),P3:{props3dResize:(...args)=>events.push(['propsResize',...args])},
    pixelMeshStatus:{},uniforms:{},progPixelMesh:{},r3dResetVfdMemory:()=>events.push(['reset'])};
  for(const name of ['sceneTex','sceneFbo','sceneDepthRb','pressureFinishTex','pressureFinishFbo',
    'pressureIdentityTex','horizonStreetTex','markTex','meshTexA','meshTexB','meshFboA','meshFboB',
    'datamoshSourceTex','datamoshSourceFbo','datamoshTexA','datamoshFboA','datamoshTexB','datamoshFboB',
    'sourceFaultTexA','sourceFaultFboA','sourceFaultTexB','sourceFaultFboB','burstOutTex','burstOutFbo'])ctx[name]=null;
  Object.assign(ctx,{pressureFinishReady:false,sourceFaultFlip:false,sourceFaultWarm:false,meshFlip:false,lastPixelMeshAt:0});
  vm.createContext(ctx);vm.runInContext(`${ratio}\n${cell}\n${resize}`,ctx);
  return {ctx,gl,events,allocations:()=>events.filter(e=>e[0]==='propsResize').length,
    init(){ctx.gl=gl;ctx.canvas={parentElement:{clientWidth:1280,clientHeight:800},width:0,height:0};ctx.resize();}};
}

test('pre-init override controls native canvas and scene, while repeated values do not resize',()=>{
  const h=renderer(),c=h.ctx;
  assert.equal(c.r3dOutputPixelRatio(),null);assert.equal(c.r3dEffectiveOutputPixelRatio(),2);
  assert.equal(c.r3dSetOutputPixelRatio(1),1);assert.equal(h.allocations(),0);
  h.init();assert.equal(c.canvas.width,1280);assert.equal(c.canvas.height,800);
  assert.equal(c.pixelMeshStatus.sceneWidth,1280);assert.equal(c.resolvePixelMeshCellScenePx(),2);
  c.r3dSetOutputPixelRatio(1);assert.equal(h.allocations(),1);
  c.r3dSetOutputPixelRatio(.75);assert.equal(c.canvas.width,960);assert.equal(c.canvas.height,600);
  assert.equal(c.pixelMeshStatus.sceneWidth,960);assert.equal(c.resolvePixelMeshCellScenePx(),1.5);
  assert.equal(h.allocations(),2);
});

test('null follows display DPR, including a later display move and render scale',()=>{
  const h=renderer(),c=h.ctx;h.init();
  assert.equal(c.canvas.width,2560);assert.equal(c.resolvePixelMeshCellScenePx(),4);
  c.r3dSetOutputPixelRatio(1);c.r3dSetOutputPixelRatio(null);
  assert.equal(c.r3dOutputPixelRatio(),null);assert.equal(c.canvas.width,2560);
  c.devicePixelRatio=1.5;c.r3dSetOutputPixelRatio(null);
  assert.equal(c.canvas.width,1920);assert.equal(c.resolvePixelMeshCellScenePx(),3);
  c.RENDER_SCALE=.5;c.resize();assert.equal(c.pixelMeshStatus.sceneWidth,960);
  assert.equal(c.resolvePixelMeshCellScenePx(),1.5);
  c.devicePixelRatio=1;c.resize();assert.equal(c.canvas.width,1280);assert.equal(c.pixelMeshStatus.sceneWidth,640);
});

test('geometry motion defers reallocation and keeps dither aligned to the live framebuffer',()=>{
  const h=renderer(),c=h.ctx;h.init();c.r3dSetWindowGeometryMotion(true);
  c.r3dSetOutputPixelRatio(.75);assert.equal(c.r3dEffectiveOutputPixelRatio(),.75);
  assert.equal(c.canvas.width,2560);assert.equal(c.resolvePixelMeshCellScenePx(),4);assert.equal(h.allocations(),1);
  c.r3dSetWindowGeometryMotion(false);assert.equal(c.canvas.width,960);
  assert.equal(c.resolvePixelMeshCellScenePx(),1.5);assert.equal(h.allocations(),2);
  c.r3dSetWindowGeometryMotion(false);assert.equal(h.allocations(),2);
});

test('invalid requests do not reset and numeric bounds are enforced',()=>{
  const h=renderer(),c=h.ctx;h.init();c.r3dSetOutputPixelRatio(.75);
  const before=h.allocations();
  for(const value of [0,-1,NaN,Infinity,'bad'])assert.equal(c.r3dSetOutputPixelRatio(value),.75);
  assert.equal(h.allocations(),before);
  assert.equal(c.r3dSetOutputPixelRatio(.1),.5);assert.equal(c.r3dSetOutputPixelRatio(9),4);
  assert.match(src,/canvas\.style\.cssText = 'display:block;width:100%;height:100%;'/);
  assert.match(src.slice(src.indexOf('export function r3dInit('),src.indexOf('function resize() {')),/\bresize\(\)/);
});
