// WHAT THE FIELD SOUNDS LIKE, all of it made here. Wind, grass, a lark, and his breath,
// deep and clean, the one thing nobody polices out here. Under that, more each visit,
// what can't be coming from here: rain on a roof, water, an indicator still ticking.
// Hearing may outlast the rest. As it goes the lark sticks on one note and repeats,
// exactly, because failing memory reuses what it has.
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const BLEED=Object.freeze({first:0,second:.012,third:.034,fourth:.06,fifth:.095});

function noiseBuffer(context,seconds=4){
  const buffer=context.createBuffer(1,Math.floor(context.sampleRate*seconds),context.sampleRate),data=buffer.getChannelData(0);
  for(let k=0;k<data.length;k++)data[k]=Math.random()*2-1;
  return buffer;
}
// A skylark, as a shape: fast warbling notes with a trill on them, and no gaps to speak of.
function larkBuffer(context,seconds=6){
  const rate=context.sampleRate,buffer=context.createBuffer(1,Math.floor(rate*seconds),rate),data=buffer.getChannelData(0);
  let at=0,phase=0;
  while(at<data.length){
    const length=Math.floor(rate*(.05+Math.random()*.16)),pitch=2500+Math.random()*2900,bend=(Math.random()-.5)*1400,trill=18+Math.random()*30,level=.25+Math.random()*.75;
    for(let k=0;k<length&&at+k<data.length;k++){
      const u=k/length,f=pitch+bend*u+160*Math.sin(k/rate*Math.PI*2*trill);
      phase+=f/rate*Math.PI*2;
      data[at+k]=Math.sin(phase)*Math.sin(u*Math.PI)*level*.4;
    }
    at+=length+(Math.random()<.14?Math.floor(rate*.05):0);
  }
  return buffer;
}
export function createMemoryFieldAudio({context,destination}={}){
  let bus=null,running=[],noise=null,lark=null,larkSource=null,larkGain=null,windGain=null,windFilter=null,rustleGain=null,rainGain=null,waterGain=null;
  let nextBreath=0,nextTick=0,stuck=false,paused=false,stopped=false,visitId=null,started=false;const knocked=new Set();
  const now=()=>context?.currentTime||0;
  function loop(buffer,{gain=0,filter=null,frequency=800,q=.7}={}){
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    const level=context.createGain();level.gain.value=gain;
    let node=source,shape=null;
    if(filter){shape=context.createBiquadFilter();shape.type=filter;shape.frequency.value=frequency;shape.Q.value=q;node.connect(shape);node=shape;}
    node.connect(level);level.connect(bus);source.start();running.push(source);
    return{source,level,shape};
  }
  function burst({type='bandpass',from=800,to=800,q=1,gain=.1,attack=.01,hold=.05,release=.2,at=now()}){
    if(!bus||!noise)return;
    const source=context.createBufferSource();source.buffer=noise;source.loop=true;
    const filter=context.createBiquadFilter();filter.type=type;filter.Q.value=q;filter.frequency.setValueAtTime(from,at);filter.frequency.linearRampToValueAtTime(to,at+attack+hold+release);
    const level=context.createGain();level.gain.setValueAtTime(0,at);level.gain.linearRampToValueAtTime(gain,at+attack);level.gain.setValueAtTime(gain,at+attack+hold);level.gain.linearRampToValueAtTime(0,at+attack+hold+release);
    source.connect(filter);filter.connect(level);level.connect(bus);source.start(at,Math.random()*3);source.stop(at+attack+hold+release+.05);
  }
  function thud({from=120,to=60,gain=.3,seconds=.14,at=now()}){
    if(!bus)return;
    const osc=context.createOscillator();osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+seconds);
    const level=context.createGain();level.gain.setValueAtTime(gain,at);level.gain.exponentialRampToValueAtTime(.0001,at+seconds);
    osc.connect(level);level.connect(bus);osc.start(at);osc.stop(at+seconds+.02);
  }
  function breathe(depth=1,at=now(),decay=0){
    const inhale=1.5+decay*.9,exhale=2+decay*.7,level=.055*depth*(1+decay*.8);
    burst({type:'bandpass',from:900,to:1700,q:.8,gain:level,attack:inhale*.55,hold:inhale*.15,release:inhale*.3,at});
    burst({type:'bandpass',from:900,to:420,q:.9,gain:level*.72,attack:.2,hold:exhale*.3,release:exhale*.6,at:at+inhale+.08});
    return inhale+exhale;
  }
  return{
    start(visit){
      if(!context||started)return;started=true;visitId=visit?.id||null;
      bus=context.createGain();bus.gain.setValueAtTime(0,now());bus.gain.linearRampToValueAtTime(1,now()+.5);bus.connect(destination);
      noise=noiseBuffer(context);lark=larkBuffer(context);
      const wind=loop(noise,{filter:'bandpass',frequency:520,q:.5,gain:.05});windGain=wind.level;windFilter=wind.shape;
      rustleGain=loop(noise,{filter:'highpass',frequency:3600,gain:.012}).level;
      rainGain=loop(noise,{filter:'highpass',frequency:2600,gain:0}).level;
      waterGain=loop(noise,{filter:'lowpass',frequency:210,gain:0}).level;
      larkSource=context.createBufferSource();larkSource.buffer=lark;larkSource.loop=true;
      larkGain=context.createGain();larkGain.gain.value=.05;larkSource.connect(larkGain);larkGain.connect(bus);larkSource.start();running.push(larkSource);
      // The first thing is always the breath in.
      nextBreath=now()+breathe(visit?.kind==='breath'?1.7:1.1,now()+.02)+.3;
      nextTick=now()+1;
    },
    update(state,visit){
      if(!bus||paused||stopped)return;
      const d=clamp01(state?.decay),t=now();
      const bleed=(BLEED[visit?.id]??0)*(1+d*.9),held=state?.released!=null;
      const set=(param,value,span=.5)=>param?.setTargetAtTime?.(value,t,span);
      set(windGain?.gain,(.05+.02*Math.sin(t*.27))*(1-d*.92));set(rustleGain?.gain,.012*(1-d));
      set(windFilter?.frequency,500+160*Math.sin(t*.19));
      set(larkGain?.gain,d>.86?0:.05*(1-d*.3));
      set(rainGain?.gain,bleed*.5);set(waterGain?.gain,bleed*(1.5+Math.sin(t*.4)*.5)*(held?2.2:1));
      if(!stuck&&d>.42&&larkSource){stuck=true;const at=Math.random()*5;larkSource.loopStart=at;larkSource.loopEnd=at+.2;}
      if(t>=nextBreath)nextBreath=t+breathe(1,t,d)+.4+d*1.6;
      if(d>.38&&t>=nextTick&&visit?.door){nextTick=t+.72;thud({from:1500,to:1100,gain:.012+.018*d,seconds:.018,at:t});}
      // Somebody at the glass. In the last of it they are still there.
      const knockAt=visit?.id==='fourth'?[24]:visit?.id==='fifth'?[12,31]:[];
      for(const at of knockAt)if(state.elapsed>=at&&!knocked.has(at)){knocked.add(at);playCabBleed(context,bus,'knock',{level:.9});}
    },
    event(event={}){
      if(!bus||paused)return;
      const t=now();
      if(event.type==='try'){thud({from:150,to:64,gain:.34,seconds:.16,at:t});burst({type:'bandpass',from:1900,to:1200,q:2,gain:.07,attack:.003,hold:.012,release:.07,at:t});burst({type:'lowpass',from:180,to:120,gain:.05,attack:.05,hold:.3,release:.7,at:t+.04});}
      else if(event.type==='dead')burst({type:'bandpass',from:2600,to:2200,q:3,gain:.022,attack:.002,hold:.004,release:.03,at:t});
      else if(event.type==='give'){thud({from:90,to:40,gain:.3,seconds:.5,at:t});burst({type:'bandpass',from:4200,to:900,q:.7,gain:.09,attack:.08,hold:1.1,release:1.8,at:t});burst({type:'lowpass',from:600,to:240,gain:.12,attack:.4,hold:2,release:3,at:t+.4});}
      else if(event.type==='through')breathe(1.4,t);
    },
    setPaused(value){
      const next=!!value;if(next===paused||!bus)return;paused=next;
      // A pause during the initial half-second must cancel its pending ramp
      // to full level; otherwise that old ramp can unmute a held scene.
      const t=now();
      if(typeof bus.gain.cancelAndHoldAtTime==='function')bus.gain.cancelAndHoldAtTime(t);
      else bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(next?0:1,t,.05);
    },
    stop(){
      if(stopped)return;stopped=true;
      if(!bus)return;
      const t=now(),old=bus,sources=running;running=[];
      old.gain.cancelScheduledValues(t);old.gain.setTargetAtTime(0,t,.12);
      setTimeout(()=>{for(const source of sources)try{source.stop();}catch{}try{old.disconnect();}catch{}},900);
    },
    diagnostics:()=>({started,stopped,paused,stuck,visit:visitId}),
  };
}
// A seep's sound, on its own, in the world. A breath in, or metal, and it's over.
export function playMemorySeepSound(context,destination,set='pastoral',{strength=1}={}){
  if(!context||!destination)return false;
  const t=context.currentTime,seconds=set==='carnage'?.34:1.1,buffer=context.createBuffer(1,Math.floor(context.sampleRate*seconds),context.sampleRate),data=buffer.getChannelData(0);
  for(let k=0;k<data.length;k++)data[k]=Math.random()*2-1;
  const source=context.createBufferSource();source.buffer=buffer;
  const filter=context.createBiquadFilter(),level=context.createGain();
  if(set==='carnage'){filter.type='bandpass';filter.Q.value=1.4;filter.frequency.setValueAtTime(2400,t);filter.frequency.exponentialRampToValueAtTime(380,t+.28);level.gain.setValueAtTime(.16*strength,t);level.gain.exponentialRampToValueAtTime(.0001,t+.32);}
  else{filter.type='bandpass';filter.Q.value=.8;filter.frequency.setValueAtTime(800,t);filter.frequency.linearRampToValueAtTime(1800,t+.9);level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(.06*strength,t+.55);level.gain.linearRampToValueAtTime(0,t+1.05);}
  source.connect(filter);filter.connect(level);level.connect(destination);source.start(t);source.stop(t+seconds);
  return true;
}
// THE CAB, HEARD FROM WHEREVER HE IS. Quiet, and through something. It never reaches the
// tape: this is on the bus he hears, and the machine goes on reading the empty room.
export function playCabBleed(context,destination,kind='indicator',{level=1}={}){
  if(!context||!destination)return false;
  const t=context.currentTime,bus=context.createGain(),through=context.createBiquadFilter();
  through.type='lowpass';through.frequency.value=kind==='knock'?2200:1500;through.connect(bus);bus.connect(destination);
  bus.gain.value=clamp01(level);
  const noise=seconds=>{const buffer=context.createBuffer(1,Math.floor(context.sampleRate*seconds),context.sampleRate),data=buffer.getChannelData(0);for(let k=0;k<data.length;k++)data[k]=Math.random()*2-1;const source=context.createBufferSource();source.buffer=buffer;return source;};
  const tone=(from,to,gain,seconds,at)=>{const osc=context.createOscillator(),amp=context.createGain();osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+seconds);amp.gain.setValueAtTime(gain,at);amp.gain.exponentialRampToValueAtTime(.0001,at+seconds);osc.connect(amp);amp.connect(through);osc.start(at);osc.stop(at+seconds+.02);};
  const swell=(type,from,to,gain,attack,hold,release,at,q=.8)=>{const source=noise(attack+hold+release+.05),filter=context.createBiquadFilter(),amp=context.createGain();filter.type=type;filter.Q.value=q;filter.frequency.setValueAtTime(from,at);filter.frequency.linearRampToValueAtTime(to,at+attack+hold+release);amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(gain,at+attack);amp.gain.setValueAtTime(gain,at+attack+hold);amp.gain.linearRampToValueAtTime(0,at+attack+hold+release);source.connect(filter);filter.connect(amp);amp.connect(through);source.start(at);source.stop(at+attack+hold+release+.05);};
  let ends=1;
  if(kind==='indicator'){for(let k=0;k<7;k++)tone(k%2?1320:1720,k%2?1100:1420,.03,.022,t+k*.38);ends=3;}
  else if(kind==='wipers'){for(let k=0;k<3;k++){swell('bandpass',700,1100,.018,.28,.1,.3,t+k*1.15,1.2);tone(120,70,.03,.08,t+k*1.15+.7);}ends=4;}
  else if(kind==='radio'){swell('bandpass',1400,1100,.008,.05,2.2,.2,t,2);for(let k=0;k<9;k++)swell('bandpass',500+(k%3)*280,560+(k%4)*240,.016+.012*(k%2),.04,.08,.1,t+.12+k*.26,6);ends=3;}
  else if(kind==='water'){swell('lowpass',220,140,.1,1.2,1.2,1.6,t);for(let k=0;k<7;k++)tone(240+k*60,520+k*90,.018,.07,t+.5+k*.33);ends=4.5;}
  else if(kind==='knock'){for(const at of[0,.24,.5]){tone(1180,620,.11,.05,t+at);tone(260,150,.09,.07,t+at);}swell('bandpass',520,430,.012,.2,.8,.4,t+1.5,5);swell('bandpass',1280,1000,.008,.2,.8,.4,t+1.5,5);ends=3.2;}
  setTimeout(()=>{try{bus.disconnect();through.disconnect();}catch{}},(ends+.5)*1000);
  return true;
}
// Hearing goes the same way. A high ringing climbs out of nothing, the room thins under
// it, and at the top there is a thump that isn't anywhere.
export function playNeuralSound(context,destination,{seconds=1,strength=1}={}){
  if(!context||!destination)return false;
  const t=context.currentTime,bus=context.createGain();bus.gain.value=clamp01(strength);bus.connect(destination);
  for(const[freq,gain]of[[6100,.018],[7430,.024],[9160,.012]]){
    const osc=context.createOscillator(),amp=context.createGain();osc.frequency.setValueAtTime(freq*.97,t);osc.frequency.linearRampToValueAtTime(freq*1.03,t+seconds);
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(gain,t+seconds*.9);amp.gain.linearRampToValueAtTime(0,t+seconds+.5);
    osc.connect(amp);amp.connect(bus);osc.start(t);osc.stop(t+seconds+.55);
  }
  const low=context.createOscillator(),lowAmp=context.createGain();low.frequency.setValueAtTime(70,t+seconds*.92);low.frequency.exponentialRampToValueAtTime(28,t+seconds+.5);
  lowAmp.gain.setValueAtTime(0,t+seconds*.9);lowAmp.gain.linearRampToValueAtTime(.26,t+seconds*.95);lowAmp.gain.exponentialRampToValueAtTime(.0001,t+seconds+.6);
  low.connect(lowAmp);lowAmp.connect(bus);low.start(t+seconds*.9);low.stop(t+seconds+.65);
  setTimeout(()=>{try{bus.disconnect();}catch{}},(seconds+1)*1000);
  return true;
}
