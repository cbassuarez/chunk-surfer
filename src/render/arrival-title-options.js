// The approved disc title and its review alternatives share one layout/draw
// path. No saved preference: this is an authored presentation decision.
import {drawVfdText} from './presentation.js';
import {uiDraw,uiWithClip} from './ui.js';
import {UI_COLOR} from './palette.js';
import {vfdMarqueeFrame} from './vfd-marquee.js';

export const ARRIVAL_TITLE_DIRECTIONS=Object.freeze([
  Object.freeze({id:'disc',name:'The disc display',description:'One complete title held above a slowly addressed location field.'}),
  Object.freeze({id:'index',name:'The indexed track',description:'An enlarged track number and two-line title, like a physical player finding its programme.'}),
  Object.freeze({id:'memory',name:'The memory display',description:'A narrow, floating phosphor display; the subtitle is a separate recalled memory.'}),
]);
export const ARRIVAL_TITLE_SUBTITLE='a haunting at ellery conservatory';
const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{const u=clamp(n);return u*u*(3-2*u);};
export function arrivalTitleOptionFrame({direction='disc',cols=100,rows=40,time=6,duration=12,reducedMotion=false}={}){
  time=Math.max(0,Number(time)||0)*12/Math.max(.1,Number(duration)||12);
  const width=Math.max(16,Math.min(60,cols-6)),left=(cols-width)/2,cy=rows*.46,vertical=Math.min(1,rows/14);
  const fade=smooth(time/2.8)*(1-smooth((time-10)/2));
  const label=(text,x,y,scale,alpha=1,color=UI_COLOR.primary,clip=null)=>({text,x,y,scale,alpha:alpha*fade,color,clip});
  if(direction==='index'){
    const s=Math.min(4.5,width/8,Math.max(.7,(rows-4.3)/1.6)),numberScale=Math.min(1.4,s*.55),
      height=s*1.6+2.9,firstY=Math.max(.2,cy-height/2),secondY=firstY+s*.8+.8,captionY=secondY+s*.8+1.3;
    return{direction,fade,lines:[
      label('01',left,firstY,numberScale,.55),
      label('CHUNK',left+width*.20,firstY,s),
      label('SURFER',left+width*.20,secondY,s),
      label('ELLERY / NIGHT ONE',left+width*.20,captionY,Math.min(1,width*.8/18),.66),
    ]};
  }
  if(direction==='memory'){
    const w=Math.min(38,width),x=(cols-w)/2,s=w/12;
    return{direction,fade,lines:[
      label('CHUNK SURFER',x,cy-1.7*vertical,s),
      label('ELLERY',x,cy+2*vertical,vertical,.65),
      label('4417-C',x+w-6*vertical,cy+2*vertical,vertical,.40),
    ],rule:{x,y:cy+1.1*vertical,w,alpha:.13*fade}};
  }
  // The complete approved subtitle fits the normal forty-cell field on its
  // first reading hold, including breathing room around the final phosphor Y.
  // Smaller displays retain the same finite addressed pass.
  const s=Math.min(4.2,width/12),w=Math.min(width,40),x=(cols-w)/2,captionScale=Math.min(1.18,vertical*1.5),footerScale=.9*vertical;
  const subtitle=ARRIVAL_TITLE_SUBTITLE.toUpperCase(),lines=[];
  if(reducedMotion){
    const available=Math.max(1,Math.floor(w/captionScale));let current='';
    for(const word of subtitle.split(' ')){const next=current?`${current} ${word}`:word;if(current&&next.length>available){lines.push(current);current=word;}else current=next;}
    if(current)lines.push(current);
  }else lines.push(subtitle);
  const titleY=cy-2.4*vertical,captionY=cy+2*vertical,lineGap=captionScale*1.1,
    captionHeight=(lines.length-1)*lineGap+captionScale*.8,
    footerY=Math.max(cy+4.2*vertical,captionY+captionHeight+.8*vertical),
    shift=Math.min(0,rows-.35-(footerY+footerScale*.8));
  const overflow=Math.max(0,subtitle.length*captionScale-w),
    m=vfdMarqueeFrame(subtitle,{width:w,scale:captionScale,time:Math.max(0,time-4),reducedMotion,
      startHold:1.4,endHold:1.4,speed:Math.max(2.2,overflow/3.2)});
  return{direction:'disc',fade,lines:[
    label('CHUNK SURFER',(cols-12*s)/2,titleY+shift,s),
    ...lines.map((line,index)=>label(line,reducedMotion?(cols-line.length*captionScale)/2:x+Math.max(0,(w-m.contentWidth)/2)-m.offset,
      captionY+shift+index*lineGap,captionScale,.70,UI_COLOR.primary,reducedMotion?null:{x,y:captionY+shift-.2*vertical,w,h:Math.max(.8,captionScale)})),
    label('01   /   4417-C',x,footerY+shift,footerScale,.34),
  ]};
}
export function renderArrivalTitleOption(options={}, {drawText=drawVfdText,withClip=uiWithClip,drawRule=uiDraw}={}){
  const frame=arrivalTitleOptionFrame(options);
  if(frame.rule)drawRule(({ctx,cellW,cellH})=>{ctx.fillStyle=`rgba(130,211,196,${frame.rule.alpha})`;ctx.fillRect(frame.rule.x*cellW,frame.rule.y*cellH,frame.rule.w*cellW,Math.max(1,cellH*.035));});
  for(const line of frame.lines){const draw=()=>drawText(line.x,line.y,line.text,{scale:line.scale,color:line.color,alpha:line.alpha});if(line.clip)withClip(line.clip,draw);else draw();}
  return frame;
}
