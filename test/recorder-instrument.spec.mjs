import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recorderFaceLayout, recorderOutputReading, drawRecorderInstrument } from '../src/render/recorder-instrument.js';
import { uiCellMetrics, uiCurrentScale, uiSetScale } from '../src/render/ui.js';
import { dbToUnit, dbForLinear, locationMarks, meterMarks } from '../src/render/meter.js';
import { normalizeFieldKit } from '../src/game/field-kit.js';
import { drawElectronicText as renderElectronicText } from '../src/render/electronic-text.js';
import { witnessEndingIds } from '../src/render/witness-material.js';
import { drawHardwareCap as renderHardwareCap } from '../src/render/hardware-material.js';
import { drawHardwarePrint as renderHardwarePrint } from '../src/render/hardware-faceplate.js';
import {withSourceRestInstrumentDecay} from '../src/render/source-rest-instrument-decay.js';
import {dualTraceSnapshot,resetDualTraceMeters} from '../src/audio/dual-trace.js';
import {paintDualTraceVfd,dualTraceVfdLayout,dualTraceUnit,dualTracePeakIndex,drawSevenSegmentNumber,drawTraceVfdText} from '../src/render/dual-trace-display.js';
import {sourceRestInstrumentStory} from '../src/render/source-rest-instrument-story.js';

test.afterEach(()=>uiSetScale(1));
test.beforeEach(()=>resetDualTraceMeters());
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);
const inside=(a,b,message='')=>{
  assert.ok([a.x,a.y,a.w,a.h].every(Number.isFinite),message);
  assert.ok(a.w>0&&a.h>0,message);
  assert.ok(a.x>=b.x-1e-8&&a.y>=b.y-1e-8&&a.x+a.w<=b.x+b.w+1e-8&&a.y+a.h<=b.y+b.h+1e-8,`${message}: ${JSON.stringify({a,b})}`);
};
const separate=(a,b)=>a.x+a.w<=b.x+1e-8||b.x+b.w<=a.x+1e-8||a.y+a.h<=b.y+1e-8||b.y+b.h<=a.y+1e-8;
function rectForPixels(width,height,{x=0,y=0}={}){
  const{cellW,cellH}=uiCellMetrics();return{x:x/cellW,y:y/cellH,w:width/cellW,h:height/cellH};
}
function designBox(g,box){
  const{cellW,cellH}=uiCellMetrics();
  return{x:(box.x-g.rect.x)*cellW/g.unit,y:(box.y-g.rect.y)*cellH/g.unit,w:box.w*cellW/g.unit,h:box.h*cellH/g.unit};
}

test('the approved 736×405 recorder maps exactly at unit one with three bottom controls',()=>{
  uiSetScale(1);const rect=rectForPixels(736,405),g=recorderFaceLayout(rect);
  assert.equal(g.unit,1);near(g.W,736);near(g.H,405);assert.equal(g.compact,false);
  for(const[key,expected]of Object.entries({
    displayRect:{x:35,y:76,w:666,h:239},body:{x:55,y:96,w:626,h:199},
    counterRect:{x:55,y:120,w:666*.43,h:91},locationRect:{x:35+666*.49,y:124,w:666*.51-22,h:94},
    outputRect:{x:55,y:262,w:626,h:40},
  }))for(const[prop,value]of Object.entries(expected))near(designBox(g,g[key])[prop],value,`${key}.${prop}`);
  assert.equal(g.buttonSlots.length,3);
  g.buttonSlots.forEach((slot,i)=>{
    const actual=designBox(g,slot);near(actual.x,415+i*99);near(actual.y,334);near(actual.w,89);near(actual.h,33);
  });
  assert.deepEqual(g.transcriptRect,g.body);assert.deepEqual(g.listRect,g.body);
});

test('supported UI scales and narrow viewports keep real instruments separate and controls beneath glass',()=>{
  for(const scale of [1,1.5]){
    uiSetScale(scale);
    for(const[width,height]of [[736*scale,405*scale],[900,540],[600,390],[360,360]]){
      const g=recorderFaceLayout(rectForPixels(width,height,{x:12,y:8}));
      const plate={x:12,y:15,w:g.W-24,h:g.H-35};
      inside(designBox(g,g.displayRect),plate,'aperture in metal');
      for(const key of ['body','counterRect','locationRect','outputRect'])if(g[key])inside(g[key],g.displayRect,key);
      const instruments=[g.counterRect,g.locationRect,g.outputRect].filter(Boolean);
      for(let i=0;i<instruments.length;i++)for(let j=i+1;j<instruments.length;j++)assert.ok(separate(instruments[i],instruments[j]),`${width}×${height}@${scale}: instrument overlap`);
      for(const slot of g.buttonSlots){inside(designBox(g,slot),plate,'button in metal');assert.ok(slot.y>=g.displayRect.y+g.displayRect.h,'no side transport bank');}
      for(let i=1;i<3;i++)assert.ok(separate(g.buttonSlots[i-1],g.buttonSlots[i]));
      assert.equal(new Set(g.buttonSlots.map(slot=>slot.y)).size,1,'three fixed horizontal slots');
    }
  }
});

test('a genuinely short viewport scales the complete face instead of overlapping counter and output',()=>{
  for(const scale of [1,1.5]){
    uiSetScale(scale);
    for(const width of [360,736]){
      const g=recorderFaceLayout(rectForPixels(width,216));
      assert.ok(separate(g.counterRect,g.outputRect),`${width}×216@${scale}: counter overlaps output`);
      if(g.locationRect)assert.ok(separate(g.locationRect,g.outputRect));
      for(const key of ['body','counterRect','locationRect','outputRect'])if(g[key])inside(g[key],g.displayRect,key);
    }
  }
});

test('output selection preserves the real meter, then room mic, then actual maximum stereo amplitude',()=>{
  const meter={db:-24,peakDb:-12},roomMeter={db:-36},marks=[{kind:'spoil',db:-12}];
  const full=recorderOutputReading({meter,roomMeter,levels:{left:.9,right:.8},meterLabel:'TAKE LEVEL',meterMarks:marks});
  assert.equal(full.snapshot,meter);assert.equal(full.marks,marks);assert.equal(full.label,'TAKE LEVEL');
  assert.deepEqual(recorderOutputReading({roomMeter,levels:{left:1,right:1}}),{snapshot:roomMeter,label:'ROOM MIC',marks:null,sourceId:'room-mic'});
  for(const[left,right]of [[.1,.5],[.9,.2],[0,0],[-1,-2],[NaN,.25],[Infinity,.125]]){
    const safe=value=>Number.isFinite(value)?value:0;
    const result=recorderOutputReading({levels:{left,right}});
    near(result.snapshot.db,dbForLinear(Math.max(safe(left),safe(right))),'real stereo amplitude in dB');
  }
  assert.equal(recorderOutputReading().snapshot.db,-96,'an empty input is silence, never the study’s decorative lit bar');
});

// The real drawing body, with only its outer UI/material boundaries recorded.
// This preserves the authored character/segment loops and their alpha logic.
function drawingHarness({alpha=1,dpr=1,travel=0}={}){
  const commands=[],stack=[];
  const state={globalAlpha:alpha,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,font:'',transform:[1,0,0,1,0,0]};
  let path=[];
  const point=(x,y)=>{const[a,b,c,d,e,f]=state.transform;return[a*x+c*y+e,b*x+d*y+f];};
  const snapshot=()=>({...state,transform:[...state.transform]});
  const record=(kind,args=[])=>commands.push({kind,args,state:snapshot(),path:path.map(part=>[...part])});
  const methods={
    save(){stack.push(snapshot());},restore(){assert.ok(stack.length);for(const key of Object.keys(state))delete state[key];Object.assign(state,stack.pop());},
    getTransform(){const[a,b,c,d,e,f]=state.transform;return{a,b,c,d,e,f};},
    setTransform(a,b,c,d,e,f){state.transform=[a,b,c,d,e,f];},
    translate(x,y){const[a,b,c,d,e,f]=state.transform;state.transform=[a,b,c,d,e+a*x+c*y,f+b*x+d*y];},
    scale(x,y){const[a,b,c,d,e,f]=state.transform;state.transform=[a*x,b*x,c*y,d*y,e,f];},
    beginPath(){path=[];},moveTo(x,y){path.push(['moveTo',...point(x,y)]);},lineTo(x,y){path.push(['lineTo',...point(x,y)]);},
    closePath(){path.push(['closePath']);},
    roundRect(x,y,w,h,r){path=[['roundRect',...point(x,y),w*state.transform[0],h*state.transform[3],r]];},
    fillRect(x,y,w,h){record('fillRect',[...point(x,y),w*state.transform[0],h*state.transform[3]]);},
    fillText(text,x,y){record('fillText',[text,...point(x,y)]);},
    measureText(text){const size=Number(/([\d.]+)px/.exec(state.font)?.[1]||11);return{width:String(text).length*size*.55};},
    createLinearGradient(...args){return{args,stops:[],addColorStop(...value){this.stops.push(value);}};},
  };
  const ctx=new Proxy(state,{get(target,key){if(key in methods)return methods[key];if(key in target)return target[key];return(...args)=>record(key,args);},set(target,key,value){target[key]=value;return true;}});
  const bindings={
    uiDraw:draw=>{ctx.save();try{const{cellW,cellH}=uiCellMetrics();draw({ctx,dpr,cellW,cellH});}finally{ctx.restore();}},
    uiCellMetrics,uiCurrentScale,uiWithClip:(_,draw)=>draw(),uiWithHardwareLayer:(draw,cover)=>{try{return draw();}finally{cover();}},
    drawInstrumentPlate:(_,options)=>record('plate',[options]),drawInstrumentWell:(_,options)=>record('well',[options]),
    drawInstrumentGlass:(_,options)=>record('glass',[options]),drawVfdGrid:(_,options)=>record('grid',[options]),
    drawWitnessChassis:(_,options)=>record('witness',[options]),witnessEndingIds,
    drawHardwareCap:(target,x,y,w,h,options)=>{const geometry=renderHardwareCap(target,x,y,w,h,options);record('cap',[x,y,w,h,options,geometry]);return geometry;},
    drawHardwarePrint:(target,label,x,y,options)=>{record('capPrint',[label,x,y,options]);return renderHardwarePrint(target,label,x,y,options);},
    drawElectronicText:(target,text,x,y,options)=>{
      record('electronicText',[String(text),...point(x,y),options]);
      return renderElectronicText(target,text,x,y,options);
    },
    sampleControl:(id,options)=>{record('sampleControl',[id,options]);return{travel,lampHeat:options.lit?1:0};},hardwareMotionReduced:()=>false,
    dbToUnit,dbForLinear,locationMarks,meterMarks,normalizeFieldKit,withSourceRestInstrumentDecay,dualTraceSnapshot,
    paintDualTraceVfd:(target,rect,model,options)=>{const start=commands.length,geometry=paintDualTraceVfd(target,rect,model,options);record('traceMeter',[rect,model,options,geometry,start,commands.length]);return geometry;},
    dualTraceVfdLayout,dualTraceUnit,drawSevenSegmentNumber,
    uiBrightness:()=>1,vfdSettings:{phosphor:'faithful'},themeForSurface:()=>({phosphor:'#8fcd87',counter:'#b4f4e6'}),
  };
  let source=readFileSync(new URL('../src/render/recorder-instrument.js',import.meta.url),'utf8');const names=[];
  source=source.replace(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];\s*/g,(_,list)=>{names.push(...list.split(',').map(value=>value.trim()).filter(Boolean));return'';});
  const exports=[...source.matchAll(/export\s+(?:function|const|let)\s+(\w+)/g)].map(match=>match[1]);
  source=source.replace(/\bexport\s+(?=(?:function|const|let)\b)/g,'');
  const module=new Function(...names,`${source}\nreturn{${exports.join(',')}};`)(...names.map(name=>bindings[name]));
  return{...module,commands,state,stack,ctx};
}

const baseView=()=>({rect:rectForPixels(736,405),counter:'02:18',progress:0,buttons:{keys:[{id:'rec',label:'REC'},{id:'stop',label:'STOP'},{id:'takes',label:'TAKES'}]}});
let meterSerial=0;
function settledMeter(db,extra={}){
  const sourceId='recorder-test:'+ ++meterSerial;
  let measurement;
  for(let at=0;at<=800;at+=25){measurement={...extra,db,sourceId,timestampMs:at};dualTraceSnapshot(sourceId,measurement,at);}
  return measurement;
}
const lastTrace=h=>h.commands.findLast(c=>c.kind==='traceMeter');
function traceRail(h,rail,trace=lastTrace(h)){
  assert.ok(trace,'the production recorder paints the actual shared meter');
  const g=trace.args[3],row=g[rail],t=trace.state.transform;
  const physical=(x,y)=>[t[0]*x+t[2]*y+t[4],t[1]*x+t[3]*y+t[5]];
  const bounds=points=>({min:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]});
  const fills=h.commands.slice(trace.args[4],trace.args[5]).filter(c=>c.kind==='fill'&&c.path.some(p=>p[0]==='lineTo'));
  return g.cells.map(cell=>{
    const box=bounds([[cell.x,row.y],[cell.x+cell.w,row.y],[cell.x,row.y+row.h],[cell.x+cell.w,row.y+row.h]].map(p=>physical(...p)));
    const found=fills.filter(c=>{const b=bounds(c.path.filter(p=>p.length===3).map(p=>p.slice(1)));return ['min','max'].every(k=>b[k].every((v,i)=>Math.abs(v-box[k][i])<1e-7));});
    assert.equal(found.length,1,`each real ${rail} cell is painted exactly once`);return found[0];
  });
}
function assertTraceText(h,value,{x,y,fontSize,color,align='left',maxWidth=null},trace=lastTrace(h)){
  const ref=drawingHarness();ref.ctx.setTransform(...trace.state.transform);
  drawTraceVfdText(ref.ctx,value,x,y,{fontSize,color,align,alpha:trace.args[2].brightness,tracking:.2*trace.args[3].u,maxWidth});
  const paths=ref.commands.filter(c=>c.kind==='fill').map(c=>JSON.stringify(c.path));assert.ok(paths.length>0,value+' has real electrode ink');
  const actual=new Set(h.commands.slice(trace.args[4],trace.args[5]).filter(c=>c.kind==='fill'&&c.state.fillStyle===color).map(c=>JSON.stringify(c.path)));
  assert.ok(paths.every(p=>actual.has(p)),value+' is physically painted by the shared VFD text renderer');
}
test('the physical recorder substrate shares the actual readout without mutating UI or appearance',()=>{
  const h=drawingHarness({alpha:.8}),before={...h.state,transform:[...h.state.transform]};
  const appearance=h.recorderAppearance();
  assert.equal(h.drawRecorderReadoutCanvas(h.ctx,{width:1332,height:478,phosphor:'amber',counter:'02:18',meter:{db:-24}}),true);
  assert.deepEqual(h.state,before);assert.equal(h.stack.length,0);assert.deepEqual(h.recorderAppearance(),appearance);
  assert.ok(h.commands.some(command=>command.state.fillStyle==='#ffdba0'),'shared amber counter electrodes');
  assert.ok(h.commands.some(command=>command.kind==='grid'),'grid remains in front of electrodes');
  assert.ok(h.commands.some(command=>command.kind==='electronicText'&&command.args[0]==='TIME COUNTER'));
  assert.ok(!h.commands.some(command=>command.kind==='fillText'),'the 3D substrate has no native typography');
  assert.ok(!h.commands.some(command=>['plate','glass'].includes(command.kind)),'physical model owns its cover and metal');
  assert.equal(h.drawRecorderReadoutCanvas(h.ctx,{width:0}),false);
});
test('saved recorder appearance is validated, isolated, and overridden only within an explicit preview',()=>{
  const h=drawingHarness(),saved={faceplate:'olive',buttons:'sea-glass',vfd:'amber'};
  const result=h.setRecorderAppearance(saved);saved.faceplate='black';result.vfd='ice';
  assert.deepEqual(h.recorderAppearance(),{faceplate:'olive',buttons:'sea-glass',vfd:'amber',flashlightHousing:'graphite'});
  assert.deepEqual(h.recorderAppearance({finish:'black',buttonSet:'signal',phosphor:'ice'}),{faceplate:'black',buttons:'signal',vfd:'ice',flashlightHousing:'graphite'});
  h.drawRecorderInstrument({...baseView(),finish:'black',buttonSet:'signal',phosphor:'ice'});
  assert.equal(h.commands.find(command=>command.kind==='plate').args[0].finish,'black');
  assert.deepEqual(h.recorderAppearance(),{faceplate:'olive',buttons:'sea-glass',vfd:'amber',flashlightHousing:'graphite'});
  assert.deepEqual(h.setRecorderAppearance({faceplate:'unknown',buttons:null,vfd:{}}),normalizeFieldKit().cosmetics);
});

test('WITNESS replaces only the physical chassis and preserves the real VFD aperture and controls',()=>{
  const h=drawingHarness({travel:.7}),view={...baseView(),finish:'witness',witnessEndings:['helped','helped','sacrifice','invented'],
    buttons:{keys:[{id:'rec',label:'REC',lit:true},{id:'stop',label:'STOP'},{id:'takes',label:'TAKES'}]}};
  h.drawRecorderInstrument(view);
  const witness=h.commands.find(command=>command.kind==='witness').args[0];
  assert.equal(h.commands.filter(command=>command.kind==='sampleControl').length,3,'stem and cap share one sampled mechanical instant');
  assert.equal(witness.keys[0].travel,.7);assert.equal(witness.keys[0].lit,true);
  assert.ok(witness.keys.every(key=>key.travel===.7));
  assert.deepEqual(witness.buttonSlots,[0,1,2].map(i=>({x:415+i*99,y:334,w:89,h:33})));
  assert.deepEqual(witness.endings,view.witnessEndings,'material itself filters earned canonical stamps');
  assert.ok(!h.commands.some(command=>command.kind==='plate'),'no opaque old metal faceplate above the internals');
  assert.deepEqual(h.commands.find(command=>command.kind==='well').args[0],{x:35,y:76,w:666,h:239,dpr:1});
  assert.ok(h.commands.some(command=>command.kind==='glass'));
  assert.equal(h.commands.filter(command=>command.kind==='fillText').map(command=>command.args[0]).join(''),'RECSTOPTAKES','only cap printing is above the clear cover');
  const well=h.commands.findIndex(command=>command.kind==='well'),glass=h.commands.findIndex(command=>command.kind==='glass');
  assert.ok(!h.commands.slice(well,glass).some(command=>command.kind==='fillText'));
  const caps=h.commands.filter(command=>command.kind==='cap');
  assert.equal(caps.length,3);
  assert.ok(caps.every(command=>command.args[4].travel===.7),'sampled travel also moves the actual caps');
  const prints=h.commands.filter(command=>command.kind==='capPrint');
  assert.ok(prints.every((command,i)=>Math.abs(command.args[2]-(caps[i].args[1]+caps[i].args[5].content.y))<1e-8),'printed ink moves with the cap face');
});

test('saved WITNESS ending stamps are copied, canonical, and independently overridable for previews',()=>{
  const h=drawingHarness(),endings=['helped','helped','sacrifice','invented'];
  h.setRecorderAppearance({faceplate:'witness'},{endingIds:endings});endings.push('inversion');
  const draw=overrides=>{h.commands.length=0;h.drawRecorderInstrument({...baseView(),...overrides});return h.commands.find(c=>c.kind==='witness').args[0].endings;};
  assert.deepEqual(draw(),['sacrifice','helped']);
  assert.deepEqual(draw({witnessEndings:[]}),[],'empty preview explicitly clears stamps');
  assert.deepEqual(draw(),['sacrifice','helped'],'preview never mutates saved defaults');
  h.setRecorderAppearance({faceplate:'witness'});assert.deepEqual(draw(),[],'a profile change cannot retain another profile’s endings');
});

test('all finish, button and phosphor options change physical paint but never layout or readings',()=>{
  const view={...baseView(),meter:settledMeter(-24,{peakDb:-12}),nowMs:800},baseline=recorderFaceLayout(view.rect),capColors=new Set();
  for(const finish of ['aluminum','black','olive'])for(const buttonSet of ['classic','signal','sea-glass'])for(const phosphor of ['faithful','amber','ice']){
    const h=drawingHarness(),preview={...view,finish,buttonSet,phosphor};h.drawRecorderInstrument(preview);
    assert.deepEqual(h.recorderFaceLayout(view.rect),baseline);assert.equal(h.recorderOutputReading(preview).snapshot,view.meter);
    assert.equal(h.commands.find(command=>command.kind==='plate').args[0].finish,finish);
    const etching=h.commands.filter(command=>command.kind==='fillText'&&command.state.fillStyle===(finish==='aluminum'?'#333830':'#d7d9bd'));
    assert.ok(etching.map(command=>command.args[0]).join('').startsWith('AUDIOCORP'),'ink remains legible on the chosen plate');
    const caps=h.commands.filter(command=>command.kind==='cap').map(command=>command.args[4].color);
    assert.equal(caps.length,3);assert.equal(new Set(caps).size,3,'each physical cap has its own pigment');capColors.add(JSON.stringify(caps));
    const palette=h.recorderDisplayPalette(preview),segments=h.commands.filter(command=>command.kind==='fill'&&command.state.fillStyle===palette.counter);
    assert.ok(segments.length>0,'the actual counter changes phosphor');
    const inactive=h.commands.filter(command=>command.state.fillStyle===palette.passive);
    assert.ok(inactive.length>0);assert.ok(inactive.every(command=>command.state.shadowBlur===0),'unenergized electrodes never acquire a halo');
    assert.ok(traceRail(h,'body').some(command=>command.state.fillStyle===palette.bar));
    assert.equal(traceRail(h,'peak').filter(command=>command.state.fillStyle===palette.peak).length,1);
  }
  assert.equal(capColors.size,3,'three real button-plastic sets, not metadata-only selectors');
});

test('recorder keys use actual shared lens hardware, independent lamp state and device-scaled print',()=>{
  for(const dpr of [1,2]){
    const h=drawingHarness({dpr,travel:.5});
    h.drawRecorderInstrument({...baseView(),buttons:{keys:[
      {id:'rec',label:'REC',lit:true},{id:'stop',label:'STOP',focused:true},
      {id:'takes',label:'TAKES',enabled:false},
    ]}});
    const caps=h.commands.filter(c=>c.kind==='cap'),prints=h.commands.filter(c=>c.kind==='capPrint');
    assert.equal(caps.length,3);assert.equal(prints.length,3);
    assert.deepEqual(caps.map(c=>c.args[4].lampHeat),[1,0,0]);
    assert.deepEqual(caps.map(c=>c.args[4].focused),[false,true,false]);
    assert.equal(caps[2].args[4].enabled,false);
    for(let i=0;i<3;i++){
      const [x,y,w,h,options,geometry]=caps[i].args;
      near(options.dpr,dpr);near(prints[i].args[1],x+geometry.content.x);
      near(prints[i].args[2],y+geometry.content.y);
      near(prints[i].args[3].width,geometry.content.w);near(prints[i].args[3].height,geometry.content.h);
      near(w,89*dpr);near(h,33*dpr);
    }
  }
  const physical=readFileSync(new URL('../src/render/battle-hand-tools.js',import.meta.url),'utf8');
  assert.doesNotMatch(physical,/VACUUM FLUORESCENT/,'the held model does not reintroduce the removed legend');
});

test('special-mode electrode text inherits preview phosphor without leaking through nested or throwing callbacks',()=>{
  const h=drawingHarness();h.setRecorderAppearance({vfd:'amber'});
  const color=()=>h.commands.filter(command=>command.kind==='electronicText').at(-1)?.args[3].color;
  h.drawRecorderInstrument({...baseView(),phosphor:'ice'},{drawContent:()=>{
    h.drawRecorderDisplayText(0,0,'A');assert.equal(color(),'#9ed9e7');
    h.drawRecorderInstrument({...baseView(),phosphor:'faithful'},{drawContent:()=>{
      h.drawRecorderDisplayText(0,0,'B');assert.equal(color(),'#8fcd87');
    }});
    h.drawRecorderDisplayText(0,0,'C',{color:'#b4f4e6'});assert.equal(color(),'#d0f4fc');
  }});
  h.drawRecorderDisplayText(0,0,'D');assert.equal(color(),'#e9b765');
  assert.throws(()=>h.drawRecorderInstrument({...baseView(),phosphor:'ice'},{drawContent:()=>{throw new Error('interrupted preview');}}),/interrupted preview/);
  h.drawRecorderDisplayText(0,0,'E');assert.equal(color(),'#e9b765');assert.equal(h.stack.length,0);
});

test('the setup microphone check shares the selected phosphor and still reads only its actual snapshot',()=>{
  const h=drawingHarness({alpha:.6});h.setRecorderAppearance({vfd:'amber'});
  h.drawRecorderInstrument({...baseView(),phosphor:'ice'},{drawContent:()=>{
    h.drawRecorderCheckMeter(1,2,30,settledMeter(-24,{peakDb:-12}),{nowMs:800});
    assert.ok(traceRail(h,'body').some(command=>command.state.fillStyle==='#9ddce8'));
    assert.equal(traceRail(h,'peak').filter(command=>command.state.fillStyle==='#e2f8ff').length,1);
  }});
  h.commands.length=0;h.drawRecorderCheckMeter(1,2,30,null);
  assert.equal(lastTrace(h).args[1].available,false);
  for(const rail of['body','peak'])assert.ok(traceRail(h,rail).every(command=>command.state.fillStyle==='#423523'&&command.state.shadowBlur===0&&command.state.globalAlpha<=.6),'missing input never energizes a signal electrode');
  const viewSource=readFileSync(new URL('../src/render/recorder-view.js',import.meta.url),'utf8');
  assert.match(viewSource,/drawRecorderCheckMeter\(layout\.meter\.x,\s*layout\.meter\.y,\s*layout\.meter\.w,\s*view\.roomMeter/);
  assert.doesNotMatch(viewSource,/drawVfdMeter|theme: 'green'/);
});

test('native printing stays on metal and plastic while every under-glass label uses VFD electrodes',()=>{
  const h=drawingHarness();h.drawRecorderInstrument(baseView());
  const printed=h.commands.filter(command=>command.kind==='fillText');assert.ok(printed.length>0);
  const labels=h.commands.filter(command=>command.kind==='capPrint');
  assert.deepEqual(labels.map(command=>command.args[0]),['REC','STOP','TAKES']);
  assert.ok(labels.every(command=>command.args[2]>315),'all controls print below the display, not beside the counter');
  assert.ok(labels.every(command=>command.args[3].finish==='screenprint'));
  assert.ok(!printed.map(command=>command.args[0]).join('').includes('VACUUM FLUORESCENT'));
  assert.ok(h.commands.filter(command=>command.kind==='cap').every(command=>command.args[4].finish==='lens'),'the map and sheet cap material is used');
  const well=h.commands.findIndex(command=>command.kind==='well'),glass=h.commands.findIndex(command=>command.kind==='glass');
  assert.ok(well>=0&&glass>well);
  assert.ok(!h.commands.slice(well,glass).some(command=>command.kind==='fillText'),'native fonts never land under the display cover');
  assert.ok(h.commands.every((command,index)=>command.kind!=='fillText'||index>glass),'physical printing is painted after the glass');
  const electronic=h.commands.filter(command=>command.kind==='electronicText');
  assert.ok(electronic.length>0&&electronic.every(command=>command.args[3].mode==='vfd'));
  for(const label of ['TIME COUNTER','LOCATION INDICATOR','MIN','SEC','START','END'])
    assert.ok(electronic.some(command=>command.args[0]===label),`${label} is an electronic readout label`);
  const trace=lastTrace(h),g=trace.args[3],colors=h.recorderDisplayPalette();assert.equal(trace.args[2].label,'OUTPUT LEVEL');
  assertTraceText(h,'OUTPUT LEVEL',{x:g.x,y:g.headerY,fontSize:g.fontSize,color:colors.label,maxWidth:g.labelW},trace);
  for(const db of[-48,-12,0])assertTraceText(h,String(db),{x:g.body.x+dualTraceUnit(db)*g.body.w,y:g.scaleY,fontSize:g.fontSize,color:colors.label,align:db===-48?'left':db===0?'right':'center'},trace);
  const source=readFileSync(new URL('../src/render/recorder-instrument.js',import.meta.url),'utf8');
  assert.match(source,/import \{ drawElectronicText \} from '\.\/electronic-text\.js'/);
});

test('display prose preserves transcript cell advance, short-row fit, clipping and inherited opacity',()=>{
  for(const scale of [1,1.5])for(const dpr of [1,2])for(const lineHeight of [.65,1]){
    uiSetScale(scale);const h=drawingHarness({alpha:.4,dpr}),before={...h.state,transform:[...h.state.transform]};
    const {cellW,cellH}=uiCellMetrics();
    h.drawRecorderDisplayText(2,3,'MASKED ▏ CHECK',{width:7,size:12,lineHeight,alpha:.5});
    const text=h.commands.find(command=>command.kind==='electronicText'),options=text.args[3];
    near(text.args[1],2*cellW*dpr);near(text.args[2],(3+lineHeight/2)*cellH*dpr);
    near(options.cellWidth,cellW*dpr);near(options.maxWidth,7*cellW*dpr);
    near(options.alpha,.5);assert.equal(options.mode,'vfd');assert.equal(options.baseline,'middle');
    assert.ok(options.fontSize<=cellH*dpr*lineHeight*.86+1e-8,'electrodes fit inside short transcript rows');
    assert.ok(h.commands.some(command=>command.kind==='clip'));
    assert.ok(!h.commands.some(command=>command.kind==='fillText'));
    assert.ok(h.commands.every(command=>command.state.globalAlpha<=.4+1e-9),'a translucent panel never becomes fully opaque');
    assert.deepEqual(h.state,before);assert.equal(h.stack.length,0);
  }
});

test('scaled readout labels bake at final device resolution in UI and nonuniform 3D substrates',()=>{
  for(const scale of [1,1.5])for(const dpr of [1,2]){
    uiSetScale(scale);const h=drawingHarness({dpr}),view={...baseView(),rect:rectForPixels(736*scale,405*scale)};
    h.drawRecorderInstrument(view);const factor=dpr*h.recorderFaceLayout(view.rect).unit;
    const label=h.commands.find(command=>command.kind==='electronicText'&&command.args[0]==='TIME COUNTER');
    near(label.args[3].fontSize,11*factor);near(label.args[3].cellWidth,11*.72*factor);
    near(label.args[3].tracking,.7*factor);near(label.state.transform[0],1);near(label.state.transform[3],1);
    near(label.args[1],55*factor);near(label.args[2],(76+29-11*.42)*factor);
  }
  const h=drawingHarness();h.ctx.translate(17,23);h.ctx.scale(1.5,.75);
  const before={...h.state,transform:[...h.state.transform]};
  h.drawRecorderReadoutCanvas(h.ctx,{width:1332,height:717,counter:'00:18'});
  const label=h.commands.find(command=>command.kind==='electronicText'&&command.args[0]==='TIME COUNTER');
  near(label.args[3].fontSize,11*2.25);near(label.args[3].cellWidth,11*.72*3);
  near(label.args[1],17+20*3);near(label.args[2],23+(29-11*.42)*2.25);
  near(label.state.transform[0],1);near(label.state.transform[3],1);
  assert.deepEqual(h.state,before);assert.equal(h.stack.length,0);
});

test('silence energizes neither rail, while actual integrated dB controls the complete RMS bar',()=>{
  const h=drawingHarness(),view=baseView(),colors=h.recorderDisplayPalette();
  h.drawRecorderInstrument(view);
  for(const rail of['body','peak']){const silent=traceRail(h,rail);assert.equal(silent.length,48);assert.ok(silent.every(command=>command.state.fillStyle===colors.dormant&&command.state.shadowBlur===0));}
  assert.equal(lastTrace(h).args[1].available,false,'idle is unavailable, not a fabricated demonstration signal');
  for(const db of[-96,-36,-12,0]){
    h.commands.length=0;h.drawRecorderInstrument({...view,meter:settledMeter(db),nowMs:800});
    const model=lastTrace(h).args[1],actual=traceRail(h,'body');near(model.db,db);
    assert.equal(actual.filter(command=>command.state.fillStyle!==colors.dormant).length,Math.ceil(dualTraceUnit(db)*48));
  }
});

test('the independent peak rail converts real amplitude and gives explicit peakDb precedence',()=>{
  const h=drawingHarness(),view=baseView(),colors=h.recorderDisplayPalette();
  for(const[db,fields,expected]of[[-24,{peak:.9},20*Math.log10(.9)],[-24,{peakDb:-6,peak:.01},-6],[-12,{peakDb:-24,peak:1},-24]]){
    h.commands.length=0;h.drawRecorderInstrument({...view,meter:settledMeter(db,fields),nowMs:800});
    const model=lastTrace(h).args[1];near(model.peakDb,expected,'only the supplied peak evidence sets the independent rail');
    const rail=traceRail(h,'peak'),lit=rail.flatMap((command,i)=>command.state.fillStyle===colors.peak?[i]:[]);
    assert.deepEqual(lit,[dualTracePeakIndex(expected,48)],'the actual filled electrode follows peak dB, never a raw amplitude mistaken for dB');
    assert.ok(rail[lit[0]].state.shadowBlur>0);
  }
  h.commands.length=0;h.drawRecorderInstrument(view);
  assert.equal(lastTrace(h).args[1].available,false);assert.ok(traceRail(h,'peak').every(command=>command.state.fillStyle===colors.dormant),'unavailable input clears the held rail');
});

test('the suspended grid spans every actual counter character at either scale and DPR',()=>{
  for(const scale of [1,1.5])for(const dpr of [1,2]){
    uiSetScale(scale);
    for(const counter of ['1:23','12:34','123:45','1234:56','-01.8','-00.1']){
      const h=drawingHarness({dpr}),view={...baseView(),rect:rectForPixels(736*scale,405*scale),counter};
      h.drawRecorderInstrument(view);
      const grid=h.commands.find(command=>command.kind==='grid').args[0];
      const electrodes=h.commands.filter(command=>command.kind==='fill'&&['#4a5a46','#b4f4e6'].includes(command.state.fillStyle));
      assert.ok(electrodes.length>20,'all authored digits were drawn');
      for(const command of electrodes)for(const part of command.path)if(['moveTo','lineTo'].includes(part[0])){
        assert.ok(part[1]>=grid.x-1e-7&&part[1]<=grid.x+grid.w+1e-7,`${counter}: mesh covers electrode x`);
        assert.ok(part[2]>=grid.y-1e-7&&part[2]<=grid.y+grid.h+1e-7,`${counter}: mesh covers electrode y`);
      }
    }
  }
});

test('pre-roll renders a real minus electrode and decimal point, and labels seconds without invented minutes',()=>{
  for(const scale of [1,1.5])for(const dpr of [1,2])for(const width of [360,736]){
    uiSetScale(scale);
    const h=drawingHarness({dpr}),view={...baseView(),rect:rectForPixels(width*scale,405*scale),counter:'-01.8'};
    h.drawRecorderInstrument(view);
    const g=h.recorderFaceLayout(view.rect),factor=dpr*g.unit;
    const digitScale=Math.min(g.compact?.79:1.08,(g.compact?g.W-110:(g.W-70)*.43)/216);
    const electrodes=h.commands.filter(command=>command.kind==='fill'&&['#4a5a46','#b4f4e6'].includes(command.state.fillStyle));
    assert.equal(electrodes.length,28,'four seven-segment forms: minus, zero, one, eight');
    assert.deepEqual(electrodes.slice(0,7).map(command=>command.state.fillStyle==='#b4f4e6'),[false,false,false,false,false,false,true],
      'minus powers only the middle electrode');
    assert.equal(electrodes.filter(command=>command.state.fillStyle==='#b4f4e6').length,16);
    const points=h.commands.filter(command=>command.kind==='fillRect'&&command.state.fillStyle==='#b4f4e6');
    assert.equal(points.length,1,'decimal is one illuminated point, never an empty seven-segment digit');
    const [x,y,w,height]=points[0].args;
    near(x,(35+21+156*digitScale)*factor,'decimal after the -01 forms');
    near(y,(76+48+72*digitScale)*factor,'decimal aligned to electrode baseline');
    near(w,3*digitScale*factor);near(height,w);
    const grid=h.commands.find(command=>command.kind==='grid').args[0];
    inside({x,y,w,h:height},grid,'decimal remains beneath the same suspended mesh');
    const labelY=(76+48+92*digitScale)*factor;
    const units=h.commands.filter(command=>command.kind==='electronicText'&&Math.abs(command.args[2]+command.args[3].fontSize*.42-labelY)<1e-7)
      .map(command=>command.args[0]).join('');
    assert.equal(units,'SEC','fractional pre-roll is seconds, not a minutes/seconds clock');
  }
});

test('passive phosphor and material alpha remain composed through the exact recorder draw',()=>{
  const h=drawingHarness({alpha:.4}),view=baseView();h.drawRecorderInstrument(view);
  const passive=h.commands.filter(command=>command.kind==='fill'&&command.state.fillStyle==='#4a5a46');
  assert.ok(passive.length);assert.ok(passive.every(command=>Math.abs(command.state.globalAlpha-.4*.19)<1e-9&&command.state.shadowBlur===0));
  assert.ok(h.commands.every(command=>command.state.globalAlpha<=.4+1e-9),'drawing never turns a faded instrument fully opaque');
  assert.equal(h.state.globalAlpha,.4);assert.equal(h.stack.length,0);
});

test('special-mode content replaces the readout but keeps its complete glass and three controls',()=>{
  const h=drawingHarness(),view=baseView();let calls=0;
  h.drawRecorderInstrument(view,{drawContent:g=>{calls++;assert.deepEqual(g.body,g.transcriptRect);return'finished';}});
  assert.equal(calls,1);assert.equal(h.commands.filter(command=>command.kind==='grid').length,0);
  assert.ok(h.commands.some(command=>command.kind==='glass'));
  assert.deepEqual(h.commands.filter(command=>command.kind==='capPrint').map(command=>command.args[0]),['REC','STOP','TAKES']);
});

test('layout and renderer stay callable in Node without a Canvas',()=>{
  assert.equal(recorderFaceLayout(null),null);assert.equal(drawRecorderInstrument(),null);
  const view=baseView(),expected=recorderFaceLayout(view.rect).body;
  assert.deepEqual(drawRecorderInstrument(view),expected);
});

test('Source rest scan failure reaches the complete production VFD while leaving printed controls and glass intact',()=>{
  const normal=drawingHarness(),broken=drawingHarness(),view=baseView(),original=structuredClone(view);
  normal.drawRecorderInstrument(view);broken.drawRecorderInstrument({...view,sourceRestPresentation:{stage:3,progress:.36}});
  assert.equal(broken.commands.filter(c=>c.kind==='clip').length-normal.commands.filter(c=>c.kind==='clip').length,2);
  assert.ok(broken.commands.findIndex(c=>c.kind==='clip')<broken.commands.findIndex(c=>c.kind==='electronicText'));
  assert.ok(broken.commands.findIndex(c=>c.kind==='glass')>broken.commands.findIndex(c=>c.kind==='clip'));
  assert.deepEqual(broken.commands.filter(c=>c.kind==='capPrint').map(c=>c.args[0]),['REC','STOP','TAKES']);
  assert.deepEqual(broken.commands.filter(c=>c.kind==='fillText').map(c=>c.args[0]),normal.commands.filter(c=>c.kind==='fillText').map(c=>c.args[0]));
  assert.deepEqual(view,original);assert.equal(broken.stack.length,0);
});

test('authored Source rest intrusions occupy real unit, scale and meter slots while actual measurements stay untouched',()=>{
  const h=drawingHarness(),presentation={stage:3,progress:.36},story=sourceRestInstrumentStory(presentation),meter={db:-96,sourceId:'story-readout-test'},
    view={...baseView(),meter,counter:story.counter,counterLabel:story.counterLabel,sourceRestFieldStory:story,sourceRestPresentation:{...presentation,voiceBanks:story.voiceBanks}};
  h.drawRecorderInstrument(view);
  const words=h.commands.filter(c=>c.kind==='electronicText').map(c=>c.args[0]);
  for(const text of ['I CAN HEAR YOU',"DON'T YOU HEAR IT",'YOU','SING','LISTEN','AM','HERE','JUST'])assert.ok(words.includes(text),`${text} reaches its existing recorder field`);
  assert.equal(view.counter,'88:88');assert.deepEqual(meter,{db:-96,sourceId:'story-readout-test'});
  assert.deepEqual(h.commands.filter(c=>c.kind==='capPrint').map(c=>c.args[0]),['REC','STOP','TAKES']);assert.equal(h.stack.length,0);
});
