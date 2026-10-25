import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset} from '../src/render/character-asset.js';
import {STREET_CROWD_DESIGNS as DESIGNS} from '../src/data/street-crowd-characters.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../src/data/source-last-reception-resident-rigs.js';
import {rigid,streetCrowdFacing,streetCrowdFrontOpening} from '../tools/chunk_surfer/characters/street-crowd-library.mjs';
const bytes=fs.readFileSync(new URL('../public/assets/street-crowd-characters.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const makeCloth=()=>{const p=[],indices=[],cols=8,rows=12;for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){p.push([(k/cols-.5)*.30,.9+j/rows*.60,-.14]);if(j&&k){const a=(j-1)*(cols+1)+k-1;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}}return rigid('sewn test panel',p,indices);};
test('sewn facings add real 2.2 mm edge thickness after simplification without moving the outside',()=>{
 const cloth=makeCloth(),before=structuredClone(cloth),out=streetCrowdFacing(cloth);
 assert.deepEqual(cloth,before);assert.deepEqual(out.positions.slice(0,cloth.positions.length),cloth.positions);assert.deepEqual(out.indices.slice(0,cloth.indices.length),cloth.indices);
 assert.equal(out.facing.thickness,.0022);assert.equal(out.facing.returnEdges,40);assert.ok(out.facing.liningTriangles>0&&out.facing.liningTriangles<cloth.indices.length/3/2,'the invisible lining is limited to edge facings');
 const count=cloth.positions.length/3;for(let v=count;v<out.positions.length/3;v++){const p=out.positions.slice(v*3,v*3+3);let nearest=Infinity;for(let i=0;i<count;i++)nearest=Math.min(nearest,Math.hypot(...p.map((n,a)=>n-cloth.positions[i*3+a])));assert.ok(Math.abs(nearest-.0022)<1e-9,'every facing follows its own finished outer vertex rather than the decimated opposite sheet');}
});
test('an open cardigan has actual clipped cloth edges and normalized interpolated bone weights',()=>{
 const cloth=makeCloth(),before=structuredClone(cloth),out=streetCrowdFrontOpening(cloth,.026);
 assert.deepEqual(cloth,before);assert.equal(out.frontOpening.halfWidth,.026);
 for(let i=0;i<out.indices.length;i+=3){const xs=out.indices.slice(i,i+3).map(v=>out.positions[v*3]);assert.ok(xs.every(x=>x<=-.026+1e-9)||xs.every(x=>x>=.026-1e-9),'no triangle bridges the real front opening');}
 assert.ok(out.positions.some((n,i)=>i%3===0&&Math.abs(Math.abs(n)-.026)<1e-9),'front edges are clipped at their actual intersections');
 for(let v=0;v<out.positions.length/3;v++)assert.ok(Math.abs(out.skinWeight.slice(v*4,v*4+4).reduce((a,b)=>a+b,0)-1)<1e-9);
});
test('every ordinary crowd member exports fitted anatomical tailoring instead of the distorted ghost coat',()=>{
 const sources=new Set(),postures=new Set();
 for(const entry of asset.entries){const d=Object.values(DESIGNS).find(d=>d.mesh===entry.name),t=entry.extras.tailoring;assert.ok(d&&t);assert.ok(t.restError<1e-4);if(t.drape.cutY-t.drape.hemY>1e-5)assert.ok(t.drape.panelRows>=2&&t.drape.rimVertices>=12);else assert.equal(t.drape.panelRows,0,'cropped jackets keep their native short body rather than compressing a coat skirt');assert.ok(t.envelopeFit.posed&&t.envelopeFit.poses>=2);assert.equal(t.posture,d.posture);assert.ok(t.facing.returnEdges>20&&t.facing.outerTriangles>1000);assert.equal(t.facing.thickness,.0022);sources.add(t.source);postures.add(t.posture);
  assert.ok(entry.extras.parts.some(n=>n===`anatomically fitted ${d.wardrobe} set-in sleeves and sewn hanging panels`));assert.ok(!entry.extras.parts.some(n=>/^option2-/.test(n)&&/coat|closure|hem-binding/.test(n)),'deliberately swollen/misfastened donor coat leaked back into ordinary people');
  if(d.wardrobe==='cardigan')assert.equal(entry.extras.parts.filter(n=>n==='cardigan sewn open-front rib binding').length,2);
  for(const primitive of entry.primitives){for(let v=0;v<primitive.vertexCount;v++){const n=Math.hypot(...primitive.normals.slice(v*3,v*3+3));assert.ok(Math.abs(n-1)<2e-5,'the exported authored/held surfaces retain unit normals under nonuniform proportions');}}
 }
 assert.deepEqual([...sources].sort(),['male_casualsuit01','male_elegantsuit01']);assert.deepEqual([...postures].sort(),['seated','standing']);
});
test('standing coat backs fit an ordinary human torso rather than a 24 cm ghost barrel',()=>{
 let samples=0;
 for(const entry of asset.entries){const d=Object.values(DESIGNS).find(d=>d.mesh===entry.name);if(d.posture==='seated')continue;const bones=RIGS[d.source],chestY=bones.find(b=>b.name==='chest').head[1],coat=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='coat');let back=-Infinity,vertices=0;
  for(let v=0;v<coat.vertexCount;v++){const y=coat.positions[v*3+1];if(y<chestY-.15||y>chestY-.035)continue;let arm=0;for(let k=0;k<4;k++)if(/^(upperarm|forearm|hand)/.test(bones[coat.joints[v*4+k]]?.name||''))arm+=coat.weights[v*4+k];if(arm>.20)continue;back=Math.max(back,coat.positions[v*3+2]);vertices++;}
  assert.ok(vertices>15);assert.ok(back<.19,`${d.id} regressed to the balloon-backed donor (${back} m)`);samples++;
 }
 assert.equal(samples,17);
});
test('every fabric uses physical UVs and shared, mipmapped pigment/normal/ORM rather than flat plastic',()=>{
 const kinds=new Set();let triangles=0;
 for(const entry of asset.entries)for(const p of entry.primitives){const m=asset.json.materials[p.material],kind=m.extras.fabric;if(!kind)continue;kinds.add(kind);assert.ok(p.uv?.length===p.vertexCount*2);assert.equal(m.extras.repeatPerMeter,12.5);assert.equal(m.pbrMetallicRoughness.metallicFactor,0);assert.ok(m.normalTexture.scale>0&&m.normalTexture.scale<.3);
  for(const map of[m.pbrMetallicRoughness.baseColorTexture,m.pbrMetallicRoughness.metallicRoughnessTexture,m.normalTexture]){const texture=asset.json.textures[map.index],image=asset.json.images[texture.source],sampler=asset.json.samplers[texture.sampler];assert.equal(image.mimeType,'image/png');assert.ok(asset.json.bufferViews[image.bufferView].byteLength>100);assert.equal(sampler.minFilter,9987);assert.equal(sampler.wrapS,10497);assert.equal(sampler.wrapT,10497);}
  for(let i=0;i<p.indices.length;i+=3){const[a,b,c]=Array.from(p.indices.slice(i,i+3)),uv=v=>p.uv.slice(v*2,v*2+2),x=uv(a),y=uv(b),z=uv(c),area=Math.abs((y[0]-x[0])*(z[1]-x[1])-(z[0]-x[0])*(y[1]-x[1]));if(area>1e-10)triangles++;}
 }
 assert.deepEqual([...kinds].sort(),['canvas','wax','wool']);assert.equal(asset.json.images.length,9,'three complete fabric sets are shared by all twenty identities');assert.ok(triangles>100000);
});
