import {bootWeatherVoice} from './boot-weather-audio.js';
import {createThunderVoice} from './thunder.js';

const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(n)||0));
const rainVoice=bootWeatherVoice('rain');

// Original, short mechanical foley. A firing pulse train and irregular tyre
// friction share the visible shot's clock; no music or permanent idle loop.
export function startupVanWaveforms(sampleRate=48000){
  const rate=Math.max(8000,Math.min(192000,Math.round(sampleRate))),engine=new Float32Array(rate),tyres=new Float32Array(rate),rain=new Float32Array(rate);
  let seed=0x414c4249,slow=0,rough=0,phase=0;
  for(let i=0;i<rate;i++){
    const t=i/rate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;slow+=.006*(noise-slow);rough+=.18*(noise-rough);
    rain[i]=noise;
    const pulse=Math.sin(2*Math.PI*45*t)+.38*Math.sin(2*Math.PI*90*t+.4)
      +.24*Math.sin(2*Math.PI*135*t)+.14*Math.sin(2*Math.PI*225*t+.8);
    engine[i]=Math.tanh(pulse*1.2)*.22+rough*.035;
    phase+=2*Math.PI*(1310+slow*650+Math.sin(t*2*Math.PI*19)*95)/rate;
    tyres[i]=Math.tanh((noise-rough)*1.3+Math.sin(phase)*(.48+Math.abs(slow)*2))*.32;
  }
  // Seam the loops without a boundary impulse or a recurring click.
  const seam=Math.round(rate*.008);
  for(const data of[engine,tyres,rain]){
    let mean=0;for(const v of data)mean+=v;mean/=data.length;
    for(let i=0;i<data.length;i++)data[i]-=mean;
    for(let i=0;i<seam;i++){
      const fade=Math.sin(i/seam*Math.PI*.5);
      data[i]*=fade;data[data.length-1-i]*=fade;
    }
  }
  return{sampleRate:rate,engine,tyres,rain};
}

export function startupVanMix(event={}){
  const p=clamp(event.progress),stage=event.stage;
  if(stage==='offscreen')return{engine:0,rate:.85,tyre:0,roll:0};
  if(stage==='departure'){
    const drive=clamp((event.elapsed-1.55)/1.65);
    return{engine:(.20+.55*drive)*(1-drive),rate:.76+.60*drive,tyre:0,roll:.10*Math.sin(Math.PI*drive)};
  }
  const brake=stage==='brake',settle=stage==='settle'||stage==='parked';
  const attack=clamp(p/.055),fade=clamp((1-p)/.09);
  return{
    engine:attack*fade*(settle?.20:brake?.36:.65),
    rate:settle?.68:brake?.84:1.03+.32*Math.sin(clamp(p/(.95/3.4))*Math.PI*.72),
    tyre:brake?Math.sin(clamp((p-.95/3.4)/(.32/3.4))*Math.PI)*.78:0,
    roll:!brake&&!settle?attack*.075:0,
  };
}

// The caller lends the existing SFX bus. Never opens/resumes a context or
// connects to speakers here; browser permission, saved volume and silent
// capture routing remain owned by the game.
export function createStartupVanAudio({getAudio=()=>null,makeThunder=createThunderVoice}={}){
  let graph=null,finished=false,last=null,played=false,lastElapsed=null,heardPrevious=false,visiblePrevious=false,thunderPlayed=0;
  const visibleFlashes=new Set();
  const clearVisibleWeather=()=>{visiblePrevious=false;visibleFlashes.clear();};
  function stop(){
    if(!graph)return;
    try{graph.thunder?.stop();}catch{}
    for(const node of graph.sources)try{node.stop();}catch{}
    for(const node of graph.nodes)try{node.disconnect();}catch{}
    graph=null;
  }
  function acquire(weather){
    let pair;try{pair=getAudio();}catch{return null;}
    const ctx=pair?.ctx||pair?.context,destination=pair?.destination;
    if(!ctx||!destination||ctx.state!=='running')return null;
    if(graph&&graph.ctx!==ctx)stop();
    if(graph)return graph;
    const waves=startupVanWaveforms(ctx.sampleRate),nodes=[],sources=[],own=node=>(nodes.push(node),node);
    const output=own(ctx.createGain());output.gain.value=.60;output.connect(destination);
    function layer(data,type,hz,q){
      const buffer=ctx.createBuffer(1,data.length,waves.sampleRate);buffer.getChannelData(0).set(data);
      const source=own(ctx.createBufferSource()),filter=own(ctx.createBiquadFilter()),gain=own(ctx.createGain());
      source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=hz;filter.Q.value=q;
      gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(output);sources.push(source);
      return{source,gain,filter};
    }
    const engine=layer(waves.engine,'lowpass',720,.65),tyre=layer(waves.tyres,'bandpass',1750,1.2);
    // Same stone/air bands and restrained level as the existing credits rain.
    // The startup owns these nodes so reveal can disconnect them immediately,
    // rather than retaining the credits bed's fade or thunder-tail timer.
    const rain=weather.rain?{
      body:layer(waves.rain,'bandpass',rainVoice.body.freq,rainVoice.body.q),
      air:layer(waves.rain,'bandpass',rainVoice.air.freq,rainVoice.air.q),
    }:null;
    const thunder=weather.strikes.length?makeThunder({context:ctx,destination:output}):null;
    graph={ctx,nodes,sources,engine,tyre,rain,thunder};for(const source of sources)source.start();played=true;return graph;
  }
  function event(value={}){
    const duration=clamp(value.duration||3.4,.1,12),elapsed=Number.isFinite(value.elapsed)?clamp(value.elapsed,0,duration):clamp(value.progress)*duration;
    const previous=lastElapsed;lastElapsed=elapsed;
    const previousGraph=graph,wasAudible=heardPrevious;heardPrevious=false;
    const wasVisible=visiblePrevious;visiblePrevious=false;
    last=value;
    if(value.type==='stop'){finished=true;clearVisibleWeather();stop();return false;}
    if(finished)return false;
    if(value.hidden||value.reduced||value.type==='pause'){clearVisibleWeather();stop();return false;}
    if(!['start','tick','resume'].includes(value.type))return false;
    if(value.progress>=.98){stop();return false;}
    const times=values=>[...new Set((Array.isArray(values)?values:[])
      .filter(t=>Number.isFinite(t)&&t>=0&&t<duration))].sort((a,b)=>a-b).slice(0,4);
    const weather={rain:value.weather?.rain===true,strikes:times(value.weather?.thunderAtSeconds),flashes:times(value.weather?.lightningAtSeconds)};
    // Remember only a visible crossing of the flash, before asking for sound.
    // Permission can arrive later and still admit a future thunderclap; a
    // suppressed/skipped flash or an audio hook attached afterwards cannot.
    visiblePrevious=!value.reduceFlash;
    if(wasVisible&&visiblePrevious&&value.type==='tick'&&previous!==null&&elapsed>=previous&&elapsed-previous<=.18)
      for(const at of weather.flashes)if(at>previous&&at<=elapsed)visibleFlashes.add(at);
    // A late hook or permission may join the rain/current engine state. It
    // never catches up an unheard thunderclap, even if its onset just passed.
    const g=acquire(weather);if(!g)return false;
    heardPrevious=true;
    const mix=startupVanMix(value),at=g.ctx.currentTime;
    const target=(param,n)=>{param.cancelScheduledValues(at);param.setTargetAtTime(n,at,.024);};
    target(g.engine.source.playbackRate,mix.rate);target(g.engine.gain.gain,mix.engine);
    target(g.tyre.gain.gain,mix.tyre+mix.roll);target(g.tyre.filter.frequency,mix.tyre?1900:640);
    if(g.rain){
      const presence=clamp((1-clamp(value.progress))/.06),wind=1+Math.sin(elapsed*2*Math.PI*rainVoice.wobbleHz)*rainVoice.gustDepth;
      target(g.rain.body.gain.gain,rainVoice.gain*rainVoice.body.gain*presence*wind);
      target(g.rain.air.gain.gain,rainVoice.gain*rainVoice.air.gain*presence*wind);
      target(g.rain.body.filter.frequency,rainVoice.body.freq+Math.sin(elapsed*2*Math.PI*rainVoice.wobbleHz)*rainVoice.wobbleDepth);
    }
    if(wasAudible&&previousGraph===g&&g.thunder&&!value.reduceFlash&&value.type==='tick'&&previous!==null&&elapsed>=previous&&elapsed-previous<=.18){
      for(const at of weather.strikes)if(at>previous&&at<=elapsed){
        const flash=weather.flashes.filter(t=>t<at).at(-1);
        if(flash!==undefined&&!visibleFlashes.has(flash))continue;
        // The metadata owns propagation time. Thunder's renderer removes its
        // earliest geometric arrival, so strike() plays now, without another
        // distance delay. Give its spectrum the same flash-to-clap distance.
        const distance=flash===undefined?1100:Math.max(60,(at-flash)*343);
        if(g.thunder.strike({seed:(0x56414e^Math.round(at*1000))>>>0,distance,energy:.45,bearing:-.35}))thunderPlayed++;
      }
    }
    return true;
  }
  return{event,dispose:()=>{finished=true;clearVisibleWeather();stop();},status:()=>({active:!!graph,played,finished,stage:last?.stage||null,rain:!!graph?.rain,thunderPlayed})};
}
