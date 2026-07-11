// Build the conservative fallback prop pack as a real GLB 2.0 asset. The
// runtime never knows whether a mesh began here or in SketchUp/Blender: cleaned
// source meshes can replace any named mesh without changing placement or game
// code.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { importPropMesh } from './lib/glb-import.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(ROOT, 'public/labs/chunk-surfer/assets');
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
].map(([name, baseColorFactor, metallicFactor, roughnessFactor]) => ({
  name, pbrMetallicRoughness: { baseColorFactor, metallicFactor, roughnessFactor },
}));

const MAT = { dark:0, wood:1, black:2, steel:3, ivory:4, brass:5, cloth:6, cone:7, paper:8, portrait:9, stone:10 };

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
  // The galleria's two stair flights at physically identical landings.
  for(let i=0;i<12;i++){addBox(m,[-13.1,.17+i*.33,-2+i*.82],[2.0,.18,.86],MAT.steel);addBox(m,[13.1,4.17+i*.29,7-i*.82],[2.0,.18,.86],MAT.steel);}
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
