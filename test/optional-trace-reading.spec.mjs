import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {makeThoughtScene,loadThoughtState,saveThoughtState,thoughtHad,markThought,resetThoughts} from '../src/game/thoughts.js';
import {PRACTICE_TRACES,practiceTraceByHost,practiceTraceNode} from '../src/game/practice-seams.js';
import {runtimeTree} from '../src/narrative/runtime-content.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name,end,env){const at=source.indexOf(`function ${name}(`),to=source.indexOf(end,at);assert.ok(at>=0&&to>at);return new Function('env',`with(env){return (${source.slice(at,to).trim()});}`)(env);}
function harness({flags={},had=['post-door','talisman.seen'],noThink=false}={}){
  scenes.clear();resetThoughts();loadThoughtState({had});const commits=[];
  const env={storyMode:true,planName:'conservatory',NO_THINK:noThink,scenes,PRACTICE_TRACES,practiceTraceByHost,practiceTraceNode,
    PRACTICE_TRACE_STORY:runtimeTree('practice-wing.traces'),thoughtHad,markThought,loadThoughtState,saveThoughtState,
    flagGet:id=>flags[id],flagSet:(id,value)=>{flags[id]=value;},getSave:()=>({flags}),saveCommit:p=>commits.push(structuredClone(p)),
    ensureCtx(){},STORY:null,actx:null,dialogGain:null,master:null,CR:{fx:null},fireCue(){},createReplayService:()=>null,applyStoryChoice(){},makeThoughtScene};
  env.think=production('think','\n// A repeatable dialog beat',env);
  return{open:production('openPracticeTrace','\nfunction dropRadioFromBag',env),flags,commits,
    cancel(){scenes.top()?.key({key:'Escape'});},
    finish(){for(let i=0;i<80&&scenes.top();i++){scenes.top().key({key:'Enter'});scenes.update(.1);}assert.equal(scenes.depth(),0);},
    cleanup(){scenes.clear();resetThoughts();}};
}
test('opening and cancelling an unread piano band consumes neither text nor completion',()=>{
  const h=harness();try{
    assert.equal(h.open('practice-piano-3'),true);
    assert.equal(Number(h.flags['practice.trace.tuning-log'])||0,0,'opening is not completed reading');
    h.cancel();assert.equal(thoughtHad('practice-trace.tuning-log.b0'),false,'Escape permits the same text again');
    assert.deepEqual(saveThoughtState().had,['post-door','talisman.seen']);
    assert.equal(h.open('practice-piano-3'),true);assert.equal(scenes.top().view().nodeId,'tuning-log.b0');
  }finally{h.cleanup();}
});
test('the actual completed conversation advances one band exactly once and preserves cross-host pacing',()=>{
  const h=harness();try{
    h.open('practice-piano-3');h.finish();assert.equal(h.flags['practice.trace.tuning-log'],1);
    assert.equal(h.open('practice-piano-3'),false,'no new band until another host has actually been read');
    h.open('practice-piano-1');h.finish();assert.equal(h.open('practice-piano-3'),true);
    assert.equal(scenes.top().view().nodeId,'tuning-log.b1');h.cancel();
    assert.equal(h.flags['practice.trace.tuning-log'],1);assert.equal(h.open('practice-piano-3'),true);
    h.finish();assert.equal(h.flags['practice.trace.tuning-log'],2);
  }finally{h.cleanup();}
});
test('a saved open receipt without its completion resumes the same band after a real thought-store load',()=>{
  const h=harness({had:['post-door','practice-trace.marks.b0']});try{
    assert.equal(h.open('practice-piano-1'),true,'saved interruption cannot strand a band');
    assert.equal(scenes.top().view().nodeId,'marks.b0');h.cancel();
    const durable=h.commits.at(-1).thoughts;assert.deepEqual(durable.had,['post-door']);
    loadThoughtState(durable);assert.equal(h.open('practice-piano-1'),true);h.finish();
    assert.equal(h.flags['practice.trace.marks'],1);
  }finally{h.cleanup();}
});
test('suppressed or non-trace interactions leave receipts and counts unchanged',()=>{
  const had=['post-door','practice-trace.marks.b0'];const h=harness({had,noThink:true});try{
    assert.equal(h.open('practice-piano-1'),false);assert.equal(h.open('practice-piano-2'),false);
    assert.deepEqual(saveThoughtState().had,had);assert.deepEqual(h.flags,{});
  }finally{h.cleanup();}
});
