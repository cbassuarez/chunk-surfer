import {assetUrl} from '../platform/paths.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,finite(value)));
export const OPENING_ARRIVAL_AUDIO=Object.freeze({gain:.5,maxVoices:6,maxContinuousSources:7,
  samples:Object.freeze({door:'audio/game/door_close.mp3',step:'audio/game/bunch-of-footsteps-sounds.mp3'})});

// The ordinary cabin subset of SourceDriveAcoustics: the same speed/load,
// road-contact and blade-travel responses, without its receiver, programmes,
// recording graph or Source pressure material. No audio clock drives a pose.
export function createOpeningArrivalAudio({getAudio=()=>null,fetcher=globalThis.fetch,urlFor=assetUrl}={}){
  let ctx=null,destination=null,graph=null,disposed=false,active=false,epoch=0,lastGear=null,lastWiper=null,stepIndex=0;
  const buffers=new Map(),pending=new Map(),errors=new Map(),voices=new Set(),seen=new Set(),history=[];
  let mix={speed:0,engineHz:0,engineGain:0,roadGain:0,wiperGain:0,rainGain:0};
  const trace=row=>{history.push({...row,time:ctx?.currentTime||0});if(history.length>64)history.shift();};
  const disconnect=nodes=>{for(const node of nodes)try{node.disconnect?.();}catch{}};
  function clearVoice(voice){if(!voices.delete(voice))return;try{voice.source.stop();}catch{}disconnect(voice.nodes);}
  function stop(){
    active=false;for(const voice of [...voices])clearVoice(voice);
    if(graph){for(const source of graph.sources)try{source.stop();}catch{}disconnect(graph.nodes);graph=null;}
    lastGear=lastWiper=null;
    mix={...mix,engineGain:0,roadGain:0,wiperGain:0,rainGain:0};
  }
  function acquire(){
    if(disposed)return false;let pair;try{pair=getAudio();}catch{return false;}
    const context=pair?.ctx||pair?.context,out=pair?.destination||pair?.output;
    if(!context||!out||context.state&&context.state!=='running')return false;
    if(context!==ctx||out!==destination){stop();epoch++;pending.clear();buffers.clear();errors.clear();ctx=context;destination=out;}
    return true;
  }
  function load(kind){
    if(buffers.has(kind))return Promise.resolve(true);if(pending.has(kind))return pending.get(kind);
    const context=ctx,generation=epoch;
    if(!context?.decodeAudioData||typeof fetcher!=='function')return Promise.resolve(false);
    const job=Promise.resolve().then(()=>fetcher(urlFor(OPENING_ARRIVAL_AUDIO.samples[kind]))).then(response=>{
      if(!response?.ok)throw Error('Opening '+kind+' sample unavailable');return response.arrayBuffer();
    }).then(bytes=>context.decodeAudioData(bytes)).then(buffer=>{
      if(disposed||generation!==epoch||context!==ctx)return false;
      if(!Number.isFinite(buffer?.duration)||buffer.duration<=0)throw Error('Invalid opening '+kind+' sample');
      buffers.set(kind,buffer);errors.delete(kind);return true;
    }).catch(error=>{if(!disposed&&generation===epoch)errors.set(kind,String(error?.message||error));return false;})
      .finally(()=>{if(pending.get(kind)===job)pending.delete(kind);});
    pending.set(kind,job);return job;
  }
  async function prepare(){if(!acquire())return false;const results=await Promise.all(['door','step'].map(load));return results.every(Boolean);}
  function ensureGraph(){
    if(graph)return graph;
    const nodes=[],sources=[],own=node=>(nodes.push(node),node),out=own(ctx.createGain());out.gain.value=OPENING_ARRIVAL_AUDIO.gain;out.connect(destination);
    const noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*3),ctx.sampleRate),data=noise.getChannelData(0);let seed=11983;
    for(let n=0;n<data.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[n]=(seed/4294967296*2-1)*.35;}
    function loop(type,hz,pan){
      const source=own(ctx.createBufferSource()),filter=own(ctx.createBiquadFilter()),gain=own(ctx.createGain()),panner=ctx.createStereoPanner?own(ctx.createStereoPanner()):null;
      source.buffer=noise;source.loop=true;filter.type=type;filter.frequency.value=hz;filter.Q.value=.7;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);if(panner){panner.pan.value=pan;gain.connect(panner);panner.connect(out);}else gain.connect(out);
      sources.push(source);return{source,filter,gain};
    }
    const road=loop('lowpass',650,0),roof=loop('bandpass',2450,.08),glass=loop('highpass',4200,-.15),wind=loop('lowpass',360,-.22),wiper=loop('bandpass',1050,-.16);
    const engineFilter=own(ctx.createBiquadFilter()),engineGain=own(ctx.createGain());engineFilter.type='lowpass';engineFilter.frequency.value=180;engineGain.gain.value=0;engineFilter.connect(engineGain);engineGain.connect(out);
    const engine=own(ctx.createOscillator()),harmonic=own(ctx.createOscillator()),harmonicGain=own(ctx.createGain());engine.type='triangle';harmonic.type='sawtooth';harmonicGain.gain.value=.14;
    engine.connect(engineFilter);harmonic.connect(harmonicGain);harmonicGain.connect(engineFilter);sources.push(engine,harmonic);
    graph={nodes,sources,out,noise,road,roof,glass,wind,wiper,engine,engineFilter,engineGain,harmonic};
    for(const source of sources)source.start();return graph;
  }
  function transient(kind,{sample=null,gain=.12,seconds=.12,hz=800,pan=.5,offset=0}={}){
    if(!active||!graph||voices.size>=OPENING_ARRIVAL_AUDIO.maxVoices)return false;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain(),panner=ctx.createStereoPanner?.(),nodes=[source,filter,envelope,...(panner?[panner]:[])],now=ctx.currentTime;
    source.buffer=sample||graph.noise;filter.type=sample?'lowpass':'bandpass';filter.frequency.value=sample?8000:hz;filter.Q.value=.7;
    const duration=Math.max(.035,Math.min(seconds,source.buffer.duration-offset));if(!Number.isFinite(duration)||duration<=0)return false;
    envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(clamp(gain,0,.4),now+.004);envelope.gain.setValueAtTime(clamp(gain,0,.4),now+duration-.025);envelope.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(filter);filter.connect(envelope);if(panner){panner.pan.value=clamp(pan,-.9,.9);envelope.connect(panner);panner.connect(graph.out);}else envelope.connect(graph.out);
    const voice={source,nodes,until:now+duration+.02,kind};voices.add(voice);source.onended=()=>clearVoice(voice);
    try{source.start(now,offset,duration);source.stop(voice.until);}catch{clearVoice(voice);return false;}
    trace({type:kind,sample:!!sample});return true;
  }
  function event(value={},state={}){
    if(!active||disposed||!graph||ctx.state&&ctx.state!=='running')return false;
    const raw=String(value.type||value.kind||value),kind=raw.replace(/^opening-vehicle-/,'');
    const id=value.id!=null?raw+':'+String(value.id)+':'+String(value.serial??value.seconds??''):null;if(id&&seen.has(id))return false;
    let played=false;
    if(kind==='door-open'||kind==='hinge')played=transient('door-open',{gain:.15,seconds:.43,hz:380,pan:.65});
    else if(kind==='door-close'){const sample=buffers.get('door');played=transient(kind,{sample,gain:sample?.28:.22,seconds:sample?Math.min(1.42,sample.duration):.2,hz:140,pan:.65});}
    else if(kind==='exit-step'||kind==='step'){
      const sample=buffers.get('step'),duration=.24,offset=sample?((stepIndex++*.713)%Math.max(.001,sample.duration-duration)):0;
      played=transient('exit-step',{sample,gain:.16,seconds:duration,hz:250,pan:.25,offset});
    }else if(['handbrake','parked','latch','gear-engagement','wiper-return'].includes(kind))played=transient(kind,{gain:kind==='wiper-return'?.045:.10,seconds:kind==='parked'?.14:.07,hz:kind==='gear-engagement'?180:kind==='wiper-return'?720:1250,pan:kind==='handbrake'?-.2:.4});
    else if(kind==='contact')played=transient(kind,{gain:.10+.18*clamp(value.impactSpeed/4),seconds:.15,hz:260,pan:clamp(value.normal?.x,-.8,.8)});
    if(played&&id){seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value);}return played;
  }
  function update({dt=0,state=null,weather=null,paused=false,ready=false}={}){
    if(disposed)return false;
    if(paused||!ready||!state||!acquire()){stop();return false;}
    const drive=state.drive||state,w=weather||state.weather||{},g=ensureGraph();active=true;
    for(const voice of [...voices])if(voice.until<=ctx.currentTime)clearVoice(voice);
    const target=(param,value,seconds=.08)=>{param.cancelScheduledValues?.(ctx.currentTime);param.setTargetAtTime(clamp(value,0,18000),ctx.currentTime,seconds);};
    const speed=Math.abs(finite(drive.speed)),load=clamp(drive.engineLoad),throttle=clamp(drive.throttle),on=drive.engineOn!==false&&!['exiting','closed','montage','complete'].includes(state.phase),motion=clamp(speed/16),wet=clamp(w.roadWetness??.35),rain=clamp(w.rain??state.rain??.26),door=clamp(state.doorOpen);
    const rpm=clamp(850+speed*(drive.gear<0?185:105)+load*450+(speed<.5?throttle*250:0),650,4800),engineGain=on?(.016+load*.031+motion*.006):0;
    target(g.engine.frequency,rpm/30);target(g.harmonic.frequency,rpm/15);target(g.engineFilter.frequency,130+load*290+throttle*70);target(g.engineGain.gain,engineGain);
    const rough=drive.surface==='verge'?1:drive.surface==='shoulder'?.55:0,roadGain=(.14+rough*.085+wet*.035)*motion;
    target(g.road.gain.gain,roadGain);target(g.road.filter.frequency,430+speed*25+rough*850+wet*speed*12);
    target(g.roof.gain.gain,rain*(.075+.035*door));target(g.glass.gain.gain,rain*(.025+speed*.0018));target(g.wind.gain.gain,(.008+motion*.045)*(.6+door*.7));target(g.wind.filter.frequency,150+motion*620+door*250);
    const blade=w.wiperAngles?.[0]??drive.wiperAngles?.[0],moving=!!(w.wiperMoving??drive.wiperMoving),seconds=clamp(dt,0,.25),clock=finite(drive.elapsed??state.elapsed),previous=lastWiper;let velocity=0,direction=0;
    if(moving&&Number.isFinite(blade)&&previous&&seconds>0&&clock>=previous.clock){velocity=Math.abs(blade-previous.angle)/seconds;direction=Math.sign(blade-previous.angle);if(direction&&previous.direction&&direction!==previous.direction)event({type:'wiper-return'});}
    const wiperGain=moving?clamp(velocity/2.5)*(.009+(1-wet)*.016):0;target(g.wiper.gain.gain,wiperGain,.035);lastWiper=Number.isFinite(blade)?{angle:blade,direction:direction||previous?.direction||0,clock}:null;
    if(lastGear!=null&&lastGear!==drive.gear)event({type:'gear-engagement'});lastGear=drive.gear;
    // brakeHold is the simulated service pedal, not a physical handbrake
    // lever. Only the controller's explicit parked/contact event sounds it.
    mix={speed,engineHz:rpm/30,engineGain,roadGain,wiperGain,rainGain:rain*.075};return true;
  }
  return{prepare,update,event,stop,pause:stop,dispose(){if(disposed)return;stop();disposed=true;epoch++;pending.clear();buffers.clear();seen.clear();},
    snapshot:()=>({active,disposed,containsMusic:false,continuousSources:graph?.sources.length||0,voices:voices.size,loaded:[...buffers.keys()],pending:pending.size,errors:[...errors],mix:{...mix},history:history.map(row=>({...row})),provenance:'Existing local door/footstep samples; procedural cabin/hinge/contact responses. No bird or radio programme.'})};
}
