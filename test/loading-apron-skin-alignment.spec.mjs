import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseGlb,encodeGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {patchElevation,patchOpeningFrontage} from '../tools/chunk_surfer/repair-loading-apron-aperture.mjs';
import {LOADING_BAY_ACCESS} from '../src/data/loading-bay-access.js';

const assets=['conservatory-props','opening-street'].map(base=>({base,bytes:fs.readFileSync(`public/assets/${base}.glb`)}));
for(const asset of assets)asset.pack=parseGlb(asset.bytes);
function triangles(pack,name){
  const mesh=pack.json.meshes.find(m=>m.name===name),read=id=>{const a=pack.json.accessors[id],v=pack.json.bufferViews[a.bufferView],width=a.type==='SCALAR'?1:3,size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>pack.bin[method](start+i*(v.byteStride||width*size)+j*size)));};
  return mesh.primitives.flatMap(p=>{const v=read(p.attributes.POSITION),ids=read(p.indices).flat();return Array.from({length:ids.length/3},(_,i)=>ids.slice(i*3,i*3+3).map(j=>v[j]));});
}
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function ray(triangles,y,z){const origin=[-4.5,y,z-7.5],direction=[6,0,0];return triangles.some(([a,b,c])=>{const e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return false;const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)return false;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return false;const t=dot(e2,q)/det;return t>0&&t<1;});}
const skins=[triangles(assets[0].pack,'conservatory_west_elevation'),triangles(assets[1].pack,'opening_street_frontage')];

test('both actual packed apron skins clear every existing flight including body margins',()=>{
  // Test geometry independently of the new collision generator. The existing
  // runtime centres a logical half-metre cell by +.25m; include the .2m body.
  for(const bay of LOADING_BAY_ACCESS.bays)for(let lane=bay.z0;lane<bay.z1;lane+=.125)for(const side of[-.2,0,.2])for(const y of[.35,.85,1.45,2.0]){
    const z=lane+.25+side;
    for(const [index,skin]of skins.entries())assert.equal(ray(skin,y,z),false,`${bay.id}, centred Z${z}, Y${y}, skin ${index} must be actual air`);
  }
});

test('the opening has real jambs and a 5.5m head rather than a collision waiver',()=>{
  for(const [index,skin]of skins.entries()){
    assert.equal(ray(skin,1.5,3.25),true,`skin ${index}: north jamb`);
    assert.equal(ray(skin,1.5,12.7),true,`skin ${index}: south jamb`);
    assert.equal(ray(skin,5.525,7.5),true,`skin ${index}: header`);
  }
});

test('bounded repair is idempotent on both shipped packs and credits match exact bytes',()=>{
  const patches=[patchElevation,patchOpeningFrontage],sources=['build-props.mjs','build-opening-street.py'];
  assets.forEach((asset,i)=>{
    const result=patches[i](asset.pack,fs.readFileSync(`tools/chunk_surfer/${sources[i]}`,'utf8'));
    assert.deepEqual(encodeGlb(result.json,result.bin),asset.bytes);
    const credits=JSON.parse(fs.readFileSync(`public/assets/${asset.base}.credits.json`));
    assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(asset.bytes).digest('hex'));
  });
});

test('apron recipe accepts material renumbering but refuses any changed geometry or material identity',()=>{
  const source=fs.readFileSync('tools/chunk_surfer/build-props.mjs','utf8'),pack=assets[0].pack;
  const remapped={json:structuredClone(pack.json),bin:pack.bin},last=remapped.json.materials.length-1;
  remapped.json.materials.reverse();for(const mesh of remapped.json.meshes)for(const p of mesh.primitives)p.material=last-p.material;
  assert.equal(patchElevation(remapped,source),remapped,'equivalent material ordinals do not rewrite a byte');
  const changed={json:structuredClone(pack.json),bin:Buffer.from(pack.bin)},mesh=changed.json.meshes.find(m=>m.name==='conservatory_west_elevation');
  const a=changed.json.accessors[mesh.primitives[0].attributes.POSITION],v=changed.json.bufferViews[a.bufferView],offset=(v.byteOffset||0)+(a.byteOffset||0);
  changed.bin.writeFloatLE(changed.bin.readFloatLE(offset)+.025,offset);
  assert.throws(()=>patchElevation(changed,source),/differs from both exact reviewed recipes/,'a 25mm geometry change still refuses repair');
  const renamed={json:structuredClone(pack.json),bin:pack.bin},material=renamed.json.meshes.find(m=>m.name==='conservatory_west_elevation').primitives[0].material;
  renamed.json.materials[material].name='unknown replacement';
  assert.throws(()=>patchElevation(renamed,source),/differs from both exact reviewed recipes/,'geometry cannot silently change material identity');
});

test('historical aperture repair is preserved across the approved subsequent conservatory rebuild',()=>{
  const proof=JSON.parse(fs.readFileSync('artifacts/exterior-access-repairs/loading-apron-asset-repair.json'));
  // The approved conservatory rebuilds added civic, pub and yard geometry, then
  // reconciled ground skirting/dressing for the indoor greenhouse, then the
  // Lyric row frontage. The exact unchanged elevation/material bytes are proved
  // by the selective indoor and pub-row merge receipts.
  // Its new pack must not be mistaken for the
  // October 24 *historical* after-image. All other successor hashes are rejected.
  const approvedSuccessor={
    repair:'5dd24bec964c5a3e2e1d3ec259935dc0bb5b55c80190085da7afc346494d8023',
    current:'500fab6a1bb8f555026281715da5436430230e3225130c7bf2fd0e480f2b5200',
  };
  for(const asset of assets){const entry=proof.packs[asset.base];
    const currentSha=crypto.createHash('sha256').update(asset.bytes).digest('hex');
    const credits=JSON.parse(fs.readFileSync(`public/assets/${asset.base}.credits.json`));
    assert.equal(credits.pack.sha256,currentSha,`${asset.base} current credits bind its bytes`);
    const isRepairGeneration=currentSha===entry.afterSha256;
    if(!isRepairGeneration){
      assert.equal(asset.base,'conservatory-props','unexpected post-repair rebuild');
      assert.equal(entry.afterSha256,approvedSuccessor.repair,'historical repair witness must remain intact');
      assert.equal(currentSha,approvedSuccessor.current,'unreviewed conservatory pack needs its own provenance approval');
      for(const name of ['conservatory_west_elevation','exterior_pub_frontage','arrival_civic_boundary','arrival_civic_bench'])
        assert.ok(asset.pack.json.meshes.some(mesh=>mesh.name===name),`${name} is in the approved successor`);
      // The preceding test proves that the *current* elevation is already the
      // exact repair recipe, without altering a byte of the published pack.
    }else{
      // These fingerprints and image hashes describe the precise repair-time
      // generation, not unrelated additions in a newer conservatory rebuild.
      for(const[name,fingerprint]of Object.entries(entry.unrelatedMeshFingerprints))
        assert.equal(meshFingerprint(asset.pack,asset.pack.json.meshes.find(m=>m.name===name)),fingerprint,name);
      const hashes=(asset.pack.json.images||[]).map(image=>{const v=asset.pack.json.bufferViews[image.bufferView];return crypto.createHash('sha256').update(asset.pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex');});
      assert.deepEqual(hashes,entry.embeddedImageHashes);
    }
    for(const flag of['materialsUnchanged','nodesUnchanged','texturesUnchanged'])assert.equal(entry[flag],true);
  }
});
