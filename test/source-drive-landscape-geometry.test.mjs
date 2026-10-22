import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {makeCutScene,cutColliders} from '../src/game/source-drive/cut/scene.js';
import {makeCutLandscape,CUT_THORAX_CHAMBERS,CUT_TRAILING_RIBS,CUT_WAVE_LAYOUT,CUT_COASTAL_TRANSITIONS,CUT_WAVE_SOUND_ANCHORS} from '../src/game/source-drive/cut/landscape-scene.js';
import {heldWavePose} from '../src/game/source-drive/cut/landscape-motion.js';
import {roadSurfaceAt,worldAt} from '../src/game/source-drive/road.js';
import {containsDrivePose} from '../src/game/source-drive/route-boundaries.js';
const bytes=readFileSync(new URL('../artifacts/source-drive-study/cut/cut-landscape.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)),metrics=JSON.parse(readFileSync(new URL('../artifacts/source-drive-study/cut/landscape-metrics.json',import.meta.url)));
const morphNames=['tension','shear','breath','recoil'];
function position(p,v,weights){const q=Array.from(p.positions.slice(v*3,v*3+3));p.targets.forEach((t,k)=>{for(let c=0;c<3;c++)q[c]+=t.positions[v*3+c]*weights[k];});return q;}
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]-32,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]-32];
const state=(d=850,far=d,time=70)=>{const p=worldAt(d,-1.35);return{x:p.x,z:p.z,heading:p.heading,furthest:far,programTime:time};};

test('the canonical and study character pack are identical, finite and use the real four-target pipeline',()=>{
 assert.deepEqual(readFileSync(new URL('../public/assets/source-drive/cut/cut-landscape.glb',import.meta.url)),bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),metrics.sha256);assert.equal(asset.entries.length,16);assert.ok(bytes.length<12*1024*1024);assert.ok(Object.values(metrics.checks).every(Boolean));
 for(const entry of asset.entries){assert.deepEqual(entry.morphNames,morphNames);const pose=sampleCharacterPose(asset,entry,{morphs:{tension:1,shear:1,breath:1,recoil:1}});assert.ok([...pose.bones,...pose.morphs].every(Number.isFinite));}
 const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength));for(const material of doc.materials){assert.equal(material.extras.studyLocalFinish,true);assert.equal(material.extras.materialFactors,'gltf');assert.ok(material.normalTexture);assert.ok(material.pbrMetallicRoughness.baseColorTexture);assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);assert.equal(material.alphaMode??'OPAQUE','OPAQUE');if(['fascia','membrane','cavity'].includes(material.extras.cutRole))assert.equal(material.extras.cutTissue,true);}
});

test('all16 authored target corners preserve a generous vehicle and bay opening in the smallest chamber',()=>{
 let lowest=Infinity,vertices=0;for(const entry of asset.entries.filter(e=>!e.name.includes('wave')&&!e.name.includes('littoral')&&!e.name.includes('costal_')))for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++)for(let bits=0;bits<16;bits++){const q=position(p,v,morphNames.map((_,k)=>(bits>>k)&1));if(Math.abs(q[0])<7.2){lowest=Math.min(lowest,q[1]);vertices++;}}
 assert.ok(vertices>50000);assert.ok(lowest*.74>6.8,`smallest vault clearance ${lowest*.74}m`);assert.ok(CUT_THORAX_CHAMBERS.every(c=>c.height>=.74));
 // The entire existing stopping choice remains legal; geometry adds no road
 // collider, trigger, deadline, dismount or precision parking requirement.
 for(let d=839;d<=883;d++){const p=worldAt(d,-4.6);assert.equal(containsDrivePose({x:p.x,z:p.z,heading:p.heading}),true);}
});

test('the wave actually unfolds from low terrain, while foot positions remain fixed',()=>{
 const wave=asset.entries.find(e=>e.name==='cut_wave_surface');let baseMax=-Infinity,fullMax=-Infinity,fixedFeet=0,moved=0;
 for(const p of wave.primitives)for(let v=0;v<p.vertexCount;v++){const base=position(p,v,[0,0,0,0]),full=position(p,v,[0,0,1,0]);baseMax=Math.max(baseMax,base[1]);fullMax=Math.max(fullMax,full[1]);if(base[1]<-3.999){assert.deepEqual(full,base);fixedFeet++;}if(Math.hypot(...full.map((x,i)=>x-base[i]))>10)moved++;}
 assert.ok(baseMax<13,`ordinary bank maximum ${baseMax}`);assert.ok(fullMax>36);assert.ok(fixedFeet>100);assert.ok(moved>4000,'broad silhouette changes through actual vertices');
 const evo={wave:1,reveal:1,ribcage:1},a=heldWavePose({timeSec:70,furthest:850,evolution:evo}),b=heldWavePose({timeSec:180,furthest:850,evolution:evo});assert.equal(a.morphs.breath,1);assert.equal(b.morphs.breath,1);
});

test('ordinary, half-curled and full wave remain outside the physical flank at their real road placement',()=>{
 const scene=makeCutLandscape(state()),waveProps=scene.props.filter(p=>p.mesh.includes('wave'));let closest=-Infinity;
 for(const prop of waveProps){const entry=asset.entries.find(e=>e.name===prop.mesh);assert.equal(prop.cullRadius,CUT_WAVE_LAYOUT.maximumCullRadius);for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v+=2)for(const shape of[[0,0,0,0],[1,1,.5,1],[1,1,1,1]]){const q=transform(prop.matrix,position(p,v,shape)),surface=roadSurfaceAt(q[0],q[2]);closest=Math.max(closest,surface.offset);assert.ok(surface.offset< -9.5,`${prop.mesh} entered shoulder at ${surface.distance}/${surface.offset}`);}}
 assert.ok(closest< -10,'the closest suspended lip still leaves the bay and shoulder clear');
});

test('landscape reveal persists on reverse; paused simulation and fixed roots reproduce the same pose',()=>{
 const evolution={reveal:1,ribcage:1,wave:1,backtrack:0,hold:0,stage:'thorax'},ahead=makeCutLandscape(state(850,900,70),evolution),back=makeCutLandscape(state(720,900,70),{...evolution,backtrack:1});for(const prop of ahead.props){const other=back.props.find(p=>p.id===prop.id);if(other)assert.deepEqual(other,prop);}
 assert.deepEqual(makeCutLandscape(state(850,900,70),evolution),ahead);const later=makeCutLandscape(state(850,900,80),evolution);assert.notDeepEqual(later.props.find(p=>p.mesh==='cut_intercostal_sheet').character.morphs,ahead.props.find(p=>p.mesh==='cut_intercostal_sheet').character.morphs);
 for(const prop of ahead.props.filter(p=>p.character.motion))assert.deepEqual(prop.character.motion.rootTranslation,[0,0,0]);
});

test('the old white wall is demoted, real open gaps remain, and the final civil approach retains fractured ribs',()=>{
 const scene=makeCutScene(state());assert.equal(scene.props.some(p=>['cut_geology','cut_cavity_depth','cut_ribs'].includes(p.mesh)),false);assert.equal(scene.props.filter(p=>p.mesh==='cut_membrane').length,1);assert.equal(scene.props.filter(p=>p.mesh==='cut_thoracic_bone').length,6);assert.equal(new Set(CUT_THORAX_CHAMBERS.map(c=>c.height)).size,6);assert.ok(CUT_THORAX_CHAMBERS.slice(1).some((c,i)=>c.d-CUT_THORAX_CHAMBERS[i].d!==30));
 const end=makeCutScene(state(1120,1120));assert.ok(end.props.some(p=>p.id==='thorax-after-4'));assert.equal(CUT_TRAILING_RIBS.at(-1).d,1134);assert.deepEqual(cutColliders(state()),[],'obsolete inset boxes do not become invisible contacts in front of the real toe');
});

test('production and study landscape source mirrors are byte-identical',()=>{
 for(const file of['scene.js','landscape-scene.js','landscape-motion.js','costal-geometry.js'])assert.equal(readFileSync(new URL('../src/game/source-drive/cut/'+file,import.meta.url),'utf8'),readFileSync(new URL('../artifacts/source-drive-study/cut/'+file,import.meta.url),'utf8'));
});


test('wave strakes and roadside half ribs establish the same anatomy before the first bilateral vault',()=>{
 assert.ok(asset.entries.some(e=>e.name==='cut_wave_strakes'));assert.ok(metrics.meshes.find(m=>m.name==='cut_wave_strakes').triangles>5000);
 const before=CUT_COASTAL_TRANSITIONS.filter(x=>x.phase==='approach');assert.deepEqual(before.map(x=>x.d),[606,663,715,750]);assert.ok(before.every(x=>Math.abs(x.lateral)>=9.5));assert.ok(before.slice(0,3).every(x=>x.flip));assert.equal(before.at(-1).flip,false);
 const after=CUT_COASTAL_TRANSITIONS.filter(x=>x.phase==='aftermath');assert.deepEqual(after.map(x=>x.d),[987,1083]);assert.ok(after.every(x=>x.height<.5));
 const scene=makeCutLandscape(state(650));assert.equal(scene.props.filter(x=>x.mesh==='cut_wave_strakes').length,1);assert.ok(scene.props.some(x=>x.id.startsWith('coast-held-sheet-')));
});

test('the bilateral structure unfolds from rooted outward halves rather than starting as a complete portal',()=>{
 const entry=asset.entries.find(e=>e.name==='cut_thoracic_bone');let feet=0,moved=0,baseOverRoad=0;
 for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++){const base=position(p,v,[0,0,0,0]),full=position(p,v,[0,0,1,0]);if(base[1]<1.2){assert.deepEqual(base,full);feet++;}if(Math.hypot(...full.map((x,k)=>x-base[k]))>10)moved++;if(Math.abs(base[0])<7.2)baseOverRoad++;}
 assert.ok(feet>100);assert.ok(moved>1500);assert.equal(baseOverRoad,0,'ordinary splayed rib halves leave the centre open');
 const spine=asset.entries.find(e=>e.name==='cut_sternum');for(const p of spine.primitives)for(let v=0;v<p.vertexCount;v++)for(const curl of[0,.25,.5,.75,1])assert.ok(position(p,v,[0,0,curl,0])[1]>9,'the moving axial mass always stays well above the van');
});

test('every transitional and aftermath morph corner stays outside the exact physical road and open bay',()=>{
 const scene=makeCutLandscape(state(850,1120)),transitions=scene.props.filter(x=>x.mesh.startsWith('cut_littoral'));let sampled=0;
 for(const prop of transitions){const entry=asset.entries.find(e=>e.name===prop.mesh);for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++)for(let bits=0;bits<16;bits++){const q=transform(prop.matrix,position(p,v,morphNames.map((_,k)=>(bits>>k)&1))),surface=roadSurfaceAt(q[0],q[2]);assert.ok(Math.abs(surface.offset)>7.5,`${prop.id} entered road at${surface.distance}/${surface.offset}`);sampled++;}}
 assert.equal(transitions.length,18,'all six three-layer coastal kits are checked');assert.ok(sampled>0);
});

test('physical sound anchors follow actual submitted shapes and the nearest patch of the long wave',()=>{
 assert.deepEqual(CUT_WAVE_SOUND_ANCHORS,metrics.soundAnchors);
 for(const d of[650,760,850]){const scene=makeCutLandscape(state(d,850),{reveal:1,wave:1,ribcage:1}),water=scene.sources.find(s=>s.id==='cut-held-ocean'),car=worldAt(d,-1.35);assert.equal(water.motion.kind,'water');assert.ok(water.world.every(Number.isFinite));assert.ok(Math.hypot(water.world[0]-32-car.x,water.world[1]-1.65-car.y,water.world[2]-32-car.z)<56,'the source is the near part of a327m wave, not its distant centre');assert.deepEqual(water.morphs,scene.props.find(p=>p.mesh==='cut_wave_surface').character.morphs);assert.ok(water.motion.load);}
 const scene=makeCutLandscape(state());for(const source of scene.sources){assert.ok(['water','anatomy'].includes(source.motion.kind));assert.ok(source.motion.load);assert.ok(Number.isFinite(source.motion.distance));assert.ok(Number.isFinite(source.motion.timeSec));assert.ok(Number.isFinite(source.motion.furthest));}
});

test('the complete structural unfolding path clears the van, including intermediate macro weights',()=>{
 let minimum=Infinity,checked=0;const entries=asset.entries.filter(e=>['cut_thoracic_bone','cut_sternum','cut_intercostal_depth','cut_intercostal_sheet','cut_periosteum'].includes(e.name));
 for(const entry of entries)for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++)for(let corners=0;corners<8;corners++){
  const w=[corners&1,(corners>>1)&1,0,(corners>>2)&1],a=position(p,v,w);w[2]=1;const b=position(p,v,w),dx=b[0]-a[0];let lo=0,hi=1;
  if(Math.abs(dx)<1e-10){if(Math.abs(a[0])>7.2)continue;}else{const left=(-7.2-a[0])/dx,right=(7.2-a[0])/dx;lo=Math.max(0,Math.min(left,right));hi=Math.min(1,Math.max(left,right));if(lo>hi)continue;}
  minimum=Math.min(minimum,a[1]+(b[1]-a[1])*lo,a[1]+(b[1]-a[1])*hi);checked++;
 }
 assert.ok(checked>10000);assert.ok(minimum*.74>6.8,`swept unfolding clearance${minimum*.74}m`);
});
