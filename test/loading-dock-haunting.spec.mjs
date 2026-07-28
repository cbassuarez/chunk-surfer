import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOCK_HAUNTING_MILESTONES,
  DOCK_HAUNTING_PRESSURE,
  DOCK_HAUNTING_STATUS,
  DOCK_HAUNTING_VARIANT,
  DOCK_PORTAL,
  deriveDockHauntingEligibility,
  dockEndingBeat,
  dockExitAttemptShouldSpeak,
  dockHauntingLights,
  dockHauntingMilestonesCrossed,
  dockHauntingMoveScale,
  dockHauntingPressure,
  dockHauntingStaging,
  freshDockTransitState,
  makeLoadingDockHauntingScene,
  normalizeDockHauntingState,
  reduceDockTransit,
} from '../src/game/loading-dock.js';

const eligible = (extra = {}) => deriveDockHauntingEligibility({
  departed: true,
  spent: false,
  transitionKind: 'step',
  entryPortal: DOCK_PORTAL.SERVICE,
  ...extra,
});

assert.equal(eligible().variant, DOCK_HAUNTING_VARIANT.NORTH_CAGE);
assert.equal(eligible({ entryPortal: DOCK_PORTAL.FOYER }).variant, DOCK_HAUNTING_VARIANT.WEST_DESK);
assert.equal(eligible({ drankCoffee: true, completedTakes: 0 }).variant, DOCK_HAUNTING_VARIANT.NORTH_CAGE,
  'coffee modifies the tableau but never overrides door-authored staging');
assert.equal(eligible({ drankCoffee: true, completedTakes: 4, entryPortal:DOCK_PORTAL.FOYER }).variant,
  DOCK_HAUNTING_VARIANT.WEST_DESK);
assert.equal(eligible({ transitionKind: 'load' }).eligible, false);
assert.equal(eligible({ transitionKind: 'warp' }).eligible, false);
assert.equal(eligible({ spent: true }).eligible, false);
assert.deepEqual(dockHauntingStaging({entryPortal:DOCK_PORTAL.FOYER}),{
  variant:DOCK_HAUNTING_VARIANT.WEST_DESK,x:59,y:5.6,yaw:Math.PI/2,concealment:'west signing desk and searchlight',
});
assert.equal(dockHauntingStaging({entryPortal:DOCK_PORTAL.SERVICE}).x,69);
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.95, hasDoor:true }), true);
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.1, hasDoor:true }), false);
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.95, hasDoor:false }), false);

let transit = freshDockTransitState({ inside: true });
transit = reduceDockTransit(transit, { kind: 'step', fromDock: true, toDock: false });
assert.equal(transit.departedNow, false);
transit = reduceDockTransit(transit, { kind: 'step', toPortal: DOCK_PORTAL.SERVICE, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: DOCK_PORTAL.SERVICE, toDock: false });
assert.equal(transit.departedNow, true);
transit = reduceDockTransit(transit, { kind: 'step', toPortal: DOCK_PORTAL.SERVICE, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: DOCK_PORTAL.SERVICE, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromDock: false, toDock: true });
assert.equal(transit.enteredNow, true);
assert.equal(transit.entryPortal, DOCK_PORTAL.SERVICE);
assert.equal(reduceDockTransit(freshDockTransitState({inside:false}),{kind:'step',fromDock:true,toDock:true}).enteredNow,false);

assert.equal(dockHauntingPressure(DOCK_HAUNTING_PRESSURE.outerMeters),0);
assert.equal(dockHauntingPressure(DOCK_HAUNTING_PRESSURE.contactMeters),1);
const pressureWalk=[12,9,7,5,3,1,.55].map(dockHauntingPressure);
for(let i=1;i<pressureWalk.length;i++)assert.ok(pressureWalk[i]>=pressureWalk[i-1],'pressure is monotonic');
const cadence=pressureWalk.map(dockHauntingMoveScale);
for(let i=1;i<cadence.length;i++)assert.ok(cadence[i]>=cadence[i-1],'movement resistance is monotonic');
assert.equal(dockHauntingMoveScale(0),1);
assert.equal(dockHauntingMoveScale(1),4);
assert.deepEqual(dockHauntingMilestonesCrossed(1,DOCK_HAUNTING_MILESTONES.slice(0,3)),DOCK_HAUNTING_MILESTONES.slice(3));

let distance=12;
const fired=[];
const frames=[];
let contacts=0;
const scene=makeLoadingDockHauntingScene({
  entryPortal:DOCK_PORTAL.FOYER,variant:DOCK_HAUNTING_VARIANT.WEST_DESK,coffee:true,
  distanceMeters:()=>distance,onMilestone:(m)=>fired.push(m),onUpdate:(f)=>frames.push(f),onContact:()=>contacts++,
});
assert.equal(scene.blocksInput,false);
assert.equal(scene.blocksWorld,false);
assert.equal(scene.allowsLook,true);
assert.equal(scene.lookProfile,'hush');
assert.equal(scene.key({}),false);
for(const d of [9,7,5,3,1]){distance=d;scene.update(1);assert.equal(contacts,0,'elapsed time never resolves the scene');}
distance=.55;scene.update(0);
assert.equal(contacts,1,'only physical contact resolves');
scene.update(100);
assert.equal(contacts,1,'contact is idempotent');
assert.deepEqual(fired,DOCK_HAUNTING_MILESTONES);
assert.ok(frames.every((frame,index)=>!index||frame.pressure>=frames[index-1].pressure));
assert.ok(scene.view().effectPressure>=scene.view().pressure,'coffee intensifies perception without changing distance');

const normalLights=[{id:'ordinary',intensity:1,radius:8}];
const peakLights=dockHauntingLights({pressure:1,effectPressure:1},dockHauntingStaging({entryPortal:DOCK_PORTAL.FOYER}),normalLights);
assert.ok(peakLights.find((light)=>light.id==='ordinary').intensity<.1,'architectural light is absorbed');
assert.ok(peakLights.find((light)=>light.id==='dock-hush-readable-rim').intensity>0,'the body keeps a stable rim');

const snapshot={
  active:true,x:4,y:5,targetX:9,targetY:10,hasTarget:true,targetReason:'PLAYER_NOISE_PINPOINT',
  remaining:{externalTarget:999999,phase:1234},contactDirector:{lastKind:'brush',recentContentIds:['a']},
};
const active=normalizeDockHauntingState({
  status:DOCK_HAUNTING_STATUS.ACTIVE,entryPortal:DOCK_PORTAL.SERVICE,variant:'retired-timed-variant',
  firedMilestones:[DOCK_HAUNTING_MILESTONES[2],.123],presenceSnapshot:snapshot,coffee:true,
  doorEndpoints:{[DOCK_PORTAL.SERVICE]:{state:'open',wedge:true}},doorAttempted:true,
});
assert.equal(active.variant,DOCK_HAUNTING_VARIANT.NORTH_CAGE,'legacy timed variants normalize by entry door');
assert.deepEqual(active.firedMilestones,[DOCK_HAUNTING_MILESTONES[2]]);
assert.equal(active.presenceSnapshot.remaining.externalTarget,120000,'resumable timers are bounded');
assert.equal(active.coffee,true);
assert.equal(active.doorAttempted,true);

const source=readFileSync(new URL('../src/game/loading-dock.js',import.meta.url),'utf8');
for(const retired of ['RUPTURE','BLACKOUT','dock-surfer-reflection','dock-surfer-literal','blocksInput: true','blocksWorld: true']){
  assert.equal(source.includes(retired),false,`loading dock no longer depends on ${retired}`);
}
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const dockRuntime=main.slice(
  main.indexOf('// ── loading dock: LAST LOAD-OUT / impossible return'),
  main.indexOf("const GREY_DOOR_ID='dock-grey-exterior'"),
);
for(const retired of ["applyLensPreset('rupture')","possess('rupture'",'dock-surfer-reflection','dock-surfer-literal','stopAllCues']){
  assert.equal(dockRuntime.includes(retired),false,`the integrated dock runtime no longer requests ${retired}`);
}
assert.match(dockRuntime,/stopCueGroup\('dock-haunting',\.001\)/,'the hard cut owns only tableau cues');
assert.match(dockRuntime,/Stack teardown is not contact[\s\S]*?onExit:[\s\S]*?PRES\.endPresenceTableau/,
  'leaving the scene stack preserves active persistence instead of faking physical contact');

for(const id of ['feeling','name-other','name-sarah','nothing','reason-money','reason-other','reason-superstition']){
  const story=JSON.parse(readFileSync(new URL(`../content/narrative/battle.chapel.${id}.story.json`,import.meta.url),'utf8'));
  assert.ok(story.nodes.start.lines.some((line)=>line.who==='surfer'&&line.text==='COME CLOSER'),
    `${id} repeats the dock command at the fifth-take introduction`);
}
assert.match(dockEndingBeat({spent:true})[0].text,/come closer/i);
assert.deepEqual(dockEndingBeat({spent:false}),[]);

console.log('loading dock compliance-tableau contracts passed');
