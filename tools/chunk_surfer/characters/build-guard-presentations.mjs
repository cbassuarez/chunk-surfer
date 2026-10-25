// Targeted derivative of the retained guard. No Blender or shared actor export.
// The Source aperture reuses the actual recordist boy's Squals-reference bowl;
// only its fit to the guard's anatomical face changes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {prune} from '@gltf-transform/functions';
import {parseCharacterAsset} from '../../../src/render/character-asset.js';

const root=fileURLToPath(new URL('../../../',import.meta.url)),source='public/assets/outskirts-characters.glb';
const input=fs.readFileSync(root+source),io=new NodeIO(),doc=await io.readBinary(input),buffer=doc.getRoot().listBuffers()[0];
const guard=doc.getRoot().listNodes().find(n=>n.getMesh()?.getName()==='outskirts_fold_guard'),original=guard.getMesh();
const body=original.listPrimitives().find(p=>p.getMaterial().getName()==='skin_guard');
const head=guard.getSkin().listJoints().findIndex(n=>n.getName()==='head');
const acc=(name,type,array)=>doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
const stats={original:{path:source,sha256:crypto.createHash('sha256').update(input).digest('hex')},
  reference:{path:'public/assets/recordist-characters/boy.json',builder:'tools/chunk_surfer/characters/build-recordist-anatomy.py',mechanism:'removed facial anatomy, receding rim and closed 80-segment bowl'},
  variants:{},cap:{frontZ:-.273,undersideY:1.743,headJoint:head},shadow:{method:'brim occlusion baked into retained skin material, plus actual projecting cap geometry',overworldFaceRetained:true}};

function subset(p,indices,name,material=p.getMaterial()){
  const ids=[...new Set(indices)],remap=new Map(ids.map((id,i)=>[id,i]));
  const copy=(a,label)=>{const width=a.getElementSize(),old=a.getArray(),out=new old.constructor(ids.length*width);for(let i=0;i<ids.length;i++)out.set(old.subarray(ids[i]*width,(ids[i]+1)*width),i*width);return acc(name+' '+label,a.getType(),out).setNormalized(a.getNormalized());};
  const q=doc.createPrimitive().setMaterial(material).setIndices(acc(name+' indices','SCALAR',new Uint16Array(indices.map(i=>remap.get(i)))));
  for(const semantic of p.listSemantics())q.setAttribute(semantic,copy(p.getAttribute(semantic),semantic));
  for(const target of p.listTargets()){const t=doc.createPrimitiveTarget();for(const semantic of target.listSemantics())t.setAttribute(semantic,copy(target.getAttribute(semantic),'morph '+semantic));q.addTarget(t);}
  return q;
}
function triangles(p,accept){const positions=p.getAttribute('POSITION').getArray(),indices=p.getIndices().getArray(),result=[];for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],c=[0,0,0];for(const id of ids)for(let k=0;k<3;k++)c[k]+=positions[id*3+k]/3;if(accept(c,ids))result.push(...ids);}return result;}
function material(name,base,roughness=1,metallic=0,extras={}){return doc.createMaterial(name).setBaseColorFactor([...base,1]).setRoughnessFactor(roughness).setMetallicFactor(metallic).setDoubleSided(true).setExtras(extras);}
function geometry(name,points,faces,mat){
  const indices=faces.flatMap(f=>{const out=[];for(let i=1;i<f.length-1;i++)out.push(f[0],f[i],f[i+1]);return out;}),normals=new Float32Array(points.length*3);
  for(let i=0;i<indices.length;i+=3){const[a,b,c]=indices.slice(i,i+3).map(j=>points[j]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const j of indices.slice(i,i+3))for(let k=0;k<3;k++)normals[j*3+k]+=n[k];}
  for(let i=0;i<points.length;i++){const length=Math.hypot(...normals.subarray(i*3,i*3+3))||1;for(let k=0;k<3;k++)normals[i*3+k]/=length;}
  const joints=new Uint16Array(points.length*4),weights=new Float32Array(points.length*4);for(let i=0;i<points.length;i++){joints[i*4]=head;weights[i*4]=1;}
  const p=doc.createPrimitive().setMaterial(mat).setAttribute('POSITION',acc(name+' positions','VEC3',new Float32Array(points.flat())))
    .setAttribute('NORMAL',acc(name+' normals','VEC3',normals)).setAttribute('TEXCOORD_0',acc(name+' uv','VEC2',new Float32Array(points.length*2)))
    .setAttribute('JOINTS_0',acc(name+' joints','VEC4',joints)).setAttribute('WEIGHTS_0',acc(name+' weights','VEC4',weights)).setIndices(acc(name+' indices','SCALAR',new Uint16Array(indices)));
  for(let i=0;i<4;i++)p.addTarget(doc.createPrimitiveTarget().setAttribute('POSITION',acc(name+' fixed morph '+i,'VEC3',new Float32Array(points.length*3))));
  return p;
}
const cloth=material('guard peaked cap wool',[.018,.023,.021],.96,0,{characterRole:'guard-cap'}),under=material('guard brim underside',[.006,.008,.007],1,0,{characterRole:'guard-cap-underside'}),band=material('guard cap band',[.011,.014,.012],.96,0,{characterRole:'guard-cap-band'});
function cap(){
  const pieces=[],count=48,points=[],faces=[];
  // A flattened cloth crown with a closed top, seated over the retained hair.
  for(const[y,rx,rz]of[[1.764,.101,.121],[1.793,.111,.128],[1.851,.102,.113],[1.872,.060,.069]])for(let i=0;i<count;i++){const a=i/count*Math.PI*2;points.push([Math.cos(a)*rx,y,-.035+Math.sin(a)*rz]);}
  for(let j=1;j<4;j++)for(let i=0;i<count;i++)faces.push([(j-1)*count+i,(j-1)*count+(i+1)%count,j*count+(i+1)%count,j*count+i]);
  faces.push([...Array(count)].map((_,i)=>3*count+i));pieces.push(geometry('fitted cap crown',points,faces,cloth));
  const pv=[],pf=[],top=[],bottom=[];
  // The peak is a curved, 8 mm solid projection, not a dark face overlay.
  for(let layer=0;layer<2;layer++)for(let row=0;row<=6;row++)for(let i=0;i<=32;i++){const x=(i/32*2-1)*.125,side=Math.sqrt(Math.max(0,1-(x/.128)**2)),t=row/6,z=-.083-t*.190*side,y=1.775-.024*t+.006*(x/.125)**2-layer*.008;pv.push([x,y,z]);}
  const width=33,layerSize=7*width;
  for(let row=1;row<=6;row++)for(let i=1;i<=32;i++){const a=(row-1)*width+i-1,b=a+1,c=row*width+i,d=c-1;top.push([a,b,c,d]);bottom.push([a+layerSize,d+layerSize,c+layerSize,b+layerSize]);}
  pf.push(...top,...bottom);for(let i=0;i<32;i++){const a=6*width+i;pf.push([a,a+layerSize,a+1+layerSize,a+1]);}
  for(let row=0;row<6;row++)for(const i of[0,32]){const a=row*width+i,b=(row+1)*width+i;pf.push([a,b,b+layerSize,a+layerSize]);}
  pieces.push(geometry('solid cap peak',pv,pf,under));
  const bv=[],bf=[];for(const y of[1.765,1.790])for(let i=0;i<count;i++){const a=i/count*Math.PI*2;bv.push([Math.cos(a)*.112,y,-.035+Math.sin(a)*.129]);}for(let i=0;i<count;i++)bf.push([i,(i+1)%count,count+(i+1)%count,count+i]);pieces.push(geometry('sewn cap band',bv,bf,band));
  return pieces;
}

// The ordinary man retains all facial anatomy. A narrow value falloff below
// the actual peak is baked occlusion, so the face never reads as Source's hole.
const overworld=doc.createMesh('overworld_booth_guard').setExtras({...original.getExtras(),guardPresentation:'cap-shadow'}),faceBands=[[],[],[],[]];
const shadowBand=c=>{const[x,y,z]=c;if(y<1.575||y>1.785||Math.abs(x)>.094||z>-.067)return 0;return y>1.695?3:y>1.635?2:1;};
for(const p of original.listPrimitives()){
  if(['skin_guard','anatomical_eyes'].includes(p.getMaterial().getName())){
    const bands=[[],[],[],[]];triangles(p,(c,ids)=>{bands[shadowBand(c)].push(...ids);return false;});
    for(let i=0;i<bands.length;i++)if(bands[i].length){const mat=i===0?p.getMaterial():p.getMaterial().clone().setName(p.getMaterial().getName()+' under cap '+i).setBaseColorFactor([[1,1,1,1],[.095,.105,.12,1],[.028,.035,.046,1],[.012,.017,.025,1]][i]).setRoughnessFactor(.94).setExtras({characterRole:'guard-cap-shadow',bakedBrimOcclusion:true,faceAnatomyRetained:true});overworld.addPrimitive(subset(p,bands[i],'overworld face band '+i,mat));faceBands[i].push(bands[i].length/3);}
  }else overworld.addPrimitive(p.clone());
}
for(const p of cap())overworld.addPrimitive(p);
const ordinary=doc.createNode('overworld_booth_guard').setMesh(overworld).setSkin(guard.getSkin()).setTranslation(guard.getTranslation()).setRotation(guard.getRotation()).setScale(guard.getScale());guard.getParentNode().addChild(ordinary);
// Preserve ordinary facial expression morph channels on the derivative node.
for(const animation of doc.getRoot().listAnimations())for(const channel of [...animation.listChannels()])if(channel.getTargetNode()===guard&&channel.getTargetPath()==='weights')animation.addChannel(channel.clone().setTargetNode(ordinary));
stats.variants.overworld={mesh:overworld.getName(),faceTrianglesByShade:faceBands.map(a=>a.reduce((n,v)=>n+v,0)),facialAnatomyRemoved:false};

// Reuse the exact Source/Squals-reference topology and black material. The
// outer lip is fitted to this guard's face; the backing is physically recessed.
const referenceBytes=fs.readFileSync(root+stats.reference.path),boy=JSON.parse(referenceBytes);stats.reference.sha256=crypto.createHash('sha256').update(referenceBytes).digest('hex');
const cy=1.670,xFit=.80,yFit=1.02,rx=.078*xFit,ry=.088*yFit,ellipse=c=>(c[0]/rx)**2+((c[1]-cy)/ry)**2;
const skinPoints=body.getAttribute('POSITION').getArray(),skinIndices=body.getIndices().getArray();
function frontSurface(x,y){let z=Infinity;for(let i=0;i<skinIndices.length;i+=3){const[a,b,c]=Array.from(skinIndices.subarray(i,i+3),id=>Array.from(skinPoints.subarray(id*3,id*3+3)));const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;if(Math.min(u,v,w)<-.00001)continue;const q=a[2]*u+b[2]*v+c[2]*w;if(q<-.06)z=Math.min(z,q);}if(!Number.isFinite(z))throw Error(`Guard aperture escapes anatomical face at ${x},${y}`);return z;}
const sourceMesh=doc.createMesh('outskirts_fold_guard').setExtras({...original.getExtras(),guardPresentation:'source-facial-absence'});let removed=0;
for(const p of original.listPrimitives()){
  const name=p.getMaterial().getName();if(name==='anatomical_eyes'){removed+=p.getIndices().getCount()/3;continue;}
  if(name==='skin_guard'||name==='short_hair'){const kept=triangles(p,c=>{const cut=c[2]<-.060&&ellipse(c)<1.12;if(cut)removed++;return !cut;});sourceMesh.addPrimitive(subset(p,kept,'Source retained '+name));}else sourceMesh.addPrimitive(p.clone());
}
for(const[name,materialIndex]of[['boy-receding-aperture-rim',13],['boy-closed-facial-absence',12]]){
  const m=boy.meshes.find(m=>m.name===name),sourceMaterial=boy.materials[materialIndex],mat=material(name.replace('boy','guard'),sourceMaterial.baseColor.slice(0,3),sourceMaterial.roughness,sourceMaterial.metallic,{characterRole:sourceMaterial.role,reference:stats.reference.path});
  const points=[];for(let i=0;i<m.positions.length;i+=3){const[x,y,z]=m.positions.slice(i,i+3),gx=x*xFit,gy=cy+(y-1.235)*yFit,theta=Math.atan2(y-1.235,x),outer=frontSurface(rx*1.07*Math.cos(theta),cy+ry*1.07*Math.sin(theta));let gz;
    if(Math.abs(z-(-.079+.024*Math.abs(Math.cos(theta))))<.001)gz=outer+.001;
    else if(Math.abs(z-(-.072+.024*Math.abs(Math.cos(theta))))<.001)gz=outer+.008;
    else gz=z-.078;
    points.push([gx,gy,gz]);
  }
  const faces=[];for(let i=0;i<m.indices.length;i+=3)faces.push(m.indices.slice(i,i+3));sourceMesh.addPrimitive(geometry(name.replace('boy','guard'),points,faces,mat));
}
guard.setMesh(sourceMesh);stats.variants.source={mesh:sourceMesh.getName(),cap:false,removedFacialTriangles:removed,apertureRadius:[rx,ry],closedRear:true,sourceTopologyReused:true};

// The overprint actor remains in the original pack. This derivative adds only
// the two guard readings and does not replace another character's catalog slot.
const player=doc.getRoot().listNodes().find(n=>n.getMesh()?.getName()==='outskirts_overprint_body');
for(const animation of doc.getRoot().listAnimations())for(const channel of [...animation.listChannels()])if(channel.getTargetNode()===player)channel.dispose();
player.dispose();await doc.transform(prune());
doc.getRoot().setExtras({guardPresentations:stats});
const output=await io.writeBinary(doc),parsed=parseCharacterAsset(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength));
stats.bytes=output.byteLength;stats.meshes=parsed.entries.map(e=>({mesh:e.name,primitives:e.primitives.length,vertices:e.primitives.reduce((n,p)=>n+p.vertexCount,0),joints:e.skin.joints.length,morphs:e.morphCount}));
fs.writeFileSync(root+'public/assets/guard-presentations.glb',output);fs.writeFileSync(root+'public/assets/guard-presentations.stats.json',JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(root+'public/assets/guard-presentations.credits.json',JSON.stringify({license:'CC0-1.0',original:stats.original,originalCredits:'public/assets/outskirts-characters/CREDITS.md',apertureReference:stats.reference,authoredAdditions:['fitted peaked cap and brim occlusion','anatomical fitting of the retained Source facial aperture'],build:'tools/chunk_surfer/characters/build-guard-presentations.mjs'},null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
