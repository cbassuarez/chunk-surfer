// Task-local room dressing. The catalog override replaces the old cuboid
// costume_rail without rebuilding the shared (and independently edited) prop
// pack. All surfaces pass through the ordinary world prop shader and dither.
import { Document, NodeIO } from '@gltf-transform/core';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('adversary room dressing');
const mats={
  steel:[.16,.17,.16,1],wood:[.20,.115,.067,1],woodWorn:[.27,.17,.10,1],
  ash:[.19,.18,.16,1],ivory:[.53,.48,.40,1],oxblood:[.23,.035,.038,1],
  oldBlood:[.12,.025,.029,1],bone:[.44,.36,.29,1],
};
const material=Object.fromEntries(Object.entries(mats).map(([name,color])=>[
  name,doc.createMaterial(name).setBaseColorFactor(color)
    .setMetallicFactor(name==='steel'?.52:0).setRoughnessFactor(name==='steel'?.48:.91)
    .setDoubleSided(true),
]));
const groups=new Map();let active;
function begin(name){active={name,parts:new Map()};groups.set(name,active);}
function part(mat){if(!active.parts.has(mat))active.parts.set(mat,{p:[],n:[],i:[]});return active.parts.get(mat);}
function triangle(g,a,b,c){
  const normal=(u,v,w)=>{
    const x=v[0]-u[0],y=v[1]-u[1],z=v[2]-u[2];
    const X=w[0]-u[0],Y=w[1]-u[1],Z=w[2]-u[2];
    const nx=y*Z-z*Y,ny=z*X-x*Z,nz=x*Y-y*X,d=Math.hypot(nx,ny,nz)||1;
    return [nx/d,ny/d,nz/d];
  };
  const n=normal(a,b,c),first=g.p.length/3;
  for(const v of [a,b,c]){g.p.push(...v);g.n.push(...n);}
  g.i.push(first,first+1,first+2);
}
function quad(mat,a,b,c,d){const g=part(mat);triangle(g,a,b,c);triangle(g,a,c,d);}
function box(mat,center,size){
  const [x,y,z]=center,[w,h,d]=size,x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
  quad(mat,[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
  quad(mat,[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
  quad(mat,[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
  quad(mat,[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
  quad(mat,[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
  quad(mat,[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
}
function rod(mat,start,end,r=.012,sides=8){
  const a=start,b=end,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const axis=Math.abs(dy)<.8?[-dy,dx,0]:[1,0,0];
  const al=Math.hypot(...axis)||1,ux=axis[0]/al,uy=axis[1]/al,uz=axis[2]/al;
  const vl=Math.hypot(dx,dy,dz)||1,vx=(dy*uz-dz*uy)/vl,vy=(dz*ux-dx*uz)/vl,vz=(dx*uy-dy*ux)/vl;
  for(let k=0;k<sides;k++){
    const t=k*2*Math.PI/sides,u=(k+1)*2*Math.PI/sides;
    const p=(base,angle)=>[base[0]+r*(ux*Math.cos(angle)+vx*Math.sin(angle)),
      base[1]+r*(uy*Math.cos(angle)+vy*Math.sin(angle)),base[2]+r*(uz*Math.cos(angle)+vz*Math.sin(angle))];
    quad(mat,p(a,t),p(a,u),p(b,u),p(b,t));
  }
}
function drape(mat,cx,top,bottom,halfWidth,front,seed=0){
  const rows=20,cols=10;
  const at=(u,v)=>{
    const flare=1+.43*v,pleat=Math.sin(u*11*Math.PI+seed)*(.014+.030*v);
    const lean=.018*Math.sin(v*13+seed),ragged=.055*v*v*Math.sin(u*17+seed*3);
    return [cx+(u-.5)*halfWidth*2*flare+lean,top-(top-bottom)*v+ragged,
      front+.023*Math.sin(v*17+u*9+seed)+pleat];
  };
  for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){
    const a=at(i/(cols-1),j/(rows-1)),b=at((i+1)/(cols-1),j/(rows-1)),
      c=at((i+1)/(cols-1),(j+1)/(rows-1)),d=at(i/(cols-1),(j+1)/(rows-1));
    quad(mat,a,b,c,d);
  }
}
function hanger(x,z){
  rod('steel',[x,1.64,z],[x,1.48,z],.008);rod('wood',[x,1.48,z],[x-.21,1.39,z],.016);
  rod('wood',[x,1.48,z],[x+.21,1.39,z],.016);rod('wood',[x-.21,1.39,z],[x+.21,1.39,z],.01);
}

begin('costume_rail');
for(const x of [-.69,.69]){
  rod('steel',[x,.04,0],[x,1.64,0],.017,10);
  rod('steel',[x-.22,.04,0],[x+.22,.04,0],.012);
  for(const z of [-.19,.19])box('steel',[x,z===-.19?.035:.035,z],[.11,.07,.09]);
}
rod('steel',[-.69,1.64,0],[.69,1.64,0],.020,12);
for(const [i,x,mat,z,bottom,width] of [
  [0,-.48,'ivory',.055,.32,.17],
  [1,-.16,'ash',-.02,.51,.18],
  [2,.18,'oxblood',.04,.23,.21],
  [3,.53,'ivory',-.055,.44,.15],
]){
  hanger(x,z);drape(mat,x,1.41,bottom,width,z+.09,i*1.17);
  drape(mat,x,1.39,bottom+.03,width*.92,z-.08,i*1.17+1.8);
}
// A contaminated seam belongs to one garment, never a room-wide splatter.
for(let k=0;k<11;k++){
  const u=k/10;
  rod('oldBlood',[.19+(u-.5)*.29,1.12-.06*Math.sin(u*5),.151],
    [.19+(u-.5)*.30,1.03-.10*Math.sin(u*8),.154],.0025,6);
}

begin('costume_stained_chair');
// A narrow old workroom chair, empty in every encounter phase.
for(const x of [-.25,.25])for(const z of [-.20,.22]){
  rod('wood',[x,.03,z],[x,.75,z],.025,9);
}
box('woodWorn',[0,.43,0],[.56,.055,.49]);
for(const x of [-.24,.24])rod('wood',[x,.47,.22],[x,.95,.22],.023,9);
for(const y of [.73,.91])rod('wood',[-.25,y,.22],[.25,y,.22],.018,9);
for(const z of [-.19,.20])rod('wood',[-.24,.19,z],[.24,.19,z],.014,8);
drape('oxblood',.03,.84,.30,.15,.253,1.31);
// A lining is pulled from the seat onto the floor, with its seam facing the player.
drape('oldBlood',-.03,.45,.025,.21,-.23,2.4);
for(let k=0;k<8;k++)rod('bone',[-.17+k*.044,.47,-.24],[-.16+k*.044,.43,-.252],.0035,6);
// A working dressmaker's pin catches the torch at the seat's exposed seam.
// It is part of the chair, not a progression pickup or a glowing marker.
rod('steel',[.045,.491,-.235],[.157,.486,-.258],.0038,7);
box('ivory',[.045,.491,-.235],[.019,.019,.019]);

begin('held_note_ceiling_wound');
// Branched fascia grown into one ceiling bay. Flat planes turned into white
// rectangles in the final dither; straight hanging rods read as a cage. These
// irregular curves should instead converge on the weight of the creature.
for(let k=0;k<9;k++){
  const angle=k*2.39996,reach=.45+.38*(.5+.5*Math.sin(k*1.77));
  const end=[Math.cos(angle)*reach,.015,Math.sin(angle)*reach*.52];
  const start=[end[0]*.37,-.74-.11*Math.sin(k*1.31),.13+end[2]*.36];
  let last=start;
  for(let j=1;j<=6;j++){
    const t=j/6,next=[start[0]+(end[0]-start[0])*t+.07*Math.sin(t*Math.PI*2+k),
      start[1]+(end[1]-start[1])*t,
      start[2]+(end[2]-start[2])*t+.045*Math.sin(t*9+k*.7)];
    rod(k%3?'oldBlood':'oxblood',last,next,.006+.017*t,7);last=next;
  }
}

for(const {name,parts} of groups.values()){
  const mesh=doc.createMesh(name);
  for(const [key,g] of parts){
    const accessor=(type,data)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(data);
    mesh.addPrimitive(doc.createPrimitive()
      .setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.p)))
      .setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.n)))
      .setIndices(accessor('SCALAR',Uint32Array.from(g.i)))
      .setMaterial(material[key]));
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
const out=path.join(root,'public/assets/conservatory-adversary-scenery.glb');
await new NodeIO().write(out,doc);
console.log(`Wrote ${out}`);
