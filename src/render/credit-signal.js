// THE UNHEARD TRACK. The actual character ROM, on an owned dark reading
// ground. A credited name never inherits the instrument's flicker/scan duty.
import {uiDraw,uiSize,uiCellMetrics} from './ui.js';
import {drawElectronicText,measureElectronicText} from './electronic-text.js';
import {hardwareMotionReduced} from './hardware-material.js';
import {assetUrl} from '../platform/paths.js';

export const CREDIT_SIGNAL_COLORS=Object.freeze({ground:'#030608',text:'#dceade',label:'#93b5a9',muted:'#9baea6',trace:'#46675d',focus:'#dceade'});
const C=CREDIT_SIGNAL_COLORS;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const round=(n,dpr)=>Math.round(n*dpr)/dpr;
let recordFontPromise=null;
export function warmCreditRecordFont(){
  if(recordFontPromise)return recordFontPromise;
  if(typeof FontFace!=='function'||typeof document==='undefined'||!document.fonts)return Promise.resolve(false);
  const face=new FontFace('Credit Record Mono',`url("${assetUrl('assets/fonts/NimbusMonoPS-Regular.otf')}")`,{weight:'400'});
  recordFontPromise=face.load().then(font=>{document.fonts.add(font);return true;}).catch(()=>false);
  return recordFontPromise;
}

/** Fixed-advance ROM wrapping. Whitespace breaks first; a long indivisible
 * token is split without dropping a character. No maxWidth glyph squeezing. */
export function wrapCreditSignalText(text,widthPx,fontPx=18,{uppercase=true}={}){
  const value=uppercase?String(text??'').toUpperCase():String(text??'');
  if(!value)return [''];
  const width=Math.max(1,Number(widthPx)||1),cellWidth=Math.max(1,fontPx*.66);
  const fits=t=>measureElectronicText(t,{fontSize:fontPx,cellWidth})<=width+1e-7;
  const output=[];
  for(const paragraph of value.split('\n')){
    let line='';
    for(let word of paragraph.split(/\s+/).filter(Boolean)){
      if(line&&fits(line+' '+word)){line+=' '+word;continue;}
      if(line){output.push(line);line='';}
      while(!fits(word)&&[...word].length>1){const chars=[...word],n=Math.max(1,Math.floor(width/cellWidth));output.push(chars.slice(0,n).join(''));word=chars.slice(n).join('');}
      line=word;
    }
    output.push(line);
  }
  return output;
}

function dimensions({cols=80,rows=30,cellW=8.45,cellH=20}={}){
  const cw=Math.max(1,cellW),ch=Math.max(1,cellH),width=Math.max(160,cols*cw),height=Math.max(160,rows*ch);
  const margin=Math.max(20,Math.min(128,width*.105)),top=Math.max(24,height*.10);
  const bodyWidth=Math.min(1060,width-margin*2),x=(width-bodyWidth)/2;
  const bottom=Math.max(width<600?170:108,ch*3.5),bodyHeight=Math.max(40,height-top-bottom);
  return {width,height,cellW:cw,cellH:ch,uiScale:clamp(ch/20,.8,1.25),x,top,bodyWidth,bodyHeight,bodyWidthPx:bodyWidth,bodyHeightPx:bodyHeight,
    box:{x:x/cw,y:top/ch,w:bodyWidth/cw,h:bodyHeight/ch}};
}

export function creditSignalLayout({label='',lines=[],attribution=[],kind='names',scale=1,...size}={}){
  const d=dimensions(size),s=clamp(scale,.7,1.5)*d.uiScale;
  const font=kind==='quote'?clamp(d.width*.019,16,22)*s:kind==='body'?clamp(d.width*.016,15,20)*s:clamp(d.width*.031,25,42)*s;
  const labelFont=clamp(d.width*.011,11.5,14)*s,attrFont=clamp(d.width*.011,11.5,14)*s;
  const labelLines=label?wrapCreditSignalText(label,d.bodyWidth,labelFont):[];
  const bodyLines=lines.flatMap(line=>wrapCreditSignalText(line,d.bodyWidth,font));
  const attrLines=attribution.flatMap(line=>wrapCreditSignalText(line,d.bodyWidth,attrFont));
  const lineHeight=font*(kind==='quote'?1.57:1.5),labelHeight=labelLines.length*labelFont*1.55,attrHeight=attrLines.length*attrFont*1.65;
  const labelGap=labelLines.length?Math.max(18,font*.64):0,attrGap=attrLines.length?Math.max(21,font*.70):0;
  const requiredHeight=labelHeight+labelGap+bodyLines.length*lineHeight+attrGap+attrHeight;
  const spare=d.bodyHeight-requiredHeight;
  // Holds share one exact geometry. Time, alpha and transition are deliberately
  // absent from this model, so exposure cannot move a glyph or change wrapping.
  let y=d.top+Math.max(0,spare*.42);
  const runs=[];
  for(const text of labelLines){runs.push({text,x:d.x,y,fontPx:labelFont,color:C.label,role:'label'});y+=labelFont*1.55;}
  y+=labelGap;
  for(const text of bodyLines){runs.push({text,x:d.x,y,fontPx:font,color:C.text,role:'body'});y+=lineHeight;}
  y+=attrGap;
  for(const text of attrLines){runs.push({text,x:d.x,y,fontPx:attrFont,color:C.muted,role:'attribution'});y+=attrFont*1.65;}
  return {...d,runs,requiredHeight,fits:requiredHeight<=d.bodyHeight+.01,labelLines,bodyLines,attributionLines:attrLines,
    maxBodyLines:Math.max(1,Math.floor((d.bodyHeight-labelHeight-labelGap-attrGap-attrHeight)/lineHeight)),bodyFontPx:font,lineHeight};
}

export function renderCreditSignalGround({resolve=0}={}){
  uiDraw(({ctx})=>{
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    // Resolve only to the menu's near-black, never back to a saved world.
    const k=clamp(resolve,0,1);ctx.fillStyle=`rgb(${Math.round(3+2*k)},${Math.round(6+k)},${Math.round(8-k)})`;
    ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  });
}

function paintRuns(ctx,dpr,runs,{alpha=1,attributionAlpha=alpha}={}){
  for(const run of runs){
    drawElectronicText(ctx,run.text,Math.round(run.x*dpr),Math.round(run.y*dpr),{
      mode:'vfd',fontSize:run.fontPx*dpr,cellWidth:run.fontPx*.66*dpr,dpr,
      color:run.color,alpha:run.role==='attribution'?attributionAlpha:alpha,baseline:'top'});
  }
}

export function renderCreditSignal({label='',lines=[],attribution=[],kind='names',alpha=1,attributionAlpha=alpha,
  time=0,transition=0,quiet=false,background=true,readingPlane=false,scale=1}={}){
  const layout=creditSignalLayout({...uiSize(),...uiCellMetrics(),label,lines,attribution,kind,scale});
  if(background)renderCreditSignalGround();
  if(alpha<=.001&&attributionAlpha<=.001)return layout;
  uiDraw(({ctx,dpr})=>{
    if(readingPlane){ctx.fillStyle=C.ground;ctx.globalAlpha=1;
      ctx.fillRect(Math.max(0,layout.x-24)*dpr,Math.max(0,layout.top-20)*dpr,(layout.bodyWidth+48)*dpr,(layout.bodyHeight+40)*dpr);}
    const visible=clamp(alpha,0,1),motion=hardwareMotionReduced()?0:clamp(transition,0,1);
    // Far below the copy: one finite remnant between cards, no waveform,
    // periodic flashing or new 'recording' indicator under a reading hold.
    if(!quiet&&motion>0){
      const y=Math.min(layout.height-92,layout.top+layout.bodyHeight+15),x=layout.x+layout.bodyWidth*(.25+.5*motion);
      ctx.globalAlpha=motion*.44;ctx.fillStyle=C.trace;
      ctx.fillRect(round(layout.x,dpr)*dpr,Math.round(y*dpr),layout.bodyWidth*dpr,Math.max(1,dpr*.6));
      ctx.fillStyle=C.label;ctx.globalAlpha=motion*.65;
      ctx.fillRect(Math.round(x*dpr),Math.round((y-2)*dpr),Math.max(1,dpr),5*dpr);
    }
    ctx.globalAlpha=1;paintRuns(ctx,dpr,layout.runs,{alpha:visible,attributionAlpha:clamp(attributionAlpha,0,1)});
  });
  return layout;
}

export function drawCreditSignalText(text,x,y,{fontPx=12,color=C.muted,alpha=1,align='left'}={}){
  uiDraw(({ctx,dpr,cellW,cellH})=>drawElectronicText(ctx,String(text??'').toUpperCase(),Math.round(x*cellW*dpr),Math.round(y*cellH*dpr),{
    mode:'vfd',fontSize:fontPx*dpr,cellWidth:fontPx*.66*dpr,dpr,color,alpha,align,baseline:'top'}));
}

/** A static, case-preserving source record. Its native fixed-pitch type keeps
 * complete URLs, spelling and diacritics separate from display transliteration. */
export function creditRecordLayout({heading='',lines=[],sectionLabel='',pageLabel='',...size}={}){
  const d=dimensions(size),font=14*d.uiScale,lineHeight=font*1.65;
  const headingFont=clamp(d.width*.023,20,29)*d.uiScale;
  const headingLines=wrapCreditSignalText(heading,d.bodyWidth,headingFont);
  const titleHeight=18+headingLines.length*headingFont*1.45+26;
  const maxBodyLines=Math.max(1,Math.floor((d.bodyHeight-titleHeight-24)/lineHeight));
  const maxColumns=Math.max(8,Math.floor(d.bodyWidth/(font*.66)));
  const bodyLines=lines.flatMap(line=>wrapCreditSignalText(line,d.bodyWidth,font,{uppercase:false}));
  return {...d,headingLines,bodyLines,maxBodyLines,maxColumns,bodyFontPx:font,lineHeight,titleHeight,
    requiredHeight:titleHeight+bodyLines.length*lineHeight,fits:bodyLines.length<=maxBodyLines,sectionLabel,pageLabel,headingFont};
}

export function renderCreditRecord(payload={}){
  void warmCreditRecordFont();
  const layout=creditRecordLayout({...uiSize(),...uiCellMetrics(),...payload});renderCreditSignalGround();
  uiDraw(({ctx,dpr})=>{
    let y=layout.top;
    paintRuns(ctx,dpr,[{text:'RELEASE RECORD',x:layout.x,y,fontPx:12*layout.uiScale,color:C.label,role:'label'}]);y+=30*layout.uiScale;
    for(const text of layout.headingLines){paintRuns(ctx,dpr,[{text,x:layout.x,y,fontPx:layout.headingFont,color:C.text,role:'body'}]);y+=layout.headingFont*1.45;}
    y=layout.top+layout.titleHeight;
    ctx.font=`400 ${layout.bodyFontPx*dpr}px "Credit Record Mono", monospace`;
    ctx.textBaseline='top';ctx.fillStyle=C.text;ctx.globalAlpha=1;
    for(const text of layout.bodyLines){ctx.fillText(text,Math.round(layout.x*dpr),Math.round(y*dpr));y+=layout.lineHeight;}
    paintRuns(ctx,dpr,[{text:[layout.sectionLabel,layout.pageLabel].filter(Boolean).join(' · '),x:layout.x,y:layout.height-(layout.width<600?160:96),fontPx:11.5,color:C.muted,role:'label'}]);
  });return layout;
}

/** Visible controls and picking share the exact UI-cell rectangles. Controls
 * reflow before their text shrinks; the centre reading field stays untouched. */
export function renderCreditSignalControls(actions=[],{activeId=null}={}){
  const {cols,rows}=uiSize(),metrics=uiCellMetrics(),cw=metrics.cellW||8.45,ch=metrics.cellH||20;
  const width=Math.max(160,cols*cw),font=11.5,pad=13,gap=8,targetHeight=Math.max(32,ch*1.7);
  const usable=width-40,items=[],lines=[[]];let used=0;
  for(const action of actions){const w=Math.min(usable,measureElectronicText(action.label,{fontSize:font,cellWidth:font*.66})+pad*2);
    if(used+w>usable&&lines.at(-1).length){lines.push([]);used=0;}
    lines.at(-1).push({...action,width:w});used+=w+gap;}
  let y=Math.max(0,rows*ch-lines.length*targetHeight-(lines.length-1)*5-16);
  for(const line of lines){let x=20;for(const action of line){items.push({...action,x:x/cw,y:y/ch,w:action.width/cw,h:targetHeight/ch});x+=action.width+gap;}y+=targetHeight+5;}
  uiDraw(({ctx,dpr})=>{
    for(const item of items){const focused=item.id===activeId;
      if(focused&&!item.disabled){ctx.fillStyle='#13211e';ctx.fillRect(Math.round(item.x*cw*dpr),Math.round(item.y*ch*dpr),item.w*cw*dpr,item.h*ch*dpr);}
      drawElectronicText(ctx,String(item.label).toUpperCase(),Math.round((item.x*cw+pad)*dpr),Math.round((item.y*ch+(targetHeight-font)/2)*dpr),{
        mode:'vfd',fontSize:font*dpr,cellWidth:font*.66*dpr,dpr,color:focused?C.text:C.muted,alpha:item.disabled?.32:1,baseline:'top'});
    }
  });return items;
}
