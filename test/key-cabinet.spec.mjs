import assert from 'node:assert/strict';

import {
  KEY_CABINET_DROP_MS,
  KEY_CABINET_IMPACT_PROGRESS,
  KEY_CABINET_RING,
  keyCabinetKeyIdentified,
  keyCabinetReactionNode,
  keyCabinetSelection,
  startKeyCabinetDrop,
  stepKeyCabinetDrop,
} from '../src/game/key-cabinet.js';

assert.deepEqual(Object.keys(KEY_CABINET_RING),['CH-04','C-17','FOH-M']);
assert.equal(keyCabinetSelection('C-17'),'take');
assert.equal(keyCabinetSelection('CH-04'),'drop');
assert.equal(keyCabinetSelection('FOH-M'),'drop');
assert.equal(keyCabinetReactionNode('CH-04',false),'early_drop');
assert.equal(keyCabinetReactionNode('FOH-M',true),'known_drop');
assert.equal(keyCabinetReactionNode('C-17',false),'early_take');
assert.equal(keyCabinetReactionNode('C-17',true),'known_take');
assert.equal(keyCabinetKeyIdentified(),false);
assert.equal(keyCabinetKeyIdentified({ledger:true}),true);
assert.equal(keyCabinetKeyIdentified({identified:true}),true);
assert.equal(keyCabinetKeyIdentified({corridorDiscovered:true}),true);

for(const id of[KEY_CABINET_RING['CH-04'].id,KEY_CABINET_RING['FOH-M'].id]){
  let state=startKeyCabinetDrop(id,1000);
  assert.ok(state,`${id} begins a transient drop`);
  assert.equal(startKeyCabinetDrop(KEY_CABINET_RING['C-17'].id,1000),null,'C-17 is acquired rather than dropped');
  let frame=stepKeyCabinetDrop(state,1000+KEY_CABINET_DROP_MS*(KEY_CABINET_IMPACT_PROGRESS-.01));
  assert.equal(frame.impact,false);
  assert.ok(frame.pose.dy<0,'the ring moves down before impact');
  state=frame.state;
  frame=stepKeyCabinetDrop(state,1000+KEY_CABINET_DROP_MS*(KEY_CABINET_IMPACT_PROGRESS+.01));
  assert.equal(frame.impact,true,`${id} emits its single impact edge`);
  assert.ok(frame.pose.dy<-.3,'impact is visibly below the hook');
  state=frame.state;
  frame=stepKeyCabinetDrop(state,1000+KEY_CABINET_DROP_MS*.7);
  assert.equal(frame.impact,false,'the impact edge cannot repeat during return');
  assert.ok(frame.pose.dy<0,'the ring remains in motion while returning');
  state=frame.state;
  frame=stepKeyCabinetDrop(state,1000+KEY_CABINET_DROP_MS);
  assert.equal(frame.done,true);
  assert.equal(frame.pose,null,'completion restores the authored pose exactly');
  assert.equal(frame.state,null,'no transient motion state survives completion');
}

console.log('key cabinet tests ok');
