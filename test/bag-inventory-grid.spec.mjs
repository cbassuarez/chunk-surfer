import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeBagScene} from '../src/game/bag.js';
import {uiSetLayoutSize} from '../src/render/ui.js';
import {bagInventorySpatialLayout,bagInventoryGridLayout,bagInventoryMoveIndex} from '../src/render/bag-layout.js';
import {bagInventoryActionLayout} from '../src/render/bag-view.js';
import {faceplateModuleLayout,faceplateUsesCurrentRunModules} from '../src/render/faceplate-module-state.js';
import {computeStageLayout,DISPLAY_CONTRACT} from '../src/platform/display-policy.js';
import {createItemInspection,itemInspectionStats} from '../src/game/item-inspection.js';
import {itemInspectionText} from '../src/render/item-inspection-view.js';

const inside=(a,b)=>assert.ok(a.x>=b.x-1e-7&&a.y>=b.y-1e-7&&a.x+a.w<=b.x+b.w+1e-7&&a.y+a.h<=b.y+b.h+1e-7,JSON.stringify({a,b}));
const separate=(a,b)=>assert.ok(a.x+a.w<=b.x+1e-7||b.x+b.w<=a.x+1e-7||a.y+a.h<=b.y+1e-7||b.y+b.h<=a.y+1e-7);
const equipment=()=>[
  ...['light','recorder','radio','interface','tuning-fork','plant-spanner','coffee','badge'].map(id=>({id,present:true,battleCapable:true})),
  ...Array.from({length:25},(_,i)=>({id:`object-${i}`,label:`COLLECTED OBJECT ${i}`,present:true})),
];
function fixture({cols=151,rows=40,items=equipment(),inspectionDraw=null}={}){
  uiSetLayoutSize({cols,rows});
  let loadout={schema:2,top:['light','recorder','radio','interface'],heldSlot:0},locked='',frame;
  const holds=[],previews=[];
  const scene=makeBagScene({equipment:items,getLoadout:()=>loadout,getLoadoutLocked:()=>locked,
    memory:null,focus:{sectionId:'kit',entryId:'gear:light'},
    selectHeldEquipmentSlot:index=>{holds.push(index);loadout={...loadout,heldSlot:index};return{changed:true};},
    renderInventoryEmbodiment:(rect,model)=>{previews.push({rect:{...rect},heldSlot:model.heldSlot});return true;},
    renderItemInspection:inspectionDraw,
    debug:value=>{frame=value;},
  });
  scenes.replace(scene);scene.update(.5);scene.render();
  const hit=id=>scene.debugState().hitRegions.find(region=>region.id===id);
  const click=id=>{const region=hit(id);assert.ok(region,id);scene.pointer({type:'pointerdown',button:0,pointerId:1,cellX:region.x+region.w/2,cellY:region.y+region.h/2});scene.render();};
  return{scene,items,holds,previews,click,hit,get frame(){return frame;},lock:value=>{locked=value;scene.refresh();scene.render();}};
}

test('four equipped positions, held preview, inspector and backpack remain separate at player viewport/text scales',()=>{
  for(const [pixelsW,pixelsH] of [[960,600],[1280,800],[1920,1080]])for(const scale of [1,1.25,1.5]){
    const f=fixture({cols:Math.floor(pixelsW/(8.45*scale)),rows:Math.floor(pixelsH/(20*scale))});
    const geo=f.scene.debugState().inventory.geometry;
    for(const rect of [geo.equipment,geo.embodiment,geo.detail,geo.grid])inside(rect,geo.region);
    separate(geo.equipment,geo.embodiment);separate(geo.embodiment,geo.detail);separate(geo.detail,geo.grid);
    assert.equal(geo.slots.length,4);
    for(const slot of geo.slots)inside(slot,geo.equipment);
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)separate(geo.slots[i],geo.slots[j]);
    inside(geo.preview,geo.embodiment);inside(geo.lower,geo.embodiment);separate(geo.preview,geo.lower);
    const grid=bagInventoryGridLayout(geo.grid,f.items.length,0);
    assert.ok(grid.columns>=2&&grid.capacity>=2);
    grid.cells.forEach(cell=>inside(cell,geo.grid));
    const actions=f.scene.debugState().selected.actionList;
    assert.ok(actions.length>=5);
    for(let index=0;index<actions.length;index++){
      const pane=bagInventoryActionLayout(geo.detail,{actionList:actions},{actionFocus:true,actionIndex:index});
      assert.ok(pane.rows.some(row=>row.index===index),'every real action can be brought into the inspector');
      pane.rows.forEach(row=>inside(row,geo.detail));
    }
    scenes.clear();
  }
  uiSetLayoutSize(null);
});

test('backpack drawing cells and actual pointer regions use the same row-aligned geometry',()=>{
  const f=fixture(),state=f.scene.debugState(),geo=state.inventory.geometry;
  const grid=bagInventoryGridLayout(geo.grid,f.items.length,0,state.nav.scroll.kit);
  for(const cell of grid.cells){
    const entry=state.model.sections.find(section=>section.id==='kit').entries[cell.index];if(!entry)continue;
    const region=f.hit(`bag:item:${entry.id}`);
    for(const key of ['x','y','w','h'])assert.equal(region[key],cell[key]);
  }
  const last=f.items.length-1;
  for(let index=0;index<=last;index++){
    const page=bagInventoryGridLayout(geo.grid,f.items.length,index);
    assert.equal(page.offset%page.columns,0,'scrolling cannot shear one row across columns');
    assert.ok(page.cells.some(cell=>cell.index===index));
  }
  scenes.clear();uiSetLayoutSize(null);
});

test('two-dimensional grid movement reaches every owned object without wrapping a row or losing the partial last row',()=>{
  for(const count of [1,2,7,17,33,47])for(const columns of [2,3,4,5,6]){
    const visited=new Set([0]),queue=[0];
    while(queue.length){const at=queue.shift();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const next=bagInventoryMoveIndex(at,count,columns,dx,dy);assert.ok(next>=0&&next<count);
      if(dx)assert.equal(Math.floor(next/columns),Math.floor(at/columns));
      if(!visited.has(next)){visited.add(next);queue.push(next);}
    }}
    assert.equal(visited.size,count);
  }
});

test('browsing changes the persistent inspector, while selecting equipment changes only the actual held preview',()=>{
  const f=fixture();
  f.click('bag:item:gear:radio');
  assert.equal(f.scene.debugState().selected.sourceId,'radio');
  assert.equal(f.scene.debugState().route.type,'root','one pointer selection must not immediately enter an action drawer');
  assert.deepEqual(f.holds,[]);assert.equal(f.previews.at(-1).heldSlot,0);
  f.click('bag:item:gear:radio');assert.equal(f.scene.debugState().route.type,'item-actions');
  f.scene.key({key:'Escape',code:'Escape'});f.scene.render();
  f.click('bag:equipment:1');assert.deepEqual(f.holds,[1]);assert.equal(f.previews.at(-1).heldSlot,1);
  f.click('bag:item:gear:light');assert.equal(f.scene.debugState().selected.sourceId,'light');assert.equal(f.previews.at(-1).heldSlot,1);
  f.click('bag:lower-hands');assert.deepEqual(f.holds,[1,null]);assert.equal(f.previews.at(-1).heldSlot,null);
  scenes.clear();uiSetLayoutSize(null);
});

test('controller grid directions follow the rendered columns and the wheel reaches later objects',()=>{
  const f=fixture(),columns=bagInventoryGridLayout(f.scene.debugState().inventory.geometry.grid,f.items.length).columns;
  f.scene.key({key:'',code:'',controllerAction:'move_right'});
  assert.equal(f.scene.debugState().selected.sourceId,f.items[1].id);
  f.scene.key({key:'',code:'',controllerAction:'move_down'});
  assert.equal(f.scene.debugState().selected.sourceId,f.items[1+columns].id);
  f.scene.render();
  const grid=f.scene.debugState().inventory.geometry.grid;
  for(let i=0;i<20;i++){f.scene.pointer({type:'wheel',cellX:grid.x+1,cellY:grid.y+2,deltaY:100});f.scene.render();}
  assert.equal(f.scene.debugState().selected.sourceId,f.items.at(-1).id);
  assert.ok(f.hit(`bag:item:gear:${f.items.at(-1).id}`),'the last object remains drawn and clickable');
  scenes.clear();uiSetLayoutSize(null);
});

test('missing reservations, non-hand objects and a battle lock cannot invoke the held-item callback',()=>{
  const items=equipment();items.find(item=>item.id==='radio').present=false;
  const f=fixture({items});
  f.click('bag:equipment:2');assert.deepEqual(f.holds,[]);assert.equal(f.scene.debugState().model.loadout.top[2],'radio');
  f.lock('CONTACT UNDERWAY');f.click('bag:equipment:1');f.click('bag:lower-hands');assert.deepEqual(f.holds,[]);
  f.lock('');f.click('bag:item:gear:badge');f.click('bag:item:gear:badge');
  const badge=f.scene.debugState().selected;assert.equal(badge.actionList.find(action=>action.id==='hold-item')?.enabled,false);
  scenes.clear();uiSetLayoutSize(null);
});

test('shallow inventory uses four fixed two-dimensional equipment bays rather than clipping its portraits',()=>{
  const shallow=bagInventorySpatialLayout({x:2,y:5,w:67,h:10});
  assert.equal(shallow.equipmentColumns,2);assert.equal(shallow.equipmentRows,2);
  assert.deepEqual(shallow.slots.map(slot=>slot.index),[0,1,2,3]);
  assert.ok(shallow.slots.every(slot=>slot.h>4));
});

test('inventory and nested item actions keep the navigator in its reserved territory',()=>{
  const f=fixture();
  assert.equal(faceplateUsesCurrentRunModules(f.scene),true);
  f.scene.key({key:'Enter',code:'Enter'});
  assert.equal(f.scene.debugState().route.type,'item-actions');
  assert.equal(faceplateUsesCurrentRunModules(f.scene),true);
  f.scene.key({key:'Escape',code:'Escape'});
  for(const sectionId of ['map','sheets','skills','journal']){
    f.scene.selectSection(sectionId);
    assert.equal(f.scene.faceplate,undefined,sectionId);
    assert.equal(faceplateUsesCurrentRunModules(f.scene),true,sectionId);
  }
  f.scene.selectSection('kit');assert.equal(faceplateUsesCurrentRunModules(f.scene),true);
  scenes.clear();uiSetLayoutSize(null);
});

test('every supported stage and UI scale fits inventory controls beside the navigator',()=>{
  for(const {width,height} of DISPLAY_CONTRACT.windowPresets){
    const stage=computeStageLayout(width,height);
    for(const {value} of DISPLAY_CONTRACT.uiScalePresets){
      const physical={cols:Math.floor(stage.stageWidth/(8.45*value)),rows:Math.floor(stage.stageHeight/(20*value))};
      const {contentSize,territory}=faceplateModuleLayout(physical);
      const f=fixture(contentSize);
      const state=f.scene.debugState();
      assert.ok(territory,'each supported stage reserves navigator space');
      separate(state.inventory.geometry.region,territory);
      assert.ok(state.hitRegions.some(hit=>hit.kind==='bag-item'),'backpack items remain visible');
      for(const hit of state.hitRegions)separate(hit,territory);
      scenes.clear();uiSetLayoutSize(null);
    }
  }
});

function enterInspection(f,id){
  f.click(`bag:item:gear:${id}`);f.scene.key({key:'Enter',code:'Enter'});
  const index=f.scene.debugState().selected.actionList.findIndex(action=>action.id==='inspect-item');
  for(let i=0;i<index;i++)f.scene.key({key:'ArrowDown',code:'ArrowDown'});
  f.scene.key({key:'Enter',code:'Enter'});f.scene.render();
  assert.equal(f.scene.debugState().route.type,'item-inspect');
}

test('actual keepsake inspection changes its text and absolute object view without changing the carried selection',()=>{
  const draws=[],items=[...equipment(),{id:'ren-home-cassette',present:true}];
  const f=fixture({items,inspectionDraw:(rect,entry,view)=>{draws.push({rect,sourceId:entry.sourceId,view:{...view}});return{drawn:true};}});
  // The registered item fits in a normal first page by putting it first.
  f.scene.selectSection('kit');
  while(!f.hit('bag:item:gear:ren-home-cassette')){const grid=f.scene.debugState().inventory.geometry.grid;f.scene.pointer({type:'wheel',cellX:grid.x+1,cellY:grid.y+2,deltaY:100});f.scene.render();}
  enterInspection(f,'ren-home-cassette');
  assert.deepEqual(f.scene.inventoryModalActions,['mapFloorPrev','mapFloorNext','mapLocate'],'the pad poll includes inspection paging and reset');
  let state=f.scene.debugState();
  assert.equal(state.selected.readyCapable,true);assert.equal(state.selected.battleCapable,false);
  assert.match(state.selected.carryDetail,/No combat move/);
  assert.match(state.route.presentation.visibleText.map(row=>row.text).join(' '),/Read HOME/);
  assert.equal(draws.at(-1).sourceId,'ren-home-cassette');
  const held=state.model.heldSlot,contexts=itemInspectionStats().contexts;
  f.scene.key({key:'Tab',code:'Tab',preventDefault(){}});f.scene.render();
  assert.equal(f.scene.debugState().route.facetIndex,1);assert.equal(f.scene.debugState().route.activeFacetIndex,0,'focusing does not silently activate');
  f.scene.key({key:'Enter',code:'Enter'});f.scene.render();state=f.scene.debugState();
  assert.match(state.route.presentation.visibleText.map(row=>row.text).join(' '),/Unfold the warning/);
  assert.equal(draws.at(-1).view.yaw,Math.PI);assert.equal(draws.at(-1).view.pitch,.1);
  f.scene.key({key:'ArrowRight',code:'ArrowRight'});f.scene.render();assert.equal(draws.at(-1).view.yaw,Math.PI+.1);
  f.scene.key({key:'c',code:'KeyC',controllerAction:'mapLocate'});f.scene.render();assert.equal(draws.at(-1).view.yaw,0);
  f.click('bag:inspection-facet:warning');assert.equal(draws.at(-1).view.yaw,Math.PI,'facet view is absolute rather than accumulating rotations');
  assert.equal(f.scene.debugState().model.heldSlot,held);assert.deepEqual(f.holds,[],'handling a stowed keepsake does not equip or hold it in the world');
  assert.equal(itemInspectionStats().contexts,contexts,'resident inspection does not create a second GLB renderer');
  f.scene.key({key:'Escape',code:'Escape'});assert.equal(f.scene.debugState().route.type,'root');
  scenes.clear();uiSetLayoutSize(null);
});

test('inspection facets, scroll controls and final text remain reachable at small and large text sizes',()=>{
  const facets=Array.from({length:8},(_,i)=>({id:`side-${i}`,label:`Read side ${i}`,enabled:true,view:{yaw:i,pitch:0},
    lines:[{who:'direction',text:`Side ${i}. ${'A long retained record. '.repeat(80)} FINAL DETAIL ${i}.`}]}));
  for(const [cols,rows]of[[113,30],[75,20],[151,40]]){
    const f=fixture({cols,rows,items:[{id:'ren-home-cassette',present:true,inspectionActions:facets}],inspectionDraw:()=>true});
    enterInspection(f,'ren-home-cassette');
    const layout=f.scene.debugState().route.presentation;
    for(const rect of [layout.portrait,layout.text,layout.back,layout.reset,...layout.facets])inside(rect,{x:0,y:0,w:cols,h:rows});
    for(let i=0;i<7;i++){f.scene.key({key:'Tab',code:'Tab'});f.scene.render();}
    assert.ok(f.hit('bag:inspection-facet:side-7'),'Tab exposes the final real facet button');
    f.click('bag:inspection-facet:side-7');f.scene.key({key:'End',code:'End'});f.scene.render();
    const route=f.scene.debugState().route;
    assert.equal(route.detailScroll,route.presentation.maxScroll);
    assert.match(route.presentation.visibleText.map(row=>row.text).join(' '),/FINAL DETAIL 7/);
    assert.ok(f.hit('bag:inspection-scroll-up'));assert.ok(f.hit('bag:subview-back'));
    scenes.clear();
  }
  uiSetLayoutSize(null);
});

test('missing keepsake inspection exposes its record without drawing a physical item',()=>{
  let draws=0;
  const f=fixture({items:[{id:'recording-cassette:1',present:false,missing:true}],inspectionDraw:()=>{draws++;return true;}});
  enterInspection(f,'recording-cassette:1');
  assert.equal(draws,0);assert.equal(f.scene.debugState().route.inspection,null);
  const entry=f.scene.debugState().selected;
  assert.match(itemInspectionText({entry,actions:entry.inspectionActions,width:50}).map(row=>row.text).join(' '),/missing/);
  scenes.clear();uiSetLayoutSize(null);
});

test('external inspection supports absolute pose, failure fallback and disposal without a GLB load',async()=>{
  let count=0;const inspection=createItemInspection({id:'unregistered-resident-item',present:true},{draw:()=>{count++;throw new Error('unavailable');}});
  const before=itemInspectionStats().contexts;await inspection.ready;
  inspection.setView({yaw:1,pitch:.2});inspection.key({key:'ArrowRight'});
  assert.equal(inspection.view().yaw,1.1);inspection.setView({yaw:1,pitch:.2});assert.equal(inspection.view().yaw,1);
  inspection.draw({x:0,y:0,w:10,h:8});assert.equal(inspection.view().failed,true);assert.equal(count,1);
  inspection.dispose();inspection.draw({x:0,y:0,w:10,h:8});assert.equal(count,1);
  assert.equal(itemInspectionStats().contexts,before);
});
