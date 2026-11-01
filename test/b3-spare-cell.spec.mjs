import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import {B3_SPARE_CELL_FLAG,B3_SPARE_CELL_CHARGE,takeB3SpareCell} from '../src/game/b3-spare-cell.js';

function fixture(battery,flags={}){
  REC.setTakeSink(null);
  REC.loadRecState({battery});
  let save={flags:{...flags},rec:REC.saveRecState()},writes=0;
  return {
    take:()=>takeB3SpareCell({save,recorder:REC,commit:patch=>{writes++;save={...save,...structuredClone(patch)};}}),
    get save(){return save;},get writes(){return writes;},
    reload(){REC.loadRecState(save.rec);},
  };
}

test('a B3 spare adds exactly a quarter charge once and persists the flag and recorder together',()=>{
  const f=fixture(1.2,{'other.choice':true});
  assert.equal(f.take(),'taken');
  assert.equal(REC.batteryLevel(),1.2+B3_SPARE_CELL_CHARGE);
  assert.equal(f.writes,1);
  assert.equal(f.save.flags[B3_SPARE_CELL_FLAG],true);
  assert.equal(f.save.flags['other.choice'],true);
  assert.equal(f.save.rec.battery,REC.batteryLevel());
  f.reload();
  assert.equal(f.take(),'taken-already');
  assert.equal(f.writes,1);
  assert.equal(REC.batteryLevel(),1.2+B3_SPARE_CELL_CHARGE);
});

test('when it would overflow, a cell remains available and can be collected after use',()=>{
  const f=fixture(1.9);
  assert.equal(f.take(),'no-room');
  assert.equal(f.writes,0);
  assert.equal(f.save.flags[B3_SPARE_CELL_FLAG],undefined);
  assert.equal(REC.batteryLevel(),1.9);
  REC.addBattery(-.2);
  assert.equal(f.take(),'taken');
  assert.ok(Math.abs(REC.batteryLevel()-1.95)<1e-10);
  assert.equal(f.writes,1);
});

test('the exact available capacity can hold the full cell without a partial grant',()=>{
  const f=fixture(REC.BATTERY_MAX-B3_SPARE_CELL_CHARGE);
  assert.equal(f.take(),'taken');
  assert.equal(REC.batteryLevel(),REC.BATTERY_MAX);
});

test('actual save normalization retains the one-time pickup with its battery on reload',async()=>{
  const {freshSave,getSave,saveCommit,withTransientGameState}=await import('../src/game/save.js');
  REC.setTakeSink(null);
  REC.loadRecState({battery:.4});
  let saved;
  await withTransientGameState({save:freshSave()},async scope=>{
    assert.equal(takeB3SpareCell({save:getSave(),recorder:REC,commit:saveCommit}),'taken');
    assert.equal(scope.writes.length,1,'flag and resource are committed in one write');
    saved=structuredClone(getSave());
    assert.equal(saved.flags[B3_SPARE_CELL_FLAG],true);
    assert.equal(saved.rec.battery,.65);
  });
  await withTransientGameState({save:saved},async scope=>{
    REC.loadRecState(getSave().rec);
    assert.equal(takeB3SpareCell({save:getSave(),recorder:REC,commit:saveCommit}),'taken-already');
    assert.equal(scope.writes.length,0);
    assert.equal(REC.batteryLevel(),.65);
  });
});
