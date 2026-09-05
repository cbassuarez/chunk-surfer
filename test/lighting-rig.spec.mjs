import assert from 'node:assert/strict';

import { ZONE } from '../src/data/floorplan/legend.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {
  LIGHT_BANDS,
  LIGHT_KIND,
  EMERGENCY_CADENCE,
  EMERGENCY_PRESENTATION_FLOOR,
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
  assert.ok(light.intensity<=(light.kind===LIGHT_KIND.EMERGENCY?3.6:1.8),
    `${light.id} stays inside the authored ceiling for its light class`);
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
assert.equal(byId['atrium-main-exit'].kind,LIGHT_KIND.FITTING,'the public closure uses an amber wayfinding pool, not the red alarm circuit');
assert.equal(byId['atrium-main-exit'].circuit,null,'the chained public entrance remains legible before S/P-03 is restored');
assert.equal(byId['atrium-main-exit'].maintained,true,'the entrance bulkhead is genuinely maintained');
assert.ok(byId['atrium-main-exit'].intensity>=1,'the maintained entrance pool survives the torch-off display threshold');
assert.ok(byId['foh-live-west'].intensity>=1.4&&byId['foh-live-west'].radius>=14,'the west fitting gives the waiting suite a substantial S/P-03 reveal');
assert.ok(byId['foh-live-east'].intensity>=1.4&&byId['foh-live-east'].radius>=14,'the east fitting gives the box office a substantial S/P-03 reveal');
assert.equal(byId['natatorium-emergency-entry'].anchorPropId,'natatorium-light-emergency-entry');
assert.equal(byId['natatorium-emergency-far'].anchorPropId,'natatorium-light-emergency-far');
assert.equal(byId['organ-loft-exit'].anchorPropId,'tower-light-organ-exit');
assert.equal(byId['nave-exit'].anchorPropId,'tower-light-nave-exit');
assert.equal(byId['getin-grey-door-seam'].circuit,'sp03','get-in emergency light requires an explicitly restored area circuit');
assert.equal(CONSERVATORY_PROPS.find((prop)=>prop.id==='light-hall-lounge-casing')?.lightMaintained,true,
  'the maintained concert-hall fitting stays emissive with S/P-03 off');
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
assert.deepEqual(
  lights.filter((light)=>light.kind===LIGHT_KIND.EMERGENCY&&light.maintained).map((light)=>light.id).sort(),
  [
    'hall-entrance-maintained-north','hall-entrance-maintained-south',
    'hall-stage-door-maintained','hall-galleria-west-foot','hall-galleria-east-foot',
  ].sort(),
  'the concert hall is the only emergency circuit alive before the user restores an area',
);

const room=(group,zone)=>({group,zone});
const deadPlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set()});
assert.deepEqual(deadPlant.map((light)=>light.id),['plant-panel-green'],'dead plant room preserves only the independent green pilot');
const livePlant=resolveLocalLights(room('basement',ZONE.plant),{liveCircuits:new Set(['sp01'])});
assert.ok(livePlant.some((light)=>light.id==='plant-emergency'));
assert.ok(livePlant.some((light)=>light.id==='plant-service-live'));
assert.ok(livePlant.some((light)=>light.id==='plant-switchgear-live'));
assert.ok(livePlant.some((light)=>light.id==='plant-manifold-live'));
assert.ok(!resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set()}).some((light)=>light.circuit));
assert.ok(resolveLocalLights(room('basement',ZONE.danceStudio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='dance-work-live'));
// A studio's work light must resolve for somebody standing IN that studio. B3's
// was zoned to the dance wing while standing in B3, so it lit nobody.
assert.ok(resolveLocalLights(room('basement',ZONE.studio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='b3-work-live'),
  'B3 work light resolves for the take room it stands in');
assert.ok(resolveLocalLights(room('basement',ZONE.studio),{liveCircuits:new Set(['sp01'])}).some((light)=>light.id==='b3-emergency'),
  'B3 receives the same red emergency loop as the rest of its circuit');
assert.ok(!resolveLocalLights(room('basement',ZONE.studio),{liveCircuits:new Set()}).some((light)=>light.circuit),
  'and it is dark until sp01 is live');

const deadPool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set()});
assert.ok(deadPool.every((light)=>!light.circuit));
const livePool=resolveLocalLights(room('ground',ZONE.natatorium),{liveCircuits:new Set(['sp02']),slots:99});
assert.equal(livePool.filter((light)=>light.circuit==='sp02'&&light.kind===LIGHT_KIND.FITTING).length,2);
assert.equal(livePool.filter((light)=>light.circuit==='sp02'&&light.kind===LIGHT_KIND.EMERGENCY).length,4,
  'restoring S/P-02 explicitly enables the natatorium emergency bank');
assert.ok(resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set(['sp03'])}).some((light)=>light.id==='foh-live-west'));
assert.ok(resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set(['sp03'])}).some((light)=>light.id==='foh-emergency'),
  'S/P-03 owns a local atrium apparition source rather than borrowing the hall');
const deadFoyer=resolveLocalLights(room('ground',ZONE.foyer),{liveCircuits:new Set()});
assert.ok(deadFoyer.some((light)=>light.id==='hall-entrance-maintained-north'));
assert.ok(deadFoyer.some((light)=>light.id==='hall-entrance-maintained-south'));
assert.ok(deadFoyer.some((light)=>light.id==='atrium-main-exit'),'the chained public entrance has a local pool with the house circuit dead');
assert.ok(!deadFoyer.some((light)=>light.id==='foh-live-west'||light.id==='foh-live-east'),'the wider foyer remains dark until S/P-03 is restored');
const deadPractice=resolveLocalLights(room('upper',ZONE.practice),{liveCircuits:new Set()});
assert.equal(deadPractice.some((light)=>light.kind===LIGHT_KIND.EMERGENCY),false,
  'practice-wing emergency lighting stays dark on a fresh run');
const livePractice=resolveLocalLights(room('upper',ZONE.practice),{liveCircuits:new Set(['sp04'])});
assert.deepEqual(livePractice.filter((light)=>light.kind===LIGHT_KIND.EMERGENCY).map((light)=>light.id).sort(),
  ['practice-emergency-north','practice-emergency-south'],
  'the practice bank comes alive only after its area circuit is restored');

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

  // The far end is the other half of the circuit. The west fitting is centred
  // over the waiting suite, so the group crosses the room's display threshold
  // without borrowing the east box-office pool.
  assert.ok(litAt(78, 12, ['sp03']) * PLASTER > whitePoint, 'sp03 lights the west end of the foyer');
  assert.ok(litAt(78, 12, []) * PLASTER < whitePoint, 'which is dark until it is restored');

  // And the lanterns still do their job: the threshold stays readable either way.
  assert.ok(channelAt(97,25,[],[1,0,0])*PLASTER > whitePoint*3, 'the hall threshold carries a strong red field without any circuit');
}

const contexts=[ZONE.dock,ZONE.studio,ZONE.natatorium,ZONE.hall,ZONE.practice,ZONE.chapel,ZONE.plant,ZONE.academic]
  .map((zone)=>resolveLightingContext({group:'ground',zone}));
assert.equal(new Set(contexts.map((context)=>`${context.ambientColor.join(',')}:${context.ambientIntensity}`)).size,contexts.length,
  'each major room has a distinct still-frame ambient signature');

const failing=(timeSec,effectsMode='full')=>resolveLocalLights(room('academic',ZONE.academic),{timeSec,effectsMode,liveCircuits:new Set(['sp05'])})
  .find((light)=>light.id==='academic-emergency-east-failing').intensity;
const fullBlinkSamples=Array.from({length:400},(_,index)=>emergencyBlinkState('academic-emergency-east-failing',index*.05));
assert.deepEqual(new Set(fullBlinkSamples.map((sample)=>sample.scale)),new Set([0,1]),'an emergency practical snaps between black and full red with no ramp');
assert.ok(fullBlinkSamples.every((sample)=>sample.scale===0||sample.shadowReveal===1),'every full-effects lit beat reveals the shadow pass');
const failingIntensities=Array.from({length:400},(_,index)=>failing(index*.05));
// TWO STATES, AND ONLY TWO. The number is the presentation floor now, not the
// authored one: EMERGENCY_PRESENTATION_FLOOR raises an ACTIVE emergency source
// when the rig is resolved for rendering, while allAuthoredLights keeps showing
// the physical fitting that was authored. What this assertion is actually about
// is unchanged — a failing practical snaps between off and full, with no ramp
// and no flutter in between.
const failingLit=Math.max(EMERGENCY_PRESENTATION_FLOOR.intensity,byId['academic-emergency-east-failing'].intensity);
assert.deepEqual(new Set(failingIntensities),new Set([0,failingLit]),'the powered beat neither fades nor flutters');
// Sampled inside the dark window rather than at a whole number of seconds: the
// circuit runs at 1Hz now, so t=3 is the same phase as t=0 and always lit.
assert.ok(failing(EMERGENCY_CADENCE.period*.8)<failing(0),
  'failing maintained practical blinks instead of remaining at a fixed exposure');

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
  for(let time=0;time<180;time+=.002){
    samples++;
    if(!circuit.some((id)=>emergencyBlinkState(id,time).scale>0))dark++;
  }
  // THE DARK IS A FIXED WINDOW, NOT A FRACTION.
  //
  // This used to assert the dark was the MAJORITY of the cycle, which quietly
  // coupled two independent quantities: the dark is the interval the apparitions
  // move in and is calibrated in seconds against EMERGENCY_DARK_HASTE, while the
  // hold is how long the player has to look at them. Expressed as a duty,
  // lengthening the look shortened the walk. Both are pinned in seconds now.
  assert.ok(Math.abs(EMERGENCY_CADENCE.dark-.672)<1e-9,'the dark window is the authored 0.672s');
  const measuredDark=dark/samples*EMERGENCY_CADENCE.period;
  assert.ok(Math.abs(measuredDark-EMERGENCY_CADENCE.dark)<.02,
    `the circuit really is dark for that long (${measuredDark.toFixed(3)}s per cycle)`);
  // A HOLD YOU CAN SEARCH A ROOM IN. Half a second is enough to know the room
  // flashed and not enough to find anything in it, and finding the white body on
  // the far wall is the entire beat.
  assert.ok(EMERGENCY_CADENCE.hold>=1.5&&EMERGENCY_CADENCE.hold<=2,
    'the lit beat is a look, not a stab');
  assert.ok(Math.abs(EMERGENCY_CADENCE.period-(EMERGENCY_CADENCE.hold+EMERGENCY_CADENCE.dark))<1e-9
    &&Math.abs(EMERGENCY_CADENCE.duty-EMERGENCY_CADENCE.hold/EMERGENCY_CADENCE.period)<1e-9,
    'period and duty are derived from the two authored halves, never authored beside them');

  // IN UNISON. NFPA 72 requires synchronised visual appliances to fire within
  // 10ms of one another, and a room of strobes rippling out of step reads as a
  // slow sectional wipe rather than an alarm — which is exactly what an earlier
  // per-lamp jitter produced. Every lamp must change state on the same frame.
  for(let time=0;time<EMERGENCY_CADENCE.period*3;time+=.004){
    const states=new Set(circuit.map((id)=>emergencyBlinkState(id,time).scale));
    assert.equal(states.size,1,`the circuit is one relay, not a chorus (t=${time.toFixed(3)})`);
  }

  // THE PHOTOSENSITIVITY CONTRACT IS THE ONLY HARD CEILING HERE.
  //
  // This used to also assert the rate sat inside EN 54-23's 0.5-2Hz appliance
  // band. At a 1.75s hold it does not, and that is an authored decision rather
  // than a regression: this is a failing battery pack in a condemned building,
  // not a certified visual notification appliance, and the hold is the shot. The
  // clinical threshold is 3Hz and only gets further away as the hold grows.
  assert.ok(1/EMERGENCY_CADENCE.period<3,'the circuit stays under the photosensitivity threshold');
  assert.ok(EMERGENCY_CADENCE.period<=6,'and is still a flashing lamp rather than a room light');

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
    assert.ok(away.intensity>0&&away.intensity<home.intensity*.35,
      `${id} leaks through the aperture without turning the foyer into the hall`);
    assert.equal(away.spilling,true,`${id} is marked as cross-zone spill for apparition ownership`);
    assert.equal(away.sourceZone,ZONE.hall,`${id} retains hall ownership while spilling`);
    assert.equal(away.zone,ZONE.foyer,`${id} records the player zone separately from source ownership`);
    assert.equal(home.spilling,false,`${id} remains locally owned inside the hall`);
  }
  assert.equal(at(foyer,'atrium-main-exit').circuit,null,'the entrance wayfinding pool survives a dead S/P-03 circuit');
  const poweredFoyer=resolveLocalLights(room('ground',ZONE.foyer),{origin:{x:96.5,z:16},liveCircuits:new Set(['sp03']),slots:99});
  assert.equal(at(poweredFoyer,'atrium-main-exit').penetration,byId['atrium-main-exit'].penetration,
    'the local entrance pool remains stable when the wider room is restored');
  assert.ok(at(poweredFoyer,'foh-live-east'),'S/P-03 still adds the wider front-of-house reveal');
  assert.equal(at(poweredFoyer,'foh-emergency').sourceZone,ZONE.foyer,
    'S/P-03 provides an atrium-owned emergency source rather than borrowing a hall source');
  assert.equal(at(poweredFoyer,'foh-emergency').spilling,false);
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
  // Deep enough to be seen. A shallow breathe is the original complaint with
  // the pin taken out and nothing put back: the report that produced this test
  // was made by a player sitting in the concert hall on REDUCED.
  assert.ok(high/low>3.5,`reduced effects pulses deeply enough to read (${(high/low).toFixed(1)}:1)`);
  assert.ok(low>.15,'and never snaps to black, which is the part that is a strobe');
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
// Adjacent emergency lights used to be asserted STAGGERED. That was the bug:
// a building's emergency optics are one synchronised circuit, and staggering
// them is what made the room ripple by section instead of snapping. Unison is
// pinned above, against the whole circuit, at 4ms resolution.
assert.ok(Array.from({length:250},(_,index)=>index*.02).every((time)=>
  emergencyBlinkState('academic-emergency-west',time).scale===emergencyBlinkState('academic-emergency-east-failing',time).scale
),'adjacent emergency lights fire together');
const steadySky=resolveLocalLights(room('ground',ZONE.natatorium),{timeSec:1}).find((light)=>light.id==='natatorium-roof-spill-north');
assert.equal(steadySky.intensity,1.52,'blinking does not modulate daylight or ordinary fittings');

const anchored=resolveLocalLights(room('tower',ZONE.bellTower),{
  towerActive:true,
  towerCleared:false,
  anchorPosition:(id)=>id==='tower-light-lower'?{x:7,y:8,z:9,floorY:6.2,yaw:.4}:null,
}).find((light)=>light.id==='access-low');
assert.deepEqual([anchored.x,anchored.y,anchored.z],[7,8.18,9],'moving a fitting moves its light');
assert.equal(anchored.floorY,6.2,'anchored practical carries its floor into the shadow composition');

const towerDark=resolveLocalLights(room('tower',ZONE.bellTower),{towerCleared:false,origin:{x:100,z:62}});
assert.deepEqual(towerDark.map((light)=>light.id),['louvre-spill'],'the tower emergency bank is dark before its area is restored');
const towerLit=resolveLocalLights(room('tower',ZONE.bellTower),{towerActive:true,towerCleared:true,origin:{x:100.5,z:82}});
assert.equal(towerLit.length,LOCAL_LIGHT_SLOTS);
assert.ok(towerLit.some((light)=>light.id==='nave-exit'));
assert.ok(!towerLit.some((light)=>light.id==='louvre-spill'));

console.log('lighting rig contracts passed');

// AN ANCHOR THAT NAMES NOTHING IS A LIGHT THAT SILENTLY DOES NOT MOVE.
//
// anchorPropId resolves from the prop every frame, falling back to the authored
// coordinates when the prop is missing — so a typo does not throw, it just
// quietly pins the light to a stale position. Only the id STRING was asserted
// here, which cannot catch that. Resolved against the placed set, which includes
// the generated circulation dressing, because four landing lights anchor to it.
FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
PROPS.loadPropState({});
const placedIds = new Set(PROPS.propsInit(FP).map((p) => p.id));
for (const light of lights) {
  if (!light.anchorPropId) continue;
  assert.ok(placedIds.has(light.anchorPropId),
    `light ${light.id} anchors to ${light.anchorPropId}, which is not a placed prop`);
}
