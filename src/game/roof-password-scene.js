import * as scenes from './scenes.js';
import {uiCanvasSize,uiDraw,uiText} from '../render/ui.js';
import {hardwareMotionReduced} from '../render/hardware-material.js';
import {createRoofWordLock} from './roof-word-lock.js';
import {roofWordLockLayout,roofWordLockHit} from '../render/roof-word-lock.js';
import {createRoofWordLockView} from '../render/roof-word-lock-view.js';
import {fitText} from '../render/fit-text.js';

// Drawing and picking share geometry; every input turns the same six detents.
export function makeRoofPasswordScene({verify=()=>false,onOpen=()=>{},onCancel=()=>{},onSound=()=>{},reducedMotion=hardwareMotionReduced,displaySource=()=>({})}={}){
  const lock=createRoofWordLock(),positions=Array(6).fill(0);
  const physicalView=createRoofWordLockView();
  let closed=false,phase='setting',age=1,focus='wheel',hover=null,drag=null,wheelDebt=0,wheelIndex=-1;
  let viewport={width:960,height:600,cols:120,rows:30};
  const layout=()=>physicalView.layout()||roofWordLockLayout(viewport.width,viewport.height);
  const close=accepted=>{if(closed)return;closed=true;drag=null;scenes.remove(scene);if(accepted)onOpen();else{onSound('back');onCancel();}};
  const mutable=()=>!closed&&phase!=='released';
  const change=result=>{
    if(result.kind==='none')return;
    phase='setting';focus='wheel';onSound(result.kind==='turn'?'turn':'select');
    if(reducedMotion())positions.splice(0,6,...lock.view().turns);
  };
  const tryHandle=()=>{
    if(closed||phase==='released'||(phase==='refused'&&age<.45))return;
    drag=null;onSound('pull');
    const accepted=verify(lock.view().word);phase=accepted?'released':'refused';age=0;
    onSound(accepted?'released':'denied');
    if(accepted&&reducedMotion())close(true);
  };
  const point=e=>({x:Number(e.cellX)/viewport.cols*viewport.width,y:Number(e.cellY)/viewport.rows*viewport.height});
  const scene={
    id:'roof-word-lock',blocksInput:true,blocksWorld:true,handlesEscape:true,allowsLook:false,suppressesHud:true,
    view:()=>({...lock.view(),positions:[...positions],error:phase==='refused'?'The handle meets the stop.':'',phase,focus,closed,dragging:!!drag,layout:layout(),viewport:{...viewport},gpu:physicalView.diagnostics()}),
    enter(){physicalView.warm();},
    exit(){closed=true;drag=null;hover=null;physicalView.dispose();},
    update(dt){
      if(closed)return;
      const elapsed=Math.max(0,Math.min(1,Number(dt)||0));age+=elapsed;
      const target=lock.view().turns,k=reducedMotion()?1:1-Math.exp(-elapsed*24);
      for(let i=0;i<6;i++){positions[i]+=(target[i]-positions[i])*k;if(Math.abs(target[i]-positions[i])<.002)positions[i]=target[i];}
      if(phase==='released'&&age>=.62)close(true);
    },
    key(e){
      if(closed)return true;
      const key=String(e.key||'');e.preventDefault?.();
      if(key==='Escape'||e.code==='Escape'){close(phase==='released');return true;}
      if(!mutable()||e.ctrlKey||e.metaKey||e.altKey)return true;
      if(key==='Enter'||e.code==='Enter'){if(!e.repeat)tryHandle();return true;}
      if(key==='Tab'||e.controllerAction==='tabPrev'){
        const direction=e.shiftKey||e.controllerAction==='tabPrev'?-1:1;
        let at=focus==='handle'?6:lock.view().cursor;at=(at+direction+7)%7;
        if(at===6)focus='handle';else{lock.select(at);focus='wheel';}onSound('select');return true;
      }
      if(key==='ArrowLeft'||key==='ArrowRight'){
        const direction=key==='ArrowRight'?1:-1;
        if(focus==='handle'){lock.select(direction<0?5:0);focus='wheel';onSound('select');}
        else if(lock.view().cursor===5&&direction>0){focus='handle';onSound('select');}
        else change(lock.move(direction));return true;
      }
      if(key==='ArrowUp'||key==='ArrowDown'){
        if(focus==='handle'){focus='wheel';onSound('select');}else change(lock.cycle(key==='ArrowUp'?1:-1));return true;
      }
      if(key==='Backspace'){change(lock.backspace());return true;}
      if(key==='Delete'){change(lock.delete());return true;}
      if(/^[a-z]$/i.test(key)&&!e.repeat){change(lock.type(key));return true;}
      return true;
    },
    pointer(e){
      if(closed)return true;
      if(typeof document!=='undefined'&&!physicalView.layout())return true;
      const p=point(e),hit=roofWordLockHit(layout(),p);
      if(e.type==='pointercancel'){drag=null;return true;}
      if(e.type==='pointerup'){if(drag&&drag.id===(e.pointerId??0))drag=null;return true;}
      if(e.type==='pointermove'){
        hover=hit;
        if(drag&&drag.id===(e.pointerId??0)&&mutable()){
          const pitch=Math.max(13,layout().wheels[0].h*.18),delta=Math.trunc((drag.y-p.y)/pitch);
          if(delta){change(lock.cycle(delta,drag.index));drag.y-=delta*pitch;drag.moved=true;}
        }
        return true;
      }
      if(e.type==='wheel'){
        if(!mutable()||!hit||!Number.isInteger(hit.index))return true;
        e.preventDefault?.();
        if(wheelIndex!==hit.index){wheelDebt=0;wheelIndex=hit.index;}
        if(lock.view().cursor!==hit.index)change(lock.select(hit.index));focus='wheel';
        wheelDebt+=Number(e.deltaY||0)*(e.deltaMode===1?16:e.deltaMode===2?viewport.height:1);
        const delta=Math.trunc(wheelDebt/38);
        if(delta){change(lock.cycle(Math.max(-6,Math.min(6,delta)),hit.index));wheelDebt-=delta*38;}
        return true;
      }
      if(e.type!=='pointerdown'||(e.button??0)!==0)return true;
      if(hit?.kind==='close'){close(phase==='released');return true;}
      if(!mutable())return true;
      if(hit?.kind==='handle'){focus='handle';tryHandle();return true;}
      if(Number.isInteger(hit?.index)){
        change(lock.select(hit.index));focus='wheel';
        if(hit.kind==='turn')change(lock.cycle(hit.delta,hit.index));
        else drag={id:e.pointerId??0,index:hit.index,y:p.y,moved:false};
      }
      return true;
    },
    render(){
      uiDraw(({ctx,dpr,cols,rows})=>{
        const size=uiCanvasSize();viewport={width:size.width/dpr,height:size.height/dpr,cols,rows};
        physicalView.draw({ctx,width:size.width,height:size.height,dpr,positions,cursor:lock.view().cursor,phase,age,focus,hover,reducedMotion:reducedMotion(),display:displaySource()});
      });
      uiText(2,viewport.rows-2,'[ESC] LET GO','ui-dim');
      const hint=phase==='refused'?'The handle meets the stop.':phase==='released'?'The latch releases.':'[DRAG / WHEEL / ↑↓] TURN   [ENTER] TRY';
      uiText(20,viewport.rows-2,fitText(hint,Math.max(1,viewport.cols-22)),phase==='setting'?'ui-dim':'ui-secondary');
    },
  };
  return scene;
}
