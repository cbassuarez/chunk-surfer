// Production adapter checks with the actual source and controlled asset
// promises. These prove routing/order, not GPU appearance or human dread.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CELL} from '../src/data/floorplan/legend.js';
import {MOVE_MS} from '../src/config.js';
import {CHUNK_SURF_PHASE} from '../src/game/chunk-surf-state.js';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const main=read('src/main.js'),r3d=read('src/render/r3d.js'),props=read('src/render/props3d.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const json=value=>JSON.parse(JSON.stringify(value));

function actionHarness(){
 const pending=deferred(),calls=[],context={R3:{r3dBusBodyAssetsReady:()=>false,r3dPrepareBusBodyAssets:()=>pending.promise,r3dLookAngles:()=>({yaw:1.2})},
  syncSourceRender:()=>calls.push('render'),usingSourceSpace:()=>true,console:{warn:()=>{}},
  chunkSurfRuntime:{outskirtsPerformAction:action=>{calls.push(action);return{handled:true};}}};
 vm.createContext(context);
 vm.runInContext(main.slice(main.indexOf('let busBodyWarmPromise='),main.indexOf('function stopOutskirtsStreetAudio'))+
  '\nthis.busAdapter={warmBusBodyAssets,performBusBodyAction};',context);
 return{pending,calls,context,adapter:context.busAdapter};
}

test('the actual E adapter waits for installed geometry and rechecks the current world and look before acting',async()=>{
 const h=actionHarness(),action=h.adapter.performBusBodyAction('bus-woman-open');
 assert.deepEqual(h.calls,[],'E spends OPEN before its anatomy and corridor have installed');
 h.context.R3.r3dLookAngles=()=>({yaw:-.7});h.pending.resolve(true);
 assert.equal(await action,true);
 assert.deepEqual(json(h.calls),['render',{action:'bus-woman-open',pass:7,viewYaw:-.7},'render']);
 const left=actionHarness(),stale=left.adapter.performBusBodyAction('bus-woman-open');
 left.context.usingSourceSpace=()=>false;left.pending.resolve(true);
 assert.equal(await stale,false);assert.ok(left.calls.every(call=>call==='render'),'an old asynchronous E acts after leaving Source');
 const failed=actionHarness(),blocked=failed.adapter.performBusBodyAction('bus-woman-open');failed.pending.reject(Error('missing pack'));
 assert.equal(await blocked,false);assert.deepEqual(failed.calls,[],'a failed pack spends the opening action');
});

function loaderHarness({failOnce=null}={}){
 const catalog=new Set(),characterCatalog=new Set(),calls=[],base=deferred();let fail=failOnce;
 const context={basePropPackLoad:{},assetUrl:url=>url,Error,Promise,Set,
  r3dBasePropsReady:()=>base.promise,P3:{characterStats:()=>({meshes:[...characterCatalog]}),propMeshCatalog:()=>[...catalog],
   addCharacterPack:async url=>install('character',url),addPropPack:async url=>install('prop',url)}};
 const install=(kind,url)=>{
  calls.push([kind,url]);if(fail===url){fail=null;throw Error('interrupted upload');}
  const bytes=fs.readFileSync(new URL('../public/'+url,import.meta.url)),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
  for(const mesh of gltf.meshes)(kind==='character'?characterCatalog:catalog).add(mesh.name);
 };
 vm.createContext(context);
 vm.runInContext(r3d.slice(r3d.indexOf('const busBodyPacks='),r3d.indexOf('// Borrowed Ellery scenes')).replaceAll('export function ','function ')+
  '\nthis.busLoader={r3dPrepareBusBodyAssets,r3dBusBodyAssetsReady,r3dBusBodyAssetStatus};',context);
 return{base,calls,context,adapter:context.busLoader};
}

test('the actual loader waits for the base catalog, uses the character path for rigs, and coalesces concurrent preparation',async()=>{
 const h=loaderHarness(),a=h.adapter.r3dPrepareBusBodyAssets(),b=h.adapter.r3dPrepareBusBodyAssets();assert.equal(a,b);
 assert.equal(h.adapter.r3dBusBodyAssetsReady(),false);assert.deepEqual(h.calls,[],'extension pack races the base catalog reset');
 h.base.resolve(true);assert.equal(await a,true);assert.equal(h.adapter.r3dBusBodyAssetsReady(),true);
 assert.deepEqual(h.calls,[['character','assets/bus-body-passage.glb'],['character','assets/bus-body-throat.glb'],['character','assets/source-drive/geometry/wheel-hands.glb'],
  ['character','assets/source-drive/cut/cut-living.glb'],['character','assets/source-drive/cut/cut-landscape.glb'],['prop','assets/source-drive/cut/cut-roadside.glb']]);
 const before=h.calls.length;await h.adapter.r3dPrepareBusBodyAssets();assert.equal(h.calls.length,before,'ready assets are installed again');
});

test('an interrupted extension load remains unready and can complete a later explicit retry',async()=>{
 const h=loaderHarness({failOnce:'assets/source-drive/cut/cut-landscape.glb'});h.base.resolve(true);
 await assert.rejects(h.adapter.r3dPrepareBusBodyAssets(),/interrupted upload/);
 assert.equal(h.adapter.r3dBusBodyAssetsReady(),false);assert.match(h.adapter.r3dBusBodyAssetStatus().stage,/^failed:/);
 assert.equal(await h.adapter.r3dPrepareBusBodyAssets(),true);assert.equal(h.adapter.r3dBusBodyAssetStatus().stage,'ready');
});

test('the complete production movement interval gives the coach and living footing a physical pace while retaining quiet/injury costs',()=>{
 let place='outside',quiet=1,pressureCalls=0;
 const pressure=1.5020966498722041,context={MOVE_MS,CELL,CHUNK_SURF_PHASE,performance:{now:()=>1000},
  usingStairAnomaly:()=>false,isIntroActive:()=>false,usingSourceSpace:()=>true,storyMoveScale:()=>quiet,
  outskirtsStepIndex:0,outskirtsLosing:()=>.212,storyMode:true,PLANT:{heavyWrenchDragging:()=>false},
  worldBoundaryFriction:0,WORLD_BOUNDARY_FRICTION:{maxMult:2},shakeMode:()=> 'full',SCALED_MOVE_MIN:n=>Math.max(1,Math.round(n/2)),
  clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),chunkSurfRuntime:{lastReceptionFrame:()=>null,towerLandFrame:()=>null,
   busInteriorFrame:()=>place==='organ'?{active:true}:null,
   outskirtsBusPassageFrame:()=>({inside:place==='bus',transit:{entered:true,exited:false}}),
   pressureFrame:()=>{pressureCalls++;return{phase:CHUNK_SURF_PHASE.HORIZON,movementMultiplier:pressure};}}};
 vm.createContext(context);
 vm.runInContext(main.slice(main.indexOf('function currentMoveIntervalMs()'),main.indexOf('function currentTurnIntervalMs('))+
  '\nthis.interval=currentMoveIntervalMs;',context);
 const before=context.interval();assert.equal(before,Math.round(MOVE_MS*pressure),'the adjacent Source route changes speed');
 place='bus';pressureCalls=0;assert.equal(context.interval(),Math.round(1000*CELL/2.1));assert.equal(pressureCalls,0);
 place='organ';assert.equal(context.interval(),Math.round(1000*CELL/1.35));assert.equal(pressureCalls,0);
 for(const destination of['bus','organ']){
  place=destination;quiet=1.9;context.outskirtsStepIndex=1;context.worldBoundaryFriction=.25;
  const expected=Math.round((1000*CELL/(destination==='bus'?2.1:1.35))*quiet*(1+.22*.212)*(1+.25));
  assert.equal(context.interval(),expected,'the physical pace replaces carried quiet or weak-leg friction');
 }
 place='outside';quiet=1;context.outskirtsStepIndex=0;context.worldBoundaryFriction=0;
 assert.equal(context.interval(),before,'leaving the bus keeps its local slow pace');
});

test('cold restored movement, body material response, and the final pixel-mesh/post route stay attached to the production world',()=>{
 const guard=main.slice(main.indexOf('function step(dx,dy)'),main.indexOf('function step(dx,dy)')+600);
 assert.match(guard,/busInteriorFrame[\s\S]*bodyOpening\?\.active[\s\S]*!R3\.r3dBusBodyAssetsReady[\s\S]*warmBusBodyAssets\(\);return/);
 assert.match(main,/if\(\[5,6,7\]\.includes\(chunkSurfRuntime\?\.outskirtsPassAt\?\.\(\)\)\)void warmBusBodyAssets\(\)/,'normal approach no longer warms the corridor before E');
 assert.match(main,/chunkSurfRuntime\.onStep\(stepFrom,/,'redirected movement lost its actual pre-portal origin');
 assert.match(main,/sourceStep\?\.event\?\.startsWith\('bus-body-'\)[\s\S]{0,200}renderMove=null;motionRig=null;trail=\[\]/,'the camera spring crosses the 4km pocket separation');
 const physical=r3d.slice(r3d.indexOf('function drawSourceVoidPhysical('),r3d.indexOf('function drawTextSpace('));
 assert.match(physical,/physicalStudyMaterials:coastal\.active\|\|!!sourceBusInterior\?\.active,sourceBodyTissue:!!sourceBusInterior\?\.active\|\|!!sourceBusLighting\?\.origin/);
 assert.match(props,/uTissueSurface'\),p\.tissueSurface\?\.preservePigment\|\|\(sourceBodyTissue&&p\.cutTissue\)\?1:0,p\.tissueSurface\?\.localSpecular\|\|\(sourceBodyTissue&&p\.cutTissue\)\?1:0/);
 assert.match(physical,/P3\.renderPropPass\(/);
 assert.match(physical,/targets\.depth/,'body depth is dropped before composition');
 assert.match(physical,/if\(present\)presentThroughPost\(runPixelMeshPass\(voidState,now,\{physicalAcquisitionWeight\}\),\{torchPower,sourceTorchMode\}\)/,'physical bus bypasses final dither/post');
 assert.ok(physical.indexOf('P3.renderPropPass(')<physical.indexOf('presentThroughPost(runPixelMeshPass('));
});
