// A reflective/transflective LCD in the navigator's brushed aluminium. It is
// a sibling of the map's VFD glass, with its own gasket, polarizer and ink.
import { uiDrawHardware } from './ui.js';
import { paintNavigatorTelemetry } from './navigator-lcd.js';
export { navigatorTelemetryLayout, paintNavigatorTelemetry } from './navigator-lcd.js';
import { sampleNavigatorLcdMotion } from './navigator-lcd-motion.js';
import { hardwareMotionReduced } from './hardware-material.js';
import { MONITOR_THRESHOLDS, monitorBandForDb } from '../audio/monitor.js';
import { takeSlotState } from './field-deck.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const rank={normal:0,'mid-hot':1,hot:2};

export function navigatorTelemetryState(telemetry={}){
  const total=clamp(Math.floor(finite(telemetry.total,5)),1,12);
  const takes=clamp(Math.floor(finite(telemetry.takes)),0,total);
  const injuries=clamp(Math.floor(finite(telemetry.injuries)),0,99);
  const snapshot=telemetry.monitor;
  const available=!!snapshot&&typeof snapshot.db==='number'&&Number.isFinite(snapshot.db);
  const clipped=available&&snapshot.clipped===true;
  const db=available?clamp(snapshot.db,-96,0):-96;
  // The host may legitimately raise the displayed exposure's segment floor.
  // Preserve that submitted state, including peak hold, without sampling score
  // audio or adding ornamental movement to a silent input.
  const segments=available?(clipped?MONITOR_THRESHOLDS.length
    :clamp(Math.floor(finite(snapshot.segments,MONITOR_THRESHOLDS.filter(t=>db>=t).length)),0,MONITOR_THRESHOLDS.length)):0;
  const shownDb=segments?Math.max(db,MONITOR_THRESHOLDS[segments-1]):db;
  const measuredBand=monitorBandForDb(shownDb);
  const band=available&&(rank[snapshot.band]??0)>(rank[measuredBand]??0)?snapshot.band:measuredBand;
  const peakDb=available?Math.max(shownDb,clamp(finite(snapshot.peakDb,db),-96,0)):-96;
  const peakSegments=available?MONITOR_THRESHOLDS.filter(t=>peakDb>=t).length:0;
  const takesVisible=telemetry.takesVisible!==false;
  return{takesVisible,takes:takesVisible?takes:0,total:takesVisible?total:0,slots:takesVisible?takeSlotState(takes,total):[],injuries,
    monitor:{available,db:shownDb,segments,peakSegments,clipped,band,
      warning:clipped||band!=='normal',status:!available?'--':clipped?'CLIP':band==='hot'?'HOT':band==='mid-hot'?'CAUTION':'NORMAL'}};
}

const motions=new Map();
export function clearNavigatorTelemetryMotion(){motions.clear();}
export function drawNavigatorTelemetry(lcd,telemetry={},options={}){
  if(!lcd)return null;
  const state=navigatorTelemetryState(telemetry);
  const id=String(options.id||telemetry.id||'field-navigator');
  const motion=sampleNavigatorLcdMotion(motions.get(id),state,{
    nowMs:finite(options.nowMs,finite(telemetry.nowMs)),paused:options.paused===true||telemetry.paused===true,
    reducedMotion:options.reducedMotion===true||telemetry.reducedMotion===true||hardwareMotionReduced(),
  });
  if(!motions.has(id)&&motions.size>=8)motions.delete(motions.keys().next().value);
  motions.set(id,motion);
  uiDrawHardware(({ctx,cellW,cellH,dpr})=>paintNavigatorTelemetry(ctx,lcd,state,{cellW,cellH,dpr,motion}));
  return state;
}
