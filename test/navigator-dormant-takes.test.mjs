// node --experimental-vm-modules test/navigator-dormant-takes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root=fileURLToPath(new URL('../src/',import.meta.url));
const noop=()=>{};
async function fixture(){
  const context=vm.createContext({performance:{now:()=>1000}}),cache=new Map();
  const mocks=new Map(Object.entries({
    'render/ui.js':{uiDrawHardware:noop,uiGlyph:noop,uiText:noop},
    'render/hardware-material.js':{hardwareMotionReduced:()=>false},
  }).map(([name,value])=>[path.join(root,name),value]));
  async function load(filename){
    if(cache.has(filename))return cache.get(filename);
    const pending=(async()=>{
      if(mocks.has(filename)){
        const exports=mocks.get(filename);
        return new vm.SyntheticModule(Object.keys(exports),function(){
          for(const[name,value]of Object.entries(exports))this.setExport(name,value);
        },{context});
      }
      const module=new vm.SourceTextModule(await readFile(filename,'utf8'),{context,identifier:filename});
      await module.link((specifier,owner)=>load(path.resolve(path.dirname(owner.identifier),specifier)));
      return module;
    })();cache.set(filename,pending);return pending;
  }
  return async name=>{const module=await load(path.join(root,name));if(module.status!=='evaluated')await module.evaluate();return module.namespace;};
}

function monitor(){
  return {sourceId:'dormant-takes-test',unit:'dB',db:-32,peakDb:-8,dualTrace:{
    type:'dual-trace',available:true,db:-32,peakDb:-8,numericDb:-32,numericPeakDb:-8,
    clipped:false,segments48:16,segments24:8,peakKind:'level',
  }};
}
function recordingContext({native=true,alpha=1}={}){
  const texts=[],rects=[],stack=[];
  const keys=['globalAlpha','font','fillStyle','textAlign','textBaseline','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY'];
  const ctx={globalAlpha:alpha,canvas:{ownerDocument:{fonts:{check:()=>native,load:()=>Promise.resolve([])}}},
    save(){stack.push(Object.fromEntries(keys.map(key=>[key,this[key]])));},
    restore(){Object.assign(this,stack.pop());},
    beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,fill:noop,rect:noop,clip:noop,
    createLinearGradient:()=>({addColorStop:noop}),
    fillRect(x,y,w,h){rects.push({x,y,w,h,alpha:this.globalAlpha,color:this.fillStyle});},
    measureText(){const size=Number(this.font?.match(/([\d.]+)px/)?.[1]||12);return {actualBoundingBoxAscent:size*.74,actualBoundingBoxDescent:size*.025};},
    fillText(value,x,y,width){texts.push({value,x,y,width,font:this.font,alpha:this.globalAlpha,color:this.fillStyle});},
  };
  return {ctx,texts,rects};
}

test('assignment acceptance powers the tally without moving the progression gate',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js');
  const order=await load('game/work-order-state.js');
  for(const flags of[{}, {'has.interface':true}, {'has.case':true}]){
    const state=nav.navigatorTelemetryState({takesEnabled:order.workOrderAccepted(flags),takes:3,total:5,monitor:monitor()});
    assert.equal(state.takesEnabled,false);assert.equal(state.takes,0);assert.equal(state.total,0);
    assert.equal(state.slots.length,0);
  }
  for(const flags of[{'work-order.accepted':true},{prologueDone:true}]){
    const state=nav.navigatorTelemetryState({takesEnabled:order.workOrderAccepted(flags),takes:3,total:5,monitor:monitor()});
    assert.equal(state.takesEnabled,true);assert.equal(state.takes,3);assert.equal(state.total,5);
    assert.deepEqual([...state.slots],[true,true,true,false,false]);
  }
});

test('legacy visibility input remains compatible and explicit power state takes precedence',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js');
  const state=options=>nav.navigatorTelemetryState({takes:2,total:5,monitor:monitor(),...options});
  assert.equal(state({takesVisible:false}).takesEnabled,false);
  assert.equal(state({takesVisible:true}).takesEnabled,true);
  assert.equal(state({}).takes,2);
  assert.equal(state({takesEnabled:true,takesVisible:false}).takes,2);
  assert.equal(state({takesEnabled:false,takesVisible:true}).takesEnabled,false);
});

test('normal and compact LCD retain the entire dormant bank and unchanged live neighbours',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js'),lcd=await load('render/navigator-lcd.js');
  for(const [w,h]of[[30.9,4.15],[26.9,3.15]])for(const scale of[1,1.5]){
    const bounds={x:1,y:1,w,h},metrics={cellW:8.45*scale,cellH:20*scale,dpr:2};
    const input={takes:2,total:5,injuries:1,monitor:monitor()};
    const off=recordingContext(),on=recordingContext();
    const offLayout=lcd.paintNavigatorTelemetry(off.ctx,bounds,nav.navigatorTelemetryState({...input,takesEnabled:false}),metrics);
    const onLayout=lcd.paintNavigatorTelemetry(on.ctx,bounds,nav.navigatorTelemetryState({...input,takesEnabled:true}),metrics);
    assert.deepEqual(offLayout,onLayout);
    assert.deepEqual(off.texts.slice(0,3).map(item=>item.value),['TAKES','88','/ 88']);
    assert.ok(off.texts.slice(0,3).every(item=>item.alpha===.13));
    assert.deepEqual(on.texts.slice(0,3).map(item=>item.value),['TAKES','02','/ 05']);
    assert.ok(on.texts.slice(0,3).every(item=>item.alpha===1));
    for(let i=0;i<3;i++)for(const field of['x','y','width','font'])assert.equal(off.texts[i][field],on.texts[i][field]);
    assert.deepEqual(off.texts.slice(3),on.texts.slice(3),'injuries and monitor lettering must be unchanged');
    assert.deepEqual(off.rects,on.rects,'hardware, scale and injuries geometry must be unchanged');
    assert.equal(off.ctx.globalAlpha,1);
  }
});

test('dormant ROM lettering remains visible while the native LCD font loads',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js'),lcd=await load('render/navigator-lcd.js');
  const bounds={x:1,y:1,w:26.9,h:3.15},metrics={cellW:8.45,cellH:20,dpr:2};
  const state=nav.navigatorTelemetryState({takesEnabled:false,takes:2,total:5,monitor:monitor()});
  const {ctx,texts,rects}=recordingContext({native:false,alpha:.8});
  const layout=lcd.paintNavigatorTelemetry(ctx,bounds,state,metrics);
  assert.equal(texts.length,0);
  const bank=rects.filter(r=>r.color==='#1c3424'&&r.x>=layout.takeLabel.x*16.9&&r.x<(layout.divider.x)*16.9);
  assert.ok(bank.length>100,'the dormant label and digit ROMs must actually paint');
  assert.ok(bank.some(r=>Math.abs(r.alpha-.8*.13)<1e-10),'apply dormant opacity exactly once');
  assert.ok(bank.every(r=>r.alpha<=.8*.13+1e-10),'no active reading before acceptance');
  assert.equal(ctx.globalAlpha,.8);
});

test('activation and reactivation never impersonate a completed take',async()=>{
  const load=await fixture(),nav=await load('render/navigator-telemetry.js'),motion=await load('render/navigator-lcd-motion.js');
  let previous=null,nowMs=1000;
  const sample=(takesEnabled,takes,extra={})=>{
    const state=nav.navigatorTelemetryState({takesEnabled,takes,total:5,monitor:monitor(),...extra});
    previous=motion.sampleNavigatorLcdMotion(previous,state,{nowMs:nowMs+=16});return previous;
  };
  for(const result of[sample(false,0),sample(false,3),sample(true,3)]){
    assert.equal(result.takeResponse,0);assert.equal(result.changedSlot,-1);
  }
  const completed=sample(true,4);assert.equal(completed.takeResponse,1);assert.equal(completed.changedSlot,3);
  const disabled=sample(false,4);assert.equal(disabled.takeResponse,0);assert.equal(disabled.changedSlot,-1);
  const enabled=sample(true,4);assert.equal(enabled.takeResponse,0);assert.equal(enabled.changedSlot,-1);
  const hurt=sample(false,4,{injuries:1});assert.equal(hurt.alertKind,'injury');assert.equal(hurt.alertResponse,1);
  assert.equal(hurt.afterimage.length,24);assert.ok(hurt.afterimage.slice(0,8).every(value=>value===1));
});
