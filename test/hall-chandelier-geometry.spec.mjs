import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {HALL_CHANDELIER_GEOMETRY as G} from '../src/data/generated/hall-chandelier-geometry.js';

const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root));
const stats=JSON.parse(read('public/assets/hall-chandelier-proof.stats.json'));
const credits=JSON.parse(read('public/assets/hall-chandelier-proof.credits.json'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function glb(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
  const bin=bytes.subarray(28+length);
  const values=index=>{
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type];
    const size={5123:2,5125:4,5126:4}[a.componentType],method={5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
    const off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>bin[method](off+i*stride+k*size)));
  };
  const mesh=name=>json.meshes.find(m=>m.name===name);
  const triangles=name=>mesh(name).primitives.flatMap(p=>{
    const v=values(p.attributes.POSITION),uv=values(p.attributes.TEXCOORD_0),normals=values(p.attributes.NORMAL),idx=values(p.indices).flat();
    return Array.from({length:idx.length/3},(_,i)=>({material:json.materials[p.material],
      points:idx.slice(i*3,i*3+3).map(k=>v[k]),uvs:idx.slice(i*3,i*3+3).map(k=>uv[k]),
      normals:idx.slice(i*3,i*3+3).map(k=>normals[k])}));
  });
  return{json,mesh,triangles,bytes};
}
const sourceBytes=read('public/assets/conservatory-acquisitions.glb');
const source=glb(sourceBytes),proof=glb(read('public/assets/hall-chandelier-proof.glb'));
const bounds=triangles=>({min:[0,1,2].map(k=>Math.min(...triangles.flatMap(t=>t.points.map(v=>v[k])))),max:[0,1,2].map(k=>Math.max(...triangles.flatMap(t=>t.points.map(v=>v[k]))))});
const rounded=point=>point.map(v=>Math.round(v*1e5)).join(',');
const triangleKey=t=>t.points.map((point,i)=>`${rounded(point)}:${rounded(t.uvs[i])}`).sort().join('|');
function sameTriangles(actual,expected,message){
  const a=actual.map(triangleKey).sort(),b=expected.map(triangleKey).sort();
  assert.equal(a.length,b.length,`${message}: triangle count`);
  // Keep a failing regression diagnostic bounded rather than dumping a whole mesh.
  const first=a.findIndex((key,i)=>key!==b[i]);
  assert.equal(first,-1,`${message}: first differing sorted triangle ${first}`);
}
function components(triangles){
  const parents=triangles.map((_,i)=>i),first=new Map();
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<triangles.length;i++)for(const point of triangles[i].points){const key=rounded(point);if(first.has(key))parents[root(i)]=root(first.get(key));else first.set(key,i);}
  const groups=new Map();for(let i=0;i<triangles.length;i++){const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(triangles[i]);}
  return[...groups.values()].map(triangles=>({triangles,...bounds(triangles)}));
}

test('the proof preserves every retained source body triangle and UV, with eighteen existing bulb envelopes',()=>{
  const original=source.triangles('chandelier_03'),groups=components(original);
  const canopy=groups.find(g=>g.max[1]>-.0001&&g.min[1]>-.10);
  const shackle=groups.find(g=>g.min[1]>-.101&&g.min[1]<-.095&&g.max[1]>-.09&&g.max[1]<-.08);
  const chain=groups.find(g=>g.min[1]>-.49&&g.min[1]<-.47&&g.max[1]>-.11&&g.max[1]<-.09);
  assert.ok(canopy&&shackle&&chain,'source load-path parts can be identified in shipped topology');
  const removed=new Set([...canopy.triangles,...shackle.triangles,...chain.triangles]);
  const expected=original.filter(t=>!removed.has(t));
  const actual=proof.triangles(G.meshNames.body);
  sameTriangles(actual,expected,'no ornament, holder or shade was duplicated, displaced or dropped');
  assert.equal(actual.length,stats.retainedBodyTriangles);
  assert.equal(stats.existingLampCount,18);
  const emitters=actual.filter(t=>t.material.extras?.chandelierRole==='lamp');
  const lamps=components(emitters);
  assert.equal(lamps.length,18,'eighteen physically separate existing glass envelopes emit');
  for(const lamp of lamps){
    const center=lamp.min.map((v,k)=>(v+lamp.max[k])/2);
    assert.ok(G.lamps.some(l=>Math.hypot(...center.map((v,k)=>v-l.emitterCenter[k]))<.00001),'light metadata matches packed emitting geometry');
  }
  assert.equal(emitters.length,G.lamps.reduce((n,lamp)=>n+lamp.emitterTriangles,0));
  assert.ok(actual.filter(t=>t.material.extras?.chandelierRole!=='lamp').every(t=>(t.material.emissiveFactor||[0,0,0]).every(x=>x===0)),'holders and body remain non-emitting');
});

test('both actual hall fixtures have a continuous suspension ending at their real ceiling',()=>{
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const instances=PROPS.renderInstances({inscriptions:false});
  for(const side of ['west','east']){
    const id=`acq-hall-chandelier-${side}`,p=instances.find(p=>p.id===id),authored=CONSERVATORY_PROPS.find(p=>p.id===id);
    const mesh=G.meshNames[`${side}Support`],triangles=proof.triangles(mesh),b=bounds(triangles);
    const sourceParts=components(source.triangles('chandelier_03'));
    const ceilingHead=sourceParts.filter(g=>(g.max[1]>-.0001&&g.min[1]>-.10)
      ||(g.min[1]>-.101&&g.min[1]<-.095&&g.max[1]>-.09&&g.max[1]<-.08));
    const expectedHead=ceilingHead.flatMap(g=>g.triangles).map(t=>({...t,
      points:t.points.map(p=>[p[0],p[1]+2.8,p[2]])}));
    const actualHead=triangles.filter(t=>!['old-suspension','replacement-suspension'].includes(t.material.extras?.chandelierRole));
    sameTriangles(actualHead,expectedHead,
      'complete original ceiling canopy and shackle relocate together, retaining their UVs');
    const ceil=FP.ceilAt(Math.round(authored.x*2),Math.round(authored.y*2));
    assert.ok(Math.abs(p.y+b.max[1]*p.scale-ceil)<.00002,`${side} ceiling rose meets actual ceiling`);
    assert.ok(b.min[1]<-.45&&b.max[1]>2.7999,'suspension reaches from body collar to relocated rose');
    for(let y=-.44;y<2.7;y+=.025){
      assert.ok(triangles.some(t=>Math.min(...t.points.map(p=>p[1]))<=y&&Math.max(...t.points.map(p=>p[1]))>=y),`${side} load path has no empty vertical band at ${y}`);
    }
    const links=stats.support[side].links;
    assert.ok(links.length>=50&&links.length<=65,'bounded, repeated chain assembly');
    assert.ok(links.every((link,i)=>!i||link.plane!==links[i-1].plane),'successive links use alternating planes');
    for(let i=1;i<links.length;i++){
      const a=links[i-1],b=links[i],taut=a.halfHeight+b.halfHeight-a.wireRadius-b.wireRadius;
      assert.ok(Math.abs(b.center[1]-a.center[1]-taut)<1e-8,'linked stock rests in contact under load');
    }
    assert.equal(links.filter(l=>l.replacement).length,side==='west'?6:0);
  }
  const west=proof.triangles(G.meshNames.westSupport),east=proof.triangles(G.meshNames.eastSupport);
  assert.ok(west.some(t=>t.material.extras?.chandelierRole==='replacement-suspension'));
  assert.ok(east.every(t=>t.material.extras?.chandelierRole!=='replacement-suspension'));
  const replaced=west.filter(t=>t.material.extras?.chandelierRole==='replacement-suspension');
  assert.ok(bounds(replaced).max[1]<0,'replacement finish belongs only to the lower links');
});

test('three local-light sectors derive from all eighteen actual lamps without a fictitious central bulb',()=>{
  assert.equal(G.sectors.length,3);
  assert.deepEqual(G.sectors.flatMap(s=>s.bulbIndices).sort((a,b)=>a-b),G.lamps.map(l=>l.index));
  for(const sector of G.sectors){
    const lamps=sector.bulbIndices.map(index=>G.lamps.find(lamp=>lamp.index===index));
    assert.equal(lamps.length,6);assert.equal(sector.weight,1/3);
    assert.equal(lamps.filter(l=>l.ring==='inner').length,2);
    const mean=[0,1,2].map(k=>lamps.reduce((n,lamp)=>n+lamp.emitterCenter[k],0)/lamps.length);
    assert.deepEqual(sector.center,mean);
    assert.ok(Math.hypot(sector.center[0],sector.center[2])>.15,'sector approximation remains spatially distributed');
  }
});

test('the isolated proof is provenance-checked and stays within declared renderer/resource limits',()=>{
  assert.equal(hash(sourceBytes),stats.sourceSHA256);
  assert.equal(hash(proof.bytes),stats.sha256);assert.equal(credits.sha256,stats.sha256);
  assert.equal(credits.originalArchiveSHA256,'455651002ca626d14825a1391b1c65bb6cd7023b893e4f71ce5158628df8389f');
  assert.equal(credits.license,'CC0-1.0');
  assert.deepEqual(new Set(proof.json.meshes.map(m=>m.name)),new Set(Object.values(G.meshNames)));
  assert.ok(stats.bytes<=stats.budgets.bytes&&stats.totalTriangles<=stats.budgets.storedTriangles);
  assert.ok(stats.pairedTriangles<=stats.budgets.pairedTriangles&&stats.pairedPrimitiveDraws<=stats.budgets.pairedPrimitiveDraws);
  assert.ok(proof.json.materials.every(m=>['OPAQUE','MASK'].includes(m.alphaMode||'OPAQUE')));
  assert.equal(proof.json.extensionsUsed,undefined);assert.equal(proof.json.animations,undefined);
  for(const mesh of proof.json.meshes)for(const primitive of mesh.primitives){
    assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
    assert.ok(Number.isInteger(primitive.attributes.NORMAL));
  }
  assert.ok(proof.json.materials.filter(m=>(m.emissiveFactor||[0,0,0]).some(v=>v>0)).every(m=>m.extras?.chandelierRole==='lamp'));
});
