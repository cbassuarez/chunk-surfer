import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVE_TIME_SKIPS as T,createTimeSkipDirector,contactWithin,hazardRoadPose,hazardSceneRows} from '../src/game/source-drive/time-skips.js';
import {createDoorDriveTeaser} from '../src/game/source-drive/door-teaser.js';
import {openingWorldAt,openingRoadSurfaceAt,OPENING_ROAD} from '../src/game/source-drive/opening-road.js';
import {RADIO_DIAL_CUT} from '../src/audio/radio-dial-cut.js';
import {radioDialStaticAlpha} from '../src/render/radio-dial-static.js';

const advance=(c,seconds,input={})=>{for(let t=0;t<seconds-1e-9;){const h=Math.min(1/60,seconds-t);c.update(h,{input});t+=h;}};
// A driver who keeps to the left lane through the bends, and can stand on the brake.
function steering(c,base){
  if(base.brake)return{brake:true};
  const d=c.snapshot().driveState,r=openingRoadSurfaceAt(d.x,d.z),err=r.offset+1.35,head=Math.atan2(Math.sin(d.heading-r.heading),Math.cos(d.heading-r.heading)),score=err*.35+head*2.2;
  return{...base,left:score>.04,right:score<-.04};
}
const cutsOf=(c,seconds,input)=>{const seen=[];let last=0;for(let t=0;t<seconds;t+=1/60){c.update(1/60,{input:steering(c,input)});const tuning=c.snapshot().vehiclePose?.tuning;if(tuning&&tuning.serial!==last){last=tuning.serial;seen.push(tuning);}}return seen;};

test('the cliff drive comes apart into stretches of one night, often the same road again, ending on the edge',()=>{
  const s=T.stretches;assert.ok(s.length>=6);
  assert.equal(s[0].start.d,OPENING_ROAD.spawn,'it starts where the drive always started');
  assert.equal(s.at(-1).until,null,'the last stretch runs on to the queue and the edge');
  assert.ok(s.some((row,k)=>k>0&&row.start.d<s[k-1].start.d),'at least once it goes back down the same road, later');
  for(const row of s){assert.ok(['service','company','music'].includes(row.station),row.id);}
  for(let k=1;k<s.length;k++)assert.notEqual(s[k].station,s[k-1].station,'every cut lands on another station');
  const kinds=s.filter(row=>row.hazard).map(row=>row.hazard.kind);
  for(const kind of['figure','lorry','van','bus'])assert.ok(kinds.includes(kind),kind);
});

test('the cut is the dial: out, the van moved in the dark middle, back in; contact is cut before it happens',()=>{
  assert.ok(T.cut.placeAt>0&&T.cut.placeAt<T.cut.seconds&&T.cut.seconds<1.2,'quick, to jar');
  assert.ok(T.cut.contactLead>.15&&T.cut.contactLead<.6);
  assert.ok(RADIO_DIAL_CUT.clicks.length>=3,'detent clicks under the fingers');assert.ok(RADIO_DIAL_CUT.land>.6);
  assert.ok(radioDialStaticAlpha(.5)>radioDialStaticAlpha(.1)&&radioDialStaticAlpha(0)<.01&&radioDialStaticAlpha(1)<.01);
  assert.ok(radioDialStaticAlpha(.5,{reducedFlash:true})<radioDialStaticAlpha(.5));
});

test('a figure stood in the lane is cut on contact if he drives at it, and never if he steers round or stops',()=>{
  const director=()=>{const d=createTimeSkipDirector({worldAt:openingWorldAt,distanceOf:v=>openingRoadSurfaceAt(v.x,v.z).distance});d.advance();return d;};
  const figure=T.stretches[1].hazard,at=openingWorldAt(figure.d-3,-1.35);
  const going={x:at.x,z:at.z,heading:at.heading,speed:13,lateralSpeed:0};
  assert.equal(director().update(going,1/60)?.reason,'contact');
  const round=openingWorldAt(figure.d-3,1.6);assert.equal(director().update({...going,x:round.x,z:round.z},1/60),null,'the other lane is clear');
  assert.equal(director().update({...going,speed:0},1/60),null,'stopped short of it, nothing happens');
});

test('the lorry comes over the line on the bend, and its lamps point at him',()=>{
  const h=T.stretches.find(s=>s.id==='oncoming').hazard,early=hazardRoadPose(h,0),late=hazardRoadPose(h,(h.d-h.drift.end)/h.speed);
  assert.ok(early.lateral>0,'it starts on its own side');assert.ok(late.lateral<0,'and drifts onto his');
  const d=createTimeSkipDirector({worldAt:openingWorldAt,distanceOf:v=>openingRoadSurfaceAt(v.x,v.z).distance});for(let k=0;k<3;k++)d.advance();
  const rows=hazardSceneRows(d.hazard({x:0,z:600}));
  assert.ok(rows.props.some(p=>p.mesh==='rc_flatbed'));assert.equal(rows.lamps.length,2);
});

test('waiting never moves the night on; driving does, and the edge is still the end',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);c.input('brake');
  assert.equal(cutsOf(c,40,{brake:true}).length,0,'stopped on the road, nothing cuts');
  const d=createDoorDriveTeaser();d.start();advance(d,.81);
  const cuts=cutsOf(d,40,{forward:true});
  assert.ok(cuts.length>=2,`driving on cuts the night apart (${cuts.length})`);
  assert.equal(cuts[0].from,0);assert.equal(cuts[0].to,1);
  const s=d.snapshot();assert.ok(s.vehiclePose.stretch.index>=2);assert.equal(s.controlsEnabled||s.phase==='time-skip',true);
});

test('during the turn the controls are not his, and the van comes back going about as fast as it was',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);
  let tuning=null;for(let t=0;t<30&&!tuning;t+=1/60){c.update(1/60,{input:steering(c,{forward:true})});tuning=c.snapshot().vehiclePose?.tuning;}
  assert.ok(tuning);assert.equal(c.snapshot().controlsEnabled,false);assert.equal(c.input('left'),false);
  advance(c,T.cut.seconds+.05);const after=c.snapshot();
  assert.equal(after.vehiclePose.tuning,null);assert.equal(after.controlsEnabled,true);
  assert.ok(after.driveState.speed>=6,'still going');
  const start=T.stretches[1].start,at=openingRoadSurfaceAt(after.driveState.x,after.driveState.z).distance;
  assert.ok(Math.abs(at-start.d)<25,`on the next stretch (${at.toFixed(1)} near ${start.d})`);
});
