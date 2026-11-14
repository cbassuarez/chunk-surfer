import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as PB from '../src/game/playback.js';
import * as REC from '../src/game/recordist.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function functionSource(name){
  const from=main.indexOf(`function ${name}(`),to=main.indexOf('\n}',from)+2;
  assert.ok(from>=0&&to>from,name);
  return main.slice(from,to);
}

test('the booth hears the CATCH impulse and a scream but rearms only after quiet',()=>{
  let rms=.04,now=500,foreground=true,catches=0,tapeTicks=0;
  const env={
    payphoneScene:{view:()=>({handset:'hook'})},payphoneLine:{},payphoneCall:null,
    payphoneDuplex:{},payphoneAttempt:{ready:true,quietMs:0,loudUntil:0,sounds:[]},
    payphoneMicLive:()=>true,MIC:{micState:()=>'test',micLevel:()=>rms,micMaySpoil:()=>true},
    MIC_LEVEL:{spoil:.06,scream:.26},ROOM_TONE:{catchNoise:.40},
    payphoneTapeTick:()=>tapeTicks++,PAYPHONE_STORY:{},paused:false,
    gameplayInputLifecycleActive:()=>foreground,performance:{now:()=>now},beginPayphoneCatch:()=>{catches++;return true;},
  };
  const context=vm.createContext(env);
  for(const name of ['roomMicNoise','tickPayphone','notePayphoneGameplayNoise','notePayphoneAcoustic'])vm.runInContext(functionSource(name),context);
  env.tickPayphone(.2);
  rms=.19;env.tickPayphone(.2);
  assert.equal(catches,0);
  rms=.26;foreground=false;env.tickPayphone(.2);
  assert.equal(catches,0);
  foreground=true;env.tickPayphone(.2);
  assert.equal(catches,1);
  assert.equal(tapeTicks,3,'threshold wins before the tape advances on the catch frame');

  env.payphoneAttempt={ready:false,quietMs:0,loudUntil:0,sounds:[]};
  for(let i=0;i<4;i++)env.tickPayphone(.2);
  assert.equal(catches,1,'a held scream cannot catch the retry');
  rms=.04;env.tickPayphone(.2);env.tickPayphone(.2);
  assert.equal(env.payphoneAttempt.ready,true);
  env.notePayphoneGameplayNoise({level:.6,source:{kind:'hush'},audibleToHush:true});
  env.notePayphoneGameplayNoise({level:.6,source:{kind:'player'},audibleToHush:false});
  env.notePayphoneGameplayNoise({level:.4,source:{kind:'player'}});
  env.tickPayphone(.05);
  assert.equal(catches,1,'program audio, insulated sources and the boundary do not catch');
  env.notePayphoneGameplayNoise({level:.5,source:{kind:'player'}});
  now+=251;env.tickPayphone(.05);
  assert.equal(catches,1,'an old impulse cannot catch');
  env.notePayphoneGameplayNoise({level:.5,source:{kind:'player'}});
  env.tickPayphone(.05);
  assert.equal(catches,2,'a fresh gameplay impulse uses the CATCH scale');
  now+=251;
  env.notePayphoneAcoustic({source:{id:'room-mic'},semantics:{playerGenerated:true},acoustic:{levelDb:-5,durationMs:300}});
  env.notePayphoneAcoustic({source:{id:'player'},semantics:{playerGenerated:true,audibleToHush:false},acoustic:{levelDb:-5,durationMs:300}});
  env.tickPayphone(.05);
  assert.equal(catches,2,'room mic echoes and protected semantic sources are excluded');
  env.notePayphoneAcoustic({source:{id:'player'},semantics:{playerGenerated:true},acoustic:{levelDb:-5,durationMs:300}});
  env.tickPayphone(.05);
  assert.equal(catches,3,'the semantic acoustic feed can independently trigger a catch');
});

test('the tape rewind recovers the original playback objects and one newly granted sheet can be retried',()=>{
  PB.loadTakes([{roomId:'room-a',durationSeconds:10,at:1},{roomId:'room-b',durationSeconds:12,at:2}]);
  const first=PB.takeFor('room-a'),second=PB.takeFor('room-b');
  PB.advanceHeadTo(5);PB.addTapeMarker({id:'found',atSeconds:4});
  const saved=PB.tapeTransport(),undo=PB.forgetTakeForPayphone('room-a');
  PB.advanceHeadTo(8);
  assert.equal(PB.takeFor('room-a'),null);
  assert.equal(first.voided,true);
  undo();PB.loadTapeTransport(saved);
  assert.deepEqual(PB.tapeTransport(),saved);
  assert.equal(PB.takeFor('room-a'),first);
  assert.equal(PB.takeFor('room-b'),second);
  assert.equal(first.voided,false);
  REC.loadRecState({sheets:['existing'],sheetsTaken:['existing','used']});
  assert.equal(REC.takeSheet('sheet-mozart-minuet'),true);
  REC.rewindSheetPickup('sheet-mozart-minuet');
  assert.deepEqual(REC.carriedSheets(),['existing']);
  assert.equal(REC.sheetTaken('used'),true);
  assert.equal(REC.takeSheet('sheet-mozart-minuet'),true);
});
