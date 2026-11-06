// Small, low, ordinary. Daisies, dandelions and clover, built here because the packs don't
// have them, to sit beside the packs' own nettles and weeds. Broad flat shapes, because the
// game's print eats anything finer. A fixed seed per mesh: every one of them is the same
// plant every time, so the opening is the same opening.
import * as P3 from './props3d.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

const TAU=Math.PI*2;
function rng(seed){let s=(seed*2654435761)>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const group=()=>({p:[],i:[]});
function tri(g,a,b,c){const o=g.p.length/3;g.p.push(...a,...b,...c);g.i.push(o,o+1,o+2,o,o+2,o+1);}
const quad=(g,a,b,c,d)=>{tri(g,a,b,c);tri(g,a,c,d);};
// A head looking mostly up, tilted a little to wherever.
function head(petal,disc,x,y,z,r,count,random){
  const tx=(random()-.5)*.5,tz=(random()-.5)*.5,at=(a,d,lift=0)=>[x+Math.cos(a)*d,y+Math.cos(a)*d*tx+Math.sin(a)*d*tz+lift,z+Math.sin(a)*d];
  const start=random()*TAU,w=TAU/count*.62;
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
    const random=rng(21),petal=group(),disc=group(),green=group();
    for(let k=0;k<13;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.55,x=Math.cos(a)*d,z=Math.sin(a)*d*.8,h=.07+random()*.17;
      stem(green,x,z,h);rosette(green,x,z,.1,3,random);
      head(petal,disc,x,h,z,.036+random()*.018,9,random);
    }
    rows.push(row('vegetation_daisy_drift_petal',petal,[.95,.95,.9],[.16,.16,.15]),row('vegetation_daisy_drift_disc',disc,[.92,.68,.08],[.14,.09,.01]),row('vegetation_daisy_drift_leaf',green,[.14,.28,.08],[.012,.024,.007]));
  }
  {
    const random=rng(33),disc=group(),green=group();
    for(let k=0;k<5;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.34,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.1+random()*.13;
      stem(green,x,z,h,.012);rosette(green,x,z,.17,7,random);
      head(null,disc,x,h,z,.034+random()*.012,0,random);
    }
    rows.push(row('vegetation_dandelions_head',disc,[.93,.66,.05],[.15,.09,.01]),row('vegetation_dandelions_leaf',green,[.17,.31,.09],[.014,.026,.008]));
  }
  {
    const random=rng(45),mat=group(),flower=group();
    for(let k=0;k<70;k++){
      const a=random()*TAU,d=Math.sqrt(random())*.56,x=Math.cos(a)*d,z=Math.sin(a)*d*.82,y=.03+random()*.05;
      for(let f=0;f<3;f++){const t=f/3*TAU+random(),l=.03+random()*.012;tri(mat,[x,y,z],[x+Math.cos(t-.5)*l,y,z+Math.sin(t-.5)*l],[x+Math.cos(t+.5)*l,y,z+Math.sin(t+.5)*l]);}
    }
    for(let k=0;k<5;k++){const a=random()*TAU,d=Math.sqrt(random())*.42,x=Math.cos(a)*d,z=Math.sin(a)*d,h=.09+random()*.04;stem(mat,x,z,h,.008);head(null,flower,x,h,z,.024,0,random);}
    rows.push(row('vegetation_clover_mat_leaf',mat,[.13,.27,.11],[.011,.023,.009]),row('vegetation_clover_mat_flower',flower,[.82,.72,.78],[.11,.09,.1]));
  }
  library=Object.freeze(rows);return library;
}
export const FLORA_MESH_NAMES=Object.freeze(['vegetation_daisy_drift','vegetation_dandelions','vegetation_clover_mat']);
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
// One catalog entry to a plant, with one primitive to a colour, as the packs' plants have.
function install(gl,pack){
  if(!gl||!pack?.catalog)return false;
  for(const name of FLORA_MESH_NAMES){
    if(pack.catalog.has(name))continue;
    const items=floraGeometry().filter(item=>item.name.startsWith(name+'_')),instanceBuffer=gl.createBuffer(),primitives=[];let triangles=0;
    for(const item of items){
      const d=payload(item),vao=gl.createVertexArray();gl.bindVertexArray(vao);
      for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}
      for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
      gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
      triangles+=d.indices.length/3;
      primitives.push({vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:item.base,emissive:item.emissive,materialFactors:'gltf',metallic:0,roughness:1,aoStrength:1,portrait:false,alphaCut:0,materialName:item.name,nativeReceiverGeometry:d});
    }
    pack.catalog.set(name,{name,nodeMatrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),instanceBuffer,extras:{flora:true,triangles,bounds:bounds(items)},primitives});
  }
  gl.bindVertexArray(null);return true;
}
export function ensureFloraMeshes(props=P3){
  if(props.propMeshCatalog?.().includes(FLORA_MESH_NAMES.at(-1)))return true;
  return props.installAuthoredPropMeshes?.(install)===true;
}
