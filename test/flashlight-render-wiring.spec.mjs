import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as P3 from '../src/render/props3d.js';
import {resolveTorchFrame,normalizeTorchOptics,TORCH_OPTICS_GLSL} from '../src/render/torch-optics.js';
import {resolveTorchLook} from '../src/render/lighting-model.js';
import {applyFieldKitTorchLook} from '../src/render/field-kit-torch.js';
import {applyHushTorchInterference,inactiveHushField} from '../src/game/hush-field.js';
import {fieldKitEffects} from '../src/game/field-kit.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const vectorClose=(a,b)=>{assert.equal(a.length,b.length);a.forEach((value,i)=>close(value,b[i]));};

test('actual live and tower-capture battery state honor the global effects-off setting',()=>{
  const live=main.match(/const baseTorchLook=resolveTorchLook\(([\s\S]*?)\n  \}\);/)?.[1];
  assert.ok(live,'test evaluates the actual live resolve arguments');
  const start=main.indexOf('function towerViewCaptureState('),end=main.indexOf('\nfunction captureBrendanTowerView(',start);
  assert.ok(start>=0&&end>start);
  const evaluate=(settings,timeSec,capture)=>{
    const sandbox={getSave:()=>({settings}),flashMode:()=>settings.fx===false?'off':settings.flash||'full',storyMode:true,
      hushSensory:false,towerTableauShot:false,sourceRepriseSensory:false,costumeInspectionSensory:false,
      REC:{lightOn:()=>true,batteryLevel:()=>.08},resolveTorchLook,performance:{now:()=>timeSec*1000},currentPerception:()=>({torch:1}),
      WORLD_TILE_W:256,WORLD_TILE_H:256,worldsConfig:[],R3:{WORLD_RGB:{}},currentMoveIntervalMs:()=>100};
    vm.createContext(sandbox);
    if(!capture)return vm.runInContext(`resolveTorchLook(${live}\n})`,sandbox);
    vm.runInContext(main.slice(start,end),sandbox);
    return sandbox.towerViewCaptureState({physical:{x:1,z:2},planYaw:0,floor:0}).torchLook;
  };
  for(const capture of[false,true]){
    for(const settings of[{fx:false,flash:'full'},{fx:true,flash:'reduced'},{fx:true,flash:'off'}]){
      const first=evaluate(settings,2,capture),later=evaluate(settings,9,capture);
      assert.equal(first.band,'failing');assert.equal(first.health,.08);assert.equal(first.power,later.power,'suppression removes flicker without inventing battery health');
    }
    assert.notEqual(evaluate({fx:true,flash:'full'},2,capture).power,evaluate({fx:true,flash:'full'},9,capture).power,'full effects retain the authored failing-voltage behavior');
  }
});

const presentationStart=main.indexOf('function sourcePresentationTorch(');
const presentationEnd=main.indexOf('\nasync function beginCoastalMemoryJourney(',presentationStart);
function presentationHarness({on=true,battery=1,missing=false,perception=.4,flashlight='reference',absorption=.6,effects=false,timeSec=2}={}){
  assert.ok(presentationStart>=0&&presentationEnd>presentationStart,'the actual special-view state helper must exist');
  const calls=[],effectsInput=fieldKitEffects({flashlight}),before=structuredClone(effectsInput);
  const field={active:true,absorption:{light:absorption},pulse:.4};
  const wrap=(name,implementation)=>(...args)=>{const result=implementation(...args);calls.push({name,args,result});return result;};
  const sandbox={REC:{lightOn:()=>on,batteryLevel:()=>battery},itemLost:id=>{assert.equal(id,'torch');return missing;},
    performance:{now:()=>timeSec*1000},flashMode:()=>effects?'full':'off',currentPerception:()=>({torch:perception}),
    activeKitEffects:effectsInput,hushActiveForPlayer:()=>absorption>0,hushFieldFrame:field,inactiveHushField,
    resolveTorchLook:wrap('battery',resolveTorchLook),applyFieldKitTorchLook:wrap('fitted optics',applyFieldKitTorchLook),applyHushTorchInterference:wrap('HUSH',applyHushTorchInterference)};
  vm.createContext(sandbox);vm.runInContext(main.slice(presentationStart,presentationEnd),sandbox);
  const result=sandbox.sourcePresentationTorch();
  assert.deepEqual(effectsInput,before,'rendering cannot modify the fitted equipment');
  return{sandbox,result,calls};
}

test('the actual special-view helper preserves battery, perception, fitted optics and HUSH without reviving an unavailable lamp',()=>{
  for(const battery of[0,.08,.3,1])for(const on of[false,true])for(const missing of[false,true])for(const flashlight of['reference','throw','flood'])for(const absorption of[0,.6])for(const effects of[false,true]){
    const{result,calls}=presentationHarness({battery,on,missing,flashlight,absorption,effects});
    assert.deepEqual(calls.map(call=>call.name),['battery','fitted optics','HUSH'],'state is composed in the same order as the real world');
    const base=calls[0].result,fitted=calls[1].result,args=calls[0].args[0];
    assert.equal(args.on,on&&!missing);assert.equal(args.battery,battery);assert.equal(args.perception,.4);assert.equal(args.reducedEffects,!effects);
    assert.equal(result.on,on&&!missing);assert.equal(result.look,calls[2].result);
    assert.equal(result.look.health,base.health);assert.equal(result.look.band,base.band);assert.equal(result.look.perception,base.perception);
    close(fitted.reach,base.reach*fieldKitEffects({flashlight}).flashlightReachScale);
    assert.ok(result.look.power<=fitted.power+1e-12,'a detached view cannot restore battery/perception/HUSH power');
    assert.ok(result.look.reach<=fitted.reach+1e-12,'HUSH cannot restore a shorter fitted low-battery throw');
    if(!on||missing||battery===0)assert.equal(result.look.power,0,'unavailable light remains zero in every special-view callback');
  }
  const before=presentationHarness({battery:.08,effects:false,timeSec:2}).result.look;
  const later=presentationHarness({battery:.08,effects:false,timeSec:9}).result.look;
  assert.equal(before.power,later.power,'effects off removes the actual special-view failing-battery flicker');
});

function rendererOptions(constructorName,scopeName,sandbox){
  const scope=main.indexOf(`function ${scopeName}(`),start=main.indexOf(`const renderer=${constructorName}(`,scope);
  assert.ok(scope>=0&&start>scope,`${scopeName} must construct its existing renderer`);
  const begin=start+'const renderer='.length,open=main.indexOf('(',begin);
  let depth=0,quote=null,end=-1;
  for(let i=open;i<main.length;i++){
    const c=main[i];
    if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='(')depth++;else if(c===')'&&--depth===0){end=i+1;break;}
  }
  assert.ok(end>open,`${constructorName} option expression must be balanced`);
  sandbox[constructorName]=options=>options;
  return vm.runInContext(main.slice(begin,end),sandbox);
}

test('coastal memory, false return and the existing rift study pass the live helper as their real getTorch callback',()=>{
  const{sandbox}=presentationHarness();
  Object.assign(sandbox,{shakeMode:()=> 'off',FP:{},PROPS:{renderInstances:()=>[]},sourceProps:[],layout:{},resolveLocalLights:()=>[],liveLightCircuits:()=>new Set()});
  for(const[constructorName,scopeName]of[['createCoastalMemoryRenderer','beginCoastalMemoryJourney'],['createSourceFalseReturnRenderer','beginSourceFalseReturn'],['createConservatoryRiftRenderer','stageConservatoryRiftStudy']]){
    const options=rendererOptions(constructorName,scopeName,sandbox);
    assert.equal(options.getTorch,sandbox.sourcePresentationTorch,`${scopeName} must read current instrument state when rendered`);
    const live=options.getTorch();assert.ok(live.look.health===1&&live.look.power<1&&live.look.perception===.4);
  }
});

test('all physical surface shaders consume the same optical kernel before acquisition',()=>{
  const shaders=P3.props3dDebugShaders();
  for(const [name,shader]of[['props',shaders.fragment],['physical Source glyphs',shaders.textFragment]]){
    assert.ok(shader.includes(TORCH_OPTICS_GLSL),`${name} embeds the actual shared kernel`);
    for(const fn of['torchAngular','torchFalloff','torchReceive'])assert.ok(shader.split(`${fn}(`).length>=3,`${name} consumes ${fn} beyond its definition`);
  }
  for(const file of['../src/render/r3d.js','../src/render/source-shore3d.js']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.ok(/\$\{TORCH_OPTICS_GLSL\}|\+\s*TORCH_OPTICS_GLSL\s*\+/.test(source),`${file} embeds the shared kernel`);
    for(const fn of['torchAngular','torchFalloff','torchReceive'])assert.ok(new RegExp(`\\b${fn}\\(`).test(source),`${file} consumes ${fn}`);
  }
});

// One in-memory triangle exercises the real pack parser and render entry
// points. The GL object records submissions; it never obtains a GPU context.
function trianglePack(){
  const bin=Buffer.alloc(80),positions=[-.5,0,0,.5,0,0,0,1,0],normals=[0,0,1,0,0,1,0,0,1];
  positions.forEach((n,i)=>bin.writeFloatLE(n,i*4));normals.forEach((n,i)=>bin.writeFloatLE(n,36+i*4));[0,1,2].forEach((n,i)=>bin.writeUInt16LE(n,72+i*2));
  const json={asset:{version:'2.0'},buffers:[{byteLength:80}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5123,count:3,type:'SCALAR'}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1],roughnessFactor:.8,metallicFactor:0}}],meshes:[{name:'flashlight_test_receiver',extras:{bounds:{min:[-.5,0,0],max:[.5,1,0]}},primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  const encoded=Buffer.from(JSON.stringify(json)),text=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(text);
  const out=Buffer.alloc(12+8+text.length+8+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);out.writeUInt32LE(bin.length,20+text.length);out.writeUInt32LE(0x004e4942,24+text.length);bin.copy(out,28+text.length);
  return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
function fakeGL(){
  let serial=1;const constants=new Map(),writes=[];
  const gl=new Proxy({}, {get(_target,name){
    if(name==='isContextLost')return()=>false;
    if(name==='getExtension')return()=>null;
    if(name==='getParameter')return()=>4096;
    if(['getShaderParameter','getProgramParameter','isProgram'].includes(name))return()=>true;
    if(name==='checkFramebufferStatus')return()=>gl.FRAMEBUFFER_COMPLETE;
    if(name==='getUniformLocation')return(program,key)=>({program:program.id,key});
    if(String(name).startsWith('uniform'))return(location,...args)=>writes.push({key:location.key,value:ArrayBuffer.isView(args.at(-1))?Array.from(args.at(-1)):args.length===1?args[0]:args});
    if(String(name).startsWith('create'))return()=>({id:serial++});
    if(/^[A-Z0-9_]+$/.test(name)){if(!constants.has(name))constants.set(name,serial++);return constants.get(name);}
    return()=>{};
  }});
  return{gl,writes,last:key=>writes.findLast(w=>w.key===key)?.value};
}
function transform(matrix,point){return[0,1,2,3].map(row=>matrix[row]*point[0]+matrix[row+4]*point[1]+matrix[row+8]*point[2]+matrix[row+12]);}
function assertCentralShadowRay(matrix,origin,forward){
  for(const distance of[1,9]){
    const projected=transform(matrix,origin.map((v,i)=>v+forward[i]*distance));
    close(projected[0]/projected[3],0);close(projected[1]/projected[3],0);
  }
}

test('real prop color, prepared shadows and automatic shadows share the carried lamp while keeping the view camera independent',async()=>{
  const h=fakeGL(),oldFetch=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>trianglePack()});
    P3.props3dInit(h.gl);P3.props3dResize(160,90,{shadowMapSize:512});await P3.addPropPack('flashlight-test-memory.glb');
    P3.setPropInstances([{id:'flashlight-test-receiver',mesh:'flashlight_test_receiver',x:0,y:0,z:-4}]);P3.setDynamicPropInstances([]);
    const args={camX:2,camY:1.62,camZ:3,yaw:.63,pitch:-.23,torchYawOffset:.19,light:.6,timeSec:10,reducedMotion:true,zoneTints:new Float32Array(21*3).fill(1),torch:{reach:2.875,coneInner:.62,coneOuter:.985,spill:0}};
    const frame=resolveTorchFrame({eye:[args.camX,args.camY,args.camZ],yaw:args.yaw,pitch:args.pitch,yawOffset:args.torchYawOffset}),optics=normalizeTorchOptics(args.torch);
    P3.preparePropShadowPass(args);const prepared=[...P3.propTargets().shadowMatrix];assertCentralShadowRay(prepared,frame.origin,frame.forward);
    P3.renderPropPass({...args,shadowPrepared:true});
    vectorClose(h.last('uEye'),[args.camX,args.camY,args.camZ]);
    vectorClose(h.last('uTorchOrigin'),frame.origin);vectorClose(h.last('uForward'),frame.forward);vectorClose(h.last('uTorchRight'),frame.right);vectorClose(h.last('uTorchUp'),frame.up);
    close(h.last('uTorchReach'),optics.reach);close(h.last('uTorchShoulder'),optics.shoulder);close(h.last('uLight'),args.light);
    const cameraView=h.last('uView');
    P3.renderPropPass(args);vectorClose([...P3.propTargets().shadowMatrix],prepared);
    P3.renderPropPass({...args,torchYawOffset:-.25});vectorClose(h.last('uView'),cameraView);
    assert.notDeepEqual(h.last('uForward'),frame.forward,'lamp drift does not secretly rotate the view');
    P3.renderPropPass({...args,torch:{reach:.275,coneInner:0,coneOuter:.1,spill:0,shoulder:0}});
    vectorClose(h.last('uTorchCone'),[0,.1]);close(h.last('uTorchReach'),.275);assert.equal(h.last('uTorchSpill'),0);assert.equal(h.last('uTorchShoulder'),0);
    P3.renderPropPass({...args,light:0});assert.equal(h.last('uLight'),0);assert.equal(P3.propTargets().shadowReady,false);
    const practical={x:-3,y:4,z:2,shadowYaw:-.7,shadowPitch:-.3};
    P3.preparePropShadowPass({...args,shadowLight:practical});
    assertCentralShadowRay([...P3.propTargets().shadowMatrix],[practical.x,practical.y,practical.z],[Math.sin(practical.shadowYaw)*Math.cos(practical.shadowPitch),Math.sin(practical.shadowPitch),-Math.cos(practical.shadowYaw)*Math.cos(practical.shadowPitch)]);
  }finally{
    globalThis.fetch=oldFetch;P3.setPropInstances([]);P3.setDynamicPropInstances([]);
  }
});

test('physical Source memory and its shore boundary retain the incoming lamp axis',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const start=source.indexOf('function drawTextSpace('),end=source.indexOf('\nfunction sourceRoomU(',start);
  const sandbox={sourceLook:{roomMemoryActive:true},drawSourceRoomMemory:(time,options)=>{sandbox.received=options;}};
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
  sandbox.drawTextSpace(null,10,{torchYawOffset:.27,torchPower:.31});
  assert.equal(sandbox.received.torchYawOffset,.27);assert.equal(sandbox.received.torchPower,.31);
  const memoryStart=source.indexOf('function drawSourceRoomMemory('),memoryEnd=source.indexOf('\n}',memoryStart)+2;
  const sentinel=new Error('captured the real shore submission');let captured;
  const memory={pressureSceneDepthReady:false,P3:{propTargets:()=>({})},SHORE:{sourceShoreBoundaryVisible:()=>true,sourceShoreDraw:options=>{captured=options;throw sentinel;}},sourceShoreState:{},camX:1,camY:2,camZ:3,CELL:.5,yaw:.4,planYaw:.1,pitch:-.2,uniforms:{sceneW:800,sceneH:600},captureExposureOverride:null,lightingCaptureExposure:1};
  vm.createContext(memory);vm.runInContext(source.slice(memoryStart,memoryEnd),memory);
  assert.throws(()=>memory.drawSourceRoomMemory(10,{torchYawOffset:.27,torchPower:.31}),error=>error===sentinel);
  assert.equal(captured.torch.yawOffset,.27);assert.equal(captured.torch.power,.31);
});
