import vm from 'node:vm';
import {ST_BRENDANS_PRESENCE_MESH as PRESENCES} from '../src/data/st-brendans-presences.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_DEMOLITION as P} from '../src/data/source-demolition.js';
import {SOURCE_DEMOLITION_GEOMETRY as G} from '../src/data/generated/source-demolition-geometry.js';
import {SOURCE_DEMOLITION_MOTION as M} from '../src/data/generated/source-demolition-motion.js';
import {sourceDemolitionPose,sourceDemolitionInstances as render,sourceDemolitionLights} from '../src/render/source-demolition.js';
import {ST_BRENDANS_PRESENCE_BOUNDS as BODY} from '../src/data/generated/st-brendans-presence-geometry.js';
const options={geometry:G,motion:M};
const frame={visible:true,anchored:true,committed:true,elapsed:P.fillReadyAt,blackness:0,released:false,
 origin:{x:120+P.across,y:P.floor,z:-1000-P.along},roadOrigin:{x:120,z:-1000}};
test('sample interpolation keeps normalized finite poses including antipodal rotations',()=>{
 for(const part of G.parts)for(const t of[0,.13,3.15,7.81,12,80]){
  const pose=sourceDemolitionPose(M.tracks[part.mesh],t,M.sampleHz);
  assert.ok(pose.translation.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...pose.rotation)-1)<1e-6);
 }
 const pose=sourceDemolitionPose({translations:[[0,0,0],[2,4,6]],rotations:[[0,0,0,1],[0,0,0,-1]]},.5,1);
 assert.deepEqual(pose.translation,[1,2,3]);assert.deepEqual(pose.rotation,[0,0,0,1]);
});
test('intact assembly uses all exact original fragments and no new collision',()=>{
 const output=render({...frame,committed:false,elapsed:0},options);
 assert.equal(output.length,G.parts.length+1);assert.ok(output.every(p=>p.noShadow&&p.noReflection&&p.matrix.length===16));
 assert.deepEqual([...output[0].matrix.slice(12,15)],[120+P.across,Math.fround(P.floor),-1000-P.along]);
 for(const p of output)assert.ok([...p.matrix].every(Number.isFinite));
});
test('presences emerge only after verified recesses clear and are world anchored through a head turn',()=>{
 assert.equal(render({...frame,elapsed:3},options).filter(p=>p.sourceStructure==='source-demolition-spirit').length,0);
 const a=render(frame,options),b=render({...frame,viewYaw:Math.PI,player:{x:200,z:99}},options);
 assert.deepEqual(a,b);const ghosts=a.filter(p=>p.sourceStructure==='source-demolition-spirit');
 assert.ok(ghosts.length>30&&ghosts.length<=96);assert.ok(ghosts.every(p=>p.apparitionVariant===14&&!p.structural));
});
test('the pressure field is already held across four depth bands when consumption becomes possible',()=>{
 for(const settings of[{}, {reducedMotion:true}]){
  const a=render(frame,{...options,...settings}),b=render({...frame,elapsed:P.fillReadyAt+P.occupancyBeat},{...options,...settings});
  const curtain=a.filter(p=>p.sourceDemolitionRole==='curtain'),later=b.filter(p=>p.sourceDemolitionRole==='curtain');
  assert.equal(curtain.length,32);assert.deepEqual(curtain,later,'the bank must finish before the walking body can disappear');
  assert.equal(a.filter(p=>p.sourceDemolitionRole==='stream').length,settings.reducedMotion?8:64);
  const along=curtain.map(p=>frame.roadOrigin.z-p.matrix[14]),across=curtain.map(p=>p.matrix[12]-frame.roadOrigin.x);
  assert.equal(new Set(along.map(z=>z.toFixed(1))).size,4);
  assert.ok(Math.min(...along)<P.pocket.from+1&&Math.max(...along)>P.pocket.to-1);
  assert.ok(across.every(x=>Math.abs(x)<P.pocket.halfWidth));
 }
});
test('released source traces lose corporeal proportions into thin sheared pressure without emission',()=>{
 const field=render(frame,options).filter(p=>p.sourceDemolitionRole==='curtain');
 assert.equal(field.length,32);
 for(const p of field){const m=p.matrix,width=Math.hypot(m[0],m[1],m[2]),depth=Math.hypot(m[8],m[9],m[10]);
  assert.ok(width>depth*5,'the settled pressure is flattened rather than a scaled human body');
  assert.ok(Math.abs(m[4])+Math.abs(m[6])>.015,'its height leans across the authored plane');
  assert.deepEqual(p.emissive.slice(0,3),[0,0,0]);assert.ok(p.emissive[3]>.5&&p.emissive[3]<1);
 }
 const bases=field.map(p=>p.matrix[13]);assert.ok(Math.max(...bases)-Math.min(...bases)>1.5,'released pressure has no common floor or upright human rank');
 assert.ok(field.filter(p=>Math.abs(p.matrix[5])/Math.hypot(p.matrix[4],p.matrix[5],p.matrix[6])<.45).length>=6,
  'several elongated strips are groundward rather than upright anatomy');
});
test('every emitted held body is born inside the actual vacated recess before the retained rear wall',()=>{
 const bodies=render(frame,options).filter(p=>p.sourceDemolitionRole);
 for(const spirit of bodies){
  const born=render({...frame,elapsed:spirit.sourceDemolitionBirth},options).find(p=>p.id===spirit.id),b=BODY[born.mesh],m=born.matrix;
  const e=G.emitters.find(e=>e.id===spirit.sourceDemolitionEmitter);
  assert.ok(spirit.sourceDemolitionBirth>=e.availableAt);
  for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]]){
   const worldY=m[1]*x+m[5]*y+m[9]*z+m[13],worldZ=m[2]*x+m[6]*y+m[10]*z+m[14];
   assert.ok(worldY>=P.floor+e.lower&&worldY<=P.floor+e.upper,`${spirit.id} leaves aperture height`);
   assert.ok(frame.origin.z-worldZ<1.8,`${spirit.id} is born through the retained opaque back`);
  }
 }
});
test('reduced settings retain endpoints and bounded crowds; protected recording excludes actors and void',()=>{
 const reduced=render(frame,{...options,reducedMotion:true});assert.ok(reduced.length<=G.parts.length+41);
 const off=render({...frame,blackness:1},{...options,effectsMode:'off'});
 const protectedOutput=render({...frame,blackness:1},{...options,suppressActors:true});
 for(const out of[off,protectedOutput])assert.ok(out.every(p=>p.sourceStructure==='source-demolition'));
 assert.deepEqual(render({...frame,released:true},options),[]);
});

test('reduced motion preserves a controlled held-load interval until its authored release',()=>{
 const part={...G.parts[0],startTime:.1,releaseTime:2.5};
 const geometry={...G,parts:[part],emitters:[]};
 const held=render({...frame,elapsed:2.4},{...options,geometry,reducedMotion:true});
 const intact=render({...frame,elapsed:0},{...options,geometry,reducedMotion:true});
 assert.deepEqual(held,intact,'a delayed support release must not expose the final opening during held weight');
 const final=render({...frame,elapsed:3.51},{...options,geometry,reducedMotion:true});
 assert.notDeepEqual(final[1].matrix,intact[1].matrix);
});
test('nothingness is a finite opaque world box on the same floor, not an eye-attached screen fade',()=>{
 const out=render({...frame,blackness:1},options);assert.equal(out.length,1);
 const box=out[0];assert.equal(box.mesh,G.darkMesh);assert.equal(box.apparitionVariant,13);
 assert.ok(Math.abs(box.matrix[0]-(P.pocket.halfWidth*2+.8))<1e-5);assert.ok(Math.abs(box.matrix[5]-40.8)<1e-5);
 assert.ok(Math.abs(box.matrix[10]-(P.pocket.to-P.pocket.from+.8))<1e-5);
 assert.equal(box.matrix[12],120);assert.equal(box.matrix[14],-1000-(P.pocket.from+P.pocket.to)/2);
 assert.ok(Math.abs(box.matrix[13]-box.matrix[5]/2-(P.floor-.4))<1e-5);
 assert.ok(box.matrix[0]/2>P.pocket.halfWidth+.25,'cell-centre eye offset stays enclosed at the side boundary');
 const shader=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 assert.ok(/if\(vPortrait==13\)\{\s*o=vec4\(0(?:\.0)?,0(?:\.0)?,0(?:\.0)?,1(?:\.0)?\)/.test(shader));
 const code=readFileSync(new URL('../src/render/source-demolition.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/document\.|overlay|framebufferExposure|setCamera/);
});
test('only two fixed bounded lights, no apparition light or shadow cost, disappear with consumption',()=>{
 const lights=sourceDemolitionLights(frame);assert.equal(lights.length,2);
 assert.ok(lights.every(l=>l.radius<=42&&l.castsShadow===false&&Number.isFinite(l.intensity)));
 assert.deepEqual(sourceDemolitionLights({...frame,blackness:1}),[]);
 assert.deepEqual(sourceDemolitionLights({...frame,released:true}),[]);
});

test('the complete encounter is unavailable when any fragment or apparition pose is missing',()=>{
 const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 const from=source.indexOf('export function sourceDemolitionStats()'),to=source.indexOf('export function stBrendansTreatmentStats()',from);
 const h={SOURCE_DEMOLITION_GEOMETRY:G,ST_BRENDANS_PRESENCE_MESH:PRESENCES,pack:{catalog:new Map()}};
 const context=vm.createContext(h);vm.runInContext(source.slice(from,to).replace('export ',''),context);
 for(const n of[G.staticMesh,G.darkMesh,...G.parts.map(p=>p.mesh)])h.pack.catalog.set(n,{});
 assert.equal(context.sourceDemolitionStats().loaded,false,'geometry alone cannot commit an encounter with no escaping bodies');
 for(const n of Object.values(PRESENCES))h.pack.catalog.set(n,{});
 assert.equal(context.sourceDemolitionStats().loaded,true);
 h.pack.catalog.delete(G.parts[0].mesh);assert.equal(context.sourceDemolitionStats().loaded,false);
});
