import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewFrustum, sphereInView, quadInView } from '../src/render/view-frustum.js';
import { deferGlProgram } from '../src/render/deferred-gl-program.js';

const source=readFileSync(process.env.SOURCE_DOOR_RENDER_SOURCE||new URL('../src/render/props3d.js',import.meta.url),'utf8');
const perspective=new Float32Array([1/1.52,0,0,0,0,1/.95,0,0,0,0,-1.002,-1,0,0,-.2002,0]);
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const planes=viewFrustum(identity,perspective);

test('Source scenery outside the camera can be omitted without clipping boundary volumes',()=>{
  assert.equal(sphereInView(planes,[0,0,-8],1),true);
  assert.equal(sphereInView(planes,[0,0,8],1),false);
  assert.equal(sphereInView(planes,[30,0,-8],1),false);
  assert.equal(sphereInView(planes,[12,0,-8],2),true,'a broad frame crossing the screen edge remains');
  assert.equal(sphereInView(planes,[0,0,.05],.4),true,'camera inside/near the bound never makes it vanish');
  assert.equal(sphereInView(planes,[0,30,-8],1),false);
  assert.equal(sphereInView(planes,[0,30,-8],32),true,'tall envelopes retain their full height');
  assert.equal(sphereInView(planes,[NaN,0,-8],1),true,'unknown bounds must not remove geometry');
});

test('a doorway crossing the near plane stays visible; a quad entirely behind is rejected',()=>{
  assert.equal(quadInView(planes,[[-1,-1,-2],[1,-1,-2],[1,1,1],[-1,1,1]]),true);
  assert.equal(quadInView(planes,[[-1,-1,2],[1,-1,2],[1,1,2],[-1,1,2]]),false);
});

test('actual portal pass chooses four visible apertures before applying its budget',()=>{
  const body=source.slice(source.indexOf('export function renderSourcePortals('),source.indexOf('// ST BRENDAN\'S BELFRY, THROUGH THE TOWER DOOR.'))
    .replace('export function','function');
  const uploads=[],draws=[];
  const gl=new Proxy({isContextLost:()=>false,bufferData:(...a)=>uploads.push(a[1]),drawArrays:(...a)=>draws.push(a)},
    {get:(target,key)=>key in target?target[key]:(typeof key==='string'&&key===key.toUpperCase()?key:(()=>{}))});
  const render=new Function('gl','viewFrustum','quadInView',`
    let portalProgram={},portalProgramPending=null,portalProgramFailed=false,portalVao={},portalBuffer={},fbo={},width=640,height=400,marksReady=false;
    const PORTAL_LIMIT=4,PU=()=>null;
    const view=()=>new Float32Array(${JSON.stringify(Array.from(identity))});
    const perspective=()=>new Float32Array(${JSON.stringify(Array.from(perspective))});
    ${body};return renderSourcePortals;`)(gl,viewFrustum,quadInView);
  const aperture=(x,z,variant=0,normal=[0,0,1])=>({origin:[x,0,z],normal,variant,
    corners:[[x-.5,0,z],[x+.5,0,z],[x+.5,2,z],[x-.5,2,z]]});
  const hidden=[aperture(0,1),aperture(0,2),aperture(15,-1),aperture(20,-1)];
  const visible=[aperture(0,-5,1),aperture(0,-7,2),aperture(0,-9,3),aperture(0,-11,4)];
  assert.equal(render({camX:0,camY:1.6,camZ:0,yaw:0,portals:[...hidden,...visible]}),4);
  assert.equal(draws.at(-1)[2],24);
  const data=uploads.at(-1);
  assert.deepEqual([data[5],data[101],data[197],data[293]],[1,2,3,4],
    'nearby off-screen doors cannot evict the actual visible worlds from the cap');
  uploads.length=0;draws.length=0;
  assert.equal(render({camX:0,camY:1.6,camZ:0,yaw:0,portals:hidden}),0);
  assert.equal(uploads.length,0,'looking away does not allocate/upload the aperture vertex stream');
  assert.equal(draws.length,0,'looking away does not submit marched fragments');
});

test('tower door depth comes from the identical vertex plane, allowing early depth rejection',()=>{
  const vertex=source.slice(source.indexOf('const TOWER_VIEW_VERT='),source.indexOf('const TOWER_VIEW_FRAG='));
  const fragment=source.slice(source.indexOf('const TOWER_VIEW_FRAG='),source.indexOf('let towerViewProgram='));
  assert.match(vertex,/vec4\(aPos\.xy,-1\.0,1\.0\)/,'inside doorway still writes nearest zero depth');
  assert.doesNotMatch(fragment,/gl_FragDepth\s*=/,'opaque frames and closed leaves must reject before the depth search');
  assert.match(fragment,/packPropWorldDepth\(gl_FragCoord\.z\)/,'surface marks retain actual plane depth');
});

test('large door programs start during loading and poll readiness without forcing link completion',()=>{
  let complete=false;
  const calls=[],extension={COMPLETION_STATUS_KHR:77};
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    getExtension:()=>extension,createShader:()=>({}),shaderSource:()=>{},compileShader:()=>calls.push('compile'),
    createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>calls.push('link'),
    getProgramParameter:(_,parameter)=>{calls.push(parameter);return parameter===77?complete:true;},
    getShaderParameter:()=>{calls.push('shader-status');return true;},deleteShader:()=>calls.push('delete-shader'),
  };
  const pending=deferGlProgram(gl,'vertex','fragment','door');
  assert.deepEqual(calls,['compile','compile','link'],'warmup submits work without a status round trip');
  assert.equal(pending.poll(),null);
  assert.equal(pending.poll(),null);
  assert.equal(calls.includes(gl.LINK_STATUS),false,'a not-yet-ready door never forces the driver to finish');
  complete=true;assert.ok(pending.poll());
  const count=calls.length;assert.ok(pending.poll());assert.equal(calls.length,count,'finished programs need no further readiness queries');
});

test('pending compilation tolerates loss, disposes once, and validates drivers without KHR',()=>{
  let lost=true,checks=0,deletes=0,valid=true;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    getExtension:()=>null,createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},
    createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},isContextLost:()=>lost,
    getProgramParameter:()=>true,getShaderParameter:()=>{checks++;return valid;},
    getShaderInfoLog:()=> 'bad shader',deleteShader:()=>deletes++,deleteProgram:()=>deletes++,
  };
  const pending=deferGlProgram(gl,'vertex','fragment','door');
  assert.equal(pending.poll(),null);assert.equal(checks,0,'lost context never asks for invalid shader status');
  lost=false;assert.ok(pending.poll(),'a driver without KHR still validates and presents its program');
  pending.dispose();pending.dispose();assert.equal(deletes,3,'shader/program resources are released once');
  assert.equal(pending.poll(),null);
  valid=false;const broken=deferGlProgram(gl,'vertex','fragment','door');
  assert.throws(()=>broken.poll(),/door shader: bad shader/);
  assert.equal(broken.poll(),null,'a failed job cannot repeatedly force shader-error round trips');
});

test('renderer reinitialisation clears programs and pending jobs even when WebGL reuses the same JS context',()=>{
  const body=source.slice(source.indexOf('function resetSourceDoorPrograms('),source.indexOf('// Each open door is a marched world'));
  const releases=[];
  const reset=new Function('gl','releases',`
    let portalProgram={},portalProgramPending={dispose:()=>releases.push('pending-portal')},portalProgramFailed=true,portalVao={},portalBuffer={};
    let towerViewProgram={},towerViewProgramPending={dispose:()=>releases.push('pending-tower')},towerViewProgramFailed=true,towerViewVao={},towerViewBuffer={};
    let openingProgram={},openingVao={},openingBuffer={},crossingProgram={},crossingVao={};
    const portalUniforms=new Map([['a',1]]),towerViewUniforms=new Map([['a',1]]),crossingUniforms=new Map([['a',1]]);
    ${body};resetSourceDoorPrograms();
    return {programs:[portalProgram,towerViewProgram,openingProgram,crossingProgram],pending:[portalProgramPending,towerViewProgramPending],failed:[portalProgramFailed,towerViewProgramFailed],maps:[portalUniforms.size,towerViewUniforms.size,crossingUniforms.size]};
  `)({deleteProgram:()=>releases.push('program'),deleteVertexArray:()=>{},deleteBuffer:()=>{}},releases);
  assert.deepEqual(reset.programs,[null,null,null,null]);assert.deepEqual(reset.pending,[null,null]);
  assert.deepEqual(reset.failed,[false,false]);assert.deepEqual(reset.maps,[0,0,0]);
  assert.equal(releases.filter(x=>x==='program').length,4);
  assert.ok(releases.includes('pending-portal')&&releases.includes('pending-tower'));
});

test('optional portal compile failure leaves the world pass alive and reports once',()=>{
  const body=source.slice(source.indexOf('export function renderSourcePortals('),source.indexOf('// ST BRENDAN\'S BELFRY, THROUGH THE TOWER DOOR.')).replace('export function','function');
  const warnings=[],render=new Function('gl','viewFrustum','quadInView','console',`
    let portalProgram=null,portalProgramPending={poll:()=>{throw Error('bad portal')},dispose:()=>{}},portalProgramFailed=false,portalVao={},portalBuffer={},fbo={},width=640,height=400,marksReady=false;
    const PORTAL_LIMIT=4,PU=()=>null;
    const view=()=>new Float32Array(${JSON.stringify(Array.from(identity))}),perspective=()=>new Float32Array(${JSON.stringify(Array.from(perspective))});
    ${body};return renderSourcePortals;`)(
      {isContextLost:()=>false},viewFrustum,quadInView,{warn:(...args)=>warnings.push(args)});
  const frame={camX:0,camY:1.6,camZ:0,yaw:0,portals:[{origin:[0,0,-5],normal:[0,0,1],corners:[[-1,0,-5],[1,0,-5],[1,2,-5],[-1,2,-5]]}]};
  assert.equal(render(frame),0);assert.equal(render(frame),0);
  assert.equal(warnings.length,1,'a failed optional preview must not throw or log every frame');
});
