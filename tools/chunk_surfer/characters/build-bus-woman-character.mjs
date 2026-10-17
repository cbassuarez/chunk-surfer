// Package the selected, retained anatomical bus woman and deterministic gestures.
// Blender source step: build-bus-woman-character.py. No scene placements live here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
import {busWomanPose,BUS_WOMAN_CLIPS} from '../../../src/render/bus-woman-performance.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const retained=path.join(root,'artifacts/bus-woman-production');
const folder=path.join(root,'public/assets/bus-woman-character');fs.mkdirSync(folder,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.join(retained,'anatomy.json'),'utf8'));
if(data.bones.length!==54||data.design!=='The Button Out of Place')throw Error('Unexpected selected bus woman source');
const json={asset:{version:'2.0',generator:'Chunk Surfer bus woman: selected anatomical master and contact sampler'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],animations:[],buffers:[],bufferViews:[],accessors:[]};
const bins=[];let cursor=0;
function binary(bytes,target){while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}const index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,...(target?{target}:{})});bins.push(bytes);cursor+=bytes.length;return index;}
function accessor(values,type,componentType=5126,target){const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
  if(values.some(v=>!Number.isFinite(v)))throw Error('Nonfinite bus woman accessor');const valuesTyped=new Ctor(values),view=binary(Buffer.from(valuesTyped.buffer),target),a={bufferView:view,componentType,count:values.length/width,type};
  if(type==='VEC3'||type==='SCALAR'){a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<values.length;i++){const k=i%width;a.min[k]=Math.min(a.min[k],values[i]);a.max[k]=Math.max(a.max[k],values[i]);}}
  json.accessors.push(a);return json.accessors.length-1;
}
for(const material of data.materials){const color=material.baseColor||[.5,.5,.5,1];json.materials.push({name:material.name,pbrMetallicRoughness:{baseColorFactor:color.length===3?[...color,1]:color,roughnessFactor:material.roughness??.9,metallicFactor:material.metallic??0},extras:{characterRole:material.role||'cloth'}});}

function primitives(meshes,rigid=false){const merged=new Map();
  for(const mesh of meshes){let m=merged.get(mesh.material);if(!m){m={positions:[],normals:[],uv:[],skinIndex:[],skinWeight:[],indices:[]};merged.set(mesh.material,m);}const offset=m.positions.length/3;
    for(const key of ['positions','normals'])m[key].push(...mesh[key]);
    m.skinIndex.push(...(rigid?Array(mesh.positions.length/3*4).fill(0):mesh.skinIndex));
    m.skinWeight.push(...(rigid?Array.from({length:mesh.positions.length/3*4},(_,i)=>i%4===0?1:0):mesh.skinWeight));
    m.uv.push(...(mesh.uv||Array(mesh.positions.length/3*2).fill(0)));m.indices.push(...mesh.indices.map(i=>i+offset));
  }
  return [...merged].map(([material,m])=>{
    if(Math.max(...m.indices)>65535)throw Error('Bus woman primitive exceeds index size');
    return {mode:4,material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),TEXCOORD_0:accessor(m.uv,'VEC2',5126,34962),JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}};
  });
}
const jointRoot=json.nodes.length;json.nodes.push({name:'bus_woman_root',children:[]});json.scenes[0].nodes.push(jointRoot);
const joints=data.bones.map(bone=>{const i=json.nodes.length;json.nodes.push({name:'bus_woman_'+bone.name,translation:bone.head,rotation:[0,0,0,1]});json.nodes[jointRoot].children.push(i);return i;});
const inverse=data.bones.flatMap(bone=>[1,0,0,0,0,1,0,0,0,0,1,0,-bone.head[0],-bone.head[1],-bone.head[2],1]);
const bodySkin=json.skins.length;json.skins.push({name:'bus_woman_anatomical_skin',joints,inverseBindMatrices:accessor(inverse,'MAT4')});
const bodyPrimitives=primitives(data.meshes);
for(const name of ['exterior_bus_woman','outskirts_bus_woman']){
  const mesh=json.meshes.length;json.meshes.push({name,primitives:bodyPrimitives,extras:{identity:'unnamed bus woman',design:data.design,canonicalMaster:'bus-woman-character',height:data.height,pockets:'physical cut openings and sewn inner bags',fingerSegments:3}});
  const node=json.nodes.length;json.nodes.push({name,mesh,skin:bodySkin});json.scenes[0].nodes.push(node);
}
const accessoryNodes={};
for(const kind of ['bag','ticket']){
  const name='bus_woman_'+kind,joint=json.nodes.length;accessoryNodes[kind]=joint;json.nodes.push({name:name+'_joint',translation:[0,0,0],rotation:[0,0,0,1]});json.scenes[0].nodes.push(joint);
  const skin=json.skins.length;json.skins.push({name:name+'_skin',joints:[joint],inverseBindMatrices:accessor([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],'MAT4')});
  const mesh=json.meshes.length;json.meshes.push({name,primitives:primitives(data[kind].meshes,true),extras:{characterAccessory:kind,grip:data[kind].grip,canonicalMaster:'bus-woman-character'}});
  const node=json.nodes.length;json.nodes.push({name,mesh,skin});json.scenes[0].nodes.push(node);
}
const sourceClips=[];
for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS)){
  const frames=Math.round(duration*30)+1,times=Array.from({length:frames},(_,i)=>i*duration/(frames-1)),input=accessor(times,'SCALAR'),poses=times.map(t=>busWomanPose(mode,t));
  const animation={name:'bus_woman_'+mode.replaceAll('-','_'),samplers:[],channels:[]};
  function channel(node,path,values){const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(values,path==='rotation'?'VEC4':'VEC3'),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node,path}});}
  for(let i=0;i<data.bones.length;i++)for(const path of ['translation','rotation'])channel(joints[i],path,poses.flatMap(p=>p.joints[data.bones[i].name][path]));
  for(const kind of ['bag','ticket'])for(const path of ['translation','rotation'])channel(accessoryNodes[kind],path,poses.flatMap(p=>p.attachments[kind][path]));
  json.animations.push(animation);
  sourceClips.push({name:animation.name,mode,duration,times,poses:poses.map(p=>({joints:p.joints,attachments:p.attachments}))});
}
while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}json.buffers=[{byteLength:cursor}];let js=Buffer.from(JSON.stringify(json));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);const bin=Buffer.concat(bins),total=12+8+js.length+8+bin.length,header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([header,js,bh,bin]);
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
for(const entry of asset.entries)for(const [mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(const seconds of [0,duration*.25,duration*.5,duration])sampleCharacterPose(asset,entry,{clip:'bus_woman_'+mode.replaceAll('-','_'),time:seconds,loop:false});
const output=path.join(root,'public/assets/bus-woman-character.glb');fs.writeFileSync(output,bytes);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const stats={version:2,design:data.design,canonicalAliases:['exterior_bus_woman','outskirts_bus_woman'],accessories:['bus_woman_bag','bus_woman_ticket'],bytes:bytes.length,sha256,body:data.stats,materialCount:json.materials.length,bodyPrimitiveCount:bodyPrimitives.length,clips:Object.fromEntries(Object.entries(BUS_WOMAN_CLIPS).map(([mode,seconds])=>['bus_woman_'+mode.replaceAll('-','_'),seconds])),coordinateSystem:'metres, Y up, forward -Z',newScenePlacements:0};
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(retained,'clips.json'),JSON.stringify(sourceClips));
fs.writeFileSync(path.join(retained,'stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.copyFileSync(path.join(retained,'provenance.json'),path.join(folder,'provenance.json'));
fs.writeFileSync(path.join(folder,'LICENSE.ASSETS.md'),'# Bus woman character assets\n\nRetained MakeHuman anatomical and garment source data: CC0-1.0. Original production tailoring, geometry, character performance and accessory design: project-authored. See provenance.json for source URLs, licenses and hashes.\n\nThe two body aliases share one anatomical master. This package authors no scene placements.\n');
console.log(JSON.stringify({output,...stats},null,2));
