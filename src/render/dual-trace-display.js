// The approved dual trace's formed electrodes. Signal history and the 8 Hz
// number clock belong to audio/dual-trace; this module only places and paints.
import {drawElectronicText} from './electronic-text.js';

const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
export const DUAL_TRACE_MIN_DB=-48;
export const DUAL_TRACE_MAX_DB=0;
export const dualTraceUnit=db=>clamp((finite(db,-96)+48)/48,0,1);

export function dualTraceCells({x=0,width,count=48,gap=2.4}={}){
  const n=Math.max(1,Math.floor(count)),pitch=Math.max(0,finite(width))/n;
  const space=clamp(finite(gap),0,pitch*.48);
  return Array.from({length:n},(_,index)=>({index,thresholdDb:-48+(index+1)*48/n,
    x:x+index*pitch+space/2,w:Math.max(0,pitch-space),center:x+(index+.5)*pitch}));
}
export function dualTracePeakIndex(db,count=48){
  const position=dualTraceUnit(db)*count;
  // At an exact boundary, the peak occupies the last completed cell, just as
  // the RMS body does. Silence never leaves a decorative first-cell marker.
  return position>0?clamp(Math.ceil(position-1e-9)-1,0,count-1):-1;
}

const DIGITS={'0':'abcdef','1':'bc','2':'abged','3':'abgcd','4':'fgbc',
  '5':'afgcd','6':'afgecd','7':'abc','8':'abcdefg','9':'abfgcd','-':'g','−':'g',' ':'','+':'g'};
export function sevenSegmentGeometry(height=24){
  const h=Math.max(8,finite(height,24)),w=h*.55,t=Math.max(1.2,h*.115),gap=Math.max(.45,h*.025);
  const horizontal=cy=>[[t+gap,cy-t/2],[w-t-gap,cy-t/2],[w-t/2-gap,cy],
    [w-t-gap,cy+t/2],[t+gap,cy+t/2],[t/2+gap,cy]];
  const vertical=(cx,y1,y2)=>[[cx,y1],[cx+t/2,y1+t/2],[cx+t/2,y2-t/2],
    [cx,y2],[cx-t/2,y2-t/2],[cx-t/2,y1+t/2]];
  return {width:w,height:h,stroke:t,gap,advance:w+h*.15,shapes:{
    a:horizontal(t/2),g:horizontal(h/2),d:horizontal(h-t/2),
    f:vertical(t/2,t/2+gap,h/2-gap),b:vertical(w-t/2,t/2+gap,h/2-gap),
    e:vertical(t/2,h/2+gap,h-t/2-gap),c:vertical(w-t/2,h/2+gap,h-t/2-gap)}};
}
export function measureSevenSegment(value,height=24){
  const g=sevenSegmentGeometry(height);
  return [...String(value)].reduce((sum,ch)=>sum+(ch==='.'?g.height*.12:g.advance),0);
}
function polygon(ctx,points,color,glow=0){
  ctx.save();try{
    ctx.fillStyle=color;ctx.shadowColor=glow?color:'transparent';ctx.shadowBlur=glow;
    ctx.shadowOffsetX=ctx.shadowOffsetY=0;
    ctx.beginPath();points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.fill();
  }finally{ctx.restore();}
}
export function drawTraceCell(ctx,x,y,w,h,color,{glow=0,chamfer=.8,alpha=1}={}){
  if(!(w>0&&h>0))return;
  const c=Math.min(chamfer,w/5,h/5);
  ctx.save();ctx.globalAlpha*=alpha;
  try{polygon(ctx,[[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],
    [x+w-c,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]],color,glow);}finally{ctx.restore();}
}
export function drawSevenSegmentNumber(ctx,value,x,y,height,{color='#8dde9a',
  dormant='#263c2a',brightness=1,lcd=false,align='left',glow=1.1}={}){
  const g=sevenSegmentGeometry(height),width=measureSevenSegment(value,height);
  let cursor=x-(align==='right'?width:align==='center'?width/2:0);
  ctx.save();
  try{
    for(const char of String(value)){
      if(char==='.'){
        drawTraceCell(ctx,cursor-g.height*.10,y+g.height-g.stroke,g.stroke,g.stroke,color,
          {glow:lcd?0:glow,alpha:brightness});cursor+=g.height*.12;continue;
      }
      const lit=DIGITS[char]||'';
      for(const [name,points]of Object.entries(g.shapes)){
        if((char==='-'||char==='−'||char==='+')&&name!=='g')continue;
        const on=lit.includes(name);
        ctx.save();ctx.globalAlpha*=on?brightness:lcd?.10:1;
        try{polygon(ctx,points.map(([xx,yy])=>[cursor+xx,y+yy]),on?color:dormant,on&&!lcd?glow:0);}
        finally{ctx.restore();}
      }
      if(char==='+')drawTraceCell(ctx,cursor+(g.width-g.stroke)/2,y+g.height*.28,
        g.stroke,g.height*.44,color,{glow:lcd?0:glow,alpha:brightness});
      cursor+=g.advance;
    }
  }finally{ctx.restore();}
  return width;
}

// Bake the actual ROM at final device resolution; never enlarge a cached
// small glyph. This also preserves rotation, shear, inherited alpha and clip.
export function drawTraceVfdText(ctx,value,x,y,{fontSize=11,color='#8fcd87',
  align='left',tracking=.2,alpha=1,maxWidth=null}={}){
  const t=ctx.getTransform(),sx=Math.hypot(t.a,t.b),sy=Math.hypot(t.c,t.d);
  if(!(sx>0&&sy>0))return {width:0,height:0};
  ctx.save();
  try{
    ctx.setTransform(t.a/sx,t.b/sx,t.c/sy,t.d/sy,t.e,t.f);
    const measured=drawElectronicText(ctx,String(value),x*sx,y*sy,{fontSize:fontSize*sy,
      cellWidth:fontSize*.72*sx,tracking:tracking*sx,mode:'vfd',color,align,
      baseline:'middle',alpha,dpr:Math.max(sx,sy),
      maxWidth:Number.isFinite(maxWidth)?Math.max(0,maxWidth)*sx:undefined});
    return {width:measured.width/sx,height:measured.height/sy};
  }finally{ctx.restore();}
}
const textWidth=(text,fontSize,tracking=.2)=>String(text).length*fontSize*.72+Math.max(0,String(text).length-1)*tracking;
export function traceDbText(db,{decimals=1,available=true}={}){
  if(!available)return '--';
  const value=clamp(finite(db,-96),-96,0);
  return value<=-96?'-96':value.toFixed(decimals);
}

// Exact reference pins stay on the bar. Their legends occupy their own row;
// nearby SPOIL/CATCH/FLOOR labels are packed with leaders rather than merged,
// omitted by importance, or confused with the independent held-peak rail.
export function dualTraceMarkLabels(marks,{x=0,width,fontSize=11,gap=7}={}){
  const valid=(marks||[]).filter(mark=>mark&&Number.isFinite(mark.db)&&mark.db>=-48&&mark.db<=0&&mark.label)
    .map(mark=>({...mark,label:String(mark.label).toUpperCase(),target:x+dualTraceUnit(mark.db)*width}))
    .sort((a,b)=>a.target-b.target);
  if(!valid.length)return [];
  const left=x+textWidth('-48',fontSize)+gap,right=x+width-textWidth('0',fontSize)-gap;
  const available=Math.max(0,right-left),letters=valid.reduce((n,mark)=>n+mark.label.length,0);
  const size=Math.min(fontSize,Math.max(6,(available-gap*(valid.length-1)-valid.length)/Math.max(1,letters*.72)));
  let edge=left;
  const placed=valid.map(mark=>{
    const w=textWidth(mark.label,size),start=Math.max(edge,clamp(mark.target-w/2,left,right-w));
    edge=start+w+gap;return {...mark,left:start,right:start+w,width:w,fontSize:size};
  });
  edge=right;
  for(let i=placed.length-1;i>=0;i--){
    const mark=placed[i];mark.right=Math.min(mark.right,edge);mark.left=mark.right-mark.width;edge=mark.left-gap;
  }
  return placed;
}

export function dualTraceVfdLayout({x=0,y=0,w=626,h=82,scale=1.3888889,fontSize=11*scale}={}){
  const u=Math.min(scale,Math.max(.1,h/60)),f=Math.min(fontSize,13*u);
  const top=y+2*u+Math.max(0,(h-60*u)/2),right=x+w;
  const labelW=Math.min(82*u,w*.21),rmsX=x+labelW+8*u;
  const numberX=rmsX+f*2.42,digitH=17*u;
  const bodyX=x+Math.max(29*u,f*2.75),bodyW=Math.max(1,right-bodyX);
  return {x,y,w,h,u,fontSize:f,headerY:top+7*u,labelW,rmsX,numberX,digitH,
    digitY:top-2*u,unitX:numberX+measureSevenSegment('-96.0',digitH)+5*u,
    peakRight:right-42*u,clip:{x:right-32*u,y:top-1*u,w:32*u,h:12*u},
    body:{x:bodyX,y:top+18*u,w:bodyW,h:12*u},
    peak:{x:bodyX,y:top+33*u,w:bodyW,h:4*u},
    scaleY:top+50*u,scaleTickY:top+41*u,
    bodyLabelY:top+24*u,peakLabelY:top+36*u,
  };
}

export function paintDualTraceVfd(ctx,rect,model,{label='LEVEL',unit='dB',colors={},
  brightness=1,marks=[],warningAt=-6,scale=1.3888889,fontSize=11*scale}={}){
  const c={label:'#8fcd87',bar:'#8dde9a',hot:'#d3c75d',dormant:'#263c2a',peak:'#d6e0ad',
    meterMark:'#cba770',...colors};
  const g=dualTraceVfdLayout({...rect,scale,fontSize}),u=g.u,f=g.fontSize;
  const available=model?.available!==false,peakLabel=model?.peakKind==='sample'?'PK':'MAX';
  const text=(value,x,y,size=f,color=c.label,align='left',maxWidth=null)=>drawTraceVfdText(ctx,value,x,y,
    {fontSize:size,color,align,alpha:brightness,tracking:.2*u,maxWidth});
  const line=(x,y,xx,yy,color=c.meterMark,width=.8*u)=>{
    ctx.save();ctx.globalAlpha*=brightness;ctx.strokeStyle=color;ctx.lineWidth=width;
    ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();ctx.restore();
  };
  ctx.save();
  try{
    text(label,g.x,g.headerY,f,c.label,'left',g.labelW);
    text('RMS',g.rmsX,g.headerY);
    drawSevenSegmentNumber(ctx,traceDbText(model?.numericDb??model?.db,{available}),g.numberX,g.digitY,g.digitH,
      {color:c.bar,dormant:c.dormant,brightness,glow:1.1*u});
    const unitText=unit==='dBFS'&&model?.peakKind==='sample'?'dBFS':'dB';
    text(unitText,g.unitX,g.headerY,f,c.label);
    const peakValue=traceDbText(model?.numericPeakDb??model?.peakDb,{decimals:0,available}),peakH=12*u;
    const peakW=measureSevenSegment(peakValue,peakH),peakX=g.peakRight-peakW;
    text(peakLabel,peakX-6*u,g.headerY,f,c.peak,'right');
    drawSevenSegmentNumber(ctx,peakValue,g.peakRight,g.headerY-peakH/2,peakH,
      {color:c.peak,dormant:c.dormant,brightness,glow:1.1*u,align:'right'});
    ctx.save();ctx.globalAlpha*=model?.clipped?brightness:brightness*.18;
    if(model?.clipped){ctx.fillStyle=c.hot;ctx.fillRect(g.clip.x,g.clip.y,g.clip.w,g.clip.h);}
    drawTraceVfdText(ctx,'CLIP',g.clip.x+g.clip.w/2,g.clip.y+g.clip.h/2,
      {fontSize:10.5*u,color:model?.clipped?'#07120d':c.hot,align:'center',tracking:.2*u});ctx.restore();
    text('RMS',g.x,g.bodyLabelY);
    text(peakLabel,g.x,g.peakLabelY,f,c.peak);
    const cells=dualTraceCells({x:g.body.x,width:g.body.w,count:48,gap:2.4*u});
    const lit=available?clamp(Math.floor(finite(model?.segments48)),0,48):0;
    const peak=available?dualTracePeakIndex(model?.peakDb,48):-1;
    for(const cell of cells){
      const on=cell.index<lit,color=on?(cell.thresholdDb>=warningAt?c.hot:c.bar):c.dormant;
      drawTraceCell(ctx,cell.x,g.body.y,cell.w,g.body.h,color,
        {alpha:on?brightness:1,glow:on?1.1*u:0,chamfer:.8*u});
      drawTraceCell(ctx,cell.x,g.peak.y,cell.w,g.peak.h,cell.index===peak?c.peak:c.dormant,
        {alpha:cell.index===peak?brightness:.7,glow:cell.index===peak?1.1*u:0,chamfer:.8*u});
    }
    const labels=dualTraceMarkLabels(marks,{x:g.body.x,width:g.body.w,fontSize:f,gap:7*u});
    for(const db of [-48,-36,-24,-12,0]){
      const x=g.body.x+dualTraceUnit(db)*g.body.w,value=String(db),width=textWidth(value,f,.2*u);
      const align=db===-48?'left':db===0?'right':'center',left=x-(align==='right'?width:align==='center'?width/2:0);
      line(x,g.scaleTickY,x,g.scaleTickY+2.5*u,c.label,.7*u);
      if(labels.every(mark=>left+width+3*u<=mark.left||left>=mark.right+3*u))text(value,x,g.scaleY,f,c.label,align);
    }
    for(const mark of labels){
      line(mark.target,g.body.y-4*u,mark.target,g.body.y+g.body.h+1*u);
      const anchor=(mark.left+mark.right)/2;
      line(mark.target,g.scaleTickY,anchor,g.scaleY-f*.6,c.meterMark,.6*u);
      text(mark.label,anchor,g.scaleY,mark.fontSize,c.meterMark,'center');
    }
    return {...g,markLabels:labels,cells};
  }finally{ctx.restore();}
}
