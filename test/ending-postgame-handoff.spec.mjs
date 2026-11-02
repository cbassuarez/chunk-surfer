import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {makeCreditsScene} from '../src/game/credits.js';
import {makeReturnReportScene} from '../src/game/return-report.js';
import {normalizeEndingExposure} from '../src/game/last-exposure-state.js';
import {tapeQualifies,CAUSAL_INJURY_CEILING} from '../src/causal/tape.js';
import {causalRecorder} from '../src/causal/recorder.js';

class MemoryStorage{
  map=new Map();
  getItem(key){return this.map.get(key)??null;}
  setItem(key,value){this.map.set(key,String(value));}
  removeItem(key){this.map.delete(key);}
  clear(){this.map.clear();}
}
globalThis.localStorage=new MemoryStorage();
const SAVE=await import('../src/game/save.js');
const PROGRESS=await import('../src/progression/runtime.js');
const {finalizeCausalReturn}=await import('../src/progression/causal-progression.js');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const block=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,start);return main.slice(a,b);};
const noop=()=>{};

function host({quiet=true,injuries=CAUSAL_INJURY_CEILING+1}={}){
  scenes.clear();globalThis.localStorage.clear();SAVE.saveLoad();
  SAVE.newGame({preset:'contract',now:1000});PROGRESS.beginRunProgression();
  const summary=PROGRESS.commitReturn('contact-lost',{endingVariant:quiet?'source-rest':null,
    endingArrival:'rested',rec:{takes:[],injuries}},5000);
  const log=[],creditOptions=[];
  const owner={active:true,ended:false,playing:true,snapshot(){return{active:this.active,ended:this.ended,
    playing:this.playing,currentTime:520,duration:716.397868};},stop(){this.active=false;this.playing=false;log.push('music-stop');},dispose(){log.push('music-dispose');}};
  const h={scenes,paused:false,focused:true,document:{hidden:false},sourceRestEndingMusic:quiet?owner:null,
    gameplayInputLifecycleActive:()=>h.focused&&!h.document.hidden,
    endingStaticMix:{finish:()=>log.push('static-finish'),reset:()=>log.push('static-reset')},
    windowChoreography:{credits:()=>Promise.resolve(),finishReturn:()=>Promise.resolve()},
    makeCreditsScene:options=>{creditOptions.push(options);return makeCreditsScene({...options,
      credits:[],soundtrack:{startSoundtrack:noop,fadeSoundtrack:noop}});},
    makeReturnReportScene:options=>{log.push('report');return makeReturnReportScene(options);},
    STORY:{fadeSoundtrack:noop,stopAll:noop,startTapeHiss:()=>log.push('hiss'),startMenuHiss:()=>log.push('hiss')},CUES:{stopAllCues:noop},TAKE_HISS:{min:.1},
    ensureCtx:noop,emitProgress:noop,EVENT_TYPES:{CREDITS_VIEWED:'credits'},openExternalUrl:noop,APP_LINKS:{website:''},
    getSave:SAVE.getSave,getMeta:SAVE.getMeta,normalizeEndingExposure,tapeQualifies,structuredClone,
    // Post-game presentation must not await these genuinely unresolved saves.
    saveGameQueued:()=>new Promise(()=>{}),saveProfileQueued:()=>new Promise(()=>{}),
    returnSectionImages:()=>[],returnToTitle:()=>{log.push('title');scenes.replace({id:'title'});},
    beginNewGameFlow:()=>log.push('new-game'),openTransferRoom:noop,openArchive:noop,
    uiDraw:draw=>draw({ctx:{canvas:{width:1,height:1},save:noop,restore:noop,fillRect:()=>log.push('black-frame')}}),
  };
  vm.createContext(h);vm.runInContext(
    block('function releaseSourceRestEndingMusic(','const sourceContinuationTrace=[];')+
    block('function presentCredits({','async function revealFieldReturn(')+
    block('function showReturnReport(summary){','function startMatchedFrontEndPromotion('),h);
  return{h,summary,owner,log,creditOptions,open(){h.openEndingCredits(summary,{sourceRestBlack:quiet});},
    black(){return scenes.top();},skipCredits(){scenes.key({key:'Escape',code:'Escape',repeat:false});}};
}
test.afterEach(()=>scenes.clear());

test('the real Source credits host reaches the same persisted post-game report and title without a restart',()=>{
  const t=host();
  assert.equal(SAVE.getSave().run.status,'return-committed');
  assert.equal(SAVE.getSave().run.pendingReturn.summaryId,t.summary.id);
  assert.equal(PROGRESS.pendingReturnReport().id,t.summary.id);
  assert.ok(SAVE.getMeta().returns.history.every(id=>typeof id==='string'),'use the real persisted summary-ID history');
  t.open();t.skipCredits();const black=t.black();assert.equal(black.id,'source-rest-final-black');
  black.update(3.99);assert.equal(t.log.includes('report'),false);black.update(.02);
  const report=scenes.top();assert.equal(report.id,'return-report');assert.equal(report.view().saveStatus,'saving');
  assert.equal(t.log.filter(e=>e==='report').length,1);
  assert.ok(t.log.indexOf('music-dispose')<t.log.indexOf('report'));
  assert.equal(PROGRESS.pendingReturnReport().id,t.summary.id,'showing a report does not silently acknowledge it');
  // A fresh process sees a durable record, not a promise from the old scene.
  SAVE.saveLoad();assert.equal(PROGRESS.pendingReturnReport().id,t.summary.id);
  report.update(3);report.key({key:'Enter'});assert.equal(scenes.top().id,'title');
  assert.equal(SAVE.getSave().run.status,'complete');assert.equal(SAVE.getSave().run.pendingReturn,null);
  assert.equal(PROGRESS.pendingReturnReport(),null);
  SAVE.saveLoad();assert.equal(PROGRESS.pendingReturnReport(),null,'the acknowledged return cannot reopen on next launch');
  black.update(100);black.key({code:'Enter'});t.creditOptions[0].onDone();
  assert.equal(t.log.filter(e=>e==='report').length,1,'late or duplicate callbacks cannot replace the title');
});

test('the real finite handoff holds focus/visibility/pause and fresh input can deliberately leave it',()=>{
  const t=host();t.open();t.skipCredits();const black=t.black();black.update(.1);
  black.key({key:'Enter',repeat:true});black.key({key:'Enter'});assert.equal(scenes.top(),black,'entry key cannot consume the black immediately');
  t.h.paused=true;black.update(100);t.h.paused=false;t.h.focused=false;black.update(100);
  t.h.focused=true;t.h.document.hidden=true;black.update(100);assert.equal(scenes.top(),black);
  t.h.document.hidden=false;black.update(.1);black.key({controllerAction:'confirm'});
  assert.equal(scenes.top().id,'return-report');assert.equal(t.log.filter(e=>e==='report').length,1);
});

test('removing a black presenter cancels its delayed report while preserving crash recovery',()=>{
  const t=host();t.open();t.skipCredits();const black=t.black();
  scenes.replace({id:'another-owner'});black.update(100);black.pointer({type:'pointerup'});
  assert.equal(scenes.top().id,'another-owner');assert.equal(t.log.includes('report'),false);
  assert.equal(t.log.filter(e=>e==='music-dispose').length,1);
  SAVE.saveLoad();assert.equal(PROGRESS.pendingReturnReport().id,t.summary.id);
});

test('ordinary ending credits still hand directly to their report and consume the queue through a real action',()=>{
  const t=host({quiet:false});t.open();t.skipCredits();
  const report=scenes.top();assert.equal(report.id,'return-report');assert.ok(t.log.includes('hiss'));
  assert.equal(t.log.includes('music-stop'),false);report.update(3);report.key({key:'Enter'});
  assert.equal(scenes.top().id,'title');assert.equal(PROGRESS.pendingReturnReport(),null);
});

test('an unavailable qualifying HUSH capture cannot prevent the post-game scene or keep its actions locked after failure',async()=>{
  const t=host({injuries:0});t.open();t.skipCredits();t.black().update(4);
  const report=scenes.top();assert.equal(report.id,'return-report');assert.equal(report.view().stage,'residue');
  // This isolated run has no causal recording. Exercise the actual failure
  // path, rather than inventing a successful tape or blocking on disk I/O.
  const result=await finalizeCausalReturn(t.summary);assert.equal(result.ok,false);
  report.update(3);assert.equal(report.view().stage,'residue');report.key({key:'Enter'});
  assert.equal(scenes.top().id,'title');assert.equal(PROGRESS.pendingReturnReport(),null);
});

test('a genuinely unresolved causal filing cannot hold the actual ending host or its title action hostage',async()=>{
  const t=host({injuries:0}),original=causalRecorder.finalize;
  let calls=0,settled=false;
  causalRecorder.finalize=()=>{calls++;return new Promise(()=>{});};
  let filing;
  try{filing=finalizeCausalReturn(t.summary);}finally{causalRecorder.finalize=original;}
  void filing.then(()=>{settled=true;});
  assert.equal(calls,1);assert.equal(SAVE.getMeta().returns.records[t.summary.id].causalTape.status,'filing');
  const achievements=structuredClone(SAVE.getMeta().achievements);
  t.open();t.skipCredits();t.black().update(4);
  const report=scenes.top();assert.equal(report.id,'return-report');assert.equal(report.view().stage,'residue');
  report.update(3);report.key({key:'Enter'});
  assert.equal(scenes.top().id,'title');assert.equal(PROGRESS.pendingReturnReport(),null);
  assert.equal(SAVE.getSave().run.status,'complete');assert.equal(settled,false);
  assert.equal(SAVE.getMeta().returns.records[t.summary.id].endingId,t.summary.endingId);
  assert.equal(SAVE.getMeta().returns.records[t.summary.id].causalTape.status,'filing');
  assert.deepEqual(SAVE.getMeta().achievements,achievements,'presenting and acknowledging the report cannot invent delayed awards');
});
