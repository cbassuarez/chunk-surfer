import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const sha=b=>createHash('sha256').update(b).digest('hex');
const folder='public/assets/lettering-study/';
function glb(file){const bytes=readFileSync(file),len=bytes.readUInt32LE(12);return{bytes,json:JSON.parse(bytes.subarray(20,20+len)),bin:bytes.subarray(28+len)};}
function accessor(asset,index){const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType];assert.ok(!v.byteStride||v.byteStride===width*size);return{type:a.type,componentType:a.componentType,count:a.count,bytes:asset.bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*width*size)};}
function texture(asset,index){const image=asset.json.images[asset.json.textures[index].source],view=asset.json.bufferViews[image.bufferView];return asset.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength);}
const source=glb(folder+'signs.glb'),control=glb(folder+'polarity.glb'),manifest=JSON.parse(readFileSync(folder+'polarity-manifest.json'));
assert.equal(sha(control.bytes),manifest.glbSha256);assert.ok(manifest.frozenInputsUnchanged);
for(const[file,hash]of Object.entries(manifest.sourceHashes))assert.equal(sha(readFileSync(file)),hash,`${file}: polarity study changed or drifted from its frozen source`);
assert.equal(control.json.meshes.length,1);assert.equal(control.json.textures.length,3);assert.ok(control.bytes.length<200000);
const original=source.json.meshes.find(m=>m.name===manifest.sourceMesh),candidate=control.json.meshes[0];
assert.equal(candidate.name,'lettering_study_services_light_enamel');assert.equal(candidate.extras.copy,'STUDIOS / PLANT');assert.deepEqual(candidate.extras.metrics,original.extras.metrics);
assert.equal(candidate.primitives.length,original.primitives.length);
for(let i=0;i<original.primitives.length;i++){
 const a=original.primitives[i],b=candidate.primitives[i];
 for(const key of Object.keys(a.attributes))assert.deepEqual(accessor(control,b.attributes[key]),accessor(source,a.attributes[key]),`${key}: polarity changed geometry`);
 assert.deepEqual(accessor(control,b.indices),accessor(source,a.indices));
 const am=source.json.materials[a.material],bm=control.json.materials[b.material];
 if(!am.pbrMetallicRoughness.baseColorTexture){assert.deepEqual(bm,am);continue;}
 assert.equal(bm.alphaMode,'OPAQUE');assert.equal(bm.emissiveFactor,undefined);
 for(const key of ['baseColorFactor','metallicFactor','roughnessFactor'])assert.deepEqual(bm.pbrMetallicRoughness[key],am.pbrMetallicRoughness[key]);
 const oldNormal=texture(source,am.normalTexture.index),newNormal=texture(control,bm.normalTexture.index),oldOrm=texture(source,am.pbrMetallicRoughness.metallicRoughnessTexture.index),newOrm=texture(control,bm.pbrMetallicRoughness.metallicRoughnessTexture.index);
 assert.deepEqual(newNormal,oldNormal);assert.deepEqual(newOrm,oldOrm);
 const oldAlbedo=texture(source,am.pbrMetallicRoughness.baseColorTexture.index),newAlbedo=texture(control,bm.pbrMetallicRoughness.baseColorTexture.index);
 assert.notDeepEqual(newAlbedo,oldAlbedo);assert.equal(sha(newAlbedo),manifest.albedoSha256);
 const decoded=await sharp(newAlbedo).raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,1024);assert.equal(decoded.info.height,304);
 const mask=await sharp(folder+'services-fabricated-mask.png').greyscale().raw().toBuffer();let inkPixels=0,paleGround=0;
 for(let p=0;p<mask.length;p++){const at=p*decoded.info.channels,color=decoded.data.subarray(at,at+3);if(mask[p]===255){inkPixels++;assert.deepEqual([...color],[24,31,27],'Pigment palette changed inconsistently');}if(mask[p]===0&&color[0]>200&&color[1]>200)paleGround++;}
 assert.ok(inkPixels>10000&&paleGround>200000,'Required polarity is absent from material pixels');
}
assert.equal(manifest.unchangedMasks.mask,sha(readFileSync(folder+'services-fabricated-mask.png')));
console.log(JSON.stringify({bytes:control.bytes.length,geometryExact:true,normalAndOrmExact:true,glyphMaskExact:true,onlyAlbedoPaletteChanges:true,frozenInputsUnchanged:true}));
