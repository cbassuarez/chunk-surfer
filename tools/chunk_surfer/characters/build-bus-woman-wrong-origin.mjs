// Package five authored anatomical reconstructions against the ordinary
// woman's exact flat 54-joint rest. Does not rewrite the ordinary asset.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const retained=path.join(root,'artifacts/bus-woman-wrong-origin');
const data=JSON.parse(fs.readFileSync(path.join(retained,'anatomy.json'),'utf8'));
const canonical=JSON.parse(fs.readFileSync(path.join(root,'artifacts/bus-woman-production/anatomy.json'),'utf8'));
if(JSON.stringify(data.bones)!==JSON.stringify(canonical.bones))throw Error('Wrong origin changes the canonical anatomical rest');
const clips=JSON.parse(fs.readFileSync(path.join(root,'artifacts/bus-woman-production/clips.json'),'utf8'));
const ordinary=path.join(root,'public/assets/bus-woman-character.glb');
const ordinaryHash=crypto.createHash('sha256').update(fs.readFileSync(ordinary)).digest('hex');
const json={asset:{version:'2.0',generator:'Chunk Surfer Wrong origin authored anatomical reconstructions'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],animations:[],buffers:[],bufferViews:[],accessors:[]};
const bins=[];let cursor=0;
function binary(bytes,target){while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}const index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,...(target?{target}:{})});bins.push(bytes);cursor+=bytes.length;return index;}
function accessor(values,type,componentType=5126,target){const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],Ctor=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
 if(!values.length||values.some(v=>!Number.isFinite(v)))throw Error('Invalid Wrong origin accessor');const typed=new Ctor(values),view=binary(Buffer.from(typed.buffer),target),a={bufferView:view,componentType,count:values.length/width,type};
 if(type==='VEC3'||type==='SCALAR'){a.min=Array(width).fill(Infinity);a.max=Array(width).fill(-Infinity);for(let i=0;i<values.length;i++){const k=i%width;a.min[k]=Math.min(a.min[k],values[i]);a.max[k]=Math.max(a.max[k],values[i]);}}
 json.accessors.push(a);return json.accessors.length-1;
}
for(const m of data.materials)json.materials.push({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.baseColor,roughnessFactor:m.roughness??.9,metallicFactor:m.metallic??0},extras:{characterRole:m.role}});
const jointRoot=json.nodes.length;json.nodes.push({name:'bus_woman_root',children:[]});json.scenes[0].nodes.push(jointRoot);
const joints=data.bones.map(b=>{const i=json.nodes.length;json.nodes.push({name:'bus_woman_'+b.name,translation:b.head,rotation:[0,0,0,1]});json.nodes[jointRoot].children.push(i);return i;});
const inverse=data.bones.flatMap(b=>[1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1]);
json.skins.push({name:'wrong_origin_canonical_anatomical_skin',joints,inverseBindMatrices:accessor(inverse,'MAT4')});
const stateStats=[];
for(const state of data.variants){
 const grouped=new Map();
 for(const m of state.meshes){if(!m.indices.length)continue;let a=grouped.get(m.material);if(!a){a={positions:[],normals:[],skinIndex:[],skinWeight:[],indices:[],uv:[]};grouped.set(m.material,a);}const offset=a.positions.length/3;
  for(const key of ['positions','normals','skinIndex','skinWeight'])a[key].push(...m[key]);a.uv.push(...Array(m.positions.length/3*2).fill(0));a.indices.push(...m.indices.map(i=>i+offset));
 }
 const primitives=[...grouped].map(([material,m])=>{if(m.indices.some(i=>i>65535))throw Error('Wrong origin index size');return {mode:4,material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),TEXCOORD_0:accessor(m.uv,'VEC2',5126,34962),JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}};});
 const mesh=json.meshes.length;json.meshes.push({name:state.name,primitives,extras:{identity:'unnamed bus woman',design:'Wrong origin',authoredStage:state.stage,canonicalMaster:'bus-woman-character',forcePath:data.forcePath,permanentOriginAuthority:data.permanentOriginAuthority,shoulderOriginOffset:data.shoulderOriginOffsets?.[state.stage]||[0,0,0],ordinaryAliasUntouched:true,sourceTopology:'retained MakeHuman anatomical master with separately authored closed injury surfaces and cut garment apertures'}});
 const node=json.nodes.length;json.nodes.push({name:state.name,mesh,skin:0});json.scenes[0].nodes.push(node);
 stateStats.push({name:state.name,stage:state.stage,primitives:primitives.length,...state.stats});
}
for(const clip of clips){
 const input=accessor(clip.times,'SCALAR'),animation={name:clip.name,samplers:[],channels:[]};
 for(let i=0;i<data.bones.length;i++)for(const property of ['translation','rotation']){
  const values=clip.poses.flatMap(p=>p.joints[data.bones[i].name][property]),sampler=animation.samplers.length;
  animation.samplers.push({input,output:accessor(values,property==='rotation'?'VEC4':'VEC3'),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node:joints[i],path:property}});
 }
 json.animations.push(animation);
}
while(cursor%4){bins.push(Buffer.alloc(1));cursor++;}json.buffers=[{byteLength:cursor}];let js=Buffer.from(JSON.stringify(json));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);const bin=Buffer.concat(bins),total=12+8+js.length+8+bin.length,header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);const bytes=Buffer.concat([header,js,bh,bin]);
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
for(const entry of asset.entries)for(const clip of clips)for(const time of [0,clip.duration*.25,clip.duration*.5,clip.duration])sampleCharacterPose(asset,entry,{clip:clip.name,time,loop:false});
const output=path.join(root,'public/assets/outskirts-bus-woman-wrong-origin.glb');fs.writeFileSync(output,bytes);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const stats={version:2,design:'Wrong origin',bytes:bytes.length,sha256,canonicalOrdinarySHA256:ordinaryHash,canonicalAnatomySHA256:data.canonicalSHA256,joints:54,morphs:0,states:stateStats,clips:clips.map(c=>({name:c.name,duration:c.duration})),forcePath:data.forcePath,permanentOriginAuthority:data.permanentOriginAuthority,shoulderOriginOffsets:data.shoulderOriginOffsets,coordinates:data.coordinateSystem,ordinaryMasterUnmodified:crypto.createHash('sha256').update(fs.readFileSync(ordinary)).digest('hex')===ordinaryHash};
const folder=path.join(root,'public/assets/outskirts-bus-woman-wrong-origin');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(retained,'validation.json'),JSON.stringify(stats,null,2)+'\n');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'artifacts/bus-woman-production/provenance.json'),'utf8'));
provenance.note='Wrong origin: five authored Outskirts-only anatomical reconstruction states, derived from the same retained CC0 anatomical master. New project-authored injury topology, true opened pectoral cavity, broad muscular/fascial force route, closed inner rims, cut fitted garment openings and selective upper rib exposure. Runtime owns the actual displaced shoulder/mandible pivots against canonical rest-bound anatomy. The ordinary shelter body and its asset are not modified.';
fs.writeFileSync(path.join(folder,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
fs.writeFileSync(path.join(folder,'LICENSE.ASSETS.md'),'# Wrong origin bus woman assets\n\nRetained MakeHuman anatomical source: CC0-1.0. Newly authored anatomical injury topology, fitted garment apertures and characterization: project-authored. See provenance.json.\n\nThe five states are only for the Outskirts alias; ordinary shelter woman stays canonical.\n');
console.log(JSON.stringify({output,...stats},null,2));
