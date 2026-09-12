import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;
globalThis.performance ||= { now: () => Date.now() };

const radio = await import('../src/game/radio.js');
const {
  RADIO_CUES,
  RADIO_PHASE,
  RADIO,
  armDroppedRadioCall,
  activeRadioCue,
  cancelRadioCue,
  consumeRadioCue,
  dropRadio,
  isDead,
  isFailing,
  loadRadioState,
  missPendingRadioCue,
  pendingRadioCue,
  pickUpRadio,
  queueRadioCue,
  radioCallState,
  radioInit,
  radioMilestones,
  radioPhase,
  resetRadioState,
  resolveRadioCue,
  saveRadioState,
  shouldQueuePostSecondTake,
  shouldQueuePreThirdBreakdown,
  tickRadio,
  transmit,
  updateRadioProgression,
} = radio;
const { radioDialogue } = await import('../src/data/radio-script.js');
const { STORY_ART } = await import('../src/game/story-art.js');
const recordist = await import('../src/game/recordist.js');

const target = { roomId:'the_tub', floorId:'ground', reachable:true, unfinished:true, distanceMeters:6 };
const traversal = (overrides = {}) => ({ isTraversal:true, sceneId:'explore', floorId:'ground', completedJobTakes:2, target:{...target}, ...overrides });
function walk(seconds, context = traversal()) {
  for (let i=0;i<seconds*4;i++) updateRadioProgression(.25, context);
}
function hear(id, context = traversal()) {
  assert.equal(queueRadioCue(id, { roomId:id === RADIO_CUES.PRE_THIRD ? context.target.roomId : null }), true);
  assert.equal(consumeRadioCue(context)?.id, id);
  assert.equal(resolveRadioCue(id), true);
}
function initial() { hear(RADIO_CUES.INITIAL); walk(20); }
function warning() { initial(); hear(RADIO_CUES.POST_SECOND); walk(20); }

test('radio transmission count alone does not kill it', () => {
  resetRadioState();
  assert.equal(transmit([]), true);
  assert.equal(transmit([]), true);
  assert.equal(isDead(), false);
});

test('post-second call leaves a reachable failing phase; pre-third kills it', () => {
  resetRadioState();
  initial();
  queueRadioCue(RADIO_CUES.POST_SECOND, { roomId: 'the_tub' });
  const cue = consumeRadioCue(traversal());
  assert.equal(cue.id, RADIO_CUES.POST_SECOND);
  assert.equal(activeRadioCue().id, RADIO_CUES.POST_SECOND);
  assert.equal(isDead(), false);
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(isDead(), false);
  assert.equal(isFailing(), true);
  assert.equal(radioMilestones()[RADIO_CUES.POST_SECOND], true);
  assert.equal(shouldQueuePreThirdBreakdown(traversal()),false,'the warning gets breathing room');
  walk(20);
  assert.equal(shouldQueuePreThirdBreakdown(traversal()),true);
  queueRadioCue(RADIO_CUES.PRE_THIRD,{roomId:'the_tub'});
  consumeRadioCue(traversal());resolveRadioCue(RADIO_CUES.PRE_THIRD);
  assert.equal(isDead(),true);
});

test('warning needs a heard initial checkin, actual job takes, and active traversal breathing room', () => {
  resetRadioState();
  assert.equal(shouldQueuePostSecondTake(traversal()),false,'two jobs cannot skip the initial checkin');
  hear(RADIO_CUES.INITIAL);
  assert.equal(shouldQueuePostSecondTake(traversal()),false);
  walk(19.75);
  assert.equal(shouldQueuePostSecondTake(traversal()),false);
  walk(.25);
  assert.equal(shouldQueuePostSecondTake(traversal({completedJobTakes:1})),false);
  assert.equal(shouldQueuePostSecondTake(traversal({completedJobTakes:undefined,completedTakes:30})),false,'test/listening/foreign takes are not job completion');
  assert.equal(shouldQueuePostSecondTake(traversal()),true);
  queueRadioCue(RADIO_CUES.POST_SECOND);
  consumeRadioCue(traversal());
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(shouldQueuePostSecondTake(traversal()),false);
});

test('pre-third breakdown is unreachable until post-second resolves', () => {
  resetRadioState();
  assert.equal(shouldQueuePreThirdBreakdown(traversal()), false);
  warning();
  assert.equal(shouldQueuePreThirdBreakdown(traversal()), true);
});

test('deployed calls ring in world and miss safely after 24 seconds',()=>{
  resetRadioState();const missed=[],pulses=[];radioInit({missed:(cue)=>missed.push(cue),squelch:(event)=>pulses.push(event)});
  initial();
  assert.equal(dropRadio(10,20,{roomId:'PLANT ROOM',floorId:'basement',now:1000}),true);
  assert.equal(queueRadioCue(RADIO_CUES.POST_SECOND,{now:1100}),true);
  assert.equal(armDroppedRadioCall(1100),false,'queueing at a deployed set arms the call once');
  assert.equal(radioCallState().status,'calling');
  tickRadio(0,{px:0,py:0,now:1100,random:()=>.5});
  assert.equal(pulses.at(-1).dropped,true);
  for(let i=0;i<96;i++)tickRadio(.25,{px:0,py:0,now:1100+(i+1)*250,random:()=>.5});
  assert.equal(missed[0].id,RADIO_CUES.POST_SECOND);
  assert.equal(radioPhase(),RADIO_PHASE.LIVE);
  assert.equal(radioMilestones()[RADIO_CUES.POST_SECOND],false);
  assert.equal(pendingRadioCue(),null);
  assert.equal(armDroppedRadioCall(80000),false);
  tickRadio(0,{now:80000,random:()=>.5});
  assert.equal(missed.length,1,'a missed cue never rings again');
  pickUpRadio(10,20);
  assert.equal(consumeRadioCue(traversal()),null);
  assert.equal(resolveRadioCue(RADIO_CUES.POST_SECOND),false);
});

test('deployment cooldown and fault schedule survive pickup and save/load',()=>{
  resetRadioState();const pulses=[];radioInit({squelch:(event)=>pulses.push(event)});
  dropRadio(8,9,{roomId:'B3',floorId:'basement',now:1000});
  const saved=saveRadioState(1200);
  assert.ok(saved.scheduler.deployCooldownRemainingMs>34000);
  pickUpRadio(8,9);dropRadio(12,13,{roomId:'PLANT',floorId:'basement',now:2000});
  assert.equal(saveRadioState(2000).scheduler.pulseRemainingMs.length,3,'redeploy does not queue another cluster');
  loadRadioState(saved,5000);
  assert.ok(saveRadioState(5000).scheduler.deployCooldownRemainingMs>34000);
});

test('each scheduled pulse emits one semantic acoustic event at the physical radio',()=>{
  resetRadioState();const acoustics=[];
  recordist.setAcousticEmitter((event)=>{acoustics.push(event);return event;});
  dropRadio(14,27,{roomId:'PLANT ROOM',floorId:'basement',now:1000});
  const events=tickRadio(0,{px:90,py:90,now:3500,random:()=>.5});
  assert.equal(events.filter((event)=>event.type==='pulse').length,1);
  assert.equal(acoustics.length,1);
  assert.deepEqual({kind:acoustics[0].kind,x:acoustics[0].x,y:acoustics[0].y,source:acoustics[0].source},
    {kind:'radio_squelch',x:14,y:27,source:{kind:'equipment',id:'radio'}});
  recordist.setAcousticEmitter(null);
});

test('a legacy warning alone cannot manufacture a terminal outcome on load', () => {
  resetRadioState();
  loadRadioState({dead:false,milestones:{[RADIO_CUES.POST_SECOND]:true}});
  assert.equal(isFailing(),true);
  loadRadioState({dead:true,milestones:{[RADIO_CUES.POST_SECOND]:true}});
  assert.equal(isDead(),true,'explicit legacy death remains authoritative');
});

test('radio save/load preserves milestones and pending cue', () => {
  resetRadioState();
  queueRadioCue(RADIO_CUES.POST_SECOND, { roomId: 'the_tub', reason: 'test' });
  const saved = saveRadioState();
  resetRadioState();
  loadRadioState(saved);
  assert.deepEqual(pendingRadioCue(), {
    id: RADIO_CUES.POST_SECOND,
    roomId: 'the_tub',
    reason: 'test',
    queuedAt: saved.pendingCue.queuedAt,
  });
});

test('saving during a carried conversation requeues the cue instead of softlocking it',()=>{
  resetRadioState();initial();queueRadioCue(RADIO_CUES.POST_SECOND,{roomId:'the_tub',reason:'active-save'});consumeRadioCue(traversal());
  const saved=saveRadioState();resetRadioState();loadRadioState(saved);
  assert.equal(pendingRadioCue().id,RADIO_CUES.POST_SECOND);
  assert.equal(activeRadioCue(),null);
  assert.equal(consumeRadioCue(traversal({isSource:true})),null);
  assert.equal(consumeRadioCue(traversal())?.id,RADIO_CUES.POST_SECOND);
});

test('radio keeps one pending cue instead of overwriting it', () => {
  resetRadioState();
  assert.equal(queueRadioCue(RADIO_CUES.POST_SECOND, { reason: 'first' }), true);
  assert.equal(queueRadioCue(RADIO_CUES.PRE_THIRD, { roomId: 'the_tub', reason: 'second' }), false);
  assert.equal(pendingRadioCue().id, RADIO_CUES.POST_SECOND);
  assert.equal(pendingRadioCue().reason, 'first');
});

test('lowering an answered call retires it without claiming its unheard outcome', () => {
  for (const id of [RADIO_CUES.INITIAL,RADIO_CUES.POST_SECOND]) {
    resetRadioState();
    if (id === RADIO_CUES.POST_SECOND) initial();
    queueRadioCue(id);
    assert.equal(consumeRadioCue(traversal())?.id,id);
    assert.equal(cancelRadioCue(id),true);
    assert.equal(radioMilestones()[id],false);
    assert.equal(resolveRadioCue(id),false,'a late completion callback cannot resolve a cancelled cue');
    assert.equal(consumeRadioCue(traversal()),null);
    walk(90,traversal({dialogueOpen:true}));
    assert.equal(consumeRadioCue(traversal()),null,'modal wall time does not restart the call');
    walk(5);
    assert.equal(consumeRadioCue(traversal()),null);
    assert.equal(queueRadioCue(id),false,'lowered calls do not ring again');
    assert.equal(resolveRadioCue(id),false);
  }
});

test('unheard or queued cues cannot be resolved, including either terminal', () => {
  for (const id of Object.values(RADIO_CUES)) {
    resetRadioState();
    assert.equal(resolveRadioCue(id),false);
    queueRadioCue(id);
    assert.equal(resolveRadioCue(id),false);
    assert.equal(radioMilestones()[id],false);
    assert.equal(isDead(),false);
  }
});

test('missed terminal calls stay missed across reload and pickup, without killing the radio', () => {
  for (const id of [RADIO_CUES.PRE_THIRD,RADIO_CUES.HUSH_RUPTURE]) {
    resetRadioState(); warning();
    const missed=[]; radioInit({missed:cue=>missed.push(cue)});
    dropRadio(5,6,{floorId:'ground',now:1000});
    queueRadioCue(id,{roomId:'the_tub',now:1100});
    for(let i=0;i<96;i++)tickRadio(.25,{now:1100+(i+1)*250,random:()=>.5});
    assert.equal(isDead(),false,id);
    assert.equal(radioMilestones()[id],false);
    assert.equal(pendingRadioCue(),null);
    assert.equal(missed.length,1);
    const saved=saveRadioState(26000);
    loadRadioState(saved,90000);
    assert.equal(armDroppedRadioCall(90000),false);
    assert.equal(consumeRadioCue(traversal()),null);
    pickUpRadio(5,6);
    assert.equal(consumeRadioCue(traversal({isRecording:true})),null);
    assert.equal(consumeRadioCue(traversal()),null);
    assert.equal(resolveRadioCue(id,{now:91000}),false);
    assert.equal(isDead(),false);
    assert.equal(resolveRadioCue(id,{now:92000}),false);
    assert.equal(queueRadioCue(id),false);
  }
});

test('saved active terminal scene is resumed, not completed by reload or scene failure', () => {
  resetRadioState(); warning();
  queueRadioCue(RADIO_CUES.PRE_THIRD,{roomId:'the_tub'});
  consumeRadioCue(traversal());
  const saved=saveRadioState();
  loadRadioState(saved);
  assert.equal(isDead(),false);
  assert.equal(activeRadioCue(),null);
  assert.equal(consumeRadioCue(traversal({isSource:true})),null);
  assert.equal(consumeRadioCue(traversal())?.id,RADIO_CUES.PRE_THIRD);
  assert.equal(cancelRadioCue(RADIO_CUES.PRE_THIRD,{reason:'scene-unavailable'}),true);
  assert.equal(isDead(),false);
  walk(5);
  assert.equal(consumeRadioCue(traversal())?.id,RADIO_CUES.PRE_THIRD);
});

test('warning and arm clocks count active traversal, not transport, modal, or stalled wall time', () => {
  resetRadioState(); hear(RADIO_CUES.INITIAL);
  const blocked=['isRecording','isListening','isCombat','isTutorial','isSetup','isEnding','isSource','dialogueOpen','paused'];
  for(const field of blocked)walk(30,traversal({[field]:true}));
  updateRadioProgression(1000,traversal());
  assert.equal(radio.radioGuidanceState().traversal.sinceInitialMs,250,'one stalled frame cannot buy 20 seconds');
  walk(19.75); hear(RADIO_CUES.POST_SECOND);
  for(const field of blocked)walk(30,traversal({[field]:true}));
  assert.equal(shouldQueuePreThirdBreakdown(traversal()),false);
  walk(20);
  assert.equal(radio.armOriginalBreakdown({...traversal(),now:1000}),true);
  assert.equal(radio.originalBreakdownFallbackReady({...traversal(),now:999999}),false);
  for(const field of blocked)walk(30,traversal({[field]:true}));
  assert.equal(radio.originalBreakdownFallbackReady(traversal()),false);
  walk(11.75);
  assert.equal(radio.originalBreakdownFallbackReady(traversal()),false);
  walk(.25);
  assert.equal(radio.originalBreakdownFallbackReady(traversal()),true);
});

test('only an actual reachable unfinished same-floor target can arm, and leaving invalidates the arm', () => {
  resetRadioState(); warning();
  for(const invalid of [null,{...target,floorId:'basement'},{...target,reachable:false},{...target,unfinished:false},{...target,distanceMeters:8.01},{...target,distanceMeters:Infinity}]) {
    const context=traversal({target:invalid});
    assert.equal(shouldQueuePreThirdBreakdown(context),false);
    assert.equal(radio.armOriginalBreakdown(context),false);
  }
  for(const change of [{target:{...target,unfinished:false}},{floorId:'basement'},{target:{...target,distanceMeters:30}},{target:{...target,roomId:'amplifications'}}]) {
    assert.equal(radio.armOriginalBreakdown(traversal()),true);
    walk(6);
    const result=updateRadioProgression(.1,traversal(change));
    assert.equal(result.breakdownReset,true);
    assert.equal(radio.originalBreakdownArmed(),false);
    assert.equal(radio.originalBreakdownFallbackReady(traversal()),false);
  }
  assert.equal(radio.armOriginalBreakdown(traversal()),true);
  assert.equal(radio.radioGuidanceState().originalBreakdown.activeMs,0);
});

test('a pending target-bound terminal is rebuilt instead of hijacking a different or finished room',()=>{
  resetRadioState(); warning();
  radio.armOriginalBreakdown(traversal()); walk(12);
  queueRadioCue(RADIO_CUES.PRE_THIRD,{roomId:'the_tub'});
  assert.equal(consumeRadioCue(traversal({target:{...target,unfinished:false}})),null);
  updateRadioProgression(.1,traversal({target:{...target,unfinished:false}}));
  assert.equal(pendingRadioCue(),null);
  assert.equal(isDead(),false);
  assert.equal(radioMilestones()[RADIO_CUES.PRE_THIRD],false);
  assert.equal(radio.armOriginalBreakdown(traversal({target:{...target,roomId:'amplifications'}})),true);
});

test('radio dialogue trees preserve authored branches and the alternate rupture is terminal', () => {
  assert.ok(STORY_ART.walkie);
  for (const cue of [RADIO_CUES.INITIAL,RADIO_CUES.POST_SECOND,RADIO_CUES.PRE_THIRD]) {
    const nodes = radioDialogue(cue, { roomLabel: 'The Natatorium' });
    assert.ok(nodes.start?.choices?.length >= 2, cue);
    assert.equal(nodes.start.art.id, 'walkie', cue);
    for (const choice of nodes.start.choices) {
      assert.ok(nodes[choice.goto], `${cue}:${choice.goto}`);
      assert.ok(Array.isArray(nodes[choice.goto].lines), `${cue}:${choice.goto}`);
      assert.equal(nodes[choice.goto].choices, undefined, `${cue}:${choice.goto} should terminate`);
    }
  }
  const rupture=radioDialogue(RADIO_CUES.HUSH_RUPTURE,{roomLabel:'The Natatorium'});
  assert.equal(rupture.start.art.id,'walkie');
  assert.equal(rupture.start.choices,undefined);
  assert.equal(rupture.start.goto,'relay');
  assert.equal(rupture.relay.goto,'contact');
  assert.deepEqual(rupture.contact.choices.map(choice=>choice.goto),['reseat','still']);
  for(const branch of ['reseat','still'])assert.equal(rupture[branch].goto,'break');
  assert.equal(rupture.break.goto,'after');
  assert.equal(rupture.after.art.status,'DEAD');
  assert.equal(rupture.after.goto,undefined);
});

test('radio breakdown documents never trigger the generic scream cue',()=>{
  const registry=readFileSync(new URL('../content/audio/audio-project.audio.json',import.meta.url),'utf8');
  const project=JSON.parse(registry);
  const radioTriggers=project.triggers.filter((trigger)=>trigger.event.includes('radio.pre_third_room_breakdown')||trigger.event.includes('radio.hush_help_rupture'));
  assert.equal(radioTriggers.length,0,'scene-local physical stages own terminal audio; prose triggers must not double-fire');
  assert.equal(radioTriggers.some((trigger)=>trigger.cueId==='scream'),false);
  for(const id of ['radio-carrier-open','radio-dry-click','radio-speaker-pop-dead','radio-clipped-return','radio-dead-click','radio-rupture']){
    const cue=project.cues.find((candidate)=>candidate.id===id);
    assert.ok(cue,`${id} exists`);
    assert.ok(cue.layers.every((layer)=>layer.assetId==='asset.game.recorder'||layer.assetId==='asset.game.slides_keys_and_radio'),`${id} uses the equipment bank`);
    assert.notEqual(cue.acoustic?.emitsWorldNoise,true,`${id} cannot alert HUSH before the modal closes`);
  }
});

test('a deployed dead radio cannot open its inspection prose globally',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const open=main.slice(main.indexOf('function openRadio()'),main.indexOf('function radioRuntimeContext'));
  assert.ok(open.indexOf('if(RADIO.isDropped())')<open.indexOf('if(RADIO.isDead())'));
  assert.match(open,/presentRadio\('dead-check'/);
  const tick=main.slice(main.indexOf('function tickRadio(dt)'),main.indexOf('// ── playback',main.indexOf('function tickRadio(dt)')));
  assert.doesNotMatch(tick,/think\(|presentRadio\(/);
});

test('manual radio calls freeze pursuit and release one real acoustic event only on exit',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const manual=main.slice(main.indexOf('function openRadioCallFromBag'),main.indexOf('function radioCueBlocked'));
  assert.match(manual,/presentRadio\(/);
  const radioScene=readFileSync(new URL('../src/game/radio-scene.js',import.meta.url),'utf8');
  assert.match(radioScene,/blocksInput:true,blocksWorld:true/);
  assert.match(manual,/onDone:finish[\s\S]*onCancel:finish/);
  assert.match(manual,/if\(!scene\)finish\(\)/);
  const acoustic=main.slice(main.indexOf('function emitManualRadioCallNoise'),main.indexOf('function openRadioCallFromBag'));
  assert.match(acoustic,/REC\.emitNoise\(\.34,px,py/);
  assert.match(acoustic,/kind:'radio_call'/);
  assert.match(acoustic,/playerGenerated:true[\s\S]*audibleToHush:true/);
  assert.doesNotMatch(manual.slice(0,manual.indexOf('const finish=')),/emitManualRadioCallNoise/,
    'no semantic tracking noise exists before the modal exit gate is created');
});

test('runtime keeps chapel out of Martin choices and observes physical danger incidents',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/TARGETS\.filter\(\(room\)=>room!==['"]lux_nova['"]&&!REC\.hasTake\(room\)\)/);
  assert.match(main,/RADIO\.noteRadioDangerIncident\(\{kind:decision\.kind\}\)/);
});
