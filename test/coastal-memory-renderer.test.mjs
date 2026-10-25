import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coastalMemoryRenderFrame,createCoastalMemoryRenderer} from '../src/render/coastal-memory-renderer.js';
import {COASTAL_MEMORY_LAYOUT as L,COASTAL_SETTLED_BODY_WORLD,coastalWorldPoint} from '../src/data/coastal-memory.js';
import {createPropRangeController} from '../src/render/prop-range.js';
const metrics=JSON.parse(fs.readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
test('on-foot camera and actual wreck share the opening site frame without moving Source',()=>{
 const state={pose:{...L.spawn,yaw:.7,pitch:-.2},elapsed:8,wreckLightLevel:.5};
 const before=structuredClone(state),f=coastalMemoryRenderFrame(state,{vehicleMetrics:metrics});
 assert.deepEqual(state,before);assert.deepEqual(f.eye,coastalWorldPoint([L.spawn.x,L.spawn.feet+1.62,L.spawn.z]));
 assert.deepEqual(f.scene.props.find(p=>p.id==='coastal-sunken-same-van').matrix,COASTAL_SETTLED_BODY_WORLD);
 assert.equal(f.scene.props.filter(p=>p.id.startsWith('coastal-sunken-tyre')).length,4);
 assert.equal(f.coastalMemory.lights.length,2);assert.equal(f.coastalMemory.lights[0].intensity,2.5);
 assert.equal(f.scene.props.find(p=>p.id==='coastal-sunken-same-van').fixturePower,.5,'actual bulb emission follows the same switch as the two real lamps');
 assert.equal(f.coastalMemory.flood,0);assert.ok(!f.scene.props.some(p=>/sea.surface|opaque.water/.test(p.mesh)));
});
test('unnoticed headlights remain dark; reduced motion freezes sea without freezing walking',()=>{
 const a=coastalMemoryRenderFrame({pose:L.spawn,elapsed:17},{reducedMotion:true,vehicleMetrics:metrics});
 assert.equal(a.coastalMemory.time,0);assert.ok(a.coastalMemory.lights.every(l=>l.intensity===0));
 assert.ok(a.scene.lamps.filter(l=>l.fixture==='same van headlamp').every(l=>l.intensity===0));
 assert.ok(a.scene.lamps.filter(l=>l.fixture==='same van headlamp').every(l=>!l.castsShadow),'unpowered lamps cannot take the player torch shadow map');
 assert.equal(a.scene.props.find(p=>p.id==='coastal-sunken-same-van').fixturePower,0,'headlamp glass cannot emit before the glance wakes its supply');
 const b=coastalMemoryRenderFrame({pose:{...L.spawn,x:L.spawn.x+1},elapsed:18},{reducedMotion:true,vehicleMetrics:metrics});assert.notDeepEqual(a.eye,b.eye);
});
test('the visible practical owns the single shadow map at the wreck and pier, including a retreat',()=>{
 const render=pose=>coastalMemoryRenderFrame({pose,elapsed:12,wreckLightLevel:1},{vehicleMetrics:metrics});
 const entry=render(L.spawn),pier=render({...L.spawn,x:13.07639,z:86}),retreat=render(L.spawn);
 assert.equal(entry.scene.lamps.find(l=>l.castsShadow)?.id,'coastal-sunken-headlamp-0');
 const practical=pier.scene.lamps.find(l=>l.castsShadow);
 assert.equal(practical?.id,'coastal-pier-near-marker');
 assert.ok(Number.isFinite(practical.shadowYaw)&&Number.isFinite(practical.shadowPitch)&&practical.shadowPitch<0,'pier shadows must face down from the real fitting toward its structure');
 assert.equal(pier.scene.lamps.filter(l=>l.castsShadow).length,1);
 assert.equal(retreat.scene.lamps.find(l=>l.castsShadow)?.id,'coastal-sunken-headlamp-0');
 assert.deepEqual(entry.coastalMemory.lights,pier.coastalMemory.lights,'shadow allocation cannot change the actual headlamp supply or water volume');
});
function fixture(){
 const calls=[],catalog=new Set(),renderer=new Proxy({r3dBasePropsReady:async()=>true,r3dPresentationReady:()=>true,r3dFrame:v=>{calls.push(['frame',v]);return true;}},{get(o,k){return o[k]||((...a)=>calls.push([k,...a]));}});
 let release=0;const ranges=createPropRangeController(),props={propMeshCatalog:()=>[...catalog],async addPropPack(path){calls.push(['pack',path]);const b=fs.readFileSync(new URL('../public/'+path,import.meta.url)),json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));for(const mesh of json.meshes)catalog.add(mesh.name);},installAuthoredPropMeshes:()=>true,setAuthoredPropRange:(owner,far)=>{const lease=ranges.acquire(owner,far);calls.push(['range',owner,far]);return()=>{release++;lease();};},setDriveStudyFrame:()=>{},setPressureInstances:()=>{}};
 const options={renderer,props,fetcher:async()=>({ok:true,json:async()=>metrics}),resolveAsset:x=>x,ensureFonts:async()=>true,installInk:()=>true};
 const owner=createCoastalMemoryRenderer(options);
 return{owner,options,calls,catalog,releases:()=>release};
}
test('borrowed renderer obtains distant physical props and submits real depth acquisition, then releases range',async()=>{
 const f=fixture();assert.equal(await f.owner.initialize(),true);assert.equal(f.owner.render({pose:L.spawn,elapsed:1}),true);
 assert.ok(f.calls.some(c=>c[0]==='range'&&c[2]===320));const frame=f.calls.find(c=>c[0]==='frame')[1];
 assert.equal(frame.sourceVoidPhysical,true);assert.equal(frame.coastalMemory.active,true);assert.deepEqual(frame.authoredCamera.eye,coastalWorldPoint([L.spawn.x,L.spawn.feet+1.62,L.spawn.z]));
 assert.equal(frame.driveStudy,undefined);assert.equal(f.owner.dispose(),true);assert.equal(f.owner.dispose(),false);assert.equal(f.releases(),1);
});
test('catalog replacement fails visibly instead of continuing over a missing bank',async()=>{
 const f=fixture();await f.owner.initialize();f.catalog.delete('cm_grass_bank');assert.throws(()=>f.owner.render({pose:L.spawn}),/catalog/);f.owner.dispose();
});
test('a second coastal visit reuses the actual resident van and mechanism packs',async()=>{
 const f=fixture();await f.owner.initialize();assert.equal(f.calls.filter(c=>c[0]==='pack').length,2);f.owner.dispose();
 const second=createCoastalMemoryRenderer(f.options);await second.initialize();assert.equal(f.calls.filter(c=>c[0]==='pack').length,2,'retreat/re-entry must not allocate both GLB packs again');
 assert.ok(second.ready());second.dispose();assert.equal(f.releases(),2);
});
