import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function actual(name){
 const match=new RegExp('function '+name+'\\([^\\n]*\\)\\{').exec(source);assert.ok(match,name);
 const start=match.index,open=start+match[0].lastIndexOf('{');let depth=0;
 for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}
 throw Error('Unclosed '+name);
}
const names=['onPresenceCatch','offerHushSoundTarget','tickHushNoisePerception','tickPresence'];
function fixture(){
 const state={recording:true,stalled:true},calls=[],trap=name=>()=>{calls.push(name);throw Error('Unexpected '+name);},
  h={REC:{isRecording:()=>state.recording,isStalled:()=>state.stalled,isSlating:()=>false,isAssistPaused:()=>false},performance:{now:()=>123},
   elleryCaughtOwner:null,roomMicRunConsent:false,micCheckActive:()=>false,resetElleryCaughtExposure:()=>{},
   paused:false,gameplayInputLifecycleActive:()=>true,scenes:{blocksInput:()=>false,worldView:()=>null},
   activeBattleId:null,takenActive:false,lastExposureEvent:null,escape:null,activeEndingCutscene:null,
   hushRunActive:false,doorRevealCutscene:false,buildingLoadPromise:null,getInTutorialOwner:null,
   takeRoom:null,currentWorld:()=> 'the_tub',LEVEL_CHECK_ROOM:'level-check',firstB3MinuteIsHis:()=>false,chapelTapeRetakeRoom:()=>null,
   MONITOR:{monitorSnapshot:()=>{calls.push('live-meter');return{hushDb:-35};}},monitorExposureSnapshot:null,
   PRES:{pendingContactAttempt:()=>null,presenceTableauActive:()=>{calls.push('ordinary-catch-gate');return true;},offerSoundTarget:offer=>{calls.push('ordinary-offer');return offer;}},
   basementWatcherConfinement:()=>null,inBasementSpace:()=>false,usingStairAnomaly:()=>false,storyMode:false,
   hushActiveForPlayer:trap('noise-decision'),noteMeterDivergence:trap('divergence'),hushContactApproach:trap('catch'),
   updateHushNoisePerception:trap('belief-step')};
 vm.createContext(h);vm.runInContext(names.map(actual).join('\n'),h);return{h,state,calls};
}
test('an authored recording HOLD blocks every ordinary HUSH movement, noise-target and catch owner',()=>{
 const{h,calls}=fixture();
 assert.equal(h.onPresenceCatch({id:'queued-contact'},{forced:true}),false);
 assert.equal(h.offerHushSoundTarget({position:{x:1,y:2}}),false);
 for(let i=0;i<100;i++){h.tickPresence(.2);h.tickHushNoisePerception(.2);}
 assert.equal(calls.filter(x=>x==='live-meter').length,100,'the visible physical meter may still observe its real input');
 assert.equal(calls.some(x=>x!=='live-meter'),false,'no movement, belief, stored target or queued forced catch is processed');
});
test('only a currently recording instrument HOLD receives protection; resume preserves ordinary owners',()=>{
 for(const change of[{recording:false},{stalled:false}]){
  const{h,state,calls}=fixture();Object.assign(state,change);
  const offer={position:{x:4,y:7}};assert.equal(h.offerHushSoundTarget(offer),offer);
  assert.equal(h.onPresenceCatch({}),false);assert.ok(calls.includes('ordinary-catch-gate'));
  h.PRES.presenceTableauActive=()=>false;
  assert.throws(()=>h.tickHushNoisePerception(.1),/noise-decision/,'resumption hands control back to the existing perception owner');
 }
});
