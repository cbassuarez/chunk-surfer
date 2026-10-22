import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourcePubAudio} from '../src/audio/source-pub.js';
function fakeAudio(){
  const nodes=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>{const v={gain:param(),frequency:param(),Q:param(),pan:param(),connect(){return this;},disconnect(){v.disconnected=true;},start(){},stop(){v.stopped=true;}};nodes.push(v);return v;};
  return{ctx:{state:'running',sampleRate:100,currentTime:0,createGain:node,createBufferSource:node,createOscillator:node,createBiquadFilter:node,createStereoPanner:node,createBuffer:(c,n)=>({getChannelData:()=>new Float32Array(n)})},destination:node(),nodes};
}
const state={status:'active',stage:0,task:0,elapsed:0};
test('Source sound never starts without a live Source scene, and cuts every scheduled tail on pause',()=>{
  const a=fakeAudio(),sound=createSourcePubAudio({getAudio:()=>a});
  sound.update({dt:1});assert.equal(sound.snapshot().voices,0);
  sound.update({state:{...state,ready:false},dt:.1});assert.equal(sound.snapshot().voices,0);
  sound.update({state,dt:.1});sound.update({state:{...state,task:1},dt:.1});assert.equal(sound.snapshot().voices,3);
  sound.pause();assert.equal(sound.snapshot().voices,0);assert.equal(sound.snapshot().active,false);
  const before=sound.snapshot().contacts;sound.update({state:{...state,task:1},dt:.1});assert.equal(sound.snapshot().contacts,before,'resume does not replay the previous service');
  sound.stop();assert.equal(sound.snapshot().voices,0);
});
test('fall has a single contact and replacement contexts release every old node',()=>{
  let a=fakeAudio();const old=a,sound=createSourcePubAudio({getAudio:()=>a});
  sound.update({state,dt:.1});for(let i=0;i<100;i++)sound.update({state:{...state,fall:{elapsed:i/100}},dt:.01});
  assert.equal(sound.snapshot().contacts,1);assert.ok(sound.snapshot().voices<=16);
  a=fakeAudio();sound.update({state,dt:.1});assert.ok(old.nodes.slice(1).every(n=>n.disconnected));
  a.ctx.state='suspended';sound.update({state,dt:.1});assert.equal(sound.snapshot().voices,0);
});
test('resuming a saved fall or falling object does not replay its first impact',()=>{
  const a=fakeAudio(),sound=createSourcePubAudio({getAudio:()=>a});sound.update({state,dt:.1});
  for(const field of['fall','itemFall']){
    sound.update({state:{...state,[field]:{elapsed:.2,kind:field==='fall'?'player':'tray'}},dt:.1});
    const count=sound.snapshot().contacts;sound.pause();
    sound.update({state:{...state,[field]:{elapsed:.2,kind:field==='fall'?'player':'tray'}},dt:.1});
    assert.equal(sound.snapshot().contacts,count);sound.update({state,dt:.1});
  }
});
