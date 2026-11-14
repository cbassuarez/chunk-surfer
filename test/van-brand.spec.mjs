import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { vanBrandInstances } from '../src/render/van-brand.js';
import { VAN_BRAND_COPY, VAN_BRAND_FITS, VAN_BRAND_PAINT } from '../src/data/van-brand.js';
import { VAN_BRAND_ART, VAN_BRAND_FLAG, VAN_BRAND_PIGMENTS } from '../src/data/van-brand-art.js';
import {sourceRestVehicleImage} from '../src/game/source-rest-memories.js';
import {sourceShoreGeometry} from '../src/render/source-shore3d.js';
import {sourceShoreBounds} from '../src/data/source-hanging-shore.js';
import { printedSurfaceDescriptor } from '../src/render/printed-surface.js';
import { letteringFinishDescriptor, propMaterialFactors } from '../src/render/prop-material-contract.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { makeDriveScene } from '../src/game/source-drive/scene.js';
import { freshSourceDriveCheckpoint } from '../src/game/source-drive-session.js';

const sha = b => createHash('sha256').update(b).digest('hex');
test('only submitted, real vehicle hosts receive owner paint, with no interaction or light authority', () => {
  const matrix = new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, -1.4, 0, 8, 4, 20, 1]);
  const parent = Object.freeze({ id: 'folded:van', mesh: 'yard_van', matrix, zone: 9, sourceStructure: 'outskirts',
    outskirtsFoldVisibility: .37, reflectionOnly: true, portalClipPlanes: [[1, 2, 3, 4]], action: 'not-inherited',
    blocks: true, character: { clip: 'not-inherited' }, emissive: [1, .8, .4, 5], cabinVolume: { min: [0, 0, 0] } });
  const before = Array.from(matrix), [mark] = vanBrandInstances([parent]);
  assert.equal(mark.mesh, 'van_brand_yard'); assert.equal(mark.paintOf, parent.id);
  assert.deepEqual(Array.from(mark.matrix), before); assert.notEqual(mark.matrix, matrix);
  for (const key of ['zone', 'sourceStructure', 'outskirtsFoldVisibility', 'reflectionOnly']) assert.equal(mark[key], parent[key]);
  assert.deepEqual(mark.portalClipPlanes, parent.portalClipPlanes); assert.notEqual(mark.portalClipPlanes, parent.portalClipPlanes);
  for (const key of ['action', 'blocks', 'character', 'emissive', 'cabinVolume']) assert.equal(mark[key], undefined);
  assert.equal(mark.structural, false); assert.equal(mark.noShadow, true);
  mark.matrix[12] = 999; assert.deepEqual(Array.from(matrix), before);
  assert.deepEqual(vanBrandInstances([{ ...parent, hidden: true }, { ...parent, visible: false },
    { ...parent, mesh: 'outskirts_car' }, { ...parent, mesh: 'wrecked-car' }]), []);
});

test('both driving names use one physical fit and preserve ordinary pose/nonuniform scale', () => {
  const parents = ['opening_drive_vehicle_body', 'drive_vehicle_body'].map((mesh, i) => ({ id: `body:${i}`, mesh,
    x: 20, y: .2, z: 42, yaw: 1.6, scale: .8, scaleX: -1, scaleY: 1.1, scaleZ: .9, skyExposed: true }));
  const marks = vanBrandInstances(parents); assert.equal(marks.length, 2);
  for (let i = 0; i < 2; i++) { assert.equal(marks[i].mesh, 'van_brand_drive'); for (const key of ['x', 'y', 'z', 'yaw', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skyExposed']) assert.equal(marks[i][key], parents[i][key]); }
  assert.equal(vanBrandInstances([...parents, ...marks]).length, 0, 'already branded lists do not gain duplicates');
  assert.equal(vanBrandInstances([parents[0], parents[0]]).length, 1);
  assert.deepEqual(vanBrandInstances([{ mesh: 'yard_van', matrix: [1] }, { mesh: 'yard_van', x: NaN, z: 0 }]), []);
});

test('actual Source street and drive lists submit paint from their own visible body matrices', async () => {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength + Math.round(200 / CELL), { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state }); runtime.setPlayerPosition(built.position);
  const list = runtime.propInstances(built.position.x, built.position.y, { time: 0 });
  const vans = list.filter(p => p.mesh === 'yard_van'); assert(vans.length > 0);
  for (const van of vans) {
    const mark = list.find(p => p.paintOf === van.id && p.mesh === 'van_brand_yard'); assert(mark, van.id);
    assert.deepEqual(mark.matrix, van.matrix); assert.equal(mark.outskirtsFoldVisibility, van.outskirtsFoldVisibility);
    assert.equal(mark.sourceStructure, van.sourceStructure);
  }
  for(const leaf of list.filter(p=>/^yard_van_door_[lr]$/.test(p.mesh))){const mark=list.find(p=>p.paintOf===leaf.id);assert(mark,`Source leaf ${leaf.id}`);assert.deepEqual(mark.matrix,leaf.matrix);}
  assert(vans.some(p => p.outskirtsFoldVisibility != null), 'the actual folded return is included');
  const metrics = JSON.parse(await readFile(new URL('../public/assets/source-drive/geometry/metrics.json', import.meta.url), 'utf8'));
  const state = freshSourceDriveCheckpoint({ returnPose: { x: 0, y: 0, facing: 0, yaw: 0, pitch: 0, floorH: 0 }, runId: 'van-brand-test' }).drive;
  const scene = makeDriveScene(state, metrics, { showHands: false }), host = scene.props.find(p => p.mesh === 'drive_vehicle_body');
  const mark = scene.props.find(p => p.mesh === 'van_brand_drive'); assert(host && mark); assert.deepEqual(mark.matrix, host.matrix);
  assert.equal(mark.cabinVolume, undefined); assert.equal(mark.emissive, undefined);
});

const area = ring => Math.abs(ring.reduce((s, a, i) => { const b = ring[(i + 1) % ring.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, k) => v - b[k]);
test('actual add-on contains only opaque solid original pigment, with preserved contour holes and physical normals', async () => {
  const bytes = await readFile(new URL('../public/assets/van-brand.glb', import.meta.url)), doc = await new NodeIO().readBinary(bytes);
  const stats = JSON.parse(await readFile(new URL('../public/assets/van-brand.stats.json', import.meta.url), 'utf8'));
  assert.equal(stats.sha256, sha(bytes)); assert.equal(stats.copy, VAN_BRAND_COPY);
  assert.deepEqual(doc.getRoot().listMeshes().map(m => m.getName()).sort(), Object.values(VAN_BRAND_FITS).map(f=>f.mesh).sort());
  assert.equal(doc.getRoot().listTextures().length, 0); assert.equal(doc.getRoot().listAnimations().length, 0); assert.equal(doc.getRoot().listSkins().length, 0);
  for (const material of doc.getRoot().listMaterials()) {
    assert.equal(material.getAlphaMode(), 'OPAQUE'); assert.deepEqual(material.getEmissiveFactor(), [0, 0, 0]);
    assert.equal(material.getBaseColorTexture(), null); assert.equal(material.getMetallicFactor(), 0);
    const extra = material.getExtras(); assert.equal(extra.materialFactors, 'gltf');
    assert.equal(printedSurfaceDescriptor(extra.printedSurface, { hasTexture: false }).coverage, 'solid');
    assert.equal(letteringFinishDescriptor(extra.letteringFinish).localSpecular, true);
    assert.equal(propMaterialFactors({ roughness: material.getRoughnessFactor(), metallic: 0, semantics: extra.materialFactors }).legacyUnmapped, false);
  }
  for (const fit of Object.values(VAN_BRAND_FITS)) {
    const mesh = doc.getRoot().listMeshes().find(m => m.getName() === fit.mesh), areas = new Map();
    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), indices = primitive.getIndices().getArray();
      const pigment = primitive.getMaterial().getName().replace('owner paint / ', ''); let frontArea = 0;
      for (let i = 0; i < pos.getCount(); i++) {
        const p = pos.getElement(i, []), n = normals.getElement(i, []);
        assert(p.every(Number.isFinite)); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5);
        assert(fit.surfaces.some(s=>{
          const depth=s.kind==='side'?Math.abs(p[0])-s.surfaceX:(p[2]-s.surfaceZ)*s.normal;
          const across=s.kind==='side'?p[2]-s.centerZ:p[0]-s.centerX;
          return depth>.0022&&depth<.0032&&Math.abs(p[1]-s.centerY)<=s.heightM/2+1e-5&&Math.abs(across)<=s.widthM/2+1e-5;
        }), `${fit.mesh}: pigment must be on a real side or rear skin`);
      }
      for (let i = 0; i < indices.length; i += 3) {
        const a = pos.getElement(indices[i], []), b = pos.getElement(indices[i + 1], []), c = pos.getElement(indices[i + 2], []);
        const normal = normals.getElement(indices[i], []), n = cross(sub(b, a), sub(c, a));
        assert(n.every(Number.isFinite)); assert.ok(n.reduce((s, v, k) => s + v * normal[k], 0) >= -1e-12, 'all cap/edge winding agrees with geometric normals');
        if(fit.surfaces.some(s=>s.kind==='side'?normal[0]*Math.sign(a[0])>.999&&Math.abs(Math.abs(a[0])-s.surfaceX)<.0032:normal[2]*s.normal>.999&&Math.abs(a[2]-s.surfaceZ)<.0032))frontArea+=Math.hypot(...n)/2;
      }
      areas.set(pigment, frontArea);
    }
    for (const [pigment, actual] of areas) {
      const original = VAN_BRAND_ART.filter(a => a.pigment === pigment).reduce((s, a) => s + area(a.outer) - (a.holes || []).reduce((s, h) => s + area(h), 0), 0);
      const expected = original * fit.surfaces.reduce((sum,s)=>sum+s.widthM/1800*s.heightM/540*s.copies,0);
      assert.ok(Math.abs(actual - expected) < Math.max(1e-6, expected * .0001), `${fit.mesh}/${pigment}: contour hole or polygon fill changed`);
    }
    assert.equal(mesh.getExtras().pigmentThicknessM, VAN_BRAND_PAINT.thicknessM);
  }
});

const inside=(point,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
test('the company name and red/white/navy Union Flag are original physical artwork with counterchanged saltire',()=>{
 assert.equal(VAN_BRAND_COPY,'ALBION LOCATION SOUND');
 assert.deepEqual(Object.keys(VAN_BRAND_PIGMENTS).sort(),['navy','red','white']);
 assert.equal(VAN_BRAND_FLAG.width/VAN_BRAND_FLAG.height,5/3);
 assert.deepEqual(VAN_BRAND_ART.filter(a=>a.id.startsWith('name-')).map(a=>a.id.slice(5)),[...'ALBION']);
 const sample=(x,y)=>{const p=[VAN_BRAND_FLAG.x+x*9.6,VAN_BRAND_FLAG.y+y*9.6];return [...VAN_BRAND_ART].sort((a,b)=>a.layer-b.layer).filter(a=>inside(p,a.outer)&&!(a.holes||[]).some(h=>inside(p,h))).at(-1)?.pigment;};
 assert.equal(sample(25,15),'red');assert.equal(sample(20.5,3),'white');assert.equal(sample(10,2),'navy');
 const norm=[-15/Math.hypot(25,15),25/Math.hypot(25,15)];
 assert.equal(sample(10+norm[0],6+norm[1]),'red');
 assert.equal(sample(10-norm[0]*2,6-norm[1]*2),'white','broad white edge above the hoist diagonal');
 assert.equal(sample(40-norm[0],24-norm[1]),'red','fly saltire is offset the other way');
 assert.equal(sample(40+norm[0]*2,24+norm[1]*2),'white');
});

test('rear leaf paint follows opening, reflected and Source-transformed doors, with no static cross-door card',()=>{
 for(const [mesh,paint,yaw]of [['yard_van_door_l','van_brand_yard_rear_l',-1.72],['yard_van_door_r','van_brand_yard_rear_r',Math.PI+1.72]]){
  const host={id:mesh,mesh,x:1,y:.64,z:2.34,yaw,reflectionOnly:true},[mark]=vanBrandInstances([host]);
  assert.equal(mark.mesh,paint);assert.equal(mark.yaw,yaw);assert.equal(mark.reflectionOnly,true);
 }
 for(const [mesh,paint]of [['van_wreck_hull','van_wreck_brand'],['van_wreck_rear_door','van_wreck_brand_rear_door'],['van_wreck_rear_door_far','van_wreck_brand_rear_door_far']]){
  const m=[1,0,0,0,0,0,1,0,0,-1,0,0,5,2,-19,1],[mark]=vanBrandInstances([{id:mesh,mesh,matrix:m}]);assert.equal(mark.mesh,paint);assert.deepEqual(mark.matrix,m);
 }
});

// Ray-test the shipped skin, not a guessed box or the paint's own metadata.
test('side and rear paint sit immediately above production vehicle steel without covering hinges or the rear window',async()=>{
 const io=new NodeIO(),[yard,drive]=await Promise.all(['public/assets/conservatory-props.glb','public/assets/source-drive/drive.glb'].map(p=>io.read(new URL('../'+p,import.meta.url).pathname)));
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function hit(mesh,origin,direction){let nearest=Infinity;
  for(const prim of mesh.listPrimitives()){const p=prim.getAttribute('POSITION'),ix=prim.getIndices()?.getArray();if(!ix)continue;
   for(let i=0;i<ix.length;i+=3){const [a,b,c]=[0,1,2].map(n=>p.getElement(ix[i+n],[])),e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)continue;
    const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;const t=dot(e2,q)/det;if(t>0)nearest=Math.min(nearest,t);
   }
  }return nearest;
 }
 for(const [id,fit]of Object.entries(VAN_BRAND_FITS)){
  const source=id==='drive'?drive:yard,host=source.getRoot().listMeshes().find(m=>m.getName()===fit.hostMeshes.at(-1));assert(host,fit.hostMeshes.at(-1));
  for(const s of fit.surfaces)for(const side of s.kind==='side'?[-1,1]:[s.normal])for(const u of[-.30,0,.30])for(const v of[-.30,0,.30]){
   if(s.kind==='rear'&&id==='drive'&&u===0)continue; // Rubber centre-seam is deliberately in front of painted steel.
   const origin=s.kind==='side'?[side*(s.surfaceX+.0026),s.centerY+v*s.heightM,s.centerZ+u*s.widthM]:[s.centerX+u*s.widthM,s.centerY+v*s.heightM,s.surfaceZ+side*.0026],direction=s.kind==='side'?[-side,0,0]:[0,0,-side];
   const distance=hit(host,origin,direction);assert(distance>.001&&distance<.004,`${fit.mesh} at ${origin}: real panel ${distance}m behind pigment`);
  }
 }
});

test('passing Source recollections and the shore echo retain the same branded exterior in their exact moving frames',()=>{
 for(const yaw of[0,Math.PI/2,Math.PI]){const vehicle=sourceRestVehicleImage('brand-check',{x:5,y:3,z:17,yaw},{scale:.96,travel:12,speed:5});
  const body=vehicle.find(p=>p.mesh==='opening_drive_vehicle_body'),paint=vehicle.find(p=>p.mesh==='van_brand_drive');assert(body&&paint);assert.deepEqual(paint.matrix,body.matrix);assert.equal(paint.collidable,false);
 }
 const g=sourceShoreGeometry(sourceShoreBounds({x:22,y:-104})),body=g.hardware.find(p=>p.name==='opening_drive_vehicle_body'),paint=g.hardware.find(p=>p.name==='van_brand_drive');
 assert(body&&paint);for(const key of['x','y','z','sx','sy','sz','yaw','moving'])assert.equal(paint[key],body[key]);
});

test('the crash derivative carries original Union Flag pigments on the hull and both separately moving rear leaves',async()=>{
 const bytes=await readFile(new URL('../public/assets/source-drive/coastal-memory/van-wreck.glb',import.meta.url)),doc=await new NodeIO().readBinary(bytes),stats=JSON.parse(await readFile(new URL('../public/assets/source-drive/coastal-memory/van-wreck.json',import.meta.url),'utf8'));
 assert.equal(stats.sha256,sha(bytes));assert.equal(stats.brand.sha256,sha(await readFile(new URL('../public/assets/van-brand.glb',import.meta.url))));
 for(const name of['van_wreck_brand','van_wreck_brand_rear_door','van_wreck_brand_rear_door_far']){
  const m=doc.getRoot().listMeshes().find(m=>m.getName()===name);assert(m);assert(m.listPrimitives().length>0);assert(m.listPrimitives().every(p=>p.getMaterial().getName().startsWith('owner paint / ')));
 }
 const rigid=doc.getRoot().listMeshes().find(m=>m.getName()==='van_wreck_brand_rear_door_far');
 for(const prim of rigid.listPrimitives()){const p=prim.getAttribute('POSITION');for(let i=0;i<p.getCount();i++){const v=p.getElement(i,[]);assert(v[0]>=-1e-6,'the hinged leaf cannot retain paint across the detached leaf seam');assert(v[2]>2.458&&v[2]<2.460,'hinged paint keeps the original steel frame until the scene rotates it');}}
});
