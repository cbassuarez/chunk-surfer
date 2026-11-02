import {NATATORIUM_METRIC_IDENTITY} from '../render/natatorium-metric.js';

export const NATATORIUM_COFFEE_STRETCH=Object.freeze({duration:10,near:3.5,span:14,entryRearmSeconds:1,entryRearmMetres:1});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const ease=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
export function natatoriumCoffeeExponent(seconds){
  if(!Number.isFinite(seconds)||seconds<=0||seconds>=10)return 0;
  if(seconds<6.2)return 2.8*ease(seconds/6.2);
  if(seconds<8)return 2.8-4.9*ease((seconds-6.2)/1.8);
  if(seconds<8.6)return -2.1;
  return -2.1*(1-ease((seconds-8.6)/1.4));
}

// Ephemeral visit state, intentionally not a persisted camera/progression flag.
// Rebase after load, teleport, run changes, or host reset; never resume half a warp.
export function createNatatoriumCoffeeStretch(){
  let sampled=false,wasInside=false,armed=false,active=false,elapsed=0,entryAnchor=null,outsideSeconds=0,outsideAnchor=null,lastRunKey;
  let last={bodyZ:0,bodyX:0,reducedMotion:false};
  const stop=()=>{active=false;elapsed=0;};
  function reset(){sampled=false;wasInside=false;armed=false;entryAnchor=null;outsideAnchor=null;outsideSeconds=0;lastRunKey=undefined;stop();}
  function view(){
    const k=active&&!last.reducedMotion?natatoriumCoffeeExponent(elapsed):0;
    return {active,elapsed,entryAnchor:entryAnchor&&{...entryAnchor},metric:k?{pivotZ:last.bodyZ,near:3.5,span:14,k}:NATATORIUM_METRIC_IDENTITY};
  }
  function tick(dt,{inside=false,coffeeTaken=false,bodyZ=0,bodyX=0,eligible=true,paused=false,focused=true,reducedMotion=false,runKey,discontinuous=false}={}){
    const valid=Number.isFinite(bodyZ)&&Number.isFinite(bodyX);
    last={bodyZ:valid?bodyZ:0,bodyX:valid?bodyX:0,reducedMotion:!!reducedMotion};
    if(discontinuous||!valid||(sampled&&runKey!==lastRunKey))reset();
    lastRunKey=runKey;
    if(!sampled){sampled=true;wasInside=!!inside;armed=!inside;outsideAnchor=inside?null:{x:bodyX,z:bodyZ};return view();}
    // Focus/pause shares the game's frozen clock; never accumulate wall time.
    if(paused||!focused)return view();
    const step=clamp(Number(dt)||0,0,.1);
    if(!inside){
      if(wasInside){stop();outsideSeconds=0;outsideAnchor={x:bodyX,z:bodyZ};}
      outsideSeconds+=step;
      if(outsideSeconds>=1&&outsideAnchor&&Math.hypot(bodyX-outsideAnchor.x,bodyZ-outsideAnchor.z)>=1)armed=true;
    }else{
      if(!wasInside){
        if(armed&&coffeeTaken&&eligible&&!reducedMotion){active=true;elapsed=0;entryAnchor={x:bodyX,z:bodyZ};}
        armed=false;outsideSeconds=0;outsideAnchor=null;
      }
      // A blocking authored scene, removed coffee, or reduced-motion preference
      // consumes this visit rather than leaving a hidden optical state behind.
      if(!eligible||!coffeeTaken||reducedMotion)stop();
      else if(active){elapsed=Math.min(10,elapsed+step);if(elapsed>=10)active=false;}
    }
    wasInside=!!inside;
    return view();
  }
  return {tick,view,reset};
}
