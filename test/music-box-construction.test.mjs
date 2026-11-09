import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMusicBoxModel,MUSIC_BOX_CONSTRUCTION,MUSIC_BOX_MATERIALS} from '../tools/chunk_surfer/lib/music-box-model.mjs';
import {buildMusicBoxItem} from '../tools/chunk_surfer/build-music-box-item.mjs';
const intact=buildMusicBoxModel(),damaged=buildMusicBoxModel({damaged:true});
test('the closed coated shell has correct dimensions and genuinely outward normals',()=>{
 const shell=intact.body.find(g=>g.material==='plastic'),centre=[0,.023,0],min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);
 for(let i=0;i<shell.positions.length;i+=3){let dot=0;for(let k=0;k<3;k++){const p=shell.positions[i+k];min[k]=Math.min(min[k],p);max[k]=Math.max(max[k],p);dot+=(p-centre[k])*shell.normals[i+k];}assert.ok(dot>0,'shell normal must face away from the body');}
 for(let k=0;k<3;k++)assert.ok(Math.abs(max[k]-min[k]-MUSIC_BOX_CONSTRUCTION.dimensions[k])<1e-7);
 const print=intact.body.find(g=>g.material==='portrait');assert.ok(print.normals.filter((_,i)=>i%3===2).every(z=>z===1));
});
test('case remains closed after impact and the same oval key is a separate moving part',()=>{
 assert.equal(intact.features.casingClosed,true);assert.equal(damaged.features.casingClosed,true);assert.equal(intact.features.dimensionsProvisional,true);
 assert.deepEqual(intact.features.keyPivot,damaged.features.keyPivot);assert.deepEqual(intact.features.keyAxis,[0,0,1]);
 assert.notDeepEqual(damaged.body.find(g=>g.material==='plastic').positions,intact.body.find(g=>g.material==='plastic').positions);
 const before=intact.body.find(g=>g.material==='plastic').positions,after=damaged.body.find(g=>g.material==='plastic').positions;
 assert.ok(Math.max(...before.filter((_,i)=>i%3===0).map((v,i)=>v-after[i*3]))>.003,'impact compresses the existing corner enough to read at gameplay scale');
 assert.equal(intact.body.some(g=>g.material==='boxImpactUndercoat'),false);assert.ok(damaged.body.some(g=>g.material==='boxImpactUndercoat'));
 assert.notDeepEqual(damaged.key[0].positions,intact.key[0].positions);
 assert.equal(intact.body.some(g=>g.material==='brassKey'),false);assert.ok(intact.key.some(g=>g.material==='brassKey'));
 assert.ok(intact.body.some(g=>g.material==='boxBack'));assert.ok(intact.body.some(g=>g.material==='boxScrew'));
 for(const model of[intact,damaged])for(const g of[...model.body,...model.key]){assert.ok(g.indices.length>0);assert.equal(g.uvs.length,g.positions.length/3*2);assert.equal(g.normals.length,g.positions.length);assert.ok([...g.positions,...g.normals,...g.uvs].every(Number.isFinite));for(let i=0;i<g.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-5);}
});
test('the actual inspection export shares canonical geometry and lit non-emissive material maps',async()=>{
 const result=await buildMusicBoxItem({write:false}),size=result.bytes.readUInt32LE(12),doc=JSON.parse(result.bytes.subarray(20,20+size).toString());
 assert.deepEqual(doc.meshes.map(m=>m.name),['music_box_body','music_box_key']);assert.equal(doc.images.length,doc.materials.length*3);
 assert.ok(doc.materials.every(m=>!m.emissiveFactor&&!m.emissiveTexture));
 assert.ok(doc.materials.every(m=>m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture));
 assert.deepEqual(doc.nodes[0].extras.dimensionsMetres,MUSIC_BOX_CONSTRUCTION.dimensions);
});
