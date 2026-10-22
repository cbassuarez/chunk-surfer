// Ordinary-only material/fitting replacement. The canonical pub and all of
// its collisions remain untouched, including the Source memory's cold copy.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';
import {PUB_HOSPITALITY as CONFIG,PUB_HOSPITALITY_DRESSING as DRESSING,PUB_HOSPITALITY_SCONCES as SCONCES} from '../../src/data/pub-hospitality.js';
const root=new URL('../../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=read(CONFIG.sourceAsset),j=JSON.parse(original.subarray(20,20+original.readUInt32LE(12))),bin=original.subarray(28+original.readUInt32LE(12));
const source=j.meshes.find(m=>m.name===CONFIG.baseMesh);if(!source)throw Error('Canonical pub interior missing');
const protectedFiles=[CONFIG.sourceAsset,'public/assets/pub-characters.glb','public/assets/pub-quest-props.glb'];
const before=Object.fromEntries(protectedFiles.map(f=>[f,sha(read(f))]));
function values(index){const a=j.accessors[index],v=j.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],spec={5126:[4,'getFloat32'],5125:[4,'getUint32'],5123:[2,'getUint16'],5121:[1,'getUint8']}[a.componentType],view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),out=[];for(let n=0;n<a.count;n++)for(let k=0;k<width;k++)out.push(view[spec[1]]((v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||spec[0]*width)+k*spec[0],true));return out;}
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('The ordinary Lyric'),mesh=doc.createMesh(CONFIG.mesh),groups=new Map(),materials=new Map(),origin=CONFIG.meshOriginInRow;
scene.addChild(doc.createNode(CONFIG.mesh).setMesh(mesh));
const colors={'worn wood':[.42,.255,.125],'dark wood':[.205,.125,.070],'academic plaster':[.76,.70,.57],'pub green upholstery':[.235,.087,.057],brass:[.62,.405,.16],'ivory':[.80,.75,.63],'pub warm lamp glass':[.93,.72,.40],'oxidised bronze':[.22,.25,.20]};
function material(name,color,roughness=.9,metallic=0,emission){const key='pub warmth / '+name;if(materials.has(key))return key;let m=doc.createMaterial(key).setBaseColorFactor([...color,1]).setRoughnessFactor(roughness).setMetallicFactor(metallic).setDoubleSided(true);if(emission)m.setEmissiveFactor(emission);materials.set(key,m);return key;}
for(const p of source.primitives){const m=j.materials[p.material],pbr=m.pbrMetallicRoughness||{},name=m.name;material(name,colors[name]||(pbr.baseColorFactor||[.3,.3,.3]).slice(0,3),name==='brass'?.43:name==='pub green upholstery'?.97:pbr.roughnessFactor??.88,name==='brass'?.62:pbr.metallicFactor??0,name==='pub warm lamp glass'?[1,.48,.16]:null);}
const ids={cream:material('worn cream ceramic',[.74,.69,.55],.52),crust:material('baked bread crust',[.48,.245,.075],.94),crumb:material('bread crumb',[.69,.51,.28],.98),pie:material('dark pie filling',[.105,.055,.025],.95),cloth:material('folded oatmeal bar cloth',[.46,.40,.29],.99),coal:material('red stove embers',[.33,.055,.009],.92,0,[1,.20,.025]),flame:material('hot coal seams',[.80,.29,.025],.86,0,[1,.46,.08]),globe:material('low amber practical glass',[.91,.69,.35],.42,0,[1,.57,.22]),black:'pub warmth / black lacquer',brass:'pub warmth / brass',wood:'pub warmth / worn wood'};
const ceilingMaterial=material('muted plaster ceiling',[.42,.36,.28]);
const stats={mesh:CONFIG.mesh,origin,retainedTriangles:0,removedStoveTriangles:0,addedTriangles:0,dressing:[],sconces:SCONCES,lights:CONFIG.lights,sourceSha256:before};
let activeBounds=null;
const group=key=>{if(!groups.has(key))groups.set(key,{p:[],n:[],i:[]});return groups.get(key);};
function emit(key,points,indices){const g=group(key),offset=g.p.length/3,n=Array(points.length*3).fill(0);for(let i=0;i<indices.length;i+=3){const[a,b,c]=indices.slice(i,i+3).map(v=>points[v]),u=b.map((v,k)=>v-a[k]),v=c.map((w,k)=>w-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const id of indices.slice(i,i+3))for(let k=0;k<3;k++)n[id*3+k]+=cross[k];}for(let i=0;i<n.length;i+=3){const d=Math.hypot(...n.slice(i,i+3))||1;n[i]/=d;n[i+1]/=d;n[i+2]/=d;}for(const p of points){g.p.push(p[0]-origin.x,p[1],p[2]-origin.z);if(activeBounds)for(let a=0;a<3;a++){activeBounds.min[a]=Math.min(activeBounds.min[a],p[a]);activeBounds.max[a]=Math.max(activeBounds.max[a],p[a]);}}g.n.push(...n);g.i.push(...indices.map(v=>v+offset));stats.addedTriangles+=indices.length/3;}
for(const primitive of source.primitives){
  const positions=values(primitive.attributes.POSITION),normals=values(primitive.attributes.NORMAL),indices=values(primitive.indices),name=j.materials[primitive.material].name,g=group('pub warmth / '+name),offset=g.p.length/3;g.p.push(...positions);g.n.push(...normals);
  const ceiling=name==='academic plaster'?group(ceilingMaterial):null,ceilingOffset=ceiling?.p.length/3;
  if(ceiling){ceiling.p.push(...positions);ceiling.n.push(...normals);}
  for(let i=0;i<indices.length;i+=3){const points=indices.slice(i,i+3).map(v=>[positions[v*3]+origin.x,positions[v*3+1],positions[v*3+2]+origin.z]);
    const pane=name==='oxidised bronze'&&points.every(p=>p[0]>=-4.001&&p[0]<=-3.499&&p[1]>=.279&&p[1]<=.721&&p[2]>=-31.264&&p[2]<=-31.226);
    const face=name==='black lacquer'&&points.every(p=>Math.abs(p[2]+31.26)<.0002&&p[0]>=-4.091&&p[0]<=-3.409&&p[1]>=.099&&p[1]<=.841);
    if(pane||face){stats.removedStoveTriangles++;continue;}
    const upper=ceiling&&points.every(p=>p[1]>3.32);
    (upper?ceiling:g).i.push(...indices.slice(i,i+3).map(v=>v+(upper?ceilingOffset:offset)));stats.retainedTriangles++;
  }
}
function box(key,c,s){const p=[];for(const z of[-1,1])for(const y of[-1,1])for(const x of[-1,1])p.push([c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]);emit(key,p,[0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5]);}
function lathe(key,c,profile,segments=12,arc=Math.PI*2){const p=[],i=[];for(let row=0;row<profile.length;row++)for(let k=0;k<=segments;k++){const a=k/segments*arc,[r,y]=profile[row];p.push([c[0]+Math.sin(a)*r,c[1]+y,c[2]+Math.cos(a)*r]);if(row&&k){const v=(row-1)*(segments+1)+k-1;i.push(v,v+segments+2,v+1,v,v+segments+1,v+segments+2);}}emit(key,p,i);}
function ellipsoid(key,c,r,segments=10,rings=6){const p=[],i=[];for(let row=0;row<=rings;row++)for(let k=0;k<=segments;k++){const a=k/segments*Math.PI*2,b=row/rings*Math.PI;p.push([c[0]+Math.sin(a)*Math.sin(b)*r[0],c[1]+Math.cos(b)*r[1],c[2]+Math.cos(a)*Math.sin(b)*r[2]]);if(row&&k){const v=(row-1)*(segments+1)+k-1;i.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}emit(key,p,i);}
function ringHandle(key,c){const p=[],i=[],rows=10,sides=5;for(let row=0;row<=rows;row++)for(let k=0;k<=sides;k++){const a=(row/rows-.5)*Math.PI*1.5,b=k/sides*Math.PI*2,rad=.037+Math.cos(b)*.006;p.push([c[0]+Math.cos(a)*rad,c[1]+Math.sin(a)*rad,c[2]+Math.sin(b)*.006]);if(row&&k){const v=(row-1)*(sides+1)+k-1;i.push(v,v+1,v+sides+2,v,v+sides+2,v+sides+1);}}emit(key,p,i);}
for(const d of DRESSING){const before=stats.addedTriangles,c=[d.x,d.y,d.z];activeBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  if(d.kind==='lamp'){
    lathe(ids.brass,c,[[0,0],[.078,0],[.084,.014],[.060,.027],[0,.027]],12);
    lathe(ids.brass,c,[[.012,.025],[.012,.255]],10);
    lathe(ids.globe,c,[[0,.22],[.059,.22],[.074,.255],[.069,.325],[.045,.365],[0,.37]],12);
    lathe(ids.brass,c,[[.046,.357],[.048,.367],[.022,.380],[0,.386]],12);
  }
  if(d.kind==='bread'){
    lathe(ids.cream,c,[[0,0],[.139,0],[.145,.009],[.126,.017],[0,.017]],16);
    for(const[dx,dz]of[[-.052,0],[.055,.015]])ellipsoid(ids.crust,[c[0]+dx,c[1]+.045,c[2]+dz],[.069,.030,.087],10,6);
    for(const[dx,dz]of[[-.052,0],[.055,.015]])for(const z of[-.025,.025])ellipsoid(ids.crumb,[c[0]+dx,c[1]+.073,c[2]+dz+z],[.040,.002,.006],8,4);
  }
  if(d.kind==='pie'){
    lathe(ids.cream,c,[[0,0],[.15,0],[.155,.009],[.14,.017],[0,.017]],16);
    lathe(ids.pie,[c[0],c[1]+.017,c[2]],[[0,0],[.125,0],[.125,.038],[0,.038]],14,Math.PI*1.70);
    lathe(ids.crust,[c[0],c[1]+.017,c[2]],[[.112,.035],[.137,.036],[.136,.047],[.118,.056],[0,.056]],14,Math.PI*1.70);
    for(const z of[-.035,0,.035])box(ids.pie,[c[0]-.022,c[1]+.075,c[2]+z],[.024,.001,.003]);
  }
  if(d.kind==='plate'){
    lathe(ids.cream,c,[[0,0],[.11,0],[.115,.008],[.097,.016],[0,.010]],16);
    for(const[dx,dz]of[[-.024,.013],[.025,-.015],[.041,.031]])ellipsoid(ids.crumb,[c[0]+dx,c[1]+.014,c[2]+dz],[.009,.004,.006],6,4);
  }
  if(d.kind==='mug'){
    lathe(ids.cloth,c,[[0,0],[.064,0],[.065,.004],[0,.004]],12);
    lathe(ids.cream,[c[0],c[1]+.004,c[2]],[[0,0],[.037,0],[.043,.012],[.044,.102],[.038,.108],[.034,.013],[0,.013]],12);
    lathe(ids.pie,[c[0],c[1]+.004,c[2]],[[0,.074],[.037,.074]],12);
    ringHandle(ids.cream,[c[0]+.044,c[1]+.061,c[2]]);
  }
  if(d.kind==='cloth'){
    box(ids.cloth,[c[0],c[1]+.004,c[2]],[.22,.008,.16]);box(ids.cloth,[c[0]-.025,c[1]+.010,c[2]],[.17,.004,.16]);
  }
  stats.dressing.push({...d,triangles:stats.addedTriangles-before,actualBounds:activeBounds});activeBounds=null;
}
// Two real lamps on the internal window mullions wash faces from the front
// and make the occupied room visible across the wet street. No glowing pane
// blocks the outlook or either doorway.
for(const s of SCONCES){
  box(ids.brass,[-.23,s.y,s.z],[.08,.27,.16]);
  ellipsoid(ids.globe,[s.x,s.y,s.z],[.115,.145,.10],8,4);
}
// The front pane and metal front face are the only removed source triangles.
// The new aperture/frame is within the original stove volume and hearth.
for(const[x,y,w,h]of[[-3.75,.765,.68,.15],[-3.75,.185,.68,.17],[-4.045,.475,.09,.44],[-3.455,.475,.09,.44]])box(ids.black,[x,y,-31.243],[w,h,.025]);
box(ids.black,[-3.75,.285,-31.36],[.46,.035,.20]);
for(let n=0;n<12;n++){const x=-3.94+(n%4)*.125,z=-31.28-Math.floor(n/4)*.055;ellipsoid(n%3?ids.coal:ids.flame,[x,.334+(n%2)*.025,z],[.051,.026,.033],8,4);}
box(ids.brass,[-3.75,.28,-31.217],[.48,.012,.012]);
if(stats.addedTriangles>CONFIG.maximumAddedTriangles)throw Error('Hospitality dressing triangle budget exceeded: '+stats.addedTriangles);
for(const[key,g]of groups){
  const accessor=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.p))).setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.n))).setIndices(accessor('SCALAR',Uint32Array.from(g.i))).setMaterial(materials.get(key)));
}
const file=CONFIG.asset.replace(/^assets\//,'public/assets/');await new NodeIO().write(new URL(file,root).pathname,doc);const output=read(file);if(output.length>CONFIG.maximumBytes)throw Error('Hospitality pack byte budget exceeded');
for(const[f,digest]of Object.entries(before))if(sha(read(f))!==digest)throw Error('Protected source pack changed: '+f);
stats.bytes=output.length;stats.sha256=sha(output);stats.materials=[...materials.keys()];
fs.writeFileSync(new URL('public/assets/pub-hospitality.stats.json',root),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(new URL('public/assets/pub-hospitality.credits.json',root),JSON.stringify({license:'Project authored geometry and materials; cloned canonical pub geometry remains project authored.',sourceSha256:{...before,'src/data/pub-hospitality.js':sha(read('src/data/pub-hospitality.js')),'tools/chunk_surfer/build-pub-hospitality.mjs':sha(read('tools/chunk_surfer/build-pub-hospitality.mjs'))},packs:[{file,bytes:output.length,sha256:stats.sha256}]},null,2)+'\n');
console.log(JSON.stringify({mesh:CONFIG.mesh,bytes:output.length,retainedTriangles:stats.retainedTriangles,removedStoveTriangles:stats.removedStoveTriangles,addedTriangles:stats.addedTriangles,sourcePacksUnchanged:true}));
