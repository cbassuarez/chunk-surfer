import test from 'node:test';
import assert from 'node:assert/strict';
import {createCliffFall,CLIFF_FALL,cliffFallBodyMatrix} from '../src/game/source-drive/cliff-fall.js';
import {multiply,rotation} from '../src/game/source-drive/scene.js';
import {COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_LOCAL,COASTAL_MEMORY_LAYOUT} from '../src/data/coastal-memory.js';

const near=(a,b,e=1e-6,msg)=>assert.ok(Math.abs(a-b)<e,`${msg||'near'}: ${a} != ${b}`);
const settledMatrix=multiply(COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_LOCAL);
// The shared reference release: the road at the break, 28 m above the sea,
// leaving at ~6.5 m/s with a small downward start.
const release={
  position:[32+304*.0,COASTAL_MEMORY_LAYOUT.lipY,-304*.0],
  velocity:[6.5,-.3,1.8],
  heading:.14,pitch:-.08,roll:0,
};
const fall=(over={})=>createCliffFall({release,seaY:0,settledMatrix,settledAtLocal:15,...over});

test('the drop obeys gravity: hang time and impact speed are what the height says',()=>{
  const f=fall(),d=f.diagnostics;
  // The hull corners ride ~1.8 m below the body pivot, so the effective drop
  // is a little less than the 28 m lip; gravity owns the rest exactly.
  const effective=release.position[1]-1.8;
  const promised=(-Math.abs(release.velocity[1])+Math.sqrt(release.velocity[1]**2+2*CLIFF_FALL.g*effective))/CLIFF_FALL.g;
  near(d.entryTime,promised,promised*.06,'entry time within 6% of √(2h/g)');
  const vImpact=Math.sqrt(release.velocity[1]**2+2*CLIFF_FALL.g*effective);
  near(d.impactSpeed,vImpact,vImpact*.08,'impact speed is the drop speed');
  assert.ok(d.impactSpeed>20,'a 26 m drop hits hard');
});

test('the pivot is the only torque: pitch rate is what the rear axle hands over, then constant in the air',()=>{
  const f=fall(),alpha=CLIFF_FALL.mass*CLIFF_FALL.g*CLIFF_FALL.comBehindFront*Math.cos(release.pitch)/CLIFF_FALL.pitchInertia;
  near(f.pivotRate,alpha*CLIFF_FALL.pivotSeconds,1e-6,'pivot rate');
  const a=f.state(CLIFF_FALL.pivotSeconds+.2),b=f.state(CLIFF_FALL.pivotSeconds+.6);
  near(b.pitch-a.pitch,f.pivotRate*-.4,1e-6,'constant angular velocity in the air');
});

test('the first fall frame is the release frame: no handoff jump',()=>{
  const f=fall(),s0=f.state(0);
  near(s0.position[0],release.position[0],1e-9,'x');near(s0.position[1],release.position[1],1e-9,'y');
  near(s0.position[2],release.position[2],1e-9,'z');near(s0.heading,release.heading,1e-9,'heading');
  near(s0.pitch,release.pitch,1e-9,'pitch');
  const m=s0.bodyMatrix,e=cliffFallBodyMatrix([...release.position],release.heading,release.pitch,0);
  for(let i=0;i<16;i++)near(m[i],e[i],1e-5,`matrix[${i}]`);
});

test('the entry bisection finds the one instant the hull crosses the water, and the water converges to the settled wreck',()=>{
  const f=fall();
  assert.ok(f.state(f.entryTime-.01).phase==='air','still flying just before entry');
  assert.equal(f.state(f.entryTime+.01).phase,'water','in the water just after entry');
  const s=f.state(14.99),m=settledMatrix;
  near(s.position[0],m[12]-32,2e-2,'settled x');near(s.position[1],m[13],2e-2,'settled y');near(s.position[2],m[14]-32,2e-2,'settled z');
  const settled=f.state(15);
  for(let i=0;i<16;i++)near(settled.bodyMatrix[i],m[i],1e-5,`settled matrix[${i}]`);
  assert.equal(settled.phase,'settled');
});

test('two falls from the same release are the same motion, to the last bit',()=>{
  const a=fall(),b=fall();
  for(let t=0;t<15;t+=.137){
    const sa=a.state(t),sb=b.state(t);
    assert.ok(Object.is(sa.position[0],sb.position[0]),'x');assert.ok(Object.is(sa.position[1],sb.position[1]),'y');
    assert.ok(Object.is(sa.pitch,sb.pitch),'pitch');assert.ok(Object.is(sa.roll,sb.roll),'roll');
  }
});

test('rear-first pivots the other way; driving off the edge gets no pivot at all',()=>{
  const rear=fall({direction:-1}),front=fall();
  assert.ok(front.pivotRate>0,'nose-first tips forward');
  assert.ok(rear.pivotRate<0,'rear-first tips backward');
  near(rear.pivotRate,-front.pivotRate,1e-12,'the same torque, the other way');
  const edge=fall({pivotSeconds:0,direction:1});
  near(edge.pivotRate,0,1e-9,'no pivot off the edge');
  near(edge.state(1).pitch,release.pitch,1e-9,'edge keeps its pitch');
});

test('the motion is smooth: no frame moves the van more than half a metre',()=>{
  const f=fall();let last=f.state(0).position;
  for(let t=1/120;t<15;t+=1/120){
    const p=f.state(t).position;
    assert.ok(Math.hypot(p[0]-last[0],p[1]-last[1],p[2]-last[2])<.5,`frame at ${t.toFixed(3)} teleports`);
    last=p;
  }
});

test('the body matrix builder matches the drive scene rotation composition',()=>{
  const h=.3,p=.12,r=.07,pos=[5,2,9];
  const m=cliffFallBodyMatrix(pos,h,p,r),ref=multiply(rotation(0,-h),rotation(p,0,r)),pivot=.85;
  ref[12]=32+pos[0]-ref[4]*pivot;ref[13]=pos[1]+pivot-ref[5]*pivot;ref[14]=32+pos[2]-ref[6]*pivot;ref[15]=1;
  for(let i=0;i<16;i++)assert.ok(Object.is(m[i],ref[i]),`matrix[${i}]: ${m[i]} != ${ref[i]}`);
});
