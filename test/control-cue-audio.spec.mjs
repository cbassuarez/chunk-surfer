import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlCueEngine, CONTROL_VOICE_LIMIT } from '../src/audio/control-cue-engine.js';
import { CONTROL_RECIPES } from '../src/audio/vendor/cuelume-mechanical.js';
import { configureUiCues, uiCue, UI_CUE, setUiCueEnabled, setUiCueFocused,
  setUiCueGlobalLevel, setUiCueSfxLevel, cancelUiCueScope, uiCueSnapshot } from '../src/audio/ui-cues.js';
import { pressControl, releaseControl, cancelControlScope } from '../src/game/control-feedback.js';
import { makeRecorderScene } from '../src/game/recorder-scene.js';
import { makeVanWorkbenchScene } from '../src/game/van-workbench.js';
import { makeBattlePreparation } from '../src/game/battle-preparation.js';
import { freshFieldKit } from '../src/game/field-kit.js';
import * as scenes from '../src/game/scenes.js';
import * as STORY from '../src/audio/story-audio.js';

function fixture(){
  const nodes=[],destination={name:'menu'},hardware={name:'hardware'};
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
  const node=kind=>{const n={kind,connections:[],gain:param(),frequency:param(),Q:param(),
    connect(to){this.connections.push(to);return to;},disconnect(){this.disconnected=true;},
    start(at){this.started=at;},stop(at){this.stopped=at;}};nodes.push(n);return n;};
  const ctx={state:'running',currentTime:1,sampleRate:8000,destination:hardware,
    createGain:()=>node('gain'),createOscillator:()=>node('tone'),createBufferSource:()=>node('noise'),
    createBiquadFilter:()=>node('filter'),createBuffer:(_c,n)=>({getChannelData:()=>new Float32Array(n)})};
  const engine=configureUiCues({context:ctx,destination,getQuiet:()=>false});
  setUiCueEnabled(true);setUiCueFocused(true);setUiCueGlobalLevel(1);setUiCueSfxLevel(1);
  return {ctx,nodes,destination,hardware,engine,advance:(seconds=.3)=>{ctx.currentTime+=seconds;}};
}
test.afterEach(()=>{while(scenes.top())scenes.pop();cancelControlScope('');configureUiCues({});});

test('every control recipe is finite, uses the supplied bus, and cleans all owned nodes',()=>{
  const f=fixture();
  for(const name of Object.keys(CONTROL_RECIPES)){
    f.advance();const start=f.nodes.length;
    assert.equal(f.engine.play(name),true,name);
    const owned=f.nodes.slice(start),sources=owned.filter(n=>n.started!=null);
    assert.ok(sources.length>0&&sources.every(n=>n.stopped-n.started<.2));
    assert.ok(owned.some(n=>n.connections.includes(f.destination)));
    assert.ok(owned.every(n=>!n.connections.includes(f.hardware)),'no bypass around the game mixer');
    for(const source of sources)source.onended?.();
    assert.ok(owned.every(n=>n.disconnected));assert.equal(f.engine.snapshot().voices,0);
  }
  assert.ok(f.engine.snapshot().buffers<=4);
});

test('suspended, closed, invalid and zero-volume requests cannot queue a later sound',()=>{
  const f=fixture();let resumed=0;f.ctx.resume=()=>{resumed++;return Promise.resolve();};
  for(const state of ['suspended','closed']){f.ctx.state=state;assert.equal(f.engine.play('toggle'),false);}
  f.ctx.state='running';for(const name of ['missing','constructor','toString'])assert.equal(f.engine.play(name),false);
  assert.equal(f.engine.play('press',{volume:0}),false);
  assert.equal(resumed,0);assert.equal(f.nodes.length,0);assert.equal(f.engine.snapshot().pending,0);
});

test('rapid navigation stays bounded and a refusal takes priority over incidental contacts',()=>{
  const f=fixture();for(let i=0;i<200;i++)f.engine.play('tick',{key:`row:${i}`});
  assert.equal(f.engine.snapshot().played,1);assert.equal(f.engine.snapshot().suppressed,199);
  for(let i=0;i<20;i++)f.engine.play('press',{scope:`control:${i}`});
  assert.equal(f.engine.snapshot().voices,CONTROL_VOICE_LIMIT);
  assert.equal(f.engine.play('refuse'),true);assert.equal(f.engine.snapshot().voices,CONTROL_VOICE_LIMIT);
  assert.ok(f.nodes.filter(n=>n.started!=null&&n.disconnected).length>0);
});

test('mute and focus loss cancel current and future contacts, and gain is applied only by the mixer',()=>{
  const f=fixture();setUiCueGlobalLevel(.5);setUiCueSfxLevel(.4);
  uiCue(UI_CUE.CONFIRM);uiCue(UI_CUE.RELEASE,{delay:.09});
  assert.equal(uiCueSnapshot().history[0].level,.55*CONTROL_RECIPES.toggle.volume,'the bus has already applied the two sliders');
  setUiCueSfxLevel(0);assert.equal(uiCueSnapshot().voices,0);assert.equal(uiCue(UI_CUE.MOVE),false);
  setUiCueSfxLevel(1);f.advance();uiCue(UI_CUE.PRESS);setUiCueFocused(false);
  assert.equal(uiCueSnapshot().voices,0);assert.equal(uiCue(UI_CUE.CONFIRM),false);
  setUiCueFocused(true);assert.equal(uiCueSnapshot().voices,0,'focus does not replay queued input');
});

test('recording attenuates browsing more than deliberate control actions',()=>{
  const f=fixture();uiCue(UI_CUE.MOVE);const normal=uiCueSnapshot().history.at(-1).level;
  f.advance();configureUiCues({context:f.ctx,destination:f.destination,getQuiet:()=>true});uiCue(UI_CUE.MOVE);
  assert.equal(uiCueSnapshot().history.at(-1).level,normal*.18);
  f.advance();uiCue(UI_CUE.CONFIRM);assert.equal(uiCueSnapshot().history.at(-1).quiet,true);
  f.advance();const scene=makeRecorderScene({getState:()=>({recording:false})});
  scene.key({key:'ArrowDown'});
  assert.equal(uiCueSnapshot().history.at(-1).quiet,true,'the recorder also respects the shared listening state');
});

test('held controls sound once, release at minimum travel, and scope cancellation removes scheduled returns',()=>{
  const f=fixture();
  pressControl('recorder:stop',{now:0});pressControl('recorder:stop',{now:20});
  assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['press']);
  releaseControl('recorder:stop',{now:30});releaseControl('recorder:stop',{now:40});
  assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['press','release']);
  assert.ok(Math.abs(uiCueSnapshot().history[1].start-1.06)<1e-6);
  cancelControlScope('recorder:');assert.equal(uiCueSnapshot().pending,0);
  assert.equal(uiCueSnapshot().voices,1,'the contact already heard can finish naturally');
  f.advance();pressControl('bag:tab:map',{now:400,held:false});assert.equal(uiCueSnapshot().pending,1);
  cancelUiCueScope();assert.equal(uiCueSnapshot().pending,0);
});

test('replacing the audio context disposes its graph and quiet failures do not affect input',()=>{
  const f=fixture();uiCue(UI_CUE.PRESS);const old=f.nodes.slice();fixture();
  assert.ok(old.every(n=>n.disconnected));
  const broken=createControlCueEngine({context:{state:'running',currentTime:1,createGain(){throw Error('unavailable');}},destination:{}});
  assert.equal(broken.play('toggle'),false);assert.equal(broken.snapshot().voices,0);
});

test('recorder keyboard and controller latch only an accepted take, and a disabled take refuses',()=>{
  for(const event of [{key:'Enter',code:'Enter'},{controllerAction:'confirm',controller:true}]){
    fixture();let live={recording:false};
    const scene=makeRecorderScene({getState:()=>live,onRecord:()=>{live={recording:true};}});scenes.push(scene);
    scene.key(event);assert.equal(live.recording,true);
    assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['press','latch']);
    fixture();const blocked=makeRecorderScene({getState:()=>({refusal:{reason:'STUDIO B3 FIRST'}})});scenes.push(blocked);
    blocked.key(event);assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['refuse']);scenes.pop();
  }
});

test('recorder browsing has release feedback and hovering the same target is silent',()=>{
  const f=fixture(),scene=makeRecorderScene({getState:()=>({}),getTakes:()=>[]});scenes.push(scene);
  scene.key({key:'Tab',code:'Tab'});scene.keyup({key:'Tab',code:'Tab'});
  assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['press','latch','release']);
  scene.render();const hit=scene.debugState().hitRegions.find(h=>h.kind==='transport');assert.ok(hit);
  f.advance();const point={type:'pointermove',cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2};
  scene.pointer(point);const played=uiCueSnapshot().played;
  f.advance();scene.pointer(point);assert.equal(uiCueSnapshot().played,played);
});

test('preparation reports a failed READY as refused and confirms only a successful retry',()=>{
  const f=fixture();let accepted=false,ready=0;
  const prep=makeBattlePreparation({getEquipment:()=>['light'],apply:()=>accepted,onReady:()=>ready++,audio:STORY});prep.update(.3);
  prep.key({controllerAction:'start'});assert.equal(ready,0);
  assert.ok(uiCueSnapshot().history.some(e=>e.name==='refuse'));assert.ok(!uiCueSnapshot().history.some(e=>e.name==='toggle'));
  f.advance();accepted=true;prep.key({controllerAction:'start'});assert.equal(ready,1);
  assert.equal(uiCueSnapshot().history.at(-1).name,'toggle');prep.dispose();
});

test('the van gives the same accepted equipment feedback to keyboard, controller and pointer',()=>{
  for(const mode of ['keyboard','controller','pointer']){
    fixture();let taken=false;
    const scene=makeVanWorkbenchScene({getState:()=>({bagTaken:taken,fieldKit:freshFieldKit()}),onTakeCase:()=>{taken=true;}});
    scene.enter();scene.render({cols:75,rows:20});
    if(mode==='pointer'){
      const hit=scene.debugState().hitRegions.find(h=>h.id==='van:case');
      scene.pointer({type:'pointerdown',pointerId:1,button:0,cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2});
    }else scene.key(mode==='keyboard'?{key:'Enter',code:'Enter'}:{controllerAction:'confirm'});
    assert.equal(taken,true,mode);assert.deepEqual(uiCueSnapshot().history.map(e=>e.name),['fit'],mode);scene.exit();
  }
});
