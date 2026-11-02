import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';
import {makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(phase){
  const elements=[],node=()=>({gain:{value:1,setValueAtTime(v){this.value=v;},cancelScheduledValues(){},linearRampToValueAtTime(v){this.value=v;}},connect(){},disconnect(){}}),ctx={currentTime:0,state:'running',createGain:node,createMediaElementSource:node,createChannelSplitter:node},out=node();
  const music=createSourceRestScores({getAudio:()=>({ctx,destination:out}),createElement:()=>{
    const events=new Map(),m={currentTime:0,duration:716.4,playbackRate:1,preservesPitch:true,paused:true,ended:false,plays:0,
      play(){this.paused=false;this.plays++;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){},addEventListener(k,fn){events.set(k,fn);},removeEventListener(k){events.delete(k);},emit(k){events.get(k)?.();}};
    Object.defineProperty(m,'src',{set(value){this._src=value;this.duration=String(value).includes('couperin')?843.15712:716.4;},get(){return this._src;}});elements.push(m);return m;
  }});music.selectPhase(phase);
  let endedEvents=0,wall=0;
  function advance(dt=.25,scene=null){
    if(scene){const v=scene.view();music.setRestProgress(scene.restProgress(),true,{decisionHeld:v.restDecisionHeld});}
    else music.setRestProgress(0,false);
    const m=elements.at(-1);ctx.currentTime+=dt;wall+=dt;
    if(m&&!m.paused&&!m.ended){m.currentTime=Math.min(m.duration,m.currentTime+dt*m.playbackRate);if(m.currentTime>=m.duration){m.ended=true;m.paused=true;endedEvents++;m.emit('ended');}}
    music.update({active:true,paused:false});if(scene)scenes.update(dt);
  }
  return{music,elements,advance,get wall(){return wall;},get endedEvents(){return endedEvents;}};
}
function respond(scene){const v=scene.view();if(v.pending&&!v.restReplySelection){const n=v.pending.options.findIndex(o=>o.restAction!=='leave');if(n>=0)scenes.key({key:String(n+1)});}}
test.afterEach(()=>scenes.clear());
for(const [phase,position]of[['wrong-return',0],['wrong-return',400],['wrong-return',700],['catch',0],['catch',550],['catch',840]]){
 test(`${phase} at source${position} retains its complete graph over one real score owner, without replay or a silent terminal lock`,async()=>{
  const f=fixture(phase);f.music.start();await flush();
  for(let i=0;i<8000&&f.music.snapshot().currentTime<position;i++)f.advance();
  const story=sourceRestConversation(phase),seen=new Map(),done=[];scenes.push({id:'source',blocksInput:true,allowsLook:true});
  const s=makeSourceRestConversationScene({phase,getMusicState:()=>f.music.snapshot(),onDone:v=>done.push(v)});scenes.push(s);
  let previous=f.music.snapshot().currentTime;
  for(let i=0;i<8000&&!done.length;i++){
    f.advance(.25,s);const v=s.view(),music=f.music.snapshot();assert.ok(music.currentTime>=previous,'the score never rewinds');previous=music.currentTime;
    if(v.lineSourceId?.startsWith(story.id+':')){const lines=seen.get(v.nodeId)||new Set();lines.add(v.lineSourceId);seen.set(v.nodeId,lines);}
    respond(s);
  }
  assert.deepEqual(done,['commit']);assert.equal(f.elements.length,1);assert.equal(f.elements[0].plays,1);assert.ok(f.endedEvents<=1);assert.equal(f.elements[0].loop,false);
  for(const id of Object.keys(story.cues||{}))assert.ok(seen.has(id),`the ${id} chapter was delivered`);
  for(const[id,lines]of seen)assert.equal(lines.size,story.nodes[id].lines.length,`all chosen ${id} lines were delivered`);
  f.music.dispose();
 });
}
for(const phase of['wrong-return','catch'])test(`${phase} can finish every line after a decision is held beyond the actual last sample`,async()=>{
 const f=fixture(phase);f.music.start();await flush();const done=[],s=makeSourceRestConversationScene({phase,getMusicState:()=>f.music.snapshot(),onDone:v=>done.push(v)});
 scenes.push({id:'source',blocksInput:true,allowsLook:true});scenes.push(s);
 for(let i=0;i<2000&&!s.view().pending;i++)f.advance(.25,s);
 assert.ok(s.view().pending);f.advance(.25,s);const node=s.view().nodeId,progress=s.restProgress();
 for(let i=0;i<8000&&!f.music.snapshot().ended;i++)f.advance(.25,s);
 assert.equal(f.music.snapshot().ended,true);assert.equal(f.endedEvents,1);assert.equal(s.view().nodeId,node);assert.equal(s.restProgress(),progress);assert.deepEqual(done,[]);
 respond(s);
 for(let i=0;i<3000&&!done.length;i++){f.advance(.25,s);respond(s);}
 assert.deepEqual(done,['commit']);assert.equal(f.elements[0].plays,1);assert.equal(f.elements.length,1);f.music.dispose();
});

test('a same-phase return resumes a committed queued reply and unread graph without replaying the approach',async()=>{
 const f=fixture('wrong-return');f.music.start();await flush();const firstDone=[];
 const first=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>f.music.snapshot(),onDone:v=>firstDone.push(v)});
 scenes.push({id:'source',blocksInput:true,allowsLook:true});scenes.push(first);
 for(let i=0;i<2000&&!first.view().pending;i++)f.advance(.25,first);
 respond(first);for(let i=0;i<40&&!first.view().restQueuedReply;i++)f.advance(.25,first);
 assert.ok(first.view().restQueuedReply);const saved=first.checkpoint(),chosen=saved.queuedReply.text;
 scenes.key({key:'e'});assert.deepEqual(firstDone,['leave']);assert.equal(scenes.top().id,'source');
 const beforeWalk=f.music.snapshot().currentTime;for(let i=0;i<800;i++)f.advance();assert.ok(f.music.snapshot().currentTime>beforeWalk);
 const done=[],restored=makeSourceRestConversationScene({phase:'wrong-return',getMusicState:()=>f.music.snapshot(),resumeFrom:saved,onDone:v=>done.push(v)});scenes.push(restored);
 assert.equal(restored.view().nodeId,saved.nodeId);assert.equal(restored.view().restQueuedReply.text,chosen);
 f.advance(.25,restored);assert.equal(restored.view().restTiming.heardSeconds,saved.clock.heardSeconds,'walking did not advance or repeat the conversation');
 let delivered=false;
 for(let i=0;i<8000&&!done.length;i++){
  f.advance(.25,restored);if(restored.view().line?.text===chosen)delivered=true;respond(restored);
 }
 assert.equal(delivered,true);assert.deepEqual(done,['commit']);assert.equal(f.elements.length,1);assert.equal(f.elements[0].plays,1);f.music.dispose();
});
