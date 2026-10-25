// Isolated chapter-departure paint and the player's caught field case. No
// existing room/ear/recorder asset is rewritten or copied into a global pack.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';
import {BoxGeometry,CylinderGeometry,TorusGeometry,BufferGeometry,Float32BufferAttribute,Vector3,Quaternion,Matrix4} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('The building asks for the physical tape'),groups=new Map();
const material=(name,rgb,roughness,metallic=0,extras={})=>doc.createMaterial(name).setBaseColorFactor([...rgb,1]).setRoughnessFactor(roughness).setMetallicFactor(metallic).setExtras({materialFactors:'gltf',...extras});
const paint=(polarity)=>({printedSurface:{version:1,coverage:'solid',polarity,process:'wet hand-painted demand',emission:'none'},letteringFinish:{version:1,profile:'brush-paint',localSpecular:true}});
const mats=[material('tape demand solid oxblood pigment',[.22,.045,.025],.56,0,paint('dark-on-light')),
  material('tape demand old cream pigment',[.47,.35,.23],.61,0,paint('light-on-dark')),
  material('field case dark woven canvas',[.078,.068,.047],.88),material('field case black leather edging',[.029,.024,.018],.62),
  material('case hardware dull nickel',[.30,.31,.29],.33,.84,{letteringFinish:{version:1,profile:'bare-metal',localSpecular:true}}),
  material('case coarse cotton webbing',[.22,.18,.115],.93),material('case seam cotton',[.37,.29,.17],.91),material('wall fissure',[.012,.009,.007],1),material('wall crushed lime edge',[.23,.205,.17],.98)];
function geometry(g,mat,at=[0,0,0],scale=[1,1,1],q=new Quaternion()){
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at),q,new Vector3(...scale)));
  const p=groups.get(mat)||{positions:[],normals:[],uvs:[],indices:[]},base=p.positions.length/3;
  p.positions.push(...g.attributes.position.array);p.normals.push(...g.attributes.normal.array);
  p.uvs.push(...(g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2)));
  p.indices.push(...Array.from(g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i),v=>v+base));groups.set(mat,p);g.dispose();
}
function finish(name){const mesh=doc.createMesh(name);for(const[mat,p]of groups){const attr=(array,type,index=false)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(index?new Uint32Array(array):new Float32Array(array));mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',attr(p.positions,'VEC3')).setAttribute('NORMAL',attr(p.normals,'VEC3')).setAttribute('TEXCOORD_0',attr(p.uvs,'VEC2')).setIndices(attr(p.indices,'SCALAR',true)).setMaterial(mats[mat]));}scene.addChild(doc.createNode(name).setMesh(mesh));groups.clear();}
const box=(size,at,mat,radius=.008)=>geometry(new RoundedBoxGeometry(...size,2,radius),mat,at);
const beam=(a,b,r,mat,sides=8)=>{const delta=new Vector3(...b).sub(new Vector3(...a));geometry(new CylinderGeometry(r,r,delta.length(),sides),mat,a.map((v,i)=>(v+b[i])/2),[1,1,1],new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));};
// The same human stroke logic as the Ear Room: continuous, variable-width
// filled ribbons, pressure at starts, occasional second pushes and gravity.
const glyphs={
  G:[.78,[[[.72,.86],[.51,1],[.25,.95],[.06,.72],[.06,.29],[.23,.04],[.51,0],[.72,.17],[.72,.45],[.43,.45]]]],
  I:[.22,[[[.11,1],[.11,0]]]],V:[.76,[[[.03,1],[.37,0],[.73,1]]]],
  E:[.64,[[[.62,1],[.06,1],[.06,0],[.62,0]],[[.06,.52],[.47,.52]]]],
  M:[.90,[[[.05,0],[.09,1],[.44,.34],[.80,1],[.85,0]]]],
  T:[.76,[[[.02,1],[.74,1]],[[.39,1],[.39,0]]]],
  H:[.76,[[[.05,1],[.05,0]],[[.70,1],[.70,0]],[[.05,.51],[.70,.51]]]],
  A:[.79,[[[.03,0],[.39,1],[.76,0]],[[.17,.36],[.62,.36]]]],
  P:[.69,[[[.05,0],[.05,1],[.44,1],[.64,.85],[.64,.65],[.43,.51],[.05,.51]]]],
  S:[.73,[[[.70,.89],[.52,1],[.23,.96],[.07,.78],[.16,.59],[.55,.42],[.70,.22],[.58,.04],[.32,0],[.05,.12]]]],' ':[.42,[]],
};
function writing(lines,width,height,seed,mat){
  let randomSeed=seed;const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
  const vertices=[],indices=[],strokes=[];let maxWidth=0;
  for(const[li,line]of lines.entries()){let x=0;for(const ch of line){const[advance,paths]=glyphs[ch];for(const path of paths){const points=[];for(let k=0;k<path.length-1;k++){const a=path[k],b=path[k+1],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.12));for(let n=0;n<steps;n++){const t=n/steps;points.push([x+(a[0]+(b[0]-a[0])*t)*.27+(random()-.5)*.007,(a[1]+(b[1]-a[1])*t)*.27-li*.34+(random()-.5)*.007]);}}points.push([x+path.at(-1)[0]*.27,path.at(-1)[1]*.27-li*.34]);strokes.push(points);}x+=(advance+.13)*.27;}maxWidth=Math.max(maxWidth,x);}
  const ribbon=(points,halfWidth,drip=false)=>{const start=vertices.length/3;for(let i=0;i<points.length;i++){const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy)||1,t=i/(points.length-1),pressure=drip?.9-t*.7:.70+.18*Math.sin(t*8+seed)+.12*Math.sin(t*19+seed*.7),w=halfWidth*pressure;for(const sign of[-1,1])vertices.push(points[i][0]-dy/length*w*sign-maxWidth/2,points[i][1]+dx/length*w*sign,.0015+.0003*Math.sin(t*7+seed));}for(let i=0;i<points.length-1;i++)indices.push(start+i*2,start+i*2+2,start+i*2+1,start+i*2+1,start+i*2+2,start+i*2+3);};
  for(const stroke of strokes){ribbon(stroke,.016*(.9+random()*.35));if(random()<.16){const low=stroke.reduce((a,b)=>a[1]<b[1]?a:b);ribbon(Array.from({length:7},(_,i)=>[low[0]+Math.sin(i*.7)*.0015,low[1]-.075*i/6]),.004,true);}}
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let i=0;i<vertices.length;i+=3){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}
  for(let i=0;i<vertices.length;i+=3){vertices[i]=(vertices[i]-(minX+maxX)/2)/(maxX-minX)*width;vertices[i+1]=(vertices[i+1]-minY)/(maxY-minY)*height;}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();geometry(g,mat);
}
for(const[style,lines,width,height,seed]of[['line',['GIVE ME THE TAPES'],2.84,.43,107],['block',['GIVE ME','THE','TAPES'],1.28,.91,313]])for(const[mat,suffix]of[[0,''],[1,'_pale']]){writing(lines,width,height,seed,mat);finish('tape_demand_paint_'+style+suffix);}

// A sewn canvas recorder case, with a reinforced leather base, piped seams,
// real metal fittings and the load-bearing strap ring at [-.145,.17,0].
box([.334,.228,.150],[0,0,0],2,.018);box([.341,.053,.157],[0,-.095,0],3,.012);
box([.306,.181,.016],[0,.006,.075],3,.012);box([.277,.148,.013],[0,.008,.085],2,.010);
for(const x of[-.146,.146])beam([x,-.072,.084],[x,.083,.084],.0027,6);
for(const y of[-.072,.083])beam([-.146,y,.084],[.146,y,.084],.0027,6);
box([.302,.028,.160],[0,.110,0],3,.007);
for(const x of[-.112,.112]){box([.024,.064,.008],[x,.071,.093],5,.003);box([.031,.030,.012],[x,.062,.100],4,.003);box([.011,.020,.007],[x,.061,.108],3,.002);}
for(const x of[-.145,.145]){box([.030,.066,.022],[x,.124,0],3,.006);geometry(new TorusGeometry(.021,.0045,7,18),4,[x,.17,0]);}
for(const x of[-.068,.068])box([.021,.035,.026],[x,.134,0],4,.004);
beam([-.068,.145,0],[-.055,.180,0],.009,3);beam([-.055,.180,0],[.055,.180,0],.009,3);beam([.055,.180,0],[.068,.145,0],.009,3);
finish('tape_demand_field_case');
// One metre along local +Y. Runtime follows the actual two attachment points.
box([.032,1,.003],[0,.5,0],5,.001);
for(const x of[-.012,.012])beam([x,0,.0022],[x,1,.0022],.0011,6,5);
finish('tape_demand_strap');
box([.126,.040,.008],[0,0,0],7,.009);
for(const y of[-.024,.024])beam([-.071,y,.007],[.071,y,.007],.008,8);
for(const x of[-.07,.07])beam([x,-.018,.007],[x,.018,.007],.005,8);
finish('tape_demand_wall_catch');

const root=new URL('../../',import.meta.url),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=Buffer.from(await new NodeIO().writeBinary(doc));
const triangles=doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((sum,p)=>sum+p.getIndices().getCount()/3,0),0),file='public/assets/chapel-tape-demand.glb';
if(bytes.length>900000||triangles>20000)throw Error('Isolated tape demand pack exceeds its budget');
fs.writeFileSync(new URL(file,root),bytes);
fs.writeFileSync(new URL('public/assets/chapel-tape-demand.stats.json',root),JSON.stringify({version:1,file,bytes:bytes.length,triangles,sha256:sha(bytes),meshes:doc.getRoot().listMeshes().map(m=>m.getName()),copy:'GIVE ME THE TAPES',sourceSha256:{'tools/chunk_surfer/build-chapel-tape-demand.mjs':sha(fs.readFileSync(new URL('tools/chunk_surfer/build-chapel-tape-demand.mjs',root)))},license:'Original project geometry; no external assets',textureBytes:0,physicalTapeMutation:false},null,2)+'\n');
console.log(JSON.stringify({file,bytes:bytes.length,triangles}));
