import {ARCHIPELAGO_ISLANDS, SOURCE_III_ARCHIPELAGO} from '../data/source-continuation-archipelago.js';

const ids=new Set(ARCHIPELAGO_ISLANDS.map(island=>island.id));
export const freshArchipelagoProgress=()=>({version:1,visited:[],activeSeconds:0,travelMetres:0,chases:[]});
export function normalizeArchipelagoProgress(value){
  const base=freshArchipelagoProgress();
  if(!value||value.version!==1)return base;
  const positive=n=>Number.isFinite(n)?Math.max(0,n):0;
  return{...base,visited:[...new Set((Array.isArray(value.visited)?value.visited:[]).filter(id=>ids.has(id)))],
    activeSeconds:positive(value.activeSeconds),travelMetres:positive(value.travelMetres),
    chases:[...new Set((Array.isArray(value.chases)?value.chases:[]).filter(id=>SOURCE_III_ARCHIPELAGO.chaseSections.some(section=>section.id===id)))]};
}
export function archipelagoChase(state){
  if(state.phase!=='catch'||state.direction==='reverse')return null;
  const visited=state.expedition?.visited||[];
  return SOURCE_III_ARCHIPELAGO.chaseSections.find(section=>visited.includes(section.fromIslandId)&&!visited.includes(section.toIslandId))||null;
}
export function archipelagoExitReady(state){
  return state.direction==='reverse'||state.completed||SOURCE_III_ARCHIPELAGO.mainIslandIds.every(id=>state.expedition?.visited.includes(id));
}
export function advanceArchipelagoProgress(state,{dt=0,travel=0,events=[]}={}){
  if(state.phase!=='catch'||state.chartId!==0||state.recovery)return;
  const progress=state.expedition;
  progress.activeSeconds+=dt;progress.travelMetres+=travel;
  if(state.fall)return;
  const previous=archipelagoChase(state);
  for(const island of ARCHIPELAGO_ISLANDS){
    if(progress.visited.includes(island.id)||Math.abs(state.feet-island.feet)>.4)continue;
    const inset=.6;
    if(state.x<island.minX+inset||state.x>island.maxX-inset||state.z<island.minZ+inset||state.z>island.maxZ-inset)continue;
    progress.visited.push(island.id);
    events.push({type:'island-arrival',id:island.id,cluster:island.cluster,position:{x:state.x,y:state.feet,z:state.z}});
  }
  const chase=archipelagoChase(state);
  if(chase&&!progress.chases.includes(chase.id)){
    progress.chases.push(chase.id);
    state.hush.notice=Math.max(state.hush.notice,2.5);state.hush.mode='notice';
    events.push({type:'hush-warning',section:chase.id,position:{x:state.hush.x,y:state.hush.feet,z:state.hush.z}});
  }
  if(previous&&!chase)events.push({type:'pursuit-shelter',section:previous.id});
}
