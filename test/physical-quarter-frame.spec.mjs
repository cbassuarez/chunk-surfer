import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {CELL} from '../src/data/floorplan/legend.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('quarter embeddings preserve logical addresses and exact authored/body coordinates',()=>{
  for(const quarterTurns of[-1,1,2]){
    const a=quarterTurns*Math.PI/2,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a));
    FP.compile([{id:'turned',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},rows:['YYYY','YYYY','YYYY','YYYY'],physicalFrame:{source:{x:2,z:2},target:{x:12,z:12},quarterTurns}}]);
    for(const [x,z]of[[1,1],[2.25,1.75],[.5,3]]){
      const px=x*2,pz=z*2,point=FP.logicalPointToPhysical(px,pz);
      close(point.x*CELL,12+(x-2)*c-(z-2)*s);close(point.z*CELL,12+(x-2)*s+(z-2)*c);
      const body=FP.logicalToPhysical(px,pz),expected={x:12+(x+.25-2)*c-(z+.25-2)*s,z:12+(x+.25-2)*s+(z+.25-2)*c};
      close((body.x+.5)*CELL,expected.x);close((body.z+.5)*CELL,expected.z);
      const inverse=FP.logicalAtPhysical(body.x,body.z,{floor:0});assert.ok(inverse);close(inverse.x,px);close(inverse.y,pz);
    }
    close(Math.sin(FP.arcYawOffset(2,2,0,0)),Math.sin(a));
    for(let x=18;x<=30;x+=.5)for(let z=18;z<=30;z+=.5){
      const inverse=FP.logicalAtPhysical(x,z,{floor:0});if(!inverse)continue;
      const actual=FP.logicalToPhysical(inverse.x,inverse.y);close(actual.x,x);close(actual.z,z);
    }
  }
});
test('ordinary physical crossing redirects to a turned room and preserves view bearing',()=>{
  const rows=Array.from({length:8},(_,z)=>Array.from({length:8},(_,x)=>x>=2&&x<6&&z>=2&&z<6?' ':'Y').join(''));
  FP.compile([
    {id:'room',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},rows:['YYYY','YYYY','YYYY','YYYY'],physicalFrame:{source:{x:2,z:2},target:{x:12,z:12},quarterTurns:-1},physicalReplace:true},
    {id:'yard',origin:{x:10,y:0},physicalOrigin:{x:8,y:8},rows,physicalNavigation:true,physicalReplace:true},
  ]);
  const outside=FP.logicalAtPhysical(19,23,{floor:0});assert.ok(outside);
  const crossing=FP.canStep(outside.x,outside.y,outside.x+1,outside.y);assert.equal(crossing.ok,true);assert.ok(crossing.redirect);
  const to=FP.logicalToPhysical(crossing.redirect.x,crossing.redirect.y);close(to.x,20);close(to.z,23);
  close(Math.sin(crossing.edgeTurn),1);
  const back=FP.canStep(crossing.redirect.x,crossing.redirect.y,crossing.redirect.x,crossing.redirect.y-1);assert.equal(back.ok,true);assert.ok(back.redirect);
  close(back.redirect.x,outside.x);close(back.redirect.y,outside.y);
});
test('unmarked levels retain translation semantics and no new movement redirects',()=>{
  FP.compile([{id:'legacy',origin:{x:0,y:0},physicalOrigin:{x:10,y:20},rows:['YYYY','YYYY']}]);
  assert.deepEqual(FP.logicalPointToPhysical(2.2,1.3),FP.logicalToPhysical(2.2,1.3));
  assert.equal(FP.physicalQuarterTurnsAt(1,1),0);assert.equal(FP.arcYawOffset(1,1,0,0),0);
  assert.equal(FP.canStep(1,1,2,1).redirect,undefined);
});
