// CPU-only anatomical Source study. No renderer, audio, asset-pack rebuild or
// downloaded portrait/diffuse image participates in this builder.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

const ROOT=process.cwd(),OUT=resolve(ROOT,'public/assets/stillness-anatomy'),STUDY=resolve(ROOT,'artifacts/stillness-anatomy/assets');
const SOURCE=resolve(OUT,'source/LeePerrySmith.glb');
const SOURCE_URL='https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';
const LICENSE_URL='https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/models/gltf/LeePerrySmith/LeePerrySmith_License.txt';
const SOURCE_SHA256='402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576';
const LICENSE_SHA256='7cf4da43a6ae6d32f7f7d063fe129a19468af6f4fe7c53b937f83959709fcb50';
const CROP=Object.freeze({minX:-1.75,maxX:1.75,minY:-.90,maxY:4.00});
const COLUMNS=96,ROWS=128,BAKE_WIDTH=768,BAKE_HEIGHT=1024;
// Contact is measured against the scan's own silhouette, not an oval mask.
// Keep the 2.5-unit source scale: reducing skull mass must really reduce depth,
// never be cancelled by renormalizing this bake's maximum back to one.
const CONTACT=Object.freeze({featherWidth:.24,backPlane:1.05,sourceHeightSpan:2.5,
  bowBoxRadiusWidth:.055,bowPasses:2,bowGain:.12,patchFeatherWidth:.10});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const normalize=v=>{const l=Math.hypot(...v)||1;return v.map(n=>n/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function glbMesh(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('A GLB2 source is required.');
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),at=20+jsonLength,bin=bytes.subarray(at+8,at+8+bytes.readUInt32LE(at));
  const read=id=>{
    const a=json.accessors[id],view=json.bufferViews[a.bufferView],count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5123:2,5125:4,5126:4}[a.componentType];
    if(!count||!size||a.sparse)throw Error('Unsupported source accessor.');
    const result=new Float64Array(a.count*count),start=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||count*size;
    for(let n=0;n<a.count;n++)for(let k=0;k<count;k++){
      const offset=start+n*stride+k*size;
      result[n*count+k]=a.componentType===5126?bin.readFloatLE(offset):a.componentType===5125?bin.readUInt32LE(offset):bin.readUInt16LE(offset);
    }
    return result;
  };
  const node=json.nodes.find(n=>n.name==='LeePerrySmith'&&n.mesh!=null),mesh=json.meshes[node.mesh],primitive=mesh.primitives[0];
  if(mesh.primitives.length!==1||node.rotation||node.matrix)throw Error('Source transform changed; review the source orientation.');
  const positions=read(primitive.attributes.POSITION),normals=read(primitive.attributes.NORMAL),indices=Uint32Array.from(read(primitive.indices));
  for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++)positions[i+k]=positions[i+k]*(node.scale?.[k]??1)+(node.translation?.[k]??0);
  return{positions,normals,indices,mesh:mesh.name,triangles:indices.length/3,vertices:positions.length/3};
}

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function png(width,height,pixels,{bits=8,channels=4}={}){
  const chunk=(type,data)=>{const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=bits;header[9]=channels===1?0:6;
  const rowBytes=width*channels*(bits/8),raw=Buffer.alloc((rowBytes+1)*height);
  for(let y=0;y<height;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*rowBytes,rowBytes).copy(raw,y*(rowBytes+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function rotated(source,angle){
  const c=Math.cos(angle),s=Math.sin(angle),positions=new Float64Array(source.positions.length),normals=new Float64Array(source.normals.length);
  for(let n=0;n<positions.length;n+=3)for(const [input,out]of[[source.positions,positions],[source.normals,normals]]){
    out[n]=c*input[n]+s*input[n+2];out[n+1]=input[n+1];out[n+2]=-s*input[n]+c*input[n+2];
  }
  return{...source,positions,normals};
}
function raster(source,width,height,crop=null){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let n=0;n<source.positions.length;n++) {min[n%3]=Math.min(min[n%3],source.positions[n]);max[n%3]=Math.max(max[n%3],source.positions[n]);}
  const b=crop||{minX:min[0]-.08,maxX:max[0]+.08,minY:min[1]-.08,maxY:max[1]+.08};
  const depth=new Float64Array(width*height).fill(-Infinity),normal=new Float32Array(width*height*3),coverage=new Uint8Array(width*height);
  const p=source.positions,N=source.normals,I=source.indices,toScreen=i=>[(p[i*3]-b.minX)/(b.maxX-b.minX)*(width-1),(b.maxY-p[i*3+1])/(b.maxY-b.minY)*(height-1),p[i*3+2]];
  const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
  for(let t=0;t<I.length;t+=3){
    const ids=Array.from(I.subarray(t,t+3)),v=ids.map(toScreen),area=edge(v[0],v[1],v[2][0],v[2][1]);if(Math.abs(area)<1e-12)continue;
    const x0=Math.max(0,Math.ceil(Math.min(...v.map(p=>p[0])))),x1=Math.min(width-1,Math.floor(Math.max(...v.map(p=>p[0])))),y0=Math.max(0,Math.ceil(Math.min(...v.map(p=>p[1])))),y1=Math.min(height-1,Math.floor(Math.max(...v.map(p=>p[1]))));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const a=edge(v[1],v[2],x,y)/area,bary=edge(v[2],v[0],x,y)/area,c=1-a-bary;if(Math.min(a,bary,c)<-1e-8)continue;
      const z=a*v[0][2]+bary*v[1][2]+c*v[2][2],at=y*width+x;if(z<=depth[at])continue;
      depth[at]=z;coverage[at]=1;const weights=[a,bary,c],n=normalize([0,1,2].map(k=>ids.reduce((sum,id,j)=>sum+weights[j]*N[id*3+k],0)));normal.set(n,at*3);
    }
  }
  return{width,height,depth,normal,coverage,bounds:b,sourceBounds:{min,max}};
}
function shaded(field,{grazing=false}={}){
  const pixels=new Uint8Array(field.width*field.height*4),light=normalize(grazing?[-1,.35,.35]:[-.55,.68,1]);
  for(let i=0;i<field.depth.length;i++){
    const n=field.normal.subarray(i*3,i*3+3),tone=field.coverage[i]?((grazing?.04:.16)+.76*Math.max(0,n.reduce((s,v,k)=>s+v*light[k],0))):.018;
    const b=Math.round(255*Math.pow(clamp(tone),1/2.2));pixels.set([b,Math.round(b*.98),Math.round(b*.94),255],i*4);
  }
  return pixels;
}

// Broad smooth regional deformation moves the actual connected scan. It does
// not paint eye holes, erase lids/lips, add facial primitives or invent teeth.
function strainedPoint([x,y,z]){
  const jaw=1-smooth(.48,1.15,y),jawCentre=1-smooth(.90,1.65,Math.abs(x));
  const brow=smooth(1.36,1.70,y)*(1-smooth(2.20,2.56,y))*(1-smooth(.85,1.25,Math.abs(x)));
  const inner=1-smooth(.15,.70,Math.abs(x));
  const cheek=smooth(.35,.85,y)*(1-smooth(1.52,2.05,y))*smooth(.12,.45,Math.abs(x))*(1-smooth(1.10,1.55,Math.abs(x)));
  const front=smooth(.15,1.20,z),side=x<0?1:-.44;
  return[
    x+(jaw*.095*jawCentre-brow*x*.10+cheek*side*.035)*front,
    y-(jaw*.34*jawCentre+brow*(.095-inner*.20)+cheek*side*.025)*front,
    z+(jaw*.18*jawCentre+brow*(.075+inner*.065)+cheek*side*.24)*front,
  ];
}
function meshNormals(positions,indices){
  const result=new Float32Array(positions.length);
  for(let t=0;t<indices.length;t+=3){
    const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3,n=cross([0,1,2].map(k=>positions[b+k]-positions[a+k]),[0,1,2].map(k=>positions[c+k]-positions[a+k]));
    for(const offset of[a,b,c])for(let k=0;k<3;k++)result[offset+k]+=n[k];
  }
  for(let i=0;i<result.length;i+=3)result.set(normalize(Array.from(result.subarray(i,i+3))),i);
  return result;
}
function deformScan(source){
  const positions=new Float64Array(source.positions.length);
  for(let i=0;i<positions.length;i+=3)positions.set(strainedPoint(Array.from(source.positions.subarray(i,i+3))),i);
  return{...source,positions,normals:meshNormals(positions,source.indices)};
}
function distanceInside(field){
  const {width:w,height:h,coverage}=field,d=new Float32Array(w*h),diagonal=Math.SQRT2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)d[y*w+x]=!coverage[y*w+x]||x===0||y===0||x===w-1||y===h-1?0:1e5;
  for(let y=1;y<h;y++)for(let x=1;x<w-1;x++){const i=y*w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-w]+1,d[i-w-1]+diagonal,d[i-w+1]+diagonal);}
  for(let y=h-2;y>=0;y--)for(let x=w-2;x>0;x--){const i=y*w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w+1]+diagonal,d[i+w-1]+diagonal);}
  return d;
}
// Two separable box passes produce a broad, smooth low-frequency contact bow
// from the actual source height. This joins material around the head without
// adding independent face features or forcing a complete skull silhouette.
function blurHeightAxis(input,width,height,radius,vertical){
  const result=new Float64Array(input.length),span=radius*2+1,major=vertical?width:height,minor=vertical?height:width;
  for(let a=0;a<major;a++){
    const at=b=>vertical?b*width+a:a*width+b;let sum=0;
    for(let b=-radius;b<=radius;b++)if(b>=0&&b<minor)sum+=input[at(b)];
    for(let b=0;b<minor;b++){
      result[at(b)]=sum/span;
      const previous=b-radius,next=b+radius+1;
      if(previous>=0)sum-=input[at(previous)];if(next<minor)sum+=input[at(next)];
    }
  }
  return result;
}
function heightBake(field){
  const {width,height:rows}=field,distance=distanceInside(field),raw=new Float64Array(width*rows),height=new Uint16Array(width*rows);
  for(let i=0;i<raw.length;i++)if(field.coverage[i])raw[i]=clamp((field.depth[i]-CONTACT.backPlane)/CONTACT.sourceHeightSpan);
  let bow=raw;const radius=Math.round(width*CONTACT.bowBoxRadiusWidth);
  for(let pass=0;pass<CONTACT.bowPasses;pass++){
    bow=blurHeightAxis(bow,width,rows,radius,false);bow=blurHeightAxis(bow,width,rows,radius,true);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
    const i=y*width+x,edge=Math.min(x,width-1-x,y*width/rows,(rows-1-y)*width/rows);
    const contact=smooth(0,width*CONTACT.featherWidth,distance[i]),border=smooth(0,width*CONTACT.patchFeatherWidth,edge);
    height[i]=Math.round(clamp((raw[i]*contact+bow[i]*CONTACT.bowGain)*border)*65535);
  }
  return height;
}
function sampleHeight(height,x,y,width=BAKE_WIDTH,heightRows=BAKE_HEIGHT){
  x=clamp(x,0,width-1);y=clamp(y,0,heightRows-1);const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(heightRows-1,y0+1),u=x-x0,v=y-y0;
  return(height[y0*width+x0]*(1-u)*(1-v)+height[y0*width+x1]*u*(1-v)+height[y1*width+x0]*(1-u)*v+height[y1*width+x1]*u*v)/65535;
}
function nativeGrid(height){
  const values=new Uint16Array(COLUMNS*ROWS),positions=new Float32Array(COLUMNS*ROWS*3),uvs=new Float32Array(COLUMNS*ROWS*2),indices=new Uint16Array((COLUMNS-1)*(ROWS-1)*6);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLUMNS;x++){
    const i=y*COLUMNS+x,u=x/(COLUMNS-1),v=y/(ROWS-1),collar=x<2||y<2||x>=COLUMNS-2||y>=ROWS-2;
    values[i]=collar?0:Math.round(sampleHeight(height,u*(BAKE_WIDTH-1),(1-v)*(BAKE_HEIGHT-1))*65535);
    positions.set([u-.5,v-.5,values[i]/65535],i*3);uvs.set([u,v],i*2);
  }
  let k=0;for(let y=0;y<ROWS-1;y++)for(let x=0;x<COLUMNS-1;x++){const a=y*COLUMNS+x,b=a+1,c=a+COLUMNS,d=c+1;indices.set([a,b,c,b,d,c],k);k+=6;}
  return{values,positions,uvs,indices,normals:meshNormals(positions,indices)};
}
function gray16(values){const pixels=Buffer.alloc(values.length*2);for(let i=0;i<values.length;i++)pixels.writeUInt16BE(values[i],i*2);return pixels;}
function little16(values){const bytes=Buffer.alloc(values.length*2);for(let i=0;i<values.length;i++)bytes.writeUInt16LE(values[i],i*2);return bytes;}
function gridSource(grid,aspect,depth=.18){
  const positions=Float64Array.from(grid.positions,(n,i)=>i%3===1?n/aspect:i%3===2?n*depth:n);
  return{positions,indices:grid.indices,normals:meshNormals(positions,grid.indices)};
}
function auditGrid(grid,id){
  const edges=new Map(),boundary=new Set(),boundaryNeighbours=new Map();let zeroArea=0,backward=0,minNormal=Infinity,maxNormal=0;
  for(const n of [...grid.positions,...grid.normals,...grid.uvs])if(!Number.isFinite(n))throw Error(id+': nonfinite mesh value.');
  for(let t=0;t<grid.indices.length;t+=3){
    const ids=Array.from(grid.indices.subarray(t,t+3)),p=ids.map(i=>Array.from(grid.positions.subarray(i*3,i*3+3))),n=cross(p[1].map((v,k)=>v-p[0][k]),p[2].map((v,k)=>v-p[0][k]));
    if(Math.hypot(...n)<1e-12)zeroArea++;if(n[2]<=0)backward++;
    for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}
  }
  for(const[key,count]of edges)if(count===1){const [a,b]=key.split(':').map(Number);boundary.add(a);boundary.add(b);for(const[u,v]of[[a,b],[b,a]]){const list=boundaryNeighbours.get(u)||[];list.push(v);boundaryNeighbours.set(u,list);}}
  for(let i=0;i<grid.normals.length;i+=3){const n=Math.hypot(...grid.normals.subarray(i,i+3));minNormal=Math.min(minNormal,n);maxNormal=Math.max(maxNormal,n);}
  const visited=new Set(),pending=[...boundary].slice(0,1);while(pending.length){const node=pending.pop();if(visited.has(node))continue;visited.add(node);pending.push(...boundaryNeighbours.get(node));}
  const nonManifold=[...edges.values()].filter(n=>n>2).length,expectedBoundary=2*(COLUMNS+ROWS-2),flatBoundary=[...boundary].every(i=>grid.positions[i*3+2]===0&&grid.normals[i*3]===0&&grid.normals[i*3+1]===0&&grid.normals[i*3+2]===1),oneCycle=boundary.size===expectedBoundary&&visited.size===boundary.size&&[...boundaryNeighbours.values()].every(n=>n.length===2);
  if(zeroArea||backward||nonManifold||!flatBoundary||!oneCycle||Math.max(Math.abs(1-minNormal),Math.abs(1-maxNormal))>1e-6)throw Error(id+': mesh audit failed.');
  return{id,vertices:grid.positions.length/3,triangles:grid.indices.length/3,zeroAreaTriangles:zeroArea,backwardTriangles:backward,nonManifoldEdges:nonManifold,boundaryEdges:expectedBoundary,boundaryOneSimpleCycle:oneCycle,boundaryExactlyFlat:flatBoundary,normalLength:[minNormal,maxNormal],heightRange:[Math.min(...grid.values),Math.max(...grid.values)],selfIntersection:'Impossible for nonoverlapping fixedXY grid triangles with a single finite height at eachvertex; verified positiveXY triangle winding.'};
}
function generatedModule(metadata,neutral,strained){
  const a=little16(neutral.values).toString('base64'),b=little16(strained.values).toString('base64');
  return `// Generated by tools/chunk_surfer/build-stillness-anatomy.mjs. CC-BY3.0 attribution below.\nexport const STILLNESS_ANATOMY=Object.freeze(${JSON.stringify(metadata,null,2)});\nconst decode=value=>{const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0)),view=new DataView(raw.buffer),out=new Uint16Array(raw.length/2);for(let i=0;i<out.length;i++)out[i]=view.getUint16(i*2,true);return out;};\nconst neutralHeight=decode('${a}');\nconst strainedHeight=decode('${b}');\nconst columns=${COLUMNS},rows=${ROWS},positions=new Float32Array(columns*rows*3),strainedPositions=new Float32Array(positions.length),uvs=new Float32Array(columns*rows*2),indices=new Uint16Array((columns-1)*(rows-1)*6);\nfor(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=y*columns+x,u=x/(columns-1),v=y/(rows-1);positions.set([u-.5,v-.5,neutralHeight[i]/65535],i*3);strainedPositions.set([u-.5,v-.5,strainedHeight[i]/65535],i*3);uvs.set([u,v],i*2);}\nlet offset=0;for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x,b=a+1,c=a+columns,d=c+1;indices.set([a,b,c,b,d,c],offset);offset+=6;}\nconst normalsOf=p=>{const out=new Float32Array(p.length);for(let t=0;t<indices.length;t+=3){const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3,ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2],bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2],n=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];for(const i of[a,b,c])for(let k=0;k<3;k++)out[i+k]+=n[k];}for(let i=0;i<out.length;i+=3){const length=Math.hypot(out[i],out[i+1],out[i+2])||1;for(let k=0;k<3;k++)out[i+k]/=length;}return out;};\nexport const STILLNESS_ANATOMY_GRID=Object.freeze({columns,rows,aspect:STILLNESS_ANATOMY.aspect,neutralHeight,strainedHeight,positions,strainedPositions,normals:normalsOf(positions),strainedNormals:normalsOf(strainedPositions),uvs,indices});\n`;
}

await mkdir(OUT,{recursive:true});await mkdir(STUDY,{recursive:true});await mkdir(resolve(STUDY,'contact-study'),{recursive:true});
const sourceBytes=await readFile(SOURCE),source=glbMesh(sourceBytes),views=[];
if(sha(sourceBytes)!==SOURCE_SHA256)throw Error('The licensed source bytes changed; review before rebuilding.');
for(const [id,angle]of[['front',0],['right',Math.PI/2],['back',Math.PI],['left',-Math.PI/2]]){
  const field=raster(rotated(source,angle),384,448);await writeFile(resolve(STUDY,'scan-'+id+'.png'),png(384,448,shaded(field)));views.push({id,angle,bounds:field.sourceBounds});
}
await writeFile(resolve(STUDY,'scan-inspection.json'),JSON.stringify({sourceSha256:sha(sourceBytes),mesh:source.mesh,vertices:source.vertices,triangles:source.triangles,views},null,2)+'\n');
if(process.argv.includes('--inspect'))process.exit(0);

const sourceLicense=await readFile(resolve(OUT,'source/LeePerrySmith_License.txt'));
if(sha(sourceLicense)!==LICENSE_SHA256||!/Lee Perry-Smith.*Creative Commons Attribution 3.0 Unported/.test(sourceLicense.toString()))throw Error('Unexpected source attribution/license; inspect before rebuilding.');
const strainedScan=deformScan(source),neutralRaster=raster(source,BAKE_WIDTH,BAKE_HEIGHT,CROP),strainedRaster=raster(strainedScan,BAKE_WIDTH,BAKE_HEIGHT,CROP),neutralHeight=heightBake(neutralRaster),strainedHeight=heightBake(strainedRaster),neutral=nativeGrid(neutralHeight),strained=nativeGrid(strainedHeight);
const aspect=(CROP.maxX-CROP.minX)/(CROP.maxY-CROP.minY),landmarks={
  forehead:[0,2.85],glabella:[-.02,1.98],leftLid:[-.57,1.66],rightLid:[.55,1.66],noseTip:[-.088,1.097],leftNasalWing:[-.31,.91],rightNasalWing:[.25,.92],upperLip:[-.04,.53],lowerLip:[-.04,.39],chin:[-.02,-.24],leftCheek:[-.97,1.10],rightCheek:[.91,1.10],
};
const landmarkUVs=Object.fromEntries(Object.entries(landmarks).map(([id,p])=>[id,{neutral:[(p[0]-CROP.minX)/(CROP.maxX-CROP.minX),(p[1]-CROP.minY)/(CROP.maxY-CROP.minY)],strained:(()=>{const q=strainedPoint([p[0],p[1],1.8]);return[(q[0]-CROP.minX)/(CROP.maxX-CROP.minX),(q[1]-CROP.minY)/(CROP.maxY-CROP.minY)];})()}]));
const metadata={version:2,id:'lee-perry-smith-architectural-relief',aspect,widthToHeight:aspect,columns:COLUMNS,rows:ROWS,coordinateSpace:'Normalized receiver patch. X/Y [-.5,.5], outward Z [0,1], UV [0,1]; preserve aspect through physical width/height. Mesh row0 is bottom; PNG row0 is top.',
  source:{title:'Infinite, 3D Head Scan',author:'Lee Perry-Smith',sourceUrl:SOURCE_URL,originalWork:'https://www.triplegangers.com/',distribution:'three.js r185 examples/models/gltf/LeePerrySmith',sha256:sha(sourceBytes),bytes:sourceBytes.length,vertices:source.vertices,triangles:source.triangles,license:'CC-BY-3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',licenseSourceUrl:LICENSE_URL,licenseSha256:sha(sourceLicense)},
  attribution:'Infinite, 3D Head Scan by Lee Perry-Smith, based on work at www.triplegangers.com; distributed through three.js r185. CC BY3.0. Modified for Chunk Surfer: frontal crop, connected strain deformation, reduced skull base mass, broad scanned-silhouette contact feather, low-frequency wall bow and outward-only bas-relief rasterization. No endorsement implied.',
  crop:CROP,landmarkUVs,landmarkMethod:'Authored anatomical landmarkXY after inspecting raw orthographic scan. Nose tip checked against maximum frontdepth. Strained positions follow the same connected warp; not clinical measurement.',
  bake:{width:BAKE_WIDTH,height:BAKE_HEIGHT,precision:'Float64 source/raster computation; 16-bit unsigned linear height output; no 8-bit intermediate or diffuse image.',frontAxis:'+Z',backPlaneSourceZ:CONTACT.backPlane,sourceHeightSpan:CONTACT.sourceHeightSpan,contactEnvelope:CONTACT,renormalizedToPeak:false,physicalPreview:{width:1,height:1/aspect,depth:.18},heightQuantizationMaximum:1/65535,boundary:'Broad C1 smoothstep fade over the actual scanned silhouette, a low-frequency source-derived wall bow, C1 patch fade and exactly flat two-grid-vertex collar.'},
  shapes:{neutral:'Original connected scanned human face with closed lids/lips; reduced skull mass and broad material contact envelope.',strained:'Smooth connected source-mesh jaw draw, inward/uneven brow compression and asymmetric cheek pressure before rasterization. No painted sockets/mouth, new holes, teeth, photographic diffuse or coloroval.'},
  acceptance:'CPU asset study and topology/provenance checks only. Native material, dither, depth/shadow integration, performance and unfamiliar-player acceptance pending.'};
const outputs={};
for(const[id,height,grid]of[['neutral',neutralHeight,neutral],['strained',strainedHeight,strained]]){
  const image=png(BAKE_WIDTH,BAKE_HEIGHT,gray16(height),{bits:16,channels:1}),binary=little16(height),gridBinary=little16(grid.values);
  for(const[name,bytes]of[[id+'-height16.png',image],[id+'-height16.bin',binary],[id+'-grid16.bin',gridBinary]]){await writeFile(resolve(OUT,name),bytes);outputs[name]={bytes:bytes.length,sha256:sha(bytes)};}
  const physical=gridSource(grid,aspect),sourceForView=id==='neutral'?source:strainedScan;
  await writeFile(resolve(STUDY,id+'-scan-crop.png'),png(BAKE_WIDTH,BAKE_HEIGHT,shaded(raster(sourceForView,BAKE_WIDTH,BAKE_HEIGHT,CROP))));
  for(const [view,angle]of[['front',0],['oblique',-.55]]){
    const field=raster(rotated(physical,angle),512,640);await writeFile(resolve(STUDY,id+'-relief-'+view+'.png'),png(512,640,shaded(field)));
    await writeFile(resolve(STUDY,id+'-relief-'+view+'-grazing.png'),png(512,640,shaded(field,{grazing:true})));
  }
  await writeFile(resolve(STUDY,id+'-height.png'),image);
}
const audits=[auditGrid(neutral,'neutral'),auditGrid(strained,'strained')],displacement=neutral.values.reduce((s,n,i)=>s+Math.abs(strained.values[i]-n),0)/neutral.values.length/65535;
if(displacement<.005)throw Error('The connected strain study did not produce a material shape difference.');
const sampleLandmark=(values,id)=>{const [u,v]=landmarkUVs[id].neutral;return sampleHeight(values,u*(BAKE_WIDTH-1),(1-v)*(BAKE_HEIGHT-1));};
const maximumNeutral=Math.max(...neutral.values)/65535,maximumStrained=Math.max(...strained.values)/65535;
const contactChecks={version:2,envelope:CONTACT,renormalizedToPeak:false,maximumNeutral,maximumStrained,
  physicalMaximumAt20cm:{neutral:maximumNeutral*.20,strained:maximumStrained*.20},
  neutralLandmarkHeights:Object.fromEntries(['forehead','leftLid','rightLid','noseTip','upperLip','lowerLip','chin','leftCheek','rightCheek'].map(id=>[id,sampleLandmark(neutralHeight,id)])),
  meanAbsoluteShapeDifference:displacement};
if(maximumNeutral>=.8||maximumStrained>=.8)throw Error('Reduced base mass unexpectedly regained a detached whole-head depth.');
if(contactChecks.neutralLandmarkHeights.noseTip<=Math.max(contactChecks.neutralLandmarkHeights.leftLid,contactChecks.neutralLandmarkHeights.rightLid)+.08)throw Error('Contact feather erased the source nasal/lid depth separation.');
await writeFile(resolve(STUDY,'contact-study/final-contact-checks.json'),JSON.stringify(contactChecks,null,2)+'\n');
await mkdir(resolve(ROOT,'src/data/generated'),{recursive:true});
const module=generatedModule(metadata,neutral,strained);await writeFile(resolve(ROOT,'src/data/generated/stillness-anatomy.js'),module);
outputs['src/data/generated/stillness-anatomy.js']={bytes:Buffer.byteLength(module),sha256:sha(module)};
await writeFile(resolve(OUT,'anatomy.json'),JSON.stringify({...metadata,outputs},null,2)+'\n');
await writeFile(resolve(OUT,'ATTRIBUTION.txt'),metadata.attribution+'\n\nLicense: https://creativecommons.org/licenses/by/3.0/\nSource: '+SOURCE_URL+'\nOriginal license notice: '+LICENSE_URL+'\n');
await writeFile(resolve(STUDY,'asset-audit.json'),JSON.stringify({schema:'cs-stillness-anatomy-asset-study-1',source:metadata.source,sourceLicenseVerified:true,usedDiffuse:false,assetOutputs:outputs,gridAudits:audits,contactChecks,meanAbsoluteShapeDifference:displacement,shapeAgreement:'SameUV,XYandtopology; only baked outwardheight differs. Both state heights remain finite/nonnegative.',maximumTrianglesPerPatch:25000,assetChecksPassed:true,scope:metadata.acceptance},null,2)+'\n');
console.log(JSON.stringify({source:metadata.source,vertices:neutral.positions.length/3,triangles:neutral.indices.length/3,meanAbsoluteShapeDifference:displacement,outputs,assetChecksPassed:true},null,2));
