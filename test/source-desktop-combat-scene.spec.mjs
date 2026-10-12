import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCombatScene } from '../src/game/combat.js';
import * as scenes from '../src/game/scenes.js';
import { COMBAT_ACTION, applyFireballImpact, combatContinuationSnapshot, createCombatState, reduceCombat } from '../src/game/combat-state.js';

const noop = () => {};
const flush = async () => { for(let index=0;index<12;index+=1) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise((done)=>{resolve=done;}); return {promise,resolve}; };
const battleFixture = () => ({
  id:'source-final', enemy:'REFERENCE', intro:[], win:[], lose:[],
  combat:{
    id:'source-final',kind:'source',enemy:'REFERENCE',baseComposure:40,sendBackOnBreak:true,pinnedCycle:true,
    movements:['call-site','borrowed-body','final-clause'].map((id)=>({id,title:id,coherence:100,before:[],after:[],intents:[
      {id:`${id}:broadcast`,label:'REFERENCE',kind:'broadcast',damage:100,recordable:true,playbackDamage:10},
      {id:`${id}:overload`,label:'LOAD',kind:'overload',damage:100},
    ]})),
  },
});

async function harness({continuation=null,composure=1,battle=battleFixture(),endTask=null,stacked=false}={}) {
  const begins=[],frames=[],ends=[],checkpoints=[],outcomes=[],interferenceCalls=[];
  // The real music session samples its audio clock; combat calls update()
  // without dt. This deterministic clock counts those samples.
  const music={clock:0,updates:0,start:()=>({phase:'battle'}),update(){this.clock+=1;this.updates+=1;return {phase:'battle'};},snapshot(){return {clock:this.clock,updates:this.updates};},abort:noop,finish:noop};
  const desktop={
    begin(frame){const task=deferred();begins.push({frame:structuredClone(frame),...task});return task.promise;},
    frame(frame){frames.push(structuredClone(frame));},
    end(result){ends.push(result);return endTask?.promise;},mode:()=> 'simulated',debug:()=>({mode:'simulated'}),
  };
  const scene=makeCombatScene({
    battle,continuation,sourceDesktop:desktop,musicSession:music,difficulty:'standard',
    loadout:{composure,tools:{torch:true,recorder:true}},getAudio:()=>null,
    fx:{stopCues:noop,flash:noop,cue:noop,glitch:noop,shake:noop},
    audio:{stopTyping:noop,menuMove:noop,menuConfirm:noop},resources:{playImpact:noop,playTool:noop},
    interference:{enter:noop,movement:noop,beginFireballCast:()=>null,finish:(result)=>interferenceCalls.push(['finish',result]),phaseBreak:noop,
      impact:(event)=>interferenceCalls.push(['impact',event]),result:()=>interferenceCalls.push(['result'])},
    onCheckpoint:(event)=>checkpoints.push(structuredClone(event)),
    onWin:(result)=>outcomes.push(['win',result]),onLose:(result)=>outcomes.push(['lose',result]),onAbort:()=>outcomes.push(['abort']),
  });
  if(stacked)scenes.push(scene);else scene.enter();await flush();
  return {scene,battle,music,begins,frames,ends,checkpoints,outcomes,interferenceCalls};
}

function press(scene,key) {scene.key({key});scene.keyup({key});}
function choose(scene,id) {
  let view=scene.battleView();
  assert.equal(view.phase,'tool');
  const tool=view.tools.findIndex((entry)=>entry.moves.includes(id));
  assert.ok(tool>=0,`missing tool for ${id}`);
  while(scene.battleView().selectedTool!==tool) press(scene,'ArrowRight');
  press(scene,'ArrowDown');
  view=scene.battleView();
  const move=view.moves.findIndex((entry)=>entry.id===id);
  assert.ok(move>=0,`missing ${id}`);
  while(scene.battleView().selectedMove!==move) press(scene,'ArrowRight');
  press(scene,'Enter');
}
function until(scene,predicate,{step=.05,limit=200}={}) {
  for(let index=0;index<limit&&!predicate(scene.battleView());index+=1) scene.update(step);
  assert.ok(predicate(scene.battleView()),`did not reach target; current phase ${scene.battleView().phase}`);
}
async function finishPeel(h) {
  h.begins.at(-1).resolve();await flush();
  until(h.scene,(view)=>view.phase!=='desktop-breach');
}

test('timed perfect parry of an otherwise lethal first blow never opens the desktop or spends shelter',async()=>{
  const h=await harness({composure:1});
  try {
    choose(h.scene,COMBAT_ACTION.WAIT);
    until(h.scene,(view)=>view.phase==='resolve'&&view.resolution.side==='enemy'&&view.resolution.parry?.tier==='perfect');
    const provisional=h.scene.battleView();
    assert.ok(provisional.state.last.desktopBreach,'fixture must hold a lethal, still-parryable ordinary hit');
    const pending=h.checkpoints.at(-1).continuation;
    assert.equal(pending.composure,1,'checkpoint saved the provisional half-composure recovery');
    assert.equal(pending.sourceDesktop.breached,false,'checkpoint spent shelter before reaction contact');
    assert.equal(pending.sourceCombat.phase,'enemy');
    assert.ok(pending.sourceCombat.pendingEnemy,'reload must retain the actual pending blow and its reaction');
    assert.equal(pending.actionLog.filter((entry)=>entry.action==='enemy').length,0);
    press(h.scene,' ');
    const parried=h.scene.battleView();
    assert.equal(parried.state.last.parried,true);
    assert.equal(parried.state.composure,1);
    assert.equal(parried.state.result,null);
    assert.equal(parried.state.last.desktopBreach,null);
    assert.deepEqual(parried.state.sentBack,[]);
    assert.equal(parried.state.sourceDesktop.breached,false);
    until(h.scene,(view)=>view.phase==='tool');
    assert.equal(h.begins.length,0);
    assert.equal(h.outcomes.length,0);
  } finally {h.scene.exit();await flush();}
});

test('timed perfect parry after an existing breach cancels the lethal ordinary hit without returning the spent recovery',async()=>{
  let saved=createCombatState(battleFixture().combat,{difficulty:'standard',seed:73});
  saved=applyFireballImpact(saved,{damage:999,castId:'earlier-projectile'});
  saved.composure=1;
  const h=await harness({continuation:combatContinuationSnapshot(saved)});
  try {
    await finishPeel(h);
    choose(h.scene,COMBAT_ACTION.WAIT);
    until(h.scene,(view)=>view.phase==='resolve'&&view.resolution.side==='enemy'&&view.resolution.parry?.tier==='perfect');
    press(h.scene,' ');
    const parried=h.scene.battleView();
    assert.equal(parried.state.last.parried,true);
    assert.equal(parried.state.composure,1);
    assert.equal(parried.state.result,null);
    assert.deepEqual(parried.state.sentBack,['call-site']);
    assert.equal(parried.state.sourceDesktop.tier,1);
    until(h.scene,(view)=>view.phase==='tool');
    assert.equal(h.begins.length,1,'parry opened a second breach presentation');
    assert.equal(h.outcomes.length,0);
  } finally {h.scene.exit();await flush();}
});

test('first break freezes authored clocks through native readiness and a 2.4 second dissolve, then keeps dealt damage',async()=>{
  const h=await harness();
  try {
    assert.equal(h.scene.battleView().phase,'tool');
    choose(h.scene,COMBAT_ACTION.EXPOSE);
    until(h.scene,(view)=>view.phase==='desktop-breach');
    const held=h.scene.battleView();
    assert.equal(h.begins.length,1);
    assert.equal(held.sourceDesktop.waiting,true);
    assert.equal(held.sourceDesktop.transition,0);
    assert.ok(held.state.movementCoherence<100);
    assert.equal(held.state.movementIndex,0);
    assert.equal(held.state.sentBack.length,1);
    assert.equal(held.state.actionLog.filter((entry)=>entry.action==='enemy').length,1);
    assert.equal(held.turnClock,null);
    assert.equal(held.interlude,false);
    const clock=h.music.clock, updates=h.music.updates;
    for(let index=0;index<3;index+=1) {h.scene.update(90);press(h.scene,'Enter');}
    const waiting=h.scene.battleView();
    assert.equal(waiting.sourceDesktop.clock,held.sourceDesktop.clock);
    assert.equal(waiting.introElapsed,held.introElapsed);
    assert.deepEqual(waiting.state,held.state);
    assert.deepEqual(waiting.fireball,held.fireball);
    assert.deepEqual(waiting.submersion,held.submersion);
    assert.equal(h.music.clock,clock);
    assert.equal(h.music.updates,updates);
    assert.equal(h.scene.key({key:'Escape'}),false,'run pause must remain available');
    h.begins[0].resolve();await flush();
    for(let index=0;index<29;index+=1) h.scene.update(.08);
    h.scene.update(.079);
    assert.equal(h.scene.battleView().phase,'desktop-breach','dissolve completed before 2.4 seconds');
    assert.equal(h.music.clock,clock);
    h.scene.update(.01);
    const resumed=h.scene.battleView();
    assert.equal(resumed.phase,'tool');
    assert.equal(resumed.sourceDesktop.phase,'desktop');
    assert.equal(resumed.state.movementCoherence,held.state.movementCoherence);
    assert.equal(resumed.state.cycleIndex,held.state.cycleIndex);
    assert.equal(resumed.state.actionLog.filter((entry)=>entry.action==='enemy').length,1);
    assert.equal(h.begins.length,1);
    assert.ok(resumed.turnClock.left>0);
    assert.ok(h.checkpoints.some((entry)=>entry.continuation.sourceDesktop.breached));
    h.scene.update(.1);
    h.scene.update(.1); // consume the struck blow's retained hitstop, then tick
    assert.ok(h.music.clock>clock);
  } finally {h.scene.exit();await flush();}
});

test('reload of breached partial movement opens desktop directly and resolves a saved pending enemy once',async()=>{
  const battle=battleFixture();
  let state=createCombatState(battle.combat,{difficulty:'standard',composure:40,seed:13});
  state=reduceCombat(state,{type:COMBAT_ACTION.EXPOSE});
  assert.equal(state.phase,'enemy');
  state=applyFireballImpact(state,{damage:999,castId:'outside-hit'});
  const saved=combatContinuationSnapshot(state);
  const h=await harness({continuation:JSON.parse(JSON.stringify(saved))});
  try {
    const restoring=h.scene.battleView();
    assert.equal(restoring.phase,'desktop-breach');
    assert.equal(restoring.sourceDesktop.transition,1,'reload replayed the initial peel');
    assert.equal(restoring.state.movementCoherence,state.movementCoherence);
    assert.equal(restoring.state.cycleIndex,state.cycleIndex);
    assert.ok(restoring.state.pendingEnemy);
    h.scene.update(100);
    assert.equal(h.scene.battleView().state.actionLog.filter((entry)=>entry.action==='enemy').length,0);
    h.begins[0].resolve();await flush();
    h.scene.update(.001);
    const resumed=h.scene.battleView();
    assert.equal(resumed.phase,'resolve');
    assert.equal(resumed.resolution.side,'enemy');
    assert.equal(resumed.state.actionLog.filter((entry)=>entry.action==='enemy').length,1);
    assert.equal(resumed.state.movementCoherence,state.movementCoherence);
    // This deliberately overwhelming saved blow is the second break in the
    // same movement. Readiness may never grant a third composure pool.
    assert.equal(resumed.state.result.result,'lose');
    until(h.scene,(view)=>view.phase==='result-choreography'||view.state.result?.result==='lose');
    for(let index=0;index<60;index+=1) h.scene.update(.05);
    await flush();
    assert.equal(h.scene.battleView().state.actionLog.filter((entry)=>entry.action==='enemy').length,1);
    assert.equal(h.outcomes.filter(([result])=>result==='lose').length,1);
    assert.equal(h.begins.length,1);
  } finally {h.scene.exit();await flush();}
});

test('exit during readiness persists the same breached fight and ignores a late desktop completion',async()=>{
  const h=await harness();
  choose(h.scene,COMBAT_ACTION.EXPOSE);
  until(h.scene,(view)=>view.phase==='desktop-breach');
  const held=h.scene.battleView();
  h.scene.exit();
  assert.equal(h.ends.at(-1),'abort');
  const saved=h.checkpoints.at(-1);
  assert.equal(saved.continuation.sourceCombat.movementCoherence,held.state.movementCoherence);
  assert.equal(saved.continuation.sourceDesktop.breached,true);
  assert.deepEqual(saved.continuation.sentBack,['call-site']);
  h.begins[0].resolve();await flush();
  assert.equal(h.scene.battleView().sourceDesktop.waiting,true,'late readiness revived a disposed scene');
  assert.equal(h.outcomes.filter(([result])=>result==='abort').length,1);
});

test('reload at a breached decision restores desktop without a second dissolve or a new enemy turn',async()=>{
  const battle=battleFixture();
  let state=createCombatState(battle.combat,{difficulty:'standard',seed:27});
  state.movementCoherence=43;
  state.cycleIndex=5;
  state=applyFireballImpact(state,{damage:999,castId:'saved-break'});
  const h=await harness({continuation:combatContinuationSnapshot(state)});
  try {
    assert.equal(h.scene.battleView().phase,'desktop-breach');
    assert.equal(h.scene.battleView().sourceDesktop.transition,1);
    h.begins[0].resolve();await flush();
    h.scene.update(.001);
    const restored=h.scene.battleView();
    assert.equal(restored.phase,'tool');
    assert.equal(restored.sourceDesktop.phase,'desktop');
    assert.equal(restored.state.movementCoherence,43);
    assert.equal(restored.state.cycleIndex,5);
    assert.equal(restored.state.composure,20);
    assert.equal(restored.state.actionLog.filter((entry)=>entry.action==='enemy').length,0);
    assert.deepEqual(restored.state.sentBack,['call-site']);
  } finally {h.scene.exit();await flush();}
});

test('a second ordinary break loses without repeating the desktop peel',async()=>{
  const h=await harness();
  try {
    choose(h.scene,COMBAT_ACTION.EXPOSE);
    until(h.scene,(view)=>view.phase==='desktop-breach');
    await finishPeel(h);
    choose(h.scene,COMBAT_ACTION.SHOUT);
    until(h.scene,(view)=>!!view.state.result);
    for(let index=0;index<60;index+=1) h.scene.update(.05);
    await flush();
    const lost=h.scene.battleView();
    assert.equal(lost.state.result.result,'lose');
    assert.equal(lost.state.movementIndex,0);
    assert.equal(lost.state.sourceDesktop.tier,1);
    assert.equal(h.begins.length,1);
    assert.equal(h.outcomes.filter(([result])=>result==='lose').length,1);
    assert.ok(h.ends.includes('lose'));
  } finally {h.scene.exit();await flush();}
});

test('legacy breached continuation restores the settled desktop without a fresh movement or recovery',async()=>{
  const h=await harness({continuation:{composure:7,sentBack:['call-site']}});
  try {
    const waiting=h.scene.battleView();
    assert.equal(waiting.phase,'desktop-breach');
    assert.equal(waiting.sourceDesktop.transition,1);
    assert.equal(h.begins.length,1);
    assert.equal(waiting.state.composure,7);
    assert.deepEqual(waiting.state.sentBack,['call-site']);
    await finishPeel(h);
    const restored=h.scene.battleView();
    assert.equal(restored.phase,'tool');
    assert.equal(restored.state.composure,7);
    assert.equal(restored.state.sourceDesktop.cover,0);
    assert.equal(restored.sourceDesktop.cover.capacity,2);
    assert.equal(restored.state.actionLog.length,0);
  } finally {h.scene.exit();await flush();}
});

test('accepted terminal loss is saved before outro and reload delivers it only after native restoration',async()=>{
  let saved=createCombatState(battleFixture().combat,{difficulty:'standard',seed:91});
  saved=applyFireballImpact(saved,{damage:999,castId:'earlier-breach'});
  saved.composure=1;
  const heldBattle=battleFixture();
  heldBattle.lose=[{who:'direction',text:'The existing terminal document waits.'}];
  const h=await harness({continuation:combatContinuationSnapshot(saved),battle:heldBattle});
  let checkpoint;
  try {
    await finishPeel(h);
    choose(h.scene,COMBAT_ACTION.WAIT);
    until(h.scene,(view)=>view.phase==='result-choreography'&&view.state.result?.result==='lose');
    await flush();
    assert.equal(h.scene.battleView().phase,'talk');
    checkpoint=structuredClone(h.checkpoints.at(-1).continuation);
    assert.equal(checkpoint.sourceTerminal.version,1);
    assert.equal(checkpoint.sourceTerminal.metrics.result,'lose');
    assert.equal(checkpoint.composure,0);
    assert.equal(checkpoint.sourceTerminal.metrics.continuation,undefined,'terminal save recursively nested continuations');
    assert.equal(h.outcomes.length,0,'outcome fired before the existing outro');
    h.scene.exit();await flush();
    assert.equal(h.outcomes.filter(([id])=>id==='abort').length,1);
    assert.deepEqual(h.checkpoints.at(-1).continuation.sourceTerminal,checkpoint.sourceTerminal);
  } finally {if(!checkpoint)h.scene.exit();}
  const ending=deferred();
  const reloaded=await harness({continuation:JSON.parse(JSON.stringify(checkpoint)),endTask:ending});
  try {
    const resumed=reloaded.scene.battleView();
    assert.equal(resumed.state.result.result,'lose');
    assert.equal(resumed.state.composure,0,'terminal reload recreated a playable composure pool');
    assert.equal(resumed.state.phase,'done');
    assert.deepEqual(resumed.state.actionLog,checkpoint.actionLog);
    assert.deepEqual(resumed.state.source.channels,checkpoint.source.channels);
    assert.equal(reloaded.begins.length,0,'terminal reload replayed the fight migration');
    assert.deepEqual(reloaded.ends,['lose']);
    assert.equal(reloaded.outcomes.length,0,'outcome fired before native restoration completed');
    ending.resolve();await flush();
    assert.equal(reloaded.outcomes.filter(([id])=>id==='lose').length,1);
    reloaded.scene.update(1);await flush();
    assert.equal(reloaded.outcomes.filter(([id])=>id==='lose').length,1);
  } finally {reloaded.scene.exit();await flush();}
});

test('terminal win reload keeps its banked phase votes and tool spend without replaying rewards',async()=>{
  const battle=battleFixture();
  let saved=createCombatState(battle.combat,{difficulty:'standard',startingMovementIndex:2,seed:11});
  saved.movementCoherence=1;
  saved.source.channels.rescue=2;
  const heldBattle=battleFixture();
  heldBattle.win=[{who:'direction',text:'The armed channel takes the existing return value.'}];
  const h=await harness({continuation:combatContinuationSnapshot(saved),battle:heldBattle});
  let checkpoint;
  try {
    choose(h.scene,COMBAT_ACTION.EXPOSE);
    checkpoint=structuredClone(h.checkpoints.at(-1).continuation);
    assert.equal(checkpoint.sourceTerminal.metrics.result,'win','terminal player action was not durable at commit');
    assert.equal(checkpoint.source.channels.rescue,3);
    assert.equal(checkpoint.toolsUsed.torch,1);
    h.scene.exit();await flush();
  } finally {if(!checkpoint)h.scene.exit();}
  const ending=deferred();
  const reloaded=await harness({continuation:checkpoint,endTask:ending,stacked:true});
  const overlay={id:'pause',overlay:true,blocksInput:true,blocksWorld:true};
  try {
    assert.equal(reloaded.scene.battleView().state.result.result,'win');
    assert.deepEqual(reloaded.scene.battleView().state.source.channels,checkpoint.source.channels);
    assert.deepEqual(reloaded.scene.battleView().state.toolsUsed,checkpoint.toolsUsed);
    assert.deepEqual(reloaded.scene.battleView().state.actionLog,checkpoint.actionLog);
    assert.equal(reloaded.outcomes.length,0);
    scenes.push(overlay);
    ending.resolve();await flush();
    assert.equal(reloaded.outcomes.filter(([id])=>id==='win').length,1);
    assert.equal(reloaded.outcomes.filter(([id])=>id==='abort').length,0);
    assert.equal(scenes.top({includeOverlay:true}),overlay,'restoration popped the active pause instead of its combat scene');
    assert.equal(scenes.has(reloaded.scene.id),false);
    assert.equal(reloaded.outcomes[0][1].source.channels.rescue,3);
  } finally {scenes.clear();await flush();}
});

test('exiting while terminal native restoration is pending suppresses its late callback and interference',async()=>{
  const definition=battleFixture().combat;
  let state=createCombatState(definition,{difficulty:'standard',seed:44});
  state=applyFireballImpact(state,{damage:999,castId:'one'});
  state=applyFireballImpact(state,{damage:999,castId:'two'});
  const metrics=structuredClone(state.result);
  delete metrics.continuation;
  const continuation={...combatContinuationSnapshot(state),sourceTerminal:{version:1,definitionId:definition.id,metrics}};
  const ending=deferred();
  const h=await harness({continuation,endTask:ending});
  assert.deepEqual(h.ends,['lose']);
  h.scene.exit();
  assert.equal(h.outcomes.filter(([id])=>id==='abort').length,1);
  ending.resolve();await flush();
  assert.equal(h.outcomes.filter(([id])=>id==='lose').length,0);
  assert.equal(h.interferenceCalls.filter(([id])=>id==='finish').length,0);
  assert.equal(h.checkpoints.at(-1).continuation.sourceTerminal.metrics.result,'lose');
});
