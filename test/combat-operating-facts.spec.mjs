import test from 'node:test';
import assert from 'node:assert/strict';
import {availableCombatActions,createCombatState,COMBAT_ACTION as A,TECHNIQUE as T} from '../src/game/combat-state.js';
import {authoredCombatProfile} from '../src/data/combat-definitions.js';
import {availableBattleTools} from '../src/game/combat-loadout.js';
import {normalizeEquipment} from '../src/game/bag-model.js';
import {combatOperatingFacts,preparationBattleTools,battleOperatingCopy,BATTLE_OPERATING_COPY} from '../src/game/combat-operating-facts.js';
import {createBattlePreparationModel} from '../src/game/battle-preparation-model.js';
import {makeBattlePreparation} from '../src/game/battle-preparation.js';

const definition={id:'natatorium',enemy:'THE RETURN',baseComposure:40,...authoredCombatProfile('natatorium')};
const state=options=>createCombatState(definition,{tools:{torch:true,recorder:true,radio:true,fork:true},battery:.67,composure:27,...options});

test('preparation tool projection is the committed four-slot inventory contract',()=>{
  const draft={loadout:{top:['light','recorder','radio','interface','coffee']},available:['light','recorder','radio','interface','coffee']};
  const tools=preparationBattleTools(draft);
  assert.deepEqual(tools.order,availableBattleTools(draft.loadout,draft.available));
  assert.deepEqual(tools.order,['torch','recorder','radio','rig']);
  assert.equal(tools.coffee,false);assert.equal(tools.fork,false);
  assert.deepEqual(preparationBattleTools({loadout:{top:['recorder']},available:[]}).order,[]);
});

test('operating facts retain exact opening resources and current prices even when a move is unavailable',()=>{
  const s=state({battery:.01,torchDrainScale:1.2,techniques:[T.WHITEOUT,T.HEADROOM,T.ROOM_TONE]});s.charge=0;
  const before=structuredClone(s),facts=combatOperatingFacts(s);
  assert.deepEqual([facts.composure,facts.ceiling,facts.battery,facts.charge,facts.maxCharge],[s.composure,s.maxComposure,s.battery,s.charge,s.maxCharge]);
  assert.deepEqual(facts.take,s.take?{label:s.take.label,tag:s.take.tag}:null);
  const move=availableCombatActions(s).find(m=>m.id===A.WHITEOUT);
  assert.equal(move.enabled,false);
  assert.equal(facts.costs.whiteout.battery,move.cost);assert.equal(facts.costs.whiteout.charge,2);
  assert.deepEqual(facts.costs.expose,{battery:0,charge:0});
  assert.equal(facts.costs.coffee.heals,availableCombatActions({...s,tools:{...s.tools,coffee:true}}).find(m=>m.id===A.STEADY_HANDS).heals);
  assert.deepEqual(s,before,'inspection cannot mutate the combat preview');
});

test('the player facts contain no waiting-opponent oracle',()=>{
  const a=state({techniques:[T.WHITEOUT]}),b=structuredClone(a);
  b.read={player:2,enemy:0};b.misread={kind:'loop'};b.intentIndex=1;b.cycleIndex=1;
  assert.deepEqual(combatOperatingFacts(a),combatOperatingFacts(b));
  const exported=JSON.stringify(combatOperatingFacts(a));
  for(const hidden of ['intent','enabled','prevents','damage','counter'])assert.equal(exported.includes(`"${hidden}"`),false);
  assert.equal(combatOperatingFacts(null),null);
});

test('Bag and preparation share operating copy rather than obsolete units and one-use radio claims',()=>{
  for(const id of ['light','recorder','interface','tuning-fork','radio','coffee','plant-spanner']){
    const item=normalizeEquipment({id});
    assert.equal(item.facts.find(([key])=>key==='BATTLE')[1],BATTLE_OPERATING_COPY[id].detail);
  }
  assert.match(battleOperatingCopy('radio').detail,/1 charge.*use it again/);
  assert.doesNotMatch(battleOperatingCopy('radio').detail,/once per fight/i);
  assert.match(battleOperatingCopy('light').detail,/EXPOSE uses no battery/);
  assert.match(battleOperatingCopy('plant-spanner').move,/ON THE STEEL/);
  assert.match(battleOperatingCopy('coffee',combatOperatingFacts(state())).detail,/15 composure/);
});

test('readiness opens no editor; Back cancels a replacement before closing details or patchbay',()=>{
  const original={top:['light','recorder','radio','interface']};
  const m=createBattlePreparationModel({loadout:original,equipment:[...original.top,'tuning-fork']});
  assert.equal(m.snapshot().editing,false);assert.equal(m.snapshot().details,false);
  assert.equal(m.back(),false,'untouched readiness can yield to ordinary pause');
  m.slot(0);assert.equal(m.snapshot().details,true);assert.equal(m.back(),true);
  m.tab('equipment');assert.equal(m.snapshot().editing,true);
  m.equip('tuning-fork');assert.equal(m.snapshot().replacing,'tuning-fork');
  assert.equal(m.back(),true);assert.equal(m.snapshot().replacing,null);assert.equal(m.snapshot().editing,true);
  assert.equal(m.back(),true);assert.equal(m.snapshot().editing,false);assert.deepEqual(m.snapshot().loadout.top,original.top);
  m.tab('skills');assert.equal(m.back(),true);assert.equal(m.snapshot().page,'equipment');
});

test('opening receipt refreshes from the actual scene preview after draft edits and a spent sheet',()=>{
  let activate,composure=25,rendered,commits=0,ready=0;
  const previews=[];
  const p=makeBattlePreparation({title:'THE RETURN',getLoadout:()=>({top:['light','recorder','radio']}),
    getEquipment:()=>['light','recorder','radio','interface'],getBattery:()=>.34,
    getOpeningState:draft=>{previews.push(structuredClone(draft));return state({composure,battery:.34,tools:preparationBattleTools(draft),techniques:draft.build.techniques});},
    getSheets:()=>({carried:1,composure,ceiling:40}),readSheet:()=>{composure=40;return{restored:15,sheets:0};},
    apply:()=>{commits++;return true;},onReady:()=>ready++,
    createView:({onActivate})=>{activate=onActivate;return{render:(s,options)=>{rendered={s,options};},paint(){},dispose(){}};}});
  assert.equal(rendered.options.title,'THE RETURN');assert.equal(rendered.options.facts.composure,25);
  p.update(.3);activate('tab:equipment');activate('equip:interface');
  assert.equal(previews.at(-1).loadout.top.length,4);assert.equal(rendered.options.facts.battery,.34);
  activate('read-sheet');assert.equal(rendered.options.facts.composure,40);
  assert.equal(commits,0);assert.equal(ready,0);
  assert.equal(p.key({key:'Escape'}),true,'close equipment before game pause');
  assert.equal(p.key({key:'Escape'}),false);
  activate('ready');assert.equal(commits,1);assert.equal(ready,1);p.dispose();
});
