import assert from 'node:assert/strict';

import { ZONE } from '../src/data/floorplan/legend.js';
import {
  LIGHT_BANDS,
  LIGHT_KIND,
  EMERGENCY_CADENCE,
  EMERGENCY_RED,
  LIGHT_RIGS,
  LOCAL_LIGHT_SLOTS,
  allAuthoredLights,
  emergencyBlinkState,
  lightRigFor,
  resolveLightingContext,
  resolveLocalLights,
  zoneWhitePointScale,
  REFERENCE_WHITE_POINT,
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
for(const light of lights.filter((entry)=>entry.kind===LIGHT_KIND.EMERGENCY)){
  assert.deepEqual(light.color,EMERGENCY_RED,`${light.id} is electrical red rather than amber`);
  assert.ok(light.radius>=30,`${light.id} carries beyond the fitting's immediate pool`);
  assert.ok(light.penetration>=.75,`${light.id} retains the x-ray architectural spill`);
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
assert.equal(byId['getin-grey-door-seam'].circuit,null,'get-in seam is not the disconnected chandelier');
for(const id of['hall-entrance-maintained-north','hall-entrance-maintained-south']){
  assert.equal(byId[id].kind,LIGHT_KIND.EMERGENCY,`${id} participates in the red snap`);
  assert.equal(byId[id].maintained,true,`${id} survives the dead mains`);
  assert.equal(byId[id].circuit,null,`${id} does not depend on the house-light circuit`);
  assert.ok(byId[id].groups.includes('ground')&&byId[id].groups.includes('hall'),`${id} reads on both sides of the threshold`);
}
for(const id of['hall-stage-door-maintained','hall-galleria-west-foot','hall-galleria-east-foot']){
  assert.ok(byId[id].groups.includes('ground')&&byId[id].zones.includes(ZONE.foyer),`${id} reaches the foyer from the auditorium`);
  assert.ok(byId[id].radius>=48&&byId[id].penetration>=.88,`${id} carries the long red x-ray field`);
}

const room=(group,zone)=>({group,zone});
const deadPlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set()});
assert.deepEqual(deadPlant.map((light)=>light.id),['plant-panel-green'],'dead plant room has indicators only');
const livePlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set(['sp01'])});
assert.ok(livePlant.some((light)=>light.id==='plant-service-live'));
assert.ok(!resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set()}).some((light)=>light.circuit));
assert.ok(resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='dance-work-live'));
// A studio's work light must resolve for somebody standing IN that studio. B3's
// was zoned to the dance wing while standing in B3, so it lit nobody.
assert.ok(resolveLocalLights(room('basement',ZONE.studio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='b3-work-live'),
  'B3 work light resolves for the take room it stands in');
assert.ok(!resolveLocalLights(room('basement',ZONE.studio),{liveCircuits:new Set()}).some((light)=>light.circuit),
  'and it is dark until sp01 is live');

const deadPool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set()});
assert.ok(deadPool.every((light)=>!light.circuit));
const livePool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set(['sp02'])});
assert.equal(livePool.filter((light)=>light.circuit==='sp02').length,2);
assert.ok(resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set(['sp03'])}).some((light)=>light.id==='foh-live-west'));
const deadFoyer=resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set()});
assert.ok(deadFoyer.some((light)=>light.id==='hall-entrance-maintained-north'));
assert.ok(deadFoyer.some((light)=>light.id==='hall-entrance-maintained-south'));

// THROWING A BREAKER HAS TO CHANGE THE LIGHT WHERE THE BREAKER IS.
//
// S/P-03 read as a hum and nothing on screen. The circuit was resolving fine —
// it raised the local light 1.57x at the panel — but the two maintained
// wayfinding lanterns were authored at 1.10 over a sixteen-metre radius, wider
// than the atrium, and the foyer's white point is 0.153. The surface was already
// clipped before the breaker was touched, so a 57% increase had nowhere to go.
{
  const whitePoint = REFERENCE_WHITE_POINT * zoneWhitePointScale(ZONE.foyer);
  const PLASTER = .617;
  const channelAt = (x, z, live, weights) => resolveLocalLights({ group:'ground', zone:ZONE.foyer },
    { liveCircuits:new Set(live), origin:{ x, z } })
    .reduce((total, light) => {
      const d = Math.hypot(light.x - x, light.z - z, (light.y || 0) - 1.6);
      const channel=light.color[0]*weights[0]+light.color[1]*weights[1]+light.color[2]*weights[2];
      return total + light.intensity * channel * Math.pow(Math.max(0, 1 - d / light.radius), 2);
    }, 0);
  const litAt=(x,z,live)=>channelAt(x,z,live,[.2126,.7152,.0722]);

  // The panel itself: dark enough to have somewhere to go, then clipped.
  const panelDead = litAt(96.5, 16, []) * PLASTER;
  const panelLive = litAt(96.5, 16, ['sp03']) * PLASTER;
  assert.ok(panelDead < whitePoint,
    `the S/P-03 panel is below its own white point unlit (${panelDead.toFixed(3)} vs ${whitePoint.toFixed(3)})`);
  assert.ok(panelLive > whitePoint, 'and restoring the circuit takes it past');
  assert.ok(panelLive / panelDead > 1.6, 'by a margin a player can actually see');

  // The far end is the other half of the circuit. foh-live-west is 22m from the
  // panel against a radius-10 cutoff, so it contributes nothing there by design —
  // it is not dead weight, it lights the end of the room the panel cannot.
  assert.ok(litAt(78, 12, ['sp03']) * PLASTER > whitePoint, 'sp03 lights the west end of the foyer');
  assert.ok(litAt(78, 12, []) * PLASTER < whitePoint, 'which is dark until it is restored');

  // And the lanterns still do their job: the threshold stays readable either way.
  assert.ok(channelAt(97,25,[],[1,0,0])*PLASTER > whitePoint*3, 'the hall threshold carries a strong red field without any circuit');
}

const contexts=[ZONE.dock,ZONE.studio,ZONE.natatorium,ZONE.hall,ZONE.practice,ZONE.chapel,ZONE.plant,ZONE.academic]
  .map((zone)=>resolveLightingContext({group:'ground',zone}));
assert.equal(new Set(contexts.map((context)=>`${context.ambientColor.join(',')}:${context.ambientIntensity}`)).size,contexts.length,
  'each major room has a distinct still-frame ambient signature');

const failing=(timeSec,effectsMode='full')=>resolveLocalLights(room('academic',ZONE.academic),{timeSec,effectsMode})
  .find((light)=>light.id==='academic-emergency-east-failing').intensity;
const fullBlinkSamples=Array.from({length:400},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.05));
assert.deepEqual(new Set(fullBlinkSamples.map((sample)=>sample.scale)),new Set([0,1]),'an emergency practical snaps between black and full red with no ramp');
assert.ok(fullBlinkSamples.every((sample)=>sample.scale===0||sample.shadowReveal===1),'every full-effects lit beat reveals the shadow pass');
const failingIntensities=Array.from({length:400},(_,index)=>failing(index*.05));
assert.deepEqual(new Set(failingIntensities),new Set([0,byId['academic-emergency-east-failing'].intensity]),'the powered beat neither fades nor flutters');
assert.ok(failing(3)<failing(0),'failing maintained practical blinks instead of remaining at a fixed exposure');

// THE CIRCUIT IS ONE CIRCUIT, AND THE DARK IS THE POINT.
//
// Six emergency lamps meet in the hall/foyer pair. On private periods and
// private offsets they were never all dark at once — measured at 2.4% of the
// time — so the building was continuously red and the blink was invisible from
// inside it. A shared cadence is what makes a beat a beat.
{
  const circuit=allAuthoredLights().filter((light)=>light.kind===LIGHT_KIND.EMERGENCY).map((light)=>light.id);
  const periods=new Set(circuit.map((id)=>emergencyBlinkState(id,0).period));
  assert.equal(periods.size,1,'every emergency lamp runs the same battery pack cadence');
  assert.ok(circuit.every((id)=>emergencyBlinkState(id,0).scale===1),'a still frame catches the circuit energised');
  let dark=0,samples=0;
  for(let time=0;time<180;time+=.02){
    samples++;
    if(!circuit.some((id)=>emergencyBlinkState(id,time).scale>0))dark++;
  }
  assert.ok(dark/samples>.35,`the whole circuit is genuinely dark most beats (${(dark/samples*100).toFixed(1)}%)`);
  // Ragged, not mechanical: the lamps must not snap as a single relay.
  const edges=new Set(circuit.map((id)=>{
    let last=emergencyBlinkState(id,0).scale;
    for(let time=0;time<EMERGENCY_CADENCE.period;time+=.01){
      const next=emergencyBlinkState(id,time).scale;
      if(next!==last)return Number(time.toFixed(2));
      last=next;
    }
    return -1;
  }));
  assert.ok(edges.size>1,'individual ballasts still strike at their own moment');
}

// SPILL. The auditorium's lamps are x-ray in the auditorium and ordinary in the
// atrium, or the whole foyer reads as the concert hall's own red volume.
{
  const hall=resolveLocalLights(room('hall',ZONE.hall),{origin:{x:110,z:26}});
  const foyer=resolveLocalLights(room('ground',ZONE.foyer),{origin:{x:96.5,z:16}});
  const at=(list,id)=>list.find((light)=>light.id===id);
  for(const id of['hall-entrance-maintained-north','hall-stage-door-maintained','hall-galleria-west-foot']){
    const home=at(hall,id),away=at(foyer,id);
    assert.ok(home&&away,`${id} resolves on both sides of the threshold`);
    assert.equal(home.penetration,byId[id].penetration,`${id} keeps its authored x-ray inside the hall`);
    assert.equal(home.radius,byId[id].radius,`${id} keeps its authored reach inside the hall`);
    assert.ok(away.penetration<=.1,`${id} stops ignoring atrium walls once it is only leaking`);
    assert.ok(away.radius<home.radius*.5,`${id} loses the long throw once it is only leaking`);
    assert.equal(away.intensity,home.intensity,'the fitting itself is not dimmed — only its reach through the building');
  }
  assert.equal(at(foyer,'atrium-main-exit').penetration,byId['atrium-main-exit'].penetration,
    'a lamp standing in the room it lights is never treated as spill');
}
// REDUCED FLASH MUST NOT MEAN A PERMANENTLY LIT BUILDING.
//
// This used to assert scale===1 for every reduced sample, which is what pinned
// the emergency circuit at full red for anyone using the accessibility setting —
// in the concert hall, where six of these overlap, that is an unchanging red
// room with the effect deleted and only the glare left. Reduced now keeps a
// cadence and throws away the strobe.
{
  const reducedSamples=Array.from({length:800},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.025,{effectsMode:'reduced'}));
  const scales=reducedSamples.map((sample)=>sample.scale);
  const low=Math.min(...scales),high=Math.max(...scales);
  assert.ok(high-low>.2,'reduced effects still pulses rather than pinning the lamp on');
  assert.ok(low>.35,'and never snaps to black, which is the part that is a strobe');
  assert.ok(high<=1);
  // No edges: consecutive frames may only creep. This is the photosensitivity
  // contract — a slow raised cosine, not a fast ramp with the corners sanded.
  for(let index=1;index<scales.length;index++){
    assert.ok(Math.abs(scales[index]-scales[index-1])<.03,'reduced flash has no edges in it');
  }
  const offSamples=Array.from({length:200},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.05,{effectsMode:'off'}));
  assert.equal(new Set(offSamples.map((sample)=>sample.scale)).size,1,'off is the genuine opt-out and holds steady');
  assert.ok(offSamples[0].scale<1,'a player who asked for less is not handed a brighter building than everyone else');
  assert.ok(offSamples.every((sample)=>sample.shadowReveal===0),'and the apparitions do not appear at all');
}
assert.deepEqual(emergencyBlinkState('getin-grey-door-seam',12.25),emergencyBlinkState('getin-grey-door-seam',12.25),'cadence is deterministic');
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
