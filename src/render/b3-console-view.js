// An unpowered analogue desk, cropped to the four strips under the player's
// hands. The room stays visible above it; none of the lettering is a lamp.
import { uiDraw, uiSize } from './ui.js';
import { drawHardwareCap } from './hardware-material.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export const B3_VISIBLE_STRIPS=4;
export function b3ConsoleLayout(size={},selected=1){
  const cols=Math.max(20,Number(size.cols)||120),rows=Math.max(8,Number(size.rows)||38);
  const w=Math.min(cols-1,64),h=Math.min(15,Math.max(6,rows*.43));
  const x=(cols-w)/2,y=rows-h-.4,bank=Math.floor((clamp(selected,1,16)-1)/B3_VISIBLE_STRIPS)*B3_VISIBLE_STRIPS;
  const power={x:x+.7,y:y+2,w:Math.max(2.4,Math.min(6,w*.12)),h:Math.max(2,h-3)};
  const close={x:x+w-4.4,y:Math.max(0,y-1.4),w:3.8,h:1.15};
  const prev={x:power.x+power.w+.15,y:y+.7,w:1.4,h:Math.max(1.5,h-1.4)};
  const next={x:x+w-1.55,y:y+.7,w:1.4,h:Math.max(1.5,h-1.4)};
  const stripX=prev.x+prev.w,stripW=(next.x-stripX)/B3_VISIBLE_STRIPS;
  const strips=Array.from({length:B3_VISIBLE_STRIPS},(_,i)=>({channel:bank+i+1,x:stripX+i*stripW,y:y+.6,w:stripW,h:h-1.3,
    track:{x:stripX+i*stripW+stripW*.21,y:y+3.3,w:stripW*.58,h:Math.max(1,h-5.2)}}));
  return {cols,rows,x,y,w,h,bank,power,close,prev,next,strips,footerY:rows-.8};
}

// Layout/hit regions are shared with the input controller so large text and
// compact windows cannot cause buttons to operate a neighbouring strip.
export function b3ConsoleHit(layout,x,y){
  const inside=r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
  if(inside(layout.close))return {kind:'close'};
  if(inside(layout.power))return {kind:'power'};
  if(inside(layout.prev))return {kind:'previous'};
  if(inside(layout.next))return {kind:'next'};
  const strip=layout.strips.find(inside);if(!strip)return null;
  return {kind:y>=strip.track.y-.4&&y<=strip.track.y+strip.track.h+.4?'fader':'select',channel:strip.channel,track:strip.track};
}
export function b3FaderFromY(track,y){return clamp(1-(y-track.y)/Math.max(.01,track.h),0,1);}

export function drawB3Console(view,size=uiSize()){
  const layout=b3ConsoleLayout(size,view.selected), fader=Array.isArray(view.fader)?view.fader:[];
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const px=v=>v*cellW*dpr,py=v=>v*cellH*dpr;
    const x=px(layout.x),y=py(layout.y),w=px(layout.w),h=py(layout.h);
    ctx.save();
    const body=ctx.createLinearGradient(0,y,0,y+h);
    body.addColorStop(0,'#5c5b51');body.addColorStop(.13,'#353832');body.addColorStop(.82,'#252922');body.addColorStop(1,'#151914');
    ctx.fillStyle='#080a08';ctx.fillRect(x-3*dpr,y+3*dpr,w+6*dpr,h);
    ctx.fillStyle=body;ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#939487';ctx.lineWidth=Math.max(1,dpr);ctx.strokeRect(x+.5*dpr,y+.5*dpr,w-dpr,h-dpr);
    ctx.fillStyle='#111510';ctx.fillRect(x+4*dpr,y+3*dpr,w-8*dpr,Math.max(2*dpr,py(.15)));
    ctx.font=`${Math.max(9,Math.min(13,cellH*.62))*dpr}px 'Hardware Sans', sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const close=layout.close;ctx.fillStyle='#22261f';ctx.fillRect(px(close.x),py(close.y),px(close.w),py(close.h));
    ctx.strokeStyle='#777d6e';ctx.strokeRect(px(close.x),py(close.y),px(close.w),py(close.h));
    ctx.fillStyle='#ded8bb';ctx.fillText('LEAVE',px(close.x+close.w/2),py(close.y+close.h/2),px(close.w-.2));
    const p=layout.power,pcx=px(p.x+p.w/2),ptop=py(p.y),pw=px(p.w),ph=py(p.h);
    ctx.fillStyle='#171a15';ctx.fillRect(px(p.x),ptop,pw,ph);
    ctx.strokeStyle=view.focus==='power'?'#ead5a5':'#72766a';ctx.strokeRect(px(p.x)+dpr,ptop+dpr,pw-2*dpr,ph-2*dpr);
    ctx.fillStyle='#ded8bb';ctx.fillText('POWER',pcx,ptop+ph*.15,Math.max(1,pw-2*dpr));
    ctx.fillStyle='#9d9f8e';ctx.fillText(view.powerOn?'ON':'OFF',pcx,ptop+ph*.78,Math.max(1,pw-2*dpr));
    // A real mechanical switch position. No lamp or powered-device claim.
    ctx.fillStyle='#0e100d';ctx.fillRect(pcx-pw*.11,ptop+ph*.31,pw*.22,ph*.27);
    ctx.fillStyle='#bdbea9';ctx.fillRect(pcx-pw*.13,ptop+ph*(view.powerOn ? .31 : .44),pw*.26,ph*.13);
    ctx.fillStyle='#c8c8b3';ctx.font=`${Math.max(10,Math.min(16,cellH*.9))*dpr}px sans-serif`;
    ctx.fillText('‹',px(layout.prev.x+layout.prev.w/2),py(layout.prev.y+layout.prev.h/2));
    ctx.fillText('›',px(layout.next.x+layout.next.w/2),py(layout.next.y+layout.next.h/2));
    ctx.font=`${Math.max(9,Math.min(13,cellH*.62))*dpr}px 'Hardware Sans', sans-serif`;
    for(const strip of layout.strips){
      const sx=px(strip.x),sw=px(strip.w),sy=py(strip.y),sh=py(strip.h),cx=sx+sw/2;
      ctx.fillStyle=strip.channel===view.selected&&view.focus==='fader'?'#454a3c':'#30352d';ctx.fillRect(sx,sy,sw-1*dpr,sh);
      ctx.strokeStyle='#565b50';ctx.strokeRect(sx+.5*dpr,sy+.5*dpr,sw-2*dpr,sh-dpr);
      ctx.fillStyle='#d2d0b8';ctx.fillText(String(strip.channel).padStart(2,'0'),cx,sy+py(.55),sw-2*dpr);
      // A mechanical meter above channel 3: signal despite no mains. It is a
      // needle, not a bright VU lamp; width responds to actual source intensity.
      if(strip.channel===3){
        const mw=Math.max(2*dpr,sw*.58),mh=Math.max(3*dpr,py(1.05)),mx=cx-mw/2,my=sy+py(1.05);
        ctx.fillStyle='#d3c8a8';ctx.fillRect(mx,my,mw,mh);ctx.strokeStyle='#161711';ctx.strokeRect(mx,my,mw,mh);
        const signal=view.active?clamp(view.intensity,0,1):0;
        ctx.strokeStyle='#572d22';ctx.lineWidth=Math.max(1,dpr);ctx.beginPath();ctx.moveTo(mx+mw*.5,my+mh*.92);ctx.lineTo(mx+mw*(.12+signal*.75),my+mh*.18);ctx.stroke();
      }
      const t=strip.track,tx=px(t.x),ty=py(t.y),tw=px(t.w),th=py(t.h);
      ctx.fillStyle='#0b0d0b';ctx.fillRect(cx-Math.max(dpr,tw*.05),ty,Math.max(2*dpr,tw*.1),th);
      ctx.strokeStyle='#92958a';ctx.lineWidth=Math.max(1,dpr);
      for(let i=0;i<=4;i++){let yy=ty+i*th/4;ctx.beginPath();ctx.moveTo(cx-tw*.43,yy);ctx.lineTo(cx-tw*.27,yy);ctx.stroke();}
      const value=clamp(fader[strip.channel-1]??.5,0,1),capY=ty+(1-value)*th;
      const capW=Math.max(7*dpr,Math.min(tw*.75,30*dpr)),capH=Math.max(5*dpr,Math.min(py(.65),13*dpr));
      drawHardwareCap(ctx,cx-capW/2,capY-capH/2,capW,capH,{color:'white',finish:'keycap',focused:strip.channel===view.selected&&view.focus==='fader',dpr});
    }
    ctx.restore();
  });
  return layout;
}
