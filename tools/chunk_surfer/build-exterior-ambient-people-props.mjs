// Equipment only. The people are the shared, fitted, animated exterior skins.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';
import {BoxGeometry,CylinderGeometry,SphereGeometry,TorusGeometry,Vector3,Quaternion,Matrix4} from 'three';

const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Existing two street passers-by equipment');
const material=(name,rgb,roughness,metallic=0)=>doc.createMaterial(name).setBaseColorFactor([...rgb,1]).setRoughnessFactor(roughness).setMetallicFactor(metallic);
const mats=[material('worn steel bicycle enamel',[.065,.085,.073],.64,.25),material('vulcanised tire and saddle',[.018,.022,.020],.85),material('dull spokes and lead fittings',[.25,.27,.25],.39,.72),material('ordinary brown dog coat',[.18,.115,.064],.92),material('muzzle and paws',[.07,.045,.028],.94),material('woven dog lead',[.24,.16,.08],.9)];
const groups=new Map();let mesh;
function geometry(g,mat,at=[0,0,0],scale=[1,1,1],q=new Quaternion()){
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at),q,new Vector3(...scale)));
  const key=mat,gp=groups.get(key)||{positions:[],normals:[],uvs:[],indices:[]},base=gp.positions.length/3;
  gp.positions.push(...g.attributes.position.array);gp.normals.push(...g.attributes.normal.array);gp.uvs.push(...g.attributes.uv.array);
  gp.indices.push(...Array.from(g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i),v=>v+base));groups.set(key,gp);g.dispose();
}
function beam(a,b,r,mat,sides=10){const d=new Vector3(...b).sub(new Vector3(...a)),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());geometry(new CylinderGeometry(r,r,d.length(),sides),mat,a.map((v,k)=>(v+b[k])/2),[1,1,1],q);}
const ellipsoid=(at,radii,mat)=>geometry(new SphereGeometry(1,20,12),mat,at,radii);
function finish(name){mesh=doc.createMesh(name);for(const[mat,g]of groups){const attr=(array,type,index=false)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(index?new Uint32Array(array):new Float32Array(array));mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',attr(g.positions,'VEC3')).setAttribute('NORMAL',attr(g.normals,'VEC3')).setAttribute('TEXCOORD_0',attr(g.uvs,'VEC2')).setIndices(attr(g.indices,'SCALAR',true)).setMaterial(mats[mat]));}scene.addChild(doc.createNode(name).setMesh(mesh));groups.clear();}

// A bicycle has two side-facing wheels and real frame triangles, rather than
// the old horizontal disks. Forward is +Z, matching the retained route owner.
const wheelY=.355,front=.64,rear=-.64,crank=[0,.39,0];
for(const z of[rear,front]){
  geometry(new TorusGeometry(.328,.027,8,36),1,[0,wheelY,z],[1,1,1],new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2));
  geometry(new TorusGeometry(.302,.008,6,36),2,[0,wheelY,z],[1,1,1],new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2));
  beam([-.09,wheelY,z],[.09,wheelY,z],.018,2);
  for(let i=0;i<14;i++){const a=i*Math.PI/7;beam([0,wheelY,z],[0,wheelY+Math.sin(a)*.302,z+Math.cos(a)*.302],.0018,2,5);}
}
for(const[a,b]of[[[0,wheelY,rear],crank],[crank,[0,.96,-.13]],[[0,.96,-.13],[0,wheelY,rear]],[[0,.96,-.13],[0,.94,.42]],[[0,.94,.42],crank],[[0,.94,.42],[0,wheelY,front]]])beam(a,b,.017,0);
for(const x of[-.045,.045])beam([x,.94,.42],[x,wheelY,front],.012,2);
beam([0,.94,.42],[0,1.02,.52],.013,2);beam([-.22,1.02,.52],[.22,1.02,.52],.012,2);
for(const x of[-.20,.20])beam([x,1.02,.48],[x,1.02,.58],.021,1);
beam([0,.88,-.13],[0,1.02,-.10],.012,2);ellipsoid([0,1.02,-.10],[.115,.035,.17],1);
beam([-.18,.39,0],[.18,.39,0],.013,2);
finish('exterior_cycle_equipment');
// The crank is a separate moving prop; the performer's feet use this same
// radius and phase, rather than pedalling past static equipment.
geometry(new BoxGeometry(.10,.025,.07),1,[-.18,0,.17]);geometry(new BoxGeometry(.10,.025,.07),1,[.18,0,-.17]);
beam([-.18,0,0],[-.18,0,.17],.011,2);beam([.18,0,0],[.18,0,-.17],.011,2);
finish('exterior_cycle_crank');

// An ordinary dog, in the same footprint as the retained distant walker. No
// story/creature reference, eyeshine or impossible anatomy is introduced here.
ellipsoid([.45,.40,.15],[.15,.17,.34],3);ellipsoid([.46,.45,.41],[.12,.17,.15],3);
ellipsoid([.46,.52,.52],[.105,.105,.15],3);ellipsoid([.46,.49,.65],[.075,.062,.10],4);
for(const x of[.365,.555])ellipsoid([x,.53,.47],[.043,.11,.065],4);
for(const[x,z]of[[.35,-.02],[.55,-.02],[.35,.36],[.55,.36]]){
  beam([x,.39,z],[x,.21,z-.018],.039,3);beam([x,.21,z-.018],[x,.055,z+.015],.029,4);ellipsoid([x,.044,z+.045],[.042,.036,.071],4);
}
beam([.45,.44,-.14],[.47,.57,-.30],.037,3);beam([.47,.57,-.30],[.52,.66,-.34],.022,3);
beam([.35,.56,.43],[.56,.56,.43],.013,5);
beam([-.15,.92,.02],[.13,.66,.23],.005,5,8);beam([.13,.66,.23],[.52,.56,.43],.005,5,8);
finish('exterior_walker_dog');

const bytes=Buffer.from(await new NodeIO().writeBinary(doc)),out=new URL('../../public/assets/exterior-ambient-people-props.glb',import.meta.url);
const triangles=doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
if(bytes.length>700000||triangles>12000)throw Error('Ambient equipment budget exceeded');
fs.writeFileSync(out,bytes);fs.writeFileSync(new URL('../../public/assets/exterior-ambient-people-props.stats.json',import.meta.url),JSON.stringify({bytes:bytes.length,triangles,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),meshes:doc.getRoot().listMeshes().map(m=>m.getName()),source:'tools/chunk_surfer/build-exterior-ambient-people-props.mjs',license:'original project geometry',textureBytes:0},null,2)+'\n');
console.log(JSON.stringify({bytes:bytes.length,triangles}));
