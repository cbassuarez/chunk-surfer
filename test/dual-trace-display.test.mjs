// node --experimental-vm-modules test/dual-trace-display.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {transcriptChoiceText} from '../src/render/transcript.js';

const root=fileURLToPath(new URL('../src/',import.meta.url));
const noop=()=>{};
async function fixture(){
  const context=vm.createContext({performance:{now:()=>1000}}),cache=new Map();
  const mocks=new Map(Object.entries({
    'render/ui.js':{uiDraw:noop,uiDrawHardware:noop,uiFill:noop,uiGlyph:noop,uiText:noop,
      uiCellMetrics:()=>({cellW:12.675,cellH:30}),uiCurrentScale:()=>1.5},
    'render/hardware-material.js':{hardwareMotionReduced:()=>true},
    'render/palette.js':{uiBrightness:()=>1},
    'render/recorder-instrument.js':Object.fromEntries(['drawRecorderInstrument','recorderFaceLayout',
      'recorderDisplayPalette','drawRecorderDisplayText','drawRecorderCheckMeter'].map(name=>[name,noop])),
    'render/transcript.js':{...Object.fromEntries(['layoutTranscript','layoutTranscriptChoices','fitTranscriptChoices'].map(name=>[name,noop])),transcriptChoiceText},
    'narrative/obscured-name.js':{obscuredGlyphAt:noop,obscuredShape:noop},
    'game/access.js':{visualEffectsEnabled:()=>true},
    'game/local-text-review.js':{registerReviewRegion:noop},
  }).map(([name,value])=>[path.join(root,name),value]));
  async function load(filename){
    if(cache.has(filename))return cache.get(filename);
    const pending=(async()=>{
      if(mocks.has(filename)){
        const exports=mocks.get(filename);
        return new vm.SyntheticModule(Object.keys(exports),function(){for(const[name,value]of Object.entries(exports))this.setExport(name,value);},{context});
      }
      const module=new vm.SourceTextModule(await readFile(filename,'utf8'),{context,identifier:filename});
      await module.link((specifier,owner)=>load(path.resolve(path.dirname(owner.identifier),specifier)));
      return module;
    })();cache.set(filename,pending);return pending;
  }
  return async name=>{const module=await load(path.join(root,name));if(module.status!=='evaluated')await module.evaluate();return module.namespace;};
}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function separate(a,b){
  for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],x=-(q[1]-p[1]),y=q[0]-p[0];
    const first=a.map(p=>p[0]*x+p[1]*y),second=b.map(p=>p[0]*x+p[1]*y);
    if(Math.max(...first)<Math.min(...second)-1e-9||Math.max(...second)<Math.min(...first)-1e-9)return true;
  }
  return false;
}

test('48/24 fixed cells share one linear -48..0 scale and peak boundary convention',async()=>{
  const load=await fixture(),display=await load('render/dual-trace-display.js');
  for(const count of[48,24]){
    const cells=display.dualTraceCells({x:14,width:432,count,gap:2.4});
    assert.equal(cells.length,count);close(cells.at(-1).thresholdDb,0);
    for(let i=1;i<count;i++){
      close(cells[i].w,cells[0].w);close(cells[i].x-cells[i-1].x-cells[i-1].w,2.4);
      close(cells[i].thresholdDb-cells[i-1].thresholdDb,48/count);
    }
    assert.equal(display.dualTracePeakIndex(-48,count),-1);
    assert.equal(display.dualTracePeakIndex(-96,count),-1);
    assert.equal(display.dualTracePeakIndex(-24,count),count/2-1);
    assert.equal(display.dualTracePeakIndex(0,count),count-1);
  }
});

test('formed digits have separate diagonal junctions at all production sizes',async()=>{
  const load=await fixture(),display=await load('render/dual-trace-display.js');
  for(const height of[10.4,17,24]){
    const g=display.sevenSegmentGeometry(height),shapes=Object.values(g.shapes);
    for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++)
      assert.ok(separate(shapes[i],shapes[j]),`overlapping electrodes at ${height}px`);
    close(g.shapes.c[0][1]-g.shapes.b[3][1],g.gap*2);
  }
});

test('clustered gameplay legends remain distinct and leave endpoint calibration readable',async()=>{
  const load=await fixture(),display=await load('render/dual-trace-display.js');
  const marks=[{db:-8.5,label:'FLOOR'},{db:-8.1,label:'SPOIL'},{db:-8,label:'CATCH'}];
  for(const width of[350,584]){
    const labels=display.dualTraceMarkLabels(marks,{x:20,width,fontSize:15.3,gap:9});
    assert.equal(labels.length,3);
    assert.ok(labels[0].left>20+30);assert.ok(labels.at(-1).right<20+width-10);
    for(let i=1;i<labels.length;i++)assert.ok(labels[i].left-labels[i-1].right>=9-1e-8);
    for(const label of labels)close(label.target,20+display.dualTraceUnit(label.db)*width);
  }
});

test('MIC CHECK reserves prompt, complete meter, context and privacy at 960x600 / 150%',async()=>{
  const load=await fixture(),view=await load('render/recorder-view.js');
  const body={x:0,y:0,w:31.09650084009059,h:4.176543209876543};
  const layout=view.recorderCheckLayout(body,{cellW:12.675,cellH:30});
  const rows=[layout.prompt,layout.meter,layout.line,layout.privacy];
  assert.ok(layout.fontSize>=11);assert.ok(layout.meter.h*30>=60);
  for(let i=1;i<rows.length;i++)assert.ok(rows[i].y>rows[i-1].y+rows[i-1].h);
  close(layout.privacy.y+layout.privacy.h,body.h);
  const capacity=Math.floor(body.w*12.675/(layout.fontSize*.72+.2));
  assert.ok(capacity>='NOTHING IS RECORDING. NOTHING IS KEPT.'.length);
  assert.ok(capacity>='YOUR ROOM. THIS CHECK CANNOT SPOIL A TAKE.'.length);
});

test('normal and compact LCD rows do not intersect and calibration is linear',async()=>{
  const load=await fixture(),lcd=await load('render/navigator-lcd.js');
  for(const h of[4.15,3.15]){
    const g=lcd.navigatorTelemetryLayout({x:0,y:0,w:h===4.15?30.9:26.9,h});
    assert.ok(g.monitorLabel.y+g.monitorLabel.h<g.db.y);
    assert.ok(g.db.y+g.db.h<g.peakRail.y);
    assert.ok(g.peakReadout.y+g.peakReadout.h<g.peakRail.y);
    assert.ok(g.peakRail.y+g.peakRail.h<g.meter.y);
    assert.ok(g.meter.y+g.meter.h<g.scale.y);
    assert.ok(g.scale.y+g.scale.h<=h);
    const cells=lcd.navigatorLcdMeterGeometry(g.meter,{cellW:8.45,dpr:2});
    assert.equal(cells.length,24);
    const marks=lcd.navigatorLcdScaleMarks(g,{cellW:8.45,dpr:2});
    close(marks[1].centerPx,(marks[0].centerPx+marks[2].centerPx)/2);
  }
});

test('clip and raw HUSH warnings never change prepared RMS values or cell counts',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js');
  const dualTrace={type:'dual-trace',available:true,db:-32,peakDb:-3,numericDb:-32,numericPeakDb:-3,
    clipped:true,segments48:16,segments24:8,peakKind:'level'};
  const state=nav.navigatorTelemetryState({takes:2,total:5,injuries:1,monitor:{db:-4,peakDb:0,
    clipped:true,band:'hot',segments:12,sourceId:'field-exposure',dualTrace}},{nowMs:1000});
  assert.equal(state.monitor.db,-32);assert.equal(state.monitor.numericDb,-32);
  assert.equal(state.monitor.segments,8);assert.equal(state.monitor.segments48,16);
  assert.equal(state.monitor.band,'hot');assert.equal(state.monitor.status,'CLIP');
  assert.equal(state.injuries,1);assert.equal(state.takes,2);
  const unavailable=nav.navigatorTelemetryState({monitor:{db:-4,band:'hot',
    dualTrace:{...dualTrace,available:false}}},{nowMs:1010});
  assert.equal(unavailable.monitor.warning,false);assert.equal(unavailable.monitor.segments,0);
  assert.equal(unavailable.monitor.status,'--');
});

test('LCD afterimage covers 24 cells and cannot generate active signal on unavailable input',async()=>{
  const load=await fixture(),motion=await load('render/navigator-lcd-motion.js');
  const state={takesVisible:true,takes:2,injuries:0,monitor:{available:true,segments:24,warning:false,status:'NORMAL'}};
  const initial=motion.sampleNavigatorLcdMotion(null,state,{nowMs:100});
  assert.equal(initial.afterimage.length,24);
  const absent=motion.sampleNavigatorLcdMotion(initial,{...state,monitor:{...state.monitor,available:false,segments:0}},{nowMs:120});
  assert.ok(absent.afterimage.every(value=>value===0));
  const restarted=motion.sampleNavigatorLcdMotion(initial,{...state,monitor:{...state.monitor,segments:0}},{nowMs:50});
  assert.equal(restarted.afterimage.length,24);
  assert.ok(restarted.afterimage.every(value=>value===0));
});
