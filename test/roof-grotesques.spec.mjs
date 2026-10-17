import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoofGrotesques,ROOF_GROTESQUES,ROOF_GROTESQUE_ENVELOPE,ROOF_FOLIATE_HEAD} from '../tools/chunk_surfer/roof-grotesques.mjs';
import {buildAcademicRoof} from '../tools/chunk_surfer/academic-roof-geometry.mjs';

const materials=[{name:'supplied carved limestone'}],shapes=[];
const api={m:{},materials,carvedStone:0,foliateHead:null};
for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
  api[`add${kind}`]=(_m,...args)=>shapes.push({kind,args});
buildRoofGrotesques(api);

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
  let half;
  if(kind==='Ellipsoid')half=a[1];
  else if(kind==='Cylinder')half=[a[1],a[2]/2,a[1]];
  else{
    const yaw=a[3]||0,c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
    half=[(a[1][0]*c+a[1][2]*s)/2,a[1][1]/2,(a[1][0]*s+a[1][2]*c)/2];
  }
  return{lo:a[0].map((v,i)=>v-half[i]),hi:a[0].map((v,i)=>v+half[i])};
};
const localBounds=(shape,at)=>{
  const {lo,hi}=bounds(shape),points=[];
  const c=Math.cos(at.yaw),s=Math.sin(at.yaw);
  for(const x of[lo[0],hi[0]])for(const y of[lo[1],hi[1]])for(const z of[lo[2],hi[2]]){
    const dx=x-at.x,dz=z-at.z;
    points.push([dx*c+dz*s,y-at.base,-dx*s+dz*c]);
  }
  return{lo:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),
    hi:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
};
const owner=shape=>{
  const {lo,hi}=bounds(shape),cx=(lo[0]+hi[0])/2,cz=(lo[2]+hi[2])/2;
  return ROOF_GROTESQUES.toSorted((a,b)=>Math.hypot(cx-a.x,cz-a.z)-Math.hypot(cx-b.x,cz-b.z))[0];
};

test('four distinct carved beasts stay on the existing side cornice and below the sky ceiling',()=>{
  assert.deepEqual(ROOF_GROTESQUES.map(p=>p.kind),['hound','lion','rook','owl']);
  for(const at of ROOF_GROTESQUES){
    const owned=shapes.filter(s=>owner(s)===at);
    assert.ok(owned.length>20,'expression has broad three-dimensional carved forms');
    for(const shape of owned){
      const world=bounds(shape),local=localBounds(shape,at);
      assert.ok(world.lo[0]>=-12.04&&world.hi[0]<=12.04&&world.lo[2]>=-13.54&&world.hi[2]<=13.54,
        `${at.id} stays within the existing roof outline`);
      assert.ok(world.lo[1]>2.75&&world.hi[1]<7,'no new walking obstacle or ceiling crossing');
      assert.ok(local.lo[0]>=-ROOF_GROTESQUE_ENVELOPE.halfWidth-1e-9&&local.hi[0]<=ROOF_GROTESQUE_ENVELOPE.halfWidth+1e-9);
      assert.ok(local.lo[2]>=ROOF_GROTESQUE_ENVELOPE.back-1e-9&&local.hi[2]<=ROOF_GROTESQUE_ENVELOPE.front+1e-9);
      assert.ok(local.lo[1]>=-1e-9&&local.hi[1]<=ROOF_GROTESQUE_ENVELOPE.height+1e-9);
    }
    assert.ok(Math.abs(at.x)>=11&&at.z>-12.5,'no ornament enters the northern bridge opening');
    // Local +Z faces inward from either side, toward the promenade.
    const inwardX=-Math.sin(at.yaw);
    assert.ok(inwardX*(-Math.sign(at.x))>.99);
  }
});

test('the hound and lion have a real open jaw rather than a dark painted muzzle',()=>{
  for(const at of ROOF_GROTESQUES.filter(p=>p.kind==='hound'||p.kind==='lion')){
    const local=shapes.filter(s=>owner(s)===at).map(s=>localBounds(s,at));
    const blockers=local.filter(({lo,hi})=>lo[0]<=.025&&hi[0]>=-.025&&
      lo[1]<=.72&&hi[1]>=.66&&lo[2]<=.49&&hi[2]>=.31);
    assert.equal(blockers.length,0,`${at.id} leaves a clear 6 cm mouth aperture across its front`);
    assert.ok(local.some(({lo,hi})=>lo[1]>.72&&lo[2]<.35&&hi[2]>.45),'upper muzzle has a substantial projecting profile');
    assert.ok(local.some(({lo,hi})=>hi[1]<.66&&lo[2]<.35&&hi[2]>.45),'lower jaw remains a separate solid');
  }
});

test('the supplied stone is reused and the only new material is nonemissive carved recess',()=>{
  assert.equal(materials.length,2);
  assert.equal(materials[1].name,'roof grotesque deeply cut stone');
  assert.equal(materials[1].emissiveFactor,undefined);
  assert.equal(materials[1].extras,undefined);
  assert.ok(materials[1].pbrMetallicRoughness.roughnessFactor>=.95);
});

test('the single foliate keystone faces the promenade and stays attached above the side boundary',()=>{
  const leafShapes=[],leafMaterials=[{name:'supplied carved limestone'}];
  const leafApi={m:{},materials:leafMaterials,carvedStone:0,placements:[]};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    leafApi[`add${kind}`]=(_m,...args)=>leafShapes.push({kind,args});
  buildRoofGrotesques(leafApi);
  assert.ok(leafShapes.length>20,'six large folded leaves surround a whole carved face');
  for(const shape of leafShapes){
    const {lo,hi}=bounds(shape);
    assert.ok(lo[0]>=-12.04&&hi[0]<=-10.80,'the relief remains attached to the west cornice');
    assert.ok(lo[1]>2.75&&hi[1]<7,'a keystone relief cannot become an interior obstacle');
    assert.ok(lo[2]>-6.53&&hi[2]<-5.47,'the mask stays near its exported close-photo anchor');
  }
  assert.ok(-Math.sin(ROOF_FOLIATE_HEAD.yaw)>.99,'face points east into the west promenade');
});

test('foliate eyes and mouth sit in front of the actual keystone instead of inside its stone',()=>{
  const allMaterials=Array.from({length:34},(_,i)=>({name:`base-${i}`}));
  const meshShapes=new Map();
  const api={materials:allMaterials,MAT:{black:2,steel:3,ivory:4,brass:5,stone:10,roofGlass:19,agedWhite:17},
    mesh(name){const m={name,shapes:[]};meshShapes.set(name,m.shapes);return m;}};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  buildAcademicRoof(api);
  const structure=meshShapes.get('academic_roof_structure');
  const stoneId=allMaterials.findIndex(m=>m.name==='roof carved rain-worn limestone');
  const substrate=structure.find(s=>s.kind==='Box'&&s.args[2]===stoneId&&
    s.args[0][0]===-11.5&&s.args[0][1]===3.99&&s.args[0][2]===-6);
  assert.ok(substrate,'use the real architectural keystone, not a copied test-only plane');
  const substrateFront=bounds(substrate).hi[0];
  const faceMaterials=[{name:'supplied stone'}],faceShapes=[];
  const faceApi={m:{},materials:faceMaterials,carvedStone:0,placements:[]};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    faceApi[`add${kind}`]=(_m,...args)=>faceShapes.push({kind,args});
  buildRoofGrotesques(faceApi);
  const recessId=faceMaterials.findIndex(m=>m.name==='roof grotesque deeply cut stone');
  const recesses=faceShapes.filter(s=>s.kind==='Box'&&s.args[2]===recessId);
  assert.equal(recesses.length,3,'two eyes and one mouth are visible carved recess surfaces');
  for(const feature of recesses)
    assert.ok(bounds(feature).lo[0]>substrateFront+.03,'the whole recess must win depth ahead of the keystone');
  const head=faceShapes.find(s=>s.kind==='Ellipsoid');
  assert.ok(bounds(head).lo[0]<substrateFront&&bounds(head).hi[0]>substrateFront,
    'the stone head remains embedded in its substrate rather than floating in front');
});
