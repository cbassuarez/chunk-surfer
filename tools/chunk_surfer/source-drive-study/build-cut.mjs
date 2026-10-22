// The Cut — layered, physically scaled roadside anatomy. No production files.
// node tools/chunk_surfer/source-drive-study/build-cut.mjs
// Game coordinates: +X away from the right roadside, +Y up, ±Z along road.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),OUT=path.join(ROOT,'artifacts/source-drive-study/cut');
fs.mkdirSync(OUT,{recursive:true});
const TAU=Math.PI*2, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);},rnd=(n)=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);};
let crcTable;
function crc(buf){crcTable??=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const x of buf)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function png(w,h,pix){const chunk=(name,data)=>{const t=Buffer.from(name),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),8+data.length);return b;};const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=6;const rows=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)Buffer.from(pix.buffer,pix.byteOffset+y*w*4,w*4).copy(rows,y*(w*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
// These periodic maps use an authored physical repeat, not an arbitrary object box.
// Broad anatomy remains geometry. Maps provide pores, wetness, fibres and deposits.
const FAMILIES={
 bone:{base:[.46,.395,.29],rough:.43,metal:0,period:3.5,depth:.0035,kind:'bone'},
 fascia:{base:[.205,.034,.029],rough:.30,metal:0,period:2.6,depth:.005,kind:'fibre'},
 membrane:{base:[.36,.215,.168],rough:.34,metal:0,period:3,depth:.0028,kind:'sheet'},
 mineral:{base:[.23,.225,.196],rough:.83,metal:0,period:3,depth:.008,kind:'stone'},
 concrete:{base:[.083,.091,.085],rough:.81,metal:0,period:2,depth:.005,kind:'concrete'},
 hardware:{base:[.12,.074,.039],rough:.63,metal:.55,period:.65,depth:.0015,kind:'metal'},
 cavity:{base:[.019,.0055,.005],rough:.48,metal:0,period:2.6,depth:.003,kind:'fibre'}
};
const textures=new Map();
function texture(family){if(textures.has(family))return textures.get(family);const q=FAMILIES[family],N=family==='hardware'?256:512,H=new Float32Array(N*N),V=new Float32Array(N*N),wet=new Float32Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/N,v=y/N,slow=Math.sin(TAU*(u*3+v*2))*.22+Math.sin(TAU*(u*7-v*5))*.14,grain=(rnd(x+y*N+13)-.5),fiber=Math.sin(TAU*(u*43+.28*Math.sin(TAU*v*3)+.07*Math.sin(TAU*v*11))),fine=Math.sin(TAU*(u*101+.11*Math.sin(TAU*v*7)));let h,variation;
  if(q.kind==='bone'){h=slow*.23+Math.sin(TAU*(u*21+v*2))*.12+grain*.25;variation=slow*.34+grain*.04;}
  else if(q.kind==='fibre'){h=fiber*.16+fine*.08+slow*.065+grain*.07;variation=slow*.20+fiber*.055+fine*.025;}
  else if(q.kind==='sheet'){h=fiber*.12+slow*.13+grain*.13;variation=slow*.22+fiber*.035;}
  else {h=slow*.025+grain*.48+Math.sin(TAU*u*17)*Math.sin(TAU*v*23)*.025;variation=slow*.4+grain*.15;}
  const drain=Math.max(0,Math.sin(TAU*(u*11+.06*Math.sin(TAU*v*2))))**10*(.4+.6*v);H[y*N+x]=h;V[y*N+x]=variation;wet[y*N+x]=drain;
 }
 const albedo=new Uint8Array(N*N*4),normal=new Uint8Array(N*N*4),orm=new Uint8Array(N*N*4);let means=[0,0,0],roughRange=[1,0];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,k=i*4,variation=V[i],drain=wet[i],fibre=H[i],vein=Math.max(0,Math.sin(TAU*(x/N*9+.18*Math.sin(TAU*y/N*2))))**28,scale=q.depth*N/q.period;const dx=(H[y*N+(x+1)%N]-H[y*N+(x+N-1)%N])*.5*scale,dy=(H[((y+1)%N)*N+x]-H[((y+N-1)%N)*N+x])*.5*scale,n=unit([-dx,-dy,1]);let rough=clamp(q.rough+variation*.18-drain*(family==='fascia'||family==='membrane'?.13:.08),.16,.94);roughRange=[Math.min(roughRange[0],rough),Math.max(roughRange[1],rough)];
  for(let c=0;c<3;c++){let linear=q.base[c]*(1+variation);if(family==='bone'||family==='membrane')linear*=1-vein*.27*(c===0?.35:1);if(family==='concrete'||family==='mineral')linear*=1-drain*.28;linear=clamp(linear);albedo[k+c]=Math.round(srgb(linear)*255);means[c]+=linear/(N*N);normal[k+c]=Math.round(clamp(n[c]*.5+.5)*255);}
  albedo[k+3]=normal[k+3]=orm[k+3]=255;orm[k]=Math.round((1-clamp(-fibre*.05,0,.1))*255);orm[k+1]=Math.round(rough*255);orm[k+2]=Math.round(q.metal*255);
 }
 const maps={albedo:png(N,N,albedo),normal:png(N,N,normal),orm:png(N,N,orm),size:N,linearMean:means,roughRange,repeatMetres:q.period};textures.set(family,maps);return maps;
}
// Mesh topology is shared by base and all four authored deformation targets.
function geom(name,material){return{name,material,p:[],uv:[],ids:[],dynamic:false};}
function vertex(g,p,uv=[p[2]/FAMILIES[g.material].period,p[1]/FAMILIES[g.material].period]){const n=g.p.length/3;g.p.push(...p);g.uv.push(...uv);return n;}
function tri(g,a,b,c){g.ids.push(a,b,c);}
function quad(g,a,b,c,d){tri(g,a,b,c);tri(g,a,c,d);}
function normals(p,ids){const n=new Float32Array(p.length);for(let i=0;i<ids.length;i+=3){const a=ids[i]*3,b=ids[i+1]*3,c=ids[i+2]*3,v=cross(sub(p.slice(b,b+3),p.slice(a,a+3)),sub(p.slice(c,c+3),p.slice(a,a+3)));for(const k of[a,b,c])for(let j=0;j<3;j++)n[k+j]+=v[j];}for(let i=0;i<n.length;i+=3){const v=unit(Array.from(n.slice(i,i+3)));n.set(v,i);}return Array.from(n);}
function tube(g,points,radii,segments=14,flatten=1){const start=g.p.length/3;let previousRight=null;for(let j=0;j<points.length;j++){const axis=unit(sub(points[Math.min(j+1,points.length-1)],points[Math.max(0,j-1)]));let right=unit(cross(axis,Math.abs(axis[0])<.85?[1,0,0]:[0,1,0]));if(previousRight&&right.reduce((v,x,k)=>v+x*previousRight[k],0)<0)right=mul(right,-1);previousRight=right;const up=unit(cross(axis,right)),r=Array.isArray(radii)?radii[j]:radii;for(let k=0;k<segments;k++){const a=k/segments*TAU,flute=g.material==='bone'?1+.09*Math.sin(a*3+j*.21)+.035*Math.sin(a*7-j*.13):1,v=add(points[j],add(mul(right,Math.cos(a)*r*flute),mul(up,Math.sin(a)*r*flatten*flute)));vertex(g,v,[j/(points.length-1)*Math.max(1,points.length*.13),k/segments]);if(j){const i=start+j*segments+k,ip=start+j*segments+(k+1)%segments;quad(g,i-segments,ip-segments,ip,i);}}}
 const c0=vertex(g,points[0],[0,0]),c1=vertex(g,points.at(-1),[1,1]);for(let k=0;k<segments;k++){tri(g,c0,start+(k+1)%segments,start+k);tri(g,c1,start+(points.length-1)*segments+k,start+(points.length-1)*segments+(k+1)%segments);}}
function box(g,c,s){const h=s.map(v=>v/2),bevel=Math.min(.035,...s.map(v=>v*.22));for(let axis=0;axis<3;axis++)for(const sign of[-1,1]){const u=(axis+1)%3,v=(axis+2)%3,us=[-h[u],-h[u]+bevel,h[u]-bevel,h[u]],vs=[-h[v],-h[v]+bevel,h[v]-bevel,h[v]],start=g.p.length/3;for(let j=0;j<4;j++)for(let i=0;i<4;i++){const p=[0,0,0];p[axis]=sign*h[axis];p[u]=us[i];p[v]=vs[j];const inset=p.map((q,k)=>clamp(q,-h[k]+bevel,h[k]-bevel)),delta=sub(p,inset),r=unit(delta);vertex(g,add(c,add(inset,mul(r,bevel))));if(i&&j){const k=start+j*4+i,ids=[k-5,k-4,k,k-1];const p0=g.p.slice(ids[0]*3,ids[0]*3+3),p1=g.p.slice(ids[1]*3,ids[1]*3+3),p2=g.p.slice(ids[2]*3,ids[2]*3+3),n=cross(sub(p1,p0),sub(p2,p0));if(n[axis]*sign<0)ids.reverse();quad(g,...ids);}}}}
const staticG=[],livingG=[];
// Continuous buttressed mineral mass. The low section is a recognizable retaining cut.
const rock=geom('cut_geology','mineral');{const C=96,R=34;for(let y=0;y<=R;y++)for(let z=0;z<=C;z++){const zz=-12+24*z/C,t=y/R,top=15.3+1.4*Math.sin(zz*.17)+.65*Math.sin(zz*.51),yy=t*top;const xx=5.1+1.15*Math.sin(t*3.7+zz*.18)+.38*Math.sin(zz*1.14+yy*.7)+2.2*t*t;vertex(rock,[xx,yy,zz]);if(y&&z){const i=y*(C+1)+z;quad(rock,i-C-2,i-C-1,i,i-1);}}}staticG.push(rock);
const ribs=geom('cut_ribs','bone');
// Flattened interrupted buttresses, not a row of complete architectural arches.
// The three major supports have distinct loads, angles and termination points.
function bezier(points,t){const u=1-t;return points[0].map((_,k)=>u*u*u*points[0][k]+3*u*u*t*points[1][k]+3*u*t*t*points[2][k]+t*t*t*points[3][k]);}
const supports=[
 {points:[[3.1,.6,-11.3],[1.6,5.6,-12.0],[1.9,11.8,-10.4],[4.2,15.0,-6.1]],width:1.02,flat:.43},
 {points:[[2.9,1.0,-5.8],[1.3,10.8,-4.8],[3.6,14.4,1.5],[3.0,4.1,5.9]],width:.94,flat:.46},
 {points:[[3.6,.7,10.8],[1.2,5.4,6.9],[3.8,12.8,8.6],[4.8,16.1,11.8]],width:1.17,flat:.37},
 {points:[[3.5,12.7,-1.4],[2.1,10.8,1.7],[1.8,6.6,1.5],[3.1,3.3,3.4]],width:.57,flat:.48},
 {points:[[3.5,11.2,-6.6],[2.0,9.5,-5.4],[2.6,5.8,-7.3],[3.4,3.9,-8.1]],width:.63,flat:.43}
];
for(const [i,q]of supports.entries()){const pts=[],r=[];for(let j=0;j<=52;j++){const t=j/52,p=bezier(q.points,t);p[0]+=.13*Math.sin(t*9.5+i)*Math.sin(t*Math.PI);p[2]+=.14*Math.sin(t*8+i)*Math.sin(t*Math.PI);pts.push(p);r.push(q.width*(.46+.51*Math.sin(t*Math.PI)**1.3+.075*Math.sin(t*12.4+i)));}tube(ribs,pts,r,20,q.flat);}
// Partial collateral branches die into the tissue instead of closing into windows.
for(const [i,points]of [ [[3.2,12.3,-2.1],[2.1,10.9,-.8],[2.6,8.6,-2.0],[3.5,7.3,-3.1]], [[3.7,12.8,9.2],[2.4,11.0,6.8],[2.7,9.1,5.2],[3.5,8.3,4.3]] ].entries()){const p=[],r=[];for(let j=0;j<=30;j++){const t=j/30;p.push(bezier(points,t));r.push(.46*(1-t)+.13);}tube(ribs,p,r,14,.42);}
// A broken oblique ivory lamina links the mass without an even horizontal cadence.
{const p=[],r=[];for(let j=0;j<=64;j++){const z=-12+24*j/64;p.push([3.8+.34*Math.sin(z*.33),10.8+.17*z+.6*Math.sin(z*.25),z]);r.push(.29+.08*Math.sin(j*.21));}tube(ribs,p,r,14,.44);}staticG.push(ribs);
const concrete=geom('cut_retaining','concrete');
// Broken retaining remnants reveal the low living layer from the seated eye.
// The end abutments and narrow bolt-bearing posts keep their structural roots.
const retainedPanelHeights=[2.9,1.32,1.65,1.22,0,1.34,1.52,2.9];
for(let j=0;j<8;j++){const z=-10.5+j*3,h=retainedPanelHeights[j];if(j===4)continue;
 if(j===0||j===7){box(concrete,[.8,h/2,z],[.72,h,2.91]);box(concrete,[.72,h+.02,z],[.9,.20,2.96]);}
 else{const front=[],back=[],outline=[[-1.455,0],[1.455,0],[1.455,h*.85],[.83,h*.97],[-.26,h*.81],[-1.455,h]];
  for(const[zz,yy]of outline){const x=.44+(j===5?.24:.09)*yy;front.push(vertex(concrete,[x,yy,z+zz]));back.push(vertex(concrete,[x+.72,yy,z+zz]));}
  for(let k=1;k<outline.length-1;k++){tri(concrete,front[0],front[k+1],front[k]);tri(concrete,back[0],back[k],back[k+1]);}
  for(let k=0;k<outline.length;k++)quad(concrete,front[k],back[k],back[(k+1)%outline.length],front[(k+1)%outline.length]);
  // Existing hardware stays bolted to a narrow surviving reinforced spine.
  box(concrete,[.80,1.24,z],[.72,2.48,.30]);
 }
 if(j===0||j===7)box(concrete,[1.03,1.5,z-1.42],[1.02,3.15,.27]);
}
// One released panel remains supported by a fixed base and has thick broken edges.
box(concrete,[.90,.34,1.62],[.74,.68,2.75]);staticG.push(concrete);
const fittings=geom('cut_fittings','hardware');
for(let j=0;j<8;j++){const z=-10.5+j*3;for(const y of[.65,2.24]){box(fittings,[.415,y,z],[.032,.28,.28]);tube(fittings,[[.26,y,z],[.47,y,z]],.052,12);}if(j===4)continue;tube(fittings,[[.12,3.05,z-1.1],[.08,3.3,z-1.1],[.08,3.3,z+1.1],[.12,3.05,z+1.1]],.038,10);}
for(const z of[-7.6,.2,8.3]){for(const y of[4.3,8.8,12.1]){box(fittings,[1.25,y,z],[.11,.48,.52]);tube(fittings,[[1.12,y,z],[2.1,y+.1,z+.1]],.058,12);}}staticG.push(fittings);
const debris=geom('cut_rubble','mineral');for(let i=0;i<46;i++){const z=-12+24*rnd(i+71),x=.9+2*rnd(i+180),r=.12+.34*rnd(i+420),p=[];for(let j=0;j<6;j++){const a=j/6*TAU;p.push([x+r*Math.cos(a),r*.65+(j%2)*r*.15,z+r*Math.sin(a)]);}const b=p.map(q=>vertex(debris,q)),top=vertex(debris,[x+.13*rnd(i),r*2,z]);for(let j=0;j<6;j++)tri(debris,b[j],b[(j+1)%6],top);}staticG.push(debris);
const cavity=geom('cut_cavity_depth','cavity');for(const zc of[-8,0,8]){const p=[];for(let j=0;j<=36;j++){const t=j/36*Math.PI;p.push([5.5,1.2+Math.sin(t)*9.2,zc-Math.cos(t)*2.75]);}tube(cavity,p,.53,12,.45);box(cavity,[6.05,5.2,zc],[.24,9.8,5.6]);}staticG.push(cavity);
const holes=[[-7.7,5.8,1.4,3.9],[.15,6.5,1.85,4.65],[8.0,5.65,1.25,3.6],[1.5,1.95,1.60,1.18]];
const withinHole=(z,y,scale=1)=>holes.some(([zc,yc,rz,ry])=>((z-zc)/(rz*scale))**2+((y-yc)/(ry*scale))**2<1);
function sheet(name,material,cols,rows,formula,cutHoles=true){const g=geom(name,material);g.dynamic=true;for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const z=-12+24*i/cols,v=j/rows,y=.32+v*14.5;vertex(g,formula(z,y,v));if(i&&j){const zz=-12+24*(i-.5)/cols,yy=.32+(j-.5)/rows*14.5;if(!cutHoles||!withinHole(zz,yy,typeof cutHoles==='number'?cutHoles:1)){const k=j*(cols+1)+i;quad(g,k-cols-2,k-cols-1,k,k-1);}}}
 // Every exposed cut edge is given a 7 cm physical thickness, including the holes.
 const edges=new Map();for(let i=0;i<g.ids.length;i+=3)for(const[a,b]of[[g.ids[i],g.ids[i+1]],[g.ids[i+1],g.ids[i+2]],[g.ids[i+2],g.ids[i]]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}for(const[a,b]of edges.values()){const p=g.p.slice(a*3,a*3+3),q=g.p.slice(b*3,b*3+3),c=vertex(g,add(p,[.075,0,0]),g.uv.slice(a*2,a*2+2)),d=vertex(g,add(q,[.075,0,0]),g.uv.slice(b*2,b*2+2));quad(g,a,c,d,b);}return g;}
const fascia=sheet('cut_fascia','fascia',108,64,(z,y,v)=>[3.10+.36*Math.sin(z*.84+y*.35)+.23*Math.sin(y*1.5-z*.7)+.07*Math.sin(z*6+y*1.8),y,z]);livingG.push(fascia);
// Torn collagen wrapping is built as separate thick folds. No flat white curtain.
function patch(g,cols,rows,fn,skip=null,thickness=.13){const start=g.p.length/3;for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const p=fn(i/cols,j/rows);vertex(g,p);if(i&&j){const center=fn((i-.5)/cols,(j-.5)/rows);if(!skip||!skip(center)){const k=start+j*(cols+1)+i;quad(g,k-cols-2,k-cols-1,k,k-1);}}}const edge=new Map();for(let k=0;k<g.ids.length;k+=3)for(const[a,b]of[[g.ids[k],g.ids[k+1]],[g.ids[k+1],g.ids[k+2]],[g.ids[k+2],g.ids[k]]]){if(a<start||b<start)continue;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edge.has(key))edge.delete(key);else edge.set(key,[a,b]);}for(const[a,b]of edge.values()){const p=g.p.slice(a*3,a*3+3),q=g.p.slice(b*3,b*3+3),c=vertex(g,add(p,[thickness,0,0])),d=vertex(g,add(q,[thickness,0,0]));quad(g,a,c,d,b);}}
// Broad wet muscular/fascial strata roll over one another with real self-occlusion.
for(const[k,level]of [5.1,8.35].entries())patch(fascia,104,22,(u,v)=>{const z=-12+24*u,center=level+.8*Math.sin(z*.30+k)+.33*Math.sin(z*.77),w=1.8+.5*Math.sin(z*.21+k);return[3.55-1.55*Math.sin(v*Math.PI)+.30*Math.sin(z*.39+k),center+(v-.5)*w,z];},p=>k===0&&((p[2]-1.5)/1.7)**2+((p[1]-2.0)/1.3)**2<1,.28);
// A thick sheared flank runs obliquely across the open bays, fading into the ridge.
patch(fascia,96,14,(u,v)=>{const z=-12+24*u,y=4.8+.24*(z+12)+.7*Math.sin(z*.31);return[3.35-1.0*Math.sin(v*Math.PI)+.22*Math.sin(z*.6),y+(v-.5)*1.1,z];},null,.22);
const membrane=geom('cut_membrane','membrane');membrane.dynamic=true;
// Upper hanging mantle peels out of the actual cliff mass, exposing its underside.
patch(membrane,108,20,(u,v)=>{const z=-12+24*u,edge=10.45+1.1*Math.sin(z*.43)+.45*Math.sin(z*1.19),fold=Math.sin(v*Math.PI);return[1.45+3.5*v-.75*fold+.21*Math.sin(z*.71)*fold,edge+(16.1-edge)*v+.13*Math.sin(z*3.7)*(1-v)**3,z];},null,.18);
// A low rolled edge meets the retaining wall, with a directly inspectable cavity.
const closeHole=p=>((p[2]-1.5)/1.65)**2+((p[1]-1.95)/1.25)**2<1;
patch(membrane,108,20,(u,v)=>{const z=-12+24*u,top=3.75+.52*Math.sin(z*.57)+.38*Math.sin(z*1.31);return[2.9-1.15*v-.50*Math.sin(v*Math.PI)+.11*Math.sin(z*2.7)*v,.32+(top-.32)*v,z];},closeHole,.16);
// Narrow irregular wrapping tongues follow the supports rather than fill the bays.
for(const [k,zc]of[-11.45,-4.35,4.05,11.55].entries())patch(membrane,12,56,(u,v)=>{const y=2.2+v*11.8,w=.45+.17*Math.sin(y*.61+k);return[1.70+.43*Math.sin(v*4.2+k)+.20*Math.cos(u*Math.PI*2),y,zc+(u-.5)*w*2+.38*Math.sin(y*.34+k)];},null,.12);
// Irregular cavity rims expose real layered depth, not printed dark ovals.
for(const [zc,yc,rz,ry]of holes){const p=[],r=[];for(let i=0;i<=64;i++){const a=i/64*TAU;p.push([2.43+.24*Math.sin(a*3+zc),yc+Math.sin(a)*ry,zc+Math.cos(a)*rz]);r.push(.13+.11*(.5+.5*Math.cos(a*5+zc)));}tube(membrane,p,r,12,.65);}
// Grounded open socket at the missing retaining panel, lit by dipped headlamps.
{const p=[],r=[];for(let i=0;i<=56;i++){const a=i/56*TAU;p.push([1.30+.28*Math.cos(a*2),1.95+Math.sin(a)*1.20,1.5+Math.cos(a)*1.65]);r.push(.17+.065*Math.cos(a*3));}tube(membrane,p,r,14,.8);const inner=[],ri=[];for(let i=0;i<=56;i++){const a=i/56*TAU;inner.push([1.70+.22*Math.cos(a*2),1.95+Math.sin(a)*1.04,1.5+Math.cos(a)*1.49]);ri.push(.21+.04*Math.cos(a*5));}tube(fascia,inner,ri,12,.8);}
livingG.push(membrane);
const tethers=geom('cut_tethers','fascia');tethers.dynamic=true;
// Thick bowed fascicles drag diagonally from hardware and spread into attachment fans.
for(let i=0;i<8;i++){const za=-10.5+i*2.85,ya=1.1+(i%3)*.55,zb=za+(i%2?2.5:-2.4),yb=5.0+(i%4)*1.65,points=[],rad=[];for(let j=0;j<=32;j++){const t=j/32;points.push([.42+2.7*t-.30*Math.sin(t*Math.PI),mix(ya,yb,t)-.75*Math.sin(t*Math.PI),mix(za,zb,t)+.28*Math.sin(t*Math.PI)*Math.sin(i)]);rad.push(.055+.15*(Math.abs(t-.5)*2)**2+.018*Math.sin(t*11+i));}tube(tethers,points,rad,12,.70);
 for(let k=0;k<4;k++){const q=[],r=[];for(let j=0;j<=18;j++){const t=j/18,base=points[20+Math.floor(t*12)];q.push(add(base,[.16*t,(k-1.5)*t*.38,(k-1.5)*t*.36]));r.push(.055*(1-t)+.016);}tube(tethers,q,r,8,.8);}}
// Slack lower fascia cords bow below the pale lips and merge into the deep layer.
for(let i=0;i<7;i++){const p=[],r=[],z=-10.8+i*3.1;for(let j=0;j<=26;j++){const t=j/26;p.push([1.3+1.8*t,3.2+1.8*t-1.0*Math.sin(t*Math.PI),z+2.1*t]);r.push(.085+.04*Math.sin(t*Math.PI));}tube(tethers,p,r,10,.72);}livingG.push(tethers);
// Bolt/root constraints are geometric: root bands and bolt footprints have zero delta.
function anchorMask(p){const[x,y,z]=p;let a=smooth((y-.38)/1.6)*smooth((14.85-y)/1.15)*smooth((12-Math.abs(z))/.85);if(x<.54)a=0;for(const zz of[-7.6,.2,8.3])for(const yy of[4.3,8.8,12.1]){const d=Math.hypot((z-zz)/.50,(y-yy)/.48);a*=smooth((d-.70)/.6);}return a;}
function deform(p,name,role){const[x,y,z]=p,a=anchorMask(p);if(a===0)return[0,0,0];const band=Math.exp(-(((y-6.6)/5.6)**2)),wave=.70+.30*Math.sin(z*.31+y*.17),fac=role==='cut_tethers'?.55+.45*smooth((x-.54)/1.6):1;
 if(name==='tension')return mul([-.20*band,.20*band,.66*band*wave],a*fac);
 if(name==='shear')return mul([.28*band*Math.sin(z*.25),.08*band,.34*band*Math.sin(y*.33)],a*fac);
 if(name==='breath')return mul([-.34*band*(.65+.35*Math.cos(z*.45)),.18*band*Math.sin(y*.27),.13*band*Math.sin(z*.37)],a*fac);
 return mul([.18*band*Math.sin(y*1.05+z*.43),-.14*band,.14*band*Math.sin(z*.62-y*.22)],a*fac);
}
const morphNames=['tension','shear','breath','recoil'];
// Remove unreferenced grid points from cut cavities before palette/bounds upload.
for(const g of [...staticG,...livingG]){const used=[...new Set(g.ids)],map=new Map(used.map((v,i)=>[v,i]));g.p=used.flatMap(i=>g.p.slice(i*3,i*3+3));g.uv=used.flatMap(i=>g.uv.slice(i*2,i*2+2));g.ids=g.ids.map(i=>map.get(i));}
for(const g of livingG){g.morphs=morphNames.map(name=>{const p=[];for(let i=0;i<g.p.length;i+=3)p.push(...deform(g.p.slice(i,i+3),name,g.name));return p;});}
function pack(meshes,isLiving){let doc={asset:{version:'2.0',generator:'The Cut physically layered roadside kit'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],buffers:[],bufferViews:[],accessors:[]},chunks=[],cursor=0;
 const bytes=(b,target)=>{while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}const id=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:b.length,...(target?{target}:{})});chunks.push(b);cursor+=b.length;return id;};
 const acc=(values,type,ctype=5126,target)=>{const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],C=ctype===5126?Float32Array:ctype===5125?Uint32Array:ctype===5123?Uint16Array:Uint8Array,typed=new C(values);if(values.some(v=>!Number.isFinite(v)))throw Error('nonfinite geometry');const a={bufferView:bytes(Buffer.from(typed.buffer),target),componentType:ctype,count:values.length/width,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){a.min[i%3]=Math.min(a.min[i%3],values[i]);a.max[i%3]=Math.max(a.max[i%3],values[i]);}}doc.accessors.push(a);return doc.accessors.length-1;};
 const mats=new Map();for(const key of new Set(meshes.map(g=>g.material))){const q=FAMILIES[key],t=texture(key),ids={};for(const map of['albedo','normal','orm']){const source=doc.images.length;doc.images.push({name:`cut ${key} ${map}`,mimeType:'image/png',bufferView:bytes(t[map])});ids[map]=doc.textures.length;doc.textures.push({sampler:0,source});}mats.set(key,doc.materials.length);doc.materials.push({name:`cut ${key}`,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:ids.albedo},roughnessFactor:1,metallicFactor:1,metallicRoughnessTexture:{index:ids.orm}},normalTexture:{index:ids.normal,scale:1},occlusionTexture:{index:ids.orm,strength:.6},extras:{materialFactors:'gltf',studyLocalFinish:true,cutRole:key,...(['fascia','membrane','cavity'].includes(key)?{cutTissue:true}:{}),physicalRepeatMetres:q.period,coating:'opaque physically layered material; not alpha blend'},doubleSided:true});}
 if(isLiving){doc.nodes.push({name:'cut_fixed_root'});doc.scenes[0].nodes.push(0);doc.skins=[{joints:[0],inverseBindMatrices:acc([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],'MAT4')}];}
 const rows=[];for(const g of meshes){const n=normals(g.p,g.ids),attrib={POSITION:acc(g.p,'VEC3',5126,34962),NORMAL:acc(n,'VEC3',5126,34962),TEXCOORD_0:acc(g.uv,'VEC2',5126,34962)},primitive={attributes:attrib,indices:acc(g.ids,'SCALAR',g.p.length/3>65535?5125:5123,34963),material:mats.get(g.material)},mi=doc.meshes.length;let fixed=0,maxD=[0,0,0,0];if(isLiving){const count=g.p.length/3;attrib.JOINTS_0=acc(Array.from({length:count},()=>[0,0,0,0]).flat(),'VEC4',5121,34962);attrib.WEIGHTS_0=acc(Array.from({length:count},()=>[1,0,0,0]).flat(),'VEC4',5126,34962);primitive.targets=g.morphs.map(delta=>{const deformed=g.p.map((v,i)=>v+delta[i]),nn=normals(deformed,g.ids);return{POSITION:acc(delta,'VEC3',5126,34962),NORMAL:acc(nn.map((v,i)=>v-n[i]),'VEC3',5126,34962)};});for(let i=0;i<count;i++){if(g.morphs.every(m=>Math.hypot(...m.slice(i*3,i*3+3))<1e-10))fixed++;g.morphs.forEach((m,k)=>maxD[k]=Math.max(maxD[k],Math.hypot(...m.slice(i*3,i*3+3))));}}
 doc.meshes.push({name:g.name,primitives:[primitive],...(isLiving?{weights:[0,0,0,0],extras:{targetNames:morphNames,identity:'the cut living landscape',anchors:'zero-delta root and bolt footprints',anatomy:'author-defined impossible landscape, not identifiable human remains'}}:{})});doc.nodes.push({name:g.name,mesh:mi,...(isLiving?{skin:0,weights:[0,0,0,0]}:{})});doc.scenes[0].nodes.push(doc.nodes.length-1);const a=doc.accessors[attrib.POSITION];rows.push({name:g.name,vertices:g.p.length/3,triangles:g.ids.length/3,bounds:{min:a.min,max:a.max},family:g.material,fixedVertices:fixed,morphMaxDisplacementMetres:maxD,normalDiagnostics:{minimumLength:Math.min(...Array.from({length:n.length/3},(_,i)=>Math.hypot(...n.slice(i*3,i*3+3)))),meanX:n.filter((_,i)=>i%3===0).reduce((a,b)=>a+b,0)/(n.length/3)}});}
 while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}doc.buffers=[{byteLength:cursor}];let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+j.length+8+bin.length,8);jh.writeUInt32LE(j.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return{bytes:Buffer.concat([header,jh,j,bh,bin]),rows,doc};
}
const stat=pack(staticG,false),living=pack(livingG,true),staticPath=path.join(OUT,'cut-static.glb'),livingPath=path.join(OUT,'cut-living.glb');
fs.writeFileSync(staticPath,stat.bytes);fs.writeFileSync(livingPath,living.bytes);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const asset=parseCharacterAsset(living.bytes.buffer.slice(living.bytes.byteOffset,living.bytes.byteOffset+living.bytes.length));
const checks={livingParserAccepts:true,under25MiBTogether:stat.bytes.length+living.bytes.length<25*1024*1024,allOpaque:[...stat.doc.materials,...living.doc.materials].every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'),allLocalFinish:[...stat.doc.materials,...living.doc.materials].every(m=>m.extras.studyLocalFinish===true),allBiologicalMaterialFlags:[...stat.doc.materials,...living.doc.materials].filter(m=>['fascia','membrane','cavity'].includes(m.extras.cutRole)).every(m=>m.extras.cutTissue===true),allFamiliesHavePhysicalNormalAndORM:[...stat.doc.materials,...living.doc.materials].every(m=>m.normalTexture&&m.pbrMetallicRoughness.metallicRoughnessTexture),allMaterialsHaveWhiteBaseFactor:[...stat.doc.materials,...living.doc.materials].every(m=>m.pbrMetallicRoughness.baseColorFactor.every(x=>x===1)),fixedRootSkin:true};for(const row of [...stat.rows,...living.rows])checks[row.name+':nonzeroOutwardNormals']=row.normalDiagnostics.minimumLength>.99;checks['geologyFacesRoad']=stat.rows.find(r=>r.name==='cut_geology').normalDiagnostics.meanX<-.3;checks['fasciaFacesRoad']=living.rows.find(r=>r.name==='cut_fascia').normalDiagnostics.meanX<-.1;
for(const entry of asset.entries){checks[entry.name+':fourAuthoredMorphs']=JSON.stringify(entry.morphNames)===JSON.stringify(morphNames);const row=living.rows.find(g=>g.name===entry.name);checks[entry.name+':physicalAttachmentVertices']=row.fixedVertices>50;const pose=sampleCharacterPose(asset,entry,{morphs:Object.fromEntries(morphNames.map(n=>[n,1]))});checks[entry.name+':finiteCombinedPose']=[...pose.bones,...pose.morphs].every(Number.isFinite);let minX=Infinity,anchors=0,maxDisp=0,nonzero=0;for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++){const base=Array.from(p.positions.slice(v*3,v*3+3)),d=[0,0,0];p.targets.forEach(t=>{for(let c=0;c<3;c++)d[c]+=t.positions[v*3+c];});minX=Math.min(minX,base[0]+d[0]);if(Math.hypot(...d)<1e-9)anchors++;else nonzero++;maxDisp=Math.max(maxDisp,Math.hypot(...d));}checks[entry.name+':combinedStaysOutsideRoadMount']=minX>=0;checks[entry.name+':differentialNotRigid']=anchors>50&&nonzero>100;row.combinedMorphMinX=minX;row.combinedMorphMaxDisplacement=maxDisp;}
// Ray along +X at driver eye height: quantify how much concrete still blocks
// the actual low anatomical layer, including all narrow surviving anchor posts.
function retainingHit(y,z){const g=staticG.find(g=>g.name==='cut_retaining');for(let i=0;i<g.ids.length;i+=3){const p=g.ids.slice(i,i+3).map(id=>g.p.slice(id*3,id*3+3)),a=p[0],b=p[1],c=p[2],det=(b[2]-c[2])*(a[1]-c[1])+(c[1]-b[1])*(a[2]-c[2]);if(Math.abs(det)<1e-10)continue;const u=((b[2]-c[2])*(y-c[1])+(c[1]-b[1])*(z-c[2]))/det,v=((c[2]-a[2])*(y-c[1])+(a[1]-c[1])*(z-c[2]))/det;if(u>=0&&v>=0&&u+v<=1)return true;}return false;}
const eyeSamples=240,retainedEyeCoverage=Array.from({length:eyeSamples},(_,i)=>retainingHit(1.65,-12+24*(i+.5)/eyeSamples)).filter(Boolean).length/eyeSamples;
checks['retainingExposesMajorityOfEyeHeight']=retainedEyeCoverage<.40;
checks['retainingLeavesLowCavityOpen']=!retainingHit(1.65,1.5);
checks['dampConcreteStockBelowPointOne']=Math.max(...FAMILIES.concrete.base)<=.10;
const materialRows=[...textures.entries()].map(([key,t])=>({family:key,baseLinearTarget:FAMILIES[key].base,linearMean:t.linearMean,roughnessRange:t.roughRange,textureSize:[t.size,t.size],repeatMetres:t.repeatMetres,normalReliefMetres:FAMILIES[key].depth,albedoSha256:sha(t.albedo),ormSha256:sha(t.orm),normalSha256:sha(t.normal)}));
const metrics={schema:1,kind:'source-drive-cut-authored-asset',coordinateContract:{unit:'metres',localOrigin:'inner retaining face; mount at road lateral +4.4m',axes:{x:'away from right road',y:'up',z:'alongroad'},alongroadSpan:[-12,12],safeMinimumMountLateral:4.4,staticDoesNotChangeRoadSurface:true},static:{url:'./cut/cut-static.glb',bytes:stat.bytes.length,sha256:sha(stat.bytes),meshes:stat.rows},living:{url:'./cut/cut-living.glb',bytes:living.bytes.length,sha256:sha(living.bytes),meshes:living.rows,morphNames,skin:'single identity fixed-root palette; all movement comes from spatially varied morph fields',allowedWeights:[0,1],positiveShear:'+Z at lowerfields; varyingX displacement recedes into tissue; root/bolt footprints fixed',safeCombinations:'all weights 0…1; motion design limits tension/recoil overlap for visual readability; combined envelope checked outside mountplane'},materials:materialRows,retention:{panelTopMetres:retainedPanelHeights,eyeHeightMetres:1.65,actualConcreteCoverageFractionAtEye:retainedEyeCoverage,lowCavityCentre:[1.3,1.95,1.5],fullHeightRemnants:'end abutments and narrow bolt-bearing posts; central panels torn down'},anchors:{boltFootprints:[-7.6,.2,8.3].flatMap(z=>[4.3,8.8,12.1].map(y=>[1.25,y,z])),retainingRootBandY:[0,.38],edgeBandsZ:[[-12,-11.15],[11.15,12]]},notes:['Original project-authored anatomy from the approved Cut concept; no external model, scan or texture.','24m module is intended for curated 120m compositions, using finite placements, not uniform infinite repetition.','Normal, metallic/roughness and basecolour use standard glTF semantics. Base PNG is encoded sRGB; ORM/normal linear.','Material credibility and match to the concept still require actual final renderer inspection. No human validation claimed.']};
fs.writeFileSync(path.join(OUT,'metrics.json'),JSON.stringify(metrics,null,2)+'\n');fs.writeFileSync(path.join(OUT,'asset-validation.json'),JSON.stringify({schema:1,status:Object.values(checks).every(Boolean)?'pass':'fail',checks,staticSha256:sha(stat.bytes),livingSha256:sha(living.bytes),livingRows:living.rows},null,2)+'\n');
fs.writeFileSync(path.join(OUT,'MATERIALS.md'),'# The Cut material and assembly contract\n\nOriginal project-authored roadside anatomy. The approved concept is a composition target, not a scan.\n\n'+materialRows.map(m=>`- **${m.family}**: ${m.repeatMetres} m repeat, ${m.textureSize[0]} px embedded albedo/normal/ORM. Albedo is sRGB-encoded from linear authored stock; green ORM roughness ${m.roughnessRange.map(x=>x.toFixed(3)).join('–')}; normal relief ${m.normalReliefMetres*1000} mm.`).join('\n')+'\n\nThe mineral mass, deep maroon cavity backs, pale continuous ribs, seven-centimetre membrane cut edges, retaining panel thickness, metal plate fasteners and rooted fibrous tethers are separate physical surfaces. Central retaining panel remnants stop at1.2–1.65m with torn outlines, exposing the low cavity from the1.65m seated eye; end abutments and narrow bolt-bearing posts retain their height. Damp concrete uses a separate dark substrate stock; biological materials are unchanged. Texture detail never supplies the silhouette or cavity depth.\n\nLoad cut-static.glb with addPropPack and cut-living.glb with addCharacterPack. Submit the named living meshes with character.morphs using tension, shear, breath and recoil, each in 0…1. The single skin root is deliberately fixed. Bolt footprints and bottom/root bands have exactly zero deformation, and morph normals are authored from the changed geometry. Positive tension pulls sideways along +Z. All four at maximum remain outside the local X=0 road mount plane.\n\nMount the kit along a right-side road at lateral +4.4 m or farther, local −Z facing the vehicle travel direction. Each module spans 24 m. The road and collision surface remain fixed; this kit does not authorize a changing drivable surface. Curated root placements should use only the necessary parts and avoid identical arch cadence.\n\nThe final dither and locally lit material pass remain mandatory. The adapter must route studyLocalFinish on character material definitions as well as static materials. Thin transmissive skin or SSS are not claimed: these are opaque physically separated mineral, collagen and wet tissue layers under the existing renderer.\n');
console.log(JSON.stringify({static:{bytes:stat.bytes.length,meshes:stat.rows},living:{bytes:living.bytes.length,meshes:living.rows},checks,status:Object.values(checks).every(Boolean)?'pass':'fail'},null,2));if(!Object.values(checks).every(Boolean))process.exitCode=1;
