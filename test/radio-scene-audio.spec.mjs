import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRadioSceneAudio, RADIO_SCENE_STAGES } from '../src/audio/radio-scene-audio.js';

function fakeAudio({panner=true}={}){
  const nodes=[],destination={name:'dialog-sfx-bus'};
  const param=()=>({value:0,calls:[],setValueAtTime(value,at){this.value=value;this.calls.push({value,at});},linearRampToValueAtTime(value,at){this.value=value;this.calls.push({value,at});}});
  const node=kind=>{
    const value={kind,connections:[],disconnected:false,connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;},gain:param(),frequency:param(),Q:param(),pan:param()};
    if(kind==='noise'||kind==='tone'){value.starts=[];value.stops=[];value.start=at=>value.starts.push(at);value.stop=at=>value.stops.push(at);}
    nodes.push(value);return value;
  };
  const ctx={currentTime:4,state:'running',sampleRate:8000,createGain:()=>node('gain'),createOscillator:()=>node('tone'),createBufferSource:()=>node('noise'),createBiquadFilter:()=>node('filter'),
    createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)})};
  if(panner)ctx.createStereoPanner=()=>node('pan');
  return {ctx,destination,nodes,getAudio:()=>({ctx,destination})};
}

test('radio stages own a small graph, stay below dialogue-scale gains, and pause completely at decision',()=>{
  const audio=fakeAudio(),sound=createRadioSceneAudio(audio);
  assert.equal(sound.stage('unknown'),false);assert.equal(audio.nodes.length,0);
  assert.equal(sound.stage('onset'),true);assert.equal(sound.snapshot().voices,3);
  assert.equal(sound.stage('onset'),false,'repeated presentation frames do not duplicate sources');
  const onset=audio.nodes.slice();
  sound.stage('relay');assert.ok(onset.every(node=>node.disconnected));
  assert.equal(sound.snapshot().voices,4);
  for(const node of audio.nodes.filter(node=>node.kind==='gain'))for(const point of node.gain.calls)assert.ok(point.value>=0&&point.value<=.0275);
  assert.ok(audio.nodes.some(node=>node.connections.includes(audio.destination)),'the provided volume bus is the only external output');
  sound.stage('decision');assert.equal(sound.snapshot().silent,true);assert.equal(sound.snapshot().nodes,0);
  assert.ok(audio.nodes.every(node=>node.disconnected));
  assert.ok(audio.nodes.filter(node=>node.starts).every(node=>node.stops.length>0));sound.stop();
});

test('suspend clears scheduled returns and resume restores only the quiet carrier',()=>{
  const audio=fakeAudio(),sound=createRadioSceneAudio(audio);
  sound.stage('relay');const before=audio.nodes.slice();
  sound.pause();assert.equal(sound.snapshot().paused,true);assert.equal(sound.snapshot().silent,true);
  assert.ok(before.every(node=>node.disconnected));
  audio.ctx.currentTime=100;sound.resume();
  assert.equal(sound.snapshot().voices,2,'a relay is never retriggered after focus returns');
  const resumed=audio.nodes.slice(before.length).filter(node=>node.starts);
  assert.equal(resumed.length,2);assert.ok(resumed.every(node=>node.stops.length===0),'no replayed finite click or transient');
  sound.stage('decision');sound.pause();sound.resume();assert.equal(sound.snapshot().voices,0);
  sound.stage('break');sound.pause();sound.resume();assert.equal(sound.snapshot().voices,0,'a suspended break cannot happen twice');sound.stop();
});

test('listen has no reseating click; the break is finite and after is irreversible dead silence',()=>{
  const audio=fakeAudio(),sound=createRadioSceneAudio(audio);
  sound.stage('reseat',{choice:'listen'});assert.equal(sound.snapshot().voices,2);
  sound.stage('still');assert.equal(sound.snapshot().silent,true);
  sound.stage('break');assert.equal(sound.snapshot().voices,3);
  for(const source of audio.nodes.filter(node=>node.starts&&!node.disconnected)){
    assert.ok(source.stops[0]-source.starts[0]<.21);
    source.onended();
  }
  assert.equal(sound.snapshot().nodes,0);assert.equal(sound.snapshot().silent,true);
  sound.stage('after');
  for(const stage of RADIO_SCENE_STAGES)assert.equal(sound.stage(stage),false,'late scene events cannot revive a dead carrier');
  sound.stop();sound.stop();assert.equal(sound.snapshot().disposed,true);
});

test('scene cancellation is immediate even with a suspended audio clock or reduced-motion stereo fallback',()=>{
  for(const panner of [true,false]){
    const audio=fakeAudio({panner}),sound=createRadioSceneAudio({...audio,reducedMotion:true});
    sound.stage('relay');audio.ctx.state='suspended';sound.stop();
    assert.equal(sound.snapshot().nodes,0);assert.ok(audio.nodes.every(node=>node.disconnected));
    assert.ok(audio.nodes.filter(node=>node.kind==='pan').every(node=>node.pan.value===0));
    assert.equal(sound.resume(),false);assert.equal(sound.stage('onset'),false);
  }
  const missing=createRadioSceneAudio();assert.equal(missing.stage('onset'),false);missing.stop();
});

test('terminal radio lines have no duplicate audio triggers and ordinary contacts use stable named sources',()=>{
  const project=JSON.parse(readFileSync('content/audio/audio-project.audio.json','utf8'));
  const events=project.triggers.map(trigger=>trigger.event);
  assert.equal(events.some(event=>/^story\.line:(radio\.(pre_third_room_breakdown|hush_help_rupture)|conservatory\.radio_dead):/.test(event)),false);
  for(const event of ['story.line:radio.initial_checkin:checkin.latch','story.line:radio.initial_checkin:checkin.after','story.line:radio.post_second_take_warning:warning.relay','story.line:radio.post_second_take_warning:warning.after'])assert.ok(events.includes(event));
});
