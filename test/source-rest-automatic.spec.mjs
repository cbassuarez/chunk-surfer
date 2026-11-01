import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {createSourceRestClock,SOURCE_REST_BLACK_PROGRESS} from '../src/game/source-rest-pacing.js';
import {makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';

test.afterEach(()=>scenes.clear());
const media=(position=0)=>({playing:true,paused:false,protected:false,failed:null,currentTime:position,duration:716.4,playedSeconds:position});
function advance(source,dt){if(source.playing&&!source.paused&&!source.protected){source.playedSeconds+=dt;source.currentTime=(source.currentTime+dt)%source.duration;}scenes.update(dt);}
function respond(scene){const view=scene.view();if(view.pending){const index=view.pending.options.findIndex(option=>option.restAction!=='leave');scenes.key({key:String(index+1)});}}

test('the black cue follows the real performance, including a late arrival and a pause',()=>{
  const source=media(140),clock=createSourceRestClock(()=>source);
  clock.update();assert.equal(clock.snapshot().untilBlack,435,'a late listener never waits another full pass');
  assert.equal(clock.snapshot().cueMode,'late-arrival');
  source.paused=true;source.playing=false;source.playedSeconds+=20;clock.update(20);
  assert.equal(clock.snapshot().heardSeconds,0,'neither pause nor an advanced wall clock moves the scene');
  source.paused=false;source.playing=true;source.playedSeconds+=clock.snapshot().untilBlack;
  source.currentTime=575;clock.update();
  assert.ok(Math.abs(clock.snapshot().progress-SOURCE_REST_BLACK_PROGRESS)<1e-9);
});

test('words and choices arrive automatically; early departure works but input cannot hurry them',()=>{
  const source=media(),outcomes=[];
  const world={id:'source',blocksWorld:true,blocksInput:true,allowsLook:true};scenes.push(world);
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value)});scenes.push(scene);
  for(let i=0;i<8;i++)advance(source,.25);
  const before=scene.view();scenes.key({key:' '});scenes.key({key:'Enter'});
  assert.equal(scene.view().lineSerial,before.lineSerial,'continue keys cannot advance the timed dialogue');
  assert.ok(scene.restProgress()>0);scenes.key({key:'Escape'});
  assert.deepEqual(outcomes,['leave']);assert.equal(scenes.top(),world);
});

test('the interruption occurs before the locked passage; the final music dialogue starts on black',()=>{
  const source=media(),outcomes=[],seen=[];
  scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value)});scenes.push(scene);
  let faultSeen=false,lockedSeen=false,finalSeen=false;
  for(let i=0;i<3500&&scenes.has(scene.id);i++){
    advance(source,.25);const view=scene.view();
    respond(scene);
    if(scene.restInterruption())faultSeen=true;
    if(view.restLocked&&!lockedSeen){lockedSeen=true;const current=view.nodeId;scenes.key({key:'Escape'});
      assert.equal(scenes.top(),scene,'Escape cannot dismiss the locked part');assert.equal(scene.view().nodeId,current);}
    if(view.nodeId==='last'&&!view.lineSourceId?.startsWith('source-rest-cue:')&&!finalSeen){finalSeen=true;
      assert.ok(scene.restProgress()>=.96,'the last musical exchange is on black');
      assert.ok(source.currentTime>=509.5&&source.currentTime<=515,'black is tied to the measured passage');}
    if(!seen.includes(view.nodeId))seen.push(view.nodeId);
  }
  assert.ok(faultSeen,'the first breakdown precedes the choice to stay');
  assert.ok(lockedSeen);assert.ok(finalSeen,`last section reached; visited ${seen.join(', ')}`);
  assert.deepEqual(outcomes,['commit']);
});

test('a response commits immediately once, closes its choices and is delivered only at its musical window',()=>{
  const source=media(),chosen=[],confirmations=[];scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onChoice:choice=>chosen.push(choice),
    audio:{menuConfirm:()=>confirmations.push('confirm')}});scenes.push(scene);
  for(let i=0;i<800&&!(scene.view().nodeId==='first-choice'&&scene.view().pending);i++)advance(source,.25);
  assert.equal(scene.view().nodeId,'first-choice');assert.ok(scene.view().pending);
  const exact=scene.view().pending.options[1].text;scenes.key({key:'ArrowDown'});scenes.key({key:'Enter'});
  assert.equal(scene.view().pending,null,'the ordinary choice closes immediately');
  assert.equal(scene.view().restQueuedReply.text,exact);assert.equal(scene.view().line.text,'','the reply has not been spoken early');
  assert.equal(chosen.length,1);assert.equal(confirmations.length,1);
  scenes.key({key:'1'});scenes.key({key:'Enter'});assert.equal(scene.view().restQueuedReply.text,exact,'later input cannot revise a committed reply');
  assert.equal(chosen.length,1);assert.equal(confirmations.length,1);
  const progress=scene.restProgress(),serial=scene.view().lineSerial;
  source.paused=true;source.playing=false;scenes.update(20);
  assert.equal(scene.restProgress(),progress);assert.equal(scene.view().lineSerial,serial);
  source.paused=false;source.playing=true;
  for(let i=0;i<24;i++)advance(source,.25);
  assert.ok(scene.view().restQueuedReply,'the selected words wait for their delivery window');
  for(let i=0;i<30&&scene.view().restQueuedReply;i++)advance(source,.25);
  assert.equal(scene.view().nodeId,'hear','the selected language is used at the scheduled moment');
  assert.equal(scene.view().restQueuedReply,null);assert.equal(chosen.length,1);
});

test('ordinary offers wait for the player and a queued reply is cancelled cleanly on exit',()=>{
  const source=media(),chosen=[],outcomes=[];scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onChoice:choice=>chosen.push(choice),onDone:value=>outcomes.push(value)});scenes.push(scene);
  for(let i=0;i<800&&!(scene.view().nodeId==='first-choice'&&scene.view().pending);i++)advance(source,.25);
  advance(source,.25);const p=scene.restProgress();
  for(let i=0;i<1000;i++)advance(source,.25);
  assert.equal(scene.view().nodeId,'first-choice');assert.ok(scene.view().pending);assert.equal(scene.restProgress(),p);
  assert.equal(chosen.length,0,'silence does not invent a response');
  scenes.key({key:'2'});assert.equal(chosen.length,1);assert.ok(scene.view().restQueuedReply);
  scenes.key({key:'Escape'});assert.deepEqual(outcomes,['leave']);assert.equal(scene.view().restQueuedReply,null);
  for(let i=0;i<40;i++)advance(source,.25);
  assert.equal(chosen.length,1);assert.deepEqual(outcomes,['leave']);
});

test('a paraphrased branch delivers the exact chosen words once before its authored continuation',()=>{
  const source=media(),lines=[];scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onLine:line=>lines.push(line)});scenes.push(scene);
  for(let i=0;i<800&&!(scene.view().nodeId==='first-choice'&&scene.view().pending);i++)advance(source,.25);
  const exact=scene.view().pending.options[0].text;scenes.key({key:'Enter'});
  assert.equal(scene.view().restQueuedReply.text,exact);
  for(let i=0;i<40&&scene.view().restQueuedReply;i++)advance(source,.25);
  assert.equal(scene.view().line.text,exact,'the queued language becomes the spoken text at delivery');
  assert.equal(scene.view().who,'me');
  for(let i=0;i<40&&scene.view().line.text===exact;i++)advance(source,.25);
  assert.equal(scene.view().nodeId,'remember');assert.notEqual(scene.view().line.text,exact,'the continuation does not immediately repeat it');
});

test('the player can leave during the first interruption',()=>{
  const source=media(),outcomes=[];scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value)});scenes.push(scene);
  for(let i=0;i<1200&&!(scene.view().nodeId==='interruption'&&scene.view().pending);i++){
    advance(source,.25);if(scene.view().nodeId!=='interruption')respond(scene);
  }
  assert.equal(scene.view().nodeId,'interruption');
  const index=scene.view().pending.options.findIndex(item=>item.restAction==='leave');assert.ok(index>=0);
  scenes.key({key:String(index+1)});assert.deepEqual(outcomes,['leave']);
});

test('the first interruption never supplies consent, and a delayed response keeps a complete readable ending',()=>{
  const source=media();let result=null;scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>{result=value;}});scenes.push(scene);
  for(let i=0;i<1200&&!(scene.view().nodeId==='interruption'&&scene.view().pending);i++){
    advance(source,.25);if(scene.view().nodeId!=='interruption')respond(scene);
  }
  advance(source,.25);const progress=scene.restProgress(),time=source.currentTime;
  for(let i=0;i<1600;i++)advance(source,.25);
  assert.equal(scene.view().nodeId,'interruption');assert.equal(scene.restProgress(),progress);
  assert.equal(scene.view().restLocked,false);assert.ok(source.currentTime!==time,'the recording continues while the choice is open');
  scenes.key({key:'2'});assert.equal(scene.view().pending,null);assert.equal(scene.view().restQueuedReply.targetNode,'after-interruption');
  assert.equal(scene.view().restTiming.cueMode,'late-arrival');
  for(let i=0;i<2400&&result===null;i++){advance(source,.25);respond(scene);}
  assert.equal(result,'commit');
});

test('a real audio failure reopens escape even after the quiet lock',()=>{
  const source=media(),outcomes=[];scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value)});scenes.push(scene);
  for(let i=0;i<3000&&!scene.view().restLocked;i++){
    advance(source,.25);respond(scene);
  }
  assert.equal(scene.view().restLocked,true);source.failed='playback failed';source.playing=false;scenes.update(.1);
  assert.equal(scene.view().restLocked,false);scenes.key({key:'Escape'});assert.deepEqual(outcomes,['leave']);
});

test('Escape offers ordinary pause after the late lock without standing or cancelling its scene',()=>{
  const source=media(),outcomes=[];let pauses=0;scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value),onPause:()=>pauses++});scenes.push(scene);
  for(let i=0;i<3000&&!scene.view().restLocked;i++){advance(source,.25);respond(scene);}
  assert.equal(scene.view().restLocked,true);scenes.key({key:'Escape'});
  assert.equal(pauses,1);assert.deepEqual(outcomes,[]);assert.equal(scenes.top(),scene);
});

test('native pause is available before the lock while interact offers a separate way to stand',()=>{
  const source=media(),outcomes=[];let pauses=0;scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:value=>outcomes.push(value),onPause:()=>pauses++});scenes.push(scene);
  for(let i=0;i<8;i++)advance(source,.25);
  assert.equal(scene.view().restCanLeave,true);scenes.key({key:'Escape'});
  assert.equal(pauses,1);assert.deepEqual(outcomes,[]);assert.equal(scenes.top(),scene);
  scenes.key({key:'e'});assert.deepEqual(outcomes,['leave']);assert.equal(scene.view().restCanLeave,false);
});

test('late sitting hears the complete graph without waiting for an extra musical pass',()=>{
  const source=media(140);let finished=false,blackNode=null,finalTime=null;const seen=new Set();
  scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
  const scene=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>source,onDone:()=>{finished=true;}});scenes.push(scene);
  for(let i=0;i<6000&&!finished;i++){
    advance(source,.25);const view=scene.view();seen.add(view.nodeId);
    respond(scene);
    if(blackNode===null&&scene.restProgress()>=.96)blackNode=view.nodeId;
    if(finalTime===null&&view.nodeId==='last'&&!view.lineSourceId?.startsWith('source-rest-cue:'))finalTime=source.currentTime;
  }
  for(const node of ['arrival','interruption','ornaments','organ','voice','distance','return','last'])assert.ok(seen.has(node),node);
  assert.equal(blackNode,'last');assert.ok(finalTime>=570&&finalTime<600);assert.ok(finished);
  assert.ok(source.playedSeconds-140<500,'the whole late encounter is bounded to its readable length');
});

test('all response combinations and both naming states preserve their lines at the shortest eligible lead',()=>{
  for(let mask=0;mask<256;mask++){
    scenes.clear();const source=media(74.75);let finished=false,selected='',branch=0,blackNode=null;
    const seen=new Map();scenes.push({id:'source',blocksWorld:true,blocksInput:true,allowsLook:true});
    const story=sourceRestConversation('wrong-return',{sarahNamed:mask>=128});
    const scene=makeSourceRestConversationScene({phase:'wrong-return',story,getMusicState:()=>source,onDone:()=>{finished=true;}});scenes.push(scene);
    for(let i=0;i<2200&&!finished;i++){
      advance(source,.25);const view=scene.view();
      if(view.lineSourceId?.startsWith(`${story.id}:`)){
        const lines=seen.get(view.nodeId)||new Set();lines.add(view.lineSourceId);seen.set(view.nodeId,lines);
      }
      if(view.pending&&selected!==view.nodeId){selected=view.nodeId;
        const safe=view.pending.options.map((option,index)=>option.restAction==='leave'?-1:index).filter(index=>index>=0);
        const index=safe[(mask>>branch++)%safe.length];scenes.key({key:String(index+1)});
      }
      if(blackNode===null&&scene.restProgress()>=.96)blackNode=view.nodeId;
    }
    assert.equal(blackNode,'last',`response mask ${mask} reached black on ${blackNode}`);
    assert.ok(finished,`response mask ${mask} completes`);
    for(const [id,lines] of seen)assert.equal(lines.size,story.nodes[id].lines.length,`response mask ${mask}: all ${id} lines`);
  }
});
