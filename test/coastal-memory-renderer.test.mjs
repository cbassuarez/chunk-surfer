import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coastalMemoryRenderFrame,createCoastalMemoryRenderer} from '../src/render/coastal-memory-renderer.js';
import {COASTAL_MEMORY_LAYOUT as L,COASTAL_SETTLED_BODY_WORLD,coastalWorldPoint,coastalMultiply} from '../src/data/coastal-memory.js';
import {vanWreckFoldMatrix} from '../src/data/van-wreck.js';
import {createPropRangeController} from '../src/render/prop-range.js';
const metrics=JSON.parse(fs.readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
test('taking the recovered gift removes the exact box and key while leaving its plinth and note',()=>{
 const frame=coastalMemoryRenderFrame({pose:L.spawn,elapsed:10,boxTaken:true},{vehicleMetrics:metrics});
 assert.ok(!frame.scene.props.some(p=>['coastal-broken-music-box','coastal-music-box-key'].includes(p.id)));
 assert.ok(frame.scene.props.some(p=>p.id==='coastal-music-box-plinth'));
 assert.ok(frame.scene.props.some(p=>p.id==='coastal-damp-note'));
});
test('on-foot camera and actual wreck share the opening site frame without moving Source',()=>{
 const state={pose:{...L.spawn,yaw:.7,pitch:-.2},elapsed:8,wreckLightLevel:.5};
 const before=structuredClone(state),f=coastalMemoryRenderFrame(state,{vehicleMetrics:metrics});
 assert.deepEqual(state,before);assert.deepEqual(f.eye,coastalWorldPoint([L.spawn.x,L.spawn.feet+1.62,L.spawn.z]));
 assert.deepEqual(f.scene.props.find(p=>p.id==='coastal-sunken-same-van').matrix,COASTAL_SETTLED_BODY_WORLD);
 assert.equal(f.scene.props.filter(p=>p.id.startsWith('coastal-sunken-tyre')).length,2,'only the rear wheels stayed on');
 assert.equal(f.coastalMemory.lights.length,1,'one headlamp survived the crush');assert.equal(f.coastalMemory.lights[0].intensity,2.5);
 assert.equal(f.scene.props.find(p=>p.id==='coastal-sunken-same-van').fixturePower,.5,'actual bulb emission follows the same switch as the surviving lamp');
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
test('the opening wreck and its separated rear leaves carry their own solid paint in the exact panel frames',()=>{
 for(const level of[0,.5,1]){
  const frame={pose:L.spawn,elapsed:12,wreckLightLevel:level},before=structuredClone(frame);
  const out=coastalMemoryRenderFrame(frame,{vehicleMetrics:metrics}),body=out.scene.props.find(p=>p.id==='coastal-sunken-same-van');
  const marks=out.scene.props.filter(p=>p.paintOf);assert.equal(marks.length,3);
  for(const paint of marks){const parent=out.scene.props.find(p=>p.id===paint.paintOf);assert(parent);assert.deepEqual(paint.matrix,parent.matrix);}
  const mark=marks.find(p=>p.paintOf===body.id);assert.equal(mark.paintOf,body.id);assert.equal(mark.mesh,'van_wreck_brand');
  // The lettering is bent into the wreck with its panels, so it shares the hull's frame.
  assert.deepEqual(mark.matrix,COASTAL_SETTLED_BODY_WORLD);assert.deepEqual(mark.matrix,body.matrix);assert.notEqual(mark.matrix,body.matrix);
  assert.equal(mark.sourceStructure,'coastal-memory');assert.equal(mark.skyExposed,false);assert.equal(mark.fixturePower,level);
  assert.equal(mark.emissive,undefined);assert.equal(mark.cabinVolume,undefined);assert.equal(mark.character,undefined);
  assert.equal(out.scene.lamps.filter(l=>l.fixture==='same van headlamp').length,1,'pigment adds no practical or headlamp');
  assert.deepEqual(frame,before);assert.equal(out.coastalMemory.active,true);assert.equal(out.coastalMemory.waterY,0);
 }
});
test('the visible practical owns the single shadow map at the wreck and pier, including a retreat',()=>{
 const render=pose=>coastalMemoryRenderFrame({pose,elapsed:12,wreckLightLevel:1},{vehicleMetrics:metrics});
 const entry=render(L.spawn),pier=render({...L.spawn,x:13.07639,z:86}),retreat=render(L.spawn);
 assert.equal(entry.scene.lamps.find(l=>l.castsShadow)?.id,'coastal-sunken-headlamp-1');
 const practical=pier.scene.lamps.find(l=>l.castsShadow);
 assert.equal(practical?.id,'coastal-pier-near-marker');
 assert.ok(Number.isFinite(practical.shadowYaw)&&Number.isFinite(practical.shadowPitch)&&practical.shadowPitch<0,'pier shadows must face down from the real fitting toward its structure');
 assert.equal(pier.scene.lamps.filter(l=>l.castsShadow).length,1);
 assert.equal(retreat.scene.lamps.find(l=>l.castsShadow)?.id,'coastal-sunken-headlamp-1');
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
 const f=fixture();await f.owner.initialize();assert.equal(f.calls.filter(c=>c[0]==='pack').length,4);assert(f.catalog.has('van_brand_drive'));assert(f.catalog.has('van_wreck_hull'));f.owner.dispose();
 const second=createCoastalMemoryRenderer(f.options);await second.initialize();assert.equal(f.calls.filter(c=>c[0]==='pack').length,4,'retreat/re-entry must not allocate the vehicle, wreck, coast or pigment packs again');
 assert.ok(second.ready());second.dispose();assert.equal(f.releases(),2);
});
test('coastal paint loads in an isolated catalog, reuses global residency and detects a replaced pigment mesh',async()=>{
 const cold=fixture();await cold.owner.initialize();assert(cold.calls.some(c=>c[0]==='pack'&&c[1]==='assets/van-brand.glb'));
 cold.catalog.delete('van_brand_drive');assert.equal(cold.owner.ready(),false);assert.throws(()=>cold.owner.render({pose:L.spawn}),/catalog/);cold.owner.dispose();
 const resident=fixture();resident.catalog.add('van_brand_drive');await resident.owner.initialize();
 assert.equal(resident.calls.some(c=>c[0]==='pack'&&c[1]==='assets/van-brand.glb'),false,'the ordinary game already owns this exact mesh');
 assert.equal(resident.owner.render({pose:L.spawn}),true);const submitted=resident.calls.find(c=>c[0]==='r3dSetProps'&&c[1].some(p=>p.paintOf));
 assert(submitted);assert.deepEqual(submitted[1].find(p=>p.paintOf).matrix,COASTAL_SETTLED_BODY_WORLD);resident.owner.dispose();
});
