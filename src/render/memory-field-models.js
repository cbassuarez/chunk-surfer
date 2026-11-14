// THE FIELD'S THINGS, in local metres. Grass, daisies and buttercups in repeating
// squares, a van door, a fence, the jumper, and one white carrier bag, which is also
// the bag in the real world (world/the-bag.js), so that it is the same bag.
import {MEMORY_FIELD as C,MEMORY_FIELD_ANT as ANT} from '../data/memory-field.js';
import {memoryFieldVanDoorGeometry} from './memory-field-van-door.js';
import {memoryFieldJumperGeometry} from './memory-field-jumper.js';
import {memoryFieldFarLandmarkGeometry} from './memory-field-far-landmarks.js';
import {memoryFieldSlabGeometry} from './memory-field-slab.js';
import {memoryFieldAntGeometry} from './memory-field-ant-rig.js';
import {sourceAmbientFaultGeometry} from './source-ambient-fault-geometry.js';

const TAU=Math.PI*2;
function rng(seed){let s=(seed*2654435761)>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const group=()=>({p:[],i:[]});
function tri(g,a,b,c){const o=g.p.length/3;g.p.push(...a,...b,...c);g.i.push(o,o+1,o+2);}
function quad(g,a,b,c,d){tri(g,a,b,c);tri(g,a,c,d);}
const piece=(name,g,base,{emissive=null,roughness=.9,metallic=0,materialRole=undefined,vegetationClass,vegetationTransmission,vegetationWetness}={})=>Object.freeze({name,p:g.p,i:g.i,base:[...base,1],emissive:emissive||[base[0]*.14,base[1]*.14,base[2]*.14],roughness,metallic,materialRole,vegetationClass,vegetationTransmission,vegetationWetness});

// A curved, folded blade with a ridge that catches light at low eye height.
function blade(g,x,z,h,w,yaw,lean,fold=true){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const at=(t,width)=>[x-s*lean*t*t+c*width,h*t,z+c*lean*t*t+s*width];
  const root=[at(0,-w*.50),at(0,0),at(0,w*.5)];
  const knee=[at(.43,-w),at(.48,0),at(.43,w)];
  knee[1][0]-=s*w*.55;knee[1][2]+=c*w*.55;
  const tip=at(1,0);
  if(fold){
    quad(g,root[0],root[1],knee[1],knee[0]);quad(g,root[1],root[2],knee[2],knee[1]);
    tri(g,knee[0],knee[1],tip);tri(g,knee[1],knee[2],tip);
  }else{
    quad(g,root[0],root[2],knee[2],knee[0]);tri(g,knee[0],knee[2],tip);
  }
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
function nearChunk(variant,clip=null){
  const size=C.chunk,random=rng(variant*97+11),dark=group(),light=group(),petal=group(),yellow=group();
  const show=(x,z)=>!clip||Math.hypot(x+clip.x-ANT.slab.x,z+clip.z-ANT.slab.z)>ANT.patch*.94;
  for(let k=0;k<245;k++){
    const x=.16+random()*(size-.32),z=.16+random()*(size-.32);
    const tall=.11+random()*random()*.37,az=random()*TAU;
    const blades=2+Math.floor(random()*3);
    for(let leaf=0;leaf<blades;leaf++){
      const g=random()<.42?light:dark;
      const a=az+leaf*2.38,length=.012+.080*random();
      const rx=x+Math.cos(a)*length,rz=z+Math.sin(a)*length;
      const h=tall*(.64+.48*random()),w=.007+.013*random(),lean=.047+.13*random();
      if(show(rx,rz))blade(g,rx,rz,h,w,a,lean,k%4===0);
    }
  }
  // Pollinator flowers colonize clusters between short and tall grass.
  const drifts=3+Math.floor(random()*3);
  for(let d=0;d<drifts;d++){
    const cx=random()*size,cz=random()*size,count=15+Math.floor(random()*17),spread=1.1+random()*2.1;
    for(let k=0;k<count;k++){
      const a=random()*TAU,r=Math.sqrt(random())*spread,x=Math.max(0,Math.min(size,cx+Math.cos(a)*r)),z=Math.max(0,Math.min(size,cz+Math.sin(a)*r));
      const h=.19+random()*.25,head=.026+random()*.029;
      // Consume the same samples across the clipped and regular tile.
      if(show(x,z))daisy(dark,petal,yellow,x,z,h,head,random);
      else daisy(group(),group(),group(),x,z,h,head,random);
    }
  }
  for(let k=0;k<9+variant*2;k++){
    const x=random()*size,z=random()*size,h=.18+random()*.19,r=.018+random()*.011;
    if(show(x,z))buttercup(dark,yellow,x,z,h,r,random);
    else buttercup(group(),group(),x,z,h,r,random);
  }
  const name=clip?`mf_slabsurround_${clip.x/C.chunk}_${clip.z/C.chunk}_${variant}`:`mf_near_${variant}`;
  const grass={roughness:.78,vegetationClass:'leaf',vegetationTransmission:.33,vegetationWetness:.37};
  return[piece(name+'_dark',dark,[.127,.229,.057],{...grass,emissive:[.020,.035,.010]}),
    piece(name+'_light',light,[.28,.39,.089],{...grass,emissive:[.028,.046,.012]}),
    piece(name+'_petal',petal,[.80,.77,.62],{emissive:[.25,.235,.20]}),
    piece(name+'_yellow',yellow,[.76,.51,.047],{emissive:[.23,.13,.011]})];
}
function farChunk(variant){
  const size=C.farChunk,random=rng(variant*53+7),grass=group(),white=group(),yellow=group();
  for(let k=0;k<620;k++){const x=random()*size,z=random()*size,h=.2+random()*.3,w=.1+random()*.14,yaw=random()*TAU;tri(grass,[x-Math.cos(yaw)*w,0,z-Math.sin(yaw)*w],[x+Math.cos(yaw)*w,0,z+Math.sin(yaw)*w],[x,h,z]);}
  const speck=(g,x,z,r)=>{quad(g,[x-r,.16,z],[x+r,.16,z],[x+r,.16+r*1.6,z],[x-r,.16+r*1.6,z]);quad(g,[x,.16,z-r],[x,.16,z+r],[x,.16+r*1.6,z+r],[x,.16+r*1.6,z-r]);};
  for(let d=0;d<7;d++){const cx=random()*size,cz=random()*size,spread=2+random()*5;for(let k=0;k<26;k++){const a=random()*TAU,r=Math.sqrt(random())*spread;speck(white,Math.max(0,Math.min(size,cx+Math.cos(a)*r)),Math.max(0,Math.min(size,cz+Math.sin(a)*r)),.12+random()*.1);}}
  for(let k=0;k<40;k++)speck(yellow,random()*size,random()*size,.09+random()*.07);
  return[piece(`mf_far_${variant}_grass`,grass,[.105,.198,.06],{emissive:[.024,.03,.011]}),piece(`mf_far_${variant}_white`,white,[.70,.69,.56],{emissive:[.18,.16,.132]}),piece(`mf_far_${variant}_yellow`,yellow,[.69,.47,.106],{emissive:[.21,.12,.017]})];
}
function ground(){
  const patches=[group(),group(),group()],size=36,n=25,step=size/n,random=rng(693);
  const points=Array.from({length:n+1},(_,j)=>Array.from({length:n+1},(_,i)=>[
    i*step-size*.5+(i>0&&i<n?(random()-.5)*step*.55:0),0,j*step-size*.5+(j>0&&j<n?(random()-.5)*step*.55:0),
  ]));
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const dampness=.5+.28*Math.sin(i*.42+j*.28)+.14*Math.cos(j*.69-i*.23);
    const value=dampness+(random()-.5)*.21,g=patches[value<.33?0:value>.67?2:1];
    quad(g,points[j+1][i],points[j+1][i+1],points[j][i+1],points[j][i]);
  }
  const far=group(),radius=460;
  quad(far,[-radius,-.009,radius],[radius,-.009,radius],[radius,-.009,-radius],[-radius,-.009,-radius]);
  return[
    piece('mf_ground',far,[.105,.131,.060],{emissive:[.014,.016,.008],roughness:.99}),
    ...patches.map((g,i)=>piece(`mf_turf_${i}`,g,[[.135,.158,.072],[.149,.178,.080],[.171,.203,.093]][i],
      {emissive:[.012,.014,.007],roughness:.99,vegetationClass:'soil'})),
  ];
}
// Three-dimensional low hills with visible shoulders and a distant hedge.
// All ranges share this fixed meadow origin.
function hills(){
  const g=group(),n=88,ring=(k,row)=>{
    const angle=k/n*TAU,drift=26*Math.sin(angle*3+.9)+11*Math.sin(angle*7-.3);
    const rad=[241,274,310,349][row]+drift;
    const height=Math.max(4,20+9*Math.sin(angle*2+.8)+11*Math.sin(angle*4-1.2)+4*Math.sin(angle*9+.7));
    return[Math.cos(angle)*rad,[-.5,.53*height,height,0][row],Math.sin(angle)*rad];
  };
  for(let k=0;k<n;k++)for(let row=0;row<3;row++)quad(g,ring(k,row),ring(k+1,row),ring(k+1,row+1),ring(k,row+1));
  return piece('mf_hills',g,[.193,.245,.213],{emissive:[.15,.188,.168],roughness:1});
}
// A hero daisy, face along local +Z, for the few nearest that can turn to look at him.
function heroDaisy(){
  const stem=group(),petal=group(),disc=group(),random=rng(101);
  petals(petal,disc,0,0,0,.071,[0,0,1],14,random);
  // A unit stem, standing on its root. Scaled by whoever needs one.
  for(const[a,b]of[[[-.012,0],[.012,0]],[[0,-.012],[0,.012]]])quad(stem,[a[0],-1,a[1]],[b[0],-1,b[1]],[b[0],0,b[1]],[a[0],0,a[1]]);
  for(const side of [-1,1]){
    const y=side>0?-.48:-.67,base=[0,y,0],tip=[side*.038,y+.21,.009];
    tri(stem,base,[side*.024,y+.105,.017],tip);tri(stem,base,tip,[side*.034,y+.10,-.012]);
  }
  return[piece('mf_hero_petal',petal,[.86,.82,.69],{emissive:[.28,.26,.21]}),piece('mf_hero_disc',disc,[.86,.59,.073],{emissive:[.30,.19,.012]}),piece('mf_hero_stem',stem,[.17,.31,.068],{emissive:[.028,.058,.012]})];
}
function hubcap(){
  const g=group(),n=20,R=.19;
  for(let k=0;k<n;k++){const a=k/n*TAU,b=(k+1)/n*TAU;tri(g,[0,.05,0],[Math.cos(b)*R,.012,Math.sin(b)*R],[Math.cos(a)*R,.012,Math.sin(a)*R]);quad(g,[Math.cos(a)*R,.012,Math.sin(a)*R],[Math.cos(b)*R,.012,Math.sin(b)*R],[Math.cos(b)*R,0,Math.sin(b)*R],[Math.cos(a)*R,0,Math.sin(a)*R]);}
  return piece('mf_hubcap',g,[.78,.78,.76],{emissive:[.16,.16,.15],metallic:.9,roughness:.2});
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
  const rows=[...ground(),hills(),hubcap(),...memoryFieldJumperGeometry(),...memoryFieldFarLandmarkGeometry(),...memoryFieldVanDoorGeometry(),...heroDaisy(),...theBagGeometry(),...faults(),
    ...memoryFieldSlabGeometry(),...memoryFieldAntGeometry()];
  for(let v=0;v<C.variants;v++){
    rows.push(...nearChunk(v));
    for(const x of[-C.chunk,0])for(const z of[-C.chunk,0])rows.push(...nearChunk(v,{x,z}));
  }
  for(let v=0;v<3;v++)rows.push(...farChunk(v));
  library=Object.freeze(rows);return library;
}
export function memoryGeometryBounds(row){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<row.p.length;k+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],row.p[k+a]);max[a]=Math.max(max[a],row.p[k+a]);}
  return{min,max};
}
