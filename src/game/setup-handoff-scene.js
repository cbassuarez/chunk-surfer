import { uiSize, uiScrim, uiText, uiWrap } from '../render/ui.js';
import { withMachinePanel, drawLampButton } from '../render/presentation.js';
import { inputPrompt } from './bindings.js';

// A real input hold, not an escapable conversation and not an automatic Bag.
export function makeSetupHandoffScene({onOpen=()=>{},cables=0,returning=false}={}) {
  let button=null,opened=false;
  const open=()=>{if(opened)return;opened=true;onOpen();};
  return {
    id:'setup-field-case',blocksInput:true,blocksWorld:true,allowsLook:false,lookProfile:'calm',
    key(e){
      if(e.key==='Escape'||e.code==='Escape')return false; // Pause remains available.
      if(!e.repeat&&(e.controllerAction==='bag'||e.controllerAction==='confirm'||['b','B','Enter'].includes(e.key)||['KeyB','Enter'].includes(e.code)))open();
      return true;
    },
    pointer(e){
      if(e.type==='pointerdown'&&(e.button??0)===0&&button&&e.cellX>=button.x&&e.cellX<=button.x+button.w&&e.cellY>=button.y&&e.cellY<=button.y+button.h)open();
      return true;
    },
    render(){
      const {cols,rows}=uiSize(),w=Math.min(80,cols-4),h=Math.min(13,rows-2),x=(cols-w)/2,y=Math.max(1,rows-h-2);
      uiScrim(.35);
      withMachinePanel(x,y,w,h,{label:'BEFORE YOU LEAVE',source:'FIELD KIT',meter:false,footer:''},(body)=>{
      const lines=uiWrap(returning?'Finish setting up the case. Then follow your bearing to Studio B3.'
        :cables>0?`Rehearsal finished. ${cables} spare ${cables===1?'lead':'leads'} in the case. Patch your kit, then mark Studio B3.`
          :'Rehearsal finished. This shift starts without spare leads. Check the patch bay, then mark Studio B3.',Math.max(12,body.w));
      lines.slice(0,3).forEach((line,i)=>uiText(body.x,body.y+i,line,'ui-primary',.95));
      uiText(body.x,body.y+3,`${inputPrompt('bag')} OPEN THE FIELD CASE`,'ui-amber',1);
      button={x:body.x,y:body.y+4.5,w:Math.min(30,body.w),h:2.5};
      });
      drawLampButton(button.x,button.y,button.w,button.h,{legend:'OPEN FIELD CASE',color:'amber',lit:true,latched:false});
    },
  };
}

// Finishing a line is not finishing a measurement. This hold owns input while
// the real recorder keeps ticking; it never substitutes scene time for tape.
export function makeSetupLevelHoldScene({
  getReading=()=>({}), requiredSeconds=6, onReady=()=>{}, onInterrupted=()=>{},
}={}) {
  const seconds=Number.isFinite(requiredSeconds)&&requiredSeconds>0?requiredSeconds:6;
  let finished=false;
  const reading=()=>{
    const value=getReading()||{};
    return {...value,takeElapsed:Number.isFinite(value.takeElapsed)?Math.max(0,value.takeElapsed):0};
  };
  const finish=(callback)=>{if(finished)return;finished=true;callback();};
  return {
    id:'setup-level-hold',blocksInput:true,blocksWorld:false,allowsLook:false,lookProfile:'calm',
    update(){
      if(finished)return;
      const value=reading();
      if(value.levelChecked===true||(value.recording===true&&!value.spoiled&&!value.stalled&&value.takeElapsed>=seconds)){
        finish(onReady);
      }else if(value.recording!==true||value.spoiled||value.stalled){
        finish(onInterrupted);
      }
    },
    key(e){return e.key!=='Escape'&&e.code!=='Escape';}, // Pause remains available.
    keyup(){return true;},
    pointer(){return true;},
    exit(){finished=true;},
    render(){
      if(finished)return;
      // Keep the full readout row above the well's lower lip.
      const {cols,rows}=uiSize(),w=Math.min(64,cols-4),h=Math.min(8,rows-2);
      const x=(cols-w)/2,y=Math.max(1,rows-h-2),elapsed=Math.min(seconds,reading().takeElapsed);
      withMachinePanel(x,y,w,h,{label:'HOLD STILL',wordmark:'',meter:false,footer:''},(body)=>{
      uiText(body.x,body.y,`LEVEL CHECK  ${elapsed.toFixed(1)} / ${seconds.toFixed(1)} s`,'ui-primary',.95,body.w);
      });
    },
  };
}
