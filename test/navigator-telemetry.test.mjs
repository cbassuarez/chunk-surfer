import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldDeckLayout } from '../src/render/hud-layout.js';
import { machinePanelAperture } from '../src/render/presentation.js';
import { navigatorDisplayLayout } from '../src/render/navigator-layout.js';
import { navigatorTelemetryState, navigatorTelemetryLayout, paintNavigatorTelemetry } from '../src/render/navigator-telemetry.js';
import { monitorSnapshotForRms } from '../src/audio/monitor.js';
import { sampleNavigatorLcdMotion } from '../src/render/navigator-lcd-motion.js';
import { navigatorLcdMeterGeometry, navigatorLcdScaleMarks } from '../src/render/navigator-lcd.js';
import {resetDualTraceMeters} from '../src/audio/dual-trace.js';
import {dualTracePeakIndex,dualTraceUnit,drawSevenSegmentNumber,drawTraceCell} from '../src/render/dual-trace-display.js';
import {lcdGeometry,deviceBox,paintedWord,within,matrixInk} from './helpers/lcd-geometry.mjs';

test.beforeEach(()=>resetDualTraceMeters());
let fixtureSerial=0;
// Paint/material fixtures use a real settled measurement with its own packet
// clock. They cannot borrow another test's RMS history or retained peak.
function settledTelemetryState(telemetry){
  const id=`navigator-fixture-${++fixtureSerial}`;let state;
  for(let nowMs=0;nowMs<=800;nowMs+=25)state=navigatorTelemetryState({...telemetry,
    monitor:telemetry.monitor?{...telemetry.monitor,sourceId:id,timestampMs:nowMs}:telemetry.monitor},{nowMs});
  return state;
}
const meterCellCount=()=>navigatorLcdMeterGeometry({x:0,w:20},{cellW:8.45,dpr:1}).length;

const contained=(r,b)=>r.x>=b.x-1e-7&&r.y>=b.y-1e-7
  &&r.x+r.w<=b.x+b.w+1e-7&&r.y+r.h<=b.y+b.h+1e-7;
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('the navigator LCD is a sibling below VFD glass at every supported field-deck size',()=>{
  for(const cols of[40,48,64,72,80,96,128,192])for(const rows of[24,30,36,45,50,70]){
    const housing=fieldDeckLayout({cols,rows}).navigator;
    const standard=machinePanelAperture(housing.x,housing.y,housing.w,housing.h);
    const view=navigatorDisplayLayout(standard,{telemetry:true});
    const layout=navigatorTelemetryLayout(view.lcd);
    assert.ok(contained(view.aperture,housing));
    assert.ok(contained(view.lcd,housing));
    assert.equal(intersects(view.aperture,view.lcd),false,`separate glass and polarizer at ${cols}x${rows}`);
    assert.ok(view.lcd.y-view.aperture.y-view.aperture.h>=.69,'a metal band separates the cutouts');
    assert.ok(contained(view.viewport,view.aperture));
    assert.ok(contained(view.footer,view.aperture));
    assert.ok(view.viewport.h>=5.5,'compact map height remains readable beside the condition rail');
    assert.ok(view.lcd.y+view.lcd.h<=housing.y+housing.h-1);
    for(const name of['takeLabel','takeCount','slots','injuries','monitorLabel','meter','status']){
      assert.ok(contained(layout[name],view.lcd),`${name} stays inside ${cols}x${rows} LCD`);
      assert.equal(intersects(layout[name],view.aperture),false);
    }
    assert.equal(intersects(layout.slots,layout.injuries),false);
    assert.equal(intersects(layout.meter,layout.status),false);
    assert.equal(intersects(layout.monitorLabel,layout.meter),false);
    assert.equal(intersects(layout.takeLabel,layout.takeCount),false);
  }
});

test('omitting telemetry preserves the established single-aperture layout',()=>{
  const aperture={x:4,y:5,w:24,h:13};
  const view=navigatorDisplayLayout(aperture);
  assert.deepEqual(view.aperture,aperture);
  assert.equal(view.lcd,null);
  assert.equal(view.viewport.h,8.9);
});

test('take slots and injury text reflect bounded real progress rather than decorative animation',()=>{
  const state=navigatorTelemetryState({takes:2,total:5,injuries:1});
  assert.deepEqual(state.slots,[true,true,false,false,false]);
  assert.equal(state.takes,2);assert.equal(state.total,5);assert.equal(state.injuries,1);
  assert.deepEqual(navigatorTelemetryState({takes:99,total:5,injuries:-1}).slots,[true,true,true,true,true]);
  assert.equal(navigatorTelemetryState({takes:-1}).takes,0);
  assert.equal(navigatorTelemetryState({takes:NaN,total:Infinity}).total,5);
});

test('a silent monitor remains genuinely flat and missing telemetry cannot become a fake signal',()=>{
  const silent=navigatorTelemetryState({monitor:monitorSnapshotForRms(0)}).monitor;
  assert.equal(silent.available,true);assert.equal(silent.segments,0);
  assert.equal(silent.peakSegments,0);assert.equal(silent.band,'normal');
  assert.equal(silent.warning,false);assert.equal(silent.status,'NORMAL');
  for(const monitor of[null,undefined,{}, {db:NaN}, {db:Infinity}, {db:'not-a-measurement'}, {db:-18,available:false}]){
    const missing=navigatorTelemetryState({monitor}).monitor;
    assert.equal(missing.available,false);assert.equal(missing.status,'--');
    assert.equal(missing.segments,0);assert.equal(missing.peakSegments,0);assert.equal(missing.warning,false);
  }
});

test('the actual monitor danger thresholds, clipping and held peak survive the LCD conversion',()=>{
  for(const[db,status,band]of[[-48,'NORMAL','normal'],[-30,'CAUTION','mid-hot'],[-18,'HOT','hot']]){
    const snapshot=monitorSnapshotForRms(10**(db/20));
    const shown=settledTelemetryState({monitor:snapshot}).monitor;
    assert.equal(shown.status,status);assert.equal(shown.band,band);
    assert.equal(shown.segments,dualTracePeakIndex(shown.db,meterCellCount())+1,'shared linear electrodes follow measured dB');
  }
  const clipped=navigatorTelemetryState({monitor:monitorSnapshotForRms(.2,{clipped:true})}).monitor;
  assert.equal(clipped.status,'CLIP');assert.equal(clipped.warning,true);
  assert.ok(clipped.segments<meterCellCount(),'CLIP cannot fabricate full-scale RMS');
  const held=settledTelemetryState({monitor:{...monitorSnapshotForRms(.001),peakDb:-9}}).monitor;
  assert.ok(held.peakSegments>held.segments,'the actual held peak is separate from the current input');
  const submittedFloor=settledTelemetryState({monitor:{...monitorSnapshotForRms(0),segments:4,band:'mid-hot'}}).monitor;
  assert.equal(submittedFloor.segments,0);assert.equal(submittedFloor.db,-96);assert.equal(submittedFloor.status,'CAUTION');
});

const front={x:0,y:0};
function paint(telemetry,lcd,metrics,options={}){
  const h=lcdGeometry();
  const layout=paintNavigatorTelemetry(h.ctx,lcd,settledTelemetryState(telemetry),{...metrics,view:front,...options});
  return{...h,layout};
}
function expectWord(frame,text,box,metrics){
  const word=paintedWord(frame.fills,text,deviceBox(box,metrics),{padding:2*metrics.dpr});
  assert.equal(word.length,[...text.replaceAll(' ','')].length,`${text} must use its display electrodes`);
  return word;
}
function containsInk(actual,expected,message){
  const formed=expected.filter(draw=>draw.kind==='path');
  assert.ok(formed.length>0,'the reference painter emitted real electrodes');
  for(const draw of formed)assert.ok(actual.some(candidate=>candidate.kind==='path'
    &&Math.abs(candidate.alpha-draw.alpha)<1e-9
    &&JSON.stringify(candidate.cells)===JSON.stringify(draw.cells)),message);
}

test('one real source integrates RMS separately from its immediate warning and releases to genuine silence',()=>{
  const sourceId='navigator-rms-release',packet=(rms,at)=>({...monitorSnapshotForRms(rms),sourceId,timestampMs:at});
  let shown=navigatorTelemetryState({monitor:packet(0,0)},{nowMs:0});assert.equal(shown.monitor.segments,0);
  shown=navigatorTelemetryState({monitor:packet(.2,25)},{nowMs:25});
  assert.equal(shown.monitor.status,'HOT','the gameplay warning does not wait for display RMS');
  assert.equal(shown.monitor.segments,0,'the warning does not supply an artificial RMS floor');
  for(let at=50;at<=800;at+=25)shown=navigatorTelemetryState({monitor:packet(.2,at)},{nowMs:at});
  assert.ok(shown.monitor.segments>0);assert.ok(shown.monitor.db>-15&&shown.monitor.db<-13);
  const previous=structuredClone(shown);
  for(let at=825;at<=10000;at+=25)shown=navigatorTelemetryState({monitor:packet(0,at)},{nowMs:at});
  assert.equal(shown.monitor.db,-96);assert.equal(shown.monitor.segments,0);assert.equal(shown.monitor.peakSegments,0);assert.equal(shown.monitor.status,'NORMAL');
  assert.ok(previous.monitor.segments>0,'renderer projection did not mutate the prior supplied frame');
  shown=navigatorTelemetryState({monitor:{sourceId,available:false}},{nowMs:10001});
  assert.equal(shown.monitor.available,false);assert.equal(shown.monitor.segments,0);assert.equal(shown.monitor.peakSegments,0);
});
function expectDbInk(fills,lcd,metrics,text){
  const ref=lcdGeometry(),bank=deviceBox(navigatorTelemetryLayout(lcd).db,metrics);
  drawSevenSegmentNumber(ref.ctx,text,bank.x,bank.y,bank.h,{lcd:true});
  containsInk(fills,ref.fills,`actual formed dB electrodes display ${text}`);
}

test('the LCD renders formed ink and its own bounded glow without manufacturing input',()=>{
  const lcd={x:2,y:15,w:23,h:3.15},metrics={cellW:8.45,cellH:20,dpr:1};
  const quiet={takes:2,total:5,monitor:monitorSnapshotForRms(0)};
  const normal=paint(quiet,lcd,metrics);
  assert.equal(normal.stack.length,0);
  assert.equal(normal.state.globalAlpha,1);
  assert.deepEqual(normal.nativeText,[],'no browser font participates');
  assert.ok(normal.fills.some(draw=>draw.blur>0&&draw.clip),'active electrodes glow inside the cutout');
  const reduced=paint(quiet,lcd,metrics,{reducedEffects:true});
  assert.ok(reduced.fills.every(draw=>draw.blur===0),'reduced effects preserves the text without glow');
  assert.deepEqual(normal.fills,paint(quiet,lcd,metrics).fills,'steady data never fabricates a display pulse');
  assert.notDeepEqual(normal.fills,paint({...quiet,monitor:monitorSnapshotForRms(.2)},lcd,metrics).fills);
});

test('the LCD electrodes shift together behind a fixed aperture with the viewing angle',()=>{
  const lcd={x:2,y:15,w:23,h:3.15},metrics={cellW:8.45,cellH:20,dpr:2};
  const telemetry={takes:2,total:5,monitor:monitorSnapshotForRms(0)};
  const near=paint(telemetry,lcd,metrics,{view:{x:-.8,y:.5}}),far=paint(telemetry,lcd,metrics,{view:{x:.8,y:-.5}});
  const first=matrixInk(near.fills),second=matrixInk(far.fills);
  assert.ok(first.length>0);
  assert.equal(first.length,second.length);
  const dx=second[0].ink.x-first[0].ink.x,dy=second[0].ink.y-first[0].ink.y;
  assert.ok(dx<0&&dy>0,'viewing from opposite sides moves recessed ink in the opposite direction');
  for(let i=0;i<first.length;i++){
    assert.ok(Math.abs(second[i].ink.x-first[i].ink.x-dx)<1e-8);
    assert.ok(Math.abs(second[i].ink.y-first[i].ink.y-dy)<1e-8);
    assert.deepEqual(first[i].clip,second[i].clip);
  }
  assert.deepEqual(near.fills.slice(0,3),far.fills.slice(0,3),'the housing stays fixed');
});

test('takes use digits only, while the monitor keeps its own meter',()=>{
  const metrics={cellW:8.45,cellH:20,dpr:1};
  for(const height of [3.15,4.15])for(const takes of [0,2,5]){
    const lcd={x:2,y:15,w:23,h:height},monitor=monitorSnapshotForRms(.2);
    const shown=paint({takesVisible:true,takes,total:5,monitor},lcd,metrics);
    const hidden=paint({takesVisible:false,takes,total:5,monitor},lcd,metrics);
    expectWord(shown,String(takes).padStart(2,'0'),shown.layout.takeCount,metrics);
    expectWord(shown,'/ 05',shown.layout.capacity,metrics);
    const rectangles=frame=>frame.fills.filter(draw=>draw.kind==='rect');
    assert.deepEqual(rectangles(shown),rectangles(hidden),'powering takes adds no separate bars');
    const meter=shown.layout.meter,cells=navigatorLcdMeterGeometry(meter,metrics);
    const reference=lcdGeometry(),state=settledTelemetryState({takes,total:5,monitor});
    for(const cell of cells)drawTraceCell(reference.ctx,cell.x,meter.y*metrics.cellH,cell.w,meter.h*metrics.cellH,'#ffffff',
      {alpha:cell.index<state.monitor.segments?.90:.13,chamfer:.8});
    containsInk(shown.fills,reference.fills,'monitor retains every electrode at its measured activity');
  }
});

test('drawMinimap paints the LCD after the VFD scope and supplies its smaller physical cutout',()=>{
  const source=readFileSync(new URL('../src/render/minimap.js',import.meta.url),'utf8');
  const start=source.indexOf('export function drawMinimap');
  const end=source.indexOf('export function drawRecorderReturn',start);
  const body=source.slice(start,end);
  assert.match(body,/apertureBounds:layout\.aperture/);
  assert.match(body,/\}\);\s*\/\/[^]*?if\(opts\.telemetry\)drawNavigatorTelemetry\(layout\.lcd,opts\.telemetry,\{nowMs:now(?:,view:opts\.view)?\}\)/,
    'LCD rendering follows the completed main-cover scope rather than its clipped content');
  assert.doesNotMatch(body,/drawTakeRail|drawVfdMeter|drawVfdWarningTriangle/,'telemetry cannot fall back into the map VFD');
});

test('roomy LCD value banks and the condition rail fit the same bounded hardware',()=>{
  for(const cols of[40,64,80,128])for(const rows of[24,36,45,70]){
    const housing=fieldDeckLayout({cols,rows}).navigator;
    const aperture=machinePanelAperture(housing.x,housing.y,housing.w,housing.h);
    const view=navigatorDisplayLayout(aperture,{telemetry:true}),layout=navigatorTelemetryLayout(view.lcd);
    assert.equal(view.lcd.h,aperture.h>=14?5.25:4.25);
    for(const name of['takeCount','capacity','injuries','db','dbUnit','meter','status','scale','divider'])
      assert.ok(contained(layout[name],view.lcd),`${name} in ${cols}x${rows}`);
    for(const[a,b]of[['takeCount','capacity'],['monitorLabel','status'],['db','dbUnit'],['takeCount','db'],['slots','meter']])
      assert.equal(intersects(layout[a],layout[b]),false,`${a}/${b} in ${cols}x${rows}`);
    assert.ok(layout.takeCount.h>=1,'take count has its own readable bank');
    assert.ok(view.viewport.h>=5.5,'compact maps retain their existing readable viewport');
  }
});

test('LCD response follows real changes, settles finitely and never mutates telemetry or current danger',()=>{
  const quiet=settledTelemetryState({takes:1,monitor:monitorSnapshotForRms(0)});
  const hot=settledTelemetryState({takes:2,injuries:1,monitor:monitorSnapshotForRms(.2)});
  const before=structuredClone(hot);
  let frame=sampleNavigatorLcdMotion(null,quiet,{nowMs:0});
  assert.equal(frame.illumination,0);assert.deepEqual(frame.afterimage,new Array(meterCellCount()).fill(0));
  frame=sampleNavigatorLcdMotion(frame,hot,{nowMs:16});
  assert.equal(frame.takeResponse,1);assert.equal(frame.changedSlot,1);assert.ok(frame.illumination>0);
  assert.equal(hot.monitor.status,'HOT');assert.ok(hot.monitor.segments>0);
  assert.deepEqual(hot,before,'presentation never smooths or rewrites the actual dB/danger state');
  for(let nowMs=32;nowMs<=800;nowMs+=16)frame=sampleNavigatorLcdMotion(frame,hot,{nowMs});
  assert.equal(frame.takeResponse,0);assert.equal(frame.alertResponse,0);assert.equal(frame.illumination,0);
  const quietAfterTake=settledTelemetryState({takes:2,monitor:monitorSnapshotForRms(0)});
  const falling=sampleNavigatorLcdMotion(frame,quietAfterTake,{nowMs:816});
  assert.equal(quietAfterTake.monitor.segments,0);assert.equal(quietAfterTake.monitor.db,-96);
  assert.ok(falling.afterimage.some(value=>value>0),'only a dim material afterimage may decay');
  frame=falling;
  for(let nowMs=832;nowMs<=1008;nowMs+=16)frame=sampleNavigatorLcdMotion(frame,quietAfterTake,{nowMs});
  assert.deepEqual(frame.afterimage,new Array(meterCellCount()).fill(0));
});

test('paused, repeated, backward and reduced-motion frames cannot spend animation time or invent signal',()=>{
  const quiet=settledTelemetryState({takes:0,monitor:monitorSnapshotForRms(0)});
  const changed=settledTelemetryState({takes:1,monitor:monitorSnapshotForRms(.2)});
  let frame=sampleNavigatorLcdMotion(null,quiet,{nowMs:1000});
  frame=sampleNavigatorLcdMotion(frame,changed,{nowMs:1016});
  const frozen=sampleNavigatorLcdMotion(frame,changed,{nowMs:9000,paused:true});
  assert.equal(frozen.clockMs,frame.clockMs);assert.equal(frozen.takeResponse,frame.takeResponse);
  const repeated=sampleNavigatorLcdMotion(frozen,changed,{nowMs:9000});
  assert.equal(repeated.clockMs,frozen.clockMs);
  const backward=sampleNavigatorLcdMotion(repeated,changed,{nowMs:10});
  assert.equal(backward.clockMs,0,'a backwards clock starts fresh material history rather than spending time');
  assert.equal(backward.takeResponse,0);assert.equal(backward.illumination,0);
  const reduced=sampleNavigatorLcdMotion(frame,changed,{nowMs:1032,reducedMotion:true});
  assert.equal(reduced.illumination,0);assert.equal(reduced.takeResponse,0);
  assert.deepEqual(reduced.afterimage,new Array(meterCellCount()).fill(0));
  assert.equal(changed.monitor.status,'HOT');
  const unavailable=navigatorTelemetryState({takes:1});
  const disconnected=sampleNavigatorLcdMotion(frame,unavailable,{nowMs:1032});
  assert.deepEqual(disconnected.afterimage,new Array(meterCellCount()).fill(0));
  assert.equal(disconnected.alertResponse,0);assert.equal(unavailable.monitor.segments,0);
});

test('LCD labels keep injury conditional and actual seven-segment dB ink never manufactures a signal',()=>{
  const lcd={x:2,y:15,w:23,h:3.15},metrics={cellW:8.45,cellH:20,dpr:2},monitor=monitorSnapshotForRms(0);
  const quiet=paint({takes:2,monitor},lcd,metrics);
  expectWord(quiet,'02',quiet.layout.takeCount,metrics);
  expectWord(quiet,'/ 05',quiet.layout.capacity,metrics);
  expectDbInk(quiet.fills,lcd,metrics,'-96');
  assert.equal(matrixInk(quiet.fills,deviceBox(quiet.layout.injuries,metrics)).length,0);
  const beforeTask=paint({takesVisible:false,takes:4,total:5,monitor},lcd,metrics);
  const dormant=[
    ...expectWord(beforeTask,'TAKES',beforeTask.layout.takeLabel,metrics),
    ...expectWord(beforeTask,'88',beforeTask.layout.takeCount,metrics),
    ...expectWord(beforeTask,'/ 88',beforeTask.layout.capacity,metrics),
  ];
  assert.ok(dormant.every(draw=>draw.alpha<=.13));
  expectWord(beforeTask,'MONITOR',beforeTask.layout.monitorLabel,metrics);
  expectDbInk(beforeTask.fills,lcd,metrics,'-96');
  const hurt=paint({takes:3,injuries:2,monitor:{...monitor,segments:4,band:'mid-hot'}},lcd,metrics);
  expectWord(hurt,'HURT 2',hurt.layout.injuries,metrics);
  expectWord(hurt,'CAUTION',hurt.layout.status,metrics);
  expectDbInk(hurt.fills,lcd,metrics,'-96');
});

test('losing takes or starting a new run clears earned-take response and stale ink immediately',()=>{
  const before=settledTelemetryState({takes:2,monitor:monitorSnapshotForRms(0)});
  const earned=settledTelemetryState({takes:3,monitor:monitorSnapshotForRms(.2)});
  let frame=sampleNavigatorLcdMotion(null,before,{nowMs:0});
  frame=sampleNavigatorLcdMotion(frame,earned,{nowMs:16});
  assert.equal(frame.takeResponse,1);assert.equal(frame.changedSlot,2);
  const reset=settledTelemetryState({takes:0,monitor:monitorSnapshotForRms(0)});
  frame=sampleNavigatorLcdMotion(frame,reset,{nowMs:32});
  assert.equal(frame.takes,0);assert.equal(frame.takeResponse,0);assert.equal(frame.changedSlot,-1);
  assert.equal(frame.illumination,0);assert.deepEqual(frame.afterimage,new Array(meterCellCount()).fill(0));
  assert.deepEqual(reset.slots,new Array(5).fill(false));
});

test('LCD marks follow the actual shared linear dB scale while HOT retains its immediate gameplay threshold',()=>{
  for(const width of[22.9,26.9,30.9])for(const height of[3.15,4.15])for(const dpr of[1,2]){
    const lcd={x:2,y:15,w:width,h:height},metrics={cellW:8.45,cellH:20,dpr};
    const layout=navigatorTelemetryLayout(lcd),cells=navigatorLcdMeterGeometry(layout.meter,metrics);
    const marks=navigatorLcdScaleMarks(layout,metrics);
    for(const mark of marks){
      assert.equal(mark.index,dualTracePeakIndex(mark.thresholdDb,cells.length));
      assert.equal(mark.centerPx,(layout.meter.x+dualTraceUnit(mark.thresholdDb)*layout.meter.w)*metrics.cellW*dpr);
    }
    const h=lcdGeometry();
    const shown=settledTelemetryState({monitor:monitorSnapshotForRms(10**(-18/20))});
    assert.equal(shown.monitor.status,'HOT');assert.equal(shown.monitor.band,'hot');
    paintNavigatorTelemetry(h.ctx,lcd,shown,{...metrics,view:front});
    for(const mark of marks){
      const marker=h.fills.find(draw=>draw.kind==='rect'&&Math.abs(draw.ink.x+draw.ink.w/2-mark.centerPx)<1e-7
        &&draw.ink.y<layout.scale.y*metrics.cellH*dpr&&Math.abs(draw.ink.h-1.4*dpr)<1e-7);
      assert.ok(marker,'the calibrated scale tick keeps its exact anchor');
      expectWord(h,mark.label,mark.box,metrics);
    }
    for(const mark of marks)assert.ok(contained(mark.box,layout.scale));
    assert.equal(marks[0].box.x,layout.scale.x);
    assert.equal(marks[2].box.x+marks[2].box.w,layout.scale.x+layout.scale.w);
  }
});

test('maximum count and condition labels stay legible inside the LCD clip at supported scales',()=>{
  for(const scale of[.8,1,1.6])for(const dpr of[1,2])for(const width of[22.9,30.9])for(const event of[
    {kind:'recovery',recovery:15},{kind:'damage',damage:3},{kind:'injury',injuriesAdded:1}]){
    const lcd={x:2,y:15,w:width,h:4.25,conditionRail:true},metrics={cellW:8.45*scale,cellH:20*scale,dpr};
    const frame=paint({takes:12,total:12,condition:{value:25,ceiling:35,baseline:40,injuries:12,
      strainStatus:'strained',strainRatio:.6},conditionEvent:event,conditionEventAge:.5,
      monitor:monitorSnapshotForRms(10**(-30/20))},lcd,metrics);
    expectWord(frame,'12',frame.layout.takeCount,metrics);
    expectWord(frame,'CAUTION',frame.layout.status,metrics);
    expectWord(frame,'25 / 35',frame.layout.conditionValue,metrics);
    expectWord(frame,'INJURIES',frame.layout.injuryMarks,metrics);
    for(const draw of matrixInk(frame.fills))assert.ok(within(draw.ink,draw.clip),JSON.stringify(draw.ink));
  }
});
