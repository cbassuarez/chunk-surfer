import test from 'node:test';
import assert from 'node:assert/strict';
import {createFireballSurfaceChase} from '../src/game/fireball-surface-chase.js';
import {fireballSurfaceContains} from '../src/game/fireball-surface-pose.js';
const cast=(seed=21,offer=1)=>({castId:`cast-${seed.toString(16).padStart(8,'0')}`,surfaceIndex:0,state:'outbound',offer,
  rays:[{direction:{x:1,y:0}}],motion:{seed,pressure:.8,reach:.9,formationProgress:1}});
const distance=(a,b)=>Math.hypot(a.centerX-b.centerX,a.centerY-b.centerY);

test('time and repeated controller phases cannot move an idle target',()=>{
  const chase=createFireballSurfaceChase(),c=cast();const initial=chase.setCast(c).pose;
  for(let i=0;i<60;i++)assert.deepEqual(chase.setCast({...c,catchReady:i>20,motion:{...c.motion,formationProgress:i/60}}).pose,initial);
  assert.equal(chase.snapshot().cast.catchReady,false,'arrival earns the cue');
});

test('approach accelerates continuously and inertia coasts instead of jumping with cursor steps',()=>{
  const chase=createFireballSurfaceChase({height:560});let frame=chase.setCast(cast());
  const y=frame.pose.centerY,x=frame.pose.centerX-1000;
  chase.pointer({x,y,active:true},{now:0});
  const before=frame.pose;frame=chase.pointer({x:x+20,y,active:true},{now:16,paintedPose:before});
  const firstSpeed=Math.hypot(frame.velocity.x,frame.velocity.y);
  assert.ok(firstSpeed>0&&firstSpeed<100,'velocity builds from acceleration');
  assert.ok(distance(before,frame.pose)>0&&distance(before,frame.pose)<2);
  const moved=frame.pose;frame=chase.pointer({x:x+20,y,active:true},{now:32,paintedPose:moved});
  assert.ok(distance(moved,frame.pose)>0,'momentum survives between input samples');
  const paused=frame.pose;frame=chase.pointer({x:x+100,y,active:false},{now:48,paintedPose:paused});
  assert.deepEqual(frame.pose,paused);assert.deepEqual(frame.velocity,{x:0,y:0});
});

test('first contact freezes the painted pose before evasion and pointer leave cannot release it',()=>{
  const chase=createFireballSurfaceChase(),c=cast(),initial=chase.setCast(c).pose;
  let frame=chase.pointer({x:initial.centerX,y:initial.centerY,active:true},{paintedPose:initial});
  assert.equal(frame.acquired,true);assert.deepEqual(frame.pose,initial);
  frame=chase.pointer({x:-1000,y:1000,active:true});assert.deepEqual(frame.pose,initial);
  frame=chase.setCast({...c,motion:{...c.motion,formationProgress:.9}});assert.deepEqual(frame.pose,initial);
  assert.equal(frame.cast.catchReady,true);
  frame=chase.setCast(cast(21,2));assert.equal(frame.acquired,false);
  assert.equal(frame.pose.centerX,initial.centerX);assert.equal(frame.pose.centerY,initial.centerY,'new offer begins at the previous actual position');
});

test('a fast swept crossing earns arrival even between native samples',()=>{
  const chase=createFireballSurfaceChase(),pose=chase.setCast(cast()).pose;
  chase.pointer({x:-100,y:pose.centerY,active:true});
  const frame=chase.pointer({x:400,y:pose.centerY,active:true},{paintedPose:pose});
  assert.equal(frame.acquired,true);assert.deepEqual(frame.pose,pose);
});

test('native samples require matching cast seed and surface, and matching cached arrival is retained',()=>{
  const chase=createFireballSurfaceChase(),c=cast(),pose=chase.setCast(c).pose;
  for(const sample of [{seed:22,index:0},{seed:21,index:1}]){
    const frame=chase.nativePointer({...sample,x:pose.centerX,y:pose.centerY,active:true});
    assert.equal(frame.acquired,false);assert.deepEqual(frame.pose,pose);
  }
  const fresh=createFireballSurfaceChase();fresh.nativePointer({seed:21,index:0,x:pose.centerX,y:pose.centerY,active:true});
  assert.equal(fresh.setCast(c).acquired,true,'native pointer may arrive before the first payload');
});

test('bounded continuous pursuit stays protected and steady steering reaches it',()=>{
  for(let seed=1;seed<=30;seed++){
    const chase=createFireballSurfaceChase();let frame=chase.setCast(cast(seed));
    let point={x:frame.pose.centerX-400,y:frame.pose.centerY};chase.pointer({...point,active:true});
    for(let step=0;step<100&&!frame.acquired;step++){
      const before=frame.pose,dx=before.centerX-point.x,dy=before.centerY-point.y,d=Math.hypot(dx,dy);
      point={x:point.x+dx/d*10,y:point.y+dy/d*10};
      frame=chase.pointer({...point,active:true},{paintedPose:before});
      assert.ok(distance(before,frame.pose)<=800*.016+1e-5);
      assert.ok(frame.pose.x>=8-1e-6&&frame.pose.y>=8-1e-6);
      assert.ok(frame.pose.x+frame.pose.size+8<=240+1e-6&&frame.pose.y+frame.pose.size+8<=240+1e-6);
      if(fireballSurfaceContains(before,point))assert.deepEqual(frame.pose,before,'contact wins over evasion');
    }
    assert.equal(frame.acquired,true,'steady pursuit reaches the target instead of an infinite chase');
  }
});

test('reduced motion and resolved feedback never travel under pointer movement',()=>{
  for(const c of [{...cast(),reducedMotion:true},{...cast(),state:'deflected'}]){
    const chase=createFireballSurfaceChase(),pose=chase.setCast(c).pose;
    chase.pointer({x:-200,y:pose.centerY,active:true});
    assert.deepEqual(chase.pointer({x:-180,y:pose.centerY,active:true}).pose,pose);
  }
});

test('distant approach supplies repulsive acceleration with curvature',()=>{
  for(let seed=1;seed<=12;seed++)for(const angle of [0,.6,1.5,2.5,3.7,5]){
    const chase=createFireballSurfaceChase({height:560});let frame=chase.setCast(cast(seed));
    const before=frame.pose;
    const prior={x:before.centerX+Math.cos(angle)*1000,y:before.centerY+Math.sin(angle)*1000};
    chase.pointer({...prior,active:true});
    const point={x:before.centerX+Math.cos(angle)*980,y:before.centerY+Math.sin(angle)*980};
    frame=chase.pointer({...point,active:true},{paintedPose:before});
    assert.ok(distance(before,frame.pose)>0,'approach starts well before the old420px threshold');
    assert.ok(distance(before,frame.pose)<=17+1e-5);
    assert.ok(Math.hypot(frame.pose.centerX-point.x,frame.pose.centerY-point.y)>=980-1e-6,'evasion may move away or slide at a wall, never toward the approaching cursor');
  }
});

test('walls reflect velocity and the target leaves the collision instead of pinning',()=>{
  const chase=createFireballSurfaceChase({height:560});let frame=chase.setCast(cast());
  let point={x:-5000,y:280};chase.pointer({...point,active:true},{now:0});
  let previous=frame,collision=null,departed=false,turned=false;
  for(let i=1;i<=120;i++){
    point={x:point.x+16,y:280};frame=chase.pointer({...point,active:true},{now:i*16,paintedPose:previous.pose});
    if(frame.bounces>previous.bounces){collision={...frame.pose};assert.ok(Math.hypot(frame.velocity.x,frame.velocity.y)>0,'collision keeps reflected momentum');}
    else if(collision&&distance(collision,frame.pose)>5)departed=true;
    if(Math.abs(previous.velocity.x*frame.velocity.y-previous.velocity.y*frame.velocity.x)>1)turned=true;
    assert.ok(frame.pose.x>=8&&frame.pose.x+frame.pose.size+8<=240+1e-6);
    assert.ok(frame.pose.y>=8&&frame.pose.y+frame.pose.size+8<=560+1e-6);
    previous=frame;
  }
  assert.ok(frame.bounces>0);assert.equal(departed,true);assert.equal(turned,true,'steering bends velocity rather than following a straight preset path');
});

test('substepped dynamics remain consistent at60 and120 input samples per second',()=>{
  function simulate(hz){
    const chase=createFireballSurfaceChase({height:560});let frame=chase.setCast(cast());
    chase.pointer({x:-5000,y:280,active:true},{now:0});
    for(let i=1;i<=hz;i++)frame=chase.pointer({x:-5000+1000*i/hz,y:280,active:true},{now:i*1000/hz,paintedPose:frame.pose});
    return frame;
  }
  const a=simulate(60),b=simulate(120);
  assert.ok(distance(a.pose,b.pose)<8,'input sampling does not set the movement speed');
  assert.ok(Math.abs(Math.hypot(a.velocity.x,a.velocity.y)-Math.hypot(b.velocity.x,b.velocity.y))<40);
});
