// Isolated Blender-to-static-GLB pilot. Run this wrapper inside the shared gate.
// Authoring is independent of conservatory-props and opening-street rebuilds.
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const output=path.join(root,'public/assets/street-pilot.glb');
const blend=path.join(root,'artifacts/street-realignment/street-pilot.blend');
const reportFile=path.join(root,'artifacts/street-realignment/street-pilot-build.json');
const blender=process.env.BLENDER_BIN||(process.platform==='darwin'?'/Applications/Blender.app/Contents/MacOS/Blender':'blender');
const config=process.argv.indexOf('--config');
const normalizeOnly=process.argv.includes('--normalize-only');
const args=['--background','--factory-startup','--python',path.join(import.meta.dirname,'build-street-pilot.py'),'--','--output',output,'--blend',blend,'--report',reportFile];
if(config>=0){if(!process.argv[config+1])throw new Error('--config requires a path');args.push('--config',path.resolve(process.argv[config+1]));}
if(!normalizeOnly){
  const result=childProcess.spawnSync(blender,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Street pilot Blender exited ${result.status}`);
}

const bytes=fs.readFileSync(output);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB2 header');
let at=12,json,bin;
while(at<bytes.length){
  const length=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+length);
  if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').trim());
  else if(type===0x004e4942)bin=Buffer.from(chunk);
  at+=8+length;
}
if(!json||!bin)throw new Error('Missing GLB JSON/BIN');
// Blender can attach default IOR/specular metadata the static project loader
// cannot accept. This material uses ordinary core metallic/roughness only.
function removeExtensions(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(removeExtensions);return;}delete value.extensions;for(const child of Object.values(value))removeExtensions(child);}
delete json.extensionsUsed;delete json.extensionsRequired;removeExtensions(json);
if(json.animations||json.skins||json.accessors.some(a=>a.sparse))throw new Error('Unsupported animation/skin/sparse accessor');
if(json.nodes.some(n=>n.children?.length))throw new Error('Pilot nodes must be flat roots');
// Blender may emit three texture descriptors for one image/sampler pair when
// it is shared by three materials. Our static loader uploads per descriptor,
// so imageCount alone understates actual GPU allocation. Merge only complete,
// canonically identical descriptors, preserving source/sampler and every key.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const descriptorCountBefore=json.textures?.length||0;
const uniqueTextures=[],textureRemap=[],textureKeys=new Map();
for(const texture of json.textures||[]){
  const key=JSON.stringify(canonical(texture));
  if(!textureKeys.has(key)){textureKeys.set(key,uniqueTextures.length);uniqueTextures.push(texture);}
  textureRemap.push(textureKeys.get(key));
}
function remapMaterialTextures(value){
  if(!value||typeof value!=='object')return;
  for(const[key,child]of Object.entries(value)){
    if(/Texture$/.test(key)&&Number.isInteger(child?.index)){
      if(!Number.isInteger(textureRemap[child.index]))throw new Error(`Invalid texture reference ${key}:${child.index}`);
      child.index=textureRemap[child.index];
    }else remapMaterialTextures(child);
  }
}
for(const material of json.materials||[])remapMaterialTextures(material);
json.textures=uniqueTextures;
for(const material of json.materials||[]){
  if(!['OPAQUE','MASK'].includes(material.alphaMode||'OPAQUE'))throw new Error('Unsupported alpha material');
  const pbr=material.pbrMetallicRoughness;
  if(!Number.isInteger(pbr?.baseColorTexture?.index)||!Number.isInteger(pbr?.metallicRoughnessTexture?.index))throw new Error(`${material.name}: embedded albedo and ORM required`);
  pbr.metallicFactor=1;pbr.roughnessFactor=1;
  material.extras={...(material.extras||{}),streetPilotRole:material.name,streetPilotAuthoring:'Project-authored mesh/atlas; see build source and research dossier'};
}
const meshes=json.meshes.map(mesh=>{
  let triangles=0,vertices=0;
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const primitive of mesh.primitives){
    if((primitive.mode??4)!==4||!Number.isInteger(primitive.indices))throw new Error(`${mesh.name}: indexed triangles only`);
    for(const key of ['POSITION','NORMAL','TEXCOORD_0'])if(!Number.isInteger(primitive.attributes[key]))throw new Error(`${mesh.name}: missing ${key}`);
    const position=json.accessors[primitive.attributes.POSITION];
    triangles+=json.accessors[primitive.indices].count/3;vertices+=position.count;
    for(let axis=0;axis<3;axis++){low[axis]=Math.min(low[axis],position.min[axis]);high[axis]=Math.max(high[axis],position.max[axis]);}
  }
  // The runtime culler reads mesh extras, not Blender object/node extras.
  // Preserve the entire receiver at oblique/far viewpoints instead of culling
  // a 40m-wide marking mesh as if its origin were its only visible point.
  mesh.extras={...(mesh.extras||{}),bounds:{min:low,max:high}};
  return{name:mesh.name,triangles,vertices,primitives:mesh.primitives.length,bounds:{min:low,max:high}};
});
for(const image of json.images||[])if(!Number.isInteger(image.bufferView)||!['image/png','image/jpeg'].includes(image.mimeType))throw new Error('PNG/JPEG embedded images required');
const raw=Buffer.from(JSON.stringify(json));
const jl=Math.ceil(raw.length/4)*4,bl=Math.ceil(bin.length/4)*4;
const final=Buffer.alloc(12+8+jl+8+bl);
final.write('glTF',0);final.writeUInt32LE(2,4);final.writeUInt32LE(final.length,8);
final.writeUInt32LE(jl,12);final.writeUInt32LE(0x4e4f534a,16);final.fill(32,20,20+jl);raw.copy(final,20);
final.writeUInt32LE(bl,20+jl);final.writeUInt32LE(0x004e4942,24+jl);bin.copy(final,28+jl);
if(final.length>4*1024*1024)throw new Error(`Pilot GLB exceeds4MiB: ${final.length}`);
fs.writeFileSync(output,final);
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
function imageDimensions(image){
  const view=json.bufferViews[image.bufferView],start=view.byteOffset||0,data=bin.subarray(start,start+view.byteLength);
  if(image.mimeType!=='image/png'||data.length<24||data.toString('ascii',1,4)!=='PNG')throw new Error('Pilot allocation audit requires its authored PNG images');
  return{width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
}
const imageSizes=json.images.map(imageDimensions);
const allocations=json.textures.map((texture,index)=>{
  const size=imageSizes[texture.source];if(!size)throw new Error(`Texture ${index} has no supported image`);
  let width=size.width,height=size.height,texels=0;
  while(true){texels+=width*height;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}
  return{index,image:texture.source,sampler:texture.sampler??null,...size,estimatedRgbaMipBytes:texels*4};
});
const actualMipBytes=allocations.reduce((sum,item)=>sum+item.estimatedRgbaMipBytes,0);
if(actualMipBytes>12*1024*1024)throw new Error(`Pilot actual descriptor allocation exceeds12MiB: ${actualMipBytes}`);
const body=meshes.find(mesh=>mesh.name==='street_pilot_car_body'),wheel=meshes.find(mesh=>mesh.name==='street_pilot_car_wheel');
report.atlas.estimatedMipmappedBytes=actualMipBytes;
report.export={bytes:final.length,sha256:sha(final),meshes,imageCount:json.images.length,textureDescriptorCount:json.textures.length,normalization:{mode:normalizeOnly?'existing-export':'fresh-Blender-export',textureDescriptorCountBefore:descriptorCountBefore,textureDescriptorCountAfter:json.textures.length,method:'Canonical complete-descriptor identity; all source/sampler/other keys retained.'},gpuTextureAllocations:allocations,estimatedMipmappedTextureBytes:actualMipBytes,materialCount:json.materials.length,rootNodes:json.nodes.length,allNodeTransformsIdentity:json.nodes.every(node=>!node.matrix&&!node.translation&&!node.rotation&&!node.scale&&!node.children?.length),blendSha256:sha(fs.readFileSync(blend)),sourceSha256:sha(fs.readFileSync(path.join(import.meta.dirname,'build-street-pilot.py'))),wrapperSha256:sha(fs.readFileSync(import.meta.filename)),coreGltfOnly:true};
report.geometry={nominalReference:{lengthM:report.car.lengthM,bodyWidthM:report.car.bodyWidthM,heightM:report.car.heightM,includesMirrors:false,includesAddedLampPlateTrim:false},measuredRenderedEnvelope:{lengthM:body.bounds.max[2]-body.bounds.min[2],mirrorWidthM:body.bounds.max[0]-body.bounds.min[0],heightAboveRoadM:body.bounds.max[1],bounds:body.bounds,note:'Includes swept lamp/grille/plate trim; 4.398m envelope differs from 4.358m dimension reference by40mm.'},wheel:{pivot:'hub centre, localX axle',radiusM:(wheel.bounds.max[1]-wheel.bounds.min[1])*.5,fullWidthIncludingRimFaceM:wheel.bounds.max[0]-wheel.bounds.min[0],nominalTyreWidthM:report.car.tyreWidthM,staticBottomAboveRoadM:report.car.rollingRadiusM+wheel.bounds.min[1],maxPolygonContactGapM:report.car.rollingRadiusM*(1-Math.cos(Math.PI/16)),note:'16 radial segments; maximum geometric contact gap during continuous rotation is an engineering bound, pending live inspection.'}};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(`Street pilot: ${final.length}bytes, ${meshes.reduce((sum,m)=>sum+m.triangles,0)} catalogue triangles, ${meshes.length} root meshes.`);
