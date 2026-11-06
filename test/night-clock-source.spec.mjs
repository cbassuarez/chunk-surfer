import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as N from '../src/game/night-clock.js';
import * as D from '../src/game/night-deadline.js';
import {START_MIN,clockString,takeStamp} from '../src/game/clock.js';
import {NAVIGATOR_CLOCK_BLANK,NAVIGATOR_CLOCK_BLINK_MS,navigatorClockState,paintNavigatorClock} from '../src/render/navigator-clock.js';
import {beginFaceplateModuleState,faceplateUsesCurrentRunModules} from '../src/render/faceplate-module-state.js';
import {SIX_NOTHINGNESS,sixBlinkLit} from '../src/data/six-nothingness.js';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const readingAt=seconds=>clockString(START_MIN+Math.floor(seconds/60));
const main=file('src/main.js');
const body=name=>{const at=main.indexOf(`function ${name}(`);assert.ok(at>=0,name);return main.slice(at,main.indexOf('\n}\n',at)+3);};
const runId='clock-test';

test('the two fixed hours are the ones asked for',()=>{
  assert.equal(readingAt(N.NIGHT_CLOCK_SOURCE_EXIT_SECONDS),'05:38');
  assert.equal(readingAt(D.NIGHT_DEADLINE_SECONDS),'06:01');
  assert.equal(readingAt(D.NIGHT_DEADLINE_SECONDS-1),'06:00','the minute before it still reads 06:00');
});

test('nothing moves the clock while Source holds it, and the readout has no digits',()=>{
  const entered=N.advanceNightClock(N.freshNightClock(),3600,{rate:1});
  let clock=N.holdNightClockForSource(entered,true);
  for(let i=0;i<600;i++)clock=N.holdNightClockForSource(N.advanceNightClock(clock,0,{rate:3}),true);
  assert.equal(clock.elapsedSeconds,3600);
  const readout=N.nightClockReadout({nightClock:clock});
  assert.equal(readout.value,'  :  ');assert.equal(readout.value,NAVIGATOR_CLOCK_BLANK);assert.equal(readout.blank,true);assert.equal(readout.approximate,false);
  assert.equal(N.normalizeNightClock(JSON.parse(JSON.stringify(clock))).sourceHeld,true,'a reload in Source stays held');
  const walkedOut=N.holdNightClockForSource(clock,false);
  assert.equal(walkedOut.sourceHeld,undefined);assert.equal(N.nightClockReadout({nightClock:walkedOut}).value,'22:38','any other way out resumes where it stopped');
  assert.deepEqual(N.freshNightClock(),N.normalizeNightClock(N.freshNightClock()),'an ordinary clock carries no Source marks');
});

test('leaving for the chapel or tower sets 05:38 once, from before or after it',()=>{
  for(const elapsedSeconds of[0,3600,N.NIGHT_CLOCK_SOURCE_EXIT_SECONDS+1200]){
    const {clock,applied}=N.leaveSourceNightClock(N.holdNightClockForSource(N.freshNightClock({elapsedSeconds}),true));
    assert.equal(applied,true);assert.equal(readingAt(clock.elapsedSeconds),'05:38');assert.equal(clock.priorUnmeasured,false);
    const later={...clock,elapsedSeconds:clock.elapsedSeconds+600},again=N.leaveSourceNightClock(N.normalizeNightClock(JSON.parse(JSON.stringify(later))));
    assert.equal(again.applied,false,'a reload past the door cannot wind the night back');assert.equal(again.clock.elapsedSeconds,later.elapsedSeconds);
  }
  assert.equal(N.applyNightClockLoss(N.freshNightClock(),0,'wake:in-source').applied,false,'no lost time is charged in Source');
  assert.match(body('wakeUp'),/nightClockHeldBySource\(\)\?0:minutes\*60/);
});

test('the deadline stays armed across the jump: 06:00 passes and 06:01 strikes',()=>{
  const input={runId,runActive:true,workOrderAccepted:true,active:true,safeBoundary:true,assetsReady:true,region:'ellery',entryPose:{yaw:0}};
  let state=D.stepNightDeadline(D.freshNightDeadline({runId}),{...input,elapsedSeconds:3600}).state;
  state=D.nightDeadlineSourceReturn(state,{runId,elapsedSeconds:N.NIGHT_CLOCK_SOURCE_EXIT_SECONDS,clock:'05:38',message:'It is 05:38. Demolition begins at 06:00.'});
  const effects=D.nightDeadlinePendingEffects(state);
  assert.deepEqual(effects.map(e=>e.key),['source-return'],'one line with the true hour, not every warning crossed at once');
  assert.ok(state.warnings.some(w=>w.key==='site-closure')&&state.warnings.some(w=>w.key==='last-call'),'crossed warnings are entered as given');
  state=D.acknowledgeNightDeadlineEffects(state,effects.map(e=>e.id));
  let step=D.stepNightDeadline(state,{...input,elapsedSeconds:N.NIGHT_CLOCK_SOURCE_EXIT_SECONDS});
  assert.deepEqual(step.events,[],'nothing fires a second time at the door');
  step=D.stepNightDeadline(step.state,{...input,elapsedSeconds:29520});
  assert.deepEqual(step.events.map(e=>e.key),['clearance'],'the 05:50 warning is still ahead of the player');
  step=D.stepNightDeadline(step.state,{...input,elapsedSeconds:D.NIGHT_DEADLINE_SECONDS-1});
  assert.deepEqual(step.events.map(e=>e.key),['first-horn'],'the hour sounds the horn');
  assert.equal(D.nightDeadlinePending(step.state),false,'but nothing comes down at 06:00 itself');
  step=D.stepNightDeadline(step.state,{...input,elapsedSeconds:D.NIGHT_DEADLINE_SECONDS});
  assert.equal(step.state.phase,'pending');assert.equal(step.state.crossedAtElapsed,D.NIGHT_DEADLINE_SECONDS);
  for(const phase of['pending','presenting','terminal','superseded']){
    const held={...D.freshNightDeadline({runId}),phase};
    assert.equal(D.nightDeadlineSourceReturn(held,{runId,elapsedSeconds:N.NIGHT_CLOCK_SOURCE_EXIT_SECONDS}).phase,phase,phase+' is never reopened by the door');
  }
  assert.match(body('leaveSourceNightState'),/nightDeadlinePending\(save\.nightDeadline\)/);
});

test('the digits blink back for a few seconds, then hold',()=>{
  const left=N.leaveSourceNightClock(N.freshNightClock({elapsedSeconds:3600})).clock;
  const at=extra=>N.nightClockReadout({nightClock:{...left,elapsedSeconds:left.elapsedSeconds+extra}});
  assert.equal(at(0).value,'05:38');assert.equal(at(0).settling,true);assert.equal(at(N.NIGHT_CLOCK_SOURCE_SETTLE_SECONDS-.01).settling,true);
  assert.equal(at(N.NIGHT_CLOCK_SOURCE_SETTLE_SECONDS).settling,undefined,'then it is an ordinary clock');
  assert.equal(N.NIGHT_CLOCK_SOURCE_SETTLE_SECONDS/N.NIGHT_CLOCK_PACE_POLICY.finalStretchRate,6);
  const lit=navigatorClockState(at(0),{now:100}),dark=navigatorClockState(at(0),{now:100+NAVIGATOR_CLOCK_BLINK_MS/2});
  assert.equal(lit.digitsLit,true);assert.equal(lit.text,'05:38');assert.equal(dark.digitsLit,false);assert.equal(dark.text,'  :  ');
  const calls=now=>{const list=[],ctx=new Proxy({globalAlpha:1},{get:(t,k)=>k in t?t[k]:(...a)=>{list.push(k);return{width:0};},set:(t,k,v)=>{t[k]=v;return true;}});paintNavigatorClock(ctx,{x:0,y:0,w:40,h:3},at(0),{now,identity:false});return list.length;};
  assert.ok(calls(100)>calls(600),'the digits are really drawn on the lit half only');
  assert.equal(navigatorClockState({value:'05:38'}).settling,undefined);
  assert.deepEqual(navigatorClockState({value:'05:38',approximate:false}),{value:'05:38',approximate:false,text:'05:38',qualifier:''},'an ordinary reading is untouched');
});

test('tapes made in Source carry no time, and ordinary tapes keep theirs',()=>{
  const held=N.captureNightClock(N.holdNightClockForSource(N.freshNightClock({elapsedSeconds:3600}),true));
  assert.equal(held.sourceHeld,true);assert.equal(takeStamp(0,{captured:held}),'  :  ');assert.equal(takeStamp(3,{captured:N.normalizeNightCapture(JSON.parse(JSON.stringify(held)))}),'  :  ');
  const plain=N.captureNightClock(N.freshNightClock({elapsedSeconds:3600}));
  assert.equal(plain.sourceHeld,undefined);assert.deepEqual(Object.keys(plain),['schema','elapsedSeconds','priorUnmeasured']);assert.notEqual(takeStamp(0,{captured:plain}),'  :  ');
});

test('a finale that has taken over stops the clock at 06:00',()=>{
  const near=N.freshNightClock({elapsedSeconds:D.NIGHT_DEADLINE_SECONDS-2}),limit=D.NIGHT_DEADLINE_SECONDS-1;
  const stopped=N.advanceNightClock(near,600,{rate:3,limit});
  assert.equal(stopped.elapsedSeconds,limit);assert.equal(readingAt(stopped.elapsedSeconds),'06:00');
  assert.ok(N.advanceNightClock(near,600,{rate:3}).elapsedSeconds>limit,'an ordinary night runs on to the strike');
  assert.match(body('tickRunPlayDuration'),/phase==='superseded'\?NIGHT_DEADLINE_SECONDS-1:undefined/);
});

test('both roads into the building set the hour, and the bell fight commits the tower road',()=>{
  for(const name of['beginChapelFromHorizon','beginSourceTowerTransition'])assert.match(body(name),/saveCommit\(\{[^}]*\.\.\.leaveSourceNightState\(\)\}\)/,name);
  const committed=body('nightDeadlineCommitted');
  assert.match(committed,/SOURCE_FINALE_STAGE\.CATHEDRAL_FIGHT,SOURCE_FINALE_STAGE\.TOWER_ESCAPE/);
  assert.doesNotMatch(committed,/SOURCE_FINALE_STAGE\.CATHEDRAL[,\]]/,'walking the cathedral before the fight is still on the clock');
  const held=body('nightClockHeldBySource');
  for(const owner of['usingSourceSpace()','sourceContinuationScene','sourcePubScene','sourceDriveSession','coastalMemoryScene','standingTearScene','sourceReturnFlashbackScene','sourceReturnFlashbackPending'])
    assert.ok(held.includes(owner),owner+' holds the clock');
});

test('the display drops its digits and blinks only the colon',()=>{
  const lit=navigatorClockState({value:'  :  '},{now:100}),dark=navigatorClockState({value:'  :  '},{now:100+NAVIGATOR_CLOCK_BLINK_MS/2});
  assert.equal(lit.blank,true);assert.equal(lit.colonLit,true);assert.equal(lit.text,'  :  ');
  assert.equal(dark.colonLit,false);assert.equal(dark.text,'     ');
  assert.equal(navigatorClockState({value:'  :  '},{now:100+NAVIGATOR_CLOCK_BLINK_MS}).colonLit,true,'one second, on for half of it');
  for(const value of[' :  ','  : ','  ;  ','--:--'])assert.equal(navigatorClockState({value}),null);
  assert.equal(navigatorClockState({value:'05:38'}).blank,undefined);
  const plate=readout=>beginFaceplateModuleState({enabled:true,runId:'clock-test',scope:'current',sceneId:'game',nightClock:readout},{cols:120,rows:40}).context.nightClock;
  assert.deepEqual(plate({value:'  :  ',blank:true}),{value:'  :  ',blank:true},'the faceplate lets the blank reading through');
  assert.deepEqual(plate({value:'05:38'}),{value:'05:38'});assert.equal(plate({value:'??:??'}),null);
  const draws=now=>{
    const calls=[],ctx=new Proxy({globalAlpha:1},{get:(t,k)=>k in t?t[k]:(...a)=>{calls.push([String(k),...a]);return{width:0};},set:(t,k,v)=>{t[k]=v;return true;}});
    const painted=paintNavigatorClock(ctx,{x:0,y:0,w:40,h:3},{value:'  :  '},{now,identity:false});
    return{painted,rects:calls.length};
  };
  const on=draws(100),off=draws(600);
  assert.ok(on.painted&&off.painted);assert.ok(on.rects>off.rects,'the colon is really drawn on the lit half and not on the dark half');
  const digits=paintNavigatorClock(new Proxy({globalAlpha:1},{get:(t,k)=>k in t?t[k]:()=>({width:0}),set:(t,k,v)=>{t[k]=v;return true;}}),{x:0,y:0,w:40,h:3},{value:'05:38'},{now:100,identity:false});
  assert.equal(digits.state.value,'05:38');
});

test('in Source the FN-12 comes up with the raised recorder, and the corners stay empty',()=>{
  assert.equal(faceplateUsesCurrentRunModules({id:'recorder'}),true,'raising the deck is how the blank clock is read');
  assert.doesNotMatch(body('drawSourceHud'),/nightClock|drawNavigatorClock/,'THE CORNERS ARE EMPTY');
});

test('the 3D blinking 6:00 scene owes nothing to any of this',()=>{
  // Its own blink, at its own cadence, on its own scene clock.
  assert.deepEqual({...SIX_NOTHINGNESS.blink},{period:1,lit:.56});
  assert.equal(sixBlinkLit(10.1),true);assert.equal(sixBlinkLit(10.8),false);assert.equal(sixBlinkLit(10.8,{reducedMotion:true}),true);
  for(const path of['src/data/six-nothingness.js','src/game/six-nothingness-scene.js','src/render/six-nothingness-frame.js','src/render/six-nothingness-models.js','src/render/six-nothingness-renderer.js','src/game/six-loop.js']){
    const source=file(path);
    assert.doesNotMatch(source,/night-clock|night-deadline|navigator-clock|nightClock|nightDeadline|NIGHT_DEADLINE|elapsedSeconds/,path+' reads no night time');
  }
  // It borrows the first-strike slot, which is why the deadline stands aside for
  // it. The Source hold must not claim that slot or the scene would blank its clock.
  assert.match(main,/const sixNothingnessScene=\(\)=>firstStrikeScene\?\.id==='six-nothingness'\?firstStrikeScene:null;/);
  assert.doesNotMatch(body('nightClockHeldBySource').replace(/\/\/.*$/gm,''),/firstStrikeScene|sixNothingness|sixLoop/);
  assert.match(body('tickNightDeadline'),/if\(firstStrikeScene\)return;/);
});
