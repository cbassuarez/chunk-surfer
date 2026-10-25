// A separate four-mesh replacement pack. Does not regenerate, patch, or write
// the shared conservative prop pack, its collision, lettering, or other art.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {buildExteriorNeighbourhood} from './exterior-neighborhood-geometry.mjs';
import {EXTERIOR_FRONTAGE_REVISION,EXTERIOR_NEIGHBOURHOOD as C} from '../../src/data/exterior-frontages.js';
import {bakeLetteringAtlases,printedSurfaceMetadata} from './lettering/physical-lettering.mjs';
import {printedFaceGeometry} from './lettering/face-geometry.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const OUT=path.join(root,'public/assets/exterior-frontages.glb');
const reportFile=OUT.replace('.glb','.stats.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const materials=[],meshes=[];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const group=(m,mat)=>m.groups.get(mat)||(m.groups.set(mat,{positions:[],normals:[],uvs:[],indices:[]}),m.groups.get(mat));
function addQuad(m,a,b,c,d,mat){
  const g=group(m,mat),start=g.positions.length/3,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=cross(u,v),length=Math.hypot(...n);if(length<1e-10)throw Error(`Degenerate quad in ${m.name}`);
  const normal=n.map(v=>v/length),major=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=major===0?[2,1]:major===1?[0,2]:[0,1];
  for(const p of[a,b,c,d]){g.positions.push(...p);g.normals.push(...normal);g.uvs.push(p[axes[0]],p[axes[1]]);}
  g.indices.push(start,start+1,start+2,start,start+2,start+3);
}
function addBox(m,c,s,mat){
  const [x,y,z]=c,[hx,hy,hz]=s.map(v=>v/2),p=Array.from({length:8},(_,i)=>[x+(i&1?hx:-hx),y+(i&2?hy:-hy),z+(i&4?hz:-hz)]);
  for(const face of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])addQuad(m,...face.map(i=>p[i]),mat);
}
function addBeam(m,a,b,w,mat){
  const d=b.map((v,k)=>v-a[k]),length=Math.hypot(...d),forward=d.map(v=>v/length),ref=Math.abs(forward[1])<.9?[0,1,0]:[1,0,0],right=cross(forward,ref),rl=Math.hypot(...right),s=right.map(v=>v/rl),up=cross(forward,s);
  const points=Array.from({length:8},(_,i)=>[0,1,2].map(k=>(i&1?b:a)[k]+s[k]*(i&2?w/2:-w/2)+up[k]*(i&4?w/2:-w/2)));
  for(const face of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])addQuad(m,...face.map(i=>points[i]),mat);
}
function addCylinder(m,c,r,h,mat,sides=8){
  for(let i=0;i<sides;i++){
    const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
    const point=(angle,y)=>[c[0]+Math.cos(angle)*r,c[1]+y,c[2]+Math.sin(angle)*r];
    addQuad(m,point(a,-h/2),point(a,h/2),point(b,h/2),point(b,-h/2),mat);
    // Split each cap wedge into a non-degenerate quad using its midpoint.
    for(const sign of[-1,1]){
      const aa=point(a,sign*h/2),bb=point(b,sign*h/2),o=[c[0],c[1]+sign*h/2,c[2]],mid=aa.map((v,k)=>(v+bb[k])/2);
      const p=sign>0?[o,bb,mid,aa]:[o,aa,mid,bb];addQuad(m,...p,mat);
    }
  }
}
const reports=buildExteriorNeighbourhood({materials,mesh:name=>{const m={name,groups:new Map()};meshes.push(m);return m;},addBox,addBeam,addCylinder,addQuad});
const jobs=C.notices.map(n=>({...n,text:n.lines.join('\n'),category:'record',font:'NimbusSans-Bold.otf',process:'home-printed early closure paper',rasterWidthPx:384,rasterHeightPx:Math.round(384*n.heightM/n.widthM),lineCentres:n.lines.length===3?[.20,.50,.80]:[.28,.72],palette:{ground:[.66,.64,.54],ink:[.025,.028,.03]},polarity:'dark-on-light',baseRoughness:.91,inkRoughness:.93,finishSupport:{kind:'carrier',edgeWear:false,contact:'none',exposure:'sheltered'}}));
const bake=await bakeLetteringAtlases(jobs,{outputDir:path.join(root,'public/assets/exterior-frontage-lettering'),pageSize:1024});
const document=new Document(),buffer=document.createBuffer(),scene=document.createScene('Existing neighbourhood'),textureCache=new Map();
const texture=(index,role)=>{const page=bake.pages[index],key=`${index}:${role}`;if(!textureCache.has(key))textureCache.set(key,document.createTexture(`${index}-${role}`).setImage(page[role]).setMimeType('image/png'));return textureCache.get(key);};
const glMaterials=materials.map(m=>document.createMaterial(m.name).setBaseColorFactor(m.pbrMetallicRoughness.baseColorFactor).setMetallicFactor(m.pbrMetallicRoughness.metallicFactor).setRoughnessFactor(m.pbrMetallicRoughness.roughnessFactor).setEmissiveFactor(m.emissiveFactor||[0,0,0]));
const printMat=new Map();
for(const entry of bake.entries.values()){
  const m=document.createMaterial(`physical print: record: ${entry.process}`).setBaseColorFactor([1,1,1,1]).setMetallicFactor(1).setRoughnessFactor(1).setBaseColorTexture(texture(entry.page,'albedo')).setNormalTexture(texture(entry.page,'normal')).setMetallicRoughnessTexture(texture(entry.page,'orm')).setExtras({printedSurface:printedSurfaceMetadata(entry),materialFactors:'gltf',letteringFinish:{version:1,profile:entry.finish.profile,localSpecular:true}});
  printMat.set(entry.id,m);
}
const accessor=(name,data,type,integer=false)=>document.createAccessor(name).setArray(integer?new Uint32Array(data):new Float32Array(data)).setType(type).setBuffer(buffer);
const stats={revision:EXTERIOR_FRONTAGE_REVISION,generator:'tools/chunk_surfer/build-exterior-frontages.mjs',pack:'exterior-frontages.glb',replacementMeshes:meshes.map(m=>m.name),unchangedContent:['all existing anchors and floorplan','The Lyric furnished interior and doors','civic shops and surrounding skyline','player routes, cast, chapters and save identities'],meshes:{},totalTriangles:0,materialCount:materials.length+bake.pages.length,textureBaseLevelBytes:bake.manifest.pages.reduce((n,p)=>n+p.rgbaBaseLevelBytes,0),pending:['native final-dither movement inspection','fresh-player recognition of occupied rooms and early closures'],sourceHashes:Object.fromEntries(['src/data/exterior-frontages.js','tools/chunk_surfer/exterior-neighborhood-geometry.mjs','tools/chunk_surfer/build-exterior-frontages.mjs'].map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]))};
for(const [index,m]of meshes.entries()){
  const built=document.createMesh(m.name),report=reports[index],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0;
  const primitive=(g,mat)=>{
    for(let i=0;i<g.positions.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],g.positions[i]);max[axis]=Math.max(max[axis],g.positions[i]);}
    triangles+=g.indices.length/3;
    built.addPrimitive(document.createPrimitive().setAttribute('POSITION',accessor(m.name+'-position',g.positions,'VEC3')).setAttribute('NORMAL',accessor(m.name+'-normal',g.normals,'VEC3')).setAttribute('TEXCOORD_0',accessor(m.name+'-uv',g.uvs,'VEC2')).setIndices(accessor(m.name+'-index',g.indices,'SCALAR',true)).setMaterial(mat));
  };
  for(const [key,g]of m.groups)primitive(g,glMaterials[key]);
  const printGroups=new Map();
  for(const notice of report.notices){
    const entry=bake.entries.get(notice.id),face=printedFaceGeometry({...notice,uvRect:entry.uvRect,center:[notice.center[0]+.002,...notice.center.slice(1)]});
    if(!printGroups.has(notice.id))printGroups.set(notice.id,{positions:[],normals:[],uvs:[],indices:[]});
    const g=printGroups.get(notice.id),offset=g.positions.length/3;g.positions.push(...face.positions);g.normals.push(...face.normals);g.uvs.push(...face.uvs);g.indices.push(...face.indices.map(i=>i+offset));
  }
  for(const[id,g]of printGroups)primitive(g,printMat.get(id));
  built.setExtras({revision:EXTERIOR_FRONTAGE_REVISION,manufacture:'Deep masonry reveals, opaque room geometry, painted sash joinery, closed commerce and working rainwater goods',windows:report.windows,notices:report.notices,deeds:report.deeds});
  scene.addChild(document.createNode(m.name).setMesh(built));stats.meshes[m.name]={triangles,primitives:built.listPrimitives().length,bounds:{min,max},windows:report.windows.length,litWindows:report.windows.filter(w=>w.lit).length,deeds:report.deeds,notices:report.notices.map(n=>({id:n.id,center:n.center,lines:n.lines}))};stats.totalTriangles+=triangles;
}
if(stats.totalTriangles>C.maximumPackTriangles)throw Error(`Facade geometry exceeds ${C.maximumPackTriangles}: ${stats.totalTriangles}`);
const bytes=Buffer.from(await new NodeIO().writeBinary(document));if(bytes.length>C.maximumPackBytes)throw Error('Facade pack exceeds byte budget');
stats.bytes=bytes.length;stats.sha256=sha(bytes);fs.writeFileSync(OUT,bytes);fs.writeFileSync(reportFile,JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(OUT.replace('.glb','.credits.json'),JSON.stringify({
  pack:{filename:'exterior-frontages.glb',author:'Chunk Surfer project',source:stats.generator,license:'project source; stock font terms below',sha256:stats.sha256,triangles:stats.totalTriangles,bytes:stats.bytes},
  geometry:{origin:'Original project-native opaque geometry',units:'metres',axis:'Y-up',sources:Object.keys(stats.sourceHashes),historicalBasis:'Existing authored Ellery district dates, footprints, uses and roof envelopes; no claim of measured real-world buildings.'},
  lettering:{process:'Existing solid-pigment paper printing and finish pipeline',font:'NimbusSans-Bold.otf',fontSha256:bake.manifest.entries[0].metrics.fontSha256,source:'https://github.com/ArtifexSoftware/urw-base35-fonts',license:'AGPL-3.0 with the upstream stated PostScript/PDF document exception; see vendored LICENSE and COPYING',manifest:'assets/fonts/manifest.json',pipelineManifest:'exterior-frontage-lettering/atlas-manifest.json'},
  materials:{source:'Original project palette; established masonry names participate in existing street material sampling',noNewExternalTexture:true},
},null,2)+'\n');
console.log(JSON.stringify({pack:path.relative(root,OUT),sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles,meshes:stats.meshes},null,2));
