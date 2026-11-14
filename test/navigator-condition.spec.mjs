import test from 'node:test';
import assert from 'node:assert/strict';
import {navigatorConditionState,navigatorConditionEventState,navigatorTelemetryState} from '../src/render/navigator-telemetry.js';
import {navigatorTelemetryLayout,paintNavigatorTelemetry} from '../src/render/navigator-lcd.js';
import {navigatorDisplayLayout} from '../src/render/navigator-layout.js';
import {faceplateModuleLayout} from '../src/render/faceplate-module-state.js';
import {fieldDeckLayout} from '../src/render/hud-layout.js';
import {machinePanelAperture} from '../src/render/presentation.js';
import {navigatorClockLayout} from '../src/render/navigator-clock.js';
import {lcdGeometry,deviceBox,paintedWord} from './helpers/lcd-geometry.mjs';

const condition=(extra={})=>({value:25,ceiling:35,baseline:40,injuries:1,strainRatio:.6,
  strainStatus:'strained',woundStatus:'injured',capacityLoss:5,combat:false,owner:'recordist',...extra});
const contains=(outer,inner)=>inner.x>=outer.x-1e-7&&inner.y>=outer.y-1e-7&&inner.x+inner.w<=outer.x+outer.w+1e-7&&inner.y+inner.h<=outer.y+outer.h+1e-7;
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

function paint(lcd,state,metrics){
  const output=lcdGeometry();
  const layout=paintNavigatorTelemetry(output.ctx,lcd,state,{...metrics,view:{x:0,y:0}});
  return{...output,layout};
}
function expectWord(frame,text,box,metrics){
  const glyphs=paintedWord(frame.fills,text,deviceBox(box,metrics),{padding:2*metrics.dpr});
  assert.equal(glyphs.length,text.replaceAll(' ','').length,text);
}

test('supplied current reserve and live limit remain distinct from lasting injuries and combat capacity',()=>{
  for(const input of[null,{},condition({value:NaN}),condition({ceiling:0})])assert.equal(navigatorConditionState(input),null);
  const source=condition({value:0,ceiling:45,baseline:50,injuries:12,combat:true,owner:'battle:cathedral'});
  const shown=navigatorConditionState(source);
  assert.equal(shown.value,0);assert.equal(shown.ceiling,45);assert.equal(shown.baseline,50);
  assert.equal(shown.injuries,12);assert.equal(shown.owner,'battle:cathedral');assert.equal(shown.combat,true);
  shown.value=20;assert.equal(source.value,0,'presentation cannot change the supplied owner');
});

test('condition is independent of task acceptance and microphone availability',()=>{
  const state=navigatorTelemetryState({takesEnabled:false,takes:4,total:5,condition:condition(),monitor:{available:false}},{nowMs:0});
  assert.equal(state.takesEnabled,false);assert.equal(state.takes,0);assert.equal(state.monitor.available,false);
  assert.equal(state.condition.value,25);assert.equal(state.condition.ceiling,35);
  assert.equal(navigatorTelemetryState({},{nowMs:0}).condition,null,'missing input never invents a reserve');
});

test('recent exact changes use supplied receipts and freeze when their supplied age freezes',()=>{
  const recovery={kind:'recovery',recovery:5,serial:7};
  assert.equal(navigatorConditionEventState(recovery,.2).label,'+5');
  assert.equal(navigatorConditionEventState({kind:'damage',damage:3},.2).label,'-3');
  assert.equal(navigatorConditionEventState({kind:'injury',injuriesAdded:1,damage:5},.2).label,'INJURED');
  for(const age of[-1,3,Infinity,undefined])assert.equal(navigatorConditionEventState(recovery,age),null);
  assert.equal(navigatorConditionEventState({kind:'recovery',recovery:0},0),null);
  assert.deepEqual(navigatorConditionEventState(recovery,1),navigatorConditionEventState(recovery,1));
  const metrics={cellW:8.45,cellH:20,dpr:1};
  const state=navigatorTelemetryState({condition:condition(),conditionEvent:recovery,conditionEventAge:1,monitor:{available:false}},{nowMs:0});
  const output=paint({x:0,y:0,w:24,h:4.45,conditionRail:true},state,metrics);
  for(const [word,key]of[['+5','conditionChange'],['25 / 35','conditionValue'],['INJURY','injuryMarks'],['1','injuryMarks']])
    expectWord(output,word,output.layout[key],metrics);
});

test('the condition rail fits supported monitor and compact faceplate sizes without a new exterior territory',()=>{
  for(const cols of[40,48,64,72,80,96,128,192])for(const rows of[24,30,36,45,50,70]){
    const housing=fieldDeckLayout({cols,rows}).navigator;
    const display=navigatorDisplayLayout(machinePanelAperture(housing.x,housing.y,housing.w,housing.h),{telemetry:true});
    assert.ok(contains(housing,display.lcd));assert.equal(overlaps(display.aperture,display.lcd),false);
    const module=faceplateModuleLayout({cols,rows});
    for(const lcd of[display.lcd,...(module.mode==='bottom'?[module.lcd]:[])]){
      const layout=navigatorTelemetryLayout(lcd);
      for(const key of['condition','conditionLabel','conditionChange','conditionValue','injuryMarks'])assert.ok(contains(lcd,layout[key]),`${key} at ${cols}x${rows}`);
      for(const key of['meter','scale','takeCount','status'])assert.equal(overlaps(layout.condition,layout[key]),false,`${key} remains separate`);
      assert.equal(overlaps(layout.conditionLabel,layout.conditionValue),false);
      assert.equal(overlaps(layout.conditionValue,layout.injuryMarks),false);
    }
    if(module.mode==='bottom'){
      assert.ok(contains(module.territory,module.lcd));assert.equal(overlaps(module.lcd,module.map),false);
      assert.equal(overlaps(module.lcd,module.identity),false);
      assert.equal(overlaps(module.lcd,navigatorClockLayout(module.clockHousing).clock),false);
    }
  }
});

test('the real LCD painter shows depletion, recovery and lasting marks at ordinary and large-text pixel sizes',()=>{
  for(const metrics of[{cellW:8.45,cellH:20,dpr:1},{cellW:13.52,cellH:32,dpr:2}])for(const input of[
    condition({value:40,ceiling:40,injuries:0}),condition(),condition({value:35}),
    condition({value:0,ceiling:30,injuries:2,strainStatus:'depleted'}),condition({injuries:12})]){
    const lcd={x:2,y:3,w:24,h:4.45,conditionRail:true};
    const state=navigatorTelemetryState({condition:input,monitor:{available:false}},{nowMs:0});
    const output=paint(lcd,state,metrics),layout=output.layout;
    expectWord(output,'COMPOSURE',layout.conditionLabel,metrics);
    expectWord(output,`${input.value} / ${input.ceiling}`,layout.conditionValue,metrics);
    expectWord(output,input.injuries===1?'INJURY':'INJURIES',layout.injuryMarks,metrics);
    expectWord(output,String(input.injuries),layout.injuryMarks,metrics);
    expectWord(output,'INPUT UNAVAILABLE',layout.scale,metrics);
    assert.equal(paintedWord(output.fills,`HURT ${input.injuries}`,deviceBox(layout.injuries,metrics)).length,0,
      'one injury indication owns this rail');
  }
});
