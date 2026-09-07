import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattlePreparationModel } from '../src/game/battle-preparation-model.js';
import { makeBattlePreparation } from '../src/game/battle-preparation.js';
import { normalizeCombatBuild, PIN_SOURCES } from '../src/game/combat-progression.js';
import { TECHNIQUE as T } from '../src/game/combat-state.js';
import { makeCombatScene } from '../src/game/combat.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
const funded=()=>normalizeCombatBuild(null,PIN_SOURCES.encounters);
const equipment=['light','recorder','radio','interface'];

test('preparation edits an owned-gear draft without changing the save',()=>{
  const loadout={top:['light','recorder','radio']},build=funded();
  const m=createBattlePreparationModel({loadout,build,equipment:[...equipment,{id:'coffee',present:false}]});
  m.slot(1);assert.equal(m.equip('interface'),true);assert.equal(m.equip('coffee'),false);
  assert.deepEqual(m.snapshot().loadout.top,['light','interface','radio']);
  assert.deepEqual(loadout.top,['light','recorder','radio']);assert.deepEqual(build.techniques,[]);
  m.store();m.slot(3);assert.equal(m.equip('recorder'),true);assert.deepEqual(m.snapshot().loadout.top,['light','radio','recorder']);
});
test('empty inventory never restores default phantom equipment',()=>{
  const m=createBattlePreparationModel({equipment:[]});assert.deepEqual(m.snapshot().loadout.top,[]);
  assert.equal(m.equip('light'),false);assert.equal(m.store(),false);
});
test('patching and pulling preserve prerequisites and the earned-lead budget',()=>{
  const m=createBattlePreparationModel({equipment,build:funded(),hasRig:true});
  for(const id of [T.AFTERIMAGE,T.WHITEOUT,T.OVEREXPOSE]){m.skill(id);assert.equal(m.patch().changed,true);}
  assert.equal(m.snapshot().build.unspent,0);m.skill(T.AFTERIMAGE);assert.equal(m.patch().changed,true);
  assert.deepEqual(m.snapshot().build.techniques,[]);assert.equal(m.snapshot().build.unspent,3);
});
test('READY commits once and a failed save leaves a retryable draft',()=>{
  const m=createBattlePreparationModel({equipment});let calls=0;
  assert.equal(m.commit(()=>{calls++;return false;}),false);assert.equal(m.snapshot().committed,false);
  assert.equal(m.commit(value=>{calls++;value.loadout.top.length=0;}),true);assert.ok(m.snapshot().loadout.top.length);
  assert.equal(m.commit(()=>calls++),false);assert.equal(calls,2);assert.equal(m.store(),false);
});
test('the preparation input gate rejects carried and repeated confirmation',()=>{
  let applied=0,ready=0;const p=makeBattlePreparation({getEquipment:()=>equipment,apply:()=>applied++,onReady:()=>ready++});
  p.key({key:'Enter'});p.update(.3);p.key({key:'Enter',repeat:true});assert.equal(applied,0);
  p.key({controllerAction:'start'});p.key({key:'Enter'});assert.equal(applied,1);assert.equal(ready,1);p.dispose();
});
function fight({dialogue=false,prepare=true,intro=true}={}){
  const profile=authoredCombatProfile('natatorium');
  const combat={id:'natatorium',enemy:'TEST',baseComposure:40,...profile,movements:[{...profile.movements[0],before:dialogue?['Before.']:[]}]};
  const battle={id:'preparation-test',enemy:'TEST',intro:dialogue?['Opening.']:[],win:[],lose:[],combat};
  const noop=()=>{};let applied=0;
  const scene=makeCombatScene({battle,difficulty:{},encounterIntro:intro,getAudio:()=>null,playSound:noop,
    fx:{stopCues:noop,flash:noop,cue:noop,glitch:noop,shake:noop},audio:{stopTyping:noop,menuMove:noop,menuConfirm:noop},
    loadout:{tools:{}},getPreparedLoadout:()=>({tools:{light:true,recorder:true},techniques:[T.AFTERIMAGE],battery:.75}),
    preparation:prepare?{getEquipment:()=>equipment,getBuild:funded,apply:()=>{applied++;return true;}}:null,
    resources:{playImpact:noop,playTool:noop}});
  scene.enter();return{scene,get applied(){return applied;}};
}
const tick=(scene,seconds)=>{for(let t=0;t<seconds;t+=1/60)scene.update(1/60);};
test('real combat reveals, reads authored dialogue, then freezes at preparation',()=>{
  const h=fight({dialogue:true}),s=h.scene;
  assert.equal(s.battleView().phase,'arrival');tick(s,1.4);assert.equal(s.battleView().phase,'arrival');tick(s,.2);
  assert.equal(s.battleView().phase,'talk');assert.equal(s.battleView().preparation,null);
  for(let i=0;i<12&&s.battleView().phase==='talk';i++){tick(s,.6);s.key({key:'Enter'});s.keyup({key:'Enter'});}
  assert.equal(s.battleView().phase,'prepare');const before=s.battleView();tick(s,12);
  const after=s.battleView();assert.deepEqual(after.state,before.state);assert.equal(after.turnClock,null);assert.equal(after.fireball.active,null);
  s.key({key:'Enter'});assert.equal(h.applied,1);assert.equal(s.battleView().phase,'ready');assert.ok(s.battleView().state.techniques.includes(T.AFTERIMAGE));
  tick(s,.75);assert.equal(s.battleView().phase,'tool');assert.ok(s.battleView().turnClock);
  s.key({key:'ArrowDown'});assert.equal(s.battleView().phase,'move');
  s.key({key:'Enter'});assert.equal(s.battleView().phase,'move','held READY cannot select the first move');
  s.keyup({key:'Enter'});s.key({key:'Enter'});assert.notEqual(s.battleView().phase,'move');s.exit();
});
test('a direct combat continuation retains its existing entry without preparation',()=>{
  const h=fight({prepare:false,intro:false});assert.equal(h.scene.battleView().phase,'tool');assert.equal(h.applied,0);h.scene.exit();
});
