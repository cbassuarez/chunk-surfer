import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {BOOTH_GUARD_ASSET} from '../src/data/booth-guard-rig.js';
import {boothGuardRenderInstance} from '../src/game/booth-presentation.js';
import {boothGuardDescriptor} from '../src/render/booth-guard-performance.js';
const load=path=>{const b=fs.readFileSync(new URL(path,import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const asset=load('../public/assets/guard-presentations.glb'),original=load('../public/assets/outskirts-characters.glb');
const ordinary=asset.entries.find(e=>e.name==='overworld_booth_guard'),source=asset.entries.find(e=>e.name==='outskirts_fold_guard'),retained=original.entries.find(e=>e.name==='outskirts_fold_guard');
const mat=(a,p)=>a.json.materials[p.material],role=(a,e,r)=>e.primitives.filter(p=>mat(a,p).extras?.characterRole===r);
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');

test('guard derivatives preserve the original character pack, rig and body performance',()=>{
  assert.equal(hash(fs.readFileSync(new URL('../public/assets/outskirts-characters.glb',import.meta.url))),BOOTH_GUARD_ASSET.sha256);
  assert.deepEqual(asset.entries.map(e=>e.name).sort(),['outskirts_fold_guard','overworld_booth_guard']);
  for(const e of[ordinary,source]){
    assert.equal(e.skin.joints.length,34);assert.equal(e.morphCount,4);
    for(const clip of['idle','fold','writhe'])for(const time of[0,.6,1.8,2.55,9]){
      const a=sampleCharacterPose(asset,e,{clip,time,loop:false}),b=sampleCharacterPose(original,retained,{clip,time,loop:false});
      assert.deepEqual(a.bones,b.bones,`${e.name} changes the original ${clip} bones`);
      assert.ok([...a.bones,...a.bounds.min,...a.bounds.max].every(Number.isFinite));
    }
    for(const name of['workcoat_guard','leather','sole']){
      const p=e.primitives.find(p=>mat(asset,p).name===name),q=retained.primitives.find(p=>mat(original,p).name===name);
      assert.deepEqual(p.positions,q.positions,`${name} anatomy changed`);assert.deepEqual(p.indices,q.indices,`${name} topology changed`);
    }
  }
});

test('the overworld keeps ordinary eyes and facial skin under an actual head-rigged cap',()=>{
  const eyes=ordinary.primitives.filter(p=>/^anatomical_eyes/.test(mat(asset,p).name));
  assert.equal(eyes.reduce((n,p)=>n+p.indices.length,0),retained.primitives.find(p=>mat(original,p).name==='anatomical_eyes').indices.length);
  const skin=ordinary.primitives.filter(p=>/^skin_guard/.test(mat(asset,p).name));
  assert.equal(skin.reduce((n,p)=>n+p.indices.length,0),retained.primitives.find(p=>mat(original,p).name==='skin_guard').indices.length,'shadow removes ordinary facial anatomy');
  assert.equal(role(asset,ordinary,'facial-absence').length,0);
  const shaded=role(asset,ordinary,'guard-cap-shadow');assert.ok(shaded.length>=3);
  assert.ok(shaded.every(p=>mat(asset,p).extras.bakedBrimOcclusion&&mat(asset,p).pbrMetallicRoughness.baseColorFactor.slice(0,3).every(v=>v>0&&v<.13)));
  for(const e of[ordinary]){
    const peak=role(asset,e,'guard-cap-underside')[0];assert.ok(peak);
    const z=Array.from(peak.positions).filter((_,i)=>i%3===2),y=Array.from(peak.positions).filter((_,i)=>i%3===1);
    assert.ok(Math.min(...z)<-.27,'peak does not project in front of the face');
    assert.ok(Math.max(...y)-Math.min(...y)>.025,'peak has no curved thickness');
    for(let i=0;i<peak.vertexCount;i++){assert.equal(peak.joints[i*4],6);assert.equal(peak.weights[i*4],1);}
  }
});

test('Source uses the existing Squals-reference cavity topology and exact light-absorbing stock',()=>{
  assert.ok(!source.primitives.some(p=>/eyes/.test(mat(asset,p).name)));
  assert.ok(!source.primitives.some(p=>/^guard-(cap|cap-underside|cap-band)$/.test(mat(asset,p).extras?.characterRole||'')),'a new cap hides the Source aperture');
  const boy=JSON.parse(fs.readFileSync(new URL('../public/assets/recordist-characters/boy.json',import.meta.url)));
  const bowl=role(asset,source,'facial-absence')[0],rim=role(asset,source,'facial-rim')[0];assert.ok(bowl&&rim);
  assert.equal(bowl.indices.length,boy.meshes.find(m=>m.name==='boy-closed-facial-absence').indices.length);
  assert.equal(rim.indices.length,boy.meshes.find(m=>m.name==='boy-receding-aperture-rim').indices.length);
  const stock=mat(asset,bowl).pbrMetallicRoughness;assert.deepEqual(stock.baseColorFactor,[0,0,0,1]);assert.equal(stock.roughnessFactor??1,1);assert.equal(stock.metallicFactor??1,1);
  const z=Array.from(bowl.positions).filter((_,i)=>i%3===2);assert.ok(Math.max(...z)-Math.min(...z)>.03,'absence is a flat black plane');
  // A projected ray through the middle must meet the bowl, never an old nose,
  // eye or mouth in front of it. This catches a black patch over intact anatomy.
  for(const skin of source.primitives.filter(p=>['skin_guard','short_hair'].includes(mat(asset,p).name)))for(let i=0;i<skin.indices.length;i+=3){const ids=skin.indices.subarray(i,i+3),c=[0,0,0];for(const id of ids)for(let k=0;k<3;k++)c[k]+=skin.positions[id*3+k]/3;
    if(c[2]<-.06)assert.ok((c[0]/.0624)**2+((c[1]-1.67)/.08976)**2>=1.1199,'old face remains in aperture');
  }
  assert.ok(asset.json.extras.guardPresentations.variants.source.removedFacialTriangles>5000);
});

test('the presentation switch changes only the existing three overworld booth bodies',()=>{
  for(const pose of['idle','ledger','handoff']){
    const instance={id:'yard-booth-guard-'+pose,mesh:'yard_booth_guard_'+pose,x:10,y:0,z:20,yaw:-Math.PI/2};
    const result=boothGuardRenderInstance(instance);assert.equal(result.mesh,'overworld_booth_guard');assert.deepEqual(result.character,boothGuardDescriptor({pose}));assert.equal(result.fallbackMesh,instance.mesh);
  }
  const elsewhere={id:'r6-booth-guard',mesh:'outskirts_fold_guard'};assert.equal(boothGuardRenderInstance(elsewhere),elsewhere);
});
