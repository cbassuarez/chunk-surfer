// A player-raised presentation of the existing recorder. This owner never
// acquires a microphone, changes transport, advances music, or writes a save.
import {IS_TAURI} from './paths.js';

export const SOURCE_REST_RECORDER_PROTOCOL=1;
export const SOURCE_REST_RECORDER_LABEL='source-rest-recorder';
export const SOURCE_REST_RECORDER_EVENTS=Object.freeze({
  state:'source-rest-recorder:state',ready:'source-rest-recorder:ready',
  readyRequest:'source-rest-recorder:request-ready',painted:'source-rest-recorder:painted',
  action:'source-rest-recorder:action',
});
const phases=new Set(['wrong-return','catch']);
const modes=new Set(['sitting','seated']);
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=value=>Math.max(0,Math.min(1,finite(value)));
let sessionOrdinal=0;

/** Pure placement in the selected monitor's logical desktop coordinates.
 * Monitor/work-area positions arrive in physical pixels. Absolute positions
 * use that monitor's scale; the main window's physical extent uses its own
 * scale. This avoids dividing a Retina position twice or mixing a window's
 * CSS size with a physical monitor origin (including negative origins).
 */
export function sourceRestRecorderPlacement({monitor,mainPosition,mainSize,mainScaleFactor,
  size={width:880,height:540},margin=12,gap=12,transcriptFraction=.34}={}){
  const validPoint=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y),
    validSize=value=>value&&Number.isFinite(value.width)&&value.width>0&&Number.isFinite(value.height)&&value.height>0,
    displayScale=monitor?.scaleFactor,windowScale=mainScaleFactor;
  if(!Number.isFinite(displayScale)||displayScale<=0||!Number.isFinite(windowScale)||windowScale<=0
    ||!validPoint(mainPosition)||!validSize(mainSize)||!validPoint(monitor?.workArea?.position)||!validSize(monitor?.workArea?.size))
    return{ok:false,reason:'unavailable-window-metrics'};
  const workArea={x:monitor.workArea.position.x/displayScale,y:monitor.workArea.position.y/displayScale,
      width:monitor.workArea.size.width/displayScale,height:monitor.workArea.size.height/displayScale},
    main={x:mainPosition.x/displayScale,y:mainPosition.y/displayScale,width:mainSize.width/windowScale,height:mainSize.height/windowScale},
    inset=Math.max(8,Math.min(32,finite(margin,12))),separation=Math.max(8,Math.min(32,finite(gap,12))),
    usable={x:Math.ceil(workArea.x+inset),y:Math.ceil(workArea.y+inset),
      right:Math.floor(workArea.x+workArea.width-inset),bottom:Math.floor(workArea.y+workArea.height-inset)},
    preferred={width:Math.max(640,Math.min(1000,finite(size.width,880))),height:Math.max(400,Math.min(680,finite(size.height,540)))},
    // Conservative decoration budget: creation width/height are client sizes.
    // Keep the titlebar/frame inside the work area too, not just the canvas.
    chrome={width:24,height:48},
    transcript={x:main.x,y:main.y+main.height*(1-Math.max(.25,Math.min(.5,finite(transcriptFraction,.34)))),
      width:main.width,height:main.height*Math.max(.25,Math.min(.5,finite(transcriptFraction,.34)))};
  const fit=(region,kind)=>{
    const scale=Math.min(1,(region.right-region.x-chrome.width)/preferred.width,(region.bottom-region.y-chrome.height)/preferred.height),
      width=Math.floor(preferred.width*scale),height=Math.floor(preferred.height*scale);
    if(width<640||height<400)return null;
    const outerWidth=width+chrome.width,outerHeight=height+chrome.height,
      x=kind.endsWith('right')?region.right-outerWidth:region.x,
      y=kind.startsWith('top-')?region.y:Math.max(region.y,Math.min(region.bottom-outerHeight,Math.round(main.y)));
    return{kind,x,y,width,height,rect:{x,y,width:outerWidth,height:outerHeight},compact:scale<.999};
  };
  const sideCandidates=[
    fit({...usable,x:Math.max(usable.x,Math.ceil(main.x+main.width+separation))},'right'),
    fit({...usable,right:Math.min(usable.right,Math.floor(main.x-separation))},'left'),
  ].filter(Boolean).sort((a,b)=>b.width*b.height-a.width*a.height);
  let chosen=sideCandidates[0];
  if(!chosen){
    const region={...usable,bottom:Math.min(usable.bottom,Math.floor(transcript.y-separation))},
      overlap=rect=>Math.max(0,Math.min(rect.x+rect.width,main.x+main.width)-Math.max(rect.x,main.x))
        *Math.max(0,Math.min(rect.y+rect.height,main.y+main.height)-Math.max(rect.y,main.y));
    chosen=[fit(region,'top-right'),fit(region,'top-left')].filter(Boolean).sort((a,b)=>overlap(a.rect)-overlap(b.rect))[0];
  }
  if(!chosen)return{ok:false,reason:'insufficient-readable-space',workArea,main,transcript,scaleFactor:displayScale,mainScaleFactor:windowScale};
  return{ok:true,...chosen,workArea,main,transcript,chrome,margin:inset,gap:separation,
    scaleFactor:displayScale,mainScaleFactor:windowScale};
}

// The native envelope contains data only. In particular, callbacks embedded in
// a main-window machine cannot turn this passive face into another transport.
function dataOnly(value,depth=0,seen=new Set()){
  if(value==null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='object'||depth>14||seen.has(value))return undefined;
  seen.add(value);
  const result=Array.isArray(value)?value.slice(0,4096).map(item=>dataOnly(item,depth+1,seen))
    :Object.fromEntries(Object.entries(value).slice(0,512).flatMap(([key,item])=>{
      if(key==='__proto__'||key==='constructor'||key==='prototype'||/^on[A-Z]/.test(key))return[];
      const data=dataOnly(item,depth+1,seen);return data===undefined?[]:[[key,data]];
    }));
  seen.delete(value);return result;
}

export function sourceRestRecorderEligible(frame){
  return !!frame&&phases.has(frame.phase)&&modes.has(frame.mode)&&!!frame.machine
    &&!!frame.presentation&&!frame.presentation.empty&&!frame.presentation.suppressPeripheral
    &&!frame.black&&!frame.credits&&!frame.conversationView?.restBlack;
}
export function sourceRestRecorderOwner(frame){
  return sourceRestRecorderEligible(frame)?`${frame.ownerId||frame.seatId||'source-rest'}:${frame.phase}`:null;
}

export function createSourceRestRecorderEnvelope({sessionToken,revision,frame,faceplate=null,held=false}={}){
  if(typeof sessionToken!=='string'||!sessionToken||!Number.isSafeInteger(revision)||revision<1||!sourceRestRecorderEligible(frame))return null;
  const clean=dataOnly(frame),snapshot=dataOnly(faceplate);
  // This overrides contradictory transport flags, never their authoritative
  // source. The Source-rest face was already read-only before it became a window.
  clean.machine={...clean.machine,recording:false,playing:false,listening:false};
  clean.transitionProgress=clamp(frame.transitionProgress??1);
  return{protocol:SOURCE_REST_RECORDER_PROTOCOL,label:SOURCE_REST_RECORDER_LABEL,sessionToken,revision,
    owner:sourceRestRecorderOwner(frame),held:held===true,frame:clean,
    faceplate:snapshot?{...snapshot,held:held===true||snapshot.held===true}:null};
}

export function createSourceRestRecorderEnvelopeGate(){
  let token=null,revision=0;
  return{
    accept(value){
      if(value?.protocol!==SOURCE_REST_RECORDER_PROTOCOL||value.label!==SOURCE_REST_RECORDER_LABEL
        ||typeof value.sessionToken!=='string'||!value.sessionToken
        ||!Number.isSafeInteger(value.revision)||value.revision<1||!sourceRestRecorderEligible(value.frame)
        ||value.owner!==sourceRestRecorderOwner(value.frame))return null;
      if(value.sessionToken===token&&value.revision<=revision)return null;
      // A window is reused only within a lease. A different lease must first
      // be explicitly bound by its main-window owner, not adopted from traffic.
      if(token&&value.sessionToken!==token)return null;
      token=value.sessionToken;revision=value.revision;return value;
    },
    reset(){token=null;revision=0;},
    state:()=>({sessionToken:token,revision}),
  };
}

const withTimeout=(promise,ms,message)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(message)),ms);
  Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});

// Same Tauri WebviewWindow/event primitives as personalized-window-effects.
// It is a fixed bundled surface, with a main-window parent and no focus calls.
export async function createNativeSourceRestRecorderSurface({onClose=()=>{},size={width:880,height:540},timeoutMs=2200}={}){
  const [{WebviewWindow},{listen,emitTo},windowApi]=await Promise.all([
    import('@tauri-apps/api/webviewWindow'),import('@tauri-apps/api/event'),import('@tauri-apps/api/window'),
  ]);
  const mainWindow=windowApi.getCurrentWindow(),[monitor,mainPosition,mainSize,mainScaleFactor]=await Promise.all([
    windowApi.currentMonitor(),mainWindow.outerPosition(),mainWindow.outerSize(),mainWindow.scaleFactor(),
  ]),placement=sourceRestRecorderPlacement({monitor,mainPosition,mainSize,mainScaleFactor,size});
  // No unmeasured centred window: if even a compact readable face would cover
  // the transcript or leave the work area, the host's explicit fallback wins.
  if(!placement.ok)throw new Error(`recorder-window-${placement.reason}`);
  let window=null,closed=false,readyResolve,unlistenReady,unlistenPainted,unlistenAction,unlistenClose;
  const ready=new Promise(resolve=>{readyResolve=resolve;}),paintWaiters=new Map();
  const releaseListeners=()=>{unlistenReady?.();unlistenPainted?.();unlistenAction?.();unlistenClose?.();
    for(const resolve of paintWaiters.values())resolve(false);paintWaiters.clear();};
  try{
    unlistenReady=await listen(SOURCE_REST_RECORDER_EVENTS.ready,event=>{
      if(event.payload?.label===SOURCE_REST_RECORDER_LABEL&&event.payload.protocol===SOURCE_REST_RECORDER_PROTOCOL)readyResolve(true);
    });
    unlistenPainted=await listen(SOURCE_REST_RECORDER_EVENTS.painted,event=>{
      const payload=event.payload,key=`${payload?.sessionToken}:${payload?.revision}`;
      if(payload?.label!==SOURCE_REST_RECORDER_LABEL||payload.protocol!==SOURCE_REST_RECORDER_PROTOCOL)return;
      paintWaiters.get(key)?.(payload.drawn===true);paintWaiters.delete(key);
    });
    unlistenAction=await listen(SOURCE_REST_RECORDER_EVENTS.action,event=>{
      if(event.payload?.label===SOURCE_REST_RECORDER_LABEL&&event.payload.protocol===SOURCE_REST_RECORDER_PROTOCOL
        &&event.payload.action==='close')onClose(event.payload.sessionToken);
    });
    // A previous owner may have been interrupted during teardown. Do not let
    // its document retain an envelope gate or receive the next owner's data.
    const previous=await WebviewWindow.getByLabel(SOURCE_REST_RECORDER_LABEL);
    if(previous)await previous.close();
    window=new WebviewWindow(SOURCE_REST_RECORDER_LABEL,{
      url:'source-rest-recorder.html',parent:'main',title:'Chunk Surfer — Recorder',
      x:placement.x,y:placement.y,width:placement.width,height:placement.height,
      resizable:false,decorations:true,transparent:false,visible:false,focus:false,focusable:false,
      acceptFirstMouse:true,alwaysOnTop:false,skipTaskbar:true,shadow:true,
    });
    const created=new Promise((resolve,reject)=>{
      void window.once('tauri://created',()=>resolve(true));
      void window.once('tauri://error',event=>reject(new Error(String(event.payload||'recorder-window-create-failed'))));
    });
    unlistenClose=await window.onCloseRequested(()=>{if(!closed)onClose();});
    await withTimeout(created,timeoutMs,'recorder-window-create-timeout');
    await emitTo(SOURCE_REST_RECORDER_LABEL,SOURCE_REST_RECORDER_EVENTS.readyRequest,{});
    await withTimeout(ready,timeoutMs,'recorder-window-ready-timeout');
    return{
      placement,
      async publish(envelope){
        if(closed)return false;
        const key=`${envelope.sessionToken}:${envelope.revision}`;
        const painted=new Promise(resolve=>paintWaiters.set(key,resolve));
        try{await emitTo(SOURCE_REST_RECORDER_LABEL,SOURCE_REST_RECORDER_EVENTS.state,envelope);
          return await withTimeout(painted,timeoutMs,'recorder-window-paint-timeout');}
        finally{paintWaiters.delete(key);}
      },
      async show(){if(!closed)await window.show();},
      async hide(){if(!closed)await window.hide();},
      async close(){if(closed)return;closed=true;releaseListeners();await window.close();},
    };
  }catch(error){closed=true;releaseListeners();try{await window?.close();}catch(_){}throw error;}
}

/**
 * Host calls update with its current canonical rest frame. Only toggle opens.
 * requestNativePresentation delegates the existing fullscreen/consent/effects
 * policy to window-choreography; this module never changes display mode.
 * A false gate result uses the contained face only after that explicit request.
 */
export function createSourceRestRecorderWindow({
  getFrame=()=>null,getFaceplateSnapshot=()=>null,getHeld=()=>false,getEnabled=()=>false,
  isNative=()=>IS_TAURI,requestNativePresentation=async()=>false,
  createNativeSurface=createNativeSourceRestRecorderSurface,
  drawContainedFallback=null,onChange=()=>{},onError=()=>{},now=()=>Date.now(),publishHz=10,
}={}){
  let requested=false,disposed=false,owner=null,token=null,epoch=0,revision=0,driver=null,placement=null;
  let mode='closed',visible=false,held=false,reason='initial',opening=null,publishing=null;
  let lastPublish=-Infinity,latest=null,latestFaceplate=null;
  const status=()=>({requested,mode,visible,held,owner,sessionToken:token,revision,reason,disposed,placement});
  const notify=()=>{onChange(status());return status();};
  const error=(value)=>onError(value instanceof Error?value:new Error(String(value)));
  const read=frame=>{latest=frame??getFrame();latestFaceplate=getFaceplateSnapshot();held=getHeld()===true;return latest;};
  const current=lease=>!disposed&&requested&&epoch===lease&&owner===sourceRestRecorderOwner(latest);

  async function close(closeReason='player'){
    requested=false;epoch+=1;mode='closed';visible=false;reason=closeReason;owner=null;token=null;
    const prior=driver;driver=null;publishing=null;notify();
    try{await prior?.close();}catch(value){error(value);}
    return status();
  }
  async function useContained(lease,why){
    if(!current(lease))return status();
    mode=typeof drawContainedFallback==='function'?'contained':'unavailable';
    visible=mode==='contained'&&!held;reason=why;return notify();
  }
  async function publish(force=false){
    if(!driver||mode!=='native'||!requested)return status();
    if(held){if(visible){visible=false;await driver.hide();notify();}return status();}
    if(publishing?.surface===driver&&publishing.lease===epoch)return publishing.promise;
    const interval=1000/Math.max(1,Math.min(30,finite(publishHz,10)));
    if(!force&&visible&&now()-lastPublish<interval)return status();
    const lease=epoch,surface=driver;
    const envelope=createSourceRestRecorderEnvelope({sessionToken:token,revision:++revision,frame:latest,faceplate:latestFaceplate,held});
    if(!envelope){await close('ineligible');return status();}
    const flight={surface,lease,promise:null};
    flight.promise=(async()=>{
      try{
        const drawn=await surface.publish(envelope);
        if(!current(lease)||driver!==surface)return status();
        if(!drawn)throw new Error('recorder-face-not-drawn');
        lastPublish=now();
        if(held){visible=false;await surface.hide();}
        else if(!visible){await surface.show();if(current(lease)&&!held)visible=true;else await surface.hide();}
        return notify();
      }catch(value){
        if(current(lease)&&driver===surface){driver=null;visible=false;await surface.close().catch(()=>{});error(value);return useContained(lease,'native-error');}
        return status();
      }finally{if(publishing===flight)publishing=null;}
    })();
    publishing=flight;return flight.promise;
  }
  async function open(lease){
    if(!isNative()||getEnabled()!==true)return useContained(lease,'native-disabled');
    let granted=false;
    try{granted=await requestNativePresentation({reason:'source-rest-recorder',owner,isCurrent:()=>current(lease)});}catch(value){error(value);}
    if(!current(lease))return status();
    if(granted!==true&&granted?.ok!==true)return useContained(lease,'native-declined');
    if(getEnabled()!==true)return close('policy-disabled');
    try{
      const surface=await createNativeSurface({onClose:closeToken=>{
        if(current(lease)&&(!closeToken||closeToken===token))void close('player-window');
      }});
      if(!current(lease)){await surface.close();return status();}
      driver=surface;placement=surface.placement||null;mode='native';reason='player';return publish(true);
    }catch(value){if(current(lease)){error(value);return useContained(lease,'native-error');}return status();}
  }
  async function toggle(frame){
    if(disposed)return status();
    if(requested)return close('player');
    read(frame);
    if(held||!sourceRestRecorderEligible(latest)){reason=held?'held':'ineligible';return notify();}
    requested=true;owner=sourceRestRecorderOwner(latest);token=`rest-recorder-${++sessionOrdinal}-${Math.floor(now())}`;
    revision=0;placement=null;lastPublish=-Infinity;const lease=++epoch;mode='opening';visible=false;reason='player';notify();
    opening=open(lease);try{return await opening;}finally{opening=null;}
  }
  async function update(frame){
    read(frame);
    if(!requested||disposed)return status();
    if(!sourceRestRecorderEligible(latest)||sourceRestRecorderOwner(latest)!==owner)return close('rest-boundary');
    if(mode==='native'&&getEnabled()!==true)return close('policy-disabled');
    if(mode==='contained'){visible=!held;return notify();}
    if(mode==='native')return publish(!visible&&!held);
    return status();
  }
  function renderFallback(){
    if(!requested||mode!=='contained'||held||!sourceRestRecorderEligible(latest))return false;
    drawContainedFallback(latest,{faceplate:latestFaceplate,held});return true;
  }
  async function dispose(){if(disposed)return status();disposed=true;await close('disposed');return notify();}
  return{toggle,update,close,dispose,renderFallback,state:status};
}
