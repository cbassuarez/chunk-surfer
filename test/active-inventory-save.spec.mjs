import test from 'node:test';
import assert from 'node:assert/strict';
class MemoryStorage {
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
globalThis.localStorage=new MemoryStorage();
const SAVE=await import('../src/game/save.js');

test('the actual save owner round-trips empty numbered bays and the held preference',()=>{
  SAVE.newGame({preset:'contract',now:1234567890000});
  SAVE.saveCommit({bagLoadout:{schema:2,top:[null,'recorder',null,'coffee'],heldSlot:3}});
  const reloaded=SAVE.saveLoad().save;
  assert.deepEqual(reloaded.bagLoadout.top,[null,'recorder',null,'coffee']);
  assert.equal(reloaded.bagLoadout.heldSlot,3);assert.equal(reloaded.bagLoadout.capacity,4);
  SAVE.saveCommit({bagLoadout:{...reloaded.bagLoadout,heldSlot:null}});
  assert.equal(SAVE.saveLoad().save.bagLoadout.heldSlot,null,'lowered hands did not survive reload');
});

test('older compact trays migrate once without granting an item or changing ownership flags',()=>{
  const flags={...SAVE.getSave().flags,'bag.taken':true,'has.fork':false,'lost.torch':true};
  SAVE.saveCommit({flags,bagLoadout:{schema:1,top:['radio','radio','map','light','recorder']}});
  const migrated=SAVE.saveLoad().save;
  assert.deepEqual(migrated.bagLoadout.top,['radio','light','recorder']);
  assert.equal(migrated.bagLoadout.schema,2);assert.equal(migrated.bagLoadout.heldSlot,0);
  assert.equal(migrated.flags['has.fork'],false);assert.equal(migrated.flags['lost.torch'],true);
  assert.ok(!migrated.bagLoadout.top.includes('tuning-fork'));
});
