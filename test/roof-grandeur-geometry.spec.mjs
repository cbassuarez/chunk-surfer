import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAcademicRoof,ACADEMIC_ROOF_ORNAMENT_CONTRACT} from '../tools/chunk_surfer/academic-roof-geometry.mjs';
import {ROOF_FORMAL_PROMENADES} from '../tools/chunk_surfer/roof-formal-promenade.mjs';

const materials=Array.from({length:34},(_,i)=>({name:`base-${i}`}));
const MAT={black:2,steel:3,ivory:4,brass:5,stone:10,roofGlass:19,agedWhite:17};
const meshes=new Map();
const api={materials,MAT,mesh(name){const m={name,shapes:[]};meshes.set(name,m);return m;}};
for(const kind of ['Box','Beam','Ellipsoid','Cylinder','Quad'])api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
buildAcademicRoof(api);
const matIndex=s=>s.kind==='Quad'?s.args[4]:s.kind==='Beam'?s.args[3]:s.kind==='Cylinder'?s.args[3]:s.args[2];
const bounds=s=>{
  let lo,hi;
  if(s.kind==='Box'||s.kind==='Ellipsoid'){
    const[c,size]=s.args,half=s.kind==='Box'?size.map(v=>v/2):size;
    lo=c.map((v,i)=>v-half[i]);hi=c.map((v,i)=>v+half[i]);
  }else if(s.kind==='Cylinder'){
    const[c,r,h]=s.args;lo=[c[0]-r,c[1]-h/2,c[2]-r];hi=[c[0]+r,c[1]+h/2,c[2]+r];
  }else if(s.kind==='Beam'){
    const[a,b,w]=s.args,margin=w/Math.SQRT2;
    lo=a.map((v,i)=>Math.min(v,b[i])-margin);hi=a.map((v,i)=>Math.max(v,b[i])+margin);
  }else{
    const points=s.args.slice(0,4);lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  }
  return{lo,hi};
};

test('ceremonial pavilion and urns occupy existing perimeter collision and retain overhead clearance',()=>{
  const structure=meshes.get('academic_roof_structure');
  const carved=structure.shapes.filter(s=>materials[matIndex(s)]?.name==='roof carved rain-worn limestone');
  assert.ok(carved.length>20,'this is an architectural silhouette rather than scattered decals');
  for(const s of carved){
    const {lo,hi}=bounds(s);
    assert.ok(lo[0]>=-12.04&&hi[0]<=12.04&&lo[2]>=-13.54&&hi[2]<=13.54,'existing roof outline retained');
    const boundary=hi[0]<=-11||lo[0]>=11||lo[2]>=12.5;
    assert.ok(boundary||lo[1]>=2.75,`walkable loop has no new unseen standing obstruction: ${JSON.stringify({lo,hi})}`);
    assert.ok(hi[1]+17<24,'ornament fits the existing sky-level ceiling');
  }
  const north=ACADEMIC_ROOF_ORNAMENT_CONTRACT.northOpening;
  for(const s of structure.shapes.filter(s=>['roof carved rain-worn limestone','roof restrained tarnished gilt bronze'].includes(materials[matIndex(s)]?.name))){
    const {lo,hi}=bounds(s);
    assert.ok(hi[2]<-13.5||lo[2]>-12.5||hi[0]<north.x0||lo[0]>north.x1,
      'new ornament never narrows the north bridge opening');
  }
  assert.equal(meshes.get('academic_roof_glazing').shapes.filter(s=>matIndex(s)===MAT.roofGlass).length,30);
});

test('eight side columns frame six genuinely open views inside existing boundary collision',()=>{
  const structure=meshes.get('academic_roof_structure');
  const carved=structure.shapes.filter(s=>materials[matIndex(s)]?.name==='roof carved rain-worn limestone');
  const {sideArcades:arcade}=ACADEMIC_ROOF_ORNAMENT_CONTRACT;
  const shafts=carved.filter(s=>s.kind==='Cylinder'&&s.args[2]>1.9&&
    arcade.x.includes(s.args[0][0])&&arcade.columns.includes(s.args[0][2]));
  assert.equal(shafts.length,8,'four full-height shafts form each side arcade');
  for(const x of arcade.x)for(const z of arcade.columns){
    const shaft=shafts.find(s=>s.args[0][0]===x&&s.args[0][2]===z);
    assert.ok(shaft&&shaft.args[1]>=.26,'columns have substantial mass at native view distance');
    const {lo,hi}=bounds(shaft);
    assert.ok(hi[0]<=-11||lo[0]>=11,'no shaft enters the traversable side promenade');
  }
  for(const x of arcade.x)for(const z of[-6,0,6])for(const y of[.94,1.62,2.2]){
    const occupied=carved.filter(s=>{
      const{lo,hi}=bounds(s);
      return x>=lo[0]&&x<=hi[0]&&y>=lo[1]&&y<=hi[1]&&z>=lo[2]&&z<=hi[2];
    });
    assert.equal(occupied.length,0,`side bay at ${x},${z} remains open at eye height ${y}`);
  }
  assert.ok(arcade.archSpring>=2.9&&arcade.corniceTop<7,'open arches remain below the existing sky ceiling');
});

test('formal inlays are upward-facing, genuinely flat, outside the glass and kept below the coping',()=>{
  const surface=meshes.get('academic_roof_structure').shapes.filter(s=>materials[matIndex(s)]?.name.startsWith('roof promenade'));
  assert.ok(surface.length>100);
  for(const s of surface){
    assert.equal(s.kind,'Quad');
    const[a,b,c,d]=s.args;
    assert.ok([a,b,c,d].every(p=>p.every(Number.isFinite)&&p[1]===.032));
    const normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>0,'faces survive culling from above');
    const {lo,hi}=bounds(s);
    assert.ok(hi[0]<-6.25||lo[0]>4.25||hi[2]<-7.75||lo[2]>5.75,'no glass pane or raised curb is disguised as stone');
  }
  assert.equal(ROOF_FORMAL_PROMENADES.length,4);
  for(const p of ROOF_FORMAL_PROMENADES)assert.ok(p.w>=1.7&&p.d>=2.3,'patterns use broad legible panels, not fine tile noise');
});

test('new ornament is nonemissive while accepted fire-escape iron keeps its material identity',()=>{
  for(const m of materials.filter(m=>/carved|tarnished gilt|promenade/.test(m.name))){
    assert.equal(m.emissiveFactor,undefined);
    assert.ok(m.pbrMetallicRoughness.roughnessFactor>=.89);
  }
  const iron=materials.find(m=>m.name==='subdued fire escape iron');
  assert.deepEqual(iron.pbrMetallicRoughness.baseColorFactor,[.018,.024,.025,1]);
  assert.equal(iron.extras.fireEscapeRole,'quiet-metal');
});
