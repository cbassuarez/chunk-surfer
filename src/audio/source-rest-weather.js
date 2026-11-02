import {createBootWeatherAudio} from './boot-weather-audio.js';
import {createThunderVoice} from './thunder.js';
import {assetUrl} from '../platform/paths.js';
import {sourceAcousticCoordinates} from './source-surroundings.js';
import {createStandingTearImpulse} from './standing-tear-dsp.js';
import {SOURCE_REST_BELLS} from '../game/source-rest-judgment.js';

const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const clamp=n=>Math.max(0,Math.min(1,finite(n)));
const EPS=1e-7;
export const SOURCE_REST_WEATHER_AUDIO=Object.freeze({
  bellSamples:Object.freeze(['04','06','08']),bellEncodedByteLimit:2000000,bellGain:.23,bellWet:.16,bellReflectionSeconds:6.8,maxBellTails:6,maxClockStep:.5,
});


/** Same acoustic transition as the existing submerged coastal-car route:
 * 18kHz air -> 430Hz water, a 520Hz water carrier and an 82Hz pressure band.
 * This input belongs only to environmental sound; it never sees the Chaconne. */
export function sourceRestFloodAcousticFrame(flood={},clock=0){
  if(flood?.active===false)flood={};
  const submersion=clamp(flood.submersion??flood.submerged),pressure=clamp(flood.pressure),flow=clamp(flood.flow),bubbles=clamp(flood.bubbles);
  return{submersion,pressure,flow,bubbles,clock:Math.max(0,finite(clock)),filterHz:18000*(1-submersion)+430*submersion,
    mediumGain:1-.22*submersion,rainTransmission:1-.88*submersion,
    waterGain:.065*submersion*(.2+.8*flow)+.012*flow*(1-submersion),pressureGain:.024*submersion*pressure,bubbleGain:.018*submersion*bubbles};
}
export function createSourceRestFloodAudio({context:ctx,destination}={}){
  const supported=!!(ctx?.createGain&&ctx?.createBiquadFilter&&ctx?.createBuffer&&ctx?.createBufferSource&&destination);
  if(!supported)return{input:destination,update(){},pause(){},dispose(){},snapshot:()=>({supported:false})};
  const input=ctx.createGain(),filter=ctx.createBiquadFilter(),output=ctx.createGain();
  filter.type='lowpass';filter.frequency.value=18000;filter.Q.value=.55;output.gain.value=0;
  input.connect(filter).connect(output).connect(destination);
  let disposed=false,carrier=null,bubbleBuffer=null,loops=[],frame=sourceRestFloodAcousticFrame(),startedAt=null,lastClock=null;
  const parameter=(p,value,tau=.12)=>{const at=finite(ctx.currentTime);p.cancelScheduledValues?.(at);if(p.setTargetAtTime)p.setTargetAtTime(value,at,tau);else if(p.setValueAtTime)p.setValueAtTime(value,at);else p.value=value;};
  function stopLoops(){for(const v of loops){try{v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}}loops=[];startedAt=null;}
  function materialBuffers(){
    if(carrier)return;
    const rate=ctx.sampleRate,seconds=6.7,length=Math.max(1,Math.round(rate*seconds));
    carrier=ctx.createBuffer(1,length,rate);bubbleBuffer=ctx.createBuffer(1,length,rate);
    const noise=carrier.getChannelData(0),bubble=bubbleBuffer.getChannelData(0);let seed=11983;
    const releases=[.27,1.43,2.08,3.71,4.06,5.83];
    for(let i=0;i<length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const t=i/rate,n=seed/4294967296*2-1;noise[i]=n*.35;
      // Small, resonant releases, with no human breath/voice sample and no
      // frame-owned trigger queue. Clock-offset looping preserves their phase.
      let value=0;for(let k=0;k<releases.length;k++){
        const age=t-releases[k];if(age<0||age>.34)continue;
        const hz=245+k*47,attack=Math.min(1,age/.012),decay=Math.exp(-age/(.045+k*.008));
        value+=(Math.sin(2*Math.PI*(hz*age+180*age*age))*.48+n*.06)*attack*decay;
      }
      bubble[i]=Math.max(-.65,Math.min(.65,value));
    }
  }
  function startLoops(clock){
    if(loops.length)return;materialBuffers();
    const spec=[['water',carrier,'bandpass',520,.66],['pressure',carrier,'bandpass',82,1.15],['bubbles',bubbleBuffer,'lowpass',1100,.55]];
    for(const[kind,buffer,type,hz,q]of spec){
      const source=ctx.createBufferSource(),band=ctx.createBiquadFilter(),level=ctx.createGain();
      source.buffer=buffer;source.loop=true;band.type=type;band.frequency.value=hz;band.Q.value=q;level.gain.value=0;
      source.connect(band).connect(level).connect(input);
      const v={kind,source,level,nodes:[source,band,level],offset:clock%buffer.duration};loops.push(v);
      try{source.start(finite(ctx.currentTime),v.offset);}catch{stopLoops();return;}
    }
    startedAt=finite(ctx.currentTime);
  }
  function update(flood={},clock=0,{ambience=true}={}){
    if(disposed)return false;frame=sourceRestFloodAcousticFrame(flood,clock);
    if(lastClock!==null&&(frame.clock<lastClock-.001||frame.clock-lastClock>SOURCE_REST_WEATHER_AUDIO.maxClockStep))stopLoops();
    lastClock=frame.clock;
    parameter(filter.frequency,frame.filterHz);parameter(output.gain,frame.mediumGain,.065);
    if(ambience&&frame.waterGain+frame.pressureGain+frame.bubbleGain>.0001)startLoops(frame.clock);
    for(const v of loops)parameter(v.level.gain,ambience?frame[v.kind==='bubbles'?'bubbleGain':v.kind+'Gain']:0,.14);
    return true;
  }
  function pause(){stopLoops();lastClock=null;const at=finite(ctx.currentTime);output.gain.cancelScheduledValues?.(at);if(output.gain.setValueAtTime)output.gain.setValueAtTime(0,at);else output.gain.value=0;}
  return Object.freeze({input,update,pause,snapshot:()=>({supported:true,...frame,loops:loops.map(v=>({kind:v.kind,offset:v.offset})),startedAt}),
    dispose(){if(disposed)return;disposed=true;pause();for(const node of[input,filter,output])try{node.disconnect();}catch{}carrier=bubbleBuffer=null;}});
}

/** Local D/A modal rings retain the recorded CC0 clapper attacks. The original
 * tower bank remains unchanged; only three preprocessed20s local stems decode. A hit has an actual mouth in the scene; its spatial
 * coordinates never borrow or move the game's shared AudioListener. */
export function createSourceRestBellAudio({context:ctx,destination,fetcher=(...args)=>globalThis.fetch(...args),urlFor=assetUrl}={}){
  const buffers=new Map(),pending=new Map(),errors=new Map(),live=new Set(),controllers=new Set();
  let disposed=false,generation=0,impulse=null,played=0,lastStrike=null;
  const ready=!!(ctx?.createGain&&ctx?.createBufferSource&&ctx?.decodeAudioData&&destination);
  const release=v=>{if(!v||v.dead)return;v.dead=true;v.source.onended=null;try{v.source.stop();}catch{}for(const node of v.nodes)try{node.disconnect();}catch{}if(v.convolver)v.convolver.buffer=null;live.delete(v);};
  function pause(){for(const v of [...live])release(v);}
  function load(sample){
    const row=SOURCE_REST_BELLS.find(bell=>bell.sample===sample);if(!row?.audioUrl)return Promise.resolve(false);
    if(buffers.has(sample))return Promise.resolve(true);if(pending.has(sample))return pending.get(sample);
    if(!ready||disposed||errors.has(sample))return Promise.resolve(false);
    const owner=generation,controller=typeof AbortController==='function'?new AbortController():null;
    if(controller)controllers.add(controller);
    const valid=()=>!disposed&&owner===generation;
    const job=Promise.resolve().then(()=>valid()?fetcher(urlFor(row.audioUrl),controller?{signal:controller.signal}:undefined):null)
      .then(async response=>{
        if(!valid()||!response)return null;if(response.ok===false)throw Error(`Bell ${sample}: HTTP ${response.status}`);
        const bytes=await response.arrayBuffer();if(bytes.byteLength>SOURCE_REST_WEATHER_AUDIO.bellEncodedByteLimit)throw Error('Bell exceeds encoded budget');
        return valid()?ctx.decodeAudioData(bytes):null;
      }).then(buffer=>{
        if(!valid()||!buffer)return false;
        if(Math.abs(buffer.duration-row.audioSeconds)>.1||buffer.numberOfChannels!==1)throw Error('Bell differs from canonical tuned mono stem');
        buffers.set(sample,buffer);return true;
      }).catch(error=>{if(valid())errors.set(sample,String(error?.message||error));return false;})
      .finally(()=>{if(controller)controllers.delete(controller);if(pending.get(sample)===job)pending.delete(sample);});
    pending.set(sample,job);return job;
  }
  const prepare=()=>Promise.all(SOURCE_REST_WEATHER_AUDIO.bellSamples.map(load)).then(values=>values.every(Boolean));
  function place(v,state={},acousticFrame=null){
    const position=sourceAcousticCoordinates(v.position,state,acousticFrame),d=position.distance;
    const target=position.source?1/(1+d/70):0,now=finite(ctx.currentTime);
    const set=(param,value)=>{if(!param)return;if(v.placed&&param.setTargetAtTime)param.setTargetAtTime(value,now,.04);else if(param.setValueAtTime)param.setValueAtTime(value,now);else param.value=value;};
    set(v.spatial.gain,target);set(v.filter?.frequency,Math.max(750,Math.max(2200,10500/(1+d/95))*2**(-4*v.muffle)));
    if(v.hrtf){if(v.pan.positionX){set(v.pan.positionX,position.relativeXYZ[0]);set(v.pan.positionY,position.relativeXYZ[1]);set(v.pan.positionZ,position.relativeXYZ[2]);}else v.pan.setPosition?.(...position.relativeXYZ);}
    else set(v.pan?.pan,Math.max(-.9,Math.min(.9,position.relativeXYZ[0]/Math.max(1,d))));
    v.placed=true;v.placement={distance:d,relativeXYZ:position.relativeXYZ,gain:target};
  }
  function update({state={},acousticFrame=null}={}){for(const v of live)place(v,state,acousticFrame);}
  function strike(event={},state={},acousticFrame=null){
    const row=SOURCE_REST_BELLS.find(bell=>bell.sample===String(event.sample)),buffer=buffers.get(String(event.sample));if(disposed||!ready||!buffer||!row)return false;
    if(live.size>=SOURCE_REST_WEATHER_AUDIO.maxBellTails)release(live.values().next().value);
    const source=ctx.createBufferSource(),envelope=ctx.createGain(),spatial=ctx.createGain(),filter=ctx.createBiquadFilter?.(),
      hrtf=ctx.createPanner?.(),pan=hrtf||ctx.createStereoPanner?.(),nodes=[source,envelope,spatial];
    source.buffer=buffer;source.loop=false;if(source.playbackRate)source.playbackRate.value=1;
    const now=finite(ctx.currentTime),muffle=clamp(event.muffle),level=SOURCE_REST_WEATHER_AUDIO.bellGain*clamp(event.energy??1)*(1-.15*muffle);
    envelope.gain.setValueAtTime?.(level,now);if(!envelope.gain.setValueAtTime)envelope.gain.value=level;
    // The processed stem owns its complete20s modal decay. Playback rate stays
    // at1; no runtime transposition changes the recorded clapper timing.
    envelope.gain.setValueAtTime?.(level,now+buffer.duration-.3);envelope.gain.linearRampToValueAtTime?.(0,now+buffer.duration);
    let tail=source;if(filter){filter.type='lowpass';if(filter.Q)filter.Q.value=.55;nodes.push(filter);tail.connect(filter);tail=filter;}
    tail.connect(envelope).connect(spatial);tail=spatial;
    if(pan){nodes.push(pan);if(hrtf){pan.panningModel='HRTF';pan.distanceModel='inverse';pan.rolloffFactor=0;pan.refDistance=1;pan.maxDistance=10000;}tail.connect(pan);tail=pan;}
    tail.connect(destination);
    let convolver=null;
    if(ctx.createConvolver&&ctx.createBuffer){
      impulse??=createStandingTearImpulse(ctx,{decaySeconds:SOURCE_REST_WEATHER_AUDIO.bellReflectionSeconds});
      convolver=ctx.createConvolver();convolver.normalize=false;convolver.buffer=impulse;
      const wet=ctx.createGain();wet.gain.value=SOURCE_REST_WEATHER_AUDIO.bellWet;
      tail.connect(convolver).connect(wet).connect(destination);nodes.push(convolver,wet);
    }
    const v={source,nodes,envelope,level,muffle,spatial,filter,pan,hrtf:!!hrtf,position:{...event.position},convolver,dead:false};
    place(v,state,acousticFrame);live.add(v);
    // A struck tail remains owned and bounded until the source plus its room
    // ends. Pause/dispose disconnect this chain immediately, including its tail.
    source.onended=()=>{v.sourceEnded=true;};v.until=now+buffer.duration+(convolver?SOURCE_REST_WEATHER_AUDIO.bellReflectionSeconds:0);
    try{source.start(now);source.stop(now+buffer.duration);}catch{release(v);return false;}
    played++;lastStrike={id:event.id,bellId:event.bellId,sample:event.sample,note:row.note,frequency:row.frequency,at:event.at,level,muffle,stroke:event.stroke||'open',position:{...event.position},placement:{...v.placement}};
    return true;
  }
  function fade(seconds=.75){const at=finite(ctx.currentTime);for(const v of live){const p=v.envelope?.gain;if(p){p.cancelAndHoldAtTime?.(at);p.cancelScheduledValues?.(at);p.setValueAtTime?.(finite(p.value,v.level),at);p.linearRampToValueAtTime?.(0,at+seconds);}try{v.source.stop(at+seconds);}catch{}v.until=Math.min(v.until,at+seconds+SOURCE_REST_WEATHER_AUDIO.bellReflectionSeconds);}}
  return Object.freeze({prepare,strike,fade,update(input){for(const v of [...live])if(v.until<=ctx.currentTime)release(v);update(input);},pause,
    snapshot:()=>({ready,loaded:[...buffers.keys()],pending:pending.size,errors:Object.fromEntries(errors),live:live.size,played,lastStrike}),
    dispose(){if(disposed)return;disposed=true;generation++;pause();for(const c of controllers)c.abort();controllers.clear();pending.clear();buffers.clear();impulse=null;}});
}

// Reuse the game's standard weather voices and one scored audible clock.
// Sparse visible bell contacts and lightning channels are events, never beds.
export function createSourceRestWeather({getAudio=()=>null,makeVoice=createBootWeatherAudio,
  makeThunder=createThunderVoice,makeBells=createSourceRestBellAudio,makeFlood=createSourceRestFloodAudio,onTrace=()=>{}}={}){
  const voices=new Map(),seen=new Set(),prepared=new Set(),history=[];
  let context=null,destination=null,disposed=false,thunder=null,bells=null,bellWarmup=null,medium=null,lastClock=null,held=true,quiet=true,endingFade=false,lastFlood={},lastMediaClock=0,playedThunder=0,playedBells=0,skipped=0;
  const trace=event=>{history.push(event);if(history.length>64)history.shift();try{onTrace(event);}catch{}};
  const pause=()=>{
    for(const voice of voices.values())voice.update({presence:0,wind:1});
    thunder?.stop();thunder=null;bells?.pause();medium?.pause();prepared.clear();lastClock=null;held=true;
  };
  const clear=()=>{pause();for(const voice of voices.values())voice.stop({fade:.05,thunderTail:0});voices.clear();bells?.dispose();bells=null;bellWarmup=null;medium?.dispose();medium=null;};
  function acquire(){
    const pair=getAudio()||{},ctx=pair.ctx||pair.context,out=pair.destination;
    if(!ctx||!out||ctx.state!=='running')return false;
    if(context!==ctx||destination!==out){clear();context=ctx;destination=out;seen.clear();}
    return true;
  }
  function ensureMedium(){return medium??=makeFlood({context,destination});}
  function ensureBells(){bells??=makeBells({context,destination:ensureMedium().input});return bells;}
  function warmBells(){return bellWarmup??=(ensureBells().prepare());}
  function prepare(){if(disposed||!acquire())return Promise.resolve(false);return warmBells();}
  function update({active=false,hold=false,progress=0,cue=null,state={},acousticFrame=null}={}){
    if(disposed)return false;
    if(hold||!acquire()){pause();return false;}
    held=false;
    if(cue){lastFlood=cue.flood||{};lastMediaClock=finite(cue.clock,lastMediaClock);}
    // Weather settling, leaving its local range, or a temporarily absent score
    // stops new events. It does not erase a bell which has already been struck.
    if(!active||progress>=.95||!cue){
      quiet=true;for(const voice of voices.values())voice.update({presence:0,wind:1});
      medium?.update(lastFlood,lastMediaClock,{ambience:false});bells?.update({state,acousticFrame});lastClock=null;
      if(progress>=.95&&!endingFade){bells?.fade?.(.75);endingFade=true;}
      return false;
    }
    quiet=false;endingFade=false;
    const flood=sourceRestFloodAcousticFrame(cue.flood,cue.clock),environment=ensureMedium();environment.update(cue.flood,cue.clock);
    for(const kind of ['rain','sheets','leaves']){
      const presence=clamp(cue.audio?.[kind])*(kind==='rain'?flood.rainTransmission:1);
      if(presence>0&&!voices.has(kind))voices.set(kind,makeVoice({context,destination:environment.input,kind}));
      voices.get(kind)?.update({presence,wind:finite(cue.wind)});
    }
    const judgment=cue.judgment;
    bells?.update({state,acousticFrame});
    if(!judgment?.active){lastClock=null;return true;}
    const clock=Math.max(0,finite(judgment.clock,finite(cue.clock))),delta=lastClock===null?0:clock-lastClock;
    // Seeking, a suspended source, or a large scene-frame gap must not deliver
    // an accumulated volley of judgment when the player returns.
    const discontinuity=lastClock!==null&&(delta<-.001||delta>SOURCE_REST_WEATHER_AUDIO.maxClockStep);
    if(discontinuity){if(delta<0){thunder?.stop();thunder=null;bells?.pause();prepared.clear();if(!judgment.bellContacts)seen.clear();}skipped++;}
    const from=lastClock===null||discontinuity?clock-EPS:lastClock-EPS;
    lastClock=clock;
    thunder??=makeThunder({context,destination:environment.input});
    const bellOwner=ensureBells();void warmBells();bellOwner.update({state,acousticFrame});
    for(const event of judgment.flashes||[]){
      const at=finite(event.startedAt,finite(event.at)),id='flash:'+event.id;
      if(at<from||at>clock+.25||prepared.has(id))continue;
      if(thunder.prepare(event)!==false)prepared.add(id);
    }
    for(const event of judgment.thunder||[]){
      const at=finite(event.at,finite(event.thunderAt)),id='thunder:'+event.id;
      if(at<from||at>clock+EPS||seen.has(id))continue;
      seen.add(id);if(thunder.strike(event)!==false){playedThunder++;trace({type:'rest-thunder',id:event.id,at,clock,distance:event.distance,delay:finite(event.delay,finite(event.distance)/343),bearing:event.bearing});}
    }
    for(const event of judgment.bellEvents||[]){
      const at=finite(event.at),id='bell:'+event.id;
      // The funeral director has already admitted these exact new contacts.
      // Do not window them again using a differently sampled media clock.
      // Legacy pure judgment cues retain their original clock-window path.
      if(seen.has(id)||!judgment.bellContacts&&(at<from||at>clock+EPS))continue;
      seen.add(id);if(bellOwner.strike(event,state,acousticFrame)!==false){playedBells++;trace({type:'rest-bell',id:event.id,at,clock,bellId:event.bellId,position:event.position});}
      else trace({type:'rest-bell-unavailable',id:event.id,at,clock});
    }
    return true;
  }
  return Object.freeze({update,pause,prepare,
    snapshot:()=>({held,quiet,lastClock,weatherVoices:[...voices.keys()],flood:medium?.snapshot?.()||null,playedThunder,playedBells,skipped,bells:bells?.snapshot?.()||null,history:[...history]}),
    dispose(){if(disposed)return;disposed=true;clear();seen.clear();}});
}
