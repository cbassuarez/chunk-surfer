// Exterior skins have physical projections beyond their logical rock. Resolve
// the body's continuous world position against those exact placed surfaces.
import {EXTERIOR_COLLISION_GEOMETRY} from '../data/generated/exterior-collision.js';

export const EXTERIOR_FACADE_MESHES=Object.freeze(Object.keys(EXTERIOR_COLLISION_GEOMETRY));
const EPS=1e-7,BUCKET=4;
const indexes=new Map(),placementCache=new Map();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function pointDistanceSq(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz,t=n?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/n,0,1):0;
  return(p.x-a.x-dx*t)**2+(p.z-a.z-dz*t)**2;
}
function intersects(a,b,c,d){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD>EPS||cdA*cdB>EPS)return false;
  return Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+EPS
    &&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))+EPS;
}
function segmentDistanceSq(a,b,c,d){
  return intersects(a,b,c,d)?0:Math.min(pointDistanceSq(a,c,d),pointDistanceSq(b,c,d),pointDistanceSq(c,a,b),pointDistanceSq(d,a,b));
}
function geometryIndex(mesh){
  if(indexes.has(mesh))return indexes.get(mesh);
  const geometry=EXTERIOR_COLLISION_GEOMETRY[mesh],shapes=[];
  for(const wall of geometry.walls)shapes.push({kind:'wall',data:wall,minX:Math.min(wall[0],wall[2]),maxX:Math.max(wall[0],wall[2]),minZ:Math.min(wall[1],wall[3]),maxZ:Math.max(wall[1],wall[3]),minY:wall[4],maxY:wall[5]});
  for(const triangle of geometry.triangles){
    const xs=[triangle[0],triangle[3],triangle[6]],zs=[triangle[2],triangle[5],triangle[8]],ys=[triangle[1],triangle[4],triangle[7]];
    shapes.push({kind:'triangle',data:triangle,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),minY:Math.min(...ys),maxY:Math.max(...ys)});
  }
  const buckets=new Map();
  for(const shape of shapes)for(let x=Math.floor(shape.minX/BUCKET);x<=Math.floor(shape.maxX/BUCKET);x++)for(let z=Math.floor(shape.minZ/BUCKET);z<=Math.floor(shape.maxZ/BUCKET);z++){
    const key=`${x},${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(shape);
  }
  const index={buckets};indexes.set(mesh,index);return index;
}
function placement(instance){
  const scale=Number(instance.scale)||1,sx=scale*(instance.scaleX??1),sy=scale*(instance.scaleY??1),sz=scale*(instance.scaleZ??1);
  if(![sx,sy,sz].every(n=>Number.isFinite(n)&&n>0))return null;
  const key=[instance.id,instance.mesh,instance.x,instance.y||0,instance.z,instance.yaw||0,sx,sy,sz].join('|');
  if(placementCache.has(key))return placementCache.get(key);
  const c=Math.cos(instance.yaw||0),s=Math.sin(instance.yaw||0),x=instance.x,z=instance.z,y=instance.y||0;
  if(![x,z,y].every(Number.isFinite))return null;
  const result={index:geometryIndex(instance.mesh),sy,sx,sz,y,
    local:p=>({x:((p.x-x)*c+(p.z-z)*s)/sx,z:(-(p.x-x)*s+(p.z-z)*c)/sz}),
    world:p=>({x:x+p.x*sx*c-p.z*sz*s,z:z+p.x*sx*s+p.z*sz*c})};
  // Placements are a tiny fixed catalog; cap diagnostic/test churn explicitly.
  if(placementCache.size>128)placementCache.clear();placementCache.set(key,result);return result;
}
function clipHeight(vertices,bound,above){
  const out=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],inside=p=>above?p.y>=bound-EPS:p.y<=bound+EPS,ia=inside(a),ib=inside(b);
    if(ia)out.push(a);
    if(ia!==ib){const t=(bound-a.y)/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*t,y:bound,z:a.z+(b.z-a.z)*t});}
  }
  return out;
}
function surfaceSegment(shape,lo,hi){
  if(shape.maxY<=lo+EPS||shape.minY>=hi-EPS)return null;
  const d=shape.data;
  if(shape.kind==='wall')return[{x:d[0],z:d[1]},{x:d[2],z:d[3]}];
  let polygon=[0,3,6].map(i=>({x:d[i],y:d[i+1],z:d[i+2]}));
  polygon=clipHeight(clipHeight(polygon,lo,true),hi,false);if(polygon.length<2)return null;
  let pair=null,distance=-1;
  for(const a of polygon)for(const b of polygon){const sq=(a.x-b.x)**2+(a.z-b.z)**2;if(sq>distance){distance=sq;pair=[a,b];}}
  return pair;
}
function query(from,to,instances,{radius=.20,height=1.7,stepUp=.45}={}){
  if(!from||!to||![from.x,from.z,to.x,to.z,from.feet??0,to.feet??0,radius,height].every(Number.isFinite))return{ok:false,hit:{reason:'invalid exterior body'}};
  radius=Math.max(0,radius);height=Math.max(.01,height);
  for(const instance of instances||[]){
    if(!EXTERIOR_COLLISION_GEOMETRY[instance.mesh])continue;
    const pose=placement(instance);if(!pose)continue;
    const a=pose.local(from),b=pose.local(to),pad=radius/Math.min(pose.sx,pose.sz);
    const minX=Math.min(a.x,b.x)-pad,maxX=Math.max(a.x,b.x)+pad,minZ=Math.min(a.z,b.z)-pad,maxZ=Math.max(a.z,b.z)+pad;
    const lo=(Math.min(from.feet??0,to.feet??0)+Math.min(stepUp,height*.9)-pose.y)/pose.sy;
    const hi=(Math.max(from.feet??0,to.feet??0)+height-pose.y)/pose.sy,seen=new Set();
    for(let x=Math.floor(minX/BUCKET);x<=Math.floor(maxX/BUCKET);x++)for(let z=Math.floor(minZ/BUCKET);z<=Math.floor(maxZ/BUCKET);z++)for(const shape of pose.index.buckets.get(`${x},${z}`)||[]){
      if(seen.has(shape))continue;seen.add(shape);
      if(shape.maxX<minX||shape.minX>maxX||shape.maxZ<minZ||shape.minZ>maxZ)continue;
      const segment=surfaceSegment(shape,lo,hi);if(!segment)continue;
      const [c,d]=segment.map(pose.world);
      if(segmentDistanceSq(from,to,c,d)>radius*radius+EPS)continue;
      // A stale save may already overlap a thin projection. Let a player move
      // out on the same side, without using overlap to cross through the wall.
      const before=pointDistanceSq(from,c,d),after=pointDistanceSq(to,c,d);
      if(before<radius*radius-EPS&&after>before+EPS&&cross(c,d,from)*cross(c,d,to)>=0)continue;
      return{ok:false,hit:{id:instance.id,mesh:instance.mesh,reason:'exterior facade',segment:[c,d],height:[shape.minY*pose.sy+pose.y,shape.maxY*pose.sy+pose.y]}};
    }
  }
  return{ok:true};
}

export function exteriorFacadeCanOccupy(body,instances,options={}){
  return query(body,body,instances,{...options,height:body?.height??options.height,radius:body?.radius??options.radius});
}
export function exteriorFacadeCanStep({from,to,height=1.7,radius=.20,stepUp=.45},instances){
  return query(from,to,instances,{height,radius,stepUp});
}
