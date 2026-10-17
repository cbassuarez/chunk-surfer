import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalAnatomy,retargetMesh} from '../tools/chunk_surfer/characters/vigil-tailoring.mjs';
import {refineVigilIdentity,VIGIL_IDENTITY_PROFILES} from '../tools/chunk_surfer/characters/vigil-character-identity.mjs';
import {VIGIL_CHARACTER_DESIGNS} from '../src/data/vigil-character-design.js';

const masters={
  woman:canonicalAnatomy(JSON.parse(fs.readFileSync(new URL('../artifacts/bus-woman-production/anatomy.json',import.meta.url)))),
  man:canonicalAnatomy(JSON.parse(fs.readFileSync(new URL('../public/assets/recordist-characters/contractor.json',import.meta.url)))),
};
const material={skin:0,hair:1,eye:2,iris:3};
const identities=new Set(),report=[];
for(const[id,design]of Object.entries(VIGIL_CHARACTER_DESIGNS)){
  const source=masters[design.source],scale=[design.width,design.height/source.height,design.depth],bones=source.bones.map(b=>({...b,head:b.head.map((v,k)=>v*scale[k]),tail:b.tail.map((v,k)=>v*scale[k])}));
  const selected=source.meshes.filter(m=>/anatomical-skin|ordinary-face-neck|grey[ie]ng-hair|sculpted-hair|temple|eyes|iris|headphone-/.test(m.name)&&(!m.name.startsWith('headphone-')||id==='kit')).map(m=>({...retargetMesh(m,source,source,design),material:/hair|temple/.test(m.name)?1:/iris/.test(m.name)?3:/eyes/.test(m.name)?2:0}));
  const before=structuredClone(selected),out=refineVigilIdentity(selected,bones,design,material),profile=VIGIL_IDENTITY_PROFILES[id],hair=out.filter(m=>m.material===material.hair);
  assert.deepEqual(selected,before,`${id}: identity helper mutates caller geometry`);
  assert.equal(out.some(m=>/temple/.test(m.name)),false,`${id}: detached temple tubes remain`);
  assert.equal(out.some(m=>/grey[ie]ng-hair|sculpted-hair/.test(m.name)),false,`${id}: old scalp cap remains`);
  assert.ok(out.some(m=>m.identityScalp&&m.identitySeamVertices>20),`${id}: scalp must be geometrically stitched to the face`);
  assert.equal(hair.length,profile.hair==='concealed'?0:profile.hair==='tied-back'?2:1);
  let hairVertices=0;
  for(const m of out){
    assert.equal(m.normals.length,m.positions.length);
    assert.equal(m.skinIndex.length,m.positions.length/3*4);assert.equal(m.skinWeight.length,m.skinIndex.length);
    assert.ok(m.positions.every(Number.isFinite)&&m.normals.every(Number.isFinite),`${id}: non-finite identity geometry`);
    for(let at=0;at<m.skinWeight.length;at+=4)assert.ok(Math.abs(m.skinWeight.slice(at,at+4).reduce((a,b)=>a+b,0)-1)<1e-5,`${id}: skin weights drifted`);
    if(m.material===material.hair){
      hairVertices+=new Set(m.indices).size;
      if(!/folded occipital bun/.test(m.name)){
        const outerVertices=m.positions.length/6,center=bones.find(b=>b.name==='head').head.map((v,k)=>v+(k===1?.055:k===2?.005:0));let outward=0,total=0;
        for(let i=0;i<m.indices.length;i+=3){const ids=m.indices.slice(i,i+3);if(ids.some(v=>v>=outerVertices))continue;
          const p=ids.map(v=>m.positions.slice(v*3,v*3+3)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],radial=center.map((v,k)=>(p[0][k]+p[1][k]+p[2][k])/3-v),signed=normal.reduce((n,v,k)=>n+v*radial[k],0);
          if(Math.hypot(...normal)<1e-12)continue;total++;if(signed>0)outward++;
        }
        assert.ok(outward/total>.995,`${id}: outer hair winding points into the skull (${outward}/${total})`);
      }
      const edges=new Map();for(let i=0;i<m.indices.length;i+=3)for(let k=0;k<3;k++){const a=m.indices[i+k],b=m.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}
      assert.ok([...edges.values()].every(v=>v===2),`${id}: hairstyle has an open or nonmanifold edge`);
    }
    const original=before.find(o=>o.name===m.name);if(!original)continue;
    assert.deepEqual(m.skinIndex.slice(0,original.skinIndex.length),original.skinIndex,`${id}: identity changed anatomy's original rig indices`);assert.deepEqual(m.skinWeight.slice(0,original.skinWeight.length),original.skinWeight);
    if(/^headphone-/.test(m.name))assert.deepEqual(m.positions,original.positions,'Kit headphone shell/contact geometry moved');
    for(let i=0;i<original.positions.length;i+=3){
      const p=original.positions.slice(i,i+3),protectedPoint=p[1]<bones.find(b=>b.name==='head').head[1]-.065||(id==='kit'&&p[2]>bones.find(b=>b.name==='head').head[2]-.035);
      if(protectedPoint)assert.deepEqual(m.positions.slice(i,i+3),p,`${id}: protected ear, neck or hand anatomy moved`);
    }
  }
  const skin=out.find(m=>/anatomical-skin|ordinary-face-neck/.test(m.name)),original=before.find(m=>m.name===skin.name),head=bones.find(b=>b.name==='head');
  let delta=0;for(let i=0;i<original.positions.length;i+=3)if(skin.positions[i+1]>head.head[1]-.06)delta=Math.max(delta,Math.hypot(...skin.positions.slice(i,i+3).map((v,k)=>v-original.positions[i+k])));
  assert.ok(delta>.0002&&delta<.025,`${id}: face variation absent or anatomically excessive (${delta}m)`);
  identities.add(profile.description);report.push({id,style:profile.hair,hairVertices,skinVertices:new Set(skin.indices).size,seamVertices:skin.identitySeamVertices,headDeltaMm:Math.round(delta*1000)/1});
}
assert.equal(identities.size,6);
console.log(JSON.stringify({identities:report,checks:'original anatomy/weights preserved; six face profiles; closed scalp-fitted hair; headphones and contact-adjacent anatomy unchanged'}));
