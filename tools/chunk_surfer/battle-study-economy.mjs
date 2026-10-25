// Bounded design-study instrument. No game data or production rules are changed.
// This is a reducer policy experiment, never a substitute for first-player play.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  COMBAT_ACTION as A, TECHNIQUE as T, PARRY_TIER, advanceEnemy, availableCombatActions,
  combatResult, createCombatState, predictedCombatIntent, reduceCombat,
  selectEnemyIntents,
} from '../../src/game/combat-state.js';
import { attachCombatDefinition, sourceCombatBattle } from '../../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../../src/progression/difficulty-defs.js';
import { availableBattleTools, COMBAT_TOP_CAPACITY } from '../../src/game/combat-loadout.js';
import { TECHNIQUE_DEFS } from '../../src/game/combat-progression.js';
import { parryOpportunitySnapshot, PARRY_IMPACT_SECONDS } from '../../src/game/combat-parry.js';

const out = 'artifacts/battle-experience-study/economy';
fs.mkdirSync(out, { recursive:true });
const definitions = Object.fromEntries(['natatorium','hall','practice','chapel'].map(id =>
  [id, attachCombatDefinition({id,enemy:id,rounds:[]}).combat]));
definitions.source = sourceCombatBattle({bodyReturn:false}).combat;
const counter = {broadcast:A.MONITOR,overload:A.HOLD,conceal:A.EXPOSE,loop:A.INVERT,silence:A.EXPOSE};
const allGear = ['light','recorder','interface','tuning-fork','radio','coffee','plant-spanner'].map(id=>({id,present:true}));
const kits = {
  starter:{top:['light','recorder','radio'],techniques:[]},
  signal:{top:['light','recorder','interface','tuning-fork'],techniques:[]},
  recovery:{top:['light','recorder','radio','coffee'],techniques:[]},
  invested:{top:['light','recorder','interface','tuning-fork'],techniques:[T.DEEP_RESERVE,T.BRACE,T.PUNCH_IN,T.MASTER_TAKE,T.PERFECT_PITCH,T.HEADROOM]},
  nerve:{top:['light','recorder','radio','coffee'],techniques:[T.DEEP_RESERVE,T.BRACE,T.STEADY_NERVE,T.RIPOSTE,T.SECOND_WIND,T.PUNCH_IN]},
  whiteout:{top:['light','recorder','interface','tuning-fork'],techniques:[T.AFTERIMAGE,T.WHITEOUT,T.DEEP_RESERVE,T.BRACE,T.PUNCH_IN,T.MASTER_TAKE]},
};
for (const kit of Object.values(kits)) {
  if(kit.top.length>COMBAT_TOP_CAPACITY)throw Error('illegal kit');
  const ids=availableBattleTools({top:kit.top},allGear);
  kit.tools=Object.fromEntries(['torch','recorder','rig','fork','radio','coffee','spanner'].map(id=>[id,ids.includes(id)]));
  kit.tools.order=ids;
  for(const id of kit.techniques){
    const def=TECHNIQUE_DEFS.find(entry=>entry.id===id);
    if(!def||(def.requires&&!kit.techniques.includes(def.requires)))throw Error(`invalid prerequisites ${id}`);
  }
}
const open = s => availableCombatActions(s).filter(m=>m.enabled);
const pick = (s,ids) => ids.find(id=>open(s).some(m=>m.id===id))||A.WAIT;
const reading = s=>pick(s,[A.PUT_IT_DOWN,A.LISTEN,counter[predictedCombatIntent(s)?.kind],A.PLAYBACK,A.EXPOSE,A.MONITOR,A.HOLD]);
const policies = {
  expose:s=>pick(s,[A.EXPOSE,A.SHOUT]),
  greedy:s=>open(s).filter(m=>m.damage>0).sort((a,b)=>b.damage-a.damage)[0]?.id||A.WAIT,
  reading,
  cautious:s=>{
    if(s.composure<=s.maxComposure*.5){
      if(open(s).some(m=>m.id===A.STEADY_HANDS))return A.STEADY_HANDS;
      if(open(s).some(m=>m.id===A.COMPOSE))return A.COMPOSE;
    }
    return reading(s);
  },
  investing:s=>{
    const moves=open(s);
    if(moves.some(m=>m.id===A.TUNE))return A.TUNE;
    const special=moves.find(m=>[A.WHITEOUT,A.MASTER_TAKE,A.RUNAWAY_FEEDBACK].includes(m.id));
    return special?.id||reading(s);
  },
};
const reactionTier=(reaction,offer)=>reaction==='none'?null:reaction==='late'?PARRY_TIER.LATE
  :reaction==='good'?PARRY_TIER.GOOD:reaction==='perfect'?PARRY_TIER.PERFECT
  :reaction==='alternating'?(offer%2?PARRY_TIER.GOOD:null):null;
function snapshot(s){return {phase:s.phase,result:s.result?.result||null,movement:s.movementIndex,
  coherence:s.movementCoherence,composure:s.composure,charge:s.charge,battery:s.battery,
  take:s.take?.id||null,snr:s.snr,tempo:s.tempo,perfectCounters:s.perfectCounters,
  sentBack:[...s.sentBack],cover:s.sourceDesktop?.cover||null};}
function play({encounter,kit='starter',preset='standard',policy='reading',reaction='none',seed=0,
  incoming=40,injuries=0,battery=1,trace=false,variant='current'}) {
  const definition=structuredClone(definitions[encounter]);
  // A design counterexample only: use the existing intent copies/amounts but
  // rotate their opening by movement. This is not a proposed finished script.
  if(variant==='rotated-openings')definition.movements.forEach((movement,index)=>{
    for(const key of ['intents','severeIntents','deadAirIntents']){
      const intents=movement[key];if(!intents?.length)continue;
      const at=index%intents.length;movement[key]=[...intents.slice(at),...intents.slice(0,at)];
    }
  });
  let state=createCombatState(definition,{difficulty:COMBAT_RULES[preset],
    ...kits[kit],composure:incoming,injuries,battery,seed});
  const initial=snapshot(state),events=[];
  let commits=0,enemyOffers=0,parryOffers=0,parries=0,parryRestored=0,parryReflected=0,healGained=0;
  let guard=0;
  while(!state.result&&guard++<250){
    const before=snapshot(state),predicted=predictedCombatIntent(state);
    const id=policies[policy](state),priorLog=state.actionLog.length;
    state=reduceCombat(state,{type:id,replaceTake:true});
    commits++;
    if([A.COMPOSE,A.STEADY_HANDS].includes(id))healGained+=Math.max(0,state.composure-before.composure);
    if(trace)events.push({event:'commit',id,predicted:{id:predicted?.id,kind:predicted?.kind},before,
      after:snapshot(state),last:state.last,log:state.actionLog.slice(priorLog)});
    for(let actor=0;state.phase==='enemy'&&!state.result&&actor<4;actor++){
      const previous=snapshot(state),primary=selectEnemyIntents(state)[0];
      state=advanceEnemy(state);enemyOffers++;
      const eligible=!state.practice&&['broadcast','overload','loop'].includes(primary?.kind);
      const tier=eligible?reactionTier(reaction,parryOffers++):null;
      const rawReceived=state.last.received,rawDealt=state.last.dealt||0;
      if(tier){
        state=reduceCombat(state,{type:A.PARRY,tier});
        if(state.last.parried){parries++;parryRestored+=state.last.parryRestored||0;
          parryReflected+=Math.max(0,(state.last.dealt||0)-rawDealt);}
      }
      if(trace)events.push({event:'enemy',primary:{id:primary?.id,kind:primary?.kind},tier,
        rawReceived,before:previous,after:snapshot(state),last:state.last});
    }
  }
  const result=combatResult(state);
  return {encounter,kit,preset,policy,reaction,seed,incoming,injuries,battery,variant,
    result:result?.result||'unresolved',commits,turns:state.turns,enemyOffers,parryOffers,parries,
    parryRestored,parryReflected,healGained,damageTaken:state.damageTaken,
    composureStart:initial.composure,maxComposure:state.maxComposure,composureEnd:state.composure,
    chargeEnd:state.charge,batterySpent:initial.battery-state.battery,
    perfectCounters:state.perfectCounters,missedCounters:state.missedCounters,
    breaks:state.sentBack.length,completedMovements:state.completedMovements.length,
    proofs:[...state.proofs],finaleGrants:result?.finale?.grants||[],finaleLocks:result?.finale?.locks||[],
    actionCounts:state.actionLog.filter(e=>e.action!=='enemy').reduce((a,e)=>(a[e.action]=(a[e.action]||0)+1,a),{}),
    enemyIntentCounts:state.actionLog.filter(e=>e.action==='enemy').flatMap(e=>e.enemyHits||[])
      .reduce((a,e)=>(a[e.kind]=(a[e.kind]||0)+1,a),{}),
    ...(trace?{initial,final:snapshot(state),events}:{}),
  };
}
const rows=[];
for(const encounter of ['natatorium','hall','chapel','source'])
for(const kit of ['starter','signal','invested'])
for(const policy of ['expose','greedy','reading','cautious','investing'])
for(const reaction of ['none','good','perfect'])
for(const seed of [0,1,2,3,11,42,31337,2130706433])
  rows.push(play({encounter,kit,policy,reaction,seed}));
const sensitivity=[];
for(const encounter of ['natatorium','chapel','source'])
for(const kit of ['starter','signal','invested','nerve','whiteout'])
for(const preset of Object.keys(COMBAT_RULES))
for(const reaction of ['none','alternating','perfect'])
for(const incoming of [20,40])
for(const seed of [0,42,31337])
  sensitivity.push(play({encounter,kit,preset,reaction,incoming,seed,policy:kit==='nerve'?'reading':'investing'}));
const batterySensitivity=[];
for(const encounter of ['natatorium','chapel','source'])
for(const battery of [0,.049,.05,1])
for(const reaction of ['none','perfect'])
  batterySensitivity.push(play({encounter,battery,reaction,kit:'whiteout',policy:'investing',seed:42}));
const openingPrototype=[];
for(const encounter of ['chapel','source'])
for(const kit of ['starter','signal','invested'])
for(const reaction of ['none','good'])
for(const variant of ['current','rotated-openings'])
for(const seed of [0,1,2,3,11,42,31337,2130706433])
  openingPrototype.push(play({encounter,kit,reaction,variant,seed,policy:'investing'}));
const traces=[
  play({encounter:'natatorium',kit:'starter',policy:'reading',reaction:'none',seed:42,trace:true}),
  play({encounter:'natatorium',kit:'starter',policy:'expose',reaction:'perfect',seed:42,trace:true}),
  play({encounter:'chapel',kit:'invested',policy:'investing',reaction:'none',seed:42,trace:true}),
  play({encounter:'chapel',kit:'invested',policy:'investing',reaction:'perfect',seed:42,trace:true}),
  play({encounter:'source',kit:'starter',policy:'expose',reaction:'perfect',seed:42,trace:true}),
  play({encounter:'chapel',kit:'signal',policy:'investing',reaction:'none',variant:'rotated-openings',seed:42,trace:true}),
];
const practice=[];
for(const policy of ['expose','greedy','reading'])
for(const kit of ['starter','invested'])practice.push(play({encounter:'practice',kit,policy,reaction:'none',seed:42}));
function aggregate(items,keys){
  const groups=new Map();
  for(const row of items){const key=keys.map(k=>row[k]).join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups.values()].map(group=>({
    ...Object.fromEntries(keys.map(key=>[key,group[0][key]])),n:group.length,
    wins:group.filter(r=>r.result==='win').length,losses:group.filter(r=>r.result==='lose').length,
    unresolved:group.filter(r=>r.result==='unresolved').length,
    meanTurns:mean(group,'turns'),meanCommits:mean(group,'commits'),meanGrossDamage:mean(group,'damageTaken'),meanStart:mean(group,'composureStart'),
    meanEnd:mean(group,'composureEnd'),minEnd:Math.min(...group.map(r=>r.composureEnd)),
    meanParryRestored:mean(group,'parryRestored'),meanParryReflected:mean(group,'parryReflected'),
    meanHeal:mean(group,'healGained'),meanBreaks:mean(group,'breaks'),
  }));
}
function mean(items,key){return Math.round(items.reduce((sum,row)=>sum+row[key],0)/items.length*100)/100;}
const timing=Object.fromEntries(Object.entries(COMBAT_RULES).map(([id,rule])=>{
  const view=parryOpportunitySnapshot({actionKind:'overload',windowScale:rule.parryWindowScale});
  return [id,{impactSeconds:PARRY_IMPACT_SECONDS,windowSeconds:view.widthSeconds,openSeconds:view.openSeconds,
    goodStartSeconds:view.openSeconds+view.widthSeconds*.4,perfectStartSeconds:view.openSeconds+view.widthSeconds*.75,
    perfectWidthSeconds:view.widthSeconds*.25,contactGraceSeconds:view.graceEnds-view.impactSeconds}];
}));
const sourceFiles=['src/game/combat-state.js','src/game/combat-damage.js','src/game/combat-parry.js',
  'src/game/combat-loadout.js','src/game/combat-progression.js','src/game/recordist.js',
  'src/data/combat-definitions.js','src/progression/difficulty-defs.js','tools/chunk_surfer/tune-combat.mjs'];
const provenance={generatedAt:new Date().toISOString(),kind:'deterministic-reducer-policy-study',
  command:'node tools/chunk_surfer/battle-study-economy.mjs',
  limits:[
    'Contract-valid inventory/technique fixtures; these are not exported arrivals from an uninterrupted run.',
    'Policies make instantaneous choices and replace occupied battle takes without human confirmation latency.',
    'Parries are assigned deterministic tiers, not sampled from human reaction times.',
    'No real-time projectile impacts/returns, scene timers, narrative/profile pressure, native focus, sound, or hand animation is simulated.',
    'Hall target policy remains default/automatic; no expert CUE targeting is modeled.',
    'damageTaken is gross reducer accounting, includes damage later restored by parry; it is not net attrition.',
    'Across-seed sample is exploratory and is not a player win rate or population estimate.',
    'rotated-openings is an isolated data counterexample; it is not shipped, narrative-approved, or rendered in the game.',
  ],kits,timing,sourceHashes:Object.fromEntries(sourceFiles.map(path=>[path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]))};
const tunerMismatch={
  investedInput:['deep-reserve','brace','punch-in','master-take','perfect-pitch','headroom'],
  investedActuallySelected:['deep-reserve','brace','punch-in','master-take','perfect-pitch','headroom']
    .filter(id=>TECHNIQUE_DEFS.some(def=>def.id===id)),
  fullBagTools:['torch','recorder','rig','fork','radio','coffee','spanner'],liveTopCapacity:COMBAT_TOP_CAPACITY,
  liveStarterTop:['light','recorder','radio'],tunerStockTools:['torch','recorder'],
  fullFightStart:'Tuner defaults null composure to definition ceiling; live ordinary combat passes carried REC.composure().',
  liveCarryFloor:20,tunerNightWinFloorApplied:false,
  reactionCoverage:'Current tuner omits parries and real-time projectiles.',
};
for(const [name,value]of Object.entries({provenance,tunerMismatch,rows,sensitivity,batterySensitivity,traces,practice,openingPrototype,
  aggregate:aggregate(rows,['encounter','kit','policy','reaction']),
  openingPrototypeAggregate:aggregate(openingPrototype,['encounter','kit','reaction','variant']),
  sensitivityAggregate:aggregate(sensitivity,['encounter','kit','preset','reaction','incoming'])}))
  fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({out,rows:rows.length,sensitivity:sensitivity.length,battery:batterySensitivity.length,
  traces:traces.length,practice:practice.length,openingPrototype:openingPrototype.length,provenance:provenance.limits},null,2));
