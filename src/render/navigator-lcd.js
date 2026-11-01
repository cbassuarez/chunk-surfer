// Full-DPR reflective LCD ink and optics, physically separate from VFD glass.
import {drawElectronicText} from './electronic-text.js';
import {dualTraceCells,dualTracePeakIndex,dualTraceUnit,drawTraceCell,
  drawSevenSegmentNumber,measureSevenSegment,traceDbText} from './dual-trace-display.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
let fontOwner=null;
const inkMetrics=new Map();
function nativeInkReady(ctx){
  const fonts=ctx.canvas?.ownerDocument?.fonts||(typeof document==='undefined'?null:document.fonts);
  if(!fonts?.check)return true;
  if(fontOwner!==fonts){
    fontOwner=fonts;
    inkMetrics.clear();
    // Canvas-only lettering must start its own bundled font decode; waiting
    // for check() without requesting it could leave the loading ROM forever.
    fonts.load?.('400 12px "Hardware Sans"')?.catch?.(()=>{});
    fonts.load?.('600 12px "Hardware Sans"')?.catch?.(()=>{});
  }
  return fonts.check('400 12px "Hardware Sans"')&&fonts.check('600 12px "Hardware Sans"');
}
function alphabeticInkBaseline(ctx,reference,fontSize,top,height){
  const key=ctx.font+'\0'+reference;
  let metrics=inkMetrics.get(key);
  if(!metrics){
    const measured=ctx.measureText?.(reference);
    const ascent=measured?.actualBoundingBoxAscent,descent=measured?.actualBoundingBoxDescent;
    if(Number.isFinite(ascent)&&Number.isFinite(descent)&&ascent+descent>0){
      metrics={ascent,descent};
      if(inkMetrics.size>=192)inkMetrics.delete(inkMetrics.keys().next().value);
      inkMetrics.set(key,metrics);
    }else metrics={ascent:fontSize*.74,descent:fontSize*.025};
  }
  return{baseline:top+height*.5+(metrics.ascent-metrics.descent)*.5,...metrics};
}
export function navigatorTelemetryLayout(lcd){
  const left=lcd.x+.60,right=lcd.x+lcd.w-.60,inner=Math.max(1,right-left),compact=lcd.h<3.7;
  const takeW=clamp(inner*.34,6.5,9.4),dividerX=left+takeW+.47;
  const monitorX=dividerX+.65,monitorW=Math.max(1,right-monitorX);
  const headerY=lcd.y+(compact?.15:.28),headerH=compact?.50:.60,meterY=lcd.y+(compact?1.98:2.70);
  return {lcd:{...lcd},compact,
    takes:{x:left,y:headerY,w:takeW,h:lcd.h-.56},
    divider:{x:dividerX,y:lcd.y+.43,w:.035,h:lcd.h-.86},
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
    status:{x:right-5.4,y:headerY,w:5.4,h:headerH}};
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
const gradient=(ctx,x0,y0,x1,y1,stops)=>{
  const value=ctx.createLinearGradient(x0,y0,x1,y1);
  for(const[offset,color]of stops)value.addColorStop(offset,color);return value;
};

// Raw Canvas/device-pixel boundary. The review and live HUD call this same
// painter, after the map's smoke/glass clipping scope has unwound.
export function paintNavigatorTelemetry(ctx,lcd,state,{cellW,cellH,dpr=1,motion=null}={}){
  const layout=navigatorTelemetryLayout(lcd),x=lcd.x*cellW*dpr,y=lcd.y*cellH*dpr;
  const w=lcd.w*cellW*dpr,h=lcd.h*cellH*dpr,u=Math.max(.5,dpr);
  const opacity=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
  const px=value=>value*cellW*dpr,py=value=>value*cellH*dpr;
  const rect=(left,top,width,height,color,alpha=1)=>{
    if(!(width>0&&height>0))return;
    ctx.fillStyle=color;ctx.globalAlpha=opacity*alpha;ctx.fillRect(left,top,width,height);
  };
  const box=(b,color,alpha=1)=>rect(px(b.x),py(b.y),px(b.w),py(b.h),color,alpha);
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  rect(x-3*u,y-3*u,w+6*u,h+6*u,gradient(ctx,x,y,x+w*.08,y+h,
    [[0,'#303b34'],[.35,'#667365'],[.91,'#c8d1b9'],[1,'#e2e5cd']]));
  rect(x-1.7*u,y-1.7*u,w+3.4*u,h+3.4*u,'#16231c');
  rect(x-.6*u,y-.6*u,w+1.2*u,h+1.2*u,'#4e5d49');
  rect(x,y,w,h,gradient(ctx,x,y,x+w*.12,y+h,
    [[0,'#8e9c7e'],[.09,'#a9b899'],[.46,'#b8c7a7'],[.93,'#a3b28f'],[1,'#7a8d70']]));
  ctx.beginPath();ctx.rect(x+u,y+u,w-2*u,h-2*u);ctx.clip();
  const light=Math.max(0,Math.min(.14,motion?.illumination||0));
  if(light)rect(x,y,w,h,'#eef1c9',light);
  // Stationary polarizer structure; never a scanning/flickering fake input.
  for(let row=3;row<h/u;row+=3)rect(x,y+row*u,w,.28*u,'#f1f0cf',.045);
  rect(x,y,w,h,gradient(ctx,x+w*.12,y,x+w*.8,y+h,
    [[0,'#f0f2d700'],[.37,'#f0f2d713'],[.48,'#f0f2d705'],[.65,'#f0f2d700'],[1,'#20362807']]));
  rect(x+2*u,y+u,w-4*u,.7*u,'#f0f2d7',.38);
  rect(x+2*u,y+h-1.5*u,w-4*u,.8*u,'#233722',.32);
  box(layout.divider,'#627951',.22);
  const ink='#1c3424',quietInk='#344c30';
  const nativeReady=nativeInkReady(ctx);
  const text=(value,b,{size=.59,weight=400,color=ink,align='left',alpha=1,reference=null}={})=>{
    value=String(value);const fontSize=Math.max(7*dpr,size*cellH*dpr),available=px(b.w);
    const anchor=align==='right'?px(b.x+b.w):align==='center'?px(b.x+b.w*.5):px(b.x);
    ctx.globalAlpha=opacity*alpha;ctx.fillStyle=color;ctx.shadowBlur=0;
    // Matrix ROM remains a loading fallback; premium text is vector LCD ink
    // rasterized once at the actual display pixel size, with no VFD bloom.
    if(!nativeReady||typeof ctx.fillText!=='function'){
      // Electronic text applies its own alpha to the inherited Canvas alpha.
      // Apply the dormant ink opacity once on both lettering paths.
      ctx.globalAlpha=opacity;
      drawElectronicText(ctx,value,anchor,py(b.y+b.h*.5),{mode:'lcd',color,dim:color,
        alpha,cellWidth:fontSize*.53,fontSize,maxWidth:available,align,baseline:'middle',dpr});return;
    }
    ctx.font=`${weight} ${fontSize}px "Hardware Sans",Arial,Helvetica,sans-serif`;
    ctx.textAlign=align;ctx.textBaseline='alphabetic';
    // Canvas "middle" centres an em box, not this face's visible ink. With
    // large digits that pushed the cap tops through the field's clip. A fixed
    // reference alphabet gives every value in a bank the same actual baseline.
    const placement=alphabeticInkBaseline(ctx,reference||value,fontSize,py(b.y),py(b.h));
    const baseline=Math.round(placement.baseline);
    const top=Math.min(py(b.y)-u,baseline-placement.ascent-u);
    const bottom=Math.max(py(b.y+b.h)+u,baseline+placement.descent+u);
    ctx.save();ctx.beginPath();ctx.rect(px(b.x)-u,top,available+2*u,bottom-top);ctx.clip();
    ctx.fillText(value,Math.round(anchor),baseline,available);ctx.restore();
  };
  // An unpowered LCD retains its label and every digit electrode. The faint
  // all-eight footprint describes the hardware, never an early live count.
  const takesEnabled=(state.takesEnabled??state.takesVisible)!==false;
  const takesAlpha=takesEnabled?1:.13;
  text('TAKES',layout.takeLabel,{size:.57,weight:600,alpha:takesAlpha});
  text(takesEnabled?String(state.takes).padStart(2,'0'):'88',layout.takeCount,
    {size:layout.compact?1.37:1.65,weight:600,reference:'0123456789',alpha:takesAlpha});
  text(takesEnabled?`/ ${String(state.total).padStart(2,'0')}`:'/ 88',layout.capacity,
    {size:.70,color:quietInk,alpha:takesAlpha});
  if(state.injuries)text(`HURT ${state.injuries}`,layout.injuries,{size:.52,weight:600,color:'#53382b'});
  text('MONITOR',layout.monitorLabel,{size:.55,weight:600});
  ctx.globalAlpha=opacity;
  drawSevenSegmentNumber(ctx,traceDbText(state.monitor.numericDb??state.monitor.db,
    {decimals:0,available:state.monitor.available}),px(layout.db.x),py(layout.db.y),py(layout.db.h),
    {color:ink,dormant:ink,lcd:true});
  if(state.monitor.available){
    text(state.monitor.unit==='dBFS'&&state.monitor.peakKind==='sample'?'dBFS':'dB',layout.dbUnit,
      {size:.54,color:quietInk});
    const peakText=traceDbText(state.monitor.numericPeakDb??state.monitor.peakDb,{decimals:0});
    const peakHeight=py(layout.peakReadout.h),peakWidth=measureSevenSegment(peakText,peakHeight);
    const end=px(layout.peakReadout.x+layout.peakReadout.w),center=py(layout.peakReadout.y+layout.peakReadout.h/2);
    const label=state.monitor.peakKind==='sample'?'PK':'MAX',labelRight=(end-peakWidth-4*dpr)/(cellW*dpr);
    text(label,{x:layout.peakReadout.x,y:layout.peakReadout.y,w:Math.max(0,labelRight-layout.peakReadout.x),h:layout.peakReadout.h},
      {size:.51,color:quietInk,align:'right'});
    ctx.globalAlpha=opacity;
    drawSevenSegmentNumber(ctx,peakText,end,center-peakHeight/2,peakHeight,{color:ink,dormant:ink,lcd:true,align:'right'});
  }
  if(state.monitor.warning)box(layout.status,state.monitor.clipped?'#744130':'#6c6331',.10);
  text(state.monitor.warning||!state.monitor.available?state.monitor.status:'RMS',layout.status,{size:.49,weight:state.monitor.warning?600:400,
    align:'right',color:state.monitor.warning?'#533526':quietInk});
  const cells=navigatorLcdMeterGeometry(layout.meter,{cellW,dpr});
  const peakIndex=state.monitor.available?dualTracePeakIndex(state.monitor.peakDb,24):-1;
  for(const{index,x:left,w:segmentWidth}of cells){
    const top=py(layout.meter.y),active=index<state.monitor.segments;
    const trail=active?0:Math.max(0,motion?.afterimage?.[index]||0)*.10;
    ctx.globalAlpha=opacity;
    drawTraceCell(ctx,left,top,segmentWidth,py(layout.meter.h),ink,
      {alpha:active?.96:.13+trail,chamfer:.8*u});
    drawTraceCell(ctx,left,py(layout.peakRail.y),segmentWidth,py(layout.peakRail.h),ink,
      {alpha:index===peakIndex?.96:.13,chamfer:.8*u});
  }
  if(state.monitor.available){
    for(const mark of navigatorLcdScaleMarks(layout,{cellW,dpr})){
      rect(mark.centerPx-.25*u,py(layout.scale.y)-1.8*u,.5*u,1.4*u,quietInk,.6);
      text(mark.label,mark.box,{size:.55,color:quietInk,align:mark.align});
    }
  }else text('INPUT UNAVAILABLE',layout.scale,{size:.44,color:quietInk});
  ctx.restore();return layout;
}
