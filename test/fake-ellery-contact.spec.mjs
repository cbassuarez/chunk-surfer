import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeElleryContact} from '../src/game/fake-ellery-contact.js';
import {fakeElleryHushActor} from '../src/render/fake-ellery-hush.js';
import {createOutcomeExposureController} from '../src/render/outcome-exposure.js';
import {pressureInstances} from '../src/render/pressure-volume.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {freshSourceEarthfallElleryAside,stepSourceEarthfallElleryAside,sourceEarthfallElleryAsideFrame} from '../src/game/source-earthfall-ellery-aside.js';
import {EARTHFALL_CHASE,earthfallChaseWorldPoint} from '../src/data/source-earthfall-chase.js';

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const local={x:68.6,z:57.05,feet:4.8,yaw:-.75,phase:'contact',elapsed:.2,eventId:'run:fake-ellery:contact'};
function fixture(){
  const controls={protected:false,ready:true,drawn:true,rejectExposure:false,acceptCommit:true,reduced:false};
  const exposures=[],sounds=[],commits=[];let audioCancels=0;
  const renderer=createOutcomeExposureController();
  const contact=createFakeElleryContact({protectedNow:()=>controls.protected,bodyReady:()=>controls.ready,
    bodyDrawn:()=>controls.drawn,reduced:()=>controls.reduced,
    setExposure:value=>{exposures.push(clone(value));return value&&controls.rejectExposure?false:renderer.set(value);},
    play:value=>sounds.push(clone(value)),cancelAudio:()=>{audioCancels++;},
    commit:value=>{commits.push(value);return controls.acceptCommit;}});
  const anchor=fakeElleryHushActor(local),checkpoint={receipt:'authorized-local-consequence'};
  const present=(elapsed,extra={})=>contact.present({eventId:local.eventId,anchor,checkpoint,elapsed,...extra});
  return{controls,exposures,sounds,commits,contact,renderer,anchor,checkpoint,present,audioCancels:()=>audioCancels};
}

test('contact cannot start from a clock, absent mesh, hidden body or protected presentation',()=>{
  for(const control of ['protected','ready','drawn']){
    const h=fixture();h.controls[control]=control==='protected';
    assert.equal(h.present(10),false);assert.equal(h.present(20),false);
    assert.equal(h.contact.snapshot(),null);assert.deepEqual(h.sounds,[]);assert.deepEqual(h.commits,[]);
  }
  const h=fixture();assert.equal(h.present(20,{anchor:null}),false);assert.equal(h.present(20,{eventId:null}),false);
  assert.deepEqual(h.commits,[]);
});

test('a physically drawn body earns the complete active exposure before one committed consequence',()=>{
  const h=fixture();assert.equal(h.present(4),false);
  assert.equal(h.sounds.length,1);assert.equal(h.sounds[0].physical,true);assert.deepEqual(h.sounds[0].anchor,h.anchor);
  assert.equal(h.sounds[0].duration,.62);assert.equal(h.renderer.snapshot().elapsed,0);
  assert.equal(h.present(4.619),false);assert.equal(h.commits.length,0);
  near(h.renderer.snapshot().elapsed,.619);
  assert.equal(h.present(4.62),true);assert.equal(h.commits.length,1);
  assert.equal(h.commits[0].eventId,local.eventId);assert.equal(h.commits[0].checkpoint,h.checkpoint);
  assert.equal(h.commits[0].exposureId,h.sounds[0].eventId);
  assert.equal(h.contact.snapshot(),null);assert.equal(h.renderer.snapshot(),null);assert.equal(h.audioCancels(),1);
  for(const elapsed of [5,6,100])assert.equal(h.present(elapsed),true);
  assert.equal(h.commits.length,1);assert.equal(h.sounds.length,1,'a spent event cannot replay the attack');
});

test('pause/protection cancels exposure and a resumed attempt gets a fresh renderer ID and full interval',()=>{
  const h=fixture();h.present(1);h.present(1.3);const first=h.sounds[0].eventId;
  h.controls.protected=true;assert.equal(h.present(2),false);
  assert.equal(h.contact.snapshot(),null);assert.equal(h.renderer.snapshot(),null);assert.equal(h.audioCancels(),1);
  h.controls.protected=false;assert.equal(h.present(20),false);
  assert.notEqual(h.sounds[1].eventId,first,'the actual renderer retires canceled IDs');
  assert.equal(h.renderer.snapshot().eventId,h.sounds[1].eventId);
  assert.equal(h.present(20.619),false);assert.equal(h.commits.length,0);
  assert.equal(h.present(20.62),true);assert.equal(h.commits.length,1);
});

test('lost body drawing discards elapsed exposure rather than charging the missing frames to the player',()=>{
  const h=fixture();h.present(0);h.present(.1);
  h.controls.drawn=false;assert.equal(h.present(.3),false);assert.equal(h.contact.snapshot(),null);
  assert.equal(h.present(2),false);assert.equal(h.commits.length,0);
  h.controls.drawn=true;assert.equal(h.present(3),false);
  assert.notEqual(h.sounds[0].eventId,h.sounds[1].eventId);
  assert.equal(h.present(3.619),false);assert.equal(h.present(3.62),true);
  assert.equal(h.commits.length,1);
});

test('a backwards saved local clock starts a new exposure without reusing a retired identity',()=>{
  const h=fixture();h.present(10);h.present(10.3);assert.equal(h.present(.1),false);
  assert.notEqual(h.sounds[0].eventId,h.sounds[1].eventId);
  assert.equal(h.present(.719),false);assert.equal(h.commits.length,0);
  assert.equal(h.present(.72),true);assert.equal(h.commits.length,1);
});

test('renderer rejection at start or during an exposure cannot authorize an unseen consequence',()=>{
  const initial=fixture();initial.controls.rejectExposure=true;
  assert.equal(initial.present(0),false);assert.deepEqual(initial.sounds,[]);assert.deepEqual(initial.commits,[]);
  assert.equal(initial.contact.snapshot(),null);
  initial.controls.rejectExposure=false;initial.present(2);assert.equal(initial.present(2.62),true);
  const h=fixture();h.present(0);h.controls.rejectExposure=true;
  assert.equal(h.present(.2),false);assert.equal(h.contact.snapshot(),null);
  assert.equal(h.commits.length,0);h.controls.rejectExposure=false;
  assert.equal(h.present(.7),false,'a rejected interval must be presented afresh');
  assert.equal(h.present(1.319),false);assert.equal(h.commits.length,0);
  assert.equal(h.present(1.32),true);assert.equal(h.commits.length,1);
});

test('a rejected checkpoint commit can retry after the demonstrated scare and spend the event only once',()=>{
  const h=fixture();h.controls.acceptCommit=false;h.present(0);
  assert.equal(h.present(.62),false);assert.equal(h.commits.length,1);
  assert.ok(h.contact.snapshot());assert.equal(h.sounds.length,1);
  const next={receipt:'later-accepted-local-consequence'};h.controls.acceptCommit=true;
  assert.equal(h.present(.7,{checkpoint:next}),true);assert.equal(h.commits.length,2);
  assert.equal(h.commits[1].checkpoint,next);assert.equal(h.commits[0].exposureId,h.commits[1].exposureId);
  assert.equal(h.present(1),true);assert.equal(h.commits.length,2);assert.equal(h.sounds.length,1);
});

test('distinct contact events and reduced presentation retain separate receipts and unchanged physical anchors',()=>{
  const h=fixture();h.controls.reduced=true;h.present(0);h.present(.62);
  const second='run:earthfall:contact';h.present(1,{eventId:second});assert.equal(h.present(1.62,{eventId:second}),true);
  assert.deepEqual(h.commits.map(value=>value.eventId),[local.eventId,second]);
  assert.ok(h.sounds.every(value=>value.reduced===true&&value.physical===true));
  assert.ok(h.sounds.every(value=>JSON.stringify(value.anchor)===JSON.stringify(h.anchor)));
});

test('copied metre coordinates convert once to the existing physical HUSH renderer without camera-dependent placement',()=>{
  const actor=fakeElleryHushActor(local,{reducedMotion:true});
  near((actor.x+.5)*CELL,local.x);near((actor.y+.5)*CELL,local.z);near(actor.floorH,local.feet);
  assert.equal(actor.id,local.eventId);assert.equal(actor.heightM,2.18);assert.equal(actor.widthM,.68);
  assert.equal(actor.performance.clip,'pressure_arrest');assert.equal(actor.performance.loop,false);
  assert.equal(actor.performance.heading,local.yaw);assert.equal(actor.performance.time,local.elapsed);
  assert.equal(actor.performance.reducedMotion,true);
  const approach=fakeElleryHushActor({...local,phase:'approach',elapsed:.7});
  assert.equal(approach.performance.clip,'pressure_advance');assert.equal(approach.performance.loop,true);
  assert.deepEqual([approach.x,approach.y,approach.floorH],[actor.x,actor.y,actor.floorH]);
  for(const value of [null,{x:NaN,z:1},{x:1,z:Infinity},{}])assert.equal(fakeElleryHushActor(value),null);
});

test('the actual exposure fade and pressure submission finish once at 60Hz after visible geometry naturally reaches zero',()=>{
  for(const reduced of [false,true]){
    const renderer=createOutcomeExposureController(),anchor=fakeElleryHushActor(local),checkpoint={receipt:'fade-tail'};
    const played=[],committed=[],submitted=[],exposureIds=new Set();let drawn=false,finished=false;
    const contact=createFakeElleryContact({bodyReady:()=>true,bodyDrawn:()=>drawn,reduced:()=>reduced,
      setExposure:value=>{if(value)exposureIds.add(value.eventId);return renderer.set(value);},
      play:value=>played.push(value),commit:value=>{committed.push(value);return true;}});
    // Match the real render ordering: current captured exposure is resolved
    // and submitted first; its next local elapsed time is accepted afterward.
    for(let tick=0;tick<60&&!finished;tick++){
      const elapsed=tick/60,actor=renderer.resolve(anchor)||anchor,instances=pressureInstances(actor,null,{reduceFlash:reduced});
      drawn=instances.length>0;submitted.push({elapsed,drawn,exposed:renderer.snapshot()!=null});
      finished=contact.present({eventId:local.eventId,anchor,elapsed,checkpoint});
    }
    assert.equal(finished,true,`reduced=${reduced}: the authored fade must not restart indefinitely`);
    assert.ok(submitted.filter(frame=>frame.exposed&&frame.drawn).length>20,'actual body geometry precedes consequence');
    const zero=submitted.find(frame=>frame.exposed&&!frame.drawn);
    assert.ok(zero,'the real pressure adapter reaches its near-zero culling boundary during this fade');
    assert.ok(zero.elapsed>=.62*.82,'only the expected final fade may complete without a new mesh submission');
    assert.equal(committed.length,1);assert.equal(committed[0].checkpoint,checkpoint);
    assert.equal(played.length,1);assert.equal(exposureIds.size,1);assert.equal(renderer.snapshot(),null);
    for(let tick=60;tick<90;tick++)assert.equal(contact.present({eventId:local.eventId,anchor,elapsed:tick/60,checkpoint}),true);
    assert.equal(committed.length,1);assert.equal(played.length,1);assert.equal(exposureIds.size,1);
  }
});

test('an actual third Earthfall contact finishes against its captured body while the room keeps moving the simulation root',()=>{
  let state=freshSourceEarthfallElleryAside({runId:'moving-third-contact'});
  Object.assign(state.gag,{complete:true,elapsed:100,emitted:31});
  const eventId=state.id+':'+state.runId+':contact:3';
  Object.assign(state.chase,{phase:'contact',elapsed:EARTHFALL_CHASE.duration*.7,compression:.4,catches:2,
    contactEventId:eventId,contactElapsed:29.8,hushX:78,hushZ:16,heading:0,grace:0});
  Object.assign(state,earthfallChaseWorldPoint({x:78,z:15.45,feet:0},state.chase));
  const renderer=createOutcomeExposureController(),plays=[],commits=[],exposureIds=new Set(),roots=[];
  let geometryReady=false,drawnActor=null,submissions=[];
  const contact=createFakeElleryContact({bodyReady:()=>geometryReady,
    bodyDrawn:expected=>geometryReady&&submissions.length>0&&drawnActor?.id===expected.id
      &&Math.hypot(drawnActor.x-expected.x,drawnActor.y-expected.y)<.02,
    setExposure:value=>{if(value)exposureIds.add(value.eventId);return renderer.set(value);},
    play:value=>plays.push(clone(value)),commit:value=>{commits.push(value);return true;}});
  let finished=false,firstVisibleTime=null,firstCaptured=null,lastActor=null;
  for(let tick=0;tick<80&&!finished;tick++){
    state=stepSourceEarthfallElleryAside(state,{dt:1/60}).state;
    assert.equal(state.chase.phase,'contact');
    const frame=sourceEarthfallElleryAsideFrame(state),actor=fakeElleryHushActor(frame.localHush);
    assert.ok(actor);assert.equal(actor.id,eventId);lastActor=actor;
    roots.push([actor.x,actor.y]);
    geometryReady=tick>=3;
    drawnActor=renderer.resolve(actor)||actor;
    submissions=geometryReady?pressureInstances(drawnActor,null):[];
    const elapsed=state.chase.contactElapsed;
    if(geometryReady&&firstVisibleTime==null){firstVisibleTime=elapsed;firstCaptured=clone(actor);}
    finished=contact.present({eventId,anchor:actor,elapsed,checkpoint:{thirdCatch:true,clock:state.clock}});
    if(!geometryReady){assert.equal(commits.length,0);assert.equal(plays.length,0);assert.equal(contact.snapshot(),null);}
    if(firstVisibleTime!=null&&elapsed-firstVisibleTime<.62-1e-8)assert.equal(commits.length,0,'moving room or old contact time cannot skip the demonstrated exposure');
    if(renderer.snapshot())assert.deepEqual([renderer.snapshot().anchor.x,renderer.snapshot().anchor.y],[firstCaptured.x,firstCaptured.y]);
  }
  assert.equal(finished,true,'compression must not restart the captured exposure until a contact clock stops advancing');
  assert.ok(state.chase.contactElapsed>30,'the actual saved contact clock must advance past the former clamp');
  assert.ok(state.chase.contactElapsed-firstVisibleTime>=.62-1e-8);
  assert.ok(state.chase.contactElapsed-firstVisibleTime<.62+1/60+1e-7);
  assert.ok(Math.hypot(lastActor.x-firstCaptured.x,lastActor.y-firstCaptured.y)>.02,'the regression genuinely moves the source beyond the host root tolerance');
  assert.ok(Math.hypot(roots.at(-1)[0]-roots[0][0],roots.at(-1)[1]-roots[0][1])>.05);
  assert.equal(plays.length,1);assert.equal(commits.length,1);assert.equal(exposureIds.size,1);
  assert.equal(commits[0].eventId,eventId);assert.equal(commits[0].checkpoint.thirdCatch,true);
  for(let tick=0;tick<10;tick++)assert.equal(contact.present({eventId,anchor:lastActor,elapsed:state.chase.contactElapsed+tick/60}),true);
  assert.equal(plays.length,1);assert.equal(commits.length,1);assert.equal(exposureIds.size,1);
});
