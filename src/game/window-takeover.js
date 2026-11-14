// A window that stops being beside the game and becomes the game.
//
// A pane opens at the edge of things, grows until it covers the picture, stays long
// enough to start going wrong, and gives the picture back. Input never leaves the
// game: the layer takes no pointer and no keys, so he goes on walking in a room he
// can't see. Nothing says what the pane is or whose it is.
//
// Three ways it can run, each one whole:
//   native     a real OS pane opens beside the window, then the cover grows in frame.
//              The OS pane takes no input and can't be focused.
//   in-window  browser builds and withheld consent: the same pane, in frame.
//   calm       reduced dread: the same picture in a corner, for a while. It never
//              covers anything, and the room stays in view.
//
// It never traps. Waiting ends it, a long press ends it, anything that matters more
// ends it, and there is a hard limit under all of those.
import {windowMediaAsset} from '../platform/window-composition.js';
import {HAYSTACK_PAPER,createHaystackPaperSurface} from '../render/haystack-paper.js';

export const WINDOW_TAKEOVER=Object.freeze({
  sceneId:'takeover:memory',
  paneSeconds:2.6,growSeconds:8,heldSeconds:Object.freeze([11,19]),restoreSeconds:1.8,yieldSeconds:.35,
  fadeSeconds:.6,calmSeconds:7,hardLimitSeconds:40,longPressSeconds:1.2,promptAfterSeconds:5,
  pane:Object.freeze({x:.76,y:.08,w:.2,h:.2}),
});
const C=WINDOW_TAKEOVER;
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const ease=x=>{const t=clamp01(x);return t*t*t*(10+t*(-15+6*t));};
const mix=(a,b,t)=>a+(b-a)*t;

export function windowTakeoverMode({enabled=false,native=false,introduced=false,reduceDread=false}={}){
  if(reduceDread)return 'calm';
  return enabled&&native&&introduced?'native':'in-window';
}

/** The timeline alone. Calls onDone exactly once, on every way out. */
export function createWindowTakeoverState({mediaId='',mode='in-window',reducedMotion=false,seed=Math.random(),onDone=()=>{}}={}){
  const heldSeconds=mix(C.heldSeconds[0],C.heldSeconds[1],clamp01(seed)),calm=mode==='calm';
  let phase='pane',clock=0,elapsed=0,press=0,cover=0,fade=reducedMotion?0:1,fault=0,reason=null,leaving=C.restoreSeconds,from=0,done=false;
  function finish(){if(done)return;done=true;phase='done';cover=0;fade=0;onDone({reason:reason||'finished',mediaId,mode});}
  function restore(why,seconds=C.restoreSeconds){
    if(done||phase==='restore')return;
    reason=why;phase='restore';clock=0;from=cover;leaving=Math.max(.01,reducedMotion?Math.min(seconds,C.fadeSeconds):seconds);
  }
  function update(dt,{held=false,yieldNow=false}={}){
    if(done)return view();
    const h=Math.max(0,Math.min(.25,Number(dt)||0));
    elapsed+=h;clock+=h;press=held?press+h:0;
    if(yieldNow)restore('yield',C.yieldSeconds);
    else if(press>=C.longPressSeconds)restore('long-press');
    else if(elapsed>=C.hardLimitSeconds)restore('limit');
    if(reducedMotion&&phase!=='restore')fade=clamp01(fade+h/C.fadeSeconds);
    if(phase==='pane'){
      if(calm){if(clock>=C.calmSeconds)restore('finished');}
      else if(clock>=C.paneSeconds){phase='grow';clock=0;}
    }else if(phase==='grow'){
      cover=reducedMotion?1:ease(clock/C.growSeconds);
      if(clock>=(reducedMotion?C.fadeSeconds:C.growSeconds)){cover=1;phase='held';clock=0;}
    }else if(phase==='held'){
      fault=ease(clock/heldSeconds);
      if(clock>=heldSeconds)restore('finished');
    }else if(phase==='restore'){
      const t=clamp01(clock/leaving);
      if(reducedMotion||calm)fade=1-t;else cover=from*(1-ease(t));
      if(t>=1)finish();
    }
    return view();
  }
  function view(){
    const p=C.pane,rect=calm?{x:p.x,y:p.y,w:p.w,h:p.h}:{x:mix(p.x,0,cover),y:mix(p.y,0,cover),w:mix(p.w,1,cover),h:mix(p.h,1,cover)};
    const opacity=done?0:reducedMotion||calm?(calm&&phase==='pane'?clamp01(clock/C.fadeSeconds):fade):1;
    return Object.freeze({mediaId,mode,phase,reason,done,cover,rect,opacity,fault,elapsed,pressing:press>0,
      // Named once a player could reasonably be wondering, and never before.
      prompt:!done&&!calm&&phase!=='restore'&&cover>.4&&elapsed>=C.promptAfterSeconds});
  }
  return{update,restore,view,cancel(why='cancelled'){reason=reason||why;finish();return true;}};
}

function mediaElement(documentApi,mediaId,reducedMotion){
  const asset=windowMediaAsset(mediaId);
  if(!asset||!['video','image'].includes(asset.kind)){
    const field=documentApi.createElement('div');
    field.style.cssText='position:absolute;inset:0;background:linear-gradient(#cfd2c4 0 46%,#7c8a54 46% 100%);';
    return field;
  }
  const d=asset.derivatives||{},poster=d.poster?.path;
  if(asset.kind==='image'||reducedMotion){
    const img=documentApi.createElement('img');img.src=poster||d.image?.path||d.full?.path||'';img.alt='';
    img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    return img;
  }
  const video=documentApi.createElement('video');
  video.muted=true;video.defaultMuted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='auto';if(poster)video.poster=poster;
  video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
  for(const kind of ['webm','mp4']){const path=d[kind]?.path;if(!path)continue;const source=documentApi.createElement('source');source.src=path;source.type=`video/${kind}`;video.append(source);}
  void video.play?.()?.catch?.(()=>{});
  return video;
}

/** One takeover at a time, on its own clock, so a stalled game loop still lets go of the picture. */
export function createWindowTakeover({documentApi=globalThis.document,shouldYield=()=>false,showNativePane=async()=>false,hideNativePane=()=>{},
  createPaperSurface=createHaystackPaperSurface,frame=globalThis.requestAnimationFrame?.bind(globalThis),cancelFrame=globalThis.cancelAnimationFrame?.bind(globalThis),now=()=>globalThis.performance.now(),gamepads=()=>globalThis.navigator?.getGamepads?.()||[]}={}){
  let active=null,layer=null,pane=null,prompt=null,raf=null,last=0,native=false,pendingNative=false,generation=0,contentSurface=null;
  let ready=true,preparedAt=0,episode=null;
  const held=new Set();
  const down=e=>{const k=String(e.key||'').toLowerCase();if(k==='e'||k==='enter'||k==='escape')held.add(k);};
  const up=e=>held.delete(String(e.key||'').toLowerCase());
  const padHeld=()=>{for(const pad of gamepads()||[])if(pad?.buttons?.some(b=>b?.pressed))return true;return false;};
  function mount(mediaId,reducedMotion,name){
    layer=documentApi.createElement('div');layer.className='window-takeover';layer.setAttribute('aria-hidden','true');
    layer.style.cssText='position:absolute;inset:0;z-index:30;pointer-events:none;overflow:hidden;';
    pane=documentApi.createElement('div');pane.style.cssText='position:absolute;overflow:hidden;background:#000;';
    if(mediaId===HAYSTACK_PAPER.id){contentSurface=createPaperSurface({documentApi,name});pane.append(contentSurface.element);ready=false;}
    else{pane.append(mediaElement(documentApi,mediaId,reducedMotion));ready=true;}
    prompt=documentApi.createElement('div');prompt.textContent='HOLD E';
    prompt.style.cssText='position:absolute;left:0;right:0;bottom:6%;text-align:center;font:12px monospace;letter-spacing:.2em;color:#fff;opacity:0;text-shadow:0 0 3px #000;transition:opacity 1.2s;';
    layer.append(pane,prompt);(documentApi.querySelector?.('#wrap')||documentApi.body)?.append?.(layer);
    documentApi.addEventListener?.('keydown',down,{capture:true});documentApi.addEventListener?.('keyup',up,{capture:true});
  }
  function unmount(){
    generation++;if(raf!=null)cancelFrame?.(raf);raf=null;
    documentApi.removeEventListener?.('keydown',down,{capture:true});documentApi.removeEventListener?.('keyup',up,{capture:true});held.clear();
    pane?.querySelector?.('video')?.pause?.();contentSurface?.dispose?.();contentSurface=null;layer?.remove?.();layer=pane=prompt=null;
    if(native){native=false;hideNativePane();}
  }
  function paint(v,reducedMotion){
    if(!pane)return;
    const jitter=!reducedMotion&&v.fault>.35&&Math.random()<v.fault*.12?(Math.random()-.5)*v.fault*.012:0;
    pane.style.left=`${(v.rect.x+jitter)*100}%`;pane.style.top=`${v.rect.y*100}%`;pane.style.width=`${v.rect.w*100}%`;pane.style.height=`${v.rect.h*100}%`;
    pane.style.opacity=String(!ready||pendingNative||native&&v.phase==='pane'?0:v.opacity);
    // Paper already uses the shared recorded-media shader. CSS filters would
    // re-encode its dither and soften the letters instead of the acquisition.
    pane.style.filter=contentSurface?'':v.fault>0?`contrast(${1+v.fault*.7}) saturate(${1-v.fault*.65}) blur(${v.fault*1.1}px)`:'';
    contentSurface?.paint?.();
    if(prompt)prompt.style.opacity=v.prompt?(v.pressing?'1':'.55'):'0';
    if(episode&&!episode.shown&&ready&&!pendingNative&&v.phase!=='restore'&&(native||v.opacity>.01)){
      episode.shown=true;try{episode.onShown();}catch(error){console.error('window takeover shown',error);}
    }
  }
  function startNative(owner,mediaId,reducedMotion,name){
    pendingNative=true;
    void Promise.resolve().then(()=>{
      if(owner!==generation||!active||shouldYield())return false;
      return showNativePane(mediaId,{reducedMotion,name,isCurrent:()=>owner===generation&&!!active&&!shouldYield()});
    }).then(ok=>{
      pendingNative=false;
      if(owner!==generation||!active){if(ok)hideNativePane();return;}
      if(shouldYield()){if(ok)hideNativePane();active.cancel('yield');return;}
      native=!!ok;last=now();paint(active.view(),reducedMotion);
    },()=>{pendingNative=false;if(owner===generation&&active){native=false;last=now();paint(active.view(),reducedMotion);}});
  }
  function tick(reducedMotion){
    raf=null;if(!active)return;
    const t=now(),dt=(t-last)/1000;last=t;
    if(shouldYield()){active.restore('yield',C.yieldSeconds);}
    if(!ready||pendingNative){
      if(active.view().phase==='restore')active.cancel('yield');
      else if(t-preparedAt>=8000)active.cancel('media-unavailable');
    }else{
      const v=active.update(dt,{held:held.size>0||padHeld(),yieldNow:!!shouldYield()});
      if(native&&v.phase!=='pane'){native=false;hideNativePane();}
      paint(v,reducedMotion);
    }
    if(active)raf=frame?.(()=>tick(reducedMotion))??null;
  }
  return{
    begin(mediaId,{mode='in-window',reducedMotion=false,name=null,seed,onShown=()=>{},onDone=()=>{}}={}){
      if(active||pendingNative||!documentApi?.createElement||shouldYield())return false;
      const known=mediaId===HAYSTACK_PAPER.id||mediaId==='empty-field'||!!windowMediaAsset(mediaId);if(!known)return false;
      const owner=++generation,item={shown:false,onShown};episode=item;preparedAt=now();
      active=createWindowTakeoverState({mediaId,mode,reducedMotion,seed,onDone:result=>{active=null;unmount();episode=null;try{onDone({...result,shown:item.shown});}catch(error){console.error('window takeover onDone',error);}}});
      try{mount(mediaId,reducedMotion,name);}catch(_){active.cancel('media-unavailable');return false;}
      const prepared=()=>{if(owner!==generation||!active)return;if(shouldYield()){active.cancel('yield');return;}ready=true;last=now();if(mode==='native')startNative(owner,mediaId,reducedMotion,name);else paint(active.view(),reducedMotion);};
      if(contentSurface)Promise.resolve(contentSurface.ready).then(ok=>{if(owner!==generation||!active)return;if(ok)prepared();else active.cancel('media-unavailable');},()=>{if(owner===generation&&active)active.cancel('media-unavailable');});
      else if(mode==='native')startNative(owner,mediaId,reducedMotion,name);
      last=now();paint(active.view(),reducedMotion);raf=frame?.(()=>tick(reducedMotion))??null;
      return true;
    },
    active:()=>!!active||pendingNative,
    // Diagnostic state deliberately contains no paper address or text.
    view:()=>active?{...active.view(),shown:!!episode?.shown,preparing:!ready||pendingNative}:null,
    restore:why=>active?(active.restore(why),true):false,
    cancel:why=>active?active.cancel(why):false,
  };
}
