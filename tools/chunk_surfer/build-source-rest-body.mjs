import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset} from '../../src/render/character-asset.js';
import {canonicalAnatomy} from './characters/vigil-tailoring.mjs';
// Generates only the dedicated seated-body data, hand asset and credits.
// --out-dir DIR reproduces the same repository-relative output paths in DIR.
const repo=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--out-dir'))throw Error('Usage: node tools/chunk_surfer/build-source-rest-body.mjs [--out-dir DIR]');
const outputRoot=args.length?path.resolve(args[1]):repo,output=relative=>path.join(outputRoot,relative);
const write=(relative,data)=>{const destination=output(relative);fs.mkdirSync(path.dirname(destination),{recursive:true});const temporary=destination+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,data);fs.renameSync(temporary,destination);};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(repo+file)).digest('hex');
const donor=canonicalAnatomy(JSON.parse(fs.readFileSync(repo+'public/assets/recordist-characters/contractor.json')));
// Crop each anatomical hand from retained skin weights. The original triangle
// order, UVs, repaired three-phalange influences and single wrist boundary stay.
const skin=donor.meshes.find(mesh=>mesh.materialRole==='skin');
if(!skin)throw Error('Retained anatomical skin is unavailable');
const provenance={licence:'CC0-1.0',creator:'MakeHuman Community; project-authored contractor anatomical macro and finger repair',
  donor:{file:'public/assets/recordist-characters/contractor.json',sha256:hash('public/assets/recordist-characters/contractor.json')},repair:{file:'tools/chunk_surfer/characters/vigil-tailoring.mjs',sha256:hash('tools/chunk_surfer/characters/vigil-tailoring.mjs'),method:'canonicalAnatomy; retained anatomical knuckles, three phalanges per digit'},
  base:{file:'tools/chunk_surfer/character-sources/makehuman/base.obj',sha256:hash('tools/chunk_surfer/character-sources/makehuman/base.obj')},
  licenceFile:'tools/chunk_surfer/character-sources/makehuman/LICENSE.ASSETS.md',
  sourceManifest:'tools/chunk_surfer/character-sources/makehuman/sources.json',
  weightsManifest:'tools/chunk_surfer/character-sources/makehuman/weights-sources.json',
  units:'metres; canonical retained whole-body rest coordinates, Y-up, forward -Z; no wrist recentering or extra pose',
  selection:'All three triangle vertices have >0.05 summed influence from this hand and digit bones; retain largest vertex-connected component. Open wrist seam must be hidden/capped under cuff.'};
const handDonors=new Map();
for(const side of['L','R']){
  const handBones=new Set(donor.bones.flatMap((b,i)=>/^(hand|thumb|index|middle|ring|little)/.test(b.name)&&b.name.endsWith('_'+side)?[i]:[]));
  const influence=i=>[0,1,2,3].reduce((sum,k)=>sum+(handBones.has(skin.skinIndex[i*4+k])?skin.skinWeight[i*4+k]:0),0);
  const selected=[];
  for(let i=0;i<skin.indices.length;i+=3){const tri=skin.indices.slice(i,i+3);if(tri.every(v=>influence(v)>.05))selected.push(tri);}
  const adjacent=new Map();
  for(let i=0;i<selected.length;i++)for(const v of selected[i]){if(!adjacent.has(v))adjacent.set(v,[]);adjacent.get(v).push(i);}
  const seen=new Set(),components=[];
  for(let i=0;i<selected.length;i++)if(!seen.has(i)){
    const queue=[i],component=[];seen.add(i);
    for(let at=0;at<queue.length;at++){const t=queue[at];component.push(t);for(const v of selected[t])for(const next of adjacent.get(v))if(!seen.has(next)){seen.add(next);queue.push(next);}}
    components.push(component);
  }
  components.sort((a,b)=>b.length-a.length);
  const triangles=components[0].map(i=>selected[i]),vertices=[...new Set(triangles.flat())],remap=new Map(vertices.map((v,i)=>[v,i]));
  const positions=vertices.flatMap(v=>skin.positions.slice(v*3,v*3+3)),normals=vertices.flatMap(v=>skin.normals.slice(v*3,v*3+3)),
    uv=vertices.flatMap(v=>(skin.uv||skin.uvs).slice(v*2,v*2+2)),skinIndex=vertices.flatMap(v=>skin.skinIndex.slice(v*4,v*4+4)),skinWeight=vertices.flatMap(v=>skin.skinWeight.slice(v*4,v*4+4)),
    indices=triangles.flatMap(tri=>tri.map(v=>remap.get(v))),wrist=donor.bones.find(b=>b.name==='hand_'+side);
  const edges=new Map();for(const tri of triangles)for(let k=0;k<3;k++){const edge=[tri[k],tri[(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(edge,(edges.get(edge)||0)+1);}
  const boundaryEdges=[...edges].filter(([,n])=>n===1).map(([e])=>e.split(':').map(Number).map(v=>remap.get(v)));
  if([...positions,...normals,...uv,...skinWeight].some(v=>!Number.isFinite(v)))throw Error('Nonfinite cropped hand');
  for(let v=0;v<vertices.length;v++)if(Math.abs(skinWeight.slice(v*4,v*4+4).reduce((a,b)=>a+b,0)-1)>1e-5)throw Error('Invalid retained weights');
  const result={schema:1,id:'source-rest-donor-hand-'+side,side,provenance,bones:donor.bones,
    wrist:{head:[...wrist.head],tail:[...wrist.tail],handBoneIndex:donor.bones.indexOf(wrist)},
    mesh:{name:'retained-anatomical-hand-'+side,materialRole:'skin',positions,normals,uv,indices,skinIndex,skinWeight},
    sourceVertexIndices:vertices,boundaryEdges,statistics:{vertices:vertices.length,triangles:indices.length/3,
      selectedComponents:components.map(c=>c.length),retainedComponents:1,boundaryEdges:boundaryEdges.length,
      handBoneIndices:[...handBones],bones:donor.bones.length,sourceNormalsPreserved:true,sourceUvsPreserved:true}};
  handDonors.set(side,result);
}

const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];
const rot=(q,p)=>{const u=q.slice(0,3),v=cross(u,p);return add(p,add(mul(v,2*q[3]),mul(cross(u,v),2)));};
const between=(a,b)=>{a=unit(a);b=unit(b);const d=dot(a,b);if(d<-.9999)return[1,0,0,0];const q=[...cross(a,b),1+d],n=Math.hypot(...q);return q.map(v=>v/n);};
const round=a=>a.map(v=>Math.round(v*1e6)/1e6);
function normals(p,i){const n=new Array(p.length).fill(0);for(let k=0;k<i.length;k+=3){const [a,b,c]=i.slice(k,k+3),v=cross(sub(p.slice(b*3,b*3+3),p.slice(a*3,a*3+3)),sub(p.slice(c*3,c*3+3),p.slice(a*3,a*3+3)));for(const id of[a,b,c])for(let q=0;q<3;q++)n[id*3+q]+=v[q];}for(let k=0;k<n.length;k+=3)n.splice(k,3,...unit(n.slice(k,k+3)));return round(n);}
function bounds(p){return[0,1,2].map(a=>[Math.min(...p.filter((_,k)=>k%3===a)),Math.max(...p.filter((_,k)=>k%3===a))]);}
function crop(mesh,accept){const indices=[],map=new Map(),p=[],uv=[],si=[],sw=[];for(let k=0;k<mesh.indices.length;k+=3){const tri=mesh.indices.slice(k,k+3);if(!tri.every(v=>accept(v)))continue;for(const v of tri){if(!map.has(v)){map.set(v,map.size);p.push(...mesh.positions.slice(v*3,v*3+3));uv.push(...mesh.uv.slice(v*2,v*2+2));si.push(...mesh.skinIndex.slice(v*4,v*4+4));sw.push(...mesh.skinWeight.slice(v*4,v*4+4));}indices.push(map.get(v));}}return{positions:p,uv,indices,skinIndex:si,skinWeight:sw};}
const byName=new Map(donor.bones.map((b,i)=>[b.name,{...b,index:i}]));
const targets=new Map();for(const b of donor.bones)targets.set(b.name,{head:sub(b.head,[0,.961135,-.006908]),tail:sub(b.tail,[0,.961135,-.006908])});
for(const s of['L','R']){const sign=s==='L'?-1:1,x=sign*.145;targets.set('thigh_'+s,{head:[sign*.115,-.015,0],tail:[x,-.080,-.470]});targets.set('shin_'+s,{head:[x,-.080,-.470],tail:[sign*.165,-.582,-.500]});targets.set('foot_'+s,{head:[sign*.165,-.582,-.500],tail:[sign*.165,-.645,-.645]});targets.set('toe_'+s,{head:[sign*.165,-.645,-.645],tail:[sign*.165,-.645,-.735]});}
const maps=donor.bones.map(b=>{const t=targets.get(b.name),a=sub(b.tail,b.head),d=sub(t.tail,t.head);return{from:b.head,to:t.head,q:between(a,d),axis:unit(a),scale:Math.hypot(...d)/Math.hypot(...a)};});
function seated(mesh){const p=[];for(let v=0;v<mesh.positions.length/3;v++){const source=mesh.positions.slice(v*3,v*3+3);let at=[0,0,0];for(let j=0;j<4;j++){const w=mesh.skinWeight[v*4+j];if(!w)continue;const m=maps[mesh.skinIndex[v*4+j]],r=sub(source,m.from),along=dot(r,m.axis),scaled=add(r,mul(m.axis,along*(m.scale-1)));at=add(at,mul(add(m.to,rot(m.q,scaled)),w));}p.push(...at);}return round(p);}
function record(mesh,p,material='case-lining',base=[.11,.125,.12,1]){return{p:round(p),i:mesh.indices,n:normals(p,mesh.indices),uv:round(mesh.uv),material,base,roughness:.96,bounds:bounds(p),triangles:mesh.indices.length/3,bodySource:'retained MakeHuman/contractor; CC0-1.0'};}
const library={};
const trousers=donor.meshes.find(m=>m.name==='contractor-tailored-trousers');
library['rest-body-lap']=record(trousers,seated(trousers));
const waistcoat=donor.meshes.find(m=>m.name==='contractor-tailored-waistcoat');const jacket=crop(waistcoat,v=>waistcoat.positions[v*3+1]<1.455);library['rest-body-jacket']=record(jacket,seated(jacket),'case-lining',[.070,.085,.081,1]);
for(const s of['L','R']){const sources=donor.meshes.filter(m=>['contractor-leather-shoe-'+s,'contractor-shoe-sole-'+s].includes(m.name));const merged={positions:[],indices:[],uv:[]};for(const m of sources){const at=merged.positions.length/3;merged.positions.push(...seated(m));merged.indices.push(...m.indices.map(v=>v+at));merged.uv.push(...m.uv);}library['rest-body-shoe-'+(s==='L'?'left':'right')]=record(merged,merged.positions,'case-lining',[.055,.044,.035,1]);}
// Reuse the existing authored driving coat sleeves (complete elbow-to-wrist),
// not the contractor's short-sleeve shirt. Normalize only their long axis.
const driveBytes=fs.readFileSync(repo+'public/assets/source-drive/geometry/wheel-hands.glb'),
 drive=parseCharacterAsset(driveBytes.buffer.slice(driveBytes.byteOffset,driveBytes.byteOffset+driveBytes.byteLength));
for(const [part,name]of [['upper-sleeve','drive_right_upper_sleeve'],['fore-sleeve','drive_right_sleeve']]){
 const primitive=drive.entries.find(e=>e.name===name).primitives[0],p=Array.from(primitive.positions),ys=p.filter((_,k)=>k%3===1),low=Math.min(...ys),high=Math.max(...ys);
 for(let v=0;v<p.length;v+=3)p[v+1]=(p[v+1]-low)/(high-low);
 const entry=record({indices:Array.from(primitive.indices),uv:Array.from(primitive.uv)},p,'case-lining',[.102,.122,.115,1]);
 entry.bodySource='Existing project-authored Source driving coat sleeve; unit longitudinal reframe';
 library['rest-body-'+part]=entry;
}
// A tailored folded cuff. Longitudinal coordinates remain normalized to the forearm transform.
{const p=[],i=[],uv=[],rings=[[.895,.035,.029],[.915,.038,.031],[.985,.035,.029],[1,.033,.027]];const sides=20;for(let r=0;r<rings.length;r++)for(let s=0;s<sides;s++){const a=s/sides*Math.PI*2,[y,rx,rz]=rings[r];p.push(Math.cos(a)*rx,y,Math.sin(a)*rz);uv.push(s/sides,r/(rings.length-1));}for(let r=0;r<rings.length-1;r++)for(let s=0;s<sides;s++){const a=r*sides+s,b=r*sides+(s+1)%sides,c=a+sides,d=b+sides;i.push(a,c,b,b,c,d);}library['rest-body-cuff']=record({indices:i,uv},p,'linen',[.31,.33,.285,1]);}
const bodyData='// Generated from retained CC0 MakeHuman/contractor topology; build recipe and provenance accompany the hand asset.\nexport const sourceRestBodyData = '+JSON.stringify(library)+';\n\n';
write('src/render/source-rest-body-data.js',bodyData);
const handInfo=[];
const gltf={asset:{version:'2.0',generator:'Chunk Surfer seated hands; retained CC0 MakeHuman topology'},scene:0,scenes:[{nodes:[0,1,2]}],nodes:[{name:'rest_hand_root'},{name:'rest_hand_left',mesh:0,skin:0},{name:'rest_hand_right',mesh:1,skin:0}],skins:[{joints:[0]}],meshes:[],materials:[{name:'ordinary seated hand skin',pbrMetallicRoughness:{baseColorFactor:[.47,.32,.245,1],roughnessFactor:.86,metallicFactor:0},doubleSided:false,extras:{role:'skin'}}],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
const chunks=[];let offset=0;function accessor(values,type,component=5126){const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=component===5126?Float32Array:component===5123?Uint16Array:Uint8Array,arr=new Ctor(values);const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const view=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:arr.byteLength});chunks.push(Buffer.from(arr.buffer));offset+=arr.byteLength;const a={bufferView:view,componentType:component,count:values.length/width,type};if(type==='VEC3'&&component===5126){a.min=bounds(values).map(x=>x[0]);a.max=bounds(values).map(x=>x[1]);}gltf.accessors.push(a);return gltf.accessors.length-1;}
for(const side of['L','R']){const d=handDonors.get(side),bmap=new Map(d.bones.map((b,i)=>[b.name,{...b,index:i}])),hand=bmap.get('hand_'+side),mid=bmap.get('middle_'+side),idx=bmap.get('index_'+side),little=bmap.get('little_'+side);const forward=unit(sub(mid.head,hand.head)),rawX=side==='R'?sub(little.head,idx.head):sub(idx.head,little.head),x=unit(sub(rawX,mul(forward,dot(rawX,forward)))),z=mul(forward,-1),y=unit(cross(z,x)),basis={x,y,z};const loc=p=>{const v=sub(p,hand.head);return[dot(v,x),dot(v,y),dot(v,z)];};const bones=d.bones.map(b=>({...b,head:loc(b.head),tail:loc(b.tail)}));
function pose(kind){const transforms=new Map();function solve(name){if(transforms.has(name))return transforms.get(name);const b=bones.find(b=>b.name===name);if(!b)return{q:[0,0,0,1],head:[0,0,0]};const isDigit=/^(thumb|index|middle|ring|little)/.test(name)&&name.endsWith('_'+side),par=isDigit?solve(b.parent):{q:[0,0,0,1],head:[0,0,0]},parentBone=bones.find(q=>q.name===b.parent);let head=isDigit?add(par.head,rot(par.q,sub(b.head,parentBone.head))):b.head;let angle=0;if(isDigit){const segment=name.includes('_tip_')?2:name.includes('_mid_')?1:0;angle=(kind==='brace'?[.29,.47,.26]:kind==='slack'?[.015,.11,.06]:[.065,.15,.09])[segment];if(name.startsWith('thumb'))angle*=.4;angle*=-1;}const localQ=[Math.sin(angle/2),0,0,Math.cos(angle/2)],q=qmul(par.q,localQ),out={q,head,rest:b.head};transforms.set(name,out);return out;}
const p=[];for(let v=0;v<d.mesh.positions.length/3;v++){const source=loc(d.mesh.positions.slice(v*3,v*3+3));let result=[0,0,0];for(let k=0;k<4;k++){const w=d.mesh.skinWeight[v*4+k];if(!w)continue;const bone=bones[d.mesh.skinIndex[v*4+k]],t=solve(bone.name);result=add(result,mul(add(t.head,rot(t.q,sub(source,t.rest))),w));}p.push(...result);}return round(p);}
const p=pose('relaxed'),n=normals(p,d.mesh.indices),targets=['brace','slack'].map(kind=>{const pp=pose(kind),nn=normals(pp,d.mesh.indices);return{POSITION:accessor(pp.map((v,k)=>v-p[k]),'VEC3'),NORMAL:accessor(nn.map((v,k)=>v-n[k]),'VEC3')};});const count=p.length/3,weights=Array.from({length:count*4},(_,k)=>k%4===0?1:0),joints=new Array(count*4).fill(0);gltf.meshes.push({name:side==='L'?'rest_hand_left':'rest_hand_right',extras:{targetNames:['brace','slack'],source:'MakeHuman CC0; repaired anatomical three-phalange chains',wristOrigin:[0,0,0],forward:'-Z',dorsum:'+Y'},weights:[0,0],primitives:[{attributes:{POSITION:accessor(p,'VEC3'),NORMAL:accessor(n,'VEC3'),TEXCOORD_0:accessor(d.mesh.uv,'VEC2'),JOINTS_0:accessor(joints,'VEC4',5121),WEIGHTS_0:accessor(weights,'VEC4')},indices:accessor(d.mesh.indices,'SCALAR',5123),material:0,targets}]});handInfo.push({side,vertices:count,triangles:d.mesh.indices.length/3,bounds:bounds(p),basis,provenance:d.provenance});}
const finalPad=(4-offset%4)%4;if(finalPad){chunks.push(Buffer.alloc(finalPad));offset+=finalPad;}gltf.buffers[0].byteLength=offset;let json=Buffer.from(JSON.stringify(gltf)),jsonPad=(4-json.length%4)%4;json=Buffer.concat([json,Buffer.alloc(jsonPad,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const glb=Buffer.concat([header,jh,json,bh,bin]);write('public/assets/source-rest/seated-hands.glb',glb);const summary={licence:'CC0-1.0',units:'metres',axes:'X right, Y up, Z back; hand wrist origin and fingers -Z',assetSha256:crypto.createHash('sha256').update(glb).digest('hex'),hands:handInfo,cloth:Object.fromEntries(Object.entries(library).map(([k,m])=>[k,{vertices:m.p.length/3,triangles:m.i.length/3,bounds:m.bounds}]))};const inputs=[
 'public/assets/recordist-characters/contractor.json',
 'public/assets/source-drive/geometry/wheel-hands.glb',
 'tools/chunk_surfer/characters/vigil-tailoring.mjs',
 'tools/chunk_surfer/character-sources/makehuman/base.obj',
 'tools/chunk_surfer/character-sources/makehuman/default.mhskel',
 ...['young','old'].flatMap(age=>['caucasian-male-'+age+'.target.gz','universal-male-'+age+'-averagemuscle-averageweight.target.gz'].map(name=>'tools/chunk_surfer/character-sources/makehuman/'+name)),
 'src/render/character-asset.js',
];
const credits={schema:1,asset:'public/assets/source-rest/seated-hands.glb',licence:'CC0-1.0',
 title:'Grounded seated hands',creator:'MakeHuman Community; project-authored contractor anatomical macro, retained finger repair and seated morphs',
 sourceLicenseFile:provenance.licenceFile,sourceManifest:provenance.sourceManifest,weightsManifest:provenance.weightsManifest,
 modifications:['Crop original retained anatomical topology to a single connected hand with a cuff-hidden wrist boundary.','Bake the repaired real three-phalange chains into relaxed, bracing and slack morph poses.','Preserve source UVs, recompute deformed normals, and place wrist-local in metres without reflection.'],
 build:{script:'tools/chunk_surfer/build-source-rest-body.mjs',scriptSha256:hash('tools/chunk_surfer/build-source-rest-body.mjs'),
 command:'node tools/chunk_surfer/build-source-rest-body.mjs',inputs:inputs.map(file=>({file,sha256:hash(file)})),
 outputs:[{file:'public/assets/source-rest/seated-hands.glb',sha256:summary.assetSha256,bytes:glb.length},
 {file:'src/render/source-rest-body-data.js',sha256:crypto.createHash('sha256').update(bodyData).digest('hex'),bytes:Buffer.byteLength(bodyData)}]},
 handGeometry:{...summary,cloth:undefined},
 accompanyingCloth:{source:'Retained MakeHuman/contractor trousers, waistcoat and shoes; existing project-authored Source driving coat sleeves; project-authored folded cuff.',
 licenceNote:'The CC0 credit above identifies the retained human anatomy. Existing project-authored sleeve and cuff construction retains the project licence.',
 meshes:summary.cloth},
};
write('public/assets/source-rest/seated-hands.credits.json',JSON.stringify(credits,null,2)+'\n');
console.log(JSON.stringify({outputs:credits.build.outputs,hands:handInfo.map(({provenance,basis,...rest})=>rest),clothTriangles:Object.values(summary.cloth).reduce((n,m)=>n+m.triangles,0)},null,2));
