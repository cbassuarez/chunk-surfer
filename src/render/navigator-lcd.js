// The navigator telemetry bank is a backlit LCD behind its own glass.
import {drawElectronicText} from './electronic-text.js';
import {drawLcdWell,drawLcdCover,lcdElectrodeOffset,LCD_INK} from './lcd-material.js';
import {dualTraceCells,dualTracePeakIndex,dualTraceUnit,drawTraceCell,
  drawSevenSegmentNumber,measureSevenSegment,traceDbText} from './dual-trace-display.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function navigatorTelemetryLayout(lcd){
  const rail= lcd.conditionRail===true?1.1:0,bodyH=Math.max(1,lcd.h-rail);
  const left=lcd.x+.60,right=lcd.x+lcd.w-.60,inner=Math.max(1,right-left),compact=bodyH<3.7;
  const takeW=clamp(inner*.34,6.5,9.4),dividerX=left+takeW+.47;
  const monitorX=dividerX+.65,monitorW=Math.max(1,right-monitorX);
  const headerY=lcd.y+(compact?.15:.28),headerH=compact?.50:.60,meterY=lcd.y+(compact?1.98:2.70);
  const conditionY=lcd.y+bodyH;
  return {lcd:{...lcd},compact,
    takes:{x:left,y:headerY,w:takeW,h:bodyH-.56},
    divider:{x:dividerX,y:lcd.y+.43,w:.035,h:bodyH-.86},
    takeLabel:{x:left,y:headerY,w:takeW,h:headerH},
    takeCount:{x:left,y:lcd.y+.89,w:takeW*.59,h:compact?1:1.25},
    capacity:{x:left+takeW*.61,y:lcd.y+(compact?1.17:1.36),w:takeW*.39,h:.64},
    slots:{x:left,y:lcd.y+(compact?2.12:2.49),w:takeW,h:compact?.24:.32},
    injuries:{x:left,y:lcd.y+(compact?2.56:3.17),w:takeW,h:.48},
    monitorLabel:{x:monitorX,y:headerY,w:Math.max(4.4,monitorW-5.4),h:headerH},
    db:{x:monitorX,y:lcd.y+(compact?.82:1.08),w:compact?5.1:6.4,h:compact?.90:1.20},
    dbUnit:{x:monitorX+(compact?5.1:6.4),y:lcd.y+(compact?1.25:1.63),w:3.2,h:.5},
    peakReadout:{x:right-7.4,y:lcd.y+(compact?1.20:1.59),w:7.4,h:compact?.52:.65},
    peakRail:{x:monitorX,y:meterY-(compact?.18:.25),w:monitorW,h:.10},
    meter:{x:monitorX,y:meterY,w:monitorW,h:compact?.32:.45},
    scale:{x:monitorX,y:lcd.y+(compact?2.48:3.45),w:monitorW,h:.60},
    status:{x:right-5.4,y:headerY,w:5.4,h:headerH},
    condition:rail?{x:left,y:conditionY+.10,w:inner,h:.83}:null,
    conditionRule:rail?{x:left,y:conditionY-.03,w:inner,h:.035}:null,
    conditionLabel:rail?{x:left,y:conditionY+.08,w:6.85,h:.38}:null,
    conditionChange:rail?{x:left,y:conditionY+.54,w:6.85,h:.37}:null,
    conditionValue:rail?{x:left+6.9,y:conditionY+.15,w:6.1,h:.68}:null,
    injuryMarks:rail?{x:left+13.4,y:conditionY+.18,w:Math.max(1,inner-13.4),h:.66}:null};
}
export function navigatorLcdMeterGeometry(meter,{cellW,dpr=1}){
  return dualTraceCells({x:meter.x*cellW*dpr,width:meter.w*cellW*dpr,count:24,
    gap:1.5*(cellW/8.45)*dpr});
}
export function navigatorLcdScaleMarks(layout,metrics){
  const cellPixels=metrics.cellW*(metrics.dpr||1);
  return [-48,-24,0].map((thresholdDb,position)=>{
    const center=layout.meter.x+dualTraceUnit(thresholdDb)*layout.meter.w;
    const align=position===0?'left':position===2?'right':'center';
    const width=2.3,x=align==='left'?layout.scale.x:align==='right'?layout.scale.x+layout.scale.w-width:center-width/2;
    return {label:String(thresholdDb),thresholdDb,index:dualTracePeakIndex(thresholdDb,24),centerPx:center*cellPixels,align,
      box:{x,y:layout.scale.y,w:width,h:layout.scale.h}};
  });
}
// Raw Canvas/device-pixel boundary. The review and live HUD call this same
// painter, after the map's smoke/glass clipping scope has unwound.
export function paintNavigatorTelemetry(ctx,lcd,state,{cellW,cellH,dpr=1,motion=null,view=null,reducedEffects=false}={}){
  const layout=navigatorTelemetryLayout(lcd),x=lcd.x*cellW*dpr,y=lcd.y*cellH*dpr;
  const w=lcd.w*cellW*dpr,h=lcd.h*cellH*dpr,u=Math.max(.5,dpr);
  const opacity=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
  const bounds={x,y,w,h,dpr:u};
  const offset=lcdElectrodeOffset(view,u);
  const px=value=>value*cellW*dpr+offset.x,py=value=>value*cellH*dpr+offset.y;
  const width=value=>value*cellW*dpr,height=value=>value*cellH*dpr;
  const {signal:ink,quiet:quietInk,warning}=LCD_INK;
  const glow=reducedEffects?0:1.65*u;
  const rect=(left,top,width,height,color,alpha=1)=>{
    if(!(width>0&&height>0))return;
    ctx.fillStyle=color;ctx.globalAlpha=opacity*alpha;ctx.fillRect(left,top,width,height);
  };
  const box=(b,color,alpha=1)=>rect(px(b.x),py(b.y),width(b.w),height(b.h),color,alpha);
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  drawLcdWell(ctx,bounds,motion?.illumination);
  ctx.beginPath();ctx.rect(x+u,y+u,w-2*u,h-2*u);ctx.clip();
  box(layout.divider,'#a5c698',.20);
  const text=(value,b,{size=.59,color=ink,align='left',alpha=1}={})=>{
    const fontSize=Math.max(7*dpr,size*cellH*dpr);
    const anchor=align==='right'?px(b.x+b.w):align==='center'?px(b.x+b.w*.5):px(b.x);
    ctx.globalAlpha=opacity;
    drawElectronicText(ctx,value,anchor,py(b.y+b.h*.5),{
      mode:'lcd',color,dim:color,alpha,cellWidth:fontSize*.61,fontSize,
      maxWidth:width(b.w),align,baseline:'middle',dpr,
      lcdGlow:alpha<.5||reducedEffects?false:color===warning?LCD_INK.warningHalo:LCD_INK.halo,
    });
  };
  // An unpowered LCD retains its label and every digit electrode. The faint
  // all-eight footprint describes the hardware, never an early live count.
  const takesEnabled=(state.takesEnabled??state.takesVisible)!==false;
  const takesAlpha=takesEnabled?1:.13;
  text('TAKES',layout.takeLabel,{size:.57,alpha:takesAlpha});
  text(takesEnabled?String(state.takes).padStart(2,'0'):'88',layout.takeCount,
    {size:layout.compact?1.37:1.65,alpha:takesAlpha});
  text(takesEnabled?`/ ${String(state.total).padStart(2,'0')}`:'/ 88',layout.capacity,
    {size:.70,color:quietInk,alpha:takesAlpha});
  if(!layout.condition&&state.injuries)text(`HURT ${state.injuries}`,layout.injuries,{size:.52,color:warning});
  text('MONITOR',layout.monitorLabel,{size:.55});
  ctx.globalAlpha=opacity;
  drawSevenSegmentNumber(ctx,traceDbText(state.monitor.numericDb??state.monitor.db,
    {decimals:0,available:state.monitor.available}),px(layout.db.x),py(layout.db.y),height(layout.db.h),
    {color:ink,dormant:ink,lcd:true,glow,lcdHalo:LCD_INK.halo});
  if(state.monitor.available){
    text(state.monitor.unit==='dBFS'&&state.monitor.peakKind==='sample'?'dBFS':'dB',layout.dbUnit,
      {size:.54,color:quietInk});
    const peakText=traceDbText(state.monitor.numericPeakDb??state.monitor.peakDb,{decimals:0});
    const peakHeight=height(layout.peakReadout.h),peakWidth=measureSevenSegment(peakText,peakHeight);
    const end=px(layout.peakReadout.x+layout.peakReadout.w),center=py(layout.peakReadout.y+layout.peakReadout.h/2);
    const label=state.monitor.peakKind==='sample'?'PK':'MAX',labelRight=(end-offset.x-peakWidth-4*dpr)/(cellW*dpr);
    text(label,{x:layout.peakReadout.x,y:layout.peakReadout.y,w:Math.max(0,labelRight-layout.peakReadout.x),h:layout.peakReadout.h},
      {size:.51,color:quietInk,align:'right'});
    ctx.globalAlpha=opacity;
    drawSevenSegmentNumber(ctx,peakText,end,center-peakHeight/2,peakHeight,{color:ink,dormant:ink,lcd:true,glow,lcdHalo:LCD_INK.halo,align:'right'});
  }
  if(state.monitor.warning)box(layout.status,warning,state.monitor.clipped?.11:.06);
  text(state.monitor.warning||!state.monitor.available?state.monitor.status:'RMS',layout.status,{size:.49,align:'right',color:state.monitor.warning?warning:quietInk});
  const cells=navigatorLcdMeterGeometry(layout.meter,{cellW,dpr});
  const peakIndex=state.monitor.available?dualTracePeakIndex(state.monitor.peakDb,24):-1;
  for(const{index,x:left,w:segmentWidth}of cells){
    const top=py(layout.meter.y),active=index<state.monitor.segments;
    const trail=active?0:Math.max(0,motion?.afterimage?.[index]||0)*.10;
    ctx.globalAlpha=opacity;
    drawTraceCell(ctx,left+offset.x,top,segmentWidth,height(layout.meter.h),ink,
      {alpha:active?.90:.13+trail,chamfer:.8*u,glow:active?glow*.65:0});
    drawTraceCell(ctx,left+offset.x,py(layout.peakRail.y),segmentWidth,height(layout.peakRail.h),ink,
      {alpha:index===peakIndex?.96:.13,chamfer:.8*u,glow:index===peakIndex?glow:0});
  }
  if(state.monitor.available){
    for(const mark of navigatorLcdScaleMarks(layout,{cellW,dpr})){
      rect(mark.centerPx+offset.x-.25*u,py(layout.scale.y)-1.8*u,.5*u,1.4*u,quietInk,.6);
      text(mark.label,mark.box,{size:.55,color:quietInk,align:mark.align});
    }
  }else text('INPUT UNAVAILABLE',layout.scale,{size:.44,color:quietInk});
  if(layout.condition){
    const condition=state.condition,present=!!condition;
    box(layout.conditionRule,quietInk,.26);
    text('COMPOSURE',layout.conditionLabel,{size:.40,alpha:present?1:.24});
    if(present&&state.conditionEvent)text(state.conditionEvent.label,layout.conditionChange,
      {size:.42,color:state.conditionEvent.kind==='recovery'?ink:warning});
    text(present?`${condition.value} / ${condition.ceiling}`:'-- / --',layout.conditionValue,
      {size:.73,color:present&&['shaken','depleted'].includes(condition.strainStatus)?warning:ink,alpha:present?1:.24});
    const marks=layout.injuryMarks,count=condition?.injuries||0;
    const injuryLabelW=Math.min(4.9,marks.w*.64),countText=present?String(count):'--';
    text(count===1?'INJURY':'INJURIES',{...marks,w:injuryLabelW,y:marks.y+.18,h:.36},
      {size:.39,color:count?warning:quietInk,alpha:present?1:.24});
    const countW=Math.min(marks.w-injuryLabelW-.15,Math.max(1.7,countText.length*.72+.25));
    const countX=marks.x+marks.w-countW,start=marks.x+injuryLabelW+.15,room=Math.max(0,countX-start-.15);
    const step=.5,shown=Math.min(3,count,Math.floor(room/step));
    for(let index=0;index<shown;index++){
      ctx.globalAlpha=opacity;ctx.strokeStyle=warning;ctx.lineWidth=Math.max(1,dpr);
      const x=px(start+index*step),y=py(marks.y+.13),dx=width(Math.min(.32,step*.6)),dy=height(.42);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.moveTo(x+dx,y);ctx.lineTo(x,y+dy);ctx.stroke();
    }
    text(countText,{x:countX,y:marks.y+.13,w:countW,h:.5},
      {size:.50,color:count?warning:quietInk,align:'right',alpha:present?1:.24});
  }
  ctx.globalAlpha=opacity;drawLcdCover(ctx,bounds,view);
  ctx.restore();return layout;
}
