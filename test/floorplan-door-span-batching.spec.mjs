import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {F} from '../src/data/floorplan/legend.js';

// Count rebuilds in the actual module without adding a production diagnostic,
// cache or alternate geometry implementation.
const url=new URL('../src/world/floorplan.js',import.meta.url);
const original=readFileSync(url,'utf8');
const marker='function buildPhysicalSpans(){';
assert.equal(original.split(marker).length,2);
const source=('let testBuilds=0;export const testBuildCount=()=>testBuilds;\n'+original)
  .replace(marker,marker+'testBuilds++;')
  .replace(/(from\s+['"])(\.[^'"]+)(['"])/g,(_all,before,path,after)=>before+new URL(path,url).href+after);
const FP=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const levels=[{id:'door-batch-fixture',origin:{x:0,y:0},base:0,
  rows:['##########','#FF#FF#FF#','#FF+FF+FF#','#FF#FF#FF#','##########']}];
const definitions=[3,6].map((x,i)=>({id:`batch-${i}`,archetype:'academic-wired-glass',at:{x,y:2},widthAxis:'y',initialState:'closed'}));
const setup=()=>FP.compile(levels,{width:10,height:5,doors:definitions});
function coherent(id,closed){
  const door=FP.doorState().find(d=>d.id===id);assert.ok(door);
  assert.equal(door.open,!closed);
  for(const cell of door.cells){
    assert.equal(FP.hasFlag(cell.x,cell.y,F.CLOSED),closed,'logical collision publishes the endpoint');
    const at=FP.logicalToPhysical(cell.x,cell.y),spans=FP.physicalSpanData().cells.get(`${at.x},${at.z}`)||[];
    assert.ok(spans.length,'the threshold retains real physical air');
    assert.ok(spans.some(span=>!!(span.flags&F.CLOSED)===closed),'the immediately submitted physical flags match collision');
  }
}

test('compile, configure, reset and reload publish one coherent rebuild per door batch',()=>{
  let before=FP.testBuildCount();setup();assert.equal(FP.testBuildCount()-before,2,'one configuration publication plus the final complete construction');
  coherent('batch-0',true);coherent('batch-1',true);
  FP.setDoorOpen('batch-0',true);const saved=FP.saveDoorState();
  before=FP.testBuildCount();FP.resetDoors();assert.equal(FP.testBuildCount()-before,1);
  coherent('batch-0',true);coherent('batch-1',true);
  before=FP.testBuildCount();FP.loadDoorState(saved);assert.equal(FP.testBuildCount()-before,1);
  coherent('batch-0',false);coherent('batch-1',true);assert.deepEqual(FP.saveDoorState(),saved);
  before=FP.testBuildCount();FP.configureDoors(definitions);assert.equal(FP.testBuildCount()-before,1);
  coherent('batch-0',true);coherent('batch-1',true);
});

test('ordinary single-door opening and closing remain immediately visible to collision and physical rendering',()=>{
  setup();
  for(const open of[true,false,true]){
    const before=FP.testBuildCount(),physical=FP.physicalSpanData();
    assert.equal(FP.setDoorOpen('batch-0',open),true);
    assert.equal(FP.testBuildCount()-before,1);assert.notEqual(FP.physicalSpanData(),physical);
    coherent('batch-0',!open);coherent('batch-1',true);
  }
});

test('a failed batch publishes its applied prefix before reporting the unmatched door',()=>{
  setup();FP.setDoorOpen('batch-0',true);FP.setDoorOpen('batch-1',true);
  const before=FP.testBuildCount();
  assert.throws(()=>FP.configureDoors([definitions[0],{...definitions[1],id:'missing',at:{x:90,y:90}}]),/no portal for door missing/);
  assert.equal(FP.testBuildCount()-before,1);
  coherent('batch-0',true);coherent('batch-1',false);
});

test('invalid legacy key coordinates neither mutate a nearby door nor rebuild its geometry',()=>{
  setup();FP.setDoorOpen('batch-0',true);
  const saved=FP.saveDoorState(),doors=FP.doorState(),physical=FP.physicalSpanData(),before=FP.testBuildCount();
  for(const[x,y]of[[undefined,2],[3,undefined],[NaN,2],[3,Infinity],[null,2],[3,'2']])
    assert.equal(FP.setDoorKey(x,y,'wrong-door'),false);
  assert.deepEqual(FP.saveDoorState(),saved);assert.deepEqual(FP.doorState(),doors);
  assert.equal(FP.physicalSpanData(),physical);assert.equal(FP.testBuildCount(),before);
  coherent('batch-0',false);coherent('batch-1',true);
});

test('bulk door endpoints publish all collision and physical flags together without repeated rebuilds',()=>{
  setup();
  for(const open of[true,false]){
    const before=FP.testBuildCount();
    const saved=FP.setAllDoorsOpen(open);
    assert.equal(FP.testBuildCount()-before,1);
    coherent('batch-0',!open);coherent('batch-1',!open);
    assert.deepEqual(FP.saveDoorState(),saved);
  }
});

test('an active bricked glyph remains masonry with its retained frame scar and no live leaf',()=>{
  FP.compile([{id:'bricked-fixture',origin:{x:0,y:0},base:0,rows:['#####','#FxF#','#####']}],{width:5,height:3});
  const scars=FP.sealedDoorways();assert.equal(scars.length,1);assert.equal(FP.doorState().length,0);
  assert.equal(FP.isSolid(4,2),true);assert.ok(FP.floorplan().flags[2*FP.planSize().w+4]&F.BRICKED);
  assert.equal(FP.canStep(3,2,4,2,{keys:new Set()}).ok,false);
});
