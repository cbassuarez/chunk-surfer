import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestBreathFrame,createSourceRestBreath} from '../src/audio/source-rest-breath.js';

test('breathing has an inhale, an exhale and silence, and disappears before black',()=>{
  assert.equal(sourceRestBreathFrame(.5,.5).gain,0);
  assert.ok(sourceRestBreathFrame(.8,.5).gain>.03);
  assert.ok(sourceRestBreathFrame(.8,2).gain>0);
  assert.equal(sourceRestBreathFrame(1,.5).gain,0);
});

test('holds silence the breath immediately and disposal stops its source',()=>{
  const values=[],source={connect(){},start(){},stop(){values.push('stop');},disconnect(){}};
  const param=()=>({value:0,setTargetAtTime(value){values.push(value);}});
  const ctx={state:'running',sampleRate:100,currentTime:.5,createBuffer:()=>({getChannelData:()=>new Float32Array(300)}),
    createBufferSource:()=>source,createBiquadFilter:()=>({frequency:param(),Q:{},connect(){},disconnect(){}}),
    createGain:()=>({gain:param(),connect(){},disconnect(){}})};
  const breath=createSourceRestBreath({getAudio:()=>({ctx,destination:{}})});
  breath.update({progress:.8,audible:true});assert.ok(values.some(n=>typeof n==='number'&&n>0));
  breath.pause();assert.equal(values.at(-1),0);breath.dispose();assert.equal(values.at(-1),'stop');
});
