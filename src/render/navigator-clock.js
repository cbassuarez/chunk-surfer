// A supplied in-world clock reading, not session duration or local wall time.
// This small LCD lives in the FN–12's existing metal header. It never changes
// the map or TAKES/MONITOR aperture, housing height, motion or power authority.
import {uiDrawHardware} from './ui.js';
import {drawHardwarePrint} from './hardware-faceplate.js';
import {drawSevenSegmentNumber,measureSevenSegment,drawTraceCell} from './dual-trace-display.js';

// Source keeps no time: no digits, and only the colon going, like a clock that has
// lost its power. It has its own phase and shares nothing with the 3D 6:00 ruin.
export const NAVIGATOR_CLOCK_BLANK='  :  ';
export const NAVIGATOR_CLOCK_BLINK_MS=1000;
export function navigatorClockState(readout,{now=null}={}){
  const value=typeof readout==='string'?readout:readout?.value;
  if(value===NAVIGATOR_CLOCK_BLANK){
    const time=Number.isFinite(now)?now:(globalThis.performance?.now?.()||0),colonLit=((time%NAVIGATOR_CLOCK_BLINK_MS)+NAVIGATOR_CLOCK_BLINK_MS)%NAVIGATOR_CLOCK_BLINK_MS<NAVIGATOR_CLOCK_BLINK_MS/2;
    return{value,blank:true,colonLit,approximate:false,text:colonLit?NAVIGATOR_CLOCK_BLANK:'     ',qualifier:''};
  }
  if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return null;
  const approximate=typeof readout==='object'&&readout?.approximate===true;
  // Back from Source: the digits blink under a steady colon, the blank clock's
  // inverse, until the night has been running for a few seconds.
  if(typeof readout==='object'&&readout?.settling===true){
    const time=Number.isFinite(now)?now:(globalThis.performance?.now?.()||0),digitsLit=((time%NAVIGATOR_CLOCK_BLINK_MS)+NAVIGATOR_CLOCK_BLINK_MS)%NAVIGATOR_CLOCK_BLINK_MS<NAVIGATOR_CLOCK_BLINK_MS/2;
    return{value,approximate,settling:true,digitsLit,text:digitsLit?(approximate?'~':'')+value:'  :  ',qualifier:approximate?'ESTIMATED':''};
  }
  return{value,approximate,text:(approximate?'~':'')+value,qualifier:approximate?'ESTIMATED':''};
}

export function navigatorClockLayout(housing){
  if(!housing||!['x','y','w','h'].every(k=>Number.isFinite(housing[k]))||housing.w<26)return null;
  const clock={x:housing.x+housing.w-8.9,y:housing.y+.85,w:7.3,h:1.02};
  return{housing:{...housing},clock,identity:{x:housing.x+2,y:housing.y+.88,w:clock.x-housing.x-2.65,h:.95}};
}

// Pixel geometry is measured independently of font decoding. Four formed
// digits, a true two-dot colon and one reserved estimate electrode keep their
// places when 21:59 becomes 22:00, after midnight, or in a migrated old save.
export function navigatorClockGeometry(housing,{cellW=8.45,cellH=20,dpr=1}={}){
  const layout=navigatorClockLayout(housing);if(!layout)return null;
  const toPixels=b=>({x:b.x*cellW*dpr,y:b.y*cellH*dpr,w:b.w*cellW*dpr,h:b.h*cellH*dpr});
  const clock=toPixels(layout.clock),identity=toPixels(layout.identity),height=.64*cellH*dpr,
    colonAdvance=height*.30,bankWidth=measureSevenSegment('00',height),digitWidth=bankWidth*2+colonAdvance,
    right=clock.x+clock.w-3.2*dpr,top=clock.y+(clock.h-height)/2,left=right-digitWidth,
    glyphRadius=height*.25,glyphX=clock.x+glyphRadius+3.0*dpr,glyphY=clock.y+clock.h/2;
  return{layout,clock,identity,height,
    hours:{x:left,y:top,w:bankWidth,h:height},
    colon:{x:left+bankWidth,y:top,w:colonAdvance,h:height},
    minutes:{x:left+bankWidth+colonAdvance,y:top,w:bankWidth,h:height},
    estimate:{x:glyphX+glyphRadius+1.5*dpr,y:clock.y,w:Math.max(1,left-glyphX-glyphRadius-2.2*dpr),h:clock.h},
    icon:{x:glyphX,y:glyphY,r:glyphRadius}};
}

export function paintNavigatorClock(ctx,housing,readout,metrics={}){
  const state=navigatorClockState(readout,{now:metrics.now}),g=navigatorClockGeometry(housing,metrics);if(!ctx||!state||!g)return null;
  const dpr=metrics.dpr||1,printDpr=dpr*Math.min(1,(metrics.cellH||20)/20),ink='#233b2b',opacity=Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1;
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  // The header remains legible etched aluminium; its new clock owns a small
  // separate gasket and reflective polarizer, not VFD glow over the map.
  const identity=metrics.identity===false?null:drawHardwarePrint(ctx,'AUDIOCORP FN-12',g.identity.x+dpr,g.identity.y,
    {width:g.identity.w-2*dpr,height:g.identity.h,color:'#333830',finish:'etched',darkPanel:false,dpr:printDpr});
  ctx.fillStyle='#1c2922';ctx.fillRect(g.clock.x-dpr,g.clock.y-dpr,g.clock.w+2*dpr,g.clock.h+2*dpr);
  ctx.fillStyle='#a8b99b';ctx.fillRect(g.clock.x,g.clock.y,g.clock.w,g.clock.h);
  ctx.beginPath();ctx.rect(g.clock.x+dpr,g.clock.y+dpr,g.clock.w-2*dpr,g.clock.h-2*dpr);ctx.clip();
  ctx.strokeStyle=ink;ctx.lineWidth=Math.max(.8*dpr,g.height*.065);ctx.globalAlpha=opacity*.80;
  ctx.beginPath();ctx.arc(g.icon.x,g.icon.y,g.icon.r,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(g.icon.x,g.icon.y-g.icon.r*.60);ctx.lineTo(g.icon.x,g.icon.y);ctx.lineTo(g.icon.x+g.icon.r*.52,g.icon.y+g.icon.r*.28);ctx.stroke();
  if(state.approximate){
    const at=g.estimate,middle=at.y+at.h/2,span=Math.min(at.w-2*dpr,g.height*.50),left=at.x+(at.w-span)/2;
    ctx.beginPath();ctx.moveTo(left,middle+g.height*.04);
    ctx.bezierCurveTo(left+span*.30,middle-g.height*.24,left+span*.70,middle+g.height*.24,left+span,middle-g.height*.04);ctx.stroke();
  }
  ctx.globalAlpha=opacity;
  if(!state.blank&&(!state.settling||state.digitsLit)){
    drawSevenSegmentNumber(ctx,state.value.slice(0,2),g.hours.x,g.hours.y,g.height,{color:ink,dormant:ink,lcd:true});
    drawSevenSegmentNumber(ctx,state.value.slice(3),g.minutes.x,g.minutes.y,g.height,{color:ink,dormant:ink,lcd:true});
  }
  const dot=g.height*.11;
  if(!state.blank||state.colonLit)for(const at of[.32,.70])drawTraceCell(ctx,g.colon.x+(g.colon.w-dot)/2,g.colon.y+g.height*at-dot/2,dot,dot,ink,{chamfer:dot*.15});
  ctx.restore();return{state,geometry:g,identity};
}

export function drawNavigatorClock(housing,readout,metrics={}){
  const state=navigatorClockState(readout);if(!state)return null;
  uiDrawHardware(surface=>paintNavigatorClock(surface.ctx,housing,state,{...surface,...metrics}));
  return state;
}
