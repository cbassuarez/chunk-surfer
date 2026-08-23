// Build the conservative fallback prop pack as a real GLB 2.0 asset. The
// runtime never knows whether a mesh began here or in SketchUp/Blender: cleaned
// source meshes can replace any named mesh without changing placement or game
// code.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { importPropMesh } from './lib/glb-import.mjs';
import {
  MARIMBA_ACCIDENTAL_AFTER,
  MARIMBA_LOWER_BAR_COUNT,
  marimbaAccidentalX,
  marimbaNaturalX,
} from '../../src/data/marimba-layout.js';
import { ELLERY_MASSING, YARD_SERVICE_RANGES } from '../../src/data/exterior-district.js';
import {
  CHURCH, CHURCH_BOUNDS, CHURCH_BUTTRESSES, CHURCH_HEIGHTS, CHURCH_SKIN,
  churchWallAt, churchWallExposed, churchWallHeight,
} from '../../src/data/st-brendans.js';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import { CELL, MATERIAL } from '../../src/data/floorplan/legend.js';
import * as FP from '../../src/world/floorplan.js';
import { wallRuns, wallRunsDigest } from '../../src/world/wall-contact.js';

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
materials.push({
  name:'vfd green glass',
  pbrMetallicRoughness:{baseColorFactor:[0.018,0.12,0.055,1],metallicFactor:.12,roughnessFactor:.22},
  emissiveFactor:[.04,.82,.20],
});
materials.push(
  {name:'occupied warm glass',pbrMetallicRoughness:{baseColorFactor:[.38,.25,.10,1],metallicFactor:.02,roughnessFactor:.28},emissiveFactor:[.86,.53,.20]},
  {name:'ellery red brick',pbrMetallicRoughness:{baseColorFactor:[.25,.095,.052,1],metallicFactor:0,roughnessFactor:.94}},
  {name:'ellery dark brick',pbrMetallicRoughness:{baseColorFactor:[.13,.075,.058,1],metallicFactor:0,roughnessFactor:.96}},
  {name:'wet slate',pbrMetallicRoughness:{baseColorFactor:[.075,.09,.105,1],metallicFactor:.03,roughnessFactor:.52}},
  {name:'board marked concrete',pbrMetallicRoughness:{baseColorFactor:[.36,.37,.34,1],metallicFactor:0,roughnessFactor:.91}},
  {name:'municipal glazed brick',pbrMetallicRoughness:{baseColorFactor:[.24,.39,.34,1],metallicFactor:.02,roughnessFactor:.35}},
  {name:'pub green paint',pbrMetallicRoughness:{baseColorFactor:[.075,.18,.12,1],metallicFactor:0,roughnessFactor:.66}},
  {name:'dull terracotta',pbrMetallicRoughness:{baseColorFactor:[.42,.17,.08,1],metallicFactor:0,roughnessFactor:.86}},
);
materials.push(
  {name:'warm skin',pbrMetallicRoughness:{baseColorFactor:[.50,.28,.18,1],metallicFactor:0,roughnessFactor:.82}},
  {name:'deep skin',pbrMetallicRoughness:{baseColorFactor:[.24,.115,.075,1],metallicFactor:0,roughnessFactor:.84}},
  {name:'navy raincloth',pbrMetallicRoughness:{baseColorFactor:[.035,.075,.12,1],metallicFactor:0,roughnessFactor:.90}},
  {name:'mustard wool',pbrMetallicRoughness:{baseColorFactor:[.47,.29,.055,1],metallicFactor:0,roughnessFactor:.96}},
  {name:'denim',pbrMetallicRoughness:{baseColorFactor:[.075,.16,.23,1],metallicFactor:0,roughnessFactor:.88}},
);

const MAT = {
  dark:0, wood:1, black:2, steel:3, ivory:4, brass:5, cloth:6, cone:7,
  paper:8, portrait:9, stone:10, plaster:11, bronze:12, soil:13, deadLeaf:14,
  poolBlue:15, poolMint:16, agedWhite:17, safetyRed:18, roofGlass:19, vfd:20,
  warmWindow:21,brickRed:22,brickDark:23,slate:24,concrete:25,glazedBrick:26,pubGreen:27,terracotta:28,
  skinWarm:29,skinDeep:30,navy:31,mustard:32,denim:33,
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

// `pitch` tilts about X before the yaw about Y. It exists because a music stand
// has a RAKED desk and this helper could only spin things on the spot, so the
// desk was authored as an upright panel with no ledge on it — which is why the
// tuning fork lying "across" it was modelled passing straight through it.
// Anything that leans needs this: a propped lid, a tilted sign, a fallen chair.
function addBox(m, c, s, mat, yaw=0, pitch=0){
  const g=group(m,mat), base=g.positions.length/3;
  const [cx,cy,cz]=c,[sx,sy,sz]=s, hx=sx/2,hy=sy/2,hz=sz/2;
  const cyaw=Math.cos(yaw), syaw=Math.sin(yaw);
  const cpit=Math.cos(pitch), spit=Math.sin(pitch);
  const tilt=([x,y,z])=>[x, y*cpit-z*spit, y*spit+z*cpit];
  const rot=(v)=>{const [x,y,z]=tilt(v);return [cx+x*cyaw-z*syaw,cy+y,cz+x*syaw+z*cyaw];};
  const faces=[
    [[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],
    [[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
    [[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],
    [[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
    [[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],
    [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]],
  ];
  for(let f=0;f<faces.length;f++){
    const face=faces[f], n=tilt(face[4]);
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

function addCylinderX(m,c,r,length,mat,sides=12){
  const g=group(m,mat),base=g.positions.length/3,[cx,cy,cz]=c;
  for(let i=0;i<=sides;i++){
    const a=i/sides*Math.PI*2,y=Math.cos(a),z=Math.sin(a);
    g.positions.push(cx-length/2,cy+y*r,cz+z*r,cx+length/2,cy+y*r,cz+z*r);
    g.normals.push(0,y,z,0,y,z);
  }
  for(let i=0;i<sides;i++){const o=base+i*2;g.indices.push(o,o+1,o+3,o,o+3,o+2);}
  for(const right of[false,true]){
    const cb=g.positions.length/3,x=cx+(right?1:-1)*length/2;
    g.positions.push(x,cy,cz);g.normals.push(right?1:-1,0,0);
    for(let i=0;i<=sides;i++){
      const a=i/sides*Math.PI*2,y=Math.cos(a),z=Math.sin(a);
      g.positions.push(x,cy+y*r,cz+z*r);g.normals.push(right?1:-1,0,0);
    }
    for(let i=0;i<sides;i++)right
      ?g.indices.push(cb,cb+i+1,cb+i+2)
      :g.indices.push(cb,cb+i+2,cb+i+1);
  }
}

function addEllipsoid(m,c,radii,mat,lat=8,lon=12){
  const g=group(m,mat),base=g.positions.length/3,[cx,cy,cz]=c,[rx,ry,rz]=radii;
  for(let iy=0;iy<=lat;iy++){
    const v=iy/lat,phi=v*Math.PI-Math.PI/2,cp=Math.cos(phi),sp=Math.sin(phi);
    for(let ix=0;ix<=lon;ix++){
      const u=ix/lon,theta=u*Math.PI*2,ct=Math.cos(theta),st=Math.sin(theta);
      const nx=cp*ct,ny=sp,nz=cp*st;
      g.positions.push(cx+nx*rx,cy+ny*ry,cz+nz*rz);
      const sx=nx/Math.max(.001,rx),sy=ny/Math.max(.001,ry),sz=nz/Math.max(.001,rz),nl=Math.hypot(sx,sy,sz)||1;
      g.normals.push(sx/nl,sy/nl,sz/nl);
    }
  }
  const stride=lon+1;
  for(let iy=0;iy<lat;iy++)for(let ix=0;ix<lon;ix++){
    const a=base+iy*stride+ix,b=a+stride;
    g.indices.push(a,b,b+1,a,b+1,a+1);
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

// Exterior roofs are authored as real silhouettes, never as a dark lid on a
// box. `ridge` names the direction the ridge runs; the two roof planes are
// double-sided because several perimeter views look up under deep wet eaves.
function addPitchedRoof(m,{x,z,w,d,eaves,rise,mat=MAT.slate,gableMat=null,ridge='z',overhang=.28}){
  const W=w+overhang*2,D=d+overhang*2;
  const face=(a,b,c,d)=>{addQuad(m,a,b,c,d,mat);addQuad(m,d,c,b,a,mat);};
  if(ridge==='z'){
    face([x-W/2,eaves,z-D/2],[x-W/2,eaves,z+D/2],[x,eaves+rise,z+D/2],[x,eaves+rise,z-D/2]);
    face([x,eaves+rise,z-D/2],[x,eaves+rise,z+D/2],[x+W/2,eaves,z+D/2],[x+W/2,eaves,z-D/2]);
    if(gableMat!==null){
      addTriangle(m,[x-W/2,eaves,z-D/2-.02],[x,eaves+rise,z-D/2-.02],[x+W/2,eaves,z-D/2-.02],gableMat);
      addTriangle(m,[x+W/2,eaves,z+D/2+.02],[x,eaves+rise,z+D/2+.02],[x-W/2,eaves,z+D/2+.02],gableMat);
    }
    addBeam(m,[x-W/2,eaves,z-D/2],[x-W/2,eaves,z+D/2],.13,MAT.stone);
    addBeam(m,[x+W/2,eaves,z-D/2],[x+W/2,eaves,z+D/2],.13,MAT.stone);
    addBeam(m,[x,eaves+rise,z-D/2],[x,eaves+rise,z+D/2],.10,MAT.slate);
  }else{
    face([x-W/2,eaves,z-D/2],[x-W/2,eaves+rise,z],[x+W/2,eaves+rise,z],[x+W/2,eaves,z-D/2]);
    face([x-W/2,eaves+rise,z],[x-W/2,eaves,z+D/2],[x+W/2,eaves,z+D/2],[x+W/2,eaves+rise,z]);
    if(gableMat!==null){
      addTriangle(m,[x-W/2-.02,eaves,z-D/2],[x-W/2-.02,eaves+rise,z],[x-W/2-.02,eaves,z+D/2],gableMat);
      addTriangle(m,[x+W/2+.02,eaves,z+D/2],[x+W/2+.02,eaves+rise,z],[x+W/2+.02,eaves,z-D/2],gableMat);
    }
    addBeam(m,[x-W/2,eaves,z-D/2],[x+W/2,eaves,z-D/2],.13,MAT.stone);
    addBeam(m,[x-W/2,eaves,z+D/2],[x+W/2,eaves,z+D/2],.13,MAT.stone);
    addBeam(m,[x-W/2,eaves+rise,z],[x+W/2,eaves+rise,z],.10,MAT.slate);
  }
}

function addBarrelRoof(m,{x,z,w,d,eaves,rise,mat=MAT.slate,glassFraction=.18,endMat=MAT.glazedBrick,segments=12}){
  const front=z-d/2-.02,back=z+d/2+.02;
  for(let i=0;i<segments;i++){
    const ta=i/segments,tb=(i+1)/segments;
    const xa=x-w/2+w*ta,xb=x-w/2+w*tb;
    const ya=eaves+rise*Math.sin(Math.PI*ta),yb=eaves+rise*Math.sin(Math.PI*tb);
    const centre=(ta+tb)/2-.5,roofMat=Math.abs(centre)<glassFraction/2?MAT.roofGlass:mat;
    addQuad(m,[xa,ya,front],[xa,ya,back],[xb,yb,back],[xb,yb,front],roofMat);
    addQuad(m,[xb,yb,front],[xb,yb,back],[xa,ya,back],[xa,ya,front],roofMat);
    addQuad(m,[xa,eaves,front-.02],[xb,eaves,front-.02],[xb,yb,front-.02],[xa,ya,front-.02],endMat);
    addQuad(m,[xb,eaves,back+.02],[xa,eaves,back+.02],[xa,ya,back+.02],[xb,yb,back+.02],endMat);
  }
  addBeam(m,[x-w/2,eaves,front],[x-w/2,eaves,back],.14,MAT.stone);
  addBeam(m,[x+w/2,eaves,front],[x+w/2,eaves,back],.14,MAT.stone);
}

function addRoofLantern(m,{x,z,w,d,y,rise=.72}){
  addBox(m,[x,y+.34,z],[w,.68,d],MAT.roofGlass);
  for(const dx of[-w/2,w/2])addBox(m,[x+dx,y+.34,z],[.10,.78,d+.10],MAT.steel);
  addPitchedRoof(m,{x,z,w,d,eaves:y+.68,rise,mat:MAT.roofGlass,ridge:'z',overhang:.10});
}

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
  lowerCourses=true,
}){
  for(const [from,to] of spans){
    if(lowerCourses&&fillMat!==null)addWallRun(m,{axis,plane,inside,from,to,y:.18,height:dadoHeight-.18,depth:.10*reliefScale,mat:fillMat});
    if(lowerCourses)addWallRun(m,{axis,plane,inside,from,to,y:0,height:.20,depth:.20*reliefScale,mat:baseMat});
    if(lowerCourses)addWallRun(m,{axis,plane,inside,from,to,y:dadoHeight-.07,height:.14,depth:.24*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:pictureY-.055,height:.11,depth:.16*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:corniceY-.10,height:.20,depth:.27*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:corniceY+.10,height:.10,depth:.36*reliefScale,mat:baseMat});
  }
  if(lowerCourses)for(const along of stiles)addWallPilaster(m,{
    axis,plane,inside,along,y:.20,height:dadoHeight-.27,width:.12,depth:.17*reliefScale,mat:trimMat,
  });
  for(const along of pilasters)addWallPilaster(m,{
    axis,plane,inside,along,y:dadoHeight,height:corniceY-dadoHeight,width:.38,depth:.30*reliefScale,mat:trimMat,
  });
}

// The front atrium is not the baths. Its walls are plain plaster at human
// height, with the surviving civic order beginning safely above eye level.
// Keeping this separate from addSecondPerimeterWall makes it impossible for a
// future tiled-dado change to silently re-panel the atrium again.
function addUpperCivicRelief(m,{axis,plane,inside,spans,pilasters=[],reliefScale=1,trimMat=MAT.plaster,capMat=MAT.stone}){
  for(const [from,to] of spans){
    addWallRun(m,{axis,plane,inside,from,to,y:4.54,height:.15,depth:.20*reliefScale,mat:trimMat});
    addWallRun(m,{axis,plane,inside,from,to,y:4.69,height:.15,depth:.31*reliefScale,mat:capMat});
    addWallRun(m,{axis,plane,inside,from,to,y:4.84,height:.08,depth:.39*reliefScale,mat:trimMat});
  }
  for(const along of pilasters){
    addWallPilaster(m,{axis,plane,inside,along,y:2.42,height:2.12,width:.30,depth:.25*reliefScale,mat:trimMat});
    addWallPilaster(m,{axis,plane,inside,along,y:4.39,height:.18,width:.54,depth:.31*reliefScale,mat:capMat});
  }
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

// A closed loft: rings of equal length, stitched into a tube and capped with a
// fan at each end. The violin family is the only thing in this pack whose
// silhouette is the entire point of it, and boxes and cylinders cannot make one.
function addLoft(m, sections, mat, { capStart=true, capEnd=true }={}){
  const g=group(m,mat);
  const ringBase=[];
  for(const ring of sections){
    ringBase.push(g.positions.length/3);
    for(const p of ring){ g.positions.push(...p); g.normals.push(0,0,0); }
  }
  const n=sections[0].length;
  for(let s=0;s<sections.length-1;s++){
    const a=ringBase[s], b=ringBase[s+1];
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      g.indices.push(a+i,b+i,b+j, a+i,b+j,a+j);
    }
  }
  const cap=(base,ring,flip)=>{
    const c=[0,0,0];
    for(const p of ring) for(let k=0;k<3;k++) c[k]+=p[k]/ring.length;
    const centre=g.positions.length/3;
    g.positions.push(...c); g.normals.push(0,0,0);
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      if(flip) g.indices.push(centre,base+j,base+i);
      else g.indices.push(centre,base+i,base+j);
    }
  };
  if(capStart) cap(ringBase[0], sections[0], true);
  if(capEnd) cap(ringBase.at(-1), sections.at(-1), false);
  smoothNormals(g);
}

// Lofted rings have no meaningful per-face normal to author, so the arch is lit
// by area-weighted vertex normals accumulated over the triangles that use them.
// Only the ranges this loft just wrote are touched, so earlier groups keep the
// flat normals their boxes were built with.
function smoothNormals(g){
  const acc=new Float64Array(g.positions.length);
  for(let i=0;i<g.indices.length;i+=3){
    const [a,b,c]=[g.indices[i],g.indices[i+1],g.indices[i+2]];
    const p=(k)=>[g.positions[k*3],g.positions[k*3+1],g.positions[k*3+2]];
    const [pa,pb,pc]=[p(a),p(b),p(c)];
    const u=pb.map((q,k)=>q-pa[k]), v=pc.map((q,k)=>q-pa[k]);
    const nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
    for(const idx of [a,b,c]){ acc[idx*3]+=nx; acc[idx*3+1]+=ny; acc[idx*3+2]+=nz; }
  }
  for(let i=0;i<acc.length;i+=3){
    const l=Math.hypot(acc[i],acc[i+1],acc[i+2]);
    if(l<1e-9){ g.normals[i]=0; g.normals[i+1]=1; g.normals[i+2]=0; continue; }
    g.normals[i]=acc[i]/l; g.normals[i+1]=acc[i+1]/l; g.normals[i+2]=acc[i+2]/l;
  }
}

// The violin-family plan, as fractions of body length (bottom block to top
// block) and of the lower-bout half width. Real cello proportions: lower bout
// 440mm, waist 240mm, upper bout 340mm over a 755mm body, widest at 0.20 and
// 0.86 of the length with the waist at 0.58. Everything in the family is this
// curve at a different size, which is why one table serves both instruments.
const VIOLIN_OUTLINE = [
  [0.000, 0.10], [0.030, 0.44], [0.075, 0.74], [0.135, 0.93], [0.200, 1.00],
  [0.275, 0.98], [0.350, 0.885], [0.430, 0.715], [0.505, 0.590], [0.575, 0.545],
  [0.640, 0.585], [0.715, 0.700], [0.790, 0.757], [0.855, 0.773], [0.915, 0.715],
  [0.965, 0.505], [1.000, 0.135],
];

// Arched top and back over flat ribs. Two shoulder rings either side of the rib
// pair make the plates read as domes rather than as a slab with a bevel.
const PLATE_RINGS = [[-1.00, 0.34], [-0.62, 0.76], [0.00, 1.00]];

// One builder for both instruments. `place` maps the local frame — x across the
// body, y from the bottom block toward the scroll, z through the thickness with
// the belly at +z — into mesh space, so the cello can stand on its endpin and
// the violin can lie on its back on a chair without a second model.
function addStringInstrument(m, {
  bodyLength, lowerHalf, ribDepth, archTop, archBack,
  neckLength, neckWidth, fingerboardLength, pegboxLength, bridgeHeight,
  place,
}){
  const P=(x,y,z)=>place([x,y,z]);
  const outline=(scale)=>{
    const ring=[];
    for(const [s,w] of VIOLIN_OUTLINE) ring.push([ w*lowerHalf*scale, s*bodyLength ]);
    // Mirror back down the other side, skipping the two block ends so the loop
    // closes without doubling a vertex on itself.
    for(let i=VIOLIN_OUTLINE.length-2;i>0;i--){
      const [s,w]=VIOLIN_OUTLINE[i];
      ring.push([ -w*lowerHalf*scale, s*bodyLength ]);
    }
    return ring;
  };
  const sections=[];
  for(const [t,scale] of PLATE_RINGS) sections.push(outline(scale).map(([x,y])=>P(x,y,t*archBack-ribDepth/2)));
  for(const [t,scale] of [...PLATE_RINGS].reverse()) sections.push(outline(scale).map(([x,y])=>P(x,y,-t*archTop+ribDepth/2)));
  addLoft(m, sections, MAT.wood);

  // The f-holes are suggested, not cut: two dark slots inset into the belly
  // either side of the bridge. Cutting real apertures would double the loft.
  const fz=ribDepth/2+archTop*0.30;
  for(const side of [-1,1]){
    addBeam(m, P(side*lowerHalf*0.30, bodyLength*0.40, fz), P(side*lowerHalf*0.34, bodyLength*0.60, fz), lowerHalf*0.055, MAT.dark);
  }

  // Neck and pegbox. The string line drops from the bridge top to the nut over
  // roughly a body length, which on a real instrument is about seven degrees —
  // NOT the thirty-odd a naive "rake the neck to the back of the box" gives,
  // which puts the strings through the belly. Everything here is measured from
  // the rib edge and the belly apex so both instruments scale the same way.
  const ribEdge=ribDepth/2;
  const bellyApex=ribEdge+archTop;
  const nutZ=ribEdge+archTop*0.55;
  const heel=P(0, bodyLength*0.985, ribEdge*0.55);
  const nut=P(0, bodyLength+neckLength, nutZ-neckWidth*0.45);
  addBeam(m, heel, nut, neckWidth, MAT.wood);
  addBeam(m, P(0, bodyLength*0.62, bellyApex+neckWidth*0.16), P(0, bodyLength+neckLength*0.96, nutZ), neckWidth*0.86, MAT.dark);

  // The pegbox tilts back off the neck axis, four pegs through it, and a blunt
  // volute closing the end. A scroll modelled properly is a spiral nobody in
  // this game will ever be closer than a metre to.
  const boxMid=P(0, bodyLength+neckLength+pegboxLength*0.45, nutZ-neckWidth*0.45-pegboxLength*0.20);
  const boxEnd=P(0, bodyLength+neckLength+pegboxLength, nutZ-neckWidth*0.45-pegboxLength*0.44);
  addBeam(m, nut, boxMid, neckWidth*1.15, MAT.dark);
  addBeam(m, boxMid, boxEnd, neckWidth*0.95, MAT.wood);
  for(let i=0;i<4;i++){
    const t=0.18+0.22*Math.floor(i/2);
    const along=bodyLength+neckLength+pegboxLength*t;
    const z=nutZ-neckWidth*0.45-pegboxLength*t*0.44;
    const side=i%2?1:-1;
    addBeam(m, P(side*neckWidth*0.40, along, z), P(side*neckWidth*1.30, along, z), neckWidth*0.28, MAT.dark);
  }

  // Bridge, tailpiece, and four strings running over both of them.
  const bridgeZ=ribEdge+archTop*0.62;
  const bridgeTop=P(0, bodyLength*0.545, bridgeZ+bridgeHeight);
  addBeam(m, P(0, bodyLength*0.545, bridgeZ), bridgeTop, lowerHalf*0.52, MAT.wood);
  const tailTop=P(0, bodyLength*0.355, bridgeZ+bridgeHeight*0.34);
  const tailBottom=P(0, bodyLength*0.045, ribEdge+archTop*0.10);
  addBeam(m, tailBottom, tailTop, lowerHalf*0.30, MAT.dark);
  const nutLine=P(0, bodyLength+neckLength+pegboxLength*0.10, nutZ+neckWidth*0.16);
  for(let i=0;i<4;i++){
    const x=(i-1.5)*neckWidth*0.42;
    const over=[bridgeTop[0]+x*0.92, bridgeTop[1], bridgeTop[2]];
    addBeam(m, [tailTop[0]+x*0.52,tailTop[1],tailTop[2]], over, neckWidth*0.06, MAT.steel);
    addBeam(m, over, [nutLine[0]+x*0.55,nutLine[1],nutLine[2]], neckWidth*0.06, MAT.steel);
  }
  return { fingerboardLength };
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
{
  // A stand with a desk you can put something ON. The desk was upright and the
  // mast ran a centimetre past the top of it, so the tuning fork placed "across
  // the desk" at 1.21m was skewered through both. Raked back 62 degrees from
  // vertical, with a lip along its bottom edge, which is what a music stand is.
  const m=mesh('music_stand');
  // The mast STOPS at 0.97, below the lip. It used to run to 1.22 — a
  // centimetre proud of where anything laid on the desk would sit — so a fork
  // resting there was speared whatever its height. Nothing on the desk can
  // intersect a pole that does not reach it.
  addCylinder(m,[0,.49,0],.018,.96,MAT.steel,8);
  addBox(m,[0,1.16,-.07],[.48,.34,.028],MAT.black,-.12,-1.08); // the raked desk
  addBox(m,[0,.995,.045],[.48,.024,.06],MAT.steel,-.12);       // the lip it rests on
  addBox(m,[0,.035,0],[.55,.03,.04],MAT.steel);
  addBox(m,[0,.035,0],[.04,.03,.55],MAT.steel);
}
}
{
  const m=mesh('instrument_case'); addBox(m,[0,.16,0],[1.2,.30,.42],MAT.black);addBox(m,[0,.32,0],[1.08,.025,.32],MAT.cloth);addBox(m,[0,.34,-.22],[.24,.035,.08],MAT.steel);
}
{
  const m=mesh('equipment_cart'); addBox(m,[0,.62,0],[1.15,.08,.65],MAT.steel);addBox(m,[0,.18,0],[1.15,.08,.65],MAT.steel);for(const x of [-.5,.5])for(const z of [-.25,.25]){addCylinder(m,[x,.40,z],.018,.42,MAT.steel,8);addCylinder(m,[x,.05,z],.07,.05,MAT.black,10);}
}
{
  const m=mesh('piano_bench');addBox(m,[0,.49,0],[.76,.10,.34],MAT.black);addLegs(m,0,0,.60,.20,.025,.47,MAT.dark,.025);
}
{
  const m=mesh('open_score');addBox(m,[-.155,.012,0],[.30,.018,.36],MAT.paper,-.08);addBox(m,[.155,.012,0],[.30,.018,.36],MAT.ivory,.08);addBeam(m,[0,.020,-.17],[0,.020,.17],.008,MAT.dark);
}
{
  const m=mesh('loose_pages');for(let i=0;i<7;i++)addBox(m,[(i%3-.8)*.12,.005+i*.003,(Math.floor(i/3)-.7)*.14],[.34,.006,.44],i%2?MAT.paper:MAT.ivory,(i-3)*.17);
}
{
  const m=mesh('metronome');addBox(m,[0,.16,0],[.19,.32,.14],MAT.wood);addBox(m,[0,.33,.01],[.12,.08,.10],MAT.dark);addBeam(m,[0,.08,-.08],[.05,.42,-.08],.012,MAT.brass);addBox(m,[.035,.27,-.08],[.06,.025,.025],MAT.brass);
}
{
  const m=mesh('wastebasket');addCylinder(m,[0,.20,0],.16,.40,MAT.steel,12);addCylinder(m,[0,.415,0],.17,.025,MAT.dark,12);
}
{
  const m=mesh('soft_bag');addBox(m,[0,.15,0],[.64,.28,.30],MAT.cloth);addBeam(m,[-.20,.27,0],[-.12,.48,0],.025,MAT.dark);addBeam(m,[.20,.27,0],[.12,.48,0],.025,MAT.dark);addBeam(m,[-.12,.48,0],[.12,.48,0],.025,MAT.dark);
}
{
  const m=mesh('draped_coat');addBox(m,[0,.43,0],[.52,.74,.08],MAT.cloth,.08);addBox(m,[-.30,.43,.02],[.22,.62,.07],MAT.cloth,-.22);addBox(m,[.30,.43,.02],[.22,.62,.07],MAT.cloth,.22);addBox(m,[0,.77,-.01],[.24,.20,.09],MAT.dark);
}
{
  const m=mesh('mallet_pair');addBeam(m,[-.27,.035,-.035],[.27,.035,.035],.018,MAT.wood);addBeam(m,[-.27,.035,.055],[.27,.035,-.055],.018,MAT.wood);addCylinder(m,[.29,.035,.04],.038,.075,MAT.cloth,10);addCylinder(m,[.29,.035,-.06],.038,.075,MAT.cloth,10);
}
{
  const m=mesh('cable_coil');for(let ring=0;ring<3;ring++){const r=.19+ring*.035;for(let i=0;i<16;i++){const a=i*Math.PI*2/16,b=(i+1)*Math.PI*2/16;addBeam(m,[Math.cos(a)*r,.035+ring*.018,Math.sin(a)*r],[Math.cos(b)*r,.035+ring*.018,Math.sin(b)*r],.018,MAT.black);}}addBeam(m,[.20,.05,0],[.31,.05,.12],.025,MAT.brass);
}
{
  const m=mesh('open_instrument_case');addBox(m,[0,.10,0],[1.28,.18,.48],MAT.black);addBox(m,[0,.205,0],[1.15,.035,.36],MAT.cloth);addBox(m,[0,.48,.30],[1.28,.58,.08],MAT.black,-.12);addBox(m,[0,.48,.25],[1.14,.46,.035],MAT.cloth,-.12);for(const x of[-.38,0,.38])addBox(m,[x,.11,-.255],[.10,.05,.05],MAT.brass);
}

// Instruments and electro-acoustic fixtures.
{
  // Seven of these stand in the practice wing and they are the room's repeated
  // institutional datum, so the silhouette has to survive being looked at from a
  // metre away. Overall height and footprint are unchanged (1.42m tall inside
  // PROP_MESH's 1.55 x .72), because every placement and the collision mask are
  // authored against them.
  const m=mesh('upright_piano');
  addBox(m,[0,.70,.06],[1.48,1.32,.46],MAT.black);        // case
  addBox(m,[0,1.385,.055],[1.52,.075,.50],MAT.black);      // top lid
  addBox(m,[0,1.335,-.175],[1.50,.030,.045],MAT.brass);    // lid hinge line
  addBox(m,[0,1.06,-.185],[1.44,.44,.030],MAT.dark);       // upper front panel
  addBox(m,[0,.775,-.245],[1.44,.115,.075],MAT.black);     // fallboard, folded back
  addBox(m,[0,.955,-.190],[1.30,.245,.022],MAT.dark,-.16); // music desk
  addBox(m,[0,.705,-.395],[1.50,.055,.34],MAT.black);      // keybed shelf
  for(const x of [-.715,.715]) addBox(m,[x,.795,-.395],[.075,.135,.34],MAT.black); // cheek blocks
  // 88 keys over 1.22m. The whites are one slab with a front fascia — at any
  // distance this game is ever played from, the thing that reads as a keyboard
  // is the 2-3-2-3 grouping of the blacks, and 52 separate white boxes cost
  // 624 triangles seven times over to say nothing extra.
  const kbW=1.22, white=kbW/52, kbX=-kbW/2;
  addBox(m,[0,.7475,-.400],[kbW,.030,.315],MAT.ivory);
  addBox(m,[0,.740,-.5555],[kbW,.045,.014],MAT.ivory);
  const BLACK_AFTER=[0,1,3,4,5];
  for(let octave=0;octave<8;octave++) for(const step of BLACK_AFTER){
    // A0/B0 start the board, so the first octave only carries its B flat.
    const whiteIndex=octave*7+step-5;
    if(whiteIndex<0||whiteIndex>=51) continue;
    addBox(m,[kbX+(whiteIndex+1)*white,.7745,-.470],[white*.58,.030,.185],MAT.black);
  }
  addBox(m,[0,.30,-.235],[.34,.42,.030],MAT.black);        // pedal lyre
  for(const x of [-.105,0,.105]) addBox(m,[x,.115,-.285],[.055,.014,.135],MAT.brass);
  addLegs(m,0,-.06,1.24,.28,.02,.44,MAT.black,.040);
  for(const x of [-.62,.62]) for(const z of [-.20,.20]) addCylinder(m,[x,.028,z],.036,.056,MAT.steel,8);
}
{
  const m=mesh('grand_piano'); addBox(m,[0,.78,.10],[1.55,.30,1.85],MAT.black);addBox(m,[0,.92,-.92],[1.62,.19,.42],MAT.black);addBox(m,[0,1.02,-1.10],[1.50,.055,.32],MAT.ivory);addBox(m,[.18,1.10,.12],[1.45,.075,1.72],MAT.black,.10);
  addCylinder(m,[-.62,.38,-.70],.045,.75,MAT.black,10);addCylinder(m,[.58,.38,-.55],.045,.75,MAT.black,10);addCylinder(m,[.42,.38,.72],.045,.75,MAT.black,10);addBox(m,[0,.48,-1.35],[.72,.08,.40],MAT.black);addLegs(m,0,-1.35,.55,.24,.02,.45,MAT.black,.025);
}
{
  const m=mesh('marimba'); addBox(m,[0,.72,0],[2.65,.07,.46],MAT.steel);addBox(m,[0,.72,.46],[2.25,.07,.40],MAT.steel);addLegs(m,0,.20,2.35,.56,.08,.68,MAT.steel,.025);
  for(let i=0;i<MARIMBA_LOWER_BAR_COUNT;i++){const x=marimbaNaturalX(i),w=.13,d=.52-i*.009;addBox(m,[x,1.08,0],[w,.045,d],MAT.wood);if(i<14)addCylinder(m,[x,.72,.02],.035,.58-i*.018,MAT.brass,10);}
  for(let i=0;i<MARIMBA_ACCIDENTAL_AFTER.length;i++){const after=MARIMBA_ACCIDENTAL_AFTER[i],x=marimbaAccidentalX(after);addBox(m,[x,1.15,.42],[.13,.045,.39],MAT.wood);addCylinder(m,[x,.77,.43],.034,.54-i*.014,MAT.brass,10);}
}
{
  const m=mesh('timpani'); addCylinder(m,[0,.54,0],.39,.72,MAT.brass,18);addCylinder(m,[0,.93,0],.44,.08,MAT.steel,20);addCylinder(m,[0,.99,0],.40,.045,MAT.ivory,20);for(let i=0;i<4;i++){const a=i*Math.PI/2;addCylinder(m,[Math.cos(a)*.33,.28,Math.sin(a)*.33],.018,.50,MAT.steel,8);}
}
{
  // Standing on its endpin, which is how both of these were left. Real
  // proportions: 755mm body, 440mm lower bout, 120mm ribs; the whole thing
  // reaches about 1.55m off the floor with the pin part out, not the 1.83m
  // totem the two stacked cylinders here used to make.
  const m=mesh('cello');
  const pin=0.24;   // the dressing says "still extended on its endpin"
  addStringInstrument(m,{
    bodyLength:0.755, lowerHalf:0.220, ribDepth:0.120, archTop:0.048, archBack:0.040,
    neckLength:0.280, neckWidth:0.052, fingerboardLength:0.590,
    pegboxLength:0.150, bridgeHeight:0.090,
    place:([x,y,z])=>[x, y+pin, z],
  });
  addCylinder(m,[0,pin/2,0],.011,pin,MAT.steel,8);
  addCylinder(m,[0,.012,0],.028,.024,MAT.steel,10);
}
{
  // Lying on its back across a chair, chin rest toward the door — the pose the
  // ensemble room's dressing describes. Same builder as the cello with the
  // local frame turned on its side: body along Z, thickness up.
  const m=mesh('violin');
  const rest=0.030;
  addStringInstrument(m,{
    bodyLength:0.355, lowerHalf:0.103, ribDepth:0.031, archTop:0.016, archBack:0.014,
    neckLength:0.130, neckWidth:0.024, fingerboardLength:0.270,
    pegboxLength:0.075, bridgeHeight:0.033,
    // Centred on its own length, scroll toward +z, so the prop sits on the chair
    // rather than hanging off one end of it.
    place:([x,y,z])=>[x, z+rest, y-0.245],
  });
  addBox(m,[0,rest,-.280],[.075,.030,.070],MAT.dark);
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
  const m=mesh('ticket_counter');
  addBox(m,[0,.46,0],[2.8,.92,.72],MAT.dark);addBox(m,[0,.97,0],[3.0,.10,.82],MAT.wood);
  // A ticket window, not a brass fence against bare brick. Three dark wired-
  // glass clerking lights sit behind the original grille and make the counter
  // read as the public face of a room from across the atrium.
  addBox(m,[0,1.62,.325],[2.82,1.28,.055],MAT.black);
  for(const x of[-.9,0,.9])addBox(m,[x,1.62,.292],[.72,.96,.022],MAT.roofGlass);
  // Pale civic trim makes the public function legible before the player is in
  // interaction range; the dark wired glass alone disappears into the closed
  // office when the front-of-house circuit is dead.
  for(const x of[-1.43,-.47,.47,1.43])addBox(m,[x,1.68,.22],[.09,1.48,.15],MAT.agedWhite);
  addBox(m,[0,2.39,.22],[3.02,.18,.15],MAT.agedWhite);
  addBox(m,[0,2.57,.20],[1.78,.22,.12],MAT.dark);
  addBox(m,[0,2.57,.13],[1.48,.055,.025],MAT.brass);
  for(let x=-1.25;x<=1.25;x+=.5)addBox(m,[x,1.62,.265],[.025,1.25,.025],MAT.brass);
  addBox(m,[0,2.23,.265],[2.8,.04,.04],MAT.brass);
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
  const m=mesh('rekey_ledger');
  addBox(m,[0,.48,0],[1.22,.96,.10],MAT.dark);
  addBox(m,[0,.48,-.065],[1.08,.82,.035],MAT.paper);
  addBox(m,[-.48,.48,-.095],[.07,.82,.035],MAT.safetyRed);
  for(let y=.18;y<=.76;y+=.12)addBox(m,[.06,y,-.095],[.82,.018,.015],y===.54?MAT.safetyRed:MAT.dark);
  addBox(m,[.37,.71,-.11],[.20,.09,.025],MAT.brass);
}
{
  const m=mesh('chapel_key_cabinet');
  // Wall assets present their decorated face on +Z. The back sheet reaches
  // z=-.13, so wall contact can put that exact plane against masonry.
  addBox(m,[0,.62,-.115],[.96,1.20,.03],MAT.steel);
  addBox(m,[0,.62,-.092],[.88,1.10,.016],MAT.dark);
  for(const x of[-.48,.48])addBox(m,[x,.62,.05],[.04,1.24,.36],MAT.steel);
  for(const y of[.02,1.22])addBox(m,[0,y,.05],[1.00,.04,.36],MAT.steel);
  addBox(m,[0,1.08,-.072],[.66,.12,.025],MAT.ivory);
  // Four hooks, deliberately only four. The lower-right one stays empty.
  for(const [x,y] of[[-.24,.82],[.24,.82],[-.24,.35],[.24,.35]]){
    addBeam(m,[x,y,-.07],[x,y,.17],.025,MAT.brass);
    addBeam(m,[x,y,.17],[x,y+.045,.205],.025,MAT.brass);
  }
}
{
  const addRing=(name,notches)=>{
    const m=mesh(name),cx=0,cy=.18,cz=.225,segments=12;
    // The tiny buried stud gives every independent ring the same rear datum as
    // the cabinet. Its visible metal sits over the cabinet face on +Z.
    addBox(m,[0,.225,-.125],[.026,.026,.01],MAT.brass);
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      addBeam(m,[cx+Math.cos(a)*.07,cy+Math.sin(a)*.085,cz],[cx+Math.cos(b)*.07,cy+Math.sin(b)*.085,cz],.018,MAT.brass);
    }
    addBox(m,[0,.055,.225],[.16,.075,.025],MAT.ivory);
    for(let i=0;i<notches;i++)addBox(m,[-.045+i*.045,.055,.241],[.018,.045,.009],MAT.dark);
    addBeam(m,[-.026,.13,.225],[-.045,.025,.225],.018,MAT.brass);
    addBeam(m,[.025,.13,.225],[.052,.025,.225],.018,MAT.brass);
  };
  addRing('chapel_key_ring_ch04',1);
  addRing('chapel_key_ring_c17',2);
  addRing('chapel_key_ring_fohm',3);
}
// ── the sub-basement dance wing ─────────────────────────────────────────────
// Wall-mounted, so all three are authored against z=0 with their depth running
// into -z. The barre is the double height a teaching room has rather than the
// single a company studio has: 0.82 for children, 1.06 for adults.
{
  const m=mesh('dance_barre');
  for(const y of [.82,1.06]) addCylinder(m,[0,y,-.11],.024,2.9,MAT.wood,10);
  // Brackets. The end pair sit in from the ends the way a real run does, so the
  // rail overhangs and reads as a rail rather than as a rung between two posts.
  for(const x of [-1.28,0,1.28]){
    addBox(m,[x,.94,-.045],[.05,.30,.09],MAT.steel);
    addBox(m,[x,.94,-.005],[.07,.34,.02],MAT.steel);
  }
}
// A mirrored wall in sections, because that is how it is delivered and because
// the seams are the only thing that tells you it is a mirror: the renderer has
// no reflections, so this reads as a slightly brighter, flatter plane than the
// plaster around it, banded by its own joints and edged in a fixing channel.
{
  const m=mesh('dance_mirror');
  addBox(m,[0,1.42,-.02],[3.96,2.24,.04],MAT.steel);
  for(const x of [-1.32,1.32]) addBox(m,[x,1.42,-.045],[.03,2.24,.02],MAT.dark);
  addBox(m,[0,.29,-.05],[3.96,.06,.05],MAT.dark);
  addBox(m,[0,2.55,-.05],[3.96,.06,.05],MAT.dark);
}
// A painted door number. Stencilled, not signed: the wing has no plaques.
{const m=mesh('door_stencil');addBox(m,[0,.16,-.01],[.46,.32,.015],MAT.paper);}
// Freestanding, and both live in the prop store.
{
  const m=mesh('costume_rail');
  addCylinder(m,[0,1.58,0],.018,1.52,MAT.steel,8);
  for(const x of [-.7,.7]){
    addCylinder(m,[x,.78,0],.02,1.54,MAT.steel,8);
    addBox(m,[x,.03,0],[.10,.06,.52],MAT.steel);
  }
  addBox(m,[0,1.58,0],[1.42,.036,.036],MAT.steel,0);
  // What is still on it. Not garments — shapes under dust sheets.
  for(const x of [-.52,-.18,.26,.58]) addBox(m,[x,1.06,0],[.22,.92,.30],MAT.cloth);
}
// Rolls of sprung-floor vinyl stood on end in a corner, leaning slightly.
{
  const m=mesh('rolled_lino');
  const lean=[[-.17,.05,.03],[.02,0,-.02],[.19,-.04,.05]];
  for(let i=0;i<lean.length;i++){
    const [x,,tilt]=lean[i];
    addCylinder(m,[x,.86+i*.03,i*.06-.06],.115,1.72,i%2?MAT.dark:MAT.black,10);
    addBox(m,[x,1.70,i*.06-.06],[.24,.05,.24],MAT.agedWhite,tilt);
  }
}
{
  const m=mesh('loose_note');
  // A sheet with an imperfect folded corner, kept thick enough to survive the
  // low-resolution depth pass without becoming a z-fighting floor decal.
  addBox(m,[0,.008,0],[.32,.016,.42],MAT.paper);
  addBox(m,[.115,.019,-.155],[.07,.006,.07],MAT.ivory,.16);
}
{
  const m=mesh('loose_note_page6');
  addBox(m,[0,.018,0],[.40,.036,.50],MAT.paper,-.04);
  addBox(m,[.13,.085,-.17],[.14,.018,.15],MAT.ivory,.52,.42);
  addBox(m,[-.16,.044,.18],[.09,.055,.30],MAT.ivory,-.08,.12);
  for(let z=-.10;z<=.13;z+=.075)addBox(m,[-.03,.047,z],[.22,.010,.013],MAT.dark,-.04);
}
{
  // Objective guidance is geometry in the scene, not a screen-space icon. The
  // broken floor ring leaves the target itself visible, while the three raised
  // ticks give it a readable vertical silhouette from a first-person camera.
  const m=mesh('story_waypoint_beacon');
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,r=.58;
    addBox(m,[Math.cos(a)*r,.032,Math.sin(a)*r],[.20,.045,.055],i%3===0?MAT.ivory:MAT.safetyRed,-a);
  }
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3,r=.43;
    addBox(m,[Math.cos(a)*r,.34,Math.sin(a)*r],[.08,.62,.08],MAT.safetyRed,-a);
    addBox(m,[Math.cos(a)*r,.68,Math.sin(a)*r],[.22,.07,.08],MAT.ivory,-a);
  }
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
  // THE BATHS ENTRANCE. A civic pool needs a dry-to-wet sequence before it
  // needs decorative clutter: terrazzo/mosaic underfoot, drains where outdoor
  // shoes stop, an attendant's hatch, admission control, an accessible bypass,
  // and wired-glass screens that reveal the humid hall without making another
  // room. Everything stands off the centre axis and remains non-colliding; the
  // floorplan is still the sole navigation/occlusion envelope.
  const m=mesh('natatorium_entrance_fixtures');

  // 1912 mosaic threshold and the later stainless trench drains.
  addBox(m,[0,.018,-1.78],[5.8,.036,1.34],MAT.ivory);
  for(let iz=0;iz<4;iz++)for(let ix=0;ix<14;ix++){
    if((ix+iz)%3!==0)continue;
    addBox(m,[-2.70+ix*.415,.041,-2.25+iz*.31],[.19,.012,.14],(ix+iz)%2?MAT.poolBlue:MAT.poolMint);
  }
  for(const z of[-.98,.92]){
    addBox(m,[0,.045,z],[6.2,.07,.16],MAT.steel);
    for(let x=-2.85;x<=2.85;x+=.30)addBox(m,[x,.087,z],[.045,.012,.11],MAT.dark);
  }

  // Wired-glass control screens. Their low tiled plinths stop well short of the
  // centre; sight, air and the wide accessible lane all continue through.
  for(const side of[-1,1]){
    const x=side*3.55;
    addBox(m,[x,.34,.38],[.16,.68,2.85],MAT.poolMint);
    for(const z of[-.92,.02,1.00,1.80])addBox(m,[x,1.72,z],[.10,2.12,.08],MAT.agedWhite);
    addBox(m,[x,2.76,.42],[.12,.12,2.92],MAT.agedWhite);
    for(const z of[-.46,.50,1.40])addBox(m,[x,1.73,z],[.045,1.88,.76],MAT.roofGlass);
  }

  // Attendant hatch and towel return on the west side. The counter is turned
  // toward the entering player, with the original grille surviving above it.
  addBox(m,[-7.35,.48,-.35],[3.25,.96,.68],MAT.poolMint);
  addBox(m,[-7.35,1.01,-.46],[3.46,.10,.88],MAT.stone);
  addBox(m,[-7.35,2.13,-.05],[3.35,2.18,.12],MAT.agedWhite);
  addBox(m,[-7.35,1.98,-.12],[2.86,1.48,.08],MAT.dark);
  for(let x=-8.58;x<=-6.12;x+=.31)addCylinder(m,[x,1.98,-.19],.018,1.34,MAT.bronze,8);
  addBox(m,[-8.58,.73,.10],[.92,.32,.12],MAT.dark);
  addBox(m,[-8.58,.73,.02],[.78,.22,.025],MAT.paper);

  // One old tripod turnstile survives beside a wide manual bypass. The bypass
  // is the stronger line in the silhouette, making accessibility legible rather
  // than leaving it as an invisible gameplay concession.
  addCylinder(m,[1.88,.78,.22],.075,1.48,MAT.bronze,12);
  addCylinder(m,[1.88,.83,.22],.16,.14,MAT.brass,12);
  for(const angle of[-.62,.42,1.46])addBeam(m,[1.88,.84,.22],[1.88+Math.cos(angle)*.82,.84, .22+Math.sin(angle)*.82],.035,MAT.bronze);
  for(const x of[-1.58,-.42]){
    addCylinder(m,[x,.58,.54],.055,1.12,MAT.bronze,10);
    addCylinder(m,[x,1.16,.54],.10,.08,MAT.brass,10);
  }
  addBeam(m,[-1.55,1.01,.54],[-.48,1.01,.54],.045,MAT.bronze);

  // High municipal identity and humble service hardware: an enamel BATHS
  // header, clock conduit, radiator and boot-scrape rail. These break the lobby
  // into human-scale layers without putting scenery in the route.
  addBox(m,[0,3.54,-1.78],[5.55,.78,.13],MAT.poolBlue);
  addBox(m,[0,3.54,-1.86],[4.86,.50,.025],MAT.ivory);
  for(const x of[5.55,6.03,6.51,6.99,7.47,7.95])addBox(m,[x,.66,1.66],[.24,1.14,.16],MAT.agedWhite);
  addBox(m,[6.75,.12,1.66],[2.92,.20,.28],MAT.dark);
  addBox(m,[7.55,1.62,1.68],[1.18,1.04,.24],MAT.steel);
  addBox(m,[7.55,1.62,1.54],[.94,.80,.035],MAT.agedWhite);
  addBox(m,[-5.18,.11,1.70],[2.25,.18,.34],MAT.dark);
  for(let x=-6.08;x<=-4.28;x+=.30)addBox(m,[x,.22,1.70],[.08,.22,.36],MAT.wood);
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
{
  const m=mesh('plant_calorifier');
  addCylinder(m,[0,1.38,0],.66,2.34,MAT.agedWhite,18);
  addCylinder(m,[0,.14,0],.73,.18,MAT.dark,18);
  for(const y of[.42,1.32,2.22])addCylinder(m,[0,y,0],.70,.075,MAT.brass,18);
  addBox(m,[0,1.42,-.69],[.44,.58,.10],MAT.steel);addCylinder(m,[0,1.78,-.78],.13,.08,MAT.ivory,16);
  addBeam(m,[0,2.52,0],[0,2.92,0],.10,MAT.steel);addBeam(m,[0,.20,0],[.72,.20,0],.10,MAT.steel);
}
{
  const m=mesh('plant_pump_skid');
  addBox(m,[0,.08,0],[1.80,.16,.88],MAT.dark);
  addCylinder(m,[-.44,.44,0],.34,.56,MAT.steel,16);addCylinder(m,[.44,.44,0],.30,.56,MAT.brass,16);
  addBeam(m,[-.88,.48,0],[-.76,.48,0],.10,MAT.steel);addBeam(m,[.74,.48,0],[.92,.48,0],.10,MAT.steel);
  addBox(m,[.42,.78,0],[.48,.18,.46],MAT.dark);
}
{
  const m=mesh('plant_mcc_bank');
  addBox(m,[0,1.08,0],[2.70,2.16,.38],MAT.steel);
  for(const x of[-.88,0,.88]){addBox(m,[x,1.12,-.205],[.78,1.92,.035],MAT.dark);for(const y of[.52,1.08,1.64])addBox(m,[x,y,-.235],[.56,.055,.025],MAT.paper);addCylinder(m,[x+.24,1.80,-.25],.045,.035,MAT.brass,10);}
  addBox(m,[0,.16,-.24],[2.48,.10,.04],MAT.brass);
}
{
  const m=mesh('plant_idf_frame');
  addBox(m,[0,.90,0],[2.25,1.76,.12],MAT.dark);
  for(const y of[.32,.58,.84,1.10,1.36,1.60]){addBox(m,[0,y,-.09],[2.02,.075,.06],MAT.ivory);for(let x=-.86;x<=.86;x+=.22)addBox(m,[x,y,-.135],[.035,.055,.025],(Math.round((x+1)*10)+Math.round(y*10))%3?MAT.brass:MAT.safetyRed);}
  for(const x of[-1.0,1.0])addBeam(m,[x,.08,-.12],[x,1.72,-.12],.035,MAT.steel);
}
{
  const m=mesh('plant_header_manifold');
  for(const y of[.48,1.08,1.72])addBeam(m,[-2.25,y,0],[2.25,y,0],.13,y===1.08?MAT.agedWhite:MAT.steel);
  for(const x of[-1.75,-.88,0,.88,1.75]){addBeam(m,[x,.22,0],[x,2.18,0],.09,MAT.steel);addBox(m,[x,1.12,-.12],[.34,.34,.20],MAT.brass);addBox(m,[x,1.52,-.19],[.62,.07,.06],MAT.safetyRed);addBox(m,[x,1.52,-.19],[.07,.62,.06],MAT.safetyRed);}
  addCylinder(m,[0,2.12,-.12],.20,.08,MAT.ivory,18);
  for(const x of[-2.15,2.15])addBox(m,[x,.98,.10],[.18,1.96,.32],MAT.dark);
}
for(const[index,angle]of[-.55,-.05,.42].entries()){
  const m=mesh(`plant_gauge_needle_${index}`),length=.145;
  addBeam(m,[0,2.12,-.205],[Math.sin(angle)*length,2.12+Math.cos(angle)*length,-.205],.018,MAT.black);
  addCylinder(m,[0,2.12,-.205],.026,.018,MAT.black,10);
}
{
  const m=mesh('plant_overhead_header');
  for(const z of[-.68,0,.68]){addBeam(m,[-3.75,2.92,z],[3.75,2.92,z],.15,z===0?MAT.agedWhite:MAT.steel);for(const x of[-2.8,0,2.8])addBeam(m,[x,2.64,z],[x,3.12,z],.055,MAT.dark);}
  for(const x of[-3.55,3.55])addBeam(m,[x,.20,0],[x,2.95,0],.13,MAT.steel);
}
{
  const m=mesh('plant_grated_steps');
  addBox(m,[0,.10,.42],[3.0,.20,.66],MAT.steel);addBox(m,[0,.30,-.32],[3.0,.20,.72],MAT.steel);
  for(let x=-1.38;x<=1.38;x+=.18){addBox(m,[x,.215,.05],[.055,.025,1.42],MAT.dark);}
  for(const x of[-1.45,1.45]){addBeam(m,[x,.18,.62],[x,1.08,-.72],.045,MAT.brass);addBeam(m,[x,1.08,-.72],[x,1.08,.62],.045,MAT.brass);}
}
{
  const m=mesh('plant_steam');
  for(let i=0;i<7;i++){const y=.18+i*.27,x=Math.sin(i*1.7)*(.12+i*.018),z=Math.cos(i*1.3)*.10;addBeam(m,[x,y,z],[x+Math.sin(i)*.10,y+.34,z+Math.cos(i)*.08],.055+i*.012,MAT.ivory);}
}
{
  const m=mesh('adjustable_spanner');
  // The blue enamel is the remembered family resemblance in the source notes,
  // and a deliberate value break against both the van shelf and wet concrete.
  addBeam(m,[-.13,.032,0],[.15,.032,0],.052,MAT.poolBlue);
  addBox(m,[-.19,.038,0],[.13,.105,.060],MAT.steel);
  addBox(m,[-.215,.038,-.047],[.075,.105,.035],MAT.steel);
  addBox(m,[-.155,.038,.047],[.055,.105,.035],MAT.steel);
  addCylinder(m,[-.18,.095,0],.025,.05,MAT.brass,12);
  addBox(m,[.18,.032,0],[.10,.075,.055],MAT.agedWhite);
}
{
  const m=mesh('stillson_wrench');
  addBeam(m,[-.78,.07,0],[.76,.07,0],.11,MAT.steel);addBox(m,[-.84,.08,0],[.26,.22,.16],MAT.safetyRed);addBox(m,[-.98,.16,0],[.20,.18,.18],MAT.steel);addBox(m,[.72,.07,0],[.28,.16,.14],MAT.dark);
}
{
  const m=mesh('walkie_radio');
  addBox(m,[0,.20,0],[.22,.40,.12],MAT.black);addBox(m,[0,.28,-.07],[.16,.13,.025],MAT.steel);addBox(m,[0,.37,-.08],[.05,.025,.02],MAT.vfd);addCylinder(m,[-.07,.45,0],.025,.16,MAT.black,8);addCylinder(m,[.07,.43,0],.035,.06,MAT.brass,10);
}
{const m=mesh('radio_carrier_led');addBox(m,[0,.37,-.082],[.052,.028,.018],MAT.vfd);}
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
  // THE GANGWAYS ARE THE FLOORPLAN'S. hallGroundProfile flags three aisles with
  // F.STAIR, and game/props.js now derives the seating collision from exactly
  // those flags rather than from a second guess authored in metres. The seats
  // have to stop where the aisles start or the player walks through a row.
  // Measured off the compiled plan at authored y=24: west ends at 102, centre
  // runs 110.5-114, east begins at 122.5. The anchor is authored x=113, so in
  // local metres that is seats from -11.0 to +9.5 with a hole at -2.5..+1.0.
  // The transverse cross-over is at local z 0.15..1.85 (props.js keeps it, since
  // hallGroundProfile's aisle test is x-only and cannot flag a gangway that runs
  // across the bowl). The terrace platform still steps through it — it is a rake,
  // not a hole — but no row of seats may stand in it.
  const AISLE_MIN=-2.5,AISLE_MAX=1.0,SEAT_MIN=-11.0,SEAT_MAX=9.5,CROSS_MIN=.15,CROSS_MAX=1.85;
  const PITCH=.72;
  // A SEAT, NOT A CUBE.
  //
  // Each seat was one 0.54 x 0.72 x 0.55 box, so nine hundred of them read as a
  // gravel bed. A Victorian house seat is a cast-iron end standard, a raked back,
  // and a pan — and in a building nobody has sat in since April every pan is
  // TIPPED UP, which is the whole silhouette of an empty auditorium and the thing
  // a single box can never say. The standards are shared between neighbours, one
  // per gap rather than two per seat, which is both how they are really built and
  // what keeps this inside its triangle budget.
  //
  // Rows face -z: the stage is north of the bowl, so the back is at +z and the
  // pan hangs vertically in front of it.
  const seatRun=(x0,x1,y,z)=>{
    if(x1-x0<PITCH*.5)return;
    for(let x=x0;x<=x1+1e-6;x+=PITCH){
      // The standard, with its arm cap rolled into the same box.
      addBox(m,[x-PITCH/2,y+.32,z],[.055,.64,.54],MAT.dark);
      if(x+PITCH>x1+1e-6)addBox(m,[x+PITCH/2,y+.32,z],[.055,.64,.54],MAT.dark);
      // The back, raked back a few degrees off vertical.
      addBox(m,[x,y+.72,z+.20],[.56,.60,.075],MAT.cloth,0,-.13);
      // The pan, folded up against it. This is the one that matters.
      addBox(m,[x,y+.40,z+.07],[.54,.44,.07],MAT.cloth,0,.09);
    }
  };
  for(let row=0;row<11;row++){
    const z=-8+row*1.55,y=row*.45;
    addBox(m,[0,y/2-.05,z],[24,y+.1,1.45],MAT.dark);            // the terrace
    addBox(m,[0,y-.02,z-.70],[24,.09,.10],MAT.wood);            // and its nosing
    if(z+.28>CROSS_MIN&&z-.28<CROSS_MAX)continue;
    seatRun(SEAT_MIN,AISLE_MIN-PITCH/2,y,z);
    seatRun(AISLE_MAX+PITCH/2,SEAT_MAX,y,z);
  }
}
{
  const m=mesh('hall_structure');
  // A MODERN HALL INSERTED IN A VICTORIAN SHELL.
  //
  // Koerner Hall is a 2009 recital room built inside the Royal Conservatory's
  // 1881 building on Bloor Street, which is exactly this room's situation. So the
  // Victorian proscenium survives only as a plain masonry BAY and a timber hall
  // stands inside it: portal, platform, choir gallery, organ. The fly tower over
  // the top is a dead void nobody removed.
  //
  // WHY THIS IS STAGED IN DEPTH AND NOT MODELLED IN RELIEF.
  //
  // The torch is co-located with the eye, so lambert is exactly N·V: a face
  // parallel to the wall gains NOTHING from standing proud of it, and a hundred
  // mouldings on one plane render as one flat sheet. That is what was wrong with
  // this — every box sat at z=-10.8. Only two things carry a prop here:
  //   · a DEPTH BREAK, which needs 0.74m at ten metres and 1.9m at twenty before
  //     it draws a contour, so these layers are METRES apart, not centimetres;
  //   · a TONAL EDGE, needing ~0.10 luminance across one halftone cell, so each
  //     layer alternates plaster (.617) against wood (.222) — a 2.8:1 ratio.
  // And relief only ever reads through its RETURNS, so every tier below shows the
  // house a riser, a soffit or a reveal rather than its face.
  //
  // Local metres against the anchor at authored (113,23). The depth planes:
  //   BAY   -10.8   the old masonry opening (matches the existing colliders)
  //   PORT  -12.2   the timber portal, 1.4m upstage of the bay
  //   CHOIR -15.4 .. -17.2   three ranks rising to the back wall
  //   ORGAN -17.6   against the stage house
  // The platform is authored y5-11, which is local z -18..-12, so EVERYTHING
  // upstage has to live inside that. The choir and organ were first drawn at
  // -16..-18.9 and the organ was simply inside the north wall, where the
  // architecture pass occludes it: from the front row the whole back of the
  // stage read as black.
  const BAY=-10.8, PORT=-12.2, HOUSE=-2.5, STAGE=-1.5, HEAD=4.0, TOP=9.5;
  const PIER=10.3, IN=8.6;

  // The platform. Authored to hallStageProfile: top at -1.5, two step bays at
  // local -6 and +5 rising -2.5 -> -2.16 -> -1.83 -> -1.5.
  addBox(m,[0,(HOUSE+STAGE)/2,-15],[26,STAGE-HOUSE,8],MAT.wood);
  for(const bx of [-6,5]){
    addBox(m,[bx,-2.33,-12],[3.0,.34,1.0],MAT.wood);
    addBox(m,[bx,-2.00,-13],[3.0,.34,1.0],MAT.wood);
  }

  // LAYER 1 — the Victorian bay. Plain, heavy, and DEEP: its reveal is the one
  // return in this room every seat can see, so it is 2.1m front to back.
  for(const sx of [-1,1]){
    const x=sx*PIER;
    addBox(m,[x,(HOUSE+TOP)/2,BAY],[3.2,TOP-HOUSE,1.40],MAT.plaster);
    addBox(m,[sx*(IN+.30),(HOUSE+HEAD)/2,BAY-.35],[.60,HEAD-HOUSE,2.10],MAT.stone);
  }
  addBox(m,[0,HEAD+.55,BAY],[23.8,1.10,1.40],MAT.plaster);
  addBox(m,[0,HEAD+.02,BAY-.35],[17.8,.36,2.10],MAT.stone);
  addBox(m,[0,(HEAD+1.1+TOP)/2,BAY],[17.8,TOP-HEAD-1.1,1.00],MAT.plaster);

  // LAYER 2 — the timber portal, 1.4m upstage and a size smaller. The gap
  // between it and the bay is the depth break that makes this an opening you
  // look THROUGH rather than a picture hung on a wall.
  for(const sx of [-1,1]){
    addBox(m,[sx*7.6,(STAGE+3.4)/2,PORT],[1.20,3.4-STAGE,.90],MAT.wood);
    addBox(m,[sx*6.9,(STAGE+3.4)/2,PORT-.50],[.22,3.4-STAGE,1.90],MAT.dark);
  }
  addBox(m,[0,3.62,PORT],[16.4,.44,.90],MAT.wood);
  addBox(m,[0,3.34,PORT-.50],[15.0,.20,1.90],MAT.dark);
  // Slatted acoustic timber over the portal head. The slats are 260mm — above
  // the 150mm that still reads from mid-stalls, below which this becomes noise.
  for(let x=-7.0;x<=7.0;x+=.62) addBox(m,[x,4.90,PORT+.10],[.26,2.0,.30],MAT.wood);

  // LAYER 3 — the choir gallery. Three ranks, each turning a riser face toward
  // the house; the treads never read from down there and are not worth spending.
  for(let t=0;t<3;t++){
    const z=-15.4-t*.90, top=STAGE+.45+t*.45;
    addBox(m,[0,top-.06,z],[18.0-t*1.2,.12,.90],MAT.wood);
    addBox(m,[0,top-.28,z-.44],[18.0-t*1.2,.45,.14],MAT.dark);
    for(let x=-7.5+t*.6;x<=7.5-t*.6;x+=1.5) addBox(m,[x,top+.42,z+.18],[.06,.84,.44],MAT.dark);
  }

  // LAYER 4 — the organ, against the stage house. Same idiom as
  // tower_organ_case: a triangular envelope of pipes so the SILHOUETTE does the
  // work, steel (.235) on a dark case (.106) so it has something to be light
  // against, plus a specular channel the case has not got.
  addBox(m,[0,1.35,-17.60],[11.0,5.6,.70],MAT.dark);
  for(let i=-16;i<=16;i++){
    const h=1.5+(1-Math.abs(i)/17)*3.1;
    addCylinder(m,[i*.32,-.05+h/2,-17.22],.085,h,MAT.steel,8);
  }
  addBox(m,[0,4.30,-17.15],[11.4,.34,.90],MAT.wood);
  // THE ARMS CASCADE, so the decks are drawn in tiers rather than as two
  // continuous shelves. This mirrors balconyCascade in the floorplan exactly —
  // rear at the authored height, one 0.44 bowl riser down per tier of six cells
  // — because a deck drawn level over a stepped floor is a deck you walk through.
  //
  // Local z maps to the arm's local y as z = (localY + 4) - 23, so the rear row
  // (localY 36) is z=17 and the front (localY 8) is z=-11.
  for(const base of [3.9,7.4]){
    for(let tier=0;tier<5;tier++){
      const y=base-tier*.44;
      const zHi=17-tier*6, zLo=Math.max(-11,zHi-6);
      const zc=(zHi+zLo)/2, d=zHi-zLo;
      if(d<=0)continue;
      for(const x of [-12.0,12.0]) addBox(m,[x,y,zc],[3.5,.22,d],MAT.wood);
      // The riser between tiers, which is the return that actually reads.
      if(tier<4)for(const x of [-12.0,12.0]) addBox(m,[x,y-.22,zLo],[3.5,.44,.16],MAT.dark);
      for(const x of [-10.25,10.25]) addBox(m,[x,y+.58,zc],[.08,1.12,d],MAT.brass);
    }
    // The rear band is flat: it is the deck the arms hang off. Only the UPPER one
    // is drawn — the lower balcony's rear is the hall's own rear cross aisle now.
    if(base>5){ addBox(m,[0,base,14.5],[24,.22,4.5],MAT.wood); addBox(m,[0,base+.58,12.25],[20.5,1.12,.08],MAT.brass); }
  }
  // THE GALLERIA FLIGHTS.
  //
  // These used to be left out on the grounds that the floorplan authors the
  // stair surfaces, so a mesh would duplicate them. It does not: the scene
  // shader is a sector DDA with ONE floor/ceiling pair per column, and while you
  // stand in the hall the envelope collapses every hall column to min-floor and
  // max-ceil so the balconies keep their sightlines. The consequence is that the
  // flight is a floor which quietly ramps upward under your feet, with no risers,
  // no soffit and no rail — a stair you can walk and cannot see, in the darkest
  // aisle in the building. Both were reachable the whole time and neither read
  // as a way up.
  //
  // Authored to the COMPILED treads, not by eye: the flights occupy physical
  // x200-201 and x252-253 (runtime half-cells), z42-62, which is local x -12.75
  // and +13.25, z -2..+8. West climbs south -0.74 -> 3.77 at 0.225 per half
  // cell; east climbs north 7.50 -> 4.00 at 0.175. Change the floorplan and
  // these must move with it or the steps stop matching the ground under them.
  //
  // ONLY THE EAST FLIGHT IS DRAWN. The west one is authored INSIDE the west
  // seating aisle: `galleria_lower_stair` climbs -0.74 -> 4.00 through the exact
  // volume the aisle ramps through (-0.74 -> 1.90 over the same rows), on a
  // separate logical island that physicalReplace lets own the air. Two floors in
  // one place — so the player walks the ramp to their seats and passes straight
  // through drawn treads standing in it. Drawing that is worse than not drawing
  // it: it makes a geometry fault read as intended architecture. The east flight
  // has no such conflict — it sits SEVEN METRES above the gangway it crosses
  // (phys 252: ground -0.30, hall_stair 6.80) — so it is drawn.
  for(const f of [
    {x: 13.25, h0: 7.50, dh:-0.175, rail: 12.70, newel: 12.70},
  ]){
    for(let i=0;i<20;i++){
      const z=-2+i*.5, h=f.h0+i*f.dh;
      addBox(m,[f.x,h-.06,z],[1.0,.12,.5],MAT.wood);                       // the going
      addBox(m,[f.x,h-Math.abs(f.dh)/2-.06,z-.25],[1.0,Math.abs(f.dh),.06],MAT.dark); // the riser
    }
    // A rail on the open side only — the other side is the hall's own wall.
    for(let i=0;i<20;i+=1){
      const z=-2+i*.5, h=f.h0+i*f.dh;
      if(i%4===0) addBox(m,[f.rail,h+.45,z],[.05,.90,.05],MAT.brass);
      addBox(m,[f.rail,h+.92,z],[.06,.06,.5],MAT.brass);
    }
    // A newel at the foot, which is the whole point: something that reads as an
    // invitation from the orchestra floor rather than as a darker piece of wall.
    addBox(m,[f.newel,f.h0+.52,f.dh>0?-2.2:8.2],[.13,1.15,.13],MAT.wood);
    addBox(m,[f.newel,f.h0+1.14,f.dh>0?-2.2:8.2],[.20,.10,.20],MAT.brass);
  }
  // Acoustic reflector ribbons and two technical bridges.
  // The sails. Homage, not lift: the reference fans dozens of blades the length
  // of its room; this is the same idea at this room's scale. They are PITCHED so
  // the stalls see their undersides, which is the only face a torch below them
  // can light at all.
  for(let i=0;i<19;i++){
    const t=i/18, z=-17+t*30, y=12.4+Math.sin(t*3.1)*1.15, w=21-Math.abs(t-.35)*9;
    addBox(m,[0,y,z],[w,.22,.62],MAT.wood,(t-.5)*.09,(t-.5)*.16);
  }
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
  // FRONT OF HOUSE, before the hall proper. The floorplan owns the clear two-
  // metre throat; this mesh gives it the architectural depth a civic concert
  // hall entrance needs without adding a second collision envelope.
  const m=mesh('hall_entrance_portal');
  // Worn runner and brass threshold pull the eye through from almost four
  // metres out in the atrium. +Z is the public/atrium side of the door.
  addBox(m,[0,.018,1.95],[1.92,.036,3.90],MAT.cloth);
  for(let z=.20;z<=3.72;z+=.44)addBox(m,[0,.042,z],[1.80,.012,.028],MAT.brass);
  addBox(m,[0,.055,.10],[2.18,.11,.22],MAT.brass);

  // Deep Edwardian oak casing over a later acoustic pair: stone plinths,
  // panelled shafts, capitals, overpanel and a shallow projecting cornice.
  for(const side of[-1,1]){
    const x=side*1.42;
    addBox(m,[x,.34,.02],[.62,.68,.58],MAT.stone);
    addBox(m,[x,1.78,.02],[.46,2.22,.42],MAT.stone);
    addBox(m,[x,2.96,.02],[.68,.26,.58],MAT.stone);
    addBox(m,[x,1.74,.28],[.30,1.72,.08],MAT.wood);
    addBox(m,[x,2.40,.33],[.24,.08,.10],MAT.brass);
  }
  addBox(m,[0,3.18,.02],[3.48,.38,.58],MAT.stone);
  addBox(m,[0,3.56,.02],[3.78,.28,.72],MAT.stone);
  addBox(m,[0,4.10,.02],[3.34,.78,.44],MAT.dark);
  addBox(m,[0,4.10,.26],[2.72,.42,.055],MAT.brass);
  for(const x of[-1.05,-.70,-.35,0,.35,.70,1.05])addBox(m,[x,4.10,.305],[.055,.22,.035],MAT.ivory);

  // The vestibule has a ceiling and side returns, not just a decorated wall.
  // Short coffers create repeated depth cues while leaving every walking and
  // sight line open below them.
  for(const z of[.34,1.15,1.96,2.77,3.58]){
    addBox(m,[0,4.46,z],[3.34,.16,.24],MAT.wood);
    addBox(m,[-1.63,2.72,z],[.14,3.48,.22],MAT.wood);
    addBox(m,[1.63,2.72,z],[.14,3.48,.22],MAT.wood);
  }
  addBox(m,[0,4.52,1.96],[3.34,.10,3.78],MAT.plaster);
}
{
  const m=mesh('hall_entrance_sign');
  addBox(m,[0,.24,.03],[2.75,.48,.06],MAT.dark);
  addBox(m,[0,.24,.068],[2.52,.32,.025],MAT.brass);
  addBox(m,[0,.24,.086],[2.20,.18,.018],MAT.dark);
  for(const x of[-.96,-.64,-.32,0,.32,.64,.96])addBox(m,[x,.24,.102],[.045,.10,.012],MAT.ivory);
}
{
  // Front-of-house lamps are an inherited civic fitting, not the emergency
  // bulkheads used in the service ranges. A warm opal lantern in a tarnished
  // brass cradle makes the public threshold legible from the atrium.
  const m=mesh('hall_entry_sconce');
  addBox(m,[0,.25,.025],[.30,.50,.05],MAT.brass);
  addBox(m,[0,.31,.10],[.22,.30,.14],MAT.ivory);
  addBox(m,[0,.31,.185],[.26,.34,.035],MAT.brass);
  addBox(m,[0,.08,.13],[.30,.055,.22],MAT.brass);
  addBox(m,[0,.52,.13],[.30,.055,.22],MAT.brass);
  for(const x of[-.12,.12])addBeam(m,[x,.10,.15],[x,.50,.15],.018,MAT.brass);
}
{
  // The old public atrium keeps only its high civic order: pilasters, picture
  // rail, cornice and blind arches. Lower base courses, dado rails and stiles
  // were visually reading as wainscoting throughout the atrium, so the actual
  // authored wall now runs cleanly from floor to the high relief. The municipal
  // baths relief is separate and deliberately retains its tiled dado.
  const m=mesh('front_atrium_perimeter_relief');
  addUpperCivicRelief(m,{
    axis:'x',plane:-11.5,inside:1,spans:[[-10.5,-8.95],[-6.05,10.5]],
    pilasters:[-10.35,-8.95,-6.05,-3.0,.15,3.3,6.45,9.9],
    reliefScale:.36,
  });
  addUpperCivicRelief(m,{
    axis:'z',plane:-11,inside:1,spans:[[-10.9,-2.65],[-.35,10.9]],
    pilasters:[-10.65,-7.9,-5.25,-2.65,-.35,2.35,5.05,7.75,10.65],
    reliefScale:.36,
  });
  // The ticket office has moved to the entrance-side north-east corner. The
  // civic order resumes only on the open promenade between that office and the
  // concert-hall vestibule; neither enclosed room receives borrowed trim.
  addUpperCivicRelief(m,{
    axis:'z',plane:11,inside:-1,spans:[[-1.25,8.25]],
    pilasters:[-1.05,1.6,4.25,6.9,8.1],
    reliefScale:.36,
  });
  addUpperCivicRelief(m,{
    axis:'x',plane:11.5,inside:-1,spans:[[-10.5,-1.75],[.75,10.5]],
    pilasters:[-10.25,-7.35,-4.45,-1.75,.75,3.7,6.65,9.9],
    reliefScale:.36,
  });
  for(const along of[-7.5,-4.5,-1.45,1.65,4.8,7.95])addWallArch(m,{
    axis:'x',plane:-11.5,inside:1,along,spring:3.05,radius:1.20,depth:.10,section:.065,mat:MAT.stone,
  });
  for(const along of[-8.9,-6.15,1,3.7,6.4,9.1])addWallArch(m,{
    axis:'z',plane:-11,inside:1,along,spring:3.08,radius:1.03,depth:.10,section:.065,mat:MAT.plaster,
  });
  // Only the public promenade part of the east wall receives blind arches.
  for(const along of[.25,3.0,5.75])addWallArch(m,{
    axis:'z',plane:11,inside:-1,along,spring:3.08,radius:1.03,depth:.10,section:.065,mat:MAT.stone,
  });
}
{
  // Ordinary civic furniture fixed to the walls: radiators, registers, a
  // municipal clock, honour boards and coat hooks. One non-blocking mesh keeps
  // all of it tight to the perimeter, leaving the ruined garden and every
  // public route under floorplan authority.
  const m=mesh('atrium_public_fittings');
  const radiatorX=(x,z)=>{
    addBox(m,[x,.48,z],[2.15,.78,.11],MAT.steel);
    for(let fin=-.92;fin<=.92;fin+=.23)addBox(m,[x+fin,.49,z-.065],[.095,.84,.055],MAT.agedWhite);
    addBox(m,[x-1.04,.10,z],[.07,.20,.16],MAT.brass);addBox(m,[x+1.04,.10,z],[.07,.20,.16],MAT.brass);
  };
  radiatorX(-2.6,-11.02);radiatorX(2.6,-11.02);radiatorX(-7.3,11.02);radiatorX(6.4,11.02);
  // North-wall municipal clock, with a proper deep oak back and brass hands.
  addBox(m,[7.8,3.12,-11.04],[1.38,1.38,.10],MAT.dark);
  addBox(m,[7.8,3.12,-11.105],[1.14,1.14,.035],MAT.ivory);
  addBeam(m,[7.8,3.12,-11.14],[7.8,3.50,-11.14],.026,MAT.black);
  addBeam(m,[7.8,3.12,-11.14],[8.12,2.96,-11.14],.026,MAT.black);
  // East-wall honours boards occupy the formerly blank public promenade.
  for(const z of[.2,3.05,5.9]){
    addBox(m,[10.96,2.02,z],[.10,1.72,2.05],MAT.dark);
    addBox(m,[10.89,2.02,z],[.035,1.48,1.80],MAT.wood);
    for(let yy=1.48;yy<=2.52;yy+=.26)addBox(m,[10.865,yy,z],[.018,.025,1.48],MAT.brass);
  }
  // Brass coat hooks and a low umbrella rail beside, but clear of, the public
  // entrance pair. These never claim navigation cells.
  addBox(m,[-10.94,1.58,-7.2],[.08,.14,2.35],MAT.dark);
  for(let z=-8.15;z<=-6.25;z+=.38){
    addBeam(m,[-10.88,1.58,z],[-10.68,1.48,z],.025,MAT.brass);
  }
  addBox(m,[-10.75,.34,-7.2],[.32,.08,2.0],MAT.brass);
  for(const z of[-8.05,-7.5,-6.9,-6.35])addBox(m,[-10.75,.42,z],[.26,.76,.05],MAT.steel);
}
{
  // A sealed public entrance has to read at room scale, before it can offer an
  // interaction. The origin is half a metre inside the door plane: the bands
  // and chain sit back on z=0 while the worn mat projects into the atrium.
  const m=mesh('atrium_entry_closure');
  addBox(m,[0,.025,.55],[2.35,.05,1.10],MAT.cloth);
  addBox(m,[0,.052,.55],[2.08,.018,.82],MAT.terracotta);
  for(const x of[-.88,-.44,0,.44,.88])addBox(m,[x,.066,.55],[.035,.016,.70],MAT.agedWhite);
  // Crossed closure bands behind the chain, broad enough to survive the 1-bit
  // presentation without pretending to be another brass route plaque.
  addBeam(m,[-.94,.76,.035],[.94,1.55,.035],.105,MAT.paper);
  addBeam(m,[-.94,1.53,.042],[.94,.78,.042],.090,MAT.terracotta);
  // One sagging chain across both meeting stiles. Alternating links exaggerate
  // the silhouette just enough to remain legible from the garden.
  addBeam(m,[-1.00,1.17,.10],[1.00,1.00,.10],.045,MAT.steel);
  for(let i=0;i<13;i++){
    const t=i/12,x=-.96+t*1.92,y=1.16-t*.15;
    addBox(m,[x,y,.135],[.12,.065,.035],i%2?MAT.brass:MAT.steel,i%2?-.45:.45);
  }
  addBox(m,[0,1.00,.18],[.26,.30,.12],MAT.brass);
  addBeam(m,[-.09,1.15,.18],[-.09,1.31,.18],.045,MAT.steel);
  addBeam(m,[-.09,1.31,.18],[.09,1.31,.18],.045,MAT.steel);
  addBeam(m,[.09,1.31,.18],[.09,1.15,.18],.045,MAT.steel);
}
{
  // A municipal honour banner after decades of damp: intact at the rail,
  // separated into unequal tails at the bottom. It is deliberately large and
  // silent—the atrium needs a vertical order, not another inspection target.
  const m=mesh('atrium_formal_banner');
  addBox(m,[0,3.82,.025],[2.05,.12,.12],MAT.brass);
  addBox(m,[0,2.45,.055],[1.82,2.62,.07],MAT.pubGreen);
  addBox(m,[0,3.34,.095],[1.58,.16,.025],MAT.agedWhite);
  addBox(m,[0,2.54,.095],[.18,1.34,.025],MAT.terracotta);
  const tails=[[-.68,.86,1.55],[-.23,.70,1.23],[.22,.82,1.46],[.66,.58,1.05]];
  for(const [x,y,h] of tails)addBox(m,[x,y,.055],[.38,h,.07],Math.abs(x)<.3?MAT.terracotta:MAT.pubGreen,(x*.08));
  addBox(m,[0,3.93,.025],[2.20,.10,.16],MAT.dark);
}
{
  // Two instances of this fitting occupy the old garden's enormous middle
  // register. The chain reaches the 17m roof; the dead opal cage stops at 5.5m,
  // safely above the player and below the academic crown sight line.
  const m=mesh('atrium_suspended_lantern');
  addBox(m,[0,16.63,0],[.70,.16,.70],MAT.brass);
  addBeam(m,[0,16.55,0],[0,6.45,0],.045,MAT.steel);
  for(let y=7.0;y<16.3;y+=.72)addBox(m,[0,y,0],[.13,.20,.055],y%1.44<.4?MAT.brass:MAT.steel,.55);
  addCylinder(m,[0,6.25,0],.17,.30,MAT.brass,12);
  for(const [x,z] of[[-.55,-.55],[-.55,.55],[.55,-.55],[.55,.55]]){
    addBeam(m,[0,6.22,0],[x,5.92,z],.055,MAT.brass);
    addBeam(m,[x,5.92,z],[x,4.98,z],.045,MAT.steel);
  }
  addBox(m,[0,5.48,0],[1.12,.82,1.12],MAT.ivory);
  addBox(m,[0,5.92,0],[1.48,.10,1.48],MAT.brass);
  addBox(m,[0,5.04,0],[1.48,.10,1.48],MAT.brass);
  for(const [x,z] of[[-.69,-.69],[-.69,.69],[.69,-.69],[.69,.69]])addBeam(m,[x,5.02,z],[x,5.94,z],.055,MAT.brass);
  // One opaque replacement pane, one missing pane: repair and neglect in the
  // same object, readable as asymmetry rather than additional surface noise.
  addBox(m,[0,5.48,-.59],[1.04,.70,.035],MAT.agedWhite);
  addBox(m,[.59,5.48,0],[.035,.70,1.04],MAT.dark);
}
{
  const m=mesh('atrium_waiting_rug');
  addBox(m,[0,.018,0],[3.80,.036,4.50],MAT.cloth);
  addBox(m,[0,.039,0],[3.48,.012,4.18],MAT.terracotta);
  addBox(m,[0,.047,0],[3.10,.010,3.80],MAT.dark);
  for(const z of[-1.72,1.72])addBox(m,[0,.055,z],[2.92,.012,.08],MAT.agedWhite);
  for(const x of[-1.28,1.28])addBox(m,[x,.055,0],[.08,.012,3.36],MAT.agedWhite);
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
{
  const m=mesh('tower_rope');
  addCylinder(m,[0,1.7,0],.025,3.4,MAT.paper,10);
  // Wool sallies are striped, bulky grips, not a second plain rope.
  for(let i=0;i<7;i++)addCylinder(m,[0,.31+i*.095,0],.078,.095,i%2?MAT.brass:MAT.ivory,12);
}
{
  const m=mesh('tower_rope_tenor');
  addCylinder(m,[0,1.62,0],.028,3.24,MAT.paper,10);
  // Lower covering position, with an amber/cream identity repeated at
  // first-person scale even when the rest of the ring is moving.
  for(let i=0;i<8;i++)addCylinder(m,[0,.20+i*.095,0],.086,.095,i%2?MAT.ivory:MAT.brass,12);
}
// Runtime-articulated ringing rope. These remain four ordinary static meshes in
// the pack; the bell runtime supplies their matrices so the renderer does not
// need glTF animation or skin support.
{const m=mesh('tower_rope_upper');addCylinder(m,[0,2.20,0],.025,2.30,MAT.paper,10);}
{const m=mesh('tower_rope_sally');addCylinder(m,[0,.92,0],.078,.70,MAT.paper,12);addCylinder(m,[0,.92,0],.030,.78,MAT.dark,10);}
{const m=mesh('tower_rope_sally_tenor');for(let i=0;i<8;i++)addCylinder(m,[0,.58+i*.095,0],.086,.095,i%2?MAT.ivory:MAT.brass,12);addCylinder(m,[0,.91,0],.030,.84,MAT.dark,10);}
{const m=mesh('tower_rope_tail');addCylinder(m,[0,.43,0],.027,.86,MAT.paper,10);}
{const m=mesh('tower_rope_tail_tenor');addCylinder(m,[0,.39,0],.030,.78,MAT.paper,10);}
{const m=mesh('tower_rope_guide');addCylinder(m,[0,3.34,0],.095,.07,MAT.dark,14);addCylinder(m,[0,3.30,0],.028,.16,MAT.paper,10);}
{const m=mesh('tower_dust_mote');addBox(m,[0,0,0],[.032,.010,.032],MAT.agedWhite);}
{const m=mesh('tower_rope_mat');addCylinder(m,[0,.025,0],.52,.05,MAT.cloth,24);addCylinder(m,[0,.055,0],.19,.018,MAT.dark,18);}
{
  const m=mesh('tower_rope_mat_tenor');
  addCylinder(m,[0,.025,0],.64,.05,MAT.cloth,28);
  addCylinder(m,[0,.057,-.17],.15,.018,MAT.ivory,20);addCylinder(m,[0,.069,-.17],.092,.020,MAT.dark,20);
  addCylinder(m,[0,.057,.10],.15,.018,MAT.ivory,20);addCylinder(m,[0,.069,.10],.092,.020,MAT.dark,20);
  addBox(m,[.25,.067,-.035],[.035,.018,.36],MAT.ivory,.62); // slash after 8
  // TENOR, stencilled across the foot of the mat.
  const stroke=(x,z,w,d,yaw=0)=>addBox(m,[x,.069,z],[w,.020,d],MAT.ivory,yaw),z=.37;
  stroke(-.36,z,.035,.25);stroke(-.36,z-.11,.16,.035);
  stroke(-.18,z,.035,.25);stroke(-.12,z-.11,.13,.035);stroke(-.12,z,.13,.035);stroke(-.12,z+.11,.13,.035);
  stroke(.00,z,.035,.25);stroke(.14,z,.035,.25);stroke(.07,z,.035,.30,.48);
  stroke(.26,z,.035,.25);stroke(.36,z,.035,.25);stroke(.31,z-.11,.12,.035);stroke(.31,z+.11,.12,.035);
  stroke(.48,z,.035,.25);stroke(.57,z-.11,.14,.035);stroke(.57,z,.14,.035);stroke(.57,z-.03,.18,.035,.60);
}
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
{
  // THE HUSH replays a prior operator as deliberately low-detail acoustic
  // evidence: readable at distance, faceless at every angle, and unrelated to
  // the stair anomaly's practical-light occluder.
  const m=mesh('player_shadow_figure');
  addCylinder(m,[0,1.58,0],.16,.30,MAT.dark,12);
  addBox(m,[0,1.02,0],[.52,.84,.24],MAT.dark);
  addBox(m,[-.18,.43,0],[.14,.86,.17],MAT.dark,.035);
  addBox(m,[.18,.43,0],[.14,.86,.17],MAT.dark,-.035);
  addBox(m,[-.34,1.02,0],[.12,.76,.15],MAT.dark,.08);
  addBox(m,[.34,1.02,0],[.12,.76,.15],MAT.dark,-.08);
}
// APPARITION POSES. Additive by design: `player_shadow_figure` above is shared
// by the HUSH/player-shadow path and remains byte-for-byte authored as before.
// These seven bodies use the same foot pivot and ordinary adult envelope; what
// changes is their social posture and the contour they project across a wall.
{
  const m=mesh('apparition_pose_neutral');
  addCylinder(m,[0,1.58,0],.16,.30,MAT.dark,12);
  addBox(m,[0,1.03,0],[.52,.82,.25],MAT.dark);
  addBeam(m,[-.13,.66,0],[-.18,.03,0],.14,MAT.dark);
  addBeam(m,[.13,.66,0],[.18,.03,0],.14,MAT.dark);
  addBeam(m,[-.27,1.32,0],[-.31,.65,.01],.12,MAT.dark);
  addBeam(m,[.27,1.32,0],[.31,.65,-.01],.12,MAT.dark);
}
{
  const m=mesh('apparition_pose_side');
  addCylinder(m,[.015,1.58,.025],.155,.30,MAT.dark,12);
  addBox(m,[0,1.03,0],[.34,.82,.32],MAT.dark,.05);
  addBeam(m,[-.08,.66,.02],[-.11,.03,.04],.13,MAT.dark);
  addBeam(m,[.09,.66,-.02],[.13,.03,-.05],.13,MAT.dark);
  addBeam(m,[-.17,1.31,.02],[-.19,.66,.12],.11,MAT.dark);
  addBeam(m,[.17,1.31,-.02],[.19,.69,-.12],.11,MAT.dark);
}
{
  const m=mesh('apparition_pose_stoop');
  addCylinder(m,[0,1.55,-.16],.16,.29,MAT.dark,12);
  addBox(m,[0,1.04,-.07],[.54,.82,.27],MAT.dark,0,.20);
  addBeam(m,[-.14,.68,-.01],[-.23,.03,.04],.14,MAT.dark);
  addBeam(m,[.14,.68,-.01],[.22,.03,-.02],.14,MAT.dark);
  addBeam(m,[-.27,1.30,-.11],[-.36,.64,.02],.12,MAT.dark);
  addBeam(m,[.27,1.30,-.11],[.36,.64,-.02],.12,MAT.dark);
}
{
  const m=mesh('apparition_pose_head_turn');
  addBox(m,[.07,1.58,-.01],[.27,.29,.23],MAT.dark,.42);
  addBox(m,[0,1.03,0],[.52,.82,.25],MAT.dark);
  addBeam(m,[.02,1.43,0],[.06,1.48,-.01],.12,MAT.dark);
  addBeam(m,[-.13,.66,0],[-.19,.03,.01],.14,MAT.dark);
  addBeam(m,[.13,.66,0],[.19,.03,-.01],.14,MAT.dark);
  addBeam(m,[-.27,1.32,0],[-.34,.66,.03],.12,MAT.dark);
  addBeam(m,[.27,1.32,0],[.30,.67,-.04],.12,MAT.dark);
}
{
  const m=mesh('apparition_pose_arm_out');
  addCylinder(m,[0,1.58,0],.16,.30,MAT.dark,12);
  addBox(m,[0,1.03,0],[.52,.82,.25],MAT.dark);
  addBeam(m,[-.13,.66,0],[-.19,.03,.01],.14,MAT.dark);
  addBeam(m,[.13,.66,0],[.19,.03,-.01],.14,MAT.dark);
  addBeam(m,[-.27,1.31,0],[-.35,.66,.03],.12,MAT.dark);
  addBeam(m,[.26,1.31,0],[.58,1.12,-.03],.12,MAT.dark);
  addBeam(m,[.58,1.12,-.03],[.72,.87,-.02],.105,MAT.dark);
}
{
  const m=mesh('apparition_pose_weight_shift');
  addCylinder(m,[.02,1.58,0],.16,.30,MAT.dark,12);
  addBox(m,[.055,1.04,0],[.52,.82,.25],MAT.dark,-.10);
  addBeam(m,[-.08,.67,.01],[-.27,.03,.03],.14,MAT.dark);
  addBeam(m,[.19,.67,-.01],[.27,.03,-.05],.14,MAT.dark);
  addBeam(m,[-.22,1.31,.01],[-.39,.72,.04],.12,MAT.dark);
  addBeam(m,[.31,1.32,-.01],[.25,.66,-.04],.12,MAT.dark);
}
{
  const m=mesh('apparition_pose_symmetric');
  addCylinder(m,[0,1.58,0],.16,.30,MAT.dark,12);
  addBox(m,[0,1.03,0],[.50,.82,.24],MAT.dark);
  addBeam(m,[-.11,.66,0],[-.11,.03,0],.14,MAT.dark);
  addBeam(m,[.11,.66,0],[.11,.03,0],.14,MAT.dark);
  addBeam(m,[-.255,1.31,0],[-.255,.65,0],.115,MAT.dark);
  addBeam(m,[.255,1.31,0],[.255,.65,0],.115,MAT.dark);
}
{
  const m=mesh('legacy_tape_rack');
  addBox(m,[0,1.04,0],[1.08,2.08,.42],MAT.steel);
  addBox(m,[0,1.04,.225],[.94,1.92,.035],MAT.dark);
  for(let shelf=0;shelf<7;shelf++){
    const y=.20+shelf*.275;
    addBox(m,[0,y,.255],[.95,.035,.48],MAT.steel);
    for(let tape=0;tape<5;tape++){
      const x=-.39+tape*.195;
      addBox(m,[x,y+.12,.29],[.155,.215,.09],tape===(shelf+2)%5?MAT.paper:MAT.black);
      addBox(m,[x,y+.12,.342],[.085,.045,.018],MAT.paper);
    }
  }
  addBox(m,[0,1.94,.26],[.72,.08,.05],MAT.paper);
}
{
  const m=mesh('legacy_patchbay');
  addBox(m,[0,.87,0],[1.28,1.74,.36],MAT.steel);
  addBox(m,[0,.94,.205],[1.12,1.40,.035],MAT.black);
  for(let row=0;row<8;row++)for(let jack=0;jack<12;jack++){
    const x=-.49+jack*.089,y=.36+row*.145;
    addBox(m,[x,y,.232],[.035,.035,.025],(row===1&&jack<4)||row===6?MAT.vfd:MAT.brass);
  }
  addBox(m,[0,1.61,.225],[.94,.065,.035],MAT.vfd);
  addBox(m,[0,.12,.225],[.86,.06,.035],MAT.paper);
}
{
  const m=mesh('legacy_transfer_deck');
  addBox(m,[0,.46,0],[1.48,.92,.78],MAT.steel);
  addBox(m,[0,.92,-.02],[1.38,.10,.70],MAT.black);
  addCylinder(m,[-.38,1.01,-.05],.24,.075,MAT.steel,20);
  addCylinder(m,[.38,1.01,-.05],.24,.075,MAT.steel,20);
  addCylinder(m,[-.38,1.06,-.05],.075,.035,MAT.brass,14);
  addCylinder(m,[.38,1.06,-.05],.075,.035,MAT.brass,14);
  addBox(m,[0,.70,.405],[.62,.18,.035],MAT.vfd);
  for(let i=0;i<7;i++)addBox(m,[-.50+i*.16,.48,.41],[.07,.07,.035],i===0?MAT.safetyRed:MAT.brass);
  addBox(m,[.46,.70,.41],[.20,.18,.035],MAT.paper);
  addBox(m,[0,1.15,-.20],[.94,.18,.24],MAT.black);
  addBox(m,[0,1.15,-.065],[.76,.10,.028],MAT.vfd);
}
{const m=mesh('chapel_inner_screen');for(const x of[-2.8,-1.4,0,1.4,2.8])addBox(m,[x,1.8,0],[.16,3.6,.18],MAT.wood);for(const y of[.15,1.8,3.45])addBox(m,[0,y,0],[6,.15,.18],MAT.wood);}
{
  const m=mesh('chapel_screen_signal');
  addBox(m,[0,1.78,-.13],[.055,3.18,.045],MAT.warmWindow);
  for(const x of[-1.40,1.40])addBox(m,[x,1.78,-.14],[.13,.46,.045],MAT.brass);
}
{
  const m=mesh('tower_exit_indicator');
  addBox(m,[0,.24,.02],[1.65,.48,.08],MAT.dark);
  addBox(m,[0,.24,-.035],[1.48,.34,.035],MAT.vfd);
  addBox(m,[-.22,.24,-.065],[.56,.075,.035],MAT.ivory,-.52);
  addBox(m,[.22,.24,-.065],[.56,.075,.035],MAT.ivory,.52);
}
{
  // Like every wall fixture, the origin is the wall plane and +Z faces the
  // reader. This keeps plaques and exit markers from being embedded backwards.
  const m=mesh('tower_plaque');
  addBox(m,[0,.38,.03],[1.35,.76,.06],MAT.brass);
  addBox(m,[0,.38,.067],[1.18,.59,.025],MAT.dark);
}
{
  // A public-entrance enamel sign is deliberately not the tower's brass plate.
  // Reusing tower_plaque in the atrium made a closure notice look like a route
  // marker for a stair which is nowhere near this threshold.
  const m=mesh('public_exit_sign');
  addBox(m,[0,.31,.03],[2.30,.62,.06],MAT.pubGreen);
  addBox(m,[0,.31,.068],[2.12,.46,.025],MAT.ivory);
  addBox(m,[0,.31,.086],[1.84,.26,.018],MAT.pubGreen);
  for(const x of[-.82,-.41,0,.41,.82])addBox(m,[x,.31,.102],[.055,.13,.012],MAT.ivory);
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

{
  // THE LOADING BAY CANOPY.
  //
  // What you see when you stand on the apron and look up. The authored cell
  // ceiling is one flat plane at 5.5m and has to stay one flat plane — a stepped
  // per-cell ceiling becomes a visible header in the DDA and a lowered rectangle
  // becomes a room inside the room (see natatoriumProfile). So the structure is
  // a mesh hung just under that plane: four portal frames across the bay, purlins
  // over them, a corrugated deck, and the fascia and shutter gear at the ends.
  //
  // Local X runs along the bay (mouth at -3.5, building at +3.5); local Z runs
  // across it. Origin sits on the apron.
  const m=mesh('bay_canopy');
  const z0=-3.6,z1=3.6,soffit=5.34;
  for(const x of[-3.1,-1.05,1.0,3.05]){
    // Rafter with a shallow fall toward the mouth, so rain leaves the building.
    addPlateBeamXY(m,[x,soffit-.10,z0],[x,soffit-.10,z1],.18,MAT.steel);
    // Haunches where a portal frame meets its stanchion.
    addBeam(m,[x,soffit-.16,z0],[x,soffit-.62,z0+.55],.13,MAT.steel);
    addBeam(m,[x,soffit-.16,z1],[x,soffit-.62,z1-.55],.13,MAT.steel);
    addBox(m,[x,soffit-1.55,z0+.08],[.22,2.6,.24],MAT.steel);
    addBox(m,[x,soffit-1.55,z1-.08],[.22,2.6,.24],MAT.steel);
  }
  for(const z of[-3.0,-1.5,0,1.5,3.0]) addBeam(m,[-3.5,soffit+.04,z],[3.5,soffit+.04,z],.11,MAT.steel);
  // THE SHEETING ONLY SURVIVES OVER THE DOORS.
  //
  // This deck used to run the full -3.5..3.5, which was right when the apron
  // had an authored ceiling at 5.5m: it was cladding a plane that was solid
  // anyway. The apron is open to the sky now (see F.WALLED and the 'D' glyph),
  // and a full deck would simply be the ceiling again, three inches lower —
  // nothing gained, and the moon still hidden behind corrugated steel.
  //
  // So the sheeting is kept where a bay actually needs it, over the door
  // opening, and the rest is left as bare frames and purlins. You see cloud
  // through the steel, which is the whole point of opening it, and a canopy
  // that has lost most of its sheeting is entirely in character for this
  // building. DECK_FROM is the mouth-side edge of what is left.
  const DECK_FROM=1.55;
  for(let z=z0;z<z1-.01;z+=.36){
    addQuad(m,[DECK_FROM,soffit+.13,z],[3.5,soffit+.13,z],[3.5,soffit+.16,z+.18],[DECK_FROM,soffit+.16,z+.18],MAT.agedWhite);
    addQuad(m,[DECK_FROM,soffit+.16,z+.18],[3.5,soffit+.16,z+.18],[3.5,soffit+.13,z+.36],[DECK_FROM,soffit+.13,z+.36],MAT.agedWhite);
  }
  // The cut edge of the sheeting, so it reads as ending rather than as missing.
  addBox(m,[DECK_FROM,soffit+.145,0],[.08,.09,7.2],MAT.steel);
  // Fascia and gutter at the mouth: the edge you read the canopy by, against
  // the sky, from anywhere in the yard.
  addBox(m,[-3.52,soffit-.30,0],[.16,.62,7.4],MAT.agedWhite);
  addBox(m,[-3.66,soffit-.62,0],[.24,.20,7.4],MAT.steel);
  addCylinder(m,[-3.66,soffit-1.9,3.42],.075,2.4,MAT.steel,8);   // downpipe
  addCylinder(m,[-3.66,soffit-3.5,3.42],.075,1.0,MAT.steel,8);
  // Roller shutter, run up and left up: the box and its guides over the door.
  addBox(m,[3.34,soffit-.95,0],[.46,.52,4.3],MAT.steel);
  for(const z of[-2.1,2.1]) addBox(m,[3.34,soffit-2.6,z],[.20,2.8,.16],MAT.steel);
  // A dead lamp on the soffit, and the live one beside it.
  for(const x of[-1.9,1.9]) addBox(m,[x,soffit-.30,0],[.52,.16,.20],MAT.agedWhite);
}
// ── THE ORDINARY CITY AROUND ELLERY ─────────────────────────────────────────
//
// A row is built in eight-metre deeds rather than as one extruded wall.  Every
// deed gets its own cornice, roof, door, drainpipe and window rhythm, which is
// the scale language the old forty-six-metre goods frontage was missing.
function buildDistrictFrontage(name,variant){
  const m=mesh(name),unitW=8,count=8;
  const heights=variant==='civic'
    ?[12.8,12.8,14.6,14.6,11.8,13.2,13.2,11.6]
    :variant==='workshop'
      ?[7.2,7.2,8.6,11.2,11.2,7.8,8.4,10.4]
      :[11.2,11.2,12.4,12.4,10.8,10.8,13.0,13.0];
  for(let i=0;i<count;i++){
    const z=-32+unitW*(i+.5),h=heights[i],depth=variant==='workshop'?6.8:5.4;
    if(variant==='passage'&&i===4){
      // A real court mouth through the row: party walls, a shallow bridge and
      // open floor below. The floorplan continues behind it, so this can never
      // become a false entrance the player crosses through visible masonry.
      addBox(m,[-depth/2,7.6,z],[depth,2.2,unitW-.18],MAT.brickRed);
      addBox(m,[.08,6.48,z],[.20,.30,unitW],MAT.stone);
      addBox(m,[-depth+.08,3.2,z-unitW/2+.08],[.18,6.4,.22],MAT.stone);
      addBox(m,[-depth+.08,3.2,z+unitW/2-.08],[.18,6.4,.22],MAT.stone);
      addBox(m,[.22,5.95,z],[.18,.22,.78],MAT.warmWindow);
      continue;
    }
    const brick=variant==='civic'&&i<2?MAT.brickDark:(i%3===1?MAT.terracotta:MAT.brickRed);
    addBox(m,[-depth/2,h/2,z],[depth,h,unitW-.16],brick);
    addBox(m,[.06,.55,z],[.16,1.10,unitW-.18],MAT.stone);                 // plinth
    addBox(m,[.08,h-.55,z],[.20,.24,unitW-.08],MAT.stone);               // cornice
    // The corner pub is ordinary, open and warm. It is not another threat.
    if(variant==='civic'&&i<2){
      addBox(m,[.13,2.1,z],[.18,2.45,unitW-1.0],MAT.pubGreen);
      for(const dz of[-2.35,0,2.35])addBox(m,[.25,2.15,z+dz],[.08,1.55,1.35],MAT.warmWindow);
      addBox(m,[.26,3.65,z],[.09,.46,unitW-1.1],MAT.ivory);
    }else if(variant==='workshop'&&h<9){
      addBox(m,[.14,2.0,z],[.22,3.25,4.8],MAT.steel);
      for(let y=.55;y<3.45;y+=.28)addBox(m,[.27,y,z],[.08,.08,4.6],MAT.black);
      addBox(m,[.18,5.0,z],[.12,1.18,2.0],i%2?MAT.black:MAT.warmWindow);
    }else{
      // One real front door and two sash bays per deed. Upper lights are sparse;
      // occupancy reads as lives behind glass, not as a lit texture atlas.
      const floors=Math.max(2,Math.floor((h-1.5)/3.1));
      addBox(m,[.16,1.45,z-2.75],[.22,2.65,1.05],i%2?MAT.pubGreen:MAT.agedWhite);
      addBox(m,[.27,1.5,z-2.75],[.08,.20,.20],MAT.brass);
      for(let floor=0;floor<floors;floor++)for(const dz of[-.75,2.15]){
        const y=2.05+floor*3.05,lit=((i*5+floor*3+(dz>0?1:0))%7)<2;
        addBox(m,[.14,y,z+dz],[.18,1.55,1.25],lit?MAT.warmWindow:MAT.black);
        addBox(m,[.25,y,z+dz],[.08,.08,1.34],MAT.agedWhite);
        addBox(m,[.25,y,z+dz],[.08,1.64,.08],MAT.agedWhite);
        addBox(m,[.18,y+.91,z+dz],[.28,.16,1.52],MAT.stone);
      }
    }
    // Slate pitches make one inhabited roofscape rather than a row of boxes.
    const rise=variant==='workshop'&&h<9?1.1:2.0;
    addQuad(m,[0,h,z-unitW/2],[-depth/2,h+rise,z-unitW/2],[-depth/2,h+rise,z+unitW/2],[0,h,z+unitW/2],MAT.slate);
    addQuad(m,[-depth,h,z+unitW/2],[-depth/2,h+rise,z+unitW/2],[-depth/2,h+rise,z-unitW/2],[-depth,h,z-unitW/2],MAT.slate);
    if(i%2===0){
      addBox(m,[-depth*.58,h+rise+.75,z+2.25],[.85,1.5,1.15],MAT.brickDark);
      for(const dz of[-.28,.28])addCylinder(m,[-depth*.58,h+rise+1.7,z+2.25+dz],.11,.42,MAT.stone,8);
    }
    // Working rainwater goods are the small repeated scale cue at street level.
    addCylinder(m,[.20,h/2,z+unitW/2-.25],.065,h-.35,MAT.steel,8);
  }
  // Road-supply columns are part of the inhabited side, not Ellery's rig.
  for(const z of[-25,-9,9,25]){
    addCylinder(m,[1.75,3.0,z],.08,5.8,MAT.steel,8);
    addBeam(m,[1.75,5.8,z],[2.5,6.25,z],.08,MAT.steel);
    addBox(m,[2.75,6.25,z],[.65,.18,.28],MAT.warmWindow);
  }
}
buildDistrictFrontage('district_terrace_frontage','terrace');
buildDistrictFrontage('district_civic_frontage','civic');
buildDistrictFrontage('district_workshop_frontage','workshop');
buildDistrictFrontage('district_passage_frontage','passage');

{
  // Side walls and a closed occupied threshold for a short street court. Local
  // +Z runs away from its mouth; one instance can be rotated onto every side of
  // the block. The floor remains open floorplan space throughout.
  const m=mesh('district_court_walls'),length=16,half=4.45;
  for(const side of[-1,1]){
    const mat=side<0?MAT.brickRed:MAT.brickDark,h=side<0?9.2:7.8;
    addBox(m,[side*(half+.18),h/2,length/2],[.36,h,length],mat);
    addBox(m,[side*half,.48,length/2],[.16,.96,length],MAT.stone);
    for(let z=2.5;z<length-1;z+=4.2){
      addBox(m,[side*half,1.48,z],[.18,2.55,1.15],z>10?MAT.agedWhite:MAT.black);
      addBox(m,[side*half,5.10,z],[.18,1.40,1.22],z<7?MAT.warmWindow:MAT.black);
      addBox(m,[side*half,5.92,z],[.20,.17,1.48],MAT.stone);
    }
    addCylinder(m,[side*half,h/2,length-.25],.07,h-.3,MAT.steel,8);
  }
  addBox(m,[0,4.0,length+.18],[8.9,8.0,.36],MAT.glazedBrick);
  for(const x of[-2.8,0,2.8]){
    addBox(m,[x,1.9,length-.02],[2.2,3.25,.18],MAT.steel);
    for(let y=.55;y<3.25;y+=.32)addBox(m,[x,y,length-.13],[1.95,.07,.08],MAT.black);
  }
  addBox(m,[0,7.55,length-.04],[8.6,.28,.18],MAT.stone);
}

{
  // THE TOWN BEYOND THE WALKABLE BLOCK. The collision plan ends at occupied
  // thresholds; the rendered city does not. Three staggered rings of ordinary
  // roofs, cross-streets and yards keep every outward look travelling through
  // a district before it reaches the procedural skyline.
  const m=mesh('district_outer_sprawl');
  const X=(worldX)=>worldX+7,Z=(worldZ)=>worldZ+7; // instance anchor is (-7,-7)
  const palette=[MAT.brickRed,MAT.terracotta,MAT.brickDark,MAT.concrete,MAT.glazedBrick];
  const park={x0:-73,x1:-35,z0:-70,z1:-36};
  function townBuilding({x,z,w,d,h,axis='x',inward=1,index=0}){
    if(x+w/2>park.x0&&x-w/2<park.x1&&z+d/2>park.z0&&z-d/2<park.z1)return;
    const mat=palette[index%palette.length];
    addBox(m,[X(x),h/2,Z(z)],[w,h,d],mat);
    addBox(m,[X(x),.48,Z(z)],[w+.08,.96,d+.08],MAT.stone);
    addBox(m,[X(x),h-.38,Z(z)],[w+.16,.24,d+.16],MAT.stone);
    const rise=1.3+(index%3)*.32;
    if(axis==='x'){
      addPitchedRoof(m,{x:X(x),z:Z(z),w,d,eaves:h,rise,mat:MAT.slate,gableMat:mat,ridge:'x'});
      const floors=Math.max(2,Math.floor((h-1.2)/3));
      for(const side of[-1,1]){
        const face=z+side*(d/2+.06);
        for(let wx=x-w/2+1.5;wx<x+w/2-1;wx+=2.8)for(let floor=0;floor<floors;floor++){
          const lit=((Math.round(wx)+floor*3+index+(side>0?2:0))%13)===0;
          const y=2.1+floor*2.8;
          addBox(m,[X(wx),y,Z(face)],[1.05,1.35,.12],lit?MAT.warmWindow:MAT.black);
          addBox(m,[X(wx),y+.77,Z(face+side*.04)],[1.30,.13,.16],MAT.stone);
        }
        addBox(m,[X(x-w*.28),1.42,Z(face+side*.03)],[1.02,2.55,.15],MAT.agedWhite);
        addCylinder(m,[X(x+w/2-.22),h/2,Z(face+side*.08)],.065,h-.3,MAT.steel,8);
      }
      for(const side of[-1,1]){
        const face=x+side*(w/2+.06);
        addBox(m,[X(face),4.65,Z(z)],[.12,1.45,1.12],MAT.black);
        addBox(m,[X(face+side*.04),5.48,Z(z)],[.16,.14,1.40],MAT.stone);
      }
    }else{
      addPitchedRoof(m,{x:X(x),z:Z(z),w,d,eaves:h,rise,mat:MAT.slate,gableMat:mat,ridge:'z'});
      const floors=Math.max(2,Math.floor((h-1.2)/3));
      for(const side of[-1,1]){
        const face=x+side*(w/2+.06);
        for(let wz=z-d/2+1.5;wz<z+d/2-1;wz+=2.8)for(let floor=0;floor<floors;floor++){
          const lit=((Math.round(wz)+floor*5+index+(side>0?3:0))%14)===0;
          const y=2.1+floor*2.8;
          addBox(m,[X(face),y,Z(wz)],[.12,1.35,1.05],lit?MAT.warmWindow:MAT.black);
          addBox(m,[X(face+side*.04),y+.77,Z(wz)],[.16,.13,1.30],MAT.stone);
        }
        addBox(m,[X(face+side*.03),1.42,Z(z-d*.28)],[.15,2.55,1.02],MAT.agedWhite);
        addCylinder(m,[X(face+side*.08),h/2,Z(z+d/2-.22)],.065,h-.3,MAT.steel,8);
      }
      for(const side of[-1,1]){
        const face=z+side*(d/2+.06);
        addBox(m,[X(x),4.65,Z(face)],[1.12,1.45,.12],MAT.black);
        addBox(m,[X(x),5.48,Z(face+side*.04)],[1.40,.14,.16],MAT.stone);
      }
    }
    if(index%3===0)addBox(m,[X(x+w*.22),h+rise+.85,Z(z-d*.18)],[.85,1.7,1.05],MAT.brickDark);
  }
  function rowX(z,from,to,inward,seed){
    let x=from,i=0;
    while(x<to){
      const w=7+((i+seed)%4)*1.35,gap=1.0+((i+seed)%3)*.55;
      townBuilding({x:x+w/2,z,w,d:9+((i+seed)%3)*1.4,h:8.4+((i*5+seed)%6)*1.05,axis:'x',inward,index:i+seed});
      x+=w+gap;i++;
    }
  }
  function rowZ(x,from,to,inward,seed){
    let z=from,i=0;
    while(z<to){
      const d=7+((i+seed)%4)*1.3,gap=1.0+((i+seed)%3)*.5;
      townBuilding({x,z:z+d/2,w:9+((i+seed)%3)*1.3,d,h:8.1+((i*3+seed)%6)*1.0,axis:'z',inward,index:i+seed});
      z+=d+gap;i++;
    }
  }
  // Gaps between the rows are real cross-streets in silhouette, not continuous
  // facade bands. Staggering them also keeps repeated roof peaks from lining up.
  for(const [z,seed] of[[-31,2],[-52,5],[-76,8]])rowX(z,-82,218,1,seed);
  for(const [z,seed] of[[124,11],[148,14],[173,17]])rowX(z,-82,218,-1,seed);
  for(const [x,seed] of[[-31,4],[-55,7],[-79,10]])rowZ(x,-18,116,1,seed);
  for(const [x,seed] of[[162,13],[188,16],[214,19]])rowZ(x,-18,116,-1,seed);

  // A small municipal park breaks the north-west roof field: iron edge, mature
  // wet trees, a path cross and one low keeper's pavilion. It is scenery beyond
  // the playable pavement, but it reads clearly through the corner and mews.
  for(let x=park.x0;x<=park.x1;x+=3.2){
    addBox(m,[X(x),.42,Z(park.z0)],[.06,.84,.06],MAT.steel);
    addBox(m,[X(x),.42,Z(park.z1)],[.06,.84,.06],MAT.steel);
  }
  for(let z=park.z0;z<=park.z1;z+=3.2){
    addBox(m,[X(park.x0),.42,Z(z)],[.06,.84,.06],MAT.steel);
    addBox(m,[X(park.x1),.42,Z(z)],[.06,.84,.06],MAT.steel);
  }
  for(const z of[park.z0,park.z1])addBox(m,[X((park.x0+park.x1)/2),.78,Z(z)],[park.x1-park.x0,.07,.07],MAT.steel);
  for(const x of[park.x0,park.x1])addBox(m,[X(x),.78,Z((park.z0+park.z1)/2)],[.07,.07,park.z1-park.z0],MAT.steel);
  addBox(m,[X(-54),.035,Z(-53)],[36,.07,2.2],MAT.stone);
  addBox(m,[X(-54),.04,Z(-53)],[2.2,.08,30],MAT.stone);
  for(let i=0;i<18;i++){
    const x=park.x0+4+((i*11)%31),z=park.z0+4+((i*17)%27),h=4.8+(i%4)*.7;
    addCylinder(m,[X(x),h/2,Z(z)],.17,h,MAT.wood,8);
    for(const [dx,dy,dz] of[[-.7,0,0],[.7,.2,0],[0,.45,-.6],[0,.15,.65]])
      addCylinder(m,[X(x+dx),h+dy,Z(z+dz)],.75+(i%3)*.12,1.45,MAT.deadLeaf,9);
  }
  addBox(m,[X(-42),2.3,Z(-62)],[7.5,4.6,5.5],MAT.brickRed);
  addBox(m,[X(-42),4.95,Z(-62)],[8.2,.7,6.2],MAT.slate);
  addBox(m,[X(-42),2.0,Z(-59.2)],[1.5,2.7,.16],MAT.pubGreen);
}

function buildYardRange(name,range,kind){
  const m=mesh(name),w=range.w,d=range.d,h=range.height,service=kind==='stores';
  addBox(m,[0,h/2,0],[w,h,d],service?MAT.steel:(kind==='baths'?MAT.glazedBrick:MAT.brickRed));
  for(const side of[-1,1]){
    addBox(m,[0,.55,side*(d/2+.03)],[w+.1,1.1,.14],MAT.stone);
    addBox(m,[0,h-.48,side*(d/2+.05)],[w+.2,.26,.16],MAT.stone);
  }
  // A real door every six metres; no elevation is permitted to become a blank
  // industrial plane at eye height.
  for(let x=-w/2+2.1;x<w/2-1;x+=4.2){
    addBox(m,[x,1.55,-d/2-.10],[1.25,2.75,.18],MAT.agedWhite);
    if(service){
      addBox(m,[x,2.05,d/2+.11],[2.65,3.45,.18],MAT.steel);
      for(let y=.62;y<3.55;y+=.34)addBox(m,[x,y,d/2+.23],[2.42,.07,.08],MAT.black);
      addBox(m,[x,5.05,d/2+.12],[1.42,1.05,.18],MAT.black);
      addBox(m,[x,5.67,d/2+.15],[1.68,.16,.22],MAT.stone);
    }else{
      addBox(m,[x,4.75,-d/2-.11],[1.35,1.55,.18],kind==='baths'?MAT.roofGlass:MAT.black);
      addBox(m,[x,5.62,-d/2-.13],[1.58,.16,.22],MAT.stone);
      addBox(m,[x,4.75,d/2+.11],[1.35,1.55,.18],kind==='baths'?MAT.roofGlass:MAT.black);
      addBox(m,[x,5.62,d/2+.13],[1.58,.16,.22],MAT.stone);
    }
  }
  for(const side of[-1,1]){
    const face=side*(w/2+.10);
    addBox(m,[face,4.45,0],[.18,1.55,1.35],service?MAT.steel:MAT.black);
    addBox(m,[face+side*.03,5.34,0],[.22,.17,1.62],MAT.stone);
    addCylinder(m,[face+side*.08,h/2,d/2-.30],.075,h-.3,MAT.steel,8);
  }
  const rise=service?.65:1.75;
  addPitchedRoof(m,{x:0,z:0,w,d,eaves:h,rise,mat:service?MAT.steel:MAT.slate,gableMat:service?MAT.steel:(kind==='baths'?MAT.glazedBrick:MAT.brickRed),ridge:'z'});
  for(const x of[-w/2+.35,w/2-.35]){
    addCylinder(m,[x,h/2,-d/2-.17],.075,h-.3,MAT.steel,8);
    addBox(m,[x,.13,-d/2-.42],[.18,.12,.62],MAT.steel);                  // drain shoe
  }
  if(kind==='baths')for(const x of[-w*.25,w*.25]){
    addRoofLantern(m,{x,z:0,w:2.2,d:d*.55,y:h+rise-.12,rise:.48});       // repaired lanterns
  }
}
const rangeById=Object.fromEntries(YARD_SERVICE_RANGES.map((range)=>[range.id,range]));
buildYardRange('yard_stable_range',rangeById['yard-former-stables'],'stable');
buildYardRange('yard_rehearsal_range',rangeById['yard-rehearsal-annex'],'rehearsal');
buildYardRange('yard_baths_plant',rangeById['yard-baths-plant'],'baths');
buildYardRange('yard_covered_stores',rangeById['yard-covered-stores'],'stores');
// ── ST BRENDAN'S ────────────────────────────────────────────────────────────
//
// The church on the tarmac past the park. Built from the SAME manifest the
// floorplan lays its rooms from (data/st-brendans.js), for exactly the reason
// that file exists: an elevation modelled against a remembered plan drifts off
// it the first time a transept moves.
//
// IT IS A SKIN, NOT A SOLID. The church stands at x<50, so isExteriorObserver
// calls you exterior even standing in the nave and this mesh is never culled —
// while physicalRenderPlanFor keys off the ZONE and still gives you real
// raymarched walls inside. Both occupy the same cells. So the mesh dresses only
// the outer CHURCH_SKIN of each one-metre wall cell: from the yard you see this,
// from the nave you see the rock, and the mesh sits buried inside that rock
// where nothing can ever look at it. No coincident surfaces, by construction.
//
// Windows are recessed panels rather than voids, because addBox cannot subtract
// — the same way buildYardRange does its openings.
function buildStBrendans(){
  const m=mesh('st_brendan_church');
  const cx=(CHURCH_BOUNDS.x0+CHURCH_BOUNDS.x1)/2, cz=(CHURCH_BOUNDS.y0+CHURCH_BOUNDS.y1)/2;
  const X=(x)=>x-cx, Z=(y)=>y-cz;
  const S=CHURCH_SKIN, PLINTH=0.95;
  const FACES=[[0,-1],[0,1],[-1,0],[1,0]];

  // Rubble wall skins, all derived from the same cells collision uses. Thin dark
  // repairs and water courses break the material without pretending to cut
  // openings through the collision wall.
  const exposed=[];
  for(let y=CHURCH_BOUNDS.y0;y<=CHURCH_BOUNDS.y1;y++){
    for(let x=CHURCH_BOUNDS.x0;x<=CHURCH_BOUNDS.x1;x++){
      if(!churchWallAt(x,y))continue;
      const h=churchWallHeight(x,y);
      for(const [dx,dy] of FACES){
        if(!churchWallExposed(x,y,dx,dy))continue;
        exposed.push({x,y,dx,dy,h});
        const px=X(x+0.5)+dx*(0.5-S/2), pz=Z(y+0.5)+dy*(0.5-S/2);
        addBox(m,[px,h/2,pz],[dx?S:1,h,dy?S:1],MAT.stone);
        // A plinth, proud of the wall. Stone churches sit on one, and it is most
        // of what stops an elevation reading as a flat panel at eye height.
        addBox(m,[px+dx*0.10,PLINTH/2,pz+dy*0.10],[dx?S+.2:1.02,PLINTH,dy?S+.2:1.02],MAT.stone);
        addBox(m,[px+dx*0.06,h-0.34,pz+dy*0.06],[dx?S+.12:1.02,.30,dy?S+.12:1.02],MAT.stone);
        if((x*17+y*11+dx*5+dy*7)%9===0)addBox(m,
          [px+dx*.075,1.42,pz+dy*.075],[dx?.08:.72,.34,dy?.08:.72],MAT.brickDark);
      }
    }
  }

  // Manifest-authored stepped buttresses. Their runtime colliders come from the
  // same records, so these projections are never decorative noclip geometry.
  for(const b of CHURCH_BUTTRESSES){
    addBox(m,[X(b.x),b.h*.42,Z(b.y)],[b.w,b.h*.84,b.d],MAT.stone);
    addBox(m,[X(b.x),b.h*.84+.09,Z(b.y)],[b.w+.14,.18,b.d+.14],MAT.stone);
    addBox(m,[X(b.x),b.h*.93,Z(b.y)],[b.w*.72,b.h*.18,b.d*.72],MAT.stone);
  }

  // Restrained lancets and Y-tracery sit in the exposed bays. Recessed dark
  // glass is backed by real wall; this generator is additive, not boolean.
  for(const f of exposed){
    if(f.h<5.7)continue;
    const along=f.dx?f.y:f.x;
    const px=X(f.x+0.5)+f.dx*0.5, pz=Z(f.y+0.5)+f.dy*0.5;
    if(along%3===1){
      const sill=2.65, head=Math.min(f.h-.85,6.75), tall=Math.max(.9,head-sill);
      addBox(m,[px+f.dx*.055,sill+tall/2,pz+f.dy*.055],[f.dx?.10:.46,tall,f.dy?.10:.46],MAT.black);
      addWallArch(m,{axis:f.dx?'z':'x',plane:f.dx?px:pz,inside:f.dx?f.dx:f.dy,
        along:f.dx?pz:px,spring:head-.42,radius:.28,depth:.08,section:.07,mat:MAT.stone,segments:7});
      addBox(m,[px+f.dx*.09,sill-.13,pz+f.dy*.09],[f.dx?.18:.68,.18,f.dy?.18:.68],MAT.stone);
      if(f.h>8)addBeam(m,[px+f.dx*.11,head-.12,pz+f.dy*.11],[px+f.dx*.11,head+.62,pz+f.dy*.11],.055,MAT.stone);
    }
  }

  const rooms=Object.fromEntries(CHURCH.rooms.map((room)=>[room.id,room]));
  const roof=(r,eaves,rise,ridge,pad=.8)=>addPitchedRoof(m,{
    x:X((r.x0+r.x1)/2+0.5),z:Z((r.y0+r.y1)/2+0.5),
    w:(r.x1-r.x0)+pad,d:(r.y1-r.y0)+pad,
    eaves,rise,mat:MAT.slate,gableMat:MAT.stone,ridge,overhang:.24,
  });
  roof(rooms.nave,CHURCH_HEIGHTS.nave,2.65,'z',1.0);
  roof(rooms.north_aisle,CHURCH_HEIGHTS.aisle,1.45,'z',1.0);
  roof(rooms.south_aisle,CHURCH_HEIGHTS.aisle,1.45,'z',1.0);
  roof({x0:9,y0:71,x1:23,y1:75},CHURCH_HEIGHTS.nave,2.25,'x',1.0);
  roof(rooms.choir,CHURCH_HEIGHTS.choir,2.35,'z',1.0);
  roof(rooms.side_chapel,CHURCH_HEIGHTS.aisle,1.35,'z',.8);
  roof(rooms.sacristy,CHURCH_HEIGHTS.ancillary,1.15,'z',.8);

  // Central crossing tower: square, weighty, louvred, then a modest broached
  // slate spire. No west-work and no crenellations.
  const tx=X(16),tz=Z(73),tW=7.0,tD=5.8,TH=CHURCH_HEIGHTS.belfry;
  for(const [dx,dy] of FACES){
    const fx=tx+dx*(tW/2), fz=tz+dy*(tD/2);
    addBox(m,[fx,11.25,fz],[dx?.46:tW,TH-8.2,dy?.46:tD],MAT.stone);
    for(let i=-2;i<=2;i++){
      const along=i*.48;
      addBox(m,[fx+dx*.25+(dy?along:0),12.05,fz+dy*.25+(dx?along:0)],
        [dx?.12:.28,2.1,dy?.12:.28],MAT.black,dx?0:.18);
    }
    addBox(m,[fx+dx*.12,13.42,fz+dy*.12],[dx?.24:tW+.18,.25,dy?.24:tD+.18],MAT.stone);
  }
  const spireY=13.85,halfX=3.18,halfZ=2.58,apex=[tx,CHURCH_HEIGHTS.spire,tz];
  for(const [a,b] of[
    [[tx-halfX,spireY,tz-halfZ],[tx+halfX,spireY,tz-halfZ]],
    [[tx+halfX,spireY,tz-halfZ],[tx+halfX,spireY,tz+halfZ]],
    [[tx+halfX,spireY,tz+halfZ],[tx-halfX,spireY,tz+halfZ]],
    [[tx-halfX,spireY,tz+halfZ],[tx-halfX,spireY,tz-halfZ]],
  ]){addTriangle(m,a,b,apex,MAT.slate);addTriangle(m,apex,b,a,MAT.slate);}
  addCylinder(m,[tx,17.18,tz],.055,.34,MAT.steel,8);

  // West portal and south-transept porch, both recessed behind ashlar orders.
  const westX=X(16.5),westZ=Z(55.35);
  addBox(m,[westX,1.42,westZ-.18],[1.85,2.84,.28],MAT.dark);
  for(const s of[-1,1])addBox(m,[westX+s*1.15,1.55,westZ-.20],[.34,3.10,.38],MAT.stone);
  addWallArch(m,{axis:'x',plane:westZ-.18,inside:-1,along:westX,spring:2.62,radius:1.12,depth:.12,section:.18,mat:MAT.stone,segments:11});
  const porchX=X(24.55),porchZ=Z(73.5);
  addBox(m,[porchX,2.35,porchZ-1.25],[1.45,4.7,.42],MAT.stone);
  addBox(m,[porchX,2.35,porchZ+1.25],[1.45,4.7,.42],MAT.stone);
  addPitchedRoof(m,{x:porchX,z:porchZ,w:1.7,d:3.2,eaves:4.7,rise:1.25,mat:MAT.slate,gableMat:MAT.stone,ridge:'x',overhang:.18});

  // Triple lancets in the square-ended east wall and a repaired west gable.
  for(const x of[-1.15,0,1.15]){
    addBox(m,[X(16.5)+x,4.5,Z(85.45)+.06],[.58,3.55,.12],MAT.black);
    addWallArch(m,{axis:'x',plane:Z(85.45)+.08,inside:1,along:X(16.5)+x,spring:6.08,radius:.30,depth:.06,section:.07,mat:MAT.stone,segments:7});
  }

  // Interior arcades and clustered crossing piers. The openings remain clear;
  // these are structure around circulation, not a second collision wall.
  for(const x of[12.1,20.9])for(const y of[60.5,63.7,66.9,70.1]){
    addCylinder(m,[X(x),3.25,Z(y)],.34,6.5,MAT.stone,12);
    for(const dx of[-.28,.28])addCylinder(m,[X(x)+dx,3.0,Z(y)],.12,5.8,MAT.stone,10);
  }
  for(const [x,y] of[[12.15,71.15],[19.85,71.15],[12.15,74.85],[19.85,74.85]]){
    addCylinder(m,[X(x),4.9,Z(y)],.46,9.8,MAT.stone,12);
    for(let a=0;a<4;a++)addCylinder(m,[X(x)+Math.cos(a*Math.PI/2)*.38,4.2,Z(y)+Math.sin(a*Math.PI/2)*.38],.13,8.4,MAT.stone,8);
  }
  for(const x of[12.1,20.9])for(const y of[62.1,65.3,68.5]){
    addWallArch(m,{axis:'z',plane:X(x),inside:x<16?1:-1,along:Z(y),spring:4.5,radius:1.45,depth:.11,section:.18,mat:MAT.stone,segments:10});
  }

  // Dark St Davids-like panelled timber ceiling: transverse principals, a
  // central ridge and simple pendants. A roof can be stone outside and timber
  // from below without asking the raymarcher to fake a vault.
  for(const y of[60.0,63.2,66.4,69.6,76.8,79.8,82.8]){
    addBeam(m,[X(12.0),8.72,Z(y)],[X(21.0),8.72,Z(y)],.16,MAT.dark);
    addCylinder(m,[X(16.5),8.25,Z(y)],.12,.78,MAT.dark,10);
    addCylinder(m,[X(16.5),7.82,Z(y)],.19,.18,MAT.dark,10);
  }
  addBeam(m,[X(16.5),9.02,Z(58.8)],[X(16.5),9.02,Z(84.1)],.13,MAT.dark);

  // Walks and rails at 4.6m, then the belfry deck and six-bell timber frame.
  addBox(m,[X(16),4.55,Z(59.2)],[7.0,.18,4.4],MAT.dark);
  for(const x of[10.5,21.5])addBox(m,[X(x),4.55,Z(67)],[1.55,.18,16.0],MAT.dark);
  addBox(m,[X(16),4.55,Z(73)],[11.0,.18,4.2],MAT.dark);
  for(const x of[10,22])addBox(m,[X(x),5.05,Z(67)],[.16,1.0,16.0],MAT.dark);
  addBox(m,[X(16),10.14,Z(73)],[6.6,.16,4.2],MAT.dark);
  for(const x of[14,16,18]){
    for(const z of[71.2,74.8])addBox(m,[X(x),11.8,Z(z)],[.24,3.2,.24],MAT.dark);
    addBeam(m,[X(x),13.1,Z(71.2)],[X(x),13.1,Z(74.8)],.18,MAT.dark);
  }
  let bell=0;
  for(const x of[14,16,18])for(const y of[72,74]){
    bell+=1;
    addCylinder(m,[X(x),11.55,Z(y)],.38,.52,MAT.brass,14);
    addCylinder(m,[X(x),11.22,Z(y)],.48,.20,MAT.brass,14);
    addCylinder(m,[X(x),12.03,Z(y)],.08,.52,MAT.steel,8);
  }
  for(let i=0;i<18;i++)addBox(m,[X(13.3+(i%6)*.56),10.27,Z(71.3+Math.floor(i/6)*1.25)],[.08,.04,.14],i%4?MAT.deadLeaf:MAT.ivory,i*.31);

  // Stair turrets read outside as round ashlar drums. The actual climb is the
  // floorplan's authored helical tread field, not these skins.
  for(const [x,y,h] of[[10.5,64.5,6.2],[21.5,79.5,6.2],[10.5,73.5,11.0],[21.5,73.5,11.0]]){
    addCylinder(m,[X(x),h/2,Z(y)],1.52,h,MAT.stone,16);
    addCylinder(m,[X(x),h-.35,Z(y)],1.62,.32,MAT.stone,16);
  }
}
buildStBrendans();

// Cathedral furniture with silhouettes the general chapel pack does not own.
{
  const m=mesh('cathedral_font');
  addCylinder(m,[0,.13,0],.42,.26,MAT.stone,8);
  addCylinder(m,[0,.58,0],.22,.72,MAT.stone,8);
  addCylinder(m,[0,1.00,0],.50,.28,MAT.stone,8);
  addCylinder(m,[0,1.09,0],.34,.12,MAT.black,8);
}
{
  const m=mesh('cathedral_pulpitum');
  for(const x of[-3.35,-2.65,-1.95,1.95,2.65,3.35])addCylinder(m,[x,1.28,0],.16,2.56,MAT.stone,10);
  addBox(m,[-2.65,.26,0],[2.55,.52,.52],MAT.stone);
  addBox(m,[2.65,.26,0],[2.55,.52,.52],MAT.stone);
  addBox(m,[-2.65,2.48,0],[2.75,.24,.58],MAT.stone);
  addBox(m,[2.65,2.48,0],[2.75,.24,.58],MAT.stone);
  for(const x of[-2.95,-2.35,2.35,2.95])addWallArch(m,{axis:'x',plane:-.30,inside:-1,along:x,spring:1.68,radius:.28,depth:.08,section:.08,mat:MAT.stone,segments:7});
}
{
  const m=mesh('cathedral_tomb');
  addBox(m,[0,.34,0],[2.1,.68,.85],MAT.stone);
  addBox(m,[0,.76,0],[2.0,.16,.78],MAT.stone);
  addEllipsoid(m,[0,.90,0],[.72,.15,.25],MAT.stone,8,14);
}
{
  const m=mesh('cathedral_monument');
  addBox(m,[0,1.18,0],[1.25,2.36,.30],MAT.stone);
  addBox(m,[0,.22,-.12],[1.42,.24,.42],MAT.stone);
  addWallArch(m,{axis:'x',plane:-.20,inside:-1,along:0,spring:1.70,radius:.46,depth:.06,section:.08,mat:MAT.brickDark,segments:9});
  addBox(m,[0,1.02,-.20],[.62,.78,.05],MAT.brickDark);
}


{
  const m=mesh('exterior_story_plaque');
  addBox(m,[0,.42,0],[1.35,.84,.28],MAT.stone);
  addBox(m,[0,.48,-.16],[1.08,.50,.05],MAT.terracotta);
  for(let y=.30;y<=.62;y+=.16)addBox(m,[0,y,-.20],[.78,.035,.025],MAT.ivory);
}
{
  const m=mesh('district_post_box');
  addCylinder(m,[0,.64,0],.34,1.12,MAT.safetyRed,14);
  addCylinder(m,[0,1.24,0],.36,.18,MAT.safetyRed,14);
  addBox(m,[0,1.28,0],[.55,.16,.55],MAT.safetyRed);
  addBox(m,[0,1.05,-.35],[.42,.11,.05],MAT.black);
  addBox(m,[0,.78,-.36],[.32,.25,.04],MAT.ivory);
}
{
  const m=mesh('district_bench');
  for(const x of[-.85,.85]){
    addBox(m,[x,.42,0],[.10,.82,.48],MAT.steel);
    addBox(m,[x,.73,.18],[.10,.72,.08],MAT.steel,0,-.13);
  }
  for(const z of[-.18,0,.18])addBox(m,[0,.62,z],[2.0,.09,.12],MAT.wood);
  for(let y=.82;y<1.24;y+=.16)addBox(m,[0,y,.23],[2.0,.09,.10],MAT.wood);
}
{
  const m=mesh('district_bin_cluster');
  for(const [x,z,mat] of[[-.42,0,MAT.dark],[.42,.12,MAT.pubGreen]]){
    addBox(m,[x,.52,z],[.66,1.0,.66],mat);
    addBox(m,[x,1.04,z-.04],[.72,.09,.72],MAT.black,0,-.08);
    for(const dx of[-.23,.23])addCylinder(m,[x+dx,.10,z+.30],.08,.16,MAT.black,8);
  }
}
{
  const m=mesh('district_bollard_pair');
  for(const x of[-1.25,1.25]){
    addCylinder(m,[x,.48,0],.11,.96,MAT.steel,10);
    addCylinder(m,[x,.88,0],.15,.16,MAT.steel,10);
    addBox(m,[x,.62,-.12],[.20,.20,.04],MAT.agedWhite);
  }
}
{
  const m=mesh('ambient_late_bus');
  addBox(m,[0,1.28,0],[2.45,2.55,9.2],MAT.safetyRed);
  addBox(m,[0,2.43,0],[2.34,.18,9.0],MAT.agedWhite);
  for(const x of[-1.24,1.24])for(const z of[-2.8,2.8]){
    addCylinderX(m,[x,.43,z],.42,.22,MAT.black,14);
    addCylinderX(m,[x+(x<0?-.025:.025),.43,z],.19,.025,MAT.steel,12);
  }
  for(const z of[-3.25,-1.55,.15,1.85,3.55])for(const x of[-1.235,1.235])addBox(m,[x,1.95,z],[.08,.82,1.22],MAT.warmWindow);
  addBox(m,[0,1.9,-4.61],[1.95,.86,.08],MAT.warmWindow);
  addBox(m,[0,2.36,-4.69],[1.42,.22,.055],MAT.warmWindow);           // route blind
  addBox(m,[0,.63,-4.69],[1.72,.16,.055],MAT.steel);                 // bumper
  for(const x of[-.75,.75])addBox(m,[x,.88,-4.72],[.38,.20,.07],MAT.warmWindow);
  for(const x of[-.88,.88])addBox(m,[x,.78,4.62],[.28,.20,.07],MAT.safetyRed);
  for(const x of[-1.38,1.38])addBox(m,[x,1.72,-4.34],[.14,.28,.32],MAT.black,.18*Math.sign(x));
}
{
  const m=mesh('ambient_cyclist');
  for(const z of[-.58,.58])addCylinder(m,[0,.52,z],.36,.08,MAT.black,12);
  addBeam(m,[0,.52,-.58],[0,1.02,0],.055,MAT.steel);addBeam(m,[0,1.02,0],[0,.52,.58],.055,MAT.steel);addBeam(m,[0,.52,-.58],[0,.52,.58],.055,MAT.steel);
  addCylinder(m,[0,1.52,-.02],.16,.28,MAT.dark,10);addBeam(m,[0,1.36,0],[0,.88,.05],.20,MAT.cloth);
}
{
  const m=mesh('ambient_dog_walker');
  addCylinder(m,[-.32,1.55,0],.15,.28,MAT.dark,10);addBox(m,[-.32,.92,0],[.42,1.05,.32],MAT.cloth);
  for(const x of[-.47,-.17])addCylinder(m,[x,.32,0],.07,.64,MAT.dark,8);
  addBox(m,[.45,.42,.12],[.70,.38,.32],MAT.dark);addBox(m,[.79,.52,.08],[.25,.28,.25],MAT.dark);
  addBeam(m,[-.15,.92,.02],[.68,.62,.08],.025,MAT.steel);
}
{
  const m=mesh('ambient_awning_figure');
  addCylinder(m,[0,1.55,0],.15,.28,MAT.dark,10);addBox(m,[0,.88,0],[.46,1.08,.34],MAT.cloth);
  for(const x of[-.14,.14])addCylinder(m,[x,.30,0],.065,.60,MAT.dark,8);
}

function buildExteriorLocal(name,{
  skin=MAT.skinWarm,coat=MAT.navy,trouser=MAT.dark,hair=MAT.dark,
  height=1.74,stance=.16,hat='none',bag=false,highVis=false,scarf=null,
}={}){
  const m=mesh(name),headY=height-.17,shoulderY=height-.48,hipY=.80;
  // Weight-bearing legs are not parallel pegs: knees settle inward and the
  // rain posture puts one foot half a step forward.
  addBeam(m,[-stance,.07,-.055],[-stance*.62,hipY,0],.115,trouser);
  addBeam(m,[ stance,.07, .055],[ stance*.62,hipY,0],.115,trouser);
  for(const [x,z]of[[-stance,-.075],[stance,.09]])addBox(m,[x,.055,z-.035],[.24,.11,.40],MAT.black);
  // Coat, lapels and collar create a front/back read at conversational range.
  addBox(m,[0,(hipY+shoulderY)/2,.015],[.50,shoulderY-hipY+.18,.31],coat);
  addBox(m,[0,hipY+.02,.03],[.42,.20,.30],coat);
  addBox(m,[-.105,shoulderY-.14,-.165],[.17,.42,.035],coat,0,-.10);
  addBox(m,[ .105,shoulderY-.14,-.165],[.17,.42,.035],coat,0,.10);
  addCylinder(m,[0,headY-.20,0],.065,.15,skin,12);
  // Arms finish in visible hands rather than disappearing into the torso.
  addBeam(m,[-.25,shoulderY-.02,0],[-.29,hipY+.10,-.10],.105,coat);
  addBeam(m,[ .25,shoulderY-.02,0],[ .22,hipY+.13,-.14],.105,coat);
  addEllipsoid(m,[-.29,hipY+.08,-.11],[.07,.09,.055],skin,6,10);
  addEllipsoid(m,[ .22,hipY+.11,-.15],[.07,.09,.055],skin,6,10);
  // A face: cranium, ears, nose, eyes, brows and mouth all stand proud of local
  // -Z, the direction the placed person faces. These marks survive the pixel
  // mesh because none is thinner than roughly two centimetres.
  addEllipsoid(m,[0,headY,0],[.145,.185,.125],skin,10,16);
  for(const x of[-.15,.15])addEllipsoid(m,[x,headY-.005,0],[.025,.052,.026],skin,5,8);
  addEllipsoid(m,[0,headY-.015,-.132],[.032,.052,.035],skin,6,10);
  for(const x of[-.052,.052]){
    addEllipsoid(m,[x,headY+.035,-.121],[.017,.013,.010],MAT.black,5,8);
    addBox(m,[x,headY+.070,-.120],[.060,.016,.012],hair,x<0?-.07:.07);
  }
  addBox(m,[0,headY-.073,-.126],[.072,.014,.012],MAT.terracotta);
  addBox(m,[0,headY+.13,.035],[.27,.10,.19],hair,0,-.12);
  addBox(m,[0,headY+.035,.105],[.25,.20,.08],hair);
  if(hat==='wool'){
    addEllipsoid(m,[0,headY+.145,.01],[.165,.105,.145],MAT.mustard,7,14);
    addBox(m,[0,headY+.09,-.02],[.34,.055,.29],MAT.mustard);
  }else if(hat==='cap'){
    addBox(m,[0,headY+.145,.005],[.31,.105,.25],MAT.dark,0,-.08);
    addBox(m,[0,headY+.105,-.17],[.24,.035,.20],MAT.dark,0,-.10);
  }
  if(scarf!==null){
    addBox(m,[0,headY-.245,-.035],[.30,.13,.25],scarf);
    addBox(m,[.10,shoulderY-.22,-.18],[.105,.46,.055],scarf,0,-.08);
  }
  if(bag){
    addBox(m,[.36,.68,.05],[.34,.52,.20],MAT.wood);
    addBeam(m,[.20,shoulderY+.02,.02],[.42,.92,.04],.035,MAT.dark);
  }
  if(highVis){
    addBox(m,[0,shoulderY-.10,-.172],[.48,.095,.025],MAT.agedWhite);
    addBox(m,[0,hipY+.12,-.172],[.46,.075,.025],MAT.agedWhite);
    addBox(m,[0,shoulderY+.07,-.176],[.065,.60,.025],MAT.agedWhite);
  }
}

buildExteriorLocal('exterior_bus_woman',{
  skin:MAT.skinDeep,coat:MAT.navy,trouser:MAT.denim,hair:MAT.black,height:1.70,hat:'wool',bag:true,scarf:MAT.mustard,
});
buildExteriorLocal('exterior_mews_neighbor',{
  skin:MAT.skinWarm,coat:MAT.pubGreen,trouser:MAT.dark,hair:MAT.dark,height:1.78,hat:'cap',scarf:MAT.terracotta,
});
buildExteriorLocal('exterior_pub_driver',{
  skin:MAT.skinWarm,coat:MAT.terracotta,trouser:MAT.denim,hair:MAT.dark,height:1.80,highVis:true,
});

{
  // THE BUILDING, FROM THE YARD.
  //
  // Everything above the bay mouth. Without it the ray leaving the apron meets
  // the conservatory's own mass as undrawn cells, and undrawn cells beside a sky
  // cell are drawn to the 90m ceiling r3d gives sky — a black slab straight up.
  // The mesh stands just in front of that and gives it a building instead.
  //
  // Local X is depth into the wall (thin); local Z runs along the elevation.
  // The bay mouth is the gap from z -4.0 to +3.6, which every horizontal course
  // has to step around.
  // IT USED TO BE FORTY-SIX METRES OF ONE HEIGHT.
  //
  // zB was 34, which covered the yard as it stood when this was written — and the
  // yard was seventy-four metres deep in a ninety-three metre slice, so past the
  // end of this mesh the building went back to being undrawn rock drawn to 90m.
  // The yard runs the full depth now (YARD_H in floorplan/conservatory.js) and so
  // does this.
  //
  // THE BANDS ARE THE CONTRACT. The floorplan and this mesh consume the same
  // ELLERY_MASSING manifest. Local z is worldY - 7.5 (the prop's anchor), so
  // changes to the institutional history cannot leave a different black wall
  // behind the authored elevation.
  const m=mesh('conservatory_west_elevation');
  const zA=-7.5,zB=84.5,mouthA=-4.0,mouthB=3.6;
  const plinth=0.95;
  const BANDS=ELLERY_MASSING.map((band)=>({
    ...band,z0:band.y0-7.5,z1:band.y1-7.5,parapet:band.height,
    kind:band.id==='hall'?'flytower':band.id,
  }));
  const phaseMaterial=(kind)=>({
    service:MAT.steel,academic:MAT.concrete,flytower:MAT.brickDark,
    school:MAT.brickRed,baths:MAT.glazedBrick,
  }[kind]??MAT.brickRed);
  // A run of wall between z=a and z=b, up to `parapet`. Courses go in at floor
  // height and stop under the eaves, so a taller band simply gets more of them —
  // which is what actually distinguishes a fly tower from a store range.
  function elevationRun(a,b,parapet,kind){
    if(b-a<=0.01) return;
    const eaves=parapet-1.20, mid=(a+b)/2, len=b-a;
    const wallMat=phaseMaterial(kind);
    addBox(m,[.34,plinth/2,mid],[.68,plinth,len],MAT.stone);              // plinth
    const courses=[];
    for(let y=5.90;y<eaves-1.6;y+=3.65) courses.push(y);
    let from=plinth;
    for(const y of courses){
      addBox(m,[.20,(from+y)/2,mid],[.40,y-from,len],wallMat);             // phase fabric
      addBox(m,[.30,y+.14,mid],[.60,.28,len],MAT.stone);                  // string course
      from=y+.28;
    }
    addBox(m,[.20,(from+eaves)/2,mid],[.40,eaves-from,len],wallMat);
    addBox(m,[.36,(eaves+parapet)/2,mid],[.72,parapet-eaves,len],MAT.stone);
    addBox(m,[.46,parapet+.11,mid],[.92,.22,len],MAT.stone);              // coping
    return courses;
  }
  for(const band of BANDS){
    if(band.kind==='flytower'){
      // The stage tower is the only genuinely large volume, and it is set back
      // eight metres behind a shorter backstage range. Narrow it at both ends
      // so its silhouette is a theatre tower rising among roofs, not the middle
      // of a ninety-metre factory extrusion.
      const towerLen=(band.z1-band.z0)-6.0,mid=(band.z0+band.z1)/2;
      const towerDepth=7.0,towerFace=band.setback||13.0,towerX=towerFace+towerDepth/2;
      addBox(m,[towerX,band.parapet/2,mid],[towerDepth,band.parapet,towerLen],MAT.brickDark);
      addBox(m,[towerFace-.08,.50,mid],[.20,.95,towerLen+.12],MAT.stone);
      addBox(m,[towerFace-.10,band.parapet-.68,mid],[.24,.48,towerLen+.20],MAT.stone);
      for(let z=mid-towerLen/2+3;z<mid+towerLen/2-2;z+=6){
        for(let i=0;i<5;i++)addBox(m,[towerFace-.22,band.parapet-3.0+i*.27,z],[.16,.13,2.0],MAT.steel);
      }
      for(const z of[mid-towerLen/2+.3,mid+towerLen/2-.3])addBox(m,[towerFace-.25,band.parapet/2,z],[.55,band.parapet-.5,.55],MAT.stone);
      // Tall blind stage walls still need a human module. Vent bays, bond
      // strips and a stepped head make this a fly tower, not a warehouse cube.
      for(const z of[mid-4.5,mid,mid+4.5]){
        addBox(m,[towerFace-.24,8.3,z],[.18,4.4,2.25],MAT.brickDark);
        for(let i=0;i<7;i++)addBox(m,[towerFace-.36,8.3-1.65+i*.55,z],[.12,.18,1.72],MAT.steel);
        addBox(m,[towerFace-.32,10.72,z],[.24,.24,2.62],MAT.stone);
      }
      addBox(m,[towerX,band.parapet+.18,mid],[towerDepth+.45,.28,towerLen+.5],MAT.stone);
      continue;
    }
    // The mouth is a hole in the bay band and nowhere else.
    const runs=(band.z0<mouthB&&band.z1>mouthA)
      ? [[band.z0,mouthA],[mouthB,band.z1]]
      : [[band.z0,band.z1]];
    for(const [a,b] of runs) elevationRun(a,b,band.parapet,band.kind);

    const eaves=band.parapet-1.20;
    // Pilaster strips every three metres, skipping the mouth. They are what stop
    // ninety metres of brick reading as one extruded box at a grazing angle.
    for(let z=band.z0+1.5;z<=band.z1-1.5;z+=3.0){
      if(z>mouthA-.9&&z<mouthB+.9)continue;
      addBox(m,[.52,(plinth+eaves)/2,z],[.30,eaves-plinth,.62],phaseMaterial(band.kind));
      addBox(m,[.60,eaves+.30,z],[.42,.46,.78],MAT.stone);                // corbel
    }
    // Round-headed civic windows on the older ranges and squarer ones above.
    // Recessed, so they read as holes rather than as panels.
    for(let z=band.z0+3.0;z<=band.z1-3.0;z+=6.0){
      if(z>mouthA-1.5&&z<mouthB+1.5)continue;
      if(band.parapet>8.8){
        addBox(m,[-.10,7.35,z],[.42,1.90,1.30],MAT.black);
        if(band.kind==='school'||band.kind==='baths')
          addWallArch(m,{axis:'z',plane:0,inside:-1,along:z,spring:8.30,radius:.68,depth:.16,section:.13,mat:MAT.stone,segments:8});
        else addBox(m,[.16,8.34,z],[.52,.20,1.52],MAT.stone);
      }
      if(eaves>12.8){
        addBox(m,[-.06,11.30,z],[.34,1.55,1.05],MAT.black);
        addBox(m,[.16,12.16,z],[.52,.20,1.35],MAT.stone);                 // lintel
      }
      if(eaves>16.4){
        addBox(m,[-.06,14.95,z],[.34,1.55,1.05],MAT.black);
        addBox(m,[.16,15.81,z],[.52,.20,1.35],MAT.stone);
      }
    }
  }

  // The 1936 fly tower is withdrawn behind a low backstage range. From the
  // pavement and the gate its base is never allowed to meet the street as a
  // blank factory wall; roofs and doors cross the foreground first.
  {
    const hall=ELLERY_MASSING.find((band)=>band.id==='hall');
    const mid=(hall.y0+hall.y1)/2-7.5,len=hall.y1-hall.y0;
    const gate=2.4,wingLen=(len-gate)/2;
    for(const side of[-1,1]){
      const wingZ=mid+side*(gate/2+wingLen/2);
      addBox(m,[-4.0,hall.foreground/2,wingZ],[7.4,hall.foreground,wingLen],MAT.brickRed);
      addPitchedRoof(m,{x:-4,z:wingZ,w:7.4,d:wingLen,eaves:hall.foreground,rise:1.45,mat:MAT.slate,gableMat:MAT.brickRed,ridge:'z'});
      addBox(m,[-7.78,hall.foreground-.34,wingZ],[.22,.26,wingLen+.10],MAT.stone);
    }
    for(let z=hall.y0-7.5+2.5;z<hall.y1-7.5-1;z+=5.2){
      if(Math.abs(z-mid)<gate*.72)continue;
      addBox(m,[-7.74,1.65,z],[.18,2.85,1.42],MAT.agedWhite);
      addBox(m,[-7.78,5.7,z],[.12,1.45,1.24],MAT.black);
      addBox(m,[-7.82,6.53,z],[.20,.18,1.52],MAT.stone);
    }
    // A locked iron throat keeps the break in the range honest: it reads as a
    // former carriage passage, not as an accidental hole in the asset.
    for(const dz of[-gate/2,gate/2])addBox(m,[-7.72,2.15,mid+dz],[.22,4.3,.16],MAT.stone);
    for(let z=mid-gate/2+.22;z<mid+gate/2;z+=.24)addBox(m,[-7.82,2.05,z],[.10,3.75,.07],MAT.steel);
    addBox(m,[-7.82,4.12,mid],[.12,.16,gate],MAT.steel);
  }
  // 1888 gables and 1912 roof lanterns give the old ranges a domestic civic
  // roofscape. The 1967 wing gets honest precast fins instead of fake history.
  const schoolBand=BANDS.find((band)=>band.kind==='school');
  const bathsBand=BANDS.find((band)=>band.kind==='baths');
  const academicBand=BANDS.find((band)=>band.kind==='academic');
  for(const z of[49.0,58.8]){
    const eaves=schoolBand.parapet-1.15;
    addTriangle(m,[.1,eaves,z-3.8],[.1,eaves+2.7,z],[.1,eaves,z+3.8],MAT.terracotta);
    addBox(m,[.18,eaves-.8,z],[.24,1.65,6.8],MAT.brickRed);
  }
  for(const z of[69.5,78.5])addRoofLantern(m,{x:-.25,z,w:2.7,d:4.6,y:bathsBand.parapet-.5,rise:.55});
  for(let z=6.4;z<21.4;z+=3.0)addBox(m,[-.28,academicBand.parapet/2,z],[1.20,academicBand.parapet-.8,.22],MAT.concrete);

  // Projecting phase fronts give the arrival elevation actual depth. These are
  // short, separately roofed ownerships—none longer than eight metres—so the
  // whole institution can never collapse back into a single decorated slab.
  for(const z of[8.4,17.0]){
    addBox(m,[-1.45,6.0,z],[2.9,12.0,6.2],MAT.concrete);
    addBox(m,[-3.00,.55,z],[.22,1.10,6.45],MAT.stone);
    addBox(m,[-3.02,9.0,z],[.18,4.3,2.15],MAT.black);
    for(const dz of[-2.55,0,2.55])addBox(m,[-3.14,6.0,z+dz],[.24,11.6,.34],MAT.concrete);
    addBox(m,[-1.45,12.15,z],[3.25,.30,6.55],MAT.stone);
  }
  for(const z of[49.2,59.2]){
    const w=3.4,d=7.4,h=9.4;
    addBox(m,[-1.7,h/2,z],[w,h,d],MAT.brickRed);
    addPitchedRoof(m,{x:-1.7,z,w,d,eaves:h,rise:2.35,mat:MAT.slate,gableMat:MAT.brickRed,ridge:'x'});
    for(const dz of[-1.8,1.8]){
      addBox(m,[-3.44,5.55,z+dz],[.16,2.35,1.15],MAT.black);
      addBox(m,[-3.55,6.88,z+dz],[.22,.18,1.48],MAT.stone);
      addBox(m,[-3.55,4.12,z+dz],[.22,.18,1.48],MAT.stone);
    }
    addBox(m,[-3.58,1.62,z],[.22,2.85,1.38],MAT.agedWhite);
    addBox(m,[-3.62,3.18,z],[.26,.22,1.70],MAT.stone);
  }
  for(const z of[68.0,75.2,82.2]){
    const w=2.5,d=5.8,h=7.65;
    addBox(m,[-1.25,h/2,z],[w,h,d],MAT.glazedBrick);
    addPitchedRoof(m,{x:-1.25,z,w,d,eaves:h,rise:1.0,mat:MAT.slate,gableMat:MAT.glazedBrick,ridge:'z'});
    addBox(m,[-2.57,4.20,z],[.16,2.8,1.72],MAT.black);
    addWallArch(m,{axis:'z',plane:-2.62,inside:-1,along:z,spring:5.62,radius:.92,depth:.12,section:.16,mat:MAT.stone,segments:10});
    addBox(m,[-2.66,2.72,z],[.24,.22,2.08],MAT.stone);
  }

  // The collision mass begins at physical x50. Keep a thin authored skin half
  // a metre out in the open yard so the ray-marched support can never win the
  // depth test and show its generic rock material through this hero facade.
  for(const band of BANDS){
    if(band.kind==='flytower')continue;
    const h=band.parapet;
    // This backing skin used to span the complete service band after the
    // decorated face had already cut out the loading-bay mouth. From outside it
    // therefore won the depth test as a perfectly solid wall; from a slightly
    // different angle the front face won and the aperture appeared again. The
    // support skin is part of the same elevation contract and must carry the
    // same opening through every course, plinth and pilaster.
    const skinRuns=(band.z0<mouthB&&band.z1>mouthA)
      ? [[band.z0,mouthA],[mouthB,band.z1]]
      : [[band.z0,band.z1]];
    for(const [a,b] of skinRuns){
      const mid=(a+b)/2,len=b-a;
      if(len<=.01)continue;
      addBox(m,[-.65,h/2,mid],[.18,h-.08,Math.max(.02,len-.14)],phaseMaterial(band.kind));
      addBox(m,[-.77,.48,mid],[.18,.92,Math.max(.02,len-.06)],MAT.stone);
    }
    for(let z=band.z0+1.5;z<band.z1-1;z+=3.0){
      if(z>mouthA-.9&&z<mouthB+.9)continue;
      addBox(m,[-.80,h/2,z],[.14,h-.45,.36],MAT.stone);
    }
    for(let z=band.z0+3;z<band.z1-2;z+=6){
      if(z>mouthA-1.5&&z<mouthB+1.5)continue;
      if(h>8.8){
        addBox(m,[-.82,7.35,z],[.13,1.90,1.30],MAT.black);
        addBox(m,[-.84,8.35,z],[.14,.20,1.52],MAT.stone);
      }
      if(h>12.8)addBox(m,[-.82,11.30,z],[.13,1.55,1.05],MAT.black);
    }
  }

  // The head of the bay opening: a deep concrete lintel and the sign board over
  // it, which is the last thing a lorry driver reads before he backs in.
  addBox(m,[.30,5.86,(mouthA+mouthB)/2],[.74,.72,mouthB-mouthA+1.1],MAT.stone);
  addBox(m,[-.02,6.85,(mouthA+mouthB)/2],[.14,.86,4.2],MAT.agedWhite);
  // Rainwater goods, and the ladder nobody has climbed since the survey.
  for(const z of[mouthA-1.3,mouthB+1.3]) addCylinder(m,[-.02,13.15/2,z],.085,13.15,MAT.steel,8);
  for(let y=1.2;y<12.2;y+=.42) addBox(m,[-.20,y,10.6],[.34,.06,.44],MAT.steel);

  // ── ON THE ROOF ────────────────────────────────────────────────────────────
  //
  // A parapet with nothing behind it is a flat, and a flat reads as a cut-out.
  // Everything here exists to break the top edge: the eye finds the roofline
  // first and it is the only part of this elevation lit from behind.

  // The water tank on the fly tower — the tallest object on the site, and the
  // one a sprinkler main was fed from before the mains went off.
  {
    const hall=ELLERY_MASSING.find((band)=>band.id==='hall');
    const z=33.5,top=hall.height,tankX=hall.setback+3.5;
    for(const dz of[-2.1,2.1]) for(const dx of[tankX-1,tankX+1]){
      addBox(m,[dx,top+1.4,z+dz],[.16,2.8,.16],MAT.steel);
    }
    addBox(m,[tankX,top+3.5,z],[3.0,1.5,5.2],MAT.steel);
    addBox(m,[tankX,top+4.32,z],[3.2,.14,5.4],MAT.steel);                   // lid
    addCylinder(m,[tankX,top+1.0,z-2.9],.11,2.0,MAT.steel,8);               // downcomer
  }
  // Chimney stacks on the back range. Two of them, with pots, because the range
  // was heated by fires long before it was heated by anything else.
  for(const z of[52.0,63.5]){
    addBox(m,[.30,11.0+1.9,z],[1.10,3.8,1.55],MAT.plaster);
    addBox(m,[.30,11.0+3.9,z],[1.30,.24,1.75],MAT.stone);                  // corbelled head
    for(const dz of[-.42,.42]) addCylinder(m,[.30,11.0+4.4,z+dz],.15,.72,MAT.stone,8);
  }
  // The roof plant: an extract housing and its cowl, sitting on the back range.
  {
    const z=73.0,top=11.0;
    addBox(m,[.50,top+1.05,z],[2.4,2.1,4.6],MAT.steel);
    for(let i=0;i<6;i++) addBox(m,[-.66,top+.55+i*.24,z],[.20,.14,3.6],MAT.steel);
    addCylinder(m,[.50,top+2.7,z+1.6],.42,1.2,MAT.steel,10);
    addBox(m,[.50,top+3.5,z+1.6],[1.20,.22,1.20],MAT.steel);               // cowl
  }
  // THE FIRE ESCAPE, down the academic band. Nobody has been up it since the
  // survey either, and it is the one thing on this face with a shadow in it.
  {
    const z=17.5;
    for(let flight=0;flight<4;flight++){
      const y0=2.6+flight*3.65;
      addBox(m,[-.95,y0,z],[1.90,.10,1.60],MAT.steel);                     // landing
      addBox(m,[-1.86,y0+.55,z],[.08,1.10,1.60],MAT.steel);                // outer rail
      for(const dz of[-.80,.80]) addBox(m,[-.95,y0+.55,z+dz],[1.90,1.10,.07],MAT.steel);
      // The flight itself, a raking box between this landing and the next.
      addBeam(m,[-1.50,y0,z+(flight%2?1.0:-1.0)],[-1.50,y0+3.65,z+(flight%2?-1.0:1.0)],.55,MAT.steel);
    }
    for(let y=0.4;y<15.6;y+=3.65) addCylinder(m,[-1.86,y+1.8,z-1.9],.06,3.6,MAT.steel,6);
  }

  // THE REST OF THE BLOCK. The west service elevation is the arrival face, but
  // the player can now walk every street around Ellery. These three elevations
  // therefore carry the same accumulated institution instead of exposing the
  // ray-marched occupancy as an anonymous black cliff.
  function crossStreetRange({z,outward,segments,inwardLimit=null,limitUntilX=0}){
    let x=0;
    for(let i=0;i<segments.length;i++){
      const seg=segments[i],w=seg.w,h=seg.h,mat=seg.mat,mid=x+w/2;
      const gap=.55+(i%3)*.22,bw=w-gap,depth=4.8+(i%3)*.7;
      const setback=[0,2.2,.7,4.6,1.4,3.2,.4,4.0][i%8];
      let bodyZ=z-outward*setback;
      // The south return begins beside the open loading bay. Its first service
      // ranges used to project 0.8m across the authored mouth; at a grazing
      // angle their end wall became the enormous slatted wall in front of the
      // dock. Keep those ranges behind the same aperture jamb until the bay's
      // 30m service depth is clear.
      if(outward<0&&Number.isFinite(inwardLimit)&&x<limitUntilX){
        const inwardEdge=bodyZ-outward*depth/2;
        if(inwardEdge>inwardLimit)bodyZ-=inwardEdge-inwardLimit;
      }
      const face=bodyZ+outward*(depth/2+.08),back=bodyZ-outward*depth/2;
      addBox(m,[mid,h/2,bodyZ],[bw,h,depth],mat);
      addBox(m,[mid,.50,face],[bw+.08,.95,.18],MAT.stone);
      addBox(m,[mid,h-.42,face],[bw+.16,.22,.20],MAT.stone);
      const floorCount=Math.max(1,Math.floor((h-1.8)/3.0));
      for(let bx=mid-bw/2+1.7;bx<mid+bw/2-1.0;bx+=3.1){
        addBox(m,[bx,1.52,face+outward*.09],[1.12,2.62,.16],i%3===0?MAT.agedWhite:MAT.black);
        for(let floor=0;floor<floorCount;floor++){
          const y=4.75+floor*2.85;if(y>h-1.0)continue;
          addBox(m,[bx,y,face+outward*.10],[1.20,1.44,.14],((i+floor)%8===0)?MAT.warmWindow:MAT.black);
          addBox(m,[bx,y+.82,face+outward*.13],[1.48,.16,.20],MAT.stone);
        }
      }
      // Older phases turn a pitched roof and a gable to the street. Later
      // concrete/service pieces keep a shallow parapet, visibly grafted on.
      if(mat===MAT.brickRed||mat===MAT.glazedBrick||mat===MAT.brickDark){
        const rise=1.7+(i%2)*.55,xa=mid-bw/2,xb=mid+bw/2;
        addPitchedRoof(m,{x:mid,z:bodyZ,w:bw,d:depth,eaves:h,rise,mat:MAT.slate,gableMat:mat,ridge:'x'});
      }
      // The block is walkable on both sides, so a rear elevation cannot be a
      // blind extrusion. Quieter windows and a second stone band make it read
      // as the back of an owned building rather than the end of the model.
      const rear=bodyZ-outward*(depth/2+.08);
      addBox(m,[mid,.50,rear],[bw+.08,.95,.18],MAT.stone);
      addBox(m,[mid,h-.42,rear],[bw+.16,.22,.20],MAT.stone);
      for(let bx=mid-bw/2+1.7;bx<mid+bw/2-1.0;bx+=3.1){
        addBox(m,[bx,4.72,rear-outward*.09],[1.02,1.30,.14],MAT.black);
        addBox(m,[bx,5.46,rear-outward*.12],[1.28,.14,.20],MAT.stone);
      }
      if(setback>1.5){
        const streetFace=z+outward*2.96;
        addBox(m,[mid,.48,streetFace],[bw,.96,.20],MAT.brickRed);
        for(const px of[mid-bw/2+.25,mid+bw/2-.25])addBox(m,[px,1.05,streetFace],[.48,2.1,.48],MAT.stone);
      }
      // Each ownership ends in a rainwater pipe and a tiny step in the parapet.
      addCylinder(m,[mid+bw/2-.18,h/2,face+outward*.16],.07,h-.30,MAT.steel,8);
      x+=w;
    }
  }
  crossStreetRange({z:-5.4,outward:-1,inwardLimit:mouthA-.02,limitUntilX:30,segments:[
    {w:10,h:10.8,mat:MAT.steel},{w:9,h:12.8,mat:MAT.brickRed},
    {w:11,h:10.6,mat:MAT.brickRed},{w:10,h:9.8,mat:MAT.brickDark},
    {w:9,h:12.2,mat:MAT.glazedBrick},{w:10,h:10.5,mat:MAT.brickRed},
    {w:9,h:9.2,mat:MAT.concrete},{w:10,h:11.4,mat:MAT.glazedBrick},
  ]});
  crossStreetRange({z:82.6,outward:1,segments:[
    {w:9,h:9.8,mat:MAT.brickRed},{w:10,h:11.2,mat:MAT.brickRed},
    {w:9,h:8.8,mat:MAT.glazedBrick},{w:11,h:10.2,mat:MAT.brickDark},
    {w:10,h:9.6,mat:MAT.brickRed},{w:9,h:10.8,mat:MAT.concrete},
    {w:10,h:11.6,mat:MAT.glazedBrick},{w:10,h:9.4,mat:MAT.steel},
  ]});

  // East elevation: a sequence of short phase bays. The lower range remains
  // below the withdrawn hall tower, and blocked doors keep exploration outside.
  for(const band of BANDS){
    const len=band.z1-band.z0,h=Math.min(band.parapet,band.foreground||band.parapet);
    const count=Math.max(2,Math.ceil(len/7.5)),bay=len/count;
    for(let i=0;i<count;i++){
      const z0=band.z0+i*bay,z1=band.z0+(i+1)*bay,mid=(z0+z1)/2;
      const gap=.36+(i%2)*.18,depth=4.6+(i%3)*.6,setback=[0,2.8,.9,4.3][i%4];
      const face=79.32-setback,bodyX=face-depth/2,mat=phaseMaterial(band.kind);
      addBox(m,[bodyX,h/2,mid],[depth,h,bay-gap],mat);
      addBox(m,[face+.08,.48,mid],[.18,.96,bay-gap+.06],MAT.stone);
      addBox(m,[face+.10,h-.42,mid],[.20,.22,bay-gap+.12],MAT.stone);
      addBox(m,[face+.14,1.55,mid],[.16,2.70,1.18],MAT.black);
      if(band.kind!=='service'){
        addBox(m,[face+.15,5.05,mid],[.14,1.45,1.22],((i+band.year)%9===0)?MAT.warmWindow:MAT.black);
        addBox(m,[face+.18,5.90,mid],[.20,.18,1.50],MAT.stone);
      }
      if(mat===MAT.brickRed||mat===MAT.glazedBrick||mat===MAT.brickDark){
        const rise=1.55+(i%2)*.4;
        addPitchedRoof(m,{x:bodyX,z:mid,w:depth,d:bay-gap,eaves:h,rise,mat:MAT.slate,gableMat:mat,ridge:'z'});
      }
      if(setback>2){
        addBox(m,[79.34,.52,mid],[.22,1.04,bay-gap],MAT.brickRed);
        for(const z of[z0+gap/2+.22,z1-gap/2-.22])addBox(m,[79.36,1.1,z],[.48,2.2,.48],MAT.stone);
      }
      addCylinder(m,[face+.22,h/2,z1-gap/2-.16],.07,h-.30,MAT.steel,8);
    }
  }

  // Distinct wings behind the perimeter make the site legible in parallax.
  // They are deliberately separated by courts and links instead of filling the
  // footprint with one roof slab.
  function pitchedWing({x,z,w,d,h,mat,rise=2.2,windows=true}){
    addBox(m,[x,h/2,z],[w,h,d],mat);
    addPitchedRoof(m,{x,z,w,d,eaves:h,rise,mat:MAT.slate,gableMat:mat,ridge:'z'});
    if(windows)for(const side of[-1,1])for(let wx=x-w/2+2;wx<x+w/2-1;wx+=3.2){
      const face=z+side*(d/2+.10);
      addBox(m,[wx,4.2,face],[1.15,1.65,.16],MAT.black);
      addBox(m,[wx,5.14,face+side*.03],[1.45,.17,.20],MAT.stone);
    }
    if(windows)for(const side of[-1,1]){
      const face=x+side*(w/2+.10);
      addBox(m,[face,4.25,z],[.16,1.70,1.20],MAT.black);
      addBox(m,[face+side*.03,5.22,z],[.20,.17,1.48],MAT.stone);
    }
    for(const px of[x-w/2+.35,x+w/2-.35])addCylinder(m,[px,h/2,z-d/2-.18],.07,h-.3,MAT.steel,8);
  }
  // 1888 school: three domestic-scale teaching pavilions around a court.
  pitchedWing({x:22,z:56,w:12,d:15,h:9.8,mat:MAT.brickRed,rise:2.5});
  pitchedWing({x:38,z:59,w:11,d:13,h:10.6,mat:MAT.brickRed,rise:2.7});
  pitchedWing({x:28,z:72,w:14,d:9,h:9.2,mat:MAT.brickRed,rise:2.1});
  addBox(m,[30,4.1,64],[5.8,8.2,3.2],MAT.brickRed);                       // narrow enclosed link
  for(const z of[62.8,65.2])addBox(m,[30,4.4,z],[4.5,2.1,.14],MAT.black);

  // 1912 baths: a low glazed-brick hall with a repeated arched side and roof
  // lanterns. Its horizontal volume is intentionally lower than the school.
  {
    const x=60,z=77,w=23,d=10,h=8.2;
    addBox(m,[x,h/2,z],[w,h,d],MAT.glazedBrick);
    for(const side of[-1,1])for(let wx=x-w/2+2.4;wx<x+w/2-1;wx+=4.0){
      const face=z+side*(d/2+.10);
      addBox(m,[wx,4.0,face],[1.65,2.6,.16],MAT.black);
      addWallArch(m,{axis:'x',plane:face+side*.02,inside:side,along:wx,spring:5.30,radius:.88,depth:.16,section:.14,mat:MAT.stone,segments:9});
    }
    for(const side of[-1,1])addBox(m,[x,h-.28,z+side*(d/2+.12)],[w+.2,.30,.22],MAT.stone);
    addBarrelRoof(m,{x,z,w:w+.4,d:d+.4,eaves:h,rise:2.35,glassFraction:.20});
    for(const wx of[x-6,x+6])addRoofLantern(m,{x:wx,z,w:3.2,d:6.2,y:h+1.15,rise:.62});
    for(const wx of[x-w/2+.3,x+w/2-.3])addCylinder(m,[wx,h/2,z-d/2-.26],.075,h-.25,MAT.steel,8);
  }

  // 1967 academic block: narrower than the old school, with a concrete frame
  // and a glazed link visibly stopping short of the Victorian masonry.
  {
    const x=34,z=16,w=17,d=13,h=13.4;
    addBox(m,[x,5.1,z],[w,10.2,d],MAT.concrete);
    addBox(m,[x,11.8,z+.55],[13.4,3.2,10.2],MAT.concrete);
    for(const side of[-1,1])for(let wx=x-w/2+1.4;wx<x+w/2-.8;wx+=2.8){
      const face=z+side*(d/2+.10);
      addBox(m,[wx,6.0,face],[1.75,6.0,.16],MAT.black);
      addBox(m,[wx,6.0,face+side*.09],[.16,9.2,.22],MAT.concrete);
    }
    for(const side of[-1,1])for(const px of[x-w/2,x+w/2])addBox(m,[px,5.2,z+side*(d/2+.25)],[.52,10.4,.52],MAT.concrete);
    addBox(m,[x,10.16,z],[17.6,.22,13.6],MAT.stone);
    addBox(m,[x,13.46,z+.55],[14.0,.22,10.8],MAT.stone);
    addBox(m,[20,6.1,20],[11.0,4.0,3.0],MAT.roofGlass);
  }

  // 1908 chapel and bell tower. It arrives in the skyline before any complete
  // reading of Ellery does; the low school and baths roofs hide its base from
  // most street positions, as they should in an accumulated urban block.
  {
    const cx=55.0,cz=68.0,baseH=10.8,towerH=23.5;
    addBox(m,[cx,baseH/2,cz],[16.0,baseH,9.5],MAT.brickRed);
    addPitchedRoof(m,{x:cx,z:cz,w:16.0,d:9.5,eaves:baseH,rise:3.1,mat:MAT.slate,gableMat:MAT.brickRed,ridge:'z'});
    // Narrow side aisles and five buttresses make the nave read as construction
    // in depth, not as one chapel-sized cuboid.
    for(const side of[-1,1])addBox(m,[cx+side*7.2,4.2,cz-.4],[2.0,8.4,10.8],MAT.brickRed);
    for(const dx of[-7.4,-3.7,0,3.7,7.4]){
      addBox(m,[cx+dx,5.7,cz+4.84],[1.18,3.05,.16],MAT.black);
      addWallArch(m,{axis:'x',plane:cz+4.91,inside:1,along:cx+dx,spring:7.28,radius:.67,depth:.16,section:.14,mat:MAT.stone,segments:9});
      addBox(m,[cx+dx,2.6,cz+5.22],[.46,5.2,.60],MAT.stone);
    }
    addBox(m,[cx,baseH+.10,cz],[16.7,.22,10.1],MAT.stone);
    // The tower is a slender vertical room set behind the nave crossing.
    addBox(m,[cx,towerH/2,cz-1.2],[6.4,towerH,6.4],MAT.brickRed);
    for(const side of[-1,1])for(const zside of[-1,1])
      addBox(m,[cx+side*3.18,towerH*.42,cz-1.2+zside*3.18],[.48,towerH*.84,.48],MAT.stone);
    for(const y of[3.8,10.7,18.1,22.0])addBox(m,[cx,y,cz-1.2],[6.9,.26,6.9],MAT.stone);
    for(const side of[-1,1])for(let i=0;i<5;i++){
      addBox(m,[cx+side*3.24,19.5+i*.34,cz-1.2],[.16,.16,2.2],MAT.black);
      addBox(m,[cx,19.5+i*.34,cz-1.2+side*3.24],[2.2,.16,.16],MAT.black);
    }
    const e=3.65,tz=cz-1.2,apex=[cx,towerH+4.2,tz];
    addTriangle(m,[cx-e,towerH,tz-e],[cx+e,towerH,tz-e],apex,MAT.slate);
    addTriangle(m,[cx+e,towerH,tz-e],[cx+e,towerH,tz+e],apex,MAT.slate);
    addTriangle(m,[cx+e,towerH,tz+e],[cx-e,towerH,tz+e],apex,MAT.slate);
    addTriangle(m,[cx-e,towerH,tz+e],[cx-e,towerH,tz-e],apex,MAT.slate);
  }
}
{
  // THE ONE LIT WINDOW ON THE BUILDING.
  //
  // A separate mesh so it can carry emissive of its own — vEmissive is per
  // instance in the mesh pass, so a lit pane inside the dark elevation is not
  // expressible. Small, and deliberately a little brighter than the reveal
  // around it: at forty metres in the rain it is two characters of light.
  const m=mesh('conservatory_stair_window');
  addBox(m,[.16,0,0],[.34,1.55,1.05],MAT.stone);          // the reveal it sits in
  addBox(m,[-.04,0,0],[.06,1.34,.86],MAT.roofGlass);      // the pane
  addBox(m,[-.05,0,0],[.05,1.34,.07],MAT.agedWhite);      // one glazing bar
  addBox(m,[-.05,0,0],[.05,.07,.86],MAT.agedWhite);
  addBox(m,[.20,.94,0],[.52,.20,1.35],MAT.stone);         // lintel
}

{
  // The lodge is a window diorama. Shell, glazing, dressing, practical light,
  // guard and handoff objects are separate runtime layers, so a story line can
  // change the work being done without replacing the little building around it.
  const m=mesh('yard_booth');
  addBox(m,[0,.10,0],[3.30,.20,2.90],MAT.stone);
  addBox(m,[0,.72,0],[2.86,1.24,2.46],MAT.dark);
  addBox(m,[0,1.38,0],[2.98,.12,2.58],MAT.stone);
  addBox(m,[0,2.86,0],[2.86,.22,2.46],MAT.dark);
  addBox(m,[0,3.02,0],[3.22,.14,2.82],MAT.stone);
  for(let t=0;t<=1.001;t+=1/6){const h=3.09+t*.62,w=3.16*(1-t*.86),d=2.76*(1-t*.86);addBox(m,[0,h,0],[w,.11,d],MAT.black);}
  addBox(m,[0,3.76,0],[.46,.10,.42],MAT.stone);
  addBox(m,[1.44,1.70,0],[.10,2.10,.86],MAT.wood);
  addCylinder(m,[2.40,.58,1.66],.11,1.16,MAT.steel,8);
  addBeam(m,[2.40,1.10,1.66],[2.40,3.24,1.10],.09,MAT.safetyRed);
}
{
  const m=mesh('yard_booth_glazing');
  for(const [dx,dz,w,d] of[[0,-1.22,2.70,.10],[0,1.22,2.70,.10],[-1.38,0,.10,2.30],[1.38,0,.10,2.30]]){
    if(w>d){addBox(m,[dx,1.48,dz],[w,.06,d],MAT.agedWhite);addBox(m,[dx,2.72,dz],[w,.06,d],MAT.agedWhite);for(const x of[dx-w/2,dx+w/2])addBox(m,[x,2.10,dz],[.06,1.30,d],MAT.agedWhite);}
    else{addBox(m,[dx,1.48,dz],[w,.06,d],MAT.agedWhite);addBox(m,[dx,2.72,dz],[w,.06,d],MAT.agedWhite);for(const z of[dz-d/2,dz+d/2])addBox(m,[dx,2.10,z],[w,1.30,.06],MAT.agedWhite);}
  }
  // Sparse raised streaks catch the road and torch without becoming an opaque
  // blue wall in the prop depth pass. The workplace remains readable behind it.
  for(const x of[-1.12,-.72,-.18,.42,.98])addBox(m,[x,2.12+(x%2)*.08,-1.285],[.022,.92,.018],MAT.roofGlass,.03);
  for(const x of[-.90,0,.90])addBox(m,[x,2.10,-1.24],[.07,1.30,.11],MAT.agedWhite);
  for(const x of[-1.34,1.34])addBox(m,[x,2.10,-1.24],[.10,1.30,.11],MAT.agedWhite);
  addBox(m,[0,2.12,-1.25],[2.70,.09,.12],MAT.agedWhite);
  for(const z of[-.62,.62])addBox(m,[-1.40,2.10,z],[.11,1.30,.07],MAT.agedWhite);
  // The lower left light is a sliding pass-through, visibly offset on its rail.
  addBox(m,[-.57,1.67,-1.31],[1.08,.07,.13],MAT.steel);
  addBox(m,[-.88,1.91,-1.30],[.46,.40,.045],MAT.roofGlass);
  addBox(m,[-.30,1.91,-1.30],[.46,.40,.045],MAT.roofGlass);
}
{
  const m=mesh('yard_booth_interior');
  addBox(m,[-.45,1.48,-.83],[1.72,.14,.68],MAT.wood);                // public counter
  addBox(m,[-.45,1.12,-.76],[1.58,.58,.48],MAT.dark);                // counter carcass
  addBox(m,[.38,.86,.72],[1.20,.10,.62],MAT.wood);                  // work desk
  addLegs(m,.38,.72,1.04,.48,.05,.78,MAT.steel,.022);
  addBox(m,[.16,.98,.68],[.48,.36,.34],MAT.black);                  // muted CRT body
  addBox(m,[-.50,1.58,-.84],[.48,.035,.34],MAT.paper);              // open ledger
  for(let i=0;i<4;i++)addBox(m,[-.93+i*.18,1.61,-.83],[.14,.018,.24],MAT.paper,(i-1.5)*.035); // forms
  addCylinder(m,[.02,1.66,-.81],.075,.24,MAT.dark,12);               // pen pot
  for(const x of[-.035,.015,.065])addCylinder(m,[x,1.82,-.81],.010,.30,x<0?MAT.safetyRed:MAT.brass,8);
  // Key board with real hooks and dangling keys.
  addBox(m,[.91,1.95,.94],[.72,.72,.055],MAT.dark);
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){const x=.66+col*.16,y=1.74+row*.18;addCylinder(m,[x,y,.90],.010,.05,MAT.brass,8);if((row+col)%3)addBox(m,[x,y-.065,.88],[.025,.12,.018],MAT.brass);}
  // Hotplate, kettle, cups and heater are deliberately domestic and tired.
  addBox(m,[.72,1.55,-.78],[.34,.06,.28],MAT.black);
  addCylinder(m,[.72,1.70,-.78],.12,.25,MAT.steel,14);
  for(const x of[.38,.52]){addCylinder(m,[x,1.61,-.80],.055,.12,MAT.ivory,12);addBox(m,[x+.07,1.62,-.80],[.07,.025,.025],MAT.ivory);}
  addBox(m,[.98,.42,.70],[.42,.54,.23],MAT.agedWhite);for(const y of[.25,.36,.47,.58])addBox(m,[.98,y,.575],[.30,.028,.018],MAT.dark);
  // Mismatched chair: tubular legs, brown seat, vinyl back.
  addBox(m,[.38,.60,.18],[.48,.08,.46],MAT.wood);addBox(m,[.38,1.02,.38],[.48,.58,.07],MAT.dark);
  addLegs(m,.38,.18,.38,.34,.04,.54,MAT.steel,.018);
}
{
  const m=mesh('yard_booth_practicals');
  addBox(m,[.16,1.02,.49],[.38,.24,.025],MAT.vfd);                   // television light
  addBox(m,[0,2.78,0],[1.72,.07,.16],MAT.warmWindow);               // strip light
  addCylinder(m,[.72,1.60,-.78],.095,.025,MAT.safetyRed,16);         // hotplate element
}
const addBoothGuard=(m,{x=0,z=-.15,lean=0,arm='rest'}={})=>{
  addBox(m,[x,1.20,z],[.52,.70,.28],MAT.cloth,lean);
  addCylinder(m,[x,1.70,z-.02],.17,.30,MAT.wood,14);
  addBox(m,[x-.03,1.86,z-.09],[.40,.045,.26],MAT.dark,lean);         // cap hides the face
  addBox(m,[x,1.77,z-.16],[.26,.09,.05],MAT.dark,lean);
  if(arm==='handoff')addBeam(m,[x-.18,1.47,z-.18],[-.58,1.58,-1.03],.09,MAT.wood);
  else if(arm==='write'){addBeam(m,[x-.18,1.45,z-.14],[-.48,1.56,-.72],.085,MAT.wood);addBeam(m,[x+.18,1.45,z-.14],[-.16,1.54,-.70],.085,MAT.wood);}
  else{addBeam(m,[x-.18,1.43,z-.10],[-.34,1.24,z-.30],.085,MAT.wood);addBeam(m,[x+.18,1.43,z-.10],[.34,1.24,z-.30],.085,MAT.wood);}
};
{const m=mesh('yard_booth_guard_idle');addBoothGuard(m,{x:.38,z:.23,lean:.28,arm:'rest'});}
{const m=mesh('yard_booth_guard_ledger');addBoothGuard(m,{x:-.16,z:-.22,lean:-.08,arm:'write'});}
{const m=mesh('yard_booth_guard_handoff');addBoothGuard(m,{x:-.12,z:-.30,lean:-.05,arm:'handoff'});}
{
  const m=mesh('yard_booth_handoff');
  addBox(m,[-.60,1.61,-1.06],[.40,.025,.27],MAT.paper);
  addCylinder(m,[-.47,1.67,-1.02],.012,.25,MAT.brass,8);
  addBox(m,[-.72,1.65,-1.04],[.12,.035,.045],MAT.brass);
}
{
  // Chain-link on concrete posts, with the wire itself as a thin translucent
  // plane — a real mesh of links is thousands of triangles nobody can see at
  // thirty metres in the rain.
  const m=mesh('yard_fence_run'),L=24.0;
  for(let z=-L/2;z<=L/2+.01;z+=3.0){
    addBox(m,[0,1.10,z],[.16,2.20,.16],MAT.stone);
    addBox(m,[0,2.28,z],[.20,.10,.20],MAT.stone);
  }
  addBox(m,[0,1.15,0],[.03,2.05,L],MAT.roofGlass);                   // the mesh
  addBox(m,[0,2.16,0],[.06,.06,L],MAT.steel);                        // top rail
  addBox(m,[0,.14,0],[.10,.28,L],MAT.stone);                         // gravel board
  // Three strands of barbed wire on cranked arms, leaning in over the yard.
  for(let z=-L/2;z<=L/2+.01;z+=3.0) addBeam(m,[0,2.28,z],[-.34,2.72,z],.045,MAT.steel);
  for(const y of[2.46,2.60,2.72]) addBox(m,[-.24,y,0],[.03,.03,L],MAT.steel);
}
{
  // A steel column with the sodium lantern still on it. Nothing in the yard is
  // on the conservatory's supply; this one belongs to the road.
  const m=mesh('yard_lamp_column');
  addCylinder(m,[0,.22,0],.26,.44,MAT.stone);
  addCylinder(m,[0,3.30,0],.115,6.20,MAT.steel,10);
  addBeam(m,[0,6.40,0],[.95,7.05,0],.10,MAT.steel);                  // the crank
  addBox(m,[1.32,7.06,0],[.86,.24,.34],MAT.steel);                   // lantern body
  addBox(m,[1.32,6.90,0],[.74,.10,.28],MAT.ivory);                   // the bowl
  addBox(m,[0,1.35,.15],[.30,.44,.06],MAT.steel);                    // the cut-out door
}
{
  // A skip, filled and left. The most British object available.
  const m=mesh('yard_skip');
  const wall=(x,y,z,w,h,d)=>addBox(m,[x,y,z],[w,h,d],MAT.safetyRed);
  wall(0,.06,0,3.60,.12,1.80);
  wall(0,.62,-.86,3.60,1.12,.08);
  wall(0,.62,.86,3.60,1.12,.08);
  addQuad(m,[-1.80,.12,-.90],[-1.80,1.20,-.62],[-1.80,1.20,.62],[-1.80,.12,.90],MAT.safetyRed);
  addQuad(m,[1.80,.12,-.90],[1.80,.12,.90],[1.80,1.20,.62],[1.80,1.20,-.62],MAT.safetyRed);
  for(const x of[-1.20,1.20]) addBox(m,[x,.66,0],[.10,1.20,1.76],MAT.dark);   // ribs
  // Spoil: broken plaster, lath and a rolled carpet, above the rim.
  for(let i=0;i<11;i++){
    const a=i*2.399,x=Math.cos(a)*1.35,z=Math.sin(a)*.62;
    addBox(m,[x,1.24+((i%3)*.09),z],[.62-.03*i,.20,.44],i%2?MAT.plaster:MAT.wood,a);
  }
  addCylinder(m,[.55,1.42,-.20],.20,1.30,MAT.cloth,7);
}
{
  // The clutter that collects at the back of a yard nobody is clearing.
  const m=mesh('yard_clutter');
  for(let i=0;i<7;i++) addBox(m,[0,.075+i*.15,0],[1.20,.14,1.00],MAT.wood);   // pallet stack
  addBox(m,[1.85,.62,.10],[.72,1.20,.68],MAT.dark);                            // wheelie bin
  addBox(m,[1.85,1.24,.10],[.76,.08,.72],MAT.dark);
  addBox(m,[2.70,.58,-.30],[.68,1.12,.64],MAT.dark);
  addBox(m,[2.70,1.16,-.30],[.72,.08,.68],MAT.dark);
  for(const [x,z] of[[-1.50,.90],[-1.10,1.40],[-1.90,1.25]]){                  // cones
    addBox(m,[x,.03,z],[.36,.06,.36],MAT.dark);
    addCylinder(m,[x,.32,z],.10,.58,MAT.cone,7);
    addCylinder(m,[x,.34,z],.115,.12,MAT.agedWhite,7);
  }
  addBox(m,[-2.60,.42,-.55],[.24,.84,.24],MAT.safetyRed);                      // a bollard, hit once
}
{
  // MUNICIPAL PAINT. This is where the yard says which country it is in: a
  // hatched KEEP CLEAR box across the dock mouth, a loading bay marked out in
  // white, and the double yellow running along the boundary. The lettering is
  // not modelled — at this distance and this resolution it would be mush — but
  // the geometry of British road marking is unmistakable on its own.
  const m=mesh('yard_markings'),y=.012;
  const stripe=(x,z,w,d,mat=MAT.agedWhite,yaw=0)=>addBox(m,[x,y,z],[w,.024,d],mat,yaw);
  // The bay: two long lines and a closed end, 3.5m wide as required.
  stripe(0,-1.75,11.0,.14); stripe(0,1.75,11.0,.14); stripe(-5.45,0,.14,3.64);
  // Hatching inside the KEEP CLEAR box, at 45 degrees, the way it is painted.
  for(let i=-5;i<=5;i++) stripe(i*1.05,0,.13,4.60,MAT.agedWhite,Math.PI*0.25);
  stripe(0,-2.35,11.6,.16); stripe(0,2.35,11.6,.16);
  // Double yellow along the boundary edge, kerbside.
  for(const z of[6.05,6.28]) addBox(m,[0,y,z],[15.0,.024,.10],MAT.brass);
  // A worn transverse give-way line where the road meets the yard.
  for(let i=-6;i<=6;i++) stripe(i*.62,5.10,.34,.22);
}
{
  // Site signage on the fence: the demolition notice, the deliveries board and
  // a hazard plate. Read as shapes and stripes, which is all they ever are at
  // thirty metres in the dark.
  const m=mesh('yard_sign');
  for(const x of[-.78,.78]) addBox(m,[x,1.05,0],[.09,2.10,.09],MAT.steel);
  addBox(m,[0,1.86,.05],[1.86,1.16,.05],MAT.agedWhite);              // notice board
  addBox(m,[0,2.28,.09],[1.62,.20,.03],MAT.dark);                    // its heading bar
  for(let i=0;i<5;i++) addBox(m,[0,2.00-i*.15,.09],[1.42,.05,.02],MAT.dark);
  addBox(m,[0,1.06,.05],[1.10,.44,.05],MAT.safetyRed);               // hazard plate
  addBox(m,[0,1.06,.09],[.94,.10,.03],MAT.agedWhite);
  addBox(m,[.62,.62,.05],[.46,.46,.04],MAT.brass,Math.PI*.25);       // warning diamond
}

{
  // THE ROAD PAST THE GATE. The layer between the yard and the hills: you can
  // see it, you will never stand on it, and it is what stops the middle distance
  // being a gap. Runs away west so it recedes rather than crossing the view.
  const m=mesh('yard_road'),L=34.0,y=.02;
  addBox(m,[0,y-.02,0],[L,.06,7.20],MAT.dark);                       // carriageway
  for(const z of[-3.70,3.70]) addBox(m,[0,y+.06,z],[L,.16,.34],MAT.stone);   // kerbs
  for(const z of[-4.60,4.60]) addBox(m,[0,y-.04,z],[L,.10,1.50],MAT.soil);   // verges
  for(let x=-L/2+1.2;x<L/2;x+=3.4) addBox(m,[x,y,0],[2.00,.03,.12],MAT.agedWhite);  // centre dashes
  for(const z of[-3.30,3.30]) addBox(m,[0,y,z],[L,.03,.10],MAT.agedWhite);          // edge lines
  // Two lamp columns further down it, small, to carry the perspective.
  for(const x of[-6.0,-17.0]){
    addCylinder(m,[x,3.05,4.30],.10,5.70,MAT.steel,8);
    addBeam(m,[x,5.85,4.30],[x,6.45,3.45],.09,MAT.steel);
    addBox(m,[x,6.46,3.10],[.72,.20,.28],MAT.steel);
    addBox(m,[x,6.32,3.10],[.62,.09,.24],MAT.ivory);
  }
}

{
  // THE GATE. What stands between you and the man in the booth.
  //
  // Everything else out here is haulage — chain-link, barbed wire, a skip, a
  // safety-red barrier arm. That is the yard a lorry uses, and it is right for
  // the yard. It is not right for the boundary of a British conservatory of
  // music, which is where this stands: brick piers with stone caps and a pair of
  // wrought-iron gates, standing open because they have stood open for years.
  // The railings run off both ways to meet the chain-link further out, so the
  // two registers meet at the gate rather than one replacing the other.
  //
  // Local Z runs along the boundary; the drive passes through at Z = 0. Local X
  // is depth, thin — you see this side-on from the bay, thirty metres away.
  const m=mesh('yard_gate_piers');
  const HALF=2.30;                       // half the clear opening
  for(const s of[-1,1]){
    const z=s*(HALF+.35);
    addBox(m,[0,1.35,z],[.62,2.70,.70],MAT.dark);                    // brick pier
    addBox(m,[0,2.76,z],[.78,.14,.86],MAT.stone);                    // stone cap
    addBox(m,[0,2.92,z],[.34,.22,.34],MAT.stone);                    // ball finial base
    addBox(m,[0,.10,z],[.74,.20,.82],MAT.stone);                     // plinth
  }
  // The leaves, swung back against the railings and left there. Each is a frame
  // with uprights: at this distance the gap between bars is the whole read.
  for(const s of[-1,1]){
    const hinge=s*(HALF+.02), back=s*(HALF+1.92);
    addBox(m,[.26,1.12,(hinge+back)/2],[.06,.06,Math.abs(back-hinge)],MAT.black);   // top rail
    addBox(m,[.26,.24,(hinge+back)/2],[.06,.06,Math.abs(back-hinge)],MAT.black);    // bottom rail
    for(let t=0;t<=1.001;t+=1/7){
      const z=hinge+(back-hinge)*t;
      addBox(m,[.26,.70,z],[.05,1.84,.05],MAT.black);                // upright
    }
  }
  // Railings either side, running out to meet the chain-link.
  for(const s of[-1,1]){
    const from=s*(HALF+.70), to=s*(HALF+4.40);
    addBox(m,[0,1.06,(from+to)/2],[.05,.05,Math.abs(to-from)],MAT.black);
    addBox(m,[0,.20,(from+to)/2],[.05,.05,Math.abs(to-from)],MAT.black);
    for(let z=from;s>0?z<=to:z>=to;z+=s*.42) addBox(m,[0,.66,z],[.04,1.76,.04],MAT.black);
    addBox(m,[0,.60,to],[.14,1.30,.14],MAT.black);                   // end standard
  }
}
{
  // LAUREL, GONE LEGGY. The other half of the boundary: municipal yards have
  // fences, institutions have hedges nobody has had the budget to cut since the
  // seventies. It is bare and woody at the bottom and heavy on top, which is
  // what an unpruned laurel does, and it is the one soft silhouette out here.
  const m=mesh('yard_hedge_run'),L=11.0;
  for(let z=-L/2;z<=L/2+.01;z+=.62){
    const lean=Math.sin(z*1.7)*.10, h=1.72+Math.sin(z*.9)*.20;
    addBox(m,[lean,h*.66,z],[1.34,h*.78,.74],MAT.deadLeaf);          // the mass
    addBox(m,[lean*.5,h*1.06,z+.18],[.96,.44,.58],MAT.deadLeaf);     // the crown
  }
  // The bare legs under it, and the leaf litter it has dropped on the tarmac.
  for(let z=-L/2+.3;z<=L/2;z+=.85){
    addCylinder(m,[Math.sin(z)*.12,.30,z],.055,.60,MAT.wood,6);
  }
  addBox(m,[0,.03,0],[1.90,.06,L],MAT.soil);
}

// ── THE CITY, NEAR ENOUGH TO BE GEOMETRY ─────────────────────────────────────
//
// The skyline in nightSky() (render/r3d.js) is a DIRECTION: kilometres out,
// never approached, no parallax. That is the right model for a mill chimney and
// the wrong one for the other side of the road, which is forty metres away and
// which the player walks past a lit window of.
//
// So the city is two tiers. Everything beyond about eighty-five metres is in the
// shader — MAXD in the raymarcher and FAR in the mesh pass are both 90, so there
// is nothing further out that a mesh could say. Everything nearer is here.
//
// ANCHORING. These hang off a cell in the yard and reach a long way out of it: a
// prop's render group comes from the cell it stands in (game/props.js) and its
// geometry can then go anywhere, which is how yard_road already reaches nine
// metres past the plan edge. West of physical x0 the ray leaves the plan and
// resolves as sky, so these meshes draw against the night with nothing behind
// them — which is exactly what a street on the far side of a boundary is.
//
// Local x is world x minus 8, local z is world y minus 7.5 (the road's anchor).
{
  // THE FRONTAGE OPPOSITE. Back-of-house: goods doors, no front doors, and not
  // one window a person lives behind. The conservatory is on the wrong side of
  // its own city and this is what it looks at.
  const m=mesh('city_frontage');
  // The carriageway running on west, past where yard_road stops.
  addBox(m,[-34.0,0.0,0],[46.0,.06,7.20],MAT.dark);
  for(const z of[-3.70,3.70]) addBox(m,[-34.0,.06,z],[46.0,.16,.34],MAT.stone);
  for(let x=-14.0;x>-56.0;x-=3.4) addBox(m,[x,.02,0],[2.00,.03,.12],MAT.agedWhite);
  // The cross street it runs into, and the pavement round the corner.
  addBox(m,[-25.0,0.0,-14.0],[7.0,.06,44.0],MAT.dark);
  for(const x of[-28.8,-21.2]) addBox(m,[x,.06,-14.0],[.34,.16,44.0],MAT.stone);

  // The wall. Twelve-metre units, each with its own height and its own roof, so
  // the run reads as buildings that were put up separately rather than as one
  // extrusion. Unit 3 is the tall one and it carries the sign.
  const UNITS=[
    {z:-26.0,w:12.0,h:8.6,  gable:true },
    {z:-14.0,w:12.0,h:7.4,  gable:false},
    {z: -1.0,w:14.0,h:11.2, gable:true },
    {z: 12.0,w:12.0,h:8.0,  gable:false},
    {z: 25.0,w:14.0,h:9.4,  gable:true },
    {z: 39.0,w:12.0,h:7.0,  gable:false},
  ];
  const FX=-28.0;                      // the face of the wall, in local x
  for(const u of UNITS){
    // BRICK, NOT PLASTER. An earlier pass built this out of MAT.plaster, which is
    // the conservatory's own pale render at 0.63 luma — from the middle of the
    // yard the far side of the road came back as a lit hoarding forty-five metres
    // wide. Back-of-house in a mill town is dark red brick and it is soaked.
    addBox(m,[FX-2.2,u.h/2,u.z],[4.4,u.h,u.w],MAT.dark);             // the mass
    addBox(m,[FX+.04,u.h/2,u.z],[.12,u.h,u.w],MAT.soil);             // the face
    addBox(m,[FX-.10,1.05,u.z],[.60,2.10,u.w],MAT.stone);            // plinth course
    addBox(m,[FX-.16,u.h+.16,u.z],[.90,.32,u.w+.30],MAT.stone);      // eaves/coping
    if(u.gable){
      // A pitched end on. Two raking boxes meeting over the middle, and the
      // ridge line that says slate.
      const rise=2.4;
      for(const s of[-1,1]){
        addBeam(m,[FX-2.2,u.h,u.z+s*u.w/2],[FX-2.2,u.h+rise,u.z],1.9,MAT.black);
      }
      addBox(m,[FX-2.2,u.h+rise+.05,u.z],[2.2,.14,.34],MAT.stone);
      addBox(m,[FX-2.2,u.h+rise*.55,u.z],[.10,rise*1.1,u.w*.99],MAT.dark);
      // A stack on the ridge.
      addBox(m,[FX-2.2,u.h+rise+.95,u.z-u.w*.30],[.90,1.90,1.30],MAT.dark);
      for(const dz of[-.34,.34]) addCylinder(m,[FX-2.2,u.h+rise+2.10,u.z-u.w*.30+dz],.13,.62,MAT.stone,8);
    } else {
      addBox(m,[FX-2.2,u.h+.55,u.z],[4.0,.24,u.w*.96],MAT.black);    // flat roof, felt
    }
    // A goods door with the shutter down, and the guide channels either side.
    addBox(m,[FX-.14,1.85,u.z],[.30,3.50,3.60],MAT.steel);
    for(let y=.30;y<3.50;y+=.22) addBox(m,[FX-.30,y,u.z],[.10,.09,3.60],MAT.steel);
    for(const dz of[-1.90,1.90]) addBox(m,[FX-.26,1.95,u.z+dz],[.22,3.80,.24],MAT.steel);
    // Two blind windows over it, boarded. Nothing on this street is lit except
    // what the lodge and the street lamps are lighting.
    if(u.h>7.0) for(const dz of[-3.0,3.0]){
      addBox(m,[FX-.12,5.60,u.z+dz],[.26,1.60,1.10],MAT.black);
      addBox(m,[FX-.22,5.60,u.z+dz],[.08,1.44,.96],MAT.wood);        // the boarding
      addBox(m,[FX+.02,6.50,u.z+dz],[.42,.18,1.35],MAT.stone);
    }
  }
  // THE GHOST SIGN. Painted straight onto the brick of the tall unit, half gone,
  // and the last thing anybody bothered to say about this street.
  // Faded paint, not a billboard: it wants to be legible as a rectangle of
  // something-was-written-here and nothing more. An earlier pass had it nine
  // metres of aged white and it read from the yard as a lit hoarding.
  addBox(m,[FX-.16,8.30,-1.6],[.10,1.80,6.00],MAT.paper);
  addBox(m,[FX-.20,8.30,-3.9],[.06,1.94,1.30],MAT.soil);             // where it has flaked
  addBox(m,[FX-.20,7.70,0.6],[.06,.80,2.10],MAT.soil);

  // Street lamps down the far pavement, on the road's own supply. Their heads
  // are ivory rather than emissive: the light itself is a local light on the rig
  // (conservatory-lights.js), which the renderer takes only eight of.
  for(const z of[-20.0,-4.0,12.0,28.0]){
    addCylinder(m,[FX+2.6,3.10,z],.10,5.80,MAT.steel,8);
    addBeam(m,[FX+2.6,5.90,z],[FX+3.5,6.50,z],.09,MAT.steel);
    addBox(m,[FX+3.9,6.50,z],[.76,.20,.30],MAT.steel);
    addBox(m,[FX+3.9,6.36,z],[.66,.09,.26],MAT.ivory);
  }
  // Bollards along the corner, and the bins nobody has taken in.
  for(let z=-30.0;z<=-16.0;z+=2.2) addCylinder(m,[FX+3.4,.42,z],.09,.84,MAT.black,6);
  for(const [x,z] of[[FX+3.0,6.2],[FX+3.5,7.4],[FX+2.9,20.0]]){
    addBox(m,[x,.58,z],[.72,1.10,.62],MAT.dark);
    addBox(m,[x,1.18,z],[.78,.10,.68],MAT.black);
    for(const dz of[-.26,.26]) addCylinder(m,[x-.30,.12,z+dz],.11,.10,MAT.black,6);
  }
}
{
  // HIS VAN, WHICH IS WHERE THE GAME STARTS.
  //
  // The first frame used to be a man standing on a road with a bag he had always
  // had, facing whichever way faceOpenDirection happened to pick. He drove here.
  // The kit came out of something. So the fade comes up on the back of his own
  // van with the doors open and the interior lamp on, and the first [E] in the
  // game is shouldering the bag — an interaction with nothing at stake, before
  // anything is at stake, which is the only lesson the opening needs to teach.
  //
  // Local +z is out of the back doors. It is parked nose-in to the kerb, so the
  // doors face the way he walks.
  const m=mesh('yard_van');
  const bodyL=5.10, bodyW=2.00, floorY=.62, roofY=2.52;
  // Chassis and wheels.
  for(const [dx,dz] of[[-.86,-1.62],[.86,-1.62],[-.86,1.52],[.86,1.52]]){
    addCylinder(m,[dx,.34,dz],.34,.22,MAT.black,10);
  }
  addBox(m,[0,.50,0],[1.86,.24,bodyL-.5],MAT.black);
  // The box: sides, roof, and the cab end.
  for(const dx of[-bodyW/2,bodyW/2]) addBox(m,[dx,(floorY+roofY)/2,.35],[.09,roofY-floorY,bodyL-.9],MAT.agedWhite);
  addBox(m,[0,roofY,.35],[bodyW,.10,bodyL-.9],MAT.agedWhite);
  addBox(m,[0,floorY,.35],[bodyW,.10,bodyL-.9],MAT.dark);            // load floor
  addBox(m,[0,1.62,-2.10],[bodyW,1.90,.12],MAT.agedWhite);           // bulkhead
  // THE CAB. This used to be one rectangular block with a glass rectangle and
  // two ivory boxes on it. It described "van" from the side and became a flat
  // low-poly face the moment the player walked around the open rear doors.
  // Keep the established load box and footprint, but give the front an actual
  // forward-control cab: tapered shell, raked split screen, pressed nose,
  // recessed lamps and grille, seams, mirrors, wipers and working hardware.
  const cabRing=(z,{w=.98,y0=.60,shoulder=1.24,roof=2.18}={})=>[
    [-w*.80,y0,z],[w*.80,y0,z],[w,y0+.15,z],[w,shoulder,z],
    [w*.72,roof,z],[-w*.72,roof,z],[-w,shoulder,z],[-w,y0+.15,z],
  ];
  addLoft(m,[
    cabRing(-2.10,{w:1.00,y0:.58,shoulder:1.34,roof:2.40}),
    cabRing(-2.72,{w:.99,y0:.58,shoulder:1.29,roof:2.27}),
    cabRing(-3.08,{w:.94,y0:.58,shoulder:1.22,roof:2.10}),
  ],MAT.agedWhite);

  // A pressed lower nose whose chamfered shoulders catch a silhouette even in
  // the one-bit renderer. It stops inside the old z=-3.42 bound.
  const noseRing=(z,w,y0,y1)=>[
    [-w*.78,y0,z],[w*.78,y0,z],[w,y0+.13,z],[w,y1-.13,z],
    [w*.78,y1,z],[-w*.78,y1,z],[-w,y1-.13,z],[-w,y0+.13,z],
  ];
  addLoft(m,[noseRing(-2.96,.98,.55,1.26),noseRing(-3.39,.91,.55,1.20)],MAT.agedWhite);

  // Sloped split windscreen. Both faces are authored because the cab interior
  // remains visible through the open rear and the project materials are not
  // assumed double-sided.
  const screen=(a,b,c,d)=>{addQuad(m,a,b,c,d,MAT.roofGlass);addQuad(m,d,c,b,a,MAT.roofGlass);};
  screen([-.82,1.28,-3.315],[-.055,1.28,-3.315],[-.055,2.015,-3.105],[-.66,2.015,-3.105]);
  screen([.055,1.28,-3.315],[.82,1.28,-3.315],[.66,2.015,-3.105],[.055,2.015,-3.105]);
  addBeam(m,[-.91,1.24,-3.33],[-.71,2.08,-3.09],.055,MAT.black);
  addBeam(m,[.91,1.24,-3.33],[.71,2.08,-3.09],.055,MAT.black);
  addBeam(m,[-.71,2.08,-3.09],[.71,2.08,-3.09],.055,MAT.black);
  addBeam(m,[0,1.25,-3.34],[0,2.07,-3.10],.045,MAT.black);
  addBeam(m,[-.83,1.25,-3.34],[.83,1.25,-3.34],.055,MAT.black);
  // Wipers park asymmetrically instead of reading as another grille.
  addBeam(m,[-.55,1.31,-3.355],[-.08,1.68,-3.255],.025,MAT.black);
  addBeam(m,[.57,1.31,-3.355],[.10,1.61,-3.275],.025,MAT.black);
  for(const dx of[-.55,.57])addCylinder(m,[dx,1.29,-3.36],.035,.035,MAT.steel,8);

  // Side glass is trapezoidal and inset behind a real door frame. The old long
  // glass boxes made the cab look like a glazed crate from either three-quarter.
  const sideWindow=(s)=>{
    const x=s*.995;
    const points=[[x,1.29,-3.18],[x,1.30,-2.42],[x,2.18,-2.31],[x,2.02,-3.02]];
    if(s>0)screen(points[0],points[1],points[2],points[3]);
    else screen(points[3],points[2],points[1],points[0]);
    addBeam(m,[x,1.25,-3.23],[x,2.22,-3.05],.045,MAT.black);
    addBeam(m,[x,2.22,-3.05],[x,2.24,-2.25],.045,MAT.black);
    addBeam(m,[x,1.25,-2.35],[x,2.24,-2.25],.045,MAT.black);
    addBeam(m,[x,1.25,-3.23],[x,1.25,-2.35],.045,MAT.black);
    // Door press line, gutter and handle.
    addBeam(m,[s*1.008,.64,-2.34],[s*1.008,2.30,-2.22],.025,MAT.black);
    addBeam(m,[s*1.02,2.34,-3.05],[s*1.02,2.38,-2.17],.035,MAT.steel);
    addBox(m,[s*1.025,1.15,-2.48],[.035,.055,.28],MAT.black);
  };
  sideWindow(-1);sideWindow(1);

  // Front fascia: a dark recess with individual slats and housings, not marks
  // painted on the same plane as the body.
  addBox(m,[0,.83,-3.425],[1.20,.34,.055],MAT.black);
  for(let y=.70;y<=.96;y+=.065)addBox(m,[0,y,-3.465],[1.04,.025,.035],MAT.steel);
  for(const s of[-1,1]){
    addBox(m,[s*.68,.92,-3.43],[.43,.28,.07],MAT.black);
    addBox(m,[s*.68,.94,-3.475],[.31,.17,.035],MAT.ivory);
    addBox(m,[s*.86,.78,-3.47],[.12,.13,.035],MAT.brass);
  }
  addBox(m,[0,.48,-3.45],[1.96,.15,.13],MAT.steel);                 // bumper
  addBox(m,[0,.34,-3.43],[1.56,.12,.08],MAT.black);                 // valance
  addBox(m,[0,.58,-3.525],[.53,.13,.025],MAT.ivory);                // plate
  addBox(m,[0,1.10,-3.43],[.16,.06,.035],MAT.brass);                // maker badge
  addRingBeam(m,[.44,.35,-3.53],.095,.025,MAT.steel,10);            // tow eye

  // Mirrors on long work-van arms, plus the small roof and bonnet seams which
  // make a front feel assembled rather than extruded.
  for(const s of[-1,1]){
    addBeam(m,[s*.94,1.73,-2.94],[s*1.26,1.73,-3.10],.035,MAT.steel);
    addBox(m,[s*1.30,1.73,-3.11],[.12,.34,.25],MAT.black,s*.08);
    addBox(m,[s*1.29,1.73,-3.125],[.025,.27,.19],MAT.steel,s*.08);
  }
  addBeam(m,[-.70,2.09,-3.09],[.70,2.09,-3.09],.045,MAT.steel);
  addBeam(m,[-.78,1.21,-3.405],[.78,1.21,-3.405],.025,MAT.black);
  // THE BACK DOORS, standing open. Each swung out about a hundred degrees, which
  // is what makes the silhouette read as "somebody is unloading" from the gate.
  const doorYaw=1.75, doorHalf=.04;
  for(const s of[-1,1]){
    addBox(m,[s*(bodyW/2+.42),1.57,2.62],[.86,1.86,.08],MAT.agedWhite,s*doorYaw);
    addBox(m,[s*(bodyW/2+.10),1.57,2.34],[.10,.30,.10],MAT.steel);   // hinge
  }
  // A POINT ON A DOOR LEAF, which is the whole fix here.
  //
  // The plate, the chevrons and the tail lamps used to be authored on the rear
  // plane at z≈2.57, spanning x=-0.82..+0.82 — the geometry of a van with its
  // doors SHUT. The doors are open, so all of it hung in the middle of the two
  // metre aperture attached to nothing, in front of the load space, which is why
  // the back of the van could not be read at all.
  //
  // addBox rotates local +x to (cos a, 0, sin a) and local +z to (-sin a, 0, cos a),
  // so the leaf's OUTER face is local -z. u runs along the leaf, v is height.
  // face: 1 is the leaf's outer skin, -1 the inner.
  const leaf=(s,u,v,face=1)=>{
    const a=s*doorYaw, c=Math.cos(a), sn=Math.sin(a), out=(doorHalf+.012)*face;
    return [s*(bodyW/2+.42)+c*u+sn*out, 1.57+v, 2.62+sn*u-c*out];
  };
  // The reflective chevrons every site van has, on the outside of both leaves —
  // which is also what makes the open doors read as a van from the gate rather
  // than as two white panels.
  // Chevrons on BOTH faces. Outside is where a real van carries them and what
  // makes the shut doors read from the gate; inside is what the player actually
  // walks up to, and a blank leaf tells them nothing about what they are looking
  // at. Vans carry reflective strips inboard for exactly the same reason.
  for(const s of[-1,1]){
    for(const face of[1,-1]){
      for(let i=-1;i<=1;i++){
        addBox(m,leaf(s,i*.26,0,face),[.13,1.24,.02],i?MAT.safetyRed:MAT.ivory,s*doorYaw);
      }
    }
    // The plate goes on one leaf, low, the way a real pair of doors carries it.
    if(s<0) addBox(m,leaf(s,0,-.62,1),[.50,.11,.02],MAT.ivory,s*doorYaw);
  }
  // Rear corner posts, so the aperture has an edge and the lamps have something
  // to be mounted ON. The body's sides sit at x=±1.0 and end at z=2.45; the lamps
  // stand PROUD of the posts at 2.52 — inset even slightly and they read as two
  // red strips loose inside the load bay rather than as lamps on the corners.
  for(const dx of[-.955,.955]){
    addBox(m,[dx,1.57,2.42],[.10,1.90,.10],MAT.agedWhite);
    addBox(m,[dx,1.02,2.52],[.12,.34,.06],MAT.safetyRed);            // tail lamp
  }

  // THE LOAD SPACE. The first [E] in the game is shouldering the bag off this
  // shelf, and takeTheBag() names what comes off it — recorder, torch,
  // headphones, radio, the order folded twice in the side pocket. It was a shelf
  // and a blanket, which is not a van somebody works out of.
  // The shelf is HALF DEPTH and set back. Full depth made the load bay one flat
  // plane from the doors to the bulkhead, so nothing under it could be seen and
  // the interior read as a solid box with a lid.
  const floorTop=floorY+.05;
  addBox(m,[0,1.06,1.42],[1.70,.06,.96],MAT.wood);                   // the shelf
  for(const dx of[-.78,.78]) addBox(m,[dx,.86,1.42],[.07,.46,.90],MAT.steel);  // its legs
  addBox(m,[-.52,1.20,1.60],[.52,.22,.52],MAT.cloth);                // a folded blanket
  // Where the bag has been sitting long enough to leave a clean rectangle.
  addBox(m,[.30,1.10,1.34],[.44,.01,.34],MAT.black);
  // On the floor, in front of the shelf, where they can actually be seen.
  addCylinder(m,[.50,floorTop+.15,.62],.24,.30,MAT.steel,12);        // a cable drum
  addBox(m,[-.54,floorTop+.21,.72],[.50,.42,.44],MAT.wood);          // a crate
  addBox(m,[-.56,floorTop+.13,1.62],[.42,.26,.30],MAT.steel);        // toolbox
  addBox(m,[.44,floorTop+.05,1.20],[.56,.10,.30],MAT.cloth);         // a coiled strap
}
{
  // The dome lamp in the back of it. Its own prop so it can be emissive and so
  // it can be taken away on the frame he shoulders the bag — the light going out
  // behind him is the whole reason the beat exists.
  const m=mesh('yard_van_lamp');
  addBox(m,[0,0,0],[.34,.10,.20],MAT.ivory);
  addBox(m,[0,.07,0],[.38,.05,.24],MAT.steel);
}
{
  // The addressable shelter bench. It is separate from the shelter mesh so the
  // object-guidance pass can light the seat itself and [E] can sit on it.
  const m=mesh('yard_look_bench');
  for(const x of[-.24,-.08,.08,.24])addBox(m,[x,.57,0],[.13,.075,3.18],MAT.wood);
  for(const y of[.77,.94,1.09])addBox(m,[-.31,y,0],[.075,.13,3.18],MAT.wood);
  for(const z of[-1.38,1.38]){
    addBox(m,[-.17,.30,z],[.10,.54,.10],MAT.steel);
    addBox(m,[.22,.30,z],[.10,.54,.10],MAT.steel);
    addBeam(m,[-.31,.52,z],[.34,.72,z],.07,MAT.steel);
    addBeam(m,[-.31,.55,z],[-.31,1.14,z],.07,MAT.steel);
  }
  addBeam(m,[-.31,1.18,-1.50],[-.31,1.18,1.50],.055,MAT.steel);
  addBeam(m,[.33,.60,-1.50],[.33,.60,1.50],.045,MAT.steel);
}
{
  // THE BUS SHELTER, on the near pavement, with one tube alive in it. It is the
  // last thing between the gate and the rest of the world, and if he had missed
  // the last one this is where he would be standing.
  const m=mesh('city_bus_shelter');
  addBox(m,[0,.07,0],[2.60,.14,4.60],MAT.stone);
  for(const [dx,dz] of[[-1.20,-2.20],[-1.20,2.20],[1.20,-2.20],[1.20,2.20]]){
    addBox(m,[dx,1.24,dz],[.12,2.48,.12],MAT.steel);
  }
  addBox(m,[-1.22,1.35,0],[.10,2.20,4.40],MAT.roofGlass);            // back panel
  for(const dz of[-2.24,2.24]) addBox(m,[0,1.35,dz],[2.40,2.20,.10],MAT.roofGlass);
  addBox(m,[0,2.56,0],[2.90,.14,5.00],MAT.steel);                    // canopy
  addBox(m,[0,2.40,0],[2.40,.10,4.20],MAT.ivory);                    // the tube in it
  addBox(m,[1.28,1.45,-1.20],[.10,1.30,1.10],MAT.agedWhite);         // the timetable case
}
{
  // THE FOUNTAIN, in the middle of the park's crossing paths.
  //
  // Municipal, tiered, and — this is the point of it — STILL RUNNING. Nothing
  // else on this site works. The corporation that put it up in the 1880s paid
  // for a supply that was never on the building's meter, so when Ellery was
  // closed and the power was cut, the one machine nobody switched off went on
  // playing to an empty park. It is the only moving thing outdoors.
  //
  // THE BASIN FLOOR IS NOT HERE. It is authored in the plan as a glyph 0.30m
  // down in `wetTile` — that zone-and-material pair is the address the water
  // pass looks a body up by (see game/water-bodies.js). Modelling a basin here
  // as well would put a stone lid over the water. What this mesh owes the scene
  // is everything ABOVE that surface: the kerb you step over, the two bowls, and
  // the water in the air between them.
  //
  // Eight sides rather than sixteen, because an octagon is what a Victorian
  // corporation actually built and because the flats catch the light as facets
  // instead of averaging into a cylinder.
  const m=mesh('park_fountain');
  const SIDES=8, R=3.30, DROP=-.30;
  const oct=(i)=>((i+.5)/SIDES)*Math.PI*2;
  const seg=(r)=>r*2*Math.tan(Math.PI/SIDES)+.06;
  // A ring laid FLAT. addRingBeam draws in the XY plane and addRingBeamYZ in the
  // YZ plane — both vertical — so a moulding round a bowl needs its own. Every
  // one of these was a hoop standing on edge over the fountain until it did.
  const ringXZ=(y,radius,section,mat,segments=20)=>{
    for(let i=0;i<segments;i++){
      const a=(i/segments)*Math.PI*2;
      addBox(m,[Math.cos(a)*radius,y,Math.sin(a)*radius],
        [section,section,radius*2*Math.tan(Math.PI/segments)+section*.5],mat,a);
    }
  };

  // ── the kerb, and the step down into it ──────────────────────────────────
  for(let i=0;i<SIDES;i++){
    const a=oct(i), cx=Math.cos(a)*R, cz=Math.sin(a)*R;
    addBox(m,[cx,DROP+.38,cz],[.42,.76,seg(R)],MAT.stone,a);            // kerb
    addBox(m,[cx,.47,cz],[.56,.14,seg(R)+.06],MAT.plaster,a,(i%3===0?.015:0)); // coping, a little uneven
    addBox(m,[Math.cos(a)*(R-.30),DROP+.10,Math.sin(a)*(R-.30)],[.22,.20,seg(R-.30)],MAT.stone,a); // inner offset
    // A corner pier on the alternate flats, with a weathered cap.
    if(i%2===0){
      const px=Math.cos(a)*(R+.16), pz=Math.sin(a)*(R+.16);
      addBox(m,[px,.30,pz],[.46,1.40,.46],MAT.stone,a);
      addBox(m,[px,1.04,pz],[.60,.14,.60],MAT.plaster,a);
      addEllipsoid(m,[px,1.20,pz],[.19,.20,.19],MAT.stone,6,8);
    }
  }

  // ── the pedestal ─────────────────────────────────────────────────────────
  addCylinder(m,[0,DROP+.16,0],1.05,.32,MAT.stone,SIDES);               // sunk plinth
  addCylinder(m,[0,DROP+.40,0],.86,.20,MAT.plaster,SIDES);              // torus course
  ringXZ(DROP+.52,.80,.09,MAT.stone,16);
  addCylinder(m,[0,.42,0],.52,1.20,MAT.stone,12);                       // the shaft
  // Fluting: twelve reeds up the shaft. This is most of the intricacy read at
  // arm's length, and it costs twelve boxes.
  for(let i=0;i<12;i++){
    const a=(i/12)*Math.PI*2;
    addBox(m,[Math.cos(a)*.53,.42,Math.sin(a)*.53],[.09,1.14,.09],MAT.plaster,a);
  }
  ringXZ(1.02,.60,.07,MAT.stone,16);                                    // astragal

  // ── the lower bowl ───────────────────────────────────────────────────────
  const LOW_Y=1.34, LOW_R=1.58;
  addCylinder(m,[0,LOW_Y-.22,0],LOW_R*.42,.34,MAT.stone,12);            // the cup under it
  addCylinder(m,[0,LOW_Y,0],LOW_R,.20,MAT.plaster,SIDES*2);
  ringXZ(LOW_Y+.11,LOW_R-.03,.10,MAT.stone,24);                         // the lip water runs over
  // Gadroons round the underside — the lobed ornament that makes a bowl read as
  // carved rather than turned.
  for(let i=0;i<20;i++){
    const a=(i/20)*Math.PI*2;
    addEllipsoid(m,[Math.cos(a)*(LOW_R*.78),LOW_Y-.16,Math.sin(a)*(LOW_R*.78)],[.15,.11,.22],MAT.plaster,6,8);
  }
  // Four mask spouts on the cardinals, spitting inward and down.
  for(let i=0;i<4;i++){
    const a=(i/4)*Math.PI*2, mx=Math.cos(a)*(LOW_R-.06), mz=Math.sin(a)*(LOW_R-.06);
    addEllipsoid(m,[mx,LOW_Y+.02,mz],[.17,.20,.14],MAT.plaster,7,9);
    addCylinder(m,[mx,LOW_Y-.06,mz],.045,.16,MAT.bronze,8);
  }

  // ── the upper bowl and the finial ────────────────────────────────────────
  addCylinder(m,[0,LOW_Y+.62,0],.30,1.00,MAT.stone,10);                 // upper shaft
  ringXZ(LOW_Y+1.06,.34,.06,MAT.stone,14);
  const UP_Y=2.36, UP_R=.92;
  addCylinder(m,[0,UP_Y-.16,0],UP_R*.44,.26,MAT.stone,10);
  addCylinder(m,[0,UP_Y,0],UP_R,.15,MAT.plaster,SIDES*2);
  ringXZ(UP_Y+.08,UP_R-.03,.08,MAT.stone,20);
  for(let i=0;i<14;i++){
    const a=(i/14)*Math.PI*2;
    addEllipsoid(m,[Math.cos(a)*(UP_R*.76),UP_Y-.12,Math.sin(a)*(UP_R*.76)],[.10,.08,.15],MAT.plaster,6,8);
  }
  addCylinder(m,[0,UP_Y+.34,0],.17,.52,MAT.stone,10);                   // the stem
  addEllipsoid(m,[0,UP_Y+.68,0],[.20,.24,.20],MAT.plaster,8,10);        // the knop
  addCylinder(m,[0,UP_Y+.88,0],.055,.16,MAT.bronze,10);                 // the nozzle

  // ── THE WATER IN THE AIR ─────────────────────────────────────────────────
  //
  // Not fluid — geometry. A jet standing off the nozzle, and the sheets falling
  // bowl to bowl and bowl to basin. roofGlass is the one translucent material in
  // the palette, so it is what water is made of here.
  //
  // The falls are drawn as a few tapering elements rather than one column: a
  // single cylinder reads as a glass rod, and three stepped ones read as
  // something that is moving even before anything animates it.
  const JET_Y=UP_Y+.96;
  for(let i=0;i<5;i++){
    const t=i/5;
    addCylinder(m,[0,JET_Y+.34+t*1.05,0],.052-t*.030,.42,MAT.roofGlass,8);
  }
  addEllipsoid(m,[0,JET_Y+1.62,0],[.11,.16,.11],MAT.roofGlass,6,8);     // the break at the top
  // Upper bowl → lower bowl, off the lip on four sides.
  for(let i=0;i<4;i++){
    const a=(i/4)*Math.PI*2+.39;
    const x=Math.cos(a)*(UP_R-.10), z=Math.sin(a)*(UP_R-.10);
    addBox(m,[x,(UP_Y+LOW_Y)/2+.08,z],[.20,UP_Y-LOW_Y-.18,.055],MAT.roofGlass,a);
  }
  // Lower bowl → basin, off the mask spouts.
  for(let i=0;i<4;i++){
    const a=(i/4)*Math.PI*2;
    const x=Math.cos(a)*(LOW_R-.08), z=Math.sin(a)*(LOW_R-.08);
    addBox(m,[x,(LOW_Y+DROP)/2+.02,z],[.26,LOW_Y-DROP-.20,.06],MAT.roofGlass,a);
  }
  // And the disturbance where each fall lands, so the surface is never a mirror.
  for(let i=0;i<4;i++){
    const a=(i/4)*Math.PI*2;
    const fx=Math.cos(a)*(LOW_R-.08), fz=Math.sin(a)*(LOW_R-.08);
    for(const [rr,ss] of [[.30,.035],[.52,.025]]){
      for(let k=0;k<12;k++){
        const t=(k/12)*Math.PI*2;
        addBox(m,[fx+Math.cos(t)*rr,DROP+.055,fz+Math.sin(t)*rr],[ss,ss,rr*2*Math.tan(Math.PI/12)],MAT.roofGlass,t);
      }
    }
  }

  // Silt and leaf litter, banked to one side the way it settles. A working
  // fountain in a closed park is still a neglected one — nobody has been out
  // here with a net since the building shut.
  for(let i=0;i<17;i++){
    const a=(i*2.399), r=.95+((i*7)%9)/9*1.95;
    addBox(m,[Math.cos(a)*r,DROP+.015,Math.sin(a)*r],[.22+(i%3)*.07,.02,.14],i%3===0?MAT.soil:MAT.deadLeaf,a);
  }
}
{
  // THE EYES IN THE WATER.
  //
  // Two marble eyes, face up under a working fountain. Not a head — the head is
  // upstairs on its plinth in the academic gallery, and it has a jaw and part of
  // a mouth and no eyes. Somebody took the eyes out of it and put them in a
  // basin across the yard, which is a thing you do to a face you do not want
  // looking at you.
  //
  // THEY ARE MEANT TO READ AS PENNIES FIRST. Small, pale, convex, lying among
  // coins in a municipal fountain — which is exactly what two round white things
  // in a wishing well look like until you are close enough to see that they are
  // not stamped. So: coin-scale, coin-thickness, and a scatter of actual coins
  // around them doing the misdirection.
  const m=mesh('park_marble_eyes');
  // The eyes. Domed, not discs — the iris is cut, and the dome is what stops
  // them being coins once the torch is actually on them.
  for(const [x,z,yaw] of[[-.055,-.02,.22],[.058,.03,-.14]]){
    addCylinder(m,[x,.012,z],.037,.024,MAT.plaster,12);            // the ball, sunk in silt
    addEllipsoid(m,[x,.028,z],[.036,.020,.036],MAT.plaster,7,10);  // the dome
    addCylinder(m,[x,.041,z],.014,.006,MAT.stone,10,yaw);          // the cut iris
  }
  // The coins they are lying among. This is the whole trick and it costs eight
  // cylinders: without them the eyes are two odd white objects, and with them
  // they are two of the pennies until you look properly.
  for(let i=0;i<8;i++){
    const a=(i*2.399), r=.10+((i*5)%7)/7*.30;
    addCylinder(m,[Math.cos(a)*r,.006,Math.sin(a)*r],.026,.008,i%3===0?MAT.stone:MAT.bronze,10);
  }
}
function buildStreetCar(name,{moving=false,body=MAT.dark}={}){
  const m=mesh(name);
  addBox(m,[0,.58,.02],[1.84,.54,4.34],body);                         // sill and lower body
  addBox(m,[0,.81,-1.48],[1.76,.34,1.30],body,0,-.055);              // bonnet
  addBox(m,[0,.79,1.61],[1.72,.31,.92],body,0,.04);                  // boot
  addBox(m,[0,1.20,-.18],[1.58,.48,1.92],body);                      // passenger cell
  addBox(m,[0,1.43,-.10],[1.28,.16,1.34],body);                      // roof crown
  addBox(m,[0,1.19,-1.16],[1.42,.47,.075],MAT.roofGlass,0,-.35);     // raked windscreen
  addBox(m,[0,1.18,.86],[1.40,.42,.075],MAT.roofGlass,0,.29);        // rear glass
  for(const x of[-.805,.805]){
    addBox(m,[x,1.20,-.20],[.065,.38,1.62],MAT.roofGlass);
    addBox(m,[x,1.12,-1.04],[.19,.13,.28],body,.16*Math.sign(x));     // mirrors
  }
  for(const [x,z]of[[-.88,-1.39],[.88,-1.39],[-.88,1.43],[.88,1.43]]){
    addCylinderX(m,[x,.35,z],.33,.22,MAT.black,16);
    addCylinderX(m,[x+(x<0?-.025:.025),.35,z],.16,.026,MAT.steel,12);
  }
  addBox(m,[0,.60,-2.19],[1.20,.18,.06],MAT.black);                  // grille
  for(const x of[-.62,.62])addBox(m,[x,.76,-2.205],[.40,.21,.075],moving?MAT.warmWindow:MAT.ivory);
  addBox(m,[0,.49,-2.22],[.62,.12,.055],MAT.ivory);                  // front plate
  for(const x of[-.62,.62])addBox(m,[x,.77,2.20],[.35,.20,.075],MAT.safetyRed);
  addBox(m,[0,.50,2.22],[.62,.12,.055],MAT.ivory);                   // rear plate
  // Door gaps, handles and bumpers are small, but together stop the vehicle
  // reading as two dark boxes sliding down a spline.
  for(const x of[-.925,.925]){
    for(const z of[-.72,.72])addBox(m,[x,.84,z],[.025,.035,1.18],MAT.black);
    for(const z of[-.62,.64])addBox(m,[x,1.00,z],[.030,.055,.22],MAT.brass);
  }
  addBox(m,[0,.40,-2.22],[1.74,.11,.08],MAT.steel);
  addBox(m,[0,.41,2.22],[1.72,.11,.08],MAT.steel);
}

// Parked cars retain reflective lenses; live traffic gets emissive warm-glass
// headlamps and a separately authored, more articulated road-car mesh.
buildStreetCar('city_parked_car',{moving:false,body:MAT.dark});
buildStreetCar('city_moving_car',{moving:true,body:MAT.terracotta});

// ── BASEBOARDS ───────────────────────────────────────────────────────────────
//
// Generated from the compiled floorplan, which is the only way this can be
// attached. The previous attempt (addSecondPerimeterWall, above) built a second
// wall from hand-typed axis/plane/spans values, so it did not know where the
// real wall was and did not sit on one — its lower courses are switched off in
// the atrium with a comment about them "reading as wainscoting", which is what a
// base course looks like when it is floating.
//
// Here every segment takes its position, its base height, its material and its
// space from the same per-cell data the raymarch uses. Nothing is typed.
//
// THE TRAP IS SPACES. Walls are drawn in a per-cell PHYSICAL frame, and on an
// arc logicalToPhysical rotates along the tangent, so a logically straight run
// can be physically curved. wallRuns already refuses to merge across an arc, a
// step, a render group or a material; this then merges again in PHYSICAL space
// and only where the cells really are contiguous and collinear, so a space whose
// mapping jumps cannot be bridged either.
const BASEBOARD = { height:0.115, proud:0.035, mesh:(g)=>`baseboard_${g}` };
const baseboardAnchors = {};
let baseboardPlanHash = '';
{
  FP.compile(conservatory.levels,{
    width:conservatory.width, height:conservatory.height,
    widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors||[], edgePortals:conservatory.edgePortals||[],
    doors:conservatory.doors||[],
  });
  const plan={size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,
    materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};

  // Skirting takes the room's own material, so a timber hall does not get the
  // chapel's stone. Anything unlisted is painted plaster, which is what most of
  // this building actually has.
  const skirtingMat=(m)=>m===MATERIAL.wood?MAT.wood
    :m===MATERIAL.chapel?MAT.stone
    :m===MATERIAL.pool||m===MATERIAL.wet?MAT.ivory
    :m===MATERIAL.metal||m===MATERIAL.acoustic?MAT.steel
    :MAT.plaster;

  const runs=wallRuns(plan);
  // THE STALENESS GUARD. The floorplan is edited constantly, sometimes by
  // somebody else, and baked skirting that no longer matches its wall is the old
  // bug wearing a new hat. Hash the RUNS rather than the source files: they are
  // exactly the input this geometry is a function of, so the hash moves when and
  // only when the baseboards would actually come out different.
  baseboardPlanHash=crypto.createHash('sha256').update(wallRunsDigest(runs)).digest('hex');
  const byGroup=new Map();
  for(const r of runs){
    if(!r.renderGroup)continue;
    if(!byGroup.has(r.renderGroup))byGroup.set(r.renderGroup,[]);
    byGroup.get(r.renderGroup).push(r);
  }

  let emitted=0;
  for(const [group,groupRuns] of byGroup){
    // The anchor is a real cell in this group, so the mesh hangs off a position
    // the prop system already resolves; vertices are relative to it.
    const first=groupRuns[0].cells[0];
    const anchor=FP.logicalToPhysical(first.x,first.y);
    baseboardAnchors[group]={mesh:BASEBOARD.mesh(group),anchor:{x:first.x,y:first.y}};
    const m=mesh(BASEBOARD.mesh(group));
    for(const r of groupRuns){
      // THE NORMAL HAS TO BE MEASURED IN PHYSICAL SPACE, not carried over from
      // the logical grid. A space's mapping can be rotated, in which case the
      // logical normal points somewhere else entirely once it is drawn — which
      // put skirting in the middle of the box-office floor the first time.
      // Step one cell INTO the room and see which way that actually went.
      const physNormal=(c)=>{
        const inX=c.x+r.nx, inY=c.y+r.ny;
        if(FP.isSolid(inX,inY))return {nx:r.nx,ny:r.ny};
        const a=FP.logicalToPhysical(c.x,c.y), b=FP.logicalToPhysical(inX,inY);
        const dx=b.x-a.x, dz=b.z-a.z;
        if(Math.abs(dx)+Math.abs(dz)<1e-6)return {nx:r.nx,ny:r.ny};
        return Math.abs(dx)>=Math.abs(dz)
          ? {nx:Math.sign(dx),ny:0} : {nx:0,ny:Math.sign(dz)};
      };
      // Merge again in physical space. Two cells only join if their physical
      // positions are exactly one cell apart along the run's axis and identical
      // across it — which is false on an arc and false wherever a space's
      // mapping jumps, and those are exactly the places a bridge would float.
      let seg=null;
      const flush=()=>{
        if(!seg)return;
        const along=(seg.hi-seg.lo+1)*CELL;
        const cx=(seg.lo+seg.hi)/2+0.5, mid=seg.axis==='x'
          ? {x:cx,z:seg.perp+0.5} : {x:seg.perp+0.5,z:cx};
        // BACK to the wall, not out into the room. The cell centre is half a cell
        // off the face; the skirting's own centre sits half its depth proud of it.
        const back=0.5-BASEBOARD.proud/CELL/2;
        const outX=-seg.n.nx*back, outZ=-seg.n.ny*back;
        // A run travelling along physical x is a long box in x, and vice versa —
        // read off the measured normal rather than the logical axis.
        const alongX=seg.n.nx===0;
        const size=alongX
          ? [along,BASEBOARD.height,BASEBOARD.proud]
          : [BASEBOARD.proud,BASEBOARD.height,along];
        addBox(m,[
          (mid.x+outX-anchor.x)*CELL,
          (r.floor-anchor.y)+BASEBOARD.height/2,
          (mid.z+outZ-anchor.z)*CELL,
        ],size,skirtingMat(r.material));
        emitted++; seg=null;
      };
      for(const c of r.cells){
        const p=FP.logicalToPhysical(c.x,c.y);
        const n=physNormal(c);
        // The run travels across its own normal.
        const axis=n.nx===0?'x':'z';
        const lo=axis==='x'?p.x:p.z, perp=axis==='x'?p.z:p.x;
        if(seg&&seg.axis===axis&&seg.perp===perp&&seg.n.nx===n.nx&&seg.n.ny===n.ny
          &&Math.abs(lo-(seg.hi+1))<1e-6){seg.hi=lo;continue;}
        flush();
        seg={axis,lo,hi:lo,perp,n};
      }
      flush();
    }
  }
  console.log(`  · baseboards: ${runs.length} runs -> ${emitted} segments across ${byGroup.size} render groups`);
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
// Mesh bounds belong in the machine-readable stats file, not only in credits:
// credits.json is a provenance document, and the runtime needs the real top of a
// desk to stand a clipboard on it (see `on:` in game/props.js).
// workSurfaces() is a function declaration below, so it hoists; the const does
// not, which is why it is bound here rather than beside its definition.
const meshSurfaces=workSurfaces();
stats.bounds=Object.fromEntries(Object.entries(meshBounds).map(([k,v])=>[k,{min:v.min,max:v.max}]));
stats.baseboards={planHash:baseboardPlanHash,groups:baseboardAnchors};
stats.surfaces=meshSurfaces;
fs.writeFileSync(STATS,JSON.stringify(stats,null,2)+'\n');

// THE WORK SURFACE, which is not the top of the bounding box.
//
// `on:` wants the height you could stand a clipboard at, and a bounding box does
// not know that: ticket_counter's box tops out at 2.25m because of its GRILLE,
// and school_desk's at 1.10 because of its back. Putting a cash terminal on
// either number is worse than the hand-typed value it replaces.
//
// So measure it: gather every upward-facing triangle, bucket by height, and take
// the HIGHEST height that has a real amount of flat area at it. That is a
// surface somebody could put something down on, and it is measured from the
// geometry rather than typed beside it.
function workSurfaces(){
  const out={};
  for(const m of meshes.values()){
    const byY=new Map();
    for(const g of m.groups.values()){
      const P=g.positions, N=g.normals, I=g.indices;
      for(let i=0;i<I.length;i+=3){
        const a=I[i]*3,b=I[i+1]*3,c=I[i+2]*3;
        // Upward-facing only. A downward face at the same height is a shelf's
        // underside, and nothing rests on that.
        if(N[a+1]<0.9||N[b+1]<0.9||N[c+1]<0.9)continue;
        const ax=P[a],ay=P[a+1],az=P[a+2],bx=P[b],bz=P[b+2],cx=P[c],cz=P[c+2];
        const area=Math.abs((bx-ax)*(cz-az)-(cx-ax)*(bz-az))/2;
        if(area<=0)continue;
        const key=Math.round(ay*100)/100;
        byY.set(key,(byY.get(key)||0)+area);
      }
    }
    // THE BIGGEST flat area, not the highest one. A counter's cap is higher than
    // its serving ledge and a rack's crown is higher than its shelves, and in
    // both cases the thing you put something down on is the broader face.
    // Below MIN_AREA it is a rail, a lip or a moulding, not a surface at all.
    const MIN_AREA=0.06;
    const flat=[...byY.entries()].filter(([,a])=>a>=MIN_AREA)
      .sort((p,q)=>(q[1]-p[1])||(q[0]-p[0]));
    if(flat.length)out[m.name]=flat[0][0];
  }
  return out;
}
// A GENERATED MODULE, not JSON. The game imports this through vite and the tests
// import it through node, and a plain .js module needs no import assertion in
// either. It carries the two things only the builder can know: the real top of
// every mesh (so a clipboard can be stood on a desk without typing a height),
// and where the baked baseboards hang.
fs.mkdirSync(path.join(ROOT,'src/data/generated'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'src/data/generated/prop-geometry.js'),
`// GENERATED by tools/chunk_surfer/build-props.mjs — do not edit by hand.
//
// MESH_TOP is the real height of each mesh's bounding box, in metres, measured
// from the geometry rather than typed. PROP_BOUNDS carries the full box for
// footprint work. BASEBOARDS records which mesh holds each render group's baked
// skirting, and PLAN_HASH is the hash of the wall runs it was generated from —
// see test/baseboard-freshness.spec.mjs, which fails when the floorplan has
// moved on and the pack has not been rebuilt.
export const PLAN_HASH = ${JSON.stringify(baseboardPlanHash)};
export const BASEBOARDS = Object.freeze(${JSON.stringify(baseboardAnchors)});
export const PROP_BOUNDS = Object.freeze(${JSON.stringify(
  Object.fromEntries(Object.entries(meshBounds).map(([k,v])=>[k,{min:v.min,max:v.max}])))});
export const MESH_TOP = Object.freeze(${JSON.stringify(
  Object.fromEntries(Object.entries(meshBounds).map(([k,v])=>[k,v.max[1]])))});
// MESH_SURFACE is the highest height carrying a real amount of upward-facing
// flat area — the height you could stand something at. NOT the same as MESH_TOP:
// ticket_counter's box top is its grille at 2.25m and school_desk's is its back
// at 1.10m, and neither is a surface. The on: field uses this one.
export const MESH_SURFACE = Object.freeze(${JSON.stringify(meshSurfaces)});
`);

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
