import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MAIN_STAIR_WALL_SITES, MAIN_STAIR_WALL_ORIGIN } from '../src/data/main-stair-wall-treatment.js';

const url=new URL('../public/assets/conservatory-stair-walls.glb',import.meta.url),bytes=fs.readFileSync(url);
assert.equal(bytes.readUInt32LE(0),0x46546c67);
const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),binStart=28+jsonLength;
function accessor(index){const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type],out=[];for(let i=0;i<a.count*n;i++)out.push(a.componentType===5126?bytes.readFloatLE(binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*4):bytes.readUInt32LE(binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*4));return out;}
const mesh=gltf.meshes[0],stats=JSON.parse(fs.readFileSync(new URL('../public/assets/conservatory-stair-walls.stats.json',import.meta.url))),credits=JSON.parse(fs.readFileSync(new URL('../public/assets/conservatory-stair-walls.credits.json',import.meta.url)));
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),minus=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const primitives=mesh.primitives.map(p=>({...p,positions:accessor(p.attributes.POSITION),normals:accessor(p.attributes.NORMAL),ix:accessor(p.indices)}));
const pos=(p,i)=>p.positions.slice(i*3,i*3+3);
function cornersForSite(id){const out=[];for(const p of primitives)for(const r of p.extras.siteIndexRanges)if(r.id===id)for(const i of p.ix.slice(r.firstIndex,r.firstIndex+r.indexCount))out.push(pos(p,i));return out;}
function localCorners(id,material){const site=MAIN_STAIR_WALL_SITES.find(s=>s.id===id),out=[];for(const p of primitives){if(material&&gltf.materials[p.material].name!==material)continue;for(const r of p.extras.siteIndexRanges)if(r.id===id)for(const i of p.ix.slice(r.firstIndex,r.firstIndex+r.indexCount)){const q=minus(pos(p,i).map((v,k)=>v+MAIN_STAIR_WALL_ORIGIN[k]),site.origin);out.push([dot(q,site.tangent),q[1],dot(q,site.normal)]);}}return out;}
function hasPoint(points,want,label){assert.ok(points.some(p=>Math.hypot(...minus(p,want))<3e-6),`${label}: packed point ${want} absent`);}

test('stair wall pack is one original project mesh inside explicit draw and byte budgets',()=>{
  assert.equal(gltf.meshes.length,1);assert.equal(mesh.name,'main_stair_wall_treatment');assert.equal(gltf.nodes.length,1);
  assert.deepEqual(mesh.extras.origin,MAIN_STAIR_WALL_ORIGIN);assert.equal(gltf.nodes[0].translation,undefined);
  assert.ok(bytes.length<2*1024*1024);assert.ok(primitives.length<=10);assert.equal(primitives.length,stats.materialBatches);
  const triangles=primitives.reduce((n,p)=>n+p.ix.length/3,0);assert.ok(triangles<=50000);assert.equal(triangles,stats.totalTriangles);assert.equal(bytes.length,stats.bytes);
  assert.equal(gltf.images,undefined);assert.equal(gltf.textures,undefined);assert.equal(gltf.extensions?.KHR_lights_punctual,undefined);
  for(const m of gltf.materials){assert.notEqual(m.doubleSided,true);assert.equal(m.alphaMode,undefined);assert.equal(m.emissiveFactor,undefined);}
  assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(credits.pack.origin,'Original deterministic geometry; no downloaded imagery, textures or meshes.');
});

test('every actual packed vertex stays on its real bay and within its 6–150 mm architectural envelope',()=>{
  assert.deepEqual(mesh.extras.sites.map(s=>s.id),MAIN_STAIR_WALL_SITES.map(s=>s.id));
  for(const site of MAIN_STAIR_WALL_SITES){const ps=cornersForSite(site.id);assert.ok(ps.length>1000,site.id);
    let min=Infinity,max=-Infinity;
    for(const p of ps){const world=p.map((v,k)=>v+MAIN_STAIR_WALL_ORIGIN[k]),relative=minus(world,site.origin),u=dot(relative,site.tangent),d=dot(relative,site.normal),v=relative[1];
      assert.ok(Math.abs(u)<=site.width/2+2e-6,`${site.id}: bay edge ${u}`);assert.ok(v>=-2e-6&&v<=site.height+2e-6,`${site.id}: elevation ${v}`);
      min=Math.min(min,d);max=Math.max(max,d);
      assert.ok(d>=.006-2e-6&&d<=site.maxProjection-.01+2e-6,`${site.id}: actual architectural projection ${d}`);
    }
    assert.ok(min<=.006002&&max>=site.maxProjection-.010002,`${site.id}: backing/cornice physical depths absent`);
  }
});

test('all clipped lower architectural triangles remain inside the 25 mm body-clearance envelope',()=>{
  let clippedTriangles=0,max=-Infinity;
  for(const p of primitives)for(const r of p.extras.siteIndexRanges){const site=MAIN_STAIR_WALL_SITES.find(s=>s.id===r.id);for(let k=r.firstIndex;k<r.firstIndex+r.indexCount;k+=3){
    const points=p.ix.slice(k,k+3).map(i=>{const q=minus(pos(p,i).map((v,j)=>v+MAIN_STAIR_WALL_ORIGIN[j]),site.origin);return[dot(q,site.tangent),q[1],dot(q,site.normal)];}),below=[];
    for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3],ia=a[1]<=2,ib=b[1]<=2;if(ia)below.push(a);if(ia!==ib){const t=(2-a[1])/(b[1]-a[1]);below.push(a.map((v,j)=>v+(b[j]-v)*t));}}
    if(below.length)clippedTriangles++;
    for(const q of below){max=Math.max(max,q[2]);assert.ok(q[2]<=.025+2e-6,`${site.id}: lower triangle intrudes ${q[2]} m`);}
  }}
  assert.ok(clippedTriangles>10000);assert.ok(max>.024&&max<=.025+2e-6);
});

test('triangle winding and finite unit normals agree throughout the shipped single-sided pack',()=>{
  for(const p of primitives){assert.equal(p.normals.length,p.positions.length);for(let i=0;i<p.normals.length;i+=3){const n=p.normals.slice(i,i+3);assert.ok(n.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<2e-5);}
    for(let j=0;j<p.ix.length;j+=3){const ids=p.ix.slice(j,j+3);for(const i of ids)assert.ok(i>=0&&i<p.positions.length/3);
      const ps=ids.map(i=>pos(p,i)),geo=cross(minus(ps[1],ps[0]),minus(ps[2],ps[0])),sum=[0,1,2].map(k=>ids.reduce((s,i)=>s+p.normals[i*3+k],0));
      assert.ok(Math.hypot(...geo)>1e-10,`degenerate triangle ${j/3}`);assert.ok(dot(geo,sum)>0,`inside-facing triangle ${j/3}`);
    }
  }
});

test('architectural profiles and reliefs are closed solids with conforming cap boundaries',()=>{
  const edges=new Map();let volume=0;
  for(const p of primitives){
    for(let j=0;j<p.ix.length;j+=3){const ps=p.ix.slice(j,j+3).map(i=>pos(p,i)),keys=ps.map(q=>q.map(v=>Math.round(v*1e5)).join(','));
      volume+=dot(ps[0],cross(ps[1],ps[2]))/6;
      for(let k=0;k<3;k++){const a=keys[k],b=keys[(k+1)%3],key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+(a<b?1:-1));}
    }
  }
  // Gilding and plaster can share a solid. Material boundaries must be
  // welded across primitives; matching one material alone is insufficient.
  assert.equal([...edges.values()].filter(v=>v!==0).length,0,'unclosed or nonconforming cap edge');
  assert.ok(volume>0,'inward solid orientation');
});

test('four high-silled blind aedicules have actual moulded arch depth and retain no figural masks',()=>{
  assert.equal(mesh.extras.architectureRevision,2);assert.deepEqual(mesh.extras.faces,[]);assert.deepEqual(stats.faces,[]);
  const aedicules=mesh.extras.sites.filter(s=>s.architecture.type==='blind arched aedicule');assert.equal(aedicules.length,4);
  assert.equal(aedicules.filter(s=>s.architecture.anomaly).length,3);assert.equal(stats.features.continuousHeightfieldMasks,0);
  for(const s of aedicules){const a=s.architecture,points=localCorners(s.id,'retained warm lime plaster'),D=MAIN_STAIR_WALL_SITES.find(q=>q.id===s.id).maxProjection-.01;
    assert.equal(a.openingIsUsable,false);assert.ok(a.baseM>2);assert.equal(a.pairedSupports,true);
    // Inspect every actual high arch station, rather than trusting the receipt
    // that calls it moulded: its broad raised bead must exist in the pack.
    for(let i=0;i<=24;i++){const angle=i/24*Math.PI;hasPoint(points,[Math.cos(angle)*(a.innerRadiusM+.105),a.springM+Math.sin(angle)*(a.innerRadiusM+.105),D*.94],`${s.id} archivolt`);}
  }
});

test('construction anomalies are modelled plugs and conflicting orders, including a 560 mm pinch and stepped cornice',()=>{
  const byId=new Map(mesh.extras.sites.map(s=>[s.id,s])),brick=byId.get('ground-south-east').architecture,narrow=byId.get('ground-west-south').architecture,strained=byId.get('upper-west-south').architecture;
  assert.equal(brick.anomaly,'bricked former window');assert.equal(narrow.anomaly,'narrowed repair');assert.equal(strained.anomaly,'inward strain and displaced cornice');
  const brickPoints=localCorners('ground-south-east','exposed ceramic biscuit');for(const front of[.047,.051,.055])assert.ok(brickPoints.some(p=>Math.abs(p[2]-front)<2e-6),`individual brick front ${front} absent`);
  const narrowPoints=localCorners('ground-west-south','later ivory paint'),D=.15;
  hasPoint(narrowPoints,[-.20,narrow.springM+.13,D*.96],'repair crosses original bead');
  assert.ok(narrow.infill.repairedWidthM<narrow.infill.originalWidthM);assert.equal(narrow.infill.centreM,.17);
  const points=localCorners('upper-west-south','later ivory paint');assert.equal(strained.infill.springWidthM,.56);
  for(const sign of[-1,1])hasPoint(points,[sign*.28,strained.springM,.047],'converging infill spring');
  const fold=strained.foldedCornice;assert.equal(fold.sectionHeightM,.15);assert.equal(fold.fallM,.35);assert.equal(fold.reappears,true);
  assert.ok(fold.path.some(p=>p[2]<fold.infillFrontM));assert.ok(fold.path[0][2]>fold.infillFrontM&&fold.path.at(-1)[2]>fold.infillFrontM);
  assert.ok(Math.abs(fold.path[0][1]-fold.path.at(-1)[1]-.35)<1e-9);
  const plaster=localCorners('upper-west-south','retained warm lime plaster');
  for(let i=0;i<fold.path.length;i++){const p=fold.path[i],a=fold.path[Math.max(0,i-1)],b=fold.path[Math.min(fold.path.length-1,i+1)],t=minus(b,a),length=Math.hypot(...t);for(let k=0;k<3;k++)t[k]/=length;const up=[-t[1],t[0],0],ul=Math.hypot(...up);for(let k=0;k<3;k++)up[k]/=ul;const out=cross(t,up),ol=Math.hypot(...out);for(let k=0;k<3;k++)out[k]/=ol;
    for(const[v,d]of fold.section)hasPoint(plaster,p.map((q,k)=>q+up[k]*v+out[k]*d),'closed stepped cornice section');
  }
});

test('site index receipts cover every shipped triangle exactly once',()=>{
  for(const p of primitives){let end=0;for(const r of p.extras.siteIndexRanges){assert.ok(MAIN_STAIR_WALL_SITES.some(s=>s.id===r.id));assert.equal(r.firstIndex,end);assert.equal(r.indexCount%3,0);end+=r.indexCount;}assert.equal(end,p.ix.length);}
  assert.equal(stats.features.newCollision,false);assert.equal(stats.features.newLights,0);assert.equal(stats.features.worldAnchored,true);
});
