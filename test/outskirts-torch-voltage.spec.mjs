import assert from 'node:assert/strict';
import { buildBellsGodPreset, buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime, torchFlickerAt } from '../src/game/source-space-runtime.js';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';

const sample=(severity)=>{
  const values=Array.from({length:120000},(_,i)=>torchFlickerAt(i/1000,4417,severity));
  let longestDark=0,run=0;
  for(const value of values){
    assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
    run=value===0?run+1:0;
    longestDark=Math.max(longestDark,run);
  }
  return{
    black:values.filter(value=>value===0).length/values.length,
    weak:values.filter(value=>value<.5).length/values.length,
    mean:values.reduce((total,value)=>total+value,0)/values.length,
    longestDark:longestDark/1000,
  };
};
const early=sample(0),late=sample(1);
assert.ok(early.black>.07&&early.black<.22,'the early walk lacks sustained but bounded outages');
assert.ok(early.weak>.25,'the beam returns to full voltage between brief identical flickers');
assert.ok(early.longestDark>.45&&early.longestDark<3,'a dropout is either imperceptible or traps the player too long');
assert.ok(late.black>early.black&&late.mean<early.mean,'the failing torch does not worsen down the road');
assert.equal(torchFlickerAt(15.37,4417,.6),torchFlickerAt(15.37,4417,.6),'the light changes between identical frames');
assert.notEqual(torchFlickerAt(15.37,4417),torchFlickerAt(15.37,31),'unrelated runs have the same fault timing');

const built=buildPreTapeGodPreset(40,{seed:4417,marbleEyes:'returned'});
const runtime=createSourceSpaceRuntime({initialState:built.state});
runtime.setPlayerPosition(built.position);
assert.equal(runtime.sourceFlashlightFrame({time:13.3}).flicker,torchFlickerAt(13.3,4417,runtime.outskirtsLosing()));
assert.equal(runtime.sourceFlashlightFrame({time:13.3,flashMode:'reduced'}).flicker,1);
assert.equal(runtime.sourceFlashlightFrame({time:13.3,reducedMotion:true}).flicker,1);

const outageTime=Array.from({length:3000},(_,i)=>i/100)
  .find(time=>runtime.sourceFlashlightFrame({time}).flicker===0);
assert.ok(Number.isFinite(outageTime),'the test walk never enters a blackout');
const fillAt=(options)=>runtime.localLights({time:outageTime,...options})
  .find(light=>light.id==='source-void-lamp')?.intensity;
assert.ok(fillAt({})<fillAt({flashMode:'reduced'})*.25,
  'the camera-following fill masks the failed flashlight');
assert.equal(fillAt({torchOn:false}),fillAt({torchBattery:0}),
  'the fill remains bright when the player switches the torch off');
const bellStop=buildBellsGodPreset(40,{seed:4417,marbleEyes:'returned'});
const bells=createSourceSpaceRuntime({initialState:bellStop.state});
bells.setPlayerPosition(bellStop.position);
assert.equal(bells.localLights({time:outageTime,torchOn:false})[0].intensity,
  bells.localLights({time:outageTime,torchOn:true})[0].intensity,
  'the bell passage loses its independent visibility fill');

const full=resolveTorchLook({on:true,battery:1});
const weak=applySourceEmergencyTorch(full,{flicker:.2});
assert.ok(weak.power<full.power&&weak.reach<full.reach&&weak.color[2]<full.color[2],
  'voltage sag does not shorten and warm the physical beam');
assert.equal(applySourceEmergencyTorch(full,{flicker:0}).power,0,'an outage leaves residual light');
const switchedOff=resolveTorchLook({on:false,battery:1});
assert.equal(applySourceEmergencyTorch(switchedOff,{flicker:.8}).power,0,
  'the failing supply overrides the player switch');

console.log('outskirts torch voltage specs passed');
