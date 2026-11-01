// A detached copy of actual Scene Dock construction. Never writes the shared
// conservatory pack. Triangles, source materials and UVs retain their origin.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,encodeGlb} from './rebuild-tree-crowns.mjs';
import {readBusAccessor as read} from './build-outskirts-bus-passage.mjs';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import {doorAssembly} from '../../src/data/source-door-fields.js';
import {PROP_BOUNDS} from '../../src/data/generated/prop-geometry.js';
import {CELL} from '../../src/data/floorplan/legend.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C,SOURCE_ELLERY_ASIDE_PANELS as PANELS} from '../../src/data/source-earthfall-ellery-aside.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),align=n=>(n+3)&~3;
const PREFIX='earthfall_ellery_';
const source=fs.readFileSync(path.join(ROOT,'public/assets/conservatory-props.glb')),pack=parseGlb(source);
const meshByName=new Map(pack.json.meshes.map(m=>[m.name,m]));
const architecture=['getin_sightline_shell','scene_dock_roof_structure','scene_dock_room_fabric'];
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const doors=FP.doorState().filter(d=>['dock-grey-exterior','dock-inner-service','dock-foyer-service'].includes(d.id)).map(d=>{
 const p=FP.logicalToPhysical(d.cx,d.cy),assembly=doorAssembly(d.archetype,{hinge:d.hinge,activeLeaves:d.activeLeaves});
 return{id:d.id,x:p.x*CELL,y:p.y,z:p.z*CELL,yaw:d.widthAxis==='x'?0:Math.PI/2,archetype:d.archetype,hinge:d.hinge,activeLeaves:d.activeLeaves,assembly,panel:d.id==='dock-grey-exterior'?'west':d.id==='dock-inner-service'?'south':'east'};
});
const externalProps=PROPS.renderSelectedHosts({select:p=>p.id==='dock-chandelier-intact'}).map(p=>({...p,sourcePack:'conservatory-acquisitions.glb'}));
const picked=PROPS.renderSelectedHosts({select:p=>p.id.startsWith('dock-')&&!architecture.includes(p.mesh)&&!['dock-scene-fabric','dock-scene-roof'].includes(p.id)&&p.x>=57&&p.x<=74.5&&p.y>=3&&p.y<=16&&p.mesh&&!/spent|check_position/.test(p.id)}).filter(p=>meshByName.has(p.mesh));
// Finite construction pieces retain the native fabric. The wall courses are
// bonded before fracture; no entire wall or room is a folding/scaling leaf.
const groups=new Map(),pieceSpecs=new Map(),domains=new Map(PANELS.map(p=>[p.id,p]));
for(const panel of PANELS){
 const floor=panel.kind==='floor',roof=panel.kind==='timber',horizontal=floor||roof;
 const u0=horizontal?(panel.id.endsWith('west')?C.room.minX:C.center.x):(panel.axis===0?C.room.minX-.25:C.room.minZ-.25),u1=horizontal?(panel.id.endsWith('west')?C.center.x:C.room.maxX):(panel.axis===0?C.room.maxX+.9:C.room.maxZ+.65);
 const v0=horizontal?C.room.minZ-.25:-.015,v1=horizontal?C.room.maxZ+.65:5.56;
 for(let row=0;row<panel.rows;row++)for(let column=0;column<panel.columns;column++){
  const a=u0+(u1-u0)*column/panel.columns,b=u0+(u1-u0)*(column+1)/panel.columns,c=v0+(v1-v0)*row/panel.rows,d=v0+(v1-v0)*(row+1)/panel.rows,id=`${panel.id}:${row}:${column}`;
  const bounds=horizontal?[a,b,-.1,5.56,c,d]:panel.axis===0?[a,b,c,d,-100,100]:[-100,100,c,d,a,b];
  pieceSpecs.set(id,{id,host:panel.id,kind:panel.kind,row,column,bounds,clipAxes:horizontal?[0,2]:[panel.axis,1],pivot:horizontal?[(a+b)/2,roof?5.18:0,(c+d)/2]:panel.axis===0?[(a+b)/2,(c+d)/2,panel.pivot[2]]:[panel.pivot[0],(c+d)/2,(a+b)/2]});groups.set(id,new Map());
 }
}
const grp=(id,material)=>{if(!groups.has(id))groups.set(id,new Map());const g=groups.get(id);if(!g.has(material))g.set(material,{p:[],n:[],uv:[],i:[]});return g.get(material);};
const mix=(a,b,t)=>({p:a.p.map((n,k)=>n+(b.p[k]-n)*t),n:a.n.map((n,k)=>n+(b.n[k]-n)*t),uv:a.uv.map((n,k)=>n+(b.uv[k]-n)*t)});
function split(poly,axis,value,keepLower){const yes=[],no=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=keepLower?a.p[axis]<=value:a.p[axis]>=value,ib=keepLower?b.p[axis]<=value:b.p[axis]>=value;(ia?yes:no).push(a);if(ia!==ib){const q=mix(a,b,(value-a.p[axis])/(b.p[axis]-a.p[axis]));yes.push(q);no.push(q);}}return[yes,no];}
function outsideBox(poly,box){let inside=poly,out=[];for(const[axis,value,lower]of [[0,box[0],false],[0,box[1],true],[1,box[2],false],[1,box[3],true],[2,box[4],false],[2,box[5],true]]){const[a,b]=split(inside,axis,value,lower);if(b.length>=3)out.push(b);inside=a;if(inside.length<3)break;}return out;}
function addPiece(id,mat,poly){const g=grp(id,mat);for(let k=1;k<poly.length-1;k++)for(const v of[poly[0],poly[k],poly[k+1]]){g.i.push(g.p.length/3);g.p.push(...v.p);g.n.push(...v.n);g.uv.push(...v.uv);}}
function add(id,mat,poly){
 if(!domains.has(id)){addPiece(id,mat,poly);return;}
 for(const spec of pieceSpecs.values())if(spec.host===id){let clipped=poly;for(const axis of spec.clipAxes){clipped=split(clipped,axis,spec.bounds[axis*2],false)[0];if(clipped.length<3)break;clipped=split(clipped,axis,spec.bounds[axis*2+1],true)[0];if(clipped.length<3)break;}if(clipped.length>=3)addPiece(spec.id,mat,clipped);}
}
for(const name of architecture){const m=meshByName.get(name);if(!m)throw Error('Actual Scene Dock mesh missing:'+name);for(const primitive of m.primitives){const p=read(pack,primitive.attributes.POSITION),n=read(pack,primitive.attributes.NORMAL),uv=read(pack,primitive.attributes.TEXCOORD_0),idx=read(pack,primitive.indices);for(let k=0;k<idx.length;k+=3){let poly=idx.slice(k,k+3).map(i=>({p:[p[i*3]+53,p[i*3+1],p[i*3+2]+7.5],n:n.slice(i*3,i*3+3),uv:uv.slice(i*2,i*2+2)}));
 if(name==='getin_sightline_shell'&&poly.every(v=>v.p[1]<.1))continue;
 const center=[0,1,2].map(a=>poly.reduce((s,v)=>s+v.p[a],0)/3),near=[['west',Math.abs(center[0]-57.25)],['east',Math.abs(center[0]-73.25)],['north',Math.abs(center[2]-3.25)],['south',Math.abs(center[2]-15.25)]].sort((a,b)=>a[1]-b[1])[0][0];
 let id=center[1]<.08?(center[0]<C.center.x?'floor-west':'floor-east'):name==='scene_dock_roof_structure'&&center[1]>4.5?(center[0]<C.center.x?'roof-west':'roof-east'):near;
 let polys=[poly];if(!id.startsWith('floor')&&!id.startsWith('roof'))for(const door of doors.filter(d=>d.panel===id)){
 const w=door.assembly.opening.width+.10,depth=id==='east'?1.35:.42,box=id==='west'||id==='east'?[door.x-depth,door.x+depth,-.06,door.assembly.opening.height+.10,door.z-w/2,door.z+w/2]:[door.x-w/2,door.x+w/2,-.06,door.assembly.opening.height+.10,door.z-depth,door.z+depth];polys=polys.flatMap(p=>outsideBox(p,box));}
 // Split floor and roof crossing the center so each leaf retains its real
 // shared seam instead of carrying half of its neighbour through the fold.
 if(id.startsWith('floor')||id.startsWith('roof')){const type=id.startsWith('floor')?'floor':'roof';for(const p of polys){const[a,b]=split(p,0,C.center.x,true);if(a.length>=3)add(type+'-west',primitive.material,a);if(b.length>=3)add(type+'-east',primitive.material,b);}}else for(const p of polys)add(id,primitive.material,p);
}}}
// Open leaves expose actual short, blind masonry returns. Their opaque backs
// are visible and collidable; an open frame never ends at an invisible jail.
const brick=pack.json.materials.findIndex(m=>m.name==='municipal glazed brick'),concrete=pack.json.materials.findIndex(m=>m.name==='board marked concrete');
function face(id,mat,points,normal){add(id,mat,points.map(p=>({p,n:normal,uv:[(p[0]+p[2])*.5,p[1]*.5]})));}
for(const d of doors){
 const host=d.panel;d.panel='return:'+d.id;pieceSpecs.set(d.panel,{id:d.panel,host,kind:'portal',row:0,column:0,pivot:[d.x,1.6,d.z]});
 const n=host==='west'?[-1,0,0]:host==='east'?[1,0,0]:[0,0,1],u=[-n[2],0,n[0]],half=d.assembly.opening.width/2+.12,depth=2.15,h=d.assembly.opening.height+.15;
 const start=host==='east'?-1.1:0;d.blindStart=start;d.host=host;
 const point=(a,y,b)=>[d.x+u[0]*a+n[0]*b,y,d.z+u[2]*a+n[2]*b];
 face(d.panel,brick,[point(-half,0,depth),point(half,0,depth),point(half,h,depth),point(-half,h,depth)],n.map(v=>-v));
 for(const side of[-1,1])face(d.panel,brick,[point(side*half,0,start),point(side*half,h,start),point(side*half,h,depth),point(side*half,0,depth)],u.map(v=>-v*side));
 face(d.panel,concrete,[point(-half,0,start),point(-half,0,depth),point(half,0,depth),point(half,0,start)],[0,1,0]);
 face(d.panel,brick,[point(-half,h,start),point(half,h,start),point(half,h,depth),point(-half,h,depth)],[0,-1,0]);
 d.blindDepth=depth;d.outward=n;d.halfWidth=half;
}
// Joint faces expose a finite masonry core when mortar bonds open. Do not cap
// an original doorway aperture: the three real openings remain sight-clear.
for(const spec of pieceSpecs.values())if(spec.kind==='masonry'){
 const panel=domains.get(spec.host),axis=panel.axis,u0=spec.bounds[axis*2],u1=spec.bounds[axis*2+1],y0=Math.max(0,spec.bounds[2]),y1=Math.min(5.5,spec.bounds[3]),fixed=panel.pivot[axis===0?2:0],thickness=.22;
 const point=(u,y,v)=>axis===0?[u,y,fixed+v]:[fixed+v,y,u];
 const caps=[{p:[point(u0,y0,-thickness/2),point(u0,y0,thickness/2),point(u0,y1,thickness/2),point(u0,y1,-thickness/2)],n:axis===0?[-1,0,0]:[0,0,-1]},
 {p:[point(u1,y0,thickness/2),point(u1,y0,-thickness/2),point(u1,y1,-thickness/2),point(u1,y1,thickness/2)],n:axis===0?[1,0,0]:[0,0,1]},
 {p:[point(u0,y0,thickness/2),point(u0,y0,-thickness/2),point(u1,y0,-thickness/2),point(u1,y0,thickness/2)],n:[0,-1,0]},
 {p:[point(u0,y1,-thickness/2),point(u0,y1,thickness/2),point(u1,y1,thickness/2),point(u1,y1,-thickness/2)],n:[0,1,0]}];
 for(const cap of caps){let polys=[cap.p.map(p=>({p,n:cap.n,uv:[(p[0]+p[2])*.5,p[1]*.5]}))];for(const door of doors.filter(d=>d.host===spec.host)){const w=door.assembly.opening.width+.10,depth=spec.host==='east'?1.35:.42,box=axis===2?[door.x-depth,door.x+depth,-.06,door.assembly.opening.height+.10,door.z-w/2,door.z+w/2]:[door.x-w/2,door.x+w/2,-.06,door.assembly.opening.height+.10,door.z-depth,door.z+depth];polys=polys.flatMap(poly=>outsideBox(poly,box));}for(const poly of polys)addPiece(spec.id,brick,poly);}
}
for(const[id,byMat]of [...groups])if(![...byMat.values()].some(g=>g.i.length))groups.delete(id);
const used=new Set();for(const g of groups.values())for(const m of g.keys())used.add(m);for(const prop of picked)for(const p of meshByName.get(prop.mesh).primitives)used.add(p.material);
const materialIds=[...used].sort((a,b)=>a-b),materialMap=new Map(materialIds.map((a,i)=>[a,i])),json={asset:{version:'2.0',generator:'Chunk Surfer actual Scene Dock articulated aside'},buffers:[],bufferViews:[],accessors:[],materials:materialIds.map(i=>structuredClone(pack.json.materials[i])),meshes:[],nodes:[],scenes:[{nodes:[]}],scene:0,textures:[],images:[],samplers:structuredClone(pack.json.samplers||[])};
materialMap.set(-1,json.materials.length);json.materials.push({name:'Ellery light-absorbing singularity',pbrMetallicRoughness:{baseColorFactor:[0,0,0,1],metallicFactor:0,roughnessFactor:1},extras:{renRole:'missing-man-core'}});
const chunks=[];let bytes=0;const append=(b,target)=>{const at=align(bytes);if(at>bytes)chunks.push(Buffer.alloc(at-bytes));chunks.push(b);bytes=at+b.length;const i=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:at,byteLength:b.length,...(target?{target}:{})});return i;};
const accessor=(a,size,integer=false)=>{const v=integer?new Uint32Array(a):new Float32Array(a),view=append(Buffer.from(v.buffer),integer?34963:34962),x={bufferView:view,componentType:integer?5125:5126,count:a.length/size,type:size===1?'SCALAR':`VEC${size}`};if(size===3&&!integer){x.min=[Infinity,Infinity,Infinity];x.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++)x.min[i%3]=Math.min(x.min[i%3],a[i]),x.max[i%3]=Math.max(x.max[i%3],a[i]);}json.accessors.push(x);return json.accessors.length-1;};
const writeMesh=(name,primitives,extras={})=>{json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({name,mesh:json.meshes.length});json.meshes.push({name,extras,primitives:primitives.map(g=>({attributes:{POSITION:accessor(g.p,3),NORMAL:accessor(g.n,3),TEXCOORD_0:accessor(g.uv,2)},indices:accessor(g.i,1,true),material:materialMap.get(g.material)}))});};
for(const[id,byMat]of groups)writeMesh(PREFIX+id,[...byMat].map(([material,g])=>({...g,material})),{sourceElleryAside:true,panel:id,host:pieceSpecs.get(id)?.host,construction:pieceSpecs.get(id)?.kind,coordinateSpace:'actual Scene Dock world metres',sourceMeshes:architecture});
for(const name of new Set(picked.map(p=>p.mesh))){const m=meshByName.get(name);writeMesh(PREFIX+name,m.primitives.map(p=>({p:read(pack,p.attributes.POSITION),n:read(pack,p.attributes.NORMAL),uv:read(pack,p.attributes.TEXCOORD_0),i:read(pack,p.indices),material:p.material})),{sourceElleryAside:true,sourceMesh:name,preservedGeometry:true});}
const orb={p:[],n:[],uv:[],i:[],material:-1},rings=24,slices=32;
for(let y=0;y<=rings;y++)for(let x=0;x<=slices;x++){const a=x/slices*Math.PI*2,b=y/rings*Math.PI,p=[Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];orb.p.push(...p);orb.n.push(...p);orb.uv.push(x/slices,y/rings);}
for(let y=0;y<rings;y++)for(let x=0;x<slices;x++){const a=y*(slices+1)+x,b=a+slices+1;orb.i.push(a,b,a+1,a+1,b,b+1);}
writeMesh(PREFIX+'singularity',[orb],{sourceElleryAside:true,absorbsLight:true});
// Preserve only referenced native texture/image bytes, without recompression.
const texMap=new Map(),imageMap=new Map();const remapTexture=index=>{if(texMap.has(index))return texMap.get(index);const t=structuredClone(pack.json.textures[index]);if(!imageMap.has(t.source)){const image=structuredClone(pack.json.images[t.source]),v=pack.json.bufferViews[image.bufferView];image.bufferView=append(Buffer.from(pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)));imageMap.set(t.source,json.images.length);json.images.push(image);}t.source=imageMap.get(t.source);texMap.set(index,json.textures.length);json.textures.push(t);return json.textures.length-1;};
for(const m of json.materials)for(const p of[m.pbrMetallicRoughness?.baseColorTexture,m.pbrMetallicRoughness?.metallicRoughnessTexture,m.normalTexture,m.occlusionTexture,m.emissiveTexture])if(p)p.index=remapTexture(p.index);
json.buffers=[{byteLength:bytes}];const output=encodeGlb(json,Buffer.concat(chunks));
const file=path.join(ROOT,'public/assets/source-earthfall-ellery-aside.glb');fs.writeFileSync(file,output);
const metadata={version:2,packSHA:sha(output),sourcePackSHA:sha(source),sourcePack:'conservatory-props.glb',panels:[...groups].map(([id,byMat])=>{const p=[...byMat.values()].flatMap(g=>g.p),spec=pieceSpecs.get(id),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let radius=0;for(let i=0;i<p.length;i+=3){radius=Math.max(radius,Math.hypot(...p.slice(i,i+3).map((v,k)=>v-spec.pivot[k])));for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[i+k]);max[k]=Math.max(max[k],p[i+k]);}}return{...spec,mesh:PREFIX+id,bounds:{min,max},radius,materialCategories:[...byMat.keys()].map(k=>pack.json.materials[k]?.name||'native')};}),props:[...picked.map(p=>({...p,bounds:PROP_BOUNDS[p.mesh],originalMesh:p.mesh,mesh:PREFIX+p.mesh})),...externalProps.map(p=>({...p,bounds:PROP_BOUNDS[p.mesh],originalMesh:p.mesh}))],doors,room:C.room};
const stat={kind:'source-earthfall-ellery-aside',bytes:output.length,sha256:sha(output),sourcePackSHA:sha(source),meshes:json.meshes.length,materials:json.materials.length,images:json.images.length,triangles:json.meshes.reduce((s,m)=>s+m.primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),0),metadata};fs.writeFileSync(file.replace('.glb','.stats.json'),JSON.stringify(stat,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'src/data/generated/source-earthfall-ellery-aside.js'),'// Generated from compiled actual Ellery Scene Dock; do not hand edit.\nexport const SOURCE_ELLERY_ASIDE_ASSET=Object.freeze('+JSON.stringify(metadata)+');\n');
fs.writeFileSync(file.replace('.glb','.credits.json'),JSON.stringify({kind:'source-earthfall-ellery-aside',derivedFrom:{pack:'conservatory-props.glb',sha256:stat.sourcePackSHA,credits:'conservatory-props.credits.json'},derivation:'Detached native Scene Dock geometry, UVs and image bytes; articulated construction, compiled doorway apertures, blind masonry returns and authored singularity.',pack:{bytes:stat.bytes,sha256:stat.sha256,triangles:stat.triangles},newExternalSources:[]},null,2)+'\n');
console.log(JSON.stringify({bytes:stat.bytes,meshes:stat.meshes,materials:stat.materials,images:stat.images,triangles:stat.triangles,props:picked.length,doors:doors.map(d=>[d.id,d.x,d.z])}));
