import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMBAT_ACTION, SEND_BACK_COMPOSURE_SHARE, advanceEnemy, applyFireballImpact,
  applyFireballReturn, availableCombatActions, combatContinuationSnapshot,
  combatMoveSubtext, createCombatState, reduceCombat, runCombatTurn, sourceDesktopFrame,
} from '../src/game/combat-state.js';
import { combatActionReadout } from '../src/render/combat-view.js';
import { sourceCombatDefinition } from '../src/data/combat-definitions.js';

const definition = () => ({
  id:'source-desktop-fixture', kind:'source', enemy:'REFERENCE', baseComposure:40, sendBackOnBreak:true,
  movements:['call-site','borrowed-body','final-clause'].map((id)=>({
    id, coherence:100, intents:[
      {id:`${id}:first`,label:'ROOM',kind:'broadcast',damage:15,recordable:true,takeLabel:'ROOM',playbackDamage:10},
      {id:`${id}:second`,label:'LOAD',kind:'overload',damage:20},
      {id:`${id}:third`,label:'VEIL',kind:'conceal',damage:15},
    ],
  })),
});
const open = (options={}) => createCombatState(definition(), { difficulty:'standard', ...options });
const breakOnce = (state) => applyFireballImpact(state, { damage:999, castId:'break' });

test('first break opens persistent desktop, retains damage and intent; second break loses', () => {
  let state = open();
  Object.assign(state,{movementCoherence:37,intentIndex:2,cycleIndex:8,turns:8,movementDamage:14});
  const committed = structuredClone(state.committed), read = structuredClone(state.read);
  state = breakOnce(state);
  assert.equal(state.result, null);
  assert.equal(state.movementCoherence, 37);
  assert.equal(state.movementMaxCoherence, 100);
  assert.equal(state.movementDamage, 14);
  assert.equal(state.intentIndex, 2);
  assert.equal(state.cycleIndex, 8);
  assert.equal(state.turns, 8, 'projectile breach stole an ordinary turn');
  assert.deepEqual(state.committed, committed);
  assert.deepEqual(state.read, read);
  assert.equal(state.composure, Math.ceil(state.maxComposure * SEND_BACK_COMPOSURE_SHARE));
  assert.deepEqual(state.sentBack, ['call-site']);
  assert.equal(state.last.transition, null, 'opened the old room reprise');
  assert.equal(state.last.desktopBreach.first, true);
  assert.deepEqual(sourceDesktopFrame(state).cover, {count:0,capacity:2,guard:5,exposed:true});
  state = breakOnce(state);
  assert.equal(state.result.result, 'lose');
  assert.equal(state.sourceDesktop.tier, 1);
});

test('ordinary breaking blow consumes its beat once without resetting the cycle or read', () => {
  let state = open({composure:1});
  state.sourceDesktop.cover = 0;
  state.movementCoherence = 60;
  const read = structuredClone(state.read);
  state = runCombatTurn(state, {type:COMBAT_ACTION.WAIT});
  assert.equal(state.movementCoherence, 60);
  assert.equal(state.phase, 'select');
  assert.equal(state.cycleIndex, 1);
  assert.equal(state.turns, 1);
  assert.equal(state.turnsInMovement, 1);
  assert.notDeepEqual(state.read, read);
  assert.ok(state.last.desktopBreach);
  assert.ok(state.committed);
});

test('later movements retain desktop and escalate bounded shelter loss', () => {
  let state = open();
  for (let index=0; index<3; index+=1) {
    state = breakOnce(state);
    const frame = sourceDesktopFrame(state);
    assert.equal(frame.active, true);
    assert.equal(frame.tier, index+1);
    assert.equal(frame.cover.capacity, 2-index);
    assert.equal(frame.cover.guard, 5-index);
    assert.equal(state.last.desktopBreach.first, index===0);
    if(index<2) state = applyFireballReturn(state, {damage:999,castId:`clear-${index}`});
  }
  assert.equal(state.movementIndex, 2);
  assert.deepEqual(state.source.channels, {rescue:2,contain:0,submit:0});
  assert.equal(state.result, null);
});

test('cover blocks one hit; HOLD rebuilds a surviving plate in place of coherence damage', () => {
  let state = applyFireballImpact(open(), {damage:12});
  assert.equal(state.composure, 33);
  assert.equal(state.fireballImpact.received, 7);
  assert.equal(state.sourceDesktop.cover, 2);
  state = breakOnce(state);
  state.composure = state.maxComposure;
  state.definition.movements[0].intents[0].damage = 25;
  const coherence = state.movementCoherence;
  state = reduceCombat(state, {type:COMBAT_ACTION.HOLD});
  assert.equal(state.sourceDesktop.cover, 1);
  assert.equal(state.movementCoherence, coherence);
  assert.equal(state.last.dealt, 0);
  assert.match(state.last.notice, /COVER 1 \/ 2 · NO ATTACK/);
  state = advanceEnemy(state);
  assert.equal(state.sourceDesktop.cover, 0);
  assert.equal(state.last.cover.prevented, 5);
  assert.equal(state.composure, state.maxComposure-5);
});

test('EXPOSE trades one plate for five coherence; empty cover and flat torch never disable it', () => {
  const sheltered = open({battery:0,seed:7}), naked = structuredClone(sheltered);
  naked.sourceDesktop.cover = 0;
  const a = reduceCombat(sheltered, {type:COMBAT_ACTION.EXPOSE});
  const b = reduceCombat(naked, {type:COMBAT_ACTION.EXPOSE});
  assert.equal(a.last.dealt, b.last.dealt+5);
  assert.equal(a.sourceDesktop.cover, 2);
  assert.equal(a.last.cover.dealt, 5);
  assert.equal(a.battery, 0);
  const tile = availableCombatActions(sheltered).find((move)=>move.id===COMBAT_ACTION.EXPOSE);
  assert.ok(a.last.dealt >= tile.damageBand.min && a.last.dealt <= tile.damageBand.max, 'the tile omitted its promised cover damage');
  const actions = availableCombatActions(naked);
  assert.equal(actions.find((move)=>move.id===COMBAT_ACTION.EXPOSE).enabled, true);
  assert.equal(actions.find((move)=>move.id===COMBAT_ACTION.HOLD).enabled, true);
});

test('Source action tiles and expanded hints name the actual finite shelter trade',()=>{
  let state=open();
  let hold=availableCombatActions(state).find((move)=>move.id===COMBAT_ACTION.HOLD);
  assert.equal(combatActionReadout(hold),'COVER FULL');
  state=breakOnce(state);
  hold=availableCombatActions(state).find((move)=>move.id===COMBAT_ACTION.HOLD);
  assert.equal(combatActionReadout(hold),'REBUILD +1');
  assert.equal(hold.coverRebuild,1);
  assert.equal(hold.coverCapacity,2);
  assert.match(combatMoveSubtext(state,hold).long,/rebuilds one surviving plate \(0 → 1\/2\)/);
  assert.match(combatMoveSubtext(state,hold).long,/deals no coherence damage/);
  const emptyExpose=availableCombatActions(state).find((move)=>move.id===COMBAT_ACTION.EXPOSE);
  assert.equal(emptyExpose.coverCost,undefined);
  assert.match(combatMoveSubtext(state,emptyExpose).short,/NO COVER BONUS/);
  state.sourceDesktop.cover=1;
  const expose=availableCombatActions(state).find((move)=>move.id===COMBAT_ACTION.EXPOSE);
  assert.equal(combatActionReadout(expose),'COVER -1 · +5');
  assert.match(combatMoveSubtext(state,expose).long,/spends one cover plate for \+5 coherence/);
  for(let index=1;index<3;index+=1){state=applyFireballReturn(state,{damage:999});state=breakOnce(state);}
  hold=availableCombatActions(state).find((move)=>move.id===COMBAT_ACTION.HOLD);
  assert.equal(combatActionReadout(hold),'NO PLATES');
  assert.equal(hold.enabled,true);
  assert.match(combatMoveSubtext(state,hold).long,/braces against \d+ incoming/);
  const ordinary=createCombatState({...definition(),sendBackOnBreak:false});
  const ordinaryHold=availableCombatActions(ordinary).find((move)=>move.id===COMBAT_ACTION.HOLD);
  assert.equal(ordinaryHold.coverRebuild,undefined);
  assert.match(combatActionReadout(ordinaryHold),/GUARD/);
  assert.match(combatMoveSubtext(ordinary,ordinaryHold).long,/guards \d+ incoming/);
});

test('mid-movement checkpoint restores damage, pending turn, read, resources, votes and shelter exactly', () => {
  let state = breakOnce(open({seed:37,tools:{rig:true,coffee:true}}));
  state = reduceCombat(state, {type:COMBAT_ACTION.CHANNEL,channel:'contain'});
  state = runCombatTurn(state, {type:COMBAT_ACTION.MONITOR,replaceTake:true});
  if(state.tempo) state = reduceCombat(state, {type:COMBAT_ACTION.END_TEMPO});
  state = reduceCombat(state, {type:COMBAT_ACTION.HOLD});
  const checkpoint = combatContinuationSnapshot(state);
  const restored = createCombatState(definition(), {difficulty:'standard',tools:{rig:true,coffee:true},continuation:JSON.parse(JSON.stringify(checkpoint))});
  assert.deepEqual(combatContinuationSnapshot(restored), checkpoint);
  assert.equal(restored.movementCoherence, state.movementCoherence);
  assert.deepEqual(combatContinuationSnapshot(advanceEnemy(restored)), combatContinuationSnapshot(advanceEnemy(state)));
  assert.equal(breakOnce(restored).result.result, 'lose', 'reload restored a spent break');
});

test('old continuation retains a spent break and conservatively opens an empty shelter', () => {
  const def = sourceCombatDefinition();
  const state = createCombatState(def, {continuation:{composure:20,sentBack:['call-site']}});
  assert.equal(state.sourceDesktop.breached, true);
  assert.equal(state.sourceDesktop.cover, 0);
  assert.equal(sourceDesktopFrame(state).cover.capacity, 2);
  assert.equal(state.movementCoherence, state.movementMaxCoherence);
  assert.equal(breakOnce(state).result.result, 'lose');
});

test('a ranged phase clear retires the old pending blow and banks its phase vote once', () => {
  let state = breakOnce(open());
  state = reduceCombat(state,{type:COMBAT_ACTION.WAIT});
  assert.equal(state.phase,'enemy');
  state = applyFireballReturn(state,{damage:999,castId:'phase-clear'});
  assert.equal(state.movementIndex,1);
  assert.equal(state.phase,'select');
  assert.equal(state.pendingEnemy,null);
  assert.equal(state.source.channels.rescue,1);
  assert.deepEqual(advanceEnemy(state),state);
  const restored = createCombatState(definition(),{continuation:combatContinuationSnapshot(state)});
  assert.equal(restored.movementIndex,1);
  assert.equal(restored.source.channels.rescue,1);
  assert.equal(restored.phase,'select');
});

test('baseline defense and timed parry still work after every plate has been destroyed', () => {
  let state = open();
  for(let index=0;index<3;index+=1) {
    state = breakOnce(state);
    if(index<2) state = applyFireballReturn(state,{damage:999});
  }
  state.composure = state.maxComposure;
  state = runCombatTurn(state,{type:COMBAT_ACTION.WAIT});
  const hurt = state.composure;
  const coherence = state.movementCoherence;
  state = reduceCombat(state,{type:COMBAT_ACTION.PARRY,tier:'perfect'});
  assert.ok(state.composure>hurt);
  assert.ok(state.movementCoherence<coherence);
  assert.equal(sourceDesktopFrame(state).cover.capacity,0);
  const guarded = reduceCombat({...state,tempo:false},{type:COMBAT_ACTION.HOLD});
  assert.equal(guarded.sourceDesktop.cover,0);
  assert.equal(guarded.phase,'enemy');
  assert.ok(guarded.pendingEnemy.prevention>0);
});

test('perfect lethal parry cancels only its provisional first breach without healing beyond the struck pool', () => {
  const before = reduceCombat(open({composure:1}), {type:COMBAT_ACTION.WAIT});
  const hit = advanceEnemy(before);
  assert.ok(hit.last.desktopBreach);
  const parried = reduceCombat(hit,{type:COMBAT_ACTION.PARRY,tier:'perfect'});
  assert.equal(parried.composure,before.composure);
  assert.equal(parried.result,null);
  assert.equal(parried.last.desktopBreach,null);
  assert.deepEqual(parried.sentBack,[]);
  assert.equal(parried.sourceDesktop.breached,false);
  assert.equal(parried.sourceDesktop.tier,0);
  assert.equal(parried.sourceDesktop.cover,2,'the plate that actually guarded the hit stays spent');
  assert.equal(sourceDesktopFrame(parried).cover.capacity,3);
  assert.equal(parried.cycleIndex,hit.cycleIndex);
  assert.deepEqual(parried.read,hit.read);
  assert.equal(parried.last.received,0);
  assert.deepEqual(reduceCombat(parried,{type:COMBAT_ACTION.PARRY,tier:'perfect'}),parried);
});

test('successful lethal parry after a projectile breach retains that earlier break and cancels the ordinary KO', () => {
  let before = breakOnce(open());
  const desktop = structuredClone(before.sourceDesktop);
  before.composure = 1;
  before = reduceCombat(before,{type:COMBAT_ACTION.WAIT});
  const hit = advanceEnemy(before);
  assert.equal(hit.result.result,'lose');
  const parried = reduceCombat(hit,{type:COMBAT_ACTION.PARRY,tier:'good'});
  assert.equal(parried.result,null);
  assert.equal(parried.composure,1);
  assert.equal(parried.phase,'select');
  assert.deepEqual(parried.sentBack,['call-site']);
  assert.deepEqual(parried.sourceDesktop,desktop);
  assert.equal(parried.last.desktopBreach,null);
  assert.equal(parried.cycleIndex,1);
  assert.ok(parried.committed);
  assert.equal(parried.stance.dwell,before.stance.dwell+1);
  assert.notDeepEqual(parried.read,before.read);
});

test('late lethal parry regrades the original damage and cannot heal on top of a spent recovery', () => {
  const hit = advanceEnemy(reduceCombat(open({composure:1}),{type:COMBAT_ACTION.WAIT}));
  const late = reduceCombat(hit,{type:COMBAT_ACTION.PARRY,tier:'late'});
  assert.equal(late.composure,Math.ceil(late.maxComposure*.5));
  assert.ok(late.last.desktopBreach);
  assert.deepEqual(late.sentBack,['call-site']);
  let spent = breakOnce(open());
  spent.composure=1;
  spent=advanceEnemy(reduceCombat(spent,{type:COMBAT_ACTION.WAIT}));
  const lost=reduceCombat(spent,{type:COMBAT_ACTION.PARRY,tier:'late'});
  assert.equal(lost.composure,0);
  assert.equal(lost.result.result,'lose');
  assert.deepEqual(lost.sentBack,['call-site']);
});

test('a late parry that makes the original blow survivable preserves only its residual damage', () => {
  const before=reduceCombat(open({composure:15}),{type:COMBAT_ACTION.WAIT});
  before.sourceDesktop.cover=0;
  const hit=advanceEnemy(before);
  assert.ok(hit.last.desktopBreach);
  const damage=hit.last.enemyHits.reduce((sum,entry)=>sum+entry.received,0);
  const late=reduceCombat(hit,{type:COMBAT_ACTION.PARRY,tier:'late'});
  assert.equal(late.composure,before.composure-damage+Math.round(damage*.5));
  assert.equal(late.result,null);
  assert.equal(late.last.desktopBreach,null);
  assert.deepEqual(late.sentBack,[]);
});

test('Source lethal parry clears a reflected phase and banks its vote exactly once', () => {
  let before=open({composure:1});
  before.movementCoherence=9;
  before=reduceCombat(before,{type:COMBAT_ACTION.WAIT});
  const hit=advanceEnemy(before);
  const parried=reduceCombat(hit,{type:COMBAT_ACTION.PARRY,tier:'perfect'});
  assert.equal(parried.movementIndex,1);
  assert.equal(parried.source.channels.rescue,1);
  assert.equal(parried.composure,1);
  assert.equal(parried.last.desktopBreach,null);
  assert.deepEqual(parried.sentBack,[]);
  assert.deepEqual(reduceCombat(parried,{type:COMBAT_ACTION.PARRY}),parried);
});

test('a terminal projectile after the provisional ordinary hit cannot be undone by its older parry baseline', () => {
  let state=advanceEnemy(reduceCombat(open({composure:1}),{type:COMBAT_ACTION.WAIT}));
  state=applyFireballImpact(state,{damage:999,castId:'later-projectile'});
  assert.equal(state.result.result,'lose');
  assert.deepEqual(reduceCombat(state,{type:COMBAT_ACTION.PARRY,tier:'perfect'}),state);
});

test('simultaneous first break and clear advances once; simultaneous second break is terminal', () => {
  const def = definition();
  def.signature = {id:'feedback'};
  let state = createCombatState(def, {composure:5});
  state.take = {id:'room',label:'ROOM',damage:999,tag:'body'};
  state = reduceCombat(state, {type:COMBAT_ACTION.PLAYBACK});
  assert.equal(state.result, null);
  assert.equal(state.movementIndex, 1);
  assert.equal(state.source.channels.rescue, 1);
  assert.deepEqual(state.sentBack, ['call-site']);
  assert.ok(state.last.desktopBreach);
  assert.deepEqual(advanceEnemy(state).source.channels, state.source.channels);
  let lost = createCombatState(def, {continuation:{composure:5,sentBack:['call-site']}});
  lost.take = {id:'room',label:'ROOM',damage:999,tag:'body'};
  lost = reduceCombat(lost, {type:COMBAT_ACTION.PLAYBACK});
  assert.equal(lost.result.result, 'lose');
  assert.equal(lost.movementIndex, 0);
  assert.equal(lost.source.channels.rescue, 0);
});

test('non-opted fights retain their first-break loss and ordinary HOLD attack', () => {
  const state = createCombatState({...definition(),sendBackOnBreak:false});
  assert.equal(state.sourceDesktop, null);
  assert.equal(breakOnce(state).result.result, 'lose');
  state.committed = {id:'call-site:second',index:state.intentIndex};
  assert.ok(reduceCombat(state, {type:COMBAT_ACTION.HOLD}).last.dealt>0);
});
