// A close, unvoiced breath, separate from the performance and the VFD voice.
// Its envelope follows the actual audio clock; it cannot run on during a hold.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};

export function sourceRestBreathFrame(progress,time){
  const p=clamp(progress,0,1),t=Math.max(0,Number(time)||0);
  const presence=smooth((p-.65)/.12)*(1-smooth((p-.87)/.08));
  // A short rough inhale and a longer, softer exhale, with silence between.
  const phase=(t/3.25)%1;
  const inhale=phase<.34?Math.pow(Math.sin(Math.PI*phase/.34),1.4):0;
  const exhale=phase>=.43&&phase<.91?.62*Math.pow(Math.sin(Math.PI*(phase-.43)/.48),1.7):0;
  const pulse=Math.max(inhale,exhale);
  return {gain:.18*presence*pulse,frequency:750+650*inhale+150*exhale};
}

export function createSourceRestBreath({getAudio=()=>null}={}){
  let graph=null,disposed=false;
  function pause(){if(!graph)return;try{graph.gain.gain.setTargetAtTime(0,graph.ctx.currentTime,.025);}catch{}}
  function stop(){if(!graph)return;pause();try{graph.source.stop();}catch{}for(const node of [graph.source,graph.filter,graph.gain])try{node.disconnect();}catch{}graph=null;}
  function build(ctx,destination){
    const data=ctx.createBuffer(1,Math.floor(ctx.sampleRate*3),ctx.sampleRate),samples=data.getChannelData(0);
    let seed=0x95b21;for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/2147483648-1)*.35;}
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=data;source.loop=true;filter.type='bandpass';filter.Q.value=.65;gain.gain.value=0;
    source.connect(filter);filter.connect(gain);gain.connect(destination);source.start();graph={ctx,destination,source,filter,gain};
  }
  function update({progress=0,audible=false}={}){
    if(disposed)return;
    if(!audible||progress<.65||progress>=.95){pause();return;}
    const pair=getAudio()||{},ctx=pair.ctx||pair.context,destination=pair.destination;
    if(!ctx||!destination||ctx.state!=='running'){pause();return;}
    if(graph&&(graph.ctx!==ctx||graph.destination!==destination))stop();
    try{
      if(!graph)build(ctx,destination);
      const frame=sourceRestBreathFrame(progress,ctx.currentTime);
      graph.filter.frequency.setTargetAtTime(frame.frequency,ctx.currentTime,.07);
      graph.gain.gain.setTargetAtTime(frame.gain,ctx.currentTime,.045);
    }catch{stop();}
  }
  return Object.freeze({update,pause,dispose(){if(disposed)return;disposed=true;stop();}});
}
