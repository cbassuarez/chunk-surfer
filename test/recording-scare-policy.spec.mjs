import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordingScareSelector,recordingScareAllowed} from '../src/game/recording-scare-policy.js';
import {createRecordingEmbodiment} from '../src/game/recording-embodiment.js';
import {createRecordingHallucinationDirector} from '../src/game/recording-hallucinations.js';

test('B3 live/control and setup cannot draw a scare or consume the next random choice',()=>{
 let draws=0;const selector=createRecordingScareSelector({random:()=>{draws++;return .2;}});
 const take={recording:true,takeId:'take',roomId:'main_b3'};
 for(const extra of[{}, {roomId:'level-check'}, {roomId:'other',inB3:true}])
  assert.equal(selector.select({...take,...extra}),'none');
 assert.equal(draws,0);
 assert.equal(selector.select({...take,roomId:'the_tub'}),'hands');assert.equal(draws,1);
});

test('each later take draws one exclusive family, stable through pause, light and repeat observation',()=>{
 let draws=0;const selector=createRecordingScareSelector({random:()=>++draws===1?.2:.8});
 const first={recording:true,takeId:'t1',roomId:'the_tub'};
 assert.equal(selector.select(first),'hands');
 assert.equal(selector.select({...first,recording:false}),'none');
 assert.equal(selector.select({...first,lightOn:true}),'hands');
 assert.equal(selector.select({...first,inB3:true}),'none');
 assert.equal(selector.select(first),'hands');assert.equal(draws,1);
 assert.equal(selector.select({...first,takeId:'t2'}),'hallucinations');assert.equal(draws,2);
 assert.equal(selector.select(first),'hands','a prior take keeps its own family');
 for(const family of['hands','hallucinations','none']){
  const allowed=['hands','hallucinations'].filter(wanted=>recordingScareAllowed({roomId:'the_tub',scareFamily:family},wanted));
  assert.equal(allowed.length,family==='none'?0:1);
 }
 selector.reset();assert.equal(selector.inspect('t1'),'none');
});

test('both directors reject B3 and the other family even while an effect is already active',()=>{
 const hands=createRecordingEmbodiment(),ghosts=createRecordingHallucinationDirector({seed:'exclusive'});
 const input={recording:true,takeId:'later',roomId:'the_tub',takeProgress:.7,lightOn:false,
  effectiveMicRms:0,spoilThreshold:.06,hushPressure:.7};
 for(let n=0;n<100;n++)hands.update(1/60,{...input,scareFamily:'hands'});
 assert.ok(hands.snapshot().active);
 assert.equal(hands.update(1/60,{...input,scareFamily:'hallucinations'}).active,false);
 ghosts.force('hard',{nowMs:1000});
 assert.equal(ghosts.tick({...input,scareFamily:'hands',nowMs:1100}).active,null);
 for(const extra of[{roomId:'main_b3'},{inB3:true},{roomId:'level-check'}]){
  for(let n=0;n<100;n++)hands.update(1/60,{...input,...extra,scareFamily:'hands'});
  assert.equal(hands.snapshot().active,false);
  ghosts.force('hard',{nowMs:2000});
  assert.equal(ghosts.tick({...input,...extra,scareFamily:'hallucinations',nowMs:2100}).active,null);
 }
});
