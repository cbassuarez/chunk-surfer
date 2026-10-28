import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldDeckLayout } from '../src/render/hud-layout.js';
import { machinePanelAperture } from '../src/render/presentation.js';
import { navigatorDisplayLayout } from '../src/render/navigator-layout.js';
import { navigatorTelemetryState, navigatorTelemetryLayout, paintNavigatorTelemetry } from '../src/render/navigator-telemetry.js';
import { MONITOR_THRESHOLDS, monitorSnapshotForRms } from '../src/audio/monitor.js';
import { sampleNavigatorLcdMotion } from '../src/render/navigator-lcd-motion.js';
import { navigatorLcdMeterGeometry, navigatorLcdScaleMarks } from '../src/render/navigator-lcd.js';

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
    return(...args)=>draws.push({kind:key,args,alpha:state.globalAlpha,shadowBlur:state.shadowBlur,fillStyle:state.fillStyle,font:state.font});
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

test('takes use digits only, while the monitor keeps its own meter',()=>{
  const metrics={cellW:8.45,cellH:20,dpr:1};
  for(const height of [3.15,4.15])for(const takes of [0,2,5]){
    const lcd={x:2,y:15,w:23,h:height},monitor=monitorSnapshotForRms(.2);
    const render=takesVisible=>{
      const h=recordingContext();
      paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState({takesVisible,takes,total:5,monitor}),metrics);
      return h.draws;
    };
    const shown=render(true),hidden=render(false);
    assert.ok(shown.some(d=>d.kind==='fillText'&&d.args[0]===String(takes).padStart(2,'0')));
    assert.ok(shown.some(d=>d.kind==='fillText'&&d.args[0]==='/ 05'));
    const rectangles=draws=>draws.filter(d=>d.kind==='fillRect').map(d=>({args:d.args,alpha:d.alpha,
      fillStyle:typeof d.fillStyle==='object'?d.fillStyle.stops:d.fillStyle}));
    assert.deepEqual(rectangles(shown),rectangles(hidden),
      'showing the takes count adds no row of bars or rectangles');
    const meter=navigatorTelemetryLayout(lcd).meter;
    const cells=navigatorLcdMeterGeometry(meter,metrics);
    for(const cell of cells)assert.ok(shown.some(d=>d.kind==='fillRect'
      &&d.args[0]===cell.x&&d.args[1]===meter.y*metrics.cellH
      &&d.args[2]===cell.w&&d.args[3]===meter.h*metrics.cellH),
      'the live monitor retains every meter segment');
  }
});

test('drawMinimap paints the LCD after the VFD scope and supplies its smaller physical cutout',()=>{
  const source=readFileSync(new URL('../src/render/minimap.js',import.meta.url),'utf8');
  const start=source.indexOf('export function drawMinimap');
  const end=source.indexOf('export function drawRecorderReturn',start);
  const body=source.slice(start,end);
  assert.match(body,/apertureBounds:layout\.aperture/);
  assert.match(body,/\}\);\s*\/\/[^]*?if\(opts\.telemetry\)drawNavigatorTelemetry\(layout\.lcd,opts\.telemetry,\{nowMs:now\}\)/,
    'LCD rendering follows the completed main-cover scope rather than its clipped content');
  assert.doesNotMatch(body,/drawTakeRail|drawVfdMeter|drawVfdWarningTriangle/,'telemetry cannot fall back into the map VFD');
});

test('roomy LCD gets larger value banks without stealing compact map area or crossing its glass',()=>{
  for(const cols of[40,64,80,128])for(const rows of[24,36,45,70]){
    const housing=fieldDeckLayout({cols,rows}).navigator;
    const aperture=machinePanelAperture(housing.x,housing.y,housing.w,housing.h);
    const view=navigatorDisplayLayout(aperture,{telemetry:true}),layout=navigatorTelemetryLayout(view.lcd);
    assert.equal(view.lcd.h,aperture.h>=14?4.15:3.15);
    for(const name of['takeCount','capacity','injuries','db','dbUnit','meter','status','scale','divider'])
      assert.ok(contained(layout[name],view.lcd),`${name} in ${cols}x${rows}`);
    for(const[a,b]of[['takeCount','capacity'],['monitorLabel','status'],['db','dbUnit'],['takeCount','db'],['slots','meter']])
      assert.equal(intersects(layout[a],layout[b]),false,`${a}/${b} in ${cols}x${rows}`);
    assert.ok(layout.takeCount.h>=1,'take count has its own readable bank');
    assert.ok(view.viewport.h>=5.5,'small map sight area is retained');
  }
});

test('LCD response follows real changes, settles finitely and never mutates telemetry or current danger',()=>{
  const quiet=navigatorTelemetryState({takes:1,monitor:monitorSnapshotForRms(0)});
  const hot=navigatorTelemetryState({takes:2,injuries:1,monitor:monitorSnapshotForRms(.2)});
  const before=structuredClone(hot);
  let frame=sampleNavigatorLcdMotion(null,quiet,{nowMs:0});
  assert.equal(frame.illumination,0);assert.deepEqual(frame.afterimage,new Array(12).fill(0));
  frame=sampleNavigatorLcdMotion(frame,hot,{nowMs:16});
  assert.equal(frame.takeResponse,1);assert.equal(frame.changedSlot,1);assert.ok(frame.illumination>0);
  assert.equal(hot.monitor.status,'HOT');assert.ok(hot.monitor.segments>0);
  assert.deepEqual(hot,before,'presentation never smooths or rewrites the actual dB/danger state');
  for(let nowMs=32;nowMs<=800;nowMs+=16)frame=sampleNavigatorLcdMotion(frame,hot,{nowMs});
  assert.equal(frame.takeResponse,0);assert.equal(frame.alertResponse,0);assert.equal(frame.illumination,0);
  const quietAfterTake=navigatorTelemetryState({takes:2,monitor:monitorSnapshotForRms(0)});
  const falling=sampleNavigatorLcdMotion(frame,quietAfterTake,{nowMs:816});
  assert.equal(quietAfterTake.monitor.segments,0);assert.equal(quietAfterTake.monitor.db,-96);
  assert.ok(falling.afterimage.some(value=>value>0),'only a dim material afterimage may decay');
  frame=falling;
  for(let nowMs=832;nowMs<=1008;nowMs+=16)frame=sampleNavigatorLcdMotion(frame,quietAfterTake,{nowMs});
  assert.deepEqual(frame.afterimage,new Array(12).fill(0));
});

test('paused, repeated, backward and reduced-motion frames cannot spend animation time or invent signal',()=>{
  const quiet=navigatorTelemetryState({takes:0,monitor:monitorSnapshotForRms(0)});
  const changed=navigatorTelemetryState({takes:1,monitor:monitorSnapshotForRms(.2)});
  let frame=sampleNavigatorLcdMotion(null,quiet,{nowMs:1000});
  frame=sampleNavigatorLcdMotion(frame,changed,{nowMs:1016});
  const frozen=sampleNavigatorLcdMotion(frame,changed,{nowMs:9000,paused:true});
  assert.equal(frozen.clockMs,frame.clockMs);assert.equal(frozen.takeResponse,frame.takeResponse);
  const repeated=sampleNavigatorLcdMotion(frozen,changed,{nowMs:9000});
  assert.equal(repeated.clockMs,frozen.clockMs);
  const backward=sampleNavigatorLcdMotion(repeated,changed,{nowMs:10});
  assert.equal(backward.clockMs,repeated.clockMs);
  const reduced=sampleNavigatorLcdMotion(frame,changed,{nowMs:1032,reducedMotion:true});
  assert.equal(reduced.illumination,0);assert.equal(reduced.takeResponse,0);
  assert.deepEqual(reduced.afterimage,new Array(12).fill(0));
  assert.equal(changed.monitor.status,'HOT');
  const unavailable=navigatorTelemetryState({takes:1});
  const disconnected=sampleNavigatorLcdMotion(frame,unavailable,{nowMs:1032});
  assert.deepEqual(disconnected.afterimage,new Array(12).fill(0));
  assert.equal(disconnected.alertResponse,0);assert.equal(unavailable.monitor.segments,0);
});

test('LCD native ink keeps injury badge conditional and exposes submitted dB without a VFD glyph substitute',()=>{
  const lcd={x:2,y:15,w:23,h:3.15};
  const paints=telemetry=>{
    const h=recordingContext();
    paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState(telemetry),{cellW:8.45,cellH:20,dpr:2});
    return h.draws.filter(draw=>draw.kind==='fillText').map(draw=>draw.args[0]);
  };
  const quiet=paints({takes:2,monitor:monitorSnapshotForRms(0)});
  assert.ok(quiet.includes('02'));assert.ok(quiet.includes('/ 05'));assert.ok(quiet.includes('-96'));
  assert.ok(!quiet.some(text=>text.startsWith('HURT')));
  const beforeTask=paints({takesVisible:false,takes:4,total:5,monitor:monitorSnapshotForRms(0)});
  assert.ok(!beforeTask.includes('TAKES'));assert.ok(!beforeTask.includes('04'));assert.ok(!beforeTask.includes('/ 05'));
  assert.ok(beforeTask.includes('MONITOR')&&beforeTask.includes('-96'),'the measured monitor survives the dark take bank');
  const hurt=paints({takes:3,injuries:2,monitor:{...monitorSnapshotForRms(0),segments:4,band:'mid-hot'}});
  assert.ok(hurt.includes('HURT 2'));assert.ok(hurt.includes('-30'));assert.ok(hurt.includes('CAUTION'));
});

test('losing takes or starting a new run clears earned-take response and stale ink immediately',()=>{
  const before=navigatorTelemetryState({takes:2,monitor:monitorSnapshotForRms(0)});
  const earned=navigatorTelemetryState({takes:3,monitor:monitorSnapshotForRms(.2)});
  let frame=sampleNavigatorLcdMotion(null,before,{nowMs:0});
  frame=sampleNavigatorLcdMotion(frame,earned,{nowMs:16});
  assert.equal(frame.takeResponse,1);assert.equal(frame.changedSlot,2);
  const reset=navigatorTelemetryState({takes:0,monitor:monitorSnapshotForRms(0)});
  frame=sampleNavigatorLcdMotion(frame,reset,{nowMs:32});
  assert.equal(frame.takes,0);assert.equal(frame.takeResponse,0);assert.equal(frame.changedSlot,-1);
  assert.equal(frame.illumination,0);assert.deepEqual(frame.afterimage,new Array(12).fill(0));
  assert.deepEqual(reset.slots,new Array(5).fill(false));
});

test('LCD requests its own bundled ink fonts and keeps readable matrix fallback until they are ready',()=>{
  let ready=false;
  const requested=[],fonts={check:()=>ready,load:spec=>{requested.push(spec);return Promise.resolve([]);}};
  const lcd={x:2,y:15,w:23,h:3.15},state=navigatorTelemetryState({takes:2,monitor:monitorSnapshotForRms(0)});
  const draw=()=>{
    const h=recordingContext();h.ctx.canvas={ownerDocument:{fonts}};
    paintNavigatorTelemetry(h.ctx,lcd,state,{cellW:8.45,cellH:20,dpr:1});return h.draws;
  };
  const loading=draw();
  assert.equal(requested.length,2,'the actual first draw starts both bundled face weights');
  assert.ok(loading.some(command=>command.kind==='fillRect'));
  assert.ok(!loading.some(command=>command.kind==='fillText'),'ROM ink remains while native ink is unavailable');
  ready=true;
  const decoded=draw();
  assert.ok(decoded.some(command=>command.kind==='fillText'&&command.args[0]==='02'));
  assert.equal(requested.length,2,'font loads are not restarted on every frame');
});

test('LCD printed HOT threshold aligns with its actual sixth electrode rather than a fake linear dB scale',()=>{
  for(const width of[22.9,26.9,30.9])for(const height of[3.15,4.15])for(const dpr of[1,2]){
    const lcd={x:2,y:15,w:width,h:height},metrics={cellW:8.45,cellH:20,dpr};
    const layout=navigatorTelemetryLayout(lcd),cells=navigatorLcdMeterGeometry(layout.meter,metrics);
    const marks=navigatorLcdScaleMarks(layout,metrics),hot=marks.find(mark=>mark.thresholdDb===-18);
    assert.equal(hot.index,MONITOR_THRESHOLDS.indexOf(-18));assert.equal(hot.index,5);
    assert.equal(hot.centerPx,cells[5].center);assert.equal(hot.align,'center');
    const h=recordingContext();
    paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState({monitor:monitorSnapshotForRms(10**(-18/20))}),metrics);
    const printed=h.draws.filter(draw=>draw.kind==='fillText'&&draw.args[0]==='-18').at(-1);
    assert.equal(printed.args[1],Math.round(cells[5].center),'actual painted caption shares the active HOT electrode center');
    for(const mark of marks)assert.ok(contained(mark.box,layout.scale));
    assert.equal(marks[0].box.x,layout.scale.x);
    assert.equal(marks[2].box.x+marks[2].box.w,layout.scale.x+layout.scale.w);
  }
});

// Read the actual bundled font's OpenType advance tables. These are external
// production artifacts, not a guessed character width from the LCD renderer.
function bundledInkWidth(filename){
  const bytes=readFileSync(new URL(`../public/assets/fonts/${filename}`,import.meta.url));
  const u16=at=>bytes.readUInt16BE(at),u32=at=>bytes.readUInt32BE(at),tables={};
  for(let i=0;i<u16(4);i++)tables[bytes.toString('ascii',12+i*16,16+i*16)]=u32(20+i*16);
  const cmap=tables.cmap;let offset=null;
  for(let i=0;i<u16(cmap+2);i++){const candidate=cmap+u32(cmap+8+i*8);if(u16(candidate)===4){offset=candidate;break;}}
  assert.ok(offset,'bundled font has its real Unicode format4 map');
  const segments=u16(offset+6)/2,end=offset+14,start=end+segments*2+2,delta=start+segments*2,range=delta+segments*2;
  const glyph=char=>{
    const code=char.codePointAt(0);
    for(let i=0;i<segments;i++)if(u16(start+i*2)<=code&&code<=u16(end+i*2)){
      const d=u16(delta+i*2),r=u16(range+i*2);
      if(!r)return(code+d)&65535;
      const index=u16(range+i*2+r+(code-u16(start+i*2))*2);return index?(index+d)&65535:0;
    }
    return 0;
  };
  const units=u16(tables.head+18),metrics=u16(tables.hhea+34);
  return(text,size)=>[...text].reduce((sum,char)=>sum+u16(tables.hmtx+Math.min(glyph(char),metrics-1)*4),0)*size/units;
}

test('all maximum-count LCD labels fit their real bundled font widths without condensed CAUTION lettering',()=>{
  const widths={400:bundledInkWidth('NimbusSans-Regular.otf'),600:bundledInkWidth('NimbusSans-Bold.otf')};
  for(const scale of[.8,1,1.5])for(const dpr of[1,2])for(const width of[22.9,30.9]){
    const lcd={x:2,y:15,w:width,h:3.15},h=recordingContext();
    paintNavigatorTelemetry(h.ctx,lcd,navigatorTelemetryState({takes:12,total:12,injuries:99,
      monitor:monitorSnapshotForRms(10**(-30/20))}),{cellW:8.45*scale,cellH:20*scale,dpr});
    const ink=h.draws.filter(draw=>draw.kind==='fillText');
    assert.ok(ink.some(draw=>draw.args[0]==='CAUTION'));
    for(const draw of ink){
      const[,weight,size]=/^(400|600) ([\d.]+)px/.exec(draw.font);
      const natural=widths[weight](draw.args[0],Number(size));
      assert.ok(natural<=draw.args[3]+1e-7,`${draw.args[0]} needs ${natural}px but has ${draw.args[3]}px`);
    }
  }
});
