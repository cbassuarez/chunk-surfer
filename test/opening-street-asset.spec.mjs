import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync('tools/chunk_surfer/opening-street-sources.json','utf8'));
const stats=JSON.parse(fs.readFileSync('public/assets/opening-street.stats.json','utf8'));
const credits=JSON.parse(fs.readFileSync('public/assets/opening-street.credits.json','utf8'));
const artifact=JSON.parse(fs.readFileSync('artifacts/opening-street-assets.json','utf8'));
const bytes=fs.readFileSync('public/assets/opening-street.glb');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8').trim());
const binStart=20+jsonLength+8;

const componentBytes={5121:1,5123:2,5125:4,5126:4};
function accessorValues(index){
  const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView];
  const width=accessor.type==='VEC3'?3:1,componentSize=componentBytes[accessor.componentType];
  const stride=view.byteStride||componentSize*width;
  const offset=binStart+(view.byteOffset||0)+(accessor.byteOffset||0),out=[];
  for(let i=0;i<accessor.count;i++){
    const row=[];
    for(let c=0;c<width;c++){
      const at=offset+i*stride+c*componentSize;
      row.push(accessor.componentType===5126?bytes.readFloatLE(at)
        :accessor.componentType===5125?bytes.readUInt32LE(at)
        :accessor.componentType===5123?bytes.readUInt16LE(at):bytes.readUInt8(at));
    }
    out.push(width===1?row[0]:row);
  }
  return out;
}
function pointInTriangle(y,z,a,b,c){
  const cross=(u,v,w)=>(v[2]-u[2])*(w[1]-u[1])-(v[1]-u[1])*(w[2]-u[2]);
  const p=[0,y,z],d1=cross(a,b,p),d2=cross(b,c,p),d3=cross(c,a,p);
  return !(d1<-.0001||d2<-.0001||d3<-.0001)||!(d1>.0001||d2>.0001||d3>.0001);
}
function frontageBlocks(y,z){
  const mesh=gltf.meshes.find((entry)=>entry.name==='opening_street_frontage');
  for(const primitive of mesh.primitives){
    const positions=accessorValues(primitive.attributes.POSITION),indices=accessorValues(primitive.indices);
    for(let i=0;i<indices.length;i+=3){
      const triangle=[positions[indices[i]],positions[indices[i+1]],positions[indices[i+2]]];
      if(Math.max(...triangle.map((point)=>point[0]))-Math.min(...triangle.map((point)=>point[0]))>.05)continue;
      if(pointInTriangle(y,z,...triangle))return true;
    }
  }
  return false;
}

const roles=['asphalt','boxProfile','brick','cobbles','corrugatedIron','grass','modernCladding','roughStone','rustyMetal03','rustyMetal04','rustyPaintedMetal','smallTree','weatheredRender'];
assert.equal(manifest.sources.length,13);
assert.deepEqual(manifest.sources.map((source)=>source.role).sort(),roles);
assert.deepEqual(artifact.sources.map((source)=>source.role).sort(),roles);
assert.ok(manifest.sources.every((source)=>/^[a-f0-9]{64}$/.test(source.sha256)));
assert.ok(manifest.sources.every((source)=>source.url===`https://polyhaven.com/a/${source.source}`));
assert.ok(manifest.sources.every((source)=>source.maps&&source.albedoResolution&&source.dataResolution));
assert.ok(manifest.sources.every((source)=>source.normalStrength>=0&&source.aoStrength>=0));
assert.ok(manifest.sources.every((source)=>source.license==='CC0-1.0'&&source.licenseUrl==='https://polyhaven.com/license'));
assert.ok(manifest.sources.every((source)=>source.colorSpace.albedo==='sRGB'&&source.colorSpace.normal==='linear'&&source.colorSpace.orm==='linear'));
assert.ok(manifest.sources.every((source)=>source.role==='smallTree'||source.metresPerTile>0));
assert.equal(manifest.sources.find((source)=>source.role==='boxProfile').archive,'box_profile_metal_sheet_4k.blend.zip');
assert.equal(manifest.sources.find((source)=>source.role==='weatheredRender').archive,'medieval_wall_01_4k.blend.zip');
assert.ok(manifest.sources.every((source)=>!/[()]|jacaranda|modular_street_seating/i.test(source.archive)));

assert.equal(bytes.subarray(0,4).toString('ascii'),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),stats.sha256);
assert.equal(stats.sha256,credits.pack.sha256);
assert.equal(stats.sha256,artifact.build.sha256);
assert.equal(stats.bytes,bytes.length);
assert.ok(stats.bytes<=manifest.limits.bytes);
assert.ok(stats.totalTriangles<=manifest.limits.triangles);
assert.ok(stats.estimatedMipmappedTextureBytes<=manifest.limits.estimatedMipmappedTextureBytes);
assert.ok(stats.images.every((image)=>image.width<=manifest.limits.textureDimension&&image.height<=manifest.limits.textureDimension));
assert.equal(stats.textureCount,42);
assert.equal(stats.gameplayDrawCalls,14);
assert.ok(stats.gameplayDrawCalls<=manifest.limits.mainPassDrawCalls);
assert.ok(stats.tree.triangles<=manifest.sources.find((source)=>source.role==='smallTree').triangleBudget);

assert.equal(gltf.animations,undefined);
assert.equal(gltf.skins,undefined);
assert.equal(gltf.extensionsUsed,undefined);
assert.equal(gltf.extensionsRequired,undefined);
assert.deepEqual(gltf.meshes.map((mesh)=>mesh.name),[
  'opening_street_ground','opening_street_frontage','opening_street_service_history',
  'opening_street_review_plate','opening_street_tree_small',
]);
for(const mesh of gltf.meshes){
  assert.ok(mesh.primitives.length>0);
  for(const primitive of mesh.primitives){
    assert.ok(Number.isInteger(primitive.indices));
    assert.ok(Number.isInteger(primitive.material));
    assert.ok(Number.isInteger(primitive.attributes.POSITION));
    assert.ok(Number.isInteger(primitive.attributes.NORMAL));
    assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
    const position=gltf.accessors[primitive.attributes.POSITION];
    assert.ok(position.min.every(Number.isFinite)&&position.max.every(Number.isFinite));
    assert.ok(position.min.some((value,index)=>value!==position.max[index]));
  }
}
const meshBounds=Object.fromEntries(stats.meshes.map((mesh)=>[mesh.name,mesh.bounds]));
assert.ok(meshBounds.opening_street_ground.max[1]<.1&&meshBounds.opening_street_ground.max[2]>15,'ground stays horizontal in Y-up runtime space');
assert.ok(meshBounds.opening_street_frontage.max[1]>8&&meshBounds.opening_street_frontage.max[2]>80,'frontage rises on Y and runs along Z');
assert.ok(meshBounds.opening_street_service_history.max[1]>6&&meshBounds.opening_street_service_history.max[2]>60,'service layer preserves runtime axes');
assert.ok(meshBounds.opening_street_review_plate.max[1]>3&&meshBounds.opening_street_review_plate.max[2]===8,'review walls face a level camera');
const reviewMesh=gltf.meshes.find((mesh)=>mesh.name==='opening_street_review_plate');
for(const primitive of reviewMesh.primitives.slice(3)){
  const normals=accessorValues(primitive.attributes.NORMAL);
  assert.ok(normals.every((normal)=>normal[2]<-.99),'review wall plates face the fixed review camera');
}
const groundMesh=gltf.meshes.find((mesh)=>mesh.name==='opening_street_ground');
for(const primitive of groundMesh.primitives){
  const normals=accessorValues(primitive.attributes.NORMAL);
  assert.ok(normals.every((normal)=>normal[1]>.99),'horizontal opening-street receivers face upward for lighting');
}
assert.equal(frontageBlocks(2,0),true,'the retired personnel doorway is opaque masonry');
assert.equal(frontageBlocks(2,2.5),false,'the canonical three-metre goods pair remains the only loading-bay opening');
assert.equal(frontageBlocks(4.5,2.5),true,'masonry closes the wall above the goods-door head');
const materialRoles=[...new Set(gltf.materials.map((material)=>material.extras?.openingStreetRole))].sort();
assert.deepEqual(materialRoles,roles);
assert.ok(gltf.materials.every((material)=>{
  const pbr=material.pbrMetallicRoughness;
  return Number.isInteger(pbr?.baseColorTexture?.index)
    && Number.isInteger(material.normalTexture?.index)
    && Number.isInteger(pbr?.metallicRoughnessTexture?.index)
    && material.occlusionTexture?.index===pbr.metallicRoughnessTexture.index
    && material.occlusionTexture.strength>=0;
}));
const branch=gltf.materials.find((material)=>material.name==='openingStreet.smallTree.branch');
const leaves=gltf.materials.find((material)=>material.name==='openingStreet.smallTree.leaves');
assert.equal(branch.alphaMode||'OPAQUE','OPAQUE');
assert.equal(leaves.alphaMode,'MASK');
assert.ok(leaves.alphaCutoff>0&&leaves.alphaCutoff<1);
assert.ok(stats.images.every((image)=>['image/jpeg','image/png'].includes(image.mimeType)));

assert.equal(credits.sources.length,13);
for(const source of manifest.sources){
  const credit=credits.sources.find((entry)=>entry.role===source.role);
  assert.equal(credit.sourceName,source.source);
  assert.equal(credit.sourceUrl,source.url);
  assert.equal(credit.archiveSha256,source.sha256);
  assert.equal(credit.license,'CC0-1.0');
  assert.equal(credit.licenseUrl,'https://polyhaven.com/license');
}
assert.ok(artifact.sources.every((source)=>source.sourceResolution===4096));
assert.ok(artifact.sources.every((source)=>source.role==='smallTree'||source.uvScaleMetres>0));
assert.ok(artifact.sources.every((source)=>source.heightTreatment==='build metadata only; no runtime displacement'));

const builder=fs.readFileSync('tools/chunk_surfer/build-opening-street.mjs','utf8');
const renderer=fs.readFileSync('src/render/props3d.js','utf8');
const worldRenderer=fs.readFileSync('src/render/r3d.js','utf8');
assert.match(builder,/path\.posix\.isAbsolute\(member\).*normal\.startsWith\('\.\.\/'\)/s);
assert.match(builder,/fs\.mkdtempSync/);
assert.match(renderer,/srgb\?gl\.SRGB8_ALPHA8:gl\.RGBA8/);
assert.match(renderer,/TEXTURE_MIN_FILTER,gl\.LINEAR_MIPMAP_LINEAR/);
assert.match(renderer,/TEXTURE_WRAP_S,gl\.REPEAT/);
assert.match(renderer,/occlusionTexture\?\.strength/);
assert.match(renderer,/setPropDiagnostics/);
assert.match(worldRenderer,/assets\/opening-street\.glb/);

console.log('opening street asset contracts passed');
