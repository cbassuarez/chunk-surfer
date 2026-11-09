import {SOURCE_CONNECTOR_CORRIDOR as C,corridorProgress,corridorParts} from '../data/source-connector-corridor.js';
import {continuationSegmentBoxDistanceSquared} from './source-continuation-physics.js';
import {continuationBodyAxis} from './source-continuation-portals.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const phases=new Set(['dormant','warning','lowering','settled']);
export const freshSourceConnectorCorridor=()=>({version:C.version,phase:'dormant',elapsed:0,strainStarted:false,strainElapsed:0,legacyPassed:false,blockedBy:null});
export function normalizeSourceConnectorCorridor(value,world={}){
  if(!value||![1,C.version].includes(value.version)){
    const passed=world.phase==='catch'||world.chartId===4&&corridorProgress(world)>17;
    return passed?{...freshSourceConnectorCorridor(),phase:'settled',elapsed:C.lowerSeconds,strainStarted:true,strainElapsed:C.strainSeconds,legacyPassed:true}:freshSourceConnectorCorridor();
  }
  const phase=phases.has(value.phase)?value.phase:'dormant';
  return{version:C.version,phase,elapsed:clamp(value.elapsed,0,phase==='warning'?C.warningSeconds:C.lowerSeconds),
    strainStarted:!!value.strainStarted,strainElapsed:value.version===1?clamp(value.strainElapsed,0,3.6)/3.6*C.strainSeconds:clamp(value.strainElapsed,0,C.strainSeconds),legacyPassed:!!value.legacyPassed,
    blockedBy:['player','hush'].includes(value.blockedBy)?value.blockedBy:null};
}
function capsule(actor,radius,height){
  if(!actor||(actor.chartId??0)!==4||actor.active===false)return null;
  const axis=continuationBodyAxis(actor),center=[actor.x,actor.feet+height/2,actor.z],half=height/2-radius;
  if(!center.every(Number.isFinite))return null;
  return{a:center.map((v,i)=>v-axis[i]*half),b:center.map((v,i)=>v+axis[i]*half),radius};
}
export function corridorUnsafeSweep(before,after,{player,hush,bodyRadius=.22,hushRadius=.26,bodyHeight=1.9}={}){
  const actors=[['player',capsule(player,bodyRadius,bodyHeight)],['hush',capsule(hush,hushRadius,bodyHeight)]];
  if(!actors.some(([,body])=>body))return null;
  const old=new Map(corridorParts({corridor:before}).map(p=>[p.id,p]));
  for(const part of corridorParts({corridor:after})){
    const from=old.get(part.id);if(!from)continue;
    if(['minX','maxX','minY','maxY','minZ','maxZ'].every(k=>Math.abs(from[k]-part[k])<1e-9))continue;
    const sweep={minX:Math.min(from.minX,part.minX),maxX:Math.max(from.maxX,part.maxX),minY:Math.min(from.minY,part.minY),maxY:Math.max(from.maxY,part.maxY),minZ:Math.min(from.minZ,part.minZ),maxZ:Math.max(from.maxZ,part.maxZ)};
    for(const [name,c]of actors)if(c&&continuationSegmentBoxDistanceSquared(c.a,c.b,sweep)<(c.radius+.006)**2)return name;
  }
  return null;
}
export function advanceSourceConnectorCorridor(value,{dt=0,player,hush,frozen=false,events=[]}={}){
  const eventStart=events.length;
  const normalized=normalizeSourceConnectorCorridor(value,player),valid=value&&Object.keys(value).length===Object.keys(normalized).length&&Object.keys(normalized).every(k=>value[k]===normalized[k]),
    before=valid?value:normalized,next={...before,blockedBy:null};
  if(frozen||!(dt>0))return before;
  const progress=corridorProgress(player),active=(player?.chartId??0)===4&&player.phase!=='catch'&&!player.fall&&!player.recovery
    &&Number.isFinite(player.x)&&player.x>=C.floorMinX&&player.x<=C.floorMaxX&&progress>=0&&progress<=C.length
    &&Math.abs((player.feet??0)-C.feet)<.04,s=active?progress:-Infinity;
  if(active&&s>=17&&next.phase!=='settled'){
    // A real airborne/edge shortcut may arrive beyond the mechanism before
    // its approach event. Spend it openly, with the cabinet raised to one
    // side, so a following actor can replay the same physical crossing.
    next.phase='settled';next.elapsed=C.lowerSeconds;next.legacyPassed=true;
    next.strainStarted=true;next.strainElapsed=C.strainSeconds;
    events.push({type:'corridor-passed',reason:'supported-shortcut',chartId:4,position:{x:player.x,y:player.feet,z:player.z}});
  }
  if(!next.strainStarted&&s>=C.strainAt){next.strainStarted=true;events.push({type:'corridor-strain',chartId:4,position:{x:C.x,y:C.feet+2,z:C.startZ-3}});}
  if(next.strainStarted)next.strainElapsed=Math.min(C.strainSeconds,next.strainElapsed+dt);
  if(next.phase==='dormant'&&s>=C.warningAt){next.phase='warning';next.elapsed=0;events.push({type:'corridor-warning',chartId:4,position:{x:C.x,y:C.feet+2,z:-77}});}
  if(next.phase==='warning'){next.elapsed=Math.min(C.warningSeconds,next.elapsed+dt);if(next.elapsed+1e-8>=C.warningSeconds){next.phase='lowering';next.elapsed=0;}}
  else if(next.phase==='lowering'){next.elapsed=Math.min(C.lowerSeconds,next.elapsed+dt);if(next.elapsed+1e-8>=C.lowerSeconds){next.phase='settled';next.elapsed=C.lowerSeconds;events.push({type:'corridor-settled',chartId:4,position:{x:C.x,y:C.feet,z:-77}});}}
  if(Object.keys(before).every(k=>before[k]===next[k]))return before;
  const blockedBy=corridorUnsafeSweep(before,next,{player,hush});
  if(blockedBy){
    // Hold at the last physically clear frame. Neither body is pushed through
    // a floor, crushed, relocated or made to wait by an invisible movement rule.
    events.splice(eventStart);
    return{...before,blockedBy};
  }
  return next;
}
