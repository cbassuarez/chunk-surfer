import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyPlantValveRotation,
  applyPlantValveStroke,
  createPlantValveTurn,
  plantLookBackProgress,
  plantValveAudioFrame,
} from '../src/game/plant-isolation.js';
import { createPlantPipeRuntime } from '../src/audio/plant-pipe.js';

test('the header closes through accumulated physical rotation, never elapsed time',()=>{
  let valve=createPlantValveTurn('spanner');
  assert.equal(valve.progress,0);
  valve=applyPlantValveRotation(valve,Math.PI/2);
  assert.ok(valve.progress>0&&valve.progress<1);
  const unchanged=applyPlantValveRotation(valve,-Math.PI/2);
  assert.equal(unchanged.radians,valve.radians,'turning the wrong way cannot close the valve');
  let strokes=0;
  while(!valve.complete&&strokes++<40)valve=applyPlantValveStroke(valve);
  assert.equal(valve.complete,true);
  assert.ok(strokes>1,'one input cannot complete the repair');
});

test('the Stillson requires more travel than the carried spanner',()=>{
  const small=applyPlantValveStroke(createPlantValveTurn('spanner'));
  const heavy=applyPlantValveStroke(createPlantValveTurn('stillson'));
  assert.ok(small.progress>heavy.progress);
});

test('the real pipe falls away while a louder rear-channel imitation rises',()=>{
  const base={audible:true,world:.30,monitor:.16,pan:.2};
  const start=plantValveAudioFrame(base,createPlantValveTurn('spanner'));
  const end=plantValveAudioFrame(base,{...createPlantValveTurn('spanner'),progress:1,complete:true});
  assert.equal(start.world,.30);assert.equal(start.rear,0);
  assert.equal(end.world,0);assert.equal(end.monitor,0);
  assert.ok(end.rear>base.world,'the apparent source behind the player ends louder than the original pipe');
  assert.equal(plantValveAudioFrame(base,{progress:1},{rearActive:false}).rear,0,'looking back cuts the false source');
});

test('the look-back is wrap-safe and requires most of a half turn',()=>{
  assert.equal(plantLookBackProgress(Math.PI-.05,-Math.PI+.05)<.1,true);
  assert.ok(plantLookBackProgress(0,Math.PI*.75)>=.72);
  assert.ok(plantLookBackProgress(0,Math.PI*.5)<.72);
});

test('the runtime routes the false source through a rear HRTF path',()=>{
  const ramps=[];
  const param=(value=0)=>({value,cancelScheduledValues(){},linearRampToValueAtTime(next){this.value=next;ramps.push(next);}});
  const node=(extra={})=>({connect(){},...extra});
  let panner=null;
  const context={
    sampleRate:8000,currentTime:1,
    createBuffer:()=>({getChannelData:()=>new Float32Array(16)}),
    createBufferSource:()=>node({start(){},stop(){},loop:false,buffer:null}),
    createBiquadFilter:()=>node({frequency:param(),Q:param(),type:''}),
    createGain:()=>node({gain:param()}),
    createStereoPanner:()=>node({pan:param()}),
    createPanner:()=>{panner=node({positionX:param(),positionY:param(),positionZ:param(),panningModel:'',distanceModel:''});return panner;},
    createOscillator:()=>node({frequency:param(),start(){},stop(){},type:''}),
  };
  const runtime=createPlantPipeRuntime({context,worldDestination:node(),monitorDestination:node()});
  runtime.update({world:.05,monitor:.02,rear:.31},{monitorOpen:true});
  assert.equal(panner.panningModel,'HRTF');
  assert.equal(panner.positionZ.value,1);
  assert.ok(ramps.includes(.31),'rear gain is driven independently of pipe and monitor gains');
  runtime.stop();
});

test('runtime wiring hides actors for the empty reveal and never creates a HUSH',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const scene=main.slice(main.indexOf('function makePlantIsolationScene'),main.indexOf('function interactPlantHeader'));
  assert.match(scene,/stage==='turn-around'[\s\S]*?plantLookBackProgress/);
  assert.match(scene,/stage==='turning'[\s\S]*?suppressActors:false[\s\S]*?suppressActors:true/);
  assert.match(scene,/blocksWorld:true/,'Presence simulation is frozen while the player is held at the valve');
  assert.match(scene,/PLANT\.completePlantIsolation\(\)/);
  assert.doesNotMatch(scene,/elapsed<duration|plantIsolationDurationMs/);
  assert.doesNotMatch(scene,/PRES\.begin|spawnPresence|spawnBehind/);
  assert.match(scene,/That was not the pipe/);
  const audio=readFileSync(new URL('../src/audio/plant-pipe.js',import.meta.url),'utf8');
  assert.match(audio,/panningModel = 'HRTF'/);
  assert.match(audio,/rearVeil/,'the imitation loses the pipe jet and becomes breath-width behind the player');
  assert.match(audio,/frame\.rear/);
  assert.match(main,/apparitionsEnabled=!dockHauntingFrame&&!plantIsolationPresentation/,
    'the empty rear view cannot receive an emergency-shadow apparition');
});
