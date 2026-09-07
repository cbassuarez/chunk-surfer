// Reuse suitable game assets; close-inspection replacements are authored from
// physical references in item-model-details.mjs. Source packs stay untouched.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {copyToDocument,prune} from '@gltf-transform/functions';
import {Document,NodeIO} from '@gltf-transform/core';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {buildDetailedItems} from './item-model-details.mjs';
const out='public/assets/items';await mkdir(out,{recursive:true});
const io=new NodeIO(),stats=[];
const palette={
  shell:['#59604e',.86,.08],rubber:['#333c34',.95,0],dark:['#353e35',.88,0],steel:['#a6aaa0',.38,.82],edge:['#687267',.55,.6],ivory:['#d4cfad',.78,0],amber:['#c4a653',.72,.1],red:['#913e30',.82,0],green:['#76866a',.7,0],glass:['#142b24',.33,.18],paper:['#d5cbb1',.92,0],coffee:['#271c12',.9,0],marble:['#bbbbaa',.88,.08],fracture:['#929b8f',1,0],brass:['#b59b56',.48,.7],blue:['#73828a',.82,0],wire:['#ad714c',.8,0],light:['#c6d09d',.4,.1],cloth:['#454c3c',1,0],badge:['#484a36',.94,0],white:['#e2ddc9',.6,.1],wood:['#76664a',.95,0]
};
function model(id,build){
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(id),root=doc.createNode(id);scene.addChild(root);
 const mats=Object.fromEntries(Object.entries(palette).map(([key,[hex,rough,metal]])=>{const c=new THREE.Color(hex);return[key,doc.createMaterial(key).setBaseColorFactor([c.r,c.g,c.b,1]).setRoughnessFactor(rough).setMetallicFactor(metal)];}));
 const cache=new Map();let triangles=0,pieces=0,currentParent=root;
 function add(geom,mat,pos=[0,0,0],rot=[0,0,0],parent=currentParent){
  let primitive=cache.get(geom);if(!primitive){primitive=doc.createPrimitive();for(const [name,semantic]of[['position','POSITION'],['normal','NORMAL']]){const a=geom.getAttribute(name);if(a)primitive.setAttribute(semantic,doc.createAccessor().setType('VEC3').setArray(new Float32Array(a.array)).setBuffer(buffer));}
   if(geom.index)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geom.index.array)).setBuffer(buffer));cache.set(geom,primitive);}
  const mesh=doc.createMesh().addPrimitive(primitive.clone().setMaterial(mats[mat]||mats.steel));const node=doc.createNode().setMesh(mesh).setTranslation(pos).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)).toArray());parent.addChild(node);pieces++;triangles+=(geom.index?.count||geom.attributes.position.count)/3;return node;
 }
 const geo=new Map();function geometry(key,make){if(!geo.has(key))geo.set(key,make());return geo.get(key);}
 const box=(p,s,m='shell',r=[0,0,0],bevel=.025)=>add(geometry(`box:${s}:${bevel}`,()=>bevel?new RoundedBoxGeometry(...s,1,Math.min(bevel,...s.map(v=>v/3))):new THREE.BoxGeometry(...s)),m,p,r);
 const cyl=(p,r,h,m='steel',rot=[Math.PI/2,0,0],n=20,r2=r)=>add(geometry(`cyl:${r}:${r2}:${h}:${n}`,()=>new THREE.CylinderGeometry(r,r2,h,n)),m,p,rot);
 const ring=(p,r,t,m='steel',rot=[0,0,0],arc=Math.PI*2)=>add(geometry(`ring:${r}:${t}:${arc}`,()=>new THREE.TorusGeometry(r,t,6,40,arc)),m,p,rot);
 const ball=(p,r,m='steel',scale=[1,1,1])=>{const node=add(geometry(`sphere:${r}`,()=>new THREE.SphereGeometry(r,16,10)),m,p);node.setScale(scale);return node;};
 const cable=(points,r=.022,m='rubber')=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return add(new THREE.TubeGeometry(curve,32,r,6,false),m);};
 const screw=(p,r=.033)=>{cyl(p,r,.012,'steel');box([p[0],p[1],p[2]+.009],[r*1.3,.009,.009],'dark',[0,0,.5],0);};
 const knob=(p,r=.11)=>{cyl(p,r,.085,'rubber');cyl([p[0],p[1],p[2]+.05],r*.76,.018,'edge');box([p[0],p[1]+r*.28,p[2]+.065],[.013,r*.55,.008],'ivory',undefined,0);};
 const socket=(p,r=.055)=>{cyl(p,r,.02,'steel');cyl([p[0],p[1],p[2]+.016],r*.57,.025,'rubber');};
 const group=(position,rotation,build)=>{const previous=currentParent;currentParent=doc.createNode().setTranslation(position).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).toArray());previous.addChild(currentParent);build();currentParent=previous;};
 const plate=(shape,depth,position,material='steel',rotation=[0,0,0],bevel=.01)=>{
  if(Array.isArray(shape)){const points=shape;shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();}
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:20});geometry.translate(0,0,-depth/2);return add(geometry,material,position,rotation);
 };
 const lathe=(points,position,material='steel',rotation=[0,0,0])=>add(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),64),material,position,rotation);
 const g={box,cyl,ring,ball,cable,screw,knob,socket,add,root,doc,group,plate,lathe};build(g);
 return io.write(`${out}/${id}.glb`,doc).then(()=>stats.push({id,origin:'authored',source:'scripts/build-item-models.mjs',pieces,triangles:Math.round(triangles)}));
}
const sourceCache=new Map();
async function extract(id,source,parts,rotation=[0,0,0]){
 if(!sourceCache.has(source))sourceCache.set(source,await io.read(source));
 const src=sourceCache.get(source),doc=new Document(),scene=doc.createScene(id);
 const root=doc.createNode('portrait-pose').setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).toArray());scene.addChild(root);
 let triangles=0;
 for(const part of parts){
  const original=src.getRoot().listMeshes().find(m=>m.getName()===part.mesh);
  if(!original)throw new Error(`Missing source mesh ${part.mesh}`);
  const mesh=copyToDocument(doc,src,[original]).get(original);
  if(part.filter)for(const primitive of mesh.listPrimitives()){
   const positions=primitive.getAttribute('POSITION'),old=primitive.getIndices(),indices=[];
   for(let i=0;i<old.getCount();i+=3){const tri=[old.getScalar(i),old.getScalar(i+1),old.getScalar(i+2)];
    if(tri.every(index=>part.filter(positions.getElement(index,[]))))indices.push(...tri);}
   if(indices.length){
    const used=[...new Set(indices)],remap=new Map(used.map((index,i)=>[index,i]));
    for(const semantic of primitive.listSemantics()){
     const original=primitive.getAttribute(semantic),array=original.getArray(),size=original.getElementSize();
     const packed=new array.constructor(used.length*size);used.forEach((index,i)=>packed.set(array.subarray(index*size,(index+1)*size),i*size));
     primitive.setAttribute(semantic,original.clone().setArray(packed));
    }
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices.map(index=>remap.get(index)))).setBuffer(old.getBuffer()));
   }
   else mesh.removePrimitive(primitive);
  }
  const node=doc.createNode(part.mesh).setMesh(mesh).setTranslation(part.position||[0,0,0]);
  if(part.rotation)node.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)).toArray());root.addChild(node);
  triangles+=mesh.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0);
 }
 const buffer=doc.getRoot().listBuffers()[0];
 for(const accessor of doc.getRoot().listAccessors())accessor.setBuffer(buffer);
 await doc.transform(prune());await io.write(`${out}/${id}.glb`,doc);
 stats.push({id,origin:'existing',source,sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),
  meshes:parts.map(({mesh,filter})=>({mesh,...(filter?{isolation:'Exclude cabinet mounting stud or fountain coins; retained vertex positions unchanged.'}:{})})),triangles});
}
const props='public/assets/conservatory-props.glb';
await extract('light','public/assets/conservatory-acquisitions.glb',[{mesh:'portable_searchlight'}],[0,Math.PI*.7,0]);
await extract('marble-eyes',props,[{mesh:'park_marble_eyes',filter:p=>p[1]>.0101}],[.55,0,.12]);
await extract('sheet-music',props,[{mesh:'open_score'}],[.85,0,.08]);
const forkSource='public/assets/tuning-fork.glb';
const fork=await io.read(forkSource),pose=fork.createNode('portrait-pose').setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI/2+.13,'ZYX')).toArray());
for(const s of fork.getRoot().listScenes()){for(const n of [...s.listChildren()]){s.removeChild(n);pose.addChild(n);}s.addChild(pose);}
await io.write(`${out}/tuning-fork.glb`,fork);stats.push({id:'tuning-fork',origin:'existing',source:forkSource,sourceSha256:createHash('sha256').update(await readFile(forkSource)).digest('hex')});

await model('interface',({box,cyl,ring,cable,screw,knob,socket})=>{
 // Folded converter chassis, inset front plate and a separate rear shell.
 box([0,0,-.035],[1.98,1.16,.53],'edge',undefined,.055);
 box([0,0,.235],[1.87,1.05,.045],'steel',undefined,.02);
 for(const x of[-.94,.94])box([x,0,.28],[.065,1.09,.08],'rubber',undefined,.016);
 box([0,0,.266],[1.67,.91,.012],'shell',undefined,.012);
 // The reference art's two meters, toggle bank and uneven large knobs.
 for(const x of[-.43,.31]){
  box([x,.29,.287],[.59,.25,.045],'rubber',undefined,.012);
  box([x,.29,.313],[.51,.17,.014],'ivory',undefined,.01);
  for(let i=0;i<9;i++)box([x-.20+i*.05,.32,.323],[.008,i%2?.026:.041,.004],'dark',undefined,0);
  box([x-.025,.287,.327],[.007,.092,.004],'red',[0,0,-.33],0);
 }
 for(let i=0;i<6;i++){
  const x=-.68+i*.263;cyl([x,.035,.285],.038,.026,'steel');
  cyl([x,.045,.335],.014,.085,'steel',[.45+i%2*.2,0,0],12);
  box([x,-.04,.285],[.057,.007,.006],'ivory',undefined,0);
 }
 for(const [x,y,r]of[[-.53,-.28,.105],[.03,-.27,.14],[.57,-.27,.11]]){
  knob([x,y,.325],r);
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2;box([x+Math.cos(a)*r,y+Math.sin(a)*r,.37],[.012,.022,.045],'edge',[0,0,a],.003);}
  for(let i=0;i<9;i++){const a=-.2+i*.43;box([x+Math.sin(a)*(r+.04),y+Math.cos(a)*(r+.04),.285],[.01,.026,.006],'ivory',[0,0,-a],0);}
 }
 for(const x of[-.85,.85])for(const y of[-.44,.44])screw([x,y,.283],.022);
 // Real side vents and a screwed battery/service cover survive inspection.
 box([0,0,-.31],[1.78,.94,.04],'dark',undefined,.025);
 box([.48,-.13,-.338],[.54,.54,.025],'edge',undefined,.015);
 for(let i=0;i<8;i++)box([-.64+i*.115,.30,-.338],[.060,.25,.015],'rubber',undefined,.009);
 for(const x of[-.83,.83])for(const y of[-.40,.4])cyl([x,y,-.345],.025,.018,'steel');
 // The modification is readable: a return cable joins two added sockets.
 for(const x of[-.77,.77])socket([x,-.28,.32],.054);
 cable([[-.77,-.28,.38],[-.83,-.54,.44],[-.49,-.69,.45],[.39,-.59,.55],[.74,-.37,.43],[.77,-.28,.38]],.029,'wire');
 for(const x of[-.77,.77]){cyl([x,-.28,.42],.035,.13,'rubber');for(let i=0;i<3;i++)ring([x,-.28,.43+i*.026],.036,.006,'dark');}
 // Offset handles and rubber feet give the case a plausible back and sides.
 for(const x of[-1.02,1.02]){box([x,0,-.02],[.08,.75,.18],'rubber',undefined,.04);for(const y of[-.39,.39])box([x*.85,y,-.35],[.16,.12,.06],'rubber',undefined,.03);}
});
await buildDetailedItems(model);
await writeFile(`${out}/models.json`,JSON.stringify({generator:'scripts/build-item-models.mjs',
 license:'Existing project assets retain their source credits. Portable searchlight: Poly Haven CC0, see conservatory-acquisitions.credits.json. Detailed inspection models: original project geometry; reference photographs are not redistributed.',items:stats},null,2)+'\n');
console.log(`Built ${stats.length} portraits: ${stats.filter(s=>s.origin==='existing').length} existing assets, ${stats.filter(s=>s.origin==='authored').length} detailed inspection models.`);
