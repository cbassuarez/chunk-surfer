// One-factor design experiment. Never imported by the game or production tests.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const baselinePath='artifacts/battle-experience-study/economy/fork-baseline-combat-state.txt';
const baselineSource=fs.readFileSync(baselinePath,'utf8'),baseURL=pathToFileURL(process.cwd()+'/src/game/combat-state.js');
const resolvedBaseline=baselineSource.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,q,id)=>`from ${q}${new URL(id,baseURL)}${q}`);
const {
  COMBAT_ACTION: A, TECHNIQUE: T, INTENT_KIND, PARRY_TIER,
  advanceEnemy, availableCombatActions, combatResult, createCombatState,
  currentCombatIntent, predictedCombatIntent, reduceCombat, selectEnemyIntents,
}=await import('data:text/javascript;base64,'+Buffer.from(resolvedBaseline).toString('base64'));
import {attachCombatDefinition, sourceCombatBattle} from '../../src/data/combat-definitions.js';
import {COMBAT_RULES} from '../../src/progression/difficulty-defs.js';
import {availableBattleTools, COMBAT_TOP_CAPACITY} from '../../src/game/combat-loadout.js';
import {TECHNIQUE_DEFS} from '../../src/game/combat-progression.js';

const output='artifacts/battle-experience-study/economy';
const seeds=[0,1,2,3,11,42,31337,2130706433];
const sourceFiles=['src/game/combat-state.js','src/game/combat-damage.js','src/game/combat-parry.js',
  'src/game/combat-loadout.js','src/game/combat-progression.js','src/game/recordist.js',
  'src/data/combat-definitions.js','src/progression/difficulty-defs.js','tools/chunk_surfer/tune-combat.mjs'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const previous=JSON.parse(fs.readFileSync(`${output}/provenance.json`));
const frozenFiles={'src/game/combat-state.js':baselinePath,'src/data/combat-definitions.js':'artifacts/battle-experience-study/economy/fork-baseline-combat-definitions.txt'};
const sourceHashes=Object.fromEntries(sourceFiles.map(path=>[path,sha(fs.readFileSync(frozenFiles[path]||path))]));
const productionHashes=Object.fromEntries(sourceFiles.map(path=>[path,sha(fs.readFileSync(path))]));
const drift=Object.entries(sourceHashes).filter(([path,hash])=>hash!==previous.sourceHashes[path]);
assert.deepEqual(drift,[],'frozen pre-change model evidence requires re-derivation after source drift');
const exactBranch='case INTENT_KIND.BROADCAST:\n        // You cannot broadcast over a reference. It has nothing to say into a\n        // room that is already sounding.\n        state.skipEnemyBeat = true;';
assert.equal(baselineSource.split(exactBranch).length,2,'exact one-factor baseline branch changed');
const definitions={chapel:attachCombatDefinition({id:'chapel',enemy:'chapel',rounds:[]}).combat,
  source:sourceCombatBattle({bodyReturn:false}).combat};
// The isolated rejection experiment retains the authored lengths before the
// later production refinement. Current definitions intentionally differ now.
for(const[id,definition]of Object.entries(definitions)){
  definitions[id]=structuredClone(definition);
  definitions[id].movements.forEach(m=>{m.coherence=id==='chapel'?20:25;});
}
const gear=['light','recorder','interface','tuning-fork','radio','coffee','plant-spanner'].map(id=>({id,present:true}));
const kits={
  signal:{top:['light','recorder','interface','tuning-fork'],techniques:[]},
  invested:{top:['light','recorder','interface','tuning-fork'],techniques:[T.DEEP_RESERVE,T.BRACE,T.PUNCH_IN,T.MASTER_TAKE,T.PERFECT_PITCH,T.HEADROOM]},
};
for(const kit of Object.values(kits)){
  assert.ok(kit.top.length<=COMBAT_TOP_CAPACITY);
  const order=availableBattleTools({top:kit.top},gear);
  kit.tools={...Object.fromEntries(['torch','recorder','rig','fork','radio','coffee','spanner'].map(id=>[id,order.includes(id)])),order};
  for(const id of kit.techniques){const def=TECHNIQUE_DEFS.find(d=>d.id===id);assert.ok(def&&(!def.requires||kit.techniques.includes(def.requires)));}
}
const open=s=>availableCombatActions(s).filter(a=>a.enabled);
const pick=(s,ids)=>ids.find(id=>open(s).some(m=>m.id===id))||A.WAIT;
const counters={broadcast:A.MONITOR,overload:A.HOLD,conceal:A.EXPOSE,loop:A.INVERT,silence:A.EXPOSE};
const reading=s=>pick(s,[A.PUT_IT_DOWN,A.LISTEN,counters[predictedCombatIntent(s)?.kind],A.PLAYBACK,A.EXPOSE,A.MONITOR,A.HOLD]);
const investing=s=>{
  const moves=open(s);if(moves.some(m=>m.id===A.TUNE))return A.TUNE;
  return moves.find(m=>[A.WHITEOUT,A.MASTER_TAKE,A.RUNAWAY_FEEDBACK].includes(m.id))?.id||reading(s);
};
const policies={investing,returnBody:s=>{
  // A declared outcome-seeking policy, not a claim of unbriefed recognition.
  // It recognizes the same body label displayed on the final chapel card.
  const movement=s.definition.movements[s.movementIndex],intent=predictedCombatIntent(s);
  if(s.definition.kind==='chapel'&&movement.id==='source'&&!s.proofs.includes('return.source')){
    if(s.take?.tag==='body')return pick(s,[A.PLAYBACK]);
    if(intent?.recordable&&intent.takeTag==='body')return A.MONITOR;
    // Keep the final phase alive until the body is recordable. Real damage,
    // followups and any chosen reaction still resolve through the real rules.
    return A.HOLD;
  }
  return investing(s);
}};
let singleFactorChecks=0,changedBroadcastForks=0;
function studyReduce(input,action,variant){
  const next=reduceCombat(input,action);
  const applicable=action.type===A.TUNE&&open(input).some(m=>m.id===A.TUNE)
    &&currentCombatIntent(input)?.kind===INTENT_KIND.BROADCAST;
  if(variant==='no-broadcast-suppression'&&applicable){
    const factual=structuredClone(next);
    next.skipEnemyBeat=input.skipEnemyBeat;
    const reconstructed=structuredClone(next);reconstructed.skipEnemyBeat=factual.skipEnemyBeat;
    assert.deepEqual(reconstructed,factual,'variant altered a second field');singleFactorChecks++;
    if(next.skipEnemyBeat!==factual.skipEnemyBeat)changedBroadcastForks++;
  }
  return next;
}
function snapshot(s){return {movement:s.definition.movements[s.movementIndex]?.id,coherence:s.movementCoherence,
  composure:s.composure,charge:s.charge,battery:s.battery,take:s.take,tempo:s.tempo,skipEnemyBeat:s.skipEnemyBeat,
  tuneUsedMovement:s.tuneUsedMovement,tuneBonus:s.tuneBonus,read:s.read,phase:s.phase,proofs:[...s.proofs],result:s.result?.result||null};}
function play({encounter,kit='signal',policy='investing',reaction='none',incoming=40,seed=0,variant='current',trace=false}){
  let state=createCombatState(structuredClone(definitions[encounter]),{difficulty:COMBAT_RULES.standard,...kits[kit],composure:incoming,injuries:0,battery:1,seed});
  const initial=snapshot(state),events=[],enemyKinds={},enemyIds={},responses={};let commits=0,enemyOffers=0,parryRestored=0,parries=0,guard=0;
  while(!state.result&&guard++<250){
    const before=snapshot(state),predicted=predictedCombatIntent(state),id=policies[policy](state);
    state=studyReduce(state,{type:id,replaceTake:true},variant);commits++;responses[id]=(responses[id]||0)+1;
    if(trace)events.push({event:'commit',id,predicted:{id:predicted?.id,kind:predicted?.kind},before,after:snapshot(state),last:state.last});
    for(let actor=0;state.phase==='enemy'&&!state.result&&actor<4;actor++){
      const prior=snapshot(state),primary=selectEnemyIntents(state)[0];state=advanceEnemy(state);enemyOffers++;
      const hits=state.last.enemyHits||[];
      for(const hit of hits){assert.equal(typeof hit.intentId,'string');enemyKinds[hit.kind]=(enemyKinds[hit.kind]||0)+1;enemyIds[hit.intentId]=(enemyIds[hit.intentId]||0)+1;}
      const rawReceived=state.last.received;
      if(reaction==='perfect'&&!state.practice&&['broadcast','overload','loop'].includes(primary?.kind)){
        state=reduceCombat(state,{type:A.PARRY,tier:PARRY_TIER.PERFECT});if(state.last.parried){parries++;parryRestored+=state.last.parryRestored||0;}
      }
      if(trace)events.push({event:'enemy',primary:{id:primary?.id,kind:primary?.kind},rawReceived,before:prior,after:snapshot(state),last:state.last});
    }
  }
  const result=combatResult(state);
  return {encounter,kit,policy,reaction,incoming,seed,variant,result:result?.result||'unresolved',commits,turns:state.turns,
    enemyOffers,enemyKinds,enemyIds,distinctEnemyKinds:Object.keys(enemyKinds).length,responses,
    composureStart:initial.composure,composureEnd:state.composure,maxComposure:state.maxComposure,
    damageTaken:state.damageTaken,parries,parryRestored,chargeEnd:state.charge,batterySpent:initial.battery-state.battery,
    perfectCounters:state.perfectCounters,missedCounters:state.missedCounters,breaks:state.sentBack.length,
    proofs:[...state.proofs],finaleGrants:result?.finale?.grants||[],finaleLocks:result?.finale?.locks||[],
    ...(trace?{initial,final:snapshot(state),events}:{}),};
}
const rows=[];
for(const encounter of ['chapel','source'])for(const kit of Object.keys(kits))
for(const policy of Object.keys(policies))for(const reaction of ['none','perfect'])for(const incoming of [20,40])
for(const seed of seeds)for(const variant of ['current','no-broadcast-suppression'])
 rows.push(play({encounter,kit,policy,reaction,incoming,seed,variant}));
const keys=['result','commits','turns','enemyOffers','composureStart','composureEnd','maxComposure','damageTaken','parryRestored','chargeEnd','batterySpent','perfectCounters','missedCounters','breaks','proofs','finaleGrants','finaleLocks'];
const priorRows=JSON.parse(fs.readFileSync(`${output}/rows.json`));let priorBaselineChecks=0;
for(const row of rows.filter(r=>r.variant==='current'&&r.policy==='investing'&&r.incoming===40)){
 const prior=priorRows.find(r=>r.encounter===row.encounter&&r.kit===row.kit&&r.policy===row.policy&&r.reaction===row.reaction&&r.seed===row.seed&&r.preset==='standard');assert.ok(prior);
 for(const key of keys)assert.deepEqual(row[key],prior[key],`baseline changed: ${key}`);priorBaselineChecks++;
}
const mean=(g,key)=>Math.round(g.reduce((n,r)=>n+r[key],0)/g.length*100)/100;
const grouped=new Map();for(const row of rows){const key=[row.encounter,row.kit,row.policy,row.reaction,row.incoming,row.variant].join('|');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
const summary=[...grouped.values()].map(g=>({...Object.fromEntries(['encounter','kit','policy','reaction','incoming','variant'].map(k=>[k,g[0][k]])),n:g.length,
 wins:g.filter(r=>r.result==='win').length,unresolved:g.filter(r=>r.result==='unresolved').length,meanTurns:mean(g,'turns'),meanCommits:mean(g,'commits'),
 meanEnemyOffers:mean(g,'enemyOffers'),meanDistinctEnemyKinds:mean(g,'distinctEnemyKinds'),meanGrossDamage:mean(g,'damageTaken'),
 meanEnd:mean(g,'composureEnd'),minEnd:Math.min(...g.map(r=>r.composureEnd)),meanParryRestored:mean(g,'parryRestored'),
 surfacedReceipts:g.filter(r=>r.finaleGrants.includes('route.surfaced')).length,meanProofCount:Math.round(g.reduce((n,r)=>n+r.proofs.length,0)/g.length*100)/100,
 enemyKinds:[...new Set(g.flatMap(r=>Object.keys(r.enemyKinds)))],enemyIds:[...new Set(g.flatMap(r=>Object.keys(r.enemyIds)))],
}));
// Exact traces keep an identical seed/arrival for ordinary and outcome-seeking policies.
const traces=[];for(const encounter of ['chapel','source'])for(const policy of Object.keys(policies))for(const variant of ['current','no-broadcast-suppression'])
 traces.push(play({encounter,policy,variant,seed:42,trace:true}));
const provenance={generatedAt:new Date().toISOString(),command:'node tools/chunk_surfer/battle-study-tune-control.mjs',
  scope:'Frozen pre-production single-factor rejection experiment; the later production rule is compared in fork-refinement-*.',
  hypothesis:'Removing only free TUNE Broadcast suppression may expose later authored threats. Compare before choosing any balance change.',
  surgicalChange:'After an enabled TUNE against Broadcast, restore the incoming skipEnemyBeat value. The other returned fields are asserted equal to the actual reducer. All other actions and all enemy resolution use production functions unchanged.',
  kept:['free TUNE','held read and two-intent lookahead','resonant bonus','TEMPO','all phase health and authored intents','techniques','damage bands','reaction tiers','equipment','narrative proof/grant conditions'],
  checks:{priorSourceHashesMatch:true,priorBaselineChecks,singleFactorChecks,changedBroadcastForks},sourceHashes,productionHashes,
  instrumentSha256:sha(fs.readFileSync('tools/chunk_surfer/battle-study-tune-control.mjs')),
  limits:['Legal inventory and deterministic seed fixtures; not captured chapter arrivals or player win rates.',
    'Decision selection and occupied-take replacement are instantaneous. No scene clock, audio, animation, projectile, native window or input latency is simulated.',
    'Perfect reactions are assigned, not evidence of human timing. No reaction balances or difficulty percentages are selected.',
    'Variant deliberately retains current TUNE notice text to change exactly one state effect; it is not a ready-to-ship UI or ordinary-control prototype.',
    'returnBody is a declared outcome-seeking policy that recognizes the final card body semantic. It tests reachable proof handling, not whether an unbriefed player recognizes that objective.',
    'Gross damageTaken includes refunded damage; use end composure and parry restoration separately.',
  ],seeds,kits};
for(const[name,value]of Object.entries({rows,summary,traces,provenance}))
 fs.writeFileSync(`${output}/tune-control-${name}.json`,JSON.stringify(value,null,2)+'\n');
const at=(encounter,variant,{policy='investing',reaction='none',incoming=40,kit='signal'}={})=>summary.find(r=>r.encounter===encounter&&r.variant===variant&&r.policy===policy&&r.reaction===reaction&&r.incoming===incoming&&r.kit===kit);
const pairs=(encounter,options)=>({current:at(encounter,'current',options),suppressionRemoved:at(encounter,'no-broadcast-suppression',options)});
const findings={kind:'one-factor-TUNE-suppression-counterfactual',productionChanges:false,rows:rows.length,
  baselineFrozen:true,sourceCurrent:false,checks:provenance.checks,
  conclusion:'Broadcast suppression is a contributing causal link, not a complete balance solution. The switch should not ship universally from this evidence.',
  demonstrated:{chapelHealthy:pairs('chapel'),sourceHealthy:pairs('source'),chapelWeak:pairs('chapel',{incoming:20}),
    chapelDeliberateReturn:pairs('chapel',{policy:'returnBody'}),chapelExpertReaction:pairs('chapel',{reaction:'perfect'}),sourceExpertReaction:pairs('source',{reaction:'perfect'})},
  interpretation:[
    'The current efficient signal policy produces no actual enemyHits. Disabling only Broadcast suppression exposes Broadcast and later Overload hits.',
    'At40 incoming composure, the unupgraded signal policy still wins all eight Chapel and Source fixtures. Chapel mean end falls40 to21.63; Source40 to35.5.',
    'The deliberate final-body return policy receives surfaced in all eight healthy Chapel fixtures on either side. It actively avoids tuning the final body capture before playback.',
    'From20 incoming composure with no parry, four of eight Chapel fixtures now lose. Weak-arrival tolerance is an explicit rejection gate.',
    'Assigned PERFECT preserves full40 composure across sampled healthy signal-kit Chapel/Source fixtures, but can shorten Chapel enough that only Broadcast attacks resolve. Varied strategic demand remains unproved.',
  ],
  recommendedNext:'Use the isolated toggle in a bounded ordinary-control Chapel/Source comparison, keep reaction balance unchanged, and inspect actual later threats plus deliberate proof receipt. Test weak actual arrivals before any production decision.',
  limits:provenance.limits,
};
fs.writeFileSync(`${output}/tune-control-findings.json`,JSON.stringify(findings,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,summary:summary.length,traces:traces.length,checks:provenance.checks},null,2));
