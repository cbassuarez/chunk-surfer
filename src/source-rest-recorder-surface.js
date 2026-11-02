// An event-driven, silent instrument surface. No RAF/audio/transport/save owner.
import {uiInit,uiClear,uiSize,uiPhysicalSize,uiCellMetrics,uiSetScale} from './render/ui.js';
import {applyVfdSettings} from './render/palette.js';
import {drawRecorderFace,RECORDER_PANEL} from './render/recorder-view.js';
import {drawSourceRestInstrument} from './render/source-rest-instrument.js';
import {beginFaceplateModuleFrame,endFaceplateModuleFrame} from './render/faceplate-modules.js';
import {createSourceRestRecorderEnvelopeGate,SOURCE_REST_RECORDER_PROTOCOL,SOURCE_REST_RECORDER_LABEL,
  SOURCE_REST_RECORDER_EVENTS as events} from './platform/source-rest-recorder-window.js';
import './source-rest-recorder-surface.css';

const gate=createSourceRestRecorderEnvelopeGate(),host=document.getElementById('recorder');
uiInit(host);
let envelope=null,disposed=false,fontsReady=false,emit=async()=>{},unlisten=[],deviceScale=1;
const ready=()=>fontsReady&&!disposed
  ?emit(events.ready,{protocol:SOURCE_REST_RECORDER_PROTOCOL,label:SOURCE_REST_RECORDER_LABEL,fontsReady:true})
  :Promise.resolve(false);
const identity=()=>({protocol:SOURCE_REST_RECORDER_PROTOCOL,label:SOURCE_REST_RECORDER_LABEL,
  sessionToken:envelope?.sessionToken,revision:envelope?.revision});
function paint(){
  uiClear();if(!fontsReady||!envelope||envelope.held||disposed)return false;
  const nextScale=window.innerWidth<760||window.innerHeight<480?.8:1;
  if(nextScale!==deviceScale){deviceScale=nextScale;uiSetScale(deviceScale);}
  applyVfdSettings(envelope.frame.vfdSettings||{});
  // Same supplied current-run clock/map/telemetry as the host: never a local
  // countdown or inferred location. Canonical scope/held flags remain intact.
  beginFaceplateModuleFrame(envelope.faceplate||{enabled:false},uiPhysicalSize());
  const size=uiSize(),{cellW,cellH}=uiCellMetrics(),
    scale=Math.min((size.cols-3)*cellW/RECORDER_PANEL.width,(size.rows-2)*cellH/RECORDER_PANEL.height),
    rect={x:(size.cols-RECORDER_PANEL.width*scale/cellW)/2,y:(size.rows-RECORDER_PANEL.height*scale/cellH)/2,
      w:RECORDER_PANEL.width*scale/cellW,h:RECORDER_PANEL.height*scale/cellH,compact:false};
  // Layout the shared story against a generous virtual canvas, then place its
  // unchanged physical face in this explicit device viewport. Conversation is
  // used for field storytelling but occupies no second subtitle in this window.
  const drawn=drawSourceRestInstrument({...envelope.frame,cols:190,rows:200,transitionProgress:1},
    {drawFace:view=>drawRecorderFace({...view,rect,nowMs:envelope.faceplate?.now??envelope.frame.machine?.nowMs??0})});
  endFaceplateModuleFrame();
  return drawn;
}
async function accept(value){
  const next=gate.accept(value);if(!next||disposed)return false;
  envelope=next;if(!fontsReady)return false;
  return present();
}
async function present(){
  let drawn=false;
  try{drawn=paint();}catch(error){document.documentElement.dataset.renderError=String(error?.message||error);}
  await emit(events.painted,{...identity(),drawn});return drawn;
}
window.addEventListener('resize',paint,{passive:true});
window.addEventListener('keydown',event=>{
  if(event.repeat||event.metaKey||event.ctrlKey||event.altKey||!envelope)return;
  if(event.code==='KeyR'||event.key==='Escape'){event.preventDefault();void emit(events.action,{...identity(),action:'close'});}
});
async function waitForHardwareFonts(){
  const fonts=document.fonts;
  if(typeof fonts?.load!=='function')throw new Error('recorder-font-api-unavailable');
  const loaded=await Promise.all([
    fonts.load('400 14px "Hardware Sans"'),fonts.load('700 14px "Hardware Sans"'),
  ]);
  if(loaded.some(faces=>!faces?.length))throw new Error('recorder-hardware-font-unavailable');
  await fonts.ready;
}
async function start(){
  if(globalThis.window?.__TAURI_INTERNALS__){
    const api=await import('@tauri-apps/api/event');emit=api.emit;
    unlisten.push(await api.listen(events.state,event=>void accept(event.payload)));
    unlisten.push(await api.listen(events.readyRequest,()=>void ready()));
  }
  // A ready/paint receipt must witness the bundled instrument typefaces, not
  // a temporary system-font substitute that changes the physical readout.
  await waitForHardwareFonts();if(disposed)return;
  fontsReady=true;await ready();if(envelope)await present();
}
void start().catch(error=>{document.documentElement.dataset.renderError=String(error?.message||error);});
window.addEventListener('pagehide',()=>{disposed=true;unlisten.forEach(stop=>stop());envelope=null;gate.reset();},{once:true});
