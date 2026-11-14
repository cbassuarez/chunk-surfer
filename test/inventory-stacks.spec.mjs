import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {buildBagModel} from '../src/game/bag-model.js';
import {makeBagScene} from '../src/game/bag.js';
import {projectInventoryStacks,inventoryStackForEntry,nextInventoryStackMember} from '../src/game/inventory-stacks.js';
import {assignCombatGearSlot} from '../src/game/combat-loadout.js';
import {BAG_SUPPLY_IDS,bagSupplyItems,fitBagSupply} from '../src/game/bag-supplies.js';
import {bagInventoryGridLayout} from '../src/render/bag-layout.js';
import {bagInventoryActionLayout} from '../src/render/bag-view.js';
import {uiSetLayoutSize} from '../src/render/ui.js';

const cassette=(number,content=null,extra={})=>({id:`recording-cassette:${number}`,label:`CASSETTE ${number}`,content,present:true,...extra});
const normalize=equipment=>buildBagModel({equipment}).sections.find(section=>section.id==='kit').entries;

test('nonadjacent interchangeable objects share one stable grid cell while retaining every real identity',()=>{
  const entries=normalize([cassette(4),{id:'light',present:true},cassette(9),cassette(2)]),before=JSON.stringify(entries);
  const stacks=projectInventoryStacks(entries),blank=stacks[0];
  assert.equal(stacks.length,2);assert.equal(blank.id,'stack:blank-recording-cassettes');
  assert.deepEqual(blank.memberIds,['gear:recording-cassette:4','gear:recording-cassette:9','gear:recording-cassette:2']);
  assert.equal(blank.quantity,3);assert.equal(blank.availableQuantity,3);assert.equal(blank.memberCount,3);
  assert.equal(stacks[1].entry.sourceId,'light');assert.equal(JSON.stringify(entries),before,'projection never rewrites ownership or source metadata');
  const selected=projectInventoryStacks(entries,{selectedId:'gear:recording-cassette:9'})[0];
  assert.equal(selected.entry.sourceId,'recording-cassette:9');assert.equal(selected.memberIndex,1);
  assert.equal(nextInventoryStackMember(selected,selected.entry.id,1).sourceId,'recording-cassette:2');
});

test('recorded and tutorial cassettes remain distinguishable and leave the blank stack immediately after recording',()=>{
  const items=[cassette(1),cassette(2,{kind:'tutorial'}),cassette(3,{roomId:'main_b3',outcome:'accepted'}),cassette(4)];
  let stacks=projectInventoryStacks(normalize(items));
  assert.equal(stacks.length,3);assert.equal(stacks[0].quantity,2);
  items[0].content={roomId:'lux_nova',outcome:'failed'};
  stacks=projectInventoryStacks(normalize(items));
  assert.equal(stacks.length,4);
  assert.equal(inventoryStackForEntry(stacks,'gear:recording-cassette:1').entry.source.content.roomId,'lux_nova');
  assert.equal(inventoryStackForEntry(stacks,'gear:recording-cassette:4').quantity,1);
  assert.equal(stacks.find(stack=>stack.id==='stack:blank-recording-cassettes').id,'stack:blank-recording-cassettes');
});

test('partial loss reduces available quantities without losing the missing member or its exact selection',()=>{
  const entries=normalize([cassette(1),cassette(2,null,{present:false,missing:true}),cassette(3)]);
  const stack=projectInventoryStacks(entries,{selectedId:'gear:recording-cassette:2'})[0];
  assert.equal(stack.quantity,3);assert.equal(stack.availableQuantity,2);assert.equal(stack.missingQuantity,1);
  assert.equal(stack.entry.sourceId,'recording-cassette:2');assert.equal(stack.entry.present,false);
  assert.equal(stack.entry.actionList.find(action=>action.id==='set-slot').enabled,false);
  const remaining=projectInventoryStacks(entries.filter(entry=>entry.sourceId!=='recording-cassette:1'))[0];
  assert.equal(remaining.quantity,2);assert.equal(remaining.availableQuantity,1);assert.equal(remaining.entry.sourceId,'recording-cassette:3');
});

function fixture({equipment,getEquipment=null,cols=113,rows=30,loadout={schema:2,top:['light'],heldSlot:0},onItemAction=()=>true}={}){
  uiSetLayoutSize({cols,rows});const assignments=[];
  const scene=makeBagScene({equipment,getEquipment,getLoadout:()=>loadout,memory:null,focus:{sectionId:'kit'},
    assignEquipmentSlot:(id,index)=>{assignments.push({id,index});const result=assignCombatGearSlot(loadout,id,index);loadout=result.loadout;return result;},onItemAction});
  scenes.replace(scene);scene.update(.5);scene.render();
  const state=()=>scene.debugState(),hit=id=>state().hitRegions.find(hit=>hit.id===id);
  const click=id=>{const area=hit(id);assert.ok(area,id);scene.pointer({type:'pointerdown',button:0,pointerId:1,cellX:area.x+area.w/2,cellY:area.y+area.h/2});scene.render();};
  const key=value=>{scene.key({key:value,code:value});scene.render();};
  return{scene,state,hit,click,key,assignments};
}

test('grid drawing, pointer cells and spatial movement use the same compressed stack projection',()=>{
  const items=[cassette(1),{id:'light',present:true},cassette(2),{id:'radio',present:true},cassette(3)];
  const f=fixture({equipment:items}),stacks=f.state().inventory.stacks,geo=f.state().inventory.geometry;
  assert.equal(stacks.length,3);assert.equal(f.state().model.sections.find(section=>section.id==='kit').entries.length,5);
  const grid=bagInventoryGridLayout(geo.grid,stacks.length,0,0);
  for(const cell of grid.cells){const stack=stacks[cell.index];if(!stack)continue;
    const actual=f.hit(`bag:item:${stack.entry.id}`);assert.ok(actual);
    for(const key of['x','y','w','h'])assert.equal(actual[key],cell[key]);
    assert.deepEqual(actual.data.memberIds,stack.memberIds);
    if(stack.key)assert.match(actual.label,new RegExp(String(stack.availableQuantity)));
  }
  f.key('ArrowRight');assert.equal(f.state().selected.sourceId,'light','right moves to the next cell, not the hidden second cassette');
  f.key('ArrowLeft');assert.equal(f.state().selected.sourceId,'recording-cassette:1');
  f.key(']');assert.equal(f.state().selected.sourceId,'recording-cassette:2');
  f.key('ArrowRight');f.key('ArrowLeft');assert.equal(f.state().selected.sourceId,'recording-cassette:2','returning remembers the browsed member');
  scenes.clear();uiSetLayoutSize(null);
});

test('stack member selection equips exactly that numbered cassette and preserves independent bay identities',()=>{
  const f=fixture({equipment:[cassette(2),cassette(8),cassette(11)],loadout:{schema:2,top:['recording-cassette:2'],heldSlot:0}});
  assert.deepEqual(f.scene.inventoryModalActions,['mapFloorPrev','mapFloorNext'],'the host must poll both triggers while browsing a stack');
  f.click('bag:stack-member-next');assert.equal(f.state().selected.sourceId,'recording-cassette:8');
  f.key('t');assert.equal(f.state().route.type,'slot-picker');assert.deepEqual(f.scene.inventoryModalActions,[]);f.key('ArrowRight');f.key('Enter');
  assert.deepEqual(f.assignments,[{id:'recording-cassette:8',index:1}]);
  assert.deepEqual(f.state().model.loadout.top,['recording-cassette:2','recording-cassette:8']);
  assert.equal(f.state().inventory.stacks.length,1,'two equipped copies still occupy one backpack stack');
  f.key('Enter');assert.equal(f.state().route.type,'item-actions');
  assert.deepEqual(f.scene.inventoryModalActions,['mapFloorPrev','mapFloorNext'],'the focused action list keeps the same member controls');
  f.scene.key({controllerAction:'mapFloorNext'});f.scene.render();
  assert.equal(f.state().route.entryId,'gear:recording-cassette:11');assert.equal(f.state().selected.sourceId,'recording-cassette:11');
  scenes.clear();uiSetLayoutSize(null);
});

test('torch-cell stack counts physical cells but fitting chooses one intact source bundle and its exact charge',()=>{
  let save={items:Object.values(BAG_SUPPLY_IDS),flags:{},rec:{battery:.25,other:'preserved'}},request;
  const f=fixture({getEquipment:()=>bagSupplyItems(save),onItemAction:value=>{
    request=value;const result=fitBagSupply(save,value.itemId);assert.equal(result.changed,true);save={...save,...result.patch};return true;
  }});
  let stack=f.state().inventory.stacks[0];assert.equal(stack.quantity,5);assert.equal(stack.memberCount,3);
  f.key(']');assert.equal(f.state().selected.sourceId,BAG_SUPPLY_IDS.POOL);
  f.key('Enter');f.key('ArrowDown');f.key('ArrowDown');f.key('Enter');
  assert.equal(request.itemId,BAG_SUPPLY_IDS.POOL);assert.equal(request.actionId,'fit-sealed-cells');
  assert.equal(save.rec.battery,.75);assert.equal(save.rec.other,'preserved');
  assert.deepEqual(save.items,[BAG_SUPPLY_IDS.B3,BAG_SUPPLY_IDS.RIG]);
  f.scene.refresh();f.scene.render();stack=f.state().inventory.stacks[0];
  assert.equal(stack.quantity,3);assert.equal(stack.memberCount,2);assert.equal(stack.members.find(entry=>entry.sourceId===BAG_SUPPLY_IDS.RIG).source.value,'+75% CHARGE');
  scenes.clear();uiSetLayoutSize(null);
});

test('the member selector and every real action stay reachable with small windows and large text',()=>{
  for(const[cols,rows]of[[113,30],[75,20],[151,40]]){
    const f=fixture({equipment:[cassette(1),cassette(2),cassette(3)],cols,rows}),state=f.state(),stack=state.inventory.stacks[0],detail=state.inventory.geometry.detail;
    const inside=rect=>assert.ok(rect.x>=detail.x&&rect.y>=detail.y&&rect.x+rect.w<=detail.x+detail.w+.001&&rect.y+rect.h<=detail.y+detail.h+.001,JSON.stringify({rect,detail}));
    inside(f.hit('bag:stack-member-prev'));inside(f.hit('bag:stack-member-next'));
    for(let actionIndex=0;actionIndex<state.selected.actionList.length;actionIndex++){
      const layout=bagInventoryActionLayout(detail,state.selected,{actionFocus:true,actionIndex,inventoryStack:stack});
      assert.ok(layout.rows.some(row=>row.index===actionIndex));layout.rows.forEach(inside);
    }
    f.key(']');f.key(']');assert.equal(f.state().selected.sourceId,'recording-cassette:3');
    scenes.clear();
  }
  uiSetLayoutSize(null);
});
