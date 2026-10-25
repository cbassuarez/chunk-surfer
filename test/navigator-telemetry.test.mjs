import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldDeckLayout } from '../src/render/hud-layout.js';
import { machinePanelAperture } from '../src/render/presentation.js';
import { navigatorDisplayLayout } from '../src/render/navigator-layout.js';
import { navigatorTelemetryState, navigatorTelemetryLayout, paintNavigatorTelemetry } from '../src/render/navigator-telemetry.js';
import { MONITOR_THRESHOLDS, monitorSnapshotForRms } from '../src/audio/monitor.js';

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
    assert.ok(view.viewport.h>=5.5,'compact map height returns from the old telemetry reserve');
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
  for(const monitor of[null,undefined,{}, {db:NaN}, {db:Infinity}, {db:'-18'}]){
    const missing=navigatorTelemetryState({monitor}).monitor;
    assert.equal(missing.available,false);assert.equal(missing.status,'--');
    assert.equal(missing.segments,0);assert.equal(missing.peakSegments,0);assert.equal(missing.warning,false);
  }
});

test('the actual monitor danger thresholds, clipping and held peak survive the LCD conversion',()=>{
  for(const[db,status,band]of[[-48,'NORMAL','normal'],[-30,'CAUTION','mid-hot'],[-18,'HOT','hot']]){
    const snapshot=monitorSnapshotForRms(10**(db/20));
    const shown=navigatorTelemetryState({monitor:snapshot}).monitor;
    assert.equal(shown.status,status);assert.equal(shown.band,band);
    assert.equal(shown.segments,snapshot.segments);
  }
  const clipped=navigatorTelemetryState({monitor:monitorSnapshotForRms(.2,{clipped:true})}).monitor;
  assert.equal(clipped.status,'CLIP');assert.equal(clipped.warning,true);
  assert.equal(clipped.segments,MONITOR_THRESHOLDS.length);
  const held=navigatorTelemetryState({monitor:{...monitorSnapshotForRms(.001),peakDb:-9}}).monitor;
  assert.ok(held.peakSegments>held.segments,'the actual held peak is separate from the current input');
  const submittedFloor=navigatorTelemetryState({monitor:{...monitorSnapshotForRms(0),segments:4,band:'mid-hot'}}).monitor;
  assert.equal(submittedFloor.segments,4);assert.equal(submittedFloor.status,'CAUTION');
});

function recordingContext(){
  const draws=[],stack=[];
  const state={globalAlpha:1,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0};
  const ctx=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='save')return()=>stack.push({...state});
    if(key==='restore')return()=>{const saved=stack.pop();assert.ok(saved);for(const k of Object.keys(state))delete state[k];Object.assign(state,saved);};
    if(key==='createLinearGradient')return()=>({stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}});
    return(...args)=>draws.push({kind:key,args,alpha:state.globalAlpha,shadowBlur:state.shadowBlur,fillStyle:state.fillStyle});
  },set(target,key,value){target[key]=value;return true;}});
  return{ctx,draws,stack,state};
}

test('the real LCD paint has no phosphor bloom and changes only with supplied telemetry',()=>{
  const lcd={x:2,y:15,w:23,h:3.15};
  const render=telemetry=>{
    const h=recordingContext();
    paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState(telemetry),{cellW:8.45,cellH:20,dpr:1});
    assert.equal(h.stack.length,0);assert.equal(h.state.globalAlpha,1);
    assert.ok(h.draws.every(draw=>draw.shadowBlur===0),'LCD ink must never inherit a VFD halo');
    assert.ok(h.draws.filter(draw=>draw.kind==='fillRect').every(draw=>draw.args.slice(0,4).every(Number.isFinite)));
    return h.draws.map(draw=>({...draw,fillStyle:typeof draw.fillStyle==='object'?{stops:draw.fillStyle.stops}:draw.fillStyle}));
  };
  const quiet={takes:2,total:5,monitor:monitorSnapshotForRms(0)};
  assert.deepEqual(render(quiet),render(quiet),'there is no timer-driven fake signal or flicker');
  assert.notDeepEqual(render(quiet),render({...quiet,monitor:monitorSnapshotForRms(.2)}));
});

test('drawMinimap paints the LCD after the VFD scope and supplies its smaller physical cutout',()=>{
  const source=readFileSync(new URL('../src/render/minimap.js',import.meta.url),'utf8');
  const start=source.indexOf('export function drawMinimap');
  const end=source.indexOf('export function drawRecorderReturn',start);
  const body=source.slice(start,end);
  assert.match(body,/apertureBounds:layout\.aperture/);
  assert.match(body,/\}\);\s*\/\/[^]*?if\(opts\.telemetry\)drawNavigatorTelemetry\(layout\.lcd,opts\.telemetry\)/,
    'LCD rendering follows the completed main-cover scope rather than its clipped content');
  assert.doesNotMatch(body,/drawTakeRail|drawVfdMeter|drawVfdWarningTriangle/,'telemetry cannot fall back into the map VFD');
});
