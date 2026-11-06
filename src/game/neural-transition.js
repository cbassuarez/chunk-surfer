// HOW HE GETS THERE AND BACK. Not a cut and not a fade. Light getting into the camera, so
// that a mind going can't be told from a film being ruined, and the game never says which.
// Ruled 2026-11-05: camera light leaks and blinding light. Condensation was tried and
// taken out: it didn't work or match.
//
// It is also what failing cells do, one mechanism among several: a surge, then nothing,
// and what comes back comes back slowly. That is in how this behaves, not how it looks.
//
//   the leaks    film fogging from the edge of the gate: deep red at its reach, then
//                orange, yellow, white where it is worst, on a hand-cranked twelve frames
//                a second. Out-of-focus light drifting over the lens.
//   the flare    light swelling from one point, its edge fringed by a cheap lens.
//   the melt     the focus goes, every highlight swells, the frame is exposed twice.
//   the white    blinding, not faded to: the highlights clip first.
//   the return   the exposure comes down first and the focus last, as he comes to.
//   the after    back in the room, the sun is still on his eye, in its complement.
//
// PHOTOSENSITIVITY IS NOT OPTIONAL HERE. Whole-screen brightness rises and falls at most
// twice in any one second, and the twelve-frame stepping moves only the leak's edge, never
// the whole screen's level. With Reduce Flash the white is capped, it is slower and nothing
// steps. Reduced motion removes the moving flare. The caller won't run any of it with
// Effects off.

export const NEURAL_TRANSITION=Object.freeze({
  enterSeconds:1.05,leaveSeconds:1.1,arriveSeconds:1.7,emergeSeconds:3.6,
  seepInSeconds:.17,seepFlashSeconds:.14,seepOutSeconds:1.3,twitchSeconds:.75,
  flashWhiteCap:.5,flashSlower:1.45,frontReach:2.5,
});
const C=NEURAL_TRANSITION;
export const NEURAL_KINDS=Object.freeze(['enter','leave','arrive','emerge','seep-in','seep-flash','seep-out','twitch']);
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const smooth=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
export const NEURAL_NONE=Object.freeze({leak:0,white:0,waveRadius:0,waveBand:.2,lens:0,after:0,shimmer:0,done:true,peak:false});

function shape(kind,t){
  switch(kind){
    case'enter':case'leave':{
      const T=kind==='enter'?C.enterSeconds:C.leaveSeconds,u=t/T;
      return{seconds:T,leak:smooth(0,.42,u),waveRadius:C.frontReach*Math.pow(smooth(.16,.92,u),1.7),waveBand:.24,white:smooth(.6,1,u),peak:u>=1};
    }
    case'arrive':
      return{seconds:C.arriveSeconds,leak:.85*(1-smooth(.2,1.6,t)),white:1-smooth(0,.6,t),lens:1-smooth(.15,1.5,t)};
    case'emerge':
      return{seconds:C.emergeSeconds,leak:.8*(1-smooth(.2,2.4,t)),white:1-smooth(0,.7,t),lens:1-smooth(.2,2.1,t),after:smooth(.1,.35,t)*(1-smooth(.6,C.emergeSeconds,t))};
    case'seep-in':{
      const u=t/C.seepInSeconds;
      return{seconds:C.seepInSeconds,leak:smooth(0,.55,u),waveRadius:C.frontReach*Math.pow(clamp01(u),1.3),waveBand:.16,white:.96*Math.pow(clamp01(u),2.2),peak:u>=1};
    }
    case'seep-flash':{
      const u=t/C.seepFlashSeconds;
      return{seconds:C.seepFlashSeconds,leak:1-.4*clamp01(u),white:.96*(1-smooth(0,1,u))};
    }
    case'seep-out':
      return{seconds:C.seepOutSeconds,leak:.85*(1-smooth(.05,.9,t)),white:.9*(1-smooth(0,.3,t)),lens:.6*(1-smooth(.02,.75,t)),after:.45*smooth(.02,.12,t)*(1-smooth(.2,C.seepOutSeconds,t))};
    case'twitch':{
      const u=clamp01(t/C.twitchSeconds);
      return{seconds:C.twitchSeconds,leak:.5*Math.pow(Math.sin(u*Math.PI),2)};
    }
    default:return{seconds:0};
  }
}
/** Pure. `t` is seconds into the transition. Nothing stored and nothing saved. */
export function neuralFrame(kind,t=0,{reducedFlash=false,reducedMotion=false}={}){
  const slower=reducedFlash?C.flashSlower:1,at=Math.max(0,Number(t)||0)/slower,row=shape(kind,at);
  if(!row.seconds)return NEURAL_NONE;
  const cap=reducedFlash?C.flashWhiteCap:1;
  return Object.freeze({
    leak:clamp01(row.leak)*(reducedFlash?.7:1),
    white:clamp01(row.white)*cap,
    waveRadius:reducedMotion?0:Math.max(0,Number(row.waveRadius)||0),
    waveBand:row.waveBand||.2,
    lens:clamp01(row.lens),
    after:clamp01(row.after),
    shimmer:reducedFlash?0:1,
    time:at,
    done:at>=row.seconds,
    peak:!!row.peak||at>=row.seconds,
  });
}
export const neuralSeconds=(kind,{reducedFlash=false}={})=>shape(kind,0).seconds*(reducedFlash?C.flashSlower:1);
