import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_ACTION as A, TECHNIQUE, PARRY_TIER, advanceEnemy, availableCombatActions,
  combatContinuationSnapshot, combatIntentLookahead, combatResult, createCombatState,
  currentCombatIntent, predictedCombatIntent, reduceCombat, selectEnemyIntents,
} from '../src/game/combat-state.js';
import {attachCombatDefinition,sourceCombatBattle} from '../src/data/combat-definitions.js';
import {COMBAT_RULES} from '../src/progression/difficulty-defs.js';
import {availableBattleTools,COMBAT_TOP_CAPACITY} from '../src/game/combat-loadout.js';

const seeds=[0,1,2,3,11,42,31337,2130706433];
const definitions={chapel:attachCombatDefinition({id:'chapel',enemy:'chapel',rounds:[]}).combat,
  source:sourceCombatBattle().combat};
const top=['light','recorder','interface','tuning-fork'];
assert.equal(top.length,COMBAT_TOP_CAPACITY);
const order=availableBattleTools({top},top.map(id=>({id,present:true})));
const tools={...Object.fromEntries(['torch','recorder','rig','fork','radio','coffee'].map(id=>[id,order.includes(id)])),order};
const counters={broadcast:A.MONITOR,overload:A.HOLD,conceal:A.EXPOSE,loop:A.INVERT,silence:A.EXPOSE};
function play({encounter='chapel',incoming=20,injuries=0,preset='standard',seed=42,reaction='none',policy='cautious'}={}){
  let state=createCombatState(definitions[encounter],{tools,composure:incoming,injuries,battery:0,seed,difficulty:COMBAT_RULES[preset]});
  const kinds=new Set(),actions=[];let offered=0;
  for(let guard=0;!state.result&&guard<300;guard++){
    const open=availableCombatActions(state).filter(m=>m.enabled),pick=ids=>ids.find(id=>open.some(m=>m.id===id))||A.WAIT;
    const intent=predictedCombatIntent(state),movement=state.definition.movements[state.movementIndex];let id;
    if(policy==='blind')id=pick([A.TUNE,A.MONITOR,A.EXPOSE]);
    else if(policy==='proof'&&movement.id==='source'&&state.take?.tag==='body'&&!state.proofs.includes('return.source'))id=A.PLAYBACK;
    else if(open.some(m=>m.id===A.TUNE))id=A.TUNE;
    else if(['cautious','proof'].includes(policy)&&state.composure<=state.maxComposure*.5&&open.some(m=>m.id===A.COMPOSE))id=A.COMPOSE;
    else id=pick([counters[intent?.kind],A.PLAYBACK,A.EXPOSE,A.MONITOR,A.HOLD]);
    actions.push(id);state=reduceCombat(state,{type:id,replaceTake:true});
    for(let actor=0;state.phase==='enemy'&&!state.result&&actor<4;actor++){
      const primary=selectEnemyIntents(state)[0];state=advanceEnemy(state);offered++;
      for(const hit of state.last.enemyHits||[])kinds.add(hit.kind);
      const tier=reaction==='mixed'?(offered%3===0?null:offered%3===1?PARRY_TIER.LATE:PARRY_TIER.GOOD)
        :reaction==='good'?PARRY_TIER.GOOD:reaction==='perfect'?PARRY_TIER.PERFECT:null;
      if(tier&&['broadcast','overload','loop'].includes(primary?.kind))state=reduceCombat(state,{type:A.PARRY,tier});
    }
  }
  return{state,kinds,actions};
}

test('a fork-muted Broadcast passes once and its free counter TEMPO remains',()=>{
  // A pinned deck isolates consumption from the opponent's valid choice to
  // commit a Broadcast again after the old commitment has passed.
  let state=createCombatState({...definitions.chapel,pinnedCycle:true},{tools,seed:42});
  const first=currentCombatIntent(state).id,before=state.composure;
  state=reduceCombat(state,{type:A.TUNE});
  assert.equal(state.turns,0);assert.equal(state.forkMutedIntent,first);
  assert.equal(combatIntentLookahead(state).length,2);
  assert.match(state.last.notice,/BROADCAST MUTED.*PASSES AFTER THIS BEAT/);
  state=reduceCombat(state,{type:A.MONITOR,replaceTake:true});
  assert.equal(state.phase,'enemy');assert.equal(state.tuneBonus,0);
  state=advanceEnemy(state);
  assert.equal(state.composure,before);assert.deepEqual(state.last.enemyHits,[]);
  assert.notEqual(currentCombatIntent(state).id,first,'a silent Broadcast is not offered as a second safe capture');
  assert.equal(state.turns,1);assert.equal(state.tempo,true);
  assert.equal(state.skipEnemyBeat,false);assert.equal(state.forkMutedIntent,null);
  assert.match(state.last.notice,/BROADCAST PASSES/);
  assert.equal(availableCombatActions(state).find(m=>m.id===A.TUNE).enabled,false);
});

test('RUNAWAY FEEDBACK still postpones its committed card rather than consuming it',()=>{
  let state=createCombatState(definitions.chapel,{tools,seed:42,techniques:[TECHNIQUE.OVERDUB,TECHNIQUE.RUNAWAY_FEEDBACK]});
  state.charge=state.maxCharge;state.movementCoherence=100;
  const first=currentCombatIntent(state).id,turn=state.turns;
  state=reduceCombat(state,{type:A.RUNAWAY_FEEDBACK});state=advanceEnemy(state);
  assert.equal(currentCombatIntent(state).id,first);assert.equal(state.turns,turn);
  assert.equal(state.last.received,0);assert.equal(state.forkMutedIntent,null);
  assert.match(state.last.notice,/MISSES ITS BEAT/);
});

test('other fork responses retain conceal exposure, loop lock, silence advance and overload resonance',()=>{
  const intents=definitions.source.movements.flatMap(m=>m.intents);
  for(const kind of ['conceal','loop','silence','overload']){
    const first=intents.find(i=>i.kind===kind),broadcast=intents.find(i=>i.kind==='broadcast');
    const def={...definitions.source,pinnedCycle:true,music:{mode:'fixed',lead:'lead-1'},movements:[{...definitions.source.movements[0],intents:[first,broadcast]}]};
    let state=createCombatState(def,{tools,seed:42});state.enemyGuard={mode:'dodge'};
    const tuned=reduceCombat(state,{type:A.TUNE});
    assert.equal(tuned.last.tuned,kind);assert.equal(tuned.forkMutedIntent,null);assert.equal(tuned.skipEnemyBeat,false);
    assert.equal(tuned.tuneBonus,5);assert.equal(tuned.tuneUsedMovement,0);
    if(kind==='conceal'){assert.equal(tuned.enemyGuard,null);assert.ok(tuned.exposedBonus>=5);}
    else if(kind==='silence'){assert.equal(currentCombatIntent(tuned).id,broadcast.id);assert.equal(tuned.turns,1);}
    else{assert.equal(currentCombatIntent(tuned).id,first.id);assert.equal(tuned.turns,0);}
  }
});

test('killing a movement clears its unspent fork mute instead of protecting the next movement',()=>{
  let state=createCombatState(definitions.chapel,{tools,seed:42});
  state=reduceCombat(state,{type:A.TUNE});state.movementCoherence=1;
  state=reduceCombat(state,{type:A.MONITOR,replaceTake:true});
  assert.equal(state.movementIndex,1);assert.equal(state.skipEnemyBeat,false);assert.equal(state.forkMutedIntent,null);
  state=reduceCombat(state,{type:A.MONITOR,replaceTake:true});state=advanceEnemy(state);
  assert.ok(state.last.enemyHits.length>0,'the next movement owns a real beat');
});

test('closing a TEMPO channel retires its reserved mute before the next card',()=>{
  let state=createCombatState(definitions.chapel,{tools,seed:42});state.tempo=true;
  state=reduceCombat(state,{type:A.TUNE});const first=currentCombatIntent(state).id;
  state=reduceCombat(state,{type:A.END_TEMPO});
  assert.notEqual(currentCombatIntent(state).id,first);assert.equal(state.forkMutedIntent,null);assert.equal(state.skipEnemyBeat,false);
});

test('Source continuation retains the pending mute without spending cover or replaying a muted card',()=>{
  let state=createCombatState(definitions.source,{tools,seed:42});state.sourceDesktop.breached=true;
  const cover=structuredClone(state.sourceDesktop);
  state=reduceCombat(state,{type:A.TUNE});state=reduceCombat(state,{type:A.MONITOR,replaceTake:true});
  const saved=combatContinuationSnapshot(state);
  const restored=createCombatState(definitions.source,{tools,continuation:saved});
  assert.equal(restored.forkMutedIntent,state.forkMutedIntent);
  const actual=advanceEnemy(state),resumed=advanceEnemy(restored);
  for(const value of [actual,resumed]){
    assert.deepEqual(value.sourceDesktop,cover);assert.equal(value.forkMutedIntent,null);
    assert.equal(value.turns,1);assert.equal(value.tempo,true);assert.equal(currentCombatIntent(value).id,'source:alias');
  }
  assert.equal(actual.composure,resumed.composure);assert.equal(actual.charge,resumed.charge);
  const invalid=structuredClone(saved);invalid.sourceCombat.forkMutedIntent='source:not-a-card';
  assert.equal(createCombatState(definitions.source,{tools,continuation:invalid}).forkMutedIntent,null);
});

test('late authored phases have space for a changed card without raising earlier Chapel health',()=>{
  assert.deepEqual(definitions.chapel.movements.map(m=>m.coherence),[20,20,30,30,30]);
  assert.deepEqual(definitions.source.movements.map(m=>m.coherence),[30,30,30]);
  assert.equal(sourceCombatBattle({bodyReturn:true}).combat.movements[1].coherence,20,'earned Body Return assistance remains');
});

test('wounded legal signal kits can deliberately recover and return the body without requiring a reaction',()=>{
  for(const preset of ['guided','standard'])for(const injuries of [0,2,4])for(const seed of seeds){
    const {state,actions}=play({incoming:20,injuries,preset,seed,policy:'proof'});
    assert.equal(state.result?.result,'win',`${preset}/${injuries}/${seed}`);
    assert.ok(combatResult(state).finale.grants.includes('route.surfaced'),'survival and deliberate proof are both attainable');
    if(injuries===0)assert.ok(actions.includes(A.COMPOSE),'recovery comes from an explicit chosen action');
  }
});

test('blind repeated MONITOR meets later threats; informed and timed responses retain their reward',()=>{
  for(const encounter of ['chapel','source'])for(const seed of seeds){
    const blind=play({encounter,incoming:40,seed,policy:'blind'});
    const reading=play({encounter,incoming:40,seed,policy:'reading'});
    assert.ok(blind.kinds.size>=2,'blind capture sees a changed enemy situation');
    assert.ok(blind.state.composure<reading.state.composure,'reading the changed card protects resources');
    for(const reaction of ['mixed','good','perfect']){
      const prepared=play({encounter,incoming:20,seed,reaction,policy:'proof'});
      assert.equal(prepared.state.result?.result,'win',`${encounter}/${seed}/${reaction}`);
    }
    const perfect=play({encounter,incoming:40,seed,reaction:'perfect',policy:'reading'});
    assert.equal(perfect.state.composure,perfect.state.maxComposure,'expert no-hit remains attainable');
  }
});
