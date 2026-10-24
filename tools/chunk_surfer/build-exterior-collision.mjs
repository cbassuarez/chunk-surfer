// Derive collision from the exact placed exterior skins; never replace a
// walkable institution or a pub doorway with one bounding box.
// After either conservatory-props.glb or opening-street.glb is rebuilt, run:
//   node tools/chunk_surfer/build-exterior-collision.mjs
// The focused suite fingerprints each selected mesh and rejects stale data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,meshFingerprint} from './rebuild-tree-crowns.mjs';

const BASE_MESHES = Object.freeze([
  'conservatory_west_elevation', 'district_terrace_frontage',
  'district_civic_frontage', 'district_workshop_frontage',
  'district_passage_frontage', 'district_court_walls',
]);
export const EXTERIOR_COLLISION_ASSETS=Object.freeze([
  Object.freeze({asset:'public/assets/conservatory-props.glb',meshes:BASE_MESHES}),
  Object.freeze({asset:'public/assets/opening-street.glb',meshes:Object.freeze(['opening_street_frontage','opening_street_service_history'])}),
]);
export const EXTERIOR_COLLISION_MESHES=Object.freeze(EXTERIOR_COLLISION_ASSETS.flatMap(source=>source.meshes));
const rounded=n=>Math.round(n*100000)/100000;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export function readExteriorAccessor(pack,id){
  const a=pack.json.accessors[id],view=pack.json.bufferViews[a.bufferView];
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
  const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
  if(!components||!read)throw Error(`Unsupported exterior accessor ${id}`);
  const start=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||size*components;
  return Array.from({length:a.count},(_,i)=>Array.from({length:components},(_,k)=>pack.bin[read](start+i*stride+k*size)));
}

export function extractExteriorCollision(pack,names=BASE_MESHES){
  const meshes={};
  for(const name of names){
    const meshIndex=pack.json.meshes.findIndex(m=>m.name===name),mesh=pack.json.meshes[meshIndex];
    if(!mesh)throw Error(`Missing exterior skin ${name}`);
    // These authored packs bake their source node transforms. A future exporter
    // must keep that contract, rather than silently moving drawing off physics.
    const referenced=(pack.json.nodes||[]).map((node,index)=>({node,index})).filter(({node})=>node.mesh===meshIndex);
    for(const entry of referenced){
      let current=entry;
      while(current){
        const node=current.node,identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
        const same=(a,b)=>!a||a.every((v,i)=>Math.abs(v-b[i])<1e-8);
        if(!same(node.translation,[0,0,0])||!same(node.rotation,[0,0,0,1])||!same(node.scale,[1,1,1])||!same(node.matrix,identity))throw Error(`${name}: bake source node transforms before generating exterior collision`);
        const parent=(pack.json.nodes||[]).findIndex(n=>n.children?.includes(current.index));
        current=parent<0?null:{node:pack.json.nodes[parent],index:parent};
      }
    }
    const rectangles=new Map(),triangles=[],seen=new Set();
    let inputTriangles=0,verticalTriangles=0;
    for(const primitive of mesh.primitives){
      if((primitive.mode??4)!==4)throw Error(`Non-triangle exterior primitive: ${name}`);
      const positions=readExteriorAccessor(pack,primitive.attributes.POSITION),indices=readExteriorAccessor(pack,primitive.indices).flat();
      for(let k=0;k<indices.length;k+=3){
        inputTriangles++;
        const vertices=indices.slice(k,k+3).map(i=>positions[i].map(rounded));
        const [a,b,c]=vertices,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
        const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const area2=Math.hypot(...normal);
        // Walls, closed shop leaves, piers and vertical cylinder faces. Sloping
        // roofs, upward floors and downward soffits never become body walls.
        if(area2<1e-8||Math.abs(normal[1])>area2*.0001)continue;
        verticalTriangles++;
        const canonical=vertices.map(p=>p.join(',')).sort().join('|');
        if(seen.has(canonical))continue;seen.add(canonical);
        const points=[...new Map(vertices.map(p=>[`${p[0]},${p[2]}`,[p[0],p[2]]])).values()].sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
        const minY=Math.min(...vertices.map(p=>p[1])),maxY=Math.max(...vertices.map(p=>p[1]));
        if(points.length===2){
          const [p,q]=points,key=[...p,...q,minY,maxY].join(',');
          let group=rectangles.get(key);
          if(!group){group={wall:[...p,...q,minY,maxY],area:0,vertices:new Set(),triangles:[]};rectangles.set(key,group);}
          group.area+=area2/2;group.triangles.push(vertices.flat());
          vertices.forEach(p=>group.vertices.add(p.join(',')));
        }else triangles.push(vertices.flat());
      }
    }
    const walls=[];
    for(const group of rectangles.values()){
      const [x0,z0,x1,z1,y0,y1]=group.wall,expected=Math.hypot(x1-x0,z1-z0)*(y1-y0);
      // Two exact source triangles must cover the rectangle before merging.
      // A triangular gable/reveal keeps its actual height profile instead.
      if(group.vertices.size===4&&Math.abs(group.area-expected)<Math.max(1e-6,expected*1e-5))walls.push(group.wall);
      else triangles.push(...group.triangles);
    }
    walls.sort((a,b)=>a.join(',').localeCompare(b.join(',')));
    triangles.sort((a,b)=>a.join(',').localeCompare(b.join(',')));
    meshes[name]={sha256:meshFingerprint(pack,mesh),inputTriangles,verticalTriangles,walls,triangles};
  }
  return meshes;
}

export function buildExteriorCollision({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),write=true}={}){
  const sources=[],meshes={};
  for(const source of EXTERIOR_COLLISION_ASSETS){
    const bytes=fs.readFileSync(path.join(root,source.asset)),pack=parseGlb(bytes),selected=extractExteriorCollision(pack,source.meshes);
    sources.push({asset:source.asset,sha256:sha(bytes),meshes:source.meshes});
    for(const[name,data]of Object.entries(selected))meshes[name]={asset:source.asset,...data};
  }
  const metadata={version:1,source:sources[0].asset,sourceSha256:sources[0].sha256,sources,
    generator:'tools/chunk_surfer/build-exterior-collision.mjs',coordinateSpace:'exact mesh local metres, Y-up; apply the actual placed render-instance matrix',
    rebuildCommand:'node tools/chunk_surfer/build-exterior-collision.mjs',
    derivation:'vertical source triangles only; coplanar rectangular pairs merged without filling apertures; floors, slopes and soffits excluded',
    meshCount:Object.keys(meshes).length,wallCount:Object.values(meshes).reduce((n,m)=>n+m.walls.length,0),triangleCount:Object.values(meshes).reduce((n,m)=>n+m.triangles.length,0)};
  if(write)fs.writeFileSync(path.join(root,'src/data/generated/exterior-collision.js'),
    '// Generated from the exact exterior GLB by build-exterior-collision.mjs.\n'+
    `export const EXTERIOR_COLLISION_SOURCE = Object.freeze(${JSON.stringify(metadata)});\n`+
    `export const EXTERIOR_COLLISION_GEOMETRY = Object.freeze(${JSON.stringify(meshes)});\n`);
  return{metadata,meshes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildExteriorCollision().metadata,null,2));
