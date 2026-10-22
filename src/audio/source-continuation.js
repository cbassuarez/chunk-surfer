// Simulation events own the clanks. There are no fetches, timers or recursive
// audio retries, and every live/scheduled voice is released on pause or exit.
export function createSourceContinuationAudio({getAudio=()=>null}={}){
  let context=null,destination=null,bed=null,key=null,active=false,eventCount=0;
  const voices=new Set();
  function release(v){if(!v||v.dead)return;v.dead=true;try{v.source.onended=null;v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}voices.delete(v);}
  function stop(){for(const v of [...voices])release(v);bed=null;active=false;key=null;}
  function available(){const a=getAudio();if(!a?.ctx||a.ctx.state!=='running'||!a.destination){stop();return false;}
    if(context!==a.ctx||destination!==a.destination){stop();context=a.ctx;destination=a.destination;}return true;}
  function voice(hz,gain,duration=null,pan=0){
    if(!available()||voices.size>=12)return null;
    const source=context.createOscillator(),amp=context.createGain(),filter=context.createBiquadFilter(),panner=context.createStereoPanner?.();
    source.type='triangle';source.frequency.value=hz;filter.type='lowpass';filter.frequency.value=duration===null?160:2400;
    const v={source,amp,nodes:[source,filter,amp,...(panner?[panner]:[])],dead:false};voices.add(v);
    source.connect(filter).connect(amp);if(panner){panner.pan.value=Math.max(-.9,Math.min(.9,pan));amp.connect(panner).connect(destination);}else amp.connect(destination);
    const at=context.currentTime;amp.gain.setValueAtTime(duration===null?gain:.00001,at);
    if(duration!==null){amp.gain.exponentialRampToValueAtTime(gain,at+.015);amp.gain.exponentialRampToValueAtTime(.00001,at+duration);source.frequency.exponentialRampToValueAtTime(Math.max(25,hz*.42),at+duration);}
    source.onended=()=>release(v);source.start(at);if(duration!==null)source.stop(at+duration+.02);return v;
  }
  return{
    event(event,state){
      if(!available())return;
      const type=String(event?.type||'');
      if(!/warn|clos|weight|fall|drop|land|door|recover|capture|return|phase|inspect/.test(type))return;
      eventCount++;
      const pan=Number.isFinite(event.x)?(event.x-(state?.x||0))/12:0;
      if(/warn|clos|weight/.test(type)){voice(117,.045,.8,pan);voice(740,.020,.35,pan);}
      else if(/land|capture|recover/.test(type)){voice(71,.050,.55,pan);voice(390,.018,.22,pan);}
      else if(/door/.test(type))voice(182,.028,.65,pan);
      else voice(290,.018,.28,pan);
    },
    update({state,paused=false,ready=false}={}){
      if(paused||!ready||!state||!available()){stop();return;}
      active=true;const next=state.phase==='catch'?'catch':'return';
      if(next!==key){if(bed)release(bed);key=next;bed=voice(next==='catch'?47:61,.008);}
    },
    pause:stop,stop,dispose:stop,
    snapshot:()=>({active,voices:voices.size,events:eventCount,kind:'source-continuation'}),
  };
}
