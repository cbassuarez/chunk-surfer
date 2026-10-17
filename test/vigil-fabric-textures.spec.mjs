import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {canonicalAnatomy,retargetMesh} from '../tools/chunk_surfer/characters/vigil-tailoring.mjs';
import {retainedBody,fittedProxyGarment,fitClothToEnvelope} from '../tools/chunk_surfer/characters/vigil-body-fit.mjs';
import {extendOuterwear} from '../tools/chunk_surfer/characters/vigil-garment-drape.mjs';
import {VIGIL_CHARACTER_DESIGNS} from '../src/data/vigil-character-design.js';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {vigilFabricTextures,fabricUV} from '../tools/chunk_surfer/characters/vigil-fabric-textures.mjs';
// Decode the actual file bytes independently. A valid-looking header alone
// cannot catch truncated IDAT streams, invalid CRCs or the wrong channel pack.
function decode(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);const compressed=[];let at=8,width,height,ended=false;
 while(at<bytes.length){const size=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+size),end=at+8+size;let crc=0xffffffff;for(const b of bytes.subarray(at+4,end)){crc^=b;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}assert.equal((crc^0xffffffff)>>>0,bytes.readUInt32BE(end),'corrupt PNG '+type);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.deepEqual([...data.subarray(8)],[8,2,0,0,0]);}if(type==='IDAT')compressed.push(data);if(type==='IEND'){ended=true;assert.equal(end+4,bytes.length);}at=end+4;}
 assert.ok(ended);assert.equal(width,256);assert.equal(height,256);const raw=zlib.inflateSync(Buffer.concat(compressed)),pixels=Buffer.alloc(width*height*3);assert.equal(raw.length,height*(width*3+1));for(let y=0;y<height;y++){assert.equal(raw[y*(width*3+1)],0,'unexpected PNG row filter');raw.copy(pixels,y*width*3,y*(width*3+1)+1,(y+1)*(width*3+1));}return pixels;
}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),proof=[],unique=new Set();
for(const kind of['wax','quilt','wool','canvas']){
 const files=vigilFabricTextures(kind),again=vigilFabricTextures(kind);for(const map of['albedo','normal','orm'])assert.deepEqual(files[map],again[map],kind+' '+map+' is not deterministic');
 const albedo=decode(files.albedo),normal=decode(files.normal),orm=decode(files.orm);let min=255,max=0,rough=0,normalEnergy=0,nonflat=0;
 for(let i=0;i<albedo.length;i+=3){assert.equal(albedo[i],albedo[i+1]);assert.equal(albedo[i],albedo[i+2],'fabric must preserve the authored garment tint');min=Math.min(min,albedo[i]);max=Math.max(max,albedo[i]);const n=normal.subarray(i,i+3).map(v=>v);const x=n[0]/255*2-1,y=n[1]/255*2-1,z=n[2]/255*2-1;assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.008,kind+' normal is not unit length');assert.ok(z>.86,kind+' weave normal is too harsh');normalEnergy+=x*x+y*y;if(Math.abs(x)>.01||Math.abs(y)>.01)nonflat++;assert.ok(orm[i]>=247,'AO introduces dark stains');assert.equal(orm[i+2],0,'cloth is not metallic');rough+=orm[i+1];}
 const count=256*256;assert.ok(min>=230&&max<=255&&max-min>=5&&max-min<=20,kind+' albedo is too dark, flat or noisy');assert.ok(nonflat>count*.90,kind+' lacks woven relief');const strength=Math.sqrt(normalEnergy/count)*files.normalScale;assert.ok(strength>.01&&strength<.09,kind+' weave normal overwhelms the final material');assert.equal(files.roughness,1,'ORM must carry absolute roughness');
 // Compare wrap seams with ordinary adjacent texels; a tiled material should
 // not acquire a special high-contrast border at the repeat boundary.
 let seam=0,interior=0;for(let y=0;y<256;y++)seam+=Math.abs(albedo[(y*256)*3]-albedo[(y*256+255)*3]);for(let y=0;y<256;y++)for(let x=1;x<256;x++)interior+=Math.abs(albedo[(y*256+x)*3]-albedo[(y*256+x-1)*3]);assert.ok(seam/256<=interior/(256*255)*1.7+.5,kind+' has a visible tiling seam');
 unique.add(hash(files.albedo));proof.push({kind,albedoRange:[min,max],roughnessMean:+(rough/count/255).toFixed(3),normalRms:+strength.toFixed(4)});files.albedo[0]=0;assert.equal(vigilFabricTextures(kind).albedo[0],137,'public buffers poisoned the cached source');
}
assert.equal(unique.size,4,'the fabric directions collapsed to the same texture');assert.ok(proof.find(p=>p.kind==='wax').roughnessMean<proof.find(p=>p.kind==='quilt').roughnessMean);assert.ok(proof.find(p=>p.kind==='quilt').roughnessMean<proof.find(p=>p.kind==='canvas').roughnessMean);assert.ok(proof.find(p=>p.kind==='canvas').roughnessMean<proof.find(p=>p.kind==='wool').roughnessMean);assert.throws(()=>vigilFabricTextures('leather'),/Unknown vigil fabric/);

// A sealed cylinder exercises both the longitudinal wrap seam and sewn return
// faces. The latter used to collapse planar UVs and normal-map tangents.
const mesh={positions:[],normals:[],indices:[],skinIndex:[],skinWeight:[]},segments=24;
for(const y of[.9,1.25])for(let i=0;i<segments;i++){const angle=i*Math.PI*2/segments,x=Math.sin(angle)*.20,z=-Math.cos(angle)*.20;mesh.positions.push(x,y,z);mesh.normals.push(Math.sin(angle),0,-Math.cos(angle));mesh.skinIndex.push(0,0,0,0);mesh.skinWeight.push(1,0,0,0);}
for(let i=0;i<segments;i++){const next=(i+1)%segments;mesh.indices.push(i,next,segments+next,i,segments+next,segments+i);}for(const[ring,y,sign]of[[0,.9,-1],[segments,1.25,1]]){const center=mesh.positions.length/3;mesh.positions.push(0,y,0);mesh.normals.push(0,sign,0);mesh.skinIndex.push(0,0,0,0);mesh.skinWeight.push(1,0,0,0);for(let i=0;i<segments;i++)mesh.indices.push(center,ring+i,ring+(i+1)%segments);}
const bones=[{name:'pelvis',head:[0,.9,0],tail:[0,1,0]},{name:'chest',head:[0,1.2,0],tail:[0,1.3,0]}],before=structuredClone(mesh),mapped=fabricUV(mesh,bones),det=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert.deepEqual(mesh,before,'UV packing changed the fitted source');assert.ok(mapped.positions.length>mesh.positions.length,'UV seams were not split');assert.equal(mapped.indices.length,mesh.indices.length);assert.equal(mapped.uv.length,mapped.positions.length/3*2);
for(let i=0;i<mesh.indices.length;i++){const source=mesh.indices[i],target=mapped.indices[i];assert.deepEqual(mapped.positions.slice(target*3,target*3+3),mesh.positions.slice(source*3,source*3+3));assert.deepEqual(mapped.normals.slice(target*3,target*3+3),mesh.normals.slice(source*3,source*3+3));assert.deepEqual(mapped.skinIndex.slice(target*4,target*4+4),mesh.skinIndex.slice(source*4,source*4+4));assert.deepEqual(mapped.skinWeight.slice(target*4,target*4+4),mesh.skinWeight.slice(source*4,source*4+4));}
for(let i=0;i<mapped.indices.length;i+=3){const uv=mapped.indices.slice(i,i+3).map(id=>mapped.uv.slice(id*2,id*2+2));assert.ok(Math.abs(det(...uv))>1e-5,'normal-map tangent basis collapsed');if(i<segments*6)assert.ok(Math.max(...uv.map(p=>p[0]))-Math.min(...uv.map(p=>p[0]))<1,'a wrap seam interpolates across the entire cloth cylinder');}
assert.throws(()=>fabricUV(mesh,bones,{repeatPerMeter:0}),/positive/);
// Real long-coat and bent-sleeve assets exercise clamped cylinder endpoints.
// Those patches had zero UV area even though their geometric triangles were
// valid; a synthetic torso cylinder alone cannot reproduce the shoulder case.
const uvProof=[],subtract=(a,b)=>a.map((v,i)=>v-b[i]),cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
for(const id of['ruth','kit']){
 const design=VIGIL_CHARACTER_DESIGNS[id],source=canonicalAnatomy(JSON.parse(fs.readFileSync(new URL(design.source==='woman'?'../artifacts/bus-woman-production/anatomy.json':'../public/assets/recordist-characters/contractor.json',import.meta.url)))),body=retainedBody(source,design),proxy=fittedProxyGarment(source,design,id==='ruth'?'male_elegantsuit01':'male_casualsuit01'),envelope={...body,positions:[...body.positions],indices:[...body.indices],skinIndex:[...body.skinIndex],skinWeight:[...body.skinWeight]};
 for(const native of source.meshes.filter(m=>/trousers/.test(m.name))){const m=retargetMesh(native,source,source,design),offset=envelope.positions.length/3;envelope.positions.push(...m.positions);envelope.indices.push(...m.indices.map(v=>v+offset));envelope.skinIndex.push(...m.skinIndex);envelope.skinWeight.push(...m.skinWeight);}
 const poses=[vigilCharacterPose(id,{rig:body.bones}),vigilCharacterPose(id,{rig:body.bones,action:'weight-shift',progress:.5}),vigilCharacterPose(id,{rig:body.bones,action:id==='ruth'?'binder-page':'camera-check',progress:.5})],coat=fitClothToEnvelope(extendOuterwear(proxy,body.bones,design,{body:envelope}),envelope,{ease:.012,poses,bones:body.bones}),textured=fabricUV(coat,body.bones);let minDensity=Infinity,triangles=0;
 assert.equal(textured.indices.length,coat.indices.length);assert.ok(textured.positions.length<coat.positions.length*2,'fabric UVs exceed the character vertex budget');
 for(let i=0;i<textured.indices.length;i+=3){const ids=textured.indices.slice(i,i+3),p=ids.map(v=>textured.positions.slice(v*3,v*3+3)),uv=ids.map(v=>textured.uv.slice(v*2,v*2+2)),area=Math.hypot(...cross3(subtract(p[1],p[0]),subtract(p[2],p[0])));for(let corner=0;corner<3;corner++)assert.deepEqual(p[corner],coat.positions.slice(coat.indices[i+corner]*3,coat.indices[i+corner]*3+3),'fabric packing moved real cloth');if(area<1e-12)continue;const density=Math.abs(det(...uv))/area/12.5**2;minDensity=Math.min(minDensity,density);assert.ok(density>.045,id+' has a collapsed or poorly conditioned normal-map tangent');triangles++;}
 uvProof.push({id,vertices:textured.positions.length/3,triangles,minimumRelativeUVArea:+minDensity.toFixed(3),planarFallbacks:textured.fabricUV.fallbackTriangles});
}
console.log('vigil fabric texture specs passed '+JSON.stringify({textures:proof,uv:uvProof}));
