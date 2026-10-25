// A reflective, non-emissive LCD in the navigator's brushed aluminium. It is
// a sibling of the map's VFD glass, with its own gasket, polarizer and ink.
import { uiDrawHardware } from './ui.js';
import { drawElectronicText } from './electronic-text.js';
import { MONITOR_THRESHOLDS, MONITOR_DANGER_THRESHOLDS, monitorBandForDb } from '../audio/monitor.js';
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
  return{takes,total,slots:takeSlotState(takes,total),injuries,
    monitor:{available,db:shownDb,segments,peakSegments,clipped,band,
      warning:clipped||band!=='normal',status:!available?'--':clipped?'CLIP':band==='hot'?'HOT':band==='mid-hot'?'CAUTION':'NORMAL'}};
}

export function navigatorTelemetryLayout(lcd){
  const left=lcd.x+.65,right=lcd.x+lcd.w-.65;
  const takeY=lcd.y+.32,monitorY=lcd.y+1.72;
  const status={x:right-5.1,y:monitorY,w:5.1,h:.95};
  return{
    lcd:{...lcd},
    takes:{x:left,y:takeY,w:right-left,h:.95},
    takeLabel:{x:left,y:takeY,w:3.8,h:.95},
    takeCount:{x:left+4.1,y:takeY,w:3.8,h:.95},
    slots:{x:left+8.5,y:takeY+.14,w:Math.max(1,Math.min(6.2,right-left-14.4)),h:.58},
    injuries:{x:right-5.5,y:takeY,w:5.5,h:.95},
    monitorLabel:{x:left,y:monitorY,w:5.1,h:.95},
    meter:{x:left+5.6,y:monitorY+.20,w:Math.max(1,status.x-left-6.25),h:.42},
    status,
  };
}

const gradient=(ctx,x0,y0,x1,y1,stops)=>{
  const value=ctx.createLinearGradient(x0,y0,x1,y1);
  for(const[offset,color]of stops)value.addColorStop(offset,color);
  return value;
};

// Raw Canvas boundary also allows the real LCD paint to be checked without a
// browser. Coordinates in the layout remain UI cells; conversion happens once.
export function paintNavigatorTelemetry(ctx,lcd,state,{cellW,cellH,dpr=1}){
  const layout=navigatorTelemetryLayout(lcd);
  const x=lcd.x*cellW*dpr,y=lcd.y*cellH*dpr,w=lcd.w*cellW*dpr,h=lcd.h*cellH*dpr;
  const u=Math.max(.5,dpr),inset=2*u,opacity=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
  const rect=(left,top,width,height,color,alpha=1)=>{
    ctx.fillStyle=color;ctx.globalAlpha=opacity*alpha;ctx.fillRect(left,top,width,height);
  };
  ctx.save();
  ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  // The cut edge catches the same upper-left illumination as the housing.
  rect(x-2*u,y-2*u,w+4*u,h+4*u,gradient(ctx,x,y,x+w*.15,y+h,
    [[0,'#39443c'],[.46,'#7b8274'],[1,'#dce0cb']]));
  rect(x-u,y-u,w+2*u,h+2*u,'#28312b');
  rect(x,y,w,h,gradient(ctx,x,y,x+w*.2,y+h,
    [[0,'#8f9c80'],[.22,'#b8c2a3'],[.64,'#abb89a'],[1,'#95a584']]));
  ctx.beginPath();ctx.rect(x+inset,y+inset,w-2*inset,h-2*inset);ctx.clip();
  // Broad, quiet polarizer reflection: fixed material, never a running signal.
  rect(x,y,w,h,gradient(ctx,x+w*.15,y,x+w*.8,y+h,
    [[0,'rgba(239,243,213,0)'],[.42,'rgba(239,243,213,.13)'],[.57,'rgba(239,243,213,.04)'],[1,'rgba(239,243,213,0)']]));
  rect(x,y+u,w,u,'#e8edd1',.35);
  rect(x,y+h-2*u,w,u,'#3b4b35',.40);
  const ink='#223426',dim='#4d6344';
  const text=(value,box,{advance=.62,size=.72,color=ink,align='left',alpha=1}={})=>{
    ctx.globalAlpha=opacity;
    return drawElectronicText(ctx,value,
      (align==='right'?box.x+box.w:box.x)*cellW*dpr,(box.y+.44)*cellH*dpr,
      {mode:'lcd',color,dim,alpha,cellWidth:cellW*dpr*advance,fontSize:cellH*dpr*size,
        align,baseline:'middle',maxWidth:box.w*cellW*dpr,dpr});
  };
  text('TAKES',layout.takeLabel);
  text(`${String(state.takes).padStart(2,'0')}/${String(state.total).padStart(2,'0')}`,layout.takeCount,{advance:.72,size:.78});
  const slotGap=.21*cellW*dpr,slotWidth=(layout.slots.w*cellW*dpr-slotGap*(state.slots.length-1))/state.slots.length;
  state.slots.forEach((filled,index)=>{
    const left=layout.slots.x*cellW*dpr+index*(slotWidth+slotGap),top=layout.slots.y*cellH*dpr;
    rect(left,top,slotWidth,layout.slots.h*cellH*dpr,ink,filled ? .95 : .17);
    if(filled)rect(left+u,top+u,Math.max(u,slotWidth-2*u),u,'#42573a',.36);
  });
  if(state.injuries)text(`HURT ${state.injuries}`,layout.injuries,{advance:.58,size:.68,align:'right'});
  // Segments correspond one-for-one to the monitor's existing -48..0 dB
  // thresholds. A peak cap is present only when the actual held peak exceeds
  // the current run; no flicker, oscillator or ambient signal is invented.
  text('MONITOR',layout.monitorLabel,{advance:.60,size:.70});
  const count=MONITOR_THRESHOLDS.length,gap=Math.max(u,.12*cellW*dpr);
  const meter=layout.meter,segmentWidth=(meter.w*cellW*dpr-gap*(count-1))/count;
  for(let index=0;index<count;index++){
    const left=meter.x*cellW*dpr+index*(segmentWidth+gap),top=meter.y*cellH*dpr;
    const active=index<state.monitor.segments;
    // Printed tint above the hot electrodes, rather than emissive colour.
    const color=active&&MONITOR_THRESHOLDS[index]>=MONITOR_DANGER_THRESHOLDS.hotDb?'#612d26'
      :active&&MONITOR_THRESHOLDS[index]>=MONITOR_DANGER_THRESHOLDS.midHotDb?'#514b25':ink;
    rect(left,top,segmentWidth,meter.h*cellH*dpr,color,active ? .96 : .16);
    if(index===state.monitor.peakSegments-1&&state.monitor.peakSegments>state.monitor.segments)
      rect(left,top-u,segmentWidth,meter.h*cellH*dpr+2*u,ink,.85);
  }
  if(state.monitor.warning){
    const left=layout.status.x*cellW*dpr,top=(layout.status.y+.16)*cellH*dpr;
    const width=.72*cellW*dpr,height=.60*cellH*dpr;
    ctx.globalAlpha=opacity;ctx.strokeStyle=ink;ctx.lineWidth=Math.max(u,1);
    ctx.beginPath();ctx.moveTo(left+width/2,top);ctx.lineTo(left+width,top+height);ctx.lineTo(left,top+height);ctx.closePath();ctx.stroke();
    rect(left+width*.44,top+height*.30,Math.max(u,width*.12),height*.28,ink);
    rect(left+width*.44,top+height*.76,Math.max(u,width*.12),u,ink);
  }
  text(state.monitor.status,{...layout.status,x:layout.status.x+.92,w:layout.status.w-.92},
    {advance:.52,size:.67,align:'right',alpha:state.monitor.available?1:.62});
  ctx.restore();
  return layout;
}

export function drawNavigatorTelemetry(lcd,telemetry={}){
  if(!lcd)return null;
  const state=navigatorTelemetryState(telemetry);
  uiDrawHardware(({ctx,cellW,cellH,dpr})=>paintNavigatorTelemetry(ctx,lcd,state,{cellW,cellH,dpr}));
  return state;
}
