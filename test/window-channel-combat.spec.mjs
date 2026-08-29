import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCombatScene } from '../src/game/combat.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { applyFireballReturn, createCombatState } from '../src/game/combat-state.js';
import { FIREBALL_RETURN_DAMAGE } from '../src/game/fireball-exchange.js';
import { compileFireballCastPlan } from '../src/game/window-channel.js';

function harness(){
  const profile=authoredCombatProfile('natatorium');
  const combat={id:'natatorium',enemy:'TEST',baseComposure:40,...profile,movements:[profile.movements[0]]};
  const battle={id:'natatorium',enemy:'TEST',intro:[],win:[],lose:[],combat};
  const calls=[];let sequence=0;const noop=()=>{};
  const interference={
    enter:()=>{},movement:(event)=>calls.push(['movement',event.id]),
    beginFireballCast:(event)=>{const plan=compileFireballCastPlan({battleId:'natatorium',...event,castSequence:sequence++});calls.push(['cast',plan.castId]);return plan;},
    resolveFireballCast:(event)=>calls.push(['resolve',event]),impact:(event)=>calls.push(['impact',event.received]),
    finish:()=>{},active:()=>true,statusLine:()=>'',line:()=>null,phaseBreak:()=>{},
  };
  const scene=makeCombatScene({battle,difficulty:{},getAudio:()=>null,playSound:noop,
    fx:{stopCues:noop,flash:noop,cue:noop,glitch:noop,shake:noop},audio:{stopTyping:noop,menuMove:noop,menuConfirm:noop},
    loadout:{tools:{}},resources:{playImpact:noop,playTool:noop},interference});
  scene.enter();
  return{scene,calls,combat};
}

test('fireballs spawn and advance while the command deck is idle, without an attack turn',()=>{
  const {scene,calls}=harness();
  assert.equal(scene.battleView().phase,'tool');
  scene.update(.71);
  const first=scene.battleView().fireball;
  assert.ok(first.active);
  assert.equal(first.active.plan.source,'ranged');
  assert.equal('intentId' in first.active.plan,false);
  const progress=first.active.progress;
  scene.update(.4);
  assert.ok(scene.battleView().fireball.active.progress>progress);
  assert.equal(calls.some(([kind])=>kind==='cast'),true);
  scene.exit();
});

test('ordinary parry does not deflect or reverse the independent fireball cast',()=>{
  const {scene,calls}=harness();
  scene.update(.71);
  const id=scene.battleView().fireball.active.plan.castId;
  scene.key({key:'ArrowDown'});scene.key({key:'Enter'});scene.update(1.21);
  assert.equal(scene.battleView().resolution.side,'enemy');
  scene.update(.84);scene.key({controllerAction:'confirm'});
  const fireball=scene.battleView().fireball.active;
  assert.equal(fireball.plan.castId,id);
  assert.equal(fireball.plan.state,'outbound');
  assert.equal(calls.some(([kind,event])=>kind==='resolve'&&event.state==='reversed'),false);
  scene.exit();
});

test('ranged RETURN damages coherence without consuming or advancing a regular turn',()=>{
  const {combat}=harness();
  const state=createCombatState(combat,{difficulty:{},tools:{}});
  const turns=state.turns;
  const coherence=state.movementCoherence;
  const next=applyFireballReturn(state,{castId:'fireball:test',damage:FIREBALL_RETURN_DAMAGE});
  assert.equal(next.turns,turns);
  assert.equal(next.movementCoherence,Math.max(0,coherence-FIREBALL_RETURN_DAMAGE));
  assert.equal(next.actionLog.at(-1).action,'fireball-return');
});
