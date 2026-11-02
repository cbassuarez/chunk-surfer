import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';

export const SHARED_FEATURE_BASELINES=JSON.parse(readFileSync(new URL('../fixtures/shared-feature-baselines.json',import.meta.url),'utf8'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

async function textureRecord(texture,info){
  if(!texture)return null;
  assert.equal(info.listExtensions().length,0,'a new feature texture transform needs an explicit preserved-UV contract');
  const {data,info:decoded}=await sharp(Buffer.from(texture.getImage())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return{width:decoded.width,height:decoded.height,channels:decoded.channels,pixels:createHash('sha256').update(data).digest('hex'),
    texCoord:info.getTexCoord(),wrapS:info.getWrapS(),wrapT:info.getWrapT(),magFilter:info.getMagFilter(),minFilter:info.getMinFilter()};
}
async function materialRecord(material){
  if(!material)return null;
  assert.equal(material.listExtensions().length,0,'a new feature material extension needs an explicit preserved-material contract');
  const textures={};
  for(const role of['BaseColor','MetallicRoughness','Normal','Occlusion','Emissive'])textures[role]=await textureRecord(material['get'+role+'Texture'](),material['get'+role+'TextureInfo']());
  return{name:material.getName(),baseColor:material.getBaseColorFactor(),metallic:material.getMetallicFactor(),roughness:material.getRoughnessFactor(),
    emissive:material.getEmissiveFactor(),normalScale:material.getNormalScale(),occlusionStrength:material.getOcclusionStrength(),
    alphaMode:material.getAlphaMode(),alphaCutoff:material.getAlphaCutoff(),doubleSided:material.getDoubleSided(),extras:material.getExtras(),textures};
}
const normalizedValue=(accessor,value)=>{
  if(!accessor.getNormalized())return value;
  const type=accessor.getArray().constructor.name,maximum={Int8Array:127,Uint8Array:255,Int16Array:32767,Uint16Array:65535,Uint32Array:4294967295}[type];
  assert.ok(maximum,'unsupported normalized feature accessor '+type);return Math.max(-1,value/maximum);
};

// A semantic triangle stream ignores unrelated meshes, global material/index
// numbering, buffer offsets, index width and primitive/vertex reordering. It
// retains winding, all actual shader attributes, material response, decoded
// texture pixels and the feature's own node transforms.
export async function sharedFeatureFingerprint(document,name){
  const mesh=document.getRoot().listMeshes().find(mesh=>mesh.getName()===name);assert.ok(mesh,'preserved feature mesh missing: '+name);
  const materials=new Map();let vertices=0,triangles=0;
  for(const primitive of mesh.listPrimitives()){
    assert.equal(primitive.getMode(),4,name+' must remain triangles');assert.equal(primitive.listTargets().length,0,name+' is a fixed architectural feature');
    const semantics=primitive.listSemantics().sort(),position=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray()||Array.from({length:position.getCount()},(_,i)=>i),
      material=await materialRecord(primitive.getMaterial()),key=digest(material);
    if(!materials.has(key))materials.set(key,{material,faces:[]});const group=materials.get(key);
    vertices+=position.getCount();
    const vertex=index=>semantics.map(semantic=>{const attribute=primitive.getAttribute(semantic),size=attribute.getElementSize(),array=attribute.getArray(),values=Array.from(array.slice(index*size,(index+1)*size),n=>normalizedValue(attribute,n));assert.ok(values.every(Number.isFinite),name+' has nonfinite attributes');return[semantic,values];});
    for(let i=0;i<indices.length;i+=3){
      const corners=Array.from(indices.slice(i,i+3),vertex);assert.equal(corners.length,3);
      const cyclic=[corners,[corners[1],corners[2],corners[0]],[corners[2],corners[0],corners[1]]].map(value=>JSON.stringify(value)).sort();
      group.faces.push(cyclic[0]);triangles++;
    }
  }
  const groups=[...materials.values()].map(group=>({material:group.material,triangles:group.faces.length,sha256:digest(group.faces.sort())})).sort((a,b)=>digest(a).localeCompare(digest(b))),
    transforms=document.getRoot().listNodes().filter(node=>node.getMesh()===mesh).map(node=>Array.from(node.getWorldMatrix())).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    semantics={name,triangles,groups,transforms};
  return{sha256:digest(semantics),triangles,materials:groups.length,instances:transforms.length,materialSha256:digest(groups.map(group=>group.material)),
    // Vertex storage is diagnostic only: an equivalent reindex may deduplicate
    // vertices without changing any rendered triangle or winding.
    storedVertices:vertices};
}

export async function assertSharedFeatures({file,baselineId,recordedSourceSha256}){
  const baseline=SHARED_FEATURE_BASELINES.features[baselineId];assert.ok(baseline,'unknown reviewed feature baseline '+baselineId);
  assert.equal(recordedSourceSha256,baseline.sourceSha256,'historical preservation receipt must retain its original pack identity');
  const document=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  for(const[name,expected]of Object.entries(baseline.meshes)){
    const actual=await sharedFeatureFingerprint(document,name),withoutStorage=({storedVertices,...semantic})=>semantic;
    assert.deepEqual(withoutStorage(actual),withoutStorage(expected),file+' preserved feature '+name);
  }
  return baseline;
}
