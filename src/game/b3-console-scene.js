// The desk keeps running in the room. Taking hands off it lends the existing
// player camera back; it does not aim the player at a staged apparition.
import * as scenes from './scenes.js';
import {uiSize,uiText} from '../render/ui.js';
import {b3ConsoleLayout,b3ConsoleHit,b3FaderFromY,drawB3Console} from '../render/b3-console-view.js';
import {fitText} from '../render/fit-text.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export function makeB3ConsoleScene({getState=()=>({}),onFader=()=>{},onPower=()=>{},onClose=()=>{},onControl=()=>{},
  onInspect=()=>{},onLookMode=()=>{},isRecording=()=>false,onRecord=()=>{}}={}){
  let scene,closed=false,notified=false,selected=1,focus='fader',looking=false,drag=null,press=null,size={cols:120,rows:38};
  const state=()=>({...(getState()||{}),selected,focus,looking,pressed:press?.kind||null,dragChannel:drag?.channel||null});
  const layout=()=>b3ConsoleLayout(size,selected);
  const notify=()=>{if(notified)return;notified=true;onClose();};
  const cancel=()=>{drag=null;press=null;};
  const setLooking=(value,event={})=>{
    const next=!!value;if(looking===next)return false;
    cancel();looking=next;
    onLookMode(looking,{gesture:event.isTrusted===true||event.originalEvent?.isTrusted===true||!!event.controllerAction,event});
    onControl('look',{looking});return true;
  };
  const close=()=>{if(closed)return;setLooking(false);closed=true;cancel();if(!scenes.remove(scene))notify();};
  const select=channel=>{selected=Math.round(clamp(channel,1,16));focus='fader';};
  const set=(channel,value)=>{
    if(closed||looking)return;select(channel);
    const old=clamp((getState()?.fader||[])[selected-1]??.75,0,1),next=clamp(value,0,1);
    if(Math.abs(old-next)<.0001)return;
    onFader(selected,next);onControl('fader',{channel:selected,value:next});
  };
  const toggle=()=>{if(closed||looking)return;focus='power';const next=!getState()?.powerOn;onPower(next);onControl('power',{on:next});};
  const activate=(hit,event)=>{
    if(hit?.kind==='inspect')onInspect();else if(hit?.kind==='close')close();else if(hit?.kind==='look')setLooking(!looking,event);
    else if(hit?.kind==='power')toggle();else if(hit?.kind==='previous')select(selected-layout().visible);
    else if(hit?.kind==='next')select(selected+layout().visible);
  };
  scene={id:'b3-console',blocksInput:true,blocksWorld:false,get allowsLook(){return looking;},handlesEscape:true,worldPresentation:'visible',
    enter(){closed=false;const viewport=uiSize();if(viewport.cols>0&&viewport.rows>0)size=viewport;},
    exit(){if(looking)setLooking(false);closed=true;cancel();notify();},
    blur:cancel,suspend:cancel,resume:cancel,
    view(){const l=layout();return{...state(),layout:l,dragging:!!drag,worldVisibleToY:looking?l.collapsed.y:l.worldVisibleToY};},
    key(e={}){
      if(closed)return false;
      const key=String(e.key||'').toLowerCase(),action=e.controllerAction;
      if(e.ctrlKey||e.altKey||e.metaKey)return true;
      if(key==='escape'||key==='e'||e.code==='KeyE'||action==='back'){if(!e.repeat)close();return true;}
      // STOP remains the existing transport action, including while looking
      // through the booth glass. This never starts a take from the desk.
      if(key==='r'||e.code==='KeyR'||action==='recorder'){if(!e.repeat&&isRecording())onRecord();return true;}
      if(key==='tab'||e.code==='Tab'||action==='tabNext'||action==='tabPrev'){
        e.preventDefault?.();if(!e.repeat)setLooking(!looking,e);return true;
      }
      if(looking){if(action==='confirm'&&!e.repeat)setLooking(false,e);return true;}
      if(key==='i'||e.code==='KeyI'){if(!e.repeat)onInspect();return true;}
      if(key==='p'||e.code==='KeyP'){if(!e.repeat){const previous=focus;toggle();focus=previous;}return true;}
      if(key==='arrowleft'||key==='a'||action==='move_left'){
        if(focus==='power'){focus='fader';select(16);}else if(selected===1)focus='power';else select(selected-1);return true;
      }
      if(key==='arrowright'||key==='d'||action==='move_right'){
        if(focus==='power')select(1);else if(selected===16)focus='power';else select(selected+1);return true;
      }
      if(key==='arrowup'||key==='w'||action==='move_up'){if(focus!=='power')set(selected,((getState()?.fader||[])[selected-1]??.75)+.1);return true;}
      if(key==='arrowdown'||key==='s'||action==='move_down'){if(focus!=='power')set(selected,((getState()?.fader||[])[selected-1]??.75)-.1);return true;}
      if(key==='pageup'){select(selected-layout().visible);return true;}if(key==='pagedown'){select(selected+layout().visible);return true;}
      if(key==='home'){if(focus!=='power')set(selected,1);return true;}if(key==='end'){if(focus!=='power')set(selected,0);return true;}
      if((key==='enter'||key===' '||action==='confirm')&&!e.repeat&&focus==='power')toggle();
      return true;
    },
    keyup(){return true;},
    pointer(e={}){
      if(closed)return false;
      if(e.type==='pointercancel'||e.type==='lostpointercapture'){cancel();return true;}
      if(looking){
        // Entering LOOK commits on pointer-up. Only a later fresh click can
        // return the hands, so its own activation cannot cancel the camera.
        if(e.type==='pointerdown'&&(e.button??0)===0)setLooking(false,e);
        return true;
      }
      if(e.type==='pointerup'){
        if(drag?.id===(e.pointerId??0))drag=null;
        const old=press;press=null;
        if((e.button??0)===0&&old&&old.id===(e.pointerId??0)){
          const hit=b3ConsoleHit(layout(),Number(e.cellX),Number(e.cellY));if(hit?.kind===old.kind)activate(hit,e);
        }return true;
      }
      if(e.type==='pointermove'&&drag?.id===(e.pointerId??0)){
        const strip=layout().strips.find(s=>s.channel===drag.channel);if(strip)set(drag.channel,b3FaderFromY(strip.track,e.cellY));return true;
      }
      if(e.type!=='pointerdown'||(e.button??0)!==0)return true;
      const hit=b3ConsoleHit(layout(),Number(e.cellX),Number(e.cellY));cancel();
      if(hit?.kind==='select')select(hit.channel);
      else if(hit?.kind==='fader'){select(hit.channel);drag={id:e.pointerId??0,channel:hit.channel};set(hit.channel,b3FaderFromY(hit.track,e.cellY));}
      else if(hit)press={id:e.pointerId??0,kind:hit.kind};
      return true;
    },
    render(viewport=uiSize()){
      if(viewport.cols>0&&viewport.rows>0)size=viewport;
      drawB3Console(state(),size);
      const footer=(isRecording()?'R STOP  ·  ':'')+'E LEAVE  ·  '+(looking?'CLICK / TAB DESK':'I TRACE / PATCH  ·  TAB LOOK  ·  P POWER  ·  ← → CHANNEL  ·  ↑ ↓ FADER');
      uiText(1,size.rows-.85,fitText(footer,Math.max(1,size.cols-2)),'ui-dim');
    },
  };return scene;
}
