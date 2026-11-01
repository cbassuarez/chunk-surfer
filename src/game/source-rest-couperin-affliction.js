// Source III has no performer-supplied mistake report. Its decline follows
// the agreed conversation, never invented wrong-note timestamps or SFX.
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
export function sourceRestCouperinAffliction({active=false,progress=0,currentTime=0,playedSeconds=0,duration=843.157125,reducedMotion=false}={}){
  const p=clamp(progress),time=Math.max(0,Number(currentTime)||0),length=Math.max(1,Number(duration)||843.157125),
    loss=active?smooth(.55,.91,p):0,strain=active?smooth(.37,.88,p):0;
  return{active:!!active,time,playedSeconds:Math.max(0,Number(playedSeconds)||0),unwrappedTime:time,duration:length,progress:p,reducedMotion:!!reducedMotion,ended:time>=length,
    pain:0,painAge:null,painSeverity:0,latestMistake:null,mistakeIds:[],mistakeCount:0,
    strain,passage:null,passageIds:[],destruction:active?smooth(.43,.91,p):0,facultyLoss:loss,
    motorGain:active?1-smooth(.56,.88,p):1,inputLost:!!active&&p>=.88,pressure:strain*.65,completedCycles:0,
    phase:!active?'inactive':p<.37?'listening':p<.56?'branching':p<.88?'revoicing':'letting-go',
    mistakeSource:'none: no Couperin performance report',syntheticMistakeAudio:false};
}
