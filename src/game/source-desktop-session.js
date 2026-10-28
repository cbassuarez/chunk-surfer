import { createSourceDesktopView } from '../render/source-desktop-view.js';
import { sourceDesktopInputActive } from './source-desktop-focus.js';

// Presentation lease only. The combat scene supplies every clock, decision and
// outcome; neither this view nor the passive native webview can advance combat.
export function createSourceDesktopSession({
  director, host = globalThis.document?.getElementById('wrap'),
  pressurePresentation = null, createView = createSourceDesktopView,
  accessibility = () => ({}),
  hasFocus = null,
  nativeListen = null,
  afterPaint = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(resolve));
    else queueMicrotask(resolve);
  }),
  presentationTimeoutMs = 1800,
} = {}) {
  let view = null, container = null, ready = false, ended = false;
  let mode = 'fallback', revision = 0, last = null, starting = null;
  let lastStage = null, lastSize = '';
  let token = '', reason = '', placement = null;
  let inputFrameReady=false,completion=null,sealGeneration=0,lastPresented=0,witness=null,witnessTask=null,unlisten=null,sealingFrame=null,sealingPaused=null,sealVisibilityRevision=0;
  const inputFocused=()=>sourceDesktopInputActive({hasFocus:()=>typeof hasFocus==='function'?hasFocus():undefined});
  async function bindWitness() {
    if(witnessTask)return witnessTask;
    witnessTask=(async()=>{
      let listen=nativeListen;
      if(!listen&&(globalThis.window?.__TAURI_INTERNALS__||globalThis.window?.__TAURI__)){
        try{listen=(await import('@tauri-apps/api/event')).listen;}catch{return false;}
      }
      if(typeof listen!=='function')return false;
      unlisten=await listen('source-desktop:presented',event=>{
        const p=event?.payload||event;
        if(ended||!token||p?.token!==token||!Number.isInteger(p.revision))return;
        lastPresented=Math.max(lastPresented,p.revision);
        if(witness&&lastPresented>=witness.revision)witness.finish(true);
      });
      if(ended){unlisten?.();unlisten=null;return false;}
      return true;
    })().catch(()=>false);
    return witnessTask;
  }
  function presented(revision) {
    if(lastPresented>=revision)return Promise.resolve(true);
    return new Promise(resolve=>{
      const finish=value=>{if(witness?.finish!==finish)return;clearTimeout(timer);witness=null;resolve(value);};
      const timer=setTimeout(()=>finish(false),Math.max(1,presentationTimeoutMs));
      witness={revision,finish};
    });
  }
  function refreshMode() {
    const native = director?.sourceDesktopState?.();
    if (mode === 'native' && native?.mode === 'fallback') {
      mode = 'fallback'; reason = native.reason || 'restored-to-window';
    }
    return mode;
  }
  function ensureView() {
    if (view || ended || !host) return view;
    container = host.ownerDocument.createElement('div');
    container.dataset.sourceDesktop = 'contained';
    container.style.cssText = 'position:absolute;z-index:7;pointer-events:none;overflow:hidden;background:#030606;display:none;';
    host.appendChild(container);
    view = createView({ container, onError:() => { ready=false;reason='presentation-unavailable'; } });
    Promise.resolve(view.ready).then(() => { if (!ended) ready = true; }).catch(() => { reason = 'presentation-unavailable'; });
    return view;
  }
  function snapshot(frame = last || {}) {
    return { ...frame, ...accessibility(), version:1, token, revision:++revision,
      mode, pressurePresentation, paused:!!frame.paused || !!globalThis.document?.hidden };
  }
  function frame(value, stage = null, {terminal=false} = {}) {
    if (ended) return { mode, ready:false };
    if (!value || typeof value !== 'object') return {mode,ready:false,reason:'no-source-frame'};
    refreshMode();
    last = value;
    if (stage) lastStage = stage;
    stage = lastStage;
    ensureView();
    const held=!!sealingFrame&&!inputFrameReady;
    const current = snapshot(held?{...sealingFrame,paused:!!value.paused}:value);
    const unchangedSeal=held&&!terminal&&current.paused===sealingPaused;
    if (container) {
      container.dataset.sourceDesktop = current.phase || 'contained';
      container.style.display = mode === 'native' || !stage || !ready ? 'none' : 'block';
      if (stage) {
        Object.assign(container.style, { left:`${stage.x}px`, top:`${stage.y}px`, width:`${stage.w}px`, height:`${stage.h}px` });
        const scale = globalThis.devicePixelRatio || 1;
        const size = `${stage.w}:${stage.h}:${scale}`;
        if (lastSize !== size) { view?.resize?.(stage.w, stage.h, scale); lastSize = size; }
      }
    }
    // Draw calls share this method with updates. Once the terminal frame has
    // been sent, only a pause/focus transition may supersede it until witnessed.
    // Otherwise a busy native compositor could never drain its newest-frame
    // queue, so the acknowledgement would wait behind an endless render loop.
    if(unchangedSeal)return{mode,ready,reason,placement};
    if(held){if(current.paused!==sealingPaused)sealVisibilityRevision++;sealingPaused=current.paused;}
    if (mode === 'native') void Promise.resolve(director?.updateSourceDesktop?.(current)).catch(() => null);
    else {
      try{view?.update?.(current);}catch{
        ready=false;reason='presentation-unavailable';
        if(container)container.style.display='none';
      }
    }
    return { mode, ready, reason, placement };
  }
  async function begin(value) {
    if (ended) return {mode:'fallback',reason:'scene-ended'};
    if(inputFrameReady){inputFrameReady=false;completion=null;sealGeneration++;sealingFrame=null;sealingPaused=null;}
    if (starting) return starting;
    last = value;
    starting = (async () => {
      const local = ensureView();
      // A model failure is an honest in-window fallback, never an invisible
      // desktop combat surface that could still cost the player a turn.
      try { await local?.ready; } catch { reason = 'presentation-unavailable'; }
      if (ended) return {mode:'fallback',reason:'scene-ended'};
      const report = reason ? null : await director?.beginSourceDesktop?.(snapshot(value));
      if (ended) { await director?.endSourceDesktop?.('scene-ended'); return {mode:'fallback'}; }
      mode = report?.mode === 'native' ? 'native' : 'fallback';
      token = report?.token || token;
      reason = report?.reason || reason;
      placement = report?.placement || null;
      frame(value);
      return {mode,token,reason,placement};
    })().catch(() => { mode = 'fallback'; reason = 'native-unavailable'; return {mode,reason}; });
    return starting;
  }
  async function completeBreach(value) {
    if(ended)return false;
    if(completion)return completion;
    const owner=++sealGeneration;
    const final={...value,phase:'desktop',transition:1,breach:null};
    sealingFrame=final;sealingPaused=!!value.paused;
    completion=(async()=>{
      while(!ended&&owner===sealGeneration){
       // A key-window loss during acknowledgement remains a pause. Resume must
       // witness a fresh unpaused frame, not an acknowledgement of hidden ink.
       while(!inputFocused()&&!ended&&owner===sealGeneration)await afterPaint();
       if(ended||owner!==sealGeneration)return false;
       final.paused=false;sealingPaused=false;
       const visibleRevision=sealVisibilityRevision;
       refreshMode();
       if(mode==='native'){
        let accepted=false;
        if(await bindWitness()){
          try{
            accepted=!!await director?.updateSourceDesktop?.(snapshot(final));
            const revision=director?.sourceDesktopState?.()?.revision;
            accepted=accepted&&Number.isInteger(revision)&&await presented(revision);
          }catch{accepted=false;}
        }
        if(ended||owner!==sealGeneration)return false;
        if(!accepted){
          // A missing final-frame witness restores ordinary contained combat;
          // it must not spend the player's next response under stale pixels.
          await Promise.resolve(director?.endSourceDesktop?.('source-final-frame-unavailable')).catch(()=>null);
          if(ended||owner!==sealGeneration)return false;
          mode='fallback';reason='final-frame-unavailable';
        }
       }
       if(mode!=='native')frame(final,lastStage,{terminal:true});
       await afterPaint();
       if(ended||owner!==sealGeneration)return false;
       if(sealingPaused||!inputFocused()||visibleRevision!==sealVisibilityRevision)continue;
       inputFrameReady=true;
       sealingFrame=null;sealingPaused=null;
       return true;
      }
      return false;
    })();
    return completion;
  }
  async function end(outcome = 'abort') {
    if (ended) return;
    ended = true;
    sealGeneration++;witness?.finish(false);unlisten?.();unlisten=null;
    view?.dispose?.(); view = null;
    container?.remove(); container = null;
    await director?.endSourceDesktop?.(outcome);
  }
  return { frame, begin, completeBreach, end, mode:refreshMode,
    hasFocus:() => typeof hasFocus === 'function' ? hasFocus() : sourceDesktopInputActive(),
    debug:() => ({mode,ready,ended,token,reason,placement,inputFrameReady,lastPresented,renderer:view?.debug?.() || null}) };
}
