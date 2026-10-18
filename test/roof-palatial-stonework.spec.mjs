import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoofPalatialStonework,ROOF_PALATIAL_STONEWORK} from '../tools/chunk_surfer/roof-palatial-stonework.mjs';
import {buildRoofGrotesques,ROOF_GROTESQUES,ROOF_FOLIATE_HEAD} from '../tools/chunk_surfer/roof-grotesques.mjs';
import {buildAcademicRoof} from '../tools/chunk_surfer/academic-roof-geometry.mjs';

const shapes=[],materials=[{name:'supplied stone'},{name:'supplied bronze'}];
const api={m:{},materials,carvedStone:0,oldBronze:1};
for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
  api[`add${kind}`]=(_m,...args)=>shapes.push({kind,args});
const result=buildRoofPalatialStonework(api);

const bounds=({kind,args:a})=>{
  if(kind==='Quad')return{
    lo:[0,1,2].map(i=>Math.min(...a.slice(0,4).map(p=>p[i]))),
    hi:[0,1,2].map(i=>Math.max(...a.slice(0,4).map(p=>p[i]))),
  };
  if(kind==='Beam'){
    const margin=a[2]/Math.SQRT2;
    return{lo:a[0].map((v,i)=>Math.min(v,a[1][i])-margin),
      hi:a[0].map((v,i)=>Math.max(v,a[1][i])+margin)};
  }
  let r;
  if(kind==='Ellipsoid')r=a[1];
  else if(kind==='Cylinder')r=[a[1],a[2]/2,a[1]];
  else{
    const c=Math.abs(Math.cos(a[3]||0)),s=Math.abs(Math.sin(a[3]||0));
    r=[(a[1][0]*c+a[1][2]*s)/2,a[1][1]/2,(a[1][0]*s+a[1][2]*c)/2];
  }
  return{lo:a[0].map((v,i)=>v-r[i]),hi:a[0].map((v,i)=>v+r[i])};
};
const intersects=(a,b)=>[0,1,2].every(i=>a.hi[i]>b.lo[i]+1e-7&&a.lo[i]<b.hi[i]-1e-7);
const contractBox=p=>({lo:[p.x0,p.y0,p.z0],hi:[p.x1,p.y1,p.z1]});
const component=id=>{
  const c=result.components.find(c=>c.id===id);assert.ok(c,`${id} has an auditable shape range`);
  return shapes.slice(c.first,c.end);
};

test('the palatial layer has architectural mass within a verified triangle ceiling',()=>{
  const triangleCount=shapes.reduce((total,{kind,args:a})=>total+
    (kind==='Quad'?2:kind==='Ellipsoid'?2*a[3]*a[4]:kind==='Cylinder'?4*(a[4]||12):12),0);
  assert.equal(result.shapeCount,shapes.length);
  assert.equal(result.triangles,triangleCount);
  assert.ok(triangleCount>5000,'this is a whole carved order rather than a few tiny ornaments');
  assert.ok(triangleCount<=16000&&triangleCount<=ROOF_PALATIAL_STONEWORK.triangleBudget);
  assert.equal(result.components.filter(c=>c.id.includes('capital')).length,10);
  assert.equal(result.components.filter(c=>c.id.endsWith('-shell')).length,3);
  assert.ok(shapes.filter(s=>s.kind==='Box'&&s.args[1][0]>=1.30&&s.args[1][2]>=2).length>=3,
    'projecting cornices have real broad horizontal faces');
});

test('all additions retain the outline, clear ordinary eyes, and leave the north open',()=>{
  for(const shape of shapes){
    const {lo,hi}=bounds(shape);
    assert.ok(lo[0]>=-12.04&&hi[0]<=12.04&&lo[2]>=-13.54&&hi[2]<=13.54,
      `roof outline: ${JSON.stringify({lo,hi})}`);
    assert.ok(lo[1]>=2.75&&hi[1]<=6.8,'stonework cannot become a new unseen walking obstacle');
    assert.ok(lo[2]>-12.5,'no new ornament crosses the north city-facing guard or entry');
  }
  for(const x of[-11.5,11.5])for(const z of[-6,0,6])for(const y of[.94,1.62,2.20])
    assert.ok(shapes.every(s=>{const b=bounds(s);return !(x>=b.lo[0]&&x<=b.hi[0]&&y>=b.lo[1]&&y<=b.hi[1]&&z>=b.lo[2]&&z<=b.hi[2]);}),
      'seated and standing view openings stay below the carved order');
});

test('the existing foliate face, musical lyre and four beasts are not buried by the new order',()=>{
  for(const protectedPart of[ROOF_PALATIAL_STONEWORK.protectedFoliate,ROOF_PALATIAL_STONEWORK.protectedLyre])
    assert.ok(shapes.every(s=>!intersects(bounds(s),contractBox(protectedPart))),
      'a deeper new cornice must preserve the actual projecting face and crest');
  const original=[],originalMaterials=[{name:'supplied stone'}];
  const originalApi={m:{},materials:originalMaterials,carvedStone:0};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    originalApi[`add${kind}`]=(_m,...args)=>original.push({kind,args});
  buildRoofGrotesques(originalApi);
  const faceRecesses=original.filter(s=>s.kind==='Box'&&s.args[2]===1&&
    Math.abs(s.args[0][2]-ROOF_FOLIATE_HEAD.z)<.4&&s.args[0][1]<4.34);
  assert.equal(faceRecesses.length,3,'use the actual foliate eyes and mouth surfaces');
  for(const recess of faceRecesses){
    const b=bounds(recess);
    const viewingColumn={lo:[b.lo[0],b.lo[1],b.lo[2]],hi:[-9,b.hi[1],b.hi[2]]};
    assert.ok(shapes.every(s=>!intersects(bounds(s),viewingColumn)),
      'no new cornice can win depth in front of a previously visible eye or mouth');
  }
  for(const at of ROOF_GROTESQUES){
    const beastVolume={lo:[at.x-.52,at.base,at.z-.52],hi:[at.x+.52,at.base+1.34,at.z+.52]};
    assert.ok(shapes.every(s=>!intersects(bounds(s),beastVolume)),
      'the existing cornice beasts keep their feet, body and skyline silhouettes');
  }
});

test('shell relief stands in front of its new stone substrate while its back remains attached',()=>{
  for(const name of['west','east']){
    const substrate=component(`${name}-deep-entablature`).find(s=>s.kind==='Box'&&
      s.args[0][1]===4.035&&bounds(s).lo[2]<0&&bounds(s).hi[2]>0);
    assert.ok(substrate,'measure the actual new frieze box');
    const b=bounds(substrate),side=name==='west'?-1:1;
    const substrateFront=side<0?b.hi[0]:b.lo[0];
    const relief=component(`${name}-shell`);
    const backing=relief.find(s=>s.kind==='Box');
    const back=bounds(backing);
    assert.ok(back.lo[0]<substrateFront&&back.hi[0]>substrateFront,'backing embeds in the new frieze');
    for(const rib of relief.filter(s=>s.kind==='Beam')){
      const edge=bounds(rib);
      assert.ok(side<0?edge.lo[0]>substrateFront+.03:edge.hi[0]<substrateFront-.03,
        'whole shell ribs stand in front of the stone, including their thickness');
    }
  }
  assert.equal(materials.length,2,'reuse the actual roof stone and restrained bronze without added finishes');
});

test('the projecting south shell has an actual stone connection to the existing plinth',()=>{
  const mainMaterials=Array.from({length:34},(_,i)=>({name:`base-${i}`})),meshes=new Map();
  const api={materials:mainMaterials,MAT:{black:2,steel:3,ivory:4,brass:5,stone:10,roofGlass:19,agedWhite:17},
    mesh(name){const m={name,shapes:[]};meshes.set(name,m);return m;}};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  buildAcademicRoof(api);
  const oldPlinth=meshes.get('academic_roof_structure').shapes.find(s=>s.kind==='Box'&&
    s.args[0][0]===-1&&s.args[0][1]===4.28&&s.args[0][2]===12.75);
  assert.ok(oldPlinth,'measure the actual original crest support');
  const shell=component('south-shell'),backing=shell[0],hanger=shell[1];
  assert.equal(backing.kind,'Box');assert.equal(hanger.kind,'Box');
  assert.ok(intersects(bounds(backing),bounds(hanger)),'hanger connects to shell backing');
  assert.ok(intersects(bounds(hanger),bounds(oldPlinth)),'hanger connects to the existing stone above');
  assert.ok(bounds(hanger).hi[1]<ROOF_PALATIAL_STONEWORK.protectedLyre.y0,
    'the support remains below the visible musical crest');
});
