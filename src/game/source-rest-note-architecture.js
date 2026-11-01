import {SOURCE_REST_SEATS} from './source-rest-seat.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0)),cache=new WeakMap(),SPACING=2.25,STEP=.05,TAU=Math.PI*2;
const homes=Object.freeze(Array.from({length:27},(_,i)=>[Math.floor(i/9)-1,Math.floor(i/3)%3-1,i%3-1])
  .filter(p=>p.some(Boolean)).map(p=>Object.freeze(p))),unit=[1,0,0,0,1,0,0,0,1];
const rotate=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[r+3]*p[1]+m[r+6]*p[2]);
const product=(a,b)=>Array.from({length:9},(_,i)=>{const r=i%3,c=Math.floor(i/3);return a[r]*b[c*3]+a[r+3]*b[c*3+1]+a[r+6]*b[c*3+2];});
function rotation(axis,angle){const c=Math.cos(angle),s=Math.sin(angle);return axis===0?[1,0,0,0,c,s,0,-s,c]:axis===1?[c,0,s,0,1,0,-s,0,c]:[c,s,0,-s,c,0,0,0,1];}
const matrix=(orientation,position,scale=[1,1,1])=>[orientation[0]*scale[0],orientation[1]*scale[0],orientation[2]*scale[0],0,
  orientation[3]*scale[1],orientation[4]*scale[1],orientation[5]*scale[1],0,orientation[6]*scale[2],orientation[7]*scale[2],orientation[8]*scale[2],0,...position,1];
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

/** A retained cubic organism: localized chamber pressure, one slow phrase breath. */
export function sourceRestNoteArchitecture({notes=[],currentTime=0,playedSeconds=0,duration=null,progress=0,reducedMotion=false,seat=SOURCE_REST_SEATS[0]}={}){
  const empty={parts:[],lights:[],diagnostics:{recognized:0,represented:0,sounding:0,cells:0,parts:0,invalid:0}};
  if(!Array.isArray(notes)||!notes.length)return empty;
  const score=compile(notes),time=Math.max(0,Number(currentTime)||0),heard=Math.max(0,Number(playedSeconds)||0),p=clamp(progress,0,1),
    passes=Number(duration)>0?Math.max(0,Math.floor((heard-time+.35)/Number(duration))):0,
    occurred=score.events.slice(0,upperBound(score.events,time)),history=passes?score.events:occurred,sounding=occurred.filter(n=>time<n.end),
    values=sample(score,time),phrasePressure=values[26],presence=values[27],breathPhase=values[28]+passes*score.frames[(score.steps-1)*score.stride+28],
    breath=reducedMotion?0:Math.sin(breathPhase)*phrasePressure,pivot=[seat.x-21,seat.feet+7.55,seat.z-.80],parts=[],
    bySite=homes.map(()=>[]),occurredCounts=new Uint16Array(26);
  for(const event of history)bySite[event.site].push(event);
  for(const event of occurred)occurredCounts[event.site]++;
  if(p<.96)for(let i=0;i<homes.length;i++){
    const lattice=[...homes[i]],position=lattice.map((n,k)=>pivot[k]+n*SPACING),aperture=values[i],ids=bySite[i].map(n=>n.id),latest=bySite[i].at(-1),
      cubieId=homes[i].map(n=>n+1).join(''),eventCount=occurredCounts[i]+passes*score.siteCounts[i],
      metadata={cubieId,lattice,homeLattice:[...homes[i]],noteIds:ids,eventCount,midi:latest?.midi??null,onset:latest?.onset??null,noteDuration:latest?.duration??null,
        turnIndex:-1,turnAxis:null,turnSlice:null,turnAngle:0,turnProgress:0,cubePivot:[...pivot],clearance:0,phase:aperture>.01?'breathing':'rest',
        articulation:false,notePressure:aperture,aperture,irisDepth:.26*aperture,chamberExcursion:.25*aperture,phrasePressure,breathPhase};
    for(const component of['cell','chamber','watch']){
      const motion=reducedMotion?0:aperture,scale=component==='cell'?[1,1,1]:
        component==='chamber'?[.70+.25*motion,.65+.30*motion,.70+.25*motion]:[1-.26*motion,1-.26*motion,1-.26*motion],
        orientation=component==='chamber'&&!reducedMotion?rotation(2,.025*motion):unit;
      parts.push({id:`note-cube:${cubieId}:${component}`,mesh:`rest-note-cube-${component}`,x:position[0],y:position[1],z:position[2],
        sx:scale[0],sy:scale[1],sz:scale[2],yaw:0,kind:`note-cube-${component}`,...metadata,eyeCount:component==='watch'?6:0,matrix:matrix(orientation,position,scale)});
    }
  }
  if(p<.96)parts.push({id:'note-cube:core',mesh:'rest-note-cube-core',x:pivot[0],y:pivot[1],z:pivot[2],yaw:0,sx:1,sy:1,sz:1,
    kind:'note-cube-core',cubePivot:[...pivot],noteIds:history.map(n=>n.id),eventCount:occurred.length+passes*score.events.length,
    turnIndex:-1,phase:'breathing',phrasePressure,breathPhase,matrix:matrix(unit,pivot)});
  const wheelRadii=[6.05,6.65,7.25],wingElevations=[.28,.02,.04],lastNotes=occurred.slice(-12).map(n=>n.id);
  if(p<.96)for(let index=0;index<3;index++){
    const fixed=product(rotation(1,[-.34,.50,-.54][index]),rotation(2,[.22,-.28,.06][index])),
      tilt=product(fixed,rotation(index%2+1,breath*[.055,-.08,.10][index])),scale=wheelRadii[index]/6.05,
      extra={angelAssemblyId:'note-cube:angel',wheelId:index,cubePivot:[...pivot],noteIds:lastNotes,eventCount:history.length,
        turnIndex:-1,turnAxis:null,turnAngle:0,phrasePressure,breathPhase,breathTilt:breath*[.055,-.08,.10][index],phase:'breathing'};
    for(const component of['wheel','wheel-watch'])parts.push({id:`note-cube:wheel-${index}:${component}`,mesh:`rest-note-cube-${component}`,
      x:pivot[0],y:pivot[1],z:pivot[2],sx:scale,sy:scale,sz:scale,yaw:0,kind:`note-cube-${component}`,
      ...extra,eyeCount:component==='wheel-watch'?24:0,matrix:matrix(tilt,pivot,[scale,scale,scale])});
    for(const side of[-1,1]){
      const rootY=[2.2,.2,-2.2][index],rootZ=side*Math.sqrt(wheelRadii[index]**2-rootY**2),root=rotate(tilt,[0,rootY,rootZ]).map((n,k)=>pivot[k]+n),
        elevation=wingElevations[index]+breath*[.10,.14,-.06][index],c=Math.cos(elevation),s=Math.sin(elevation),featherSide=index===2?-1:1,
        local=[side*featherSide,0,0,0,c*featherSide,-side*s*featherSide,0,s,side*c],orientation=product(tilt,local),wingSpan=index===2?.88:1;
      parts.push({id:`note-cube:wing-${index}:${side}`,mesh:'rest-note-cube-wing',x:root[0],y:root[1],z:root[2],yaw:0,sx:1,sy:1,sz:wingSpan,
        kind:'note-cube-wing',...extra,wingSide:side,wingElevation:elevation,bearing:[...root],matrix:matrix(orientation,root,[1,1,wingSpan])});
    }
  }
  return{parts,lights:[],diagnostics:{recognized:score.events.length,represented:history.length,expectedPlayed:history.length,sounding:sounding.length,
    activeNoteIds:sounding.map(n=>n.id),cells:homes.length,parts:parts.length,invalid:score.invalid,completedPasses:passes,cycleExact:Number(duration)>0,
    topology:'persistent-3x3x3-interlocking-cube',cubies:homes.length,core:1,wheels:3,wings:6,eyes:228,
    construction:'retained-cubic-organism-with-ophanim-wheels-and-six-feathered-wings',response:'bounded-note-pressure-and-phrase-breath',
    completedTurns:0,turn:null,queued:0,stablePartIds:true,maxApertureRate:.40,breathRateHz:[1/12,1/9],phrasePressure,presence,breathPhase,breath,
    addedLights:0,phase:presence>.01?'breathing':'rest',scope:'Recognized note mass drives bounded local apertures and one slow phrase breath; no per-note turns or synthetic onsets.'}};
}
