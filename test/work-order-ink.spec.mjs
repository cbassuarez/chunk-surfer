import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as L from '../src/game/cassette-ledger.js';
import {workOrderInkLayout,workOrderInkStrokesAt,workOrderInkSvg} from '../src/game/work-order-ink.js';
import {WORK_ORDER_SHEET as SHEET,WORK_ORDER_ROOMS,WORK_ORDER_CASSETTE_SLOTS} from '../src/data/work-order-sheet.js';
import {TARGETS,WORK_ORDER} from '../src/data/conservatory-script.js';
import {PAPER_DOCUMENTS} from '../src/generated/paper-catalog.js';

const take=(l,roomId,outcome,extra={})=>L.recordOnCassette(l,L.nextCassette(l).n,{roomId,outcome,...extra}).ledger;
function night(){
  let l=L.recordLevelCheck(L.signWorkOrder(L.createCassetteLedger('night'),{time:'21:52'}));
  l=take(l,'main_b3','clean');l=take(l,'the_tub','spoilt',{atSec:23,cause:'HANDLING'});l=take(l,'the_tub','rejected',{atSec:41,cause:'BREATH'});
  l=take(l,'amplifications','clean');l=L.loseCassetteOnContact(l,{random:()=>0}).ledger;
  l=L.takeB3Store(l).ledger;l=take(l,'the_tub','clean');return l;
}
const points=mark=>mark.strokes.flatMap(s=>s.points);
const inside=(pts,{x0,x1,y0,y1})=>pts.every(([x,y])=>x>=x0&&x<=x1&&y>=y0&&y<=y1);

test('sheet 1 lists the five rooms of the job, in the order the bag files them',()=>{
  assert.deepEqual(WORK_ORDER_ROOMS.map(r=>r.roomId),TARGETS);
  assert.ok(WORK_ORDER_CASSETTE_SLOTS>=Math.max(...Object.values(L.CASSETTES_ISSUED))+L.B3_STORE_CASSETTES,'every cassette Story can have gets a box');
});

test('every mark of a night becomes ink, on the page and on its own box or band',()=>{
  const l=night(),layout=workOrderInkLayout(l.marks);
  assert.equal(layout.length,l.marks.length);
  for(const mark of layout){
    assert.ok(mark.strokes.length,`${mark.kind} has strokes`);
    assert.ok(inside(points(mark),{x0:0,x1:210,y0:0,y1:297}),`${mark.kind} stays on the page`);
  }
  for(const mark of layout.filter(m=>m.kind==='note')){
    const source=l.marks.find(m=>m.id===mark.id),room=SHEET.rooms.find(r=>r.roomId===source.roomId);
    assert.ok(inside(points(mark),{x0:room.notes.x0-1,x1:195,y0:room.top,y1:room.bottom}),`${source.text} sits in ${room.name}`);
  }
  for(const mark of layout.filter(m=>m.kind==='slash')){
    const n=l.marks.find(m=>m.id===mark.id).n,box=SHEET.cassettes[n-1];
    assert.ok(inside(points(mark),{x0:box.x-1.5,x1:box.x+box.w+1.5,y0:box.y-.5,y1:box.y+box.h+.5}),`slash ${n} is on its cassette`);
  }
  const shift=layout.find(m=>m.kind==='shift'),bracket=SHEET.shifts.find(s=>s.id==='night').tick;
  assert.ok(inside(points(shift),{x0:bracket.x-1,x1:bracket.x+bracket.size*1.4,y0:bracket.y-2,y1:bracket.y+bracket.size+1}));
});

test('ink already on the sheet never moves when more is written',()=>{
  const l=night();
  for(let n=1;n<l.marks.length;n++){
    const before=workOrderInkLayout(l.marks.slice(0,n)),after=workOrderInkLayout(l.marks.slice(0,n+1));
    assert.deepEqual(after.slice(0,n),before);
  }
});

test('the check-off draws the current mark as the pen moves',()=>{
  const layout=workOrderInkLayout(night().marks),mark=layout.find(m=>m.kind==='note'),order=mark.order;
  const length=strokes=>strokes.reduce((a,{points})=>a+points.slice(1).reduce((b,p,i)=>b+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0),0);
  const earlier=length(workOrderInkStrokesAt(layout,{order,fraction:0}));
  const half=length(workOrderInkStrokesAt(layout,{order,fraction:.5})),full=length(workOrderInkStrokesAt(layout,{order,fraction:1}));
  assert.ok(Math.abs(half-earlier-mark.length/2)<1e-6);assert.ok(Math.abs(full-earlier-mark.length)<1e-6);
  assert.equal(workOrderInkStrokesAt(layout).length,layout.reduce((a,m)=>a+m.strokes.length,0));
  assert.match(workOrderInkSvg(workOrderInkStrokesAt(layout)),/^<g data-process="biro"><line /);
});

test('the bake prints sheet 1 from the same geometry, and the instructions follow on',()=>{
  const bake=readFileSync(new URL('../scripts/build-paper-assets.mjs',import.meta.url),'utf8');
  assert.match(bake,/import \{ WORK_ORDER_SHEET, WORK_ORDER_SHIFTS \} from '\.\.\/src\/data\/work-order-sheet\.js'/);
  assert.match(bake,/function templateWorkOrderChecklist\(doc,ctx\)/);
  assert.equal(WORK_ORDER.paper.checklistSheet,true);
  assert.equal(PAPER_DOCUMENTS['work-order'].pages.length,4);
  assert.ok(WORK_ORDER.paper.marks.every(m=>m.page===3),'the 5? note stays on the paragraph it was written beside');
});
