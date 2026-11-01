import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';
import {sourceRestAfflictionFrame} from '../game/source-rest-affliction.js';
import {createStandingTearImpulse} from './standing-tear-dsp.js';

const unit=n=>Math.max(0,Math.min(1,Number(n)||0)),EPS=1e-7;
export const SOURCE_REST_AFFLICTION_AUDIO=Object.freeze({lookahead:.24,tickMs:20,curveSamples:48,envelopeStep:.004,maxVoices:12,ceiling:.88});
const safe=(node,method,...args)=>{try{node?.[method]?.(...args);}catch{}};
const set=(param,value,time)=>{if(param?.setValueAtTime)param.setValueAtTime(value,time);else if(param)param.value=value;};
const clear=(param,value,time)=>{if(param?.cancelAndHoldAtTime)safe(param,'cancelAndHoldAtTime',time);else safe(param,'cancelScheduledValues',time);set(param,value,time);};
const target=(param,value,time,seconds=.035)=>{if(param?.setTargetAtTime)param.setTargetAtTime(value,time,seconds);else set(param,value,time);};
const endOf=(row,duration)=>row.endPolicy==='track-end'?duration:row.end;

// The envelope is an interruption OF the actual performance. Its short
// loss/return and feed-forward delayed fragments do not synthesize new notes.
export function sourceRestAfflictionAudioFrame(time,{active=true,duration=SOURCE_REST_PERFORMANCE.duration,progress=0}={}){
  const cue=sourceRestAfflictionFrame({currentTime:time,duration,progress,active});
  let fracture=0;
  if(active)for(const row of SOURCE_REST_PERFORMANCE.annotations){
    if(row.type!=='mistake')continue;const age=time-row.start;
    if(age<0||age>.34)continue;
    const severity=row.severity/3,attack=Math.min(1,age/.004),tail=Math.exp(-age/(.045+.025*severity)),
      tearing=age<.13?.40+.60*Math.pow(Math.sin(age*(107+row.severity*11)),2):1;
    fracture=Math.max(fracture,attack*tail*tearing*(.66+.34*severity));
  }
  const strain=unit(cue.strain),pressure=unit(cue.pressure),terminal=cue.passage?.terminal?unit(cue.passage.progress):0,
    hearing=Math.max(strain*.62,terminal*.92),breath=active?1-strain*(.035+.055*(.5+.5*Math.sin(time*(2.2+strain)))):1;
  return{cue,fracture,gain:active?(.94-.10*pressure)*(1-.88*fracture)*breath:1,
    fragments:active?Math.min(.21,.16*fracture+.055*strain):0,
    cutoff:active?Math.max(650,450+18550*Math.pow(1-hearing,1.7)-1200*fracture):20000,
    delay:active?.024+.014*strain+.010*fracture:.024,
    rumble:active?.022*strain*(.5+.5*unit(cue.passage?.progress)):0};
}

export function makeSourceRestImpactPcm(sampleRate=48000,severity=2,{collapse=false}={}){
  const rate=Math.max(8000,Math.min(192000,Number(sampleRate)||48000)),seconds=collapse?1.14:.29,
    samples=new Float32Array(Math.ceil(rate*seconds));let seed=(0x19d6f1+severity*701+(collapse?391:0))>>>0,low=0;
  for(let i=0;i<samples.length;i++){
    const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
    low+=.055*(noise-low);
    const attack=Math.min(1,t/.004),decay=Math.exp(-t/(collapse?.24:.057)),
      body=Math.sin(2*Math.PI*((collapse?43:69)*t-(collapse?6:35)*t*t)),
      rasp=collapse?low*1.6:noise*.18*Math.exp(-t/.031);
    samples[i]=Math.max(-.87,Math.min(.87,(body*.61+rasp)*attack*decay));
  }
  return samples;
}

function shapedCurve(kind){const data=new Float32Array(2049);for(let i=0;i<data.length;i++){
  const x=i/(data.length-1)*2-1;
  data[i]=kind==='fragment'?Math.tanh(Math.round(x*18)/18*2.2)*.70:
    Math.max(-SOURCE_REST_AFFLICTION_AUDIO.ceiling,Math.min(SOURCE_REST_AFFLICTION_AUDIO.ceiling,x));
}return data;}

// One owner lives beside the streamed performance, not beside a scene. It
// therefore remains active after the scene, vision and controls have gone.
export function createSourceRestAfflictionAudio({context:ctx,source,getState=()=>({}),
  scheduleTimer=fn=>setInterval(fn,SOURCE_REST_AFFLICTION_AUDIO.tickMs),cancelTimer=clearInterval}={}){
  const capable=ctx&&source&&['createGain','createBiquadFilter','createDelay','createWaveShaper','createBuffer','createBufferSource']
    .every(name=>typeof ctx[name]==='function');
  if(!capable)return{output:source,setActive(){},update(){},pause(){},dispose(){},snapshot:()=>({supported:false,enabled:false,scheduledMistakes:0,scheduledCollapses:0,voices:0})};
  const nodes=[],make=(name,...args)=>{const node=ctx[name](...args);nodes.push(node);return node;},
    bypass=make('createGain'),input=make('createGain'),tone=make('createBiquadFilter'),gain=make('createGain'),
    delay=make('createDelay',.12),high=make('createBiquadFilter'),fray=make('createWaveShaper'),fragments=make('createGain'),
    sum=make('createGain'),ceiling=make('createWaveShaper'),processed=make('createGain'),output=make('createGain');
  tone.type='lowpass';tone.frequency.value=20000;tone.Q.value=.32;delay.delayTime.value=.024;
  high.type='highpass';high.frequency.value=450;high.Q.value=.6;fray.curve=shapedCurve('fragment');fray.oversample='2x';
  ceiling.curve=shapedCurve('ceiling');ceiling.oversample='2x';bypass.gain.value=1;input.gain.value=0;processed.gain.value=0;fragments.gain.value=0;
  source.connect(bypass);bypass.connect(output);source.connect(input);input.connect(tone);tone.connect(gain);gain.connect(sum);
  input.connect(delay);delay.connect(high);high.connect(fray);fray.connect(fragments);fragments.connect(sum);
  sum.connect(ceiling);ceiling.connect(processed);processed.connect(output);
  const buffers=new Map(),voices=new Set(),scheduled=new Map(),history=[];
  let enabled=false,disposed=false,timer=null,last=null,epoch=0,scheduledUntil=0,mistakes=0,collapses=0,held=true,lastCue=null,rumble=null;
  const now=()=>Math.max(0,Number(ctx.currentTime)||0),remember=value=>{history.push(value);if(history.length>64)history.shift();};
  function pcmBuffer(severity,collapse){const key=severity+':'+collapse;if(buffers.has(key))return buffers.get(key);
    const pcm=makeSourceRestImpactPcm(ctx.sampleRate,severity,{collapse}),buffer=ctx.createBuffer(1,pcm.length,ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);buffers.set(key,buffer);return buffer;}
  function stopVoices(at){for(const entry of voices){if(entry.at>at+EPS)scheduled.delete(entry.key);safe(entry.source,'stop',at);safe(entry.source,'disconnect');safe(entry.gain,'disconnect');}voices.clear();
    if(rumble){safe(rumble.source,'stop',at);safe(rumble.source,'disconnect');safe(rumble.filter,'disconnect');safe(rumble.gain,'disconnect');rumble=null;}}
  function cancel(at){for(const p of [gain.gain,fragments.gain,tone.frequency,delay.delayTime]){
    if(p?.cancelAndHoldAtTime)safe(p,'cancelAndHoldAtTime',at);else safe(p,'cancelScheduledValues',at);
  }scheduledUntil=at;}
  function hold(){const at=now();if(timer!==null){cancelTimer(timer);timer=null;}cancel(at);stopVoices(at);
    clear(input.gain,0,at);clear(processed.gain,0,at);clear(bypass.gain,enabled?0:1,at);last=null;held=true;lastCue=null;}
  function strike(row,eventTime,at,kind){
    const key=`${epoch}:${kind}:${row.id}`;if(scheduled.has(key))return;
    scheduled.set(key,{eventTime,at});const collapse=kind==='collapse',s=ctx.createBufferSource(),g=ctx.createGain();
    s.buffer=pcmBuffer(row.severity,collapse);g.gain.value=collapse?.040+.015*row.severity:.085+.035*row.severity;
    s.connect(g);g.connect(sum);const entry={key,source:s,gain:g,at,endAt:at+s.buffer.duration+.01};voices.add(entry);
    s.onended=()=>{voices.delete(entry);safe(s,'disconnect');safe(g,'disconnect');};
    s.start(at);s.stop(at+s.buffer.duration+.01);collapse?collapses++:mistakes++;
    remember({id:row.id,kind,time:eventTime,at,epoch});
    // Completed entries can be forgotten before their deferred onended task;
    // their source still owns its exact stop time and callback cleanup.
    for(const entry of voices)if(entry.endAt<=now())voices.delete(entry);
    if(voices.size>SOURCE_REST_AFFLICTION_AUDIO.maxVoices){const oldest=voices.values().next().value;safe(oldest.source,'stop',now());voices.delete(oldest);}
  }
  function pressureBed(frame,at){
    if(frame.rumble>.001&&!rumble){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),rate=ctx.sampleRate,
        buffer=ctx.createBuffer(1,Math.ceil(rate*2),rate),samples=buffer.getChannelData(0);let seed=0x7af911,low=0;
      for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low+=(seed/2147483648-1-low)*.016;samples[i]=low;}
      // Fade the loop seam in the actual PCM, rather than clicking every two seconds.
      const seam=Math.floor(rate*.08);for(let i=0;i<seam;i++){const blend=i/seam;samples[i]*=blend;samples[samples.length-1-i]*=blend;}
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=210;filter.Q.value=.6;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);gain.connect(sum);source.start(at);rumble={source,filter,gain};
    }
    if(rumble)target(rumble.gain.gain,frame.rumble,at,.16);
  }
  function timeline(position,length,at){
    const horizon=Math.min(length,position+SOURCE_REST_AFFLICTION_AUDIO.lookahead);
    for(const row of SOURCE_REST_PERFORMANCE.annotations){
      if(row.type==='mistake'){
        if(row.start>=position-EPS&&row.start<=horizon+EPS)strike(row,row.start,at+Math.max(0,row.start-position),'mistake');
      }else{
        const end=endOf(row,length),step=3.35-.22*row.severity;
        for(let k=Math.max(0,Math.ceil((position-row.start-1.1)/step-EPS));;k++){
          const time=row.start+1.1+k*step;if(time>=end-.2||time>horizon+EPS)break;
          if(time>=position-EPS)strike({...row,id:row.id+':'+k},time,at+Math.max(0,time-position),'collapse');
        }
      }
    }
  }
  function update(){
    if(disposed)return;
    let media;try{media=getState()||{};}catch{hold();return;}
    const position=Number(media.currentTime),length=Number(media.duration),at=now();
    if(!enabled||!media.playing||media.paused||media.protected||media.buffering||media.seeking||ctx.state!=='running'||!Number.isFinite(position)||!Number.isFinite(length)||length<=0||position>=length){hold();return;}
    if(last){
      const elapsed=at-last.at,advance=position-last.position,wrapped=advance<0&&last.position>length*.75&&position<length*.25,
        expected=wrapped?length-last.position+position:advance;
      if(wrapped&&Math.abs(expected-elapsed)<.28){epoch++;scheduled.clear();cancel(at);stopVoices(at);}
      else if(advance<-.02||Math.abs(expected-elapsed)>.38){epoch++;scheduled.clear();cancel(at);stopVoices(at);remember({kind:'reanchor',time:position,at,epoch});}
    }
    last={position,at};held=false;clear(input.gain,1,at);target(bypass.gain,0,at,.006);target(processed.gain,1,at,.006);
    const frame=sourceRestAfflictionAudioFrame(position,{duration:length,active:true});lastCue=frame.cue;pressureBed(frame,at);
    target(tone.frequency,frame.cutoff,at);target(delay.delayTime,frame.delay,at,.045);
    const start=Math.max(at,scheduledUntil),span=Math.max(0,at+SOURCE_REST_AFFLICTION_AUDIO.lookahead-start);
    if(span>.001){
      // WebKit rejects adjacent value curves when their inclusive endpoints
      // touch within its time tolerance, especially after cancel-and-hold.
      // A fixed4ms linear grid gives the4ms bodily attack a real sample point
      // without any curve event/range which can overlap a neighbour.
      const count=Math.max(2,Math.ceil(span/SOURCE_REST_AFFLICTION_AUDIO.envelopeStep)+1);
      for(let i=0;i<count;i++){
        const offset=span*i/(count-1),time=start+offset,
          sample=sourceRestAfflictionAudioFrame(position+(start-at)+offset,{duration:length,active:true});
        if(i===0&&start>at+EPS)continue; // preserve the previous segment's endpoint
        if(i&&gain.gain.linearRampToValueAtTime){gain.gain.linearRampToValueAtTime(sample.gain,time);fragments.gain.linearRampToValueAtTime(sample.fragments,time);}
        else{set(gain.gain,sample.gain,time);set(fragments.gain,sample.fragments,time);}
      }
      scheduledUntil=start+span;
    }
    timeline(position,length,at);
    if(timer===null){timer=scheduleTimer(update);timer?.unref?.();}
  }
  function setActive(value){const next=!!value;if(disposed||enabled===next)return;enabled=next;
    if(!enabled){hold();const at=now();target(bypass.gain,1,at,.008);target(processed.gain,0,at,.008);}
    else{epoch++;scheduled.clear();last=null;update();}}
  return Object.freeze({output,setActive,update,pause:hold,
    snapshot:()=>({supported:true,enabled,held,automationMode:'piecewise-linear-4ms',scheduledMistakes:mistakes,scheduledCollapses:collapses,voices:voices.size,epoch,
      strain:lastCue?.strain||0,pressure:lastCue?.pressure||0,passage:lastCue?.passage?.id||null,pressureBed:!!rumble,history:history.map(value=>({...value})),
      source:'Human-marked prepared-audio times; no note-recognition error inference.',processing:'Clean bypass or gain fracture / band-limited delayed source / bounded body impacts, before existing room reflections.'}),
    dispose(){if(disposed)return;hold();disposed=true;safe(source,'disconnect',bypass);safe(source,'disconnect',input);for(const node of nodes)safe(node,'disconnect');buffers.clear();scheduled.clear();}});
}

/** Offline measurement uses these SAME WebAudio nodes and envelopes. It does
 * not play the device, advance a game save, or stand in for native route QA.
 * The virtual scheduler only queues the automation before OfflineAudioContext
 * rendering; the actual processing, reflections and samples remain WebAudio. */
export async function renderSourceRestAfflictionOffline(context,buffer,{startTime=0,active=true,dry=.72,wet=.86,reverbSeconds=6.8}={}){
  let clock=0;
  const schedulerContext={get currentTime(){return clock;},state:'running',sampleRate:context.sampleRate};
  for(const method of ['createGain','createBiquadFilter','createDelay','createWaveShaper','createBuffer','createBufferSource'])schedulerContext[method]=context[method].bind(context);
  const source=context.createBufferSource();source.buffer=buffer;
  const owner=createSourceRestAfflictionAudio({context:schedulerContext,source,
    getState:()=>({currentTime:startTime+clock,duration:SOURCE_REST_PERFORMANCE.duration,playing:true}),scheduleTimer:()=>null,cancelTimer(){}});
  const direct=context.createGain();direct.gain.value=dry;owner.output.connect(direct);direct.connect(context.destination);
  if(wet>0){const room=context.createConvolver(),roomGain=context.createGain();room.normalize=false;room.buffer=createStandingTearImpulse(context,{decaySeconds:reverbSeconds});roomGain.gain.value=wet;
    owner.output.connect(room);room.connect(roomGain);roomGain.connect(context.destination);}
  source.start(0);owner.setActive(active);
  for(clock=.02;clock<buffer.duration;clock+=.02)owner.update();
  const scheduling=owner.snapshot(),rendered=await context.startRendering();owner.dispose();
  let peak=0,squares=0,nonFinite=0,clipped=0;
  for(let channel=0;channel<rendered.numberOfChannels;channel++)for(const sample of rendered.getChannelData(channel)){
    if(!Number.isFinite(sample)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(sample));squares+=sample*sample;if(Math.abs(sample)>1)clipped++;
  }
  return{buffer:rendered,diagnostics:{sampleRate:rendered.sampleRate,channels:rendered.numberOfChannels,seconds:rendered.duration,peak,
    rms:Math.sqrt(squares/Math.max(1,rendered.length*rendered.numberOfChannels)),nonFinite,clipped,scheduling,
    scope:'Offline rendering of the production WebAudio affliction graph and existing Source room impulse; no live/native/human acceptance inferred.'}};
}
