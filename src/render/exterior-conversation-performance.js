// Dialogue owns these immutable tracks. Sampling never advances a line, plays
// audio or changes a prop: it only blends the actor's visible attention.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const smooth=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
const time=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const channel=(target,at=0,from=target,duration=0)=>Object.freeze({target,at,from,duration});
const sampleChannel=(value,at)=>{
  const p=(at-value.at)/Math.max(.000001,value.duration);
  return p<=0?value.from:p>=1?value.target:value.from+(value.target-value.from)*smooth(p);
};
export function createExteriorConversationPerformance(){
  return Object.freeze({version:1,active:false,speaking:false,phaseStartedAt:0,
    attention:channel(0),speech:channel(0),gaze:channel(0)});
}
export function transitionExteriorConversationPerformance(previous,{active,speaking,timeSec=0,headYaw}={}){
  const before=previous?.version===1?previous:createExteriorConversationPerformance(),now=time(timeSec);
  const nextActive=active===undefined?before.active:!!active,nextSpeaking=nextActive&&(speaking===undefined?before.speaking:!!speaking);
  const targetYaw=nextActive?clamp(headYaw===undefined?before.gaze.target:headYaw,-.38,.38):0;
  const update=(value,target,duration)=>value.target===target?value:channel(target,now,sampleChannel(value,now),duration);
  return Object.freeze({version:1,active:nextActive,speaking:nextSpeaking,
    phaseStartedAt:before.active!==nextActive||before.speaking!==nextSpeaking?now:before.phaseStartedAt,
    attention:update(before.attention,nextActive?1:0,nextActive?.42:.85),
    speech:update(before.speech,nextSpeaking?1:0,nextSpeaking?.18:.32),
    gaze:update(before.gaze,targetYaw,.35)});
}
export function sampleExteriorConversationPerformance(track,timeSec=0,{reducedMotion=false}={}){
  const value=track?.version===1?track:createExteriorConversationPerformance(),now=time(timeSec);
  if(reducedMotion)return{active:value.active,speaking:value.speaking,elapsedSec:0,
    weight:value.active?1:0,speakingWeight:0,headYaw:value.active?value.gaze.target:0};
  return{active:value.active,speaking:value.speaking,elapsedSec:Math.max(0,now-value.phaseStartedAt),
    weight:sampleChannel(value.attention,now),speakingWeight:sampleChannel(value.speech,now),headYaw:sampleChannel(value.gaze,now)};
}

export function exteriorPerformanceFrame(id,{timeSec=0,reducedMotion=false,conversation=null}={}){
  const elapsed=time(conversation?.elapsedSec),active=!!conversation?.active;
  const attention=clamp(Number.isFinite(conversation?.weight)?conversation.weight:conversation?(active?smooth(elapsed/.42):1-smooth(elapsed/.85)):0,0,1);
  const speech=clamp(Number.isFinite(conversation?.speakingWeight)?conversation.speakingWeight:conversation?.speaking?smooth(elapsed/.18):0,0,1);
  const talk=reducedMotion?0:attention*speech,clock=time(timeSec);
  let seed=0;for(const c of String(id))seed=(seed*31+c.charCodeAt(0))>>>0;
  const phase=(seed%997)/997*Math.PI*2,period=29+seed%19,duration=2.7+(seed%7)*.17;
  const at=(clock+seed%period)%period;
  const ambient=reducedMotion||clock<6||attention>0?0:smooth(at/(duration*.28))*(1-smooth((at-duration*.62)/(duration*.38)));
  const syllable=clamp(.42+.31*Math.sin(clock*8.7+phase)+.23*Math.sin(clock*13.3+phase*.71),0,1);
  // A chest expansion, never a root bounce. The subtraction preserves the
  // exact authored/build pose at time zero; each person has a slower rate.
  const respiration=reducedMotion?0:(Math.sin(clock*(1.01+(seed%11)*.023)+phase)-Math.sin(phase))*.5;
  return{state:attention<.0001?'idle':!active?'settle':speech>.08?'talk':'listen',attention,talk,
    headYaw:clamp(conversation?.headYaw,-.38,.38)*attention,
    nod:reducedMotion?0:Math.sin(clock*2.15+phase)*.018*talk,
    jaw:syllable*.052*talk,
    gesture:talk*(.42+.58*smooth(.5+.5*Math.sin(clock*1.63+phase))),ambient,
    phase,seed,respiration,settle:!active?attention:0};
}
