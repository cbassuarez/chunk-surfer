import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';
import {makeSourceRestConversationScene,SOURCE_REST_REPLY_SECONDS} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestSubtitleLayout} from '../src/render/source-rest-subtitle.js';

test.afterEach(()=>scenes.clear());
function fixture(phase='wrong-return',options={}){
  const duration=phase==='catch'?843.157125:716.4,position=options.position||0,
    media={playing:true,paused:false,protected:false,buffering:false,seeking:false,currentTime:position,
      duration,playedSeconds:position,audibleWallSeconds:position,playbackRate:1,ended:false},chosen=[],lines=[],done=[];
  const world={id:'source',blocksWorld:true,blocksInput:true,allowsLook:true};scenes.push(world);
  const scene=makeSourceRestConversationScene({phase,getMusicState:()=>media,onChoice:v=>chosen.push(v),onLine:v=>lines.push(v),onDone:v=>done.push(v),...options});scenes.push(scene);
  const advance=(dt=.25)=>{
    if(media.playing&&!media.paused&&!media.protected&&!media.buffering&&!media.seeking){
      const seconds=Math.min(dt,media.duration-media.currentTime);media.playedSeconds+=seconds;media.audibleWallSeconds+=seconds;media.currentTime+=seconds;
      if(media.currentTime>=media.duration){media.ended=true;media.playing=false;}
    }
    scenes.update(dt);
  };
  const wait=(predicate,limit=7000)=>{for(let i=0;i<limit&&!predicate();i++)advance();assert.ok(predicate(),'expected live encounter state was reached');};
  const reply=index=>{scenes.key({key:String(index+1)});wait(()=>!scene.view().restReplySelection&&!scene.view().restQueuedReply);};
  return{scene,media,chosen,lines,done,world,advance,wait,reply};
}

test('every optional question is connected to each live chapter before its lock, with distinct later delivery',()=>{
  const earlier=sourceRestConversation('wrong-return'),later=sourceRestConversation('catch');
  for(const story of [earlier,later]){
    const visited=new Set(),queue=[story.entry];
    while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);const node=story.nodes[id];assert.ok(node,id);
      if(node.next)queue.push(node.next);for(const c of node.choices)if(c.next)queue.push(c.next);
    }
    const answers=Object.keys(story.nodes).filter(id=>id.startsWith('question-'));
    assert.equal(answers.length,16);assert.ok(answers.every(id=>visited.has(id)));
    for(const id of [...answers,...Object.keys(story.nodes).filter(id=>id.startsWith('questions-'))]){
      assert.equal(story.nodes[id].lockExit,undefined,'optional asking never creates commitment');
      assert.equal(story.nodes[id].action,undefined,'no question becomes an ending');
    }
    assert.ok(story.nodes['questions-entry'].choices.some(c=>c.action==='leave'));
    for(const group of ['recordings','places','rules','making']){
      const node=story.nodes[`questions-${group}`];assert.equal(node.choices.filter(c=>c.next?.startsWith('question-')).length,4);
      assert.ok(node.choices.some(c=>c.next==='questions-entry'));assert.ok(node.choices.some(c=>c.action==='leave'));
    }
  }
  for(const id of Object.keys(earlier.nodes).filter(id=>id.startsWith('question-'))){
    assert.equal(earlier.nodes[id].lines[0].text,later.nodes[id].lines[0].text,'the same actual question remains available');
    assert.notDeepEqual(earlier.nodes[id].lines.slice(1),later.nodes[id].lines.slice(1),'Source III does not recite the Source II answer');
  }
});

test('an unanswered offer stays neutral; choosing, clearing, changing and leaving are actual runtime actions',()=>{
  const f=fixture();f.wait(()=>!!f.scene.view().pending);f.advance();
  const progress=f.scene.restProgress();for(let i=0;i<200;i++)f.advance();
  assert.equal(f.scene.restProgress(),progress);assert.equal(f.chosen.length,0);assert.equal(f.scene.view().restChoiceTimer.active,false);
  scenes.key({key:'1'});assert.equal(f.scene.view().restReplySelection.index,0);f.advance();
  const remaining=f.scene.view().restReplySelection.remaining;assert.ok(remaining<SOURCE_REST_REPLY_SECONDS);
  scenes.key({key:'2'});assert.equal(f.scene.view().restReplySelection.index,1);assert.equal(f.scene.view().restReplySelection.remaining,SOURCE_REST_REPLY_SECONDS);
  scenes.key({key:'2'});assert.equal(f.scene.view().restReplySelection,null,'same answer unselects without speaking');
  scenes.key({key:'1'});scenes.key({key:'Backspace'});assert.equal(f.scene.view().restReplySelection,null);
  scenes.key({key:'1'});scenes.key({key:'ArrowDown'});assert.equal(f.scene.view().restReplySelection,null,'moving to another answer cancels the old delivery');
  assert.equal(f.chosen.length,0);scenes.key({key:'e'});assert.deepEqual(f.done,['leave']);assert.equal(scenes.top(),f.world);
});

test('the delivery window honors lifecycle protection even if its own decision hold pauses the score',()=>{
  let active=true;
  const f=fixture('wrong-return',{getPresentationActive:()=>active});f.wait(()=>!!f.scene.view().pending);
  scenes.key({key:'2'});f.media.decisionHeld=true;f.media.paused=true;f.media.playing=false;
  for(let i=0;i<12;i++)f.advance();
  const remaining=f.scene.view().restReplySelection.remaining;assert.equal(remaining,5,'presentation advances while the score is intentionally held');
  active=false;for(let i=0;i<20;i++)f.advance();assert.equal(f.scene.view().restReplySelection.remaining,remaining,'pause and focus loss hold the presentation clock');
  active=true;
  for(const flag of ['protected','buffering','seeking']){
    f.media[flag]=true;for(let i=0;i<8;i++)f.advance();assert.equal(f.scene.view().restReplySelection.remaining,remaining,flag);f.media[flag]=false;
  }
  for(let i=0;i<20;i++)f.advance();
  assert.equal(f.scene.view().restReplySelection,null);assert.equal(f.scene.view().restDecisionHeld,false);assert.equal(f.chosen.length,1);
  assert.equal(f.scene.view().restQueuedReply.targetNode,'hear');
  assert.equal(sourceRestSubtitleLayout(f.scene.view()).empty,true,'a waiting delivery gate has no ellipsis, label or empty subtitle plate');
  f.media.paused=false;f.media.playing=true;f.media.decisionHeld=false;f.advance();
  assert.equal(f.scene.view().line.text,'Let me hear it.');assert.equal(f.chosen.length,1);
});

test('a saved selection resumes visibly held at its remaining amount until the player resumes or clears it',()=>{
  const f=fixture();f.wait(()=>!!f.scene.view().pending);scenes.key({key:'2'});
  for(let i=0;i<22;i++)f.advance();
  const saved=f.scene.checkpoint(),remaining=saved.replySelection.remaining;assert.equal(remaining,2.5);assert.equal(f.chosen.length,0);
  scenes.clear();let active=true;
  const resumed=fixture('wrong-return',{position:f.media.currentTime,resumeFrom:saved,getPresentationActive:()=>active});
  resumed.wait(()=>!!resumed.scene.view().pending);
  for(let i=0;i<100;i++)resumed.advance();
  assert.equal(resumed.scene.view().restChoiceTimer.resumeHold,true);assert.equal(resumed.scene.view().restReplySelection.remaining,remaining);assert.equal(resumed.chosen.length,0);
  scenes.key({key:'2'});assert.equal(resumed.scene.view().restChoiceTimer.resumeHold,false);
  for(let i=0;i<9;i++)resumed.advance();assert.equal(resumed.chosen.length,0);resumed.advance();assert.equal(resumed.chosen.length,1);
  assert.equal(resumed.scene.view().restQueuedReply.text,'Let me hear it.');
});

test('both real chapter entries can reach a question, hear its full answer and return to their music',()=>{
  for(const phase of ['wrong-return','catch']){
    scenes.clear();const f=fixture(phase);
    for(let i=0;i<4000&&!(f.scene.view().nodeId==='questions-entry'&&f.scene.view().pending);i++){
      f.advance();const v=f.scene.view();if(v.pending&&!v.restReplySelection)scenes.key({key:String(v.pending.options.findIndex(c=>c.restAction!=='leave')+1)});
    }
    assert.equal(f.scene.view().nodeId,'questions-entry');assert.equal(f.scene.view().restLocked,false);
    f.reply(4);f.wait(()=>f.scene.view().nodeId==='questions-making'&&!!f.scene.view().pending);
    f.reply(3);f.wait(()=>f.scene.view().nodeId==='questions-making'&&!!f.scene.view().pending);
    const answer=sourceRestConversation(phase).nodes['question-making-feeling'];
    for(const line of answer.lines)assert.ok(f.lines.some(delivered=>delivered.text===line.text),line.text);
    f.reply(4);f.wait(()=>f.scene.view().nodeId==='questions-entry'&&!!f.scene.view().pending);
    f.reply(0);
    f.wait(()=>f.scene.view().nodeId===(phase==='catch'?'guitar-etudes':'ornaments'));
    assert.equal(f.scene.view().restLocked,false);assert.equal(f.done.length,0);
  }
});

test('both extended black exchanges deliver every line after natural score end without replay or skipped text',()=>{
  for(const phase of ['wrong-return','catch']){
    scenes.clear();const story=sourceRestConversation(phase),f=fixture(phase,{position:phase==='catch'?841:714}),seen=new Map();
    for(let i=0;i<10000&&!f.done.length;i++){
      f.advance();const v=f.scene.view();
      if(v.nodeId==='last'&&v.lineSourceId?.startsWith(`${story.id}:last:line:`)){
        assert.ok(v.restProgress>=.96);seen.set(v.lineSourceId,v.line.text.replace(/·/g,'.'));
      }
      if(v.pending&&!v.restReplySelection)scenes.key({key:String(v.pending.options.findIndex(c=>c.restAction!=='leave')+1)});
    }
    assert.equal(f.media.currentTime,f.media.duration);assert.equal(f.media.ended,true);assert.deepEqual(f.done,['commit']);
    assert.equal(seen.size,story.nodes.last.lines.length);assert.ok(seen.size>=10);
    assert.deepEqual([...seen.values()],story.nodes.last.lines.map(l=>l.text));
  }
});
