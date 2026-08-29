import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFireballExchange,
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
  for(let step=0;step<120;step+=1)exchange.update(.05);
  assert.ok(landed.length>=1,'it is not free to ignore one');
  assert.ok(landed.every((event)=>event.damage>0));
  assert.ok(landed.every((event)=>typeof event.rayId==='string'),'and each comet lands on its own account');
});
