import assert from 'node:assert/strict';
import {
  HUSH_BRUSH_OUTCOME,
  HUSH_CONTACT_KIND,
  HUSH_CONTACT_LIMITS,
  HUSH_SENSATION_MODE,
  buildHushReleaseNote,
  buildHushSensationTree,
  chooseHushReleaseDestination,
  chooseHushContactExperience,
  freshHushContactDirectorState,
  hushContactWeights,
  normalizeHushContactDirectorState,
  noteHushWarningShown,
  rememberHushContent,
  resolveHushSensationChoice,
  updateHushWarningSchedule,
} from '../src/game/hush-contact.js';
import { runtimeTree } from '../src/narrative/runtime-content.js';

const authoredTree=runtimeTree('conservatory.hush');
const fixed=(...values)=>{let at=0;return()=>values[Math.min(values.length-1,at++)]??0;};

// Director defaults and eligibility.
assert.deepEqual(normalizeHushContactDirectorState(null),freshHushContactDirectorState());
assert.deepEqual(hushContactWeights({takenEligible:true,state:{}}),{brush:.25,taken:.375,hard:.375});
for(const excluded of [
  {tutorial:true},{sourceSpace:true},{recording:true},{thoughtOpen:true},{brushOpen:true},
  {takeBreak:true},{cooldownReady:false},{state:{lastKind:'brush'}},{state:{brushesShown:4}},
]){
  assert.equal(hushContactWeights({...excluded,takenEligible:true}).brush,0,`brush excluded by ${JSON.stringify(excluded)}`);
}
assert.deepEqual(hushContactWeights({takenEligible:false,state:{}}),{brush:.25,taken:0,hard:.75});

// The first roll selects the kind, the second only seeds its dialogue.
assert.equal(chooseHushContactExperience({state:{}},{rng:fixed(.1,.2)}).kind,HUSH_CONTACT_KIND.BRUSH);
assert.equal(chooseHushContactExperience({state:{}},{rng:fixed(.3,.2)}).kind,HUSH_CONTACT_KIND.TAKEN);
assert.equal(chooseHushContactExperience({state:{}},{rng:fixed(.9,.2)}).kind,HUSH_CONTACT_KIND.HARD);
assert.equal(chooseHushContactExperience({takenEligible:false,state:{}},{rng:fixed(.8,.2)}).kind,HUSH_CONTACT_KIND.HARD);

const drought={...freshHushContactDirectorState(),eligibleSinceBrush:HUSH_CONTACT_LIMITS.brushDroughtRaiseAt};
assert.equal(hushContactWeights({state:drought}).brush,.5,'third missed opportunity raises brush chance');
const forced={...drought,eligibleSinceBrush:HUSH_CONTACT_LIMITS.brushDroughtForceAt};
assert.equal(chooseHushContactExperience({state:forced},{rng:fixed(.999,.2)}).kind,HUSH_CONTACT_KIND.BRUSH,'fifth eligible attempt is guaranteed');
const brush=chooseHushContactExperience({state:{}},{rng:fixed(0,.2)});
assert.equal(brush.state.brushesShown,1);
assert.equal(brush.state.eligibleSinceBrush,0);
assert.equal(hushContactWeights({state:brush.state}).brush,0,'brush cannot repeat immediately');

// Warning hysteresis, spacing, and cap.
let schedule={armed:true,readyAt:0};
let warningState=freshHushContactDirectorState();
schedule=updateHushWarningSchedule(schedule,{now:10,pressure:.5,distance:60,recoilDistance:48,state:warningState});
assert.equal(schedule.shouldOpen,true);
warningState=noteHushWarningShown(warningState,['first']);
assert.equal(updateHushWarningSchedule(schedule,{now:20,pressure:.6,distance:60,recoilDistance:48,state:warningState}).shouldOpen,false);
schedule=updateHushWarningSchedule(schedule,{now:30,pressure:.1,distance:60,recoilDistance:48,state:warningState});
assert.equal(schedule.armed,true,'pressure must fall before another warning can arm');
assert.equal(updateHushWarningSchedule(schedule,{now:1000,pressure:.6,distance:60,recoilDistance:48,state:warningState}).shouldOpen,false,'cooldown still holds');
const later=updateHushWarningSchedule(schedule,{now:HUSH_CONTACT_LIMITS.warningCooldownMs+20,pressure:.6,distance:60,recoilDistance:48,state:warningState});
assert.equal(later.shouldOpen,true);
assert.equal(updateHushWarningSchedule({armed:true,readyAt:0},{now:1,pressure:.6,distance:60,recoilDistance:48,state:{warningsShown:3}}).shouldOpen,false);

const elsewhere=chooseHushReleaseDestination({
  player:{x:0,y:0},currentRoom:'here',minimumDistance:18,seed:3,
  candidates:[
    {id:'here',point:{x:100,y:0},occlusion:30},
    {id:'near',point:{x:10,y:0},occlusion:30},
    {id:'open',point:{x:80,y:0},occlusion:2},
    {id:'behind-wall',point:{x:60,y:60},occlusion:18},
    {id:'blocked',point:{x:120,y:0},occlusion:40,valid:false},
  ],
});
assert.equal(elsewhere.id,'behind-wall','release prefers a valid, distant, occluded other room');
const releaseNote=buildHushReleaseNote({target:elsewhere,player:{x:0,y:0},right:{x:1,y:0},seed:3});
assert.equal(releaseNote.cueId,'violin.mischief.01');
assert.ok(releaseNote.audio.lowpassHz<1800&&releaseNote.audio.gainScale<.42);
assert.deepEqual({
  playerGenerated:releaseNote.event.semantics.playerGenerated,
  audibleToHush:releaseNote.event.semantics.audibleToHush,
  canSpoilTake:releaseNote.event.semantics.canSpoilTake,
},{playerGenerated:false,audibleToHush:false,canSpoilTake:false});
assert.equal(releaseNote.caption,'[a single note, elsewhere]');

// Dialogue is deterministic, variable, and every visible answer is mechanically
// ambiguous across encounters. Safety is assigned after the visible set exists.
const one=buildHushSensationTree({mode:'brush',authoredTree,seed:4417});
const same=buildHushSensationTree({mode:'brush',authoredTree,seed:4417});
assert.deepEqual(one,same,'same seed produces the same authored encounter');
assert.ok(one.choiceCount===3||one.choiceCount===4);
assert.ok(one.savingCount===1||one.savingCount===2);
assert.equal(one.tree.start.choices.filter((choice)=>choice.hushOutcome==='release').length,one.savingCount);
assert.ok(one.tree.start.choices.every((choice)=>one.tree[choice.goto]));

const seen=new Map();
const signatures=new Set();
for(let seed=1;seed<=1800;seed++){
  const built=buildHushSensationTree({mode:HUSH_SENSATION_MODE.BRUSH,authoredTree,seed});
  signatures.add(JSON.stringify({lines:built.tree.start.lines.map((line)=>line.sourceId),choices:built.tree.start.choices.map((choice)=>choice.hushChoiceId)}));
  for(const choice of built.tree.start.choices){
    const outcomes=seen.get(choice.hushChoiceId)||new Set();
    outcomes.add(choice.hushOutcome);
    seen.set(choice.hushChoiceId,outcomes);
  }
}
assert.ok(signatures.size>100,'the encounter catalogue materially varies');
assert.equal(seen.size,12,'every authored answer enters the sampled set');
for(const [id,outcomes] of seen){
  assert.deepEqual([...outcomes].sort(),['hard','release'],`${id} can both save and fail`);
}

const proximity=buildHushSensationTree({mode:HUSH_SENSATION_MODE.PROXIMITY,authoredTree,seed:13});
assert.equal(proximity.savingCount,0);
assert.ok(proximity.tree.start.choices.every((choice)=>!Object.hasOwn(choice,'hushOutcome')),'proximity answers carry no hidden transaction outcome');
for(const node of Object.values(proximity.tree).slice(1))assert.ok(node.lines.every((line)=>line.hushRole==null));
const remembered=rememberHushContent(freshHushContactDirectorState(),one.usedContentIds);
const next=buildHushSensationTree({mode:'brush',authoredTree,seed:4418,recentContentIds:remembered.recentContentIds});
assert.equal(next.usedContentIds.filter((id)=>one.usedContentIds.includes(id)).length,0,'the next encounter avoids the previous content');
assert.deepEqual(resolveHushSensationChoice(null),{outcome:HUSH_BRUSH_OUTCOME.HARD,choiceId:'unknown'});

const visibleText=Object.values(authoredTree).flatMap((node)=>[
  ...(node.lines||[]).map((line)=>line.text),...(node.choices||[]).map((choice)=>choice.text),
]).join(' ').toLowerCase();
for(const forbidden of ['contact','release','target','safe'])assert.ok(!visibleText.includes(forbidden),`visible copy does not expose ${forbidden}`);

console.log('hush contact director and dialogue specs passed');
