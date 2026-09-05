import { PLANT_FITTING_IDS } from './plant-isolation.js';

export const PLANT_INCIDENT_PHASE = Object.freeze({
  DORMANT:'dormant', HISSING:'hissing', TOOL_REQUIRED:'tool-required',
  ISOLATING:'isolating', SEALED:'sealed',
});

export const PLANT_TOOL = Object.freeze({SPANNER:'spanner',STILLSON:'stillson'});

const fresh = () => ({
  schema:1,phase:PLANT_INCIDENT_PHASE.DORMANT,triggerTakeOrdinal:0,
  spannerOwned:false,heavyMode:'rack',heavyPosition:null,
  activeTool:null,isolationStartedAt:0,haulScrapeMetres:0,
  // WHERE THE FITTINGS WERE WHEN YOU WALKED OFF.
  //
  // The scene can be left now, and a player who has done most of a repair and
  // hits Escape should not be starting again. Travel per fitting, in radians,
  // and how many times the bypass has been opened. Everything else about the
  // tree is derived from the tool, so this is the whole of it.
  valveRadians:null,valveVents:0,
});

let state=fresh();

const point=(value)=>Number.isFinite(Number(value?.x))&&Number.isFinite(Number(value?.y))
  ?{x:Math.round(Number(value.x)),y:Math.round(Number(value.y))}:null;

export function normalizePlantIncident(saved={}){
  if(!saved||typeof saved!=='object')saved={};
  const phase=Object.values(PLANT_INCIDENT_PHASE).includes(saved.phase)?saved.phase:PLANT_INCIDENT_PHASE.DORMANT;
  const heavyMode=['rack','dragging','dropped','used'].includes(saved.heavyMode)?saved.heavyMode:'rack';
  return{
    schema:1,phase,triggerTakeOrdinal:[2,3].includes(Number(saved.triggerTakeOrdinal))?Number(saved.triggerTakeOrdinal):0,
    spannerOwned:!!saved.spannerOwned,heavyMode:phase===PLANT_INCIDENT_PHASE.SEALED&&heavyMode==='dragging'?'used':heavyMode,
    heavyPosition:point(saved.heavyPosition),activeTool:Object.values(PLANT_TOOL).includes(saved.activeTool)?saved.activeTool:null,
    isolationStartedAt:0,haulScrapeMetres:Math.max(0,Number(saved.haulScrapeMetres)||0),
    valveRadians:radians(saved.valveRadians),valveVents:Math.max(0,Math.floor(Number(saved.valveVents)||0)),
  };
}

// Only finite, non-negative numbers, and only for fittings that exist. A saved
// game from before the tree, or a hand-edited one, simply starts the repair.
function radians(value){
  if(!value||typeof value!=='object')return null;
  const out={};
  for(const id of PLANT_FITTING_IDS){
    const at=Number(value[id]);
    if(Number.isFinite(at)&&at>0)out[id]=at;
  }
  return Object.keys(out).length?out:null;
}

export function loadPlantIncident(saved={}){state=normalizePlantIncident(saved);return plantIncidentState();}
export function resetPlantIncident(){state=fresh();return plantIncidentState();}
export function plantIncidentState(){return{...state,heavyPosition:state.heavyPosition?{...state.heavyPosition}:null};}
export function savePlantIncident(){return plantIncidentState();}
export function plantRecordingBlocked(){return ![PLANT_INCIDENT_PHASE.DORMANT,PLANT_INCIDENT_PHASE.SEALED].includes(state.phase);}
export function plantHissing(){return plantRecordingBlocked();}
export function hasPlantSpanner(){return state.spannerOwned;}
export function heavyWrenchDragging(){return state.heavyMode==='dragging';}

export function collectPlantSpanner(){
  if(state.spannerOwned)return false;state.spannerOwned=true;return true;
}

export function triggerPlantIncident({takeOrdinal=0,playerGenerated=false,spoiled=false}={}){
  if(state.phase!==PLANT_INCIDENT_PHASE.DORMANT||!spoiled||!playerGenerated||![2,3].includes(Number(takeOrdinal)))return false;
  state.phase=PLANT_INCIDENT_PHASE.HISSING;state.triggerTakeOrdinal=Number(takeOrdinal);
  return true;
}

export function acknowledgePlantToolNeed(){
  if(state.phase===PLANT_INCIDENT_PHASE.HISSING)state.phase=PLANT_INCIDENT_PHASE.TOOL_REQUIRED;
  return state.phase;
}

export function gripHeavyWrench(position){
  if(state.phase===PLANT_INCIDENT_PHASE.SEALED||state.heavyMode==='used')return false;
  const at=point(position);if(!at)return false;
  state.heavyMode='dragging';state.heavyPosition=at;return true;
}

export function moveHeavyWrench(position,{distanceMetres=0}={}){
  if(state.heavyMode!=='dragging')return{moved:false,scrape:false};
  const at=point(position);if(!at)return{moved:false,scrape:false};
  state.heavyPosition=at;state.haulScrapeMetres+=Math.max(0,Number(distanceMetres)||0);
  const scrape=state.haulScrapeMetres>=1.5;
  if(scrape)state.haulScrapeMetres%=1.5;
  return{moved:true,scrape,position:{...at}};
}

export function dropHeavyWrench(position=state.heavyPosition){
  if(state.heavyMode!=='dragging')return false;
  state.heavyMode='dropped';state.heavyPosition=point(position)||state.heavyPosition;return true;
}

export function beginPlantIsolation(tool,now=0){
  if(!plantRecordingBlocked())return false;
  if(tool===PLANT_TOOL.SPANNER&&!state.spannerOwned)return false;
  if(tool===PLANT_TOOL.STILLSON&&state.heavyMode!=='dragging')return false;
  state.phase=PLANT_INCIDENT_PHASE.ISOLATING;state.activeTool=tool;state.isolationStartedAt=Math.max(0,Number(now)||0);return true;
}

export function completePlantIsolation(){
  if(state.phase!==PLANT_INCIDENT_PHASE.ISOLATING)return false;
  if(state.activeTool===PLANT_TOOL.STILLSON)state.heavyMode='used';
  state.phase=PLANT_INCIDENT_PHASE.SEALED;state.isolationStartedAt=0;
  state.valveRadians=null;state.valveVents=0;return true;
}

// LEAVING IS ALLOWED, AND IT COSTS THE HOLD RATHER THAN THE RUN.
//
// The phase stays ISOLATING so the header is still the thing to go back to. The
// fittings keep the travel they had, less a lump for having been left with
// nobody on them — which is the same rule as the backslide inside the scene,
// charged once for the walk away.
export function suspendPlantIsolation(tree=null,{slack=0.35}={}){
  if(state.phase!==PLANT_INCIDENT_PHASE.ISOLATING)return false;
  const fittings=tree?.fittings;
  if(!fittings){state.valveRadians=null;return true;}
  const kept={};
  for(const id of PLANT_FITTING_IDS){
    const at=Math.max(0,Number(fittings[id]?.radians)||0)*(1-Math.max(0,Math.min(1,slack)));
    if(at>0)kept[id]=at;
  }
  state.valveRadians=Object.keys(kept).length?kept:null;
  state.valveVents=Math.max(0,Math.floor(Number(tree?.vents)||0));
  return true;
}

export function plantValveResume(){
  return state.valveRadians?{radians:{...state.valveRadians},vents:state.valveVents}:null;
}

export function haulHushPose({trail=[],player,minMetres=8,maxMetres=14,cellsPerMetre=2}={}){
  if(!player||!trail.length)return null;
  let travelled=0,last=player;
  for(let i=trail.length-1;i>=0;i--){
    const candidate=trail[i],step=Math.hypot(last.x-candidate.x,last.y-candidate.y)/cellsPerMetre;
    travelled+=step;last=candidate;
    if(travelled>=minMetres)return{...candidate,distanceMetres:Math.min(maxMetres,travelled)};
  }
  return null;
}
