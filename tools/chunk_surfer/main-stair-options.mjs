// Review renders of the main stair rebuild options, before anything is built.
//
//   node tools/chunk_surfer/main-stair-options.mjs [--only=a-square,b-round] [--stations=01-foot]
//
// Each option is a rebuilt stair mesh plus the change it needs in the plan's
// render grid, rendered from the six camera stations of verify-main-stair-views
// (their recorded cameras) and as a cutaway axonometric. Clay renders in two
// tones: warm is the mesh, cool is the grid, so every seam between the two
// renderers shows. "before" is today's GLB and today's grid.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as A from './main-stair-audit.mjs';

const arg=(name,fallback)=>{const hit=process.argv.find((v)=>v.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const OUT=path.resolve(A.ROOT,'artifacts/main-stair-audit/options');
const STATIONS_JSON=path.resolve(A.ROOT,'artifacts/main-stair-audit/before/stations/stations.json');
const {STAIR,CELL,SOURCE}=A,C=STAIR.center,RI=STAIR.innerRadiusM,RO=STAIR.outerRadiusM,DEG=Math.PI/180,FL=STAIR.flights;
const Q=32/255,TOP=13.8;
const at=(deg,r)=>[C.x+Math.sin(deg*DEG)*r,C.z-Math.cos(deg*DEG)*r];
const arc=(r,from,to,n=32)=>Array.from({length:n+1},(_,i)=>at(from+(to-from)*i/n,r));
const rise=(f)=>(f.toH-f.fromH)/f.rises,daDeg=(f)=>f.sweep/f.rises/DEG;
const SQUARE={x0:60,x1:66,z0:33,z1:39},ROUND_R=3.25;
const LEVEL={upper:A.drawnHeight(4.8),academic:A.drawnHeight(10)};
const f3FirstRiser=FL[2].theta0/DEG+daDeg(FL[2]),f4Start=FL[3].theta0/DEG,f4End=(FL[3].theta0+FL[3].sweep)/DEG-360;
const toSquare=(deg)=>{const s=Math.sin(deg*DEG),c=-Math.cos(deg*DEG);let best=Infinity;
  for(const [v,axis] of[[SQUARE.x0,0],[SQUARE.x1,0],[SQUARE.z0,1],[SQUARE.z1,1]]){const d=axis===0?s:c,o=axis===0?C.x:C.z;if(Math.abs(d)<1e-9)continue;const t=(v-o)/d;if(t<=0)continue;
    const p=[C.x+s*t,C.z+c*t];if(p[0]>=SQUARE.x0-1e-6&&p[0]<=SQUARE.x1+1e-6&&p[1]>=SQUARE.z0-1e-6&&p[1]<=SQUARE.z1+1e-6)best=Math.min(best,t);}return at(deg,best);};

// ── Options ─────────────────────────────────────────────────────────────────
export const OPTIONS={
  before:{title:'Before',opening:null},
  'a-square':{title:'A · Square stairwell',opening:'square',
    landings:[
      {height:LEVEL.upper,poly:[[63,SQUARE.z0],[SQUARE.x1,SQUARE.z0],[SQUARE.x1,37.5],
        ...arc(RO,180-Math.acos((37.5-C.z)/RO)/DEG,f3FirstRiser,8),at(f3FirstRiser,RI),...arc(RI,f3FirstRiser,0,24),[63,C.z-RO]]},
      {height:LEVEL.academic,poly:[toSquare(f4End),[SQUARE.x1,SQUARE.z1],[SQUARE.x0,SQUARE.z1],toSquare(f4Start),at(f4Start,RI),...arc(RI,f4Start,f4End,32),at(f4End,RI)]},
    ],
    guards:[
      {height:LEVEL.upper,path:[[SQUARE.x1,37.5],[SQUARE.x1,SQUARE.z1],[SQUARE.x0,SQUARE.z1]]},
      {height:LEVEL.upper,path:[[63,SQUARE.z0],[63,C.z-RO]]},
      {height:LEVEL.academic,path:[at(f4Start,RI),toSquare(f4Start),[SQUARE.x0,SQUARE.z0],[SQUARE.x1,SQUARE.z0],toSquare(f4End)]},
    ],
    wellRails:true},
  'b-round':{title:'B · Round stairwell',opening:'round',
    landings:[
      {height:LEVEL.upper,poly:[...arc(ROUND_R,0,f3FirstRiser,24),at(f3FirstRiser,RI),...arc(RI,f3FirstRiser,0,24)]},
      {height:LEVEL.academic,poly:[...arc(ROUND_R,f4End,f4Start,32),at(f4Start,RI),...arc(RI,f4Start,f4End,32)]},
    ],
    guards:[
      {height:LEVEL.upper,path:arc(ROUND_R,f3FirstRiser,360,48)},
      {height:LEVEL.academic,path:[at(f4Start,RI),...arc(ROUND_R,f4Start,f4End+360,48)]},
    ],
    wellRails:true},
  'c-minimal':{title:'C · Today\'s layout, grid blocks removed',opening:'blocks',landings:[],guards:[],wellRails:false},
};

// Grid columns the option turns into stairwell air: one span from the ground
// floor to the roof, so the grid draws the stairwell floor and nothing above it.
function openingColumns(option){
  const cols=A.regionColumns(),set=new Set();
  for(const c of cols){
    const cx=c.x0+CELL/2,cz=c.z0+CELL/2,r=Math.hypot(cx-C.x,cz-C.z);
    let open=false;
    if(option.opening==='square')open=cx>SQUARE.x0&&cx<SQUARE.x1&&cz>SQUARE.z0&&cz<SQUARE.z1;
    else if(option.opening==='round')open=r<=ROUND_R;
    else if(option.opening==='blocks')open=c.spans.some((s)=>s.source===SOURCE.STAIR_FILL||s.source===SOURCE.WELL);
    if(open)set.add(`${c.px},${c.pz}`);
  }
  return set;
}
function optionSlice(option,logical,opening){
  const s=A.observerSlice(logical.x,logical.y);if(!opening)return s;
  const drawnFloor=Float32Array.from(s.drawnFloor),drawnCeil=Float32Array.from(s.drawnCeil),drawnFlags=Uint8Array.from(s.drawnFlags),source=[...s.source];
  for(const key of opening){
    const [px,pz]=key.split(',').map(Number),i=(pz-s.originY)*s.w+(px-s.originX);if(i<0||i>=s.w*s.h)continue;
    drawnFloor[i]=A.drawnHeight(0);drawnCeil[i]=A.drawnHeight(TOP);drawnFlags[i]=drawnFlags[i]&~A.F.SOLID;source[i]='stairwell';
  }
  return{...s,drawnFloor,drawnCeil,drawnFlags,source};
}

// ── Mesh ────────────────────────────────────────────────────────────────────
function meshBuilder(){
  const tris=[];
  const norm=(v)=>{const l=Math.hypot(...v)||1;return v.map((x)=>x/l);};
  const face=(a,b,c)=>norm([(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])]);
  const tri=(a,b,c,want,n)=>{let p=[a,b,c],fn=face(a,b,c);if(want&&fn[0]*want[0]+fn[1]*want[1]+fn[2]*want[2]<0){p=[a,c,b];fn=fn.map((x)=>-x);}
    const nn=n||[fn,fn,fn];tris.push({a:p[0],b:p[1],c:p[2],na:nn[0],nb:nn[1],nc:nn[2],material:'mesh'});};
  const quad=(a,b,c,d,want)=>{tri(a,b,c,want);tri(a,c,d,want);};
  const box=(c,s)=>{const [x,y,z]=c,[hx,hy,hz]=s.map((v)=>v/2),P=(i,j,k)=>[x+i*hx,y+j*hy,z+k*hz];
    quad(P(-1,-1,1),P(1,-1,1),P(1,1,1),P(-1,1,1),[0,0,1]);quad(P(1,-1,-1),P(-1,-1,-1),P(-1,1,-1),P(1,1,-1),[0,0,-1]);
    quad(P(1,-1,1),P(1,-1,-1),P(1,1,-1),P(1,1,1),[1,0,0]);quad(P(-1,-1,-1),P(-1,-1,1),P(-1,1,1),P(-1,1,-1),[-1,0,0]);
    quad(P(-1,1,1),P(1,1,1),P(1,1,-1),P(-1,1,-1),[0,1,0]);};
  // A tube along a polyline: six sides, enough for a rail at review size.
  const tube=(pts,r)=>{
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1],t=norm(b.map((v,k)=>v-a[k])),ref=Math.abs(t[1])<.9?[0,1,0]:[1,0,0];
      const u=norm([t[1]*ref[2]-t[2]*ref[1],t[2]*ref[0]-t[0]*ref[2],t[0]*ref[1]-t[1]*ref[0]]),w=[t[1]*u[2]-t[2]*u[1],t[2]*u[0]-t[0]*u[2],t[0]*u[1]-t[1]*u[0]];
      const ring=(p)=>Array.from({length:6},(_,k)=>{const an=k/6*Math.PI*2;return p.map((v,j)=>v+(u[j]*Math.cos(an)+w[j]*Math.sin(an))*r);});
      const ra=ring(a),rb=ring(b);
      for(let k=0;k<6;k++){const k2=(k+1)%6,mid=[(u[0]*Math.cos((k+.5)/6*Math.PI*2)+w[0]*Math.sin((k+.5)/6*Math.PI*2)),(u[1]*Math.cos((k+.5)/6*Math.PI*2)+w[1]*Math.sin((k+.5)/6*Math.PI*2)),(u[2]*Math.cos((k+.5)/6*Math.PI*2)+w[2]*Math.sin((k+.5)/6*Math.PI*2))];quad(ra[k],rb[k],rb[k2],ra[k2],mid);}
    }
  };
  return{tris,tri,quad,box,tube};
}

// The rebuilt flights: closed construction, nosing line at the front of each
// tread, helicoid soffit with true normals, caps where a flight meets a slab.
function buildFlights(M,{skipFirstTread}){
  const P=(r,deg,y)=>{const [x,z]=at(deg,r);return[x,y,z];};
  FL.forEach((f,fi)=>{
    const R=rise(f),da=daDeg(f),a0=f.theta0/DEG,slab=STAIR.slabDepthM,k=(f.toH-f.fromH)/(f.sweep/DEG);
    const nose=(deg)=>f.fromH+(deg-a0)/da*R,soffit=(deg)=>nose(deg)-R-slab;
    const soffitN=(deg,r)=>{const s=Math.sin(deg*DEG),c=Math.cos(deg*DEG),kk=k/DEG;let n=[ -c*kk*0+(-c)*0, 0,0];
      // ∂/∂r = (s,0,-c); ∂/∂θ(rad) = (r c, kRad, r s); normal = ∂r × ∂θ, downward.
      const dr=[s,0,-c],dt=[r*c,(f.toH-f.fromH)/f.sweep,r*s];n=[dr[1]*dt[2]-dr[2]*dt[1],dr[2]*dt[0]-dr[0]*dt[2],dr[0]*dt[1]-dr[1]*dt[0]];
      const l=Math.hypot(...n);n=n.map((v)=>v/l);return n[1]>0?n.map((v)=>-v):n;};
    for(let i=0;i<f.rises;i++){
      const s=a0+da*i,e=s+da,h=f.fromH+R*i,slices=6;
      const drawTop=!(i===0&&skipFirstTread(fi));
      for(let j=0;j<slices;j++){
        const b0=s+da*j/slices,b1=s+da*(j+1)/slices;
        if(drawTop)M.quad(P(RI,b0,h),P(RO,b0,h),P(RO,b1,h),P(RI,b1,h),[0,1,0]);
        // Soffit with analytic normals per corner.
        const c00=P(RI,b0,soffit(b0)),c10=P(RO,b0,soffit(b0)),c11=P(RO,b1,soffit(b1)),c01=P(RI,b1,soffit(b1));
        const n00=soffitN(b0,RI),n10=soffitN(b0,RO),n11=soffitN(b1,RO),n01=soffitN(b1,RI);
        M.tris.push({a:c00,b:c01,c:c11,na:n00,nb:n01,nc:n11,material:'mesh'},{a:c00,b:c11,c:c10,na:n00,nb:n11,nc:n10,material:'mesh'});
        for(const [r,sign] of[[RO,1],[RI,-1]]){const mid=(b0+b1)/2,out=[Math.sin(mid*DEG)*sign,0,-Math.cos(mid*DEG)*sign];
          M.quad(P(r,b0,soffit(b0)),P(r,b1,soffit(b1)),P(r,b1,h),P(r,b0,h),out);}
      }
      // Riser at the FRONT of the tread, up from the tread below.
      if(i>0)M.quad(P(RI,s,h-R),P(RO,s,h-R),P(RO,s,h),P(RI,s,h),[Math.cos(s*DEG)*-1,0,Math.sin(s*DEG)*-1]);
    }
    const end=a0+f.sweep/DEG,last=f.fromH+R*(f.rises-1);
    // The step up onto the next flight's first tread, or onto the landing.
    M.quad(P(RI,end,last),P(RO,end,last),P(RO,end,f.toH),P(RI,end,f.toH),[-Math.cos(end*DEG),0,-Math.sin(end*DEG)]);
    // Caps where the flight's body meets a slab or the floor.
    M.quad(P(RI,a0,soffit(a0)),P(RO,a0,soffit(a0)),P(RO,a0,f.fromH),P(RI,a0,f.fromH),[-Math.cos(a0*DEG),0,-Math.sin(a0*DEG)]);
    M.quad(P(RI,end,soffit(end)),P(RO,end,soffit(end)),P(RO,end,f.toH),P(RI,end,f.toH),[Math.cos(end*DEG),0,Math.sin(end*DEG)]);
  });
}

// Height of the walking surface under a bearing on the run, and the rail line.
function railProfile(option){
  // Cumulative bearing, as in the developed drawing: F1 0→180, F2 →360,
  // upper landing, F3 from its first riser, F4, top landing.
  const segs=[];
  segs.push({from:0,to:360,h:(c)=>FL[0].fromH+(c/180)*2.4,surf:(c)=>{const f=c<180?FL[0]:FL[1],base=c<180?0:180,i=Math.floor((c-base)/daDeg(f)+1e-9);return f.fromH+rise(f)*Math.min(f.rises-1,i);}});
  const f3a=360+f3FirstRiser,f3e=360+FL[2].theta0/DEG+180,f4e=f3e+180;
  if(option.wellRails)segs.push({from:360,to:f3a,h:()=>LEVEL.upper,surf:()=>LEVEL.upper,landing:true});
  segs.push({from:f3a,to:f4e,h:(c)=>FL[2].fromH+((c-(360+FL[2].theta0/DEG))/180)*2.6,surf:(c)=>{const base=360+FL[2].theta0/DEG,f=c<f3e?FL[2]:FL[3],b=c<f3e?base:f3e,i=Math.floor((c-b)/daDeg(f)+1e-9);return f.fromH+rise(f)*Math.min(f.rises-1,i);}});
  if(option.wellRails)segs.push({from:f4e,to:f4e+180,h:()=>LEVEL.academic,surf:()=>LEVEL.academic,landing:true});
  return segs;
}
function buildRails(M,option){
  const segs=railProfile(option),railH=STAIR.handrailHeightM;
  for(const [r,side] of[[RI,'inner'],[RO,'outer']]){
    // Outer rails run only along flights; the inner rail carries round the well.
    const runs=[];let run=[];
    for(const s of segs){
      if(side==='outer'&&s.landing){if(run.length)runs.push(run);run=[];continue;}
      const step=.08/(r*DEG);for(let c=s.from;c<=s.to+1e-9;c+=step)run.push({c,h:s.h(Math.min(c,s.to))+railH,surf:s.surf(Math.min(c,s.to-1e-6))});
    }
    if(run.length)runs.push(run);
    for(const rr of runs){
      // Ease every change of pitch: a moving average over ±0.3 m of rail.
      const win=Math.max(1,Math.round(.3/.08)),sm=rr.map((p,i)=>{let s=0,n=0;for(let j=Math.max(0,i-win);j<=Math.min(rr.length-1,i+win);j++){s+=rr[j].h;n++;}return{...p,h:s/n};});
      const pts=sm.map((p)=>{const [x,z]=at(p.c,r);return[x,p.h,z];});
      M.tube(pts,.032);M.tube(pts.map((p)=>[p[0],p[1]-.85,p[2]]),.012);
      let acc=0;for(let i=1;i<sm.length;i++){acc+=.08;if(acc<.12)continue;acc=0;const [x,z]=at(sm[i].c,r);M.box([x,(sm[i].surf+sm[i].h)/2,z],[.016,sm[i].h-sm[i].surf,.016]);}
    }
  }
}
function buildGuards(M,option){
  for(const g of option.guards){
    const pts=[];for(let i=0;i<g.path.length-1;i++){const a=g.path[i],b=g.path[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.12));for(let k=0;k<n;k++)pts.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}
    pts.push(g.path.at(-1));
    M.tube(pts.map(([x,z])=>[x,g.height+1,z]),.032);M.tube(pts.map(([x,z])=>[x,g.height+.06,z]),.02);
    for(const [x,z] of pts)M.box([x,g.height+.53,z],[.016,.94,.016]);
  }
}
function earClip(poly){
  const pts=poly.map((p)=>p.slice()),area=pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  const idx=pts.map((_,i)=>i);if(area<0)idx.reverse();
  const out=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const inside=(p,a,b,c)=>cross(a,b,p)>=0&&cross(b,c,p)>=0&&cross(c,a,p)>=0;
  let guard=0;
  while(idx.length>3&&guard++<20000){
    let clipped=false;
    for(let i=0;i<idx.length;i++){
      const ia=idx[(i+idx.length-1)%idx.length],ib=idx[i],ic=idx[(i+1)%idx.length],a=pts[ia],b=pts[ib],c=pts[ic];
      if(cross(a,b,c)<=1e-12)continue;
      if(idx.some((j)=>j!==ia&&j!==ib&&j!==ic&&inside(pts[j],a,b,c)))continue;
      out.push([a,b,c]);idx.splice(i,1);clipped=true;break;
    }
    if(!clipped)break;
  }
  if(idx.length===3)out.push(idx.map((i)=>pts[i]));
  return out;
}
function buildLandings(M,option){
  for(const l of option.landings){
    const top=l.height,bottom=l.height-.25;
    for(const [a,b,c] of earClip(l.poly)){
      M.tri([a[0],top,a[1]],[b[0],top,b[1]],[c[0],top,c[1]],[0,1,0]);
      M.tri([a[0],bottom,a[1]],[b[0],bottom,b[1]],[c[0],bottom,c[1]],[0,-1,0]);
    }
    const cx=l.poly.reduce((s,p)=>s+p[0],0)/l.poly.length,cz=l.poly.reduce((s,p)=>s+p[1],0)/l.poly.length;
    for(let i=0;i<l.poly.length;i++){const a=l.poly[i],b=l.poly[(i+1)%l.poly.length];
      // Edge faces point away from the polygon's middle (good enough for the
      // shapes here, which are star-shaped from their centroid).
      const mid=[(a[0]+b[0])/2-cx,0,(a[1]+b[1])/2-cz];
      M.quad([a[0],bottom,a[1]],[b[0],bottom,b[1]],[b[0],top,b[1]],[a[0],top,a[1]],mid);}
  }
}
export function optionMesh(id){
  const option=OPTIONS[id];
  if(id==='before')return A.stairMeshTriangles();
  const M=meshBuilder();
  // The ground's first tread is the floor; F3's first tread is the upper
  // landing wherever a built landing exists.
  buildFlights(M,{skipFirstTread:(fi)=>fi===0||(fi===2&&option.landings.length>0)});
  buildRails(M,option);buildGuards(M,option);buildLandings(M,option);
  return M.tris;
}

// ── Clay render ─────────────────────────────────────────────────────────────
const TONE={mesh:[236,228,214],grid:[150,165,186],stairwell:[150,165,186]};
const LIGHT=(()=>{const v=[.35,.85,.4],l=Math.hypot(...v);return v.map((x)=>x/l);})();
function shade(rgb,n,t){
  const lam=Math.abs(n[0]*LIGHT[0]+n[1]*LIGHT[1]+n[2]*LIGHT[2]),fog=Math.exp(-Math.max(0,t-3)/26);
  return rgb.map((c)=>Math.round(c*(.42+.58*lam)*fog+18*(1-fog)));
}
function renderView({slice,bvh,camera,width,height,ortho=null}){
  const rgb=Buffer.alloc(width*height*3),depth=new Float32Array(width*height),nrm=new Float32Array(width*height*3),id=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let o,d;
    if(ortho){const u=(x+.5)/width*2-1,v=1-(y+.5)/height*2;o=ortho.center.map((c,k)=>c+ortho.right[k]*u*ortho.half*width/height+ortho.up[k]*v*ortho.half-ortho.dir[k]*60);d=ortho.dir;}
    else{o=[camera.eye.x,camera.eye.y,camera.eye.z];d=A.pixelRay(camera,x,y,width,height);}
    const m=slice?A.marchSlice(slice,o,d):null,hit=A.raycastBVH(bvh,o,d,m?m.t:200);
    const i=y*width+x;let col=[14,15,18],n=[0,0,0],t=1e9,kind=0;
    if(hit&&(!m||hit.t<m.t)){const tr=bvh.tris[hit.tri],w=1-hit.u-hit.v;n=[0,1,2].map((k)=>tr.na[k]*w+tr.nb[k]*hit.u+tr.nc[k]*hit.v);const l=Math.hypot(...n)||1;n=n.map((v)=>v/l);
      if(n[0]*d[0]+n[1]*d[1]+n[2]*d[2]>0)n=n.map((v)=>-v);t=hit.t;kind=tr.material==='context'?2:1;col=shade(tr.material==='context'?TONE.grid:TONE.mesh,n,ortho?6:t);}
    else if(m){t=m.t;kind=2;n=m.surf==='floor'?[0,1,0]:m.surf==='ceiling'?[0,-1,0]:(()=>{const p=o.map((v,k)=>v+d[k]*m.t),fx=p[0]/CELL-Math.round(p[0]/CELL),fz=p[2]/CELL-Math.round(p[2]/CELL);return Math.abs(fx)<Math.abs(fz)?[-Math.sign(d[0]),0,0]:[0,0,-Math.sign(d[2])];})();
      col=shade(TONE.grid,n,t);}
    rgb[i*3]=col[0];rgb[i*3+1]=col[1];rgb[i*3+2]=col[2];depth[i]=t;nrm[i*3]=n[0];nrm[i*3+1]=n[1];nrm[i*3+2]=n[2];id[i]=kind;
  }
  // Line work: darken where depth jumps, the normal turns, or the renderer
  // changes. The renderer seam is drawn darker still, because it is the point.
  const out=Buffer.from(rgb);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;let edge=0;
    for(const j of[i+1,i+width]){
      const dz=Math.abs(depth[i]-depth[j])/Math.max(.5,Math.min(depth[i],depth[j])),dn=1-(nrm[i*3]*nrm[j*3]+nrm[i*3+1]*nrm[j*3+1]+nrm[i*3+2]*nrm[j*3+2]);
      if(id[i]!==id[j]&&id[i]&&id[j])edge=Math.max(edge,1);else if(dz>.04||dn>.25)edge=Math.max(edge,.6);
    }
    if(edge)for(let k=0;k<3;k++)out[i*3+k]=Math.round(out[i*3+k]*(1-.62*edge));
  }
  return out;
}

// The cutaway: the stair and its landings, the ground, and the floors on the
// far two sides of the stairwell as ledges so the storeys read.
function contextTris(id,opening){
  const tris=[],push=(a,b,c,n)=>tris.push({a,b,c,na:n,nb:n,nc:n,material:'context'});
  const slab=(x0,z0,x1,z1,y)=>{push([x0,y,z0],[x1,y,z1],[x1,y,z0],[0,1,0]);push([x0,y,z0],[x0,y,z1],[x1,y,z1],[0,1,0]);
    push([x0,y-.25,z1],[x1,y-.25,z1],[x1,y,z1],[0,0,1]);push([x0,y-.25,z1],[x1,y,z1],[x0,y,z1],[0,0,1]);
    push([x1,y-.25,z0],[x1,y-.25,z1],[x1,y,z1],[1,0,0]);push([x1,y-.25,z0],[x1,y,z1],[x1,y,z0],[1,0,0]);};
  for(const col of A.regionColumns({x0:57,x1:69.5,z0:30,z1:42.5,y0:-1,y1:15})){
    const key=`${col.px},${col.pz}`,inOpening=opening?.has(key);
    const x0=col.x0,z0=col.z0,x1=x0+CELL,z1=z0+CELL;
    // Ground everywhere the grid draws one (the stairwell floor included).
    const ground=inOpening?A.drawnHeight(0):col.spans.find((s)=>Math.abs(s.drawnFloor-A.drawnHeight(0))<.01)?.drawnFloor;
    if(ground!=null)slab(x0,z0,x1,z1,ground);
    // Upper floors: only on the far sides (north and west of the stairwell).
    const far=x1<=60.01||z1<=33.01;
    for(const s of col.spans){
      if(inOpening)break;
      if(s.drawnFloor<3)continue;
      if(id==='before'&&(s.source===SOURCE.STAIR_FILL||s.source===SOURCE.LANDING)){
        // Today's grid stair: each block drawn as the solid it is, down to
        // whatever the grid has under it.
        const below=col.spans.filter((q)=>q.drawnCeil<=s.drawnFloor+1e-6).reduce((m,q)=>Math.max(m,q.drawnCeil),A.drawnHeight(0));
        slab(x0,z0,x1,z1,s.drawnFloor);
        if(s.drawnFloor-below>.3){const y0=below,y1=s.drawnFloor;
          push([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[0,0,1]);push([x0,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]);
          push([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[1,0,0]);push([x1,y0,z0],[x1,y1,z1],[x1,y1,z0],[1,0,0]);}
        continue;
      }
      if(far&&[SOURCE.HALL_UPPER,SOURCE.ACADEMIC,SOURCE.LANDING].includes(s.source))slab(x0,z0,x1,z1,s.drawnFloor);
    }
    if(id==='before')for(const s of col.spans)if(s.source===SOURCE.STAIR_FILL&&s.drawnFloor<3){
      const y1=s.drawnFloor;slab(x0,z0,x1,z1,y1);
      push([x0,0,z1],[x1,0,z1],[x1,y1,z1],[0,0,1]);push([x0,0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]);
      push([x1,0,z0],[x1,0,z1],[x1,y1,z1],[1,0,0]);push([x1,0,z0],[x1,y1,z1],[x1,y1,z0],[1,0,0]);
    }
  }
  return tris;
}

async function main(){
  const only=arg('only',null)?.split(','),onlyStations=arg('stations',null)?.split(',');
  const stations=JSON.parse(fs.readFileSync(STATIONS_JSON,'utf8')).stations.filter((s)=>!onlyStations||onlyStations.includes(s.id));
  const W=960,H=600;
  for(const id of Object.keys(OPTIONS)){
    if(only&&!only.includes(id))continue;
    const option=OPTIONS[id],dir=path.join(OUT,id);fs.mkdirSync(dir,{recursive:true});
    const t0=Date.now(),opening=option.opening?openingColumns(option):null;
    const tris=optionMesh(id),bvh=A.buildBVH(tris);
    for(const st of stations){
      const slice=optionSlice(option,st.logical,opening);
      const img=renderView({slice,bvh,camera:{eye:st.camera.eye,yaw:st.camera.yaw,pitch:st.camera.pitch},width:W,height:H});
      await sharp(img,{raw:{width:W,height:H,channels:3}}).webp({quality:86}).toFile(path.join(dir,`${st.id}.webp`));
    }
    // Cutaway axonometric from the south-east, looking down.
    const ctx=contextTris(id,opening),axoBvh=A.buildBVH([...tris,...ctx]);
    const dir3=(()=>{const v=[-1,-.95,-1],l=Math.hypot(...v);return v.map((x)=>x/l);})();
    const right=(()=>{const v=[dir3[2],0,-dir3[0]],l=Math.hypot(...v);return v.map((x)=>-x/l);})();
    const up=[right[1]*dir3[2]-right[2]*dir3[1],right[2]*dir3[0]-right[0]*dir3[2],right[0]*dir3[1]-right[1]*dir3[0]];
    const axo=renderView({slice:null,bvh:axoBvh,width:1100,height:1100,ortho:{center:[63,5.2,36],dir:dir3,right,up,half:9}});
    await sharp(axo,{raw:{width:1100,height:1100,channels:3}}).webp({quality:86}).toFile(path.join(dir,'axo.webp'));
    console.log(id,`${tris.length} mesh tris`,opening?`${opening.size} opening columns`:'',`${((Date.now()-t0)/1000).toFixed(1)}s`);
  }
}
if(import.meta.url===`file://${process.argv[1]}`)await main();

// ── Plans per option ────────────────────────────────────────────────────────
// At each upper floor: today's walkable cells coloured by what the option puts
// under them, the opening, the built landings and the guards.
function pointInPolygon([x,z],poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}return inside;}
export function optionPlan(id,level){
  const option=OPTIONS[id],opening=option.opening?openingColumns(option):null,{plan,FP}=A.compileConservatory();
  const landing=(option.landings||[]).find((l)=>Math.abs(l.height-A.drawnHeight(level))<.01);
  // Today's plan is judged by the standing measurement the spec uses.
  const wrongToday=id==='before'?new Set(A.measureStanding(A.buildBVH(A.stairMeshTriangles()),A.regionColumns()).map((c)=>`${c.x},${c.y}`)):null;
  const S=46,B={x0:56,x1:70.5,z0:29,z1:43},W=(B.x1-B.x0)*S,H=(B.z1-B.z0)*S,X=(x)=>((x-B.x0)*S).toFixed(1),Z=(z)=>((z-B.z0)*S).toFixed(1);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Menlo,monospace" font-size="12">`,`<rect width="100%" height="100%" fill="#141417"/>`];
  const columns=A.regionColumns();
  for(const col of columns){if(col.x0<B.x0||col.x0>=B.x1||col.z0<B.z0||col.z0>=B.z1)continue;
    const open=col.spans.some((s)=>s.floor<=level+.5&&s.ceil>=level+1.5)||opening?.has(`${col.px},${col.pz}`);
    if(!open)parts.push(`<rect x="${X(col.x0)}" y="${Z(col.z0)}" width="${CELL*S}" height="${CELL*S}" fill="#2e2e35"/>`);}
  // Opening outline.
  if(opening)for(const key of opening){const [px,pz]=key.split(',').map(Number);parts.push(`<rect x="${X(px*CELL)}" y="${Z(pz*CELL)}" width="${CELL*S}" height="${CELL*S}" fill="#5ad1ff" fill-opacity=".10"/>`);}
  const counts={floor:0,landing:0,void:0,'inside a tread':0};
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const i=y*plan.w+x;if(plan.solid[i]||plan.collisionOnly?.[i]||Math.abs(plan.floor[i]-level)>.01)continue;
    const run=plan.flightId[i]?plan.stairRuns[plan.flightId[i]-1]:null;if(run?.analyticHelix)continue;
    const p=FP.logicalToPhysical(x,y),cx=p.x*CELL+CELL/2,cz=p.z*CELL+CELL/2;if(cx<B.x0||cx>B.x1||cz<B.z0||cz>B.z1)continue;
    const key=`${Math.floor(cx/CELL)},${Math.floor(cz/CELL)}`,r=Math.hypot(cx-C.x,cz-C.z);
    let status='floor';
    if(wrongToday){if(wrongToday.has(`${x},${y}`))status='void';}
    else if(opening?.has(key)){
      if(id==='c-minimal'){
        // Today's grid landing stays where its cells are; the stairwell is
        // air elsewhere, so a cell there stands over the drop.
        status='void';
      }else status=landing&&pointInPolygon([cx,cz],landing.poly)?'landing':'void';
    }else if(r<RI+.1)status='void';
    counts[status]++;
    const fill={floor:'#2b4a6b',landing:'#3d6b2b',void:'#b3261e'}[status];
    parts.push(`<rect x="${X(cx-CELL/2+.04)}" y="${Z(cz-CELL/2+.04)}" width="${(CELL-.08)*S}" height="${(CELL-.08)*S}" fill="${fill}" opacity=".85"/>`);
  }
  for(const r of[RI,RO])parts.push(`<circle cx="${X(C.x)}" cy="${Z(C.z)}" r="${r*S}" fill="none" stroke="#e6e6e6" stroke-width="1.4"/>`);
  for(const f of FL){if(f.toH<level-2.7||f.fromH>level+2.7)continue;for(let i=0;i<=f.rises;i++){const a=(f.theta0+f.sweep*i/f.rises)/DEG,[x0,z0]=at(a,RI),[x1,z1]=at(a,RO);
    parts.push(`<line x1="${X(x0)}" y1="${Z(z0)}" x2="${X(x1)}" y2="${Z(z1)}" stroke="#e6e6e6" stroke-width="${i===0||i===f.rises?2:.7}" opacity="${Math.abs((f.fromH+f.toH)/2-level)<2.6?.9:.3}"/>`);}}
  if(option.opening==='square')parts.push(`<rect x="${X(SQUARE.x0)}" y="${Z(SQUARE.z0)}" width="${6*S}" height="${6*S}" fill="none" stroke="#5ad1ff" stroke-width="2.5" stroke-dasharray="10 6"/>`);
  if(option.opening==='round')parts.push(`<circle cx="${X(C.x)}" cy="${Z(C.z)}" r="${ROUND_R*S}" fill="none" stroke="#5ad1ff" stroke-width="2.5" stroke-dasharray="10 6"/>`);
  if(landing)parts.push(`<polygon points="${landing.poly.map(([x,z])=>`${X(x)},${Z(z)}`).join(' ')}" fill="#ffa600" fill-opacity=".3" stroke="#ffa600" stroke-width="2.5"/>`);
  for(const g of option.guards||[])if(Math.abs(g.height-A.drawnHeight(level))<.01)parts.push(`<polyline points="${g.path.map(([x,z])=>`${X(x)},${Z(z)}`).join(' ')}" fill="none" stroke="#ffe066" stroke-width="5" stroke-linecap="round"/>`);
  parts.push('</svg>');
  return{svg:parts.join('\n'),counts};
}
export async function writePlans(){
  const summary={};
  for(const id of Object.keys(OPTIONS)){
    summary[id]={};
    for(const [name,level] of[['upper',4.8],['academic',10]]){
      const {svg,counts}=optionPlan(id,level);summary[id][name]=counts;
      await sharp(Buffer.from(svg),{density:96}).resize(900).webp({quality:86}).toFile(path.join(OUT,id,`plan-${name}.webp`));
    }
  }
  fs.writeFileSync(path.join(OUT,'plans.json'),JSON.stringify(summary,null,2)+'\n');
  return summary;
}
if(process.argv.includes('--plans'))console.log(JSON.stringify(await writePlans()));
