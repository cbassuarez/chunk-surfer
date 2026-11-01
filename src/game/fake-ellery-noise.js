// A session-only detector for genuine operator noise during the two borrowed
// Ellery encounters. The host owns microphone consent, echo measurement and
// the armed encounter window. This module never opens an input or plays audio.
// These authored RMS thresholds adapt to the observed room floor; they are
// deliberately explicit and do not claim to cancel device or OS input gain.
export const FAKE_ELLERY_NOISE_DEFAULTS=Object.freeze({
  minimumRms:.08,
  baselineMargin:.035,
  baselineRatio:3,
  baselineSeconds:.6,
  baselineRiseSeconds:2.5,
  baselineFallSeconds:.8,
  attackSeconds:.055,
  minimumAttackSamples:2,
  quietSeconds:.16,
  releaseRatio:.6,
  maximumSampleSeconds:.05,
});

const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const bounded=(value,fallback,min,max)=>Math.max(min,Math.min(max,finite(value,fallback)));

export function createFakeElleryNoiseDetector(options={}){
  const D=FAKE_ELLERY_NOISE_DEFAULTS;
  const config=Object.freeze({
    minimumRms:bounded(options.minimumRms,D.minimumRms,.001,1),
    baselineMargin:bounded(options.baselineMargin,D.baselineMargin,0,1),
    baselineRatio:bounded(options.baselineRatio,D.baselineRatio,1,20),
    baselineSeconds:bounded(options.baselineSeconds,D.baselineSeconds,.1,30),
    baselineRiseSeconds:bounded(options.baselineRiseSeconds,D.baselineRiseSeconds,.1,30),
    baselineFallSeconds:bounded(options.baselineFallSeconds,D.baselineFallSeconds,.1,30),
    attackSeconds:bounded(options.attackSeconds,D.attackSeconds,.02,2),
    minimumAttackSamples:Math.round(bounded(options.minimumAttackSamples,D.minimumAttackSamples,2,30)),
    quietSeconds:bounded(options.quietSeconds,D.quietSeconds,.05,3),
    releaseRatio:bounded(options.releaseRatio,D.releaseRatio,.1,.95),
    maximumSampleSeconds:bounded(options.maximumSampleSeconds,D.maximumSampleSeconds,.005,.1),
  });
  let baseline=0,baselineTime=0,hasBaseline=false,attackTime=0,attackSamples=0,
    quietTime=0,needsQuiet=true,latched=false,wasArmed=false;
  const threshold=()=>Math.max(config.minimumRms,baseline+config.baselineMargin,baseline*config.baselineRatio);
  const clearAttack=()=>{attackTime=0;attackSamples=0;};
  function hold(){clearAttack();quietTime=0;needsQuiet=true;wasArmed=false;return false;}
  function reset(){
    baseline=0;baselineTime=0;hasBaseline=false;clearAttack();quietTime=0;
    needsQuiet=true;latched=false;wasArmed=false;
  }
  function sample(input={}){
    const dt=bounded(input.dt,0,0,config.maximumSampleSeconds),armed=input.armed===true;
    if(input.active!==true||input.protected===true||input.paused===true||input.hidden===true
      ||input.focused===false||input.suspended===true||input.recording===true||input.listening===true
      ||input.playback===true||input.slating===true||input.stalled===true
      ||input.micActive!==true||input.micMaySpoil!==true)return hold();
    // A lifecycle hold above discards pending evidence even on a zero-time
    // focus event. Repeated zero-time observations cannot build a reaction.
    if(dt<=0)return false;
    const measurement=input.measurement;
    if(!measurement||typeof measurement.rms!=='number'||!Number.isFinite(measurement.rms)
      ||measurement.rms<0||measurement.rms>1)return hold();
    // Program-correlated input supplies neither a room baseline nor evidence
    // against the player. Keep prior quiet readiness so a genuine reaction
    // immediately after the familiar boo can still be heard.
    if(measurement.gameEchoLikely!==false||measurement.programCorrelated===true
      ||measurement.mask?.programCorrelated===true){clearAttack();return false;}
    const rms=measurement.rms;
    if(armed!==wasArmed)clearAttack();
    wasArmed=armed;
    if(!armed){
      if(!hasBaseline){baseline=rms;hasBaseline=true;}
      else{
        const seconds=rms>baseline?config.baselineRiseSeconds:config.baselineFallSeconds;
        baseline+=(rms-baseline)*(1-Math.exp(-dt/seconds));
      }
      baselineTime=Math.min(config.baselineSeconds,baselineTime+dt);
    }
    const limit=threshold();
    if(rms<=limit*config.releaseRatio){
      clearAttack();quietTime=Math.min(config.quietSeconds,quietTime+dt);
      if(quietTime>=config.quietSeconds-1e-8){needsQuiet=false;latched=false;}
      return false;
    }
    quietTime=0;
    if(!armed||!hasBaseline||baselineTime<config.baselineSeconds-1e-8||needsQuiet||latched
      ||rms<limit||measurement.playerNoiseLikely!==true){clearAttack();return false;}
    attackTime+=dt;attackSamples++;
    if(attackTime<config.attackSeconds-1e-8||attackSamples<config.minimumAttackSamples)return false;
    clearAttack();latched=true;return true;
  }
  function snapshot(){return{baseline,baselineSeconds:baselineTime,ready:hasBaseline&&baselineTime>=config.baselineSeconds-1e-8,
    threshold:threshold(),attackSeconds:attackTime,attackSamples,quietSeconds:quietTime,needsQuiet,latched,config:{...config}};}
  return{sample,reset,snapshot};
}
