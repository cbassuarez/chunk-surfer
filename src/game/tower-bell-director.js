import { ELLERY_BELLS, TOWER_LURE_SCORE, scheduleRow } from '../data/bell-tower.js';

export const SOURCE_BELL_WASH_SECONDS=12;
const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const otherStroke=(stroke)=>stroke==='hand'?'back':'hand';
const dbGain=(db)=>10**(-Math.max(0,Number(db)||0)/20);

function scoreTransport(score=TOWER_LURE_SCORE){
  let atMs=0,rowIndex=0,stroke='hand';const strikes=[];
  const tenor=score.find((entry)=>entry.type==='toll');
  for(let index=0;index<(tenor?.strokes||0);index++){
    strikes.push({bell:tenor.bell,stroke:index%2?'back':'hand',rowIndex:-1,place:7,atMs:atMs+720,section:tenor.id});atMs+=1780;
  }
  for(const section of score.filter((entry)=>entry.type==='rows'))for(const row of section.source){
    const scheduled=scheduleRow(row,stroke,atMs,rowIndex);
    strikes.push(...scheduled.strikes.map((entry)=>({...entry,section:section.id})));
    atMs=scheduled.nextRowAtMs;rowIndex+=1;stroke=otherStroke(stroke);
  }
  const loop=score.find((entry)=>entry.type==='loop');
  return{strikes,endMs:atMs,rowIndex,stroke,loop};
}

export function towerBellSpatialFrame({source,listener,occlusionDb=0,mix=1}={}){
  const sx=Number(source?.x)||0,sz=Number(source?.z)||0,sy=Number(source?.y)||0;
  const lx=Number(listener?.x)||0,lz=Number(listener?.z)||0,ly=Number(listener?.y)||0;
  const horizontal=Math.hypot(sx-lx,sz-lz),vertical=Math.abs(sy-ly),crossFloor=vertical>2.6;
  const distanceGain=1/(1+Math.pow(horizontal/28,1.35));
  const floorLossDb=crossFloor?15+Math.max(0,vertical-5)*1.2:0;
  const clarity=clamp01(distanceGain*dbGain(Number(occlusionDb)+floorLossDb)*2.4);
  const bearing=Math.atan2(sx-lx,-(sz-lz)),yaw=Number(listener?.yaw)||0;
  const relative=Math.atan2(Math.sin(bearing-yaw),Math.cos(bearing-yaw));
  return{
    gain:clamp01((.055+.945*distanceGain)*dbGain(Number(occlusionDb)+floorLossDb)*clamp01(mix)),
    transmission:clamp01((.06+(crossFloor?.34:.16)+(1-clarity)*.22)*Math.pow(clamp01(mix),.58)),
    pan:Math.max(-.92,Math.min(.92,Math.sin(relative))),
    lowpassHz:crossFloor?650+clarity*1250:900+clarity*11100,
    distance:horizontal,crossFloor,floorLossDb,occlusionDb:Number(occlusionDb)||0,mix:clamp01(mix),
  };
}

export function createTowerBellDirector({
  audio=null,bells=ELLERY_BELLS,score=TOWER_LURE_SCORE,source=null,sourceSpatial=null,
  emitAcousticEvent=()=>{},now=null,
}={}){
  const base=scoreTransport(score);let timeline=[...base.strikes],loopEnd=base.endMs,loopRow=base.rowIndex,loopStroke=base.stroke;
  let cursor=0,clockMs=0,started=false,suspended=false,lastSourceMs=null,mode='world',washMs=0,transitionProgress=0,lastFrame=towerBellSpatialFrame({source,listener:source,mix:1});
  let frozenSourceFrame=null;
  function appendLoop(){
    const rows=base.loop?.source||[];if(!rows.length)return false;
    for(const row of rows){const scheduled=scheduleRow(row,loopStroke,loopEnd,loopRow);timeline.push(...scheduled.strikes.map((entry)=>({...entry,section:base.loop.id})));loopEnd=scheduled.nextRowAtMs;loopRow+=1;loopStroke=otherStroke(loopStroke);}
    return true;
  }
  function ensureThrough(target){let guard=0;while(loopEnd<=target&&guard++<64&&appendLoop()){} }
  function mixForMode(){
    if(mode==='source_wash')return 1-clamp01(washMs/(SOURCE_BELL_WASH_SECONDS*1000));
    if(mode==='source_muted')return 0;
    if(mode==='transition')return clamp01((transitionProgress-.35)/.65);
    return mode==='stood'?0:1;
  }
  function emit(record){
    audio?.strike?.(record,bells[record.bell-1],{delaySec:0});
    emitAcousticEvent({
      kind:'bell_change_strike',source:{kind:'environment',id:`tower-bell-${record.bell}`},spatial:sourceSpatial,
      semantics:{audibleToHush:true,audibleToMonitor:true,audibleInWorld:true,canBeMimicked:false,canSpoilTake:false,family:'bell',tags:[record.stroke,record.section]},
      provenance:{system:'tower-bell-director',bell:record.bell,stroke:record.stroke,rowIndex:record.rowIndex,place:record.place},
    });
  }
  function start({offsetMs=0,nextMode='world',washElapsedMs=0,restoredTransitionProgress=0}={}){
    clockMs=Math.max(0,Number(offsetMs)||0);mode=nextMode;started=true;
    suspended=false;lastSourceMs=typeof now==='function'?Number(now())||0:null;
    washMs=mode==='source_muted'?SOURCE_BELL_WASH_SECONDS*1000:Math.max(0,Math.min(SOURCE_BELL_WASH_SECONDS*1000,Number(washElapsedMs)||0));
    transitionProgress=clamp01(restoredTransitionProgress);
    ensureThrough(clockMs+1000);cursor=timeline.findIndex((entry)=>entry.atMs>=clockMs-60);if(cursor<0)cursor=timeline.length;
    audio?.start?.();return snapshot();
  }
  function tick(dt,{listener=null,occlusionDb=0}={}){
    if(!started||suspended)return snapshot();
    let delta=Math.max(0,Number(dt)||0)*1000;
    if(typeof now==='function'){
      const sourceMs=Number(now())||0;if(lastSourceMs!=null)delta=Math.max(0,sourceMs-lastSourceMs);lastSourceMs=sourceMs;
    }
    clockMs+=delta;
    if(mode==='source_wash'){washMs+=delta;if(washMs>=SOURCE_BELL_WASH_SECONDS*1000)mode='source_muted';}
    ensureThrough(clockMs+1000);
    const mix=mixForMode();
    if(mode==='source_wash'||mode==='source_muted'){
      frozenSourceFrame||=towerBellSpatialFrame({source,listener:listener||source,occlusionDb,mix:1});
      lastFrame={...frozenSourceFrame,gain:frozenSourceFrame.gain*mix,transmission:frozenSourceFrame.transmission*Math.pow(mix,.58),mix};
    }else lastFrame=towerBellSpatialFrame({source,listener:listener||source,occlusionDb,mix});
    audio?.setWorldMix?.(lastFrame);
    while(cursor<timeline.length&&timeline[cursor].atMs<=clockMs){const record=timeline[cursor++];if(record.atMs>=clockMs-Math.max(80,delta+20)&&mix>.005)emit(record);}
    return snapshot();
  }
  function enterSource(){mode='source_wash';washMs=0;frozenSourceFrame={...lastFrame,mix:1};return snapshot();}
  function setTransitionProgress(value){mode='transition';transitionProgress=clamp01(value);frozenSourceFrame=null;return snapshot();}
  function suspend(){if(!started||suspended)return snapshot();suspended=true;lastSourceMs=typeof now==='function'?Number(now())||0:null;return snapshot();}
  function resume(){if(!started||!suspended)return snapshot();suspended=false;lastSourceMs=typeof now==='function'?Number(now())||0:null;return snapshot();}
  function handoff(){started=false;suspended=false;return{elapsedMs:clockMs,mode,frame:lastFrame};}
  function stand(){mode='stood';started=false;audio?.setWorldMix?.({gain:0,pan:lastFrame.pan,lowpassHz:lastFrame.lowpassHz},.3);}
  function destroy({cut=true}={}){started=false;if(cut)audio?.destroy?.();}
  function snapshot(){return{started,suspended,elapsedMs:clockMs,mode,washMs,transitionProgress,mix:mixForMode(),frame:lastFrame};}
  return{start,tick,suspend,resume,enterSource,setTransitionProgress,handoff,stand,destroy,snapshot,maskingDb:()=>mixForMode()*(audio?.maskingDb?.()||0)};
}
