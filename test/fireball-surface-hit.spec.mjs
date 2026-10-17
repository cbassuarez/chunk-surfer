import test from 'node:test';
import assert from 'node:assert/strict';
import { fireballSurfaceHitPayload,strikeFireballSurface } from '../src/game/fireball-surface-hit.js';
import { fireballSurfacePose,fireballSurfaceContains,FIREBALL_SURFACE_ENVELOPE_SIZE } from '../src/game/fireball-surface-pose.js';

const outbound=()=>({
  castId:'cast-0a1b2c3d',state:'outbound',surfaceIndex:2,
  rays:[{id:'private-ray-data-never-returned'}],
});
const pointAt=(cast)=>{
  const pose=fireballSurfacePose(cast);
  return {x:pose.centerX,y:pose.centerY,width:240,height:240};
};

test('a surface pointer strike emits only its opaque routing identity',async()=>{
  const emitted=[];
  const result=strikeFireballSurface(outbound(),(payload)=>emitted.push(payload),pointAt(outbound()));
  await Promise.resolve();
  assert.equal(result.hit,true);
  assert.equal(result.cast.state,'deflected','the local surface closes the double-click race immediately');
  assert.deepEqual(emitted,[{castId:'cast-0a1b2c3d',surfaceIndex:2}]);
  assert.equal(JSON.stringify(emitted).includes('private-ray-data'),false);
});

test('repeated pointer presses cannot double-charge RETURN',async()=>{
  const emitted=[];
  const first=strikeFireballSurface(outbound(),(payload)=>emitted.push(payload),pointAt(outbound()));
  const second=strikeFireballSurface(first.cast,(payload)=>emitted.push(payload),pointAt(first.cast));
  await Promise.resolve();
  assert.equal(first.hit,true);
  assert.equal(second.hit,false);
  assert.equal(emitted.length,1);
});

test('idle, resolved, malformed, and out-of-pool surfaces cannot report a hit',()=>{
  assert.equal(fireballSurfaceHitPayload(null),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),state:'impact'}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),castId:'real-combat-id'}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),surfaceIndex:4}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),surfaceIndex:NaN}),null);
  assert.equal(fireballSurfaceHitPayload({...outbound(),surfaceIndex:1.5}),null);
});

test('transparent padding misses retain opaque identity and never consume or charge a target',async()=>{
  const cast={...outbound(),catchReady:true,offer:2,motion:{seed:159,formationProgress:1,dodge:0,pressure:1}};
  const emitted=[];
  const pose=fireballSurfacePose(cast);
  const result=strikeFireballSurface(cast,(payload)=>emitted.push(payload),{x:pose.x-9,y:pose.centerY,width:240,height:240});
  await Promise.resolve();
  assert.equal(result.hit,false);assert.equal(result.miss,true);
  assert.equal(result.cast,cast);
  assert.deepEqual(result.payload,{castId:cast.castId,surfaceIndex:cast.surfaceIndex});
  assert.equal(emitted.length,0);
  assert.equal(strikeFireballSurface(cast,()=>{},pointAt(cast)).hit,true,'a padding miss leaves the real target available');
});

test('visible target hit bounds share the drawn pose and include eight CSS pixels of forgiveness',()=>{
  const cast={...outbound(),catchReady:true,motion:{seed:781,formationProgress:1,dodge:0}};
  const pose=fireballSurfacePose(cast);
  assert.equal(fireballSurfaceContains(pose,{x:pose.x-8,y:pose.centerY}),true);
  assert.equal(fireballSurfaceContains(pose,{x:pose.x-8.01,y:pose.centerY}),false);
  assert.equal(fireballSurfaceContains(pose,{x:pose.x+pose.size+8,y:pose.centerY}),true);
  assert.equal(fireballSurfaceContains(pose,{x:241,y:pose.centerY}),false,'forgiveness never extends interaction beyond the owned carrier');
  assert.equal(strikeFireballSurface(cast,()=>{},{x:pose.x-8,y:pose.centerY,width:240,height:240}).hit,true);
});

test('target geometry is deterministic, varies by seed and offer, and stays committed without a cursor input',()=>{
  const cast={...outbound(),catchReady:true,offer:1,motion:{seed:781,pressure:.8,formationProgress:1,dodge:0,reach:.9,gesture:'seat-align'}};
  const pose=fireballSurfacePose(cast);
  assert.deepEqual(fireballSurfacePose(cast),pose);
  assert.deepEqual(fireballSurfacePose({...cast,cursor:{x:0,y:0},motion:{...cast.motion,cursor:{x:999,y:999}}}),pose);
  assert.notDeepEqual(fireballSurfacePose({...cast,motion:{...cast.motion,seed:782}}),pose);
  assert.notDeepEqual(fireballSurfacePose({...cast,offer:2}),pose);
  assert.ok(Math.abs(pose.offsetX)<=40&&Math.abs(pose.offsetY)===62);
  assert.equal(pose.size,100);
});

test('every sampled authored pose and its forgiveness area fit the fixed 240 CSS pixel envelope',()=>{
  for(let seed=0;seed<20;seed+=1)for(const gesture of ['rise-drift','seat-align','retake-loop','orbit','swarm-recombine']){
    for(const offer of [1,2])for(const pressure of [0,.25,.5,.75,1])for(let step=0;step<=20;step+=1){
      const formationProgress=step/20;
      const cast={...outbound(),offer,motion:{seed,gesture,pressure,formationProgress,dodge:pressure*Math.sin(formationProgress*Math.PI),reach:1}};
      const pose=fireballSurfacePose(cast);
      assert.equal(pose.width,FIREBALL_SURFACE_ENVELOPE_SIZE);
      assert.ok(pose.x>=8&&pose.y>=8);
      assert.ok(pose.x+pose.size+8<=240+1e-9&&pose.y+pose.size+8<=240+1e-9);
      assert.ok(Math.abs(pose.offsetX)<=40&&Math.abs(pose.offsetY)<=62);
      assert.equal(pose.size,100);
    }
  }
});

test('authored feint stays within twenty-four CSS pixels and reduced motion remains at its commitment mark',()=>{
  const cast={...outbound(),offer:2,motion:{seed:10,gesture:'orbit',pressure:1,formationProgress:.5,dodge:1,reach:1}};
  const still=fireballSurfacePose({...cast,motion:{...cast.motion,dodge:0}});
  const feint=fireballSurfacePose(cast);
  assert.ok(Math.hypot(feint.offsetX-still.offsetX,feint.offsetY-still.offsetY)<=24+1e-9);
  const reduced={...cast,reducedMotion:true};
  assert.deepEqual(fireballSurfacePose(reduced),fireballSurfacePose({...reduced,motion:{...reduced.motion,formationProgress:1,dodge:0}}));
});

test('every sampled committed target excludes carrier-centre parking and the next offer flips its vertical bank',()=>{
  const banks=new Set();
  for(let seed=0;seed<100;seed+=1)for(let surfaceIndex=0;surfaceIndex<4;surfaceIndex+=1){
    const cast={...outbound(),surfaceIndex,offer:1,catchReady:true,motion:{seed,formationProgress:1,dodge:0,pressure:1}};
    const first=fireballSurfacePose(cast),second=fireballSurfacePose({...cast,offer:2});
    for(const pose of [first,second]){
      assert.equal(fireballSurfaceContains(pose,{x:120,y:120}),false,
        'centre parking must miss including the eight-pixel forgiveness border');
      assert.equal(Math.abs(pose.offsetY),62);banks.add(Math.sign(pose.offsetY));
    }
    assert.equal(second.offsetY,-first.offsetY,'offer two flips the same ray\'s selected bank');
  }
  assert.deepEqual([...banks].sort(),[-1,1]);
});

test('the authored path starts opposite its commitment and remains continuous inside the owned envelope',()=>{
  for(const seed of [0,1,7,781,0xffffffff])for(const offer of [1,2]){
    let previous=null;
    const poses=[];
    for(let step=0;step<=100;step+=1){
      const p=step/100;
      const pose=fireballSurfacePose({...outbound(),offer,motion:{seed,formationProgress:p,dodge:Math.sin(p*Math.PI),pressure:1,reach:1}});
      if(previous)assert.ok(Math.hypot(pose.centerX-previous.centerX,pose.centerY-previous.centerY)<4,
        'one percent of an authored path cannot teleport the target');
      assert.ok(pose.x>=8&&pose.y>=8&&pose.x+pose.size+8<=240+1e-9&&pose.y+pose.size+8<=240+1e-9);
      previous=pose;poses.push(pose);
    }
    assert.equal(poses[0].offsetY,-poses.at(-1).offsetY);
    assert.equal(poses.at(-1).size,100);
  }
});

test('banked geometry clamps to smaller carrier dimensions without losing its owned forgiveness area',()=>{
  for(const width of [80,160,240])for(const height of [80,180,240]){
    const pose=fireballSurfacePose({...outbound(),motion:{seed:50,formationProgress:1,dodge:0}},{width,height});
    assert.ok(pose.x>=8&&pose.y>=8);
    assert.ok(pose.x+pose.size+8<=width+1e-9&&pose.y+pose.size+8<=height+1e-9);
  }
});

test('the AGAIN pause holds the old mark and the next offer begins at that exact mark on both axes',()=>{
  for(const seed of [0,7,781,0xffffffff]){
    const cast={...outbound(),offer:1,catchReady:true,motion:{seed,gesture:'orbit',formationProgress:1,dodge:0,pressure:1}};
    const first=fireballSurfacePose(cast);
    for(const p of [1,.75,.5,.25,0]){
      const rebound=fireballSurfacePose({...cast,offer:2,catchReady:false,motion:{...cast.motion,rebounding:true,formationProgress:p,dodge:Math.sin(p*Math.PI)}});
      assert.deepEqual(rebound,first,'the announced second offer does not move the old mark during AGAIN');
    }
    const next=fireballSurfacePose({...cast,offer:2,catchReady:false,motion:{...cast.motion,rebounding:false,formationProgress:0,dodge:0}});
    assert.equal(next.x,first.x);assert.equal(next.y,first.y);assert.equal(next.size,first.size);
    const committed=fireballSurfacePose({...cast,offer:2});
    assert.equal(committed.offsetY,-first.offsetY);
  }
});
