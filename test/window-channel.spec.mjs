import test from 'node:test';
import assert from 'node:assert/strict';
import { authoredCombatProfile, sourceCombatDefinition } from '../src/data/combat-definitions.js';
import { createBattleInterferenceDirector } from '../src/game/interference-director.js';
import { psychProfileChoice } from '../src/game/psychological-profile.js';
import {
  FIREBALL_BATTLE_IDS,advanceFireballCastPlan,canonicalFireballBattleId,
  compileFireballCastPlan,freshWindowChannelProgress,projectFireballRay,validateFireballCastPlan,
} from '../src/game/window-channel.js';

const definition=(id)=>id==='source-final'?sourceCombatDefinition():{id,enemy:id.toUpperCase(),baseComposure:40,...authoredCombatProfile(id)};
const expected={natatorium:[1,2,3],hall:[1,2,3],practice:[1,2,3],chapel:[1,2,2,3,4],'source-final':[2,3,4]};

test('all five battles compile deterministic 1-4 ray fireball cast plans',()=>{
  for(const battleId of FIREBALL_BATTLE_IDS){
    const combat=definition(battleId);
    assert.deepEqual(combat.movements.map((movement,index)=>{
      const intent=movement.intents.find(({kind})=>['broadcast','overload','loop'].includes(kind));
      const input={battleId,movementId:movement.id,movementIndex:index,movementTitle:movement.title,intentId:intent.id,intentKind:intent.kind,castSequence:3};
      const left=compileFireballCastPlan(input),right=compileFireballCastPlan(input);
      assert.deepEqual(left,right);assert.ok(validateFireballCastPlan(left));
      assert.equal(left.source,'ranged');assert.equal('intentId' in left,false);
      assert.equal(JSON.stringify(left).match(/operator|caption|identity|statistic/gi),null);
      return left.rayCount;
    }),expected[battleId]);
  }
  assert.equal(canonicalFireballBattleId('training'),null);
});

test('rays leave the game edge and continue on exactly the same line',()=>{
  const ray=projectFireballRay({origin:{x:.5,y:.5},direction:{x:2,y:-1},beyond:.4});
  assert.ok(ray.exit.x===1||ray.exit.y===0||ray.exit.x===0||ray.exit.y===1);
  const cross=(ray.exit.x-ray.origin.x)*(ray.beyond.y-ray.exit.y)-(ray.exit.y-ray.origin.y)*(ray.beyond.x-ray.exit.x);
  assert.ok(Math.abs(cross)<1e-12);
});

test('click-built RETURN reverses the same cast id and impact carries only an integer',()=>{
  const cast=compileFireballCastPlan({battleId:'hall',movementId:'attention',movementIndex:1,intentId:'hall:turn',intentKind:'broadcast'});
  const reversed=advanceFireballCastPlan(cast,{state:'reversed',damage:9.8});
  assert.equal(reversed.castId,cast.castId);assert.equal(reversed.state,'reversed');
  assert.ok(reversed.rays.every((ray)=>ray.directionSign===-1));
  const impact=advanceFireballCastPlan(cast,{state:'impact',damage:7.9});
  assert.equal(impact.damage,7);assert.equal(impact.state,'impact');
});

test('legacy modal continuation is accepted and ignored by the fresh click-RETURN exchange',async()=>{
  const started=[];
  const director=createBattleInterferenceDirector({
    getSettings:()=>({enabled:true,intensity:'hostile'}),getProfile:()=>psychProfileChoice(true),getContext:()=>({}),
    effects:{begin:()=> 'token',prepareFireballs:()=>true,beginFireballCast:(cast)=>started.push(cast.castId)},
  });
  const hook=director.forBattle('hall','hall',{battleId:'hall',charge:3,returned:true,movements:[0]});
  await hook.enter();
  const movement=definition('hall').movements[0],intent=movement.intents.find(({kind})=>kind==='broadcast');
  await hook.movement({id:movement.id,index:0,title:movement.title});
  const request={movementIndex:0,movementId:movement.id,movementTitle:movement.title,intentId:intent.id,intentKind:intent.kind};
  const first=hook.beginFireballCast(request),second=hook.beginFireballCast(request);
  assert.notEqual(first.castId,second.castId,'successive enemy casts do not deduplicate a movement');
  assert.equal(hook.channelState(),null);assert.deepEqual(freshWindowChannelProgress('hall'),{battleId:'hall',ignored:true});
  assert.equal(started.length,2);
});

test('native surface prewarm starts before identity or artifact work can block arrival',async()=>{
  let releaseIdentity;
  const identityGate=new Promise((resolve)=>{releaseIdentity=resolve;});
  const begun=[];
  const director=createBattleInterferenceDirector({
    identityCache:{request:()=>identityGate,clear:()=>{}},
    loadKey:async()=>new Uint8Array(32),
    maskSnapshot:async()=>({caseId:'FIELD-1234ABCD',tokens:{}}),
    getSettings:()=>({enabled:true,intensity:'hostile'}),getProfile:()=>psychProfileChoice(true),getContext:()=>({}),
    effects:{begin:(options)=>{begun.push(options);return'token';}},
  });
  const hook=director.forBattle('natatorium','natatorium');
  const entering=hook.enter();
  assert.equal(begun.length,1,'prewarm is launched synchronously before the first identity await');
  releaseIdentity({schema:1,persona:null,hostname:null,mic:null});
  await entering;
});
