import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {academicAtriumHollowKind as kind,academicAtriumHollowReadability as factor,academicAtriumHollowColor as color,
 ACADEMIC_ATRIUM_HOLLOW_REVEAL as H,ACADEMIC_ATRIUM_LIGHT_GLSL as glsl} from '../src/render/academic-atrium-light.js';
const props=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const meshes=['academic_population_hollow_coat','academic_population_unfinished_visitor'],lit={x:78.2,y:11.6,z:6.4},dark={x:65,y:11.6,z:15};
const luma=c=>c.reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);

test('only the two retained hollow mesh bodies opt in; ordinary and named bodies always reset to zero',()=>{
 assert.deepEqual(meshes.map(kind),[1,2]);
 for(const mesh of meshes)assert.ok(json.meshes.some(m=>m.name===mesh));
 for(const name of['academic_population_attendant','academic_population_listener','academic_character_lucien',undefined,'source_hollow_coat','academic_population_hollow_coat_other'])assert.equal(kind(name),0);
});

test('an unlit hollow stays a quarter-strength opaque silhouette and a transmitted fragment restores full detail',()=>{
 for(const meshName of meshes){assert.equal(factor(dark,{enabled:true,meshName}),.25);assert.equal(factor(lit,{enabled:true,meshName}),1);assert.equal(factor(lit,{meshName}),1);}
});

test('shaft adds bounded albedo-and-normal pale detail instead of merely multiplying a black body',()=>{
 for(const meshName of meshes){const mesh=json.meshes.find(m=>m.name===meshName);let count=0;
  for(const p of mesh.primitives){const base=json.materials[p.material].pbrMetallicRoughness.baseColorFactor.slice(0,3),old=[.003,.003,.003],unlit=color(dark,{enabled:true,meshName,base,color:old,normal:[0,0,-1]}),revealed=color(lit,{enabled:true,meshName,base,color:old,normal:[0,0,-1]});
   assert.ok(luma(revealed)>luma(unlit)+.018,`${meshName} material${p.material} stays black despite the actual shaft`);
   assert.ok(revealed.every((v,i)=>Number.isFinite(v)&&v>=old[i]&&v<.65));count++;
  }assert.equal(count,mesh.primitives.length);assert.ok(count>=2);
 }
 const up=color(lit,{enabled:true,meshName:meshes[0],normal:[0,1,0]}),away=color(lit,{enabled:true,meshName:meshes[0],normal:[0,-1,0]});assert.ok(luma(up)>luma(away),'actual surface normals retain shape cues');
});

test('torch inspection is available outside the shaft and never manufactures a face or additional shaft fill',()=>{
 const input={enabled:true,meshName:meshes[1],color:[.08,.06,.04]};
 assert.equal(factor(dark,{...input,torchCharge:1}),1);assert.deepEqual(color(dark,{...input,torchCharge:1}),input.color);
 assert.equal(factor(dark,{...input,torchCharge:0}),.25);assert.equal(factor(dark,{...input,torchCharge:NaN}),.25);
});

test('ordinary residents and Source retain exactly their ordinary material colour even inside the shaft coordinates',()=>{
 for(const meshName of['academic_population_attendant','academic_population_listener','source_hollow_coat'])assert.deepEqual(color(lit,{enabled:true,meshName,color:[.15,.23,.08]}),[.15,.23,.08]);
 for(const meshName of meshes)assert.deepEqual(color(lit,{enabled:false,meshName,color:[.15,.23,.08]}),[.15,.23,.08]);
});

test('executed production per-primitive uniform resets after each hollow rather than leaking into the next batch',()=>{
 const statement=props.match(/gl\.uniform1f\(U\('uAcademicHollow'\),academicAtriumHollowKind\(m\.name\)\);/)?.[0];assert.ok(statement);
 const primitiveLoop=props.indexOf('for(const p of m.primitives){',props.indexOf('export function renderPropPass'));
 assert.ok(props.indexOf(statement,primitiveLoop)>primitiveLoop);
 const normalizer=props.match(/function groupMeshName\(key\)\{[^\n]+\}/)?.[0];assert.ok(normalizer);
 const groupMeshName=Function(normalizer+';return groupMeshName;')();
 const calls=[],draw=Function('gl','U','academicAtriumHollowKind','m',statement),gl={uniform1f:(u,v)=>calls.push([u,v])};
 // Actual character batches append a NUL-separated pose key. The lookup must
 // use the resolved mesh object, never this rendering-group identity.
 for(const [i,name]of[meshes[0],'academic_population_listener',meshes[1],'academic_character_celeste'].entries()){
  const group=name+'\0pose-'+i,resolved={name:groupMeshName(group)};draw(gl,n=>n,kind,resolved);
 }
 assert.deepEqual(calls,[['uAcademicHollow',1],['uAcademicHollow',0],['uAcademicHollow',2],['uAcademicHollow',0]]);
});

test('shader changes only colour on retained fragments; source guard, empty apertures and depth ownership remain intact',()=>{
 assert.match(props,/if\(uAcademicHollow>\.5&&uAcademicAtriumLight>\.5\)\s+col=academicAtriumHollowColor/);
 assert.match(props,/lamp\*uLight\*dot\(uTorchColor/);
 assert.match(props,/uAcademicAtriumLight'\),academicAtriumLight&&!sourceRoomLighting\?1:0/);
 const branch=props.slice(props.indexOf('  // The light uncovers'),props.indexOf('  o=vec4(col',props.indexOf('  // The light uncovers')));
 assert.doesNotMatch(branch,/discard|gl_FragDepth|alpha|setTimeout|timeSec/);
 assert.match(props,/o=vec4\(col,uQuietFireEscape/);
 assert.match(glsl,/pale\*0\.72\*shaft\*diffuse/);assert.match(glsl,/if\(uAcademicAtriumLight<\.5\)return color/);assert.equal(H.silhouette,.25);
});
