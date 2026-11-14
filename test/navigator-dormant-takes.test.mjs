// node --experimental-vm-modules test/navigator-dormant-takes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {lcdGeometry,deviceBox,paintedWord,matrixInk,within} from './helpers/lcd-geometry.mjs';

const root=fileURLToPath(new URL('../src/',import.meta.url));
const noop=()=>{};
async function fixture(){
  const context=vm.createContext({performance:{now:()=>1000}}),cache=new Map();
  const mocks=new Map(Object.entries({
    'render/ui.js':{uiDrawHardware:noop,uiGlyph:noop,uiText:noop},
    'render/hardware-material.js':{hardwareMotionReduced:()=>false,hardwareEffectsReduced:()=>false},
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
    const bounds={x:1,y:1,w,h},metrics={cellW:8.45*scale,cellH:20*scale,dpr:2,view:{x:0,y:0}};
    const input={takes:2,total:5,injuries:1,monitor:monitor()};
    const off=lcdGeometry({alpha:.8}),on=lcdGeometry({alpha:.8});
    const layout=lcd.paintNavigatorTelemetry(off.ctx,bounds,nav.navigatorTelemetryState({...input,takesEnabled:false}),metrics);
    assert.deepEqual(layout,lcd.paintNavigatorTelemetry(on.ctx,bounds,nav.navigatorTelemetryState({...input,takesEnabled:true}),metrics));
    for(const [key,dormant,live]of[['takeLabel','TAKES','TAKES'],['takeCount','88','02'],['capacity','/ 88','/ 05']]){
      const box=deviceBox(layout[key],metrics),options={padding:2*metrics.dpr};
      const offGlyphs=paintedWord(off.fills,dormant,box,options),onGlyphs=paintedWord(on.fills,live,box,options);
      assert.equal(offGlyphs.length,dormant.replaceAll(' ','').length,dormant);
      assert.equal(onGlyphs.length,live.replaceAll(' ','').length,live);
      const offInk=matrixInk(off.fills,box,options);
      assert.ok(offInk.every(draw=>draw.alpha<=.8*.13+1e-10),'all dormant electrodes are faint');
      assert.ok(offGlyphs.every(draw=>Math.abs(draw.alpha-.8*.13)<1e-10),'dormant opacity applies exactly once');
      assert.ok(onGlyphs.some(draw=>draw.alpha===.8),'the active bank drives visible electrodes');
      assert.ok(!off.fills.some(draw=>draw.blur>0&&within(draw.ink,box,2*metrics.dpr)),'the dormant bank emits no halo');
    }
    const right=deviceBox(layout.monitorLabel,metrics).x-2*metrics.dpr;
    assert.deepEqual(off.fills.filter(draw=>draw.ink.x>=right),on.fills.filter(draw=>draw.ink.x>=right),
      'monitor hardware and live lettering remain unchanged');
    assert.deepEqual(off.nativeText,[]);
    assert.equal(off.ctx.globalAlpha,.8);
  }
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
