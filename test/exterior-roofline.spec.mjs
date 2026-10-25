import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import crypto from'node:crypto';
import{EXTERIOR_ROOFLINE as C,EXTERIOR_ROOFLINE_REVISION,EXTERIOR_ROOF_ARCHITECTURE_IDS,exteriorRoofArchitectureInstances,exteriorRooflineInstance}from'../src/data/exterior-roofline.js';
import{exteriorRooflineGeometry,EXTERIOR_ROOFLINE_MATERIALS}from'../tools/chunk_surfer/exterior-roofline-geometry.mjs';
import{ELLERY_MASSING}from'../src/data/exterior-district.js';import{ZONE}from'../src/data/floorplan/legend.js';import{ACADEMIC_ROOF,ACADEMIC_ROOF_STAIR}from'../src/data/academic-roof.js';
import{parseGlb}from'../tools/chunk_surfer/rebuild-tree-crowns.mjs';import{propInstanceVisible}from'../src/render/props3d.js';
import*as FP from'../src/world/floorplan.js';import*as PROPS from'../src/game/props.js';import{conservatory}from'../src/data/floorplan/conservatory.js';
const built=exteriorRooflineGeometry(),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),packBytes=fs.readFileSync(new URL('../public/assets/ellery-exterior-roofline.glb',import.meta.url)),pack=parseGlb(packBytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/ellery-exterior-roofline.stats.json',import.meta.url)));
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const get=(pack,id)=>{const a=pack.json.accessors[id],v=pack.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>pack.bin[method](off+i*stride+k*size)));};
const triangles=(pack,mesh)=>mesh.primitives.flatMap(p=>{const pos=get(pack,p.attributes.POSITION),idx=get(pack,p.indices).flat(),out=[];for(let i=0;i<idx.length;i+=3)out.push(idx.slice(i,i+3).map(k=>pos[k]));return out;});
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
function rayTriangle(origin,direction,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return null;const t=dot(e2,q)/det;return t>0?t:null;}
const roofTriangles=triangles(pack,pack.json.meshes[0]);

test('source runtime omits existing roof architecture from ground; explicit selection restores only construction',()=>{
  const ground=PROPS.renderInstances({group:'ground',inscriptions:false}),roof=PROPS.renderInstances({group:'academicRoof',inscriptions:false});
  assert.ok(EXTERIOR_ROOF_ARCHITECTURE_IDS.every(id=>!ground.some(p=>p.id===id)),'test preserves the original visibility failure');
  const restored=exteriorRoofArchitectureInstances(roof,{zone:ZONE.dock});
  assert.deepEqual(restored.map(p=>p.id),EXTERIOR_ROOF_ARCHITECTURE_IDS);
  assert.ok(restored.every(p=>p.structural&&!p.character));
  assert.equal(restored.some(p=>/ren|cassette|seal|shortcut|sit/.test(p.id)),false);
  for(const zone of[ZONE.street,ZONE.civicCourt,ZONE.dock])assert.equal(exteriorRoofArchitectureInstances(roof,{zone}).length,3);
  for(const zone of[ZONE.pub,ZONE.academic,ZONE.getIn])assert.deepEqual(exteriorRoofArchitectureInstances(roof,{zone}),[]);
  assert.deepEqual(exteriorRoofArchitectureInstances(roof,{zone:ZONE.academicRoof,group:'academicRoof'}),[],'roof view already contains its own architecture');
});

test('new roof stock closes only four existing bands at their authored elevations',()=>{
  assert.deepEqual(C.bands.map(b=>b.id),['service','academic','school','baths']);
  for(const b of C.bands){const original=ELLERY_MASSING.find(p=>p.id===b.id);assert.equal(b.height,original.height);assert.equal(b.z0,original.y0-7.5);assert.equal(b.z1,original.y1-7.5);}
  assert.ok(built.bands.every(b=>b.maximumStockY===b.height+C.originalCoping.topOffset));
  assert.ok(built.primitives.every(p=>p.positions.every(Number.isFinite)));
  assert.equal(built.name,'ellery_west_roofline_closure');
  assert.equal(pack.json.meshes.length,1,'no existing facade, pub or neighbourhood mesh is replaced');
});

test('new cornice overlaps the real forward skin and meets existing coping without raising its summit',()=>{
  for(const b of C.bands){
    const own=built.parts.filter(p=>p.id.startsWith(b.id+'-'));
    const frieze=own.find(p=>p.id===b.id+'-frieze-0'),cap=own.find(p=>p.id===b.id+'-coping-0');
    const extent=(p,k)=>[p.center[k]-p.size[k]/2,p.center[k]+p.size[k]/2];
    assert.ok(extent(frieze,0)[0]<C.originalSkin.x0&&extent(frieze,0)[1]>C.originalSkin.x1,'broad frieze actually covers the old .56m-forward skin');
    assert.equal(extent(cap,0)[1],C.originalCoping.x0,'new cap joins the old coping edge rather than floating ahead of it');
    assert.ok(Math.abs(extent(cap,1)[1]-(b.height+.22))<1e-9);
    const tray=own.find(p=>p.kind==='closed-tray');assert.ok(tray.upper[0][0]<C.originalSkin.x1&&tray.upper[1][0]>C.originalCoping.x1);
    assert.ok(tray.lower[0][1]<b.height+C.originalSkin.topOffset&&tray.upper[0][1]>b.height,'tray seats across the actual skin top and above the grid support');
  }
});

test('actual exported closed trays supply a top hit over every roof band',()=>{
  for(const b of C.bands)for(const x of[-.50,.5,3.0,6.0])for(const f of[.1,.4,.8]){
    const z=b.z0+(b.z1-b.z0)*f,origin=[x,b.height+.5,z],hits=roofTriangles.map(t=>rayTriangle(origin,[0,-1,0],t)).filter(t=>t!==null).sort((a,b)=>a-b);
    assert.ok(hits.length>=2,`${b.id} has a top and real underside at ${x},${z}`);
    const top=origin[1]-hits[0];assert.ok(top>b.height&&top<=b.height+.22+1e-6,'roof covers the solid support below its original coping');
  }
});

test('the retained base mesh has no closing roof at the exact four repaired probes',()=>{
  const base=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),old=triangles(base,base.json.meshes.find(m=>m.name==='conservatory_west_elevation'));
  for(const b of C.bands){const origin=[2,b.height+.5,(b.z0+b.z1)/2],hits=old.map(t=>rayTriangle(origin,[0,-1,0],t)).filter(t=>t!==null&&t<1);assert.deepEqual(hits,[],`${b.id}: shared base now closes this roof; reconcile the independent closure before stacking both`);}
});

test('each of the drained roof trays is a closed six-faced solid with outward top and underside',()=>{
  for(const b of C.bands){
    const tray=built.parts.find(p=>p.id===`${b.id}-closed-roof`);
    assert.equal(tray.upper.length,4);assert.equal(tray.lower.length,4);
    for(let i=0;i<4;i++)assert.ok(Math.abs(tray.upper[i][1]-tray.lower[i][1]-C.roofThickness)<1e-9);
    assert.ok(tray.upper[1][1]>tray.upper[0][1],'rain drains toward the existing west edge');
  }
  for(const g of built.primitives)for(let i=0;i<g.indices.length;i+=3){
    const idx=g.indices.slice(i,i+3),[a,b,c]=idx.map(j=>g.positions.slice(j*3,j*3+3)),normal=cross(sub(b,a),sub(c,a));
    assert.ok(Math.hypot(...normal)>1e-10);
    for(const j of idx){const n=g.normals.slice(j*3,j*3+3);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-6);assert.ok(dot(normal,n)>0);}
  }
});

test('loading mouth, ordinary body volume and established playable roof remain outside new stock',()=>{
  assert.ok(built.bounds.min[1]>8,'all new stock is high above the opening threshold and street body');
  const x0=C.anchor.x+built.bounds.min[0],x1=C.anchor.x+built.bounds.max[0];
  assert.ok(x1<ACADEMIC_ROOF.physicalOrigin.x,'new closure does not cross the playable roof floor, skylight or promenade');
  for(const f of ACADEMIC_ROOF_STAIR.flights)assert.ok(x1<Math.min(f.physicalFrom.x,f.physicalTo.x)-3,'no new stock intersects either physical stair flight');
  assert.ok(x0>48.5,'cornice overhang stays at the existing building side of the yard');
  const start=FP.toRuntimePoint(conservatory.spawn),before=structuredClone(FP.cellAt(start.x,start.y)),roof=PROPS.renderInstances({group:'academicRoof',inscriptions:false});
  assert.ok(before,'actual authored arrival is compiled floor');
  exteriorRoofArchitectureInstances(roof,{zone:ZONE.dock});exteriorRooflineInstance({zone:ZONE.dock});
  assert.deepEqual(FP.cellAt(start.x,start.y),before,'render selection never modifies floor topology or collision');
});

test('ordinary outdoor instances retain the new crown even far from its corner origin',()=>{
  const instance=exteriorRooflineInstance({zone:ZONE.street});assert.ok(instance&&instance.skyExposed&&instance.structural&&!instance.blocks);
  for(const eye of[[41,1.7,55],[133,1.7,82],[50,1.7,103],[77,19,9]])assert.equal(propInstanceVisible(instance,eye),true);
  for(const zone of[ZONE.getIn,ZONE.academic,ZONE.pub])assert.equal(exteriorRooflineInstance({zone}),null);
});

test('street cameras have real mesh intersections at the crowned west silhouette',()=>{
  for(const b of C.bands){
    const target=[-.98,b.height+.14,(b.z0+b.z1)/2],eye=[-14,1.7,target[2]],delta=sub(target,eye),len=Math.hypot(...delta),direction=delta.map(v=>v/len),hits=roofTriangles.map(t=>rayTriangle(eye,direction,t)).filter(t=>t!==null);
    assert.ok(hits.length&&Math.min(...hits)<=len+.2,`${b.id} cornice is a projected surface, not an empty bounds marker`);
  }
});

test('pack is bounded, fully opaque and nonemissive; receipt binds actual source and asset bytes',()=>{
  assert.equal(stats.sha256,sha(packBytes));assert.equal(stats.revision,EXTERIOR_ROOFLINE_REVISION);assert.ok(stats.bytes<C.maximumBytes&&stats.triangles<C.maximumTriangles);assert.equal(stats.textureBytes,0);assert.equal(stats.primitives,5);
  for(const[file,digest]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL('../'+file,import.meta.url))),digest,`rebuild after ${file}`);
  for(const m of pack.json.materials){assert.ok(!m.alphaMode||m.alphaMode==='OPAQUE');assert.deepEqual(m.emissiveFactor||[0,0,0],[0,0,0]);}
  assert.ok(EXTERIOR_ROOFLINE_MATERIALS.every(m=>m.roughness>=.85&&m.metallic<=.08));
  assert.ok(stats.pending.includes('final native outdoor roofline inspection'));
  assert.deepEqual(exteriorRooflineGeometry(),built,'deterministic geometry preserves the evidence binding');
});
