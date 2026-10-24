import test from 'node:test';
import assert from 'node:assert/strict';
import * as R3 from '../src/render/r3d.js';
import {createConservatoryRiftRenderer} from '../src/render/conservatory-rift-renderer.js';
import {createSourceFalseReturnRenderer} from '../src/render/source-false-return-renderer.js';
import {doorAssembly} from '../src/data/source-door-fields.js';
import {MAIN_STAIR_WALL_PACK} from '../src/data/main-stair-wall-dressing.js';

for(const [name,make]of [['rift',createConservatoryRiftRenderer],['false return',createSourceFalseReturnRenderer]]){
 for(const unavailable of [false,true])test(`a cold copied ${name} ${unavailable?'retains masonry if the optional ornament is unavailable':'loads its retained stair ornament before acquiring the shared renderer'}`,async()=>{
  const calls=[],catalog=new Set(['school_desk','loose_pages','loose_note','calibration_pin','chair','open_score']);
  const props={propMeshCatalog:()=>[...catalog],setPressureInstances:()=>{},addPropPack:async url=>{calls.push(['pack',url]);assert.equal(url,MAIN_STAIR_WALL_PACK);if(unavailable)throw Error('optional pack unavailable');catalog.add('main_stair_wall_treatment');}};
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push([k,...args]);return k==='r3dFrame'?true:undefined;}]));
  renderer.r3dBasePropsReady=async()=>true;
  const rgba=new Uint8Array(16*16*4);for(let n=0;n<16*16;n++)rgba.set([64,160,0,1],n*4);
  const kit=doorAssembly('practice-acoustic-single');
  const door={id:'test-door',x:0,z:0,feet:0,width:1,halfWidth:.5,yaw:0,normal:{x:0,z:1},archetype:kit.archetype,frameMesh:kit.frameMesh,headMesh:kit.headMesh,mesh:kit.leafMesh,leafCount:kit.leafCount,activeLeaves:[0],aperture:kit.aperture,leaf:kit.leaf};
  for(const m of [door.frameMesh,door.headMesh,door.mesh])if(m)catalog.add(m);
  const layout={plan:{w:16,h:16,rgba,material:new Uint8Array(256),originX:0,originY:0},
   props:[{id:'main-stair-retained-wall-ornament',mesh:'main_stair_wall_treatment',x:63,y:0,z:36}],doors:[door],lights:[],
   spawn:{x:1,z:1,feet:0,yaw:0,pitch:0},bounds:{minX:0,maxX:8,minZ:0,maxZ:8}};
  const owner=make({layout,renderer,props,propRenderer:props,resolveAsset:p=>p});assert.equal(await owner.initialize(),true);
  assert.deepEqual(calls.filter(x=>x[0]==='pack'),[['pack',MAIN_STAIR_WALL_PACK]]);assert.equal(owner.ready(),true);assert.equal(catalog.has('main_stair_wall_treatment'),!unavailable);
  assert.ok(calls.findIndex(x=>x[0]==='pack')<calls.findIndex(x=>x[0]==='r3dSetProps'));
  owner.dispose();
 });
}
