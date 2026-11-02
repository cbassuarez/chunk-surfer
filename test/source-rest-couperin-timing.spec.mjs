import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {createSourceRestClock,SOURCE_REST_BLACK_PROGRESS,SOURCE_REST_CATCH_CLOCK_OPTIONS} from '../src/game/source-rest-pacing.js';
import {makeSourceRestConversationScene} from '../src/game/source-rest-conversation-scene.js';
import {sourceRestConversation} from '../src/data/source-rest-conversation.js';

const fullDuration=843.157120;
const media=(position=0,duration=fullDuration)=>({playing:true,paused:false,protected:false,failed:null,currentTime:position,duration,playedSeconds:position,audibleWallSeconds:position,playbackRate:1,ended:false});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function advance(source,dt=.25){
  if(source.playing&&!source.paused&&!source.protected){const heard=Math.min(dt,source.duration-source.currentTime);source.playedSeconds+=heard;source.audibleWallSeconds+=heard;source.currentTime+=heard;if(source.currentTime>=source.duration){source.ended=true;source.playing=false;}}
  scenes.update(dt);
}
function start(source,options={}){
  const world={id:'source',blocksWorld:true,blocksInput:true,allowsLook:true};scenes.push(world);
  const scene=makeSourceRestConversationScene({phase:'catch',getMusicState:()=>source,...options});scenes.push(scene);
  return{scene,world};
}
function reachFirstChoice(source,scene){
  for(let i=0;i<800&&!scene.view().pending;i++)advance(source);
  assert.equal(scene.view().nodeId,'arrival-choice');assert.equal(scene.view().pending.kind,'branch');
}
test.afterEach(()=>scenes.clear());

test('catch musical cues scale to the actual source duration, leaving Source II fixed defaults intact',()=>{
  for(const duration of [fullDuration,1000]){
    const source=media(0,duration),clock=createSourceRestClock(()=>source,SOURCE_REST_CATCH_CLOCK_OPTIONS);clock.update();
    near(clock.snapshot().untilBlack,duration*.72);near(clock.snapshot().targetPlayhead,duration*.72);
    assert.equal(clock.snapshot().duration,duration);assert.equal(clock.snapshot().cueMode,'preferred');
    source.currentTime=duration*.72;source.playedSeconds=duration*.72;source.audibleWallSeconds=duration*.72;clock.update();
    near(clock.snapshot().progress,SOURCE_REST_BLACK_PROGRESS);
    source.currentTime+=35;source.playedSeconds+=35;source.audibleWallSeconds+=35;clock.update();assert.equal(clock.snapshot().progress,1);
  }
  const source=media(),ordinary=createSourceRestClock(()=>source);ordinary.update();
  assert.equal(ordinary.snapshot().untilBlack,510);near(ordinary.snapshot().targetPlayhead,510);
});

test('catch reserves readable time within the major section or reports a late arrival, without wrapping',()=>{
  for(const [ratio,mode] of [[.15,'within-major'],[.3,'late-arrival'],[.55,'late-arrival']]){
    const source=media(fullDuration*ratio),clock=createSourceRestClock(()=>source,SOURCE_REST_CATCH_CLOCK_OPTIONS);clock.update();
    near(clock.snapshot().untilBlack,fullDuration*.61);assert.equal(clock.snapshot().cueMode,mode);
    assert.ok(clock.snapshot().targetPlayhead>=source.currentTime&&clock.snapshot().targetPlayhead<fullDuration);
  }
});

test('catch clock ignores seeks, pause, buffering and protection; only an explicit audio error uses its own fallback',()=>{
  const source=media(),clock=createSourceRestClock(()=>source,SOURCE_REST_CATCH_CLOCK_OPTIONS);clock.update();
  source.currentTime=600;clock.update(600);assert.equal(clock.snapshot().heardSeconds,0,'a seek does not count as heard music');
  for(const flag of ['paused','protected']){
    source[flag]=true;source.playedSeconds+=10;source.audibleWallSeconds+=10;clock.update(10);assert.equal(clock.snapshot().heardSeconds,0);source[flag]=false;
  }
  source.playing=false;source.loading=true;source.playedSeconds+=10;source.audibleWallSeconds+=10;clock.update(10);assert.equal(clock.snapshot().heardSeconds,0);
  source.playing=true;source.loading=false;source.playedSeconds+=1;source.audibleWallSeconds+=1;clock.update();assert.equal(clock.snapshot().heardSeconds,1);
  const failed=createSourceRestClock(()=>({failed:'unavailable',playing:false}),SOURCE_REST_CATCH_CLOCK_OPTIONS);failed.update(2);
  assert.equal(failed.snapshot().duration,843.157125);near(failed.snapshot().untilBlack,843.157125*.72);
  assert.equal(failed.snapshot().failed,true);assert.equal(failed.snapshot().heardSeconds,2);
  const loading=createSourceRestClock(()=>({playing:false,loading:true}),SOURCE_REST_CATCH_CLOCK_OPTIONS);loading.update(999);
  assert.equal(loading.snapshot().progress,0);assert.equal(loading.snapshot().untilBlack,null);
});

test('catch keeps its selected words undoable before one exact, unvoiced delivery',()=>{
  const source=media(),chosen=[],lines=[],confirms=[];
  const {scene}=start(source,{onChoice:choice=>chosen.push(choice),onLine:line=>lines.push(line),
    audio:{menuConfirm:()=>confirms.push(true),startTyping(){},stopTyping(){}},
    getAudio:()=>{throw Error('Source III uses VFD character sounds, not speech.');}});
  reachFirstChoice(source,scene);
  const option=structuredClone(scene.view().pending.options[1]);scenes.key({key:'2'});
  assert.ok(scene.view().pending);assert.equal(scene.view().restReplySelection.text,option.text);
  assert.equal(scene.view().restReplySelection.contentId,option.contentId);assert.equal(scene.view().restQueuedReply,null);
  assert.equal(chosen.length,0);assert.equal(confirms.length,0);
  const snapshot={progress:scene.restProgress(),serial:scene.view().lineSerial,selection:structuredClone(scene.view().restReplySelection)};
  source.paused=true;source.playing=false;scenes.update(30);
  assert.equal(scene.restProgress(),snapshot.progress);assert.equal(scene.view().lineSerial,snapshot.serial);
  assert.deepEqual(scene.view().restReplySelection,snapshot.selection);
  source.paused=false;source.playing=true;
  for(let i=0;i<100&&(scene.view().restReplySelection||scene.view().restQueuedReply);i++)advance(source);
  assert.equal(scene.view().nodeId,'a-while');assert.equal(scene.view().line.text,option.text);
  assert.equal(scene.view().voice,null);assert.equal(chosen.length,1);assert.equal(confirms.length,1);
  assert.ok(lines.every(line=>!line.voice),'no dialogue callback acquires a speaking voice');
});

test('a held catch offer never invents consent, and early standing clears its queued language once',()=>{
  const source=media(),chosen=[],done=[],{scene,world}=start(source,{onChoice:choice=>chosen.push(choice),onDone:value=>done.push(value)});
  reachFirstChoice(source,scene);advance(source);const progress=scene.restProgress();
  for(let i=0;i<900;i++)advance(source,1);
  assert.equal(scene.restProgress(),progress);assert.equal(scene.view().restDecisionHeld,true);
  assert.equal(scene.view().restLocked,false);assert.equal(scene.view().nodeId,'arrival-choice');assert.equal(chosen.length,0);
  assert.ok(scene.view().pending.options.some(option=>option.text==='Get up.'));
  scenes.key({key:'1'});assert.ok(scene.view().restReplySelection);assert.equal(chosen.length,0);
  scenes.key({key:'e'});assert.deepEqual(done,['leave']);assert.equal(scenes.top(),world);
  assert.equal(scene.view().restQueuedReply,null);assert.equal(scene.allowsLook,true);
  scene.key({key:'Enter'});scene.exit();assert.deepEqual(done,['leave']);
});

test('catch normal and late paths preserve every delivered line, pre-lock interruption and final actual commit',()=>{
  const story=sourceRestConversation('catch');
  for(const startAt of [0,700]){
    scenes.clear();const source=media(startAt),done=[],seen=new Map();let interruptionSeen=false,lockedSeen=false,lastAt=null,pauses=0;
    const {scene}=start(source,{onDone:value=>done.push(value),onPause:()=>pauses++});
    for(let i=0;i<7000&&!done.length;i++){
      advance(source);const view=scene.view();
      if(view.lineSourceId?.startsWith(`${story.id}:`)){
        const lines=seen.get(view.nodeId)||new Set();lines.add(view.lineSourceId);seen.set(view.nodeId,lines);
      }
      if(scene.restInterruption()){
        assert.equal(view.nodeId,'electronics');assert.equal(view.restLocked,false);interruptionSeen=true;
      }
      if(view.restLocked&&!lockedSeen){
        lockedSeen=true;assert.equal(view.nodeId,'revoicing');
        const serial=view.lineSerial,progress=scene.restProgress();scenes.key({key:'Escape'});
        assert.equal(pauses,1);assert.deepEqual(done,[]);assert.equal(scenes.top(),scene);assert.equal(scene.allowsLook,true);
        source.protected=true;scenes.update(20);assert.equal(scene.view().lineSerial,serial);assert.equal(scene.restProgress(),progress);
        source.protected=false;scenes.key({key:'e'});assert.deepEqual(done,[],'later standing is deliberately unavailable');
      }
      if(view.nodeId==='last'&&!view.lineSourceId?.startsWith('source-rest-cue:')&&lastAt===null){
        lastAt=source.playedSeconds;assert.ok(scene.restProgress()>=.96,'last .96 cue remains on black');
      }
      if(view.pending&&!view.restReplySelection){
        const index=view.pending.options.findIndex(option=>option.restAction!=='leave');
        scenes.key({key:String(index+1)});
      }
    }
    assert.equal(interruptionSeen,true);assert.equal(lockedSeen,true);assert.ok(lastAt!==null);assert.deepEqual(done,['commit']);
    assert.ok(source.playedSeconds-startAt<650,'the readable encounter has no added full-track wait');
    for(const [id,lines] of seen)assert.equal(lines.size,story.nodes[id].lines.length,`all authored ${id} lines were delivered`);
    for(const id of Object.keys(story.cues))assert.ok(seen.has(id),`chapter ${id} uses story.cues`);
    scene.exit();assert.deepEqual(done,['commit']);
  }
});

test('a real catch playback failure releases the late lock instead of trapping a silent session',()=>{
  const source=media(),done=[],{scene}=start(source,{onDone:value=>done.push(value)});
  for(let i=0;i<5000&&!scene.view().restLocked;i++){
    advance(source);const options=scene.view().pending?.options;
    if(options&&!scene.view().restReplySelection){const index=options.findIndex(option=>option.restAction!=='leave');scenes.key({key:String(index+1)});}
  }
  assert.equal(scene.view().restLocked,true);
  source.failed='playback failed';source.playing=false;scenes.update(.25);
  assert.equal(scene.view().restLocked,false);assert.equal(scene.view().restTiming.failed,true);
  scenes.key({key:'e'});assert.deepEqual(done,['leave']);
});
