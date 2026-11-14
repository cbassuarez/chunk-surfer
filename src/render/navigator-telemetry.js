// A reflective/transflective LCD in the navigator's brushed aluminium. It is
// a sibling of the map's VFD glass, with its own gasket, polarizer and ink.
import { uiDrawHardware } from './ui.js';
import { paintNavigatorTelemetry } from './navigator-lcd.js';
export { navigatorTelemetryLayout, paintNavigatorTelemetry } from './navigator-lcd.js';
import { sampleNavigatorLcdMotion } from './navigator-lcd-motion.js';
import { hardwareMotionReduced, hardwareEffectsReduced } from './hardware-material.js';
import { monitorBandForDb } from '../audio/monitor.js';
import { takeSlotState } from './field-deck.js';
import { dualTraceSnapshot } from '../audio/dual-trace.js';
import { dualTracePeakIndex } from './dual-trace-display.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const rank={normal:0,'mid-hot':1,hot:2};

export function navigatorConditionState(condition){
  if(!condition||!Number.isFinite(condition.value)||!Number.isFinite(condition.ceiling)||condition.ceiling<=0)return null;
  return{value:Math.max(0,Math.round(condition.value)),ceiling:Math.max(1,Math.round(condition.ceiling)),
    baseline:Number.isFinite(condition.baseline)?Math.max(1,Math.round(condition.baseline)):Math.max(1,Math.round(condition.ceiling)),
    injuries:Math.max(0,Math.floor(finite(condition.injuries))),
    strainRatio:clamp(finite(condition.strainRatio),0,1),strainStatus:String(condition.strainStatus||''),
    woundStatus:String(condition.woundStatus||''),capacityLoss:Math.max(0,finite(condition.capacityLoss)),
    combat:condition.combat===true,owner:String(condition.owner||'')};
}

export function navigatorConditionEventState(event,age){
  if(!event||!Number.isFinite(age)||age<0||age>=3)return null;
  const kind=event.kind;
  const label=kind==='injury'&&finite(event.injuriesAdded)>0?'INJURED'
    :kind==='recovery'&&finite(event.recovery)>0?`+${event.recovery}`
      :kind==='damage'&&finite(event.damage)>0?`-${event.damage}`:null;
  return label?{kind,label,age,serial:event.serial}:null;
}

export function navigatorTelemetryState(telemetry={},options={}){
  const total=clamp(Math.floor(finite(telemetry.total,5)),1,12);
  const takes=clamp(Math.floor(finite(telemetry.takes)),0,total);
  const injuries=clamp(Math.floor(finite(telemetry.injuries)),0,99);
  const snapshot=telemetry.monitor;
  const id=snapshot?.sourceId||telemetry.meterId||telemetry.meterSource||'field-exposure';
  const now=finite(options.nowMs,finite(telemetry.nowMs,performance.now()));
  const meter=dualTraceSnapshot(id,snapshot||{available:false},now);
  const available=meter.available!==false,clipped=available&&meter.clipped===true;
  const db=available?meter.db:-96,segments=available?meter.segments24:0;
  // HUSH/gameplay exposure remains immediate. Its raw warning band is a
  // separate annunciator, never a floor applied to the smoothed RMS body.
  const measuredBand=monitorBandForDb(available?finite(snapshot?.db,-96):-96);
  const band=available&&(rank[snapshot?.band]??0)>(rank[measuredBand]??0)?snapshot.band:measuredBand;
  const peakDb=available?meter.peakDb:-96;
  const peakSegments=available?dualTracePeakIndex(peakDb,24)+1:0;
  const captureStatus=available&&(snapshot?.captureWarning==='caught'?'CAUGHT':snapshot?.captureWarning==='quiet'?'QUIET':null);
  // Assignment acceptance powers the counter; its LCD electrodes are always
  // present. Keep the old flag as an input/output alias for existing callers.
  const takesEnabled=(telemetry.takesEnabled??telemetry.takesVisible)!==false;
  return{takesEnabled,takesVisible:takesEnabled,takes:takesEnabled?takes:0,total:takesEnabled?total:0,slots:takesEnabled?takeSlotState(takes,total):[],injuries,
    condition:navigatorConditionState(telemetry.condition),
    conditionEvent:navigatorConditionEventState(telemetry.conditionEvent,telemetry.conditionEventAge),
    monitor:{...meter,available,db,segments,peakSegments,clipped,band,unit:snapshot?.unit||'dB',
      warning:!!captureStatus||clipped||band!=='normal',status:captureStatus||(!available?'--':clipped?'CLIP':band==='hot'?'HOT':band==='mid-hot'?'CAUTION':'NORMAL')}};
}

const motions=new Map();
export function clearNavigatorTelemetryMotion(){motions.clear();}
export function drawNavigatorTelemetry(lcd,telemetry={},options={}){
  if(!lcd)return null;
  const state=navigatorTelemetryState(telemetry,options);
  const id=String(options.id||telemetry.id||'field-navigator');
  const reducedMotion=options.reducedMotion===true||telemetry.reducedMotion===true||hardwareMotionReduced();
  const motion=sampleNavigatorLcdMotion(motions.get(id),state,{
    nowMs:finite(options.nowMs,finite(telemetry.nowMs,performance.now())),paused:options.paused===true||telemetry.paused===true,
    reducedMotion,
  });
  if(!motions.has(id)&&motions.size>=8)motions.delete(motions.keys().next().value);
  motions.set(id,motion);
  uiDrawHardware(({ctx,cellW,cellH,dpr})=>paintNavigatorTelemetry(ctx,lcd,state,{
    cellW,cellH,dpr,motion,view:reducedMotion?null:options.view,reducedEffects:hardwareEffectsReduced(),
  }));
  return state;
}
