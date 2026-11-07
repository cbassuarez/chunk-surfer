import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_HORIZON,sourceRestHorizonFrame,sourceRestHorizonSchedule,sourceRestHorizonInfall} from '../src/game/source-rest-horizon.js';
import {SOURCE_REST_PERFORMANCE} from '../src/data/source-rest-performance.js';
import {applySourceRestDestruction} from '../src/render/source-rest-destruction.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {writePropHorizonTide,sourceRestHorizonTideUniforms,sourceRestHorizonLensUniforms,SOURCE_REST_HORIZON_LENS_GLSL,SOURCE_REST_HORIZON_TIDE_GLSL} from '../src/render/source-rest-horizon-pass.js';
import {PROP_INSTANCE_FLOATS} from '../src/render/prop-instance-layout.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const passages=SOURCE_REST_PERFORMANCE.annotations.filter(a=>a.type==='grueling').sort((a,b)=>a.start-b.start),
  mistakes=SOURCE_REST_PERFORMANCE.annotations.filter(a=>a.type==='mistake').sort((a,b)=>a.start-b.start),
  frame=(time,extra={})=>sourceRestHorizonFrame({time,progress:.5,...extra});

test('the outer wheels fall at the semiangel bearing moments and the last in the final passage',()=>{
  const schedule=sourceRestHorizonSchedule(),second=passages[1],final=passages[2],end=SOURCE_REST_PERFORMANCE.duration;
  assert.ok(Math.abs(schedule.collapses[1]-(second.start+.35*(second.end-second.start)))<1e-9);
  assert.ok(Math.abs(schedule.collapses[2]-(second.start+.70*(second.end-second.start)))<1e-9);
  assert.ok(schedule.collapses[0]>final.start&&schedule.collapses[0]<end*.96,'the inner wheel keeps turning until the final passage');
  assert.deepEqual(frame(schedule.collapses[1]-.01).rings.map(r=>r.alive),[1,1,1]);
  const after=frame(schedule.collapses[2]+SOURCE_REST_HORIZON.collapseSeconds+.1);
  assert.equal(after.rings[0].alive,1);assert.equal(after.rings[1].alive,0);assert.equal(after.rings[2].alive,0);
  assert.ok(after.rings[2].inner<SOURCE_REST_HORIZON.rings[2].inner,'a falling wheel spirals onto the horizon rather than vanishing');
  assert.ok(frame(schedule.collapses[1]+.2).rings[1].flash>0);
});

test('every marked mistake closes exactly one eye for a bounded time; nothing invents mistakes',()=>{
  const schedule=sourceRestHorizonSchedule();assert.equal(schedule.mistakes.length,mistakes.length);
  assert.deepEqual(schedule.mistakes.map(m=>m.time),mistakes.map(m=>m.start));
  const before=frame(mistakes[0].start-.01),struck=frame(mistakes[0].start+.5),healed=frame(mistakes[0].start+SOURCE_REST_HORIZON.eyeDarkSeconds+.1);
  const first=schedule.mistakes[0],eye=first.ring*SOURCE_REST_HORIZON.eyes+first.eye;
  assert.equal(before.diagnostics.eyesClosed,0);assert.equal(struck.diagnostics.eyesClosed,1);
  assert.ok(struck.eyeAges[eye]<SOURCE_REST_HORIZON.eyeDarkSeconds);assert.ok(healed.eyeAges[eye]>=SOURCE_REST_HORIZON.eyeDarkSeconds,'the struck eye reopens');
  assert.equal(struck.diagnostics.mistakesHeard,1);
  assert.equal(frame(SOURCE_REST_PERFORMANCE.duration-1).diagnostics.mistakesHeard,mistakes.length);
});

test('the horizon is a pure function of the recording clock and honours blackout and reduced motion',()=>{
  assert.deepEqual(frame(321.5),frame(321.5));
  assert.equal(frame(100,{progress:.96}).active,false);
  const still=t=>frame(t,{reducedMotion:true}).rings.map(r=>r.normal);
  assert.deepEqual(still(100),still(300),'reduced motion holds the wheels still');
  assert.equal(frame(100,{reducedMotion:true}).swirl,0);
  const growth=sourceRestHorizonSchedule().growth;
  assert.equal(frame(growth[0]-1).radius,SOURCE_REST_HORIZON.radius);
  assert.ok(Math.abs(frame(growth[1]).radius-SOURCE_REST_HORIZON.finalRadius)<1e-9,'the hole reaches its last size at the existing blackout');
  const looped=sourceRestHorizonFrame({time:10,unwrappedTime:10+SOURCE_REST_PERFORMANCE.duration,progress:.5});
  assert.equal(looped.cycles,1);assert.ok(looped.rings[1].alive===0&&looped.rings[2].alive===0,'fallen wheels stay fallen on a repeat');
});

test('the CPU infall mirror pulls nearer ends faster, winds around the spin axis and parks at the horizon instead of crossing',()=>{
  const f=frame(300),near=[f.centre[0]+4,f.centre[1]-2,f.centre[2]],far=[f.centre[0]+9,f.centre[1]-2,f.centre[2]];
  const tide={release:290,anchor:1},d=p=>Math.hypot(...p.map((v,k)=>v-f.centre[k]));
  const a=sourceRestHorizonInfall(near,tide,f),b=sourceRestHorizonInfall(far,tide,f);
  assert.ok(d(a.point)/d(near)<d(b.point)/d(far),'the nearer end has fallen proportionally further: tidal stretching');
  assert.deepEqual(sourceRestHorizonInfall(near,{release:301,anchor:1},f).point,near,'nothing moves before its release');
  const hung=sourceRestHorizonInfall(near,{release:0,anchor:1},frame(700));
  assert.equal(hung.consumed,false,'proper time never lets the recording clock watch the crossing');
  const rs=frame(700).radius;
  assert.ok(d(hung.point)>=rs-1e-9&&d(hung.point)<=SOURCE_REST_HORIZON.hangApproach*rs+1e-9,
    'the point is parked between the horizon and the handoff shell');
  const farHung=sourceRestHorizonInfall(far,{release:0,anchor:1},frame(700));
  assert.equal(farHung.consumed,false,'a long proper-time fall never underflows into a fake crossing');
  assert.ok(d(farHung.point)>=rs-1e-9&&d(farHung.point)<=SOURCE_REST_HORIZON.hangApproach*rs+1e-9,
    'the far end is parked too');
  const swallow=[f.centre[0]+2.6,f.centre[1],f.centre[2]];
  assert.equal(sourceRestHorizonInfall(swallow,{release:0,anchor:1},frame(300)).consumed,false,
    'the same point hangs before the growth');
  assert.equal(sourceRestHorizonInfall(swallow,{release:0,anchor:1},frame(700)).consumed,true,
    'the grown horizon overtakes it');
});

test('mistakes take outside fittings and chips, passages take architecture, protected supports never move',()=>{
  const seat=SOURCE_REST_SEATS[0];
  const box=(id,x,y,z,s=[1,1,1],extra={})=>({id,mesh:'source-continuation-rest-stone',x,y,z,chartId:0,restSky:true,restVista:true,
    matrix:new Float32Array([s[0],0,0,0,0,s[1],0,0,0,0,s[2],0,x,y,z,1]),...extra});
  const props=[box('near-pivot-stone',-16,15.95,-22,[.5,.5,.5]),
    box('garden-pier-0',-14,4,-24,[.5,2,.5]),box('garden-cypress-0',-15,4,-19),box('garden-island-0',-19.5,3.9,-23,[8,.35,19]),
    box('garden-retaining-0',-23,4.2,-23,[.4,1.1,19]),box('floor-0',1,8.4,-21,[1,.02,1],{restPlace:true}),
    {...box('wrong-ground-west',-8,8,-21,[6,.3,6]),physicalKind:'surface',restVista:false,restSky:false,region:'wrong-return'}];
  const run=time=>{const cue={...sourceRestAfflictionFrame({currentTime:time,playedSeconds:time,active:true,progress:.5}),embodied:true,bodyProgress:1,canLeave:false};
    return applySourceRestDestruction(props,{cue,time,seat,canLeave:false,horizon:sourceRestHorizonFrame({time,progress:.5,seat})});};
  const early=run(mistakes[1].start+.2),grueling=run(passages[0].start+20),late=run(690);
  assert.ok(early.props.some(p=>p.horizonTide&&p.horizonTide.release===mistakes[1].start),'the second mistake takes a fitting');
  assert.ok(grueling.props.some(p=>String(p.id).startsWith(props[3].id+':horizon-')),'a long island is cut into exact segments while pulled');
  assert.ok(late.diagnostics.horizonChips>0,'later mistakes chip blocks once fittings run out');
  assert.ok(late.diagnostics.horizonConsumed>0,'the grown horizon overtakes the near stone at the finale');
  for(const view of[early,grueling,late]){
    assert.ok(view.props.filter(p=>p.restPlace||p.physicalKind).every(p=>!p.horizonTide),'room and walkable supports are never pulled');
  }
  const segments=grueling.props.filter(p=>String(p.id).startsWith(props[3].id+':horizon-'));
  const span=segments.reduce((sum,p)=>sum+Math.hypot(p.matrix[8],p.matrix[9],p.matrix[10]),0);
  assert.ok(Math.abs(span-19)<1e-4,'segments exactly cover the original island');
});

test('the GPU contract packs tides into the non-paper slot and binds an inert frame when absent',()=>{
  const data=new Float32Array(PROP_INSTANCE_FLOATS);
  assert.equal(writePropHorizonTide(data,0,{release:12.5,anchor:1.3,kick:.5,seed:.4,hidden:true}),true);
  assert.equal(data[24],-1);assert.ok(data[25]<-1.5);assert.equal(data[26],12.5);assert.ok(Math.abs(data[27]-1.3)<1e-6);assert.ok(data[28]<0);
  assert.equal(writePropHorizonTide(data,0,null),false);
  assert.equal(sourceRestHorizonTideUniforms(null).clock[1],0);
  const lens=sourceRestHorizonLensUniforms(frame(200));assert.equal(lens.normals.length,9);assert.equal(lens.rings.length,12);
  assert.equal(lens.ages.length,SOURCE_REST_HORIZON.rings.length*SOURCE_REST_HORIZON.eyes);
  assert.match(SOURCE_REST_HORIZON_LENS_GLSL,/layout\(location=1\) out vec4 oMark/);
  assert.match(SOURCE_REST_HORIZON_TIDE_GLSL,/float restHorizonTide\(/);
  assert.match(SOURCE_REST_HORIZON_TIDE_GLSL,/HORIZON_HANG/,'the GPU vertex program mirrors the proper-time handoff');
  assert.doesNotMatch(SOURCE_REST_HORIZON_LENS_GLSL,/float distance\b/,'no local shadows the GLSL builtin');
});
