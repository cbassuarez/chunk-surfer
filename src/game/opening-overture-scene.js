import { uiDraw, uiFill, uiSize } from '../render/ui.js';
import { openingCinematicGate } from '../render/opening-cinematic-staging.js';
import { drawVfdText } from '../render/presentation.js';
import { OPENING_OVERTURE, openingOvertureFrame } from '../data/opening-overture.js';

const moveCodes = new Set(['keyw','keya','keys','keyd','arrowup','arrowdown','arrowleft','arrowright']);
const smooth = x => { x=Math.max(0,Math.min(1,x));return x*x*(3-2*x); };

// This camera borrows the building, never the walking checkpoint. The first
// rendered authored frame starts the one score transport; hidden/loading time and
// pause cannot spend the authored film. The last shot waits for a fresh action.
export function makeOpeningOvertureScene({
  getReturnView=()=>null, getReady=()=>true, getPresentationReady=()=>true, getScoreTime=()=>null, toWorldView=frame=>frame,
  reducedMotion=false, checkpoint=null, onScoreStart=()=>{}, onPause=()=>{},
  onResume=()=>{}, onShot=()=>{}, onCheckpoint=()=>{}, onSettle=()=>{},
  onDone=()=>{}, onExit=()=>{}, onUnavailable=()=>{},
}={}) {
  const resumable=checkpoint?.schema===2&&checkpoint?.revision===OPENING_OVERTURE.revision;
  let phase='loading', elapsed=resumable?Math.max(0,Math.min(OPENING_OVERTURE.duration,Number(checkpoint.elapsed)||0)):0;
  let returnView=null, paused=false, presentationHeld=false, exited=false, complete=false, scoreStarted=false, shotId=null, savedAt=-1, error=null;
  const held=new Set();
  const sample=()=>returnView?openingOvertureFrame(elapsed,{returnView,reducedMotion}):null;
  const checkpointNow=()=>({schema:2,revision:OPENING_OVERTURE.revision,phase:phase==='held'?'held':'montage',elapsed,returnView});
  const scene={
    id:'opening-overture',blocksInput:true,blocksWorld:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'visible',lookProfile:'calm',
    enter(){returnView=getReturnView();},
    update(dt){
      if(exited||complete||paused)return;
      if(!returnView)returnView=getReturnView();
      if(phase==='loading'){
        const readiness=getReady();
        if(returnView&&readiness?.error){
          error=String(readiness.error);elapsed=OPENING_OVERTURE.duration;phase='held';scene.allowsLook=true;
          onUnavailable(error);onSettle(returnView);return;
        }
        if(returnView&&(readiness===true||readiness?.ready===true))phase='awaiting-frame';
        return;
      }
      if(scoreStarted&&(phase==='montage'||phase==='held')){
        if(!getPresentationReady()){
          if(!presentationHeld){presentationHeld=true;onPause();}
          return;
        }
        if(presentationHeld){presentationHeld=false;onResume();}
      }
      if(phase!=='montage')return;
      const scoreTime=getScoreTime();
      elapsed=Math.min(OPENING_OVERTURE.duration,Number.isFinite(scoreTime)
        ?Math.max(elapsed,scoreTime):elapsed+Math.max(0,Math.min(.1,Number(dt)||0)));
      const frame=sample();
      if(frame?.shotId!==shotId){shotId=frame?.shotId;onShot(frame);}
      if(elapsed-savedAt>=1){savedAt=elapsed;onCheckpoint(checkpointNow());}
      if(frame?.done||elapsed>=OPENING_OVERTURE.duration){
        phase='held';scene.allowsLook=true;onSettle(returnView);onCheckpoint(checkpointNow());
      }
    },
    presented(){
      if(phase!=='awaiting-frame'||paused||exited||!getPresentationReady())return;
      phase='montage';
      if(!scoreStarted){scoreStarted=true;onScoreStart({offset:elapsed});}
      const frame=sample();shotId=frame?.shotId;onShot(frame);
    },
    worldView(){
      const frame=sample();if(!frame)return null;
      return toWorldView({...frame,openingOverture:true,freeLook:phase==='held',loading:phase==='loading'});
    },
    view(){return{phase,elapsed,paused,presentationHeld,scoreStarted,complete,error,frame:sample(),checkpoint:checkpointNow()};},
    serialize:checkpointNow,
    key(event={}){
      if(exited||complete)return true;
      const key=String(event.code||event.key||'').toLowerCase();
      const identity=key||'action:'+String(event.controllerAction||'');
      if(key==='escape'||event.controllerAction==='back')return false;
      if(event.ctrlKey||event.metaKey||event.altKey)return true;
      const move=moveCodes.has(key)||['move-forward','move-back','move-left','move-right','up','down','left','right'].includes(event.controllerAction);
      if(!move)return true;
      if(phase!=='held'||paused||presentationHeld||event.repeat||held.has(identity)){held.add(identity);return true;}
      complete=true;onDone({returnView,initialEvent:event,error});return true;
    },
    keyup(event={}){held.delete(String(event.code||event.key||'').toLowerCase()||'action:'+String(event.controllerAction||''));return true;},
    pause(){if(paused||exited)return;paused=true;held.clear();onPause();},
    resume(){if(!paused||exited)return;paused=false;held.clear();if(!presentationHeld)onResume();},
    blur(){scene.pause();},focus(){scene.resume();},
    exit(){if(exited)return;exited=true;held.clear();onExit({complete,checkpoint:checkpointNow()});},
    render(){
      const {cols,rows}=uiSize();
      if(phase==='loading'||phase==='awaiting-frame'){uiFill(0,0,cols,rows,'#040507');return;}
      const frame=sample();
      if(frame?.titleAlpha>0){
        const text='CHUNK SURFER',scale=Math.min(3.4,(cols-6)/text.length);
        drawVfdText((cols-text.length*scale)/2,rows*.77,text,{scale,color:'#ece4d3',alpha:frame.titleAlpha});
      }
      uiDraw(({ctx})=>{
        const gate=openingCinematicGate(frame,{width:ctx.canvas.width,height:ctx.canvas.height});
        ctx.fillStyle='#000';for(const bar of gate.bars||[])ctx.fillRect(bar.x,bar.y,bar.width,bar.height);
      });
      // A short arrival veil clears before the player-held final composition.
      const alpha=Number(frame?.black)||0;
      if(alpha>.001)uiFill(0,0,cols,rows,`rgba(4,5,7,${smooth(alpha)})`);
    },
  };
  return scene;
}
