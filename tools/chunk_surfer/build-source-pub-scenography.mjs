// An isolated selective room: surviving fittings, unfinished ribs and cold
// casks. The original warm pub pack and its canonical collisions stay intact.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';
import {buildPubInterior,PUB_INTERIOR_LAYOUT} from './pub-interior-geometry.mjs';
import {SOURCE_PUB_SCENOGRAPHY as CONFIG} from '../../src/data/source-pub-scenography.js';
const root=new URL('../../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const before=Object.fromEntries(CONFIG.protectedPacks.map(f=>[f,sha(read(f))]));
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('The unfinished Lyric'),materials=new Map(),meshes=new Map(),stats={meshes:{},sourceSha256:before,retainedFixtures:[],omittedFixtures:[]};
function mat(name,rgb,roughness=.95,metal=0,emission){const key='Source Lyric / '+name;if(!materials.has(key)){const m=doc.createMaterial(key).setBaseColorFactor([...rgb,1]).setRoughnessFactor(roughness).setMetallicFactor(metal).setDoubleSided(true);if(emission)m.setEmissiveFactor(emission);materials.set(key,m);}return key;}
const ids={wood:mat('cold stripped timber',[.19,.225,.23]),end:mat('exposed end grain',[.25,.28,.275]),iron:mat('dull iron',[.14,.18,.20],.74,.45),plaster:mat('unfinished grey plaster',[.37,.41,.42]),black:mat('unlit recess',[.019,.026,.031]),glass:mat('frosted cold glass',[.48,.61,.66],.64,0,[.20,.39,.50]),brass:mat('tarnished tap brass',[.30,.32,.28],.76,.4)};
const getMesh=name=>{if(!meshes.has(name)){const data={groups:new Map(),triangles:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};meshes.set(name,data);}return meshes.get(name);};
function tri(name,key,a,b,c){const m=getMesh(name);if(!m.groups.has(key))m.groups.set(key,{p:[],n:[],i:[]});const g=m.groups.get(key),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1,offset=g.p.length/3;for(const p of[a,b,c]){g.p.push(...p);g.n.push(...n.map(v=>v/len));for(let k=0;k<3;k++){m.bounds.min[k]=Math.min(m.bounds.min[k],p[k]);m.bounds.max[k]=Math.max(m.bounds.max[k],p[k]);}}g.i.push(offset,offset+1,offset+2);m.triangles++;}
function shape(name,key,p,i){for(let n=0;n<i.length;n+=3)tri(name,key,...i.slice(n,n+3).map(k=>p[k]));}
function box(name,key,c,s,yaw=0){const p=[],cs=Math.cos(yaw),sn=Math.sin(yaw);for(const z of[-1,1])for(const y of[-1,1])for(const x of[-1,1])p.push([c[0]+x*s[0]/2*cs-z*s[2]/2*sn,c[1]+y*s[1]/2,c[2]+x*s[0]/2*sn+z*s[2]/2*cs]);shape(name,key,p,[0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5]);}
function cylinder(name,key,c,r,h,sides=12){const p=[[c[0],c[1]-h/2,c[2]],[c[0],c[1]+h/2,c[2]]],i=[];for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2;p.push([c[0]+Math.cos(a)*r,c[1]-h/2,c[2]+Math.sin(a)*r],[c[0]+Math.cos(a)*r,c[1]+h/2,c[2]+Math.sin(a)*r]);}for(let n=0;n<sides;n++){const a=2+n*2,b=2+(n+1)%sides*2;i.push(a,b+1,b,a,a+1,b+1,0,a,b,1,b+1,a+1);}shape(name,key,p,i);}
function beam(name,key,a,b,w){const d=b.map((v,k)=>v-a[k]),len=Math.hypot(...d),axis=d.map(v=>v/len),ref=Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],u=[axis[1]*ref[2]-axis[2]*ref[1],axis[2]*ref[0]-axis[0]*ref[2],axis[0]*ref[1]-axis[1]*ref[0]],ul=Math.hypot(...u);for(let k=0;k<3;k++)u[k]/=ul;const v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]],p=[];for(const end of[a,b])for(const y of[-1,1])for(const x of[-1,1])p.push(end.map((t,k)=>t+(x*u[k]+y*v[k])*w/2));shape(name,key,p,[0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5]);}
// Generate the canonical fittings through their existing geometry contract,
// retaining only named furniture/pendants/WC. Parquet, coving and full wall
// finishes are absent by construction, rather than covered by a fake hole.
const packets=[],palette=[],origin=PUB_INTERIOR_LAYOUT.meshOriginInRow;let ordinal=0;
function packet(kind,args,count){packets.push({kind,args,start:ordinal,count});ordinal+=count;}
const canonical=buildPubInterior({mesh:name=>({name}),materials:palette,
 addBox:(m,c,s,id,yaw)=>packet('box',[c,s,id,yaw],12),
 addBeam:(m,a,b,w,id)=>packet('beam',[a,b,w,id],12),
 addCylinder:(m,c,r,h,id,sides)=>packet('cylinder',[c,r,h,id,sides],sides*4),
 addQuad:(m,a,b,c,d,id)=>packet('quad',[a,b,c,d,id],2)});
const cold=palette.map(p=>{const n=p.name;let c=n.includes('wood')?[.22,.25,.255]:n.includes('upholstery')?[.075,.12,.135]:n.includes('plaster')?[.38,.42,.44]:n==='brass'?[.29,.32,.30]:n.includes('lamp')?[.43,.57,.63]:n==='ivory'?[.48,.53,.53]:(p.pbrMetallicRoughness.baseColorFactor.slice(0,3).map((v,k)=>v*.45+[.025,.045,.065][k]));return mat(n,c,.93,n==='brass'?.4:0,n.includes('lamp')?[.12,.28,.36]:null);});
let at=0;const ranges=canonical.fixtures.map(f=>{const r={...f,start:at,end:at+f.triangles};at=r.end;return r;});
const convert=p=>[p[2]+origin.z+32,p[1],-p[0]-origin.x];
for(const p of packets){const f=ranges.find(f=>p.start>=f.start&&p.start<f.end),keep=!['floor-finish','wall-finish','ceiling-finish','wall-picture','wall-mirror','ceiling-practical'].includes(f.kind);if(!keep)continue;const a=p.args;
 if(p.kind==='box'){const c=convert(a[0]),s=[a[1][2],a[1][1],a[1][0]];box(CONFIG.meshes.fittings,cold[a[2]],c,s,a[3]||0);}
 if(p.kind==='beam')beam(CONFIG.meshes.fittings,cold[a[3]],convert(a[0]),convert(a[1]),a[2]);
 if(p.kind==='cylinder')cylinder(CONFIG.meshes.fittings,cold[a[3]],convert(a[0]),a[1],a[2],a[4]);
 if(p.kind==='quad'){const v=a.slice(0,4).map(convert);tri(CONFIG.meshes.fittings,cold[a[4]],v[0],v[1],v[2]);tri(CONFIG.meshes.fittings,cold[a[4]],v[0],v[2],v[3]);}
}
for(const f of ranges)(['floor-finish','wall-finish','ceiling-finish','wall-picture','wall-mirror','ceiling-practical'].includes(f.kind)?stats.omittedFixtures:stats.retainedFixtures).push({id:f.id,kind:f.kind,triangles:f.triangles});
// Unit deck carries a cold top and actual end-grain edges 16 cm deep.
box(CONFIG.meshes.deck,ids.end,[0,-.08,0],[1,.16,1]);box(CONFIG.meshes.deck,ids.wood,[0,-.006,0],[1,.012,1]);
box(CONFIG.meshes.joist,ids.wood,[0,-.27,0],[1,.25,1]);
// A 2.4 m bay has missing plaster panels, raw studs and a roof that was never
// finished. It cannot close the vertical view between the three rooms.
const bay=CONFIG.meshes.bay;
for(const z of[0,5.4]){for(const x of[-1.16,1.16])box(bay,ids.wood,[x,1.70,z],[.08,3.4,.10]);box(bay,ids.wood,[0,3.38,z],[2.4,.10,.13]);box(bay,ids.wood,[0,.12,z],[2.4,.13,.13]);}
box(bay,ids.plaster,[-.62,1.42,5.45],[1.08,2.64,.055]);box(bay,ids.plaster,[.70,.48,5.45],[.68,.86,.055]);
for(const y of[.35,.83,1.31,1.79,2.27,2.75])box(bay,ids.end,[.58,y,5.43],[.94,.035,.04]);
beam(bay,ids.wood,[-1.16,3.31,0],[1.16,3.31,5.4],.08);
box(CONFIG.meshes.panel,ids.plaster,[0,0,0],[.88,1.32,.065]);for(const x of[-.40,.40])box(CONFIG.meshes.panel,ids.wood,[x,0,.05],[.045,1.34,.04]);
// A coopered cask is a small shared library mesh. Separate staves, three metal
// hoops, recessed end heads and a real bung read at human and tower scale.
const cask=CONFIG.meshes.cask,sides=12,profile=[[.30,0],[.35,.12],[.37,.43],[.35,.74],[.30,.86]];
for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2+.009,b=(n+1)/sides*Math.PI*2-.009;for(let k=1;k<profile.length;k++){const[r0,y0]=profile[k-1],[r1,y1]=profile[k],p=[[Math.sin(a)*r0,y0,Math.cos(a)*r0],[Math.sin(b)*r0,y0,Math.cos(b)*r0],[Math.sin(b)*r1,y1,Math.cos(b)*r1],[Math.sin(a)*r1,y1,Math.cos(a)*r1]];tri(cask,n%3===0?ids.end:ids.wood,p[0],p[1],p[2]);tri(cask,n%3===0?ids.end:ids.wood,p[0],p[2],p[3]);}}
for(const y of[.10,.43,.76]){const r=y===.43?.378:.354;cylinder(cask,ids.iron,[0,y,0],r,.037,12);}
for(const y of[.025,.835])cylinder(cask,ids.end,[0,y,0],.294,.027,12);
cylinder(cask,ids.black,[0,.865,0],.039,.016,8);
// Tiny low pendants are the visible source of the local cold table/face pools.
const lamp=CONFIG.meshes.practical;cylinder(lamp,ids.iron,[0,.11,0],.075,.22,10);cylinder(lamp,ids.glass,[0,.025,0],.12,.09,10);cylinder(lamp,ids.iron,[0,-.027,0],.135,.015,10);
// Literal service contents: nothing means an actually bare tray, and the last
// clean glass is one physical glass rather than another pair of waters.
function lathe(name,key,c,profile,sides=20){const p=[],i=[];for(let row=0;row<profile.length;row++)for(let n=0;n<=sides;n++){const a=n/sides*Math.PI*2,[r,y]=profile[row];p.push([c[0]+Math.sin(a)*r,c[1]+y,c[2]+Math.cos(a)*r]);if(row&&n){const v=(row-1)*(sides+1)+n-1;i.push(v,v+1,v+sides+2,v,v+sides+2,v+sides+1);}}shape(name,key,p,i);}
const trayProfile=[[0,.006],[.18,.006],[.194,.012],[.197,.023],[.194,.028],[.185,.026],[.180,.017],[0,.017]];
for(const name of[CONFIG.meshes.emptyTray,CONFIG.meshes.singleTray])lathe(name,ids.wood,[0,0,0],trayProfile,28);
for(const[name,y]of[[CONFIG.meshes.singleTray,.017],[CONFIG.meshes.waterGlass,0]]){
 lathe(name,ids.glass,[0,y,0],[[0,0],[.031,0],[.035,.10],[.031,.10],[.027,.006],[0,.006]],20);
 lathe(name,mat('still cold water',[.22,.32,.36],.34),[0,y,0],[[0,.007],[.027,.007],[.030,.078],[0,.078]],20);
}
for(const[name,data]of meshes){const mesh=doc.createMesh(name);scene.addChild(doc.createNode(name).setMesh(mesh));for(const[key,g]of data.groups){const accessor=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.p))).setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.n))).setIndices(accessor('SCALAR',Uint32Array.from(g.i))).setMaterial(materials.get(key)));}stats.meshes[name]={triangles:data.triangles,bounds:data.bounds};}
stats.triangles=Object.values(stats.meshes).reduce((n,m)=>n+m.triangles,0);if(stats.triangles>CONFIG.maximumTriangles)throw Error('Source scenography triangle budget exceeded');
const file='public/'+CONFIG.asset;await new NodeIO().write(new URL(file,root).pathname,doc);const output=read(file);if(output.length>CONFIG.maximumBytes)throw Error('Source scenography byte budget exceeded');
for(const[f,h]of Object.entries(before))if(sha(read(f))!==h)throw Error('Protected pack changed: '+f);
stats.bytes=output.length;stats.sha256=sha(output);stats.materials=[...materials.keys()];fs.writeFileSync(new URL('public/assets/source-pub-scenography.stats.json',root),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(new URL('public/assets/source-pub-scenography.credits.json',root),JSON.stringify({license:'Project authored geometry and materials. Canonical pub fittings generated from the retained project geometry contract.',sourceSha256:{...before,'src/data/source-pub-scenography.js':sha(read('src/data/source-pub-scenography.js')),'tools/chunk_surfer/build-source-pub-scenography.mjs':sha(read('tools/chunk_surfer/build-source-pub-scenography.mjs')),'tools/chunk_surfer/pub-interior-geometry.mjs':sha(read('tools/chunk_surfer/pub-interior-geometry.mjs'))},packs:[{file,bytes:output.length,sha256:stats.sha256}]},null,2)+'\n');console.log(JSON.stringify({bytes:output.length,triangles:stats.triangles,meshes:Object.keys(stats.meshes),sourcePacksUnchanged:true}));
