// Routed, finite Cuelume voices. No second AudioContext, delayed resume queue,
// world-noise emission, recorder feed, or wall-clock cleanup timers.
import { CONTROL_RECIPES, CONTROL_PROFILES } from './vendor/cuelume-mechanical.js';
export const CONTROL_VOICE_LIMIT=6;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,Number(value)||0));

export function createControlCueEngine({context:ctx,destination,gain=.55}={}){
  const voices=new Map(),recent=new Map(),buffers=new Map(),history=[];
  let sequence=0,disposed=false,played=0,suppressed=0;
  const remember=event=>{history.push(event);if(history.length>48)history.shift();};
  function end(voice){
    if(!voices.delete(voice.id))return;
    for(const source of voice.sources){source.onended=null;try{source.stop();}catch(_){}}
    for(const node of voice.nodes)try{node.disconnect();}catch(_){}
  }
  function cancel(scope='',{pendingOnly=false}={}){
    let count=0;
    for(const voice of voices.values())if(voice.scope.startsWith(scope)&&(!pendingOnly||voice.start>ctx.currentTime+.001)){
      end(voice);count++;
    }
    return count;
  }
  function noiseBuffer(variant){
    if(buffers.has(variant))return buffers.get(variant);
    const size=Math.ceil(ctx.sampleRate*.24),buffer=ctx.createBuffer(1,size,ctx.sampleRate),data=buffer.getChannelData(0);
    let seed=(0x4417c+variant*7919)>>>0;
    for(let i=0;i<size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/0xffffffff)*2-1;}
    buffers.set(variant,buffer);return buffer;
  }
  function play(name,{scope='ui',key=name,profile='panel',volume=1,delay=0,quiet=false}={}){
    const recipe=Object.hasOwn(CONTROL_RECIPES,name)?CONTROL_RECIPES[name]:null;
    // Suspended input is dropped. Resuming the game must never replay old keys.
    if(disposed||!recipe||!destination||ctx?.state!=='running')return false;
    const now=ctx.currentTime,start=now+clamp(delay,0,.2);
    const level=clamp(volume,0,1)*gain*recipe.volume*(quiet?(recipe.priority===0?.18:.65):1);
    if(level<=0)return false;
    const bucket=recipe.priority===0?'navigation':`${scope}:${key}`;
    if(start-(recent.get(bucket)??-Infinity)<recipe.gap/1000){suppressed++;return false;}
    for(const voice of voices.values())if(voice.end<=now)end(voice);
    if(voices.size>=CONTROL_VOICE_LIMIT){
      const victim=[...voices.values()].filter(v=>v.priority<=recipe.priority).sort((a,b)=>a.priority-b.priority||a.start-b.start)[0];
      if(!victim){suppressed++;return false;}end(victim);
    }
    recent.delete(bucket);recent.set(bucket,start);if(recent.size>128)recent.delete(recent.keys().next().value);
    const voice={id:++sequence,scope:String(scope),name,start,end:start,priority:recipe.priority,nodes:[],sources:[]};
    const own=node=>{voice.nodes.push(node);return node;};
    const pitch=Object.hasOwn(CONTROL_PROFILES,profile)?CONTROL_PROFILES[profile]:1;
    try{
      const master=own(ctx.createGain());master.gain.value=level;master.connect(destination);
      for(const layer of recipe.layers){
        const source=own(layer.kind==='tone'?ctx.createOscillator():ctx.createBufferSource());voice.sources.push(source);
        const at=start+(layer.offset||0),attack=Math.max(.001,layer.attack),stop=at+attack+layer.decay+.006;
        const amp=own(ctx.createGain());
        if(layer.kind==='tone'){source.type='sine';source.frequency.value=layer.frequency*pitch;source.connect(amp);}
        else{
          source.buffer=noiseBuffer(sequence%4);
          const filter=own(ctx.createBiquadFilter());filter.type=layer.filter||'bandpass';filter.frequency.value=layer.frequency*pitch;filter.Q.value=layer.q||1.4;
          source.connect(filter);filter.connect(amp);
        }
        amp.gain.setValueAtTime(.0001,at);
        amp.gain.exponentialRampToValueAtTime(layer.peak,at+attack);
        amp.gain.exponentialRampToValueAtTime(.0001,at+attack+layer.decay);
        amp.connect(master);
        source.start(at);source.stop(stop);voice.end=Math.max(voice.end,stop);
      }
      voices.set(voice.id,voice);
      let remaining=voice.sources.length;
      for(const source of voice.sources)source.onended=()=>{if(--remaining===0)end(voice);};
      played++;remember({name,scope:voice.scope,start,level,profile,quiet});return true;
    }catch(_){voices.set(voice.id,voice);end(voice);return false;}
  }
  return {play,cancel,dispose(){cancel();disposed=true;buffers.clear();recent.clear();},
    snapshot:()=>({voices:voices.size,pending:[...voices.values()].filter(v=>v.start>ctx.currentTime).length,
      buffers:buffers.size,played,suppressed,history:history.map(event=>({...event})),disposed})};
}
