import test from 'node:test';
import assert from 'node:assert/strict';
import {navigatorTelemetryState} from '../src/render/navigator-telemetry.js';
import {paintNavigatorTelemetry} from '../src/render/navigator-lcd.js';
import {recorderPanelRect,liveTakePanelRect} from '../src/render/recorder-view.js';
import {recorderFaceLayout} from '../src/render/recorder-instrument.js';
import {uiSetScale,uiCellMetrics} from '../src/render/ui.js';
import {lcdGeometry,deviceBox,paintedWord,within,matrixInk} from './helpers/lcd-geometry.mjs';

function paint(lcd,data,metrics){
 const frame=lcdGeometry();
 const layout=paintNavigatorTelemetry(frame.ctx,lcd,navigatorTelemetryState(data),{...metrics,view:{x:0,y:0}});
 return{...frame,layout};
}
function expectWord(frame,text,box,metrics){
 const glyphs=paintedWord(frame.fills,text,deviceBox(box,metrics),{padding:2*metrics.dpr});
 assert.equal(glyphs.length,text.replaceAll(' ','').length,text);
 return glyphs;
}
const telemetry=[
 {takes:0,total:12,monitor:{db:-96,segments:0}},
 {takes:1,total:12,injuries:1,monitor:{db:-48,segments:1}},
 {takes:8,total:12,injuries:12,monitor:{db:-30,segments:4,band:'mid-hot'}},
 {takes:12,total:12,injuries:99,monitor:{db:-18,segments:6,band:'hot'}},
 {takes:5,total:12,monitor:{db:0,segments:12,clipped:true}},
 {takes:2,total:12,monitor:null},
];

test('full-size LCD digits and legends retain their complete electrodes inside the cutout',()=>{
 for(const scale of[.8,1,1.5])for(const dpr of[1,2])for(const height of[3.15,4.15]){
  const lcd={x:2,y:15,w:22.9,h:height},metrics={cellW:8.45*scale,cellH:20*scale,dpr};
  for(const data of telemetry){
   const h=paint(lcd,data,metrics),l=h.layout;
   assert.equal(h.stack.length,0);
   assert.deepEqual(h.nativeText,[]);
   expectWord(h,'TAKES',l.takeLabel,metrics);
   expectWord(h,'MONITOR',l.monitorLabel,metrics);
   expectWord(h,String(data.takes).padStart(2,'0'),l.takeCount,metrics);
   expectWord(h,`/ ${String(data.total).padStart(2,'0')}`,l.capacity,metrics);
   const paths=h.fills.filter(draw=>draw.kind==='path');
   assert.ok(paths.length>48,'the seven-segment numbers and separate trace rails are painted');
   for(const draw of [...matrixInk(h.fills),...paths]){
    assert.ok(within(draw.ink,draw.clip),JSON.stringify({scale,dpr,height,ink:draw.ink}));
   }
  }
 }
});

test('changing count, input, danger or injury cannot move the digit row or LCD housing',()=>{
 for(const height of[3.15,4.15]){
  const lcd={x:2,y:15,w:26.9,h:height},metrics={cellW:8.45,cellH:20,dpr:2};
  const reference=paint(lcd,telemetry[0],metrics);
  let referenceTop;
  for(const data of telemetry){
   const h=paint(lcd,data,metrics),l=h.layout;
   const digits=expectWord(h,String(data.takes).padStart(2,'0'),l.takeCount,metrics);
   const top=Math.min(...digits.map(glyph=>glyph.ink.y));
   if(referenceTop===undefined)referenceTop=top;
   assert.equal(top,referenceTop,'the same dot matrix row owns each count');
   const db=deviceBox(l.db,metrics);
   const dbPaths=h.fills.filter(draw=>draw.kind==='path'&&draw.ink.x>=db.x-.01&&draw.ink.x<db.x+db.w
    &&draw.ink.y>=db.y-.01&&draw.ink.y<db.y+db.h);
   assert.ok(dbPaths.length>0,'available and unavailable states both paint the numeric electrodes');
   for(const path of dbPaths)assert.ok(within(path.ink,db),JSON.stringify(path.ink));
   assert.deepEqual(h.fills.slice(0,3),reference.fills.slice(0,3),'the housing is fixed');
   assert.deepEqual(l,reference.layout);
  }
 }
});

test('take progress, changing speech and hold/slate labels cannot resize one recorder at a fixed viewport',()=>{
 for(const scale of[.8,1,1.5]){
  uiSetScale(scale);const{cellW,cellH}=uiCellMetrics();
  for(const [width,height]of [[960,600],[1440,900],[2560,1600]]){
   const viewport={cols:width/cellW,rows:height/cellH};
   const full=[],live=[];
   for(const progress of[0,.1,.4,.7,1])for(const clearBottom of[0,5,10,14])for(const expanded of[false,true]){
    full.push(recorderPanelRect({...viewport,progress,clearBottom}));
    live.push(liveTakePanelRect({...viewport,progress,clearBottom,expanded}));
   }
   for(const set of[full,live])for(const rect of set){
    assert.equal(rect.w,set[0].w);assert.equal(rect.h,set[0].h);
    const face=recorderFaceLayout(rect),base=recorderFaceLayout(set[0]);
    assert.equal(face.unit,base.unit);assert.equal(face.displayRect.h,base.displayRect.h);
    assert.equal(face.buttonSlots[0].h,base.buttonSlots[0].h);
    assert.ok(rect.y>=0&&rect.y+rect.h<=viewport.rows,'viewport fit remains bounded');
   }
  }
 }
 uiSetScale(1);
});
