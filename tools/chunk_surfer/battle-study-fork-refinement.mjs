// Reproducible pre-change versus production comparison. No production writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import * as production from '../../src/game/combat-state.js';
import {attachCombatDefinition,sourceCombatBattle} from '../../src/data/combat-definitions.js';
import {COMBAT_RULES} from '../../src/progression/difficulty-defs.js';
import {availableBattleTools} from '../../src/game/combat-loadout.js';
const path='src/game/combat-state.js',baseURL=pathToFileURL(process.cwd()+'/'+path);
const baselinePath='artifacts/battle-experience-study/economy/fork-baseline-combat-state.txt';
const prior=JSON.parse(fs.readFileSync('artifacts/battle-experience-study/economy/provenance.json'));
const source=fs.readFileSync(baselinePath,'utf8'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(source),prior.sourceHashes[path],'the frozen pre-change reducer changed');
const resolved=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,q,id)=>`from ${q}${new URL(id,baseURL)}${q}`);
const original=await import('data:text/javascript;base64,'+Buffer.from(resolved).toString('base64'));
const candidate=production;
const A=original.COMBAT_ACTION,T=original.TECHNIQUE;
const gear=['light','recorder','interface','tuning-fork','radio','coffee'].map(id=>({id,present:true}));
const kits={starter:{top:['light','recorder','radio'],techniques:[]},signal:{top:['light','recorder','interface','tuning-fork'],techniques:[]},invested:{top:['light','recorder','interface','tuning-fork'],techniques:[T.DEEP_RESERVE,T.BRACE,T.PUNCH_IN,T.MASTER_TAKE,T.PERFECT_PITCH,T.HEADROOM]}};
for(const k of Object.values(kits)){const order=availableBattleTools({top:k.top},gear);k.tools={...Object.fromEntries(['torch','recorder','rig','fork','radio','coffee'].map(id=>[id,order.includes(id)])),order};}
const counters={broadcast:A.MONITOR,overload:A.HOLD,conceal:A.EXPOSE,loop:A.INVERT,silence:A.EXPOSE};
function play({variant,encounter,kit='signal',incoming=20,injuries=0,seed=42,preset='standard',policy='cautious',reaction='none'}){
 const api=variant==='before'?original:candidate;
 let def=structuredClone(encounter==='chapel'?attachCombatDefinition({id:'chapel',enemy:'chapel',rounds:[]}).combat:sourceCombatBattle().combat);
 def.movements.forEach(m=>{m.coherence=encounter==='chapel'?20:25;});
 if(variant==='production')def.movements.forEach((m,i)=>{if(encounter==='source'||i>=2)m.coherence=30;});
 if(variant==='all30-rejected')def.movements.forEach(m=>m.coherence=30);
 let state=api.createCombatState(def,{...kits[kit],difficulty:COMBAT_RULES[preset],composure:incoming,injuries,battery:1,seed});
 const open=()=>api.availableCombatActions(state).filter(m=>m.enabled),pick=ids=>ids.find(id=>open().some(m=>m.id===id))||A.WAIT;
 const events=[],enemyKinds={};let commits=0,offers=0,parries=0;
 for(let guard=0;!state.result&&guard<300;guard++){
  const intent=api.predictedCombatIntent(state),movement=def.movements[state.movementIndex],moves=open();let id;
  if(policy==='blind-monitor')id=pick([A.TUNE,A.MONITOR,A.EXPOSE]);
  else if(policy==='proof'&&encounter==='chapel'&&movement.id==='source'&&!state.proofs.includes('return.source')&&state.take?.tag==='body')id=pick([A.PLAYBACK]);
  else if(moves.some(m=>m.id===A.TUNE))id=A.TUNE;
  else if(['cautious','proof'].includes(policy)&&state.composure<=state.maxComposure*.5&&moves.some(m=>m.id===A.COMPOSE))id=A.COMPOSE;
  else id=pick([counters[intent?.kind],A.PLAYBACK,A.EXPOSE,A.MONITOR,A.HOLD]);
  state=api.reduceCombat(state,{type:id,replaceTake:true});commits++;
  for(let g=0;state.phase==='enemy'&&!state.result&&g<4;g++){
   const primary=api.selectEnemyIntents(state)[0];state=api.advanceEnemy(state);offers++;
   for(const hit of state.last.enemyHits||[])enemyKinds[hit.kind]=(enemyKinds[hit.kind]||0)+1;
   const eligible=['broadcast','overload','loop'].includes(primary?.kind),tier=reaction==='perfect'?'perfect':reaction==='good'?'good':reaction==='mixed'?(offers%3===0?null:offers%3===1?'late':'good'):null;
   if(eligible&&tier){state=api.reduceCombat(state,{type:A.PARRY,tier});if(state.last.parried)parries++;}
  }
 }
 return{variant,encounter,kit,incoming,injuries,seed,preset,policy,reaction,result:state.result?.result||'unresolved',commits,turns:state.turns,end:state.composure,max:state.maxComposure,damageTaken:state.damageTaken,offers,enemyKinds,parries,proofs:state.proofs,grants:api.combatResult(state)?.finale?.grants||[],actions:state.actionLog.filter(e=>e.action!=='enemy').map(e=>e.action)};
}
const rows=[];
for(const variant of ['before','consume-only','production','all30-rejected'])for(const encounter of ['chapel','source'])for(const incoming of [20,40])for(const kit of ['starter','signal','invested'])for(const policy of ['blind-monitor','reading','cautious','proof'])for(const reaction of ['none','mixed','good','perfect'])for(const seed of [0,1,2,3,11,42,31337,2130706433])
 rows.push(play({variant,encounter,incoming,kit,policy,reaction,seed}));
const groups=new Map();for(const row of rows){const key=[row.variant,row.encounter,row.incoming,row.kit,row.policy,row.reaction].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
const mean=(g,k)=>Math.round(g.reduce((n,r)=>n+r[k],0)/g.length*100)/100;
const summary=[...groups.values()].map(g=>({...Object.fromEntries(['variant','encounter','incoming','kit','policy','reaction'].map(k=>[k,g[0][k]])),n:g.length,wins:g.filter(r=>r.result==='win').length,minEnd:Math.min(...g.map(r=>r.end)),meanEnd:mean(g,'end'),meanCommits:mean(g,'commits'),meanOffers:mean(g,'offers'),enemyKinds:[...new Set(g.flatMap(r=>Object.keys(r.enemyKinds)))],proofReceipts:g.filter(r=>r.grants.includes('route.surfaced')).length}));
fs.writeFileSync('artifacts/battle-experience-study/economy/fork-refinement-rows.json',JSON.stringify(rows,null,2)+'\n');fs.writeFileSync('artifacts/battle-experience-study/economy/fork-refinement-summary.json',JSON.stringify(summary,null,2)+'\n');
const accessibility=[];for(const encounter of ['chapel','source'])for(const preset of Object.keys(COMBAT_RULES))for(const injuries of [0,2,4])for(const policy of ['cautious','proof'])for(const reaction of ['none','mixed','good','perfect'])for(const seed of [0,1,2,3,11,42,31337,2130706433])
 accessibility.push(play({variant:'production',encounter,incoming:20,injuries,preset,policy,reaction,seed}));
fs.writeFileSync('artifacts/battle-experience-study/economy/fork-production-accessibility.json',JSON.stringify(accessibility,null,2)+'\n');
const get=(variant,encounter,policy,reaction='none',incoming=20,kit='signal')=>summary.find(r=>r.variant===variant&&r.encounter===encounter&&r.policy===policy&&r.reaction===reaction&&r.incoming===incoming&&r.kit===kit);
for(const encounter of ['chapel','source'])for(const policy of ['cautious','proof'])assert.equal(get('production',encounter,policy).wins,8);
assert.equal(get('production','chapel','proof').proofReceipts,8);
for(const encounter of ['chapel','source'])for(const reaction of ['good','perfect'])assert.equal(get('production',encounter,'reading',reaction,40).minEnd,40);
for(const r of accessibility.filter(r=>['guided','standard'].includes(r.preset)))assert.equal(r.result,'win',`${r.encounter}/${r.preset}/${r.injuries}/${r.policy}/${r.reaction}/${r.seed}`);
const provenance={generatedAt:new Date().toISOString(),productionChanges:['Fork-muted Broadcast consumes its committed beat; held read/free action/resonance/TEMPO retained.','Only late Chapel3–5 and Source movements use30 coherence.'],
 variants:{before:'Frozen pre-change reducer, Chapel20 and Source25.', 'consume-only':'Production card-consumption rule with old phase lengths; rejected as insufficient for Chapel blind loop.',production:'Actual new reducer and authored late phase lengths.', 'all30-rejected':'Counterfactual30 coherence in early Chapel as well; rejected because weak blind arrivals die before late decisions.'},
 baselineSha256:sha(source),productionSha256:sha(fs.readFileSync(path)),definitionSha256:sha(fs.readFileSync('src/data/combat-definitions.js')),
 unchangedParryTiming:sha(fs.readFileSync('src/game/combat-parry.js'))===prior.sourceHashes['src/game/combat-parry.js'],unchangedDifficulty:sha(fs.readFileSync('src/progression/difficulty-defs.js'))===prior.sourceHashes['src/progression/difficulty-defs.js'],
 rows:rows.length,accessibilityRows:accessibility.length,checks:{standard20SignalAllPoliciesWin:true,standardHealthyGoodPerfectNoHit:true,guidedAndStandard20InjuredRecoveryAndProofPass:true},
 limits:['Deterministic selected policies and seeds are not human success rates.','Perfect/GOOD/mixed reactions are assigned; scene timing, live projectiles, hand animation and native presentation are absent.','Automatic occupied-take replacement and immediate choices are simulated.','Weak starter Chapel without reactions already loses before these changes; mixed reaction remains6/8 in the standard cautious fixture.','The opponent may validly recommit a Broadcast after its prior commitment passes; the rule removes a pinned beat, not all repeated labels.']};
fs.writeFileSync('artifacts/battle-experience-study/economy/fork-production-provenance.json',JSON.stringify(provenance,null,2)+'\n');
const responseComparison=[];
for(const encounter of ['chapel','source'])for(const variant of ['before','production']){
  const matched=rows.filter(r=>r.encounter===encounter&&r.variant===variant&&r.kit==='signal'&&r.incoming===40&&r.policy==='reading'&&r.reaction==='none');
  responseComparison.push({encounter,variant,n:matched.length,meanCommands:mean(matched,'commits'),
    responseVerbs:[...new Set(matched.flatMap(r=>r.actions).filter(id=>id!==A.PARRY))],
    meanDistinctResponseVerbs:Math.round(matched.reduce((n,r)=>n+new Set(r.actions.filter(id=>id!==A.PARRY)).size,0)/matched.length*100)/100,
    note:'Free TUNE is included in command count, not actionLog response verbs. These are selected-policy simulations, not player learning or enjoyment results.'});
}
fs.writeFileSync('artifacts/battle-experience-study/economy/fork-production-responses.json',JSON.stringify(responseComparison,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,accessibilityRows:accessibility.length,checks:provenance.checks},null,2));
