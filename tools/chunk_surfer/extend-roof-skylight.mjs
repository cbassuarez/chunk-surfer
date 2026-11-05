// Restores the academic roof's skylight in the built prop pack without a full
// rebuild: the original pane returns from the last pack before the courtyard's
// box cut, and the same bays continue across the courts (roofCourtGlazingLayout).
// A full build-props run produces the same glazing.
//
// The pack is patched in place rather than re-exported: only this mesh's primitives
// change and its new data is appended, so every other mesh keeps its exact bytes.
// Re-exporting through a glTF library interleaves the buffers and drops default
// material factors, which the pack's own readers and specs rely on.
//
//   node tools/chunk_surfer/extend-roof-skylight.mjs [--source pre-cut.glb]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {roofCourtGlazingLayout} from '../../src/data/academic-roof.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url)),PACK=path.join(ROOT,'public/assets/conservatory-props.glb');
export const PRE_CUT_COMMIT='ef575222';
const MESH='academic_roof_glazing',MATERIALS={glass:'wired roof glass',lead:'roof dull lead glazing repairs',iron:'roof charcoal bronze and iron',kerb:'roof rain-dark stone coping'};
const COMPONENTS={5123:Uint16Array,5125:Uint32Array,5126:Float32Array},SIZES={SCALAR:1,VEC2:2,VEC3:3};

function readGlb(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jsonLength=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength))),binStart=20+jsonLength,binLength=view.getUint32(binStart,true);
  return{json,bin:bytes.subarray(binStart+8,binStart+8+binLength)};
}
function writeGlb(json,bin){
  const text=Buffer.from(JSON.stringify(json)),jsonPad=(4-text.length%4)%4,binPad=(4-bin.length%4)%4;
  const jsonLength=text.length+jsonPad,binLength=bin.length+binPad,total=12+8+jsonLength+8+binLength,out=Buffer.alloc(total);
  out.writeUInt32LE(0x46546C67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
  out.writeUInt32LE(jsonLength,12);out.writeUInt32LE(0x4E4F534A,16);text.copy(out,20);out.fill(0x20,20+text.length,20+jsonLength);
  const at=20+jsonLength;out.writeUInt32LE(binLength,at);out.writeUInt32LE(0x004E4942,at+4);Buffer.from(bin.buffer,bin.byteOffset,bin.length).copy(out,at+8);
  return out;
}
function readAccessor({json,bin},index){
  const accessor=json.accessors[index],view=json.bufferViews[accessor.bufferView],Type=COMPONENTS[accessor.componentType],size=SIZES[accessor.type];
  if(!Type||!size)throw Error(`Unsupported accessor ${accessor.componentType}/${accessor.type}`);
  const width=Type.BYTES_PER_ELEMENT,stride=view.byteStride||size*width,base=(view.byteOffset||0)+(accessor.byteOffset||0),values=[];
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),get=Type===Float32Array?o=>data.getFloat32(o,true):Type===Uint32Array?o=>data.getUint32(o,true):o=>data.getUint16(o,true);
  for(let i=0;i<accessor.count;i++)for(let k=0;k<size;k++)values.push(get(base+i*stride+k*width));
  return values;
}
function box(group,[cx,cy,cz],[sx,sy,sz]){
  const hx=sx/2,hy=sy/2,hz=sz/2,base=group.positions.length/3;
  const faces=[
    [[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],
    [[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
    [[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],
    [[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
    [[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],
    [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]],
  ];
  faces.forEach((face,f)=>{
    for(let i=0;i<4;i++){group.positions.push(cx+face[i][0],cy+face[i][1],cz+face[i][2]);group.normals.push(...face[4]);group.uvs.push(0,0);}
    const o=base+f*4;group.indices.push(o,o+1,o+2,o,o+2,o+3);
  });
}
function restoreGlazing(target,original){
  const mesh=target.json.meshes.find(m=>m.name===MESH),source=original.json.meshes.find(m=>m.name===MESH);
  if(!mesh)throw Error(`${MESH} is missing from the pack`);
  if(!source)throw Error(`${MESH} is missing from the pre-cut pack`);
  const groups=new Map(),group=name=>{if(!groups.has(name))groups.set(name,{positions:[],normals:[],uvs:[],indices:[]});return groups.get(name);};
  for(const p of source.primitives){
    const g=group(original.json.materials[p.material].name),base=g.positions.length/3;
    g.positions.push(...readAccessor(original,p.attributes.POSITION));g.normals.push(...readAccessor(original,p.attributes.NORMAL));
    g.uvs.push(...readAccessor(original,p.attributes.TEXCOORD_0));for(const i of readAccessor(original,p.indices))g.indices.push(base+i);
  }
  const layout=roofCourtGlazingLayout();
  for(const row of layout.panes)box(group(MATERIALS.glass),row.c,row.s);
  for(const row of layout.repairs)box(group(MATERIALS.lead),row.c,row.s);
  for(const row of[...layout.ribs,...layout.beams])box(group(MATERIALS.iron),row.c,row.s);
  for(const row of layout.kerbs)box(group(MATERIALS.kerb),row.c,row.s);

  const chunks=[];let length=target.bin.length;
  const pad=count=>{if(count){chunks.push(new Uint8Array(count));length+=count;}};
  pad((4-length%4)%4);
  const append=(array,type,componentType,bufferTarget,bounds)=>{
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),view=target.json.bufferViews.length;
    target.json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,target:bufferTarget});
    target.json.accessors.push({bufferView:view,componentType,count:array.length/SIZES[type],type,...bounds});
    chunks.push(bytes);length+=bytes.length;pad((4-length%4)%4);
    return target.json.accessors.length-1;
  };
  const materialIndex=name=>{const index=target.json.materials.findIndex(m=>m.name===name);if(index<0)throw Error(`The pack has no material "${name}"`);return index;};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0;
  mesh.primitives=[...groups].map(([name,g])=>{
    const positions=new Float32Array(g.positions),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],positions[i+k]);hi[k]=Math.max(hi[k],positions[i+k]);}
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],lo[k]);max[k]=Math.max(max[k],hi[k]);}
    triangles+=g.indices.length/3;
    return{attributes:{
      POSITION:append(positions,'VEC3',5126,34962,{min:lo,max:hi}),
      NORMAL:append(new Float32Array(g.normals),'VEC3',5126,34962),
      TEXCOORD_0:append(new Float32Array(g.uvs),'VEC2',5126,34962),
    },indices:append(new Uint32Array(g.indices),'SCALAR',5125,34963),material:materialIndex(name),mode:4};
  });
  const extras={...(mesh.extras||{})};delete extras.courtyardOpenAir;
  mesh.extras={...extras,courtSkylight:{revision:2,source:PRE_CUT_COMMIT,panes:layout.panes.length}};
  const bin=new Uint8Array(length);bin.set(target.bin,0);let offset=target.bin.length;
  for(const chunk of chunks){bin.set(chunk,offset);offset+=chunk.length;}
  target.json.buffers[0].byteLength=length;
  return{bin,min,max,triangles};
}
// The credits and lettering manifest record this pack's exact bytes; specs compare them.
function writeReceipts(file,bytes,{min,max,triangles}){
  const dir=path.dirname(file),sha=crypto.createHash('sha256').update(bytes).digest('hex'),three=v=>Math.round(v*1000)/1000;
  const creditsPath=path.join(dir,'conservatory-props.credits.json'),credits=JSON.parse(fs.readFileSync(creditsPath,'utf8')),entry=credits.meshes.find(m=>m.name===MESH);
  credits.pack.triangles+=triangles-entry.triangles;credits.pack.sha256=sha;credits.pack.bytes=bytes.length;
  entry.triangles=triangles;entry.bounds={min:min.map(three),max:max.map(three)};
  fs.writeFileSync(creditsPath,JSON.stringify(credits,null,2)+'\n');
  const letteringPath=path.join(dir,'conservatory-props.lettering.json'),lettering=JSON.parse(fs.readFileSync(letteringPath,'utf8'));
  lettering.packSha256=sha;fs.writeFileSync(letteringPath,JSON.stringify(lettering,null,2)+'\n');
}
export function extendRoofSkylight({file=PACK,source=null}={}){
  const originalBytes=source?fs.readFileSync(source):execFileSync('git',['show',`${PRE_CUT_COMMIT}:public/assets/conservatory-props.glb`],{cwd:ROOT,maxBuffer:256*1024*1024});
  const target=readGlb(fs.readFileSync(file)),{bin,...result}=restoreGlazing(target,readGlb(originalBytes)),out=writeGlb(target.json,bin);
  fs.writeFileSync(file,out);
  writeReceipts(file,out,result);
  return{...result,bytes:out.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const at=process.argv.indexOf('--source');
  console.log(JSON.stringify(extendRoofSkylight({source:at>=0?path.resolve(process.argv[at+1]):null})));
}
