import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRST_B3_CONTACT_GRACE_PROGRESS,
  suppressFirstB3RecordingContact,
} from '../src/game/recording-contact.js';

test('only the opening half of the first Studio B3 take suppresses physical contact',()=>{
  assert.equal(suppressFirstB3RecordingContact({
    recording:true,roomId:'main_b3',hasCleanB3Take:false,progress:0,
  }),true);
  assert.equal(suppressFirstB3RecordingContact({
    recording:true,roomId:'main_b3',hasCleanB3Take:false,progress:FIRST_B3_CONTACT_GRACE_PROGRESS-.001,
  }),true);
  assert.equal(suppressFirstB3RecordingContact({
    recording:true,roomId:'main_b3',hasCleanB3Take:false,progress:FIRST_B3_CONTACT_GRACE_PROGRESS,
  }),false,'the back half of the take remains dangerous');
  assert.equal(suppressFirstB3RecordingContact({
    recording:true,roomId:'main_b3',hasCleanB3Take:true,progress:.1,
  }),false,'retakes do not inherit tutorial protection');
  assert.equal(suppressFirstB3RecordingContact({
    recording:true,roomId:'the_tub',hasCleanB3Take:false,progress:.1,
  }),false,'no other room is softened');
  assert.equal(suppressFirstB3RecordingContact({
    recording:false,roomId:'main_b3',hasCleanB3Take:false,progress:.1,
  }),false,'ordinary traversal is unchanged');
});

test('recording HUSH contact owns a direct physical impact before spoil',()=>{
  const source = readFileSync('src/main.js','utf8');
  assert.match(source,/function playRecordingHushImpact\(/);
  assert.match(source,/const out=sfxDirectGain\|\|master\|\|actx\.destination/);
  assert.match(source,/if\(hitRolling\)playRecordingHushImpact\(\);\s*if\(hitRolling\)REC\.spoilTake\('it found you'\)/);
  assert.match(source,/if\(hitRolling\)playRecordingHushImpact\(\{taken:true\}\);\s*if\(hitRolling\)REC\.spoilTake\('it took you'\)/);
});
