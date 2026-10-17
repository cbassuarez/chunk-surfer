import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LETTERING_STUDY_CASES, LETTERING_STUDY_VARIANTS, letteringStudyInstance, letteringStudyMesh, projectedLetterMetrics, meetsLetteringSamplingTarget} from '../src/render/lettering-study.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function glb(path){const bytes=readFileSync(path),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);return{bytes,json,bin};}
const pack=glb('public/assets/lettering-study/signs.glb');
// A completed comparison retains its original production source. Rolling the
// approved treatment into today's pack must not silently rewrite the control.
const source=glb('artifacts/lettering-production/baseline/public/assets/conservatory-props.glb');
const manifest=JSON.parse(readFileSync('public/assets/lettering-study/manifest.json'));
const fontProvenance=JSON.parse(readFileSync('tools/chunk_surfer/lettering-study/fonts/manifest.json'));
assert.equal(hash(readFileSync('tools/chunk_surfer/lettering-study/fonts/'+fontProvenance.file)),fontProvenance.sha256);
assert.equal(manifest.cases.services.variants.fabricated.fontSha256,fontProvenance.sha256);
assert.equal(hash(pack.bytes),manifest.glbSha256);
assert.equal(hash(source.bytes),manifest.sourcePackSha256,'The frozen historical source snapshot no longer matches the study control');
assert.equal(hash(readFileSync('src/render/lettering-study.js')),manifest.sourceModuleSha256,'Study definitions changed without rebuilding');
assert.equal(hash(readFileSync('tools/chunk_surfer/lettering-study/build.py')),manifest.generatorSha256,'Lettering generator changed without rebuilding');
assert.equal(pack.json.meshes.length,6);
assert.equal(pack.json.skins,undefined);
assert.equal(pack.json.extensionsUsed,undefined);
assert.ok(pack.bytes.length<500_000,'Two representative boards exceed the study embedded-asset budget');
function values(asset,index){const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],stride=v.byteStride||size*width,data=new DataView(asset.bin.buffer,asset.bin.byteOffset,asset.bin.byteLength),get={5121:'getUint8',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];return Array.from({length:a.count*width},(_,i)=>data[get]((v.byteOffset||0)+(a.byteOffset||0)+Math.floor(i/width)*stride+i%width*size,true));}
const bounds=(asset,mesh)=>{const p=mesh.primitives.flatMap(p=>values(asset,p.attributes.POSITION));return[0,1,2].map(k=>[Math.min(...p.filter((_,i)=>i%3===k)),Math.max(...p.filter((_,i)=>i%3===k))]);};
async function image(asset,index){const image=asset.json.images[asset.json.textures[index].source],v=asset.json.bufferViews[image.bufferView];assert.equal(image.mimeType,'image/png');return sharp(asset.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)).raw().toBuffer({resolveWithObject:true});}
const copy={services:'STUDIOS / PLANT',placard:'SAVE ELLERY'};
let resident=0;
for(const[id,study]of Object.entries(LETTERING_STUDY_CASES)){
  const original=source.json.meshes.find(m=>m.name===study.sourceMesh),baseline=pack.json.meshes.find(m=>m.name===letteringStudyMesh(id,'baseline'));
  assert.equal(study.copy,copy[id]);
  assert.equal(baseline.primitives.length,original.primitives.length);
  for(let i=0;i<original.primitives.length;i++){
    for(const key of Object.keys(original.primitives[i].attributes))assert.deepEqual(values(pack,baseline.primitives[i].attributes[key]),values(source,original.primitives[i].attributes[key]),`${id} baseline ${key} changed`);
    assert.deepEqual(values(pack,baseline.primitives[i].indices),values(source,original.primitives[i].indices));
    assert.deepEqual(pack.json.materials[baseline.primitives[i].material],source.json.materials[original.primitives[i].material]);
  }
  const masks=[];
  for(const variant of LETTERING_STUDY_VARIANTS.slice(1)){
    const mesh=pack.json.meshes.find(m=>m.name===letteringStudyMesh(id,variant)),record=manifest.cases[id].variants[variant];
    assert.equal(mesh.extras.copy,copy[id]);assert.equal(mesh.extras.noProductionOverride,true);
    assert.deepEqual(bounds(pack,mesh),bounds(pack,baseline),`${id} improved lettering changed the existing board/stand bounds`);
    assert.equal(record.faceTriangles,2);assert.ok(record.triangleDelta<0);
    assert.ok(Math.abs(record.capHeightM-study.capHeightM)<1e-10);assert.ok(Math.abs(record.stemWidthM-study.stemWidthM)<1e-10);
    assert.ok(record.stemWidthM<record.capHeightM*.25,'Measured stem has accidentally included a crossbar');
    const face=mesh.primitives.at(-1),pos=values(pack,face.attributes.POSITION),uv=values(pack,face.attributes.TEXCOORD_0),norm=values(pack,face.attributes.NORMAL),indices=values(pack,face.indices),mat=pack.json.materials[face.material];
    assert.equal(mat.alphaMode,'OPAQUE');assert.equal(mat.emissiveFactor,undefined);
    assert.deepEqual(indices,[0,2,1,0,3,2]);assert.ok(norm.every((v,i)=>v===(i%3===2?-1:0)));
    assert.deepEqual(uv,[0,0,1,0,1,1,0,1]);assert.ok(pos[0]>pos[3]&&pos[1]>pos[7],'Reader-left image origin must be local +X and +Y on a -Z face');
    const[albedo,orm]=await Promise.all([image(pack,mat.pbrMetallicRoughness.baseColorTexture.index),image(pack,mat.pbrMetallicRoughness.metallicRoughnessTexture.index)]);
    assert.equal(albedo.info.width,record.textureSize[0]);assert.equal(albedo.info.height,record.textureSize[1]);
    assert.ok(orm.info.width<albedo.info.width,'Process masks should not consume full text-atlas resolution');
    if(variant==='fabricated'){assert.ok(mat.normalTexture);const normal=await image(pack,mat.normalTexture.index);assert.ok(normal.info.width<orm.info.width);}
    else assert.equal(mat.normalTexture,undefined,'Flat typography control must not gain fabricated normal response');
    resident+=record.mipGpuBytes;
    const mask=await sharp(`public/assets/lettering-study/${id}-${variant}-mask.png`).greyscale().raw().toBuffer();masks.push(mask);
    const seen=record.glyphs.filter(g=>g.character!==' ').map(g=>g.character).join('');assert.equal(seen,copy[id].replaceAll(' ',''));
    for(const glyph of record.glyphs.filter(g=>g.character!==' ')){
      let ink=0;for(let y=0;y<record.textureSize[1];y++)for(let x=Math.ceil(glyph.xPx);x<Math.min(record.textureSize[0],Math.floor(glyph.xPx+glyph.advancePx));x++)if(mask[y*record.textureSize[0]+x]>127)ink++;
      assert.ok(ink>15,`${id}: authored character ${glyph.character} has no printable coverage`);
    }
  }
  assert.deepEqual(masks[0],masks[1],`${id}: fabrication changed the controlled improved glyph layout`);
  assert.equal(letteringStudyInstance(id,'fabricated',{x:2,y:3,z:4}).x,2);
}
assert.ok(resident<7_000_000,`Comparison study resident mip budget exceeded: ${resident}`);
const near=projectedLetterMetrics({capHeightM:.2,strokeWidthM:.03,distanceM:3,verticalFovRadians:Math.PI/3,acquisitionHeightPx:480});
const far=projectedLetterMetrics({capHeightM:.2,strokeWidthM:.03,distanceM:6,verticalFovRadians:Math.PI/3,acquisitionHeightPx:480});
assert.equal(near.capHeightPx/2,far.capHeightPx);assert.ok(meetsLetteringSamplingTarget(near,{minCapPixels:12,minStrokePixels:1.5}));
assert.throws(()=>projectedLetterMetrics({distanceM:0}),RangeError);assert.throws(()=>letteringStudyMesh('unknown'),RangeError);
console.log(JSON.stringify({cases:2,variants:6,assetBytes:pack.bytes.length,comparisonResidentMipBytes:resident,codepointCoverage:'complete',readerCorrectUv:true,controlledMasksIdentical:true}));
