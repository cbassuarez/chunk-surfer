import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('const doorLeafVisualCache='),end=main.indexOf('function doorRenderInstances(',start);
assert.ok(start>=0&&end>start,'production door cache section');
const production=main.slice(start,end);
function setup(){
  let trig=0;
  const countedMath=Object.create(Math);
  countedMath.cos=x=>{trig++;return Math.cos(x);};
  countedMath.sin=x=>{trig++;return Math.sin(x);};
  const c={CELL:.5,Math:countedMath,Float32Array,portals:[],FP:{
    forEachDoor(fn){c.portals.forEach(fn);},
    logicalToPhysical(x,y){return{x,y:3,z:y,renderGroup:'ground'};},
    zoneAt(){return 1;},
  }};
  vm.createContext(c);
  vm.runInContext(`${production}\nglobalThis.cache=doorLeafVisualCache;globalThis.write=writeDoorLeafMatrix;globalThis.rebuild=rebuildDoorLeafVisuals;`,c);
  return{c,trig:()=>trig};
}
function portal({fraction=0,active=[0],widthAxis='x',x=4,y=6}={}){
  return{id:'door',cx:x,cy:y,widthAxis,runtime:{openFraction:fraction},definition:{
    leafCount:2,activeLeaves:active,aperture:{width:2},hinge:'left',swing:'in',mesh:'door_leaf_service',
  }};
}
function originalMatrix(p,center,leafIndex){
  const d=p.definition,left=leafIndex===0,hingeLocal=left?-d.aperture.width/2:d.aperture.width/2;
  const yaw=p.widthAxis==='x'?0:Math.PI/2;
  const fraction=d.activeLeaves.includes(leafIndex)?p.runtime.openFraction:0;
  const theta=yaw+(left?-1:1)*(String(d.swing).includes('in')?-1:1)*Math.PI*.49*fraction;
  const reflect=left?1:-1,c=Math.cos(theta),s=Math.sin(theta);
  return new Float32Array([c*reflect,0,s*reflect,0,0,1,0,0,-s,0,c,0,
    center.x*.5+Math.cos(yaw)*hingeLocal,center.y,center.z*.5+Math.sin(yaw)*hingeLocal,1]);
}
const values=m=>Array.from(m);

test('unchanged leaves reuse exact matrices while active openings animate',()=>{
  const h=setup(),p=portal();h.c.portals=[p];h.c.rebuild();
  const [active,inactive]=h.c.cache.entries;
  assert.deepEqual(values(active.matrix),values(originalMatrix(p,active.center,0)));
  assert.deepEqual(values(inactive.matrix),values(originalMatrix(p,inactive.center,1)));
  let calls=h.trig();h.c.write(active);h.c.write(inactive);
  assert.equal(h.trig(),calls,'closed leaves do not recalculate');
  const inactiveBefore=values(inactive.matrix);
  p.runtime.openFraction=.42;h.c.write(active);h.c.write(inactive);
  assert.ok(h.trig()>calls,'active leaf changes');
  assert.deepEqual(values(active.matrix),values(originalMatrix(p,active.center,0)));
  assert.deepEqual(values(inactive.matrix),inactiveBefore,'inactive leaf stays shut');
  calls=h.trig();h.c.write(active);h.c.write(inactive);assert.equal(h.trig(),calls);
  p.runtime={openFraction:1};h.c.write(active);
  assert.deepEqual(values(active.matrix),values(originalMatrix(p,active.center,0)),'replaced runtime animates');
  p.runtime.openFraction=0;h.c.write(active);
  assert.deepEqual(values(active.matrix),values(originalMatrix(p,active.center,0)),'door closes again');
});

test('rebuilding creates fresh matrices for new placements and definitions',()=>{
  const h=setup(),first=portal({fraction:.5});h.c.portals=[first];h.c.rebuild();
  const previous=h.c.cache.entries[0],matrix=values(previous.matrix);
  const second=portal({fraction:.5,active:[1],widthAxis:'y',x:12,y:17});h.c.portals=[second];h.c.rebuild();
  const [left,right]=h.c.cache.entries;
  assert.notEqual(left,previous);assert.notDeepEqual(values(left.matrix),matrix);
  assert.deepEqual(values(left.matrix),values(originalMatrix(second,left.center,0)));
  assert.deepEqual(values(right.matrix),values(originalMatrix(second,right.center,1)));
  const calls=h.trig();h.c.write(left);h.c.write(right);assert.equal(h.trig(),calls);
});
