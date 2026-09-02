import { isTauriRuntime } from './detect.js';
import {
  MAX_MEDIA_SURFACES,
  WINDOW_MEDIA_PROTOCOL,
  WINDOW_MEDIA_SURFACE_LABELS,
  createPaneScoreEnvelope,
  windowMediaContentId,
} from './window-composition.js';

export const FIREBALL_SURFACE_LABELS=Object.freeze([
  'fireball-cast-1','fireball-cast-2','fireball-cast-3','fireball-cast-4',
]);

const safe=(task)=>Promise.resolve().then(task).catch(()=>null);
const STEP_INTERVAL_MS=33;

// Only the four numbers the native side actually uses to move a window. The
// escalation, the cycle and the reasoning behind them stay on this side.
function nativeChoreography(dance){
  if(!dance)return null;
  const dodge=Math.max(0,Math.min(1,Number(dance.dodge)||0));
  return{
    dodge,
    reach:Math.max(0,Math.min(4,Number(dance.reach)||0)),
    cohesion:Math.max(0,Math.min(1,Number(dance.cohesion)||0)),
    gesture:String(dance.gesture||'rise-drift'),
    formationProgress:Math.max(0,Math.min(1,Number(dance.formationProgress)||0)),
  };
}
const TITLE='Chunk Surfer';
function opaqueCastId(value=''){
  let hash=0x811c9dc5;
  for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return`cast-${hash.toString(16).padStart(8,'0')}`;
}

// THE RAY IS AUTHORED INSIDE THE BATTLE STAGE, NOT THE WINDOW.
//
// `stage` is that band -- a rect in the middle of the combat panel -- as a
// fraction of the game window. Everything the native side is handed has to be
// in window space, or the surface is placed against a rectangle that is not the
// one the comet actually crossed.
function windowSpaceRay(ray,stage){
  const x=Number(stage?.x)||0,y=Number(stage?.y)||0;
  const w=Number(stage?.w)>0?Number(stage.w):1,h=Number(stage?.h)>0?Number(stage.h):1;
  return{
    exit:{x:x+(Number(ray?.exit?.x)||0)*w,y:y+(Number(ray?.exit?.y)||0)*h},
    // A direction is an angle in whatever rectangle it was measured in. Scaling
    // it by the stage's own proportions is what keeps the line straight across
    // the bezel instead of kinking at it.
    direction:{x:(Number(ray?.direction?.x)||0)*w,y:(Number(ray?.direction?.y)||0)*h},
  };
}

function surfaceCastPayload(plan,index,flight=null){
  const ray=plan?.rays?.[index];
  if(!ray)return null;
  const state=String(flight?.state||plan?.state||'outbound');
  return{
    castId:opaqueCastId(plan.castId),
    state:['outbound','deflected','reversed','impact'].includes(state)?state:'outbound',
    reducedMotion:!!plan.reducedMotion,
    // Not the stage crossing -- that is over. This is how long the comet takes
    // to cross one 128-logical-pixel surface at the speed it left the frame, which is
    // also how long the surface stays up.
    travelSeconds:plan.reducedMotion?.26:.62,
    catchReady:!!flight?.catchReady,
    offer:Math.max(1,Math.floor(Number(flight?.offer)||1)),
    damage:Number.isInteger(flight?.damage)?Math.max(0,flight.damage)
      :Number.isInteger(plan.damage)?Math.max(0,plan.damage):null,
    // The surface draws rays[0]; the index rides along only so a click coming
    // back can be matched to the ray that was struck.
    rayCount:1,surfaceIndex:index,rays:[ray],
  };
}

// Retained for the monitor-layout lab and used by native placement tests.
export function substantiallyOnscreenPosition({position,size,monitor,dx=0,dy=0}={}){
  const next={x:Number(position?.x)||0,y:Number(position?.y)||0};
  if(!monitor?.position||!monitor?.size||!size)return{x:next.x+dx,y:next.y+dy};
  const visibleX=Math.round((Number(size.width)||0)*.8),visibleY=Math.round((Number(size.height)||0)*.8);
  return{
    x:Math.max(monitor.position.x-size.width+visibleX,Math.min(monitor.position.x+monitor.size.width-visibleX,next.x+dx)),
    y:Math.max(monitor.position.y-size.height+visibleY,Math.min(monitor.position.y+monitor.size.height-visibleY,next.y+dy)),
  };
}

function token(cryptoApi=globalThis.crypto){
  const raw=cryptoApi?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return`fireball-session-${String(raw).replace(/[^a-z0-9-]/giu,'').slice(0,70)}`;
}

export function createPersonalizedWindowEffects({
  onEmergency=()=>{},onSurfaceReport=()=>{},runtimeApi=null,tokenFactory=token,documentApi=globalThis.document,
  wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms)),
}={}){
  let api=runtimeApi;
  let current=null;
  const surfaces=new Map();
  const mediaSurfaces=new Map();
  const snapshots=new Map();
  const hideTimers=new Map();
  const mediaReadyLabels=new Set();
  const mediaReadyWaiters=new Map();
  const mediaAcceptedWaiters=new Map();
  let mediaRevisionCounter=0;
  let hitsBound=false;
  let paneActionsBound=false;
  let mediaEventsBound=false;

  const target=()=>documentApi?.defaultView||globalThis.window||null;
  function dispatch(event,detail){
    const CustomEventCtor=target()?.CustomEvent||globalThis.CustomEvent;
    if(CustomEventCtor)target()?.dispatchEvent?.(new CustomEventCtor(event,{detail}));
  }

  function resolveWaiters(waiters,key,payload){
    const pending=waiters.get(key);if(!pending)return;
    waiters.delete(key);for(const resolve of pending)resolve(payload);
  }
  function waitForMediaSignal(waiters,key,timeoutMs){
    return new Promise((resolve)=>{
      const timer=setTimeout(()=>{const pending=waiters.get(key);pending?.delete(done);if(!pending?.size)waiters.delete(key);resolve(null);},timeoutMs);
      const done=(payload)=>{clearTimeout(timer);resolve(payload);};
      const pending=waiters.get(key)||new Set();pending.add(done);waiters.set(key,pending);
    });
  }
  function waitForMediaReady(label,timeoutMs=1200){
    if(mediaReadyLabels.has(label))return Promise.resolve({label,protocol:WINDOW_MEDIA_PROTOCOL});
    return waitForMediaSignal(mediaReadyWaiters,label,timeoutMs);
  }
  const acceptanceKey=(sessionToken,revision,label)=>`${sessionToken}:${revision}:${label}`;

  // A struck surface reports back, and the keyboard goes home with the report.
  // The payload is matched against the live plan here rather than trusted: the
  // surfaces are handed an opaque cast id precisely so nothing that comes back
  // from one can name a cast the fight is not currently running.
  async function listenForHits(){
    if(hitsBound||!api?.listen)return;
    hitsBound=true;
    await safe(()=>api.listen('fireball-cast-hit',({payload})=>{
      // The keyboard goes home first and unconditionally. Whether the click
      // caught a comet is a separate question from where typing should land,
      // and getting that order wrong strands the player in a window that is
      // 128 logical pixels of fireball and nothing else.
      if(api?.invoke)void safe(()=>api.invoke('chunk_fireball_cast_focus_main'));
      const session=current,plan=session?.activePlan;
      if(!session||!plan)return;
      const index=Math.floor(Number(payload?.surfaceIndex));
      if(!(index>=0&&index<plan.rayCount&&index<FIREBALL_SURFACE_LABELS.length))return;
      if(String(payload?.castId||'')!==opaqueCastId(plan.castId))return;
      const ray=plan.rays[index];
      dispatch('chunk-surfer:fireball-hit',{castId:plan.castId,rayId:ray?.id||null});
    }));
  }

  async function listenForPaneActions(){
    if(paneActionsBound||!api?.listen)return;
    paneActionsBound=true;
    await safe(()=>api.listen('window-choreography-pane-action',({payload})=>{
      const session=current;
      if(!session||String(payload?.cueId||'')!==String(session.activePaneCue||''))return;
      if(api?.invoke)void safe(()=>api.invoke('chunk_fireball_cast_focus_main'));
      dispatch('chunk-surfer:window-pane-action',{
        cueId:String(payload?.cueId||''),paneId:String(payload?.paneId||''),action:String(payload?.action||'enter'),
      });
    }));
  }

  async function listenForMediaEvents(){
    if(mediaEventsBound||!api?.listen)return;
    mediaEventsBound=true;
    await safe(()=>api.listen('window-media-ready',({payload})=>{
      const label=String(payload?.label||'');
      if(Number(payload?.protocol)!==WINDOW_MEDIA_PROTOCOL||!WINDOW_MEDIA_SURFACE_LABELS.includes(label))return;
      mediaReadyLabels.add(label);resolveWaiters(mediaReadyWaiters,label,payload);
    }));
    await safe(()=>api.listen('window-media-accepted',({payload})=>{
      const label=String(payload?.label||''),targetLabel=String(payload?.targetLabel||'');
      if(Number(payload?.protocol)!==WINDOW_MEDIA_PROTOCOL||label!==targetLabel||!WINDOW_MEDIA_SURFACE_LABELS.includes(label))return;
      resolveWaiters(mediaAcceptedWaiters,acceptanceKey(String(payload?.sessionToken||''),Number(payload?.revision),label),payload);
    }));
    await safe(()=>api.listen('window-media-drag-ended',async({payload})=>{
      const session=current,composition=session?.activeComposition;
      if(!session||!composition||String(payload?.cueId||'')!==String(composition.cueId||''))return;
      const surface=composition.surfaces.find((entry)=>entry.id===String(payload?.paneId||''));
      const label=String(payload?.label||'');
      if(!surface||WINDOW_MEDIA_SURFACE_LABELS[surface.index]!==label)return;
      session.manualMediaPanes.add(surface.id);
      const placement=await safe(()=>api.invoke('chunk_window_media_position',{label}));
      if(!placement)return;
      await safe(()=>api.emitTo(label,'window-media-origin',{cueId:composition.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
      dispatch('chunk-surfer:window-media-moved',{cueId:composition.cueId,paneId:surface.id,label,placement});
      void safe(()=>api.invoke('chunk_fireball_cast_focus_main'));
    }));
    await safe(()=>api.listen('window-media-pane-action',({payload})=>{
      const composition=current?.activeComposition;
      if(!composition||String(payload?.cueId||'')!==String(composition.cueId||''))return;
      if(api?.invoke)void safe(()=>api.invoke('chunk_fireball_cast_focus_main'));
      dispatch('chunk-surfer:window-media-action',{cueId:composition.cueId,paneId:String(payload?.paneId||''),action:String(payload?.action||'')});
    }));
    await safe(()=>api.listen('window-media-focus-left',()=>{
      // The main window's blur catches main -> pane. This catches pane -> some
      // unrelated application, when the main window is already blurred and
      // therefore cannot emit another event of its own.
      setTimeout(()=>{if(api?.invoke)void safe(()=>api.invoke('chunk_window_media_hide_if_unfocused'));},90);
    }));
    await safe(()=>api.listen('window-media-score-action',async({payload})=>{
      const session=current,composition=session?.activeComposition,label=String(payload?.targetLabel||'');
      if(!session||!composition||Number(payload?.protocol)!==WINDOW_MEDIA_PROTOCOL)return;
      const surface=composition.surfaces.find((entry)=>entry.id===String(payload?.paneId||''));
      if(!surface||WINDOW_MEDIA_SURFACE_LABELS[surface.index]!==label)return;
      if(String(payload?.sessionToken||'')!==session.token||String(payload?.cueId||'')!==composition.cueId)return;
      if(Number(payload?.revision)!==Number(session.mediaRevisions.get(label)))return;
      const action=payload?.action||{},window=mediaSurfaces.get(label);
      if(action.type==='visible'){
        if(action.visible)await safe(()=>window?.show?.());else await safe(()=>window?.hide?.());
        return;
      }
      if(action.type!=='geometry'||(session.manualMediaPanes.has(surface.id)&&!action.geometry?.force))return;
      const placement=await safe(()=>api.invoke('chunk_window_media_place',{request:{
        label,index:surface.index,x:Number(action.geometry?.anchorX),y:Number(action.geometry?.anchorY),
        offsetX:Number(action.geometry?.offsetX)||0,offsetY:Number(action.geometry?.offsetY)||0,
        width:surface.width,height:surface.height,recoverable:24,durationMs:Math.max(0,Math.min(300,Number(action.durationMs)||0)),
        interactive:!!surface.draggable,
      }}));
      if(placement?.shown){
        await safe(()=>api.emitTo(label,'window-media-origin',{cueId:composition.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
        dispatch('chunk-surfer:window-media-moved',{cueId:composition.cueId,paneId:surface.id,label,placement});
      }
    }));
  }

  async function loadApi(){
    if(api)return api;
    if(!isTauriRuntime())return null;
    try{
      const windowApi=await import('@tauri-apps/api/window');
      const webviewApi=await import('@tauri-apps/api/webviewWindow');
      const eventApi=await import('@tauri-apps/api/event');
      const coreApi=await import('@tauri-apps/api/core');
      api={...windowApi,...webviewApi,...eventApi,...coreApi};
    }catch(_){api=null;}
    return api;
  }

  // Native creation reports failure as an EVENT, not a rejection, and the
  // constructor hands back a usable-looking object either way. Whatever
  // `tauri://error` says is the only description of why a surface does not
  // exist, so it is kept rather than being collapsed into "not ready".
  async function ready(webview){
    return new Promise((resolve)=>{
      let settled=false;
      const done=(reason)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(reason||null);};
      const timer=setTimeout(()=>done('timeout'),1800);
      void Promise.resolve(webview.once?.('tauri://created',()=>done(null))).catch(()=>done('listen-failed'));
      void Promise.resolve(webview.once?.('tauri://error',(event)=>done(String(event?.payload||'create-failed')))).catch(()=>done('listen-failed'));
    });
  }

  async function prewarmSurface(label,index,session){
    if(!api?.WebviewWindow||current!==session)return null;
    let surface=await api.WebviewWindow.getByLabel(label);
    if(!surface){
      const size=128;
      // No max size: the comet grows a little as it closes. `focusable` has to
      // be TRUE -- a window macOS will not make key does not reliably get a
      // mouseDown either, and a fireball you cannot click is the one thing this
      // whole surface exists to avoid. Focus is handed straight back on the
      // click instead (chunk_fireball_cast_focus_main), which is a frame of
      // borrowed focus rather than a projectile that ignores the pointer.
      surface=new api.WebviewWindow(label,{
        url:'fireball-cast.html',title:TITLE,
        width:size,height:size,minWidth:64,minHeight:64,
        resizable:false,decorations:false,transparent:false,visible:false,focus:false,focusable:true,
        alwaysOnTop:true,skipTaskbar:true,shadow:false,
      });
      const failure=await ready(surface);
      // The constructor object exists even if native creation failed. Resolve
      // the registered label again so a failed surface cannot mark the whole
      // fixed pool ready and then make placement fail invisibly.
      surface=await api.WebviewWindow.getByLabel(label);
      if(!surface){session.prewarmReasons.push(`${label}:${failure||'not-registered'}`);return null;}
    }
    if(current!==session){await safe(()=>surface.close());return null;}
    surfaces.set(label,surface);
    await safe(()=>surface.hide());
    return surface;
  }

  async function prewarmMediaSurface(label,index,session){
    if(!api?.WebviewWindow||current!==session)return null;
    let surface=await api.WebviewWindow.getByLabel(label);
    const mainWasFocused=!surface&&await safe(()=>api.getCurrentWindow?.()?.isFocused?.())===true;
    if(!surface){
      surface=new api.WebviewWindow(label,{
        url:'window-media.html',title:TITLE,width:240,height:160,minWidth:160,minHeight:96,maxWidth:320,maxHeight:320,
        resizable:false,decorations:false,transparent:false,visible:false,focus:false,focusable:false,
        alwaysOnTop:true,skipTaskbar:true,shadow:false,
      });
      const failure=await ready(surface);
      surface=await api.WebviewWindow.getByLabel(label);
      if(!surface){session.mediaPrewarmReasons.push(`${label}:${failure||'not-registered'}`);return null;}
    }
    if(current!==session){await safe(()=>surface.close());return null;}
    mediaSurfaces.set(label,surface);await safe(()=>surface.hide());
    // Creation already asks for a passive window, but macOS can briefly make a
    // fresh webview key. Restore only when the game owned focus beforehand;
    // never activate it over another application just because we prewarmed.
    if(mainWasFocused)await safe(()=>api.invoke?.('chunk_fireball_cast_focus_main'));
    await safe(()=>api.emitTo(label,'window-media-probe',{protocol:WINDOW_MEDIA_PROTOCOL,targetLabel:label}));
    const readySignal=await waitForMediaReady(label);
    if(!readySignal){session.mediaPrewarmReasons.push(`${label}:script-not-ready`);mediaSurfaces.delete(label);return null;}
    return surface;
  }

  // ONE SURFACE FAILING USED TO TAKE THE WHOLE FEATURE DOWN, IN SILENCE.
  //
  // Every step in here can reject on a desktop build — a denied ACL call, a
  // page the bundle does not contain, a create that never answers — and every
  // one of them was unguarded inside a Promise.all whose rejection was then
  // swallowed by `.catch(() => null)` at the only call site. The session was
  // left at `prewarmState:'pending'` with `surfacesReady:false` for the rest of
  // the battle, so `showNative` declined every cast and no external window ever
  // appeared, while the in-canvas trails carried on exactly as before. There
  // was nothing anywhere to read that said so.
  //
  // Now: nothing here throws, the reason is kept and reported, and surfaces
  // which did build are closed rather than orphaned so the next battle's
  // prewarm starts from a clean pool.
  async function prewarmAll(session){
    if(!await loadApi()||current!==session){
      if(current===session){session.prewarmState='unavailable';session.prewarmReasons.push('no-runtime');}
      return false;
    }
    await listenForHits();
    await listenForPaneActions();
    const made=await Promise.all(FIREBALL_SURFACE_LABELS.map((label,index)=>(
      Promise.resolve()
        .then(()=>prewarmSurface(label,index,session))
        .catch((error)=>{session.prewarmReasons.push(`${label}:${String(error?.message||error)}`);return null;})
    )));
    if(current!==session)return false;
    session.readySurfaces=made.filter(Boolean).length;
    session.surfacesReady=session.readySurfaces>0;
    session.prewarmState=session.readySurfaces===FIREBALL_SURFACE_LABELS.length?'ready'
      :session.readySurfaces?'partial':'unavailable';
    // Reported on every terminal outcome, success included. "No line at all"
    // then means the session was never begun — the module is off, or the game
    // is fullscreen — which is a different answer from "the surfaces failed",
    // and the two were previously indistinguishable from outside.
    onSurfaceReport({
      state:session.prewarmState,ready:session.readySurfaces,reasons:[...session.prewarmReasons],
      intensity:session.intensity,fullscreen:session.fullscreen,
    });
    // Combat never waits for this, and it does not need to: the next frame's
    // sync draws whatever is in the air by then.
    return session.surfacesReady;
  }

  function begin({intensity='standard',fullscreen=false,reducedMotion=false}={}){
    const session={
      token:tokenFactory(),intensity,fullscreen:!!fullscreen,reducedMotion:!!reducedMotion,
      surfacesReady:false,readySurfaces:0,activePlan:null,prewarmState:'pending',
      prewarmReasons:[],placementAttempts:0,placementFailures:0,lastStepAt:0,
      // What each surface was last told it was drawing, so the payload is only
      // re-sent when a comet's own state changes rather than every frame.
      rayStates:new Map(),
      mediaPrewarm:null,mediaReady:0,mediaPrewarmReasons:[],activeComposition:null,compositionQuiesced:false,
      mediaRevisions:new Map(),manualMediaPanes:new Set(),
    };
    current=session;
    // Arrival starts construction, but no combat beat ever awaits it or creates a
    // missing surface. Until all four exist the complete cast stays in-canvas.
    session.prewarm=prewarmAll(session);
    return session.token;
  }

  function ensure(options={}){return current?.token||begin(options);}

  function prepareFireballs(){return current?.prewarm||Promise.resolve(false);}

  async function prepareMedia({count=MAX_MEDIA_SURFACES}={}){
    const session=current||begin({intensity:'standard'});
    if(session.mediaReady>=Math.min(MAX_MEDIA_SURFACES,count))return true;
    if(session.mediaPrewarm)return session.mediaPrewarm;
    session.mediaPrewarm=(async()=>{
      if(!await loadApi()||current!==session)return false;
      await listenForMediaEvents();
      const wanted=Math.max(1,Math.min(MAX_MEDIA_SURFACES,Math.floor(Number(count)||MAX_MEDIA_SURFACES)));
      const made=await Promise.all(WINDOW_MEDIA_SURFACE_LABELS.slice(0,wanted).map((label,index)=>prewarmMediaSurface(label,index,session).catch((error)=>{
        session.mediaPrewarmReasons.push(`${label}:${String(error?.message||error)}`);return null;
      })));
      if(current!==session)return false;
      session.mediaReady=Math.max(session.mediaReady,made.filter(Boolean).length);
      return session.mediaReady>=wanted;
    })().finally(()=>{if(current===session)session.mediaPrewarm=null;});
    return session.mediaPrewarm;
  }

  function captureSnapshot(){
    // #map IS A DIV, AND HAS BEEN THE WHOLE TIME.
    //
    // This asked for '#map' first and fell back to 'canvas' only when #map was
    // absent — but #map is the container the renderer inserts its canvas INTO
    // (r3d.js mounts into mapEl), so the selector always matched the div, the
    // `toDataURL` guard below always failed, and this always returned null.
    // Every death composition since has been handed 'snapshot-unavailable' and
    // shown four panes of nothing where the player's last frame should be.
    //
    // Ask for a canvas, and ask #map for ITS canvas rather than for itself.
    // The r3d context is created with preserveDrawingBuffer:true, so reading it
    // outside the frame that drew it is sound.
    const source=documentApi?.querySelector?.('#map canvas')
      ||documentApi?.querySelector?.('canvas');
    if(!source?.toDataURL)return null;
    try{
      const out=documentApi.createElement('canvas'),aspect=(Number(source.width)||16)/(Number(source.height)||9);
      out.width=480;out.height=Math.max(180,Math.round(out.width/aspect));
      out.getContext('2d',{alpha:false})?.drawImage(source,0,0,out.width,out.height);
      const id=`snapshot-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      snapshots.set(id,out.toDataURL('image/webp',.74));
      while(snapshots.size>4)snapshots.delete(snapshots.keys().next().value);
      return id;
    }catch(_){return null;}
  }
  function snapshotData(id){return snapshots.get(String(id||''))||null;}

  async function assignMediaScore(session,plan,pane,label){
    const revision=++mediaRevisionCounter;
    session.mediaRevisions.set(label,revision);
    const snapshotToken=pane.content.kind==='snapshot'?pane.content.token:null;
    const envelope={...createPaneScoreEnvelope(plan,pane.id,{
      targetLabel:label,sessionToken:session.token,revision,
      snapshotData:snapshotToken?snapshots.get(snapshotToken)||null:null,
    }),desktopOrigin:{x:0,y:0}};
    const key=acceptanceKey(session.token,revision,label),accepted=waitForMediaSignal(mediaAcceptedWaiters,key,320);
    await safe(()=>api.emitTo(label,'window-media-score',envelope));
    const acknowledgement=await accepted;
    const expectedContent=windowMediaContentId(envelope.score.initial);
    if(!acknowledgement||acknowledgement.contentId!==expectedContent||acknowledgement.paneId!==pane.id){
      session.mediaPrewarmReasons.push(`${label}:assignment-not-acknowledged`);return false;
    }
    return true;
  }

  async function quiesceComposition() {
    const session=current,plan=session?.activeComposition;
    if(!session||!plan)return false;
    session.compositionGeneration=(session.compositionGeneration||0)+1;
    session.compositionQuiesced=true;
    const results=await Promise.all(plan.surfaces.map((pane)=>{
      const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index],revision=session.mediaRevisions.get(label);
      if(!revision)return Promise.resolve(null);
      return safe(()=>api?.emitTo?.(label,'window-media-score-hold',{
        protocol:WINDOW_MEDIA_PROTOCOL,targetLabel:label,sessionToken:session.token,revision,
        cueId:plan.cueId,paneId:pane.id,
      }));
    }));
    return results.length===plan.surfaces.length;
  }

  async function showComposition(plan,{token:expected=null,mode='cold',handoffDurationMs=260}={}){
    const session=current||begin({intensity:'standard'});
    if(expected&&expected!==session.token)return false;
    if(!await prepareMedia({count:plan?.surfaces?.length||1})||current!==session)return false;

    const handoff=mode==='handoff'&&!!session.activeComposition;
    const previous=handoff?session.activeComposition:null;
    const previousByIndex=new Map((previous?.surfaces||[]).map((pane)=>[pane.index,pane]));
    const previousLabels=new Set((previous?.surfaces||[]).map((pane)=>WINDOW_MEDIA_SURFACE_LABELS[pane.index]));
    const generation=(session.compositionGeneration||0)+1;
    session.compositionGeneration=generation;
    session.compositionCoherent=false;
    session.manualMediaPanes.clear();
    const ordered=[...plan.surfaces].sort((a,b)=>a.z-b.z||a.index-b.index);

    if(!handoff){
      session.activeComposition=plan;
      session.compositionQuiesced=false;
      for(let index=plan.surfaces.length;index<MAX_MEDIA_SURFACES;index+=1){
        const window=mediaSurfaces.get(WINDOW_MEDIA_SURFACE_LABELS[index]);
        if(window)await safe(()=>window.hide());
      }
    }

    const assigned=await Promise.all(ordered.map((pane)=>{
      const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
      return mediaSurfaces.get(label)?assignMediaScore(session,plan,pane,label):Promise.resolve(false);
    }));
    if(assigned.some((value)=>!value)||current!==session||session.compositionGeneration!==generation){
      if(handoff&&current===session&&session.compositionGeneration===generation){
        // Best-effort rollback: restore the old score to every physical label
        // that had one. Newly introduced labels are hidden individually. A
        // title takeover failure must never flush the entire desktop.
        await Promise.all(ordered.map(async(pane,index)=>{
          if(!assigned[index])return;
          const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index],oldPane=previousByIndex.get(pane.index);
          if(oldPane)await assignMediaScore(session,previous,oldPane,label);
          else await safe(()=>mediaSurfaces.get(label)?.hide?.());
        }));
        session.activeComposition=previous;
        session.compositionQuiesced=!!previous;
        if(previous)await quiesceComposition();
      }else if(current===session&&session.compositionGeneration===generation){
        await hideComposition({releaseSnapshots:false});
      }
      return false;
    }

    // A cold composition enters at its authored entry point. A handoff leaves
    // surviving native windows where the OS already has them and moves them
    // directly to the title geometry; there is no teleport-to-entry frame.
    if(!handoff){
      const placed=await Promise.all(ordered.map(async(pane)=>{
        const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
        const placement=await safe(()=>api.invoke('chunk_window_media_place',{request:{
          label,index:pane.index,x:Number(pane.entry.x),y:Number(pane.entry.y),offsetX:0,offsetY:0,
          width:Number(pane.width),height:Number(pane.height),recoverable:24,durationMs:0,interactive:!!pane.draggable,
        }}));
        if(!placement?.shown)return false;
        await safe(()=>api.emitTo(label,'window-media-origin',{cueId:plan.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
        dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:pane.id,label,placement});return true;
      }));
      if(placed.some((value)=>!value)){
        if(current===session&&session.compositionGeneration===generation)await hideComposition({releaseSnapshots:false});
        return false;
      }
    }else{
      // Newly introduced labels still need an entry point. Existing labels are
      // deliberately untouched until the formation move below.
      const newcomers=ordered.filter((pane)=>!previousLabels.has(WINDOW_MEDIA_SURFACE_LABELS[pane.index]));
      const placed=await Promise.all(newcomers.map(async(pane)=>{
        const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
        const placement=await safe(()=>api.invoke('chunk_window_media_place',{request:{
          label,index:pane.index,x:Number(pane.entry.x),y:Number(pane.entry.y),offsetX:0,offsetY:0,
          width:Number(pane.width),height:Number(pane.height),recoverable:24,durationMs:0,interactive:!!pane.draggable,
        }}));
        if(!placement?.shown)return false;
        await safe(()=>api.emitTo(label,'window-media-origin',{cueId:plan.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
        dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:pane.id,label,placement});return true;
      }));
      if(placed.some((value)=>!value))return false;
    }

    session.activeComposition=plan;
    session.compositionQuiesced=false;
    const formation=plan.formation||{};
    if(!handoff&&formation.delayMs)await wait(formation.delayMs);
    await Promise.all(ordered.map(async(pane,order)=>{
      if(!handoff&&formation.staggerMs)await wait(order*formation.staggerMs);
      if(current!==session||session.compositionGeneration!==generation||session.activeComposition?.cueId!==plan.cueId)return;
      const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
      const duration=handoff
        ?Math.max(0,Math.min(600,Math.round(Number(handoffDurationMs)||0)))
        :Number(formation.durationMs)||0;
      const placement=await safe(()=>api.invoke('chunk_window_media_place',{request:{
        label,index:pane.index,x:Number(pane.initial.x),y:Number(pane.initial.y),offsetX:0,offsetY:0,
        width:Number(pane.width),height:Number(pane.height),recoverable:24,durationMs:duration,
        interactive:!!pane.draggable,
      }}));
      if(!placement?.shown)return;
      await safe(()=>api.emitTo(label,'window-media-origin',{cueId:plan.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
      dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:pane.id,label,placement});
    }));

    if(handoff&&current===session&&session.compositionGeneration===generation){
      const nextLabels=new Set(plan.surfaces.map((pane)=>WINDOW_MEDIA_SURFACE_LABELS[pane.index]));
      for(const label of previousLabels){
        if(nextLabels.has(label))continue;
        await safe(()=>mediaSurfaces.get(label)?.hide?.());
      }
    }
    return current===session&&session.compositionGeneration===generation;
  }

  async function snapComposition(plan,{freeze=false,coherent=false,durationMs=120}={}){
    const session=current;if(!session||session.activeComposition?.cueId!==plan?.cueId)return false;
    await Promise.all(plan.surfaces.map(async(pane)=>{
      if(!pane.target)return;const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
      const placement=await safe(()=>api.invoke('chunk_window_media_place',{request:{
        label,index:pane.index,x:pane.target.anchorX,y:pane.target.anchorY,
        offsetX:pane.target.offsetX,offsetY:pane.target.offsetY,width:pane.width,height:pane.height,
        recoverable:24,durationMs:Math.max(0,Math.min(600,Math.round(Number(durationMs)||0))),interactive:!!pane.draggable,
      }}));
      if(placement?.shown){
        await safe(()=>api.emitTo(label,'window-media-origin',{cueId:plan.cueId,desktopOrigin:placement.origin||{x:0,y:0}}));
        dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:pane.id,label,placement});
      }
    }));
    if(coherent)await setCompositionCoherence(plan,true);
    if(freeze)await freezeComposition(plan.cueId,true);
    return true;
  }

  async function freezeComposition(cueId,frozen=true){
    await Promise.all(WINDOW_MEDIA_SURFACE_LABELS.map((label)=>safe(()=>api?.emitTo?.(label,'window-media-freeze',{cueId,frozen:!!frozen}))));return true;
  }

  async function setCompositionCoherence(plan,coherent=true){
    const session=current;if(!session||session.activeComposition?.cueId!==plan?.cueId)return false;
    session.compositionCoherent=!!coherent;
    for(const pane of plan.surfaces){
      const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index];
      await safe(()=>api?.emitTo?.(label,'window-media-coherence',{cueId:plan.cueId,coherent:!!coherent}));
    }
    return true;
  }

  async function triggerComposition(plan,eventName,{effectiveAtMs=Date.now()+64}={}){
    const session=current;
    if(!session||session.activeComposition?.cueId!==plan?.cueId)return false;
    const event=String(eventName||'').replace(/[^a-z0-9:_-]/giu,'-').slice(0,96);
    if(!event||!plan.score?.cues?.some((cue)=>cue.event===event))return false;
    const results=await Promise.all(plan.surfaces.map((pane)=>{
      const label=WINDOW_MEDIA_SURFACE_LABELS[pane.index],revision=session.mediaRevisions.get(label);
      if(!revision)return Promise.resolve(null);
      return safe(()=>api.emitTo(label,'window-media-trigger',{
        protocol:WINDOW_MEDIA_PROTOCOL,targetLabel:label,sessionToken:session.token,revision,
        cueId:plan.cueId,paneId:pane.id,event,effectiveAtMs:Math.max(Date.now(),Number(effectiveAtMs)||Date.now()),
      }));
    }));
    return results.length===plan.surfaces.length;
  }

  async function hideComposition({releaseSnapshots=true}={}){
    const session=current;if(session){session.activeComposition=null;session.compositionQuiesced=false;session.compositionGeneration=(session.compositionGeneration||0)+1;session.mediaRevisions.clear();session.manualMediaPanes.clear();}
    await Promise.all([...mediaSurfaces.values()].map((surface)=>safe(()=>surface.hide())));
    if(api?.invoke)await safe(()=>api.invoke('chunk_window_media_hide_all'));
    if(api?.invoke)await safe(()=>api.invoke('chunk_fireball_cast_focus_main'));
    if(releaseSnapshots)snapshots.clear();
    return true;
  }

  // ONE FRAME OF THE VOLLEY, AS IT ACTUALLY IS.
  //
  // Opening a surface, moving it and closing it used to be three entry points
  // driven by three different events, which is workable only while every comet
  // in a cast shares one flight. They do not: they leave a beat apart, they are
  // struck one at a time, and hitting one must leave the others exactly where
  // they were. So there is one statement instead -- here is every comet that is
  // outside the game right now and where each of them is -- and anything not in
  // it is not out there.
  function syncFireballCast(plan,rays,{token:expected=null,choreography=null}={}){
    const session=current;
    if(!session||(expected&&expected!==session.token))return false;
    if(!session.surfacesReady)return false;
    const live=Array.isArray(rays)?rays.filter((ray)=>Number.isInteger(Number(ray?.index))):[];
    const shown=new Set();
    if(plan&&live.length){
      // A cast is whole or it is in-canvas: some of a volley outside the frame
      // and the rest of it unaccounted for is a lie about where they went.
      if(plan.rayCount<=session.readySurfaces){
        const at=Date.now();
        const settling=live.some((ray)=>ray.state!=='outbound');
        const casts=[];
        for(const ray of live){
          const index=Math.max(0,Math.min(3,Math.floor(Number(ray.index)||0)));
          const label=FIREBALL_SURFACE_LABELS[index];
          if(!surfaces.get(label))continue;
          shown.add(label);
          const payload=surfaceCastPayload(plan,index,ray);
          if(!payload)continue;
          casts.push({
            label,index,count:plan.rayCount,
            ray:windowSpaceRay(plan.rays[index],plan.stage),
            progress:Math.max(0,Math.min(1,Number(ray.progress)||0)),
          });
          // The drawing payload only changes when the comet's own state does.
          // Position is the frequent thing and it goes through the batched step.
          const payloadKey=`${payload.state}:${payload.catchReady?1:0}:${payload.offer}`;
          if(session.rayStates.get(label)!==payloadKey){
            session.rayStates.set(label,payloadKey);
            void safe(()=>api.emitTo(label,'fireball-cast',payload));
          }
        }
        // Movement is throttled; a comet that has just been hit or has just
        // landed is not, because that frame is the whole point of it. A shoal
        // that is actively breaking is not throttled either -- a dodge sampled
        // at 30Hz reads as a stutter rather than a swerve.
        const darting=Number(choreography?.dodge)>.02;
        if(darting)session.lastStepAt=0;
        if(casts.length&&(settling||at-session.lastStepAt>=STEP_INTERVAL_MS)){
          session.lastStepAt=at;
          session.placementAttempts+=1;
          void safe(()=>api.invoke('chunk_fireball_cast_step',{casts,choreography:nativeChoreography(choreography)})).then((moved)=>{
            if(!Number(moved))session.placementFailures+=1;
          });
        }
      }
    }
    for(const label of FIREBALL_SURFACE_LABELS){
      if(shown.has(label))continue;
      if(!session.rayStates.has(label))continue;
      session.rayStates.delete(label);
      const surface=surfaces.get(label);
      if(surface)void safe(()=>surface.hide());
    }
    return !live.length||shown.size===live.length;
  }

  function beginFireballCast(plan,{token:expected=null}={}){
    const session=current;
    if(!session||!plan||(expected&&expected!==session.token))return false;
    session.activePlan=plan;
    dispatch('chunk-surfer:fireball-cast',plan);
    // Nothing opens here. A cast that has just left the Surfer's hand is
    // entirely inside the frame; syncFireballCast is what says otherwise.
    return true;
  }

  async function showPanes(panes,{token:expected=null,cueId=''}={}){
    const session=current;
    if(!session||(expected&&expected!==session.token)||!session.surfacesReady)return false;
    const authored=Array.isArray(panes)?panes.slice(0,FIREBALL_SURFACE_LABELS.length):[];
    if(authored.length>session.readySurfaces)return false;
    session.activePaneCue=String(cueId||'');
    session.activePlan=null;
    session.rayStates.clear();
    let shown=0;
    for(let index=0;index<FIREBALL_SURFACE_LABELS.length;index+=1){
      const label=FIREBALL_SURFACE_LABELS[index],surface=surfaces.get(label),pane=authored[index];
      if(!surface)continue;
      if(!pane){await safe(()=>surface.hide());continue;}
      await safe(()=>api.emitTo(label,'window-choreography-pane',{
        cueId:session.activePaneCue,paneId:String(pane.id||''),mode:String(pane.mode||'fragment'),
        title:String(pane.title||''),text:String(pane.text||''),palette:String(pane.palette||'black'),
        interactive:!!pane.interactive,
      }));
      const placed=await safe(()=>api.invoke('chunk_window_surface_place',{request:{
        label,index,x:Number(pane.x)||.5,y:Number(pane.y)||.5,size:Number(pane.size)||128,interactive:!!pane.interactive,
      }}));
      if(placed)shown+=1;
    }
    return shown===authored.length;
  }

  async function hidePanes(){
    const session=current;
    if(session)session.activePaneCue='';
    await Promise.all([...surfaces.values()].map((surface)=>safe(()=>surface.hide())));
    if(api?.invoke)await safe(()=>api.invoke('chunk_fireball_cast_hide_all'));
    return true;
  }

  // Narrative interference remains in the main HUD. These calls intentionally
  // create no captioned sidecar, overlay, focus change or geometry animation.
  function apply(kind,payload={}){dispatch('chunk-surfer:interference-line',{kind,...payload});return true;}
  function reject(payload={}){dispatch('chunk-surfer:interference-line',{kind:'reject',...payload});return true;}
  function arrangeMovement(profile,payload={}){return prepareFireballs(profile,payload);}

  function clearTimers(){
    for(const timer of hideTimers.values())clearTimeout(timer);
    hideTimers.clear();
  }

  async function closeSurfaces(){
    clearTimers();
    const open=[...surfaces.values()];surfaces.clear();
    await Promise.all(open.map((surface)=>safe(()=>surface.close())));
    const media=[...mediaSurfaces.values()];mediaSurfaces.clear();
    await Promise.all(media.map((surface)=>safe(()=>surface.close())));
    mediaReadyLabels.clear();mediaReadyWaiters.clear();mediaAcceptedWaiters.clear();snapshots.clear();
  }

  // A PAUSED FIGHT HAS A COMET FROZEN IN MID-AIR. IT MAY NOT BE FROZEN ON TOP
  // OF THE PAUSE MENU.
  //
  // The flight runs on the game clock, so pausing correctly stops it moving --
  // which left a stationary window hanging over the paused game until something
  // resumed. Hidden, not ended: the session survives, and the next step of the
  // exchange's clock puts it back exactly where it stopped.
  function suspendSurfaces(){
    const session=current;
    if(!session)return false;
    clearTimers();
    session.rayStates.clear();
    for(const surface of surfaces.values())void safe(()=>surface.hide());
    return true;
  }

  // ENDING A FIGHT PUTS THE SURFACES AWAY. IT DOES NOT DESTROY THEM.
  //
  // This used to close all four, and the next battle's prewarm immediately
  // rebuilt them under the same four labels -- a race Tauri loses in both
  // directions. `getByLabel` can still answer with a window that is on its way
  // out, and constructing one whose label is not yet released fails outright.
  // Either way the pool came back broken and no cast reached a surface again
  // for the rest of the process, which is exactly what "it stops working after
  // I go back to the menu" looks like from a chair.
  //
  // They are hidden, empty, click-through-when-idle windows. Keeping them costs
  // nothing and makes every prewarm after the first instant. Only turning the
  // module off actually destroys them.
  async function end(expected=null){
    const session=current;
    const required=typeof expected==='string'?expected:null;
    if(!session||(required&&required!==session.token))return false;
    current=null;
    clearTimers();
    await Promise.all([...surfaces.values()].map((surface)=>safe(()=>surface.hide())));
    if(api?.invoke)await safe(()=>api.invoke('chunk_fireball_cast_hide_all'));
    return true;
  }

  async function emergencyRestore({notify=true}={}){
    current=null;
    await closeSurfaces();
    if(api?.invoke)await safe(()=>api.invoke('chunk_fireball_cast_hide_all'));
    if(api?.invoke)await safe(()=>api.invoke('chunk_window_media_hide_all'));
    if(notify)onEmergency();
    return true;
  }

  async function previewChannel(plan,payload={}){
    const sessionToken=begin({intensity:payload.intensity||'standard',fullscreen:!!payload.forceInternal,reducedMotion:!!payload.reducedMotion});
    try{
      await current?.prewarm;
      // A preview shows the part that happens outside the frame, so it flies the
      // approach directly rather than waiting out a stage crossing that has no
      // stage. Closing in the same microtask made the settings and god-menu
      // previews look exactly like a failed prewarm.
      beginFireballCast(plan,{token:sessionToken});
      const steps=plan?.reducedMotion?6:14;
      for(let step=0;step<=steps;step+=1){
        syncFireballCast(plan,plan.rays.map((_,index)=>({index,state:'outbound',progress:step/steps})),{token:sessionToken});
        await wait(plan?.reducedMotion?60:56);
      }
      syncFireballCast(plan,plan.rays.map((_,index)=>({index,state:'impact',damage:null})),{token:sessionToken});
      await wait(240);
      return plan;
    }
    finally{await end(sessionToken);}
  }

  target()?.addEventListener?.('blur',()=>{
    setTimeout(()=>{if(api?.invoke)void safe(()=>api.invoke('chunk_window_media_hide_if_unfocused'));},90);
  });
  target()?.addEventListener?.('focus',()=>{
    const count=current?.activeComposition?.surfaces?.length||0;
    for(const label of WINDOW_MEDIA_SURFACE_LABELS.slice(0,count))void safe(()=>mediaSurfaces.get(label)?.show?.());
  });

  return{
    begin,ensure,apply,reject,prepareFireballs,prepareMedia,arrangeMovement,beginFireballCast,syncFireballCast,showPanes,hidePanes,
    captureSnapshot,snapshotData,showComposition,quiesceComposition,snapComposition,freezeComposition,setCompositionCoherence,triggerComposition,hideComposition,suspendSurfaces,
    // Compatibility preview name; there is no channel interaction behind it.
    previewChannel,end,emergencyRestore,
    active:()=>!!current,sessionToken:()=>current?.token||null,statusLine:()=>'',
    // Borrowing focus for one of our own projectile windows is not an
    // unexpected pointer unlock and must never open the pause menu.
    ownsPointerTransfer:()=>!!current&&(
      (!!current.activePlan&&current.rayStates.size>0)
      ||!!current.activeComposition?.surfaces?.some((surface)=>surface.draggable)
    ),
    debug:()=>current?{
      active:true,surfacesReady:current.surfacesReady,readySurfaces:current.readySurfaces,prewarmState:current.prewarmState,
      surfaceCount:surfaces.size,mediaSurfaceCount:mediaSurfaces.size,mediaReady:current.mediaReady,placementAttempts:current.placementAttempts,placementFailures:current.placementFailures,
      mediaScriptReady:mediaReadyLabels.size,mediaRevisions:Object.fromEntries(current.mediaRevisions||[]),compositionQuiesced:!!current.compositionQuiesced,activeCompositionCue:current.activeComposition?.cueId||null,
      fireballActive:!!current.activePlan&&current.rayStates.size>0,
      fullscreen:current.fullscreen,intensity:current.intensity,reasons:[...current.prewarmReasons,...current.mediaPrewarmReasons],
    }:{active:false,surfacesReady:false,readySurfaces:0,prewarmState:'idle',surfaceCount:0,placementAttempts:0,placementFailures:0,reasons:[]},
  };
}
