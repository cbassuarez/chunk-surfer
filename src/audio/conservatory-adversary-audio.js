// Physical, directional contacts for the prop-store seam and ceiling frieze.
// These go only to the world SFX bus; the creatures never submit HUSH noise.
const NOTE_HZ=[880,783.991,698.456,659.255]; // A-G-F-E: the building's lament figure.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function createConservatoryAdversaryAudio({getAudio}){
  const live=new Set();
  function play(event,{listener={x:0,y:0,yaw:0},occluded=false,emphasis=1}={}){
    const audio=getAudio?.();if(!audio?.ctx||!audio.destination||!event?.at)return false;
    const {ctx,destination}=audio,t=ctx.currentTime;
    const dx=event.at.x-listener.x,dy=event.at.y-listener.y;
    const distance=Math.hypot(dx,dy),right=dx*Math.cos(listener.yaw)+dy*Math.sin(listener.yaw);
    const pan=clamp(right/Math.max(2,distance),-1,1),attenuation=clamp(1/(1+distance*.16),.08,1)*(occluded?.34:1);
    const bus=ctx.createGain();bus.gain.value=attenuation*.24*clamp(emphasis,.4,1.7);
    const panner=ctx.createStereoPanner?.();
    if(panner){panner.pan.value=pan;bus.connect(panner);panner.connect(destination);}
    else bus.connect(destination);
    const voice={nodes:[bus,...(panner?[panner]:[])],sources:[]};live.add(voice);
    const connect=(source,filter,gain)=>{source.connect(filter);filter.connect(gain);gain.connect(bus);voice.nodes.push(filter,gain);voice.sources.push(source);};
    const tone=(frequency,start,duration,{type='sine',volume=.17,cutoff=2400}={})=>{
      const oscillator=ctx.createOscillator(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain();
      oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
      filter.type='lowpass';filter.frequency.value=occluded?Math.min(cutoff,680):cutoff;
      envelope.gain.setValueAtTime(.0001,start);envelope.gain.exponentialRampToValueAtTime(volume,start+.018);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
      connect(oscillator,filter,envelope);oscillator.start(start);oscillator.stop(start+duration+.025);
    };
    const friction=(start,duration,{cutoff=800,volume=.25}={})=>{
      const length=Math.ceil((duration+.04)*ctx.sampleRate),buffer=ctx.createBuffer(1,length,ctx.sampleRate),samples=buffer.getChannelData(0);
      let noise=0;for(let i=0;i<length;i++){noise=noise*.77+(Math.random()*2-1)*.23;samples[i]=noise;}
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain();source.buffer=buffer;
      filter.type='bandpass';filter.frequency.value=occluded?cutoff*.48:cutoff;filter.Q.value=.68;
      envelope.gain.setValueAtTime(.0001,start);envelope.gain.linearRampToValueAtTime(volume,start+.035);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
      connect(source,filter,envelope);source.start(start);source.stop(start+duration+.03);
    };
    const kind=event.kind;
    if(kind==='held-reveal'){
      tone(NOTE_HZ[0]/2,t,.65,{type:'triangle',volume:.07,cutoff:1100});
      friction(t+.12,.45,{cutoff:330,volume:.06});
    }else if(kind==='held-warning'){
      // A-G-F: three separate preparations. The E belongs to the committed
      // sweep, so silence at the end of this 3.2s warning remains meaningful.
      NOTE_HZ.slice(0,3).forEach((frequency,index)=>
        tone(frequency,t+index,index===2?.9:.65,{type:'triangle',volume:.22,cutoff:2100}));
    }else if(kind==='held-strike'){
      tone(NOTE_HZ[3],t,.75,{type:'triangle',volume:.25,cutoff:2100});
      tone(NOTE_HZ[3]*2.006,t+.015,.68,{volume:.035,cutoff:2800});
      friction(t,.22,{cutoff:520,volume:.20});
    }else if(kind==='held-release'){
      // The held pitch cuts into one short low contact, then real silence.
      tone(NOTE_HZ[3]/2,t,.09,{type:'triangle',volume:.065,cutoff:900});
      friction(t+.025,.13,{cutoff:260,volume:.055});
    }else if(kind==='held-clean'){
      tone(440,t,.06,{volume:.035,cutoff:1100});
      tone(660,t+.08,.05,{volume:.025,cutoff:1400});
    }else if(kind==='held-impact'){
      friction(t,.35,{cutoff:370,volume:.34});
      tone(82,t+.04,.35,{type:'triangle',volume:.12,cutoff:430});
    }else if(kind==='lure-studio'||kind==='lure-chamber'){
      const delay=kind==='lure-chamber'?.14:0;
      NOTE_HZ.forEach((frequency,index)=>{
        const begin=t+delay+index*.36;
        tone(frequency,begin,.47+(index===3?.28:0),{type:'triangle',volume:.19,cutoff:2000});
        tone(frequency*2.006,begin+.007,.40,{volume:.038,cutoff:3100});
      });
    }else if(kind==='held-note'){
      tone(NOTE_HZ[3],t,3.25,{type:'triangle',volume:.2,cutoff:1800});
      tone(NOTE_HZ[3]*1.006,t+.14,3.1,{volume:.055,cutoff:1900});
      friction(t+.08,2.8,{cutoff:310,volume:.10});
    }else if(kind==='wing-tear'){
      friction(t,.66,{cutoff:490,volume:.31});
      tone(121,t+.14,.8,{type:'sawtooth',volume:.055,cutoff:700});
    }else if(kind==='runner'){
      friction(t,.48,{cutoff:900,volume:.27});
      tone(82,t+.06,.24,{volume:.12,cutoff:420});
    }else if(kind==='hanger'){
      tone(1140,t,.18,{type:'triangle',volume:.16,cutoff:3100});
      tone(1677,t+.026,.25,{volume:.07,cutoff:3500});
    }else if(kind==='cloth-work'){
      friction(t,.82,{cutoff:430,volume:.2});
    }else if(kind==='seam-pick'){
      friction(t,.24,{cutoff:740,volume:.13});
      tone(1530,t+.08,.055,{type:'triangle',volume:.05,cutoff:2700});
    }else if(kind==='head-notice'){
      // The tiny working sounds stop; one dry joint answers at head height.
      friction(t,.14,{cutoff:360,volume:.16});
      tone(96,t+.025,.19,{volume:.035,cutoff:390});
    }else if(kind==='pin-snap'){
      // The chair catches first; the body arrives a fraction later. Keep this
      // on the world bus so only the player's own microphone can call HUSH.
      tone(1420,t,.10,{type:'triangle',volume:.085,cutoff:2800});
      friction(t+.055,.31,{cutoff:720,volume:.34});
      tone(79,t+.12,.40,{type:'sawtooth',volume:.10,cutoff:400});
    }else if(kind==='seam'){
      friction(t,1.1,{cutoff:340,volume:.3});
      tone(93,t+.08,.75,{type:'sawtooth',volume:.055,cutoff:530});
    }else if(kind==='crown-open'){
      // A wet, short pull at the head, followed by the enamel catching once.
      friction(t,.48,{cutoff:460,volume:.28});
      tone(71,t+.06,.36,{type:'triangle',volume:.06,cutoff:320});
      tone(1120,t+.31,.045,{type:'triangle',volume:.028,cutoff:2100});
    }else if(kind==='cover'){
      friction(t,.45,{cutoff:1040,volume:.43});
      tone(68,t+.08,.65,{type:'sawtooth',volume:.12,cutoff:490});
    }else{live.delete(voice);bus.disconnect();panner?.disconnect();return false;}
    const duration=kind==='held-warning'?3.2:kind==='held-strike'?.8:
      kind==='held-release'?.45:kind==='held-clean'?.25:kind==='held-impact'?.65:
      kind==='held-reveal'?1.1:kind==='held-note'?3.6:kind.startsWith('lure-')?2.4:1.4;
    setTimeout(()=>{for(const node of voice.nodes)try{node.disconnect();}catch{}live.delete(voice);},(duration+.5)*1000);
    return true;
  }
  function dispose(){for(const voice of live){for(const source of voice.sources)try{source.stop();}catch{}for(const node of voice.nodes)try{node.disconnect();}catch{}}live.clear();}
  return {play,dispose};
}
