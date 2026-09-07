// Foreground-radio foley owns only its scene's graph. The supplied dialog/SFX
// bus owns volume and mute; this module never reaches around it to destination,
// resumes the AudioContext, changes the world mix, or schedules wall-clock work.
export const RADIO_SCENE_STAGES=Object.freeze(['onset','relay','decision','reseat','still','break','after']);
const STAGES=new Set(RADIO_SCENE_STAGES);
const SILENT=new Set(['decision','still','after']);
const OUTPUT_GAIN=.5;

export function createRadioSceneAudio({getAudio=()=>null,reducedMotion=false}={}){
  let ctx=null,destination=null,buffer=null,current=null,choice=null,disposed=false,terminal=false,paused=false;
  const voices=new Set(),nodes=new Set(),sources=new Set();
  const add=node=>{nodes.add(node);return node;};
  const disconnect=node=>{try{node.disconnect();}catch(_){}nodes.delete(node);};
  function clear(){
    // Immediate detachment is also safe while a context is suspended: cleanup
    // does not need a future audio callback or timer in order to become silent.
    for(const source of sources){source.onended=null;try{source.stop(ctx?.currentTime||0);}catch(_){}}
    for(const node of nodes)try{node.disconnect();}catch(_){}
    sources.clear();nodes.clear();voices.clear();
  }
  function audio(){
    const next=getAudio?.();
    if(!next?.ctx||!next.destination||next.ctx.state==='closed')return false;
    if(ctx!==next.ctx){buffer=null;ctx=next.ctx;}
    destination=next.destination;
    return typeof ctx.createGain==='function'&&typeof ctx.createBufferSource==='function';
  }
  function noise(){
    if(buffer)return buffer;
    const rate=Number(ctx.sampleRate)||48000,length=Math.max(1,Math.floor(rate*1.37));
    buffer=ctx.createBuffer(1,length,rate);
    const data=buffer.getChannelData(0);let seed=0x4417c,body=0;
    for(let i=0;i<length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      body=body*.65+((seed/0xffffffff)*2-1)*.35;
      // The loop seam has no click. Corruption is the authored return, not an
      // accidental buffer discontinuity repeated underneath the conversation.
      const edge=Math.min(1,i/(rate*.012),(length-1-i)/(rate*.012));
      data[i]=body*Math.max(0,edge);
    }
    return buffer;
  }
  function voice({tone=null,frequency=650,gain=.01,seconds=null,delay=0,pan=0,attack=.016}={}){
    const owned=[],own=node=>{owned.push(node);return add(node);};
    const source=own(tone===null?ctx.createBufferSource():ctx.createOscillator());sources.add(source);
    if(tone===null){source.buffer=noise();source.loop=seconds===null;}
    else{source.type='sine';source.frequency.value=tone;}
    const amp=own(ctx.createGain()),filter=tone===null?own(ctx.createBiquadFilter()):null;
    const spatial=typeof ctx.createStereoPanner==='function'?own(ctx.createStereoPanner()):null;
    if(filter){filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;source.connect(filter);filter.connect(amp);}
    else source.connect(amp);
    if(spatial){spatial.pan.value=reducedMotion?0:Math.max(-.24,Math.min(.24,pan));amp.connect(spatial);spatial.connect(destination);}
    else amp.connect(destination);
    const at=ctx.currentTime+Math.max(0,delay),level=Math.max(0,Math.min(.055,gain))*OUTPUT_GAIN;
    amp.gain.setValueAtTime(0,ctx.currentTime);
    amp.gain.setValueAtTime(0,at);
    amp.gain.linearRampToValueAtTime(level,at+attack);
    if(seconds!==null){
      amp.gain.setValueAtTime(level,at+Math.max(attack,seconds*.35));
      amp.gain.linearRampToValueAtTime(0,at+seconds);
    }
    const record={source,owned};voices.add(record);
    source.onended=()=>{
      sources.delete(source);voices.delete(record);
      for(const node of owned)disconnect(node);
      source.onended=null;
    };
    source.start(at);
    if(seconds!==null)source.stop(at+seconds+.008);
  }
  function carrier(level=1){
    voice({frequency:680,gain:.010*level});
    voice({tone:108,gain:.0035*level});
  }
  function contact(gain=.018,delay=0){voice({frequency:1700,gain,seconds:.055,delay,attack:.003});}
  function stage(name,options={}){
    if(disposed||terminal||!STAGES.has(name))return false;
    const nextChoice=options.choice||null;
    if(current===name&&choice===nextChoice)return false;
    clear();
    if(SILENT.has(name)){
      current=name;choice=nextChoice;terminal=name==='after';return true;
    }
    if(paused){current=name;choice=nextChoice;return true;}
    if(!audio())return false;
    try{
      if(name==='onset'){carrier();contact(.014);}
      else if(name==='relay'){
        carrier(.6);
        // A clipped close return followed by its displaced answer, not a
        // voice sample and not a room-filling reverb tail.
        voice({frequency:590,gain:.033,seconds:.12,pan:-.18,attack:.004});
        voice({frequency:930,gain:.021,seconds:.075,delay:.19,pan:.16,attack:.003});
      }else if(name==='reseat'){
        if(nextChoice!=='listen'&&nextChoice!=='still')contact(.016);
        carrier(.42);
      }else if(name==='break'){
        voice({frequency:310,gain:.042,seconds:.19,pan:-.12,attack:.004});
        voice({tone:82,gain:.018,seconds:.17,attack:.007});
        contact(.022,.075);
      }
      current=name;choice=nextChoice;return true;
    }catch(_){clear();return false;}
  }
  function stop(){
    if(disposed)return;
    disposed=true;clear();buffer=null;destination=null;ctx=null;
  }
  function pause(){
    if(disposed||paused)return false;
    paused=true;clear();return true;
  }
  function resume(){
    if(disposed||!paused)return false;
    paused=false;
    if(terminal||!current||SILENT.has(current)||current==='break')return true;
    if(!audio())return false;
    // Restoring foreground ownership is not another relay, contact or break.
    // Only the current low carrier resumes; the scene owns its narration clock.
    try{carrier(current==='reseat'?.42:current==='relay'?.6:1);return true;}
    catch(_){clear();return false;}
  }
  return {stage,pause,resume,stop,snapshot:()=>({stage:current,choice,disposed,terminal,paused,silent:voices.size===0,voices:voices.size,nodes:nodes.size})};
}
