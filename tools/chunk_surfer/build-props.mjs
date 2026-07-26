// Build the conservative fallback prop pack as a real GLB 2.0 asset. The
// runtime never knows whether a mesh began here or in SketchUp/Blender: cleaned
// source meshes can replace any named mesh without changing placement or game
// code.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { importPropMesh } from './lib/glb-import.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(ROOT, 'public/assets');
const OUT = path.join(OUT_DIR, 'conservatory-props.glb');
const STATS = path.join(OUT_DIR, 'conservatory-props.stats.json');
const CREDITS = path.join(OUT_DIR, 'conservatory-props.credits.json');
const SRC_DIR = path.join(ROOT, 'tools/chunk_surfer/prop-sources');

const materials = [
  ['dark wood', [0.16, 0.095, 0.052, 1], 0.0, 0.72],
  ['worn wood', [0.34, 0.20, 0.095, 1], 0.0, 0.68],
  ['black lacquer', [0.025, 0.028, 0.03, 1], 0.15, 0.28],
  ['painted steel', [0.22, 0.24, 0.23, 1], 0.7, 0.46],
  ['ivory', [0.82, 0.80, 0.69, 1], 0.0, 0.58],
  ['brass', [0.49, 0.31, 0.08, 1], 0.8, 0.25],
  ['cloth', [0.12, 0.13, 0.12, 1], 0.0, 0.95],
  ['speaker cone', [0.045, 0.052, 0.055, 1], 0.05, 0.9],
  ['paper label', [0.64, 0.60, 0.48, 1], 0.0, 0.9],
  ['portrait surface', [1, 1, 1, 1], 0.0, 0.76],
  ['chapel stone', [0.43, 0.44, 0.41, 1], 0.0, 0.86],
  ['academic plaster', [0.63, 0.62, 0.55, 1], 0.0, 0.92],
  ['oxidised bronze', [0.16, 0.29, 0.24, 1], 0.72, 0.58],
  ['dry soil', [0.17, 0.12, 0.075, 1], 0.0, 1.0],
  ['dead foliage', [0.28, 0.25, 0.14, 1], 0.0, 0.96],
  ['pool enamel blue', [0.055, 0.22, 0.31, 1], 0.04, 0.38],
  ['pool mint glaze', [0.38, 0.59, 0.53, 1], 0.0, 0.34],
  ['aged white paint', [0.69, 0.72, 0.66, 1], 0.03, 0.68],
  ['safety red', [0.56, 0.045, 0.025, 1], 0.0, 0.56],
  ['wired roof glass', [0.29, 0.49, 0.54, 1], 0.0, 0.24],
].map(([name, baseColorFactor, metallicFactor, roughnessFactor]) => ({
  name, pbrMetallicRoughness: { baseColorFactor, metallicFactor, roughnessFactor },
}));

const MAT = {
  dark:0, wood:1, black:2, steel:3, ivory:4, brass:5, cloth:6, cone:7,
  paper:8, portrait:9, stone:10, plaster:11, bronze:12, soil:13, deadLeaf:14,
  poolBlue:15, poolMint:16, agedWhite:17, safetyRed:18, roofGlass:19,
};

// Real source models, supplied by the user (FabConvert / SketchUp conversions).
// Provenance is UNVERIFIED and recorded as such in credits.json; the runtime
// neither knows nor cares whether a named mesh began here or in code. Each entry
// is normalised to metres, Y-up, floor-centred, scaled by real height, and
// decimated under the pack's 5k-triangle budget. If a source file is absent the
// procedural mesh (below) is kept, so the build never depends on the downloads.
//   up   : source up-axis ('z' for SketchUp/FabConvert, 'y' for clean glTF)
//   yaw  : extra spin about Y, radians, to face the model sensibly
//   h    : target height in metres (the scale anchor)
//   maxW/maxD : footprint clamp in metres
// Orientation (up/yaw/crop) and target height per model were chosen by matching
// each import's baked bounding box to the real object's proportions (see the
// sweeps in tools/chunk_surfer). marimba+4.glb is a four-unit bank, so we crop a
// single instrument out of it. plant_pipes (2''+150.glb) is deliberately absent:
// in every orientation it collapses to a ~2 m cubic blob, not distinct pipework.
const SOURCES = {
  school_desk:{ enabled:false, file:'school_desk.glb', up:'y', yaw:0,         crop:null,                      h:0.78, maxW:1.10, maxD:1.10, tri:1200, reject:'Offline preview retains detached metal strokes and reads less cleanly than the project-native desk.' },
  pew:        { enabled:false, file:'pew.glb',         up:'z', yaw:0,         crop:null,                      h:1.05, maxW:3.00, maxD:0.95, tri:4200, reject:'Source is an oversized chapel scene rather than one isolated pew.' },
  chair:      { enabled:false, file:'chair.glb',       up:'z', yaw:0,         crop:null,                      h:0.90, maxW:1.30, maxD:0.60, tri:2600, reject:'Source is a multi-object scene; the project-native chair instances read more cleanly.' },
  grand_piano:{ enabled:true,  file:'grand_piano.glb', up:'y', yaw:0,         crop:null,                      h:1.00, maxW:1.95, maxD:2.60, tri:4200 },
  marimba:    { enabled:false, file:'marimba.glb',     up:'y', yaw:Math.PI/2, crop:{axis:'x',from:0,to:0.25}, h:0.92, maxW:3.00, maxD:1.30, tri:4200, reject:'Source contains four instruments and the crop does not produce a clean standalone silhouette.' },
  cello:      { enabled:false, file:'cello.glb',       up:'y', yaw:0,         crop:null,                      h:1.25, maxW:0.75, maxD:0.60, tri:3600, reject:'Offline preview collapses to disconnected strings and hardware; native silhouette is materially better.' },
  violin:     { enabled:false, file:'violin.glb',      up:'z', yaw:0,         crop:null,                      h:0.60, maxW:0.42, maxD:0.30, tri:3000, reject:'Offline preview collapses to disconnected body fragments; native silhouette is materially better.' },
  hall_seating:{enabled:true,file:'hall_seating.glb',  up:'y', yaw:0,         crop:null,                      h:5.00, maxW:26.0, maxD:19.0, tri:14500 },
};

const meshes = new Map();
const mesh = (name) => { const m={name, groups:new Map()}; meshes.set(name,m); return m; };
const group = (m, mat) => {
  if(!m.groups.has(mat)) m.groups.set(mat,{positions:[],normals:[],indices:[],uvs:[]});
  return m.groups.get(mat);
};

function addBox(m, c, s, mat, yaw=0){
  const g=group(m,mat), base=g.positions.length/3;
  const [cx,cy,cz]=c,[sx,sy,sz]=s, hx=sx/2,hy=sy/2,hz=sz/2;
  const cyaw=Math.cos(yaw), syaw=Math.sin(yaw);
  const rot=([x,y,z])=>[cx+x*cyaw-z*syaw,cy+y,cz+x*syaw+z*cyaw];
  const faces=[
    [[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],
    [[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
    [[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],
    [[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
    [[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],
    [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]],
  ];
  for(let f=0;f<faces.length;f++){
    const face=faces[f], n=face[4];
    const rn=[n[0]*cyaw-n[2]*syaw,n[1],n[0]*syaw+n[2]*cyaw];
    for(let i=0;i<4;i++){g.positions.push(...rot(face[i]));g.normals.push(...rn);}
    const o=base+f*4; g.indices.push(o,o+1,o+2,o,o+2,o+3);
  }
}

function addPortraitSurface(m){
  const g=group(m,MAT.portrait),base=g.positions.length/3;
  g.positions.push(-.31,.10,.031, .31,.10,.031, .31,.91,.031, -.31,.91,.031);
  g.normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1);g.uvs.push(0,0,1,0,1,1,0,1);g.indices.push(base,base+1,base+2,base,base+2,base+3);
}

function addCylinder(m,c,r,h,mat,sides=12){
  const g=group(m,mat), base=g.positions.length/3, [cx,cy,cz]=c;
  for(let i=0;i<=sides;i++){
    const a=i/sides*Math.PI*2, x=Math.cos(a),z=Math.sin(a);
    g.positions.push(cx+x*r,cy-h/2,cz+z*r,cx+x*r,cy+h/2,cz+z*r);
    g.normals.push(x,0,z,x,0,z);
  }
  for(let i=0;i<sides;i++){const o=base+i*2;g.indices.push(o,o+2,o+3,o,o+3,o+1);}
  for(const top of [0,1]){
    const cb=g.positions.length/3; g.positions.push(cx,cy+(top?1:-1)*h/2,cz);g.normals.push(0,top?1:-1,0);
    for(let i=0;i<=sides;i++){
      const a=i/sides*Math.PI*2, x=Math.cos(a),z=Math.sin(a);
      g.positions.push(cx+x*r,cy+(top?1:-1)*h/2,cz+z*r);g.normals.push(0,top?1:-1,0);
    }
    for(let i=0;i<sides;i++) top?g.indices.push(cb,cb+i+1,cb+i+2):g.indices.push(cb,cb+i+2,cb+i+1);
  }
}

function addLegs(m,x,z,w,d,y0,h,mat,r=.025){
  for(const dx of [-w/2,w/2]) for(const dz of [-d/2,d/2]) addCylinder(m,[x+dx,y0+h/2,z+dz],r,h,mat,8);
}

function addBeam(m,a,b,w,mat){
  // General rectangular beam along a→b. A stable side vector is enough for
  // ribs/rails; these are structural silhouettes, not close-up joinery.
  const v=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(...v)||1,u=v.map(q=>q/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
  let s=[u[1]*ref[2]-u[2]*ref[1],u[2]*ref[0]-u[0]*ref[2],u[0]*ref[1]-u[1]*ref[0]],sl=Math.hypot(...s)||1;s=s.map(q=>q/sl);const t=[s[1]*u[2]-s[2]*u[1],s[2]*u[0]-s[0]*u[2],s[0]*u[1]-s[1]*u[0]],c=a.map((q,i)=>(q+b[i])/2),g=group(m,mat),base=g.positions.length/3;
  const corners=[];for(const du of [-1,1])for(const ds of [-1,1])for(const dt of [-1,1])corners.push(c.map((q,i)=>q+u[i]*du*len/2+s[i]*ds*w/2+t[i]*dt*w/2));
  const faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
  for(const f of faces){const p=f.map(i=>corners[i]),aa=p[1].map((q,i)=>q-p[0][i]),bb=p[2].map((q,i)=>q-p[0][i]),n=[aa[1]*bb[2]-aa[2]*bb[1],aa[2]*bb[0]-aa[0]*bb[2],aa[0]*bb[1]-aa[1]*bb[0]],nl=Math.hypot(...n)||1;for(const q of p){g.positions.push(...q);g.normals.push(...n.map(v=>v/nl));}const o=base+g.positions.length/3-base-4;g.indices.push(o,o+1,o+2,o,o+2,o+3);}
}

function addQuad(m,a,b,c,d,mat){const g=group(m,mat),base=g.positions.length/3,u=b.map((q,i)=>q-a[i]),v=c.map((q,i)=>q-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;for(const p of[a,b,c,d]){g.positions.push(...p);g.normals.push(...n.map(q=>q/l));}g.indices.push(base,base+1,base+2,base,base+2,base+3);}

function addPlateBeamXY(m,a,b,w,mat){
  // A flat, double-sided steel member in the XY plane. Pool-roof ribs and
  // perforated ties are cut plate, so giving every short arc segment six box
  // faces wastes triangles and makes the apertures read like bent scaffold.
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1;
  const ox=-dy/length*w/2,oy=dx/length*w/2,z=(a[2]+b[2])/2;
  const p0=[a[0]+ox,a[1]+oy,z],p1=[b[0]+ox,b[1]+oy,z];
  const p2=[b[0]-ox,b[1]-oy,z],p3=[a[0]-ox,a[1]-oy,z];
  addQuad(m,p0,p1,p2,p3,mat);
  addQuad(m,p3,p2,p1,p0,mat);
}

function addRingBeam(m, centre, radius, section, mat, segments=16, start=0, end=Math.PI*2){
  const points=[];
  for(let i=0;i<=segments;i++){
    const a=start+(end-start)*(i/segments);
    points.push([centre[0]+Math.cos(a)*radius,centre[1]+Math.sin(a)*radius,centre[2]]);
  }
  for(let i=0;i<points.length-1;i++)addPlateBeamXY(m,points[i],points[i+1],section,mat);
}

function addRingBeamYZ(m, centre, radius, section, mat, segments=16, start=0, end=Math.PI*2){
  const points=[];
  for(let i=0;i<=segments;i++){
    const a=start+(end-start)*(i/segments);
    points.push([centre[0],centre[1]+Math.cos(a)*radius,centre[2]+Math.sin(a)*radius]);
  }
  for(let i=0;i<points.length-1;i++)addBeam(m,points[i],points[i+1],section,mat);
}

// A small "second perimeter" kit. Floorplan walls remain the collision and
// occlusion envelope; these shallow, non-blocking pieces sit against their
// inside faces and give a room base courses, dado rails, pilasters, cornices
// and arched bays without creating another walkable shell.
function addWallRun(m,{axis,plane,inside,from,to,y,height,depth,mat}){
  const along=(from+to)/2,length=to-from,normal=plane+inside*depth/2;
  if(axis==='x')addBox(m,[along,y+height/2,normal],[length,height,depth],mat);
  else addBox(m,[normal,y+height/2,along],[depth,height,length],mat);
}

function addWallPilaster(m,{axis,plane,inside,along,y=0,height,width=.38,depth=.28,mat}){
  const normal=plane+inside*depth/2;
  if(axis==='x')addBox(m,[along,y+height/2,normal],[width,height,depth],mat);
  else addBox(m,[normal,y+height/2,along],[depth,height,width],mat);
}

function addWallArch(m,{axis,plane,inside,along,spring,radius,depth=.31,section=.10,mat,segments=10}){
  const normal=plane+inside*depth;
  let previous=null;
  for(let i=0;i<=segments;i++){
    const a=Math.PI*i/segments;
    const across=along+Math.cos(a)*radius,y=spring+Math.sin(a)*radius;
    const next=axis==='x'?[across,y,normal]:[normal,y,across];
    if(previous)addBeam(m,previous,next,section,mat);
    previous=next;
  }
}

function addSecondPerimeterWall(m,{
  axis,plane,inside,spans,pilasters=[],stiles=pilasters,
  dadoHeight=1.18,pictureY=4.28,corniceY=4.72,
  baseMat=MAT.stone,fillMat=null,trimMat=MAT.plaster,reliefScale=1,
}){
  for(const [from,to] of spans){
    if(fillMat!==null)addWallRun(m,{axis,plane,inside,from,to,y:.18,height:dadoHeight-.18,depth:.10*reliefScale,mat:fillMat});
    addWallRun(m,{axis,plane,inside,from,to,y:0,height:.20,depth:.20*reliefScale,mat:baseMat});
    addWallRun(m,{axis,plane,inside,from,to,y:dadoHeight-.07,height:.14,depth:.24*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:pictureY-.055,height:.11,depth:.16*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:corniceY-.10,height:.20,depth:.27*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:corniceY+.10,height:.10,depth:.36*reliefScale,mat:baseMat});
  }
  for(const along of stiles)addWallPilaster(m,{
    axis,plane,inside,along,y:.20,height:dadoHeight-.27,width:.12,depth:.17*reliefScale,mat:trimMat,
  });
  for(const along of pilasters)addWallPilaster(m,{
    axis,plane,inside,along,y:dadoHeight,height:corniceY-dadoHeight,width:.38,depth:.30*reliefScale,mat:trimMat,
  });
}

function addTriangle(m,a,b,c,mat){
  const g=group(m,mat),u=b.map((q,i)=>q-a[i]),v=c.map((q,i)=>q-a[i]);
  const raw=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...raw)||1,n=raw.map(q=>q/l);
  let base=g.positions.length/3;
  for(const p of[a,b,c]){g.positions.push(...p);g.normals.push(...n);}
  g.indices.push(base,base+1,base+2);
  base=g.positions.length/3;
  for(const p of[c,b,a]){g.positions.push(...p);g.normals.push(...n.map(q=>-q));}
  g.indices.push(base,base+1,base+2);
}

// Repeating furniture.
{
  const m=mesh('school_desk');
  addBox(m,[0,.69,-.04],[.62,.055,.48],MAT.ivory);
  addBox(m,[0,.47,.04],[.48,.06,.38],MAT.dark);
  addBox(m,[0,.91,.25],[.48,.38,.055],MAT.dark,-.08);
  addLegs(m,0,0,.46,.34,.02,.65,MAT.steel,.018);
  addBox(m,[0,.30,-.02],[.44,.018,.34],MAT.steel);
}
{
  const m=mesh('pew');
  addBox(m,[0,.48,0],[2.7,.10,.48],MAT.wood);
  addBox(m,[0,.92,.20],[2.7,.72,.09],MAT.wood,-.08);
  addBox(m,[0,.25,-.15],[2.5,.055,.34],MAT.dark);
  for(const x of [-1.18,0,1.18]){addBox(m,[x,.27,0],[.10,.54,.55],MAT.dark);addBox(m,[x,.08,0],[.28,.10,.64],MAT.dark);}
}
{
  const m=mesh('chair'); addBox(m,[0,.46,0],[.46,.075,.46],MAT.dark);addBox(m,[0,.82,.19],[.46,.60,.065],MAT.dark);addLegs(m,0,0,.36,.34,.02,.45,MAT.steel,.018);
}
{
  const m=mesh('music_stand'); addCylinder(m,[0,.62,0],.018,1.2,MAT.steel,8);addBox(m,[0,1.18,-.02],[.48,.34,.035],MAT.black,-.12);addBox(m,[0,.035,0],[.55,.03,.04],MAT.steel);addBox(m,[0,.035,0],[.04,.03,.55],MAT.steel);
}
{
  const m=mesh('instrument_case'); addBox(m,[0,.16,0],[1.2,.30,.42],MAT.black);addBox(m,[0,.32,0],[1.08,.025,.32],MAT.cloth);addBox(m,[0,.34,-.22],[.24,.035,.08],MAT.steel);
}
{
  const m=mesh('equipment_cart'); addBox(m,[0,.62,0],[1.15,.08,.65],MAT.steel);addBox(m,[0,.18,0],[1.15,.08,.65],MAT.steel);for(const x of [-.5,.5])for(const z of [-.25,.25]){addCylinder(m,[x,.40,z],.018,.42,MAT.steel,8);addCylinder(m,[x,.05,z],.07,.05,MAT.black,10);}
}

// Instruments and electro-acoustic fixtures.
{
  const m=mesh('upright_piano'); addBox(m,[0,.72,.05],[1.48,1.42,.48],MAT.black);addBox(m,[0,.78,-.32],[1.52,.18,.35],MAT.black);addBox(m,[0,.88,-.51],[1.40,.055,.31],MAT.ivory);
  for(let i=0;i<11;i++)addBox(m,[-.58+i*.116,.91,-.54],[.045,.035,.14],MAT.black);
  addLegs(m,0,-.06,1.15,.24,.02,.48,MAT.black,.035);addCylinder(m,[-.16,.18,-.36],.014,.25,MAT.brass,8);addCylinder(m,[.16,.18,-.36],.014,.25,MAT.brass,8);
}
{
  const m=mesh('grand_piano'); addBox(m,[0,.78,.10],[1.55,.30,1.85],MAT.black);addBox(m,[0,.92,-.92],[1.62,.19,.42],MAT.black);addBox(m,[0,1.02,-1.10],[1.50,.055,.32],MAT.ivory);addBox(m,[.18,1.10,.12],[1.45,.075,1.72],MAT.black,.10);
  addCylinder(m,[-.62,.38,-.70],.045,.75,MAT.black,10);addCylinder(m,[.58,.38,-.55],.045,.75,MAT.black,10);addCylinder(m,[.42,.38,.72],.045,.75,MAT.black,10);addBox(m,[0,.48,-1.35],[.72,.08,.40],MAT.black);addLegs(m,0,-1.35,.55,.24,.02,.45,MAT.black,.025);
}
{
  const m=mesh('marimba'); addBox(m,[0,.72,0],[2.65,.07,.46],MAT.steel);addBox(m,[0,.72,.46],[2.25,.07,.40],MAT.steel);addLegs(m,0,.20,2.35,.56,.08,.68,MAT.steel,.025);
  for(let i=0;i<17;i++){const x=-1.18+i*.147,w=.13,d=.52-i*.009;addBox(m,[x,1.08,0],[w,.045,d],MAT.wood);if(i<14)addCylinder(m,[x,.72,.02],.035,.58-i*.018,MAT.brass,10);}
  for(let i=0;i<12;i++){const x=-.95+i*.17;addBox(m,[x,1.15,.42],[.145,.045,.39],MAT.wood);addCylinder(m,[x,.77,.43],.034,.54-i*.014,MAT.brass,10);}
}
{
  const m=mesh('timpani'); addCylinder(m,[0,.54,0],.39,.72,MAT.brass,18);addCylinder(m,[0,.93,0],.44,.08,MAT.steel,20);addCylinder(m,[0,.99,0],.40,.045,MAT.ivory,20);for(let i=0;i<4;i++){const a=i*Math.PI/2;addCylinder(m,[Math.cos(a)*.33,.28,Math.sin(a)*.33],.018,.50,MAT.steel,8);}
}
{
  const m=mesh('cello'); addCylinder(m,[0,.48,0],.27,.62,MAT.wood,18);addCylinder(m,[0,.78,0],.20,.44,MAT.wood,18);addBox(m,[0,1.28,0],[.075,.85,.065],MAT.dark);addBox(m,[0,1.70,0],[.18,.25,.08],MAT.dark);addCylinder(m,[0,.12,0],.012,.30,MAT.steel,8);
}
{
  // A compact floor-parallel fallback, used because the downloaded violin
  // fails the disconnected-component preview gate.
  const m=mesh('violin');addCylinder(m,[0,.055,.05],.13,.085,MAT.wood,16);addCylinder(m,[0,.055,-.12],.16,.085,MAT.wood,16);addBox(m,[0,.06,.25],[.055,.07,.34],MAT.dark);addBox(m,[0,.065,.45],[.13,.055,.16],MAT.dark);addBox(m,[0,.11,-.02],[.025,.035,.38],MAT.ivory);
}
{
  const m=mesh('speaker_cabinet'); addBox(m,[0,.46,0],[.58,.92,.48],MAT.black);addCylinder(m,[0,.52,-.245],.19,.025,MAT.cone,18);addCylinder(m,[0,.76,-.245],.07,.026,MAT.cone,14);addBox(m,[0,.08,.255],[.36,.05,.08],MAT.steel);
}
{
  const m=mesh('organ_console'); addBox(m,[0,.62,.10],[1.55,1.18,.65],MAT.dark);addBox(m,[0,.82,-.39],[1.42,.10,.34],MAT.wood);addBox(m,[0,.88,-.59],[1.30,.045,.30],MAT.ivory);addBox(m,[0,.70,-.55],[1.18,.035,.22],MAT.ivory);addBox(m,[0,.38,-.53],[.92,.055,.35],MAT.dark);addLegs(m,0,-.34,1.25,.30,.02,.54,MAT.dark,.035);
}
{
  const m=mesh('organ_pipes'); for(let i=0;i<13;i++){const x=(i-6)*.16,h=1.5+(.95-Math.abs(i-6)*.12);addCylinder(m,[x,h/2,0],.055,h,MAT.steel,12);addBox(m,[x,.16,-.06],[.07,.12,.12],MAT.brass);}
}
{
  const m=mesh('equipment_rack'); addBox(m,[0,.80,0],[.62,1.60,.58],MAT.black);for(let i=0;i<6;i++){addBox(m,[0,.28+i*.22,-.302],[.54,.14,.025],MAT.steel);addCylinder(m,[.20,.28+i*.22,-.325],.018,.022,i===4?MAT.brass:MAT.paper,8);}
}
{
  const m=mesh('ticket_counter');addBox(m,[0,.46,0],[2.8,.92,.72],MAT.dark);addBox(m,[0,.97,0],[3.0,.10,.82],MAT.wood);for(let x=-1.25;x<=1.25;x+=.5)addBox(m,[x,1.62,.30],[.025,1.25,.025],MAT.brass);addBox(m,[0,2.23,.30],[2.8,.04,.04],MAT.brass);
}
{
  const m=mesh('box_office_desk');
  addBox(m,[0,.43,0],[1.12,.08,.58],MAT.wood);
  addBox(m,[0,.23,.18],[.92,.36,.18],MAT.dark);
  addBox(m,[0,.23,-.18],[1.02,.36,.16],MAT.dark);
  addLegs(m,0,0,.92,.46,.02,.42,MAT.steel,.018);
  addBox(m,[.38,.50,-.18],[.28,.06,.18],MAT.paper);
}
{
  const m=mesh('program_stack');
  for(let i=0;i<5;i++)addBox(m,[0,.035+i*.024,0],[.42,.018,.31],i%2?MAT.paper:MAT.ivory,(i-2)*.015);
  addBox(m,[.02,.17,-.02],[.35,.018,.25],MAT.paper,.05);
}
{
  const m=mesh('cash_terminal');
  addBox(m,[0,.08,0],[.34,.12,.24],MAT.black);
  addBox(m,[0,.19,-.05],[.28,.08,.16],MAT.steel,-.18);
  addBox(m,[0,.245,-.07],[.20,.025,.10],MAT.paper,-.18);
  addBox(m,[.17,.10,.04],[.06,.035,.08],MAT.brass);
}
{
  const m=mesh('queue_stanchion');
  addCylinder(m,[0,.48,0],.035,.92,MAT.brass,12);
  addCylinder(m,[0,.05,0],.15,.06,MAT.brass,16);
  addCylinder(m,[0,.95,0],.07,.06,MAT.brass,14);
  addBeam(m,[-.42,.84,0],[.42,.80,0],.055,MAT.cloth);
}
{
  const m=mesh('key_cabinet');addBox(m,[0,.58,0],[.9,1.16,.22],MAT.steel);addBox(m,[0,.58,-.12],[.82,1.08,.025],MAT.dark);for(let y=.28;y<.98;y+=.22)for(let x=-.28;x<=.28;x+=.28)addCylinder(m,[x,y,-.15],.012,.04,MAT.brass,8);
}
{const m=mesh('notice_board');addBox(m,[0,.45,0],[1.2,.9,.06],MAT.dark);addBox(m,[0,.45,-.035],[1.08,.78,.02],MAT.paper);}
{
  const m=mesh('loose_note');
  // A sheet with an imperfect folded corner, kept thick enough to survive the
  // low-resolution depth pass without becoming a z-fighting floor decal.
  addBox(m,[0,.008,0],[.32,.016,.42],MAT.paper);
  addBox(m,[.115,.019,-.155],[.07,.006,.07],MAT.ivory,.16);
}
{
  // A calibration pin: the small brass alignment tool a recordist keeps for
  // aligning a tape head. It reads as a precision object glinting on the floor
  // — a machined base, a slim brass shaft, a knurled head, a bright tip. Found
  // in the building's optional corners; each grants a calibration pin.
  const m=mesh('calibration_pin');
  addCylinder(m,[0,.012,0],.052,.024,MAT.dark,16);   // machined base
  addCylinder(m,[0,.030,0],.030,.012,MAT.steel,16);  // collar
  addCylinder(m,[0,.088,0],.011,.10,MAT.brass,12);   // slim shaft
  addCylinder(m,[0,.150,0],.020,.026,MAT.brass,12);  // knurled head
  addCylinder(m,[0,.168,0],.008,.014,MAT.ivory,8);   // bright reference tip
}
{
  // A municipal-baths roof rather than a second room shell. Repeated curved
  // ribs spring from the real perimeter walls; the deep ties are made from
  // alternating large and small circular apertures, the characteristic
  // perforated-steel language of later British pool refits. There are no
  // triangular trusses and no wall planes below the eaves.
  const m=mesh('natatorium_roof_structure'),z0=-9.75,z1=9.75,bay=3.25;
  const roofY=(x)=>5.18+3.86*Math.pow(Math.max(0,Math.cos((x/11.35)*Math.PI*.5)),.72);
  for(let z=z0;z<=z1+.01;z+=bay){
    let previous=[-11.35,roofY(-11.35),z];
    for(let i=1;i<=16;i++){
      const x=-11.35+(22.7*i/16),next=[x,roofY(x),z];
      addPlateBeamXY(m,previous,next,.17,MAT.agedWhite);previous=next;
    }
    addPlateBeamXY(m,[-10.65,6.24,z],[10.65,6.24,z],.13,MAT.agedWhite);
    addPlateBeamXY(m,[-10.65,7.72,z],[10.65,7.72,z],.13,MAT.agedWhite);
    addPlateBeamXY(m,[-10.65,6.24,z],[-10.65,7.72,z],.13,MAT.agedWhite);
    addPlateBeamXY(m,[10.65,6.24,z],[10.65,7.72,z],.13,MAT.agedWhite);
    for(const x of[-9,-6,-3,0,3,6,9]){
      addRingBeam(m,[x,6.98,z],.72,.105,MAT.agedWhite,8);
    }
    for(const x of[-7.5,-4.5,-1.5,1.5,4.5,7.5]){
      addRingBeam(m,[x,6.98,z],.30,.08,MAT.agedWhite,6);
    }
  }
  for(const x of[-10.6,-8,-5.2,-2.5,0,2.5,5.2,8,10.6]){
    addBeam(m,[x,roofY(x),z0],[x,roofY(x),z1],.105,x===0?MAT.steel:MAT.agedWhite);
  }
  for(let z=z0;z<z1-.01;z+=bay){
    const a=z+.12,b=Math.min(z+bay-.12,z1);
    addQuad(m,[-5.05,roofY(-5.05)-.05,a],[-.82,roofY(-.82)-.05,a],[-.82,roofY(-.82)-.05,b],[-5.05,roofY(-5.05)-.05,b],MAT.roofGlass);
    addQuad(m,[.82,roofY(.82)-.05,a],[5.05,roofY(5.05)-.05,a],[5.05,roofY(5.05)-.05,b],[.82,roofY(.82)-.05,b],MAT.roofGlass);
  }
}
{
  // The municipal-baths room finish is independent of the later steel roof:
  // a continuous glazed dado, a darker skirting course, and wall piers aligned
  // to every roof rib. Their shallow relief makes the wall read as the work of
  // several building campaigns while the authored DDA wall remains the one
  // collision envelope.
  const m=mesh('natatorium_perimeter_relief');
  const sidePiers=[];for(let z=-9.75;z<=9.75+.01;z+=3.25)sidePiers.push(z);
  for(const [plane,inside] of[[-12.5,1],[12.5,-1]])addSecondPerimeterWall(m,{
    axis:'z',plane,inside,spans:[[-10.5,10.5]],pilasters:sidePiers,stiles:sidePiers,
    dadoHeight:1.34,pictureY:4.64,corniceY:5.04,
    baseMat:MAT.poolBlue,fillMat:MAT.poolMint,trimMat:MAT.agedWhite,reliefScale:.60,
  });
  // The north entrance interrupts every horizontal course, not just the tile.
  addSecondPerimeterWall(m,{
    axis:'x',plane:-11,inside:1,spans:[[-12,-.35],[2.35,12]],pilasters:[-10,-6,-2.1,4,8,11.7],
    stiles:[-10,-8,-6,-4,-2.1,2.35,4,6,8,10],dadoHeight:1.34,pictureY:4.64,corniceY:5.04,
    baseMat:MAT.poolBlue,fillMat:MAT.poolMint,trimMat:MAT.agedWhite,reliefScale:.60,
  });
  // At the far end the low ceramic finish survives beneath the large arched
  // window. Short returns either side keep the end wall from reading as one
  // undifferentiated rectangle.
  addSecondPerimeterWall(m,{
    axis:'x',plane:11,inside:-1,spans:[[-12,-4.6],[6.6,12]],pilasters:[-11.7,-8,8,11.7],
    stiles:[-10,-8,-6,8,10],dadoHeight:1.34,pictureY:4.64,corniceY:5.04,
    baseMat:MAT.poolBlue,fillMat:MAT.poolMint,trimMat:MAT.agedWhite,reliefScale:.60,
  });
  addWallRun(m,{axis:'x',plane:11,inside:-1,from:-4.6,to:6.6,y:0,height:1.34,depth:.06,mat:MAT.poolMint});
  addWallRun(m,{axis:'x',plane:11,inside:-1,from:-4.6,to:6.6,y:0,height:.20,depth:.12,mat:MAT.poolBlue});
  addWallRun(m,{axis:'x',plane:11,inside:-1,from:-4.6,to:6.6,y:1.27,height:.14,depth:.14,mat:MAT.agedWhite});
}
{
  // Continuous changing cubicles line the outside walls, as at Warrender and
  // the older municipal baths. Their shallow backs sit against the actual
  // envelope; they never create a walkable air gap or an inner wall.
  const m=mesh('natatorium_cubicle_bank'),count=8,bay=1.82,start=-count*bay/2;
  addBox(m,[0,.55,.12],[count*bay,1.10,.16],MAT.poolMint);
  addBox(m,[0,2.25,.12],[count*bay,.42,.16],MAT.agedWhite);
  addBox(m,[0,.10,-.015],[count*bay,.20,.24],MAT.dark);
  addBox(m,[0,2.03,-.02],[count*bay,.12,.28],MAT.poolBlue);
  for(let i=0;i<=count;i++)addBox(m,[start+i*bay,1.18,-.02],[.10,2.22,.30],MAT.agedWhite);
  for(let i=0;i<count;i++){
    const x=start+(i+.5)*bay;
    if(i===3){
      addBox(m,[x-.34,1.08,-.35],[1.36,1.72,.09],MAT.poolBlue,-.62);
    }else{
      addBox(m,[x,1.08,-.11],[1.54,1.72,.08],i%3===0?MAT.poolMint:MAT.poolBlue);
    }
    addBox(m,[x,2.25,-.02],[1.48,.26,.05],MAT.roofGlass);
    addCylinder(m,[x+.58,1.10,-.18],.025,.045,MAT.brass,8);
  }
}
{
  const m=mesh('changing_bench');
  for(const z of[-.16,-.05,.06,.17])addBox(m,[0,.49,z],[2.15,.055,.085],MAT.wood);
  for(const x of[-.82,.82]){
    addBox(m,[x,.25,0],[.07,.48,.40],MAT.steel);
    addBox(m,[x,.04,0],[.38,.07,.48],MAT.steel);
  }
}
{
  const m=mesh('natatorium_end_window');
  addBox(m,[0,.18,0],[10.4,.36,.24],MAT.stone);
  for(const x of[-3.45,0,3.45]){
    addBox(m,[x,1.95,.04],[2.25,3.18,.08],MAT.roofGlass);
    addBox(m,[x-1.18,2.25,0],[.16,4.15,.22],MAT.stone);
    addBox(m,[x+1.18,2.25,0],[.16,4.15,.22],MAT.stone);
    addRingBeam(m,[x,3.53,0],1.18,.15,MAT.stone,12,0,Math.PI);
    addBeam(m,[x,3.53,-.02],[x,4.65,-.02],.065,MAT.agedWhite);
    addBeam(m,[x-1.05,3.52,-.02],[x+1.05,3.52,-.02],.065,MAT.agedWhite);
    for(const mullion of[-.55,.55])addBox(m,[x+mullion,1.95,-.02],[.065,3.05,.09],MAT.agedWhite);
  }
}
{
  const m=mesh('natatorium_clock');
  addBox(m,[0,0,0],[1.08,1.08,.09],MAT.dark);
  addRingBeam(m,[0,0,-.08],.45,.055,MAT.agedWhite,20);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,inside=[Math.cos(a)*.34,Math.sin(a)*.34,-.10],outside=[Math.cos(a)*.41,Math.sin(a)*.41,-.10];
    addBeam(m,inside,outside,.025,MAT.agedWhite);
  }
  addBeam(m,[0,0,-.13],[.04,.28,-.13],.045,MAT.agedWhite);
  addBeam(m,[0,0,-.14],[-.23,-.12,-.14],.035,MAT.safetyRed);
}
{
  const m=mesh('pool_lane_ropes');
  for(const x of[-3.6,-1.2,1.2,3.6]){
    addBeam(m,[x,.065,-7.45],[x,.065,7.45],.035,MAT.steel);
    let n=0;
    for(let z=-7.25;z<=7.25;z+=.52,n++)addBox(m,[x,.075,z],[.12,.10,.28],n%5===0?MAT.safetyRed:n%2?MAT.agedWhite:MAT.poolBlue);
  }
}
{
  const m=mesh('pool_backstroke_flags');
  addBeam(m,[-6.05,2.78,0],[6.05,2.78,0],.025,MAT.steel);
  let index=0;
  for(let x=-5.7;x<=5.7;x+=.76,index++){
    const mat=index%3===0?MAT.safetyRed:index%3===1?MAT.agedWhite:MAT.poolBlue;
    addTriangle(m,[x-.27,2.73,0],[x+.27,2.73,0],[x,2.20,.015],mat);
  }
}
{
  const m=mesh('pool_ladder');
  for(const x of[-.29,.29]){
    addBeam(m,[x,.02,.52],[x,.92,.28],.055,MAT.steel);
    addBeam(m,[x,.92,.28],[x,1.22,-.18],.055,MAT.steel);
  }
  for(let i=0;i<4;i++)addBeam(m,[-.29,.18+i*.20,.46-i*.055],[.29,.18+i*.20,.46-i*.055],.045,MAT.steel);
  addBox(m,[0,.025,-.02],[.82,.05,.18],MAT.ivory);
}
{
  const m=mesh('pool_lifebuoy');
  addRingBeam(m,[0,0,0],.46,.12,MAT.safetyRed,20);
  addBeam(m,[-.31,-.31,-.02],[.31,.31,-.02],.055,MAT.agedWhite);
  addBeam(m,[-.31,.31,-.02],[.31,-.31,-.02],.055,MAT.agedWhite);
}
{
  const m=mesh('pool_start_block');
  addBox(m,[0,.33,.04],[.48,.66,.46],MAT.steel);
  addBox(m,[0,.72,-.08],[.64,.09,.66],MAT.agedWhite,.12);
  addBox(m,[0,.43,-.225],[.32,.32,.035],MAT.poolBlue);
  for(const x of[-.18,.18])addBeam(m,[x,.05,.25],[x,.56,.29],.035,MAT.steel);
}
{
  const m=mesh('lifeguard_chair');
  addBox(m,[0,1.46,.08],[.68,.09,.58],MAT.wood);
  addBox(m,[0,1.78,.34],[.68,.56,.08],MAT.wood);
  for(const x of[-.30,.30]){
    addBeam(m,[x,.04,-.34],[x,1.46,-.16],.055,MAT.steel);
    addBeam(m,[x,.04,.46],[x,1.48,.34],.055,MAT.steel);
    addBeam(m,[x,1.48,-.16],[x,1.84,-.26],.045,MAT.steel);
  }
  for(let i=0;i<5;i++)addBeam(m,[-.30,.30+i*.22,-.30+i*.03],[.30,.30+i*.22,-.30+i*.03],.045,MAT.steel);
  addBeam(m,[-.44,1.58,-.02],[.44,1.58,-.02],.045,MAT.steel);
}
{
  const m=mesh('lane_reel');
  addBox(m,[0,.14,0],[1.0,.09,.62],MAT.steel);
  for(const x of[-.39,.39]){
    addBeam(m,[x,.16,-.23],[x,.74,0],.055,MAT.steel);
    addRingBeamYZ(m,[x,.76,0],.38,.055,MAT.steel,16);
  }
  addBeam(m,[-.46,.76,0],[.46,.76,0],.075,MAT.steel);
  for(let a=0;a<Math.PI*2;a+=Math.PI/5)addBeam(m,[-.37,.76,0],[.37,.76+Math.cos(a)*.30,Math.sin(a)*.30],.025,a>Math.PI?MAT.safetyRed:MAT.poolBlue);
  addBeam(m,[.40,.76,0],[.60,.96,.12],.045,MAT.brass);
  addCylinder(m,[.60,.98,.12],.055,.12,MAT.wood,10);
}
{const m=mesh('drain_grille');addBox(m,[0,.025,0],[1.2,.05,.18],MAT.steel);for(let x=-.52;x<=.52;x+=.13)addBox(m,[x,.055,0],[.025,.03,.15],MAT.dark);}
{
  const m=mesh('pool_lane_markings');
  for(const x of[-4.8,-2.4,0,2.4,4.8]){
    addBox(m,[x,.018,0],[.16,.036,15.35],MAT.ivory);
    addBox(m,[x,.022,-6.75],[1.05,.042,.15],MAT.dark);
  }
}
{
  const m=mesh('plant_pipe_straight');
  addBeam(m,[-1.18,.18,0],[1.18,.18,0],.12,MAT.steel);
  for(const x of[-.82,0,.82]){addBox(m,[x,.18,0],[.08,.30,.22],MAT.dark);addBox(m,[x,.18,.13],[.18,.12,.04],MAT.brass);}
}
{
  const m=mesh('plant_pipe_bank');
  for(let i=0;i<3;i++){
    const y=.18+i*.18;
    addBeam(m,[-1.35,y,0],[1.35,y,0],.095,i===1?MAT.brass:MAT.steel);
    for(const x of[-.92,.02,.94]){addBox(m,[x,y,0],[.055,.26,.20],MAT.dark);addBox(m,[x,y,.12],[.13,.10,.04],MAT.brass);}
  }
  addBox(m,[0,.72,.04],[2.65,.10,.08],MAT.steel);
}
{
  const m=mesh('plant_pipe_elbow');
  addBeam(m,[-.42,.28,0],[.20,.28,0],.12,MAT.steel);
  addBeam(m,[.20,.28,0],[.20,.88,0],.12,MAT.steel);
  addCylinder(m,[.20,.28,0],.18,.08,MAT.brass,14);
  addBox(m,[.20,.88,0],[.28,.08,.28],MAT.dark);
  addBox(m,[.20,.88,.17],[.16,.13,.05],MAT.brass);
}
{
  const m=mesh('plant_pipe_valve');
  addBeam(m,[-.30,.22,0],[.30,.22,0],.11,MAT.steel);
  addBox(m,[0,.22,.07],[.20,.20,.16],MAT.brass);
  addBox(m,[0,.49,.10],[.055,.42,.055],MAT.steel);
  // The wheel lies in the wall plane and its hub projects along +Z, the
  // shared authored front for wall-mounted props.
  addBox(m,[0,.70,.15],[.48,.055,.07],MAT.brass);
  addBox(m,[0,.70,.15],[.07,.48,.055],MAT.brass);
  addBox(m,[0,.70,.11],[.13,.13,.18],MAT.dark);
}
{const m=mesh('altar_table');addBox(m,[0,.84,0],[1.8,.12,.78],MAT.ivory);for(const x of[-.68,.68])addBox(m,[x,.42,0],[.14,.84,.58],MAT.wood);}
{const m=mesh('lectern');addBox(m,[0,.08,0],[.58,.16,.55],MAT.wood);addBox(m,[0,.68,.08],[.12,1.2,.12],MAT.wood);addBox(m,[0,1.28,-.08],[.62,.08,.46],MAT.wood,-.22);}
{const m=mesh('hymn_board');addBox(m,[0,.48,0],[.8,.96,.06],MAT.dark);for(let y=.2;y<=.7;y+=.25)addBox(m,[0,y,-.04],[.65,.03,.02],MAT.ivory);}
{
  const m=mesh('portrait_frame');
  addBox(m,[0,.51,0],[.76,1.02,.055],MAT.dark);
  addPortraitSurface(m);
  addBox(m,[0,.055,.055],[.78,.10,.09],MAT.brass);addBox(m,[0,.965,.055],[.78,.10,.09],MAT.brass);
  addBox(m,[-.34,.51,.055],[.10,.92,.09],MAT.brass);addBox(m,[.34,.51,.055],[.10,.92,.09],MAT.brass);
}
{
  // Offline fallback only. The accepted source replaces this mesh when the
  // ignored intake cache is present.
  const m=mesh('hall_seating');
  for(let row=0;row<11;row++){const z=-8+row*1.55,y=row*.45;addBox(m,[0,y/2-.05,z],[24,y+.1,1.45],MAT.dark);for(let x=-10.8;x<=10.8;x+=.72){if(Math.abs(x)<.75)continue;addBox(m,[x,y+.38,z],[.54,.72,.55],MAT.cloth);}}
}
{
  const m=mesh('hall_structure');
  // Stage and proscenium.
  addBox(m,[0,-2.35,-15],[26,.30,8],MAT.wood);addBox(m,[0,4.0,-10.8],[26,.55,.8],MAT.wood);
  addBox(m,[-10.3,3.5,-10.8],[3.4,12,.9],MAT.wood);addBox(m,[10.3,3.5,-10.8],[3.4,12,.9],MAT.wood);addBox(m,[0,-.6,-11.15],[15.5,3.8,.22],MAT.cloth);
  // Continuous lower and upper side/rear balconies.
  for(const y of [3.9,7.4]){addBox(m,[-12.0,y,3.0],[3.5,.22,28],MAT.wood);addBox(m,[12.0,y,3.0],[3.5,.22,28],MAT.wood);addBox(m,[0,y,14.5],[24,.22,4.5],MAT.wood);for(const x of[-10.25,10.25])addBox(m,[x,y+.58,3.0],[.08,1.12,28],MAT.brass);addBox(m,[0,y+.58,12.25],[20.5,1.12,.08],MAT.brass);}
  // Stair surfaces are authored by the floorplan. Keeping them out of this
  // structural mesh prevents duplicate visible flights from blocking the entry
  // read from the box-office vestibule.
  // Acoustic reflector ribbons and two technical bridges.
  for(let i=0;i<11;i++)addBox(m,[0,13.2+Math.sin(i*.7)*.65,-8+i*2.2],[20-i*.24,.16,.48],MAT.wood,(i-5)*.018);
  addBox(m,[0,11.6,-2.5],[24,.18,1.0],MAT.steel);addBox(m,[0,12.0,7.5],[24,.18,1.0],MAT.steel);
  for(let z=-7;z<11;z+=2.4){addBox(m,[-9.8,.16,z],[.16,.10,.34],MAT.brass);addBox(m,[9.8,.16,z],[.16,.10,.34],MAT.brass);}
}
{
  const m=mesh('chapel_vault'),z0=-17,z1=17,bay=3.4;
  // Two pitched stone shells meeting at the ridge, then transverse ribs.
  addQuad(m,[-6,9.5,z0],[0,13,z0],[0,13,z1],[-6,9.5,z1],MAT.stone);
  addQuad(m,[0,13,z0],[6,9.5,z0],[6,9.5,z1],[0,13,z1],MAT.stone);
  for(let z=z0;z<=z1+.01;z+=bay){addBeam(m,[-6,9.48,z],[0,13.02,z],.14,MAT.brass);addBeam(m,[0,13.02,z],[6,9.48,z],.14,MAT.brass);}
  addBeam(m,[0,13.02,z0],[0,13.02,z1],.12,MAT.brass);
}

// Third-floor academic crown and its dead garden. These are deliberately
// project-native architectural silhouettes: no named memorial, text, donor,
// or found object can accidentally turn the red-herring floor into lore.
{
  const m=mesh('academic_atrium_structure');
  // Four slab bands leave a genuine 10x13m void, offset west of centre to keep
  // the old front-of-house office intact below.
  addBox(m,[-9.25,-.16,0],[5.5,.32,27],MAT.plaster);
  addBox(m,[8.0,-.16,0],[8,.32,27],MAT.plaster);
  addBox(m,[-.75,-.16,-10],[11.5,.32,7],MAT.plaster);
  addBox(m,[-.75,-.16,10],[11.5,.32,7],MAT.plaster);
  // Oxidised gallery rail around the opening.
  for(const x of[-6.5,5])for(let z=-6.5;z<=6.5;z+=1.25)addCylinder(m,[x,.62,z],.035,1.24,MAT.bronze,8);
  for(const z of[-6.5,6.5])for(let x=-6.5;x<=5;x+=1.25)addCylinder(m,[x,.62,z],.035,1.24,MAT.bronze,8);
  for(const y of[.16,.66,1.18]){
    addBeam(m,[-6.5,y,-6.5],[-6.5,y,6.5],.045,MAT.bronze);
    addBeam(m,[5,y,-6.5],[5,y,6.5],.045,MAT.bronze);
    addBeam(m,[-6.5,y,-6.5],[5,y,-6.5],.045,MAT.bronze);
    addBeam(m,[-6.5,y,6.5],[5,y,6.5],.045,MAT.bronze);
  }
  // The underside is columned enough to read from the entrance as an inserted
  // institutional gallery rather than a floating plane.
  for(const x of[-11.4,11.4])for(const z of[-12.4,-6.5,6.5,12.4])addCylinder(m,[x,-4.85,z],.16,9.7,MAT.plaster,12);
}
{
  // The old public atrium gets a civic interior order rather than a texture
  // pasted over a rectangular shell. The original wall remains visible in
  // recessed panels between the shallow stone/plaster rails. Real apertures
  // break every run, and the upper blind arches deliberately vary in width.
  const m=mesh('front_atrium_perimeter_relief');
  addSecondPerimeterWall(m,{
    axis:'x',plane:-11.5,inside:1,spans:[[-10.5,-8.95],[-6.05,10.5]],
    pilasters:[-10.35,-8.95,-6.05,-3.0,.15,3.3,6.45,9.9],
    stiles:[-10.35,-8.95,-6.05,-4.5,-3,-1.45,.15,1.7,3.3,4.85,6.45,8.1,9.9],
    reliefScale:.36,
  });
  addSecondPerimeterWall(m,{
    axis:'z',plane:-11,inside:1,spans:[[-10.9,-2.65],[-.35,10.9]],
    pilasters:[-10.65,-7.9,-5.25,-2.65,-.35,2.35,5.05,7.75,10.65],
    stiles:[-10.65,-9.25,-7.9,-6.55,-5.25,-3.9,-2.65,-.35,1,2.35,3.7,5.05,6.4,7.75,9.1,10.65],
    reliefScale:.36,
  });
  // The east side becomes a staff office and the narrow concert-hall
  // vestibule south of the bricked service leaf. Stop the public-room order
  // there completely: even shallow trim would steal too much of that passage.
  addSecondPerimeterWall(m,{
    axis:'z',plane:11,inside:-1,spans:[[-10.9,-2.65]],
    pilasters:[-10.65,-7.9,-5.25,-2.65],
    stiles:[-10.65,-9.25,-7.9,-6.55,-5.25,-3.9,-2.65],
    reliefScale:.36,
  });
  addSecondPerimeterWall(m,{
    axis:'x',plane:11.5,inside:-1,spans:[[-10.5,-1.75],[.75,10.5]],
    pilasters:[-10.25,-7.35,-4.45,-1.75,.75,3.7,6.65,9.9],
    stiles:[-10.25,-8.8,-7.35,-5.9,-4.45,-3.05,-1.75,.75,2.25,3.7,5.2,6.65,8.15,9.9],
    reliefScale:.36,
  });
  for(const along of[-7.5,-4.5,-1.45,1.65,4.8,7.95])addWallArch(m,{
    axis:'x',plane:-11.5,inside:1,along,spring:3.05,radius:1.20,depth:.10,section:.065,mat:MAT.stone,
  });
  for(const along of[-8.9,-6.15,1,3.7,6.4,9.1])addWallArch(m,{
    axis:'z',plane:-11,inside:1,along,spring:3.08,radius:1.03,depth:.10,section:.065,mat:MAT.plaster,
  });
  // Only the public north part of the east wall receives blind arches.
  for(const along of[-8.9,-6.15])addWallArch(m,{
    axis:'z',plane:11,inside:-1,along,spring:3.08,radius:1.03,depth:.10,section:.065,mat:MAT.stone,
  });
}
{
  const m=mesh('academic_skylight');
  for(let x=-11.5;x<=11.5;x+=2.3)addBeam(m,[x,6.8,-13],[x,6.8,13],.10,MAT.bronze);
  for(let z=-13;z<=13;z+=2.6)addBeam(m,[-11.5,6.8,z],[11.5,6.8,z],.10,MAT.bronze);
  // Two displaced bars make the damage legible without opening the roof.
  addBeam(m,[-4.6,6.70,-2.6],[-1.8,6.08,.7],.09,MAT.steel);
  addBeam(m,[3.2,6.76,3.1],[5.8,6.22,5.0],.08,MAT.steel);
}
{
  const m=mesh('academic_frieze');
  addBox(m,[0,.42,0],[5.2,.84,.12],MAT.plaster);
  for(let i=-4;i<=4;i++){
    const x=i*.54,y=.42+Math.sin(i*1.7)*.12;
    addCylinder(m,[x,y,-.085],.12,.12,i%3===0?MAT.bronze:MAT.stone,10);
    if(i<4)addBeam(m,[x+.10,y,-.09],[x+.44,.42+Math.sin((i+1)*1.7)*.12,-.09],.035,MAT.bronze);
  }
  addBox(m,[1.72,.18,-.10],[.58,.18,.05],MAT.dark,.08);
}
{
  const m=mesh('academic_bust_plinth');
  addBox(m,[0,.08,0],[.62,.16,.62],MAT.stone);
  addBox(m,[0,.58,0],[.48,.92,.48],MAT.plaster);
  addBox(m,[0,1.07,0],[.58,.08,.58],MAT.stone);
}
{
  const m=mesh('academic_bust_fragment');
  addCylinder(m,[0,.23,0],.23,.30,MAT.plaster,14);
  addCylinder(m,[.08,.49,-.02],.17,.28,MAT.plaster,14);
  addBox(m,[-.19,.17,.08],[.34,.18,.26],MAT.plaster,.18);
  addBox(m,[.24,.08,-.06],[.22,.11,.18],MAT.stone,-.25);
}
{
  const m=mesh('academic_planter');
  addBox(m,[0,.33,0],[4.0,.66,2.0],MAT.plaster);
  addBox(m,[0,.70,0],[3.54,.12,1.54],MAT.soil);
  addBox(m,[0,.70,0],[3.0,.13,1.08],MAT.dark,.035);
}
{
  const m=mesh('academic_dead_tree');
  addBeam(m,[0,0,0],[.10,3.9,.02],.15,MAT.dark);
  for(const [x,y,z] of[[-1.15,2.5,.15],[1.3,2.9,-.05],[-.8,3.45,-.3],[.72,3.65,.28]]){
    addBeam(m,[.06,y-.75,0],[x,y,z],.075,MAT.dark);
    addQuad(m,[x-.30,y-.03,z],[x,y+.12,z+.03],[x+.26,y-.02,z],[x,y-.10,z-.03],MAT.deadLeaf);
  }
}
{
  const m=mesh('academic_dry_basin');
  addCylinder(m,[0,.20,0],1.35,.40,MAT.stone,24);
  addCylinder(m,[0,.43,0],1.05,.08,MAT.soil,24);
  addCylinder(m,[0,.77,0],.13,.70,MAT.bronze,14);
  addBox(m,[.42,.47,-.10],[.62,.10,.28],MAT.dark,.22);
}
{
  const m=mesh('academic_leaf_litter');
  for(let i=0;i<18;i++){
    const x=((i*37)%19)/19*2.8-1.4,z=((i*23)%17)/17*1.7-.85;
    addBox(m,[x,.012,z],[.18+(i%3)*.04,.024,.08],i%4===0?MAT.soil:MAT.deadLeaf,(i*.73)%Math.PI);
  }
}
{
  const m=mesh('academic_blackboard');
  addBox(m,[0,.72,0],[2.6,1.44,.08],MAT.dark);
  addBox(m,[0,.70,-.055],[2.42,1.24,.025],MAT.black);
  for(const y of[.46,.58,.70,.82,.94])addBox(m,[0,y,-.075],[2.18,.012,.012],MAT.ivory);
  addBox(m,[.72,.62,-.085],[.62,.018,.012],MAT.plaster,-.08);
}
{
  const m=mesh('academic_filing_bank');
  for(let x=-.78;x<=.78;x+=.52){addBox(m,[x,.68,0],[.48,1.36,.48],MAT.steel);for(let y=.18;y<=1.18;y+=.34){addBox(m,[x,y,-.25],[.38,.25,.025],MAT.dark);addBox(m,[x,y,-.27],[.13,.04,.025],MAT.brass);}}
}
{
  const m=mesh('academic_breach');
  for(const x of[-1.35,-1.05,.92,1.28])addBox(m,[x,1.3,0],[.18,2.6,.22],MAT.plaster,(x%1)*.08);
  addBeam(m,[-.92,2.54,0],[.74,2.28,.02],.10,MAT.dark);
  for(let i=0;i<12;i++){const x=((i*29)%17)/17*2.3-1.15,z=((i*11)%13)/13*.8-.4;addBox(m,[x,.04,z],[.20+(i%4)*.06,.08,.15],i%3?MAT.plaster:MAT.dark,(i*.41)%Math.PI);}
}

// Ellery's fictional 1908 ring. Each moving assembly has its own pivoted mesh;
// these are project-native component silhouettes, not scans or recordings from
// a real foundry. Local origin is the gudgeon axis used by the runtime matrix.
for(let id=1;id<=8;id++){
  const suffix=String(id).padStart(2,'0'),r=.45+id*.035;
  {
    const m=mesh(`tower_bell_${suffix}`);
    addCylinder(m,[0,-.34,0],r*.52,.40,MAT.brass,24);
    addCylinder(m,[0,-.66,0],r*.72,.30,MAT.brass,24);
    addCylinder(m,[0,-.88,0],r,.18,MAT.brass,24);
    addCylinder(m,[0,-.98,0],r*1.08,.08,MAT.brass,24);
    addBox(m,[0,.04,0],[.92,.18,.18],MAT.steel);
    addCylinder(m,[-.56,.04,0],.08,.20,MAT.steel,12);
    addCylinder(m,[.56,.04,0],.08,.20,MAT.steel,12);
  }
  {
    const m=mesh(`tower_wheel_${suffix}`),wr=1.02;
    for(let i=0;i<16;i++){const a=i*Math.PI*2/16,b=(i+1)*Math.PI*2/16;addBeam(m,[Math.cos(a)*wr,Math.sin(a)*wr,.16],[Math.cos(b)*wr,Math.sin(b)*wr,.16],.075,MAT.wood);}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;addBeam(m,[0,0,.16],[Math.cos(a)*wr,Math.sin(a)*wr,.16],.055,MAT.wood);}
    addCylinder(m,[0,0,.16],.14,.12,MAT.steel,14);
  }
  {
    const m=mesh(`tower_clapper_${suffix}`);
    addCylinder(m,[0,-.62,0],.045,1.12,MAT.steel,10);
    addCylinder(m,[0,-1.18,0],.13,.20,MAT.steel,14);
  }
  {
    const m=mesh(`tower_stay_${suffix}`);
    addBeam(m,[0,.02,.18],[0,1.22,.18],.075,MAT.wood);
    addBox(m,[0,1.22,.18],[.18,.14,.14],MAT.wood);
  }
  {
    const m=mesh(`tower_slider_${suffix}`);
    addBeam(m,[-.46,1.34,.20],[.46,1.34,.20],.055,MAT.steel);
    addBox(m,[-.46,1.34,.20],[.12,.12,.18],MAT.steel);
    addBox(m,[.46,1.34,.20],[.12,.12,.18],MAT.steel);
  }
}
{
  const m=mesh('tower_frame');
  // Low cast-iron H sides on a steel grillage: individual bell pits remain
  // legible, with no generic cage enclosing the whole chamber.
  for(const z of[-2.35,2.35]){
    for(const x of[-4.15,-2.08,0,2.08,4.15]){
      addBox(m,[x,1.38,z],[.24,2.76,.24],MAT.steel);
      addBox(m,[x,2.68,z],[.62,.18,.24],MAT.steel);
      addBox(m,[x,.12,z],[.62,.18,.34],MAT.steel);
    }
    for(const x of[-3.12,-1.04,1.04,3.12])addBox(m,[x,2.45,z],[1.82,.20,.22],MAT.steel);
  }
  for(const x of[-4.15,-2.08,0,2.08,4.15])addBox(m,[x,.10,0],[.22,.20,5.0],MAT.steel);
  for(const z of[-2.35,2.35])addBox(m,[0,.10,z],[9.0,.20,.28],MAT.steel);
}
{const m=mesh('tower_rope');addCylinder(m,[0,1.7,0],.025,3.4,MAT.paper,10);addCylinder(m,[0,.55,0],.075,.62,MAT.paper,12);}
{const m=mesh('tower_rope_mat');addCylinder(m,[0,.025,0],.52,.05,MAT.cloth,24);addCylinder(m,[0,.055,0],.19,.018,MAT.dark,18);}
{const m=mesh('tower_clock_hammer');addBeam(m,[0,.1,0],[.55,.95,0],.10,MAT.steel);addCylinder(m,[.62,1.02,0],.18,.24,MAT.steel,14);}
{const m=mesh('tower_winch');addCylinder(m,[0,.72,0],.42,.34,MAT.steel,18);addCylinder(m,[0,.72,0],.10,.70,MAT.brass,12);addBeam(m,[0,.72,-.28],[.58,1.18,-.28],.07,MAT.brass);addCylinder(m,[.62,1.22,-.28],.09,.22,MAT.wood,12);}
{const m=mesh('tower_shutters');for(let i=0;i<9;i++)addBox(m,[0,.25+i*.38,0],[3.4,.12,.16],MAT.wood,-.16);}
{
  const m=mesh('tower_catwalk');
  // Four protected perimeter runs plus a single four-metre maintenance strip.
  addBox(m,[0,.10,-3.25],[11.8,.20,1.35],MAT.steel);
  addBox(m,[0,.10,3.25],[11.8,.20,1.35],MAT.steel);
  addBox(m,[-5.25,.10,0],[1.30,.20,5.2],MAT.steel);
  addBox(m,[5.25,.10,0],[1.30,.20,5.2],MAT.steel);
  addBox(m,[0,.13,0],[4.0,.16,.82],MAT.steel);
  for(const z of[-3.92,3.92]){addBeam(m,[-5.8,1.08,z],[5.8,1.08,z],.055,MAT.steel);for(let x=-5.8;x<=5.8;x+=1.45)addCylinder(m,[x,.55,z],.035,1.1,MAT.steel,8);}
  for(const x of[-5.9,5.9]){addBeam(m,[x,1.08,-3.8],[x,1.08,3.8],.055,MAT.steel);for(let z=-3.8;z<=3.8;z+=1.25)addCylinder(m,[x,.55,z],.035,1.1,MAT.steel,8);}
}
{const m=mesh('tower_louvres');for(let i=-7;i<=7;i++)addBox(m,[i*.39,1.75,0],[.24,3.5,.14],MAT.wood,.38);addBox(m,[0,.10,0],[6,.20,.24],MAT.stone);addBox(m,[0,3.4,0],[6,.20,.24],MAT.stone);}
{const m=mesh('tower_peal_board');addBox(m,[0,.62,0],[1.8,1.24,.07],MAT.dark);addBox(m,[0,.62,-.045],[1.62,1.06,.025],MAT.black);for(let y=.28;y<=.96;y+=.17)addBox(m,[0,y,-.065],[1.35,.018,.012],MAT.brass);}
{
  const m=mesh('tower_organ_case');addBox(m,[0,2.1,.35],[5.8,4.2,.70],MAT.dark);
  for(let i=-13;i<=13;i++){const h=1.6+(1-Math.abs(i)/14)*2.0;addCylinder(m,[i*.19,1.0+h/2,-.08],.055,h,MAT.steel,10);}
  for(const x of[-2.65,0,2.65])addBox(m,[x,2.2,-.10],[.18,4.1,.22],MAT.wood);
  addBox(m,[0,.32,-.16],[5.45,.42,.20],MAT.wood);
}
{const m=mesh('tower_loft_rail');for(let x=-5;x<=5;x+=1.25)addCylinder(m,[x,.58,0],.035,1.16,MAT.steel,8);for(const y of[.12,.62,1.12])addBeam(m,[-5,y,0],[5,y,0],.05,MAT.steel);}
{
  // Wall origin is the back plane and +Z is the visible/front direction, the
  // same convention used by imported wall assets such as power_box_01.
  const m=mesh('tower_bulkhead');
  addBox(m,[0,.18,.09],[.30,.20,.18],MAT.steel);
  addCylinder(m,[0,.18,.14],.12,.08,MAT.ivory,14);
}

function addDoglegRail(name,rise,rises,down=false){
  const m=mesh(name),sign=down?-1:1,half=rise/2,run=rises===12?6:5,end=2+run;
  const a0=[2,sign*.08,0],a1=[end,sign*half,0],b0=[end,sign*half,3],b1=[2,sign*rise,3];
  for(const z of[-.65,.65])addBeam(m,[a0[0],a0[1]+.92,a0[2]+z],[a1[0],a1[1]+.92,a1[2]+z],.055,MAT.steel);
  for(const z of[-.65,.65])addBeam(m,[b0[0],b0[1]+.92,b0[2]+z],[b1[0],b1[1]+.92,b1[2]+z],.055,MAT.steel);
  for(const p of[a0,a1,b0,b1])addCylinder(m,[p[0],p[1]+.48,p[2]],.045,.96,MAT.steel,8);
  addBeam(m,[end,sign*half+.92,0],[end,sign*half+.92,3],.055,MAT.steel);
  for(let i=0;i<=rises;i++){
    const t=i/rises,x=2+run*t,y=sign*half*t;
    addBox(m,[x,y+.015,0],[.08,.03,1.48],MAT.ivory);
    addBox(m,[end-run*t,sign*(half+half*t)+.015,3],[.08,.03,1.48],MAT.ivory);
  }
  for(const [x,z,y] of[[0,0,0],[end,0,half],[end,3,half],[0,3,rise]])addCylinder(m,[x,sign*y+.55,z],.075,1.10,MAT.stone,10);
}
addDoglegRail('tower_stair_rail_low_up',3.8,10,false);
addDoglegRail('tower_stair_rail_high_up',4.6,12,false);
addDoglegRail('tower_stair_rail_high_down',4.6,12,true);
addDoglegRail('tower_stair_rail_low_down',3.8,10,true);

// Principal stair dressing. These meshes use the exact authored rise/run and
// are placed at their lower/upper landing datums, so the runner never floats
// above a tread and the handrail pitch agrees with collision.
function addMainStairDressing(name,{rise,run,steps,down=false,basement=false,runner=true}={}){
  const m=mesh(name),direction=down?-1:1;
  if(runner){for(let i=0;i<=steps;i++){
    const t=i/steps,z=.25+run*t,y=direction*rise*t;
    addBox(m,[0,y+.022,z],[1.82,.044,Math.max(.22,run/steps*.88)],MAT.cloth);
    if(i===11)addBox(m,[.38,y+.049,z],[.54,.018,.29],MAT.dark,.08);
    if(i%2===0&&!basement)addBeam(m,[-.98,y+.075,z-.16],[.98,y+.075,z-.16],.028,MAT.brass);
    if(basement&&i%5===2)addBox(m,[.34,y+.049,z],[.46,.018,.25],MAT.dark,(i%3-1)*.08);
  }
  }
  for(const x of[-1.38,1.38]){
    addBeam(m,[x,.92,.2],[x,direction*rise+.92,run+.2],.065,basement?MAT.steel:MAT.wood);
    for(let i=0;i<=steps;i+=4){const t=i/steps,z=.2+run*t,y=direction*rise*t;addCylinder(m,[x,y+.48,z],.035,.96,basement?MAT.steel:MAT.brass,8);}
  }
}
addMainStairDressing('upper_stair_dressing',{rise:4.8,run:11,steps:22,runner:false});
addMainStairDressing('basement_stair_dressing',{rise:4,run:10,steps:20,down:true,basement:true,runner:false});
addMainStairDressing('academic_stair_dressing',{rise:5.2,run:10,steps:26,runner:false});

{
  const m=mesh('stair_smoke_door_open');
  for(const x of[-1.48,1.48])addBox(m,[x,1.25,0],[.12,2.5,.18],MAT.dark);
  addBox(m,[0,2.46,0],[3.05,.12,.18],MAT.dark);
  // The wired-glass leaf is pinned flat against the right return wall.
  addBox(m,[1.42,1.23,1.02],[.10,2.30,1.95],MAT.steel);
  addBox(m,[1.34,1.35,1.02],[.025,1.62,1.38],MAT.ivory);
  for(const y of[.78,1.18,1.58,1.98])addBox(m,[1.31,y,1.02],[.018,.018,1.32],MAT.steel);
  for(const z of[.60,1.02,1.44])addBox(m,[1.31,1.38,z],[.018,1.56,.018],MAT.steel);
}
{
  const m=mesh('stair_smoke_door_closed');
  for(const x of[-1.48,1.48])addBox(m,[x,1.25,0],[.12,2.5,.18],MAT.dark);
  addBox(m,[0,2.46,0],[3.05,.12,.18],MAT.dark);
  addBox(m,[0,1.23,-.02],[2.82,2.30,.10],MAT.steel);
  addBox(m,[0,1.35,-.08],[2.42,1.62,.025],MAT.ivory);
  for(const y of[.78,1.18,1.58,1.98])addBox(m,[0,y,-.10],[2.34,.018,.018],MAT.steel);
  for(const x of[-.84,-.42,0,.42,.84])addBox(m,[x,1.38,-.10],[.018,1.56,.018],MAT.steel);
  addCylinder(m,[1.05,1.16,-.16],.045,.15,MAT.brass,10);
}
{
  const m=mesh('stair_sconce_pair_opal');
  for(const x of[-1.42,1.42]){
    addBox(m,[x,0,.08],[.08,.24,.18],MAT.brass);
    addBeam(m,[x,0,0],[x,.10,-.28],.045,MAT.brass);
    addCylinder(m,[x,.18,-.35],.14,.30,MAT.ivory,16);
    addCylinder(m,[x,.36,-.35],.075,.06,MAT.brass,12);
  }
  addBox(m,[1.42,-.30,.01],[.34,.17,.035],MAT.dark);
  for(const x of[1.34,1.42,1.50])addBox(m,[x,-.30,-.015],[.018,.10,.018],MAT.brass);
}
{
  const m=mesh('stair_bulkhead_pair');
  for(const x of[-1.42,1.42]){
    addBox(m,[x,0,.06],[.34,.28,.16],MAT.steel);
    addCylinder(m,[x,0,-.08],.14,.10,MAT.ivory,16);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;addBeam(m,[x+Math.cos(a)*.16,-.16+Math.sin(a)*.16,-.15],[x+Math.cos(a)*.16,.16+Math.sin(a)*.16,-.15],.018,MAT.steel);}
  }
  addBox(m,[1.42,-.31,.01],[.34,.17,.035],MAT.dark);
  for(const x of[1.34,1.42,1.50])addBox(m,[x,-.31,-.015],[.018,.10,.018],MAT.ivory);
}
{
  const m=mesh('stair_pendant_opal');
  // Ceiling origin at y=0; every part hangs below it. The lens centre is
  // exactly y=-1.25, matching the authored ringing-room light origin.
  addCylinder(m,[0,-.04,0],.08,.08,MAT.brass,12);
  addCylinder(m,[0,-.55,0],.025,1.0,MAT.brass,10);
  addCylinder(m,[0,-1.25,0],.22,.30,MAT.ivory,18);
  addCylinder(m,[0,-1.10,0],.28,.06,MAT.brass,18);
}
{
  // This primitive is never drawn in the colour pass during the anomaly; it
  // exists solely as a clean, body-shaped practical-light occluder.
  const m=mesh('stair_shadow_figure');
  addCylinder(m,[0,1.55,0],.17,.34,MAT.dark,14);
  addBox(m,[0,.88,0],[.58,1.05,.24],MAT.dark);
  addBox(m,[-.18,.30,0],[.16,.72,.18],MAT.dark,.05);
  addBox(m,[.18,.30,0],[.16,.72,.18],MAT.dark,-.05);
}
{const m=mesh('chapel_inner_screen');for(const x of[-2.8,-1.4,0,1.4,2.8])addBox(m,[x,1.8,0],[.16,3.6,.18],MAT.wood);for(const y of[.15,1.8,3.45])addBox(m,[0,y,0],[6,.15,.18],MAT.wood);}
{
  // Like every wall fixture, the origin is the wall plane and +Z faces the
  // reader. This keeps plaques and exit markers from being embedded backwards.
  const m=mesh('tower_plaque');
  addBox(m,[0,.38,.03],[1.35,.76,.06],MAT.brass);
  addBox(m,[0,.38,.067],[1.18,.59,.025],MAT.dark);
}

// Real source models replace (or add) named meshes. Each overwrites the
// procedural mesh of the same name; new names (violin, plant_pipes) are added.
// A missing file leaves the procedural fallback in place.
const imported = {};   // meshName -> { file, triangles, sourceTriangles }
for(const [name,cfg] of Object.entries(SOURCES)){
  const file=path.join(SRC_DIR, cfg.file);
  if(!fs.existsSync(file)){ console.warn(`  · ${name}: source ${cfg.file} not found, keeping fallback`); continue; }
  if(!cfg.enabled){console.warn(`  · ${name}: source rejected, keeping fallback (${cfg.reject})`);continue;}
  const g=await importPropMesh(file, { up:cfg.up, yaw:cfg.yaw||0, crop:cfg.crop||null, targetH:cfg.h, maxW:cfg.maxW, maxD:cfg.maxD, triBudget:cfg.tri });
  const m=mesh(name);                              // overwrites any procedural mesh of this name
  for(const src of g.groups){const key=JSON.stringify(src.material),found=materials.findIndex((v)=>JSON.stringify(v.pbrMetallicRoughness)===JSON.stringify({baseColorFactor:src.material.baseColorFactor,metallicFactor:src.material.metallicFactor,roughnessFactor:src.material.roughnessFactor}));const mat=found>=0?found:materials.push({name:`${name}: ${src.material.name}`,pbrMetallicRoughness:{baseColorFactor:src.material.baseColorFactor,metallicFactor:src.material.metallicFactor,roughnessFactor:src.material.roughnessFactor}})-1;const grp=group(m,mat);grp.positions=Array.from(src.positions);grp.normals=Array.from(src.normals);grp.indices=Array.from(src.indices);}
  imported[name]={ file:cfg.file, triangles:g.triangles, sourceTriangles:g.sourceTriangles };
  console.log(`  · ${name}: ${g.sourceTriangles} -> ${g.triangles} tris from ${cfg.file}`);
}

const chunks=[]; let byteOffset=0;
const bufferViews=[], accessors=[], gltfMeshes=[];
const pad4=(n)=>(n+3)&~3;
function append(typed,target){
  const b=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength), start=byteOffset;
  chunks.push(b);byteOffset+=b.length;const pad=pad4(byteOffset)-byteOffset;if(pad){chunks.push(Buffer.alloc(pad));byteOffset+=pad;}
  const idx=bufferViews.length;bufferViews.push({buffer:0,byteOffset:start,byteLength:b.length,target});return idx;
}
function bounds(a){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],a[i+k]);hi[k]=Math.max(hi[k],a[i+k]);}return[lo,hi];}
function accessor(view,componentType,count,type,min,max){const a={bufferView:view,componentType,count,type};if(min)a.min=min;if(max)a.max=max;const i=accessors.length;accessors.push(a);return i;}
for(const m of meshes.values()){
  const primitives=[];
  for(const [mat,g] of m.groups){
    const p=new Float32Array(g.positions),n=new Float32Array(g.normals),uv=new Float32Array(g.uvs.length===p.length/3*2?g.uvs:p.length/3*2),ix=new Uint32Array(g.indices),[min,max]=bounds(p);
    const pa=accessor(append(p,34962),5126,p.length/3,'VEC3',min,max);
    const na=accessor(append(n,34962),5126,n.length/3,'VEC3');
    const ua=accessor(append(uv,34962),5126,uv.length/2,'VEC2');
    const ia=accessor(append(ix,34963),5125,ix.length,'SCALAR',[0],[p.length/3-1]);
    primitives.push({attributes:{POSITION:pa,NORMAL:na,TEXCOORD_0:ua},indices:ia,material:mat,mode:4});
  }
  gltfMeshes.push({name:m.name,primitives});
}
const nodes=gltfMeshes.map((_,i)=>({name:gltfMeshes[i].name,mesh:i}));
const bin=Buffer.concat(chunks,byteOffset);
const gltf={asset:{version:'2.0',generator:'chunk-surfer build-props.mjs'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews,buffers:[{byteLength:bin.length}]};
const jsonRaw=Buffer.from(JSON.stringify(gltf));const json=Buffer.concat([jsonRaw,Buffer.alloc(pad4(jsonRaw.length)-jsonRaw.length,0x20)]);
const total=12+8+json.length+8+bin.length;
const head=Buffer.alloc(12);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(OUT,Buffer.concat([head,jh,json,bh,bin]));

const stats={generatedAt:new Date().toISOString(),bytes:total,totalTriangles:0,meshes:{}};
const meshBounds={};
for(const m of meshes.values()){
  let tri=0,verts=0; const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const g of m.groups.values()){
    tri+=g.indices.length/3; verts+=g.positions.length/3;
    for(let i=0;i<g.positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],g.positions[i+k]);hi[k]=Math.max(hi[k],g.positions[i+k]);}
  }
  stats.meshes[m.name]={triangles:tri,vertices:verts};stats.totalTriangles+=tri;
  meshBounds[m.name]={min:lo.map((v)=>+v.toFixed(3)),max:hi.map((v)=>+v.toFixed(3)),triangles:tri};
}
fs.writeFileSync(STATS,JSON.stringify(stats,null,2)+'\n');

// credits.json binds provenance to the exact pack bytes and is checked by
// tools/chunk_surfer/tests/glb.mjs. Meshes fed by a user-supplied source carry
// that source's (UNVERIFIED) provenance; the rest are project-native geometry.
const packSha=crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex');
const credits={
  pack:{
    filename:'conservatory-props.glb', author:'Chunk Surfer project',
    source:'tools/chunk_surfer/build-props.mjs', license:'project source (mixed: see meshes)',
    sha256:packSha,
    modifications:'Metres, Y-up, ground-centred. Procedural fallback geometry plus user-supplied source meshes (unverified provenance) baked, re-axised, height-scaled, and vertex-cluster decimated under budget.',
    triangles:stats.totalTriangles, bytes:total,
  },
  meshes:[...meshes.values()].map((m)=>{
    const b=meshBounds[m.name], src=imported[m.name];
    return {
      name:m.name, bounds:{min:b.min,max:b.max}, triangles:b.triangles,
      provenance: src
        ? { source:src.file, origin:'user-supplied (FabConvert/SketchUp conversion)', license:'unverified', sourceTriangles:src.sourceTriangles, modifications:'Re-axised to Y-up, floor-centred, height-scaled, vertex-cluster decimated, normals recomputed.' }
        : { source:'tools/chunk_surfer/build-props.mjs', origin:'project-native procedural geometry', license:'project source' },
    };
  }),
  rejectedIntake:[...Object.entries(SOURCES).filter(([,cfg])=>!cfg.enabled).map(([name,cfg])=>({name,source:cfg.file,license:'unverified',meshName:null,reason:cfg.reject})),{name:'portrait_frame',source:'Gold frame.glb',license:'unverified',meshName:null,reason:'The supplied GLB contains one two-triangle dark plane and no usable frame geometry or texture; project-native brass rail frame used.'}],
};
fs.writeFileSync(CREDITS,JSON.stringify(credits,null,2)+'\n');

const realCount=Object.keys(imported).length;
console.log(`wrote ${path.relative(ROOT,OUT)} (${total} bytes, ${stats.totalTriangles} triangles, ${meshes.size} meshes, ${realCount} from real sources)`);
