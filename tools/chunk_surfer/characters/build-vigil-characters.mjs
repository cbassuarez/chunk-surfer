// Six anatomical, individually dressed vigil participants. The retained CC0
// MakeHuman masters supply actual faces, hands, feet, skin weights and shoes;
// this build tailors distinct rainwear and independently posed field objects.
// Their named meshes override only the low-detail loading silhouettes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Matrix4,Quaternion,Vector3} from 'three';
import {VIGIL_CHARACTER_DESIGNS as DESIGNS} from '../../../src/data/vigil-character-design.js';
import {parseCharacterAsset} from '../../../src/render/character-asset.js';
import {VIGIL_OBJECT_LAYOUT} from '../../../src/data/vigil-object-layout.js';
import {canonicalAnatomy,retargetMesh,extendWristUnderlap} from './vigil-tailoring.mjs';
import {retainedBody,fittedProxyGarment,fitClothToEnvelope} from './vigil-body-fit.mjs';
import {extendOuterwear} from './vigil-garment-drape.mjs';
import {vigilCharacterPose} from '../../../src/render/vigil-character-performance.js';
import {refineVigilIdentity,VIGIL_IDENTITY_PROFILES} from './vigil-character-identity.mjs';
import {vigilFabricTextures,fabricUV} from './vigil-fabric-textures.mjs';
import {secondaryVigilObjects} from './vigil-secondary-objects.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const female=canonicalAnatomy(JSON.parse(fs.readFileSync(path.join(root,'artifacts/bus-woman-production/anatomy.json'))));
const male=canonicalAnatomy(JSON.parse(fs.readFileSync(path.join(root,'public/assets/recordist-characters/contractor.json'))));
const masters={woman:female,man:male};
const rigOutput=path.join(root,'src/data/vigil-character-rigs.js');
const manifestOutput=path.join(root,'public/assets/vigil-characters.manifest.json');
const freshGltf=()=>({asset:{version:'2.0',generator:'Chunk Surfer vigil anatomical character build'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],animations:[],buffers:[],bufferViews:[],accessors:[]});
let gltf=freshGltf(),chunks=[],cursor=0,fabricCache=new Map();
function binary(data,target){while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}const i=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:data.length,...(target?{target}:{})});chunks.push(data);cursor+=data.length;return i;}
function accessor(values,type,componentType=5126,target){const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
  const invalid=values.findIndex(v=>!Number.isFinite(v));if(invalid>=0)throw Error(`nonfinite vigil ${type} geometry at ${invalid}: ${values[invalid]}`);const typed=new Ctor(values),view=binary(Buffer.from(typed.buffer),target),a={bufferView:view,componentType,count:values.length/width,type};
  if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){const k=i%3;a.min[k]=Math.min(a.min[k],values[i]);a.max[k]=Math.max(a.max[k],values[i]);}}gltf.accessors.push(a);return gltf.accessors.length-1;
}
const V=(a,b)=>a.map((x,i)=>x+b[i]),S=(a,b)=>a.map((x,i)=>x-b[i]),M=(a,s)=>a.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>M(a,1/(Math.hypot(...a)||1));
function geometry(name,material,positions,indices,skinIndex,skinWeight){const normals=new Array(positions.length).fill(0);for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2],p=positions.slice(a*3,a*3+3),q=positions.slice(b*3,b*3+3),r=positions.slice(c*3,c*3+3),n=cross(S(q,p),S(r,p));for(const j of[a,b,c])for(let k=0;k<3;k++)normals[j*3+k]+=n[k];}for(let i=0;i<normals.length;i+=3){const n=norm(normals.slice(i,i+3));normals.splice(i,3,...n);}return{name,material,positions,normals,indices,skinIndex,skinWeight};}
function rigid(name,material,points,faces,bone){const positions=points.flat(),indices=faces.flatMap(face=>{const out=[];for(let i=1;i<face.length-1;i++)out.push(face[0],face[i],face[i+1]);return out;}),count=points.length;return geometry(name,material,positions,indices,Array.from({length:count},()=>[bone,0,0,0]).flat(),Array.from({length:count},()=>[1,0,0,0]).flat());}
function box(name,material,center,size,bone){const[x,y,z]=center,[a,b,c]=size.map(v=>v/2),p=[[-a,-b,-c],[a,-b,-c],[a,b,-c],[-a,b,-c],[-a,-b,c],[a,-b,c],[a,b,c],[-a,b,c]].map(v=>V(v,center));return rigid(name,material,p,[[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]],bone);}
function tube(name,material,points,radius,bone,segments=10){const verts=[],faces=[];for(let j=0;j<points.length;j++){const axis=norm(S(points[Math.min(points.length-1,j+1)],points[Math.max(0,j-1)])),right=norm(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[0,0,1])),up=norm(cross(axis,right));for(let k=0;k<segments;k++){const a=k*2*Math.PI/segments,r=Array.isArray(radius)?radius[j]:radius;verts.push(V(points[j],M(V(M(right,Math.cos(a)),M(up,Math.sin(a))),r)));if(j)faces.push([(j-1)*segments+k,(j-1)*segments+(k+1)%segments,j*segments+(k+1)%segments,j*segments+k]);}}faces.push([...Array(segments)].map((_,i)=>segments-1-i));faces.push([...Array(segments)].map((_,i)=>(points.length-1)*segments+i));return rigid(name,material,verts,faces,bone);}
function strip(name,material,points,width,bone){const verts=points.flatMap(p=>[[p[0]-width/2,p[1],p[2]],[p[0]+width/2,p[1],p[2]]]),faces=[];for(let i=1;i<points.length;i++)faces.push([(i-1)*2,(i-1)*2+1,i*2+1,i*2]);return rigid(name,material,verts,faces,bone);}
function ring(name,material,center,rx,rz,y,bone,segments=24){const p=Array.from({length:segments+1},(_,i)=>[center[0]+Math.cos(i*2*Math.PI/segments)*rx,y,center[2]+Math.sin(i*2*Math.PI/segments)*rz]);return tube(name,material,p,.003,bone,6);}
function ellipsoid(name,material,c,r,bone){const verts=[],faces=[],segments=16,rings=8;for(let j=0;j<=rings;j++){const theta=j*Math.PI/rings;for(let i=0;i<segments;i++){const phi=i*2*Math.PI/segments;verts.push([c[0]+r[0]*Math.sin(theta)*Math.cos(phi),c[1]+r[1]*Math.cos(theta),c[2]+r[2]*Math.sin(theta)*Math.sin(phi)]);if(j)faces.push([(j-1)*segments+i,(j-1)*segments+(i+1)%segments,j*segments+(i+1)%segments,j*segments+i]);}}return rigid(name,material,verts,faces,bone);}
function creasedSheet(name,material,center,width,height,bone){const positions=[],indices=[],skinIndex=[],skinWeight=[],cols=17,rows=11;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const u=i/(cols-1),v=j/(rows-1),fold=Math.sin(u*4*Math.PI)*.006,loose=(1-Math.abs(u*2-1))*(1-v);
    positions.push(center[0]+(u-.5)*width,center[1]+(v-.5)*height-.015*loose,center[2]+fold+.012*loose);
    skinIndex.push(bone,0,0,0);skinWeight.push(1,0,0,0);
    if(i&&j){const a=(j-1)*cols+i-1,b=a+1,c=j*cols+i,d=c-1;indices.push(a,c,b,a,d,c);}}
  return geometry(name,material,positions,indices,skinIndex,skinWeight);
}
const ROLES=['skin','hair','eye','iris','pupil','coat','trim','trouser','shoe','scarf','paper','ink','metal','rubber','photo'];
function embeddedFabric(kind){
 if(fabricCache.has(kind))return fabricCache.get(kind);const fabric=vigilFabricTextures(kind),maps={};gltf.images??=[];gltf.textures??=[];gltf.samplers??=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
 for(const name of ['albedo','normal','orm']){const source=gltf.images.length;gltf.images.push({name:kind+' '+name,mimeType:'image/png',bufferView:binary(fabric[name])});maps[name]=gltf.textures.length;gltf.textures.push({sampler:0,source});}
 const result={...maps,normalScale:fabric.normalScale,roughness:fabric.roughness};fabricCache.set(kind,result);return result;
}
function materials(design){const colors={skin:design.skin,hair:design.hair,eye:[.37,.35,.29],iris:[.095,.055,.028],pupil:[.008,.006,.005],coat:design.coat,trim:design.trim,trouser:design.trouser,shoe:[.039,.033,.029],scarf:design.scarf,paper:[.55,.50,.40],ink:[.065,.066,.06],metal:[.22,.23,.22],rubber:[.021,.024,.025],photo:[.12,.135,.135]},roughness={skin:.79,hair:.87,eye:.24,iris:.28,pupil:.19,shoe:.61,metal:.38,rubber:.86,photo:.54},coatKind={folder:'wax',flask:'quilt',umbrella:'wool',photographs:'wax',map:'canvas',microphone:'canvas'}[design.object];const base=gltf.materials.length;for(const role of ROLES){const kind=role==='coat'?coatKind:role==='scarf'?'wool':role==='trim'?'canvas':null,fabric=kind?embeddedFabric(kind):null;gltf.materials.push({name:`${design.mesh} ${role}`,pbrMetallicRoughness:{baseColorFactor:[...colors[role],1],metallicFactor:role==='metal'?.62:0,roughnessFactor:fabric?.roughness??roughness[role]??.94,...(fabric?{baseColorTexture:{index:fabric.albedo},metallicRoughnessTexture:{index:fabric.orm}}:{})},...(fabric?{normalTexture:{index:fabric.normal,scale:fabric.normalScale}}:{}),extras:{characterRole:role,...(kind?{fabric:kind,repeatPerMeter:12.5}:{})}});}return Object.fromEntries(ROLES.map((name,i)=>[name,base+i]));}
function scaled(source,design){const h=design.height/source.height;return[p=>[p[0]*design.width,p[1]*h,p[2]*design.depth],n=>norm([n[0]/design.width,n[1]/h,n[2]/design.depth])];}
function sourceMeshes(source,design,mat){
 const allowed=source===female?/^(woman-denim-trousers|woman-ordinary-face-neck-anatomical-hands|woman-greying-hair|woman-eyes|woman-iris|woman-temple|woman-closed-leather-shoe|woman-shoe-sole|woman-shoe-instapseam)/:/^(contractor-tailored-trousers|contractor-anatomical-skin|contractor-sculpted-hair|contractor-anatomical-eyes|contractor-iris|contractor-leather-shoe|contractor-shoe-welt|contractor-shoe-sole|contractor-lace|contractor-sock|headphone-)/;
 return source.meshes.filter(m=>allowed.test(m.name)&&(!m.name.startsWith('headphone-')||design.object==='microphone')&&!(design.object==='map'&&/hair|temple/.test(m.name))).flatMap(m=>{
  let role='coat';if(/skin|ordinary-face-neck-anatomical-hands/.test(m.name))role='skin';else if(/hair|temple/.test(m.name))role='hair';else if(/eyes/.test(m.name))role='eye';else if(/iris/.test(m.name))role='iris';else if(/trousers|sock/.test(m.name))role='trouser';else if(/shoe|lace/.test(m.name))role='shoe';else if(/headphone/.test(m.name))role='rubber';
  let out=retargetMesh(m,source,source,design);out.material=mat[role];
  if(role==='skin'){
   // Keep the concealed continuation of the neck and wrist inside the garment.
   // Cutting at dominant-joint boundaries exposed a sawtooth skin edge whenever
   // a wrist flexed or the collar moved; the sleeve now covers real forearm skin.
   const visible=index=>{let total=0;for(let slot=0;slot<4;slot++){const name=source.bones[m.skinIndex[index*4+slot]].name,weight=m.skinWeight[index*4+slot];if(/^(head|jaw|neck|hand|thumb|index|middle|ring|little)/.test(name))total+=weight;}return total;};
   const neck=source.bones.find(b=>b.name==='neck'),underlap=tri=>{
    const points=tri.map(v=>m.positions.slice(v*3,v*3+3)),center=M(points.reduce(V,[0,0,0]),1/3);
    if(points.every(p=>Math.abs(p[0])<.075&&p[1]>neck.head[1]-.10))return true;
    if(source===male)for(const side of['L','R']){const arm=source.bones.find(b=>b.name==='forearm_'+side),axis=S(arm.tail,arm.head),delta=S(center,arm.head),t=delta.reduce((n,v,i)=>n+v*axis[i],0)/axis.reduce((n,v)=>n+v*v,0),radial=S(delta,M(axis,t));if(t>.66&&t<1.2&&Math.hypot(...radial)<.065)return true;}
    return false;
   };
   out.indices=[];for(let i=0;i<m.indices.length;i+=3){const tri=m.indices.slice(i,i+3);if(tri.reduce((n,v)=>n+visible(v),0)/3>.42||underlap(tri))out.indices.push(...tri);}
   if(source===female){const [point]=scaled(source,design);out=extendWristUnderlap(out,source.bones.map(b=>({...b,head:point(b.head),tail:point(b.tail)})));}
  }
  if(role==='iris'){
   const count=out.positions.length/3,center=[0,0,0];for(let i=0;i<out.positions.length;i++)center[i%3]+=out.positions[i]/count;
   const front=Math.min(...out.positions.filter((_,i)=>i%3===2))-.0006,positions=out.positions.map((v,i)=>i%3===2?front+(v-center[2])*.15:center[i%3]+(v-center[i%3])*.43);
   return[out,geometry(m.name+' wet pupil',mat.pupil,positions,out.indices,out.skinIndex,out.skinWeight)];
  }
  return[out];
 });
}
function fittedGarment(design,target,mat){
 // Native sewn shoulders and sleeves are evaluated against the actual macro
 // anatomy. Long panels continue from that fitted waist and hang from the hips.
 const asset=['folder','umbrella','photographs'].includes(design.object)?'male_elegantsuit01':'male_casualsuit01',body=retainedBody(target,design),proxy=fittedProxyGarment(target,design,asset),pants=target.meshes.filter(m=>/tailored-trousers|denim-trousers/.test(m.name)).map(m=>retargetMesh(m,target,target,design)),envelope={...body,positions:[...body.positions],indices:[...body.indices],skinIndex:[...body.skinIndex],skinWeight:[...body.skinWeight]};
 for(const m of pants){const offset=envelope.positions.length/3;envelope.positions.push(...m.positions);envelope.indices.push(...m.indices.map(v=>v+offset));envelope.skinIndex.push(...m.skinIndex);envelope.skinWeight.push(...m.skinWeight);}
 const id=design.mesh.split('_')[1],actions={ruth:'binder-page',leila:'flask-check',owen:'umbrella-settle',denise:'photos-sort',malcolm:'map-fold',kit:'camera-check'},poses=[vigilCharacterPose(id,{rig:body.bones}),vigilCharacterPose(id,{action:'weight-shift',progress:.5,rig:body.bones}),vigilCharacterPose(id,{action:actions[id],progress:.5,rig:body.bones})],tailored=fitClothToEnvelope(extendOuterwear(proxy,body.bones,design,{body:envelope}),envelope,{ease:.012,poses,bones:body.bones});
 const shell={...tailored,name:'fitted continuous-tailored-coat',material:mat.coat},out=[shell],surface=clothSurface([shell]);
 // A real fitted cotton layer sits behind the open collar, rather than leaving
 // exposed torso or covering it with a flat polygon spanning the neck.
 const pelvis=body.bones.find(b=>b.name==='pelvis'),neck=body.bones.find(b=>b.name==='neck'),chest=body.bones.find(b=>b.name==='chest'),innerSurface=clothSurface([{...body,name:'continuous-top'}]),positions=[],indices=[],skinIndex=[],skinWeight=[],columns=20,rows=12,halfWidth=.145*design.width,bottomY=chest.head[1]-.025,centerTop=neck.head[1]-.080;
 for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
  const x=(i/columns*2-1)*halfWidth,topY=centerTop+.024*(x/halfWidth)**2,y=bottomY+(topY-bottomY)*j/rows,s=innerSurface(x,y);
  positions.push(x,y,s.z-.0015);skinIndex.push(...s.joints);skinWeight.push(...s.weights);
  if(i&&j){const a=(j-1)*(columns+1)+i-1,b=a+1,c=j*(columns+1)+i,d=c-1;indices.push(a,c,b,a,d,c);}
 }
 out.unshift(geometry('fitted cotton crewneck underlayer',mat.trim,positions,indices,skinIndex,skinWeight));
 const top=neck.head[1]-.11,bottom=Math.max(design.hem+.055,pelvis.head[1]-.10);
 out.push(clothStrip('sewn front placket',mat.trim,[[.004,top],[.004,bottom]],.010,surface,.003));
 for(let i=0;i<4;i++){const y=top-.04-(top-bottom-.08)*i/3,fit=surface(.004,y),button=ellipsoid('rainwear button '+i,mat.trim,[.004,y,fit.z-.006],[.0045,.0045,.002],fit.joints[0]);for(let j=0;j<button.skinIndex.length;j+=4){button.skinIndex.splice(j,4,...fit.joints);button.skinWeight.splice(j,4,...fit.weights);}out.push(button);}
 return out;
}
function clothSurface(clothes,{includeArms=false}={}){
 const meshes=clothes.filter(m=>/continuous-tailored-coat|continuous-top/.test(m.name)),triangles=[];
 for(const m of meshes)for(let i=0;i<m.indices.length;i+=3){const ids=m.indices.slice(i,i+3);let arm=0;if(m.bones)for(const v of ids)for(let k=0;k<4;k++)if(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(m.bones[m.skinIndex[v*4+k]]?.name||''))arm+=m.skinWeight[v*4+k]/3;if(!includeArms&&arm>.20)continue;const p=ids.map(v=>m.positions.slice(v*3,v*3+3)),den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(den)>1e-10)triangles.push({m,ids,p,den});}
 // Most tailoring queries are millimetres apart on a small patch. Index the
 // projected triangles once instead of rescanning the complete lined coat for
 // every cloth sample. Padding retains barycentric edge-tolerance coverage.
 const bins=new Map(),cell=.025;for(const triangle of triangles){const xs=triangle.p.map(p=>p[0]),ys=triangle.p.map(p=>p[1]);for(let ix=Math.floor((Math.min(...xs)-1e-5)/cell);ix<=Math.floor((Math.max(...xs)+1e-5)/cell);ix++)for(let iy=Math.floor((Math.min(...ys)-1e-5)/cell);iy<=Math.floor((Math.max(...ys)+1e-5)/cell);iy++){const key=ix+':'+iy;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(triangle);}}
 const query=(x,y,back=false)=>{
  let best=null;for(const t of bins.get(Math.floor(x/cell)+':'+Math.floor(y/cell))||[]){const[a,b,c]=t.p,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/t.den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/t.den,w=1-u-v;if(Math.min(u,v,w)<-1e-5)continue;const z=a[2]*u+b[2]*v+c[2]*w;if(!best||(back?z>best.z:z<best.z))best={t,bary:[u,v,w],z};}
  if(!best){let distance=Infinity;for(const m of meshes)for(let i=0;i<m.positions.length;i+=3){const d=(m.positions[i]-x)**2+(m.positions[i+1]-y)**2;if(d<distance){distance=d;best={t:{m,ids:[i/3]},bary:[1],z:m.positions[i+2]};}}}
  const weights=new Map();for(let i=0;i<best.t.ids.length;i++)for(let slot=0;slot<4;slot++){const at=best.t.ids[i]*4+slot,j=best.t.m.skinIndex[at],w=best.t.m.skinWeight[at]*best.bary[i];weights.set(j,(weights.get(j)||0)+w);}
  const pairs=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=pairs.reduce((n,p)=>n+p[1],0);while(pairs.length<4)pairs.push([0,0]);return{z:best.z,joints:pairs.map(p=>p[0]),weights:pairs.map(p=>p[1]/total)};
 };
 query.span=y=>{const x=[];for(const t of triangles)for(let i=0;i<3;i++){const a=t.p[i],b=t.p[(i+1)%3];if((a[1]<y)===(b[1]<y)||Math.abs(a[1]-b[1])<1e-8)continue;x.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}return x.length?[Math.min(...x),Math.max(...x)]:null;};
 return query;
}
function clothStrip(name,material,path,width,surface,layer=.006){const positions=[],indices=[],skinIndex=[],skinWeight=[],samples=[];for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.008));for(let j=k===1?0:1;j<=steps;j++){const t=j/steps;samples.push(a.map((v,i)=>v+(b[i]-v)*t));}}const columns=Math.max(2,Math.ceil(width/.008));for(let i=0;i<samples.length;i++)for(let j=0;j<=columns;j++){const x=samples[i][0]+(j/columns-.5)*width,y=samples[i][1],s=surface(x,y),wool=/scarf/.test(name),fall=i/Math.max(1,samples.length-1),loose=wool?fall*fall*.012+.002*Math.cos(j/columns*Math.PI*6):0;positions.push(x,y,s.z-layer-loose);skinIndex.push(...s.joints);skinWeight.push(...s.weights);if(i&&j){const a=(i-1)*(columns+1)+j-1,b=a+1,c=i*(columns+1)+j,d=c-1;indices.push(a,b,c,a,c,d);}}return geometry(name,material,positions,indices,skinIndex,skinWeight);}
function clothBelt(name,material,y,halfWidth,surface){const span=surface.span(y),center=span?(span[0]+span[1])/2:0;if(span)halfWidth=(span[1]-span[0])/2-.001;const positions=[],indices=[],skinIndex=[],skinWeight=[],segments=64;for(let i=0;i<=segments;i++){const a=i*2*Math.PI/segments,x=center+Math.sin(a)*halfWidth,back=Math.cos(a)<0;for(const offset of[-.014,.014]){const s=surface(x,y+offset,back);positions.push(x+Math.sin(a)*.004,y+offset,s.z+(back?.006:-.006));skinIndex.push(...s.joints);skinWeight.push(...s.weights);}if(i){const a=(i-1)*2,b=a+1,c=i*2,d=c+1;indices.push(a,b,d,a,d,c);}}return geometry(name,material,positions,indices,skinIndex,skinWeight);}
function looseScarf(name,material,path,width,surface,neck){
 const points=[],positions=[],indices=[],skinIndex=[],skinWeight=[],segments=48,columns=10,top=path[0],bottom=path.at(-1);
 for(let i=0;i<=segments;i++){const t=i/segments,y=top[1]+(bottom[1]-top[1])*t,x=top[0]+(bottom[0]-top[0])*t;let front=Infinity;for(const dy of[-.022,-.011,0,.011,.022])for(let j=0;j<=4;j++)front=Math.min(front,surface(x+(j/4-.5)*width,y+dy).z);const collar=Math.max(0,1-t*5),neckFront=neck.head[2]-.077;points.push({x,y,z:Math.min(front-.018,neckFront*collar+(front-.018)*(1-collar))-.004*Math.sin(t*Math.PI)});}
 for(let i=0;i<points.length;i++)for(let j=0;j<=columns;j++){const p=points[i],u=j/columns,x=p.x+(u-.5)*width,s=surface(x,p.y),fold=.0018*Math.cos(u*Math.PI*4);positions.push(x,p.y,p.z+fold);skinIndex.push(...s.joints);skinWeight.push(...s.weights);if(i&&j){const a=(i-1)*(columns+1)+j-1,b=a+1,c=i*(columns+1)+j,d=c-1;indices.push(a,b,c,a,c,d);}}
 return geometry(name,material,positions,indices,skinIndex,skinWeight);
}
function coatHood(design,bones,mat){
 const head=bones.find(b=>b.name==='head'),neck=bones.find(b=>b.name==='neck'),joint=name=>bones.findIndex(b=>b.name===name),positions=[],indices=[],skinIndex=[],skinWeight=[],seg=48,rows=13;
 const top=head.tail[1]+.020,bottom=neck.head[1]-.030,cy=(top+bottom)/2,ry=(top-bottom)/2,rx=.108*design.width,front=head.head[2]-.064*design.depth,depth=.175*design.depth;
 const weight=y=>{const t=Math.max(0,Math.min(1,(y-bottom)/Math.max(.001,head.head[1]+.015-bottom))),headWeight=t*t*(3-2*t),neckWeight=(1-headWeight)*.58;return{joints:[joint('head'),joint('neck'),joint('chest'),0],weights:[headWeight,neckWeight,1-headWeight-neckWeight,0]};};
 // A rounded sagittal cap, with a real closed back instead of the old small
 // open ring. The lower opening reaches into the collar and follows the
 // neck/chest; only the crown follows the turning head.
 for(let j=0;j<rows;j++){
  const t=j/rows,theta=t*Math.PI/2,radial=Math.cos(theta),z=front+depth*Math.sin(theta);
  for(let i=0;i<seg;i++){
   const a=i*2*Math.PI/seg,x=Math.sin(a)*rx*radial,y=cy+Math.cos(a)*ry*radial,fold=.0018*Math.sin(a*6)*Math.sin(Math.PI*t),skin=weight(y);
   positions.push(x,y,z+fold);skinIndex.push(...skin.joints);skinWeight.push(...skin.weights);
   if(j){const p=(j-1)*seg+i,q=(j-1)*seg+(i+1)%seg,r=j*seg+(i+1)%seg,s=j*seg+i;indices.push(p,r,q,p,s,r);}
  }
 }
 const cap=positions.length/3,skin=weight(cy);positions.push(0,cy,front+depth);skinIndex.push(...skin.joints);skinWeight.push(...skin.weights);
 for(let i=0;i<seg;i++)indices.push((rows-1)*seg+(i+1)%seg,(rows-1)*seg+i,cap);
 return geometry('continuous capped raised cloth hood',mat.coat,positions,indices,skinIndex,skinWeight);
}
function equipmentLead(bones,surface,material){
 // Build the loose lead in the held pose, then inverse-skin it into the bind
 // mesh. Both plugs follow real anchors: the recorder and the microphone hand.
 const pose=vigilCharacterPose('kit',{rig:bones}),layout=VIGIL_OBJECT_LAYOUT.kit,fit=surface(.14,.91),hand=bones.findIndex(b=>b.name==='hand_R'),boneMatrices=bones.map(b=>{const p=pose.joints['vigil_kit_'+b.name];return new Matrix4().compose(new Vector3(...V(b.head,p.translation)),new Quaternion(...p.rotation),new Vector3(1,1,1)).multiply(new Matrix4().makeTranslation(...M(b.head,-1)));}),skin=(point,joints,weights)=>{const matrix=new Matrix4();matrix.elements.fill(0);for(let i=0;i<4;i++)for(let k=0;k<16;k++)matrix.elements[k]+=boneMatrices[joints[i]].elements[k]*weights[i];return new Vector3(...point).applyMatrix4(matrix);};
 const start=skin([.195,.845,fit.z-.086],fit.joints,fit.weights),end=new Vector3(0,-.10,.008).applyQuaternion(new Quaternion(...pose.object.rotation)).add(new Vector3(...pose.object.position)),p1=new Vector3(.31,.70,Math.min(start.z-.025,-.22)),p2=new Vector3(.29,.78,-.38),curve=[];
 for(let i=0;i<=32;i++){const t=i/32,u=1-t;curve.push(start.clone().multiplyScalar(u*u*u).addScaledVector(p1,3*u*u*t).addScaledVector(p2,3*u*t*t).addScaledVector(end,t*t*t).toArray());}
 const cable=tube('connected loose recorder lead',material,curve,.0032,hand,8);
 for(let v=0;v<cable.positions.length/3;v++){const t=Math.min(1,Math.floor(v/8)/32),handWeight=t*t*(3-2*t),map=new Map(fit.joints.map((j,i)=>[j,fit.weights[i]*(1-handWeight)]));map.set(hand,(map.get(hand)||0)+handWeight);const pairs=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4),total=pairs.reduce((n,p)=>n+p[1],0);while(pairs.length<4)pairs.push([0,0]);const joints=pairs.map(p=>p[0]),weights=pairs.map(p=>p[1]/total),matrix=new Matrix4();matrix.elements.fill(0);for(let i=0;i<4;i++)for(let k=0;k<16;k++)matrix.elements[k]+=boneMatrices[joints[i]].elements[k]*weights[i];const p=new Vector3(...cable.positions.slice(v*3,v*3+3)).applyMatrix4(matrix.invert());cable.positions.splice(v*3,3,...p.toArray());cable.skinIndex.splice(v*4,4,...joints);cable.skinWeight.splice(v*4,4,...weights);}
 return geometry(cable.name,material,cable.positions,cable.indices,cable.skinIndex,cable.skinWeight);
}
function clearPosedWebbing(webbing,clothes,bones){
 // The sleeve can fold over the resting chest even when the strap has correct
 // torso weights. Fit its loose bridge against both held poses, inverse-skinning
 // the required clearance back into the bind mesh.
 const poses=[vigilCharacterPose('kit',{rig:bones}),vigilCharacterPose('kit',{rig:bones,action:'camera-check',progress:.5})];
 for(let pass=0;pass<2;pass++)for(const pose of poses){
  const matrices=bones.map(b=>{const p=pose.joints['vigil_kit_'+b.name];return new Matrix4().compose(new Vector3(...V(b.head,p.translation)),new Quaternion(...p.rotation),new Vector3(1,1,1)).multiply(new Matrix4().makeTranslation(...M(b.head,-1)));});
  const matrixAt=(mesh,v)=>{const result=new Matrix4();result.elements.fill(0);for(let slot=0;slot<4;slot++){const matrix=matrices[mesh.skinIndex[v*4+slot]],weight=mesh.skinWeight[v*4+slot];for(let k=0;k<16;k++)result.elements[k]+=matrix.elements[k]*weight;}return result;};
  const posed=clothes.filter(m=>/continuous-tailored-coat/.test(m.name)).map(mesh=>{const positions=[];for(let v=0;v<mesh.positions.length/3;v++)positions.push(...new Vector3(...mesh.positions.slice(v*3,v*3+3)).applyMatrix4(matrixAt(mesh,v)).toArray());return{...mesh,positions};}),surface=clothSurface(posed,{includeArms:true});
  for(let v=0;v<webbing.positions.length/3;v++){const matrix=matrixAt(webbing,v),p=new Vector3(...webbing.positions.slice(v*3,v*3+3)).applyMatrix4(matrix),front=surface(p.x,p.y).z-.012;if(p.z>front){p.z=front;webbing.positions.splice(v*3,3,...p.applyMatrix4(matrix.invert()).toArray());}}
 }
 return geometry(webbing.name,webbing.material,webbing.positions,webbing.indices,webbing.skinIndex,webbing.skinWeight);
}
function distinctDress(design,bones,mat,clothes){const out=[],joint=name=>bones.findIndex(b=>b.name===name),id=design.mesh.split('_')[1],h=design.height,surface=clothSurface(clothes),add=m=>out.push(m),patch=(name,x,y,w,hh,material=mat.trim,layer=.008)=>{const span=surface.span(y);if(span){w=Math.min(w,(span[1]-span[0])*(/quilt seam/.test(name)?.92:.30));x=Math.max(span[0]+w/2+.004,Math.min(span[1]-w/2-.004,x));}if(/quilt seam/.test(name)){const steps=Math.ceil(w/.002),fit=Array.from({length:steps+1},(_,i)=>{const xx=x-w/2+w*i/steps,s=surface(xx,y);return{...s,p:[xx,y,s.z-.0018]};}),seam=tube(name,material,fit.map(s=>s.p),.0007,0,4);for(let i=0;i<seam.skinIndex.length;i+=4){const s=fit[Math.floor(i/4/4)];seam.skinIndex.splice(i,4,...s.joints);seam.skinWeight.splice(i,4,...s.weights);}add(seam);}else add(clothStrip(name,material,[[x,y+hh/2],[x,y-hh/2]],w,surface,layer));};
 if(['ruth','owen','denise'].includes(id)){const n=bones.find(b=>b.name==='neck'),pts=Array.from({length:65},(_,i)=>{const a=i*Math.PI/32;return[n.head[0]+Math.sin(a)*.068*design.width,n.head[1]+.010+.004*Math.cos(a),n.head[2]-Math.cos(a)*.066*design.depth];});add(tube('soft wool scarf wrap',mat.scarf,pts,.014,joint('neck'),12));}
 if(id==='ruth'||id==='denise')add(clothBelt('cloth belt',mat.trim,h*.60,design.width*.215,surface));
 if(id==='ruth')add(looseScarf('wool scarf',mat.scarf,[[-.025,h*.863],[-.075,h*.715]],.083,surface,bones.find(b=>b.name==='neck')));
 if(id==='leila'){for(let i=0;i<5;i++)patch('quilt seam '+i,0,1.0+i*.065,.31,.002,mat.trim,.003);for(const sign of[-1,1])patch('jacket pocket '+sign,sign*.105,1.02,.080,.075,mat.coat,.007);}
 if(id==='owen')add(looseScarf('narrow wool scarf',mat.scarf,[[.035,h*.865],[.062,h*.655]],.076,surface,bones.find(b=>b.name==='neck')));
 if(id==='denise')add(looseScarf('ochre wool scarf',mat.scarf,[[-.02,h*.866],[-.065,h*.72]],.078,surface,bones.find(b=>b.name==='neck')));
 if(id==='malcolm'){add(coatHood(design,bones,mat));for(const sign of[-1,1]){patch('parka pocket '+sign,sign*.16,.92,.125,.115,mat.coat,.006);patch('pocket flap '+sign,sign*.16,.985,.14,.025,mat.trim,.009);}}
 if(id==='kit'){
  const webbing=clothStrip('recorder webbing strap',mat.trim,[[-.11,h*.79],[-.055,h*.68],[.13,h*.55]],.025,surface,.020);
  // A carrying strap rests over the torso. It must not inherit the sleeve's
  // upper-arm weights when the other hand reaches up to the headphone cup.
  for(let i=0;i<webbing.skinIndex.length;i+=4){let total=0;for(let k=0;k<4;k++){if(!/^(pelvis|spine_|chest|clavicle_)/.test(bones[webbing.skinIndex[i+k]].name))webbing.skinWeight[i+k]=0;total+=webbing.skinWeight[i+k];}if(total<1e-8){webbing.skinIndex.splice(i,4,joint('chest'),0,0,0);webbing.skinWeight.splice(i,4,1,0,0,0);}else for(let k=0;k<4;k++)webbing.skinWeight[i+k]/=total;}
  add(clearPosedWebbing(webbing,clothes,bones));
  const s=surface(.14,.91),recorder=box('field recorder',mat.rubber,[.14,.91,s.z-.046],[.14,.17,.065],joint('spine_lower'));for(let i=0;i<recorder.skinIndex.length;i+=4){recorder.skinIndex.splice(i,4,...s.joints);recorder.skinWeight.splice(i,4,...s.weights);}add(recorder);
  const meter=box('VU meter',mat.paper,[.14,.95,s.z-.080],[.095,.033,.003],joint('spine_lower'));for(let i=0;i<meter.skinIndex.length;i+=4){meter.skinIndex.splice(i,4,...s.joints);meter.skinWeight.splice(i,4,...s.weights);}add(meter);
  add(equipmentLead(bones,surface,mat.rubber));
 }
 return out;
}
function articles(design,bones,mat){const meshes=[],joint=0,id=design.mesh.split('_')[1],layout=VIGIL_OBJECT_LAYOUT[id],kind=layout.kind,add=m=>meshes.push(m),at=(x,y,z)=>[x,y,z];
 if(kind==='folder'){const w=layout.width,h=layout.height;add(box('cloth folder cover',mat.ink,[0,0,.004],[w+.018,h+.018,.010],joint));add(box('rota paper',mat.paper,[0,0,-.005],[w-.012,h-.012,.006],joint));for(let i=0;i<5;i++)add(box('rota ruled line '+i,mat.trim,[0,.08-i*.045,-.009],[w-.05,.0015,.001],joint));add(box('rota heading',mat.ink,[.015,.13,-.01],[.15,.007,.001],joint));for(let i=0;i<3;i++)add(tube('binder ring '+i,mat.metal,[[-w/2+.02,.10-i*.10,-.01],[-w/2+.008,.10-i*.10,-.025],[-w/2-.003,.10-i*.10,-.005]],.0025,joint,8));}
 if(kind==='flask'){const r=layout.radius,h=layout.height;add(tube('insulated flask',mat.metal,[[0,-h/2,0],[0,h/2-.025,0]],r,joint,32));add(tube('canvas flask sleeve',mat.trim,[[0,-h/2+.016,0],[0,h/2-.045,0]],r+.001,joint,32));add(tube('flask screw cap',mat.rubber,[[0,h/2-.025,0],[0,h/2,0]],r+.003,joint,32));for(let i=0;i<3;i++)add(ring('woven stripe '+i,mat.scarf,[0,0,0],r+.002,r+.002,-.08+i*.065,joint,32));}
 if(kind==='umbrella'){add(tube('thick straight grip',mat.rubber,[[0,-.12,0],[0,.09,0]],.014,joint,24));add(tube('steel shaft',mat.metal,[[0,-.95,0],[0,.025,0]],.009,joint,16));add(tube('furled umbrella',mat.coat,[[0,-.90,0],[0,-.52,0],[0,-.09,0]],[.012,.040,.014],joint,28));add(tube('curved handle',mat.rubber,[[0,.09,0],[.012,.127,0],[.050,.141,0],[.085,.122,0],[.093,.085,0]],.014,joint,16));add(ellipsoid('rubber ferrule',mat.rubber,[0,-.95,0],[.014,.022,.014],joint));for(let i=0;i<6;i++){const a=i*Math.PI/3;add(tube('fabric seam '+i,mat.trim,[[Math.cos(a)*.013,-.87,Math.sin(a)*.013],[Math.cos(a)*.041,-.52,Math.sin(a)*.041],[Math.cos(a)*.015,-.10,Math.sin(a)*.015]],.0015,joint,5));}}
 if(kind==='photographs'){for(let k=2;k>=0;k--){const x=k*.016-.012,y=-k*.012,z=k*.003,w=layout.width,h=layout.height;add(box('photo border '+k,mat.paper,[x,y,z],[w,h,.002],joint));add(box('archive image '+k,mat.photo,[x,y+.005,z-.002],[w-.024,h-.032,.001],joint));add(box('doorway in photograph '+k,mat.ink,[x+.025,y,z-.003],[.030,.062,.001],joint));add(box('figure in photograph '+k,mat.trim,[x-.025,y-.005,z-.003],[.020,.045,.001],joint));}}
 if(kind==='map'){add(creasedSheet('folded street map',mat.paper,[0,0,0],layout.width,layout.height,joint));for(let i=1;i<4;i++)add(box('fold '+i,mat.trim,[-layout.width/2+i*layout.width/4,0,-.008],[.0015,layout.height-.012,.001],joint));for(const [x,y,w]of[[-.12,.08,.10],[.05,.05,.12],[-.05,-.055,.11],[.12,-.09,.08]])add(box('street run',mat.trim,[x,y,-.009],[w,.0015,.001],joint));add(tube('pencil bearing',mat.ink,[[-.12,.04,-.010],[.11,-.065,-.010]],.0015,joint,5));}
 if(kind==='microphone'){add(tube('microphone grip',mat.rubber,[[0,-.10,0],[0,.12,0]],.018,joint,24));add(tube('shock mount bridge',mat.metal,[[0,.105,0],[0,.125,-.065]],.014,joint,16));add(tube('shotgun housing',mat.metal,[[0,.125,-.045],[0,.125,-.275]],.024,joint,24));add(tube('foam windshield',mat.rubber,[[0,.125,-.10],[0,.125,-.29]],[.035,.035],joint,28));add(tube('lead connector',mat.rubber,[[0,-.10,.008],[0,-.12,.008]],.009,joint,16));}
 return meshes;
}
function merge(meshes){const grouped=new Map();for(const src of meshes){let out=grouped.get(src.material);if(!out){out={positions:[],normals:[],uv:[],skinIndex:[],skinWeight:[],indices:[]};grouped.set(src.material,out);}const used=[...new Set(src.indices)].sort((a,b)=>a-b),offset=out.positions.length/3,lookup=new Map(used.map((v,i)=>[v,offset+i]));for(const v of used){out.positions.push(...src.positions.slice(v*3,v*3+3));out.normals.push(...src.normals.slice(v*3,v*3+3));out.uv.push(...(src.uv?.slice(v*2,v*2+2)||[0,0]));out.skinIndex.push(...src.skinIndex.slice(v*4,v*4+4));out.skinWeight.push(...src.skinWeight.slice(v*4,v*4+4));}out.indices.push(...src.indices.map(i=>lookup.get(i)));}return grouped;}
function primitives(meshes){for(const m of meshes){const i=m.positions.findIndex(v=>!Number.isFinite(v));if(i>=0)throw Error(`nonfinite positions in ${m.name} at ${i}`);}return [...merge(meshes)].map(([material,m])=>{if(Math.max(...m.indices)>65535)throw Error(`vigil material ${material} exceeds 16-bit indices`);return{mode:4,material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),TEXCOORD_0:accessor(m.uv,'VEC2',5126,34962),JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}};});}
const progress=(id,stage)=>{if(process.env.VIGIL_BUILD_PROGRESS)console.error(new Date().toISOString(),id,stage);};
const rigs={},summary=[],packs=[];
for(const pair of [['ruth','leila'],['owen','denise'],['malcolm','kit']]){
gltf=freshGltf();chunks=[];cursor=0;fabricCache=new Map();
for(const id of pair){const design=DESIGNS[id],source=masters[design.source],[point]=scaled(source,design),bones=source.bones.map(b=>({name:b.name,parent:b.parent,head:point(b.head),tail:point(b.tail)})),mat=materials(design);progress(id,'tailoring');const clothes=fittedGarment(design,source,mat);progress(id,'identity');const anatomy=refineVigilIdentity(sourceMeshes(source,design,mat),bones,design,mat);progress(id,'dress');const dress=distinctDress(design,bones,mat,clothes);progress(id,'fabric UV');const body=[...anatomy,...clothes,...dress,...secondaryVigilObjects(id,bones,mat)].map(mesh=>[mat.coat,mat.trim,mat.scarf].includes(mesh.material)?fabricUV(mesh,bones):mesh),part=articles(design,bones,mat);rigs[id]=bones;progress(id,'export');
  const rootNode=gltf.nodes.length;gltf.nodes.push({name:`vigil_${id}_root`,children:[]});gltf.scenes[0].nodes.push(rootNode);
  const joints=bones.map(b=>{const i=gltf.nodes.length;gltf.nodes.push({name:`vigil_${id}_${b.name}`,translation:b.head,rotation:[0,0,0,1]});gltf.nodes[rootNode].children.push(i);return i;});
  const bind=bones.flatMap(b=>[1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1]);const skin=gltf.skins.length;gltf.skins.push({name:`vigil_${id}_skin`,joints,inverseBindMatrices:accessor(bind,'MAT4')});
  const objectJoint=gltf.nodes.length;gltf.nodes.push({name:`vigil_${id}_object`,translation:[0,0,0],rotation:[0,0,0,1]});gltf.nodes[rootNode].children.push(objectJoint);
  const objectSkin=gltf.skins.length;gltf.skins.push({name:`vigil_${id}_object_skin`,joints:[objectJoint],inverseBindMatrices:accessor([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],'MAT4')});
  for(const[name,meshes,kind,entrySkin]of[[design.mesh,body,'body',skin],[design.part,part,'handled object',objectSkin]]){const m=gltf.meshes.length;gltf.meshes.push({name,primitives:primitives(meshes),extras:{identity:id,kind,source:'MakeHuman CC0 anatomy with retargeted rainwear and contact-led objects',age:design.age,build:design.build,dress:design.dress}});gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({name,mesh:m,skin:entrySkin});}
  summary.push({id,age:design.age,build:design.build,dress:design.dress,identity:VIGIL_IDENTITY_PROFILES[id],bodyVertices:body.reduce((n,m)=>n+new Set(m.indices).size,0),objectVertices:part.reduce((n,m)=>n+new Set(m.indices).size,0),joints:bones.length,garment:clothes.find(m=>m.drape)?.drape,envelopeFit:clothes.find(m=>m.envelopeFit)?.envelopeFit});
}
while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}gltf.buffers=[{byteLength:cursor}];let js=Buffer.from(JSON.stringify(gltf));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);const bin=Buffer.concat(chunks),total=12+8+js.length+8+bin.length,header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([header,js,bh,bin]);
parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));const output=path.join(root,`public/assets/vigil-characters-${pair.join('-')}.glb`);fs.writeFileSync(output,bytes);packs.push({file:path.basename(output),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),ids:pair});
}
fs.writeFileSync(rigOutput,'// Generated by build-vigil-characters.mjs; local -Z is forward.\nexport const VIGIL_CHARACTER_RIGS = Object.freeze('+JSON.stringify(rigs)+' );\n');
const designSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/data/vigil-character-design.js'))).digest('hex');
const sourceFiles=['tools/chunk_surfer/characters/vigil-body-fit.mjs','tools/chunk_surfer/characters/vigil-garment-drape.mjs','tools/chunk_surfer/characters/vigil-character-identity.mjs','tools/chunk_surfer/characters/vigil-fabric-textures.mjs','tools/chunk_surfer/characters/vigil-secondary-objects.mjs','tools/chunk_surfer/characters/build-vigil-characters.mjs','tools/chunk_surfer/characters/vigil-tailoring.mjs','src/data/vigil-object-layout.js','src/data/vigil-secondary-object-layout.js','src/render/vigil-character-performance.js'];
const sourceSha256=Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
fs.writeFileSync(manifestOutput,JSON.stringify({version:2,source:'MakeHuman CC0 retained anatomical masters',designSha256,sourceSha256,packs,characters:summary},null,2)+'\n');console.log(JSON.stringify({packs,characters:summary}));
