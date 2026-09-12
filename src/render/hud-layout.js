// Pure cell-space layout for the ordinary-play AUDIOCORP field deck.
//
// The old HUD placed every fact independently. This module gives the navigator,
// job rail, monitor and prompts stable territories so a compact viewport changes
// the composition instead of merely clipping it.

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function fieldDeckLayout({cols=80,rows=45}={}){
  const safeCols=Math.max(40,Math.floor(Number(cols)||80));
  const safeRows=Math.max(24,Math.floor(Number(rows)||45));
  const compact=safeCols<72||safeRows<36;
  const navigatorW=compact
    ?clamp(Math.floor(safeCols*.36),26,30)
    :clamp(Math.floor(safeCols*.27),30,34);
  const navigatorH=compact
    ?clamp(Math.floor(safeRows*.38),13,15)
    :clamp(Math.floor(safeRows*.39),16,18);
  const navigator={
    x:Math.max(2,safeCols-navigatorW-2),
    y:2,
    w:navigatorW,
    h:navigatorH,
  };
  return Object.freeze({
    compact,
    navigator:Object.freeze(navigator),
    takes:Object.freeze({x:2,y:1,w:Math.max(12,navigator.x-4),h:1}),
    objective:Object.freeze({x:2,y:2,w:Math.max(12,navigator.x-4),h:2}),
    monitor:Object.freeze({x:2,y:compact?safeRows-5:safeRows-4,w:26,h:1}),
    prompt:Object.freeze({x:2,y:safeRows-2,w:safeCols-4,h:1}),
  });
}

export function hudReminderVisible({now=0,lastKeyAt=0,lastPointerAt=0,delayMs=9000}={}){
  const last=Math.max(0,Number(lastKeyAt)||0,Number(lastPointerAt)||0);
  return last<=0||Math.max(0,Number(now)||0)-last>=Math.max(0,Number(delayMs)||0);
}

// Ambient tools do not have a thing in the world to focus. A door can teach
// [E] when the player reaches it; the torch cannot, so its control needs a
// separate lifetime from objective hints and reticle prompts.
export const CONTROL_HUD_DISCOVERY_MS=18000;
// Kept for hudReminderVisible, which is still the right helper for any surface
// that wants an idle-only reminder. The control rail no longer is one.
export const CONTROL_HUD_IDLE_MS=9000;

export function controlHudPresentation({
  mode='smart',
  now=0,
  introducedAt=0,
  lastKeyAt=0,
  lastPointerAt=0,
  contextual=false,
  discoveryMs=CONTROL_HUD_DISCOVERY_MS,
}={}){
  const normalized=mode==='persistent'?'persistent':'smart';
  const introduced=Math.max(0,Number(introducedAt)||0);
  if(introduced<=0)return Object.freeze({visible:false,compact:false,reason:'not-introduced'});
  if(normalized==='persistent'){
    return Object.freeze({visible:true,compact:!!contextual,reason:contextual?'persistent-compact':'persistent'});
  }
  const elapsed=Math.max(0,(Number(now)||0)-introduced);
  if(elapsed<Math.max(0,Number(discoveryMs)||0)){
    return Object.freeze({visible:true,compact:!!contextual,reason:contextual?'discovery-compact':'discovery'});
  }
  // ANYTHING ELSE THAT WANTS THIS ROW WINS. Otherwise the rail stays up.
  //
  // It used to require the player to be IDLE — `hudReminderVisible` against
  // lastKeyAt/lastPointerAt — so the three verbs the game is built on were
  // visible only while nobody was playing, and vanished the moment anyone moved.
  // A control hint that hides when you are using the controls is a hint you
  // cannot check. It is icons now, not words (see render/verb-icons.js), which
  // is what makes leaving it up cost almost nothing.
  if(contextual)return Object.freeze({visible:false,compact:false,reason:'context'});
  return Object.freeze({visible:true,compact:false,reason:'ambient'});
}

// The radio has no nearby object to teach its key. Once introduced, its keycap
// and literal name stay available even when Smart controls yield to a focused
// door or sheet. Modal/cinematic ownership always wins. This is presentation
// only: a dead/deployed radio can still be inspected by its dedicated screen.
export function radioHudPresentation({
  introduced=false,worldVisible=true,dead=false,deployed=false,noSignal=false,calling=false,busy=false,
}={}){
  if(!introduced||!worldVisible)return Object.freeze({visible:false,enabled:false,status:!introduced?'not-introduced':'screen-owner',part:null});
  const states=[];
  if(deployed)states.push('DEPLOYED');
  if(dead)states.push('DEAD');
  else if(noSignal)states.push('NO SIGNAL');
  else if(calling)states.push('CALLING');
  else if(busy)states.push('BUSY');
  const status=states.length?states.join(' · '):'READY';
  return Object.freeze({
    visible:true,enabled:!dead&&!deployed&&!noSignal&&!busy,
    status,
    part:Object.freeze({action:'radio',label:calling&&!dead&&!deployed&&!noSignal&&!busy?'ANSWER RADIO':states.length?`RADIO · ${status}`:'RADIO',persistent:true}),
  });
}

// Compact ambient controls may shed optional verbs but never the radio's
// explicit name. Keeping this selection shared makes context rows testable.
export function controlHudRailParts(parts=[],{compact=false}={}){
  return compact?parts.filter((part,index)=>index===0||part?.persistent):parts;
}
