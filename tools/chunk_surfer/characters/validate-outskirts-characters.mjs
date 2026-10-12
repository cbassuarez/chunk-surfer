// Validate actual exported character data; no fixture or screenshot substitutes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = new URL('../../../public/assets/outskirts-characters.glb',import.meta.url);
const bytes=fs.readFileSync(file), jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl));
const bin=bytes.subarray(28+jl),components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function values(i){const a=j.accessors[i],v=j.bufferViews[a.bufferView];assert(!a.sparse,`accessor${i}: sparse`);const count=a.count*components[a.type],size=a.componentType===5126?4:a.componentType===5123?2:1,base=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:count},(_,k)=>a.componentType===5126?bin.readFloatLE(base+k*size):a.componentType===5123?bin.readUInt16LE(base+k*size):bin.readUInt8(base+k));}
assert(!j.extensionsUsed?.length);assert(!j.extensionsRequired?.length);assert.equal(j.skins.length,1);assert(j.skins[0].joints.length<=48);
for(let i=0;i<j.accessors.length;i++){const a=j.accessors[i];if(a.componentType===5126)assert(values(i).every(Number.isFinite),`accessor${i}: nonfinite float`);}
const summaries=[];
for(const mesh of j.meshes){assert(['outskirts_fold_guard','outskirts_overprint_body'].includes(mesh.name));assert(mesh.primitives.length<=16);let vertices=0,triangles=0;for(const p of mesh.primitives){assert.equal(p.mode??4,4);for(const key of ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])assert(p.attributes[key]!=null,`${mesh.name}: ${key}`);assert.equal(p.targets.length,4);assert(p.indices!=null);vertices+=j.accessors[p.attributes.POSITION].count;triangles+=j.accessors[p.indices].count/3;const w=values(p.attributes.WEIGHTS_0);for(let i=0;i<w.length;i+=4)assert(Math.abs(w[i]+w[i+1]+w[i+2]+w[i+3]-1)<.002,`${mesh.name}: weights not normalized`);}
assert(vertices<=50000,`${mesh.name}: ${vertices} vertices >50000`);summaries.push({name:mesh.name,vertices,triangles,primitives:mesh.primitives.length});}
const durations={fold:12,writhe:24,idle:4,walk:1.1,turn:1.2};
for(const [name,duration]of Object.entries(durations)){const a=j.animations.find(a=>a.name===name);assert(a,`missing ${name}`);assert(a.channels.some(c=>c.target.path==='weights'),`${name}: missing corrective channels`);const end=Math.max(...a.samplers.map(s=>values(s.input).at(-1)));assert(Math.abs(end-duration)<.04,`${name}: duration${end}`);if(name==='writhe'){for(const c of a.channels){const s=a.samplers[c.sampler],v=values(s.output),acc=j.accessors[s.output],stride=components[acc.type]*(c.target.path==='weights'?4:1);for(let i=0;i<stride;i++)assert(Math.abs(v[i]-v[v.length-stride+i])<.0005,`writhe seam:${c.target.node}/${c.target.path}`);}}}
console.log(JSON.stringify({file:file.pathname,bytes:bytes.length,joints:j.skins[0].joints.length,meshes:summaries,clips:j.animations.map(a=>a.name)},null,2));
