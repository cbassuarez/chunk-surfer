import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildTreeCrown,TREE_CROWN_NAMES} from '../tools/chunk_surfer/tree-crown-geometry.mjs';
import {parseGlb,patchTreeCrowns,encodeGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

const packed=fs.readFileSync(new URL('../public/assets/vegetation.glb',import.meta.url)),pack=parseGlb(packed);
const get=index=>{const a=pack.json.accessors[index],v=pack.json.bufferViews[a.bufferView],width=({SCALAR:1,VEC2:2,VEC3:3})[a.type],bytes=({5126:4,5125:4,5123:2})[a.componentType],stride=v.byteStride||width*bytes,offset=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>a.componentType===5126?pack.bin.readFloatLE(offset+i*stride+k*bytes):bytes===4?pack.bin.readUInt32LE(offset+i*stride+k*bytes):pack.bin.readUInt16LE(offset+i*stride+k*bytes)));};
const faces=mesh=>mesh.primitives.flatMap(p=>{const points=get(p.attributes.POSITION),ids=get(p.indices).flat(),role=pack.json.materials[p.material].extras?.vegetationClass;return Array.from({length:ids.length/3},(_,i)=>({role,p:ids.slice(i*3,i*3+3).map(k=>points[k])}));});
const area=([a,b,c])=>{const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};
// Independent orthographic raster of actual exported leaf triangles, three
// street-facing azimuths. Fixed metre frame makes area/shape comparisons fair.
function mask(triangles,angle){const result=new Set(),size=64,to2=p=>[(p[0]*Math.cos(angle)+p[2]*Math.sin(angle)+3)/6*size,(p[1]-2)/3*size];
  for(const t of triangles.filter(t=>t.role==='leaf')){const[a,b,c]=t.p.map(to2),d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-8)continue;
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/d,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/d;if(u>=0&&v>=0&&u+v<=1)result.add(y*size+x);}
  }return result;
}
const metrics=[];
for(const[variant,base]of TREE_CROWN_NAMES.entries()){
  const tiers=[];
  for(let lod=0;lod<3;lod++){
    const name=base+(lod?`_lod${lod}`:''),mesh=pack.json.meshes.find(m=>m.name===name),triangles=faces(mesh),leafArea=triangles.filter(t=>t.role==='leaf').reduce((s,t)=>s+area(t.p),0),points=triangles.flatMap(t=>t.p),lo=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
    assert.ok(leafArea>24,`${name} retained broad-leaf surface: ${leafArea}`);
    assert.ok(lo[1]>=-.01&&hi[1]>=4.4&&hi[1]<=4.7,`${name} remains rooted and full height`);
    assert.ok(hi[0]-lo[0]<4.8&&hi[2]-lo[2]<4.8,`${name} stays within existing tree footprint`);
    assert.equal(mesh.primitives.length,2,'one opaque leaf and one stem draw');
    for(const p of mesh.primitives)assert.equal(pack.json.materials[p.material].alphaMode||'OPAQUE','OPAQUE','canopy silhouette does not depend on alpha coverage');
    const segments=mesh.extras.rootedSegments;assert.ok(segments.length>=25);
    for(const[sid,s]of segments.entries()){
      if(s.parent===null){assert.equal(sid,0);assert.deepEqual(s.a,[0,0,0]);continue;}
      assert.ok(s.parent<sid,'every branch has an earlier rooted parent');
      assert.ok(Math.hypot(...s.a.map((n,i)=>n-segments[s.parent].b[i]))<1e-7,'branch base meets parent tip');
    }
    assert.equal(mesh.extras.crownClusters.length,13,'all crown volumes survive every LOD');
    for(const cluster of mesh.extras.crownClusters)assert.ok(Math.hypot(...cluster.centre.map((n,i)=>n-segments[cluster.branch].b[i]))<1e-7,'each crown terminates a rooted bough');
    const masks=[0,Math.PI/2,Math.PI/4].map(a=>mask(triangles,a));for(const m of masks)assert.ok(m.size>600,`${name} has substantial projected crown area`);
    tiers.push({masks,triangles:triangles.length});metrics.push({name,triangles:triangles.length,leafAreaM2:leafArea,projectedPixels:masks.map(m=>m.size),bounds:{min:lo,max:hi}});
    assert.deepEqual(buildTreeCrown(variant,lod),buildTreeCrown(variant,lod),'geometry deterministic');
  }
  for(let lod=1;lod<3;lod++)for(let view=0;view<3;view++){
    const a=tiers[0].masks[view],b=tiers[lod].masks[view],intersection=[...a].filter(i=>b.has(i)).length,iou=intersection/(a.size+b.size-intersection);
    assert.ok(iou>.69,`${base} LOD${lod} retains projected silhouette: ${iou}`);
  }
  assert.ok(tiers[0].triangles>tiers[1].triangles&&tiers[1].triangles>tiers[2].triangles);
}
assert.deepEqual(encodeGlb(...Object.values(patchTreeCrowns(pack))),packed,'rebuilding current crowns is byte deterministic and does not grow the pack');
const report=JSON.parse(fs.readFileSync(new URL('../artifacts/tree-crown-rebuild.json',import.meta.url),'utf8'));
for(const[name,fingerprint]of Object.entries(report.nonTreeFingerprints))assert.equal(meshFingerprint(pack,pack.json.meshes.find(m=>m.name===name)),fingerprint,`${name} original plant bytes retained`);
console.log(JSON.stringify({status:'pass',metrics},null,2));
