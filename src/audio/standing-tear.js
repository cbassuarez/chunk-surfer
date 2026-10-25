import {studentBarNotes} from './student-wall.js';
import {assetUrl} from '../platform/paths.js';
import {STANDING_TEAR_REPERTOIRE,standingTearRepertoireById,standingTearMemoryPhase} from '../data/standing-tear-memory-score.js';
import {createStandingTearProcessedBuffer,createStandingTearImpulse} from './standing-tear-dsp.js';

const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,finite(n,a)));
const retainedSeconds=frame=>Math.max(0,finite(frame.referenceSeconds,finite(frame.audio?.referenceSeconds)))+Math.max(0,finite(frame.stoppedSeconds));

// A borrowed, non-player sound owner. Nothing here enters the recorder, player
// noise envelope or Contact. The reference has two physically distinct owners:
// the visible transport and, after it stops, the surrounding architecture.
export function createStandingTearAudio({getAudio=()=>null,onTrace=()=>{},fetchImpl=(...args)=>globalThis.fetch(...args)}={}){
  let route=null,out=null,dry=null,reverb=null,reverbWet=null,limiter=null,impulse=null,closed=false,paused=false,clock=0,lastLive=-10,motor=null,lastFrame=null,
    referenceOwner=null,referenceIndex=-1,referenceClockBase=0,resyncReference=true;
  const active=new Set(),history=[],memoryBuffers=new Map(),memoryPending=new Map(),memoryVoices=new Map(),memoryErrors=new Map(),memoryDsp=new Map();
  let memoryClock=0,lastMemoryMix=-1;
  const trace=value=>{const item={...value,at:clock};history.push(item);if(history.length>1200)history.shift();onTrace(item);};
  function retire(node){
    if(!node||!active.has(node))return;
    active.delete(node);try{node.osc.stop();}catch{}try{node.env.disconnect();node.spatialGain?.disconnect();node.pan?.disconnect();node.filter?.disconnect();}catch{}
    if(motor===node)motor=null;
    if(node.memoryId&&memoryVoices.get(node.memoryId)===node)memoryVoices.delete(node.memoryId);
  }
  function stop(channel=null){for(const node of [...active])if(!channel||node.channel===channel)retire(node);}
  function acquire(){
    if(closed)return null;
    const value=getAudio?.()||{},context=value.context||value.ctx||value.actx,destination=value.destination||value.sfxGain||value.outGain;
    if(!context?.createOscillator||!context?.createGain||!destination)return null;
    if(route?.context===context&&route?.destination===destination)return route;
    stop();out?.disconnect?.();dry?.disconnect?.();reverb?.disconnect?.();reverbWet?.disconnect?.();limiter?.disconnect?.();
    out=context.createGain();out.gain.value=paused?0:.7;
    limiter=context.createWaveShaper?.();if(limiter){limiter.curve=Float32Array.from({length:4097},(_,i)=>.84*Math.tanh((i/2048-1)*1.35)/Math.tanh(1.35));limiter.oversample='2x';out.connect(limiter);limiter.connect(destination);}else out.connect(destination);
    dry=context.createGain();dry.gain.value=.8;dry.connect(out);
    reverb=context.createConvolver?.();impulse=null;reverbWet=null;
    if(reverb&&context.createBuffer){impulse=createStandingTearImpulse(context,{decaySeconds:6.8});reverb.normalize=false;reverb.buffer=impulse.buffer||impulse;
      reverbWet=context.createGain();reverbWet.gain.value=.92;reverb.connect(reverbWet);reverbWet.connect(out);}
    route={context,destination};return route;
  }
  function spatial(frame,channel,sourceOverride=null){
    const eye=frame.camera?.eye||[frame.pose?.x||0,1.62,frame.pose?.z||0],yaw=finite(frame.camera?.yaw,finite(frame.pose?.yaw)),pitch=finite(frame.camera?.pitch,finite(frame.pose?.pitch));
    const a=frame.audio||{},source=sourceOverride||(channel==='threshold'?(a.entrySource||{x:0,y:1.3,z:0}):channel==='live'?a.liveSource:channel==='architecture'?a.architectureSource:a.referenceSource);
    const dx=finite(source?.x,eye[0])-eye[0],dy=finite(source?.y,eye[1])-eye[1],dz=finite(source?.z,eye[2])-eye[2],distance=Math.hypot(dx,dy,dz);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    // The shared listener stays at its default origin, facing -Z. Express the
    // fixed world source in this camera's right/up/back basis instead of
    // changing global listener state owned by ordinary game audio.
    const relativeXYZ=[dx*cy+dz*sy,-dx*sy*sp+dy*cp+dz*cy*sp,-dx*sy*cp-dy*sp+dz*cy*cp];
    return{pan:clamp(relativeXYZ[0]/Math.max(1,distance),-1,1),relativeXYZ,distance,gain:1/(1+distance*.055),lowpass:channel==='architecture'?1250:channel==='reference'?2200:6500};
  }
  function voice({hz,at,dur=.25,type='triangle',level=.13,channel='live',echo=false,mechanical=false,source=null,attack=.012,cutoff=null},frame={}){
    const current=acquire();if(!current||paused||current.context.state&&current.context.state!=='running')return false;
    const c=current.context,s=spatial(frame,channel,source),osc=c.createOscillator(),env=c.createGain(),spatialGain=c.createGain(),pan=c.createStereoPanner?.(),filter=c.createBiquadFilter?.();
    osc.type=type;osc.frequency.setValueAtTime(hz,at);env.gain.setValueAtTime(.0001,at);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+Math.min(dur*.5,attack));
    env.gain.exponentialRampToValueAtTime(.0001,at+Math.max(.03,dur));osc.connect(env);
    spatialGain.gain.value=s.gain;env.connect(spatialGain);
    let tail=spatialGain;if(filter){filter.type='lowpass';filter.frequency.value=cutoff??s.lowpass;tail.connect(filter);tail=filter;}
    if(pan){pan.pan.value=s.pan;tail.connect(pan);tail=pan;}tail.connect(out);
    const node={osc,env,spatialGain,pan,filter,channel,level,mechanical,endAt:at+dur+.035};active.add(node);
    osc.onended=()=>{if(active.delete(node)){env.disconnect?.();spatialGain.disconnect?.();pan?.disconnect?.();filter?.disconnect?.();}};
    osc.start(at);osc.stop(at+dur+.035);
    if(echo){voice({hz,at:at+.31,dur:dur*1.4,type:'sine',level:level*.24,channel},frame);voice({hz,at:at+.79,dur:dur*1.8,type:'sine',level:level*.10,channel},frame);}
    return true;
  }
  function loadMemory(piece){
    if(closed||piece.kind!=='recording')return Promise.resolve(false);
    if(memoryBuffers.has(piece.id))return Promise.resolve(true);
    if(memoryPending.has(piece.id))return memoryPending.get(piece.id);
    if(memoryErrors.has(piece.id))return Promise.resolve(false);
    const current=acquire();if(!current?.context.decodeAudioData)return Promise.resolve(false);
    const job=Promise.resolve().then(()=>fetchImpl(assetUrl(piece.url))).then(response=>{
      if(response?.ok===false)throw Error(`Music memory ${piece.id}: HTTP ${response.status}`);
      return typeof response?.arrayBuffer==='function'?response.arrayBuffer():response;
    }).then(bytes=>current.context.decodeAudioData(bytes)).then(buffer=>{
      if(closed)return false;const processed=createStandingTearProcessedBuffer(current.context,buffer,piece);
      memoryBuffers.set(piece.id,processed.buffer);memoryDsp.set(piece.id,processed.diagnostics);memoryErrors.delete(piece.id);
      trace({type:'recording-ready',id:piece.id,duration:buffer.duration,bitDepth:piece.bitDepth,effectiveSampleRate:piece.effectiveSampleRate});return true;
    }).catch(reason=>{if(!closed){memoryErrors.set(piece.id,String(reason?.message||reason));trace({type:'recording-error',id:piece.id,error:String(reason?.message||reason)});}return false;})
      .finally(()=>memoryPending.delete(piece.id));
    memoryPending.set(piece.id,job);return job;
  }
  function prepareStudent(){
    if(memoryBuffers.has('solo'))return true;const c=acquire()?.context;if(!c?.createBuffer)return false;
    const piece=standingTearRepertoireById('solo'),rate=c.sampleRate||48000,buffer=c.createBuffer(1,Math.ceil(rate*piece.duration),rate),samples=buffer.getChannelData(0);
    for(const sharp of[false,true])for(const note of studentBarNotes({sharp})){
      const first=Math.floor(note.at*rate),count=Math.floor(note.dur*rate),level=sharp?.16:.22;
      for(let i=0;i<count&&first+i<samples.length;i++){
        const t=i/rate,envelope=Math.min(1,t/.045)*Math.pow(Math.max(0,1-t/note.dur),.8),phase=2*Math.PI*note.hz*t;
        samples[first+i]+=level*envelope*(Math.sin(phase)+.23*Math.sin(phase*2)+.11*Math.sin(phase*3));
      }
    }
    const processed=createStandingTearProcessedBuffer(c,buffer,piece);memoryBuffers.set('solo',processed.buffer);memoryDsp.set('solo',processed.diagnostics);return true;
  }
  function prepare(){prepareStudent();return Promise.all(STANDING_TEAR_REPERTOIRE.filter(piece=>piece.kind==='recording').map(loadMemory)).then(values=>values.every(Boolean));}
  function parameter(parameter,value,now,seconds=.12){
    if(!parameter)return;if(parameter.setTargetAtTime)parameter.setTargetAtTime(value,now,seconds);else parameter.value=value;
  }
  function memoryLevel(memory,s){
    // Recognition arrives in a quiet local teaser. Accumulated work makes the
    // retained performance forceful; independent phrases and long reflections
    // create the pressure. The owner bus bounds their coincident peaks.
    return(memory.awake?.38+.28*clamp(memory.pressure,0,1):.07)*s.gain;
  }
  function startRecording(memory,piece,frame,seconds){
    const current=acquire(),buffer=memoryBuffers.get(piece.id);if(!current||!buffer||!current.context.createBufferSource)return null;
    const c=current.context,osc=c.createBufferSource(),env=c.createGain(),filter=c.createBiquadFilter?.(),hrtfPan=c.createPanner?.(),pan=hrtfPan||c.createStereoPanner?.(),s=spatial(frame,'memory',memory.source),hrtf=!!hrtfPan;
    osc.buffer=buffer;osc.loop=true;osc.loopStart=0;osc.loopEnd=Math.min(buffer.duration,piece.duration);
    const offset=standingTearMemoryPhase(piece.id,seconds)%osc.loopEnd,at=c.currentTime+.025;
    env.gain.value=0;let tail=osc;if(filter){filter.type='lowpass';filter.frequency.value=6000/(1+s.distance*.035);tail.connect(filter);tail=filter;}tail.connect(env);tail=env;
    if(pan){
      if(hrtf){pan.panningModel='HRTF';pan.distanceModel='inverse';pan.rolloffFactor=0;pan.refDistance=1;pan.maxDistance=10000;pan.coneInnerAngle=360;pan.coneOuterAngle=360;pan.coneOuterGain=1;
        if(pan.positionX){pan.positionX.value=s.relativeXYZ[0];pan.positionY.value=s.relativeXYZ[1];pan.positionZ.value=s.relativeXYZ[2];}else pan.setPosition?.(...s.relativeXYZ);
      }else pan.pan.value=s.pan;
      tail.connect(pan);tail=pan;
    }tail.connect(dry||out);if(reverb)tail.connect(reverb);
    const node={osc,env,filter,pan,channel:'memory',memoryId:memory.id,source:{...memory.source},relativeXYZ:s.relativeXYZ,spatialization:hrtf?'HRTF':pan?'stereo':'mono',offset,startedAt:at,duration:osc.loopEnd,awake:!!memory.awake,gain:0};
    active.add(node);memoryVoices.set(memory.id,node);osc.onended=()=>{if(active.delete(node)){env.disconnect?.();filter?.disconnect?.();pan?.disconnect?.();}if(memoryVoices.get(memory.id)===node)memoryVoices.delete(memory.id);};
    parameter(env.gain,memoryLevel(memory,s),c.currentTime,.12);osc.start(at,offset);
    trace({type:piece.kind==='recording'?'recording-start':'practice-loop-start',id:memory.id,title:piece.title,instrument:piece.instrument,offset,musicSeconds:seconds,source:node.source,awake:!!memory.awake,bitDepth:piece.bitDepth,effectiveSampleRate:piece.effectiveSampleRate});return node;
  }
  function updateMemories(frame,dt){
    const current=acquire();if(!current)return false;const c=current.context,memories=frame.memories||frame.audio?.memories||[];
    clock+=dt;memoryClock=finite(frame.elapsed,memoryClock+dt);void prepare();stop('motor');
    for(const memory of memories){
      const piece=standingTearRepertoireById(memory.id);if(!piece)continue;
      const seconds=finite(memory.musicSeconds,finite(frame.elapsed,memory.awakeSeconds));
      let node=memoryVoices.get(memory.id);
      if(node){
        const actual=(node.offset+Math.max(0,c.currentTime-node.startedAt))%node.duration,desired=standingTearMemoryPhase(memory.id,seconds),raw=Math.abs(actual-desired),drift=Math.min(raw,node.duration-raw);
        // Background/context interruptions discard missed output and seek the
        // retained score position. They never replay the opening on recovery.
        if(drift>.35){retire(node);node=null;trace({type:'recording-resync',id:memory.id,drift,offset:desired});}
      }
      if(!node)node=startRecording(memory,piece,frame,seconds);
      if(!node)continue;
      const s=spatial(frame,'memory',memory.source);node.gain=memoryLevel(memory,s);node.source={...memory.source};node.relativeXYZ=s.relativeXYZ;
      parameter(node.env.gain,node.gain,c.currentTime,memory.awake?.25:.45);
      if(node.spatialization==='HRTF'){
        if(node.pan.positionX){parameter(node.pan.positionX,s.relativeXYZ[0],c.currentTime,.045);parameter(node.pan.positionY,s.relativeXYZ[1],c.currentTime,.045);parameter(node.pan.positionZ,s.relativeXYZ[2],c.currentTime,.045);}else node.pan.setPosition?.(...s.relativeXYZ);
      }else parameter(node.pan?.pan,s.pan,c.currentTime,.07);
      parameter(node.filter?.frequency,clamp(6000/(1+s.distance*.035),900,6000),c.currentTime,.15);
      if(node.awake!==!!memory.awake){node.awake=!!memory.awake;trace({type:'recording-awake',id:memory.id,offset:standingTearMemoryPhase(memory.id,seconds),source:node.source});}
    }
    if(!memories.some(memory=>memory.id==='solo'&&memory.live))stop('live');
    if(memoryClock-lastMemoryMix>=.5){lastMemoryMix=memoryClock;trace({type:'memory-mix',voices:[...memoryVoices].map(([id,node])=>({id,gain:node.gain,source:node.source,offset:standingTearMemoryPhase(id,memoryClock)}))});}
    return true;
  }
  function transferReference(frame){
    const current=acquire();if(!current)return 0;
    const now=current.context.currentTime,s=spatial(frame,'architecture');let count=0;
    const target=(parameter,value)=>{if(!parameter)return;if(parameter.setTargetAtTime)parameter.setTargetAtTime(value,now,.045);else parameter.value=value;};
    for(const node of active){
      if(node.channel!=='reference'||node.mechanical||node.endAt<=now)continue;
      // Retain each running oscillator and every scheduled note. Only its
      // physical source changes; the waveform and note envelope never restart.
      node.channel='architecture';target(node.spatialGain?.gain,s.gain*(.32/node.level));
      target(node.pan?.pan,s.pan);target(node.filter?.frequency,s.lowpass);count++;
    }
    return count;
  }
  function bar(frame,channel,{offset=0}={}){
    const current=acquire();if(!current||paused||current.context.state&&current.context.state!=='running')return false;
    const at=current.context.currentTime+.025;
    // The architecture is a larger radiating surface than the desk. Its
    // source remains distant: this 6 dB increase prevents that transfer from
    // becoming an 18 dB disappearance exactly when it needs to be heard.
    const level=channel==='live'?.13:channel==='architecture'?.32:.16;
    let noteCount=0;
    for(const note of studentBarNotes({start:0,sharp:channel!=='live'})){
      const remaining=note.at+note.dur-offset;if(remaining<=.015)continue;
      if(voice({...note,at:at+Math.max(0,note.at-offset),dur:Math.min(note.dur,remaining),channel,level,type:channel==='live'?'triangle':'sine',echo:channel==='architecture'},frame))noteCount++;
    }
    trace({type:noteCount?'bar':'phrase-rest',noteCount,channel,frequency:channel==='live'?440:444,sourcePower:level,offset,source:{...(channel==='architecture'?frame.audio?.architectureSource:channel==='reference'?frame.audio?.referenceSource:frame.audio?.liveSource)},...spatial(frame,channel)});
    return noteCount>0;
  }
  function startMotor(frame){
    const current=acquire();if(!current||paused||motor||current.context.state&&current.context.state!=='running')return;
    const c=current.context,s=spatial(frame,'reference'),osc=c.createOscillator(),env=c.createGain(),pan=c.createStereoPanner?.();
    osc.type='triangle';osc.frequency.value=53;env.gain.value=.016*s.gain;osc.connect(env);
    if(pan){pan.pan.value=s.pan;env.connect(pan);pan.connect(out);}else env.connect(out);
    motor={osc,env,pan,channel:'motor'};active.add(motor);osc.start();trace({type:'motor-start',source:frame.audio?.referenceSource});
  }
  function event(value={},frame={}){
    if(closed||paused)return false;lastFrame=frame;
    const current=acquire();if(!current)return false;
    if(Array.isArray(frame.memories||frame.audio?.memories)&&!['entry-folding','entry-closed','confined','threshold-closed'].includes(value.type)){
      if(value.type==='live-stop'){stop('live');trace({type:'live-release',id:value.id});}
      else if(value.type==='live-start'){lastLive=-10;trace({type:'movement-performance',id:value.id});}
      else if(['memory-awake','memory-pressure','course-made'].includes(value.type))trace({...value,type:value.type});
      return true;
    }
    if(value.type==='live-start'){const sounded=bar(frame,'live');if(sounded)lastLive=clock;return sounded;}
    if(value.type==='bar'&&clock-lastLive>.7){const sounded=bar(frame,'live');if(sounded)lastLive=clock;return sounded;}
    if(value.type==='live-stop'){stop('live');trace({type:'live-release'});return true;}
    if(value.type==='reference-start'){referenceOwner='reference';referenceIndex=0;referenceClockBase=clock;const sounded=bar(frame,'reference');resyncReference=!sounded;return sounded;}
    if(value.type==='transport-stop'){
      stop('motor');const at=current.context.currentTime+.01;
      voice({hz:63,at,dur:.16,type:'triangle',level:.12,channel:'reference',mechanical:true},frame);trace({type:'transport-stop'});return true;
    }
    if(value.type==='architecture-continues'){
      const seconds=retainedSeconds(frame),index=Math.floor((seconds+1e-7)/1.9),offset=seconds-index*1.9;
      referenceOwner='architecture';referenceIndex=index;referenceClockBase=clock-seconds;
      const count=transferReference(frame);
      if(count){resyncReference=false;trace({type:'reference-transferred',channel:'architecture',noteCount:count,offset,source:frame.audio?.architectureSource,...spatial(frame,'architecture')});return true;}
      // Reload or context recovery may have no resident oscillator. Resume
      // precisely the remaining phrase instead of issuing a fresh downbeat.
      const sounded=bar(frame,'architecture',{offset});resyncReference=!!current.context.state&&current.context.state!=='running';return sounded;
    }
    if(value.type==='entry-folding'){
      const at=current.context.currentTime+.02;
      voice({hz:42,at,dur:.7,type:'sine',level:.10,channel:'threshold'},frame);
      voice({hz:84,at:at+.025,dur:.24,type:'triangle',level:.075,channel:'threshold'},frame);
      trace({type:'entry-folding',source:frame.audio?.entrySource||{x:0,y:1.3,z:0},...spatial(frame,'threshold')});return true;
    }
    if(value.type==='confined'||value.type==='threshold-closed'||value.type==='entry-closed'){
      voice({hz:74,at:current.context.currentTime+.02,dur:.13,type:'triangle',level:.045,channel:'threshold'},frame);
      trace({type:'threshold-closed',source:frame.audio?.entrySource||{x:0,y:1.3,z:0},...spatial(frame,'threshold')});return true;
    }
    return false;
  }
  function update(frame={},options={}){
    if(closed)return false;lastFrame=frame;
    if(options.paused||options.hidden){setPaused(true);return false;}
    setPaused(false);const current=acquire();if(!current)return false;
    // This is a viewpoint cut, not the Surfer escaping. Its sound remains in
    // Source: the complete mix, including the long room tail, falls into the
    // same full-black boundary rather than popping at owner disposal.
    const ending=frame.audio?.ending||frame.phase==='ending'||frame.phase==='returned';
    parameter(out.gain,.7*(ending?clamp(1-finite(frame.endingSeconds,frame.audio?.endingSeconds)/.9,0,1):1),current.context.currentTime,.025);
    if(current.context.state&&current.context.state!=='running'){stop();resyncReference=true;return false;}
    if(Array.isArray(frame.memories||frame.audio?.memories))return updateMemories(frame,clamp(options.dt??0,0,.25));
    clock+=clamp(options.dt??0,0,.25);
    const a=frame.audio||{},transport=!!(a.transport??frame.transportRunning),architecture=!!(a.architecture??frame.architectureRunning);
    if(transport)startMotor(frame);else stop('motor');
    if(motor){const s=spatial(frame,'reference');motor.env.gain.value=.016*s.gain;if(motor.pan)motor.pan.pan.value=s.pan;}
    if(transport||architecture){
      const owner=transport?'reference':'architecture',sourceSeconds=transport?(frame.referenceSeconds??a.referenceSeconds):retainedSeconds(frame);
      const seconds=Number.isFinite(sourceSeconds)?Math.max(0,sourceSeconds):Math.max(0,clock-referenceClockBase);
      const index=Math.floor((seconds+1e-7)/1.9),offset=seconds-index*1.9;
      if(referenceOwner!==owner||referenceIndex!==index||resyncReference){
        referenceOwner=owner;referenceIndex=index;resyncReference=false;
        // Resume the current physical phrase. A menu never restarts the deck
        // at an unrelated downbeat while its reels and masonry keep another.
        bar(frame,owner,{offset});
      }
    }
    // A player can hold without retriggering keydown; each completed bar is
    // supplied by the controller, with this cadence as an interruption-safe
    // continuation rather than a second independent performance clock.
    if((a.live??frame.held)&&clock-lastLive>=1.04){lastLive=clock;bar(frame,'live');}
    return true;
  }
  function setPaused(value){const next=!!value;if(next===paused)return;paused=next;resyncReference=true;
    if(out)out.gain.value=paused?0:.7;
    if(reverb){reverb.buffer=null;if(!paused&&impulse)reverb.buffer=impulse.buffer||impulse;}
    if(paused){stop();trace({type:'paused'});}else trace({type:'resumed'});}
  // Preparation is non-playing. The shared files can decode before the first
  // approach without creating a sound or a later retired-owner callback.
  void Promise.resolve().then(()=>closed?false:prepare());
  return{event,update,stop,setPaused,prepare,ready:prepare,pause:()=>setPaused(true),resume:()=>setPaused(false),
    destroy(){
      if(closed)return;closed=true;
      const retired=[...active],graph=[out,dry,reverb,reverbWet,limiter],convolver=reverb,context=route?.context;
      const now=finite(context?.currentTime),release=.04;
      if(out?.gain){out.gain.cancelScheduledValues?.(now);out.gain.setValueAtTime?.(out.gain.value,now);out.gain.linearRampToValueAtTime?.(0,now+release);if(!out.gain.linearRampToValueAtTime)out.gain.value=0;}
      for(const node of retired){try{node.osc.stop(now+release);}catch{}}
      active.clear();memoryVoices.clear();motor=null;out=null;route=null;
      // A retired owner can only disconnect its captured nodes; this callback
      // never touches the shared context, player audio or a replacement run.
      setTimeout(()=>{for(const node of retired){try{node.env.disconnect();node.spatialGain?.disconnect();node.pan?.disconnect();node.filter?.disconnect();}catch{}}for(const node of graph)node?.disconnect?.();if(convolver)convolver.buffer=null;},50);
    },
    snapshot:()=>({closed,paused,clock,active:active.size,motor:!!motor,source:'non-player',history:history.map(v=>({...v})),lastFramePhase:lastFrame?.phase||null,
      recordings:{ready:[...memoryBuffers.keys()],pending:[...memoryPending.keys()],errors:Object.fromEntries(memoryErrors),voices:[...memoryVoices].map(([id,node])=>({id,source:node.source,relativeXYZ:node.relativeXYZ,spatialization:node.spatialization,gain:node.gain,awake:node.awake,offset:node.offset}))},
      dsp:{memories:Object.fromEntries(memoryDsp),reverbDecay:6.8,reverbWet:reverbWet?.gain?.value??0,dryGain:dry?.gain?.value??1,spatializedBeforeReverb:true,limiterCeiling:limiter?.curve?.length ? .84 : null}})};
}
