// Real body/proxy fitting must reproduce the retained anatomical masters and
// evaluate .mhclo coefficients, rather than approximating clothing with rings.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalAnatomy} from '../tools/chunk_surfer/characters/vigil-tailoring.mjs';
import {retainedBody,fittedProxyGarment,fitClothToEnvelope} from '../tools/chunk_surfer/characters/vigil-body-fit.mjs';

const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const sources=[canonicalAnatomy(read('../artifacts/bus-woman-production/anatomy.json')),canonicalAnatomy(read('../public/assets/recordist-characters/contractor.json'))];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function checkSkin(mesh,boneCount){
  assert.equal(mesh.positions.length,mesh.normals.length);assert.equal(mesh.skinIndex.length,mesh.positions.length/3*4);assert.equal(mesh.skinWeight.length,mesh.skinIndex.length);
  assert.ok(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  for(let vertex=0;vertex<mesh.positions.length/3;vertex++){
    const weights=mesh.skinWeight.slice(vertex*4,vertex*4+4);assert.ok(weights.every(w=>w>=0&&Number.isFinite(w)));assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w,0)-1)<1e-9);
    assert.ok(mesh.skinIndex.slice(vertex*4,vertex*4+4).every(j=>Number.isInteger(j)&&j>=0&&j<boneCount));
  }
  assert.ok(mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3));
}
for(const source of sources){
  const original=structuredClone(source),body=retainedBody(source),design={height:source.height*.97,width:.91,depth:.95},scaled=retainedBody(source,design),factors=[.91,.97,.95];
  assert.ok(body.restError<1e-4,`${source.id} full body no longer matches retained anatomical rig`);
  assert.equal(body.positions.length/3,19158);assert.equal(body.faces.length,13378);assert.equal(body.bones.length,54);checkSkin(body,54);
  const bodyIds=new Set(body.bodyVertexIndices);assert.ok(body.faces.every(face=>face.every(i=>bodyIds.has(i))),'helper-marker faces leaked into the anatomical body');
  for(let i=0;i<body.positions.length;i++)assert.ok(Math.abs(scaled.positions[i]-body.positions[i]*factors[i%3])<1e-9,'full anatomy does not share target proportions');
  for(let i=0;i<body.bones.length;i++){
    assert.ok(distance(scaled.bones[i].head,source.bones[i].head.map((v,j)=>v*factors[j]))<1e-9);assert.ok(distance(scaled.bones[i].tail,source.bones[i].tail.map((v,j)=>v*factors[j]))<1e-9);
  }
  for(const[asset,fitRows,faceCount]of[['male_casualsuit01',8426,8336],['male_elegantsuit01',7613,7478],['male_worksuit01',3763,3493]]){
    const mesh=fittedProxyGarment(source,design,asset);checkSkin(mesh,54);assert.equal(mesh.fitRows,fitRows);assert.equal(mesh.faces.length,faceCount);assert.ok(mesh.hiddenVertices.length>1000);assert.equal(mesh.uv.length,mesh.positions.length/3*2);
    assert.deepEqual(mesh.bones,scaled.bones,'proxy and anatomical body use different rest skeletons');
    // Independent first-row fit. In game coordinates, macroScale cancels out
    // of the .mhclo dimension compensation, so no private helper state is used.
    const text=readFileSync(new URL(`../tools/chunk_surfer/character-sources/makehuman/system/clothes/${asset}/${asset}.mhclo`,import.meta.url),'utf8'),lines=text.split(/\r?\n/),scales=[0,1,2].map(axis=>{
      const fields=lines.find(line=>line.startsWith('xyz'[axis]+'_scale ')).trim().split(/\s+/),a=Number(fields[1]),b=Number(fields[2]),denominator=Number(fields[3]);
      return Math.abs(body.positions[a*3+axis]-body.positions[b*3+axis])/denominator;
    }),start=lines.findIndex(line=>/^verts\b/.test(line)),row=lines.slice(start+1).find(line=>line.trim()&&!line.trim().startsWith('#')).trim().split(/\s+/).map(Number);
    const ids=row.length===1?[row[0]]:row.slice(0,3),weights=row.length===1?[1]:row.slice(3,6),delta=row.length===1?[0,0,0]:row.slice(6,9),expected=[0,0,0];
    for(let axis=0;axis<3;axis++){for(let i=0;i<ids.length;i++)expected[axis]+=body.positions[ids[i]*3+axis]*weights[i];expected[axis]=(expected[axis]+delta[axis]*scales[axis]*(axis===2?-1:1))*factors[axis];}
    const first=mesh.sourceVertexIndices.indexOf(0);assert.ok(first>=0);assert.ok(distance(mesh.positions.slice(first*3,first*3+3),expected)<1e-9,`${asset} no longer evaluates its actual retained proxy coefficients`);
    const seams=new Map();for(let vertex=0;vertex<mesh.sourceVertexIndices.length;vertex++){
      const sourceIndex=mesh.sourceVertexIndices[vertex],first=seams.get(sourceIndex);if(first==null)seams.set(sourceIndex,vertex);else{
        assert.ok(distance(mesh.positions.slice(vertex*3,vertex*3+3),mesh.positions.slice(first*3,first*3+3))<1e-12,'UV seam detached garment geometry');
        assert.ok(distance(mesh.normals.slice(vertex*3,vertex*3+3),mesh.normals.slice(first*3,first*3+3))<1e-12,'UV seam introduced a false cloth crease');
      }
    }
  }
  assert.deepEqual(source,original,'body fitting mutated a retained anatomical master');
}

// Reproduce the relevant layer conflict independently: a coat rotates with its
// pelvis while clothed thighs remain planted. A rest-only hull check passes
// this case but leaves the trouser fly and thigh through the rendered coat.
const bones=[{name:'pelvis',head:[0,.8,0],tail:[0,.9,0]},{name:'chest',head:[0,1.4,0],tail:[0,1.5,0]},{name:'thigh_L',head:[0,.8,0],tail:[0,.4,0]},{name:'upperarm_L',head:[.2,1.3,0],tail:[.35,1.1,0]}];
const boxPositions=[[-.2,.25,-.26],[.2,.25,-.26],[.2,1.2,-.26],[-.2,1.2,-.26],[-.2,.25,.18],[.2,.25,.18],[.2,1.2,.18],[-.2,1.2,.18]].flat(),boxFaces=[[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]],boxIndices=boxFaces.flatMap(f=>[f[0],f[1],f[2],f[0],f[2],f[3]]),envelope={positions:boxPositions,indices:boxIndices,skinIndex:Array.from({length:8},()=>[2,0,0,0]).flat(),skinWeight:Array.from({length:8},()=>[1,0,0,0]).flat(),bones};
const positions=[],indices=[],segments=24;
for(const[yIndex,y]of[.45,.7,1.0].entries())for(let i=0;i<segments;i++){
  const angle=i*2*Math.PI/segments;positions.push(Math.cos(angle)*.16,y,-.04+Math.sin(angle)*.16);
  if(yIndex){const a=(yIndex-1)*segments+i,b=(yIndex-1)*segments+(i+1)%segments,c=yIndex*segments+(i+1)%segments,d=yIndex*segments+i;indices.push(a,b,c,a,c,d);}
}
positions.push(0,1.42,-.15,.35,.7,0);const outerCount=positions.length/3,upperVertex=outerCount-2,sleeveVertex=outerCount-1;
const skinIndex=Array.from({length:outerCount},(_,i)=>i<segments?[0,2,0,0]:[i===sleeveVertex?3:0,0,0,0]).flat(),skinWeight=Array.from({length:outerCount},(_,i)=>i<segments?[.72,.28,0,0]:[1,0,0,0]).flat();
for(let i=0;i<outerCount;i++){const p=positions.slice(i*3,i*3+3),delta=[p[0],p[2]+.04],radius=Math.hypot(...delta)||1;positions.push(p[0]-delta[0]/radius*.0025,p[1],p[2]-delta[1]/radius*.0025);skinIndex.push(...skinIndex.slice(i*4,i*4+4));skinWeight.push(...skinWeight.slice(i*4,i*4+4));}
const cloth={positions,indices,skinIndex,skinWeight,normals:new Array(positions.length).fill(0),bones,drape:{outerVertices:outerCount}};
const angle=.17,q=[Math.sin(angle/2),0,0,Math.cos(angle/2)],world=(point,shift,vertex)=>{
  const moving=[point[0]+shift,.8+(point[1]-.8)*Math.cos(angle)-point[2]*Math.sin(angle),(point[1]-.8)*Math.sin(angle)+point[2]*Math.cos(angle)];
  return vertex<segments?moving.map((v,i)=>v*.72+point[i]*.28):moving;
},poses=[0,.012].map(shift=>({joints:{pelvis:{translation:[shift,0,0],rotation:q},chest:{translation:[shift,-.6+.6*Math.cos(angle),.6*Math.sin(angle)],rotation:q}}}));
const fitted=fitClothToEnvelope(cloth,envelope,{ease:.012,poses,bones});
assert.ok(fitted.envelopeFit.posed&&fitted.envelopeFit.shiftedVertices>segments*2,'posed body fit did not repair lower torso/thigh cloth');
for(let vertex=0;vertex<segments*3;vertex++){
  for(const shift of[0,.012]){
    const p=world(fitted.positions.slice(vertex*3,vertex*3+3),shift,vertex),delta=[p[0],p[2]+.04],radius=Math.hypot(...delta),direction=delta.map(v=>v/radius),hit=Math.min(Math.abs(.20/(direction[0]||1e-20)),Math.abs(.22/(direction[1]||1e-20)));
    assert.ok(radius-hit>=.01195,`posed garment still crosses the stationary clothed-body box at vertex ${vertex}`);
  }
  const before=positions.slice((vertex+outerCount)*3,(vertex+outerCount)*3+3).map((v,i)=>v-positions[vertex*3+i]),after=fitted.positions.slice((vertex+outerCount)*3,(vertex+outerCount)*3+3).map((v,i)=>v-fitted.positions[vertex*3+i]);
  assert.ok(distance(before,after)<1e-12,'posed fit collapsed or thickened the paired inner lining');
}
for(const vertex of[upperVertex,sleeveVertex])assert.deepEqual(fitted.positions.slice(vertex*3,vertex*3+3),positions.slice(vertex*3,vertex*3+3),'fitting moved an upper chest/collar or sleeve vertex');
assert.deepEqual(cloth.positions,positions,'envelope fitting mutated its source cloth');assert.deepEqual(fitted.skinIndex,skinIndex);assert.deepEqual(fitted.skinWeight,skinWeight);
console.log('vigil body-fit specs passed (exact macro/proxy fitting, posed all-height clearance, retained lining and sleeves)');
