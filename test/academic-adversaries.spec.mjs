import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademicAdversaries,createAcademicAdversariesState} from '../src/game/academic-adversaries.js';
import {ACADEMIC_ADVERSARY_TIMING as T,ACADEMIC_HELD_GEOMETRY,
  academicHeldSegmentHits,academicHeldCrossing,academicHeldStrikeHeight,academicHeldStrikeWindow,
  academicHeldContact,academicHeldFrame} from '../src/data/academic-adversaries.js';

// A deliberately simple synthetic shape exercises the generic contract. Final
// mesh/compiled-floor coverage is separately required for production geometry.
const geometry=Object.freeze({ready:true,cueAt:{x:9,y:247.5},playerRadius:.2,
  damageBounds:{x0:8.6,y0:247.4,x1:9.4,y1:247.7},
  crossingGate:{axis:'y',at:249.8,min:7.5,max:11,direction:1},
  frame:view=>({visible:true,at:{x:9,y:247.5},height:view.phase==='strike'?1.7:2.8,
    scale:1,yaw:Math.PI,clipTime:view.elapsed}),
});
const context={group:'academic',player:{x:9,y:245},ready:true,aware:true};
const make=(saved={demonstrated:true},options={})=>createAcademicAdversaries(saved,{geometry,...options});
function advance(controller,seconds,overrides={}){
  const events=[];for(let elapsed=0;elapsed<seconds-1e-9;elapsed+=.1)
    events.push(...controller.tick(Math.min(.1,seconds-elapsed),{...context,...overrides}));
  return events;
}
function until(controller,phase,overrides={},limit=200){
  const events=[];
  for(let i=0;i<limit&&controller.view().phase!==phase;i++)events.push(...controller.tick(.1,{...context,...overrides}));
  assert.equal(controller.view().phase,phase);return events;
}
const resolved=events=>events.filter(event=>event.type==='resolved');

test('terminal normalization preserves legacy-spent without inventing clean success',()=>{
  const legacy=make(undefined,{legacyHeldComplete:true});
  assert.equal(legacy.save().outcome,'legacy-spent');assert.equal(legacy.frame().visible,false);
  assert.deepEqual(advance(legacy,20),[]);
  assert.equal(createAcademicAdversariesState({outcome:'clean'},{legacyHeldComplete:true}).outcome,'clean');
  assert.equal(createAcademicAdversariesState({outcome:'unknown'},{legacyHeldComplete:true}).outcome,'legacy-spent');
  assert.equal(createAcademicAdversariesState({version:1,outcome:null,demonstrated:true},{legacyHeldComplete:true}).outcome,null,
    'an explicitly saved current unresolved encounter takes precedence over the migration-only legacy flag');
  assert.equal(createAcademicAdversariesState(null).outcome,null);
});

test('state serializes only normalized outcome, demonstration and bounded counters',()=>{
  const state=createAcademicAdversariesState({demonstrated:true,phase:'strike',elapsed:50,warningComplete:true,
    counters:{warnings:100000,strikes:-5,aborts:'2.9',suspensions:'invalid',unknown:7}});
  assert.deepEqual(Object.keys(state).sort(),['version','outcome','demonstrated','counters'].sort());
  assert.deepEqual(state.counters,{approaches:0,demonstrations:0,warnings:9999,strikes:0,aborts:2,suspensions:0});
  const c=make(state);assert.equal(c.view().phase,'dormant');assert.equal(c.view().warningComplete,false);
});

test('original corridor lure and harmless first reveal/traverse remain distinct from attacks',()=>{
  const c=make({}),p={x:9,y:256};
  assert.equal(c.tick(.1,{...context,player:p})[0].cue,'lure-studio');
  assert.equal(c.view().phase,'lure');assert.equal(c.frame().visible,false);
  assert.ok(advance(c,T.lureCadence,{player:p}).some(event=>event.cue==='lure-chamber'));
  assert.equal(c.tick(.1,context)[0].cue,'reveal');
  until(c,'demonstration');
  assert.equal(c.frame().threatActive,false);assert.equal(c.frame().scale,1.35);
  const events=until(c,'warning',{player:{x:9,y:247.5}});
  assert.equal(resolved(events).length,0);assert.equal(c.save().demonstrated,true);
  assert.equal(c.save().counters.demonstrations,1);
  assert.equal(c.frame().threatActive,false);assert.equal(c.view().elapsed,0);
});

test('waiting, ordinary walking and retreat need no interaction or recording verb',()=>{
  const c=make();until(c,'warning');
  assert.equal(resolved(advance(c,3.1)).length,0);assert.equal(c.view().phase,'warning');
  c.tick(.1,context);assert.equal(c.view().phase,'strike');
  assert.equal(resolved(advance(c,.8)).length,0);assert.equal(c.view().phase,'rest');
  const events=c.tick(.1,{...context,player:{x:9,y:251}});
  assert.deepEqual(resolved(events).map(({outcome,composureCost})=>({outcome,composureCost})),[{outcome:'clean',composureCost:0}]);
  assert.equal(c.save().outcome,'clean');
});

test('a fast warned player segment cannot tunnel through the fixed body proxy',()=>{
  const c=make();until(c,'strike');
  const events=c.tick(.1,{...context,player:{x:9,y:250.5}});
  assert.equal(resolved(events).length,1);assert.equal(resolved(events)[0].outcome,'struck');
  assert.equal(resolved(events)[0].composureCost,5);assert.equal(c.view().phase,'withdraw');
  assert.equal(c.frame().threatActive,false);
  assert.deepEqual(resolved(advance(c,30,{player:{x:9,y:247.5}})),[]);
  assert.equal(c.view().phase,'done');assert.equal(c.frame().visible,false);
});

test('no contact on transition or zero-time bridge and no unearned rest-crossing credit',()=>{
  const c=make();until(c,'warning');advance(c,3.1);
  assert.equal(resolved(c.tick(.1,{...context,player:{x:9,y:247.5}})).length,0);
  assert.equal(c.view().phase,'strike');
  assert.equal(resolved(c.tick(0,{...context,player:{x:9,y:250.5}})).length,0);
  const wrongWay=make();until(wrongWay,'rest',{player:{x:9,y:251}});
  assert.equal(resolved(wrongWay.tick(.1,{...context,player:{x:9,y:245}})).length,0);
});

test('the complete3.2-second warning precedes every strike, including later cycles',()=>{
  const c=make();until(c,'warning');
  advance(c,3.19);assert.equal(c.view().phase,'warning');
  c.tick(.01,context);assert.equal(c.view().phase,'strike');
  advance(c,T.strike);assert.equal(c.view().phase,'rest');
  advance(c,T.rest-.1);assert.equal(c.view().phase,'rest');
  c.tick(.1,context);assert.equal(c.view().phase,'warning');assert.equal(c.view().elapsed,0);
  advance(c,T.warning-.1);assert.equal(c.view().phase,'warning');
  c.tick(.1,context);assert.equal(c.view().phase,'strike');
  assert.equal(c.save().counters.warnings,2);assert.equal(c.save().counters.strikes,2);
});

test('pause/focus/hidden/foreign speech/HUSH/loan all stop strike and require a fresh warning',()=>{
  for(const flag of [{suspended:true},{paused:true},{hidden:true},{focused:false},{nativeFocused:false},
    {speechBusy:true},{hushBusy:true},{loanBusy:true}]){
    const c=make();until(c,'strike');
    const stop=c.tick(.1,{...context,...flag,player:{x:9,y:247.5}});
    assert.equal(stop.filter(event=>event.type==='stop').length,1,JSON.stringify(flag));
    assert.equal(resolved(stop).length,0);assert.equal(c.view().phase,'suspended');assert.equal(c.frame().threatActive,false);
    assert.deepEqual(advance(c,50,{...flag,player:{x:9,y:247.5}}),[]);
    assert.equal(c.view().elapsed,0);
    const resume=c.tick(.1,context);assert.equal(resume[0].cue,'warning');assert.equal(c.view().elapsed,0);
    advance(c,3.1);assert.equal(c.view().phase,'warning');
  }
});

test('explicit geometry/readiness/awareness fail closed rather than assuming the cue was perceived',()=>{
  const absent=createAcademicAdversaries({demonstrated:true});
  advance(absent,40);assert.notEqual(absent.view().phase,'strike');
  const c=make();advance(c,40,{ready:undefined});assert.equal(c.view().phase,'dormant');
  advance(c,40,{aware:undefined});assert.equal(c.view().phase,'dormant');assert.equal(c.save().counters.approaches,0);
  until(c,'strike');c.tick(.05,context);c.tick(.1,{...context,aware:false,player:{x:9,y:247.5}});
  assert.equal(c.view().phase,'suspended');assert.equal(c.view().warningComplete,false);
  c.tick(.1,context);assert.equal(c.view().phase,'warning');assert.equal(c.view().elapsed,0);
});

test('leaving local space aborts without credit or cross-floor contact; re-entry warns anew',()=>{
  const c=make();until(c,'strike');
  const events=c.tick(.1,{...context,group:'basement',player:{x:9,y:247.5}});
  assert.equal(events[0].reason,'left-local-area');assert.equal(resolved(events).length,0);
  assert.equal(c.view().phase,'dormant');assert.equal(c.save().outcome,null);
  assert.equal(c.save().demonstrated,true);assert.equal(c.save().counters.aborts,1);
  c.tick(.1,context);assert.equal(c.view().phase,'warning');assert.equal(c.view().elapsed,0);
  c.tick(.1,{...context,player:{x:30,y:250}});assert.equal(c.view().phase,'dormant');
});

test('cold reload does not preserve a dangerous clock or duplicate a resolved cost',()=>{
  const active=make();until(active,'strike');const saved=active.save();
  assert.equal(saved.outcome,null);assert.equal(saved.demonstrated,true);assert.equal('elapsed' in saved,false);
  const restarted=make(saved);assert.equal(restarted.view().phase,'dormant');
  restarted.tick(.1,context);assert.equal(restarted.view().phase,'warning');assert.equal(restarted.view().elapsed,0);
  until(restarted,'strike');assert.equal(resolved(restarted.tick(.1,{...context,player:{x:9,y:250.5}})).length,1);
  const finished=make(restarted.save());assert.equal(finished.view().phase,'done');
  assert.deepEqual(advance(finished,40,{player:{x:9,y:247.5}}),[]);
  const copy=finished.save();copy.counters.strikes=0;assert.notEqual(finished.save().counters.strikes,0);
});

test('repeated same-clock frame queries are pure and cannot advance an attack',()=>{
  const c=make();until(c,'warning');const before=c.view(),first=c.frame();
  for(let i=0;i<10;i++)assert.deepEqual(c.frame(),first);
  assert.deepEqual(c.view(),before);
  c.load({demonstrated:true,phase:'strike',elapsed:.79});assert.equal(c.view().phase,'dormant');
});

test('segment helpers include thin crossings and reject invalid/parallel/out-of-span cases',()=>{
  const bounds={x0:0,y0:0,x1:1,y1:1};
  assert.equal(academicHeldSegmentHits({x:-3,y:.5},{x:3,y:.5},bounds),true);
  assert.equal(academicHeldSegmentHits({x:.5,y:.5},{x:.5,y:.5},bounds),true);
  assert.equal(academicHeldSegmentHits({x:-3,y:2},{x:3,y:2},bounds),false);
  assert.equal(academicHeldSegmentHits({x:-3,y:1.1},{x:3,y:1.1},bounds,.11),true);
  assert.equal(academicHeldSegmentHits({x:-.19,y:-.19},{x:-.19,y:-.19},bounds,.2),false,'round player does not hit a square-expanded corner');
  assert.equal(academicHeldSegmentHits({x:-.14,y:-.14},{x:-.14,y:-.14},bounds,.2),true);
  assert.equal(academicHeldSegmentHits({x:NaN,y:0},{x:1,y:0},bounds),false);
  assert.equal(academicHeldSegmentHits({x:0,y:0},{x:1,y:0},{x0:2,x1:1,y0:0,y1:1}),false);
  const gate={axis:'y',at:1,min:0,max:2,direction:1};
  assert.equal(academicHeldCrossing({x:1,y:0},{x:1,y:2},gate),true);
  assert.equal(academicHeldCrossing({x:3,y:0},{x:3,y:2},gate),false);
  assert.equal(academicHeldCrossing({x:1,y:2},{x:1,y:0},gate),false);
  assert.equal(academicHeldCrossing({x:1,y:1},{x:1,y:2},gate),false);
});

test('production compact pose and active interval share exact height-derived timing',()=>{
  const g=ACADEMIC_HELD_GEOMETRY,window=academicHeldStrikeWindow(g);
  assert.equal(g.ready,true);assert.equal(g.scale,.9);assert.deepEqual(g.anchorAt,{x:9,y:246});
  assert.equal(academicHeldStrikeHeight(0),2.1);assert.equal(academicHeldStrikeHeight(.18),1.2);
  assert.equal(academicHeldStrikeHeight(.48),1.2);assert.equal(academicHeldStrikeHeight(.8),2.1);
  assert.ok(window.start>.1&&window.start<.18);assert.ok(window.end>.48&&window.end<.8);
  assert.ok(Math.abs(academicHeldStrikeHeight(window.start)-g.activeHeight)<1e-9);
  assert.ok(Math.abs(academicHeldStrikeHeight(window.end)-g.activeHeight)<1e-9);
  const b=g.damageBounds,midY=(b.y0+b.y1)/2;
  assert.equal(academicHeldSegmentHits({x:b.x0-.23,y:b.y0-.23},{x:b.x0-.23,y:b.y0-.23},b,g.playerRadius),false,
    'real player radius must not acquire square-corner reach');
  assert.equal(academicHeldSegmentHits({x:b.x0-.2,y:midY},{x:b.x0-.2,y:midY},b,g.playerRadius),true);
  assert.equal(academicHeldContact({x:9,y:245},{x:9,y:250},0,.1),false,'high early sweep cannot catch a player segment');
  assert.equal(academicHeldContact({x:9,y:245},{x:9,y:250},.2,.3),true,'active low sweep catches actual crossing');
  assert.equal(academicHeldContact({x:9,y:245},{x:9,y:250},.7,.8),false,'raised late sweep cannot hurt');
});

test('real safe waiting points survive full cycles while a player left beneath the wings is struck once',()=>{
  for(const player of [{x:9,y:246.4},{x:9,y:249.4}]){
    const c=createAcademicAdversaries({demonstrated:true});
    const events=advance(c,15,{player});assert.equal(resolved(events).length,0);
    assert.equal(c.save().outcome,null);assert.ok(c.save().counters.strikes>=2);
  }
  const c=createAcademicAdversaries({demonstrated:true}),player={x:9,y:248.5};
  until(c,'strike',{player});
  assert.equal(c.frame().threatActive,false,'start of descending sweep remains high and harmless');
  const events=advance(c,.3,{player});assert.equal(resolved(events).length,1);assert.equal(c.save().outcome,'struck');
  assert.match(events.find(e=>e.cue==='struck').caption,/once/);
});

test('real rest-crossing works in either direction, including the existing gallery entrance route',()=>{
  for(const [from,to] of [[{x:9,y:246.4},{x:9,y:249.4}],[{x:9,y:249.4},{x:9,y:246.4}]]){
    const c=createAcademicAdversaries({demonstrated:true});until(c,'rest',{player:from});
    assert.equal(resolved(c.tick(.1,{...context,player:to}))[0]?.outcome,'clean');
  }
});

test('first-warning root and garment pose values join continuously and stay harmless throughout travel',()=>{
  const end=academicHeldFrame({phase:'demonstration',elapsed:T.demonstration,poseTime:8});
  const begin=academicHeldFrame({phase:'warning',elapsed:0,poseTime:8,warningFrom:end});
  for(const key of ['at','anchorAt','height','scale','yaw','pitch','crossing','descent','wingTension','wheelAngle','clipTime'])
    assert.deepEqual(begin[key],end[key],key);
  const fixed=academicHeldFrame({phase:'warning',elapsed:1.2,poseTime:9.2,warningFrom:end});
  assert.deepEqual(fixed.at,ACADEMIC_HELD_GEOMETRY.at);assert.equal(fixed.height,2.1);assert.equal(fixed.scale,.9);
  assert.equal(fixed.threatActive,false);
  const rest=academicHeldFrame({phase:'rest',elapsed:0,poseTime:10,warningComplete:false});
  const next=academicHeldFrame({phase:'warning',elapsed:0,poseTime:10,warningFrom:rest});
  assert.deepEqual(next.at,rest.at);assert.equal(next.height,rest.height);
});

test('suspension freezes exact rendered body and harmful phases restart warning from that pose',()=>{
  const shape=frame=>{const {phase,threatActive,...rest}=frame;return rest;};
  for(const target of ['demonstration','warning','strike','rest']){
    const c=createAcademicAdversaries(target==='demonstration'?{}:{demonstrated:true});
    until(c,target);advance(c,target==='strike'?.2:.3);
    const before=c.view(),body=c.frame();assert.equal(body.visible,true);
    c.tick(.1,{...context,paused:true});
    assert.deepEqual(shape(c.frame()),shape(body),target);
    advance(c,20,{paused:true});assert.deepEqual(shape(c.frame()),shape(body),target);
    assert.equal(c.frame().threatActive,false);
    c.tick(.1,context);
    assert.deepEqual(shape(c.frame()),shape(body),target);
    if(target==='demonstration'){
      assert.equal(c.view().phase,target);assert.equal(c.view().elapsed,before.elapsed);
    }else{
      assert.equal(c.view().phase,'warning');assert.equal(c.view().elapsed,0);
      advance(c,3.1);assert.equal(c.view().phase,'warning');
    }
  }
});

test('withdrawal begins at actual active first-contact pose and freezes with native focus loss',()=>{
  const c=createAcademicAdversaries({demonstrated:true}),player={x:9,y:248.5};
  until(c,'strike',{player});
  const events=advance(c,.2,{player});assert.equal(resolved(events).length,1);
  const frozen=c.frame(),hitTime=academicHeldStrikeWindow().start;
  assert.ok(Math.abs(frozen.height-academicHeldStrikeHeight(hitTime))<1e-9);
  c.tick(.1,{...context,nativeFocused:false});assert.deepEqual(c.frame(),frozen);
  const saved=c.save();assert.equal(saved.outcome,'struck');assert.equal('withdrawFrom' in saved,false);
});

test('repeated fixed updates before first phase paint grant no warning time, contact or crossing credit',()=>{
  for(const phase of ['warning','strike','rest']){
    const c=createAcademicAdversaries({demonstrated:true});until(c,phase);
    const counters=c.save().counters;
    for(let i=0;i<80;i++){
      const player=i%2?{x:9,y:249.4}:{x:9,y:246.4};
      assert.deepEqual(c.tick(.1,{...context,player,aware:false}),[]);
      assert.equal(c.view().phase,phase);assert.equal(c.view().elapsed,0);
    }
    assert.deepEqual(c.save().counters,counters);assert.equal(c.save().outcome,null);
    const after=c.tick(.1,{...context,player:{x:9,y:249.4}});
    assert.equal(resolved(after).length,0);assert.ok(c.view().elapsed>0);
    c.tick(.1,{...context,aware:false});assert.equal(c.view().phase,'suspended');
  }
});
