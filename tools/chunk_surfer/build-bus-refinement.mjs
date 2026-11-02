// Dedicated coachwork replacement. Keeps every gameplay anchor and leaves the
// shared conservative pack and the authored mandatory bus passage untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {parseGlb} from './rebuild-tree-crowns.mjs';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../../src/data/outskirts-bus-passage.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const SOURCE_FILES=['public/assets/conservatory-props.glb','public/assets/outskirts-bus-passage.glb','public/assets/bus-graffiti.glb','src/data/outskirts-bus-passage.js','src/game/outskirts-geometry.js'];
function readAccessor(p,id){const a=p.json.accessors[id],v=p.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],base=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size,out=[];for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const at=base+i*stride+k*size;out.push(a.componentType===5126?p.bin.readFloatLE(at):size===4?p.bin.readUInt32LE(at):size===2?p.bin.readUInt16LE(at):p.bin.readUInt8(at));}return out;}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const group=(m,mat)=>m.groups.get(mat)||(m.groups.set(mat,{p:[],n:[],uv:[],i:[]}),m.groups.get(mat));
function quad(m,a,b,c,d,mat){const g=group(m,mat),base=g.p.length/3,n=unit(cross(b.map((v,k)=>v-a[k]),c.map((v,k)=>v-a[k])));if(n.some(v=>!Number.isFinite(v)))return;for(const p of[a,b,c,d]){g.p.push(...p);g.n.push(...n);g.uv.push(p[0]+p[2],p[1]);}g.i.push(base,base+1,base+2,base,base+2,base+3);}
function box(m,c,s,mat){const h=s.map(v=>v/2),p=Array.from({length:8},(_,i)=>[c[0]+(i&1?h[0]:-h[0]),c[1]+(i&2?h[1]:-h[1]),c[2]+(i&4?h[2]:-h[2])]);for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(m,...f.map(i=>p[i]),mat);}
function beam(m,a,b,r,mat,sides=8){const f=unit(b.map((v,k)=>v-a[k])),u=unit(cross(f,Math.abs(f[1])>.9?[1,0,0]:[0,1,0])),v=cross(f,u),p=(c,t)=>c.map((x,k)=>x+r*(u[k]*Math.cos(t)+v[k]*Math.sin(t)));for(let i=0;i<sides;i++){const t=i/sides*Math.PI*2,n=(i+1)/sides*Math.PI*2;quad(m,p(a,t),p(b,t),p(b,n),p(a,n),mat);}}
function loft(m,rings,mat){for(let j=0;j<rings.length-1;j++)for(let i=0;i<rings[j].length;i++){const k=(i+1)%rings[j].length;quad(m,rings[j][i],rings[j+1][i],rings[j+1][k],rings[j][k],mat);}for(const[j,flip]of[[0,false],[rings.length-1,true]]){const p=rings[j],c=[0,1,2].map(k=>p.reduce((n,v)=>n+v[k],0)/p.length);for(let i=0;i<p.length;i++){const k=(i+1)%p.length,mid=p[i].map((v,axis)=>(v+p[k][axis])/2);quad(m,...(flip?[c,p[k],mid,p[i]]:[c,p[i],mid,p[k]]),mat);}}}
function bevelRect(x,z,w,d,r){return[[x-w/2+r,z-d/2],[x+w/2-r,z-d/2],[x+w/2,z-d/2+r],[x+w/2,z+d/2-r],[x+w/2-r,z+d/2],[x-w/2+r,z+d/2],[x-w/2,z+d/2-r],[x-w/2,z-d/2+r]];}
function cushion(m,x,z,w,seat,edge){
 const rings=[[.955,w-.07,.60,.055],[.975,w,.67,.075],[1.065,w,.67,.075],[1.105,w-.055,.60,.065]].map(([y,width,d,r])=>bevelRect(x,z,width,d,r).map(([xx,zz])=>[xx,y,zz]));loft(m,rings,seat);
 // A curved upholstered back narrows at the shoulders instead of a flat plank.
 const back=[[1.09,w,.095,z+.27],[1.36,w,.135,z+.29],[1.63,w-.045,.13,z+.325],[1.70,w-.11,.09,z+.34]].map(([y,width,d,zz])=>bevelRect(x,zz,width,d,.025).map(([xx,zz])=>[xx,y,zz]));loft(m,back,seat);
 for(const dx of[-w/2+.045,w/2-.045])beam(m,[x+dx,1.12,z+.205],[x+dx,1.63,z+.255],.008,edge,6);
 beam(m,[x-w/2+.075,1.705,z+.34],[x+w/2-.075,1.705,z+.34],.013,edge,8);
 // Restrained transverse cushion seams survive grazing light without a noisy
 // artificial moquette texture or many independent material primitives.
 for(const zz of[-.18,.06])box(m,[x,1.107,z+zz],[w-.13,.003,.005],edge);
}
function model(name){return{name,groups:new Map(),extras:{}};}

export async function buildBusRefinement(){
 const hashes=Object.fromEntries(SOURCE_FILES.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
 const base=parseGlb(fs.readFileSync(path.join(root,SOURCE_FILES[0]))),passage=parseGlb(fs.readFileSync(path.join(root,SOURCE_FILES[1])));
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('British municipal coachwork refinement'),textures=new Map(),materials=new Map();
 const texture=(pack,index)=>{const t=pack.json.textures[index],im=pack.json.images[t.source],v=pack.json.bufferViews[im.bufferView],b=pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),key=sha(b);if(!textures.has(key))textures.set(key,doc.createTexture(im.name||key).setImage(new Uint8Array(b)).setMimeType(im.mimeType));return textures.get(key);};
 const material=(pack,index,{ambient=false}={})=>{let def=pack.json.materials[index];if(ambient){const aliases={'outskirts worn enamel edge':'outskirts municipal enamel','outskirts joint oxidation':'outskirts municipal enamel','outskirts tyre and gasket':'outskirts black iron','outskirts printed carbon':'outskirts black iron','outskirts glass edge reflection':'painted steel','ivory':'outskirts ivory coachwork','outskirts rain stained paper':'outskirts ivory coachwork','outskirts worn seat piping':'outskirts green moquette'};if(aliases[def.name])def=pack.json.materials.find(m=>m.name===aliases[def.name]);}const name=def.name,p=def.pbrMetallicRoughness||{},colour=[...(p.baseColorFactor||[1,1,1,1])];let suffix='';if(ambient&&name==='outskirts municipal enamel'){colour.splice(0,4,.255,.070,.065,1);suffix=' / street oxblood';}if(ambient&&name==='outskirts worn enamel edge'){colour.splice(0,4,.43,.25,.20,1);suffix=' / street oxblood';}const key=name+suffix;if(materials.has(key))return materials.get(key);const m=doc.createMaterial(key).setBaseColorFactor(colour).setMetallicFactor(p.metallicFactor??0).setRoughnessFactor(p.roughnessFactor??.8).setEmissiveFactor(def.emissiveFactor||[0,0,0]).setAlphaMode(def.alphaMode||'OPAQUE').setAlphaCutoff(def.alphaCutoff??.5).setDoubleSided(!!def.doubleSided).setExtras({...def.extras,materialFactors:'gltf'});if(p.baseColorTexture)m.setBaseColorTexture(texture(pack,p.baseColorTexture.index));if(p.metallicRoughnessTexture)m.setMetallicRoughnessTexture(texture(pack,p.metallicRoughnessTexture.index));if(def.normalTexture)m.setNormalTexture(texture(pack,def.normalTexture.index));materials.set(key,m);return m;};
 const stats={revision:'municipal-coachwork-r1',generator:'tools/chunk_surfer/build-bus-refinement.mjs',sourceHashes:hashes,meshes:{},totalTriangles:0,newTextureBytes:0,sharedRouteAndCollisionUnchanged:true,acquisition:'Four free CC BY3 source buses acquired and inspected. Rejected as weaker or geographically inappropriate; this pack derives from the project’s existing coach and actual route geometry, with original modelled refinements.',pending:['native final-dither inspection','ordinary street/bus passage full-route movement acceptance']};
 for(const [name,pack,sourceName,ambient]of[['ambient_late_bus',base,'outskirts_bus',true],['outskirts_bus',base,'outskirts_bus',false],['outskirts_bus_passage',passage,'outskirts_bus_passage',false]]){
  const m=model(name),original=pack.json.meshes.find(x=>x.name===sourceName),isPassage=name===C.mesh,roles=Object.fromEntries(['outskirts municipal enamel','outskirts worn enamel edge','outskirts ivory coachwork','outskirts black iron','outskirts tyre and gasket','painted steel','outskirts green moquette','outskirts worn seat piping','outskirts glass edge reflection','outskirts printed carbon'].map(n=>{const i=pack.json.materials.findIndex(p=>p.name===n);return[n,material(pack,i,{ambient})];}));
  const enamel=roles['outskirts municipal enamel'],edge=roles['outskirts worn enamel edge'],cream=roles['outskirts ivory coachwork'],iron=roles['outskirts black iron'],rubber=roles['outskirts tyre and gasket'],steel=roles['painted steel'],seat=roles['outskirts green moquette'],seatEdge=roles['outskirts worn seat piping'];
  let retained=0,removed=0,movedTyreVertices=0,smoothRoofVertices=0;
  for(const primitive of original.primitives){
   const def=pack.json.materials[primitive.material],p=readAccessor(pack,primitive.attributes.POSITION),n=readAccessor(pack,primitive.attributes.NORMAL),uv=primitive.attributes.TEXCOORD_0==null?null:readAccessor(pack,primitive.attributes.TEXCOORD_0),idx=readAccessor(pack,primitive.indices),mat=material(pack,primitive.material,{ambient}),originalGroup=group(m,mat);
   if(['outskirts green moquette','outskirts worn seat piping'].includes(def.name)){removed+=idx.length/3;continue;}
   for(let i=0;i<idx.length;i+=3){const points=idx.slice(i,i+3).map(k=>p.slice(k*3,k*3+3)),headlamp=ambient&&def.name==='outskirts glass edge reflection'&&points.every(v=>v[2]<-4.65&&v[1]>.87&&v[1]<1.07&&Math.abs(v[0])>.64&&Math.abs(v[0])<1.01),g=headlamp?group(m,material(pack,pack.json.materials.findIndex(m=>m.name==='outskirts opal strip'),{ambient})):originalGroup;
    // Ordinary coach had whole straight lower side slabs burying the tyres.
    // Passage already has the wheel cuts and is retained byte-for-byte here.
    const oldSide=!isPassage&&def.name==='outskirts municipal enamel'&&points.every(v=>Math.abs(v[0])>=1.129&&Math.abs(v[0])<=1.251&&v[1]>=.549&&v[1]<=1.511)&&Math.max(...points.map(v=>v[2]))-Math.min(...points.map(v=>v[2]))>.5;
    if(oldSide){removed++;continue;}
    const baseIndex=g.p.length/3,moveTyre=!isPassage&&points.every(v=>Math.abs(v[0])>1.015&&v[1]>=0&&v[1]<.90&&v[2]>-3.35&&v[2]<-2.35)&&['outskirts tyre and gasket','painted steel','outskirts black iron','outskirts worn enamel edge'].includes(def.name);
    for(const k of idx.slice(i,i+3)){
     const v=p.slice(k*3,k*3+3),normal=n.slice(k*3,k*3+3);
     // The non-passage factory’s front axle occupied the entrance. Match the
     // same coach’s authored passage axle without moving any seat/door/step.
     if(moveTyre){v[2]+=.85;movedTyreVertices++;}
     if(def.name==='outskirts ivory coachwork'&&v[1]>=2.899&&Math.abs(v[0])<=1.221&&Math.abs(normal[1])>.2){const t=(v[0]+1.22)/2.44,slope=.20*Math.PI/2.44*Math.cos(Math.PI*t),sign=normal[1]>=0?1:-1;normal.splice(0,3,...unit([-slope,1,0]).map(x=>x*sign));smoothRoofVertices++;}
     g.p.push(...v);g.n.push(...normal);g.uv.push(...(uv?uv.slice(k*2,k*2+2):[v[0]+v[2],v[1]]));
    }g.i.push(baseIndex,baseIndex+1,baseIndex+2);retained++;
   }
  }
  if(!isPassage){
   // Side skin really ends at the front entrance. Semi-circular tyre openings
   // are cut out of its lower edge, not painted as black discs on a slab.
   for(const side of[-1,1])for(const[a,b]of(side<0?[[-4.48,-3.70],[-2.60,4.48]]:[[-4.48,4.48]])){
    const cuts=[a,b];for(const axle of[-2.0,2.85])for(let i=0;i<=20;i++){const z=axle-.50+i/20; if(z>a&&z<b)cuts.push(z);}cuts.sort((a,b)=>a-b);
    const low=z=>Math.max(.55,...[-2.0,2.85].map(c=>Math.abs(z-c)<.50?.45+Math.sqrt(Math.max(0,.25-(z-c)**2)):.55));
    for(let i=0;i<cuts.length-1;i++){const z0=cuts[i],z1=cuts[i+1],y0=low(z0),y1=low(z1),xo=side*1.25,xi=side*1.13;const face=[[xo,y0,z0],[xo,1.51,z0],[xo,1.51,z1],[xo,y1,z1]],inside=[[xi,y1,z1],[xi,1.51,z1],[xi,1.51,z0],[xi,y0,z0]];quad(m,...(side>0?face:face.reverse()),enamel);quad(m,...(side>0?inside:inside.reverse()),enamel);quad(m,[xi,y0,z0],[xo,y0,z0],[xo,y1,z1],[xi,y1,z1],iron);}
   }
  }
  const rows=isPassage?C.seatRows:Array.from({length:7},(_,i)=>-2.10+i*.88),width=isPassage?C.aisle.seatWidth:.75,centre=isPassage?C.aisle.seatCentreX:.77;
  for(const side of[-1,1])for(const z of rows)cushion(m,side*centre,z,width,seat,seatEdge);
  // Driver’s cushion and high curved back remain in the original footprint.
  cushion(m,.68,-3.35,.56,seat,seatEdge);
  // Solid lower nose with modest curved corners: grille and headlamp frames
  // articulate the original front envelope rather than a second whole bus.
  for(const sign of[-1,1]){
   const points=Array.from({length:9},(_,i)=>{const t=i/8*Math.PI/2;return[sign*(1.04+.16*Math.sin(t)),-4.48-.16*Math.cos(t)];});
   for(let i=0;i<points.length-1;i++){const[a,b]=[points[i],points[i+1]];const face=[[a[0],.68,a[1]],[b[0],.68,b[1]],[b[0],1.40,b[1]],[a[0],1.40,a[1]]];quad(m,...(sign>0?face.reverse():face),enamel);}
   for(const z of[-2.0,2.85]){
    // Rolled arch lip, restrained hub fasteners and a supported trailing flap.
    for(let i=0;i<20;i++){const a=i/20*Math.PI,b=(i+1)/20*Math.PI,p=(r,t)=>[sign*1.265,.45+r*Math.sin(t),z+r*Math.cos(t)];if(isPassage&&sign>0&&z===C.axle.rearZ&&Math.max(z+.525*Math.cos(a),z+.525*Math.cos(b))>C.exit.fromZ)continue;const face=[p(.50,a),p(.525,a),p(.525,b),p(.50,b)];quad(m,...(sign>0?face.reverse():face),edge);}
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;box(m,[sign*1.337,.45+Math.sin(a)*.16,z+Math.cos(a)*.16],[.012,.024,.024],steel);}
    box(m,[sign*1.18,.30,z+.46],[.13,.48,.035],rubber);
   }
   // Service hatch with a real recess, catches and a rear engine grille.
   const x=sign*1.267,z=2.0;
   box(m,[x,1.10,z],[.016,.42,.80],iron);box(m,[x+sign*.009,1.10,z],[.012,.37,.75],enamel);
   for(const zz of[z-.29,z+.29])box(m,[x+sign*.02,1.09,zz],[.016,.045,.07],steel);
   if(!isPassage||sign<0){box(m,[sign*1.267,1.13,3.60],[.018,.48,.77],iron);
    for(let i=0;i<9;i++)box(m,[sign*1.280,.93+i*.048,3.60],[.023,.019,.73],edge);}
   // Roof vents are fitted to the barrel; side marker mounts don't float.
   for(const z of[-3.90,.80,4.10]){if(isPassage&&sign>0&&z>C.exit.fromZ&&z<C.exit.toZ)continue;box(m,[sign*1.269,1.44,z],[.018,.05,.095],edge);}
   box(m,[sign*.81,3.015,.7],[.35,.12,.66],iron);box(m,[sign*.81,3.085,.69],[.30,.045,.58],cream);
   for(let i=0;i<6;i++)box(m,[sign*.81,3.111,.47+i*.074],[.24,.003,.025],iron);
  }
  // Weatherproof the inherited barrel-end gap above the2.925m header.
  // Cap skins stay inside the existing body envelope. The folded1mm raised
  // lip avoids coplanar fighting with the unchanged curved roof surface.
  const oriented=(points,wanted)=>{const n=cross(points[1].map((v,k)=>v-points[0][k]),points[2].map((v,k)=>v-points[0][k]));quad(m,...(n.reduce((sum,v,k)=>sum+v*wanted[k],0)<0?[...points].reverse():points),cream);};
  for(const end of[{outer:-4.587,inner:-4.565,normal:-1},{outer:4.627,inner:4.605,normal:1}]){
   const bottom=2.88,top=x=>2.901+.20*Math.sin(Math.PI*(x+1.22)/2.44);
   for(let i=0;i<16;i++){
    const a=-1.22+2.44*i/16,b=-1.22+2.44*(i+1)/16,ya=top(a),yb=top(b);
    oriented([[a,bottom,end.outer],[a,ya,end.outer],[b,yb,end.outer],[b,bottom,end.outer]],[0,0,end.normal]);
    oriented([[a,bottom,end.inner],[a,ya,end.inner],[b,yb,end.inner],[b,bottom,end.inner]],[0,0,-end.normal]);
    oriented([[a,ya,end.outer],[a,ya,end.inner],[b,yb,end.inner],[b,yb,end.outer]],[0,1,0]);
   }
   oriented([[-1.22,bottom,end.outer],[1.22,bottom,end.outer],[1.22,bottom,end.inner],[-1.22,bottom,end.inner]],[0,-1,0]);
   for(const sign of[-1,1]){const x=sign*1.22;oriented([[x,bottom,end.outer],[x,top(x),end.outer],[x,top(x),end.inner],[x,bottom,end.inner]],[sign,0,0]);}
  }
  // A framed windscreen, its gasket and the original readable destination.
  for(const x of[-1.09,1.09])beam(m,[x,1.54,-4.622],[x*.96,2.48,-4.622],.018,rubber,8);
  beam(m,[-1.08,1.54,-4.625],[1.08,1.54,-4.625],.020,rubber,8);
  beam(m,[-1.05,2.48,-4.625],[1.05,2.48,-4.625],.020,rubber,8);
  // Thin inset perimeter frames read as fitted glass, not a luminous mirror.
  for(const side of[-1,1])for(const z of[-1.75,.02,1.78,3.54]){
   if(isPassage&&side>0&&z>3.3)continue;
   for(const y of[1.55,2.45])box(m,[side*1.255,y,z],[.012,.018,1.48],rubber);
  }
  // Rear engine access, divided grille, grab sockets and yellow plate carrier.
  if(!isPassage){box(m,[0,1.12,4.613],[1.20,.52,.016],iron);
   for(let i=0;i<11;i++)box(m,[0,.90+i*.043,4.628],[1.12,.017,.018],edge);}
  // Keep the passage's literal rear body-aperture clear: plate stays low.
  box(m,[0,.58,4.670],[.59,.12,.018],cream);
  for(const x of[-.36,.36])box(m,[x,.58,4.652],[.025,.22,.028],steel);
  // The normal street bus carries red/ivory municipal paint and is a closed
  // vehicle. Its entry panel is modelled as a glazed folding leaf, not a hole.
  if(ambient){
   for(const z of[-3.67,-3.15,-2.63])box(m,[-1.248,1.48,z],[.028,1.94,.035],rubber);
   for(const y of[.56,1.30,2.43])box(m,[-1.25,y,-3.15],[.035,.045,1.06],cream);
   box(m,[-1.245,.92,-3.15],[.018,.69,.98],enamel);
   for(const z of[-3.39,-2.88])beam(m,[-1.26,1.34,z],[-1.26,2.35,z],.008,roles['outskirts glass edge reflection'],6);
   // Glass itself remains an aperture into the actual seating. No opaque
   // bright window cards or mirror planes return.
   for(const g of m.groups.values())for(let i=0;i<g.p.length;i+=3){g.p[i]*=.98;const n=unit([g.n[i]/.98,g.n[i+1],g.n[i+2]]);g.n.splice(i,3,...n);}
  }
  m.extras={...original.extras,refinement:'municipal-coachwork-r1',sourceMesh:sourceName,dimensions:{width:2.45,length:9.2,height:3.12},manufacture:['ergonomic bevelled moquette cushions','curved shoulder backs','continuous roof shading','sealed barrel-roof ends','real wheel cutouts','rolled wheel arch lips','recessed service hatches','engine louvres','supported roof ventilation','fitted windscreen gaskets'],glazing:'clear real apertures with physical frames and limited streaks; no mirror surfaces',preserved:['instance transforms','route/support/collision authority','door hinges/leaves','first-person crossing stages','source destination print','powered passage practical ownership'],ambientPaintCompatible:ambient,modelledSeatRows:rows,seatCentreX:centre,seatWidth:width,drawcallBudget:ambient?8:isPassage?16:18};
  const out=doc.createMesh(name),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let tris=0;
  const accessor=(name,v,type,integer=false)=>doc.createAccessor(name).setType(type).setBuffer(buffer).setArray(integer?new Uint32Array(v):new Float32Array(v));
  for(const[mat,g]of m.groups){if(!g.i.length)continue;for(let i=0;i<g.p.length;i++){const k=i%3;min[k]=Math.min(min[k],g.p[i]);max[k]=Math.max(max[k],g.p[i]);}tris+=g.i.length/3;out.addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION',accessor(name+' position',g.p,'VEC3')).setAttribute('NORMAL',accessor(name+' normal',g.n,'VEC3')).setAttribute('TEXCOORD_0',accessor(name+' uv',g.uv,'VEC2')).setIndices(accessor(name+' indices',g.i,'SCALAR',true)));}
  out.setExtras(m.extras);scene.addChild(doc.createNode(name).setMesh(out));stats.meshes[name]={triangles:tris,primitives:out.listPrimitives().length,bounds:{min,max},sourceTriangles:original.primitives.reduce((n,p)=>n+pack.json.accessors[p.indices].count/3,0),retainedTriangles:retained,replacedTriangles:removed,movedTyreVertices,smoothRoofVertices,modelledSeatRows:rows,seatWidth:width,seatCentreX:centre};stats.totalTriangles+=tris;
  if(tris>14000||out.listPrimitives().length>(ambient?8:18))throw Error(`${name} budget exceeded ${tris}/${out.listPrimitives().length}`);
 }
 const bytes=Buffer.from(await new NodeIO().writeBinary(doc));stats.bytes=bytes.length;stats.sha256=sha(bytes);stats.textureCount=doc.getRoot().listTextures().length;stats.materialCount=doc.getRoot().listMaterials().length;stats.textureSource='Existing destination/registration textures retained; no new texture images.';
 if(bytes.length>5e6)throw Error('Bus refinement pack exceeds 5MB budget');for(const[p,h]of Object.entries(hashes))if(sha(fs.readFileSync(path.join(root,p)))!==h)throw Error('Protected bus source changed '+p);
 const credits={pack:'bus-refinement.glb',sha256:stats.sha256,geometry:'Original project-native municipal coachwork refinement derived from the project’s existing detailed buses.',builder:stats.generator,thirdPartyGeometryUsed:false,acquisitionManifest:'assets/source-bus-candidates/manifest.json',existingDestinationPrint:'Retained byte-equivalent texture images and UV data from production bus.',limitations:stats.pending};
 return{bytes,stats,credits};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.env.BUS_REFINEMENT_OUTPUT||path.join(root,'public/assets/bus-refinement.glb'),result=await buildBusRefinement();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,result.bytes);fs.writeFileSync(out.replace('.glb','.stats.json'),JSON.stringify(result.stats,null,2)+'\n');fs.writeFileSync(out.replace('.glb','.credits.json'),JSON.stringify(result.credits,null,2)+'\n');console.log(JSON.stringify(result.stats,null,2));
}
