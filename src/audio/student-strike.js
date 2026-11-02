// A prepared, scene-clocked use of the existing dialogue voices. This module
// never opens an AudioContext, changes Contact, or owns a gameplay clock.
import {renderSamSamples,profileFor} from './sam-voice.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const speakerFor=cue=>cue.actorId==='odette'?'society-odette':cue.actorId==='strike-student-a'?'academic-listener':'academic-attendant';
export function createStudentStrikeAudio({getAudio=()=>null,renderSpeech=renderSamSamples,volume=.26}={}){
  let ready=false,disposed=false,preparing=null,current=null,finishedId=null,lastTime=0;
  const records=new Map(),errors=[],events=[];let created=0,peakNodes=0;
  function stopSource(reason='stop'){
    if(!current)return;
    const owner=current;current=null;owner.source.onended=null;
    try{owner.source.stop();}catch{}
    for(const node of owner.nodes)try{node.disconnect();}catch{}
    events.push({type:'voice-stop',id:owner.id,reason,time:lastTime});
  }
  async function prepare(cues=[]){
    if(preparing)return preparing;
    preparing=Promise.all(cues.map(async cue=>{
      try{
        const speaker=speakerFor(cue),profile=profileFor(speaker);
        const text=cue.text.replaceAll('MISSING','missing').replaceAll('ABSENT','absent').replaceAll('WITHDRAWN','withdrawn');
        const speech=await renderSpeech(text,{speaker});
        if(disposed)return;
        if(!speech?.samples?.length||!(speech.sampleRate>0))throw Error('No prepared speech samples');
        const duration=speech.samples.length/speech.sampleRate,window=cue.end-cue.start;
        const rate=Math.max(profile.rate||1,duration/Math.max(.1,window-.06));
        if(!Number.isFinite(rate)||rate>1.25)throw Error('Prepared voice exceeds the authored speech window');
        records.set(cue.id,{cue,speaker,profile,...speech,duration,rate,spokenSeconds:duration/rate});
      }catch(error){errors.push({id:cue.id,message:String(error?.message||error)});}
    })).then(()=>{if(!disposed)ready=true;return!disposed;});
    return preparing;
  }
  function update({time=0,active=true,paused=false,frame=null}={}){
    lastTime=Math.max(0,Number(time)||0);
    if(disposed||!ready||!active||paused){stopSource(paused?'held':'inactive');return;}
    const record=[...records.values()].find(r=>lastTime>=r.cue.start&&lastTime<r.cue.end);
    if(!record){stopSource('between-lines');return;}
    if(current?.id===record.cue.id||finishedId===record.cue.id)return;
    stopSource('next-line');
    const offset=(lastTime-record.cue.start)*record.rate;
    if(offset>=record.duration){finishedId=record.cue.id;return;}
    const audio=getAudio(),ctx=audio?.ctx,destination=audio?.destination;
    if(!ctx||!destination||ctx.state&&ctx.state!=='running')return;
    const nodes=[];let source;
    try{
      const buffer=ctx.createBuffer(1,record.samples.length,record.sampleRate);buffer.copyToChannel(record.samples,0);
      source=ctx.createBufferSource();nodes.push(source);source.buffer=buffer;source.playbackRate.value=record.rate;
      const high=ctx.createBiquadFilter();nodes.push(high);high.type='highpass';high.frequency.value=record.profile.hp||100;
      const low=ctx.createBiquadFilter();nodes.push(low);low.type='lowpass';low.frequency.value=record.profile.lp||4800;
      const gain=ctx.createGain();nodes.push(gain);gain.gain.value=volume*(record.profile.gain||1);
      source.connect(high);high.connect(low);low.connect(gain);
      let pan=0;
      if(record.cue.actorId!=='odette'&&frame?.camera?.eye){
        const actor=frame.actors?.find(a=>a.id===record.cue.actorId),p=actor?.position||actor?.root,e=frame.camera.eye;
        if(p)pan=clamp(Math.sin(Math.atan2(p[0]-e[0],-(p[2]-e[2]))-frame.camera.yaw)*.65,-.65,.65);
      }
      if(ctx.createStereoPanner){const panner=ctx.createStereoPanner();nodes.push(panner);panner.pan.value=pan;gain.connect(panner);panner.connect(destination);}else gain.connect(destination);
      const owner={id:record.cue.id,actorId:record.cue.actorId,source,nodes,offset,rate:record.rate,pan};current=owner;
      source.onended=()=>{if(current===owner){finishedId=owner.id;stopSource('ended');}};
      source.start(0,offset);created++;peakNodes=Math.max(peakNodes,nodes.length);
      events.push({type:'voice-start',id:owner.id,actorId:owner.actorId,time:lastTime,offset,rate:owner.rate,pan});
    }catch(error){source&&(source.onended=null);for(const node of nodes)try{node.disconnect();}catch{}current=null;finishedId=record.cue.id;errors.push({id:record.cue.id,message:String(error?.message||error)});}
  }
  return{prepare,update,pause:()=>stopSource('pause'),stop:()=>stopSource('stop'),
    dispose(){if(disposed)return;disposed=true;stopSource('dispose');records.clear();},
    snapshot:()=>({ready,disposed,currentCue:current?.id||null,actorId:current?.actorId||null,voices:current?1:0,nodes:current?.nodes.length||0,created,peakNodes,
      prepared:records.size,errors:[...errors],events:events.slice(-32),scope:'Existing game voice synthesis and profiles, prepared before the native scene. No final human voice performance claimed.'}),
    speechEnd:id=>{const r=records.get(id);return r?r.cue.start+r.spokenSeconds:null;},
  };
}
