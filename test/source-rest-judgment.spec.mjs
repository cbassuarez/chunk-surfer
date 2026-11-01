import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_BELLS,SOURCE_REST_BELL_EVENTS,SOURCE_REST_LIGHTNING,sourceRestJudgmentFrame,sourceRestLightningSegments} from '../src/game/source-rest-judgment.js';
import {sourceRestBellGeometryLibrary,sourceRestBellProps} from '../src/render/source-rest-bells.js';
import {sourceRestWeatherCue} from '../src/game/source-rest-weather-score.js';
import {stormFlash} from '../src/game/storm.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
const seat=SOURCE_REST_SEATS[0];

test('each audible bell has a visible hollow mouth, physical headstock and moving clapper in the listening chart',()=>{
  const models=sourceRestBellGeometryLibrary(),bell=models['rest-judgment-bell'];
  assert.ok(bell.i.length>3000);assert.ok(bell.p.every(Number.isFinite));
  const at=SOURCE_REST_BELL_EVENTS[0].at,quiet=sourceRestJudgmentFrame({clock:0}),struck=sourceRestJudgmentFrame({clock:at});
  assert.equal(quiet.bells[0].angle,0);assert.ok(struck.bells[0].angle>.4);assert.ok(struck.bells[0].clapperAngle<0);
  assert.equal(sourceRestBellProps({phase:'catch'}).length,0);
  const state={...freshSourceContinuation(),...seat,status:'active',sourceRestView:{seatId:seat.id,progress:1,look:seat.view,musicTime:at,audibleSeconds:at}};
  const frame=sourceContinuationRenderFrame(state),parts=frame.props.filter(p=>p.restBell);
  assert.equal(parts.length,12);assert.ok(parts.every(p=>p.decorative&&!p.structural));
  assert.equal(new Set(parts.map(p=>p.bellId)).size,3);
  for(const event of SOURCE_REST_BELL_EVENTS){const source=SOURCE_REST_BELLS.find(b=>b.id===event.bellId);assert.deepEqual(source.position,event.position);assert.equal(event.sample,source.sample);}
  const noBells=sourceContinuationRenderFrame({...state,phase:'catch'});assert.equal(noBells.props.some(p=>p.restBell),false);
});

test('lightning uses the actual standard channel, followed by thunder at distance over sound speed',()=>{
  for(const event of SOURCE_REST_LIGHTNING){
    const cue=sourceRestJudgmentFrame({clock:350+event.startedAt,stormAge:event.startedAt});
    assert.equal(cue.flash,stormFlash({time:event.startedAt,strikes:[event]}));
    const thunder=cue.thunder.find(x=>x.id===event.id);assert.ok(Math.abs(thunder.at-(350+event.startedAt)-event.distance/343)<1e-8);
    assert.equal(thunder.seed,event.seed);assert.equal(thunder.bearing,event.bearing);
  }
  const near=SOURCE_REST_LIGHTNING.at(-1),cue=sourceRestJudgmentFrame({clock:350+near.startedAt,stormAge:near.startedAt});
  const segments=sourceRestLightningSegments(cue);assert.ok(segments.length>5&&segments.length<=26);
  assert.ok(segments.flatMap(s=>[...s.a,...s.b]).every(Number.isFinite));
  assert.equal(sourceRestLightningSegments(cue,{flashMode:'off'}).length,0);
  assert.equal(sourceRestJudgmentFrame({clock:350+near.startedAt,stormAge:near.startedAt,flashMode:'off'}).flash,0);
  assert.ok(sourceRestJudgmentFrame({clock:350+near.startedAt,stormAge:near.startedAt,flashMode:'reduced'}).flash<=.12);
  const gone=sourceRestJudgmentFrame({clock:350+near.startedAt,stormAge:near.startedAt,progress:.96});assert.equal(gone.flash,0);assert.equal(gone.thunder.length+gone.bellEvents.length,0);
});

test('lightning events punctuate one continuous flooding storm and survive the weather-to-native routing',()=>{
  const near=SOURCE_REST_LIGHTNING.at(-2),during=sourceRestWeatherCue({audibleSeconds:350+near.startedAt,musicTime:350+near.startedAt,seated:true,progress:.68,stormAge:near.startedAt}),
    clear=sourceRestWeatherCue({audibleSeconds:365,sinceSit:365,progress:.69,seated:true});
  assert.ok(during.rain>.5);assert.ok(during.clouds>.8);assert.ok(during.flash>.5);assert.equal(sourceRestWeatherCue({seated:true,progress:.2}).rain,0);
  const state={...freshSourceContinuation(),...seat,status:'active',sourceRestView:{seatId:seat.id,progress:1,look:seat.view,weatherCue:during}};
  const on=sourceContinuationRenderFrame(state),off=sourceContinuationRenderFrame(state,{flashMode:'off'});
  assert.ok(on.props.some(p=>p.restLightning));assert.equal(off.props.some(p=>p.restLightning),false);
  assert.deepEqual(on.geometry,off.geometry);assert.ok(on.counts.lights<=8);
});
