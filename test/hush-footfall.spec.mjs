import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUSH_FOOTFALL as F,SOURCE_FOOTFALL as SF,createHushFootfallTracker,createTravelFootfallTracker,hushFootfallPlan,hushFootfallCaption} from '../src/game/hush-footfall.js';
import {freshPressureGait,stepPressureGait,PRESSURE_GAIT} from '../src/game/pressure-gait.js';

const main=readFileSync('src/main.js','utf8');
const body=name=>{const at=main.indexOf(`function ${name}(`);assert.ok(at>=0,name);return main.slice(at,main.indexOf('\n}\n',at));};
const near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const plan=(extra={})=>hushFootfallPlan({metres:5,...extra});
// The real scheduler, walking a long way.
function walk(seconds,{dt=1/60,proximity=0,listening=false,targetX=1000}={}){
  const tracker=createHushFootfallTracker(),events=[];
  let x=0,y=0,gait=freshPressureGait({seed:7}),t=0;
  tracker.step(gait);
  for(;t<seconds;t+=dt){
    const next=stepPressureGait(gait,{dt,x,y,targetX,targetY:y,speed:listening?0:3,proximity,listening});
    x=next.x;y=next.y;gait=next.gait;
    for(const event of tracker.step(gait))events.push({...event,t});
  }
  return {events,x,gait};
}

test('one foot per stride of its real gait, and the floor takes the load first',()=>{
  const {events,x,gait}=walk(60);
  const plants=events.filter(e=>e.kind==='plant'),loads=events.filter(e=>e.kind==='load');
  assert.ok(plants.length>=10,`${plants.length} strides in a minute`);
  assert.ok(Math.abs(plants.length-gait.cycle)<=1,'exactly one per completed stride');
  assert.ok(Math.abs(plants.length*PRESSURE_GAIT.strideMetres-x*.5)<PRESSURE_GAIT.strideMetres*1.5,'each foot is a stride really travelled');
  for(let i=1;i<events.length;i++)assert.notEqual(events[i].kind,events[i-1].kind,'load, foot, load, foot');
  assert.equal(events[0].kind,'load');
});

test('the steps slow down as it gets closer',()=>{
  const gap=proximity=>{const p=walk(90,{proximity}).events.filter(e=>e.kind==='plant');return (p.at(-1).t-p[0].t)/(p.length-1);};
  const far=gap(0),close=gap(1);assert.ok(close>far+.8,`${close} against ${far}`);
});

test('nothing while it listens or stands, and a long frame still lands the foot',()=>{
  assert.equal(walk(20,{listening:true}).events.length,0,'it goes quiet to listen');
  assert.ok(walk(60,{dt:.2}).events.filter(e=>e.kind==='plant').length>=8,'slow machines keep the walk');
});

test('arriving mid-stride invents nothing, and a redirect through the atlas is not a step',()=>{
  const tracker=createHushFootfallTracker(),g=freshPressureGait();
  assert.deepEqual(tracker.step({...g,phase:'advance',progress:.95}),[],'no retroactive foot');
  assert.deepEqual(tracker.step({...g,phase:'advance',progress:.97}),[]);
  const t2=createHushFootfallTracker();t2.step(g);t2.step({...g,phase:'load'});
  assert.deepEqual(t2.step({...g,phase:'advance',redirect:true,progress:1}),[]);
  assert.deepEqual(t2.step({...g,phase:'arrest',redirect:true}),[]);
  const t3=createHushFootfallTracker();t3.step(g);t3.step({...g,phase:'load'});t3.step({...g,phase:'advance',progress:.2});
  assert.equal(t3.step({...g,phase:'recover'})[0].kind,'blocked','it walks into something');
  t3.step({...g,phase:'arrest'});t3.step({...g,phase:'load'});t3.step({...g,phase:'advance',progress:.2});
  assert.deepEqual(t3.step({...g,phase:'recover'}),[],'held at a wall, it does not knock forever');
  t3.step({...g,phase:'arrest'});t3.step({...g,phase:'load'});t3.step({...g,phase:'advance',progress:.9});t3.step({...g,phase:'arrest'});
  t3.step({...g,phase:'load'});t3.step({...g,phase:'advance',progress:.2});
  assert.equal(t3.step({...g,phase:'recover'})[0].kind,'blocked','but a real step later, it can meet something new');
  assert.deepEqual(t3.step(null),[],'and gone is gone');
  const t4=createHushFootfallTracker();t4.step(g);t4.step({...g,phase:'load'});t4.step({...g,phase:'advance',pivot:true,progress:.1});
  assert.equal(t4.step({...g,phase:'advance',pivot:true,progress:.9})[0].kind,'pivot','a turn scrapes');
});

test('proximity: louder and heavier as it nears, then silent at arm\'s length',()=>{
  const close=plan({metres:2}),mid=plan({metres:6}),far=plan({metres:20}),end=plan({metres:70});
  assert.ok(close.dryGain>mid.dryGain&&mid.dryGain>far.dryGain);assert.ok(close.body.fromHz>150&&close.body.peak>0,'weight small speakers can play');assert.ok(close.thump.peak>mid.thump.peak*1.4,'the thump falls off faster than the heel');
  assert.equal(end.audible,false,'a long way off is a long way off');
  assert.equal(plan({metres:F.silentMetres-.01}).audible,false);assert.equal(plan({metres:F.silentMetres+.01}).audible,true);
  assert.ok(F.silentMetres>.72,'it stops before the catch radius, so the hit has silence');
  assert.equal(plan({metres:Infinity}).audible,false);
  assert.equal(plan({kind:'load',metres:F.creakMetres+1}).audible,false,'the floor only groans close to');
  assert.ok(plan({kind:'load',metres:4}).creak.peak>0);assert.equal(plan({kind:'load',metres:4}).dryGain,0);
});

test('occlusion: a wall takes the level and the top, and leaves the low end',()=>{
  const open=plan(),wall=plan({occlusionDb:15}),thick=plan({occlusionDb:30});
  assert.ok(wall.dryGain<open.dryGain*.2);assert.ok(wall.lowpassHz<open.lowpassHz/2);assert.ok(thick.lowpassHz<wall.lowpassHz);
  assert.equal(wall.highpassHz,28,'no thinning through a wall');assert.ok(open.highpassHz>28);
  assert.ok(wall.wet<open.wet);
  assert.equal(plan({metres:30,occlusionDb:36}).audible,false,'enough building and it is gone');
  const b=body('playHushFootfall');assert.match(b,/acousticOcclusionDb\(hush,listener\)\+basementWatcherAcousticFirewallDb\(hush,listener\)/,'the same walls, doors and floors as every other sound');
});

test('spatial: the plan puts it where the body really is, around and above or below the head',()=>{
  const at=b=>plan({metres:4,bearing:b}).position;
  near(at(0).x,0);near(at(0).z,-4);near(at(Math.PI/2).x,4);near(at(-Math.PI/2).x,-4);near(at(Math.PI).z,4);
  assert.equal(plan({riseM:-1.5}).position.y,-1.5,'feet are below the ears');assert.equal(plan({riseM:3}).position.y,3,'or on the floor above');
  const b=body('playHushFootfall');assert.match(b,/bearing=Math\.atan2\(dx,-dz\)-yaw/);assert.match(b,/FP\.logicalToPhysical\(actor\.x,actor\.y\)/);
  const player=readFileSync('src/audio/hush-footsteps.js','utf8');assert.match(player,/panningModel = 'HRTF'/);assert.match(player,/rolloffFactor = 0/,'distance is the plan\'s, not counted twice');
});

test('Pressure: the field eats its top and the room\'s answer, and the room falling away leaves the feet',()=>{
  const clear=plan(),pressed=plan({absorption:1});
  assert.ok(pressed.lowpassHz<clear.lowpassHz*.5);assert.ok(pressed.wet<clear.wet*.2);assert.equal(pressed.dryGain,clear.dryGain,'but not the step itself');
  assert.match(main,/hushStepBus=actx\.createGain\(\);hushStepBus\.connect\(limiter\);/,'past the Hush field and the vacuum');
  assert.match(main,/setGainNode\(hushStepBus, paused \? 0 : v\);/,'and still under the player\'s SFX level');
  assert.match(body('playHushFootfall'),/absorption:hushFieldFrame\?\.presentation\?\.audio\?\?hushFieldFrame\?\.absorption\?\.audio\?\?0/,'the setting-scaled reading');
});

test('its rhythm: heavy strides, tiny shuffles between them, and a drag on some',()=>{
  assert.equal(plan({cycle:2}).drag,null);assert.equal(plan({cycle:3}).drag,null);const drag=plan({cycle:5}).drag;assert.ok(drag&&drag.delay>.3&&drag.gain<plan({cycle:5}).dryGain*.5);
  const shuffle=plan({strideMetres:.08,cycle:5}),stride=plan({strideMetres:.42,cycle:5});assert.equal(shuffle.thump,null,'a correction carries no weight');assert.equal(shuffle.body,null);assert.equal(shuffle.drag,null);assert.equal(shuffle.caption,false);assert.equal(shuffle.clip,'scuff');assert.ok(shuffle.dryGain<stride.dryGain*.5);assert.ok(stride.thump.peak>0);
  assert.equal(plan({kind:'pivot',cycle:3}).clip,'scuff');assert.equal(plan({kind:'pivot',cycle:3}).drag,null);
  const rates=new Set([1,2,3,4,5,6,7].map(cycle=>plan({cycle}).rate));assert.ok(rates.size>3);
  for(const r of rates)assert.ok(r<.8,'slowed until it carries weight');
});

test('the monitor hears it better than the man, and it lands on the needle',()=>{
  const ear=plan({occlusionDb:15}),can=plan({occlusionDb:15,monitoring:true});
  assert.ok(can.dryGain>ear.dryGain*1.9);assert.equal(ear.needle,0);assert.ok(can.needle>0&&can.needle<=.4);
  assert.match(main,/return Math\.max\(hushStepNeedle\(\),Math\.min\(1,/);
  assert.equal(hushFootfallPlan({metres:30,occlusionDb:40}).audible,false);
  assert.equal(hushFootfallPlan({metres:20,occlusionDb:24,monitoring:true}).audible,true,'audible on the cans through what the ear can\'t hear');
  assert.equal(hushFootfallPlan({metres:20,occlusionDb:24}).audible,false);
});

test('it has no authority: no noise, no spoil, no hearing, and reduced settings hold',()=>{
  for(const name of ['playHushFootfall','tickHushFootfall'])assert.doesNotMatch(body(name),/REC\.emitNoise|markHeard|summonPresence|offerSoundTarget|REC\.spoil|spawnAtCell/);
  assert.ok(plan({metres:2,softened:true}).thump.peak<plan({metres:2}).thump.peak);
  assert.match(body('playHushFootfall'),/shakeMode\(\)==='full'/);assert.match(body('playHushFootfall'),/settings\.hushCueCaptions/);
  const a=body('hushFootfallAudible');for(const need of ['!lastExposureEvent','usingPlan()','!usingSourceSpace()','hushActiveForPlayer()'])assert.ok(a.includes(need),need);
});

test('captions say what and where, for those who can\'t hear it',()=>{
  assert.equal(hushFootfallCaption({bearing:Math.PI}),'A HEAVY STEP, BEHIND YOU');
  assert.equal(hushFootfallCaption({bearing:1.4,occlusionDb:15}),'A HEAVY STEP, THROUGH THE WALL, TO YOUR RIGHT');
  assert.equal(hushFootfallCaption({kind:'pivot',bearing:0}),'A FOOT TURNS, AHEAD');
});

const source=(metresPerSecond,seconds,{dt=1/60,tracker=createTravelFootfallTracker(),id='rear',x0=0}={})=>{
  const events=[];let x=x0;tracker.step([{id,x,y:0}],dt);
  for(let t=0;t<seconds;t+=dt){x+=metresPerSecond*dt;for(const event of tracker.step([{id,x,y:0}],dt))events.push({...event,t,x});}
  return {events,x,tracker};
};

test('Source: a walking beat that holds whatever the pace, from the body\'s own travel',()=>{
  for(const pace of [1.4,4.1,6.3,18]){
    const {events}=source(pace,20),gaps=events.slice(1).map((e,i)=>e.t-events[i].t),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const floor=SF.minStrideMetres/pace;
    assert.ok(mean>Math.max(.45,floor*.9)&&mean<Math.max(.8,floor*1.2),`${pace} m/s: ${mean}`);
    assert.ok(new Set(gaps.map(g=>g.toFixed(2))).size>2,'never metronomic, so it never answers one for one');
  }
});

test('Source: nothing for standing still, one last foot on stopping, and a cut is not a walk',()=>{
  const still=createTravelFootfallTracker();for(let i=0;i<300;i++)assert.deepEqual(still.step([{id:'a',x:5,y:5}],1/60),[]);
  const {tracker,x}=source(4.1,.5);let last=[];for(let i=0;i<60;i++)last=last.concat(tracker.step([{id:'rear',x,y:0}],1/60));
  assert.ok(last.length<=1,'a single settling foot at most');
  const cut=createTravelFootfallTracker();cut.step([{id:'a',x:0,y:0}],1/60);assert.deepEqual(cut.step([{id:'a',x:200,y:0}],1/60),[],'a fall cut back is no footstep');
  assert.deepEqual(cut.step([{id:'a',x:200,y:0}],1/60),[]);
  const gone=createTravelFootfallTracker();gone.step([{id:'a',x:0,y:0}],1/60);gone.step([],1/60);assert.deepEqual(gone.step([{id:'a',x:50,y:0}],1/60),[],'coming back is a new body, not a long stride');
  const two=createTravelFootfallTracker();two.step([{id:'rear',x:0,y:0},{id:'front',x:9,y:0}],.1);
  let ids=new Set();for(let i=1;i<40;i++)for(const e of two.step([{id:'rear',x:i*.4,y:0},{id:'front',x:9,y:0}],.1))ids.add(e.id);
  assert.deepEqual([...ids],['rear'],'each body answers for itself');
});

test('Source: heard at its own scale, a man\'s feet in the courts, and quiet to the ear on erased ground',()=>{
  const here=plan({metres:18}),there=plan({metres:18,reach:SF.reach});assert.ok(there.dryGain>here.dryGain,'a twenty-metre gap is close in Source');
  assert.ok(there.caption,'and captioned as close');
  const heavy=plan({metres:4}),man=plan({metres:4,human:true});assert.ok(man.rate>heavy.rate);assert.ok(man.thump.peak<heavy.thump.peak*.5);
  const bare=plan({metres:18,reach:SF.reach,extraLossDb:SF.erasedDb});assert.ok(bare.dryGain<there.dryGain*.2);
  const main2=body('playSourceHushFootfall');assert.match(main2,/footing\?\.profile==='erased'&&!monitoring\?SOURCE_FOOTFALL\.erasedDb:0/);
  assert.match(main2,/human:actor\.performance\?\.role==='court-trace'/);assert.match(main2,/view\.eye\.x\/CELL/,'from where the camera really is');
});

test('Source: presentation only, and never over a recorded reprise',()=>{
  const tick=body('tickSourceHushFootfall'),play=body('playSourceHushFootfall');
  assert.match(tick,/!pressurePerformance\.isReplay\(\)/);assert.match(tick,/usingSourceSpace\(\)/);assert.match(tick,/!lastExposureEvent/);
  for(const role of ['source-rear','source-front','court-trace'])assert.ok(tick.includes(role),role);
  assert.doesNotMatch(tick+play,/REC\.emitNoise|markHeard|offerSoundTarget|REC\.spoil|hushFollow\.|updatePresence/);
  assert.match(body('tickPressurePerformance'),/tickSourceHushFootfall\(dt\)/,'only when the bodies themselves advanced');
  assert.ok(body('hushFootfallAudible').includes('!usingSourceSpace()'),'the two paths never both speak');
});
