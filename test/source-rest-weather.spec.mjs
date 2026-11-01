import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestWeather} from '../src/game/source-rest-weather.js';
import {sourceRestWeatherCue,createSourceRestWeatherScore} from '../src/game/source-rest-weather-score.js';
import {windAt} from '../src/world/wind.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {continuationSupportAt} from '../src/data/source-continuation.js';
const seat=SOURCE_REST_SEATS[0],state=(t,cue)=>({...freshSourceContinuation(),...seat,...seat.approach,status:'active',elapsed:200,
  sourceRestView:{seatId:seat.id,progress:1,look:seat.view,musicTime:t,audibleSeconds:t,weatherCue:cue}});
function run(score,from,to,extra={}){let cue;for(let t=from;t<=to+1e-8;t+=.1)cue=score.update({active:true,seated:true,audibleSeconds:t,...extra});return cue;}

test('sunset is established before a single late storm; holds cannot extend it beyond54audible seconds',()=>{
 const score=createSourceRestWeatherScore();
 let cue;for(let t=0;t<=300;t+=.1)cue=score.update({active:true,seated:true,audibleSeconds:t,musicTime:t,progress:.4});
 assert.equal(cue.rain,0);assert.equal(cue.flood.active,false);assert.ok(cue.sunset.amount>.9);
 score.update({active:true,seated:true,audibleSeconds:340,musicTime:340,progress:.64});
 cue=run(score,340.1,360,{progress:.64,musicTime:360});assert.ok(cue.rain>.8);assert.equal(cue.flood.submersion,1);assert.ok(cue.particles.length>30);
 const held=score.update({active:true,seated:true,audibleSeconds:cue.clock,musicTime:360,progress:.64});assert.deepEqual(held,cue);
 cue=run(score,360.1,394,{progress:.64,musicTime:394});assert.equal(cue.rain,0);assert.equal(cue.flood.active,false);assert.equal(cue.stage,'last-sunset');
 cue=score.update({active:true,seated:true,audibleSeconds:430,musicTime:430,progress:.8});assert.equal(cue.rain,0,'the late event never repeats');
});

test('late fresh arrivals and ordinary exploration do not begin in a flood',()=>{
 for(const seated of [false,true]){
  const s=createSourceRestWeatherScore(),cue=s.update({active:true,seated,audibleSeconds:380,musicTime:380,progress:seated?.02:0});
  assert.equal(cue.rain,0);assert.equal(cue.flood.active,false);assert.equal(cue.judgment.flashes.length,0);
 }
});

test('standard rain respects the actual water surface and reduced-motion keeps the same event',()=>{
 const score=createSourceRestWeatherScore(),cue=run(score,0,3,{progress:.68,stormAge:15}),view=sourceRestWeather(state(3,cue));
 assert.ok(cue.particles.length>30);assert.ok(cue.particles.every(p=>p.kind==='rain'&&!p.reverse));
 assert.ok([...view.streaks,...view.roof].every(p=>p.a[1]>=cue.flood.waterY-1e-6&&p.b[1]>=cue.flood.waterY-1e-6));
 assert.equal(view.objects.length,0);
 const reduced=createSourceRestWeatherScore(),small=run(reduced,0,3,{progress:.68,stormAge:15,reducedMotion:true});
 assert.ok(small.particles.length<cue.particles.length);assert.equal(small.flood.waterY,cue.flood.waterY);
});

test('storm, wrecks and fish preserve the physical route and release before black',()=>{
 const cue=sourceRestWeatherCue({active:true,seated:true,progress:.68,stormAge:24,audibleSeconds:364}),s=state(364,cue);s.sourceRestView.degradation=.68;
 const a=sourceContinuationRenderFrame(s);assert.ok(a.props.some(p=>p.floodKind==='flood-fauna'));assert.ok(a.props.some(p=>p.floodKind==='flood-wreck'));
 assert.ok(a.flood.water.active);assert.ok(a.lights.length<=8);assert.ok(a.counts.props<760);
 const b=sourceContinuationRenderFrame({...s,sourceRestView:{...s.sourceRestView,weatherCue:sourceRestWeatherCue({active:true,seated:true,progress:.68,stormAge:54,audibleSeconds:394})}});
 assert.deepEqual(a.geometry,b.geometry);assert.equal(b.props.some(p=>p.restFlood),false);
 assert.equal(sourceRestWeather({...s,phase:'catch'}),null);
 const last=sourceRestWeatherCue({active:true,seated:true,progress:.96,stormAge:24});assert.equal(last.rain,0);
});
