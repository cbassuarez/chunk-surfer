import {assetUrl} from '../platform/paths.js';

export const OPENING_CRASH_AFTERMATH=Object.freeze({seconds:9.4,
  musicBox:'music-box/phrases/phrase_1.wav',musicBoxStart:.34,musicBoxEnd:8.8,
  cracks:Object.freeze([.18,1.02,2.66,4.48,6.12]),
  provenance:'Seb\'s recorded mechanical music box; procedural dry, close bodily cracks.'});
const safe=(node,method,...args)=>{try{node?.[method]?.(...args);}catch(_){};};

// This is nonmusical close foley, not a pitched impact stinger. A small loaded
// joint releases twice, then the tissue/fabric damps it. Deterministic PCM.
export function openingBoneCrackBuffer(context,index=0){
  const rate=context.sampleRate,seconds=.19,buffer=context.createBuffer(1,Math.ceil(seconds*rate),rate),data=buffer.getChannelData(0);
  let seed=(0x6b6e65+index*991)>>>0,low=0;
  for(let i=0;i<data.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1,t=i/rate;
    low+=(noise-low)*.24;
    const release=Math.exp(-t/.012)+.44*Math.exp(-Math.max(0,t-.024)/.016)*(t>=.024?1:0);
    const tissue=Math.exp(-t/.052)*.14;
    data[i]=(low*.72+(noise-low)*.28)*(release+tissue)*Math.min(1,t/.00065)*.65;
  }
  return buffer;
}

export function createOpeningCrashAftermathAudio({context,destination,fetcher=globalThis.fetch,resolve=assetUrl}={}){
  if(!context?.createGain||!destination)return null;
  const out=context.createGain();out.gain.value=1;out.connect(destination);
  const cracks=OPENING_CRASH_AFTERMATH.cracks.map((at,index)=>({id:`crack-${index}`,at,seconds:.19,buffer:openingBoneCrackBuffer(context,index),gain:index===0?.28:.17+index*.013,played:false}));
  const box={id:'box',at:OPENING_CRASH_AFTERMATH.musicBoxStart,seconds:OPENING_CRASH_AFTERMATH.musicBoxEnd-OPENING_CRASH_AFTERMATH.musicBoxStart,buffer:null,gain:.42,played:false};
  const events=[box,...cracks],voices=new Map();let disposed=false,held=false,time=0,ready=false,error=null;
  const retire=id=>{const v=voices.get(id);if(!v)return;voices.delete(id);safe(v.source,'stop');safe(v.source,'disconnect');safe(v.gain,'disconnect');};
  function sync(){
    if(disposed||held)return;
    for(const event of events){
      const age=time-event.at;
      if(age>=event.seconds){event.played=true;retire(event.id);continue;}
      if(age<0||!event.buffer||voices.has(event.id)||event.played)continue;
      // A late decoder may join the continuing box at the correct position;
      // missed cracks are gone. Never deliver a burst of queued impacts.
      if(event!==box&&age>.1){event.played=true;continue;}
      const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime,remaining=event.seconds-age;
      source.buffer=event.buffer;source.loop=false;
      gain.gain.setValueAtTime(event.gain,now);
      if(event===box){
        gain.gain.setValueAtTime(event.gain*Math.min(1,Math.max(0,age/.4),remaining/1.8),now);
        if(age<.4)gain.gain.linearRampToValueAtTime(event.gain,now+.4-age);
        const fadeAt=Math.max(0,event.seconds-1.8-age);
        if(fadeAt>0)gain.gain.setValueAtTime(event.gain,now+fadeAt);
        gain.gain.linearRampToValueAtTime(0,now+remaining);
      }
      source.connect(gain);gain.connect(out);voices.set(event.id,{source,gain});
      source.onended=()=>{if(voices.get(event.id)?.source===source){voices.delete(event.id);event.played=true;}safe(source,'disconnect');safe(gain,'disconnect');};
      try{source.start(now,Math.max(0,age),remaining);}catch(_){retire(event.id);event.played=true;}
    }
  }
  const pending=Promise.resolve().then(()=>fetcher(resolve(OPENING_CRASH_AFTERMATH.musicBox)))
    .then(response=>{if(!response?.ok)throw Error('Opening music box unavailable');return response.arrayBuffer();})
    .then(bytes=>context.decodeAudioData(bytes)).then(buffer=>{if(disposed)return false;box.buffer=buffer;ready=true;sync();return true;})
    .catch(reason=>{error=String(reason?.message||reason);return false;});
  return{
    pending,
    update(value){time=Math.max(time,Number(value)||0);sync();},
    setPaused(value){const next=!!value;if(next===held)return;held=next;if(held)for(const id of [...voices.keys()])retire(id);else sync();},
    dispose(){if(disposed)return;disposed=true;for(const id of [...voices.keys()])retire(id);safe(out,'disconnect');},
    snapshot(){return{time,held,ready,disposed,error,voices:voices.size,provenance:OPENING_CRASH_AFTERMATH.provenance};},
  };
}
