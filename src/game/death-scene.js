// Last Exposure holds the actual final dithered world image whole. One dark
// exposure seam passes through it; the image recedes into black. The existing
// outcome owner decides whether the next scene is recovery or an ending.
import { uiDraw, uiFill, uiSize } from '../render/ui.js';
import { drawVfdText } from '../render/presentation.js';

// Legacy beat names remain for callers which time the same 5.2 second handoff.
// They no longer imply quarters, footage substitution or an autopsy edit.
export const DEATH_BEATS = Object.freeze({
  revealA:.18, revealB:.30, revealC:.42, autopsy:2.50, restore:4.00, loop:5.20,
});
const clamp = value => Math.max(0,Math.min(1,Number(value)||0));
const smooth = value => { const u=clamp(value);return u*u*(3-2*u); };

export function deathFrameState(elapsed=0,{reducedMotion=false,reduceFlash=false}={}) {
  const t=Number.isFinite(Number(elapsed))?Math.max(0,Number(elapsed)):0;
  const recede=smooth((t-2.5)/1.5),close=smooth((t-3.4)/1.8);
  const seam=smooth((t-.8)/.45)*(1-smooth((t-2.1)/.4));
  // Deprecated inspection fields: retained for old diagnostics, not rendering.
  const legacySpread=t<2.5?smooth(t/1.6):1-smooth((t-2.5)/2.7);
  return {elapsed:t,phase:t<.8?'last-view':t<2.5?'exposure-seam':t<4?'recede':'black',
    imageAlpha:1-close,scale:reducedMotion?1:1+Math.max(0,1-t/.18)*.055-recede*.035,
    seamX:.18+smooth((t-.8)/1.7)*.64,
    seamAmount:reducedMotion||reduceFlash?0:seam,
    veil:.16+recede*.24+close*.60+(!reduceFlash&&!reducedMotion&&t<.035?.7:0),
    spread:[legacySpread,legacySpread,legacySpread,legacySpread],
    autopsy:t>=DEATH_BEATS.autopsy&&t<DEATH_BEATS.restore,
    complete:t>=DEATH_BEATS.loop};
}

export function makeDeathScene({snapshot=null,title='',onDone=null,onPresented=null,reducedMotion=false,reduceFlash=false,endingBound=false,isSuspended=()=>false}={}) {
  let t=0,handedOff=false,closed=false,presented=false;
  return {
    id:'death',blocksInput:true,blocksWorld:true,suppressesHud:true,lookProfile:'rupture',
    update(dt){
      if(closed||handedOff||isSuspended())return;
      if(Number.isFinite(dt)&&dt>0)t+=dt;
      if(!deathFrameState(t).complete)return;
      handedOff=true;onDone?.();
    },
    exit(){closed=true;},
    key(){return true;},keyup(){return true;},pointer(){return true;},
    view(){return {...deathFrameState(t,{reducedMotion,reduceFlash}),title,endingBound,handedOff,closed,suspended:isSuspended(),composition:'whole-final-view'};},
    render(){
      const {cols,rows}=uiSize(),frame=deathFrameState(t,{reducedMotion,reduceFlash});
      uiFill(0,0,cols,rows,'#000');
      uiDraw(({ctx})=>{
        const w=ctx.canvas.width,h=ctx.canvas.height;
        const sw=snapshot?.naturalWidth||snapshot?.width||0,sh=snapshot?.naturalHeight||snapshot?.height||0;
        ctx.save();ctx.imageSmoothingEnabled=false;
        if(sw>0&&sh>0&&frame.imageAlpha>0){
          const fit=Math.max(w/sw,h/sh),dw=sw*fit*frame.scale,dh=sh*fit*frame.scale;
          ctx.globalAlpha=frame.imageAlpha;
          ctx.drawImage(snapshot,(w-dw)/2,(h-dh)/2,dw,dh);
          if(!presented&&!closed&&!isSuspended()){
            presented=true;onPresented?.();
          }
        }
        ctx.globalAlpha=1;
        if(frame.seamAmount>0){
          const x=w*frame.seamX,band=Math.max(2,w*.018);
          const seam=ctx.createLinearGradient(x-band,0,x+band,0);
          seam.addColorStop(0,'rgba(0,0,0,0)');
          seam.addColorStop(.45,`rgba(0,0,0,${frame.seamAmount*.72})`);
          seam.addColorStop(.55,`rgba(0,0,0,${frame.seamAmount*.72})`);
          seam.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=seam;ctx.fillRect(x-band,0,band*2,h);
        }
        ctx.fillStyle=`rgba(0,0,0,${frame.veil})`;ctx.fillRect(0,0,w,h);ctx.restore();
      });
      if(title&&t>=2.5&&t<5.2){
        const alpha=smooth((t-2.5)/.6)*(1-smooth((t-4)/1.2))*.72;
        drawVfdText(4,Math.max(2,rows-5),String(title).toUpperCase(),
          {scale:1,role:'ui-secondary',alpha,max:Math.max(4,cols-8)});
      }
    },
  };
}
