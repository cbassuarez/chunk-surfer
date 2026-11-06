import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUSH_FOOTFALL as F,createHushFootfallTracker,hushFootfallPlan,hushFootfallCaption} from '../src/game/hush-footfall.js';
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
  assert.deepEqual(t3.step(null),[],'and gone is gone');
  const t4=createHushFootfallTracker();t4.step(g);t4.step({...g,phase:'load'});t4.step({...g,phase:'advance',pivot:true,progress:.1});
  assert.equal(t4.step({...g,phase:'advance',pivot:true,progress:.9})[0].kind,'pivot','a turn scrapes');
});

test('proximity: louder and heavier as it nears, then silent at arm\'s length',()=>{
  const close=plan({metres:2}),mid=plan({metres:6}),far=plan({metres:20}),end=plan({metres:70});
  assert.ok(close.dryGain>mid.dryGain&&mid.dryGain>far.dryGain);assert.ok(close.thump.peak>mid.thump.peak*1.4,'the thump falls off faster than the heel');
  assert.equal(end.audible,false,'a long way off is a long way off');
  assert.equal(plan({metres:F.silentMetres-.01}).audible,false);assert.equal(plan({metres:F.silentMetres+.01}).audible,true);
  assert.ok(F.silentMetres>.72,'it stops before the catch radius, so the hit has silence');
  assert.equal(plan({metres:Infinity}).audible,false);
  assert.equal(plan({kind:'load',metres:F.creakMetres+1}).audible,false,'the floor only groans close to');
  assert.ok(plan({kind:'load',metres:4}).creak.peak>0);assert.equal(plan({kind:'load',metres:4}).dryGain,0);
});

test('occlusion: a wall takes the level and the top, and leaves the low end',()=>{
  const open=plan(),wall=plan({occlusionDb:15}),thick=plan({occlusionDb:36});
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

test('its rhythm: every other stride drags, each foot a little different',()=>{
  assert.equal(plan({cycle:2}).drag,null);const drag=plan({cycle:3}).drag;assert.ok(drag&&drag.delay>.3&&drag.gain<plan({cycle:3}).dryGain*.5);
  assert.equal(plan({kind:'pivot',cycle:3}).clip,'scuff');assert.equal(plan({kind:'pivot',cycle:3}).drag,null);
  const rates=new Set([1,2,3,4,5,6,7].map(cycle=>plan({cycle}).rate));assert.ok(rates.size>3);
  for(const r of rates)assert.ok(r<.8,'slowed until it carries weight');
});

test('the monitor hears it better than the man, and it lands on the needle',()=>{
  const ear=plan({occlusionDb:15}),can=plan({occlusionDb:15,monitoring:true});
  assert.ok(can.dryGain>ear.dryGain*1.9);assert.equal(ear.needle,0);assert.ok(can.needle>0&&can.needle<=.4);
  assert.match(main,/return Math\.max\(hushStepNeedle\(\),Math\.min\(1,/);
  assert.equal(hushFootfallPlan({metres:30,occlusionDb:40}).audible,false);
  assert.equal(hushFootfallPlan({metres:30,occlusionDb:30,monitoring:true}).audible,true,'audible on the cans through what the ear can\'t hear');
  assert.equal(hushFootfallPlan({metres:30,occlusionDb:30}).audible,false);
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
