import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function block(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a);return main.slice(a,b);}

test('active recording keeps the original escape, recorder controls and save intact instead of entering a frozen blocking scene',()=>{
  const escape={kind:'inversion',stage:'rescue',deadlineMs:1234},endingTimeline={clock:4},writes=[];
  const context={ENDING_ARRIVAL:{ESCAPED:'escaped'},sourceEarthfallProtected:()=>true,escape,endingTimeline,
    saveCommit:patch=>writes.push(patch),sourceContinuationScene:null,wrongDoorPreludeActive:false};
  vm.createContext(context);vm.runInContext(block('function beginWrongDoorEnding(','// Play an ending:'),context);
  assert.equal(vm.runInContext('beginWrongDoorEnding()',context),false);
  assert.equal(context.escape,escape);assert.equal(context.endingTimeline,endingTimeline);assert.deepEqual(writes,[]);
});
test('the ending cannot commit a return from its arrival, collapse, landing or live Source IV exploration',()=>{
  for(const stage of ['arrival','collapse','landing','exploration']){
    const context={getSave:()=>({stage}),endingSourceIVCanFinish:()=>false,finaleActive:true};vm.createContext(context);
    vm.runInContext(block('function finishEnding(id,','// THE TUB IS NOT A RECORDING BATTLE'),context);
    assert.equal(vm.runInContext("finishEnding('inversion')",context),false,stage);
    assert.equal(context.finaleActive,true,'rejection does not tear down the live route');
  }
});
test('the host resumes the new journey before replaying a historical generic ending checkpoint',()=>{
  const calls=[],context={ENDING_ARRIVAL:{ESCAPED:'escaped'},getSave:()=>({endingCutscene:{endingId:'tower-won'}}),
    endingSourceResume:()=>({stage:'source-IV'}),beginWrongDoorEnding:arrival=>{calls.push(arrival);return true;}};
  vm.createContext(context);vm.runInContext(block('function resumeEndingCutsceneFromSave(){','// What authored `{token}`'),context);
  assert.equal(vm.runInContext('resumeEndingCutsceneFromSave()',context),true);assert.deepEqual(calls,['escaped']);
});
