import {assetUrl} from '../platform/paths.js';
import {sourceSurroundingsFrame} from '../game/source-surroundings.js';
import {standingTearRepertoireById} from '../data/standing-tear-memory-score.js';
import {createStandingTearProcessedBuffer,createStandingTearImpulse} from './standing-tear-dsp.js';

// A separate owner: its one music source and two recorded impact tails never
// borrow or evict voices from the continuation's critical machinery pool.
export const SOURCE_SURROUNDINGS_AUDIO=Object.freeze({maxMusicVoices:1,maxImpactTails:2,
  reverbSeconds:6.8,limiterCeiling:.72,outputGain:.48,warningDuck:.23,
  maxEncodedBytes:4000000,maxDecodedSeconds:75,resyncSeconds:.18,
  impact:Object.freeze({id:'tower-pressure',url:'assets/audio/bell-tower/bell-04-hand-01.wav',
    seconds:12,playSeconds:3.6,source:'public/assets/audio/bell-tower/credits.json',
    limitation:'Existing CC0 clock-hammer-derived bell bank; not a recorded detached-clapper mechanism or pressure wave.'}),
  pathResponse:Object.freeze({id:'path-pressure',url:'audio/source-demolition/joint-fracture.mp3',seconds:2.65,playSeconds:1.65,
    source:'src/data/source-demolition-audio.js',limitation:'Existing CC0 preview-derived local timber stress; not an earthquake or large structural-collapse recording.'})});
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const copyPoint=v=>({x:finite(v?.x),y:finite(v?.y),z:finite(v?.z)});
const pieces=['ensemble','couperin'].map(standingTearRepertoireById);

/** Camera-relative world positioning leaves the shared AudioListener alone. */
export function sourceSurroundingsPlacement(position,state={}){
  const camera=state.camera,eye=camera?.eye||[finite(state.x),finite(state.feet)+1.62,finite(state.z)],
    yaw=finite(camera?.yaw,finite(state.yaw)),pitch=finite(camera?.pitch,finite(state.pitch)),
    dx=finite(position?.x,eye[0])-eye[0],dy=finite(position?.y,eye[1])-eye[1],dz=finite(position?.z,eye[2])-eye[2],
    cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),distance=Math.hypot(dx,dy,dz),
    relativeXYZ=[dx*cy+dz*sy,-dx*sy*sp+dy*cp+dz*cy*sp,-dx*sy*cp-dy*sp+dz*cy*cp];
  return{relativeXYZ,distance,pan:clamp(relativeXYZ[0]/Math.max(1,distance),-1,1),
    // These enormous structures radiate as broad surfaces. Distance remains
    // perceptible without turning their canonical 100m placement into silence.
    gain:1/(1+distance/95),cutoff:clamp(8000/(1+distance/170),1000,8000),arrival:Math.min(.8,distance/343)};
}

export function createSourceSurroundingsAudio({getAudio=()=>null,protectedAudio=()=>false,
  fetcher=(...args)=>globalThis.fetch(...args),urlFor=assetUrl,onTrace=()=>{}}={}){
  let ctx=null,destination=null,graph=null,impulse=null,disposed=false,paused=false,active=false,
    generation=0,music=null,lastFrame=null,lastSeconds=null,ownerKey=null,
    skipImpacts=true,played=0,skipped=0,resyncs=0;
  const buffers=new Map(),pending=new Map(),errors=new Map(),dsp=new Map(),controllers=new Set(),impacts=new Set(),seen=new Set(),history=[];
  const trace=value=>{const item={...value,seconds:lastFrame?.score?.seconds??null};history.push(item);if(history.length>160)history.shift();try{onTrace(item);}catch{}};
  const protectedNow=()=>{try{return !!protectedAudio();}catch{return true;}};
  function parameter(p,value,seconds=.045,immediate=false){
    if(!p)return;const at=ctx?.currentTime||0;
    if(!immediate&&p.setTargetAtTime)p.setTargetAtTime(value,at,seconds);
    else if(p.setValueAtTime)p.setValueAtTime(value,at);else p.value=value;
  }
  function release(v){
    if(!v||v.dead)return;v.dead=true;v.source.onended=null;
    try{v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}
    if(v.convolver)v.convolver.buffer=null;
    impacts.delete(v);if(music===v)music=null;
  }
  function silence(){
    release(music);for(const v of [...impacts])release(v);active=false;skipImpacts=true;
    if(graph){graph.releaseUntil=null;graph.out.gain.cancelScheduledValues?.(ctx?.currentTime||0);parameter(graph.out.gain,0,0,true);if(graph.convolver)graph.convolver.buffer=null;}
  }
  function dismantle(){silence();if(graph)for(const n of graph.nodes)try{n.disconnect();}catch{}graph=null;impulse=null;}
  function invalidate(){generation++;for(const c of controllers)c.abort();controllers.clear();pending.clear();}
  function acquire(){
    if(disposed||protectedNow())return null;
    let pair;try{pair=getAudio();}catch{return null;}
    const context=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(!context||!out||context.state&&context.state!=='running'||!context.createGain||!context.createBufferSource)return null;
    if(ctx!==context||destination!==out){
      const changed=ctx!==context;dismantle();invalidate();ctx=context;destination=out;
      if(changed){buffers.clear();errors.clear();dsp.clear();}
      trace({type:'surroundings-context',changed});
    }
    return{ctx,destination};
  }
  function ensureGraph(){
    if(graph)return graph;
    const nodes=[],own=n=>{if(n)nodes.push(n);return n;},out=own(ctx.createGain()),sum=own(ctx.createGain()),dry=own(ctx.createGain()),wet=own(ctx.createGain()),limiter=own(ctx.createWaveShaper?.()),convolver=own(ctx.createConvolver?.());
    out.gain.value=0;dry.gain.value=.72;wet.gain.value=.86;dry.connect(sum);
    if(limiter){limiter.curve=Float32Array.from({length:4097},(_,i)=>SOURCE_SURROUNDINGS_AUDIO.limiterCeiling*Math.tanh((i/2048-1)*1.4)/Math.tanh(1.4));limiter.oversample='2x';sum.connect(limiter).connect(out);}else sum.connect(out);
    out.connect(destination);
    if(convolver&&ctx.createBuffer){impulse=createStandingTearImpulse(ctx,{decaySeconds:SOURCE_SURROUNDINGS_AUDIO.reverbSeconds});convolver.normalize=false;convolver.buffer=impulse;convolver.connect(wet).connect(sum);}
    graph={nodes,out,sum,dry,wet,limiter,convolver};return graph;
  }
  function load(row){
    if(buffers.has(row.id))return Promise.resolve(true);
    if(pending.has(row.id))return pending.get(row.id);
    if(errors.has(row.id)||!ctx?.decodeAudioData||typeof fetcher!=='function')return Promise.resolve(false);
    const current=generation,context=ctx,controller=typeof AbortController==='function'?new AbortController():null;
    if(controller)controllers.add(controller);
    const valid=()=>!disposed&&generation===current&&ctx===context;
    const job=Promise.resolve().then(()=>{
      if(!valid())return null;return fetcher(urlFor(row.url),controller?{signal:controller.signal}:undefined);
    }).then(async response=>{
      if(!valid()||!response)return null;if(response.ok===false)throw Error(`HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();if(!valid())return null;
      if(bytes.byteLength>SOURCE_SURROUNDINGS_AUDIO.maxEncodedBytes)throw Error('Encoded surroundings asset exceeds budget');
      return context.decodeAudioData(bytes);
    }).then(decoded=>{
      if(!valid()||!decoded)return false;
      const duration=finite(decoded.duration,decoded.length/decoded.sampleRate),expected=row.duration??row.seconds;
      if(!Number.isFinite(duration)||duration<=0||Math.abs(duration-expected)>.15)throw Error('Surroundings duration differs from canonical asset: '+row.id);
      if([...buffers.values()].reduce((n,b)=>n+b.duration,0)+duration>SOURCE_SURROUNDINGS_AUDIO.maxDecodedSeconds)throw Error('Decoded surroundings budget exceeded');
      const processed=row.kind==='recording'?createStandingTearProcessedBuffer(context,decoded,row):{buffer:decoded,diagnostics:null};
      if(!valid())return false;buffers.set(row.id,processed.buffer);if(processed.diagnostics)dsp.set(row.id,processed.diagnostics);
      trace({type:'surroundings-ready',id:row.id,duration,bitDepth:row.bitDepth||null});return true;
    }).catch(error=>{
      if(valid()){errors.set(row.id,String(error?.message||error));trace({type:'surroundings-error',id:row.id,error:errors.get(row.id)});}return false;
    }).finally(()=>{if(controller)controllers.delete(controller);if(pending.get(row.id)===job)pending.delete(row.id);});
    pending.set(row.id,job);return job;
  }
  function prepare(){
    if(!acquire())return Promise.resolve(false);
    // Decoding is non-playing. Completion can only publish a buffer to this
    // context/owner; a later active update is always required to start audio.
    return Promise.all([...pieces,SOURCE_SURROUNDINGS_AUDIO.impact,SOURCE_SURROUNDINGS_AUDIO.pathResponse].map(load)).then(results=>results.every(Boolean));
  }
  function createVoice(buffer,position,level,kind){
    const g=ensureGraph(),source=ctx.createBufferSource(),envelope=ctx.createGain(),filter=ctx.createBiquadFilter?.(),hrtf=ctx.createPanner?.(),pan=hrtf||ctx.createStereoPanner?.(),nodes=[source,envelope];
    source.buffer=buffer;if(source.playbackRate)source.playbackRate.value=1;
    let tail=source;if(filter){nodes.push(filter);filter.type='lowpass';tail.connect(filter);tail=filter;}tail.connect(envelope);tail=envelope;
    if(pan){nodes.push(pan);if(hrtf){pan.panningModel='HRTF';pan.distanceModel='inverse';pan.rolloffFactor=0;pan.refDistance=1;pan.maxDistance=10000;pan.coneInnerAngle=360;pan.coneOuterAngle=360;pan.coneOuterGain=1;}tail.connect(pan);tail=pan;}
    tail.connect(g.dry);
    const v={source,envelope,filter,pan,hrtf:!!hrtf,nodes,position:copyPoint(position),level,kind,dead:false,offset:0,startedAt:0,until:Infinity};
    if(kind==='music'){if(g.convolver)tail.connect(g.convolver);}
    else if(impulse&&ctx.createConvolver){
      // Each impact owns its actual tail. Evicting one disconnects that tail,
      // rather than leaving uncounted strikes resident in a shared convolver.
      const convolver=ctx.createConvolver(),wet=ctx.createGain();convolver.normalize=false;convolver.buffer=impulse;wet.gain.value=.62;
      tail.connect(convolver).connect(wet).connect(g.sum);nodes.push(convolver,wet);v.convolver=convolver;
    }
    return v;
  }
  function place(v,state){
    const s=sourceSurroundingsPlacement(v.position,state);v.placement=s;
    if(!v.fadeUntil||ctx.currentTime>=v.fadeUntil)parameter(v.envelope.gain,v.level*s.gain,.07);
    parameter(v.filter?.frequency,Math.min(s.cutoff,v.cutoffLimit??Infinity),.1);
    if(v.hrtf){if(v.pan.positionX){parameter(v.pan.positionX,s.relativeXYZ[0]);parameter(v.pan.positionY,s.relativeXYZ[1]);parameter(v.pan.positionZ,s.relativeXYZ[2]);}else v.pan.setPosition?.(...s.relativeXYZ);}
    else parameter(v.pan?.pan,s.pan,.06);
  }
  function startMusic(score,state){
    const piece=standingTearRepertoireById(score.pieceId),buffer=buffers.get(score.pieceId);if(!piece||!buffer)return null;
    const v=createVoice(buffer,score.position,.26+.12*clamp(score.load,0,1),'music');v.pieceId=piece.id;
    v.duration=Math.min(piece.duration,buffer.duration);v.source.loop=true;v.source.loopStart=0;v.source.loopEnd=v.duration;
    v.offset=((finite(score.phase)%v.duration)+v.duration)%v.duration;v.startedAt=ctx.currentTime;music=v;place(v,state);
    const gain=v.level*v.placement.gain;v.envelope.gain.cancelScheduledValues?.(ctx.currentTime);parameter(v.envelope.gain,0,0,true);
    if(v.envelope.gain.linearRampToValueAtTime)v.envelope.gain.linearRampToValueAtTime(gain,ctx.currentTime+.3);else parameter(v.envelope.gain,gain,.1);
    v.fadeUntil=ctx.currentTime+.3;
    v.source.onended=()=>release(v);v.source.start(v.startedAt,v.offset);played++;
    trace({type:'surroundings-music-start',pieceId:v.pieceId,phase:v.offset,source:v.position,spatialization:v.hrtf?'HRTF':v.pan?'stereo':'mono'});return v;
  }
  function hit(event,state){
    const releaseEvent=event.kind==='pressure-release';
    if(!releaseEvent&&event.kind!=='pressure-arrival'){skipped++;return;}
    const bellRelease=releaseEvent&&(event.world||lastFrame?.world)==='fall',row=bellRelease?SOURCE_SURROUNDINGS_AUDIO.impact:SOURCE_SURROUNDINGS_AUDIO.pathResponse,buffer=buffers.get(row.id);if(!buffer){skipped++;return;}
    if(impacts.size>=SOURCE_SURROUNDINGS_AUDIO.maxImpactTails){const oldest=[...impacts].sort((a,b)=>a.startedAt-b.startedAt)[0];release(oldest);trace({type:'surroundings-tail-retired',id:oldest.eventId});}
    const v=createVoice(buffer,event.position,(releaseEvent ? .12 : .075)*clamp(event.strength,.12,1),event.kind);v.eventId=event.id;v.sourceId=event.sourceId;v.targetId=event.targetId;v.assetId=row.id;v.cutoffLimit=bellRelease?8000:1200;
    place(v,state);v.startedAt=ctx.currentTime+v.placement.arrival;const duration=Math.min(row.playSeconds,buffer.duration),end=v.startedAt+duration;
    // The canonical bell releases the travelling pressure. A separate local
    // timber response may sound only when that front reaches a visible path.
    // Both recordings keep their shipped pitch and have authored short decays.
    const gain=v.level*v.placement.gain,p=v.envelope.gain;p.cancelScheduledValues?.(ctx.currentTime);p.setValueAtTime?.(gain,v.startedAt);p.setValueAtTime?.(gain,end-.18);p.linearRampToValueAtTime?.(0,end);
    v.until=end+SOURCE_SURROUNDINGS_AUDIO.reverbSeconds;v.source.onended=()=>{v.source.onended=null;};impacts.add(v);v.source.start(v.startedAt,0,duration);played++;
    trace({type:'surroundings-'+event.kind,id:event.id,time:event.time,sourceId:event.sourceId,targetId:event.targetId,assetId:row.id,source:v.position,arrival:v.placement.arrival});
  }
  function update({state,paused:hold=false,ready=false,reducedMotion=false}={}){
    if(disposed||hold||!ready||!state||protectedNow()){paused=!!hold;silence();return false;}
    // This owner is reused by fake Ellery and later Source passages. The
    // presentation model's default world is never authority to start music.
    if(!['wrong-return','catch'].includes(state.phase)||(state.status&&state.status!=='active')){stop();return false;}
    paused=false;if(!acquire()){silence();return false;}
    const frame=sourceSurroundingsFrame(state,{reducedMotion});lastFrame=frame;
    if(!frame?.score||frame.active===false){silence();lastSeconds=null;ownerKey=null;return false;}
    const score=frame.score,seconds=finite(score.seconds),key=String(state.runId??'source')+':'+String(frame.world??state.phase)+':'+score.pieceId;
    if(key!==ownerKey){
      // One music voice remains the hard bound. A threshold hands it over
      // through a short quiet interval: .2s old-world release, .3s new-world
      // attack, with the new recording seeking its continuing shared phase.
      if(music&&ownerKey!==null){
        music.retireAt=ctx.currentTime+.2;
        music.envelope.gain.cancelScheduledValues?.(ctx.currentTime);
        music.envelope.gain.setValueAtTime?.(music.envelope.gain.value,ctx.currentTime);
        if(music.envelope.gain.linearRampToValueAtTime)music.envelope.gain.linearRampToValueAtTime(0,music.retireAt);else parameter(music.envelope.gain,0,.065);
        if(graph){
          graph.releaseUntil=music.retireAt;graph.out.gain.cancelScheduledValues?.(ctx.currentTime);
          graph.out.gain.setValueAtTime?.(graph.out.gain.value,ctx.currentTime);
          if(graph.out.gain.linearRampToValueAtTime)graph.out.gain.linearRampToValueAtTime(0,music.retireAt);else parameter(graph.out.gain,0,.065);
        }
        trace({type:'surroundings-world-release',from:music.pieceId,to:score.pieceId,duration:.2});
      }else silence();
      seen.clear();lastSeconds=null;skipImpacts=true;ownerKey=key;
    }
    void prepare();const g=ensureGraph();if(g.convolver&&!g.convolver.buffer&&impulse)g.convolver.buffer=impulse;
    const warning=['warning','lowering-warning'].includes(state.counterweight?.mode)||state.closure?.mode==='warning';
    const duck=warning?SOURCE_SURROUNDINGS_AUDIO.warningDuck:((state.recovery||state.reveal?.active) ? .35 : 1);
    if(music?.retireAt&&ctx.currentTime>=music.retireAt){
      release(music);for(const v of [...impacts])release(v);
      // The outgoing world's entire room tail reaches the same quiet handoff.
      // Do not leave 6.8 seconds of unowned music under the next world.
      if(g.convolver){g.convolver.buffer=null;g.convolver.buffer=impulse;}
      g.releaseUntil=null;g.out.gain.cancelScheduledValues?.(ctx.currentTime);parameter(g.out.gain,0,0,true);
    }
    if(!g.releaseUntil)parameter(g.out.gain,SOURCE_SURROUNDINGS_AUDIO.outputGain*duck,.035);active=true;
    for(const v of [...impacts])if(v.until<=ctx.currentTime)release(v);
    if(music&&!music.retireAt){
      const actual=(music.offset+Math.max(0,ctx.currentTime-music.startedAt))%music.duration,desired=((finite(score.phase)%music.duration)+music.duration)%music.duration,delta=Math.abs(actual-desired),drift=Math.min(delta,music.duration-delta);
      if(music.pieceId!==score.pieceId||drift>SOURCE_SURROUNDINGS_AUDIO.resyncSeconds){trace({type:'surroundings-resync',drift,phase:desired});release(music);resyncs++;}
    }
    if(!music)startMusic(score,state);
    if(music&&!music.retireAt){music.position=copyPoint(score.position);music.level=.26+.12*clamp(score.load,0,1);place(music,state);}
    for(const v of impacts){
      // Keep the authored release envelope intact; only camera direction and
      // distance filtering move while its source and existing tail stay put.
      const p=sourceSurroundingsPlacement(v.position,state);v.placement=p;parameter(v.filter?.frequency,Math.min(p.cutoff,v.cutoffLimit??Infinity),.1);
      if(v.hrtf){if(v.pan.positionX){parameter(v.pan.positionX,p.relativeXYZ[0]);parameter(v.pan.positionY,p.relativeXYZ[1]);parameter(v.pan.positionZ,p.relativeXYZ[2]);}else v.pan.setPosition?.(...p.relativeXYZ);}else parameter(v.pan?.pan,p.pan);
    }
    const elapsed=lastSeconds===null?0:seconds-lastSeconds,continuous=elapsed>=0&&elapsed<=.5;
    for(const event of frame.impacts||[]){
      const id=event.id!=null?String(event.id):event.kind+':'+finite(event.time);if(seen.has(id))continue;seen.add(id);if(seen.size>256)seen.delete(seen.values().next().value);
      const age=seconds-finite(event.time);
      // A fixed gameplay tick can stop a rounding error below an exact score
      // boundary. Stable IDs already prevent repeats; don't lose that release
      // on the following tick by demanding an extra positive epsilon.
      if(!skipImpacts&&age>=-1e-6&&age<=.16&&(continuous?finite(event.time)>=lastSeconds-1e-7:true))hit(event,state);
    }
    lastSeconds=seconds;skipImpacts=false;return true;
  }
  function pause(){paused=true;silence();}
  function stop(){silence();lastSeconds=null;ownerKey=null;seen.clear();}
  return{prepare,whenReady:()=>Promise.all([...pending.values()]).then(values=>values.every(Boolean)&&[...pieces,SOURCE_SURROUNDINGS_AUDIO.impact,SOURCE_SURROUNDINGS_AUDIO.pathResponse].every(row=>buffers.has(row.id))),update,pause,stop,
    dispose(){if(disposed)return;disposed=true;dismantle();invalidate();buffers.clear();dsp.clear();ctx=null;destination=null;},
    snapshot:()=>({active,paused,disposed,ownerKey,world:lastFrame?.world??null,ready:[...buffers.keys()],pending:[...pending.keys()],errors:Object.fromEntries(errors),
      voices:(music?1:0)+impacts.size,musicVoices:music?1:0,impactTails:impacts.size,sourceLimit:3,played,skipped,resyncs,
      score:lastFrame?.score?{...lastFrame.score,position:copyPoint(lastFrame.score.position)}:null,
      music:music?{pieceId:music.pieceId,phase:music.offset,startedAt:music.startedAt,position:music.position,placement:music.placement,gain:music.level,spatialization:music.hrtf?'HRTF':music.pan?'stereo':'mono'}:null,
      impacts:[...impacts].map(v=>({id:v.eventId,kind:v.kind,sourceId:v.sourceId,targetId:v.targetId,assetId:v.assetId,position:v.position,until:v.until})),
      dsp:{recordings:Object.fromEntries(dsp),reverbSeconds:SOURCE_SURROUNDINGS_AUDIO.reverbSeconds,spatializedBeforeReverb:true,limiterCeiling:graph?.limiter?SOURCE_SURROUNDINGS_AUDIO.limiterCeiling:null,warningDuck:SOURCE_SURROUNDINGS_AUDIO.warningDuck,outputGain:graph?.out.gain.value??0},history:history.map(row=>({...row}))})};
}
