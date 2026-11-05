// The things in the nothingness, in local metres: the ruin that reads 6:00 AM
// from one step, the cardboard flat of the building behind it, the far faults.
import {SIX_NOTHINGNESS as C,sixRandom} from '../data/six-nothingness.js';

const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=a=>mul(a,1/(Math.hypot(...a)||1));
const target=()=>({p:[],i:[]});
// Mesh normals come from winding, so a triangle is wound to face `outward`.
function tri(g,a,b,c,outward){
  const flip=outward&&dot(cross(sub(b,a),sub(c,a)),outward)<0,o=g.p.length/3;
  g.p.push(...a,...(flip?c:b),...(flip?b:c));g.i.push(o,o+1,o+2);
}
const quad=(g,a,b,c,d,outward)=>{tri(g,a,b,c,outward);tri(g,a,c,d,outward);};
// Face order for a box from its eight corners, bottom then top.
function solid(g,c){
  const mid=mul(c.reduce((s,v)=>add(s,v),[0,0,0]),1/8);
  for(const[a,b,e,f]of[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){
    const centre=mul(add(add(c[a],c[b]),add(c[e],c[f])),.25);quad(g,c[a],c[b],c[e],c[f],sub(centre,mid));
  }
}
const box=(g,x0,x1,y0,y1,z0,z1)=>solid(g,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]);
// A squared timber between two points.
function beam(g,a,b,width,height=width){
  const f=unit(sub(b,a)),r=unit(Math.abs(f[1])>.95?cross(f,[1,0,0]):cross(f,[0,1,0])),u=cross(r,f),w=mul(r,width/2),h=mul(u,height/2),
    corner=(p,sw,sh)=>add(add(p,mul(w,sw)),mul(h,sh));
  solid(g,[corner(a,-1,-1),corner(a,1,-1),corner(a,1,1),corner(a,-1,1),corner(b,-1,-1),corner(b,1,-1),corner(b,1,1),corner(b,-1,1)]);
}

// ── THE WORDS ───────────────────────────────────────────────────────────────
// Digit units are 1 wide and 2 tall, y down, leaning like a dash clock's.
const T=.2,LEAN=.08;
const SEGMENT={a:[[.1,0],[.9,0],[.9-T,T],[.1+T,T]],d:[[.1+T,2-T],[.9-T,2-T],[.9,2],[.1,2]],
  g:[[.1,1],[.1+T,1-T/2],[.9-T,1-T/2],[.9,1],[.9-T,1+T/2],[.1+T,1+T/2]],
  f:[[0,.08],[T,.08+T],[T,.92-T/2],[0,.96]],b:[[1-T,.08+T],[1,.08],[1,.96],[1-T,.92-T/2]],
  e:[[0,1.04],[T,1.08+T/2],[T,1.92-T],[0,1.92]],c:[[1-T,1.08+T/2],[1,1.04],[1,1.92],[1-T,1.92-T]]};
const DIGIT={6:'acdefg',0:'abcdef'};
const AM=[
  [[0,1.24],[.12,1.24],[.12,2],[0,2]],[[.43,1.24],[.55,1.24],[.55,2],[.43,2]],
  [[.14,1.2],[.41,1.2],[.41,1.32],[.14,1.32]],[[.14,1.58],[.41,1.58],[.41,1.69],[.14,1.69]],
  [[.67,1.2],[.79,1.2],[.79,2],[.67,2]],[[1.25,1.2],[1.37,1.2],[1.37,2],[1.25,2]],
  [[.81,1.22],[.92,1.22],[1.02,1.56],[1.02,1.74]],[[1.23,1.22],[1.12,1.22],[1.02,1.56],[1.02,1.74]],
];
const leaning=poly=>poly.map(([u,v])=>[u-v*LEAN,v]);
function sixAmShapes(){
  const shapes=[];let cx=0;
  const dot=(x,y)=>Array.from({length:6},(_,k)=>[x+Math.cos(k/6*Math.PI*2)*.1,y+Math.sin(k/6*Math.PI*2)*.1]);
  [...'600'].forEach((glyph,index)=>{
    if(index===1){shapes.push({poly:dot(cx+.12,.6)},{poly:dot(cx+.04,1.4)});cx+=.42;}
    for(const s of DIGIT[glyph])shapes.push({poly:leaning(SEGMENT[s].map(([u,v])=>[cx+u,v]))});
    cx+=1.32;
  });
  cx+=-.32+.2;
  for(const poly of AM)shapes.push({poly:leaning(poly.map(([u,v])=>[cx+u,v]))});
  return{shapes,width:cx+1.37};
}
const insidePoly=(poly,[x,y])=>{let hit=false;for(let k=0,j=poly.length-1;k<poly.length;j=k++){const[a,b]=poly[k],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;}return hit;};
const centroid=poly=>poly.reduce((s,p)=>[s[0]+p[0]/poly.length,s[1]+p[1]/poly.length],[0,0]);
function clipPoly(poly,axis,at,below){
  const out=[];
  for(let k=0;k<poly.length;k++){
    const a=poly[k],b=poly[(k+1)%poly.length],ia=below?a[axis]<=at:a[axis]>=at,ib=below?b[axis]<=at:b[axis]>=at;
    if(ia)out.push(a);
    if(ia!==ib){const t=(at-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return out;
}
function splitPoly(poly,count,rand){
  if(count<2)return[poly];
  const range=k=>[Math.min(...poly.map(p=>p[k])),Math.max(...poly.map(p=>p[k]))],[x0,x1]=range(0),[y0,y1]=range(1),axis=x1-x0>y1-y0?0:1,[lo,hi]=axis?[y0,y1]:[x0,x1],out=[];
  let rest=poly;
  for(let k=1;k<count;k++){const at=lo+(hi-lo)*(k+(rand()-.5)*.5)/count;out.push(clipPoly(rest,axis,at,true));rest=clipPoly(rest,axis,at,false);}
  out.push(rest);
  return out.filter(p=>p.length>2);
}

// ── THE RUIN ────────────────────────────────────────────────────────────────
// The monument at the first strike, stopped mid-blast. Every shard, face and
// chip is thrown only along its own sight line from the step: from that one eye
// the blast is a clean 6:00 AM, and its chips hide behind the shards that threw
// them. Each prism is a frustum whose axis meets at the step, so from anywhere
// else all of it points back at the door.
export const SIX_RUIN_EYE=Object.freeze([0,C.eye,-C.ruin.stepRadius]);
export function sixRuinPlanePoint(x,y){return[x,C.ruin.bottom+C.ruin.scale+y,-C.ruin.stepRadius-C.ruin.distance];}
let ruin=null;
export function sixRuinGeometry(){
  if(ruin)return ruin;
  const{scale,seed,chips}=C.ruin,rand=sixRandom(seed),{shapes,width}=sixAmShapes(),E=SIX_RUIN_EYE,body=target(),lit=target(),dark=target(),shards=[];
  const toPlane=([u,v])=>[(u-width/2)*scale,(1-v)*scale],
    strike=[(1.32+.1-width/2)*scale,-scale*.8],
    ray=(q,k)=>add(E,mul(sub(sixRuinPlanePoint(q[0],q[1]),E),k));
  for(const shape of shapes){
    const poly=shape.poly.map(toPlane),c=centroid(poly),distance=Math.hypot(c[0]-strike[0],c[1]-strike[1]);
    for(const piece of splitPoly(poly,distance<scale*1.2?3:distance<scale*2.4?2:1,rand)){
      const pc=centroid(piece),d=Math.hypot(pc[0]-strike[0],pc[1]-strike[1]),throwAmount=(.22+.86*Math.exp(-d/(scale*1.5)))*(.75+.5*rand()),
        k=rand()<.5?1+throwAmount:1/(1+throwAmount),depth=.05+.08*rand(),
        // A face stays planar when 1/k is linear across the sight plane.
        ax=(rand()-.5)*.05*throwAmount,ay=(rand()-.5)*.05*throwAmount,
        at=q=>1/(1/k+ax*(q[0]-pc[0])+ay*(q[1]-pc[1])),
        front=piece.map(q=>ray(q,at(q))),back=piece.map(q=>ray(q,at(q)*(1+depth))),
        mid=mul(add(front.reduce((s,v)=>add(s,v),[0,0,0]),back.reduce((s,v)=>add(s,v),[0,0,0])),.5/piece.length),
        toEye=sub(E,mid);
      for(let n=1;n<piece.length-1;n++){
        for(const g of[lit,dark])tri(g,front[0],front[n],front[n+1],toEye);
        tri(body,back[0],back[n],back[n+1],mul(toEye,-1));
      }
      for(let n=0;n<piece.length;n++){
        const m=(n+1)%piece.length,edge=mul(add(front[n],front[m]),.5);
        quad(body,front[n],front[m],back[m],back[n],sub(edge,mid));
      }
      shards.push({piece,k,depth,kMax:Math.max(...piece.map(at))});
    }
  }
  // Chips stay inside a shard's silhouette and behind its back face.
  for(let n=0;n<chips;n++){
    const shard=shards[Math.floor(rand()*shards.length)],c=centroid(shard.piece),corner=shard.piece[Math.floor(rand()*shard.piece.length)],
      q=[c[0]+(corner[0]-c[0])*rand()*.5,c[1]+(corner[1]-c[1])*rand()*.5],
      k=shard.kMax*(1+shard.depth)+.04+rand()*.5,size=.1*T*scale*k,at=ray(q,k),
      g=rand()<.16?lit:body,turn=rand()*Math.PI,f=unit(sub(E,at)),r=unit(cross(f,[Math.cos(turn),.6,Math.sin(turn)])),u=cross(r,f),
      v=[add(at,mul(f,size)),add(at,mul(r,size)),add(at,add(mul(r,-size*.6),mul(u,size))),add(at,add(mul(r,-size*.6),mul(u,-size)))],mid=mul(v.reduce((s,p)=>add(s,p),[0,0,0]),.25);
    // A chip that would show past its shard's edge from the step is not thrown.
    if(!v.every(point=>{const t=C.ruin.distance/(E[2]-point[2]),plane=sixRuinPlanePoint(0,0);return insidePoly(shard.piece,[E[0]+(point[0]-E[0])*t-plane[0],E[1]+(point[1]-E[1])*t-plane[1]]);}))continue;
    for(const[a,b,e]of[[0,1,2],[0,2,3],[0,3,1],[1,3,2]]){const centre=mul(add(add(v[a],v[b]),v[e]),1/3);tri(g,v[a],v[b],v[e],sub(centre,mid));if(g===lit)tri(dark,v[a],v[b],v[e],sub(centre,mid));}
  }
  ruin={body,lit,dark,shards,width:width*scale};
  return ruin;
}

// ── THE FLAT ────────────────────────────────────────────────────────────────
// Literally cardboard. One sheet cut to the building's outline, painted on the
// side that faced the yard, and held up from behind the way a scene dock holds
// up anything: battens, tape, stage braces and weights.
export const SIX_FLAT_OUTLINE=Object.freeze([
  [-27,-16,8.2,8.2],[-16,-10,11.4,11.4],[-10,-5.5,16,16],[-5.5,6,11.4,11.4],[6,13,12.2,17.6],[13,20,17.6,12.2],[20,27,10.2,10.2],
]);
const GLYPHS={T:'11111 00100 00100 00100 00100 00100 00100',H:'10001 10001 10001 11111 10001 10001 10001',I:'11111 00100 00100 00100 00100 00100 11111',
  S:'01111 10000 10000 01110 00001 00001 11110',D:'11110 10001 10001 10001 10001 10001 11110',E:'11111 10000 10000 11110 10000 10000 11111',
  U:'10001 10001 10001 10001 10001 10001 01110',P:'11110 10001 10001 11110 10000 10000 10000',B:'11110 10001 10001 11110 10001 10001 11110',
  A:'01110 10001 10001 11111 10001 10001 10001',Y:'10001 10001 01010 00100 00100 00100 00100',L:'10000 10000 10000 10000 10000 10000 11111',V:'10001 10001 10001 10001 01010 01010 00100',
  '.':'00000 00000 00000 00000 00000 00000 00100'};
// Stencilled on the back, which faces -Z: read from there, +X runs right to left.
function stencil(g,text,x,y,pixel,z){
  const depth=typeof z==='function'?z:()=>z;
  let cursor=x;
  for(const ch of text){
    if(ch===' '){cursor-=pixel*4;continue;}
    GLYPHS[ch].split(' ').forEach((row,r)=>[...row].forEach((on,c)=>{
      if(on!=='1')return;
      const x1=cursor-c*pixel,y1=y-r*pixel;
      const x2=x1-pixel*.9;
      quad(g,[x1,y1,depth(x1)],[x2,y1,depth(x2)],[x2,y1-pixel*.9,depth(x2)],[x1,y1-pixel*.9,depth(x1)],[0,0,-1]);
    }));
    cursor-=pixel*6;
  }
}
const topAt=(x0,x1,h0,h1,x)=>h0+(h1-h0)*(x-x0)/(x1-x0);
export function sixFlatGeometry(){
  const{halfWidth:doorX,height:doorY}=C.flat.door,t=C.flat.thickness/2,face=target(),paint=target(),back=target(),edge=target(),timber=target(),weight=target(),tape=target(),ink=target();
  const sheet=(x0,x1,y00,y01,y10,y11)=>{
    quad(face,[x0,y00,t],[x1,y01,t],[x1,y11,t],[x0,y10,t],[0,0,1]);
    quad(back,[x0,y00,-t],[x1,y01,-t],[x1,y11,-t],[x0,y10,-t],[0,0,-1]);
  };
  for(const[x0,x1,h0,h1]of SIX_FLAT_OUTLINE){
    const a=Math.max(x0,-doorX),b=Math.min(x1,doorX);
    if(a<b){
      if(x0<a)sheet(x0,a,0,0,h0,topAt(x0,x1,h0,h1,a));
      sheet(a,b,doorY,doorY,topAt(x0,x1,h0,h1,a),topAt(x0,x1,h0,h1,b));
      if(b<x1)sheet(b,x1,0,0,topAt(x0,x1,h0,h1,b),h1);
    }else sheet(x0,x1,0,0,h0,h1);
    // The cut edge, where the flutes of the board show.
    const up=unit([-(h1-h0),x1-x0,0]);
    quad(edge,[x0,h0,t],[x1,h1,t],[x1,h1,-t],[x0,h0,-t],up);
  }
  let previous=0;
  for(const[x0,,h0]of SIX_FLAT_OUTLINE){if(h0!==previous){const lo=Math.min(h0,previous),hi=Math.max(h0,previous);quad(edge,[x0,lo,t],[x0,hi,t],[x0,hi,-t],[x0,lo,-t],[h0>previous?-1:1,0,0]);}previous=h0;}
  const end=C.flat.halfWidth,endTop=SIX_FLAT_OUTLINE.at(-1)[3];
  quad(edge,[end,0,t],[end,endTop,t],[end,endTop,-t],[end,0,-t],[1,0,0]);
  for(const s of[-1,1])quad(edge,[s*doorX,0,t],[s*doorX,doorY,t],[s*doorX,doorY,-t],[s*doorX,0,-t],[-s,0,0]);
  quad(edge,[-doorX,doorY,t],[doorX,doorY,t],[doorX,doorY,-t],[-doorX,doorY,-t],[0,-1,0]);
  // The painted elevation: courses, windows, a door frame that frames nothing.
  const front=t+.006,painted=(x0,x1,y0,y1)=>quad(paint,[x0,y0,front],[x1,y0,front],[x1,y1,front],[x0,y1,front],[0,0,1]);
  for(const[x0,x1,h0,h1]of SIX_FLAT_OUTLINE){
    const low=Math.min(h0,h1),span=x1-x0;
    for(let row=0;row<2;row++){
      const y0=4.9+row*3.1;if(y0+2.2>low-.6)continue;
      for(let n=0,count=Math.max(1,Math.floor(span/2.6));n<count;n++){const w=span/count,x=x0+(n+.5)*w;if(Math.abs(x)<doorX+.8&&y0<doorY+.4)continue;painted(x-.55,x+.55,y0,y0+2.2);}
    }
    painted(x0,x1,low-.5,low-.3);
  }
  painted(-doorX-.22,-doorX,0,doorY+.22);painted(doorX,doorX+.22,0,doorY+.22);painted(-doorX,doorX,doorY,doorY+.22);
  // The back of the board, which is what you turn around to.
  const rear=-t-.006;
  for(let x=-end+.2;x<end;x+=.42){if(Math.abs(x)<doorX+.03)continue;const h=SIX_FLAT_OUTLINE.find(row=>x>=row[0]&&x<=row[1]),top=h?topAt(h[0],h[1],h[2],h[3],x):8;quad(ink,[x,.02,rear],[x+.018,.02,rear],[x+.018,top-.04,rear],[x,top-.04,rear],[0,0,-1]);}
  for(let x=-24;x<end;x+=6){if(Math.abs(x)<doorX+.3)continue;const h=SIX_FLAT_OUTLINE.find(row=>x>=row[0]&&x<=row[1]),top=h?topAt(h[0],h[1],h[2],h[3],x):8;
    quad(tape,[x-.06,0,rear-.002],[x+.06,0,rear-.002],[x+.06,top,rear-.002],[x-.06,top,rear-.002],[0,0,-1]);
    box(timber,x-.05,x+.05,0,Math.min(top-.1,7.5),-t-.09,-t);
    // A stage brace to the floor and its weight.
    beam(timber,[x,5.6,-t-.05],[x,.06,-3.3],.07,.03);beam(timber,[x,.04,-t-.05],[x,.04,-3.3],.08,.03);
    box(weight,x-.2,x+.2,.03,.25,-3.25,-2.75);box(weight,x-.17,x+.17,.25,.42,-3.2,-2.8);
  }
  for(const y of[1.2,doorY+.4,6.6])for(const[x0,x1]of y<doorY+.5?[[-end,-doorX-.2],[doorX+.2,end]]:[[-end,end]])box(timber,x0,x1,y-.04,y+.04,-t-.08,-t);
  stencil(ink,'THIS SIDE UP',-3.2,3.3,.075,rear-.004);
  stencil(ink,'BAY ELEV.',8.4,2.6,.12,rear-.004);
  const leafFace=s=>x=>-t-.02+(-.3+t+.02)*(Math.abs(x)-doorX)/1.46-.012;
  stencil(ink,'THIS SIDE',-doorX-.14,2.06,.024,leafFace(-1));
  stencil(ink,'UP',-doorX-.14,1.82,.024,leafFace(-1));
  stencil(ink,'BAY ELEV.',doorX+1.36,2.06,.024,leafFace(1));
  // The goods doors, two more pieces of the same board, pushed open.
  for(const s of[-1,1]){
    const hinge=[s*doorX,0,-t-.02],tip=[s*(doorX+1.46),0,-.3],n=unit([.28*s,0,-1.46]);
    for(const g of[back]){const h=hinge[2];quad(g,[hinge[0],0,h],[tip[0],0,tip[2]],[tip[0],doorY-.03,tip[2]],[hinge[0],doorY-.03,h],n);quad(g,[hinge[0],0,h],[tip[0],0,tip[2]],[tip[0],doorY-.03,tip[2]],[hinge[0],doorY-.03,h],mul(n,-1));}
    beam(timber,[tip[0]-s*.08,1.15,tip[2]-.03],[tip[0]-s*.08,1.3,tip[2]-.03],.05,.05);
    // The leaves are what you turn around to, so they say what they are.
    const leafZ=x=>hinge[2]+(tip[2]-hinge[2])*(x-hinge[0])/(tip[0]-hinge[0])-.008;
    for(let u=.1;u<1.42;u+=.13){const x=hinge[0]+s*u,w=s*.012;quad(ink,[x,.02,leafZ(x)],[x+w,.02,leafZ(x+w)],[x+w,doorY-.06,leafZ(x+w)],[x,doorY-.06,leafZ(x)],[0,0,-1]);}
    for(const[u0,u1,y0,y1]of[[.03,1.43,2.62,2.7],[.03,1.43,.82,.9],[.68,.78,.02,doorY-.06]]){const a=hinge[0]+s*u0,b=hinge[0]+s*u1,z=x=>leafZ(x)-.002;quad(tape,[a,y0,z(a)],[b,y0,z(b)],[b,y1,z(b)],[a,y1,z(a)],[0,0,-1]);}
  }
  return{face,paint,back,edge,timber,weight,tape,ink};
}

// ── THE FAULTS ──────────────────────────────────────────────────────────────
// The same held panels Source II closes a passage with, here as a ring far past
// the boos. This is one sector on the -Z axis; the ring is that sector moved round.
export const SIX_FAULT_PALETTE=Object.freeze([[1,.015,.72],[.015,.82,1],[.42,.015,1],[.74,1,.015]]);
export function sixFaultGeometry(){
  const{radius,sectors,patches,rows,columns,height,seed}=C.faults,rand=sixRandom(seed),palette=SIX_FAULT_PALETTE.map(target),rowHeight=height/rows,span=Math.PI*2/sectors;
  for(let n=0;n<patches;n++){
    const a=((n+.5+(rand()-.5)*.3)/patches-.5)*span,r=radius+(rand()-.5)*1.2,nx=-Math.sin(a),nz=-Math.cos(a),cx=C.centre.x+nx*r,cz=C.centre.z+nz*r,tx=Math.cos(a),tz=-Math.sin(a);
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      if(rand()<.08)continue;
      const u=(column+.5-columns/2)*1,y=(row+.5)*rowHeight,hw=.47,hh=rowHeight/2-.03,ht=.025,
        at=(su,sy,sn)=>[cx+tx*(u+su*hw)+nx*sn*ht,y+sy*hh,cz+tz*(u+su*hw)+nz*sn*ht];
      solid(palette[Math.floor(rand()*palette.length)],[at(-1,-1,-1),at(1,-1,-1),at(1,-1,1),at(-1,-1,1),at(-1,1,-1),at(1,1,-1),at(1,1,1),at(-1,1,1)]);
    }
  }
  return palette;
}
function floorGeometry(){
  const g=target(),sides=96;
  for(let k=0;k<sides;k++){
    const a=k/sides*Math.PI*2,b=(k+1)/sides*Math.PI*2,c=[C.centre.x,0,C.centre.z],at=t=>[C.centre.x+Math.cos(t)*C.floorRadius,0,C.centre.z+Math.sin(t)*C.floorRadius];
    tri(g,c,at(a),at(b),[0,1,0]);
  }
  return g;
}

// Unit card, scaled to the opening it stands behind in the real world.
function doorVoidGeometry(){const g=target();box(g,-.5,.5,0,1,-.5,.5);return g;}

let library=null;
export function sixNothingnessGeometry(){
  if(library)return library;
  const r=sixRuinGeometry(),f=sixFlatGeometry(),faults=sixFaultGeometry();
  library=Object.freeze([
    {name:'six_floor',...floorGeometry(),base:[.035,.037,.05,1],roughness:1},
    {name:'six_door_void',...doorVoidGeometry(),base:[0,0,0,1],roughness:1},
    {name:'six_ruin_body',p:r.body.p,i:r.body.i,base:[.44,.43,.37,1],roughness:.96},
    {name:'six_ruin_lit',p:r.lit.p,i:r.lit.i,base:[.32,.95,.82,1],emissive:[.55,1.75,1.5],roughness:.3},
    {name:'six_ruin_dark',p:r.dark.p,i:r.dark.i,base:[.012,.03,.03,1],roughness:.25},
    {name:'six_flat_face',...f.face,base:[.5,.34,.27,1],roughness:1},
    {name:'six_flat_paint',...f.paint,base:[.09,.08,.1,1],roughness:1},
    {name:'six_flat_back',...f.back,base:[.62,.47,.3,1],roughness:1},
    {name:'six_flat_edge',...f.edge,base:[.8,.68,.48,1],roughness:1},
    {name:'six_flat_timber',...f.timber,base:[.5,.4,.26,1],roughness:.92},
    {name:'six_flat_weight',...f.weight,base:[.08,.08,.09,1],roughness:.7,metallic:.4},
    {name:'six_flat_tape',...f.tape,base:[.84,.76,.56,1],roughness:.5},
    {name:'six_flat_ink',...f.ink,base:[.04,.035,.035,1],roughness:1},
    ...faults.map((g,k)=>({name:`six_fault_${k}`,...g,base:[...SIX_FAULT_PALETTE[k],1],emissive:SIX_FAULT_PALETTE[k].map(v=>v*.36),roughness:.22,materialRole:'source-chunk-error'})),
  ]);
  return library;
}
export const sixGeometryBounds=piece=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<piece.p.length;k+=3)for(let n=0;n<3;n++){min[n]=Math.min(min[n],piece.p[k+n]);max[n]=Math.max(max[n],piece.p[k+n]);}
  return{min,max};
};
