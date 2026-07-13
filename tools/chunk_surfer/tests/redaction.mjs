import assert from 'node:assert/strict';
import { natatoriumBattle, practiceBattle, hallBattle, chapelBoss } from '../../../public/labs/chunk-surfer/src/data/battles.js';
import {
  applyOpponentMove, createRedactionState, layoutRedactionTokens,
  moveRedactionCursor, survivingText, toggleRedaction, undoRedaction,
  validateBattleDefinition, validateReading,
} from '../../../public/labs/chunk-surfer/src/game/redaction.js';

for(const battle of [natatoriumBattle(),practiceBattle(),hallBattle(),chapelBoss()]){
  assert.deepEqual(validateBattleDefinition(battle),[],`${battle.id} definition`);
  for(const challenge of battle.challenges){
    assert.ok(challenge.readings.length>=2,`${challenge.id} has open readings`);
    const state=createRedactionState(challenge);
    const keep=new Set(challenge.readings[0].required);
    for(const token of challenge.tokens)if(!keep.has(token.id))toggleRedaction(state,token.id);
    assert.equal(validateReading(state).ok,true,`${challenge.id} accepts an authored reading`);
    assert.ok(survivingText(state).length>0);
    assert.equal(undoRedaction(state),true);

    const counter=createRedactionState(challenge);
    for(let i=0;i<challenge.opponentMoves.length;i++)applyOpponentMove(counter);
    const stillSolvable=challenge.readings.some((r)=>r.required.every((id)=>!counter.opponent.has(id)));
    assert.equal(stillSolvable,true,`${challenge.id} remains solvable after counters`);

    const layout=layoutRedactionTokens(challenge,24);
    assert.equal(layout.length,challenge.tokens.length);
    moveRedactionCursor(counter,'right',layout);
    assert.equal(counter.cursor,Math.min(1,layout.length-1));
  }
}
console.log('PASS  all physical redaction definitions and state transitions');
