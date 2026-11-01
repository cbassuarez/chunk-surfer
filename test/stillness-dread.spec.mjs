import test from 'node:test';
import assert from 'node:assert/strict';
import {createStillnessDread} from '../src/game/stillness-dread.js';

const base={active:true,context:'room:one',position:[2,0,3],anchor:[2,1.6,-1],direction:[0,0,-1],profile:0};
function run(owner,seconds,input=base){
  let frame=owner.frame();
  for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.05)frame=owner.update({...input,dt:Math.min(.05,seconds-elapsed)});
  return frame;
}
function entered(input=base){const owner=createStillnessDread();owner.update({...input,dt:0});return owner;}

test('ordinary stillness becomes a surface-bound face gradually, with earlier distinct bench escalations',()=>{
  const owners=[0,1,2].map(profile=>entered({...base,profile}));
  const early=owners.map((owner,profile)=>run(owner,3,{...base,profile}));
  assert.equal(early[0].amount,0);assert.ok(early[1].amount>0);assert.ok(early[2].amount>early[1].amount);
  assert.equal(run(owners[0],15).amount,1);
  assert.equal(run(owners[1],8,{...base,profile:1}).amount,1);
  assert.equal(run(owners[2],6,{...base,profile:2}).amount,1);
  const edge=entered();run(edge,3.5);assert.equal(edge.frame().amount,0);
  assert.ok(run(edge,.05).amount>0&&edge.frame().amount<.001,'onset has no visible pop');
});

test('looking cannot reset dwell or drag the originally acquired surface',()=>{
  const owner=entered();
  const frame=run(owner,12,{...base,anchor:[90,90,90],direction:[1,0,0],yaw:2,pitch:1});
  assert.ok(frame.amount>.5);assert.deepEqual(frame.anchor,base.anchor);assert.deepEqual(frame.direction,base.direction);
  assert.ok(Math.abs(frame.stillSeconds-12)<1e-10);
});

test('many small walking steps release a face even when no single step reaches the movement tolerance',()=>{
  const owner=entered();run(owner,18);let frame=owner.frame();
  for(let i=1;i<=80;i++)frame=owner.update({...base,position:[2+i*.002,0,3],dt:.05});
  assert.equal(frame.amount,0);assert.ok(frame.stillSeconds<1,'walking cannot restart a long stare between tiny accepted steps');
  assert.ok(frame.bout>1);
});

test('small stationary body bob is tolerated but real vertical travel breaks the bout',()=>{
  const owner=entered();let frame;
  for(let i=0;i<400;i++)frame=owner.update({...base,position:[2+Math.sin(i)*.008,Math.sin(i*.4)*.035,3],dt:.05});
  assert.equal(frame.amount,1);assert.equal(frame.bout,1);
  frame=owner.update({...base,position:[2,.25,3],dt:.05});assert.ok(frame.releasing);assert.equal(frame.stillSeconds,0);
});

test('pause and focus freeze the exact last frame without spending even a long interval',()=>{
  const owner=entered();const before=run(owner,12);
  assert.strictEqual(owner.update({freeze:true,active:false,context:'elsewhere',position:[99,99,99],dt:900}),before);
  assert.strictEqual(owner.frame(),before);
  const after=owner.update({...base,dt:.05});assert.ok(after.stillSeconds-before.stillSeconds<.051);
});

test('movement fades at the old surface before reacquiring, and sit/stand cannot move a full-strength face',()=>{
  const owner=entered();run(owner,18);
  let frame=owner.update({...base,profile:1,anchor:[10,5,10],dt:.05});
  assert.ok(frame.amount>.9&&frame.amount<1);assert.equal(frame.profile,0);assert.equal(frame.requestedProfile,1);
  assert.deepEqual(frame.anchor,base.anchor);assert.equal(frame.stillSeconds,0);
  frame=run(owner,1,{...base,profile:1,anchor:[10,5,10]});
  assert.equal(frame.amount,0);assert.equal(frame.profile,1);assert.deepEqual(frame.anchor,[10,5,10]);
  assert.ok(run(owner,2,{...base,profile:1,anchor:[100,100,100]}).amount>0);
  assert.deepEqual(owner.frame().anchor,[10,5,10]);
});

test('teleport, another space, loading and a new owner never carry a stale face across a threshold',()=>{
  for(const next of[{...base,context:'room:two'},{...base,position:[20,0,3]},{active:false}]){
    const owner=entered();run(owner,18);const frame=owner.update({...next,dt:.05});
    assert.equal(frame.amount,0);assert.equal(frame.stillSeconds,0);assert.equal(frame.time,0);
  }
  assert.equal(createStillnessDread().frame().amount,0);
  const owner=entered();run(owner,18);assert.equal(owner.reset().active,false);assert.equal(owner.frame().amount,0);
});

test('invalid values, stalls and accessibility settings stay finite without catching up or changing gameplay',()=>{
  const owner=entered();const frame=owner.update({...base,dt:1e9,reducedMotion:true,reduceFlash:true});
  assert.equal(frame.stillSeconds,.1);assert.equal(frame.time,.1);assert.equal(frame.motionTime,0);
  assert.equal(frame.presentationOnly,true);assert.equal(frame.reduceFlash,true);
  assert.ok(Object.isFrozen(frame));assert.ok(Object.isFrozen(frame.anchor));
  for(const key of['fear','health','noise','save','velocity'])assert.equal(frame[key],undefined);
  const invalid=owner.update({...base,position:[NaN,Infinity,0],dt:NaN});
  assert.equal(invalid.active,false);assert.equal(invalid.amount,0);
  for(const value of Object.values(invalid))if(typeof value==='number')assert.ok(Number.isFinite(value));
  const clamped=owner.update({...base,profile:100,direction:[0,0,0],anchor:[Infinity,0,0],dt:-10});
  assert.equal(clamped.profile,2);assert.deepEqual(clamped.anchor,base.position);assert.deepEqual(clamped.direction,[0,0,-1]);
});
