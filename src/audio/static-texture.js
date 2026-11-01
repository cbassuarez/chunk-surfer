// Shared spectral kernel: the menu's idle transport and ending interference
// use this same texture. Each scene owns its carrier; no ending lease enters a menu.
export const STATIC_TEXTURE=Object.freeze({seconds:1.5,highpassHz:900,lowpassHz:7800,menuGain:.018,seed:0x74617065});
const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n)));
export function staticTextureBuffer(context,{seed=STATIC_TEXTURE.seed}={}){
  const length=Math.max(1,Math.floor(context.sampleRate*STATIC_TEXTURE.seconds)),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let state=(seed>>>0)||1,brown=0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<length;i++){brown=brown*.985+(random()*2-1)*.06;data[i]=(random()*2-1)*.34+brown*.22;}
  return buffer;
}
export function createStaticTexture({context:ctx,destination,gain=STATIC_TEXTURE.menuGain,seed=STATIC_TEXTURE.seed}={}){
  if(!ctx||!destination)return null;
  const src=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),g=ctx.createGain(),gate=ctx.createGain();
  src.buffer=staticTextureBuffer(ctx,{seed});src.loop=true;hp.type='highpass';hp.frequency.value=STATIC_TEXTURE.highpassHz;lp.type='lowpass';lp.frequency.value=STATIC_TEXTURE.lowpassHz;
  g.gain.value=clamp(gain,0,.25);gate.gain.value=1;src.connect(hp).connect(lp).connect(g).connect(gate).connect(destination);
  const startedAt=finite(ctx.currentTime);let stopped=false,disposed=false,target=g.gain.value,outputLevel=1;
  const disconnect=()=>{if(disposed)return;disposed=true;for(const node of[src,hp,lp,g,gate])try{node.disconnect();}catch{}};
  src.onended=disconnect;src.start(startedAt);
  function setLevel(value,fade=.04){if(stopped)return false;const at=finite(ctx.currentTime),p=g.gain;target=clamp(value,0,.25);
    if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(at);else p.cancelScheduledValues?.(at);
    if(p.setTargetAtTime)p.setTargetAtTime(target,at,Math.max(.003,fade));else if(p.setValueAtTime)p.setValueAtTime(target,at);else p.value=target;
    return true;
  }
  function setOutputLevel(value){outputLevel=clamp(value,0,1);const at=finite(ctx.currentTime);gate.gain.cancelScheduledValues?.(at);if(outputLevel===0)gate.gain.setValueAtTime?.(0,at);else if(gate.gain.setTargetAtTime)gate.gain.setTargetAtTime(outputLevel,at,.015);else gate.gain.value=outputLevel;}
  function mute(on){setOutputLevel(on?0:1);}
  function finish({hold=0,fade=.04}={}){if(stopped)return false;const at=finite(ctx.currentTime),p=g.gain;stopped=true;
    if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(at);else p.cancelScheduledValues?.(at);
    p.setValueAtTime?.(target,at);p.setValueAtTime?.(target,at+Math.max(0,hold));p.linearRampToValueAtTime?.(0,at+Math.max(0,hold)+Math.max(0,fade));
    try{src.stop(at+Math.max(0,hold)+Math.max(0,fade)+.02);}catch{disconnect();}return true;
  }
  // Ending releases can be cancelled/reanchored across a real pause. Only
  // the gain is pre-scheduled; the owner stops the source after unheld time.
  function fadeOut({seconds=4,level=target}={}){if(stopped)return false;const at=finite(ctx.currentTime),p=g.gain;target=clamp(level,0,.25);
    if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(at);else p.cancelScheduledValues?.(at);
    p.setValueAtTime?.(target,at);p.linearRampToValueAtTime?.(0,at+Math.max(.001,seconds));return true;
  }
  function cancelFade(){const at=finite(ctx.currentTime);if(g.gain.cancelAndHoldAtTime)g.gain.cancelAndHoldAtTime(at);else g.gain.cancelScheduledValues?.(at);}
  function stop({fade=.04}={}){return finish({fade});}
  function dispose(){if(disposed)return;stopped=true;target=0;g.gain.cancelScheduledValues?.(finite(ctx.currentTime));g.gain.setValueAtTime?.(0,finite(ctx.currentTime));try{src.stop();}catch{}disconnect();}
  return Object.freeze({src,hp,lp,g,gate,setLevel,setOutputLevel,mute,fadeOut,cancelFade,finish,stop,dispose,snapshot:()=>({startedAt,seed,seconds:STATIC_TEXTURE.seconds,target,outputLevel,stopped,disposed,phase:((finite(ctx.currentTime)-startedAt)%STATIC_TEXTURE.seconds+STATIC_TEXTURE.seconds)%STATIC_TEXTURE.seconds})});
}
