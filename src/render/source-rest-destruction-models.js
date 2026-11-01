import {sourceRestNoteGeometryLibrary} from './source-rest-note-models.js';
import {sourceRestBodyGeometryLibrary} from './source-rest-body-models.js';

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

export function sourceRestDestructionGeometryLibrary(){return {...descriptors,...sourceRestBodyGeometryLibrary()};}
export function sourceRestDestructionFragments(name){return families[name]||[];}

