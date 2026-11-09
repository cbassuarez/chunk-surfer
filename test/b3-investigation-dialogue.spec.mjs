import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversation} from '../src/game/conversation.js';
import {layoutTranscriptChoices} from '../src/render/transcript.js';
import {buildQuestJournal} from '../src/game/quest-journal.js';
import {B3_INVESTIGATION_FLAGS as F,b3FailurePatch,buildB3FailureDialogue,
  buildB3ConsoleInvestigation,B3_REMAINING_ROOMS_DIALOGUE} from '../src/data/b3-investigation-dialogue.js';

function reachChoice(c){
  for(let i=0;i<24&&!c.view().pending&&!c.view().finished;i++){c.update(1);c.key({key:'Enter'});}
  return c.view();
}
function choose(c,id){
  const view=reachChoice(c),index=view.pending.options.findIndex(o=>o.id===id);
  assert.ok(index>=0,`choice ${id} is physically available`);c.key({key:String(index+1)});
}

test('only the first B3 musical failure permits a retry and the second refusal stays visible but cannot execute',()=>{
  const flags={};Object.assign(flags,b3FailurePatch(flags));
  assert.equal(buildB3FailureDialogue(flags).start.choices.find(c=>c.id==='retry').disabled,false);
  Object.assign(flags,b3FailurePatch(flags));
  const actions=[],c=createConversation({nodes:buildB3FailureDialogue(flags),onChoice:c=>actions.push(c.b3Action)});
  c.start();const view=reachChoice(c);
  assert.equal(view.pending.options.find(c=>c.id==='retry').disabled,true);
  assert.ok(layoutTranscriptChoices(view,86).rows.some(r=>r.choiceIndex===1&&r.disabled));
  choose(c,'retry');assert.deepEqual(actions,[]);assert.equal(c.view().nodeId,'start');
  c.selectChoice(1);c.key({key:'Enter'});assert.deepEqual(actions,[],'confirm cannot execute a grey choice');
  choose(c,'investigate');assert.deepEqual(actions,['investigate']);
  assert.ok(buildB3FailureDialogue(flags).start.choices[0].set.includes(F.accepted));
});

test('both orders of the mains and fader test unlock tracing, then physical return disconnection',()=>{
  for(const order of [['unplug','fader'],['fader','unplug']]){
    const actions=[],c=createConversation({nodes:buildB3ConsoleInvestigation(),onChoice:c=>actions.push(c.b3Action)});
    c.start();choose(c,'trace');assert.deepEqual(actions,[],'trace is unavailable before physical tests');
    choose(c,order[0]);const first=reachChoice(c);
    assert.equal(first.pending.options.find(o=>o.id==='trace').disabled,true);
    choose(c,order[1]);const second=reachChoice(c);
    assert.equal(second.pending.options.find(o=>o.id==='trace').disabled,false);
    choose(c,'trace');choose(c,'disconnect');
    assert.deepEqual(actions,[order[0]==='unplug'?'power':'fader',order[1]==='unplug'?'power':'fader','trace','disconnect']);
    assert.equal(c.view().nodeId,'silent');
  }
});

test('a reloaded desk retains completed tests and the still-connected return can be revisited',()=>{
  let tree=buildB3ConsoleInvestigation({powerTried:true,faderTried:true});
  assert.equal(tree.start.choices.find(o=>o.id==='trace').disabled,false);
  tree=buildB3ConsoleInvestigation({powerTried:true,faderTried:true,returnTraced:true});
  assert.ok(tree.start.choices.find(o=>o.id==='disconnect'));
  assert.doesNotMatch(JSON.stringify(tree),/contact|summon/i);
});

test('the work order puts level setup and B3 investigation ahead of B3, then lists all four remaining rooms',()=>{
  const ids=['main_b3','the_tub','soundnoisemusic','amplifications','lux_nova'];
  const job={rooms:ids.map(roomId=>({roomId,label:roomId,recorded:false}))};
  const journal=flags=>buildQuestJournal({save:{flags:{'bag.taken':true,...flags}},job}).find(e=>e.id==='quest:work-order');
  let q=journal({});assert.deepEqual(q.milestones.slice(0,3).map(m=>m.id),['setup:levels','b3:investigate','main_b3']);
  q=journal({'setup.levels':true,'b3.speakers.woken':true});
  assert.equal(q.milestones[0].state,'done');assert.equal(q.milestones[1].state,'current');assert.match(q.next,/Investigate B3/);
  job.rooms[0].recorded=true;q=journal({'setup.levels':true,'b3.speakers.silenced':true});
  assert.ok(ids.slice(1).every(id=>q.milestones.some(m=>m.id===id)));
  assert.match(q.summary,/natatorium, practice rooms, concert hall and chapel/);
  assert.match(q.summary,/chapel may take some time/);
  assert.match(JSON.stringify(B3_REMAINING_ROOMS_DIALOGUE),/Four rooms left/);
});
