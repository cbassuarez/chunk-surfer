import test from 'node:test';
import assert from 'node:assert/strict';
import {takeRetainedBelonging} from '../src/game/retained-belongings.js';
import {createCassetteLedger,recordOnCassette,loseCassetteOnContact,recoverCassette} from '../src/game/cassette-ledger.js';
import {resolveBagOwnership,cassetteBagItems} from '../src/game/bag-items.js';
import {availableBattleTools} from '../src/game/combat-loadout.js';
import {activeInventoryFrame} from '../src/game/active-inventory.js';
class MemoryStorage{
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
globalThis.localStorage=new MemoryStorage();
const SAVE=await import('../src/game/save.js');

test('the actual save owner preserves explicitly taken belongings, cassette custody and their four ready bays',()=>{
  SAVE.newGame({preset:'contract',now:1234567890000});
  const initial=structuredClone(SAVE.getSave().flags),ids=['b3-session-card','vale-guarantor-slip','lyle-music-box'];
  for(const id of ids){const taken=takeRetainedBelonging(SAVE.getSave(),id);assert.equal(taken.changed,true);SAVE.saveCommit({items:taken.save.items});}
  const cassettes=recordOnCassette({...createCassetteLedger('contract'),runId:SAVE.getSave().run.id},1,{roomId:'main_b3',outcome:'clean',takeId:'save-receipt'}).ledger;
  SAVE.saveCommit({cassettes,bagLoadout:{schema:2,top:[...ids,'recording-cassette:1'],heldSlot:3}});
  const saved=SAVE.saveLoad().save;
  assert.deepEqual(saved.items,ids);assert.deepEqual(saved.flags,initial,'readiness fabricated acquisition or quest flags');
  assert.deepEqual(saved.bagLoadout,{schema:2,capacity:4,top:[...ids,'recording-cassette:1'],heldSlot:3});
  assert.deepEqual(saved.cassettes,cassettes,'the save owner changed the numbered physical stock');
  assert.deepEqual(resolveBagOwnership({bagTaken:true,items:saved.items}).kit.slice(-3),ids);
  const equipment=[...ids.map(id=>({id,present:saved.items.includes(id)})),...cassetteBagItems(saved.cassettes)];
  assert.equal(activeInventoryFrame(saved.bagLoadout,equipment).held.id,'recording-cassette:1');
  assert.deepEqual(availableBattleTools(saved.bagLoadout,equipment),[],'carried evidence became a battle tool');
});

test('losing and recovering the selected cassette through its real owner preserves a reserved bay without a ghost held object',()=>{
  const before=SAVE.getSave(),lost=loseCassetteOnContact(before.cassettes,{random:()=>0});
  assert.equal(lost.lost,1);SAVE.saveCommit({cassettes:lost.ledger});
  let saved=SAVE.saveLoad().save;
  assert.equal(saved.bagLoadout.top[3],'recording-cassette:1');assert.equal(saved.bagLoadout.heldSlot,3);
  assert.equal(activeInventoryFrame(saved.bagLoadout,cassetteBagItems(saved.cassettes)).held,null);
  SAVE.saveCommit({cassettes:recoverCassette(saved.cassettes,1).ledger});saved=SAVE.saveLoad().save;
  assert.equal(activeInventoryFrame(saved.bagLoadout,cassetteBagItems(saved.cassettes)).held.id,'recording-cassette:1');
  assert.deepEqual(saved.items,['b3-session-card','vale-guarantor-slip','lyle-music-box']);
});
