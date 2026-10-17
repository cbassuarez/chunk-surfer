import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFireballExchange,
  FIREBALL_CATCH_PROGRESS,
  FIREBALL_OFFERS,
  FIREBALL_OUTSIDE_SECONDS,
  FIREBALL_REBOUND_SECONDS,
  FIREBALL_RETURN_DAMAGE,
  FIREBALL_RETURN_THRESHOLD,
  hitTestFireballCast,
} from '../src/game/fireball-exchange.js';
import { compileFireballCastPlan, fireballRayPoint } from '../src/game/window-channel.js';

function harness(){
  const begun=[],resolved=[],returned=[];
  const exchange=createFireballExchange({
    battleId:'hall',
    beginCast:(event)=>{
      const plan=compileFireballCastPlan({battleId:'hall',...event});
      begun.push(plan);
      return plan;
    },
    resolveCast:(event)=>resolved.push(event),
    onReturn:(event)=>returned.push(event),
  });
  exchange.setMovement({id:'seated',index:0,title:'THE HOUSE IS SEATED'});
  return{exchange,begun,resolved,returned};
}

function liveRays(exchange){
  return (exchange.snapshot().active?.rays||[]).filter((ray)=>['inflight','approach'].includes(ray.state));
}

function pointAt(exchange,index=0){
  const active=exchange.snapshot().active;
  const flight=active.rays[index];
  return fireballRayPoint(active.plan.rays[index],{state:'outbound',progress:flight.progress});
}

function clickHead(exchange){
  return exchange.click(pointAt(exchange,0));
}

function finishAndRespawn(exchange){
  exchange.update(.31);
  exchange.update(1.81);
}

test('the real-time fireball clock advances independently of ordinary combat phases',()=>{
  const {exchange,begun}=harness();
  exchange.update(.35,{enabled:false});
  assert.equal(exchange.snapshot().active,null,'dialogue can pause the side clock without creating a cast');
  exchange.update(.71,{enabled:true});
  assert.equal(begun.length,1);
  const before=exchange.snapshot().active.progress;
  exchange.update(.4,{enabled:true});
  assert.ok(exchange.snapshot().active.progress>before,'no attack-turn event is required to advance the projectile');
});

test('pointer hit testing follows the drawn fireball and ignores empty stage clicks',()=>{
  const {exchange}=harness();
  exchange.update(.71);
  const point=pointAt(exchange,0);
  assert.ok(hitTestFireballCast(exchange.snapshot().active,point));
  assert.equal(exchange.click({x:0,y:1}).hit,false);
  assert.equal(exchange.snapshot().charge,0);
  assert.equal(exchange.click(point).hit,true);
  assert.equal(exchange.snapshot().charge,1);
});

test('compact Source aperture can retain a fourteen-pixel catch radius without changing ordinary targets',()=>{
  const {exchange}=harness();exchange.update(.71);
  const point=pointAt(exchange,0);
  // A 360x60 logical aperture: thirteen pixels from the visible ray center.
  const click={x:point.x+13/360,y:point.y,aspect:6};
  assert.equal(exchange.click(click).hit,false,'ordinary target radius is unchanged');
  assert.equal(exchange.click({...click,radius:14/60}).hit,true);
  assert.equal(exchange.snapshot().charge,1,'one catch consumes only one projectile');
});

// HITTING ONE COMET IS NOT HITTING ALL OF THEM.
//
// A cast used to be a single flight with several sprites drawn along it, so one
// click resolved the whole thing — three fireballs on screen and one pointer
// event took all three off it. They are separate projectiles: they leave a beat
// apart, they are struck one at a time, and the ones you did not touch carry on
// exactly as they were and land on you.
test('striking one comet leaves its siblings in the air',()=>{
  const {exchange,resolved}=harness();
  exchange.setMovement({id:'attention',index:1,title:'THE HOUSE ATTENDS'});
  exchange.update(.71);
  // Far enough in that every sibling has left the stagger.
  for(let step=0;step<24;step+=1)exchange.update(.05);
  const live=liveRays(exchange);
  assert.ok(live.length>=2,`the authored two-comet phrase is in the air (${live.length})`);
  assert.ok(new Set(live.map((ray)=>ray.progress.toFixed(3))).size>1,
    'and they are not all at the same point, because they did not leave together');

  const struck=live[0];
  assert.equal(exchange.strike({rayId:struck.id}).hit,true);
  const after=exchange.snapshot().active.rays;
  assert.equal(after.find((ray)=>ray.id===struck.id).state,'deflected');
  for(const ray of live.slice(1)){
    assert.ok(['inflight','approach'].includes(after.find((entry)=>entry.id===ray.id).state),
      `${ray.id} was never touched and is still flying`);
  }
  assert.equal(resolved.filter((event)=>event.state==='deflected').length,1,
    'one strike resolves one comet');
});

test('a volley movement throws them all on the same frame',()=>{
  const {exchange}=harness();
  exchange.setMovement({id:'applause',index:2});
  exchange.update(.71);
  exchange.update(.05);
  const volley=exchange.snapshot().active;
  assert.equal(volley.plan.volley,true,'applause is the authored overwhelming beat');
  assert.equal(volley.rays.filter((ray)=>ray.state==='inflight').length,volley.plan.rayCount,
    'every comet is already in the air');

  const {exchange:phrased}=harness();
  phrased.setMovement({id:'attention',index:1});
  phrased.update(.71);
  phrased.update(.05);
  const staggered=phrased.snapshot().active;
  assert.equal(staggered.plan.volley,false);
  assert.equal(staggered.rays.filter((ray)=>ray.state==='inflight').length,1,
    'ordinary casts arrive as a phrase, one comet at a time');
});

test('three click deflections arm RETURN, reverse the comet that was clicked and deal ranged damage',()=>{
  const {exchange,resolved,returned}=harness();
  let armedRay=null;
  // Charge is the player's, not any one comet's: three separate deflections
  // across three separate fireballs arm the same RETURN.
  for(let count=1;count<=FIREBALL_RETURN_THRESHOLD;count+=1){
    let live=liveRays(exchange);
    for(let guard=0;guard<400&&!live.length;guard+=1){exchange.update(.05);live=liveRays(exchange);}
    assert.ok(live.length,`round ${count} has a comet to hit`);
    const target=live[0];
    const result=exchange.strike({rayId:target.id});
    assert.equal(result.hit,true);
    assert.equal(result.rayId,target.id);
    if(count<FIREBALL_RETURN_THRESHOLD){
      assert.equal(result.returned,false);
      assert.equal(exchange.snapshot().charge,count);
    }else{
      armedRay=target.id;
      assert.equal(result.returned,true,'the third deflection arms it');
      assert.equal(exchange.snapshot().active.rays.find((ray)=>ray.id===armedRay).state,'reversed');
      assert.equal(exchange.snapshot().charge,0);
    }
  }
  // The reversed comet flies back at the Surfer; the damage lands when it
  // arrives, not on the click.
  assert.deepEqual(returned,[]);
  for(let step=0;step<20;step+=1)exchange.update(.05);
  assert.equal(returned.length,1);
  assert.equal(returned[0].damage,FIREBALL_RETURN_DAMAGE);
  assert.equal(returned[0].rayId,armedRay);
  void clickHead;void finishAndRespawn;
  assert.ok(resolved.some((event)=>event.state==='deflected'));
  assert.ok(resolved.some((event)=>event.state==='reversed'));
});

// A COMET NOBODY TOUCHED LANDS.
test('an uncontested comet lands on the player for its own damage',()=>{
  const landed=[];
  const exchange=createFireballExchange({battleId:'hall',onImpact:(event)=>landed.push(event)});
  exchange.setMovement({id:'seated',index:0});
  const lifetime=2.2+FIREBALL_OUTSIDE_SECONDS*FIREBALL_OFFERS+FIREBALL_REBOUND_SECONDS+2;
  for(let elapsed=0;elapsed<lifetime;elapsed+=.05)exchange.update(.05);
  assert.ok(landed.length>=1,'it is not free to ignore one');
  assert.ok(landed.every((event)=>event.damage>0));
  assert.ok(landed.every((event)=>typeof event.rayId==='string'),'and each comet lands on its own account');
});

test('the first missed commitment rebounds on the same ray and causes no damage',()=>{
  const landed=[],frames=[];
  const exchange=createFireballExchange({
    battleId:'hall',manual:true,onImpact:(event)=>landed.push(event),onSync:(frame)=>{frames.push(frame);return true;},
  });
  exchange.setMovement({id:'seated',index:0});
  exchange.castNow();
  // Cross the stage, then consume exactly one complete outside offer.
  exchange.update(2.21);
  exchange.update(FIREBALL_OUTSIDE_SECONDS+.01);
  let ray=exchange.snapshot().active.rays[0];
  assert.equal(ray.state,'rebound');
  assert.equal(ray.offers,1);
  assert.deepEqual(landed,[],'the first miss is information, not damage');
  const retreat=exchange.snapshot().active.outsideFrame[0];
  assert.equal(retreat.offer,2);
  assert.ok(retreat.progress<=FIREBALL_CATCH_PROGRESS);
  exchange.update(FIREBALL_REBOUND_SECONDS+.01);
  ray=exchange.snapshot().active.rays[0];
  assert.equal(ray.state,'approach','the same ray is offered again');
  assert.equal(ray.offers,FIREBALL_OFFERS-1);
  assert.ok(frames.length>0);
});

test('the target stops for a long catch interval before either offer can expire',()=>{
  const exchange=createFireballExchange({battleId:'source-final',manual:true,getPressure:()=>({battleId:'source-final',turn:12})});
  exchange.setMovement({id:'final',index:2});
  exchange.castNow();
  exchange.update(2.21);
  // Let the authored feint end, then sample almost the whole committed hold.
  const feint=exchange.snapshot().choreography.breakMs/1000;
  exchange.update(feint+.001);
  const first=exchange.snapshot().active.outsideFrame[0];
  assert.equal(exchange.snapshot().active.rays[0].catchReady,true);
  exchange.update(exchange.snapshot().active.outsideSeconds-feint-.01);
  const held=exchange.snapshot().active.outsideFrame[0];
  assert.equal(held.progress,first.progress,'the native target does not keep approaching during commitment');
  assert.equal(held.progress,FIREBALL_CATCH_PROGRESS);
  assert.equal(exchange.snapshot().active.rays[0].state,'approach');
});

test('an explicitly configured short outside offer retains its own expiry contract',()=>{
  const landed=[];
  const exchange=createFireballExchange({battleId:'hall',manual:true,outsideSeconds:.2,onImpact:(event)=>landed.push(event)});
  exchange.setMovement({id:'seated',index:0});exchange.castNow();
  exchange.update(2.21);exchange.update(.21);
  assert.equal(exchange.snapshot().active.rays[0].state,'rebound');
  assert.equal(exchange.snapshot().active.outsideFrame[0].rebounding,true,'native tile keeps the previous bank through the AGAIN pause');
  assert.equal(landed.length,0);
  exchange.update(FIREBALL_REBOUND_SECONDS+.01);exchange.update(.21);
  assert.equal(exchange.snapshot().active.rays[0].state,'impact');
  assert.equal(landed.length,1,'the global timing refinement never overrides an explicit caller budget');
});

test('pause, movement completion, and emergency cancellation can never become impact damage',()=>{
  const landed=[];
  const exchange=createFireballExchange({battleId:'hall',manual:true,onImpact:(event)=>landed.push(event)});
  exchange.setMovement({id:'seated',index:0});
  exchange.castNow();
  exchange.update(2.21);
  const before=exchange.snapshot().active.rays[0].outside;
  exchange.update(20,{enabled:false});
  assert.equal(exchange.snapshot().active.rays[0].outside,before,'pause freezes the damaging clock');
  exchange.setMovement({id:'attention',index:1});
  assert.equal(exchange.snapshot().active,null);
  assert.equal(exchange.snapshot().last.type,'forgiven');
  assert.equal(exchange.snapshot().last.reason,'movement-change');
  assert.deepEqual(landed,[]);
  exchange.castNow();
  exchange.update(20,{enabled:false});
  exchange.cancel('double-escape');
  assert.equal(exchange.snapshot().last.reason,'double-escape');
  assert.deepEqual(landed,[]);
});

test('duplicate or stale addressed strikes never consume an untouched sibling',()=>{
  const {exchange,resolved}=harness();
  exchange.setMovement({id:'attention',index:1});
  exchange.castNow();
  exchange.update(.6);
  const castId=exchange.snapshot().active.plan.castId;
  assert.equal(exchange.strike({castId,rayId:'ray-1'}).hit,true);
  assert.equal(exchange.strike({castId,rayId:'ray-1'}).hit,false,
    'a repeated report cannot alias the next live ray');
  assert.equal(exchange.snapshot().charge,1);
  assert.equal(exchange.snapshot().active.rays[1].state,'inflight');
  exchange.update(.35);
  assert.equal(exchange.strike({castId,rayId:'ray-1'}).hit,false,
    'removing the resolved tail does not make its identity reusable');
  assert.equal(exchange.snapshot().charge,1);
  assert.equal(resolved.length,1);
});

test('unknown ray identities are rejected while unaddressed legacy strikes retain their behavior',()=>{
  const {exchange}=harness();
  exchange.setMovement({id:'attention',index:1});
  exchange.castNow();
  exchange.update(.6);
  const castId=exchange.snapshot().active.plan.castId;
  for(const rayId of ['ray-99','',0]){
    assert.equal(exchange.strike({castId,rayId}).hit,false);
  }
  assert.equal(exchange.strike({castId:'stale-cast',rayId:'ray-1'}).hit,false);
  assert.equal(exchange.snapshot().charge,0);
  assert.equal(exchange.strike({castId}).rayId,'ray-1');
  assert.equal(exchange.snapshot().charge,1);
});

function phasedExchange({movementId='attention',movementIndex=1,returnThreshold=3}={}){
  const exchange=createFireballExchange({
    battleId:'hall',manual:true,returnThreshold,getPressure:()=>({battleId:'hall',turn:6}),
  });
  exchange.setMovement({id:movementId,index:movementIndex});
  exchange.castNow();
  return exchange;
}

function poseOf(exchange,index=0){
  const ray=exchange.snapshot().active.outsideFrame.find((entry)=>entry.index===index);
  return {progress:ray.progress,dodge:ray.dodge,formationProgress:ray.formationProgress};
}

test('staggered arrival and commitment cues share each ray\'s own presentation phase',()=>{
  const exchange=phasedExchange();
  let sampled=false;
  for(let tick=0;tick<300;tick+=1){
    exchange.update(.01);
    const snapshot=exchange.snapshot();
    const first=snapshot.active.rays[0],second=snapshot.active.rays[1];
    if(!first.catchReady||second.state!=='approach'||second.catchReady)continue;
    const [held,arriving]=snapshot.active.outsideFrame;
    assert.equal(held.catchReady,true);
    assert.deepEqual(poseOf(exchange),{
      progress:FIREBALL_CATCH_PROGRESS,dodge:0,formationProgress:1,
    });
    assert.equal(arriving.catchReady,false);
    assert.ok(arriving.formationProgress>0&&arriving.formationProgress<1);
    assert.ok(arriving.dodge>0,'a later arrival still performs its own authored feint');
    assert.equal(arriving.progress,FIREBALL_CATCH_PROGRESS*arriving.formationProgress);
    assert.equal(snapshot.choreography.settled,true,
      'the legacy shared inspector phase is not the later ray\'s phase');
    sampled=true;
    break;
  }
  assert.equal(sampled,true,'the stagger creates an overlap of hold and arrival');
});

test('rebound retraces the offer and the second offer restarts its own feint',()=>{
  const exchange=phasedExchange({movementId:'seated',movementIndex:0});
  exchange.update(2.21);
  exchange.update(FIREBALL_OUTSIDE_SECONDS+.01);
  assert.equal(exchange.snapshot().active.rays[0].state,'rebound');
  assert.deepEqual(poseOf(exchange),{
    progress:FIREBALL_CATCH_PROGRESS,dodge:0,formationProgress:1,
  });
  exchange.update(FIREBALL_REBOUND_SECONDS/2);
  const returning=poseOf(exchange);
  assert.equal(returning.progress,FIREBALL_CATCH_PROGRESS/2);
  assert.equal(returning.formationProgress,.5);
  assert.equal(returning.dodge,exchange.snapshot().choreography.evasion,
    'the retreat reverses the same authored feint rather than inventing a new path');
  exchange.update(FIREBALL_REBOUND_SECONDS/2+.001);
  assert.equal(exchange.snapshot().active.rays[0].state,'approach');
  assert.equal(exchange.snapshot().active.outsideFrame[0].offer,2);
  assert.equal(exchange.snapshot().active.outsideFrame[0].rebounding,false,'next approach receives the new bank only after the pause');
  assert.deepEqual(poseOf(exchange),{progress:0,dodge:0,formationProgress:0});
  assert.equal(exchange.snapshot().choreography.settled,true);
  exchange.update(exchange.snapshot().choreography.breakMs/2000);
  const reoffered=exchange.snapshot().active.outsideFrame[0];
  assert.equal(reoffered.catchReady,false);
  assert.equal(reoffered.formationProgress,.5);
  assert.ok(reoffered.dodge>0,'the second offer has its own visible feint');
  exchange.update(exchange.snapshot().choreography.breakMs/2000+.001);
  assert.equal(exchange.snapshot().active.outsideFrame[0].catchReady,true);
  assert.deepEqual(poseOf(exchange),{
    progress:FIREBALL_CATCH_PROGRESS,dodge:0,formationProgress:1,
  });
});

test('resolved approach and rebound tails keep the pose at the accepted hit',()=>{
  for(const state of ['approach','rebound']){
    for(const returnThreshold of [1,3]){
      const exchange=phasedExchange({movementId:'seated',movementIndex:0,returnThreshold});
      exchange.update(2.21);
      if(state==='rebound')exchange.update(FIREBALL_OUTSIDE_SECONDS+.01);
      exchange.update(.1);
      assert.equal(exchange.snapshot().active.rays[0].state,state);
      const hitPose=poseOf(exchange);
      assert.ok(hitPose.dodge>0);
      assert.equal(exchange.strike({rayId:'ray-1'}).hit,true);
      assert.deepEqual(poseOf(exchange),hitPose,'resolution starts at the actual hit pose');
      exchange.update(.15);
      assert.equal(exchange.snapshot().active.rays[0].state,returnThreshold===1?'reversed':'deflected');
      assert.deepEqual(poseOf(exchange),hitPose,'the feedback tail does not resume movement');
    }
  }
});

test('pause freezes the per-ray presentation clock in approach and rebound',()=>{
  for(const state of ['approach','rebound']){
    const exchange=phasedExchange({movementId:'seated',movementIndex:0});
    exchange.update(2.21);
    if(state==='rebound')exchange.update(FIREBALL_OUTSIDE_SECONDS+.01);
    exchange.update(.1);
    const before=exchange.snapshot();
    const beforePose=poseOf(exchange);
    exchange.update(20,{enabled:false});
    assert.deepEqual(exchange.snapshot(),before);
    exchange.update(.01,{enabled:true});
    assert.notDeepEqual(poseOf(exchange),beforePose,
      'resuming advances the same offer instead of restarting it');
  }
});

test('late hover acquisition earns one stationary click grace without charging or resolving',()=>{
  const {exchange,resolved}=harness();exchange.update(.71);exchange.update(2.21);
  const active=exchange.snapshot().active;
  exchange.update(active.outsideSeconds-.1);
  const request={castId:active.plan.castId,rayId:'ray-1',offer:1};
  assert.equal(exchange.acquire(request).acquired,true);
  assert.equal(exchange.snapshot().charge,0);
  assert.equal(resolved.length,0);
  exchange.update(.70);
  assert.equal(exchange.snapshot().active.rays[0].state,'approach');
  assert.equal(exchange.acquire(request).duplicate,true,'hover cannot renew its deadline');
  exchange.update(.06);
  assert.equal(exchange.snapshot().active.rays[0].state,'rebound');
  assert.equal(resolved.length,0,'the first miss still only reoffers');
  assert.equal(exchange.snapshot().active.rays[0].acquired,false);
  assert.equal(exchange.acquire(request).acquired,false,'stale offer cannot acquire its replacement');
});

test('acquisition validates the exact live cast, ray and offer, then a click still catches once',()=>{
  const {exchange}=harness();exchange.update(.71);
  const castId=exchange.snapshot().active.plan.castId;
  assert.equal(exchange.acquire({castId,rayId:'ray-1',offer:1}).acquired,false,'an in-stage flight is not an external target');
  exchange.update(2.21);
  for(const request of [{castId:'old',rayId:'ray-1',offer:1},{castId,rayId:'absent',offer:1},{castId,rayId:'ray-1',offer:2},{castId,rayId:'ray-1',offer:1.5}])assert.equal(exchange.acquire(request).acquired,false);
  assert.equal(exchange.acquire({castId,rayId:'ray-1',offer:1}).acquired,true);
  assert.equal(exchange.strike({castId,rayId:'ray-1'}).hit,true);
  assert.equal(exchange.snapshot().charge,1);
  assert.equal(exchange.acquire({castId,rayId:'ray-1',offer:1}).acquired,false);
  assert.equal(exchange.strike({castId,rayId:'ray-1'}).hit,false);
  assert.equal(exchange.snapshot().charge,1);
});
