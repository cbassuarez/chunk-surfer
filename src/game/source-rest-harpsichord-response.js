// A view of the actual Couperin performance. No transport, note scheduler,
// beat grid, progression or independently running animation lives here.
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
const prepared=new WeakMap();
function scoreData(score){
  if(!score||!Array.isArray(score.notes))return null;
  let data=prepared.get(score);if(data)return data;
  data=score.notes.filter(note=>Number.isFinite(note.onset)&&note.onset>=0&&Number.isFinite(note.duration)&&note.duration>0
    &&Number.isFinite(note.midi)&&note.midi>=21&&note.midi<=108&&(note.confidence??1)>=.34)
    .slice().sort((a,b)=>a.onset-b.onset);
  prepared.set(score,data);return data;
}
function upperBound(notes,time){let lo=0,hi=notes.length;while(lo<hi){const mid=(lo+hi)>>>1;if(notes[mid].onset<=time)lo=mid+1;else hi=mid;}return lo;}
export function sourceRestHarpsichordResponse({score=null,currentTime=0,signal=0,electronic=0,playing=true,reducedMotion=false}={}){
  const notes=scoreData(score),time=Math.max(0,Number(currentTime)||0),mix=clamp(electronic),level=clamp(signal),
    energy=[0,0,0],active=[],phrase=[];
  let examined=0,phraseEnergy=0;
  if(notes){
    const end=upperBound(notes,time),start=upperBound(notes,Math.max(-.00001,time-12));
    // Dense music increases pressure, not the number of submitted instances.
    // The bounded window includes long decays without scanning the full recording.
    for(let n=end-1;n>=start&&examined<256;n--){
      examined++;const note=notes[n],age=time-note.onset,velocity=clamp(note.velocity??.7),confidence=clamp(note.confidence??1),
        weight=velocity*Math.sqrt(confidence),duration=Math.min(2.8,note.duration),
        attack=smooth(0,.045,age),release=1-smooth(duration,duration+.85,age),envelope=attack*release,
        register=note.midi<55?0:note.midi<76?1:2;
      energy[register]+=weight*envelope;
      if(envelope>.04&&active.length<24)active.push(note.id??`couperin-${n}`);
      const swell=smooth(0,1.1,age)*Math.exp(-age/3.2);phraseEnergy+=weight*swell;
      if(swell>.05&&phrase.length<12)phrase.push(note.midi);
    }
  }
  const registers=energy.map(value=>clamp(1-Math.exp(-value*.52))),
    notePressure=clamp(1-Math.exp(-energy.reduce((sum,value)=>sum+value,0)*.24)),
    phrasePressure=clamp(1-Math.exp(-phraseEnergy*.10)),
    audibleLevel=playing?level:0,
    pressure=notes?clamp(notePressure*.82+audibleLevel*.18):audibleLevel,
    acoustic=pressure*Math.cos(mix*Math.PI/2),synthetic=pressure*Math.sin(mix*Math.PI/2),
    motion=reducedMotion?0:1;
  return Object.freeze({time,electronic:mix,signal:audibleLevel,pressure,registers:Object.freeze(registers),
    acoustic,synthetic,phrasePressure,
    // Visible slow pressure and relaxation, never a sampled 400Hz vibration.
    acousticLift:motion*.040*acoustic,electronicLift:motion*.048*synthetic,
    bridgeLift:motion*.012*pressure,lidAngle:motion*.018*phrasePressure,
    lightPressure:clamp(.75*phrasePressure+.25*pressure),
    diagnostics:Object.freeze({owner:'Couperin audio playhead and existing aligned-note asset',notes:notes?.length||0,examined,
      activeNoteIds:Object.freeze(active),phrasePitches:Object.freeze(phrase),
      analysis:notes?'automatic note estimates, not a verified transcription':'unavailable; measured audio level only',
      inventedNotes:false,independentClock:false,extraAudio:false,reducedMotion:!!reducedMotion})});
}
