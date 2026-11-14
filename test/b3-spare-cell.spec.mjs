import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import {B3_SPARE_CELL_FLAG,B3_SPARE_CELL_CHARGE,takeB3SpareCell} from '../src/game/b3-spare-cell.js';
import {BAG_SUPPLY_IDS,fitBagSupply} from '../src/game/bag-supplies.js';

function fixture(battery,flags={}){
  REC.setTakeSink(null);REC.loadRecState({battery});
  let save={items:[],flags:{...flags},rec:REC.saveRecState()},writes=0;
  return{take:()=>takeB3SpareCell({save,recorder:REC,commit:patch=>{writes++;save={...save,...structuredClone(patch)};}}),
    get save(){return save;},get writes(){return writes;},reload(){REC.loadRecState(save.rec);}};
}

test('taking the B3 spare preserves its exact quarter charge inside an intact carried cell',()=>{
  const f=fixture(1.2,{'other.choice':true});
  assert.equal(f.take(),'taken');assert.equal(REC.batteryLevel(),1.2,'inspection must not fit the cell automatically');
  assert.equal(f.writes,1);assert.equal(f.save.flags[B3_SPARE_CELL_FLAG],true);assert.equal(f.save.flags['other.choice'],true);
  assert.deepEqual(f.save.items,[BAG_SUPPLY_IDS.B3]);assert.equal(f.save.rec.battery,1.2);
  f.reload();assert.equal(f.take(),'taken-already');assert.equal(f.writes,1);
  const fit=fitBagSupply(f.save,BAG_SUPPLY_IDS.B3,{rec:REC.saveRecState(),batteryMax:REC.BATTERY_MAX});
  assert.equal(fit.changed,true);assert.equal(fit.patch.rec.battery,1.2+B3_SPARE_CELL_CHARGE);assert.deepEqual(fit.patch.items,[]);
});

test('full reserve does not prevent keeping the sealed spare for later',()=>{
  const f=fixture(REC.BATTERY_MAX);assert.equal(f.take(),'taken');
  assert.equal(REC.batteryLevel(),REC.BATTERY_MAX);assert.deepEqual(f.save.items,[BAG_SUPPLY_IDS.B3]);
  assert.equal(fitBagSupply(f.save,BAG_SUPPLY_IDS.B3,{batteryMax:REC.BATTERY_MAX}).changed,false);
});

test('an old already-credited B3 receipt cannot issue another physical cell',()=>{
  const f=fixture(.65,{[B3_SPARE_CELL_FLAG]:true});
  assert.equal(f.take(),'taken-already');assert.deepEqual(f.save.items,[]);assert.equal(f.writes,0);assert.equal(REC.batteryLevel(),.65);
});

test('actual save normalization retains pickup and explicit fitting as separate atomic operations',async()=>{
  const {freshSave,getSave,saveCommit,withTransientGameState}=await import('../src/game/save.js');
  REC.setTakeSink(null);REC.loadRecState({battery:.4});let saved;
  await withTransientGameState({save:freshSave()},async scope=>{
    assert.equal(takeB3SpareCell({save:getSave(),recorder:REC,commit:saveCommit}),'taken');
    assert.equal(scope.writes.length,1);saved=structuredClone(getSave());
    assert.deepEqual(saved.items,[BAG_SUPPLY_IDS.B3]);assert.equal(saved.rec.battery,.4);assert.equal(saved.flags[B3_SPARE_CELL_FLAG],true);
  });
  await withTransientGameState({save:saved},async scope=>{
    REC.loadRecState(getSave().rec);const fit=fitBagSupply(getSave(),BAG_SUPPLY_IDS.B3,{rec:REC.saveRecState(),batteryMax:REC.BATTERY_MAX});
    assert.equal(fit.changed,true);saveCommit(fit.patch);REC.loadRecState(fit.patch.rec);
    assert.equal(scope.writes.length,1,'charge, consumed package and original cache receipt travel together');
    assert.equal(getSave().rec.battery,.65);assert.equal(REC.batteryLevel(),.65);assert.deepEqual(getSave().items,[]);
    assert.equal(takeB3SpareCell({save:getSave(),recorder:REC,commit:saveCommit}),'taken-already');assert.equal(scope.writes.length,1);
  });
});
