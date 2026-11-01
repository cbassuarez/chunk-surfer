import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {syncB3FaderProps,b3FaderCapId} from '../src/game/b3-console-faders.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);
const poses=()=>new Map(PROPS.renderInstances({group:'basement',inscriptions:false}).map(p=>[p.id,p]));

test('all 16 caps survive production placement on their console tracks and track true fader values',()=>{
  let draw=poses(),desk=draw.get('b3-control-console');assert.ok(desk);
  for(let n=1;n<=16;n++){
    const id=b3FaderCapId(n),p=PROPS.propById(id),v=draw.get(id);
    assert.ok(p&&v,`${id} is in the live room prop pack`);
    assert.equal(p.blocks,false);assert.equal(p.interactive,false);
    assert.ok(Math.abs(v.y-desk.y-.918)<.001,`${id} is on the console face`);
    assert.ok(Math.abs(v.x-desk.x-.1225)<.001,`${id} starts on its working track`);
    assert.ok(Math.abs(v.z-desk.z-(.97-(n-1)*.112))<.001,`${id} is on its own channel`);
  }
  const vals=Array(16).fill(.75);vals[2]=0;assert.equal(syncB3FaderProps(PROPS,vals),16);draw=poses();
  assert.ok(Math.abs(draw.get(b3FaderCapId(3)).x-desk.x-.325)<.001,'lowered channel three is at the operator end');
  assert.ok(Math.abs(draw.get(b3FaderCapId(2)).x-desk.x-.1225)<.001,'the neighbouring channel does not move');
  vals[2]=1;syncB3FaderProps(PROPS,vals);draw=poses();
  assert.ok(Math.abs(draw.get(b3FaderCapId(3)).x-desk.x-.055)<.001,'raised channel three is at the far end');
});

test('ordinary booth approaches select the operable desk while card and spares remain independently targetable',()=>{
  const pick=(x,y,yaw,pitch)=>PROPS.pickProp(x,y,3,3.2,{yaw,pitch});
  for(const [x,y] of [[46,22],[44,21]]){
    assert.ok(PROPS.propCanOccupy(x,y));const hit=pick(x,y,-Math.PI/2,-.15);
    assert.equal(hit?.id,'b3-control-console');assert.equal(hit?.action,'b3-console');assert.equal(hit?.label,'mixing console');
  }
  assert.equal(pick(43,22,-1.3734,-.7)?.id,'b3-session-card');
  assert.equal(pick(43,19,-1.622,-1)?.id,'b3-spare-cell-tin');
  assert.notEqual(pick(34,22,Math.PI/2,-.15)?.id,'b3-control-console','the glass does not allow reaching the desk from the live room');
});
