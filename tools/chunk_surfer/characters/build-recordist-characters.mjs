// Build a bounded, self-contained production GLB from retained anatomical sources.
// Run the Blender anatomy builder first; motion and prop contacts share one sampler.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
import {recordistCharacterPose,RECORDIST_TRANSFER_SECONDS} from '../../../src/render/recordist-character-performance.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=path.join(root,'public/assets/recordist-characters');
const output=path.join(root,'public/assets/recordist-characters.glb');
fs.copyFileSync(path.join(root,'artifacts/boy-contractor-design/anatomy/LICENSE.ASSETS.md'),path.join(dir,'LICENSE.ASSETS.md'));
const json={asset:{version:'2.0',generator:'Chunk Surfer recordist anatomy and contact sampler'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],textures:[],images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],animations:[],buffers:[],bufferViews:[],accessors:[]};
const bins=[];let cursor=0;
function binary(bytes,target){while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}const index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,...(target?{target}:{})});bins.push(bytes);cursor+=bytes.length;return index;}
function accessor(values,type,componentType=5126,target){const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
  if(values.some(v=>!Number.isFinite(v)))throw Error('Nonfinite accessor');const data=new Ctor(values),view=binary(Buffer.from(data.buffer),target),a={bufferView:view,componentType,count:values.length/width,type};
  if(type==='VEC3'||type==='SCALAR'){a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<values.length;i++){const k=i%width;a.min[k]=Math.min(a.min[k],values[i]);a.max[k]=Math.max(a.max[k],values[i]);}}
  json.accessors.push(a);return json.accessors.length-1;
}
const textureCache=new Map();
function texture(file){if(textureCache.has(file))return textureCache.get(file);const p=path.join(dir,file),view=binary(fs.readFileSync(p));json.images.push({bufferView:view,mimeType:'image/png',name:file});json.textures.push({sampler:0,source:json.images.length-1});const i=json.textures.length-1;textureCache.set(file,i);return i;}
const summary=[];
for(const actor of ['boy','contractor']){
  const data=JSON.parse(fs.readFileSync(path.join(dir,actor+'.json'),'utf8'));
  const materialBase=json.materials.length;
  for(const m of data.materials){const color=m.baseColor||[.5,.5,.5,1];const def={name:m.name,pbrMetallicRoughness:{baseColorFactor:color.length===3?[...color,1]:color,roughnessFactor:m.roughness??.9,metallicFactor:m.metallic??0},extras:{characterRole:m.role||'recordist-cloth'}};
    if(m.baseColorTexture)def.pbrMetallicRoughness.baseColorTexture={index:texture(m.baseColorTexture)};
    if(m.normalTexture)def.normalTexture={index:texture(m.normalTexture),scale:m.normalScale??.28};json.materials.push(def);
  }
  const merged=new Map();for(const mesh of data.meshes){let m=merged.get(mesh.material);if(!m){m={positions:[],normals:[],uv:[],skinIndex:[],skinWeight:[],indices:[]};merged.set(mesh.material,m);}const offset=m.positions.length/3;
    for(const key of ['positions','normals','skinIndex','skinWeight'])m[key]=m[key].concat(mesh[key]);
    m.uv=m.uv.concat(mesh.uv||Array(mesh.positions.length/3*2).fill(0));m.indices=m.indices.concat(mesh.indices.map(i=>i+offset));
  }
  const primitives=[];let vertices=0,triangles=0;
  for(const [material,m] of merged){vertices+=m.positions.length/3;triangles+=m.indices.length/3;
    if(m.indices.reduce((a,b)=>Math.max(a,b),0)>65535)throw Error('Recordist primitive too large');
    primitives.push({mode:4,material:materialBase+material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),TEXCOORD_0:accessor(m.uv,'VEC2',5126,34962),JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}});
  }
  const rootNode=json.nodes.length;json.nodes.push({name:actor+'_root',children:[]});json.scenes[0].nodes.push(rootNode);
  const joints=data.bones.map(b=>{const i=json.nodes.length;json.nodes.push({name:actor+'_'+b.name,translation:b.head,rotation:[0,0,0,1]});json.nodes[rootNode].children.push(i);return i;});
  const inverseBind=data.bones.flatMap(b=>[1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1]);
  const skin=json.skins.length;json.skins.push({name:actor+'_skin',joints,inverseBindMatrices:accessor(inverseBind,'MAT4')});
  const mesh=json.meshes.length;json.meshes.push({name:'recordist_'+actor,primitives,extras:{identity:actor==='boy'?'unresolved faceless child':'unresolved contractor',design:'Listening Pair appearance / Held Between Takes motion',faceless:actor==='boy'}});
  const meshNode=json.nodes.length;json.nodes.push({name:'recordist_'+actor,mesh,skin});json.scenes[0].nodes.push(meshNode);
  for(const mode of [actor==='boy'?'wait':'work','transfer']){
    const name=actor+'_'+mode,duration=mode==='transfer'?RECORDIST_TRANSFER_SECONDS:6,frames=mode==='transfer'?121:91,times=Array.from({length:frames},(_,i)=>i*duration/(frames-1)),input=accessor(times,'SCALAR'),poses=times.map(t=>recordistCharacterPose(actor,mode,t/duration));
    const animation={name,samplers:[],channels:[]};
    for(let b=0;b<data.bones.length;b++)for(const channel of ['translation','rotation']){const name=data.bones[b].name,values=poses.flatMap(p=>p.joints[name][channel]);const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(values,channel==='rotation'?'VEC4':'VEC3'),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:joints[b],path:channel}});}
    json.animations.push(animation);
  }
  summary.push({actor,vertices,triangles,primitives:primitives.length,joints:joints.length});
}
while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}json.buffers=[{byteLength:cursor}];let js=Buffer.from(JSON.stringify(json));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);const bin=Buffer.concat(bins),total=12+8+js.length+8+bin.length,header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([header,js,bh,bin]);
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));for(const e of asset.entries)for(const mode of[e.name.endsWith('boy')?'wait':'work','transfer'])for(const time of[0,1,2,3,4])sampleCharacterPose(asset,e,{clip:e.name.replace('recordist_','')+'_'+mode,time});
fs.writeFileSync(output,bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:1,design:'Listening Pair clothes, Held Between Takes performance, absent boy face',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),meshes:summary,clips:json.animations.map(a=>a.name),transferSeconds:RECORDIST_TRANSFER_SECONDS,embeddedTextures:json.textures.length},null,2)+'\n');console.log(JSON.stringify({output,bytes:bytes.length,meshes:summary,clips:json.animations.map(a=>a.name)}));
