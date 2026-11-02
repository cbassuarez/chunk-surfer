import {createStaticTexture,STATIC_TEXTURE} from './static-texture.js';

const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));

// The return report and title share one transport. An ending can relinquish
// its live carrier here; adoption never reconnects its output or starts a new
// source. Its dedicated bus sits after the programme/ending gate, so the SFX
// setting is applied exactly once through the carrier's own output gate.
export function createFrontEndStatic({context:ctx,destination,getSfxLevel=()=>1,getHeld=()=>false,
  makeTexture=createStaticTexture,scheduleTimer=fn=>setInterval(fn,20),cancelTimer=clearInterval}={}){
  if(!ctx||!destination)return null;
  let carrier=null,timer=null,disposed=false,adopted=false;
  function update(){
    if(disposed||!carrier)return false;
    let held=true,level=0;
    try{held=!!getHeld()||ctx.state!=='running';level=clamp(getSfxLevel());}catch{}
    carrier.setOutputLevel(held?0:level);
    return true;
  }
  function watch(){if(timer===null){timer=scheduleTimer(update);timer?.unref?.();}update();}
  function start(){
    if(disposed)return false;
    if(!carrier){carrier=makeTexture({context:ctx,destination,gain:0});carrier?.setLevel(STATIC_TEXTURE.menuGain,.04);adopted=false;}
    if(!carrier)return false;watch();return true;
  }
  function adopt(next){
    if(disposed||!next||next.context!==ctx||next.snapshot?.().stopped||next.snapshot?.().disposed)return false;
    if(carrier&&carrier!==next)carrier.dispose();
    carrier=next;adopted=true;
    // cancelAndHold within setLevel preserves the sample's present level. In
    // the normal path the ending has already reached this exact idle level.
    carrier.setLevel(STATIC_TEXTURE.menuGain,.12);
    watch();return true;
  }
  function stop({fade=.12}={}){
    if(timer!==null){cancelTimer(timer);timer=null;}
    const old=carrier;carrier=null;adopted=false;return old?.stop({fade})||false;
  }
  return Object.freeze({start,adopt,stop,update,
    snapshot:()=>({active:!!carrier,adopted,carrier:carrier?.snapshot?.()||null}),
    dispose(){if(disposed)return;stop({fade:0});disposed=true;}});
}
