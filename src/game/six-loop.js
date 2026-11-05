// THE CRASH AFTER THE THIRD TAKE.
//
// The first door opened after the third accepted room really hangs the page and
// really reloads it. Nothing is staged on screen in a release build: the picture
// stops, input dies, the audio thread keeps playing what it had, and the game
// boots. From then on this page session is the loop: Continue and New Run both
// start the same real night in memory, and nothing it does reaches the disk.
//
// The way out is a real one. Closing the game ends the session, and the next
// launch reads the night that was saved before the hang, take three included.
// A later reload inside the session stays in the loop; a fresh launch does not.
export const SIX_LOOP=Object.freeze({
  sessionKey:'chunk-surfer:six-loop',
  flag:'six.crash.fired',
  takes:3,
  hangMs:4200,
});

const session=()=>{try{return globalThis.sessionStorage||null;}catch{return null;}};
const reloaded=()=>{try{return globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type==='reload';}catch{return false;}};
let active=null;

// Read once per page load, before anything can write. A session flag on a fresh
// launch is stale (some webviews restore sessionStorage) and is dropped.
export function sixLoopActive(){
  if(active!==null)return active;
  const store=session();let flagged=false;
  try{flagged=store?.getItem(SIX_LOOP.sessionKey)==='1';}catch{}
  active=flagged&&reloaded();
  if(flagged&&!active)try{store.removeItem(SIX_LOOP.sessionKey);}catch{}
  return active;
}
export function armSixLoop(){try{session()?.setItem(SIX_LOOP.sessionKey,'1');return true;}catch{return false;}}
export function clearSixLoop(){try{session()?.removeItem(SIX_LOOP.sessionKey);}catch{}}

export const sixOrdinaryTakes=takes=>(Array.isArray(takes)?takes:[]).filter(id=>id&&id!=='lux_nova').length;

// Exactly three: a fourth take has already turned on the road to Source, and the
// crash must never land on that run-up. Reduce Dread promises no fake crash.
export function sixCrashDue({doorOpened=false,storyMode=false,takes=[],flags={},reduceDread=false,inLoop=false}={}){
  return!!doorOpened&&!!storyMode&&!inLoop&&!reduceDread&&!flags?.[SIX_LOOP.flag]&&sixOrdinaryTakes(takes)===SIX_LOOP.takes;
}

// Debug builds only. A hang with no banner is a real hang.
export function sixLoopDebugBuild(){
  if(import.meta.env?.DEV===true)return true;
  try{return new URLSearchParams(globalThis.location?.search||'').has('sixdebug');}catch{return false;}
}
export function showSixDebugOverlay(text,doc=globalThis.document){
  if(!sixLoopDebugBuild()||!doc?.createElement)return null;
  let el=doc.getElementById('six-loop-debug');
  if(!el){
    el=doc.createElement('div');el.id='six-loop-debug';
    el.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:4px 10px;background:#ff00b4;color:#000;font:700 13px/1.3 ui-monospace,Consolas,monospace;text-align:center;pointer-events:none';
    (doc.body||doc.documentElement).appendChild(el);
  }
  el.textContent=text;return el;
}
export function syncSixLoopDebugOverlay(){
  if(sixLoopActive())showSixDebugOverlay('STAGED: SIX LOOP ACTIVE // SAVES BLOCKED // CLOSE THE GAME TO LEAVE');
}

const nextFrame=win=>new Promise(done=>{const raf=win?.requestAnimationFrame;if(typeof raf==='function')raf.call(win,()=>done());else done();});

// A real hang: the main thread is simply held. Pointer lock is let go first so
// the cursor comes back, as it does when a window stops answering.
export async function stageSixCrash({settle=null,hangMs=SIX_LOOP.hangMs,win=globalThis,now=()=>globalThis.performance.now()}={}){
  if(settle)await settle;
  armSixLoop();
  showSixDebugOverlay(`STAGED CRASH // SIX LOOP // NOT AN ERROR // HANGING ${(hangMs/1000).toFixed(1)}S THEN RELOADING`,win?.document);
  try{win?.document?.exitPointerLock?.();}catch{}
  await nextFrame(win);await nextFrame(win);
  const until=now()+hangMs;
  while(now()<until){}
  win?.location?.reload?.();
}
