import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';
import { EMERGENCY_CADENCE, emergencyWanderClock } from '../src/data/conservatory-lights.js';

const lights=[
  {id:'far',x:70,y:2,z:70,floorY:0,intensity:.4,shadowReveal:1,pulseIndex:3},
  {id:'near',x:4,y:2,z:1,floorY:.5,intensity:.4,shadowReveal:1,pulseIndex:7},
];
const frame=buildEmergencyShadowFrame(lights,{listener:{x:2,z:1}});
assert.ok(frame,'a readable nearby pulse authors one shadow frame');
assert.equal(frame.lightId,'near','unreachable distant practicals cannot steal the single practical shadow pass');
assert.equal(frame.lightOverride.castsShadow,true);
assert.ok(Number.isFinite(frame.lightOverride.shadowYaw));
assert.equal(frame.instance.poseId,'neutral');
assert.equal(frame.instance.mesh,'apparition_pose_neutral');
assert.equal(frame.instance.shadowOnly,false,'the human form occupies world depth in the colour pass');
assert.deepEqual(frame.instance.emissive,[1,.985,1,.82],'ordinary apparitions stay shadow-dominant');
assert.equal(frame.instance.y,.5,'the body stands on the authored room floor');
assert.equal(frame.instances.length,3,'one red snap projects a small impossible crowd, not a mild single shadow');
assert.equal(new Set(frame.instances.map((instance)=>instance.id)).size,3);
assert.equal(frame.apparitionLights.length,3,'each body emits a compact white field into the room');
assert.ok(frame.apparitionLights.every((light)=>light.kind==='apparition'&&light.intensity>0&&light.radius>=3.5));
assert.ok(frame.instances.every((instance)=>instance.scaleX>=.88&&instance.scaleX<=1.04&&instance.scaleY>=.96&&instance.scaleY<=1.08),
  'the crowd keeps recognisably human proportions');
assert.ok(frame.lightOverride.shadowPitch<0,'the practical aims down through the floor-standing figures');
assert.equal('collision' in frame.instance,false);
assert.equal('hush' in frame.instance,false);
assert.equal('contact' in frame.instance,false);
assert.deepEqual(buildEmergencyShadowFrame(lights,{listener:{x:2,z:1}}),frame,'the same pulse composes the same shadow');
{
  const readable=[
    {id:'capture-a',x:4,y:2,z:1,floorY:0,intensity:.4,shadowReveal:1},
    {id:'capture-b',x:7,y:2,z:1,floorY:0,intensity:.4,shadowReveal:1},
  ];
  assert.equal(buildEmergencyShadowFrame(readable,{
    listener:{x:2,z:1},preferredLightId:'capture-b',
  }).lightId,'capture-b','a capture may pin an already-readable practical without changing ordinary ranking');
  assert.equal(buildEmergencyShadowFrame(readable,{
    listener:{x:2,z:1},preferredLightId:'missing',
  }).lightId,'capture-a','an invalid capture pin falls back to the live candidate ranking');
  assert.equal(buildEmergencyShadowFrame([
    {id:'overhead',x:3,y:7.8,floorY:6,intensity:.4,shadowReveal:1},
    {id:'same-landing',x:7,y:1.8,floorY:0,intensity:.4,shadowReveal:1},
  ],{listener:{x:2,y:0,z:1}}).lightId,'same-landing',
  'a nearer lamp on another storey cannot stage ceiling-height bodies over the player');
}
assert.equal(buildEmergencyShadowFrame(lights,{listener:{x:2,z:1},enabled:false}),null);
assert.equal(buildEmergencyShadowFrame([{...lights[1],shadowReveal:0}],{listener:{x:2,z:1}}),null);
assert.ok(buildEmergencyShadowFrame([{...lights[1],x:50}],{listener:{x:0,z:1}}),'the apparition remains eligible across the concert hall');

// THE CROWD IS STAGED IN SECTORS, NOT WELDED TO THE CAMERA.
//
// The original staging put the three figures at fixed offsets along the view
// axis — a crowd swinging with the mouse. But the opposite extreme is just as
// broken: a shadow only lands on a surface when the body is between the lamp and
// that surface, so a crowd that ignores where you are looking throws everything
// onto walls behind you. Staging follows the view, HARD-QUANTISED into eighths,
// so a whole turn produces a handful of arrangements rather than a pan.
{
  const lamp=[{id:'hall',x:20,y:2.4,z:20,floorY:0,intensity:.6,shadowReveal:1}];
  const listener={x:14,z:20};
  const yaws=Array.from({length:64},(_,index)=>index/64*Math.PI*2);
  const stagings=new Set(yaws.map((viewYaw)=>buildEmergencyShadowFrame(lamp,{listener,viewYaw})
    .instances.map((instance)=>`${instance.x.toFixed(2)},${instance.z.toFixed(2)}`).join('|')));
  assert.ok(stagings.size<=8,`a full turn produces at most one staging per sector (${stagings.size})`);
  assert.ok(stagings.size>1,'and the sector does follow the view, or the shadow lands behind you');
  // Nudging the camera a degree must change nothing at all.
  assert.deepEqual(
    buildEmergencyShadowFrame(lamp,{listener,viewYaw:.02}).instances,
    buildEmergencyShadowFrame(lamp,{listener,viewYaw:.03}).instances,
    'small camera movement cannot restage the apparitions');
  for(const viewYaw of yaws){
    for(const instance of buildEmergencyShadowFrame(lamp,{listener,viewYaw}).instances){
      const reach=Math.hypot(instance.x-20,instance.z-20);
      assert.ok(reach>1.2&&reach<10,`a figure holds a station around the fitting (${reach.toFixed(1)}m)`);
      assert.ok(Math.hypot(instance.x-listener.x,instance.z-listener.z)>2,
        'and no amount of turning brings one onto the camera');
    }
  }
}

// LAZY. It has to be measurably lazy, or it is a chase.
{
  const lamp=[{id:'stalls',x:30,y:2.4,z:30,floorY:0,intensity:.6,shadowReveal:1}];
  const listener={x:24,z:30};
  const at=(timeSec)=>buildEmergencyShadowFrame(lamp,{listener,timeSec}).instances;
  const step=.25;
  let fastest=0;
  let travelled=0;
  const start=at(0);
  for(let time=step;time<=240;time+=step){
    const before=at(time-step),after=at(time);
    for(let index=0;index<after.length;index++){
      const moved=Math.hypot(after[index].x-before[index].x,after[index].z-before[index].z);
      fastest=Math.max(fastest,moved/step);
    }
  }
  const end=at(240);
  for(let index=0;index<end.length;index++){
    travelled=Math.max(travelled,Math.hypot(end[index].x-start[index].x,end[index].z-start[index].z));
  }
  assert.ok(fastest<.9,`nothing here ever strides (${fastest.toFixed(2)} m/s peak)`);
  assert.ok(travelled>.3,'but four minutes later the crowd is demonstrably not where it was');
}

// IT NEVER CLOSES. Four minutes of milling may not shorten the gap to the
// player — this is the whole promise that it cannot hurt you, and it is also
// what lets the scene be milked forever without resolving into anything.
{
  const lamp=[{id:'aisle',x:40,y:2.4,z:40,floorY:0,intensity:.6,shadowReveal:1}];
  const listener={x:33,z:40};
  let nearest=Infinity;
  const gaps=[];
  for(let time=0;time<=240;time+=.5){
    for(const instance of buildEmergencyShadowFrame(lamp,{listener,timeSec:time}).instances){
      const gap=Math.hypot(instance.x-listener.x,instance.z-listener.z);
      nearest=Math.min(nearest,gap);
      gaps.push(gap);
    }
  }
  assert.ok(nearest>2,`nothing ever looms over the player (${nearest.toFixed(1)}m closest approach)`);
  const first=gaps.slice(0,60).reduce((a,b)=>a+b,0)/60;
  const last=gaps.slice(-60).reduce((a,b)=>a+b,0)/60;
  assert.ok(Math.abs(last-first)<1.5,'and the crowd is no closer at the end than at the start');
}

// WEEPING ANGELS. They drift while you watch and cover more ground in the dark,
// so the light comes back on and the silhouette is not where it was.
{
  const lit=emergencyWanderClock(EMERGENCY_CADENCE.period*EMERGENCY_CADENCE.duty);
  const whole=emergencyWanderClock(EMERGENCY_CADENCE.period);
  const litSpan=EMERGENCY_CADENCE.period*EMERGENCY_CADENCE.duty;
  assert.ok(Math.abs(lit-litSpan)<1e-9,'the lit beat runs at ordinary speed');
  assert.ok(whole-lit>(EMERGENCY_CADENCE.period-litSpan)*2,'the dark beat runs several times faster');
  assert.ok(emergencyWanderClock(10,{effectsMode:'reduced'})===10,'a lamp that never goes dark has no dark to hide in');
  const lamp=[{id:'pit',x:12,y:2.4,z:12,floorY:0,intensity:.6,shadowReveal:1}];
  const listener={x:6,z:12};
  const beat=(index)=>buildEmergencyShadowFrame(lamp,{listener,timeSec:index*EMERGENCY_CADENCE.period}).instances;
  const shifted=beat(0).some((instance,index)=>
    Math.hypot(instance.x-beat(1)[index].x,instance.z-beat(1)[index].z)>.12);
  assert.ok(shifted,'one dark beat is enough to move somebody');
}

// The monitor's momentary return, which is a return and never a contact.
assert.equal(frame.contacts.length,3);
for(const contact of frame.contacts){
  assert.deepEqual(Object.keys(contact).sort(),['x','z'],'the map is told a position and nothing else');
}

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const props=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const minimap=readFileSync(new URL('../src/render/minimap.js',import.meta.url),'utf8');
assert.match(main,/viewYaw:R3\.r3dWorldYaw/,'the apparition receives the actual camera direction');
assert.match(main,/shadow\?shadow\.instances:\[\]/,'all three authored figures reach the shadow pass');
assert.match(main,/\.\.\.\(shadow\.apparitionLights\|\|\[\]\)/,'the bodies feed their white practicals into the world-light pass');
assert.match(main,/noteEmergencyApparitions\(shadow/,'the red beat is offered to the navigator');
assert.match(main,/apparitions:recentApparitions\(\)/,'and the navigator draws it');
assert.match(main,/age>APPARITION_RETURN_MS/,'the return dies with the beat that made it');
assert.match(renderer,/uLocalLightPenetration/,'the raymarched architecture receives emergency penetration');
assert.match(props,/emergencyOnly:\!\!practical&&emergencyShadowInstances\.length>0/,'ordinary prop shadows cannot bury the apparition crowd');
assert.match(props,/practical\?\.color\?/,'the visible fixture glass takes the resolved emergency red');
assert.match(renderer,/return mix\(shaded, vec3\(grey\), claim \* \(1\.0 - backing\)\);/,
  'raymarched surfaces cannot retain unbacked emergency red');
assert.match(props,/return mix\(shaded,vec3\(grey\),claim\*\(1\.0-backing\)\);/,
  'mesh surfaces obey the same red reservation');
assert.ok(props.indexOf('vEmissive.rgb*vEmissive.a')<props.indexOf('col=reserveEmergencyRed'),
  'emissive props are checked by the reservation rather than bypassing it');
assert.match(minimap,/drawApparitionReturns/,'the panel has a vocabulary for an unclassified return');
assert.equal(/apparition/i.test(readFileSync(new URL('../src/game/map-model.js',import.meta.url),'utf8')),false,
  'and it never enters the map model as a contact');

console.log('emergency light shadow runtime contracts passed');
