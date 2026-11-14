import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pressureInstances,pressureSurfaceInstances,HUSH_DENSITY_RENDER} from '../src/render/pressure-volume.js';
import {setPressureInstances,setPressureSurfaceInstances} from '../src/render/props3d.js';
import {freshHushDensityPose} from '../src/game/hush-density-performance.js';

const actor=(extra={})=>({id:'density:1',x:8,y:12,floorH:2.4,heightM:HUSH_DENSITY_RENDER.heightM,strength:.9,
  performance:{version:1,role:'live-pressure',heading:.7,clip:'pressure_advance',time:.5,loop:false,seed:19,
    manifestation:.8,motion:'hunt',density:{...freshHushDensityPose(19),phase:.37,traction:.9,compression:.7}},...extra});

test('every HUSH role uses the same terminal adult body while the human practice tenant stays human',()=>{
  for(const role of ['live-pressure','source-rear','source-front','court-trace','dock-tableau','plant-tableau','plant-hallucination','recording-hallucination','legacy-pressure']){
    const a=actor();a.performance.role=role;
    const [instance]=pressureInstances(a);
    assert.equal(instance.mesh,HUSH_DENSITY_RENDER.core,role);
    assert.ok(instance.character.support.contacts.length===2);
    assert.equal(instance.character.morphs,undefined);
    assert.ok(instance.character.joints.head&&instance.character.joints.chest);
    assert.ok(Object.keys(instance.character.joints).every(name=>!name.startsWith('fold_')));
    assert.equal(setPressureInstances([instance]),1);
    assert.equal(setPressureSurfaceInstances(pressureSurfaceInstances([instance])),1);
  }
  const human=actor();human.performance.role='tenant';
  assert.equal(pressureInstances(human)[0].mesh,'pressure_body');
  assert.deepEqual(pressureSurfaceInstances(pressureInstances(human)),[]);
});

test('density keeps captured root and heading through cues and does not acquire an observer or clock',()=>{
  const a=actor(),original=structuredClone(a),first=pressureInstances(a);
  assert.equal(first[0].x,4.25);assert.equal(first[0].z,6.25);assert.equal(first[0].y,2.4);
  assert.equal(first[0].scale,1);assert.ok(Math.abs(first[0].yaw-.7)<1e-8);
  for(const name of ['step-in','step-back','lean','turn','double','mirror']){
    const cue=structuredClone(a);cue.performance.cue={name,elapsed:1};
    const p=pressureInstances(cue)[0];
    for(const key of ['x','y','z','yaw','scale'])assert.equal(p[key],first[0][key]);
    assert.equal(pressureInstances(cue).length,1,'a visual cue invented another HUSH');
  }
  for(let i=0;i<20;i++)assert.deepEqual(pressureInstances(a),first);
  assert.deepEqual(a,original);assert.ok(Object.isFrozen(first[0].character.joints));
});

test('lit inner surface shares actual palette and full portal transform with the pressure core',()=>{
  const draws=pressureInstances(actor()),matrix=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,7,2,4,1]);
  const clipped={...draws[0],matrix,portalClipPlanes:[[1,0,0,-7]],portalExcludePlanes:[[[0,0,1,-4]]],portalClipId:'seam'};
  const before=structuredClone(clipped),[surface]=pressureSurfaceInstances([clipped]);
  assert.equal(surface.mesh,'hush_density_return');assert.deepEqual(surface.character,clipped.character);
  assert.deepEqual(surface.matrix,Array.from(matrix));assert.deepEqual(surface.portalClipPlanes,clipped.portalClipPlanes);
  assert.deepEqual(surface.portalExcludePlanes,clipped.portalExcludePlanes);assert.equal(surface.portalClipId,'seam');
  assert.equal(surface.noShadow,true);assert.equal(surface.noReflection,true);assert.equal(surface.pressure,undefined);
  assert.deepEqual(clipped,before);assert.ok(Object.isFrozen(surface.matrix));
});

test('diagnostic core and glow use the complete volume, without a second opaque coat',()=>{
  for(const mode of ['core','glow']){
    const p=pressureInstances(actor(),null,{mode});
    assert.equal(p[0].mesh,'hush_density_volume');assert.deepEqual(pressureSurfaceInstances(p),[]);
    assert.equal(p[0].pressure.glow,mode==='glow'?1:0);
  }
  assert.deepEqual(pressureInstances(actor(),null,{mode:'off'}),[]);
  const absent=actor();absent.performance.manifestation=0;assert.deepEqual(pressureInstances(absent),[]);
});

test('only an explicit court reference projects the retained human recording',()=>{
  const a=actor();a.performance.role='court-trace';
  assert.equal(pressureInstances(a).length,1);
  const refs=pressureInstances({...a,referenceTrace:true});
  assert.equal(refs.length,2);assert.equal(refs[0].mesh,'hush_density_core');assert.equal(refs[1].mesh,'pressure_body');
  assert.equal(refs[1].referenceTrace,true);assert.equal(pressureSurfaceInstances(refs).length,1);
  a.performance.role='live-pressure';assert.equal(pressureInstances({...a,referenceTrace:true}).length,1);
});

test('captured clearance never squeezes anatomy and leaves the authoritative root and height alone',()=>{
  const full=pressureInstances(actor())[0],narrow=pressureInstances(actor({clearanceM:.36}))[0];
  assert.equal(narrow.scaleX,1);
  for(const key of ['x','y','z','yaw','scale'])assert.equal(narrow[key],full[key]);
  assert.deepEqual(narrow.character,full.character);assert.equal(pressureSurfaceInstances([narrow])[0].scaleX,narrow.scaleX);
});

test('runtime loads both namespaces and keeps density surfaces independent from scenery, shadows and reflections',()=>{
  const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const p3=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  assert.ok(r3d.includes("const HUSH_BODY_ASSET='assets/hush-density.glb'"));
  assert.ok(r3d.includes("assetUrl('assets/pressure-character.glb')"));
  assert.ok(r3d.includes('P3.setPressureSurfaceInstances(pressureSurfaceInstances(resolvedPressureDraws))'));
  assert.ok(p3.includes('...stillnessReliefDrawInstances,...pressureSurfaceInstances'));
  assert.ok(p3.includes('...pressureInstances,...pressureSurfaceInstances,'));
  assert.ok(p3.includes('if(shadow&&(i.noShadow||i.portalClipPlanes))continue'));
  assert.ok(p3.includes('if(reflection&&(i.noReflection||REFLECTION_SKIP.has(i.mesh)))continue'));
});
