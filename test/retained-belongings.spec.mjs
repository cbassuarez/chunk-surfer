import test from 'node:test';
import assert from 'node:assert/strict';
import {RETAINED_BELONGINGS,retainedBelongingDefinition,retainedBelongingForProp,ownsRetainedBelonging,takeRetainedBelonging,retainedBelongingPrompt,retainedBelongingInspection} from '../src/game/retained-belongings.js';
import {resolveBagOwnership,resolveBagItemAction,bagInspectionDialogue} from '../src/game/bag-items.js';
import {isCarryItem} from '../src/game/carry-items.js';
const ids=['b3-session-card','vale-guarantor-slip','lyle-music-box'];

test('only the three approved physical originals have acquisition definitions',()=>{
  assert.deepEqual(Object.keys(RETAINED_BELONGINGS),ids);
  assert.equal(new Set(ids.map(id=>retainedBelongingDefinition(id).propId)).size,3);
  for(const id of ids){
    const item=retainedBelongingDefinition(id);assert.equal(retainedBelongingForProp(item.propId),item);assert.equal(isCarryItem(id),true);
  }
  assert.equal(retainedBelongingDefinition('__proto__'),null);
  assert.equal(retainedBelongingForProp('plant-header-card'),null,'required wall instructions are never silently pocketed');
});

test('inspection and KEEP / LEAVE prompts cannot themselves acquire a belonging',()=>{
  const save={items:['ren-home-cassette'],flags:{'roofRen.guarantorTraceRead':true},bagLoadout:{schema:2,top:['light'],heldSlot:0}};
  const original=structuredClone(save);
  for(const id of ids){
    const prompt=retainedBelongingPrompt(id);assert.deepEqual(prompt.choices.map(choice=>choice.id),['keep','leave']);
    assert.equal(prompt.choices[0].intent.itemId,id);assert.equal(prompt.choices[1].intent.type,'leave-retained-belonging');
    assert.ok(retainedBelongingInspection(id).actions.length>0);assert.equal(ownsRetainedBelonging(save,id),false);
  }
  assert.deepEqual(save,original);
  assert.equal(retainedBelongingPrompt('lyle-music-box').choices[0].label,'TAKE IT BACK','it was already a gift, not unclaimed loot');
});

test('explicit taking is immutable, idempotent and derives every removal from existing save.items',()=>{
  const source={items:['ren-home-cassette'],flags:{'roofRen.guarantorTraceRead':true},roofRen:{stage:'request'}};
  const original=structuredClone(source);let save=source;
  for(const id of ids){
    const result=takeRetainedBelonging(save,id);assert.equal(result.changed,true);save=result.save;
    assert.equal(ownsRetainedBelonging(save,id),true);
    const again=takeRetainedBelonging(save,id);assert.equal(again.changed,false);assert.equal(again.save,save);
    assert.deepEqual(retainedBelongingPrompt(id,{owned:true}).choices.map(choice=>choice.id),['done']);
    assert.equal(retainedBelongingForProp(retainedBelongingDefinition(id).propId).id,id);
  }
  assert.deepEqual(source,original);assert.deepEqual(save.flags,source.flags);assert.deepEqual(save.roofRen,source.roofRen);
  assert.deepEqual(save.items,['ren-home-cassette',...ids]);
  assert.deepEqual(resolveBagOwnership({bagTaken:true,items:JSON.parse(JSON.stringify(save)).items}).kit.slice(-3),ids);
  assert.equal(takeRetainedBelonging(save,'unknown').changed,false);
});

test('deeper inspection retains consent and consequences without awarding a recording receipt or new power',()=>{
  const vale=retainedBelongingInspection('vale-guarantor-slip');
  assert.deepEqual(vale.actions.map(action=>action.id),['year-zero','year-twelve','year-sixty-one']);
  const text=vale.actions.flatMap(action=>action.lines.map(line=>line.text)).join(' ');
  assert.match(text,/while I can still walk away/);assert.match(text,/daughter married/);assert.match(text,/never mended/);
  const box=retainedBelongingInspection('lyle-music-box');
  assert.equal(box.actions[0].kind,'physical-inspection');assert.equal(box.actions[0].inspectionId,'music-box');
  assert.match(retainedBelongingDefinition('lyle-music-box').consequence,/earns no recording receipt/);
  for(const id of ids){assert.equal(resolveBagItemAction(id).id,'inspect-retained-belonging');assert.equal(bagInspectionDialogue(id).inspectionActions.length,retainedBelongingInspection(id).actions.length);}
  vale.actions[0].lines[0].text='presenter change';
  assert.match(retainedBelongingInspection('vale-guarantor-slip').actions[0].lines[0].text,/SEAL, YEAR 0/);
});
