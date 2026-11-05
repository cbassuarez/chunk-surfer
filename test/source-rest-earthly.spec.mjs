import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';
import {SOURCE_REST_EARTHLY_QUESTION_IDS as QUESTIONS} from '../src/data/source-rest-earthly.js';

test.afterEach(()=>scenes.clear());
const PHASES=['wrong-return','catch'];
const stories=()=>PHASES.flatMap(phase=>[false,true].map(sarahNamed=>({phase,sarahNamed,story:sourceRestConversation(phase,{sarahNamed})})));
const earthly=story=>Object.entries(story.nodes).filter(([id])=>id.startsWith('earthly'));
const text=(node,who)=>node.lines.filter(l=>!who||l.who===who).map(l=>l.text).join(' ');

test('both benches reach one earthly question after their return, inside the lock, and go on to their own last exchange',()=>{
  for(const {phase,story} of stories()){
    const n=story.nodes;
    assert.equal(n.return.next,'earthly',phase);assert.equal(n.earthly.next,'earthly-choice');
    assert.deepEqual(n['earthly-choice'].choices.map(c=>c.id),QUESTIONS);
    for(const choice of n['earthly-choice'].choices){
      const answer=n[choice.next];assert.ok(answer,choice.next);
      assert.equal(answer.lines[0].who,'you');assert.equal(answer.lines[0].text,choice.label,'his reply is delivered exactly as chosen');
      assert.equal(answer.next,'last-choice','one question: every answer goes on to the music, never back to another');
      assert.equal(answer.choices.length,0);
    }
    for(const [id,node] of earthly(story)){
      assert.equal(node.lockExit,true,`${id} is part of the final movement`);assert.equal(node.action,undefined);
      assert.ok(!node.choices.some(c=>c.action),`${id} offers no way to stand or end`);
      for(const l of node.lines){assert.ok(['you','other'].includes(l.who));assert.equal(l.voice,false);assert.equal(l.say,false);}
    }
  }
});

test('the future does not depend on the bench; each bench gets there from its own music',()=>{
  const ii=sourceRestConversation('wrong-return').nodes,iii=sourceRestConversation('catch').nodes;
  for(const id of QUESTIONS)assert.deepEqual(ii[`earthly-${id}`].lines,iii[`earthly-${id}`].lines,id);
  assert.notDeepEqual(ii.earthly.lines,iii.earthly.lines);
  assert.deepEqual(ii['earthly-choice'].lines,iii['earthly-choice'].lines);
});

test('Lyle has a full life, Ellery runs through two centuries of uses, and Sarah is left alone',()=>{
  const n=sourceRestConversation('wrong-return').nodes;
  assert.match(text(n['earthly-lyle'],'other'),/full life/);
  const ellery=text(n['earthly-ellery'],'other');
  for(const use of [/flats/,/offices/,/building with no windows/,/a park/,/houses again/,/Two hundred years/])assert.match(ellery,use);
  const sarah=text(n['earthly-sarah'],'other');
  assert.match(sarah,/not going to tell you/);assert.match(sarah,/has not said I could/);
  assert.doesNotMatch(sarah,/\bshe (?:is|was|will|gets|lives|dies|marries|moves|goes|finds|ends)\b/i,'nothing of her life is given away');
});

test('her name is used only when he gave it at the natatorium, in either bench',()=>{
  for(const {phase,sarahNamed,story} of stories()){
    const label=story.nodes['earthly-choice'].choices.find(c=>c.id==='sarah').label;
    assert.equal(label,sarahNamed?'What happens to Sarah?':'What happens to her?',phase);
    if(!sarahNamed)assert.doesNotMatch(earthly(story).flatMap(([,node])=>[text(node),...node.choices.map(c=>c.label)]).join(' '),/Sarah/);
  }
});

// docs/story-doctrine.md: no line may kill a reading, and the clean run is
// never refuted. Nothing here says whether he lives, dies, stays or drives off.
test('the earthly lines never settle his fate or the other’s nature, and keep the house style',()=>{
  for(const {story} of stories()){
    const script=earthly(story).flatMap(([,node])=>[text(node),...node.choices.map(c=>c.label)]).join(' ');
    assert.doesNotMatch(script,/\b(?:die|dies|died|dying|dead|death|funeral|grave|your body|after you(?:'re| are| were)? gone|without you|drive off|the van|run ends)\b/i);
    assert.doesNotMatch(script,/who (?:are you|is talking)|what (?:are you|do you represent)|HUSH|God|developer/i);
    assert.doesNotMatch(script,/\bhold|\bheld/i);
  }
});

// The fixed-1x fixture of test/source-rest-automatic.spec.mjs: whichever
// question he asks, the final exchange still begins on black, and in Source II
// within the measured major passage of the Chaconne.
const media=(duration,position=0)=>({playing:true,paused:false,protected:false,failed:null,currentTime:position,duration,playedSeconds:position,audibleWallSeconds:position,playbackRate:1,ended:false});
function advance(source,dt){if(source.playing&&!source.paused&&!source.protected){const heard=Math.min(dt,source.duration-source.currentTime);source.playedSeconds+=heard;source.audibleWallSeconds+=heard;source.currentTime+=heard;if(source.currentTime>=source.duration){source.ended=true;source.playing=false;}}scenes.update(dt);}
for(const phase of PHASES)for(const [index,question] of QUESTIONS.entries())test(`${phase}: asking "${question}" still lets the last exchange begin on black`,()=>{
  const source=media(phase==='catch'?843.157125:716.4),done=[],delivered=new Set(),story=sourceRestConversation(phase);
  scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase,getMusicState:()=>source,onDone:value=>done.push(value)});scenes.push(scene);
  let blackNode=null,lastAt=null;
  for(let i=0;i<5000&&!done.length;i++){
    advance(source,.25);const view=scene.view();
    if(view.lineSourceId?.startsWith(`${story.id}:earthly-`))delivered.add(view.nodeId);
    if(blackNode===null&&scene.restProgress()>=.96)blackNode=view.nodeId;
    if(lastAt===null&&view.nodeId==='last'&&!view.lineSourceId?.startsWith('source-rest-cue:'))lastAt=source.currentTime;
    if(view.pending&&!view.restReplySelection){
      const safe=view.pending.options.map((option,n)=>option.restAction==='leave'?-1:n).filter(n=>n>=0);
      scenes.key({key:String((view.nodeId==='earthly-choice'?safe[index]:safe[0])+1)});
    }
  }
  assert.deepEqual(done,['commit']);assert.equal(blackNode,'last');
  assert.deepEqual([...delivered].filter(id=>id!=='earthly-choice'),[`earthly-${question}`],'one answer, and only the one he asked for');
  if(phase==='wrong-return')assert.ok(lastAt>=509.5&&lastAt<=550,`last exchange at ${lastAt}`);
  assert.ok(source.playedSeconds<source.duration,'no second pass of the music');
});
