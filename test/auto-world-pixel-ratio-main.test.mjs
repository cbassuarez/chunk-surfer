import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createAutoWorldPixelRatio} from '../src/platform/auto-world-pixel-ratio.js';
import {resolveRenderScale} from '../src/platform/display-policy.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const between=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,`production section ${start}`);return main.slice(a,b);};
const frameBlock=between("    if(RENDERER==='3d'){\n      // Auto measures uninterrupted foreground gameplay",'    const rawGapMs=');
const scaleBlock=between('function applyRenderScale(renderScale){','function refreshStageLayout(');

function harness(){
  let now=0,focus=true,blocked=false,hiddenPresentation=false,recording=false,slating=false;
  const outputs=[],scales=[],events=[];
  const root={dataset:{},style:{setProperty:(key,value)=>events.push(['style',key,value])}};
  const save={settings:{renderScale:'auto'}};
  const ctx={RENDERER:'3d',inRogue:true,paused:false,worldOutputGeometryMotion:false,
    requestedRenderScale:'auto',autoWorldPixelRatio:createAutoWorldPixelRatio(),
    document:{hidden:false,documentElement:root},window:{devicePixelRatio:2,dispatchEvent:event=>events.push(['dispatch',event.type])},
    R3:{r3dSetOutputPixelRatio:value=>outputs.push(value),r3dSetRenderScale:value=>scales.push(value)},
    scenes:{blocksWorld:()=>blocked},scenePresentationHidesWorld:()=>hiddenPresentation,
    gameplayInputLifecycleActive:()=>focus,REC:{isRecording:()=>recording,isSlating:()=>slating},
    performance:{now:()=>now},resolveRenderScale,CustomEvent:function(type,options){this.type=type;this.detail=options.detail;},
    getSave:()=>save,saveCommit:()=>{throw Error('Auto output policy must not save');}};
  vm.createContext(ctx);vm.runInContext(`function runFrame(nowLoopMs){${frameBlock}}\n${scaleBlock}`,ctx);
  const run=(seconds,dt=40)=>{let left=seconds*1000;while(left>0){const step=Math.min(dt,left);now+=step;left-=step;ctx.runFrame(now);}};
  return{ctx,root,outputs,scales,events,save,run,
    setFocus:value=>{focus=value;},setBlocked:value=>{blocked=value;},setPresentation:value=>{hiddenPresentation=value;},
    setRecording:value=>{recording=value;},setSlating:value=>{slating=value;}};
}

test('production settings and loop apply Auto changes without saving and explicit quality restores native output',()=>{
  const h=harness();h.ctx.applyRenderScale('auto');assert.deepEqual(h.outputs,[1]);assert.deepEqual(h.scales,[1]);
  h.run(8);assert.deepEqual(h.outputs,[1,.875]);assert.equal(h.save.settings.renderScale,'auto');
  h.ctx.applyRenderScale(.5);assert.deepEqual(h.outputs,[1,.875,null]);assert.equal(h.scales.at(-1),.5);
  const n=h.outputs.length;h.run(20);assert.equal(h.outputs.length,n);assert.equal(h.root.dataset.renderScale,'0.5');
  h.ctx.applyRenderScale('auto');assert.equal(h.outputs.at(-1),1);assert.equal(h.root.dataset.renderScale,'auto');
  assert.equal(h.save.settings.renderScale,'auto','the internal ratio never writes player settings');
});

test('production gate excludes pause, visibility, input focus, modal, capture, slating and geometry motion',()=>{
 const cases=[
  h=>{h.ctx.paused=true;},h=>{h.ctx.document.hidden=true;},h=>h.setFocus(false),h=>h.setBlocked(true),
  h=>h.setPresentation(true),h=>h.setRecording(true),h=>h.setSlating(true),
  h=>{h.ctx.worldOutputGeometryMotion=true;},h=>{h.ctx.inRogue=false;},
 ];
 for(const setHold of cases){
  const h=harness();h.ctx.applyRenderScale('auto');h.run(4.8);setHold(h);h.run(30);
  assert.deepEqual(h.outputs,[1],'held frames never adapt');
  h.ctx.paused=false;h.ctx.document.hidden=false;h.ctx.worldOutputGeometryMotion=false;h.ctx.inRogue=true;
  h.setFocus(true);h.setBlocked(false);h.setPresentation(false);h.setRecording(false);h.setSlating(false);
  h.run(5.5);assert.deepEqual(h.outputs,[1],'resume rewarms before adapting');
  h.run(2);assert.deepEqual(h.outputs,[1,.875]);
 }
});

test('non-3D frames do not spend the policy budget',()=>{
 const h=harness();h.ctx.applyRenderScale('auto');h.ctx.RENDERER='2d';h.run(30);
 assert.deepEqual(h.outputs,[1]);h.ctx.RENDERER='3d';h.run(5.5);assert.deepEqual(h.outputs,[1]);
 h.run(2);assert.deepEqual(h.outputs,[1,.875]);
});

test('a playable borrowed Source renderer can adapt while its ordinary world is held',()=>{
 const h=harness();let live=true;
 h.ctx.scenes.top=()=>({get performanceWorldActive(){return live;}});
 h.ctx.applyRenderScale('auto');h.setBlocked(true);h.setPresentation(true);
 h.run(8);assert.deepEqual(h.outputs,[1,.875]);
 live=false;const count=h.outputs.length;h.run(30);
 assert.equal(h.outputs.length,count,'loading or authored transition holds remain protected');
 live=true;h.setRecording(true);h.run(30);assert.equal(h.outputs.length,count,'recording still blocks resolution changes');
 h.setRecording(false);h.setSlating(true);h.run(30);assert.equal(h.outputs.length,count,'slating remains protected');
 h.setSlating(false);h.setFocus(false);h.run(30);assert.equal(h.outputs.length,count,'foreground focus remains authoritative');
});
