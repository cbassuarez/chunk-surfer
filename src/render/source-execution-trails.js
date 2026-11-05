// A short evaluation through authored code, caused by an actual world event.
// No camera, wall clock, frame history, random generator or synthetic clause.
import {continuationDoors} from '../data/source-continuation.js';

export const SOURCE_EXECUTION_DURATION=4.8;
export const SOURCE_EXECUTION_LIMIT=8;
const TAIL=.16,finite=Number.isFinite,named=value=>typeof value==='string'&&value.trim().length>0;
const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,finite(value)?value:lo));
const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
const chart=value=>Number.isInteger(value)&&value>=0?value:0;
const vector=value=>Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value).slice(0,3):[value?.x,value?.y??value?.feet,value?.z];
const validPoint=value=>{const point=vector(value);return point.length===3&&point.every(finite)?point:null;};
const recent=(at,clock,duration=SOURCE_EXECUTION_DURATION)=>finite(at)&&finite(clock)&&at>=0&&clock>=at&&clock-at<duration;
const newest=events=>events.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id))[0]||null;

export function sourceContinuationExecutionEvent(state={}){
  if(state.status!=='active'||!finite(state.elapsed))return null;
  const events=[],currentChart=chart(state.chartId),phase=state.phase;
  for(const door of continuationDoors()){
    const motion=state.doorMotion?.[door.id];
    if((door.chartId??0)!==currentChart||door.phase!==phase||!recent(motion?.startedAt,state.elapsed))continue;
    if(!finite(motion.from)||!finite(motion.to)||!finite(motion.duration)||motion.duration<=0||motion.from===motion.to)continue;
    const origin=validPoint(door);if(!origin)continue;
    events.push({id:`door:${door.id}:${motion.startedAt}`,kind:'door',doorId:door.id,at:motion.startedAt,origin,chartId:currentChart,phase,
      ...(named(door.portalId)?{portalId:door.portalId}:{})});
  }
  const fold=state.lastFold;
  if(named(fold?.id)&&recent(fold.at,state.elapsed)&&Number.isInteger(fold.toChartId)&&fold.toChartId===currentChart){
    const origin=validPoint(fold.to);
    if(origin)events.push({id:`fold:${fold.id}:${fold.serial??0}:${fold.at}`,kind:'fold',portalId:fold.id,at:fold.at,origin,chartId:currentChart,phase});
  }
  return newest(events);
}

export function sourceReceiptExecutionEvent(receipts,clock,{scope='source',chartId=0,phase=null}={}){
  if(!Array.isArray(receipts)||!finite(clock))return null;
  const events=[];
  for(const receipt of receipts){
    if(!receipt||receipt.suppressed||receipt.active===false||!recent(receipt.at,clock))continue;
    const kind=receipt.type||receipt.kind,origin=validPoint(receipt.position||receipt.origin);
    if(!named(kind)||!origin||!named(receipt.id))continue;
    events.push({id:`${scope}:${receipt.id}`,kind,at:receipt.at,origin,chartId:chart(chartId),phase});
  }
  return newest(events);
}

export function sourceExecutionEnvelope(event,clock,{order=0,count=1,reducedMotion=false,duration=SOURCE_EXECUTION_DURATION}={}){
  const total=clamp(duration,.05,SOURCE_EXECUTION_DURATION),number=Math.round(clamp(count,1,SOURCE_EXECUTION_LIMIT)),index=Math.round(clamp(order,0,number-1)),
    meta={phase:0,gain:0,tail:TAIL,reducedMotion:!!reducedMotion,eventId:named(event?.id)?event.id:'',order:index};
  if(!named(event?.id)||event.active===false||!recent(event.at,clock,total))return meta;
  if(reducedMotion)return{...meta,phase:.5,gain:.32};
  const start=number>1?total*.58*index/(number-1):0,span=number>1?total*.42:total,local=(clock-event.at-start)/span;
  if(local<0||local>=1)return meta;
  return{...meta,phase:local,gain:smooth(0,.13,local)*(1-smooth(.65,1,local))};
}

export function sourceExecutionParameters(meta){
  if(!meta||!finite(meta.gain)||meta.gain<=0)return new Float32Array([0,0,TAIL,0]);
  return new Float32Array([clamp(meta.phase),clamp(meta.gain),clamp(meta.tail??TAIL,.04,.5),meta.reducedMotion?1:0]);
}

function anchor(part){
  const m=part?.matrix;
  return m?.length===16&&Array.from(m).every(finite)?validPoint([m[12],m[13],m[14]]):validPoint(part);
}
function plane(part){
  if(['floor','wall','ceiling'].includes(part.sourceExecutionPlane))return part.sourceExecutionPlane;
  if(part.physicalKind==='surface')return'floor';
  const hint=[part.role,part.parserRole,part.construction,part.id,part.mesh].join(' ');
  if(/ceiling|vault|oculus|overhead|roof|lintel/.test(hint))return'ceiling';
  return part.physicalKind==='solid'||/wall|column|pier|brace|scope|frame|door|jamb|arch/.test(hint)?'wall':'floor';
}
function matchesEvent(part,event){
  if(named(event.doorId)&&part.realDoorId===event.doorId)return true;
  const id=event.portalId;if(!named(id))return false;
  const scope=part.parserScope;
  return [part.realPortalId,part.parserPortalId,part.portalId,typeof scope==='string'?scope:null,scope?.portalId,scope?.id].includes(id);
}
const distance=(a,b)=>Math.hypot(...a.map((value,k)=>value-b[k]));

export function sourceExecutionTrailFrame(parts,event,{clock=0,reducedMotion=false,eligible=null,limit=SOURCE_EXECUTION_LIMIT,duration=SOURCE_EXECUTION_DURATION}={}){
  const supplied=Array.isArray(parts)?parts:[],input=supplied.some(p=>p&&Object.hasOwn(p,'sourceExecution'))
      ?supplied.map(part=>{if(!part||!Object.hasOwn(part,'sourceExecution'))return part;const{sourceExecution,...clean}=part;return clean;}):supplied,
    cap=Math.floor(clamp(limit,0,SOURCE_EXECUTION_LIMIT)),origin=validPoint(event?.origin),
    diagnostics={active:false,eventId:named(event?.id)?event.id:null,selected:0,lit:0,limit:cap,reducedMotion:!!reducedMotion};
  if(!cap||!origin||!named(event?.id)||event.active===false||!recent(event.at,clock,clamp(duration,.05,SOURCE_EXECUTION_DURATION)))return{props:input,diagnostics};
  const candidates=[],seen=new Set();
  for(let index=0;index<input.length;index++){
    const part=input[index];
    if(!part||!named(part.id)||seen.has(part.id)||part.character||part.playerBody||part.player===true||part.restBody||part.sourceCodeDetached===true
      ||chart(part.chartId)!==chart(event.chartId)||event.phase&&named(part.phase||part.region)&&(part.phase||part.region)!==event.phase
      ||typeof eligible==='function'&&!eligible(part))continue;
    const point=anchor(part);if(!point)continue;
    const near=distance(point,origin),preferred=matchesEvent(part,event);
    if(near>64&&!preferred)continue;
    seen.add(part.id);candidates.push({part,index,point,near,preferred,plane:plane(part)});
  }
  candidates.sort((a,b)=>Number(b.preferred)-Number(a.preferred)||a.near-b.near||a.part.id.localeCompare(b.part.id));
  const distinct=[],addresses=new Set();
  for(const row of candidates){const key=row.point.map(n=>Math.round(n/.35)).join(':');if(addresses.has(key))continue;addresses.add(key);distinct.push(row);}
  // Start on the nearest relevant call, then traverse available surface kinds.
  // A small preference radius keeps a distant ceiling from winning over the
  // local wall merely to complete an arbitrary decorative pattern.
  const selected=[],remaining=[...distinct],planes=['floor','wall','ceiling'];
  while(remaining.length&&selected.length<cap){
    const desired=planes[selected.length%planes.length],best=remaining[0],
      offset=remaining.findIndex(row=>row.plane===desired&&row.preferred===best.preferred&&row.near<=best.near+16),take=offset>=0?offset:0;
    selected.push(remaining.splice(take,1)[0]);
  }
  const result=[...input];
  selected.forEach((row,order)=>{
    const sourceExecution=sourceExecutionEnvelope(event,clock,{order,count:selected.length,reducedMotion,duration});
    result[row.index]={...row.part,sourceExecution};if(sourceExecution.gain>0)diagnostics.lit++;
  });
  diagnostics.active=selected.length>0;diagnostics.selected=selected.length;
  return{props:result,diagnostics};
}
