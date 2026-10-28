// Full-DPR reflective LCD ink and optics, physically separate from VFD glass.
import {drawElectronicText} from './electronic-text.js';
import {MONITOR_THRESHOLDS,MONITOR_DANGER_THRESHOLDS} from '../audio/monitor.js';
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
  const headerY=lcd.y+.28,meterY=lcd.y+(compact?2.05:2.68);
  return {lcd:{...lcd},compact,
    takes:{x:left,y:headerY,w:takeW,h:lcd.h-.56},
    divider:{x:dividerX,y:lcd.y+.43,w:.035,h:lcd.h-.86},
    takeLabel:{x:left,y:headerY,w:takeW,h:.6},
    takeCount:{x:left,y:lcd.y+.89,w:takeW*.59,h:compact?1:1.25},
    capacity:{x:left+takeW*.61,y:lcd.y+(compact?1.17:1.36),w:takeW*.39,h:.64},
    slots:{x:left,y:lcd.y+(compact?2.12:2.49),w:takeW,h:compact?.24:.32},
    injuries:{x:left,y:lcd.y+(compact?2.56:3.17),w:takeW,h:.48},
    monitorLabel:{x:monitorX,y:headerY,w:Math.max(4.4,monitorW-5.4),h:.6},
    db:{x:monitorX,y:lcd.y+.96,w:Math.max(4,monitorW-2.7),h:compact?.9:1.25},
    dbUnit:{x:right-2.2,y:lcd.y+(compact?1.27:1.54),w:2.2,h:.5},
    meter:{x:monitorX,y:meterY,w:monitorW,h:compact?.32:.40},
    scale:{x:monitorX,y:meterY+(compact?.49:.63),w:monitorW,h:.48},
    status:{x:right-5.4,y:headerY,w:5.4,h:.6}};
}
export function navigatorLcdMeterGeometry(meter,{cellW,dpr=1}){
  const u=Math.max(.5,dpr),count=MONITOR_THRESHOLDS.length,gap=Math.max(u,.11*cellW*dpr);
  const width=meter.w*cellW*dpr,segmentWidth=(width-gap*(count-1))/count;
  return MONITOR_THRESHOLDS.map((thresholdDb,index)=>({index,thresholdDb,
    x:meter.x*cellW*dpr+index*(segmentWidth+gap),w:segmentWidth,
    center:meter.x*cellW*dpr+index*(segmentWidth+gap)+segmentWidth/2}));
}
export function navigatorLcdScaleMarks(layout,metrics){
  const cells=navigatorLcdMeterGeometry(layout.meter,metrics),cellPixels=metrics.cellW*(metrics.dpr||1);
  return [-48,MONITOR_DANGER_THRESHOLDS.hotDb,0].map((thresholdDb,position)=>{
    const cell=cells.find(item=>item.thresholdDb===thresholdDb),align=position===0?'left':position===2?'right':'center';
    const width=1.7,x=align==='left'?layout.scale.x:align==='right'?layout.scale.x+layout.scale.w-width:cell.center/cellPixels-width/2;
    return {label:String(thresholdDb),thresholdDb,index:cell.index,centerPx:cell.center,align,
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
  if(state.takesVisible!==false){
    text('TAKES',layout.takeLabel,{size:.57,weight:600});
    text(String(state.takes).padStart(2,'0'),layout.takeCount,{size:layout.compact?1.37:1.65,weight:600,reference:'0123456789'});
    text(`/ ${String(state.total).padStart(2,'0')}`,layout.capacity,{size:.70,color:quietInk});
  }
  if(state.injuries)text(`HURT ${state.injuries}`,layout.injuries,{size:.52,weight:600,color:'#53382b'});
  text('MONITOR',layout.monitorLabel,{size:.55,weight:600});
  text(state.monitor.available?String(Math.round(state.monitor.db)):'--',layout.db,{size:layout.compact?1.12:1.45,weight:600,reference:'-0123456789'});
  if(state.monitor.available)text('dB',layout.dbUnit,{size:.54,color:quietInk,align:'right'});
  if(state.monitor.warning)box(layout.status,state.monitor.clipped?'#744130':'#6c6331',.10);
  text(state.monitor.status,layout.status,{size:.49,weight:state.monitor.warning?600:400,
    align:'right',color:state.monitor.warning?'#533526':quietInk});
  const cells=navigatorLcdMeterGeometry(layout.meter,{cellW,dpr});
  for(const{index,x:left,w:segmentWidth}of cells){
    const top=py(layout.meter.y),active=index<state.monitor.segments;
    const color=active&&MONITOR_THRESHOLDS[index]>=MONITOR_DANGER_THRESHOLDS.hotDb?'#663b2b'
      :active&&MONITOR_THRESHOLDS[index]>=MONITOR_DANGER_THRESHOLDS.midHotDb?'#51502b':ink;
    const trail=active?0:Math.max(0,motion?.afterimage?.[index]||0)*.10;
    rect(left,top,segmentWidth,py(layout.meter.h),color,active?.96:.12+trail);
    if(index===state.monitor.peakSegments-1&&state.monitor.peakSegments>state.monitor.segments)
      rect(left,top-1.5*u,segmentWidth,u,ink,.88);
  }
  if(state.monitor.available){
    for(const mark of navigatorLcdScaleMarks(layout,{cellW,dpr})){
      rect(mark.centerPx-.25*u,py(layout.scale.y)-1.8*u,.5*u,1.4*u,quietInk,.6);
      text(mark.label,mark.box,{size:.43,color:quietInk,align:mark.align});
    }
  }else text('INPUT UNAVAILABLE',layout.scale,{size:.44,color:quietInk});
  ctx.restore();return layout;
}
