import {sourceRestNoteGeometryLibrary} from './source-rest-note-models.js';
import {sourceRestBodyGeometryLibrary} from './source-rest-body-models.js';
import {sourceRestGeometryLibrary} from './source-rest-models.js';
import {sourceRestPlaceStudy} from '../game/source-rest-place.js';
import {SOURCE_REST_MISTAKE_STRUCTURE} from '../game/source-rest-affliction.js';

const box=(x0,x1,y0,y1,z0,z1)=>({p:[x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1],i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
const join=pieces=>{const p=[],i=[];for(const piece of pieces){const offset=p.length/3;p.push(...piece.p);i.push(...piece.i.map(n=>n+offset));}return{p,i};};
const bounds=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let n=0;n<p.length;n++){
  const axis=n%3;min[axis]=Math.min(min[axis],p[n]);max[axis]=Math.max(max[axis],p[n]);
}return{min,max,center:min.map((v,n)=>(v+max[n])/2)};};

// The original meshes were assembled from individual masonry blocks/treads.
// Preserve those exact triangles, not a second approximate broken silhouette.
function components(geometry){
  const parent=Array.from({length:geometry.p.length/3},(_,i)=>i),find=n=>{while(parent[n]!==n){parent[n]=parent[parent[n]];n=parent[n];}return n;};
  const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(let n=0;n<geometry.i.length;n+=3){union(geometry.i[n],geometry.i[n+1]);union(geometry.i[n],geometry.i[n+2]);}
  const groups=new Map();for(let n=0;n<geometry.i.length;n+=3){const root=find(geometry.i[n]);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(...geometry.i.slice(n,n+3));}
  return[...groups.values()].map(indices=>{
    const remap=new Map(),p=[],i=[];for(const old of indices){if(!remap.has(old)){remap.set(old,p.length/3);p.push(...geometry.p.slice(old*3,old*3+3));}i.push(remap.get(old));}
    return{p,i,center:bounds(p).center};
  });
}

const descriptors={},families={};
function registerFragments(name,geometry,limit=Infinity){
  const source=components(geometry).sort((a,b)=>a.center[1]-b.center[1]||a.center[2]-b.center[2]),count=Math.min(limit,source.length),groups=Array.from({length:count},()=>[]);
  for(let n=0;n<source.length;n++)groups[Math.min(count-1,Math.floor(n*count/source.length))].push(source[n]);
  families[name]=groups.map((pieces,index)=>{
    const original=join(pieces),center=bounds(original.p).center,id=`rest-break-${name}-${index}`,
      p=original.p.map((v,n)=>v-center[n%3]);
    descriptors[id]={p,i:original.i,material:geometry.material||'linen',base:geometry.base||[.66,.64,.53,1],roughness:1};
    return Object.freeze({mesh:'source-continuation-'+id,center:Object.freeze(center),index,triangles:original.i.length/3});
  });
}
const originals=sourceRestNoteGeometryLibrary();
for(const[name,limit]of [['oculus',Infinity],['grand-return',6],['vault',4],['window',4],['stair',4],['return',4],['landing',4],['bridge',4]])registerFragments(name,originals['rest-note-'+name],limit);
registerFragments('board',{...join([box(-.5,.5,0,.32,-.5,.5),box(-.5,.5,.32,.66,-.5,.5),box(-.5,.5,.66,1,-.5,.5)]),material:'wood',base:[.48,.36,.24,1]},3);

// Clip the original convex bevelled oak, including closed cut faces. The
// unbroken sections reconstruct its actual outer triangles/volume rather
// than exchanging a rounded post for a stack of unrelated cubes.
const oak=sourceRestGeometryLibrary()['rest-oak'];
const dot=(a,b)=>a.reduce((sum,n,k)=>sum+n*b[k],0),sub=(a,b)=>a.map((n,k)=>n-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const plane=(height,index)=>({normal:[-.045*Math.sin(index*1.7),1,-.045*Math.cos(index*1.3)],height});
const cuts=[0,.18,.29,.40,.52,.64,.76,.88,1].map((height,index)=>index===0||index===8?{normal:[0,1,0],height}:plane(height,index));
function clipped(geometry,cut,keepAbove){
  const polygons=[],intersections=[],epsilon=1e-8,sign=keepAbove?1:-1;
  for(let n=0;n<geometry.i.length;n+=3){
    const source=geometry.i.slice(n,n+3).map(i=>geometry.p.slice(i*3,i*3+3)),out=[];
    for(let k=0;k<source.length;k++){
      const a=source[k],b=source[(k+1)%source.length],da=sign*(dot(a,cut.normal)-cut.height),db=sign*(dot(b,cut.normal)-cut.height);
      if(da>=-epsilon)out.push(a);
      if((da>epsilon&&db< -epsilon)||(da< -epsilon&&db>epsilon)){
        const t=da/(da-db),p=a.map((v,k)=>v+(b[k]-v)*t);out.push(p);intersections.push(p);
      }
    }
    if(out.length>=3)polygons.push(out);
  }
  const unique=intersections.filter((p,index)=>intersections.findIndex(q=>Math.hypot(...sub(p,q))<epsilon)===index);
  if(unique.length>=3){
    const centre=[0,1,2].map(k=>unique.reduce((sum,p)=>sum+p[k],0)/unique.length),normal=unit(cut.normal.map(n=>n*-sign)),
      x=unit(cross(normal,Math.abs(normal[0])<.8?[1,0,0]:[0,0,1])),y=cross(normal,x);
    unique.sort((a,b)=>Math.atan2(dot(sub(a,centre),y),dot(sub(a,centre),x))-Math.atan2(dot(sub(b,centre),y),dot(sub(b,centre),x)));
    polygons.push(unique);
  }
  const p=[],i=[];
  for(const polygon of polygons){const start=p.length/3;p.push(...polygon.flat());for(let k=1;k<polygon.length-1;k++)i.push(start,start+k,start+k+1);}
  return{...geometry,p,i};
}
families.post=[];
for(let index=0;index<cuts.length-1;index++){
  const geometry=clipped(clipped(oak,cuts[index],true),cuts[index+1],false),extent=bounds(geometry.p),center=extent.center,id=`rest-break-post-${index}`;
  descriptors[id]={...geometry,p:geometry.p.map((n,k)=>n-center[k%3])};
  families.post.push(Object.freeze({mesh:'source-continuation-'+id,center:Object.freeze(center),halfExtents:Object.freeze(extent.min.map((n,k)=>(extent.max[k]-n)/2)),index,triangles:geometry.i.length/3}));
}
// Broad, dark torn joints remain visible through the final dither; they are
// fitted to the post's own sides, not pasted across the player's screen.
for(let index=1;index<cuts.length-1;index++){
  const cut=cuts[index],p=[],i=[];
  for(const side of[-1,1])for(const axis of[0,2]){
    const other=axis===0?2:0,start=p.length/3;
    for(const [along,width] of[[-.46,-.0035],[.46,-.0035],[.46,.0035],[-.46,.0035]]){
      const v=[0,0,0];v[axis]=side*.501;v[other]=along;v[1]=cut.height-dot(v,cut.normal)+width;p.push(...v);
    }i.push(start,start+1,start+2,start,start+2,start+3);
  }
  descriptors[`rest-break-post-crack-${index}`]={p,i,material:'wood',base:[.075,.045,.025,1],roughness:1};
}
descriptors['rest-break-splinter']={p:[-.5,0,-.2,.5,0,-.2,.14,1,.03,-.28,.23,.22],i:[0,2,1,0,1,3,1,2,3,2,0,3],material:'wood',base:[.58,.40,.22,1],roughness:1};

const postSpecs=sourceRestPlaceStudy().parts.filter(p=>p.mesh.endsWith('rest-oak')&&/window-reveal--?1$/.test(p.id)).sort((a,b)=>a.z-b.z)
  .concat(sourceRestPlaceStudy().parts.filter(p=>p.mesh.endsWith('rest-oak')&&/loggia-post--?1$/.test(p.id)).sort((a,b)=>a.z-b.z)).slice(0,SOURCE_REST_MISTAKE_STRUCTURE.carriers);
const hash=value=>{let n=2166136261;for(const ch of String(value))n=Math.imul(n^ch.charCodeAt(0),16777619);return(n>>>0)/4294967296;};
function turn([x,y,z],rx,ry,rz){
  [x,y]=[Math.cos(rz)*x-Math.sin(rz)*y,Math.sin(rz)*x+Math.cos(rz)*y];
  [x,z]=[Math.cos(ry)*x+Math.sin(ry)*z,-Math.sin(ry)*x+Math.cos(ry)*z];
  return[x,Math.cos(rx)*y-Math.sin(rx)*z,Math.sin(rx)*y+Math.cos(rx)*z];
}
for(let type=0;type<postSpecs.length;type++)for(let stage=1;stage<=7;stage++){
  const spec=postSpecs[type],remainder=[],rubble=[];
  for(const piece of families.post){
    const model=descriptors[piece.mesh.replace('source-continuation-','')];
    if(piece.index<8-stage){remainder.push({...model,p:model.p.map((n,k)=>n+piece.center[k%3])});continue;}
    const seed=hash(`source-continuation-${spec.id}:mistake-section:${piece.index}`),dimensions=[spec.sx,spec.sy,spec.sz],
      vertices=Array.from({length:model.p.length/3},(_,i)=>turn(model.p.slice(i*3,i*3+3).map((n,k)=>n*dimensions[k]),.12,seed*.35,Math.PI*.5)),
      axes=[[spec.sx,0,0],[0,spec.sy,0],[0,0,spec.sz]].map(axis=>turn(axis,.12,seed*.35,Math.PI*.5)),
      radius=axes.reduce((n,axis,k)=>n+Math.abs(axis[1])*piece.halfExtents[k],0),
      position=[piece.center[0]*spec.sx+.10,radius+.008,piece.center[2]*spec.sz+(seed-.5)*.16];
    rubble.push({...model,p:vertices.flatMap(v=>v.map((n,k)=>n+position[k]))});
  }
  descriptors[`rest-break-post-remainder-${stage}`]={...oak,...join(remainder)};
  descriptors[`rest-break-post-rubble-${type}-${stage}`]={...oak,...join(rubble)};
}
export function sourceRestDestructionPostBatch(id,stage){
  const type=postSpecs.findIndex(p=>String(id).endsWith(p.id));if(type<0||stage<1||stage>7)return null;
  return{remainder:`source-continuation-rest-break-post-remainder-${stage}`,rubble:`source-continuation-rest-break-post-rubble-${type}-${stage}`,
    canonicalId:'source-continuation-'+postSpecs[type].id};
}

export function sourceRestDestructionGeometryLibrary(){return {...descriptors,...sourceRestBodyGeometryLibrary()};}
export function sourceRestDestructionFragments(name){return families[name]||[];}

