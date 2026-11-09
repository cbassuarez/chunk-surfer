// Small, low, ordinary. Daisies, dandelions and clover, built here because the packs don't
// have them, to sit beside the packs' own nettles and weeds. Broad flat shapes, and bigger
// than life: at true size a daisy is two of the print's cells at three metres, and gone.
// In this print an unlit white head is a black disc with a dotted rim, so the flowers are
// given a little light per instance (data/ellery-flora.js). A fixed seed per mesh: every one
// of them is the same plant every time, so the opening is the same opening.
import * as P3 from './props3d.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

const TAU=Math.PI*2;
function rng(seed){let s=(seed*2654435761)>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const group=()=>({p:[],i:[]});
function tri(g,a,b,c){const o=g.p.length/3;g.p.push(...a,...b,...c);g.i.push(o,o+1,o+2,o,o+2,o+1);}
const quad=(g,a,b,c,d)=>{tri(g,a,b,c);tri(g,a,c,d);};
// A head on its stem, leaning the way a daisy leans, towards the light and towards the mesh's
// local +z, which is the way the road comes from. Dead flat they are a line a pixel thick from
// a van's cab, and only the stems are left. `collar` is the dark under it, in the leaf mesh,
// which stays unlit: on a verge the headlamps have blown out it's the only outline it has.
function head(petal,disc,collar,x,y,z,r,count,random){
  const tx=(random()-.5)*.45,tz=-(.62+random()*.3),at=(a,d,lift=0)=>[x+Math.cos(a)*d,y+Math.cos(a)*d*tx+Math.sin(a)*d*tz+lift,z+Math.sin(a)*d];
  const start=random()*TAU,w=TAU/count*.96;
  for(let k=0;k<10;k++){const a=k/10*TAU,b=(k+1)/10*TAU,c=r*(petal?1.26:1.32);tri(collar,at(0,0,-.012),at(a,c,-.012),at(b,c,-.012));}
  if(petal)for(let k=0;k<count;k++){const a=start+k/count*TAU;quad(petal,at(a-w*.5,r*.25),at(a+w*.5,r*.25),at(a+w*.62,r*.84),at(a-w*.62,r*.84));tri(petal,at(a-w*.62,r*.84),at(a+w*.62,r*.84),at(a,r*1.04));}
  const inner=petal?r*.34:r;
  for(let k=0;k<10;k++){const a=k/10*TAU,b=(k+1)/10*TAU;tri(disc,at(0,0,.004),at(a,inner,.003),at(b,inner,.003));}
}
const stem=(g,x,z,h,lean=.02)=>{quad(g,[x-.006,0,z],[x+.006,0,z],[x+.006+lean,h,z],[x-.006+lean,h,z]);};
// A rosette of low broad leaves, the part nobody looks at.
function rosette(g,x,z,r,count,random){
  for(let k=0;k<count;k++){
    const a=random()*TAU,l=r*(.6+random()*.5),w=.012+random()*.018,c=Math.cos(a),s=Math.sin(a),px=-s*w,pz=c*w,y=.012+random()*.03;
    quad(g,[x+px,y*.3,z+pz],[x-px,y*.3,z-pz],[x+c*l-px*.6,y,z+s*l-pz*.6],[x+c*l+px*.6,y,z+s*l+pz*.6]);
  }
}
const row=(name,g,base,emissive)=>Object.freeze({name,p:g.p,i:g.i,base:[...base,1],emissive,roughness:1,metallic:0});
let library=null;
export function floraGeometry(){
  if(library)return library;
  const rows=[];
  {
    // Compact autumn border mums: branching leafy stems and dense, nested
    // incurved petals. Their domed heads read differently from the low daisies.
    const random=rng(67),green=group(),flower=group();
    for(let k=0;k<7;k++){
      const a=k/7*TAU+.2,d=k===0?0:.19+random()*.19,x=Math.cos(a)*d,z=Math.sin(a)*d*.85,h=.28+random()*.15;
      stem(green,x,z,h,.012);rosette(green,x,z,.17,7,random);
      for(const t of[.36,.62]){
        const sign=k%2?1:-1;
        quad(green,[x,h*t,z],[x+sign*.075,h*t+.065,z-.03],
          [x+sign*.14,h*t+.045,z+.015],[x+sign*.055,h*t-.012,z+.035]);
      }
      const r=.085+random()*.025,turn=random()*TAU;
      for(let layer=0;layer<3;layer++){
        const count=16-layer*3,radius=r*(1-layer*.24),rise=layer*.020;
        const at=(angle,distance,lift)=>[x+.012+Math.cos(angle)*distance,
          h+rise-Math.sin(angle)*distance*.45+lift,z+Math.sin(angle)*distance];
        for(let p=0;p<count;p++){
          const angle=turn+p/count*TAU+layer*.27,w=TAU/count*.37;
          quad(flower,at(angle-w,radius*.16,.004),at(angle+w,radius*.16,.004),
            at(angle+w,radius*.68,.018),at(angle-w,radius*.68,.018));
          tri(flower,at(angle-w,radius*.68,.018),at(angle+w,radius*.68,.018),at(angle,radius,.006));
        }
      }
    }
    rows.push(row('vegetation_chrysanthemum_clump',green,[.09,.16,.065],[.006,.011,.004]),
      row('vegetation_chrysanthemum_clump_flowers',flower,[.78,.64,.34],[.44,.33,.12]));
  }
  {
    const random=rng(21),petal=group(),disc=group(),green=group();
    for(let k=0;k<9;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.6,x=Math.cos(a)*d,z=Math.sin(a)*d*.8,h=.08+random()*.16;
      const r=.068+random()*.026;
      stem(green,x,z,h);rosette(green,x,z,.14,3,random);
      head(petal,disc,green,x+.02,h,z,r,9,random);
    }
    rows.push(row('vegetation_daisy_drift_petals',petal,[.95,.95,.9],[.74,.74,.68]),row('vegetation_daisy_drift_eyes',disc,[.92,.68,.08],[.72,.48,.04]),row('vegetation_daisy_drift',green,[.08,.17,.045],[.006,.012,.003]));
  }
  {
    const random=rng(33),disc=group(),green=group();
    for(let k=0;k<5;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.34,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.1+random()*.13;
      const r=.052+random()*.016;
      stem(green,x,z,h,.012);rosette(green,x,z,.22,7,random);
      head(null,disc,green,x+.012,h,z,r,0,random);
    }
    rows.push(row('vegetation_dandelions_heads',disc,[.93,.66,.05],[.7,.46,.03]),row('vegetation_dandelions',green,[.09,.18,.05],[.007,.013,.004]));
  }
  {
    const random=rng(45),mat=group(),flower=group();
    for(let k=0;k<46;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.56,x=Math.cos(a)*d,z=Math.sin(a)*d*.82,y=.03+random()*.05;
      for(let f=0;f<3;f++){const t=f/3*TAU+random(),l=.05+random()*.018;tri(mat,[x,y,z],[x+Math.cos(t-.5)*l,y,z+Math.sin(t-.5)*l],[x+Math.cos(t+.5)*l,y,z+Math.sin(t+.5)*l]);}
    }
    for(let k=0;k<5;k++){const a=random()*TAU,d=Math.sqrt(random())*.42,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.09+random()*.04;stem(mat,x,z,h,.008);head(null,flower,mat,x+.008,h,z,.038,0,random);}
    rows.push(row('vegetation_clover_mat',mat,[.08,.17,.065],[.006,.012,.005]),row('vegetation_clover_mat_flowers',flower,[.82,.72,.78],[.56,.48,.52]));
  }
  library=Object.freeze(rows);return library;
}
export const FLORA_MESH_NAMES=Object.freeze(['vegetation_daisy_drift','vegetation_daisy_drift_petals','vegetation_daisy_drift_eyes','vegetation_dandelions','vegetation_dandelions_heads','vegetation_clover_mat','vegetation_clover_mat_flowers','vegetation_chrysanthemum_clump','vegetation_chrysanthemum_clump_flowers']);
function payload(item){
  const count=item.i.length,positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);
  for(let k=0;k<count;k+=3){
    const a=item.i[k]*3,b=item.i[k+1]*3,c=item.i[k+2]*3,p=item.p;
    const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;if(ny<0){nx=-nx;ny=-ny;nz=-nz;}
    for(let j=0;j<3;j++){const q=item.i[k+j]*3,at=(k+j)*3;positions[at]=p[q];positions[at+1]=p[q+1];positions[at+2]=p[q+2];normals[at]=nx/l;normals[at+1]=ny/l;normals[at+2]=nz/l;uvs[(k+j)*2]=p[q];uvs[(k+j)*2+1]=p[q+2];}
  }
  return{positions,normals,uvs,indices:Uint32Array.from({length:count},(_,k)=>k)};
}
function bounds(items){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const item of items)for(let k=0;k<item.p.length;k+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],item.p[k+a]);max[a]=Math.max(max[a],item.p[k+a]);}
  return{min,max};
}
// One catalog entry to each part. Flowers and leaves are separate on purpose: the world's
// prop shader only lets a per-instance glow straight through, and the leaves mustn't have it.
function install(gl,pack){
  if(!gl||!pack?.catalog)return false;
  for(const item of floraGeometry()){
    if(pack.catalog.has(item.name))continue;
    const d=payload(item),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
    gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    pack.catalog.set(item.name,{name:item.name,nodeMatrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),instanceBuffer,extras:{flora:true,triangles:d.indices.length/3,bounds:bounds([item])},primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:item.base,emissive:item.emissive,materialFactors:'gltf',metallic:0,roughness:1,aoStrength:1,portrait:false,alphaCut:0,materialName:item.name,nativeReceiverGeometry:d}]});
  }
  gl.bindVertexArray(null);return true;
}
export function ensureFloraMeshes(props=P3){
  if(props.propMeshCatalog?.().includes(FLORA_MESH_NAMES.at(-1)))return true;
  return props.installAuthoredPropMeshes?.(install)===true;
}
