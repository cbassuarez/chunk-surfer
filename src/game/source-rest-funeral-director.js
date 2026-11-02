// One small funeral company, not an accompaniment generator. These intervals
// are authored dramatic pauses, never inferred beats or musical note events.
// CCCBR explicitly treats commemorative ringing as local custom, not a code:
// https://archive.cccbr.org.uk/commemorative-ringing/
// The alternating contact colour borrows the physical one-sided muffle:
// https://www.westminster-abbey.org/history/explore-our-history/abbey-bells
// No strike count identifies the deceased, their age, sex or moral outcome.
import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {SOURCE_CONTINUATION} from '../data/source-continuation.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const unit=value=>Math.max(0,Math.min(1,finite(value)));
const frozen=Object.freeze;
const EPS=1e-7;
const PHASES=frozen(['wrong-return','catch']);
const bank=frozen([
  frozen({id:'rest-bell-left',sample:'04',note:'D4',frequency:293.6647679174076,audioUrl:'audio/source-rest/bells/rest-bell-d4.wav',audioSeconds:20,scale:1.15}),
  frozen({id:'rest-bell-right',sample:'06',note:'A3',frequency:220,audioUrl:'audio/source-rest/bells/rest-bell-a3.wav',audioSeconds:20,scale:1.30}),
  frozen({id:'rest-bell-far',sample:'08',note:'D3',frequency:146.8323839587038,audioUrl:'audio/source-rest/bells/rest-bell-d3.wav',audioSeconds:20,scale:1.75}),
]);
const first=SOURCE_REST_SEATS[0],third=SOURCE_REST_SEATS[1];
const centre=SOURCE_CONTINUATION.catch.center;
const counterarcPoint=(radius,angle,scale)=>frozen({x:centre.x+Math.cos(angle)*radius,
  y:third.feet+4.17*scale+.01,z:centre.z+Math.sin(angle)*radius});
const positions=frozen({
  'wrong-return':frozen([
    frozen({x:first.x-11,y:first.feet+4.8,z:first.z-4.4}),
    frozen({x:first.x-12.2,y:first.feet+5.2,z:first.z+4.4}),
    frozen({x:first.x-22,y:first.feet+8.6,z:first.z+.25}),
  ]),
  // The complete feet belong to the earned level-two counterarc. Keep the
  // r7.5 walking arc between the inner pair and the largest outer frame, with
  // separate clapper sightlines through the real case.
  catch:frozen([counterarcPoint(3,3.85,bank[0].scale),counterarcPoint(5.4,2.97,bank[1].scale),counterarcPoint(10.2,2.81,bank[2].scale)]),
});
export const SOURCE_REST_FUNERAL_BELLS=frozen(Object.fromEntries(PHASES.map(phase=>[phase,frozen(bank.map((bell,index)=>{
  const position=positions[phase][index],yaw=phase==='catch'?Math.atan2(position.x-centre.x,-(position.z-centre.z)):0;
  return frozen({...bell,phase,chartId:0,position,yaw});
}))])));

// The same individuals take duty in different orders. II leaves a place for
// an answer before passing it on; III occasionally answers the next caller
// instead. This is an authored interpretation, not a claim about UK practice.
// Each bell's own open/muffled alternation remains independent of that order.
const duty=frozen({
  'wrong-return':frozen([
    [11.4,2],[39.8,0],[72.1,1],[106.9,2],[143.2,1],[177.7,0],
    [214.1,2],[248.8,0],[285.4,1],[321.9,2],[360.2,0],[397.6,1],
    [435.8,2],[472.4,1],[511.1,0],[551.7,2],[594.3,0],[635.8,1],[680.2,2],
  ].map(frozen)),
  catch:frozen([
    [14.2,1],[45.9,0],[79.6,2],[116.8,0],[152.1,2],[188.4,1],
    [225.2,0],[263.6,1],[302.3,2],[341.8,1],[381.1,0],[421.7,2],
    [463.9,0],[506.2,1],[550.8,2],[596.1,1],[642.9,0],[691.4,2],
    [740.7,0],[790.1,2],[827.3,1],
  ].map(frozen)),
});
export const SOURCE_REST_FUNERAL_RULES=frozen({
  maxClockStep:.5,preparationSeconds:1.15,poseSeconds:9.5,maxContactHistory:3,quietProgress:.95,
  duckGain:10**(-3/20),duckAttackSeconds:.08,duckRecoverySeconds:2.8,
  palette:'Same fixed D/A bells in both places; not key-neutral and never a transposition of the performance.',
  sourceIIIAnchors:'Right-cheek anchors checked against production geometry and existing support; native review required.',
});

export function sourceRestFuneralPlan(phase='wrong-return'){
  if(!PHASES.includes(phase))return null;
  const bells=SOURCE_REST_FUNERAL_BELLS[phase],counts=[0,0,0];
  return frozen(duty[phase].map(([at,index],order)=>{
    const bell=bells[index],stroke=(counts[index]+++(phase==='catch'?1:0))%2?'muffled':'open';
    return frozen({id:`rest-funeral:${phase}:${order}`,at,bellId:bell.id,sample:bell.sample,
      note:bell.note,frequency:bell.frequency,position:bell.position,chartId:bell.chartId,
      energy:(index===2?.90:.82)*(stroke==='muffled'?.76:1),stroke,
      muffle:stroke==='muffled'?(phase==='catch'?.68:.54):0,
      responseTo:order?`rest-funeral:${phase}:${order-1}`:null,order});
  }));
}

const pose=(age,energy=1,stroke='open')=>{
  const pre=SOURCE_REST_FUNERAL_RULES.preparationSeconds;
  if(age< -pre||age>SOURCE_REST_FUNERAL_RULES.poseSeconds)return{angle:0,clapperAngle:0,impact:0,preparing:false};
  const amplitude=.42*(.8+.2*unit(energy)),direction=stroke==='muffled'?-1:1;
  if(age<0){const turn=Math.sin(unit((age+pre)/pre)*Math.PI/2);return{angle:-amplitude*turn*direction,clapperAngle:.23*turn*direction,impact:0,preparing:true};}
  const decay=Math.exp(-age/2.65);
  return{angle:-amplitude*Math.cos(age*1.92)*decay*direction,clapperAngle:.23*Math.cos(age*2.04)*decay*direction,
    impact:Math.exp(-age/.11),preparing:false};
};

/** Pure, bounded state owner. It neither allocates audio nor writes saves.
 * mediaTime owns which duty is due; audioTime owns the physical swing after
 * contact. A walking time-stretch therefore cannot slow a struck bell.
 * `cycle` is explicit: a backwards seek is not permission to replay a funeral.
 * `active` gates new contacts only; `hold` is an actual lifecycle/audio hold.
 */
export function createSourceRestFuneralDirector({maxClockStep=SOURCE_REST_FUNERAL_RULES.maxClockStep}={}){
  let phase=null,cycle=0,lastMedia=null,lastAudio=null,plan=null,seen=new Set(),contacts=[],total=0,skipped=0;
  const reset=(nextPhase=null,nextCycle=0)=>{phase=nextPhase;cycle=nextCycle;lastMedia=lastAudio=null;plan=sourceRestFuneralPlan(phase);seen=new Set();contacts=[];total=skipped=0;};
  function update(input={}){
    const nextPhase=PHASES.includes(input.phase)?input.phase:null,nextCycle=Math.max(0,Math.floor(finite(input.cycle))),
      mediaTime=Math.max(0,finite(input.mediaTime??input.clock)),audioTime=Math.max(0,input.audioTime==null?mediaTime:finite(input.audioTime,mediaTime)),
      playbackRate=Math.max(.05,Math.min(4,finite(input.playbackRate,1))),hold=!!input.hold,newContacts=[],
      active=input.active!==false&&!!nextPhase&&unit(input.progress)<SOURCE_REST_FUNERAL_RULES.quietProgress;
    if(nextPhase!==phase||nextCycle!==cycle)reset(nextPhase,nextCycle);
    const delta=lastMedia===null?0:mediaTime-lastMedia,audioDelta=lastAudio===null?0:audioTime-lastAudio,
      discontinuity=lastMedia!==null&&(delta< -EPS||delta>Math.max(.01,finite(maxClockStep,.5))||audioDelta< -EPS);
    if(discontinuity)skipped++;
    if(hold){
      contacts=[];lastMedia=mediaTime;lastAudio=audioTime;
      for(const event of plan||[])if(event.at<=mediaTime+EPS)seen.add(cycle?`${event.id}:cycle:${cycle}`:event.id);
    }
    else if(active){
      // A first sample, seek or stall only admits a contact exactly at that
      // sample. Previous missed duties are not a deferred volley.
      const from=lastMedia===null||discontinuity?mediaTime-EPS:lastMedia-EPS;
      for(const event of plan||[]){
        const id=cycle?`${event.id}:cycle:${cycle}`:event.id;
        if(event.at<from||discontinuity){if(event.at<=mediaTime+EPS)seen.add(id);continue;}
        if(event.at>mediaTime+EPS||seen.has(id))continue;
        seen.add(id);total++;
        const lateness=Math.max(0,(mediaTime-event.at)/playbackRate),audioAt=Math.max(0,audioTime-Math.min(.5,lateness));
        const contact=frozen({...event,id,cycle,audioAt,observedAudioAt:audioTime,playbackRate,
          responseTo:cycle&&event.responseTo?`${event.responseTo}:cycle:${cycle}`:event.responseTo});
        contacts.push(contact);newContacts.push(contact);
      }
      lastMedia=mediaTime;lastAudio=audioTime;
    }else{lastMedia=lastAudio=null;}
    contacts=contacts.filter(event=>audioTime-event.audioAt<=SOURCE_REST_FUNERAL_RULES.poseSeconds).slice(-SOURCE_REST_FUNERAL_RULES.maxContactHistory);
    const due=newContacts,next=active&&!hold?(plan||[]).find(event=>event.at>=mediaTime&&!seen.has(cycle?`${event.id}:cycle:${cycle}`:event.id)):null;
    const bells=(SOURCE_REST_FUNERAL_BELLS[phase]||[]).map(bell=>{
      const latest=[...contacts].reverse().find(event=>event.bellId===bell.id),age=latest?audioTime-latest.audioAt:Infinity,
        preparation=next?.bellId===bell.id?(mediaTime-next.at)/playbackRate:-Infinity,
        movement=hold?pose(Infinity):preparation>=-SOURCE_REST_FUNERAL_RULES.preparationSeconds&&preparation<0?pose(preparation,next.energy,next.stroke):pose(age,latest?.energy,latest?.stroke);
      return{...bell,...movement,lastStrikeId:latest?.id||null,stroke:latest?.stroke||null,muffle:latest?.muffle||0};
    });
    const lastContact=contacts.at(-1),age=lastContact?Math.max(0,audioTime-lastContact.audioAt):Infinity,
      recovery=lastContact?unit(age/SOURCE_REST_FUNERAL_RULES.duckRecoverySeconds):1,
      duck=hold?1:SOURCE_REST_FUNERAL_RULES.duckGain+(1-SOURCE_REST_FUNERAL_RULES.duckGain)*recovery;
    return{phase,cycle,clock:mediaTime,audioTime,active,held:hold,bells,bellEvents:due,contacts:due,
      musicDuck:{gain:duck,attackSeconds:SOURCE_REST_FUNERAL_RULES.duckAttackSeconds,recoverySeconds:SOURCE_REST_FUNERAL_RULES.duckRecoverySeconds},
      diagnostics:{totalContacts:total,seen:seen.size,livePoses:contacts.length,skippedDiscontinuities:skipped,
        pendingAt:next?.at??null,clockSource:input.audioTime==null?'media-fallback':'audio-context',nextResponseTo:next?.responseTo??null}};
  }
  return frozen({update,reset});
}
