import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {rehydrateBattle} from '../../src/narrative/runtime-content.js';
import {sourceCombatBattle} from '../../src/data/combat-definitions.js';
import {COMBAT_RULES} from '../../src/progression/difficulty-defs.js';
import {COMBAT_ACTION as A,TECHNIQUE,createCombatState,reduceCombat,advanceEnemy,currentCombatIntent,selectEnemyIntents,
  combatApparitionTargetIds,combatContinuationSnapshot,availableCombatActions} from '../../src/game/combat-state.js';
import {commitHallApparitionRound,hallApparitionSnapshot,applyHallApparitionAction} from '../../src/game/hall-apparitions.js';
import {makeCombatScene,ORDINARY_TURN_SECONDS} from '../../src/game/combat.js';
import {PARRY_REACTION_SECONDS,PARRY_IMPACT_SECONDS,PARRY_CONTACT_HOLD_SECONDS,parryOpportunitySnapshot,parryInputDecision,isParryableEnemyAction} from '../../src/game/combat-parry.js';
import {hallRelayFrame,breakArmedFormationOnCueDefeat,resetReactionForNewHallActor} from '../../artifacts/apparition-battle-study/turns/relay-model.mjs';
import {hallReactionStudyTransform} from '../../artifacts/apparition-battle-study/turns/reaction-transform.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
const round=value=>Math.round(value*1e6)/1e6;
const hallDocument=JSON.parse(await readFile(new URL('../../content/narrative/battle.hall.story.json',import.meta.url),'utf8'));
const canonicalHall=rehydrateBattle(hallDocument);
const profile=canonicalHall.combat;
export const hallStudyDefinition={...profile,
  movements:profile.movements.map(m=>({...m,before:[],after:[]}))};
const tools={torch:true,recorder:true,rig:true,fork:true};
function initial({preset='standard',composure=40,injuries=0,seed=42,movementIndex=0,mask=7}={}){
  const state=createCombatState(hallStudyDefinition,{difficulty:COMBAT_RULES[preset],tools,composure,injuries,seed,
    startingMovementIndex:movementIndex,battery:.67});
  const commitment=currentCombatIntent(state)?.id;
  state.apparitions.members.forEach((member,index)=>{if(!(mask&(1<<index)))member.health=0;});
  const movement=hallStudyDefinition.movements[movementIndex],variant=state.difficulty.variant;
  const intents=variant==='dead-air'&&movement.deadAirIntents?.length?movement.deadAirIntents:
    variant==='severe'&&movement.severeIntents?.length?movement.severeIntents:movement.intents;
  commitHallApparitionRound(state.apparitions,0,intents,{committedId:commitment});
  return state;
}
function simulateRound(input,action={type:A.WAIT},{parry=null}={}){
  let state=reduceCombat(input,action);const beats=[];
  for(let guard=0;state.phase==='enemy'&&!state.result&&guard<4;guard++){
    const before=state,primary=selectEnemyIntents(before)[0];state=advanceEnemy(state);
    const received=state.last.received,preReaction=clone(state);
    if(parry&&isParryableEnemyAction(primary))state=reduceCombat(state,{type:A.PARRY,tier:parry});
    beats.push({actorId:state.last.enemyActor?.id||preReaction.last.enemyActor?.id,intentId:primary?.id,kind:primary?.kind,
      duration:isParryableEnemyAction(primary)?PARRY_REACTION_SECONDS:ORDINARY_TURN_SECONDS,
      composureBefore:before.composure,received,composureBeforeReaction:preReaction.composure,composureAfterReaction:state.composure,
      provisionalResult:preReaction.result?.result||null,parryAccepted:!!state.last.parried,
      reducerNextActorId:preReaction.apparitions.activeActorId,formation:preReaction.apparitions.formation});
  }
  return{state,beats};
}
const press=(scene,key='Enter')=>{const e={key,code:key};scene.key(e);scene.keyup(e);};
function choose(scene,id){
  let view=scene.battleView();
  if(view.phase==='move')press(scene,'ArrowUp');
  view=scene.battleView();const tool=view.tools.findIndex(t=>t.moves.includes(id));
  assert.ok(tool>=0,`tool for ${id}`);
  for(let guard=0;scene.battleView().selectedTool!==tool&&guard<12;guard++)press(scene,'ArrowRight');
  press(scene,'ArrowDown');view=scene.battleView();const move=view.moves.findIndex(m=>m.id===id);
  for(let guard=0;scene.battleView().selectedMove!==move&&guard<12;guard++)press(scene,'ArrowRight');
  assert.equal(scene.battleView().moves[scene.battleView().selectedMove]?.id,id);press(scene);
}
function sceneView(view){
  return {phase:view.phase,result:view.state.result?.result||null,composure:view.state.composure,
    selectedTargetId:view.state.apparitions.members[view.state.apparitions.target]?.id,
    action:view.resolution?.action,side:view.resolution?.side,elapsed:view.resolution?.elapsed,duration:view.resolution?.duration,
    presentedActorId:view.state.last.enemyActor?.id||null,reducerActiveActorId:view.state.apparitions.activeActorId,
    reaction:view.resolution?.parry?{phase:view.resolution.parry.phase,armed:view.resolution.parry.armed,tier:view.resolution.parry.tier,
      openSeconds:view.resolution.parry.openSeconds,impactSeconds:view.resolution.parry.impactSeconds,widthSeconds:view.resolution.parry.widthSeconds,
      spent:view.resolution.parry.spent,parried:view.resolution.parry.parried}:null,
    notice:view.notice,checkpointHasRoster:!!view.checkpoint?.apparitions};
}
export async function traceActualScene({preset='standard',composure=40,parry=false,maxSeconds=10,seed=42,movementIndex=0,sceneFactory=makeCombatScene,treatment='current'}={}){
  const scene=sceneFactory({battle:{...canonicalHall,intro:[],win:[],lose:[],combat:hallStudyDefinition},
    difficulty:COMBAT_RULES[preset],seed,startingMovementIndex:movementIndex,skipOpening:true,loadout:{tools,composure,battery:.67}});
  let seconds=0;const frames=[],events=[];let priorKey='';const reacted=new Set();
  scene.enter();await Promise.resolve();
  try{
    for(let guard=0;!['tool','move'].includes(scene.battleView().phase)&&guard<240;guard++)scene.update(1/60);
    const open=scene.battleView();assert.equal(open.phase,'tool');choose(scene,A.WAIT);
    while(seconds<maxSeconds){
      const view=scene.battleView(),frame=sceneView(view),key=JSON.stringify([frame.phase,frame.side,frame.presentedActorId,frame.reaction?.phase,frame.reaction?.tier,frame.result]);
      const relay=hallRelayFrame(view);
      if(key!==priorKey){events.push({seconds:round(seconds),...frame,relay});priorKey=key;}
      if(view.resolution?.side==='enemy'&&view.resolution.parry?.armed&&view.resolution.parry.tier==='perfect'
        &&parry&&!reacted.has(frame.presentedActorId)){
        const before=sceneView(view);press(scene);const after=sceneView(scene.battleView());
        events.push({seconds:round(seconds),event:'ordinary-confirm-at-perfect',before,after});reacted.add(frame.presentedActorId);
      }
      frames.push({seconds:round(seconds),...frame});
      if(!['resolve'].includes(view.phase))break;
      scene.update(1/120);seconds+=1/120;
    }
    return{preset,requestedComposure:composure,seed,movementIndex,treatment,assignedReaction:parry?'press once per body in displayed PERFECT':'none',
      qualification:'Actual makeCombatScene, public keyboard input and 120Hz update clock; no browser paint, audio, GPU or human timing. Wall time and displayed time are not measured.',
      initial:sceneView(open),events,frames,final:sceneView(scene.battleView())};
  }finally{scene.exit();}
}

export async function loadStudyCorrectedModules(){
  // Task-local in-memory modules keep production files and the current module
  // cache untouched. Other dependencies remain the actual production imports.
  const absoluteImports=(code,path)=>code.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,
    (_,prefix,specifier,suffix)=>prefix+new URL(specifier,pathToFileURL(resolve(path))).href+suffix);
  const statePath='src/game/combat-state.js',scenePath='src/game/combat.js';
  const stateCode=absoluteImports(hallReactionStudyTransform(await readFile(statePath,'utf8')),statePath);
  const stateUrl='data:text/javascript;base64,'+Buffer.from(stateCode).toString('base64');
  const sceneCode=absoluteImports(await readFile(scenePath,'utf8'),scenePath)
    .replaceAll(pathToFileURL(resolve(statePath)).href,stateUrl);
  return {state:await import(stateUrl),scene:await import('data:text/javascript;base64,'+Buffer.from(sceneCode).toString('base64'))};
}
export async function loadStudyCorrectedScene(){return (await loadStudyCorrectedModules()).scene.makeCombatScene;}

export async function traceTimeoutScene({preset='standard'}={}){
  const scene=makeCombatScene({battle:{...canonicalHall,intro:[],win:[],lose:[],combat:hallStudyDefinition},
    difficulty:COMBAT_RULES[preset],seed:42,skipOpening:true,loadout:{tools,composure:40,battery:.67}});
  const snapshot=view=>({...sceneView(view),statePhase:view.state.phase,turns:view.state.turns,
    rosterRound:view.state.apparitions.round,rosterActorId:view.state.apparitions.activeActorId,
    actionLog:clone(view.state.actionLog),turnClock:view.turnClock});
  scene.enter();await Promise.resolve();
  try{
    for(let guard=0;scene.battleView().phase!=='tool'&&guard<240;guard++)scene.update(1/120);
    const initial=snapshot(scene.battleView());let ticks=0;
    while(scene.battleView().phase!=='resolve'&&ticks<1800){scene.update(1/120);ticks++;}
    const offered=snapshot(scene.battleView());
    for(let guard=0;scene.battleView().phase==='resolve'&&guard<600;guard++)scene.update(1/120);
    return {preset,seed:42,input:'No player actions; let actual decision clock expire',
      qualification:'Actual production makeCombatScene with canonical Hall definition and public owner updates. No renderer, audio, GPU, native or human timing claim.',
      simulatedSecondsToOffer:ticks/120,initial,offered,returned:snapshot(scene.battleView()),
      diagnosis:'forfeitTurn calls beginEnemyBeat while reducer phase is select; advanceEnemy is a no-op outside enemy phase. The reaction display has no committed body, so timeout clips cannot demonstrate group turns or the relay.'};
  }finally{scene.exit();}
}

export async function buildStudy(){
  const checks=[];const check=(label,run)=>{run();checks.push(label);};
  const windows=Object.entries(COMBAT_RULES).map(([preset,rules])=>{
    const op=parryOpportunitySnapshot({actionKind:'broadcast',windowScale:rules.parryWindowScale});
    return{preset,durationSeconds:PARRY_REACTION_SECONDS,opensAt:op.openSeconds,impactAt:op.impactSeconds,
      openWidthSeconds:op.widthSeconds,perfectOpensAt:op.openSeconds+op.widthSeconds*.75,
      simulationImpactFiresAt:op.impactSeconds+PARRY_CONTACT_HOLD_SECONDS,
      openQualification:'Simulation window from current shared parry snapshot, not measured after presentation.'};
  });
  check('all preset reaction widths and contact time derive from production snapshot',()=>{
    for(const w of windows){close(w.durationSeconds,4*60/168);assert.ok(w.openWidthSeconds>0&&w.openWidthSeconds<=w.impactAt);}
    assert.ok(windows[0].openWidthSeconds>windows[1].openWidthSeconds&&windows[1].openWidthSeconds>windows[2].openWidthSeconds);
  });
  const rows=[];
  for(const preset of Object.keys(COMBAT_RULES))for(const composure of [40,20,1])for(const mask of [7,6,5,3,4,2,1])
    for(const seed of [0,42])for(const movementIndex of [0,1,2]){
      const before=initial({preset,composure,mask,seed,movementIndex,injuries:composure===20?2:0});
      const first=before.apparitions.members.find(m=>m.health>0),displayed=currentCombatIntent(before)?.id;
      const {state,beats}=simulateRound(before);
      assert.equal(beats[0]?.actorId,first.id);assert.equal(beats[0]?.intentId,displayed);
      const indices=beats.map(b=>before.apparitions.members.findIndex(m=>m.id===b.actorId));
      assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
      for(const b of beats)assert.ok(before.apparitions.members.find(m=>m.id===b.actorId).health>0);
      rows.push({preset,requestedComposure:composure,startingComposure:before.composure,injuries:before.injuries,mask,seed,movementIndex,
        living:before.apparitions.members.filter(m=>m.health>0).map(m=>m.id),selectedTargetId:before.apparitions.members[before.apparitions.target].id,
        committedIntentId:displayed,beats,phraseSeconds:round(beats.reduce((sum,b)=>sum+b.duration,0)),
        outcome:state.result?.result||'continuing',finalComposure:state.composure});
    }
  checks.push(`${rows.length} reducer fixtures preserve first commitment, fixed actor order and dead-slot skips`);
  const targetCases=[];
  for(const mask of [7,6,5,3,4,2,1]){
    let before=initial({mask}),state=before;
    for(const member of before.apparitions.members.filter(m=>m.health>0)){
      state=reduceCombat(state,{type:A.TARGET,targetId:member.id});
      check(`target selection ${mask}/${member.id} is free and does not rewrite initiative`,()=>{
        assert.equal(state.turns,before.turns);assert.equal(state.composure,before.composure);assert.equal(state.phase,'select');
        assert.equal(state.apparitions.members[state.apparitions.target].id,member.id);
        assert.deepEqual(state.apparitions.members.map(m=>m.intentId),before.apparitions.members.map(m=>m.intentId));
      });
      targetCases.push({mask,targetId:member.id,actorId:state.apparitions.activeActorId,scope2:combatApparitionTargetIds(state,A.WHITEOUT)});
    }
  }
  check('every pair can be selected with the baseline two-target WHITEOUT',()=>{
    const pairs=new Set(targetCases.filter(c=>c.mask===7).map(c=>[...c.scope2].sort().join('+')));assert.equal(pairs.size,3);
  });
  check('three-target OVEREXPOSE includes all three bodies',()=>{
    const state=initial();state.techniques=[TECHNIQUE.OVEREXPOSE];assert.equal(combatApparitionTargetIds(state,A.WHITEOUT).length,3);
  });
  check('killing the next actor skips it without renumbering seats',()=>{
    let state=initial();state.apparitions.members[0].health=1;
    state=reduceCombat(state,{type:A.EXPOSE});assert.equal(state.apparitions.members[0].health,0);
    const beat=selectEnemyIntents(state)[0];assert.equal(beat.actorId,'apparition-stalls');
  });
  const cueBase=simulateRound(initial()).state;
  const cueBefore=clone(cueBase);cueBefore.apparitions.members[2].health=1;
  let cueAfter=reduceCombat(cueBefore,{type:A.TARGET,targetId:'apparition-box'});cueAfter=reduceCombat(cueAfter,{type:A.EXPOSE});
  const cueAfterKill=clone(cueAfter),afterRound=simulateRound(cueAfter,{type:'invalid-noop'}).state;
  check('CUE defeat prevents future rearming but does not cancel the already committed bonus',()=>{
    assert.equal(cueBase.apparitions.formation,1);assert.equal(cueAfter.apparitions.members[2].health,0);
    assert.equal(cueAfter.apparitions.formation,1);assert.equal(afterRound.apparitions.formation,0);
  });
  const cue={qualification:'Declared one-health CUE fixture isolates the consequence; not an earned combat arrival.',
    before:{composure:cueBefore.composure,formation:cueBefore.apparitions.formation,cued:cueBefore.apparitions.cued},
    afterKill:{composure:cueAfterKill.composure,formation:cueAfterKill.apparitions.formation,cueHealth:cueAfterKill.apparitions.members[2].health},
    afterFollowingRound:{formation:afterRound.apparitions.formation,cued:afterRound.apparitions.cued},
    interpretation:'Shooting the CUE stops subsequent coordination, not the phrase already prepared. Communicate this explicitly or deliberately change the rule.'};
  const coordination=[];
  for(const preset of Object.keys(COMBAT_RULES)){
    const first=initial({preset});
    const armed=simulateRound(first).state;
    if(armed.result)throw Error(`coordination fixture ended before the CUE: ${preset}`);
    // One health and no guard isolates causal ordering; neither claims an earned kill.
    armed.apparitions.members[2].health=1;armed.apparitions.members[2].guard=null;
    let killed=reduceCombat(armed,{type:A.TARGET,targetId:'apparition-box'});killed=reduceCombat(killed,{type:A.EXPOSE});
    const proposed=breakArmedFormationOnCueDefeat(armed,killed);
    const oldRound=simulateRound(killed,{type:'invalid-noop'}),newRound=simulateRound(proposed,{type:'invalid-noop'});
    const beforeCommit=initial({preset});beforeCommit.apparitions.members[2].health=1;
    let early=reduceCombat(beforeCommit,{type:A.TARGET,targetId:'apparition-box'});early=reduceCombat(early,{type:A.EXPOSE});
    const earlyProposed=breakArmedFormationOnCueDefeat(beforeCommit,early);
    const intact=breakArmedFormationOnCueDefeat(armed,armed);
    check(`CUE intervention ordering ${preset}: early kill unchanged, intact cue unchanged, armed kill only breaks proposed formation`,()=>{
      assert.deepEqual(earlyProposed,early);assert.deepEqual(intact,armed);
      assert.equal(killed.apparitions.formation,1);assert.equal(proposed.apparitions.formation,0);
      assert.equal(killed.apparitions.members[2].health,0);
      assert.equal(killed.battery,proposed.battery);assert.equal(killed.charge,proposed.charge);assert.equal(killed.composure,proposed.composure);
      assert.deepEqual(killed.apparitions.members,proposed.apparitions.members);
    });
    coordination.push({preset,fixture:'One-health unguarded CUE, seed42, killed on player answer after first round; no earned route claim',
      current:{formation:killed.apparitions.formation,beats:oldRound.beats,received:oldRound.beats.reduce((s,b)=>s+b.received,0),composure:oldRound.state.composure,result:oldRound.state.result?.result||null},
      proposed:{formation:proposed.apparitions.formation,beats:newRound.beats,received:newRound.beats.reduce((s,b)=>s+b.received,0),composure:newRound.state.composure,result:newRound.state.result?.result||null},
      proposedRuleChange:'Defeating CUE during its answer window clears an already armed formation. Attack kinds, player action costs, reaction timing and initiative are unchanged; incoming damage deliberately changes.'});
  }
  const scenes=[];
  for(const preset of Object.keys(COMBAT_RULES))for(const composure of [40,20,1])for(const parry of [false,true])
    scenes.push(await traceActualScene({preset,composure,parry}));
  const lethal=scenes.filter(s=>s.requestedComposure===1&&s.assignedReaction.startsWith('press')&&
    s.events.some(e=>e.event==='ordinary-confirm-at-perfect'&&e.before.result==='lose'));
  check('actual scene reproduces a displayed PERFECT opportunity whose ordinary confirm cannot reverse lethal Hall damage',()=>{
    assert.ok(lethal.length>=2);
    for(const trace of lethal){const event=trace.events.find(e=>e.event==='ordinary-confirm-at-perfect'&&e.before.result==='lose');assert.ok(event);
      assert.equal(event.before.result,'lose');assert.equal(event.before.reaction.armed,true);assert.equal(event.before.reaction.tier,'perfect');
      assert.equal(event.after.result,'lose');assert.equal(event.after.reaction.parried,false);}
  });
  check('nonlethal actual scene accepts the same ordinary confirm in PERFECT',()=>{
    const trace=scenes.find(s=>s.preset==='standard'&&s.requestedComposure===40&&s.assignedReaction.startsWith('press'));
    assert.ok(trace.events.some(e=>e.event==='ordinary-confirm-at-perfect'&&e.after.reaction?.parried));
  });
  const cosmeticParry=scenes.find(s=>s.preset==='standard'&&s.requestedComposure===40&&s.assignedReaction.startsWith('press'))
    .events.filter(e=>e.event==='ordinary-confirm-at-perfect');
  check('actual scene reproduces the second actor reporting TURNED without restoring its damage',()=>{
    assert.equal(cosmeticParry.length,2);
    assert.ok(cosmeticParry[0].after.composure>cosmeticParry[0].before.composure);
    assert.equal(cosmeticParry[1].after.composure,cosmeticParry[1].before.composure);
    assert.equal(cosmeticParry[1].after.reaction.parried,true);
  });
  let reactionRound=reduceCombat(initial(),{type:A.WAIT});
  const firstOffered=advanceEnemy(reactionRound);
  const firstTurned=reduceCombat(firstOffered,{type:A.PARRY,tier:'perfect'});
  const secondOffered=advanceEnemy(firstTurned);
  const duplicateIgnored=reduceCombat(secondOffered,{type:A.PARRY,tier:'perfect'});
  const repairedSecond=resetReactionForNewHallActor(firstTurned,secondOffered);
  const secondTurned=reduceCombat(repairedSecond,{type:A.PARRY,tier:'perfect'});
  check('actor-boundary reset permits the next real parry and still rejects a duplicate on that same body',()=>{
    assert.equal(duplicateIgnored.composure,secondOffered.composure);
    assert.ok(secondTurned.composure>secondOffered.composure);
    assert.deepEqual(reduceCombat(secondTurned,{type:A.PARRY,tier:'perfect'}),secondTurned);
    assert.equal(firstTurned.apparitions.activeActorId,secondOffered.last.enemyActor.id);
  });
  const reactionLatch={qualification:'Actual reducer calls and actual scene public-input control. Proposed reset is a separate study-only actor-boundary correction; it is not installed in production.',
    actualScenePresses:cosmeticParry,
    reducer:{firstOffered:firstOffered.composure,firstTurned:firstTurned.composure,secondOffered:secondOffered.composure,
      currentSecondPress:duplicateIgnored.composure,proposedSecondPress:secondTurned.composure,
      secondDamage:secondOffered.last.received,sourceOfFailure:'last.parried survives Object.assign at actor advance; PARRY duplicate guard returns early.'}};
  const correctedModules=await loadStudyCorrectedModules(),correctedFactory=correctedModules.scene.makeCombatScene,correctedScenes=[];
  for(const preset of ['standard','severe'])for(const composure of [40,20,1])
    correctedScenes.push(await traceActualScene({preset,composure,parry:true,sceneFactory:correctedFactory,treatment:'study-only-reaction-correction'}));
  check('study-only corrected actual scene restores each body and can rescue its currently presented lethal blow',()=>{
    for(const trace of correctedScenes){
      const presses=trace.events.filter(e=>e.event==='ordinary-confirm-at-perfect');assert.ok(presses.length>=1);
      if(trace.requestedComposure>1)assert.equal(presses.length,2);
      for(const event of presses){assert.equal(event.after.result,null);assert.equal(event.after.reaction.parried,true);
        assert.ok(event.after.composure>event.before.composure);}
      if(trace.requestedComposure===1)assert.equal(presses[0].after.composure,1,'overkill is not over-healed');
    }
  });
  check('correction is scoped to the exact production sites and source input remains unchanged',()=>{
    assert.throws(()=>hallReactionStudyTransform('not production source'),/anchor changed/);
    const same=resetReactionForNewHallActor(secondTurned,secondTurned);assert.deepEqual(same,secondTurned);
  });
  let correctedActorCases=0;
  check('corrected reducer rescues exactly the current struck pool across all living-slot masks and movement starts',()=>{
    for(const preset of ['standard','severe','dead-air'])for(const mask of [7,6,5,3,4,2,1])for(const movementIndex of [0,1,2]){
      let state=correctedModules.state.reduceCombat(initial({preset,mask,movementIndex,composure:1}),{type:A.WAIT});
      const seen=new Set();
      for(let guard=0;state.phase==='enemy'&&!state.result&&guard<4;guard++){
        const intent=selectEnemyIntents(state)[0],actorId=intent.actorId;assert.ok(!seen.has(actorId));seen.add(actorId);
        state=correctedModules.state.advanceEnemy(state);
        if(isParryableEnemyAction(intent)){
          state=correctedModules.state.reduceCombat(state,{type:A.PARRY,tier:'perfect'});
          assert.equal(state.result,null);assert.equal(state.composure,1);assert.equal(state.last.parried,true);
          assert.deepEqual(correctedModules.state.reduceCombat(state,{type:A.PARRY,tier:'perfect'}),state);
          correctedActorCases++;
        }
      }
    }
    assert.ok(correctedActorCases>50);
  });
  let unaffectedSoloCases=0;
  const soloDefinitions=[];
  for(const name of ['natatorium','chapel'])soloDefinitions.push(rehydrateBattle(JSON.parse(
    await readFile(new URL(`../../content/narrative/battle.${name}.story.json`,import.meta.url),'utf8'))).combat);
  soloDefinitions.push(sourceCombatBattle().combat);
  check('Hall study correction preserves sampled existing solo and Source reaction states exactly',()=>{
    for(const definition of soloDefinitions)for(const composure of [40,1])for(const seed of [0,42])for(const action of [A.WAIT,A.HOLD,A.MONITOR,A.EXPOSE]){
      const base=createCombatState(definition,{difficulty:COMBAT_RULES.standard,tools,composure,seed,battery:.67});
      let original=reduceCombat(base,{type:action,replaceTake:true}),corrected=correctedModules.state.reduceCombat(base,{type:action,replaceTake:true});
      assert.deepEqual(corrected,original);original=advanceEnemy(original);corrected=correctedModules.state.advanceEnemy(corrected);
      assert.deepEqual(corrected,original);
      for(const tier of ['late','good','perfect']){
        assert.deepEqual(correctedModules.state.reduceCombat(corrected,{type:A.PARRY,tier}),reduceCombat(original,{type:A.PARRY,tier}));
        unaffectedSoloCases++;
      }
    }
  });
  check('relay changes anticipation only and never mutates the source view',()=>{
    const sample=scenes.find(s=>s.preset==='standard'&&s.requestedComposure===40&&!s.assignedReaction.startsWith('press'));
    assert.ok(sample.events.some(e=>e.relay?.currentActorId!==e.reducerActiveActorId),'presentation and reducer ownership diverge by design');
    const state=initial();state.last.enemyActor={id:'apparition-row-f'};
    const view={phase:'resolve',state,resolution:{side:'enemy',elapsed:1.05,duration:PARRY_REACTION_SECONDS,parry:parryOpportunitySnapshot({actionKind:'broadcast',elapsed:1.05})}};
    const frozen=JSON.stringify(view),baseline=hallRelayFrame(view,{enabled:false}),relay=hallRelayFrame(view);
    assert.equal(JSON.stringify(view),frozen);assert.equal(baseline.prepareActorId,null);assert.equal(relay.prepareActorId,'apparition-stalls');
    close(baseline.fullBeatDuration,relay.fullBeatDuration);assert.equal(relay.reactiveInputOwnerId,null);
  });
  check('early, late and duplicate inputs retain production parry decisions',()=>{
    const base={actionKind:'broadcast',windowScale:1};
    assert.equal(parryInputDecision(parryOpportunitySnapshot({...base,elapsed:0})),'wait');
    assert.equal(parryInputDecision(parryOpportunitySnapshot({...base,elapsed:.8})),'parry');
    assert.equal(parryInputDecision(parryOpportunitySnapshot({...base,elapsed:.8}),{repeat:true}),'ignore');
    assert.equal(parryInputDecision(parryOpportunitySnapshot({...base,elapsed:.95})),'miss');
  });
  const snapshots=initial();
  check('generic continuation cannot be claimed as Hall mid-phrase recovery',()=>{
    const saved=combatContinuationSnapshot(snapshots);assert.equal(saved.apparitions,undefined);assert.equal(saved.sourceCombat,undefined);
  });
  const timeoutScenes=[];
  for(const preset of Object.keys(COMBAT_RULES))timeoutScenes.push(await traceTimeoutScene({preset}));
  check('actual decision timeout offers an enemy reaction without committing a body or resolving its attack',()=>{
    for(const trace of timeoutScenes){
      assert.equal(trace.initial.turnClock.limit,7);assert.equal(trace.offered.phase,'resolve');
      assert.equal(trace.offered.side,'enemy');assert.equal(trace.offered.statePhase,'select');
      assert.equal(trace.offered.presentedActorId,null);assert.equal(trace.offered.rosterActorId,'player');
      assert.equal(trace.offered.turns,0);assert.equal(trace.offered.rosterRound,0);assert.deepEqual(trace.offered.actionLog,[]);
      assert.ok(trace.returned.actionLog.every(entry=>entry.action==='fireball-impact'));
      const ranged=trace.returned.actionLog.reduce((sum,entry)=>sum+(entry.received||0),0);
      assert.equal(trace.returned.composure,trace.initial.composure-ranged);assert.equal(trace.returned.turns,0);
    }
  });
  const nominal=scenes.find(s=>s.preset==='standard'&&s.requestedComposure===40&&!s.assignedReaction.startsWith('press'));
  const control=scenes.find(s=>s.preset==='standard'&&s.requestedComposure===40&&s.assignedReaction.startsWith('press'));
  const summaries=scenes.map(({frames,events,...s})=>({...s,events:events.filter(e=>e.event||e.side==='enemy'||e.phase!=='resolve'),sampledFrames:frames.length}));
  const fingerprints=[];
  for(const path of ['src/game/hall-apparitions.js','src/game/combat-state.js','src/game/combat.js','src/game/combat-parry.js','src/progression/difficulty-defs.js']){
    const bytes=await readFile(path);fingerprints.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return {
    kind:'apparition-group-turn-study',generatedAt:new Date().toISOString(),
    qualification:'Production reducer and actual scene-clock evidence only. No rendered native/browser response timing, earned route, human fear or player success claims.',
    fixtures:{reducer:rows.length,actualScene:scenes.length,timeoutScenes:timeoutScenes.length,correctedActorCases,unaffectedSoloCases,seeds:[0,42],incoming:[40,20,1],masks:[7,6,5,3,4,2,1],movements:[0,1,2]},
    checks:{passed:checks.length,failed:0,labels:checks},windows,
    recommendation:{name:'Anticipatory relay',summary:'Keep full serial contact/reaction ownership; make each next body visibly prepare only during the previous recovery. Keep target identity independent from actor identity. Expose CUE commitment and aftermath without disclosing hidden intent kinds.',
      ruleChanges:[],timingChanges:[],damageChanges:[],resourcesChanges:[],
      measuredBenefit:'None yet: timing and economy are intentionally identical. Expected recognition/attention benefit requires rendered comparison and fresh-player testing.',
      productionBlocker:'Resolve lethal pre-computation, per-body reaction-latch ownership and decision-timeout commitment before claiming Hall reactions are fair. A displayed PERFECT press cannot rescue an already-lost Hall state; a second body can report TURNED while restoring no damage; a decision timeout shows an enemy phrase without committing a body. The study-only reaction correction addresses the first two, not the timeout.',
      cueDecision:'Current stop-future-coordination is compared separately against cancel-current-coordination on CUE defeat. The latter is an explicit damage-affecting rule change, not part of the presentation-only relay.'},
    pending:['Rendered group turns and relay after deliberately committed actions; existing timeout clips do not prove these','Rendered and native input opportunity after cues actually present','Human actor attribution, target choice, recognition and fear','Hall owner pause/focus routing through main','Any new Hall mid-fight durable resume contract','Independent combat-design review'],
    cue,coordination,reactionLatch,targetCases,reducerRows:rows,sceneSummaries:summaries,
    nominalTrace:nominal,reactionControl:control,lethalTraces:lethal,correctedScenes,timeoutScenes,
    sources:fingerprints,
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const out=resolve('artifacts/apparition-battle-study/turns');await mkdir(out,{recursive:true});
  const study=await buildStudy();await writeFile(resolve(out,'study.json'),JSON.stringify(study,null,2)+'\n');
  await writeFile(resolve(out,'checks.json'),JSON.stringify({kind:study.kind,checks:study.checks,fixtures:study.fixtures,pending:study.pending},null,2)+'\n');
  await writeFile(resolve(out,'timeout-scene-receipt.json'),JSON.stringify({kind:'hall-decision-timeout-reproduction',
    source:study.sources.find(row=>row.path==='src/game/combat.js'),scenes:study.timeoutScenes,
    productionChanged:false,studyCorrectionAddressesTimeout:false},null,2)+'\n');
  const summary={kind:study.kind,checks:study.checks,fixtures:{...study.fixtures,correctedScenes:study.correctedScenes.length},windows:study.windows,
    coordination:study.coordination.map(r=>({preset:r.preset,current:r.current.received,proposed:r.proposed.received,
      currentComposure:r.current.composure,proposedComposure:r.proposed.composure,currentResult:r.current.result,proposedResult:r.proposed.result})),
    nominalBySurvivors:study.reducerRows.filter(r=>r.preset==='standard'&&r.requestedComposure===40&&r.seed===42&&r.movementIndex===0)
      .map(r=>({mask:r.mask,living:r.living.length,kinds:r.beats.map(b=>b.kind),nominalPhraseSeconds:r.phraseSeconds,incoming:r.beats.reduce((s,b)=>s+b.received,0)})),
    actualSceneClock:{baselineFinal:study.nominalTrace.final,reactionCurrentFinal:study.reactionControl.final,
      corrected:study.correctedScenes.map(t=>({preset:t.preset,incoming:t.requestedComposure,final:t.final,
        presses:t.events.filter(e=>e.event).map(e=>({actor:e.before.presentedActorId,before:e.before.composure,after:e.after.composure,result:e.after.result}))}))},
    findings:[{id:'per-body-reaction-latch',severity:'mechanical blocker',evidence:'Current second PERFECT reports TURNED without restoring damage; transformed scene restores it'},
      {id:'lethal-premature-result',severity:'mechanical blocker',evidence:'Current Standard/Severe1composure PERFECT is refused; corrected scene restores1 with no over-heal'},
      {id:'decision-timeout-commitment',severity:'mechanical blocker',evidence:'Current decision timeout displays a reaction without actor commitment, turn advance or body attack damage; existing timeout clips are not group-turn/relay proof'},
      {id:'cue-answer-contract',severity:'explicit design decision',evidence:'Removing CUE preserves an already armed formation; cancel-this-phrase model changes incoming damage'},
      {id:'turn-presentation',severity:'perceptual hypothesis',evidence:'Relay preserves serial durations and ledger; fresh viewers must validate who/next/target attribution'}],
    recommendation:study.recommendation,pending:study.pending};
  await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({out,checks:study.checks.passed,fixtures:study.fixtures,lethalPerfectReproductions:study.lethalTraces.length}));
}
