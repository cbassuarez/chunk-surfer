import assert from 'node:assert/strict';

import { ZONE } from '../src/data/floorplan/legend.js';
import {
  LIGHT_BANDS,
  LIGHT_KIND,
  LIGHT_RIGS,
  LOCAL_LIGHT_SLOTS,
  allAuthoredLights,
  emergencyBlinkState,
  lightRigFor,
  resolveLightingContext,
  resolveLocalLights,
} from '../src/data/conservatory-lights.js';

const lights=allAuthoredLights();
assert.ok(lights.length>=28,'the whole building has authored light, not two render groups');

for(const light of lights){
  assert.ok(Object.values(LIGHT_KIND).includes(light.kind),`${light.id} declares a known kind`);
  const[lo,hi]=LIGHT_BANDS[light.kind];
  assert.ok(light.intensity>=lo&&light.intensity<=hi,`${light.id} ${light.intensity} stays in ${lo}..${hi}`);
  assert.ok(light.intensity<=1.8,`${light.id} cannot reintroduce the old 10x exposure scale`);
  assert.ok(light.radius>0&&light.color.length===3);
  assert.ok(light.groups.length&&light.zones.length,`${light.id} has spatial scope`);
  for(const axis of['x','y','z'])assert.ok(Number.isFinite(light[axis]),`${light.id} has ${axis}`);
}
assert.equal(new Set(lights.map((light)=>light.id)).size,lights.length,'light ids are globally unique');
assert.ok(LIGHT_BANDS[LIGHT_KIND.INDICATOR][1]<LIGHT_BANDS[LIGHT_KIND.FITTING][0]);

for(const group of['ground','basement','hall','upper','academic','tower']){
  assert.ok(lightRigFor(group)?.length,`${group} has authored light`);
  assert.equal(new Set(LIGHT_RIGS[group].map((light)=>light.id)).size,LIGHT_RIGS[group].length);
}

const byId=Object.fromEntries(lights.map((light)=>[light.id,light]));
assert.equal(byId['natatorium-roof-spill-north'].intensity,1.52);
assert.equal(byId['access-low'].kind,LIGHT_KIND.EMERGENCY);
assert.equal(byId['access-low'].anchorPropId,'tower-light-lower');
assert.equal(byId['academic-skylight-spill'].anchorPropId,'academic-skylight');
assert.equal(byId['atrium-main-exit'].anchorPropId,'atrium-light-main-exit');
assert.equal(byId['natatorium-emergency-entry'].anchorPropId,'natatorium-light-emergency-entry');
assert.equal(byId['natatorium-emergency-far'].anchorPropId,'natatorium-light-emergency-far');
assert.equal(byId['organ-loft-exit'].anchorPropId,'tower-light-organ-exit');
assert.equal(byId['nave-exit'].anchorPropId,'tower-light-nave-exit');
assert.equal(byId['dock-grey-door-seam'].circuit,null,'dock seam is not the disconnected chandelier');

const room=(group,zone)=>({group,zone});
const deadPlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set()});
assert.deepEqual(deadPlant.map((light)=>light.id),['plant-panel-green'],'dead plant room has indicators only');
const livePlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set(['sp01'])});
assert.ok(livePlant.some((light)=>light.id==='plant-service-live'));
assert.ok(!resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set()}).some((light)=>light.circuit));
assert.ok(resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='dance-work-live'));

const deadPool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set()});
assert.ok(deadPool.every((light)=>!light.circuit));
const livePool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set(['sp02'])});
assert.equal(livePool.filter((light)=>light.circuit==='sp02').length,2);
assert.ok(resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set(['sp03'])}).some((light)=>light.id==='foh-live-west'));

const contexts=[ZONE.dock,ZONE.studio,ZONE.natatorium,ZONE.hall,ZONE.practice,ZONE.chapel,ZONE.plant,ZONE.academic]
  .map((zone)=>resolveLightingContext({group:'ground',zone}));
assert.equal(new Set(contexts.map((context)=>`${context.ambientColor.join(',')}:${context.ambientIntensity}`)).size,contexts.length,
  'each major room has a distinct still-frame ambient signature');

const failing=(timeSec,effectsMode='full')=>resolveLocalLights(room('academic',ZONE.academic),{timeSec,effectsMode})
  .find((light)=>light.id==='academic-emergency-east-failing').intensity;
const fullBlinkSamples=Array.from({length:400},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.05));
assert.ok(fullBlinkSamples.some((sample)=>sample.scale>.9),'an emergency practical reaches a readable lit beat');
assert.ok(fullBlinkSamples.some((sample)=>sample.scale<.025),'an emergency practical has a real dark beat');
assert.ok(fullBlinkSamples.some((sample)=>sample.shadowReveal>.6),'selected lit beats reveal the shadow pass');
assert.ok(failing(0)<failing(3),'failing maintained practical blinks instead of remaining at a fixed exposure');
const reducedSamples=Array.from({length:400},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.025,{effectsMode:'reduced'}));
const reducedJumps=reducedSamples.slice(1).map((sample,index)=>Math.abs(sample.scale-reducedSamples[index].scale));
assert.ok(Math.max(...reducedJumps)<.38,'reduced effects removes hard emergency-light stutters');
assert.deepEqual(emergencyBlinkState('dock-grey-door-seam',12.25),emergencyBlinkState('dock-grey-door-seam',12.25),'cadence is deterministic');
assert.ok(Array.from({length:120},(_,index)=>index*.05).some((time)=>
  Math.abs(emergencyBlinkState('academic-emergency-west',time).scale-emergencyBlinkState('academic-emergency-east-failing',time).scale)>.6
),'adjacent emergency lights are staggered');
const steadySky=resolveLocalLights(room('ground',ZONE.natatorium),{timeSec:1}).find((light)=>light.id==='natatorium-roof-spill-north');
assert.equal(steadySky.intensity,1.52,'blinking does not modulate daylight or ordinary fittings');

const anchored=resolveLocalLights(room('tower',ZONE.bellTower),{
  towerCleared:false,
  anchorPosition:(id)=>id==='tower-light-lower'?{x:7,y:8,z:9,floorY:6.2,yaw:.4}:null,
}).find((light)=>light.id==='access-low');
assert.deepEqual([anchored.x,anchored.y,anchored.z],[7,8.18,9],'moving a fitting moves its light');
assert.equal(anchored.floorY,6.2,'anchored practical carries its floor into the shadow composition');

const towerDark=resolveLocalLights(room('tower',ZONE.bellTower),{towerCleared:false,origin:{x:100,z:62}});
assert.equal(towerDark.length,7);
const towerLit=resolveLocalLights(room('tower',ZONE.bellTower),{towerCleared:true,origin:{x:100.5,z:82}});
assert.equal(towerLit.length,LOCAL_LIGHT_SLOTS);
assert.ok(towerLit.some((light)=>light.id==='nave-exit'));
assert.ok(!towerLit.some((light)=>light.id==='louvre-spill'));

console.log('lighting rig contracts passed');
