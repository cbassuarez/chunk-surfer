import test from 'node:test';
import assert from 'node:assert/strict';
import {noticePolicy} from '../src/progression/notifications.js';

test('quiet exploration admits one full notice; Steam uses only its platform presentation',()=>{
  assert.equal(noticePolicy(), 'full');
  assert.equal(noticePolicy({threat:.35}), 'full');
  assert.equal(noticePolicy({platformKind:'steam'}), 'pulse');
});

test('each actual attention, focus and Source withdrawal boundary defers both local and Steam presentation',()=>{
  for(const context of [
    {recording:true},{playback:true},{battle:true},{finale:true},{dialoguePending:true},
    {blocked:true},{withdrawn:true},{paused:true},{hidden:true},{focused:false},{threat:.35001},
  ])for(const platformKind of ['browser','steam']){
    assert.equal(noticePolicy({...context,platformKind}), 'defer',JSON.stringify({context,platformKind}));
    assert.equal(noticePolicy({platformKind}),platformKind==='steam'?'pulse':'full','clearing a hold restores the existing platform contract');
  }
});
