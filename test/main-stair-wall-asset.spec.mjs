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

test('stair wall pack is one original project mesh inside explicit draw and byte budgets',()=>{
  assert.equal(gltf.meshes.length,1);assert.equal(mesh.name,'main_stair_wall_treatment');assert.equal(gltf.nodes.length,1);
  assert.deepEqual(mesh.extras.origin,MAIN_STAIR_WALL_ORIGIN);assert.equal(gltf.nodes[0].translation,undefined);
  assert.ok(bytes.length<2*1024*1024);assert.ok(primitives.length<=8);assert.equal(primitives.length,7);
  const triangles=primitives.reduce((n,p)=>n+p.ix.length/3,0);assert.ok(triangles<=30000);assert.equal(triangles,stats.totalTriangles);assert.equal(bytes.length,stats.bytes);
  assert.equal(gltf.images,undefined);assert.equal(gltf.textures,undefined);assert.equal(gltf.extensions?.KHR_lights_punctual,undefined);
  for(const m of gltf.materials){assert.notEqual(m.doubleSided,true);assert.equal(m.alphaMode,undefined);assert.equal(m.emissiveFactor,undefined);}
  assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(credits.pack.origin,'Original deterministic geometry; no downloaded imagery, textures or meshes.');
});

test('every actual packed vertex stays on its real bay and within the 6–75 mm relief envelope',()=>{
  assert.deepEqual(mesh.extras.sites.map(s=>s.id),MAIN_STAIR_WALL_SITES.map(s=>s.id));
  for(const site of MAIN_STAIR_WALL_SITES){const ps=cornersForSite(site.id);assert.ok(ps.length>1000,site.id);
    let min=Infinity,max=-Infinity;
    for(const p of ps){const world=p.map((v,k)=>v+MAIN_STAIR_WALL_ORIGIN[k]),relative=minus(world,site.origin),u=dot(relative,site.tangent),d=dot(relative,site.normal),v=relative[1];
      assert.ok(Math.abs(u)<=site.width/2+2e-6,`${site.id}: bay edge ${u}`);assert.ok(v>=-2e-6&&v<=site.height+2e-6,`${site.id}: elevation ${v}`);
      min=Math.min(min,d);max=Math.max(max,d);
      assert.ok(d>=.006-2e-6&&d<=.075+2e-6,`${site.id}: actual relief projection ${d}`);
    }
    assert.ok(min<=.006002&&max>=.074998,`${site.id}: backing/cornice physical depths absent`);
  }
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
  // An incision pigment can meet the mineral skin on the same closed solid;
  // material boundaries are not holes and must be welded across primitives.
  assert.equal([...edges.values()].filter(v=>v!==0).length,0,'unclosed or nonconforming cap edge');
  assert.ok(volume>0,'inward solid orientation');
});

test('three anonymous faces are broad continuous attached reliefs with real anatomical contour',()=>{
  assert.equal(mesh.extras.faces.length,3);assert.deepEqual(mesh.extras.faces.map(f=>f.kind).sort(),['intact','overpainted','sealed']);
  for(const f of mesh.extras.faces){assert.equal(f.construction,'continuous closed heightfield relief attached to plaster field');assert.ok(f.widthM>=.7&&f.heightM>=1.2);assert.equal(f.backingProjectionM,.009);
    const site=MAIN_STAIR_WALL_SITES.find(s=>s.id===f.site),points=cornersForSite(site.id).map(p=>{const r=minus(p.map((v,k)=>v+MAIN_STAIR_WALL_ORIGIN[k]),site.origin);return[dot(r,site.tangent),r[1],dot(r,site.normal)];});
    const back=points.filter(([u,v,d])=>Math.abs(d-.009)<2e-6&&Math.abs(u)<.381&&Math.abs(v-f.centre[1])<.621);assert.ok(back.length>=100,`${f.site}: closed attached backing missing`);
    // Face anatomy is one elliptical grid, not disconnected stacked primitives.
    const skin=points.filter(([u,v,d])=>(u/.38)**2+((v-f.centre[1])/.62)**2<=1.001&&d>.0159&&d<.074);
    assert.ok(new Set(skin.map(p=>p.map(v=>v.toFixed(5)).join(','))).size>=600,`${f.site}: continuous curved skin absent`);
    assert.ok(f.samples.nose>f.samples.leftEye+.009);assert.ok(Math.abs(f.samples.leftEye-f.samples.rightEye)<1e-6);assert.ok(f.samples.nose<=.075);
  }
  const intact=mesh.extras.faces.find(f=>f.kind==='intact'),paint=mesh.extras.faces.find(f=>f.kind==='overpainted'),sealed=mesh.extras.faces.find(f=>f.kind==='sealed');
  assert.ok(intact.samples.nose>paint.samples.nose&&paint.samples.nose>sealed.samples.nose);
});

test('intact mask has restrained pigment inside its actual closed-eye and lip relief; erased faces stay erased',()=>{
  const intact=mesh.extras.faces.find(f=>f.kind==='intact');assert.equal(intact.skinMaterial,'exposed ceramic biscuit');assert.equal(intact.recessPigmentMaterial,'dark green moulding undercut');assert.equal(intact.pigmentOnExistingSkinOnly,true);
  for(const n of Object.values(intact.recessPigmentTriangles))assert.ok(n>=2&&n<35);
  for(const f of mesh.extras.faces.filter(f=>f.kind!=='intact')){assert.equal(f.recessPigmentMaterial,null);assert.equal(Object.values(f.recessPigmentTriangles).reduce((a,b)=>a+b,0),0);}
  const p=primitives.find(p=>gltf.materials[p.material].name===intact.recessPigmentMaterial),site=MAIN_STAIR_WALL_SITES.find(s=>s.id===intact.site),range=p.extras.siteIndexRanges.find(r=>r.id===site.id);
  let actualIncisions=0;
  for(let k=range.firstIndex;k<range.firstIndex+range.indexCount;k+=3){const q=p.ix.slice(k,k+3).map(i=>{const r=minus(pos(p,i).map((v,j)=>v+MAIN_STAIR_WALL_ORIGIN[j]),site.origin);return[dot(r,site.tangent)/.38,(r[1]-intact.centre[1])/.62,dot(r,site.normal)];});
    if(q.every(([u,v,d])=>u*u+v*v<1.001&&d>.0159&&d<.074))actualIncisions++;
  }
  assert.equal(actualIncisions,Object.values(intact.recessPigmentTriangles).reduce((a,b)=>a+b,0));
});

test('site index receipts cover every shipped triangle exactly once',()=>{
  for(const p of primitives){let end=0;for(const r of p.extras.siteIndexRanges){assert.ok(MAIN_STAIR_WALL_SITES.some(s=>s.id===r.id));assert.equal(r.firstIndex,end);assert.equal(r.indexCount%3,0);end+=r.indexCount;}assert.equal(end,p.ix.length);}
  assert.equal(stats.features.newCollision,false);assert.equal(stats.features.newLights,0);assert.equal(stats.features.worldAnchored,true);
});
