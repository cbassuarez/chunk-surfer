// The building can catch the case. This controller records physical failure
// and a damage request; the tape store alone applies damage to real recordings.
// It has no recording, audio or inventory imports.
export const CHAPEL_TAPE_DEMAND_FLAG='chapelTapeDemand.checkpoint';
export const CHAPEL_TAPE_DEMAND_PACK='/assets/chapel-tape-demand.glb';
export const CHAPEL_TAPE_DEMAND_COPY='GIVE ME THE TAPES';
export const CHAPEL_TAPE_DEMAND_PULL_SECONDS=1.65;
export const CHAPEL_TAPE_DEMAND_STRAIN_SECONDS=1.0;
export const CHAPEL_TAPE_DEMAND_DAMAGED_STRAIN_SECONDS=1.8;
export const CHAPEL_TAPE_DEMAND_REACH_M=1.3;
export const CHAPEL_TAPE_DAMAGE_ROOMS=Object.freeze(['main_b3','the_tub','amplifications','soundnoisemusic']);
const catchDoors=new Set(['chapel-c17','front-main']);
const catchGroups=new Set(['ground','upper','academic','basement','hall']);
const damageRooms=new Set(CHAPEL_TAPE_DAMAGE_ROOMS);
const statuses=new Set(['dormant','armed','departing','caught','released','complete']);
const stages={surfaced:new Set(['public-doors','service-road']),inversion:new Set(['door','at-door','rescue','wrong-door-returned'])};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const point=value=>value&&finite(value.x)&&finite(value.y)&&Math.abs(value.x)<100000&&Math.abs(value.y)<100000?{x:value.x,y:value.y}:null;
const world=value=>value&&finite(value.x)&&finite(value.y)&&finite(value.z)?{x:value.x,y:value.y,z:value.z}:null;
const view=value=>value&&finite(value.yaw)&&finite(value.pitch)?{yaw:value.yaw,pitch:clamp(value.pitch,-.62,.62)}:null;
export function freshChapelTapeDemand(runId=''){
  return{schema:1,runId:String(runId||''),status:'dormant',route:null,progress:0,catch:null,departure:null,spent:[],failures:0,caseDamaged:false,spill:null};
}
function damageTarget(raw){
  if(!raw||typeof raw.takeId!=='string'||!raw.takeId.trim()||raw.takeId.length>128||!damageRooms.has(raw.roomId)
    ||!Number.isSafeInteger(raw.ordinal)||raw.ordinal<1||raw.ordinal>100000)return null;
  return{takeId:raw.takeId,roomId:raw.roomId,ordinal:raw.ordinal};
}
function catchRecord(raw){
  if(!raw||!catchDoors.has(raw.doorId)||!world(raw.anchor)||!point(raw.position))return null;
  const base={doorId:raw.doorId,anchor:world(raw.anchor),position:point(raw.position),group:String(raw.group||''),wallYaw:finite(raw.wallYaw)?raw.wallYaw:0,view:view(raw.view)};
  // Schema-1 effort checkpoints predate custody. They resume under their old
  // release rule instead of silently turning a saved hold into a new puzzle.
  if(raw.mode==null)return base;
  if(raw.mode!=='spatial')return null;
  if(!finite(raw.initialDistance)||raw.initialDistance<.1||raw.initialDistance>3.5
    ||!catchGroups.has(base.group)
    ||raw.kind!=null&&!['building','congregation'].includes(raw.kind)
    ||raw.holder!=null&&!['player','anchor'].includes(raw.holder))return null;
  return{...base,mode:'spatial',kind:raw.kind||'building',
    receiverId:typeof raw.receiverId==='string'?raw.receiverId.slice(0,128):null,
    floor:finite(raw.floor)?raw.floor:base.anchor.y-.94,
    damageTarget:damageTarget(raw.damageTarget),
    initialDistance:raw.initialDistance,strainSeconds:clamp(raw.strainSeconds,0,CHAPEL_TAPE_DEMAND_DAMAGED_STRAIN_SECONDS),holder:raw.holder||'player'};
}
const spillDamageId=(runId,doorId)=>`chapel-spill:${runId}:${doorId}:2`;
function spillRecord(raw,runId){
  if(!raw||!catchDoors.has(raw.doorId)||!catchGroups.has(raw.group)||!world(raw.anchor)||!point(raw.position)
    ||raw.damageId!==spillDamageId(runId,raw.doorId))return null;
  const target=damageTarget(raw.target),applied=!!target&&raw.applied===true;
  const fulfilled=!target||applied&&(raw.fulfilled===true||raw.needsRetake===false);
  return{damageId:raw.damageId,target,anchor:world(raw.anchor),position:point(raw.position),group:raw.group,doorId:raw.doorId,
    wallYaw:finite(raw.wallYaw)?raw.wallYaw:0,floor:finite(raw.floor)?raw.floor:raw.anchor.y-.94,
    kind:raw.kind==='congregation'?'congregation':'building',applied,needsRetake:!!target&&!fulfilled,fulfilled};
}
export function chapelTapeDemandStrainSeconds(state){
  return state?.failures>=1?CHAPEL_TAPE_DEMAND_DAMAGED_STRAIN_SECONDS:CHAPEL_TAPE_DEMAND_STRAIN_SECONDS;
}
function objectiveTimeline(value,route){
  if(route!=='inversion'||value?.schema!==1||value.id!=='inversion-objective'
    ||typeof value.eventsKey!=='string'||!value.eventsKey||value.eventsKey.length>32768
    ||!finite(value.elapsedMs)||value.elapsedMs<0||value.elapsedMs>3600000
    ||!finite(value.cursorSeconds)||value.cursorSeconds<-.001||value.cursorSeconds>value.elapsedMs/1000+1e-6)return null;
  return{schema:1,id:'inversion-objective',eventsKey:value.eventsKey,elapsedMs:value.elapsedMs,cursorSeconds:value.cursorSeconds};
}
function departure(value,route){
  const position=point(value?.position);if(!position||!stages[route]?.has(value?.stage))return null;
  return{kind:route,stage:value.stage,position,view:view(value.view),remainingMs:finite(value.remainingMs)?Math.max(0,value.remainingMs):null,
    ledgerSignatures:Math.floor(clamp(value.ledgerSignatures,0,2)),alanQuestion:Math.floor(clamp(value.alanQuestion,0,10000)),
    timeline:objectiveTimeline(value.timeline,route),
    cutscene:value.cutscene&&finite(value.cutscene.cursor)?{cursor:Math.floor(clamp(value.cutscene.cursor,0,128)),elapsedMs:clamp(value.cutscene.elapsedMs,0,3600000),
      fired:(Array.isArray(value.cutscene.fired)?value.cutscene.fired:[]).filter(v=>typeof v==='string').slice(0,128),
      interactions:(Array.isArray(value.cutscene.interactions)?value.cutscene.interactions:[]).filter(v=>typeof v==='string').slice(0,128)}:null};
}
export function normalizeChapelTapeDemand(raw,{runId=''}={}){
  const base=freshChapelTapeDemand(runId);
  if(!runId||raw?.schema!==1||raw.runId!==runId||!statuses.has(raw.status))return base;
  const route=Object.hasOwn(stages,raw.route)?raw.route:null;
  const caught=catchRecord(raw.catch);
  const spent=[...new Set((Array.isArray(raw.spent)?raw.spent:[]).filter(id=>catchDoors.has(id)))];
  const spill=spillRecord(raw.spill,runId);
  const failures=Math.max(spill?2:0,Math.floor(clamp(raw.failures,0,2)));
  let status=raw.status;
  if(['departing','caught','released'].includes(status)&&!route)status='armed';
  // Damaged saves cannot restore an invisible tether or an impossible lock.
  if(status==='caught'&&!caught)status='departing';
  // Released old saves must not replay their already-survived threshold.
  if(['released','complete'].includes(status)&&caught&&!spent.includes(caught.doorId))spent.push(caught.doorId);
  if(status==='caught'&&caught&&spent.includes(caught.doorId))status='released';
  return{...base,status,route,progress:status==='released'||status==='complete'?1:clamp(raw.progress,0,.99999),catch:caught,departure:departure(raw.departure,route),spent,
    failures,caseDamaged:failures>=1,spill};
}
export function chapelTapeDemandCanCatch(state,doorId){
  return catchDoors.has(doorId)&&['departing','released'].includes(state?.status)&&!state.spent?.includes(doorId);
}
export function chapelTapeDemandInteraction(state,physicalPoint){
  const caught=state?.catch,held=state?.status==='caught'&&caught?.holder==='anchor';
  if(state?.status!=='caught'||caught?.mode!=='spatial'||!caught.anchor||!finite(physicalPoint?.x)||!finite(physicalPoint?.z))return{distanceM:Infinity,slack:false,canRelease:false,held};
  // Runtime points carry the support floor, not the eye or hand. A case left
  // upstairs cannot be reclaimed through the ceiling from matching x/z below.
  // Older callers without a height keep their original horizontal contract.
  if(physicalPoint.y!=null&&(!finite(physicalPoint.y)||Math.abs(caught.anchor.y-(physicalPoint.y+1))>1.25))return{distanceM:Infinity,slack:false,canRelease:false,held};
  const distanceM=Math.hypot(physicalPoint.x-caught.anchor.x,physicalPoint.z-caught.anchor.z);
  const slack=held||distanceM<=Math.max(.85,caught.initialDistance-.18);
  return{distanceM,slack,canRelease:distanceM<=CHAPEL_TAPE_DEMAND_REACH_M&&slack,held};
}
function released(state){
  return{...state,status:'released',progress:1,
    catch:state.catch.mode==='spatial'?{...state.catch,holder:'player',strainSeconds:0}:state.catch,
    spent:[...new Set([...state.spent,state.catch.doorId])]};
}
export function reduceChapelTapeDemand(raw,event={},context={}){
  const state=normalizeChapelTapeDemand(raw,context);
  // A counted fifth take is written before the fight. Only the actual win is
  // authority, including when a saved checkpoint is presented by a caller.
  if(!context.chapelWon||context.chapelRoute===false||!context.runId)return state;
  if(event.type==='arm')return state.status==='dormant'?{...state,status:'armed'}:state;
  if(event.type==='depart'){
    if(!Object.hasOwn(stages,event.route)||state.status==='dormant'||state.status==='complete')return state;
    return{...state,route:event.route,status:state.status==='armed'?'departing':state.status,departure:departure(event.departure,event.route)||state.departure};
  }
  if(event.type==='snapshot'&&state.route)return{...state,departure:departure(event.departure,state.route)||state.departure};
  if(event.type==='damage-applied'&&state.spill?.target&&event.damageId===state.spill.damageId&&!state.spill.applied){
    const needsRetake=event.needsRetake!==false;
    return{...state,spill:{...state.spill,applied:true,needsRetake,fulfilled:!needsRetake}};
  }
  if(event.type==='repair-status'&&state.spill?.applied&&event.damageId===state.spill.damageId&&!state.spill.fulfilled){
    if(event.needsRetake!==true&&event.needsRetake!==false)return state;
    return{...state,spill:{...state.spill,needsRetake:event.needsRetake,fulfilled:!event.needsRetake}};
  }
  if(event.type==='stay')return state.status==='dormant'?state:{...state,status:'armed',route:null,catch:null,departure:null,progress:0};
  if(event.type==='catch'&&chapelTapeDemandCanCatch(state,event.catch?.doorId)){
    const next=normalizeChapelTapeDemand({...state,status:'caught',catch:event.catch,progress:0},context);
    return next.status==='caught'?next:state;
  }
  if(event.type==='interact'&&state.status==='caught'&&state.catch?.mode==='spatial'&&!event.paused){
    return finite(event.distanceM)&&event.distanceM<=CHAPEL_TAPE_DEMAND_REACH_M&&event.distanceM>=0&&(state.catch.holder==='anchor'||event.slack===true)?released(state):state;
  }
  if(event.type==='strain'&&state.status==='caught'&&state.catch?.mode==='spatial'&&state.catch.holder==='player'&&!event.paused){
    const limit=chapelTapeDemandStrainSeconds(state),strainSeconds=Math.min(limit,state.catch.strainSeconds+clamp(event.seconds,0,.1));
    const lost=strainSeconds>=limit-1e-9;
    const failures=lost?Math.min(2,state.failures+1):state.failures;
    const caught={...state.catch,strainSeconds,holder:lost?'anchor':'player'};
    const spill=lost&&failures>=2&&!state.spill?spillRecord({damageId:spillDamageId(state.runId,caught.doorId),target:caught.damageTarget,
      anchor:caught.anchor,position:caught.position,group:caught.group,doorId:caught.doorId,wallYaw:caught.wallYaw,floor:caught.floor,kind:caught.kind},state.runId):state.spill;
    return{...state,failures,caseDamaged:failures>=1,spill,catch:caught};
  }
  if(event.type==='pull'&&state.status==='caught'&&state.catch?.mode!=='spatial'&&!event.paused){
    const seconds=clamp(event.seconds,0,.1),amount=state.progress+seconds/CHAPEL_TAPE_DEMAND_PULL_SECONDS,progress=amount>=1-1e-9?1:Math.min(1,amount);
    return progress>=1?released(state):{...state,progress};
  }
  if(event.type==='complete'&&state.status!=='dormant')return{...state,status:'complete',progress:1,
    catch:state.catch?.mode==='spatial'?{...state.catch,holder:'player',strainSeconds:0}:state.catch};
  if(event.type==='recover-missing-asset'&&state.status==='caught')return released(state);
  return state;
}
export function chapelTapeDemandVisible(state,{chapelWon=false,chapelRoute=true,runId=''}={}){
  const s=normalizeChapelTapeDemand(state,{runId});return chapelWon&&chapelRoute&&s.status!=='dormant'&&s.status!=='complete';
}
export function chapelTapeDemandBlocksProgress(state){return state?.status==='caught';}
export function chapelTapeDemandCrossesDoor(from,to,door){
  if(!from||!to||!['chapel-c17','front-main'].includes(door?.id)||!door.open)return false;
  const axis=door.widthAxis==='x'?'y':'x',plane=axis==='y'?door.cy:door.cx;
  const a=from[axis]-plane,b=to[axis]-plane;
  if(!finite(a)||!finite(b)||Math.abs(a-b)<=.01||!((a<0&&b>=0)||(a>0&&b<=0)||a===0&&b!==0))return false;
  const alongAxis=axis==='x'?'y':'x',cells=door.cells||door.volume?.cells;
  if(!Array.isArray(cells)||!cells.length)return false;
  const low=Math.min(...cells.map(cell=>cell[alongAxis])),high=Math.max(...cells.map(cell=>cell[alongAxis]))+1;
  const t=a===0?0:-a/(b-a),along=from[alongAxis]+(to[alongAxis]-from[alongAxis])*t;
  // Runtime feet use integer cell coordinates. Include the aperture's edge
  // cells already admitted by canStep, rather than leaving one bypass lane.
  return finite(along)&&along>=low-.01&&along<=high+.01;
}
export function chapelTapeDemandMove(state,{from,to,physicalFrom,physicalTo}={}){
  if(!chapelTapeDemandBlocksProgress(state))return{allowed:true,effortM:0};
  const anchor=state.catch?.anchor;if(!anchor||!physicalFrom||!physicalTo)return{allowed:true,effortM:0};
  if(state.catch.mode==='spatial'&&state.catch.holder==='anchor')return{allowed:true,effortM:0};
  const distance=p=>Math.hypot(p.x-anchor.x,p.z-anchor.z),a=distance(physicalFrom),b=distance(physicalTo);
  // Backing toward the snag slackens it. Walking away tensions it and puts
  // force into the strap, rather than silently deleting a movement input.
  const effortM=Math.max(0,b-a);
  if(state.catch.mode==='spatial'){
    const radius=Math.max(1.02,state.catch.initialDistance);
    return{allowed:b<=radius+.015||b<a-.005,effortM:b>radius+.015?effortM:0};
  }
  return{allowed:b<=1.02||b<a-.015,effortM:b>1.02?effortM:0};
}
export function chapelTapeDemandResume(raw,save){
  const runId=save?.run?.id,won=save?.encounters?.cleared?.includes('chapel');
  const state=normalizeChapelTapeDemand(raw,{runId});
  if(save?.run?.status!=='active'||!won||!state.departure||!['departing','caught','released'].includes(state.status))return null;
  if(save.chunkSurf?.finale?.route&&save.chunkSurf.finale.route!=='chapel')return null;
  if(save.endingCutscene||save.area==='source-space'||save.sourceIV?.runId===runId&&!save.sourceIV.exitReceipt?.delivered||save.endingWrongDoor?.runId===runId&&save.endingWrongDoor.status!=='returned')return null;
  return state;
}
