import test from 'node:test';
import assert from 'node:assert/strict';
import {BAG_SUPPLIES,BAG_SUPPLY_IDS,bagSupplyDefinition,takeBagSupply,fitBagSupply,bagSupplyFitAvailability,bagSupplyItems} from '../src/game/bag-supplies.js';
import {isCarryItem} from '../src/game/carry-items.js';
const ids=Object.values(BAG_SUPPLY_IDS);
const apply=(save,result)=>result.changed?{...save,...structuredClone(result.patch)}:save;

test('the three existing caches retain exactly their authored amounts and original receipts',()=>{
  assert.deepEqual(ids.map(id=>[BAG_SUPPLIES[id].charge,BAG_SUPPLIES[id].cacheFlag]),[
    [.25,'b3.spare-cell'],[.5,'pool.cells'],[.75,'rig.cells']]);
  assert.equal(BAG_SUPPLIES[BAG_SUPPLY_IDS.RIG].requiredFlag,'rig.gutted');
  for(const id of ids){assert.equal(isCarryItem(id),false);assert.equal(BAG_SUPPLIES[id].battleCapable,false);assert.equal(BAG_SUPPLIES[id].readyCapable,false);}
  assert.equal(bagSupplyDefinition('__proto__'),null);
});

test('take stores one complete package without charging, and never repeats after a cache receipt',()=>{
  let save={items:['ren-home-cassette'],flags:{'rig.gutted':true,'other.choice':true},rec:{battery:2,injuries:2,takes:['main_b3']}};
  const initial=structuredClone(save);
  for(const id of ids){
    const taken=takeBagSupply(save,id);assert.equal(taken.changed,true);assert.equal(Object.hasOwn(taken.patch,'rec'),false);
    save=apply(save,taken);assert.equal(takeBagSupply(save,id).changed,false);
  }
  assert.deepEqual(save.items,['ren-home-cassette',...ids]);assert.deepEqual(save.rec,initial.rec);assert.deepEqual(initial.items,['ren-home-cassette']);
  assert.equal(bagSupplyItems(save).length,3);assert.ok(bagSupplyItems(save).every(item=>!item.primaryAction.enabled));
  const reloaded=JSON.parse(JSON.stringify(save));assert.deepEqual(bagSupplyItems(reloaded),bagSupplyItems(save));
});

test('old immediately credited caches never turn into duplicate stored supplies',()=>{
  for(const id of ids){
    const item=BAG_SUPPLIES[id],save={items:[],flags:{[item.cacheFlag]:true,'rig.gutted':true},rec:{battery:item.charge}};
    const before=structuredClone(save);assert.equal(takeBagSupply(save,id).reason,'taken-already');
    assert.deepEqual(bagSupplyItems(save),[]);assert.equal(fitBagSupply(save,id).changed,false);assert.deepEqual(save,before);
  }
  assert.equal(takeBagSupply({items:[],flags:{}},BAG_SUPPLY_IDS.RIG).reason,'source-not-released','stripping the rig remains the cost');
});

test('fitting consumes only a complete package with room for every bit of its charge',()=>{
  for(const id of ids){
    const item=BAG_SUPPLIES[id],taken=apply({items:['lyle-music-box'],flags:{'rig.gutted':true},rec:{battery:2-item.charge,injuries:2,takes:['main_b3']}},
      takeBagSupply({items:['lyle-music-box'],flags:{'rig.gutted':true}},id));
    const before=structuredClone(taken),fit=fitBagSupply(taken,id,{batteryMax:2});
    assert.equal(fit.changed,true);assert.equal(fit.patch.rec.battery,2);assert.deepEqual(fit.patch.items,['lyle-music-box']);
    assert.equal(fit.patch.flags[item.cacheFlag],true);assert.equal(fit.patch.rec.injuries,2);assert.deepEqual(fit.patch.rec.takes,['main_b3']);
    assert.deepEqual(taken,before,'fitting mutated the caller before commit');
    const fitted=apply(taken,fit);assert.equal(fitBagSupply(fitted,id).changed,false);assert.equal(takeBagSupply(fitted,id).changed,false);
    const tooFull={...taken,rec:{battery:2-item.charge+.01}};
    const refused=fitBagSupply(tooFull,id,{batteryMax:2});assert.equal(refused.changed,false);assert.equal(refused.patch,null);
    assert.ok(tooFull.items.includes(id));assert.equal(tooFull.rec.battery,2-item.charge+.01,'partial/truncated charge was granted');
  }
});

test('availability uses the live recorder snapshot and blocks fitting during occupied hands or contact',()=>{
  const save=apply({items:[],flags:{},rec:{battery:0}},takeBagSupply({items:[],flags:{}},BAG_SUPPLY_IDS.B3));
  assert.equal(fitBagSupply(save,BAG_SUPPLY_IDS.B3,{rec:{battery:2}}).changed,false,'stale saved charge bypassed live reserve');
  for(const options of [{inCombat:true},{recording:true},{listening:true},{rec:{battery:NaN}},{rec:{battery:-.1}},{batteryMax:NaN}]){
    assert.equal(fitBagSupply(save,BAG_SUPPLY_IDS.B3,options).changed,false);
    assert.equal(bagSupplyItems(save,options)[0].primaryAction.enabled,false);
  }
  const item=bagSupplyItems(save)[0];assert.equal(item.primaryAction.id,'fit-sealed-cells');assert.equal(item.primaryAction.enabled,true);
  assert.equal(item.value,'+25% CHARGE');assert.equal(bagSupplyFitAvailability(save,'not-a-cell').enabled,false);
});

test('a mixed legacy/current run keeps credited, stored and uncollected caches separate',()=>{
  let save={items:[BAG_SUPPLY_IDS.POOL,'ren-home-cassette'],flags:{'b3.spare-cell':true,'pool.cells':true,'rig.gutted':true},rec:{battery:1}};
  assert.equal(takeBagSupply(save,BAG_SUPPLY_IDS.B3).reason,'taken-already');
  assert.equal(takeBagSupply(save,BAG_SUPPLY_IDS.POOL).reason,'taken-already');
  save=apply(save,takeBagSupply(save,BAG_SUPPLY_IDS.RIG));
  assert.deepEqual(bagSupplyItems(save).map(item=>item.id),[BAG_SUPPLY_IDS.POOL,BAG_SUPPLY_IDS.RIG]);
  save=apply(save,fitBagSupply(save,BAG_SUPPLY_IDS.POOL));assert.equal(save.rec.battery,1.5);
  assert.equal(fitBagSupply(save,BAG_SUPPLY_IDS.RIG).changed,false,'the larger unsealed recovered set was partly consumed');
  assert.ok(save.items.includes(BAG_SUPPLY_IDS.RIG));save={...save,rec:{...save.rec,battery:1.25}};
  save=apply(save,fitBagSupply(save,BAG_SUPPLY_IDS.RIG));assert.equal(save.rec.battery,2);assert.deepEqual(save.items,['ren-home-cassette']);
  const reload=JSON.parse(JSON.stringify(save));
  for(const id of ids)assert.equal(takeBagSupply(reload,id).reason,'taken-already');
});
