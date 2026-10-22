// Build the grand open-well main stair as one deterministic, project-native
// hero mesh. Collision stays in the authored floorplan; this pack supplies the
// construction a half-metre height field cannot express: real 280mm treads,
// slab/stringer depth, nosings, balustrades, oak rails and opal fittings.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAIN_STAIR_GEOMETRY } from '../../src/data/main-stair-geometry.js';

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
function addProfiledSweep(points,halfWidth,halfHeight,mat,sides=6,radialFrame=false){
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
    const row=[],ns=[];
    for(let j=0;j<sides;j++){
      const angle=j/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
      const p=points[i].map((v,k)=>v+side[k]*c*halfWidth+up[k]*s*halfHeight);
      const n=side.map((v,k)=>v*c/halfWidth+up[k]*s/halfHeight),nl=Math.hypot(...n)||1;
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

const CENTRE=STAIR.center,INNER=STAIR.innerRadiusM,OUTER=STAIR.outerRadiusM;
const point=(r,a,y)=>local(CENTRE.x+Math.sin(a)*r,y,CENTRE.z-Math.cos(a)*r);
const normal=(a,b,c)=>{const u=b.map((q,i)=>q-a[i]),v=c.map((q,i)=>q-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],d=Math.hypot(...n)||1;return n.map(q=>q/d);};
function addQuad(points,mat,want=null){
  const p=[...points],n=normal(p[0],p[1],p[2]);
  if(want&&n[0]*want[0]+n[1]*want[1]+n[2]*want[2]<0){p.reverse();n.splice(0,3,...normal(p[0],p[1],p[2]));}
  const g=group(m,mat),base=g.positions.length/3;for(const q of p){g.positions.push(...q);g.normals.push(...n);}g.indices.push(base,base+1,base+2,base,base+2,base+3);
}
function addTri(points,mat,want=null){
  const p=[...points],n=normal(p[0],p[1],p[2]);
  if(want&&n[0]*want[0]+n[1]*want[1]+n[2]*want[2]<0){p.reverse();n.splice(0,3,...normal(p[0],p[1],p[2]));}
  const g=group(m,mat),base=g.positions.length/3;for(const q of p){g.positions.push(...q);g.normals.push(...n);}g.indices.push(base,base+1,base+2);
}
// A flight is one stepped shell: terrazzo owns only the upward tread faces;
// concrete owns risers, side faces and a continuous sloping soffit. The previous
// pair of complete prisms overlapped by five millimetres on every tread and drew
// two coincident internal surfaces, which is the source of the broken polygons.
function addCurvedFlight({a0,a1,fromH,toH,rises}){
  const da=(a1-a0)/rises,riser=(toH-fromH)/rises,slab=STAIR.slabDepthM;
  for(let i=0;i<rises;i++){
    const start=a0+da*i,end=start+da,top=fromH+riser*i;
    // slabDepth is the MINIMUM concrete below the nose, not the thickness at
    // the high end of the pitched soffit. Previously only 7mm remained beneath
    // some nosings: the stair read as thin folded wedges instead of a flight.
    const under0=fromH-slab+riser*(i-1);
    const under1=fromH-slab+riser*i;
    const slices=Math.max(3,Math.ceil(Math.abs(da)/.04));
    for(let s=0;s<slices;s++){
      const u0=s/slices,u1=(s+1)/slices,b0=start+da*u0,b1=start+da*u1,mid=(b0+b1)/2;
      const low0=under0+(under1-under0)*u0,low1=under0+(under1-under0)*u1;
      addQuad([point(INNER,b0,top),point(OUTER,b0,top),point(OUTER,b1,top),point(INNER,b1,top)],MAT.terrazzo,[0,1,0]);
      addQuad([point(INNER,b1,low1),point(OUTER,b1,low1),point(OUTER,b0,low0),point(INNER,b0,low0)],MAT.concrete,[0,-1,0]);
      addQuad([point(OUTER,b0,low0),point(OUTER,b1,low1),point(OUTER,b1,top),point(OUTER,b0,top)],MAT.concrete,[Math.sin(mid),0,-Math.cos(mid)]);
      addQuad([point(INNER,b1,low1),point(INNER,b0,low0),point(INNER,b0,top),point(INNER,b1,top)],MAT.concrete,[-Math.sin(mid),0,Math.cos(mid)]);
    }
    addQuad([point(INNER,end,top),point(OUTER,end,top),point(OUTER,end,top+riser),point(INNER,end,top+riser)],MAT.concrete);
    addProfiledSweep([point(INNER-.005,end,top+.007),point(OUTER+.005,end,top+.007)],.014,.006,MAT.brass,6);
  }
  for(const r of[INNER,OUTER]){
    // Equal physical spacing on each radius avoids the old dense inner cage.
    const posts=Math.ceil(Math.abs(a1-a0)*r/.134);
    for(let i=0;i<=posts;i++){
      const t=i/posts,a=a0+(a1-a0)*t,step=Math.min(rises-1,Math.floor(t*rises)),base=fromH+riser*step;
      const postTop=fromH+(toH-fromH)*t+STAIR.handrailHeightM-.027;
      addCylinder(m,point(r,a,(base+postTop)/2),.014,postTop-base,MAT.steel,6);
    }
    const divisions=Math.ceil(Math.abs(a1-a0)*r/.12),path=Array.from({length:divisions+1},(_,i)=>{
      const t=i/divisions;return point(r,a0+(a1-a0)*t,fromH+(toH-fromH)*t+STAIR.handrailHeightM);
    });
    addProfiledSweep(path,.048,.033,MAT.oak,8);
    addProfiledSweep(path.map(p=>[p[0],p[1]-.23,p[2]]),.014,.018,MAT.steel,4);
    addProfiledSweep(path.map(p=>[p[0],p[1]-1.16,p[2]]),.035,.085,MAT.steel,4);
    if(r===OUTER){
      const panels=Math.ceil(Math.abs(a1-a0)*r/.9);
      for(let i=0;i<panels;i++){
        // A restrained opposed S, tied into the rails, is one forged motif per
        // structural panel. It reads at walking distance without screen noise.
        for(const sign of[-1,1]){
          const curve=Array.from({length:13},(_,j)=>{
            const u=j/12,t=(i+.5+.32*Math.sin(u*Math.PI*2)*sign)/panels;
            return point(r,a0+(a1-a0)*t,fromH+(toH-fromH)*t+.24+u*.51);
          });
          addProfiledSweep(curve,.011,.011,MAT.steel,4,true);
        }
      }
    }
  }
  for(const [a,h]of[[a0,fromH],[a1,toH]])for(const r of[INNER,OUTER]){
    addCylinder(m,point(r,a,h+.56),.07,1.12,MAT.steel,8);addSphere(m,point(r,a,h+1.16),.095,MAT.brass,5,10);
  }
}

for(const flight of STAIR.flights)addCurvedFlight({
  a0:flight.theta0,a1:flight.theta0+flight.sweep,
  fromH:flight.fromH,toH:flight.toH,rises:flight.rises,
});

// Floor 1 gets a short stair-owned fan from the first radial edge toward the
// immutable hall centre. It corrects the visible termination angle without
// replacing, resizing or cutting a single room cell.
function addFloor1Apron(){
  const angle=STAIR.flights[0].theta0;
  const startInner=[CENTRE.x+Math.sin(angle)*INNER,CENTRE.z-Math.cos(angle)*INNER];
  const startOuter=[CENTRE.x+Math.sin(angle)*OUTER,CENTRE.z-Math.cos(angle)*OUTER];
  const startCenter=[(startInner[0]+startOuter[0])/2,(startInner[1]+startOuter[1])/2];
  let dx=STAIR.floor1Aim.x-startCenter[0],dz=STAIR.floor1Aim.z-startCenter[1];
  const length=Math.hypot(dx,dz)||1;dx/=length;dz/=length;
  const apronLength=Math.min(1.35,length),end=[startCenter[0]+dx*apronLength,startCenter[1]+dz*apronLength];
  const px=-dz,pz=dx,half=STAIR.widthM/2;
  const endA=[end[0]+px*half,end[1]+pz*half],endB=[end[0]-px*half,end[1]-pz*half];
  const top=.006,bottom=-STAIR.slabDepthM;
  const sections=[],slices=6;
  for(let i=0;i<=slices;i++){
    const t=i/slices,cx=startCenter[0]+(end[0]-startCenter[0])*t,cz=startCenter[1]+(end[1]-startCenter[1])*t;
    let sx=(1-t)*0+t*px,sz=(1-t)*-1+t*pz,sl=Math.hypot(sx,sz)||1;sx/=sl;sz/=sl;
    sections.push({
      topA:local(cx+sx*half,top,cz+sz*half),topB:local(cx-sx*half,top,cz-sz*half),
      bottomA:local(cx+sx*half,bottom,cz+sz*half),bottomB:local(cx-sx*half,bottom,cz-sz*half),
    });
  }
  for(let i=0;i<slices;i++){
    const a=sections[i],b=sections[i+1];
    addTri([a.topA,b.topA,b.topB],MAT.terrazzo,[0,1,0]);
    addTri([a.topA,b.topB,a.topB],MAT.terrazzo,[0,1,0]);
    addTri([a.bottomB,b.bottomB,b.bottomA],MAT.concrete,[0,-1,0]);
    addTri([a.bottomB,b.bottomA,a.bottomA],MAT.concrete,[0,-1,0]);
    addQuad([a.bottomA,b.bottomA,b.topA,a.topA],MAT.concrete);
    addQuad([b.bottomB,a.bottomB,a.topB,b.topB],MAT.concrete);
  }
  const first=sections[0],last=sections.at(-1);
  addQuad([first.bottomB,first.bottomA,first.topA,first.topB],MAT.concrete);
  addQuad([last.bottomA,last.bottomB,last.topB,last.topA],MAT.concrete);
  addBeam(m,local(endA[0],top+.018,endA[1]),local(endB[0],top+.018,endB[1]),.04,MAT.brass);
}
addFloor1Apron();

// The final radial edge lands in a real west-going gallery apron. Previously
// the model stopped on a nose facing the south partition and left the turn to
// an invisible logical seam. This head has one floor and two returned rails;
// the two-metre mouth remains visibly and physically open to the loggia.
function addAcademicHead(){
  const top=10.008,bottom=9.78,x0=61.4,x1=65.7,z0=37,z1=39.45;
  addQuad([local(x0,top,z0),local(x1,top,z0),local(x1,top,z1),local(x0,top,z1)],MAT.terrazzo,[0,1,0]);
  addQuad([local(x0,bottom,z1),local(x1,bottom,z1),local(x1,bottom,z0),local(x0,bottom,z0)],MAT.concrete,[0,-1,0]);
  addQuad([local(x0,bottom,z1),local(x1,bottom,z1),local(x1,top,z1),local(x0,top,z1)],MAT.concrete,[0,0,1]);
  const f=STAIR.flights.at(-1),end=f.theta0+f.sweep;
  const curves=[
    [point(INNER,end,11),local(63.8,11,36.7),local(63.65,11,37.0),local(63.2,11,37.03),local(61.4,11,37.03)],
    [point(OUTER,end,11),local(65.7,11,37.1),local(65.7,11,38.6),local(65.45,11,39.3),local(64.7,11,39.45),local(61.4,11,39.45)],
  ];
  // Cardinal cubic interpolation keeps the head rails smooth through the turn.
  const smooth=(points)=>{
    const out=[];
    for(let i=0;i<points.length-1;i++){
      const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
      const n=Math.max(5,Math.ceil(Math.hypot(...p2.map((v,k)=>v-p1[k]))/.12));
      for(let j=0;j<n;j++){const t=j/n,t2=t*t,t3=t2*t;out.push(p1.map((v,k)=>.5*((2*v)+(-p0[k]+p2[k])*t+(2*p0[k]-5*v+4*p2[k]-p3[k])*t2+(-p0[k]+3*v-3*p2[k]+p3[k])*t3)));}
    }
    out.push(points.at(-1));return out;
  };
  for(const curve of curves){
    const path=smooth(curve);addProfiledSweep(path,.048,.033,MAT.oak,8);
    addProfiledSweep(path.map(p=>[p[0],p[1]-.23,p[2]]),.014,.018,MAT.steel,4);
    let distance=0;
    for(let i=1;i<path.length;i++){
      distance+=Math.hypot(...path[i].map((v,k)=>v-path[i-1][k]));
      if(distance<.13&&i<path.length-1)continue;distance=0;
      const p=path[i];addCylinder(m,[p[0],10.49,p[2]],.014,.98,MAT.steel,6);
    }
  }
  // Short fan bridges the radial nose to the level head without a square lip.
  const a=point(INNER,end,top),b=point(OUTER,end,top);
  addQuad([a,b,local(65.7,top,37),local(63.65,top,37)],MAT.terrazzo,[0,1,0]);
}
addAcademicHead();

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
const stats={generatedAt:new Date().toISOString(),bytes:total,totalTriangles:triangles,design:{geometryRevision:STAIR.revision,finishRevision:1,curvilinear:true,navigationMode:'analytic-helix',halfTurnFlights:STAIR.flights.length,flightWidthM:STAIR.widthM,openWellWidthM:STAIR.innerRadiusM*2,lowerRisers:STAIR.flights[0].rises+STAIR.flights[1].rises,upperRisers:STAIR.flights[2].rises+STAIR.flights[3].rises,goingM:STAIR.goingM,handrailHeightM:STAIR.handrailHeightM,maximumBalusterClearGapM:STAIR.balusterMaximumClearGapM,minimumSoffitDepthM:STAIR.slabDepthM,profiledOakRails:true,physicalBalusterSpacing:true,academicHead:{floorM:10,exit:'west',mouthWidthM:2,wellPreserved:true},coplanarFinishPrisms:0,doubleSidedOpaqueMaterials:0,floor1Aim:[STAIR.floor1Aim.x,STAIR.floor1Aim.z]},meshes:{main_open_well_stair:{triangles,vertices,bounds:{min:lo,max:hi}}}};
fs.writeFileSync(STATS,JSON.stringify(stats,null,2)+'\n');
const sha256=crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const credits={pack:{filename:path.basename(OUT),author:'Chunk Surfer project',source:'tools/chunk_surfer/build-main-stair.mjs',license:'project source',sha256,triangles,bytes:total,modifications:'Project-native deterministic geometry; metres, Y-up, centred on the physical main stair hall.'},meshes:[{name:'main_open_well_stair',bounds:{min:lo,max:hi},triangles,provenance:{source:'tools/chunk_surfer/build-main-stair.mjs',origin:'project-native procedural geometry',license:'project source'}}]};
fs.writeFileSync(CREDITS,JSON.stringify(credits,null,2)+'\n');
console.log(`wrote ${path.relative(ROOT,OUT)} (${total} bytes, ${triangles} triangles)`);
