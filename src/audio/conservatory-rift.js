import { studentBarNotes, studentCorrectionTone } from './student-wall.js';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,finite(value,lo)));

// Isolated non-player path. This owner has no noise-meter, take, HUSH perception,
// microphone, speech narrator or Contact callback. It can only sound its source.
export function createConservatoryRiftAudio({ getAudio = () => null } = {}) {
  let route=null,out=null,clock=0,nextReference=0,nextLive=0,closed=false,lastOption=null,lastPhase=null;
  const active=new Set();
  function acquire(){
    if(closed)return null;
    const value=getAudio?.()||{},context=value.context||value.ctx||value.actx;
    const destination=value.destination||value.sfxGain||value.outGain;
    if(!context?.createOscillator||!context?.createGain||!destination)return null;
    if(route?.context===context&&route?.destination===destination)return route;
    stop();out?.disconnect?.();out=context.createGain();out.gain.value=.15;out.connect(destination);
    route={context,destination};return route;
  }
  function stop(channel=null){
    for(const value of active){
      if(channel&&value.channel!==channel)continue;
      try{value.osc.stop();}catch{}try{value.env.disconnect();value.pan?.disconnect?.();}catch{}
      active.delete(value);
    }
  }
  function spatial(frame,channel){
    const source=channel==='reference'?frame.audio?.referenceSource:frame.audio?.liveSource;
    const eye=frame.camera?.eye||[0,0,0],yaw=finite(frame.camera?.yaw);
    const dx=finite(source?.x,eye[0])-eye[0],dz=finite(source?.z,eye[2])-eye[2];
    const distance=Math.hypot(dx,dz),pan=clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(1,distance),-1,1);
    const occlusion=frame.optionId==='after-company'&&channel==='live'&&frame.leftEnsemble&&!frame.audio?.ensembleDoorOpen ? .1 : 1;
    return {pan,gain:(1/(1+distance*.22))*occlusion};
  }
  function tone({hz,at,dur},frame,channel='live',level=1){
    const current=acquire();if(!current)return false;
    const context=current.context,{pan,gain}=spatial(frame,channel),osc=context.createOscillator(),env=context.createGain();
    const stereo=context.createStereoPanner?.();osc.type=channel==='reference'?'sine':'triangle';
    osc.frequency.setValueAtTime(hz,at);env.gain.setValueAtTime(.0001,at);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002,.10*gain*level),at+.014);
    env.gain.exponentialRampToValueAtTime(.0001,at+Math.max(.025,dur));
    osc.connect(env);if(stereo){stereo.pan.value=pan;env.connect(stereo);stereo.connect(out);}else env.connect(out);
    const node={osc,env,pan:stereo,channel};active.add(node);osc.onended=()=>{active.delete(node);env.disconnect?.();stereo?.disconnect?.();};
    osc.start(at);osc.stop(at+dur+.035);return true;
  }
  function bar(frame,channel='live'){
    const current=acquire();if(!current)return false;
    const start=current.context.currentTime+.035;
    for(const note of studentBarNotes({start,sharp:channel==='reference'}))tone(note,frame,channel,channel==='reference'?.65:.8);
    return true;
  }
  function event(value={},frame={}){
    if(closed||frame.phase==='return'){stop();return false;}
    const current=acquire();if(!current)return false;
    const at=current.context.currentTime+.025;
    if(value.type==='live-start'||value.type==='bar')return bar(frame,'live');
    if(value.type==='live-stop'){stop('live');return true;}
    if(value.type==='reference-continues'||value.type==='reference-ahead'){nextReference=clock+2.5;return bar(frame,'reference');}
    if(value.type==='correction')return tone(studentCorrectionTone({start:at}),frame,'reference',.8);
    if(value.type==='mark'||value.type==='issued-mark')return tone({hz:(value.type==='issued-mark'?444:440)*[1,1.25,1.5,1.68][value.index||0],at:at+(value.type==='mark'&&frame.leak ? .18 : 0),dur:.24},frame,value.type==='issued-mark'?'reference':'live');
    if(value.type==='door')return tone({hz:value.open?78:58,at,dur:.10},frame,'live',.9);
    return false;
  }
  function update(frame={},options={}){
    if(closed||options.paused||frame.paused||frame.hidden||frame.phase==='return'){stop();return false;}
    if(!acquire())return false;
    const dt=clamp(options.dt??0,0,.25);clock+=dt;
    if(frame.optionId!==lastOption||frame.phase!==lastPhase){
      lastOption=frame.optionId;lastPhase=frame.phase;nextReference=clock+.15;nextLive=clock+.3;
    }
    if(frame.optionId==='after-company'&&clock>=nextLive){nextLive=clock+2.8;bar(frame,'live');}
    if(frame.audio?.reference&&clock>=nextReference){nextReference=clock+(frame.leak?2.15:3);bar(frame,'reference');}
    return true;
  }
  return { event,update,stop,destroy(){if(closed)return;stop();closed=true;out?.disconnect?.();out=null;route=null;},
    snapshot:()=>({clock,active:active.size,closed,source:'non-player'}) };
}
