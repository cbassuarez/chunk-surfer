import test from 'node:test';
import assert from 'node:assert/strict';
import {activeInventoryFrame,activeInventoryVisible,cycleHeldInventorySlot} from '../src/game/active-inventory.js';
import {assignCombatGearSlot,moveCombatGear,availableBattleTools} from '../src/game/combat-loadout.js';
import {activeInventoryLayout} from '../src/render/active-inventory.js';
import {buildBagModel} from '../src/game/bag-model.js';
import {resolveBagItemAction} from '../src/game/bag-items.js';

const equipment=[{id:'light',present:true},{id:'recorder',present:true},{id:'radio',present:true},
  {id:'plant-spanner',present:true},{id:'coffee',present:true}];
const initial={schema:2,top:['light','recorder','radio'],heldSlot:0};

test('ownership, four ready positions and the one held object are different facts',()=>{
  const loadout=assignCombatGearSlot(initial,'plant-spanner',3).loadout;
  const frame=activeInventoryFrame({...loadout,heldSlot:3},equipment);
  assert.equal(frame.slots.length,4);assert.equal(frame.held.id,'plant-spanner');
  assert.deepEqual(availableBattleTools(frame.loadout,equipment),['torch','recorder','radio','spanner']);
  assert.ok(frame.explorationItems.some(item=>item.id==='coffee'),'a stowed cup remains usable outside battle');
  assert.ok(!availableBattleTools(frame.loadout,equipment).includes('coffee'));
});

test('loss and deployment hide the held model without rewriting its saved reservation',()=>{
  for(const unavailable of[{present:false},{present:false,deployed:true}]){
    const loadout={...initial,heldSlot:2},before=structuredClone(loadout);
    const frame=activeInventoryFrame(loadout,equipment.map(item=>item.id==='radio'?{...item,...unavailable}:item));
    assert.equal(frame.held,null);assert.equal(frame.slots[2].id,'radio');
    assert.equal(frame.slots[2].status,unavailable.deployed?'deployed':'missing');assert.deepEqual(loadout,before);
    assert.equal(activeInventoryFrame(loadout,equipment).held.id,'radio');
  }
});

test('empty and explicitly lowered hands never borrow the next item',()=>{
  const stowed=moveCombatGear({...initial,heldSlot:1},'recorder','storage').loadout;
  assert.equal(activeInventoryFrame(stowed,equipment).held,null);
  assert.equal(activeInventoryFrame({...initial,heldSlot:null},equipment).held,null);
  assert.equal(activeInventoryFrame(initial,[]).held,null);
});

test('a kept object occupies a real bay and is held without creating a battle move',()=>{
  const id='recording-cassette:3',owned=[...equipment,{id,present:true,title:'CASSETTE 3',content:null}];
  const packed=assignCombatGearSlot(initial,id,3).loadout;
  const frame=activeInventoryFrame({...packed,heldSlot:3},owned);
  assert.equal(frame.held.id,id);assert.equal(frame.held.toolId,'recording-cassette');
  assert.equal(frame.held.battleToolId,null);assert.deepEqual(availableBattleTools(frame.loadout,owned),['torch','recorder','radio']);
  const entry=buildBagModel({loadout:frame.loadout,equipment:owned}).sections[0].entries.find(item=>item.sourceId===id);
  assert.ok(entry,'numbered cassette identity was lost to slug conversion');
  assert.equal(entry.readyCapable,true);assert.equal(entry.battleCapable,false);assert.equal(entry.held,true);
  assert.equal(entry.actionList.find(a=>a.id==='lower-item').enabled,true);
  assert.ok(entry.inspectionActions.some(action=>action.id==='history'));
});

test('cycling visits only actually present ready gear and survives empty kits',()=>{
  const kit={schema:2,top:['light',null,'radio','coffee'],heldSlot:0};
  const items=equipment.map(item=>item.id==='radio'?{...item,present:false}:item);
  const next=cycleHeldInventorySlot(kit,items).loadout;assert.equal(next.heldSlot,3);
  assert.equal(cycleHeldInventorySlot(next,items).loadout.heldSlot,0);
  assert.equal(cycleHeldInventorySlot(kit,items,-1).loadout.heldSlot,3);
  assert.equal(cycleHeldInventorySlot(kit,[]).loadout.heldSlot,null);
});

test('scene and transport owners withdraw field hands and the slot strip',()=>{
  const context={storyMode:true,inWorld:true,bagTaken:true};assert.equal(activeInventoryVisible(context),true);
  for(const flag of['paused','blocksInput','blocksWorld','suppressesHud','authoredView','recording','listening','playback','specialSpace']){
    assert.equal(activeInventoryVisible({...context,[flag]:true}),false,flag);
  }
  assert.equal(activeInventoryVisible({...context,bagTaken:false}),false);
});

test('the bag holds the same item and cannot promise a mid-contact equipment change',()=>{
  const unlocked=buildBagModel({equipment,loadout:initial});
  const torch=unlocked.sections[0].entries.find(item=>item.sourceId==='light');
  assert.equal(torch.held,true);assert.equal(torch.actionList.find(action=>action.id==='lower-item').enabled,true);
  const cup=unlocked.sections[0].entries.find(item=>item.sourceId==='coffee');
  assert.equal(cup.actionList.find(action=>action.id==='hold-item').enabled,false);
  const locked=buildBagModel({equipment,loadout:initial,loadoutLocked:'CONTACT UNDERWAY'});
  for(const item of locked.sections[0].entries)for(const action of item.actionList.filter(action=>['hold','lower','set','unset'].includes(action.verb))){
    assert.equal(action.enabled,false);assert.equal(action.reason,'CONTACT UNDERWAY');
  }
});

test('a stowed field tool keeps its actual ordinary USE action',()=>{
  const model=buildBagModel({loadout:{schema:2,top:['plant-spanner'],heldSlot:0},equipment:[
    {id:'light',present:true,primaryAction:resolveBagItemAction('light',{present:true,lightOn:false})},
    {id:'recorder',present:true,primaryAction:resolveBagItemAction('recorder',{present:true,listening:false})},
  ]});
  for(const [id,actionId] of [['light','light-toggle'],['recorder','recorder-command']]){
    const item=model.sections[0].entries.find(item=>item.sourceId===id);
    assert.equal(item.compartment,'storage');
    assert.equal(item.actionList.find(action=>action.id===actionId).enabled,true);
    assert.equal(item.actionList.find(action=>action.id==='hold-item').enabled,false);
  }
});

test('contact inspection cannot deploy a second world tool behind the frozen battle kit',()=>{
  const model=buildBagModel({loadout:initial,loadoutLocked:'CONTACT UNDERWAY',equipment:[
    {id:'light',present:true,primaryAction:resolveBagItemAction('light',{present:true,lightOn:false})},
    {id:'radio',present:true,primaryAction:resolveBagItemAction('radio',{present:true,radioChannelOccupied:false})},
  ]});
  const torch=model.sections[0].entries.find(item=>item.sourceId==='light');
  assert.equal(torch.actionList.find(action=>action.id==='light-toggle').enabled,false);
  const radio=model.sections[0].entries.find(item=>item.sourceId==='radio');
  assert.equal(radio.actionList.find(action=>action.id==='radio-deploy').enabled,false);
  assert.equal(radio.actionList.find(action=>action.id==='inspect-item').enabled,true);
});

test('the four field contacts keep their own bounded territory at supported sizes',()=>{
  for(const cols of[60,80,113,151])for(const rows of[30,40,50]){
    const layout=activeInventoryLayout({cols,rows});assert.equal(layout.slots.length,4);
    for(let i=0;i<4;i++){
      const slot=layout.slots[i];assert.ok(slot.x>=2&&slot.x+slot.w<=cols-2+.001);
      assert.ok(slot.y+slot.h<=layout.y+layout.h+.001);
      if(i)assert.ok(layout.slots[i-1].x+layout.slots[i-1].w<slot.x);
    }
  }
});
