// The approved recorder, not the old transport UI with a new skin. Geometry,
// continuous legends, formed electrodes, and bottom keys come from the study.
// Only the readings come from gameplay; no decorative waveform or fake meter.
import { uiDraw, uiCellMetrics, uiCurrentScale, uiWithClip, uiWithHardwareLayer } from './ui.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass, drawVfdGrid } from './instrument-material.js';
import { sampleControl } from '../game/control-mechanics.js';
import { hardwareMotionReduced } from './hardware-material.js';
import { dbToUnit, dbForLinear, locationMarks, meterMarks } from './meter.js';
import { uiBrightness, vfdSettings, themeForSurface } from './palette.js';
import { normalizeFieldKit } from '../game/field-kit.js';
import { drawElectronicText } from './electronic-text.js';
import { drawWitnessChassis, witnessEndingIds } from './witness-material.js';

let appearance=Object.freeze(normalizeFieldKit().cosmetics),displayAppearance=null,witnessEndings=Object.freeze([]);
/** Saved, cosmetic-only defaults. A workbench preview never mutates these. */
export function setRecorderAppearance(cosmetics={}, {endingIds=[]}={}){
  appearance=Object.freeze(normalizeFieldKit({cosmetics}).cosmetics);
  witnessEndings=Object.freeze(witnessEndingIds(endingIds));
  return {...appearance};
}
export function recorderAppearance(view={}){
  return normalizeFieldKit({cosmetics:{
    faceplate:view.finish??appearance.faceplate,
    buttons:view.buttonSet??appearance.buttons,
    vfd:view.phosphor??appearance.vfd,
  }}).cosmetics;
}
const PHOSPHORS={
  faithful:{label:'#8fcd87',counter:'#b4f4e6',passive:'#4a5a46',scale:'#52713c',cursor:'#f39864',mark:'#c5aa63',bar:'#8dde9a',hot:'#d3c75d',dormant:'#263c2a',peak:'#d6e0ad',meterMark:'#cba770'},
  amber:{label:'#e9b765',counter:'#ffdba0',passive:'#60523a',scale:'#775937',cursor:'#fff0c2',mark:'#db935a',bar:'#e9b05c',hot:'#ffd796',dormant:'#423523',peak:'#ffeac3',meterMark:'#e7c787'},
  ice:{label:'#9ed9e7',counter:'#d0f4fc',passive:'#405860',scale:'#476570',cursor:'#ecfaff',mark:'#78b6d4',bar:'#9ddce8',hot:'#d4f1f7',dormant:'#253c43',peak:'#e2f8ff',meterMark:'#b1d2e6'},
};
/** Explicit accessibility phosphor overrides still outrank cosmetic colors. */
export function recorderDisplayPalette(view=null){
  const selected=view?recorderAppearance(view):displayAppearance||appearance;
  const palette=PHOSPHORS[selected.vfd]||PHOSPHORS.faithful;
  if(vfdSettings.phosphor==='faithful')return {...palette};
  const theme=themeForSurface('green');
  return {...palette,label:theme.phosphor,counter:theme.counter,cursor:theme.counter,
    bar:theme.phosphor,hot:theme.counter,peak:theme.counter,mark:theme.phosphor,meterMark:theme.phosphor};
}
const PLASTICS={
  ivory:['#d0d0bd','#bcbda9','#adad97','#878a76','#f9f4df'],
  red:['#d79680','#bc6b57','#a95240','#753d32','#f0bc9b'],
  amber:['#e1c177','#c9a151','#b98a3d','#836331','#fff0bc'],
  blue:['#9fbcc7','#729aa9','#567d90','#3a586a','#d0e6e7'],
  yellow:['#e4d58a','#d0bc64','#bca94f','#81783b','#fff4c0'],
  coral:['#e5b79e','#d09179','#b87661','#835443','#ffe0be'],
  green:['#c3d3b4','#a7bda0','#8fa98b','#647d64','#e7f0d4'],
};
const BUTTON_SETS={classic:['red','ivory','amber'],signal:['red','blue','yellow'],'sea-glass':['coral','green','ivory']};

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const labelCache=new Map();
const fill=(c,x,y,w,h,color,r=0)=>{c.fillStyle=color;if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h);};
const line=(c,x,y,xx,yy,color,width=1)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
function gradient(c,x,y,w,h,stops){const g=c.createLinearGradient(x,y,x+w,y+h);for(const [p,color]of stops)g.addColorStop(p,color);return g;}
// Native type belongs only to physical ink on the faceplate and key caps.
function text(c,value,x,y,size,color,tracking=0,align='left'){
  value=String(value);c.font=`400 ${size}px Arial,Helvetica,sans-serif`;c.textBaseline='alphabetic';c.textAlign='left';c.fillStyle=color;
  const key=`${size}:${tracking}:${value}`;let metrics=labelCache.get(key);
  if(!metrics){const glyphs=[...value],widths=glyphs.map(a=>c.measureText(a).width);metrics={glyphs,widths,width:widths.reduce((a,b)=>a+b,0)+Math.max(0,glyphs.length-1)*tracking};if(labelCache.size>160)labelCache.clear();labelCache.set(key,metrics);}
  let px=x-(align==='center'?metrics.width/2:align==='right'?metrics.width:0);
  metrics.glyphs.forEach((a,i)=>{c.fillText(a,px,y);px+=metrics.widths[i]+tracking;});
}
function etch(c,value,x,y,size=11,tracking=.65,align='left',dark=false){
  text(c,value,x+.1,y+.27,size,dark?'rgba(238,234,206,.19)':'rgba(255,255,241,.48)',tracking,align);
  text(c,value,x-.09,y-.16,size,dark?'rgba(9,17,11,.75)':'rgba(56,56,45,.4)',tracking,align);
  text(c,value,x,y,size,dark?'#d7d9bd':'#333830',tracking,align);
}

/** All public rectangles use the existing UI cell coordinate system. */
export function recorderFaceLayout(rect){
  if(!rect)return null;
  const {cellW,cellH}=uiCellMetrics(),pw=rect.w*cellW,ph=rect.h*cellH;
  const unit=Math.max(.01,Math.min(uiCurrentScale(),ph/405));
  const box=(x,y,w,h)=>({x:rect.x+x*unit/cellW,y:rect.y+y*unit/cellH,w:Math.max(0,w*unit/cellW),h:Math.max(0,h*unit/cellH)});
  const W=pw/unit,H=ph/unit,small=W<580;
  const displayRect=box(35,76,W-70,H-166);
  const body=box(55,96,W-110,H-206);
  const gap=10,buttonW=Math.min(89,(W-68-gap*2)/3),buttonH=33;
  const buttonSlots=Array.from({length:3},(_,i)=>box(W-34-3*buttonW-2*gap+i*(buttonW+gap),H-38-buttonH,buttonW,buttonH));
  return {rect,unit,W,H,compact:small,displayRect,body,transcriptRect:body,listRect:body,buttonSlots,
    counterRect:box(55,120,small?W-120:(W-70)*.43,small?70:91),
    locationRect:small?null:box(35+(W-70)*.49,124,(W-70)*.51-22,94),
    outputRect:box(55,H-143,W-110,40)};
}

// Special-mode prose is a character display, not illuminated native type.
// Preserve the authored transcript's exact cell advance, wrapping and hits.
export function drawRecorderDisplayText(x,y,value,{width=null,color='#8fcd87',size=12,alpha=1,lineHeight=1}={}){
  const palette=recorderDisplayPalette();
  color=color==='#b4f4e6'?palette.counter:color==='#e4bd78'?palette.meterMark:color==='#8fcd87'?palette.label:color;
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    ctx.save();try{
      const px=x*cellW*dpr,py=y*cellH*dpr,rowH=cellH*dpr*lineHeight;
      const maxWidth=width==null?undefined:Math.max(0,width)*cellW*dpr;
      if(maxWidth!=null){ctx.beginPath();ctx.rect(px,py,maxWidth,rowH);ctx.clip();}
      drawElectronicText(ctx,value,px,py+rowH/2,{fontSize:Math.min(size*uiCurrentScale()*dpr,rowH*.86),
        color,mode:'vfd',align:'left',baseline:'middle',alpha:alpha*uiBrightness(),dpr,
        cellWidth:cellW*dpr,tracking:0,maxWidth});
    }finally{ctx.restore();}
  });
}

/** The level-check uses the same electrodes and scoped phosphor as the take
 * display. It reads the room snapshot, never a generated demonstration level.
 */
export function drawRecorderCheckMeter(x,y,width,snapshot,{thresholdDb=-12}={}){
  const colors=recorderDisplayPalette();
  const db=Number.isFinite(snapshot?.db)?snapshot.db:dbForLinear(finite(snapshot?.rms));
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const px=x*cellW*dpr,py=(y+.24)*cellH*dpr,w=Math.max(0,width)*cellW*dpr;
    if(w<=0)return;
    const count=Math.max(8,Math.floor(w/(9*dpr*uiCurrentScale()))),lit=Math.ceil(dbToUnit(db)*count);
    const height=.44*cellH*dpr,step=w/count,gap=Math.min(step*.28,2.4*dpr*uiCurrentScale());
    ctx.save();try{
      for(let i=0;i<count;i++){
        const on=i<lit,color=on?(snapshot?.clipped||db>=thresholdDb?colors.hot:colors.bar):colors.dormant;
        ctx.save();if(on){ctx.globalAlpha*=uiBrightness();ctx.shadowColor=color;ctx.shadowBlur=3*dpr;}
        else{ctx.shadowColor='transparent';ctx.shadowBlur=0;}
        fill(ctx,px+i*step,py,step-gap,height,color,.6*dpr);ctx.restore();
      }
      if(Number.isFinite(snapshot?.peakDb)&&snapshot.peakDb>db){
        const peakX=px+dbToUnit(snapshot.peakDb)*w;
        line(ctx,peakX,py,peakX,py+height,colors.peak,dpr);
      }
    }finally{ctx.restore();}
  });
}

const polygons=[[[10,1],[37,1],[42,6],[36,11],[11,11],[6,6]],[[40,8],[44,11],[42,33],[37,37],[33,32],[35,14]],[[37,39],[41,43],[39,65],[33,70],[29,65],[32,45]],[[10,65],[28,65],[34,71],[28,76],[7,76],[2,70]],[[3,39],[8,44],[6,63],[1,68],[-2,63],[0,44]],[[7,9],[11,13],[9,31],[4,36],[0,31],[2,13]],[[9,33],[32,33],[37,38],[31,43],[9,43],[4,38]]];
const digits={0:[0,1,2,3,4,5],1:[1,2],2:[0,1,6,4,3],3:[0,1,6,2,3],4:[5,6,1,2],5:[0,5,6,2,3],6:[0,5,6,2,3,4],7:[0,1,2],8:[0,1,2,3,4,5,6],9:[0,1,2,3,5,6],'-':[6]};
const advance=char=>char===':'?12:char==='.'?8:52;
function digit(c,char,x,y,s,color,brightness,passive){
  c.save();c.translate(x,y);c.scale(s,s);
  const baseAlpha=c.globalAlpha;
  polygons.forEach((p,i)=>{
    const on=(digits[char]||[]).includes(i);c.beginPath();p.forEach(([xx,yy],j)=>j?c.lineTo(xx,yy):c.moveTo(xx,yy));c.closePath();
    c.globalAlpha=baseAlpha*(on?brightness:.19);c.fillStyle=on?color:passive;c.shadowColor=on?color:'transparent';c.shadowBlur=on?3.5:0;c.fill();
  });c.restore();
}
export function recorderOutputReading(view={}){
  if(view.meter)return {snapshot:view.meter,label:view.meterLabel||'OUTPUT LEVEL',marks:view.meterMarks};
  if(view.roomMeter)return {snapshot:view.roomMeter,label:'ROOM MIC',marks:null};
  if(view.levels)return {snapshot:{db:dbForLinear(Math.max(finite(view.levels.left),finite(view.levels.right)))},label:'OUTPUT LEVEL',marks:null};
  return {snapshot:{db:-96},label:'OUTPUT LEVEL',marks:null};
}
function readout(c,view,g){
  const w=g.W-70,h=g.H-166,small=g.compact,b=uiBrightness();
  const colors=recorderDisplayPalette(view),green=colors.label,cyan=view.counterColor||colors.counter;
  const glow=(value,x,y,size=11,color=green,tracking=.6,align='left')=>{
    // Bake electrode tiles at their final pixel resolution, not at the 11px
    // design size and then magnify them for retina/UI scale or the GLB map.
    // Normalized basis vectors retain rotation/shear; independent axis scales
    // retain a non-square substrate. Existing device-space clipping survives.
    const t=c.getTransform(),sx=Math.hypot(t.a,t.b),sy=Math.hypot(t.c,t.d);
    if(!sx||!sy)return;
    c.save();try{
      c.setTransform(t.a/sx,t.b/sx,t.c/sy,t.d/sy,t.e,t.f);
      drawElectronicText(c,value,x*sx,(y-size*.42)*sy,{fontSize:size*sy,
        cellWidth:size*.72*sx,color,mode:'vfd',align,baseline:'middle',alpha:b,
        dpr:Math.max(sx,sy),tracking:tracking*sx});
    }finally{c.restore();}
  };
  glow(view.counterLabel||'TIME COUNTER',20,29,11,green,.7);
  const value=String(view.counter||'00:00').replace(/^(\d):/,'0$1:');
  const maxW=small?w-40:w*.43,units=[...value].reduce((n,ch)=>n+advance(ch),0);
  const s=Math.min(small?.79:1.08,maxW/Math.max(1,units));let px=21;
  for(const ch of value){
    if(ch===':'){
      for(const yy of [28,48]){c.save();c.globalAlpha*=b;c.shadowColor=cyan;c.shadowBlur=3;fill(c,px+2*s,48+yy*s,3*s,3*s,cyan);c.restore();}px+=12*s;
    }else if(ch==='.'){
      c.save();c.globalAlpha*=b;c.shadowColor=cyan;c.shadowBlur=3;fill(c,px,48+72*s,3*s,3*s,cyan);c.restore();px+=8*s;
    }else{digit(c,ch,px,48,s,cyan,b,colors.passive);px+=52*s;}
  }
  if(value.includes(':'))glow('MIN',21+34*s,48+92*s,11,green,.6,'center');
  glow('SEC',21+141*s,48+92*s,11,green,.6,'center');
  if(!small){
    const sx=w*.49,sw=w-sx-22,duration=Math.max(1,finite(view.locationSeconds,45));
    glow('LOCATION INDICATOR',sx,29,11,green,.45);
    const minor=duration<=60?2.5:duration<=120?5:duration<=300?15:30;
    const major=duration<=60?5:duration<=120?15:duration<=300?30:60;
    for(let seconds=0;seconds<=duration;seconds+=minor){
      const xx=sx+seconds/duration*sw;
      line(c,xx,48,xx,106,colors.scale,1.1);
      if(seconds%major===0)glow(String(seconds),xx,121,11,green,0,'center');
    }
    line(c,sx,95,sx+sw,95,green,.9);
    c.save();c.globalAlpha*=b;c.shadowColor=colors.cursor;c.shadowBlur=4;fill(c,sx+clamp(view.progress)*sw-2,65,4,32,colors.cursor,1);c.restore();
    for(const mark of locationMarks(view.locationMarks,sw))line(c,sx+mark.x,98,sx+mark.x,105,colors.mark,.8);
    glow('START',sx,139,11,green,.4);glow('END',sx+sw,139,11,green,.4,'right');
  }
  const reading=recorderOutputReading(view),my=h-53,barW=w-40,count=Math.max(8,Math.floor(barW/9)),bw=barW/count-2.4;
  const db=Number.isFinite(reading.snapshot?.db)?reading.snapshot.db:dbForLinear(finite(reading.snapshot?.rms));
  const activeCount=Math.ceil(dbToUnit(db)*count);
  glow(reading.label,20,my-12,11,green,.65);
  for(let i=0;i<count;i++){
    const active=i<activeCount,color=active?(i/count>.87?colors.hot:colors.bar):colors.dormant;
    c.save();if(active){c.globalAlpha*=b;c.shadowColor=color;c.shadowBlur=3;}fill(c,20+i*barW/count,my,bw,10,color,.6);c.restore();
  }
  [-48,-36,-24,-12,0].forEach((n,i)=>glow(String(n),20+i*(barW-6)/4,my+28,11,green,.15));
  const peak=reading.snapshot?.peakDb;
  if(Number.isFinite(peak)&&peak>db){const xx=20+dbToUnit(peak)*barW;line(c,xx,my,xx,my+10,colors.peak,1);}
  for(const mark of meterMarks(reading.marks,barW)){
    const xx=20+mark.x;line(c,xx,my-3,xx,my+11,colors.meterMark,.8);
    if(mark.label)glow(mark.label,xx,my-5,10,colors.meterMark,.25,'center');
  }
  // No extra legacy status strip inside the display: status belongs in the
  // existing etched footer, leaving the approved spacing and black depth.
}
/** The same electrode artwork for a physical GLB's under-glass substrate.
 * Native canvas only: no UI context redirection or saved appearance mutation.
 * The model supplies the glass, recess, and reflection above this plane.
 */
export function drawRecorderReadoutCanvas(ctx,{width=666,height=239,...view}={}){
  if(!ctx||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return false;
  ctx.save();
  try{
    ctx.scale(width/666,height/239);
    fill(ctx,0,0,666,239,'#07120d');
    readout(ctx,view,{W:736,H:405,compact:false});
    const counter=String(view.counter||'00:00').replace(/^(\d):/,'0$1:');
    const units=[...counter].reduce((n,ch)=>n+advance(ch),0),scale=Math.min(1.08,666*.43/Math.max(1,units));
    drawVfdGrid(ctx,{x:17,y:44,w:units*scale+4,h:83*scale,dpr:1,reducedMotion:true});
  }finally{ctx.restore();}
  return true;
}
function button(c,slot,label,key,plastic,state){
  const press=clamp(state.travel),{x,y,w,h}=slot;
  c.save();c.translate(x,y+press);c.shadowColor='#1118';c.shadowBlur=4;c.shadowOffsetY=4-press;
  fill(c,0,0,w,h,'#4d514d',3);c.shadowBlur=0;c.shadowOffsetY=0;
  fill(c,0,0,w,3,'#a3a59b');fill(c,0,0,3,h,'#8e9288');
  fill(c,3,3,w-6,h-6,gradient(c,0,0,0,h,[[0,plastic[0]],[.28,plastic[1]],[.78,plastic[2]],[1,plastic[3]]]),1);
  line(c,4,4,w-4,4,plastic[4],.7);line(c,3,h-2,w-3,h-2,'#242b26',1);
  const alpha=key.enabled===false?.5:1;c.globalAlpha*=alpha;
  text(c,label,w/2-4,h/2+3.7,11,'#262e26',.8,'center');
  const lit=!!key.lit,cx=w-12,cy=h/2;
  c.beginPath();c.arc(cx,cy,2.5,0,Math.PI*2);c.fillStyle=lit?'#cc7c30':'#4a3422';c.fill();
  if(key.selected||key.focused)line(c,8,h+3,w-8,h+3,'#bfc7a9',1);
  c.restore();
}

export function drawRecorderInstrument(view={}, {drawContent=null}={}){
  const g=recorderFaceLayout(view.rect);if(!g)return null;
  const selectedAppearance=recorderAppearance(view),dark=selectedAppearance.faceplate!=='aluminum',witness=selectedAppearance.faceplate==='witness';
  const defaults=[{id:'rec',label:'REC'},{id:'stop',label:'STOP'},{id:'takes',label:'TAKES'}];
  const keys=defaults.map((fallback,i)=>view.buttons?.keys?.[i]||{...fallback,enabled:false});
  // Sample once: the visible stem and its key cap must describe the same
  // mechanical instant, even when painting the under-shell layer is costly.
  const keyStates=keys.map(key=>sampleControl(key.controlId||`recorder:${key.id}`,{
    lit:!!key.lit,enabled:key.enabled!==false,reducedMotion:hardwareMotionReduced(),
  }));
  const {cellW:layoutCellW,cellH:layoutCellH}=uiCellMetrics();
  const designSlots=g.buttonSlots.map(slot=>({x:(slot.x-view.rect.x)*layoutCellW/g.unit,
    y:(slot.y-view.rect.y)*layoutCellH/g.unit,w:slot.w*layoutCellW/g.unit,h:slot.h*layoutCellH/g.unit}));
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const u=dpr*g.unit,px=view.rect.x*cellW*dpr,py=view.rect.y*cellH*dpr;
    if(witness)drawWitnessChassis(ctx,{x:px,y:py,w:g.W,h:g.H,dpr:u,buttonSlots:designSlots,
      keys:keys.map((key,i)=>({...key,...keyStates[i]})),endings:view.witnessEndings??witnessEndings,
      phosphor:recorderDisplayPalette(view).label,illumination:uiBrightness()});
    else drawInstrumentPlate(ctx,{x:px+12*u,y:py+15*u,w:(g.W-24)*u,h:(g.H-35)*u,dpr:u,
      seed:'approved-recorder',finish:selectedAppearance.faceplate,screwRadius:7*u,screwInset:13*u});
    drawInstrumentWell(ctx,{x:px+35*u,y:py+76*u,w:(g.W-70)*u,h:(g.H-166)*u,dpr:u});
  });
  uiWithHardwareLayer(()=>uiWithClip(g.displayRect,()=>{
    if(drawContent){
      const previous=displayAppearance;displayAppearance=selectedAppearance;
      try{drawContent(g);}finally{displayAppearance=previous;}
      return;
    }
    uiDraw(({ctx,dpr,cellW,cellH})=>{
      ctx.save();ctx.translate(g.displayRect.x*cellW*dpr,g.displayRect.y*cellH*dpr);ctx.scale(dpr*g.unit,dpr*g.unit);readout(ctx,view,g);ctx.restore();
      const counter=String(view.counter||'00:00').replace(/^(\d):/,'0$1:');
      const units=[...counter].reduce((n,ch)=>n+advance(ch),0);
      const scale=Math.min(g.compact?.79:1.08,((g.compact?g.W-110:(g.W-70)*.43))/Math.max(1,units));
      drawVfdGrid(ctx,{x:g.counterRect.x*cellW*dpr-3*g.unit*dpr,y:g.counterRect.y*cellH*dpr,
        w:(units*scale+4)*g.unit*dpr,h:83*scale*g.unit*dpr,dpr:dpr*g.unit,reducedMotion:hardwareMotionReduced()});
    });
  }),()=>uiDraw(({ctx,dpr,cellW,cellH})=>drawInstrumentGlass(ctx,{
    x:g.displayRect.x*cellW*dpr,y:g.displayRect.y*cellH*dpr,w:g.displayRect.w*cellW*dpr,h:g.displayRect.h*cellH*dpr,
    dpr:dpr*g.unit,reflection:.7,depth:1,reducedMotion:hardwareMotionReduced(),
  })));
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const u=dpr*g.unit;ctx.save();ctx.translate(view.rect.x*cellW*dpr,view.rect.y*cellH*dpr);ctx.scale(u,u);
    // WITNESS legends live on the underside of its shell; overprinting this
    // metal faceplate's legends would obscure the physical components.
    if(!witness){
      etch(ctx,'AUDIOCORP',35,48,g.compact?12:14,1.1,'left',dark);
      if(!g.compact)etch(ctx,'DA–1000',g.W*.5,48,11,.75,'center',dark);
      etch(ctx,'FIELD RECORDER',g.W-36,48,11,.35,'right',dark);
    }
    if(!witness&&!g.compact){
      const foot=String(view.note||view.footer||view.label||'RECORD / MONITOR').toUpperCase();
      ctx.save();ctx.beginPath();ctx.rect(35,g.H-72,Math.max(0,g.W-395),42);ctx.clip();
      etch(ctx,foot,35,g.H-55,11,.6,'left',dark);etch(ctx,'VACUUM FLUORESCENT',35,g.H-39,11,.85,'left',dark);ctx.restore();
    }
    designSlots.forEach((slot,i)=>{
      const key=keys[i];
      button(ctx,slot,key.label||defaults[i].label,key,PLASTICS[BUTTON_SETS[selectedAppearance.buttons][i]],keyStates[i]);
    });ctx.restore();
  });
  return g.body;
}
