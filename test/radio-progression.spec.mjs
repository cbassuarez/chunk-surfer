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
} = radio;
const { radioDialogue } = await import('../src/data/radio-script.js');
const { STORY_ART } = await import('../src/game/story-art.js');
const recordist = await import('../src/game/recordist.js');

test('radio transmission count alone does not kill it', () => {
  resetRadioState();
  assert.equal(transmit([]), true);
  assert.equal(transmit([]), true);
  assert.equal(isDead(), false);
});

test('post-second call leaves a reachable failing phase; pre-third kills it', () => {
  resetRadioState();
  queueRadioCue(RADIO_CUES.POST_SECOND, { roomId: 'the_tub' });
  const cue = consumeRadioCue();
  assert.equal(cue.id, RADIO_CUES.POST_SECOND);
  assert.equal(activeRadioCue().id, RADIO_CUES.POST_SECOND);
  assert.equal(isDead(), false);
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(isDead(), false);
  assert.equal(isFailing(), true);
  assert.equal(radioMilestones()[RADIO_CUES.POST_SECOND], true);
  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes:2,nearestRoom:'the_tub',distanceMeters:8,thresholdMeters:8,
  }),true);
  queueRadioCue(RADIO_CUES.PRE_THIRD,{roomId:'the_tub'});
  consumeRadioCue();resolveRadioCue(RADIO_CUES.PRE_THIRD);
  assert.equal(isDead(),true);
});

test('post-second warning becomes eligible after any second completed recording', () => {
  resetRadioState();
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 1 }), false);
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 2 }), true);
  queueRadioCue(RADIO_CUES.POST_SECOND);
  consumeRadioCue();
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(shouldQueuePostSecondTake({ completedTakes: 2 }), false);
});

test('pre-third breakdown is unreachable until post-second resolves', () => {
  resetRadioState();
  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes: 2,
    nearestRoom: 'amplifications',
    distanceMeters: 1,
  }), false);

  queueRadioCue(RADIO_CUES.POST_SECOND);
  consumeRadioCue();
  resolveRadioCue(RADIO_CUES.POST_SECOND);
  assert.equal(shouldQueuePreThirdBreakdown({
    completedTakes: 2,
    nearestRoom: 'amplifications',
    distanceMeters: 8,
    thresholdMeters: 8,
  }), true);
});

test('deployed calls ring in world and miss safely after 24 seconds',()=>{
  resetRadioState();const missed=[],pulses=[];radioInit({missed:(cue)=>missed.push(cue),squelch:(event)=>pulses.push(event)});
  assert.equal(dropRadio(10,20,{roomId:'PLANT ROOM',floorId:'basement',now:1000}),true);
  assert.equal(queueRadioCue(RADIO_CUES.POST_SECOND,{now:1100}),true);
  assert.equal(armDroppedRadioCall(1100),false,'queueing at a deployed set arms the call once');
  assert.equal(radioCallState().status,'calling');
  tickRadio(0,{px:0,py:0,now:1100,random:()=>.5});
  assert.equal(pulses.at(-1).dropped,true);
  tickRadio(0,{px:0,py:0,now:25101,random:()=>.5});
  assert.equal(missed[0].id,RADIO_CUES.POST_SECOND);
  assert.equal(radioPhase(),RADIO_PHASE.FAILING);
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

test('loading an earlier post-second save migrates the radio to dead', () => {
  resetRadioState();
  loadRadioState({dead:false,milestones:{[RADIO_CUES.POST_SECOND]:true}});
  assert.equal(isDead(),true);
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
  resetRadioState();queueRadioCue(RADIO_CUES.POST_SECOND,{roomId:'the_tub',reason:'active-save'});consumeRadioCue();
  const saved=saveRadioState();resetRadioState();loadRadioState(saved);
  assert.equal(pendingRadioCue().id,RADIO_CUES.POST_SECOND);
  assert.equal(activeRadioCue(),null);
});

test('radio keeps one pending cue instead of overwriting it', () => {
  resetRadioState();
  assert.equal(queueRadioCue(RADIO_CUES.POST_SECOND, { reason: 'first' }), true);
  assert.equal(queueRadioCue(RADIO_CUES.PRE_THIRD, { roomId: 'the_tub', reason: 'second' }), false);
  assert.equal(pendingRadioCue().id, RADIO_CUES.POST_SECOND);
  assert.equal(pendingRadioCue().reason, 'first');
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
  assert.ok(rupture.start.lines.length>=5);
  assert.equal(rupture.start.lines.at(-1).cue,'radio-rupture');
});

test('radio breakdown documents never trigger the generic scream cue',()=>{
  const registry=readFileSync(new URL('../content/audio/audio-project.audio.json',import.meta.url),'utf8');
  const project=JSON.parse(registry);
  const radioTriggers=project.triggers.filter((trigger)=>trigger.event.includes('radio.pre_third_room_breakdown')||trigger.event.includes('radio.hush_help_rupture'));
  assert.ok(radioTriggers.length>=8);
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
  assert.match(main,/RADIO\.isDead\(\) && !RADIO\.isDropped\(\).*thoughtHad\('radio-dead'\)/);
});

test('manual radio calls freeze pursuit and release one real acoustic event only on exit',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const manual=main.slice(main.indexOf('function openRadioCallFromBag'),main.indexOf('function radioCueBlocked'));
  assert.match(manual,/blocksWorld:true/);
  assert.match(manual,/onDone:finish[\s\S]*onCancel:finish/);
  assert.match(manual,/if\(!scene\)finish\(\)/);
  const acoustic=main.slice(main.indexOf('function emitManualRadioCallNoise'),main.indexOf('function openRadioCallFromBag'));
  assert.match(acoustic,/REC\.emitNoise\(\.34,px,py/);
  assert.match(acoustic,/kind:'radio_call'/);
  assert.match(acoustic,/playerGenerated:true[\s\S]*audibleToHush:true/);
  assert.doesNotMatch(manual.slice(0,manual.indexOf('const finish=')),/emitManualRadioCallNoise/,
    'no semantic tracking noise exists before the modal exit gate is created');
});

test('runtime arms the original breakdown, preserves a 12-second fallback, and keeps chapel out of Martin choices',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/TARGETS\.filter\(\(room\)=>room!==['"]lux_nova['"]&&!REC\.hasTake\(room\)\)/);
  assert.match(main,/RADIO\.armOriginalBreakdown\(\{roomId:target\.roomId\}\)/);
  assert.match(main,/RADIO\.originalBreakdownFallbackReady\(\)/);
  assert.match(main,/reason:'approaching-third-room-fallback',entry:'inbound'/);
  assert.match(main,/RADIO\.noteRadioDangerIncident\(\{kind:decision\.kind\}\)/);
});
