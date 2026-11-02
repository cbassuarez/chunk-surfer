import test from 'node:test';
import assert from 'node:assert/strict';
import {academicSocietyDialogue,ACADEMIC_SOCIETY_TOPICS} from '../src/data/academic-society.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {createConversation} from '../src/game/conversation.js';
import {odetteStrikeWatchRequested,STUDENT_STRIKE_WATCHED_FLAG} from '../src/data/student-strike-dialogue.js';

const arrival={onAcademicFloor:true,listener:{x:16.6,y:276}};
const makeSociety=consent=>{
  const society=createAcademicSociety({consent,loanRemaining:consent==='lent'?12:0});
  society.tick(0,arrival);return society;
};
function advanceToBranch(conversation){
  for(let i=0;i<30&&!conversation.view().pending&&!conversation.view().finished;i++){
    conversation.update(100);conversation.key({key:'Enter'});
  }
  return conversation.view();
}
function select(conversation,id){
  const options=conversation.view().pending?.options||[],index=options.findIndex(c=>c.studentStrikeChoice===id);
  assert.ok(index>=0,`choice ${id} is available`);
  conversation.selectChoice(index,{sound:false});conversation.key({key:'Enter'});
}
function presentation(society,{watched=false,available=true}={}){
  const dialogue=society.beginDialogue('odette',{studentStrikeWatched:watched,studentStrikeAvailable:available});
  const choices=[];let launches=0,completed=0;
  const conversation=createConversation({nodes:dialogue.nodes,voiceEnabled:false,
    onChoice:c=>choices.push(c),onDone:()=>{
      completed++;society.endDialogue('odette',{completed:true,choices});
      if(odetteStrikeWatchRequested('odette',choices))launches++;
    }});
  conversation.start();
  return{conversation,choices,get launches(){return launches;},get completed(){return completed;}};
}

test('Odette strike topic is an optional valid graph, with no Contact or consent condition',()=>{
  assert.equal(STUDENT_STRIKE_WATCHED_FLAG,'academic.strike.watched');
  for(const consent of ['unasked','declined','lent','withdrawn','left','expired']){
    const tree=academicSocietyDialogue('odette',{consent});
    assert.ok(tree.nodes.start.choices.some(c=>c.studentStrikeChoice==='students'));
    assert.ok(tree.nodes.start.choices.some(c=>c.goto==='leave'),'the ordinary exit remains available');
    assert.ok(!tree.nodes.start.choices.some(c=>c.studentStrike==='watch'),'asking the topic does not start the film');
    for(const node of Object.values(tree.nodes)){
      if(node.goto)assert.ok(tree.nodes[node.goto]);
      for(const c of node.choices||[]){assert.ok(tree.nodes[c.goto]);assert.equal(c.set,undefined);assert.equal(c.clear,undefined);}
    }
    for(const id of ACADEMIC_SOCIETY_TOPICS.odette)assert.ok(tree.nodes[id]);
  }
});

test('short choices and full spoken responses are separate editable strings without a second say picker',()=>{
  const tree=academicSocietyDialogue('odette',{}, {studentStrikeWatched:true});
  for(const node of Object.values(tree.nodes))for(const c of node.choices||[]){
    if(!c.studentStrikeChoice)continue;
    assert.equal(typeof c.text,'string');assert.equal(typeof c.spokenText,'string');
    const response=tree.nodes[c.goto].lines[0];assert.equal(response.who,'me');
    assert.equal(response.text,c.spokenText);assert.equal(response.say,false);
    assert.equal(response.actorId,undefined);assert.equal(response.voiceSpeaker,'me');
  }
});

test('only completed fresh watch selection reaches the launch boundary, after its full operator line',()=>{
  const society=makeSociety('unasked'),p=presentation(society),c=p.conversation;
  advanceToBranch(c);select(c,'students');
  assert.equal(c.view().line.text,'What happened to the students here?');assert.equal(c.view().pending,null);
  advanceToBranch(c);assert.equal(p.launches,0);select(c,'watch');
  assert.equal(c.view().line.text,'Tell me what happened.');assert.equal(c.view().pending,null);
  assert.equal(p.launches,0,'onChoice cannot launch before the selected full line finishes');
  advanceToBranch(c);assert.equal(p.completed,1);assert.equal(p.launches,1);
  for(let i=0;i<10;i++)c.key({key:'Enter'});
  assert.equal(p.launches,1);assert.equal(society.save().consent,'unasked');
  assert.deepEqual(society.save().topics.odette,['students']);
  assert.equal(Object.hasOwn(society.save(),'studentStrikeWatched'),false,'only actual film completion owns its external receipt');
});

test('deferring and cancelling after selection never launch or convert consent',()=>{
  for(const consent of ['unasked','lent','declined']){
    const society=makeSociety(consent),before=society.save(),p=presentation(society),c=p.conversation;
    advanceToBranch(c);select(c,'students');advanceToBranch(c);select(c,'defer');advanceToBranch(c);
    assert.equal(p.launches,0);assert.equal(p.completed,1);assert.equal(society.save().consent,consent);
    assert.equal(society.save().loanRemaining,before.loanRemaining);
  }
  const society=makeSociety('unasked'),before=society.save(),p=presentation(society),c=p.conversation;
  advanceToBranch(c);select(c,'students');advanceToBranch(c);select(c,'watch');c.stop();
  assert.deepEqual(society.endDialogue('odette',{completed:false,choices:p.choices}),[]);
  assert.equal(p.launches,0);assert.deepEqual(society.save(),before);
  assert.equal(odetteStrikeWatchRequested('agathe',p.choices),false);
  assert.equal(odetteStrikeWatchRequested('odette',[{studentStrike:'watch'}]),false,'an unrelated or malformed action is not this authored watch choice');
});

test('watched context offers exactly three interpretive follow-ups and a separate optional rewatch',()=>{
  const society=makeSociety('withdrawn'),p=presentation(society,{watched:true}),c=p.conversation;
  advanceToBranch(c);
  assert.ok(c.view().pending.options.some(o=>o.studentStrike==='watch'));
  select(c,'students');advanceToBranch(c);
  assert.deepEqual(c.view().pending.options.map(o=>o.studentStrikeChoice),['authority','preservation','leave']);
  select(c,'authority');advanceToBranch(c);
  select(c,'preservation');advanceToBranch(c);
  select(c,'leave');advanceToBranch(c);
  assert.equal(p.launches,0);assert.equal(p.completed,1);assert.equal(society.save().consent,'withdrawn');
  assert.deepEqual(society.save().topics.odette,['students','strike-authority','strike-preservation']);
  const repeat=presentation(society,{watched:true});advanceToBranch(repeat.conversation);select(repeat.conversation,'watch');
  assert.equal(repeat.launches,0);advanceToBranch(repeat.conversation);assert.equal(repeat.launches,1);
});

test('watched narration does not promise a cause, cure or automatic rescue and cannot resurrect departed Odette',()=>{
  const tree=academicSocietyDialogue('odette',{}, {studentStrikeWatched:true});
  const authority=tree.nodes['strike-authority'].lines.map(l=>l.text).join(' ');
  const preservation=tree.nodes['strike-preservation'].lines.map(l=>l.text).join(' ');
  assert.match(authority,/did not see every recovery/);assert.match(authority,/cannot tell you why they died/);
  assert.match(preservation,/They had already said no/);assert.match(preservation,/cannot promise/);
  const society=makeSociety('unasked');society.tick(0,{...arrival,activeActorIds:[]});
  assert.equal(society.beginDialogue('odette',{studentStrikeWatched:true}),null);
});

test('an occupied transport keeps the topic but replaces every watch action with an ordinary response',()=>{
  for(const watched of [false,true]){
    const society=makeSociety('unasked'),tree=society.dialogue('odette',{
      studentStrikeWatched:watched,studentStrikeAvailable:false});
    assert.ok(tree.nodes.start.choices.some(c=>c.studentStrikeChoice==='students'));
    for(const node of Object.values(tree.nodes)){
      if(node.goto)assert.ok(tree.nodes[node.goto]);
      for(const c of node.choices||[]){
        assert.ok(tree.nodes[c.goto]);assert.notEqual(c.studentStrike,'watch');assert.notEqual(c.text,'Tell me.');
      }
    }
    const p=presentation(society,{watched,available:false}),c=p.conversation;
    advanceToBranch(c);select(c,watched?'rewatch-unavailable':'students');advanceToBranch(c);
    assert.equal(c.view().nodeId,'strike-unavailable');
    assert.equal(c.view().line.text,'Let the machine finish. Then ask me.');
    assert.equal(p.launches,0);c.stop();society.endDialogue('odette',{completed:false});
    const later=society.beginDialogue('odette',{studentStrikeWatched:watched,studentStrikeAvailable:true});
    assert.ok(watched?later.nodes.start.choices.some(c=>c.studentStrike==='watch'):
      later.nodes['strike-offer'].choices.some(c=>c.studentStrike==='watch'));
    assert.equal(p.launches,0,'availability changing cannot reuse an old choice');
  }
});

test('occupied transport does not remove already learned interpretation questions',()=>{
  const society=makeSociety('declined'),p=presentation(society,{watched:true,available:false}),c=p.conversation;
  advanceToBranch(c);select(c,'students');advanceToBranch(c);
  assert.equal(c.view().nodeId,'strike-questions');
  assert.deepEqual(c.view().pending.options.map(o=>o.studentStrikeChoice),['authority','preservation','leave']);
  select(c,'leave');advanceToBranch(c);
  assert.equal(p.launches,0);assert.equal(society.save().consent,'declined');
});
