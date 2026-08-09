import { uiDraw, uiSize, uiText } from '../render/ui.js';

export const SOURCE_TOWER_CROSSING_SECONDS=8.5;
export const SOURCE_TOWER_PROMPT_DELAY_SECONDS=1.35;

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));

export function advanceSourceTowerProgress(progress,moveY,dt,seconds=SOURCE_TOWER_CROSSING_SECONDS){
  return clamp01(Number(progress)+(Number(moveY)||0)*Math.max(0,Number(dt)||0)/seconds);
}

export function sourceTowerRevealFrame(progress,{reducedMotion=false}={}){
  const raw=clamp01(progress),p=reducedMotion?Math.floor(raw*8)/8:raw;
  return{
    progress:p,
    sourceStretch:clamp01((p-.08)/.42),
    ropeOpacity:clamp01((p-.28)/.42),
    towerResolve:clamp01((p-.46)/.54),
    audioRestore:clamp01((p-.35)/.65),
  };
}

export function createSourceTowerTransitionScene({
  motionInput,renderer,audio=null,worldView,onCommit,onExit,initialProgress=0,reducedMotion=false,
}={}){
  const restoredProgress=clamp01(initialProgress);let progress=restoredProgress,committed=false,elapsed=0,lastMotionAt=0;
  const scene={
    id:'source-tower-transition',blocksInput:true,blocksWorld:true,tracksMotion:true,lookProfile:'rupture',
    worldView:()=>worldView?.()||null,
    enter(){
      progress=restoredProgress;committed=false;elapsed=0;lastMotionAt=0;
      renderer?.r3dBeginDatamosh?.({reducedMotion});renderer?.r3dSetDatamoshProgress?.(progress);audio?.start?.(progress);
    },
    update(dt){
      if(committed)return;elapsed+=Math.max(0,Number(dt)||0);
      const moveY=motionInput?.snapshot?.().moveY||0,previous=progress;progress=advanceSourceTowerProgress(progress,moveY,dt);
      if(progress>previous+.0001)lastMotionAt=elapsed;
      renderer?.r3dSetDatamoshProgress?.(progress);audio?.setProgress?.(progress);audio?.update?.(dt,progress);
      if(progress>=1){committed=true;onCommit?.();}
    },
    render(){
      const{cols,rows}=uiSize(),frame=sourceTowerRevealFrame(progress,{reducedMotion});
      const label='FOLLOW THE SIGNAL INTO THE TOWER';uiText(Math.max(2,Math.floor((cols-label.length)/2)),2,label,'ui-amber');
      uiDraw(({ctx,dpr,cellW,cellH})=>{
        const width=cols*cellW*dpr,height=rows*cellH*dpr;ctx.save();ctx.imageSmoothingEnabled=false;ctx.lineCap='butt';
        const count=7;
        for(let index=0;index<count;index++){
          const phase=index/(count-1),x=width*(.23+phase*.54),sourceLean=(phase-.5)*(1-frame.sourceStretch)*width*.12;
          ctx.globalAlpha=frame.ropeOpacity*(.34+frame.towerResolve*.38);ctx.strokeStyle=index===count-1?'#f2a81e':'#ece9dc';ctx.lineWidth=Math.max(1,(1+frame.towerResolve*1.8)*dpr);
          ctx.beginPath();ctx.moveTo(x+sourceLean,height*(.13+.12*(1-frame.sourceStretch)));ctx.lineTo(x-sourceLean*.18,height*(.88-.04*frame.towerResolve));ctx.stroke();
        }
        ctx.restore();
      });
      const hesitating=elapsed>=SOURCE_TOWER_PROMPT_DELAY_SECONDS&&(progress<.04||elapsed-lastMotionAt>SOURCE_TOWER_PROMPT_DELAY_SECONDS);
      if(hesitating){const instruction='HOLD FORWARD — LET THE ROPES CARRY IT UP';uiText(Math.max(2,Math.floor((cols-instruction.length)/2)),rows-3,instruction.slice(0,cols-4),'ui-secondary');}
    },
    exit(){renderer?.r3dEndDatamosh?.();audio?.destroy?.();motionInput?.reset?.('source-tower-transition');onExit?.({committed,progress});},
    progress:()=>progress,
    reveal:()=>sourceTowerRevealFrame(progress,{reducedMotion}),
  };
  return scene;
}
