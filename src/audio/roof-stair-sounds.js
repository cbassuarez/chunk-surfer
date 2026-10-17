import { ROOF_PRACTICE_NOTES } from './roof-practice-vent.js';

const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(value)||0));

// The compiler gives outdoor flights F.STAIR, not F.SKY. The exact stair owner
// distinguishes this exposed fire escape from every enclosed school stair and
// from the roof itself. Coordinates are the floorplan's half-metre cells.
export function roofStairAcousticFrame({owner,flags,height,stairFlag}={}){
  if(owner!=='academic-roof-service'||!(flags&stairFlag))return null;
  const h=Number(height)||10;
  // The threshold has a little lee from the facade; by the turn there is
  // nothing overhead. Open air remains the dominant sound throughout.
  const windPresence=.72+.28*clamp((h-10)/3.5);
  // Two classroom windows open onto the lower run. The sound is only a small
  // ordinary fragment while the player passes them, gone before the turn.
  const practicePresence=.40*clamp((h-10.2)/.8)*clamp((13.5-h)/1.7);
  return{outdoor:true,windPresence,practicePresence};
}

export function roofStairCueStep(state,frame,now){
  const active=!!frame?.outdoor;
  const prior={playedThisVisit:!!state?.playedThisVisit,lastAt:Number.isFinite(state?.lastAt)?state.lastAt:-Infinity};
  const play=active&&frame.practicePresence>.22&&!prior.playedThisVisit&&now-prior.lastAt>=45;
  return{play,next:{playedThisVisit:active&&(prior.playedThisVisit||play),lastAt:play?now:prior.lastAt}};
}

// A single, low-passed phrase in the real school window, never a periodic
// haunting loop. It is the same student exercise one may hear at the roof vent.
export function createRoofStairSounds({context,destination}={}){
  if(!context||!destination)return{update(){},stop(){},state:()=>({playedThisVisit:false,lastAt:-Infinity})};
  const filter=context.createBiquadFilter(),out=context.createGain();
  filter.type='lowpass';filter.frequency.value=480;filter.Q.value=.25;
  out.gain.value=0;filter.connect(out);out.connect(destination);
  let cue={playedThisVisit:false,lastAt:-Infinity},stopped=false;
  const playPhrase=()=>{
    const start=context.currentTime+.025;
    for(const [frequency,offset] of ROOF_PRACTICE_NOTES.slice(0,6)){
      const when=start+offset;
      const note=context.createOscillator(),envelope=context.createGain();
      note.type='sine';note.frequency.setValueAtTime(frequency,when);
      envelope.gain.setValueAtTime(.0001,when);
      envelope.gain.exponentialRampToValueAtTime(.13,when+.012);
      envelope.gain.exponentialRampToValueAtTime(.0001,when+.50);
      note.connect(envelope);envelope.connect(filter);
      note.start(when);note.stop(when+.52);
      note.onended=()=>{note.disconnect();envelope.disconnect();};
    }
  };
  return{
    update(frame){
      if(stopped)return;
      const now=context.currentTime;
      out.gain.setTargetAtTime(clamp(frame?.practicePresence)*.13,now,.16);
      const decision=roofStairCueStep(cue,frame,now);cue=decision.next;
      if(decision.play)playPhrase();
    },
    stop(){
      if(stopped)return;stopped=true;
      out.gain.setTargetAtTime(0,context.currentTime,.06);
    },
    state:()=>({...cue}),
  };
}
