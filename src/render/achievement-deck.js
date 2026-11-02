// MASTER INDEX: the recorder's real metal, momentary resin keys and VFD
// character hardware. Geometry is shared by rendering, picking and navigation.
import {uiDraw,uiDrawHardware,uiWithClip,uiWithHardwareLayer,uiCellMetrics} from './ui.js';
import {drawInstrumentPlate,drawInstrumentWell,drawInstrumentGlass} from './instrument-material.js';
import {drawHardwarePrint} from './hardware-faceplate.js';
import {hardwareMotionReduced} from './hardware-material.js';
import {drawElectronicText,measureElectronicText} from './electronic-text.js';
import {drawAchievementIconToCanvas} from './achievement-icons.js';
import {achievementPresentationCategory} from '../data/achievement-presentation.js';
import {drawAchievementResinKey,ACHIEVEMENT_RESIN_TONES} from './achievement-resin.js';

export const ACHIEVEMENT_DECK_COLORS=Object.freeze({text:'#dddcc8',muted:'#a8b39c',amber:'#edc086',green:'#b8d49d',ink:'#30372b'});
export const ACHIEVEMENT_DECK_TONES=ACHIEVEMENT_RESIN_TONES;
const C=ACHIEVEMENT_DECK_COLORS;
const px=(r,m)=>({x:r.x*m.cellW*m.dpr,y:r.y*m.cellH*m.dpr,w:r.w*m.cellW*m.dpr,h:r.h*m.cellH*m.dpr,dpr:m.dpr});
const finite=(v,d)=>Number.isFinite(v)?v:d;

/** Fixed phosphor advance, measured by the actual production character ROM.
 * Every word survives; long individual tokens split only as a last resort. */
export function achievementTextLines(text,widthPx,{fontPx=15,cellWidth=fontPx*.64}={}){
 const words=String(text??'').toUpperCase().split(/\s+/).filter(Boolean),out=[];
 const fits=s=>measureElectronicText(s,{fontSize:fontPx,cellWidth})<=widthPx+.001;
 let line='';
 for(let word of words){
  if(line&&fits(line+' '+word)){line+=' '+word;continue;}
  if(line){out.push(line);line='';}
  while(!fits(word)&&word.length>1){let n=Math.max(1,Math.floor(widthPx/cellWidth));out.push(word.slice(0,n));word=word.slice(n);}
  line=word;
 }
 if(line)out.push(line);
 return out;
}

export function drawAchievementVfd(text,x,y,{fontPx=15,width=null,color=C.text,alpha=1,align='left'}={}){
 uiDraw(m=>drawElectronicText(m.ctx,String(text??'').toUpperCase(),x*m.cellW*m.dpr,y*m.cellH*m.dpr,{
  mode:'vfd',fontSize:fontPx*m.dpr,cellWidth:fontPx*.64*m.dpr,dpr:m.dpr,
  color,alpha,align,baseline:'top',...(width==null?{}:{maxWidth:width*m.cellW*m.dpr}),
 }));
}

export function drawAchievementRule(x,y,w,{color='#78816d',alpha=.35}={}){
 uiDraw(m=>{m.ctx.globalAlpha*=alpha;m.ctx.fillStyle=color;m.ctx.fillRect(x*m.cellW*m.dpr,y*m.cellH*m.dpr,w*m.cellW*m.dpr,Math.max(.6,m.dpr*.6));});
}

/** Compatibility name for the shared shipping/platform-art resin cell. A saved
 * selection can illuminate it; only actual held actuation supplies travel. */
export function drawAchievementAnnunciator(ctx,id,{x=0,y=0,w,h,dpr=1,unlocked=false,concealed=false,selected=false,pressed=false,category=null,alpha=1}={}){
 if(!(w>0&&h>0))return null;
 ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));
 const semantic=category||achievementPresentationCategory(id),tone=ACHIEVEMENT_DECK_TONES[semantic]||ACHIEVEMENT_DECK_TONES.all;
 const light=unlocked?(selected?.94:.8):(selected?.25:.13);
 const shape=drawAchievementResinKey(ctx,x,y,w,h,{dpr,category:semantic,pressed,light,enabled:true,focused:selected});
 const inset=Math.max(1*dpr,Math.min(w,h)*.035),content=shape.content,size=Math.max(1,Math.min(content.w,content.h)-inset*2);
 drawAchievementIconToCanvas(ctx,id,{x:content.x+(content.w-size)/2,y:content.y+(content.h-size)/2,w:size,h:size,dpr,
  unlocked,concealed,alpha:1,color:tone.ink,frame:false,material:'ink'});
 ctx.restore();return shape;
}

export function drawAchievementCell(id,rect,options={}){
 // Physical resin keys sit in front of the display cover, like the transport
 // controls. Their fixed hit housing is shared with the matrix layout.
 uiDrawHardware(m=>drawAchievementAnnunciator(m.ctx,id,{...px(rect,m),...options}));
}

/** Normally-open resin control; selection retains lamp state, never travel. */
export function drawAchievementDeckControl(rect,label,{selected=false,focused=false,enabled=true,pressed=false,category='all'}={}){
 uiDrawHardware(m=>{const r=px(rect,m),tone=ACHIEVEMENT_DECK_TONES[category]||ACHIEVEMENT_DECK_TONES.all;
  const shape=drawAchievementResinKey(m.ctx,r.x,r.y,r.w,r.h,{dpr:m.dpr,category,pressed,light:selected?.92:.26,enabled,focused});
  drawHardwarePrint(m.ctx,label,shape.content.x,shape.content.y,{width:shape.content.w,height:shape.content.h,
   color:tone.ink,dpr:m.dpr,align:'center',finish:'screenprint',darkPanel:false});});
}

/** The metal shell has real printed service markings; all information inside
 * the aperture is emitted by the actual VFD glyph ROM. */
export function withAchievementDeck(rect,{label='MASTER INDEX',completion=null,footer=''}={},draw){
 const cellH=uiCellMetrics().cellH,header=Math.max(5.4,104/cellH);
 const body={x:rect.x+2,y:rect.y+header,w:Math.max(1,rect.w-4),h:Math.max(1,rect.h-header-2)};
 const aperture={x:body.x-.55,y:body.y-.35,w:body.w+1.1,h:body.h+.7};
 uiDraw(m=>{
  const r=px(rect,m);drawInstrumentPlate(m.ctx,{...r,finish:'aluminum',seed:'achievement-master-index',fasteners:true});
  drawHardwarePrint(m.ctx,label,r.x+18*m.dpr,r.y+11*m.dpr,{dpr:m.dpr,width:r.w*.58,height:18*m.dpr,
   color:C.ink,finish:'etched',darkPanel:false});
  drawHardwarePrint(m.ctx,'ELLERY / FIELD RECORDING',r.x+18*m.dpr,r.y+33*m.dpr,{dpr:m.dpr,width:r.w*.54,height:12*m.dpr,
   color:'#3e4738',finish:'faceplate',darkPanel:false});
  if(completion){
   const countW=Math.min(178*m.dpr,r.w*.33),count={x:r.x+r.w-countW-18*m.dpr,y:r.y+10*m.dpr,w:countW,h:43*m.dpr,dpr:m.dpr};
   drawInstrumentWell(m.ctx,{...count,depth:1});
   const value=`${completion.completed} / ${completion.total}`;
   drawElectronicText(m.ctx,value,count.x+count.w/2,count.y+12*m.dpr,{mode:'vfd',fontSize:20*m.dpr,cellWidth:12*m.dpr,
    maxWidth:count.w-16*m.dpr,baseline:'top',align:'center',color:completion.complete?C.green:C.amber,dpr:m.dpr});
   drawInstrumentGlass(m.ctx,{...count,depth:1,reflection:.35,reducedMotion:hardwareMotionReduced()});
  }
  drawInstrumentWell(m.ctx,{...px(aperture,m),depth:1});
 });
 let result;
 uiWithHardwareLayer(()=>uiWithClip(body,()=>{result=draw?.(body);}),
  ()=>uiDraw(m=>drawInstrumentGlass(m.ctx,{...px(aperture,m),depth:1,reflection:.25,reducedMotion:hardwareMotionReduced()})));
 if(footer)uiDraw(m=>{const r=px(rect,m);drawHardwarePrint(m.ctx,footer,r.x+18*m.dpr,r.y+r.h-23*m.dpr,{dpr:m.dpr,
  width:r.w-36*m.dpr,height:12*m.dpr,color:'#343e30',finish:'faceplate',darkPanel:false});});
 return body;
}

/** All returned bounds use the same UI cells as pointer events. On a full
 * panel all 38 slots fit; short views scroll rows, never shrink to unreadable
 * postage stamps. Compact inspection uses the same selected entry. */
export function achievementGridLayout(body,count,{detailOpen=false,cellW=8.45,cellH=20}={}){
 const compact=body.w*cellW<680||body.h*cellH<300;
 const content={x:body.x,y:body.y+2.6,w:body.w,h:Math.max(1,body.h-5)};
 const gapPx=7,gridW=compact?content.w:content.w*.55;
 const target=compact?49:54;
 const columns=Math.max(2,Math.min(8,Math.floor((gridW*cellW+gapPx)/(target+gapPx))));
 const widthPx=(gridW*cellW-gapPx*(columns-1))/columns;
 const cellPx=Math.min(60,widthPx,Math.max(20,content.h*cellH)),strideX=(cellPx+gapPx)/cellW,strideY=(cellPx+gapPx)/cellH;
 const visibleRows=Math.max(1,Math.floor((content.h*cellH+gapPx)/(cellPx+gapPx)));
 const totalRows=Math.ceil(Math.max(0,count)/columns);
 const detail=compact&&detailOpen?{x:body.x,y:body.y+.35,w:body.w,h:Math.max(1,body.h-1.35)}
  :{x:compact?content.x:content.x+gridW+2.1,y:content.y,w:compact?content.w:content.w-gridW-2.1,h:content.h};
 return{compact,detailOnly:compact&&detailOpen,content,grid:{x:content.x,y:content.y,w:gridW,h:content.h},detail,
  columns,cellW:cellPx/cellW,cellH:cellPx/cellH,strideX,strideY,visibleRows,totalRows,capacity:columns*visibleRows,
  cell:(index,startRow=0)=>({x:content.x+(index%columns)*strideX,y:content.y+(Math.floor(index/columns)-startRow)*strideY,w:cellPx/cellW,h:cellPx/cellH}),
 };
}

export function achievementNoticeLayout({cols,rows,cellW=8.45,cellH=20,title='',reason=''}={}){
 const physicalWidth=Math.max(180,(cols-4)*cellW),wPx=Math.min(422,physicalWidth);
 const stacked=wPx<350,textWidth=wPx-(stacked?44:120),fontPx=stacked?17:18;
 const titleLines=achievementTextLines(title,textWidth,{fontPx}),reasonLines=achievementTextLines(reason,textWidth,{fontPx:13});
 const needed=stacked?64+titleLines.length*22+reasonLines.length*17+29:39+titleLines.length*22+reasonLines.length*17+22;
 const hPx=Math.min(Math.max(128,needed),Math.max(100,(rows-2)*cellH));
 const w=wPx/cellW,h=hPx/cellH;
 return{x:Math.max(1,cols-w-2),y:Math.max(.5,rows-h-1.5),w,h,stacked,fontPx,titleLines,reasonLines,textWidth,hPx,wPx};
}

export function drawAchievementNotice(rect,{title,reason,completed,total,icon,alpha=1}={}){
 uiDraw(m=>{
  const tone=ACHIEVEMENT_DECK_TONES[achievementPresentationCategory(icon)]||ACHIEVEMENT_DECK_TONES.all;
  const r=px(rect,m),q=v=>v*m.dpr; m.ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));
  drawInstrumentPlate(m.ctx,{...r,finish:'aluminum',seed:'achievement-notice',fasteners:true});
  drawHardwarePrint(m.ctx,'ACHIEVEMENT FILED',r.x+q(13),r.y+q(9),{dpr:m.dpr,width:r.w-q(100),height:q(12),color:C.ink,finish:'faceplate',darkPanel:false});
  const tally={x:r.x+r.w-q(86),y:r.y+q(6),w:q(73),h:q(18),dpr:m.dpr};
  drawInstrumentWell(m.ctx,{...tally,depth:.65});
  drawElectronicText(m.ctx,`${completed} / ${total}`,tally.x+tally.w/2,tally.y+q(4),{mode:'vfd',fontSize:q(11),cellWidth:q(7.04),dpr:m.dpr,
   color:C.amber,align:'center',baseline:'top',maxWidth:tally.w-q(9)});
  drawInstrumentGlass(m.ctx,{...tally,depth:.65,reflection:.25,reducedMotion:hardwareMotionReduced()});
  const stacked=rect.stacked,display={x:r.x+q(stacked?10:84),y:r.y+q(stacked?57:29),w:r.w-q(stacked?20:95),h:r.h-q(stacked?67:40),dpr:m.dpr};
  drawInstrumentWell(m.ctx,{...display,depth:1});
  drawAchievementAnnunciator(m.ctx,icon,{x:r.x+q(12),y:r.y+q(stacked?28:35),w:q(stacked?35:59),h:q(stacked?25:65),dpr:m.dpr,unlocked:true});
  const tx=display.x+q(11),fontPx=rect.fontPx||18,cw=fontPx*.64;
  let yy=display.y+q(9);
  for(const line of rect.titleLines||[title]){drawElectronicText(m.ctx,line,tx,yy,{mode:'vfd',fontSize:q(fontPx),cellWidth:q(cw),dpr:m.dpr,color:tone.signal,baseline:'top'});yy+=q(22);}
  yy+=q(7);
  for(const line of rect.reasonLines||[reason]){drawElectronicText(m.ctx,line,tx,yy,{mode:'vfd',fontSize:q(13),cellWidth:q(13*.64),dpr:m.dpr,color:C.text,baseline:'top'});yy+=q(17);}
  drawInstrumentGlass(m.ctx,{...display,depth:1,reflection:.30,reducedMotion:hardwareMotionReduced()});
 });
}
