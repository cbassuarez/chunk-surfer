import fs from 'node:fs';
import crypto from 'node:crypto';

const packUrl=new URL('../../../public/labs/chunk-surfer/assets/conservatory-props.glb',import.meta.url);
const statsUrl=new URL('../../../public/labs/chunk-surfer/assets/conservatory-props.stats.json',import.meta.url);
const creditsUrl=new URL('../../../public/labs/chunk-surfer/assets/conservatory-props.credits.json',import.meta.url);
const bytes=fs.readFileSync(packUrl),stats=JSON.parse(fs.readFileSync(statsUrl,'utf8')),credits=JSON.parse(fs.readFileSync(creditsUrl,'utf8'));
let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

ck('GLB header is version 2',bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2);
ck('GLB byte length is truthful',bytes.readUInt32LE(8)===bytes.length,`${bytes.length} bytes`);
const jsonBytes=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonBytes).toString('utf8'));
const unsupported=['animations','skins','extensionsUsed','extensionsRequired'].filter((k)=>json[k]?.length);
ck('offline pack removes unsupported runtime features',unsupported.length===0,unsupported.join(',')||'strict subset');
ck('every primitive is indexed',json.meshes.every((m)=>m.primitives.every((p)=>Number.isInteger(p.indices))));
ck('every primitive supplies positions and normals',json.meshes.every((m)=>m.primitives.every((p)=>Number.isInteger(p.attributes.POSITION)&&Number.isInteger(p.attributes.NORMAL))));
const heroes=new Set(['hall_seating','hall_structure','chapel_vault']);
ck('repeating meshes stay below 5k triangles',Object.entries(stats.meshes).every(([name,m])=>heroes.has(name)||m.triangles<5000));
ck('hero meshes stay below 40k triangles',Object.values(stats.meshes).every((m)=>m.triangles<40000));
ck('unique geometry stays below 150k triangles',stats.totalTriangles<150000,`${stats.totalTriangles} triangles`);
ck('initial transfer stays below 15 MB',bytes.length<15*1024*1024,`${(bytes.length/1024).toFixed(1)} KB`);
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
ck('credits bind to the exact pack',credits.pack.sha256===sha,sha);
ck('every packed mesh has bounds and triangle provenance',credits.meshes.length===json.meshes.length&&credits.meshes.every((m)=>m.bounds?.min?.length===3&&m.bounds?.max?.length===3&&m.triangles>0));
ck('unverified downloads are explicitly rejected',credits.rejectedIntake.every((s)=>s.license==='unverified'&&s.meshName===null));

if(!pass){console.error('\n❌ GLB FAILURES');process.exit(1);}
console.log('\n✅ GLB PASSED');
