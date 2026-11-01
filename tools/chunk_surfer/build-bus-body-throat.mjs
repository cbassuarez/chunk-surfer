// What is behind the parted woman. Her halves fold back against the saloon;
// between them is a dark wet wall of her, and in it a slit: pale lips no wider
// than a hand, closing on a short throat. The slit widens as you come to it.
// Mucus strung between her halves snaps before the gap can be walked. Every
// vertex rests on her spine when she is closed and reaches its place on the
// same opening clock as her halves, so nothing is ever outside her body.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {encodeGlb} from './rebuild-tree-crowns.mjs';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../../src/data/outskirts-bus-passage.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const TAU=Math.PI*2;

export const BUS_BODY_THROAT_MESHES=Object.freeze(['bus_body_throat_lining','bus_body_throat_strands']);
export const BUS_BODY_THROAT_TARGETS=Object.freeze({
  bus_body_throat_lining:Object.freeze(['unfold','pulse','dilate']),
  bus_body_throat_strands:Object.freeze(['unfold','snap']),
});
// Bus-local metres. The crossing fires at planeZ 4.10, before the wall, so the
// slit's size is free of the walk: only the wall's distance from that plane
// matters. The wall stands at wallZ across the walked band and only its cheeks
// sweep forward (rimZ) to meet her halves. Its throat closes in front of the
// rear wall (4.47), so the glazing is covered from every seat in the saloon.
export const BUS_BODY_THROAT=Object.freeze({
  halfWidth:.60,floor:.505,shoulder:2.35,crown:2.86,centreY:1.66,
  rimZ:3.94,wallZ:4.25,lipZ:4.23,lumenZ:4.44,
  slit:Object.freeze({closed:.075,open:.30,up:.60,down:.74}),
});
const T=BUS_BODY_THROAT,L=T.slit;

// Deterministic lumpy field: summed incommensurate sines, never a texture.
const lump=(a,b,seed=0)=>.5*Math.sin(a*1.7+b*2.3+seed)+.3*Math.sin(a*3.1-b*1.3+seed*1.9)+.2*Math.sin(a*5.3+b*4.1+seed*.7);

// The gap's outline: flat floor, straight sides and a squared crown
// (superellipse) that reaches its top corners, with a lumped edge.
function boundary(theta){
  const crownAt=x=>T.shoulder+(T.crown-T.shoulder)*Math.cbrt(1-Math.min(1,Math.abs(x/T.halfWidth))**3);
  const cx=Math.cos(theta),cy=Math.sin(theta),inside=t=>{const x=cx*t,y=T.centreY+cy*t;return Math.abs(x)<=T.halfWidth&&y>=T.floor&&y<=crownAt(x);};
  let lo=0,hi=3;for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(inside(mid))lo=mid;else hi=mid;}
  return lo;
}
const RADIUS=Array.from({length:720},(_,i)=>boundary(i/720*TAU));
function outlinePoint(phi){
  // A few degrees of angular blur rounds the floor corners into a gutter.
  let s=0,w=0;for(let k=-6;k<=6;k++){const i=((Math.round(phi/TAU*720)+k)%720+720)%720,g=Math.exp(-k*k/14);s+=RADIUS[i]*g;w+=g;}
  const r=s/w;return[Math.cos(phi)*r,T.centreY+Math.sin(phi)*r];
}
// The slit: a vertical lens, pointed at both ends and never quite symmetrical.
function slitPoint(phi,dilate=0){
  const c=Math.cos(phi),sn=Math.sin(phi),a=L.closed+(L.open-L.closed)*dilate;
  const lean=.042*Math.sin(sn*2.1+.6);
  return[Math.sign(c)*Math.pow(Math.abs(c),1.45)*a*(1+.16*lump(phi*2,0,9))+lean,T.centreY+sn*(sn>=0?L.up:L.down)];
}

// Closed, everything lies on her spine at the matching height.
const spineHeight=y=>.008+1.72*clamp((y-C.floor)/2.17);
function rest(p){return[C.woman.x,C.woman.y+spineHeight(p[1]),C.woman.z];}

const WALL=.70;             // fraction of t spent on the wall, rim to lip
// Swollen lobes in the wall, so it is a body and not a turned shape.
// [x, y, width, height] metres.
const LOBES=[[.33,2.30,.26,.05],[-.36,1.95,.24,.055],[.38,1.20,.26,.06],[-.34,.92,.28,.05],[-.08,2.55,.30,.045],[.16,.72,.20,.03]];
// Fold field, 0..1: sinuous, unevenly spaced folds that merge and fade.
function foldField(phi,t){
  const warp=phi+.22*lump(phi*1.3,t*2.2,5)+.10*Math.sin(phi*3+t*4.5);
  const mixer=.5+.5*lump(phi*.8,t*1.4,8);
  const a=Math.pow(.5+.5*Math.sin(warp*11+.9*lump(phi*2,t*3,1)),1.7);
  const b=Math.pow(.5+.5*Math.sin(warp*7+1.7+.7*lump(phi*2.6,t*2,3)),1.7);
  return(a*mixer+b*(1-mixer))*(.55+.45*(.5+.5*lump(phi*2.2,t*5,6)));
}
// Fraction of the slit's size remaining inside the throat.
const throatRho=t=>t<=WALL?1:Math.pow(1-(t-WALL)/(1-WALL),1.1);
// One surface sample at (phi, t). pulse 0..1 is a slow squeeze: the lips
// thicken and the wall swells. dilate 0..1 is the slit opening for you.
function lining(phi,t,pulse=0,dilate=0){
  const inner=slitPoint(phi,dilate*(1-.25*pulse));
  if(t<=WALL){
    const s=t/WALL,f=Math.pow(s,.82),outer=outlinePoint(phi);
    const x=outer[0]+(inner[0]-outer[0])*f,y=outer[1]+(inner[1]-outer[1])*f;
    const cheek=smooth((Math.abs(x)-.42)/.18),gather=smooth((s-.72)/.28);
    let lobe=0;for(const[lx,ly,w,h]of LOBES){const d=Math.hypot(x-lx,y-ly)/w;lobe+=h*Math.exp(-d*d*1.6);}
    // Wrinkles gather radially into the lips, and the lips roll out of them.
    let toward=lobe*(1-gather)*(1+.3*pulse)+.009*lump(x*7,y*7,2)+.010*gather*Math.pow(.5+.5*Math.sin(phi*17+1.4*lump(phi*2,s,7)),2);
    toward+=(.022+.012*pulse)*Math.exp(-Math.pow((s-.93)/.06,2));
    const z=T.wallZ+(T.lipZ-T.wallZ)*gather-(T.wallZ-T.rimZ)*cheek;
    return[x,Math.max(T.floor-.002,y),z-toward];
  }
  const rho=throatRho(t),near=1-rho,fold=foldField(phi,t),z=T.lumenZ-(T.lumenZ-T.lipZ)*Math.pow(rho,1.5);
  const toward=(.008+.018*near)*(1+.5*pulse)*fold+.005*lump(phi*3,t*7,2);
  return[inner[0]*rho,T.centreY+(inner[1]-T.centreY)*rho,z-toward];
}

// -------------------------------------------------------------- the glb
function newMesh(name){return{name,groups:new Map(),targets:BUS_BODY_THROAT_TARGETS[name]};}
function group(mesh,mat){if(!mesh.groups.has(mat))mesh.groups.set(mat,{vertices:[],indices:[]});return mesh.groups.get(mat);}
// Vertex record: positions per state; normals filled after triangulation.
function addVertex(g,states){g.vertices.push({states,normals:states.map(()=>[0,0,0])});return g.vertices.length-1;}
function accumulateNormals(g){
  if(g.vertices.every(v=>v.fixed))return;
  for(let i=0;i<g.indices.length;i+=3){
    const[a,b,c]=[g.indices[i],g.indices[i+1],g.indices[i+2]].map(k=>g.vertices[k]);
    for(let s=0;s<a.states.length;s++){
      const n=cross(sub(b.states[s],a.states[s]),sub(c.states[s],a.states[s]));
      for(const v of[a,b,c])v.normals[s]=add(v.normals[s],n);
    }
  }
  for(const v of g.vertices)if(!v.fixed)v.normals=v.normals.map((n,s)=>Math.hypot(...n)>1e-12?unit(n):(s?v.normals[1]:[0,0,-1]));
}

const MATERIALS=[
  ['wet wall of her',[.15,.042,.038,1],.18],
  ['bruised wall',[.075,.018,.022,1],.22],
  ['fascia drawn over the wall',[.30,.235,.16,1],.28],
  ['the lips',[.25,.105,.085,1],.14],
  ['the wet inner edge of the lips',[.44,.23,.18,1],.10],
  ['inside the slit',[.055,.011,.014,1],.20],
  ['vessels over the wall',[.26,.09,.12,1],.24],
  ['strung mucus',[.42,.36,.26,1],.10],
].map(([name,baseColorFactor,roughnessFactor])=>({name,pbrMetallicRoughness:{baseColorFactor,roughnessFactor,metallicFactor:0},
  extras:{materialFactors:'gltf',tissueSurface:{version:1,profile:'bus-body-passage',preservePigment:true,localSpecular:true}}}));
const M={wall:0,bruise:1,fascia:2,lips:3,edge:4,inside:5,vessel:6,mucus:7};

function buildLining(){
  const mesh=newMesh(BUS_BODY_THROAT_MESHES[0]),A=160,B=58;
  // One lattice with smooth normals from its own neighbours, so material
  // boundaries never put a hard edge in the shading.
  const at=(j,i,pulse,dilate)=>lining(((i%A)+A)%A/A*TAU,clamp(j/B),pulse,dilate);
  const lattice=[];
  for(let j=0;j<=B;j++){lattice.push(Array.from({length:A},(_,i)=>{
    const states=[[0,0],[1,0],[0,1]].map(([pulse,dilate])=>{const p=at(j,i,pulse,dilate),du=sub(at(j,i+1,pulse,dilate),at(j,i-1,pulse,dilate)),dv=sub(at(Math.min(B,j+1),i,pulse,dilate),at(Math.max(0,j-1),i,pulse,dilate));
      let n=cross(dv,du);if(Math.hypot(...n)<1e-12)n=[0,0,-1];return{p,n:unit(n)};});
    return{states};
  }));}
  const keys=new Map();
  const vid=(mat,j,i)=>{const g=group(mesh,mat),k=`${mat}:${j}:${i%A}`;let id=keys.get(k);
    if(id==null){const{states:[o,pulse,dilate]}=lattice[j][i%A];g.vertices.push({states:[rest(o.p),o.p,pulse.p,dilate.p],normals:[o.n,o.n,pulse.n,dilate.n],fixed:true});id=g.vertices.length-1;keys.set(k,id);}return id;};
  for(let j=0;j<B;j++)for(let i=0;i<A;i++){
    const corners=[[j,i],[j,i+1],[j+1,i+1],[j+1,i]];
    const ph=(i+.5)/A*TAU,t=(j+.5)/B,s=t/WALL,p=lining(ph,Math.min(t,WALL),0,0);
    // Big soft patches so triangle edges never show in the print.
    const blotch=lump(p[0]*3.1,p[1]*2.3,11)+.45*lump(p[0]*6,p[1]*4.6,13),sheet=lump(p[0]*2.2+1,p[1]*1.4,4)+.3*lump(p[1]*5,p[0]*2,14);
    // The lips are uneven, and only their inner edge is wet enough to shine.
    const lipFrom=.84+.07*lump(ph*2.3,.4,3),edgeFrom=.955+.03*lump(ph*3.1,1.2,6);
    const mat=t>WALL*1.05?M.inside:s>edgeFrom?M.edge:s>lipFrom?M.lips:sheet>.74&&s<.74?M.fascia:blotch>.34?M.bruise:M.wall,ids=corners.map(([a,b])=>vid(mat,a,b));
    // Wind so the face normal points into the throat, toward the saloon.
    group(mesh,mat).indices.push(ids[0],ids[2],ids[1],ids[0],ids[3],ids[2]);
  }
  // Vessels: raised tubes running over the wall toward the lips.
  for(let k=0;k<11;k++){
    const base=(k/11)*TAU+.21,points=[];
    for(let i=0;i<=26;i++){const t=.05+(WALL*.84-.05)*i/26,ph=base+.20*Math.sin(t*9+k)+.06*Math.sin(t*23+k*2);points.push([ph,t]);}
    const ride=(pulse,dilate)=>points.map(([ph,t])=>{const p=lining(ph,t,pulse,dilate),n=unit(cross(sub(lining(ph,t+.004,pulse,dilate),p),sub(lining(ph+.004,t,pulse,dilate),p)));return add(p,mul(n,-.005));});
    const r=s=>.008*(1-.45*s);
    tube(mesh,M.vessel,[ride(0,0),ride(1,0),ride(0,1)],[r,r,r]);
  }
  return mesh;
}
// A ring-swept tube. Each state after the closed one has its own centre line
// and radius; the closed state is derived from the first, onto her spine.
function tube(mesh,mat,lines,radii,sides=6){
  const g=group(mesh,mat),n=lines[0].length,rings=[];
  const frame=(pts,i)=>{const tg=unit(sub(pts[Math.min(n-1,i+1)],pts[Math.max(0,i-1)])),u=unit(Math.abs(tg[1])<.9?cross(tg,[0,1,0]):cross(tg,[1,0,0]));return[u,cross(tg,u)];};
  const ring=(pts,i,r)=>{const[u,v]=frame(pts,i);return a=>add(pts[i],add(mul(u,Math.cos(a)*r),mul(v,Math.sin(a)*r)));};
  for(let i=0;i<n;i++){
    const s=i/(n-1),states=lines.map((line,k)=>ring(line,i,radii[k](s)));
    rings.push(Array.from({length:sides},(_,j)=>{const a=j/sides*TAU,open=states[0](a);return addVertex(g,[rest(open),open,...states.slice(1).map(f=>f(a))]);}));
  }
  for(let i=0;i<n-1;i++)for(let j=0;j<sides;j++){const a=rings[i][j],b=rings[i][(j+1)%sides],c=rings[i+1][(j+1)%sides],d=rings[i+1][j];g.indices.push(a,b,c,a,c,d);}
  // Closed tips: a cut strand ends in a bead, not an open pipe.
  for(const end of[0,n-1]){
    const centre=addVertex(g,[rest(lines[0][end]),...lines.map(line=>line[end])]),r=rings[end];
    for(let j=0;j<sides;j++){const a=r[j],b=r[(j+1)%sides];g.indices.push(...(end?[centre,a,b]:[centre,b,a]));}
  }
}

// Mucus strung between her parting halves, split at its thinnest point. Open,
// each strand sags across the gap in front of the wall; snapped, each half has
// recoiled onto her and hangs there. [y, z, sag].
export const BUS_BODY_THROAT_STRANDS=Object.freeze([
  [1.05,4.00,.06],[1.32,4.12,.18],[1.58,3.96,.10],[1.74,4.15,.28],[1.95,4.05,.14],
  [2.12,4.15,.22],[2.30,3.98,.08],[2.44,4.14,.20],[1.20,4.16,.34],[2.02,4.16,.12],
].map(Object.freeze));
function buildStrands(){
  const mesh=newMesh(BUS_BODY_THROAT_MESHES[1]);
  BUS_BODY_THROAT_STRANDS.forEach(([y,z,sag],k)=>{
    const x0=T.halfWidth-.012,thick=.010+.008*((k*7)%5)/4,segments=16;
    for(const side of[-1,1]){
      const line=[],snap=[];
      for(let i=0;i<=segments;i++){
        const s=i/segments*.5,u=side<0?s:1-s;              // s: 0 at her, .5 at the break
        const x=-x0+2*x0*u,d=2*u-1;
        line.push([x,y-sag*(1-d*d)+.004*Math.sin(u*31+k),z+.01*Math.sin(u*9+k)]);
        const k2=s/.5;
        snap.push([side*(x0-.045*k2),y-(.10+.55*sag)*Math.pow(k2,1.15),z-.012*k2]);
      }
      const neck=s=>thick*(.28+.72*Math.pow(1-s,.7))*(1+.45*Math.max(0,Math.sin(s*23+k)));
      tube(mesh,M.mucus,[line,snap],[neck,s=>thick*(1.25-.45*s)],5);
    }
  });
  return mesh;
}

function bounds(mesh){
  const count=[...mesh.groups.values()][0].vertices[0].states.length;
  const low=Array.from({length:count},()=>[Infinity,Infinity,Infinity]),high=Array.from({length:count},()=>[-Infinity,-Infinity,-Infinity]);let v=0,t=0;
  for(const g of mesh.groups.values()){v+=g.vertices.length;t+=g.indices.length/3;for(const a of g.vertices)a.states.forEach((p,s)=>{for(let k=0;k<3;k++){low[s][k]=Math.min(low[s][k],p[k]);high[s][k]=Math.max(high[s][k],p[k]);}});}
  return{vertices:v,triangles:t,restBounds:{min:low[0],max:high[0]},openBounds:{min:low[1],max:high[1]}};
}

export function buildBusBodyThroat(){
  const meshes=[buildLining(),buildStrands()];
  for(const m of meshes)for(const g of m.groups.values())accumulateNormals(g);
  const json={asset:{version:'2.0',generator:'Chunk Surfer bus body throat build'},scene:0,scenes:[{nodes:[0,2,3]}],
    nodes:[{name:'bus_body_throat_root',children:[1]},{name:'bus_body_throat_rest'}],skins:[{joints:[1],inverseBindMatrices:0}],
    meshes:[],materials:MATERIALS,bufferViews:[],accessors:[],buffers:[]},chunks=[];let offset=0;
  const access=(values,width,type=5126)=>{
    const Ctor=type===5126?Float32Array:type===5123?Uint16Array:Uint32Array,a=new Ctor(values),bytes=Buffer.from(a.buffer),pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;
    const item={bufferView:view,componentType:type,count:values.length/width,type:({1:'SCALAR',3:'VEC3',4:'VEC4',16:'MAT4'})[width]};
    if(type===5126&&width===3){item.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));item.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
    json.accessors.push(item);return json.accessors.length-1;
  };
  access(ID,16);
  const stats={};
  for(const m of meshes){
    const primitives=[];
    for(const[mat,g]of m.groups){
      const p=[],n=[],j=[],w=[],targets=m.targets.map(()=>({p:[],n:[]}));
      // Base = closed on her spine. Target 0 opens; every later target is
      // measured from the open shape.
      for(const v of g.vertices){
        const[r,o,...more]=v.states,[,on,...moreNormals]=v.normals;
        p.push(...r);n.push(...on);j.push(0,0,0,0);w.push(1,0,0,0);
        targets[0].p.push(...sub(o,r));targets[0].n.push(0,0,0);
        more.forEach((state,k)=>{targets[k+1].p.push(...sub(state,o));targets[k+1].n.push(...sub(moreNormals[k],on));});
      }
      primitives.push({attributes:{POSITION:access(p,3),NORMAL:access(n,3),JOINTS_0:access(j,4,5123),WEIGHTS_0:access(w,4)},
        indices:access(g.indices,1,g.vertices.length>65535?5125:5123),material:mat,mode:4,
        targets:targets.map(target=>({POSITION:access(target.p,3),NORMAL:access(target.n,3)}))});
    }
    json.meshes.push({name:m.name,primitives,weights:m.targets.map(()=>0),extras:{targetNames:m.targets,source:'procedural throat drawn from the parted woman',coordinateSpace:'bus-local metres; instance at bus ground matrix'}});
    json.nodes.push({name:m.name,mesh:json.meshes.length-1,skin:0,weights:m.targets.map(()=>0)});
    stats[m.name]=bounds(m);
  }
  json.buffers=[{byteLength:offset}];const bytes=encodeGlb(json,Buffer.concat(chunks));
  const total=Object.values(stats).reduce((a,s)=>({vertices:a.vertices+s.vertices,triangles:a.triangles+s.triangles}),{vertices:0,triangles:0});
  return{bytes,stats:{version:1,sha256:SHA(bytes),bytes:bytes.length,totalVertices:total.vertices,totalTriangles:total.triangles,throat:T,meshes:stats,targets:BUS_BODY_THROAT_TARGETS},
    credits:{version:1,title:'The throat behind her',author:'Chunk Surfer original procedural anatomy',license:'project source',
      notes:'Closed on the parted woman\'s spine; opens on her clock. Wall, slit, vessels and mucus strands are geometry with morph targets; no raster.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=buildBusBodyThroat(),file=path.join(ROOT,'public/assets/bus-body-throat.glb');
  fs.writeFileSync(file,result.bytes);fs.writeFileSync(file.replace('.glb','.stats.json'),JSON.stringify(result.stats,null,2)+'\n');
  fs.writeFileSync(file.replace('.glb','.credits.json'),JSON.stringify(result.credits,null,2)+'\n');
  console.log(JSON.stringify({bytes:result.stats.bytes,vertices:result.stats.totalVertices,triangles:result.stats.totalTriangles,meshes:Object.fromEntries(Object.entries(result.stats.meshes).map(([k,v])=>[k,{v:v.vertices,t:v.triangles,open:v.openBounds}]))},null,1));
}
