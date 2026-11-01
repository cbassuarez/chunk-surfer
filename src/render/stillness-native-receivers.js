// Native wall hosts, resolved ONCE when a stillness bout latches. No GPU,
// clock, gameplay state, geometry mutation or per-frame raycasts live here.
//
// Geometry is primitive.nativeReceiverGeometry {positions,normals,uvs,indices}
// in the primitive's original mesh-local frame. Matrices use the same column-
// major order as props3d: instance matrix * mesh.nodeMatrix. Camera, bounds,
// output dimensions and world axes are physical METRES. Geometry arrays are
// retained immutable renderer inputs; a WeakMap only caches their local AABB.
//
// The rectangle is wholly inside one connected planar primitive, including its
// holes and UV islands. Edges of every hole must remain outside its interior;
// a grid additionally checks triangle support/UVs. A failed fit shrinks at the
// sculpt's original aspect; it never stretches a head or invents a filled wall.
import {stillnessSurfaceEligible} from './stillness-presentation.js';
import {STILLNESS_ANATOMY} from '../data/generated/stillness-anatomy.js';

const EPS=1e-7,PLANE_EPS=.001,NORMAL_DOT=.99995;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const vec=v=>Array.isArray(v)||ArrayBuffer.isView(v)?[v[0],v[1],v[2]]:v&&[v.x,v.y,v.z];
const valid=v=>v?.length===3&&v.every(Number.isFinite);
const add=(a,b,s=1)=>a.map((v,k)=>v+b[k]*s),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return n>1e-10?a.map(v=>v/n):null;};
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrixValid=m=>m?.length===16&&Array.from(m).every(Number.isFinite)&&Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])<EPS&&Math.abs(m[15]-1)<EPS;
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const direction=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]);
function multiply(a,b){const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
function model(instance,mesh){
  let root=instance.matrix;
  if(!root){const s=finite(instance.scale||1,1),sx=finite(instance.scaleX,1)*s,sy=finite(instance.scaleY,1)*s,sz=finite(instance.scaleZ,1)*s,c=Math.cos(finite(instance.yaw,0)),n=Math.sin(finite(instance.yaw,0));
    root=[c*sx,0,n*sx,0,0,sy,0,0,-n*sz,0,c*sz,0,finite(instance.x,0),finite(instance.y,0),finite(instance.z,0),1];}
  const node=mesh.nodeMatrix||identity();return matrixValid(root)&&matrixValid(node)?multiply(root,node):null;
}
function inverseFrame(m){
  const a=m.slice(0,3),b=m.slice(4,7),c=m.slice(8,11),r0=cross(b,c),d=dot(a,r0);
  if(Math.abs(d)<1e-10)return null;
  const rows=[r0,cross(c,a),cross(a,b)].map(v=>v.map(n=>n/d));
  return{rows,point:p=>rows.map(r=>dot(r,sub(p,m.slice(12,15)))),direction:p=>rows.map(r=>dot(r,p)),
    normal:n=>unit([0,1,2].map(k=>rows[0][k]*n[0]+rows[1][k]*n[1]+rows[2][k]*n[2]))};
}
const cachedBounds=new WeakMap();
function localBounds(primitive){
  const g=primitive.nativeReceiverGeometry;
  if(g&&cachedBounds.has(g))return cachedBounds.get(g);
  let b=primitive.nativeReceiverBounds;
  if(g?.positions?.length>=9){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const ids=g.indices||Array.from({length:g.positions.length/3},(_,i)=>i);
    for(const id of ids){if(!Number.isInteger(id)||id<0||id*3+2>=g.positions.length)return null;for(let a=0;a<3;a++){
      const v=g.positions[id*3+a];if(!Number.isFinite(v))return null;min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);
    }}b={min,max};}
  if(!valid(vec(b?.min))||!valid(vec(b?.max)))return null;
  const result={min:vec(b.min),max:vec(b.max)};if(g)cachedBounds.set(g,result);return result;
}
function worldBounds(b,m){const corners=[];for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)corners.push(point(m,[x?b.max[0]:b.min[0],y?b.max[1]:b.min[1],z?b.max[2]:b.min[2]]));
  return{min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))};}
function boxHit(eye,ray,b){let near=0,far=Infinity;for(let k=0;k<3;k++){
  if(Math.abs(ray[k])<1e-10){if(eye[k]<b.min[k]-EPS||eye[k]>b.max[k]+EPS)return Infinity;continue;}
  let lo=(b.min[k]-eye[k])/ray[k],hi=(b.max[k]-eye[k])/ray[k];if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);if(near>far+EPS)return Infinity;
}return far>=0?near:Infinity;}
function triangleHit(eye,ray,t){
  const e1=sub(t.b,t.a),e2=sub(t.c,t.a),h=cross(ray,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;
  const s=sub(eye,t.a),u=dot(s,h)/det;if(u<-EPS||u>1+EPS)return null;
  const q=cross(s,e1),v=dot(ray,q)/det;if(v<-EPS||u+v>1+EPS)return null;
  const distance=dot(e2,q)/det;return distance>=1e-5?{distance,point:add(eye,ray,distance),triangle:t}:null;
}
function triangles(entry){
  if(entry.triangles)return entry.triangles;
  const g=entry.primitive.nativeReceiverGeometry,result=[];
  if(!g?.positions||!g.normals||!g.uvs||!g.indices)return entry.triangles=result;
  for(let i=0;i+2<g.indices.length;i+=3){const ids=[g.indices[i],g.indices[i+1],g.indices[i+2]];
    if(ids.some(v=>!Number.isInteger(v)||v<0||v*3+2>=g.positions.length||v*3+2>=g.normals.length||v*2+1>=g.uvs.length))continue;
    const p=ids.map(id=>point(entry.model,Array.from(g.positions.slice(id*3,id*3+3)))),n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));
    if(!n||!p.every(valid))continue;
    result.push({a:p[0],b:p[1],c:p[2],n,ids,index:i/3});
  }
  return entry.triangles=result;
}
function flatPlanes(value){if(!value)return[];const flat=Array.from(value).flat(3);return flat.length%4===0&&flat.every(Number.isFinite)?Array.from({length:flat.length/4},(_,k)=>flat.slice(k*4,k*4+4)):[];}
function visibleAt(instance,p,eye){
  const includes=flatPlanes(instance.portalClipPlanes),excludes=flatPlanes(instance.portalExcludePlanes);
  if(includes.some(q=>dot(q.slice(0,3),p)+q[3]<-.00001))return false;
  for(let k=0;k<excludes.length;k+=5)if(excludes.slice(k,k+5).every(q=>dot(q.slice(0,3),p)+q[3]>=-.00001))return false;
  const q=instance.exteriorClipPlane;
  if(q?.length===4&&Math.hypot(q[0],q[1],q[2])>.5){
    if(dot(q.slice(0,3),p)+q[3]<-.001)return false;
    const portal=instance.exteriorPortal;
    if(portal){const axis=portal[0]>.5?0:2,other=axis===0?2:0,ray=sub(p,eye),den=ray[axis];if(Math.abs(den)<1e-5)return false;
      const t=(portal[1]-eye[axis])/den,crossing=add(eye,ray,t);
      if(t<=0||t>=1.001||crossing[other]<portal[2]||crossing[other]>portal[3]||crossing[1]<portal[4]||crossing[1]>portal[5])return false;
    }
  }
  return true;
}
function deforming(mesh,primitive,instance){return!!(mesh.characterAsset||instance.character||primitive.characterMorphCount
  ||primitive.sourceSurroundingsPressure===true||Number(mesh.extras?.vegetationWind?.amplitudeM)>0
  ||instance.apparitionVariant||instance.portraitIndex||instance.paperIndex!=null||primitive.nativeReceiverDeforming===true);}
function prepare(instances,catalog,eligible){const entries=[];
  for(const instance of instances||[]){if(instance?.visible===false||instance?.hidden===true)continue;
    const mesh=catalog instanceof Map?catalog.get(instance.mesh):catalog?.[instance.mesh];if(!mesh)continue;
    const m=model(instance,mesh),inverse=m&&inverseFrame(m);if(!m||!inverse)continue;
    for(let index=0;index<(mesh.primitives?.length||0);index++){
      const primitive=mesh.primitives[index],bounds=localBounds(primitive);if(!bounds)continue;
      entries.push({instance,mesh,primitive,primitiveIndex:index,model:m,inverse,bounds:worldBounds(bounds,m),
        eligible:eligible(mesh,primitive,instance)&&!deforming(mesh,primitive,instance),deforming:deforming(mesh,primitive,instance)});
    }
  }
  return entries;
}
function firstHit(entries,eye,ray,maxDistance){let best=null;
  for(const entry of entries){const near=boxHit(eye,ray,entry.bounds);if(near>maxDistance||near>(best?.distance??Infinity)+EPS)continue;
    if(!entry.primitive.nativeReceiverGeometry){if(near>=0&&(!best||near<best.distance))best={distance:near,point:add(eye,ray,near),entry,conservative:true};continue;}
    for(const triangle of triangles(entry)){const hit=triangleHit(eye,ray,triangle);if(!hit||hit.distance>maxDistance||!visibleAt(entry.instance,hit.point,eye))continue;
      if(best&&(hit.distance>best.distance+EPS||Math.abs(hit.distance-best.distance)<=EPS&&(entry.eligible||!best.entry.eligible)))continue;
      best={...hit,entry};}
  }
  return best;
}
const pointKey=p=>p.map(v=>Math.round(v/1e-5)).join(',');
const edgeKey=(a,b)=>{const x=pointKey(a),y=pointKey(b);return x<y?x+'|'+y:y+'|'+x;};
const project=(p,origin,right,up)=>{const d=sub(p,origin);return[dot(d,right),dot(d,up)];};
function uvFrame(hit,right,up){
  const t=hit.triangle,g=hit.entry.primitive.nativeReceiverGeometry,p=[t.a,t.b,t.c].map(v=>project(v,hit.point,right,up)),uv=t.ids.map(id=>Array.from(g.uvs.slice(id*2,id*2+2)));
  const x1=p[1][0]-p[0][0],y1=p[1][1]-p[0][1],x2=p[2][0]-p[0][0],y2=p[2][1]-p[0][1],det=x1*y2-y1*x2;if(Math.abs(det)<1e-12)return null;
  const du=[0,1].map(k=>((uv[1][k]-uv[0][k])*y2-(uv[2][k]-uv[0][k])*y1)/det);
  const dv=[0,1].map(k=>(x1*(uv[2][k]-uv[0][k])-x2*(uv[1][k]-uv[0][k]))/det);
  const origin=[0,1].map(k=>uv[0][k]-du[k]*p[0][0]-dv[k]*p[0][1]);
  return{origin,right:du,up:dv};
}
function planarComponent(hit,normal,right,up,uv){
  const entry=hit.entry,g=entry.primitive.nativeReceiverGeometry,candidates=[],byEdge=new Map();
  for(const t of triangles(entry)){
    if(dot(t.n,hit.triangle.n)<NORMAL_DOT||[t.a,t.b,t.c].some(p=>Math.abs(dot(sub(p,hit.point),normal))>PLANE_EPS))continue;
    // A smooth cylinder's individual triangles are flat too. Its interpolated
    // vertex normals reveal that this is not the wall plane we are promising.
    if(t.ids.some(id=>{const n=entry.inverse.normal(Array.from(g.normals.slice(id*3,id*3+3)));return !n||Math.abs(dot(n,normal))<.995;}))continue;
    const p=[t.a,t.b,t.c].map(v=>project(v,hit.point,right,up));
    if(t.ids.some((id,j)=>[0,1].some(k=>Math.abs(g.uvs[id*2+k]-uv.origin[k]-uv.right[k]*p[j][0]-uv.up[k]*p[j][1])>2e-4)))continue;
    const row={...t,p,edges:[[t.a,t.b],[t.b,t.c],[t.c,t.a]]},index=candidates.length;candidates.push(row);
    for(const edge of row.edges){const key=edgeKey(...edge);if(!byEdge.has(key))byEdge.set(key,[]);byEdge.get(key).push(index);}
  }
  const seed=candidates.findIndex(t=>t.index===hit.triangle.index);if(seed<0)return null;
  const seen=new Set([seed]),queue=[seed];
  for(let cursor=0;cursor<queue.length;cursor++)for(const edge of candidates[queue[cursor]].edges)for(const peer of byEdge.get(edgeKey(...edge))||[])if(!seen.has(peer)){seen.add(peer);queue.push(peer);}
  const component=queue.map(i=>candidates[i]),edges=new Map();
  for(const t of component)for(const edge of t.edges){const key=edgeKey(...edge);if(!edges.has(key))edges.set(key,{edge,count:0});edges.get(key).count++;}
  if([...edges.values()].some(e=>e.count>2))return null;
  return{triangles:component,boundaries:[...edges.values()].filter(e=>e.count===1).map(e=>e.edge.map(p=>project(p,hit.point,right,up)))};
}
function contains(t,p){const a=t[0],b=t[1],c=t[2],cross2=(u,v,w)=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
  const x=cross2(a,b,p),y=cross2(b,c,p),z=cross2(c,a,p);return x>=-1e-7&&y>=-1e-7&&z>=-1e-7||x<=1e-7&&y<=1e-7&&z<=1e-7;}
function edgeInsideRect(edge,cx,cy,w,h){
  let lo=0,hi=1;const a=[edge[0][0]-cx,edge[0][1]-cy],d=[edge[1][0]-edge[0][0],edge[1][1]-edge[0][1]],half=[w/2-1e-5,h/2-1e-5];
  for(let k=0;k<2;k++){
    if(Math.abs(d[k])<1e-10){if(Math.abs(a[k])>=half[k])return false;continue;}
    let x=(-half[k]-a[k])/d[k],y=(half[k]-a[k])/d[k];if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>=hi)return false;
  }return lo<hi;
}
function supportedRect(component,cx,cy,w,h,instance,eye,origin,right,up){
  if(component.boundaries.some(edge=>edgeInsideRect(edge,cx,cy,w,h)))return false;
  for(let x=0;x<=4;x++)for(let y=0;y<=4;y++){
    const p=[cx+(x/4-.5)*w,cy+(y/4-.5)*h];
    if(!component.triangles.some(t=>contains(t.p,p))||!visibleAt(instance,add(add(origin,right,p[0]),up,p[1]),eye))return false;
  }
  // Include cones are convex, so the grid's four corners prove the whole
  // patch. An excluded portal could hide wholly between samples; reject any
  // excluded volume whose plane section intersects the patch's interior.
  const exclusions=flatPlanes(instance.portalExcludePlanes);
  for(let k=0;k<exclusions.length;k+=5){let polygon=[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
    for(const plane of exclusions.slice(k,k+5)){
      const a=dot(plane.slice(0,3),right),b=dot(plane.slice(0,3),up),c=dot(plane.slice(0,3),origin)+plane[3],next=[];
      for(let j=0;j<polygon.length;j++){const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=a*p[0]+b*p[1]+c,dq=a*q[0]+b*q[1]+c;
        if(dp>=-1e-5)next.push(p);if((dp<0)!==(dq<0)){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
      polygon=next;if(!polygon.length)break;
    }
    if(polygon.length>=3)return false;
  }
  return true;
}
function fitCentre(instance,origin,right,up,cx,cy,w,h,min,max){
  const planes=flatPlanes(instance.portalClipPlanes),exterior=instance.exteriorClipPlane;
  if(exterior?.length===4&&Math.hypot(exterior[0],exterior[1],exterior[2])>.5)planes.push(Array.from(exterior));
  // A cone may crop the left edge of an otherwise ample wall. Project the
  // rectangle centre into its valid half-spaces rather than forever shrinking
  // around the original hit. Every corner is still tested against real support.
  for(let iteration=0;iteration<12;iteration++)for(const p of planes){
    const a=dot(p.slice(0,3),right),b=dot(p.slice(0,3),up),c=dot(p.slice(0,3),origin)+p[3],den=a*a+b*b;
    const required=Math.abs(a)*w/2+Math.abs(b)*h/2+.00002,deficit=required-a*cx-b*cy-c;
    if(deficit>0&&den>1e-12){cx+=a*deficit/den;cy+=b*deficit/den;}
    cx=clamp(cx,min[0]+w/2,max[0]-w/2);cy=clamp(cy,min[1]+h/2,max[1]-h/2);
  }
  return{cx,cy};
}
function receiverFrom(hit,eye,width,height){
  const {entry}=hit;if(hit.conservative)return{reason:'conservative-protected-bounds'};
  if(!entry.eligible)return{reason:entry.deforming?'deforming-host':'protected-material'};
  let normal=[...hit.triangle.n];if(dot(normal,sub(eye,hit.point))<0)normal=normal.map(v=>-v);
  if(Math.abs(normal[1])>.35)return{reason:'not-a-wall'};
  const up=unit(sub([0,1,0],normal.map(v=>v*normal[1]))),right=unit(cross(up,normal));
  const uv=uvFrame(hit,right,up);if(!uv)return{reason:'invalid-uv-plane'};
  const component=planarComponent(hit,normal,right,up,uv);if(!component)return{reason:'curved-or-discontinuous-host'};
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
  for(const t of component.triangles)for(const p of t.p)for(let k=0;k<2;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  for(let k=0;k<2;k++){min[k]+=.02;max[k]-=.02;}
  const ratio=STILLNESS_ANATOMY.widthToHeight,desiredW=Math.min(width,height*ratio),desiredH=desiredW/ratio;
  let scale=Math.min(1,(max[0]-min[0])/desiredW,(max[1]-min[1])/desiredH),fit=null;
  for(let attempt=0;attempt<12&&scale>0;attempt++,scale*=.85){
    const w=desiredW*scale,h=desiredH*scale;if(w<.35-EPS||h<.50-EPS)break;
    const {cx,cy}=fitCentre(entry.instance,hit.point,right,up,clamp(0,min[0]+w/2,max[0]-w/2),clamp(-.10,min[1]+h/2,max[1]-h/2),w,h,min,max);
    if(supportedRect(component,cx,cy,w,h,entry.instance,eye,hit.point,right,up)){fit={w,h,cx,cy};break;}
  }
  if(!fit)return{reason:'no-continuous-human-patch'};
  const origin=add(add(hit.point,right,fit.cx),up,fit.cy),uvOrigin=uv.origin.map((v,k)=>v+uv.right[k]*fit.cx+uv.up[k]*fit.cy);
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>add(add(origin,right,x*fit.w/2),up,y*fit.h/2));
  const instanceId=entry.instance.id??null,meshName=entry.mesh.name||entry.instance.mesh;
  return{supported:true,id:`stillness-native:${instanceId||entry.instance.mesh}:${entry.primitiveIndex}:${hit.triangle.index}`,
    origin,right,up,normal,widthM:fit.w,heightM:fit.h,depthM:.20,distanceM:hit.distance,
    nativeMesh:entry.instance.mesh,nativePrimitiveIndex:entry.primitiveIndex,donorName:entry.instance.mesh,
    donorPrimitiveIndex:entry.primitiveIndex,donorMaterial:true,materialId:entry.primitive.materialName||entry.primitive.materialRole||null,
    sourceMaterial:entry.primitive.materialName||null,space:'native',uvOrigin,uvRight:uv.right,uvUp:uv.up,
    host:{min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k]))),
      instanceId,mesh:meshName,primitiveIndex:entry.primitiveIndex,triangleIndex:hit.triangle.index,
      componentTriangleIndex:component.triangles.reduce((least,t)=>Math.min(least,t.index),Infinity),triangleCount:component.triangles.length},
    attachment:{instanceId,mesh:entry.instance.mesh,primitiveIndex:entry.primitiveIndex,
      localOrigin:entry.inverse.point(origin),localRight:entry.inverse.direction(right),localUp:entry.inverse.direction(up),
      modelMatrixAtResolve:[...entry.model],nodeMatrix:entry.mesh.nodeMatrix||identity()}};
}

// Read-only visibility query against the SAME retained native triangles and
// instance * node transforms. All materials participate, including glazing;
// this is geometric obstruction, not a claim about optical transmission.
// A caller may ignore the target's exact instance ID, never its material or
// the surrounding room. The final 2cm belong to the target, not an occluder.
// Eye/target accept world-metre [x,y,z] vectors or {x,y,z}. Missing geometry
// fails closed; bounds-only primitives are explicitly conservative. Callers
// own throttling and lifecycle gates; this function never starts an event.
export function nativeSegmentObstruction({eye,target,instances,catalog,ignoreIds=[]}={}){
  const invalid=(reason,instance,primitiveIndex)=>({blocked:true,hit:null,reason,
    ...(instance?{unresolved:{id:instance.id??null,mesh:instance.mesh??null,
      ...(Number.isInteger(primitiveIndex)?{primitiveIndex}:{})}}:{})});
  const from=vec(eye),to=vec(target);
  if(!valid(from)||!valid(to))return invalid('invalid-segment');
  if(!Array.isArray(instances)||!catalog||typeof catalog!=='object')return invalid('native-geometry-unavailable');
  if(!Array.isArray(ignoreIds)||ignoreIds.some(id=>typeof id!=='string'))return invalid('invalid-ignore-ids');
  const offset=sub(to,from),length=Math.hypot(...offset);
  if(!Number.isFinite(length)||length<1e-8)return invalid('invalid-segment');
  const ignored=new Set(ignoreIds),visible=[],queryCatalog=new Map();
  const checkedBounds=b=>{const min=vec(b?.min),max=vec(b?.max);return valid(min)&&valid(max)&&min.every((v,k)=>v<=max[k])?{min,max}:null;};
  for(const instance of instances){
    if(!instance||typeof instance!=='object')return invalid('invalid-instance');
    if(instance.visible===false||instance.hidden===true||ignored.has(instance.id))continue;
    const mesh=catalog instanceof Map?catalog.get(instance.mesh):catalog[instance.mesh];
    if(!mesh||!Array.isArray(mesh.primitives))return invalid('native-mesh-unavailable',instance);
    if(['x','y','z','yaw','scale','scaleX','scaleY','scaleZ'].some(k=>instance[k]!=null&&!Number.isFinite(instance[k])))return invalid('invalid-instance-transform',instance);
    const m=model(instance,mesh);if(!m||!inverseFrame(m))return invalid('invalid-instance-transform',instance);
    if(!queryCatalog.has(instance.mesh)){
      const cull=mesh.cullBoundsValid===false?null:checkedBounds(mesh.cullBounds),fallback=cull||checkedBounds(mesh.extras?.bounds);
      const primitives=[];
      for(let index=0;index<mesh.primitives.length;index++){
        const primitive=mesh.primitives[index],bounds=primitive&&localBounds(primitive),g=primitive?.nativeReceiverGeometry;
        const completeTriangles=!g||(g.positions?.length>=9&&g.positions.length%3===0&&g.indices?.length>=3&&g.indices.length%3===0);
        if(bounds&&completeTriangles){primitives.push(primitive);continue;}
        // Procedural native meshes may retain only a whole-mesh cull bound.
        // Keep that actual bound as an explicit conservative query primitive;
        // firstHit's segment/AABB broad phase can then dismiss distant props.
        // Never fabricate bounds or mutate the renderer's native catalog.
        if(!fallback)return invalid('native-geometry-unavailable',instance,index);
        primitives.push({...primitive,nativeReceiverGeometry:null,nativeReceiverBounds:fallback,
          nativeSegmentBoundsSource:cull?'mesh.cullBounds':'mesh.extras.bounds'});
      }
      queryCatalog.set(instance.mesh,{...mesh,primitives});
    }
    visible.push(instance);
  }
  const entries=prepare(visible,queryCatalog,()=>false);
  const ray=offset.map(v=>v/length),targetLimit=length-.02,skin=.00002,rayStart=add(from,ray,-skin);
  for(const entry of entries){
    const g=entry.primitive.nativeReceiverGeometry;
    if(!g||boxHit(rayStart,ray,entry.bounds)>targetLimit+skin)continue;
    // Native opaque GLBs can omit TEXCOORD_0: P3 uploads a zero UV buffer in
    // that case. UVs do not determine geometric occlusion, so mirror that
    // default locally and keep the real triangles/openings. Do not turn a
    // whole room into a conservative box merely because its walls have no UVs.
    // A truncated supplied buffer or incomplete normals remain conservative.
    if(!g.normals||g.normals.length<g.positions.length||(g.uvs!=null&&g.uvs.length<g.positions.length/3*2))entry.primitive={...entry.primitive,nativeReceiverGeometry:null};
    else if(g.uvs==null)entry.primitive={...entry.primitive,nativeReceiverGeometry:{...g,uvs:new Float32Array(g.positions.length/3*2)}};
  }
  if(targetLimit<=0)return{blocked:false,hit:null};
  // triangleHit skips an origin contact for receiver acquisition. Back the
  // visibility ray up by 20 micrometres so an eye on/in a wall is not cleared
  // merely because its first native face is effectively at distance zero.
  const hit=firstHit(entries,rayStart,ray,targetLimit+skin);
  const distance=hit?Math.max(0,hit.distance-skin):Infinity;
  if(!hit||distance>=targetLimit-EPS)return{blocked:false,hit:null};
  return{blocked:true,hit:{id:hit.entry.instance.id??null,mesh:hit.entry.instance.mesh,
    distance,conservative:hit.conservative===true,
    ...(hit.entry.primitive.nativeSegmentBoundsSource?{primitiveIndex:hit.entry.primitiveIndex,boundsSource:hit.entry.primitive.nativeSegmentBoundsSource}:{})}};
}

export function resolveNativeStillnessReceivers({camera,instances=[],catalog,maxDistance=5,width=1.4,height=1.9,eligible=stillnessSurfaceEligible}={}){
  const eye=vec(camera?.eye);if(!valid(eye)||typeof eligible!=='function')return{receivers:[],rejected:[{reason:'invalid-camera'}]};
  const entries=prepare(instances,catalog,eligible),receivers=[],rejected=[],seen=new Map();
  const range=clamp(finite(maxDistance,5),.05,20),w=clamp(finite(width,1.4),.01,1.4),h=clamp(finite(height,1.9),.01,1.9);
  for(const ray of[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
    const hit=firstHit(entries,eye,ray,range);if(!hit){rejected.push({reason:'no-native-hit',direction:ray});continue;}
    const result=receiverFrom(hit,eye,w,h);
    if(result.supported){
      const owner=result.attachment.instanceId??result.attachment.modelMatrixAtResolve.join(',');
      const key=`${owner}:${result.nativeMesh}:${result.nativePrimitiveIndex}:${result.host.componentTriangleIndex}`;
      if(!seen.has(key)){seen.set(key,receivers.length);receivers.push(result);}
      else{const index=seen.get(key);if(result.distanceM<receivers[index].distanceM)receivers[index]=result;}
    }
    else rejected.push({...result,direction:ray,nativeMesh:hit.entry.instance.mesh,nativePrimitiveIndex:hit.entry.primitiveIndex,distanceM:hit.distance});
  }
  receivers.sort((a,b)=>a.distanceM-b.distanceM);return{receivers,rejected};
}

// Follow a rigid instance's CURRENT pose without another spatial query. Local
// tangents are mesh-local units per one world metre at acquisition, so a later
// affine transform carries the same physical attachment rather than relatching
// from the camera. A missing/replaced ID or degenerate transform releases it.
export function attachedNativeStillnessReceiver(receiver,{instance,mesh}={}){
  const a=receiver?.attachment;if(!a||!instance||!mesh||instance.id!==a.instanceId||instance.mesh!==a.mesh)return null;
  const m=model(instance,mesh);if(!m||!inverseFrame(m))return null;
  const r=direction(m,a.localRight),u=direction(m,a.localUp),rw=Math.hypot(...r),uh=Math.hypot(...u),normal=unit(cross(r,u));
  // Only rigid pose changes are supported after acquisition. A pressure warp
  // or new scale needs a fresh validated host, not a stretched anatomical patch.
  if(!normal||Math.abs(rw-1)>.001||Math.abs(uh-1)>.001||Math.abs(dot(r,u))>.001)return null;
  const origin=point(m,a.localOrigin),right=r.map(v=>v/rw),up=u.map(v=>v/uh),corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>add(add(origin,right,x*receiver.widthM/2),up,y*receiver.heightM/2));
  return{...receiver,origin,right,up,normal,host:{...receiver.host,
    min:[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])))}};
}
