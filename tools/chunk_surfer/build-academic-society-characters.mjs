// Small dedicated anatomical character pack for the third-floor ghost society.
// Retained CC0 masters provide anatomy and weights. Original facial sculpt,
// fitted hair, cut and tailoring establish the named and anonymous people.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canonicalAnatomy,retargetMesh} from './characters/vigil-tailoring.mjs';
import {buildAcademicPeriodWoman} from './characters/academic-period-women.mjs';
import {buildAcademicPeriodMan} from './characters/academic-period-men.mjs';
import {parseCharacterAsset} from '../../src/render/character-asset.js';
import {ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS,ACADEMIC_FLOOR_POPULATION_DESIGNS as POPULATION} from '../../src/data/academic-society-character-design.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(root+file));
const masters={male:canonicalAnatomy(read('public/assets/recordist-characters/contractor.json')),female:canonicalAnatomy(read('artifacts/bus-woman-production/anatomy.json'))};
const clean=canonicalAnatomy(read('artifacts/bus-woman-design/anatomy/woman.json'));
const gltf={asset:{version:'2.0',generator:'Chunk Surfer original Academic society anatomical characters'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
const chunks=[];let cursor=0;
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),unit=a=>mul(a,1/(Math.hypot(...a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},gauss=(v,c,w)=>Math.exp(-(((v-c)/w)**2));
function accessor(values,type,componentType=5126,target){
 const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
 if(values.some(v=>!Number.isFinite(v)))throw Error('Non-finite Academic character geometry');
 while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}const typed=new Ctor(values),bytes=Buffer.from(typed.buffer),view=gltf.bufferViews.length;
 gltf.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);cursor+=bytes.length;
 const a={bufferView:view,componentType,count:values.length/width,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){a.min[i%3]=Math.min(a.min[i%3],values[i]);a.max[i%3]=Math.max(a.max[i%3],values[i]);}}
 gltf.accessors.push(a);return gltf.accessors.length-1;
}
function normals(mesh){const n=Array(mesh.positions.length).fill(0);for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),p=ids.map(v=>mesh.positions.slice(v*3,v*3+3)),face=cross(sub(p[1],p[0]),sub(p[2],p[0]));for(const v of ids)for(let k=0;k<3;k++)n[v*3+k]+=face[k];}for(let i=0;i<n.length;i+=3){const size=Math.hypot(n[i],n[i+1],n[i+2])||1;for(let k=0;k<3;k++)n[i+k]/=size;}mesh.normals=n;return mesh;}
function geometry(name,points,indices,bone){const count=points.length;return normals({name,positions:points.flat(),indices,skinIndex:Array.from({length:count},()=>[bone,0,0,0]).flat(),skinWeight:Array.from({length:count},()=>[1,0,0,0]).flat()});}
function tube(name,points,radius,bone,segments=8){const vertices=[],indices=[];for(let j=0;j<points.length;j++){const axis=unit(sub(points[Math.min(points.length-1,j+1)],points[Math.max(0,j-1)])),right=unit(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[0,0,1])),up=unit(cross(axis,right));for(let k=0;k<segments;k++){const a=k*2*Math.PI/segments;vertices.push(add(points[j],add(mul(right,Math.cos(a)*radius),mul(up,Math.sin(a)*radius))));if(j){const p=(j-1)*segments+k,q=(j-1)*segments+(k+1)%segments,r=j*segments+(k+1)%segments,s=j*segments+k;indices.push(p,q,r,p,r,s);}}}return geometry(name,vertices,indices,bone);}
function ellipsoid(name,center,size,bone,rings=10,segments=24,fold=0){const p=[],idx=[];for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){const t=j*Math.PI/rings,a=k*2*Math.PI/segments,f=1+fold*Math.cos(a*8+t*2);p.push(add(center,[size[0]*Math.sin(t)*Math.cos(a)*f,size[1]*Math.cos(t),size[2]*Math.sin(t)*Math.sin(a)*f]));if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}return geometry(name,p,idx,bone);}
function material(id,role,rgb,roughness=.94){const index=gltf.materials.length;gltf.materials.push({name:`${id} ${role}`,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:role==='metal'?.45:0,roughnessFactor:roughness},extras:{characterRole:role,originalCharacter:id}});return index;}
const skins={};
for(const[kind,source]of Object.entries(masters)){const joints=source.bones.map(b=>{const i=gltf.nodes.length;gltf.nodes.push({name:`society_${kind}_${b.name}`,translation:b.head,rotation:[0,0,0,1]});gltf.scenes[0].nodes.push(i);return i;});skins[kind]=gltf.skins.length;gltf.skins.push({name:`society_${kind}_skin`,joints,inverseBindMatrices:accessor(source.bones.flatMap(b=>[1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1]),'MAT4')});}
const neutral=(mesh,source)=>retargetMesh(mesh,source,source,{height:source.height,width:1,depth:1});
function faceWarp(mesh,source,d){
 const head=source.bones.find(b=>b.name==='head').head,eyeY=head[1]+(d.source==='male'?.039:.052),age=(d.age-40)/45;
 for(let i=0;i<mesh.positions.length;i+=3){const[x,y,z]=mesh.positions.slice(i,i+3),blend=smooth((y-head[1]+.070)/.065);if(!blend)continue;const front=smooth((head[2]-.015-z)/.06),jaw=gauss(y,head[1]-.043,.031),cheek=gauss(y,eyeY-.022,.028);mesh.positions[i]+=x*((d.jaw-1)*jaw+(d.cheek-1)*cheek)*blend;mesh.positions[i+2]-=front*blend*(d.nose*gauss(x,0,.018)*gauss(y,eyeY-.037,.022)+d.chin*gauss(x,0,.035)*gauss(y,head[1]-.056,.022));mesh.positions[i+1]+=d.eyeLift*gauss(Math.abs(x),.03,.025)*gauss(y,eyeY,.025)*front;
  // Broad age fields deepen the nasolabial crease and soften cheek volume.
  // Millimetric relief is geometry in colour and depth, never a face decal.
  mesh.positions[i+2]+=front*blend*age*(.0025*gauss(Math.abs(x),.026,.010)*gauss(y,head[1]-.025,.035)-.0012*gauss(Math.abs(x),.045,.025)*gauss(y,eyeY-.03,.025));
  if(d.faceWidth)mesh.positions[i]*=1+(d.faceWidth-1)*blend;
  if(d.faceLength)mesh.positions[i+1]+=(y-head[1])*(d.faceLength-1)*blend;
 }return normals(mesh);
}
function skinMesh(source,d){const original=source.meshes.find(m=>/anatomical-skin|ordinary-face-neck-anatomical-hands/.test(m.name)),out=neutral(original,source);out.name='original resculpted face neck and anatomical hands';const visible=v=>{let w=0;for(let s=0;s<4;s++){const at=v*4+s,name=source.bones[out.skinIndex[at]].name;if(/^(head|jaw|neck|forearm|hand|thumb|index|middle|ring|little)/.test(name))w+=out.skinWeight[at];}return w;};out.indices=[];for(let i=0;i<original.indices.length;i+=3){const tri=original.indices.slice(i,i+3);if(tri.reduce((sum,v)=>sum+visible(v),0)/3>.4)out.indices.push(...tri);}return faceWarp(out,source,d);}
function hairMeshes(source,d){
 const cap=faceWarp(neutral(source.meshes.find(m=>/grey[ie]ng-hair|sculpted-hair/.test(m.name)),source),source,d),head=source.bones.find(b=>b.name==='head'),bone=source.bones.indexOf(head),center=add(head.head,[0,.068,-.003]),cloud=[];
 for(const v of new Set(cap.indices)){const p=cap.positions.slice(v*3,v*3+3);if(p[1]<center[1]-.008)continue;const delta=sub(p,center),radius=Math.hypot(...delta);cloud.push({direction:mul(delta,1/radius),radius});}
 const radiusFor=direction=>{let sum=0,r=0;for(const p of cloud){const w=Math.exp((dot(direction,p.direction)-1)*70);sum+=w;r+=p.radius*w;}return r/Math.max(sum,1e-12);};
 if(d.hair==='linen-cap-1843'){
  const band={...cap,positions:cap.positions.slice(),normals:cap.normals.slice(),skinIndex:cap.skinIndex.slice(),skinWeight:cap.skinWeight.slice(),indices:[],name:'clipped silver hair close beneath the linen cap'};
  for(let i=0;i<cap.indices.length;i+=3){const tri=cap.indices.slice(i,i+3),p=mul(tri.reduce((sum,v)=>add(sum,cap.positions.slice(v*3,v*3+3)),[0,0,0]),1/3);if(p[1]<head.head[1]+.075&&p[2]>head.head[2]-.015)band.indices.push(...tri);}
  cap.name='anatomical scalp beneath fitted day cap';cap.scalp=true;return[cap,band];
 }
 if(d.hair==='punk-curl-crest'){
  cap.name='anatomical shaved temples beneath raised punk crest';cap.scalp=true;
  const crest=ellipsoid('1983 close curled raised punk crest',[0,head.head[1]+.158,head.head[2]+.004],[.035,.097,.089],bone,18,48,.12);
  const ridges=[];for(const x of[-.019,0,.019]){const p=[];for(let i=0;i<=32;i++){const t=i/32,a=-Math.PI*.46+t*Math.PI*.92;p.push([x+.002*Math.sin(t*14*Math.PI),head.head[1]+.158+Math.cos(a)*.097,head.head[2]+.004+Math.sin(a)*.090]);}const ridge=tube('1983 coarse oxblood curled crest ridge',p,.0035,bone);ridge.role='accent';ridges.push(ridge);}return[cap,crest,...ridges];
 }
 if(d.hair==='receding-sweep'){
  const band={...cap,positions:cap.positions.slice(),normals:cap.normals.slice(),skinIndex:cap.skinIndex.slice(),skinWeight:cap.skinWeight.slice(),indices:[],name:'original receding horseshoe fitted scalp hair'};
  for(let i=0;i<cap.indices.length;i+=3){const tri=cap.indices.slice(i,i+3),p=mul(tri.reduce((sum,v)=>add(sum,cap.positions.slice(v*3,v*3+3)),[0,0,0]),1/3),front=smooth((head.head[2]-.01-p[2])/.06);if(p[1]<head.head[1]+.143-.095*front)band.indices.push(...tri);}
  for(let i=0;i<band.positions.length;i+=3){const p=band.positions.slice(i,i+3),out=mul(unit(sub(p,center)),.0025);for(let k=0;k<3;k++)band.positions[i+k]+=out[k];}
  const beard=skinMesh(source,d);beard.name='short square printmaker beard with open lips';const original=beard.indices;beard.indices=[];
  for(let i=0;i<original.length;i+=3){const tri=original.slice(i,i+3),p=mul(tri.reduce((sum,v)=>add(sum,beard.positions.slice(v*3,v*3+3)),[0,0,0]),1/3);if(p[1]>head.head[1]-.085&&p[1]<head.head[1]+.008&&p[2]<head.head[2]-.068&&!(Math.abs(p[0])<.031&&p[1]>head.head[1]-.046))beard.indices.push(...tri);}
  for(let i=0;i<beard.positions.length;i+=3){beard.positions[i]*=1.018;beard.positions[i+1]-=.008*smooth((head.head[1]-.025-beard.positions[i+1])/.05);beard.positions[i+2]-=.0025;}
  cap.name='anatomical bald crown beneath receding hair';cap.scalp=true;return[cap,normals(band),normals(beard)];
 }
 const top=Math.max(...cap.positions.filter((_,i)=>i%3===1)),segments=80,rows=22,points=[],idx=[],bob=d.hair==='silver-bob',curls=d.hair==='curl-crop',wave=d.hair==='centre-wave',braid=d.hair==='side-braid',twist=d.hair==='high-twist';
 points.push([center[0],top+.008,center[2]]);
 for(let row=1;row<=rows;row++)for(let k=0;k<segments;k++){
  const a=k*2*Math.PI/segments,front=smooth((Math.cos(a)+.02)/.82),line=head.head[1]+(bob?-.024:.015)+(bob?.111:.079)*front,upper=top-center[1],end=line>=center[1]?Math.acos(clamp((line-center[1])/upper,-1,1)):Math.PI/2+.9*(center[1]-line)/.08,t=end*row/rows,query=Math.min(Math.PI/2,t),direction=[Math.sin(a)*Math.sin(query),Math.cos(query),-Math.cos(a)*Math.sin(query)],r=radiusFor(direction),crown=Math.max(0,Math.cos(t)),part=gauss(Math.sin(a),0,.10),ridge=curls?.0035*Math.cos(a*23+query*19)*Math.cos(a*17-query*13):wave?.004*Math.cos(a*7-query*10)*crown:.0011*Math.cos(a*21+query*4),thick=(bob?.008:curls?.010:wave?.008:.004)+ridge+(wave?.004*crown*(1-part):0),p=add(center,mul(direction,r+thick));
  if(t>Math.PI/2){const u=(t-Math.PI/2)/(end-Math.PI/2);p[1]=center[1]+(line-center[1])*u;p[0]-=Math.sin(a)*.003*smooth(u);p[2]+=Math.cos(a)*.003*smooth(u);}
  p[0]+=(wave?.004:braid?.008:.002)*crown*crown;if(braid||twist)p[2]+=.0018*Math.cos(a*(braid?11:27)+query*(braid?5:9))*crown;points.push(p);const current=1+(row-1)*segments+k,next=1+(row-1)*segments+(k+1)%segments;if(row===1)idx.push(0,next,current);else{const previous=current-segments,pnext=next-segments;idx.push(previous,pnext,next,previous,next,current);}
 }
 // Inner return at the hairline closes the cloth-like surface and gives an
 // actual finite silhouette thickness without inflating the forehead.
 const boundary=points.length-segments;for(let k=0;k<segments;k++){const a=boundary+k,b=boundary+(k+1)%segments,p=points[a],inner=add(p,mul(unit(sub(center,p)),.0025));points.push(inner);const ia=points.length-1,ib=boundary+segments+(k+1)%segments;idx.push(a,b,ib,a,ib,ia);}
 const result=[cap,geometry(`original ${d.hair} fitted scalp and comb relief`,points,idx,bone)];cap.name='anatomical scalp under fitted original hair';cap.scalp=true;
 if(d.hair==='ivory-bun'){const back=Math.max(...cap.positions.filter((_,i)=>i%3===2));result.push(ellipsoid('folded low ivory knot',[0,head.head[1]+.045,back+.021],[.037,.027,.027],bone,12,32,.11));}
 if(twist){const back=Math.max(...cap.positions.filter((_,i)=>i%3===2));result.push(ellipsoid('high swept silver dark twisted knot',[0,head.head[1]+.125,back+.025],[.028,.044,.029],bone,16,36,.13));}
 if(braid){for(let strand=0;strand<3;strand++){const p=[];for(let i=0;i<=32;i++){const t=i/32,a=t*Math.PI*8+strand*Math.PI*2/3;p.push([-.078-.009*Math.sin(t*Math.PI)+.006*Math.cos(a),head.head[1]+.073-.265*t,.003-.09*t+.006*Math.sin(a)]);}result.push(tube('woven chestnut side braid strand '+strand,p,.0055,bone));}result.push(ellipsoid('bound side braid tip',[-.078,head.head[1]-.195,-.087],[.010,.014,.009],bone,8,16));}
 return result;
}
function garment(source,d){
 const shell=clean.options[0].meshes.find(m=>m.name==='option1-continuous-tailored-coat'),out=retargetMesh(shell,clean,source,{height:source.height,width:1,depth:1}),waist=source.height*.635,hem=d.dress==='frock'?.46:d.dress==='tails'?.55:.99,columns=48,torso=['pelvis','spine_lower','spine_mid','spine_upper','chest'].map(name=>({index:source.bones.findIndex(b=>b.name===name),y:source.bones.find(b=>b.name===name).head[1]}));
 for(let i=0;i<out.positions.length;i+=3){const y=out.positions[i+1];if(y>=waist)continue;const bottom=out.positions[(i/3%columns)*3+1],t=clamp((waist-y)/(waist-bottom));out.positions[i+1]=waist+(y-waist)*(waist-hem)/(waist-bottom);out.positions[i]*=1+(d.dress==='frock'?.10:d.dress==='tails'?-.07:-.05)*t;
  if(d.dress==='tails'){const front=smooth((-out.positions[i+2]-.015)/.10);out.positions[i+1]+=.30*front*t*t;}
  let lo=torso[0],hi=torso[0],u=0;for(let j=1;j<torso.length;j++)if(out.positions[i+1]>=torso[j-1].y){lo=torso[j-1];hi=torso[j];u=clamp((out.positions[i+1]-lo.y)/(hi.y-lo.y));}out.skinIndex.splice(i/3*4,4,lo.index,hi.index,0,0);out.skinWeight.splice(i/3*4,4,1-u,u,0,0);
 }
 out.name=`original ${d.dress} continuous tailored outer shell`;return normals(out);
}
function pleatedSkirt(source){const p=[],idx=[],bone=source.bones.findIndex(b=>b.name==='pelvis'),rows=16,segments=72;for(let j=0;j<=rows;j++)for(let k=0;k<=segments;k++){const t=j/rows,a=k*2*Math.PI/segments,pleat=1+.018*Math.sin(a*18)*smooth(t),width=(.188+.094*t)*pleat,depth=(.16+.075*t)*pleat;p.push([Math.sin(a)*width,1.015-.895*t,Math.cos(a)*depth+.01]);if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}return geometry('forest green continuous eighteen pleat skirt',p,idx,bone);}
function columnSkirt(source){const p=[],idx=[],bone=source.bones.findIndex(b=>b.name==='pelvis'),rows=12,segments=64;for(let j=0;j<=rows;j++)for(let k=0;k<=segments;k++){const t=j/rows,a=k*2*Math.PI/segments;p.push([Math.sin(a)*(.18+.018*t),1.015-.875*t,Math.cos(a)*(.155+.028*t)+.008]);if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}return geometry('registrar straight ankle length column skirt',p,idx,bone);}
function box(name,c,size,bone){const p=[];for(const z of[-1,1])for(const y of[-1,1])for(const x of[-1,1])p.push(add(c,[x*size[0]/2,y*size[1]/2,z*size[2]/2]));return geometry(name,p,[0,2,3,0,3,1,4,5,7,4,7,6,0,1,5,0,5,4,2,6,7,2,7,3,0,4,6,0,6,2,1,3,7,1,7,5],bone);}
function torsoWeights(mesh,source){const levels=['pelvis','spine_lower','spine_mid','spine_upper','chest'].map(name=>({index:source.bones.findIndex(b=>b.name===name),y:source.bones.find(b=>b.name===name).head[1]}));for(let v=0;v<mesh.positions.length/3;v++){const y=mesh.positions[v*3+1];let lo=levels[0],hi=levels[0],u=0;for(let j=1;j<levels.length;j++)if(y>=levels[j-1].y){lo=levels[j-1];hi=levels[j];u=clamp((y-lo.y)/(hi.y-lo.y));}mesh.skinIndex.splice(v*4,4,lo.index,hi.index,0,0);mesh.skinWeight.splice(v*4,4,1-u,u,0,0);}return mesh;}
function apron(source){const p=[],idx=[],rows=14,cols=24;for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){const t=j/rows,u=k/cols*2-1,y=1.43-.76*t,w=t<.48?.115+.10*smooth(t/.48):.215+.015*(t-.48)/.52;p.push([u*w,y,-.252+.060*u*u+.007*Math.sin(u*8+t*2)*t]);if(j&&k){const v=(j-1)*(cols+1)+k-1;idx.push(v,v+1,v+cols+2,v,v+cols+2,v+cols+1);}}return torsoWeights(geometry('printmaker continuous broad bib apron',p,idx,0),source);}
function shoulderCape(source){const p=[],idx=[],segments=64,rings=[{y:1.438,x:.078,z:.067},{y:1.365,x:.235,z:.14},{y:1.27,x:.31,z:.17}],bone=source.bones.findIndex(b=>b.name==='chest');for(let j=0;j<rings.length;j++)for(let k=0;k<=segments;k++){const a=.34+(Math.PI*2-.68)*k/segments,r=rings[j];p.push([Math.sin(a)*r.x,r.y+.008*Math.cos(a*10)*(j/2),-Math.cos(a)*r.z-.01]);if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}return geometry('critic structured short shoulder cape with open arm clearance',p,idx,bone);}
function details(source,d){const result=[],chest=source.bones.findIndex(b=>b.name==='chest'),head=source.bones.findIndex(b=>b.name==='head'),base=source.height/1.70,H=source.bones[head].head[1],front=source.bones[head].head[2]-.10;
 const addRole=(m,role)=>{m.role=role;result.push(m);};
 const anatomicalSkin=source.meshes.find(m=>/anatomical-skin|ordinary-face-neck/.test(m.name));
 const surfaceZ=(x,y)=>{const nearest=[];for(let i=0;i<anatomicalSkin.positions.length;i+=3){const px=anatomicalSkin.positions[i],py=anatomicalSkin.positions[i+1],z=anatomicalSkin.positions[i+2];if(z>source.bones[head].head[2]-.055)continue;const distance=(px-x)**2+(py-y)**2;if(nearest.length<4||distance<nearest.at(-1).distance){nearest.push({distance,z});nearest.sort((a,b)=>a.distance-b.distance);if(nearest.length>4)nearest.pop();}}let total=0,z=0;for(const p of nearest){const w=1/(p.distance+.00001);total+=w;z+=p.z*w;}return z/total-.0018;};
 if(!d.hollow)for(const side of[-1,1]){const eyebrow=[];for(let i=0;i<=12;i++){const u=i/12,x=side*(.016+.032*u),y=H+(d.source==='male'?.060:.072)+.003*Math.sin(u*Math.PI)+(side===1&&d.id==='emile'?.002:0),z=surfaceZ(x,y);eyebrow.push([x,y,z]);}addRole(faceWarp(tube('anatomical eyebrow',eyebrow,.0017,head),source,d),'hair');}
 if(!d.costume&&!['waistcoat','printmaker-apron','column-dress','cape-suit'].includes(d.dress)){
  // Broad pointed lapels are independent from colour blocking: their raised
  // edges, return faces and piping remain readable in the final dither pass.
  for(const side of[-1,1]){const p=[[side*.037,1.452*base,-.08],[side*.108,1.405*base,-.203],[side*.070,1.245*base,-.228],[side*.030,1.345*base,-.228]],mesh=geometry('raised notched satin lapel',p,[0,1,2,0,2,3,2,1,0,3,2,0],chest);addRole(mesh,'trim');addRole(tube('lapel hand stitched piping',p,.0023,chest),'metal');}
 }
 if(!d.costume&&!['waistcoat','printmaker-apron','column-dress','cape-suit'].includes(d.dress)){
  for(let i=0;i<3;i++){const y=(1.28-i*.115)*base;addRole(ellipsoid('original brass front button '+i,[.022,y,-.235],[.0055,.0055,.0022],chest,6,12),'metal');}
  for(const side of[-1,1])addRole(tube('hand finished pocket welt',[[side*.115,1.11*base,-.218],[side*.19,1.095*base,-.19]],.003,chest),'trim');
 }
 if(d.id==='celeste'){
  addRole(ellipsoid('garnet throat pin',[0,1.466,-.213],[.011,.014,.004],chest,8,16),'accent');
  for(const side of[-1,1])addRole(ellipsoid('small gold ear stud',[side*.073,H+.025,-.044],[.004,.005,.004],head,6,12),'metal');
 }else if(d.id==='emile'&&!d.costume){
  const p=[[-.018,1.550,-.102],[.02,1.550,-.104],[.031,1.470,-.158],[.004,1.426,-.177],[-.026,1.474,-.158]];addRole(geometry('oxblood folded silk cravat',p,[0,1,2,0,2,3,0,3,4,2,1,0,3,2,0,4,3,0],chest),'accent');
 }else if(d.id==='odette'){
  addRole(tube('green attendant key ribbon',[[.126,1.306,-.212],[.145,1.225,-.235],[.143,1.173,-.241]],.006,chest),'trim');
  const ring=[];for(let i=0;i<=24;i++){const a=i*2*Math.PI/24;ring.push([.143+Math.cos(a)*.012,1.161+Math.sin(a)*.012,-.242]);}addRole(tube('brass key ring',ring,.002,chest),'metal');addRole(tube('brass key stem',[[.143,1.150,-.242],[.143,1.115,-.242],[.154,1.115,-.242]],.0024,chest),'metal');
 }else if(d.id==='lucien')addRole(ellipsoid('copper lapel clasp',[.100,1.438,-.135],[.015,.007,.003],chest,6,12),'metal');
 if(d.dress==='column-dress'||d.dress==='cape-suit'){
  for(const y of[1.425,1.452]){const ring=[];for(let i=0;i<=48;i++){const a=i*Math.PI*2/48;ring.push([Math.sin(a)*.071,y,-Math.cos(a)*.066-.025]);}addRole(tube('raised narrow standing collar band',ring,.006,chest),'shirt');}
 }
 if(d.id==='agathe'){
  const pelvis=source.bones.findIndex(b=>b.name==='pelvis'),ring=[];for(let i=0;i<=48;i++){const a=i*Math.PI*2/48;ring.push([Math.sin(a)*.184,1.018,Math.cos(a)*.16]);}addRole(tube('registrar stitched belt',ring,.006,pelvis),'trim');
  addRole(tube('ledger leather belt suspension',[[-.177,1.018,-.063],[-.205,.945,-.104]],.005,pelvis),'accent');
  addRole(box('attendance ledger ivory page block',[-.205,.855,-.117],[.12,.18,.022],pelvis),'shirt');
  for(const z of[-.133,-.101])addRole(box('closed attendance ledger leather cover',[-.205,.855,z],[.13,.192,.006],pelvis),'accent');
  addRole(tube('attendance ledger bound spine',[[-.272,.953,-.117],[-.272,.757,-.117]],.009,pelvis),'accent');
 }else if(d.id==='noe'&&!d.costume){
  addRole(apron(source),'coat');
  for(const side of[-1,1])addRole(tube('printmaker heavy apron shoulder tie',[[side*.10,1.415,-.245],[side*.108,1.545,-.065],[side*.10,1.41,.10]],.012,chest),'trim');
  const p=[[-.13,1.105,-.255],[.13,1.105,-.255],[.125,.925,-.261],[-.125,.925,-.261]];addRole(torsoWeights(geometry('creased broad apron working pocket',p,[0,3,2,0,2,1],0),source),'trim');
  addRole(torsoWeights(geometry('small irregular ink stain in woven apron',[[.058,1.03,-.264],[.08,1.055,-.264],[.112,1.033,-.264],[.105,.993,-.264],[.07,.982,-.264]],[0,3,1,1,3,2,0,4,3],0),source),'accent');
 }else if(d.id==='sabine'&&!d.costume){
  const cape=shoulderCape(source);addRole(cape,'cape');addRole(tube('critic cape contrasting bound lower edge',Array.from({length:65},(_,i)=>cape.positions.slice((130+i)*3,(131+i)*3)),.0028,chest),'trim');addRole(ellipsoid('small silver critics throat clasp',[0,1.435,-.108],[.011,.009,.004],chest,8,16),'metal');
 }
 return result;
}
function primitives(meshes){const groups=new Map();for(const m of meshes){let out=groups.get(m.material);if(!out){out={positions:[],normals:[],indices:[],skinIndex:[],skinWeight:[]};groups.set(m.material,out);}const offset=out.positions.length/3;out.positions.push(...m.positions);out.normals.push(...m.normals);out.skinIndex.push(...m.skinIndex);out.skinWeight.push(...m.skinWeight);out.indices.push(...m.indices.map(v=>v+offset));}return [...groups].map(([material,m])=>{if(m.positions.length/3>65535)throw Error('Academic material vertex budget');return{mode:4,material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}};});}
const summary=[];
for(const[id,definition]of Object.entries({...DESIGNS,...POPULATION})){
 const d={...definition,id,population:Object.hasOwn(POPULATION,id)},source=masters[d.source],mat={skin:material(id,'skin',d.skin,.79),coat:material(id,'cloth',d.coat),trim:material(id,'tailored trim',d.trim),shirt:material(id,'shirt',d.shirt),trouser:material(id,'trousers',d.trouser),shoe:material(id,'leather',[.045,.038,.032],.72),hair:material(id,'hair',d.hairColor),eye:material(id,'eye white',d.skin.map(v=>.28+v*.28),.5),iris:material(id,'iris',d.iris,.5),lip:material(id,'lip',d.skin.map((v,i)=>v*(i===0?.77:.57)),.85),metal:material(id,'metal',id==='sabine'?[.58,.61,.64]:[.56,.40,.17],.55),accent:material(id,'accent',id==='celeste'?[.26,.025,.04]:id==='agathe'?[.15,.07,.025]:id==='noe'?[.045,.065,.025]:[.24,.045,.055],.72)},body=[];
 if(id==='sabine')mat.cape=material(id,'structured cape',[.035,.045,.065]);
 const addMesh=(m,role)=>{m.material=mat[role];body.push(m);};
 const skin=skinMesh(source,d),lip={...skin,positions:skin.positions.slice(),normals:skin.normals.slice(),skinIndex:skin.skinIndex.slice(),skinWeight:skin.skinWeight.slice(),indices:[],name:'subtle anatomical lip colour'},remaining=[],H=source.bones.find(b=>b.name==='head').head;
 for(let i=0;i<skin.indices.length;i+=3){const tri=skin.indices.slice(i,i+3),p=mul(tri.reduce((sum,v)=>add(sum,skin.positions.slice(v*3,v*3+3)),[0,0,0]),1/3);if(d.hollow==='unfinished-face'&&Math.abs(p[0])<.053&&p[1]>H[1]-.061&&p[1]<H[1]+.10&&p[2]<H[2]-.03)continue;if(Math.abs(p[0])<.025&&Math.abs(p[1]-(H[1]-.037))<.005&&p[2]<H[2]-.10)lip.indices.push(...tri);else remaining.push(...tri);}skin.indices=remaining;if(d.hollow!=='empty-coat'){addMesh(skin,'skin');if(lip.indices.length)addMesh(lip,'lip');}
 for(const m of source.meshes){let role=null;if(!d.hollow&&/eyes$/.test(m.name))role='eye';else if(!d.hollow&&/iris/.test(m.name))role='iris';else if(d.source==='female'&&d.hollow!=='empty-coat'&&/closed-leather-shoe|leather-shoe|shoe-sole|shoe-welt|lace|instapseam/.test(m.name))role='shoe';if(role){const out=neutral(m,source);addMesh(/eyes$|iris/.test(m.name)?faceWarp(out,source,d):out,role);}}
 if(d.hollow!=='empty-coat')for(const m of hairMeshes(source,d))addMesh(m,m.role||(m.scalp?'skin':'hair'));
 const helpers={geometry,tube,ellipsoid,normals,torsoWeights,retargetMesh,masters,clean,garment};
 const clothes=d.source==='female'?buildAcademicPeriodWoman(source,d,helpers):buildAcademicPeriodMan(source,d,helpers);
 if(!clothes.length)throw Error('Missing dated costume geometry for '+id);
 for(const m of clothes)addMesh(m,m.role);
 for(const m of details(source,d))addMesh(m,m.role);
 // Compact per-material geometry removes unused anatomical vertices from lip
 // and cropped skin primitives while preserving every original skin influence.
 for(const m of body){const used=[...new Set(m.indices)],lookup=new Map(used.map((v,i)=>[v,i]));for(const[key,width]of[['positions',3],['normals',3],['skinIndex',4],['skinWeight',4]])m[key]=used.flatMap(v=>m[key].slice(v*width,v*width+width));m.indices=m.indices.map(v=>lookup.get(v));}
 const mesh=gltf.meshes.length;gltf.meshes.push({name:d.mesh,primitives:primitives(body),extras:{identity:d.name,identityKind:d.population?'population':'named',originalCharacter:d.population?null:id,populationArchetype:d.population?id:null,hollow:d.hollow||null,height:d.height,sourceHeight:source.height,forward:[0,0,-1],description:d.description,costume:d.costume,source:'Retained CC0 MakeHuman anatomy with original facial sculpt, fitted hairstyle and tailored period clothing',parts:body.map(m=>({name:m.name,vertices:m.positions.length/3,triangles:m.indices.length/3,material:gltf.materials[m.material].name}))}});gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({name:d.mesh,mesh,skin:skins[d.source]});summary.push({id,name:d.name,mesh:d.mesh,population:d.population,hollow:d.hollow||null,costume:d.costume,source:d.source,height:d.height,vertices:body.reduce((n,m)=>n+m.positions.length/3,0),triangles:body.reduce((n,m)=>n+m.indices.length/3,0),joints:source.bones.length,parts:body.map(m=>m.name)});
}
const bin=Buffer.concat(chunks);gltf.buffers=[{byteLength:bin.length}];const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,32),binPad=Buffer.alloc((4-bin.length%4)%4),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+jsonPad.length+8+bin.length+binPad.length,8);jh.writeUInt32LE(json.length+jsonPad.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length+binPad.length);bh.writeUInt32LE(0x004e4942,4);const output=Buffer.concat([header,jh,json,jsonPad,bh,bin,binPad]);const parsed=parseCharacterAsset(output.buffer.slice(output.byteOffset,output.byteOffset+output.length));if(output.length>16*1024*1024)throw Error('Academic society pack exceeds its sixteen MiB budget');fs.writeFileSync(root+'public/assets/academic-society-characters.glb',output);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),sources=['tools/chunk_surfer/build-academic-society-characters.mjs','tools/chunk_surfer/characters/vigil-tailoring.mjs','tools/chunk_surfer/characters/academic-period-women.mjs','tools/chunk_surfer/characters/academic-period-men.mjs','src/data/academic-society-character-design.js','src/data/source-last-reception-resident-rigs.js','public/assets/recordist-characters/contractor.json','artifacts/bus-woman-production/anatomy.json','artifacts/bus-woman-design/anatomy/woman.json'];
fs.writeFileSync(root+'public/assets/academic-society-characters.stats.json',JSON.stringify({version:2,bytes:output.length,sha256:digest(output),nodes:parsed.nodes.length,source:'CC0 MakeHuman retained anatomical topology/weights; original society faces, hair and tailored clothing',license:'CC0 source assets: tools/chunk_surfer/character-sources/makehuman/LICENSE.ASSETS.md',sourceSha256:Object.fromEntries(sources.map(file=>[file,digest(fs.readFileSync(root+file))])),characters:summary.filter(d=>!d.population),population:summary.filter(d=>d.population)},null,2)+'\n');
console.log(JSON.stringify({bytes:output.length,sha256:digest(output),nodes:parsed.nodes.length,characters:summary.map(({parts,...s})=>s)}));
