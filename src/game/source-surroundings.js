import {SOURCE_SURROUNDINGS as C,SOURCE_SURROUNDINGS_FALL_BODIES as FALL,SOURCE_SURROUNDINGS_CENTRE_ARCS as ARCS} from '../data/source-surroundings.js';
import {standingTearMemoryPhase,standingTearMemoryPulse,standingTearRepertoireById} from '../data/standing-tear-memory-score.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const timeOf=state=>Math.max(0,finite(state?.elapsed));
const mod=(value,period)=>((value%period)+period)%period;
const vector=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b,scale=1)=>vector(a.x+b.x*scale,a.y+b.y*scale,a.z+b.z*scale);
const difference=(a,b)=>vector(a.x-b.x,a.y-b.y,a.z-b.z);
const ZERO=Object.freeze(vector());
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const loadTaps=Object.freeze([[0,.22],[.12,.22],[.28,.20],[.48,.17],[.72,.12],[1,.07]]);

// Actual recording RMS, smoothed across one second. No independent visual beat
// oscillator or mutable simulation clock can slip away from the heard source.
export function sourceSurroundingsScore(world,seconds=0){
  const definition=C.music[world==='centre'?'centre':'fall'],time=Math.max(0,finite(seconds));
  const load=loadTaps.reduce((sum,[delay,weight])=>sum+standingTearMemoryPulse(definition.pieceId,time-delay)*weight,0);
  return{pieceId:definition.pieceId,seconds:time,phase:standingTearMemoryPhase(definition.pieceId,time),pulse:standingTearMemoryPulse(definition.pieceId,time),load,position:{...definition.position}};
}
export function sourceSurroundingsRotate(point,rotation=ZERO){
  const cx=Math.cos(rotation.x),sx=Math.sin(rotation.x),cy=Math.cos(rotation.y),sy=Math.sin(rotation.y),cz=Math.cos(rotation.z),sz=Math.sin(rotation.z);
  const x=point.x,y=point.y*cx-point.z*sx,z=point.y*sx+point.z*cx,xx=x*cy+z*sy,zz=-x*sy+z*cy;
  return vector(xx*cz-y*sz,xx*sz+y*cz,zz);
}
// Strongest sustained pressure in each recording division. These fixed event
// phases are derived from the same captured recording envelope as the audio.
function pressurePeaks(world,count){
  const duration=standingTearRepertoireById(C.music[world].pieceId).duration,peaks=[];
  for(let part=0;part<count;part++){
    let best={time:duration*(part+.5)/count,load:-1};
    for(let t=duration*part/count+.8;t<duration*(part+1)/count-.4;t+=.05){const load=sourceSurroundingsScore(world,t).load;if(load>best.load)best={time:t,load};}
    peaks.push(Object.freeze({time:Math.round(best.time*1000)/1000,load:best.load}));
  }
  return Object.freeze(peaks);
}
export const SOURCE_SURROUNDINGS_PRESSURE_PEAKS=Object.freeze({fall:pressurePeaks('fall',3),centre:pressurePeaks('centre',1)});
function waveDuration(world){return world==='fall'?C.waveMaximumRadius/C.waveSpeed:Math.PI*2*(85/C.centreWaveSpeed)+2;}
function emissionEvents(world,time,tail=0){
  const piece=C.music[world].pieceId,period=standingTearRepertoireById(piece).duration,peaks=SOURCE_SURROUNDINGS_PRESSURE_PEAKS[world],events=[];
  const duration=waveDuration(world)+tail,first=Math.floor((time-duration)/period),last=Math.floor(time/period);
  for(let cycle=first;cycle<=last;cycle++)for(let index=0;index<peaks.length;index++){
    const start=cycle*period+peaks[index].time,age=time-start;
    if(start<0||age<0||age>duration)continue;
    events.push({id:world+'-pressure-'+cycle+'-'+index,time:start,age,strength:.60+.40*peaks[index].load,world,phaseIndex:mod(cycle,2)*peaks.length+index,
      origin:{...C.music[world].position},sourceId:world==='fall'?C.fallAssembly.id:'centre-pressure-source'});
  }
  return events;
}
const responseAt=(age,strength)=>age<0||age>4.8?0:strength*(age<C.loadSeconds?smooth(age/C.loadSeconds):1-smooth((age-C.loadSeconds)/3.4));
function arrivalAge(world,wave,definition){
  if(world==='fall')return wave.age-distance(wave.origin,definition.position)/C.waveSpeed;
  const middle=(definition.startAngle+definition.endAngle)/2;
  return wave.age-mod(middle-ARCS[0].startAngle,Math.PI*2)*definition.radius/C.centreWaveSpeed;
}
function responseFor(world,events,definition,index=0){
  return Math.max(0,...events.map(wave=>{
    const delay=world==='fall'?FALL_ARRIVAL_SCHEDULE[wave.phaseIndex]?.[index]:null;
    const age=world==='fall'?(delay==null?-1:wave.age-delay):arrivalAge(world,wave,definition);
    return responseAt(age,wave.strength);
  }));
}
function loadedPose(definition,load){return{position:add(definition.position,vector(0,.9,.45),load),rotation:add(definition.rotation,vector(.012,-.009,.018),load)};}
function bodyTiming(definition,index,time){
  const peak=SOURCE_SURROUNDINGS_PRESSURE_PEAKS.fall[index%3],emission=peak.time+(index>=3?48:0),travel=distance(C.music.fall.position,definition.position)/C.waveSpeed;
  const releaseInCycle=emission+travel+C.loadSeconds,offset=C.releaseLocal-releaseInCycle;
  const local=mod(time+offset,C.cycleSeconds),cycle=Math.floor((time+offset)/C.cycleSeconds),releaseAt=cycle*C.cycleSeconds+releaseInCycle;
  return{local,cycle,releaseAt,emissionAt:releaseAt-travel-C.loadSeconds,arrivalAt:releaseAt-C.loadSeconds,strength:.60+.40*peak.load};
}
function nominalBody(definition,index,time){
  const timing=bodyTiming(definition,index,time),age=timing.local-C.releaseLocal;
  if(age>=0)return{position:add(loadedPose(definition,timing.strength).position,vector(0,-6.5,-13.5),age),timing,released:true,velocity:vector(0,-6.5,-13.5)};
  if(timing.local<C.entrySeconds){
    const u=timing.local/C.entrySeconds,remaining=1-smooth(u);
    return{position:add(definition.position,vector(0,0,-C.entryDistance),remaining),timing,released:false,
      velocity:vector(0,0,C.entryDistance/C.entrySeconds*6*u*(1-u))};
  }
  return{position:{...definition.position},timing,released:false,velocity:vector()};
}
function movingArrival(emission,definition,index){
  const end=emission+C.waveMaximumRadius/C.waveSpeed,origin=C.music.fall.position;
  const front=t=>(t-emission)*C.waveSpeed-distance(origin,nominalBody(definition,index,t).position);
  if(front(end)<0)return null;
  let lo=emission,hi=end;
  for(let k=0;k<32;k++){const mid=(lo+hi)/2;if(front(mid)>=0)hi=mid;else lo=mid;}
  if(nominalBody(definition,index,hi).released)return null;
  return hi-emission;
}
// Motion and the recording repeat after96s, so exact moving-target arrivals
// need only30 finite front intersections. This bounded immutable schedule
// prevents per-frame root-finding or an ever-growing history/cache.
const FALL_ARRIVAL_SCHEDULE=Object.freeze(Array.from({length:6},(_,eventIndex)=>{
  const emission=SOURCE_SURROUNDINGS_PRESSURE_PEAKS.fall[eventIndex%3].time+(eventIndex>=3?48:0);
  return Object.freeze(FALL.map((definition,index)=>movingArrival(emission,definition,index)));
}));
function fallBody(definition,index,time,events,reducedMotion){
  const nominal=nominalBody(definition,index,time),timing=nominal.timing,age=timing.local-C.releaseLocal;
  const load=nominal.released?0:responseFor('fall',events,definition,index);
  const release=loadedPose(definition,timing.strength),held=loadedPose(definition,load);
  const position=nominal.released?nominal.position:add(nominal.position,difference(held.position,definition.position));
  const rotation=age>=0?add(release.rotation,definition.spin,age):held.rotation;
  const loading=age>=0?timing.strength*Math.exp(-age/2.4):load,deformation={x:1,y:1-loading*.06,z:1+loading*.025};
  return{id:definition.id,archetype:definition.archetype,position,rotation,size:vector(definition.size.x,deformation.y*definition.size.y,deformation.z*definition.size.z),
    velocity:reducedMotion?vector():nominal.velocity,
    angularVelocity:reducedMotion||age<0?vector():{...definition.spin},loading,waveResponse:load,
    deformation,opacity:1,released:age>=0,cycle:timing.cycle,
    releaseAt:timing.releaseAt,arrivalAt:timing.arrivalAt,emissionAt:timing.emissionAt,sourceId:C.fallAssembly.id};
}
function emittersAt(time){
  const load=sourceSurroundingsScore('fall',time).load,assembly=C.fallAssembly,sy=assembly.scale*(1-load*.018),anchor=assembly.anchor;
  return[
    {id:'fall-bell-0',archetype:'bell',mesh:'tower_bell_04',position:add(anchor,vector(0,-.44*sy,0)),rotation:vector(),size:vector(1.28*assembly.scale,1.16*sy,1.274*assembly.scale),loading:load},
    {id:'fall-clapper-0',archetype:'clapper',mesh:'tower_clapper_04',position:add(anchor,vector(0,-.67*sy,0)),rotation:vector(),size:vector(.26*assembly.scale,1.22*sy,.254*assembly.scale),loading:load},
  ].map(part=>({...part,assemblyId:assembly.id,role:'pressure-emitter',opacity:1}));
}
function centreArc(definition,time,events,reducedMotion){
  const load=responseFor('centre',events,definition),middle=(definition.startAngle+definition.endAngle)/2,separation=definition.opening*(1-load);
  const localOffset=vector(Math.cos(middle)*separation,Math.sin(middle)*separation,0),rotation=add(definition.rotation,vector(.009,-.012,.008),load);
  return{...definition,position:add(definition.position,sourceSurroundingsRotate(localOffset,definition.rotation)),rotation,loading:load,waveResponse:load,
    opacity:1,velocity:vector(),angularVelocity:vector(),reducedMotion:!!reducedMotion};
}
function waveFrames(world,events){return events.filter(event=>event.age<=waveDuration(world)).map(event=>world==='fall'
  ?{...event,kind:'radial-pressure',radius:event.age*C.waveSpeed,speed:C.waveSpeed,width:C.waveWidth,maxRadius:C.waveMaximumRadius,minimumX:75}
  :{...event,kind:'centre-pressure',origin:{x:-142,y:35,z:-12},radius:C.centreWaveRadius,angle:ARCS[0].startAngle+event.age*C.centreWaveSpeed/C.centreWaveRadius,
    angularSpeed:C.centreWaveSpeed/C.centreWaveRadius,speed:C.centreWaveSpeed,width:C.waveWidth,maxAngle:Math.PI*2,
    bands:[60,72,85].map(radius=>({radius,angle:ARCS[0].startAngle+event.age*C.centreWaveSpeed/radius}))});}
function pressureSounds(world,events,definitions,time){
  const result=[];
  for(const wave of events){
    if(wave.age<C.impactTailSeconds)result.push({id:wave.id+':release',kind:'pressure-release',world,time:wave.time,position:{...wave.origin},sourceId:wave.sourceId,targetId:null,strength:wave.strength});
    for(let index=0;index<definitions.length;index++){const definition=definitions[index],delay=world==='fall'?FALL_ARRIVAL_SCHEDULE[wave.phaseIndex]?.[index]:null;
      const age=world==='fall'?(delay==null?-1:wave.age-delay):arrivalAge(world,wave,definition);if(age<0||age>=C.impactTailSeconds)continue;
      const middle=(definition.startAngle+definition.endAngle)/2,radius=definition.radius+definition.opening;
      const position=world==='fall'?nominalBody(definition,index,time-age).position:add(definition.position,sourceSurroundingsRotate(vector(Math.cos(middle)*radius,Math.sin(middle)*radius,0),definition.rotation));
      result.push({id:wave.id+':arrival:'+definition.id,kind:'pressure-arrival',world,time:time-age,position,sourceId:wave.sourceId,targetId:definition.id,strength:wave.strength});}
  }
  return result;
}
function boxFor(body){
  const h=vector(body.size.x/2,body.size.y/2,body.size.z/2),x=sourceSurroundingsRotate(vector(1,0,0),body.rotation),y=sourceSurroundingsRotate(vector(0,1,0),body.rotation),z=sourceSurroundingsRotate(vector(0,0,1),body.rotation);
  const extent=vector(...['x','y','z'].map(axis=>Math.abs(x[axis])*h.x+Math.abs(y[axis])*h.y+Math.abs(z[axis])*h.z));return{min:add(body.position,extent,-1),max:add(body.position,extent)};
}
function arcBox(arc){
  const r=arc.radius+arc.width/2,x=sourceSurroundingsRotate(vector(1,0,0),arc.rotation),y=sourceSurroundingsRotate(vector(0,1,0),arc.rotation),z=sourceSurroundingsRotate(vector(0,0,1),arc.rotation);
  const extent=vector(...['x','y','z'].map(axis=>Math.hypot(x[axis],y[axis])*r+Math.abs(z[axis])*arc.depth/2));return{min:add(arc.position,extent,-1),max:add(arc.position,extent)};
}
function boundsFor(bodies,emitters,arcs){
  const items=[...bodies,...emitters].map(body=>({id:body.id,...boxFor(body)})).concat(arcs.map(arc=>({id:arc.id,...arcBox(arc)})));
  return{items,min:vector(...['x','y','z'].map(axis=>Math.min(...items.map(p=>p.min[axis])))),max:vector(...['x','y','z'].map(axis=>Math.max(...items.map(p=>p.max[axis]))))};
}
/** Pure, fixed remote construction. No gameplay/physics/input/Contact authority. */
export function sourceSurroundingsFrame(state={}, {reducedMotion=false}={}){
  const world=state?.phase==='catch'?'centre':'fall',time=timeOf(state),motionTime=reducedMotion?C.reducedMotionTime:time;
  const score=sourceSurroundingsScore(world,time),events=emissionEvents(world,motionTime,5),bodies=[],arcs=[],emitters=world==='fall'?emittersAt(motionTime):[];
  if(world==='fall')for(let index=0;index<FALL.length;index++)bodies.push(fallBody(FALL[index],index,motionTime,events,reducedMotion));
  else for(const definition of ARCS)arcs.push(centreArc(definition,motionTime,events,reducedMotion));
  const waves=reducedMotion?[]:waveFrames(world,events),impacts=reducedMotion?[]:pressureSounds(world,events,world==='fall'?FALL:ARCS,motionTime),bounds=boundsFor(bodies,emitters,arcs);
  return{world,time,motionTime,score,bodies,emitters,impactors:[],arcs,waves,impacts,bounds,diagnostics:{version:C.version,fixedWorld:true,physicsOwned:false,reducedMotion:!!reducedMotion,
    counts:{bodies:bodies.length,emitters:emitters.length,impactors:0,arcs:arcs.length,waves:waves.length,impacts:impacts.length},farClip:C.farClip,thresholdX:C.thresholdX}};
}
