import { isTauriRuntime } from './detect.js';

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
  if(dodge<=.001)return null;
  return{
    dodge,
    reach:Math.max(0,Math.min(4,Number(dance.reach)||0)),
    senseMs:Math.max(0,Math.min(600,Number(dance.senseMs)||0)),
    cohesion:Math.max(0,Math.min(1,Number(dance.cohesion)||0)),
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
    // to cross one 160-pixel surface at the speed it left the frame, which is
    // also how long the surface stays up.
    travelSeconds:plan.reducedMotion?.26:.62,
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
  const hideTimers=new Map();
  let hitsBound=false;

  const target=()=>documentApi?.defaultView||globalThis.window||null;
  function dispatch(event,detail){
    const CustomEventCtor=target()?.CustomEvent||globalThis.CustomEvent;
    if(CustomEventCtor)target()?.dispatchEvent?.(new CustomEventCtor(event,{detail}));
  }

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
      // 160 pixels of fireball and nothing else.
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
      const size=160+index*24;
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
    };
    current=session;
    // Arrival starts construction, but no combat beat ever awaits it or creates a
    // missing surface. Until all four exist the complete cast stays in-canvas.
    session.prewarm=prewarmAll(session);
    return session.token;
  }

  function prepareFireballs(){return current?.prewarm||Promise.resolve(false);}

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
          if(session.rayStates.get(label)!==payload.state){
            session.rayStates.set(label,payload.state);
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
    return true;
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

  return{
    begin,apply,reject,prepareFireballs,arrangeMovement,beginFireballCast,syncFireballCast,suspendSurfaces,
    // Compatibility preview name; there is no channel interaction behind it.
    previewChannel,end,emergencyRestore,
    active:()=>!!current,sessionToken:()=>current?.token||null,statusLine:()=>'',
    debug:()=>current?{
      active:true,surfacesReady:current.surfacesReady,readySurfaces:current.readySurfaces,prewarmState:current.prewarmState,
      surfaceCount:surfaces.size,placementAttempts:current.placementAttempts,placementFailures:current.placementFailures,
      fullscreen:current.fullscreen,intensity:current.intensity,reasons:[...current.prewarmReasons],
    }:{active:false,surfacesReady:false,readySurfaces:0,prewarmState:'idle',surfaceCount:0,placementAttempts:0,placementFailures:0,reasons:[]},
  };
}
