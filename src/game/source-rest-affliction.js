import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';

const number=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,number(value)));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mistakes=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake').map(row=>Object.freeze({...row})).sort((a,b)=>a.start-b.start);
const passages=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='grueling').map((row,index)=>Object.freeze({...row,index})).sort((a,b)=>a.start-b.start);

export const SOURCE_REST_AFFLICTION=Object.freeze({
  attackSeconds:.014,
  mistakeSeconds:.90,
  strainRiseSeconds:6,
  recoverySeconds:3.5,
  motorDeclineStart:.56,
  motorLossAt:.88,
});
export const SOURCE_REST_MISTAKE_STRUCTURE=Object.freeze({carriers:3,sections:8,chipSeconds:1.35,contactSeconds:.36,maximumComposureCost:2});
// These are the performer's exact annotations. One finite set of existing
// wooden members receives the mistakes; dense clusters do not spawn a field
// of unbounded particles or secretly author mistakes in the Couperin.
export function sourceRestMistakeStructure(cue={}){
  const time=Math.max(0,number(cue.time)),cycle=Math.max(0,Math.floor(number(cue.completedCycles))),length=Math.max(1,number(cue.duration,SOURCE_REST_PERFORMANCE.duration)),
    posts=Array.from({length:SOURCE_REST_MISTAKE_STRUCTURE.carriers},(_,index)=>({index,hits:0,wear:0,failures:[]})),events=[];
  if(!cue.active||cue.mistakeSource==='none: no Couperin performance report')return{posts,events};
  // A prior complete cycle has already exposed every finite failure. Account
  // repeated listening arithmetically, never by replaying an unbounded log.
  const rounds=cycle>0?[0,cycle]:[0];
  for(const round of rounds)for(let index=0;index<mistakes.length;index++){
    const row=mistakes[index];if(round===cycle&&row.start>time)break;
    const absoluteTime=round*length+row.start,age=time+cycle*length-absoluteTime,targetIndex=index%posts.length,post=posts[targetIndex],previous=Math.min(7,Math.floor(post.wear/2));
    post.hits++;post.wear+=Math.max(1,Math.min(2,row.severity));
    const stage=Math.min(7,Math.floor(post.wear/2)),event={id:`${round}:${row.id}`,annotationId:row.id,index,targetIndex,severity:row.severity,
      at:absoluteTime,age,stage,failedSection:stage>previous?SOURCE_REST_MISTAKE_STRUCTURE.sections-stage:null};
    if(event.failedSection!==null)post.failures.push({section:event.failedSection,at:absoluteTime,eventId:event.id});
    if(age>=0&&age<SOURCE_REST_MISTAKE_STRUCTURE.chipSeconds)events.push(event);
  }
  if(cycle>1)for(let index=0;index<mistakes.length;index++){
    const row=mistakes[index],post=posts[index%posts.length];post.hits+=cycle-1;post.wear+=(cycle-1)*Math.max(1,Math.min(2,row.severity));
  }
  return{posts,events:events.slice(-8)};
}

// Independent accounting: a timestamp or an offscreen fragment cannot spend
// composure. The caller supplies the rendered body's actual visible contact
// and commits the returned cost through the existing recorder/save owner.
export function sourceRestMistakeImpactReceipt(state={},input={}){
  const previous={spent:clamp(number(state.spent),0,SOURCE_REST_MISTAKE_STRUCTURE.maximumComposureCost),ids:Array.isArray(state.ids)?state.ids.slice(-16):[]},
    impact=input.impact,composure=number(input.composure),floor=number(input.floor),cost=Math.min(1,Math.max(0,composure-floor),SOURCE_REST_MISTAKE_STRUCTURE.maximumComposureCost-previous.spent);
  if(!impact?.id||!impact.contact||!input.rendered||!input.visible||!input.embodied||!input.settled||input.canLeave!==false||input.held||input.protected
    ||input.reducedDread||input.effectsMode==='off'||number(input.progress)>=.96||previous.ids.includes(impact.id)||cost<=0)return{state:previous,event:null};
  return{state:{spent:previous.spent+cost,ids:[...previous.ids,impact.id].slice(-16)},event:{id:impact.id,annotationId:impact.annotationId,
    sourceClock:impact.sourceClock,phase:input.phase||'wrong-return',recommendedComposureCost:1,cost,
    before:composure,after:Math.max(floor,composure-cost),lastingInjury:false,kind:'source-rest-material-contact'}};
}
const severityScale=severity=>[0,.68,1,1.2][Math.max(1,Math.min(3,Math.round(number(severity,2))))];
const passageBudget=index=>index===0?.28:index===1?.34:.64;
const mistakeWear=severity=>.0008*Math.max(1,Math.min(3,number(severity,2)));

/** The performed recording supplies the clock; the player's marked moments
 * supply the hurt. This function schedules no sound, writes no health/save
 * state and knows nothing about input focus. Identical clocks yield identical
 * geometry/perception cues, including while the native application is held.
 * Motor failure follows the authored conversation so a late arrival cannot
 * silently lose the opportunity to leave merely because the music is late. */
export function sourceRestAfflictionFrame({currentTime=0,playedSeconds=0,duration=SOURCE_REST_PERFORMANCE.duration,
  active=false,progress=0,reducedMotion=false}={}){
  const length=Math.max(.001,number(duration,SOURCE_REST_PERFORMANCE.duration)),time=clamp(number(currentTime),0,length),p=clamp(progress),
    heard=Math.max(0,number(playedSeconds)),completedCycles=Math.max(0,Math.floor((heard-time+.35)/length)),ended=time>=length;
  const empty={active:!!active,time,playedSeconds:heard,unwrappedTime:time,duration:length,progress:p,reducedMotion:!!reducedMotion,ended,
    pain:0,painAge:null,painSeverity:0,latestMistake:null,mistakeIds:[],mistakeCount:0,
    strain:0,passage:null,passageIds:[],destruction:0,facultyLoss:0,motorGain:1,inputLost:false,
    pressure:0,completedCycles:0,phase:'inactive'};
  if(!active)return empty;

  let painAbsence=1,latestMistake=null,mistakeCount=completedCycles*mistakes.length,
    wear=completedCycles*mistakes.reduce((sum,row)=>sum+mistakeWear(row.severity),0),destruction=0,strain=0,passage=null;
  const mistakeIds=[],passageIds=[];
  for(const row of mistakes){
    if(time<row.start)break;
    const age=time-row.start;
    mistakeCount++;wear+=mistakeWear(row.severity);
    latestMistake={id:row.id,time:row.start,severity:row.severity,age};
    if(time>=row.start+SOURCE_REST_AFFLICTION.mistakeSeconds||ended)continue;
    const peak=[0,.38,.66,.91][row.severity],attack=.16+.84*smooth(age/SOURCE_REST_AFFLICTION.attackSeconds),
      contactAge=age-SOURCE_REST_MISTAKE_STRUCTURE.contactSeconds,
      contact=row.severity>=2&&contactAge>=0?peak*.82*smooth(contactAge/SOURCE_REST_AFFLICTION.attackSeconds)*Math.exp(-contactAge/.105):0,
      envelope=Math.max(peak*attack*Math.exp(-age/(.115+.025*row.severity)),contact);
    painAbsence*=1-clamp(envelope);mistakeIds.push(row.id);
  }
  for(const row of passages){
    const end=row.endPolicy==='track-end'?length:Math.min(length,row.end),span=Math.max(.001,end-row.start),elapsed=time-row.start,
      amount=clamp(elapsed/span),budget=passageBudget(row.index)*severityScale(row.severity);
    destruction+=budget*(completedCycles+amount);
    if(elapsed<0)continue;
    const inside=time<end,level=Math.min(1,.78*severityScale(row.severity)),rise=smooth(elapsed/Math.min(SOURCE_REST_AFFLICTION.strainRiseSeconds,span*.2)),
      surge=.58+.42*amount;
    // The release belongs to the exertion, not its structural consequence:
    // the body can catch its breath while the broken courts remain broken.
    const tail=inside?1:Math.exp(-(time-end)/SOURCE_REST_AFFLICTION.recoverySeconds);
    if(!ended)strain=Math.max(strain,level*rise*surge*tail);
    if(inside){passageIds.push(row.id);passage={id:row.id,start:row.start,end:row.end,effectiveEnd:end,
      elapsed,progress:amount,severity:row.severity,terminal:row.endPolicy==='track-end'};}
  }
  destruction=clamp(destruction+wear);
  const pain=clamp(1-painAbsence),motorLoss=smooth((p-SOURCE_REST_AFFLICTION.motorDeclineStart)
    /(SOURCE_REST_AFFLICTION.motorLossAt-SOURCE_REST_AFFLICTION.motorDeclineStart)),
    inputLost=p>=SOURCE_REST_AFFLICTION.motorLossAt,
    motorGain=inputLost?0:Math.max(.025,clamp((1-motorLoss)*(p>SOURCE_REST_AFFLICTION.motorDeclineStart?1-.12*strain:1))),
    facultyLoss=clamp(Math.max(motorLoss,pain*.17+strain*.25+destruction*.48)),
    pressure=ended?0:clamp(strain*.55+pain*.30+destruction*.30);
  return{...empty,pain,painAge:latestMistake?.age??null,painSeverity:latestMistake?.severity??0,latestMistake,mistakeIds,mistakeCount,
    strain,passage,passageIds,destruction,facultyLoss,motorGain,inputLost,pressure,completedCycles,unwrappedTime:time+completedCycles*length,
    phase:ended?'spent':p>=.96?'black-ordeal':inputLost?'unresponsive':passage?'grueling':pain>.001?'hurt':destruction>0?'aftershock':'listening'};
}
