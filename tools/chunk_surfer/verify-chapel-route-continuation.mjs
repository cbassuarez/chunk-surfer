// Imported by the coordinated native route runner. This module never launches
// a browser, stages a checkpoint, moves a body directly or grants a proof.
import {availableCombatActions,availableCombatTools,combatMovesForTool,runCombatTurn} from '../../src/game/combat-state.js';
import {SETUP_HANDOFF} from '../../src/game/setup-handoff.js';

const finite=value=>Number.isFinite(Number(value))?Number(value):0;
export function chooseChapelCombatAction(state){
 const score=after=>after.result?.won?100000:after.result?-100000:
   (finite(after.movementIndex)-finite(state.movementIndex))*160
   +(finite(state.movementCoherence)-finite(after.movementCoherence))*2.2
   +(finite(after.composure)-finite(state.composure))*3
   +(after.take&&!state.take?7:0)+(finite(after.charge)-finite(state.charge))*1.5;
 return availableCombatActions(state).filter(action=>action.enabled).map(action=>{
  try{return{action,score:score(runCombatTurn(state,{type:action.id}))};}catch{return{action,score:-Infinity};}
 }).sort((a,b)=>b.score-a.score)[0]?.action||null;
}

export async function runChapelContinuation({page,check,shot,hold,press,waitFor,walkTo,snapshot,sleep,report}={}){
 if(!page||![check,shot,hold,press,waitFor,walkTo,snapshot,sleep].every(value=>typeof value==='function'))throw Error('Chapel continuation requires the coordinated route helpers.');
 const trace={kind:'chapel-arrival-to-agreed-sacrifice',method:'Existing post-arrival game; actual W/E/R and combat/dialogue keys. Read-only model ranks legal combat responses. No presets, warps, proof writes or win flags.',startedAt:new Date().toISOString(),actions:[],scenes:[],won:false,selectedAgreement:false,physicalScreenCommit:false,credits:false,postcredits:false};
 if(report?.routes?.at(-1))report.routes.at(-1).continuation=trace;
 const observe=async()=>{
  const base=await snapshot(),extra=await page.evaluate(async()=>{
   const p=window.__probe,top=window.__scenes?.top(),FP=await import('/src/world/floorplan.js');
   const save=p.sixLoop?.save?.()||{};
   return{view:top?.view?.()||top?.debugState?.()||null,battle:p.battleState?.()||null,encounters:p.encounters?.()||null,
    finale:p.finale?.()||null,dossier:p.endingDossier?.()||null,cutscene:p.endingCutscene?.()||null,
    run:save.run||null,rec:p.rec?.()||null,bag:p.bag?.()||null,
    chapelDoor:FP.doorState().find(door=>door.id==='chapel-c17')||null,
    chapelNave:FP.toRuntimePoint({x:92,y:74}),chapelScreen:FP.toRuntimePoint({x:92,y:67})};
  });
  const value={...base,...extra};if(!trace.scenes.includes(value.scene))trace.scenes.push(value.scene);return value;
 };
 const until=async(predicate,{timeout=30000,label='chapel continuation'}={})=>{
  const stop=Date.now()+timeout;while(Date.now()<stop){const state=await observe();if(predicate(state))return state;await sleep(160);}
  const state=await observe();throw Error(`Timed out: ${label}; state=${JSON.stringify({scene:state.scene,pos:state.pos,finale:state.finale,battlePhase:state.battle?.phase,room:state.encounters?.gates?.room})}`);
 };
 const confirm=async()=>{
  const state=await observe();
  if(!(String(state.scene).startsWith('battle:')||state.scene==='finale'||state.scene==='return-report'))throw Error(`Chapel Enter refused outside its actual dialogue/combat owner: ${state.scene}`);
  await press('Enter');
 };
 const aim=async target=>page.evaluate(async target=>{
  const p=window.__probe,pos=p.pos(),FP=await import('/src/world/floorplan.js'),a=FP.logicalToPhysical(pos.x,pos.y),b=FP.logicalToPhysical(target.x,target.y);
  p.lookAtWorld(Math.atan2(b.x-a.x,-(b.z-a.z)),0);
 },target);
 let state=await observe();trace.arrival={scene:state.scene,pos:state.pos,takes:state.takes,phase:state.chapelTower?.phase,
  history:Object.fromEntries(['combat.trained',SETUP_HANDOFF.skillsClosed,SETUP_HANDOFF.skillsDone,SETUP_HANDOFF.closed,'drank.coffee'].map(key=>[key,!!state.flags[key]]))};
 check('chapel continuation begins in the actual destination after its return film',!state.where?.source&&!state.scene,{where:state.where,scene:state.scene});
 check('chapel has the four historical room takes before this continuation',state.takes?.filter(id=>id&&id!=='lux_nova').length>=4,state.takes);
 check('the initial historical rehearsal and skills handoff were completed before this route',!!state.flags['combat.trained']&&!!(state.flags[SETUP_HANDOFF.skillsClosed]||state.flags[SETUP_HANDOFF.skillsDone]&&state.flags[SETUP_HANDOFF.closed]),{trained:state.flags['combat.trained'],skillsClosed:state.flags[SETUP_HANDOFF.skillsClosed],skillsDone:state.flags[SETUP_HANDOFF.skillsDone],caseClosed:state.flags[SETUP_HANDOFF.closed]});
 check('this continuation selects the sober agreed sacrifice variant',!state.flags['drank.coffee']);
 check('chapel fifth slot and victory are not supplied by the route fixture',!state.takes.includes('lux_nova')&&!state.encounters?.cleared?.includes('chapel'),{takes:state.takes,encounters:state.encounters});
 const door=state.chapelDoor;check('actual chapel c17 threshold exists',!!door);
 if(!door.open&&finite(door.openFraction)<.82){
  const normalAxis=door.widthAxis==='y'?'x':'y',middle=normalAxis==='x'?door.cx:door.cy,side=Math.sign(state.pos[normalAxis]-middle)||1;
  const approach={x:door.cx,y:door.cy};approach[normalAxis]+=side*3;
  await walkTo(approach,{building:true,radius:1.3});await aim({x:door.cx,y:door.cy});await press('e');
  state=await until(s=>s.chapelDoor?.open&&finite(s.chapelDoor.openFraction)>=.82,{timeout:12000,label:'real E opening of chapel c17'});
 }
 await walkTo(state.chapelNave,{building:true,radius:1.1});state=await observe();
 check('ordinary movement reaches the actual chapel recording area',state.encounters?.gates?.room==='lux_nova',{pos:state.pos,gate:state.encounters?.gates});await shot('chapel-continuation-nave');
 await press('r');state=await until(s=>s.scene==='recorder'||String(s.scene).startsWith('battle:chapel'),{timeout:10000,label:'R raises the actual recorder'});
 if(state.scene==='recorder'){
  const recKey=state.view?.keys?.find(key=>key.id==='rec');check('the actual recorder REC control is enabled in the chapel',recKey?.enabled,{keys:state.view?.keys,selected:state.view?.selectedKey});
  for(let n=0;n<3&&state.view?.selectedKey!=='rec';n++){await press('ArrowLeft');state=await observe();}
  check('ordinary transport selection reaches REC',state.scene==='recorder'&&state.view?.selectedKey==='rec',{scene:state.scene,selected:state.view?.selectedKey});
  await shot('chapel-continuation-recorder-rec');await press('e');
 }
 await until(s=>String(s.scene).startsWith('battle:chapel'),{timeout:30000,label:'actual recorder REC starts the chapel confrontation'});await shot('chapel-continuation-fight-start');
 const battleStop=Date.now()+720000;let turnCount=0,lastShotMovement=-1;
 while(Date.now()<battleStop){
  state=await observe();const view=state.battle;
  if(!view){
   if(state.encounters?.cleared?.includes('chapel')){trace.won=true;break;}
   throw Error(`Chapel combat left without a won encounter: ${JSON.stringify({scene:state.scene,finale:state.finale,encounters:state.encounters})}`);
  }
  if(view.state.result&&!view.state.result.won)throw Error('Actual chapel fight was lost; agreed victory path was not earned.');
  if(view.state.result?.won)trace.won=true;
  if(view.state.movementIndex!==lastShotMovement){lastShotMovement=view.state.movementIndex;await shot(`chapel-continuation-movement-${lastShotMovement+1}`);}
  if(view.phase==='prepare'){
   // READY is the untouched preparation view's real default focused control.
   // No equipment/build is edited or committed through a probe.
   await sleep(350);await confirm();continue;
  }
  if(view.phase==='talk'||view.phase==='done'){await confirm();await sleep(250);continue;}
  if(!['tool','move'].includes(view.phase)){await sleep(180);continue;}
  const action=chooseChapelCombatAction(view.state);if(!action)throw Error('No legal chapel combat response');
  if(view.phase==='move')await press('ArrowUp');
  let current=(await observe()).battle;if(!current||current.phase!=='tool')continue;
  const tools=availableCombatTools(current.state),toolIndex=tools.findIndex(tool=>tool.id===action.tool);
  if(toolIndex<0)throw Error(`Legal action has no current tool: ${action.id}`);
  for(let i=0;i<(toolIndex-current.selectedTool+tools.length)%tools.length;i++)await press('ArrowRight');
  await press('ArrowDown');current=(await observe()).battle;if(!current||current.phase!=='move')continue;
  const moves=combatMovesForTool(current.state,action.tool),moveIndex=moves.findIndex(move=>move.id===action.id);
  if(moveIndex<0||moves[moveIndex].enabled===false)continue;
  for(let i=0;i<(moveIndex-current.selectedMove+moves.length)%moves.length;i++)await press('ArrowRight');
  const beforeTurns=current.state.turns;await confirm();await sleep(180);
  const next=(await observe()).battle;
  if(next?.phase==='move'&&next.state.turns===beforeTurns)await confirm();
  trace.actions.push({turn:beforeTurns,movement:current.state.movementIndex,action:action.id,tool:action.tool,at:Date.now()});
  if(++turnCount>240)throw Error('Chapel legal-input fight exceeded its bounded action budget');
 }
 state=await observe();check('chapel victory is earned by actual battle commands',trace.won&&state.encounters?.cleared?.includes('chapel'),{turns:trace.actions.length,encounters:state.encounters});await shot('chapel-continuation-won');
 // A won pin legitimately opens the ordinary SKILLS case before the queued
 // ending conversation. Inspect that owner and close it through its actual
 // Escape input; never pop the scene, commit a skill or invoke its callback.
 if(state.scene==='bag'){
  trace.postVictoryCase={section:state.bag?.section,route:state.bag?.route?.type,pendingSkills:state.bag?.pendingSkills||[]};
  check('the earned post-victory case is the ordinary inspectable bag',state.bag?.open===true,trace.postVictoryCase);
  await shot('chapel-continuation-earned-skills-case');
  for(let backs=0;backs<8&&state.scene==='bag';backs++){
   await press('Escape');await sleep(250);state=await observe();
  }
  check('real Escape closes the optional earned skills case',state.scene!=='bag',{scene:state.scene,bag:state.bag});
 }
 state=await until(s=>s.scene==='finale',{timeout:15000,label:'queued chapel ending dialogue after the earned case closes'});
 // Only the exact agreement is selected. Other optional endings retain their
 // own historical equipment/proof qualifications and are not granted here.
 const choiceStop=Date.now()+120000;
 while(Date.now()<choiceStop){
  state=await observe();const options=state.view?.pending?.options||[];
  if(state.scene==='finale'&&options.length){
   const index=options.findIndex(option=>String(option.text||'').trim()==='Give the room the agreement it is asking for.');
   if(index<0)throw Error('Unexpected finale choice set; will not guess an ending: '+JSON.stringify(options.map(option=>option.text)));
   const selected=finite(state.view.pending.index);for(let n=0;n<(index-selected+options.length)%options.length;n++)await press('ArrowDown');
   await confirm();trace.selectedAgreement=true;break;
  }
  if(state.scene!=='finale')throw Error('The won chapel did not offer its actual ending conversation: '+state.scene);
  await confirm();await sleep(250);
 }
 check('the actual chapel choice selects agreed sacrifice',trace.selectedAgreement);
 const agreedStop=Date.now()+90000;
 while(Date.now()<agreedStop){
  state=await observe();if(state.finale?.escape==='commit'&&!state.scene)break;
  if(state.scene!=='finale'||state.view?.pending?.options?.length)throw Error('Unexpected owner/choice after explicit agreement: '+state.scene);
  await confirm();await sleep(250);
 }
 state=await observe();check('agreement creates a physical stay objective before ending',state.finale?.escape==='commit'&&state.flags['ending.choice']==='sacrifice',{finale:state.finale,choice:state.flags['ending.choice']});
 await walkTo(state.chapelScreen,{building:true,radius:2.1});await aim(state.chapelScreen);await shot('chapel-continuation-screen-before-commit');
 check('the stay objective is still uncommitted before actual screen E',!(await observe()).run?.finalizedReturn);
 await press('e');trace.physicalScreenCommit=true;
 const endingStop=Date.now()+180000;let recordedHold=false;
 while(Date.now()<endingStop){
  state=await observe();const id=String(state.scene||'');
  if(id==='credits'){
   if(!trace.credits){trace.credits=true;await shot('chapel-continuation-earned-credits');}
   // Normal credits dismissal, after first capturing the earned credit scene.
   await press('Escape');await sleep(450);continue;
  }
  if(id==='return-report'){
   trace.postcredits=true;trace.return={run:state.run,dossier:state.dossier,view:state.view};await shot('chapel-continuation-postcredits');break;
  }
  if(id.startsWith('ending-hold:')){if(!recordedHold){recordedHold=true;await shot('chapel-continuation-final-world-hold');}await sleep(220);continue;}
  if(id==='finale'){
   if(state.view?.pending?.options?.length)throw Error('Unexpected additional ending menu; no implicit selection allowed');
   await confirm();await sleep(250);continue;
  }
  if(!id||id==='death'||id.startsWith('ending-')){await sleep(220);continue;}
  throw Error('Unexpected owner during earned chapel ending: '+id);
 }
 state=await observe();
 check('physical screen commitment reaches earned credits and postcredits',trace.physicalScreenCommit&&trace.credits&&trace.postcredits,{scenes:trace.scenes,run:state.run});
 const expected='sacrifice';
 check('the completed run records the actual agreed chapel ending',state.run?.finalizedReturn?.endingId===expected&&state.dossier?.arrival==='agreed',{expected,return:state.run?.finalizedReturn,dossier:state.dossier});
 trace.completedAt=new Date().toISOString();return trace;
}
