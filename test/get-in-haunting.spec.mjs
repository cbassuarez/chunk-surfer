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
} from '../src/game/get-in.js';

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

const source=readFileSync(new URL('../src/game/get-in.js',import.meta.url),'utf8');
for(const retired of ['RUPTURE','BLACKOUT','dock-surfer-reflection','dock-surfer-literal','blocksInput: true','blocksWorld: true']){
  assert.equal(source.includes(retired),false,`the get-in no longer depends on ${retired}`);
}
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const dockRuntime=main.slice(
  main.indexOf('// ── the get-in: LAST LOAD-OUT / impossible return'),
  main.indexOf("const GREY_DOOR_ID='dock-grey-exterior'"),
);
for(const retired of ["applyLensPreset('rupture')","possess('rupture'",'dock-surfer-reflection','dock-surfer-literal','stopAllCues']){
  assert.equal(dockRuntime.includes(retired),false,`the integrated get-in runtime no longer requests ${retired}`);
}
assert.match(dockRuntime,/stopCueGroup\('dock-haunting',\.001\)/,'the hard cut owns only tableau cues');
assert.match(dockRuntime,/Stack teardown is not contact[\s\S]*?onExit:[\s\S]*?PRES\.endPresenceTableau/,
  'leaving the scene stack preserves active persistence instead of faking physical contact');

// One chapel document now rather than seven, so the callback is asserted once.
// The line still has to be there: COME CLOSER is the dock's command coming back
// at the fifth take, and it is the whole reason the dock beat exists.
{
  const story=JSON.parse(readFileSync(new URL('../content/narrative/battle.chapel.story.json',import.meta.url),'utf8'));
  assert.ok(story.nodes.start.lines.some((line)=>line.who==='surfer'&&line.text==='COME CLOSER'),
    'the chapel repeats the dock command at the fifth-take introduction');
}
assert.match(dockEndingBeat({spent:true})[0].text,/come closer/i);
assert.deepEqual(dockEndingBeat({spent:false}),[]);

console.log('loading dock compliance-tableau contracts passed');

// ── departure is a fact, not an event ───────────────────────────────────────
// This exists because of a real save: four takes recorded, plainly deep in the
// building, and dock.departed still false — because the flag was only ever set
// by catching one exact step out of a portal cell, with a self-heal that ran on
// load and never again. That silently withheld the dock haunting, which refuses
// with 'not-departed', for the whole run.
{
  const { dockDepartureIsEvident } = await import('../src/game/get-in.js');
  const evident = (over = {}) => dockDepartureIsEvident({
    departed: false, steps: 40, inDockZone: false, ...over,
  });

  assert.equal(evident(), true, 'walked, and off the dock, is a departure');
  assert.equal(evident({ departed: true }), false, 'already recorded, nothing to re-set');
  assert.equal(evident({ inDockZone: true }), false, 'standing on the dock is not departing');
  assert.equal(evident({ steps: 0 }), false, 'a spawn is not a walk');
  assert.equal(dockDepartureIsEvident(), false, 'defaults refuse');

  // The rule used to also require setupComplete, and that is what kept the flag
  // false in play. main.js refuses the step out of the dock zone until setup is
  // done, so off-the-dock already proves it wherever that wall applies — and
  // wherever it does not (skiptut, a debug warp, no story mode, a legacy save)
  // the extra term was a permanent veto rather than a safeguard. An unrecorded
  // setup must not be able to un-leave a player who is standing in the building.
  assert.equal(
    dockDepartureIsEvident({ departed: false, steps: 1, inDockZone: false, setupComplete: false }),
    true,
    'setup state is not part of the rule, and a stale caller passing it changes nothing',
  );

  // The case that was broken: a player who left without the portal step being
  // caught must still become departed, and must therefore become eligible.
  const missed = evident({ steps: 1 });
  assert.equal(missed, true, 'one step off the dock is enough to recover a missed crossing');
  assert.deepEqual(
    deriveDockHauntingEligibility({ departed: true, spent: false, transitionKind: 'step', entryPortal: DOCK_PORTAL.FOYER }).eligible,
    true,
    'and a recovered departure re-enables the haunting it was withholding',
  );
  assert.equal(
    deriveDockHauntingEligibility({ departed: false, spent: false, transitionKind: 'step', entryPortal: DOCK_PORTAL.FOYER }).reason,
    'not-departed',
    'which is exactly what it refused with before',
  );
}
console.log('# dock departure evidence ok');
