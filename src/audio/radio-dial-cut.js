// One owned, finite interruption in the physical receiver. The waveform is
// procedural timing material; it is not a recorded radio or human performance.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
export const RADIO_DIAL_CUT=Object.freeze({seconds:1.6,clicks:Object.freeze([.025,.19,.69]),land:.78,
  static:Object.freeze({attack:.035,release:1,level:.12}),bitDepth:12,rate:28000});

export function renderRadioDialCut({sampleRate=44100,seconds=RADIO_DIAL_CUT.seconds,seed=4417,reason='driven',sourceBuffer=null,sourceOffset=0}={}){
  const length=Math.max(1,Math.ceil(sampleRate*seconds)),out=new Float32Array(length),contact=reason==='contact';
  const inherited=sourceBuffer?.getChannelData?.(0),inheritRate=sourceBuffer?.sampleRate||sampleRate;
  let random=seed>>>0||4417,low=0,mid=0,last=0,phase=0;
  const lfo=contact?1.09:.71;
  for(let n=0;n<length;n++){
    const t=n/sampleRate,u=t/seconds;random=(Math.imul(random,1664525)+1013904223)>>>0;
    const white=random/2147483648-1;low+=.035*(white-low);mid+=.24*(white-mid);
    const carrier=(mid-low)*(.48+.28*Math.sin(t*7.13+seed)+.12*Math.sin(t*23.7));
    const attack=clamp(t/.035),release=clamp((seconds-t)/.18),loss=.5+.5*Math.sin(Math.PI*u),notch=1-.78*Math.exp(-(((u-.48)/.075)**2));
    let value=carrier*.12*attack*release*loss*notch;
    // Receiver fragments come from its actual current programme when available.
    // No new words or synthetic substitute are manufactured by this effect.
    if(inherited?.length){const at=Math.floor((sourceOffset+t)*inheritRate),index=((at%inherited.length)+inherited.length)%inherited.length;value+=inherited[index]*.055*loss*notch;}
    for(const click of RADIO_DIAL_CUT.clicks){const age=t-click*seconds;if(age>=0&&age<.075)value+=(white*.12*Math.exp(-age*110)+Math.sin(age*2*Math.PI*(contact?116:147))*.045*Math.exp(-age*55))*(contact?1:.68);}
    value+=Math.sin(t*2*Math.PI*(97+13*Math.sin(t*lfo)))*.012*Math.exp(-(((u-.42)/.21)**2));
    // A mild sample/quantization fault belongs to this finite signal, not the
    // whole mix. Silence, user gain and the supplied output bus remain exact.
    phase+=RADIO_DIAL_CUT.rate/sampleRate;if(phase>=1){phase%=1;last=Math.round(Math.tanh(value*1.15)*2047)/2047;}
    out[n]=last;
  }
  return out;
}

export function createRadioDialCut({context,destination,seconds=RADIO_DIAL_CUT.seconds,seed=4417,reason='driven',
  sourceBuffer=null,sourceOffset=0,gain=1,authoredPowerException=false,receiverPowered=true}={}){
  if(!context?.createBuffer||!context?.createGain||!destination)return null;
  const pcm=renderRadioDialCut({sampleRate:context.sampleRate,seconds,seed,reason,sourceBuffer,sourceOffset}),buffer=context.createBuffer(1,pcm.length,context.sampleRate);
  buffer.getChannelData(0).set(pcm);
  const out=context.createGain(),panner=context.createStereoPanner?.();out.gain.value=clamp(gain,0,1.5);
  if(panner){panner.pan.value=-.58;out.connect(panner);panner.connect(destination);}else out.connect(destination);
  let source=null,offset=0,startedAt=0,paused=true,disposed=false,protectedCancelled=false,serial=0,lastPowered=receiverPowered;
  function stopSource(){if(!source)return;const old=source;source=null;old.onended=null;try{old.stop();}catch{}try{old.disconnect();}catch{}}
  function current(){return Math.min(buffer.duration,offset+(source?Math.max(0,context.currentTime-startedAt):0));}
  function play(){
    if(disposed||paused||protectedCancelled||source||offset>=buffer.duration)return;
    const node=context.createBufferSource();node.buffer=buffer;node.connect(out);source=node;startedAt=context.currentTime;const token=++serial;
    node.onended=()=>{if(token!==serial||source!==node)return;source=null;offset=buffer.duration;try{node.disconnect();}catch{}dispose();};
    try{node.start(startedAt,offset);}catch{source=null;try{node.disconnect();}catch{}}
  }
  function setPaused(value){const next=!!value;if(next===paused)return;offset=current();paused=next;if(next)stopSource();else play();}
  function dispose(){if(disposed)return;disposed=true;stopSource();try{out.disconnect();panner?.disconnect();}catch{}}
  return{
    sync({age=offset,paused:hold=false,protectedAudio=false,receiverPowered:powered=receiverPowered}={}){
      if(disposed)return false;
      lastPowered=!!powered;
      if(protectedAudio||!powered&&!authoredPowerException){protectedCancelled=true;stopSource();return false;}
      const wanted=clamp(age,0,buffer.duration),drift=Math.abs(current()-wanted);if(drift>.075){stopSource();offset=wanted;}
      setPaused(hold);if(!hold){offset=source?offset:wanted;play();}return!!source;
    },
    setPaused,dispose,cancel:dispose,
    snapshot:()=>({disposed,paused,protectedCancelled,offsetSeconds:current(),duration:buffer.duration,playing:!!source,
      authoredPowerException,receiverPowered:lastPowered,signal:'finite synthesized receiver interruption',containsInventedVoice:false}),
  };
}

// Compatibility for callers that deliberately want a one-shot. Production
// traversal retains the returned owner and synchronizes it to its picture.
export function playRadioDialCut(options={}){const voice=createRadioDialCut(options);voice?.sync({age:0});return voice;}
