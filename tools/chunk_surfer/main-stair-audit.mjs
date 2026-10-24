// What actually draws inside the main stair's volume, measured rather than
// assumed. One library for the inventory export, the camera-station source maps
// and the construction spec, so the three cannot disagree about the geometry.
//
// The stair is drawn by two renderers at once. The hero GLB is depth-tested
// props geometry; the ray-marched plan is a heightfield of half-metre columns
// whose floor and ceiling are stored in eight bits over H_MIN..H_MAX. Whatever
// the plan draws, it draws at a multiple of 32/255 m, in square columns, from
// the ONE span per column that physicalRenderPlanFor picks for the observer's
// height band. Everything below reproduces that, byte for byte, in node.

import fs from 'node:fs';
import path from 'node:path';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import { CELL, F } from '../../src/data/floorplan/legend.js';
import { MAIN_STAIR_GEOMETRY as STAIR } from '../../src/data/main-stair-geometry.js';

export const ROOT=path.resolve(import.meta.dirname,'../..');
export const STAIR_GLB=path.join(ROOT,'public/assets/conservatory-main-stair.glb');
export const STAIR_OWNER='main-open-well';
export const STAIR_PROP='main-open-well-stair';
// The stair hall's physical extent in metres, generous on every side so the
// floor openings and the hall walls that frame the well are in the inventory.
export const STAIR_BOUNDS=Object.freeze({x0:55.5,x1:71,z0:26.5,z1:45,y0:-4.5,y1:15});

export const SOURCE=Object.freeze({
  MESH:'mesh',STAIR_FILL:'stair-fill',WELL:'open-well',LANDING:'landing-cell',STAIRWELL:'stairwell',
  HALL_GROUND:'ground-hall',HALL_UPPER:'upper-hall',ACADEMIC:'academic-floor',OTHER:'other',NONE:'none',
});
// Distinct in every pair at a glance, and stable across runs.
export const SOURCE_COLOR=Object.freeze({
  mesh:[236,236,236],'stair-fill':[230,57,70],stairwell:[120,146,180],'open-well':[120,60,160],'landing-cell':[255,166,0],
  'ground-hall':[46,134,222],'upper-hall':[16,172,132],'academic-floor':[155,200,60],other:[110,110,110],none:[0,0,0],
});

let compiled=false;
export function compileConservatory(){
  if(!compiled){FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);compiled=true;}
  return{FP,PROPS,plan:FP.floorplan(),phys:FP.physicalSpanData()};
}

export const decodeH=(byte)=>FP.decodeH(byte);
export const drawnHeight=(h)=>FP.decodeH(FP.encodeH(h));

export function spanSource(span){
  if(!span)return SOURCE.NONE;
  if(span.owner===STAIR_OWNER){
    if(span.stairwell)return SOURCE.STAIRWELL;
    if(span.logicalX>=0)return SOURCE.LANDING;
    return span.floor<0?SOURCE.WELL:SOURCE.STAIR_FILL;
  }
  if(span.owner==='grand_ground_stair_hall')return SOURCE.HALL_GROUND;
  if(span.owner==='grand_upper_stair_hall')return SOURCE.HALL_UPPER;
  if(span.owner==='academic_stair_loggia'||span.owner==='academic_floor')return SOURCE.ACADEMIC;
  return SOURCE.OTHER;
}

// ── The hero mesh, in physical metres ────────────────────────────────────────
export function readGlb(file=STAIR_GLB){
  const bytes=fs.readFileSync(file),jsonLength=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8').trim());
  const binOffset=20+jsonLength+8,meshes=[];
  const view=(accessorIndex,Type,width)=>{
    const a=gltf.accessors[accessorIndex],v=gltf.bufferViews[a.bufferView];
    return new Type(bytes.buffer.slice(bytes.byteOffset+binOffset+(v.byteOffset||0)+(a.byteOffset||0),bytes.byteOffset+binOffset+(v.byteOffset||0)+(a.byteOffset||0)+a.count*width*Type.BYTES_PER_ELEMENT));
  };
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
    meshes.push({
      mesh:mesh.name,material:gltf.materials[primitive.material]?.name||String(primitive.material),
      positions:view(primitive.attributes.POSITION,Float32Array,3),
      normals:view(primitive.attributes.NORMAL,Float32Array,3),
      indices:view(primitive.indices,Uint32Array,1),
    });
  }
  return{gltf,primitives:meshes};
}

export function stairInstance(){
  compileConservatory();
  const inst=PROPS.renderInstances().find((p)=>p.id===STAIR_PROP);
  if(!inst)throw new Error(`${STAIR_PROP} is not placed`);
  return inst;
}

// Triangles in world metres, with per-corner shading normals. The instance
// carries a translation only (yaw 0, scale 1); anything else is a placement
// change this audit should hear about, so it throws.
export function stairMeshTriangles(file=STAIR_GLB){
  const inst=stairInstance();
  if(Math.abs(inst.yaw||0)>1e-9||(inst.scale||1)!==1||inst.scaleX||inst.scaleY||inst.scaleZ)
    throw new Error(`${STAIR_PROP} has a rotation or scale; the audit assumes translation only`);
  const {primitives}=readGlb(file),tris=[];
  for(const p of primitives){
    const P=(i)=>[p.positions[i*3]+inst.x,p.positions[i*3+1]+inst.y,p.positions[i*3+2]+inst.z];
    const N=(i)=>[p.normals[i*3],p.normals[i*3+1],p.normals[i*3+2]];
    for(let k=0;k<p.indices.length;k+=3){
      const ia=p.indices[k],ib=p.indices[k+1],ic=p.indices[k+2];
      tris.push({mesh:p.mesh,material:p.material,a:P(ia),b:P(ib),c:P(ic),na:N(ia),nb:N(ib),nc:N(ic)});
    }
  }
  return tris;
}

// ── Spans in the stair's volume, labelled by who authored them ───────────────
export function regionColumns(bounds=STAIR_BOUNDS){
  const {phys}=compileConservatory(),out=[];
  const px0=Math.floor(bounds.x0/CELL),px1=Math.ceil(bounds.x1/CELL),pz0=Math.floor(bounds.z0/CELL),pz1=Math.ceil(bounds.z1/CELL);
  for(let pz=pz0;pz<pz1;pz++)for(let px=px0;px<px1;px++){
    const spans=(phys.cells.get(`${px},${pz}`)||[]).map((span)=>({...span,source:spanSource(span),
      drawnFloor:drawnHeight(span.floor),drawnCeil:drawnHeight(span.ceil)}));
    out.push({px,pz,x0:px*CELL,z0:pz*CELL,spans});
  }
  return out;
}

// ── The observer's slice, exactly as the GPU receives it ─────────────────────
// physicalRenderPlanFor keys on the LOGICAL position, so a station names the
// physical point it stands on and the floor it stands at, and this finds the
// logical cell that maps there (on a helix, the tread lane nearest the point).
export function logicalAt(x,z,floor){
  const {plan}=compileConservatory();
  let best=null,bestD=Infinity;
  for(let y=0;y<plan.h;y++)for(let lx=0;lx<plan.w;lx++){
    const i=y*plan.w+lx;if(plan.solid[i]||plan.collisionOnly?.[i])continue;
    if(Math.abs(plan.floor[i]-floor)>.35)continue;
    const p=FP.logicalToPhysical(lx+.5,y+.5),d=Math.hypot(p.x*CELL-x,p.z*CELL-z);
    if(d<bestD){bestD=d;best={x:lx+.5,y:y+.5,distanceM:d,floor:plan.floor[i],owner:plan.owner[i]};}
  }
  return best;
}

export function observerSlice(logicalX,logicalY){
  compileConservatory();
  const slice=FP.physicalRenderPlanFor(logicalX,logicalY);
  const {phys}=compileConservatory();
  const n=slice.w*slice.h,f=new Float32Array(n),c=new Float32Array(n),fl=new Uint8Array(n),source=new Array(n).fill(SOURCE.NONE);
  for(let i=0;i<n;i++){
    f[i]=decodeH(slice.rgba[i*4]);c[i]=decodeH(slice.rgba[i*4+1]);fl[i]=slice.rgba[i*4+2];
    if(slice.solid[i])continue;
    // The slice keeps the chosen span's numbers, not its identity. Match them
    // back against the column's spans; floor, ceiling, flags and zone together
    // are unique within one column.
    const px=(i%slice.w)+slice.originX,pz=Math.floor(i/slice.w)+slice.originY;
    const spans=phys.cells.get(`${px},${pz}`)||[];
    // The slice's heights are Float32; the spans' are doubles.
    const f32=Math.fround;
    const hit=spans.find((s)=>f32(s.floor)===slice.floor[i]&&f32(s.ceil)===slice.ceil[i]&&s.zone===slice.zone[i])
      ||spans.find((s)=>f32(s.floor)===slice.floor[i]);
    source[i]=hit?spanSource(hit):SOURCE.OTHER;
  }
  return{...slice,drawnFloor:f,drawnCeil:c,drawnFlags:fl,source};
}

// The r3d march, in metres. Same DDA, same floor/ceiling/riser/header/wall
// tests, same order; the open-ground skip is an exact shortcut and is omitted.
export function marchSlice(slice,eye,dir,maxT=90){
  const ro=[eye[0]/CELL,eye[1]/CELL,eye[2]/CELL],rd=dir;
  const shape=(cx,cz)=>{
    const lx=cx-slice.originX,lz=cz-slice.originY;
    if(lx<0||lz<0||lx>=slice.w||lz>=slice.h)return{solid:false,f:-1000,c:90/CELL,flags:F.SKY,i:-1};
    const i=lz*slice.w+lx,flags=slice.drawnFlags[i],solid=(flags&F.SOLID)!==0;
    let c=slice.drawnCeil[i]/CELL;if((flags&F.SKY)&&!(flags&F.WALLED))c=90/CELL;
    return{solid,f:slice.drawnFloor[i]/CELL,c,flags,i};
  };
  let cx=Math.floor(ro[0]),cz=Math.floor(ro[2]);
  const drd=[1/Math.max(Math.abs(rd[0]),1e-5),1/Math.max(Math.abs(rd[2]),1e-5)];
  const stp=[rd[0]<0?-1:1,rd[2]<0?-1:1];
  const sideT=[(cx+Math.max(stp[0],0)-ro[0])/(rd[0]+1e-9),(cz+Math.max(stp[1],0)-ro[2])/(rd[2]+1e-9)];
  let cur=shape(cx,cz),tEnter=0;const MAXD=maxT/CELL;
  for(let guard=0;guard<192;guard++){
    if(tEnter>MAXD)break;
    const xSide=sideT[0]<sideT[1],tExit=Math.min(sideT[0],sideT[1]);
    if(!cur.solid){
      if(rd[1]<-1e-4){const tf=(cur.f-ro[1])/rd[1];if(tf>=tEnter&&tf<=tExit)return{t:tf*CELL,surf:'floor',i:cur.i,cell:[cx,cz]};}
      if(rd[1]>1e-4&&!(cur.flags&F.SKY)){const tc=(cur.c-ro[1])/rd[1];if(tc>=tEnter&&tc<=tExit)return{t:tc*CELL,surf:'ceiling',i:cur.i,cell:[cx,cz]};}
    }
    const nx=xSide?cx+stp[0]:cx,nz=xSide?cz:cz+stp[1],nc=shape(nx,nz),yB=ro[1]+rd[1]*tExit;
    let wall=false,kind='wall';
    if(nc.solid)wall=yB>=cur.f-.001&&yB<=cur.c+.001;
    else if(yB<nc.f){wall=true;kind='riser';}
    else if(yB>nc.c&&!(nc.flags&F.SKY)){wall=true;kind='header';}
    if(wall&&tExit<=MAXD)return{t:tExit*CELL,surf:kind,i:nc.solid?cur.i:nc.i,cell:nc.solid?[cx,cz]:[nx,nz],solidBehind:nc.solid};
    cx=nx;cz=nz;cur=nc;tEnter=tExit;
    if(xSide)sideT[0]+=drd[0];else sideT[1]+=drd[1];
  }
  return null;
}

// ── A plain BVH over the mesh triangles ──────────────────────────────────────
export function buildBVH(tris){
  const idx=tris.map((_,i)=>i),cent=tris.map((t)=>[0,1,2].map((k)=>(t.a[k]+t.b[k]+t.c[k])/3));
  const box=(list)=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const i of list){const t=tris[i];for(const p of[t.a,t.b,t.c])for(let k=0;k<3;k++){if(p[k]<lo[k])lo[k]=p[k];if(p[k]>hi[k])hi[k]=p[k];}}return{lo,hi};};
  const node=(list)=>{
    const b=box(list);if(list.length<=6)return{...b,leaf:list};
    const ext=[0,1,2].map((k)=>b.hi[k]-b.lo[k]),axis=ext.indexOf(Math.max(...ext));
    list.sort((p,q)=>cent[p][axis]-cent[q][axis]);const mid=list.length>>1;
    return{...b,l:node(list.slice(0,mid)),r:node(list.slice(mid))};
  };
  return{root:node(idx),tris};
}
function hitBox(b,o,inv,tMax){
  let t0=0,t1=tMax;
  for(let k=0;k<3;k++){let a=(b.lo[k]-o[k])*inv[k],c=(b.hi[k]-o[k])*inv[k];if(a>c){const s=a;a=c;c=s;}t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1)return false;}
  return true;
}
export function raycastBVH(bvh,o,d,tMax=1e9,{cull=true}={}){
  const inv=d.map((v)=>1/(Math.abs(v)>1e-12?v:1e-12));let best=null,bestT=tMax;
  const stack=[bvh.root];
  while(stack.length){
    const n=stack.pop();if(!hitBox(n,o,inv,bestT))continue;
    if(n.leaf){for(const i of n.leaf){const t=bvh.tris[i],hit=rayTri(o,d,t.a,t.b,t.c);if(hit&&hit.t>1e-6&&hit.t<bestT){
      // Back faces are culled exactly as the prop pass culls single-sided opaque
      // materials; only the opal glass is double sided.
      if(cull&&hit.back&&t.material!=='opal glass')continue;bestT=hit.t;best={t:hit.t,tri:i,u:hit.u,v:hit.v,back:hit.back};}}}
    else{stack.push(n.l,n.r);}
  }
  return best;
}
function rayTri(o,d,a,b,c){
  const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const p=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]],det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];
  if(Math.abs(det)<1e-12)return null;const inv=1/det,s=[o[0]-a[0],o[1]-a[1],o[2]-a[2]],u=(s[0]*p[0]+s[1]*p[1]+s[2]*p[2])*inv;if(u<0||u>1)return null;
  const q=[s[1]*e1[2]-s[2]*e1[1],s[2]*e1[0]-s[0]*e1[2],s[0]*e1[1]-s[1]*e1[0]],v=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv;if(v<0||u+v>1)return null;
  const t=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv;
  // Geometric normal against the ray: the winding decides which side is front.
  const n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  return{t,u,v,back:n[0]*d[0]+n[1]*d[1]+n[2]*d[2]>0};
}

// ── Camera, as r3d builds it ────────────────────────────────────────────────
export function cameraBasis(yaw=0,pitch=0){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  return{forward:[sy*cp,sp,-cy*cp],right:[cy,0,sy],up:[-sy*sp,cp,cy*sp]};
}
// tanHalfFov .95 vertical, aspect from the frame; the same projection
// r3dProjectWorld inverts.
export function pixelRay(camera,px,py,width,height,tanHalfFov=.95){
  const {forward,right,up}=cameraBasis(camera.yaw,camera.pitch),aspect=width/height;
  const nx=((px+.5)/width*2-1)*aspect*tanHalfFov,ny=(1-(py+.5)/height*2)*tanHalfFov;
  const d=[forward[0]+right[0]*nx+up[0]*ny,forward[1]+right[1]*nx+up[1]*ny,forward[2]+right[2]*nx+up[2]*ny];
  const l=Math.hypot(...d);return d.map((v)=>v/l);
}

// Per pixel: which renderer and which author owns the nearest surface.
// `frame` is the screen the camera projects to; `window` (screen pixels) picks
// the part of it to sample, so a map can match a cropped capture exactly.
export function sourceMap({slice,bvh,camera,width,height,frame=null,window=null}){
  const out=new Array(width*height),eye=[camera.eye.x,camera.eye.y,camera.eye.z];
  const fw=frame?.width||width,fh=frame?.height||height,win=window||{x0:0,y0:0,w:fw,h:fh};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=win.x0+(x+.5)*win.w/width-.5,sy=win.y0+(y+.5)*win.h/height-.5;
    const d=pixelRay(camera,sx,sy,fw,fh),m=marchSlice(slice,eye,d),tri=raycastBVH(bvh,eye,d,m?m.t:90);
    let label;
    if(tri&&(!m||tri.t<m.t))label={source:SOURCE.MESH,t:tri.t,tri:tri.tri};
    else if(m)label={source:m.i>=0?slice.source[m.i]:SOURCE.NONE,t:m.t,surf:m.surf,i:m.i};
    else label={source:SOURCE.NONE,t:Infinity};
    out[y*width+x]=label;
  }
  return out;
}

// ── PLY, one colour per face ────────────────────────────────────────────────
export function writePly(file,faces){
  const lines=[],vertexLines=[],faceLines=[];let v=0;
  for(const face of faces){
    const [r,g,b]=face.color;
    for(const p of face.points)vertexLines.push(`${p[0].toFixed(5)} ${p[1].toFixed(5)} ${p[2].toFixed(5)} ${r} ${g} ${b}`);
    faceLines.push(`${face.points.length} ${face.points.map((_,k)=>v+k).join(' ')}`);v+=face.points.length;
  }
  lines.push('ply','format ascii 1.0','comment chunk-surfer main stair source inventory; metres, Y up',
    `element vertex ${vertexLines.length}`,'property float x','property float y','property float z',
    'property uchar red','property uchar green','property uchar blue',`element face ${faceLines.length}`,
    'property list uchar int vertex_indices','end_header');
  fs.writeFileSync(file,[...lines,...vertexLines,...faceLines].join('\n')+'\n');
}

export {CELL,F,STAIR,FP};

// ── Measurements ────────────────────────────────────────────────────────────
// Each returns plain numbers plus the worst offenders, so a spec can assert on
// the numbers and a person can go and look at the offenders.

const RAD=STAIR.flights;
const angleOf=(x,z)=>{let a=Math.atan2(x-STAIR.center.x,-(z-STAIR.center.z));return a<0?a+Math.PI*2:a;};
export function meshUpSurfaceBelow(bvh,x,y,z,reach=.6){
  // The first front-facing surface straight down: a tread, landing or rail top.
  const hit=raycastBVH(bvh,[x,y,z],[0,-1,0],reach);
  return hit?y-hit.t:null;
}
// The same, with what was hit, so a caller can ask for walkable finish only.
export function meshUpHitBelow(bvh,x,y,z,reach=.6){
  const hit=raycastBVH(bvh,[x,y,z],[0,-1,0],reach);
  return hit?{y:y-hit.t,material:bvh.tris[hit.tri].material}:null;
}
export function gridColumnAt(columns,x,z){
  const px=Math.floor(x/CELL),pz=Math.floor(z/CELL);return columns.find((c)=>c.px===px&&c.pz===pz)||null;
}
export function meshAnySurfaceBelow(bvh,x,y,z,reach=20){
  const hit=raycastBVH(bvh,[x,y,z],[0,-1,0],reach,{cull:false});
  return hit?{y:y-hit.t,back:hit.back}:null;
}

// The grid's floors against the mesh's treads, and the grid's solid against the
// mesh's soffit. `columns` is regionColumns(); only stair and landing spans are
// judged, because only those claim to be the stair.
export function measureGridAgainstMesh(bvh,columns,{samples=6}={}){
  const out={columnsJudged:0,above:[],outside:[],underSoffit:[],samples:0};
  for(const col of columns){
    const stack=col.spans.slice().sort((a,b)=>a.floor-b.floor);
    for(let si=0;si<stack.length;si++){
      const span=stack[si];if(span.source!==SOURCE.STAIR_FILL&&span.source!==SOURCE.LANDING)continue;
      // Landing cells beyond a stairwell are room floor at landing height (the
      // level check below compares them with the built landing); only grid that
      // claims to be the stair is judged here.
      if(span.source===SOURCE.LANDING&&STAIR.stairwell&&!insideStairwell(col.x0+CELL/2,col.z0+CELL/2))continue;
      out.columnsJudged++;
      let worstAbove=0,outsideCount=0,worstUnder=0;
      const below=si>0?stack[si-1].drawnCeil:FP.H_MIN;
      for(let sz=0;sz<samples;sz++)for(let sx=0;sx<samples;sx++){
        const x=col.x0+(sx+.5)/samples*CELL,z=col.z0+(sz+.5)/samples*CELL;out.samples++;
        const top=meshUpSurfaceBelow(bvh,x,span.drawnFloor+.25,z,.65);
        if(top==null){outsideCount++;continue;}
        if(span.drawnFloor-top>.001)worstAbove=Math.max(worstAbove,span.drawnFloor-top);
        // Under the tread: the mesh's own underside, then whatever the grid
        // says is solid down to the next span. Air the mesh shows that the grid
        // fills is a block under the stair.
        const under=raycastBVH(bvh,[x,Math.min(top,span.drawnFloor)-.002,z],[0,-1,0],20,{cull:false});
        const soffit=under?Math.min(top,span.drawnFloor)-.002-under.t:null;
        if(soffit!=null){
          // Beneath the soffit the mesh shows open air down to the next thing
          // it draws facing up (a lower flight), or failing that the floor of
          // the storey below. The grid is solid from this span's floor down to
          // the next span's ceiling. Where those overlap is a block under the
          // stair that the mesh says is not there.
          const lower=raycastBVH(bvh,[x,soffit-.002,z],[0,-1,0],20);
          const level=[10,4.8,0].find((h)=>h<soffit-.3)??0;
          const meshFloor=lower?Math.max(soffit-.002-lower.t,drawnHeight(level)):drawnHeight(level);
          const exposed=soffit-Math.max(below,meshFloor);
          if(exposed>.001)worstUnder=Math.max(worstUnder,exposed);
        }
      }
      const tag={px:col.px,pz:col.pz,x:col.x0+CELL/2,z:col.z0+CELL/2,floor:span.floor,drawnFloor:span.drawnFloor,source:span.source,flightId:span.flightId};
      if(worstAbove>0)out.above.push({...tag,byM:worstAbove});
      if(outsideCount)out.outside.push({...tag,fraction:outsideCount/(samples*samples),r:Math.hypot(tag.x-STAIR.center.x,tag.z-STAIR.center.z)});
      if(worstUnder>0)out.underSoffit.push({...tag,byM:worstUnder});
    }
  }
  for(const k of['above','underSoffit'])out[k].sort((a,b)=>b.byM-a.byM);
  out.outside.sort((a,b)=>b.fraction-a.fraction);
  return out;
}

// Where the grid draws a surface at a point: the span covering that point
// whose drawn floor is nearest the asked height.
export const insideStairwell=(x,z)=>{const w=STAIR.stairwell;return !!w&&x>w.x0&&x<w.x1&&z>w.z0&&z<w.z1;};
// Inside the stairwell every grid column must be the one air span from the
// stairwell floor to its roof, so the grid draws nothing but that floor.
export function measureStairwellGrid(columns){
  const w=STAIR.stairwell,bad=[];if(!w)return{columns:0,bad:[{reason:'no stairwell declared'}]};
  let n=0;
  for(const col of columns){
    if(!insideStairwell(col.x0+CELL/2,col.z0+CELL/2))continue;n++;
    const ok=col.spans.length===1&&col.spans[0].source===SOURCE.STAIRWELL&&Math.abs(col.spans[0].floor-w.floor)<1e-6&&Math.abs(col.spans[0].ceil-w.ceil)<1e-6;
    if(!ok)bad.push({px:col.px,pz:col.pz,spans:col.spans.map((s)=>`${s.source}@${s.drawnFloor.toFixed(2)}-${s.drawnCeil.toFixed(2)}`)});
  }
  return{columns:n,bad};
}
export function gridFloorAt(columns,x,z,near){
  const px=Math.floor(x/CELL),pz=Math.floor(z/CELL),col=columns.find((c)=>c.px===px&&c.pz===pz);
  if(!col||!col.spans.length)return null;
  const best=col.spans.reduce((b,s)=>Math.abs(s.drawnFloor-near)<Math.abs(b.drawnFloor-near)?s:b,col.spans[0]);
  return{floor:best.drawnFloor,source:best.source,ceil:best.drawnCeil};
}

// Every place a flight meets a floor: the radial line it starts or ends on.
// On the landing side, two millimetres past the line, there must be a walkable
// surface at the landing's height; anything else is a gap or a lip.
export function landingEdges(){
  const edges=[];
  RAD.forEach((f,index)=>{
    const prev=RAD[index-1],next=RAD[index+1];
    // A flight start that continues straight on from the previous flight's end
    // at the same bearing and height is a continuous helix, not a landing.
    const startJoins=prev&&Math.abs(prev.toH-f.fromH)<1e-6&&Math.abs(((prev.theta0+prev.sweep)-f.theta0)%(Math.PI*2))<1e-6;
    const endJoins=next&&Math.abs(next.fromH-f.toH)<1e-6&&Math.abs(((f.theta0+f.sweep)-next.theta0)%(Math.PI*2))<1e-6;
    if(!startJoins)edges.push({flight:f.id,end:'start',angle:f.theta0,height:f.fromH,landingSide:-Math.sign(f.sweep)});
    if(!endJoins)edges.push({flight:f.id,end:'finish',angle:f.theta0+f.sweep,height:f.toH,landingSide:Math.sign(f.sweep)});
  });
  return edges;
}
export function measureLandingSeams(bvh,columns,{samples=21,past=.002,tolerance=.001}={}){
  const out=[];
  for(const edge of landingEdges()){
    const rows=[];
    for(let k=0;k<samples;k++){
      const r=STAIR.innerRadiusM+(STAIR.outerRadiusM-STAIR.innerRadiusM)*(k+.5)/samples;
      // Step along the tangent, onto the landing side of the radial line.
      const a=edge.angle+edge.landingSide*past/r;
      const x=STAIR.center.x+Math.sin(a)*r,z=STAIR.center.z-Math.cos(a)*r;
      const mesh=meshUpSurfaceBelow(bvh,x,edge.height+.25,z,.5);
      const grid=gridFloorAt(columns,x,z,edge.height);
      // What a camera would see as the walking surface: the higher of the two,
      // since whichever is on top is the one drawn.
      const seen=[mesh,grid&&Math.abs(grid.floor-edge.height)<.5?grid.floor:null].filter((v)=>v!=null);
      const surface=seen.length?Math.max(...seen):null;
      rows.push({r,x,z,mesh,grid:grid?.floor??null,gridSource:grid?.source??null,
        error:surface==null?null:surface-edge.height});
    }
    const gaps=rows.filter((row)=>row.error==null).length,worst=Math.max(0,...rows.filter((row)=>row.error!=null).map((row)=>Math.abs(row.error)));
    out.push({...edge,gaps,worstM:worst,pass:gaps===0&&worst<=tolerance,rows});
  }
  return out;
}

// The camera's floor along each lane against the mesh tread under the same
// point, sampled the way the body actually moves: the logical position runs
// from one tread cell's origin to the next, logicalToPhysical turns it onto the
// helix, and renderedFloorAt says what height the eye is carried at. The last
// tread is left by its edge portal from its nose, so `along` stops at rises-1.
export function measureWalkingLines(bvh,{perTread=9}={}){
  const {plan}=compileConservatory(),runs=plan.stairRuns.filter((r)=>r.owner===STAIR_OWNER),out=[];
  for(const run of runs)for(let lane=0;lane<run.width;lane++){
    let worst=0,at=null,count=0,radius=null;
    // Standing still, the logical position is a tread cell's integer origin,
    // which puts the eye exactly on that tread's nose line. In motion it
    // crosses the tread's interior. The height comes from the logical position;
    // the mesh is read a hair forward of the eye, onto the tread being stood
    // on, because exactly on the nose line either tread is a right answer.
    const samples=[];
    for(let tread=0;tread<run.rises;tread++){
      samples.push({along:tread,nudge:.002});
      if(tread<run.rises-1)for(let k=0;k<perTread;k++)samples.push({along:tread+(k+.5)/perTread,nudge:0});
    }
    for(const {along,nudge} of samples){
      const lx=run.logical0[0]+run.logicalDx*along+run.logicalPx*lane,ly=run.logical0[1]+run.logicalDy*along+run.logicalPy*lane;
      const p=FP.logicalToPhysical(lx,ly),r=Math.hypot(p.x*CELL-STAIR.center.x,p.z*CELL-STAIR.center.z);
      const a=Math.atan2(p.x*CELL-STAIR.center.x,-(p.z*CELL-STAIR.center.z))+Math.sign(run.sweep)*nudge/r;
      const x=STAIR.center.x+Math.sin(a)*r,z=STAIR.center.z-Math.cos(a)*r;radius=r;
      const camera=FP.renderedFloorAt(lx,ly,p.x,p.z),mesh=meshUpSurfaceBelow(bvh,x,camera+.2,z,.6);count++;
      const err=mesh==null?Infinity:Math.abs(mesh-camera);
      if(err>worst){worst=err;at={along,x,z,camera,mesh};}
    }
    out.push({flight:run.flight,lane,radius,samples:count,worstM:worst,at});
  }
  return out;
}

// Weld by position; then edge valence, T-junctions, coplanar overlaps.
export function meshHygiene(tris,{weld=5e-5,planeTol=5e-4,angleTol=.5*Math.PI/180,areaTol=1e-6}={}){
  const key=(p)=>p.map((v)=>Math.round(v/weld)).join(',');
  const ids=new Map(),verts=[];
  const vid=(p)=>{const k=key(p);let i=ids.get(k);if(i==null){i=verts.length;ids.set(k,i);verts.push(p);}return i;};
  const faces=tris.map((t)=>[vid(t.a),vid(t.b),vid(t.c)]);
  const edges=new Map();
  faces.forEach((f,fi)=>{for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3];if(a===b)continue;const e=a<b?`${a},${b}`:`${b},${a}`;if(!edges.has(e))edges.set(e,[]);edges.get(e).push(fi);}});
  let boundary=0,nonManifold=0;const boundaryByMaterial={},nonManifoldByMaterial={};
  for(const [e,list] of edges){
    const m=tris[list[0]].material;
    if(list.length===1){boundary++;boundaryByMaterial[m]=(boundaryByMaterial[m]||0)+1;}
    else if(list.length>2){nonManifold++;nonManifoldByMaterial[m]=(nonManifoldByMaterial[m]||0)+1;}
  }
  // T-junctions: a welded vertex strictly inside a boundary edge. Interior
  // (two-face) edges cannot carry one without also being split, so only
  // boundary edges are searched, which is also where the cracks show.
  const G=.05,grid=new Map(),cellKey=(x,y,z)=>`${Math.floor(x/G)},${Math.floor(y/G)},${Math.floor(z/G)}`;
  verts.forEach((p,i)=>{const k=cellKey(...p);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
  let tJunctions=0;const tByMaterial={},tSamples=[];
  for(const [e,list] of edges){
    if(list.length!==1)continue;
    const [a,b]=e.split(',').map(Number),A=verts[a],B=verts[b],d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],len2=d[0]**2+d[1]**2+d[2]**2;if(len2<1e-12)continue;
    const lo=[0,1,2].map((k)=>Math.min(A[k],B[k])),hi=[0,1,2].map((k)=>Math.max(A[k],B[k]));
    for(let gx=Math.floor(lo[0]/G);gx<=Math.floor(hi[0]/G);gx++)for(let gy=Math.floor(lo[1]/G);gy<=Math.floor(hi[1]/G);gy++)for(let gz=Math.floor(lo[2]/G);gz<=Math.floor(hi[2]/G);gz++){
      for(const v of grid.get(`${gx},${gy},${gz}`)||[]){
        if(v===a||v===b)continue;const P=verts[v],t=((P[0]-A[0])*d[0]+(P[1]-A[1])*d[1]+(P[2]-A[2])*d[2])/len2;if(t<=1e-4||t>=1-1e-4)continue;
        const q=[A[0]+d[0]*t-P[0],A[1]+d[1]*t-P[1],A[2]+d[2]*t-P[2]];if(Math.hypot(...q)>weld*2)continue;
        tJunctions++;const m=tris[list[0]].material;tByMaterial[m]=(tByMaterial[m]||0)+1;if(tSamples.length<12)tSamples.push({at:P,edge:[A,B],material:m});
      }
    }
  }
  // Coplanar overlaps: bucket by plane, then clip pairs in the plane.
  const planeOf=(t)=>{const u=[t.b[0]-t.a[0],t.b[1]-t.a[1],t.b[2]-t.a[2]],v=[t.c[0]-t.a[0],t.c[1]-t.a[1],t.c[2]-t.a[2]];
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);if(l<1e-12)return null;const nn=n.map((x)=>x/l);
    return{n:nn,d:nn[0]*t.a[0]+nn[1]*t.a[1]+nn[2]*t.a[2],area:l/2};};
  const buckets=new Map(),planes=tris.map(planeOf);
  planes.forEach((p,i)=>{if(!p)return;const s=p.n[1]<-.5||(Math.abs(p.n[1])<=.5&&(p.n[0]<0||(p.n[0]===0&&p.n[2]<0)))?-1:1;
    const n=p.n.map((x)=>x*s),d=p.d*s,k=`${Math.round(n[0]*60)},${Math.round(n[1]*60)},${Math.round(n[2]*60)},${Math.round(d/.01)}`;
    if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);});
  let overlaps=0,overlapArea=0,contacts=0;const overlapByMaterial={},overlapSamples=[];
  const project=(t,n)=>{const ax=Math.abs(n[0])>Math.abs(n[1])?(Math.abs(n[0])>Math.abs(n[2])?0:2):(Math.abs(n[1])>Math.abs(n[2])?1:2);const k=[0,1,2].filter((q)=>q!==ax);return[t.a,t.b,t.c].map((p)=>[p[k[0]],p[k[1]]]);};
  for(const list of buckets.values()){
    if(list.length<2)continue;
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const A=tris[list[i]],B=tris[list[j]],pa=planes[list[i]],pb=planes[list[j]];
      const dot=Math.abs(pa.n[0]*pb.n[0]+pa.n[1]*pb.n[1]+pa.n[2]*pb.n[2]);if(dot<Math.cos(angleTol))continue;
      const dist=Math.abs(pa.n[0]*B.a[0]+pa.n[1]*B.a[1]+pa.n[2]*B.a[2]-pa.d);if(dist>planeTol)continue;
      const area=clipArea(project(A,pa.n),project(B,pa.n));
      if(area<=areaTol)continue;
      // Two faces in one plane pointing the same way fight for the same pixels.
      // Pointing opposite ways they are two solids in contact (a post on a
      // tread), which draws correctly and is only counted.
      const same=pa.n[0]*pb.n[0]+pa.n[1]*pb.n[1]+pa.n[2]*pb.n[2]>0,m=`${A.material}|${B.material}`;
      if(same){overlaps++;overlapArea+=area;overlapByMaterial[m]=(overlapByMaterial[m]||0)+1;if(overlapSamples.length<12)overlapSamples.push({a:A.a,material:m,area});}
      else{contacts++;}
    }
  }
  return{triangles:tris.length,vertices:verts.length,edges:edges.size,boundary,nonManifold,boundaryByMaterial,nonManifoldByMaterial,
    tJunctions,tByMaterial,tSamples,overlaps,overlapArea,overlapByMaterial,overlapSamples,contacts};
}
function clipArea(a,b){
  // Sutherland–Hodgman of triangle a against convex triangle b, both 2D.
  const orient=(p)=>(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
  const B=orient(b)<0?[b[0],b[2],b[1]]:b;let poly=a;
  for(let e=0;e<3&&poly.length;e++){
    const p=B[e],q=B[(e+1)%3],side=(v)=>(q[0]-p[0])*(v[1]-p[1])-(q[1]-p[1])*(v[0]-p[0]),next=[];
    for(let i=0;i<poly.length;i++){
      const cur=poly[i],prev=poly[(i+poly.length-1)%poly.length],sc=side(cur),sp=side(prev);
      if(sc>=-1e-12){if(sp<-1e-12)next.push(inter(prev,cur,sp,sc));next.push(cur);}else if(sp>=-1e-12)next.push(inter(prev,cur,sp,sc));
    }
    poly=next;
  }
  let area=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p[0]*q[1]-q[0]*p[1];}
  return Math.abs(area)/2;
}
function inter(p,q,sp,sq){const t=sp/(sp-sq);return[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];}

// Shading normals against the true surface they approximate. The stair shell
// is four analytic surfaces: horizontal treads, radial-plane risers, the inner
// and outer cylinders, and the helicoid soffit. A corner is classified by where
// it sits and which way its face points; rails and fittings are not judged.
export function measureShellNormals(tris){
  const C=STAIR.center,ri=STAIR.innerRadiusM,ro=STAIR.outerRadiusM,classes={};
  const flightAt=(angle,y)=>{
    // The flight whose helix passes nearest this point vertically.
    let best=null,bestD=Infinity;
    for(const f of RAD){
      for(const turn of[-1,0,1,2]){
        const t=(angle+turn*Math.PI*2-f.theta0)/f.sweep;if(t<-.02||t>1.02)continue;
        const h=f.fromH+(f.toH-f.fromH)*t,d=Math.abs(h-y);if(d<bestD){bestD=d;best={f,t};}
      }
    }
    return best;
  };
  const add=(name,deg)=>{const c=classes[name]||(classes[name]={count:0,max:0,over2:0,values:[]});c.count++;c.max=Math.max(c.max,deg);if(deg>2)c.over2++;c.values.push(deg);};
  for(const t of tris){
    if(t.material!=='warm terrazzo'&&t.material!=='cast concrete')continue;
    for(const [p,n] of[[t.a,t.na],[t.b,t.nb],[t.c,t.nc]]){
      const dx=p[0]-C.x,dz=p[2]-C.z,r=Math.hypot(dx,dz);if(r<ri-.01||r>ro+.01)continue;
      const radial=[dx/r,0,dz/r],angle=angleOf(p[0],p[2]);let expected=null,name=null;
      // A vertical face is a cylinder if it faces along the radius, a riser if
      // it faces along the tangent. Position alone cannot tell them apart: a
      // riser's corners sit on both cylinders.
      const fn=(()=>{const u=[t.b[0]-t.a[0],t.b[1]-t.a[1],t.b[2]-t.a[2]],v=[t.c[0]-t.a[0],t.c[1]-t.a[1],t.c[2]-t.a[2]],q=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...q)||1;return q.map((w)=>w/l);})();
      const along=Math.abs(fn[0]*radial[0]+fn[2]*radial[2]);
      if(fn[1]>.9){expected=[0,1,0];name='tread';}
      // Judged on the side the face points to: a landing's edge that stands
      // against the stair faces inward at the outer radius, and is right to.
      else if(Math.abs(fn[1])<.2&&along>.7&&Math.abs(r-ro)<.004){const sg=Math.sign(fn[0]*radial[0]+fn[2]*radial[2])||1;expected=radial.map((v)=>v*sg);name='outer cylinder';}
      else if(Math.abs(fn[1])<.2&&along>.7&&Math.abs(r-ri)<.004){const sg=Math.sign(fn[0]*radial[0]+fn[2]*radial[2])||-1;expected=radial.map((v)=>v*sg);name='inner cylinder';}
      else if(Math.abs(fn[1])<.2&&along<.3){expected=[Math.cos(angle),0,Math.sin(angle)];if(expected[0]*fn[0]+expected[2]*fn[2]<0)expected=expected.map((v)=>-v);name='riser';}
      else if(fn[1]<-.999){expected=[0,-1,0];name='slab soffit';}
      else if(fn[1]<-.2){
        const hit=flightAt(angle,p[1]);if(!hit)continue;
        // Soffit height h(θ) = a + kθ, so the surface (r sinθ, a+kθ, -r cosθ)
        // has normal ∝ ∂/∂r × ∂/∂θ; take the downward one.
        const k=(hit.f.toH-hit.f.fromH)/hit.f.sweep,s=Math.sin(angle),c=Math.cos(angle);
        const dr=[s,0,-c],dth=[r*c,k,r*s];
        let nn=[dr[1]*dth[2]-dr[2]*dth[1],dr[2]*dth[0]-dr[0]*dth[2],dr[0]*dth[1]-dr[1]*dth[0]];
        const l=Math.hypot(...nn);nn=nn.map((v)=>v/l);if(nn[1]>0)nn=nn.map((v)=>-v);expected=nn;name='soffit';
      }
      if(!expected)continue;
      const nl=Math.hypot(...n)||1,dot=Math.max(-1,Math.min(1,(n[0]*expected[0]+n[1]*expected[1]+n[2]*expected[2])/nl));
      add(name,Math.acos(dot)*180/Math.PI);
    }
  }
  for(const c of Object.values(classes)){c.values.sort((a,b)=>a-b);c.p95=c.values[Math.floor(c.values.length*.95)]||0;delete c.values;}
  return classes;
}

// Nosings belong on the front edge of the tread you step onto. A tread spans
// [start,end) of its flight's sweep at one height; its nose is the START edge
// going up (the line you step over), its heel the END edge against the next
// riser. Each brass strip is found by height and judged by its bearing.
export function measureNosings(tris){
  const brass=tris.filter((t)=>t.material==='aged brass'),out={treads:0,atNose:0,atHeel:0,missing:0,samples:[]};
  const bearing=(t)=>{const p=[t.a,t.b,t.c].reduce((s,q)=>[s[0]+q[0]/3,s[1]+q[1]/3,s[2]+q[2]/3],[0,0,0]);return{angle:angleOf(p[0],p[2]),r:Math.hypot(p[0]-STAIR.center.x,p[2]-STAIR.center.z),y:p[1]};};
  const strips=brass.map(bearing).filter((b)=>b.r>STAIR.innerRadiusM-.02&&b.r<STAIR.outerRadiusM+.02);
  const near=(a,b)=>{let d=Math.abs(a-b)%(Math.PI*2);return Math.min(d,Math.PI*2-d);};
  for(const f of RAD){
    const rise=(f.toH-f.fromH)/f.rises,da=f.sweep/f.rises;
    // Tread 0 is the floor or landing; the first real tread is index 1.
    for(let i=1;i<f.rises;i++){
      const y=f.fromH+rise*i,start=f.theta0+da*i,end=start+da;out.treads++;
      const here=strips.filter((b)=>Math.abs(b.y-y)<.03);
      const nose=here.some((b)=>near(b.angle,start)<Math.abs(da)*.15),heel=here.some((b)=>near(b.angle,end)<Math.abs(da)*.15);
      if(nose)out.atNose++;else if(heel){out.atHeel++;if(out.samples.length<4)out.samples.push({flight:f.id,tread:i,y});}else out.missing++;
    }
  }
  return out;
}

// Every walkable logical cell in the stair's volume against what is drawn under
// it: the eye stands at the cell's floor, so something must be drawn at that
// height under the cell's physical square, and nothing solid above it. This is
// walking for landings and halls, where the lane sampler does not reach.
// The eye stands at the cell's centre, so the footprint judged is a body's:
// the centre and four points 10 cm round it, not the whole half-metre square,
// whose corners may overhang the well while you stand on the landing.
const FOOTPRINT=[[0,0],[.1,0],[-.1,0],[0,.1],[0,-.1]];
export function measureStanding(bvh,columns,{bounds=STAIR_BOUNDS,tolerance=.01}={}){
  const {plan}=compileConservatory(),cells=[];
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const i=y*plan.w+x;if(plan.solid[i]||plan.collisionOnly?.[i])continue;
    const run=plan.flightId[i]?plan.stairRuns[plan.flightId[i]-1]:null;if(run?.analyticHelix)continue;
    const p=FP.logicalToPhysical(x,y),x0=p.x*CELL,z0=p.z*CELL;
    if(x0<bounds.x0||x0>bounds.x1||z0<bounds.z0||z0>bounds.z1)continue;
    const r=Math.hypot(x0+CELL/2-STAIR.center.x,z0+CELL/2-STAIR.center.z);
    if(r>STAIR.collisionOuterRadiusM+1.5)continue;
    const floor=plan.floor[i];let worst=0,kind='ok',seen=null;
    for(const [ox,oz] of FOOTPRINT){
      const px=x0+CELL/2+ox,pz=z0+CELL/2+oz;
      // A point that falls in a deliberate millimetre joint between two
      // solids is read again just past it.
      const mesh=meshUpSurfaceBelow(bvh,px,floor+.3,pz,.6)??meshUpSurfaceBelow(bvh,px+.003,floor+.3,pz+.003,.6);
      const col=gridColumnAt(columns,px,pz),grid=col?.spans.find((s)=>s.drawnFloor<=floor+.3&&s.drawnFloor>=floor-.3&&s.drawnCeil>=floor+2)||null;
      // Whichever surface is higher is the one drawn; that is what you stand on.
      const surface=Math.max(mesh??-Infinity,grid?.drawnFloor??-Infinity);
      if(!Number.isFinite(surface)){worst=Infinity;kind='nothing drawn';seen=null;continue;}
      // A room floor the grid draws at its eight-bit height is the building's
      // convention everywhere (0 m is drawn at +31 mm, 10 m at -55 mm). It is
      // reported, not counted as standing in the wrong place.
      const byGrid=!(mesh!=null&&mesh>=(grid?.drawnFloor??-Infinity));
      // A built landing is made at the drawn height for the same reason, so a
      // mesh surface there counts too.
      const err=Math.abs(surface-drawnHeight(floor))<=.001?0:surface-floor;
      if(Math.abs(err)>Math.abs(worst)&&Number.isFinite(worst)){worst=err;kind=err>0?'inside something':'floating';seen=byGrid?grid?.source:'mesh';}
    }
    if(Math.abs(worst)>tolerance)cells.push({x,y,physical:[+x0.toFixed(2),+z0.toFixed(2)],r:+r.toFixed(2),floor:+floor.toFixed(3),owner:plan.owner[i],kind,errM:Number.isFinite(worst)?+worst.toFixed(3):null,surface:seen,inWell:r<STAIR.innerRadiusM+.15});
  }
  return cells;
}
