import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizePressurePresentation} from '../../src/game/pressure-performance.js';
import {packShadowFrames,unpackShadowFrames,shadowFrameAt} from '../../src/causal/tape.js';
import {productionShaderBundle,shaderDeclaration} from '../../tools/chunk_surfer/export-pressure-review-shaders.mjs';

const source=readFileSync(new URL('./review.js',import.meta.url),'utf8');
function productionFunction(name){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>=start,`missing review function ${name}`);
  return source.slice(start,end+2);
}
function harness(){
  const elements=new Map(),element=id=>{
    if(!elements.has(id))elements.set(id,{value:'0',disabled:false,textContent:'',setAttribute(){}});
    return elements.get(id);
  };
  const controls=Object.fromEntries(['clip','time','cue','cue-time','stage','orbit','distance','height','strength','reduced','replay-time'].map(id=>[id,element(id)]));
  for(const[id,value]of Object.entries({clip:'pressure_idle',time:0,cue:'','cue-time':1,stage:'final',orbit:180,distance:2.65,height:1.55,strength:1}))controls[id].value=String(value);
  controls.reduced.checked=false;
  const context={controls,$:element,normalizePressurePresentation,packShadowFrames,unpackShadowFrames,shadowFrameAt,
    recording:true,recordClock:0,lastRecorded:-1,frames:[],fixture:null,replaying:false,replayClock:0,playing:false,lastClock:0,handle:0,
    render(){},cancelAnimationFrame(){},requestAnimationFrame(){return 1;}};
  vm.createContext(context);
  vm.runInContext(['currentPerformance','cameraFrame','captureSample','setFixture','setPlaying','stopRecording'].map(productionFunction).join('\n')+
    '\nglobalThis.api={currentPerformance,captureSample,stopRecording};',context);
  return context;
}

test('review capture uses actual causal codec and replay ignores live performance controls and observer orbit',()=>{
  const h=harness();h.api.captureSample(true);
  h.recordClock=.1;h.controls.time.value='1.2';h.api.captureSample();
  h.recordClock=.2;h.controls.time.value='2.4';h.api.stopRecording();
  assert.equal(h.recording,false);assert.equal(h.frames.length,3);
  const saved=JSON.parse(JSON.stringify(h.fixture)),frames=unpackShadowFrames(saved.shadowFrames);
  assert.equal(frames[0].pressurePresentation.primary.performance.time,0);
  assert.equal(frames.at(-1).pressurePresentation.primary.performance.time,2.4);
  h.fixture=saved;h.replaying=true;h.replayClock=.1;h.controls.time.value='8.9';h.controls.orbit.value='30';
  const replay=h.api.currentPerformance();
  assert.equal(replay.primary.performance.time,1.2);
  assert.equal(replay.primary.x,-.5);assert.equal(replay.primary.y,-.5);assert.equal(replay.primary.performance.heading,0);
  assert.equal(replay.clock,.1);
});

test('review recording limits stop through actual final-sample lifecycle without recursive stop',()=>{
  const h=harness();
  for(let i=0;i<900;i++){h.recordClock=i*.101;h.controls.time.value=String((i*.101)%9.6);h.api.captureSample();}
  assert.equal(h.recording,false);assert.ok(h.frames.length<=900);
  assert.equal(h.fixture.seconds,90);
  assert.equal(unpackShadowFrames(h.fixture.shadowFrames).length,h.frames.length);
});

test('actual Arrested hunt capture holds its real root, loads before each step, and replays independently',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./arrested-performance.json',import.meta.url),'utf8'));
  const frames=unpackShadowFrames(fixture.shadowFrames);
  assert.equal(fixture.origin,'actual Presence clear-floor simulation');
  assert.equal(fixture.seconds,24);
  assert.ok(frames.length>400&&frames.length<900);
  const durations=new Set();let advances=0,pivots=0;
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1].pressurePresentation.primary,b=frames[i].pressurePresentation.primary;
    const gait=b.performance.gait,old=a.performance.gait;
    assert.ok(gait,'a saved hunt lost its simulation phase');
    if(gait.phase==='load')assert.ok(gait.duration>=.4&&gait.duration<=.6,'loading lost its readable warning');
    if(gait.phase==='arrest')durations.add(gait.duration.toFixed(2));
    if(gait.phase===old.phase&&gait.cycle===old.cycle&&['arrest','load','listen'].includes(gait.phase)){
      assert.equal(b.x,a.x,'held actor root slides');assert.equal(b.y,a.y,'held actor root slides');
      if(gait.phase==='arrest'){assert.equal(b.performance.clip,'pressure_arrest');assert.equal(b.performance.time,1);}
    }
    if(gait.phase==='advance'){
      assert.equal(b.performance.clip,gait.pivot?'pressure_pivot':'pressure_advance');
      assert.ok(gait.travelMetres>=0&&gait.travelMetres<=.420001);
      if(gait.pivot){assert.equal(gait.travelMetres,0,'a planted pivot moved the root');pivots++;}
      assert.ok(Math.hypot(b.x-gait.stepStartX,b.y-gait.stepStartY)*.5<=gait.travelMetres+.00001,'pose advance is detached from the real root');
      if(old.phase!=='advance'){assert.equal(old.phase,'load','an advance started without loading');advances++;}
    }
  }
  assert.ok(advances>=4&&durations.size>=3&&pivots>0,'hunt must contain repeated advances, a planted pivot and unequal holds');
  const still=frames.find((v,i)=>i>0&&v.pressurePresentation.primary.performance.gait.phase==='arrest'
    &&frames[i-1].pressurePresentation.primary.performance.gait.cycle===v.pressurePresentation.primary.performance.gait.cycle);
  const before=JSON.stringify(fixture),h=harness();h.fixture=fixture;h.replaying=true;h.replayClock=still.t/1000;
  const saved=h.api.currentPerformance();h.controls.orbit.value='90';h.controls.time.value='8';
  assert.deepEqual(h.api.currentPerformance(),saved,'observer controls changed the captured hunt');
  assert.equal(JSON.stringify(fixture),before,'read-only review mutated the stored hunt');
});

test('review binds production depth authority and POST identity mask, with body outside ordinary prop submissions',()=>{
  const finish=productionFunction('finish'),volume=productionFunction('finishVolume'),render=productionFunction('render');
  assert.match(finish,/uPressureGeometry',2,mask\.color/);
  assert.match(finish,/uPressureScene',3,sceneTarget\.tex/);
  assert.match(finish,/uPressurePropsDepth',4,depth/);
  assert.match(finish,/uPressureSceneDepthReady',0/);
  assert.match(volume,/uSceneDepthReady',0/);
  assert.match(render,/P\.setPressureInstances\(pressureInstances\(/);
  assert.ok(render.indexOf('P.prepareCharacterFrame')<render.indexOf('P.renderPressurePass'));
  assert.doesNotMatch(productionFunction('worldInstances'),/pressure_body/);
});

test('frozen review shader strings exactly match production expressions and their shared dependencies',()=>{
  const renderer=readFileSync(new URL('../../src/render/r3d.js',import.meta.url),'utf8');
  const expected=productionShaderBundle(renderer),actual=JSON.parse(readFileSync(new URL('./production-shaders.json',import.meta.url),'utf8'));
  assert.deepEqual(actual,expected,'renderer changed: regenerate the production shader snapshot before visual acceptance');
  assert.ok(actual.shaders.post.includes('float pressureIdentityMask'));
  assert.ok(actual.shaders.sourceVoidPhysical.includes('float unravelKeep'));
  assert.ok(actual.shaders.sourceVoidPhysical.includes('float rain'));
  assert.throws(()=>shaderDeclaration(renderer,'NOT_A_SHADER'),/missing/);
});
