// Hands on the existing booth desk. The room continues to run behind the
// console; exiting returns the player's normal camera and movement ownership.
import * as scenes from './scenes.js';
import {uiSize,uiText} from '../render/ui.js';
import {b3ConsoleLayout,b3ConsoleHit,b3FaderFromY,drawB3Console} from '../render/b3-console-view.js';
import {fitText} from '../render/fit-text.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export function makeB3ConsoleScene({getState=()=>({}),onFader=()=>{},onPower=()=>{},onClose=()=>{},onControl=()=>{},
  isRecording=()=>false,onRecord=()=>{}}={}){
  let scene,closed=false,notified=false,selected=1,focus='fader',drag=null,size={cols:120,rows:38};
  const state=()=>{const s=getState()||{};return {...s,selected,focus};};
  const layout=()=>b3ConsoleLayout(size,selected);
  const notify=()=>{if(notified)return;notified=true;onClose();};
  const close=()=>{if(closed)return;closed=true;drag=null;if(!scenes.remove(scene))notify();};
  const select=channel=>{selected=Math.round(clamp(channel,1,16));focus='fader';};
  const set=(channel,value)=>{
    if(closed)return;select(channel);
    const old=clamp((getState()?.fader||[])[selected-1]??.5,0,1),next=clamp(value,0,1);
    if(Math.abs(old-next)<.0001)return;
    onFader(selected,next);onControl('fader',{channel:selected,value:next});
  };
  const toggle=()=>{if(closed)return;focus='power';const next=!getState()?.powerOn;onPower(next);onControl('power',{on:next});};
  scene={id:'b3-console',blocksInput:true,blocksWorld:false,allowsLook:false,handlesEscape:true,worldPresentation:'visible',
    enter(){closed=false;const viewport=uiSize();if(viewport.cols>0&&viewport.rows>0)size=viewport;},
    exit(){closed=true;drag=null;notify();},
    blur(){drag=null;},resume(){drag=null;},
    view(){return {...state(),layout:layout(),dragging:!!drag};},
    key(e={}){
      if(closed)return false;
      const key=String(e.key||'').toLowerCase(),action=e.controllerAction;
      if(key==='escape'||key==='e'||e.code==='KeyE'||action==='back'){if(!e.repeat)close();return true;}
      // Preserve the normal stop verb from the booth; the desk never starts
      // a new recording or changes transport on repeated key events.
      if(key==='r'||e.code==='KeyR'){if(!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&isRecording())onRecord();return true;}
      if(e.ctrlKey||e.altKey||e.metaKey)return true;
      if(key==='tab'||action==='tabNext'||action==='tabPrev'){if(!e.repeat){focus=focus==='power'?'fader':'power';onControl('select',{focus});}e.preventDefault?.();return true;}
      if(key==='arrowleft'||action==='move_left'){select(selected-1);return true;}
      if(key==='arrowright'||action==='move_right'){select(selected+1);return true;}
      if(key==='arrowup'||action==='move_up'){if(focus==='power')focus='fader';set(selected,(getState()?.fader||[])[selected-1]+.1);return true;}
      if(key==='arrowdown'||action==='move_down'){if(focus==='power')focus='fader';set(selected,(getState()?.fader||[])[selected-1]-.1);return true;}
      if(key==='home'){set(selected,1);return true;}if(key==='end'){set(selected,0);return true;}
      if((key==='enter'||key===' '||action==='confirm')&&!e.repeat&&focus==='power'){toggle();return true;}
      return true;
    },
    keyup(){return true;},
    pointer(e={}){
      if(closed)return false;
      if(e.type==='pointercancel'||e.type==='lostpointercapture'){drag=null;return true;}
      if(e.type==='pointerup'){if(drag?.id===(e.pointerId??0))drag=null;return true;}
      if(e.type==='pointermove'&&drag?.id===(e.pointerId??0)){
        const strip=layout().strips.find(s=>s.channel===drag.channel);if(strip)set(drag.channel,b3FaderFromY(strip.track,e.cellY));return true;
      }
      if(e.type!=='pointerdown'||(e.button??0)!==0)return true;
      const hit=b3ConsoleHit(layout(),Number(e.cellX),Number(e.cellY));
      if(hit?.kind==='close')close();
      else if(hit?.kind==='power')toggle();
      else if(hit?.kind==='previous')select(selected-4);
      else if(hit?.kind==='next')select(selected+4);
      else if(hit?.kind==='select')select(hit.channel);
      else if(hit?.kind==='fader'){select(hit.channel);drag={id:e.pointerId??0,channel:hit.channel};set(hit.channel,b3FaderFromY(hit.track,e.cellY));}
      return true;
    },
    render(viewport=uiSize()){
      if(viewport.cols>0&&viewport.rows>0)size=viewport;
      const view=state();drawB3Console(view,size);
      const footer=(isRecording()?'R STOP  ·  ':'')+(focus==='power'?'E LEAVE  ·  ENTER SWITCH  ·  TAB FADERS':'E LEAVE  ·  ← → CHANNEL  ·  ↑ ↓ FADER  ·  TAB POWER');
      uiText(1,size.rows-.95,fitText(footer,Math.max(1,size.cols-2)),'ui-dim');
    },
  };return scene;
}
