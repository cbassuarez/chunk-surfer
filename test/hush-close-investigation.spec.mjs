// Real ordinary-HUSH state, gait and navigation at the staged B3 wall.
// This is deterministic source-level simulation, not a native visual claim.
import assert from 'node:assert/strict';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';
import { createHushAudioRuntime } from '../src/game/hush-audio-runtime.js';
import { emitAcousticEvent, resetAcousticEventsForTest, setAcousticClock } from '../src/audio/acoustic-events.js';

globalThis.document ||= { title:'Chunk Surfer', baseURI:'http://localhost/' };
globalThis.window ||= globalThis;
const realPerformance = globalThis.performance, realRandom = Math.random;
let now = 3000;
globalThis.performance = { now:()=>now };
Math.random = () => .05;
const HUSH = await import('../src/game/presence.js');
const blocked = new Set(['50,23','51,23','50,26','51,26','52,26','52,27','52,28','52,29']);
const open = (x,y) => !blocked.has(`${Math.floor(x)},${Math.floor(y)}`);
const navigation = createPresenceNavigation({
  isSolid:(x,y)=>!open(x,y), canOccupy:open,
  canStep:(_x,_y,x,y)=>({ok:open(x,y)}), planSize:()=>({w:100,h:100}),
});
const tick = (seconds, player={x:49,y:23}, options={}) => {
  for (let i=0;i<Math.round(seconds/.05);i++) {
    now+=50;
    HUSH.updatePresence(.05,player.x,player.y,()=>{}, {navigation,deferContact:true,...options});
    assert.ok(navigation.isWalkable({x:HUSH.presenceState().x,y:HUSH.presenceState().y}));
  }
};
const setup = (overrides={}) => {
  now=3000; HUSH.loadPresenceState({}); HUSH.spawnAtCell(52,25,{gaitSeed:418});
  const event={position:{x:52.5,y:20.5},level:.79,confidence:.95,priority:.65,
    expiresAt:now+3840,reason:'ACOUSTIC_EVENT',...overrides};
  assert.equal(HUSH.offerSoundTarget(event),true);
  return HUSH.presenceState();
};

try {
  let actor=setup();
  const actualBelief={x:actor.targetX,y:actor.targetY};
  assert.equal(actor.targetMemorySec,14);
  tick(8);
  assert.equal(actor.hasTarget,true,'a nearby clear impact remains remembered while its gait approaches');
  assert.deepEqual({x:actor.targetX,y:actor.targetY},{x:52,y:20},'navigation resolves the uncertain heard location, not the player');
  assert.notDeepEqual(actualBelief,{x:49,y:23});
  tick(5);
  assert.ok(actor.y<23,`the selected ordinary route crosses the opening; y=${actor.y}`);
  assert.equal(actor.caughtCount,0,'the wall-side pass is not contact');
  tick(5);
  assert.equal(actor.hasTarget,false,'bounded memory expires; it cannot tether the threat to the player');
  assert.equal(actor.targetReason,'ACOUSTIC_EVENT');

  actor=setup();
  const realTorch={active:true,position:{x:49,y:23},level:.3,confidence:.38,occlusionDb:0};
  let sawHumWindow=false;
  for(let i=0;i<260;i++){
    now+=50;
    HUSH.updatePresence(.05,49,23,()=>{},{navigation,deferContact:true,lightSound:realTorch});
    if(now>6840)sawHumWindow=true;
    assert.equal(actor.targetReason,'ACOUSTIC_EVENT','periodic weak hum does not redirect the moving investigation');
  }
  assert.ok(sawHumWindow&&actor.y<23,'normal gait carries the investigated sound past the opening even with repeated torch sampling');

  actor=setup({reason:'PLAYER_NOISE_CLUE'});
  assert.equal(actor.targetMemorySec,0,'player-noise clues keep their old duration');
  tick(8);
  assert.equal(actor.hasTarget,false);

  actor=setup({level:.4});
  assert.equal(actor.targetMemorySec,0,'weak sounds keep their old duration');
  actor=setup({position:{x:52.5,y:16.5}});
  assert.equal(actor.targetMemorySec,0,'distant sounds keep their old duration');

  actor=setup();
  now+=100;
  assert.equal(HUSH.offerSoundTarget({position:{x:55,y:25},level:.2,confidence:.3,priority:.3,expiresAt:now+1000}),false,
    'the original priority window still protects the clue');
  now+=4000;
  const hum=()=>HUSH.offerSoundTarget({position:{x:55,y:25},level:.2,confidence:.3,priority:.28,expiresAt:now+1000,reason:'FLASHLIGHT_ELECTRICAL_HUM'});
  assert.equal(hum(),false,'the weak hum cannot interrupt the clearly heard close event while the body approaches');
  assert.equal(actor.targetReason,'ACOUSTIC_EVENT');
  assert.equal(HUSH.offerSoundTarget({position:{x:55,y:25},level:.8,confidence:.8,priority:.65,expiresAt:now+1000,reason:'NEW_SOUND'}),true,
    'an equal-priority new sound can still interrupt');
  assert.equal(actor.targetMemorySec,0,'the replacement does not inherit long memory');

  actor=setup();now+=4000;actor.gait.blocked=true;
  assert.equal(hum(),true,'a blocked body can attend to the hum');
  actor=setup();now+=4000;actor.gait.phase='recover';
  assert.equal(hum(),true,'an interrupted gait can attend to the hum');
  actor=setup();now+=4000;actor.x=actor.targetX;actor.y=actor.targetY;
  assert.equal(hum(),true,'arrival lets it attend to the hum immediately');
  actor=setup();now+=15000;
  assert.equal(hum(),true,'after the bounded memory expires hum is heard normally');
  actor=setup();now+=4000;actor.nextLightListenAt=0;
  const lightSound={active:true,position:{x:55,y:25},level:.3,confidence:.38,occlusionDb:0};
  HUSH.updatePresence(0,49,23,()=>{},{navigation,deferContact:true,lightSound});
  assert.equal(actor.targetReason,'ACOUSTIC_EVENT','real periodic torch sensing respects the remembered approach');
  now+=11000;actor.nextLightListenAt=0;
  HUSH.updatePresence(0,49,23,()=>{},{navigation,deferContact:true,lightSound});
  assert.equal(actor.targetReason,'FLASHLIGHT_ELECTRICAL_HUM','periodic torch sensing resumes after the approach expires');

  actor=setup();now+=4000;actor.x=49;actor.y=23;actor.spawnedAt=0;actor.lastCatchAt=-100000;
  let touched=false;
  HUSH.updatePresence(0,49,23,()=>{touched=true;},{navigation,deferContact:true});
  assert.equal(touched,true,'physical contact can still interrupt');
  assert.equal(actor.hasTarget,false);
  assert.equal(hum(),true,'contact releases the remembered investigation');

  actor=setup();
  const captured=HUSH.capturePresenceTableauState(now);
  assert.equal(HUSH.beginPresenceTableau({x:52,y:25,snapshot:captured})!==null,true);
  now+=2000; HUSH.endPresenceTableau();
  assert.equal(actor.targetMemorySec,14,'borrowed tableau restores the sound memory');

  actor=setup();
  tick(8,{x:49,y:23},{catchMode:'source-checkpoint',suppressContact:true});
  assert.equal(actor.hasTarget,false,'Source retains its old memory limit');

  // A real door_close semantic event traverses the real hearing runtime before
  // Presence receives its offer. Values exercise the B3 service-door geometry;
  // rendering, actual occlusion and audible playback still need native proof.
  resetAcousticEventsForTest();setAcousticClock(()=>now);
  const eventTrial = ({room='b2',listenerRoom='b2',kind='door_close',player=false,position={x:51,y:25},occlusion=0}={}) => {
    now=3000;HUSH.loadPresenceState({});HUSH.spawnAtCell(52,21,{gaitSeed:418});
    const runtime=createHushAudioRuntime({
      presence:{publicSnapshot:()=>({...HUSH.publicSnapshot(),roomId:listenerRoom,floorId:'basement'}),offerSoundTarget:HUSH.offerSoundTarget},
      playerSpatial:()=>({roomId:'b3',floorId:'basement',position:{x:49,y:23}}),
      occlusionDb:()=>occlusion,difficulty:()=>({values:{presencePressure:'standard'}}),
      clock:()=>now,random:()=>.05,
    });
    emitAcousticEvent({kind,source:{kind:player?'player':'environment',id:'door:b3-b2-service'},
      spatial:{roomId:room,floorId:'basement',position},
      semantics:{playerGenerated:player,audibleToHush:true}});
    const event={state:{...HUSH.presenceState()},propagation:runtime.snapshot().lastPropagation};
    runtime.destroy();return event;
  };
  let event=eventTrial();
  assert.equal(event.state.targetReason,'ACOUSTIC_EVENT','same-room auto-closing door reaches the real sound pathway');
  assert.equal(event.state.targetMemorySec,14,'clearly heard near door close meets the threshold');
  assert.ok(event.propagation.effectiveLevelDb<-24&&event.propagation.effectiveLevelDb>-25);
  event=eventTrial({listenerRoom:'b3'});
  assert.equal(event.state.targetMemorySec,0,'cross-room loss cannot grant the extended memory');
  event=eventTrial({kind:'handling_noise'});
  assert.equal(event.state.targetMemorySec,0,'a weak environmental sound does not qualify');
  event=eventTrial({player:true});
  assert.equal(event.state.hasTarget,false,'player-generated door sound remains owned by the field monitor');
} finally {
  HUSH.despawn(); Math.random=realRandom; globalThis.performance=realPerformance;
}
console.log('close HUSH investigation specs passed');
