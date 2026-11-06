// THE FIELD'S THINGS, in local metres. Grass, daisies and buttercups in repeating
// squares, a van door, a fence, the jumper, and one white carrier bag, which is also
// the bag in the real world (world/the-bag.js), so that it is the same bag.
import {MEMORY_FIELD as C} from '../data/memory-field.js';
import {sourceAmbientFaultGeometry} from './source-ambient-fault-geometry.js';

const TAU=Math.PI*2;
function rng(seed){let s=(seed*2654435761)>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const group=()=>({p:[],i:[]});
function tri(g,a,b,c){const o=g.p.length/3;g.p.push(...a,...b,...c);g.i.push(o,o+1,o+2);}
function quad(g,a,b,c,d){tri(g,a,b,c);tri(g,a,c,d);}
function box(g,x0,x1,y0,y1,z0,z1){
  const c=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  for(const[a,b,e,f]of[[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])quad(g,c[a],c[b],c[e],c[f]);
}
const piece=(name,g,base,{emissive=null,roughness=.9,metallic=0,materialRole=undefined}={})=>Object.freeze({name,p:g.p,i:g.i,base:[...base,1],emissive:emissive||[base[0]*.14,base[1]*.14,base[2]*.14],roughness,metallic,materialRole});

// A blade: two tapering triangles leaning somewhere.
function blade(g,x,z,h,w,yaw,lean){
  const c=Math.cos(yaw),s=Math.sin(yaw),rx=c*w,rz=s*w,tx=x-s*lean,tz=z+c*lean,mx=x-s*lean*.35,mz=z+c*lean*.35;
  quad(g,[x-rx,0,z-rz],[x+rx,0,z+rz],[mx+rx*.6,h*.55,mz+rz*.6],[mx-rx*.6,h*.55,mz-rz*.6]);
  tri(g,[mx-rx*.6,h*.55,mz-rz*.6],[mx+rx*.6,h*.55,mz+rz*.6],[tx,h,tz]);
}
// Petals out from the middle of a face looking along `n`.
function petals(petal,disc,x,y,z,r,n,count,random){
  const[nx,ny,nz]=n,u=Math.abs(ny)>.9?[1,0,0]:[0,1,0],
    ax=[ny*u[2]-nz*u[1],nz*u[0]-nx*u[2],nx*u[1]-ny*u[0]],al=Math.hypot(...ax)||1,a=ax.map(v=>v/al),
    b=[ny*a[2]-nz*a[1],nz*a[0]-nx*a[2],nx*a[1]-ny*a[0]],
    at=(t,d,lift=0)=>[x+(a[0]*Math.cos(t)+b[0]*Math.sin(t))*d+nx*lift,y+(a[1]*Math.cos(t)+b[1]*Math.sin(t))*d+ny*lift,z+(a[2]*Math.cos(t)+b[2]*Math.sin(t))*d+nz*lift];
  const start=random()*TAU;
  for(let k=0;k<count;k++){
    const t=start+k/count*TAU+(random()-.5)*.14,w=TAU/count*.46,len=r*(.86+random()*.28),droop=-r*.1*random();
    quad(petal,at(t-w*.55,r*.26),at(t+w*.55,r*.26),at(t+w*.62,len*.82,droop),at(t-w*.62,len*.82,droop));
    tri(petal,at(t-w*.62,len*.82,droop),at(t+w*.62,len*.82,droop),at(t,len,droop*1.2));
  }
  for(let k=0;k<8;k++){const t=k/8*TAU,e=TAU/8;tri(disc,[x+nx*r*.09,y+ny*r*.09,z+nz*r*.09],at(t,r*.3),at(t+e,r*.3));}
}
function daisy(stem,petal,disc,x,z,h,r,random){
  const lean=(random()-.5)*.1,tilt=(random()-.5)*.1,head=[x+lean,h,z+tilt];
  // Most of them are turned a little toward the same part of the sky.
  const n=(()=>{const v=[(random()-.5)*.5,.72+random()*.3,-.45-random()*.3],l=Math.hypot(...v);return v.map(q=>q/l);})();
  for(const[a,b]of[[[-.006,0],[.006,0]],[[0,-.006],[0,.006]]])quad(stem,[x+a[0],0,z+a[1]],[x+b[0],0,z+b[1]],[head[0]+b[0],h,head[2]+b[1]],[head[0]+a[0],h,head[2]+a[1]]);
  petals(petal,disc,head[0],head[1],head[2],r,n,11+Math.floor(random()*5),random);
}
function buttercup(stem,disc,x,z,h,r,random){
  quad(stem,[x-.005,0,z],[x+.005,0,z],[x+.005,h,z],[x-.005,h,z]);
  petals(disc,group(),x,h,z,r,[0,1,0],5,random);
}
function nearChunk(variant){
  const size=C.chunk,random=rng(variant*97+11),dark=group(),light=group(),petal=group(),yellow=group();
  for(let k=0;k<680;k++){
    const g=random()<.42?light:dark;
    blade(g,random()*size,random()*size,.12+random()*random()*.42,.012+random()*.018,random()*TAU,.03+random()*.14);
  }
  // Daisies come in drifts, not evenly.
  const drifts=4+Math.floor(random()*4);
  for(let d=0;d<drifts;d++){
    const cx=random()*size,cz=random()*size,count=26+Math.floor(random()*40),spread=1+random()*2.8;
    for(let k=0;k<count;k++){
      const a=random()*TAU,r=Math.sqrt(random())*spread,x=Math.max(0,Math.min(size,cx+Math.cos(a)*r)),z=Math.max(0,Math.min(size,cz+Math.sin(a)*r));
      daisy(dark,petal,yellow,x,z,.22+random()*.3,.05+random()*.04,random);
    }
  }
  for(let k=0;k<9+variant*2;k++)buttercup(dark,yellow,random()*size,random()*size,.28+random()*.24,.034+random()*.02,random);
  return[piece(`mf_near_${variant}_dark`,dark,[.13,.3,.06],{emissive:[.015,.04,.008]}),piece(`mf_near_${variant}_light`,light,[.36,.56,.14],{emissive:[.06,.1,.02]}),
    piece(`mf_near_${variant}_petal`,petal,[.97,.97,.92],{emissive:[.46,.46,.42]}),piece(`mf_near_${variant}_yellow`,yellow,[.96,.74,.08],{emissive:[.5,.34,.02]})];
}
function farChunk(variant){
  const size=C.farChunk,random=rng(variant*53+7),grass=group(),white=group(),yellow=group();
  for(let k=0;k<620;k++){const x=random()*size,z=random()*size,h=.2+random()*.3,w=.1+random()*.14,yaw=random()*TAU;tri(grass,[x-Math.cos(yaw)*w,0,z-Math.sin(yaw)*w],[x+Math.cos(yaw)*w,0,z+Math.sin(yaw)*w],[x,h,z]);}
  const speck=(g,x,z,r)=>{quad(g,[x-r,.16,z],[x+r,.16,z],[x+r,.16+r*1.6,z],[x-r,.16+r*1.6,z]);quad(g,[x,.16,z-r],[x,.16,z+r],[x,.16+r*1.6,z+r],[x,.16+r*1.6,z-r]);};
  for(let d=0;d<7;d++){const cx=random()*size,cz=random()*size,spread=2+random()*5;for(let k=0;k<26;k++){const a=random()*TAU,r=Math.sqrt(random())*spread;speck(white,Math.max(0,Math.min(size,cx+Math.cos(a)*r)),Math.max(0,Math.min(size,cz+Math.sin(a)*r)),.12+random()*.1);}}
  for(let k=0;k<40;k++)speck(yellow,random()*size,random()*size,.09+random()*.07);
  return[piece(`mf_far_${variant}_grass`,grass,[.24,.42,.11]),piece(`mf_far_${variant}_white`,white,[.96,.96,.9],{emissive:[.44,.44,.4]}),piece(`mf_far_${variant}_yellow`,yellow,[.94,.72,.1],{emissive:[.46,.32,.03]})];
}
function ground(){
  const g=group(),R=420;
  quad(g,[-R,0,R],[R,0,R],[R,0,-R],[-R,0,-R]);
  return piece('mf_ground',g,[.17,.32,.08]);
}
// A low horizon, far enough off that nobody will ever reach it.
function hills(){
  const g=group(),random=rng(5),n=72,r0=300,top=[];
  for(let k=0;k<n;k++)top.push(5+random()*11+7*Math.sin(k*.31)+5*Math.sin(k*.09+1.2));
  for(let k=0;k<n;k++){
    const a=k/n*TAU,b=(k+1)/n*TAU,h0=top[k],h1=top[(k+1)%n];
    quad(g,[Math.cos(a)*r0,-1,Math.sin(a)*r0],[Math.cos(b)*r0,-1,Math.sin(b)*r0],[Math.cos(b)*r0,h1,Math.sin(b)*r0],[Math.cos(a)*r0,h0,Math.sin(a)*r0]);
  }
  return piece('mf_hills',g,[.62,.74,.8],{emissive:[.38,.47,.52],roughness:1});
}
function fence(){
  const post=group(),wire=group(),span=4,count=12;
  for(let k=0;k<count;k++){const z=-k*span;box(post,-.055,.055,0,1.18,z-.055,z+.055);}
  for(const y of[.42,.78,1.1])box(wire,-.008,.008,y-.008,y+.008,-(count-1)*span,0);
  return[piece('mf_fence_post',post,[.36,.27,.18],{roughness:1}),piece('mf_fence_wire',wire,[.42,.42,.4],{emissive:[.08,.08,.08],metallic:.4})];
}
function pole(){
  const g=group();box(g,-.09,.09,0,7.6,-.09,.09);box(g,-.75,.75,6.9,7.02,-.05,.05);box(g,-.75,.75,7.3,7.42,-.05,.05);
  return piece('mf_pole',g,[.2,.16,.12],{emissive:[.05,.04,.03],roughness:1});
}
function tree(){
  const trunk=group(),crown=group(),random=rng(19);
  box(trunk,-.45,.45,0,4.2,-.45,.45);
  for(let k=0;k<26;k++){
    const a=random()*TAU,d=random()*5,x=Math.cos(a)*d,z=Math.sin(a)*d,y=4.6+random()*5,r=1.6+random()*2.2;
    for(let f=0;f<6;f++){const t=f/6*TAU,e=TAU/6;tri(crown,[x,y+r,z],[x+Math.cos(t)*r,y,z+Math.sin(t)*r],[x+Math.cos(t+e)*r,y,z+Math.sin(t+e)*r]);tri(crown,[x,y-r*.7,z],[x+Math.cos(t+e)*r,y,z+Math.sin(t+e)*r],[x+Math.cos(t)*r,y,z+Math.sin(t)*r]);}
  }
  return[piece('mf_tree_trunk',trunk,[.2,.15,.1],{roughness:1}),piece('mf_tree_crown',crown,[.13,.28,.09],{emissive:[.05,.12,.03],roughness:1})];
}
// THE DOOR. A van's driver door and the opening it hangs in, and nothing else of the
// van: the wheel-arch cut out of its lower corner, a slanted screen pillar, a mirror
// on an arm. The leaf hangs from its local origin, so it swings by turning.
function plate(g,points,z0,z1){
  const n=points.length,at=([x,y],z)=>[x,y,z];
  for(let k=1;k<n-1;k++){tri(g,at(points[0],z1),at(points[k],z1),at(points[k+1],z1));tri(g,at(points[0],z0),at(points[k+1],z0),at(points[k],z0));}
  for(let k=0;k<n;k++){const a=points[k],b=points[(k+1)%n];quad(g,at(a,z1),at(a,z0),at(b,z0),at(b,z1));}
}
function strip(g,a,b,width,z0,z1){
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,nx=-dy/l*width/2,ny=dx/l*width/2;
  plate(g,[[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny],[a[0]+nx,a[1]+ny]],z0,z1);
}
function door(){
  const d=C.door,w=d.halfWidth*2,leaf=group(),glass=group(),trim=group(),metal=group(),post=group(),sill=group(),hole=group();
  const t=d.thick/2,waist=1.2,top=d.height-.09,front=.5,hw=d.halfWidth;
  plate(leaf,[[.03,.7],[.26,.38],[w-.03,.38],[w-.03,waist],[.03,waist]],-t,t);
  strip(leaf,[w-.06,waist],[w-.06,top],.07,-t,t);strip(leaf,[w-.06,top],[front,top],.07,-t,t);strip(leaf,[front,top],[.06,waist],.07,-t,t);
  plate(glass,[[.11,waist],[w-.1,waist],[w-.1,top-.04],[front+.03,top-.04]],-.012,.012);
  strip(trim,[.08,waist-.02],[w-.03,waist-.02],.035,-t-.006,t+.006);
  strip(trim,[.3,.54],[w-.03,.54],.03,-t-.005,t+.005);
  strip(trim,[.03,.7],[.26,.38],.03,-t-.005,t+.005);
  // The handle, and the mirror out on its arm.
  box(metal,w-.3,w-.09,1.02,1.07,t,t+.04);
  box(trim,-.08,.12,waist+.06,waist+.1,t,t+.03);
  box(trim,-.36,-.1,waist-.06,waist+.24,t,t+.1);
  box(post,hw,hw+.09,0,d.height,-.09,.09);
  box(post,-hw-.09,-hw,0,waist,-.09,.09);
  const off=-hw;
  strip(post,[off+.02,waist],[off+front-.02,d.height],.09,-.09,.09);
  strip(post,[off+front-.02,d.height],[hw+.09,d.height],.09,-.09,.09);
  box(sill,-hw-.34,hw+.34,0,.1,-.42,.42);
  box(sill,-hw,hw,.1,.34,-.08,.08);
  plate(hole,[[-hw,.34],[hw,.34],[hw,d.height-.04],[off+front,d.height-.04],[off+.06,waist]],-.004,.004);
  return[piece('mf_door_leaf',leaf,[.93,.93,.89],{emissive:[.34,.34,.32],roughness:.42}),
    piece('mf_door_glass',glass,[.1,.16,.2],{emissive:[.015,.03,.04],roughness:.06,metallic:.7}),
    piece('mf_door_trim',trim,[.03,.03,.03],{emissive:[0,0,0]}),
    piece('mf_door_metal',metal,[.5,.5,.5],{emissive:[.06,.06,.06],metallic:.8,roughness:.3}),
    piece('mf_door_post',post,[.86,.86,.82],{emissive:[.28,.28,.26],roughness:.5}),
    piece('mf_door_sill',sill,[.34,.32,.28],{emissive:[.06,.06,.05],roughness:1}),
    piece('mf_door_hole',hole,[.015,.06,.07],{emissive:[.008,.035,.042],roughness:1})];
}
// A hero daisy, face along local +Z, for the few nearest that can turn to look at him.
function heroDaisy(){
  const stem=group(),petal=group(),disc=group(),random=rng(101);
  petals(petal,disc,0,0,0,.075,[0,0,1],14,random);
  // A unit stem, standing on its root. Scaled by whoever needs one.
  for(const[a,b]of[[[-.012,0],[.012,0]],[[0,-.012],[0,.012]]])quad(stem,[a[0],-1,a[1]],[b[0],-1,b[1]],[b[0],0,b[1]],[a[0],0,a[1]]);
  return[piece('mf_hero_petal',petal,[.98,.98,.94],{emissive:[.5,.5,.46]}),piece('mf_hero_disc',disc,[.97,.76,.08],{emissive:[.52,.36,.02]}),piece('mf_hero_stem',stem,[.2,.42,.1],{emissive:[.04,.09,.02]})];
}
function hubcap(){
  const g=group(),n=20,R=.19;
  for(let k=0;k<n;k++){const a=k/n*TAU,b=(k+1)/n*TAU;tri(g,[0,.05,0],[Math.cos(b)*R,.012,Math.sin(b)*R],[Math.cos(a)*R,.012,Math.sin(a)*R]);quad(g,[Math.cos(a)*R,.012,Math.sin(a)*R],[Math.cos(b)*R,.012,Math.sin(b)*R],[Math.cos(b)*R,0,Math.sin(b)*R],[Math.cos(a)*R,0,Math.sin(a)*R]);}
  return piece('mf_hubcap',g,[.78,.78,.76],{emissive:[.16,.16,.15],metallic:.9,roughness:.2});
}
// Green, the cuffs pulled long, hung over the top wire. Nobody says whose.
function jumper(){
  const g=group();
  box(g,-.3,.3,-.42,.02,-.04,.04);box(g,-.42,-.3,-.62,.02,-.03,.03);box(g,.3,.42,-.62,.02,-.03,.03);
  box(g,-.32,.32,.015,.04,-.06,.06);
  return piece('mf_jumper',g,[.31,.48,.27],{emissive:[.09,.15,.08],roughness:1});
}
// A CARRIER BAG. Four crumples of the same bag, cycled so that it moves like one.
export function theBagGeometry(){
  return[0,1,2,3].map(frame=>{
    const g=group(),random=rng(frame*17+3),rows=6,cols=10,R=.21,H=.36,surface=[];
    for(let r=0;r<=rows;r++){
      const v=r/rows,row=[];
      for(let c=0;c<cols;c++){
        const a=c/cols*TAU,crumple=.72+.5*random()+.12*Math.sin(a*3+frame*1.7+v*5),pinch=Math.sin(v*Math.PI*.92+.14);
        row.push([Math.cos(a)*R*crumple*pinch*(1+.2*v),v*H+(random()-.5)*.03+.05*Math.sin(a*2+frame),Math.sin(a)*R*crumple*pinch*(.62+.2*v)]);
      }
      surface.push(row);
    }
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const d=(c+1)%cols,a=surface[r][c],b=surface[r][d],e=surface[r+1][d],f=surface[r+1][c];
      quad(g,a,b,e,f);quad(g,a,f,e,b);
    }
    for(const side of[-1,1]){
      const y=H,x0=side*R*.34,sway=.03*Math.sin(frame*1.9+side);
      for(let k=0;k<6;k++){const t=k/6*Math.PI,e=(k+1)/6*Math.PI,w=.035;
        quad(g,[x0+Math.cos(t)*R*.3,y+Math.sin(t)*.13+sway,-w],[x0+Math.cos(e)*R*.3,y+Math.sin(e)*.13+sway,-w],[x0+Math.cos(e)*R*.3,y+Math.sin(e)*.13+sway,w],[x0+Math.cos(t)*R*.3,y+Math.sin(t)*.13+sway,w]);
        quad(g,[x0+Math.cos(t)*R*.3,y+Math.sin(t)*.13+sway,w],[x0+Math.cos(e)*R*.3,y+Math.sin(e)*.13+sway,w],[x0+Math.cos(e)*R*.3,y+Math.sin(e)*.13+sway,-w],[x0+Math.cos(t)*R*.3,y+Math.sin(t)*.13+sway,-w]);
      }
    }
    return piece(`the_bag_${frame}`,g,[.96,.96,.93],{emissive:[.4,.4,.38],roughness:.55});
  });
}
export const THE_BAG_MESHES=Object.freeze([0,1,2,3].map(frame=>`the_bag_${frame}`));
function faults(){
  return sourceAmbientFaultGeometry({palettePrefix:'mf_fault',sites:[{id:'mf',x:0,y:3,z:0,count:34,spreadX:44,spreadY:5,spreadZ:44,seed:61,size:3.4}]})
    .map(g=>({name:g.name,p:g.p,i:g.i,base:g.base,emissive:g.emissive,roughness:g.roughness,materialRole:g.materialRole,fault:true}));
}

let library=null;
export function memoryFieldGeometry(){
  if(library)return library;
  const rows=[ground(),hills(),pole(),hubcap(),jumper(),...fence(),...tree(),...door(),...heroDaisy(),...theBagGeometry(),...faults()];
  for(let v=0;v<C.variants;v++)rows.push(...nearChunk(v));
  for(let v=0;v<3;v++)rows.push(...farChunk(v));
  library=Object.freeze(rows);return library;
}
export function memoryGeometryBounds(row){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<row.p.length;k+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],row.p[k+a]);max[a]=Math.max(max[a],row.p[k+a]);}
  return{min,max};
}
