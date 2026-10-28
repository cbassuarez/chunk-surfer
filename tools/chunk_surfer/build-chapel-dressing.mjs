// Dedicated original chapel pack; never reads/writes conservatory-props.glb.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CHAPEL_DRESSING_MESH, CHAPEL_DRESSING_BUDGET } from '../../src/data/chapel-dressing.js';
import { parseGlb, encodeGlb } from './rebuild-tree-crowns.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'public/assets/chapel-dressing.glb');
// An additive ceiling pass keeps every existing byte/accessor/material intact.
// Full regeneration remains available by omitting this bounded append mode.
const appendCherub=process.argv.includes('--append-cherub');
const preserved=appendCherub?{...parseGlb(fs.readFileSync(out)),stats:JSON.parse(fs.readFileSync(out.replace('.glb','.stats.json'))),sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')}:null;
if(preserved?.json.meshes.some(m=>m.name==='chapel_presence_cherub'))throw Error('Cherub already appended; use a full rebuild to regenerate it');
const work=path.join(root,'artifacts/chapel-dressing');
fs.mkdirSync(work,{recursive:true});
const working=path.join(work,'chapel-dressing.working.glb');
const report=path.join(work,'build.json');
const blender=process.env.BLENDER_BIN||'/Applications/Blender.app/Contents/MacOS/Blender';
const child=cp.spawnSync(blender,['--background','--factory-startup','--python',path.join(import.meta.dirname,'build-chapel-dressing.py'),'--',
  '--output',working,'--report',report,'--blend',path.join(work,'chapel-dressing.blend')],{encoding:'utf8',maxBuffer:8*1024*1024});
fs.writeFileSync(path.join(work,'build.log'),`${child.stdout||''}\n${child.stderr||''}`);
if(child.error)throw child.error;
if(child.status!==0)throw new Error(`Chapel Blender build exited ${child.status}; see ${work}/build.log`);
let {json,bin}=parseGlb(fs.readFileSync(working));
const strip=v=>{if(!v||typeof v!=='object')return;delete v.extensions;delete v.extras;for(const x of Object.values(v))strip(x);};
delete json.extensionsUsed;delete json.extensionsRequired;strip(json);
if(json.animations||json.skins||json.accessors.some(a=>a.sparse))throw Error('Dynamic GLB unsupported');
if(json.nodes.some(n=>n.matrix||n.translation||n.rotation||n.scale||n.children?.length))throw Error('Flat identity roots required');
const names=json.meshes.map(m=>m.name).sort(),expected=Object.values(CHAPEL_DRESSING_MESH).sort();
if(JSON.stringify(names)!==JSON.stringify(expected))throw Error(`Mesh catalogue mismatch ${names}`);
for(const m of json.meshes)for(const p of m.primitives)if((p.mode??4)!==4||!Number.isInteger(p.indices)||!Number.isInteger(p.attributes.NORMAL))throw Error(`Unsupported ${m.name}`);
let built=JSON.parse(fs.readFileSync(report));
if(built.singingFace?.oralRays?.length!==3||built.singingFace.oralRays.some(r=>r.hit[2]<-.075||!r.material.includes('oral cavity')))throw Error('Singing mouth must be an actual recessed cavity');
if(preserved){
  const source=json,sourceBin=bin,newMesh=structuredClone(source.meshes.find(m=>m.name==='chapel_presence_cherub'));
  const destination=preserved.json,blocks=[preserved.bin],views=new Map(),accessors=new Map(),materials=new Map();
  let cursor=preserved.bin.length;
  const copyAccessor=index=>{
    if(accessors.has(index))return accessors.get(index);
    const a=structuredClone(source.accessors[index]),old=a.bufferView;
    if(!views.has(old)){
      const view=source.bufferViews[old],offset=(cursor+3)&~3;
      if(offset>cursor)blocks.push(Buffer.alloc(offset-cursor));
      blocks.push(sourceBin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));
      views.set(old,destination.bufferViews.length);
      destination.bufferViews.push({...view,buffer:0,byteOffset:offset});cursor=offset+view.byteLength;
    }
    a.bufferView=views.get(old);accessors.set(index,destination.accessors.length);destination.accessors.push(a);
    return accessors.get(index);
  };
  for(const primitive of newMesh.primitives){
    primitive.indices=copyAccessor(primitive.indices);
    primitive.attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([name,index])=>[name,copyAccessor(index)]));
    const old=primitive.material;
    if(!materials.has(old)){
      const material=source.materials[old],match=destination.materials.findIndex(m=>JSON.stringify(m)===JSON.stringify(material));
      materials.set(old,match<0?destination.materials.length:match);
      if(match<0)destination.materials.push(material);
    }
    primitive.material=materials.get(old);
  }
  const meshIndex=destination.meshes.length,nodeIndex=destination.nodes.length;
  destination.meshes.push(newMesh);destination.nodes.push({name:newMesh.name,mesh:meshIndex});
  destination.scenes[destination.scene||0].nodes.push(nodeIndex);
  bin=Buffer.concat(blocks);destination.buffers[0].byteLength=bin.length;json=destination;
  if(!bin.subarray(0,preserved.bin.length).equals(preserved.bin))throw Error('Additive pack changed existing binary prefix');
  const cherub=built.meshes.chapel_presence_cherub;
  built={...preserved.stats,meshes:{...preserved.stats.meshes,chapel_presence_cherub:cherub},triangles:preserved.stats.triangles+cherub.triangles,
    pivots:{...preserved.stats.pivots,cherub:built.pivots.cherub},preservedPack:{sha256:preserved.sha256,meshes:preserved.json.meshes.length-1,exactBinaryPrefixBytes:preserved.bin.length}};
}
if(built.triangles>CHAPEL_DRESSING_BUDGET.packedTriangles)throw Error(`Triangle budget exceeded: ${built.triangles}`);
const bytes=encodeGlb(json,bin);
if(bytes.length>CHAPEL_DRESSING_BUDGET.packBytes)throw Error(`Byte budget exceeded: ${bytes.length}`);
fs.writeFileSync(out,bytes);
fs.writeFileSync(out.replace('.glb','.stats.json'),JSON.stringify({...built,bytes:bytes.length},null,2)+'\n');
fs.writeFileSync(out.replace('.glb','.credits.json'),JSON.stringify({pack:'chapel-dressing',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  source:'Original project-native Blender geometry in tools/chunk_surfer/build-chapel-dressing.py. Anonymous human proportions continue the apparition family in build-props.mjs. Brush paths use the original Ear Room alphabet in build-stop-listening.py. No third-party assets.',
  editorial:'45 congregants (36 seated, nine kneeling), one vested celebrant in orans, two kneeling servers. Ordinary clothed bodies use distinct wool, skin, shirt, shoe and face regions with modeled garment silhouettes. The choir-only head and hinged jaw add a modeled oral cavity. Six sinister winged ceiling presences join the ten existing clingers as visual inhabitants only; they add no watcher or recording difficulty. Named mesh IDs, articulation pivots, hand residue, spent tallow and wall writing are retained. No interaction, lore key or progression state.',
  referenceOnly:[
    {url:'https://www.churchofengland.org/holy-communion',source:'Church of England, Holy Communion',use:'Kneeling during prayer and a coherent shared posture; does not establish this fictional chapel\'s denomination.'},
    {url:'https://www.vatican.va/roman_curia/congregations/ccdds/documents/rc_con_ccdds_doc_20030317_ordinamento-messale_en.html',source:'General Instruction of the Roman Missal, paragraphs 119, 148, 336-339',use:'Celebrant\'s alb/chasuble silhouette, servers\' albs and extended/lifted hands. Shared liturgical visual grammar only; no exact rite or historical date asserted.'},
  ]},null,2)+'\n');
const bounds=Object.fromEntries(Object.entries(built.meshes).map(([name,m])=>[name,m.bounds]));
fs.writeFileSync(path.join(root,'src/data/generated/chapel-dressing-geometry.js'),`// Generated by tools/chunk_surfer/build-chapel-dressing.mjs.\nexport const CHAPEL_DRESSING_BOUNDS=Object.freeze(${JSON.stringify(bounds)});\n// Where each figure part turns, in its body's own runtime metres.\nexport const CHAPEL_PRESENCE_PIVOTS=Object.freeze(${JSON.stringify(built.pivots)});\n`);
console.log(JSON.stringify({file:path.relative(root,out),bytes:bytes.length,triangles:built.triangles,meshes:names.length}));
