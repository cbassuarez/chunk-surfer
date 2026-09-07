import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bagLayout, bagPanelBounds } from '../src/render/bag-layout.js';
import { BAG_TABS_HEIGHT, bagTabRegions, bagTabButtonState } from '../src/render/bag-tabs.js';
import { cancelControlScope, pressControl, releaseControl, sampleControl } from '../src/game/control-mechanics.js';
import { bagInventoryGeometry, bagInventoryListLayout, bagInventoryActionLayout } from '../src/render/bag-view.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { documentViewport, makeDocumentScene, makeEmbeddedDocumentReader } from '../src/game/document.js';

const model = { sections: [
  { id: 'kit', label: 'INVENTORY', countLabel: '4' },
  { id: 'map', label: 'MAP', countLabel: '1/5' },
  { id: 'sheets', label: 'SHEETS', countLabel: '08' },
  { id: 'skills', label: 'SKILLS', countLabel: '2 LEADS · 1 NEW' },
] };
const inside = (box, outer) => {
  assert.ok(box.x >= outer.x && box.y >= outer.y, JSON.stringify({ box, outer }));
  assert.ok(box.x + box.w <= outer.x + outer.w + 1e-8, JSON.stringify({ box, outer }));
  assert.ok(box.y + box.h <= outer.y + outer.h + 1e-8, JSON.stringify({ box, outer }));
};

test('four named selectors retain independent pigments, counts, and stable control identities', () => {
  const layout = bagLayout({ body: { x: 3, y: 4, w: 90, h: 28 } });
  const tabs = bagTabRegions(model, layout);
  assert.deepEqual(tabs.map(tab => tab.sectionId), ['kit', 'map', 'sheets', 'skills']);
  assert.deepEqual(tabs.map(tab => tab.label), ['INVENTORY', 'MAP', 'SHEETS', 'SKILLS']);
  assert.deepEqual(tabs.map(tab => tab.color), ['amber', 'blue', 'red', 'green']);
  assert.deepEqual(tabs.map(tab => tab.countLabel), model.sections.map(section => section.countLabel));
  for (const tab of tabs) {
    assert.equal(tab.id, `bag:tab:${tab.sectionId}`);
    assert.equal(tab.controlId, tab.id);
    assert.equal(tab.h, 2.5);
    inside(tab, layout.tabs);
    inside(tab.readout, layout.tabs);
    assert.ok(tab.y + tab.h < tab.readout.y, 'readout does not print on the plastic');
  }
});

test('long counts never resize a selector or contaminate its printed legend', () => {
  const layout = bagLayout({ body: { x: 3, y: 4, w: 54, h: 18 } });
  const before = bagTabRegions(model, layout);
  const after = bagTabRegions({ sections: model.sections.map(section => ({ ...section, countLabel: 'A MUCH LONGER SESSION STATUS · 20 LEADS RETURNED' })) }, layout);
  for (let index = 0; index < before.length; index++) {
    for (const field of ['x', 'y', 'w', 'h', 'label', 'controlId']) assert.equal(before[index][field], after[index][field]);
    const options = bagTabButtonState(after[index], 'skills');
    assert.equal(options.legend, before[index].label);
    assert.ok(!options.legend.includes('LEAD'));
  }
});

test('active lamps do not latch: pointer travel returns fully raised while the selected screen remains lit', () => {
  cancelControlScope('bag:tab:');
  const layout = bagLayout({ body: { x: 0, y: 0, w: 90, h: 28 } });
  const tabs = bagTabRegions(model, layout);
  for (const active of tabs) {
    for (const tab of tabs) {
      const options = bagTabButtonState(tab, active.sectionId);
      assert.equal(options.latched, false);
      assert.equal(options.lit, tab === active);
      assert.equal(options.selected, tab === active);
    }
    const options = bagTabButtonState(active, active.sectionId);
    sampleControl(active.controlId, { ...options, now: 0 });
    pressControl(active.controlId, { now: 0 });
    assert.equal(sampleControl(active.controlId, { ...options, now: 80 }).travel, 1);
    releaseControl(active.controlId, { now: 100 });
    assert.deepEqual(sampleControl(active.controlId, { ...options, now: 350 }), { travel: 0, lampHeat: 1 });
  }
  cancelControlScope('bag:tab:');
});

test('wide, compact, and guided layouts reserve the button bank without overlapping content or rails', () => {
  for (const w of [38, 48, 60, 68, 90, 100]) for (const h of [14, 18, 24, 30]) for (const guideRows of [0, 3, 5]) {
    const body = { x: 3, y: 4, w, h };
    const layout = bagLayout({ body, guideRows });
    assert.equal(layout.tabs.h, BAG_TABS_HEIGHT);
    const tabs = bagTabRegions(model, layout);
    tabs.forEach(tab => inside(tab, layout.tabs));
    for (let i = 1; i < tabs.length; i++) assert.ok(tabs[i - 1].x + tabs[i - 1].w < tabs[i].x);
    for (const name of ['tabs', 'list', 'detail', 'taskRail', 'actionRail']) inside(layout[name], body);
    assert.ok(layout.tabs.y + layout.tabs.h < layout.detail.y);
    assert.ok(layout.list.y + layout.list.h < layout.taskRail.y);
    assert.ok(layout.detail.y + layout.detail.h < layout.taskRail.y);
    if (layout.mode === 'compact') assert.ok(layout.detail.y + layout.detail.h <= layout.list.y);
    if (layout.guide) {
      inside(layout.guide, body);
      assert.equal(layout.taskRail.y, layout.guide.y - 1);
      assert.ok(layout.guide.y + layout.guide.h < layout.actionRail.y);
    }
  }
});

test('responsive panel bounds and drawing use the shared selectable regions', () => {
  for (const [cols, rows] of [[75, 25], [113, 30], [151, 38]]) {
    inside(bagPanelBounds({ cols, rows }), { x: 0, y: 0, w: cols, h: rows });
  }
  assert.deepEqual(bagTabRegions(model, null), []);
  assert.deepEqual(bagTabRegions({ sections: [] }, bagLayout()), []);
  const source = readFileSync('src/render/bag-view.js', 'utf8');
  assert.match(source, /for \(const tab of bagTabRegions\(model, layout\)\)/);
  assert.match(source, /const state=bagTabButtonState\(tab, active\)/);
  assert.match(source, /drawLampButton\(tab\.x, tab\.y, tab\.w, tab\.h, state\)/);
});

test('80 by 30 cells keep the complete inventory inside the remaining body with four actionable rows', () => {
  const outer=bagPanelBounds({cols:80,rows:30});
  const body=machinePanelBody(outer.x,outer.y,outer.w,outer.h);
  const layout=bagLayout({body});
  const geo=bagInventoryGeometry(model,{},layout);
  for(const name of ['ready','list','detail'])inside(geo[name],geo.region);
  assert.ok(geo.ready.y+geo.ready.h<geo.list.y);
  assert.ok(geo.list.x+geo.list.w<geo.detail.x);
  assert.ok(geo.region.y>=layout.tabs.y+layout.tabs.h);
  assert.ok(geo.region.y+geo.region.h<layout.taskRail.y);
  assert.ok(bagInventoryListLayout(geo.list).capacity>=4,'several inventory entries remain visible');
  const actions=Array.from({length:4},(_,index)=>({id:`action-${index}`,label:`ACTION ${index}`}));
  const actionLayout=bagInventoryActionLayout(geo.detail,{actionList:actions});
  assert.equal(actionLayout.rows.length,4,'SET, USE, DROP and INSPECT all fit');
  actionLayout.rows.forEach(row=>inside(row,geo.detail));
});

test('inventory summary and selectable rows never borrow height from the task/guide/footer rails', () => {
  for(const [cols,rows] of [[50,25],[65,25],[80,30],[113,30],[151,38]])for(const guideRows of [0,3,5]){
    const outer=bagPanelBounds({cols,rows});
    const layout=bagLayout({body:machinePanelBody(outer.x,outer.y,outer.w,outer.h),guideRows});
    const geo=bagInventoryGeometry(model,{},layout);
    for(const name of ['ready','list','detail'])inside(geo[name],geo.region);
    const list=bagInventoryListLayout(geo.list);
    for(let index=0;index<list.capacity;index++)inside({x:geo.list.x,y:list.startY+index*list.rowH,w:geo.list.w,h:list.rowH},geo.list);
    const entry={actionList:Array.from({length:5},(_,index)=>({id:`action-${index}`}))};
    const actions=bagInventoryActionLayout(geo.detail,entry,{actionFocus:true,actionIndex:4});
    actions.rows.forEach(row=>inside(row,geo.detail));
    if(actions.titleY!==null)inside({x:geo.detail.x,y:actions.titleY,w:1,h:1},geo.detail);
    if(actions.hintY!==null)inside({x:geo.detail.x,y:actions.hintY,w:1,h:1},geo.detail);
    if(actions.capacity>0)assert.ok(actions.rows.some(row=>row.index===4),'focused actions scroll into the bounded detail window');
  }
});

test('short inventories use one-row entries and action hit geometry preserves actual action indices', () => {
  const rect={x:5,y:12,w:30,h:4.8};
  assert.deepEqual(bagInventoryListLayout(rect),{compact:true,rowH:1,startY:13,capacity:3});
  const entry={actionList:Array.from({length:5},(_,index)=>({id:`action-${index}`}))};
  const actions=bagInventoryActionLayout(rect,entry,{actionFocus:true,actionIndex:4});
  assert.equal(actions.descriptionRows,0);
  assert.equal(actions.rows.at(-1).index,4);
  assert.equal(actions.rows.at(-1).action.id,'action-4');
  actions.rows.forEach(row=>inside(row,rect));
});

test('embedded paper reserves the selector bank at every scale while its footer stays in the main frame', () => {
  for(const [cols,rows] of [[80,30],[113,30],[151,38]])for(const dpr of [1,1.5,2])for(const scale of [1,1.25,1.5]){
    const surface={cols,rows,cellW:8.45*scale,cellH:20*scale,dpr};
    const viewport=documentViewport(surface,BAG_TABS_HEIGHT);
    assert.equal(viewport.topRows,BAG_TABS_HEIGHT);
    assert.equal(viewport.rows,rows-BAG_TABS_HEIGHT);
    assert.equal(viewport.offsetY,BAG_TABS_HEIGHT*surface.cellH*dpr);
    assert.equal(viewport.width,cols*surface.cellW*dpr,'fit-width reading stays full width');
    assert.ok(Math.abs(viewport.offsetY+viewport.height-rows*surface.cellH*dpr)<1e-8);
    const localReadFooter=viewport.height-3*surface.cellH*dpr;
    const globalReadFooter=(rows-3)*surface.cellH*dpr;
    assert.ok(Math.abs(viewport.offsetY+localReadFooter-globalReadFooter)<1e-8,'footer gutter remains at the original global location');
  }
});

test('standalone/Haystack paper framing is unchanged and an embedded reader retains its page controls', () => {
  const surface={cols:80,rows:30,cellW:8.45,cellH:20,dpr:2};
  const legacy=documentViewport(surface);
  assert.deepEqual(legacy,{topRows:0,rows:30,offsetY:0,width:1352,height:1200});
  assert.equal(documentViewport(surface,-10).topRows,0);
  assert.equal(documentViewport(surface,Infinity).topRows,0);
  assert.equal(documentViewport(surface,1000).rows,4,'even an oversized reservation leaves the reading/footer minimum');
  const doc={id:'work-order',title:'WORK ORDER'};
  const ordinary=makeDocumentScene(doc,{sourcePressureLive:true});
  assert.equal(ordinary.view().reservedTopRows,0);
  assert.equal(ordinary.sourcePressureLive,true);
  assert.equal(ordinary.blocksWorld,false);
  const embedded=makeEmbeddedDocumentReader(doc,{reservedTopRows:BAG_TABS_HEIGHT});
  assert.equal(embedded.view().reservedTopRows,BAG_TABS_HEIGHT);
  assert.equal(embedded.blocksWorld,true);
  embedded.key({key:'z',code:'KeyZ'});
  assert.equal(embedded.view().reading,true);
  embedded.key({key:'ArrowDown',code:'ArrowDown'});
  assert.equal(embedded.view().scroll,90);
  embedded.key({key:'Escape',code:'Escape'});
  assert.equal(embedded.view().reading,false);
  assert.equal(embedded.view().scroll,0);
  const source=readFileSync('src/game/document.js','utf8');
  assert.match(source,/ctx\.rect\(0,viewport\.offsetY,viewport\.width,viewport\.height\);ctx\.clip\(\)/);
  assert.match(source,/ctx\.translate\(0,viewport\.offsetY\)/);
  assert.match(source,/readRect\(paperSurface,state\.image\)/);
  assert.match(source,/inspectRect\(paperSurface\)/);
  assert.match(source,/finally\{ctx\.restore\(\);\}/,'the zoom early return restores its viewport transform');
});
