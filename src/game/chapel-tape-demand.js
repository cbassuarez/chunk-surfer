// The building can catch the case. It never owns, edits or reconstructs the
// physical tape: this controller has no recording, audio or inventory imports.
export const CHAPEL_TAPE_DEMAND_FLAG='chapelTapeDemand.checkpoint';
export const CHAPEL_TAPE_DEMAND_PACK='/assets/chapel-tape-demand.glb';
export const CHAPEL_TAPE_DEMAND_COPY='GIVE ME THE TAPES';
export const CHAPEL_TAPE_DEMAND_PULL_SECONDS=1.65;
const statuses=new Set(['dormant','armed','departing','caught','released','complete']);
const stages={surfaced:new Set(['public-doors','service-road']),inversion:new Set(['door','at-door','rescue','wrong-door-returned'])};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const point=value=>value&&finite(value.x)&&finite(value.y)&&Math.abs(value.x)<100000&&Math.abs(value.y)<100000?{x:value.x,y:value.y}:null;
const world=value=>value&&finite(value.x)&&finite(value.y)&&finite(value.z)?{x:value.x,y:value.y,z:value.z}:null;
const view=value=>value&&finite(value.yaw)&&finite(value.pitch)?{yaw:value.yaw,pitch:clamp(value.pitch,-.62,.62)}:null;
export function freshChapelTapeDemand(runId=''){
  return{schema:1,runId:String(runId||''),status:'dormant',route:null,progress:0,catch:null,departure:null};
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
  const caught=raw.catch&&['chapel-c17','front-main'].includes(raw.catch.doorId)&&world(raw.catch.anchor)&&point(raw.catch.position)
    ?{doorId:raw.catch.doorId,anchor:world(raw.catch.anchor),position:point(raw.catch.position),group:String(raw.catch.group||''),wallYaw:finite(raw.catch.wallYaw)?raw.catch.wallYaw:0,view:view(raw.catch.view)}:null;
  let status=raw.status;
  if(['departing','caught','released'].includes(status)&&!route)status='armed';
  // Damaged saves cannot restore an invisible tether or an impossible lock.
  if(status==='caught'&&!caught)status='departing';
  return{...base,status,route,progress:status==='released'||status==='complete'?1:clamp(raw.progress,0,.99999),catch:caught,departure:departure(raw.departure,route)};
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
  if(event.type==='stay')return state.status==='dormant'?state:{...state,status:'armed',route:null,catch:null,departure:null,progress:0};
  if(event.type==='catch'&&state.status==='departing'){
    const next=normalizeChapelTapeDemand({...state,status:'caught',catch:event.catch,progress:0},context);
    return next.status==='caught'?next:state;
  }
  if(event.type==='pull'&&state.status==='caught'&&!event.paused){
    const seconds=clamp(event.seconds,0,.1),amount=state.progress+seconds/CHAPEL_TAPE_DEMAND_PULL_SECONDS,progress=amount>=1-1e-9?1:Math.min(1,amount);
    return{...state,progress,status:progress>=1?'released':'caught'};
  }
  if(event.type==='complete'&&state.status!=='dormant')return{...state,status:'complete',progress:1};
  if(event.type==='recover-missing-asset'&&state.status==='caught')return{...state,status:'released',progress:1};
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
  const distance=p=>Math.hypot(p.x-anchor.x,p.z-anchor.z),a=distance(physicalFrom),b=distance(physicalTo);
  // Backing toward the snag slackens it. Walking away tensions it and puts
  // force into the strap, rather than silently deleting a movement input.
  const effortM=Math.max(0,b-a);
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
