import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {INSTITUTION_POSTER_DESIGNS as designs,INSTITUTION_POSTER_MESHES as names,institutionPoster} from '../src/data/institution-posters.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';

const bytes=fs.readFileSync('public/assets/institution-posters.glb');
const stats=JSON.parse(fs.readFileSync('public/assets/institution-posters.stats.json','utf8'));
const artwork=JSON.parse(fs.readFileSync('public/assets/institution-posters/artwork.json','utf8'));
const len=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+len).toString().trim()),bin=bytes.subarray(28+len);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const imageBytes=index=>{const i=gltf.images[index],v=gltf.bufferViews[i.bufferView];return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
const attribute=index=>{const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],at=(v.byteOffset||0)+(a.byteOffset||0),n={SCALAR:1,VEC2:2,VEC3:3}[a.type],stride=v.byteStride||n*4;return Array.from({length:a.count*n},(_,i)=>bin.readFloatLE(at+Math.floor(i/n)*stride+(i%n)*4));};

test('the standalone print catalogue is current, bounded and preserves all designed variants',()=>{
 assert.equal(bytes.subarray(0,4).toString(),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.equal(hash(bytes),stats.sha256);assert.equal(stats.bytes,bytes.length);
 assert.ok(stats.bytes<20e6&&stats.triangles<10000&&stats.estimatedMipmappedTextureBytes<80*1024*1024);
 assert.deepEqual(gltf.meshes.map(m=>m.name),names);
 for(const[path,sha]of Object.entries(stats.inputHashes))assert.equal(hash(fs.readFileSync(path)),sha,`Stale poster input ${path}`);
 assert.equal(designs.length,15);assert.equal(new Set(designs.map(d=>d.id)).size,15);
 assert.equal(institutionPoster('missing'),null);
 assert.ok(designs.some(d=>d.kind==='student-notice')&&designs.filter(d=>d.kind==='season-programme').length===2);
 assert.deepEqual(designs.filter(d=>d.experimental).map(d=>d.id),['loudspeakers','live_electronics','tape','new_works','graphic_score','prepared']);
 assert.equal(gltf.animations,undefined);assert.equal(gltf.skins,undefined);assert.equal(gltf.extensionsUsed,undefined);
});

test('posters use ordinary opaque pigment coverage with material response, without emission or transparency',()=>{
 const mats=gltf.materials.filter(m=>m.extras?.printedSurface);
 assert.equal(mats.length,designs.length);
 for(const m of mats){
  assert.equal(m.alphaMode||'OPAQUE','OPAQUE');assert.equal(m.emissiveFactor,undefined);
  assert.equal(printedSurfaceDescriptor(m.extras.printedSurface).coverage,'baseColorAlpha');
  assert.ok(Number.isInteger(m.pbrMetallicRoughness.baseColorTexture.index));
  assert.ok(Number.isInteger(m.pbrMetallicRoughness.metallicRoughnessTexture.index));
  assert.ok(Number.isInteger(m.normalTexture.index));
  assert.equal(m.extras.letteringFinish.profile,'paper-print');
  for(const index of[m.pbrMetallicRoughness.baseColorTexture.index,m.pbrMetallicRoughness.metallicRoughnessTexture.index,m.normalTexture.index]){
   const sampler=gltf.samplers[gltf.textures[index].sampler];assert.equal(sampler.wrapS,33071);assert.equal(sampler.wrapT,33071);
  }
 }
});

test('real printed RGB survives clear pigment pixels and retains full ink plus antialiased edges',async()=>{
 for(const m of gltf.materials.filter(m=>m.extras?.printedSurface)){
  const image=gltf.textures[m.pbrMetallicRoughness.baseColorTexture.index].source;
  const {data,info}=await sharp(imageBytes(image)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let stock=0,ink=0,edge=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]===0&&data[i]+data[i+1]+data[i+2]>60)stock++;if(data[i+3]===255)ink++;if(data[i+3]>0&&data[i+3]<255)edge++;}
  assert.ok(stock>info.width*info.height*.10,`${m.name} loses its unpremultiplied stock`);
  assert.ok(ink>500&&edge>100,`${m.name} loses printed letters or their coverage`);
 }
});

test('flat inserts have reader-facing geometry, while taped paper has a physically supported free edge',()=>{
 for(const d of designs){
  const flat=gltf.meshes.find(m=>m.name===d.flatMesh),taped=gltf.meshes.find(m=>m.name===d.tapedMesh);
  const p=attribute(flat.primitives[0].attributes.POSITION),n=attribute(flat.primitives[0].attributes.NORMAL);
  assert.ok(n.every((v,i)=>i%3===2?v>.999:Math.abs(v)<1e-6));
  assert.ok(Math.abs(Math.max(...p.filter((_,i)=>i%3===0))-d.widthM/2)<1e-6);
  const q=attribute(taped.primitives[0].attributes.POSITION),z=q.filter((_,i)=>i%3===2);
  assert.ok(Math.min(...z)>=0&&Math.max(...z)>.007&&Math.max(...z)<.009);
  const top=[],bottom=[];
  for(let i=0;i<q.length;i+=3){if(Math.abs(q[i+1]-d.heightM/2)<1e-6)top.push(q[i+2]);if(Math.abs(q[i+1]+d.heightM/2)<1e-6)bottom.push(q[i+2]);}
  assert.ok(Math.max(...top)<.001&&Math.max(...bottom)>.007,'The unsupported lower edge, rather than taped upper corners, should lift');
  assert.equal(taped.primitives.length,4,'Two real tape fixings retain the sheet');
 }
 const holder=gltf.meshes.find(m=>m.name==='institution_poster_case');
 assert.deepEqual(holder.extras.apertureM,[.62,.88]);assert.deepEqual(holder.extras.paperCenter,[0,0,.027]);
 assert.ok(!holder.primitives.some(p=>gltf.materials[p.material].extras?.printedSurface),'The carrier cannot become an opaque glass overlay');
});

test('institutional hierarchies use pinned fonts and fictional programme copy without game instructions',()=>{
 assert.ok(Object.keys(artwork.fonts).length>=5);
 const registered=JSON.parse(fs.readFileSync('assets/fonts/manifest.json','utf8'));
 for(const [name,sha]of Object.entries(artwork.fonts)){
  const path=name==='NimbusSansNarrow-Bold.otf'?`tools/chunk_surfer/lettering/fonts/${name}`:`assets/fonts/${name}`;
  assert.equal(hash(fs.readFileSync(path)),sha);
  if(name!=='NimbusSansNarrow-Bold.otf')assert.ok(Object.values(registered.families).some(f=>Object.values(f.faces).some(v=>v.file===name&&v.sha256===sha)));
 }
 const copy=artwork.designs.flatMap(d=>d.regions.map(r=>r.copy)).join('\n');
 assert.doesNotMatch(copy,/press [A-Z]|interact|quest|objective|\b20\d\d\b/i);
 assert.match(copy,/MUSIC FOR EVERYONE/);assert.match(copy,/THE LYRIC|LYRIC/);
 assert.match(copy,/ELECTROACOUSTIC/);assert.match(copy,/NEW MUSIC/);
 const experimental=artwork.designs.filter(d=>d.experimental);
 for(const id of['loudspeakers','live_electronics','tape','new_works','graphic_score','prepared']){
  const d=experimental.find(p=>p.id===id);assert.ok(d&&d.pixels[0]===704&&d.materialPixels[0]===192);
  assert.ok(d.regions.some(r=>r.capHeightM>.045),'The experimental series needs a real title-scale printed region');
 }
 for(const d of artwork.designs){assert.ok(d.regions.length>5);assert.equal(d.fontSubstitution,false);assert.equal(d.lightingBaked,false);assert.equal(d.paperFinish.bakedLighting,false);}
});
