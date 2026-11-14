import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createOutcomeExposureController, normalizeOutcomeExposure,
  sampleOutcomeExposure, outcomeExposureActor,
} from '../src/render/outcome-exposure.js';
import { pressureInstances, HUSH_DENSITY_RENDER } from '../src/render/pressure-volume.js';
import {freshHushDensityPose,stepHushDensityPose} from '../src/game/hush-density-performance.js';
import { parseCharacterAsset, sampleCharacterFrame } from '../src/render/character-asset.js';

const anchor = () => ({ id:'hunter',x:31,y:14,floorH:4.8,heightM:2.18,widthM:.68,strength:.98,
  performance:{version:1,role:'live-pressure',heading:1.2,clip:'pressure_arrest',time:.42,
    loop:false,seed:928,manifestation:1,motion:'hunt',cue:{name:'double',elapsed:.4},reducedMotion:false} });
const event = (elapsed=0,extra={}) => ({eventId:'contact-1',kind:'taken',elapsed,duration:.72,anchor:anchor(),...extra});

test('contact retains a copied real root, scale, bearing and authored rig pose after despawn',()=>{
  const c=createOutcomeExposureController(),body=anchor();
  c.set(event(.12,{anchor:body}));
  body.x=999;body.performance.heading=0;body.performance.time=7;
  const first=c.resolve(null),later=c.resolve({x:200,y:400});
  assert.equal(first.x,31);assert.equal(first.y,14);assert.equal(first.floorH,4.8);
  assert.equal(first.heightM,2.18);assert.equal(first.performance.heading,1.2);
  assert.equal(first.performance.clip,'pressure_arrest');assert.equal(first.performance.time,.42);
  assert.deepEqual(first,later,'new camera/world positions must not drag the retained performer');
  assert.equal(first.performance.cue,null,'one physical body, not cue-driven overprints');
  assert.equal(pressureInstances(first,null).length,1);
  assert.equal(pressureInstances(first,null)[0].mesh,HUSH_DENSITY_RENDER.core);
});

test('no anchor means no fabricated camera-facing body; a live physical anchor can be acquired once',()=>{
  const c=createOutcomeExposureController();c.set(event(.1,{anchor:null,bearing:Math.PI}));
  assert.equal(c.resolve(null),null);
  const first=c.resolve({x:4,y:7,floorH:2,heading:.4});
  assert.equal(first.x,4);assert.equal(first.y,7);
  assert.equal(first.performance.heading,.4,'mesh keeps world heading; relative audio bearing cannot rotate anatomy');
  const later=c.resolve({x:40,y:70});assert.equal(later.x,4);assert.equal(later.y,7);
});

test('one bounded exposure has one broad peak and no flashes in its empty-loss tail',()=>{
  const values=Array.from({length:73},(_,i)=>sampleOutcomeExposure(normalizeOutcomeExposure(event(i/100))).amount);
  const max=Math.max(...values),peak=values.indexOf(max);
  assert.ok(max<=1&&max>.9);
  for(let i=1;i<=peak;i++)assert.ok(values[i]>=values[i-1]);
  for(let i=peak+1;i<values.length;i++)assert.ok(values[i]<=values[i-1]);
  assert.equal(sampleOutcomeExposure(event(.72)).active,false);
  assert.equal(sampleOutcomeExposure(event(1.2)).amount,0);
});

test('reduced effects soften edge radiance without changing actor root/pose or duration',()=>{
  const normal=normalizeOutcomeExposure(event(.12)),soft=normalizeOutcomeExposure(event(.12,{reduced:true}));
  assert.ok(sampleOutcomeExposure(soft).glow<sampleOutcomeExposure(normal).glow);
  assert.deepEqual(sampleOutcomeExposure(normal,{reduceFlash:true}),sampleOutcomeExposure(soft));
  const a=outcomeExposureActor(normal),b=outcomeExposureActor(soft);
  for(const key of ['x','y','floorH','heightM','widthM'])assert.equal(a[key],b[key]);
  assert.equal(a.performance.time,b.performance.time);
  assert.equal(soft.duration,.72);
});

test('cancelled or completed event IDs cannot be revived by late decode/update callbacks',()=>{
  const c=createOutcomeExposureController();
  assert.equal(c.set(event(.2)),true);assert.equal(c.set(null),true);
  assert.equal(c.set(event(.21)),false);assert.equal(c.resolve(anchor()),null);
  assert.equal(c.set(event(.1,{eventId:'contact-2'})),true);
  assert.equal(c.set(event(.72,{eventId:'contact-2'})),true);
  assert.equal(c.set(event(.2,{eventId:'contact-2'})),false);
  assert.equal(c.snapshot(),null);
});

test('sampling is deterministic and render calls never advance the scene clock',()=>{
  const c=createOutcomeExposureController();c.set(event(.2));
  const a=c.resolve(anchor()),b=c.resolve(anchor());assert.deepEqual(a,b);
  assert.equal(c.snapshot().elapsed,.2);
  assert.equal(c.set(event(.1)),false,'out-of-order updates cannot replay contact');
  assert.equal(c.set(event(.25,{kind:'hard'})),false,'one event cannot change outcome kind');
});

test('Last Exposure holds the actual captured travel pose instead of changing its deformation',()=>{
  for(const reducedMotion of [false,true]){
    const body=anchor();let density=freshHushDensityPose(928);
    for(let i=0;i<20;i++)density=stepHushDensityPose(density,{dt:1/60,acceptedMetres:.012,
      acceptedDelta:{x:0,z:-.012},reducedMotion});
    body.performance={...body.performance,density,reducedMotion};
    const live=pressureInstances(body)[0],controller=createOutcomeExposureController();
    controller.set(event(.12,{anchor:body}));
    const captured=pressureInstances(controller.resolve(null))[0];
    assert.deepEqual(captured.character,live.character,'freezing a sampled body must retain its joints and foot support');
    for(const elapsed of [.25,.42,.55]){
      controller.set(event(elapsed,{anchor:{...body,x:900}}));
      const later=pressureInstances(controller.resolve(null))[0];
      assert.deepEqual(later.character,captured.character);
      for(const key of ['x','y','z','yaw','scale','scaleX'])assert.equal(later[key],captured[key]);
    }
  }
});

test('body-off policy and existing hard/taken bounds stay authoritative',()=>{
  assert.equal(normalizeOutcomeExposure(event(0,{kind:'hard',duration:undefined})).duration,.62);
  assert.equal(normalizeOutcomeExposure(event(0,{duration:6})).duration,.72);
  assert.equal(normalizeOutcomeExposure(event(0,{eventId:''})),null);
  assert.equal(normalizeOutcomeExposure(event(NaN)),null);
  assert.equal(pressureInstances(outcomeExposureActor(normalizeOutcomeExposure(event(.2))),null,{mode:'off'}).length,0);
  assert.equal(pressureInstances(outcomeExposureActor(normalizeOutcomeExposure(event(.2))),null,{mode:'core'})[0].pressure.mode,'core');
});

test('a staged catch reaches toward the booth occupant with the shipped hand and planted feet',async()=>{
  const bytes=await readFile(new URL('../public/'+HUSH_DENSITY_RENDER.asset,import.meta.url));
  const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const base=event(.18),render=(message,options)=>pressureInstances(outcomeExposureActor(normalizeOutcomeExposure(message)),null,options)[0];
  const held=render(base),reach=render({...base,grab:true}),soft=render({...base,grab:true},{reducedMotion:true});
  const position=(frame,id)=>Array.from(frame.world[asset.nodes.findIndex(node=>node.name===id)].slice(12,15));
  const heldFrame=sampleCharacterFrame(asset,held.character);
  const reachFrame=sampleCharacterFrame(asset,reach.character);
  const tip=position(reachFrame,'index_R_02');
  assert.ok(tip[0]<.2&&tip[1]>1.35&&tip[2]<-.6,'right fingers move up and forward into the occupied booth');
  assert.deepEqual(position(reachFrame,'foot_R'),position(heldFrame,'foot_R'));
  assert.equal(reach.x,held.x);
  assert.equal(reach.z,held.z);
  assert.equal(soft.character.joints.forearm_R,undefined);
});

test('the real canonical mesh enters shared pressure acquisition before final dither, without a bitmap overlay',async()=>{
  const source=await readFile(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.match(source.match(/const HUSH_BODY_ASSET=[^\n]+/)?.[0]||'',/HUSH_BODY_ASSET='assets\/hush-density\.glb'/);
  const pack=await readFile(new URL('../public/'+HUSH_DENSITY_RENDER.asset,import.meta.url));
  const gltf=JSON.parse(pack.subarray(20,20+pack.readUInt32LE(12)));
  assert.ok(gltf.meshes.some(mesh=>mesh.name===HUSH_DENSITY_RENDER.core),'the retained exposure uses the actual shipped HUSH core');
  const pressureStart=source.indexOf('  const pressureDraws='),pressureEnd=source.indexOf('  pressureSceneDepthReady=false;',pressureStart);
  const submission=source.slice(pressureStart,pressureEnd);
  assert.match(submission,/:pressureInstances\(incomingHush,incomingHushSecondary/);
  assert.match(submission,/P3\.setPressureInstances\(resolvedPressureDraws\)/);
  assert.ok(source.includes('const exposureHush=outcomeExposure.resolve(state.hush'));
  const pass=source.slice(source.indexOf('function runPixelMeshPass('));
  const finish=pass.indexOf('const pressureSourceTex = occupiedHome?sourceTexture:finishPressure(sourceTexture);');
  assert.ok(finish>=0&&finish<pass.indexOf('gl.drawArrays('));
  assert.match(pass.slice(finish,finish+900),/runBurstPass\(pressureSourceTex, now\)/,'the physical pressure output enters the shared acquisition before the final dither draw');
  const policy=await readFile(new URL('../src/render/outcome-exposure.js',import.meta.url),'utf8');
  assert.doesNotMatch(policy,/surfer\.png|new Image\s*\(|performance\.now\s*\(|Date\.now\s*\(/,
    'physical body policy must not grow a bitmap or independent clock');
});
