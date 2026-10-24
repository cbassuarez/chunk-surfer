import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_STAIR_GEOMETRY as STAIR} from '../src/data/main-stair-geometry.js';
import {
  MAIN_STAIR_MOTION,
  createMainStairMotionStep as createStep,
  sampleMainStairMotion as sample,
  mainStairContactCrossed as crossed,
} from '../src/render/main-stair-motion.js';

const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} differs from ${b}`);
const bearingNear=(a,b)=>near(Math.atan2(Math.sin(a-b),Math.cos(a-b)),0);
function pose(angle,radius=3.8,floorH=0,yawOffset=angle+Math.PI/2) {
  return {x:126+Math.sin(angle)*radius,z:72-Math.cos(angle)*radius,
    floorH,yawOffset,arc:{id:'main-open-well',cx:126,cz:72}};
}

test('all production tread lanes rise and descend on the same circular path, without chord cutting',()=>{
  for(const f of STAIR.flights)for(let lane=0;lane<4;lane++)for(let tread=0;tread<f.rises-1;tread++) {
    const radius=(STAIR.innerRadiusM+(lane+.5)*STAIR.widthM/4)*2;
    const a0=f.theta0+f.sweep*tread/f.rises,a1=f.theta0+f.sweep*(tread+1)/f.rises;
    const h0=f.fromH+(f.toH-f.fromH)*tread/f.rises,h1=f.fromH+(f.toH-f.fromH)*(tread+1)/f.rises;
    const from=pose(a0,radius,h0),to=pose(a1,radius,h1),step=createStep({from,to});
    const reverse=createStep({from:to,to:from});
    let previousFloor=h0;
    for(let i=0;i<=32;i++) {
      const t=i/32,p=sample(step,t),r=sample(reverse,1-t);
      near(Math.hypot(p.x-126,p.z-72),radius);
      near(p.x,r.x);near(p.z,r.z);near(p.floorH,r.floorH);
      assert.ok(p.floorH>=previousFloor-1e-10,'ascent does not dip between contacts');
      assert.ok(p.floorH>=h0-1e-10&&p.floorH<=h1+1e-10);
      previousFloor=p.floorH;
    }
    const chordMid={x:(from.x+to.x)/2,z:(from.z+to.z)/2};
    assert.ok(Math.hypot(chordMid.x-126,chordMid.z-72)<radius-.005,
      'the old chord midpoint must fail the constant-radius acceptance check');
  }
});

test('horizontal, height and bearing share one phase; smooth rise has zero start/end slope',()=>{
  const step=createStep({from:pose(0,3.8,4.8),to:pose(.2,3.8,4.9733333333)});
  const q=sample(step,.25),mid=sample(step,.5),end=sample(step,1);
  near(Math.atan2(q.x-126,-(q.z-72)),.05);
  near((q.floorH-4.8)/(.1733333333),.103515625,1e-8);
  near(mid.floorH,(4.8+4.9733333333)/2);
  near(q.yawOffset,Math.PI/2+.05);
  assert.ok((sample(step,1e-4).floorH-4.8)/1e-4<1e-6);
  assert.ok((end.floorH-sample(step,1-1e-4).floorH)/1e-4<1e-6);
});

test('metric pace respects horizontal and vertical limits, both travel directions and quiet multiplier',()=>{
  const from=pose(0,4.8,0),to=pose(Math.PI/14,4.8,2.4/14);
  const step=createStep({from,to}),reverse=createStep({from:to,to:from});
  near(step.horizontalDistanceM,2.4*Math.PI/14);
  near(step.durationMs,Math.max(1000*step.horizontalDistanceM/1.35,1000*(2.4/14)/.42));
  near(step.durationMs,reverse.durationMs);
  const quiet=createStep({from,to,paceScale:1.9});
  near(quiet.durationMs,step.durationMs*1.9);
  assert.deepEqual(sample(step,.4),sample(quiet,.4),'pace alters time, never the route');
  assert.equal(MAIN_STAIR_MOTION.contactPhase,.8);
});

test('diagonal lane travel remains between its lane radii and integrates the spiral instead of a chord',()=>{
  const step=createStep({from:pose(.4,2.8,2),to:pose(.6,3.8,2.17)});
  for(let i=0;i<=20;i++) {
    const p=sample(step,i/20),radius=Math.hypot(p.x-126,p.z-72);
    near(radius,2.8+i/20);
  }
  const chord=Math.hypot(step.to.x-step.from.x,step.to.z-step.from.z)/2;
  assert.ok(step.horizontalDistanceM>chord,'actual walking distance exceeds the shortcut chord');
});

test('atan2 branch crossing takes the short arc, including reverse travel',()=>{
  const from=pose(Math.PI-.05),to=pose(-Math.PI+.05);
  const step=createStep({from,to});
  near(step.polar.sweep,.1);
  const p=sample(step,.5);
  near(p.x,126);near(p.z,75.8);
  const reverse=createStep({from:to,to:from});
  near(reverse.polar.sweep,-.1);
  bearingNear(sample(step,.3).yawOffset,sample(reverse,.7).yawOffset);
});

test('flat apron is a finite transition with continuous world bearing through a logical portal turn',()=>{
  const oldLogicalYaw=.3,turn=Math.PI;
  const from={x:130,z:71,floorH:4.6285714,yawOffset:2.2};
  const to={x:130.5,z:71,floorH:4.8,yawOffset:2.2-turn+.12};
  const step=createStep({from,to,logicalFrameTurn:turn});
  assert.equal(step.polar,null);
  const start=sample(step,0),mid=sample(step,.5),end=sample(step,1);
  bearingNear(oldLogicalYaw+from.yawOffset,oldLogicalYaw+turn+start.yawOffset);
  bearingNear(oldLogicalYaw+turn+end.yawOffset,oldLogicalYaw+turn+to.yawOffset);
  near(mid.x,130.25);near(mid.z,71);near(mid.floorH,(from.floorH+to.floorH)/2);
  near(Math.atan2(Math.sin(end.yawOffset-start.yawOffset),Math.cos(end.yawOffset-start.yawOffset)),.12);
});

test('30/60/120 Hz and dropped-frame clocks reach identical endpoints and one audible contact',()=>{
  const step=createStep({from:pose(.1,3.8,4.8),to:pose(.3,3.8,4.9733333333)});
  const schedules=[30,60,120].map(hz=>{
    const phases=[];for(let ms=0;ms<step.durationMs;ms+=1000/hz)phases.push(ms/step.durationMs);
    return [...phases,1];
  });
  schedules.push([0,.12,.28,.29,.95,1],[0,1]);
  for(const phases of schedules) {
    let last=0,contacts=0;
    for(const phase of phases) { contacts+=Number(crossed(last,phase));last=phase; }
    assert.equal(contacts,1);
    assert.deepEqual(sample(step,phases.at(-1)),sample(step,1));
  }
});

test('pause is a repeated phase: neither pose nor contact advances; reduction does not invent another path',()=>{
  const step=createStep({from:pose(0),to:pose(.2,3.8,.17)});
  const saved=sample(step,.63);
  for(let i=0;i<100;i++) {
    assert.deepEqual(sample(step,.63),saved);
    assert.equal(crossed(.63,.63),false);
  }
  assert.equal(crossed(.79,.81),true);
  assert.equal(crossed(.81,.81),false);
  assert.equal(crossed(.9,.4),false,'reverse sampling does not emit another contact');
  assert.deepEqual(sample(step,.63,{reducedMotion:true}),saved,'there is no bob/pitch/FOV branch');
});

test('descriptors are immutable and invalid geometry or clocks cannot feed NaN to the renderer',()=>{
  const from=pose(0),to=pose(.2,3.8,.17),step=createStep({from,to});
  from.x+=100;to.arc.cx+=100;
  near(sample(step,0).x,126);
  assert.ok(Object.isFrozen(step)&&Object.isFrozen(step.from)&&Object.isFrozen(step.from.arc));
  assert.throws(()=>createStep({from:pose(0),to:{...pose(.2),floorH:NaN}}),/floorH/);
  assert.throws(()=>createStep({from:pose(0),to:pose(.2),paceScale:0}),/positive/);
  assert.throws(()=>createStep({from:pose(0),to:pose(.2),durationMs:Infinity}),/finite/);
  assert.throws(()=>createStep({from:{...pose(0),x:126,z:72},to:pose(.2)}),/centre/);
  assert.deepEqual(sample(step,-1),sample(step,0));
  assert.deepEqual(sample(step,3),sample(step,1));
});
