// Build-time only. Original BodyParts3D OBJ members stay unchanged in their
// licensed source directory. Returned arrays are centred metric prone anatomy:
// +X anatomical right, +Y posterior, -Z cranial. No GPU or Blender dependency.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ROOT=path.resolve('tools/chunk_surfer/anatomy-sources');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bounds=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){min[i%3]=Math.min(min[i%3],p[i]);max[i%3]=Math.max(max[i%3],p[i]);}return{min,max,center:min.map((v,i)=>(v+max[i])/2),size:min.map((v,i)=>max[i]-v)};};
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);

function parseObj(text){
 const positions=[],indices=[];
 for(const line of text.split(/\r?\n/)){
  const fields=line.trim().split(/\s+/);
  if(fields[0]==='v')positions.push(...fields.slice(1,4).map(Number));
  if(fields[0]==='f'){
   const face=fields.slice(1).map(f=>{const n=Number(f.split('/')[0]);return n<0?positions.length/3+n:n-1;});
   for(let j=1;j<face.length-1;j++)indices.push(face[0],face[j],face[j+1]);
  }
 }
 if(!positions.length||!indices.length||positions.some(x=>!Number.isFinite(x))||indices.some(i=>i<0||i>=positions.length/3))throw Error('Invalid original OBJ');
 return{positions,indices};
}

function repairClosed(p,ids,{allowSourceContacts=false}={}){
 // Positional weld is only within one original part, never across lung lobes.
 const keyed=new Map(),vertices=[],remap=[];
 for(let i=0;i<p.length;i+=3){const key=p.slice(i,i+3).map(x=>Math.round(x*1e7)).join(',');if(!keyed.has(key)){keyed.set(key,vertices.length/3);vertices.push(...p.slice(i,i+3));}remap.push(keyed.get(key));}
 const triangles=[],faceSet=new Set();let removedDegenerate=0,removedDuplicateFaces=0;
 for(let i=0;i<ids.length;i+=3){const t=ids.slice(i,i+3).map(v=>remap[v]),a=vertices.slice(t[0]*3,t[0]*3+3),b=vertices.slice(t[1]*3,t[1]*3+3),c=vertices.slice(t[2]*3,t[2]*3+3);if(new Set(t).size<3||Math.hypot(...cross(sub(b,a),sub(c,a)))<1e-13){removedDegenerate++;continue;}const key=t.slice().sort((a,b)=>a-b).join(':');if(faceSet.has(key)){removedDuplicateFaces++;continue;}faceSet.add(key);triangles.push(...t);}
 const edges=new Map();for(let i=0;i<triangles.length;i+=3){const t=triangles.slice(i,i+3);for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],key=a<b?a+':'+b:b+':'+a;if(!edges.has(key))edges.set(key,[]);edges.get(key).push([a,b]);}}
 const boundary=[...edges.values()].filter(e=>e.length===1).map(e=>e[0]),nonmanifold=[...edges.values()].filter(e=>e.length>2).length;
 if(nonmanifold&&!allowSourceContacts)throw Error('Original part has nonmanifold edges: '+nonmanifold);
 // Keep original coincident-contact geometry intact when explicitly allowed;
 // do not invent caps around a contact that is not a simple surface boundary.
 const outgoing=new Map();if(!nonmanifold)for(const[a,b]of boundary){if(outgoing.has(a))throw Error('Branching original boundary');outgoing.set(a,b);}
 let caps=0;
 while(outgoing.size){const first=outgoing.keys().next().value,loop=[first];let a=first;do{const b=outgoing.get(a);if(b===undefined)throw Error('Original boundary is not an oriented loop');outgoing.delete(a);a=b;if(a!==first)loop.push(a);if(loop.length>256)throw Error('Original boundary too large for safe simple closure');}while(a!==first);
  const center=[0,0,0];for(const v of loop)for(let j=0;j<3;j++)center[j]+=vertices[v*3+j]/loop.length;
  const ci=vertices.length/3;vertices.push(...center);for(let j=0;j<loop.length;j++)triangles.push(loop[(j+1)%loop.length],loop[j],ci);caps++;
 }
 // Signed volume about the part centroid determines outward orientation.
 const centre=bounds(vertices).center;let signedVolume=0;
 for(let i=0;i<triangles.length;i+=3){const a=sub(vertices.slice(triangles[i]*3,triangles[i]*3+3),centre),b=sub(vertices.slice(triangles[i+1]*3,triangles[i+1]*3+3),centre),c=sub(vertices.slice(triangles[i+2]*3,triangles[i+2]*3+3),centre);signedVolume+=dot(a,cross(b,c))/6;}
 const reversed=signedVolume<0;if(reversed)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
 return{positions:vertices,indices:triangles,repair:{weldedVertices:p.length/3-vertices.length/3+caps,removedDegenerate,removedDuplicateFaces,boundaryEdgesBefore:boundary.length,nonmanifoldContactEdges:nonmanifold,capsAdded:caps,orientationReversed:reversed,volumeM3:Math.abs(signedVolume)}};
}

let loaded;
export function loadBodyPartsCardiacWitness(){
 if(loaded)return loaded;
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'bodyparts3d-manifest.json'),'utf8'));
 if(manifest.license!=='CC-BY-4.0')throw Error('Expected preserved official CC BY 4.0 provenance');
 const source=new Map(manifest.members.map(item=>{const bytes=fs.readFileSync(path.join(ROOT,item.localPath));if(hash(bytes)!==item.sha256)throw Error('Original source hash mismatch '+item.element);return[item.element,{...parseObj(bytes.toString()),source:item}];}));
 const group=id=>(manifest.groups[id]||[]).map(e=>source.get(e));
 const groupBounds=id=>bounds(group(id).flatMap(p=>p.positions));
 const meanCenter=parts=>{let total=0,sum=[0,0,0];for(const part of parts)for(let i=0;i<part.positions.length;i+=3){for(let c=0;c<3;c++)sum[c]+=part.positions[i+c];total++;}return sum.map(x=>x/total);};
 // Determine signed axes from named original landmarks rather than guessing
 // the dataset's handedness. Upper/lower lobes supply superior direction.
 const hasLungs=group('right-lung').length&&group('left-lung').length;
 const rightLeft=hasLungs?sub(groupBounds('right-lung').center,groupBounds('left-lung').center):sub(groupBounds('axis-right-rib').center,groupBounds('axis-left-rib').center);
 const parts=[...source.values()],upper=parts.filter(p=>p.source.officialNames.some(n=>['FMA7333','FMA7370'].includes(n.fma))),lower=parts.filter(p=>p.source.officialNames.some(n=>['FMA7337','FMA7371'].includes(n.fma)));
 const superior=upper.length&&lower.length?sub(meanCenter(upper),meanCenter(lower)):sub(groupBounds('axis-upper').center,groupBounds('axis-lower').center);
 const largest=v=>v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs)));
 const lateralAxis=largest(rightLeft),superiorAxis=largest(superior);
 if(lateralAxis===superiorAxis)throw Error('Anatomical axis landmarks are ambiguous');
 const posteriorAxis=[0,1,2].find(i=>i!==lateralAxis&&i!==superiorAxis);
 const posterior=sub(groupBounds('axis-vertebra').center,groupBounds('axis-sternum').center);
 const axes=[lateralAxis,posteriorAxis,superiorAxis],signs=[Math.sign(rightLeft[lateralAxis]),Math.sign(posterior[posteriorAxis]),-Math.sign(superior[superiorAxis])];
 if(Math.abs(rightLeft[lateralAxis])<20||Math.abs(posterior[posteriorAxis])<10||Math.abs(superior[superiorAxis])<10)throw Error('Insufficient anatomical landmark separation');
 const transform=p=>axes.map((a,i)=>p[a]*signs[i]*.001);
 const results={};
 for(const id of['left-lung','right-lung','heart']){
  if(!group(id).length)continue;
  const originals=group(id),metric=originals.flatMap(part=>{const p=[];for(let i=0;i<part.positions.length;i+=3)p.push(...transform(part.positions.slice(i,i+3)));return p;}),center=bounds(metric).center,positions=[],indices=[],labels=[];
  for(const part of originals){const p=[];for(let i=0;i<part.positions.length;i+=3)p.push(...sub(transform(part.positions.slice(i,i+3)),center));const repaired=repairClosed(p,part.indices),offset=positions.length/3,firstIndex=indices.length;positions.push(...repaired.positions);indices.push(...repaired.indices.map(i=>i+offset));labels.push({element:part.source.element,officialNames:part.source.officialNames,firstIndex,indexCount:repaired.indices.length,repair:repaired.repair,sourceSha256:part.source.sha256});}
  results[id]={positions,indices,parts:labels,bounds:bounds(positions),sourceAnatomicalCenterMetres:center,units:'metres; centered, +X right, +Y posterior, -Z cranial',license:'CC-BY-4.0',requiredCredit:manifest.requiredCredit};
 }
 loaded={organs:results,axisWitness:{sourceAxes:axes,signs,millimetresToMetres:.001,rightMinusLeft:rightLeft,upperMinusLower:superior,vertebraMinusSternum:posterior,method:hasLungs?'Signed permutation inferred from named original lung lobes and sternum/vertebra landmarks.':'Signed permutation inferred from named right/left seventh ribs, T1/T12 vertebrae and sternum/T6 landmarks.'},manifestSha256:hash(fs.readFileSync(path.join(ROOT,'bodyparts3d-manifest.json')))};
 return loaded;
}

// Fit by a single scale factor, preserving actual source proportions.
const fittedSourceCache=new Map();
export function fitThoraxOrganSource(id,{center=[0,0,0],maxRadii=[Infinity,Infinity,Infinity]}={}){
 const key=JSON.stringify([id,center,maxRadii]);if(fittedSourceCache.has(key))return fittedSourceCache.get(key);
 const source=loadThoraxOrganSources().organs[id];if(!source)throw Error('Unknown source organ '+id);
 const scale=Math.min(...source.bounds.size.map((size,i)=>2*maxRadii[i]/size));
 if(!Number.isFinite(scale)||scale<=0)throw Error('Need a finite positive organ size limit');
 const result={...source,positions:source.positions.map((v,i)=>v*scale+center[i%3]),scale,center:[...center],maxRadii:[...maxRadii],proportionsPreserved:true};fittedSourceCache.set(key,result);return result;
}

export function extractHuBMAPHeartOriginal(){
 const folder=path.join(ROOT,'hubmap'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),bytes=fs.readFileSync(path.join(folder,'VH_M_Heart.glb'));
 if(hash(bytes)!==manifest.sourceSha256)throw Error('Original HuBMAP heart hash mismatch');
 const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength)),binary=bytes.subarray(28+jsonLength);
 // The preserved v1.2 original has no node transforms. Refuse to silently
 // ignore them if a different upstream asset is substituted in the future.
 if(doc.nodes.some(n=>n.matrix||n.translation||n.rotation||n.scale))throw Error('HuBMAP original node transforms need explicit handling');
 const read=index=>{const a=doc.accessors[index],view=doc.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],width={5126:4,5125:4,5123:2,5121:1}[a.componentType],stride=view.byteStride||size*width,offset=(view.byteOffset||0)+(a.byteOffset||0),out=[];for(let i=0;i<a.count;i++)for(let c=0;c<size;c++){const k=offset+i*stride+c*width;out.push(a.componentType===5126?binary.readFloatLE(k):a.componentType===5125?binary.readUInt32LE(k):a.componentType===5123?binary.readUInt16LE(k):binary.readUInt8(k));}return out;};
 const wanted=['VH_M_left_cardiac_atrium','VH_M_right_cardiac_atrium','VH_M_heart_right_ventricle','VH_M_heart_left_ventricle'],parts=[];
 for(const name of wanted){const mesh=doc.meshes.find(m=>m.name===name);if(!mesh)throw Error('Missing named external chamber '+name);for(const primitive of mesh.primitives){const sourcePositions=read(primitive.attributes.POSITION),p=[];for(let i=0;i<sourcePositions.length;i+=3)p.push(-sourcePositions[i],-sourcePositions[i+2],-sourcePositions[i+1]);const closed=repairClosed(p,read(primitive.indices),{allowSourceContacts:true});parts.push({name,...closed,sourceMesh:name});}}
 const center=bounds(parts.flatMap(p=>p.positions)).center;
 for(const part of parts)part.positions=part.positions.map((v,i)=>v-center[i%3]);
 return{schemaVersion:1,source:'HuBMAP CCF v1.2 / Kristen Browne / NIH NIAID',sourceSha256:manifest.sourceSha256,license:'CC-BY-4.0',requiredCredit:manifest.credit,
  units:'metres; centered, +X anatomical right, +Y posterior, -Z cranial',
  axisConversion:{source:'Original glTF +Y superior, +X anatomical left, +Z anterior',output:['-sourceX','-sourceZ','-sourceY'],sourceGlobalCenter:center,unitScale:1,verifiedLandmarks:'Named left/right atria, anterior right ventricle and superior atrial bases; original accessor dimensions are in metres.'},
  selection:'Four named external cardiac chamber structures. Valves, papillary muscles and internal septum omitted.',parts};
}

let actualLoaded;
export function loadThoraxOrganSources(){
 if(actualLoaded)return actualLoaded;
 const file=path.join(ROOT,'hubmap','heart-external-lod.json');
 if(!fs.existsSync(file))throw Error('Actual HuBMAP heart LOD is not built; do not substitute incomplete BodyParts3D internal structures');
 const data=JSON.parse(fs.readFileSync(file,'utf8')),positions=[],indices=[],parts=[];
 for(const part of data.parts){const offset=positions.length/3,firstIndex=indices.length;positions.push(...part.positions);indices.push(...part.indices.map(i=>i+offset));parts.push({name:part.name,firstIndex,indexCount:part.indices.length,sourceMesh:part.sourceMesh,repair:part.repair});}
 const heart={positions,indices,parts,bounds:bounds(positions),units:data.units,license:data.license,requiredCredit:data.requiredCredit,sourceSha256:data.sourceSha256,source:'Actual HuBMAP CCF external cardiac chambers; conservative CPU LOD',lod:data.lod};
 actualLoaded={organs:{heart},axisWitness:data.axisConversion,manifestSha256:hash(fs.readFileSync(path.join(ROOT,'hubmap','manifest.json')))};
 return actualLoaded;
}

export function fitActualHeart(options={}){return fitThoraxOrganSource('heart',options);}

// Project an authored point from the organ centre onto its outermost radial
// surface crossing. Inner chamber walls must not hide coronary attachments.
// rather than carrying the old ellipsoid's arbitrary radial coordinates.
export function projectToActualHeartSurface(point,{center=[-2,8,-7],maxRadii=[3.45,3,5.5],offset=.035}={}){
 const mesh=fitActualHeart({center,maxRadii}),direction=sub(point,center),length=Math.hypot(...direction);if(length<1e-8)return point.slice();const ray=direction.map(v=>v/length);let nearest=-Infinity;
 for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.positions.slice(mesh.indices[i]*3,mesh.indices[i]*3+3),b=mesh.positions.slice(mesh.indices[i+1]*3,mesh.indices[i+1]*3+3),c=mesh.positions.slice(mesh.indices[i+2]*3,mesh.indices[i+2]*3+3),e1=sub(b,a),e2=sub(c,a),p=cross(ray,e2),det=dot(e1,p);if(Math.abs(det)<1e-10)continue;const inv=1/det,tvec=sub(center,a),u=dot(tvec,p)*inv;if(u<0||u>1)continue;const q=cross(tvec,e1),v=dot(ray,q)*inv;if(v<0||u+v>1)continue;const t=dot(e2,q)*inv;if(t>0&&t>nearest)nearest=t;}
 return Number.isFinite(nearest)?center.map((v,i)=>v+ray[i]*(nearest+offset)):point.slice();
}
