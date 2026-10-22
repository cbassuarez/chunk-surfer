// Isolated street population pack. Never rebuilds the conservatory, pub,
// academic or named-vigil packs. Exact library geometry is stored only once.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStreetCrowdLibrary,add,sub,mul,rotate,rigid,tube,ellipsoid,lathe,sheet,compact} from './characters/street-crowd-library.mjs';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../../src/data/source-last-reception-resident-rigs.js';
import {STREET_CROWD_DESIGNS as DESIGNS} from '../../src/data/street-crowd-characters.js';
import {streetCrowdPose} from '../../src/render/street-crowd-performance.js';
import {parseCharacterAsset} from '../../src/render/character-asset.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const library=await loadStreetCrowdLibrary(root);
function writer(label){
  const gltf={asset:{version:'2.0',generator:label},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],materials:[],buffers:[],bufferViews:[],accessors:[]},chunks=[],cache=new Map();let cursor=0,reuses=0;
  function accessor(values,type,componentType=5126,target){
    const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type],C=componentType===5126?Float32Array:componentType===5123?Uint16Array:Uint8Array;
    if(values.some(v=>!Number.isFinite(v)))throw Error('Non-finite street crowd geometry');
    const typed=new C(values),bytes=Buffer.from(typed.buffer),key=type+':'+componentType+':'+target+':'+sha(bytes);if(cache.has(key)){reuses++;return cache.get(key);}
    while(cursor%4){chunks.push(Buffer.alloc(1));cursor++;}const view=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);cursor+=bytes.length;
    const a={bufferView:view,componentType,count:values.length/width,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){a.min[i%3]=Math.min(a.min[i%3],values[i]);a.max[i%3]=Math.max(a.max[i%3],values[i]);}}
    gltf.accessors.push(a);const index=gltf.accessors.length-1;cache.set(key,index);return index;
  }
  function material(name,color,role,roughness=.91,metallic=0){const i=gltf.materials.length;gltf.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],roughnessFactor:roughness,metallicFactor:metallic},doubleSided:true,extras:{characterRole:role}});return i;}
  function primitives(meshes,{skinned=true}={}){
    const groups=new Map();for(const m of meshes){const out=groups.get(m.material)||{positions:[],normals:[],indices:[],skinIndex:[],skinWeight:[]};if(!groups.has(m.material))groups.set(m.material,out);const offset=out.positions.length/3;out.positions.push(...m.positions);out.normals.push(...m.normals);out.indices.push(...m.indices.map(v=>v+offset));out.skinIndex.push(...m.skinIndex);out.skinWeight.push(...m.skinWeight);}
    return[...groups].map(([material,m])=>{if(m.positions.length/3>65535)throw Error('Street crowd material budget');return{mode:4,material,indices:accessor(m.indices,'SCALAR',5123,34963),attributes:{POSITION:accessor(m.positions,'VEC3',5126,34962),NORMAL:accessor(m.normals,'VEC3',5126,34962),...(skinned?{JOINTS_0:accessor(m.skinIndex,'VEC4',5121,34962),WEIGHTS_0:accessor(m.skinWeight,'VEC4',5126,34962)}:{})}};});
  }
  function write(file){
    const bin=Buffer.concat(chunks);gltf.buffers=[{byteLength:bin.length}];const json=Buffer.from(JSON.stringify(gltf)),jp=Buffer.alloc((4-json.length%4)%4,32),bp=Buffer.alloc((4-bin.length%4)%4),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+jp.length+8+bin.length+bp.length,8);jh.writeUInt32LE(json.length+jp.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length+bp.length);bh.writeUInt32LE(0x004e4942,4);const output=Buffer.concat([header,jh,json,jp,bh,bin,bp]);fs.writeFileSync(root+file,output);return{bytes:output,reusedAccessors:reuses,uniqueAccessors:gltf.accessors.length};
  }
  return{gltf,accessor,material,primitives,write};
}
const w=writer('Chunk Surfer compact anatomical street cast'),{gltf}=w,skins={};
for(const[source,bones]of Object.entries(RIGS)){
  const joints=bones.map(b=>{const i=gltf.nodes.length;gltf.nodes.push({name:`street_${source}_${b.name}`,translation:b.head});gltf.scenes[0].nodes.push(i);return i;});skins[source]=gltf.skins.length;gltf.skins.push({name:`street_${source}_skin`,joints,inverseBindMatrices:w.accessor(bones.flatMap(b=>[1,0,0,0,0,1,0,0,0,0,1,0,-b.head[0],-b.head[1],-b.head[2],1]),'MAT4')});
}
function attach(mesh,d,side,pose){
  const bone=RIGS[d.source].findIndex(b=>b.name===`hand_${side}`),rest=RIGS[d.source][bone],p=pose.joints[`street_${d.source}_${rest.name}`],head=add(rest.head,p.translation),inverse=[-p.rotation[0],-p.rotation[1],-p.rotation[2],p.rotation[3]],out={...mesh,positions:[...mesh.positions],normals:[...mesh.normals]};
  for(let v=0;v<out.positions.length;v+=3){const point=out.positions.slice(v,v+3).map((n,i)=>n/pose.scale[i]);out.positions.splice(v,3,...add(rest.head,rotate(sub(point,head),inverse)));out.normals.splice(v,3,...rotate(out.normals.slice(v,v+3).map((n,i)=>n*pose.scale[i]),inverse));}
  out.skinIndex=Array.from({length:out.positions.length/3},()=>[bone,0,0,0]).flat();out.skinWeight=Array.from({length:out.positions.length/3},()=>[1,0,0,0]).flat();return out;
}
function umbrella(d,pose){
  const hand=pose.objects.umbrella.center,center=[hand[0],1.93,-.14],parts=[],points=[],indices=[],rings=6,segments=32;
  for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){
    const t=j/rings,a=k/segments*Math.PI*2,rad=.34*t,scallop=Math.sin(k/segments*Math.PI*8)**2;
    points.push(add(center,[Math.sin(a)*rad,-.18*t*t-.010*scallop*t,Math.cos(a)*rad]));if(j&&k){const v=(j-1)*(segments+1)+k-1;indices.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}
  }
  parts.push({...rigid('sewn eight panel umbrella canopy',points,indices),role:'rubber'});
  for(let k=0;k<8;k++){const a=k/8*Math.PI*2;parts.push({...tube('umbrella radial rib',[center,add(center,[Math.sin(a)*.18,-.052,Math.cos(a)*.18]),add(center,[Math.sin(a)*.34,-.18,Math.cos(a)*.34])],.0025,0,6),role:'metal'});}
  parts.push({...tube('umbrella single steel shaft',[[hand[0],hand[1]-.09,hand[2]],add(center,[0,.025,0])],.006,0,10),role:'metal'});
  parts.push({...tube('curved umbrella rubber grip',[[hand[0],hand[1]+.045,hand[2]],[hand[0],hand[1]-.08,hand[2]],[hand[0]+.025,hand[1]-.105,hand[2]],[hand[0]+.049,hand[1]-.08,hand[2]]],.011,0,10),role:'rubber'});
  return parts.map(m=>attach(m,d,'R',pose));
}
function accessories(d,pose){
  const parts=[],push=(mesh,role,side)=>parts.push({...attach(mesh,d,side,pose),role});
  if(d.accessory==='umbrella')return umbrella(d,pose);
  if(d.accessory==='flask'){
    const base=add(pose.objects.flask.center,[0,-.155,0]);push(lathe('vacuum flask rounded steel body',[[0,0],[.047,0],[.061,.02],[.061,.255],[.050,.28],[0,.28]],base), 'scarf','L');
    push(lathe('vacuum flask metal shoulder and cup lid',[[0,.255],[.049,.255],[.049,.31],[0,.31]],base),'metal','L');
    for(const y of[.08,.15,.22])push(lathe('flask broad tartan band',[[.061,y],[.062,y],[.062,y+.009],[.061,y+.009]],base),'trim','L');
    push(lathe('stacked paper cups',[[0,0],[.034,0],[.045,.085],[.042,.085],[.030,.009],[0,.009]],add(pose.objects.cup.center,[0,-.0425,0])),'paper','R');
    for(const y of[.04,.05,.06,.07])push(lathe('paper cup nested rolled rim',[[.041,y],[.045,y],[.045,y+.004],[.041,y+.004]],add(pose.objects.cup.center,[0,-.0425,0])),'paper','R');
  }else if(d.accessory==='pamphlets'){
    for(const n of[0,1,2])push(sheet('creased held campaign photocopy',add(pose.objects.pamphlets.center,[0,0,-n*.003]),[.19,.265],0,{rows:6,cols:5,curve:.003}),'paper','L');
    const bagCenter=pose.objects.bag.center,bagGrip=pose.objects.bag.grip;push(sheet('soft carrier bag front',add(bagCenter,[0,0,-.035]),[.23,.30],0,{rows:8,cols:7,curve:.014}),'paper','R');push(sheet('soft carrier bag back',add(bagCenter,[0,0,.035]),[.23,.30],0,{rows:8,cols:7,curve:.013}),'paper','R');
    push(tube('carrier bag oval loop',[add(bagGrip,[-.07,-.095,0]),add(bagGrip,[-.055,0,0]),add(bagGrip,[.055,0,0]),add(bagGrip,[.07,-.095,0])],.007,0,8),'paper','R');
  }else if(d.accessory==='camera'){
    const c=pose.objects.camera.center;push(ellipsoid('compact video camera rounded housing',c,[.115,.075,.085],0,{segments:16,rings:8}),'rubber','R');
    push(tube('camera lens barrel',[add(c,[0,0,-.03]),add(c,[0,0,-.16])],[.047,.045],0,20),'rubber','R');
    push(tube('camera lens glass', [add(c,[0,0,-.162]),add(c,[0,0,-.164])],.035,0,20),'glass','R');
    push(tube('camera top carrying handle',[add(c,[-.06,.04,0]),add(c,[-.06,.105,0]),add(c,[.06,.105,0]),add(c,[.06,.04,0])],.009,0,8),'rubber','R');
    push(ellipsoid('camera dim red tally lamp',add(c,[.075,.035,-.075]),[.007,.005,.004],0,{segments:8,rings:5}),'tally','R');
  }else if(d.accessory==='blanket'){
    // The blanket follows the two upper legs, rather than bridging empty air
    // as a static slab when a seated person shifts their weight.
    const scale=pose.scale,source=RIGS[d.source],p=[],indices=[],cols=12,rows=12;
    for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
      const u=k/cols,v=j/rows,physical=[(u-.5)*.49,.53-v*.055,-.12-v*.30],side=u<.5?'L':'R',bone=source.findIndex(b=>b.name==='thigh_'+side),joint=pose.joints[`street_${d.source}_thigh_${side}`],rest=source[bone],inverse=[-joint.rotation[0],-joint.rotation[1],-joint.rotation[2],joint.rotation[3]],head=add(rest.head,joint.translation),point=physical.map((n,i)=>n/scale[i]);
      p.push({point:add(rest.head,rotate(sub(point,head),inverse)),bone});if(j&&k){const a=(j-1)*(cols+1)+k-1;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}
    }
    const blanket=rigid('wool blanket fitted over two seated knees',p.map(v=>v.point),indices);blanket.skinIndex=p.flatMap(v=>[v.bone,0,0,0]);parts.push({...blanket,role:'scarf'});
  }
  return parts;
}
const summary=[];
for(const[id,d]of Object.entries(DESIGNS)){
  const pose=streetCrowdPose(id,{reducedMotion:true}),mats={},colors={skin:d.skin,hair:d.hair,lip:d.skin.map((v,i)=>v*(i===0?.78:.57)),'eye white':[.52,.50,.44],iris:[.075,.055,.035],coat:d.coat,trim:d.coat.map(v=>Math.min(.62,v*1.30+.018)),shirt:d.shirt,trouser:d.trouser,shoe:[.045,.038,.031],scarf:d.scarf||[.29,.21,.10],reflective:[.67,.66,.55],metal:[.23,.24,.22],rubber:[.035,.038,.035],paper:[.65,.61,.49],glass:[.055,.08,.075],tally:[.38,.035,.02]};
  for(const[role,color]of Object.entries(colors))mats[role]=w.material(`${id} ${role}`,color,role,['skin','lip'].includes(role)?.80:role==='glass'?.20:role==='metal'?.46:.92,role==='metal'?.58:0);
  const parts=[...library.parts(d),...accessories(d,pose)].map(m=>compact({...m,material:mats[m.role]}));
  const mesh=gltf.meshes.length;gltf.meshes.push({name:d.mesh,primitives:w.primitives(parts),extras:{identity:id,source:d.source,anatomical:true,forward:[0,0,-1],wardrobe:d.wardrobe,headwear:d.headwear,accessory:d.accessory,posture:d.posture,parts:parts.map(m=>m.name)}});gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({name:d.mesh,mesh,skin:skins[d.source]});
  summary.push({id,mesh:d.mesh,source:d.source,wardrobe:d.wardrobe,headwear:d.headwear,accessory:d.accessory,posture:d.posture,vertices:parts.reduce((n,m)=>n+m.positions.length/3,0),triangles:parts.reduce((n,m)=>n+m.indices.length/3,0),parts:parts.map(m=>m.name)});
}
const characterFile='public/assets/street-crowd-characters.glb',characters=w.write(characterFile);parseCharacterAsset(characters.bytes.buffer.slice(characters.bytes.byteOffset,characters.bytes.byteOffset+characters.bytes.length));

const p=writer('Chunk Surfer street crowd shared folding chair and camera tripod');delete p.gltf.skins;
const steel=p.material('wet folding chair painted steel',[.13,.15,.14],'metal',.70,.32),canvas=p.material('folding chair worn canvas',[.16,.18,.16],'cloth',.96),rubber=p.material('camera tripod matte aluminium',[.045,.055,.05],'metal',.80,.35);
function prop(name,parts,dimensions){const mesh=p.gltf.meshes.length;p.gltf.meshes.push({name,primitives:p.primitives(parts,{skinned:false}),extras:{dimensions,origin:'ground',original:true}});p.gltf.scenes[0].nodes.push(p.gltf.nodes.length);p.gltf.nodes.push({name,mesh});}
const chair=[];for(const x of[-.22,.22])for(const[path,name]of[[[[x,.025,-.22],[x,.45,.18]],'chair crossing leg'],[[[x,.025,.18],[x,.45,-.22]],'chair rear crossing leg'],[[[x,.44,-.20],[x,.89,.14]],'chair backrest upright']])chair.push({...tube(name,path,.012,0,10),material:steel});
chair.push({...tube('folding chair front canvas rail',[[-.23,.45,-.22],[.23,.45,-.22]],.012,0,10),material:steel});chair.push({...tube('folding chair rear canvas rail',[[-.23,.45,.18],[.23,.45,.18]],.012,0,10),material:steel});
const seat=sheet('folding chair soft slung canvas seat',[0,0,0],[.48,.40],0,{rows:8,cols:8,curve:.007});for(let i=0;i<seat.positions.length;i+=3){const [x,y,z]=seat.positions.slice(i,i+3);seat.positions.splice(i,3,x,.475-Math.abs(z),y-.02);seat.normals.splice(i,3,0,1,0);}chair.push({...seat,material:canvas});
chair.push({...sheet('folding chair fabric back',[0,.70,.15],[.46,.35],0,{rows:8,cols:8,curve:.005}),material:canvas});prop('street_crowd_folding_chair',chair,[.50,.91,.46]);
const tripod=[];for(const a of[0,Math.PI*2/3,Math.PI*4/3])tripod.push({...tube('telescoping camera tripod leg',[[.20+Math.cos(a)*.23,.015,-.22+Math.sin(a)*.23],[.20,1.24,-.22]],.012,0,10),material:rubber});tripod.push({...tube('camera tripod central riser',[[.20,.88,-.22],[.20,1.38,-.22]],.015,0,10),material:rubber});tripod.push({...ellipsoid('tripod tilting pan head',[.20,1.38,-.22],[.055,.035,.044],0,{segments:12,rings:6}),material:rubber});prop('street_crowd_camera_tripod',tripod,[.46,1.415,.46]);
const propFile='public/assets/street-crowd-props.glb',props=p.write(propFile);
const sourceFiles=['tools/chunk_surfer/build-street-crowd-characters.mjs','tools/chunk_surfer/characters/street-crowd-library.mjs','src/data/street-crowd-characters.js','src/render/street-crowd-performance.js','public/assets/academic-society-characters.glb','public/assets/recordist-characters/contractor.json','artifacts/bus-woman-production/anatomy.json'];
const receipt={version:1,source:'Retained CC0 MakeHuman anatomy and project-authored faces, fitted five-style wardrobe, shared rigs and rounded street kit.',license:'CC0 anatomical sources: tools/chunk_surfer/character-sources/makehuman/LICENSE.ASSETS.md',sourceSha256:Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(root+file))])),packs:[{file:characterFile,bytes:characters.bytes.length,sha256:sha(characters.bytes)},{file:propFile,bytes:props.bytes.length,sha256:sha(props.bytes)}],shared:{rigs:2,jointsPerRig:54,wardrobeStyles:5,uniqueAccessors:characters.uniqueAccessors,reusedAccessors:characters.reusedAccessors,geometryLibraryEntries:library.cache.size},characters:summary,simplification:library.stats};
fs.writeFileSync(root+'public/assets/street-crowd-characters.credits.json',JSON.stringify(receipt,null,2)+'\n');
fs.writeFileSync(root+'public/assets/street-crowd-characters.stats.json',JSON.stringify({characters:summary.map(({parts,...c})=>c),shared:receipt.shared,characterBytes:characters.bytes.length,propBytes:props.bytes.length,totalTriangles:summary.reduce((n,c)=>n+c.triangles,0)},null,2)+'\n');
console.log(JSON.stringify({characters:20,shared:receipt.shared,characterBytes:characters.bytes.length,propBytes:props.bytes.length,totalTriangles:summary.reduce((n,c)=>n+c.triangles,0)}));
