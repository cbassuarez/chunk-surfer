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
