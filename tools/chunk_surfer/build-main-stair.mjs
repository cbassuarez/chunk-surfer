// Build the grand open-well main stair as one deterministic, project-native
// hero mesh, from the contract in src/data/main-stair-geometry.js.
//
// Revision 4: the stair stands in a square stairwell where this mesh is the
// only thing drawn (the plan grid inside it is one column of air). So it builds
// everything there: two closed runs of curved treads with flush brass nosings
// and a helicoid soffit, both landings as slabs at the heights the plan grid
// draws, continuous oak rails eased through every change of pitch, the guards
// along the stairwell's open floor edges, and the two opal landing lights.
// Collision stays in the authored floorplan.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAIN_STAIR_GEOMETRY, mainStairBuiltLandings, mainStairGuards, offsetFromFlights, gridDrawnHeight } from '../../src/data/main-stair-geometry.js';

const ROOT=path.resolve(import.meta.dirname,'../..');
const OUT_DIR=path.join(ROOT,'public/assets');
const OUT=path.join(OUT_DIR,'conservatory-main-stair.glb');
const STATS=path.join(OUT_DIR,'conservatory-main-stair.stats.json');
const CREDITS=path.join(OUT_DIR,'conservatory-main-stair.credits.json');

const materials=[
  ['warm terrazzo',[.54,.50,.42,1],.04,.52],
  ['cast concrete',[.31,.32,.30,1],0,.88],
  ['blackened steel',[.055,.060,.058,1],.72,.34],
  ['aged brass',[.48,.29,.075,1],.86,.24],
  ['dark oak',[.16,.075,.035,1],.02,.48],
  ['opal glass',[.88,.84,.69,1],0,.18],
].map(([name,baseColorFactor,metallicFactor,roughnessFactor])=>({
  name,...(name==='opal glass'?{doubleSided:true}:{}),pbrMetallicRoughness:{baseColorFactor,metallicFactor,roughnessFactor},
}));
materials[5].emissiveFactor=[.52,.39,.21];
const MAT={terrazzo:0,concrete:1,steel:2,brass:3,oak:4,opal:5};
const meshes=new Map();
const mesh=(name)=>{const value={name,groups:new Map()};meshes.set(name,value);return value;};
const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],indices:[],uvs:[]});return m.groups.get(mat);};

function addBox(m,c,s,mat,yaw=0,pitch=0){
  const g=group(m,mat),base=g.positions.length/3,[cx,cy,cz]=c,[sx,sy,sz]=s,hx=sx/2,hy=sy/2,hz=sz/2;
  const cyaw=Math.cos(yaw),syaw=Math.sin(yaw),cpit=Math.cos(pitch),spit=Math.sin(pitch);
  const tilt=([x,y,z])=>[x,y*cpit-z*spit,y*spit+z*cpit];
  const rot=(v)=>{const[x,y,z]=tilt(v);return[cx+x*cyaw-z*syaw,cy+y,cz+x*syaw+z*cyaw];};
  const faces=[
    [[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],
    [[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
    [[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],
    [[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
    [[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],
    [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]],
  ];
  for(let f=0;f<faces.length;f++){
    const face=faces[f],n=tilt(face[4]),rn=[n[0]*cyaw-n[2]*syaw,n[1],n[0]*syaw+n[2]*cyaw];
    for(let i=0;i<4;i++){g.positions.push(...rot(face[i]));g.normals.push(...rn);}
    const o=base+f*4;g.indices.push(o,o+1,o+2,o,o+2,o+3);
  }
}

function addCylinder(m,c,r,h,mat,sides=8){
  const g=group(m,mat),base=g.positions.length/3,[cx,cy,cz]=c;
  for(let i=0;i<=sides;i++){
    const a=i/sides*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    g.positions.push(cx+x*r,cy-h/2,cz+z*r,cx+x*r,cy+h/2,cz+z*r);g.normals.push(x,0,z,x,0,z);
  }
  for(let i=0;i<sides;i++){const o=base+i*2;g.indices.push(o,o+3,o+2,o,o+1,o+3);}
  for(const top of[0,1]){
    const center=g.positions.length/3;g.positions.push(cx,cy+(top?1:-1)*h/2,cz);g.normals.push(0,top?1:-1,0);
    for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2,x=Math.cos(a),z=Math.sin(a);g.positions.push(cx+x*r,cy+(top?1:-1)*h/2,cz+z*r);g.normals.push(0,top?1:-1,0);}
    for(let i=0;i<sides;i++)top?g.indices.push(center,center+i+2,center+i+1):g.indices.push(center,center+i+1,center+i+2);
  }
}

function addBeam(m,a,b,w,mat){
  const v=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(...v)||1,u=v.map(q=>q/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
  let side=[u[1]*ref[2]-u[2]*ref[1],u[2]*ref[0]-u[0]*ref[2],u[0]*ref[1]-u[1]*ref[0]],sl=Math.hypot(...side)||1;side=side.map(q=>q/sl);
  const up=[side[1]*u[2]-side[2]*u[1],side[2]*u[0]-side[0]*u[2],side[0]*u[1]-side[1]*u[0]],c=a.map((q,i)=>(q+b[i])/2),g=group(m,mat);
  const corners=[];for(const du of[-1,1])for(const ds of[-1,1])for(const dt of[-1,1])corners.push(c.map((q,i)=>q+u[i]*du*len/2+side[i]*ds*w/2+up[i]*dt*w/2));
  for(const face of[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]){
    const base=g.positions.length/3,p=face.map(i=>corners[i]),aa=p[1].map((q,i)=>q-p[0][i]),bb=p[2].map((q,i)=>q-p[0][i]);
    const n=[aa[1]*bb[2]-aa[2]*bb[1],aa[2]*bb[0]-aa[0]*bb[2],aa[0]*bb[1]-aa[1]*bb[0]],nl=Math.hypot(...n)||1;
    for(const q of p){g.positions.push(...q);g.normals.push(...n.map(value=>value/nl));}g.indices.push(base,base+1,base+2,base,base+2,base+3);
  }
}

function addSphere(m,c,r,mat,rings=6,segments=12){
  const g=group(m,mat);
  const addVertex=(n,u,v)=>{const index=g.positions.length/3;g.positions.push(c[0]+n[0]*r,c[1]+n[1]*r,c[2]+n[2]*r);g.normals.push(...n);g.uvs.push(u,v);return index;};
  const top=addVertex([0,1,0],.5,1),rows=[];
  for(let y=1;y<rings;y++){
    const v=y/rings,phi=v*Math.PI,row=[];
    for(let x=0;x<segments;x++){
      const u=x/segments,theta=u*Math.PI*2,n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
      row.push(addVertex(n,u,1-v));
    }
    rows.push(row);
  }
  const bottom=addVertex([0,-1,0],.5,0),first=rows[0],last=rows.at(-1);
  for(let x=0;x<segments;x++){
    const nx=(x+1)%segments;
    g.indices.push(top,first[nx],first[x]);
    g.indices.push(bottom,last[x],last[nx]);
  }
  for(let y=0;y<rows.length-1;y++)for(let x=0;x<segments;x++){
    const nx=(x+1)%segments,a=rows[y][x],an=rows[y][nx],b=rows[y+1][x],bn=rows[y+1][nx];
    g.indices.push(a,an,b,an,bn,b);
  }
}

// A continuous swept profile, rather than a chain of overlapping square boxes.
// Shared rings give the oak a legible rounded grip and the iron continuous
// normals. Caps are explicit; opaque construction stays single sided.
function addProfiledSweep(points,halfWidth,halfHeight,mat,sides=6,radialFrame=false,scaleAt=()=>1){
  const g=group(m,mat),rows=[],normals=[];
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const d=b.map((v,k)=>v-a[k]),len=Math.hypot(...d)||1,t=d.map(v=>v/len);
    const sideLen=Math.hypot(t[0],t[2]);
    let side=sideLen>1e-7?[-t[2]/sideLen,0,t[0]/sideLen]:[1,0,0];
    if(radialFrame){
      const r=Math.hypot(points[i][0],points[i][2])||1,ref=[points[i][0]/r,0,points[i][2]/r];
      const dot=ref.reduce((v,q,k)=>v+q*t[k],0),v=ref.map((q,k)=>q-dot*t[k]),n=Math.hypot(...v)||1;
      side=v.map(q=>q/n);
    }
    const up=[t[1]*side[2]-t[2]*side[1],t[2]*side[0]-t[0]*side[2],t[0]*side[1]-t[1]*side[0]];
    const row=[],ns=[],scale=scaleAt(i),width=halfWidth*scale,height=halfHeight*scale;
    for(let j=0;j<sides;j++){
      const angle=j/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
      const p=points[i].map((v,k)=>v+side[k]*c*width+up[k]*s*height);
      const n=side.map((v,k)=>v*c/width+up[k]*s/height),nl=Math.hypot(...n)||1;
      row.push(g.positions.length/3);ns.push(n.map(v=>v/nl));g.positions.push(...p);g.normals.push(...ns.at(-1));
    }
    rows.push(row);normals.push(ns);
  }
  const triangle=(a,b,c,want)=>{
    const p=[a,b,c].map(i=>g.positions.slice(i*3,i*3+3)),n=normal(p[0],p[1],p[2]);
    if(n.reduce((v,q,k)=>v+q*want[k],0)<0)g.indices.push(a,c,b);else g.indices.push(a,b,c);
  };
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<sides;j++){
    const k=(j+1)%sides,want=normals[i][j].map((v,d)=>v+normals[i][k][d]+normals[i+1][j][d]+normals[i+1][k][d]);
    triangle(rows[i][j],rows[i+1][j],rows[i+1][k],want);
    triangle(rows[i][j],rows[i+1][k],rows[i][k],want);
  }
  for(const end of[0,points.length-1]){
    const neighbour=points[end===0?1:points.length-2],n=points[end].map((v,k)=>v-neighbour[k]),nl=Math.hypot(...n)||1,nn=n.map(v=>v/nl);
    const ci=g.positions.length/3;g.positions.push(...points[end]);g.normals.push(...nn);
    for(let j=0;j<sides;j++){
      const p=g.positions.slice(rows[end][j]*3,rows[end][j]*3+3),ni=g.positions.length/3;
      g.positions.push(...p);g.normals.push(...nn);
      const pj=g.positions.slice(rows[end][(j+1)%sides]*3,rows[end][(j+1)%sides]*3+3),nj=g.positions.length/3;
      g.positions.push(...pj);g.normals.push(...nn);triangle(ci,ni,nj,nn);
    }
  }
}

const STAIR=MAIN_STAIR_GEOMETRY;
const ORIGIN=STAIR.center;
const local=(x,y,z)=>[x-ORIGIN.x,y,z-ORIGIN.z];
const m=mesh('main_open_well_stair');

const CENTRE=STAIR.center,INNER=STAIR.innerRadiusM,OUTER=STAIR.outerRadiusM,DEG=Math.PI/180;
const RAIL=STAIR.handrailHeightM;
const point=(r,deg,y)=>local(CENTRE.x+Math.sin(deg*DEG)*r,y,CENTRE.z-Math.cos(deg*DEG)*r);
const normal=(a,b,c)=>{const u=b.map((q,i)=>q-a[i]),v=c.map((q,i)=>q-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],d=Math.hypot(...n)||1;return n.map(q=>q/d);};
const unit=(v)=>{const l=Math.hypot(...v)||1;return v.map((q)=>q/l);};

// One triangle with per-corner shading normals. The winding is set from the
// normals, so every face is front-facing on the side it is shaded for.
// Corners with the same position and normal share one vertex, so a smooth
// surface is one indexed sheet and the pack stays inside its byte budget.
const shared=new Map();
function sharedVertex(g,mat,p,n){
  const k=`${mat}|${p.map((v)=>Math.round(v*1e5)).join(',')}|${n.map((v)=>Math.round(v*1e4)).join(',')}`;
  let i=shared.get(k);
  if(i==null){i=g.positions.length/3;g.positions.push(...p);g.normals.push(...n);shared.set(k,i);}
  return i;
}
function shadedTri(mat,a,b,c,na,nb,nc){
  const g=group(m,mat),geo=normal(a,b,c),want=[0,1,2].map((k)=>na[k]+nb[k]+nc[k]);
  let p=[a,b,c],n=[na,nb,nc];
  if(geo[0]*want[0]+geo[1]*want[1]+geo[2]*want[2]<0){p=[a,c,b];n=[na,nc,nb];}
  g.indices.push(...p.map((q,i)=>sharedVertex(g,mat,q,n[i])));
}
const shadedQuad=(mat,a,b,c,d,na,nb,nc,nd)=>{shadedTri(mat,a,b,c,na,nb,nc);shadedTri(mat,a,c,d,na,nc,nd);};
const flat=(mat,pts,n)=>{for(let i=1;i<pts.length-1;i++)shadedTri(mat,pts[0],pts[i],pts[i+1],n,n,n);};
const UP=[0,1,0],DOWN=[0,-1,0];
const radialN=(deg,sign=1)=>[Math.sin(deg*DEG)*sign,0,-Math.cos(deg*DEG)*sign];
const tangentN=(deg,sign=1)=>[Math.cos(deg*DEG)*sign,0,Math.sin(deg*DEG)*sign];

// ── THE TWO RUNS ────────────────────────────────────────────────────────────
//
// Each pair of half-turns that meet end to end is one helix and one closed
// solid: a tread top with a flush brass nosing at its front edge, a riser up
// to the next, cylindrical sides, and a helicoid soffit parallel to the pitch
// line with the slab depth under every nose. Every face of the solid is built
// on one shared lattice (RADIAL rings by the tread's columns), so no vertex
// ever lands in the middle of a neighbour's edge.
const RADIAL=4,SLICES=5,NOSING=STAIR.nosingWidthM,SLAB=STAIR.slabDepthM;
const rings=Array.from({length:RADIAL+1},(_,j)=>INNER+(OUTER-INNER)*j/RADIAL);
function buildRun(flights){
  const treads=[];
  for(const f of flights){
    const rise=(f.toH-f.fromH)/f.rises,da=f.sweep/f.rises/DEG,a0=f.theta0/DEG;
    for(let i=0;i<f.rises;i++)treads.push({s:a0+da*i,e:a0+da*(i+1),h:f.fromH+rise*i,f});
  }
  const flightAt=(deg)=>flights.find((f)=>deg<=f.theta0/DEG+f.sweep/DEG+1e-9)||flights.at(-1);
  const soffit=(deg)=>{const f=flightAt(deg),rise=(f.toH-f.fromH)/f.rises,da=f.sweep/f.rises/DEG;return f.fromH+(deg-f.theta0/DEG)/da*rise-rise-SLAB;};
  const soffitN=(r,deg)=>{
    // S(r,θ) = (r sinθ, soffit(θ), -r cosθ); n = ∂S/∂r × ∂S/∂θ, downward.
    const f=flightAt(deg),k=(f.toH-f.fromH)/f.sweep,s=Math.sin(deg*DEG),c=Math.cos(deg*DEG);
    const dr=[s,0,-c],dt=[r*c,k,r*s],n=unit([dr[1]*dt[2]-dr[2]*dt[1],dr[2]*dt[0]-dr[0]*dt[2],dr[0]*dt[1]-dr[1]*dt[0]]);
    return n[1]>0?n.map((v)=>-v):n;
  };
  // Column bearings for tread t on ring j: its nose line, the back of the
  // nosing strip (a constant 40 mm of arc on every ring), then SLICES columns
  // to its heel.
  const cols=(t,j)=>{const b=t.s+NOSING/rings[j]/DEG;return[t.s,...Array.from({length:SLICES+1},(_,i)=>b+(t.e-b)*i/SLICES)];};
  treads.forEach((t,k)=>{
    const prev=treads[k-1];
    for(let j=0;j<RADIAL;j++){
      const ca=cols(t,j),cb=cols(t,j+1);
      // Nosing, then the tread.
      flat(MAT.brass,[point(rings[j],ca[0],t.h),point(rings[j],ca[1],t.h),point(rings[j+1],cb[1],t.h),point(rings[j+1],cb[0],t.h)].reverse(),UP);
      for(let i=1;i<=SLICES;i++)flat(MAT.terrazzo,[point(rings[j],ca[i],t.h),point(rings[j],ca[i+1],t.h),point(rings[j+1],cb[i+1],t.h),point(rings[j+1],cb[i],t.h)].reverse(),UP);
      // Soffit, on the same columns, with the helicoid's own normals.
      for(let i=0;i<=SLICES;i++){
        const q=[[rings[j],ca[i]],[rings[j],ca[i+1]],[rings[j+1],cb[i+1]],[rings[j+1],cb[i]]];
        shadedQuad(MAT.concrete,...q.map(([r,d])=>point(r,d,soffit(d))),...q.map(([r,d])=>soffitN(r,d)));
      }
      // The riser up from the previous tread, and the run's start and end caps.
      if(prev)flat(MAT.concrete,[point(rings[j],t.s,prev.h),point(rings[j+1],t.s,prev.h),point(rings[j+1],t.s,t.h),point(rings[j],t.s,t.h)],tangentN(t.s,-1));
      else flat(MAT.concrete,[point(rings[j],t.s,soffit(t.s)),point(rings[j+1],t.s,soffit(t.s)),point(rings[j+1],t.s,t.h),point(rings[j],t.s,t.h)],tangentN(t.s,-1));
      if(k===treads.length-1)flat(MAT.concrete,[point(rings[j],t.e,soffit(t.e)),point(rings[j+1],t.e,soffit(t.e)),point(rings[j+1],t.e,t.h),point(rings[j],t.e,t.h)],tangentN(t.e,1));
    }
    // The two cylindrical sides. The first column carries the previous tread's
    // height as a third vertex, where that tread's side and this riser meet.
    for(const [j,sign] of[[0,-1],[RADIAL,1]]){
      const r=rings[j],c=cols(t,j);
      for(let i=0;i<=SLICES;i++){
        const B0=point(r,c[i],soffit(c[i])),B1=point(r,c[i+1],soffit(c[i+1])),T0=point(r,c[i],t.h),T1=point(r,c[i+1],t.h);
        const n0=radialN(c[i],sign),n1=radialN(c[i+1],sign);
        if(i===0&&prev){const M0=point(r,c[0],prev.h);
          shadedTri(MAT.concrete,B0,B1,T1,n0,n1,n1);shadedTri(MAT.concrete,B0,T1,M0,n0,n1,n0);shadedTri(MAT.concrete,M0,T1,T0,n0,n1,n0);}
        else shadedQuad(MAT.concrete,B0,B1,T1,T0,n0,n1,n1,n0);
      }
    }
  });
  return{treads,soffit};
}
const lowerRun=buildRun(STAIR.flights.slice(0,2)),upperRun=buildRun(STAIR.flights.slice(2,4));
const allTreads=[...lowerRun.treads,...upperRun.treads];
// The walking surface under a bearing on ONE run: the two runs share bearings
// from 100° to 360°, so a run has to be named.
const surfaceAt=(treads,deg)=>{const t=treads.find((q)=>deg>=q.s-1e-9&&deg<q.e-1e-9);return t?t.h:null;};

// ── THE LANDINGS ────────────────────────────────────────────────────────────
//
// Slabs made from the contract's outlines at the height the plan grid draws
// that floor, so they meet the halls flush. Where a slab stands against a
// flight it keeps a millimetre back, so the slab and the run each stay their
// own closed solid instead of sharing an edge between four faces.
const LANDINGS=mainStairBuiltLandings(),GAP=.001;
const polarOf=([x,z])=>{let a=Math.atan2(x-CENTRE.x,-(z-CENTRE.z))/DEG;if(a<0)a+=360;return{r:Math.hypot(x-CENTRE.x,z-CENTRE.z),a};};
function slabOutline(landing){
  let out=offsetFromFlights(landing.slab,landing.flightEdges,GAP);
  out=out.filter((p,i)=>Math.hypot(p[0]-out[(i+out.length-1)%out.length][0],p[1]-out[(i+out.length-1)%out.length][1])>1e-9);
  // Drop vertices that lie on a straight run between their neighbours, one at
  // a time so a removal never changes the test for the next.
  for(let changed=true;changed;){
    changed=false;
    for(let i=0;i<out.length;i++){
      const a=out[(i+out.length-1)%out.length],p=out[i],b=out[(i+1)%out.length];
      if(Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-10){out.splice(i,1);changed=true;break;}
    }
  }
  return out;
}
function earClip(poly){
  const area=poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  const idx=poly.map((_,i)=>i);if(area<0)idx.reverse();
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),out=[];
  const inside=(p,a,b,c)=>cross(a,b,p)>=-1e-12&&cross(b,c,p)>=-1e-12&&cross(c,a,p)>=-1e-12;
  let guard=0;
  while(idx.length>3&&guard++<100000){
    let clipped=false;
    for(let i=0;i<idx.length;i++){
      const ia=idx[(i+idx.length-1)%idx.length],ib=idx[i],ic=idx[(i+1)%idx.length];
      if(cross(poly[ia],poly[ib],poly[ic])<=1e-12)continue;
      if(idx.some((j)=>j!==ia&&j!==ib&&j!==ic&&inside(poly[j],poly[ia],poly[ib],poly[ic])))continue;
      out.push([ia,ib,ic]);idx.splice(i,1);clipped=true;break;
    }
    if(!clipped)throw new Error('landing outline could not be triangulated');
  }
  out.push([...idx]);
  return out;
}
for(const landing of LANDINGS){
  const outline=slabOutline(landing),top=landing.drawnHeight,bottom=top-STAIR.landingSlabDepthM;
  for(const [a,b,c] of earClip(outline)){
    flat(MAT.terrazzo,[local(outline[a][0],top,outline[a][1]),local(outline[b][0],top,outline[b][1]),local(outline[c][0],top,outline[c][1])],UP);
    flat(MAT.concrete,[local(outline[a][0],bottom,outline[a][1]),local(outline[c][0],bottom,outline[c][1]),local(outline[b][0],bottom,outline[b][1])],DOWN);
  }
  const area=outline.reduce((s,p,i)=>{const q=outline[(i+1)%outline.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  for(let i=0;i<outline.length;i++){
    const p=outline[i],q=outline[(i+1)%outline.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz)||1;
    const out=area>0?[dz/len,0,-dx/len]:[-dz/len,0,dx/len];
    // The edge on the open well is a cylinder: shade it as one.
    const onWell=Math.abs(polarOf(p).r-INNER)<1e-6&&Math.abs(polarOf(q).r-INNER)<1e-6;
    const np=onWell?radialN(polarOf(p).a,-1):out,nq=onWell?radialN(polarOf(q).a,-1):out;
    shadedQuad(MAT.concrete,local(p[0],bottom,p[1]),local(q[0],bottom,q[1]),local(q[0],top,q[1]),local(p[0],top,p[1]),np,nq,nq,np);
  }
}

// The curtail is a rounded enlargement of the existing bottom tread, not an
// extra riser. It stays outside the 2.65 m walking ribbon, within the existing
// 3 m collision envelope. Like the landings its finish meets the grid's DRAWN
// ground (+31 mm); no navigation height, first rise or approach is changed.
// The one-millimetre seam keeps the extension and original run closed solids.
const cubic=(a,b,c,d,n=18)=>Array.from({length:n+1},(_,i)=>{
  const t=i/n,u=1-t;return a.map((v,k)=>u*u*u*v+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]);
});
const firstTread=lowerRun.treads[0],curtailTop=gridDrawnHeight(firstTread.h),curtailBottom=curtailTop-STAIR.slabDepthM;
const curtailInnerR=OUTER+.001;
const planAt=(r,a)=>[Math.sin(a*DEG)*r,-Math.cos(a*DEG)*r];
const ca=planAt(curtailInnerR,firstTread.s),cb=planAt(curtailInnerR,firstTread.e);
const curtailShoulder=planAt(2.77,firstTread.e);
const curtailHeelOuter=planAt(2.77,-5),curtailHeelInner=planAt(curtailInnerR,-5);
const curtailOutline=[
  ...Array.from({length:13},(_,i)=>planAt(curtailInnerR,firstTread.s+(firstTread.e-firstTread.s)*i/12)),
  curtailShoulder,
  ...cubic(curtailShoulder,[.67,-2.78],[.60,-2.82],[.48,-2.84]).slice(1),
  ...cubic([.48,-2.84],[.25,-3.00],[-.30,-3.01],[-.38,-2.87],24).slice(1),
  ...cubic([-.38,-2.87],[-.53,-2.78],[-.43,-2.72],curtailHeelOuter).slice(1),
  curtailHeelInner,
  ...Array.from({length:9},(_,i)=>planAt(curtailInnerR,-5+5*i/8)).slice(1,-1),
];
for(const [a,b,c] of earClip(curtailOutline)){
  flat(MAT.terrazzo,[a,b,c].map(i=>[curtailOutline[i][0],curtailTop,curtailOutline[i][1]]),UP);
  flat(MAT.concrete,[c,b,a].map(i=>[curtailOutline[i][0],curtailBottom,curtailOutline[i][1]]),DOWN);
}
const curtailArea=curtailOutline.reduce((s,p,i)=>{const q=curtailOutline[(i+1)%curtailOutline.length];return s+p[0]*q[1]-q[0]*p[1];},0);
for(let i=0;i<curtailOutline.length;i++){
  const p=curtailOutline[i],q=curtailOutline[(i+1)%curtailOutline.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz),sign=curtailArea>0?1:-1;
  const n=[dz/len*sign,0,-dx/len*sign];
  shadedQuad(MAT.concrete,[p[0],curtailBottom,p[1]],[q[0],curtailBottom,q[1]],[q[0],curtailTop,q[1]],[p[0],curtailTop,p[1]],n,n,n,n);
}

// ── RAILS ───────────────────────────────────────────────────────────────────
//
// A handrail is a line one metre over the pitch line on a flight and over the
// floor on a landing. The inner rail runs unbroken from the foot to the top,
// round the well across both landings; the outer rails run the length of each
// pair of half-turns. Every change of pitch is eased over 0.3 m either side.
const RAIL_INSET=.05,POST_STEP=STAIR.balusterMaximumClearGapM+.028;
function railPath(r,segments){
  const step=.12/r/DEG,pts=[];
  for(const seg of segments)for(let a=seg.from;a<=seg.to+1e-9;a+=step){
    const at=Math.min(a,seg.to);if(pts.length&&Math.abs(pts.at(-1).a-at)<1e-9)continue;
    pts.push({a:at,h:seg.rail(at),floor:seg.floor(at)});
  }
  const win=Math.round(.3/.12);
  return pts.map((p,i)=>{let s=0,n=0;for(let k=Math.max(0,i-win);k<=Math.min(pts.length-1,i+win);k++){s+=pts[k].h;n++;}return{...p,h:s/n};});
}
const noseRail=(f)=>(a)=>{const rise=(f.toH-f.fromH)/f.rises,da=f.sweep/f.rises/DEG;return f.fromH+(a-f.theta0/DEG)/da*rise+RAIL;};
const F=STAIR.flights,upperH=LANDINGS[0].drawnHeight,topH=LANDINGS[1].drawnHeight;
const runSeg=(fs,treads)=>fs.map((f)=>({from:f.theta0/DEG,to:(f.theta0+f.sweep)/DEG,rail:noseRail(f),floor:(a)=>surfaceAt(treads,a)}));
const f4Arrive=(F[3].theta0+F[3].sweep)/DEG;
const innerRail=railPath(INNER+RAIL_INSET,[
  ...runSeg(F.slice(0,2),lowerRun.treads),
  {from:360,to:360+F[2].theta0/DEG,rail:()=>upperH+RAIL,floor:()=>upperH},
  ...runSeg(F.slice(2,4),upperRun.treads).map((s)=>({...s,from:s.from+360,to:s.to+360,rail:(a)=>s.rail(a-360),floor:(a)=>s.floor(a-360)})),
  {from:f4Arrive+360,to:F[3].theta0/DEG+720,rail:()=>topH+RAIL,floor:()=>topH},
]);
const outerRails=[railPath(OUTER-RAIL_INSET,runSeg(F.slice(0,2),lowerRun.treads)),railPath(OUTER-RAIL_INSET,runSeg(F.slice(2,4),upperRun.treads))];
// A real plan volute: one inward coil, a rising neck, then the SAME swept oak
// handrail. There is no capped joint or disconnected ornament at the first
// newel. The coil occupies the unused outside strip; only its neck returns to
// the existing rail line. Two subordinate iron supports stand on the curtail.
const voluteRailStart=point(OUTER-RAIL_INSET,outerRails[0][0].a,outerRails[0][0].h);
const voluteCenter=[-.27,-2.81],voluteTurns=1.15,voluteCoil=[];
for(let i=0;i<=72;i++){
  const t=i/72,a=Math.PI/2+(1-t)*Math.PI*2*voluteTurns,r=.022+(.11-.022)*t;
  voluteCoil.push([voluteCenter[0]+Math.cos(a)*r,voluteRailStart[1]-.075*(1-t),voluteCenter[1]+Math.sin(a)*r]);
}
const voluteTail=voluteCoil.at(-1),voluteNeck=cubic(voluteTail,[voluteTail[0]+.13,voluteTail[1],voluteTail[2]],
  [voluteRailStart[0]-.08,voluteRailStart[1]-.006,voluteRailStart[2]-.002],voluteRailStart,14);
const volutePath=[...voluteCoil,...voluteNeck.slice(1,-1)];
const scrollPanels=[];
function buildRail(r,path,{volute=false,scrolls=false}={}){
  const at=(p,dy=0)=>point(r,p.a,p.h+dy);
  const oakPath=[...(volute?volutePath:[]),...path.map((p)=>at(p))];
  addProfiledSweep(oakPath,.048,.033,MAT.oak,8,false,i=>volute&&i<voluteCoil.length?.34+.66*i/(voluteCoil.length-1):1);
  addProfiledSweep(path.map((p)=>at(p,-.23)),.014,.018,MAT.steel,4);
  // Balusters at equal physical spacing, never on a riser line.
  let run=0;const posts=[];
  for(let i=1;i<path.length;i++){
    run+=.12;if(run<POST_STEP-1e-9)continue;
    const p=path[i];let a=p.a%360;const riser=allTreads.some((t)=>Math.abs((t.s%360)-a)*DEG*r<.02);
    if(riser)continue;run=0;
    const floor=p.floor;if(floor==null)continue;
    if(!clearOfNewels(point(r,p.a,0),floor))continue;
    const topY=p.h-.03;addCylinder(m,point(r,p.a,(floor+topY)/2),.014,topY-floor,MAT.steel,6);posts.push(p);
  }
  // Paired C-scrolls form occasional iron panels BETWEEN existing balusters.
  // Their ends meet those balusters; they carry no added gold or loose props.
  if(scrolls)for(let i=1;i<posts.length-1;i+=5){
    const a=posts[i],b=posts[i+1];if((b.a-a.a)*DEG*r>.32)continue;
    for(const side of[0,1]){
      const p=side?b:a,other=side?a:b,base=p.floor;
      const pts=cubic([p.a,base+.22],[p.a+(other.a-p.a)*.90,base+.24],
        [p.a+(other.a-p.a)*.90,base+.66],[p.a,base+.68],16)
        .map(([angle,y])=>point(r,angle,y));
      addProfiledSweep(pts,.008,.008,MAT.steel,4,true);scrollPanels.push({side,fromA:a.a,toA:b.a,floor:base});
    }
  }
}
// Newels where a rail starts or stops: never two in one place. Balusters and
// guard posts keep clear of them, so no two posts share a footing.
const newels=[];
const newel=(r,a,floor)=>{
  const p=point(r,a,0);newels.push({x:p[0],z:p[2],floor});
  // A continuous turned oak post with two inset bronze collars. Its foot has
  // the same 140 mm diameter and centre as the previous steel newel.
  const profile=[[0,.07],[.11,.07],[.14,.07],[.17,.056],[.24,.048],[.31,.060],[.36,.052],[.77,.052],[.82,.065],[.86,.065],[.89,.053],[.98,.053],[1.06,.070]];
  const sides=12;
  for(let i=0;i<profile.length-1;i++){
    const [h0,r0]=profile[i],[h1,r1]=profile[i+1],slope=(r1-r0)/(h1-h0),mat=i===1||i===8?MAT.brass:MAT.oak;
    for(let j=0;j<sides;j++){
      const a0=j/sides*Math.PI*2,a1=(j+1)/sides*Math.PI*2;
      const pos=(rad,h,angle)=>[p[0]+Math.cos(angle)*rad,floor+h,p[2]+Math.sin(angle)*rad];
      const norm=(angle)=>unit([Math.cos(angle),-slope,Math.sin(angle)]),n0=norm(a0),n1=norm(a1);
      shadedQuad(mat,pos(r0,h0,a0),pos(r0,h0,a1),pos(r1,h1,a1),pos(r1,h1,a0),n0,n1,n1,n0);
    }
  }
  for(const [row,n] of[[profile[0],DOWN],[profile.at(-1),UP]]){
    const [h,rad]=row,center=[p[0],floor+h,p[2]];
    for(let j=0;j<sides;j++)flat(MAT.oak,[center,[p[0]+Math.cos(j/sides*Math.PI*2)*rad,floor+h,p[2]+Math.sin(j/sides*Math.PI*2)*rad],
      [p[0]+Math.cos((j+1)/sides*Math.PI*2)*rad,floor+h,p[2]+Math.sin((j+1)/sides*Math.PI*2)*rad]],n);
  }
  addSphere(m,point(r,a,floor+1.12),.075,MAT.brass,6,12);
};
const clearOfNewels=(p,floor)=>newels.every((n)=>Math.abs(n.floor-floor)>.05||Math.hypot(n.x-p[0],n.z-p[2])>.12);
newel(INNER+RAIL_INSET,0,0);newel(OUTER-RAIL_INSET,0,0);
newel(OUTER-RAIL_INSET,360,upperH);newel(OUTER-RAIL_INSET,F[2].theta0/DEG,upperH);
newel(OUTER-RAIL_INSET,f4Arrive,topH);newel(INNER+RAIL_INSET,F[3].theta0/DEG,topH);
buildRail(INNER+RAIL_INSET,innerRail);
outerRails.forEach((path,i)=>buildRail(OUTER-RAIL_INSET,path,{volute:i===0,scrolls:true}));
const voluteSupports=[];
for(const i of[30,56]){
  const p=voluteCoil[i],t=unit(volutePath[i+1].map((v,k)=>v-volutePath[i-1][k]));
  const scale=.34+.66*i/(voluteCoil.length-1),top=p[1]-.033*scale*Math.hypot(t[0],t[2])+.002;
  addCylinder(m,[p[0],(curtailTop+top)/2,p[2]],.014,top-curtailTop,MAT.steel,6);
  voluteSupports.push({x:p[0],z:p[2],bottom:curtailTop,top});
}

// ── GUARDS ──────────────────────────────────────────────────────────────────
//
// Along every floor edge that meets the stairwell's void. Each runs three
// centimetres onto the floor it guards, so its posts stand on something.
const W=STAIR.stairwell;
const inPolygon=([x,z],poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};
const onFloor=([x,z],height)=>{
  const slab=LANDINGS.find((l)=>Math.abs(l.drawnHeight-height)<1e-6);
  return(slab&&inPolygon([x,z],slab.slab))||x<W.x0||x>W.x1||z<W.z0||z>W.z1;
};
for(const guard of mainStairGuards()){
  const pts=[],corners=[];
  for(let i=0;i<guard.path.length-1;i++){
    const a=guard.path[i],b=guard.path[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    let n=[-dz/len,dx/len];const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(!onFloor([mid[0]+n[0]*.03,mid[1]+n[1]*.03],guard.height))n=n.map((v)=>-v);
    const count=Math.max(1,Math.ceil(len/POST_STEP));
    for(let k=0;k<=count;k++){if(k===0&&i>0)continue;const t=k/count;pts.push([a[0]+dx*t+n[0]*.03,a[1]+dz*t+n[1]*.03]);}
    if(i===0)corners.push([a[0]+n[0]*.03,a[1]+n[1]*.03]);corners.push([b[0]+n[0]*.03,b[1]+n[1]*.03]);
  }
  addProfiledSweep(corners.map(([x,z])=>local(x,guard.height+RAIL,z)),.048,.033,MAT.oak,8);
  addProfiledSweep(corners.map(([x,z])=>local(x,guard.height+.1,z)),.02,.02,MAT.steel,4);
  pts.forEach(([x,z],i)=>{
    if(!clearOfNewels(local(x,0,z),guard.height))return;
    if(i===0||i===pts.length-1){addCylinder(m,local(x,guard.height+.5,z),.035,1,MAT.steel,8);return;}
    addCylinder(m,local(x,guard.height+.5-.015,z),.014,.97,MAT.steel,6);
  });
}

// Restrained landing lights sit outside the well instead of plugging its view.
for(const [y,z] of[[8.85,36],[13.25,35.5]]){
  addCylinder(m,local(66.4,y+.68,z),.025,1.36,MAT.brass,8);
  addSphere(m,local(66.4,y,z),.24,MAT.opal,8,16);
  addCylinder(m,local(66.4,y-.27,z),.10,.08,MAT.brass,10);
}

const chunks=[];let byteOffset=0;const bufferViews=[],accessors=[],gltfMeshes=[];
const pad4=(n)=>(n+3)&~3;
function append(typed,target){const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),start=byteOffset;chunks.push(bytes);byteOffset+=bytes.length;const pad=pad4(byteOffset)-byteOffset;if(pad){chunks.push(Buffer.alloc(pad));byteOffset+=pad;}const index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:start,byteLength:bytes.length,target});return index;}
function bounds(values){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],values[i+k]);hi[k]=Math.max(hi[k],values[i+k]);}return[lo,hi];}
function accessor(view,componentType,count,type,min,max){const value={bufferView:view,componentType,count,type};if(min)value.min=min;if(max)value.max=max;const index=accessors.length;accessors.push(value);return index;}
for(const value of meshes.values()){
  const primitives=[];
  for(const [mat,g] of value.groups){
    const p=new Float32Array(g.positions),n=new Float32Array(g.normals),uv=new Float32Array(g.uvs.length===p.length/3*2?g.uvs:p.length/3*2),ix=new Uint32Array(g.indices),[min,max]=bounds(p);
    primitives.push({attributes:{POSITION:accessor(append(p,34962),5126,p.length/3,'VEC3',min,max),NORMAL:accessor(append(n,34962),5126,n.length/3,'VEC3'),TEXCOORD_0:accessor(append(uv,34962),5126,uv.length/2,'VEC2')},indices:accessor(append(ix,34963),5125,ix.length,'SCALAR',[0],[p.length/3-1]),material:mat,mode:4});
  }
  gltfMeshes.push({name:value.name,primitives});
}
const nodes=gltfMeshes.map((value,index)=>({name:value.name,mesh:index})),bin=Buffer.concat(chunks,byteOffset);
const gltf={asset:{version:'2.0',generator:'chunk-surfer build-main-stair.mjs'},scene:0,scenes:[{nodes:nodes.map((_,index)=>index)}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews,buffers:[{byteLength:bin.length}]};
const jsonRaw=Buffer.from(JSON.stringify(gltf)),json=Buffer.concat([jsonRaw,Buffer.alloc(pad4(jsonRaw.length)-jsonRaw.length,0x20)]);
const total=12+8+json.length+8+bin.length,head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(OUT,Buffer.concat([head,jh,json,bh,bin]));

let triangles=0,vertices=0;const[lo,hi]=bounds([...m.groups.values()].flatMap(g=>g.positions));
for(const g of m.groups.values()){triangles+=g.indices.length/3;vertices+=g.positions.length/3;}
const stats={generatedAt:new Date().toISOString(),bytes:total,totalTriangles:triangles,design:{
  geometryRevision:STAIR.revision,finishRevision:3,curvilinear:true,navigationMode:'analytic-helix',
  halfTurnFlights:STAIR.flights.length,flightWidthM:STAIR.widthM,openWellWidthM:STAIR.innerRadiusM*2,
  lowerRisers:STAIR.flights[0].rises+STAIR.flights[1].rises,upperRisers:STAIR.flights[2].rises+STAIR.flights[3].rises,
  goingM:STAIR.goingM,handrailHeightM:STAIR.handrailHeightM,maximumBalusterClearGapM:STAIR.balusterMaximumClearGapM,
  minimumSoffitDepthM:STAIR.slabDepthM,profiledOakRails:true,physicalBalusterSpacing:true,continuousInnerRail:true,
  nosings:{placement:'front edge, flush',widthM:STAIR.nosingWidthM},
  stairwell:{...STAIR.stairwell},
  builtLandings:LANDINGS.map((l)=>({id:l.id,floorM:l.height,drawnM:+l.drawnHeight.toFixed(4),slabDepthM:STAIR.landingSlabDepthM})),
  guards:mainStairGuards().map((g)=>g.id),
  joinery:{
    style:'restrained bourgeois oak, bronze collars and iron scroll panels',
    curtail:{firstTreadHeightM:firstTread.h,drawnCapHeightM:curtailTop,slabDepthM:STAIR.slabDepthM,outline:curtailOutline,walkingOuterRadiusM:OUTER,maximumRadiusM:Math.max(...curtailOutline.map(p=>Math.hypot(...p)))},
    volute:{turns:voluteTurns,tipProfileScale:.34,coil:voluteCoil,neck:voluteNeck,railJoin:voluteRailStart,supports:voluteSupports,continuousSweep:true},
    newels:newels.map(n=>({...n,maximumFootRadiusM:.07,finish:'turned oak with bronze collars'})),
    scrollPanels:scrollPanels.length,
    caracole:'existing open-well winding helix, emphasised by its continuous inner oak rail',
  },
  coplanarFinishPrisms:0,doubleSidedOpaqueMaterials:0,floor1Aim:[STAIR.floor1Aim.x,STAIR.floor1Aim.z]},
  meshes:{main_open_well_stair:{triangles,vertices,bounds:{min:lo,max:hi}}}};
fs.writeFileSync(STATS,JSON.stringify(stats,null,2)+'\n');
const sha256=crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const credits={pack:{filename:path.basename(OUT),author:'Chunk Surfer project',source:'tools/chunk_surfer/build-main-stair.mjs',license:'project source',sha256,triangles,bytes:total,modifications:'Project-native deterministic geometry; metres, Y-up, centred on the physical main stair hall.'},meshes:[{name:'main_open_well_stair',bounds:{min:lo,max:hi},triangles,provenance:{source:'tools/chunk_surfer/build-main-stair.mjs',origin:'project-native procedural geometry',license:'project source'}}]};
fs.writeFileSync(CREDITS,JSON.stringify(credits,null,2)+'\n');
console.log(`wrote ${path.relative(ROOT,OUT)} (${total} bytes, ${triangles} triangles)`);
