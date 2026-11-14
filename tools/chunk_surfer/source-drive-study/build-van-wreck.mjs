// The same van, as the sea keeps it. Reads drive.glb's own body and cab, bends
// them through src/data/van-wreck.js (one deformation for mesh and scene), cuts
// the passenger cab door and the near rear door out as their own pieces, drops
// the smashed headlamp's diffuser, and writes van-wreck.glb with drive.glb's own
// materials and maps. No new paint, no proxy shell.
//   node tools/chunk_surfer/source-drive-study/build-van-wreck.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,mergeDocuments} from '@gltf-transform/functions';
import {VAN_WRECK,VAN_WRECK_ASSET,VAN_WRECK_CRASH,vanWreckPoint,vanWreckPieceOf} from '../../../src/data/van-wreck.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SOURCE=path.join(ROOT,'public/assets/source-drive/drive.glb');
const BRAND=path.join(ROOT,'public/assets/van-brand.glb');
const OUT=path.join(ROOT,'public',VAN_WRECK_ASSET);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

// Conforming refinement in the crush zone: an EDGE is split when it is long and
// lies in the zone, and every triangle splits by how many of its edges did, so
// neighbours always agree and the folds open no cracks.
function refine(pos,uv,tris,{zBelow,maxEdge}){
  const P=pos.slice(),U=uv?uv.slice():null;let T=tris.map(t=>t.slice());
  const point=i=>[P[i*3],P[i*3+1],P[i*3+2]];
  for(let pass=0;pass<8;pass++){
    const mid=new Map(),key=(a,b)=>a<b?a+'_'+b:b+'_'+a;
    const marked=(a,b)=>{const pa=point(a),pb=point(b);return dist(pa,pb)>maxEdge&&(pa[2]+pb[2])/2<zBelow;};
    const midpoint=(a,b)=>{const k=key(a,b);if(mid.has(k))return mid.get(k);const i=P.length/3;for(let c=0;c<3;c++)P.push((P[a*3+c]+P[b*3+c])/2);if(U)U.push((U[a*2]+U[b*2])/2,(U[a*2+1]+U[b*2+1])/2);mid.set(k,i);return i;};
    let changed=false;const next=[];
    for(const[a,b,c]of T){
      const e=[marked(a,b),marked(b,c),marked(c,a)],n=e.filter(Boolean).length;
      if(!n){next.push([a,b,c]);continue;}changed=true;
      if(n===3){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);continue;}
      // Rotate so the first split edge starts at v0.
      let v=[a,b,c],m=e;while(!m[0]){v=[v[1],v[2],v[0]];m=[m[1],m[2],m[0]];}
      const[v0,v1,v2]=v;
      if(n===1){const x=midpoint(v0,v1);next.push([v0,x,v2],[x,v1,v2]);}
      else if(m[1]){const x=midpoint(v0,v1),y=midpoint(v1,v2);next.push([v0,x,v2],[x,v1,y],[x,y,v2]);}
      else{const x=midpoint(v0,v1),z=midpoint(v2,v0);next.push([v0,x,z],[x,v1,v2],[x,v2,z]);}
    }
    T=next;if(!changed)break;
  }
  return{pos:P,uv:U,tris:T};
}

// Rear pigment is divided at the actual door seam before detaching the
// leaves. Otherwise a letter triangle can bridge from shingle to a sprung door.
function splitBrandRearSeam(fine){
 const pos=[],tris=[],point=i=>fine.pos.slice(i*3,i*3+3);
 const push=poly=>{for(let i=1;i<poly.length-1;i++){const tri=[poly[0],poly[i],poly[i+1]],n=cross(tri[1].map((v,k)=>v-tri[0][k]),tri[2].map((v,k)=>v-tri[0][k]));if(Math.hypot(...n)<1e-12)continue;const start=pos.length/3;tri.forEach(p=>pos.push(...p));tris.push([start,start+1,start+2]);}};
 const clip=(poly,side)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=side*a[0]>=0,ib=side*b[0]>=0;if(ia)out.push(a);if(ia!==ib){const t=-a[0]/(b[0]-a[0]);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;};
 for(const indices of fine.tris){const tri=indices.map(point);if(tri.every(p=>p[2]>2.4)){push(clip(tri,-1));push(clip(tri,1));}else push(tri);}
 return{pos,uv:null,tris};
}
const attachmentOf=key=>key==='brandRearDoor'?'rearDoor':key==='brandRearDoorFar'?'rearDoorFar':key;

export async function buildVanWreck(){
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc=await io.read(SOURCE),root=doc.getRoot(),buffer=root.listBuffers()[0];
  mergeDocuments(doc,await io.read(BRAND));
  const sources=new Map(root.listMeshes().map(m=>[m.getName(),m]));
  const out=Object.fromEntries(Object.entries(VAN_WRECK.meshes).map(([key,name])=>[key,doc.createMesh(name)]));
  const stats={triangles:Object.fromEntries(Object.keys(VAN_WRECK.meshes).map(k=>[k,0])),smashed:0,gone:0,torn:0,refined:0};
  for(const sourceName of ['drive_vehicle_body','drive_cabin',VAN_WRECK.brandSource]){
    const mesh=sources.get(sourceName);if(!mesh)throw Error('drive.glb lost '+sourceName);
    const offset=sourceName==='drive_cabin'?VAN_WRECK.cabinMount:[0,0,0];
    for(const prim of mesh.listPrimitives()){
      const material=prim.getMaterial(),matName=material?.getName()||'';
      const P0=prim.getAttribute('POSITION').getArray(),UV0=prim.getAttribute('TEXCOORD_0')?.getArray()||null;
      const I0=prim.getIndices()?.getArray()||Uint32Array.from({length:P0.length/3},(_,i)=>i);
      const moved=Array.from(P0,(v,i)=>v+offset[i%3]),tri0=[];for(let t=0;t<I0.length;t+=3)tri0.push([I0[t],I0[t+1],I0[t+2]]);
      const D=VAN_WRECK.subdivide,panel=matName===D.material?refine(moved,UV0?Array.from(UV0):null,tri0,{zBelow:Infinity,maxEdge:D.panelEdge}):null;
      let fine=panel?refine(panel.pos,panel.uv,panel.tris,D):{pos:moved,uv:UV0?Array.from(UV0):null,tris:tri0};
      if(sourceName===VAN_WRECK.brandSource)fine=splitBrandRearSeam(fine);
      const P=fine.pos,UV=fine.uv,I=fine.tris.flat();stats.refined+=fine.tris.length-tri0.length;
      const original=i=>[P[i*3],P[i*3+1],P[i*3+2]];
      const bent=new Map(),bend=i=>{if(!bent.has(i))bent.set(i,vanWreckPoint(original(i)));return bent.get(i);};
      const groups=new Map();
      for(let t=0;t<I.length;t+=3){
        const tri=[I[t],I[t+1],I[t+2]],c=[0,1,2].map(k=>tri.reduce((n,i)=>n+original(i)[k],0)/3);
        if(matName===VAN_WRECK.smashedLampMaterial&&Math.sign(c[0])===VAN_WRECK.smashedLampSide){stats.smashed++;continue;}
        const parentPiece=vanWreckPieceOf(sourceName===VAN_WRECK.brandSource?'drive_vehicle_body':sourceName,c);
        const key=sourceName===VAN_WRECK.brandSource?(parentPiece==='rearDoor'?'brandRearDoor':parentPiece==='rearDoorFar'?'brandRearDoorFar':'brand'):parentPiece;
        if(key==='gone'){stats.gone++;continue;}
        // Torn: a panel the bend stretched past fracture elongation. A hinged
        // door is a rigid panel and is not bent at all.
        if(!key.startsWith('brand')&&!VAN_WRECK.pieces[key]?.rigid){const stretch=Math.max(...[[0,1],[1,2],[2,0]].map(([i,j])=>dist(bend(tri[i]),bend(tri[j]))/Math.max(1e-6,dist(original(tri[i]),original(tri[j])))));
        if(stretch>VAN_WRECK_CRASH.tearStretch){stats.torn++;continue;}}
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tri);
      }
      for(const[key,tris]of groups){
        const remap=new Map(),pos=[],uv=[],idx=[],rigid=!!VAN_WRECK.pieces[attachmentOf(key)]?.rigid;
        for(const tri of tris)for(const i of tri){
          if(!remap.has(i)){remap.set(i,pos.length/3);pos.push(...(rigid?original(i):bend(i)));if(UV)uv.push(UV[i*2],UV[i*2+1]);}
          idx.push(remap.get(i));
        }
        // Normals follow the bent metal; the source's split vertices keep its hard edges.
        const nrm=new Float32Array(pos.length);
        for(let t=0;t<idx.length;t+=3){const[a,b,c]=[idx[t],idx[t+1],idx[t+2]].map(i=>pos.slice(i*3,i*3+3)),n=cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k]));for(const i of[idx[t],idx[t+1],idx[t+2]])for(let k=0;k<3;k++)nrm[i*3+k]+=n[k];}
        for(let i=0;i<nrm.length;i+=3){const l=Math.hypot(nrm[i],nrm[i+1],nrm[i+2])||1;nrm[i]/=l;nrm[i+1]/=l;nrm[i+2]/=l;}
        const p=doc.createPrimitive().setMaterial(material)
          .setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(Float32Array.from(pos)))
          .setAttribute('NORMAL',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(nrm))
          .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(Uint32Array.from(idx)));
        if(UV)p.setAttribute('TEXCOORD_0',doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(Float32Array.from(uv)));
        out[key].addPrimitive(p);stats.triangles[key]+=idx.length/3;
      }
    }
  }
  // Everything else in drive.glb leaves: this pack carries the wreck alone.
  const scene=root.listScenes()[0]||doc.createScene('van wreck');
  for(const node of root.listNodes())node.dispose();
  for(const m of root.listMeshes())if(!Object.values(out).includes(m))m.dispose();
  for(const[key,m]of Object.entries(out)){m.setExtras({vanWreck:VAN_WRECK.revision,piece:key,pivot:VAN_WRECK.pieces[attachmentOf(key)]?.pivot||null,frame:'drive.glb body frame; cab moved by cabinBodyMount before bending'});scene.addChild(doc.createNode(m.getName()).setMesh(m));}
  await doc.transform(prune());
  for(const extra of root.listBuffers().slice(1)){for(const a of root.listAccessors())if(a.getBuffer()===extra)a.setBuffer(buffer);extra.dispose();}
  const bytes=Buffer.from(await io.writeBinary(doc));
  return{bytes,stats};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const{bytes,stats}=await buildVanWreck();
  if(bytes.length>12*1024*1024)throw Error('van wreck budget exceeded '+bytes.length);
  fs.writeFileSync(OUT,bytes);
  const meta={schema:1,revision:VAN_WRECK.revision,bytes:bytes.length,sha256:sha(bytes),source:{path:'public/assets/source-drive/drive.glb',sha256:sha(fs.readFileSync(SOURCE))},brand:{path:'public/assets/van-brand.glb',sha256:sha(fs.readFileSync(BRAND))},crash:VAN_WRECK_CRASH,...stats};
  fs.writeFileSync(OUT.replace(/\.glb$/,'.json'),JSON.stringify(meta,null,2)+'\n');
  console.log(JSON.stringify(meta));
}
