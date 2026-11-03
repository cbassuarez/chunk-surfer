import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {sourceRestHorizonFrame} from './source-rest-horizon.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),cache=new WeakMap(),STEP=.05,TAU=Math.PI*2;
// The 26 pitch-addressed chambers survive only as the score's local note mass;
// their summed pressure is the phrase breath the horizon's wheels follow.
const homes=Object.freeze(Array.from({length:27},(_,i)=>[Math.floor(i/9)-1,Math.floor(i/3)%3-1,i%3-1])
  .filter(p=>p.some(Boolean)).map(p=>Object.freeze(p)));
const address=midi=>{
  const tier=clamp(Math.floor((midi-38)/20)-1,-1,1),ring=[[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1]],pc=midi%12,
    [x,z]=pc===8&&tier!==0?[0,0]:ring[pc%8];
  return homes.findIndex(p=>p[0]===x&&p[1]===tier&&p[2]===z);
};
const approach=(value,target,tau,rate=Infinity)=>value+clamp((target-value)*(1-Math.exp(-STEP/tau)),-rate*STEP,rate*STEP);
function compile(notes){
  if(cache.has(notes))return cache.get(notes);
  const events=notes.map((n,index)=>({index,id:`recognized-note:${index}:${Number(n.midi)}:${Number(n.onset).toFixed(4)}`,
    midi:Number(n.midi),onset:Number(n.onset),duration:Number(n.duration),
    velocity:clamp(Number(n.velocity)>1?Number(n.velocity)/127:Number(n.velocity)||.65,0,1),confidence:clamp(n.confidence??.65,0,1)}))
    .filter(n=>Number.isFinite(n.midi)&&n.midi>=0&&n.midi<=127&&Number.isFinite(n.onset)&&n.onset>=0&&Number.isFinite(n.duration)&&n.duration>0)
    .map(n=>({...n,midi:Math.round(n.midi),site:address(Math.round(n.midi)),end:n.onset+n.duration})).sort((a,b)=>a.onset-b.onset||a.index-b.index);
  // The organism has no per-onset rigid turn, synthetic beat or wall clock.
  // Integrate only actual detected note mass. Local chambers have bounded
  // approach/release; one slow, activity-fed phrase breath drives the mantle.
  const stride=29,steps=Math.ceil((Math.max(0,...events.map(n=>n.end))+45)/STEP)+1,frames=new Float32Array(steps*stride),local=new Float64Array(26),mass=new Float64Array(26);
  let cursor=0,active=[],pressure=0,presence=0,phase=0;
  for(let s=1;s<steps;s++){
    const time=s*STEP;while(cursor<events.length&&events[cursor].onset<=time)active.push(events[cursor++]);
    active=active.filter(n=>n.end+1.8>time);mass.fill(0);let sum=0;
    for(const event of active){const weight=event.velocity*(.35+.65*event.confidence)*Math.exp(-Math.max(0,time-event.end)/.65);mass[event.site]+=weight;sum+=weight;}
    const target=1-Math.exp(-sum*.55);
    pressure=approach(pressure,target,target>pressure?2.6:7,.25);presence=approach(presence,target,target>presence?.65:4,.45);
    if(!active.length&&pressure<.00005&&presence<.00005){pressure=0;presence=0;}
    phase+=STEP*TAU*(1/12+(1/9-1/12)*target)*clamp(presence*1.7,0,1);
    for(let site=0;site<26;site++){
      const target=1-Math.exp(-mass[site]*1.5);local[site]=approach(local[site],target,target>local[site]?.42:1.8,.40);
      if(!mass[site]&&local[site]<.00005)local[site]=0;frames[s*stride+site]=local[site];
    }
    frames[s*stride+26]=pressure;frames[s*stride+27]=presence;frames[s*stride+28]=phase;
  }
  const value={events,frames,stride,steps,siteCounts:homes.map((_,site)=>events.filter(n=>n.site===site).length),invalid:notes.length-events.length};cache.set(notes,value);return value;
}
function upperBound(rows,value){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].onset<=value)lo=mid+1;else hi=mid;}return lo;}
function sample(score,time){
  // Interpolate only completed samples: a future recognized onset can never
  // leak backwards through interpolation. This adds at most one 50ms step.
  const position=Math.max(0,time/STEP),at=Math.min(score.steps-1,Math.floor(position)),before=Math.max(0,at-1),f=position-Math.floor(position);
  return Array.from({length:score.stride},(_,k)=>score.frames[before*score.stride+k]*(1-f)+score.frames[at*score.stride+k]*f);
}

/** The Ophanim horizon that replaced the retained semiangel. Recognized note
 * mass still supplies one slow phrase breath, which now brightens the torn
 * wheels; the hole itself follows the recording clock and the player's marked
 * mistakes, so it is present even before the note score has loaded. */
export function sourceRestNoteArchitecture({notes=[],currentTime=0,playedSeconds=0,duration=null,progress=0,reducedMotion=false,seat=SOURCE_REST_SEATS[0]}={}){
  const time=Math.max(0,Number(currentTime)||0),heard=Math.max(0,Number(playedSeconds)||0),p=clamp(progress,0,1),length=Number(duration)>0?Number(duration):undefined,
    passes=length?Math.max(0,Math.floor((heard-time+.35)/length)):0,unwrappedTime=time+passes*(length||0);
  if(!Array.isArray(notes)||!notes.length){
    const horizon=sourceRestHorizonFrame({time,unwrappedTime,duration:length,progress:p,breath:0,reducedMotion,seat});
    return{parts:[],lights:[],horizon,diagnostics:{recognized:0,represented:0,expectedPlayed:0,sounding:0,parts:0,invalid:0,completedPasses:passes,
      topology:'ophanim-horizon',horizon:horizon.diagnostics||null,phrasePressure:0,presence:0,phase:'rest'}};
  }
  const score=compile(notes),occurred=score.events.slice(0,upperBound(score.events,time)),history=passes?score.events:occurred,sounding=occurred.filter(n=>time<n.end),
    values=sample(score,time),phrasePressure=values[26],presence=values[27],breathPhase=values[28]+passes*score.frames[(score.steps-1)*score.stride+28],
    horizon=sourceRestHorizonFrame({time,unwrappedTime,duration:length,progress:p,breath:phrasePressure,reducedMotion,seat});
  return{parts:[],lights:[],horizon,diagnostics:{recognized:score.events.length,represented:history.length,expectedPlayed:history.length,sounding:sounding.length,
    activeNoteIds:sounding.map(n=>n.id),parts:0,invalid:score.invalid,completedPasses:passes,cycleExact:Number(duration)>0,
    topology:'ophanim-horizon',construction:'spinning-hole-with-three-torn-precessing-wheels',response:'phrase-breath-brightens-the-wheels',
    horizon:horizon.diagnostics||null,breathRateHz:[1/12,1/9],phrasePressure,presence,breathPhase,
    addedLights:0,phase:presence>.01?'breathing':'rest',scope:'Recognized note mass drives one slow phrase breath in the wheels; mistakes and passages come from the marked recording.'}};
}
