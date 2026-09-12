import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWitnessChassis, witnessEndingIds, witnessServiceLayout, clearWitnessMaterialCache, witnessMaterialCacheStats } from '../src/render/witness-material.js';
import { WITNESS_COMPONENTS, WITNESS_CONNECTORS, WITNESS_WIRES, witnessAssemblyLayout } from '../src/data/witness-assembly.js';
import { ENDING_IDS } from '../src/progression/schema.js';

function probe({cache=true}={}){
  const surfaces=[];
  const make=()=>{
    const commands=[],stack=[],state={globalAlpha:1,shadowColor:'transparent',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0};
    const canvas={width:0,height:0,ownerDocument:cache?owner:null};
    const gradient=(...args)=>({args,stops:[],addColorStop(...value){this.stops.push(value);}});
    const methods={save(){stack.push({...state});},restore(){for(const key of Object.keys(state))delete state[key];Object.assign(state,stack.pop());},
      createLinearGradient:gradient,createRadialGradient:gradient,getImageData(){throw new Error('no canvas readback');}};
    const ctx=new Proxy(state,{get(target,key){if(key==='canvas')return canvas;if(key in methods)return methods[key];if(key in target)return target[key];return(...args)=>commands.push({method:key,args,state:{...state}});},set(target,key,value){target[key]=value;return true;}});
    canvas.getContext=()=>ctx;const surface={ctx,canvas,commands,stack,state};surfaces.push(surface);return surface;
  };
  const owner={createElement(kind){assert.equal(kind,'canvas');return make().canvas;}};
  return {...make(),surfaces};
}
const slots=[0,1,2].map(i=>({x:415+i*99,y:334,w:89,h:33}));
test.beforeEach(clearWitnessMaterialCache);

test('one explicit assembly routes each visible harness between actual connectors',()=>{
  const assembly=witnessAssemblyLayout(),connectors=new Map(assembly.connectors.map(part=>[part.id,part]));
  assert.deepEqual(assembly.components.map(part=>part.id),WITNESS_COMPONENTS.map(part=>part.id));
  assert.equal(connectors.size,WITNESS_CONNECTORS.length);assert.equal(assembly.wires.length,WITNESS_WIRES.length);
  for(const wire of assembly.wires){for(const[id,point]of [[wire.from,wire.points[0]],[wire.to,wire.points.at(-1)]]){
    const endpoint=connectors.get(id);assert.ok(endpoint);assert.deepEqual(point,{x:endpoint.x,y:endpoint.y});
  }}
});

test('champagne shell contains an opaque tray, PCB components, printed underside legends and four real brass-seated screws',()=>{
  const p=probe();assert.equal(drawWitnessChassis(p.ctx,{buttonSlots:slots,endings:['helped','sacrifice']}),true);
  const commands=p.surfaces.flatMap(surface=>surface.commands);
  assert.ok(commands.some(command=>command.method==='fill'&&command.state.fillStyle==='#111c17'&&command.state.globalAlpha===1),'clear plastic reveals an opaque internal tray, never the world');
  const prints=commands.filter(command=>command.method==='fillText');
  assert.ok(prints.some(command=>command.args[0]==='WITNESS EDITION'));
  for(const part of WITNESS_COMPONENTS)assert.ok(prints.some(command=>command.args[0]===part.id),`${part.id} identifies a modeled component`);
  assert.ok(prints.every(command=>command.args[2]<76||command.args[2]>315),'physical print stays outside the electronic display aperture');
  assert.equal(commands.filter(command=>command.method==='rotate').length,4,'steel screw slots have four deterministic rotations');
  assert.ok(commands.some(command=>command.state.strokeStyle==='#fffbe0b0'),'a narrow polished edge, not global milky opacity');
  assert.ok(commands.some(command=>command.method==='fillText'&&command.args[0]==='WITNESSED 02 / 09'));
});

test('earned stamps accept only distinct canonical endings and never infer an achievement from a total',()=>{
  assert.deepEqual(witnessEndingIds(['helped','helped','invented','sacrifice']),['sacrifice','helped']);
  for(const input of [null,undefined,{},9,'sacrifice'])assert.deepEqual(witnessEndingIds(input),[]);
  assert.deepEqual(witnessEndingIds([...ENDING_IDS].reverse()),ENDING_IDS);
});

test('service strip never paints across the unchanged transport slots at narrow supported sizes',()=>{
  for(const w of [360,440,579,580,600,736,1000]){
    const assembly=witnessAssemblyLayout(w,405),keyW=Math.min(89,(w-88)/3);
    const buttons=[0,1,2].map(i=>({x:w-34-3*keyW-20+i*(keyW+10),y:334,w:keyW,h:33}));
    const strip=witnessServiceLayout(assembly,buttons);
    assert.ok(strip.x>=12&&strip.x+strip.w<=w-12);
    assert.ok(strip.y>=315&&strip.y+strip.h<=385);
    for(const key of buttons)assert.ok(strip.x+strip.w<=key.x||strip.x>=key.x+key.w||strip.y+strip.h<=key.y||strip.y>=key.y+key.h,`no service stamp on a key at ${w}`);
  }
});

test('live switch travel and earned stamps do not rebuild the static shell or circuitry',()=>{
  const p=probe();drawWitnessChassis(p.ctx,{buttonSlots:slots});const count=p.surfaces.length,stats=witnessMaterialCacheStats();
  assert.equal(stats.entries,2);
  for(let frame=0;frame<60;frame++)drawWitnessChassis(p.ctx,{buttonSlots:slots,keys:[{travel:frame/59,lit:frame>30}],endings:ENDING_IDS.slice(0,frame%10)});
  assert.equal(p.surfaces.length,count);assert.deepEqual(witnessMaterialCacheStats(),stats);
  const yPositions=new Set(p.commands.filter(command=>command.method==='roundRect'&&command.args[2]===8).map(command=>command.args[1]));
  assert.ok(yPositions.size>1,'actual stem displacement follows the sampled key travel');
});

test('subtle clear-rim illumination follows only the supplied live phosphor and brightness',()=>{
  const p=probe();drawWitnessChassis(p.ctx,{buttonSlots:slots,phosphor:'#9ed9e7',illumination:.5});
  const spill=p.commands.filter(command=>command.method==='stroke'&&command.state.shadowColor==='#9ed9e7');
  assert.equal(spill.length,1);assert.equal(spill[0].state.globalAlpha,.045);
  const cached=witnessMaterialCacheStats();p.commands.length=0;
  drawWitnessChassis(p.ctx,{buttonSlots:slots,phosphor:'#e9b765',illumination:0});
  assert.ok(!p.commands.some(command=>command.state.shadowColor==='#e9b765'));assert.deepEqual(witnessMaterialCacheStats(),cached);
});

test('retina raster caches are bounded and preserve caller opacity, shadows and drawing state',()=>{
  const p=probe();Object.assign(p.state,{globalAlpha:.37,shadowColor:'magenta',shadowBlur:19,shadowOffsetX:8,shadowOffsetY:5});const before={...p.state};
  for(let i=0;i<18;i++)drawWitnessChassis(p.ctx,{w:736+i,h:405,dpr:2,buttonSlots:slots});
  const stats=witnessMaterialCacheStats();assert.ok(stats.entries<=stats.maxEntries&&stats.pixels<=stats.maxPixels);
  assert.deepEqual(p.state,before);assert.equal(p.stack.length,0);
  assert.ok(p.commands.every(command=>command.state.globalAlpha<=.37),'clear shell does not escape a panel fade');
  assert.ok(p.commands.filter(command=>command.method==='drawImage').every(command=>command.state.shadowBlur===0),'raster layers do not inherit a caller’s glow');
  const uncached=probe({cache:false});assert.equal(drawWitnessChassis(uncached.ctx,{buttonSlots:slots}),true);assert.equal(uncached.stack.length,0);
});

test('invalid geometry is rejected before drawing or cache allocation',()=>{
  const p=probe();for(const options of [{x:NaN},{y:Infinity},{w:0},{h:0},{dpr:0},{dpr:Infinity}])assert.equal(drawWitnessChassis(p.ctx,options),false);
  assert.equal(p.commands.length,0);assert.equal(witnessMaterialCacheStats().entries,0);
});
