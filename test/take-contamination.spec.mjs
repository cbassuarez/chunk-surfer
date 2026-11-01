import test from 'node:test';
import assert from 'node:assert/strict';
import {takeContaminationLabel,describeTakeContamination,takeContaminationSources} from '../src/game/take-contamination.js';

test('clean takes are never labelled contaminated even with an unrelated event',()=>{
  assert.equal(takeContaminationLabel({contaminated:false,discrete:[{cueId:'b3.speaker.steps.9'}]}),null);
});
test('heard speaker bleed is retained by the persisted tape cue, not guessed from the room',()=>{
  const saved=JSON.parse(JSON.stringify({contaminated:true,discrete:[{cueId:'b3.speaker.steps.9'}]}));
  assert.equal(takeContaminationLabel(saved),'SPEAKER BLEED');
  assert.equal(takeContaminationLabel({roomId:'main_b3',contaminated:true,discrete:[]}), 'MAINS HUM');
});
test('explicit source metadata preserves combined mains and speaker attribution on reload',()=>{
  const contamination={circuits:['hall'],sources:['b3-speakers']};
  const sources=takeContaminationSources(contamination);
  const saved=JSON.parse(JSON.stringify({contaminated:true,contaminationSources:sources,discrete:[{cueId:'b3.speaker.noise.0'}]}));
  assert.equal(takeContaminationLabel(saved),'MAINS HUM · SPEAKER BLEED');
  assert.equal(describeTakeContamination(contamination,id=>id==='hall'?'hall circuit':id),'hall circuit and the studio speakers');
});
test('unknown explicitly recorded sources are not mislabelled as mains or speaker',()=>{
  assert.equal(takeContaminationLabel({contaminated:true,contaminationSources:[],discrete:[]}), 'CONTAMINATED');
  assert.equal(describeTakeContamination({circuits:[],sources:[]}), 'unwanted sound');
});
test('legacy mains takes retain their existing meaning',()=>{
  assert.equal(takeContaminationLabel({contaminated:true}), 'MAINS HUM');
  assert.equal(describeTakeContamination({circuits:['a','a']},()=> 'mains'), 'mains');
});

test('the real recorder-to-tape path preserves combined attribution and credit across reload',async()=>{
  const REC=await import('../src/game/recordist.js');
  const PB=await import('../src/game/playback.js');
  PB.loadTakes([]);
  REC.setTakeSink({roomIds:PB.takeRoomIds,contaminated:PB.contaminatedRooms,places:PB.takePlaces,mark:PB.markTake});
  try {
    PB.beginTake('main_b3',{x:29,y:22},{durationSeconds:45});
    PB.startTapeTake('main_b3');
    PB.noteDiscrete('main_b3',{cueId:'b3.speaker.noise.4',atSec:42});
    REC.addTake('main_b3',{contaminated:true,contaminationSources:['mains','b3-speakers'],place:'B3'});
    PB.finishTapeTake('main_b3',{elapsed:45,tapeElapsed:45,completed:true});
    assert.equal(REC.hasTake('main_b3'),true,'a valid early stop retains credit');
    const saved=JSON.parse(JSON.stringify(PB.serializeTakes()));
    assert.deepEqual(saved[0].contaminationSources,['mains','b3-speakers']);
    PB.loadTakes(saved);REC.syncTakes();
    assert.equal(REC.hasTake('main_b3'),true);
    assert.equal(takeContaminationLabel(PB.takeFor('main_b3')),'MAINS HUM · SPEAKER BLEED');
    assert.deepEqual(PB.takeFor('main_b3').contaminationSources,['mains','b3-speakers']);
  } finally { REC.setTakeSink(null);PB.loadTakes([]); }
});

test('real tape serialization preserves a legacy missing source list',async()=>{
  const PB=await import('../src/game/playback.js');
  PB.loadTakes([{roomId:'main_b3',contaminated:true,status:'accepted',counted:true}]);
  const saved=PB.serializeTakes()[0];
  assert.equal(Object.hasOwn(saved,'contaminationSources'),false);
  assert.equal(takeContaminationLabel(saved),'MAINS HUM');
  PB.loadTakes([]);
});
