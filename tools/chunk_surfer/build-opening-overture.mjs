// Standalone authored pigeon parts. This never reads or rebuilds a shared pack.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {encodeGlb} from './rebuild-tree-crowns.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const materials=[
 ['blue-grey body',[.36,.39,.42],.90,0],['charcoal primary feathers',[.12,.14,.17],.88,0],['pale feather edges',[.43,.45,.46],.92,0],
 ['green neck sheen',[.12,.25,.20],.36,.18],['dark bill and pupil',[.025,.029,.032],.25,0],['ivory bill cere',[.76,.74,.66],.83,0],['dusty red feet',[.39,.14,.13],.87,0],['worn ivory parking paint',[.72,.70,.59],.98,0],
 ['white rump feathers',[.69,.70,.68],.92,0],['orange-red iris',[.63,.22,.055],.35,0],['violet neck sheen',[.26,.17,.29],.38,.15],['blue-grey orbital skin',[.43,.45,.47],.72,0],['raised pink leg scales',[.50,.22,.20],.90,0],['dark keratin claws',[.19,.17,.14],.60,0],['pale underwing down',[.51,.52,.52],.94,0],['breast grey',[.39,.40,.43],.91,0],['slate head',[.27,.31,.35],.88,0],
];

// Anatomy references only. No photographs, text passages, textures or meshes
// from these publishers are copied into the original CC0 geometry.
export const OPENING_PIGEON_REFERENCES=Object.freeze([
 {title:'Rock Pigeon Identification',publisher:'Cornell Lab of Ornithology',url:'https://www.allaboutbirds.org/guide/Rock_Pigeon/id',use:'Plump body/small head, thin bill, blue-bar wing and tail pattern;30–36cm length and50–67cm wingspan.',assetReuse:false},
 {title:'Rock pigeon',publisher:'New Zealand Birds Online / Te Papa',url:'https://www.nzbirdsonline.org.nz/species/rock-pigeon',use:'Iris, ivory cere, grey-black bill, red-pink toes, white rump and green-purple neck plumage.',assetReuse:false},
 {title:'How Bird Feathers Work',publisher:'Natural History Museum of Los Angeles County',url:'https://nhm.org/stories/how-bird-feathers-work',use:'Overlapping contour feathers and coverts above flight feathers; solid feather vane and central shaft.',assetReuse:false},
 {title:'Wing and Body Kinematics of Takeoff and Landing Flight in the Pigeon',publisher:'Journal of Experimental Biology / Harvard University repository',url:'https://dash.harvard.edu/server/api/core/bitstreams/7312037c-9419-6bd4-e053-0100007fdf3b/content',use:'Leg extension, initial upstroke/downstroke sequence and coordinated body/wing motion; authored animation is not a force simulation.',assetReuse:false}
]);

const subtract=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
export function openingOvertureGeometry(){
 const meshes=[],group=(name,prefix='overture_pigeon_')=>{const byMaterial=new Map();meshes.push({name:prefix+name,byMaterial,role:prefix==='overture_'?'parking-marking':'bird-part'});return byMaterial;};
 function triangle(g,material,a,b,c,inside=null,normals=null){let n=cross(subtract(b,a),subtract(c,a));if(Math.hypot(...n)<1e-12)return;const center=a.map((v,k)=>(v+b[k]+c[k])/3);if(inside&&dot(n,subtract(center,inside))<0){[b,c]=[c,b];if(normals)normals=[normals[0],normals[2],normals[1]];n=n.map(v=>-v);}n=unit(n);if(!g.has(material))g.set(material,{p:[],n:[],uv:[],i:[]});const out=g.get(material);for(const[k,p]of[a,b,c].entries()){out.i.push(out.p.length/3);out.p.push(...p);out.n.push(...(normals?.[k]||n));out.uv.push(p[0]*8,p[2]*8);}}
 function ellipsoid(g,mat,at,radii,slices=14,rings=9){const p=(x,y)=>{const a=x/slices*Math.PI*2,b=-Math.PI/2+y/rings*Math.PI;return[at[0]+Math.cos(b)*Math.cos(a)*radii[0],at[1]+Math.sin(b)*radii[1],at[2]+Math.cos(b)*Math.sin(a)*radii[2]];},normal=p=>unit(p.map((v,k)=>(v-at[k])/(radii[k]*radii[k])));for(let y=0;y<rings;y++)for(let x=0;x<slices;x++){const a=p(x,y),b=p(x+1,y),c=p(x+1,y+1),d=p(x,y+1);triangle(g,mat,a,b,c,at,[normal(a),normal(b),normal(c)]);triangle(g,mat,a,c,d,at,[normal(a),normal(c),normal(d)]);}}
 function eyeRing(g,mat,side,at,radius,tube){const p=(i,j)=>{const a=i/14*Math.PI*2,b=j/4*Math.PI*2,r=radius+Math.cos(b)*tube;return[at[0]+side*Math.sin(b)*tube,at[1]+Math.cos(a)*r,at[2]+Math.sin(a)*r];};for(let i=0;i<14;i++)for(let j=0;j<4;j++){const a=p(i,j),b=p(i+1,j),c=p(i+1,j+1),d=p(i,j+1);const mid=(i+.5)/14*Math.PI*2,inside=[at[0],at[1]+Math.cos(mid)*radius,at[2]+Math.sin(mid)*radius];triangle(g,mat,a,b,c,inside);triangle(g,mat,a,c,d,inside);}}
 function cylinder(g,mat,a,b,r0,r1=r0,sides=7){const along=unit(subtract(b,a)),seed=Math.abs(along[1])<.9?[0,1,0]:[1,0,0],u=unit(cross(along,seed)),v=cross(along,u),inside=a.map((n,k)=>(n+b[k])/2),p=(at,r,k)=>at.map((n,j)=>n+r*(u[j]*Math.cos(k/sides*Math.PI*2)+v[j]*Math.sin(k/sides*Math.PI*2)));for(let k=0;k<sides;k++){const c=p(a,r0,k),d=p(a,r0,k+1),e=p(b,r1,k+1),f=p(b,r1,k);triangle(g,mat,c,d,e,inside);triangle(g,mat,c,e,f,inside);triangle(g,mat,a,d,c,inside);triangle(g,mat,b,f,e,inside);}}
 function feather(g,mat,a,b,width,thickness=.0025,{tipMaterial=null,shaft=false,camber=.002}={}){
  const axis=unit([b[0]-a[0],0,b[2]-a[2]]),side=[-axis[2],0,axis[0]],length=Math.hypot(b[0]-a[0],b[2]-a[2]),sections=[[0,.12],[.13,.69],[.44,1],[.73,.83],[.80,.66],[.94,.32],[1,.025]],center=t=>a.map((v,k)=>v+axis[k]*t*length+(k===1?(b[1]-a[1])*t+Math.sin(t*Math.PI)*camber:0)),ring=([t,w])=>{const q=center(t);return[[0,thickness*1.6],[-w*width/2,0],[0,-thickness],[w*width/2,0]].map(([s,y])=>q.map((n,k)=>n+side[k]*s+(k===1?y:0)));};
  for(let k=1;k<sections.length;k++){const first=ring(sections[k-1]),last=ring(sections[k]),inside=center((sections[k][0]+sections[k-1][0])/2),material=tipMaterial!==null&&sections[k-1][0]>=.8?tipMaterial:mat;for(let j=0;j<4;j++){const n=(j+1)%4;triangle(g,material,first[j],last[j],last[n],inside);triangle(g,material,first[j],last[n],first[n],inside);}}
  for(const k of[0,sections.length-1]){const r=ring(sections[k]),inside=center(.5);triangle(g,mat,r[0],r[1],r[2],inside);triangle(g,mat,r[0],r[2],r[3],inside);}
  if(shaft){const p=center(.08),q=center(.80);p[1]+=thickness*1.8;q[1]+=thickness*1.8;cylinder(g,2,p,q,.00065,.00025,4);}
 }
 // A rounded breast, a tapering neck and a smaller head replace the toy-like
 // stack of equal spheres. Smooth normals do not erase the solid feather edges.
 const body=group('body');ellipsoid(body,0,[0,.143,.015],[.063,.089,.108],18,11);ellipsoid(body,15,[0,.116,-.025],[.055,.059,.078],14,8);ellipsoid(body,16,[0,.200,-.052],[.040,.063,.047],14,9);ellipsoid(body,3,[0,.214,-.072],[.037,.041,.033],14,7);
 for(const side of[-1,1]){
  for(let k=0;k<6;k++)feather(body,k%3===0?2:0,[side*.037,.216-k*.009,-.027+k*.018],[side*.057,.191-k*.010,.012+k*.023],.020,.0011);
  for(let k=0;k<3;k++)feather(body,k===1?10:3,[side*.023,.237-k*.014,-.081],[side*.037,.217-k*.014,-.069],.019,.0009);
  for(let k=0;k<3;k++)feather(body,8,[side*(.008+k*.010),.218,.072],[side*(.015+k*.010),.170,.126],.021,.0011);
 }
 for(const x of[-.020,0,.020])for(let k=0;k<1;k++)feather(body,15,[x,.177-k*.019,-.080],[x*1.05,.151-k*.019,-.091],.020,.0008);
 const head=group('head');ellipsoid(head,16,[0,0,0],[.030,.034,.036],14,9);ellipsoid(head,16,[0,-.011,.002],[.031,.020,.029],10,6);
 for(const side of[-1,1]){const eye=[side*.0298,.006,-.016];eyeRing(head,11,side,eye,.0069,.0008);ellipsoid(head,9,[side*.0305,.006,-.016],[.0029,.0057,.0057],10,6);ellipsoid(head,4,[side*.0330,.006,-.016],[.0016,.0030,.0030],8,5);ellipsoid(head,5,[side*.0342,.0081,-.0174],[.0007,.0008,.0008],5,3);}
 const beak=group('beak');cylinder(beak,4,[0,-.009,-.027],[0,-.011,-.045],.0105,.0078,9);cylinder(beak,4,[0,-.011,-.045],[0,-.016,-.066],.0078,.0013,9);cylinder(beak,13,[0,-.018,-.030],[0,-.020,-.061],.0058,.001,8);ellipsoid(beak,5,[0,.001,-.034],[.012,.007,.014],12,7);for(const side of[-1,1])ellipsoid(beak,4,[side*.0083,.002,-.043],[.0020,.0012,.0038],8,5);
 const tail=group('tail');for(let k=0;k<12;k++){const spread=(k-5.5)/5.5;feather(tail,0,[spread*.017,0,0],[spread*.052,-.014,.107-Math.abs(spread)*.008],.022,.0018,{tipMaterial:1});}
 for(const side of[-1,1]){
  const suffix=side<0?'l':'r',inner=group('wing_inner_'+suffix);ellipsoid(inner,14,[side*.043,-.002,.010],[.051,.012,.061],12,6);
  for(let k=0;k<6;k++){const z=-.041+k*.020;feather(inner,k===1||k===4?1:0,[side*.019,.003,z],[side*.108,-.007,z+.040],.027,.0017);}
  for(let k=0;k<5;k++)feather(inner,k===1?1:2,[side*.008,.014,-.032+k*.021],[side*.062,.010,-.009+k*.022],.024,.0012);
  const outer=group('wing_outer_'+suffix);cylinder(outer,0,[0,0,-.030],[side*.054,0,-.042],.006,.0035,7);
  for(let k=0;k<10;k++){const t=k/9;feather(outer,k<2?0:1,[side*.002,0,-.030+t*.057],[side*(.109+.035*Math.sin(t*Math.PI)),-.011,-.062+t*.151],.022,.0017,{shaft:k>2});}
  for(let k=0;k<4;k++)feather(outer,0,[0,.008,-.027+k*.019],[side*.060,.004,-.023+k*.022],.023,.0010);
  const foot=group('foot_'+suffix);cylinder(foot,6,[0,.085,.006],[0,.031,.010],.0043,.0036);cylinder(foot,6,[0,.031,.010],[0,.010,0],.0036,.0030);
  for(let k=0;k<4;k++)cylinder(foot,12,[0,.044+k*.009,.008],[0,.0455+k*.009,.008],.0045,.0044,6);
  for(const[toe,x,z]of[[0,-.016,-.036],[1,0,-.047],[2,.016,-.035],[3,.006,.023]]){const a=[0,.010,0],b=[x*.52,.004,z*.55],c=[x,.001,z];cylinder(foot,6,a,b,.0027,.0022,6);cylinder(foot,6,b,c,.0022,.0015,6);const claw=[x,.0005,z+(toe===3?.006:-.006)];cylinder(foot,13,c,claw,.0015,.0003,5);for(const t of[.32,.68]){const p=[x*t,.009*(1-t)+.0015,z*t],q=[x*(t+.035),p[1]-.0003,z*(t+.035)];cylinder(foot,12,p,q,.0027-.001*t,.0026-.001*t,5);}}
 }
 const parking=group('parking_bay','overture_');
 // Actual sparse service-bay paint. The open centre and chipped gaps reveal
 // the existing road; these tiny volumes never provide collision or a HUD.
 function paint(x0,x1,z0,z1){const p=[[x0,.010,z0],[x1,.010,z0],[x1,.010,z1],[x0,.010,z1],[x0,.014,z0],[x1,.014,z0],[x1,.014,z1],[x0,.014,z1]],inside=[(x0+x1)/2,.012,(z0+z1)/2];for(const[a,b,c,d]of[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]){triangle(parking,7,p[a],p[b],p[c],inside);triangle(parking,7,p[a],p[c],p[d],inside);}}
 const ordered=(a,b)=>a<b?[a,b]:[b,a];
 for(const x of[-1,1])for(const z of[-1,1]){
  const side=ordered(x*1.33,x*1.4),end=ordered(z*3.03,z*3.1);
  for(const[a,b]of[[0,.27],[.32,.65]]){const q=ordered(z*(3.1-a),z*(3.1-b));paint(...side,...q);}
  for(const[a,b]of[[.07,.27],[.31,.54]]){const q=ordered(x*(1.4-a),x*(1.4-b));paint(...q,...end);}
 }
 for(const x of[-1,1])for(const z of[-.72,.72]){const q=ordered(x*1.33,x*1.4);paint(...q,z-.23,z-.025);paint(...q,z+.025,z+.23);}
 return meshes;
}
export function buildOpeningOverture({root=ROOT,write=true}={}){
 const geometry=openingOvertureGeometry(),json={asset:{version:'2.0',generator:'Chunk Surfer standalone opening overture pigeon rig'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:materials.map(([name,color,roughness,metallic])=>({name:'opening pigeon '+name,pbrMetallicRoughness:{baseColorFactor:[...color,1],roughnessFactor:roughness,metallicFactor:metallic},emissiveFactor:[0,0,0]})),buffers:[],bufferViews:[],accessors:[]},chunks=[];let bytes=0;
 function accessor(values,size,integer=false){const typed=integer?new Uint32Array(values):new Float32Array(values),aligned=(bytes+3)&~3;if(aligned>bytes)chunks.push(Buffer.alloc(aligned-bytes));const chunk=Buffer.from(typed.buffer);chunks.push(chunk);const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:aligned,byteLength:chunk.length,target:integer?34963:34962});bytes=aligned+chunk.length;const a={bufferView:view,componentType:integer?5125:5126,count:values.length/size,type:size===1?'SCALAR':`VEC${size}`};if(size===3&&!integer){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let k=0;k<values.length;k++){a.min[k%3]=Math.min(a.min[k%3],values[k]);a.max[k%3]=Math.max(a.max[k%3],values[k]);}}json.accessors.push(a);return json.accessors.length-1;}
 const records=[];for(const g of geometry){let count=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],primitives=[];for(const[material,p]of g.byMaterial){count+=p.i.length/3;for(let k=0;k<p.p.length;k++){min[k%3]=Math.min(min[k%3],p.p[k]);max[k%3]=Math.max(max[k%3],p.p[k]);}primitives.push({attributes:{POSITION:accessor(p.p,3),NORMAL:accessor(p.n,3),TEXCOORD_0:accessor(p.uv,2)},indices:accessor(p.i,1,true),material});}json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({name:g.name,mesh:json.meshes.length});json.meshes.push({name:g.name,extras:{openingOverture:true,role:g.role,rig:g.role==='bird-part'?'rigid articulated pigeon':null,noCollision:true,pivot:'runtime part origin',units:'metres'},primitives});records.push({name:g.name,triangles:count,bounds:{min,max}});}
 json.buffers=[{byteLength:bytes}];const output=encodeGlb(json,Buffer.concat(chunks)),sha256=crypto.createHash('sha256').update(output).digest('hex'),stats={version:2,asset:'opening-overture.glb',sha256,bytes:output.length,triangles:records.reduce((n,p)=>n+p.triangles,0),meshes:records,materials:json.materials.length,images:0,rig:{type:'runtime rigid articulated',parts:records.filter(p=>p.name.startsWith('overture_pigeon_')).map(p=>p.name),wings:'rear-folding shoulder/elbow joints; ten solid primary feathers, layered secondaries and coverts, visible rachis ridges',rootMotion:'authored finite takeoff paths in physical metres'}};
 if(write){const directory=path.join(root,'public/assets');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'opening-overture.glb'),output);fs.writeFileSync(path.join(directory,'opening-overture.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(path.join(directory,'opening-overture.credits.json'),JSON.stringify({version:1,title:'Opening overture pigeons',creator:'Chunk Surfer procedural authoring',license:'CC0-1.0',source:'tools/chunk_surfer/build-opening-overture.mjs',description:'Original hero rock pigeon geometry: smoothly rounded breast, small slate head, orange-red iris and pupil within orbital rim, split dark bill with ivory cere and nostrils, green-purple neck feathers, white rump, twelve tail feathers with dark terminal band, two wing bars, layered coverts and ten solid primary feathers per wing, scaly red legs and individual clawed toes. Chipped ivory L-corners and short dashed sides mark a2.8m by6.2m service parking bay. No external images or meshes.',externalSources:[],referenceSources:OPENING_PIGEON_REFERENCES,pack:{sha256,bytes:output.length,triangles:stats.triangles}},null,2)+'\n');}
 return{stats,json,buffer:output};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const{stats}=buildOpeningOverture();console.log(JSON.stringify({asset:stats.asset,bytes:stats.bytes,triangles:stats.triangles,meshes:stats.meshes.length}));}
