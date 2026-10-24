// Original architectural relief, applied to audited existing stair masonry.
// All dimensions are metres; no collision, illumination, or stair geometry.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAIN_STAIR_WALL_SITES, MAIN_STAIR_WALL_ORIGIN, MAIN_STAIR_WALL_TREATMENT_VERSION } from '../../src/data/main-stair-wall-treatment.js';

const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'public/assets/conservatory-stair-walls.glb');
const materials=[
  ['retained warm lime plaster',[.70,.655,.54,1],0,.82],
  ['bottle green glazed ceramic',[.105,.225,.174,1],.04,.25],
  ['ochre glazed ceramic',[.48,.315,.125,1],.025,.31],
  ['dark green moulding undercut',[.072,.125,.099,1],.025,.46],
  ['exposed ceramic biscuit',[.31,.205,.145,1],0,.91],
  ['later ivory paint',[.79,.755,.64,1],0,.79],
  ['closed joint shadow',[.052,.050,.041,1],0,.98],
  ['retained polished walnut',[.13,.065,.028,1],.015,.37],
  ['worn water gilding',[.46,.30,.105,1],.72,.32],
].map(([name,baseColorFactor,metallicFactor,roughnessFactor])=>({name,pbrMetallicRoughness:{baseColorFactor,metallicFactor,roughnessFactor}}));
const MAT={plaster:0,green:1,ochre:2,undercut:3,biscuit:4,paint:5,joint:6,walnut:7,gold:8};
const groups=new Map(),siteRecords=[];
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const minus=(a,b)=>a.map((v,k)=>v-b[k]);
let currentSite;
const group=mat=>{if(!groups.has(mat))groups.set(mat,{positions:[],normals:[],indices:[],shared:new Map(),sites:[]});return groups.get(mat);};
// The route permits a player to stand 250 mm from these masonry planes.
// Lower joinery therefore remains a thin applied relief; the deep order
// grows smoothly above head height. Geometry is split at both boundaries,
// so no long edge can interpolate deep mass into the lower body envelope.
function depthScale(v){const max=currentSite.maxProjection-.01,low=(.025-.006)/(max-.006);if(v<=2)return[low,0];if(v>=2.30)return[1,0];const t=(v-2)/.30;return[low+(1-low)*t,(1-low)/.30];}
const remap=([u,v,d])=>{const[s]=depthScale(v);return[u,v,.006+(d-.006)*s];};
const point=local=>{const[u,v,d]=remap(local);return currentSite.origin.map((q,k)=>q+currentSite.tangent[k]*u+(k===1?v:0)+currentSite.normal[k]*d-MAIN_STAIR_WALL_ORIGIN[k]);};
const vector=([u,v,d])=>currentSite.normal.map((q,k)=>q*d+currentSite.tangent[k]*u+(k===1?v:0));
function shading(n,p){const[s,ds]=depthScale(p[1]),fv=(p[2]-.006)*ds;return vector(unit([n[0],n[1]-fv/s*n[2],n[2]/s]));}
function vertex(g,p,n){const key=p.map(v=>Math.round(v*1e6)).join(',')+'|'+n.map(v=>Math.round(v*1e5)).join(',');let i=g.shared.get(key);if(i==null){i=g.positions.length/3;g.positions.push(...p);g.normals.push(...n);g.shared.set(key,i);}return i;}
function rawTri(mat,a,b,c,na,nb=na,nc=na){
  const local=[a,b,c],p=local.map(point),n=[na,nb,nc].map((q,i)=>shading(q,local[i])),geo=cross(minus(p[1],p[0]),minus(p[2],p[0]));
  if(Math.hypot(...geo)<1e-11)return;
  const want=n[0].map((v,k)=>v+n[1][k]+n[2][k]);if(geo.reduce((v,q,k)=>v+q*want[k],0)<0){[p[1],p[2]]=[p[2],p[1]];[n[1],n[2]]=[n[2],n[1]];}
  const g=group(mat);g.indices.push(...p.map((q,i)=>vertex(g,q,n[i])));
}
function tri(mat,a,b,c,na,nb=na,nc=na){
  const all=[{p:a,n:na},{p:b,n:nb},{p:c,n:nc}];
  const cut=(poly,y,keepAbove)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=keepAbove?a.p[1]>=y:a.p[1]<=y,ib=keepAbove?b.p[1]>=y:b.p[1]<=y;if(ia)out.push(a);if(ia!==ib){const t=(y-a.p[1])/(b.p[1]-a.p[1]);out.push({p:a.p.map((v,k)=>k===1?y:v+(b.p[k]-v)*t),n:unit(a.n.map((v,k)=>v+(b.n[k]-v)*t))});}}return out;};
  const lo=Math.min(a[1],b[1],c[1]),hi=Math.max(a[1],b[1],c[1]);
  if((lo>=2&&hi<=2.30)||hi<=2||lo>=2.30){rawTri(mat,a,b,c,na,nb,nc);return;}
  for(const[y0,y1]of[[-Infinity,2],[2,2.30],[2.30,Infinity]]){let poly=all;if(Number.isFinite(y0))poly=cut(poly,y0,true);if(Number.isFinite(y1))poly=cut(poly,y1,false);for(let i=1;i<poly.length-1;i++)rawTri(mat,poly[0].p,poly[i].p,poly[i+1].p,poly[0].n,poly[i].n,poly[i+1].n);}
}
function quad(mat,a,b,c,d,n){tri(mat,a,b,c,n);tri(mat,a,c,d,n);}
function flat(mat,ps){
  // A concave moulding can begin at a reflex corner, and a leaf tip can
  // begin with coincident corners. Newell's directed area gives the actual
  // polygon orientation in both cases; a first-triangle normal cannot.
  const directedArea=[0,0,0];for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];directedArea[0]+=(a[1]-b[1])*(a[2]+b[2]);directedArea[1]+=(a[2]-b[2])*(a[0]+b[0]);directedArea[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  if(Math.hypot(...directedArea)<1e-11)return;const n=unit(directedArea);
  if(ps.length<=4){for(let i=1;i<ps.length-1;i++)tri(mat,ps[0],ps[i],ps[i+1],n);return;}
  // Concave moulding end caps need a constrained triangulation. A fan would
  // bridge a cove and skip collinear boundary vertices, leaving T-junctions.
  const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),xy=ps.map(p=>p.filter((_,k)=>k!==drop));
  const area=xy.reduce((s,p,i)=>{const q=xy[(i+1)%xy.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=Math.sign(area);
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const remaining=ps.map((_,i)=>i);let guard=ps.length*ps.length;
  while(remaining.length>3&&guard--){let cut=false;
    for(let k=0;k<remaining.length;k++){
      const a=remaining[(k-1+remaining.length)%remaining.length],b=remaining[k],c=remaining[(k+1)%remaining.length];
      if(turn(xy[a],xy[b],xy[c])*sign<=1e-12)continue;
      const contains=remaining.some(q=>q!==a&&q!==b&&q!==c&&turn(xy[a],xy[b],xy[q])*sign>=-1e-12&&turn(xy[b],xy[c],xy[q])*sign>=-1e-12&&turn(xy[c],xy[a],xy[q])*sign>=-1e-12);
      if(contains)continue;tri(mat,ps[a],ps[b],ps[c],n);remaining.splice(k,1);cut=true;break;
    }
    if(!cut)throw new Error('Unable to triangulate closed architectural profile');
  }
  if(remaining.length!==3)throw new Error('Architectural cap triangulation did not finish');
  tri(mat,...remaining.map(i=>ps[i]),n);
}
function box(mat,u,v,d,w,h,depth){const x=u-w/2,X=u+w/2,y=v-h/2,Y=v+h/2,z=d-depth/2,Z=d+depth/2;
  quad(mat,[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z],[0,0,1]);quad(mat,[X,y,z],[x,y,z],[x,Y,z],[X,Y,z],[0,0,-1]);
  quad(mat,[X,y,Z],[X,y,z],[X,Y,z],[X,Y,Z],[1,0,0]);quad(mat,[x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z],[-1,0,0]);
  quad(mat,[x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z],[0,1,0]);quad(mat,[x,y,z],[X,y,z],[X,y,Z],[x,y,Z],[0,-1,0]);
}
function extrudedPolygon(mat,outline,back,front){
  const a=outline.map(([u,v])=>[u,v,back]),b=outline.map(([u,v])=>[u,v,front]);
  flat(mat,[...a].reverse());flat(mat,b);
  for(let i=0;i<a.length;i++)flat(mat,[a[i],a[(i+1)%a.length],b[(i+1)%a.length],b[i]]);
}
// Closed architectural profiles. Broad coves and undercuts carry the order
// at player distance; no texture or freestanding head supplies the horror.
function horizontalProfile(u0,u1,y,profile,mat){
  const a=profile.map(([dy,d])=>[u0,y+dy,d]),b=profile.map(([dy,d])=>[u1,y+dy,d]);
  for(let i=0;i<a.length;i++)flat(mat,[a[i],a[(i+1)%a.length],b[(i+1)%a.length],b[i]]);
  flat(mat,[...a].reverse());flat(mat,b);
}
function rectFrame(cx,cy,w,h,profile,mat){
  const rings=profile.map(([inset,depth])=>[[cx-w/2+inset,cy-h/2+inset,depth],[cx+w/2-inset,cy-h/2+inset,depth],[cx+w/2-inset,cy+h/2-inset,depth],[cx-w/2+inset,cy+h/2-inset,depth]]);
  for(let i=0;i<rings.length;i++)for(let k=0;k<4;k++)flat(mat,[rings[i][k],rings[i][(k+1)%4],rings[(i+1)%rings.length][(k+1)%4],rings[(i+1)%rings.length][k]]);
}
function tube(points,radius,depthRadius,mat,sides=6,closed=false){
  const rows=[],ns=[];
  for(let i=0;i<points.length;i++){
    const prev=points[closed?(i-1+points.length)%points.length:Math.max(0,i-1)],next=points[closed?(i+1)%points.length:Math.min(points.length-1,i+1)],t=unit(minus(next,prev));
    const side=unit([-t[1],t[0],0]),out=unit(cross(t,side)),row=[],norms=[];
    for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a);row.push(points[i].map((v,k)=>v+side[k]*radius*c+out[k]*depthRadius*s));norms.push(unit(side.map((v,k)=>v*c/radius+out[k]*s/depthRadius)));}
    rows.push(row);ns.push(norms);
  }
  for(let i=0;i<(closed?rows.length:rows.length-1);i++){const ni=(i+1)%rows.length;for(let j=0;j<sides;j++){const k=(j+1)%sides;tri(mat,rows[i][j],rows[ni][j],rows[ni][k],ns[i][j],ns[ni][j],ns[ni][k]);tri(mat,rows[i][j],rows[ni][k],rows[i][k],ns[i][j],ns[ni][k],ns[i][k]);}}
  if(!closed)for(const i of[0,rows.length-1]){const other=points[i===0?1:points.length-2],n=unit(minus(points[i],other));for(let j=0;j<sides;j++)tri(mat,points[i],rows[i][j],rows[i][(j+1)%sides],n);}
}
function sweptCornice(points,profile,mat){
  const rows=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],t=unit(minus(b,a)),up=unit([-t[1],t[0],0]),out=unit(cross(t,up));return profile.map(([v,d])=>p.map((q,k)=>q+up[k]*v+out[k]*d));});
  for(let i=0;i<rows.length-1;i++)for(let k=0;k<profile.length;k++)flat(mat,[rows[i][k],rows[i+1][k],rows[i+1][(k+1)%profile.length],rows[i][(k+1)%profile.length]]);
  flat(mat,rows[0]);flat(mat,[...rows.at(-1)].reverse());
}
const ellipse=(cx,cy,rx,ry,d,n=32)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return[cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,d];});
// A broad modelled leaf with a raised midrib and closed backing. Widths are
// 60–120 mm, so foliage has physical mass rather than decorative noise.
function leaf(base,tip,width,rise,mat=MAT.plaster){
  const t=unit([tip[0]-base[0],tip[1]-base[1],0]),side=[-t[1],t[0],0],ts=[0,.33,.72,1],front=[],back=[];
  for(const q of ts){const p=base.map((v,k)=>v+(tip[k]-v)*q),w=Math.sin(q*Math.PI)*width/2;
    front.push([p.map((v,k)=>v-side[k]*w),[p[0],p[1],p[2]+Math.sin(q*Math.PI)*rise],p.map((v,k)=>v+side[k]*w)]);
    back.push([front.at(-1)[0].map((v,k)=>k===2?v-.008:v),front.at(-1)[2].map((v,k)=>k===2?v-.008:v)]);
  }
  for(let i=0;i<ts.length-1;i++){
    for(let k=0;k<2;k++)flat(mat,[front[i][k],front[i+1][k],front[i+1][k+1],front[i][k+1]]);
    flat(mat,[back[i][0],back[i][1],back[i+1][1],back[i+1][0]]);
    flat(mat,[front[i][0],back[i][0],back[i+1][0],front[i+1][0]]);flat(mat,[front[i][2],front[i+1][2],back[i+1][1],back[i][1]]);
  }
  // At each tip both sides converge on the same front/back edge; the two
  // side skins close it without a zero-area artificial cap.
}
function garland(cx,cy,w,d,depth){
  const path=Array.from({length:13},(_,i)=>{const t=i/12;return[cx+(t-.5)*w,cy-.30*Math.sin(t*Math.PI),d];});tube(path,.023,.014,MAT.gold,4);
  for(let i=2;i<path.length-1;i+=3){const p=path[i],sign=i<6?-1:1;
    leaf(p,[p[0]+sign*.12,p[1]+.14,p[2]],.105,depth*.15,MAT.plaster);
    leaf(p,[p[0]-sign*.08,p[1]-.16,p[2]],.100,depth*.15,MAT.plaster);
  }
  for(const sign of[-1,1]){const ps=Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2;return[cx+sign*w/2+Math.cos(a)*.074,cy+Math.sin(a)*.074,d];});tube(ps,.022,.012,MAT.gold,4,true);}
}
function capital(u,y,D){
  box(MAT.plaster,u,y+.07,D*.43,.26,.09,D*.71);
  horizontalProfile(u-.155,u+.155,y+.10,[[0,.014],[.07,.014],[.07,D*.92],[.045,D*.92],[.015,D*.70],[0,D*.70]],MAT.plaster);
  for(const sign of[-1,1]){
    leaf([u+sign*.035,y-.12,D*.50],[u+sign*.12,y+.035,D*.58],.11,D*.18);
    const pts=Array.from({length:14},(_,i)=>{const t=i/13,a=-.7+t*Math.PI*1.8,r=.025+.04*t;return[u+sign*(.10+Math.cos(a)*r),y+.012+Math.sin(a)*r,D*.68];});tube(pts,.020,D*.11,MAT.plaster,6);
  }
  box(MAT.gold,u,y+.115,D*.94,.24,.018,D*.05);
}
function support(u,y0,y1,D){
  const sections=[[y0,.135,.011,D*.65],[y0+.08,.135,.011,D*.65],[y0+.14,.100,.011,D*.60],[y0+.19,.082,.011,D*.63],[y1-.24,.082,.011,D*.63],[y1-.18,.105,.011,D*.76],[y1-.14,.105,.011,D*.76]];
  const S=12,rings=sections.map(([y,w,back,front])=>Array.from({length:S},(_,i)=>{const a=-i/S*Math.PI*2,flute=1-.10*Math.cos(a*8),c=Math.cos(a),ss=Math.sin(a);return[u+c*w*flute,y,(back+front)/2+ss*(front-back)/2*flute];}));
  for(let i=0;i<rings.length-1;i++)for(let k=0;k<S;k++)flat(MAT.plaster,[rings[i][k],rings[i][(k+1)%S],rings[i+1][(k+1)%S],rings[i+1][k]]);
  flat(MAT.plaster,[...rings[0]].reverse());flat(MAT.plaster,rings.at(-1));capital(u,y1-.11,D);
}
// Original rounded archivolts with real closed profile depth and stone joints.
function archProfile(cx,spring,rx,ry,profile,mat,steps=24){
  const rings=Array.from({length:steps+1},(_,i)=>{const a=i/steps*Math.PI;return profile.map(([o,d])=>[cx+Math.cos(a)*(rx+o),spring+Math.sin(a)*(ry+o),d]);});
  for(let i=0;i<steps;i++)for(let k=0;k<profile.length;k++)flat(mat,[rings[i][k],rings[i][(k+1)%profile.length],rings[i+1][(k+1)%profile.length],rings[i+1][k]]);
  flat(mat,[...rings[0]].reverse());flat(mat,rings.at(-1));
}
function archOutline(cx,base,spring,rx,ry,steps=24){return[[cx-rx,base],[cx+rx,base],[cx+rx,spring],...Array.from({length:steps},(_,i)=>{const a=(i+1)/steps*Math.PI;return[cx+Math.cos(a)*rx,spring+Math.sin(a)*ry];})];}
function clippedPolygon(subject,clip){
  const turn=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);let poly=subject;
  for(let k=0;k<clip.length&&poly.length;k++){const a=clip[k],b=clip[(k+1)%clip.length],out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=turn(a,b,p),dq=turn(a,b,q),ip=dp>=-1e-9,iq=dq>=-1e-9;if(ip)out.push(p);if(ip!==iq){const t=dp/(dp-dq);out.push(p.map((v,j)=>v+(q[j]-v)*t));}}poly=out;}return poly;
}
function shell(cx,base,w,h,D){
  const rows=[],R=4,S=16,back=D*.20;
  for(let j=1;j<=R;j++){const r=j/R;rows.push(Array.from({length:S+1},(_,i)=>{const a=i/S*Math.PI,flute=.5+.5*Math.cos(a*10);return[cx+Math.cos(a)*w/2*r,base+Math.sin(a)*h*r,back+Math.sin(Math.PI*r*.85)*D*(.25+.18*flute)];}));}
  const centre=[cx,base,back];for(let i=0;i<S;i++)flat(MAT.plaster,[centre,rows[0][i],rows[0][i+1]]);
  for(let j=0;j<R-1;j++)for(let i=0;i<S;i++)flat(MAT.plaster,[rows[j][i],rows[j+1][i],rows[j+1][i+1],rows[j][i+1]]);
  const outline=[centre,...rows.map(row=>row[0]),...rows.at(-1).slice(1),...rows.slice(0,-1).reverse().map(row=>row.at(-1))],backs=outline.map(([u,v])=>[u,v,back-.008]);
  flat(MAT.plaster,[...backs].reverse());
  for(let i=0;i<outline.length;i++){const j=(i+1)%outline.length;flat(MAT.plaster,[outline[i],backs[i],backs[j],outline[j]]);}
  for(let i=2;i<S;i+=4){const points=rows.map(row=>row[i].map((v,k)=>k===2?v+.004:v));tube([centre,...points],.010,D*.035,MAT.gold,4);}
}
function urn(cx,base,scale,D){
  const profile=[[0,.17],[.045,.17],[.08,.11],[.15,.08],[.22,.20],[.39,.28],[.49,.24],[.55,.15],[.60,.15],[.64,.20],[.68,.20]].map(([y,w])=>[base+y*scale,w*scale]);
  const S=12,rings=profile.map(([y,w])=>Array.from({length:S},(_,i)=>{const a=-i/S*Math.PI*2;return[cx+Math.cos(a)*w,y,.004+D*.24+Math.sin(a)*D*.20];}));
  for(let i=0;i<rings.length-1;i++)for(let k=0;k<S;k++)flat(i===0||i===8?MAT.gold:MAT.plaster,[rings[i][k],rings[i][(k+1)%S],rings[i+1][(k+1)%S],rings[i+1][k]]);
  flat(MAT.gold,[...rings[0]].reverse());flat(MAT.plaster,rings.at(-1));
  for(const sign of[-1,1]){const ps=Array.from({length:13},(_,i)=>{const a=i/12*Math.PI*1.5-Math.PI*.25;return[cx+sign*(.23+Math.cos(a)*.105)*scale,base+(.40+Math.sin(a)*.14)*scale,D*.27];});tube(ps,.028*scale,D*.11,MAT.gold,5);}
}
function lyre(cy,scale,D){
  for(const sign of[-1,1]){const arm=Array.from({length:15},(_,i)=>{const t=i/14;return[sign*(.13+.20*Math.sin(t*Math.PI*.72))*scale,cy+(-.44+.85*t)*scale,D*.43];});tube(arm,.042,D*.20,MAT.plaster,5);}
  tube([[-.29*scale,cy+.34*scale,D*.43],[.29*scale,cy+.34*scale,D*.43]],.041,D*.20,MAT.gold,6);
  tube([[-.13*scale,cy-.44*scale,D*.43],[.13*scale,cy-.44*scale,D*.43]],.045,D*.21,MAT.plaster,6);
  for(const x of[-.14,0,.14])box(MAT.gold,x*scale,cy,D*.49,.027,.64*scale,D*.09);
  garland(0,cy-.10,1.40*scale,D*.45,D);
}
function dado(site,D){
  const H=1.13,W=site.width;
  box(MAT.walnut,0,H/2,D*.25,W,H,D*.40);
  const panels=[[-.94,.57],[0,1.06],[.94,.57]];
  for(const[cx,w]of panels){box(MAT.green,cx,.56,D*.31,w,.84,D*.14);rectFrame(cx,.56,w,.84,[[0,D*.39],[.035,D*.39],[.063,D*.57],[.085,D*.57],[.101,D*.37],[.101,D*.30]],MAT.walnut);rectFrame(cx,.56,w-.12,.72,[[0,D*.59],[.012,D*.60],[.022,D*.60],[.022,D*.57]],MAT.gold);}
  horizontalProfile(-W/2,W/2,.025,[[0,.006],[.12,.006],[.12,D*.60],[.08,D*.70],[0,D*.70]],MAT.walnut);
  horizontalProfile(-W/2,W/2,H-.035,[[0,.008],[.105,.008],[.105,D*.85],[.073,D*.85],[.045,D*.65],[0,D*.65]],MAT.walnut);
  box(MAT.gold,0,H+.055,D*.86,W,.022,D*.035);
  // One causal ceramic repair follows the exposed corner, not random noise.
  if(site.id==='ground-south-west')extrudedPolygon(MAT.biscuit,[[-1.22,.17],[-1.02,.17],[-1.22,.36]],D*.39,D*.42);
}
function cornice(site,D){
  const H=site.height,W=site.width;
  horizontalProfile(-W/2,W/2,H-.31,[[0,.008],[.31,.008],[.31,D],[.23,D],[.195,D*.73],[.16,D*.73],[.127,D*.52],[.08,D*.43],[.035,D*.68],[0,D*.68]],MAT.plaster);
  box(MAT.gold,0,H-.271,D*.70,W,.027,D*.04);
  for(let i=0;i<11;i++)box(MAT.plaster,-1.17+i*.234,H-.315,D*.55,.115,.105,D*.43);
  for(const u of[-1.14,1.14])box(MAT.walnut,u,H-.353,D*.28,.10,.115,D*.42);
}
function aedicule(site,anomaly,D){
  const H=site.height,spring=H-1.18,base=2.065,ri=.56,ro=.85,cy=(base+spring)/2;
  const record={type:'blind arched aedicule',anomaly,baseM:base,springM:spring,innerRadiusM:ri,outerRadiusM:ro,pairedSupports:true,profileM:[],voussoirs:13,keystone:true,openingIsUsable:false};
  for(const sign of[-1,1])for(const u of[.86,1.10])support(sign*u,1.20,spring-.02,D);
  for(const sign of[-1,1])horizontalProfile(sign<0?-1.295:.72,sign<0?-.72:1.295,spring-.07,[[0,.01],[.13,.01],[.13,D*.86],[.09,D*.94],[.04,D*.85],[0,D*.70]],MAT.plaster);
  const profile=[[0,.021],[0,D*.57],[.035,D*.57],[.065,D*.83],[.105,D*.94],[.145,D*.94],[.180,D*.65],[.205,D*.71],[.240,D*.71],[.240,.021]];
  archProfile(0,spring,ri,ri,profile,MAT.plaster);record.profileM=profile;
  archProfile(0,spring,ri+.172,ri+.172,[[0,D*.67],[0,D*.75],[.025,D*.75],[.025,D*.67]],MAT.gold,24);
  for(let k=0;k<13;k++){const a=k/13*Math.PI+.007,b=(k+1)/13*Math.PI-.007,outline=[];for(let j=0;j<=3;j++){const t=a+(b-a)*j/3;outline.push([Math.cos(t)*ro,spring+Math.sin(t)*ro]);}for(let j=3;j>=0;j--){const t=a+(b-a)*j/3;outline.push([Math.cos(t)*.795,spring+Math.sin(t)*.795]);}extrudedPolygon(k===6?MAT.ochre:MAT.plaster,outline,D*.29,D*(k===6?.99:.79));}
  extrudedPolygon(MAT.plaster,[[-.075,spring+.74],[.075,spring+.74],[.115,spring+.90],[-.115,spring+.90]],D*.60,D);
  horizontalProfile(-1.10,1.10,base-.14,[[0,.010],[.14,.010],[.14,D*.90],[.10,D*.99],[.055,D*.99],[.01,D*.72],[0,D*.72]],MAT.plaster);
  const backing=archOutline(0,base,spring,.555,.555);extrudedPolygon(MAT.joint,backing,.015,.030);
  if(anomaly==='bricked former window'){
    const opening=archOutline(0,base+.035,spring,.515,.515),course=.165;
    for(let row=0;row<Math.ceil((spring+.53-base)/course);row++)for(let col=-3;col<=3;col++){
      const x=col*.29+(row%2?.145:0),y=base+.035+row*course;
      const poly=clippedPolygon([[x-.137,y+.009],[x+.137,y+.009],[x+.137,y+course-.009],[x-.137,y+course-.009]],opening);
      if(poly.length>=3)extrudedPolygon((row+col)%4===0?MAT.paint:MAT.biscuit,poly,.027,.047+((row+col+12)%3)*.004);
    }
    // Original walnut glazing bars survive on either side of the later plug.
    for(const x of[-.545,.545])box(MAT.walnut,x,cy,D*.42,.024,spring-base,D*.15);
    record.construction='Original arched rebate and glazing stiles remain around individually jointed later masonry.';
    record.infill={type:'individual brick courses',frontM:.055,archRadiusM:.515,jointM:.018};
  }else if(anomaly==='narrowed repair'){
    extrudedPolygon(MAT.plaster,archOutline(0,base+.025,spring,.522,.522),.023,.049);
    // This later repair actually crosses and buries the older inner bead.
    extrudedPolygon(MAT.paint,[[-.75,base+.01],[-.20,base+.01],[-.20,spring+.13],[-.34,spring+.38],[-.64,spring+.28]],.047,D*.96);
    const cx=.17,nr=.325,ns=spring-.04;
    extrudedPolygon(MAT.joint,archOutline(cx,base+.08,ns,nr,nr+.05),.049,.057);
    extrudedPolygon(MAT.paint,archOutline(cx,base+.10,ns,nr-.045,nr+.005),.058,.069);
    archProfile(cx,ns,nr,nr+.05,[[0,.058],[0,D*.78],[.035,D*.87],[.075,D*.87],[.105,D*.72],[.105,.058]],MAT.paint,24);
    for(const sign of[-1,1])box(MAT.paint,cx+sign*(nr+.05),(base+ns)/2,D*.66,.105,ns-base,D*.48);
    record.construction='A later offset narrow arch cuts through a broad repair that physically buries the earlier inner moulding.';
    record.infill={type:'offset narrow repair',centreM:cx,originalWidthM:ri*2,repairedWidthM:nr*2,coveredOlderMoulding:true};
  }else if(anomaly==='inward strain and displaced cornice'){
    const outline=[[-.505,base+.04],[.505,base+.04],[.28,spring],...Array.from({length:24},(_,i)=>{const a=(i+1)/24*Math.PI;return[Math.cos(a)*.28,spring+Math.sin(a)*.51];})];
    extrudedPolygon(MAT.paint,outline,.028,.047);
    // The older outer order stays exact. A separate inner jamb visibly leans
    // into its infill, leaving a widening physical dark joint behind it.
    for(const sign of[-1,1])extrudedPolygon(MAT.plaster,[[sign*.57,base],[sign*.385,spring],[sign*.28,spring],[sign*.485,base]],.028,D*.77);
    archProfile(0,spring,.28,.51,[[0,.034],[0,D*.64],[.050,D*.83],[.095,D*.83],[.125,.034]],MAT.plaster,24);
    const fold=[[-.49,spring-.29,D*.73],[-.29,spring-.29,D*.73],[-.10,spring-.34,D*.45],[.025,spring-.48,.027],[.145,spring-.62,.027],[.29,spring-.64,D*.64],[.49,spring-.64,D*.73]];
    const section=[[-.075,-.015],[-.075,.009],[-.055,.018],[-.035,.018],[-.017,.006],[.015,.003],[.035,.012],[.060,.012],[.075,-.006],[.075,-.015]];
    sweptCornice(fold,section,MAT.plaster);
    record.construction='An undisturbed outer arch contains inward leaning inner jambs; its cornice enters behind the infill and returns 350 mm lower.';
    record.infill={type:'inward strained plug',baseWidthM:1.01,springWidthM:.56,frontM:.047};
    record.foldedCornice={path:fold,section,sectionHeightM:.15,fallM:.35,infillFrontM:.047,hiddenDepthM:.027,reappears:true};
  }else{
    extrudedPolygon(MAT.green,archOutline(0,base+.045,spring,.515,.515),.023,.037);
    urn(0,base+.04,.98,D);shell(0,spring-.01,.89,.41,D);
    record.construction='Intact original ornamental blind niche: polished ceramic back, gilded urn, scallop and retained carved order.';
    record.infill={type:'original ornamental blind niche',frontM:.037};
  }
  garland(0,1.71,1.40,D*.45,D);
  return record;
}
function subordinate(site,index,D){
  const H=site.height,ph=H-1.69,pc=1.32+ph/2;
  for(const u of[-1.10,1.10])support(u,1.18,H-.40,D);
  rectFrame(0,pc,1.80,ph,[[0,.015],[.042,.015],[.070,D*.42],[.105,D*.60],[.142,D*.60],[.170,D*.34],[.170,.015]],MAT.plaster);
  const type=index%2?'shell and urn trophy':'musical trophy';
  if(index%2){urn(0,pc-.44,Math.min(1.05,ph/1.5),D);shell(0,pc+.28,1.03,Math.min(.49,ph*.24),D);garland(0,pc-.24,1.38,D*.45,D);}
  else{lyre(pc-.05,Math.min(1.06,ph/1.7),D);shell(0,pc+.48,.84,Math.min(.38,ph*.20),D);}
  return{type,anomaly:null,profileM:'mitered bolection with fluted supports, broad acanthus capitals and gilded festoon',openingIsUsable:false};
}

const majorSites=new Map([['ground-east-north',null],['ground-south-east','bricked former window'],['ground-west-south','narrowed repair'],['upper-west-south','inward strain and displaced cornice']]);
let index=0;
for(const site of MAIN_STAIR_WALL_SITES){
  currentSite=site;const before=new Map([...groups].map(([mat,g])=>[mat,{vertices:g.positions.length/3,indices:g.indices.length}]));
  const H=site.height,W=site.width,D=site.maxProjection-.01;
  box(site.kind==='overpainted'?MAT.paint:MAT.plaster,0,H/2,.0095,W,H,.007);
  dado(site,D);cornice(site,D);
  const architecture=majorSites.has(site.id)?aedicule(site,majorSites.get(site.id),D):subordinate(site,index,D);
  for(const[mat,g]of groups){const start=before.get(mat)||{vertices:0,indices:0};if(g.indices.length>start.indices)g.sites.push({id:site.id,firstIndex:start.indices,indexCount:g.indices.length-start.indices});}
  siteRecords.push({id:site.id,origin:site.origin,normal:site.normal,tangent:site.tangent,width:W,height:H,kind:site.kind,architecture,designProjectionM:[.006,D],belowHeadMaximumProjectionM:.025,shallowUntilLocalHeightM:2,fullDepthFromLocalHeightM:2.30});
  index++;
}

const chunks=[],bufferViews=[],accessors=[];let offset=0;
const pad4=n=>(n+3)&~3;
function append(array,target){const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});chunks.push(bytes);offset+=bytes.length;const pad=pad4(offset)-offset;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}return index;}
function accessor(array,componentType,type,target,min,max){const sizes={VEC3:3,SCALAR:1},a={bufferView:append(array,target),componentType,count:array.length/sizes[type],type};if(min)a.min=min;if(max)a.max=max;accessors.push(a);return accessors.length-1;}
function bounds(ps){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<ps.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],ps[i+k]);max[k]=Math.max(max[k],ps[i+k]);}return{min,max};}
let triangles=0,vertices=0;const primitives=[];
for(const [material,g] of groups){const p=new Float32Array(g.positions),n=new Float32Array(g.normals),ix=new Uint32Array(g.indices),b=bounds(p);primitives.push({attributes:{POSITION:accessor(p,5126,'VEC3',34962,b.min,b.max),NORMAL:accessor(n,5126,'VEC3',34962)},indices:accessor(ix,5125,'SCALAR',34963,[0],[p.length/3-1]),material,mode:4,extras:{siteIndexRanges:g.sites}});triangles+=ix.length/3;vertices+=p.length/3;}
const bin=Buffer.concat(chunks,offset),b=bounds([...groups.values()].flatMap(g=>g.positions));
const gltf={asset:{version:'2.0',generator:'Chunk Surfer build-main-stair-walls.mjs'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'main_stair_wall_treatment',mesh:0}],meshes:[{name:'main_stair_wall_treatment',primitives,extras:{origin:MAIN_STAIR_WALL_ORIGIN,sites:siteRecords,faces:[],architectureRevision:2}}],materials,accessors,bufferViews,buffers:[{byteLength:bin.length}]};
const jr=Buffer.from(JSON.stringify(gltf)),json=Buffer.concat([jr,Buffer.alloc(pad4(jr.length)-jr.length,32)]),total=12+8+json.length+8+bin.length;
const head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
if(triangles>50000||total>2*1024*1024)throw new Error(`Wall pack exceeds budget: ${triangles} triangles / ${total} bytes`);
fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,Buffer.concat([head,jh,json,bh,bin]));
const sha256=crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const refs=[{title:'V&A Ceramic Staircase',role:'reference only; ceramic dado, architectural hierarchy and original construction',url:'https://www.vam.ac.uk/articles/history-of-the-ceramics-galleries-and-ceramic-staircase',license:'No source imagery or geometry used'},{title:'Sir John Soane Museum, Robert Adam drawings, volume 26/149',role:'reference only; architectural ornament as an integrated order',url:'https://collections.soane.org/OBJECT1666',license:'No source imagery or geometry used'}];
const stats={version:MAIN_STAIR_WALL_TREATMENT_VERSION,architectureRevision:2,bytes:total,totalTriangles:triangles,vertices,materialBatches:primitives.length,meshes:1,origin:MAIN_STAIR_WALL_ORIGIN,bounds:b,maximumProjectionM:.15,minimumProjectionM:.006,belowHeadMaximumProjectionM:.025,shallowUntilLocalHeightM:2,fullDepthFromLocalHeightM:2.30,sites:siteRecords,faces:[],features:{continuousPlasterFields:true,glazedCeramicDado:true,polishedWalnutWainscot:true,waterGilding:true,flutedPairedSupports:true,broadAcanthusCapitals:true,closedProfileCornices:true,dentilCornices:true,miteredBolectionFrames:true,broadLaurelGarlands:true,shellAndUrnTrophies:true,musicalTrophies:true,blindArchedAedicules:4,architecturalAnomalies:3,continuousHeightfieldMasks:0,newLights:0,newCollision:false,worldAnchored:true},sha256};
fs.writeFileSync(OUT.replace('.glb','.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(OUT.replace('.glb','.credits.json'),JSON.stringify({pack:{filename:path.basename(OUT),author:'Chunk Surfer project',source:'tools/chunk_surfer/build-main-stair-walls.mjs',license:'project source',origin:'Original deterministic geometry; no downloaded imagery, textures or meshes.',sha256,triangles,bytes:total},references:refs,meshes:[{name:'main_stair_wall_treatment',bounds:b,triangles,provenance:{source:'tools/chunk_surfer/build-main-stair-walls.mjs',license:'project source'}}]},null,2)+'\n');
console.log(`wrote ${path.relative(ROOT,OUT)} (${total} bytes, ${triangles} triangles, ${primitives.length} batches)`);
