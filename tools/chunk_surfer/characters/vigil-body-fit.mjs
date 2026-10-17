// Fit retained CC0 MakeHuman clothes against the actual anatomical macros.
// These are the same source positions and proxy coefficients used by the
// Blender masters, before their hidden torso surfaces were omitted for export.
import fs from 'node:fs';
import zlib from 'node:zlib';

const root=new URL('../../../',import.meta.url);
const makehuman=new URL('../character-sources/makehuman/',import.meta.url);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const length=v=>Math.hypot(...v),unit=v=>mul(v,1/(length(v)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const cache=new Map();
const readJSON=url=>JSON.parse(fs.readFileSync(url,'utf8'));

function readOBJ(url){
  const vertices=[],uv=[],faces=[],groups=new Map();let group='default';
  for(const row of fs.readFileSync(url,'utf8').split(/\r?\n/)){
    const fields=row.trim().split(/\s+/);if(fields[0]==='v')vertices.push(fields.slice(1,4).map(Number));
    else if(fields[0]==='vt')uv.push(fields.slice(1,3).map(Number));
    else if(fields[0]==='g')group=fields[1];
    else if(fields[0]==='f'){
      const resolve=(text,count)=>{const n=Number(text);return n<0?count+n:n-1;};
      const corners=fields.slice(1).map(field=>{const parts=field.split('/');return{vertex:resolve(parts[0],vertices.length),uv:parts[1]?resolve(parts[1],uv.length):null};});
      faces.push(corners);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(corners.map(c=>c.vertex));
    }
  }
  return{vertices,uv,faces,groups};
}
function compactName(name,lookup){
  if(name==='root'||name==='spine05'||name.startsWith('pelvis.'))return'pelvis';
  if(name.startsWith('spine'))return{spine04:'spine_lower',spine03:'spine_mid',spine02:'spine_upper',spine01:'chest'}[name];
  if(name.startsWith('neck'))return'neck';
  if(name==='jaw'||name.startsWith('tongue')||['oris01','special04'].includes(name)||name.startsWith('oris07.'))return'jaw';
  if(name.startsWith('breast.'))return'chest';
  const side=name.endsWith('.L')?'R':'L',stem=name.split('.')[0];
  for(const[prefix,target]of[['clavicle','clavicle'],['shoulder','clavicle'],['upperarm','upperarm'],['lowerarm','forearm'],['upperleg','thigh'],['lowerleg','shin'],['wrist','hand'],['metacarpal','hand'],['foot','foot'],['toe','toe']])if(stem.startsWith(prefix))return target+'_'+side;
  if(stem.startsWith('finger')){
    const digit=['thumb','index','middle','ring','little'][Number(stem[6])-1],segment=Number(stem.split('-')[1]),name=digit+(segment===1?'':segment===2?'_mid':'_tip')+'_'+side;
    return lookup.has(name)?name:digit+'_'+side;
  }
  return'head';
}
function compactWeights(weights){
  const pairs=weights.map((weight,joint)=>[joint,Math.max(0,weight)]).filter(pair=>pair[1]>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=pairs.reduce((n,pair)=>n+pair[1],0);
  if(sum<=0)throw Error('Fitted anatomical vertex lost its skin weights');
  for(const pair of pairs)pair[1]/=sum;while(pairs.length<4)pairs.push([0,0]);
  return{indices:pairs.map(pair=>pair[0]),weights:pairs.map(pair=>pair[1])};
}
function triangulate(faces){return faces.flatMap(face=>{const out=[];for(let i=1;i<face.length-1;i++)out.push(face[0],face[i],face[i+1]);return out;});}
function normals(positions,indices){
  const result=new Array(positions.length).fill(0);
  for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),points=ids.map(v=>positions.slice(v*3,v*3+3)),normal=cross(sub(points[1],points[0]),sub(points[2],points[0]));for(const vertex of ids)for(let axis=0;axis<3;axis++)result[vertex*3+axis]+=normal[axis];}
  for(let i=0;i<result.length;i+=3){const n=unit(result.slice(i,i+3));for(let axis=0;axis<3;axis++)result[i+axis]=n[axis];}
  return result;
}
function anatomy(source){
  const female=/woman/.test(source.id),key=(female?'female':'male')+':'+source.bones.map(b=>b.name).join(',');if(cache.has(key))return cache.get(key);
  const base=readOBJ(new URL('base.obj',makehuman)),raw=base.vertices.map(p=>p.slice()),ages=female?[['young',.47],['old',.53]]:[['young',.72],['old',.28]],height=female?1.70:1.78;
  for(const[age,weight]of ages)for(const prefix of female?['african-female-','universal-female-']:['caucasian-male-','universal-male-']){
    const name=prefix+age+(prefix.startsWith('universal')?'-averagemuscle-averageweight':'')+'.target.gz';
    const file=female?new URL('artifacts/bus-woman-design/anatomy/sources/'+name,root):new URL(name,makehuman);
    for(const row of zlib.gunzipSync(fs.readFileSync(file)).toString().split(/\r?\n/)){
      const fields=row.trim().split(/\s+/);if(fields.length!==4||!/^\d+$/.test(fields[0]))continue;
      for(let axis=0;axis<3;axis++)raw[Number(fields[0])][axis]+=Number(fields[axis+1])*weight;
    }
  }
  const bodyFaces=base.groups.get('body');if(!bodyFaces?.length)throw Error('Retained MakeHuman body faces are missing');
  const bodyIds=[...new Set(bodyFaces.flat())],ys=bodyIds.map(i=>raw[i][1]),bottom=Math.min(...ys),scale=height/(Math.max(...ys)-bottom),game=raw.map(p=>[p[0]*scale,(p[1]-bottom)*scale,-p[2]*scale]);
  const lookup=new Map(source.bones.map((b,i)=>[b.name,i])),weights=Array.from({length:raw.length},()=>new Array(source.bones.length).fill(0));
  for(const[name,rows]of Object.entries(readJSON(new URL('default_weights.mhw',makehuman)).weights)){
    const joint=lookup.get(compactName(name,lookup));if(joint==null)throw Error('Missing fitted garment bone '+name);
    for(const[index,weight]of rows)weights[index][joint]+=weight;
  }
  for(const row of weights){const total=row.reduce((a,b)=>a+b,0);if(!total)row[lookup.get('pelvis')]=1;else for(let i=0;i<row.length;i++)row[i]/=total;}
  const skeleton=readJSON(new URL('default.mhskel',makehuman)),groupPoint=name=>{
    const faces=base.groups.get('joint-'+name);if(!faces?.length)throw Error('Missing anatomical source marker '+name);
    const ids=[...new Set(faces.flat())];return mul(ids.reduce((sum,i)=>add(sum,game[i]),[0,0,0]),1/ids.length);
  },skeletonPoint=name=>mul(skeleton.joints[name].reduce((sum,i)=>add(sum,game[i]),[0,0,0]),1/skeleton.joints[name].length),rest=new Map();
  for(const[name,a,b]of[['pelvis','pelvis','spine-4'],['spine_lower','spine-4','spine-3'],['spine_mid','spine-3','spine-2'],['spine_upper','spine-2','spine-1'],['chest','spine-1','neck'],['neck','neck','head'],['head','head','head-2']])rest.set(name,{head:groupPoint(a),tail:groupPoint(b)});
  const jaw=skeleton.bones.jaw;rest.set('jaw',{head:skeletonPoint(jaw.head),tail:skeletonPoint(jaw.tail)});
  for(const side of['L','R']){
    const mh=side==='L'?'r':'l';
    for(const[name,a,b]of[['clavicle','spine-1',mh+'-shoulder'],['upperarm',mh+'-shoulder',mh+'-elbow'],['forearm',mh+'-elbow',mh+'-hand'],['hand',mh+'-hand',mh+'-hand-3'],['thigh',mh+'-upper-leg',mh+'-knee'],['shin',mh+'-knee',mh+'-ankle'],['foot',mh+'-ankle',mh+'-foot-1'],['toe',mh+'-foot-1',mh+'-foot-2']])rest.set(name+'_'+side,{head:groupPoint(a),tail:groupPoint(b)});
    for(const[digitIndex,digit]of['thumb','index','middle','ring','little'].entries()){
      const chains=[1,2,3].map(segment=>skeleton.bones[`finger${digitIndex+1}-${segment}.${side==='L'?'R':'L'}`]);
      if(lookup.has(digit+'_mid_'+side))for(let i=0;i<3;i++)rest.set(digit+['','_mid','_tip'][i]+'_'+side,{head:skeletonPoint(chains[i].head),tail:skeletonPoint(chains[i].tail)});
      else rest.set(digit+'_'+side,{head:groupPoint(mh+`-finger-${digitIndex+1}-1`),tail:groupPoint(mh+`-finger-${digitIndex+1}-4`)});
    }
  }
  let restError=0;
  for(const bone of source.bones){const actual=rest.get(bone.name);if(!actual)throw Error('Unverifiable anatomical source bone '+bone.name);restError=Math.max(restError,length(sub(actual.head,bone.head)),length(sub(actual.tail,bone.tail)));}
  if(restError>1e-4)throw Error(`Retained full body differs from ${source.id} rest skeleton by ${restError} metres`);
  const result={raw,game,weights,bodyFaces,bodyIds,scale,height,restError};cache.set(key,result);return result;
}
function proportions(source,design={}){const scale=[design.width??1,(design.height??source.height)/source.height,design.depth??1];return{scale,point:p=>p.map((v,i)=>v*scale[i]),bones:source.bones.map(b=>({...b,head:b.head.map((v,i)=>v*scale[i]),tail:b.tail.map((v,i)=>v*scale[i])}))};}

/** Full hidden anatomy in the same scaled rest coordinates as the cast rig.
 * positions retains the base OBJ vertex order; faces/indices contain only its
 * actual body surface. No facial/limb helper-marker polygons are exported. */
export function retainedBody(source,design={}){
  const data=anatomy(source),{point,bones}=proportions(source,design),positions=data.game.flatMap(point),faces=data.bodyFaces.map(face=>[...face].reverse()),indices=triangulate(faces),skinIndex=[],skinWeight=[];
  for(const weights of data.weights){const row=compactWeights(weights);skinIndex.push(...row.indices);skinWeight.push(...row.weights);}
  return{name:source.id+'-full-retained-anatomy',positions,normals:normals(positions,indices),indices,faces,bodyFaces:faces,skinIndex,skinWeight,bones,bodyVertexIndices:[...data.bodyIds],restError:data.restError,height:design.height??source.height};
}

/** Evaluate the retained .mhclo barycentric fit against the actual macro body,
 * exactly as the production Python proxy() does. The full suit is returned;
 * choose/crop upper garment faces before extending a coat skirt. */
export function fittedProxyGarment(source,design={},asset='male_casualsuit01'){
  if(!/^[a-zA-Z0-9_-]+$/.test(asset))throw Error('Invalid retained garment asset');
  const data=anatomy(source),{point,bones}=proportions(source,design),base=new URL(`system/clothes/${asset}/${asset}`,makehuman),obj=readOBJ(new URL(base.href+'.obj')),rows=[],offsetScale=[1,1,1],hidden=new Set();let reading=false,hiding=false;
  for(const row of fs.readFileSync(new URL(base.href+'.mhclo'),'utf8').split(/\r?\n/)){
    const fields=row.trim().split(/\s+/);if(!fields[0]||fields[0].startsWith('#'))continue;
    if(['x_scale','y_scale','z_scale'].includes(fields[0])){const axis='xyz'.indexOf(fields[0][0]);offsetScale[axis]=Math.abs(data.raw[Number(fields[1])][axis]-data.raw[Number(fields[2])][axis])/Number(fields[3]);}
    if(fields[0]==='delete_verts'){reading=false;hiding=true;continue;}
    if(fields[0]==='verts'){reading=true;continue;}
    if(reading){
      if(fields.length===1&&/^\d+$/.test(fields[0]))rows.push({ids:[Number(fields[0])],weights:[1],delta:[0,0,0]});
      else if(fields.length===9&&fields.every(v=>Number.isFinite(Number(v))))rows.push({ids:fields.slice(0,3).map(Number),weights:fields.slice(3,6).map(Number),delta:fields.slice(6,9).map(Number)});
      else reading=false;
    }
    if(hiding)for(let i=0;i<fields.length;i++)if(/^\d+$/.test(fields[i])){const low=Number(fields[i]),high=fields[i+1]==='-'?Number(fields[i+2]):low;for(let index=low;index<=high;index++)hidden.add(index);if(high!==low)i+=2;}
  }
  if(rows.length!==obj.vertices.length)throw Error(`Retained ${asset} proxy has ${rows.length} mappings for ${obj.vertices.length} vertices`);
  const fitted=rows.map(row=>{
    let position=[0,0,0];const weights=new Array(source.bones.length).fill(0);
    for(let i=0;i<row.ids.length;i++){
      const index=row.ids[i],weight=row.weights[i];position=add(position,mul(data.game[index],weight));
      for(let joint=0;joint<weights.length;joint++)weights[joint]+=data.weights[index][joint]*weight;
    }
    position=add(position,row.delta.map((v,i)=>v*offsetScale[i]*data.scale*(i===2?-1:1)));
    return{position:point(position),skin:compactWeights(weights)};
  });
  const positions=[],uv=[],skinIndex=[],skinWeight=[],faces=[],sourceVertexIndices=[],lookup=new Map();
  // OBJ corners duplicate UV seams while keeping the anatomical fit and skin
  // weights identical on either side of each seam.
  for(const original of obj.faces){const face=[];for(const corner of [...original].reverse()){
    const key=corner.vertex+':'+corner.uv;let index=lookup.get(key);
    if(index==null){index=positions.length/3;lookup.set(key,index);const fit=fitted[corner.vertex];positions.push(...fit.position);skinIndex.push(...fit.skin.indices);skinWeight.push(...fit.skin.weights);uv.push(...(corner.uv==null?[0,0]:obj.uv[corner.uv]));sourceVertexIndices.push(corner.vertex);}
    face.push(index);
  }faces.push(face);}
  const indices=triangulate(faces),baseNormals=normals(fitted.flatMap(fit=>fit.position),triangulate(obj.faces.map(face=>face.map(corner=>corner.vertex).reverse()))),smoothNormals=sourceVertexIndices.flatMap(vertex=>baseNormals.slice(vertex*3,vertex*3+3));
  return{name:'anatomically-fitted-'+asset,positions,normals:smoothNormals,indices,faces,skinIndex,skinWeight,uv,bones,sourceVertexIndices,hiddenVertices:[...hidden],restError:data.restError,asset,fitRows:rows.length};
}

const sectionCache=new WeakMap();
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function rotationMatrix(q=[0,0,0,1]){const[x,y,z,w]=q;return[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];}
const matrixPoint=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2]*p[2],m[3]*p[0]+m[4]*p[1]+m[5]*p[2],m[6]*p[0]+m[7]*p[1]+m[8]*p[2]];
function boneAffines(bones,pose){
  const joints=pose?.joints||{},prefix=Object.keys(joints).find(name=>name.endsWith('_pelvis'))?.slice(0,-'pelvis'.length)||'';
  return bones.map(bone=>{const joint=joints[bone.name]||joints[prefix+bone.name],matrix=rotationMatrix(joint?.rotation),translation=sub(add(bone.head,joint?.translation||[0,0,0]),matrixPoint(matrix,bone.head));return{matrix,translation};});
}
function vertexAffine(mesh,vertex,affines){
  const matrix=new Array(9).fill(0),translation=[0,0,0];
  for(let slot=0;slot<4;slot++){const weight=mesh.skinWeight[vertex*4+slot];if(!weight)continue;const affine=affines[mesh.skinIndex[vertex*4+slot]];if(!affine)throw Error('Cloth envelope has an invalid skin joint');for(let i=0;i<9;i++)matrix[i]+=affine.matrix[i]*weight;for(let i=0;i<3;i++)translation[i]+=affine.translation[i]*weight;}
  return{matrix,translation};
}
function inversePoint(affine,point){
  const m=affine.matrix,[a,b,c,d,e,f,g,h,i]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-8)throw Error('Cloth skin affine is singular');
  const inverse=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d].map(v=>v/det);
  return matrixPoint(inverse,sub(point,affine.translation));
}
function convexSection(points){
  const sorted=[...new Map(points.map(p=>[p.map(v=>Math.round(v*1e7)).join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<3)return sorted;
  const cross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
  for(const p of sorted){while(lower.length>1&&cross2(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of sorted.toReversed()){while(upper.length>1&&cross2(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function radialSectionHit(polygon,center,direction){
  let radius=0;for(let i=0;i<polygon.length;i++){
    const a=sub(polygon[i],center),edge=sub(polygon[(i+1)%polygon.length],polygon[i]),den=direction[0]*edge[1]-direction[1]*edge[0];if(Math.abs(den)<1e-10)continue;
    const distance=(a[0]*edge[1]-a[1]*edge[0])/den,t=(a[0]*direction[1]-a[1]*direction[0])/den;if(distance>=0&&t>=-1e-7&&t<=1+1e-7)radius=Math.max(radius,distance);
  }return radius;
}
function envelopeSections(envelope,bones,pose,step){
  let contexts=sectionCache.get(envelope);if(!contexts){contexts=new Map();sectionCache.set(envelope,contexts);}const key=pose||'rest';if(contexts.has(key)&&contexts.get(key).step===step)return contexts.get(key);
  const affines=boneAffines(bones,pose),positions=[];
  for(let vertex=0;vertex<envelope.positions.length/3;vertex++){const affine=vertexAffine(envelope,vertex,affines);positions.push(add(matrixPoint(affine.matrix,envelope.positions.slice(vertex*3,vertex*3+3)),affine.translation));}
  const armWeight=vertex=>{let weight=0;for(let slot=0;slot<4;slot++)if(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(bones[envelope.skinIndex[vertex*4+slot]]?.name||''))weight+=envelope.skinWeight[vertex*4+slot];return weight;},buckets=new Map(),sections=new Map();
  for(let index=0;index<envelope.indices.length;index+=3){const ids=envelope.indices.slice(index,index+3);if(ids.reduce((sum,vertex)=>sum+armWeight(vertex),0)/3>.20)continue;const points=ids.map(vertex=>positions[vertex]),low=Math.floor(Math.min(...points.map(p=>p[1]))/step)-1,high=Math.ceil(Math.max(...points.map(p=>p[1]))/step)+1;
    for(let row=low;row<=high;row++){if(!buckets.has(row))buckets.set(row,[]);buckets.get(row).push(points);}
  }
  const section=row=>{
    if(sections.has(row))return sections.get(row);const y=row*step,points=[];
    // A band rather than a single slice includes narrow fly/seam protrusions
    // between cached planes. Neighbouring bands overlap for smooth fitting.
    for(const triangle of buckets.get(row)||[])for(const level of[y-step,y,y+step])for(let edge=0;edge<3;edge++){
      const a=triangle[edge],b=triangle[(edge+1)%3];if((a[1]<level)===(b[1]<level)||Math.abs(a[1]-b[1])<1e-10)continue;const t=(level-a[1])/(b[1]-a[1]);points.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);
    }
    const polygon=convexSection(points);sections.set(row,polygon);return polygon;
  };
  const chest=bones.find(b=>b.name==='chest');if(!chest)throw Error('Cloth envelope needs a chest bone');const chestAffine=affines[bones.indexOf(chest)],chestY=add(matrixPoint(chestAffine.matrix,chest.head),chestAffine.translation)[1],context={affines,section,chestY,step};contexts.set(key,context);return context;
}

/** Push only necessary lower-torso/coat fabric outside the actual clothed body.
 * Supply pose (or poses) to fit in the rendered posture, then invert each
 * vertex's own weighted skin affine back to rest. This keeps the drape's
 * gravity correction while respecting thighs that do not rotate with a coat.
 * Paired inner lining follows its outer vertex without losing thickness. */
export function fitClothToEnvelope(mesh,envelope,{ease=.010,pose=null,poses=null,bones=mesh.bones||envelope.bones,rowStep=.008}={}){
  if(!bones?.length||!envelope?.positions||!envelope?.indices)throw Error('Cloth fit needs the actual skinned body envelope');
  const out={...mesh,positions:[...mesh.positions]},poseList=poses?.length?poses:[pose],outerCount=mesh.drape?.outerVertices||mesh.positions.length/3,paired=mesh.positions.length/3===outerCount*2&&!!mesh.drape,step=Math.max(.006,Math.min(.010,rowStep)),moved=new Set();let maxDisplacement=0;
  const armWeight=vertex=>{let weight=0;for(let slot=0;slot<4;slot++)if(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(bones[mesh.skinIndex[vertex*4+slot]]?.name||''))weight+=mesh.skinWeight[vertex*4+slot];return weight;};
  for(let pass=0;pass<(poseList.length>1?3:1);pass++)for(const candidate of poseList){
    const context=envelopeSections(envelope,bones,candidate,step);
    for(let vertex=0;vertex<outerCount;vertex++){
      if(armWeight(vertex)>.20)continue;
      const affine=vertexAffine(mesh,vertex,context.affines),old=out.positions.slice(vertex*3,vertex*3+3),point=add(matrixPoint(affine.matrix,old),affine.translation),depth=context.chestY-.03-point[1];if(depth<=0)continue;
      const row=Math.round(point[1]/step),polygon=context.section(row);if(polygon.length<3)continue;
      const center=[(Math.min(...polygon.map(p=>p[0]))+Math.max(...polygon.map(p=>p[0])))/2,(Math.min(...polygon.map(p=>p[1]))+Math.max(...polygon.map(p=>p[1])))/2],delta=[point[0]-center[0],point[2]-center[1]],radius=length(delta),direction=radius>1e-8?mul(delta,1/radius):[0,-1],required=radialSectionHit(polygon,center,direction)+ease;
      if(radius>=required)continue;
      const t=Math.max(0,Math.min(1,depth/.06)),blend=t*t*(3-2*t),distance=(required-radius)*blend;if(distance<1e-8)continue;
      const fitted=[point[0]+direction[0]*distance,point[1],point[2]+direction[1]*distance],rest=inversePoint(affine,fitted),shift=sub(rest,old);maxDisplacement=Math.max(maxDisplacement,length(shift));moved.add(vertex);
      for(let axis=0;axis<3;axis++){out.positions[vertex*3+axis]=rest[axis];if(paired)out.positions[(vertex+outerCount)*3+axis]+=shift[axis];}
    }
  }
  out.normals=normals(out.positions,out.indices);
  return{...out,envelopeFit:{ease,rowStep:step,poses:poseList.length,shiftedVertices:moved.size,maxDisplacement,posed:poseList.some(Boolean)}};
}
