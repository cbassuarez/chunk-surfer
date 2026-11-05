import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyTakeAttempt,takeNoiseCause,TAKE_REJECT_FLOOR,TAKE_FREE_ABORT_SECONDS} from '../src/game/take-acceptance.js';
import {takeNote} from '../src/game/cassette-ledger.js';
import {recordistHandCovers} from '../src/data/recordist-hand.js';

const minute={completed:true,spoiled:false,elapsed:60};
const near=(atSec,ratio,cause='BREATH')=>({kind:'near',atSec,ratio,cause,level:ratio});

test('a clean minute is clean; a minute with the engineer on it is rejected at its worst moment',()=>{
  assert.deepEqual(classifyTakeAttempt(minute,{events:[near(12,.3)]}),{outcome:'clean',atSec:0,cause:null});
  assert.deepEqual(classifyTakeAttempt(minute,{events:[near(12,.62,'HANDLING'),near(41,.8,'BREATH')]}),{outcome:'rejected',atSec:41,cause:'BREATH'});
});

test('the rejection floor follows the shift’s recording forgiveness',()=>{
  assert.ok(TAKE_REJECT_FLOOR.pause>TAKE_REJECT_FLOOR.standard&&TAKE_REJECT_FLOOR.standard>TAKE_REJECT_FLOOR.strict);
  const events=[near(30,.7)];
  assert.equal(classifyTakeAttempt(minute,{events,forgiveness:'pause'}).outcome,'clean','Story forgives a sound that did not spoil');
  assert.equal(classifyTakeAttempt(minute,{events,forgiveness:'standard'}).outcome,'rejected');
  assert.equal(classifyTakeAttempt(minute,{events:[near(30,.5)],forgiveness:'strict'}).outcome,'rejected');
});

test('a spoilt take and a take called off both used their cassette, except a stop before the tape is up to speed',()=>{
  assert.deepEqual(classifyTakeAttempt({completed:false,spoiled:true,elapsed:23,reason:'you moved'},{events:[{kind:'spoil',atSec:23,cause:'CLOTHING'}]}),
    {outcome:'spoilt',atSec:23,cause:'CLOTHING'});
  assert.equal(classifyTakeAttempt({completed:false,spoiled:true,elapsed:9,reason:'you could not keep your breath quiet'}).cause,'BREATH');
  assert.deepEqual(classifyTakeAttempt({completed:false,spoiled:false,elapsed:14}),{outcome:'spoilt',atSec:14,cause:'STOPPED'});
  assert.equal(classifyTakeAttempt({completed:false,spoiled:false,elapsed:TAKE_FREE_ABORT_SECONDS-.1}),null);
  assert.equal(takeNote({n:3,outcome:'spoilt',atSec:14,cause:'STOPPED'}),'3  STOPPED 0:14');
});

test('the recorder’s reasons become causes he can write',()=>{
  const cases={'you could not keep your breath quiet':'BREATH','bag rummage':'HANDLING','a page turning':'HANDLING','you moved':'CLOTHING',
    'you crouched for a sheet':'HANDLING','it reached you':'PRESENCE','the room was not empty':'NOISE','the seating moved':'CLOTHING'};
  for(const [reason,cause] of Object.entries(cases))assert.equal(takeNoiseCause(reason),cause,reason);
  for(const cause of new Set(Object.values(cases)))for(const outcome of ['rejected','spoilt'])assert.ok(recordistHandCovers(takeNote({n:9,outcome,atSec:41,cause})));
});

test('main.js puts every attempt on a cassette, counts only clean takes, and asks which take to record over',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const fn=name=>{const a=main.indexOf(`function ${name}(`);assert.ok(a>=0,name);return main.slice(a,main.indexOf('\n}',a)+2);};
  const stop=fn('stopTake'),roll=fn('roll'),choose=fn('chooseRollCassette');
  assert.match(stop,/const attempt=fileTakeAttempt\(room,r\);/);
  const file=fn('fileTakeAttempt');assert.match(file,/classifyTakeAttempt\(r,/);assert.match(file,/if\(attempt\)fileTakeOnCassette\(room,attempt\)/);
  assert.match(stop,/if\(r\.completed&&!rejected&&room!==LEVEL_CHECK_ROOM\)acceptRoomTake\(room\)/);
  assert.match(file,/room===LEVEL_CHECK_ROOM\)\{commitCassettes\(recordLevelCheck\(cassetteLedger\(\)\)\)/,'the level check goes on cassette 1');
  assert.match(roll,/rollCassette=chooseRollCassette\(\);if\(!rollCassette\)return;/);
  assert.match(choose,/if\(pickCassetteToRecordOver\(at\.options\)\)return null;/);
  assert.match(fn('pickCassetteToRecordOver'),/ERASES IT/);
  assert.match(fn('fileTakeOnCassette'),/for\(const erased of result\.erased\)REC\.setTake\(erased,false\)/);
});
