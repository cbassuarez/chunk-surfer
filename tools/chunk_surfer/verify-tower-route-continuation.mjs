// Append to an earned branch-to-belfry run. This module has no bootstrap,
// server, browser, GPU launch, fixture, warp or progression-writing operation.
import {availableCombatActions,availableCombatTools,combatMovesForTool,runCombatTurn} from '../../src/game/combat-state.js';
import {achievementRunEligible} from '../../src/progression/eligibility.js';

export async function runTowerContinuation({page,check,shot,hold,press,waitFor,walkTo,snapshot,sleep,report}){
 const evidence={scope:'Actual post-return-film belfry → two real stair descents → voluntary crossing commitment → two fought phases → physically gripped extraction → earned credits/postcredits.',
  method:'Read-only current floorplan/prop collision guides ordinary key input and the existing look setter. Pure combat simulation ranks legal commands; only actual command keys change the live battle. No fixtures, warps, wins, flags, damage, grip, return or ending callbacks are injected.',
  stairs:[],actions:[],phases:[],reload:null,extraction:[],screens:[],completed:false};
 const route=report.routes?.at(-1);if(route)route.towerContinuation=evidence;else report.towerContinuation=evidence;
 const state=async()=>{
  const base=await snapshot(),actual=await page.evaluate(()=>{
   const p=window.__probe,top=window.__scenes.top({includeOverlay:true}),saved=JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'{}');
   return{cathedral:p.cathedralState(),battle:p.battleState(),scene:top?.id||null,dialogue:top?.view?.()||null,
    cutscene:p.endingCutscene(),doors:p.doors(),floor:p.floorH(),look:p.lookAngles(),pos:p.pos(),meta:p.meta(),
    storedExtraction:saved.chunkSurf?.finale?.cathedral?.extraction||null,run:saved.run,recording:p.towerEndingRecording?.()||null};
  });return{...base,...actual};
 };
 const until=async(predicate,{timeout=30000,label='tower state',interval=150}={})=>{
  const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(predicate(s))return s;await sleep(interval);}
  throw Error(`${label} timed out: ${JSON.stringify(await state())}`);
 };
 const point=(level,x,y)=>({x:({ground:112,loft:140,belfry:170}[level]+x)*2,y:({ground:125,loft:183,belfry:169}[level]+y)*2});
 const cellKey=p=>`${Math.floor(p.x)},${Math.floor(p.y)}`;
 const aim=async(yaw,pitch=-.08)=>{await page.evaluate(v=>window.__probe.lookAtWorld(v.yaw,v.pitch),{yaw,pitch});await sleep(60);};
 const face=async(target,pitch=-.08)=>{
  const yaw=await page.evaluate(async target=>{const FP=await import('/src/world/floorplan.js'),p=window.__probe.pos(),a=FP.logicalToPhysical(p.x,p.y),b=FP.logicalToPhysical(target.x,target.y);return Math.atan2(b.x-a.x,-(b.z-a.z));},target);
  await aim(yaw,pitch);
 };
 const carry=s=>s.cathedral?.carry||s.storedExtraction;
 const cut=()=>evidence.screens.at(-1);
 async function capture(name){const s=await state();await shot(`tower-${name}`);evidence.screens.push({name,scene:s.scene,here:s.cathedral?.here,floor:s.floor,pos:s.pos,finale:s.cathedral?.finale,cutscene:s.cutscene,finalizedReturn:s.run?.finalizedReturn||null});return s;}

 async function actualStairPath(target){
  return page.evaluate(async target=>{
   const FP=await import('/src/world/floorplan.js'),P=await import('/src/game/props.js'),start=window.__probe.pos(),keys=new Set(window.__probe.keys());
   const key=p=>`${Math.floor(p.x)},${Math.floor(p.y)}`,first={x:Math.floor(start.x),y:Math.floor(start.y)},goal=key(target),queue=[first],parents=new Map([[key(first),null]]);
   for(let i=0;i<queue.length&&i<160000;i++){
    const p=queue[i];if(key(p)===goal){const path=[];for(let id=goal;parents.get(id);){const edge=parents.get(id);path.push(edge);id=key(edge.from);}return{path:path.reverse(),expanded:i};}
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
     const result=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys});if(!result.ok)continue;
     // A stair redirect is real construction joining logical islands. Do not
     // turn it into an imaginary walk across their numerical separation.
     const q={x:Math.floor(result.redirect?.x??p.x+dx),y:Math.floor(result.redirect?.y??p.y+dy)};
     if(parents.has(key(q))||!P.propCanOccupy(q.x,q.y,{from:p}))continue;
     parents.set(key(q),{from:p,to:q,dx,dy,redirect:result.redirect||null});queue.push(q);
    }
   }
   return{path:null,start,target,expanded:queue.length};
  },target);
 }
 async function stairWalk(target,name){
  let s=await state(),planned=await actualStairPath(target);check(`${name}: actual collision/redirect graph has a route`,!!planned.path,planned.path?{expanded:planned.expanded,steps:planned.path.length}:planned);
  let path=planned.path,index=0,replans=0;const visited=[];
  while(index<path.length){
   s=await state();let edge=path[index];
   if(cellKey(s.pos)!==cellKey(edge.from)){
    const ahead=path.findIndex((candidate,i)=>i>=index&&cellKey(candidate.from)===cellKey(s.pos));
    if(ahead>=0){index=ahead;edge=path[index];}
    else{if(++replans>30)throw Error(`${name}: ordinary body repeatedly leaves the planned route`);planned=await actualStairPath(target);check(`${name}: reached body has a continuing route`,!!planned.path);path=planned.path;index=0;if(!path.length)break;edge=path[index];}
   }
   const accepted=await page.evaluate(async edge=>{
    const R=await import('/src/render/r3d.js'),p=window.__probe;
    const step=p.canStep(edge.from.x,edge.from.y,edge.from.x+edge.dx,edge.from.y+edge.dy);
    const planYaw=R.r3dWorldYaw()-R.r3dLookAngles().yaw;
    p.lookAtWorld(Math.atan2(edge.dx,-edge.dy)+planYaw,-.10);
    return{step,delta:p.stepDelta()};
   },edge);
   check(`${name}: next actual stair step is supported`,accepted.step?.ok,{edge,step:accepted.step});
   check(`${name}: the camera maps W to the supported step`,accepted.delta?.[0]===edge.dx&&accepted.delta?.[1]===edge.dy,{edge,delta:accepted.delta});
   let moved=false;
   for(let retry=0;retry<5;retry++){await hold('w',100);s=await state();if(cellKey(s.pos)!==cellKey(edge.from)){moved=true;break;}await sleep(120);}
   check(`${name}: ordinary W advances the body`,moved,{edge,actual:s.pos,floor:s.floor,scene:s.scene});
   visited.push({from:edge.from,to:s.pos,floor:s.floor,here:s.cathedral?.here,redirect:edge.redirect});index++;
  }
  s=await state();const metric=await page.evaluate(async target=>{const FP=await import('/src/world/floorplan.js'),p=window.__probe.pos(),a=FP.logicalToPhysical(p.x,p.y),b=FP.logicalToPhysical(target.x,target.y);return{metres:Math.hypot(a.x-b.x,a.z-b.z)*.5,heightDifference:Math.abs(FP.floorAt(p.x,p.y)-FP.floorAt(target.x,target.y))};},target);
  check(`${name}: arrives on the real destination floor`,metric.metres<=.505&&metric.heightDifference<.2,metric);
  evidence.stairs.push({name,target,visited,final:s.pos,here:s.cathedral?.here,metric});await capture(name);return s;
 }

 let s=await state();
 check('earned tower continuation begins in actual belfry after the return film',s.cathedral?.here?.level==='belfry'&&s.cathedral.finale.route==='tower'&&s.cathedral.finale.stage==='cathedral'&&!s.battle,{here:s.cathedral?.here,finale:s.cathedral?.finale});
 const beginningTakes=s.takes;
 await capture('earned-belfry');
 // These are the actual authored south-upper/north-lower stairs. Optional
 // apparatus lessons are not fabricated as gate keys or mandatory history.
 for(const[level,x,y,name]of[
  ['belfry',22,70,'belfry-south-mouth'],['loft',20.5,71.5,'south-spiral-to-loft'],['loft',16,72,'crossing-walk'],
  ['loft',10,68,'north-triforium'],['loft',11,62,'north-lower-mouth'],['ground',10,63,'north-spiral-to-ground'],
  ['ground',16,62,'west-nave'],['ground',16,73,'under-the-lantern'],
 ])await stairWalk(point(level,x,y),name);
 s=await state();check('descent alone never commits the voluntary fight',s.cathedral.finale.stage==='cathedral'&&!s.battle,{here:s.cathedral.here,alarm:s.cathedral.finale.cathedral.alarm});
 await press('e');await until(value=>!!value.battle||value.scene==='finale',{timeout:15000,label:'ordinary E under lantern opens the real duel'});

 const choose=before=>{
  const score=after=>after.result?.won?10000:after.result?-10000:(after.movementIndex-before.movementIndex)*160+(before.movementCoherence-after.movementCoherence)*2.2+(after.composure-before.composure)*3+(after.take&&!before.take?7:0)+(after.charge-before.charge)*1.5;
  return availableCombatActions(before).filter(action=>action.enabled).map(action=>({action,score:score(runCombatTurn(before,{type:action.id}))})).sort((a,b)=>b.score-a.score)[0]?.action;
 };
 async function command(view,action){
  if(view.phase==='move')await press('ArrowUp');
  let current=(await state()).battle;check('combat tool-selection owner remains active',!!current);
  const tools=availableCombatTools(current.state),target=tools.findIndex(tool=>tool.id===action.tool);check('chosen combat tool is actually available',target>=0,{tool:action.tool});
  for(let i=0;i<(target-current.selectedTool+tools.length)%tools.length;i++)await press('ArrowRight');
  await press('ArrowDown');current=(await state()).battle;
  const moves=combatMovesForTool(current.state,action.tool),index=moves.findIndex(move=>move.id===action.id);check('chosen response is in the real command band',index>=0,{action:action.id});
  for(let i=0;i<(index-current.selectedMove+moves.length)%moves.length;i++)await press('ArrowRight');
  await press('Enter');await sleep(100);const next=(await state()).battle;
  if(next?.phase==='move'&&next.state.turns===view.state.turns)await press('Enter');
 }
 let reloaded=false;const phases=new Set(),battleDeadline=Date.now()+540000;
 while(Date.now()<battleDeadline){
  s=await state();if(s.cathedral.finale.stage==='tower-escape')break;
  const view=s.battle;
  if(!view){
   if(s.scene==='finale'){await press('Enter');await sleep(300);continue;}
   if(s.scene&&!String(s.scene).startsWith('battle'))throw Error('Unexpected owner in cathedral duel: '+s.scene);
   await sleep(250);continue;
  }
  const phase=view.state.definition.cathedralPhase;phases.add(phase);
  if(['talk','ready','arrival','prepare','done'].includes(view.phase)){await press('Enter');await sleep(300);continue;}
  if(view.phase==='resolve'){await sleep(350);await press('Enter');continue;}
  if(!['tool','move'].includes(view.phase)){await sleep(200);continue;}
  if(phase===2&&!reloaded){
   const before={phase,position:s.pos,here:s.cathedral.here,turns:view.state.turns,movement:view.state.movementIndex,composure:view.state.composure,charge:view.state.charge,battery:view.state.battery,take:view.state.take,damage:s.cathedral.finale.cathedral.damage};
   await capture('phase-two-before-real-reload');await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__probe?.battleState&&window.__scenes.top()?.id==='title',{timeout:120000});await press('Enter');
   s=await until(value=>value.battle?.state?.definition?.cathedralPhase===2,{timeout:120000,label:'real Continue resumes second fought phase'});const after=s.battle.state;
   check('phase-two reload retains earned movement and resources',after.turns===before.turns&&after.movementIndex===before.movement&&after.composure===before.composure&&after.charge===before.charge&&after.battery===before.battery&&JSON.stringify(after.take)===JSON.stringify(before.take),{before,after:{turns:after.turns,movement:after.movementIndex,composure:after.composure,charge:after.charge,battery:after.battery,take:after.take}});
   check('phase-two reload preserves actual church damage and position',JSON.stringify(s.cathedral.finale.cathedral.damage)===JSON.stringify(before.damage)&&JSON.stringify(s.cathedral.here)===JSON.stringify(before.here));
   evidence.reload={before,after:{here:s.cathedral.here,pos:s.pos,damage:s.cathedral.finale.cathedral.damage}};reloaded=true;await capture('phase-two-real-continue');continue;
  }
  const action=choose(view.state);check('a legal live combat response exists',!!action);
  evidence.actions.push({phase,turn:view.state.turns,movement:view.state.movementIndex,action:action.id,tool:action.tool,composure:view.state.composure});await command(view,action);await sleep(170);
 }
 s=await state();evidence.phases=[...phases];
 check('both actual cathedral combat phases were fought',phases.has(1)&&phases.has(2)&&reloaded);
 check('real wins produce the collapsed body without a carry preset',s.cathedral.finale.stage==='tower-escape'&&!!carry(s)?.drag,{finale:s.cathedral.finale,carry:carry(s)});
 check('normal fought movements deliver every authored damage mark',['bells-swinging','frame-shaken','bell-fallen','pulpitum-split','lantern-out'].every(mark=>s.cathedral.finale.cathedral.damage.includes(mark)),s.cathedral.finale.cathedral.damage);
 await capture('earned-collapse');

 // Grip and movement are ordinary input. No extraction state/ending presenter
 // can be substituted for the actual trailing body clearing the west leaf.
 await face(carry(s).drag.position,-.32);await press('e');await sleep(300);s=await state();check('actual E takes the collapsed Surfer’s weight',carry(s)?.drag?.gripped);
 for(const[x,y,name]of[[16,69,'first-drag'],[16,65,'nave-drag'],[16,61,'north-of-font'],[17.6,61,'font-east-bypass'],[17.6,57.5,'past-font'],[16,57.5,'west-axis'],[16,56.3,'west-threshold']]){
  await walkTo(point('ground',x,y),{building:true,radius:.85,maxSeconds:80});s=await state();
  check(`${name}: actual drag remains gripped`,carry(s)?.drag?.gripped,{player:s.pos,drag:carry(s)?.drag});evidence.extraction.push({name,position:s.pos,drag:carry(s)?.drag,cutscene:s.cutscene});
 }
 s=await capture('physical-west-threshold');const west=s.doors.find(door=>door.id==='brendan-west-door');check('actual west exit leaf exists',!!west);
 await face({x:west.cx,y:west.cy},-.08);
 for(let i=0;i<4;i++){await press('e');s=await state();const leaf=s.doors.find(door=>door.id===west.id);if(leaf?.state==='opening'||leaf?.state==='open'||leaf?.openFraction>=.9)break;await sleep(250);}
 s=await until(value=>{const door=value.doors.find(door=>door.id===west.id);return door?.state==='open'||door?.openFraction>=.9;},{timeout:10000,label:'ordinary E opens west leaves'});
 check('opening the exit does not drop the actual grip',carry(s)?.drag?.gripped);await capture('physical-west-leaves-open');
 await aim(0,-.08);
 for(let i=0;i<35;i++){await hold('w',250);s=await state();if(s.cathedral.finale.stage==='resolved')break;}
 s=await capture('both-bodies-extracted');
 check('two physical bodies crossing the west leaf earns tower-won',s.cathedral.finale.stage==='resolved'&&s.cathedral.finale.result==='won',s.cathedral.finale);
 const physical=s.cathedral.physical;
 check('complete trailing body, not just player centre, clears actual west threshold',physical?.bothOutside&&physical.player.z<=physical.westPlane.z-.25+1e-6&&physical.body.z<=physical.westPlane.z-1.1+1e-6&&physical.player.z<=54.75+1e-6&&physical.body.z<=53.9+1e-6,physical);
 check('ordinary grip stays continuous across final extraction',s.storedExtraction?.drag?.gripped===true&&s.cutscene?.embodiment?.thresholdRegripped!==true,{drag:s.storedExtraction?.drag,embodiment:s.cutscene?.embodiment});

 let credits=false,postcredits=false,finalHold=false;const deadline=Date.now()+160000,owners=[];
 while(Date.now()<deadline){
  s=await state();if(!owners.includes(s.scene))owners.push(s.scene);
  if(s.scene==='ending-hold:tower-won'){
   if(!finalHold){await capture('earned-final-held-image');finalHold=true;}
   // Let the actual held world run its own score; acknowledgment belongs to
   // the subsequent transcript, never to an invented completion action.
   await sleep(120);continue;
  }
  if(s.scene==='credits'){if(!credits){await capture('earned-credits');credits=true;}await press('Escape');await sleep(300);continue;}
  if(s.scene==='return-report'){await capture('earned-postcredits');postcredits=true;break;}
  if(String(s.scene).startsWith('ending-final-action:'))throw Error('Unexpected mandatory final action in earned tower coda');
  if(s.scene==='finale'){await press('Enter');await sleep(300);continue;}
  if(s.scene&&String(s.scene).startsWith('source-return'))throw Error('Tower coda unexpectedly started another driving scene');
  await sleep(180);
 }
 check('earned tower coda reaches its actual held world, credits and postcredits',finalHold&&credits&&postcredits,{owners,finalHold,credits,postcredits});
 s=await state();
 check('the durable run records the tower-won ending',s.run?.finalizedReturn?.endingId==='tower-won',s.run?.finalizedReturn);
 const eligible=achievementRunEligible(s.run);
 check('the persistent profile respects the run’s ending eligibility',
  eligible?s.meta?.endingsSeen?.includes('tower-won'):!s.meta?.endingsSeen?.includes('tower-won'),
  {eligible,endingsSeen:s.meta?.endingsSeen});
 check('tower continuation does not fabricate another room recording',JSON.stringify(s.takes)===JSON.stringify(beginningTakes));
 evidence.ending='tower-won';evidence.completed=true;evidence.final={scene:s.scene,run:s.run,endingsSeen:s.meta?.endingsSeen,finale:s.cathedral.finale};
 return evidence;
}
