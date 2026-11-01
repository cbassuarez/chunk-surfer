// Capture existing construction and find a supported clearance route. This
// planner cannot invent a corridor, floor, doorway or return destination.
import {CELL,F} from '../data/floorplan/legend.js';
import {FIRST_STRIKE,normalizeFirstStrikeEntry} from '../data/first-strike.js';
const HEADROOM=FIRST_STRIKE.bodyHeight,STEP_UP=FIRST_STRIKE.stepHeight,BODY_RADIUS=FIRST_STRIKE.bodyRadius;

const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const key=(x,z)=>`${x},${z}`;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function firstStrikeEntryFromCells({origin,yaw=0,pitch=0,region='ellery',eventId='',cells=[],plan=null,props=[],lights=[],source=null,canStand=null,canTraverse=null}={}){
  if(!origin||![origin.x,origin.y,origin.z].every(Number.isFinite))return null;
  const size=cells[0]?.cellSize||CELL,table=new Map();
  for(const cell of cells){
    if(!cell||![cell.x,cell.z,cell.floor,cell.ceil].every(Number.isFinite)||cell.walkable===false||cell.ceil-cell.floor<HEADROOM)continue;
    const ix=Math.round(cell.x/size-.5),iz=Math.round(cell.z/size-.5);
    table.set(key(ix,iz),{...cell,ix,iz,cellSize:size});
  }
  const nearest=[...table.values()].filter(c=>Math.abs(c.floor-origin.y)<=STEP_UP+.02)
    .sort((a,b)=>distance(a,origin)-distance(b,origin))[0];
  if(!nearest||distance(nearest,origin)>size*1.5)return null;
  for(let i=0;i<9;i++){
    const angle=i*Math.PI/4,x=origin.x+(i===8?0:Math.cos(angle)*BODY_RADIUS),z=origin.z+(i===8?0:Math.sin(angle)*BODY_RADIUS),
      cell=table.get(key(Math.floor(x/size),Math.floor(z/size)));
    if(!cell||Math.abs(cell.floor-origin.y)>STEP_UP+.001||cell.ceil-cell.floor<HEADROOM)return null;
  }
  if(canStand&&canStand(origin.x,origin.z,origin.y)===false)return null;
  const start=key(nearest.ix,nearest.iz),queue=[nearest],previous=new Map([[start,null]]),steps=new Map([[start,0]]);
  for(let at=0;at<queue.length;at++){
    const a=queue[at],id=key(a.ix,a.iz);
    for(const [dx,dz]of[[0,-1],[1,0],[0,1],[-1,0]]){
      const nextId=key(a.ix+dx,a.iz+dz),b=table.get(nextId);
      if(!b||previous.has(nextId)||Math.abs(b.floor-a.floor)>STEP_UP+.001||Math.min(a.ceil,b.ceil)-Math.max(a.floor,b.floor)<HEADROOM||canTraverse&&canTraverse(a,b)===false)continue;
      previous.set(nextId,id);steps.set(nextId,steps.get(id)+1);queue.push(b);
    }
  }
  const clearRadius=cell=>{
    let radius=size*.45;
    for(const r of[size*.8,size*1.4,size*2,size*2.8]){
      let fits=true;
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,x=cell.x+Math.cos(a)*r,z=cell.z+Math.sin(a)*r,
          hit=table.get(key(Math.round(x/size-.5),Math.round(z/size-.5)));
        if(!hit||Math.abs(hit.floor-cell.floor)>.15){fits=false;break;}
      }
      if(!fits)break;radius=r;
    }
    return radius;
  };
  const score=cell=>{
    const d=steps.get(key(cell.ix,cell.iz))*size,dx=cell.x-origin.x,dz=cell.z-origin.z,
      forward=Math.sin(yaw)*dx-Math.cos(yaw)*dz,clear=clearRadius(cell),door=!!(cell.flags&F.DOOR),sky=!!(cell.flags&F.SKY);
    return Math.min(d,18)*1.4-Math.max(0,d-24)*3+Math.min(clear,1.1)*5+(door?4:0)+(sky?3:0)+forward*.12;
  };
  const candidates=queue.filter(c=>steps.get(key(c.ix,c.iz))*size>=Math.min(5,Math.max(1,(queue.length**.5)*size*.4)));
  const goal=(candidates.length?candidates:queue).sort((a,b)=>score(b)-score(a))[0];
  if(!goal)return null;
  const route=[];let id=key(goal.ix,goal.iz);
  while(id){const c=table.get(id);route.push({x:c.x,z:c.z,floor:c.floor});id=previous.get(id);}
  route.reverse();
  const safeRadius=Math.max(.26,Math.min(1.1,clearRadius(goal)-.08));
  const safeEdge={x:goal.x,z:goal.z,feet:goal.floor,radius:safeRadius,kind:goal.flags&F.DOOR?'door':goal.flags&F.SKY?'edge':'shelter'};
  const second=queue.filter(c=>distance(c,goal)>4&&steps.get(key(c.ix,c.iz))*size>3&&clearRadius(c)>=.7)
    .sort((a,b)=>clearRadius(b)-clearRadius(a)||Math.abs(steps.get(key(a.ix,a.iz))*size-8)-Math.abs(steps.get(key(b.ix,b.iz))*size-8))[0];
  const shelter=second?{x:second.x,z:second.z,feet:second.floor,radius:Math.min(.9,clearRadius(second)-.08),kind:'shelter'}:null;
  const connected=queue.map(({ix,iz,...cell})=>cell),routeLength=Math.max(0,route.length-1)*size;
  return{schema:1,eventId,region,origin:{...origin},yaw,pitch,plan,props,lights,walkCells:connected,route,safeEdge,shelter,source,canStand,canTraverse,
    constructionMode:plan?'existing-plan':'existing-surfaces',
    routeEvidence:{cells:connected.length,routeLengthMetres:routeLength,minimumSecondsAtWalk:routeLength/2.4,cellSize:size,
      source:'Existing supported connectivity; no added floor area or passage.'}};
}

export function firstStrikeEntryFromPlan({plan,origin,canOccupy=()=>true,decodeHeight,maximumRadius=26,...options}={}){
  if(!plan?.rgba||!plan.w||!plan.h||!origin||typeof decodeHeight!=='function')return null;
  maximumRadius=Number.isFinite(maximumRadius)?Math.max(2,Math.min(26,maximumRadius)):26;
  const cells=[],ox=finite(plan.originX),oz=finite(plan.originY),size=CELL;
  const minX=Math.max(0,Math.floor((origin.x-maximumRadius)/size-ox)),maxX=Math.min(plan.w-1,Math.ceil((origin.x+maximumRadius)/size-ox)),
    minZ=Math.max(0,Math.floor((origin.z-maximumRadius)/size-oz)),maxZ=Math.min(plan.h-1,Math.ceil((origin.z+maximumRadius)/size-oz));
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    const i=z*plan.w+x,flags=plan.rgba[i*4+2];
    if(flags&(F.SOLID|F.BRICKED|F.CLOSED))continue;
    const floor=Number.isFinite(plan.floor?.[i])?plan.floor[i]:decodeHeight(plan.rgba[i*4]),
      ceil=Number.isFinite(plan.ceil?.[i])?plan.ceil[i]:decodeHeight(plan.rgba[i*4+1]),
      px=(ox+x+.5)*size,pz=(oz+z+.5)*size;
    if(Math.abs(floor-origin.y)>1.2||ceil-floor<HEADROOM||!canOccupy({x:px,z:pz,floor,flags}))continue;
    cells.push({x:px,z:pz,floor,ceil,renderFloor:decodeHeight(plan.rgba[i*4]),renderCeil:decodeHeight(plan.rgba[i*4+1]),flags,material:plan.material?.[plan.material.length>=plan.w*plan.h*4?i*4:i]??0,cellSize:size,planIndex:i,walkable:true});
  }
  const snapshot={...plan,rgba:new Uint8Array(plan.rgba),material:plan.material?new Uint8Array(plan.material):null,
    ambient:plan.ambient?new Uint8Array(plan.ambient):null,floor:plan.floor?new Float32Array(plan.floor):null,ceil:plan.ceil?new Float32Array(plan.ceil):null};
  return firstStrikeEntryFromCells({...options,plan:snapshot,origin,cells});
}

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];});
const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);
export function firstStrikeInstanceMatrix(instance,base=identity()){
  if(instance.matrix?.length===16)return multiply(instance.matrix,base);
  const scale=instance.scale||1,x=(instance.scaleX??1)*scale,y=(instance.scaleY??1)*scale,z=(instance.scaleZ??1)*scale,
    c=Math.cos(instance.yaw||0),s=Math.sin(instance.yaw||0);
  return multiply([c*x,0,s*x,0,0,y,0,0,-s*z,0,c*z,0,instance.x||0,instance.y||0,instance.z||0,1],base);
}
function heightAt(t,x,z){
  const[a,b,c]=t.points,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(den)<1e-10)return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,
    v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
  return Math.min(u,v,w)>=-1e-7?u*a[1]+v*b[1]+w*c[1]:null;
}
function segmentDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/d)):0;
  return Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
}
// Borrowed Source rooms are mesh construction. Sample the actual submitted,
// transformed triangle faces instead of replacing them with a guessed floor.
export function firstStrikeEntryFromSubmittedGeometry({catalog,instances=[],origin,maximumRadius=20,...options}={}){
  if(!catalog||!origin)return null;
  maximumRadius=Number.isFinite(maximumRadius)?Math.max(2,Math.min(20,maximumRadius)):20;
  const size=CELL,buckets=new Map(),minX=Math.floor((origin.x-maximumRadius)/size),maxX=Math.floor((origin.x+maximumRadius)/size),
    minZ=Math.floor((origin.z-maximumRadius)/size),maxZ=Math.floor((origin.z+maximumRadius)/size);
  let triangles=0;const hostBounds={};
  for(const instance of instances){
    if(instance.character||instance.playerBody||instance.portalDestination||instance.hidden||instance.decorative||instance.practical)continue;
    const mesh=catalog.get(instance.mesh);if(!mesh)continue;
    const matrix=firstStrikeInstanceMatrix(instance,mesh.nodeMatrix||identity());
    for(const primitive of mesh.primitives||[]){
      const geometry=primitive.nativeReceiverGeometry;if(!geometry?.positions)continue;
      const positions=geometry.positions,indices=geometry.indices||Array.from({length:positions.length/3},(_,i)=>i);
      for(let at=0;at<indices.length;at+=3){
        const points=[0,1,2].map(i=>transform(matrix,positions.slice(indices[at+i]*3,indices[at+i]*3+3))),
          lo=points[0].map((_,i)=>Math.min(...points.map(p=>p[i]))),hi=points[0].map((_,i)=>Math.max(...points.map(p=>p[i])));
        const bounds=hostBounds[instance.id]||(hostBounds[instance.id]={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
        for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],lo[k]);bounds.max[k]=Math.max(bounds.max[k],hi[k]);}
        if(hi[0]<origin.x-maximumRadius||lo[0]>origin.x+maximumRadius||hi[2]<origin.z-maximumRadius||lo[2]>origin.z+maximumRadius||hi[1]<origin.y-.8||lo[1]>origin.y+8)continue;
        const a=points[1].map((v,i)=>v-points[0][i]),b=points[2].map((v,i)=>v-points[0][i]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],normalY=n[1]/Math.max(1e-9,Math.hypot(...n)),
          t={points,lo,hi,normalY,mesh:instance.mesh,id:instance.id};triangles++;
        for(let z=Math.max(minZ,Math.floor((lo[2]-.23)/size));z<=Math.min(maxZ,Math.floor((hi[2]+.23)/size));z++)
          for(let x=Math.max(minX,Math.floor((lo[0]-.23)/size));x<=Math.min(maxX,Math.floor((hi[0]+.23)/size));x++){
            const id=key(x,z);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(t);
          }
      }
    }
  }
  const floorAt=(x,z,near=origin.y)=>{
    const faces=buckets.get(key(Math.floor(x/size),Math.floor(z/size)))||[];
    return faces.filter(t=>t.normalY>.35).map(t=>heightAt(t,x,z)).filter(y=>y!==null&&Math.abs(y-near)<=STEP_UP+.03).sort((a,b)=>b-a)[0]??null;
  };
  const cells=[];
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    const px=(x+.5)*size,pz=(z+.5)*size,floor=floorAt(px,pz);if(floor===null)continue;
    let clear=true;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;if(floorAt(px+Math.cos(a)*BODY_RADIUS,pz+Math.sin(a)*BODY_RADIUS,floor)===null){clear=false;break;}}
    if(!clear)continue;
    const faces=buckets.get(key(x,z))||[];let ceil=floor+90,ceilingHostId=null,floorHostId=null;
    for(const t of faces){
      const h=heightAt(t,px,pz);
      if(h!==null&&t.normalY>.35&&Math.abs(h-floor)<.01)floorHostId=t.id;
      if(h!==null&&h>floor+.3&&h<ceil){ceil=h;ceilingHostId=t.id;}
      if(Math.abs(t.normalY)<.4&&t.lo[1]<floor+HEADROOM&&t.hi[1]>floor+.10&&
        [0,1,2].some(i=>segmentDistance(px,pz,t.points[i],t.points[(i+1)%3])<BODY_RADIUS)){clear=false;break;}
    }
    if(clear&&ceil-floor>=HEADROOM)cells.push({x:px,z:pz,floor,ceil,ceilingHostId,floorHostId,cellSize:size,walkable:true,flags:ceil-floor>20?F.SKY:0,material:0});
  }
  const canStand=(px,pz,feet)=>{
    const actualFloor=floorAt(px,pz,feet);if(actualFloor===null)return false;
    for(let i=0;i<9;i++){
      const a=i*Math.PI/4,x=px+(i===8?0:Math.cos(a)*BODY_RADIUS),z=pz+(i===8?0:Math.sin(a)*BODY_RADIUS);
      const support=floorAt(x,z,actualFloor);if(support===null)return false;
      for(const t of buckets.get(key(Math.floor(x/size),Math.floor(z/size)))||[]){
        if(Math.abs(t.normalY)<.4&&t.lo[1]<actualFloor+HEADROOM&&t.hi[1]>actualFloor+STEP_UP+.001&&[0,1,2].some(j=>segmentDistance(px,pz,t.points[j],t.points[(j+1)%3])<BODY_RADIUS))return false;
        const h=heightAt(t,x,z);if(h!==null&&h>Math.max(actualFloor,support)+STEP_UP+.001&&h<actualFloor+HEADROOM)return false;
      }
    }
    return true;
  };
  const canTraverse=(a,b)=>{
    const n=Math.ceil(distance(a,b)/.06);let feet=a.floor;
    for(let i=1;i<=n;i++){const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,nextFloor=floorAt(x,z,feet);if(nextFloor===null||!canStand(x,z,nextFloor))return false;feet=nextFloor;}
    return true;
  };
  const result=firstStrikeEntryFromCells({...options,origin,cells,props:instances,source:{kind:'submitted-mesh-triangles',triangles},canStand,canTraverse});
  if(result){result.routeEvidence.submittedTriangles=triangles;result.hostBounds=hostBounds;}
  return result;
}

export function packFirstStrikeConstruction(value){
  const e=normalizeFirstStrikeEntry(value);
  return{schema:1,origin:e.origin,yaw:e.yaw,pitch:e.pitch,region:e.region,routeHash:e.routeHash,route:e.route,
    safeEdge:e.safeEdge,shelter:e.shelter,hostBounds:e.hostBounds||null,
    cells:e.walkCells.map(c=>[c.x,c.z,c.floor,c.ceil,c.size,c.flags||0,c.material||0,c.planIndex??-1,c.floorHostId||'',c.ceilingHostId||'',c.renderFloor??c.floor,c.renderCeil??c.ceil])};
}
export function restoreFirstStrikeConstruction(current,value){
  if(!current||value?.schema!==1||!Array.isArray(value.cells))return current;
  return{...current,origin:value.origin,yaw:value.yaw,pitch:value.pitch,region:value.region,routeHash:value.routeHash,
    route:value.route,safeEdge:value.safeEdge,shelter:value.shelter,hostBounds:value.hostBounds||current.hostBounds,
    walkCells:value.cells.map(([x,z,floor,ceil,cellSize,flags,material,planIndex,floorHostId,ceilingHostId,renderFloor=floor,renderCeil=ceil])=>({x,z,floor,ceil,cellSize,flags,material,planIndex,floorHostId,ceilingHostId,renderFloor,renderCeil,walkable:true}))};
}

// Ordinary plan entries can stand under open sky beside real submitted facade
// mass. Retain that construction without synthesizing a roof or rebuilding its
// route. Bounds are whole-host conservative boxes; the radius only culls hosts.
const submittedPrimitiveBounds=new WeakMap();
function retainedSubmittedBounds(primitive){
  if(submittedPrimitiveBounds.has(primitive))return submittedPrimitiveBounds.get(primitive);
  const supplied=primitive.nativeReceiverBounds,valid=b=>b&&b.min?.length===3&&b.max?.length===3&&[...b.min,...b.max].every(Number.isFinite)&&b.min.every((n,i)=>n<=b.max[i]);
  let bounds=valid(supplied)?{min:[...supplied.min],max:[...supplied.max]}:null;
  if(!bounds){
    const geometry=primitive.nativeReceiverGeometry,positions=geometry?.positions;
    if(positions?.length>=9){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],indices=geometry.indices||Array.from({length:Math.floor(positions.length/3)},(_,i)=>i);
      let validGeometry=true;
      for(const index of indices){
        for(let k=0;k<3;k++){
          const n=positions[index*3+k];if(!Number.isFinite(n)){validGeometry=false;break;}
          min[k]=Math.min(min[k],n);max[k]=Math.max(max[k],n);
        }
        if(!validGeometry)break;
      }
      if(validGeometry&&valid({min,max}))bounds={min,max};
    }
  }
  submittedPrimitiveBounds.set(primitive,bounds);return bounds;
}
export function firstStrikeSubmittedHostBounds({catalog,instances=[],origin,maximumRadius=60}={}){
  const result={};
  if(!catalog?.get||!origin||![origin.x,origin.y,origin.z].every(Number.isFinite))return result;
  const radius=Number.isFinite(maximumRadius)?Math.max(1,Math.min(60,maximumRadius)):60,counts=new Map();
  for(const instance of instances)if(typeof instance?.id==='string')counts.set(instance.id,(counts.get(instance.id)||0)+1);
  for(const instance of instances){
    const id=instance?.id;
    if(typeof id!=='string'||!id||counts.get(id)!==1||instance.character||instance.playerBody||instance.portalDestination||instance.hidden||instance.visible===false||instance.decorative||instance.practical)continue;
    const mesh=catalog.get(instance.mesh);if(!mesh)continue;
    const matrix=firstStrikeInstanceMatrix(instance,mesh.nodeMatrix||identity());
    if(matrix.length!==16||!matrix.every(Number.isFinite))continue;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],primitives=[];
    for(const primitive of mesh.primitives||[]){
      const bounds=retainedSubmittedBounds(primitive);if(!bounds)continue;primitives.push(primitive);
      for(let mask=0;mask<8;mask++){
        const point=transform(matrix,[0,1,2].map(k=>(mask&(1<<k))?bounds.max[k]:bounds.min[k]));
        for(let k=0;k<3;k++){min[k]=Math.min(min[k],point[k]);max[k]=Math.max(max[k],point[k]);}
      }
    }
    if(!primitives.length)continue;
    const dx=Math.max(min[0]-origin.x,0,origin.x-max[0]),dz=Math.max(min[2]-origin.z,0,origin.z-max[2]);
    if(Math.hypot(dx,dz)>radius)continue;
    let supportAtOrigin=null,entryFloorMin=Infinity,entryFloorMax=-Infinity,floorTriangleCount=0,floorTrianglesKnown=false;
    if(min[1]<=origin.y+STEP_UP+.03&&max[1]>=origin.y-STEP_UP-.03){
      for(const primitive of primitives){
        const geometry=primitive.nativeReceiverGeometry,positions=geometry?.positions;if(!positions)continue;
        floorTrianglesKnown=true;
        const indices=geometry.indices||Array.from({length:Math.floor(positions.length/3)},(_,i)=>i);
        for(let at=0;at+2<indices.length;at+=3){
          const points=[0,1,2].map(i=>transform(matrix,[0,1,2].map(k=>positions[indices[at+i]*3+k])));
          if(!points.flat().every(Number.isFinite))continue;
          const a=points[1].map((v,i)=>v-points[0][i]),b=points[2].map((v,i)=>v-points[0][i]),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
          if(normal[1]/Math.max(1e-9,Math.hypot(...normal))<=.35)continue;
          const lo=Math.min(...points.map(p=>p[1])),hi=Math.max(...points.map(p=>p[1]));
          if(lo>origin.y+STEP_UP+.03||hi<origin.y-STEP_UP-.03)continue;
          entryFloorMin=Math.min(entryFloorMin,lo);entryFloorMax=Math.max(entryFloorMax,hi);floorTriangleCount++;
          const y=heightAt({points},origin.x,origin.z);
          if(y!==null&&Math.abs(y-origin.y)<=STEP_UP+.03)supportAtOrigin=Math.max(supportAtOrigin??-Infinity,y);
        }
      }
    }
    Object.defineProperty(result,id,{enumerable:true,writable:true,configurable:true,value:{min,max,mesh:instance.mesh,structural:instance.structural===true,supportAtOrigin,hasFloorAtEntryLevel:floorTriangleCount>0,
      entryFloorMin:floorTriangleCount?entryFloorMin:null,entryFloorMax:floorTriangleCount?entryFloorMax:null,floorTriangleCount,floorTrianglesKnown}});
  }
  return result;
}
